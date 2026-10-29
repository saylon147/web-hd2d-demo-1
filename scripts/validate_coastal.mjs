import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';
import { Box3, Mesh, Raycaster, Vector3 } from 'three';
import { parseGlbGeometry } from './glb_geometry.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const json = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const config = await json('art-source/tripo/coastal_pipeline.json');
const manifest = await json(config.manifest), preset = await json(config.placements), parameters = await json(config.baselineParameters);
assert.ok(manifest.complete && manifest.assets.length === 4, 'Missing A1–A4; put all agreed GLBs in inbox before full validation.');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const scenes = new Map(), records = [];
for (const asset of manifest.assets) {
  const original = await readFile(resolve(root, asset.input));
  assert.equal(hash(original), asset.sourceSha256, `${asset.id} source changed; rerun only this asset`);
  const topology = await json(`${config.reports}/${asset.id}/source-topology.json`);
  for (const variant of asset.variants) {
    const bytes = await readFile(resolve(root, 'public' + variant.modelUrl));
    assert.equal(hash(bytes), variant.sha256); assert.equal(bytes.length, variant.fileBytes);
    const { scene, document } = await parseGlbGeometry(bytes);
    assert.equal(document.meshes.length, 1); assert.equal(document.materials.length, 1); assert.equal(document.images.length, 3);
    assert.ok(!document.extensionsRequired?.length);
    const material = document.materials[0];
    assert.equal(material.pbrMetallicRoughness.baseColorTexture.index, 0); assert.equal(material.pbrMetallicRoughness.metallicRoughnessTexture.index, 1); assert.equal(material.normalTexture.index, 2);
    let triangles = 0, nonunitNormals = 0;
    scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
      for (const name of ['position', 'normal', 'uv']) {
        const attribute = object.geometry.getAttribute(name); assert.ok(attribute?.count > 0);
        for (const value of attribute.array) assert.ok(Number.isFinite(value));
      }
      const normals = object.geometry.getAttribute('normal');
      for (let i = 0; i < normals.count; i++) if (Math.abs(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i)) - 1) > 0.02) nonunitNormals++;
    });
    assert.equal(nonunitNormals, 0); assert.equal(triangles, variant.triangleCount);
    const target = Number(variant.id.split('-')[0].replace('k', '')) * 1000;
    assert.ok(Math.abs(triangles / target - 1) < 0.15);
    assert.ok(variant.images.every((image) => Math.max(...image.dimensions) <= Number(variant.id.split('-')[1].replace('k', '')) * 1024));
    assert.equal(variant.topology.boundaryEdges, 0); assert.equal(variant.topology.nonmanifoldEdges, 0); assert.equal(variant.topology.connectedShellCount, 1);
    const bounds = new Box3().setFromObject(scene), size = bounds.getSize(new Vector3()), center = bounds.getCenter(new Vector3());
    assert.ok(Math.abs(size.x - asset.runtimeWidthM) < 0.03 && Math.abs(bounds.min.y) < 0.02 && Math.abs(center.x) < 0.02 && Math.abs(center.z) < 0.02);
    records.push({ asset: asset.id, lod: variant.id, sourceSha256: asset.sourceSha256, sourceTopology: topology, triangles, dimensions: size.toArray(), origin: [center.x, bounds.min.y, center.z], normalVectorsUnit: true, passed: true });
    if (variant.id === manifest.defaultVariant) scenes.set(asset.id, scene);
  }
}
const baselineFiles = ['art-source/parameters/island_cottage_v2.json', 'art-source/blender/island_cottage_blockout_v2.blend', 'public/assets/models/island_cottage_blockout_v2.glb', 'public/assets/manifests/blockout_v2.json', 'public/assets/models/island_cottage_blockout_v1.glb'];
const preservation = [];
for (const path of baselineFiles) {
  const prior = execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, 'show', `${config.baselineRef}:${path}`], { cwd: root, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const current = await readFile(resolve(root, path));
  const normalize = (bytes) => path.endsWith('.json') ? bytes.toString().replaceAll('\r\n', '\n') : bytes;
  assert.equal(hash(normalize(prior)), hash(normalize(current)), `Baseline changed: ${path}`);
  preservation.push({ path, sha256: hash(normalize(current)), unchanged: true });
}
const { scene: baseline } = await parseGlbGeometry(await readFile(resolve(root, 'public/assets/models/island_cottage_blockout_v2.glb')));
const placed = preset.placements.map((placement) => {
  const scene = scenes.get(placement.asset).clone(true);
  scene.position.set(...placement.position); scene.scale.set(...placement.scale); scene.rotation.y = placement.yaw * Math.PI / 180; scene.updateMatrixWorld(true);
  return { placement, scene, bounds: new Box3().setFromObject(scene) };
});
const house = parameters.house, island = parameters.island, pier = parameters.pier;
const protectedVolumes = [
  new Box3(new Vector3(house.center[0] - house.width / 2, house.basementFloorY, house.center[1] - house.depth / 2), new Vector3(house.center[0] + house.width / 2, house.floorY + house.clearHeight, house.center[1] + house.depth / 2)),
  new Box3(new Vector3(island.mainStairX - island.mainStairWidth / 2, island.beachY, island.mainStairStartZ), new Vector3(island.mainStairX + island.mainStairWidth / 2, island.plateauY + 0.1, pier.startZ)),
  new Box3(new Vector3(island.mainStairX - pier.width / 2, 0, pier.startZ), new Vector3(island.mainStairX + pier.width / 2, 1, pier.startZ + pier.length)),
];
const contacts = [];
for (const { placement, scene, bounds } of placed) {
  assert.ok(protectedVolumes.every((volume) => !bounds.intersectsBox(volume)), `${placement.id} overlaps house/basement/stair/pier envelope`);
  const terrain = baseline.getObjectByName('Organic_Coastal_Mass');
  const ray = new Raycaster(new Vector3(placement.position[0], 20, placement.position[2]), new Vector3(0, -1, 0), 0, 30);
  const candidates = [terrain, ...placed.filter((item) => item.scene !== scene).map((item) => item.scene)].filter(Boolean);
  const support = ray.intersectObjects(candidates, true)[0]?.point.y ?? -Infinity;
  if (placement.position[1] > 0) assert.ok(support >= placement.position[1], `${placement.id} center is unsupported`);
  contacts.push({ instance: placement.id, asset: placement.asset, min: bounds.min.toArray(), max: bounds.max.toArray(), centerSupportY: Number.isFinite(support) ? support : null, anchorY: placement.position[1], centerBurialM: Number.isFinite(support) ? Math.max(0, support - placement.position[1]) : null, protectedEnvelopesClear: true });
}
const spatial = await json('docs/m2.1-v1/spatial-report.json'), outline = spatial.land.outlines?.[0] ?? spatial.terrain?.outlines?.[0];
let perimeter = 0, coveredArc = 0;
if (outline) for (let i = 0; i < outline.length; i++) {
  const a = outline[i], b = outline[(i + 1) % outline.length], length = Math.hypot(a[0] - b[0], a[1] - b[1]);
  const x = (a[0] + b[0]) / 2, z = (a[1] + b[1]) / 2;
  perimeter += length;
  if (placed.some(({ bounds }) => x >= bounds.min.x && x <= bounds.max.x && z >= bounds.min.z && z <= bounds.max.z)) coveredArc += length;
}
assert.deepEqual(preset.cameraViews.golden, parameters.views.exterior, 'Golden A/B camera must match actual baseline exterior');
await writeFile(resolve(root, config.reports, 'validation.json'), JSON.stringify({ passed: true, geometryParser: 'independent Three.js GLTFLoader (textures stripped only for Node; browser validates actual PBR maps)', records, preservation,
  worldScale: { house, island, pier, fixedCamera: parameters.views.exterior, lighting: parameters.lighting }, contacts,
  footprintEstimate: { perimeterM: perimeter, coveredArcM: coveredArc, percent: perimeter ? 100 * coveredArc / perimeter : null, method: 'plateau edge segment midpoints in transformed instance AABBs; conservative footprint estimate, not pixel visibility or walkable area' } }, null, 2) + '\n');
process.stdout.write(`${records.length} coastal candidates passed hashes, geometry, UV/normals, PBR metadata, axes/pivots, baseline preservation and protected-envelope checks.\n`);
