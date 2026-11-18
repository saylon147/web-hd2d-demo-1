import { expect, test } from 'vitest';
import { facing, RoadWalk, roadLength } from '../../src/character/roadWalk';

test('waits at both ends and retraces the paved route', () => {
  const walk = new RoadWalk();
  walk.advance(0.5 + roadLength, 1);
  const end = walk.sample();
  expect(walk.distance).toBeCloseTo(roadLength);
  walk.advance(0.4, 1);
  expect(walk.sample()).toEqual(end);
  walk.advance(0.2, 1);
  expect(walk.distance).toBeCloseTo(roadLength - 0.1);
  expect(walk.heading).toBe(-1);
  walk.advance(roadLength - 0.1 + 0.2, 1);
  expect(walk.distance).toBe(0);
  expect(walk.rest).toBeCloseTo(0.3);
});

test('travel is independent of tick rate and advances in metres per second', () => {
  for (const fps of [15, 30, 120]) {
    const walk = new RoadWalk();
    for (let i = 0; i < fps * 29; i++) walk.advance(1 / fps, 1.2);
    const reference = new RoadWalk();
    reference.advance(29, 1.2);
    expect(walk.distance).toBeCloseTo(reference.distance, 8);
    expect(walk.heading).toBe(reference.heading);
  }
  expect(facing(1, 0, 0, 1)).toBe('right');
  expect(facing(1, 0, 1, 0)).toBe('front');
  expect(facing(-1, 0, 0, 1)).toBe('left');
  expect(facing(-1, 0, 1, 0)).toBe('back');
});
