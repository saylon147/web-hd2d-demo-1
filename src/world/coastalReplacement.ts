import { Box3, BufferGeometry, Float32BufferAttribute, Group, Mesh, Raycaster, Vector3 } from 'three';
import type { Object3D, Scene } from 'three';

export const REPLACEMENT_PRESET_URL = `${import.meta.env.BASE_URL}assets/presets/coastal-g022.json`;
export interface ReplacementPreset {
  sourceNode: string; cliffMesh: string; landMesh: string;
  region: { min: [number, number, number]; max: [number, number, number] };
  rimXZ: [number, number][]; renderHeightScale: number; apronWidthM: number; apronEmbedM: number; rockInteriorMarginM: number;
  segmentsPerEdge: number; depthSegments: number; subdivisionLevels: number;
}
export function parseReplacementPreset(value: unknown): ReplacementPreset {
  if (!value || typeof value !== 'object') throw new Error('Invalid coastal replacement preset');
  const d = value as Record<string, unknown>;
  if (d.schemaVersion !== 1 || d.baseCandidate !== 'C2' || d.sourceNode !== 'Organic_Coastal_Mass' || d.cliffMesh !== 'Organic_Coastal_Mass_1' || d.landMesh !== 'Organic_Coastal_Mass_2') throw new Error('G02.2 must retain C2 and original terrain nodes');
  const tuple = (v: unknown, size: number): number[] => {
    if (!Array.isArray(v) || v.length !== size || !v.every((n: unknown) => typeof n === 'number' && Number.isFinite(n))) throw new Error('Invalid replacement coordinate');
    return v as number[];
  };
  if (!d.region || typeof d.region !== 'object') throw new Error('Missing local region');
  const r = d.region as Record<string, unknown>, min = tuple(r.min, 3) as [number, number, number], max = tuple(r.max, 3) as [number, number, number];
  if (min.some((n, axis) => n >= max[axis]!) || min[0] < 5.8 || min[1] < 1.8 || min[2] < 1.5 || max[0] > 9.5 || max[1] > 3.65 || max[2] > 5.1) throw new Error('Replacement exceeds local cliff boundary');
  if (!Array.isArray(d.rimXZ) || d.rimXZ.length !== 4) throw new Error('Replacement needs four original rim anchors');
  const rimXZ = d.rimXZ.map((p: unknown) => tuple(p, 2) as [number, number]);
  if (rimXZ.some(([x, z]) => x < min[0] || x > max[0] || z < min[2] || z > max[2])) throw new Error('Rim outside local region');
  const metric = (key: string, limit: number): number => { const n = d[key]; if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > limit) throw new Error(`Unsafe replacement ${key}`); return n; };
  if (d.segmentsPerEdge !== 6 || d.depthSegments !== 4 || d.subdivisionLevels !== 2) throw new Error('Unexpected experimental topology budget');
  const renderHeightScale = metric('renderHeightScale', 1.8);
  if (renderHeightScale < 1) throw new Error('Replacement height scale must retain the C2 base');
  return { sourceNode: d.sourceNode, cliffMesh: d.cliffMesh, landMesh: d.landMesh, region: { min, max }, rimXZ, renderHeightScale, apronWidthM: metric('apronWidthM', 1.4), apronEmbedM: metric('apronEmbedM', 0.05), rockInteriorMarginM: metric('rockInteriorMarginM', 0.05), segmentsPerEdge: 6, depthSegments: 4, subdivisionLevels: 2 };
}

interface Vertex { point: Vector3; attributes: Record<string, number[]> }
export class CoastalReplacement {
  readonly root = new Group();
  readonly summary: object;
  private source: Mesh;
  private originalVisibility: boolean;
  private sourceGeometry: BufferGeometry;
  private sourceArrays: number[][];
  private originalRock: Object3D;
  private originalRockVisibility: boolean;
  private subjectMatrix: number[];
  private ownedGeometries: BufferGeometry[] = [];
  constructor(scene: Scene, rock: Object3D, config: ReplacementPreset) {
    scene.updateMatrixWorld(true);
    const terrain = scene.getObjectByName(config.sourceNode), source = terrain?.getObjectByName(config.cliffMesh), land = terrain?.getObjectByName(config.landMesh);
    if (!(source instanceof Mesh) || !(land instanceof Mesh)) throw new Error('Cannot safely isolate local cliff rendering');
    this.source = source; this.originalVisibility = source.visible; this.sourceGeometry = source.geometry;
    this.sourceArrays = Object.values(this.sourceGeometry.attributes).map((a) => Array.from(a.array));
    this.root.name = 'G022RenderOnlyReplacement';
    this.originalRock = rock; this.originalRockVisibility = rock.visible;
    this.subjectMatrix = rock.matrixWorld.toArray();
    const rockProxy = rock.clone(true);
    rockProxy.name = 'G022A4SubjectReplacement'; rockProxy.scale.y *= config.renderHeightScale;
    this.root.add(rockProxy); this.root.updateMatrixWorld(true);
    const ray = new Raycaster(), coverage = new Map<string, { top: number; bottom: number } | null>();
    const column = (x: number, z: number): { top: number; bottom: number } | null => {
      const key = `${x.toFixed(6)}:${z.toFixed(6)}`;
      if (coverage.has(key)) return coverage.get(key)!;
      ray.set(new Vector3(x, 8, z), new Vector3(0, -1, 0)); ray.far = 10; const top = ray.intersectObject(rockProxy, true)[0];
      ray.set(new Vector3(x, -1, z), new Vector3(0, 1, 0)); const bottom = ray.intersectObject(rockProxy, true)[0];
      const result = top && bottom && top.point.y > bottom.point.y ? { top: top.point.y, bottom: bottom.point.y } : null;
      coverage.set(key, result); return result;
    };
    const region = new Box3(new Vector3(...config.region.min), new Vector3(...config.region.max));
    const covered = (p: Vector3): boolean => {
      if (!region.containsPoint(p)) return false;
      const c = column(p.x, p.z);
      return !!c && p.y > c.bottom + config.rockInteriorMarginM && p.y < c.top - config.rockInteriorMarginM;
    };
    const original = source.geometry, index = original.index, position = original.getAttribute('position'), names = Object.keys(original.attributes);
    const output: Record<string, number[]> = Object.fromEntries(names.map((n) => [n, []]));
    let removedTriangles = 0, removedAreaM2 = 0, retainedTriangles = 0;
    const midpoint = (a: Vertex, b: Vertex): Vertex => ({ point: a.point.clone().add(b.point).multiplyScalar(0.5), attributes: Object.fromEntries(names.map((n) => [n, a.attributes[n]!.map((v, axis) => (v + b.attributes[n]![axis]!) / 2)])) });
    const emit = (a: Vertex, b: Vertex, c: Vertex, levels: number): void => {
      if (levels) { const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a); emit(a, ab, ca, levels - 1); emit(ab, b, bc, levels - 1); emit(ca, bc, c, levels - 1); emit(ab, bc, ca, levels - 1); return; }
      const center = a.point.clone().add(b.point).add(c.point).multiplyScalar(1 / 3);
      // Discard only subfaces wholly covered by A4's vertical solid column. Uncovered cliff stays as backing.
      if ([a.point, b.point, c.point, center].every(covered)) { removedTriangles++; removedAreaM2 += b.point.clone().sub(a.point).cross(c.point.clone().sub(a.point)).length() / 2; return; }
      retainedTriangles++;
      for (const v of [a, b, c]) for (const name of names) output[name]!.push(...v.attributes[name]!);
    };
    for (let i = 0; i < (index?.count ?? position.count); i += 3) {
      const vertices = [0, 1, 2].map((offset): Vertex => {
        const v = index ? index.getX(i + offset) : i + offset;
        return { point: new Vector3().fromBufferAttribute(position, v).applyMatrix4(source.matrixWorld), attributes: Object.fromEntries(names.map((n) => { const a = original.getAttribute(n); return [n, Array.from({ length: a.itemSize }, (_, axis) => a.getComponent(v, axis))]; })) };
      }) as [Vertex, Vertex, Vertex];
      emit(...vertices, config.subdivisionLevels);
    }
    const geometry = new BufferGeometry();
    for (const n of names) geometry.setAttribute(n, new Float32BufferAttribute(output[n]!, original.getAttribute(n).itemSize));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    this.ownedGeometries.push(geometry);
    const cliff = new Mesh(geometry, source.material); cliff.name = 'G022RetainedCliff'; cliff.matrixAutoUpdate = false; cliff.matrix.copy(source.matrixWorld); cliff.castShadow = source.castShadow; cliff.receiveShadow = source.receiveShadow; this.root.add(cliff);

    // One continuous apron: exact original rim edge, sampled A4 top, zero-width endpoints. No new rock instances.
    const landP = land.geometry.getAttribute('position');
    const rim = config.rimXZ.map(([x, z]) => {
      let nearest: Vector3 | undefined, distance = Infinity;
      for (let i = 0; i < landP.count; i++) { const p = new Vector3().fromBufferAttribute(landP, i).applyMatrix4(land.matrixWorld), delta = Math.hypot(p.x - x, p.z - z); if (delta < distance) { distance = delta; nearest = p; } }
      if (!nearest || distance > 0.03) throw new Error('Rim anchor does not match original green terrain');
      return nearest;
    });
    const grid: Vector3[][] = [], contacts: object[] = [], edges = (rim.length - 1) * config.segmentsPerEdge;
    for (let i = 0; i <= edges; i++) {
      const segment = Math.min(rim.length - 2, Math.floor(i / config.segmentsPerEdge)), t = i / config.segmentsPerEdge - segment;
      const inner = rim[segment]!.clone().lerp(rim[segment + 1]!, t), tangent = rim[Math.min(rim.length - 1, segment + 1)]!.clone().sub(rim[segment]!);
      const outward = new Vector3(-tangent.z, 0, tangent.x).normalize(), taper = Math.pow(Math.sin(Math.PI * i / edges), 0.65);
      const outer = inner.clone().addScaledVector(outward, config.apronWidthM * taper), c = column(outer.x, outer.z);
      if (!c) throw new Error('A4 cannot support the selected apron top boundary');
      outer.y = c.top - config.apronEmbedM;
      if (i === 0 || i === edges) outer.copy(inner);
      contacts.push({ rim: inner.toArray(), outer: outer.toArray(), rockTopY: c.top, taperedEndpoint: i === 0 || i === edges });
      grid.push(Array.from({ length: config.depthSegments + 1 }, (_, depth) => inner.clone().lerp(outer, depth / config.depthSegments)));
    }
    const apronPositions: number[] = [];
    for (let i = 0; i < edges; i++) for (let d = 0; d < config.depthSegments; d++) for (const tri of [[grid[i]![d]!, grid[i + 1]![d]!, grid[i]![d + 1]!], [grid[i + 1]![d]!, grid[i + 1]![d + 1]!, grid[i]![d + 1]!]]) {
      if (tri[1]!.clone().sub(tri[0]!).cross(tri[2]!.clone().sub(tri[0]!)).y < 0) [tri[1], tri[2]] = [tri[2]!, tri[1]!];
      if (tri[1]!.clone().sub(tri[0]!).cross(tri[2]!.clone().sub(tri[0]!)).lengthSq() > 1e-12) apronPositions.push(...tri.flatMap((p) => p.toArray()));
    }
    const apronGeometry = new BufferGeometry(); apronGeometry.setAttribute('position', new Float32BufferAttribute(apronPositions, 3)); apronGeometry.computeVertexNormals(); apronGeometry.computeBoundingBox(); apronGeometry.computeBoundingSphere();
    this.ownedGeometries.push(apronGeometry);
    const apron = new Mesh(apronGeometry, land.material); apron.name = 'G022SingleLandApron'; apron.castShadow = true; apron.receiveShadow = true; this.root.add(apron);
    this.summary = { sourceTriangles: (index?.count ?? position.count) / 3, removedTriangles, removedAreaM2, retainedTriangles, apronTriangles: apronPositions.length / 9, addedRockInstances: 0, subjectRenderHeightScale: config.renderHeightScale, subjectRenderMatrix: rockProxy.matrixWorld.toArray(), rim: rim.map((p) => p.toArray()), contactRows: contacts, originalRockBounds: new Box3().setFromObject(rock), rockBounds: new Box3().setFromObject(rockProxy), region: config.region, method: 'one C2 A4 render replacement, conservative covered cliff subface removal plus one land apron; original terrain remains the query/collision source' };
    scene.add(this.root); this.setVariant(false);
  }
  setVariant(replacement: boolean): void { this.root.visible = replacement; this.source.visible = replacement ? false : this.originalVisibility; this.originalRock.visible = replacement ? false : this.originalRockVisibility; }
  preservation(): object { return { sourceGeometryRetained: this.source.geometry === this.sourceGeometry, originalAttributesUnchanged: Object.values(this.source.geometry.attributes).every((a, i) => Array.from(a.array).every((n, j) => n === this.sourceArrays[i]![j])), sameCliffMaterial: (this.root.getObjectByName('G022RetainedCliff') as Mesh).material === this.source.material, originalQueryNodeRetained: true, originalSubjectTransformRetained: this.originalRock.matrixWorld.elements.every((n, i) => n === this.subjectMatrix[i]) }; }
  dispose(): void { this.setVariant(false); this.root.removeFromParent(); for (const geometry of this.ownedGeometries) geometry.dispose(); }
}
