import type { RoomDefinition } from '../core/types';

/**
 * The fixed room catalogue. Each room fills one hex slot.
 *
 * PLACEHOLDER CONTENT — replace with the real campaign rooms.
 * Doors are listed by hex edge before rotation: n, ne, se, s, sw, nw.
 */
export const ROOM_CATALOG: readonly RoomDefinition[] = [
  {
    id: 1,
    name: 'Entrance Hall',
    description: 'Where the party enters the dungeon.',
    mobility: 'fixed',
    doors: ['n', 's'],
    color: '#4a4f63',
  },
  {
    id: 2,
    name: 'Corridor',
    description: 'A narrow straight passage.',
    mobility: 'movable',
    doors: ['n', 's'],
    color: '#5c4a3a',
    maxCopies: 3,
  },
  {
    id: 3,
    name: 'Rotating Junction',
    description: 'A three-way chamber on a great turntable.',
    mobility: 'rotatable',
    doors: ['n', 'se', 'sw'],
    color: '#2f4f73',
  },
  {
    id: 4,
    name: 'Bent Passage',
    description: 'A corridor that turns a corner.',
    mobility: 'movable',
    doors: ['n', 'se'],
    color: '#5a3d5c',
    maxCopies: 2,
  },
  {
    id: 5,
    name: 'Arcane Vault',
    description: 'A sealed treasure room humming with magic.',
    mobility: 'fixed',
    doors: ['s'],
    color: '#6e5320',
  },
  {
    id: 6,
    name: 'Mirror Room',
    description: 'Turn it to redirect beams of light from the prism.',
    mobility: 'rotatable',
    doors: ['n', 'ne'],
    color: '#235a50',
  },
  {
    id: 7,
    name: 'Library',
    description: 'Dusty shelves of forbidden tomes.',
    mobility: 'movable',
    doors: ['sw', 'se'],
    color: '#4d3b2a',
  },
  {
    id: 8,
    name: 'Crossroads',
    description: 'Every wall has an exit.',
    mobility: 'rotatable',
    doors: ['n', 'ne', 'se', 's', 'sw', 'nw'],
    color: '#3b3f2a',
  },
];
