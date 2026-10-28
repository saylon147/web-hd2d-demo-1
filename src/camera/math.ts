import {
  FOUNDATION_CAMERA_PROFILE,
  CAMERA_SETTINGS,
} from '../config/camera';
import type { CameraProfile, CameraState, Point3 } from '../config/camera';

export function clampFinite(value: number, min: number, max: number, fallback: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : fallback));
}

// Mutate the canonical state in place so GUI bindings always point to the same objects.
export function constrainCameraState(state: CameraState, profile: CameraProfile = FOUNDATION_CAMERA_PROFILE): void {
  const { limits, defaults } = profile;
  state.pitch = clampFinite(state.pitch, limits.pitch.min, limits.pitch.max, defaults.pitch);
  state.yawOffset = clampFinite(state.yawOffset, limits.yawOffset.min, limits.yawOffset.max, defaults.yawOffset);
  state.distance = clampFinite(state.distance, limits.distance.min, limits.distance.max, defaults.distance);
  state.baseYaw = defaults.baseYaw;
  state.fov = defaults.fov;
  for (const key of ['x', 'z'] as const) {
    state.target[key] = clampFinite(state.target[key], limits.targetHorizontal.min, limits.targetHorizontal.max, defaults.target[key]);
  }
  state.target.y = clampFinite(state.target.y, limits.targetHeight.min, limits.targetHeight.max, defaults.target.y);
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

export function zoomDistance(distance: number, wheelPixels: number, profile: CameraProfile = FOUNDATION_CAMERA_PROFILE): number {
  // Limit one event's exponential to avoid overflow on unusual input devices.
  const exponent = Math.max(-4, Math.min(4, wheelPixels * CAMERA_SETTINGS.wheelSensitivity));
  return clampFinite(distance * Math.exp(exponent), profile.limits.distance.min, profile.limits.distance.max, profile.defaults.distance);
}
