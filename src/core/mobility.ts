import type { Mobility } from './types';

export interface MobilityRules {
  readonly canRotate: boolean;
  readonly canMove: boolean;
  readonly label: string;
}

/**
 * Single source of truth for what each mobility type allows.
 * Change here if, for example, movable rooms should also rotate.
 */
export const MOBILITY_RULES: Readonly<Record<Mobility, MobilityRules>> = {
  fixed: { canRotate: false, canMove: false, label: 'Fixed' },
  rotatable: { canRotate: true, canMove: false, label: 'Rotates' },
  movable: { canRotate: false, canMove: true, label: 'Movable' },
};
