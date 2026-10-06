/**
 * Runs client/src/lib/policyForm.test.mjs against the TypeScript source, the
 * same way scripts/test-condition-lint.mjs does: esbuild (already here via
 * Vite) bundles the module to a temp file and `node --test` runs the test.
 *
 * The one extra wrinkle is DOMParser. policyForm parses the policy's existing
 * XML in the browser; under Node it gets @xmldom/xmldom, with a `children`
 * shim because xmldom only implements `childNodes`.
 */
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST = path.join(repoRoot, 'client/src/lib/policyForm.test.mjs');
// The test file runs out of a temp directory, so bare specifiers wouldn't
// resolve to the repo's node_modules — hand it an absolute URL instead.
const XMLDOM = pathToFileURL(createRequire(path.join(repoRoot, 'package.json')).resolve('@xmldom/xmldom')).href;

const dir = await mkdtemp(path.join(tmpdir(), 'policy-form-'));
try {
  await build({
    stdin: {
      contents: `export * from ${JSON.stringify(path.join(repoRoot, 'client/src/lib/policyForm.ts').replace(/\\/g, '/'))};
export { getPolicySchema, POLICY_SCHEMAS } from ${JSON.stringify(path.join(repoRoot, 'client/src/lib/policySchema.ts').replace(/\\/g, '/'))};`,
      resolveDir: repoRoot,
      loader: 'ts',
    },
    outfile: path.join(dir, 'policyForm.mjs'),
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'warning',
  });

  await writeFile(
    path.join(dir, 'entry.test.mjs'),
    `import { DOMParser } from ${JSON.stringify(XMLDOM)};
const parser = new DOMParser();
globalThis.DOMParser = class {
  parseFromString(xml, type) {
    const doc = parser.parseFromString(xml, type);
    const walk = (node) => {
      if (node.nodeType === 1 && !('children' in node)) {
        Object.defineProperty(node, 'children', {
          get() { return Array.from(this.childNodes).filter((c) => c.nodeType === 1); },
        });
      }
      Array.from(node.childNodes || []).forEach(walk);
    };
    if (doc.documentElement) walk(doc.documentElement);
    if (!doc.getElementsByTagName) doc.getElementsByTagName = () => [];
    return doc;
  }
};
globalThis.__POLICY_FORM__ = await import(${JSON.stringify(pathToFileURL(path.join(dir, 'policyForm.mjs')).href)});
globalThis.__POLICY_TEMPLATES__ = await import(${JSON.stringify(pathToFileURL(path.join(repoRoot, 'server/src/lib/policyTemplates.js')).href)});
await import(${JSON.stringify(pathToFileURL(TEST).href)});
`,
    'utf-8'
  );

  const child = spawn(process.execPath, ['--test', path.join(dir, 'entry.test.mjs')], { stdio: 'inherit', cwd: repoRoot });
  const code = await new Promise((resolve) => child.on('exit', resolve));
  process.exitCode = code ?? 1;
} finally {
  await rm(dir, { recursive: true, force: true });
}
