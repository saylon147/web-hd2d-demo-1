import { Box3, Mesh, Vector3, Raycaster, MathUtils } from 'three';
import type { Object3D, Scene } from 'three';
import type { CottageManifest } from '../config/cottageCandidate';
import type { CottageComparisonPreset, CottageVariant } from '../config/cottageComparison';
import { disposeCottageCandidate } from './cottageCandidate';
import type { loadCottageCandidate } from './cottageCandidate';

const box = (root: Object3D) => { const b = new Box3().setFromObject(root, true); return { min: b.min.toArray(), max: b.max.toArray() }; };
const required = (scene: Scene, name: string): Object3D => { const node = scene.getObjectByName(name); if (!node) throw new Error(`P2 baseline node missing: ${name}`); return node; };
const checksum = (array: ArrayBufferView): number => {
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength); let hash = 2166136261;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
  return hash >>> 0;
};
export class CottageComparison {
  private originalVisibility = new Map<Object3D, boolean>();
  private candidate: Awaited<ReturnType<typeof loadCottageCandidate>> | undefined;
  private protectedRoots: Object3D[];
  private protectedSignature: string;
  readonly scale: number;
  readonly position: Vector3;
  readonly referenceDoor: Vector3;
  readonly referenceFootprint: { min: number[]; max: number[] };
  readonly referenceRoof: { min: number[]; max: number[] };
  readonly sourceAnchor: Vector3;
  private details: object | undefined;
  constructor(private scene: Scene, private manifest: CottageManifest, readonly preset: CottageComparisonPreset) {
    scene.updateMatrixWorld(true);
    const a = preset.alignment, footprint = new Box3().setFromObject(required(scene, a.footprintNode), true);
    const door = new Box3().setFromObject(required(scene, a.doorNode), true).getCenter(new Vector3());
    this.referenceDoor = new Vector3(door.x, footprint.max.y, door.z);
    this.referenceFootprint = { min: footprint.min.toArray(), max: footprint.max.toArray() };
    this.referenceRoof = box(required(scene, 'Roof'));
    const size = footprint.getSize(new Vector3());
    this.scale = Math.min(size.x / manifest.spatial.dimensions[0], size.z / manifest.spatial.dimensions[2]) * a.uniformScaleMultiplier;
    this.sourceAnchor = new Vector3(...a.sourceDoorAnchor).sub(new Vector3(manifest.spatial.center[0], manifest.spatial.aabb.min[1], manifest.spatial.center[2]));
    const anchor = this.sourceAnchor.clone().multiplyScalar(this.scale).applyAxisAngle(new Vector3(0, 1, 0), MathUtils.degToRad(a.yawDegrees));
    this.position = this.referenceDoor.clone().sub(anchor).add(new Vector3(...a.translationOffsetM));
    for (const name of a.hiddenCottageNodes) { const node = required(scene, name); this.originalVisibility.set(node, node.visible); }
    this.protectedRoots = ['Terrain', 'Shoreline', 'Water', 'Pier', 'Garden', 'Terrace', 'Paths', 'Basement', 'GroundFloor_Structure', 'StairsDown', 'CoastalAssembly'].map((name) => required(scene, name));
    this.protectedSignature = JSON.stringify(this.environment());
  }
  environment(): object[] {
    this.scene.updateMatrixWorld(true);
    const records: object[] = [];
    for (const root of this.protectedRoots) root.traverse((node) => {
      records.push({ name: node.name, visible: node.visible, matrix: node.matrixWorld.toArray(), ...(node instanceof Mesh ? {
        attributes: Object.fromEntries(Object.keys(node.geometry.attributes).map((name) => { const attribute = node.geometry.getAttribute(name); return [name, { count: attribute.count, checksum: checksum(attribute.array) }]; })),
        index: node.geometry.index ? checksum(node.geometry.index.array) : null,
        materialIds: (Array.isArray(node.material) ? node.material : [node.material]).map((m) => m.uuid),
      } : {}) });
    });
    return records;
  }
  install(candidate: Awaited<ReturnType<typeof loadCottageCandidate>>): void {
    if (this.candidate) throw new Error('P2 candidate already installed');
    const root = candidate.root; root.name = 'CottageCandidate01P2';
    root.scale.setScalar(this.scale); root.rotation.y = MathUtils.degToRad(this.preset.alignment.yawDegrees); root.position.copy(this.position); root.visible = false;
    this.scene.add(root); this.candidate = candidate; this.scene.updateMatrixWorld(true);
    const entrance = this.sourceAnchor.clone().applyMatrix4(root.matrixWorld);
    this.details = { candidateBounds: box(root), candidateDoorWorld: entrance.toArray(), doorDeltaM: entrance.clone().sub(this.referenceDoor).toArray(), support: this.supportSurvey() };
  }
  setVariant(variant: CottageVariant): void {
    if (variant === 'B' && !this.candidate) throw new Error('P2 candidate is not loaded');
    for (const [node, visible] of this.originalVisibility) node.visible = variant === 'A' ? visible : false;
    if (this.candidate) this.candidate.root.visible = variant === 'B';
  }
  summary(): object {
    return { referenceFootprint: this.referenceFootprint, referenceRoof: this.referenceRoof, referenceDoorWorld: this.referenceDoor.toArray(),
      uniformScale: this.scale, position: this.position.toArray(), yawDegrees: this.preset.alignment.yawDegrees,
      sourceDoorAnchor: this.preset.alignment.sourceDoorAnchor, translationOffsetM: this.preset.alignment.translationOffsetM,
      candidateDimensionsM: this.manifest.spatial.dimensions.map((v) => v * this.scale), hiddenCottageNodes: [...this.originalVisibility.keys()].map((n) => n.name),
      candidate: this.details ?? null, protectedEnvironmentUnchanged: JSON.stringify(this.environment()) === this.protectedSignature,
      retainedNodes: ['GroundFloor_Structure', 'GroundFloor_Slab', 'StairsDown', 'Basement', 'Porch_Threshold'],
      sourceSha256: this.manifest.sha256, approval: 'P2 visual review pending; no P3' };
  }
  private supportSurvey(): object {
    if (!this.candidate) throw new Error('P2 support survey requires candidate');
    const b = new Box3().setFromObject(this.candidate.root, true), floor = b.min.y;
    const supports = this.protectedRoots.filter((r) => !['Water', 'Garden', 'CoastalAssembly', 'Shoreline'].includes(r.name));
    const ray = new Raycaster(), samples: object[] = []; let noSupport = 0, maxGap = 0, maxEmbedding = 0;
    // Coarse projected footprint survey of existing support surfaces. No high-poly collider or topology changes.
    for (let x = b.min.x + 0.25; x < b.max.x; x += 0.5) for (let z = b.min.z + 0.25; z < b.max.z; z += 0.5) {
      ray.set(new Vector3(x, floor + 0.75, z), new Vector3(0, -1, 0)); ray.far = 6;
      const hit = ray.intersectObjects(supports, true).find((h) => { let node: Object3D | null = h.object; while (node) { if (!node.visible) return false; node = node.parent; } return true; });
      const gap = hit ? floor - hit.point.y : null;
      if (gap === null) noSupport++; else { maxGap = Math.max(maxGap, gap); maxEmbedding = Math.max(maxEmbedding, -gap); }
      samples.push({ point: [x, floor, z], supportY: hit?.point.y ?? null, supportNode: hit?.object.name ?? null, gapM: gap });
    }
    return { method: '0.5m XZ grid across candidate AABB; flat bottom datum; downward first visible support excluding water, decorative rocks, garden and candidate; footprint includes empty/decorative cells; finite spatial diagnostic, not a watertight/collision certificate', sampleCount: samples.length, noSupport, maxGapM: maxGap, maxEmbeddingM: maxEmbedding, samples };
  }
  dispose(): void { this.setVariant('A'); if (this.candidate) disposeCottageCandidate(this.candidate.root); this.candidate = undefined; }
}
