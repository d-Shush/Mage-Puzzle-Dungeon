import { SIDES, coordKey, hexDistance, neighbour } from './hex';
import type { SlotDefinition } from './types';

/** The fixed board layout: validated lookup of slots by id or position. */
export class Board {
  private readonly byId = new Map<string, SlotDefinition>();
  private readonly byCoord = new Map<string, SlotDefinition>();

  constructor(slots: readonly SlotDefinition[]) {
    for (const slot of slots) {
      if ((slot.coord.q + slot.coord.r) % 2 !== 0) {
        throw new Error(`Slot ${slot.id}: q + r must be even`);
      }
      if (this.byId.has(slot.id)) throw new Error(`Duplicate slot id ${slot.id}`);
      if (this.byCoord.has(coordKey(slot.coord))) throw new Error(`Slot ${slot.id}: position already used`);
      this.byId.set(slot.id, slot);
      this.byCoord.set(coordKey(slot.coord), slot);
    }
  }

  all(): SlotDefinition[] {
    return [...this.byId.values()];
  }

  get(id: string): SlotDefinition | undefined {
    return this.byId.get(id);
  }

  /** Slots sharing an edge with the given slot. */
  neighbours(id: string): SlotDefinition[] {
    const slot = this.byId.get(id);
    if (!slot) return [];
    return SIDES.map((s) => this.byCoord.get(coordKey(neighbour(slot.coord, s)))).filter(
      (s): s is SlotDefinition => s !== undefined,
    );
  }

  distance(a: string, b: string): number {
    const sa = this.byId.get(a);
    const sb = this.byId.get(b);
    if (!sa || !sb) return Infinity;
    return hexDistance(sa.coord, sb.coord);
  }
}
