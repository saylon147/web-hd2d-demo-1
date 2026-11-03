import { Box3, BufferGeometry, Float32BufferAttribute, Group, Light, Mesh, MeshStandardMaterial, PerspectiveCamera, Plane, Raycaster, Scene, ShapeUtils, Triangle, Vector2, Vector3 } from 'three';
import type { Object3D } from 'three';

export const ROCK_PROTOTYPE_URL = `${import.meta.env.BASE_URL}assets/presets/coastal-g04-a1.json`;
type XYZ = [number, number, number];
export interface RockPrototypePreset {
  window: { min: XYZ; max: XYZ }; rings: XYZ[][];
  material: { color: string; roughness: number };
  isolatedCamera: { position: XYZ; target: XYZ; fov: number };
}
export function parseRockPrototypePreset(value: unknown): RockPrototypePreset {
  if (!value || typeof value !== 'object') throw new Error('G04-A1 preset missing');
  const d = value as Record<string, unknown>;
  const tuple = (v: unknown): XYZ => {
    if (!Array.isArray(v) || v.length !== 3 || !v.every((n: unknown) => typeof n === 'number' && Number.isFinite(n))) throw new Error('G04-A1 invalid coordinates');
    return v as XYZ;
  };
  if (d.schemaVersion !== 1 || d.subject !== 'front-wall' || !d.window || typeof d.window !== 'object' || !Array.isArray(d.rings) || d.rings.length !== 3) throw new Error('G04-A1 limited to one A2 prototype');
  const w = d.window as Record<string, unknown>, min = tuple(w.min), max = tuple(w.max);
  if (min.some((n, i) => n >= max[i]!) || min[0] < 8.2 || max[0] > 11.2 || min[1] < -0.5 || max[1] > 2.35 || min[2] < 5 || max[2] > 7.2) throw new Error('G04-A1 exceeds local window');
  const rings = d.rings.map((ring: unknown): XYZ[] => {
    if (!Array.isArray(ring) || ring.length !== 14) throw new Error('G04-A1 requires matching hand-directed sections');
    return ring.map(tuple);
  });
  for (let r = 0; r < rings.length; r++) for (const [i, p] of rings[r]!.entries()) {
    if (p.some((n, k) => n < min[k]! || n > max[k]!) || (r > 0 && p[1] <= rings[r - 1]![i]![1])) throw new Error('G04-A1 section exceeds bounds or folds vertically');
  }
  if (!d.material || typeof d.material !== 'object' || !d.isolatedCamera || typeof d.isolatedCamera !== 'object') throw new Error('G04-A1 material/camera missing');
  const m = d.material as Record<string, unknown>, c = d.isolatedCamera as Record<string, unknown>;
  if (typeof m.color !== 'string' || !/^#[a-f\d]{6}$/i.test(m.color) || m.roughness !== 0.95 || c.fov !== 35) throw new Error('G04-A1 requires neutral rough material and fixed FOV');
  return { window: { min, max }, rings, material: { color: m.color, roughness: m.roughness }, isolatedCamera: { position: tuple(c.position), target: tuple(c.target), fov: c.fov } };
}

/** Actual world-space triangles, after GLTF/placement matrices. No source buffers mutated. */
function triangles(root: Object3D): Triangle[] {
  root.updateWorldMatrix(true, true);
  const result: Triangle[] = [];
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const p = node.geometry.getAttribute('position'), index = node.geometry.index;
    for (let i = 0; i < (index?.count ?? p.count); i += 3) result.push(new Triangle(...[0, 1, 2].map((k) => new Vector3().fromBufferAttribute(p, index ? index.getX(i + k) : i + k).applyMatrix4(node.matrixWorld)) as [Vector3, Vector3, Vector3]));
  });
  return result;
}
function planeSegments(faces: Triangle[], plane: Plane, window: Box3): XYZ[][] {
  const result: XYZ[][] = [];
  const clip = (a: Vector3, b: Vector3): XYZ[] | null => {
    const av = a.toArray(), bv = b.toArray(), min = window.min.toArray(), max = window.max.toArray();
    let start = 0, end = 1;
    for (let axis = 0; axis < 3; axis++) {
      const delta = bv[axis]! - av[axis]!;
      if (Math.abs(delta) < 1e-10) { if (av[axis]! < min[axis]! - 1e-6 || av[axis]! > max[axis]! + 1e-6) return null; }
      else {
        const t0 = (min[axis]! - av[axis]!) / delta, t1 = (max[axis]! - av[axis]!) / delta;
        start = Math.max(start, Math.min(t0, t1)); end = Math.min(end, Math.max(t0, t1));
        if (start > end) return null;
      }
    }
    return end - start > 1e-8 ? [a.clone().lerp(b, start).toArray(), a.clone().lerp(b, end).toArray()] : null;
  };
  for (const face of faces) {
    const points: Vector3[] = [], vertices = [face.a, face.b, face.c];
    for (let i = 0; i < 3; i++) {
      const a = vertices[i]!, b = vertices[(i + 1) % 3]!, da = plane.distanceToPoint(a), db = plane.distanceToPoint(b);
      if (Math.abs(da) < 1e-8) points.push(a.clone());
      if (da * db < 0) points.push(a.clone().lerp(b, da / (da - db)));
    }
    const unique = points.filter((p, i) => points.slice(0, i).every((q) => p.distanceTo(q) > 1e-7));
    if (unique.length === 2) { const segment = clip(unique[0]!, unique[1]!); if (segment) result.push(segment); }
  }
  return result;
}
export function createRockGeometry(config: RockPrototypePreset): BufferGeometry {
  const geometry = new BufferGeometry(), n = config.rings[0]!.length, indices: number[] = [];
  geometry.setAttribute('position', new Float32BufferAttribute(config.rings.flat(2), 3));
  for (let r = 0; r + 1 < config.rings.length; r++) for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, a = r * n + i, b = r * n + j, c = (r + 1) * n + i, d = (r + 1) * n + j;
    indices.push(a, c, d, a, d, b);
  }
  for (const r of [0, config.rings.length - 1]) {
    const cap = ShapeUtils.triangulateShape(config.rings[r]!.map((p) => new Vector2(p[0], p[2])), []);
    for (const face of cap) indices.push(...(r === 0 ? face : [...face].reverse()).map((i) => r * n + i));
  }
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}
export function auditRockGeometry(geometry: BufferGeometry): { vertices: number; triangles: number; openEdges: number; nonmanifoldEdges: number; degenerateTriangles: number; signedVolumeM3: number; bounds: { min: number[]; max: number[] } } {
  const p = geometry.getAttribute('position'), index = geometry.index!;
  const edges = new Map<string, number>(); let degenerateTriangles = 0, signedVolumeM3 = 0;
  for (let i = 0; i < index.count; i += 3) {
    const ids = [0, 1, 2].map((k) => index.getX(i + k)), v = ids.map((id) => new Vector3().fromBufferAttribute(p, id));
    const face = new Triangle(...v as [Vector3, Vector3, Vector3]);
    if (face.getArea() < 1e-9) degenerateTriangles++;
    signedVolumeM3 += v[0]!.dot(v[1]!.clone().cross(v[2]!)) / 6;
    for (let k = 0; k < 3; k++) { const key = [ids[k]!, ids[(k + 1) % 3]!].sort((a, b) => a - b).join(','); edges.set(key, (edges.get(key) ?? 0) + 1); }
  }
  const bounds = geometry.boundingBox!;
  return { vertices: p.count, triangles: index.count / 3, openEdges: [...edges.values()].filter((n) => n === 1).length, nonmanifoldEdges: [...edges.values()].filter((n) => n !== 2).length, degenerateTriangles, signedVolumeM3, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } };
}

export class CoastalRockPrototype {
  readonly root = new Group();
  readonly isolatedScene = new Scene();
  readonly isolatedCamera: PerspectiveCamera;
  readonly measurement: object;
  readonly summary: ReturnType<typeof auditRockGeometry> & { seaY: number; waterSegments: XYZ[][]; topHeightRangeM: number; depthRangeM: number[] };
  private geometry: BufferGeometry;
  private material: MeshStandardMaterial;
  private neutral: MeshStandardMaterial;
  private subjectSnapshot: { mesh: Mesh; geometry: BufferGeometry; material: Mesh['material']; arrays: number[][]; index: number[] | null }[] = [];
  private neighbours: { node: Object3D; matrix: number[]; visible: boolean }[];
  constructor(private scene: Scene, subject: Object3D, config: RockPrototypePreset) {
    if (subject.name !== 'front-wall') throw new Error('G04-A1 requires original A2');
    scene.updateMatrixWorld(true);
    const terrain = scene.getObjectByName('Organic_Coastal_Mass'), sea = scene.getObjectByName('Sea_Plane');
    if (!terrain || !sea) throw new Error('G04-A1 original terrain/sea missing');
    const seaY = sea.getWorldPosition(new Vector3()).y, bounds = new Box3(new Vector3(...config.window.min), new Vector3(...config.window.max));
    const faces = triangles(subject), terrainFaces = triangles(terrain), ray = new Raycaster();
    const intersect = (root: Object3D, origin: Vector3, direction: Vector3): XYZ | null => { ray.set(origin, direction); return ray.intersectObject(root, true)[0]?.point.toArray() ?? null; };
    const neighbours = subject.parent!.children.filter((node) => node !== subject);
    const profiles: object[] = [], top: object[] = [];
    // Survey BEFORE creating the candidate; y=seaY intersections come from real triangles.
    for (const x of [8.2, 8.6, 9, 9.4, 9.8, 10.2, 10.6, 11, 11.2]) for (const y of [seaY, 0.3, 0.8, 1.3, 1.8, 2.1]) {
      const origin = new Vector3(x, y, 15), direction = new Vector3(0, 0, -1);
      const a2 = intersect(subject, origin, direction), ground = intersect(terrain, origin, direction);
      ray.set(origin, direction); const blocker = ray.intersectObjects(neighbours, true)[0];
      profiles.push({ x, y, a2, terrain: ground, blockedFromSouth: Boolean(a2 && blocker && blocker.point.z > a2[2]), firstNeighbour: blocker ? { point: blocker.point.toArray(), mesh: blocker.object.name } : null });
    }
    for (const x of [8.2, 9, 10, 11.2]) for (const z of [5, 5.7, 6.4, 7.2]) {
      const origin = new Vector3(x, 10, z), direction = new Vector3(0, -1, 0);
      top.push({ x, z, a2: intersect(subject, origin, direction), terrain: intersect(terrain, origin, direction) });
    }
    const cuts = [
      { id: 'W / A2 actual Y=seaY', plane: new Plane(new Vector3(0, 1, 0), -seaY) },
      { id: 'E0 / A2 X=8.2', plane: new Plane(new Vector3(1, 0, 0), -8.2) },
      { id: 'E1 / A2 X=11.2', plane: new Plane(new Vector3(1, 0, 0), -11.2) },
      { id: 'REAR / A2 Z=5', plane: new Plane(new Vector3(0, 0, 1), -5) },
    ].map((cut) => ({ id: cut.id, segments: planeSegments(faces, cut.plane, bounds) }));
    this.measurement = { coordinates: 'world meters, +Y up; actual matrixWorld; no P0 pixel conversion', method: 'south-facing ray profiles, vertical top rays, actual triangle/plane cuts; sampled boundaries, not approved manifold replacement seams', seaY, window: config.window, a2MatrixWorld: subject.matrixWorld.toArray(), profiles, top, cuts, terrainWater: planeSegments(terrainFaces, new Plane(new Vector3(0, 1, 0), -seaY), new Box3(new Vector3(8.2, -0.5, 0), new Vector3(11.2, 2.35, 7.2))) };
    subject.traverse((node) => { if (node instanceof Mesh) { const geometry: BufferGeometry = node.geometry; this.subjectSnapshot.push({ mesh: node, geometry, material: node.material, arrays: Object.values(geometry.attributes).map((a) => Array.from(a.array)), index: geometry.index ? Array.from(geometry.index.array) : null }); } });
    this.neighbours = neighbours.map((node) => ({ node, matrix: node.matrixWorld.toArray(), visible: node.visible }));
    this.geometry = createRockGeometry(config);
    const audit = auditRockGeometry(this.geometry);
    if (audit.openEdges || audit.nonmanifoldEdges || audit.degenerateTriangles || audit.signedVolumeM3 <= 0) { this.geometry.dispose(); throw new Error('G04-A1 invalid closed solid'); }
    const mesh = new Mesh(this.geometry, this.material = new MeshStandardMaterial({ color: config.material.color, roughness: config.material.roughness, metalness: 0, flatShading: true }));
    mesh.name = 'G04A1A2ClosedPrototype'; mesh.castShadow = true; mesh.receiveShadow = true;
    this.root.name = 'G04A1A2ExperimentalLayer'; this.root.add(mesh); scene.add(this.root);
    this.neutral = new MeshStandardMaterial({ color: '#b9b6ad', roughness: 0.95, flatShading: true });
    const isolated = new Mesh(this.geometry, this.neutral); isolated.castShadow = true; isolated.receiveShadow = true;
    this.isolatedScene.background = scene.background; this.isolatedScene.add(isolated);
    for (const node of scene.children) if (node instanceof Light) this.isolatedScene.add(node.clone());
    this.isolatedCamera = new PerspectiveCamera(35, 1, 0.1, 100); this.isolatedCamera.position.set(...config.isolatedCamera.position); this.isolatedCamera.lookAt(new Vector3(...config.isolatedCamera.target)); this.isolatedCamera.updateMatrixWorld(true);
    const uploadedFaces = triangles(mesh), topRing = config.rings.at(-1)!;
    this.summary = { ...audit, seaY, waterSegments: planeSegments(uploadedFaces, new Plane(new Vector3(0, 1, 0), -seaY), bounds), topHeightRangeM: Math.max(...topRing.map((p) => p[1])) - Math.min(...topRing.map((p) => p[1])), depthRangeM: config.rings.map((ring) => Math.max(...ring.map((p) => p[2])) - Math.min(...ring.map((p) => p[2]))) };
    this.setVariant(false);
  }
  setVariant(active: boolean): void { this.root.visible = active; }
  preservation(): object {
    this.scene.updateMatrixWorld(true);
    return { originalA2GeometryRetained: this.subjectSnapshot.every((s) => s.mesh.geometry === s.geometry && Object.values(s.geometry.attributes).every((a, i) => Array.from(a.array).every((n, j) => n === s.arrays[i]![j])) && JSON.stringify(s.geometry.index ? Array.from(s.geometry.index.array) : null) === JSON.stringify(s.index)), originalA2MaterialsRetained: this.subjectSnapshot.every((s) => s.mesh.material === s.material), neighboursUnchanged: this.neighbours.every((s) => s.node.visible === s.visible && s.node.matrixWorld.elements.every((n, i) => n === s.matrix[i])), method: 'depth occlusion only; original A2 always present; toggle removes entire experimental layer' };
  }
  dispose(): void { this.root.removeFromParent(); for (const node of this.isolatedScene.children) if (node instanceof Light && 'dispose' in node && typeof node.dispose === 'function') node.dispose(); this.isolatedScene.clear(); this.geometry.dispose(); this.material.dispose(); this.neutral.dispose(); }
}
