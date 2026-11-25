import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { BOARD_SLOTS } from '../src/data/board';

describe('board layout', () => {
  const board = new Board(BOARD_SLOTS);

  it('has 30 slots in columns of 3-4-5-6-5-4-3', () => {
    expect(board.all()).toHaveLength(30);
    const perColumn = [-3, -2, -1, 0, 1, 2, 3].map((q) => board.all().filter((s) => s.coord.q === q).length);
    expect(perColumn).toEqual([3, 4, 5, 6, 5, 4, 3]);
  });

  it('has exactly one core, G4, in the middle column', () => {
    const cores = board.all().filter((s) => s.kind === 'core');
    expect(cores.map((s) => s.id)).toEqual(['G4']);
    expect(cores[0]?.coord).toEqual({ q: 0, r: 0 });
  });

  it('labels the corners', () => {
    expect(board.get('A4')?.coord).toEqual({ q: 0, r: -6 });
    expect(board.get('K4')?.coord).toEqual({ q: 0, r: 4 });
    expect(board.get('D1')?.coord).toEqual({ q: -3, r: -3 });
    expect(board.get('H7')?.coord).toEqual({ q: 3, r: 1 });
  });

  it('finds neighbours on the board only', () => {
    expect(board.neighbours('A4').map((s) => s.id).sort()).toEqual(['B3', 'B5', 'C4']);
    expect(board.neighbours('G4')).toHaveLength(6);
  });

  it('rejects invalid layouts', () => {
    expect(() => new Board([{ id: 'X', coord: { q: 1, r: 0 }, kind: 'slot' }])).toThrow(/even/);
    expect(
      () =>
        new Board([
          { id: 'X', coord: { q: 0, r: 0 }, kind: 'slot' },
          { id: 'X', coord: { q: 0, r: 2 }, kind: 'slot' },
        ]),
    ).toThrow(/Duplicate/);
  });
});
