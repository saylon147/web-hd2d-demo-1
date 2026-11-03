import { Box3, Group, Mesh, MeshStandardMaterial, NoColorSpace, SRGBColorSpace, Texture, Vector3 } from 'three';
import type { Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { CottageManifest } from '../config/cottageCandidate';
import { disposeObject } from '../core/dispose';

/** Each GLTF parse owns its decoded images; shared ORM sources are closed once. */
export function disposeCottageCandidate(root: Object3D): void {
  const images = new Set<ImageBitmap>();
  root.traverse((item) => {
    if (!(item instanceof Mesh)) return;
    for (const material of Array.isArray(item.material) ? item.material : [item.material]) {
      for (const value of Object.values(material as unknown as Record<string, unknown>)) {
        if (value instanceof Texture && typeof ImageBitmap !== 'undefined' && value.source.data instanceof ImageBitmap) images.add(value.source.data);
      }
    }
  });
  disposeObject(root); images.forEach((image) => image.close());
}

function textureInfo(texture: Texture): { name: string; width: number; height: number; colorSpace: string } {
  const data: unknown = texture.source.data;
  if (!data || typeof data !== 'object' || !('width' in data) || !('height' in data) || typeof data.width !== 'number' || typeof data.height !== 'number') throw new Error('Cottage texture was not decoded');
  return { name: texture.name, width: data.width, height: data.height, colorSpace: texture.colorSpace };
}
export async function loadCottageCandidate(manifest: CottageManifest, signal: AbortSignal) {
  const response = await fetch(manifest.modelUrl, { signal });
  if (!response.ok) throw new Error(`小屋本地原文件不可用（HTTP ${response.status}）：${manifest.sourceFile}。放回约定路径后重新加载。`);
  const bytes = await response.arrayBuffer();
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
  signal.throwIfAborted();
  if (hash !== manifest.sha256 || bytes.byteLength !== manifest.fileBytes) throw new Error('小屋源文件与检查记录不一致。请先重新运行 npm run cottage:inspect。');
  const source = (await new GLTFLoader().parseAsync(bytes, import.meta.env.BASE_URL)).scene;
  try {
    signal.throwIfAborted();
    source.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(source, true);
    for (const [actual, expected] of [[bounds.min.toArray(), manifest.spatial.aabb.min], [bounds.max.toArray(), manifest.spatial.aabb.max]]) {
      if (actual!.some((v, i) => Math.abs(v - expected![i]!) > 0.000001)) throw new Error('Cottage runtime/source AABB mismatch');
    }
    let meshes = 0, vertices = 0, triangles = 0;
    const materials = new Set<MeshStandardMaterial>();
    source.traverse((item) => {
      if (!(item instanceof Mesh)) return;
      meshes++; vertices += item.geometry.getAttribute('position').count;
      triangles += (item.geometry.index?.count ?? item.geometry.getAttribute('position').count) / 3;
      if (!item.geometry.getAttribute('normal') || !item.geometry.getAttribute('uv')) throw new Error('Cottage normals/UV missing');
      item.castShadow = true; item.receiveShadow = true;
      for (const material of Array.isArray(item.material) ? item.material : [item.material]) {
        if (!(material instanceof MeshStandardMaterial) || !material.map || !material.normalMap || !material.roughnessMap || !material.metalnessMap) throw new Error('Cottage PBR texture binding missing');
        if (material.map.colorSpace !== SRGBColorSpace || [material.normalMap, material.roughnessMap, material.metalnessMap].some((t) => t.colorSpace !== NoColorSpace)) throw new Error('Cottage texture color space mismatch');
        materials.add(material);
      }
    });
    if (meshes !== manifest.meshCount || vertices !== manifest.vertexCount || triangles !== manifest.triangleCount || materials.size !== manifest.materialCount) throw new Error('Cottage runtime/source mesh statistics mismatch');
    const audit = {
      hash, fileBytes: bytes.byteLength, meshes, vertices, triangles,
      bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
      materials: [...materials].map((m) => ({ name: m.name, type: m.type, side: m.side, baseColor: textureInfo(m.map!), normal: textureInfo(m.normalMap!), roughness: textureInfo(m.roughnessMap!), metalness: textureInfo(m.metalnessMap!), sharedOrm: m.roughnessMap!.source === m.metalnessMap!.source })),
      sourceTransform: { position: source.position.toArray(), quaternion: source.quaternion.toArray(), scale: source.scale.toArray() },
    };
    for (const m of audit.materials) for (const t of [m.baseColor, m.normal, m.roughness, m.metalness]) {
      if (!manifest.images.some((i) => i.name === t.name && i.dimensions[0] === t.width && i.dimensions[1] === t.height)) throw new Error('Cottage decoded texture/manifest mismatch');
    }
    // Separate display groups: authored transforms and geometry remain intact.
    const root = new Group(), centered = new Group(), center = bounds.getCenter(new Vector3());
    root.name = 'CottageCandidate01Inspection'; centered.name = 'DisplayBottomCenter';
    centered.position.set(-center.x, -bounds.min.y, -center.z); centered.add(source); root.add(centered);
    return { root, audit, size: bounds.getSize(new Vector3()) };
  } catch (error: unknown) { disposeCottageCandidate(source); throw error; }
}
