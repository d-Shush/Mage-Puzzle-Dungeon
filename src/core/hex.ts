import type { HexCoord, Rotation, Side } from './types';

/** Sides in clockwise order starting at the top edge. */
export const SIDES: readonly Side[] = ['n', 'ne', 'se', 's', 'sw', 'nw'];

/** Neighbour offset through each side, in doubled-height coordinates. */
export const SIDE_OFFSETS: Readonly<Record<Side, HexCoord>> = {
  n: { q: 0, r: -2 },
  ne: { q: 1, r: -1 },
  se: { q: 1, r: 1 },
  s: { q: 0, r: 2 },
  sw: { q: -1, r: 1 },
  nw: { q: -1, r: -1 },
};

export const coordKey = (c: HexCoord): string => `${c.q},${c.r}`;

export const neighbour = (c: HexCoord, side: Side): HexCoord => {
  const o = SIDE_OFFSETS[side];
  return { q: c.q + o.q, r: c.r + o.r };
};

/** Rotate by `steps` × 60° (negative = counter-clockwise). */
export function addRotation(r: Rotation, steps: number): Rotation {
  return ((((r + steps) % 6) + 6) % 6) as Rotation;
}

export function rotateSide(side: Side, rotation: Rotation): Side {
  return SIDES[(SIDES.indexOf(side) + rotation) % 6] as Side;
}

/** Number of steps between two slots. */
export function hexDistance(a: HexCoord, b: HexCoord): number {
  const dq = Math.abs(a.q - b.q);
  const dr = Math.abs(a.r - b.r);
  return dq + Math.max(0, (dr - dq) / 2);
}

/** Angle (degrees, SVG y-down, clockwise) from the hex centre to a side's midpoint. */
export const sideAngle = (side: Side): number => -90 + 60 * SIDES.indexOf(side);

/** Centre of a flat-top hex of circumradius `size`, in pixels. */
export function hexToPixel(c: HexCoord, size: number): { x: number; y: number } {
  return { x: c.q * 1.5 * size, y: (c.r * Math.sqrt(3) * size) / 2 };
}

/** Corner points of a flat-top hexagon around the origin. */
export function hexCorners(size: number): { x: number; y: number }[] {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i;
    return { x: size * Math.cos(a), y: size * Math.sin(a) };
  });
}
