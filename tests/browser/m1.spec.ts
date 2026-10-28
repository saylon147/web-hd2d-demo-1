import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const evidenceDirectory = resolve('docs/screenshots');

async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#render-status')).toContainText('WebGL2');
  await expect(page.locator('#scene')).toHaveAttribute('data-distance', '16');
}

async function cameraValue(page: Page, key: string): Promise<number> {
  return Number(await page.locator('#scene').getAttribute(`data-${key}`));
}

async function setNumber(page: Page, name: string, value: number): Promise<void> {
  // lil-gui uses text inputs on desktop and number/spinbutton inputs on touch devices.
  const input = page.getByLabel(name, { exact: true });
  await input.fill(String(value));
  await input.press('Enter');
  await input.press('Tab');
}

async function screenshot(page: Page, file: string): Promise<void> {
  await mkdir(evidenceDirectory, { recursive: true });
  await page.screenshot({ path: resolve(evidenceDirectory, file), fullPage: true });
}

test('desktop 16:9 renders without console errors and captures default framing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
  });
  await ready(page);
  await expect(page.locator('#error-panel')).toBeHidden();
  await expect(page.locator('#debug-panel')).toBeVisible();
  const box = await page.locator('#scene').boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error('Canvas has no layout box');
  await expect.poll(() => cameraValue(page, 'aspect')).toBeCloseTo(box.width / box.height, 5);
  await screenshot(page, 'm1-desktop.png');
  expect(errors).toEqual([]);
});

test('actual pointer capture, wheel extremes, and reset obey constraints', async ({ page }) => {
  await ready(page);
  const box = await page.locator('#scene').boundingBox();
  if (!box) throw new Error('Canvas has no layout box');
  const x = box.x + box.width * 0.45;
  const y = box.y + box.height * 0.52;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 350, y + 240, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => cameraValue(page, 'yaw')).toBe(45);
  await expect.poll(() => cameraValue(page, 'pitch')).toBe(55);
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, 100_000);
  await expect.poll(() => cameraValue(page, 'distance')).toBe(25);
  await page.mouse.wheel(0, -100_000);
  await expect.poll(() => cameraValue(page, 'distance')).toBe(8);
  await page.mouse.down();
  await page.mouse.move(x + 600, y - 300, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => cameraValue(page, 'yaw')).toBe(-45);
  await expect.poll(() => cameraValue(page, 'pitch')).toBe(30);
  await expect.poll(() => cameraValue(page, 'camera-y')).toBeGreaterThan(0.25);
  await page.getByRole('button', { name: '重置视角', exact: true }).click();
  await expect.poll(() => cameraValue(page, 'distance')).toBe(16);
  await expect.poll(() => cameraValue(page, 'yaw')).toBe(0);
  await expect.poll(() => cameraValue(page, 'pitch')).toBe(42);
});

test('GUI edits all eight camera extremes; GUI wheel cannot zoom the scene', async ({ page }) => {
  await ready(page);
  for (const pitch of [30, 55]) {
    for (const yaw of [-45, 45]) {
      for (const distance of [8, 25]) {
        await setNumber(page, '俯角 °', pitch);
        await setNumber(page, '水平偏转 °', yaw);
        await setNumber(page, '距离 m', distance);
        await expect.poll(() => cameraValue(page, 'pitch')).toBe(pitch);
        await expect.poll(() => cameraValue(page, 'yaw')).toBe(yaw);
        await expect.poll(() => cameraValue(page, 'distance')).toBe(distance);
        await expect.poll(() => cameraValue(page, 'camera-y')).toBeGreaterThan(0.25);
      }
    }
  }
  await page.locator('#debug-panel').hover();
  await page.mouse.wheel(0, -1_000);
  await expect.poll(() => cameraValue(page, 'distance')).toBe(25);
  await page.getByRole('button', { name: '重置视角', exact: true }).click();
  await expect.poll(() => cameraValue(page, 'distance')).toBe(16);
  await setNumber(page, '俯角 °', 55);
  await setNumber(page, '水平偏转 °', 45);
  await setNumber(page, '距离 m', 8);
  // Wait for the rendered (damped) view to approach the requested state before capturing.
  const expectedHeight = 0.8 + 8 * Math.sin(55 * Math.PI / 180);
  await expect.poll(() => cameraValue(page, 'camera-y')).toBeCloseTo(expectedHeight, 2);
  await screenshot(page, 'm1-camera-near-limit.png');
});

test('resize preserves canonical camera state and updates canvas aspect/DPR', async ({ page }) => {
  await ready(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '调试参数' }).click();
  await expect(page.locator('#debug-panel')).toBeHidden();
  const box = await page.locator('#scene').boundingBox();
  if (!box) throw new Error('Canvas has no layout box');
  await expect.poll(() => cameraValue(page, 'aspect')).toBeCloseTo(box.width / box.height, 5);
  expect(await cameraValue(page, 'distance')).toBe(16);
  const buffer = await page.locator('#scene').evaluate((element) => {
    if (!(element instanceof HTMLCanvasElement)) throw new Error('Scene is not a canvas');
    return { width: element.width, cssWidth: element.clientWidth };
  });
  expect(buffer.width).toBeGreaterThanOrEqual(buffer.cssWidth);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.setViewportSize({ width: 844, height: 390 });
  const landscape = await page.locator('#scene').boundingBox();
  if (!landscape) throw new Error('Canvas has no layout box');
  await expect.poll(() => cameraValue(page, 'aspect')).toBeCloseTo(landscape.width / landscape.height, 5);
  expect(await cameraValue(page, 'pitch')).toBe(42);
});

test('mobile real touch orbit/pinch, 2x DPR, and portrait extremes', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  try {
    const page = await context.newPage();
    await ready(page);
    await expect(page.locator('#debug-panel')).toBeHidden();
    await expect(page.locator('#render-status')).toContainText('DPR 2.0');
    const session = await context.newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 400, id: 1 }] });
    // Move over actual frames: a 100px move in <1ms creates an unrealistic fling in Chromium.
    for (let step = 1; step <= 12; step++) {
      await page.evaluate(() => new Promise<void>((resolveFrame) => requestAnimationFrame(() => resolveFrame())));
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ x: 180 - 100 * step / 12, y: 400 + 100 * step / 12, id: 1 }],
      });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => cameraValue(page, 'yaw')).toBe(18);
    await expect.poll(() => cameraValue(page, 'pitch')).toBe(55);
    await expect.poll(() => cameraValue(page, 'camera-y')).toBeCloseTo(0.8 + 16 * Math.sin(55 * Math.PI / 180), 2);
    await page.getByRole('button', { name: '重置视角', exact: true }).tap();
    await expect.poll(() => cameraValue(page, 'yaw')).toBe(0);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 140, y: 450, id: 1 }, { x: 250, y: 450, id: 2 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 80, y: 450, id: 1 }, { x: 310, y: 450, id: 2 }] });
    await expect.poll(() => cameraValue(page, 'distance')).toBe(8);
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 190, y: 450, id: 1 }, { x: 200, y: 450, id: 2 }] });
    await expect.poll(() => cameraValue(page, 'distance')).toBe(25);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => cameraValue(page, 'yaw')).toBe(0);
    await expect.poll(() => cameraValue(page, 'camera-y')).toBeCloseTo(0.8 + 25 * Math.sin(42 * Math.PI / 180), 2);
    // Also verify the accessible keyboard path on the narrow layout.
    await page.getByRole('button', { name: '调试参数', exact: true }).focus();
    await page.getByRole('button', { name: '调试参数', exact: true }).press('Space');
    await expect(page.locator('#debug-panel')).toBeVisible();
    for (const pitch of [30, 55]) {
      for (const yaw of [-45, 45]) {
        for (const distance of [8, 25]) {
          await setNumber(page, '俯角 °', pitch);
          await setNumber(page, '水平偏转 °', yaw);
          await setNumber(page, '距离 m', distance);
          await expect.poll(() => cameraValue(page, 'pitch')).toBe(pitch);
          await expect.poll(() => cameraValue(page, 'yaw')).toBe(yaw);
          await expect.poll(() => cameraValue(page, 'distance')).toBe(distance);
          await expect.poll(() => cameraValue(page, 'camera-y')).toBeGreaterThan(0.25);
        }
      }
    }
    await page.getByRole('button', { name: '重置视角', exact: true }).focus();
    await page.getByRole('button', { name: '重置视角', exact: true }).press('Space');
    await page.getByRole('button', { name: '调试参数', exact: true }).focus();
    await page.getByRole('button', { name: '调试参数', exact: true }).press('Space');
    await expect(page.locator('#debug-panel')).toBeHidden();
    await expect.poll(() => cameraValue(page, 'distance')).toBe(16);
    await screenshot(page, 'm1-portrait.png');
  } finally {
    await context.close();
  }
});

test('missing WebGL2 shows an actionable error instead of a blank canvas', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: function (this: HTMLCanvasElement, contextId: string, ...args: unknown[]): RenderingContext | null {
        if (contextId === 'webgl2') return null;
        return Reflect.apply(original, this, [contextId, ...args]) as RenderingContext | null;
      },
    });
  });
  await page.goto('/');
  await expect(page.locator('#error-panel')).toBeVisible();
  await expect(page.locator('#error-panel')).toContainText('硬件加速');
  await expect(page.getByRole('button', { name: '重新加载', exact: true })).toBeVisible();
  await expect(page.locator('#toggle-debug')).toBeDisabled();
});

test('lost WebGL context stops rendering and presents recovery UI', async ({ page }) => {
  await ready(page);
  const supported = await page.locator('#scene').evaluate((canvas) => {
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Scene is not a canvas');
    const extension = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    extension.loseContext();
    return true;
  });
  expect(supported).toBe(true);
  await expect(page.locator('#error-panel')).toContainText('上下文已丢失');
  await expect(page.locator('#render-status')).toHaveText('渲染不可用');
});
