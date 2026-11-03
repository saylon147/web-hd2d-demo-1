import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, URL } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(await readFile(resolve(root, 'art-source/tripo/cottage-candidate-01.json'), 'utf8'));
const preset = JSON.parse(await readFile(resolve(root, 'public/assets/presets/cottage-candidate-01.json'), 'utf8'));
const input = resolve(root, config.sourceFile);
execFileSync(process.env.COTTAGE_PYTHON ?? 'python', ['scripts/inspect_glb.py', input, '--output', config.inspectionOutput], { cwd: root, windowsHide: true, stdio: 'inherit' });
const inspection = JSON.parse(await readFile(resolve(root, config.inspectionOutput), 'utf8'));
inspection.input = config.sourceFile;
const bytes = await readFile(input), jsonLength = bytes.readUInt32LE(12);
const doc = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString()), bin = bytes.subarray(28 + jsonLength);
if (inspection.extensionsRequired.length) throw new Error('Required GLB extensions need explicit support before preview');
const bounds = new Box3(); let positionSamples = 0;
const point = new Vector3();
const visit = (id, parent) => {
  const node = doc.nodes[id];
  const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(new Vector3(...(node.translation ?? [0, 0, 0])), new Quaternion(...(node.rotation ?? [0, 0, 0, 1])), new Vector3(...(node.scale ?? [1, 1, 1])));
  const world = parent.clone().multiply(local);
  if (node.mesh !== undefined) for (const primitive of doc.meshes[node.mesh].primitives) {
    const accessor = doc.accessors[primitive.attributes.POSITION], view = doc.bufferViews[accessor.bufferView];
    if (accessor.sparse || accessor.componentType !== 5126 || accessor.type !== 'VEC3' || primitive.mode !== undefined && primitive.mode !== 4) throw new Error('Unsupported sparse/encoded POSITION or non-triangle geometry');
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0), stride = view.byteStride ?? 12;
    for (let i = 0; i < accessor.count; i++) {
      const o = start + i * stride;
      point.set(bin.readFloatLE(o), bin.readFloatLE(o + 4), bin.readFloatLE(o + 8)).applyMatrix4(world);
      if (![point.x, point.y, point.z].every(Number.isFinite)) throw new Error('Non-finite actual vertex');
      bounds.expandByPoint(point); positionSamples++;
    }
  }
  for (const child of node.children ?? []) visit(child, world);
};
for (const node of doc.scenes[doc.scene ?? 0].nodes) visit(node, new Matrix4());
const size = bounds.getSize(new Vector3()), center = bounds.getCenter(new Vector3());
const spatial = { aabb: { min: bounds.min.toArray(), max: bounds.max.toArray() }, dimensions: size.toArray(), center: center.toArray(), positionSamples, method: 'every actual POSITION vertex with full scene-node matrices; unmodified authored GLB units', axis: 'glTF +Y up, right-handed; no extra Blender rotation', units: 'glTF unit convention; Tripo normalized scale is not calibrated to this island', front: preset.frontMeaning, frontYawDegrees: preset.frontYawDegrees };
await writeFile(resolve(root, config.inspectionOutput), JSON.stringify({ ...inspection, sceneCount: doc.scenes.length, nodeCount: doc.nodes.length, vertexCount: inspection.primitives.reduce((sum, p) => sum + p.vertices, 0), spatial }, null, 2) + '\n');
const manifest = { schemaVersion: 1, id: config.id, approval: 'P0-P1 HD inspection only, pending human review', sourceFile: config.sourceFile, modelUrl: config.localUrl, sha256: createHash('sha256').update(bytes).digest('hex'), fileBytes: bytes.length, nodeCount: doc.nodes.length, meshCount: inspection.meshes, vertexCount: inspection.primitives.reduce((sum, p) => sum + p.vertices, 0), triangleCount: inspection.triangleCount, materialCount: inspection.materials.length, images: inspection.images, spatial, extensionsUsed: inspection.extensionsUsed, textureEstimateBytes: Math.round(inspection.gpuTextureRgbaMipEstimateBytes), lighting: { hemisphere: 1.05, sun: 2, exposure: 1, sunPosition: [-8, 15, 10] } };
await writeFile(resolve(root, config.manifestOutput), JSON.stringify(manifest, null, 2) + '\n');
process.stdout.write(JSON.stringify({ input, fileBytes: bytes.length, vertices: manifest.vertexCount, triangles: manifest.triangleCount, spatial }, null, 2) + '\n');
