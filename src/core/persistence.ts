import { RoomCatalog } from './catalog';
import { Dungeon } from './dungeon';
import { SIDES } from './grid';
import { fail, ok, type Result, type RoomDefinition, type SaveFile, type Side } from './types';

const STORAGE_KEY = 'mage-puzzle-dungeon:v3'; // key kept so hex-board saves are found and converted

export function toSaveFile(dungeon: Dungeon): SaveFile {
  return {
    app: 'mage-puzzle-dungeon',
    version: 4,
    rooms: dungeon.catalog.all(),
    board: dungeon.list(),
    party: dungeon.party ?? null,
  };
}

/** Exits of the old hex board mapped onto the square grid. */
const HEX_TO_SQUARE: Record<string, Side> = { n: 'n', ne: 'e', se: 'e', s: 's', sw: 'w', nw: 'w' };

export interface LoadedSave {
  readonly file: SaveFile;
  /** Set when an older save was converted, explaining what changed. */
  readonly notice?: string;
}

/**
 * Bring an older save up to the current format. Version 3 was the hex
 * board: its rooms are kept with exits mapped to the four sides, but its
 * slot positions mean nothing on the square grid, so the board is cleared.
 */
function upgrade(data: unknown): Result<LoadedSave> {
  const file = data as (Partial<Omit<SaveFile, 'version'>> & { version?: number }) | null;
  if (file?.app !== 'mage-puzzle-dungeon') return fail('This is not a Mage Puzzle Dungeon save file');
  if (file.version === 4) return ok({ file: file as SaveFile });
  if (file.version !== 3) return fail('This save file is from an unknown version of the app');

  const rooms = (Array.isArray(file.rooms) ? file.rooms : []).map((r: RoomDefinition) => {
    const doors = new Set((Array.isArray(r?.doors) ? r.doors : []).map((d) => HEX_TO_SQUARE[d as string]).filter(Boolean));
    return { ...r, doors: SIDES.filter((s) => doors.has(s)) };
  });
  const hadPlacements = (Array.isArray(file.board) && file.board.length > 0) || !!file.party;
  return ok({
    file: { app: 'mage-puzzle-dungeon', version: 4, rooms, board: [], party: null },
    notice: hadPlacements
      ? 'Converted from the hex board: rooms kept (NE/SE exits became East, NW/SW became West). Place them on the new grid again.'
      : 'Converted from the hex board: NE/SE exits became East, NW/SW became West.',
  });
}

/**
 * Load a save into the live catalogue and board. Everything is validated
 * first; on error nothing changes.
 */
export function applySaveFile(dungeon: Dungeon, data: unknown): Result<LoadedSave> {
  const upgraded = upgrade(data);
  if (!upgraded.ok) return upgraded;
  const file = upgraded.value.file;

  const rooms = RoomCatalog.check(file.rooms ?? []);
  if (!rooms.ok) return fail(rooms.error);
  const staged = new Dungeon(dungeon.board, new RoomCatalog([...rooms.value.values()]), false);
  const board = staged.check(file.board ?? []);
  if (!board.ok) return fail(board.error);
  const party = file.party ?? undefined;
  if (party !== undefined && (typeof party !== 'string' || !dungeon.board.get(party))) return fail('Party marker is on an unknown slot');

  dungeon.catalog.replaceAll([...rooms.value.values()]);
  dungeon.load(file.board ?? []);
  dungeon.setParty(party);
  return ok({ file: toSaveFile(dungeon), notice: upgraded.value.notice });
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
