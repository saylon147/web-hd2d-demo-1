import { Color, Float32BufferAttribute, Mesh, MeshLambertMaterial, Triangle, Vector3 } from 'three';
import type { BufferGeometry } from 'three';
import type { CliffBlockout } from './cliffBlockout';
import type { CliffBoundaryReport } from './cliffBoundary';

export const STYLIZED_PRESET_URL = `${import.meta.env.BASE_URL}assets/presets/coastal-g03-p0.json`;
export const STYLIZED_VARIANTS = ['neutral', 'stylized', 'tripo'] as const;
export type StylizedVariant = typeof STYLIZED_VARIANTS[number];
interface PaletteRegion { id: string; center: [number, number]; color: string }
export interface StylizedPreset { transitionWidth: number; regions: PaletteRegion[] }
export interface StylizedSummary {
  vertices: number; triangles: number; geometryDisplacementM: number; colorAttributeBytes: number;
  colorSpace: string; material: string; method: string;
  regions: { id: string; color: string; faceCount: number; areaM2: number; connectedComponents: number }[];
}
export function parseStylizedPreset(value: unknown): StylizedPreset {
  if (!value || typeof value !== 'object') throw new Error('Invalid G03-P0 preset');
  const d = value as Record<string, unknown>;
  if (d.schemaVersion !== 1 || d.subjectInstance !== 'front-shoulder' || !Array.isArray(d.regions) || d.regions.length < 4 || d.regions.length > 6 || typeof d.transitionWidth !== 'number' || !Number.isFinite(d.transitionWidth) || d.transitionWidth < 0 || d.transitionWidth > 0.15) throw new Error('G03-P0 requires 4–6 broad palette regions');
  const regions = d.regions.map((raw: unknown): PaletteRegion => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid G03-P0 region');
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== 'string' || !/^[a-z-]+$/.test(r.id) || typeof r.color !== 'string' || !/^#[a-f\d]{6}$/i.test(r.color) || !Array.isArray(r.center) || r.center.length !== 2 || !r.center.every((n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1)) throw new Error('Invalid G03-P0 palette cell');
    return { id: r.id, color: r.color, center: r.center as [number, number] };
  });
  if (new Set(regions.map((r) => r.id)).size !== regions.length || new Set(regions.map((r) => r.center.join(','))).size !== regions.length) throw new Error('Duplicate G03-P0 regions');
  return { transitionWidth: d.transitionWidth, regions };
}

/** Artist-placed low-frequency color cells; A1 positions/normals/indices stay byte-identical. */
export function colorCliffPrototype(source: BufferGeometry, preset: StylizedPreset, boundary: CliffBoundaryReport): { geometry: BufferGeometry; summary: StylizedSummary } {
  const geometry = source.clone(), positions = source.getAttribute('position'), index = source.index;
  if (!index) throw new Error('G03-P0 requires the existing indexed A1 mesh');
  const rim = boundary.curves[0]!.points;
  // Recover the approved profile origin from the two E/W rays rather than create a new coastline.
  const t0 = new Vector3(...rim[0]!), t1 = new Vector3(...rim.at(-1)!), w0 = new Vector3(...boundary.curves[2]!.points[0]!), w1 = new Vector3(...boundary.curves[2]!.points.at(-1)!);
  const d0 = w0.clone().sub(t0).setY(0), d1 = w1.clone().sub(t1).setY(0), cross = d0.x * d1.z - d0.z * d1.x;
  if (Math.abs(cross) < 1e-8) throw new Error('Degenerate G03-P0 approved rays');
  const delta = t1.clone().sub(t0), distance = (delta.x * d1.z - delta.z * d1.x) / cross, origin = t0.clone().addScaledVector(d0, distance).setY(0);
  const a0 = Math.atan2(t0.z - origin.z, t0.x - origin.x), a1 = Math.atan2(t1.z - origin.z, t1.x - origin.x), topY = Math.max(...rim.map((p) => p[1]));
  const coordinate = (point: Vector3): [number, number] => [(Math.atan2(point.z - origin.z, point.x - origin.x) - a0) / (a1 - a0), (point.y - boundary.seaY) / (topY - boundary.seaY)];
  const nearest = (point: Vector3): { id: number; distance: number }[] => {
    const [u, v] = coordinate(point);
    return preset.regions.map((r, id) => ({ id, distance: Math.hypot(u - r.center[0], v - r.center[1]) })).sort((a, b) => a.distance - b.distance);
  };
  // Color(hex) decodes sRGB into Three.js linear working space. Interpolate there.
  const palette = preset.regions.map((r) => new Color(r.color)), colors: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    const cell = nearest(new Vector3().fromBufferAttribute(positions, i)), a = cell[0]!, b = cell[1]!;
    const blend = preset.transitionWidth ? 0.5 * Math.max(0, 1 - (b.distance - a.distance) / preset.transitionWidth) : 0;
    colors.push(...palette[a.id]!.clone().lerp(palette[b.id]!, blend).toArray());
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  const faceIds: number[] = [], area = Array.from({ length: preset.regions.length }, () => 0), edgeFaces = new Map<string, number[]>();
  for (let i = 0; i < index.count; i += 3) {
    const vertexIndices = [0, 1, 2].map((j) => index.getX(i + j)), points = vertexIndices.map((j) => new Vector3().fromBufferAttribute(positions, j)) as [Vector3, Vector3, Vector3];
    const center = points[0].clone().add(points[1]).add(points[2]).multiplyScalar(1 / 3), id = nearest(center)[0]!.id;
    faceIds.push(id); area[id]! += new Triangle(...points).getArea();
    for (let j = 0; j < 3; j++) { const key = [vertexIndices[j]!, vertexIndices[(j + 1) % 3]!].sort((a, b) => a - b).join(','); const faces = edgeFaces.get(key) ?? []; faces.push(i / 3); edgeFaces.set(key, faces); }
  }
  const neighbours = faceIds.map(() => new Set<number>());
  for (const faces of edgeFaces.values()) if (faces.length === 2) { neighbours[faces[0]!]!.add(faces[1]!); neighbours[faces[1]!]!.add(faces[0]!); }
  const regions = preset.regions.map((region, id) => {
    const remaining = new Set(faceIds.flatMap((n, i) => n === id ? [i] : [])); let components = 0;
    while (remaining.size) { components++; const queue = [remaining.values().next().value!]; while (queue.length) { const face = queue.pop()!; if (!remaining.delete(face)) continue; for (const next of neighbours[face]!) if (remaining.has(next)) queue.push(next); } }
    return { id: region.id, color: region.color, faceCount: faceIds.filter((n) => n === id).length, areaM2: area[id]!, connectedComponents: components };
  });
  return { geometry, summary: { vertices: positions.count, triangles: index.count / 3, geometryDisplacementM: 0, colorAttributeBytes: colors.length * 4, colorSpace: 'sRGB hex decoded to Linear-sRGB vertex RGB; narrow transitions mixed in linear space', material: 'built-in MeshLambertMaterial / vertexColors / no textures', method: 'six manually placed nearest palette cells in approved angular/height coordinates; no random face assignments or geometry changes', regions } };
}

export class CoastalStylized {
  readonly summary: StylizedSummary;
  private neutral: Mesh;
  private isolatedNeutral: Mesh;
  private styled: Mesh;
  private isolatedStyled: Mesh;
  private geometry: BufferGeometry;
  private material: MeshLambertMaterial;
  constructor(private blockout: CliffBlockout, preset: StylizedPreset, boundary: CliffBoundaryReport) {
    const neutral = blockout.root.getObjectByName('G03A1CliffSection'), isolated = blockout.diagnosticScene.getObjectByName('G03A1CliffSection');
    if (!(neutral instanceof Mesh) || !(isolated instanceof Mesh)) throw new Error('G03-P0 A1 render mesh missing');
    this.neutral = neutral; this.isolatedNeutral = isolated;
    const colored = colorCliffPrototype(neutral.geometry, preset, boundary); this.geometry = colored.geometry; this.summary = colored.summary;
    this.material = new MeshLambertMaterial({ vertexColors: true, color: '#ffffff' });
    this.styled = new Mesh(this.geometry, this.material); this.styled.name = 'G03P0StylizedPrototype'; this.styled.castShadow = true; this.styled.receiveShadow = true;
    this.isolatedStyled = this.styled.clone(); blockout.root.add(this.styled); blockout.diagnosticScene.add(this.isolatedStyled); this.setVariant('neutral');
  }
  setVariant(variant: StylizedVariant): void {
    this.blockout.setVariant(variant !== 'tripo'); this.neutral.visible = variant !== 'stylized'; this.isolatedNeutral.visible = variant !== 'stylized'; this.styled.visible = variant === 'stylized'; this.isolatedStyled.visible = variant === 'stylized';
  }
  dispose(): void { this.setVariant('neutral'); this.styled.removeFromParent(); this.isolatedStyled.removeFromParent(); this.geometry.dispose(); this.material.dispose(); }
}
