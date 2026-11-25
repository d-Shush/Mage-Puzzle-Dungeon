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

  it('is a 5 × 7 grid labelled A1 to E7, plus C0 and C8', () => {
    expect(board.all()).toHaveLength(37);
    expect(board.get('A1')?.coord).toEqual({ col: 0, row: 0 });
    expect(board.get('E1')?.coord).toEqual({ col: 4, row: 0 });
    expect(board.get('A7')?.coord).toEqual({ col: 0, row: 6 });
    expect(board.get('E7')?.coord).toEqual({ col: 4, row: 6 });
  });

  it('has C0 above C1 and C8 below C7, joined to the grid only there', () => {
    expect(board.get('C0')?.coord).toEqual({ col: 2, row: -1 });
    expect(board.get('C8')?.coord).toEqual({ col: 2, row: 7 });
    expect(board.neighbours('C0').map((s) => s.id)).toEqual(['C1']);
    expect(board.neighbours('C8').map((s) => s.id)).toEqual(['C7']);
  });

  it('finds neighbours on the board only', () => {
    expect(board.neighbours('A1').map((s) => s.id).sort()).toEqual(['A2', 'B1']);
    expect(board.neighbours('C4').map((s) => s.id).sort()).toEqual(['B4', 'C3', 'C5', 'D4']);
    expect(board.neighbours('C1').map((s) => s.id).sort()).toEqual(['B1', 'C0', 'C2', 'D1']);
  });

  it('rejects invalid layouts', () => {
    const slot = { id: 'X', coord: { col: 0, row: 0 } };
    expect(() => new Board([slot, slot])).toThrow(/Duplicate/);
    expect(() => new Board([slot, { ...slot, id: 'Y' }])).toThrow(/position/);
    expect(() => new Board([{ id: 'Z', coord: { col: 0.5, row: 0 } }])).toThrow(/whole/);
  });
});
