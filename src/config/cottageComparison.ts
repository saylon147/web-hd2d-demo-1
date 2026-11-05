import type { Triple } from './cottageCandidate';
export const COTTAGE_COMPARISON_VIEWS = ['golden', 'house', 'front', 'back', 'left', 'right', 'contact-front', 'contact-back', 'top'] as const;
export type CottageComparisonView = typeof COTTAGE_COMPARISON_VIEWS[number];
export type CottageVariant = 'A' | 'B';
export interface CottageComparisonCamera { position: Triple; target: Triple; fov: number }
export interface CottageComparisonPreset {
  manifestUrl: string;
  coastalLod: '10k-1k';
  alignment: { footprintNode: string; doorNode: string; sourceDoorAnchor: Triple; uniformScaleMultiplier: number; yawDegrees: number; translationOffsetM: Triple; hiddenCottageNodes: string[] };
  cameras: Record<Exclude<CottageComparisonView, 'golden'>, CottageComparisonCamera>;
  goldenCloseCrop: [number, number, number, number];
  cropReferenceCanvas: [number, number];
}
const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('Invalid cottage P2 configuration');
  return v as Record<string, unknown>;
};
const number = (v: unknown): number => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('Invalid cottage P2 number'); return v; };
const triple = (v: unknown): Triple => { if (!Array.isArray(v) || v.length !== 3) throw new Error('Invalid cottage P2 vector'); return [number(v[0]), number(v[1]), number(v[2])]; };
export function parseCottageComparisonPreset(value: unknown): CottageComparisonPreset {
  const p = object(value), a = object(p.alignment), raw = object(p.cameras);
  if (p.schemaVersion !== 1 || p.manifestUrl !== '/assets/manifests/cottage-candidate-01.json' || p.coastalLod !== '10k-1k' || a.footprintNode !== 'GroundFloor_Slab' || a.doorNode !== 'Front_Door_Placeholder') throw new Error('Unsupported cottage P2 baseline/asset contract');
  const hidden = a.hiddenCottageNodes;
  if (!Array.isArray(hidden) || hidden.length !== 4 || !['Roof', 'ExteriorWalls', 'GroundFloor_InteriorWalls', 'GroundFloor_Furniture'].every((name) => hidden.includes(name))) throw new Error('Only the documented cottage visuals may be hidden');
  const cameras = {} as CottageComparisonPreset['cameras'];
  for (const view of COTTAGE_COMPARISON_VIEWS) {
    if (view === 'golden') continue;
    const c = object(raw[view]); cameras[view] = { position: triple(c.position), target: triple(c.target), fov: number(c.fov) };
    if (cameras[view].fov !== 35 || cameras[view].position.every((v, i) => v === cameras[view].target[i])) throw new Error('Invalid cottage P2 fixed camera');
  }
  const multiplier = number(a.uniformScaleMultiplier), yaw = number(a.yawDegrees), offset = triple(a.translationOffsetM);
  if (multiplier < 0.8 || multiplier > 1.2 || Math.abs(yaw) > 15 || Math.hypot(...offset) > 0.5) throw new Error('Cottage P2 alignment exceeds the inspection adjustment range');
  if (!Array.isArray(p.goldenCloseCrop) || p.goldenCloseCrop.length !== 4 || !Array.isArray(p.cropReferenceCanvas) || p.cropReferenceCanvas.length !== 2) throw new Error('Missing fixed Golden crop');
  const crop = p.goldenCloseCrop.map(number) as [number, number, number, number], canvas = p.cropReferenceCanvas.map(number) as [number, number];
  if ([...crop, ...canvas].some((v) => !Number.isInteger(v) || v < 0) || crop[2] <= 0 || crop[3] <= 0 || crop[0] + crop[2] > canvas[0] || crop[1] + crop[3] > canvas[1]) throw new Error('Invalid Golden crop bounds');
  return { manifestUrl: p.manifestUrl, coastalLod: p.coastalLod, cameras, goldenCloseCrop: crop, cropReferenceCanvas: canvas,
    alignment: { footprintNode: a.footprintNode, doorNode: a.doorNode, sourceDoorAnchor: triple(a.sourceDoorAnchor), uniformScaleMultiplier: multiplier, yawDegrees: yaw, translationOffsetM: offset, hiddenCottageNodes: a.hiddenCottageNodes as string[] } };
}
