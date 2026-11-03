import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { PerspectiveCamera, Vector3 } from 'three';

const output = 'docs/m2.3-cliff-section/review-gates/G04-A1';
const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
type XYZ = [number, number, number];
interface Measurement { seaY: number; profiles: { x: number; y: number; a2: XYZ | null; terrain: XYZ | null; blockedFromSouth: boolean }[]; top: object[]; cuts: { id: string; segments: XYZ[][] }[]; terrainWater: XYZ[][] }
test('G04-A1 measures real A2 surfaces and captures one reversible solid at matched fixed views', async ({ page, browser }) => {
  test.setTimeout(180_000); await mkdir(output, { recursive: true });
  const errors: string[] = [], failedRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', (request) => failedRequests.push(request.url()));
  page.on('response', (response) => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.setViewportSize({ width: 1600, height: 1100 });
  const canvas = page.locator('#scene');
  const ready = async (): Promise<void> => {
    await expect(canvas).toHaveAttribute('data-loaded', 'true', { timeout: 30_000 });
    await expect(canvas).toHaveAttribute('data-rendered', 'true', { timeout: 30_000 });
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  };
  const frame = async (): Promise<void> => { await page.addStyleTag({ content: '.viewport{flex:none!important;height:811px!important}.scene-heading,.scene-footer{visibility:hidden!important}' }); await ready(); };
  await page.goto('/?scene=coastal-assembly&diagnostic=g04-a1&variant=baseline'); await frame();
  const summary = JSON.parse(await canvas.getAttribute('data-g04-summary') ?? '{}') as { openEdges: number; nonmanifoldEdges: number; degenerateTriangles: number; signedVolumeM3: number; waterSegments: XYZ[][]; topHeightRangeM: number; bounds: { min: number[]; max: number[] } };
  const measurement = JSON.parse(await canvas.getAttribute('data-g04-measurement') ?? '{}') as Measurement;
  expect(summary.openEdges).toBe(0); expect(summary.nonmanifoldEdges).toBe(0); expect(summary.degenerateTriangles).toBe(0); expect(summary.signedVolumeM3).toBeGreaterThan(3);
  expect(summary.waterSegments.length).toBeGreaterThan(10); expect(summary.topHeightRangeM).toBeGreaterThan(1); expect(summary.bounds.min[1]).toBeLessThan(-0.2);
  expect(measurement.seaY).toBe(0); expect(measurement.profiles.some((p) => p.blockedFromSouth)).toBe(true);
  expect(measurement.cuts[0]!.segments.length).toBeGreaterThan(20);
  const instances = await canvas.getAttribute('data-g04-instances');
  const backend = await canvas.evaluate((el) => { const gl = (el as HTMLCanvasElement).getContext('webgl2')!, ext = gl.getExtension('WEBGL_debug_renderer_info'); return { api: 'WebGL2', renderer: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unavailable' }; });
  const records: object[] = [];
  for (const variant of ['baseline', 'candidate']) {
    await page.selectOption('#g04-variant', variant); await ready();
    expect(JSON.parse(await canvas.getAttribute('data-g04-protection') ?? '{}')).toMatchObject({ originalA2GeometryRetained: true, originalA2MaterialsRetained: true, neighboursUnchanged: true });
    expect(await canvas.getAttribute('data-g04-instances')).toBe(instances);
    for (const view of ['golden', 'side', 'below']) {
      await page.selectOption('#g01-view', view); await ready();
      const box = await canvas.boundingBox(); expect(box?.width).toBe(1600); expect(box?.height).toBe(811);
      await canvas.screenshot({ path: `${output}/${variant}-${view}.png` });
      records.push({ variant, view, camera: JSON.parse(await canvas.getAttribute('data-g01-camera') ?? '{}') as unknown });
    }
  }
  await page.selectOption('#g04-isolated', 'true'); await ready();
  await canvas.screenshot({ path: `${output}/isolated-oblique.png` });
  await page.selectOption('#g04-isolated', 'false'); await page.selectOption('#g01-view', 'golden'); await page.selectOption('#g04-variant', 'baseline'); await ready();
  const restored = await canvas.screenshot();
  const sheet = await browser.newPage({ deviceScaleFactor: 1 });
  const img = async (path: string): Promise<string> => `data:image/png;base64,${(await readFile(path)).toString('base64')}`;
  const difference = async (a: Buffer, b: Buffer): Promise<{ changedPixels: number; maxDelta: number }> => sheet.evaluate(async (sources) => {
    const images = await Promise.all(sources.map(async (src) => { const i = new Image(); i.src = src; await i.decode(); return i; }));
    const pixels = images.map((image) => { const c = document.createElement('canvas'); c.width = image.width; c.height = image.height; const ctx = c.getContext('2d')!; ctx.drawImage(image, 0, 0); return ctx.getImageData(0, 0, c.width, c.height).data; });
    let changedPixels = 0, maxDelta = 0;
    for (let i = 0; i < pixels[0]!.length; i += 4) { let delta = 0; for (let k = 0; k < 3; k++) delta = Math.max(delta, Math.abs(pixels[0]![i + k]! - pixels[1]![i + k]!)); if (delta > 1) changedPixels++; maxDelta = Math.max(maxDelta, delta); }
    return { changedPixels, maxDelta };
  }, [a, b].map((b) => `data:image/png;base64,${b.toString('base64')}`));
  const baselineRestore = await difference(restored, await readFile(`${output}/baseline-golden.png`));
  expect(baselineRestore.changedPixels).toBe(0);
  const goldenDifference = await difference(await readFile(`${output}/baseline-golden.png`), await readFile(`${output}/candidate-golden.png`));
  expect(goldenDifference.changedPixels).toBeGreaterThan(100);
  const style = '<style>body{margin:0;padding:20px;background:#edf0e8;color:#2c4140;font-family:Microsoft YaHei,Segoe UI,sans-serif}h1{font-size:25px;margin:0 0 8px}p{font-size:17px;line-height:1.6;margin:8px 0}.row{display:grid;grid-template-columns:1fr 1fr;gap:14px}h2{font-size:19px;margin:0;padding:12px;background:#d7dfd2}svg{display:block;width:100%}</style>';
  const captions: Record<string, string> = {
    golden: '局部大面可见，整体岸线仍由旧碎岩主导：视觉收益不足，暂不建议通过。房屋与通路保留。',
    'golden-close': '可见主面与低位前脚；右肩/顶面仍被遮挡，前脚偏尖。需要结合无遮蔽图审查；未宣称造型通过。',
    side: '检查后缘接入旧 A2、顶面收进和前后厚度；原岛体与岸脚之间的旧衔接问题仍存在。',
    below: '新闭合体穿过真实 Y=0 水线，底部均在水下；海面遮住底部，需结合无遮蔽图判断。',
  };
  try {
    for (const view of ['golden', 'golden-close', 'side', 'below']) {
      const sourceView = view === 'golden-close' ? 'golden' : view, crop = view === 'golden-close' ? '750 430 540 350' : '0 0 1600 811';
      const cells = await Promise.all(['baseline', 'candidate'].map(async (variant) => `<article><h2>${variant === 'baseline' ? 'A / 原 A2 baseline' : 'B / 单块宽基座 candidate · 极简材质'}</h2><svg viewBox="${crop}"><image href="${await img(`${output}/${variant}-${sourceView}.png`)}" width="1600" height="811"/></svg></article>`));
      await sheet.setViewportSize({ width: 2200, height: view === 'golden-close' ? 860 : 760 });
      await sheet.setContent(`${style}<h1>G04-A1 / ${view} / 同机位、同光照、曝光 1、DPR1、10k/1K</h1><p>${captions[view]}</p><div class="row">${cells.join('')}</div>`);
      await sheet.evaluate(() => document.fonts.ready); await sheet.screenshot({ path: `${output}/comparison-${view}.png` });
    }
    const cameras = JSON.parse(await readFile('public/assets/presets/coastal-g01.json', 'utf8')) as { views: { golden: { position: XYZ; target: XYZ; fov: number } } };
    const camera = new PerspectiveCamera(35, 1600 / 811, 0.1, 100); camera.position.set(...cameras.views.golden.position); camera.lookAt(new Vector3(...cameras.views.golden.target)); camera.updateMatrixWorld(true);
    const project = (xyz: XYZ): string => { const p = new Vector3(...xyz).project(camera); return `${(p.x + 1) * 800},${(1 - p.y) * 405.5}`; };
    const colors = ['#9debe8', '#ed9858', '#d9a0ee', '#91cb7a'];
    const cuts = measurement.cuts.map((cut, i) => cut.segments.map((segment) => `<polyline points="${segment.map(project).join(' ')}" fill="none" stroke="${colors[i]}" stroke-width="1.2"/>`).join('')).join('');
    const topPoints = measurement.profiles.filter((p) => p.y === 1.3 && p.a2).map((p) => `<circle cx="${project(p.a2!).split(',')[0]}" cy="${project(p.a2!).split(',')[1]}" r="3" fill="#ffffff"/>`).join('');
    await sheet.setViewportSize({ width: 1800, height: 1000 });
    await sheet.setContent(`${style}<h1>G04-A1 / 建模前实际 A2 窗口测量</h1><p>真实三角面与平面相交：浅青 W / Y=0；橙 E0 / X=8.2；紫 E1 / X=11.2；绿 REAR / Z=5。白点为 Y=1.3 的南向表面射线命中。</p><p>线条含遮挡后的投影，不能当作可见剪影或已批准接缝。原地形水线在后方，窗口内多数位置没有原地形支撑列。</p><svg viewBox="750 430 540 350" style="width:1120px"><image href="${await img(`${output}/baseline-golden.png`)}" width="1600" height="811"/>${cuts}${topPoints}</svg>`);
    await sheet.evaluate(() => document.fonts.ready); await sheet.screenshot({ path: `${output}/measurement-golden-close.png` });
  } finally { await sheet.close(); }
  // Leave all old sources, binary assets, presets and review evidence intact.
  const git = (args: string[]): Buffer => execFileSync('git', ['-c', `safe.directory=${resolve('.').replaceAll('\\', '/')}`, ...args], { windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const sourceCommit = git(['rev-parse', 'HEAD']).toString().trim();
  const paths = git(['ls-files', 'public/assets', 'art-source', 'docs/m2.3-cliff-section/review-gates', 'src/world/blockout.ts', 'src/world/coastal.ts', 'src/world/cliffBoundary.ts', 'src/world/cliffBlockout.ts', 'src/world/coastalStylized.ts']).toString().trim().split(/\r?\n/);
  const protection: object[] = [];
  for (const path of paths) {
    const normalize = (b: Buffer): Buffer => /\.(json|ts|md|mjs|py)$/.test(path) ? Buffer.from(b.toString().replaceAll('\r\n', '\n')) : b;
    const actual = sha(normalize(await readFile(path))); expect(actual, path).toBe(sha(normalize(git(['show', `${sourceCommit}:${path}`])))); protection.push({ path, sha256: actual });
  }
  const manifest = JSON.parse(await readFile('public/assets/manifests/coastal-assembly.json', 'utf8')) as { assets: { input: string; sourceSha256: string; variants: { modelUrl: string; sha256: string }[] }[] };
  for (const a of manifest.assets) for (const item of [{ path: a.input, sha256: a.sourceSha256 }, ...a.variants.map((v) => ({ path: 'public' + v.modelUrl, sha256: v.sha256 }))]) { expect(sha(await readFile(item.path)), item.path).toBe(item.sha256); protection.push(item); }
  await page.goto('/?scene=coastal-assembly&diagnostic=g01&overlay=off'); await frame();
  const defaultDifference = await differenceForDefault(await canvas.screenshot(), await readFile(`${output}/baseline-golden.png`), browser);
  expect(defaultDifference).toBe(0); expect(await canvas.getAttribute('data-g04-summary')).toBeNull();
  await page.goto('/?scene=coastal-assembly&diagnostic=g03-a1&variant=cliff-blockout&markers=off'); await ready();
  expect(await canvas.getAttribute('data-g04-summary')).toBeNull();
  expect(JSON.parse(await canvas.getAttribute('data-g03-blockout') ?? '{}')).toMatchObject({ unexpectedOpenEdges: 0, degenerateTriangles: 0 });
  await page.goto('/?scene=coastal-assembly&diagnostic=g04-a1&variant=candidate'); await ready();
  for (const lod of ['20k-2k', '10k-1k']) {
    await page.selectOption('#coastal-lod', lod); await ready();
    await expect(canvas).toHaveAttribute('data-g04-variant', 'candidate');
    expect(JSON.parse(await canvas.getAttribute('data-g04-protection') ?? '{}')).toMatchObject({ originalA2GeometryRetained: true, originalA2MaterialsRetained: true, neighboursUnchanged: true });
  }
  await page.goto('/?scene=coastal-assembly&variant=candidate'); await ready(); expect(await canvas.getAttribute('data-g04-summary')).toBeNull();
  expect(errors).toEqual([]); expect(failedRequests).toEqual([]);
  await writeFile(`${output}/measurement.json`, JSON.stringify(measurement, null, 2) + '\n');
  await writeFile(`${output}/summary.json`, JSON.stringify({ stage: 'G04-A1 one reversible prototype, stop for visual review', sourceCommit, browser: browser.version(), backend, viewport: { width: 1600, height: 811, dpr: 1 }, summary, records, baselineRestore, goldenDifference, defaultBaselineIdentical: true, previousG03RouteRetained: true, lodReloadRetained: true, visualAssessment: 'global visual benefit insufficient; right shoulder/top still occluded, angular foreground foot; not accepted as final art', instances: JSON.parse(instances ?? '[]') as unknown, protection, errors, failedRequests }, null, 2) + '\n');
});

async function differenceForDefault(a: Buffer, b: Buffer, browser: import('@playwright/test').Browser): Promise<number> {
  const page = await browser.newPage();
  try { return await page.evaluate(async (sources) => {
    const images = await Promise.all(sources.map(async (src) => { const i = new Image(); i.src = src; await i.decode(); return i; }));
    const pixels = images.map((i) => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const ctx = c.getContext('2d')!; ctx.drawImage(i, 0, 0); return ctx.getImageData(0, 0, c.width, c.height).data; });
    let changed = 0; for (let i = 0; i < pixels[0]!.length; i += 4) if ([0, 1, 2].some((k) => Math.abs(pixels[0]![i + k]! - pixels[1]![i + k]!) > 1)) changed++; return changed;
  }, [a, b].map((b) => `data:image/png;base64,${b.toString('base64')}`)); } finally { await page.close(); }
}
