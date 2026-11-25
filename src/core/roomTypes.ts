import type { RoomType, Side } from './types';

export interface RoomTypeRules {
  readonly canRotate: boolean;
  readonly canMove: boolean;
  readonly label: string;
  /** One-line explanation shown in the editor and panel. */
  readonly summary: string;
  /** Floor colour of rooms of this type on the board. */
  readonly color: string;
}

/** Single source of truth for what each room type allows and how it looks. */
export const ROOM_TYPES: Readonly<Record<RoomType, RoomTypeRules>> = {
  red: { canRotate: false, canMove: false, label: 'Red', summary: 'Cannot move or rotate', color: '#8c2a35' },
  gold: { canRotate: false, canMove: false, label: 'Gold', summary: 'Cannot move or rotate', color: '#a8781a' },
  blue: { canRotate: true, canMove: false, label: 'Blue', summary: 'Can rotate, cannot move', color: '#2a5490' },
  prismatic: {
    canRotate: false,
    canMove: false,
    label: 'Prismatic',
    summary: 'Cannot move or rotate. For special rooms',
    // Drawn with a rainbow gradient; this colour is only a fallback.
    color: '#9b7bff',
  },
};

export const ROOM_TYPE_ORDER: readonly RoomType[] = ['red', 'gold', 'blue', 'prismatic'];

/** True when some room type may move (none does at the moment). */
export const ANY_TYPE_MOVES = Object.values(ROOM_TYPES).some((t) => t.canMove);

/**
 * Where a movable room may move:
 * - 'any'      — any empty slot on the board
 * - 'adjacent' — only an empty slot sharing an edge (sliding-puzzle style)
 */
export const MOVE_RANGE: 'any' | 'adjacent' = 'any';

/** Exit names, in the order the room editor lists them. */
export const EXIT_LABELS: ReadonlyArray<readonly [Side, string]> = [
  ['n', 'North'],
  ['e', 'East'],
  ['s', 'South'],
  ['w', 'West'],
];

export const exitName = (side: Side): string => EXIT_LABELS.find(([s]) => s === side)?.[1] ?? side;
