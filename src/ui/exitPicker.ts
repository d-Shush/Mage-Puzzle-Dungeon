import { SIDES, hexCorners, sideAngle } from '../core/hex';
import { EXIT_LABELS } from '../core/roomTypes';
import type { Side } from '../core/types';

const SVG_NS = 'http://www.w3.org/2000/svg';
const R = 60;
const SHORT: Record<Side, string> = { n: 'N', ne: 'NE', se: 'SE', s: 'S', sw: 'SW', nw: 'NW' };

/**
 * Exit selector: a hexagon whose six edges toggle on click, plus a labelled
 * checkbox for each exit. Both stay in sync.
 */
export class ExitPicker {
  readonly element: HTMLElement;
  private selected = new Set<Side>();
  private readonly edges = new Map<Side, SVGGElement>();
  private readonly boxes = new Map<Side, HTMLInputElement>();
  private readonly floor: SVGPolygonElement;
  onChange: () => void = () => {};

  constructor(idPrefix: string) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '-100 -92 200 184');
    svg.setAttribute('class', 'exit-hex');
    svg.setAttribute('aria-hidden', 'true');

    const corners = hexCorners(R);
    this.floor = document.createElementNS(SVG_NS, 'polygon');
    this.floor.setAttribute('points', corners.map((p) => `${p.x},${p.y}`).join(' '));
    this.floor.setAttribute('class', 'exit-floor');
    svg.append(this.floor);

    SIDES.forEach((side, k) => {
      // Side k sits between corners (k+4)%6 and (k+5)%6 of a flat-top hex.
      const a = corners[(k + 4) % 6]!;
      const b = corners[(k + 5) % 6]!;
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'exit-edge');
      const hit = document.createElementNS(SVG_NS, 'line');
      const line = document.createElementNS(SVG_NS, 'line');
      for (const l of [hit, line]) {
        l.setAttribute('x1', String(a.x));
        l.setAttribute('y1', String(a.y));
        l.setAttribute('x2', String(b.x));
        l.setAttribute('y2', String(b.y));
      }
      hit.setAttribute('class', 'exit-hit');
      line.setAttribute('class', 'exit-line');
      const rad = (sideAngle(side) * Math.PI) / 180;
      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', String(Math.cos(rad) * (R + 18)));
      label.setAttribute('y', String(Math.sin(rad) * (R + 18)));
      label.setAttribute('class', 'exit-label');
      label.textContent = SHORT[side];
      g.append(hit, line, label);
      g.addEventListener('click', () => this.toggle(side));
      this.edges.set(side, g);
      svg.append(g);
    });

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

  /** Floor colour of the preview hexagon (matches the room type). */
  setColor(color: string): void {
    this.floor.style.fill = color;
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
      this.edges.get(side)?.classList.toggle('is-on', on);
      const box = this.boxes.get(side);
      if (box) box.checked = on;
    }
  }
}
