/**
 * Domain types for the dungeon board. Nothing in `core/` touches the DOM, so
 * the rules can be unit-tested and reused.
 *
 * The board is a square grid: `col` grows east (A, B, C…), `row` grows south
 * (1, 2, 3…). Neighbours share a side: north, east, south or west.
 */

export interface GridCoord {
  readonly col: number;
  readonly row: number;
}

/** The four sides of a square slot, clockwise from the top. */
export type Side = 'n' | 'e' | 's' | 'w';

/** Rotation in clockwise 90° steps: 0 = 0°, 1 = 90°, 2 = 180°, 3 = 270°. */
export type Rotation = 0 | 1 | 2 | 3;

/**
 * What can be done with a room once it is on the board:
 * - red:       cannot move or rotate
 * - gold:      cannot move or rotate (like red, different colour)
 * - blue:      can rotate, cannot move
 * - prismatic: cannot move or rotate; special rooms such as Shaper's Library
 */
export type RoomType = 'red' | 'gold' | 'blue' | 'prismatic';

export interface SlotDefinition {
  /** Stable id, also used as the visible label (e.g. "D3"). */
  readonly id: string;
  readonly coord: GridCoord;
}

/** What the DM fills in when creating or editing a room. */
export interface RoomInput {
  readonly name: string;
  /** Read-aloud / handout text for the players. */
  readonly description: string;
  readonly type: RoomType;
  /** Edges with an exit, before rotation. */
  readonly doors: readonly Side[];
  /** Optional picture drawn instead of the coloured tile: a small data: URL (PNG, JPEG, WebP or GIF). */
  readonly image?: string;
}

/** A room in the catalogue. Each room can be on the board once. */
export interface RoomDefinition extends RoomInput {
  /** The room's number, assigned on creation. Unique, positive integer. */
  readonly id: number;
}

/** A room placed in a slot. Instances are immutable; changes replace them. */
export interface RoomInstance {
  readonly instanceId: string;
  readonly definitionId: number;
  readonly slotId: string;
  readonly rotation: Rotation;
}

/** Everything the app keeps: the room catalogue and the board. */
export interface SaveFile {
  readonly app: 'mage-puzzle-dungeon';
  readonly version: 5;
  readonly rooms: readonly RoomDefinition[];
  readonly board: readonly RoomInstance[];
  /** Slot of the party marker; absent or null when it is not on the board. */
  readonly party?: string | null;
  /** Unique stamp written by cloud sync each time this file is uploaded. */
  readonly revision?: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T>(error: string): Result<T> => ({ ok: false, error });
