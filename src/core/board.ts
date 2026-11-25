import { SIDES, coordKey, gridDistance, neighbour } from './grid';
import type { SlotDefinition } from './types';

/** The fixed board layout: validated lookup of slots by id or position. */
export class Board {
  private readonly byId = new Map<string, SlotDefinition>();
  private readonly byCoord = new Map<string, SlotDefinition>();

  constructor(slots: readonly SlotDefinition[]) {
    for (const slot of slots) {
      if (!Number.isInteger(slot.coord.col) || !Number.isInteger(slot.coord.row)) {
        throw new Error(`Slot ${slot.id}: position must be whole numbers`);
      }
      if (this.byId.has(slot.id)) throw new Error(`Duplicate slot id ${slot.id}`);
      if (this.byCoord.has(coordKey(slot.coord))) throw new Error(`Slot ${slot.id}: position already used`);
      if (slot.kind === 'landmark' && !slot.name) throw new Error(`Landmark ${slot.id} needs a name`);
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

  /** How to name a slot in messages: landmarks by name, grid slots by label. */
  describe(id: string): string {
    const slot = this.byId.get(id);
    return slot?.name ?? id;
  }

  /** Slots sharing a side with the given slot. */
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
    return gridDistance(sa.coord, sb.coord);
  }
}
