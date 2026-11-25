import type { SlotDefinition } from '../core/types';

/**
 * Board layout, matching the reference picture: a 5 × 7 grid of slots,
 * columns A–E from the left and rows 1–7 from the top, so "A1" is the top
 * left slot and "E7" the bottom right one.
 *
 * C4, the middle of the grid, holds the dark core orb and never takes a room.
 * Two landmarks sit outside the grid: Shaper's Library above C1 and the
 * Unknown below C7. They never take a room, but the party can stand there.
 */
const COLUMNS = 'ABCDE';
const ROWS = 7;
const CORE = 'C4';

function buildSlots(): SlotDefinition[] {
  const slots: SlotDefinition[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLUMNS.length; col++) {
      const id = `${COLUMNS[col]}${row + 1}`;
      slots.push({ id, coord: { col, row }, kind: id === CORE ? 'core' : 'slot' });
    }
  }
  const middle = Math.floor(COLUMNS.length / 2);
  slots.push(
    { id: 'LIBRARY', name: "Shaper's Library", coord: { col: middle, row: -1 }, kind: 'landmark' },
    { id: 'UNKNOWN', name: 'Unknown', coord: { col: middle, row: ROWS }, kind: 'landmark' },
  );
  return slots;
}

export const BOARD_SLOTS: readonly SlotDefinition[] = buildSlots();
