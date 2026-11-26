import { fail, ok, type Result, type SaveFile } from './types';

export const MAP_NAME_MAX = 40;

/** A named copy of the whole map (rooms, board, party), kept on this device. */
export interface SavedMap {
  readonly id: string;
  readonly name: string;
  /** Milliseconds since the epoch. */
  readonly savedAt: number;
  readonly file: SaveFile;
}

/** What the backend stores: every saved map, plus which one is open. */
export interface SavedMapsRecord {
  readonly maps: readonly SavedMap[];
  /** Map the working board was last loaded from or saved to. */
  readonly activeId?: string;
}

/** Where saved maps live (IndexedDB in the app, memory in tests). */
export interface SavedMapsBackend {
  read(): Promise<unknown>;
  write(record: SavedMapsRecord): Promise<void>;
}

/** The parts of a save that make up "the map"; the sync revision stamp is ignored. */
function mapKey(file: SaveFile): string {
  return JSON.stringify({ rooms: file.rooms, board: file.board, party: file.party ?? null });
}

export function sameMap(a: SaveFile, b: SaveFile): boolean {
  return mapKey(a) === mapKey(b);
}

function withoutRevision(file: SaveFile): SaveFile {
  const { revision: _revision, ...rest } = file;
  return rest;
}

function isSavedMap(m: unknown): m is SavedMap {
  const x = m as SavedMap | null;
  return (
    typeof x?.id === 'string' &&
    typeof x.name === 'string' &&
    typeof x.savedAt === 'number' &&
    (x.file as { app?: unknown } | undefined)?.app === 'mage-puzzle-dungeon'
  );
}

const newId = () => `map-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Named snapshots of the map on this device, so the DM can keep several
 * sessions or states and switch between them. The working map itself is
 * still saved by the normal autosave; this only stores copies.
 * Every change is written to the backend first and only kept if that worked.
 */
export class SavedMaps {
  private listeners = new Set<() => void>();

  private constructor(
    private readonly backend: SavedMapsBackend,
    private record: SavedMapsRecord,
  ) {}

  /** Read what is stored. Unreadable entries are dropped rather than breaking the app. */
  static async open(backend: SavedMapsBackend): Promise<SavedMaps> {
    let raw: unknown;
    try {
      raw = await backend.read();
    } catch {
      raw = undefined;
    }
    const r = raw as Partial<SavedMapsRecord> | undefined;
    const maps = Array.isArray(r?.maps) ? r.maps.filter(isSavedMap) : [];
    const activeId = maps.some((m) => m.id === r?.activeId) ? r?.activeId : undefined;
    return new SavedMaps(backend, { maps, activeId });
  }

  /** Newest first. */
  list(): SavedMap[] {
    return [...this.record.maps].sort((a, b) => b.savedAt - a.savedAt);
  }

  get(id: string): SavedMap | undefined {
    return this.record.maps.find((m) => m.id === id);
  }

  get active(): SavedMap | undefined {
    return this.record.activeId ? this.get(this.record.activeId) : undefined;
  }

  /** A saved map identical to this one, preferring the open one. */
  findMatch(file: SaveFile): SavedMap | undefined {
    const key = mapKey(file);
    const active = this.active;
    if (active && mapKey(active.file) === key) return active;
    return this.record.maps.find((m) => mapKey(m.file) === key);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Save the given map under a new name and make it the open one. */
  async saveNew(nameInput: string, file: SaveFile, now = Date.now()): Promise<Result<SavedMap>> {
    const name = this.checkName(nameInput);
    if (!name.ok) return fail(name.error);
    const map: SavedMap = { id: newId(), name: name.value, savedAt: now, file: withoutRevision(file) };
    const res = await this.commit({ maps: [...this.record.maps, map], activeId: map.id });
    return res.ok ? ok(map) : fail(res.error);
  }

  /** Replace a saved map's contents with the given map and make it the open one. */
  async overwrite(id: string, file: SaveFile, now = Date.now()): Promise<Result<SavedMap>> {
    const old = this.get(id);
    if (!old) return fail('That saved map no longer exists');
    const map: SavedMap = { ...old, savedAt: now, file: withoutRevision(file) };
    const res = await this.commit({ maps: this.record.maps.map((m) => (m.id === id ? map : m)), activeId: id });
    return res.ok ? ok(map) : fail(res.error);
  }

  async rename(id: string, nameInput: string): Promise<Result<SavedMap>> {
    const old = this.get(id);
    if (!old) return fail('That saved map no longer exists');
    const name = this.checkName(nameInput, id);
    if (!name.ok) return fail(name.error);
    const map: SavedMap = { ...old, name: name.value };
    const res = await this.commit({ ...this.record, maps: this.record.maps.map((m) => (m.id === id ? map : m)) });
    return res.ok ? ok(map) : fail(res.error);
  }

  async remove(id: string): Promise<Result<void>> {
    if (!this.get(id)) return fail('That saved map no longer exists');
    const activeId = this.record.activeId === id ? undefined : this.record.activeId;
    return this.commit({ maps: this.record.maps.filter((m) => m.id !== id), activeId });
  }

  /** Mark which saved map the working board now comes from (or none). */
  async setActive(id: string | undefined): Promise<Result<void>> {
    if (id !== undefined && !this.get(id)) return fail('That saved map no longer exists');
    if (this.record.activeId === id) return ok(undefined);
    return this.commit({ ...this.record, activeId: id });
  }

  /** A name that is not taken yet, e.g. "Session 3". */
  suggestName(base = 'Session'): string {
    for (let n = this.record.maps.length + 1; ; n++) {
      const name = `${base} ${n}`;
      if (this.checkName(name).ok) return name;
    }
  }

  private checkName(input: string, exceptId?: string): Result<string> {
    const name = (input ?? '').trim();
    if (!name) return fail('Give the saved map a name');
    if (name.length > MAP_NAME_MAX) return fail(`Keep the name under ${MAP_NAME_MAX} characters`);
    const lower = name.toLocaleLowerCase();
    if (this.record.maps.some((m) => m.id !== exceptId && m.name.toLocaleLowerCase() === lower)) {
      return fail(`There is already a saved map called "${name}"`);
    }
    return ok(name);
  }

  private async commit(next: SavedMapsRecord): Promise<Result<void>> {
    try {
      await this.backend.write(next);
    } catch {
      return fail('Could not save in this browser (storage may be full). Delete old saved maps or use Export file.');
    }
    this.record = next;
    for (const l of this.listeners) l();
    return ok(undefined);
  }
}
