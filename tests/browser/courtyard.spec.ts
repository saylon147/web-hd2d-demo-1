import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('courtyard preview loads, orbits and resets', async ({page})=>{
  const errors: string[] = [];
  page.on('pageerror', e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:960});
  await page.goto('/?scene=courtyard&actor=0');
  const scene = page.locator('#scene');
  await expect(scene).toHaveAttribute('data-loaded','true');
  await expect(scene).toHaveAttribute('data-distance','27');
  await mkdir('docs/screenshots/courtyard',{recursive:true});
  const style = '.scene-heading,.scene-footer { visibility:hidden }';
  await scene.screenshot({path:'docs/screenshots/courtyard/entrance.png',style});
  await page.mouse.move(650,500);
  await page.mouse.down();
  await page.mouse.move(810,500,{steps:8});
  await page.mouse.up();
  await expect.poll(async()=>Math.abs(Number(await scene.getAttribute('data-yaw')))).toBeGreaterThan(25);
  await scene.screenshot({path:'docs/screenshots/courtyard/side.png',style});
  await page.locator('#reset-view').click();
  await expect(scene).toHaveAttribute('data-yaw','0');
  expect(errors).toEqual([]);
});
