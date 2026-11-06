import { Box3, Mesh, Plane, Vector3 } from 'three';
import type { Object3D, Scene } from 'three';
import type { Triple } from '../config/cottageCandidate';

type Point = [number, number];
type Bounds = { min: Triple; max: Triple };
const required = (scene: Scene, name: string): Object3D => {
  const node = scene.getObjectByName(name); if (!node) throw new Error(`Cottage structure node missing: ${name}`); return node;
};

/** Clip a projected triangle to a rectangle. This measures platform geometry inside an envelope, not model support. */
export function clippedTriangleArea(triangle: Point[], rectangle: { minX: number; maxX: number; minZ: number; maxZ: number }): number {
  let polygon = triangle;
  const boundaries: [0 | 1, number, boolean][] = [[0, rectangle.minX, true], [0, rectangle.maxX, false], [1, rectangle.minZ, true], [1, rectangle.maxZ, false]];
  for (const [axis, limit, greater] of boundaries) {
    const clipped: Point[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
      const insideA = greater ? a[axis] >= limit : a[axis] <= limit, insideB = greater ? b[axis] >= limit : b[axis] <= limit;
      if (insideA) clipped.push(a);
      if (insideA !== insideB) {
        const t = (limit - a[axis]) / (b[axis] - a[axis]); clipped.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
    }
    polygon = clipped;
  }
  let area = 0;
  for (let i = 0; i < polygon.length; i++) { const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!; area += a[0] * b[1] - b[0] * a[1]; }
  return Math.abs(area) / 2;
}

function vertexPenetration(root: Object3D, obstacle: Mesh) {
  const box = new Box3().setFromObject(obstacle, true), candidateBox = new Box3().setFromObject(root, true), aabbOverlap = candidateBox.intersectsBox(box);
  const result = { name: obstacle.name, bounds: { min: box.min.toArray(), max: box.max.toArray() }, aabbOverlap, convex: null as boolean | null,
    candidateVerticesInside: 0, verticesDeeperThan1cm: 0, maxVertexDepthM: 0, examples: [] as { point: Triple; depthM: number }[] };
  if (!aabbOverlap) return result;
  result.convex = true;
  const p = obstacle.geometry.getAttribute('position'), index = obstacle.geometry.index, center = box.getCenter(new Vector3());
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), planes: Plane[] = [];
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    a.fromBufferAttribute(p, index ? index.getX(i) : i).applyMatrix4(obstacle.matrixWorld);
    b.fromBufferAttribute(p, index ? index.getX(i + 1) : i + 1).applyMatrix4(obstacle.matrixWorld);
    c.fromBufferAttribute(p, index ? index.getX(i + 2) : i + 2).applyMatrix4(obstacle.matrixWorld);
    const plane = new Plane().setFromCoplanarPoints(a, b, c); if (plane.distanceToPoint(center) > 0) plane.negate(); planes.push(plane);
  }
  for (let i = 0; i < p.count; i++) { a.fromBufferAttribute(p, i).applyMatrix4(obstacle.matrixWorld); if (planes.some((plane) => plane.distanceToPoint(a) > 1e-5)) result.convex = false; }
  if (!result.convex) return result;
  root.traverse((mesh) => {
    if (!(mesh instanceof Mesh)) return;
    const vertices = mesh.geometry.getAttribute('position');
    for (let i = 0; i < vertices.count; i++) {
      a.fromBufferAttribute(vertices, i).applyMatrix4(mesh.matrixWorld); if (!box.containsPoint(a)) continue;
      const depth = Math.min(...planes.map((plane) => -plane.distanceToPoint(a))); if (depth <= 1e-5) continue;
      result.candidateVerticesInside++; if (depth > 0.01) result.verticesDeeperThan1cm++;
      result.maxVertexDepthM = Math.max(result.maxVertexDepthM, depth);
      if (result.examples.length < 3) result.examples.push({ point: a.toArray(), depthM: depth });
    }
  });
  return result;
}

export function measureCottageStructure(scene: Scene, root: Object3D, base: Bounds, samples: { point: Triple; gapM: number | null; supportNode: string | null }[]) {
  const slab = required(scene, 'GroundFloor_Slab'); if (!(slab instanceof Mesh)) throw new Error('Cottage slab must be a mesh');
  const slabBox = new Box3().setFromObject(slab, true), p = slab.geometry.getAttribute('position'), index = slab.geometry.index;
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), edge = new Vector3(), normal = new Vector3();
  const rectangle = { minX: base.min[0], maxX: base.max[0], minZ: base.min[2], maxZ: base.max[2] };
  let topTriangleCount = 0, actualSlabTopAreaM2 = 0, topAreaInsideBaseEnvelopeM2 = 0;
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    a.fromBufferAttribute(p, index ? index.getX(i) : i).applyMatrix4(slab.matrixWorld);
    b.fromBufferAttribute(p, index ? index.getX(i + 1) : i + 1).applyMatrix4(slab.matrixWorld);
    c.fromBufferAttribute(p, index ? index.getX(i + 2) : i + 2).applyMatrix4(slab.matrixWorld);
    normal.subVectors(b, a).cross(edge.subVectors(c, a));
    if (normal.y <= 0 || [a, b, c].some((v) => Math.abs(v.y - slabBox.max.y) > 1e-6)) continue;
    topTriangleCount++; actualSlabTopAreaM2 += normal.y / 2;
    topAreaInsideBaseEnvelopeM2 += clippedTriangleArea([[a.x, a.z], [b.x, b.z], [c.x, c.z]], rectangle);
  }
  const innerStairs: Mesh[] = [];
  required(scene, 'StairsDown').traverse((node) => { if (node instanceof Mesh) innerStairs.push(node); });
  const guard = required(scene, 'Stair_Void_Guard'); if (!(guard instanceof Mesh)) throw new Error('Cottage guard must be a mesh');
  const supportByNode = Object.fromEntries([...new Set(samples.map((s) => s.supportNode))].map((name) => [name ?? 'no-support', samples.filter((s) => s.supportNode === name).length]));
  const slabContactPoints = samples.filter((s) => s.supportNode === slab.name && s.gapM !== null && Math.abs(s.gapM) <= 0.01).length;
  return {
    method: 'World POSITION/index. Sum original slab top triangles clipped to actual source-base XZ envelope; the real stair void is excluded by the original slab triangles. Envelope coverage is NOT physical support. Actual 425-point lower-surface rays measure contact separately. Convex guard/inner-stair volumes test every original candidate POSITION vertex with 1e-5m containment tolerance; positive hits prove penetration, zero hits do not prove all triangle intersections absent.',
    platform: { bounds: { min: slabBox.min.toArray(), max: slabBox.max.toArray() }, topTriangleCount, actualSlabTopAreaM2, topAreaInsideBaseEnvelopeM2,
      baseEnvelopeAreaM2: (base.max[0] - base.min[0]) * (base.max[2] - base.min[2]), slabContactPoints, supportByNode },
    guard: vertexPenetration(root, guard), innerStairs: innerStairs.map((mesh) => vertexPenetration(root, mesh)),
    integration: 'No slab, guard, stair, terrain, navigation or source-model edits; P3-B1 is not executed.',
  };
}
