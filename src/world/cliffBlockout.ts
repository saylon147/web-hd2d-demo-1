import { Box3, BufferGeometry, Float32BufferAttribute, Group, Light, Mesh, MeshStandardMaterial, Plane, Scene, Triangle, Vector3 } from 'three';
import type { BufferAttribute, Material, Object3D } from 'three';
import type { CliffBoundaryReport } from './cliffBoundary';

export const CLIFF_BLOCKOUT_PRESET_URL = `${import.meta.env.BASE_URL}assets/presets/coastal-g03-a1.json`;
export const APPROVED_BOUNDARY_URL = `${import.meta.env.BASE_URL}assets/presets/coastal-g03-a0-boundaries.json`;
export interface CliffBlockoutPreset {
  sourceNode: string; cliffMesh: string; subjectInstance: string; profileOriginXZ: [number, number];
  subdivisionLevels: number; largeScaleOffsetM: number; boundaryFadeM: number; material: { color: string; roughness: number };
}
export interface CliffBlockoutSummary {
  sourceTriangles: number; selectedSourceTriangles: number; generatedVertices: number; generatedTriangles: number; retainedTriangles: number;
  maximumDisplacementM: number; boundaryMaxErrorM: number; boundaryVertexCount: number; unexpectedOpenEdges: number; nonmanifoldEdges: number;
  degenerateTriangles: number; flippedTriangles: number; belowSeaTriangles: number; broadReliefM: number; sourceProfileDeviationM: number;
  float32BoundaryMaxErrorM: number; sourcePartitionAreaErrorM2: number;
  bounds: { min: number[]; max: number[] }; method: string; originalProfiles: { top: number[]; points: number[][] }[];
}
export function parseCliffBlockoutPreset(value: unknown): CliffBlockoutPreset {
  if (!value || typeof value !== 'object') throw new Error('Invalid G03-A1 preset');
  const d = value as Record<string, unknown>, m = d.material as Record<string, unknown> | undefined;
  if (d.schemaVersion !== 1 || d.baseCandidate !== 'C2' || d.sourceNode !== 'Organic_Coastal_Mass' || d.cliffMesh !== 'Organic_Coastal_Mass_1' || d.subjectInstance !== 'front-shoulder') throw new Error('G03-A1 must preserve C2 and original terrain');
  if (!Array.isArray(d.profileOriginXZ) || d.profileOriginXZ.length !== 2 || !d.profileOriginXZ.every((n: unknown) => typeof n === 'number' && Number.isFinite(n))) throw new Error('Invalid G03-A1 origin');
  if (d.subdivisionLevels !== 2 || typeof d.largeScaleOffsetM !== 'number' || d.largeScaleOffsetM < 0 || d.largeScaleOffsetM > 0.3 || typeof d.boundaryFadeM !== 'number' || d.boundaryFadeM < 0.3 || d.boundaryFadeM > 1) throw new Error('G03-A1 permits only moderate broad relief');
  if (!m || typeof m.color !== 'string' || !/^#[a-f\d]{6}$/i.test(m.color) || m.roughness !== 0.95) throw new Error('G03-A1 requires one neutral debug material');
  return { sourceNode: d.sourceNode, cliffMesh: d.cliffMesh, subjectInstance: d.subjectInstance, profileOriginXZ: d.profileOriginXZ as [number, number], subdivisionLevels: d.subdivisionLevels, largeScaleOffsetM: d.largeScaleOffsetM, boundaryFadeM: d.boundaryFadeM, material: { color: m.color, roughness: m.roughness } };
}
interface Vertex { point: Vector3; attributes: Record<string, number[]> }
type Face = [Vertex, Vertex, Vertex];
function mix(a: Vertex, b: Vertex, t: number): Vertex { return { point: a.point.clone().lerp(b.point, t), attributes: Object.fromEntries(Object.entries(a.attributes).map(([name, values]) => [name, values.map((v, i) => v + (b.attributes[name]![i]! - v) * t)])) }; }
function split(polygon: Vertex[], plane: Plane, positive: boolean): Vertex[] {
  const result: Vertex[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!, da = plane.distanceToPoint(a.point) * (positive ? 1 : -1), db = plane.distanceToPoint(b.point) * (positive ? 1 : -1);
    if (da >= -1e-9) result.push(a);
    if ((da > 1e-9 && db < -1e-9) || (da < -1e-9 && db > 1e-9)) result.push(mix(a, b, da / (da - db)));
  }
  return result.filter((v, i) => i === 0 || v.point.distanceTo(result[i - 1]!.point) > 1e-8);
}
function fan(polygon: Vertex[]): Face[] {
  const result: Face[] = [];
  for (let i = 1; i + 1 < polygon.length; i++) {
    const tri: Face = [polygon[0]!, polygon[i]!, polygon[i + 1]!];
    if (tri[1].point.clone().sub(tri[0].point).cross(tri[2].point.clone().sub(tri[0].point)).lengthSq() > 1e-16) result.push(tri);
  }
  return result;
}
function subdivide(triangle: Face, levels: number): Face[] {
  if (!levels) return [triangle];
  const [a, b, c] = triangle, ab = mix(a, b, 0.5), bc = mix(b, c, 0.5), ca = mix(c, a, 0.5);
  return [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]].flatMap((tri) => subdivide(tri as Face, levels - 1));
}
function segmentDistance(p: Vector3, a: Vector3, b: Vector3): number { const d = b.clone().sub(a); return p.distanceTo(a.clone().addScaledVector(d, Math.max(0, Math.min(1, p.clone().sub(a).dot(d) / d.lengthSq())))); }
function curveDistance(p: Vector3, points: number[][]): number { return Math.min(...points.slice(1).map((b, i) => segmentDistance(p, new Vector3(...points[i] as [number, number, number]), new Vector3(...b as [number, number, number])))); }
function smooth(t: number): number { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); }

/** Build a render-only original-surface partition; simulation keeps the original named mesh. */
export class CliffBlockout {
  readonly root = new Group();
  readonly diagnosticScene = new Scene();
  readonly summary: CliffBlockoutSummary;
  private source: Mesh;
  private sourceGeometry: BufferGeometry;
  private sourceMaterial: Material | Material[];
  private sourceArrays: number[][];
  private sourceIndex: number[] | null;
  private sourceVisibility: boolean;
  private subjectVisibility: boolean;
  private subjectMatrix: number[];
  private geometries: BufferGeometry[] = [];
  private material: MeshStandardMaterial;
  constructor(scene: Scene, private subject: Object3D, config: CliffBlockoutPreset, boundary: CliffBoundaryReport) {
    scene.updateMatrixWorld(true);
    const source = scene.getObjectByName(config.sourceNode)?.getObjectByName(config.cliffMesh);
    if (!(source instanceof Mesh) || subject.name !== config.subjectInstance) throw new Error('G03-A1 original cliff/subject missing');
    this.source = source; this.sourceGeometry = source.geometry; this.sourceMaterial = source.material;
    this.sourceArrays = Object.values(this.sourceGeometry.attributes).map((a) => Array.from(a.array)); this.sourceIndex = this.sourceGeometry.index ? Array.from(this.sourceGeometry.index.array) : null;
    this.sourceVisibility = source.visible; this.subjectVisibility = subject.visible; this.subjectMatrix = subject.matrixWorld.toArray();
    this.root.name = 'G03A1RenderOnlyBlockout';
    const top = boundary.curves[0]!.points, origin = new Vector3(config.profileOriginXZ[0], 0, config.profileOriginXZ[1]), mid = new Vector3(...top[1]!);
    const endPlanes = [top[0]!, top.at(-1)!].map((xyz) => { const p = new Vector3(...xyz), d = p.clone().sub(origin).setY(0), plane = new Plane().setFromNormalAndCoplanarPoint(new Vector3(-d.z, 0, d.x).normalize(), origin); if (plane.distanceToPoint(mid) < 0) plane.negate(); return plane; });
    // The same angular sector also crosses the basement floor. Limit eligibility
    // to the outer envelope measured from ALL approved curves, retaining interior faces.
    const radial = mid.clone().sub(origin).setY(0).normalize();
    const minimumProjection = Math.min(...boundary.curves.flatMap((c) => c.points.map((xyz) => new Vector3(...xyz).sub(origin).dot(radial)))) - 0.02;
    const outerPlane = new Plane().setFromNormalAndCoplanarPoint(radial, origin.clone().addScaledVector(radial, minimumProjection));
    const planes = [outerPlane, ...endPlanes, new Plane(new Vector3(0, 1, 0), -boundary.seaY)];
    const geometry = this.sourceGeometry, p = geometry.getAttribute('position'), index = geometry.index, names = Object.keys(geometry.attributes);
    const originalFaces: Face[] = [], retained: Face[] = [], selected: Face[] = [];
    let selectedSourceTriangles = 0;
    for (let i = 0; i < (index?.count ?? p.count); i += 3) {
      const triangle = [0, 1, 2].map((offset): Vertex => { const v = index ? index.getX(i + offset) : i + offset; return { point: new Vector3().fromBufferAttribute(p, v).applyMatrix4(source.matrixWorld), attributes: Object.fromEntries(names.map((name) => { const a = geometry.getAttribute(name); return [name, Array.from({ length: a.itemSize }, (_, j) => a.getComponent(v, j))]; })) }; }) as Face;
      originalFaces.push(triangle);
      let eligible: Vertex[] = triangle;
      for (const plane of planes) { retained.push(...fan(split(eligible, plane, false))); eligible = split(eligible, plane, true); if (eligible.length < 3) break; }
      const clipped = fan(eligible); if (clipped.length) selectedSourceTriangles++;
      selected.push(...clipped.flatMap((face) => subdivide(face, config.subdivisionLevels)));
    }
    const key = (point: Vector3): string => point.toArray().map((n) => Math.round(n * 1e5)).join(',');
    const edgeCounts = new Map<string, { a: Vector3; b: Vector3; count: number }>();
    for (const face of selected) for (let i = 0; i < 3; i++) { const a = face[i]!.point, b = face[(i + 1) % 3]!.point, k = [key(a), key(b)].sort().join('|'), entry = edgeCounts.get(k) ?? { a, b, count: 0 }; entry.count++; edgeCounts.set(k, entry); }
    const boundaryEdges = [...edgeCounts.values()].filter((e) => e.count === 1);
    const approvedDistance = (point: Vector3): number => Math.min(...[0, 2, 3, 4].map((i) => curveDistance(point, boundary.curves[i]!.points)));
    const unexpectedOpenEdges = boundaryEdges.filter((e) => [e.a, e.b, e.a.clone().lerp(e.b, 0.5)].some((point) => approvedDistance(point) > 0.00005)).length;
    if (unexpectedOpenEdges) throw new Error(`G03-A1 selected patch has ${unexpectedOpenEdges} unapproved open edges`);
    const nonmanifoldEdges = [...edgeCounts.values()].filter((e) => e.count > 2).length;
    const boundaryKeys = new Set(boundaryEdges.flatMap((e) => [key(e.a), key(e.b)]));
    const displace = (point: Vector3): Vector3 => {
      if (boundaryKeys.has(key(point)) || point.y <= boundary.footY + 1e-8) return point.clone();
      const topFade = smooth(curveDistance(point, top) / config.boundaryFadeM), endFade = smooth(Math.min(...endPlanes.map((plane) => plane.distanceToPoint(point))) / config.boundaryFadeM), footFade = smooth((point.y - boundary.footY) / config.boundaryFadeM);
      const angle = Math.atan2(point.z - origin.z, point.x - origin.x), a0 = Math.atan2(top[0]![2] - origin.z, top[0]![0] - origin.x), a1 = Math.atan2(top.at(-1)![2] - origin.z, top.at(-1)![0] - origin.x), u = (angle - a0) / (a1 - a0), v = (point.y - boundary.footY) / (mid.y - boundary.footY);
      const amount = config.largeScaleOffsetM * topFade * endFade * footFade * (0.7 + 0.3 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v));
      return point.clone().addScaledVector(point.clone().sub(origin).setY(0).normalize(), amount);
    };
    let maximumDisplacementM = 0, flippedTriangles = 0, degenerateTriangles = 0, belowSeaTriangles = 0;
    const sourceNormal = (face: Face): Vector3 => face[1].point.clone().sub(face[0].point).cross(face[2].point.clone().sub(face[0].point)).normalize();
    const generated = selected.map((face): Vector3[] => { const result = face.map((v) => { const point = displace(v.point); maximumDisplacementM = Math.max(maximumDisplacementM, point.distanceTo(v.point)); return point; }); const normal = result[1]!.clone().sub(result[0]!).cross(result[2]!.clone().sub(result[0]!)); if (normal.lengthSq() < 1e-16) degenerateTriangles++; if (normal.dot(sourceNormal(face)) <= 0) flippedTriangles++; if (result.some((v) => v.y < boundary.seaY - 1e-6)) belowSeaTriangles++; return result; });
    const positions: number[] = [], indices: number[] = [], vertexMap = new Map<string, number>();
    for (const triangle of generated) for (const point of triangle) { const k = key(point); let i = vertexMap.get(k); if (i === undefined) { i = positions.length / 3; positions.push(...point.toArray()); vertexMap.set(k, i); } indices.push(i); }
    const patch = new BufferGeometry(); patch.setAttribute('position', new Float32BufferAttribute(positions, 3)); patch.setIndex(indices); patch.computeVertexNormals(); patch.computeBoundingBox(); patch.computeBoundingSphere();
    // Audit the actual uploaded Float32/index buffers, including all approved curves.
    const gpuPosition = patch.getAttribute('position');
    const gpuFaces = Array.from({ length: indices.length / 3 }, (_, i) => new Triangle(...[0, 1, 2].map((j) => new Vector3().fromBufferAttribute(gpuPosition, indices[i * 3 + j]!)) as [Vector3, Vector3, Vector3]));
    degenerateTriangles = gpuFaces.filter((face) => face.getArea() < 1e-12).length;
    flippedTriangles = gpuFaces.filter((face, i) => face.getNormal(new Vector3()).dot(sourceNormal(selected[i]!)) <= 0).length;
    const float32BoundaryMaxErrorM = Math.max(...boundary.curves.flatMap((curve) => curve.points.map((xyz) => { const point = new Vector3(...xyz); return Math.min(...gpuFaces.map((face) => face.closestPointToPoint(point, new Vector3()).distanceTo(point))); })));
    const area = (faces: Face[]): number => faces.reduce((sum, face) => sum + new Triangle(...face.map((v) => v.point) as [Vector3, Vector3, Vector3]).getArea(), 0);
    const sourcePartitionAreaErrorM2 = Math.abs(area(originalFaces) - area(retained) - area(selected));
    const remainder = new BufferGeometry(), values: Record<string, number[]> = Object.fromEntries(names.map((name) => [name, []]));
    for (const face of retained) for (const vertex of face) for (const name of names) values[name]!.push(...vertex.attributes[name]!);
    for (const name of names) remainder.setAttribute(name, new Float32BufferAttribute(values[name]!, geometry.getAttribute(name).itemSize)); remainder.computeBoundingBox(); remainder.computeBoundingSphere();
    this.geometries.push(patch, remainder);
    const retainedMesh = new Mesh(remainder, source.material); retainedMesh.name = 'G03A1RetainedCliff'; retainedMesh.matrixAutoUpdate = false; retainedMesh.matrix.copy(source.matrixWorld); retainedMesh.castShadow = source.castShadow; retainedMesh.receiveShadow = source.receiveShadow;
    this.material = new MeshStandardMaterial({ color: config.material.color, roughness: config.material.roughness, metalness: 0 });
    const blockoutMesh = new Mesh(patch, this.material); blockoutMesh.name = 'G03A1CliffSection'; blockoutMesh.castShadow = true; blockoutMesh.receiveShadow = true; this.root.add(retainedMesh, blockoutMesh);
    // Supplemental unoccluded geometry evidence. It uses the SAME renderer,
    // fixed camera and cloned original lights; no other instance is edited/hidden.
    this.diagnosticScene.background = scene.background;
    this.diagnosticScene.add(blockoutMesh.clone());
    for (const node of scene.children) if (node instanceof Light) this.diagnosticScene.add(node.clone());
    const boundaryMaxErrorM = Math.max(...boundaryEdges.flatMap((e) => [e.a, e.b]).map((point) => displace(point).distanceTo(point)));
    // Actual intermediate vertical sections, sampled from source triangles (not a T/W ruled wall).
    const profiles = top.slice(1, -1).map((xyz) => {
      const start = new Vector3(...xyz), dir = start.clone().sub(origin).setY(0), plane = new Plane().setFromNormalAndCoplanarPoint(new Vector3(-dir.z, 0, dir.x).normalize(), origin), points = new Map<string, Vector3>();
      for (const face of originalFaces) for (let i = 0; i < 3; i++) { const a = face[i]!.point, b = face[(i + 1) % 3]!.point, da = plane.distanceToPoint(a), db = plane.distanceToPoint(b); if (da * db <= 0 && Math.abs(da - db) > 1e-8) { const hit = a.clone().lerp(b, da / (da - db)); if (planes.every((p) => p.distanceToPoint(hit) >= -1e-8)) points.set(key(hit), hit); } }
      return { top: xyz, points: [...points.values()].sort((a, b) => b.y - a.y).map((p) => p.toArray()) };
    });
    const sourceProfileDeviationM = Math.max(...profiles.flatMap((profile) => { const a = new Vector3(...profile.points[0] as [number, number, number]), b = new Vector3(...profile.points.at(-1) as [number, number, number]); return profile.points.map((p) => segmentDistance(new Vector3(...p as [number, number, number]), a, b)); }));
    const bounds = new Box3().setFromBufferAttribute(patch.getAttribute('position') as BufferAttribute);
    this.summary = { sourceTriangles: originalFaces.length, selectedSourceTriangles, generatedVertices: positions.length / 3, generatedTriangles: indices.length / 3, retainedTriangles: retained.length, maximumDisplacementM, boundaryMaxErrorM, float32BoundaryMaxErrorM, sourcePartitionAreaErrorM2, boundaryVertexCount: boundaryKeys.size, unexpectedOpenEdges, nonmanifoldEdges, degenerateTriangles, flippedTriangles, belowSeaTriangles, broadReliefM: config.largeScaleOffsetM, sourceProfileDeviationM, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, method: 'exact original triangle clipping at approved E0/E1/W; source middle profiles retained and subdivided; one broad outward lobe with zero T/F/W/end displacement; no end caps or extra rock instances', originalProfiles: profiles };
    if (flippedTriangles || degenerateTriangles || nonmanifoldEdges) throw new Error('G03-A1 invalid generated surface');
    scene.add(this.root); this.setVariant(false);
  }
  setVariant(active: boolean): void { this.root.visible = active; this.source.visible = active ? false : this.sourceVisibility; this.subject.visible = active ? false : this.subjectVisibility; }
  preservation(): object { return { sourceGeometryRetained: this.source.geometry === this.sourceGeometry, sourceMaterialRetained: this.source.material === this.sourceMaterial, attributesUnchanged: Object.values(this.sourceGeometry.attributes).every((a, i) => Array.from(a.array).every((n, j) => n === this.sourceArrays[i]![j])), indicesUnchanged: JSON.stringify(this.sourceGeometry.index ? Array.from(this.sourceGeometry.index.array) : null) === JSON.stringify(this.sourceIndex), subjectTransformUnchanged: this.subject.matrixWorld.elements.every((n, i) => n === this.subjectMatrix[i]), subjectVisible: this.subject.visible, originalQueryNodeRetained: true }; }
  dispose(): void { this.setVariant(false); this.root.removeFromParent(); for (const node of this.diagnosticScene.children) if ('dispose' in node && typeof node.dispose === 'function') node.dispose(); this.diagnosticScene.clear(); for (const g of this.geometries) g.dispose(); this.material.dispose(); }
}
