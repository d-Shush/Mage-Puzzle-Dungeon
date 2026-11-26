import { ROOM_TYPES } from '../core/roomTypes';
import { roomTileSvg } from '../render/roomTile';
import type { RoomDefinition } from '../core/types';
import { button, h } from './dom';

export interface PickerOption {
  readonly def: RoomDefinition;
  /** Why the room cannot go into this slot; shown greyed out with this note. */
  readonly blocked?: string;
}

export interface PickerHandlers {
  onPick(definitionId: number): void;
  onCreate(): void;
  onClose(): void;
  /** The room under the pointer / keyboard focus / typed number changed (undefined: none). */
  onPreview(definitionId: number | undefined): void;
}

/**
 * Popover listing the rooms that can go into an empty slot. Type a room
 * number and press Enter, click a room, or create a new one.
 */
export class RoomPicker {
  private readonly el = h('div', { className: 'picker', hidden: true });
  private onClose: () => void = () => {};

  constructor(private readonly host: HTMLElement) {
    host.append(this.el);
    this.el.setAttribute('role', 'dialog');
    document.addEventListener('pointerdown', (e) => {
      const t = e.target as Element;
      if (!this.el.hidden && !this.el.contains(t) && !t.closest?.('.slot, .modal-backdrop')) this.close();
    });
    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.close();
      }
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(slotId: string, anchor: Element, options: readonly PickerOption[], handlers: PickerHandlers): void {
    const { onPick, onCreate, onPreview } = handlers;
    this.onClose = () => {
      onPreview(undefined);
      handlers.onClose();
    };
    const input = h('input', {
      type: 'text',
      inputMode: 'numeric',
      placeholder: 'Room # or name',
      className: 'picker-search',
      autocomplete: 'off',
    });
    const list = h('ul', { className: 'picker-list' });

    const matches = (): PickerOption[] => {
      const q = input.value.trim().toLowerCase();
      if (!q) return [...options];
      return options.filter((o) => String(o.def.id).startsWith(q) || o.def.name.toLowerCase().includes(q));
    };
    const renderList = () => {
      const found = matches();
      list.replaceChildren(
        ...(found.length
          ? found.map((o) => {
              const item = h(
                'button',
                {
                  type: 'button',
                  className: o.blocked ? 'picker-item is-blocked' : 'picker-item',
                  title: o.blocked ? `${o.blocked}. ${o.def.description}`.trim() : o.def.description,
                },
                roomTileSvg(o.def, 0, 28),
                h('span', { className: 'picker-num', textContent: String(o.def.id) }),
                h('span', { className: 'picker-name', textContent: o.def.name }),
                h('span', { className: `badge badge-${o.def.type}`, textContent: ROOM_TYPES[o.def.type].label }),
              );
              if (o.blocked) item.setAttribute('aria-description', o.blocked);
              // Blocked rooms stay clickable so the DM sees why placing them is refused.
              item.addEventListener('click', () => onPick(o.def.id));
              item.addEventListener('pointerenter', () => onPreview(o.def.id));
              item.addEventListener('focus', () => onPreview(o.def.id));
              return h('li', {}, item);
            })
          : [
              h('li', {
                className: 'muted picker-empty',
                textContent: options.length ? 'No matching room' : 'No rooms left to place. Create one below.',
              }),
            ]),
      );
    };
    // Preview the room whose number is typed, or the only match.
    const previewTyped = () => {
      const q = input.value.trim();
      const found = matches();
      const typed = options.find((o) => String(o.def.id) === q) ?? (q && found.length === 1 ? found[0] : undefined);
      onPreview(typed?.def.id);
    };
    input.addEventListener('input', () => {
      renderList();
      previewTyped();
    });
    list.addEventListener('pointerleave', previewTyped);
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const q = input.value.trim();
      const exact = options.find((o) => String(o.def.id) === q);
      const found = matches();
      const pick = exact ?? (found.length === 1 ? found[0] : undefined);
      if (pick) onPick(pick.def.id);
    });
    renderList();

    const create = button('+ Create new room', () => {
      this.close();
      onCreate();
    }, 'picker-create');
    this.el.replaceChildren(h('h3', { textContent: `Place a room in ${slotId}` }), input, list, create);
    this.el.hidden = false;
    this.position(anchor);
    input.focus({ preventScroll: true });
  }

  close(): void {
    if (this.el.hidden) return;
    // Drop focus from the hidden search box so board shortcuts work again.
    if (document.activeElement instanceof HTMLElement && this.el.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    this.el.hidden = true;
    this.onClose();
  }

  /** Put the popover beside the slot, inside the host. */
  private position(anchor: Element): void {
    const host = this.host.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    const w = this.el.offsetWidth;
    const hgt = this.el.offsetHeight;
    const gap = 10;
    let left = a.right - host.left + gap;
    if (left + w > host.width - gap) left = a.left - host.left - w - gap;
    left = Math.max(gap, Math.min(left, host.width - w - gap));
    let top = a.top - host.top + a.height / 2 - hgt / 2;
    top = Math.max(gap, Math.min(top, host.height - hgt - gap));
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }
}
