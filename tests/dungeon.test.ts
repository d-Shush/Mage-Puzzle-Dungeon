import { beforeEach, describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { RoomCatalog } from '../src/core/catalog';
import { Dungeon } from '../src/core/dungeon';
import type { Result, RoomDefinition } from '../src/core/types';
import { BOARD_SLOTS } from '../src/data/board';

const TEST_ROOMS: RoomDefinition[] = [
  { id: 1, name: 'Red Room', description: '', type: 'red', doors: ['n'] },
  { id: 2, name: 'Blue Room', description: '', type: 'blue', doors: ['n', 's'] },
  { id: 3, name: 'Green Room', description: '', type: 'green', doors: [] },
];

const unwrap = <T>(res: Result<T>): T => {
  if (!res.ok) throw new Error(res.error);
  return res.value;
};

describe('Dungeon', () => {
  let dungeon: Dungeon;
  beforeEach(() => {
    dungeon = new Dungeon(new Board(BOARD_SLOTS), new RoomCatalog(TEST_ROOMS));
  });

  it('places a room by number into an empty slot', () => {
    const room = unwrap(dungeon.place('A4', 2));
    expect(room).toMatchObject({ slotId: 'A4', definitionId: 2, rotation: 0 });
    expect(dungeon.roomAt('A4')?.instanceId).toBe(room.instanceId);
  });

  it('refuses unknown rooms, unknown slots, occupied slots and the core', () => {
    expect(dungeon.place('A4', 99)).toEqual({ ok: false, error: 'No room with number 99' });
    expect(dungeon.place('Z9', 1).ok).toBe(false);
    unwrap(dungeon.place('A4', 3));
    expect(dungeon.place('A4', 1).ok).toBe(false);
    expect(dungeon.place('G4', 1)).toEqual({ ok: false, error: 'The prismatic core cannot hold a room' });
  });

  it('places each room only once', () => {
    unwrap(dungeon.place('A4', 1));
    expect(dungeon.place('B3', 1).ok).toBe(false);
    expect(dungeon.available().map((d) => d.id)).toEqual([2, 3]);
  });

  it('red rooms cannot rotate or move', () => {
    const red = unwrap(dungeon.place('A4', 1));
    expect(dungeon.rotate(red.instanceId).ok).toBe(false);
    expect(dungeon.move(red.instanceId, 'C4').ok).toBe(false);
  });

  it('blue rooms rotate but do not move', () => {
    const blue = unwrap(dungeon.place('B3', 2));
    expect(unwrap(dungeon.rotate(blue.instanceId)).rotation).toBe(1);
    expect(unwrap(dungeon.rotate(blue.instanceId, -1)).rotation).toBe(0);
    expect(unwrap(dungeon.rotate(blue.instanceId, -1)).rotation).toBe(5);
    expect(dungeon.move(blue.instanceId, 'C4').ok).toBe(false);
  });

  it('green rooms rotate and move', () => {
    const green = unwrap(dungeon.place('B5', 3));
    expect(unwrap(dungeon.rotate(green.instanceId)).rotation).toBe(1);
    expect(unwrap(dungeon.move(green.instanceId, 'M4')).slotId).toBe('M4');
    expect(dungeon.roomAt('B5')).toBeUndefined();
    expect(dungeon.get(green.instanceId)?.rotation).toBe(1);
  });

  it('does not move onto occupied slots or the core', () => {
    unwrap(dungeon.place('A4', 1));
    const green = unwrap(dungeon.place('B5', 3));
    expect(dungeon.move(green.instanceId, 'A4').ok).toBe(false);
    expect(dungeon.move(green.instanceId, 'G4').ok).toBe(false);
    const targets = dungeon.moveTargets(green.instanceId);
    expect(targets).not.toContain('A4');
    expect(targets).not.toContain('G4');
    expect(targets).toHaveLength(37 - 3);
  });

  it('takes a deleted room off the board and reflects edits', () => {
    let calls = 0;
    dungeon.subscribe(() => calls++);
    unwrap(dungeon.place('A4', 1));
    unwrap(dungeon.catalog.update(1, { name: 'Renamed', description: '', type: 'blue', doors: [] }));
    expect(dungeon.definitionOf(dungeon.roomAt('A4')!).name).toBe('Renamed');
    unwrap(dungeon.catalog.remove(1));
    expect(dungeon.roomAt('A4')).toBeUndefined();
    expect(calls).toBe(3);
  });

  it('loads a board and rejects invalid ones without changing state', () => {
    unwrap(dungeon.place('A4', 3));
    const good = [{ instanceId: 'room-7', definitionId: 1, slotId: 'B3', rotation: 0 as const }];
    expect(dungeon.load(good).ok).toBe(true);
    expect(unwrap(dungeon.place('C4', 2)).instanceId).toBe('room-8');

    const before = dungeon.list();
    const twice = [
      { instanceId: 'a', definitionId: 1, slotId: 'B3', rotation: 0 as const },
      { instanceId: 'b', definitionId: 1, slotId: 'B5', rotation: 0 as const },
    ];
    expect(dungeon.load(twice).ok).toBe(false);
    expect(dungeon.load([{ ...good[0]!, slotId: 'G4' }]).ok).toBe(false);
    expect(dungeon.load([{ ...good[0]!, rotation: 9 as never }]).ok).toBe(false);
    expect(dungeon.list()).toEqual(before);
  });
});
