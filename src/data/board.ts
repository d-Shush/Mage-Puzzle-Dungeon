import type { SlotDefinition } from '../core/types';

/**
 * Board layout, matching the reference picture: seven columns of flat-top
 * hexes holding 3-4-5-6-5-4-3 slots (30 in total), forming a large hexagon
 * with a point at the top and bottom.
 */
const COLUMN_SIZES = [3, 4, 5, 6, 5, 4, 3] as const;

/** The prismatic core, in the middle column, fourth from the top. */
const CORE = { q: 0, r: 0 };

/**
 * Labels: a letter per half-row from the top (A = top point … K = bottom
 * point) and the column number 1–7 from the left. So "A4" is the top slot,
 * "D1" the top of the left edge, and the core is "G4".
 */
function label(q: number, r: number): string {
  const row = String.fromCharCode('A'.charCodeAt(0) + r + 6);
  return `${row}${q + 4}`;
}

function buildSlots(): SlotDefinition[] {
  const slots: SlotDefinition[] = [];
  COLUMN_SIZES.forEach((size, col) => {
    const q = col - (COLUMN_SIZES.length - 1) / 2;
    for (let i = 0; i < size; i++) {
      // Every column is centred on r = -1 (one half-row above the core).
      const r = -1 + 2 * i - (size - 1);
      const isCore = q === CORE.q && r === CORE.r;
      slots.push({ id: label(q, r), coord: { q, r }, kind: isCore ? 'core' : 'slot' });
    }
  });
  return slots;
}

export const BOARD_SLOTS: readonly SlotDefinition[] = buildSlots();
