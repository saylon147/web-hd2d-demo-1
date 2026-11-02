import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { Group, Mesh, Scene } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CliffBlockout, parseCliffBlockoutPreset } from '../../src/world/cliffBlockout';
import type { CliffBlockoutPreset } from '../../src/world/cliffBlockout';
import type { CliffBoundaryReport } from '../../src/world/cliffBoundary';

let bytes: Buffer<ArrayBuffer>, boundary: CliffBoundaryReport, config: CliffBlockoutPreset;
beforeAll(async () => {
  bytes = await readFile('public/assets/models/island_cottage_blockout_v2.glb');
  boundary = JSON.parse(await readFile('public/assets/presets/coastal-g03-a0-boundaries.json', 'utf8')) as CliffBoundaryReport;
  config = parseCliffBlockoutPreset(JSON.parse(await readFile('public/assets/presets/coastal-g03-a1.json', 'utf8')) as unknown);
});
async function fixture(): Promise<{ scene: Scene; subject: Group; blockout: CliffBlockout }> {
  const source = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
  const scene = new Scene(), subject = new Group(); subject.name = 'front-shoulder'; subject.position.set(7.95, 1.85, 3.35); subject.scale.set(1.05, 0.9, 0.95); subject.rotation.y = -8 * Math.PI / 180; scene.add(source, subject);
  return { scene, subject, blockout: new CliffBlockout(scene, subject, config, boundary) };
}
describe('G03-A1 continuous original-profile cliff section', () => {
  it('keeps approved interfaces and source middle relief, with no extra openings or reversed triangles', async () => {
    const { blockout } = await fixture();
    const s = blockout.summary;
    expect(s.generatedTriangles).toBeGreaterThan(100); expect(s.generatedTriangles).toBeLessThan(2000);
    expect(s.boundaryMaxErrorM).toBeLessThan(0.000001); expect(s.unexpectedOpenEdges).toBe(0); expect(s.nonmanifoldEdges).toBe(0);
    expect(s.flippedTriangles).toBe(0); expect(s.degenerateTriangles).toBe(0); expect(s.belowSeaTriangles).toBe(0);
    expect(s.sourceProfileDeviationM).toBeGreaterThan(0.1); expect(s.maximumDisplacementM).toBeGreaterThan(0.1); expect(s.maximumDisplacementM).toBeLessThanOrEqual(0.3);
    expect(s.float32BoundaryMaxErrorM).toBeLessThan(0.000001); expect(s.sourcePartitionAreaErrorM2).toBeLessThan(0.000001);
    blockout.dispose();
  });
  it('restores source and A4 visibility without changing any geometry or transforms', async () => {
    const { scene, subject, blockout } = await fixture();
    blockout.setVariant(true); expect(subject.visible).toBe(false); expect(scene.getObjectByName('Organic_Coastal_Mass_1')!.visible).toBe(false);
    expect(blockout.preservation()).toEqual({ sourceGeometryRetained: true, sourceMaterialRetained: true, attributesUnchanged: true, indicesUnchanged: true, subjectTransformUnchanged: true, subjectVisible: false, originalQueryNodeRetained: true });
    blockout.setVariant(false); expect(subject.visible).toBe(true); expect(scene.getObjectByName('Organic_Coastal_Mass_1')!.visible).toBe(true);
    const mesh = blockout.root.getObjectByName('G03A1CliffSection'); expect(mesh).toBeInstanceOf(Mesh);
    expect((mesh as Mesh).geometry.getAttribute('uv')).toBeUndefined();
    blockout.dispose(); expect(scene.getObjectByName('G03A1RenderOnlyBlockout')).toBeUndefined(); expect(subject.visible).toBe(true);
  });
  it('rejects high-frequency/high-amplitude scope and wrong subject configuration', () => {
    expect(() => parseCliffBlockoutPreset({ ...config, schemaVersion: 1, baseCandidate: 'C2', largeScaleOffsetM: 1 })).toThrow('moderate');
    expect(() => parseCliffBlockoutPreset({ ...config, schemaVersion: 1, baseCandidate: 'C2', subjectInstance: 'east-shoulder' })).toThrow('preserve C2');
  });
});
