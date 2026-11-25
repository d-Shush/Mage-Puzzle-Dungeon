/**
 * Domain types for the dungeon board. Nothing in `core/` touches the DOM, so
 * the rules can be unit-tested and reused.
 *
 * The board is a fixed set of flat-top hexagonal slots. Slots use "doubled
 * height" coordinates: `q` is the column (east +), `r` counts half-rows
 * (south +), and `q + r` is always even. Neighbours differ by (0,±2) or (±1,±1).
 */

export interface HexCoord {
  readonly q: number;
  readonly r: number;
}

/** The six edges of a flat-top hexagon, clockwise from the top. */
export type Side = 'n' | 'ne' | 'se' | 's' | 'sw' | 'nw';

/** Rotation in clockwise 60° steps: 0 = 0°, 1 = 60° … 5 = 300°. */
export type Rotation = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * What can be done with a room once it is on the board:
 * - red:   cannot move or rotate
 * - blue:  can rotate, cannot move
 * - green: can rotate and move
 */
export type RoomType = 'red' | 'blue' | 'green';

/** `slot` can hold a room; `core` is the permanent prismatic centre. */
export type SlotKind = 'slot' | 'core';

export interface SlotDefinition {
  /** Stable id, also used as the visible label (e.g. "D3"). */
  readonly id: string;
  readonly coord: HexCoord;
  readonly kind: SlotKind;
}

/** What the DM fills in when creating or editing a room. */
export interface RoomInput {
  readonly name: string;
  /** Read-aloud / handout text for the players. */
  readonly description: string;
  readonly type: RoomType;
  /** Edges with an exit, before rotation. */
  readonly doors: readonly Side[];
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
  readonly version: 3;
  readonly rooms: readonly RoomDefinition[];
  readonly board: readonly RoomInstance[];
  /** Slot of the party marker; absent or null when it is not on the board. */
  readonly party?: string | null;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T>(error: string): Result<T> => ({ ok: false, error });
