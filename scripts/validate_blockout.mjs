import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import process from 'node:process';
import { URL } from 'node:url';
import { Box3, Mesh, PerspectiveCamera, Raycaster, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const root = new URL('../', import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const manifest = await readJson('public/assets/manifests/blockout_v2.json');
const report = await readJson('docs/m2.1-v1/spatial-report.json');
const parameters = (await readFile(new URL('art-source/parameters/island_cottage_v2.json', root), 'utf8')).replace(/\r\n/g, '\n');
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
const landArea=report.land.areaM2;
check('Connected usable land / footprint is within 8.5–9.5', landArea/report.land.cottageFootprintM2 >= 8.5 && landArea/report.land.cottageFootprintM2 <= 9.5);
check('Occupied pad plus connected exterior equals land area', close(report.land.exteriorNavigableM2+report.land.occupiedCottagePadM2,landArea));
check('Surface survey excludes planted and disconnected pockets', report.land.plantedExcludedM2 > 0 && report.land.disconnectedExcludedM2 > 0);
check('Independent fine/coarse surveys converge within 2sqm', report.land.coarseFineDifferenceM2 < 2);
check('Survey run areas reproduce connected exterior', close(report.land.surveyRunsXZ.reduce((sum,[x,,end]) => sum+(end-x)*report.land.gridStepM,0),report.land.exteriorNavigableM2));
check('One above-ground storey + one basement', report.house.aboveGroundStoreys === 1 && report.house.basementStoreys === 1);
check('Basement stays above sea', report.house.seaClearance > 0.5);
const bounds=(name) => new Box3().setFromObject(scene.getObjectByName(name));
const exteriorSize=bounds('ExteriorWalls').getSize(new Vector3());
check('Actual exterior wall footprint matches declared 6×6m area', close(exteriorSize.x*exteriorSize.z,report.land.cottageFootprintM2));
check('Ground slab top matches declared floor Y', close(bounds('GroundFloor_Slab').max.y,report.house.floorY));
check('Basement floor top matches declared floor Y', close(bounds('Basement_Slab').max.y,report.house.basementFloorY));
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
check('Swept circulation passes at three heights including door head', report.circulation.wallRayTestsPassed === true && report.circulation.sweptWidthM >= 0.6 && report.circulation.rayChecks >= 100);
const cavityRay=new Raycaster(new Vector3(house.center[0],house.basementFloorY+1,house.center[1]),new Vector3(0,1,0),0,2);
check('Basement cavity is not filled by terrain', cavityRay.intersectObject(scene.getObjectByName('TerrainExterior'),true).length === 0);
for (const dx of [-2,0,2]) for (const dz of [-2,0,2]) {
  const ray = new Raycaster(new Vector3(house.center[0]+dx,house.basementFloorY+0.1,house.center[1]+dz),new Vector3(0,1,0),0,2.3);
  check(`Cavity grid (${dx},${dz}) remains empty`, ray.intersectObject(scene.getObjectByName('TerrainExterior'),true).length === 0);
}
check('Moderate diagnostic geometry budget', triangleCount < 10000);
check('Diagnostic palette and restrained lighting', manifest.lighting.exposure <= 1 && manifest.lighting.hemisphere <= 1.1 && manifest.lighting.sun <= 2);
check('Net bedroom and bathroom areas match clear face rectangles', house.groundRooms.slice(1).every((room)=>Math.abs((room.rect[2]-room.rect[0])*(room.rect[3]-room.rect[1])-room.areaM2)<0.001));
const axisBytes=await readFile(new URL(`public${manifest.axisUrl}`,root));
const axis=(await new GLTFLoader().parseAsync(axisBytes.buffer.slice(axisBytes.byteOffset,axisBytes.byteOffset+axisBytes.byteLength),'')).scene;
axis.updateMatrixWorld(true);
for (const [name,expected] of [['Axis_PosX',[1,0,0]],['Axis_PosY',[0,0,-1]],['Axis_PosZ',[0,1,0]]]) {
  const point=axis.getObjectByName(name)?.getWorldPosition(new Vector3());
  check(`Real Blender→GLB axis conversion: ${name}`, Boolean(point && point.distanceTo(new Vector3(...expected)) < 0.0001));
}
const result={ passed:true,checks,meshCount,triangleCount,glbBytes:model.length,modelSha256:manifest.modelSha256,
  landAreaM2:landArea,landRatio:landArea/report.land.cottageFootprintM2 };
await writeFile(new URL('docs/m2.1-v1/asset-validation.json',root),JSON.stringify(result,null,2)+'\n');
process.stdout.write(`${checks.length} asset/spatial checks passed; ${meshCount} meshes, ${triangleCount} triangles, ${model.length} bytes.\n`);

const framing = async (assetScene,version) => {
  assetScene.updateMatrixWorld(true);
  const view=report.views.exterior, target=new Vector3(view.target.x,view.target.y,view.target.z);
  const camera=new PerspectiveCamera(view.fov,1600/866,0.1,200);
  const yaw=(view.baseYaw+view.yawOffset)*Math.PI/180,pitch=view.pitch*Math.PI/180;
  camera.position.set(target.x+view.distance*Math.cos(pitch)*Math.sin(yaw),target.y+view.distance*Math.sin(pitch),target.z+view.distance*Math.cos(pitch)*Math.cos(yaw));
  camera.lookAt(target);camera.updateMatrixWorld();camera.updateProjectionMatrix();
  const projected=(names)=>{
    const xs=[],ys=[];
    for(const name of names)assetScene.getObjectByName(name).traverse((obj)=>{
      if(!(obj instanceof Mesh))return;
      const positions=obj.geometry.getAttribute('position');
      for(let j=0;j<positions.count;j++){
        const v=new Vector3().fromBufferAttribute(positions,j).applyMatrix4(obj.matrixWorld).project(camera);
        xs.push((v.x+1)/2);ys.push((1-v.y)/2);
      }
    });
    const bounds=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
    return {boundsNormalized:bounds,widthFraction:bounds[2]-bounds[0],heightFraction:bounds[3]-bounds[1]};
  };
  return {version,cottage:projected(['Roof','ExteriorWalls']),island:projected(['TerrainExterior','Shoreline','Pier','Garden','Roof','ExteriorWalls'])};
};
const oldBytes=await readFile(new URL('public/assets/models/island_cottage_blockout_v1.glb',root));
const oldScene=(await new GLTFLoader().parseAsync(oldBytes.buffer.slice(oldBytes.byteOffset,oldBytes.byteOffset+oldBytes.byteLength),'')).scene;
await writeFile(new URL('docs/m2.1-v1/camera-framing.json',root),JSON.stringify({method:'project all mesh vertices of selected exterior groups to the same camera; bounding rectangles, not pixel silhouette occupancy',camera:report.views.exterior,canvas:{width:1600,height:866},versions:[await framing(oldScene,'V0'),await framing(scene,'V1')]},null,2)+'\n');
