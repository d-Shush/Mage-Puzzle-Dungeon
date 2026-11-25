import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { RoomCatalog } from '../src/core/catalog';
import { Dungeon } from '../src/core/dungeon';
import { applySaveFile, toSaveFile } from '../src/core/persistence';
import { BOARD_SLOTS } from '../src/data/board';

const make = () => new Dungeon(new Board(BOARD_SLOTS), new RoomCatalog());

describe('save files', () => {
  it('round-trips rooms and board', () => {
    const a = make();
    a.catalog.create({ name: 'Vault', description: 'Gold.', type: 'red', doors: ['s'] });
    a.catalog.create({ name: 'Mirror', description: '', type: 'blue', doors: ['n', 'ne'] });
    const placed = a.place('C4', 2);
    if (placed.ok) a.rotate(placed.value.instanceId);
    const file = JSON.parse(JSON.stringify(toSaveFile(a)));

    const b = make();
    expect(applySaveFile(b, file).ok).toBe(true);
    expect(toSaveFile(b)).toEqual(toSaveFile(a));
  });

  it('rejects foreign or broken files without changing anything', () => {
    const d = make();
    d.catalog.create({ name: 'Keep me', description: '', type: 'green', doors: [] });
    expect(applySaveFile(d, { hello: 1 }).ok).toBe(false);
    const broken = {
      app: 'mage-puzzle-dungeon',
      version: 3,
      rooms: [{ id: 1, name: 'A', description: '', type: 'red', doors: [] }],
      board: [{ instanceId: 'x', definitionId: 2, slotId: 'A4', rotation: 0 }],
    };
    expect(applySaveFile(d, broken).ok).toBe(false);
    expect(d.catalog.all().map((r) => r.name)).toEqual(['Keep me']);
  });
});

describe('party in save files', () => {
  it('saves and restores the party marker', () => {
    const a = make();
    a.setParty('D3');
    const b = make();
    expect(applySaveFile(b, JSON.parse(JSON.stringify(toSaveFile(a)))).ok).toBe(true);
    expect(b.party).toBe('D3');
  });

  it('accepts files without a party and rejects unknown slots', () => {
    const d = make();
    const base = { app: 'mage-puzzle-dungeon', version: 3, rooms: [], board: [] };
    expect(applySaveFile(d, base).ok).toBe(true);
    expect(d.party).toBeUndefined();
    expect(applySaveFile(d, { ...base, party: 'Z9' }).ok).toBe(false);
  });
});
