import { AxesHelper, Color, DirectionalLight, GridHelper, HemisphereLight, Mesh, PointLight, Scene } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BLOCKOUT_MANIFEST_URL, parseBlockoutManifest } from '../config/blockout';
import type { BlockoutManifest, ViewMode } from '../config/blockout';
import type { FoundationWorld } from './foundation';
import { disposeObject } from '../core/dispose';

export interface BlockoutWorld extends FoundationWorld {
  manifest: BlockoutManifest;
  setView: (mode: ViewMode) => void;
}

async function response(url: string, signal: AbortSignal): Promise<Response> {
  const result = await fetch(url, { signal });
  if (!result.ok) throw new Error(`资产加载失败（HTTP ${result.status}）：${url}`);
  return result;
}

export async function createBlockoutWorld(signal: AbortSignal): Promise<BlockoutWorld> {
  const manifestResponse = await response(BLOCKOUT_MANIFEST_URL, signal);
  const manifest = parseBlockoutManifest(await manifestResponse.json() as unknown);
  const assetResponse = await response(manifest.modelUrl, signal);
  const asset = await new GLTFLoader().parseAsync(await assetResponse.arrayBuffer(), import.meta.env.BASE_URL);
  try {
    for (const name of manifest.requiredNodes) {
      if (!asset.scene.getObjectByName(name)) throw new Error(`GLB 缺少场景节点：${name}`);
    }
  } catch (error: unknown) {
    disposeObject(asset.scene);
    throw error;
  }
  const scene = new Scene();
  scene.background = new Color('#e3e7e4');
  scene.add(asset.scene);
  asset.scene.traverse((object) => {
    if (object instanceof Mesh) {
      object.castShadow = object.name !== 'Sea_Plane';
      object.receiveShadow = object.name !== 'Sea_Plane';
    }
  });
  const grid = new GridHelper(40, 40, '#9aaa9a', '#b8c8ba');
  grid.position.y = 0.02;
  grid.visible = false;
  const axes = new AxesHelper(2);
  axes.visible = false;
  scene.add(grid, axes, new HemisphereLight('#fffaf0', '#abb8b9', 2.4));
  const sun = new DirectionalLight('#fff7e9', 3);
  sun.position.set(-8, 15, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -18;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 60;
  sun.shadow.normalBias = 0.03;
  const interiorFill = new PointLight('#ffffff', 8, 10, 2);
  interiorFill.position.set(manifest.views.basement.target.x, 4, manifest.views.basement.target.z);
  scene.add(sun, interiorFill);
  const world: BlockoutWorld = {
    scene, grid, axes, manifest,
    updateTarget() { /* M2 checks use explicit camera targets without a floating marker. */ },
    setView(mode) {
      asset.scene.traverse((object) => { object.visible = true; });
      for (const name of manifest.modeHidden[mode]) {
        const node = asset.scene.getObjectByName(name);
        if (node) node.visible = false;
      }
      interiorFill.visible = mode === 'basement';
      asset.scene.userData.viewMode = mode;
    },
    dispose() {
      disposeObject(asset.scene);
      grid.dispose();
      axes.dispose();
      sun.dispose();
      scene.clear();
    },
  };
  world.setView('exterior');
  return world;
}
