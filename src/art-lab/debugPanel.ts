import GUI from 'lil-gui';
import { CAMERA_LIMITS } from '../config/camera';
import type { ConstrainedCamera } from '../camera/ConstrainedCamera';
import type { FoundationWorld } from '../world/foundation';

export function createDebugPanel(container: HTMLElement, orbit: ConstrainedCamera, world: FoundationWorld): GUI {
  const gui = new GUI({ container, title: '相机参数', width: 264 });
  const state = orbit.state;
  gui.add(state, 'yawOffset', CAMERA_LIMITS.yawOffset.min, CAMERA_LIMITS.yawOffset.max, 0.1).name('水平偏转 °').listen();
  gui.add(state, 'pitch', CAMERA_LIMITS.pitch.min, CAMERA_LIMITS.pitch.max, 0.1).name('俯角 °').listen();
  gui.add(state, 'distance', CAMERA_LIMITS.distance.min, CAMERA_LIMITS.distance.max, 0.01).name('距离 m').listen();
  gui.add(state, 'fov').name('垂直 FOV °').disable();
  gui.add(state, 'baseYaw').name('基准方位 °').disable();

  const target = gui.addFolder('观察目标 / 世界坐标');
  target.add(state.target, 'x', -3, 3, 0.1).name('X · 右').listen();
  target.add(state.target, 'y', 0, 3, 0.1).name('Y · 上').listen();
  target.add(state.target, 'z', -3, 3, 0.1).name('Z · 后').listen();
  target.close();

  const helpers = gui.addFolder('场景辅助');
  helpers.add(world.grid, 'visible').name('地面网格');
  helpers.add(world.axes, 'visible').name('坐标轴');
  helpers.close();
  gui.add({ reset: () => orbit.reset() }, 'reset').name('恢复默认视角');
  return gui;
}
