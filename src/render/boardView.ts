import type { Dungeon } from '../core/dungeon';
import { hexCorners, hexToPixel, sideAngle } from '../core/hex';
import { ROOM_TYPES } from '../core/roomTypes';
import type { RoomInstance, SlotDefinition } from '../core/types';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Hex circumradius in SVG units (layout spacing). */
const SIZE = 50;
/** Drawn hexes are slightly smaller than the layout so slots have gaps. */
const DRAW_SIZE = SIZE * 0.9;
const APOTHEM = (DRAW_SIZE * Math.sqrt(3)) / 2;
const FRAME_MARGIN = SIZE * 0.9;

/** Small mark on each room: locked, turns, or turns and moves. */
const TYPE_GLYPHS = { red: '◆', blue: '⟳', green: '✥' } as const;

export interface BoardViewState {
  readonly selectedId?: string;
  /** While moving a room: the slots it may go to. */
  readonly moveTargets?: readonly string[];
  /** Slot whose room picker is open. */
  readonly pickingSlotId?: string;
}

export type SlotClickHandler = (slotId: string, anchor: Element) => void;

export interface PartyHandlers {
  /** The marker was dragged and dropped on a slot. */
  onDrop(slotId: string): void;
  /** The marker was clicked (or Enter pressed) without dragging. */
  onClick(): void;
}

/** Party token offset from the slot centre: upper right, clear of the room number and doors. */
const PARTY_OFFSET = { x: DRAW_SIZE * 0.42, y: -DRAW_SIZE * 0.55 };
const PARTY_RADIUS = 11;

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

const points = (pts: { x: number; y: number }[]): string => pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

interface SlotElements {
  group: SVGGElement;
  room: SVGGElement;
  floor: SVGPolygonElement;
  doors: SVGGElement;
  number: SVGTextElement;
  name: SVGTextElement;
  glyph: SVGTextElement;
  title: SVGTitleElement;
}

/**
 * Top-down 2D board drawn in SVG. It is a read-only projection of the
 * Dungeon state plus a little view state (selection, move targets); clicks
 * are reported through `onSlotClick` and never change state directly.
 */
export class BoardView {
  readonly element: SVGSVGElement;
  private readonly slots = new Map<string, SlotElements>();
  /** Accumulated door angle per room, so 300° → 0° animates forwards. */
  private readonly angles = new Map<string, { rotation: number; angle: number }>();
  private state: BoardViewState = {};
  private onSlotClick: SlotClickHandler = () => {};
  private party: PartyHandlers = { onDrop: () => {}, onClick: () => {} };
  private readonly partyToken: SVGGElement;
  private dragging = false;

  constructor(
    container: HTMLElement,
    private readonly dungeon: Dungeon,
  ) {
    const slots = dungeon.board.all();
    const centre = this.boardCentre(slots);
    const frameRadius = this.frameRadius(slots, centre);
    const half = frameRadius + 12;

    this.element = svg('svg', {
      class: 'board',
      viewBox: `${centre.x - half} ${centre.y - half} ${half * 2} ${half * 2}`,
      role: 'group',
      'aria-label': 'Dungeon board',
    });
    this.element.append(this.buildDefs(), this.buildFrame(centre, frameRadius));

    const slotLayer = svg('g', { class: 'slots' });
    for (const slot of slots) {
      const els = this.buildSlot(slot);
      this.slots.set(slot.id, els);
      slotLayer.append(els.group);
    }
    this.partyToken = this.buildPartyToken();
    this.element.append(slotLayer, svg('g', { class: 'party-layer' }, this.partyToken));
    container.append(this.element);

    dungeon.subscribe(() => this.update());
    this.update();
  }

  setSlotClickHandler(handler: SlotClickHandler): void {
    this.onSlotClick = handler;
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
    const moving = targets.size > 0 || this.state.moveTargets !== undefined;
    const live = new Set<string>();

    for (const slot of this.dungeon.board.all()) {
      const els = this.slots.get(slot.id);
      if (!els) continue;
      const room = this.dungeon.roomAt(slot.id);
      const c = els.group.classList;
      c.toggle('is-filled', !!room);
      c.toggle('is-empty', !room && slot.kind === 'slot');
      c.toggle('is-selected', !!room && room.instanceId === this.state.selectedId);
      c.toggle('is-target', targets.has(slot.id));
      c.toggle('is-dimmed', moving && !targets.has(slot.id) && room?.instanceId !== this.state.selectedId);
      c.toggle('is-picking', slot.id === this.state.pickingSlotId);
      c.toggle('is-party', slot.id === this.dungeon.party);

      if (room) {
        live.add(room.instanceId);
        this.renderRoom(els, room, slot);
      } else if (slot.kind === 'slot') {
        els.title.textContent = `${slot.id} — empty, click to place a room`;
        els.group.setAttribute('aria-label', `Slot ${slot.id}, empty`);
      }
    }
    for (const id of this.angles.keys()) if (!live.has(id)) this.angles.delete(id);
    this.updateParty();
  }

  private updateParty(): void {
    const slot = this.dungeon.party ? this.dungeon.board.get(this.dungeon.party) : undefined;
    this.partyToken.style.display = slot ? '' : 'none';
    if (!slot || this.dragging) return;
    const c = hexToPixel(slot.coord, SIZE);
    this.placeToken(c.x + PARTY_OFFSET.x, c.y + PARTY_OFFSET.y);
    this.partyToken.setAttribute('aria-label', `Party marker in ${slot.id}. Drag it, or press Enter to move it.`);
    this.partyToken.querySelector('title')!.textContent = `The party is in ${slot.id} — drag to move`;
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

  /** Slot whose centre is nearest to a point, if the point is on that slot. */
  private slotAt(x: number, y: number): string | undefined {
    let best: { id: string; d: number } | undefined;
    for (const slot of this.dungeon.board.all()) {
      const c = hexToPixel(slot.coord, SIZE);
      const d = Math.hypot(c.x - x, c.y - y);
      if (!best || d < best.d) best = { id: slot.id, d };
    }
    return best && best.d <= SIZE * 0.9 ? best.id : undefined;
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

    let start: { x: number; y: number; px: number; py: number } | undefined;
    token.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const p = this.toSvgPoint(e);
      start = { x: e.clientX, y: e.clientY, px: p.x, py: p.y };
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

  private renderRoom(els: SlotElements, room: RoomInstance, slot: SlotDefinition): void {
    const def = this.dungeon.definitionOf(room);
    const rules = ROOM_TYPES[def.type];

    els.floor.setAttribute('fill', rules.color);
    els.number.textContent = String(def.id);
    els.name.textContent = def.name.length > 14 ? `${def.name.slice(0, 13)}…` : def.name;
    els.glyph.textContent = TYPE_GLYPHS[def.type];
    els.title.textContent = `${slot.id} — #${def.id} ${def.name} (${rules.label}: ${rules.summary.toLowerCase()})`;
    els.group.setAttribute('aria-label', `Slot ${slot.id}, room ${def.id} ${def.name}, ${rules.label}`);

    // Rebuild door markers only when the room or its exits changed.
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
    let angle = room.rotation * 60;
    if (prev) {
      const delta = (((room.rotation - prev.rotation) % 6) + 6) % 6;
      angle = prev.angle + (delta > 3 ? delta - 6 : delta) * 60;
    }
    this.angles.set(room.instanceId, { rotation: room.rotation, angle });
    els.doors.style.transform = `rotate(${angle}deg)`;
  }

  // ---------- construction ----------

  private boardCentre(slots: SlotDefinition[]): { x: number; y: number } {
    const xs = slots.map((s) => hexToPixel(s.coord, SIZE).x);
    const ys = slots.map((s) => hexToPixel(s.coord, SIZE).y);
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  }

  /** Circumradius of the smallest pointy-top hexagon frame enclosing every slot. */
  private frameRadius(slots: SlotDefinition[], centre: { x: number; y: number }): number {
    const normals = Array.from({ length: 6 }, (_, k) => (Math.PI / 3) * k);
    let maxDist = 0;
    for (const slot of slots) {
      const p = hexToPixel(slot.coord, SIZE);
      for (const corner of hexCorners(SIZE)) {
        const x = p.x + corner.x - centre.x;
        const y = p.y + corner.y - centre.y;
        for (const a of normals) maxDist = Math.max(maxDist, x * Math.cos(a) + y * Math.sin(a));
      }
    }
    return (maxDist + FRAME_MARGIN) / (Math.sqrt(3) / 2);
  }

  private buildDefs(): SVGDefsElement {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const stops = (list: [number, string, number?][]) =>
      list.map(([o, c, a]) => svg('stop', { offset: o, 'stop-color': c, 'stop-opacity': a ?? 1 }));

    const prism = svg(
      'linearGradient',
      { id: 'prism', x1: 0, y1: 0, x2: 1, y2: 1 },
      ...stops([
        [0, '#ff9ad5'],
        [0.2, '#ffd59a'],
        [0.4, '#c9ff9a'],
        [0.6, '#9ae8ff'],
        [0.8, '#b59aff'],
        [1, '#ff9ad5'],
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
      svg('radialGradient', { id: 'pearl-shine', cx: 0.38, cy: 0.32, r: 0.7 }, ...stops([[0, '#ffffff', 0.95], [0.35, '#ffffff', 0.35], [1, '#ffffff', 0]])),
      svg('linearGradient', { id: 'gold', x1: 0, y1: 0, x2: 0, y2: 1 }, ...stops([[0, '#ffe7a3'], [0.5, '#d9a441'], [1, '#a8741f']])),
      svg('radialGradient', { id: 'slot-fill', cx: 0.5, cy: 0.4, r: 0.75 }, ...stops([[0, '#1c1624'], [1, '#09070d']])),
      svg('linearGradient', { id: 'room-sheen', x1: 0, y1: 0, x2: 0, y2: 1 }, ...stops([[0, '#ffffff', 0.22], [0.5, '#ffffff', 0], [1, '#000000', 0.35]])),
      svg('radialGradient', { id: 'frame-fill', cx: 0.5, cy: 0.5, r: 0.7 }, ...stops([[0, '#1d1530'], [1, '#0d0a14']])),
      svg(
        'filter',
        { id: 'glow', x: '-50%', y: '-50%', width: '200%', height: '200%' },
        svg('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: 3, result: 'blur' }),
        svg('feMerge', {}, svg('feMergeNode', { in: 'blur' }), svg('feMergeNode', { in: 'SourceGraphic' })),
      ),
    );
  }

  private buildFrame(centre: { x: number; y: number }, radius: number): SVGGElement {
    const hex = (r: number) =>
      Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i - Math.PI / 2; // pointy top
        return { x: centre.x + r * Math.cos(a), y: centre.y + r * Math.sin(a) };
      });
    const star = (x: number, y: number, s: number) =>
      svg('path', {
        class: 'frame-star',
        d: `M${x},${y - s} Q${x},${y} ${x + s * 0.35},${y} Q${x},${y} ${x},${y + s} Q${x},${y} ${x - s * 0.35},${y} Q${x},${y} ${x},${y - s}Z`,
      });

    const outer = hex(radius);
    return svg(
      'g',
      { class: 'frame', 'aria-hidden': 'true' },
      svg('polygon', { class: 'frame-fill', points: points(outer) }),
      svg('circle', { class: 'frame-orbit', cx: centre.x, cy: centre.y, r: radius * 0.78 }),
      svg('circle', { class: 'frame-orbit', cx: centre.x, cy: centre.y, r: radius * 0.66 }),
      svg('polygon', { class: 'frame-outer', points: points(outer) }),
      svg('polygon', { class: 'frame-inner', points: points(hex(radius - 9)) }),
      ...hex(radius - 26).map((p) => star(p.x, p.y, 11)),
    );
  }

  private buildSlot(slot: SlotDefinition): SlotElements {
    const { x, y } = hexToPixel(slot.coord, SIZE);
    const corners = points(hexCorners(DRAW_SIZE));
    const group = svg('g', {
      class: `slot slot-${slot.kind}`,
      transform: `translate(${x.toFixed(2)},${y.toFixed(2)})`,
      'data-slot': slot.id,
      tabindex: 0,
      role: 'button',
    });
    const title = svg('title');
    group.append(title, svg('polygon', { class: 'slot-base', points: corners }));

    const floor = svg('polygon', { class: 'room-floor', points: corners });
    const doors = svg('g', { class: 'room-doors' });
    const number = svg('text', { class: 'room-number', y: -2 });
    const name = svg('text', { class: 'room-name', y: 14 });
    const glyph = svg('text', { class: 'room-glyph', y: -22 });
    const room = svg('g', { class: 'slot-room' }, floor, svg('polygon', { class: 'room-sheen', points: corners }), doors, glyph, number, name);
    group.append(room);

    if (slot.kind === 'core') {
      title.textContent = `${slot.id} — prismatic core`;
      group.setAttribute('aria-label', `Slot ${slot.id}, prismatic core`);
      group.append(
        svg('polygon', { class: 'core-fill', points: points(hexCorners(DRAW_SIZE * 0.97)) }),
        svg('circle', { class: 'core-orb', r: DRAW_SIZE * 0.5 }),
        svg('circle', { class: 'core-shine', r: DRAW_SIZE * 0.5 }),
      );
    }

    group.append(
      svg('polygon', { class: 'party-ring', points: points(hexCorners(DRAW_SIZE + 3)) }),
      svg('polygon', { class: 'slot-rim', points: corners }),
      svg('polygon', { class: 'slot-rim-inner', points: points(hexCorners(DRAW_SIZE - 5)) }),
    );
    if (slot.kind === 'slot') group.append(svg('text', { class: 'slot-label', y: 0 }, slot.id));

    group.addEventListener('click', () => this.onSlotClick(slot.id, group));
    group.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.onSlotClick(slot.id, group);
      }
    });

    return { group, room, floor, doors, number, name, glyph, title };
  }

  private buildDoor(angle: number): SVGGElement {
    const w = DRAW_SIZE * 0.42;
    const h = 7;
    return svg(
      'g',
      { transform: `rotate(${angle + 90})` },
      svg('rect', { class: 'door', x: -w / 2, y: -APOTHEM + 2, width: w, height: h, rx: 2 }),
    );
  }
}
