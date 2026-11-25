import type { RoomCatalog } from './catalog';
import { cellKey, nextRotation, worldCells } from './geometry';
import { MOBILITY_RULES } from './mobility';
import type {
  DungeonSnapshot,
  GridPos,
  Result,
  RoomDefinition,
  RoomInstance,
  Rotation,
} from './types';

export type DungeonListener = (rooms: readonly RoomInstance[]) => void;

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: string): Result<T> => ({ ok: false, error });

/**
 * The map state and its rules: placement, collisions and mobility.
 * Every mutation goes through here and returns a Result instead of throwing,
 * so the UI can show the reason a move was refused.
 */
export class Dungeon {
  private rooms = new Map<string, RoomInstance>();
  private listeners = new Set<DungeonListener>();
  private nextId = 1;

  constructor(private readonly catalog: RoomCatalog) {}

  // ---------- queries ----------

  list(): RoomInstance[] {
    return [...this.rooms.values()];
  }

  get(instanceId: string): RoomInstance | undefined {
    return this.rooms.get(instanceId);
  }

  definitionOf(room: RoomInstance): RoomDefinition {
    const def = this.catalog.get(room.definitionId);
    if (!def) throw new Error(`Unknown room definition ${room.definitionId}`);
    return def;
  }

  /** Map of occupied cell -> instanceId, optionally ignoring one room. */
  occupancy(ignoreInstanceId?: string): Map<string, string> {
    const occ = new Map<string, string>();
    for (const room of this.rooms.values()) {
      if (room.instanceId === ignoreInstanceId) continue;
      for (const c of worldCells(this.definitionOf(room), room.position, room.rotation)) {
        occ.set(cellKey(c), room.instanceId);
      }
    }
    return occ;
  }

  canPlace(def: RoomDefinition, position: GridPos, rotation: Rotation, ignoreInstanceId?: string): boolean {
    const occ = this.occupancy(ignoreInstanceId);
    return worldCells(def, position, rotation).every((c) => !occ.has(cellKey(c)));
  }

  /** Nearest free position to `near` (square spiral search). */
  findFreePosition(def: RoomDefinition, rotation: Rotation = 0, near: GridPos = { x: 0, z: 0 }, maxRadius = 50): GridPos | undefined {
    for (let r = 0; r <= maxRadius; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const pos = { x: near.x + dx, z: near.z + dz };
          if (this.canPlace(def, pos, rotation)) return pos;
        }
      }
    }
    return undefined;
  }

  // ---------- mutations ----------

  /**
   * Add a room from the catalogue by its number. Without a position the room
   * is put on the nearest free spot to the origin. Placement by the DM is
   * always allowed regardless of mobility; mobility restricts later changes.
   */
  add(definitionId: number, position?: GridPos, rotation: Rotation = 0): Result<RoomInstance> {
    const def = this.catalog.get(definitionId);
    if (!def) return fail(`No room with number ${definitionId}`);

    const pos = position ?? this.findFreePosition(def, rotation);
    if (!pos) return fail('No free space for this room');
    if (!this.canPlace(def, pos, rotation)) return fail('That space is already occupied');

    const room: RoomInstance = {
      instanceId: `room-${this.nextId++}`,
      definitionId,
      position: pos,
      rotation,
    };
    this.rooms.set(room.instanceId, room);
    this.emit();
    return ok(room);
  }

  remove(instanceId: string): Result<RoomInstance> {
    const room = this.rooms.get(instanceId);
    if (!room) return fail('Room not found');
    this.rooms.delete(instanceId);
    this.emit();
    return ok(room);
  }

  /** Move a room by a grid offset. Only allowed for movable rooms. */
  move(instanceId: string, delta: GridPos): Result<RoomInstance> {
    const room = this.rooms.get(instanceId);
    if (!room) return fail('Room not found');
    const def = this.definitionOf(room);
    if (!MOBILITY_RULES[def.mobility].canMove) return fail(`${def.name} cannot be moved`);

    const position = { x: room.position.x + delta.x, z: room.position.z + delta.z };
    if (!this.canPlace(def, position, room.rotation, instanceId)) return fail('Blocked by another room');
    return this.replace({ ...room, position });
  }

  /** Rotate a room 90° clockwise in place. Only allowed for rotatable rooms. */
  rotate(instanceId: string): Result<RoomInstance> {
    const room = this.rooms.get(instanceId);
    if (!room) return fail('Room not found');
    const def = this.definitionOf(room);
    if (!MOBILITY_RULES[def.mobility].canRotate) return fail(`${def.name} cannot be rotated`);

    const rotation = nextRotation(room.rotation);
    if (!this.canPlace(def, room.position, rotation, instanceId)) return fail('Not enough room to rotate');
    return this.replace({ ...room, rotation });
  }

  clear(): void {
    this.rooms.clear();
    this.emit();
  }

  // ---------- persistence ----------

  toSnapshot(): DungeonSnapshot {
    return { version: 1, rooms: this.list() };
  }

  /** Replace the whole map. Validates every room; on error nothing changes. */
  loadSnapshot(snapshot: DungeonSnapshot): Result<void> {
    if (snapshot.version !== 1) return fail(`Unsupported save version ${String(snapshot.version)}`);
    const staged = new Dungeon(this.catalog);
    for (const r of snapshot.rooms) {
      const def = this.catalog.get(r.definitionId);
      if (!def) return fail(`Save references unknown room ${r.definitionId}`);
      if (!staged.canPlace(def, r.position, r.rotation)) return fail(`Overlapping room ${r.instanceId} in save`);
      staged.rooms.set(r.instanceId, r);
    }
    this.rooms = staged.rooms;
    this.nextId = 1 + Math.max(0, ...this.list().map((r) => Number(r.instanceId.replace(/\D/g, '')) || 0));
    this.emit();
    return ok(undefined);
  }

  // ---------- events ----------

  subscribe(listener: DungeonListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private replace(room: RoomInstance): Result<RoomInstance> {
    this.rooms.set(room.instanceId, room);
    this.emit();
    return ok(room);
  }

  private emit(): void {
    const rooms = this.list();
    for (const l of this.listeners) l(rooms);
  }
}
