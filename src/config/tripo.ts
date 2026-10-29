import { CAMERA_LIMITS } from './camera';
import type { CameraProfile } from './camera';

export const TRIPO_MANIFEST_URL = `${import.meta.env.BASE_URL}assets/manifests/tripo_rock_spike.json`;
export const ROCK_ANGLES = ['front','side','back','site'] as const;
export type RockAngle = typeof ROCK_ANGLES[number];
export interface TripoVariant {
  id: string; modelUrl: string; fileBytes: number; triangleCount: number; textureLimit: number;
  sha256: string; gpuTextureRgbaMipEstimateBytes: number;
}
export interface TripoManifest {
  schemaVersion: 1; defaultVariant: string; sourceSha256: string; runtimeWidthM: number;
  placement: [number,number,number]; rotationYDegrees: number;
  lighting: { hemisphere: number; sun: number; exposure: number };
  performance: { warmupFrames: number; sampleFrames: number };
  inspectionCamera: { target: [number,number,number]; pitch: number; distance: number; fov: number; frontYaw: number; sideYaw: number; backYaw: number };
  variants: TripoVariant[];
}
function object(value: unknown): Record<string,unknown> {
  if(!value || typeof value!=='object' || Array.isArray(value))throw new Error('Invalid Tripo manifest object');
  return value as Record<string,unknown>;
}
function positive(value: unknown): number {
  if(typeof value!=='number' || !Number.isFinite(value) || value<=0)throw new Error('Invalid Tripo positive metric');
  return value;
}
function point(value: unknown): [number,number,number] {
  if(!Array.isArray(value) || value.length!==3 || !value.every((n: unknown)=>typeof n==='number' && Number.isFinite(n)))throw new Error('Invalid Tripo coordinates');
  return value as [number,number,number];
}
function hash(value: unknown): string {
  if(typeof value!=='string' || !/^[a-f0-9]{64}$/.test(value))throw new Error('Invalid Tripo hash');
  return value;
}
export function parseTripoManifest(value: unknown): TripoManifest {
  const data=object(value), light=object(data.lighting), camera=object(data.inspectionCamera), timing=object(data.performance);
  if(data.schemaVersion!==1 || !Array.isArray(data.variants) || !data.variants.length || typeof data.defaultVariant!=='string')throw new Error('Unsupported Tripo manifest');
  const variants=data.variants.map((item: unknown): TripoVariant=>{
    const variant=object(item);
    if(typeof variant.id!=='string' || !/^(original|5k|10k|20k|50k)-(1k|2k|4k)$/.test(variant.id) || typeof variant.modelUrl!=='string' || !/^\/assets\/models\/tripo-rock\/rock-(original|5k|10k|20k|50k)-(1k|2k|4k)\.glb$/.test(variant.modelUrl))throw new Error('Invalid Tripo asset path or variant');
    return {id:variant.id,modelUrl:import.meta.env.BASE_URL+variant.modelUrl.slice(1),fileBytes:positive(variant.fileBytes),triangleCount:positive(variant.triangleCount),textureLimit:positive(variant.textureLimit),sha256:hash(variant.sha256),gpuTextureRgbaMipEstimateBytes:positive(variant.gpuTextureRgbaMipEstimateBytes)};
  });
  if(!variants.some((v)=>v.id===data.defaultVariant) || new Set(variants.map((v)=>v.id)).size!==variants.length)throw new Error('Invalid Tripo default or duplicate variant');
  const inspectionCamera={target:point(camera.target),pitch:positive(camera.pitch),distance:positive(camera.distance),fov:positive(camera.fov),frontYaw:positive(camera.frontYaw),sideYaw:positive(camera.sideYaw),backYaw:positive(camera.backYaw)};
  if(inspectionCamera.pitch<30 || inspectionCamera.pitch>55 || inspectionCamera.distance<8 || inspectionCamera.distance>45 || inspectionCamera.fov!==35)throw new Error('Tripo camera exceeds constraints');
  if(typeof data.rotationYDegrees!=='number' || !Number.isFinite(data.rotationYDegrees))throw new Error('Invalid Tripo rotation');
  const performance={warmupFrames:positive(timing.warmupFrames),sampleFrames:positive(timing.sampleFrames)};
  if(!Object.values(performance).every((n)=>Number.isInteger(n) && n<=600))throw new Error('Invalid performance sample count');
  return {schemaVersion:1,defaultVariant:data.defaultVariant,sourceSha256:hash(data.sourceSha256),runtimeWidthM:positive(data.runtimeWidthM),placement:point(data.placement),rotationYDegrees:data.rotationYDegrees,lighting:{hemisphere:positive(light.hemisphere),sun:positive(light.sun),exposure:positive(light.exposure)},performance,inspectionCamera,variants};
}
export function rockCameraProfile(manifest: TripoManifest, angle: RockAngle): CameraProfile {
  const view=manifest.inspectionCamera;
  const baseYaw=angle==='side'?view.sideYaw:angle==='back'?view.backYaw:view.frontYaw;
  const [x,y,z]=view.target;
  return {defaults:angle==='site'?{target:{x:0,y:3.4,z:3},baseYaw:35,yawOffset:0,pitch:42,distance:40,fov:35}:{target:{x,y,z},baseYaw,yawOffset:0,pitch:view.pitch,distance:view.distance,fov:view.fov},limits:{...CAMERA_LIMITS,distance:{min:8,max:45},targetHorizontal:{min:-20,max:20},targetHeight:{min:0,max:12}}};
}
