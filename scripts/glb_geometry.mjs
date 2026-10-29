import { Buffer } from 'node:buffer';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import assert from 'node:assert/strict';

export async function parseGlbGeometry(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67); assert.equal(bytes.readUInt32LE(4), 2); assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonLength = bytes.readUInt32LE(12), document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const doc = JSON.parse(JSON.stringify(document));
  delete doc.materials; delete doc.images; delete doc.textures; delete doc.samplers; delete doc.extensionsUsed;
  for (const mesh of doc.meshes) for (const primitive of mesh.primitives) delete primitive.material;
  let json = Buffer.from(JSON.stringify(doc)); json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
  const binary = bytes.subarray(20 + jsonLength + 8), header = Buffer.alloc(20), chunk = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + binary.length, 8);
  header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16); chunk.writeUInt32LE(binary.length); chunk.writeUInt32LE(0x004e4942, 4);
  const stripped = Buffer.concat([header, json, chunk, binary]);
  const scene = (await new GLTFLoader().parseAsync(stripped.buffer.slice(stripped.byteOffset, stripped.byteOffset + stripped.byteLength), '')).scene;
  scene.updateMatrixWorld(true);
  return { scene, document };
}
