import '@fontsource/cinzel/latin-400.css';
import '@fontsource/cinzel/latin-700.css';
import './styles.css';
import { Board } from './core/board';
import { RoomCatalog } from './core/catalog';
import { Dungeon } from './core/dungeon';
import { SavedMaps } from './core/savedMaps';
import { BOARD_SLOTS } from './data/board';
import { BoardView } from './render/boardView';
import { GistStore, parseGistId } from './sync/gistStore';
import { openSavedMapsBackend } from './storage/savedMapsBackend';
import { SyncManager, browserStorage } from './sync/syncManager';
import { Controller } from './ui/controller';
import { SavedMapsPanel } from './ui/savedMapsPanel';
import { SyncPanel } from './ui/syncPanel';

const boardHost = document.querySelector<HTMLElement>('#board');
const panelRoot = document.querySelector<HTMLElement>('#panel');
if (!boardHost || !panelRoot) throw new Error('index.html is missing #board or #panel');

const dungeon = new Dungeon(new Board(BOARD_SLOTS), new RoomCatalog());
const view = new BoardView(boardHost, dungeon);
// The controller restores this browser's saved data first, so that loading
// is not mistaken for a new change by the sync below.
const controller = new Controller(dungeon, view, panelRoot, boardHost);

const sync = new SyncManager(dungeon, {
  storage: browserStorage,
  openStore: (token, id) => GistStore.open(token, id),
  createStore: (token, file) => GistStore.create(token, file),
  parseId: parseGistId,
});
new SyncPanel(controller.panel.syncSlot, sync, dungeon);

// Named copies of the map kept on this device, to switch between sessions.
void openSavedMapsBackend()
  .then(SavedMaps.open)
  .then((maps) => {
    new SavedMapsPanel(controller.panel.mapsSlot, maps, dungeon, {
      replaceMap: (file) => controller.replaceMap(file),
      setStatus: (text, isError) => controller.panel.setStatus(text, isError),
    });
  });

// Pick up changes from other devices: on start, every 30 s while visible,
// and whenever the tab comes back into view or the connection returns.
const POLL_MS = 30_000;
const pullIfVisible = () => {
  if (document.visibilityState === 'visible') void sync.pull();
};
void sync.syncNow();
setInterval(pullIfVisible, POLL_MS);
document.addEventListener('visibilitychange', pullIfVisible);
window.addEventListener('online', () => void sync.syncNow());
