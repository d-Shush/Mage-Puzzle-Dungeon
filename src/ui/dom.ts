type Props<K extends keyof HTMLElementTagNameMap> = Partial<Omit<HTMLElementTagNameMap[K], 'style'>> & {
  className?: string;
};

/** Tiny DOM helper. Text goes through textContent, never innerHTML. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props<K> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = Object.assign(document.createElement(tag), props);
  el.append(...children);
  return el;
}

export function button(label: string, onClick: () => void, className = ''): HTMLButtonElement {
  const b = h('button', { type: 'button', textContent: label, className });
  b.addEventListener('click', onClick);
  return b;
}
