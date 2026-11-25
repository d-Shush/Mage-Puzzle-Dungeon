# Mage Puzzle Dungeon

A browser-based dungeon board for a D&D campaign, seen top-down in 2D. The
board is a fixed 5 × 7 grid of square slots (columns A–E, rows 1–7), plus two
slots outside the grid: **C0** above C1 and **C8** below C7. They start with the
prismatic rooms **Shaper's Library** and **Unknown**; every other slot starts
empty.

The DM creates rooms in the app (**+ Add room**), each with:

1. a **name**
2. a **description for players**
3. a **type**:

   | Type      | Rotate          | Move                  |
   | --------- | --------------- | --------------------- |
   | **Red**   | no              | no                    |
   | **Blue**  | yes, 90° steps  | no                    |
   | **Green** | yes, 90° steps  | yes, to an empty slot |
   | **Prismatic** | no          | no (special rooms like Shaper's Library) |

4. **exits**, and
5. an optional **image**, drawn on the map instead of the coloured square
   (cropped to a square and shrunk to 320 px so saves stay small).

4. its **exits**: any of North, East, South, West, shown as gold bars on the
   room's tile. Exits turn with the room.

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

- **Room Journal** opens a book of every room on the map: an index on the left,
  and the room's picture, type, slot and player description on the right.
  **‹ Previous** / **Next ›** (or the arrow keys) turn the pages; **Show on map**
  selects the room, **Edit room** changes or deletes it.
- **Place room…** lists the rooms not on the map yet (each with **Edit**). Pick
  one, then click an empty slot; a preview follows the pointer over empty
  slots. Press the button again (or **Esc**) to cancel.
- **+ Add room** creates a room, optionally with an image.
- **Click an empty slot** → pick a room, type its number and press Enter, or
  **+ Create new room** to create one straight into that slot. Hovering a room
  in that list (or typing its number) previews it, with its exits, in the slot.
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

Columns A–E from the left, rows 1–7 from the top: A1 is top left, E7 bottom
right. C0 sits above C1 and C8 below C7. The layout is in `src/data/board.ts`;
the rooms a new browser starts with are in `src/data/rooms.ts`.

Older saves are converted automatically. From the hex board: rooms are kept,
NE/SE exits become East and NW/SW become West, and rooms need placing again.
From the round-slot board: Shaper's Library and Unknown become prismatic rooms
in C0 and C8, and C4 becomes an ordinary slot.

## Project structure

```
├── index.html               # Page shell: board + side panel
├── src/
│   ├── main.ts              # Composition root
│   ├── styles.css
│   ├── core/                # Game rules — no DOM, fully unit-tested
│   │   ├── types.ts         # SlotDefinition, RoomDefinition, RoomInstance, RoomType…
│   │   ├── grid.ts          # Grid maths: neighbours, sides, rotation
│   │   ├── board.ts         # Validated fixed board (slots by id / position)
│   │   ├── catalog.ts       # Room list: create / edit / delete, validation
│   │   ├── roomTypes.ts     # What red / blue / green allow, colours, exit names
│   │   ├── dungeon.ts       # Board state: place / rotate / move / remove
│   │   └── persistence.ts   # Save file format, autosave, import validation
│   ├── data/
│   │   ├── board.ts         # ★ Board layout: grid size, outer slots
│   │   └── rooms.ts         # Starting rooms for a new browser (Library, Unknown)
│   ├── sync/
│   │   ├── remoteStore.ts   # Cloud store interface, errors, revision stamps
│   │   ├── gistStore.ts     # GitHub Gist implementation (api.github.com)
│   │   └── syncManager.ts   # Upload / download / conflict logic
│   ├── render/
│   │   ├── boardView.ts     # SVG board: frame, square slots, room tiles, exits, ghost preview
│   │   └── roomTile.ts      # Small room tile with exits, used for previews
│   └── ui/
│       ├── controller.ts    # Interaction state: selection, move, picker, editor
│       ├── roomEditor.ts    # Create / edit room dialog
│       ├── exitPicker.ts    # Clickable room tile + checkboxes for exits
│       ├── roomPicker.ts    # Popover to choose a room for an empty slot
│       ├── controlPanel.ts  # Side panel: selected room, party, rooms buttons, files
│       ├── roomJournal.ts   # Book-style dialog of the rooms on the map
│       ├── placeRoomDialog.ts # List of unplaced rooms to place
│       ├── imageFile.ts     # Crop and shrink a picked room image
│       ├── modal.ts         # Shared dialog shell
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
- **Square grid** (`col`, `row`). Rooms fill one slot and rotate in 90°
  clockwise steps.
- **Types apply after placement.** The DM can place or remove any room;
  red / blue / green restrict what changes afterwards. Set
  `MOVE_RANGE = 'adjacent'` in `src/core/roomTypes.ts` for sliding-puzzle moves.

## Built-in rooms

A browser with no saved data starts from `starterSave()` in
`src/data/rooms.ts`: Shaper's Library in C0 and Unknown in C8. To ship more
rooms with the code, export a file from the app and paste its `rooms` and
`board` lists there. Exits are sides before rotation: `n`, `e`, `s`, `w`.
