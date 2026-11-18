import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('gardener poses, courtyard depth, rendering combinations and live controls', async ({page, browser}) => {
  test.setTimeout(180000);
  const directory = 'docs/hd2d-render-study/H4';
  await mkdir(directory, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewportSize({width: 1280, height: 850});
  const canvas = page.locator('#scene');
  const style = '.scene-heading,.scene-footer,#debug-panel{visibility:hidden}';
  const records = [];
  for (const sky of ['day', 'dusk', 'night']) {
    for (const [mode, query] of Object.entries({native: 'render=native', pixel: 'render=pixel',
      msaa: 'render=pixel&msaa=4', dof: 'render=pixel&dof=1&order=after&focus=24'})) {
      for (const bloom of [0, 1]) {
        const time = sky === 'day' && mode === 'native' ? 0 : 2.45;
        const url = '/?scene=courtyard&walk=0&pixelWidth=480&walkTime=' + time +
          '&sky=' + sky + '&bloom=' + bloom + '&' + query;
        await page.goto(url);
        await expect(canvas).toHaveAttribute('data-gardener', /,true$/);
        const state = await canvas.getAttribute('data-gardener');
        expect(state).toContain(time === 0 ? ',idle,' : ',walk,');
        const timings = await page.evaluate(async () => {
          const frame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));
          for (let i = 0; i < 8; i++) await frame();
          const intervals = [];
          let last = await frame();
          for (let i = 0; i < 30; i++) {
            const next = await frame();
            intervals.push(next - last);
            last = next;
          }
          return intervals.sort((a, b) => a - b);
        });
        expect(await canvas.evaluate(el => (el as HTMLCanvasElement).getContext('webgl2')!.getError())).toBe(0);
        const capture = (mode === 'native' && sky === 'day' && !bloom) ||
          (sky === 'dusk' && (mode === 'native' || mode === 'msaa') && !bloom) ||
          (sky === 'night' && mode === 'dof' && bloom === 1);
        const file = capture ? sky + '-' + mode + '-' + bloom + '.png' : null;
        if (file) await canvas.screenshot({path: directory + '/' + file, style});
        records.push({url, file, state, draws: await canvas.getAttribute('data-draw-calls'),
          meanMs: timings.reduce((sum, value) => sum + value, 0) / timings.length, p95Ms: timings[28]});
      }
    }
  }
  await page.goto('/?scene=courtyard&walk=0&walkTime=2.45&sky=dusk&actor=0');
  await expect(canvas).toHaveAttribute('data-gardener', /,false$/);
  await canvas.screenshot({path: directory + '/gate-hidden.png', style});
  await page.goto('/?scene=courtyard&walk=0&walkTime=5&shot=house&render=pixel&pixelWidth=480');
  await expect(canvas).toHaveAttribute('data-gardener', /,walk,/);
  await canvas.screenshot({path: directory + '/walking-house.png', style});
  const frozen = await canvas.getAttribute('data-gardener');
  await page.getByRole('button', {name: /调试参数/}).click();
  const control = (label: string) => page.locator('.lil-controller').filter({hasText: label}).locator('input').first();
  await control('显示角色').uncheck();
  await expect(canvas).toHaveAttribute('data-gardener', /,false$/);
  await control('显示角色').check();
  await control('速度（米/秒）').fill('1.5');
  await control('速度（米/秒）').press('Enter');
  await control('自动行走').check();
  await expect.poll(() => canvas.getAttribute('data-gardener')).not.toBe(frozen);
  await control('自动行走').uncheck();
  await page.getByRole('button', {name: /调试参数/}).click();
  await page.mouse.move(600, 400);
  await page.mouse.down();
  await page.mouse.move(760, 415, {steps: 6});
  await page.mouse.up();
  await page.mouse.wheel(0, 240);
  await expect.poll(async () => Number(await canvas.getAttribute('data-distance'))).toBeGreaterThan(12);
  await expect.poll(async () => Math.abs(Number(await canvas.getAttribute('data-yaw')))).toBeGreaterThan(10);
  expect(errors).toEqual([]);
  await writeFile(directory + '/captures.json', JSON.stringify({browser: browser.version(), records}, null, 2) + '\n');
});

test('gardener idles, reverses on screen and retains detail near the focus plane', async ({page}) => {
  const directory = 'docs/hd2d-render-study/H4';
  await mkdir(directory, {recursive: true});
  await page.setViewportSize({width: 1280, height: 850});
  const canvas = page.locator('#scene');
  // Begin just before the cottage end of the road and watch a real-time reversal.
  await page.goto('/?scene=courtyard&walkTime=7.55&shot=house');
  await expect(canvas).toHaveAttribute('data-gardener', /,idle,/);
  const atEnd = await canvas.getAttribute('data-gardener');
  await expect(canvas).toHaveAttribute('data-gardener', /,walk,/);
  const returning = await canvas.getAttribute('data-gardener');
  expect(returning!.split(',')[2]).not.toBe(atEnd!.split(',')[2]);
  for (const [label, focus] of [['near', 10], ['far', 35]] as const) {
    await page.goto('/?scene=courtyard&walk=0&walkTime=6.5&shot=house&render=pixel&pixelWidth=480&dof=1&order=before&tilt=0&blur=10&focus=' + focus);
    await expect(canvas).toHaveAttribute('data-gardener', /,walk,/);
    await canvas.screenshot({path: directory + '/focus-' + label + '.png',
      style: '.scene-heading,.scene-footer{visibility:hidden}'});
  }
});
