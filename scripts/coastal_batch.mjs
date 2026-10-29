import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(readFileSync(resolve(root, 'art-source/tripo/coastal_pipeline.json'), 'utf8'));
const args = process.argv.slice(2);
const assetIndex = args.indexOf('--asset');
const selected = assetIndex < 0 ? config.assets : config.assets.filter((asset) => asset.id === args[assetIndex + 1]);
if (!selected.length) throw new Error('Unknown coastal asset; use --asset A1/A2/A3/A4.');
const defaultBlender = 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe';
const blender = process.env.BLENDER_PATH || (existsSync(defaultBlender) ? defaultBlender : 'blender');
const run = (script, argv) => new Promise((done, reject) => {
  const child = spawn(blender, ['--background', '--factory-startup', '--python-exit-code', '1', '--python', resolve(root, script), '--', ...argv], { cwd: root, windowsHide: true, stdio: 'inherit' });
  child.on('error', (error) => reject(new Error(`Blender unavailable. Set BLENDER_PATH. ${error.message}`)));
  child.on('exit', (code) => code === 0 ? done() : reject(new Error(`${script} failed (exit ${code}). Rerun the failed item with --asset ID.`)));
});
const missing = config.assets.filter((asset) => !existsSync(resolve(root, asset.input)));
mkdirSync(resolve(root, config.reports), { recursive: true });
const records = [];
for (const asset of selected) {
  if (!existsSync(resolve(root, asset.input))) { records.push({ id: asset.id, status: 'missing', expected: asset.input }); continue; }
  const reportDir = `${config.reports}/${asset.id}`;
  const item = {
    ...asset, schemaVersion: 1, outputDirectory: `${config.outputDirectory}/${asset.id}`,
    reports: reportDir, blend: `${config.workingDirectory}/${asset.id}/coastal.blend`,
    manifest: `${reportDir}/variants.json`, triangleTargets: [20000, 10000], textureLimits: [2048, 1024],
    runtimeUrlPrefix: `/assets/models/coastal-assembly/${asset.id}/`, defaultVariant: config.defaultVariant,
    placement: [0, 0, 0], rotationYDegrees: 0,
    lighting: { hemisphere: 1.05, sun: 2, exposure: 1 },
    inspectionCamera: { target: [0, 1, 0], pitch: 42, distance: 15, fov: 35, frontYaw: 35, sideYaw: 125, backYaw: 215 },
    performance: { warmupFrames: 60, sampleFrames: 120 }, evidence: config.evidence,
  };
  mkdirSync(resolve(root, reportDir), { recursive: true });
  const itemPath = resolve(root, reportDir, 'config.json');
  writeFileSync(itemPath, JSON.stringify(item, null, 2) + '\n');
  if (!args.includes('--render-only')) await run('scripts/optimize_tripo_asset.py', ['--config', itemPath]);
  if (!args.includes('--no-render')) await run('scripts/render_coastal.py', [itemPath]);
  records.push({ id: asset.id, status: 'processed' });
}
const assets = config.assets.map((asset) => {
  const itemPath = resolve(root, config.reports, asset.id, 'variants.json');
  if (!existsSync(itemPath) || missing.some((item) => item.id === asset.id)) return { ...asset, status: 'missing', variants: [] };
  const item = JSON.parse(readFileSync(itemPath, 'utf8'));
  const variants = item.variants.filter((variant) => config.variants.includes(variant.id)).map((variant) => {
    const bounds = variant.primitives[0].positionBounds;
    return { id: variant.id, modelUrl: variant.modelUrl, sha256: variant.sha256, fileBytes: variant.fileBytes, triangleCount: variant.triangleCount,
      dimensions: bounds[1].map((value, axis) => value - bounds[0][axis]), bounds, images: variant.images,
      gpuTextureRgbaMipEstimateBytes: variant.gpuTextureRgbaMipEstimateBytes, topology: variant.topology };
  });
  const original = item.variants.find((variant) => variant.original);
  return { ...asset, status: 'optimized-awaiting-review', sourceSha256: item.sourceSha256, sourceBytes: original.fileBytes,
    sourceTriangles: original.triangleCount, sourceBounds: original.primitives[0].positionBounds,
    variants, normalBakingPerformed: false, constraints: 'One mesh, one primitive, one PBR material; active extensions rejected. Uniform normalization, no source mutation.' };
});
mkdirSync(resolve(root, 'public/assets/manifests'), { recursive: true });
writeFileSync(resolve(root, config.manifest), JSON.stringify({ schemaVersion: 1, approval: 'experimental-awaiting-human', units: 'meters', upAxis: 'Y', defaultVariant: config.defaultVariant, complete: !missing.length && assets.every((asset) => asset.variants.length === config.variants.length), assets }, null, 2) + '\n');
writeFileSync(resolve(root, config.reports, 'batch-run.json'), JSON.stringify({ missing: missing.map((asset) => asset.input), records }, null, 2) + '\n');
if (missing.length) { process.stderr.write(`Missing coastal GLBs: ${missing.map((asset) => asset.input).join(', ')}. Existing assets audited/rendered; full assembly is unavailable.\n`); process.exitCode = 1; }
