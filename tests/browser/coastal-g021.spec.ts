import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const output = 'docs/m2.2-coastal-assembly/review-gates/G021-A';
const hash = (buffer: Buffer): string => createHash('sha256').update(buffer).digest('hex');
test('G02.1-A isolates render geometry and captures C2 baseline / geometry', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await mkdir(output, { recursive: true });
  const errors: string[] = [], failedRequests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.text()); });
  page.on('requestfailed', (r) => failedRequests.push(r.url()));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto('/?scene=coastal-assembly&diagnostic=g021&variant=baseline');
  await page.addStyleTag({ content: '.viewport{flex:none!important;height:811px!important}.scene-heading,.scene-footer{visibility:hidden!important}' });
  const canvas = page.locator('#scene');
  const ready = async (): Promise<void> => {
    await expect(canvas).toHaveAttribute('data-loaded', 'true', { timeout: 30_000 });
    await expect(canvas).toHaveAttribute('data-rendered', 'true', { timeout: 30_000 });
  };
  await ready();
  const backend = await canvas.evaluate((element) => {
    const context = (element as HTMLCanvasElement).getContext('webgl2');
    if (!context) throw new Error('Expected a live WebGL2 fixture');
    const extension = context.getExtension('WEBGL_debug_renderer_info');
    return { api: 'WebGL2', renderer: extension ? String(context.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : 'unavailable' };
  });
  const instances = await canvas.getAttribute('data-fusion-instances');
  const g02 = JSON.parse(await readFile('docs/m2.2-coastal-assembly/review-gates/G02/measurements.json', 'utf8')) as { geometries: { candidate: string; instance: { matrixWorld: number[] }; neighbours: { id: string; matrixWorld: number[] }[] }[] };
  const c2 = g02.geometries.find((g) => g.candidate === 'C2')!;
  const runtime = JSON.parse(instances!) as { id: string; matrixWorld: number[] }[];
  expect(runtime.find((i) => i.id === 'front-shoulder')!.matrixWorld).toEqual(c2.instance.matrixWorld);
  for (const neighbour of c2.neighbours) expect(runtime.find((i) => i.id === neighbour.id)!.matrixWorld).toEqual(neighbour.matrixWorld);
  const records: object[] = [], boundaries: Record<string, { editableTriangles: number[][][]; protectedTopEdges: number[][][] }> = {};
  const summary = JSON.parse(await canvas.getAttribute('data-fusion-summary') ?? '{}') as { displacedVertices: number; maxDisplacementM: number; editedBounds: { min: number[]; max: number[] } };
  expect(summary.displacedVertices).toBeGreaterThan(0); expect(summary.maxDisplacementM).toBeLessThan(1.55);
  expect(summary.editedBounds.min[1]).toBeGreaterThan(0.6); expect(summary.editedBounds.max[1]).toBeLessThan(3.35);
  for (const variant of ['baseline', 'geometry']) {
    await page.selectOption('#g021-variant', variant); await ready();
    await expect(canvas).toHaveAttribute('data-fusion-variant', variant);
    expect(await canvas.getAttribute('data-fusion-instances')).toBe(instances);
    expect(JSON.parse(await canvas.getAttribute('data-fusion-protection') ?? '{}')).toEqual({ originalGeometryUnchanged: true, sameMaterialReferences: true, originalQueryNodeRetained: true });
    for (const view of ['golden', 'side', 'below']) {
      await page.selectOption('#g01-view', view); await ready();
      const rect = await canvas.boundingBox(); expect(rect?.width).toBe(1600); expect(rect?.height).toBe(811);
      await canvas.screenshot({ path: `${output}/${variant}-${view}.png` });
      records.push({ variant, view, camera: JSON.parse(await canvas.getAttribute('data-g01-camera') ?? '{}') });
      if (variant === 'baseline') boundaries[view] = JSON.parse(await canvas.getAttribute('data-fusion-boundary') ?? '{}') as typeof boundaries[string];
    }
  }
  await page.selectOption('#g021-variant', 'baseline'); await ready();
  await page.selectOption('#g01-view', 'golden'); await ready();
  const restored = await canvas.screenshot();
  expect(hash(restored)).toBe(hash(await readFile(`${output}/baseline-golden.png`)));
  const preservation = [];
  for (const path of ['public/assets/presets/coastal-assembly.json', 'public/assets/presets/coastal-g01.json', 'public/assets/presets/coastal-g02.json', 'src/world/coastal.ts', 'src/world/blockout.ts', 'art-source/parameters/island_cottage_v2.json', 'public/assets/models/island_cottage_blockout_v2.glb']) {
    const before = execFileSync('git', ['-c', `safe.directory=${resolve('.').replaceAll('\\', '/')}`, 'show', `79e29ef:${path}`], { windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    const normalize = (buffer: Buffer): Buffer => /\.(json|ts)$/.test(path) ? Buffer.from(buffer.toString().replaceAll('\r\n', '\n')) : buffer;
    const current = hash(normalize(await readFile(path))); expect(current, path).toBe(hash(normalize(before))); preservation.push({ path, sha256: current });
  }
  const manifest = JSON.parse(await readFile('public/assets/manifests/coastal-assembly.json', 'utf8')) as { assets: { input: string; sourceSha256: string; variants: { modelUrl: string; sha256: string }[] }[] };
  for (const asset of manifest.assets) for (const entry of [{ path: asset.input, sha256: asset.sourceSha256 }, ...asset.variants.map((v) => ({ path: 'public' + v.modelUrl, sha256: v.sha256 }))]) {
    expect(hash(await readFile(entry.path)), entry.path).toBe(entry.sha256); preservation.push(entry);
  }
  const sheet = await browser.newPage({ deviceScaleFactor: 1 });
  try {
    for (const view of ['golden', 'side', 'below', 'golden-close']) {
      const sourceView = view === 'golden-close' ? 'golden' : view;
      const crop = view === 'golden-close' ? '750 430 540 350' : '0 0 1600 811';
      const cells = [];
      for (const variant of ['baseline', 'geometry']) {
        const source = (await readFile(`${output}/${variant}-${sourceView}.png`)).toString('base64');
        cells.push(`<article><h2>${variant === 'baseline' ? 'BEFORE / G02 C2' : 'AFTER / G02.1-A geometry'}</h2><svg viewBox="${crop}"><image href="data:image/png;base64,${source}" width="1600" height="811"/></svg></article>`);
      }
      await sheet.setViewportSize({ width: 2000, height: view === 'golden-close' ? 730 : 630 });
      await sheet.setContent(`<style>body{margin:0;padding:18px;background:#edf0e8;font-family:Segoe UI;color:#243d33}h1{font-size:22px;margin:0 0 12px}.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}h2{font-size:18px;margin:0;padding:10px;background:#d5ddcf}svg{display:block;width:100%}</style><h1>G02.1-A / front-shoulder A4 · ${view} · fixed camera / light / crop / DPR1</h1><div class="row">${cells.join('')}</div>`);
      await sheet.screenshot({ path: `${output}/comparison-${view}.png` });
    }
    for (const view of ['golden', 'side', 'below']) {
      const source = (await readFile(`${output}/baseline-${view}.png`)).toString('base64');
      await sheet.setViewportSize({ width: 1600, height: 811 });
      const boundary = boundaries[view]!;
      await sheet.setContent(`<style>body{margin:0}</style><svg width="1600" height="811"><image href="data:image/png;base64,${source}" width="1600" height="811"/>${boundary.editableTriangles.map((p) => `<polygon points="${p.map((v) => v.join(',')).join(' ')}" fill="#ff8800" fill-opacity=".14" stroke="#ff8800" stroke-width="1"/>`).join('')}${boundary.protectedTopEdges.map((p) => `<polyline points="${p.map((v) => v.join(',')).join(' ')}" stroke="#25ef83" stroke-width="2" fill="none"/>`).join('')}<rect x="15" y="15" width="1030" height="55" fill="#17372b"/><text x="30" y="48" fill="white" font-family="Segoe UI" font-size="19">C2 / ${view}: orange = steep source faces; green = protected cliff top; beach below Y=0.65 unchanged</text></svg>`);
      await sheet.screenshot({ path: `${output}/boundary-${view}.png` });
    }
  } finally { await sheet.close(); }
  // Ordinary scene ignores the variant and keeps the original placement and renderer.
  await page.goto('/?scene=coastal-assembly&variant=geometry'); await ready();
  expect(await canvas.getAttribute('data-fusion-summary')).toBeNull();
  const original = JSON.parse(await readFile('docs/m2.2-coastal-assembly/review-gates/G01/original-runtime.json', 'utf8')) as { bounds: object[] };
  expect(JSON.parse(await canvas.getAttribute('data-world-bounds') ?? '[]')).toEqual(original.bounds);
  const parameters = JSON.parse(await readFile('public/assets/presets/coastal-g021.json', 'utf8')) as unknown;
  await writeFile(`${output}/summary.json`, JSON.stringify({ browser: browser.version(), backend, viewport: { width: 1600, height: 811, dpr: 1 }, sourceCommit: '79e29ef', baseline: 'G02 C2', parameters, summary, instances: runtime, records, preservation, originalGeometryUnchanged: true, baselineRestoreSameBrowserPixels: true, ordinarySceneUnchanged: true, errors, failedRequests }, null, 2) + '\n');
  expect(errors).toEqual([]); expect(failedRequests).toEqual([]);
});
