import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, URL } from 'node:url';
import { resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Box3, Mesh, Vector3 } from 'three';

const root=fileURLToPath(new URL('../',import.meta.url));
const config=JSON.parse(await readFile(resolve(root,'art-source/tripo/rock_pipeline.json'),'utf8'));
const manifest=JSON.parse(await readFile(resolve(root,config.manifest),'utf8'));
const source=await readFile(resolve(root,config.input));
assert.equal(createHash('sha256').update(source).digest('hex'),manifest.sourceSha256,'Original hash must remain unchanged');
const records=[];
for(const variant of manifest.variants) {
  const bytes=await readFile(resolve(root,'public'+variant.modelUrl));
  assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),variant.sha256);
  const jsonLength=bytes.readUInt32LE(12), doc=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
  assert.equal(doc.images.length,3);assert.equal(doc.materials.length,1);
  const material=doc.materials[0];
  assert.equal(material.pbrMetallicRoughness.baseColorTexture.index,0);assert.equal(material.pbrMetallicRoughness.metallicRoughnessTexture.index,1);assert.equal(material.normalTexture.index,2);
  assert.ok(!doc.extensionsRequired?.length);
  for(const image of doc.images)assert.ok(doc.bufferViews[image.bufferView].byteLength>0 && ['image/jpeg','image/png'].includes(image.mimeType));
  const geometricDoc=JSON.parse(JSON.stringify(doc));
  delete geometricDoc.materials;delete geometricDoc.images;delete geometricDoc.textures;delete geometricDoc.samplers;delete geometricDoc.extensionsUsed;
  for(const mesh of geometricDoc.meshes)for(const primitive of mesh.primitives)delete primitive.material;
  let json=Buffer.from(JSON.stringify(geometricDoc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
  const binary=bytes.subarray(20+jsonLength+8), header=Buffer.alloc(20), binaryHeader=Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binary.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
  binaryHeader.writeUInt32LE(binary.length);binaryHeader.writeUInt32LE(0x004e4942,4);
  const stripped=Buffer.concat([header,json,binaryHeader,binary]);
  const scene=(await new GLTFLoader().parseAsync(stripped.buffer.slice(stripped.byteOffset,stripped.byteOffset+stripped.byteLength),'')).scene;
  scene.updateMatrixWorld(true);
  let triangles=0;
  scene.traverse((obj)=>{
    if(!(obj instanceof Mesh))return;
    triangles+=(obj.geometry.index?.count??obj.geometry.getAttribute('position').count)/3;
    for(const name of ['position','normal','uv']) {
      const attribute=obj.geometry.getAttribute(name);assert.ok(attribute?.count>0);
      assert.ok(Array.from(attribute.array).every(Number.isFinite));
    }
  });
  assert.equal(triangles,variant.triangleCount);
  const bounds=new Box3().setFromObject(scene), size=bounds.getSize(new Vector3()), center=bounds.getCenter(new Vector3());
  if(!variant.original) {
    assert.ok(Math.abs(size.x-config.runtimeWidthM)<0.02);
    assert.ok(Math.abs(bounds.min.y)<0.02 && Math.abs(center.x)<0.02 && Math.abs(center.z)<0.02);
    assert.ok(triangles/variant.trianglesTarget>=0.85 && triangles/variant.trianglesTarget<=1.15);
    assert.equal(variant.topology.boundaryEdges,0);assert.equal(variant.topology.nonmanifoldEdges,0);
    assert.equal(variant.topology.connectedShellCount,1);
  }
  records.push({id:variant.id,triangles,fileBytes:bytes.length,dimensions:size.toArray(),origin:[center.x,bounds.min.y,center.z],maps:3,passed:true});
}
await writeFile(resolve(root,'artifacts/tripo-rock/validation.json'),JSON.stringify({passed:true,originalPreserved:true,geometryParser:'independent Three.js GLTFLoader with textures omitted only in this Node geometry check; browser tests validate all actual PBR bindings/color spaces',records},null,2)+'\n');
process.stdout.write(`${records.length} Tripo variants passed independent geometry, PBR metadata, bounds, topology and hash checks.\n`);
