import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { blockoutCameraProfile, blockoutManifestUrl, parseBlockoutManifest } from '../../src/config/blockout';
import { createCameraState } from '../../src/config/camera';
import { constrainCameraState, zoomDistance } from '../../src/camera/math';

const text = readFileSync(new URL('../../public/assets/manifests/blockout_v2.json', import.meta.url), 'utf8');
function fixture(): Record<string, unknown> { return JSON.parse(text) as Record<string, unknown>; }

describe('M2 blockout manifest and camera profile', () => {
  it('selects preserved V0 explicitly while defaulting to V1', () => {
    expect(blockoutManifestUrl('?version=v0')).toContain('blockout_v1.json');
    expect(blockoutManifestUrl('')).toContain('blockout_v2.json');
    expect(blockoutManifestUrl('?version=unknown')).toContain('blockout_v2.json');
  });
  it('rejects invalid diagnostic lighting and preserves legacy V0 exposure', () => {
    const legacy = fixture();
    delete legacy.lighting;
    expect(parseBlockoutManifest(legacy).lighting.exposure).toBe(1.15);
    const invalid = fixture();
    invalid.lighting = { hemisphere: -1, sun: 2, basementFill: 1.5, exposure: 1 };
    expect(() => parseBlockoutManifest(invalid)).toThrow('lighting range');
  });
  it('loads all three view presets and measured spatial metrics', () => {
    const manifest = parseBlockoutManifest(fixture());
    expect(manifest.metrics.landRatio).toBeGreaterThanOrEqual(8.5);
    expect(manifest.metrics.landRatio).toBeLessThanOrEqual(9.5);
    expect(manifest.metrics.basementHeight).toBeCloseTo(2.4);
    expect(manifest.views['ground-floor'].target.y).toBeGreaterThan(manifest.views.basement.target.y);
  });
  it('preserves M1 limits while allowing whole-island framing and elevated targets', () => {
    const profile = blockoutCameraProfile(parseBlockoutManifest(fixture()));
    const state = createCameraState(profile.defaults);
    state.distance = 100;
    state.target.y = 5.8;
    constrainCameraState(state, profile);
    expect(state.distance).toBe(45);
    expect(state.target.y).toBe(5.8);
    const m1 = createCameraState();
    m1.distance = 100;
    constrainCameraState(m1);
    expect(m1.distance).toBe(25);
    expect(zoomDistance(34, 1e6, profile)).toBe(45);
  });
  it('rejects missing modes and nonlocal asset paths', () => {
    const data = fixture();
    data.modelUrl = 'https://example.com/model.glb';
    expect(() => parseBlockoutManifest(data)).toThrow('local GLB');
    data.modelUrl = '/assets/models/island_cottage_blockout_v1.glb';
    data.views = {};
    expect(() => parseBlockoutManifest(data)).toThrow('camera');
  });
  it('rejects inconsistent area metrics and unknown visibility groups', () => {
    const data = fixture();
    data.metrics = { ...(data.metrics as Record<string, unknown>), landAreaM2: 36 };
    expect(() => parseBlockoutManifest(data)).toThrow('spatial metrics');
    const other = fixture();
    other.modeHidden = { ...(other.modeHidden as Record<string, unknown>), exterior: ['MissingRoof'] };
    expect(() => parseBlockoutManifest(other)).toThrow('visibility');
  });
});
