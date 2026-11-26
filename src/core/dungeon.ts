import type { Board } from './board';
import type { RoomCatalog } from './catalog';
import { SIDES, addRotation, neighbour, rotateSide } from './grid';
import { MOVE_RANGE, ROOM_TYPES } from './roomTypes';
import { fail, ok, type Result, type RoomDefinition, type RoomInstance, type Rotation, type Side } from './types';

const opposite = (side: Side): Side => SIDES[(SIDES.indexOf(side) + 2) % 4] as Side;

export type DungeonListener = (rooms: readonly RoomInstance[]) => void;

/**
 * State of the board and its rules: which room sits in which slot, and what
 * may be rotated or moved. Every mutation returns a Result instead of throwing
 * so the UI can show why an action was refused.
 *
 * Listeners are also notified when the room catalogue changes (a room was
 * edited or deleted), so one subscription keeps the whole UI in sync.
 */
export class Dungeon {
  private rooms = new Map<string, RoomInstance>();
  /** Slot the party marker is on, or undefined when it is not on the map. */
  private partySlot: string | undefined;
  private listeners = new Set<DungeonListener>();
  private nextId = 1;

  constructor(
    readonly board: Board,
    readonly catalog: RoomCatalog,
    /** Throwaway copies used for validation must not listen to the catalogue. */
    watchCatalog = true,
  ) {
    if (!watchCatalog) return;
    catalog.subscribe(() => {
      // A deleted room also leaves the board.
      for (const [id, room] of this.rooms) if (!catalog.get(room.definitionId)) this.rooms.delete(id);
      this.emit();
    });
  }

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
    if (!def) throw new Error(`Unknown room ${room.definitionId}`);
    return def;
  }

  /** Where a catalogue room is on the board, if it is. */
  placementOf(definitionId: number): RoomInstance | undefined {
    for (const room of this.rooms.values()) if (room.definitionId === definitionId) return room;
    return undefined;
  }

  /** Catalogue rooms not yet on the board. */
  available(): RoomDefinition[] {
    return this.catalog.all().filter((d) => !this.placementOf(d.id));
  }

  /** Name a slot for messages: "C0, Shaper's Library" or just "B2" when empty. */
  describeSlot(slotId: string): string {
    const room = this.roomAt(slotId);
    return room ? `${slotId}, ${this.definitionOf(room).name}` : slotId;
  }

  /** Whether a slot can receive a room (exists and is empty). */
  checkSlotFree(slotId: string): Result<void> {
    if (!this.board.get(slotId)) return fail(`No slot ${slotId}`);
    if (this.roomAt(slotId)) return fail(`Slot ${slotId} is already occupied`);
    return ok(undefined);
  }

  /** Sides of a room's slot that have an exit, after rotation. */
  exitsOf(def: RoomDefinition, rotation: Rotation): Side[] {
    return def.doors.map((d) => rotateSide(d, rotation));
  }

  /** Rooms on the board sharing a side with the slot, with the side they are on. */
  private neighbourRooms(slotId: string): { side: Side; room: RoomInstance }[] {
    const slot = this.board.get(slotId);
    if (!slot) return [];
    const out: { side: Side; room: RoomInstance }[] = [];
    for (const side of SIDES) {
      const c = neighbour(slot.coord, side);
      const next = this.board.all().find((s) => s.coord.col === c.col && s.coord.row === c.row);
      const room = next && this.roomAt(next.id);
      if (room) out.push({ side, room });
    }
    return out;
  }

  /**
   * Neighbouring slots a room in `slotId` would connect to: its exit on that
   * side meets an exit of the neighbouring room.
   */
  connections(slotId: string, def: RoomDefinition, rotation: Rotation): string[] {
    const exits = new Set(this.exitsOf(def, rotation));
    return this.neighbourRooms(slotId)
      .filter(({ side, room }) => exits.has(side) && this.exitsOf(this.definitionOf(room), room.rotation).includes(opposite(side)))
      .map(({ room }) => room.slotId);
  }

  /**
   * Whether a catalogue room can go into a slot, and in which rotation.
   * - The slot must be free and, unless the board is empty, next to a room.
   * - The room must connect: one of its exits meets an exit of a neighbour.
   *   Rooms that rotate try each rotation, starting from `preferred`; the
   *   others are checked as they are.
   */
  placementRotation(slotId: string, definitionId: number, preferred: Rotation = 0): Result<Rotation> {
    const def = this.catalog.get(definitionId);
    if (!def) return fail(`No room with number ${definitionId}`);
    const free = this.checkSlotFree(slotId);
    if (!free.ok) return fail(free.error);
    const existing = this.placementOf(definitionId);
    if (existing) return fail(`${def.name} is already on the board in ${existing.slotId}`);
    if (this.rooms.size === 0) return ok(preferred);
    if (this.neighbourRooms(slotId).length === 0) return fail(`${slotId} is not next to a room. Rooms can only be placed next to a room on the board`);
    if (!ROOM_TYPES[def.type].canRotate) {
      if (this.connections(slotId, def, 0).length) return ok(0);
      return fail(`${def.name} cannot go in ${slotId}: none of its exits meets an exit of a neighbouring room`);
    }
    for (let step = 0; step < 4; step++) {
      const rotation = addRotation(preferred, step);
      if (this.connections(slotId, def, rotation).length) return ok(rotation);
    }
    return fail(`${def.name} cannot go in ${slotId}: no rotation connects it to a neighbouring room`);
  }

  /** Empty slots the catalogue room can be placed in. */
  placementTargets(definitionId: number): string[] {
    return this.board.all().filter((s) => this.placementRotation(s.id, definitionId).ok).map((s) => s.id);
  }

  /** Slots the given room may move to. Empty if the room cannot move. */
  moveTargets(instanceId: string): string[] {
    const room = this.rooms.get(instanceId);
    if (!room || !ROOM_TYPES[this.definitionOf(room).type].canMove) return [];
    const candidates = MOVE_RANGE === 'adjacent' ? this.board.neighbours(room.slotId) : this.board.all();
    return candidates.filter((s) => this.checkSlotFree(s.id).ok).map((s) => s.id);
  }

  /** Slot where the party is, if the marker is on the board. */
  get party(): string | undefined {
    return this.partySlot;
  }

  // ---------- mutations ----------

  /**
   * Put the party marker on a slot, or take it off the board (undefined).
   * Any slot works, including empty ones.
   */
  setParty(slotId: string | undefined): Result<string | undefined> {
    if (slotId !== undefined && !this.board.get(slotId)) return fail(`No slot ${slotId}`);
    this.partySlot = slotId;
    this.emit();
    return ok(slotId);
  }

  /**
   * Place a catalogue room (by number) into an empty slot next to a room it
   * connects to. Rooms that rotate are turned to the first rotation that connects.
   */
  place(slotId: string, definitionId: number): Result<RoomInstance> {
    const rotation = this.placementRotation(slotId, definitionId);
    if (!rotation.ok) return fail(rotation.error);
    return this.commit({ instanceId: `room-${this.nextId++}`, definitionId, slotId, rotation: rotation.value });
  }

  /** Take a room off the board. Always allowed (DM correction). */
  remove(instanceId: string): Result<RoomInstance> {
    const room = this.rooms.get(instanceId);
    if (!room) return fail('Room not found');
    this.rooms.delete(instanceId);
    this.emit();
    return ok(room);
  }

  /** Rotate by 90° clockwise (direction 1) or counter-clockwise (-1). */
  rotate(instanceId: string, direction: 1 | -1 = 1): Result<RoomInstance> {
    const room = this.rooms.get(instanceId);
    if (!room) return fail('Room not found');
    const def = this.definitionOf(room);
    if (!ROOM_TYPES[def.type].canRotate) return fail(`${def.name} is a ${ROOM_TYPES[def.type].label.toLowerCase()} room and cannot rotate`);
    // With rooms around it, a room must stay connected: skip rotations that are not.
    if (this.neighbourRooms(room.slotId).length === 0) return this.commit({ ...room, rotation: addRotation(room.rotation, direction) });
    for (let step = 1; step < 4; step++) {
      const rotation = addRotation(room.rotation, direction * step);
      if (this.connections(room.slotId, def, rotation).length) return this.commit({ ...room, rotation });
    }
    return fail(`${def.name} has no other rotation that connects to a neighbouring room`);
  }

  move(instanceId: string, toSlotId: string): Result<RoomInstance> {
    const room = this.rooms.get(instanceId);
    if (!room) return fail('Room not found');
    const def = this.definitionOf(room);
    if (!ROOM_TYPES[def.type].canMove) return fail(`${def.name} is a ${ROOM_TYPES[def.type].label.toLowerCase()} room and cannot move`);
    const free = this.checkSlotFree(toSlotId);
    if (!free.ok) return fail(free.error);
    if (!this.moveTargets(instanceId).includes(toSlotId)) return fail(`${def.name} can only move to an adjacent slot`);
    // A party inside the room travels with it.
    if (this.partySlot === room.slotId) this.partySlot = toSlotId;
    return this.commit({ ...room, slotId: toSlotId });
  }

  clear(): void {
    this.rooms.clear();
    this.emit();
  }

  /** Replace the whole board. Validates every room; on error nothing changes. */
  load(rooms: readonly RoomInstance[]): Result<void> {
    const res = this.check(rooms);
    if (!res.ok) return res;
    this.rooms = new Map(rooms.map((r) => [r.instanceId, r]));
    this.nextId = 1 + Math.max(0, ...rooms.map((r) => Number(r.instanceId.replace(/\D/g, '')) || 0));
    this.emit();
    return ok(undefined);
  }

  /** Validate a board against this board layout and catalogue. */
  check(rooms: readonly RoomInstance[]): Result<void> {
    if (!Array.isArray(rooms)) return fail('Board is missing');
    const staged = new Dungeon(this.board, this.catalog, false);
    for (const r of rooms) {
      if (typeof r?.instanceId !== 'string' || staged.rooms.has(r.instanceId)) return fail('Duplicate or missing room id on the board');
      if (!this.catalog.get(r.definitionId)) return fail(`Board uses unknown room ${String(r.definitionId)}`);
      if (staged.placementOf(r.definitionId)) return fail(`Room ${r.definitionId} is on the board twice`);
      if (!Number.isInteger(r.rotation) || r.rotation < 0 || r.rotation > 3) return fail('Invalid rotation on the board');
      const free = staged.checkSlotFree(r.slotId);
      if (!free.ok) return fail(free.error);
      staged.rooms.set(r.instanceId, r);
    }
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
