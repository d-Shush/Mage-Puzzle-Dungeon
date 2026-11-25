import type { SaveFile } from '../core/types';

/**
 * What a browser starts with when it has no saved data: the two prismatic
 * rooms from the reference art, already in their slots above and below the
 * grid. Everything else is created in the app ("+ Add room").
 *
 * To ship more built-in rooms, export a file from the app and paste its
 * "rooms" and "board" lists here.
 */
export function starterSave(): SaveFile {
  return {
    app: 'mage-puzzle-dungeon',
    version: 5,
    rooms: [
      { id: 1, name: "Shaper's Library", description: '', type: 'prismatic', doors: ['s'] },
      { id: 2, name: 'Unknown', description: '', type: 'prismatic', doors: ['n'] },
    ],
    board: [
      { instanceId: 'room-1', definitionId: 1, slotId: 'C0', rotation: 0 },
      { instanceId: 'room-2', definitionId: 2, slotId: 'C8', rotation: 0 },
    ],
    party: null,
  };
}
