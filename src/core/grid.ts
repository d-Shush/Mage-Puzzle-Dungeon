import type { GridCoord, Rotation, Side } from './types';

/** Sides in clockwise order starting at the top. */
export const SIDES: readonly Side[] = ['n', 'e', 's', 'w'];

/** Neighbour offset through each side. */
export const SIDE_OFFSETS: Readonly<Record<Side, GridCoord>> = {
  n: { col: 0, row: -1 },
  e: { col: 1, row: 0 },
  s: { col: 0, row: 1 },
  w: { col: -1, row: 0 },
};

export const coordKey = (c: GridCoord): string => `${c.col},${c.row}`;

export const neighbour = (c: GridCoord, side: Side): GridCoord => {
  const o = SIDE_OFFSETS[side];
  return { col: c.col + o.col, row: c.row + o.row };
};

/** Rotate by `steps` × 90° (negative = counter-clockwise). */
export function addRotation(r: Rotation, steps: number): Rotation {
  return ((((r + steps) % 4) + 4) % 4) as Rotation;
}

export function rotateSide(side: Side, rotation: Rotation): Side {
  return SIDES[(SIDES.indexOf(side) + rotation) % 4] as Side;
}

/** Steps between two slots, moving only north/east/south/west. */
export const gridDistance = (a: GridCoord, b: GridCoord): number => Math.abs(a.col - b.col) + Math.abs(a.row - b.row);

/** Angle (degrees, SVG y-down, clockwise) from a slot's centre towards a side. */
export const sideAngle = (side: Side): number => -90 + 90 * SIDES.indexOf(side);
