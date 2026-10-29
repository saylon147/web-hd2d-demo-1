import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import process from 'node:process';
import { URL } from 'node:url';
import { Box3, Mesh, Raycaster, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const root = new URL('../../', import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const manifest = await readJson('public/assets/manifests/blockout_v1.json');
const report = await readJson('docs/m2.1/spatial-report.json');
const parameters = (await readFile(new URL('art-source/parameters/island_cottage_v1.json', root), 'utf8')).replace(/\r\n/g, '\n');
const model = await readFile(new URL(`public${manifest.modelUrl}`, root));
const checks = [];
function check(name, condition) { assert.ok(condition, name); checks.push(name); }
function close(a,b) { return Math.abs(a-b) < 0.0001; }
check('GLB 2.0 header and length', model.readUInt32LE(0) === 0x46546c67 && model.readUInt32LE(4) === 2 && model.readUInt32LE(8) === model.length);
check('GLB SHA-256 matches manifest', createHash('sha256').update(model).digest('hex') === manifest.modelSha256);
check('Parameters SHA-256 matches report', createHash('sha256').update(parameters).digest('hex') === report.parametersSha256);
const scene = (await new GLTFLoader().parseAsync(model.buffer.slice(model.byteOffset,model.byteOffset+model.byteLength), '')).scene;
scene.updateMatrixWorld(true);
for (const name of manifest.requiredNodes) check(`Named node: ${name}`, Boolean(scene.getObjectByName(name)));
let meshCount=0, triangleCount=0, missingUv=0;
scene.traverse((object) => {
  if (!(object instanceof Mesh)) return;
  meshCount++;
  const position=object.geometry.getAttribute('position');
  assert.ok(position && position.count > 0, `Nonempty mesh ${object.name}`);
  assert.ok(Array.from(position.array).every(Number.isFinite), `Finite vertices ${object.name}`);
  triangleCount += (object.geometry.index?.count ?? position.count) / 3;
  if (!object.geometry.getAttribute('uv')) missingUv++;
});
check('All meshes have UV channels for later material work', missingUv === 0);
const chunkLength=model.readUInt32LE(12);
const gltf=JSON.parse(model.subarray(20,20+chunkLength).toString('utf8'));
check('Blockout has no image textures', !gltf.images?.length);
check('No Blender cameras or lights exported', !gltf.cameras?.length && !gltf.extensions?.KHR_lights_punctual);
const polygonArea=(o) => Math.abs(o.reduce((sum,a,index) => { const b=o[(index+1)%o.length]; return sum+a[0]*b[1]-b[0]*a[1]; },0))/2;
const landArea=report.land.outlines.reduce((sum,o) => sum+polygonArea(o),0);
check('Usable land area / house footprint is 9', close(landArea/report.land.cottageFootprintM2,9));
check('One above-ground storey + one basement', report.house.aboveGroundStoreys === 1 && report.house.basementStoreys === 1);
check('Basement stays above sea', report.house.seaClearance > 0.5);
const bounds=(name) => new Box3().setFromObject(scene.getObjectByName(name));
const exteriorSize=bounds('ExteriorWalls').getSize(new Vector3());
check('Actual exterior wall footprint matches declared 6×6m area', close(exteriorSize.x*exteriorSize.z,report.land.cottageFootprintM2));
check('Ground slab top is Y=5m', close(bounds('GroundFloor_Slab').max.y,report.house.floorY));
check('Basement floor top is Y=2.2m', close(bounds('Basement_Slab').max.y,report.house.basementFloorY));
check('Basement wall clear height is 2.4m', close(bounds('Basement_Wall_Back').getSize(new Vector3()).y,report.house.basementClearHeight));
check('Ground floor wall clear height is 2.7m', close(bounds('Wall_Back').getSize(new Vector3()).y,report.house.clearHeight));
const house=report.house;
const stair=report.stair;
const slab=scene.getObjectByName('GroundFloor_Slab');
let flightSteps=0;
scene.getObjectByName('StairsDown').traverse((object) => {
  if (!/^Internal_Stair_(Upper|Lower)_\d+$/.test(object.name)) return;
  flightSteps++;
  const center=new Box3().setFromObject(object).getCenter(new Vector3());
  const ray=new Raycaster(new Vector3(center.x,house.floorY+0.1,center.z),new Vector3(0,-1,0),0,0.6);
  assert.equal(ray.intersectObject(slab,false).length,0,`${object.name} must sit under the real slab opening`);
});
check('Both flights fit real slab opening, 16 risers', flightSteps === stair.totalRisers);
check('Viable stair dimensions and headroom', stair.riser <= 0.19 && stair.tread >= 0.26 && stair.flightWidth >= 0.9 && stair.minimumHeadroom >= 2.1 && stair.corridorWidth >= 0.9);
check('Actual wall/door circulation ray checks passed in Blender', report.circulation.wallRayTestsPassed === true);
const cavityRay=new Raycaster(new Vector3(house.center[0],house.basementFloorY+1,house.center[1]),new Vector3(0,1,0),0,2);
check('Basement cavity is not filled by terrain', cavityRay.intersectObject(scene.getObjectByName('TerrainExterior'),true).length === 0);
const axisBytes=await readFile(new URL(`public${manifest.axisUrl}`,root));
const axis=(await new GLTFLoader().parseAsync(axisBytes.buffer.slice(axisBytes.byteOffset,axisBytes.byteOffset+axisBytes.byteLength),'')).scene;
axis.updateMatrixWorld(true);
for (const [name,expected] of [['Axis_PosX',[1,0,0]],['Axis_PosY',[0,0,-1]],['Axis_PosZ',[0,1,0]]]) {
  const point=axis.getObjectByName(name)?.getWorldPosition(new Vector3());
  check(`Real Blender→GLB axis conversion: ${name}`, Boolean(point && point.distanceTo(new Vector3(...expected)) < 0.0001));
}
const result={ passed:true,checks,meshCount,triangleCount,glbBytes:model.length,modelSha256:manifest.modelSha256,
  landAreaM2:landArea,landRatio:landArea/report.land.cottageFootprintM2 };
await writeFile(new URL('docs/m2.1/asset-validation.json',root),JSON.stringify(result,null,2)+'\n');
process.stdout.write(`${checks.length} asset/spatial checks passed; ${meshCount} meshes, ${triangleCount} triangles, ${model.length} bytes.\n`);
