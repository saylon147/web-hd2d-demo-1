import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { Mesh, Vector3 } from 'three';
import type { BufferGeometry, Group } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { extractCliffBoundary, parseCliffBoundaryPreset } from '../../src/world/cliffBoundary';
import type { CliffBoundaryPreset } from '../../src/world/cliffBoundary';

let scene: Group, preset: CliffBoundaryPreset;
beforeAll(async () => {
  const bytes = await readFile('public/assets/models/island_cottage_blockout_v2.glb');
  scene = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
  scene.updateMatrixWorld(true);
  preset = parseCliffBoundaryPreset(JSON.parse(await readFile('public/assets/presets/coastal-g03-a0.json', 'utf8')) as unknown);
});
describe('G03-A0 actual post-Boolean terrain extraction', () => {
  it('finds connected rim, foot, waterline and exact end sections on source triangles', () => {
    const result = extractCliffBoundary(scene, preset);
    expect(result.curves[0]!.points).toHaveLength(4);
    for (const curve of result.curves) expect(curve.points.length).toBeGreaterThanOrEqual(2);
    expect(result.curves[3]!.points[0]).toEqual(result.curves[0]!.points[0]);
    expect(result.curves[4]!.points[0]).toEqual(result.curves[0]!.points.at(-1));
    expect(result.rimLengthM).toBeGreaterThan(2); expect(result.rimLengthM).toBeLessThan(4);
    expect(result.footY).toBeCloseTo(0.12, 6); expect(result.seaY).toBeCloseTo(0, 6);
    expect(result.checks.sufficientForA1).toBe(true);
    expect(result.checks.sourceSurfaceMaxErrorM).toBeLessThan(0.00003);
    expect(result.checks.seamEndpointMaxErrorM).toBeLessThan(0.00003);
    expect(result.checks.maxProfileRiseM).toBeLessThan(0.00001);
  });
  it('retains every original vertex, index, material and scene object and repeats deterministically', () => {
    const snapshot = (): object[] => {
      const records: object[] = [];
      scene.traverse((node) => {
        const geometry: BufferGeometry | undefined = node instanceof Mesh ? node.geometry : undefined;
        records.push({ name: node.name, visible: node.visible, matrix: node.matrixWorld.toArray(), ...(geometry && node instanceof Mesh ? {
          geometry: geometry.uuid,
          material: Array.isArray(node.material) ? node.material.map((m) => m.uuid) : node.material.uuid,
          attributes: Object.fromEntries(Object.entries(geometry.attributes).map(([k, a]) => [k, Array.from(a.array)])),
          indices: geometry.index ? Array.from(geometry.index.array) : null,
        } : {}) });
      });
      return records;
    };
    const before = snapshot(), first = extractCliffBoundary(scene, preset);
    expect(extractCliffBoundary(scene, preset)).toEqual(first); expect(snapshot()).toEqual(before);
  });
  it('fails explicitly if the selection has no real shared boundary', () => {
    expect(() => extractCliffBoundary(scene, { ...preset, rimSelectionXZ: { min: [100, 100], max: [101, 101] } })).toThrow('no connected start');
  });
  it('rejects invalid configuration and attempts to read a replacement mesh', () => {
    expect(() => parseCliffBoundaryPreset({ ...preset, schemaVersion: 1, cliffMesh: 'G022RetainedCliff' })).toThrow('original terrain');
    expect(() => parseCliffBoundaryPreset({ ...preset, schemaVersion: 1, rimSelectionXZ: { min: [8, 4], max: [6, 2] } })).toThrow('selection bounds');
  });
  it('verifies the existing Blender Z-up export fixture is already Three.js Y-up', async () => {
    const manifest = JSON.parse(await readFile('public/assets/manifests/blockout_v2.json', 'utf8')) as { axisUrl: string };
    const bytes = await readFile('public' + manifest.axisUrl);
    const axes = (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')).scene;
    axes.updateMatrixWorld(true);
    const expected: [string, [number, number, number]][] = [['Axis_PosX', [1, 0, 0]], ['Axis_PosY', [0, 0, -1]], ['Axis_PosZ', [0, 1, 0]]];
    for (const [name, xyz] of expected) expect(axes.getObjectByName(name)!.getWorldPosition(new Vector3()).distanceTo(new Vector3(...xyz))).toBeLessThan(0.00001);
  });
});
