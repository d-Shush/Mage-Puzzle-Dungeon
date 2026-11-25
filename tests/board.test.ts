import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { BOARD_SLOTS } from '../src/data/board';

describe('board layout', () => {
  const board = new Board(BOARD_SLOTS);

  it('has 37 slots in columns of 4-5-6-7-6-5-4', () => {
    expect(board.all()).toHaveLength(37);
    const perColumn = [-3, -2, -1, 0, 1, 2, 3].map((q) => board.all().filter((s) => s.coord.q === q).length);
    expect(perColumn).toEqual([4, 5, 6, 7, 6, 5, 4]);
  });

  it('has exactly one core, G4, in the middle column', () => {
    const cores = board.all().filter((s) => s.kind === 'core');
    expect(cores.map((s) => s.id)).toEqual(['G4']);
    expect(cores[0]?.coord).toEqual({ q: 0, r: 0 });
  });

  it('labels the corners', () => {
    expect(board.get('A4')?.coord).toEqual({ q: 0, r: -6 });
    expect(board.get('M4')?.coord).toEqual({ q: 0, r: 6 });
    expect(board.get('D1')?.coord).toEqual({ q: -3, r: -3 });
    expect(board.get('J7')?.coord).toEqual({ q: 3, r: 3 });
  });

  it('is symmetric around the core', () => {
    const keys = new Set(board.all().map((s) => `${s.coord.q},${s.coord.r}`));
    for (const s of board.all()) {
      expect(keys.has(`${-s.coord.q},${s.coord.r}`)).toBe(true);
      expect(keys.has(`${s.coord.q},${-s.coord.r}`)).toBe(true);
    }
    // Every slot is within three steps of the core: a regular hexagon.
    expect(board.all().every((s) => board.distance(s.id, 'G4') <= 3)).toBe(true);
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
