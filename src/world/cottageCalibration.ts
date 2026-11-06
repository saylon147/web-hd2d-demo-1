import { Box3, MathUtils, Matrix3, Mesh, Plane, Raycaster, Vector3 } from 'three';
import type { Object3D, Scene } from 'three';
import type { CottageManifest, Triple } from '../config/cottageCandidate';
import type { CottageComparisonPreset } from '../config/cottageComparison';
import { COTTAGE_B20_VARIANTS, COTTAGE_CALIBRATION_VARIANTS } from '../config/cottageCalibration';
import type { CottageReviewVariant, CottageCalibrationPreset, TripoReviewVariant } from '../config/cottageCalibration';
import type { loadCottageCandidate } from './cottageCandidate';
import { CottageComparison } from './cottageComparison';
import { measureCottageStructure } from './cottageStructure';

type Bounds = { min: Triple; max: Triple };
interface BaseProfile {
  bounds: Bounds;
  lowestY: number;
  planeY: number;
  planeArea: number;
  projectedTriangleArea: number;
  triangleCount: number;
  samples: Triple[];
  gridCoverage: number;
  method: string;
}
interface SupportSample { point: Triple; gapM: number | null; supportNode: string | null }
interface ContactReport {
  sampleCount: number; contact: number; gaps: number; embedded: number; noSupport: number;
  maxGapM: number; maxEmbeddingM: number; samples: SupportSample[];
}
interface CalibrationRecord {
  variant: TripoReviewVariant; relativeScale: number; uniformScale: number; position: Triple; offsetFromB0: Triple;
  center: Triple; dimensions: Triple; bounds: Bounds; baseBounds: Bounds; basePlaneY: number;
  door: Triple; doorOffsetFromOriginal: Triple; yawDegrees: number;
  courtyardFrontEdgeZ: number; doorToFrontEdgeM: number; frontBaseToEdgeM: number; stairBoundsClearanceM: number;
  groundContact: ContactReport;
  conflicts: { name: string; convex: boolean; aabbOverlap: boolean; enclosedCandidateVertices: number }[];
  constraints: string[];
}
const bounds = (b: Box3): Bounds => ({ min: b.min.toArray(), max: b.max.toArray() });
const required = (scene: Scene, name: string): Object3D => {
  const node = scene.getObjectByName(name); if (!node) throw new Error(`P3-A missing baseline node: ${name}`); return node;
};
const visible = (node: Object3D): boolean => { let n: Object3D | null = node; while (n) { if (!n.visible) return false; n = n.parent; } return true; };

/** Measure the source's actual lower envelope, including the uneven stone base. No new geometry or material is created. */
function measureBase(root: Object3D, height: number, preset: CottageCalibrationPreset): BaseProfile {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert(), a = new Vector3(), b = new Vector3(), c = new Vector3();
  const edge = new Vector3(), normal = new Vector3(), footprint = new Box3();
  const triangles: number[][] = [], flatPlanes = new Map<number, { area: number; weightedY: number }>();
  let lowestY = Infinity, projectedTriangleArea = 0;
  root.traverse((mesh) => {
    if (!(mesh instanceof Mesh)) return;
    const position = mesh.geometry.getAttribute('position'), matrix = inverse.clone().multiply(mesh.matrixWorld);
    for (let i = 0; i < position.count; i++) lowestY = Math.min(lowestY, a.fromBufferAttribute(position, i).applyMatrix4(matrix).y);
  });
  root.traverse((mesh) => {
    if (!(mesh instanceof Mesh)) return;
    const position = mesh.geometry.getAttribute('position'), index = mesh.geometry.index, matrix = inverse.clone().multiply(mesh.matrixWorld);
    for (let i = 0; i < (index?.count ?? position.count); i += 3) {
      a.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(matrix);
      b.fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1).applyMatrix4(matrix);
      c.fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2).applyMatrix4(matrix);
      const maxY = Math.max(a.y, b.y, c.y), minY = Math.min(a.y, b.y, c.y);
      if (maxY > lowestY + height * preset.contact.lowerBandFraction) continue;
      normal.subVectors(b, a).cross(edge.subVectors(c, a));
      if (normal.y >= -1e-14) continue;
      const area = -normal.y / 2; projectedTriangleArea += area;
      footprint.expandByPoint(a).expandByPoint(b).expandByPoint(c);
      triangles.push([...a.toArray(), ...b.toArray(), ...c.toArray()]);
      if (maxY - minY <= 1e-7) {
        const key = Math.round(minY * 1e6), plane = flatPlanes.get(key) ?? { area: 0, weightedY: 0 };
        plane.area += area; plane.weightedY += area * (a.y + b.y + c.y) / 3; flatPlanes.set(key, plane);
      }
    }
  });
  const plane = [...flatPlanes.values()].sort((a, b) => b.area - a.area)[0];
  if (!plane || footprint.isEmpty()) throw new Error('P3-A could not measure a supporting source base plane');
  const size = footprint.getSize(new Vector3()), steps = preset.contact.gridSteps, samples: Triple[] = [];
  for (let ix = 0; ix < steps; ix++) for (let iz = 0; iz < steps; iz++) {
    const x = footprint.min.x + (ix + 0.5) * size.x / steps, z = footprint.min.z + (iz + 0.5) * size.z / steps;
    let y = Infinity;
    for (const t of triangles) {
      const [ax, ay, az, bx, by, bz, cx, cy, cz] = t as [number, number, number, number, number, number, number, number, number];
      if (x < Math.min(ax, bx, cx) || x > Math.max(ax, bx, cx) || z < Math.min(az, bz, cz) || z > Math.max(az, bz, cz)) continue;
      const denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / denominator;
      const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / denominator;
      if (u >= -1e-9 && v >= -1e-9 && u + v <= 1 + 1e-9) y = Math.min(y, u * ay + v * by + (1 - u - v) * cy);
    }
    if (Number.isFinite(y)) samples.push([x, y, z]);
  }
  return { bounds: bounds(footprint), lowestY, planeY: plane.weightedY / plane.area, planeArea: plane.area,
    projectedTriangleArea, triangleCount: triangles.length, samples, gridCoverage: samples.length / steps ** 2,
    method: 'Original POSITION/index transformed into bottom-center pivot coordinates; downward triangles in lowest 1% of source height; largest horizontal underside plane grouped at 1e-6 source units; 21x21 lower-envelope grid. Area sums may include overlapping triangles; finite contact diagnostic, not topology certification.' };
}

export class CottageCalibration {
  readonly baseline: CottageComparison;
  private root: Object3D | undefined;
  private profile: BaseProfile | undefined;
  private records = new Map<TripoReviewVariant, CalibrationRecord>();
  private variant: CottageReviewVariant = 'A';
  private structure: ReturnType<typeof measureCottageStructure> | undefined;
  constructor(private scene: Scene, private manifest: CottageManifest, p2: CottageComparisonPreset, readonly preset: CottageCalibrationPreset) {
    this.baseline = new CottageComparison(scene, manifest, p2);
  }
  install(candidate: Awaited<ReturnType<typeof loadCottageCandidate>>): void {
    this.baseline.install(candidate); this.root = candidate.root;
    this.profile = measureBase(candidate.root, candidate.size.y, this.preset);
    for (const variant of this.preset.gate === 'P3-B0' ? COTTAGE_B20_VARIANTS : COTTAGE_CALIBRATION_VARIANTS) {
      if (variant === 'A') continue;
      this.applyTransform(variant); this.baseline.setVariant('B');
      const measured = this.measure(variant);
      this.records.set(variant, measured);
      if (variant === 'B20') this.structure = measureCottageStructure(this.scene, candidate.root, measured.baseBounds, measured.groundContact.samples);
    }
    this.setVariant('A');
  }
  private scaleFactor(variant: TripoReviewVariant): number {
    const scale = this.preset.relativeScales[variant];
    if (scale === undefined) throw new Error(`Cottage candidate ${variant} is not enabled in this gate`);
    return scale;
  }
  private applyTransform(variant: TripoReviewVariant): void {
    if (!this.root || !this.profile) throw new Error('P3-A candidate not loaded');
    const root = this.root, scale = this.baseline.scale * this.scaleFactor(variant);
    root.scale.setScalar(scale); root.rotation.y = MathUtils.degToRad(this.baseline.preset.alignment.yawDegrees);
    if (variant === 'B0') root.position.copy(this.baseline.position);
    else {
      const door = this.baseline.sourceAnchor.clone().multiplyScalar(scale).applyAxisAngle(new Vector3(0, 1, 0), root.rotation.y);
      root.position.copy(this.baseline.referenceDoor).sub(door);
      const pad = new Box3().setFromObject(required(this.scene, 'GroundFloor_Slab'), true);
      root.position.y = pad.max.y - this.profile.planeY * scale;
      root.updateMatrixWorld(true);
      let base = new Box3(new Vector3(...this.profile.bounds.min), new Vector3(...this.profile.bounds.max)).applyMatrix4(root.matrixWorld);
      // Every candidate gets its own measured placement. Clear existing garden geometry without moving it.
      const garden = new Box3().setFromObject(required(this.scene, 'Garden_Bed_2'), true);
      root.position.x += Math.max(0, garden.max.x + this.preset.placement.gardenMarginM - base.min.x);
      root.updateMatrixWorld(true);
      const full = new Box3().setFromObject(root, true), tree = new Box3().setFromObject(required(this.scene, 'Tree_Crown_Placeholder_3'), true);
      if (full.max.x > tree.min.x && full.min.x < tree.max.x && full.min.z < tree.max.z + this.preset.placement.treeMarginM) {
        root.position.z += tree.max.z + this.preset.placement.treeMarginM - full.min.z;
      }
      root.updateMatrixWorld(true);
      base = new Box3(new Vector3(...this.profile.bounds.min), new Vector3(...this.profile.bounds.max)).applyMatrix4(root.matrixWorld);
      if (!Number.isFinite(base.min.y)) throw new Error('P3-A invalid base transform');
    }
    this.scene.updateMatrixWorld(true);
  }
  setVariant(variant: CottageReviewVariant): void {
    if (this.root) this.applyTransform(variant === 'A' ? 'B0' : variant);
    this.baseline.setVariant(variant === 'A' ? 'A' : 'B'); this.variant = variant;
  }
  current(): CalibrationRecord | undefined { return this.variant === 'A' ? undefined : this.records.get(this.variant); }
  summary() {
    return { phase: this.preset.gate === 'P3-B0' ? 'P3-B0 only; human review pending' : 'P3-A only; human review pending', variant: this.variant, sourceSha256: this.manifest.sha256,
      originalP2: this.baseline.summary(), sourceBase: this.profile ?? null, variants: Object.fromEntries(this.records), current: this.current() ?? null,
      ...(this.preset.gate === 'P3-B0' ? { structure: this.structure ?? null } : {}),
      defaultReplacement: false, optimization: false, diagnostics: 'Actual source lower-surface samples vs visible existing supports. Convex obstacle vertex containment proves positive conflicts only; absence of a sampled conflict is not complete collision proof.' };
  }
  private measure(variant: TripoReviewVariant): CalibrationRecord {
    const root = this.root!, profile = this.profile!, b = new Box3().setFromObject(root, true);
    const base = new Box3(new Vector3(...profile.bounds.min), new Vector3(...profile.bounds.max)).applyMatrix4(root.matrixWorld);
    const door = this.baseline.sourceAnchor.clone().applyMatrix4(root.matrixWorld), groundContact = this.measureContact();
    const frontEdge = this.courtyardEdge(door.x), stairs = new Box3();
    required(this.scene, 'Paths').traverse((node) => { if (node instanceof Mesh && node.name.startsWith('Coast_Stair_')) stairs.union(new Box3().setFromObject(node, true)); });
    const dx = Math.max(0, base.min.x - stairs.max.x, stairs.min.x - base.max.x), dz = Math.max(0, base.min.z - stairs.max.z, stairs.min.z - base.max.z);
    const conflicts = this.measureConflicts(b), constraints: string[] = [];
    if (groundContact.gaps) constraints.push('Source base spills over lower paving/terrain or original stair void; continuous support is not achieved.');
    if (groundContact.embedded) constraints.push('Measured lower surface penetrates existing support beyond the 1cm tolerance.');
    if (groundContact.noSupport) constraints.push('At least one actual lower-surface sample has no visible support below it.');
    if (frontEdge - base.max.z < this.preset.placement.minimumFrontClearanceM) constraints.push('Front base leaves less than the configured 1m approach inspection target.');
    if (conflicts.some((c) => c.enclosedCandidateVertices > 0)) constraints.push('Actual source vertices intersect retained convex obstacles; see conflicts.');
    return { variant, relativeScale: this.scaleFactor(variant), uniformScale: root.scale.x, position: root.position.toArray(),
      offsetFromB0: root.position.clone().sub(this.baseline.position).toArray(), center: b.getCenter(new Vector3()).toArray(), dimensions: b.getSize(new Vector3()).toArray(),
      bounds: bounds(b), baseBounds: bounds(base), basePlaneY: root.position.y + profile.planeY * root.scale.y,
      door: door.toArray(), doorOffsetFromOriginal: door.clone().sub(this.baseline.referenceDoor).toArray(), yawDegrees: MathUtils.radToDeg(root.rotation.y),
      courtyardFrontEdgeZ: frontEdge, doorToFrontEdgeM: frontEdge - door.z, frontBaseToEdgeM: frontEdge - base.max.z,
      stairBoundsClearanceM: Math.hypot(dx, dz), groundContact, conflicts, constraints };
  }
  private measureContact(): ContactReport {
    const report: ContactReport = { sampleCount: 0, contact: 0, gaps: 0, embedded: 0, noSupport: 0, maxGapM: 0, maxEmbeddingM: 0, samples: [] };
    const supports = ['Terrain', 'Paths', 'Terrace', 'GroundFloor_Slab', 'Basement_Slab', 'StairsDown'].map((name) => required(this.scene, name));
    const ray = new Raycaster(), point = new Vector3(), normal = new Vector3(), normalMatrix = new Matrix3();
    for (const source of this.profile!.samples) {
      point.set(...source).applyMatrix4(this.root!.matrixWorld); ray.set(new Vector3(point.x, 12, point.z), new Vector3(0, -1, 0)); ray.far = 15;
      const hit = ray.intersectObjects(supports, true).find((h) => visible(h.object) && h.face &&
        normal.copy(h.face.normal).applyNormalMatrix(normalMatrix.getNormalMatrix(h.object.matrixWorld)).y > 0.5);
      const gap = hit ? point.y - hit.point.y : null; report.sampleCount++;
      if (gap === null) report.noSupport++;
      else if (gap > this.preset.contact.toleranceM) report.gaps++;
      else if (gap < -this.preset.contact.toleranceM) report.embedded++;
      else report.contact++;
      if (gap !== null) { report.maxGapM = Math.max(report.maxGapM, gap); report.maxEmbeddingM = Math.max(report.maxEmbeddingM, -gap); }
      report.samples.push({ point: point.toArray(), gapM: gap, supportNode: hit?.object.name ?? null });
    }
    return report;
  }
  /** Intersect the real courtyard top triangles with the doorway's X line; do not use the larger courtyard AABB. */
  private courtyardEdge(x: number): number {
    const mesh = required(this.scene, 'Courtyard'); if (!(mesh instanceof Mesh)) throw new Error('P3-A courtyard must be a mesh');
    const p = mesh.geometry.getAttribute('position'), index = mesh.geometry.index, vertices = [new Vector3(), new Vector3(), new Vector3()];
    let front = -Infinity;
    for (let i = 0; i < (index?.count ?? p.count); i += 3) {
      vertices.forEach((v, k) => v.fromBufferAttribute(p, index ? index.getX(i + k) : i + k).applyMatrix4(mesh.matrixWorld));
      if (vertices.some((v) => Math.abs(v.y - vertices[0]!.y) > 1e-6)) continue;
      for (let k = 0; k < 3; k++) {
        const a = vertices[k]!, b = vertices[(k + 1) % 3]!;
        if (x < Math.min(a.x, b.x) || x > Math.max(a.x, b.x)) continue;
        if (Math.abs(a.x - b.x) < 1e-9) front = Math.max(front, a.z, b.z);
        else front = Math.max(front, a.z + (x - a.x) / (b.x - a.x) * (b.z - a.z));
      }
    }
    if (!Number.isFinite(front)) throw new Error('P3-A doorway is outside the actual courtyard X range');
    return front;
  }
  private measureConflicts(candidateBounds: Box3) {
    const obstacles: Mesh[] = [];
    this.scene.traverse((node) => {
      if (node instanceof Mesh && visible(node) && /^(Tree_|Garden_Bed_|Coast_Stair_|Stair_Void_Guard)/.test(node.name)) obstacles.push(node);
    });
    const results: { name: string; convex: boolean; aabbOverlap: boolean; enclosedCandidateVertices: number }[] = [];
    for (const mesh of obstacles) {
      const b = new Box3().setFromObject(mesh, true); if (!candidateBounds.intersectsBox(b)) continue;
      const p = mesh.geometry.getAttribute('position'), index = mesh.geometry.index, center = b.getCenter(new Vector3());
      const a = new Vector3(), c = new Vector3(), d = new Vector3(), planes: Plane[] = [];
      for (let i = 0; i < (index?.count ?? p.count); i += 3) {
        a.fromBufferAttribute(p, index ? index.getX(i) : i).applyMatrix4(mesh.matrixWorld);
        c.fromBufferAttribute(p, index ? index.getX(i + 1) : i + 1).applyMatrix4(mesh.matrixWorld);
        d.fromBufferAttribute(p, index ? index.getX(i + 2) : i + 2).applyMatrix4(mesh.matrixWorld);
        const plane = new Plane().setFromCoplanarPoints(a, c, d); if (plane.distanceToPoint(center) > 0) plane.negate(); planes.push(plane);
      }
      let convex = true;
      for (let i = 0; i < p.count; i++) { a.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld); if (planes.some((plane) => plane.distanceToPoint(a) > 1e-5)) convex = false; }
      let enclosedCandidateVertices = 0;
      if (convex) this.root!.traverse((source) => {
        if (!(source instanceof Mesh)) return;
        const positions = source.geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i++) {
          a.fromBufferAttribute(positions, i).applyMatrix4(source.matrixWorld);
          if (b.containsPoint(a) && planes.every((plane) => plane.distanceToPoint(a) < -1e-5)) enclosedCandidateVertices++;
        }
      });
      results.push({ name: mesh.name, convex, aabbOverlap: true, enclosedCandidateVertices });
    }
    return results;
  }
  dispose(): void { this.baseline.dispose(); this.root = undefined; this.profile = undefined; this.structure = undefined; this.records.clear(); }
}
