import { describe, expect, it } from 'vitest';
import { Matrix4, Vector3 } from 'three';
import { CAMERA_DEFAULTS, createCameraState } from '../../src/config/camera';
import { constrainCameraState, dampingAlpha, orbitPosition, zoomDistance } from '../../src/camera/math';

describe('camera constraints', () => {
  it('creates independent mutable state without changing defaults', () => {
    const first = createCameraState();
    first.target.y = 2;
    first.pitch = 55;
    expect(createCameraState().target.y).toBe(0.8);
    expect(CAMERA_DEFAULTS.pitch).toBe(42);
  });

  it.each([
    { pitch: -90, yaw: -360, distance: -5, expected: [30, -45, 8] },
    { pitch: 180, yaw: 360, distance: 100, expected: [55, 45, 25] },
    { pitch: 42, yaw: 12, distance: 16, expected: [42, 12, 16] },
  ])('constrains orbit values: $pitch / $yaw / $distance', ({ pitch, yaw, distance, expected }) => {
    const state = createCameraState();
    Object.assign(state, { pitch, yawOffset: yaw, distance });
    constrainCameraState(state);
    expect([state.pitch, state.yawOffset, state.distance]).toEqual(expected);
  });

  it('recovers from non-finite inputs and keeps fixed projection/base direction', () => {
    const state = createCameraState();
    Object.assign(state, { pitch: NaN, yawOffset: Infinity, distance: -Infinity, fov: 120, baseYaw: -200 });
    Object.assign(state.target, { x: NaN, y: -20, z: 100 });
    constrainCameraState(state);
    expect([state.pitch, state.yawOffset, state.distance, state.fov, state.baseYaw]).toEqual([42, 0, 16, 35, 35]);
    expect(state.target).toEqual({ x: 0, y: 0, z: 3 });
  });

  for (const pitch of [30, 55]) {
    for (const yawOffset of [-45, 45]) {
      for (const distance of [8, 25]) {
        it(`maintains ground clearance and orbital distance at ${pitch}° / ${yawOffset}° / ${distance}m`, () => {
          const state = createCameraState();
          Object.assign(state, { pitch, yawOffset, distance });
          state.target.y = 0;
          const position = orbitPosition(state);
          expect(position.y).toBeGreaterThanOrEqual(4 - 1e-10);
          expect(Math.hypot(position.x, position.y, position.z)).toBeCloseTo(distance, 10);
          expect(Math.atan2(position.y, Math.hypot(position.x, position.z)) * 180 / Math.PI).toBeCloseTo(pitch, 10);
          expect(Math.atan2(position.x, position.z) * 180 / Math.PI).toBeCloseTo(35 + yawOffset, 10);
        });
      }
    }
  }

  it('adds target position to the orbit, with +Y up', () => {
    const state = createCameraState();
    const origin = orbitPosition(state);
    state.target.x += 2;
    state.target.y += 1;
    state.target.z -= 3;
    const moved = orbitPosition(state);
    expect(moved.x - origin.x).toBeCloseTo(2);
    expect(moved.y - origin.y).toBeCloseTo(1);
    expect(moved.z - origin.z).toBeCloseTo(-3);
  });
});

describe('Blender Z-up to runtime Y-up basis contract', () => {
  it.each([
    { source: [1, 0, 0], runtime: [1, 0, 0] },
    { source: [0, 1, 0], runtime: [0, 0, -1] },
    { source: [0, 0, 1], runtime: [0, 1, 0] },
  ])('maps $source to $runtime under -90° X rotation', ({ source, runtime }) => {
    const vector = new Vector3().fromArray(source).applyMatrix4(new Matrix4().makeRotationX(-Math.PI / 2));
    vector.toArray().forEach((value, index) => expect(value).toBeCloseTo(runtime[index] ?? 0, 10));
  });
});

describe('frame-independent damping and zoom', () => {
  it('converges equally after one second at 30, 60, and 144 Hz', () => {
    const converge = (hz: number): number => {
      let value = 8;
      for (let frame = 0; frame < hz; frame++) value += (25 - value) * dampingAlpha(1 / hz);
      return value;
    };
    expect(converge(30)).toBeCloseTo(converge(144), 10);
    expect(converge(60)).toBeCloseTo(converge(144), 10);
  });

  it('does not overshoot after a long frame or advance on a negative delta', () => {
    expect(dampingAlpha(10)).toBeLessThanOrEqual(1);
    expect(dampingAlpha(-1)).toBe(0);
  });

  it('zooms in the expected direction and clamps extreme wheel input', () => {
    expect(zoomDistance(16, 100)).toBeGreaterThan(16);
    expect(zoomDistance(16, -100)).toBeLessThan(16);
    expect(zoomDistance(16, 1_000_000)).toBe(25);
    expect(zoomDistance(16, -1_000_000)).toBe(8);
    expect(zoomDistance(16, NaN)).toBe(16);
  });
});
