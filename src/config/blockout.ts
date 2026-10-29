import { CAMERA_LIMITS } from './camera';
import type { CameraProfile, CameraState } from './camera';

export const VIEW_MODES = ['exterior', 'ground-floor', 'basement'] as const;
export type ViewMode = typeof VIEW_MODES[number];
export const VIEW_LABELS: Record<ViewMode, string> = { exterior: '外景', 'ground-floor': '一层剖视', basement: '地下室剖视' };
export function blockoutManifestUrl(search = window.location.search): string {
  const version = new URLSearchParams(search).get('version') === 'v0' ? 'v1' : 'v2';
  return `${import.meta.env.BASE_URL}assets/manifests/blockout_${version}.json`;
}

export interface BlockoutManifest {
  schemaVersion: 1;
  id: string;
  approval: string;
  modelUrl: string;
  axisUrl: string;
  modelSha256: string;
  lighting: { hemisphere: number; sun: number; basementFill: number; exposure: number };
  metrics: { landAreaM2: number; houseAreaM2: number; landRatio: number; groundHeight: number; basementHeight: number; courtyardAreaM2: number };
  views: Record<ViewMode, CameraState>;
  requiredNodes: string[];
  modeHidden: Record<ViewMode, string[]>;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`Invalid ${label}`);
  return value as Record<string, unknown>;
}
function number(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid ${label}`);
  return value;
}
function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((item: unknown) => typeof item === 'string')) throw new Error(`Invalid ${label}`);
  return value as string[];
}
function modelUrl(value: unknown): string {
  if (typeof value !== 'string' || !/^\/assets\/models\/[a-z0-9_]+\.glb$/.test(value)) throw new Error('Invalid local GLB asset path');
  return import.meta.env.BASE_URL + value.slice(1);
}

export function parseBlockoutManifest(value: unknown): BlockoutManifest {
  const data = record(value, 'manifest');
  if (data.schemaVersion !== 1 || data.units !== 'meters' || data.upAxis !== 'Y') throw new Error('Unsupported asset schema or coordinates');
  if (typeof data.id !== 'string' || typeof data.approval !== 'string' || typeof data.modelSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(data.modelSha256)) throw new Error('Invalid asset identity');
  const metrics = record(data.metrics, 'metrics');
  const rawLighting = data.lighting === undefined ? { hemisphere: 2.4, sun: 3, basementFill: 8, exposure: 1.15 } : record(data.lighting, 'lighting');
  const lighting = {
    hemisphere: number(rawLighting.hemisphere, 'hemisphere light'), sun: number(rawLighting.sun, 'sun light'),
    basementFill: number(rawLighting.basementFill, 'basement fill'), exposure: number(rawLighting.exposure, 'exposure'),
  };
  if (Object.values(lighting).some((value) => value <= 0 || value > 10)) throw new Error('Invalid lighting range');
  const parsedMetrics = {
    landAreaM2: number(metrics.landAreaM2, 'land area'), houseAreaM2: number(metrics.houseAreaM2, 'house area'),
    landRatio: number(metrics.landRatio, 'land ratio'), groundHeight: number(metrics.groundHeight, 'ground clear height'),
    basementHeight: number(metrics.basementHeight, 'basement clear height'), courtyardAreaM2: number(metrics.courtyardAreaM2, 'courtyard area'),
  };
  if (Object.values(parsedMetrics).some((value) => value <= 0) || Math.abs(parsedMetrics.landAreaM2 / parsedMetrics.houseAreaM2 - parsedMetrics.landRatio) > 0.001) throw new Error('Inconsistent spatial metrics');
  const rawViews = record(data.views, 'views');
  const rawHidden = record(data.modeHidden, 'mode visibility');
  const requiredNodes = strings(data.requiredNodes, 'required nodes');
  if (!['IslandRoot','Terrain','Roof','GroundFloor','Basement','StairsDown','Pier','Garden'].every((name) => requiredNodes.includes(name))) throw new Error('Missing required scene hierarchy');
  const views = {} as Record<ViewMode, CameraState>;
  const modeHidden = {} as Record<ViewMode, string[]>;
  for (const mode of VIEW_MODES) {
    const view = record(rawViews[mode], `${mode} camera`);
    const target = record(view.target, 'target');
    views[mode] = {
      target: { x: number(target.x, 'target x'), y: number(target.y, 'target y'), z: number(target.z, 'target z') },
      baseYaw: number(view.baseYaw, 'base yaw'), yawOffset: number(view.yawOffset, 'yaw offset'),
      pitch: number(view.pitch, 'pitch'), distance: number(view.distance, 'distance'), fov: number(view.fov, 'FOV'),
    };
    if (views[mode].pitch < 30 || views[mode].pitch > 55 || Math.abs(views[mode].yawOffset) > 45 || views[mode].distance < 8 || views[mode].distance > 45 || views[mode].fov !== 35 || views[mode].baseYaw !== 35 || Math.abs(views[mode].target.x) > 12 || Math.abs(views[mode].target.z) > 12 || views[mode].target.y < 0 || views[mode].target.y > 12) throw new Error('Preset exceeds blockout camera constraints');
    modeHidden[mode] = strings(rawHidden[mode], `${mode} hidden nodes`);
    if (modeHidden[mode].some((name) => !requiredNodes.includes(name))) throw new Error('Unknown visibility node');
  }
  return { schemaVersion: 1, id: data.id, approval: data.approval, modelUrl: modelUrl(data.modelUrl), axisUrl: modelUrl(data.axisUrl), modelSha256: data.modelSha256, lighting, metrics: parsedMetrics, views, requiredNodes, modeHidden };
}

export function blockoutCameraProfile(manifest: BlockoutManifest): CameraProfile {
  return {
    defaults: manifest.views.exterior,
    limits: { ...CAMERA_LIMITS, distance: { min: 8, max: 45 }, targetHorizontal: { min: -12, max: 12 }, targetHeight: { min: 0, max: 12 } },
  };
}
