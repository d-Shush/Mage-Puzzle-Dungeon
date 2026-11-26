import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { RoomCatalog } from '../src/core/catalog';
import { Dungeon } from '../src/core/dungeon';
import { applySaveFile, toSaveFile } from '../src/core/persistence';
import { SavedMaps, sameMap, type SavedMapsBackend, type SavedMapsRecord } from '../src/core/savedMaps';
import { BOARD_SLOTS } from '../src/data/board';
import { starterSave } from '../src/data/rooms';

class MemoryBackend implements SavedMapsBackend {
  stored: unknown;
  failWrites = false;
  async read() {
    return this.stored === undefined ? undefined : JSON.parse(JSON.stringify(this.stored));
  }
  async write(record: SavedMapsRecord) {
    if (this.failWrites) throw new Error('quota');
    this.stored = JSON.parse(JSON.stringify(record));
  }
}

const make = () => {
  const d = new Dungeon(new Board(BOARD_SLOTS), new RoomCatalog());
  applySaveFile(d, starterSave());
  return d;
};

describe('saved maps', () => {
  it('saves, switches between and reopens maps', async () => {
    const backend = new MemoryBackend();
    const maps = await SavedMaps.open(backend);
    const d = make();

    const first = await maps.saveNew('Session 1', toSaveFile(d));
    expect(first.ok).toBe(true);
    d.catalog.create({ name: 'Vault', description: '', type: 'red', doors: ['n'] });
    const second = await maps.saveNew('Session 2', toSaveFile(d));
    if (!first.ok || !second.ok) throw new Error('save failed');
    expect(maps.active?.id).toBe(second.value.id);

    // Switch back to session 1.
    expect(applySaveFile(d, maps.get(first.value.id)!.file).ok).toBe(true);
    await maps.setActive(first.value.id);
    expect(d.catalog.all().map((r) => r.name)).toEqual(["Shaper's Library", 'Unknown']);
    expect(maps.findMatch(toSaveFile(d))?.id).toBe(first.value.id);

    // Everything survives a reload of the page.
    const reopened = await SavedMaps.open(backend);
    expect(reopened.list().map((m) => m.name).sort()).toEqual(['Session 1', 'Session 2']);
    expect(reopened.active?.id).toBe(first.value.id);
  });

  it('updates, renames and deletes', async () => {
    const maps = await SavedMaps.open(new MemoryBackend());
    const d = make();
    const saved = await maps.saveNew('Start', toSaveFile(d));
    if (!saved.ok) throw new Error(saved.error);
    d.setParty('C4');
    expect(sameMap(maps.active!.file, toSaveFile(d))).toBe(false);
    await maps.overwrite(saved.value.id, toSaveFile(d));
    expect(sameMap(maps.active!.file, toSaveFile(d))).toBe(true);

    expect((await maps.rename(saved.value.id, '  Night two ')).ok).toBe(true);
    expect(maps.get(saved.value.id)?.name).toBe('Night two');

    expect((await maps.remove(saved.value.id)).ok).toBe(true);
    expect(maps.list()).toEqual([]);
    expect(maps.active).toBeUndefined();
  });

  it('refuses empty or duplicate names and suggests a free one', async () => {
    const maps = await SavedMaps.open(new MemoryBackend());
    const file = toSaveFile(make());
    expect((await maps.saveNew('  ', file)).ok).toBe(false);
    expect((await maps.saveNew('Session 1', file)).ok).toBe(true);
    expect((await maps.saveNew('session 1', file)).ok).toBe(false);
    expect(maps.suggestName()).toBe('Session 2');
  });

  it('ignores the cloud sync revision when comparing maps', async () => {
    const maps = await SavedMaps.open(new MemoryBackend());
    const file = toSaveFile(make());
    const res = await maps.saveNew('A', { ...file, revision: 'abc' });
    if (!res.ok) throw new Error(res.error);
    expect(res.value.file.revision).toBeUndefined();
    expect(maps.findMatch({ ...file, revision: 'xyz' })?.id).toBe(res.value.id);
  });

  it('keeps the old list when storage is full', async () => {
    const backend = new MemoryBackend();
    const maps = await SavedMaps.open(backend);
    const file = toSaveFile(make());
    await maps.saveNew('A', file);
    backend.failWrites = true;
    const res = await maps.saveNew('B', file);
    expect(res.ok).toBe(false);
    expect(maps.list().map((m) => m.name)).toEqual(['A']);
  });

  it('drops unreadable entries', async () => {
    const backend = new MemoryBackend();
    backend.stored = { maps: [{ id: 'x' }, null, { id: 'ok', name: 'Fine', savedAt: 1, file: starterSave() }], activeId: 'x' };
    const maps = await SavedMaps.open(backend);
    expect(maps.list().map((m) => m.name)).toEqual(['Fine']);
    expect(maps.active).toBeUndefined();
  });

  it('a fresh board equals the starting map', () => {
    expect(sameMap(toSaveFile(make()), starterSave())).toBe(true);
  });
});
