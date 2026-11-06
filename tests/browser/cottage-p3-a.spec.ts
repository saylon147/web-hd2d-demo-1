import { expect, test } from '@playwright/test';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { COTTAGE_CALIBRATION_VARIANTS, COTTAGE_CALIBRATION_VIEWS } from '../../src/config/cottageCalibration';
import type { CottageManifest } from '../../src/config/cottageCandidate';

const output = 'docs/m2.4-cottage-tripo/review-gates/P3-A';
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
interface CandidateMeasurement {
  relativeScale: number; uniformScale: number; position: number[]; dimensions: number[]; yawDegrees: number;
  basePlaneY: number; door: number[]; frontBaseToEdgeM: number;
  groundContact: { sampleCount: number; contact: number; gaps: number; embedded: number; noSupport: number; maxGapM: number; maxEmbeddingM: number };
  conflicts: { name: string; enclosedCandidateVertices: number }[];
  constraints: string[];
}
interface CalibrationSummary {
  sourceSha256: string;
  sourceBase: { lowestY: number; planeY: number; planeArea: number; triangleCount: number; samples: number[][]; gridCoverage: number };
  originalP2: { protectedEnvironmentUnchanged: boolean; uniformScale: number; position: number[] };
  variants: Record<'B0' | 'B1' | 'B2' | 'B3', CandidateMeasurement>;
}

test('P3-A five fixed scale candidates, source geometry contact and immutable P2 evidence', async ({ page, browser }) => {
  test.setTimeout(240_000);
  const manifest = JSON.parse(await readFile('public/assets/manifests/cottage-candidate-01.json', 'utf8')) as CottageManifest;
  test.skip(!await access(manifest.sourceFile).then(() => true, () => false), 'Local original HD cottage is required');
  const git = (args: string[]): Buffer => execFileSync('git', ['-c', `safe.directory=${resolve('.').replaceAll('\\', '/')}`, ...args], { windowsHide: true, maxBuffer: 80 * 1024 * 1024 });
  const sourceCommit = git(['rev-parse', 'HEAD']).toString().trim();
  const protectedPaths = git(['ls-files', 'src/world', 'src/config', 'src/character', 'src/app/CottageComparisonApplication.ts', 'src/app/CottageApplication.ts', 'src/style.css',
    'art-source/parameters', 'art-source/tripo/cottage-candidate-01.json', 'scripts/generate_blockout.py', 'scripts/terrain_blockout.py', 'scripts/local_cottage_asset.ts',
    'public/assets/manifests', 'public/assets/presets', 'public/assets/models', 'docs/m2.4-cottage-tripo/review-gates/P0-P1', 'docs/m2.4-cottage-tripo/review-gates/P2', 'docs/m2.3-cliff-section/review-gates']).toString().trim().split(/\r?\n/);
  const protection: object[] = [];
  for (const path of protectedPaths) {
    const normalize = (b: Buffer): Buffer => /\.(ts|json|py|md)$/.test(path) ? Buffer.from(b.toString().replaceAll('\r\n', '\n')) : b;
    const sha256 = hash(normalize(await readFile(path)));
    expect(sha256, path).toBe(hash(normalize(git(['show', `${sourceCommit}:${path}`])))); protection.push({ path, sha256 });
  }
  expect(hash(await readFile(manifest.sourceFile))).toBe(manifest.sha256);
  await mkdir(output, { recursive: true });
  const errors: string[] = [], warnings: string[] = [], failedRequests: string[] = [], hdRequests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning') warnings.push(m.text()); });
  page.on('requestfailed', (r) => failedRequests.push(r.url()));
  page.on('request', (r) => { if (r.url().includes('/__local-assets/')) hdRequests.push(r.url()); });
  await page.setViewportSize({ width: 1600, height: 1000 });
  const canvas = page.locator('#scene');
  const ready = async (): Promise<void> => {
    await expect(canvas).toHaveAttribute('data-loaded', 'true', { timeout: 90_000 });
    await expect(canvas).toHaveAttribute('data-rendered', 'true', { timeout: 90_000 });
  };
  const fixture = async (url: string): Promise<void> => {
    await page.goto(url);
    await page.addStyleTag({ content: '.viewport{flex:none!important;height:811px!important}.scene-heading,.scene-footer{visibility:hidden!important}' });
    await ready();
  };
  await fixture('/?scene=cottage-calibration');
  await expect(canvas).toHaveAttribute('data-cottage-variant', 'A'); expect(hdRequests).toEqual([]);
  const previous = JSON.parse(await readFile('docs/m2.4-cottage-tripo/review-gates/P2/runtime.json', 'utf8')) as { records: { variant: string; view: string; camera: unknown }[]; goldenCloseCrop: [number, number, number, number] };
  const cameras = new Map<string, string>(), records: object[] = [], pixelComparisons: object[] = [];
  const sheet = await browser.newPage({ deviceScaleFactor: 1 });
  const comparePixels = async (a: Buffer, b: Buffer, label: string): Promise<void> => {
    const comparison = await sheet.evaluate(async (sources) => {
      const data = await Promise.all(sources.map((src) => new Promise<Uint8ClampedArray>((done) => {
        const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
          const context = c.getContext('2d')!; context.drawImage(img, 0, 0); done(context.getImageData(0, 0, c.width, c.height).data); }; img.src = src;
      })));
      let changedPixels = 0, maxChannelDelta = 0;
      for (let i = 0; i < data[0]!.length; i += 4) { let delta = 0;
        for (let k = 0; k < 3; k++) delta = Math.max(delta, Math.abs(data[0]![i + k]! - data[1]![i + k]!));
        if (delta) changedPixels++; maxChannelDelta = Math.max(maxChannelDelta, delta);
      }
      return { changedPixels, maxChannelDelta };
    }, [a, b].map((b) => `data:image/png;base64,${b.toString('base64')}`));
    expect(comparison.changedPixels, label).toBeLessThanOrEqual(20); expect(comparison.maxChannelDelta, label).toBeLessThanOrEqual(1);
    pixelComparisons.push({ label, ...comparison });
  };
  try {
    for (const variant of COTTAGE_CALIBRATION_VARIANTS) {
      await page.selectOption('#cottage-variant', variant); await ready();
      await expect(canvas).toHaveAttribute('data-cottage-variant', variant);
      for (const view of COTTAGE_CALIBRATION_VIEWS) {
        await page.click(`[data-cottage-p3-view="${view}"]`); await ready();
        const camera = await canvas.getAttribute('data-camera') ?? '';
        if (variant === 'A') {
          cameras.set(view, camera);
          expect(JSON.parse(camera) as unknown).toEqual(previous.records.find((r) => r.variant === 'A' && r.view === view)!.camera);
        } else expect(camera, `${variant}/${view} unchanged camera`).toBe(cameras.get(view));
        const png = await canvas.screenshot({ path: `${output}/${variant}-${view}.png` });
        if (variant === 'A' || variant === 'B0') await comparePixels(png, await readFile(`docs/m2.4-cottage-tripo/review-gates/P2/${variant === 'A' ? 'A' : 'B'}-${view}.png`), `${variant}/${view} matches immutable P2`);
        records.push({ variant, view, camera: JSON.parse(camera) as unknown });
      }
    }
    expect(hdRequests).toHaveLength(1);
    const calibration = JSON.parse(await canvas.getAttribute('data-alignment') ?? '{}') as CalibrationSummary;
    expect(calibration.sourceSha256).toBe(manifest.sha256);
    expect(calibration.originalP2.protectedEnvironmentUnchanged).toBe(true);
    expect(calibration.sourceBase.lowestY).toBeCloseTo(0, 7);
    expect(calibration.sourceBase.planeY).toBeGreaterThan(calibration.sourceBase.lowestY + 0.0005);
    expect(calibration.sourceBase.planeArea).toBeGreaterThan(0.4); expect(calibration.sourceBase.gridCoverage).toBeGreaterThan(0.9);
    expect(calibration.variants.B0.position).toEqual(calibration.originalP2.position);
    for (const [i, variant] of (['B0', 'B1', 'B2', 'B3'] as const).entries()) {
      const m = calibration.variants[variant], relative = [1, 1.15, 1.25, 1.35][i]!;
      expect(m.relativeScale).toBe(relative); expect(m.uniformScale).toBeCloseTo(calibration.originalP2.uniformScale * relative, 8);
      m.dimensions.forEach((value, axis) => expect(value).toBeCloseTo(calibration.variants.B0.dimensions[axis]! * relative, 6));
      expect(m.yawDegrees).toBe(0); expect(m.groundContact.sampleCount).toBe(calibration.sourceBase.samples.length);
      expect(m.constraints.length).toBeGreaterThan(0); // The untouched platform/void prevents full acceptance; do not hide this result.
      if (variant !== 'B0') { expect(m.basePlaneY).toBeCloseTo(4, 8); expect(m.groundContact.embedded).toBe(0); }
    }
    expect(calibration.variants.B3.frontBaseToEdgeM).toBeLessThan(calibration.variants.B1.frontBaseToEdgeM);
    await page.selectOption('#cottage-variant', 'A'); await page.click('[data-cottage-p3-view="golden"]'); await ready();
    await comparePixels(await canvas.screenshot(), await readFile(`${output}/A-golden.png`), 'A restores after all scale candidates');
    await page.selectOption('#cottage-variant', 'B0'); await ready();
    await comparePixels(await canvas.screenshot(), await readFile(`${output}/B0-golden.png`), 'B0 restores after B3');
    const backend = await canvas.evaluate((el) => { const gl = (el as HTMLCanvasElement).getContext('webgl2')!, ext = gl.getExtension('WEBGL_debug_renderer_info'); return { api: 'WebGL2', renderer: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unavailable' }; });
    const style = '<style>body{margin:0;padding:18px;background:#edf0e8;font:18px Segoe UI;color:#27372e}h1{font-size:25px;margin:0 0 8px}p{margin:0 0 12px}h2{font-size:20px;margin:0;padding:9px;background:#d5ddcf}.row{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}img{display:block;width:100%}.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.grid h2{font-size:15px}</style>';
    const labels = { A: 'original', B0: 'P2 / 1x', B1: '1.15x', B2: '1.25x', B3: '1.35x' };
    const imageCell = async (variant: typeof COTTAGE_CALIBRATION_VARIANTS[number], view: string): Promise<string> => `<article><h2>${variant} / ${labels[variant]}</h2><img src="data:image/png;base64,${(await readFile(`${output}/${variant}-${view}.png`)).toString('base64')}"></article>`;
    for (const variant of COTTAGE_CALIBRATION_VARIANTS) {
      const crop = await sheet.evaluate(async ({ src, crop }) => {
        const img = await new Promise<HTMLImageElement>((done) => { const image = new Image(); image.onload = () => done(image); image.src = src; });
        const c = document.createElement('canvas'); c.width = crop[2]; c.height = crop[3];
        c.getContext('2d')!.drawImage(img, ...crop, 0, 0, c.width, c.height); return c.toDataURL('image/png').split(',')[1]!;
      }, { src: `data:image/png;base64,${(await readFile(`${output}/${variant}-golden.png`)).toString('base64')}`, crop: previous.goldenCloseCrop });
      await writeFile(`${output}/${variant}-golden-close.png`, Buffer.from(crop, 'base64'));
    }
    for (const view of [...COTTAGE_CALIBRATION_VIEWS, 'golden-close']) {
      await sheet.setViewportSize({ width: 3000, height: view === 'golden-close' ? 660 : 520 });
      await sheet.setContent(`${style}<h1>M2.4 P3-A / ${view} / uniform scale calibration</h1><p>Identical P2 camera / island / stairs / rocks / trees / light / exposure 1 / DPR 1. Golden-close uses identical pixel crop. No asset optimization.</p><div class="row">${(await Promise.all(COTTAGE_CALIBRATION_VARIANTS.map((v) => imageCell(v, view)))).join('')}</div>`);
      await sheet.screenshot({ path: `${output}/comparison-${view}.png` });
    }
    await sheet.setViewportSize({ width: 2200, height: 1260 });
    await sheet.setContent(`${style}<h1>M2.4 P3-A / overview / Golden-close, top, front contact</h1><p>All five candidates retained. Bottom spill, original stair guard and approach limits remain visible for review.</p><div class="grid">${(await Promise.all(['golden-close', 'top', 'contact-front'].flatMap((view) => COTTAGE_CALIBRATION_VARIANTS.map((v) => imageCell(v, view))))).join('')}</div>`);
    await sheet.screenshot({ path: `${output}/overview.png` });
    await fixture('/?scene=cottage-calibration&cottage=B1&view=front'); await expect(canvas).toHaveAttribute('data-cottage-variant', 'B1');
    await page.addStyleTag({ content: '.scene-heading,.scene-footer{visibility:visible!important}' });
    await page.screenshot({ path: `${output}/viewer-ui.png` });
    await page.setViewportSize({ width: 390, height: 844 }); await ready();
    const mobile = await canvas.boundingBox(); expect(mobile!.width).toBe(390);
    const mobileCamera = JSON.parse(await canvas.getAttribute('data-camera') ?? '{}') as { aspect: number };
    expect(mobileCamera.aspect).toBeCloseTo(mobile!.width / mobile!.height, 5);
    await page.goto('/'); await expect(canvas).toHaveAttribute('data-loaded', 'true'); await expect(canvas).toHaveAttribute('data-scene', 'blockout');
    expect(await canvas.getAttribute('data-alignment')).toBeNull();
    expect(errors).toEqual([]); expect(warnings).toEqual([]); expect(failedRequests).toEqual([]);
    expect(hash(await readFile(manifest.sourceFile))).toBe(manifest.sha256);
    await writeFile(`${output}/runtime.json`, JSON.stringify({ phase: 'P3-A calibration only; stop for human review', sourceCommit, browser: browser.version(), backend,
      viewport: { width: 1600, height: 811, dpr: 1 }, exposure: 1, goldenCloseCrop: previous.goldenCloseCrop, calibration, records, pixelComparisons, protection, errors, warnings, failedRequests,
      tests: { fiveCandidates: true, uniformScale: true, sourceBaseMeasured: true, independentPlacement: true, sameP2Cameras: true, AAndB0PixelEquivalentToP2: true, restoresAAndB0: true,
        lazyHD: true, directB1Url: true, resize: true, ordinaryDefaultPreserved: true, sourceAndHistoricalEvidencePreserved: true }, visualAcceptance: 'pending; all candidates retain reported contact/obstacle constraints' }, null, 2) + '\n');
  } finally { await sheet.close(); }
});

test('P3-A rapid selection cancels stale B, retries missing asset and releases on navigation', async ({ page }) => {
  test.setTimeout(120_000);
  const manifest = JSON.parse(await readFile('public/assets/manifests/cottage-candidate-01.json', 'utf8')) as CottageManifest;
  test.skip(!await access(manifest.sourceFile).then(() => true, () => false), 'Local original HD cottage is required');
  await page.route('**/__local-assets/cottage-candidate-01.glb', async (route) => {
    await new Promise<void>((done) => setTimeout(done, 250)); await route.continue();
  });
  await page.goto('/?scene=cottage-calibration'); const canvas = page.locator('#scene');
  await expect(canvas).toHaveAttribute('data-loaded', 'true');
  await page.selectOption('#cottage-variant', 'B3'); await page.selectOption('#cottage-variant', 'A');
  await expect(canvas).toHaveAttribute('data-cottage-variant', 'A');
  await page.selectOption('#cottage-variant', 'B2'); await expect(canvas).toHaveAttribute('data-cottage-variant', 'B2', { timeout: 90_000 });
  await page.goto('/?scene=cottage-calibration'); await expect(canvas).toHaveAttribute('data-loaded', 'true');
  await page.unroute('**/__local-assets/cottage-candidate-01.glb');
  await page.route('**/__local-assets/cottage-candidate-01.glb', (route) => route.fulfill({ status: 404, body: 'P3-A missing source fixture' }));
  await page.selectOption('#cottage-variant', 'B1'); await expect(page.locator('#error-panel')).toContainText('原默认小屋 A 已恢复');
  await expect(canvas).toHaveAttribute('data-cottage-variant', 'A');
  await page.unroute('**/__local-assets/cottage-candidate-01.glb');
  await page.selectOption('#cottage-variant', 'B1'); await expect(canvas).toHaveAttribute('data-cottage-variant', 'B1', { timeout: 90_000 });
  await expect(page.locator('#error-panel')).toBeHidden();
  await page.goto('/?scene=cottage-ab'); await expect(canvas).toHaveAttribute('data-loaded', 'true'); await expect(canvas).toHaveAttribute('data-cottage-variant', 'A');
});
