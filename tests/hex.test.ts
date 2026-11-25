import { describe, expect, it } from 'vitest';
import { addRotation, hexDistance, neighbour, rotateSide, SIDES } from '../src/core/hex';

describe('hex', () => {
  it('rotates sides clockwise', () => {
    expect(rotateSide('n', 1)).toBe('ne');
    expect(rotateSide('nw', 1)).toBe('n');
    expect(rotateSide('se', 3)).toBe('nw');
  });

  it('wraps rotation in both directions', () => {
    expect(addRotation(5, 1)).toBe(0);
    expect(addRotation(0, -1)).toBe(5);
  });

  it('neighbours are at distance 1 and opposite sides cancel', () => {
    const o = { q: 0, r: 0 };
    for (const s of SIDES) {
      const n = neighbour(o, s);
      expect(hexDistance(o, n)).toBe(1);
      expect(neighbour(n, rotateSide(s, 3))).toEqual(o);
    }
  });

  it('measures longer distances', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: -6 })).toBe(3);
    expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: -3 })).toBe(3);
    expect(hexDistance({ q: -3, r: 1 }, { q: 3, r: 1 })).toBe(6);
  });
});
