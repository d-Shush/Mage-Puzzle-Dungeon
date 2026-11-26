import { beforeEach, describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { RoomCatalog } from '../src/core/catalog';
import { Dungeon } from '../src/core/dungeon';
import type { Result, RoomDefinition } from '../src/core/types';
import { BOARD_SLOTS } from '../src/data/board';

const TEST_ROOMS: RoomDefinition[] = [
  { id: 1, name: 'Red Room', description: '', type: 'red', doors: ['n'] },
  { id: 2, name: 'Blue Room', description: '', type: 'blue', doors: ['n', 'e'] },
  { id: 3, name: 'Gold Room', description: '', type: 'gold', doors: [] },
  { id: 4, name: "Shaper's Library", description: '', type: 'prismatic', doors: ['s'] },
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

  it('refuses unknown rooms, unknown slots and occupied slots', () => {
    expect(dungeon.place('A4', 99)).toEqual({ ok: false, error: 'No room with number 99' });
    expect(dungeon.place('Z9', 1).ok).toBe(false);
    unwrap(dungeon.place('A4', 3));
    expect(dungeon.place('A4', 1)).toEqual({ ok: false, error: 'Slot A4 is already occupied' });
  });

  it('allows rooms in C4 and in the outer slots C0 and C8', () => {
    for (const [slotId, id] of [['C4', 1], ['C0', 4], ['C8', 3]] as const) {
      expect(dungeon.check([{ instanceId: 'x', definitionId: id, slotId, rotation: 0 }]).ok).toBe(true);
    }
    unwrap(dungeon.load([{ instanceId: 'room-1', definitionId: 4, slotId: 'C0', rotation: 0 }]));
    expect(dungeon.describeSlot('C0')).toBe("C0, Shaper's Library");
    expect(dungeon.describeSlot('B2')).toBe('B2');
  });

  it('places each room only once', () => {
    unwrap(dungeon.place('A4', 1));
    expect(dungeon.place('B2', 1).ok).toBe(false);
    expect(dungeon.available().map((d) => d.id)).toEqual([2, 3, 4]);
  });

  it('red rooms cannot rotate or move', () => {
    const red = unwrap(dungeon.place('A4', 1));
    expect(dungeon.rotate(red.instanceId).ok).toBe(false);
    expect(dungeon.move(red.instanceId, 'B2').ok).toBe(false);
  });

  it('blue rooms rotate but do not move', () => {
    const blue = unwrap(dungeon.place('B3', 2));
    expect(unwrap(dungeon.rotate(blue.instanceId)).rotation).toBe(1);
    expect(unwrap(dungeon.rotate(blue.instanceId, -1)).rotation).toBe(0);
    expect(unwrap(dungeon.rotate(blue.instanceId, -1)).rotation).toBe(3);
    expect(dungeon.move(blue.instanceId, 'B2').ok).toBe(false);
  });

  it('prismatic rooms cannot rotate or move', () => {
    const lib = unwrap(dungeon.place('C0', 4));
    expect(dungeon.rotate(lib.instanceId)).toEqual({ ok: false, error: "Shaper's Library is a prismatic room and cannot rotate" });
    expect(dungeon.move(lib.instanceId, 'B2').ok).toBe(false);
  });

  it('gold rooms cannot rotate or move, like red ones', () => {
    const gold = unwrap(dungeon.place('B5', 3));
    expect(dungeon.rotate(gold.instanceId)).toEqual({ ok: false, error: 'Gold Room is a gold room and cannot rotate' });
    expect(dungeon.move(gold.instanceId, 'E7').ok).toBe(false);
    expect(dungeon.moveTargets(gold.instanceId)).toEqual([]);
  });

  it('takes a deleted room off the board and reflects edits', () => {
    let calls = 0;
    dungeon.subscribe(() => calls++);
    unwrap(dungeon.place('A4', 1));
    unwrap(dungeon.catalog.update(1, { name: 'Renamed', description: '', type: 'blue', doors: ['w'] }));
    expect(dungeon.definitionOf(dungeon.roomAt('A4')!).name).toBe('Renamed');
    unwrap(dungeon.catalog.remove(1));
    expect(dungeon.roomAt('A4')).toBeUndefined();
    expect(calls).toBe(3);
  });

  it('loads a board and rejects invalid ones without changing state', () => {
    unwrap(dungeon.place('A4', 3));
    const good = [{ instanceId: 'room-7', definitionId: 1, slotId: 'B3', rotation: 0 as const }];
    expect(dungeon.load(good).ok).toBe(true);
    expect(unwrap(dungeon.place('B2', 2)).instanceId).toBe('room-8'); // blue: turned to meet B3's north exit

    const before = dungeon.list();
    const twice = [
      { instanceId: 'a', definitionId: 1, slotId: 'B3', rotation: 0 as const },
      { instanceId: 'b', definitionId: 1, slotId: 'B5', rotation: 0 as const },
    ];
    expect(dungeon.load(twice).ok).toBe(false);
    expect(dungeon.load([{ ...good[0]!, slotId: 'X9' }]).ok).toBe(false);
    expect(dungeon.load([{ ...good[0]!, rotation: 4 as never }]).ok).toBe(false);
    expect(dungeon.list()).toEqual(before);
  });
});

describe('placement rules', () => {
  const ROOMS: RoomDefinition[] = [
    { id: 1, name: 'Anchor', description: '', type: 'prismatic', doors: ['s'] },
    { id: 2, name: 'Red N', description: '', type: 'red', doors: ['n'] },
    { id: 3, name: 'Red E', description: '', type: 'red', doors: ['e'] },
    { id: 4, name: 'Blue E', description: '', type: 'blue', doors: ['e'] },
    { id: 5, name: 'Blue EW', description: '', type: 'blue', doors: ['e', 'w'] },
    { id: 6, name: 'Blank', description: '', type: 'gold', doors: [] },
    { id: 7, name: 'Gold N', description: '', type: 'gold', doors: ['n'] },
  ];
  let d: Dungeon;
  beforeEach(() => {
    d = new Dungeon(new Board(BOARD_SLOTS), new RoomCatalog(ROOMS));
    unwrap(d.place('C0', 1)); // empty board: anywhere
  });

  it('only places rooms next to a room on the board', () => {
    expect(d.place('A4', 2)).toEqual({ ok: false, error: 'A4 is not next to a room. Rooms can only be placed next to a room on the board' });
    expect(d.placementTargets(2)).toEqual(['C1']);
  });

  it('red and gold rooms need an exit that meets a neighbour exit', () => {
    expect(d.place('C1', 3).ok).toBe(false); // exit east, Anchor's exit is south
    expect(d.place('C1', 6).ok).toBe(false); // no exits at all
    expect(unwrap(d.place('C1', 2)).rotation).toBe(0);
    expect(d.place('C2', 7).ok).toBe(false); // Red N has no south exit
  });

  it('a neighbour whose exit faces a wall does not count as a connection', () => {
    unwrap(d.place('C1', 2));
    // B1 is next to C1, but C1 has no west exit.
    expect(d.place('B1', 3).ok).toBe(false);
  });

  it('blue rooms are turned to a rotation that connects', () => {
    expect(unwrap(d.place('C1', 4)).rotation).toBe(3); // east exit turned to face north
    expect(d.roomAt('C1')).toBeDefined();
  });

  it('blue rooms only rotate to rotations that stay connected', () => {
    const blue = unwrap(d.place('C1', 5)); // E/W: needs a quarter turn to face north
    expect(blue.rotation).toBe(1);
    expect(unwrap(d.rotate(blue.instanceId)).rotation).toBe(3); // skips 2, which faces east/west
    expect(unwrap(d.rotate(blue.instanceId, -1)).rotation).toBe(1);
    const only = new Dungeon(new Board(BOARD_SLOTS), new RoomCatalog(ROOMS));
    unwrap(only.place('C0', 1));
    const single = unwrap(only.place('C1', 4));
    expect(only.rotate(single.instanceId)).toEqual({ ok: false, error: 'Blue E has no other rotation that connects to a neighbouring room' });
  });

  it('rooms with no neighbours rotate freely', () => {
    const lone = new Dungeon(new Board(BOARD_SLOTS), new RoomCatalog(ROOMS));
    const blue = unwrap(lone.place('B3', 4));
    expect(unwrap(lone.rotate(blue.instanceId)).rotation).toBe(1);
  });
});

describe('party marker', () => {
  const make = () => new Dungeon(new Board(BOARD_SLOTS), new RoomCatalog(TEST_ROOMS));

  it('starts off the map and can go on any slot, empty or not', () => {
    const d = make();
    expect(d.party).toBeUndefined();
    expect(d.setParty('C4').ok).toBe(true);
    expect(d.setParty('C0').ok).toBe(true);
    expect(d.setParty('A4').ok).toBe(true);
    expect(d.party).toBe('A4');
    expect(d.setParty('Z9').ok).toBe(false);
    expect(d.party).toBe('A4');
    expect(d.setParty(undefined).ok).toBe(true);
    expect(d.party).toBeUndefined();
  });
});
