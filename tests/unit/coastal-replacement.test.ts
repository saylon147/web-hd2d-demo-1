import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BoxGeometry, Mesh, MeshStandardMaterial, Raycaster, Scene, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CoastalReplacement, parseReplacementPreset } from '../../src/world/coastalReplacement';

const fixture = (): Record<string, unknown> => JSON.parse(readFileSync('public/assets/presets/coastal-g022.json', 'utf8')) as Record<string, unknown>;
describe('G02.2 replacement isolation', () => {
  it('rejects another candidate, expanded coverage and larger render deformation', () => {
    expect(() => parseReplacementPreset({ ...fixture(), baseCandidate: 'C3' })).toThrow();
    expect(() => parseReplacementPreset({ ...fixture(), renderHeightScale: 3 })).toThrow();
    expect(() => parseReplacementPreset({ ...fixture(), region: { min: [0, 0, 0], max: [10, 4, 10] } })).toThrow();
    expect(() => parseReplacementPreset({ ...fixture(), rimXZ: [[2, 2], [6, 3], [7, 4], [8, 5]] })).toThrow();
  });
  it('preserves real terrain queries and original subject while disposing only owned render buffers', async () => {
    const bytes = readFileSync('public/assets/models/island_cottage_blockout_v2.glb');
    const loaded = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const scene = new Scene(); scene.add(loaded.scene);
    const terrain = scene.getObjectByName('Organic_Coastal_Mass')!, cliff = terrain.getObjectByName('Organic_Coastal_Mass_1') as Mesh;
    const originalGeometry = cliff.geometry, originalIndices = Array.from(originalGeometry.index!.array);
    const rock = new Mesh(new BoxGeometry(4.5, 0.92, 4.5), new MeshStandardMaterial()); rock.position.set(7.3, 2.31, 3.2); scene.add(rock); scene.updateMatrixWorld(true);
    const matrix = rock.matrixWorld.toArray();
    const height = (): number => new Raycaster(new Vector3(7, 8, 2.4), new Vector3(0, -1, 0)).intersectObject(terrain, true)[0]!.point.y;
    const before = height(), experiment = new CoastalReplacement(scene, rock, parseReplacementPreset(fixture()));
    experiment.setVariant(true); expect(height()).toBe(before); expect(cliff.geometry).toBe(originalGeometry); expect(Array.from(originalGeometry.index!.array)).toEqual(originalIndices);
    expect(rock.matrixWorld.toArray()).toEqual(matrix); expect(rock.visible).toBe(false); expect(cliff.visible).toBe(false);
    const replacement = experiment.root.getObjectByName('G022A4SubjectReplacement') as Mesh;
    expect(replacement.geometry).toBe(rock.geometry); expect(replacement.material).toBe(rock.material); expect(replacement.scale.y).toBe(1.8);
    expect(experiment.preservation()).toEqual({ sourceGeometryRetained: true, originalAttributesUnchanged: true, sameCliffMaterial: true, originalQueryNodeRetained: true, originalSubjectTransformRetained: true });
    let sourceDisposed = false, rockDisposed = false, ownedDisposed = 0;
    originalGeometry.addEventListener('dispose', () => { sourceDisposed = true; }); rock.geometry.addEventListener('dispose', () => { rockDisposed = true; });
    for (const name of ['G022RetainedCliff', 'G022SingleLandApron']) (experiment.root.getObjectByName(name) as Mesh).geometry.addEventListener('dispose', () => { ownedDisposed++; });
    experiment.dispose(); expect(rock.visible).toBe(true); expect(cliff.visible).toBe(true); expect(experiment.root.parent).toBeNull();
    expect(sourceDisposed).toBe(false); expect(rockDisposed).toBe(false); expect(ownedDisposed).toBe(2);
    rock.geometry.dispose(); (rock.material as MeshStandardMaterial).dispose();
    loaded.scene.traverse((node) => { if (node instanceof Mesh) { node.geometry.dispose(); for (const m of Array.isArray(node.material) ? node.material : [node.material]) m.dispose(); } });
  });
});
