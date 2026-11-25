import { RoomCatalog } from './catalog';
import { Dungeon } from './dungeon';
import { SIDES } from './grid';
import { fail, ok, type Result, type RoomDefinition, type SaveFile, type Side } from './types';

const STORAGE_KEY = 'mage-puzzle-dungeon:v3'; // key kept so hex-board saves are found and converted

export function toSaveFile(dungeon: Dungeon): SaveFile {
  return {
    app: 'mage-puzzle-dungeon',
    version: 5,
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

type AnySave = Partial<Omit<SaveFile, 'version'>> & { version?: number };

/** Version 3 was the hex board: keep rooms, map exits to four sides, clear the board. */
function fromHex(file: AnySave): { file: AnySave; notice: string } {
  const rooms = (Array.isArray(file.rooms) ? file.rooms : []).map((r: RoomDefinition) => {
    const doors = new Set((Array.isArray(r?.doors) ? r.doors : []).map((d) => HEX_TO_SQUARE[d as string]).filter(Boolean));
    return { ...r, doors: SIDES.filter((s) => doors.has(s)) };
  });
  const hadPlacements = (Array.isArray(file.board) && file.board.length > 0) || !!file.party;
  return {
    file: { app: 'mage-puzzle-dungeon', version: 4, rooms, board: [], party: null },
    notice: hadPlacements
      ? 'Converted from the hex board: rooms kept (NE/SE exits became East, NW/SW became West). Place them on the new grid again.'
      : 'Converted from the hex board: NE/SE exits became East, NW/SW became West.',
  };
}

/**
 * Version 4 had a fixed core at C4 and two fixed landmarks outside the grid.
 * Now C4 is an ordinary slot and the landmarks are prismatic rooms in slots
 * C0 and C8; a party standing on a landmark moves onto its room.
 */
function fromRoundGrid(file: AnySave): { file: AnySave; notice: string } {
  const rooms = [...(Array.isArray(file.rooms) ? file.rooms : [])];
  const board = [...(Array.isArray(file.board) ? file.board : [])];
  let nextId = 1 + Math.max(0, ...rooms.map((r) => Number(r?.id) || 0));
  let nextInstance = 1 + Math.max(0, ...board.map((b) => Number(String(b?.instanceId).replace(/\D/g, '')) || 0));
  const add = (name: string, slotId: string, doors: Side[]) => {
    const id = nextId++;
    rooms.push({ id, name, description: '', type: 'prismatic', doors });
    board.push({ instanceId: `room-${nextInstance++}`, definitionId: id, slotId, rotation: 0 });
  };
  add("Shaper's Library", 'C0', ['s']);
  add('Unknown', 'C8', ['n']);
  const party = file.party === 'LIBRARY' ? 'C0' : file.party === 'UNKNOWN' ? 'C8' : file.party === 'C4' ? null : file.party;
  return {
    file: { ...file, version: 5, rooms, board, party: party ?? null },
    notice: "Shaper's Library and Unknown are now prismatic rooms you can edit, and C4 is an ordinary slot.",
  };
}

/** The green type (rotate and move) was removed: green rooms become blue, which still rotate. */
function withoutGreen(file: AnySave): { file: AnySave; notice?: string } {
  if (!Array.isArray(file.rooms)) return { file };
  let n = 0;
  const rooms = file.rooms.map((r) => ((r as { type?: string })?.type === 'green' ? (n++, { ...r, type: 'blue' as const }) : r));
  if (!n) return { file };
  return {
    file: { ...file, rooms },
    notice: `The green room type was removed: ${n} green room${n === 1 ? ' is' : 's are'} now blue (they can still rotate).`,
  };
}

/** Bring an older save up to the current format, one version at a time. */
function upgrade(data: unknown): Result<LoadedSave> {
  let file = data as AnySave | null;
  if (file?.app !== 'mage-puzzle-dungeon') return fail('This is not a Mage Puzzle Dungeon save file');
  if (![3, 4, 5].includes(file.version ?? 0)) return fail('This save file is from an unknown version of the app');
  const notices: string[] = [];
  if (file.version === 3) {
    const r = fromHex(file);
    file = r.file;
    notices.push(r.notice);
  }
  if (file.version === 4) {
    const r = fromRoundGrid(file);
    file = r.file;
    notices.push(r.notice);
  }
  const g = withoutGreen(file);
  file = g.file;
  if (g.notice) notices.push(g.notice);
  return ok({ file: file as SaveFile, notice: notices.length ? notices.join(' ') : undefined });
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
