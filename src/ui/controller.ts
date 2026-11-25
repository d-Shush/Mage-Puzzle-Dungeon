import type { Dungeon } from '../core/dungeon';
import { loadLocal, saveLocal } from '../core/persistence';
import type { Result } from '../core/types';
import type { BoardView } from '../render/boardView';
import { ControlPanel } from './controlPanel';
import { RoomPicker } from './roomPicker';

/**
 * Interaction state machine: selection, move mode and the room picker.
 * Board and panel only report input here; all changes go through Dungeon.
 */
export class Controller {
  private selectedId: string | undefined;
  private moving = false;
  private pickingSlotId: string | undefined;
  private readonly panel: ControlPanel;
  private readonly picker: RoomPicker;

  constructor(
    private readonly dungeon: Dungeon,
    private readonly view: BoardView,
    panelRoot: HTMLElement,
    pickerHost: HTMLElement,
  ) {
    this.picker = new RoomPicker(pickerHost);
    this.panel = new ControlPanel(panelRoot, dungeon, {
      rotate: (d) => this.rotate(d),
      toggleMove: () => this.toggleMove(),
      remove: () => this.remove(),
      deselect: () => this.select(undefined),
      save: () => this.panel.setStatus(saveLocal(dungeon.toSnapshot()) ? 'Board saved in this browser' : 'Could not save', false),
      load: () => this.load(),
      clear: () => this.clear(),
    });

    view.setSlotClickHandler((slotId, anchor) => this.onSlotClick(slotId, anchor));
    window.addEventListener('keydown', (e) => this.onKey(e));
    dungeon.subscribe(() => {
      if (this.selectedId && !dungeon.get(this.selectedId)) this.select(undefined);
    });
    this.sync();
  }

  private onSlotClick(slotId: string, anchor: Element): void {
    if (this.moving && this.selectedId) {
      if (this.dungeon.moveTargets(this.selectedId).includes(slotId)) {
        const res = this.report(this.dungeon.move(this.selectedId, slotId), (r) => `Moved to ${r.slotId}`);
        if (res.ok) this.moving = false;
        this.sync();
        return;
      }
      this.moving = false; // clicked elsewhere: cancel move, then treat as a normal click
    }

    const room = this.dungeon.roomAt(slotId);
    if (room) {
      this.picker.close();
      this.select(room.instanceId === this.selectedId ? undefined : room.instanceId);
      return;
    }

    const free = this.dungeon.checkSlotFree(slotId);
    if (!free.ok) {
      this.picker.close();
      this.select(undefined);
      this.panel.setStatus(free.error);
      return;
    }
    this.select(undefined);
    this.openPicker(slotId, anchor);
  }

  private openPicker(slotId: string, anchor: Element): void {
    this.pickingSlotId = slotId;
    this.sync();
    const options = this.dungeon.available().map((def) => ({ def, remaining: this.dungeon.remainingCopies(def) }));
    this.picker.open(
      slotId,
      anchor,
      options,
      (definitionId) => {
        const res = this.report(this.dungeon.place(slotId, definitionId), (r) => `Placed ${this.dungeon.definitionOf(r).name} in ${slotId}`);
        if (res.ok) {
          this.picker.close();
          this.select(res.value.instanceId);
        }
      },
      () => {
        this.pickingSlotId = undefined;
        this.sync();
      },
    );
  }

  private select(id: string | undefined): void {
    this.selectedId = id;
    this.moving = false;
    this.sync();
  }

  private rotate(direction: 1 | -1): void {
    if (this.selectedId) this.report(this.dungeon.rotate(this.selectedId, direction));
  }

  private toggleMove(): void {
    if (!this.selectedId) return;
    if (!this.moving && this.dungeon.moveTargets(this.selectedId).length === 0) {
      const room = this.dungeon.get(this.selectedId);
      const name = room ? this.dungeon.definitionOf(room).name : 'This room';
      this.panel.setStatus(`${name} has nowhere to move`, true);
      return;
    }
    this.moving = !this.moving;
    this.panel.setStatus(this.moving ? 'Click a highlighted slot to move the room there' : '');
    this.sync();
  }

  private remove(): void {
    if (this.selectedId) this.report(this.dungeon.remove(this.selectedId), () => 'Room removed');
  }

  /** Two-step clear: the first press arms it, a second press within 4 s clears. */
  private clearArmedUntil = 0;
  private clear(): void {
    if (this.dungeon.list().length === 0) return this.panel.setStatus('The board is already empty');
    if (Date.now() > this.clearArmedUntil) {
      this.clearArmedUntil = Date.now() + 4000;
      this.panel.setStatus('Press Clear again to remove every room', true);
      return;
    }
    this.clearArmedUntil = 0;
    this.dungeon.clear();
    this.select(undefined);
    this.panel.setStatus('Board cleared');
  }

  private load(): void {
    const snap = loadLocal();
    if (!snap) return this.panel.setStatus('No saved board found', true);
    this.select(undefined);
    this.report(this.dungeon.loadSnapshot(snap), () => 'Board loaded');
  }

  private onKey(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || this.picker.isOpen) return;
    if (e.key === 'Escape') {
      if (this.moving) this.toggleMove();
      else this.select(undefined);
      return;
    }
    if (!this.selectedId) return;
    if (e.key === 'r' || e.key === 'R') this.rotate(e.shiftKey ? -1 : 1);
    else if (e.key === 'm' || e.key === 'M') this.toggleMove();
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      this.remove();
    }
  }

  private sync(): void {
    const moveTargets = this.moving && this.selectedId ? this.dungeon.moveTargets(this.selectedId) : undefined;
    this.view.setState({ selectedId: this.selectedId, moveTargets, pickingSlotId: this.pickingSlotId });
    this.panel?.setState({ selectedId: this.selectedId, moving: this.moving });
  }

  private report<T>(res: Result<T>, success?: (value: T) => string): Result<T> {
    if (res.ok) this.panel.setStatus(success ? success(res.value) : '');
    else this.panel.setStatus(res.error, true);
    return res;
  }
}
