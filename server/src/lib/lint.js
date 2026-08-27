import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { generateBundleFiles } from './bundleGenerator.js';
import { generateSharedFlowBundleFiles } from './sharedFlowBundleGenerator.js';
import { POLICY_TYPES } from './policyTemplates.js';
import { collectDeployBlockers, collectSharedFlowDeployBlockers } from './deployChecks.js';

// apigeelint raises PO029 ("The policy type (X) is not recognized") for any
// policy it has no rule definition for. Its coverage lags Apigee: as of
// 2.85.1 that includes ParsePayload and PythonScript, both current, documented,
// supported Apigee X policies. Left alone the error blocks Export for a
// perfectly valid bundle, so PO029 is dropped for root tags we know Apigee
// itself supports. Any genuinely unknown tag still reports normally.
const KNOWN_POLICY_TAGS = new Set(POLICY_TYPES.map((t) => t.xmlTag || t.key));

function isKnownTypeFalsePositive(message, policyXmlTagsByFile, filePath) {
  if (message.ruleId !== 'PO029') return false;
  const tag = policyXmlTagsByFile.get(filePath);
  return !!tag && KNOWN_POLICY_TAGS.has(tag);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN_NAME = process.platform === 'win32' ? 'apigeelint.cmd' : 'apigeelint';
const LINT_TIMEOUT_MS = 30_000;

// Persisted across process restarts (not just in-process), since `npm run dev`
// runs the server under `node --watch` — every save-triggered restart would
// otherwise repeat the same two fs.access probes before the first lint of the
// new process can even start.
const BIN_CACHE_FILE = path.join(os.tmpdir(), 'apigee-proxy-studio-apigeelint-bin.json');

let cachedBinPath;
async function resolveApigeelintBin() {
  if (cachedBinPath) return cachedBinPath;

  try {
    const { binPath } = JSON.parse(await fs.readFile(BIN_CACHE_FILE, 'utf-8'));
    if (binPath === BIN_NAME || (await fs.access(binPath).then(() => true, () => false))) {
      cachedBinPath = binPath;
      return binPath;
    }
  } catch {
    // no cache file yet, or it's stale/unreadable — resolve normally below
  }

  const candidates = [
    path.resolve(__dirname, '../../node_modules/.bin', BIN_NAME), // server/node_modules/.bin
    path.resolve(__dirname, '../../../node_modules/.bin', BIN_NAME), // hoisted to workspace root
  ];
  cachedBinPath = BIN_NAME; // fall back to PATH lookup
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      cachedBinPath = candidate;
      break;
    } catch {
      // try next candidate
    }
  }
  await fs.writeFile(BIN_CACHE_FILE, JSON.stringify({ binPath: cachedBinPath }), 'utf-8').catch(() => {});
  return cachedBinPath;
}

async function runApigeelint(sourceDir, excludes = []) {
  const bin = await resolveApigeelintBin();
  const lintArgs = ['-s', sourceDir, '-f', 'json.js', '--profile', 'apigeex', '--norc'];
  if (excludes.length) lintArgs.push('-e', excludes.join(','));
  // .cmd shims on Windows aren't directly executable — route through cmd.exe explicitly
  // (rather than execFile's `shell: true`, which concatenates args unescaped).
  const [command, commandArgs] = process.platform === 'win32' ? ['cmd.exe', ['/d', '/s', '/c', bin, ...lintArgs]] : [bin, lintArgs];

  return new Promise((resolve) => {
    execFile(
      command,
      commandArgs,
      { maxBuffer: 1024 * 1024 * 10, timeout: LINT_TIMEOUT_MS, windowsHide: true },
      (err, stdout, stderr) => {
        resolve({ err, stdout: stdout || '', stderr: stderr || '' });
      }
    );
  });
}

// Strips the temp-dir prefix and normalizes slashes so the UI can show clean,
// bundle-relative paths like "apiproxy/policies/AM-Foo.xml".
function relativizePath(filePath, rootDir) {
  const normalized = filePath.replace(/\\/g, '/');
  const normalizedRoot = rootDir.replace(/\\/g, '/');
  return normalized.startsWith(normalizedRoot) ? normalized.slice(normalizedRoot.length).replace(/^\//, '') : normalized;
}

// Writes `files` (a relative-path -> content map, as produced by a bundle
// generator) to a temp dir under `bundleFolderName` ("apiproxy" or
// "sharedflowbundle"), runs apigeelint against it, and cleans up.
// Exported so the future Shared Flow lint route can reuse it directly.
export async function lintBundleFiles(files, bundleFolderName, excludes = []) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'apigee-lint-'));
  const bundleDir = path.join(tempDir, bundleFolderName);

  try {
    const resolvedTempDir = path.resolve(tempDir) + path.sep;
    for (const [relPath, content] of Object.entries(files)) {
      const fullPath = path.join(tempDir, relPath);
      // Belt-and-suspenders: bundleGenerator.js already rejects unsafe
      // segments before `files` is built, but this is the actual disk write,
      // so it gets its own independent guard against escaping tempDir.
      if (!path.resolve(fullPath).startsWith(resolvedTempDir)) {
        throw new Error(`Refusing to write outside the lint temp directory: "${relPath}"`);
      }
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');
    }

    const { err, stdout, stderr } = await runApigeelint(bundleDir, excludes);

    if (err && err.code === 'ENOENT') {
      return {
        ok: false,
        systemError: 'apigeelint is not installed. Run `npm install` in the server/ folder.',
        files: [],
        errorCount: 0,
        warningCount: 0,
      };
    }

    let raw;
    try {
      raw = JSON.parse(stdout);
    } catch {
      return {
        ok: false,
        systemError: (stderr || stdout || `apigeelint produced no output (exit code ${err?.code ?? 'unknown'})`).slice(0, 4000),
        files: [],
        errorCount: 0,
        warningCount: 0,
      };
    }

    // Root tag per policy file, so PO029 can be checked against the set of
    // policy types Apigee actually supports (see isKnownTypeFalsePositive).
    const policyXmlTagsByFile = new Map();
    for (const [relPath, content] of Object.entries(files)) {
      const m = String(content).replace(/^\s*<\?xml[^?]*\?>\s*/, '').match(/^<([A-Za-z0-9_]+)/);
      if (m) policyXmlTagsByFile.set(relPath, m[1]);
    }

    const fileResults = raw
      .map((entry) => {
        const filePath = relativizePath(entry.filePath, tempDir) || bundleFolderName;
        const messages = (entry.messages || [])
          .map((m) => ({
            line: m.line ?? null,
            column: m.column ?? null,
            ruleId: m.ruleId ?? null,
            message: m.message,
            severity: m.severity === 2 ? 'error' : 'warning',
          }))
          .filter((m) => !isKnownTypeFalsePositive(m, policyXmlTagsByFile, filePath));
        // Recount from the surviving messages rather than trusting apigeelint's
        // own totals, which still include anything filtered above.
        return {
          filePath,
          errorCount: messages.filter((m) => m.severity === 'error').length,
          warningCount: messages.filter((m) => m.severity === 'warning').length,
          messages,
        };
      })
      .filter((f) => f.messages.length > 0);

    const errorCount = fileResults.reduce((sum, f) => sum + f.errorCount, 0);
    const warningCount = fileResults.reduce((sum, f) => sum + f.warningCount, 0);

    return { ok: true, files: fileResults, errorCount, warningCount };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

// Folds our own deploy blockers into an apigeelint result, so they show up in
// the Lint tab and the existing "zero errors to export" gate covers them too
// without a second UI surface. Merged into the matching file entry when there
// is one so the tab doesn't list the same file twice.
function withDeployBlockers(result, blockers) {
  if (!result.ok || !blockers.length) return result;
  const files = result.files.map((f) => ({ ...f, messages: [...f.messages] }));
  let addedErrors = 0;
  let addedWarnings = 0;
  for (const b of blockers) {
    // Blockers carry their own severity — collectDeployBlockers emits warnings
    // (e.g. DEPLOY007, an unreferenced policy) alongside true errors. Counting
    // every one as an error inflated errorCount, which blocked Export and made
    // the Lint tab claim errors that no rendered message matched.
    const isError = b.severity !== 'warning';
    if (isError) addedErrors += 1;
    else addedWarnings += 1;
    const existing = files.find((f) => f.filePath === b.filePath);
    if (existing) {
      existing.messages.push(b);
      if (isError) existing.errorCount += 1;
      else existing.warningCount += 1;
    } else {
      files.push({
        filePath: b.filePath,
        errorCount: isError ? 1 : 0,
        warningCount: isError ? 0 : 1,
        messages: [b],
      });
    }
  }
  return {
    ...result,
    files,
    errorCount: result.errorCount + addedErrors,
    warningCount: result.warningCount + addedWarnings,
  };
}

export async function lintProxy(proxy, { knownSharedFlows = null } = {}) {
  const result = await lintBundleFiles(generateBundleFiles(proxy), 'apiproxy', proxy.lintExcludes || []);
  return withDeployBlockers(result, collectDeployBlockers(proxy, { knownSharedFlows }));
}

export async function lintSharedFlow(sharedFlow, { knownSharedFlows = null } = {}) {
  const result = await lintBundleFiles(
    generateSharedFlowBundleFiles(sharedFlow),
    'sharedflowbundle',
    sharedFlow.lintExcludes || []
  );
  return withDeployBlockers(result, collectSharedFlowDeployBlockers(sharedFlow, { knownSharedFlows }));
}
