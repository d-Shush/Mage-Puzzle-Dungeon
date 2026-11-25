import type { Door, GridPos, RoomDefinition, Rotation, Side } from './types';

const SIDES: readonly Side[] = ['north', 'east', 'south', 'west'];

export const SIDE_OFFSETS: Readonly<Record<Side, GridPos>> = {
  north: { x: 0, z: -1 },
  east: { x: 1, z: 0 },
  south: { x: 0, z: 1 },
  west: { x: -1, z: 0 },
};

export const cellKey = (p: GridPos): string => `${p.x},${p.z}`;

export const nextRotation = (r: Rotation): Rotation => ((r + 90) % 360) as Rotation;

/** Rotate a cell clockwise (viewed from above) around the origin. */
export function rotateCell(p: GridPos, rotation: Rotation): GridPos {
  switch (rotation) {
    case 0:
      return { x: p.x, z: p.z };
    case 90:
      return { x: -p.z, z: p.x };
    case 180:
      return { x: -p.x, z: -p.z };
    case 270:
      return { x: p.z, z: -p.x };
  }
}

export function rotateSide(side: Side, rotation: Rotation): Side {
  const idx = SIDES.indexOf(side);
  return SIDES[(idx + rotation / 90) % 4] as Side;
}

/** World-space cells occupied by a room at the given position / rotation. */
export function worldCells(def: RoomDefinition, position: GridPos, rotation: Rotation): GridPos[] {
  return def.footprint.map((c) => {
    const r = rotateCell(c, rotation);
    return { x: r.x + position.x, z: r.z + position.z };
  });
}

/** World-space doors of a room at the given position / rotation. */
export function worldDoors(def: RoomDefinition, position: GridPos, rotation: Rotation): Door[] {
  return def.doors.map((d) => {
    const r = rotateCell(d.cell, rotation);
    return {
      cell: { x: r.x + position.x, z: r.z + position.z },
      side: rotateSide(d.side, rotation),
    };
  });
}
