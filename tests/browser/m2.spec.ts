import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
const manifest = JSON.parse(readFileSync('public/assets/manifests/blockout_v2.json', 'utf8')) as { metrics: { landRatio: number } };

const evidence = resolve('docs/screenshots/m2.1-v1');
async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#scene')).toHaveAttribute('data-loaded', 'true');
  await expect(page.locator('#render-status')).toContainText('WebGL2');
  await expect(page.locator('#scene')).toHaveAttribute('data-view', 'exterior');
}

test('GLB scene and three named cutaways render at fixed camera presets', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()); });
  await ready(page);
  await expect(page.locator('#spatial-metrics')).toContainText(`${manifest.metrics.landRatio.toFixed(2)}×`);
  await page.getByRole('button', { name: '调试参数', exact: true }).click();
  await mkdir(evidence, { recursive: true });
  const records: Record<string, unknown>[] = [];
  for (const [mode,label,distance] of [['exterior','外景',40],['ground-floor','一层剖视',15],['basement','地下室剖视',16]] as const) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator('#scene')).toHaveAttribute('data-distance', String(distance));
    await expect(page.locator('#scene')).toHaveAttribute('data-roof-visible', String(mode === 'exterior'));
    await expect(page.locator('#scene')).toHaveAttribute('data-basement-visible', String(mode !== 'ground-floor'));
    await expect(page.locator('#scene')).toHaveAttribute('data-stair-visible', 'true');
    await page.locator('#scene').screenshot({ path: resolve(evidence, `web-${mode}.png`), style: '.scene-heading,.view-controls,.scene-footer,.debug-panel { visibility: hidden !important; }' });
    await page.screenshot({ path: resolve(evidence, `web-${mode}-ui.png`), fullPage: true });
    records.push({ mode, ...await page.locator('#scene').evaluate((canvas) => ({ ...canvas.dataset })) });
  }
  expect(errors).toEqual([]);
  await page.goto('/?version=v0');
  await expect(page.locator('#scene')).toHaveAttribute('data-loaded', 'true');
  await expect(page.locator('#scene')).toHaveAttribute('data-version', 'island_cottage_blockout_v1');
  await expect(page.locator('#scene')).toHaveAttribute('data-distance', '40');
  await expect(page.locator('#spatial-metrics')).toContainText('9.00×');
  await page.locator('#scene').screenshot({ path: resolve(evidence, 'web-v0-exterior.png'), style: '.scene-heading,.view-controls,.scene-footer,.debug-panel { visibility: hidden !important; }' });
  expect(errors).toEqual([]);
  await writeFile(resolve('docs/m2.1-v1/runtime-report.json'), JSON.stringify({ browser: browser.version(), viewport: { width: 1600, height: 1000 }, errors, records }, null, 2)+'\n');
});

test('M2 orbit/zoom clamps and reset retain the current inspection mode', async ({ page }) => {
  await ready(page);
  await page.mouse.move(640, 420);
  await page.mouse.down();
  await page.mouse.move(290, 650, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('#scene')).toHaveAttribute('data-yaw', '45');
  await expect(page.locator('#scene')).toHaveAttribute('data-pitch', '55');
  await page.mouse.move(640, 420);
  await page.mouse.wheel(0, 1e5);
  await expect(page.locator('#scene')).toHaveAttribute('data-distance', '45');
  await page.getByRole('button', { name: '地下室剖视', exact: true }).click();
  await expect(page.locator('#scene')).toHaveAttribute('data-distance', '16');
  await page.mouse.move(640, 420);
  await page.mouse.wheel(0, -1e5);
  await expect(page.locator('#scene')).toHaveAttribute('data-distance', '8');
  await page.getByRole('button', { name: '重置视角', exact: true }).click();
  await expect(page.locator('#scene')).toHaveAttribute('data-distance', '16');
  await expect(page.locator('#scene')).toHaveAttribute('data-view', 'basement');
});

test('failed GLB requests present asset errors and disable view buttons', async ({ page }) => {
  await page.route('**/assets/models/island_cottage_blockout_v2.glb', (route) => route.fulfill({ status: 404, body: 'Missing asset' }));
  await page.goto('/');
  await expect(page.locator('#error-panel')).toContainText('HTTP 404');
  await expect(page.getByRole('button', { name: '一层剖视', exact: true })).toBeDisabled();
});

test('M2 portrait view buttons, resize and keyboard focus remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await expect(page.locator('#debug-panel')).toBeHidden();
  await page.getByRole('button', { name: '一层剖视', exact: true }).click();
  await expect(page.locator('#scene')).toHaveAttribute('data-distance', '15');
  await expect(page.getByRole('button', { name: '一层剖视', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('#scene')).toHaveAttribute('data-view', 'ground-floor');
});
