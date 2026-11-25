import type { Dungeon } from '../core/dungeon';
import { ROOM_TYPES, exitName } from '../core/roomTypes';
import type { RoomDefinition } from '../core/types';
import { button, h } from './dom';

export interface PanelActions {
  rotate(direction: 1 | -1): void;
  toggleMove(): void;
  removeFromBoard(): void;
  deselect(): void;
  newRoom(): void;
  editRoom(id: number): void;
  locateRoom(id: number): void;
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
}

/** Side panel: selected room, the room list, and file actions. */
export class ControlPanel {
  private readonly status = h('p', { className: 'status', role: 'status' });
  private readonly selection = h('section', { className: 'selection' });
  private readonly roomList = h('ul', { className: 'room-list' });
  private readonly roomCount = h('span', { className: 'muted' });
  private readonly partySection = h('section', { className: 'party' });
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
      h('div', { className: 'section-head' }, h('h2', {}, 'Rooms ', this.roomCount), button('+ New room', () => actions.newRoom(), 'primary')),
      this.roomList,
      h('h2', { textContent: 'Save' }),
      h('p', { className: 'hint', textContent: 'Rooms and the board are saved automatically in this browser.' }),
      h(
        'div',
        { className: 'row' },
        button('Export file', () => actions.exportFile()),
        button('Import file', () => fileInput.click()),
        button('Clear board', () => actions.clearBoard()),
        fileInput,
      ),
      h('p', { className: 'hint', textContent: 'Keys: R / Shift+R rotate · M move · P move party · Delete take off board · Esc cancel' }),
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
    const slot = slotId ? this.dungeon.board.get(slotId) : undefined;
    let where = 'Not on the map';
    if (slotId && room) where = `In ${slotId}, ${this.dungeon.definitionOf(room).name}`;
    else if (slot?.kind === 'core') where = `At the prismatic core (${slotId})`;
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

    this.selection.replaceChildren(
      h('div', { className: 'selection-head' }, h('h2', { textContent: `#${def.id} ${def.name}` }), this.typeBadge(def)),
      h('p', { className: 'muted', textContent: `${rules.summary} · Slot ${room.slotId} · turned ${room.rotation * 60}°` }),
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
    this.roomCount.textContent = rooms.length ? `${placed}/${rooms.length} placed` : '';

    if (rooms.length === 0) {
      this.roomList.replaceChildren(
        h('li', { className: 'empty-state' }, h('p', { textContent: 'No rooms yet. Create your first room, then click an empty slot to place it.' })),
      );
      return;
    }
    this.roomList.replaceChildren(
      ...rooms.map((def) => {
        const where = this.dungeon.placementOf(def.id);
        const locate = h(
          'button',
          { type: 'button', className: 'room-row-main', title: def.description || def.name },
          h('span', { className: 'room-num', textContent: String(def.id) }),
          h('span', { className: 'room-row-name', textContent: def.name }),
          this.typeBadge(def),
          h('span', { className: 'room-where', textContent: where ? where.slotId : 'not placed' }),
        );
        locate.addEventListener('click', () => this.actions.locateRoom(def.id));
        return h(
          'li',
          { className: where ? 'is-placed' : '' },
          locate,
          button('Edit', () => this.actions.editRoom(def.id), 'small'),
        );
      }),
    );
  }
}
