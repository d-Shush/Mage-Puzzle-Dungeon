# Mage Puzzle Dungeon

A browser-based 3D dungeon map to support a D&D campaign. The DM adds rooms to
the map by their number from a fixed catalogue. Each room is one of:

| Mobility    | Can rotate | Can move | Wall colour |
| ----------- | ---------- | -------- | ----------- |
| `fixed`     | no         | no       | grey        |
| `rotatable` | yes (90°)  | no       | blue        |
| `movable`   | no         | yes      | orange      |

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

The build is a static site with relative paths, so `dist/` can be hosted
anywhere (GitHub Pages, Netlify, a USB stick at the table).

## Controls

- Type a room number and press **Add room** — it is placed on the nearest free spot.
- **Click** a room to select it; drag to orbit, scroll to zoom, right-drag to pan.
- **Arrow keys** move a movable room, **R** rotates a rotatable room,
  **Delete** removes, **Esc** deselects.
- **Save / Load** keep the map in this browser's local storage.

## Project structure

```
├── index.html               # Page shell: canvas + side panel
├── src/
│   ├── main.ts              # Composition root: wires core, render and UI
│   ├── styles.css
│   ├── core/                # Game rules — no Three.js, no DOM, fully unit-tested
│   │   ├── types.ts         # RoomDefinition, RoomInstance, Mobility, Rotation…
│   │   ├── mobility.ts      # What fixed / rotatable / movable allow (single source of truth)
│   │   ├── geometry.ts      # Grid maths: rotating footprints and doors
│   │   ├── catalog.ts       # Validated lookup of the fixed room list by number
│   │   ├── dungeon.ts       # Map state: add / move / rotate / remove, collisions, snapshots
│   │   └── persistence.ts   # Save / load snapshot in localStorage
│   ├── data/
│   │   └── rooms.ts         # ★ The room catalogue — edit this to define your rooms
│   ├── render/              # Three.js — a read-only projection of the dungeon state
│   │   ├── sceneManager.ts  # Scene, camera, lights, picking, syncing with state
│   │   └── roomMesh.ts      # Builds floor tiles, walls and door openings for a room
│   └── ui/
│       └── controlPanel.ts  # Side panel and keyboard shortcuts
├── tests/                   # Vitest unit tests for core/
├── public/                  # Static assets (textures, models) served as-is
└── .github/workflows/ci.yml # Type-check, test and build on every push
```

### Design rules

- **State flows one way.** `Dungeon` owns the map; the scene and the panel
  subscribe to it and re-render. Neither changes the map except through
  `Dungeon` methods, which return `{ ok, error }` so the UI can say why an
  action was refused (e.g. "Blocked by another room").
- **Grid-based.** Rooms are sets of cells on an integer grid. Rotation is in
  90° clockwise steps around the room origin cell `(0, 0)`. Rooms never overlap.
- **Mobility applies after placement.** The DM can place any room anywhere;
  `fixed` / `rotatable` / `movable` restrict what can change afterwards. Tweak
  `src/core/mobility.ts` to change those rules (e.g. let movable rooms rotate too).

## Adding rooms to the catalogue

Edit `src/data/rooms.ts`. The current six rooms are placeholders.

```ts
{
  id: 7,                        // the number typed in to add it; must be unique
  name: 'Flooded Crypt',
  description: 'Knee-deep black water.',
  mobility: 'rotatable',        // 'fixed' | 'rotatable' | 'movable'
  footprint: [                  // cells relative to the origin; rotation pivots on (0,0)
    { x: 0, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 1 },
  ],
  doors: [{ cell: { x: 1, z: 0 }, side: 'east' }],
  color: '#2b4a5a',
  wallHeight: 1,                // optional, in cells
}
```

`x` grows east, `z` grows south. The catalogue is validated on start-up
(unique ids, non-empty footprint, doors on footprint cells).
