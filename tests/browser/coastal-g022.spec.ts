import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const output = 'docs/m2.2-coastal-assembly/review-gates/G022';
const hash = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
test('G02.2 captures isolated C2 replacement with unchanged assets and original experiments', async ({ page, browser }) => {
  test.setTimeout(180_000); await mkdir(output, { recursive: true });
  const errors: string[] = [], failedRequests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.text()); });
  page.on('requestfailed', (r) => failedRequests.push(r.url())); page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto('/?scene=coastal-assembly&diagnostic=g022&variant=baseline');
  await page.addStyleTag({ content: '.viewport{flex:none!important;height:811px!important}.scene-heading,.scene-footer{visibility:hidden!important}' });
  const canvas = page.locator('#scene');
  const ready = async (): Promise<void> => { await expect(canvas).toHaveAttribute('data-loaded', 'true', { timeout: 30_000 }); await expect(canvas).toHaveAttribute('data-rendered', 'true', { timeout: 30_000 }); await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))); };
  await ready();
  const instances = await canvas.getAttribute('data-replacement-instances');
  const prior = JSON.parse(await readFile('docs/m2.2-coastal-assembly/review-gates/G021-A/summary.json', 'utf8')) as { instances: object[] };
  expect(JSON.parse(instances!)).toEqual(prior.instances);
  const summary = JSON.parse(await canvas.getAttribute('data-replacement-summary') ?? '{}') as { removedTriangles: number; retainedTriangles: number; apronTriangles: number; addedRockInstances: number; contactRows: { rim: number[]; outer: number[]; rockTopY: number; taperedEndpoint: boolean }[] };
  expect(summary.removedTriangles).toBeGreaterThan(0); expect(summary.retainedTriangles).toBeGreaterThan(summary.removedTriangles); expect(summary.apronTriangles).toBeLessThanOrEqual(144); expect(summary.addedRockInstances).toBe(0);
  for (const row of summary.contactRows) {
    if (row.taperedEndpoint) expect(row.outer).toEqual(row.rim);
    else expect(row.rockTopY - row.outer[1]!).toBeCloseTo(0.035, 5);
  }
  const backend = await canvas.evaluate((el) => { const gl = (el as HTMLCanvasElement).getContext('webgl2')!; const ext = gl.getExtension('WEBGL_debug_renderer_info'); return { api: 'WebGL2', renderer: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unavailable' }; });
  const records: object[] = [];
  for (const variant of ['baseline', 'replacement']) {
    await page.selectOption('#g022-variant', variant); await ready();
    expect(await canvas.getAttribute('data-replacement-instances')).toBe(instances);
    expect(JSON.parse(await canvas.getAttribute('data-replacement-protection') ?? '{}')).toEqual({ sourceGeometryRetained: true, originalAttributesUnchanged: true, sameCliffMaterial: true, originalQueryNodeRetained: true, originalSubjectTransformRetained: true });
    for (const view of ['golden', 'side', 'below']) {
      await page.selectOption('#g01-view', view); await ready(); const box = await canvas.boundingBox(); expect(box?.width).toBe(1600); expect(box?.height).toBe(811);
      await canvas.screenshot({ path: `${output}/${variant}-${view}.png` }); records.push({ variant, view, camera: JSON.parse(await canvas.getAttribute('data-g01-camera') ?? '{}') });
    }
  }
  await page.selectOption('#g022-variant', 'baseline'); await ready(); await page.selectOption('#g01-view', 'golden'); await ready();
  const restored = await canvas.screenshot();
  const sheet = await browser.newPage({ deviceScaleFactor: 1 });
  let baselineRestore: { changedPixels: number; maxChannelDelta: number } | undefined;
  try {
    const sources = [restored, await readFile(`${output}/baseline-golden.png`)].map((b) => `data:image/png;base64,${b.toString('base64')}`);
    baselineRestore = await sheet.evaluate(async (sources) => {
      const images = await Promise.all(sources.map((src) => new Promise<HTMLImageElement>((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.src = src; })));
      const pixels = images.map((img) => { const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height; const context = canvas.getContext('2d')!; context.drawImage(img, 0, 0); return context.getImageData(0, 0, img.width, img.height).data; });
      let changedPixels = 0, maxChannelDelta = 0;
      for (let i = 0; i < pixels[0]!.length; i += 4) { let delta = 0; for (let channel = 0; channel < 3; channel++) delta = Math.max(delta, Math.abs(pixels[0]![i + channel]! - pixels[1]![i + channel]!)); if (delta) changedPixels++; maxChannelDelta = Math.max(maxChannelDelta, delta); }
      return { changedPixels, maxChannelDelta };
    }, sources);
    expect(baselineRestore.changedPixels).toBeLessThanOrEqual(20); expect(baselineRestore.maxChannelDelta).toBeLessThanOrEqual(1);
    for (const view of ['golden', 'side', 'below', 'golden-close']) {
      const cells = [], sourceView = view === 'golden-close' ? 'golden' : view, crop = view === 'golden-close' ? '750 430 540 350' : '0 0 1600 811';
      for (const variant of ['baseline', 'replacement']) { const src = (await readFile(`${output}/${variant}-${sourceView}.png`)).toString('base64'); cells.push(`<article><h2>${variant === 'baseline' ? 'BEFORE / G02 C2' : 'AFTER / G02.2 local replacement'}</h2><svg viewBox="${crop}"><image href="data:image/png;base64,${src}" width="1600" height="811"/></svg></article>`); }
      await sheet.setViewportSize({ width: 2000, height: view === 'golden-close' ? 730 : 630 });
      await sheet.setContent(`<style>body{margin:0;padding:18px;background:#edf0e8;font-family:Segoe UI;color:#243d33}h1{font-size:22px;margin:0 0 12px}.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}h2{font-size:18px;margin:0;padding:10px;background:#d5ddcf}svg{display:block;width:100%}</style><h1>G02.2 / front-shoulder A4 · ${view} · fixed camera / light / crop / DPR1</h1><div class="row">${cells.join('')}</div>`);
      await sheet.screenshot({ path: `${output}/comparison-${view}.png` });
    }
  } finally { await sheet.close(); }
  const preservation = [];
  for (const path of ['public/assets/presets/coastal-assembly.json', 'public/assets/presets/coastal-g01.json', 'public/assets/presets/coastal-g02.json', 'public/assets/presets/coastal-g021.json', 'src/world/coastal.ts', 'src/world/blockout.ts', 'src/world/coastalFusion.ts', 'art-source/parameters/island_cottage_v2.json', 'public/assets/models/island_cottage_blockout_v2.glb']) {
    const before = execFileSync('git', ['-c', `safe.directory=${resolve('.').replaceAll('\\', '/')}`, 'show', `4175fe3:${path}`], { windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    const normalize = (b: Buffer): Buffer => /\.(json|ts)$/.test(path) ? Buffer.from(b.toString().replaceAll('\r\n', '\n')) : b;
    const actual = hash(normalize(await readFile(path))); expect(actual, path).toBe(hash(normalize(before))); preservation.push({ path, sha256: actual });
  }
  const manifest = JSON.parse(await readFile('public/assets/manifests/coastal-assembly.json', 'utf8')) as { assets: { input: string; sourceSha256: string; variants: { modelUrl: string; sha256: string }[] }[] };
  for (const a of manifest.assets) for (const entry of [{ path: a.input, sha256: a.sourceSha256 }, ...a.variants.map((v) => ({ path: 'public' + v.modelUrl, sha256: v.sha256 }))]) { expect(hash(await readFile(entry.path)), entry.path).toBe(entry.sha256); preservation.push(entry); }
  await page.goto('/?scene=coastal-assembly&diagnostic=g021&variant=geometry'); await ready(); await expect(canvas).toHaveAttribute('data-fusion-variant', 'geometry'); expect(await canvas.getAttribute('data-replacement-summary')).toBeNull();
  await page.goto('/?scene=coastal-assembly&diagnostic=g02&candidate=C2'); await ready(); await expect(canvas).toHaveAttribute('data-g02-candidate', 'C2');
  await page.goto('/?scene=coastal-assembly&variant=replacement'); await ready(); expect(await canvas.getAttribute('data-replacement-summary')).toBeNull();
  const original = JSON.parse(await readFile('docs/m2.2-coastal-assembly/review-gates/G01/original-runtime.json', 'utf8')) as { bounds: object[] };
  expect(JSON.parse(await canvas.getAttribute('data-world-bounds') ?? '[]')).toEqual(original.bounds);
  await writeFile(`${output}/summary.json`, JSON.stringify({ browser: browser.version(), backend, viewport: { width: 1600, height: 811, dpr: 1 }, sourceCommit: '4175fe3', parameters: JSON.parse(await readFile('public/assets/presets/coastal-g022.json', 'utf8')) as unknown, summary, instances: prior.instances, records, preservation, baselineRestore: { ...baselineRestore, maxChangedPixelsAllowed: 20, maxChannelDeltaAllowed: 1 }, previousRoutesRetained: true, ordinarySceneUnchanged: true, errors, failedRequests }, null, 2) + '\n');
  expect(errors).toEqual([]); expect(failedRequests).toEqual([]);
});
