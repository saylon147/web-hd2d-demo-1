import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { CliffBoundaryReport } from '../../src/world/cliffBoundary';

const output = 'docs/m2.3-cliff-section/review-gates/G03-A0';
const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
test('G03-A0 extracts only original boundaries and captures fixed marked views', async ({ page, browser }) => {
  test.setTimeout(180_000); await mkdir(output, { recursive: true });
  const errors: string[] = [], failedRequests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.text()); });
  page.on('requestfailed', (r) => failedRequests.push(r.url())); page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.setViewportSize({ width: 1600, height: 1100 });
  const canvas = page.locator('#scene');
  const style = '.viewport{flex:none!important;height:811px!important}.scene-heading,.scene-footer{visibility:hidden!important}';
  const ready = async (): Promise<void> => { await expect(canvas).toHaveAttribute('data-loaded', 'true', { timeout: 30_000 }); await expect(canvas).toHaveAttribute('data-rendered', 'true', { timeout: 30_000 }); await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())))); };
  await page.goto('/?scene=coastal-assembly&diagnostic=g02&candidate=C2&overlay=off'); await page.addStyleTag({ content: style }); await ready();
  const baseline = await canvas.screenshot(), baselineCamera = await canvas.getAttribute('data-g01-camera');
  await page.goto('/?scene=coastal-assembly&diagnostic=g03-a0&markers=off'); await page.addStyleTag({ content: style }); await ready();
  expect(await canvas.getAttribute('data-g01-camera')).toBe(baselineCamera);
  const unmarked = await canvas.screenshot();
  const report = JSON.parse(await canvas.getAttribute('data-g03-boundary') ?? '{}') as CliffBoundaryReport;
  expect(report.checks.sufficientForA1).toBe(true); expect(report.rimLengthM).toBeGreaterThan(2); expect(report.rimLengthM).toBeLessThan(4);
  expect(await canvas.getAttribute('data-replacement-summary')).toBeNull(); expect(await canvas.getAttribute('data-fusion-summary')).toBeNull();
  const instances = JSON.parse(await canvas.getAttribute('data-g03-instances') ?? '[]') as object[];
  const prior = JSON.parse(await readFile('docs/m2.2-coastal-assembly/review-gates/G022/summary.json', 'utf8')) as { instances: object[] };
  expect(instances).toEqual(prior.instances);
  const checkPage = await browser.newPage({ deviceScaleFactor: 1 });
  const compare = async (buffers: Buffer[]): Promise<{ changedPixels: number; maxChannelDelta: number }> => checkPage.evaluate(async (sources) => {
    const images = await Promise.all(sources.map((src) => new Promise<HTMLImageElement>((done) => { const img = new Image(); img.onload = () => done(img); img.src = src; })));
    const data = images.map((img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0); return ctx.getImageData(0, 0, img.width, img.height).data; });
    let changedPixels = 0, maxChannelDelta = 0;
    for (let i = 0; i < data[0]!.length; i += 4) { let delta = 0; for (let j = 0; j < 3; j++) delta = Math.max(delta, Math.abs(data[0]![i + j]! - data[1]![i + j]!)); if (delta) changedPixels++; maxChannelDelta = Math.max(maxChannelDelta, delta); }
    return { changedPixels, maxChannelDelta };
  }, buffers.map((b) => `data:image/png;base64,${b.toString('base64')}`));
  let baselineComparison: Awaited<ReturnType<typeof compare>>, restoredComparison: Awaited<ReturnType<typeof compare>>;
  try {
    baselineComparison = await compare([baseline, unmarked]); expect(baselineComparison.changedPixels).toBeLessThanOrEqual(20); expect(baselineComparison.maxChannelDelta).toBeLessThanOrEqual(1);
    await page.selectOption('#g03-markers', 'on'); await ready();
    await expect(page.locator('.g03-boundary-overlay')).toBeVisible();
    const backend = await canvas.evaluate((el) => { const gl = (el as HTMLCanvasElement).getContext('webgl2')!; const ext = gl.getExtension('WEBGL_debug_renderer_info'); return { api: 'WebGL2', renderer: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unavailable' }; });
    const records: object[] = [];
    for (const view of ['golden', 'side', 'below']) {
      await page.selectOption('#g01-view', view); await ready();
      const box = await canvas.boundingBox(); expect(box?.width).toBe(1600); expect(box?.height).toBe(811);
      await page.locator('.viewport').screenshot({ path: `${output}/boundary-${view}.png` });
      records.push({ view, camera: JSON.parse(await canvas.getAttribute('data-g01-camera') ?? '{}') as unknown, crop: [0, 0, 1600, 811] });
      if (view === 'golden') {
        await page.screenshot({ path: `${output}/boundary-golden-close.png`, clip: { x: box!.x + 750, y: box!.y + 430, width: 540, height: 350 } });
        records.push({ view: 'golden-close', camera: JSON.parse(await canvas.getAttribute('data-g01-camera') ?? '{}') as unknown, crop: [750, 430, 540, 350], sameCameraAsGolden: true });
      }
    }
    await page.selectOption('#g01-view', 'golden'); await ready(); await page.selectOption('#g03-markers', 'off'); await ready();
    await expect(page.locator('.g03-boundary-overlay')).toBeHidden();
    restoredComparison = await compare([unmarked, await canvas.screenshot()]); expect(restoredComparison.changedPixels).toBeLessThanOrEqual(20); expect(restoredComparison.maxChannelDelta).toBeLessThanOrEqual(1);
    // The overlay follows the original renderer through resize and visibility changes.
    await page.selectOption('#g03-markers', 'on'); await page.setViewportSize({ width: 900, height: 1100 }); await ready();
    await expect(page.locator('.g03-boundary-overlay svg')).toHaveAttribute('width', '900');
    await page.locator('.viewport').evaluate((el) => { (el as HTMLElement).style.display = 'none'; });
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
    await page.locator('.viewport').evaluate((el) => { (el as HTMLElement).style.display = ''; }); await ready();
    await expect(page.locator('.g03-boundary-overlay svg')).toHaveAttribute('width', '900');
    expect(await page.locator('.g03-boundary-overlay svg').innerHTML()).not.toContain('NaN');
    await page.setViewportSize({ width: 1600, height: 1100 }); await ready();
    const protection = [];
    const git = (args: string[]): Buffer => execFileSync('git', ['-c', `safe.directory=${resolve('.').replaceAll('\\', '/')}`, ...args], { windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    const sourceCommit = git(['rev-parse', 'HEAD']).toString().trim();
    for (const path of ['scripts/terrain_blockout.py', 'scripts/generate_blockout.py', 'src/world/blockout.ts', 'src/world/coastal.ts', 'src/world/coastalFusion.ts', 'src/world/coastalReplacement.ts', 'art-source/parameters/island_cottage_v2.json', 'public/assets/models/island_cottage_blockout_v2.glb', 'public/assets/manifests/coastal-assembly.json', ...['assembly', 'g01', 'g02', 'g021', 'g022'].map((id) => `public/assets/presets/coastal-${id}.json`)]) {
      const normalize = (b: Buffer): Buffer => /\.(json|ts|py)$/.test(path) ? Buffer.from(b.toString().replaceAll('\r\n', '\n')) : b;
      const before = sha(normalize(git(['show', `${sourceCommit}:${path}`]))), after = sha(normalize(await readFile(path))); expect(after, path).toBe(before); protection.push({ path, sha256: after });
    }
    const manifest = JSON.parse(await readFile('public/assets/manifests/coastal-assembly.json', 'utf8')) as { assets: { input: string; sourceSha256: string; variants: { modelUrl: string; sha256: string }[] }[] };
    for (const a of manifest.assets) for (const item of [{ path: a.input, sha256: a.sourceSha256 }, ...a.variants.map((v) => ({ path: 'public' + v.modelUrl, sha256: v.sha256 }))]) { expect(sha(await readFile(item.path)), item.path).toBe(item.sha256); protection.push(item); }
    const reference = await readFile('docs/references/golden-reference-v1.png'); expect(sha(reference)).toBe('6d538a42441a2c9b5b2e6736522687fa85aef08b8d87e1a71b0fa3ec2a1e61e3');
    for (const [diagnostic, variant, attribute] of [['g021', 'geometry', 'data-fusion-variant'], ['g022', 'replacement', 'data-replacement-variant']] as const) {
      await page.goto(`/?scene=coastal-assembly&diagnostic=${diagnostic}&variant=${variant}`); await ready(); await expect(canvas).toHaveAttribute(attribute, variant); expect(await canvas.getAttribute('data-g03-boundary')).toBeNull(); await expect(page.locator('.g03-boundary-overlay')).toHaveCount(0);
    }
    await page.goto('/?scene=coastal-assembly&diagnostic=g01'); await ready(); await expect(canvas).toHaveAttribute('data-g01-report', /.+/); expect(await canvas.getAttribute('data-g03-boundary')).toBeNull();
    await page.goto('/?scene=coastal-assembly&variant=replacement&markers=on'); await ready(); expect(await canvas.getAttribute('data-g03-boundary')).toBeNull(); expect(await canvas.getAttribute('data-replacement-summary')).toBeNull();
    const original = JSON.parse(await readFile('docs/m2.2-coastal-assembly/review-gates/G01/original-runtime.json', 'utf8')) as { bounds: object[] };
    expect(JSON.parse(await canvas.getAttribute('data-world-bounds') ?? '[]')).toEqual(original.bounds);
    expect(errors).toEqual([]); expect(failedRequests).toEqual([]);
    await writeFile(`${output}/summary.json`, JSON.stringify({ stage: 'G03-A0 only; stop for human review', sourceCommit, browser: browser.version(), backend, viewport: { width: 1600, height: 811, dpr: 1 }, parameters: JSON.parse(await readFile('public/assets/presets/coastal-g03-a0.json', 'utf8')) as unknown, report, instances, records, baselineComparison, restoredComparison, protection, goldenReferenceSha256: sha(reference), resizeAndHiddenRestore: true, previousRoutesRetained: true, ordinarySceneUnchanged: true, errors, failedRequests }, null, 2) + '\n');
  } finally { await checkPage.close(); }
});
