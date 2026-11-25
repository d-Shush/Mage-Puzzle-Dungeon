import { RoomCatalog } from './catalog';
import { Dungeon } from './dungeon';
import { fail, ok, type Result, type SaveFile } from './types';

const STORAGE_KEY = 'mage-puzzle-dungeon:v3';

export function toSaveFile(dungeon: Dungeon): SaveFile {
  return { app: 'mage-puzzle-dungeon', version: 3, rooms: dungeon.catalog.all(), board: dungeon.list() };
}

/**
 * Load a save into the live catalogue and board. Everything is validated
 * first; on error nothing changes.
 */
export function applySaveFile(dungeon: Dungeon, data: unknown): Result<SaveFile> {
  const file = data as Partial<SaveFile> | null;
  if (file?.app !== 'mage-puzzle-dungeon' || file.version !== 3) return fail('This is not a Mage Puzzle Dungeon save file');

  const rooms = RoomCatalog.check(file.rooms ?? []);
  if (!rooms.ok) return fail(rooms.error);
  const staged = new Dungeon(dungeon.board, new RoomCatalog([...rooms.value.values()]), false);
  const board = staged.check(file.board ?? []);
  if (!board.ok) return fail(board.error);

  dungeon.catalog.replaceAll([...rooms.value.values()]);
  dungeon.load(file.board ?? []);
  return ok(toSaveFile(dungeon));
}

/** Save in this browser. Storage can be unavailable (private mode). */
export function saveLocal(file: SaveFile): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
    return true;
  } catch {
    return false;
  }
}

export function loadLocal(): unknown {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}
