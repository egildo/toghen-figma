/**
 * The FigCraft target's stamps: one record on a page, keyed by object id.
 *
 * In FigCraft only layers and pages hold data, not variables or styles, so the stamps Figma keeps on each variable and
 * style live together on a page (decisions, *Ruled: the stamp, one receipt per object, for every target*). Each entry
 * is the stamp `setStamp` writes, in the same shape, so the plans read it through the same `getStamp` they use in
 * Figma: each listed variable and style is given the shared data calls, answered from the record (`attach`).
 *
 * FigCraft gives a new object the highest id in use plus one, so deleting the newest variable and making another
 * hands the old id over (measured, decisions, *What the build found: stamps in FigCraft*). Each entry therefore notes
 * what it was written on, and an entry whose object is gone or is now of another kind is dropped (`guard`).
 *
 * Nothing here talks to FigCraft; `figcraft.ts` reads the record at the start of a run and writes it at the end.
 */

import { NAMESPACE, STAMP_KEY } from '../main/components/stamp.js';

/** The key the record is kept under, in the data of the page that holds it. The page is found by this key, not its name. */
export const RECORD_KEY = 'toghen';

/** The page a first write makes, when no page holds the record: a name starting with `-` makes it a divider. */
export const RECORD_PAGE = '-toghen';

/** One object's entry: what it was when its stamp was written, and the stamp, as `setStamp` wrote it. */
interface Entry {
  of: string;
  stamp: unknown;
}

/** The stamps of a FigCraft file, by object id. */
export type StampRecord = Map<string, Entry>;

/** A variable or a style as the FigCraft view lists it: enough to say what it is. */
type Listed = { readonly id: string; readonly type?: string; readonly resolvedType?: string; readonly variableCollectionId?: string };

/** What an object is, for the guard: a variable's type and collection, a style's type. A rename keeps it. */
const kindOf = (object: Listed): string =>
  object.variableCollectionId !== undefined ? `variable ${object.resolvedType} ${object.variableCollectionId}` : `style ${object.type}`;

/** The record as the page holds it, or an empty one when the page holds none, or holds text this code cannot read. */
export function readRecord(text: string | undefined): StampRecord {
  const record: StampRecord = new Map();
  if (!text) return record;
  try {
    const stamps = (JSON.parse(text) as { stamps?: unknown }).stamps;
    if (typeof stamps !== 'object' || stamps === null) return record;
    for (const [id, entry] of Object.entries(stamps)) {
      if (typeof entry?.of === 'string' && entry.stamp !== undefined) record.set(id, { of: entry.of, stamp: entry.stamp });
    }
  } catch (_unreadable) {
    // A record someone edited by hand is not ours to interpret: every object reads as unstamped, as on a first run.
  }
  return record;
}

/**
 * What the record keeps beside the stamps. FigCraft's document root holds no data, so the root's shared plugin data
 * (the lock, under `toghen/lock`) is kept here, by `<namespace>/<key>`; and so is what each library copy in the file
 * was imported from (`copies`: a copy's id → its key, `<library id>:<asset id>`), which FigCraft gives no read for.
 */
export interface Extras {
  root: Map<string, string>;
  copies: Map<string, string>;
}

const strings = (value: unknown): Map<string, string> =>
  new Map(
    typeof value === 'object' && value !== null
      ? Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      : [],
  );

/** What the record keeps beside the stamps; an old record, or one this code cannot read, keeps nothing. */
export function readExtras(text: string | undefined): Extras {
  try {
    const parsed = text ? (JSON.parse(text) as { root?: unknown; copies?: unknown }) : {};
    return { root: strings(parsed.root), copies: strings(parsed.copies) };
  } catch (_unreadable) {
    return { root: new Map(), copies: new Map() };
  }
}

/** The record as the page keeps it. */
export const recordText = (record: StampRecord, extras?: Extras): string =>
  JSON.stringify({
    stamps: Object.fromEntries(record),
    ...(extras && extras.root.size > 0 ? { root: Object.fromEntries(extras.root) } : {}),
    ...(extras && extras.copies.size > 0 ? { copies: Object.fromEntries(extras.copies) } : {}),
  });

/** Drops each entry whose object is gone, or is now another kind of object or in another collection: an id FigCraft gave again. */
export function guard(record: StampRecord, objects: readonly Listed[]): void {
  const listed = new Map(objects.map((object) => [object.id, object]));
  for (const [id, entry] of record) {
    const object = listed.get(id);
    if (!object || kindOf(object) !== entry.of) record.delete(id);
  }
}

/**
 * Gives each object the shared data calls `getStamp` and `setStamp` make, answered from `record`. A write calls
 * `changed`, so the record is written back only when a run wrote a stamp.
 */
export function attach(objects: readonly Listed[], record: StampRecord, changed: () => void): void {
  const owns = (namespace: string, key: string) => namespace === NAMESPACE && key === STAMP_KEY;
  for (const object of objects) {
    Object.assign(object, {
      getSharedPluginData: (namespace: string, key: string): string => {
        const entry = owns(namespace, key) ? record.get(object.id) : undefined;
        return entry ? JSON.stringify(entry.stamp) : '';
      },
      setSharedPluginData: (namespace: string, key: string, value: string): void => {
        if (!owns(namespace, key)) throw new Error(`FigCraft keeps no data under ${namespace}/${key} on a variable or a style.`);
        if (value === '') record.delete(object.id);
        else record.set(object.id, { of: kindOf(object), stamp: JSON.parse(value) });
        changed();
      },
      getSharedPluginDataKeys: (namespace: string): string[] => (namespace === NAMESPACE && record.has(object.id) ? [STAMP_KEY] : []),
    });
  }
}
