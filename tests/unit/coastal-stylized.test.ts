import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { Group, Mesh, Scene } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CliffBlockout, parseCliffBlockoutPreset } from '../../src/world/cliffBlockout';
import { CoastalStylized, colorCliffPrototype, parseStylizedPreset } from '../../src/world/coastalStylized';
import type { CliffBoundaryReport } from '../../src/world/cliffBoundary';
import type { CliffBlockoutPreset } from '../../src/world/cliffBlockout';
import type { StylizedPreset } from '../../src/world/coastalStylized';

let bytes: Buffer<ArrayBuffer>, boundary: CliffBoundaryReport, config: CliffBlockoutPreset, preset: StylizedPreset, raw: Record<string, unknown>;
beforeAll(async () => {
  bytes = await readFile('public/assets/models/island_cottage_blockout_v2.glb');
  boundary = JSON.parse(await readFile('public/assets/presets/coastal-g03-a0-boundaries.json', 'utf8')) as CliffBoundaryReport;
  config = parseCliffBlockoutPreset(JSON.parse(await readFile('public/assets/presets/coastal-g03-a1.json', 'utf8')) as unknown);
  raw = JSON.parse(await readFile('public/assets/presets/coastal-g03-p0.json', 'utf8')) as Record<string, unknown>;
  preset = parseStylizedPreset(raw);
});
async function fixture(): Promise<{ blockout: CliffBlockout; subject: Group }> {
  const source = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
  const scene = new Scene(), subject = new Group(); subject.name = 'front-shoulder'; scene.add(source, subject);
  return { blockout: new CliffBlockout(scene, subject, config, boundary), subject };
}
describe('G03-P0 broad palette feasibility prototype', () => {
  it('preserves actual A1 geometry and deterministically creates six connected broad regions', async () => {
    const { blockout } = await fixture(), source = (blockout.root.getObjectByName('G03A1CliffSection') as Mesh).geometry;
    const a = colorCliffPrototype(source, preset, boundary), b = colorCliffPrototype(source, preset, boundary);
    for (const name of ['position', 'normal']) expect(a.geometry.getAttribute(name).array).toEqual(source.getAttribute(name).array);
    expect(a.geometry.index!.array).toEqual(source.index!.array); expect(source.getAttribute('color')).toBeUndefined();
    expect(a.geometry.getAttribute('color').array).toEqual(b.geometry.getAttribute('color').array);
    expect(a.summary.triangles).toBe(640); expect(a.summary.geometryDisplacementM).toBe(0);
    expect(a.summary.regions).toHaveLength(6);
    for (const r of a.summary.regions) { expect(r.faceCount).toBeGreaterThan(30); expect(r.connectedComponents).toBe(1); }
    a.geometry.dispose(); b.geometry.dispose(); blockout.dispose();
  });
  it('switches visibility, restores source objects, and releases owned GPU resources', async () => {
    const { blockout, subject } = await fixture(), styled = new CoastalStylized(blockout, preset, boundary);
    const mesh = blockout.root.getObjectByName('G03P0StylizedPrototype') as Mesh;
    let geometryDisposals = 0, materialDisposals = 0;
    mesh.geometry.addEventListener('dispose', () => geometryDisposals++);
    const material = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
    material.addEventListener('dispose', () => materialDisposals++);
    for (const v of ['stylized', 'tripo', 'neutral', 'stylized', 'neutral'] as const) {
      styled.setVariant(v); expect(subject.visible).toBe(v === 'tripo'); expect(mesh.visible).toBe(v === 'stylized');
      expect(blockout.preservation()).toEqual(expect.objectContaining({ attributesUnchanged: true, indicesUnchanged: true }));
    }
    styled.dispose(); expect(geometryDisposals).toBe(1); expect(materialDisposals).toBe(1);
    expect(blockout.root.getObjectByName('G03P0StylizedPrototype')).toBeUndefined();
    expect(blockout.diagnosticScene.getObjectByName('G03P0StylizedPrototype')).toBeUndefined();
    blockout.dispose(); expect(subject.visible).toBe(true);
  });
  it('rejects too many regions, duplicate cells and out of range transition controls', () => {
    expect(() => parseStylizedPreset({ ...raw, transitionWidth: 0.9 })).toThrow();
    expect(() => parseStylizedPreset({ ...raw, regions: [...preset.regions, preset.regions[0]] })).toThrow();
    expect(() => parseStylizedPreset({ ...raw, regions: Array(6).fill(preset.regions[0]) })).toThrow();
  });
});
