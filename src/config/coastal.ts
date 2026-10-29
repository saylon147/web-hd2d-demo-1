import { CAMERA_LIMITS } from './camera';
import type { CameraProfile, CameraState } from './camera';

export const COASTAL_ASSETS = ['A1', 'A2', 'A3', 'A4'] as const;
export type CoastalId = typeof COASTAL_ASSETS[number];
export const COASTAL_VIEWS = ['golden', 'front', 'side', 'back', 'corner', 'top'] as const;
export type CoastalView = typeof COASTAL_VIEWS[number];
export const COASTAL_MODES = ['assembly', 'baseline', 'module'] as const;
export type CoastalMode = typeof COASTAL_MODES[number];
export const COASTAL_LODS = ['10k-1k', '20k-2k'] as const;
export type CoastalLod = typeof COASTAL_LODS[number];
export const COASTAL_MANIFEST_URL = `${import.meta.env.BASE_URL}assets/manifests/coastal-assembly.json`;
export const COASTAL_PRESET_URL = `${import.meta.env.BASE_URL}assets/presets/coastal-assembly.json`;
export interface CoastalVariant {
  id: CoastalLod; modelUrl: string; sha256: string; fileBytes: number; triangleCount: number;
  dimensions: [number, number, number]; gpuTextureRgbaMipEstimateBytes: number;
}
export interface CoastalAsset {
  id: CoastalId; runtimeWidthM: number; sourceSha256: string; sourceBytes: number; sourceTriangles: number;
  scaleRange: [number, number]; usage: string; variants: CoastalVariant[];
}
export interface CoastalManifest { complete: true; assets: CoastalAsset[]; defaultVariant: CoastalLod }
export interface CoastalPlacement {
  id: string; asset: CoastalId; position: [number, number, number]; scale: [number, number, number];
  tint: [number, number, number]; yaw: number; embeddingM: number;
}
export interface CoastalPreset { placements: CoastalPlacement[]; hiddenBaselineDecorations: string[]; cameraViews: Record<CoastalView, CameraState>; lighting: { exposure: number } }

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid coastal object');
  return value as Record<string, unknown>;
}
function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid coastal number');
  return value;
}
function positive(value: unknown): number { const n = number(value); if (n <= 0) throw new Error('Invalid coastal positive metric'); return n; }
function tuple(value: unknown): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) throw new Error('Invalid coastal coordinate');
  return [number(value[0]), number(value[1]), number(value[2])];
}
function hash(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('Invalid coastal source hash');
  return value;
}
function assetId(value: unknown): CoastalId {
  const id = COASTAL_ASSETS.find((item) => item === value);
  if (!id) throw new Error('Unknown coastal asset ID');
  return id;
}
function lod(value: unknown): CoastalLod {
  const id = COASTAL_LODS.find((item) => item === value);
  if (!id) throw new Error('Invalid coastal LOD');
  return id;
}
export function parseCoastalManifest(value: unknown): CoastalManifest {
  const data = object(value);
  if (data.schemaVersion !== 1 || data.upAxis !== 'Y' || data.units !== 'meters' || data.complete !== true || !Array.isArray(data.assets)) throw new Error('A1–A4 资产未齐备。请放入约定 inbox 路径并运行 npm run coastal:pipeline。');
  const assets = data.assets.map((item: unknown): CoastalAsset => {
    const asset = object(item), id = assetId(asset.id);
    if (!Array.isArray(asset.variants) || !Array.isArray(asset.scaleRange) || asset.scaleRange.length !== 2 || typeof asset.usage !== 'string') throw new Error('Invalid coastal asset contract');
    const variants = asset.variants.map((entry: unknown): CoastalVariant => {
      const variant = object(entry), variantId = lod(variant.id);
      if (variant.modelUrl !== `/assets/models/coastal-assembly/${id}/rock-${variantId}.glb`) throw new Error('Invalid local coastal model path');
      const dimensions = tuple(variant.dimensions);
      if (dimensions.some((n) => n <= 0)) throw new Error('Invalid coastal dimensions');
      return { id: variantId, modelUrl: import.meta.env.BASE_URL + (variant.modelUrl as string).slice(1), dimensions,
        sha256: hash(variant.sha256), fileBytes: positive(variant.fileBytes), triangleCount: positive(variant.triangleCount), gpuTextureRgbaMipEstimateBytes: positive(variant.gpuTextureRgbaMipEstimateBytes) };
    });
    if (variants.length !== COASTAL_LODS.length || new Set(variants.map((variant) => variant.id)).size !== COASTAL_LODS.length) throw new Error('Missing or duplicate coastal LOD');
    const scaleRange: [number, number] = [positive(asset.scaleRange[0]), positive(asset.scaleRange[1])];
    if (scaleRange[0] > scaleRange[1]) throw new Error('Invalid coastal scale range');
    return { id, usage: asset.usage, runtimeWidthM: positive(asset.runtimeWidthM), sourceSha256: hash(asset.sourceSha256), sourceBytes: positive(asset.sourceBytes), sourceTriangles: positive(asset.sourceTriangles), scaleRange, variants };
  });
  if (assets.length !== 4 || new Set(assets.map((asset) => asset.id)).size !== 4) throw new Error('Missing or duplicate coastal asset');
  return { complete: true, defaultVariant: lod(data.defaultVariant), assets };
}
export function parseCoastalPreset(value: unknown, manifest: CoastalManifest): CoastalPreset {
  const data = object(value);
  if (data.schemaVersion !== 1 || !Array.isArray(data.placements) || !data.placements.length) throw new Error('Invalid coastal placements');
  const placements = data.placements.map((item: unknown): CoastalPlacement => {
    const entry = object(item), asset = assetId(entry.asset), scale = tuple(entry.scale), tint = tuple(entry.tint);
    const limits = manifest.assets.find((item) => item.id === asset)!.scaleRange;
    if (typeof entry.id !== 'string' || !entry.id || scale.some((n) => n < limits[0] || n > limits[1]) || Math.max(...scale) / Math.min(...scale) > 1.3) throw new Error('Coastal placement scale exceeds permitted range');
    if (tint.some((n) => n < 0.8 || n > 1.1)) throw new Error('Invalid coastal material tint');
    return { id: entry.id, asset, scale, tint, position: tuple(entry.position), yaw: number(entry.yaw), embeddingM: positive(entry.embeddingM) };
  });
  if (new Set(placements.map((item) => item.id)).size !== placements.length || new Set(placements.map((item) => item.asset)).size !== 4) throw new Error('Assembly must use A1–A4 with unique instance IDs');
  const rawViews = object(data.cameraViews), cameraViews = {} as Record<CoastalView, CameraState>;
  for (const view of COASTAL_VIEWS) {
    const state = object(rawViews[view]), target = object(state.target);
    const camera = { target: { x: number(target.x), y: number(target.y), z: number(target.z) }, baseYaw: number(state.baseYaw), yawOffset: number(state.yawOffset), pitch: number(state.pitch), distance: positive(state.distance), fov: positive(state.fov) };
    if (camera.pitch < 30 || camera.pitch > 89.9 || camera.distance < 8 || camera.distance > 45 || camera.fov !== 35 || Math.abs(camera.yawOffset) > 45) throw new Error('Invalid coastal camera');
    cameraViews[view] = camera;
  }
  if (!Array.isArray(data.hiddenBaselineDecorations) || !data.hiddenBaselineDecorations.every((name: unknown) => typeof name === 'string' && /^Coastal_Rock_Visual_0[23]$/.test(name))) throw new Error('Only covered decorative placeholder rocks may be hidden');
  return { placements, hiddenBaselineDecorations: data.hiddenBaselineDecorations as string[], cameraViews, lighting: { exposure: positive(object(data.lighting).exposure) } };
}
export function coastalCameraProfile(state: CameraState): CameraProfile {
  return { defaults: state, limits: { ...CAMERA_LIMITS, pitch: { min: 30, max: 89.9 }, distance: { min: 8, max: 45 }, targetHorizontal: { min: -20, max: 20 }, targetHeight: { min: 0, max: 15 } } };
}
