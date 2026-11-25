import type { Dungeon } from '../core/dungeon';
import { ROOM_TYPES } from '../core/roomTypes';
import { roomTileSvg } from '../render/roomTile';
import { button, h } from './dom';
import { Modal } from './modal';

export interface PlaceRoomActions {
  /** A room was chosen: wait for a click on an empty slot. */
  choose(definitionId: number): void;
  editRoom(definitionId: number): void;
  addRoom(): void;
}

/**
 * Lists the rooms that are not on the map yet. Choosing one closes the
 * dialog and lets the DM click an empty slot to put it there.
 */
export class PlaceRoomDialog {
  private readonly modal: Modal;
  private readonly search = h('input', {
    type: 'text',
    className: 'picker-search',
    placeholder: 'Room # or name',
    autocomplete: 'off',
  });
  private readonly list = h('ul', { className: 'place-list' });

  constructor(
    host: HTMLElement,
    private readonly dungeon: Dungeon,
    private readonly actions: PlaceRoomActions,
  ) {
    this.modal = new Modal(host, 'modal place-dialog', 'place-title');
    this.search.setAttribute('aria-label', 'Find a room');
    this.search.addEventListener('input', () => this.renderList());
    this.search.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const found = this.matches();
      const q = this.search.value.trim();
      const pick = found.find((d) => String(d.id) === q) ?? (found.length === 1 ? found[0] : undefined);
      if (pick) this.choose(pick.id);
    });
    dungeon.subscribe(() => {
      if (this.modal.isOpen) this.renderList();
    });
  }

  get isOpen(): boolean {
    return this.modal.isOpen;
  }

  open(): void {
    this.search.value = '';
    this.modal.dialog.replaceChildren(
      h('h2', { id: 'place-title', textContent: 'Place a room' }),
      h('p', { className: 'muted', textContent: 'Pick a room, then click an empty slot on the map.' }),
      this.search,
      this.list,
      h(
        'div',
        { className: 'modal-actions' },
        button('+ Add room', () => {
          this.modal.close();
          this.actions.addRoom();
        }, 'picker-create'),
        h('span', { className: 'spacer' }),
        button('Close', () => this.modal.close()),
      ),
    );
    this.renderList();
    this.modal.show();
    this.search.focus({ preventScroll: true });
  }

  private matches() {
    const q = this.search.value.trim().toLowerCase();
    const rooms = this.dungeon.available();
    if (!q) return rooms;
    return rooms.filter((d) => String(d.id).startsWith(q) || d.name.toLowerCase().includes(q));
  }

  private choose(id: number): void {
    this.modal.close();
    this.actions.choose(id);
  }

  private renderList(): void {
    const found = this.matches();
    if (!found.length) {
      const none = this.dungeon.available().length === 0;
      this.list.replaceChildren(
        h('li', {
          className: 'empty-state',
          textContent: none ? 'Every room is already on the map. Add a new room first.' : 'No matching room',
        }),
      );
      return;
    }
    this.list.replaceChildren(
      ...found.map((def) => {
        const pick = h(
          'button',
          { type: 'button', className: 'room-row-main', title: def.description || def.name },
          roomTileSvg(def, 0, 32),
          h('span', { className: 'room-num', textContent: String(def.id) }),
          h('span', { className: 'room-row-name', textContent: def.name }),
          h('span', { className: `badge badge-${def.type}`, textContent: ROOM_TYPES[def.type].label }),
        );
        pick.addEventListener('click', () => this.choose(def.id));
        return h('li', {}, pick, button('Edit', () => this.actions.editRoom(def.id), 'small'));
      }),
    );
  }
}
