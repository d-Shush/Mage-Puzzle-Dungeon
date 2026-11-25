import { beforeEach, describe, expect, it } from 'vitest';
import { RoomCatalog } from '../src/core/catalog';
import { Dungeon } from '../src/core/dungeon';
import type { RoomDefinition } from '../src/core/types';
import { ROOM_CATALOG } from '../src/data/rooms';

const line = (n: number) => Array.from({ length: n }, (_, x) => ({ x, z: 0 }));

const TEST_ROOMS: RoomDefinition[] = [
  { id: 1, name: 'Fixed', description: '', mobility: 'fixed', footprint: line(2), doors: [], color: '#000' },
  { id: 2, name: 'Spinner', description: '', mobility: 'rotatable', footprint: line(3), doors: [], color: '#000' },
  { id: 3, name: 'Slider', description: '', mobility: 'movable', footprint: line(1), doors: [], color: '#000' },
];

describe('Dungeon', () => {
  let dungeon: Dungeon;
  beforeEach(() => {
    dungeon = new Dungeon(new RoomCatalog(TEST_ROOMS));
  });

  it('adds rooms by catalogue number', () => {
    const res = dungeon.add(2);
    expect(res.ok).toBe(true);
    expect(dungeon.list()).toHaveLength(1);
  });

  it('rejects unknown numbers', () => {
    const res = dungeon.add(99);
    expect(res).toEqual({ ok: false, error: 'No room with number 99' });
  });

  it('auto-places rooms without overlap', () => {
    dungeon.add(1);
    dungeon.add(1);
    dungeon.add(2);
    const occupied = dungeon.occupancy();
    expect(occupied.size).toBe(2 + 2 + 3);
  });

  it('refuses explicit placement on occupied cells', () => {
    dungeon.add(1, { x: 0, z: 0 });
    expect(dungeon.add(3, { x: 1, z: 0 }).ok).toBe(false);
  });

  it('enforces mobility rules', () => {
    const fixed = dungeon.add(1, { x: 0, z: 0 });
    const spinner = dungeon.add(2, { x: 0, z: 5 });
    const slider = dungeon.add(3, { x: 0, z: -5 });
    if (!fixed.ok || !spinner.ok || !slider.ok) throw new Error('setup failed');

    expect(dungeon.move(fixed.value.instanceId, { x: 1, z: 0 }).ok).toBe(false);
    expect(dungeon.rotate(fixed.value.instanceId).ok).toBe(false);

    expect(dungeon.rotate(spinner.value.instanceId).ok).toBe(true);
    expect(dungeon.move(spinner.value.instanceId, { x: 1, z: 0 }).ok).toBe(false);

    expect(dungeon.move(slider.value.instanceId, { x: 1, z: 0 }).ok).toBe(true);
    expect(dungeon.rotate(slider.value.instanceId).ok).toBe(false);
  });

  it('blocks moves and rotations into other rooms', () => {
    const slider = dungeon.add(3, { x: 0, z: 0 });
    dungeon.add(1, { x: 1, z: 0 });
    const spinner = dungeon.add(2, { x: 0, z: 2 });
    if (!slider.ok || !spinner.ok) throw new Error('setup failed');

    expect(dungeon.move(slider.value.instanceId, { x: 1, z: 0 }).ok).toBe(false);
    // Rotating 90° from (0,2) occupies (0,2),(0,3),(0,4) - free.
    expect(dungeon.rotate(spinner.value.instanceId).ok).toBe(true);
    // Next 90° turn occupies (0,2),(-1,2),(-2,2) - free; then 270° reaches (0,1),(0,0) - slider.
    expect(dungeon.rotate(spinner.value.instanceId).ok).toBe(true);
    expect(dungeon.rotate(spinner.value.instanceId).ok).toBe(false);
  });

  it('notifies subscribers on change', () => {
    let calls = 0;
    dungeon.subscribe(() => calls++);
    dungeon.add(1);
    dungeon.clear();
    expect(calls).toBe(2);
  });

  it('round-trips through a snapshot', () => {
    dungeon.add(1);
    dungeon.add(2);
    const snap = dungeon.toSnapshot();

    const other = new Dungeon(new RoomCatalog(TEST_ROOMS));
    expect(other.loadSnapshot(snap).ok).toBe(true);
    expect(other.list()).toEqual(dungeon.list());
    // New ids must not collide with loaded ones.
    const added = other.add(3);
    expect(added.ok && snap.rooms.every((r) => r.instanceId !== added.value.instanceId)).toBe(true);
  });

  it('rejects overlapping snapshots without changing state', () => {
    dungeon.add(3);
    const bad = {
      version: 1 as const,
      rooms: [
        { instanceId: 'room-1', definitionId: 1, position: { x: 0, z: 0 }, rotation: 0 as const },
        { instanceId: 'room-2', definitionId: 1, position: { x: 1, z: 0 }, rotation: 0 as const },
      ],
    };
    expect(dungeon.loadSnapshot(bad).ok).toBe(false);
    expect(dungeon.list()).toHaveLength(1);
  });
});

describe('RoomCatalog', () => {
  it('accepts the shipped catalogue', () => {
    expect(() => new RoomCatalog(ROOM_CATALOG)).not.toThrow();
  });

  it('rejects duplicate ids', () => {
    expect(() => new RoomCatalog([TEST_ROOMS[0]!, TEST_ROOMS[0]!])).toThrow(/Duplicate/);
  });

  it('rejects doors outside the footprint', () => {
    const bad = { ...TEST_ROOMS[0]!, doors: [{ cell: { x: 9, z: 9 }, side: 'north' as const }] };
    expect(() => new RoomCatalog([bad])).toThrow(/door/);
  });
});
