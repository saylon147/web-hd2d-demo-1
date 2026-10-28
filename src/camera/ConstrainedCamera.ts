import { PerspectiveCamera } from 'three';
import { CAMERA_SETTINGS, FOUNDATION_CAMERA_PROFILE, createCameraState } from '../config/camera';
import type { CameraProfile, CameraState } from '../config/camera';
import { constrainCameraState, dampingAlpha, orbitPosition, zoomDistance } from './math';

interface PointerPosition { x: number; y: number }

export class ConstrainedCamera {
  readonly camera = new PerspectiveCamera(35, 1, CAMERA_SETTINGS.near, CAMERA_SETTINGS.far);
  readonly state: CameraState;
  private readonly rendered: CameraState;
  private resetState: Readonly<CameraState>;
  private readonly pointers = new Map<number, PointerPosition>();
  private readonly events = new AbortController();

  constructor(private readonly canvas: HTMLCanvasElement, readonly profile: CameraProfile = FOUNDATION_CAMERA_PROFILE) {
    this.state = createCameraState(profile.defaults);
    this.rendered = createCameraState(profile.defaults);
    this.resetState = createCameraState(profile.defaults);
    const options = { signal: this.events.signal };
    canvas.addEventListener('pointerdown', this.onPointerDown, options);
    canvas.addEventListener('pointermove', this.onPointerMove, options);
    canvas.addEventListener('pointerup', this.onPointerEnd, options);
    canvas.addEventListener('pointercancel', this.onPointerEnd, options);
    canvas.addEventListener('lostpointercapture', this.onPointerEnd, options);
    canvas.addEventListener('wheel', this.onWheel, { ...options, passive: false });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault(), options);
    window.addEventListener('blur', this.cancelGesture, options);
    document.addEventListener('visibilitychange', this.cancelGesture, options);
    this.reset();
  }

  reset(): void {
    this.cancelGesture();
    const defaults = createCameraState(this.resetState);
    Object.assign(this.state.target, defaults.target);
    Object.assign(this.state, { ...defaults, target: this.state.target });
    Object.assign(this.rendered.target, defaults.target);
    Object.assign(this.rendered, { ...defaults, target: this.rendered.target });
    this.applyCamera();
  }

  setPreset(preset: Readonly<CameraState>): void {
    const defaults = createCameraState(preset);
    constrainCameraState(defaults, this.profile);
    this.resetState = defaults;
    this.reset();
  }

  resize(width: number, height: number): void {
    this.camera.aspect = Math.max(1, width) / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  update(deltaSeconds: number): void {
    constrainCameraState(this.state, this.profile);
    const alpha = dampingAlpha(deltaSeconds);
    for (const key of ['yawOffset', 'pitch', 'distance'] as const) {
      this.rendered[key] += (this.state[key] - this.rendered[key]) * alpha;
    }
    for (const key of ['x', 'y', 'z'] as const) {
      this.rendered.target[key] += (this.state.target[key] - this.rendered.target[key]) * alpha;
    }
    this.rendered.baseYaw = this.state.baseYaw;
    this.rendered.fov = this.state.fov;
    this.applyCamera();
  }

  dispose(): void {
    this.events.abort();
    this.cancelGesture();
  }

  private applyCamera(): void {
    const position = orbitPosition(this.rendered);
    this.camera.position.set(position.x, position.y, position.z);
    const target = this.rendered.target;
    this.camera.lookAt(target.x, target.y, target.z);
    this.camera.updateMatrixWorld();
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.pointerType !== 'mouse' && this.pointers.size >= 2) return;
    this.canvas.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.canvas.classList.add('is-dragging');
    // CSS touch-action:none owns native touch gestures on the canvas.
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;
    const next = { x: event.clientX, y: event.clientY };
    if (this.pointers.size === 1) {
      this.state.yawOffset -= (next.x - previous.x) * CAMERA_SETTINGS.degreesPerPixel;
      this.state.pitch += (next.y - previous.y) * CAMERA_SETTINGS.degreesPerPixel;
    } else {
      const other = [...this.pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
      if (other) {
        const oldSpan = Math.hypot(previous.x - other.x, previous.y - other.y);
        const newSpan = Math.hypot(next.x - other.x, next.y - other.y);
        if (oldSpan > 4 && newSpan > 4) this.state.distance *= oldSpan / newSpan;
      }
    }
    this.pointers.set(event.pointerId, next);
    constrainCameraState(this.state, this.profile);
  };

  private readonly onPointerEnd = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    if (this.pointers.size === 0) this.canvas.classList.remove('is-dragging');
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? this.canvas.clientHeight : 1;
    this.state.distance = zoomDistance(this.state.distance, event.deltaY * unit, this.profile);
  };

  private readonly cancelGesture = (): void => {
    const ids = [...this.pointers.keys()];
    this.pointers.clear();
    for (const id of ids) {
      if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
    }
    this.canvas.classList.remove('is-dragging');
  };
}
