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

/** How a placed room may be manipulated afterwards. */
export type Mobility = 'fixed' | 'rotatable' | 'movable';

/** `slot` can hold a room; `core` is the permanent prismatic centre. */
export type SlotKind = 'slot' | 'core';

export interface SlotDefinition {
  /** Stable id, also used as the visible label (e.g. "D3"). */
  readonly id: string;
  readonly coord: HexCoord;
  readonly kind: SlotKind;
}

/** A room template from the fixed catalogue, chosen by its number. */
export interface RoomDefinition {
  /** The room's number in the catalogue. Unique, positive integer. */
  readonly id: number;
  readonly name: string;
  readonly description: string;
  readonly mobility: Mobility;
  /** Edges with a doorway, before rotation. */
  readonly doors: readonly Side[];
  /** Floor colour, any CSS colour. */
  readonly color: string;
  /** How many copies may be on the board at once. Defaults to 1. */
  readonly maxCopies?: number;
}

/** A room placed in a slot. Instances are immutable; changes replace them. */
export interface RoomInstance {
  readonly instanceId: string;
  readonly definitionId: number;
  readonly slotId: string;
  readonly rotation: Rotation;
}

/** Serializable state of the board (for saving / loading a session). */
export interface DungeonSnapshot {
  readonly version: 2;
  readonly rooms: readonly RoomInstance[];
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
