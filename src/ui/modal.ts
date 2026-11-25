import { h } from './dom';

/**
 * A dialog over a dimmed backdrop. Closes on Escape or a click on the
 * backdrop, and gives focus back to whatever had it before opening.
 */
export class Modal {
  readonly backdrop = h('div', { className: 'modal-backdrop', hidden: true });
  readonly dialog: HTMLElement;
  private returnFocus: HTMLElement | null = null;
  /** Called after the modal closes. */
  onClose: () => void = () => {};

  constructor(host: HTMLElement, className: string, labelledBy: string) {
    this.dialog = h('div', { className });
    this.dialog.setAttribute('role', 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.setAttribute('aria-labelledby', labelledBy);
    this.dialog.tabIndex = -1;
    this.backdrop.append(this.dialog);
    host.append(this.backdrop);
    this.backdrop.addEventListener('pointerdown', (e) => {
      if (e.target === this.backdrop) this.close();
    });
    this.dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.close();
      }
    });
  }

  get isOpen(): boolean {
    return !this.backdrop.hidden;
  }

  show(): void {
    if (this.backdrop.hidden) {
      this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      this.backdrop.hidden = false;
    }
  }

  close(): void {
    if (this.backdrop.hidden) return;
    this.backdrop.hidden = true;
    this.returnFocus?.focus?.({ preventScroll: true });
    this.onClose();
  }
}
