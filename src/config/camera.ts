export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface CameraState {
  target: Point3;
  baseYaw: number;
  yawOffset: number;
  pitch: number;
  distance: number;
  fov: number;
}

export const CAMERA_LIMITS = {
  pitch: { min: 30, max: 55 },
  yawOffset: { min: -45, max: 45 },
  distance: { min: 8, max: 25 },
  targetHorizontal: { min: -3, max: 3 },
  targetHeight: { min: 0, max: 3 },
} as const;

export const CAMERA_DEFAULTS: Readonly<CameraState> = {
  target: Object.freeze({ x: 0, y: 0.8, z: 0 }),
  baseYaw: 35,
  yawOffset: 0,
  pitch: 42,
  distance: 16,
  fov: 35,
};

export const CAMERA_SETTINGS = {
  near: 0.1,
  far: 100,
  damping: 10,
  degreesPerPixel: 0.18,
  wheelSensitivity: 0.0012,
  groundHeight: 0,
  minimumGroundClearance: 0.25,
} as const;

export function createCameraState(): CameraState {
  return { ...CAMERA_DEFAULTS, target: { ...CAMERA_DEFAULTS.target } };
}
