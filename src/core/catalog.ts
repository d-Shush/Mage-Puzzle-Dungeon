import { SIDES } from './grid';
import { ROOM_TYPES } from './roomTypes';
import { fail, ok, type Result, type RoomDefinition, type RoomInput } from './types';

export const NAME_MAX = 40;
export const DESCRIPTION_MAX = 2000;

/** Check and normalise what the DM typed. Exits come back in clockwise order. */
export function validateRoomInput(input: RoomInput): Result<RoomInput> {
  const name = (input.name ?? '').trim();
  const description = (input.description ?? '').trim();
  if (!name) return fail('Give the room a name');
  if (name.length > NAME_MAX) return fail(`Keep the name under ${NAME_MAX} characters`);
  if (description.length > DESCRIPTION_MAX) return fail(`Keep the description under ${DESCRIPTION_MAX} characters`);
  if (!Object.hasOwn(ROOM_TYPES, input.type)) return fail('Choose a room type: red, blue or green');
  if (!Array.isArray(input.doors) || input.doors.some((d) => !SIDES.includes(d))) return fail('Unknown exit');
  const doors = SIDES.filter((s) => input.doors.includes(s));
  return ok({ name, description, type: input.type, doors });
}

function validateDefinition(def: RoomDefinition): Result<RoomDefinition> {
  if (!Number.isInteger(def?.id) || def.id <= 0) return fail('Room number must be a positive integer');
  const res = validateRoomInput(def);
  return res.ok ? ok({ id: def.id, ...res.value }) : fail(`Room ${def.id}: ${res.error}`);
}

export type CatalogListener = () => void;

/** The DM's room list: create, edit and delete rooms, looked up by number. */
export class RoomCatalog {
  private byId = new Map<number, RoomDefinition>();
  private listeners = new Set<CatalogListener>();

  /** Throws on invalid initial data (it comes from source code). */
  constructor(initial: readonly RoomDefinition[] = []) {
    const res = RoomCatalog.check(initial);
    if (!res.ok) throw new Error(res.error);
    this.byId = res.value;
  }

  /** Validate a full list of rooms without changing anything. */
  static check(defs: readonly RoomDefinition[]): Result<Map<number, RoomDefinition>> {
    if (!Array.isArray(defs)) return fail('Room list is missing');
    const map = new Map<number, RoomDefinition>();
    for (const def of defs) {
      const res = validateDefinition(def);
      if (!res.ok) return fail(res.error);
      if (map.has(res.value.id)) return fail(`Duplicate room number ${res.value.id}`);
      map.set(res.value.id, res.value);
    }
    return ok(map);
  }

  get(id: number): RoomDefinition | undefined {
    return this.byId.get(id);
  }

  all(): RoomDefinition[] {
    return [...this.byId.values()].sort((a, b) => a.id - b.id);
  }

  get size(): number {
    return this.byId.size;
  }

  create(input: RoomInput): Result<RoomDefinition> {
    const res = validateRoomInput(input);
    if (!res.ok) return fail(res.error);
    const id = 1 + Math.max(0, ...this.byId.keys());
    const def: RoomDefinition = { id, ...res.value };
    this.byId.set(id, def);
    this.emit();
    return ok(def);
  }

  update(id: number, input: RoomInput): Result<RoomDefinition> {
    if (!this.byId.has(id)) return fail(`No room with number ${id}`);
    const res = validateRoomInput(input);
    if (!res.ok) return fail(res.error);
    const def: RoomDefinition = { id, ...res.value };
    this.byId.set(id, def);
    this.emit();
    return ok(def);
  }

  remove(id: number): Result<RoomDefinition> {
    const def = this.byId.get(id);
    if (!def) return fail(`No room with number ${id}`);
    this.byId.delete(id);
    this.emit();
    return ok(def);
  }

  /** Replace every room at once (loading a save). On error nothing changes. */
  replaceAll(defs: readonly RoomDefinition[]): Result<void> {
    const res = RoomCatalog.check(defs);
    if (!res.ok) return fail(res.error);
    this.byId = res.value;
    this.emit();
    return ok(undefined);
  }

  subscribe(listener: CatalogListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}
