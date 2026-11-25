import { beforeEach, describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { RoomCatalog } from '../src/core/catalog';
import { Dungeon } from '../src/core/dungeon';
import type { RoomDefinition } from '../src/core/types';
import { BOARD_SLOTS } from '../src/data/board';
import { ROOM_CATALOG } from '../src/data/rooms';

const TEST_ROOMS: RoomDefinition[] = [
  { id: 1, name: 'Fixed', description: '', mobility: 'fixed', doors: ['n'], color: '#000' },
  { id: 2, name: 'Spinner', description: '', mobility: 'rotatable', doors: ['n', 's'], color: '#000' },
  { id: 3, name: 'Slider', description: '', mobility: 'movable', doors: [], color: '#000', maxCopies: 2 },
];

const setup = <T>(res: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!res.ok) throw new Error(res.error);
  return res.value;
};

describe('Dungeon', () => {
  let dungeon: Dungeon;
  beforeEach(() => {
    dungeon = new Dungeon(new Board(BOARD_SLOTS), new RoomCatalog(TEST_ROOMS));
  });

  it('places a room by number into an empty slot', () => {
    const room = setup(dungeon.place('A4', 2));
    expect(room).toMatchObject({ slotId: 'A4', definitionId: 2, rotation: 0 });
    expect(dungeon.roomAt('A4')?.instanceId).toBe(room.instanceId);
  });

  it('refuses unknown rooms, unknown slots, occupied slots and the core', () => {
    expect(dungeon.place('A4', 99)).toEqual({ ok: false, error: 'No room with number 99' });
    expect(dungeon.place('Z9', 1).ok).toBe(false);
    setup(dungeon.place('A4', 3));
    expect(dungeon.place('A4', 3).ok).toBe(false);
    expect(dungeon.place('G4', 1)).toEqual({ ok: false, error: 'The prismatic core cannot hold a room' });
  });

  it('limits copies per room', () => {
    setup(dungeon.place('A4', 1));
    expect(dungeon.place('B3', 1).ok).toBe(false);
    setup(dungeon.place('B3', 3));
    setup(dungeon.place('B5', 3));
    expect(dungeon.place('C4', 3).ok).toBe(false);
    expect(dungeon.available().map((d) => d.id)).toEqual([2]);
  });

  it('enforces mobility rules', () => {
    const fixed = setup(dungeon.place('A4', 1));
    const spinner = setup(dungeon.place('B3', 2));
    const slider = setup(dungeon.place('B5', 3));

    expect(dungeon.rotate(fixed.instanceId).ok).toBe(false);
    expect(dungeon.move(fixed.instanceId, 'C4').ok).toBe(false);

    expect(setup(dungeon.rotate(spinner.instanceId)).rotation).toBe(1);
    expect(setup(dungeon.rotate(spinner.instanceId, -1)).rotation).toBe(0);
    expect(setup(dungeon.rotate(spinner.instanceId, -1)).rotation).toBe(5);
    expect(dungeon.move(spinner.instanceId, 'C4').ok).toBe(false);

    expect(dungeon.rotate(slider.instanceId).ok).toBe(false);
    expect(setup(dungeon.move(slider.instanceId, 'K4')).slotId).toBe('K4');
    expect(dungeon.roomAt('B5')).toBeUndefined();
  });

  it('does not move onto occupied slots or the core', () => {
    setup(dungeon.place('A4', 1));
    const slider = setup(dungeon.place('B5', 3));
    expect(dungeon.move(slider.instanceId, 'A4').ok).toBe(false);
    expect(dungeon.move(slider.instanceId, 'G4').ok).toBe(false);
    const targets = dungeon.moveTargets(slider.instanceId);
    expect(targets).not.toContain('A4');
    expect(targets).not.toContain('G4');
    expect(targets).not.toContain('B5');
    expect(targets).toHaveLength(30 - 3);
  });

  it('notifies subscribers on change', () => {
    let calls = 0;
    dungeon.subscribe(() => calls++);
    setup(dungeon.place('A4', 1));
    dungeon.clear();
    expect(calls).toBe(2);
  });

  it('round-trips through a snapshot', () => {
    setup(dungeon.place('A4', 1));
    const spinner = setup(dungeon.place('B3', 2));
    setup(dungeon.rotate(spinner.instanceId));
    const snap = dungeon.toSnapshot();

    const other = new Dungeon(dungeon.board, dungeon.catalog);
    expect(other.loadSnapshot(snap).ok).toBe(true);
    expect(other.list()).toEqual(dungeon.list());
    const added = setup(other.place('C4', 3));
    expect(snap.rooms.map((r) => r.instanceId)).not.toContain(added.instanceId);
  });

  it('rejects invalid snapshots without changing state', () => {
    setup(dungeon.place('A4', 3));
    const bad = {
      version: 2 as const,
      rooms: [
        { instanceId: 'room-1', definitionId: 1, slotId: 'B3', rotation: 0 as const },
        { instanceId: 'room-2', definitionId: 2, slotId: 'B3', rotation: 0 as const },
      ],
    };
    expect(dungeon.loadSnapshot(bad).ok).toBe(false);
    expect(dungeon.loadSnapshot({ ...bad, rooms: [{ ...bad.rooms[0]!, slotId: 'G4' }] }).ok).toBe(false);
    expect(dungeon.list()).toHaveLength(1);
  });
});

describe('RoomCatalog', () => {
  it('accepts the shipped catalogue', () => {
    expect(() => new RoomCatalog(ROOM_CATALOG)).not.toThrow();
  });

  it('rejects duplicate ids and bad doors', () => {
    expect(() => new RoomCatalog([TEST_ROOMS[0]!, TEST_ROOMS[0]!])).toThrow(/Duplicate/);
    expect(() => new RoomCatalog([{ ...TEST_ROOMS[0]!, doors: ['n', 'n'] }])).toThrow(/duplicate door/);
  });
});
