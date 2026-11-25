import type { SlotDefinition } from '../core/types';

/**
 * Board layout, matching the reference picture: a 5 × 7 grid of square slots,
 * columns A–E from the left and rows 1–7 from the top, so "A1" is the top
 * left slot and "E7" the bottom right one.
 *
 * Two more slots sit outside the grid in column C: C0 above C1 and C8 below
 * C7. They start with the prismatic rooms Shaper's Library and Unknown
 * (see `starterSave` in rooms.ts), but can hold any room.
 */
const COLUMNS = 'ABCDE';
const ROWS = 7;

function buildSlots(): SlotDefinition[] {
  const slots: SlotDefinition[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLUMNS.length; col++) {
      slots.push({ id: `${COLUMNS[col]}${row + 1}`, coord: { col, row } });
    }
  }
  const c = COLUMNS.indexOf('C');
  slots.push({ id: 'C0', coord: { col: c, row: -1 } }, { id: `C${ROWS + 1}`, coord: { col: c, row: ROWS } });
  return slots;
}

export const BOARD_SLOTS: readonly SlotDefinition[] = buildSlots();
