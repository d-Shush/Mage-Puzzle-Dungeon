import './styles.css';
import { RoomCatalog } from './core/catalog';
import { Dungeon } from './core/dungeon';
import { ROOM_CATALOG } from './data/rooms';
import { SceneManager } from './render/sceneManager';
import { ControlPanel } from './ui/controlPanel';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
const panelRoot = document.querySelector<HTMLElement>('#panel');
if (!canvas || !panelRoot) throw new Error('index.html is missing #scene or #panel');

const catalog = new RoomCatalog(ROOM_CATALOG);
const dungeon = new Dungeon(catalog);
const scene = new SceneManager(canvas, dungeon);
const panel = new ControlPanel(panelRoot, dungeon, catalog);

// Wire selection both ways: clicking in 3D selects in the panel and vice versa.
scene.setPickHandler((id) => panel.select(id));
panel.setSelectHandler((id) => scene.setSelected(id));
