// scripts/run-tests.mjs
// Bundles committed tests/*.test.ts with the repo's esbuild (ships with vite,
// no new dependency) and runs them in Node. Exit code 1 on any failure.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const esbuildBin = path.join(root, 'node_modules', 'esbuild', 'bin', 'esbuild');
const testsDir = path.join(root, 'tests');
const outDir = mkdtempSync(path.join(tmpdir(), 'autoinspect-tests-'));

const files = readdirSync(testsDir).filter((f) => f.endsWith('.test.ts'));
if (files.length === 0) {
  console.log('No tests found.');
  process.exit(0);
}

let failed = false;
for (const file of files) {
  const base = file.replace(/\.test\.ts$/, '');
  const out = path.join(outDir, `${base}.cjs`);
  console.log(`--- ${file} ---`);
  try {
    execFileSync(process.execPath, [esbuildBin, path.join(testsDir, file),
      '--bundle', '--platform=node', '--format=cjs', `--outfile=${out}`, '--log-level=error'],
      { stdio: 'inherit' });
    execFileSync(process.execPath, [out], { stdio: 'inherit' });
  } catch {
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
