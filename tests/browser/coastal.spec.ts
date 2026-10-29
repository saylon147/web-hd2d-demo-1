import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import type { CoastalManifest } from '../../src/config/coastal';

const manifest = JSON.parse(readFileSync('public/assets/manifests/coastal-assembly.json', 'utf8')) as CoastalManifest;
const preset = JSON.parse(readFileSync('public/assets/presets/coastal-assembly.json', 'utf8')) as { cameraViews: { golden: unknown }; placements: { asset: string }[] };
const available = manifest.assets.every((asset) => asset.variants.every((variant) => existsSync('public' + variant.modelUrl)));
const output = 'docs/m2.2-coastal-assembly/images';
async function ready(page: Page): Promise<void> { await expect(page.locator('#scene')).toHaveAttribute('data-loaded', 'true', { timeout: 30_000 }); }
async function measure(page: Page): Promise<Record<string, unknown>> {
  await expect(page.locator('#scene')).toHaveAttribute('data-performance', /.+/, { timeout: 30_000 });
  return page.locator('#scene').evaluate((canvas) => JSON.parse(canvas.dataset.performance ?? '{}') as Record<string, unknown>);
}
async function capture(page: Page, name: string): Promise<void> {
  await page.locator('#scene').screenshot({ path: `${output}/${name}.png`, style: '.scene-heading,.scene-footer { visibility:hidden!important; }' });
}
test.describe('coastal assembly local integration', () => {
  test.skip(!available, 'Coastal GLBs remain local. Run npm run coastal:pipeline after placing A1–A4 in inbox.');
  test('switching modes while the first model loads keeps rendering and measurement alive', async ({ page }) => {
    let requests = 0;
    await page.route('**/coastal-assembly/A1/rock-10k-1k.glb', async (route) => {
      requests++;
      await new Promise((done) => setTimeout(done, 250));
      await route.continue().catch(() => { /* A superseded load is intentionally aborted. */ });
    });
    await page.goto('/?scene=coastal-assembly&mode=assembly&lod=10k-1k');
    await expect.poll(() => requests).toBeGreaterThanOrEqual(1);
    await page.selectOption('#coastal-mode', 'module');
    await ready(page); await expect(page.locator('#scene')).toHaveAttribute('data-mode', 'module');
    expect((await measure(page)).frames).toBe(120);
  });
  test('matched A/B views and two LOD budgets load with PBR validation and measured timings', async ({ page, browser }) => {
    test.setTimeout(180_000);
    await mkdir(output, { recursive: true }); await mkdir('artifacts/coastal-assembly', { recursive: true });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message)); page.on('console', (message) => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
    await page.setViewportSize({ width: 1600, height: 1000 });
    const records: Record<string, unknown>[] = [];
    for (const [mode, lod] of [['baseline', '10k-1k'], ['assembly', '10k-1k'], ['assembly', '20k-2k']] as const) {
      await page.goto(`/?scene=coastal-assembly&mode=${mode}&lod=${lod}&view=golden`); await ready(page);
      expect(JSON.parse(await page.locator('#scene').getAttribute('data-camera') ?? '{}')).toEqual(preset.cameraViews.golden);
      const record = await measure(page); records.push(record);
      expect(record.frames).toBe(120); expect(record.instances).toBe(mode === 'baseline' ? 0 : 5);
      expect(record.uniqueAssets).toBe(mode === 'baseline' ? 0 : 4);
      expect(record.textureEstimateBytes).toBe(mode === 'baseline' ? 0 : manifest.assets.reduce((sum, asset) => sum + asset.variants.find((variant) => variant.id === lod)!.gpuTextureRgbaMipEstimateBytes, 0));
      await capture(page, `${mode}-golden-${lod}`);
      if (mode === 'assembly') for (const [view, label] of [['front', '近景'], ['side', '侧面'], ['back', '背面'], ['corner', '转角'], ['top', '顶部']] as const) {
        await page.getByRole('button', { name: label, exact: true }).click();
        await expect(page.locator('#scene')).toHaveAttribute('data-view', view);
        await measure(page); await capture(page, `${mode}-${view}-${lod}`);
      }
    }
    expect(errors).toEqual([]);
    await writeFile('artifacts/coastal-assembly/browser-desktop.json', JSON.stringify({ browser: browser.version(), errors, records }, null, 2) + '\n');
  });
  test('module previews report asset identity, normalized dimensions and LOD', async ({ page }) => {
    test.setTimeout(90_000);
    const records: Record<string, unknown>[] = [];
    await page.setViewportSize({ width: 1200, height: 900 });
    for (const asset of manifest.assets) {
      await page.goto(`/?scene=coastal-assembly&mode=module&asset=${asset.id}&lod=20k-2k&view=front`); await ready(page);
      await expect(page.locator('#scene')).toHaveAttribute('data-instance-count', '1');
      await expect(page.locator('#spatial-metrics')).toContainText(asset.id);
      const record = await measure(page); records.push(record);
      expect(record.uniqueAssets).toBe(1); expect(record.transferBytes).toBe(asset.variants.find((variant) => variant.id === '20k-2k')!.fileBytes);
      await capture(page, `${asset.id}-web-front`);
      for (const [view, label] of [['back', '背面'], ['top', '顶部']] as const) {
        await page.getByRole('button', { name: label, exact: true }).click(); await measure(page); await capture(page, `${asset.id}-web-${view}`);
      }
    }
    await writeFile('artifacts/coastal-assembly/browser-modules.json', JSON.stringify({ records }, null, 2) + '\n');
  });
  test('mobile and narrow layouts remain separate from the scene heading and switches work', async ({ page, browser }) => {
    test.setTimeout(120_000);
    const records: Record<string, unknown>[] = [];
    for (const [width, height] of [[390, 844], [740, 820], [844, 390]]) {
      await page.setViewportSize({ width: width!, height: height! });
      await page.goto('/?scene=coastal-assembly&mode=baseline&view=golden'); await ready(page); records.push(await measure(page));
      await page.selectOption('#coastal-mode', 'assembly'); await ready(page);
      await expect(page.locator('#scene')).toHaveAttribute('data-mode', 'assembly');
      records.push(await measure(page));
      const nav = await page.locator('#view-controls').boundingBox(), heading = await page.locator('.scene-heading').boundingBox();
      expect(nav!.y + nav!.height).toBeLessThanOrEqual(heading!.y); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      const boxes = await page.locator('#view-controls > *').evaluateAll((elements) => elements.map((element) => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }));
      for (const box of boxes) { expect(box.left).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(width!); }
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i]!, b = boxes[j]!; expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(true); }
      if (width === 390) { await capture(page, 'mobile-assembly'); await page.screenshot({ path: `${output}/mobile-ui.png`, fullPage: true }); }
      await page.selectOption('#coastal-mode', 'module'); await ready(page);
      await page.selectOption('#coastal-asset', 'A4'); await ready(page); await expect(page.locator('#scene')).toHaveAttribute('data-asset', 'A4');
      await page.selectOption('#coastal-lod', '20k-2k'); await ready(page); await expect(page.locator('#scene')).toHaveAttribute('data-lod', '20k-2k');
      await page.getByRole('button', { name: '顶部', exact: true }).click(); await expect(page.locator('#scene')).toHaveAttribute('data-view', 'top');
      await page.selectOption('#coastal-mode', 'baseline'); await ready(page); await expect(page.locator('#scene')).toHaveAttribute('data-instance-count', '0');
    }
    await writeFile('artifacts/coastal-assembly/browser-mobile.json', JSON.stringify({ browser: browser.version(), device: 'desktop Chromium, simulated viewport; not physical phone', records }, null, 2) + '\n');
  });
});
test('missing coastal binary shows actionable item rerun and original M2.1 still loads', async ({ page }) => {
  await page.route('**/coastal-assembly/A3/rock-10k-1k.glb', (route) => route.fulfill({ status: 404, body: 'Missing local A3' }));
  await page.goto('/?scene=coastal-assembly&mode=module&asset=A3&lod=10k-1k');
  await expect(page.locator('#error-panel')).toContainText('A3'); await expect(page.locator('#error-panel')).toContainText('coastal:pipeline');
  await page.getByRole('link', { name: '返回 M2.1 基线 ↗' }).click(); await ready(page);
  await expect(page.locator('#scene')).toHaveAttribute('data-version', 'island_cottage_blockout_v2');
});
test('incomplete coastal manifest stops full assembly with inbox instructions', async ({ page }) => {
  await page.route('**/assets/manifests/coastal-assembly.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ schemaVersion: 1, units: 'meters', upAxis: 'Y', complete: false, assets: [] }) }));
  await page.goto('/?scene=coastal-assembly'); await expect(page.locator('#error-panel')).toContainText('A1–A4'); await expect(page.locator('#error-panel')).toContainText('inbox');
});
