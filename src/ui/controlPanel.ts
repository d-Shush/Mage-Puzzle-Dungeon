import type { Dungeon } from '../core/dungeon';
import { ANY_TYPE_MOVES, ROOM_TYPES, exitName } from '../core/roomTypes';
import type { RoomDefinition } from '../core/types';
import { roomTileSvg } from '../render/roomTile';
import { button, h } from './dom';

export interface PanelActions {
  rotate(direction: 1 | -1): void;
  toggleMove(): void;
  removeFromBoard(): void;
  deselect(): void;
  newRoom(): void;
  editRoom(id: number): void;
  openJournal(): void;
  /** Open the list of unplaced rooms, or cancel placing one. */
  placeRoom(): void;
  exportFile(): void;
  importFile(file: File): void;
  clearBoard(): void;
  toggleMoveParty(): void;
  removeParty(): void;
}

export interface PanelState {
  readonly selectedId?: string;
  readonly moving: boolean;
  readonly movingParty: boolean;
  /** Room waiting for a click on an empty slot. */
  readonly placingId?: number;
}

/** Side panel: selected room, party, room journal / place / add buttons, and file actions. */
export class ControlPanel {
  private readonly status = h('p', { className: 'status', role: 'status' });
  private readonly selection = h('section', { className: 'selection' });
  private readonly roomsSection = h('section', { className: 'rooms' });
  private readonly partySection = h('section', { className: 'party' });
  /** Filled by the cloud sync panel. */
  readonly syncSlot = h('section', { className: 'sync' });
  private state: PanelState = { moving: false, movingParty: false };

  constructor(
    root: HTMLElement,
    private readonly dungeon: Dungeon,
    private readonly actions: PanelActions,
  ) {
    const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, id: 'import-file' });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) actions.importFile(file);
      fileInput.value = '';
    });

    root.replaceChildren(
      h('h1', { textContent: 'Mage Puzzle Dungeon' }),
      h('p', { className: 'hint', textContent: 'Click an empty slot to place a room. Click a room to select it.' }),
      this.status,
      this.selection,
      this.partySection,
      this.roomsSection,
      h('h2', { textContent: 'Save' }),
      h('p', { className: 'hint', textContent: 'Rooms, the board and the party are saved automatically in this browser.' }),
      h(
        'div',
        { className: 'row' },
        button('Export file', () => actions.exportFile()),
        button('Import file', () => fileInput.click()),
        button('Clear board', () => actions.clearBoard()),
        fileInput,
      ),
      this.syncSlot,
      h('p', { className: 'hint', textContent: 'Keys: R / Shift+R rotate · P move party · Delete take off board · Esc cancel' }),
    );
    dungeon.subscribe(() => this.render());
    this.render();
  }

  setState(state: PanelState): void {
    this.state = state;
    this.render();
  }

  setStatus(text: string, isError = false): void {
    this.status.textContent = text;
    this.status.classList.toggle('error', isError);
  }

  private render(): void {
    this.renderSelection();
    this.renderParty();
    this.renderRooms();
  }

  private renderParty(): void {
    const slotId = this.dungeon.party;
    const room = slotId ? this.dungeon.roomAt(slotId) : undefined;
    let where = 'Not on the map';
    if (slotId && room) where = `In ${slotId}, ${this.dungeon.definitionOf(room).name}`;
    else if (slotId) where = `In ${slotId} (no room there yet)`;

    const move = button(
      this.state.movingParty ? 'Cancel' : slotId ? 'Move party…' : 'Place party…',
      () => this.actions.toggleMoveParty(),
      this.state.movingParty ? 'active' : '',
    );
    const buttons = [move];
    if (slotId && !this.state.movingParty) buttons.push(button('Remove marker', () => this.actions.removeParty()));

    this.partySection.replaceChildren(
      h('div', { className: 'party-head' }, h('span', { className: 'party-dot', ariaHidden: 'true' }), h('h2', { textContent: 'Party' })),
      h('p', { className: 'party-where', textContent: where }),
      h('div', { className: 'row' }, ...buttons),
      ...(slotId ? [h('p', { className: 'hint', textContent: 'You can also drag the marker on the map.' })] : []),
    );
  }

  private typeBadge(def: RoomDefinition): HTMLElement {
    return h('span', { className: `badge badge-${def.type}`, textContent: ROOM_TYPES[def.type].label });
  }

  private renderSelection(): void {
    const room = this.state.selectedId ? this.dungeon.get(this.state.selectedId) : undefined;
    if (!room) {
      this.selection.replaceChildren(h('p', { className: 'muted', textContent: 'No room selected' }));
      return;
    }
    const def = this.dungeon.definitionOf(room);
    const rules = ROOM_TYPES[def.type];

    const ccw = button('⟲ Rotate', () => this.actions.rotate(-1));
    const cw = button('Rotate ⟳', () => this.actions.rotate(1));
    ccw.disabled = cw.disabled = !rules.canRotate;
    const move = button(this.state.moving ? 'Cancel move' : 'Move…', () => this.actions.toggleMove(), this.state.moving ? 'active' : '');
    move.disabled = !rules.canMove;
    move.hidden = !ANY_TYPE_MOVES;

    this.selection.replaceChildren(
      h(
        'div',
        { className: 'selection-top' },
        roomTileSvg(def, room.rotation, 72),
        h(
          'div',
          { className: 'selection-info' },
          h('div', { className: 'selection-head' }, h('h2', { textContent: `#${def.id} ${def.name}` }), this.typeBadge(def)),
          h('p', { className: 'muted', textContent: `${rules.summary} · Slot ${room.slotId} · turned ${room.rotation * 90}°` }),
        ),
      ),
      ...(def.description ? [h('p', { className: 'player-text', textContent: def.description })] : []),
      h('p', { className: 'muted', textContent: `Exits as built: ${def.doors.length ? def.doors.map(exitName).join(', ') : 'none'}` }),
      h('div', { className: 'row' }, ccw, cw, move),
      h(
        'div',
        { className: 'row' },
        button('Edit room', () => this.actions.editRoom(def.id)),
        button('Take off board', () => this.actions.removeFromBoard(), 'danger'),
        button('Deselect', () => this.actions.deselect()),
      ),
    );
  }

  private renderRooms(): void {
    const rooms = this.dungeon.catalog.all();
    const placed = rooms.filter((d) => this.dungeon.placementOf(d.id)).length;
    const unplaced = rooms.length - placed;
    const placing = this.state.placingId !== undefined ? this.dungeon.catalog.get(this.state.placingId) : undefined;

    const journal = h(
      'button',
      { type: 'button', className: 'journal-button' },
      h('span', { className: 'journal-button-cover', ariaHidden: 'true' }),
      h(
        'span',
        { className: 'journal-button-text' },
        h('strong', { textContent: 'Room Journal' }),
        h('span', { textContent: placed ? `${placed} room${placed === 1 ? '' : 's'} on the map` : 'No rooms on the map yet' }),
      ),
    );
    journal.addEventListener('click', () => this.actions.openJournal());

    const place = button(placing ? 'Cancel placing' : 'Place room…', () => this.actions.placeRoom(), placing ? 'active' : '');
    place.title = placing ? '' : unplaced ? `${unplaced} room${unplaced === 1 ? '' : 's'} not on the map` : 'Every room is on the map';

    this.roomsSection.replaceChildren(
      h('div', { className: 'section-head' }, h('h2', { textContent: 'Rooms' }), h('span', { className: 'muted', textContent: rooms.length ? `${placed}/${rooms.length} placed` : '' })),
      journal,
      h('div', { className: 'row rooms-actions' }, place, button('+ Add room', () => this.actions.newRoom(), 'primary')),
      ...(placing ? [h('p', { className: 'hint', textContent: `Click an empty slot to place #${placing.id} ${placing.name}.` })] : []),
    );
  }
}
