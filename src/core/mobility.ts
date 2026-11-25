import type { Mobility } from './types';

export interface MobilityRules {
  readonly canRotate: boolean;
  readonly canMove: boolean;
  readonly label: string;
  readonly glyph: string;
}

/**
 * Single source of truth for what each mobility type allows.
 * Change here if, for example, movable rooms should also rotate.
 */
export const MOBILITY_RULES: Readonly<Record<Mobility, MobilityRules>> = {
  fixed: { canRotate: false, canMove: false, label: 'Fixed', glyph: '◆' },
  rotatable: { canRotate: true, canMove: false, label: 'Rotates', glyph: '⟳' },
  movable: { canRotate: false, canMove: true, label: 'Movable', glyph: '✥' },
};

/**
 * Where a movable room may go:
 * - 'any'      — any empty slot on the board
 * - 'adjacent' — only an empty slot sharing an edge (sliding-puzzle style)
 */
export const MOVE_RANGE: 'any' | 'adjacent' = 'any';
