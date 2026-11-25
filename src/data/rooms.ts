import type { GridPos, RoomDefinition } from '../core/types';

/** Helper: rectangular footprint of w × d cells starting at the origin. */
function rect(w: number, d: number): GridPos[] {
  const cells: GridPos[] = [];
  for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) cells.push({ x, z });
  return cells;
}

/**
 * The fixed room catalogue. The DM adds a room by typing its `id`.
 *
 * PLACEHOLDER CONTENT — replace with the real campaign rooms.
 * Footprints are relative to the room origin; rotation happens around (0,0).
 */
export const ROOM_CATALOG: readonly RoomDefinition[] = [
  {
    id: 1,
    name: 'Entrance Hall',
    description: 'Where the party enters the dungeon.',
    mobility: 'fixed',
    footprint: rect(3, 3),
    doors: [
      { cell: { x: 1, z: 2 }, side: 'south' },
      { cell: { x: 1, z: 0 }, side: 'north' },
    ],
    color: '#5b5f6b',
  },
  {
    id: 2,
    name: 'Corridor',
    description: 'A narrow straight passage.',
    mobility: 'movable',
    footprint: rect(1, 3),
    doors: [
      { cell: { x: 0, z: 0 }, side: 'north' },
      { cell: { x: 0, z: 2 }, side: 'south' },
    ],
    color: '#6b5b4b',
  },
  {
    id: 3,
    name: 'Rotating Junction',
    description: 'A T-shaped chamber on a great turntable.',
    mobility: 'rotatable',
    footprint: [
      { x: -1, z: 0 },
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 0, z: 1 },
    ],
    doors: [
      { cell: { x: -1, z: 0 }, side: 'west' },
      { cell: { x: 1, z: 0 }, side: 'east' },
      { cell: { x: 0, z: 1 }, side: 'south' },
    ],
    color: '#4b6b8a',
  },
  {
    id: 4,
    name: 'L-Bend',
    description: 'A corridor that turns a corner.',
    mobility: 'movable',
    footprint: [
      { x: 0, z: 0 },
      { x: 0, z: 1 },
      { x: 1, z: 1 },
    ],
    doors: [
      { cell: { x: 0, z: 0 }, side: 'north' },
      { cell: { x: 1, z: 1 }, side: 'east' },
    ],
    color: '#6b4b6b',
  },
  {
    id: 5,
    name: 'Arcane Vault',
    description: 'A sealed treasure room humming with magic.',
    mobility: 'fixed',
    footprint: rect(2, 2),
    doors: [{ cell: { x: 0, z: 1 }, side: 'south' }],
    color: '#8a6b2b',
    wallHeight: 1.5,
  },
  {
    id: 6,
    name: 'Mirror Room',
    description: 'A square room that can be turned to redirect beams of light.',
    mobility: 'rotatable',
    footprint: [
      { x: -1, z: -1 },
      { x: 0, z: -1 },
      { x: 1, z: -1 },
      { x: -1, z: 0 },
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: -1, z: 1 },
      { x: 0, z: 1 },
      { x: 1, z: 1 },
    ],
    doors: [
      { cell: { x: 0, z: -1 }, side: 'north' },
      { cell: { x: 1, z: 0 }, side: 'east' },
    ],
    color: '#3b7a6b',
  },
];
