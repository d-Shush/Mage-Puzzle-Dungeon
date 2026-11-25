import { describe, expect, it } from 'vitest';
import { nextRotation, rotateCell, rotateSide, worldCells } from '../src/core/geometry';
import type { RoomDefinition } from '../src/core/types';

describe('geometry', () => {
  it('rotates cells clockwise in quarter turns', () => {
    const p = { x: 1, z: 0 }; // east of origin
    expect(rotateCell(p, 90)).toEqual({ x: -0, z: 1 }); // south
    expect(rotateCell(p, 180)).toEqual({ x: -1, z: -0 }); // west
    expect(rotateCell(p, 270)).toEqual({ x: 0, z: -1 }); // north
  });

  it('rotates sides consistently with cells', () => {
    expect(rotateSide('east', 90)).toBe('south');
    expect(rotateSide('north', 270)).toBe('west');
    expect(rotateSide('west', 180)).toBe('east');
  });

  it('cycles rotation back to 0', () => {
    expect(nextRotation(270)).toBe(0);
  });

  it('translates rotated footprint to world space', () => {
    const def = { footprint: [{ x: 0, z: 0 }, { x: 1, z: 0 }] } as unknown as RoomDefinition;
    const cells = worldCells(def, { x: 5, z: 5 }, 90).map((c) => [c.x + 0, c.z + 0]);
    expect(cells).toEqual([
      [5, 5],
      [5, 6],
    ]);
  });
});
