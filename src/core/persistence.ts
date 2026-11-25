import type { DungeonSnapshot } from './types';

const STORAGE_KEY = 'mage-puzzle-dungeon:map';

/** Save the map in this browser. Storage can be unavailable (private mode). */
export function saveLocal(snapshot: DungeonSnapshot): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function loadLocal(): DungeonSnapshot | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DungeonSnapshot) : undefined;
  } catch {
    return undefined;
  }
}
