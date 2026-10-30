import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { Box3, Vector3 } from 'three';

const output = 'docs/m2.2-coastal-assembly/review-gates/G02';
interface Instance { id: string; matrixWorld: number[]; actualBounds: { min: number[]; max: number[] }; samples: { gapM: number | null; terrainAbove: boolean; otherAbove: boolean }[]; [key: string]: unknown }
interface Metric { mask: [number, number][]; bottomPixelsEstimate: number; downwardPixelsEstimate: number; bottomPercentOfVisible: number; [key: string]: unknown }
const hash = (buffer: Buffer): string => createHash('sha256').update(buffer).digest('hex');

test('G02 captures three bounded front-shoulder candidates with immutable neighbours and assets', async ({ page, browser }) => {
  test.setTimeout(240_000);
  await mkdir(output, { recursive: true });
  const errors: string[] = [], failedRequests: string[] = [], badResponses: object[] = [];
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.text()); });
  page.on('requestfailed', (r) => failedRequests.push(r.url())); page.on('response', (r) => { if (r.status() >= 400) badResponses.push({ url: r.url(), status: r.status() }); });
  await page.setViewportSize({ width: 1600, height: 1100 });
  await page.goto('/?scene=coastal-assembly&diagnostic=g02');
  await page.addStyleTag({ content: '.viewport{flex:none!important;height:811px!important}.scene-heading,.scene-footer{visibility:hidden!important}' });
  const canvas = page.locator('#scene');
  const ready = async (): Promise<void> => {
    await expect(canvas).toHaveAttribute('data-loaded', 'true', { timeout: 30_000 });
    await expect(canvas).toHaveAttribute('data-rendered', 'true', { timeout: 30_000 });
  };
  await ready(); await expect(canvas).toHaveAttribute('data-g02-candidate', 'baseline');
  const originalReport = JSON.parse(await canvas.getAttribute('data-g01-report') ?? '{}') as { instances: Instance[] };
  const original = originalReport.instances.filter((i) => i.id !== 'front-shoulder');
  const records: object[] = [], geometries: object[] = [];
  const masks: { candidate: string; metric: Metric }[] = [];
  const parameters = JSON.parse(await readFile('art-source/parameters/island_cottage_v2.json', 'utf8')) as { house: { center: [number, number]; width: number; depth: number; basementFloorY: number; floorY: number; clearHeight: number }; island: { mainStairX: number; mainStairWidth: number; mainStairStartZ: number; beachY: number; plateauY: number }; pier: { width: number; startZ: number; length: number } };
  const { house, island, pier } = parameters;
  const protectedVolumes = [
    new Box3(new Vector3(house.center[0] - house.width / 2, house.basementFloorY, house.center[1] - house.depth / 2), new Vector3(house.center[0] + house.width / 2, house.floorY + house.clearHeight, house.center[1] + house.depth / 2)),
    new Box3(new Vector3(island.mainStairX - island.mainStairWidth / 2, island.beachY, island.mainStairStartZ), new Vector3(island.mainStairX + island.mainStairWidth / 2, island.plateauY + 0.1, pier.startZ)),
    new Box3(new Vector3(island.mainStairX - pier.width / 2, 0, pier.startZ), new Vector3(island.mainStairX + pier.width / 2, 1, pier.startZ + pier.length)),
  ];
  for (const candidate of ['baseline', 'C1', 'C2', 'C3']) {
    await page.selectOption('#g02-candidate', candidate); await ready();
    await expect(canvas).toHaveAttribute('data-g02-candidate', candidate);
    const report = JSON.parse(await canvas.getAttribute('data-g01-report') ?? '{}') as { instances: Instance[] };
    // Neighbour support samples may change because the subject moved; their actual matrices and bounds cannot.
    for (const neighbour of original) {
      const actual = report.instances.find((i) => i.id === neighbour.id)!;
      expect(actual.matrixWorld).toEqual(neighbour.matrixWorld); expect(actual.actualBounds).toEqual(neighbour.actualBounds);
    }
    const subject = report.instances.find((i) => i.id === 'front-shoulder')!;
    const subjectBounds = new Box3(new Vector3().fromArray(subject.actualBounds.min), new Vector3().fromArray(subject.actualBounds.max));
    expect(protectedVolumes.every((volume) => !subjectBounds.intersectsBox(volume)), `${candidate} house/basement/stairs/pier protection`).toBe(true);
    const gaps = subject.samples.filter((s) => !s.terrainAbove && !s.otherAbove && s.gapM !== null && s.gapM > 0.05).map((s) => s.gapM!).sort((a, b) => a - b);
    geometries.push({ candidate, instance: subject, gapSummary: { finiteGapSamples: gaps.length, medianM: gaps.length ? gaps[Math.floor(gaps.length / 2)] : null, p95M: gaps.length ? gaps[Math.floor((gaps.length - 1) * 0.95)] : null, maxM: gaps.length ? gaps.at(-1) : null }, neighbours: report.instances.filter((i) => i.id !== 'front-shoulder').map((i) => ({ id: i.id, matrixWorld: i.matrixWorld, actualBounds: i.actualBounds })) });
    for (const view of ['golden', 'side', 'below']) {
      await page.selectOption('#g01-view', view); await ready();
      const metric = JSON.parse(await canvas.getAttribute('data-g02-metrics') ?? '{}') as Metric;
      const rect = await canvas.boundingBox(); expect(rect?.width).toBe(1600); expect(rect?.height).toBe(811);
      await canvas.screenshot({ path: `${output}/${candidate}-${view}.png` });
      records.push({ candidate, view, camera: JSON.parse(await canvas.getAttribute('data-g01-camera') ?? '{}'), metric: { ...metric, mask: undefined } });
      if (view === 'below') masks.push({ candidate, metric });
    }
  }
  // The normal scene ignores candidate parameters unless the G02 route is explicitly active.
  await page.goto('/?scene=coastal-assembly&candidate=C3'); await ready();
  expect(await canvas.getAttribute('data-g02-candidate')).toBeNull();
  const baselineBounds = JSON.parse(await canvas.getAttribute('data-world-bounds') ?? '[]') as object[];
  const priorBounds = JSON.parse(await readFile('docs/m2.2-coastal-assembly/review-gates/G01/original-runtime.json', 'utf8')) as { bounds: object[] };
  expect(baselineBounds).toEqual(priorBounds.bounds);
  const preservation = [];
  for (const path of ['public/assets/presets/coastal-assembly.json', 'public/assets/presets/coastal-g01.json', 'src/world/coastal.ts', 'src/world/blockout.ts', 'art-source/parameters/island_cottage_v2.json', 'public/assets/manifests/blockout_v2.json', 'public/assets/models/island_cottage_blockout_v2.glb', 'public/assets/models/island_cottage_blockout_v1.glb']) {
    const before = execFileSync('git', ['-c', `safe.directory=${resolve('.').replaceAll('\\', '/')}`, 'show', `382401c:${path}`], { windowsHide: true, maxBuffer: 64 * 1024 * 1024 }), after = await readFile(path);
    const normalize = (buffer: Buffer): Buffer => /\.(json|ts)$/.test(path) ? Buffer.from(buffer.toString().replaceAll('\r\n', '\n')) : buffer;
    expect(hash(normalize(after)), path).toBe(hash(normalize(before))); preservation.push({ path, sha256: hash(normalize(after)), unchanged: true });
  }
  const manifest = JSON.parse(await readFile('public/assets/manifests/coastal-assembly.json', 'utf8')) as { assets: { id: string; input: string; sourceSha256: string; variants: { modelUrl: string; sha256: string }[] }[] };
  for (const asset of manifest.assets) for (const entry of [{ path: asset.input, sha256: asset.sourceSha256 }, ...asset.variants.map((v) => ({ path: 'public' + v.modelUrl, sha256: v.sha256 }))]) {
    expect(hash(await readFile(entry.path)), entry.path).toBe(entry.sha256); preservation.push({ path: entry.path, sha256: entry.sha256, unchanged: true });
  }
  const sheet = await browser.newPage({ deviceScaleFactor: 1 });
  try {
    for (const { candidate, metric } of masks) {
      const source = (await readFile(`${output}/${candidate}-below.png`)).toString('base64');
      await sheet.setViewportSize({ width: 1600, height: 811 });
      await sheet.setContent(`<style>body{margin:0}</style><svg xmlns="http://www.w3.org/2000/svg" width="1600" height="811"><image href="data:image/png;base64,${source}" width="1600" height="811"/>${metric.mask.map(([x, y]) => `<rect x="${x}" y="${y}" width="6" height="6" fill="#ef3aa9" opacity=".8"/>`).join('')}<rect x="20" y="20" width="650" height="50" fill="#172b34"/><text x="35" y="51" fill="white" font-family="Consolas" font-size="20">${candidate}: bottom estimate ${metric.bottomPixelsEstimate}px / 6px grid</text></svg>`);
      await sheet.screenshot({ path: `${output}/${candidate}-below-mask.png` });
    }
    for (const [view, crop] of [['golden', [740, 420, 540, 370]], ['side', [430, 290, 740, 350]], ['below', [350, 300, 850, 350]]] as const) {
      const cells = [];
      for (const candidate of ['baseline', 'C1', 'C2', 'C3']) {
        const source = (await readFile(`${output}/${candidate}-${view}.png`)).toString('base64');
        cells.push(`<article><h2>${candidate}</h2><svg viewBox="${crop.join(' ')}"><image href="data:image/png;base64,${source}" width="1600" height="811"/></svg></article>`);
      }
      await sheet.setViewportSize({ width: 2000, height: 460 });
      await sheet.setContent(`<style>body{margin:0;padding:18px;background:#edf0e8;font-family:Segoe UI,Microsoft YaHei;color:#243d33}h1{font-size:22px;margin:0 0 12px}.row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}h2{font-size:17px;margin:0;padding:10px;background:#d5ddcf}svg{display:block;width:100%;height:340px;background:#e3e7e4}</style><h1>G02 / front-shoulder A4 · ${view} · same camera, light and crop</h1><div class="row">${cells.join('')}</div>`);
      await sheet.screenshot({ path: `${output}/comparison-${view}.png` });
    }
  } finally { await sheet.close(); }
  await writeFile(`${output}/measurements.json`, JSON.stringify({ browser: browser.version(), viewport: { width: 1600, height: 811, dpr: 1 }, records, geometries, errors, failedRequests, badResponses, preservation }, null, 2) + '\n');
  expect(errors).toEqual([]); expect(failedRequests).toEqual([]); expect(badResponses).toEqual([]);
});
