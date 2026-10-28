import {
  AxesHelper,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  GridHelper,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  RingGeometry,
  Scene,
  SphereGeometry,
} from 'three';
import type { BufferGeometry } from 'three';
import type { Point3 } from '../config/camera';

export interface FoundationWorld {
  scene: Scene;
  grid: GridHelper;
  axes: AxesHelper;
  updateTarget: (target: Point3) => void;
  dispose: () => void;
}

// All objects in M1 are procedural calibration placeholders, not approved art assets.
export function createFoundationWorld(): FoundationWorld {
  const scene = new Scene();
  scene.background = new Color('#e9ece5');
  const root = new Group();
  scene.add(root);
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<MeshStandardMaterial>();

  function primitive(geometry: BufferGeometry, color: string, x: number, y: number, z: number): Mesh {
    const material = new MeshStandardMaterial({ color, roughness: 0.86, metalness: 0 });
    geometries.add(geometry);
    materials.add(material);
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  }

  const ground = primitive(new BoxGeometry(20, 0.3, 20), '#dfe3d6', 0, -0.15, 0);
  ground.castShadow = false;
  primitive(new BoxGeometry(2.2, 2.7, 2.2), '#bc6937', -1.8, 1.35, -1.5);
  primitive(new SphereGeometry(1.05, 48, 32), '#638f79', 2, 1.05, -0.7);
  primitive(new CylinderGeometry(0.68, 0.68, 1.9, 48), '#b7af98', -2.25, 0.95, 1.6);
  for (let index = 0; index < 4; index++) {
    const height = 0.22 * (4 - index);
    primitive(new BoxGeometry(1.7, height, 0.65), '#e9dec4', 1.3, height / 2, 0.7 + index * 0.65);
  }

  const grid = new GridHelper(20, 20, '#a5af9b', '#bcc4b1');
  grid.position.y = 0.012;
  grid.material.transparent = true;
  grid.material.opacity = 0.32;
  root.add(grid);

  const axes = new AxesHelper(1.4);
  axes.position.set(-4, 0.035, 3.5);
  root.add(axes);

  const target = primitive(new SphereGeometry(0.09, 20, 12), '#d5a33e', 0, 0.8, 0);
  const ring = primitive(new RingGeometry(0.24, 0.28, 48), '#d5a33e', 0, 0.028, 0);
  ring.rotation.x = -Math.PI / 2;
  ring.castShadow = false;

  scene.add(new HemisphereLight('#fff9e8', '#a3ad9b', 2.3));
  const sun = new DirectionalLight('#fff3d9', 3.3);
  sun.position.set(-3, 9, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -8;
  sun.shadow.camera.right = 8;
  sun.shadow.camera.top = 8;
  sun.shadow.camera.bottom = -8;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 30;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);

  return {
    scene, grid, axes,
    updateTarget(point) {
      target.position.set(point.x, point.y, point.z);
      ring.position.set(point.x, 0.028, point.z);
    },
    dispose() {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      grid.dispose();
      axes.dispose();
      sun.dispose();
      scene.clear();
    },
  };
}
