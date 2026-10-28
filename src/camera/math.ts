import {
  CAMERA_DEFAULTS,
  CAMERA_LIMITS,
  CAMERA_SETTINGS,
} from '../config/camera';
import type { CameraState, Point3 } from '../config/camera';

export function clampFinite(value: number, min: number, max: number, fallback: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : fallback));
}

// Mutate the canonical state in place so GUI bindings always point to the same objects.
export function constrainCameraState(state: CameraState): void {
  state.pitch = clampFinite(state.pitch, CAMERA_LIMITS.pitch.min, CAMERA_LIMITS.pitch.max, CAMERA_DEFAULTS.pitch);
  state.yawOffset = clampFinite(state.yawOffset, CAMERA_LIMITS.yawOffset.min, CAMERA_LIMITS.yawOffset.max, CAMERA_DEFAULTS.yawOffset);
  state.distance = clampFinite(state.distance, CAMERA_LIMITS.distance.min, CAMERA_LIMITS.distance.max, CAMERA_DEFAULTS.distance);
  state.baseYaw = CAMERA_DEFAULTS.baseYaw;
  state.fov = CAMERA_DEFAULTS.fov;
  for (const key of ['x', 'z'] as const) {
    state.target[key] = clampFinite(state.target[key], CAMERA_LIMITS.targetHorizontal.min, CAMERA_LIMITS.targetHorizontal.max, CAMERA_DEFAULTS.target[key]);
  }
  state.target.y = clampFinite(state.target.y, CAMERA_LIMITS.targetHeight.min, CAMERA_LIMITS.targetHeight.max, CAMERA_DEFAULTS.target.y);
}

export function orbitPosition(state: Readonly<CameraState>): Point3 {
  const yaw = (state.baseYaw + state.yawOffset) * Math.PI / 180;
  const pitch = state.pitch * Math.PI / 180;
  const horizontalDistance = state.distance * Math.cos(pitch);
  return {
    x: state.target.x + horizontalDistance * Math.sin(yaw),
    y: Math.max(
      CAMERA_SETTINGS.groundHeight + CAMERA_SETTINGS.minimumGroundClearance,
      state.target.y + state.distance * Math.sin(pitch),
    ),
    z: state.target.z + horizontalDistance * Math.cos(yaw),
  };
}

export function dampingAlpha(deltaSeconds: number, rate = CAMERA_SETTINGS.damping): number {
  return -Math.expm1(-rate * Math.max(0, deltaSeconds));
}

export function zoomDistance(distance: number, wheelPixels: number): number {
  // Limit one event's exponential to avoid overflow on unusual input devices.
  const exponent = Math.max(-4, Math.min(4, wheelPixels * CAMERA_SETTINGS.wheelSensitivity));
  return clampFinite(distance * Math.exp(exponent), CAMERA_LIMITS.distance.min, CAMERA_LIMITS.distance.max, CAMERA_DEFAULTS.distance);
}
