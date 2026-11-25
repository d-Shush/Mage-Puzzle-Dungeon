import { MOBILITY_RULES } from '../core/mobility';
import type { RoomDefinition } from '../core/types';
import { h } from './dom';

export interface PickerOption {
  readonly def: RoomDefinition;
  readonly remaining: number;
}

/**
 * Popover listing the rooms that can go into an empty slot. Type a room
 * number and press Enter, or click a room.
 */
export class RoomPicker {
  private readonly el = h('div', { className: 'picker', hidden: true });
  private onClose: () => void = () => {};

  constructor(private readonly host: HTMLElement) {
    host.append(this.el);
    this.el.setAttribute('role', 'dialog');
    document.addEventListener('pointerdown', (e) => {
      if (!this.el.hidden && !this.el.contains(e.target as Node) && !(e.target as Element).closest?.('.slot')) this.close();
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

  open(
    slotId: string,
    anchor: Element,
    options: readonly PickerOption[],
    onPick: (definitionId: number) => void,
    onClose: () => void,
  ): void {
    this.onClose = onClose;
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
              const rules = MOBILITY_RULES[o.def.mobility];
              const item = h(
                'button',
                { type: 'button', className: 'picker-item', title: o.def.description },
                h('span', { className: 'picker-num', textContent: String(o.def.id) }),
                h('span', { className: 'picker-name', textContent: o.def.name }),
                h('span', { className: `badge badge-${o.def.mobility}`, textContent: `${rules.glyph} ${rules.label}` }),
                ...(o.remaining > 1 ? [h('span', { className: 'picker-count', textContent: `×${o.remaining}` })] : []),
              );
              item.addEventListener('click', () => onPick(o.def.id));
              return h('li', {}, item);
            })
          : [h('li', { className: 'muted', textContent: options.length ? 'No matching room' : 'All rooms are placed' })]),
      );
    };
    input.addEventListener('input', renderList);
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

    this.el.replaceChildren(h('h3', { textContent: `Place a room in ${slotId}` }), input, list);
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
