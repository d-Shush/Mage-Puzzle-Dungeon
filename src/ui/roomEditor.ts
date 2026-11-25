import { DESCRIPTION_MAX, NAME_MAX } from '../core/catalog';
import { ROOM_TYPES, ROOM_TYPE_ORDER } from '../core/roomTypes';
import type { RoomDefinition, RoomInput, RoomType, Result } from '../core/types';
import { button, h } from './dom';
import { ExitPicker } from './exitPicker';
import { loadRoomImage } from './imageFile';

export interface EditorOptions {
  /** Existing room to edit; omit to create a new one. */
  readonly room?: RoomDefinition;
  /** Shown under the title, e.g. "It will be placed in D3". */
  readonly note?: string;
  /** Where the room is on the board, if it is (shown in the delete warning). */
  readonly placedIn?: string;
  /** Save the room. Return an error to keep the editor open and show it. */
  readonly onSave: (input: RoomInput) => Result<unknown>;
  readonly onDelete?: () => void;
}

/**
 * Modal form to create or edit a room: name, player description, type
 * (red / blue / green) and exits.
 */
export class RoomEditor {
  private readonly backdrop = h('div', { className: 'modal-backdrop modal-top', hidden: true });
  private readonly dialog = h('form', { className: 'modal', noValidate: true });
  private readonly exits = new ExitPicker('room-exit');
  private returnFocus: HTMLElement | null = null;

  constructor(host: HTMLElement) {
    this.dialog.setAttribute('role', 'dialog');
    this.dialog.setAttribute('aria-modal', 'true');
    this.dialog.setAttribute('aria-labelledby', 'room-editor-title');
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

  open(opts: EditorOptions): void {
    const room = opts.room;
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const name = h('input', { id: 'room-name', type: 'text', maxLength: NAME_MAX, value: room?.name ?? '', autocomplete: 'off', required: true });
    const description = h('textarea', { id: 'room-description', rows: 5, maxLength: DESCRIPTION_MAX, value: room?.description ?? '' });
    description.placeholder = 'What the players see when they enter…';
    const error = h('p', { className: 'form-error', role: 'alert' });

    // Optional picture, drawn on the map instead of the coloured square.
    let image: string | undefined = room?.image;
    const imagePreview = h('div', { className: 'image-preview' });
    const imageFile = h('input', { type: 'file', accept: 'image/*', hidden: true, id: 'room-image' });
    const chooseImage = button('', () => imageFile.click());
    const removeImage = button('Remove image', () => {
      image = undefined;
      renderImage();
    }, 'danger');
    const renderImage = () => {
      imagePreview.replaceChildren(
        image ? h('img', { src: image, alt: 'Room image' }) : h('span', { className: 'muted', textContent: 'No image' }),
      );
      imagePreview.classList.toggle('is-empty', !image);
      chooseImage.textContent = image ? 'Change image…' : 'Choose image…';
      removeImage.hidden = !image;
    };
    imageFile.addEventListener('change', async () => {
      const file = imageFile.files?.[0];
      imageFile.value = '';
      if (!file) return;
      chooseImage.disabled = true;
      const res = await loadRoomImage(file);
      chooseImage.disabled = false;
      if (res.ok) {
        image = res.value;
        error.textContent = '';
      } else error.textContent = res.error;
      renderImage();
    });
    renderImage();

    let type: RoomType = room?.type ?? 'red';
    const typeCards = ROOM_TYPE_ORDER.map((t) => {
      const rules = ROOM_TYPES[t];
      const radio = h('input', { type: 'radio', name: 'room-type', id: `room-type-${t}`, value: t, checked: t === type });
      radio.addEventListener('change', () => {
        type = t;
        this.exits.setType(t);
      });
      const swatch = h('span', { className: 'type-swatch' });
      if (t !== 'prismatic') swatch.style.background = rules.color;
      return h(
        'label',
        { className: `type-card type-${t}`, htmlFor: radio.id },
        radio,
        swatch,
        h('span', { className: 'type-text' }, h('strong', { textContent: rules.label }), h('span', { textContent: rules.summary })),
      );
    });

    this.exits.value = room?.doors ?? [];
    this.exits.setType(type);
    const exitCount = h('span', { className: 'muted' });
    const updateCount = () => {
      const n = this.exits.value.length;
      exitCount.textContent = n === 0 ? 'No exits yet' : `${n} exit${n === 1 ? '' : 's'}`;
    };
    this.exits.onChange = updateCount;
    updateCount();

    const actions = h('div', { className: 'modal-actions' });
    if (room && opts.onDelete) {
      const onDelete = opts.onDelete;
      let armed = false;
      const del = button('Delete room', () => {
        if (!armed) {
          armed = true;
          del.textContent = 'Click again to delete';
          error.textContent = opts.placedIn
            ? `This also removes it from the board (${opts.placedIn}).`
            : 'This cannot be undone.';
          return;
        }
        this.close();
        onDelete();
      }, 'danger');
      actions.append(del);
    }
    actions.append(
      h('span', { className: 'spacer' }),
      button('Cancel', () => this.close()),
      h('button', { type: 'submit', className: 'primary', textContent: room ? 'Save changes' : 'Create room' }),
    );

    this.dialog.onsubmit = (e) => {
      e.preventDefault();
      const res = opts.onSave({ name: name.value, description: description.value, type, doors: this.exits.value, image });
      if (res.ok) this.close();
      else {
        error.textContent = res.error;
        if (!name.value.trim()) name.focus();
      }
    };

    this.dialog.replaceChildren(
      h('h2', { id: 'room-editor-title', textContent: room ? `Edit room #${room.id}` : 'New room' }),
      ...(opts.note ? [h('p', { className: 'muted', textContent: opts.note })] : []),
      h('div', { className: 'field' }, h('label', { htmlFor: name.id, textContent: 'Name' }), name),
      h(
        'div',
        { className: 'field' },
        h('label', { htmlFor: description.id, textContent: 'Description for players' }),
        description,
      ),
      h(
        'fieldset',
        { className: 'field' },
        h('legend', { textContent: 'Image (optional)' }),
        h(
          'div',
          { className: 'image-field' },
          imagePreview,
          h(
            'div',
            { className: 'image-field-side' },
            h('p', { className: 'hint', textContent: 'Shown on the map instead of the coloured square, and in the room journal. Cropped to a square.' }),
            h('div', { className: 'row' }, chooseImage, removeImage, imageFile),
          ),
        ),
      ),
      h('fieldset', { className: 'field' }, h('legend', { textContent: 'Room type' }), h('div', { className: 'type-cards' }, ...typeCards)),
      h(
        'fieldset',
        { className: 'field' },
        h('legend', {}, 'Exits ', exitCount),
        h('p', { className: 'hint', textContent: 'Click a side of the room or tick a box. Exits turn with the room.' }),
        this.exits.element,
      ),
      error,
      actions,
    );

    this.backdrop.hidden = false;
    name.focus();
  }

  close(): void {
    if (this.backdrop.hidden) return;
    this.backdrop.hidden = true;
    this.returnFocus?.focus?.({ preventScroll: true });
  }
}
