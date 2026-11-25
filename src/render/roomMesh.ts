import * as THREE from 'three';
import { SIDE_OFFSETS, cellKey, worldCells, worldDoors } from '../core/geometry';
import type { GridPos, RoomDefinition, RoomInstance, Side } from '../core/types';

/** World units per grid cell. */
export const CELL_SIZE = 1;

const FLOOR_THICKNESS = 0.05;
const WALL_THICKNESS = 0.08;
const DOOR_WIDTH = 0.45;
const DOOR_HEIGHT = 0.7;

const MOBILITY_TRIM: Record<RoomDefinition['mobility'], number> = {
  fixed: 0x8a8f99,
  rotatable: 0x4fa3ff,
  movable: 0xffb347,
};

export interface RoomObject {
  readonly group: THREE.Group;
  readonly floorMaterial: THREE.MeshStandardMaterial;
}

/**
 * Build the 3D object for a placed room: one floor tile per cell, walls on
 * every outer cell edge, and an opening wherever the room has a door.
 * The mesh is built from world cells, so it always matches the core rules.
 */
export function buildRoomObject(room: RoomInstance, def: RoomDefinition): RoomObject {
  const group = new THREE.Group();
  group.name = room.instanceId;
  group.userData.instanceId = room.instanceId;

  const cells = worldCells(def, room.position, room.rotation);
  const cellSet = new Set(cells.map(cellKey));
  const doorSet = new Set(worldDoors(def, room.position, room.rotation).map((d) => `${cellKey(d.cell)}:${d.side}`));
  const wallHeight = (def.wallHeight ?? 1) * CELL_SIZE;

  const floorMaterial = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.9 });
  const wallMaterial = new THREE.MeshStandardMaterial({ color: MOBILITY_TRIM[def.mobility], roughness: 0.7 });

  const floorGeo = new THREE.BoxGeometry(CELL_SIZE * 0.98, FLOOR_THICKNESS, CELL_SIZE * 0.98);
  for (const c of cells) {
    const tile = new THREE.Mesh(floorGeo, floorMaterial);
    tile.position.set((c.x + 0.5) * CELL_SIZE, FLOOR_THICKNESS / 2, (c.z + 0.5) * CELL_SIZE);
    tile.receiveShadow = true;
    group.add(tile);
  }

  for (const c of cells) {
    for (const side of Object.keys(SIDE_OFFSETS) as Side[]) {
      const off = SIDE_OFFSETS[side];
      if (cellSet.has(cellKey({ x: c.x + off.x, z: c.z + off.z }))) continue;
      const isDoor = doorSet.has(`${cellKey(c)}:${side}`);
      for (const mesh of buildWall(c, side, wallHeight, isDoor, wallMaterial)) group.add(mesh);
    }
  }

  return { group, floorMaterial };
}

/** Wall segment(s) on one edge of a cell; a door leaves a gap with a lintel. */
function buildWall(cell: GridPos, side: Side, height: number, isDoor: boolean, material: THREE.Material): THREE.Mesh[] {
  const off = SIDE_OFFSETS[side];
  // Centre of the edge, pulled slightly inside the cell so neighbouring rooms don't z-fight.
  const cx = (cell.x + 0.5 + off.x * (0.5 - WALL_THICKNESS / 2)) * CELL_SIZE;
  const cz = (cell.z + 0.5 + off.z * (0.5 - WALL_THICKNESS / 2)) * CELL_SIZE;
  const alongX = off.z !== 0; // north/south walls run along X

  const piece = (length: number, h: number, along: number, y: number): THREE.Mesh => {
    const geo = alongX
      ? new THREE.BoxGeometry(length, h, WALL_THICKNESS)
      : new THREE.BoxGeometry(WALL_THICKNESS, h, length);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(cx + (alongX ? along : 0), y, cz + (alongX ? 0 : along));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  if (!isDoor) return [piece(CELL_SIZE, height, 0, height / 2)];

  const doorW = DOOR_WIDTH * CELL_SIZE;
  const doorH = Math.min(DOOR_HEIGHT * CELL_SIZE, height);
  const sideLen = (CELL_SIZE - doorW) / 2;
  const meshes = [
    piece(sideLen, height, -(doorW + sideLen) / 2, height / 2),
    piece(sideLen, height, (doorW + sideLen) / 2, height / 2),
  ];
  if (height > doorH) meshes.push(piece(doorW, height - doorH, 0, doorH + (height - doorH) / 2));
  return meshes;
}

/** Free GPU resources of a room object. */
export function disposeRoomObject(obj: RoomObject): void {
  const seen = new Set<unknown>();
  obj.group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      for (const res of [o.geometry, o.material]) {
        if (!seen.has(res)) {
          seen.add(res);
          (res as { dispose(): void }).dispose();
        }
      }
    }
  });
}
