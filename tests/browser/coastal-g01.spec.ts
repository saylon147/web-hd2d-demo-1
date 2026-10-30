import { test, expect } from '@playwright/test';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const output = 'docs/m2.2-coastal-assembly/review-gates/G01';
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const protectedPaths = ['public/assets/presets/coastal-assembly.json', 'src/world/coastal.ts', 'src/world/blockout.ts', 'art-source/parameters/island_cottage_v2.json', 'public/assets/manifests/blockout_v2.json', 'public/assets/models/island_cottage_blockout_v2.glb', 'public/assets/models/island_cottage_blockout_v1.glb'];

test('G01 fixed views and reversible overlays preserve actual subjects and baseline', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await mkdir(output, { recursive: true });
  const errors: string[] = [], failedRequests: object[] = [], badResponses: object[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.text()); });
  page.on('requestfailed', (r) => failedRequests.push({ url: r.url(), failure: r.failure() }));
  page.on('response', (r) => { if (r.status() >= 400) badResponses.push({ url: r.url(), status: r.status() }); });
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto('/?scene=coastal-assembly&diagnostic=g01');
  // Exactly the original evidence canvas size, independent of extra diagnostic controls.
  await page.addStyleTag({ content: '.viewport{flex:none!important;height:811px!important}.scene-heading,.scene-footer{visibility:hidden!important}' });
  const canvas = page.locator('#scene');
  await expect(canvas).toHaveAttribute('data-loaded', 'true', { timeout: 30_000 });
  await expect(canvas).toHaveAttribute('data-rendered', 'true');
  await expect(canvas).toHaveAttribute('data-g01-overlay', 'off');
  const report = JSON.parse(await canvas.getAttribute('data-g01-report') ?? '{}') as { instances: { id: string; asset: string; matrixWorld: number[]; lowestVertex: number[]; actualBounds: { min: number[] }; undersideSampleCount: number }[] };
  expect(report.instances.map((i) => i.id)).toEqual(['east-cliff', 'front-wall', 'cove-turn', 'east-shoulder', 'front-shoulder']);
  expect(report.instances.filter((i) => i.asset === 'A4')).toHaveLength(2);
  for (const instance of report.instances) { expect(instance.matrixWorld).toHaveLength(16); expect(instance.lowestVertex[1]).toBeCloseTo(instance.actualBounds.min[1]!, 5); expect(instance.undersideSampleCount).toBeGreaterThan(0); }
  await writeFile(`${output}/geometry.json`, JSON.stringify(report, null, 2) + '\n');
  const frames: object[] = [];
  let bottomEvidence: { id: string; visibleBottomFacesSampled: number; bottomWitnesses: { pixel: [number, number]; normal: number[] }[] }[] = [];
  for (const view of ['golden', 'side', 'back', 'below']) {
    await page.selectOption('#g01-view', view);
    for (const overlay of ['off', 'ids', 'terrain']) {
      await page.selectOption('#g01-overlay', overlay);
      await expect(canvas).toHaveAttribute('data-rendered', 'true');
      await expect(canvas).toHaveAttribute('data-g01-view', view);
      await expect(canvas).toHaveAttribute('data-g01-overlay', overlay);
      expect(JSON.parse(await canvas.getAttribute('data-g01-report') ?? '{}')).toEqual(report);
      const rect = await canvas.boundingBox(); expect(rect?.width).toBe(1600); expect(rect?.height).toBe(811);
      await canvas.screenshot({ path: `${output}/${view}-${overlay}.png` });
      frames.push({ view, overlay, canvas: rect, camera: JSON.parse(await canvas.getAttribute('data-g01-camera') ?? '{}'), visibleFaces: JSON.parse(await canvas.getAttribute('data-g01-visible-faces') ?? '[]') });
      if (view === 'below' && overlay === 'off') bottomEvidence = JSON.parse(await canvas.getAttribute('data-g01-visible-faces') ?? '[]') as typeof bottomEvidence;
    }
  }
  // Annotate actual visible bottom-face pixels on an unchanged raw capture, without touching scene materials.
  const imagePage = await browser.newPage({ viewport: { width: 1600, height: 811 }, deviceScaleFactor: 1 });
  let imageComparison: object;
  try {
    const png = (await readFile(`${output}/below-off.png`)).toString('base64');
    const original = await readFile(`${output}/00-original-golden.png`), current = await readFile(`${output}/golden-off.png`);
    const pixelComparison = await imagePage.evaluate(async (sources) => {
      const data = await Promise.all(sources.map(async (src) => {
        const image = new Image(); image.src = src; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, canvas.width, canvas.height).data;
      }));
      let changedPixels = 0, maxChannelDelta = 0;
      for (let i = 0; i < data[0]!.length; i += 4) {
        const delta = Math.max(...[0, 1, 2].map((channel) => Math.abs(data[0]![i + channel]! - data[1]![i + channel]!)));
        if (delta > 0) { changedPixels++; maxChannelDelta = Math.max(maxChannelDelta, delta); }
      }
      return { changedPixels, maxChannelDelta, totalPixels: 1600 * 811 };
    }, [original, current].map((buffer) => `data:image/png;base64,${buffer.toString('base64')}`));
    imageComparison = { originalSha256: hash(original), currentSha256: hash(current), ...pixelComparison, method: 'informational RGB8 pixel difference; retained original is machine-specific evidence, not a cross-GPU exact-pixel test' };
    const callouts = ['front-shoulder', 'east-shoulder'].map((id, index) => {
      const record = bottomEvidence.find((item) => item.id === id)!;
      expect(record.visibleBottomFacesSampled).toBeGreaterThan(0);
      const witness = record.bottomWitnesses[0]!;
      const [x, y] = witness.pixel, labelX = index === 0 ? 220 : 1130, labelY = 230, color = index === 0 ? '#39a7ff' : '#b765ff';
      return `<path d="M${labelX + 110},${labelY + 54} L${x},${y}" stroke="${color}" stroke-width="3"/><circle cx="${x}" cy="${y}" r="8" fill="none" stroke="${color}" stroke-width="3"/><rect x="${labelX}" y="${labelY}" width="250" height="54" rx="4" fill="#122431"/><text x="${labelX + 10}" y="${labelY + 20}" fill="${color}" font-size="16">A4 / ${id}</text><text x="${labelX + 10}" y="${labelY + 42}" fill="white" font-size="13">Visible bottom: normal Y=${witness.normal[1]!.toFixed(4)}</text>`;
    }).join('');
    await imagePage.setContent(`<style>body{margin:0}svg{display:block;font-family:Consolas,monospace}</style><svg xmlns="http://www.w3.org/2000/svg" width="1600" height="811"><image href="data:image/png;base64,${png}" width="1600" height="811"/>${callouts}</svg>`);
    await imagePage.screenshot({ path: `${output}/below-witnesses.png` });
  } finally { await imagePage.close(); }
  // Return from diagnostics: helpers gone, subjects reload normally; repeat entry checks teardown.
  await page.selectOption('#coastal-mode', 'baseline');
  await expect(canvas).toHaveAttribute('data-loaded', 'true');
  await expect(page.locator('.g01-labels')).toHaveCount(0);
  await page.selectOption('#coastal-mode', 'assembly');
  await expect(canvas).toHaveAttribute('data-loaded', 'true');
  await expect(page.locator('.g01-labels')).toHaveCount(1);
  expect(JSON.parse(await canvas.getAttribute('data-g01-report') ?? '{}')).toEqual(report);
  await page.goto('/?scene=coastal-assembly');
  await expect(canvas).toHaveAttribute('data-loaded', 'true');
  await expect(page.locator('.g01-labels')).toHaveCount(0);
  expect(await canvas.getAttribute('data-g01-report')).toBeNull();
  const preservation = [];
  for (const path of protectedPaths) {
    const current = await readFile(path);
    const prior = execFileSync('git', ['-c', `safe.directory=${resolve('.').replaceAll('\\', '/')}`, 'show', `HEAD:${path}`], { windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    const normalize = (buffer: Buffer): Buffer => path.endsWith('.json') || path.endsWith('.ts') ? Buffer.from(buffer.toString().replaceAll('\r\n', '\n')) : buffer;
    expect(hash(normalize(current)), path).toBe(hash(normalize(prior)));
    preservation.push({ path, sha256: hash(normalize(current)), unchanged: true });
  }
  const manifest = JSON.parse(await readFile('public/assets/manifests/coastal-assembly.json', 'utf8')) as { assets: { id: string; variants: { id: string; modelUrl: string; sha256: string }[] }[] };
  for (const asset of manifest.assets) for (const variant of asset.variants) {
    const path = 'public' + variant.modelUrl, actual = hash(await readFile(path));
    expect(actual, path).toBe(variant.sha256); preservation.push({ path, sha256: actual, unchanged: true });
  }
  await writeFile(`${output}/browser-checks.json`, JSON.stringify({ browser: browser.version(), deviceScaleFactor: 1, viewport: { width: 1600, height: 1100 }, frames, errors, failedRequests, badResponses, preservation, imageComparison, checks: ['five actual instances', 'lowest actual vertices', '12 fixed-camera frames', 'overlays leave world transforms unchanged', 'dispose/recreate on mode switch', 'diagnostics absent by default', 'baseline and model hashes unchanged'] }, null, 2) + '\n');
  expect(errors).toEqual([]); expect(failedRequests).toEqual([]); expect(badResponses).toEqual([]);
});
