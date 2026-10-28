import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { blockoutCameraProfile, parseBlockoutManifest } from '../../src/config/blockout';
import { createCameraState } from '../../src/config/camera';
import { constrainCameraState, zoomDistance } from '../../src/camera/math';

const text = readFileSync(new URL('../../public/assets/manifests/blockout_v1.json', import.meta.url), 'utf8');
function fixture(): Record<string, unknown> { return JSON.parse(text) as Record<string, unknown>; }

describe('M2 blockout manifest and camera profile', () => {
  it('loads all three view presets and measured spatial metrics', () => {
    const manifest = parseBlockoutManifest(fixture());
    expect(manifest.metrics.landRatio).toBeCloseTo(9);
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
