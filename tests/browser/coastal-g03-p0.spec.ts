import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { CliffBlockoutSummary } from '../../src/world/cliffBlockout';
import type { StylizedSummary } from '../../src/world/coastalStylized';

const output = 'docs/m2.3-cliff-section/review-gates/G03-P0';
const variants = ['neutral', 'stylized', 'tripo'] as const;
const titles = { neutral: 'A / G03-A1 neutral / A4 hidden', stylized: 'B / G03-P0 palette / A4 hidden', tripo: 'C / G02 C2 Tripo / A4 visible' };
const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
test('G03-P0 fixed three-way comparison, unobstructed views and original source protection', async ({ page, browser }) => {
  test.setTimeout(180_000); await mkdir(output, { recursive: true });
  const errors: string[] = [], failedRequests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.text()); });
  page.on('requestfailed', (r) => failedRequests.push(r.url())); page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.setViewportSize({ width: 1600, height: 1100 });
  const canvas = page.locator('#scene');
  const ready = async (): Promise<void> => { await expect(canvas).toHaveAttribute('data-loaded', 'true', { timeout: 30_000 }); await expect(canvas).toHaveAttribute('data-rendered', 'true', { timeout: 30_000 }); await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())))); };
  const fixture = async (url: string): Promise<void> => { await page.goto(url); await page.addStyleTag({ content: '.viewport{flex:none!important;height:811px!important}.scene-heading,.scene-footer{visibility:hidden!important}' }); await ready(); };
  await fixture('/?scene=coastal-assembly&diagnostic=g03-p0&variant=neutral&markers=off');
  const summary = JSON.parse(await canvas.getAttribute('data-g03-p0') ?? '{}') as StylizedSummary;
  const geometry = JSON.parse(await canvas.getAttribute('data-g03-blockout') ?? '{}') as CliffBlockoutSummary;
  expect(summary.vertices).toBe(369); expect(summary.triangles).toBe(640); expect(summary.geometryDisplacementM).toBe(0);
  for (const r of summary.regions) { expect(r.faceCount).toBeGreaterThan(30); expect(r.connectedComponents).toBe(1); }
  expect(geometry.boundaryMaxErrorM).toBeLessThan(0.000001); expect(geometry.float32BoundaryMaxErrorM).toBeLessThan(0.000001);
  for (const key of ['unexpectedOpenEdges', 'flippedTriangles', 'degenerateTriangles', 'nonmanifoldEdges'] as const) expect(geometry[key]).toBe(0);
  const approved = JSON.parse(await readFile('docs/m2.3-cliff-section/review-gates/G03-A0/summary.json', 'utf8')) as { report: object; instances: object[] };
  expect(JSON.parse(await canvas.getAttribute('data-g03-boundary') ?? '{}')).toEqual(approved.report);
  const instances = await canvas.getAttribute('data-g03-instances'), neighbours = await canvas.getAttribute('data-g03-neighbours');
  expect(JSON.parse(instances ?? '[]')).toEqual(approved.instances);
  const backend = await canvas.evaluate((el) => { const gl = (el as HTMLCanvasElement).getContext('webgl2')!; const ext = gl.getExtension('WEBGL_debug_renderer_info'); return { api: 'WebGL2', renderer: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unavailable' }; });
  const records: object[] = [];
  for (const variant of variants) {
    await page.selectOption('#g03-p0-variant', variant); await ready();
    await expect(canvas).toHaveAttribute('data-g03-variant', variant); expect(new URL(page.url()).searchParams.get('variant')).toBe(variant);
    expect(JSON.parse(await canvas.getAttribute('data-g03-protection') ?? '{}')).toEqual({ sourceGeometryRetained: true, sourceMaterialRetained: true, attributesUnchanged: true, indicesUnchanged: true, subjectTransformUnchanged: true, subjectVisible: variant === 'tripo', originalQueryNodeRetained: true });
    expect(await canvas.getAttribute('data-g03-instances')).toBe(instances); expect(await canvas.getAttribute('data-g03-neighbours')).toBe(neighbours);
    for (const view of ['golden', 'side', 'below']) {
      await page.selectOption('#g01-view', view); await ready(); const box = await canvas.boundingBox(); expect(box?.width).toBe(1600); expect(box?.height).toBe(811);
      await canvas.screenshot({ path: `${output}/${variant}-${view}.png` }); records.push({ variant, view, camera: JSON.parse(await canvas.getAttribute('data-g01-camera') ?? '{}') as unknown });
    }
  }
  await page.selectOption('#g03-p0-variant', 'neutral'); await page.selectOption('#g03-geometry-only', 'true');
  for (const variant of ['neutral', 'stylized']) {
    await page.selectOption('#g03-p0-variant', variant);
    for (const view of ['golden', 'side']) { await page.selectOption('#g01-view', view); await ready(); await canvas.screenshot({ path: `${output}/isolated-${variant}-${view}.png` }); }
  }
  await page.selectOption('#g03-geometry-only', 'false'); await page.selectOption('#g01-view', 'golden');
  const sheet = await browser.newPage({ deviceScaleFactor: 1 });
  const comparisons: { label: string; changedPixels: number; maxChannelDelta: number }[] = [];
  try {
    const compare = async (a: Buffer, b: Buffer, label: string): Promise<void> => {
      const result = await sheet.evaluate(async (sources) => {
        const images = await Promise.all(sources.map((src) => new Promise<HTMLImageElement>((done) => { const img = new Image(); img.onload = () => done(img); img.src = src; })));
        const data = images.map((img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0); return ctx.getImageData(0, 0, img.width, img.height).data; });
        let changedPixels = 0, maxChannelDelta = 0;
        for (let i = 0; i < data[0]!.length; i += 4) { let delta = 0; for (let j = 0; j < 3; j++) delta = Math.max(delta, Math.abs(data[0]![i + j]! - data[1]![i + j]!)); if (delta) changedPixels++; maxChannelDelta = Math.max(maxChannelDelta, delta); }
        return { changedPixels, maxChannelDelta };
      }, [a, b].map((b) => `data:image/png;base64,${b.toString('base64')}`));
      expect(result.changedPixels, label).toBeLessThanOrEqual(20); expect(result.maxChannelDelta, label).toBeLessThanOrEqual(1); comparisons.push({ label, ...result });
    };
    for (const variant of ['neutral', 'tripo']) { await page.selectOption('#g03-p0-variant', variant); await ready(); await compare(await canvas.screenshot(), await readFile(`${output}/${variant}-golden.png`), `${variant} restored`); }
    await fixture('/?scene=coastal-assembly&diagnostic=g03-a1&variant=cliff-blockout&markers=off');
    expect(await canvas.getAttribute('data-g03-p0')).toBeNull();
    await compare(await canvas.screenshot(), await readFile(`${output}/neutral-golden.png`), 'P0 neutral = retained A1 route');
    await fixture('/?scene=coastal-assembly&diagnostic=g02&candidate=C2');
    await compare(await canvas.screenshot(), await readFile(`${output}/tripo-golden.png`), 'P0 Tripo = retained C2 route');
    await fixture('/?scene=coastal-assembly&diagnostic=g03-p0&variant=tripo&geometryOnly=true&markers=off');
    await expect(page.locator('#g03-geometry-only')).toBeDisabled();
    await expect(page.locator('#g03-geometry-only')).toHaveValue('false');
    await compare(await canvas.screenshot(), await readFile(`${output}/tripo-golden.png`), 'Tripo URL cannot select empty isolated surface');
    await page.selectOption('#g03-p0-variant', 'stylized'); await page.selectOption('#g03-geometry-only', 'true'); await ready();
    await page.selectOption('#g03-p0-variant', 'tripo'); await ready();
    await expect(page.locator('#g03-geometry-only')).toHaveValue('false');
    await compare(await canvas.screenshot(), await readFile(`${output}/tripo-golden.png`), 'Tripo restores complete scene after isolated variant');
    const style = '<style>body{margin:0;padding:18px;background:#edf0e8;font-family:Segoe UI;color:#243d33}h1{font-size:22px;margin:0 0 8px}p{font-size:16px;margin:0 0 12px}.row{display:grid;gap:12px}h2{font-size:18px;margin:0;padding:10px;background:#d5ddcf}svg{display:block;width:100%}</style>';
    for (const view of ['golden', 'golden-close', 'side', 'below']) {
      const sourceView = view === 'golden-close' ? 'golden' : view, crop = view === 'golden-close' ? '750 430 540 350' : '0 0 1600 811';
      const cells = await Promise.all(variants.map(async (v) => `<article><h2>${titles[v]}</h2><svg viewBox="${crop}"><image href="data:image/png;base64,${(await readFile(`${output}/${v}-${sourceView}.png`)).toString('base64')}" width="1600" height="811"/></svg></article>`));
      await sheet.setViewportSize({ width: 2400, height: view === 'golden-close' ? 680 : 530 });
      await sheet.setContent(`${style}<h1>G03-P0 / ${view} / fixed camera, light, exposure1, crop, DPR1, 10k/1K</h1><p>A and B: same geometry and visibility. Other four Tripo rocks remain visible in all three views. C restores A4.</p><div class="row" style="grid-template-columns:repeat(3,1fr)">${cells.join('')}</div>`);
      await sheet.screenshot({ path: `${output}/comparison-${view}.png` });
    }
    for (const view of ['golden', 'side']) {
      const crop = view === 'golden' ? '930 460 180 180' : '670 340 220 260';
      const cells = await Promise.all(['neutral', 'stylized'].map(async (v) => `<article><h2>${v} / isolated A1 geometry / crop ${crop}</h2><svg viewBox="${crop}"><image href="data:image/png;base64,${(await readFile(`${output}/isolated-${v}-${view}.png`)).toString('base64')}" width="1600" height="811"/></svg></article>`));
      await sheet.setViewportSize({ width: 1400, height: view === 'golden' ? 840 : 960 });
      await sheet.setContent(`${style}<h1>G03-P0 / unobstructed ${view} / identical mesh, camera, lights / no rocks or terrain</h1><p>Only material/color changes. This isolated view cannot prove integration with neighboring Tripo assets.</p><div class="row" style="grid-template-columns:1fr 1fr">${cells.join('')}</div>`);
      await sheet.screenshot({ path: `${output}/comparison-isolated-${view}.png` });
    }
  } finally { await sheet.close(); }
  const protection: { path: string; sha256: string }[] = [];
  const git = (args: string[]): Buffer => execFileSync('git', ['-c', `safe.directory=${resolve('.').replaceAll('\\', '/')}`, ...args], { windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const sourceCommit = git(['rev-parse', 'HEAD']).toString().trim();
  const paths = git(['ls-files', 'scripts/terrain_blockout.py', 'scripts/generate_blockout.py', 'src/world', 'src/character', 'src/config', 'art-source/parameters', 'public/assets/presets', 'public/assets/models', 'docs/m2.3-cliff-section/review-gates/G03-A0', 'docs/m2.3-cliff-section/review-gates/G03-A1', 'docs/references/golden-reference-v1.png']).toString().trim().split(/\r?\n/);
  for (const path of paths) {
    const normalize = (b: Buffer): Buffer => /\.(json|ts|py)$/.test(path) ? Buffer.from(b.toString().replaceAll('\r\n', '\n')) : b;
    const actual = sha(normalize(await readFile(path))); expect(actual, path).toBe(sha(normalize(git(['show', `${sourceCommit}:${path}`])))); protection.push({ path, sha256: actual });
  }
  const manifest = JSON.parse(await readFile('public/assets/manifests/coastal-assembly.json', 'utf8')) as { assets: { input: string; sourceSha256: string; variants: { modelUrl: string; sha256: string }[] }[] };
  for (const a of manifest.assets) for (const item of [{ path: a.input, sha256: a.sourceSha256 }, ...a.variants.map((v) => ({ path: 'public' + v.modelUrl, sha256: v.sha256 }))]) { expect(sha(await readFile(item.path)), item.path).toBe(item.sha256); protection.push(item); }
  for (const diagnostic of ['g03-a0', 'g021', 'g022']) { await page.goto(`/?scene=coastal-assembly&diagnostic=${diagnostic}`); await ready(); expect(await canvas.getAttribute('data-g03-p0')).toBeNull(); }
  await page.goto('/?scene=coastal-assembly&variant=stylized'); await ready(); expect(await canvas.getAttribute('data-g03-p0')).toBeNull(); expect(await canvas.getAttribute('data-g03-blockout')).toBeNull();
  const original = JSON.parse(await readFile('docs/m2.2-coastal-assembly/review-gates/G01/original-runtime.json', 'utf8')) as { bounds: object[] };
  expect(JSON.parse(await canvas.getAttribute('data-world-bounds') ?? '[]')).toEqual(original.bounds);
  expect(errors).toEqual([]); expect(failedRequests).toEqual([]);
  await writeFile(`${output}/summary.json`, JSON.stringify({ stage: 'G03-P0 feasibility only; stop for human review; no G03-B', sourceCommit, browser: browser.version(), backend, viewport: { width: 1600, height: 811, dpr: 1 }, goldenCloseCrop: [750, 430, 540, 350], isolatedCrops: { golden: [930, 460, 180, 180], side: [670, 340, 220, 260] }, summary, geometry, instances: JSON.parse(instances ?? '[]') as unknown, neighbours: JSON.parse(neighbours ?? '[]') as unknown, visibility: titles, records, pixelComparisons: comparisons, protection, ordinarySceneUnchanged: true, errors, failedRequests }, null, 2) + '\n');
});
