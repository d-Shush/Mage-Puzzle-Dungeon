import type { Board } from './board';
import type { RoomCatalog } from './catalog';
import { addRotation } from './hex';
import { MOBILITY_RULES, MOVE_RANGE } from './mobility';
import type { DungeonSnapshot, Result, RoomDefinition, RoomInstance } from './types';

export type DungeonListener = (rooms: readonly RoomInstance[]) => void;

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: string): Result<T> => ({ ok: false, error });

/**
 * State of the board and its rules: which room sits in which slot, and what
 * may be rotated or moved. Every mutation returns a Result instead of throwing
 * so the UI can show why an action was refused.
 */
export class Dungeon {
  private rooms = new Map<string, RoomInstance>();
  private listeners = new Set<DungeonListener>();
  private nextId = 1;

  constructor(
    readonly board: Board,
    readonly catalog: RoomCatalog,
  ) {}

  // ---------- queries ----------

  list(): RoomInstance[] {
    return [...this.rooms.values()];
  }

  get(instanceId: string): RoomInstance | undefined {
    return this.rooms.get(instanceId);
  }

  roomAt(slotId: string): RoomInstance | undefined {
    for (const room of this.rooms.values()) if (room.slotId === slotId) return room;
    return undefined;
  }

  definitionOf(room: RoomInstance): RoomDefinition {
    const def = this.catalog.get(room.definitionId);
    if (!def) throw new Error(`Unknown room definition ${room.definitionId}`);
    return def;
  }

  placedCount(definitionId: number): number {
    let n = 0;
    for (const room of this.rooms.values()) if (room.definitionId === definitionId) n++;
    return n;
  }

  remainingCopies(def: RoomDefinition): number {
    return (def.maxCopies ?? 1) - this.placedCount(def.id);
  }

  /** Catalogue rooms that still have a copy left to place. */
  available(): RoomDefinition[] {
    return this.catalog.all().filter((d) => this.remainingCopies(d) > 0);
  }

  /** Whether a slot can receive a room (exists, is not the core, is empty). */
  checkSlotFree(slotId: string): Result<void> {
    const slot = this.board.get(slotId);
    if (!slot) return fail(`No slot ${slotId}`);
    if (slot.kind === 'core') return fail('The prismatic core cannot hold a room');
    if (this.roomAt(slotId)) return fail(`Slot ${slotId} is already occupied`);
    return ok(undefined);
  }

  /** Slots the given room may move to. Empty if the room cannot move. */
  moveTargets(instanceId: string): string[] {
    const room = this.rooms.get(instanceId);
    if (!room || !MOBILITY_RULES[this.definitionOf(room).mobility].canMove) return [];
    const candidates = MOVE_RANGE === 'adjacent' ? this.board.neighbours(room.slotId) : this.board.all();
    return candidates.filter((s) => this.checkSlotFree(s.id).ok).map((s) => s.id);
  }

  // ---------- mutations ----------

  /** Place a catalogue room (by number) into an empty slot. */
  place(slotId: string, definitionId: number): Result<RoomInstance> {
    const def = this.catalog.get(definitionId);
    if (!def) return fail(`No room with number ${definitionId}`);
    const free = this.checkSlotFree(slotId);
    if (!free.ok) return fail(free.error);
    if (this.remainingCopies(def) <= 0) return fail(`${def.name} is already on the board`);

    const room: RoomInstance = { instanceId: `room-${this.nextId++}`, definitionId, slotId, rotation: 0 };
    return this.commit(room);
  }

  /** Remove a room from the board. Always allowed (DM correction). */
  remove(instanceId: string): Result<RoomInstance> {
    const room = this.rooms.get(instanceId);
    if (!room) return fail('Room not found');
    this.rooms.delete(instanceId);
    this.emit();
    return ok(room);
  }

  /** Rotate by 60° clockwise (direction 1) or counter-clockwise (-1). */
  rotate(instanceId: string, direction: 1 | -1 = 1): Result<RoomInstance> {
    const room = this.rooms.get(instanceId);
    if (!room) return fail('Room not found');
    const def = this.definitionOf(room);
    if (!MOBILITY_RULES[def.mobility].canRotate) return fail(`${def.name} cannot be rotated`);
    return this.commit({ ...room, rotation: addRotation(room.rotation, direction) });
  }

  move(instanceId: string, toSlotId: string): Result<RoomInstance> {
    const room = this.rooms.get(instanceId);
    if (!room) return fail('Room not found');
    const def = this.definitionOf(room);
    if (!MOBILITY_RULES[def.mobility].canMove) return fail(`${def.name} cannot be moved`);
    const free = this.checkSlotFree(toSlotId);
    if (!free.ok) return fail(free.error);
    if (!this.moveTargets(instanceId).includes(toSlotId)) return fail(`${def.name} can only move to an adjacent slot`);
    return this.commit({ ...room, slotId: toSlotId });
  }

  clear(): void {
    this.rooms.clear();
    this.emit();
  }

  // ---------- persistence ----------

  toSnapshot(): DungeonSnapshot {
    return { version: 2, rooms: this.list() };
  }

  /** Replace the whole board. Validates every room; on error nothing changes. */
  loadSnapshot(snapshot: DungeonSnapshot): Result<void> {
    if (snapshot?.version !== 2 || !Array.isArray(snapshot.rooms)) return fail('Unsupported or corrupt save');
    const staged = new Dungeon(this.board, this.catalog);
    for (const r of snapshot.rooms) {
      if (!this.catalog.get(r.definitionId)) return fail(`Save references unknown room ${r.definitionId}`);
      if (!Number.isInteger(r.rotation) || r.rotation < 0 || r.rotation > 5) return fail('Corrupt rotation in save');
      const free = staged.checkSlotFree(r.slotId);
      if (!free.ok) return fail(`Invalid save: ${free.error}`);
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

  private commit(room: RoomInstance): Result<RoomInstance> {
    this.rooms.set(room.instanceId, room);
    this.emit();
    return ok(room);
  }

  private emit(): void {
    const rooms = this.list();
    for (const l of this.listeners) l(rooms);
  }
}
