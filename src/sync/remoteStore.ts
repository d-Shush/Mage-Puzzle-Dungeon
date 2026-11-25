import type { SaveFile } from '../core/types';

/** A save file as stored in the cloud, with the stamp of the upload that wrote it. */
export interface RemoteSave {
  readonly file: SaveFile;
  readonly revision: string;
}

/** Where cloud saves live. The app uses a GitHub Gist; tests use memory. */
export interface RemoteStore {
  readonly id: string;
  /** The current cloud save, or undefined if the store holds none yet. */
  load(): Promise<RemoteSave | undefined>;
  save(file: SaveFile): Promise<void>;
}

export type SyncErrorKind = 'auth' | 'not-found' | 'rate-limit' | 'network' | 'invalid';

export class SyncError extends Error {
  constructor(
    message: string,
    readonly kind: SyncErrorKind,
  ) {
    super(message);
    this.name = 'SyncError';
  }
}

/** A unique stamp for one upload. Only compared for equality, so device clocks don't matter. */
export function newRevision(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${new Date().toISOString()}#${rand}`;
}
