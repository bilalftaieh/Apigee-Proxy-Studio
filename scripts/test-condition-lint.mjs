/**
 * Runs client/src/lib/conditionLint.test.mjs against the TypeScript source.
 *
 * The client has no test runner and does not need one for a single pure
 * module: esbuild is already here (Vite depends on it), so the module is
 * bundled to a temp file and handed to `node --test`, which is what the
 * server's tests already use. One script, no new dependency, and the test file
 * itself is ordinary ESM.
 */
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(repoRoot, 'client/src/lib/conditionLint.ts');
const TEST = path.join(repoRoot, 'client/src/lib/conditionLint.test.mjs');

const dir = await mkdtemp(path.join(tmpdir(), 'condition-lint-'));
try {
  await build({
    entryPoints: [SOURCE],
    outfile: path.join(dir, 'conditionLint.mjs'),
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'warning',
  });

  // A shim so the test file can `import './conditionLint.mjs'` by a stable
  // name rather than knowing about the temp directory.
  await writeFile(
    path.join(dir, 'entry.test.mjs'),
    `globalThis.__CONDITION_LINT__ = await import(${JSON.stringify(pathToFileURL(path.join(dir, 'conditionLint.mjs')).href)});\n` +
      `await import(${JSON.stringify(pathToFileURL(TEST).href)});\n`,
    'utf-8'
  );

  const child = spawn(process.execPath, ['--test', path.join(dir, 'entry.test.mjs')], { stdio: 'inherit' });
  const code = await new Promise((resolve) => child.on('exit', resolve));
  process.exitCode = code ?? 1;
} finally {
  await rm(dir, { recursive: true, force: true });
}
