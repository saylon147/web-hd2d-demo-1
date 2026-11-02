import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { CliffBlockoutSummary } from '../../src/world/cliffBlockout';
import type { CliffBoundaryReport } from '../../src/world/cliffBoundary';

const output = 'docs/m2.3-cliff-section/review-gates/G03-A1';
const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
test('G03-A1 captures a reversible neutral cliff with original A0 interfaces and immutable assets', async ({ page, browser }) => {
  test.setTimeout(180_000); await mkdir(output, { recursive: true });
  const errors: string[] = [], failedRequests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.text()); });
  page.on('requestfailed', (r) => failedRequests.push(r.url())); page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.setViewportSize({ width: 1600, height: 1100 });
  const canvas = page.locator('#scene');
  const ready = async (): Promise<void> => { await expect(canvas).toHaveAttribute('data-loaded', 'true', { timeout: 30_000 }); await expect(canvas).toHaveAttribute('data-rendered', 'true', { timeout: 30_000 }); await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())))); };
  await page.goto('/?scene=coastal-assembly&diagnostic=g03-a1&variant=baseline&markers=off');
  await page.addStyleTag({ content: '.viewport{flex:none!important;height:811px!important}.scene-heading,.scene-footer{visibility:hidden!important}' }); await ready();
  const summary = JSON.parse(await canvas.getAttribute('data-g03-blockout') ?? '{}') as CliffBlockoutSummary;
  expect(summary.boundaryMaxErrorM).toBeLessThan(0.000001); expect(summary.unexpectedOpenEdges).toBe(0); expect(summary.flippedTriangles).toBe(0); expect(summary.degenerateTriangles).toBe(0); expect(summary.nonmanifoldEdges).toBe(0); expect(summary.maximumDisplacementM).toBeLessThan(0.3);
  expect(summary.sourceProfileDeviationM).toBeGreaterThan(0.1);
  const boundary = JSON.parse(await canvas.getAttribute('data-g03-boundary') ?? '{}') as CliffBoundaryReport;
  const approved = JSON.parse(await readFile('docs/m2.3-cliff-section/review-gates/G03-A0/summary.json', 'utf8')) as { report: CliffBoundaryReport; instances: object[] };
  expect(boundary).toEqual(approved.report);
  const instances = JSON.parse(await canvas.getAttribute('data-g03-instances') ?? '[]') as object[]; expect(instances).toEqual(approved.instances);
  const neighbours = await canvas.getAttribute('data-g03-neighbours');
  const backend = await canvas.evaluate((el) => { const gl = (el as HTMLCanvasElement).getContext('webgl2')!; const ext = gl.getExtension('WEBGL_debug_renderer_info'); return { api: 'WebGL2', renderer: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unavailable' }; });
  const records: object[] = [];
  for (const variant of ['baseline', 'cliff-blockout']) {
    await page.selectOption('#g03-variant', variant); await ready();
    const protection = JSON.parse(await canvas.getAttribute('data-g03-protection') ?? '{}') as Record<string, boolean>;
    expect(protection).toEqual({ sourceGeometryRetained: true, sourceMaterialRetained: true, attributesUnchanged: true, indicesUnchanged: true, subjectTransformUnchanged: true, subjectVisible: variant === 'baseline', originalQueryNodeRetained: true });
    expect(JSON.parse(await canvas.getAttribute('data-g03-instances') ?? '[]')).toEqual(instances);
    expect(await canvas.getAttribute('data-g03-neighbours')).toBe(neighbours);
    for (const view of ['golden', 'side', 'below']) {
      await page.selectOption('#g01-view', view); await ready(); const box = await canvas.boundingBox(); expect(box?.width).toBe(1600); expect(box?.height).toBe(811);
      await canvas.screenshot({ path: `${output}/${variant}-${view}.png` }); records.push({ variant, view, camera: JSON.parse(await canvas.getAttribute('data-g01-camera') ?? '{}') as unknown });
    }
  }
  await page.selectOption('#g01-view', 'golden'); await ready(); await page.selectOption('#g03-markers', 'on'); await ready();
  await page.locator('.viewport').screenshot({ path: `${output}/boundary-golden.png` }); await page.selectOption('#g03-markers', 'off'); await ready();
  await page.selectOption('#g03-geometry-only', 'true'); await ready();
  await canvas.screenshot({ path: `${output}/geometry-golden.png` });
  await page.selectOption('#g01-view', 'side'); await ready(); await canvas.screenshot({ path: `${output}/geometry-side.png` });
  await page.selectOption('#g03-geometry-only', 'false'); await page.selectOption('#g01-view', 'golden'); await ready();
  await page.selectOption('#g03-variant', 'baseline'); await ready(); const restored = await canvas.screenshot();
  const sheet = await browser.newPage({ deviceScaleFactor: 1 });
  let restore: { changedPixels: number; maxChannelDelta: number };
  try {
    restore = await sheet.evaluate(async (sources) => {
      const images = await Promise.all(sources.map((src) => new Promise<HTMLImageElement>((done) => { const img = new Image(); img.onload = () => done(img); img.src = src; })));
      const data = images.map((img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0); return ctx.getImageData(0, 0, img.width, img.height).data; });
      let changedPixels = 0, maxChannelDelta = 0;
      for (let i = 0; i < data[0]!.length; i += 4) { let delta = 0; for (let j = 0; j < 3; j++) delta = Math.max(delta, Math.abs(data[0]![i + j]! - data[1]![i + j]!)); if (delta) changedPixels++; maxChannelDelta = Math.max(maxChannelDelta, delta); }
      return { changedPixels, maxChannelDelta };
    }, [restored, await readFile(`${output}/baseline-golden.png`)].map((b) => `data:image/png;base64,${b.toString('base64')}`));
    expect(restore.changedPixels).toBeLessThanOrEqual(20); expect(restore.maxChannelDelta).toBeLessThanOrEqual(1);
    for (const view of ['golden', 'golden-close', 'side', 'below']) {
      const sourceView = view === 'golden-close' ? 'golden' : view, crop = view === 'golden-close' ? '750 430 540 350' : '0 0 1600 811', cells: string[] = [];
      for (const variant of ['baseline', 'cliff-blockout']) {
        const src = (await readFile(`${output}/${variant}-${sourceView}.png`)).toString('base64');
        cells.push(`<article><h2>${variant === 'baseline' ? 'BEFORE / G02 C2' : 'AFTER / G03-A1 neutral cliff / A4 hidden'}</h2><svg viewBox="${crop}"><image href="data:image/png;base64,${src}" width="1600" height="811"/></svg></article>`);
      }
      await sheet.setViewportSize({ width: 2000, height: view === 'golden-close' ? 730 : 630 });
      await sheet.setContent(`<style>body{margin:0;padding:18px;background:#edf0e8;font-family:Segoe UI;color:#243d33}h1{font-size:22px;margin:0 0 12px}.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}h2{font-size:18px;margin:0;padding:10px;background:#d5ddcf}svg{display:block;width:100%}</style><h1>G03-A1 / ${view} / fixed camera, lighting, crop, DPR1, 10k/1K</h1><div class="row">${cells.join('')}</div>`);
      await sheet.screenshot({ path: `${output}/comparison-${view}.png` });
    }
    const geometryCells = await Promise.all(['golden', 'side'].map(async (view) => `<article><h2>${view} / isolated new surface / crop 600,280,600,420</h2><svg viewBox="600 280 600 420"><image href="data:image/png;base64,${(await readFile(`${output}/geometry-${view}.png`)).toString('base64')}" width="1600" height="811"/></svg></article>`));
    await sheet.setViewportSize({ width: 1600, height: 680 });
    await sheet.setContent(`<style>body{margin:0;padding:18px;background:#edf0e8;font-family:Segoe UI;color:#243d33}h1{font-size:22px;margin:0 0 12px}.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}h2{font-size:17px;margin:0;padding:10px;background:#d5ddcf}svg{display:block;width:100%}</style><h1>G03-A1 / supplemental unoccluded geometry / same renderer, camera and lights</h1><div class="row">${geometryCells.join('')}</div>`);
    await sheet.screenshot({ path: `${output}/geometry-diagnostic.png` });
  } finally { await sheet.close(); }
  // Protect all older geometry, presets, sources/LODs, and A0 evidence.
  const protection: { path: string; sha256: string }[] = [];
  const git = (args: string[]): Buffer => execFileSync('git', ['-c', `safe.directory=${resolve('.').replaceAll('\\', '/')}`, ...args], { windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const sourceCommit = git(['rev-parse', 'HEAD']).toString().trim();
  for (const path of ['scripts/terrain_blockout.py', 'scripts/generate_blockout.py', 'src/world/blockout.ts', 'src/world/coastal.ts', 'src/world/coastalFusion.ts', 'src/world/coastalReplacement.ts', 'art-source/parameters/island_cottage_v2.json', 'public/assets/models/island_cottage_blockout_v2.glb', 'docs/m2.3-cliff-section/review-gates/G03-A0/summary.json', ...['assembly', 'g01', 'g02', 'g021', 'g022', 'g03-a0'].map((id) => `public/assets/presets/coastal-${id}.json`)]) {
    const normalize = (b: Buffer): Buffer => /\.(json|ts|py)$/.test(path) ? Buffer.from(b.toString().replaceAll('\r\n', '\n')) : b;
    const actual = sha(normalize(await readFile(path))); expect(actual, path).toBe(sha(normalize(git(['show', `${sourceCommit}:${path}`])))); protection.push({ path, sha256: actual });
  }
  const manifest = JSON.parse(await readFile('public/assets/manifests/coastal-assembly.json', 'utf8')) as { assets: { input: string; sourceSha256: string; variants: { modelUrl: string; sha256: string }[] }[] };
  for (const a of manifest.assets) for (const item of [{ path: a.input, sha256: a.sourceSha256 }, ...a.variants.map((v) => ({ path: 'public' + v.modelUrl, sha256: v.sha256 }))]) { expect(sha(await readFile(item.path)), item.path).toBe(item.sha256); protection.push(item); }
  for (const [diagnostic, variant, attribute] of [['g021', 'geometry', 'data-fusion-variant'], ['g022', 'replacement', 'data-replacement-variant'], ['g02', 'baseline', 'data-g02-candidate']] as const) {
    await page.goto(`/?scene=coastal-assembly&diagnostic=${diagnostic}&variant=${variant}`); await ready(); await expect(canvas).toHaveAttribute(attribute, variant); expect(await canvas.getAttribute('data-g03-blockout')).toBeNull();
  }
  await page.goto('/?scene=coastal-assembly&diagnostic=g03-a0&markers=on'); await ready(); expect(await canvas.getAttribute('data-g03-blockout')).toBeNull(); expect(JSON.parse(await canvas.getAttribute('data-g03-boundary') ?? '{}')).toEqual(approved.report);
  await page.goto('/?scene=coastal-assembly&variant=cliff-blockout'); await ready(); expect(await canvas.getAttribute('data-g03-blockout')).toBeNull(); await expect(page.locator('.g03-boundary-overlay')).toHaveCount(0);
  const original = JSON.parse(await readFile('docs/m2.2-coastal-assembly/review-gates/G01/original-runtime.json', 'utf8')) as { bounds: object[] };
  expect(JSON.parse(await canvas.getAttribute('data-world-bounds') ?? '[]')).toEqual(original.bounds);
  expect(errors).toEqual([]); expect(failedRequests).toEqual([]);
  await writeFile(`${output}/summary.json`, JSON.stringify({ stage: 'G03-A1 only; stop for human review', sourceCommit, authorization: 'human chat approved A0 and A1; no document feedback commit exists', browser: browser.version(), backend, viewport: { width: 1600, height: 811, dpr: 1 }, parameters: JSON.parse(await readFile('public/assets/presets/coastal-g03-a1.json', 'utf8')) as unknown, summary, instances, neighbours: JSON.parse(neighbours ?? '[]') as unknown, records, baselineRestore: restore, protection, previousRoutesRetained: true, ordinarySceneUnchanged: true, errors, failedRequests }, null, 2) + '\n');
});
