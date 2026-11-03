import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { auditRockGeometry, createRockGeometry, parseRockPrototypePreset } from '../../src/world/coastalRockPrototype';

const raw: unknown = JSON.parse(readFileSync('public/assets/presets/coastal-g04-a1.json', 'utf8'));
describe('G04-A1 single solid and scope', () => {
  it('has an oriented closed volume, sloped top and a fully submerged closure', () => {
    const config = parseRockPrototypePreset(raw), geometry = createRockGeometry(config);
    try {
      const audit = auditRockGeometry(geometry);
      expect(audit.openEdges).toBe(0); expect(audit.nonmanifoldEdges).toBe(0); expect(audit.degenerateTriangles).toBe(0);
      expect(audit.signedVolumeM3).toBeGreaterThan(3); expect(audit.triangles).toBeLessThan(150);
      expect(config.rings[0]!.every((p) => p[1] < -0.2)).toBe(true);
      const heights = config.rings.at(-1)!.map((p) => p[1]); expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(1);
      // Every shared edge must occur in opposite directions, not just twice.
      const index = geometry.index!, directions = new Map<string, number>();
      for (let i = 0; i < index.count; i += 3) for (let k = 0; k < 3; k++) {
        const a = index.getX(i + k), b = index.getX(i + (k + 1) % 3), key = [a, b].sort((x, y) => x - y).join(',');
        directions.set(key, (directions.get(key) ?? 0) + (a < b ? 1 : -1));
      }
      expect([...directions.values()].every((n) => n === 0)).toBe(true);
    } finally { geometry.dispose(); }
  });
  it('rejects a different subject, expanded footprint and vertically folded profiles', () => {
    const original = raw as Record<string, unknown>;
    expect(() => parseRockPrototypePreset({ ...original, subject: 'east-cliff' })).toThrow();
    expect(() => parseRockPrototypePreset({ ...original, window: { min: [7, -0.5, 5], max: [11.2, 2.35, 7.2] } })).toThrow();
    const folded = structuredClone(original); (folded.rings as number[][][])[2]![0]![1] = -0.4;
    expect(() => parseRockPrototypePreset(folded)).toThrow();
  });
});
