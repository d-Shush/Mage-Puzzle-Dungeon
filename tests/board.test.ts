import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { addRotation, gridDistance, neighbour, rotateSide, SIDES } from '../src/core/grid';
import { BOARD_SLOTS } from '../src/data/board';

describe('grid', () => {
  it('rotates sides clockwise and wraps', () => {
    expect(rotateSide('n', 1)).toBe('e');
    expect(rotateSide('w', 1)).toBe('n');
    expect(rotateSide('e', 2)).toBe('w');
    expect(addRotation(3, 1)).toBe(0);
    expect(addRotation(0, -1)).toBe(3);
  });

  it('neighbours are one step away and opposite sides cancel', () => {
    const o = { col: 2, row: 3 };
    for (const s of SIDES) {
      const n = neighbour(o, s);
      expect(gridDistance(o, n)).toBe(1);
      expect(neighbour(n, rotateSide(s, 2))).toEqual(o);
    }
  });
});

describe('board layout', () => {
  const board = new Board(BOARD_SLOTS);
  const grid = board.all().filter((s) => s.kind !== 'landmark');

  it('is a 5 × 7 grid labelled A1 to E7', () => {
    expect(grid).toHaveLength(35);
    expect(board.get('A1')?.coord).toEqual({ col: 0, row: 0 });
    expect(board.get('E1')?.coord).toEqual({ col: 4, row: 0 });
    expect(board.get('A7')?.coord).toEqual({ col: 0, row: 6 });
    expect(board.get('E7')?.coord).toEqual({ col: 4, row: 6 });
  });

  it('has the core in the middle at C4', () => {
    expect(board.all().filter((s) => s.kind === 'core').map((s) => s.id)).toEqual(['C4']);
    expect(board.get('C4')?.coord).toEqual({ col: 2, row: 3 });
  });

  it("has Shaper's Library above C1 and the Unknown below C7", () => {
    const lib = board.get('LIBRARY');
    const unk = board.get('UNKNOWN');
    expect(lib).toMatchObject({ kind: 'landmark', name: "Shaper's Library", coord: { col: 2, row: -1 } });
    expect(unk).toMatchObject({ kind: 'landmark', name: 'Unknown', coord: { col: 2, row: 7 } });
    expect(board.neighbours('LIBRARY').map((s) => s.id)).toEqual(['C1']);
    expect(board.neighbours('UNKNOWN').map((s) => s.id)).toEqual(['C7']);
    expect(board.describe('LIBRARY')).toBe("Shaper's Library");
    expect(board.describe('B2')).toBe('B2');
  });

  it('finds neighbours on the board only', () => {
    expect(board.neighbours('A1').map((s) => s.id).sort()).toEqual(['A2', 'B1']);
    expect(board.neighbours('C4').map((s) => s.id).sort()).toEqual(['B4', 'C3', 'C5', 'D4']);
  });

  it('rejects invalid layouts', () => {
    const slot = { id: 'X', coord: { col: 0, row: 0 }, kind: 'slot' as const };
    expect(() => new Board([slot, slot])).toThrow(/Duplicate/);
    expect(() => new Board([slot, { ...slot, id: 'Y' }])).toThrow(/position/);
    expect(() => new Board([{ ...slot, kind: 'landmark' }])).toThrow(/name/);
  });
});
