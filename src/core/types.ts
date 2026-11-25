/**
 * Domain types for the dungeon map. Nothing in `core/` depends on Three.js or
 * the DOM, so the rules can be unit-tested and reused (e.g. a future server).
 *
 * Coordinate system: an integer grid on the ground plane. `x` grows east,
 * `z` grows south (matches Three.js with the camera looking down -Y).
 * One grid cell = one map tile (e.g. 5 ft / 10 ft — pick per campaign).
 */

/** How the players / DM may manipulate a placed room. */
export type Mobility = 'fixed' | 'rotatable' | 'movable';

/** Rotation in clockwise quarter turns, viewed from above. */
export type Rotation = 0 | 90 | 180 | 270;

export type Side = 'north' | 'east' | 'south' | 'west';

export interface GridPos {
  readonly x: number;
  readonly z: number;
}

export interface Door {
  /** Cell of the footprint (unrotated, relative to the room origin). */
  readonly cell: GridPos;
  /** Wall of that cell the door sits in (unrotated). */
  readonly side: Side;
}

/** A room template from the fixed catalogue. Selected by its number. */
export interface RoomDefinition {
  /** The number the DM types in to add this room. Unique. */
  readonly id: number;
  readonly name: string;
  readonly description: string;
  readonly mobility: Mobility;
  /** Cells occupied by the room, relative to its origin (0,0). */
  readonly footprint: readonly GridPos[];
  readonly doors: readonly Door[];
  /** Floor colour, any CSS colour string. */
  readonly color: string;
  /** Wall height in grid units. Defaults to 1. */
  readonly wallHeight?: number;
}

/** A room placed on the map. */
export interface RoomInstance {
  readonly instanceId: string;
  readonly definitionId: number;
  readonly position: GridPos;
  readonly rotation: Rotation;
}

/** Serializable snapshot of the whole map (for saving / loading sessions). */
export interface DungeonSnapshot {
  readonly version: 1;
  readonly rooms: readonly RoomInstance[];
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
