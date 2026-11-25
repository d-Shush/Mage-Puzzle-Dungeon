import { sideAngle } from '../core/grid';
import type { RoomDefinition, Rotation } from '../core/types';

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/** Fill for a room tile. The gradients are defined once in the board's SVG. */
export const tileFill = (type: RoomDefinition['type']): string => (type === 'prismatic' ? 'url(#prism)' : `url(#orb-${type})`);

/**
 * A room tile centred on the origin: coloured square, sheen and a gold bar
 * for each exit, turned by `rotation`. Used for previews in the room list,
 * the selected-room panel, the room picker and the ghost on the board.
 */
export function roomTileGroup(def: Pick<RoomDefinition, 'type' | 'doors'>, rotation: Rotation, half: number): SVGGElement {
  const g = el('g', { class: 'tile' });
  const rx = Math.max(3, half * 0.16);
  const square = (cls: string, fill?: string) =>
    el('rect', { class: cls, x: -half, y: -half, width: half * 2, height: half * 2, rx, ...(fill ? { fill } : {}) });
  g.append(square('tile-floor', tileFill(def.type)), square('tile-shine', 'url(#tile-shine)'));

  const doors = el('g', { transform: `rotate(${rotation * 90})` });
  const w = half * 0.62;
  const h = Math.max(2.5, half * 0.17);
  for (const side of def.doors) {
    const bar = el('g', { transform: `rotate(${sideAngle(side) + 90})` });
    bar.append(el('rect', { class: 'tile-door', x: -w / 2, y: -half - h * 0.35, width: w, height: h, rx: h / 2 }));
    doors.append(bar);
  }
  g.append(doors);
  return g;
}

/** The same tile as a standalone, decorative SVG `size` pixels wide. */
export function roomTileSvg(def: Pick<RoomDefinition, 'type' | 'doors'>, rotation: Rotation, size: number): SVGSVGElement {
  const svg = el('svg', { viewBox: '-50 -50 100 100', width: size, height: size, class: 'tile-svg', 'aria-hidden': 'true' });
  svg.append(roomTileGroup(def, rotation, 40));
  return svg;
}
