import type { RoomCatalog } from '../core/catalog';
import type { Dungeon } from '../core/dungeon';
import { MOBILITY_RULES } from '../core/mobility';
import { loadLocal, saveLocal } from '../core/persistence';
import type { GridPos, Result } from '../core/types';

type El<K extends keyof HTMLElementTagNameMap> = HTMLElementTagNameMap[K];

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<El<K>> & { className?: string } = {},
  ...children: (Node | string)[]
): El<K> {
  const el = Object.assign(document.createElement(tag), props);
  el.append(...children);
  return el;
}

const ARROW_DELTAS: Record<string, GridPos> = {
  ArrowUp: { x: 0, z: -1 },
  ArrowDown: { x: 0, z: 1 },
  ArrowLeft: { x: -1, z: 0 },
  ArrowRight: { x: 1, z: 0 },
};

/**
 * The side panel: add a room by number, act on the selected room, save/load.
 * All actions call into Dungeon; the panel only reflects its state.
 */
export class ControlPanel {
  private selectedId: string | undefined;
  private onSelect: (id: string | undefined) => void = () => {};

  private readonly status = h('p', { className: 'status' });
  private readonly selection = h('section', { className: 'selection' });

  constructor(
    private readonly root: HTMLElement,
    private readonly dungeon: Dungeon,
    private readonly catalog: RoomCatalog,
  ) {
    this.render();
    dungeon.subscribe(() => {
      if (this.selectedId && !dungeon.get(this.selectedId)) this.select(undefined);
      else this.renderSelection();
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  setSelectHandler(handler: (id: string | undefined) => void): void {
    this.onSelect = handler;
  }

  select(id: string | undefined): void {
    this.selectedId = id;
    this.onSelect(id);
    this.renderSelection();
  }

  private render(): void {
    const input = h('input', { type: 'number', min: '1', placeholder: 'Room #', id: 'room-number' });
    const form = h(
      'form',
      { className: 'add-form' },
      input,
      h('button', { type: 'submit', textContent: 'Add room' }),
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = Number(input.value);
      const res = this.report(this.dungeon.add(n), (r) => `Added #${n} (${this.dungeon.definitionOf(r).name})`);
      if (res.ok) {
        this.select(res.value.instanceId);
        input.value = '';
      }
    });

    const catalogList = h(
      'ol',
      { className: 'catalog' },
      ...this.catalog.all().map((def) =>
        h(
          'li',
          { value: def.id, title: def.description },
          h('span', { className: 'room-name', textContent: def.name }),
          h('span', { className: `badge badge-${def.mobility}`, textContent: MOBILITY_RULES[def.mobility].label }),
        ),
      ),
    );

    const fileActions = h(
      'div',
      { className: 'row' },
      this.button('Save', () => this.setStatus(saveLocal(this.dungeon.toSnapshot()) ? 'Map saved in this browser' : 'Could not save', false)),
      this.button('Load', () => {
        const snap = loadLocal();
        if (!snap) return this.setStatus('No saved map found', true);
        this.report(this.dungeon.loadSnapshot(snap), () => 'Map loaded');
      }),
      this.button('Clear', () => {
        if (confirm('Remove all rooms from the map?')) this.dungeon.clear();
      }),
    );

    this.root.replaceChildren(
      h('h1', { textContent: 'Mage Puzzle Dungeon' }),
      form,
      this.status,
      this.selection,
      h('h2', { textContent: 'Room catalogue' }),
      catalogList,
      h('h2', { textContent: 'Map' }),
      fileActions,
      h('p', { className: 'hint', textContent: 'Click a room to select it. Arrow keys move, R rotates, Delete removes.' }),
    );
    this.renderSelection();
  }

  private renderSelection(): void {
    const room = this.selectedId ? this.dungeon.get(this.selectedId) : undefined;
    if (!room) {
      this.selection.replaceChildren(h('p', { className: 'muted', textContent: 'No room selected' }));
      return;
    }
    const def = this.dungeon.definitionOf(room);
    const rules = MOBILITY_RULES[def.mobility];
    const moveBtn = (label: string, d: GridPos) => {
      const b = this.button(label, () => this.moveSelected(d));
      b.disabled = !rules.canMove;
      return b;
    };
    const rotate = this.button('Rotate ⟳', () => this.rotateSelected());
    rotate.disabled = !rules.canRotate;

    this.selection.replaceChildren(
      h('h2', { textContent: `#${def.id} ${def.name}` }),
      h('p', { className: 'muted', textContent: def.description }),
      h('p', { textContent: `${rules.label} · at (${room.position.x}, ${room.position.z}) · ${room.rotation}°` }),
      h(
        'div',
        { className: 'row' },
        moveBtn('←', { x: -1, z: 0 }),
        moveBtn('↑', { x: 0, z: -1 }),
        moveBtn('↓', { x: 0, z: 1 }),
        moveBtn('→', { x: 1, z: 0 }),
        rotate,
      ),
      h('div', { className: 'row' }, this.button('Remove', () => this.removeSelected())),
    );
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.selectedId || e.target instanceof HTMLInputElement) return;
    const delta = ARROW_DELTAS[e.key];
    if (delta) {
      e.preventDefault();
      this.moveSelected(delta);
    } else if (e.key === 'r' || e.key === 'R') {
      this.rotateSelected();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      this.removeSelected();
    } else if (e.key === 'Escape') {
      this.select(undefined);
    }
  }

  private moveSelected(d: GridPos): void {
    if (this.selectedId) this.report(this.dungeon.move(this.selectedId, d));
  }

  private rotateSelected(): void {
    if (this.selectedId) this.report(this.dungeon.rotate(this.selectedId));
  }

  private removeSelected(): void {
    if (this.selectedId) this.report(this.dungeon.remove(this.selectedId), () => 'Room removed');
  }

  private report<T>(res: Result<T>, success?: (value: T) => string): Result<T> {
    if (res.ok) this.setStatus(success ? success(res.value) : '', false);
    else this.setStatus(res.error, true);
    return res;
  }

  private setStatus(text: string, isError: boolean): void {
    this.status.textContent = text;
    this.status.classList.toggle('error', isError);
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const b = h('button', { type: 'button', textContent: label });
    b.addEventListener('click', onClick);
    return b;
  }
}
