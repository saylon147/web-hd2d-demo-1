import { CircleGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, NearestFilter,
  PlaneGeometry, SRGBColorSpace, TextureLoader } from 'three';
import type { PerspectiveCamera } from 'three';
import type GUI from 'lil-gui';
import { facing, RoadWalk } from './roadWalk';

interface Frame { x: number; y: number; w: number; h: number }
interface Atlas {
  image: string;
  size: [number, number];
  anchorPx: [number, number];
  visibleHeightPx: number;
  stepFrameMeters: number;
  directions: Record<ReturnType<typeof facing>, {walk: Frame[]; idle: Frame[]}>;
}

export async function createGardener(signal: AbortSignal) {
  const directory = import.meta.env.BASE_URL + 'assets/sprites/';
  const response = await fetch(directory + 'gardener.json', { signal });
  if (!response.ok) throw new Error('园丁帧数据加载失败');
  const atlas: Atlas = await response.json();
  const map = await new TextureLoader().loadAsync(directory + atlas.image);
  map.colorSpace = SRGBColorSpace;
  map.minFilter = map.magFilter = NearestFilter;
  map.generateMipmaps = false;
  const unit = 1.72 / atlas.visibleHeightPx;
  const cell = atlas.directions.front.walk[0]!;
  const plane = new PlaneGeometry(cell.w * unit, cell.h * unit);
  plane.translate((cell.w / 2 - atlas.anchorPx[0]) * unit, (atlas.anchorPx[1] - cell.h / 2) * unit, 0);
  const figure = new Mesh(plane, new MeshLambertMaterial({ map, alphaTest: 0.5 }));
  figure.receiveShadow = true;
  const shadow = new Mesh(new CircleGeometry(1, 24), new MeshBasicMaterial({
    color: 0x3a3024, opacity: 0.28, transparent: true, depthWrite: false,
  }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.scale.set(0.29, 0.18, 1);
  const group = new Group();
  group.add(figure, shadow);
  const walk = new RoadWalk();
  const query = new URLSearchParams(location.search);
  const settings = { visible: query.get('actor') !== '0', running: query.get('walk') !== '0', speed: 1 };
  const seek = Math.min(60, Math.max(0, Number(query.get('walkTime')) || 0));
  walk.advance(seek, settings.speed);
  return {
    group,
    controls(gui: GUI) {
      const folder = gui.addFolder('庭院园丁');
      folder.add(settings, 'visible').name('显示角色');
      folder.add(settings, 'running').name('自动行走');
      folder.add(settings, 'speed', 0.5, 2, 0.1).name('速度（米/秒）');
    },
    update(delta: number, camera: PerspectiveCamera) {
      if (settings.running) walk.advance(delta, settings.speed);
      const p = walk.sample();
      group.position.set(p.x, 0.101, p.z);
      group.visible = settings.visible;
      const viewX = camera.position.x - p.x, viewZ = camera.position.z - p.z;
      figure.rotation.y = Math.atan2(viewX, viewZ);
      const dir = facing(p.dx, p.dz, viewX, viewZ);
      const action = walk.rest > 0 ? 'idle' : 'walk';
      const frames = atlas.directions[dir][action];
      const index = Math.floor(walk.distance / atlas.stepFrameMeters) % frames.length;
      const frame = frames[index]!;
      map.repeat.set(frame.w / atlas.size[0], frame.h / atlas.size[1]);
      map.offset.set(frame.x / atlas.size[0], 1 - (frame.y + frame.h) / atlas.size[1]);
      return [p.x.toFixed(3), p.z.toFixed(3), dir, action, index, settings.visible].join(',');
    },
  };
}
