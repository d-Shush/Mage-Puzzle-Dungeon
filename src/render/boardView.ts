import type { Dungeon } from '../core/dungeon';
import { sideAngle } from '../core/grid';
import { ROOM_TYPES, ROOM_TYPE_ORDER } from '../core/roomTypes';
import type { GridCoord, RoomInstance, Rotation, SlotDefinition } from '../core/types';
import { roomImageGroup, roomTileGroup } from './roomTile';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Distance between slot centres, in SVG units. */
const SPACING = 100;
/** Half the side of a slot's gold frame. */
const R = 38;
/** Half the side of a room tile inside the frame. */
const ORB = R - 6;
/** Corner rounding of slots and room tiles. */
const CORNER = 7;
const FRAME_PAD = { x: 70, y: 62 };

/** Party token offset from the slot centre: upper left, clear of names and exits. */
const PARTY_OFFSET = { x: -R * 0.74, y: -R * 0.74 };
const PARTY_RADIUS = 11;

export interface BoardViewState {
  readonly selectedId?: string;
  /** While moving a room or the party: the slots it may go to. */
  readonly moveTargets?: readonly string[];
  /** Slot whose room picker is open. */
  readonly pickingSlotId?: string;
  /** Preview of a room about to be placed: drawn see-through in that slot. */
  readonly ghost?: { readonly slotId: string; readonly definitionId: number; readonly rotation: Rotation };
}

/** Pointer (or keyboard focus) entered a slot, or left the board (undefined). */
export type SlotHoverHandler = (slotId: string | undefined) => void;

export type SlotClickHandler = (slotId: string, anchor: Element) => void;

export interface PartyHandlers {
  /** The marker was dragged and dropped on a slot. */
  onDrop(slotId: string): void;
  /** The marker was clicked (or Enter pressed) without dragging. */
  onClick(): void;
}

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  ...children: (SVGElement | string)[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  el.append(...children);
  return el;
}

const toPixel = (c: GridCoord) => ({ x: c.col * SPACING, y: c.row * SPACING });

/** A rounded square centred on the origin, `half` from centre to each side. */
const square = (cls: string, half: number, corner = CORNER) =>
  svg('rect', { class: cls, x: -half, y: -half, width: half * 2, height: half * 2, rx: corner });

/** Blend a #rrggbb colour towards another (t = 0 … 1). */
function mix(hex: string, target: string, t: number): string {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  const c = [0, 1, 2].map((i) => Math.round(p(hex, i) + (p(target, i) - p(hex, i)) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Split a name into at most `maxLines` lines of about `width` characters. */
function wrap(text: string, width: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!line) line = word;
    else if ((line + ' ' + word).length <= width) line += ' ' + word;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1]!.slice(0, width - 1)}…`;
  }
  return lines.map((l) => (l.length > width + 2 ? `${l.slice(0, width + 1)}…` : l));
}

interface SlotElements {
  group: SVGGElement;
  orb: SVGRectElement;
  /** Holds the room's picture, if it has one. */
  image: SVGGElement;
  /** The picture currently drawn in `image` ('' for none). */
  imageHref: string;
  doors: SVGGElement;
  name: SVGTextElement;
  title: SVGTitleElement;
}

/**
 * Top-down board drawn in SVG: a grid of square slots in a gold frame. It is a read-only projection of the Dungeon
 * state plus a little view state (selection, targets); input is reported
 * through handlers and never changes state directly.
 */
export class BoardView {
  readonly element: SVGSVGElement;
  private readonly slots = new Map<string, SlotElements>();
  /** Accumulated exit angle per room, so 270° → 0° animates forwards. */
  private readonly angles = new Map<string, { rotation: number; angle: number }>();
  private state: BoardViewState = {};
  private onSlotClick: SlotClickHandler = () => {};
  private onSlotHover: SlotHoverHandler = () => {};
  private readonly ghost = svg('g', { class: 'ghost', 'aria-hidden': 'true' });
  private party: PartyHandlers = { onDrop: () => {}, onClick: () => {} };
  private readonly partyToken: SVGGElement;
  private dragging = false;

  constructor(
    container: HTMLElement,
    private readonly dungeon: Dungeon,
  ) {
    const slots = dungeon.board.all();
    const xs = slots.map((s) => toPixel(s.coord).x);
    const ys = slots.map((s) => toPixel(s.coord).y);
    const frame = {
      x: Math.min(...xs) - FRAME_PAD.x,
      y: Math.min(...ys) - FRAME_PAD.y,
      w: Math.max(...xs) - Math.min(...xs) + FRAME_PAD.x * 2,
      h: Math.max(...ys) - Math.min(...ys) + FRAME_PAD.y * 2,
    };
    const m = 10;

    this.element = svg('svg', {
      class: 'board',
      viewBox: `${frame.x - m} ${frame.y - m} ${frame.w + m * 2} ${frame.h + m * 2}`,
      role: 'group',
      'aria-label': 'Dungeon board',
    });
    this.element.append(this.buildDefs(), this.buildFrame(frame));

    const slotLayer = svg('g', { class: 'slots' });
    for (const slot of slots) {
      const els = this.buildSlot(slot);
      this.slots.set(slot.id, els);
      slotLayer.append(els.group);
    }
    this.partyToken = this.buildPartyToken();
    this.element.append(slotLayer, this.ghost, svg('g', { class: 'party-layer' }, this.partyToken));
    container.append(this.element);

    dungeon.subscribe(() => this.update());
    this.update();
  }

  setSlotClickHandler(handler: SlotClickHandler): void {
    this.onSlotClick = handler;
  }

  setSlotHoverHandler(handler: SlotHoverHandler): void {
    this.onSlotHover = handler;
  }

  setPartyHandlers(handlers: PartyHandlers): void {
    this.party = handlers;
  }

  setState(state: BoardViewState): void {
    this.state = state;
    this.update();
  }

  slotElement(slotId: string): Element | undefined {
    return this.slots.get(slotId)?.group;
  }

  // ---------- update ----------

  private update(): void {
    const targets = new Set(this.state.moveTargets ?? []);
    const moving = this.state.moveTargets !== undefined;
    const live = new Set<string>();

    for (const slot of this.dungeon.board.all()) {
      const els = this.slots.get(slot.id);
      if (!els) continue;
      const room = this.dungeon.roomAt(slot.id);
      const c = els.group.classList;
      c.toggle('is-filled', !!room);
      c.toggle('is-empty', !room);
      c.toggle('is-selected', !!room && room.instanceId === this.state.selectedId);
      c.toggle('is-target', targets.has(slot.id));
      c.toggle('is-dimmed', moving && !targets.has(slot.id) && room?.instanceId !== this.state.selectedId);
      c.toggle('is-picking', slot.id === this.state.pickingSlotId);
      c.toggle('is-party', slot.id === this.dungeon.party);

      if (room) {
        live.add(room.instanceId);
        this.renderRoom(els, room, slot);
      } else {
        els.title.textContent = `${slot.id}: empty, click to place a room`;
        els.group.setAttribute('aria-label', `Slot ${slot.id}, empty`);
      }
    }
    for (const id of this.angles.keys()) if (!live.has(id)) this.angles.delete(id);
    this.updateGhost();
    this.updateParty();
  }

  private renderRoom(els: SlotElements, room: RoomInstance, slot: SlotDefinition): void {
    const def = this.dungeon.definitionOf(room);
    const rules = ROOM_TYPES[def.type];

    els.orb.setAttribute('fill', def.type === 'prismatic' ? 'url(#prism)' : `url(#orb-${def.type})`);
    const image = def.image ?? '';
    if (els.imageHref !== image) {
      els.imageHref = image;
      els.image.replaceChildren(...(image ? [roomImageGroup(image, ORB, CORNER - 2, 4)] : []));
    }
    els.group.classList.toggle('has-image', !!image);
    const lines = wrap(def.name, 9, 2);
    els.name.replaceChildren(
      ...lines.map((line, i) => svg('tspan', { x: 0, dy: i === 0 ? `${-(lines.length - 1) * 0.55}em` : '1.1em' }, line)),
    );
    els.title.textContent = `${slot.id}: ${def.name} (${rules.label}, ${rules.summary.toLowerCase()})`;
    els.group.setAttribute('aria-label', `Slot ${slot.id}, room ${def.name}, ${rules.label}`);

    // Rebuild exit markers only when the room or its exits changed.
    const doorKey = `${room.instanceId}:${def.doors.join(',')}`;
    if (els.doors.dataset.room !== doorKey) {
      const sameRoom = els.doors.dataset.room?.startsWith(`${room.instanceId}:`);
      els.doors.dataset.room = doorKey;
      els.doors.replaceChildren(...def.doors.map((side) => this.buildDoor(sideAngle(side))));
      els.doors.style.transition = 'none';
      if (!sameRoom) this.angles.delete(room.instanceId);
    } else {
      els.doors.style.transition = '';
    }

    const prev = this.angles.get(room.instanceId);
    let angle = room.rotation * 90;
    if (prev) {
      const delta = (((room.rotation - prev.rotation) % 4) + 4) % 4;
      angle = prev.angle + (delta > 2 ? delta - 4 : delta) * 90;
    }
    this.angles.set(room.instanceId, { rotation: room.rotation, angle });
    els.doors.style.transform = `rotate(${angle}deg)`;
  }

  /** Draw the room being placed, see-through, in its target slot. */
  private updateGhost(): void {
    const g = this.state.ghost;
    const slot = g ? this.dungeon.board.get(g.slotId) : undefined;
    const def = g ? this.dungeon.catalog.get(g.definitionId) : undefined;
    if (!g || !slot || !def || this.dungeon.roomAt(slot.id)) {
      this.ghost.replaceChildren();
      this.ghost.dataset.key = '';
      return;
    }
    const key = `${slot.id}:${def.id}:${g.rotation}:${def.type}:${def.doors.join(',')}:${def.name}:${def.image?.length ?? 0}:${def.image?.slice(-32) ?? ''}`;
    if (this.ghost.dataset.key === key) return;
    this.ghost.dataset.key = key;
    const { x, y } = toPixel(slot.coord);
    this.ghost.setAttribute('transform', `translate(${x},${y})`);
    const lines = wrap(def.name, 9, 2);
    const name = svg('text', { class: 'room-name' });
    lines.forEach((line, i) => name.append(svg('tspan', { x: 0, dy: i === 0 ? `${-(lines.length - 1) * 0.55}em` : '1.1em' }, line)));
    this.ghost.classList.toggle('has-image', !!def.image);
    this.ghost.replaceChildren(roomTileGroup(def, g.rotation, ORB), name);
  }

  // ---------- party marker ----------

  private updateParty(): void {
    const slot = this.dungeon.party ? this.dungeon.board.get(this.dungeon.party) : undefined;
    this.partyToken.style.display = slot ? '' : 'none';
    if (!slot || this.dragging) return;
    const c = toPixel(slot.coord);
    this.placeToken(c.x + PARTY_OFFSET.x, c.y + PARTY_OFFSET.y);
    const where = this.dungeon.describeSlot(slot.id);
    this.partyToken.setAttribute('aria-label', `Party marker at ${where}. Drag it, or press Enter to move it.`);
    this.partyToken.querySelector('title')!.textContent = `The party is at ${where}. Drag to move.`;
  }

  private placeToken(x: number, y: number): void {
    this.partyToken.style.transform = `translate(${x}px, ${y}px)`;
  }

  /** SVG user coordinates of a pointer event. */
  private toSvgPoint(e: PointerEvent): { x: number; y: number } {
    const m = this.element.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }

  /** Slot under a point, if any. */
  private slotAt(x: number, y: number): string | undefined {
    let best: { id: string; d: number } | undefined;
    for (const slot of this.dungeon.board.all()) {
      const c = toPixel(slot.coord);
      const d = Math.hypot(c.x - x, c.y - y);
      if (!best || d < best.d) best = { id: slot.id, d };
    }
    return best && best.d <= SPACING * 0.55 ? best.id : undefined;
  }

  private buildPartyToken(): SVGGElement {
    const token = svg(
      'g',
      { class: 'party-token', tabindex: 0, role: 'button' },
      svg('title'),
      svg('circle', { class: 'party-pulse', r: PARTY_RADIUS }),
      svg('circle', { class: 'party-disc', r: PARTY_RADIUS }),
      svg('circle', { class: 'party-figure', cx: 0, cy: -3.6, r: 2.8 }),
      svg('path', { class: 'party-figure', d: 'M-5,5.5 Q-5,-0.2 0,-0.2 Q5,-0.2 5,5.5 Z' }),
    );

    let start: { x: number; y: number } | undefined;
    token.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      start = { x: e.clientX, y: e.clientY };
      token.setPointerCapture(e.pointerId);
    });
    token.addEventListener('pointermove', (e) => {
      if (!start) return;
      if (!this.dragging && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 4) return;
      this.dragging = true;
      token.classList.add('is-dragging');
      const p = this.toSvgPoint(e);
      this.placeToken(p.x, p.y);
      const over = this.slotAt(p.x, p.y);
      for (const [id, els] of this.slots) els.group.classList.toggle('is-party-drop', id === over);
    });
    const end = (e: PointerEvent, cancelled: boolean) => {
      if (!start) return;
      const wasDragging = this.dragging;
      start = undefined;
      this.dragging = false;
      token.classList.remove('is-dragging');
      for (const els of this.slots.values()) els.group.classList.remove('is-party-drop');
      if (!wasDragging) {
        if (!cancelled) this.party.onClick();
        return;
      }
      const p = this.toSvgPoint(e);
      const target = cancelled ? undefined : this.slotAt(p.x, p.y);
      if (target) this.party.onDrop(target);
      this.updateParty(); // snap to the (possibly unchanged) slot
    };
    token.addEventListener('pointerup', (e) => end(e, false));
    token.addEventListener('pointercancel', (e) => end(e, true));
    token.addEventListener('click', (e) => e.stopPropagation());
    token.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.party.onClick();
      }
    });
    return token;
  }

  // ---------- construction ----------

  private buildDefs(): SVGDefsElement {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const stops = (list: [number, string, number?][]) =>
      list.map(([o, c, a]) => svg('stop', { offset: o, 'stop-color': c, 'stop-opacity': a ?? 1 }));
    const orb = (id: string, base: string) =>
      svg(
        'radialGradient',
        { id, cx: 0.38, cy: 0.32, r: 0.78 },
        ...stops([
          [0, mix(base, '#ffffff', 0.55)],
          [0.45, base],
          [1, mix(base, '#000000', 0.7)],
        ]),
      );

    const prism = svg(
      'linearGradient',
      { id: 'prism', x1: 0, y1: 0, x2: 1, y2: 1 },
      ...stops([
        [0, '#ff5fa2'],
        [0.2, '#ffb347'],
        [0.4, '#c6f25a'],
        [0.6, '#4fd8ff'],
        [0.8, '#8b6bff'],
        [1, '#ff5fa2'],
      ]),
    );
    if (!reducedMotion) {
      prism.append(
        svg('animateTransform', {
          attributeName: 'gradientTransform',
          type: 'rotate',
          from: '0 0.5 0.5',
          to: '360 0.5 0.5',
          dur: '14s',
          repeatCount: 'indefinite',
        }),
      );
    }

    return svg(
      'defs',
      {},
      prism,
      ...ROOM_TYPE_ORDER.filter((t) => t !== 'prismatic').map((t) => orb(`orb-${t}`, ROOM_TYPES[t].color)),
      svg('linearGradient', { id: 'tile-shine', x1: 0, y1: 0, x2: 0.4, y2: 1 }, ...stops([[0, '#ffffff', 0.45], [0.35, '#ffffff', 0.08], [0.6, '#ffffff', 0], [1, '#000000', 0.25]])),
      svg('radialGradient', { id: 'well', cx: 0.5, cy: 0.42, r: 0.65 }, ...stops([[0, '#1b1722'], [1, '#08070b']])),
      svg('linearGradient', { id: 'gold', x1: 0, y1: 0, x2: 0, y2: 1 }, ...stops([[0, '#ffe7a3'], [0.5, '#d9a441'], [1, '#8f5f17']])),
      svg('linearGradient', { id: 'frame-fill', x1: 0, y1: 0, x2: 1, y2: 1 }, ...stops([[0, '#1a1722'], [0.5, '#121017'], [1, '#18151f']])),
      svg(
        'filter',
        { id: 'glow', x: '-50%', y: '-50%', width: '200%', height: '200%' },
        svg('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: 3, result: 'blur' }),
        svg('feMerge', {}, svg('feMergeNode', { in: 'blur' }), svg('feMergeNode', { in: 'SourceGraphic' })),
      ),
    );
  }

  private buildFrame(f: { x: number; y: number; w: number; h: number }): SVGGElement {
    // Faint diagonal light streaks across the slate, as in the reference art.
    const streaks = [
      [0.05, 0.25, 0.95, 0.05],
      [0.0, 0.7, 1.0, 0.35],
      [0.25, 1.0, 0.75, 0.0],
    ].map(([x1, y1, x2, y2]) =>
      svg('line', { class: 'frame-streak', x1: f.x + f.w * x1!, y1: f.y + f.h * y1!, x2: f.x + f.w * x2!, y2: f.y + f.h * y2! }),
    );
    return svg(
      'g',
      { class: 'frame', 'aria-hidden': 'true' },
      svg('rect', { class: 'frame-fill', x: f.x, y: f.y, width: f.w, height: f.h, rx: 18 }),
      ...streaks,
      svg('rect', { class: 'frame-outer', x: f.x, y: f.y, width: f.w, height: f.h, rx: 18 }),
      svg('rect', { class: 'frame-inner', x: f.x + 14, y: f.y + 14, width: f.w - 28, height: f.h - 28, rx: 8 }),
    );
  }

  private buildSlot(slot: SlotDefinition): SlotElements {
    const { x, y } = toPixel(slot.coord);
    const group = svg('g', {
      class: 'slot',
      transform: `translate(${x},${y})`,
      'data-slot': slot.id,
      tabindex: 0,
      role: 'button',
    });
    const title = svg('title');
    group.append(title, square('party-ring', R + 5, CORNER + 3), square('slot-well', R));

    const orb = square('room-orb', ORB, CORNER - 2);
    const doors = svg('g', { class: 'room-doors' });
    const image = svg('g', { class: 'room-image' });
    const name = svg('text', { class: 'room-name' });
    group.append(svg('g', { class: 'slot-room' }, orb, square('orb-shine', ORB, CORNER - 2), image, doors, name));

    group.append(square('slot-rim', R), square('slot-rim-inner', R - 4, CORNER - 2));
    group.append(svg('text', { class: 'slot-label', y: R * 0.5 }, slot.id));

    group.addEventListener('click', () => this.onSlotClick(slot.id, group));
    group.addEventListener('pointerenter', () => this.onSlotHover(slot.id));
    group.addEventListener('pointerleave', () => this.onSlotHover(undefined));
    group.addEventListener('focus', () => this.onSlotHover(slot.id));
    group.addEventListener('blur', () => this.onSlotHover(undefined));
    group.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.onSlotClick(slot.id, group);
      }
    });

    return { group, orb, image, imageHref: '', doors, name, title };
  }

  /** A glowing gold bar on one side of a room tile. */
  private buildDoor(angle: number): SVGGElement {
    const w = R * 0.62;
    const h = 6;
    return svg(
      'g',
      { transform: `rotate(${angle + 90})` },
      svg('rect', { class: 'door', x: -w / 2, y: -R + 1, width: w, height: h, rx: 3 }),
    );
  }
}
