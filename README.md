# Mage Puzzle Dungeon

A browser-based dungeon board for a D&D campaign, seen top-down in 2D. The
board is a fixed, symmetric hexagon of 37 hex slots (columns of 4-5-6-7-6-5-4,
three rings around the centre). All slots start empty except the **prismatic
core** (G4) in the exact centre, which can never hold a room.
Click an empty slot to place a room from the fixed catalogue.

Each room is one of:

| Mobility    | Glyph | Can rotate      | Can move               |
| ----------- | ----- | --------------- | ---------------------- |
| `fixed`     | ◆     | no              | no                     |
| `rotatable` | ⟳     | yes, 60° steps  | no                     |
| `movable`   | ✥     | no              | yes, to an empty slot  |

## Quick start

```bash
npm install
```

```bash
npm run dev
```

Open the URL Vite prints (default http://localhost:5173).

| Command             | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Dev server with hot reload                     |
| `npm run build`     | Type-check and build a static site to `dist/`  |
| `npm run preview`   | Serve the built `dist/` locally                |
| `npm test`          | Run unit tests (Vitest)                        |
| `npm run typecheck` | TypeScript check only                          |

The build is a static site with relative paths and the font bundled, so
`dist/` works offline and can be hosted anywhere (GitHub Pages, Netlify…).

## Controls

- **Click an empty slot** → pick a room from the list, or type its number and press Enter.
- **Click a room** to select it. Then: **R** / **Shift+R** rotate, **M** move
  (click a highlighted slot), **Delete** remove, **Esc** cancel.
- **Save / Load** keep the board in this browser's local storage.

## Slot labels

Letters are half-rows from the top (A = top point … M = bottom point), numbers
are columns 1–7 from the left. A4 is the top slot, M4 the bottom, D1/F1/H1/J1
the left edge, and G4 the core. Change `label()` in `src/data/board.ts` to rename.

## Project structure

```
├── index.html               # Page shell: board + side panel
├── src/
│   ├── main.ts              # Composition root
│   ├── styles.css
│   ├── core/                # Game rules — no DOM, fully unit-tested
│   │   ├── types.ts         # SlotDefinition, RoomDefinition, RoomInstance, Mobility…
│   │   ├── hex.ts           # Hex maths: neighbours, sides, rotation, pixel layout
│   │   ├── board.ts         # Validated fixed board (slots by id / position)
│   │   ├── catalog.ts       # Validated room list, looked up by number
│   │   ├── mobility.ts      # What fixed / rotatable / movable allow (+ move range)
│   │   ├── dungeon.ts       # Board state: place / rotate / move / remove, save snapshots
│   │   └── persistence.ts   # localStorage save / load
│   ├── data/
│   │   ├── board.ts         # ★ Board layout and slot labels
│   │   └── rooms.ts         # ★ Room catalogue — edit this to define your rooms
│   ├── render/
│   │   └── boardView.ts     # SVG board: frame, slots, rooms, doors, prismatic core
│   └── ui/
│       ├── controller.ts    # Interaction state: selection, move mode, picker
│       ├── roomPicker.ts    # Popover to choose a room for an empty slot
│       ├── controlPanel.ts  # Side panel: selected room, catalogue, save/load
│       └── dom.ts           # Small DOM helpers
├── tests/                   # Vitest unit tests for core/
├── public/                  # Static assets served as-is
└── .github/workflows/ci.yml # Type-check, test and build on every push
```

### Design rules

- **State flows one way.** `Dungeon` owns the board; the view and panel
  subscribe and re-render. All changes go through `Dungeon` methods, which
  return `{ ok, error }` so the UI can say why an action was refused.
- **Hex grid in doubled-height coordinates** (`q` column, `r` half-row,
  `q + r` even). Rooms fill one slot and rotate in 60° clockwise steps.
- **Mobility applies after placement.** The DM can place or remove any room;
  `fixed` / `rotatable` / `movable` restrict what changes afterwards. Set
  `MOVE_RANGE = 'adjacent'` in `src/core/mobility.ts` for sliding-puzzle moves.

## Adding rooms to the catalogue

Edit `src/data/rooms.ts`. The current eight rooms are placeholders.

```ts
{
  id: 9,                     // the room's number; must be unique
  name: 'Flooded Crypt',
  description: 'Knee-deep black water.',
  mobility: 'rotatable',     // 'fixed' | 'rotatable' | 'movable'
  doors: ['n', 'se'],        // hex edges before rotation: n, ne, se, s, sw, nw
  color: '#2b4a5a',
  maxCopies: 1,              // optional, how many can be on the board (default 1)
}
```
