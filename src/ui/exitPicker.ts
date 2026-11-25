import { SIDES, sideAngle } from '../core/grid';
import { EXIT_LABELS } from '../core/roomTypes';
import type { RoomType, Side } from '../core/types';

const SVG_NS = 'http://www.w3.org/2000/svg';
const R = 52;
const SHORT: Record<Side, string> = { n: 'N', e: 'E', s: 'S', w: 'W' };

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/**
 * Exit selector: a room orb with a clickable bar on each side, plus a
 * labelled checkbox for each exit. Both stay in sync.
 */
export class ExitPicker {
  readonly element: HTMLElement;
  private selected = new Set<Side>();
  private readonly bars = new Map<Side, SVGGElement>();
  private readonly boxes = new Map<Side, HTMLInputElement>();
  private readonly orb: SVGCircleElement;
  onChange: () => void = () => {};

  constructor(idPrefix: string) {
    const svg = el('svg', { viewBox: '-90 -90 180 180', class: 'exit-orb', 'aria-hidden': 'true' });
    svg.append(el('circle', { class: 'exit-well', r: R + 6 }));
    this.orb = el('circle', { class: 'exit-floor', r: R });
    svg.append(this.orb, el('circle', { r: R, fill: 'url(#exit-shine)' }));
    svg.prepend(this.buildDefs());

    for (const side of SIDES) {
      const g = el('g', { class: 'exit-edge' });
      const a = sideAngle(side);
      const rot = el('g', { transform: `rotate(${a + 90})` });
      rot.append(
        el('rect', { class: 'exit-hit', x: -R * 0.55, y: -R - 16, width: R * 1.1, height: 30 }),
        el('rect', { class: 'exit-bar', x: -R * 0.35, y: -R - 3, width: R * 0.7, height: 8, rx: 4 }),
      );
      const rad = (a * Math.PI) / 180;
      const label = el('text', { class: 'exit-label', x: Math.cos(rad) * (R + 24), y: Math.sin(rad) * (R + 24) });
      label.textContent = SHORT[side];
      g.append(rot, label);
      g.addEventListener('click', () => this.toggle(side));
      this.bars.set(side, g);
      svg.append(g);
    }

    const list = document.createElement('div');
    list.className = 'exit-list';
    for (const [side, name] of EXIT_LABELS) {
      const box = Object.assign(document.createElement('input'), { type: 'checkbox', id: `${idPrefix}-${side}` });
      box.addEventListener('change', () => this.toggle(side, box.checked));
      const label = Object.assign(document.createElement('label'), { htmlFor: box.id });
      label.append(box, ` ${name}`);
      this.boxes.set(side, box);
      list.append(label);
    }

    this.element = document.createElement('div');
    this.element.className = 'exit-picker';
    this.element.append(svg, list);
  }

  get value(): Side[] {
    return SIDES.filter((s) => this.selected.has(s));
  }

  set value(sides: readonly Side[]) {
    this.selected = new Set(sides);
    this.render();
  }

  /** Colour the preview orb like a room of this type. */
  setType(type: RoomType): void {
    this.orb.setAttribute('fill', `url(#orb-${type})`);
  }

  private buildDefs(): SVGDefsElement {
    const defs = el('defs', {});
    const shine = el('radialGradient', { id: 'exit-shine', cx: 0.34, cy: 0.26, r: 0.55 });
    for (const [o, op] of [[0, 0.85], [0.3, 0.2], [1, 0]] as const) {
      shine.append(el('stop', { offset: o, 'stop-color': '#fff', 'stop-opacity': op }));
    }
    defs.append(shine);
    return defs;
  }

  private toggle(side: Side, on = !this.selected.has(side)): void {
    if (on) this.selected.add(side);
    else this.selected.delete(side);
    this.render();
    this.onChange();
  }

  private render(): void {
    for (const side of SIDES) {
      const on = this.selected.has(side);
      this.bars.get(side)?.classList.toggle('is-on', on);
      const box = this.boxes.get(side);
      if (box) box.checked = on;
    }
  }
}
