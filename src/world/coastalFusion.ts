import { Box3, BufferGeometry, Float32BufferAttribute, Group, Mesh, Raycaster, Vector3 } from 'three';
import type { Object3D, PerspectiveCamera, Scene } from 'three';

export const FUSION_PRESET_URL = `${import.meta.env.BASE_URL}assets/presets/coastal-g021.json`;
export interface FusionPreset { sourceNode: string; region: { min: [number, number, number]; max: [number, number, number] }; centerXZ: [number, number]; outwardXZ: [number, number]; outwardM: number; irregularityM: number; contactDropMaxM: number; contactEmbedM: number; contactBlendGain: number; unmatchedReachM: number; subdivisionLevels: number; protectedNormalY: number; protectedTopY: number }
export function parseFusionPreset(value: unknown): FusionPreset {
  if (!value || typeof value !== 'object') throw new Error('Invalid fusion preset');
  const data = value as Record<string, unknown>;
  if (data.schemaVersion !== 1 || data.baseCandidate !== 'C2' || data.sourceNode !== 'Organic_Coastal_Mass') throw new Error('Fusion must retain C2 and original terrain node');
  const tuple = (v: unknown, size: number): number[] => {
    if (!Array.isArray(v) || v.length !== size || !v.every((n: unknown) => typeof n === 'number' && Number.isFinite(n))) throw new Error('Invalid fusion coordinate');
    return v as number[];
  };
  if (!data.region || typeof data.region !== 'object') throw new Error('Invalid fusion region');
  const region = data.region as Record<string, unknown>, min = tuple(region.min, 3) as [number, number, number], max = tuple(region.max, 3) as [number, number, number];
  const metric = (key: string, limit: number): number => { const n = data[key]; if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > limit) throw new Error(`Invalid fusion ${key}`); return n; };
  if (min.some((n, axis) => n >= max[axis]!) || min[0] < 5.5 || min[1] < 0.6 || min[2] < 1 || max[0] > 9.5 || max[1] > 3.4 || max[2] > 5.2 || data.subdivisionLevels !== 2 || data.protectedNormalY !== 0.65 || data.protectedTopY !== 3.35) throw new Error('Fusion region exceeds protected local cliff boundary');
  return { sourceNode: data.sourceNode, region: { min, max }, centerXZ: tuple(data.centerXZ, 2) as [number, number], outwardXZ: tuple(data.outwardXZ, 2) as [number, number], outwardM: metric('outwardM', 1.5), irregularityM: metric('irregularityM', 0.15), contactDropMaxM: metric('contactDropMaxM', 0.35), contactEmbedM: metric('contactEmbedM', 0.1), contactBlendGain: metric('contactBlendGain', 2), unmatchedReachM: metric('unmatchedReachM', 0.25), subdivisionLevels: 2, protectedNormalY: 0.65, protectedTopY: 3.35 };
}
const smooth = (value: number): number => { const x = Math.min(1, Math.max(0, value)); return x * x * (3 - 2 * x); };
export function fusionWeight(point: Vector3, config: FusionPreset): number {
  const { min, max } = config.region;
  if (point.y >= config.protectedTopY) return 0;
  const inside = point.toArray().map((n, axis) => Math.min(n - min[axis]!, max[axis]! - n));
  if (inside.some((n) => n <= 0)) return 0;
  const edge = smooth(inside[0]! / 0.55) * smooth(inside[2]! / 0.55);
  const height = smooth((point.y - min[1]) / 0.6) * smooth((max[1] - point.y) / 0.75);
  const radial = Math.max(0, 1 - Math.hypot((point.x - config.centerXZ[0]) / 2.2, (point.z - config.centerXZ[1]) / 2.2));
  return edge * height * smooth(radial * 1.8);
}

interface Vertex { position: Vector3; attributes: Record<string, number[]> }
interface Replacement { source: Mesh; proxy: Mesh; originallyVisible: boolean }
export class CoastalFusion {
  readonly root = new Group();
  readonly summary: object;
  private replacements: Replacement[] = [];
  private patches: Vector3[][] = [];
  private protectedEdges: [Vector3, Vector3][] = [];
  private region: FusionPreset['region'];
  private originalSignatures: string[] = [];
  preservation(): object { return { originalGeometryUnchanged: this.replacements.every((r, i) => geometrySignature(r.source.geometry) === this.originalSignatures[i]), sameMaterialReferences: this.replacements.every((r) => r.source.material === r.proxy.material), originalQueryNodeRetained: true }; }
  constructor(scene: Scene, rock: Object3D, config: FusionPreset) {
    scene.updateMatrixWorld(true); this.region = config.region;
    this.root.name = 'G021RenderOnlyFusion';
    const terrain = scene.getObjectByName(config.sourceNode);
    if (!terrain) throw new Error('Cannot isolate original terrain node for fusion');
    // Lock shared edges with upward-facing surfaces, including edges across GLTF draw meshes.
    const lockedEdges: [Vector3, Vector3][] = [];
    terrain.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const p = node.geometry.getAttribute('position'), index = node.geometry.index;
      for (let i = 0; i < (index?.count ?? p.count); i += 3) {
        const [a, b, c] = [0, 1, 2].map((offset) => new Vector3().fromBufferAttribute(p, index ? index.getX(i + offset) : i + offset).applyMatrix4(node.matrixWorld)) as [Vector3, Vector3, Vector3];
        if (b.clone().sub(a).cross(c.clone().sub(a)).normalize().y >= config.protectedNormalY) lockedEdges.push([a, b], [b, c], [c, a]);
      }
    });
    const onProtectedEdge = (p: Vector3): boolean => lockedEdges.some(([a, b]) => {
      const ab = b.clone().sub(a), t = p.clone().sub(a).dot(ab) / ab.lengthSq();
      return t >= -1e-6 && t <= 1 + 1e-6 && p.distanceToSquared(a.clone().addScaledVector(ab, t)) < 1e-10;
    });
    const ray = new Raycaster(), direction = new Vector3(config.outwardXZ[0], 0, config.outwardXZ[1]).normalize();
    const edited = new Box3(), stats = { editedSourceFaces: 0, displacedVertices: 0, maxDisplacementM: 0, sourceTriangles: 0, proxyTriangles: 0, contactSamples: 0, protectedFaces: 0, protectedTopVertices: 0 };
    terrain.traverse((source) => {
      if (!(source instanceof Mesh)) return;
      const original = source.geometry, p = original.getAttribute('position'), index = original.index;
      const triangles: { vertices: Vertex[]; eligible: boolean }[] = [];
      const attributeNames = Object.keys(original.attributes);
      const sourceFaces: number[] = [];
      for (let i = 0; i < (index?.count ?? p.count); i += 3) {
        const vertices = [0, 1, 2].map((offset): Vertex => {
          const vertexIndex = index ? index.getX(i + offset) : i + offset;
          const attributes: Record<string, number[]> = {};
          for (const name of attributeNames) { const attr = original.getAttribute(name); attributes[name] = Array.from({ length: attr.itemSize }, (_, axis) => attr.getComponent(vertexIndex, axis)); }
          return { position: new Vector3().fromBufferAttribute(p, vertexIndex).applyMatrix4(source.matrixWorld), attributes };
        });
        const [a, b, c] = vertices as [Vertex, Vertex, Vertex];
        const normal = b.position.clone().sub(a.position).cross(c.position.clone().sub(a.position)).normalize();
        const bounds = new Box3().setFromPoints(vertices.map((v) => v.position));
        const eligible = normal.y < config.protectedNormalY && bounds.intersectsBox(new Box3(new Vector3(...config.region.min), new Vector3(...config.region.max)));
        if (eligible) { sourceFaces.push(i / 3); this.patches.push(vertices.map((v) => v.position.clone())); }
        else stats.protectedFaces++;
        for (const [v1, v2] of [[a, b], [b, c], [c, a]] as const) if (v1.position.y >= config.protectedTopY && v2.position.y >= config.protectedTopY && bounds.intersectsBox(new Box3(new Vector3(config.region.min[0], 0, config.region.min[2]), new Vector3(config.region.max[0], 5, config.region.max[2])))) this.protectedEdges.push([v1.position.clone(), v2.position.clone()]);
        triangles.push({ vertices, eligible });
      }
      if (!sourceFaces.length) return;
      const output: Record<string, number[]> = Object.fromEntries(attributeNames.map((name) => [name, []]));
      const inverse = source.matrixWorld.clone().invert();
      const midpoint = (a: Vertex, b: Vertex): Vertex => ({ position: a.position.clone().add(b.position).multiplyScalar(0.5), attributes: Object.fromEntries(attributeNames.map((name) => [name, a.attributes[name]!.map((n, axis) => (n + b.attributes[name]![axis]!) / 2)])) });
      const emit = (vertices: Vertex[], eligible: boolean, level: number): void => {
        const [a, b, c] = vertices as [Vertex, Vertex, Vertex];
        if (level) {
          const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
          for (const triple of [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]]) emit(triple, eligible, level - 1);
          return;
        }
        const final = vertices.map((v) => {
          const point = v.position.clone(), initialWeight = eligible ? fusionWeight(point, config) : 0;
          const weight = initialWeight > 0 && !onProtectedEdge(point) ? initialWeight : 0;
          if (weight > 0) {
            const relief = config.irregularityM * Math.sin(point.x * 4.3 + point.z * 2.1) * Math.sin(point.y * 4.1 + point.z * 3.6);
            // The rock's inward surface bounds the bridge: do not push a free-standing slab through its top.
            ray.set(point, direction); ray.far = config.outwardM + config.irregularityM + config.contactEmbedM;
            const inwardContact = ray.intersectObject(rock, true)[0];
            const reach = inwardContact ? Math.min(config.outwardM + relief, inwardContact.distance + config.contactEmbedM) : Math.min(config.unmatchedReachM, config.outwardM + relief);
            point.addScaledVector(direction, (inwardContact ? smooth(weight * config.contactBlendGain) : weight) * reach);
            ray.set(new Vector3(point.x, 8, point.z), new Vector3(0, -1, 0)); ray.far = 10;
            const contact = ray.intersectObject(rock, true)[0];
            if (contact && point.y > contact.point.y && point.y < config.protectedTopY) { point.y -= weight * Math.min(config.contactDropMaxM, point.y - contact.point.y + config.contactEmbedM); stats.contactSamples++; }
            const displacement = point.distanceTo(v.position); stats.maxDisplacementM = Math.max(stats.maxDisplacementM, displacement); if (displacement > 1e-6) { stats.displacedVertices++; edited.expandByPoint(v.position); edited.expandByPoint(point); }
          } else if (point.y >= config.protectedTopY) stats.protectedTopVertices++;
          return point.applyMatrix4(inverse);
        });
        const changed = final.some((p, axis) => p.distanceTo(vertices[axis]!.position.clone().applyMatrix4(inverse)) > 1e-6);
        const normal = final[1]!.clone().sub(final[0]!).cross(final[2]!.clone().sub(final[0]!)).normalize();
        for (let vertex = 0; vertex < 3; vertex++) for (const name of attributeNames) {
          const values = name === 'position' ? final[vertex]!.toArray() : name === 'normal' && changed ? normal.toArray() : vertices[vertex]!.attributes[name]!;
          output[name]!.push(...values);
        }
      };
      // Uniform subdivision plus protected shared-edge locks keep adjacent faces continuous.
      for (const t of triangles) emit(t.vertices, t.eligible, config.subdivisionLevels);
      const geometry = new BufferGeometry();
      for (const name of attributeNames) geometry.setAttribute(name, new Float32BufferAttribute(output[name]!, original.getAttribute(name).itemSize));
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const proxy = new Mesh(geometry, source.material); proxy.name = `${source.name}-render-fusion`;
      proxy.matrixAutoUpdate = false; proxy.matrix.copy(source.matrixWorld); proxy.castShadow = source.castShadow; proxy.receiveShadow = source.receiveShadow;
      proxy.userData.sourceFaces = sourceFaces; this.root.add(proxy); this.replacements.push({ source, proxy, originallyVisible: source.visible });
      this.originalSignatures.push(geometrySignature(original));
      stats.editedSourceFaces += sourceFaces.length; stats.sourceTriangles += triangles.length; stats.proxyTriangles += geometry.getAttribute('position').count / 3;
    });
    if (!stats.displacedVertices) throw new Error('Fusion patch has no safely editable steep faces');
    this.summary = { ...stats, editedBounds: { min: edited.min.toArray(), max: edited.max.toArray() }, replacedDrawMeshes: this.replacements.map((r) => r.source.name), sameMaterialReferences: true, originalGeometryRetained: true, protectedNormalY: config.protectedNormalY, protectedTopY: config.protectedTopY, method: 'subdivided render-only steep-cliff proxy, local deterministic displacement and sampled A4 contact; original named terrain remains unchanged for ray/collision queries' };
    scene.add(this.root); this.setVariant(false);
  }
  setVariant(geometry: boolean): void { this.root.visible = geometry; for (const r of this.replacements) r.source.visible = geometry ? false : r.originallyVisible; }
  projectedBoundary(camera: PerspectiveCamera, width: number, height: number): object {
    const project = (p: Vector3): number[] => { const v = p.clone().project(camera); return [(v.x + 1) * width / 2, (1 - v.y) * height / 2]; };
    return { editableTriangles: this.patches.map((points) => points.map(project)), protectedTopEdges: this.protectedEdges.map((points) => points.map(project)), protectedBeachY: this.region.min[1] };
  }
  dispose(): void { this.setVariant(false); this.root.removeFromParent(); for (const r of this.replacements) r.proxy.geometry.dispose(); }
}

function geometrySignature(geometry: BufferGeometry): string {
  let hash = 2166136261;
  for (const attr of [...Object.values(geometry.attributes), ...(geometry.index ? [geometry.index] : [])]) {
    const bytes = new Uint8Array(attr.array.buffer, attr.array.byteOffset, attr.array.byteLength);
    for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
  }
  return (hash >>> 0).toString(16);
}
