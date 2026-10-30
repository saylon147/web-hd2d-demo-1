import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCoastalManifest, parseCoastalPreset } from '../../src/config/coastal';
import { candidatePlacements, parseCoastalCandidates } from '../../src/config/coastalReview';
const load = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown;
const baseline = parseCoastalPreset(load('public/assets/presets/coastal-assembly.json'), parseCoastalManifest(load('public/assets/manifests/coastal-assembly.json'))).placements;
const fixture = (): Record<string, unknown> => load('public/assets/presets/coastal-g02.json') as Record<string, unknown>;
describe('G02 experiment boundary', () => {
  it('changes only front-shoulder position/yaw/scale and retains baseline without selection', () => {
    const candidates = parseCoastalCandidates(fixture(), baseline);
    expect(candidates).toHaveLength(3);
    expect(candidatePlacements(baseline, undefined)).toEqual(baseline);
    for (const candidate of candidates) {
      const placed = candidatePlacements(baseline, candidate);
      expect(placed.filter((p) => p.id !== 'front-shoulder')).toEqual(baseline.filter((p) => p.id !== 'front-shoulder'));
      expect(placed.find((p) => p.id === 'front-shoulder')?.tint).toEqual(baseline.find((p) => p.id === 'front-shoulder')?.tint);
    }
  });
  it('rejects extra candidates and material or asset overrides', () => {
    const extra = fixture(); const entries = extra.candidates as Record<string, unknown>[];
    entries.push({ ...entries[0], id: 'C4' }); expect(() => parseCoastalCandidates(extra, baseline)).toThrow('1–3');
    const changed = fixture(); (changed.candidates as Record<string, unknown>[])[0]!.tint = [1, 1, 1]; expect(() => parseCoastalCandidates(changed, baseline)).toThrow('forbidden');
    const asset = fixture(); asset.asset = 'A1'; expect(() => parseCoastalCandidates(asset, baseline)).toThrow('front-shoulder');
  });
  it('rejects transformations beyond the declared small experiment budget', () => {
    const moved = fixture(); (moved.candidates as Record<string, unknown>[])[0]!.position = [8.6, 0, 4.2]; expect(() => parseCoastalCandidates(moved, baseline)).toThrow('budget');
    const rotated = fixture(); (rotated.candidates as Record<string, unknown>[])[0]!.yaw = 90; expect(() => parseCoastalCandidates(rotated, baseline)).toThrow('budget');
  });
});
