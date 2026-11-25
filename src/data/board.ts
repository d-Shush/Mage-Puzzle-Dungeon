import type { SlotDefinition } from '../core/types';

/**
 * Board layout: seven columns of flat-top hexes holding 4-5-6-7-6-5-4 slots
 * (37 in total), a regular hexagon three rings deep around the core, with a
 * point at the top and bottom. Every column is centred on the core, so the
 * board is symmetric in every direction.
 */
const COLUMN_SIZES = [4, 5, 6, 7, 6, 5, 4] as const;

/** The prismatic core, in the exact centre of the board. */
const CORE = { q: 0, r: 0 };

/**
 * Labels: a letter per half-row from the top (A = top point … M = bottom
 * point) and the column number 1–7 from the left. So "A4"
 * is the top slot, "M4" the bottom one, "D1" the top of the left edge, and
 * the core is "G4".
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
      const r = 2 * i - (size - 1);
      const isCore = q === CORE.q && r === CORE.r;
      slots.push({ id: label(q, r), coord: { q, r }, kind: isCore ? 'core' : 'slot' });
    }
  });
  return slots;
}

export const BOARD_SLOTS: readonly SlotDefinition[] = buildSlots();
