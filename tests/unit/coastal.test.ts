import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCoastalManifest, parseCoastalPreset } from '../../src/config/coastal';
import { FrameMetrics } from '../../src/core/frameMetrics';
const fixture = (path: string): Record<string, unknown> => JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
const manifestFixture = (): Record<string, unknown> => fixture('public/assets/manifests/coastal-assembly.json');
const presetFixture = (): Record<string, unknown> => fixture('public/assets/presets/coastal-assembly.json');

describe('coastal assembly contracts', () => {
  it('retains the real M2.1 camera and uses A1–A4 within modest scale limits', () => {
    const manifest = parseCoastalManifest(manifestFixture()), preset = parseCoastalPreset(presetFixture(), manifest);
    const parameters = fixture('art-source/parameters/island_cottage_v2.json');
    expect(preset.cameraViews.golden).toEqual((parameters.views as Record<string, unknown>).exterior);
    expect(new Set(preset.placements.map((item) => item.asset)).size).toBe(4);
    expect(preset.placements).toHaveLength(5);
  });
  it('rejects incomplete sources, duplicate IDs and external model paths', () => {
    const missing = manifestFixture(); missing.complete = false;
    expect(() => parseCoastalManifest(missing)).toThrow('A1–A4');
    const duplicate = manifestFixture(), assets = duplicate.assets as Record<string, unknown>[];
    assets.push(structuredClone(assets[0]!)); expect(() => parseCoastalManifest(duplicate)).toThrow('duplicate');
    const invalid = manifestFixture(), variants = (invalid.assets as Record<string, unknown>[])[0]!.variants as Record<string, unknown>[];
    variants[0]!.modelUrl = 'https://external.invalid/asset.glb'; expect(() => parseCoastalManifest(invalid)).toThrow('local');
  });
  it('rejects severe stretching and hiding structural terrain', () => {
    const manifest = parseCoastalManifest(manifestFixture()), stretch = presetFixture();
    (stretch.placements as Record<string, unknown>[])[0]!.scale = [1, 2, 0.5];
    expect(() => parseCoastalPreset(stretch, manifest)).toThrow('scale');
    const hidden = presetFixture(); hidden.hiddenBaselineDecorations = ['Terrain'];
    expect(() => parseCoastalPreset(hidden, manifest)).toThrow('decorative');
  });
});
describe('frame measurement window', () => {
  it('excludes warmup and resets the measurement after configuration changes', () => {
    const metrics = new FrameMetrics();
    for (let i = 1; i <= 60; i++) expect(metrics.sample(i * 16, 5)).toBe(false);
    for (let i = 61; i < 180; i++) expect(metrics.sample(i * 16, 0.4)).toBe(false);
    expect(metrics.sample(180 * 16, 0.4)).toBe(true);
    expect(metrics.report()).toMatchObject({ frames: 120, frameMeanMs: 16, fps: 62.5, cpuSubmissionP95Ms: 0.4 });
    metrics.reset(); expect(metrics.report().frames).toBe(0);
  });
});
