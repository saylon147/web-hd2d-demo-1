import { Box3, Mesh, Plane, Raycaster, Triangle as ThreeTriangle, Vector3 } from 'three';
import type { Object3D, PerspectiveCamera, Scene } from 'three';

export const CLIFF_BOUNDARY_PRESET_URL = `${import.meta.env.BASE_URL}assets/presets/coastal-g03-a0.json`;
type XYZ = [number, number, number];
type Segment = [Vector3, Vector3];
interface Edge { a: Vector3; b: Vector3; opposites: Vector3[] }
interface Triangle { points: [Vector3, Vector3, Vector3]; face: number }
export interface CliffBoundaryPreset {
  sourceNode: string; cliffMesh: string; landMesh: string; seaNode: string;
  profileOriginXZ: [number, number]; rimSelectionXZ: { min: [number, number]; max: [number, number] }; weldToleranceM: number;
}
export interface BoundaryCurve { id: string; color: string; points: XYZ[]; lengthM: number }
export interface CliffBoundaryReport {
  coordinates: string; method: string; source: { node: string; cliffMesh: string; landMesh: string; matrixWorld: number[]; cliffTriangles: number; landTriangles: number };
  seaY: number; footY: number; rimLengthM: number; bounds: { min: XYZ; max: XYZ }; curves: BoundaryCurve[];
  checks: { rimSharedEdges: number; footCrossingEdges: number; seamEndpointMaxErrorM: number; sourceSurfaceMaxErrorM: number; maxProfileRiseM: number; connected: boolean; sufficientForA1: boolean };
}
export function parseCliffBoundaryPreset(value: unknown): CliffBoundaryPreset {
  if (!value || typeof value !== 'object') throw new Error('Invalid G03-A0 preset');
  const d = value as Record<string, unknown>;
  const pair = (v: unknown): [number, number] => {
    if (!Array.isArray(v) || v.length !== 2 || !v.every((n: unknown) => typeof n === 'number' && Number.isFinite(n))) throw new Error('Invalid G03-A0 XZ pair');
    return v as [number, number];
  };
  if (d.schemaVersion !== 1 || d.sourceNode !== 'Organic_Coastal_Mass' || d.cliffMesh !== 'Organic_Coastal_Mass_1' || d.landMesh !== 'Organic_Coastal_Mass_2' || d.seaNode !== 'Sea_Plane' || d.weldToleranceM !== 0.00001) throw new Error('G03-A0 must read original terrain nodes');
  if (!d.rimSelectionXZ || typeof d.rimSelectionXZ !== 'object') throw new Error('Missing G03-A0 selection');
  const region = d.rimSelectionXZ as Record<string, unknown>, min = pair(region.min), max = pair(region.max);
  if (min.some((n, i) => n >= max[i]!)) throw new Error('Invalid G03-A0 selection bounds');
  return { sourceNode: d.sourceNode, cliffMesh: d.cliffMesh, landMesh: d.landMesh, seaNode: d.seaNode, profileOriginXZ: pair(d.profileOriginXZ), rimSelectionXZ: { min, max }, weldToleranceM: d.weldToleranceM };
}
function triangles(mesh: Mesh): Triangle[] {
  const p = mesh.geometry.getAttribute('position'), index = mesh.geometry.index, result: Triangle[] = [];
  for (let i = 0; i < (index?.count ?? p.count); i += 3) result.push({ face: i / 3, points: [0, 1, 2].map((j) => new Vector3().fromBufferAttribute(p, index ? index.getX(i + j) : i + j).applyMatrix4(mesh.matrixWorld)) as Triangle['points'] });
  return result;
}
function key(p: Vector3, tolerance: number): string { return p.toArray().map((n) => Math.round(n / tolerance)).join(','); }
function edgeKey(a: Vector3, b: Vector3, tolerance: number): string { return [key(a, tolerance), key(b, tolerance)].sort().join('|'); }
function edges(faces: Triangle[], tolerance: number): Map<string, Edge> {
  const result = new Map<string, Edge>();
  for (const { points: p } of faces) for (let i = 0; i < 3; i++) {
    const a = p[i]!, b = p[(i + 1) % 3]!, opposite = p[(i + 2) % 3]!, k = edgeKey(a, b, tolerance);
    const edge = result.get(k) ?? { a, b, opposites: [] }; edge.opposites.push(opposite); result.set(k, edge);
  }
  return result;
}
/** Intersect actual triangle edges with a plane; no sampling of an invented profile. */
function slice(faces: Triangle[], plane: Plane, tolerance: number): Segment[] {
  const result = new Map<string, Segment>();
  for (const { points: p } of faces) {
    const hits = new Map<string, Vector3>();
    for (let i = 0; i < 3; i++) {
      const a = p[i]!, b = p[(i + 1) % 3]!, da = plane.distanceToPoint(a), db = plane.distanceToPoint(b);
      if (Math.abs(da) < tolerance) hits.set(key(a, tolerance), a);
      if (da * db < 0 && Math.abs(da) >= tolerance && Math.abs(db) >= tolerance) {
        const hit = a.clone().lerp(b, da / (da - db)); hits.set(key(hit, tolerance), hit);
      }
    }
    if (hits.size === 2) { const pair = [...hits.values()] as Segment; if (pair[0].distanceTo(pair[1]) > tolerance) result.set(edgeKey(...pair, tolerance), pair); }
  }
  return [...result.values()];
}
function chain(segments: Segment[], tolerance: number, start?: Vector3, stopY?: number): Vector3[] {
  const nodes = new Map<string, { point: Vector3; neighbours: Set<string> }>();
  for (const [a, b] of segments) {
    const ka = key(a, tolerance), kb = key(b, tolerance);
    if (!nodes.has(ka)) nodes.set(ka, { point: a, neighbours: new Set() });
    if (!nodes.has(kb)) nodes.set(kb, { point: b, neighbours: new Set() });
    nodes.get(ka)!.neighbours.add(kb); nodes.get(kb)!.neighbours.add(ka);
  }
  const first = start ? [...nodes.entries()].find(([, n]) => n.point.distanceTo(start) < tolerance * 3)?.[0] : [...nodes.entries()].filter(([, n]) => n.neighbours.size === 1).sort((a, b) => a[1].point.z - b[1].point.z)[0]?.[0];
  if (!first) throw new Error('G03-A0 boundary has no connected start');
  const result: Vector3[] = [], visited = new Set<string>(); let cursor: string | undefined = first;
  while (cursor) {
    const node: { point: Vector3; neighbours: Set<string> } = nodes.get(cursor)!; result.push(node.point); visited.add(cursor);
    if (stopY !== undefined && node.point.y <= stopY + tolerance) break;
    const next: string[] = [...node.neighbours].filter((n) => !visited.has(n));
    if (next.length > 1) throw new Error('G03-A0 section is branched; manual selection required');
    cursor = next[0];
  }
  if (stopY === undefined && visited.size !== nodes.size) throw new Error('G03-A0 selection contains disconnected curves');
  if (stopY !== undefined && Math.abs(result.at(-1)!.y - stopY) > tolerance * 3) throw new Error('G03-A0 seam did not reach sea level');
  return result;
}
function clip(segments: Segment[], planes: Plane[], tolerance: number): Segment[] {
  return segments.flatMap(([start, end]) => {
    let a = start.clone(), b = end.clone();
    for (const plane of planes) {
      const da = plane.distanceToPoint(a), db = plane.distanceToPoint(b);
      if (da < -tolerance && db < -tolerance) return [];
      if (da < 0 && db >= 0) a = a.clone().lerp(b, da / (da - db));
      else if (db < 0 && da >= 0) b = b.clone().lerp(a, db / (db - da));
    }
    return a.distanceTo(b) > tolerance ? [[a, b] as Segment] : [];
  });
}
export function extractCliffBoundary(scene: Object3D, config: CliffBoundaryPreset): CliffBoundaryReport {
  scene.updateMatrixWorld(true);
  const terrain = scene.getObjectByName(config.sourceNode), cliff = terrain?.getObjectByName(config.cliffMesh), land = terrain?.getObjectByName(config.landMesh), sea = scene.getObjectByName(config.seaNode);
  if (!(cliff instanceof Mesh) || !(land instanceof Mesh) || !(sea instanceof Mesh)) throw new Error('G03-A0 original meshes missing');
  const tolerance = config.weldToleranceM, faces = triangles(cliff), landFaces = triangles(land), cliffEdges = edges(faces, tolerance), landEdges = edges(landFaces, tolerance);
  const inside = (p: Vector3): boolean => p.x >= config.rimSelectionXZ.min[0] && p.x <= config.rimSelectionXZ.max[0] && p.z >= config.rimSelectionXZ.min[1] && p.z <= config.rimSelectionXZ.max[1];
  const rimEdges = [...cliffEdges.entries()].filter(([k, e]) => landEdges.has(k) && inside(e.a) && inside(e.b)).map(([, e]) => [e.a, e.b] as Segment);
  const rim = chain(rimEdges, tolerance), seaY = new Box3().setFromObject(sea).max.y;
  // Sea_Plane is an existing 0.1m box, so verify its rendered upper face.
  const seaTop = triangles(sea).filter((f) => f.points.every((p) => Math.abs(p.y - seaY) < tolerance));
  if (seaTop.length < 2) throw new Error('G03-A0 sea has no planar upper face');
  const origin = new Vector3(config.profileOriginXZ[0], 0, config.profileOriginXZ[1]);
  const middle = rim[Math.floor(rim.length / 2)]!;
  const endPlanes = [rim[0]!, rim.at(-1)!].map((p) => {
    const direction = p.clone().sub(origin).setY(0), plane = new Plane().setFromNormalAndCoplanarPoint(new Vector3(-direction.z, 0, direction.x).normalize(), origin);
    if (plane.distanceToPoint(middle) < 0) plane.negate(); return plane;
  });
  const seaPlane = new Plane(new Vector3(0, 1, 0), -seaY);
  // Find the true near-water shoulder ring: a horizontal shared edge has faces
  // leading upward and below sea. Its elevation is measured, never synthesized.
  const footEdges = [...cliffEdges.values()].filter((e) => Math.abs(e.a.y - e.b.y) < tolerance && e.a.y > seaY + tolerance && e.opposites.some((p) => p.y < seaY - tolerance) && e.opposites.some((p) => p.y > e.a.y + tolerance));
  const foot = chain(clip(footEdges.map((e) => [e.a, e.b]), endPlanes, tolerance), tolerance);
  const waterline = chain(clip(slice(faces, seaPlane, tolerance), endPlanes, tolerance), tolerance);
  const seams = endPlanes.map((plane, i) => {
    const top = i === 0 ? rim[0]! : rim.at(-1)!;
    // Only the outward half-plane and the above-sea cliff are eligible.
    const outward = top.clone().sub(origin).setY(0).normalize();
    const cut = clip(slice(faces, plane, tolerance), [seaPlane, new Plane().setFromNormalAndCoplanarPoint(outward, origin)], tolerance);
    return chain(cut, tolerance, top, seaY);
  });
  const makeCurve = (id: string, color: string, points: Vector3[]): BoundaryCurve => ({ id, color, points: points.map((p) => p.toArray()), lengthM: points.reduce((sum, p, i) => sum + (i ? p.distanceTo(points[i - 1]!) : 0), 0) });
  const curves = [makeCurve('T / cliff top', '#76ff58', rim), makeCurve('F / coastal foot', '#00e5ff', foot), makeCurve('W / sea intersection', '#ffe45c', waterline), makeCurve('E0 / end seam', '#ff71d5', seams[0]!), makeCurve('E1 / end seam', '#ff982e', seams[1]!)];
  const bounds = new Box3().setFromPoints(curves.flatMap((c) => c.points.map((p) => new Vector3(...p))));
  const endpointError = Math.max(...seams.map((seam, i) => {
    const f = i === 0 ? foot[0]! : foot.at(-1)!, w = i === 0 ? waterline[0]! : waterline.at(-1)!;
    return Math.max(...[f, w].map((p) => Math.min(...seam.slice(1).map((b, j) => {
      const a = seam[j]!, d = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(d) / d.lengthSq())); return p.distanceTo(a.clone().addScaledVector(d, t));
    }))));
  }));
  const maxRise = Math.max(0, ...seams.flatMap((s) => s.slice(1).map((p, i) => p.y - s[i]!.y)));
  // Independent nearest-triangle checks for all emitted curve points.
  const surfaceFaces = faces.map((f) => new ThreeTriangle(...f.points));
  const surfaceError = Math.max(...curves.flatMap((c) => c.points.map((xyz) => { const p = new Vector3(...xyz); return Math.min(...surfaceFaces.map((f) => f.closestPointToPoint(p, new Vector3()).distanceTo(p))); })));
  return { coordinates: 'world meters; +Y up, +X east, +Z south; full original GLB matrixWorld applied; no additional Blender axis rotation', method: 'land/cliff shared welded edges; near-water horizontal crease with adjacent face above and below sea; actual triangle/sea-plane intersection; two vertical endpoint plane cuts through documented terrain center; fail on disconnected/branched chains; all points checked against original triangles', source: { node: config.sourceNode, cliffMesh: cliff.name, landMesh: land.name, matrixWorld: cliff.matrixWorld.toArray(), cliffTriangles: faces.length, landTriangles: landFaces.length }, seaY, footY: foot[0]!.y, rimLengthM: curves[0]!.lengthM, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, curves, checks: { rimSharedEdges: rimEdges.length, footCrossingEdges: footEdges.length, seamEndpointMaxErrorM: endpointError, sourceSurfaceMaxErrorM: surfaceError, maxProfileRiseM: maxRise, connected: true, sufficientForA1: endpointError < tolerance * 3 && surfaceError < tolerance * 3 && maxRise < tolerance } };
}

/** Read-only projected markers: dashed portions are occluded by the real scene. */
export class CliffBoundaryDiagnostics {
  readonly report: CliffBoundaryReport;
  private layer: HTMLDivElement;
  private visible = true;
  constructor(private scene: Scene, viewport: HTMLElement, config: CliffBoundaryPreset, private stage = 'G03-A0') {
    this.report = extractCliffBoundary(scene, config);
    this.layer = document.createElement('div'); this.layer.className = 'g03-boundary-overlay';
    this.layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:5'; viewport.append(this.layer);
  }
  setVisible(visible: boolean): void { this.visible = visible; this.layer.hidden = !visible; }
  update(camera: PerspectiveCamera, width: number, height: number): void {
    if (!this.visible) return;
    camera.updateMatrixWorld(true); this.scene.updateMatrixWorld(true);
    const project = (p: Vector3): [number, number] => { const n = p.clone().project(camera); return [(n.x + 1) * width / 2, (1 - n.y) * height / 2]; };
    const ray = new Raycaster(), parts: string[] = [], visibleMeshes: Mesh[] = [];
    this.scene.traverseVisible((node) => { if (node instanceof Mesh) visibleMeshes.push(node); });
    for (const curve of this.report.curves) {
      const points = curve.points.map((p) => new Vector3(...p));
      for (let i = 1; i < points.length; i++) {
        // Subdivide only the marker stroke for honest visibility, not source geometry.
        const a = points[i - 1]!, b = points[i]!, count = Math.max(1, Math.ceil(a.distanceTo(b) / 0.08));
        for (let j = 0; j < count; j++) {
          const from = a.clone().lerp(b, j / count), to = a.clone().lerp(b, (j + 1) / count), middle = from.clone().lerp(to, 0.5), distance = middle.distanceTo(camera.position);
          ray.set(camera.position, middle.clone().sub(camera.position).normalize()); ray.far = distance + 0.02;
          const hit = ray.intersectObjects(visibleMeshes, false)[0], hidden = hit !== undefined && hit.distance < distance - 0.015;
          const [x1, y1] = project(from), [x2, y2] = project(to);
          parts.push(`<path d="M${x1},${y1}L${x2},${y2}" stroke="${curve.color}" stroke-width="3" ${hidden ? 'stroke-dasharray="3 3" opacity="0.75"' : ''}/>`);
        }
      }
      points.forEach((p, i) => { const [x, y] = project(p); parts.push(`<circle cx="${x}" cy="${y}" r="3.5" fill="${curve.color}" stroke="#14252c" stroke-width="1"/>`); if (curve.id.startsWith('T')) parts.push(`<text x="${x + 7}" y="${y - 7}" fill="${curve.color}" stroke="#14252c" stroke-width="3" paint-order="stroke" font-size="15" font-weight="700">T${i}</text>`); });
    }
    this.layer.innerHTML = `<svg width="${width}" height="${height}" style="position:absolute;inset:0" fill="none">${parts.join('')}</svg><div style="position:absolute;left:16px;top:16px;padding:10px 14px;background:#14252ce8;color:white;font:14px/1.65 Segoe UI,Microsoft YaHei;border-radius:5px">${this.stage} · 原始 GLB 边界 · ${this.report.rimLengthM.toFixed(3)} m<br>${this.report.curves.map((c) => `<span style="color:${c.color}">${c.id}</span>`).join(' &nbsp; ')}<br>实线 = 可见；虚线 = 遮挡后投影；圆点 = 提取点<br>F: Y=${this.report.footY.toFixed(3)} m；W: Y=${this.report.seaY.toFixed(3)} m · ${this.stage === 'G03-A0' ? '未生成崖壁' : '仅标记原边界'}</div>`;
  }
  dispose(): void { this.layer.remove(); }
}
