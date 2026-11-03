import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { PerspectiveCamera, Vector3 } from 'three';
import type { CottageManifest } from '../../src/config/cottageCandidate';

const output = 'docs/m2.4-cottage-tripo/review-gates/P0-P1';
const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
test('P0/P1 isolated HD cottage, fixed views, interactions, failure and default protection', async ({ page, browser, request }) => {
  test.setTimeout(240_000);
  const manifest = JSON.parse(await readFile('public/assets/manifests/cottage-candidate-01.json', 'utf8')) as CottageManifest;
  const available = await access(manifest.sourceFile).then(() => true, () => false);
  test.skip(!available, 'Original ignored HD GLB is required in the documented local inbox');
  await mkdir(output, { recursive: true });
  expect(sha(await readFile(manifest.sourceFile))).toBe(manifest.sha256);
  const errors: string[] = [], warnings: string[] = [], failedRequests: string[] = [], glbRequests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning') warnings.push(m.text()); });
  page.on('requestfailed', (r) => failedRequests.push(r.url()));
  page.on('request', (r) => { if (r.url().endsWith('.glb')) glbRequests.push(new URL(r.url()).pathname); });
  const alias = await request.head(manifest.modelUrl);
  expect(alias.status()).toBe(200); expect(Number(alias.headers()['content-length'])).toBe(manifest.fileBytes);
  expect(alias.headers()['content-type']).toBe('model/gltf-binary');
  expect((await request.post(manifest.modelUrl)).status()).toBe(405);
  await page.setViewportSize({ width: 1600, height: 1000 });
  const canvas = page.locator('#scene');
  const ready = async (): Promise<void> => {
    await expect(canvas).toHaveAttribute('data-loaded', 'true', { timeout: 60_000 });
    await expect(canvas).toHaveAttribute('data-rendered', 'true', { timeout: 60_000 });
  };
  await page.goto('/?scene=cottage-candidate-01'); await ready();
  await expect(canvas).toHaveAttribute('data-scene', 'cottage-candidate-01');
  expect(glbRequests).toEqual([manifest.modelUrl]);
  const audit = JSON.parse(await canvas.getAttribute('data-audit') ?? '{}') as { hash: string; meshes: number; triangles: number; vertices: number; materials: { baseColor: { width: number }; sharedOrm: boolean }[] };
  expect(audit.hash).toBe(manifest.sha256); expect(audit.meshes).toBe(1);
  expect(audit.triangles).toBe(1907653); expect(audit.vertices).toBe(1023693);
  expect(audit.materials).toHaveLength(1); expect(audit.materials[0]!.baseColor.width).toBe(4096); expect(audit.materials[0]!.sharedOrm).toBe(true);
  const backend = await canvas.evaluate((el) => {
    const gl = (el as HTMLCanvasElement).getContext('webgl2')!, ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { api: 'WebGL2', renderer: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unavailable' };
  });
  const records: object[] = [];
  const verifyFraming = async (): Promise<void> => {
    const c = JSON.parse(await canvas.getAttribute('data-camera') ?? '{}') as { position: [number, number, number]; target: [number, number, number]; fov: number; aspect: number; near: number; far: number };
    const camera = new PerspectiveCamera(c.fov, c.aspect, c.near, c.far); camera.position.set(...c.position); camera.lookAt(new Vector3(...c.target)); camera.updateMatrixWorld(true);
    const half = new Vector3(...manifest.spatial.dimensions).multiplyScalar(0.5);
    for (const x of [-half.x, half.x]) for (const y of [-half.y, half.y]) for (const z of [-half.z, half.z]) {
      const p = new Vector3(x, y + half.y, z).project(camera);
      expect(Math.abs(p.x)).toBeLessThan(1); expect(Math.abs(p.y)).toBeLessThan(1); expect(p.z).toBeGreaterThan(-1); expect(p.z).toBeLessThan(1);
    }
  };
  await page.addStyleTag({ content: '.cottage-shell .scene-footer{visibility:hidden!important}' });
  for (const view of ['front', 'back', 'left', 'right', 'top', 'oblique', 'bottom']) {
    await page.click(`[data-cottage-view="${view}"]`); await ready();
    await expect(canvas).toHaveAttribute('data-view', view);
    expect(new URL(page.url()).searchParams.get('view')).toBe(view);
    await verifyFraming();
    await canvas.screenshot({ path: `${output}/${view}.png` });
    records.push({ view, camera: JSON.parse(await canvas.getAttribute('data-camera') ?? '{}') as unknown });
  }
  await page.click('#cottage-fill'); await ready(); await expect(canvas).toHaveAttribute('data-inspection-fill', 'true');
  await canvas.screenshot({ path: `${output}/bottom-fill.png` });
  await page.click('#cottage-fill'); await ready();
  await page.click('[data-cottage-view="oblique"]'); await page.selectOption('#cottage-background', 'warm'); await ready();
  await canvas.screenshot({ path: `${output}/oblique-warm.png` });
  await page.selectOption('#cottage-background', 'neutral'); await ready();
  await page.addStyleTag({ content: '.cottage-shell .scene-footer{visibility:visible!important}' });
  await page.screenshot({ path: `${output}/viewer-ui.png` });
  const cameraBefore = await canvas.getAttribute('data-camera');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2 + 50, { steps: 6 }); await page.mouse.up(); await ready();
  await expect(canvas).toHaveAttribute('data-view', 'free'); expect(await canvas.getAttribute('data-camera')).not.toBe(cameraBefore);
  const rotated = await canvas.getAttribute('data-camera'); await page.mouse.wheel(0, -260); await ready();
  expect(await canvas.getAttribute('data-camera')).not.toBe(rotated);
  await page.selectOption('#cottage-scale', '1.25');
  await page.locator('#cottage-yaw').fill('45'); await page.locator('#cottage-yaw').dispatchEvent('input'); await ready();
  expect(JSON.parse(await canvas.getAttribute('data-display-transform') ?? '{}') as unknown).toEqual({ yaw: Math.PI / 4, scale: 1.25 });
  await page.click('#reset-view'); await ready();
  expect(await canvas.getAttribute('data-camera')).toBe(cameraBefore);
  expect(JSON.parse(await canvas.getAttribute('data-display-transform') ?? '{}') as unknown).toEqual({ yaw: 0, scale: 1 });
  await page.setViewportSize({ width: 390, height: 844 }); await ready();
  await verifyFraming();
  await expect.poll(() => canvas.evaluate((el) => { const c = el as HTMLCanvasElement; return c.width / c.height; })).toBeCloseTo((await canvas.boundingBox())!.width / (await canvas.boundingBox())!.height, 2);
  await page.screenshot({ path: `${output}/viewer-mobile-layout.png` });
  await page.setViewportSize({ width: 844, height: 390 }); await ready();
  await verifyFraming();
  const landscape = await canvas.boundingBox(); expect(landscape!.width).toBeGreaterThan(0); expect(landscape!.height).toBeGreaterThan(0);
  await page.setViewportSize({ width: 1600, height: 1000 }); await ready();
  const sheet = await browser.newPage({ deviceScaleFactor: 1 });
  try {
    const cells = await Promise.all(['front', 'back', 'left', 'right', 'top', 'bottom'].map(async (view) => `<article><h2>${view}</h2><img src="data:image/png;base64,${(await readFile(`${output}/${view}.png`)).toString('base64')}"></article>`));
    await sheet.setViewportSize({ width: 1800, height: 980 });
    await sheet.setContent(`<style>body{margin:0;padding:18px;background:#f4f5ef;color:#27372e;font:16px Segoe UI}h1{font-size:24px;margin:0 0 8px}p{margin:0 0 12px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}h2{font-size:17px;margin:0;padding:8px;background:#d8dfd4}img{display:block;width:100%}</style><h1>Cottage Candidate 01 / P0 + P1 / original HD</h1><p>Isolated source asset · fixed views · same lighting/exposure · neutral background · no island scale calibration</p><div class="grid">${cells.join('')}</div>`);
    await sheet.screenshot({ path: `${output}/review-sheet.png` });
  } finally { await sheet.close(); }
  expect(errors).toEqual([]); expect(failedRequests).toEqual([]);
  const missing = await browser.newPage();
  try {
    await missing.route('**/__local-assets/cottage-candidate-01.glb', (route) => route.fulfill({ status: 404, body: 'fixture: missing original' }));
    await missing.goto('/?scene=cottage-candidate-01');
    await expect(missing.locator('#error-panel')).toBeVisible();
    await expect(missing.locator('#error-panel')).toContainText(manifest.sourceFile);
    await expect(missing.locator('[data-cottage-view="front"]')).toBeDisabled();
    await missing.unrouteAll();
    await missing.route('**/assets/manifests/cottage-candidate-01.json', (route) => route.fulfill({ json: { ...manifest, sha256: '0'.repeat(64) } }));
    await missing.reload(); await expect(missing.locator('#error-panel')).toContainText('源文件与检查记录不一致');
  } finally { await missing.close(); }
  await canvas.evaluate((el) => (el as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext());
  await expect(page.locator('#error-panel')).toContainText('WebGL 上下文丢失');
  await page.click('a[href="./"]:text("返回默认场景")');
  await expect(canvas).toHaveAttribute('data-loaded', 'true', { timeout: 30_000 });
  expect(await canvas.getAttribute('data-scene')).not.toBe('cottage-candidate-01');
  expect(await canvas.getAttribute('data-audit')).toBeNull();
  const defaultSourceRequests = glbRequests.slice(1);
  expect(defaultSourceRequests).not.toContain(manifest.modelUrl);
  await page.goto('/?scene=cottage-candidate-01&view=back'); await ready();
  await expect(canvas).toHaveAttribute('data-view', 'back');
  expect(sha(await readFile(manifest.sourceFile))).toBe(manifest.sha256);
  expect(errors).toEqual([]); expect(failedRequests).toEqual([]);
  const git = (args: string[]): Buffer => execFileSync('git', ['-c', `safe.directory=${resolve('.').replaceAll('\\', '/')}`, ...args], { windowsHide: true, maxBuffer: 80 * 1024 * 1024 });
  const sourceCommit = git(['rev-parse', 'HEAD']).toString().trim();
  const paths = git(['ls-files', 'src/world', 'src/config', 'src/character', 'scripts/terrain_blockout.py', 'scripts/generate_blockout.py', 'art-source/parameters', 'public/assets/presets', 'public/assets/models', 'public/assets/manifests/coastal-assembly.json', 'public/assets/manifests/tripo-rock.json', 'docs/m2.2-coastal-assembly/review-gates', 'docs/m2.3-cliff-section/review-gates']).toString().trim().split(/\r?\n/);
  const protection: { path: string; sha256: string }[] = [];
  for (const path of paths) {
    const normalize = (b: Buffer): Buffer => /\.(ts|json|py|md)$/.test(path) ? Buffer.from(b.toString().replaceAll('\r\n', '\n')) : b;
    const actual = sha(normalize(await readFile(path)));
    expect(actual, path).toBe(sha(normalize(git(['show', `${sourceCommit}:${path}`])))); protection.push({ path, sha256: actual });
  }
  const coast = JSON.parse(await readFile('public/assets/manifests/coastal-assembly.json', 'utf8')) as { assets: { input: string; sourceSha256: string }[] };
  for (const a of coast.assets) { const actual = sha(await readFile(a.input)); expect(actual, a.input).toBe(a.sourceSha256); protection.push({ path: a.input, sha256: actual }); }
  const golden = 'docs/references/golden-reference-v1.png';
  const goldenHash = sha(await readFile(golden)); expect(goldenHash).toBe('6d538a42441a2c9b5b2e6736522687fa85aef08b8d87e1a71b0fa3ec2a1e61e3'); protection.push({ path: golden, sha256: goldenHash });
  await writeFile(`${output}/runtime.json`, JSON.stringify({ phase: 'P0/P1 only; pending human review; P2/P3 not run', sourceCommit, browser: browser.version(), backend, viewport: { page: [1600, 1000], canvas: [box.width, box.height], dpr: 1 }, audit, records, tests: { fixedViews: true, aabbWithinAllFixedFrusta: true, bottomInspectionFill: true, drag: true, wheel: true, displayScaleYaw: true, reset: true, portraitLandscapeResize: true, missingFileError: true, changedSourceRejected: true, contextLossError: true, repeatedNavigation: true, defaultRouteNoCottage: true, originalHashUnchanged: true, protectedAssetsMatchSourceCommit: true }, isolatedGlbRequests: [manifest.modelUrl], defaultSourceRequests, protection, errors, warnings, failedRequests }, null, 2) + '\n');
});
