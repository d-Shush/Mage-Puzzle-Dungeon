import { describe, expect, it } from 'vitest';
import { RoomCatalog, validateRoomInput } from '../src/core/catalog';
import type { RoomInput } from '../src/core/types';

const input: RoomInput = { name: '  Hall of Echoes ', description: ' Whispers. ', type: 'blue', doors: ['w', 'n', 's'] };

describe('validateRoomInput', () => {
  it('trims text and sorts exits clockwise', () => {
    expect(validateRoomInput(input)).toEqual({
      ok: true,
      value: { name: 'Hall of Echoes', description: 'Whispers.', type: 'blue', doors: ['n', 's', 'w'] },
    });
  });

  it('rejects missing names, unknown types and bad exits', () => {
    expect(validateRoomInput({ ...input, name: '   ' }).ok).toBe(false);
    expect(validateRoomInput({ ...input, name: 'x'.repeat(41) }).ok).toBe(false);
    expect(validateRoomInput({ ...input, type: 'purple' as never }).ok).toBe(false);
    expect(validateRoomInput({ ...input, doors: ['up' as never] }).ok).toBe(false);
    expect(validateRoomInput({ ...input, doors: ['ne' as never] }).ok).toBe(false); // hex exits are gone
  });

  it('allows a room with no exits and no description', () => {
    expect(validateRoomInput({ ...input, description: '', doors: [] }).ok).toBe(true);
  });
});

describe('RoomCatalog', () => {
  it('numbers new rooms after the highest existing number', () => {
    const catalog = new RoomCatalog();
    const a = catalog.create(input);
    const b = catalog.create({ ...input, name: 'Second' });
    expect(a.ok && a.value.id).toBe(1);
    expect(b.ok && b.value.id).toBe(2);
    catalog.remove(1);
    const c = catalog.create({ ...input, name: 'Third' });
    expect(c.ok && c.value.id).toBe(3);
  });

  it('edits and deletes rooms, notifying listeners', () => {
    const catalog = new RoomCatalog();
    let calls = 0;
    catalog.subscribe(() => calls++);
    catalog.create(input);
    expect(catalog.update(1, { ...input, type: 'red' }).ok).toBe(true);
    expect(catalog.get(1)?.type).toBe('red');
    expect(catalog.update(1, { ...input, name: '' }).ok).toBe(false);
    expect(catalog.remove(1).ok).toBe(true);
    expect(catalog.remove(1).ok).toBe(false);
    expect(calls).toBe(3);
  });

  it('replaces all rooms atomically', () => {
    const catalog = new RoomCatalog();
    catalog.create(input);
    const bad = [
      { id: 5, ...input },
      { id: 5, ...input },
    ];
    expect(catalog.replaceAll(bad).ok).toBe(false);
    expect(catalog.all().map((r) => r.id)).toEqual([1]);
    expect(catalog.replaceAll([{ id: 5, ...input }]).ok).toBe(true);
    expect(catalog.all().map((r) => r.id)).toEqual([5]);
  });
});
