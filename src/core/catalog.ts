import { SIDES } from './hex';
import type { RoomDefinition } from './types';

/** Lookup wrapper around the fixed room list; validates it on construction. */
export class RoomCatalog {
  private readonly byId = new Map<number, RoomDefinition>();

  constructor(definitions: readonly RoomDefinition[]) {
    for (const def of definitions) {
      if (!Number.isInteger(def.id) || def.id <= 0) {
        throw new Error(`Room "${def.name}": id must be a positive integer`);
      }
      if (this.byId.has(def.id)) throw new Error(`Duplicate room id ${def.id}`);
      if (def.doors.some((d) => !SIDES.includes(d))) throw new Error(`Room ${def.id}: unknown door side`);
      if (new Set(def.doors).size !== def.doors.length) throw new Error(`Room ${def.id}: duplicate door side`);
      if (def.maxCopies !== undefined && (!Number.isInteger(def.maxCopies) || def.maxCopies < 1)) {
        throw new Error(`Room ${def.id}: maxCopies must be a positive integer`);
      }
      this.byId.set(def.id, def);
    }
  }

  get(id: number): RoomDefinition | undefined {
    return this.byId.get(id);
  }

  all(): RoomDefinition[] {
    return [...this.byId.values()].sort((a, b) => a.id - b.id);
  }
}
