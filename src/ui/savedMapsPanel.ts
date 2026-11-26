import type { Dungeon } from '../core/dungeon';
import { toSaveFile } from '../core/persistence';
import { MAP_NAME_MAX, sameMap, type SavedMap, type SavedMaps } from '../core/savedMaps';
import type { Result, SaveFile } from '../core/types';
import { starterSave } from '../data/rooms';
import { button, h } from './dom';

export interface SavedMapsHost {
  /** Replace the working map; nothing changes if the file is invalid. */
  replaceMap(file: SaveFile): Result<{ notice?: string }>;
  setStatus(text: string, isError?: boolean): void;
}

const ARM_MS = 4000;
const when = (t: number) => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * "Saved maps" section of the side panel: keep named copies of the map on
 * this device (one per session, or before a risky change) and switch
 * between them.
 */
export class SavedMapsPanel {
  private readonly nameInput = h('input', { type: 'text', maxLength: MAP_NAME_MAX, autocomplete: 'off', id: 'saved-map-name' });
  private readonly body = h('div', { className: 'saved-maps-body' });
  private readonly count = h('span', { className: 'muted' });
  private renaming: { id: string; input: HTMLInputElement } | undefined;
  /** Second click needed within a few seconds: delete a map, or replace an unsaved working map. */
  private armed: { action: string; until: number } | undefined;
  private busy = false;

  constructor(
    root: HTMLElement,
    private readonly maps: SavedMaps,
    private readonly dungeon: Dungeon,
    private readonly host: SavedMapsHost,
  ) {
    this.nameInput.setAttribute('aria-label', 'Name for the saved map');
    this.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void this.saveNew();
      }
    });
    root.replaceChildren(
      h('div', { className: 'section-head' }, h('h2', { textContent: 'Saved maps' }), this.count),
      h('p', { className: 'hint', textContent: 'Keep a copy of the map for each session or state, and switch between them.' }),
      h('div', { className: 'saved-map-form' }, this.nameInput, button('Save as new', () => void this.saveNew(), 'primary')),
      this.body,
    );
    maps.subscribe(() => this.render());
    dungeon.subscribe(() => this.render());
    this.render();
  }

  // ---------- rendering ----------

  private render(): void {
    const all = this.maps.list();
    this.count.textContent = all.length ? plural(all.length, 'map') : '';
    this.nameInput.placeholder = this.maps.suggestName();

    const current = toSaveFile(this.dungeon);
    const active = this.maps.active;
    const activeChanged = !!active && !sameMap(active.file, current);

    const status = h('p', { className: 'saved-map-current' });
    if (active) {
      status.append('Open: ', h('strong', { textContent: active.name }));
      if (activeChanged) {
        status.append(h('span', { className: 'saved-map-changed', textContent: ' · changed since saved' }));
      } else status.append(h('span', { className: 'muted', textContent: ' · saved' }));
    } else {
      const match = this.maps.findMatch(current);
      if (match) status.append('Same as ', h('strong', { textContent: match.name }));
      else status.append(h('span', { className: 'muted', textContent: all.length ? 'The current map is not saved.' : 'No saved maps yet.' }));
    }

    const actions = h('div', { className: 'row' });
    if (active && activeChanged) actions.append(button(`Update "${active.name}"`, () => void this.update(active)));
    actions.append(button(this.isArmed('new') ? 'Click again for a new map' : 'New map', () => this.newMap(), this.isArmed('new') ? 'danger' : ''));

    const list = h('ul', { className: 'saved-map-list' }, ...all.map((m) => this.row(m, m.id === active?.id, current)));

    const refocus = this.renaming && document.activeElement === this.renaming.input;
    this.body.replaceChildren(
      status,
      actions,
      ...(all.length ? [list] : []),
      h('p', {
        className: 'hint',
        textContent: 'Saved maps stay in this browser. Opening one replaces the map you are working on (and the cloud map, if Cloud sync is on). Use Export file to copy a map to another device.',
      }),
    );
    if (refocus) this.renaming?.input.focus();
  }

  private row(map: SavedMap, isActive: boolean, current: SaveFile): HTMLElement {
    const placed = map.file.board.length;
    const meta = `${when(map.savedAt)} · ${plural(map.file.rooms.length, 'room')}, ${placed} on the board`;

    let title: HTMLElement;
    let buttons: HTMLElement[];
    if (this.renaming?.id === map.id) {
      const input = this.renaming.input;
      title = input;
      buttons = [button('Save name', () => void this.finishRename(), 'small primary'), button('Cancel', () => this.cancelRename(), 'small')];
    } else {
      title = h(
        'div',
        { className: 'saved-map-title' },
        h('strong', { className: 'saved-map-name', textContent: map.name }),
        ...(isActive ? [h('span', { className: 'saved-map-badge', textContent: 'Open' })] : []),
      );
      const unchanged = sameMap(map.file, current);
      const openKey = `open:${map.id}`;
      const open = button(
        this.isArmed(openKey) ? 'Click again to open' : isActive && !unchanged ? 'Revert' : 'Open',
        () => void this.open(map),
        `small${this.isArmed(openKey) ? ' danger' : ''}`,
      );
      open.disabled = unchanged;
      if (unchanged) open.title = 'This is the map on the board now';
      if (isActive && !unchanged) open.title = 'Go back to the saved version';
      const delKey = `delete:${map.id}`;
      buttons = [
        open,
        button('Rename', () => this.startRename(map), 'small'),
        button(this.isArmed(delKey) ? 'Click again to delete' : 'Delete', () => void this.remove(map), 'small danger'),
      ];
    }

    return h(
      'li',
      { className: `saved-map${isActive ? ' is-active' : ''}` },
      title,
      h('p', { className: 'saved-map-meta', textContent: meta }),
      h('div', { className: 'row' }, ...buttons),
    );
  }

  // ---------- actions ----------

  private async saveNew(): Promise<void> {
    const name = this.nameInput.value.trim() || this.maps.suggestName();
    const res = await this.run(() => this.maps.saveNew(name, toSaveFile(this.dungeon)));
    if (!res) return;
    if (res.ok) {
      this.nameInput.value = '';
      this.host.setStatus(`Saved the map as "${res.value.name}"`);
    } else this.host.setStatus(res.error, true);
  }

  private async update(map: SavedMap): Promise<void> {
    const res = await this.run(() => this.maps.overwrite(map.id, toSaveFile(this.dungeon)));
    if (res) this.report(res, `Updated "${map.name}"`);
  }

  private async open(map: SavedMap): Promise<void> {
    if (!this.confirmReplace(`open:${map.id}`, `open "${map.name}"`)) return;
    const res = this.host.replaceMap(map.file);
    if (!res.ok) return this.host.setStatus(`"${map.name}" could not be opened: ${res.error}`, true);
    await this.maps.setActive(map.id);
    this.host.setStatus(`Opened "${map.name}".${res.value.notice ? ` ${res.value.notice}` : ''}`);
  }

  /** Start over from the two starting rooms. */
  private newMap(): void {
    if (!this.confirmReplace('new', 'start a new map')) return;
    const res = this.host.replaceMap(starterSave());
    if (!res.ok) return this.host.setStatus(res.error, true);
    void this.maps.setActive(undefined);
    this.host.setStatus('Started a new map. Use Save as new to keep it.');
  }

  private async remove(map: SavedMap): Promise<void> {
    const key = `delete:${map.id}`;
    if (!this.isArmed(key)) {
      this.arm(key);
      this.host.setStatus(`Click Delete again to delete "${map.name}". The map you are working on stays.`, true);
      return;
    }
    this.armed = undefined;
    const res = await this.run(() => this.maps.remove(map.id));
    if (res) this.report(res, `Deleted "${map.name}"`);
  }

  private startRename(map: SavedMap): void {
    const input = h('input', { type: 'text', maxLength: MAP_NAME_MAX, value: map.name, autocomplete: 'off', className: 'saved-map-rename' });
    input.setAttribute('aria-label', `New name for ${map.name}`);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void this.finishRename();
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        this.cancelRename();
      }
    });
    this.renaming = { id: map.id, input };
    this.render();
    input.focus();
    input.select();
  }

  private async finishRename(): Promise<void> {
    if (!this.renaming) return;
    const { id, input } = this.renaming;
    const res = await this.run(() => this.maps.rename(id, input.value));
    if (!res) return;
    if (res.ok) {
      this.renaming = undefined;
      this.render();
      this.host.setStatus(`Renamed to "${res.value.name}"`);
    } else this.host.setStatus(res.error, true);
  }

  private cancelRename(): void {
    this.renaming = undefined;
    this.render();
  }

  // ---------- helpers ----------

  /**
   * Opening a map replaces the working one. If that has changes no saved map
   * holds, ask for a second click instead of losing them silently.
   */
  private confirmReplace(key: string, what: string): boolean {
    const current = toSaveFile(this.dungeon);
    const safe = !!this.maps.findMatch(current) || sameMap(current, starterSave());
    if (safe || this.isArmed(key)) {
      this.armed = undefined;
      return true;
    }
    this.arm(key);
    const active = this.maps.active;
    this.host.setStatus(
      active
        ? `"${active.name}" has changes that are not saved. Click again to ${what} anyway, or Update "${active.name}" first.`
        : `The current map is not saved. Click again to ${what} anyway, or Save as new first.`,
      true,
    );
    return false;
  }

  private isArmed(action: string): boolean {
    return this.armed?.action === action && Date.now() < this.armed.until;
  }

  private arm(action: string): void {
    this.armed = { action, until: Date.now() + ARM_MS };
    this.render();
    setTimeout(() => {
      if (this.armed?.action === action && Date.now() >= this.armed.until) {
        this.armed = undefined;
        this.render();
      }
    }, ARM_MS + 50);
  }

  /** Run one storage write at a time; returns undefined if one is already running. */
  private async run<T>(fn: () => Promise<Result<T>>): Promise<Result<T> | undefined> {
    if (this.busy) return undefined;
    this.busy = true;
    try {
      return await fn();
    } finally {
      this.busy = false;
    }
  }

  private report(res: Result<unknown>, success: string): void {
    if (res.ok) this.host.setStatus(success);
    else this.host.setStatus(res.error, true);
  }
}
