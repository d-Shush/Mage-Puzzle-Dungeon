import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { RoomCatalog } from '../src/core/catalog';
import { Dungeon } from '../src/core/dungeon';
import type { SaveFile } from '../src/core/types';
import { BOARD_SLOTS } from '../src/data/board';
import { GIST_FILE, GistStore, parseGistId } from '../src/sync/gistStore';
import { SyncError, type RemoteSave, type RemoteStore } from '../src/sync/remoteStore';
import { SyncManager, type KeyValueStore } from '../src/sync/syncManager';

/** One shared "cloud" that several simulated devices talk to. */
class MemoryCloud {
  data: SaveFile | undefined;
  offline = false;
}
class MemoryStore implements RemoteStore {
  constructor(
    readonly id: string,
    private readonly cloud: MemoryCloud,
  ) {}
  async load(): Promise<RemoteSave | undefined> {
    if (this.cloud.offline) throw new SyncError('offline', 'network');
    const f = this.cloud.data;
    return f ? { file: JSON.parse(JSON.stringify(f)), revision: f.revision ?? '' } : undefined;
  }
  async save(file: SaveFile): Promise<void> {
    if (this.cloud.offline) throw new SyncError('offline', 'network');
    this.cloud.data = JSON.parse(JSON.stringify(file));
  }
}

const memoryStorage = (): KeyValueStore => {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) };
};

function device(cloud: MemoryCloud, storage = memoryStorage()) {
  const dungeon = new Dungeon(new Board(BOARD_SLOTS), new RoomCatalog());
  const sync = new SyncManager(dungeon, {
    storage,
    openStore: (_t, id) => new MemoryStore(id, cloud),
    createStore: async (_t, file) => {
      cloud.data = JSON.parse(JSON.stringify(file));
      return new MemoryStore('cloud-1', cloud);
    },
    parseId: (s) => s.trim() || undefined,
    debounceMs: 60_000, // tests call flush() explicitly
  });
  return { dungeon, sync, storage };
}

const room = (name: string) => ({ name, description: '', type: 'green' as const, doors: [] });

describe('SyncManager', () => {
  it('creates a cloud save from the first device and loads it on another', async () => {
    const cloud = new MemoryCloud();
    const a = device(cloud);
    a.dungeon.catalog.create(room('Vault'));
    a.dungeon.setParty('C4');
    expect(await a.sync.connect('token')).toEqual({ ok: true, value: 'created' });
    expect(a.sync.cloudId).toBe('cloud-1');

    const b = device(cloud);
    b.dungeon.catalog.create(room('Will be replaced'));
    expect(await b.sync.connect('token', 'cloud-1')).toEqual({ ok: true, value: 'loaded' });
    expect(b.dungeon.catalog.all().map((r) => r.name)).toEqual(['Vault']);
    expect(b.dungeon.party).toBe('C4');
    expect(b.sync.status.kind).toBe('synced');
  });

  it('uploads local changes and other devices pick them up', async () => {
    const cloud = new MemoryCloud();
    const a = device(cloud);
    await a.sync.connect('token');
    const b = device(cloud);
    await b.sync.connect('token', 'cloud-1');

    const def = a.dungeon.catalog.create(room('Gallery'));
    if (def.ok) a.dungeon.place('E2', def.value.id);
    expect(a.sync.status.kind).toBe('pending');
    await a.sync.flush();
    expect(a.sync.status.kind).toBe('synced');

    await b.sync.pull();
    expect(b.dungeon.roomAt('E2')).toBeDefined();
    // Applying the download must not count as a new local change.
    expect(b.sync.status.kind).toBe('synced');
  });

  it('stops on a conflict and lets the DM choose', async () => {
    const cloud = new MemoryCloud();
    const a = device(cloud);
    await a.sync.connect('token');
    const b = device(cloud);
    await b.sync.connect('token', 'cloud-1');

    a.dungeon.catalog.create(room('From A'));
    b.dungeon.catalog.create(room('From B'));
    await a.sync.flush();
    await b.sync.flush();
    expect(b.sync.status.kind).toBe('conflict');
    expect(cloud.data?.rooms.map((r) => r.name)).toEqual(['From A']); // nothing overwritten

    await b.sync.resolveConflict('this-device');
    expect(cloud.data?.rooms.map((r) => r.name)).toEqual(['From B']);
    expect(b.sync.status.kind).toBe('synced');

    await a.sync.pull();
    expect(a.dungeon.catalog.all().map((r) => r.name)).toEqual(['From B']);
  });

  it('can keep the cloud version after a conflict', async () => {
    const cloud = new MemoryCloud();
    const a = device(cloud);
    await a.sync.connect('token');
    const b = device(cloud);
    await b.sync.connect('token', 'cloud-1');
    a.dungeon.catalog.create(room('From A'));
    await a.sync.flush();
    b.dungeon.catalog.create(room('From B'));
    await b.sync.pull();
    expect(b.sync.status.kind).toBe('conflict');
    await b.sync.resolveConflict('cloud');
    expect(b.dungeon.catalog.all().map((r) => r.name)).toEqual(['From A']);
  });

  it('keeps changes made offline and uploads them later, also after a reload', async () => {
    const cloud = new MemoryCloud();
    const storage = memoryStorage();
    const a = device(cloud, storage);
    await a.sync.connect('token');
    cloud.offline = true;
    a.dungeon.catalog.create(room('Offline room'));
    await a.sync.flush();
    expect(a.sync.status.kind).toBe('offline');

    // "Reload": a new manager with the same browser storage remembers the pending change.
    cloud.offline = false;
    const again = device(cloud, storage);
    again.dungeon.catalog.create(room('Offline room')); // local autosave would restore this
    expect(again.sync.connected).toBe(true);
    expect(again.sync.status.kind).toBe('pending');
    await again.sync.flush();
    expect(cloud.data?.rooms.map((r) => r.name)).toEqual(['Offline room']);
  });

  it('disconnect forgets the token but keeps local data', async () => {
    const cloud = new MemoryCloud();
    const a = device(cloud);
    a.dungeon.catalog.create(room('Stay'));
    await a.sync.connect('token');
    a.sync.disconnect();
    expect(a.sync.connected).toBe(false);
    expect(a.storage.get('mage-puzzle-dungeon:sync-token')).toBeNull();
    expect(a.dungeon.catalog.size).toBe(1);
  });

  it('reports a bad token without connecting', async () => {
    const d = new Dungeon(new Board(BOARD_SLOTS), new RoomCatalog());
    const sync = new SyncManager(d, {
      storage: memoryStorage(),
      openStore: () => ({ id: 'x', load: async () => { throw new SyncError('GitHub rejected the token.', 'auth'); }, save: async () => {} }),
      createStore: async () => { throw new SyncError('GitHub rejected the token.', 'auth'); },
      parseId: (s) => s,
    });
    expect(await sync.connect('bad')).toEqual({ ok: false, error: 'GitHub rejected the token.' });
    expect(await sync.connect('bad', 'abc')).toEqual({ ok: false, error: 'GitHub rejected the token.' });
    expect(sync.connected).toBe(false);
    expect(await sync.connect('   ')).toMatchObject({ ok: false });
  });
});

describe('GistStore', () => {
  const file: SaveFile = { app: 'mage-puzzle-dungeon', version: 3, rooms: [], board: [], party: null, revision: 'r1' };
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers });

  it('extracts the ID from a pasted gist URL', () => {
    expect(parseGistId('https://gist.github.com/someone/0123456789abcdef0123456789abcdef')).toBe('0123456789abcdef0123456789abcdef');
    expect(parseGistId('  AABBCCDDEEFF00112233  ')).toBe('aabbccddeeff00112233');
    expect(parseGistId('hello')).toBeUndefined();
  });

  it('creates a secret gist, then loads and saves it with the token', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (init?.method === 'POST') return json(201, { id: 'g1' });
      if (init?.method === 'GET') return json(200, { id: 'g1', files: { [GIST_FILE]: { content: JSON.stringify(file) } } });
      return json(200, { id: 'g1' });
    }) as typeof fetch;

    const store = await GistStore.create(' tok ', file, fetchFn);
    expect(store.id).toBe('g1');
    const created = JSON.parse(String(calls[0]!.init!.body));
    expect(created.public).toBe(false);
    expect((calls[0]!.init!.headers as Record<string, string>).Authorization).toBe('Bearer tok');

    expect(await store.load()).toEqual({ file, revision: 'r1' });
    await store.save(file);
    expect(calls[2]!.url).toBe('https://api.github.com/gists/g1');
    expect(calls[2]!.init!.method).toBe('PATCH');
  });

  it('maps GitHub errors to clear messages', async () => {
    const store = (status: number, headers: Record<string, string> = {}) =>
      GistStore.open('t', 'g1', (async () => json(status, {}, headers)) as typeof fetch);
    await expect(store(401).load()).rejects.toMatchObject({ kind: 'auth' });
    await expect(store(404).load()).rejects.toMatchObject({ kind: 'not-found' });
    await expect(store(403, { 'x-ratelimit-remaining': '0' }).load()).rejects.toMatchObject({ kind: 'rate-limit' });
    await expect(store(403).load()).rejects.toMatchObject({ kind: 'auth' });
    await expect(store(500).load()).rejects.toMatchObject({ kind: 'network' });
    const down = GistStore.open('t', 'g1', (async () => { throw new TypeError('fetch failed'); }) as typeof fetch);
    await expect(down.load()).rejects.toMatchObject({ kind: 'network' });
  });

  it('returns nothing for a gist without the save file', async () => {
    const store = GistStore.open('t', 'g1', (async () => json(200, { id: 'g1', files: {} })) as typeof fetch);
    expect(await store.load()).toBeUndefined();
  });
});
