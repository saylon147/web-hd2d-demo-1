import type { CoastalPlacement } from './coastal';

export const G02_PRESET_URL = `${import.meta.env.BASE_URL}assets/presets/coastal-g02.json`;
export interface CoastalCandidate { id: string; name: string; placement: CoastalPlacement }
export function parseCoastalCandidates(value: unknown, baseline: CoastalPlacement[]): CoastalCandidate[] {
  if (!value || typeof value !== 'object' || !('schemaVersion' in value) || value.schemaVersion !== 1 || !('instance' in value) || value.instance !== 'front-shoulder' || !('asset' in value) || value.asset !== 'A4' || !('candidates' in value) || !Array.isArray(value.candidates) || value.candidates.length < 1 || value.candidates.length > 3) throw new Error('G02 allows only 1–3 front-shoulder/A4 candidates');
  const original = baseline.find((p) => p.id === 'front-shoulder');
  if (!original || original.asset !== 'A4') throw new Error('G02 baseline instance missing');
  const tuple = (value: unknown): [number, number, number] => {
    if (!Array.isArray(value) || value.length !== 3 || !value.every((n: unknown) => typeof n === 'number' && Number.isFinite(n))) throw new Error('Invalid G02 vector');
    return value as [number, number, number];
  };
  const result = value.candidates.map((raw: unknown): CoastalCandidate => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid G02 candidate');
    const item = raw as Record<string, unknown>;
    if (Object.keys(item).some((key) => !['id', 'name', 'position', 'yaw', 'scale', 'reason'].includes(key)) || typeof item.id !== 'string' || !/^C[123]$/.test(item.id) || typeof item.name !== 'string' || typeof item.yaw !== 'number' || !Number.isFinite(item.yaw)) throw new Error('Invalid G02 fields; material/other-instance overrides forbidden');
    const position = tuple(item.position), scale = tuple(item.scale);
    if (Math.hypot(position[0] - original.position[0], position[2] - original.position[2]) > 1.2 || Math.abs(position[1] - original.position[1]) > 0.25 || Math.abs(item.yaw - original.yaw) > 15 || scale.some((n, axis) => Math.abs(n / original.scale[axis]! - 1) > 0.05)) throw new Error('G02 exceeds small-transform experiment budget');
    return { id: item.id, name: item.name, placement: { ...original, position, yaw: item.yaw, scale } };
  });
  if (new Set(result.map((c) => c.id)).size !== result.length) throw new Error('Duplicate G02 candidate');
  return result;
}
export function candidatePlacements(baseline: CoastalPlacement[], candidate: CoastalCandidate | undefined): CoastalPlacement[] {
  return baseline.map((p) => candidate && p.id === 'front-shoulder' ? candidate.placement : p);
}
