import { describe, expect, it } from 'vitest';
import { clippedTriangleArea } from '../../src/world/cottageStructure';

describe('actual platform triangle clipping', () => {
  const box = { minX: 0, maxX: 1, minZ: 0, maxZ: 1 };
  it('clips a large triangle to a unit platform rectangle', () => {
    expect(clippedTriangleArea([[0, 0], [2, 0], [0, 2]], box)).toBeCloseTo(1, 12);
    expect(clippedTriangleArea([[0, 2], [2, 0], [0, 0]], box)).toBeCloseTo(1, 12);
  });
  it('does not count geometry outside or merely touching the envelope', () => {
    expect(clippedTriangleArea([[2, 2], [3, 2], [2, 3]], box)).toBe(0);
    expect(clippedTriangleArea([[1, 0], [2, 0], [1, 1]], box)).toBe(0);
  });
  it('preserves a real missing stair opening when summing platform triangles', () => {
    const rectangles = [[0, 0, 3, 1], [0, 2, 3, 3], [0, 1, 1, 2], [2, 1, 3, 2]];
    const area = rectangles.reduce((sum, [x0, z0, x1, z1]) => sum +
      clippedTriangleArea([[x0!, z0!], [x1!, z0!], [x1!, z1!]], { minX: 0.5, maxX: 2.5, minZ: 0.5, maxZ: 2.5 }) +
      clippedTriangleArea([[x0!, z0!], [x1!, z1!], [x0!, z1!]], { minX: 0.5, maxX: 2.5, minZ: 0.5, maxZ: 2.5 }), 0);
    expect(area).toBeCloseTo(3, 12); // 2x2 clipped square minus the unchanged 1x1 void.
  });
});
