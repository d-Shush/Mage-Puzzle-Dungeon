import type { RoomDefinition } from './types';

/** Lookup wrapper around the fixed room list; validates it on construction. */
export class RoomCatalog {
  private readonly byId = new Map<number, RoomDefinition>();

  constructor(definitions: readonly RoomDefinition[]) {
    for (const def of definitions) {
      if (!Number.isInteger(def.id) || def.id <= 0) {
        throw new Error(`Room "${def.name}": id must be a positive integer`);
      }
      if (this.byId.has(def.id)) {
        throw new Error(`Duplicate room id ${def.id}`);
      }
      if (def.footprint.length === 0) {
        throw new Error(`Room ${def.id}: footprint is empty`);
      }
      const cells = new Set(def.footprint.map((c) => `${c.x},${c.z}`));
      if (cells.size !== def.footprint.length) {
        throw new Error(`Room ${def.id}: footprint has duplicate cells`);
      }
      for (const door of def.doors) {
        if (!cells.has(`${door.cell.x},${door.cell.z}`)) {
          throw new Error(`Room ${def.id}: door cell is not part of the footprint`);
        }
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
