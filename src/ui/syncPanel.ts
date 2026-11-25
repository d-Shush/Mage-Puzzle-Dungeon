import type { Dungeon } from '../core/dungeon';
import type { SyncManager, SyncState } from '../sync/syncManager';
import { button, h } from './dom';

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

const time = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** "Cloud sync" section of the side panel, plus the connect dialog. */
export class SyncPanel {
  private disconnectArmed = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly sync: SyncManager,
    private readonly dungeon: Dungeon,
  ) {
    sync.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    const s = this.sync.status;
    if (!this.sync.connected) {
      this.root.replaceChildren(
        h('h2', { textContent: 'Cloud sync' }),
        h('p', {
          className: 'hint',
          textContent: 'Open this map on your other devices. It is stored in a secret GitHub Gist on your account.',
        }),
        h('div', { className: 'row' }, button('Connect…', () => this.openConnect(), 'primary')),
      );
      return;
    }

    const id = this.sync.cloudId ?? '';
    const idCode = h('code', { className: 'cloud-id', textContent: id });
    const copy = button('Copy', () => {
      navigator.clipboard?.writeText(id).then(
        () => (copy.textContent = 'Copied'),
        () => window.getSelection()?.selectAllChildren(idCode),
      );
    }, 'small');

    const disconnect = button(this.disconnectArmed ? 'Click again to disconnect' : 'Disconnect', () => {
      if (!this.disconnectArmed) {
        this.disconnectArmed = true;
        this.render();
        setTimeout(() => {
          this.disconnectArmed = false;
          if (this.sync.connected) this.render();
        }, 4000);
        return;
      }
      this.disconnectArmed = false;
      this.sync.disconnect();
    }, 'danger');

    const children: (Node | string)[] = [
      h('h2', { textContent: 'Cloud sync' }),
      h('p', { className: `sync-status sync-${s.kind}` }, h('span', { className: 'sync-dot', ariaHidden: 'true' }), this.describe(s)),
    ];
    if (s.kind === 'conflict') {
      children.push(
        h('p', {
          className: 'hint',
          textContent: 'Choose which map to keep. The other one is replaced. Export a file first if you want a copy.',
        }),
        h(
          'div',
          { className: 'row' },
          button('Use the cloud map', () => void this.sync.resolveConflict('cloud')),
          button("Keep this device's map", () => void this.sync.resolveConflict('this-device')),
        ),
      );
    }
    children.push(
      h('div', { className: 'cloud-id-row' }, h('span', { className: 'muted', textContent: 'Cloud save ID' }), idCode, copy),
      h('p', { className: 'hint', textContent: 'On another device: Connect, paste your token and this ID.' }),
      h('div', { className: 'row' }, button('Sync now', () => void this.sync.syncNow()), disconnect),
    );
    if (s.kind === 'error') children.push(h('div', { className: 'row' }, button('Reconnect…', () => this.openConnect(id), 'primary')));
    this.root.replaceChildren(...children);
  }

  private describe(s: SyncState): string {
    switch (s.kind) {
      case 'off':
        return 'Not connected';
      case 'synced':
        return `Synced at ${time(s.at)}`;
      case 'pending':
        return 'Changes waiting to upload…';
      case 'working':
        return s.what === 'saving' ? 'Saving to the cloud…' : 'Checking the cloud…';
      case 'offline':
        return `${s.message} Changes stay on this device and upload later.`;
      case 'error':
        return s.message;
      case 'conflict':
        return 'This map was also changed on another device.';
    }
  }

  /** Modal to connect this device: token, plus the cloud save ID on other devices. */
  private openConnect(presetId = ''): void {
    const backdrop = h('div', { className: 'modal-backdrop' });
    const form = h('form', { className: 'modal', noValidate: true });
    form.setAttribute('role', 'dialog');
    form.setAttribute('aria-modal', 'true');
    form.setAttribute('aria-labelledby', 'sync-title');
    const close = () => backdrop.remove();
    backdrop.addEventListener('pointerdown', (e) => {
      if (e.target === backdrop) close();
    });
    form.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    });

    const token = h('input', { id: 'sync-token', type: 'password', autocomplete: 'off', spellcheck: false });
    const id = h('input', { id: 'sync-id', type: 'text', autocomplete: 'off', spellcheck: false, value: presetId });
    id.placeholder = 'Leave empty on your first device';
    const warning = h('p', { className: 'sync-warning' });
    const updateWarning = () => {
      const replacing = id.value.trim() && this.dungeon.catalog.size > 0;
      warning.textContent = replacing
        ? "This device's rooms and board will be replaced by the cloud save. Export a file first if you want to keep them."
        : '';
    };
    id.addEventListener('input', updateWarning);
    updateWarning();

    const error = h('p', { className: 'form-error', role: 'alert' });
    const submit = h('button', { type: 'submit', className: 'primary', textContent: 'Connect' });
    const tokenLink = h('a', { href: TOKEN_URL, target: '_blank', rel: 'noopener noreferrer', textContent: 'Create a token on GitHub' });

    form.onsubmit = async (e) => {
      e.preventDefault();
      error.textContent = '';
      submit.disabled = true;
      submit.textContent = 'Connecting…';
      const res = await this.sync.connect(token.value, id.value);
      submit.disabled = false;
      submit.textContent = 'Connect';
      if (res.ok) close();
      else error.textContent = res.error;
    };

    form.append(
      h('h2', { id: 'sync-title', textContent: 'Connect cloud sync' }),
      h(
        'ol',
        { className: 'sync-steps' },
        h('li', {}, tokenLink, ' (fine-grained token).'),
        h('li', {}, 'Under ', h('strong', { textContent: 'Permissions → Account' }), ', set ', h('strong', { textContent: 'Gists' }), ' to ', h('strong', { textContent: 'Read and write' }), '. Nothing else is needed.'),
        h('li', { textContent: 'Pick an expiry date, generate the token and paste it below.' }),
      ),
      h('div', { className: 'field' }, h('label', { htmlFor: token.id, textContent: 'GitHub token' }), token),
      h(
        'div',
        { className: 'field' },
        h('label', { htmlFor: id.id, textContent: 'Cloud save ID (other devices only)' }),
        id,
        h('p', { className: 'hint', textContent: 'First device: leave empty to create the cloud save from this map. Other devices: paste the ID shown under Cloud sync on the first one.' }),
      ),
      warning,
      h('p', {
        className: 'hint',
        textContent: 'The token is kept only in this browser and sent only to GitHub. Anyone who has the cloud save ID can read the map, so keep it from your players.',
      }),
      error,
      h('div', { className: 'modal-actions' }, h('span', { className: 'spacer' }), button('Cancel', close), submit),
    );
    backdrop.append(form);
    document.body.append(backdrop);
    token.focus();
  }
}
