import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import process from 'node:process';
import { stripVTControlCharacters } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(readFileSync(resolve(root, 'art-source/tripo/coastal_pipeline.json'), 'utf8'));
const env = { ...process.env, M2_EVIDENCE_DIR: 'test-results/coastal-baseline', M2_RUNTIME_REPORT_PATH: 'test-results/coastal-baseline/runtime-report.json', TRIPO_EVIDENCE_DIR: 'test-results/coastal-tripo/images', TRIPO_REPORT_DIR: 'test-results/coastal-tripo' };
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (!env.PLAYWRIGHT_BROWSER_PATH && existsSync(chrome)) env.PLAYWRIGHT_BROWSER_PATH = chrome;
mkdirSync(resolve(root, config.reports), { recursive: true });
const started = Date.now(), stages = [];
const save = (name, data) => writeFileSync(resolve(root, config.reports, name), JSON.stringify(data, null, 2) + '\n');
const run = (script, args, label) => new Promise((done, reject) => {
  process.stdout.write(`\nCOASTAL STAGE: ${label}\n`);
  let output = '';
  const child = spawn(process.execPath, [resolve(root, script), ...args], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => { process.stdout.write(chunk); output += chunk.toString(); });
  child.on('error', reject);
  child.on('exit', (code) => {
    stages.push({ label, exitCode: code });
    if (code === 0) done(stripVTControlCharacters(output));
    else reject(new Error(`${label} failed (exit ${code}). See reports and rerun failed asset/check.`));
  });
});
save('pipeline-run.json', { passed: false, status: 'running', command: 'npm run coastal:pipeline', stages });
try {
  await run('scripts/coastal_batch.mjs', [], 'four-asset optimize and source/LOD views');
  const first = JSON.parse(readFileSync(resolve(root, config.manifest), 'utf8'));
  await run('scripts/coastal_batch.mjs', ['--no-render'], 'repeat optimization statistics');
  const second = JSON.parse(readFileSync(resolve(root, config.manifest), 'utf8'));
  const comparisons = [];
  for (const asset of first.assets) {
    const repeated = second.assets.find((item) => item.id === asset.id);
    assert.equal(repeated.sourceSha256, asset.sourceSha256);
    for (const variant of asset.variants) {
      const again = repeated.variants.find((item) => item.id === variant.id);
      assert.ok(Math.abs(again.triangleCount / variant.triangleCount - 1) <= 0.005);
      assert.ok(Math.abs(again.fileBytes / variant.fileBytes - 1) <= 0.001);
      assert.ok(again.dimensions.every((value, axis) => Math.abs(value - variant.dimensions[axis]) <= 0.02));
      assert.deepEqual(again.images, variant.images);
      comparisons.push({ asset: asset.id, lod: variant.id, firstTriangles: variant.triangleCount, repeatedTriangles: again.triangleCount, firstBytes: variant.fileBytes, repeatedBytes: again.fileBytes, byteIdentical: again.sha256 === variant.sha256, textureHashesIdentical: true, passed: true });
    }
  }
  save('reproducibility.json', { passed: true, tolerance: { trianglesRelative: 0.005, fileBytesRelative: 0.001, dimensionsMeters: 0.02, textureHashes: 'exact' }, comparisons });
  await run('scripts/validate_coastal.mjs', [], 'independent asset/baseline/placement validation');
  await run('node_modules/eslint/bin/eslint.js', ['.', '--max-warnings', '0'], 'lint');
  await run('node_modules/typescript/bin/tsc', ['--noEmit'], 'strict typecheck');
  const unit = await run('node_modules/vitest/vitest.mjs', ['run'], 'unit tests');
  await run('node_modules/vite/bin/vite.js', ['build'], 'production build');
  const browser = await run('node_modules/@playwright/test/cli.js', ['test'], 'M1/M2/Tripo/coastal browser tests');
  const unitTestsPassed = Number(unit.match(/Tests\s+(\d+)\s+passed/)?.[1]);
  const browserTestsPassed = Number(browser.match(/(\d+)\s+passed\s+\(/)?.[1]);
  assert.ok(unitTestsPassed > 0 && browserTestsPassed > 0);
  save('checks.json', { passed: true, lint: true, typecheck: true, build: true, unitTestsPassed, browserTestsPassed, stages });
  await run('scripts/report_coastal.mjs', [], 'Golden Reference and acceptance report');
  save('pipeline-run.json', { passed: true, command: 'npm run coastal:pipeline', seconds: (Date.now() - started) / 1000, stages, originalPreserved: true, status: 'engineering-complete-visual-review-pending' });
} catch (error) {
  save('pipeline-run.json', { passed: false, command: 'npm run coastal:pipeline', seconds: (Date.now() - started) / 1000, stages, error: String(error) });
  throw error;
}
