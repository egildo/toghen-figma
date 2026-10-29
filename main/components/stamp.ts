/**
 * What is ours in a Figma file, and how an object says so.
 *
 * The Figma file is a target of the token file, and Toghen keeps what it wrote there on each object it wrote: a
 * stamp, in shared plugin data in the `toghen` namespace, the one the plugin already uses on the document root.
 * Shared rather than private, because the script an agent runs and the plugin are different plugins and both must
 * read the stamps. A stamp says what the object is and, for each field Toghen owns, a hash of what Figma reported
 * right after the write: a receipt, never the value. Kept on the object, it cannot be carried onto another one.
 *
 * Deleting a set and building it again changes its key and breaks every instance of it, so the durable behaviour
 * is to reconcile in place, and reconciling needs to know which nodes Toghen made. A name cannot say it, since a
 * designer renames layers.
 *
 * `getStamp` and `setStamp` are the ruled form, one key on every object (decisions, *Ruled: the stamp, one receipt
 * per object, for every target*). A node may still carry the six keys components were stamped with before it:
 * `stampOn` reads them as a stamp, and `updateStamp` writes the stamp and deletes them, one way.
 *
 * A stamp records the id of the object it was written on, since a person's copy carries the original's stamp; `sortOut`
 * tells the two apart (decisions, *Ruled: a copy carries the stamp*). A step that deletes an object Toghen wrote strips
 * the stamp from every copy of it (`strip`, `copiesFinder`), so the copy is never taken for the original moved
 * (decisions, *A copy whose original Toghen removes*).
 *
 * `reference.md`, *The stamp* and *Component files*, owns the keys and their values.
 */

import { hashOf } from '../../shared/components/diff.js';
import { getState } from '../runtimeState.js';
import { flatMap } from '../utils/lists.js';
import { findInEveryPage } from '../utils/pageRoots.js';

export { hashOf };

export const NAMESPACE = 'toghen';

export interface Position {
  x: number;
  y: number;
}

/** The one key a stamp is kept under, on a variable, a collection, a style or a node alike. */
export const STAMP_KEY = 'stamp';

/** What an object is. A node can be two things at once: a member's root is a member and a layer. */
export interface Identity {
  /** A variable or a style: the token it holds, by the path the sync keys it by. */
  token?: string;
  /** A collection of one modifier: the modifier's name. */
  modifier?: string;
  /** The base collection, which holds every token no modifier defines. */
  base?: true;
  /** A component set: the component's name in the file. */
  component?: string;
  /** A member: its combination, `Axis=value, Axis=value`. */
  member?: string;
  /** A layer, the root included: its address in the file. */
  address?: string;
  /** An artboard's frame: the artboard's name in the file. */
  artboard?: string;
}

/** A variable a field was bound to when Toghen wrote it. */
export interface BoundVariable {
  id: string;
  name: string;
}

/** What Toghen keeps on an object it wrote. */
export interface Stamp {
  is: Identity;
  /**
   * The Figma id of the object the stamp was written on. A copy a person makes carries the stamp of the object it was
   * made from, and this is what tells the two apart (`isOwn`). Absent on a stamp written before it was recorded.
   */
  id?: string;
  /** For each field Toghen owns on the object, a hash of what Figma reported right after Toghen wrote it (`receiptOf`). */
  receipt: Record<string, string>;
  /**
   * For each field Toghen bound when it wrote it, the variables it was bound to, by id and by name. A field that no
   * longer shows its receipt, whose variable is gone or whose id now names another, lost its binding with the variable,
   * not by hand (`orphaned`). Absent on a stamp written before it was recorded.
   */
  bound?: Record<string, BoundVariable[]>;
  /** On a set or an artboard's frame: where Toghen last put it. A node whose position still equals it has not been moved by hand. */
  placed?: Position;
  /**
   * On a set or an artboard's frame: what the last run that finished it would have written, hashed (`fingerprintOf`).
   * A run told to skip what has not changed leaves the set or artboard unread while it is the same.
   */
  fingerprint?: string;
}

const IDENTITY_TEXT = ['token', 'modifier', 'component', 'member', 'address', 'artboard'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const positionOf = (value: unknown): { placed: Position } | Record<string, never> =>
  isRecord(value) && typeof value.x === 'number' && typeof value.y === 'number' ? { placed: { x: value.x, y: value.y } } : {};

/**
 * A receipt's hash for a field Toghen owns but cannot prove Figma holds what it wrote, as after an older build: no
 * report hashes to it, so the field reads as drift, kept and reported, until Figma holds the source's value again.
 */
export const UNPROVEN = 'unproven';

/** A receipt from what Figma reports for each field, read back right after the write so a later read compares exactly. */
export function receiptOf(reported: Record<string, unknown>): Record<string, string> {
  const receipt: Record<string, string> = {};
  for (const [field, value] of Object.entries(reported)) receipt[field] = hashOf(value);
  return receipt;
}

/** The object a stamp is written on: anything with shared plugin data and an id. */
export type Stamped = PluginDataMixin & { readonly id: string };

/** A stamp as it is kept on `object`: with the object's own id, whatever id `value` named. */
const textOf = (object: Stamped, value: Stamp): string => JSON.stringify({ ...value, id: object.id });

/** Writes the stamp, replacing the one there, with the object's own id. */
export function setStamp(object: Stamped, value: Stamp): void {
  object.setSharedPluginData(NAMESPACE, STAMP_KEY, textOf(object, value));
}

/**
 * The object's stamp, or `undefined` when it has none or one this code cannot read. Never throws. An object with no
 * stamp of its own reads the one a dry run's migration would have written on it (`unwrittenStamps`).
 */
export function getStamp(object: PluginDataMixin): Stamp | undefined {
  try {
    const text = object.getSharedPluginData(NAMESPACE, STAMP_KEY);
    if (text === '') return getState().unwrittenStamps?.get((object as Partial<Stamped>).id ?? '');
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.is) || !isRecord(parsed.receipt)) return undefined;
    const is: Identity = {};
    for (const facet of IDENTITY_TEXT) {
      const text = parsed.is[facet];
      if (typeof text === 'string') is[facet] = text;
    }
    if (parsed.is.base === true) is.base = true;
    if (Object.keys(is).length === 0) return undefined;
    const receipt: Record<string, string> = {};
    for (const [field, hash] of Object.entries(parsed.receipt)) if (typeof hash === 'string') receipt[field] = hash;
    const bound: Record<string, BoundVariable[]> = {};
    if (isRecord(parsed.bound))
      for (const [field, variables] of Object.entries(parsed.bound))
        if (Array.isArray(variables))
          bound[field] = variables.filter((v): v is BoundVariable => isRecord(v) && typeof v.id === 'string' && typeof v.name === 'string');
    return {
      is,
      ...(typeof parsed.id === 'string' ? { id: parsed.id } : {}),
      receipt,
      ...(Object.keys(bound).length > 0 ? { bound } : {}),
      ...positionOf(parsed.placed),
      ...(typeof parsed.fingerprint === 'string' ? { fingerprint: parsed.fingerprint } : {}),
    };
  } catch (_unreadable) {
    // No stamp reads as an empty string, which does not parse; a stamp someone edited by hand is not ours to interpret.
    return undefined;
  }
}

/** The keys components were stamped under before the stamp, read until a node's next write moves it over. */
const OLD_KEYS = ['component', 'properties', 'member', 'address', 'artboard', 'placed'] as const;

function oldKey(node: PluginDataMixin, key: (typeof OLD_KEYS)[number]): unknown {
  const text = node.getSharedPluginData(NAMESPACE, key);
  if (text === '' || key === 'component' || key === 'member' || key === 'artboard') return text === '' ? undefined : text;
  try {
    return JSON.parse(text);
  } catch (_unreadable) {
    return undefined;
  }
}

/**
 * What a node's old keys say, as a stamp. A field or a property they list is owned, with no hash yet: the next run
 * writes it, as the old code wrote a member's every run. An artboard's layer is the exception: the old code wrote it
 * only when the file moved (its digest), so a field edited by hand since was kept. Its fields are `UNPROVEN`: the
 * next run takes the receipt of each Figma holds the file's value in, and keeps any other as drift.
 */
function fromOldKeys(node: PluginDataMixin): Stamp | undefined {
  const is: Identity = {};
  for (const facet of ['component', 'member', 'artboard'] as const) {
    const text = oldKey(node, facet);
    if (typeof text === 'string') is[facet] = text;
  }
  const layer = oldKey(node, 'address');
  if (isRecord(layer) && typeof layer.address === 'string') is.address = layer.address;
  if (Object.keys(is).length === 0) return undefined;
  const properties = oldKey(node, 'properties');
  const owned = [...(isRecord(layer) && Array.isArray(layer.fields) ? layer.fields : []), ...(Array.isArray(properties) ? properties : [])];
  const hash = isRecord(layer) && typeof layer.digest === 'string' ? UNPROVEN : '';
  const receipt: Record<string, string> = {};
  for (const field of owned) if (typeof field === 'string') receipt[field] = hash;
  return { is, receipt, ...positionOf(oldKey(node, 'placed')) };
}

/** A node's stamp, or what its old keys say. */
export function stampOn(node: PluginDataMixin): Stamp | undefined {
  return getStamp(node) ?? fromOldKeys(node);
}

/** Writes a node's stamp over the one it has, keeping what `change` leaves out, and deletes the node's old keys. A stamp that would not change, its id included, is not written. */
export function updateStamp(node: Stamped, change: Partial<Stamp>): void {
  const held = stampOn(node);
  const placed = change.placed ?? held?.placed;
  const fingerprint = change.fingerprint ?? held?.fingerprint;
  const bound = change.bound ?? held?.bound;
  const next: Stamp = {
    is: { ...held?.is, ...change.is },
    receipt: change.receipt ?? held?.receipt ?? {},
    ...(bound && Object.keys(bound).length > 0 ? { bound } : {}),
    ...(placed ? { placed } : {}),
    ...(fingerprint ? { fingerprint } : {}),
  };
  // A stamp that names another id, or none, is written again with the node's.
  if (node.getSharedPluginData(NAMESPACE, STAMP_KEY) !== textOf(node, next)) setStamp(node, next);
  for (const key of OLD_KEYS) if (node.getSharedPluginData(NAMESPACE, key) !== '') node.setSharedPluginData(NAMESPACE, key, '');
}

/** What `findAllWithCriteria` finds a node stamped as `facet` by: its stamp, or the old key of that facet (either matches). */
export const stampedAs = (facet: 'component' | 'member' | 'artboard' | 'address'): { namespace: string; keys: string[] } => ({
  namespace: NAMESPACE,
  keys: [STAMP_KEY, facet],
});

// ---------------------------------------------------------------------------
// a copy carries the stamp
// ---------------------------------------------------------------------------

/**
 * Whether a stamp is the object's own: written on it, by its id. A stamp written before the id was recorded has none,
 * and is read as its own; the next write gives it the id (decisions, *Ruled: a copy carries the stamp*).
 */
export const isOwn = (object: { readonly id: string }, stamp: Stamp): boolean => stamp.id === undefined || stamp.id === object.id;

/** Figma's ids in string order: which of several copies is taken for an original that is gone. */
const byId = (a: { readonly id: string }, b: { readonly id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Stamped objects, sorted by `sortOut`. */
export interface Sorted<T> {
  /** Toghen's, in the order given: each object whose stamp is its own, and each original that moved. */
  ours: T[];
  /** Those of `ours` whose stamp names another id: the original, moved (a cut and paste gives a node a new id). Its next write records its own. */
  moved: Set<T>;
  /** The copies a person made, each with the object it is a copy of. Never patched, never deleted, never counted as Toghen's. */
  copies: Array<{ copy: T; of: T }>;
}

/**
 * Tells Toghen's objects from the copies a person made of them: the one place that decides, and every reader that
 * groups objects by their stamps goes through it.
 *
 * A copy carries the stamp of the object it was made from, id and all, so every object whose stamp names an id that is
 * not its own claims to be the object with that id. Where that object exists and its stamp is its own, it is Toghen's
 * and the claimants are its copies. Where it is gone, the claimant with the lowest Figma id, in string order, is the
 * original moved, and the others are copies of it. `find` looks an object up by id wherever it is: an original may be on
 * another page, or in another member, than its copy. Objects with no stamp are left out.
 */
export async function sortOut<T extends { readonly id: string }>(
  objects: readonly T[],
  stampOf: (object: T) => Stamp | undefined,
  find: (id: string) => T | null | undefined | Promise<T | null | undefined>,
): Promise<Sorted<T>> {
  const own = new Set<T>();
  const claims = new Map<string, T[]>();
  for (const object of objects) {
    const stamp = stampOf(object);
    if (!stamp) continue;
    if (isOwn(object, stamp)) own.add(object);
    else claims.set(stamp.id as string, [...(claims.get(stamp.id as string) ?? []), object]);
  }
  const moved = new Set<T>();
  const copies: Sorted<T>['copies'] = [];
  for (const [id, claimants] of claims) {
    const found = await find(id);
    const held = found ? stampOf(found) : undefined;
    const rest = [...claimants].sort(byId);
    let of = found && held && isOwn(found, held) ? found : undefined;
    if (!of) {
      of = rest.shift() as T;
      own.add(of);
      moved.add(of);
    }
    for (const copy of rest) copies.push({ copy, of });
  }
  return { ours: objects.filter((object) => own.has(object)), moved, copies };
}

/** `sortOut` for nodes, each found by id anywhere in the file. Every page must be loaded first. */
export const sortNodes = <T extends SceneNode>(nodes: readonly T[]): Promise<Sorted<T>> =>
  sortOut(nodes, stampOn, async (id) => (await figma.getNodeByIdAsync(id)) as T | null);

// ---------------------------------------------------------------------------
// a copy whose original Toghen removes
// ---------------------------------------------------------------------------

/**
 * Removes Toghen's stamp from an object, and nothing else of it: a person's copy whose original a run deletes becomes
 * the person's own, never adopted as the original moved, never removed (decisions, *A copy whose original Toghen removes*).
 */
export const strip = (object: PluginDataMixin): void => object.setSharedPluginData(NAMESPACE, STAMP_KEY, '');

/** Strips the nodes a deletion step carries, once the deletion has run. One already gone is passed over. */
export async function stripNodes(ids: readonly string[] = []): Promise<void> {
  for (const id of ids) {
    const node = await figma.getNodeByIdAsync(id);
    if (node && !node.removed) strip(node as SceneNode);
  }
}

/** What a deletion's row says of the copies it strips: `its copy "Footer" (12:3) keeps no stamp`. */
export const keepsNoStamp = (copies: ReadonlyArray<{ readonly id: string; readonly name: string }>): string =>
  `its ${copies.length === 1 ? 'copy' : 'copies'} ${copies.map((copy) => `"${copy.name}" (${copy.id})`).join(', ')} ${copies.length === 1 ? 'keeps' : 'keep'} no stamp`;

/** Of these nodes, those inside none of the others: what a row names, since what is inside a copy goes with it. */
export function outermost<T extends BaseNode>(nodes: readonly T[]): T[] {
  const ids = new Set(nodes.map((node) => node.id));
  return nodes.filter((node) => {
    for (let up = node.parent; up && up.type !== 'PAGE'; up = up.parent) if (ids.has(up.id)) return false;
    return true;
  });
}

/**
 * Reads every page's stamped nodes once, and returns what finds the copies of a node a step deletes: each stamped node
 * outside it whose stamp names the id of the node or of a node inside it (or an id one of their stamps names, for an
 * original moved), grouped as `sortOut` groups them. A copied frame holds copies of the layers in it, so they are found
 * too. `inside: false` is for a node whose children outlive it, as a replaced layer's do. Every page must be loaded.
 */
export function copiesFinder(): (gone: SceneNode, inside?: boolean) => SceneNode[] {
  const naming = new Map<string, SceneNode[]>();
  for (const node of findInEveryPage({ sharedPluginData: { namespace: NAMESPACE, keys: [STAMP_KEY] } })) {
    const stamp = getStamp(node);
    if (stamp?.id !== undefined && stamp.id !== node.id) naming.set(stamp.id, [...(naming.get(stamp.id) ?? []), node]);
  }
  return (gone, inside = true) => {
    const ids = new Set<string>();
    const named = new Set<string>();
    const walk = (node: BaseNode): void => {
      ids.add(node.id);
      named.add(node.id);
      const id = getStamp(node as SceneNode)?.id;
      if (id !== undefined) named.add(id);
      if (inside && 'children' in node) for (const child of node.children) walk(child);
    };
    walk(gone);
    return flatMap([...named], (id) => naming.get(id) ?? []).filter((copy) => !ids.has(copy.id));
  };
}
