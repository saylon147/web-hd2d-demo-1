import { Box3, Group, Mesh, MeshStandardMaterial, SRGBColorSpace, NoColorSpace, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeObject } from '../core/dispose';
import type { TripoManifest, TripoVariant } from '../config/tripo';

export async function loadTripoRock(manifest: TripoManifest, variant: TripoVariant, signal: AbortSignal): Promise<{ root: Group; fetchMs: number; parseMs: number; transferBytes: number; textureEstimateBytes: number }> {
  const start=performance.now(), response=await fetch(variant.modelUrl,{signal});
  if(!response.ok)throw new Error(`Tripo 本地资产缺失（HTTP ${response.status}）。请运行 npm run tripo:pipeline。`);
  const bytes=await response.arrayBuffer(), fetched=performance.now();
  const scene=(await new GLTFLoader().parseAsync(bytes,import.meta.env.BASE_URL)).scene;
  const parsed=performance.now();
  try {
    signal.throwIfAborted();
    scene.updateMatrixWorld(true);
    const bounds=new Box3().setFromObject(scene), size=bounds.getSize(new Vector3()), center=bounds.getCenter(new Vector3());
    if(!Number.isFinite(size.x) || size.x<=0)throw new Error('Invalid Tripo bounds');
    const scale=manifest.runtimeWidthM/size.x;
    const pivot=new Group();
    pivot.name='TripoRock';
    pivot.add(scene);
    scene.scale.multiplyScalar(scale);
    scene.position.sub(new Vector3(center.x,bounds.min.y,center.z).multiplyScalar(scale));
    pivot.position.set(...manifest.placement);
    pivot.rotation.y=manifest.rotationYDegrees*Math.PI/180;
    let meshes=0;
    scene.traverse((item)=>{
      if(!(item instanceof Mesh))return;
      meshes++;
      if(!item.geometry.getAttribute('normal') || !item.geometry.getAttribute('uv'))throw new Error('Tripo mesh requires normals and UV');
      item.castShadow=true;item.receiveShadow=true;
      const materials=Array.isArray(item.material)?item.material:[item.material];
      for(const material of materials) {
        if(!(material instanceof MeshStandardMaterial) || !material.map || !material.normalMap || !material.roughnessMap || !material.metalnessMap)throw new Error('Tripo PBR texture binding missing');
        if(material.map.colorSpace!==SRGBColorSpace || material.normalMap.colorSpace!==NoColorSpace || material.roughnessMap.colorSpace!==NoColorSpace || material.metalnessMap.colorSpace!==NoColorSpace)throw new Error('Tripo texture color space mismatch');
      }
    });
    if(!meshes)throw new Error('Empty Tripo scene');
    return {root:pivot,fetchMs:fetched-start,parseMs:parsed-fetched,transferBytes:bytes.byteLength,textureEstimateBytes:variant.gpuTextureRgbaMipEstimateBytes};
  } catch(error: unknown) {disposeObject(scene);throw error;}
}
