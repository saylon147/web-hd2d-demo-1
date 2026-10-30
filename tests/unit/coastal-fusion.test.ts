import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Raycaster, Scene, Vector3 } from 'three';
import { CoastalFusion, fusionWeight, parseFusionPreset } from '../../src/world/coastalFusion';

const fixture = (): Record<string, unknown> => JSON.parse(readFileSync('public/assets/presets/coastal-g021.json', 'utf8')) as Record<string, unknown>;
describe('G02.1-A render-only boundary', () => {
  it('rejects another baseline, expanded region and unsafe displacement', () => {
    expect(() => parseFusionPreset({ ...fixture(), baseCandidate: 'C3' })).toThrow();
    expect(() => parseFusionPreset({ ...fixture(), region: { min: [0, 0, 0], max: [10, 4, 10] } })).toThrow();
    expect(() => parseFusionPreset({ ...fixture(), outwardM: 3 })).toThrow();
    const preset = parseFusionPreset(fixture());
    for (const point of [new Vector3(7, 3.35, 3), new Vector3(7, 0.65, 3), new Vector3(4, 2, 3), new Vector3(7, 2, 6)]) expect(fusionWeight(point, preset)).toBe(0);
  });
  it('keeps source buffers, shared top edge and terrain queries while disposing only owned geometry', () => {
    const scene = new Scene(), terrain = new Group(); terrain.name = 'Organic_Coastal_Mass'; scene.add(terrain);
    const original = new BufferGeometry();
    // Two vertical cliff triangles followed by an upward face sharing the top edge.
    original.setAttribute('position', new Float32BufferAttribute([
      6.2, 1.2, 3, 7.6, 1.2, 3, 6.2, 3.1, 3,
      7.6, 1.2, 3, 7.6, 3.1, 3, 6.2, 3.1, 3,
      6.2, 3.1, 3, 7.6, 3.1, 3, 6.2, 3.1, 2.6,
    ], 3)); original.setAttribute('restPosition', original.getAttribute('position').clone()); original.computeVertexNormals();
    const material = new MeshStandardMaterial(), source = new Mesh(original, material); source.name = 'test-steep-cliff'; terrain.add(source);
    const rock = new Mesh(new BoxGeometry(3, 3, 1), new MeshStandardMaterial()); rock.position.set(7.7, 2, 3.8); scene.add(rock); scene.updateMatrixWorld(true);
    const sourcePositions = Array.from(original.getAttribute('position').array);
    const terrainHeight = (): number => new Raycaster(new Vector3(6.7, 8, 2.9), new Vector3(0, -1, 0)).intersectObject(terrain, true)[0]!.point.y;
    const height = terrainHeight(), fusion = new CoastalFusion(scene, rock, parseFusionPreset(fixture()));
    fusion.setVariant(true);
    expect(fusion.root.parent).toBe(scene); expect(fusion.root.parent).not.toBe(terrain); expect(source.visible).toBe(false);
    expect(terrainHeight()).toBe(height); expect(Array.from(original.getAttribute('position').array)).toEqual(sourcePositions);
    const proxy = fusion.root.children[0] as Mesh, p = proxy.geometry.getAttribute('position'), rest = proxy.geometry.getAttribute('restPosition');
    // Each vertical source triangle emits 16 child triangles. The shared edge must remain pinned in all copies.
    let pinned = 0;
    for (let i = 0; i < p.count; i++) {
      const before = new Vector3().fromBufferAttribute(rest, i), after = new Vector3().fromBufferAttribute(p, i);
      if (Math.abs(before.y - 3.1) < 1e-5 && Math.abs(before.z - 3) < 1e-5) {
        pinned++; expect(after.distanceTo(before)).toBeLessThan(1e-5);
      }
      if (i >= 96) expect(after.distanceTo(before)).toBeLessThan(1e-5);
    }
    expect(pinned).toBeGreaterThan(0);
    expect(fusion.preservation()).toEqual({ originalGeometryUnchanged: true, sameMaterialReferences: true, originalQueryNodeRetained: true });
    let sourceDisposed = false, materialDisposed = false, proxyDisposed = false;
    original.addEventListener('dispose', () => { sourceDisposed = true; }); material.addEventListener('dispose', () => { materialDisposed = true; }); proxy.geometry.addEventListener('dispose', () => { proxyDisposed = true; });
    fusion.dispose(); expect(source.visible).toBe(true); expect(fusion.root.parent).toBeNull();
    expect(proxyDisposed).toBe(true); expect(sourceDisposed).toBe(false); expect(materialDisposed).toBe(false);
    original.dispose(); material.dispose(); rock.geometry.dispose(); (rock.material as MeshStandardMaterial).dispose();
  });
});
