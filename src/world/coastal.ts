import { Box3, Group, Mesh, MeshStandardMaterial, NoColorSpace, SRGBColorSpace, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { CoastalAsset, CoastalLod, CoastalManifest, CoastalPlacement } from '../config/coastal';
import { disposeObject } from '../core/dispose';

export interface CoastalLoaded { root: Group; transferBytes: number; fetchMs: number; parseMs: number; textureEstimateBytes: number; triangles: number; assetIds: string[] }
async function load(asset: CoastalAsset, lod: CoastalLod, signal: AbortSignal): Promise<CoastalLoaded> {
  const variant = asset.variants.find((item) => item.id === lod)!;
  const start = performance.now(), response = await fetch(variant.modelUrl, { signal });
  if (!response.ok) throw new Error(`${asset.id} 本地 GLB 缺失（HTTP ${response.status}）。运行 npm run coastal:pipeline 或 npm run coastal:optimize -- --asset ${asset.id}。`);
  const bytes = await response.arrayBuffer(), fetched = performance.now();
  const root = (await new GLTFLoader().parseAsync(bytes, import.meta.env.BASE_URL)).scene;
  const parsed = performance.now();
  try {
    signal.throwIfAborted();
    const bounds = new Box3().setFromObject(root), size = bounds.getSize(new Vector3()), center = bounds.getCenter(new Vector3());
    if (size.toArray().some((n, axis) => !Number.isFinite(n) || Math.abs(n - variant.dimensions[axis]!) > 0.03) || Math.abs(bounds.min.y) > 0.02 || Math.abs(center.x) > 0.02 || Math.abs(center.z) > 0.02) throw new Error(`${asset.id} scale/axis/pivot mismatch`);
    let triangles = 0;
    root.traverse((item) => {
      if (!(item instanceof Mesh)) return;
      triangles += (item.geometry.index?.count ?? item.geometry.getAttribute('position').count) / 3;
      if (!item.geometry.getAttribute('normal') || !item.geometry.getAttribute('uv')) throw new Error(`${asset.id} UV/normal missing`);
      item.castShadow = true; item.receiveShadow = true;
      for (const material of Array.isArray(item.material) ? item.material : [item.material]) {
        if (!(material instanceof MeshStandardMaterial) || !material.map || !material.normalMap || !material.roughnessMap || !material.metalnessMap || material.map.colorSpace !== SRGBColorSpace || material.normalMap.colorSpace !== NoColorSpace || material.roughnessMap.colorSpace !== NoColorSpace || material.metalnessMap.colorSpace !== NoColorSpace) throw new Error(`${asset.id} PBR binding/color space mismatch`);
      }
    });
    if (!triangles || triangles !== variant.triangleCount || bytes.byteLength !== variant.fileBytes) throw new Error(`${asset.id} geometry/transfer mismatch`);
    return { root, transferBytes: bytes.byteLength, fetchMs: fetched - start, parseMs: parsed - fetched, textureEstimateBytes: variant.gpuTextureRgbaMipEstimateBytes, triangles, assetIds: [asset.id] };
  } catch (error: unknown) { disposeObject(root); throw error; }
}
export async function loadCoastalModules(manifest: CoastalManifest, placements: CoastalPlacement[], lod: CoastalLod, signal: AbortSignal): Promise<CoastalLoaded> {
  const root = new Group(), templates = new Map<string, CoastalLoaded>();
  root.name = 'CoastalAssembly';
  let transferBytes = 0, fetchMs = 0, parseMs = 0, textureEstimateBytes = 0, triangles = 0;
  try {
    for (const placement of placements) {
      let loaded = templates.get(placement.asset);
      if (!loaded) {
        loaded = await load(manifest.assets.find((asset) => asset.id === placement.asset)!, lod, signal);
        templates.set(placement.asset, loaded);
        transferBytes += loaded.transferBytes; fetchMs += loaded.fetchMs; parseMs += loaded.parseMs; textureEstimateBytes += loaded.textureEstimateBytes;
      }
      const instance = loaded.root.clone(true);
      instance.name = placement.id; instance.position.set(...placement.position); instance.scale.set(...placement.scale); instance.rotation.y = placement.yaw * Math.PI / 180;
      instance.traverse((item) => {
        if (!(item instanceof Mesh)) return;
        const tint = (material: MeshStandardMaterial): MeshStandardMaterial => { const clone = material.clone(); clone.color.r *= placement.tint[0]; clone.color.g *= placement.tint[1]; clone.color.b *= placement.tint[2]; return clone; };
        item.material = Array.isArray(item.material) ? item.material.map((material) => tint(material as MeshStandardMaterial)) : tint(item.material as MeshStandardMaterial);
      });
      root.add(instance); triangles += loaded.triangles;
    }
    signal.throwIfAborted();
    // Clones share geometry/textures; dispose their shared resources together once.
    for (const loaded of templates.values()) loaded.root.traverse((item) => {
      if (item instanceof Mesh) for (const material of Array.isArray(item.material) ? item.material : [item.material]) material.dispose();
    });
    return { root, transferBytes, fetchMs, parseMs, textureEstimateBytes, triangles, assetIds: [...templates.keys()] };
  } catch (error: unknown) {
    for (const loaded of templates.values()) root.add(loaded.root);
    disposeObject(root);
    throw error;
  }
}
