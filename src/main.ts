import '@fontsource/cinzel/latin-400.css';
import '@fontsource/cinzel/latin-700.css';
import './styles.css';
import { Board } from './core/board';
import { RoomCatalog } from './core/catalog';
import { Dungeon } from './core/dungeon';
import { BOARD_SLOTS } from './data/board';
import { ROOM_CATALOG } from './data/rooms';
import { BoardView } from './render/boardView';
import { Controller } from './ui/controller';

const boardHost = document.querySelector<HTMLElement>('#board');
const panelRoot = document.querySelector<HTMLElement>('#panel');
if (!boardHost || !panelRoot) throw new Error('index.html is missing #board or #panel');

const dungeon = new Dungeon(new Board(BOARD_SLOTS), new RoomCatalog(ROOM_CATALOG));
const view = new BoardView(boardHost, dungeon);
new Controller(dungeon, view, panelRoot, boardHost);
