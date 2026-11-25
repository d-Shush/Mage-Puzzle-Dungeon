import type { RoomDefinition } from '../core/types';

/**
 * Rooms built into the app, used only when this browser has no saved data.
 * Normally you create rooms in the app itself ("New room"); they are saved
 * automatically in the browser and can be exported to a file.
 *
 * To ship a fixed set instead, export a file from the app and paste its
 * "rooms" list here, e.g.
 *   { id: 1, name: 'Entrance Hall', description: '…', type: 'red', doors: ['n', 's'] }
 */
export const STARTER_ROOMS: readonly RoomDefinition[] = [];
