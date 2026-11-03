export type Triple = [number, number, number];
export interface CottagePreset {
  manifestUrl: string;
  fov: number;
  frontYawDegrees: number;
  viewPadding: number;
  backgrounds: { neutral: string; warm: string };
}
export interface CottageManifest {
  sourceFile: string;
  modelUrl: string;
  sha256: string;
  fileBytes: number;
  nodeCount: number;
  meshCount: number;
  vertexCount: number;
  triangleCount: number;
  materialCount: number;
  images: { name: string; dimensions: [number, number] }[];
  spatial: { aabb: { min: Triple; max: Triple }; dimensions: Triple; center: Triple };
  lighting: { hemisphere: number; sun: number; exposure: number; sunPosition: Triple };
}
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid cottage configuration object');
  return value as Record<string, unknown>;
};
const number = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid cottage configuration number');
  return value;
};
const string = (value: unknown): string => {
  if (typeof value !== 'string' || !value.length) throw new Error('Invalid cottage configuration string');
  return value;
};
const triple = (value: unknown): Triple => {
  if (!Array.isArray(value) || value.length !== 3) throw new Error('Invalid cottage vector');
  return [number(value[0]), number(value[1]), number(value[2])];
};
export function parseCottagePreset(value: unknown): CottagePreset {
  const p = record(value), b = record(p.backgrounds);
  const preset = { manifestUrl: string(p.manifestUrl), fov: number(p.fov), frontYawDegrees: number(p.frontYawDegrees), viewPadding: number(p.viewPadding), backgrounds: { neutral: string(b.neutral), warm: string(b.warm) } };
  if (preset.manifestUrl !== '/assets/manifests/cottage-candidate-01.json' || preset.fov < 10 || preset.fov > 90 || preset.viewPadding < 1 || preset.viewPadding > 3) throw new Error('Invalid cottage preset range/path');
  return preset;
}
export function parseCottageManifest(value: unknown): CottageManifest {
  const m = record(value), s = record(m.spatial), a = record(s.aabb), l = record(m.lighting);
  if (!Array.isArray(m.images)) throw new Error('Missing cottage image metadata');
  const manifest: CottageManifest = {
    sourceFile: string(m.sourceFile), modelUrl: string(m.modelUrl), sha256: string(m.sha256),
    fileBytes: number(m.fileBytes), nodeCount: number(m.nodeCount), meshCount: number(m.meshCount), vertexCount: number(m.vertexCount), triangleCount: number(m.triangleCount), materialCount: number(m.materialCount),
    images: m.images.map((value: unknown) => {
      const image = record(value), d = image.dimensions;
      if (!Array.isArray(d) || d.length !== 2) throw new Error('Invalid cottage image dimensions');
      return { name: string(image.name), dimensions: [number(d[0]), number(d[1])] };
    }),
    spatial: { aabb: { min: triple(a.min), max: triple(a.max) }, dimensions: triple(s.dimensions), center: triple(s.center) },
    lighting: { hemisphere: number(l.hemisphere), sun: number(l.sun), exposure: number(l.exposure), sunPosition: triple(l.sunPosition) },
  };
  if (manifest.modelUrl !== '/__local-assets/cottage-candidate-01.glb' || !/^[a-f0-9]{64}$/.test(manifest.sha256)) throw new Error('Invalid cottage asset alias/hash');
  for (const count of [manifest.fileBytes, manifest.nodeCount, manifest.meshCount, manifest.vertexCount, manifest.triangleCount, manifest.materialCount]) if (!Number.isSafeInteger(count) || count <= 0) throw new Error('Invalid cottage asset count');
  for (let i = 0; i < 3; i++) if (manifest.spatial.aabb.max[i]! <= manifest.spatial.aabb.min[i]!) throw new Error('Invalid cottage bounds');
  return manifest;
}
