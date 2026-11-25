import type { Dungeon } from '../core/dungeon';
import { applySaveFile, toSaveFile } from '../core/persistence';
import { fail, ok, type Result, type SaveFile } from '../core/types';
import { SyncError, newRevision, type RemoteSave, type RemoteStore } from './remoteStore';

export type SyncState =
  | { readonly kind: 'off' }
  | { readonly kind: 'synced'; readonly at: Date }
  | { readonly kind: 'pending' }
  | { readonly kind: 'working'; readonly what: 'saving' | 'loading' }
  /** Temporary problem (no connection, rate limit): local changes are kept and retried. */
  | { readonly kind: 'offline'; readonly message: string }
  /** Needs the DM: bad token, missing cloud save, unreadable data. */
  | { readonly kind: 'error'; readonly message: string }
  /** Both this device and the cloud changed since the last sync. */
  | { readonly kind: 'conflict' };

/** Minimal key-value storage (localStorage in the app, memory in tests). */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface SyncOptions {
  readonly storage: KeyValueStore;
  readonly openStore: (token: string, id: string) => RemoteStore;
  readonly createStore: (token: string, file: SaveFile) => Promise<RemoteStore>;
  readonly parseId: (input: string) => string | undefined;
  /** Wait after the last local change before uploading. */
  readonly debounceMs?: number;
}

interface Meta {
  id: string;
  /** Revision of the cloud save this device last uploaded or downloaded. */
  lastRevision: string;
  /** This device has changes the cloud does not have yet. */
  dirty: boolean;
}

const TOKEN_KEY = 'mage-puzzle-dungeon:sync-token';
const META_KEY = 'mage-puzzle-dungeon:sync-meta';

/**
 * Keeps the board in step with a cloud save so it can be opened on any
 * device. Local changes upload after a short pause; `pull()` brings in
 * changes made elsewhere. If both sides changed, it stops and asks
 * (`conflict`) instead of overwriting either one.
 */
export class SyncManager {
  private store: RemoteStore | undefined;
  private meta: Meta | undefined;
  private state: SyncState = { kind: 'off' };
  private listeners = new Set<(s: SyncState) => void>();
  private applying = false;
  private busy = false;
  private changeSeq = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly dungeon: Dungeon,
    private readonly opts: SyncOptions,
  ) {
    const token = opts.storage.get(TOKEN_KEY);
    const meta = this.readMeta();
    if (token && meta) {
      this.store = opts.openStore(token, meta.id);
      this.meta = meta;
      this.state = meta.dirty ? { kind: 'pending' } : { kind: 'synced', at: new Date() };
    }
    dungeon.subscribe(() => this.onLocalChange());
  }

  get status(): SyncState {
    return this.state;
  }

  get cloudId(): string | undefined {
    return this.meta?.id;
  }

  get connected(): boolean {
    return this.store !== undefined;
  }

  subscribe(listener: (s: SyncState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Connect this device. Without an ID a new cloud save is created from this
   * device's data. With an ID, the cloud save replaces this device's data.
   */
  async connect(token: string, idInput = ''): Promise<Result<'created' | 'loaded'>> {
    if (!token.trim()) return fail('Paste your GitHub token');
    const id = idInput.trim() ? this.opts.parseId(idInput) : undefined;
    if (idInput.trim() && !id) return fail('That does not look like a cloud save ID');

    this.setState({ kind: 'working', what: id ? 'loading' : 'saving' });
    try {
      let store: RemoteStore;
      let meta: Meta;
      let outcome: 'created' | 'loaded';
      if (id) {
        store = this.opts.openStore(token, id);
        const remote = await store.load();
        if (remote) {
          const res = this.applyRemote(remote);
          if (!res.ok) throw new SyncError(`The cloud save could not be loaded: ${res.error}`, 'invalid');
          meta = { id, lastRevision: remote.revision, dirty: false };
        } else {
          // An empty gist: fill it with this device's data.
          const file = this.stamp();
          await store.save(file);
          meta = { id, lastRevision: file.revision ?? '', dirty: false };
        }
        outcome = 'loaded';
      } else {
        const file = this.stamp();
        store = await this.opts.createStore(token, file);
        meta = { id: store.id, lastRevision: file.revision ?? '', dirty: false };
        outcome = 'created';
      }
      this.store = store;
      this.meta = meta;
      this.opts.storage.set(TOKEN_KEY, token.trim());
      this.writeMeta();
      this.setState({ kind: 'synced', at: new Date() });
      return ok(outcome);
    } catch (e) {
      this.setState(this.store ? { kind: 'synced', at: new Date() } : { kind: 'off' });
      return fail(e instanceof Error ? e.message : 'Could not connect');
    }
  }

  /** Forget the token and cloud save on this device. Local data and the cloud save stay. */
  disconnect(): void {
    clearTimeout(this.timer);
    this.store = undefined;
    this.meta = undefined;
    this.opts.storage.remove(TOKEN_KEY);
    this.opts.storage.remove(META_KEY);
    this.setState({ kind: 'off' });
  }

  /** Check the cloud for changes made on other devices. */
  async pull(): Promise<void> {
    if (!this.store || !this.meta || this.busy || this.state.kind === 'conflict') return;
    this.busy = true;
    try {
      const remote = await this.store.load();
      if (!remote) {
        this.markDirty();
      } else if (remote.revision === this.meta.lastRevision) {
        if (!this.meta.dirty) this.setState({ kind: 'synced', at: new Date() });
      } else if (!this.meta.dirty) {
        const res = this.applyRemote(remote);
        if (!res.ok) throw new SyncError(`The cloud save could not be loaded: ${res.error}`, 'invalid');
        this.meta.lastRevision = remote.revision;
        this.writeMeta();
        this.setState({ kind: 'synced', at: new Date() });
      } else {
        this.setState({ kind: 'conflict' });
      }
    } catch (e) {
      this.handleError(e);
    } finally {
      this.busy = false;
    }
    // `status` re-reads the state: it may have changed while awaiting.
    const kind = this.status.kind;
    if (this.meta?.dirty && kind !== 'conflict' && kind !== 'error') this.schedule();
  }

  /** Upload local changes now (also used by tests instead of waiting for the timer). */
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (!this.store || !this.meta || !this.meta.dirty || this.busy || this.state.kind === 'conflict') return;
    this.busy = true;
    const seq = this.changeSeq;
    this.setState({ kind: 'working', what: 'saving' });
    try {
      const remote = await this.store.load();
      if (remote && remote.revision !== this.meta.lastRevision) {
        this.setState({ kind: 'conflict' });
        return;
      }
      const file = this.stamp();
      await this.store.save(file);
      this.meta.lastRevision = file.revision ?? '';
      this.meta.dirty = this.changeSeq !== seq; // changed again while uploading?
      this.writeMeta();
      this.setState(this.meta.dirty ? { kind: 'pending' } : { kind: 'synced', at: new Date() });
    } catch (e) {
      this.handleError(e);
    } finally {
      this.busy = false;
    }
    if (this.meta?.dirty && this.state.kind === 'pending') this.schedule();
  }

  /** Pull, then upload anything left. */
  async syncNow(): Promise<void> {
    if (this.state.kind === 'error' || this.state.kind === 'offline') {
      this.setState(this.meta?.dirty ? { kind: 'pending' } : { kind: 'synced', at: new Date() });
    }
    await this.pull();
    await this.flush();
  }

  /** After a conflict: keep the cloud version, or overwrite it with this device's. */
  async resolveConflict(keep: 'cloud' | 'this-device'): Promise<void> {
    if (!this.store || !this.meta || this.state.kind !== 'conflict') return;
    this.busy = true;
    try {
      if (keep === 'cloud') {
        const remote = await this.store.load();
        if (remote) {
          const res = this.applyRemote(remote);
          if (!res.ok) throw new SyncError(`The cloud save could not be loaded: ${res.error}`, 'invalid');
          this.meta.lastRevision = remote.revision;
        }
      } else {
        const file = this.stamp();
        await this.store.save(file);
        this.meta.lastRevision = file.revision ?? '';
      }
      this.meta.dirty = false;
      this.writeMeta();
      this.setState({ kind: 'synced', at: new Date() });
    } catch (e) {
      this.handleError(e);
    } finally {
      this.busy = false;
    }
  }

  // ---------- internals ----------

  private onLocalChange(): void {
    if (this.applying || !this.store) return;
    this.changeSeq++;
    this.markDirty();
  }

  private markDirty(): void {
    if (!this.meta) return;
    this.meta.dirty = true;
    this.writeMeta();
    if (this.state.kind === 'conflict' || this.state.kind === 'error') return;
    if (this.state.kind !== 'offline' && this.state.kind !== 'working') this.setState({ kind: 'pending' });
    this.schedule();
  }

  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.opts.debounceMs ?? 1500);
  }

  private applyRemote(remote: RemoteSave): Result<unknown> {
    this.applying = true;
    try {
      return applySaveFile(this.dungeon, remote.file);
    } finally {
      this.applying = false;
    }
  }

  private stamp(): SaveFile {
    return { ...toSaveFile(this.dungeon), revision: newRevision() };
  }

  private handleError(e: unknown): void {
    if (e instanceof SyncError && (e.kind === 'auth' || e.kind === 'not-found' || e.kind === 'invalid')) {
      this.setState({ kind: 'error', message: e.message });
    } else {
      this.setState({ kind: 'offline', message: e instanceof Error ? e.message : 'Could not reach GitHub' });
    }
  }

  private setState(state: SyncState): void {
    this.state = state;
    for (const l of this.listeners) l(state);
  }

  private readMeta(): Meta | undefined {
    try {
      const m = JSON.parse(this.opts.storage.get(META_KEY) ?? 'null') as Meta | null;
      return m && typeof m.id === 'string' ? { id: m.id, lastRevision: String(m.lastRevision ?? ''), dirty: !!m.dirty } : undefined;
    } catch {
      return undefined;
    }
  }

  private writeMeta(): void {
    if (this.meta) this.opts.storage.set(META_KEY, JSON.stringify(this.meta));
  }
}

/** localStorage wrapped so a blocked or full storage never breaks the app. */
export const browserStorage: KeyValueStore = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage unavailable: sync still works for this session */
    }
  },
  remove: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};
