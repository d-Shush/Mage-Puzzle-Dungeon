import type { Dungeon } from '../core/dungeon';
import { ROOM_TYPES, exitName } from '../core/roomTypes';
import type { RoomDefinition, RoomInstance } from '../core/types';
import { roomTileSvg } from '../render/roomTile';
import { button, h } from './dom';
import { Modal } from './modal';

export interface JournalActions {
  /** Close the journal and select the room on the map. */
  showOnMap(definitionId: number): void;
  editRoom(definitionId: number): void;
}

interface Entry {
  readonly def: RoomDefinition;
  readonly room: RoomInstance;
}

/**
 * The DM's room journal: a book listing every room on the board. The left
 * page is the index; the right page shows one room's picture and the text
 * read to the players. Arrow keys turn the pages.
 */
export class RoomJournal {
  private readonly modal: Modal;
  private currentId: number | undefined;

  constructor(
    host: HTMLElement,
    private readonly dungeon: Dungeon,
    private readonly actions: JournalActions,
  ) {
    this.modal = new Modal(host, 'journal', 'journal-title');
    this.modal.dialog.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return;
      if (e.key === 'ArrowRight') this.turn(1);
      else if (e.key === 'ArrowLeft') this.turn(-1);
    });
    dungeon.subscribe(() => {
      if (this.modal.isOpen) this.render();
    });
  }

  get isOpen(): boolean {
    return this.modal.isOpen;
  }

  /** Open the journal, at room `definitionId` if it is on the board. */
  open(definitionId?: number): void {
    if (definitionId !== undefined) this.currentId = definitionId;
    this.modal.show();
    this.render();
    this.modal.dialog.focus({ preventScroll: true });
  }

  close(): void {
    this.modal.close();
  }

  /** Placed rooms, by room number. */
  private entries(): Entry[] {
    return this.dungeon.catalog
      .all()
      .map((def) => ({ def, room: this.dungeon.placementOf(def.id) }))
      .filter((e): e is Entry => e.room !== undefined);
  }

  private turn(step: 1 | -1): void {
    const entries = this.entries();
    const i = entries.findIndex((e) => e.def.id === this.currentId);
    const next = entries[i + step];
    if (!next) return;
    this.currentId = next.def.id;
    this.render();
  }

  private render(): void {
    const entries = this.entries();
    let index = entries.findIndex((e) => e.def.id === this.currentId);
    if (index < 0) index = 0;
    const current = entries[index];
    this.currentId = current?.def.id;

    const close = button('×', () => this.close(), 'journal-close');
    close.setAttribute('aria-label', 'Close journal');

    const total = this.dungeon.catalog.size;
    const left = h(
      'section',
      { className: 'journal-page journal-index' },
      h('h2', { id: 'journal-title', textContent: 'Room Journal' }),
      h('p', { className: 'journal-sub', textContent: `${entries.length} of ${total} room${total === 1 ? '' : 's'} on the map` }),
      entries.length
        ? h(
            'ol',
            { className: 'journal-toc' },
            ...entries.map((e) => {
              const item = h(
                'button',
                { type: 'button', className: 'journal-toc-item' },
                h('span', { className: 'journal-toc-num', textContent: String(e.def.id) }),
                h('span', { className: 'journal-toc-name', textContent: e.def.name }),
                h('span', { className: 'journal-toc-dots', ariaHidden: 'true' }),
                h('span', { className: 'journal-toc-slot', textContent: e.room.slotId }),
              );
              if (e.def.id === this.currentId) item.setAttribute('aria-current', 'page');
              item.addEventListener('click', () => {
                this.currentId = e.def.id;
                this.render();
              });
              return h('li', {}, item);
            }),
          )
        : h('p', { className: 'journal-empty', textContent: 'No rooms on the map yet. Use “Place room” to put one down, and it will be written in here.' }),
    );

    const right = h('section', { className: 'journal-page journal-entry' });
    if (current) right.append(...this.renderEntry(current));
    else right.append(h('p', { className: 'journal-empty', textContent: 'The pages are blank…' }));

    const prev = button('‹ Previous', () => this.turn(-1), 'journal-turn');
    const next = button('Next ›', () => this.turn(1), 'journal-turn');
    prev.disabled = index <= 0;
    next.disabled = index >= entries.length - 1;

    this.modal.dialog.replaceChildren(
      close,
      h('div', { className: 'journal-spread' }, left, h('div', { className: 'journal-spine', ariaHidden: 'true' }), right),
      h(
        'div',
        { className: 'journal-nav' },
        prev,
        h('span', { className: 'journal-folio', textContent: entries.length ? `${index + 1} / ${entries.length}` : '' }),
        next,
      ),
    );
  }

  private renderEntry({ def, room }: Entry): HTMLElement[] {
    const rules = ROOM_TYPES[def.type];
    const picture = def.image
      ? h('img', { className: 'journal-image', src: def.image, alt: `Picture of ${def.name}` })
      : h('div', { className: 'journal-image journal-image-tile' }, roomTileSvg(def, room.rotation, 150));
    return [
      h('div', { className: 'journal-plate' }, picture),
      h(
        'header',
        { className: 'journal-entry-head' },
        h('span', { className: 'journal-entry-num', textContent: `No. ${def.id}` }),
        h('h3', { textContent: def.name }),
        h(
          'p',
          { className: 'journal-meta' },
          h('span', { className: `badge badge-${def.type}`, textContent: rules.label }),
          ` Slot ${room.slotId} · exits: ${def.doors.length ? def.doors.map(exitName).join(', ') : 'none'}`,
        ),
      ),
      def.description
        ? h('p', { className: 'journal-text', textContent: def.description })
        : h('p', { className: 'journal-text journal-text-empty', textContent: 'No description written yet.' }),
      h(
        'div',
        { className: 'journal-actions' },
        button('Show on map', () => {
          this.close();
          this.actions.showOnMap(def.id);
        }),
        button('Edit room', () => this.actions.editRoom(def.id)),
      ),
    ];
  }
}
