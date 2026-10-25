/**
 * The lock: what each name a file uses from a library resolved to, kept on the file's root.
 *
 * Shared plugin data in the `toghen` namespace, under `lock`, sharded (`shardedData.ts`) as kept templates are: a
 * library of a few hundred components passes Figma's 100 kB per entry. It records keys, never what Toghen wrote: no
 * hash, no time, no receipt. Receipts stay one per object. The shape is `reference.md`'s, *The lock*.
 */

import type { Lock, LockedLibrary } from '../../shared/protocol.js';
import { isPlainObject, readSharded, toAsciiJson, writeSharded } from './shardedData.js';

const KEY = 'lock';

/** Our own limit, as for templates: room for a few thousand keys, and for other plugins. */
const MAX_SHARDS = 8;

const BY: readonly LockedLibrary['by'][] = ['discovery', 'build', 'command line', 'person'];

const record = (value: unknown, valid: (entry: unknown) => boolean): boolean => isPlainObject(value) && Object.values(value).every(valid);

export function isLibrary(value: unknown): value is LockedLibrary {
  return (
    isPlainObject(value) &&
    (value.fileKey === undefined || typeof value.fileKey === 'string') &&
    (value.path === undefined || typeof value.path === 'string') &&
    (value.id === undefined || typeof value.id === 'string') &&
    BY.includes(value.by as LockedLibrary['by']) &&
    record(value.components, (entry) => isPlainObject(entry) && typeof entry.key === 'string' && typeof entry.set === 'boolean') &&
    record(
      value.styles,
      (entry) => isPlainObject(entry) && typeof entry.key === 'string' && ['TEXT', 'EFFECT', 'PAINT'].includes(entry.kind as string),
    ) &&
    record(value.variables, (entry) => typeof entry === 'string')
  );
}

/** The file's lock. None, or a damaged record, reads as an empty one: nothing resolves through it. */
export function loadLock(): Lock {
  try {
    const payload = readSharded(KEY);
    const parsed: unknown = payload ? JSON.parse(payload) : undefined;
    if (
      isPlainObject(parsed) &&
      record(parsed.libraries, isLibrary) &&
      (parsed.overrides === undefined || record(parsed.overrides, (entry) => typeof entry === 'string'))
    ) {
      return parsed as unknown as Lock;
    }
  } catch {
    // A damaged record is no record.
  }
  return { libraries: {} };
}

/** Writes the lock. Returns why it could not, rather than throwing. */
export function saveLock(lock: Lock): { ok: true } | { ok: false; reason: string } {
  const written = writeSharded(KEY, toAsciiJson(lock), MAX_SHARDS);
  if (written.ok) return { ok: true };
  if (written.tooBig)
    return {
      ok: false,
      reason: `The lock comes to ${Math.round(written.bytes / 1024)} kB, more than this plugin keeps in one file. Forget a library first.`,
    };
  return { ok: false, reason: written.reason ?? 'Figma refused the write.' };
}

/** A library's entry, or an empty one written by `by`. */
export const libraryIn = (lock: Lock, name: string, by: LockedLibrary['by']): LockedLibrary =>
  lock.libraries[name] ?? { by, components: {}, styles: {}, variables: {} };

/** How a key is written where a name could be: `(key)"…"`, as a component file writes one. */
export const keyIn = (value: string): string | undefined => /^\(key\)"([^"]+)"$/.exec(value)?.[1];
