import type { SaveFile } from '../core/types';
import { SyncError, type RemoteSave, type RemoteStore } from './remoteStore';

const API = 'https://api.github.com';
export const GIST_FILE = 'mage-puzzle-dungeon.json';

type FetchFn = typeof fetch;

/** Pull a gist ID out of whatever was pasted: the bare ID or a gist URL. */
export function parseGistId(input: string): string | undefined {
  const matches = input.trim().match(/[0-9a-f]{20,}/gi);
  return matches?.[matches.length - 1]?.toLowerCase();
}

interface GistResponse {
  id: string;
  files?: Record<string, { content?: string; truncated?: boolean; raw_url?: string } | null>;
}

/**
 * Cloud save in a secret GitHub Gist. Needs a token that can read and write
 * gists. The token stays in the browser that uses it and is only ever sent
 * to api.github.com.
 */
export class GistStore implements RemoteStore {
  private constructor(
    private readonly token: string,
    readonly id: string,
    private readonly fetchFn: FetchFn,
  ) {}

  static open(token: string, gistId: string, fetchFn: FetchFn = (...a) => fetch(...a)): GistStore {
    return new GistStore(token.trim(), gistId, fetchFn);
  }

  /** Create a new secret gist holding `file`. */
  static async create(token: string, file: SaveFile, fetchFn: FetchFn = (...a) => fetch(...a)): Promise<GistStore> {
    const res = (await request(fetchFn, token.trim(), 'POST', '/gists', {
      description: 'Mage Puzzle Dungeon — cloud save',
      public: false,
      files: { [GIST_FILE]: { content: JSON.stringify(file, null, 2) } },
    })) as GistResponse;
    if (!res?.id) throw new SyncError('GitHub did not return the new cloud save', 'invalid');
    return new GistStore(token.trim(), res.id, fetchFn);
  }

  async load(): Promise<RemoteSave | undefined> {
    const gist = (await request(this.fetchFn, this.token, 'GET', `/gists/${this.id}`)) as GistResponse;
    const entry = gist.files?.[GIST_FILE];
    if (!entry) return undefined;

    let text = entry.content ?? '';
    if (entry.truncated && entry.raw_url) {
      const raw = await this.fetchFn(entry.raw_url).catch(() => {
        throw new SyncError('Could not reach GitHub', 'network');
      });
      if (!raw.ok) throw new SyncError('Could not download the cloud save', 'network');
      text = await raw.text();
    }
    let file: SaveFile;
    try {
      file = JSON.parse(text) as SaveFile;
    } catch {
      throw new SyncError('The cloud save is not valid JSON', 'invalid');
    }
    return { file, revision: file.revision ?? '' };
  }

  async save(file: SaveFile): Promise<void> {
    await request(this.fetchFn, this.token, 'PATCH', `/gists/${this.id}`, {
      files: { [GIST_FILE]: { content: JSON.stringify(file, null, 2) } },
    });
  }
}

async function request(fetchFn: FetchFn, token: string, method: string, path: string, body?: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchFn(`${API}${path}`, {
      method,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new SyncError('Could not reach GitHub. Check your connection.', 'network');
  }
  if (res.ok) return res.json();

  if (res.status === 401) throw new SyncError('GitHub rejected the token. It may be wrong or expired.', 'auth');
  if (res.status === 404) {
    throw new SyncError('Cloud save not found, or the token cannot access gists.', 'not-found');
  }
  if (res.status === 403 || res.status === 429) {
    const limited = res.headers.get('x-ratelimit-remaining') === '0' || res.status === 429;
    throw limited
      ? new SyncError('GitHub rate limit reached. Sync will retry shortly.', 'rate-limit')
      : new SyncError('The token is not allowed to write gists. Give it "Gists: Read and write".', 'auth');
  }
  if (res.status === 422) throw new SyncError('GitHub refused the save (it may be too large).', 'invalid');
  throw new SyncError(`GitHub returned an error (${res.status}). Sync will retry.`, 'network');
}
