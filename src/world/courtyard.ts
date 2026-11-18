import { createLightingRig } from './courtyardLighting';
import { AxesHelper, Box3, BoxGeometry, Color, CylinderGeometry, DirectionalLight, DodecahedronGeometry, FogExp2, GridHelper, HemisphereLight, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Object3D, Scene, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeObject } from '../core/dispose';
import type { FoundationWorld } from './foundation';
import { CAMERA_DEFAULTS, CAMERA_LIMITS } from '../config/camera';

export const courtyardCamera = {
  defaults: { ...CAMERA_DEFAULTS, baseYaw: 28, pitch: 35, distance: 27, target: { x: 0, y: 1.15, z: 0.1 } },
  limits: { ...CAMERA_LIMITS, distance: { min: 9, max: 38 } },
};
const cottageUrl = import.meta.env.BASE_URL + 'assets/models/courtyard_cottage_preview.glb';

export async function createCourtyardWorld(signal: AbortSignal): Promise<FoundationWorld & {setLighting:ReturnType<typeof createLightingRig>}> {
  const response = await fetch(cottageUrl, { signal });
  if (!response.ok) throw new Error(`小屋模型加载失败（HTTP ${response.status}）`);
  const { scene: house } = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
  const bounds = new Box3().setFromObject(house);
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  const scale = 6.7 / size.x;
  house.scale.setScalar(scale);
  house.position.set(2.5-center.x*scale, -bounds.min.y*scale, -2.7-center.z*scale);
  house.traverse(o => { if (o instanceof Mesh) { o.castShadow = true; o.receiveShadow = true; } });
  const scene = new Scene();
  scene.background = new Color('#d7d2af');
  scene.fog = new FogExp2('#d7d2af', 0.012);
  scene.add(house);
  const geometry = {
    block: new BoxGeometry(1,1,1), leaf: new DodecahedronGeometry(1),
    pole: new CylinderGeometry(0.42,0.5,1,8), slab: new CylinderGeometry(0.5,0.54,1,7),
  };
  type Shape = keyof typeof geometry;
  const batches = new Map<Shape, {matrix: Matrix4; color: Color}[]>();
  const pose = new Object3D();
  let seed = 2211;
  const rand = () => { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed/4294967296; };
  const pick = (colors: string[]) => { const color = colors[Math.floor(rand()*colors.length)]; if (!color) throw new Error('Empty garden palette'); return color; };
  function put(shape: Shape, color: string, x:number,y:number,z:number,w:number,h:number,d:number,yaw=0,tilt=0) {
    pose.position.set(x,y,z); pose.scale.set(w,h,d); pose.rotation.set(0,yaw,tilt); pose.updateMatrix();
    const batch = batches.get(shape) ?? [];
    batch.push({matrix:pose.matrix.clone(),color:new Color(color)});
    batches.set(shape,batch);
  }
  const greens = ['#697d36','#839442','#9da84a','#596f37','#7e9041'];
  const stone = ['#c1aa80','#d1bb94','#bda17b','#d6c3a0','#b9a27a'];
  const wood = '#845c39';
  put('block','#a7ab78',0,-0.14,0,160,0.25,160);
  // Broad patches and small grass blades break up the ground around the garden.
  for (let k=0;k<1700;k++) {
    const x=(rand()-0.5)*44,z=(rand()-0.5)*38;
    put('slab',pick(['#a1a773','#a7ad76','#afb27e','#9da46e']),x,0.001+k*0.000002,z,0.2+rand()*1.15,0.009,0.15+rand()*0.6,rand()*6);
  }
  function pave(x:number,z:number,w:number,d:number) {
    put('slab',pick(stone),x,0.044+rand()*0.01,z,w,0.09,d,rand()*0.45);
  }
  for (let row=0;row<13;row++) {
    const z=6.2-row*0.55, x=-2.7+4.8*Math.pow(row/12,1.35);
    for (let col=-1;col<=1;col++) pave(x+col*0.54+(rand()-0.5)*0.12,z,0.7,0.69);
  }
  for (let row=0;row<8;row++) for(let col=0;col<7;col++)
    pave(-4.95+col*0.58+(row%2)*0.17,-1.5+row*0.55,0.75,0.72);
  function bed(x:number,z:number,length:number,alongZ=false) {
    const foliage = ['#557242','#789047','#63813b','#8a9948'];
    for(let j=0;j<Math.ceil(length/0.65);j++) {
      const u=j*0.65;
      for(let layer=0;layer<2;layer++) {
        const offset=u+layer*0.19;
        put('block',pick(stone),x+(alongZ?0:offset),0.17+layer*0.27,z+(alongZ?offset:0),
          alongZ?0.54:0.61,0.29,alongZ?0.61:0.54,rand()*0.09);
      }
      for(let s=0;s<10;s++){
        const bx=x+(alongZ?0:u)+(rand()-0.5)*0.85,bz=z+(alongZ?u:0)+(rand()-0.5)*0.8;
        const y=0.55+rand()*0.2;
        put('leaf',pick(foliage),bx,y,bz,0.17,0.21,0.17,rand()*6);
        if(s%2===0) put('leaf',pick(['#db8b76','#f6cc60','#dc7568','#fff1c5']),bx,y+0.17,bz,0.076,0.067,0.085);
      }
    }
  }
  bed(-6,4.9,2.7); bed(-1.35,4.9,6.8); bed(6.1,-0.2,5.1,true); bed(-6.2,-1.4,5.8,true);
  // Two kitchen beds leave an aisle beside the front steps.
  for (const z of [2.15,3.5]) {
    put('block','#795d40',3.45,0.08,z,3.1,0.16,0.85);
    for(const edge of [-1,1]) {
      put('block',wood,3.45,0.17,z+edge*0.45,3.3,0.2,0.09);
      put('block',wood,3.45+edge*1.6,0.17,z,0.09,0.2,0.98);
    }
    for(let j=0;j<8;j++) for(const lane of [-0.19,0.19]){
      const x=2.07+j*0.39;
      for(let leaf=0;leaf<6;leaf++){
        const angle=leaf*Math.PI/3;
        put('leaf',pick(['#4c703e','#789449','#677a38']),x+0.09*Math.cos(angle),
          0.26+rand()*0.06,z+lane+0.1*Math.sin(angle),0.12,0.16,0.09,angle,0.4);
      }
      if(z>3 && j%2===0) put('leaf','#c95537',x,0.38,z+lane,0.08,0.075,0.08);
    }
  }
  // Open gate leaf runs into the garden, alongside the entry path.
  for (const x of [-3.65,-1.55]) put('block',wood,x,0.56,5.04,0.18,1.12,0.18);
  for(let k=0;k<5;k++) put('block',wood,-3.64,0.49,4.96-k*0.22,0.09,0.91,0.13);
  for(const y of [0.3,0.72]) put('block',wood,-3.63,y,4.52,0.12,0.1,1.05);
  // Pergola frames the table but admits light through its vine cover.
  for(const x of [-5.05,-1.72]) for(const z of [-1.55,1.55]) put('block',wood,x,1.25,z,0.15,2.5,0.15);
  for(const x of [-5.05,-1.72]) put('block',wood,x,2.49,0,0.17,0.21,3.65);
  for(let z=-1.65;z<1.8;z+=0.48){
    put('block','#96764c',-3.38,2.64,z,3.85,0.14,0.12);
    for(let j=0;j<21;j++){
      const x=-5.25+rand()*3.8;
      if(x>-3.1 && rand()<0.58) continue;
      put('leaf',pick(greens),x,2.74+rand()*0.14,z+rand()*0.24,0.22+rand()*0.18,0.13,0.26,rand()*6);
    }
  }
  for (const z of [-0.84,0.84]) {
    put('block',wood,-3.45,0.49,z,1.66,0.13,0.38);
    for (const x of [-4,-2.9]) put('block',wood,x,0.24,z,0.16,0.48,0.24);
  }
  put('block','#aa784b',-3.45,0.89,0,1.85,0.13,0.88);
  for(const x of [-4.05,-2.85]) put('block',wood,x,0.45,0,0.22,0.9,0.56);
  function tree(x:number,z:number,s:number) {
    put('pole','#69503a',x,1.25*s,z,0.48*s,2.5*s,0.48*s,0,0.09);
    for(let j=0;j<9;j++){
      const a=j*2.4,r=(j===8?0:0.9+rand()*0.35)*s;
      const bx=x+Math.cos(a)*r,bz=z+Math.sin(a)*r,by=(3.05+rand()*0.65+(j===8?0.6:0))*s;
      put('pole',wood,(x+bx)/2,2.35*s,(z+bz)/2,0.19*s,1.65*s,0.19*s,-a,-0.55);
      for(let k=0;k<26;k++){
        const theta=rand()*Math.PI*2,rad=Math.sqrt(rand())*0.95*s;
        const lx=bx+Math.cos(theta)*rad,lz=bz+Math.sin(theta)*rad,ly=by+rand()*0.72*s;
        put('leaf',pick(greens),lx,ly,lz,0.39*s,0.31*s,0.41*s,rand()*6);
        if(k%4===0) put('leaf','#eba137',lx,ly-0.25*s,lz,0.095*s,0.11*s,0.095*s);
      }
    }
  }
  tree(-5,-3.65,1.15); tree(6.1,-4.95,0.82);
  const material = new MeshStandardMaterial({roughness:0.94});
  for (const [shape,batch] of batches) {
    const mesh = new InstancedMesh(geometry[shape],material,batch.length);
    batch.forEach(({matrix,color},index)=>{mesh.setMatrixAt(index,matrix);mesh.setColorAt(index,color);});
    mesh.castShadow=true; mesh.receiveShadow=true; scene.add(mesh);
  }
  const grid = new GridHelper(20,20), axes = new AxesHelper(2);
  grid.visible=axes.visible=false; grid.position.y=0.12; scene.add(grid,axes);
  const sun=new DirectionalLight('#fff0d2',2.35);
  sun.position.set(-7,13,8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-11,right:11,top:11,bottom:-11,far:40});
  sun.shadow.camera.updateProjectionMatrix();sun.shadow.normalBias=0.018;
  const ambient=new HemisphereLight('#fff4df','#b4aa86',1.55);
  scene.add(sun,ambient);
  const setLighting=createLightingRig(scene,sun,ambient);
  return {scene,grid,axes,setLighting,updateTarget(){},dispose(){
    scene.traverse(o=>{if(o instanceof InstancedMesh)o.dispose();});
    disposeObject(scene);grid.dispose();axes.dispose();sun.dispose();scene.clear();
  }};
}
