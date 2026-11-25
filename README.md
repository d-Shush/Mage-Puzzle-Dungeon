# Mage Puzzle Dungeon

A browser-based dungeon board for a D&D campaign, seen top-down in 2D. The
board is a fixed, symmetric hexagon of 37 hex slots (columns of 4-5-6-7-6-5-4,
three rings around the centre). All slots start empty except the **prismatic
core** (G4) in the exact centre, which can never hold a room.

The DM creates rooms in the app (**+ New room**), each with:

1. a **name**
2. a **description for players**
3. a **type**:

   | Type      | Glyph | Rotate          | Move                  |
   | --------- | ----- | --------------- | --------------------- |
   | **Red**   | ◆     | no              | no                    |
   | **Blue**  | ⟳     | yes, 60° steps  | no                    |
   | **Green** | ✥     | yes, 60° steps  | yes, to an empty slot |

4. its **exits**: any of North, North-West, South-West, South, South-East,
   North-East. Exits turn with the room.

Each room gets a number and can be on the board once.

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

## Publishing on GitHub Pages

`.github/workflows/deploy-pages.yml` builds and publishes the app on every
push to the default branch. One-time setup:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
   (Pages on a private repository needs a paid GitHub plan; otherwise make
   the repository public.)
2. Push to the default branch, or run **Actions → Deploy to GitHub Pages →
   Run workflow**.
3. The site appears at `https://<owner>.github.io/<repo>/` (also shown on the
   Pages settings page and in the workflow run).

Each browser keeps its own copy of the map. Connect **Cloud sync** on each
device to share one map between them.

## Controls

- **+ New room** creates a room. **Edit** next to a room changes or deletes it
  (deleting also takes it off the board).
- **Click an empty slot** → pick a room, type its number and press Enter, or
  **+ Create new room** to create one straight into that slot.
- **Click a room in the list** to select it on the board, or, if it is not
  placed yet, then click an empty slot to place it.
- **Click a room on the board** to select it. Then: **R** / **Shift+R** rotate,
  **M** move (click a highlighted slot), **Delete** take off the board, **Esc** cancel.
- **Party marker** (pink token): **Place party…** / **Move party…** in the panel
  (or **P**) then click a slot, or drag the token. It can sit on any slot,
  and travels with a green room when that room moves.

## Saving and cloud sync

Rooms, the board and the party marker are saved automatically in this browser (local storage).
**Export file** downloads everything as `mage-puzzle-dungeon.json`; **Import
file** loads it back, e.g. on another computer. Export regularly: clearing
browser data deletes the local copy.

**Cloud sync** keeps the map the same on all your devices. It stores the save
in a *secret GitHub Gist* on your account, so there is no server to run.

1. Create a [fine-grained GitHub token](https://github.com/settings/personal-access-tokens/new)
   with **Permissions → Account → Gists: Read and write** (nothing else) and an expiry date.
2. First device: **Cloud sync → Connect…**, paste the token, leave the ID empty.
   This creates the cloud save from the current map and shows its **Cloud save ID**.
3. Other devices: **Connect…**, paste the token and that ID. The cloud map
   replaces whatever that device had.

After that, every change uploads a moment later, and other devices pick it up
within 30 seconds (or straight away with **Sync now**, or when the tab comes
back into view). Changes made offline stay on the device and upload when the
connection returns. If two devices changed the map at the same time, sync stops
and asks which map to keep instead of overwriting either.

The token stays in that browser's local storage and is only sent to
api.github.com. Anyone with the cloud save ID can read the map, so don't share
it with players. **Disconnect** removes the token from the device; the local map
and the gist stay.

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
│   │   ├── types.ts         # SlotDefinition, RoomDefinition, RoomInstance, RoomType…
│   │   ├── hex.ts           # Hex maths: neighbours, sides, rotation, pixel layout
│   │   ├── board.ts         # Validated fixed board (slots by id / position)
│   │   ├── catalog.ts       # Room list: create / edit / delete, validation
│   │   ├── roomTypes.ts     # What red / blue / green allow, colours, exit names
│   │   ├── dungeon.ts       # Board state: place / rotate / move / remove
│   │   └── persistence.ts   # Save file format, autosave, import validation
│   ├── data/
│   │   ├── board.ts         # ★ Board layout and slot labels
│   │   └── rooms.ts         # Optional built-in rooms (used when nothing is saved)
│   ├── sync/
│   │   ├── remoteStore.ts   # Cloud store interface, errors, revision stamps
│   │   ├── gistStore.ts     # GitHub Gist implementation (api.github.com)
│   │   └── syncManager.ts   # Upload / download / conflict logic
│   ├── render/
│   │   └── boardView.ts     # SVG board: frame, slots, rooms, doors, prismatic core
│   └── ui/
│       ├── controller.ts    # Interaction state: selection, move, picker, editor
│       ├── roomEditor.ts    # Create / edit room dialog
│       ├── exitPicker.ts    # Clickable hexagon + checkboxes for exits
│       ├── roomPicker.ts    # Popover to choose a room for an empty slot
│       ├── controlPanel.ts  # Side panel: selected room, party, room list, files
│       ├── syncPanel.ts     # Cloud sync section and connect dialog
│       └── dom.ts           # Small DOM helpers
├── tests/                   # Vitest unit tests for core/
├── public/                  # Static assets served as-is
└── .github/workflows/ci.yml # Type-check, test and build on every push
```

### Design rules

- **State flows one way.** `RoomCatalog` owns the rooms and `Dungeon` the
  board; the view and panel subscribe and re-render. All changes go through
  their methods, which return `{ ok, error }` so the UI can say why an action
  was refused.
- **Hex grid in doubled-height coordinates** (`q` column, `r` half-row,
  `q + r` even). Rooms fill one slot and rotate in 60° clockwise steps.
- **Types apply after placement.** The DM can place or remove any room;
  red / blue / green restrict what changes afterwards. Set
  `MOVE_RANGE = 'adjacent'` in `src/core/roomTypes.ts` for sliding-puzzle moves.

## Built-in rooms

Rooms are normally created in the app. To ship a fixed set with the code
(used only when a browser has no saved data), export a file and paste its
`rooms` list into `src/data/rooms.ts`:

```ts
{ id: 1, name: 'Flooded Crypt', description: 'Knee-deep black water.', type: 'blue', doors: ['n', 'se'] }
```

Exits are hex edges before rotation: `n`, `ne`, `se`, `s`, `sw`, `nw`.
