import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { CottageComparisonPreset } from '../../src/config/cottageComparison';
import { COTTAGE_COMPARISON_VIEWS } from '../../src/config/cottageComparison';
import type { CottageManifest } from '../../src/config/cottageCandidate';

const output = 'docs/m2.4-cottage-tripo/review-gates/P2';
const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
test('P2 fixed cottage A/B evidence, reversible placement and unchanged scene/assets', async ({ page, browser }) => {
  test.setTimeout(240_000);
  const manifest = JSON.parse(await readFile('public/assets/manifests/cottage-candidate-01.json', 'utf8')) as CottageManifest;
  const preset = JSON.parse(await readFile('public/assets/presets/cottage-candidate-01-p2.json', 'utf8')) as CottageComparisonPreset;
  test.skip(!await access(manifest.sourceFile).then(() => true, () => false), 'Local original cottage GLB is required');
  await mkdir(output, { recursive: true });
  expect(sha(await readFile(manifest.sourceFile))).toBe(manifest.sha256);
  const errors: string[] = [], warnings: string[] = [], failedRequests: string[] = [], cottageRequests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning') warnings.push(m.text()); });
  page.on('requestfailed', (r) => failedRequests.push(r.url()));
  page.on('request', (r) => { if (r.url().includes('/__local-assets/')) cottageRequests.push(r.url()); });
  await page.setViewportSize({ width: 1600, height: 1000 });
  const canvas = page.locator('#scene');
  const ready = async (): Promise<void> => { await expect(canvas).toHaveAttribute('data-loaded', 'true', { timeout: 60_000 }); await expect(canvas).toHaveAttribute('data-rendered', 'true', { timeout: 60_000 }); };
  const fixture = async (url: string): Promise<void> => { await page.goto(url); await page.addStyleTag({ content: '.viewport{flex:none!important;height:811px!important}.scene-heading,.scene-footer{visibility:hidden!important}' }); await ready(); };
  await fixture('/?scene=cottage-ab'); await expect(canvas).toHaveAttribute('data-cottage-variant', 'A');
  expect(cottageRequests).toEqual([]);
  const initial = JSON.parse(await canvas.getAttribute('data-alignment') ?? '{}') as { uniformScale: number; referenceDoorWorld: number[]; referenceFootprint: { min: number[]; max: number[] } };
  expect(initial.referenceFootprint.min[0]).toBeCloseTo(-1, 5); expect(initial.referenceFootprint.max[0]).toBeCloseTo(5, 5);
  expect(initial.referenceDoorWorld).toEqual([expect.closeTo(1.8, 5), expect.closeTo(4, 5), expect.closeTo(1.85, 5)]);
  const cameras = new Map<string, string>(), records: object[] = [];
  for (const variant of ['A', 'B'] as const) {
    await page.selectOption('#cottage-variant', variant); await ready(); await expect(canvas).toHaveAttribute('data-cottage-variant', variant);
    for (const view of COTTAGE_COMPARISON_VIEWS) {
      await page.click(`[data-cottage-p2-view="${view}"]`); await ready();
      await expect(canvas).toHaveAttribute('data-view', view);
      const camera = await canvas.getAttribute('data-camera') ?? '';
      if (variant === 'A') cameras.set(view, camera); else expect(camera, `${view} same camera`).toBe(cameras.get(view));
      await canvas.screenshot({ path: `${output}/${variant}-${view}.png` });
      records.push({ variant, view, camera: JSON.parse(camera) as unknown });
    }
    const summary = JSON.parse(await canvas.getAttribute('data-alignment') ?? '{}') as { protectedEnvironmentUnchanged: boolean };
    expect(summary.protectedEnvironmentUnchanged).toBe(true);
  }
  expect(cottageRequests).toHaveLength(1);
  const alignment = JSON.parse(await canvas.getAttribute('data-alignment') ?? '{}') as { sourceSha256: string; candidate: { doorDeltaM: number[]; candidateBounds: { min: number[]; max: number[] }; support: object }; candidateDimensionsM: number[]; hiddenCottageNodes: string[] };
  expect(alignment.sourceSha256).toBe(manifest.sha256); expect(alignment.candidate.doorDeltaM).toEqual(preset.alignment.translationOffsetM.map((v) => expect.closeTo(v, 6)));
  expect(alignment.candidateDimensionsM[0]).toBeCloseTo(6, 5); expect(alignment.hiddenCottageNodes).toEqual(preset.alignment.hiddenCottageNodes);
  const backend = await canvas.evaluate((el) => { const gl = (el as HTMLCanvasElement).getContext('webgl2')!, ext = gl.getExtension('WEBGL_debug_renderer_info'); return { api: 'WebGL2', renderer: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unavailable' }; });
  const sheet = await browser.newPage({ deviceScaleFactor: 1 });
  const comparisons: object[] = [];
  try {
    const compare = async (a: Buffer, b: Buffer, label: string): Promise<void> => {
      const result = await sheet.evaluate(async (sources) => {
        const images = await Promise.all(sources.map((src) => new Promise<HTMLImageElement>((done) => { const img = new Image(); img.onload = () => done(img); img.src = src; })));
        const data = images.map((img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0); return ctx.getImageData(0, 0, c.width, c.height).data; });
        let changedPixels = 0, maxChannelDelta = 0;
        for (let i = 0; i < data[0]!.length; i += 4) { let d = 0; for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(data[0]![i + k]! - data[1]![i + k]!)); if (d) changedPixels++; maxChannelDelta = Math.max(maxChannelDelta, d); }
        return { changedPixels, maxChannelDelta };
      }, [a, b].map((b) => `data:image/png;base64,${b.toString('base64')}`));
      expect(result.changedPixels, label).toBeLessThanOrEqual(20); expect(result.maxChannelDelta, label).toBeLessThanOrEqual(1); comparisons.push({ label, ...result });
    };
    // Returning A must restore the exact rendered default cottage and shadows.
    await page.selectOption('#cottage-variant', 'A'); await page.click('[data-cottage-p2-view="golden"]'); await ready();
    await compare(await canvas.screenshot(), await readFile(`${output}/A-golden.png`), 'A restored after B');
    await fixture('/?scene=coastal-assembly&diagnostic=g01&overlay=off');
    await compare(await canvas.screenshot(), await readFile(`${output}/A-golden.png`), 'P2 A matches existing ordinary assembly at Golden');
    await fixture('/?scene=cottage-ab&cottage=B&view=front'); await expect(canvas).toHaveAttribute('data-cottage-variant', 'B');
    await page.addStyleTag({ content: '.scene-heading,.scene-footer{visibility:visible!important}' });
    await page.screenshot({ path: `${output}/B-viewer-ui.png` });
    await page.selectOption('#cottage-variant', 'A'); await ready(); await page.screenshot({ path: `${output}/A-viewer-ui.png` });
    await page.setViewportSize({ width: 390, height: 844 }); await ready();
    const mobile = await canvas.boundingBox(); expect(mobile!.width).toBe(390);
    const mobileCamera = JSON.parse(await canvas.getAttribute('data-camera') ?? '{}') as { aspect: number };
    expect(mobileCamera.aspect).toBeCloseTo(mobile!.width / mobile!.height, 5);
    await page.setViewportSize({ width: 1600, height: 1000 }); await ready();
    const style = '<style>body{margin:0;padding:18px;background:#edf0e8;font:16px Segoe UI;color:#27372e}h1{font-size:22px;margin:0 0 8px}p{margin:0 0 12px}h2{font-size:17px;margin:0;padding:10px;background:#d5ddcf}.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}img,svg{display:block;width:100%}</style>';
    for (const view of COTTAGE_COMPARISON_VIEWS) {
      const cells = await Promise.all(['A', 'B'].map(async (variant) => `<article><h2>${variant} / ${variant === 'A' ? 'retained default cottage' : 'Tripo Candidate 01, original HD'}</h2><img src="data:image/png;base64,${(await readFile(`${output}/${variant}-${view}.png`)).toString('base64')}"></article>`));
      await sheet.setViewportSize({ width: 2200, height: 710 });
      await sheet.setContent(`${style}<h1>P2 Cottage A/B / ${view}</h1><p>Same island, terrain, stairs, dock, five Tripo rocks, camera, light, exposure 1 and DPR 1. No asset optimization.</p><div class="row">${cells.join('')}</div>`);
      await sheet.screenshot({ path: `${output}/comparison-${view}.png` });
    }
    const [x, y, w, h] = preset.goldenCloseCrop;
    const cells = await Promise.all(['A', 'B'].map(async (variant) => `<article><h2>${variant} / Golden-close / crop ${[x, y, w, h].join(', ')}</h2><svg viewBox="${x} ${y} ${w} ${h}"><image href="data:image/png;base64,${(await readFile(`${output}/${variant}-golden.png`)).toString('base64')}" width="1600" height="811"/></svg></article>`));
    await sheet.setViewportSize({ width: 1800, height: 900 });
    await sheet.setContent(`${style}<h1>P2 Cottage A/B / Golden-close</h1><p>Identical crop from the full Golden screenshots; camera unchanged. Model proportions are not normalized between A and B.</p><div class="row">${cells.join('')}</div>`);
    await sheet.screenshot({ path: `${output}/comparison-golden-close.png` });
    // Exact pixel crops are also saved as individual evidence.
    for (const variant of ['A', 'B']) {
      const png = await sheet.evaluate(async ({ src, crop }) => {
        const img = await new Promise<HTMLImageElement>((done) => { const i = new Image(); i.onload = () => done(i); i.src = src; });
        const c = document.createElement('canvas'); c.width = crop[2]!; c.height = crop[3]!; c.getContext('2d')!.drawImage(img, crop[0]!, crop[1]!, crop[2]!, crop[3]!, 0, 0, c.width, c.height); return c.toDataURL('image/png').split(',')[1]!;
      }, { src: `data:image/png;base64,${(await readFile(`${output}/${variant}-golden.png`)).toString('base64')}`, crop: preset.goldenCloseCrop });
      await writeFile(`${output}/${variant}-golden-close.png`, Buffer.from(png, 'base64'));
    }
  } finally { await sheet.close(); }
  const missing = await browser.newPage();
  try {
    await missing.route('**/__local-assets/cottage-candidate-01.glb', (r) => r.fulfill({ status: 404, body: 'missing candidate fixture' }));
    await missing.goto('/?scene=cottage-ab'); await expect(missing.locator('#scene')).toHaveAttribute('data-loaded', 'true');
    await missing.selectOption('#cottage-variant', 'B'); await expect(missing.locator('#error-panel')).toContainText('原默认小屋 A 已恢复'); await expect(missing.locator('#scene')).toHaveAttribute('data-cottage-variant', 'A');
  } finally { await missing.close(); }
  await page.goto('/'); await expect(canvas).toHaveAttribute('data-loaded', 'true'); await expect(page.locator('#render-status')).toContainText('WebGL2'); await expect(canvas).toHaveAttribute('data-scene', 'blockout'); expect(await canvas.getAttribute('data-alignment')).toBeNull();
  const git = (args: string[]): Buffer => execFileSync('git', ['-c', `safe.directory=${resolve('.').replaceAll('\\', '/')}`, ...args], { windowsHide: true, maxBuffer: 80 * 1024 * 1024 });
  const sourceCommit = git(['rev-parse', 'HEAD']).toString().trim();
  const paths = git(['ls-files', 'src/world', 'src/config', 'src/character', 'art-source/parameters', 'scripts/generate_blockout.py', 'scripts/terrain_blockout.py', 'public/assets/manifests', 'public/assets/presets', 'public/assets/models', 'docs/m2.4-cottage-tripo/review-gates/P0-P1', 'docs/m2.3-cliff-section/review-gates']).toString().trim().split(/\r?\n/);
  const protection: object[] = [];
  for (const path of paths) {
    const normalize = (b: Buffer): Buffer => /\.(ts|json|py|md)$/.test(path) ? Buffer.from(b.toString().replaceAll('\r\n', '\n')) : b;
    const actual = sha(normalize(await readFile(path))); expect(actual, path).toBe(sha(normalize(git(['show', `${sourceCommit}:${path}`])))); protection.push({ path, sha256: actual });
  }
  const coast = JSON.parse(await readFile('public/assets/manifests/coastal-assembly.json', 'utf8')) as { assets: { input: string; sourceSha256: string; variants: { modelUrl: string; sha256: string }[] }[] };
  for (const a of coast.assets) for (const item of [{ path: a.input, sha256: a.sourceSha256 }, ...a.variants.filter((v) => v.modelUrl.includes('10k-1k')).map((v) => ({ path: 'public' + v.modelUrl, sha256: v.sha256 }))]) { expect(sha(await readFile(item.path)), item.path).toBe(item.sha256); protection.push(item); }
  expect(sha(await readFile(manifest.sourceFile))).toBe(manifest.sha256); expect(errors).toEqual([]); expect(warnings).toEqual([]); expect(failedRequests).toEqual([]);
  await writeFile(`${output}/runtime.json`, JSON.stringify({ phase: 'P2 only, stop for visual review; no performance optimization/P3', sourceCommit, browser: browser.version(), backend, viewport: { width: 1600, height: 811, dpr: 1 }, goldenCloseCrop: preset.goldenCloseCrop, alignment, records, pixelComparisons: comparisons, tests: { ADefault: true, lazyOriginalHD: true, fixedCamerasIdentical: true, unchangedEnvironmentBuffersAndTransforms: true, entranceAnchorAlignedWithDocumentedOffset: true, restoredA: true, AEquivalentToPriorScene: true, BDirectUrl: true, resize: true, missingBRestoresA: true, ordinaryDefaultUnchanged: true, sourceAndHistoricalEvidenceProtected: true }, protection, errors, warnings, failedRequests }, null, 2) + '\n');
});
