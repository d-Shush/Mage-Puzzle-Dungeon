import type { Dungeon } from '../core/dungeon';
import { applySaveFile, loadLocal, saveLocal, toSaveFile } from '../core/persistence';
import { starterSave } from '../data/rooms';
import { fail, ok, type Result, type RoomInput } from '../core/types';
import type { BoardView } from '../render/boardView';
import { ControlPanel } from './controlPanel';
import { RoomEditor } from './roomEditor';
import { RoomPicker } from './roomPicker';

/**
 * Interaction state machine: selection, move mode, placing from the room
 * list, the room picker and the room editor. Board and panel only report
 * input here; every change goes through the catalogue or the Dungeon.
 */
export class Controller {
  private selectedId: string | undefined;
  private moving = false;
  /** Waiting for a click on the slot to move the party marker to. */
  private movingParty = false;
  /** Room chosen in the room list, waiting for a click on an empty slot. */
  private placingDefId: number | undefined;
  private pickingSlotId: string | undefined;
  private clearArmedUntil = 0;
  readonly panel: ControlPanel;
  private readonly picker: RoomPicker;
  private readonly editor: RoomEditor;

  constructor(
    private readonly dungeon: Dungeon,
    private readonly view: BoardView,
    panelRoot: HTMLElement,
    pickerHost: HTMLElement,
  ) {
    this.picker = new RoomPicker(pickerHost);
    this.editor = new RoomEditor(document.body);
    this.panel = new ControlPanel(panelRoot, dungeon, {
      rotate: (d) => this.rotate(d),
      toggleMove: () => this.toggleMove(),
      removeFromBoard: () => this.removeFromBoard(),
      deselect: () => this.select(undefined),
      newRoom: () => this.openEditor(),
      editRoom: (id) => this.openEditor(id),
      locateRoom: (id) => this.locateRoom(id),
      exportFile: () => this.exportFile(),
      importFile: (file) => void this.importFile(file),
      clearBoard: () => this.clearBoard(),
      toggleMoveParty: () => this.toggleMoveParty(),
      removeParty: () => this.report(this.dungeon.setParty(undefined), () => 'Party marker removed'),
    });

    const saved = loadLocal();
    const res = applySaveFile(dungeon, saved ?? starterSave());
    if (!res.ok) {
      this.panel.setStatus(`Saved data could not be loaded: ${res.error}`, true);
      applySaveFile(dungeon, starterSave());
    } else if (res.value.notice) this.panel.setStatus(res.value.notice);

    view.setSlotClickHandler((slotId, anchor) => this.onSlotClick(slotId, anchor));
    view.setPartyHandlers({
      onDrop: (slotId) => this.moveParty(slotId),
      onClick: () => this.toggleMoveParty(),
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
    dungeon.subscribe(() => {
      if (this.selectedId && !dungeon.get(this.selectedId)) this.select(undefined);
      if (this.placingDefId !== undefined && (!dungeon.catalog.get(this.placingDefId) || dungeon.placementOf(this.placingDefId))) {
        this.placingDefId = undefined;
      }
      this.sync();
      if (!saveLocal(toSaveFile(dungeon))) this.panel.setStatus('Could not save in this browser. Use Export file to keep your work.', true);
    });
    this.sync();
  }

  // ---------- board clicks ----------

  private onSlotClick(slotId: string, anchor: Element): void {
    if (this.movingParty) {
      this.moveParty(slotId);
      return;
    }
    if (this.moving && this.selectedId) {
      if (this.dungeon.moveTargets(this.selectedId).includes(slotId)) {
        const res = this.report(this.dungeon.move(this.selectedId, slotId), (r) => `Moved to ${r.slotId}`);
        if (res.ok) this.moving = false;
        this.sync();
        return;
      }
      this.moving = false; // clicked elsewhere: cancel the move, then treat as a normal click
    }

    if (this.placingDefId !== undefined && this.dungeon.checkSlotFree(slotId).ok) {
      const id = this.placingDefId;
      this.placingDefId = undefined;
      this.placeAndSelect(slotId, id);
      return;
    }
    this.placingDefId = undefined;

    const room = this.dungeon.roomAt(slotId);
    if (room) {
      this.picker.close();
      this.select(room.instanceId === this.selectedId ? undefined : room.instanceId);
      return;
    }

    const free = this.dungeon.checkSlotFree(slotId);
    this.select(undefined);
    if (!free.ok) {
      this.picker.close();
      this.panel.setStatus(free.error);
      return;
    }
    this.openPicker(slotId, anchor);
  }

  private openPicker(slotId: string, anchor: Element): void {
    this.pickingSlotId = slotId;
    this.sync();
    this.picker.open(
      slotId,
      anchor,
      this.dungeon.available().map((def) => ({ def })),
      (definitionId) => {
        this.picker.close();
        this.placeAndSelect(slotId, definitionId);
      },
      () => this.openEditor(undefined, slotId),
      () => {
        this.pickingSlotId = undefined;
        this.sync();
      },
    );
  }

  private placeAndSelect(slotId: string, definitionId: number): void {
    const res = this.report(this.dungeon.place(slotId, definitionId), (r) => `Placed ${this.dungeon.definitionOf(r).name} in ${slotId}`);
    if (res.ok) this.select(res.value.instanceId);
    else this.sync();
  }

  // ---------- party ----------

  private moveParty(slotId: string): void {
    this.movingParty = false;
    const moved = this.dungeon.party !== undefined;
    this.report(this.dungeon.setParty(slotId), () => {
      const where = this.dungeon.describeSlot(slotId);
      return moved ? `Party moved to ${where}` : `Party placed at ${where}`;
    });
    this.sync();
  }

  private toggleMoveParty(): void {
    this.movingParty = !this.movingParty;
    if (this.movingParty) {
      this.picker.close();
      this.moving = false;
      this.placingDefId = undefined;
      this.panel.setStatus('Click a slot to move the party there. Esc cancels.');
    } else this.panel.setStatus('');
    this.sync();
  }

  // ---------- room list & editor ----------

  /** Create a room (optionally straight into `placeInSlot`) or edit room `id`. */
  private openEditor(id?: number, placeInSlot?: string): void {
    const room = id !== undefined ? this.dungeon.catalog.get(id) : undefined;
    const placedIn = room ? this.dungeon.placementOf(room.id)?.slotId : undefined;
    this.editor.open({
      room,
      placedIn,
      note: placeInSlot ? `It will be placed in ${placeInSlot}.` : undefined,
      onSave: (input: RoomInput): Result<unknown> => {
        if (room) return this.report(this.dungeon.catalog.update(room.id, input), (d) => `Saved ${d.name}`);
        const res = this.report(this.dungeon.catalog.create(input), (d) => `Created room #${d.id} ${d.name}`);
        if (res.ok && placeInSlot) this.placeAndSelect(placeInSlot, res.value.id);
        return res;
      },
      onDelete: room ? () => this.report(this.dungeon.catalog.remove(room.id), (d) => `Deleted ${d.name}`) : undefined,
    });
  }

  /** From the room list: select a placed room, or arm placing for an unplaced one. */
  private locateRoom(id: number): void {
    const def = this.dungeon.catalog.get(id);
    if (!def) return;
    const where = this.dungeon.placementOf(id);
    if (where) {
      this.select(where.instanceId);
      return;
    }
    this.select(undefined);
    this.placingDefId = id;
    this.panel.setStatus(`Click an empty slot to place ${def.name}. Esc cancels.`);
    this.sync();
  }

  // ---------- selected room ----------

  private select(id: string | undefined): void {
    this.selectedId = id;
    this.moving = false;
    this.movingParty = false;
    this.sync();
  }

  private rotate(direction: 1 | -1): void {
    if (this.selectedId) this.report(this.dungeon.rotate(this.selectedId, direction));
  }

  private toggleMove(): void {
    if (!this.selectedId) return;
    const room = this.dungeon.get(this.selectedId);
    if (!room) return;
    const def = this.dungeon.definitionOf(room);
    if (!this.moving) {
      const res = this.dungeon.moveTargets(this.selectedId).length
        ? ok(undefined)
        : fail(def.type === 'green' ? `${def.name} has nowhere to move` : `${def.name} is a ${def.type} room and cannot move`);
      if (!res.ok) return void this.report(res);
    }
    this.moving = !this.moving;
    this.movingParty = false;
    this.panel.setStatus(this.moving ? 'Click a highlighted slot to move the room there' : '');
    this.sync();
  }

  private removeFromBoard(): void {
    if (this.selectedId) this.report(this.dungeon.remove(this.selectedId), () => 'Room taken off the board. It is still in your room list.');
  }

  // ---------- files ----------

  private exportFile(): void {
    const blob = new Blob([JSON.stringify(toSaveFile(this.dungeon), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: 'mage-puzzle-dungeon.json' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.panel.setStatus('Exported mage-puzzle-dungeon.json');
  }

  private async importFile(file: File): Promise<void> {
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      return this.panel.setStatus(`${file.name} is not a valid save file`, true);
    }
    this.select(undefined);
    this.report(applySaveFile(this.dungeon, data), (f) => `Imported ${f.file.rooms.length} rooms from ${file.name}.${f.notice ? ` ${f.notice}` : ''}`);
  }

  /** Two-step clear: the first press arms it, a second press within 4 s clears. */
  private clearBoard(): void {
    if (this.dungeon.list().length === 0) return this.panel.setStatus('The board is already empty');
    if (Date.now() > this.clearArmedUntil) {
      this.clearArmedUntil = Date.now() + 4000;
      this.panel.setStatus('Press Clear board again to take every room off the board. Your room list stays.', true);
      return;
    }
    this.clearArmedUntil = 0;
    this.dungeon.clear();
    this.select(undefined);
    this.panel.setStatus('Board cleared');
  }

  // ---------- keyboard & sync ----------

  private onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    if (this.editor.isOpen || this.picker.isOpen || t.closest?.('input, textarea')) return;
    if (e.key === 'p' || e.key === 'P') return this.toggleMoveParty();
    if (e.key === 'Escape') {
      if (this.movingParty) this.toggleMoveParty();
      else if (this.moving) this.toggleMove();
      else if (this.placingDefId !== undefined) {
        this.placingDefId = undefined;
        this.panel.setStatus('');
        this.sync();
      } else this.select(undefined);
      return;
    }
    if (!this.selectedId) return;
    if (e.key === 'r' || e.key === 'R') this.rotate(e.shiftKey ? -1 : 1);
    else if (e.key === 'm' || e.key === 'M') this.toggleMove();
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      this.removeFromBoard();
    }
  }

  private sync(): void {
    let targets: string[] | undefined;
    if (this.movingParty) targets = this.dungeon.board.all().map((s) => s.id);
    else if (this.moving && this.selectedId) targets = this.dungeon.moveTargets(this.selectedId);
    else if (this.placingDefId !== undefined) targets = this.dungeon.board.all().filter((s) => this.dungeon.checkSlotFree(s.id).ok).map((s) => s.id);
    this.view.setState({ selectedId: this.selectedId, moveTargets: targets, pickingSlotId: this.pickingSlotId });
    this.panel?.setState({ selectedId: this.selectedId, moving: this.moving, movingParty: this.movingParty });
  }

  private report<T>(res: Result<T>, success?: (value: T) => string): Result<T> {
    if (res.ok) this.panel.setStatus(success ? success(res.value) : '');
    else this.panel.setStatus(res.error, true);
    return res;
  }
}
