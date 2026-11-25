import type { Dungeon } from '../core/dungeon';
import { MOBILITY_RULES } from '../core/mobility';
import { button, h } from './dom';

export interface PanelActions {
  rotate(direction: 1 | -1): void;
  toggleMove(): void;
  remove(): void;
  deselect(): void;
  save(): void;
  load(): void;
  clear(): void;
}

export interface PanelState {
  readonly selectedId?: string;
  readonly moving: boolean;
}

/** Side panel: selected room details and actions, catalogue, save/load. */
export class ControlPanel {
  private readonly status = h('p', { className: 'status', role: 'status' });
  private readonly selection = h('section', { className: 'selection' });
  private readonly catalogList = h('ol', { className: 'catalog' });
  private state: PanelState = { moving: false };

  constructor(
    root: HTMLElement,
    private readonly dungeon: Dungeon,
    private readonly actions: PanelActions,
  ) {
    root.replaceChildren(
      h('h1', { textContent: 'Mage Puzzle Dungeon' }),
      h('p', { className: 'hint', textContent: 'Click an empty slot to place a room. Click a room to select it.' }),
      this.status,
      this.selection,
      h('h2', { textContent: 'Room catalogue' }),
      this.catalogList,
      h('h2', { textContent: 'Board' }),
      h(
        'div',
        { className: 'row' },
        button('Save', () => actions.save()),
        button('Load', () => actions.load()),
        button('Clear', () => actions.clear()),
      ),
      h('p', { className: 'hint', textContent: 'Keys: R / Shift+R rotate · M move · Delete remove · Esc cancel' }),
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
    this.renderCatalog();
  }

  private renderSelection(): void {
    const room = this.state.selectedId ? this.dungeon.get(this.state.selectedId) : undefined;
    if (!room) {
      this.selection.replaceChildren(h('p', { className: 'muted', textContent: 'No room selected' }));
      return;
    }
    const def = this.dungeon.definitionOf(room);
    const rules = MOBILITY_RULES[def.mobility];

    const ccw = button('⟲ Rotate', () => this.actions.rotate(-1));
    const cw = button('Rotate ⟳', () => this.actions.rotate(1));
    ccw.disabled = cw.disabled = !rules.canRotate;
    const move = button(this.state.moving ? 'Cancel move' : 'Move…', () => this.actions.toggleMove(), this.state.moving ? 'active' : '');
    move.disabled = !rules.canMove;

    this.selection.replaceChildren(
      h(
        'div',
        { className: 'selection-head' },
        h('span', { className: 'swatch' }),
        h('h2', { textContent: `#${def.id} ${def.name}` }),
      ),
      h('p', { className: 'muted', textContent: def.description }),
      h('p', {}, h('span', { className: `badge badge-${def.mobility}`, textContent: `${rules.glyph} ${rules.label}` }), ` Slot ${room.slotId} · ${room.rotation * 60}°`),
      h('div', { className: 'row' }, ccw, cw, move),
      h('div', { className: 'row' }, button('Remove', () => this.actions.remove(), 'danger'), button('Deselect', () => this.actions.deselect())),
    );
    (this.selection.querySelector('.swatch') as HTMLElement).style.background = def.color;
  }

  private renderCatalog(): void {
    this.catalogList.replaceChildren(
      ...this.dungeon.catalog.all().map((def) => {
        const max = def.maxCopies ?? 1;
        const placed = this.dungeon.placedCount(def.id);
        const rules = MOBILITY_RULES[def.mobility];
        return h(
          'li',
          { value: def.id, title: def.description, className: placed >= max ? 'used' : '' },
          h('span', { className: 'room-name', textContent: def.name }),
          h('span', { className: `badge badge-${def.mobility}`, textContent: `${rules.glyph} ${rules.label}` }),
          h('span', { className: 'count', textContent: `${placed}/${max}` }),
        );
      }),
    );
  }
}
