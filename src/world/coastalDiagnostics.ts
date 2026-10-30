import { AxesHelper, Box3, Box3Helper, BufferGeometry, Color, Group, LineBasicMaterial, LineSegments, Matrix3, Mesh, MeshBasicMaterial, PerspectiveCamera, Raycaster, SphereGeometry, Vector2, Vector3 } from 'three';
import type { Object3D, Scene } from 'three';
import type { CoastalPlacement } from '../config/coastal';

export const G01_PRESET_URL = `${import.meta.env.BASE_URL}assets/presets/coastal-g01.json`;
export const G01_VIEWS = ['golden', 'side', 'back', 'below'] as const;
export type G01View = typeof G01_VIEWS[number];
interface DiagnosticView { position: [number, number, number]; target: [number, number, number]; fov: number }
export interface DiagnosticPreset { views: Record<G01View, DiagnosticView> }
export function parseDiagnosticPreset(value: unknown): DiagnosticPreset {
  if (!value || typeof value !== 'object' || !('views' in value) || value.views === null || typeof value.views !== 'object') throw new Error('Invalid G01 camera preset');
  const views = {} as DiagnosticPreset['views'];
  const tuple = (v: unknown): [number, number, number] => {
    if (!Array.isArray(v) || v.length !== 3 || !v.every((n: unknown) => typeof n === 'number' && Number.isFinite(n))) throw new Error('Invalid G01 camera vector');
    return v as [number, number, number];
  };
  for (const key of G01_VIEWS) {
    const raw: unknown = (value.views as Record<string, unknown>)[key];
    if (!raw || typeof raw !== 'object' || !('position' in raw) || !('target' in raw) || !('fov' in raw) || raw.fov !== 35) throw new Error('Invalid G01 camera');
    const position = tuple(raw.position), target = tuple(raw.target);
    if (new Vector3(...position).distanceTo(new Vector3(...target)) < 0.1) throw new Error('Degenerate G01 camera');
    views[key] = { position, target, fov: 35 };
  }
  return { views };
}
export function diagnosticCamera(preset: DiagnosticPreset, view: G01View): PerspectiveCamera {
  const state = preset.views[view], camera = new PerspectiveCamera(state.fov, 1, 0.1, 100);
  camera.position.set(...state.position); camera.lookAt(new Vector3(...state.target)); camera.updateMatrixWorld(true);
  return camera;
}

interface Face { a: Vector3; b: Vector3; c: Vector3; normal: Vector3; center: Vector3 }
interface Edge { a: Vector3; b: Vector3; faces: Face[] }
interface Sample { point: number[]; terrainTopY: number | null; otherTopY: number | null; otherAbove: boolean; supportY: number | null; supportId: string | null; gapM: number | null; terrainAbove: boolean }
const colors = [0xff595e, 0xffca3a, 0x48c9b0, 0xb765ff, 0x39a7ff];

/** Read world-space triangles, including GLTF node transforms. Never change subject geometry/materials. */
function geometry(root: Object3D): { faces: Face[]; edges: Edge[]; min: Vector3; bounds: Box3 } {
  const faces: Face[] = [], edges = new Map<string, Edge>(), bounds = new Box3();
  const min = new Vector3(0, Infinity, 0);
  const vertexKey = (v: Vector3): string => v.toArray().map((n) => Math.round(n * 1e5)).join(',');
  root.traverse((item) => {
    if (!(item instanceof Mesh)) return;
    const position = item.geometry.getAttribute('position'), index = item.geometry.index;
    for (let i = 0; i < (index?.count ?? position.count); i += 3) {
      const vertices = [0, 1, 2].map((offset) => new Vector3().fromBufferAttribute(position, index ? index.getX(i + offset) : i + offset).applyMatrix4(item.matrixWorld));
      const [a, b, c] = vertices as [Vector3, Vector3, Vector3];
      for (const v of vertices) { bounds.expandByPoint(v); if (v.y < min.y) min.copy(v); }
      const face = { a, b, c, normal: b.clone().sub(a).cross(c.clone().sub(a)).normalize(), center: a.clone().add(b).add(c).multiplyScalar(1 / 3) };
      faces.push(face);
      for (const [start, end] of [[a, b], [b, c], [c, a]] as const) {
        const key = [vertexKey(start), vertexKey(end)].sort().join('|');
        const edge = edges.get(key) ?? { a: start, b: end, faces: [] };
        edge.faces.push(face); edges.set(key, edge);
      }
    }
  });
  return { faces, edges: [...edges.values()], min, bounds };
}

export class CoastalDiagnostics {
  readonly root = new Group();
  readonly report: object;
  private labels: { element: HTMLElement; position: Vector3; detail: boolean }[] = [];
  private subjects: { instance: Object3D; faces: Face[] }[] = [];
  private scene: Scene;
  private showDetails = false;
  private lines: { edges: Edge[]; line: LineSegments }[] = [];
  private ownedGeometries: BufferGeometry[] = [];
  private ownedMaterials: (MeshBasicMaterial | LineBasicMaterial)[] = [];
  private helpers: (AxesHelper | Box3Helper)[] = [];
  private layer: HTMLDivElement;
  private terrainLines: Group;
  private lastCamera = '';
  constructor(scene: Scene, modules: Group, placements: CoastalPlacement[], host: HTMLElement) {
    this.scene = scene;
    scene.updateMatrixWorld(true);
    this.root.name = 'G01Diagnostics'; this.root.visible = false;
    this.layer = document.createElement('div'); this.layer.className = 'g01-labels'; this.layer.hidden = true; host.append(this.layer);
    const axes = new AxesHelper(3); this.root.add(axes); this.helpers.push(axes);
    const terrain = scene.getObjectByName('Organic_Coastal_Mass');
    if (!terrain) throw new Error('G01 requires actual Organic_Coastal_Mass');
    this.terrainLines = new Group();
    // Independent wireframe proxy, sharing read-only geometry. No terrain material replacement.
    const wireMaterial = new MeshBasicMaterial({ color: 0xeaf7ff, wireframe: true, transparent: true, opacity: 0.22, depthWrite: false, depthTest: false });
    this.ownedMaterials.push(wireMaterial);
    terrain.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const wire = new Mesh(node.geometry, wireMaterial); wire.matrixAutoUpdate = false; wire.matrix.copy(node.matrixWorld); this.terrainLines.add(wire);
    });
    this.root.add(this.terrainLines);
    const ray = new Raycaster(), down = new Vector3(0, -1, 0);
    const records = modules.children.map((instance, ordinal) => {
      const placement = placements.find((p) => p.id === instance.name)!;
      const { faces, edges, min, bounds } = geometry(instance), color = colors[ordinal % colors.length]!;
      this.subjects.push({ instance, faces });
      const box = new Box3Helper(bounds, color); this.root.add(box); this.helpers.push(box);
      const material = new LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 }); this.ownedMaterials.push(material);
      const lineGeometry = new BufferGeometry(); this.ownedGeometries.push(lineGeometry);
      const line = new LineSegments(lineGeometry, material); line.frustumCulled = false; line.renderOrder = 10; this.root.add(line); this.lines.push({ edges, line });
      const anchor = instance.getWorldPosition(new Vector3());
      const anchorAxes = new AxesHelper(0.7); anchorAxes.position.copy(anchor); this.root.add(anchorAxes); this.helpers.push(anchorAxes);
      this.marker(anchor, color, `${placement.asset} / ${instance.name}`, new Vector3(bounds.getCenter(new Vector3()).x, bounds.max.y + 0.22 + ordinal * 0.12, bounds.getCenter(new Vector3()).z));
      this.marker(min, color, `${instance.name} min ${min.y.toFixed(3)}m`, min, true);
      ray.set(new Vector3(anchor.x, 20, anchor.z), down); ray.far = 40;
      const terrainAnchorTopY = ray.intersectObject(terrain, true)[0]?.point.y ?? null;
      const otherInstances = modules.children.filter((item) => item !== instance);
      const centerSupportTopY = ray.intersectObjects([terrain, ...otherInstances], true)[0]?.point.y ?? null;
      const samples: Sample[] = [], cells = new Set<string>();
      // Deterministic underside face centroids, one per 0.25m projected cell; not a volume/collision certificate.
      for (const face of faces) {
        if (face.normal.y > -0.35) continue;
        const point = face.center, cell = `${Math.floor(point.x / 0.25)},${Math.floor(point.z / 0.25)}`;
        if (cells.has(cell)) continue; cells.add(cell);
        ray.set(new Vector3(point.x, 20, point.z), down); ray.far = 40;
        const terrainTopY = ray.intersectObject(terrain, true)[0]?.point.y ?? null;
        const otherTopY = ray.intersectObjects(otherInstances, true)[0]?.point.y ?? null;
        ray.set(new Vector3(point.x, point.y + 0.005, point.z), down);
        const supports = ray.intersectObjects([terrain, ...otherInstances], true);
        const support = supports[0];
        let supportId: string | null = null;
        if (support) { supportId = 'terrain'; for (const other of modules.children) { let node: Object3D | null = support.object; while (node) { if (node === other) supportId = other.name; node = node.parent; } } }
        samples.push({ point: point.toArray(), terrainTopY, otherTopY, otherAbove: otherTopY !== null && otherTopY >= point.y, supportY: support?.point.y ?? null, supportId, gapM: support ? point.y - support.point.y : null, terrainAbove: terrainTopY !== null && terrainTopY >= point.y });
      }
      const exposed = samples.filter((s) => !s.terrainAbove && !s.otherAbove && (s.gapM === null || s.gapM > 0.05));
      // Show three spatial probes with the largest measured gap, including unsupported outside terrain columns.
      const probes = [...exposed].sort((a, b) => (b.gapM ?? 20) - (a.gapM ?? 20)).filter((s, i, all) => all.slice(0, i).every((prev) => new Vector3(...prev.point as [number, number, number]).distanceTo(new Vector3(...s.point as [number, number, number])) > 0.8)).slice(0, 3);
      for (const sample of placement.position[1] > 0 ? probes : []) {
        const point = new Vector3(...sample.point as [number, number, number]);
        this.marker(point, color, `${instance.name}: ${sample.gapM?.toFixed(2) ?? 'no solid'}${sample.gapM === null ? '' : 'm'}`, point, true);
        const segment = new BufferGeometry().setFromPoints([point, new Vector3(point.x, sample.supportY ?? 0, point.z)]); this.ownedGeometries.push(segment); this.root.add(new LineSegments(segment, material));
      }
      return { id: instance.name, asset: placement.asset, position: anchor.toArray(), scale: instance.scale.toArray(), yawDegrees: placement.yaw, matrixWorld: instance.matrixWorld.toArray(), actualBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, lowestVertex: min.toArray(), terrainAnchorTopY, centerSupportTopY, localFrontWorld: new Vector3(0, 0, 1).transformDirection(instance.matrixWorld).toArray(), boundaryEdgesWelded1e5: edges.filter((e) => e.faces.length === 1).length, nonmanifoldEdgesWelded1e5: edges.filter((e) => e.faces.length > 2).length, undersideSampleCount: samples.length, exposedSampleCount: exposed.length, probes, samples };
    });
    this.report = { coordinates: 'world meters, Y-up; triangle winding normals, actual transformed vertices; bottom-center anchor is bounds-derived, not a guaranteed contact patch', method: 'downward-facing triangle centroids n.y<-0.35, first sample per 0.25m XZ cell; downward first-hit support excluding self; exposed sample excludes terrainAbove/otherAbove (top exceeds sample, not certified containment); water excluded; null support is no solid hit, not gap=0; gaps may be hidden by other overlapping geometry; silhouette is camera-facing adjacency, includes occluded outlines', instances: records };
    scene.add(this.root);
  }
  private marker(position: Vector3, color: number, text: string, labelPosition: Vector3, detail = false): void {
    const geometry = new SphereGeometry(0.055, 8, 6), material = new MeshBasicMaterial({ color, depthTest: false }); this.ownedGeometries.push(geometry); this.ownedMaterials.push(material);
    const marker = new Mesh(geometry, material); marker.position.copy(position); marker.renderOrder = 11; this.root.add(marker);
    const element = document.createElement('span'); element.textContent = text; element.style.borderColor = new Color(color).getStyle(); this.layer.append(element); this.labels.push({ element, position: labelPosition.clone(), detail });
  }
  setVisible(visible: boolean, terrainWire = true): void { this.root.visible = visible; this.layer.hidden = !visible; this.terrainLines.visible = terrainWire; this.showDetails = terrainWire; }
  cameraEvidence(camera: PerspectiveCamera, width: number, height: number): object {
    const visibleMeshes: Mesh[] = [];
    this.scene.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      let parent: Object3D | null = node;
      while (parent) { if (!parent.visible || parent === this.root) return; parent = parent.parent; }
      visibleMeshes.push(node);
    });
    const ray = new Raycaster();
    return this.subjects.map(({ instance, faces }) => {
      const underside = faces.filter((face) => face.normal.y < -0.35), witnesses: object[] = [];
      let tested = 0, visible = 0, visibleBottom = 0;
      const bottomWitnesses: object[] = [];
      // Visibility belongs to the unmodified scene: exclude diagnostic helpers and hidden cutaway nodes.
      const stride = Math.max(1, Math.floor(underside.length / 180));
      for (let i = 0; i < underside.length; i += stride) {
        const face = underside[i]!, projected = face.center.clone().project(camera);
        if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1 || Math.abs(projected.z) > 1 || face.normal.dot(camera.position.clone().sub(face.center)) <= 0) continue;
        tested++;
        const direction = face.center.clone().sub(camera.position).normalize(); ray.set(camera.position, direction); ray.far = camera.far;
        const hit = ray.intersectObjects(visibleMeshes, false)[0];
        if (!hit || hit.point.distanceTo(face.center) > 0.02) continue;
        let parent: Object3D | null = hit.object; while (parent && parent !== instance) parent = parent.parent;
        if (!parent) continue;
        visible++;
        if (face.normal.y < -0.9) {
          visibleBottom++;
          if (bottomWitnesses.length < 6) bottomWitnesses.push({ point: face.center.toArray(), normal: face.normal.toArray(), pixel: [(projected.x + 1) * width / 2, (1 - projected.y) * height / 2], faceIndex: hit.faceIndex });
        }
        if (witnesses.length < 6) witnesses.push({ point: face.center.toArray(), normal: face.normal.toArray(), pixel: [(projected.x + 1) * width / 2, (1 - projected.y) * height / 2], faceIndex: hit.faceIndex });
      }
      return { id: instance.name, cameraDirectionInInstanceLocal: instance.worldToLocal(camera.position.clone()).normalize().toArray(), downwardFacesTested: tested, visibleDownwardFacesSampled: visible, visibleBottomFacesSampled: visibleBottom, bottomWitnesses, witnesses, method: 'sampled actual n.y<-0.35 faces (bottom subset n.y<-0.9); exact scene first-hit test at centroid (0.02m tolerance), then pixel projection; counts are sparse samples, not screen area; +Z local is a geometric axis, no art-facing semantic assumed' };
    });
  }
  reviewMetrics(camera: PerspectiveCamera, width: number, height: number): object {
    const subject = this.subjects.find((s) => s.instance.name === 'front-shoulder')!;
    const meshes: Mesh[] = [];
    this.scene.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      let parent: Object3D | null = node;
      while (parent) { if (!parent.visible || parent === this.root) return; parent = parent.parent; }
      meshes.push(node);
    });
    const projected = subject.faces.flatMap((f) => [f.a, f.b, f.c]).map((v) => v.clone().project(camera));
    const minX = Math.max(0, Math.floor(Math.min(...projected.map((v) => (v.x + 1) * width / 2)))), maxX = Math.min(width, Math.ceil(Math.max(...projected.map((v) => (v.x + 1) * width / 2))));
    const minY = Math.max(0, Math.floor(Math.min(...projected.map((v) => (1 - v.y) * height / 2)))), maxY = Math.min(height, Math.ceil(Math.max(...projected.map((v) => (1 - v.y) * height / 2))));
    const ray = new Raycaster(), uv = new Vector2(), normalMatrix = new Matrix3();
    const step = 6, mask: [number, number][] = [];
    let visibleTiles = 0, downwardTiles = 0, bottomTiles = 0;
    // Same absolute 6px sampling grid for every candidate; first-hit queries include original occluders.
    for (let y = Math.ceil(minY / step) * step + step / 2; y < maxY; y += step) for (let x = Math.ceil(minX / step) * step + step / 2; x < maxX; x += step) {
      uv.set(x / width * 2 - 1, 1 - y / height * 2); ray.setFromCamera(uv, camera);
      const hit = ray.intersectObjects(meshes, false)[0];
      if (!hit?.face) continue;
      let parent: Object3D | null = hit.object; while (parent && parent !== subject.instance) parent = parent.parent;
      if (!parent) continue;
      visibleTiles++;
      const normal = hit.face.normal.clone().applyNormalMatrix(normalMatrix.getNormalMatrix(hit.object.matrixWorld));
      if (normal.y < -0.35) downwardTiles++;
      if (normal.y < -0.9) { bottomTiles++; mask.push([x - step / 2, y - step / 2]); }
    }
    const terrain = this.scene.getObjectByName('Organic_Coastal_Mass')!;
    const cells = new Set<string>(), topSamples: { point: number[]; terrainY: number | null; differenceM: number | null }[] = [];
    for (const face of subject.faces) {
      if (face.normal.y < 0.8) continue;
      const p = face.center, key = `${Math.floor(p.x / 0.25)},${Math.floor(p.z / 0.25)}`;
      if (cells.has(key)) continue; cells.add(key);
      ray.set(new Vector3(p.x, 20, p.z), new Vector3(0, -1, 0));
      const terrainY = ray.intersectObject(terrain, true)[0]?.point.y ?? null;
      topSamples.push({ point: p.toArray(), terrainY, differenceM: terrainY === null ? null : p.y - terrainY });
    }
    return { instance: 'front-shoulder', visiblePixelsEstimate: visibleTiles * step * step, downwardPixelsEstimate: downwardTiles * step * step, bottomPixelsEstimate: bottomTiles * step * step, bottomPercentOfVisible: visibleTiles ? 100 * bottomTiles / visibleTiles : 0, mask, sampleStepPx: step, projectedBounds: { minX, minY, maxX, maxY }, topSamples, topSummary: { count: topSamples.length, outsideTerrain: topSamples.filter((s) => s.terrainY === null).length, buriedMoreThan10cm: topSamples.filter((s) => s.differenceM !== null && s.differenceM < -0.1).length, within10cm: topSamples.filter((s) => s.differenceM !== null && Math.abs(s.differenceM) <= 0.1).length, raisedMoreThan10cm: topSamples.filter((s) => s.differenceM !== null && s.differenceM > 0.1).length }, method: '6x6px grid, actual visible scene first-hit normal classification; bottom nY<-0.9, downward lip nY<-0.35; estimated projected area, not exact raster/GPU mask; top 0.25m grid nY>0.8 samples vs original terrain top; above/below not a solid containment or connectivity certificate' };
  }
  update(camera: PerspectiveCamera, width: number, height: number): void {
    if (!this.root.visible) return;
    const key = camera.matrixWorld.elements.join(',');
    if (key !== this.lastCamera) {
      this.lastCamera = key;
      for (const { edges, line } of this.lines) {
        const points: Vector3[] = [];
        for (const edge of edges) {
          const signs = edge.faces.map((face) => face.normal.dot(camera.position.clone().sub(face.center)) > 0);
          if (signs.length === 1 || (signs.includes(true) && signs.includes(false))) points.push(edge.a, edge.b);
        }
        line.geometry.dispose(); line.geometry = new BufferGeometry().setFromPoints(points);
      }
    }
    const occupied: { x: number; y: number; width: number }[] = [];
    for (const { element, position, detail } of this.labels) {
      const point = position.clone().project(camera);
      element.hidden = (detail && !this.showDetails) || point.z < -1 || point.z > 1 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1;
      if (element.hidden) continue;
      const x = (point.x + 1) * width / 2, labelWidth = element.offsetWidth;
      let y = (1 - point.y) * height / 2;
      while (occupied.some((prev) => Math.abs(prev.x - x) < (prev.width + labelWidth) / 2 + 3 && Math.abs(prev.y - y) < 24)) y -= 24;
      occupied.push({ x, y, width: labelWidth });
      element.style.left = `${x}px`; element.style.top = `${y}px`;
    }
  }
  dispose(): void {
    this.layer.remove(); this.root.removeFromParent(); this.helpers.forEach((h) => h.dispose()); this.lines.forEach(({ line }) => line.geometry.dispose()); this.ownedGeometries.forEach((g) => g.dispose()); this.ownedMaterials.forEach((m) => m.dispose());
  }
}
