/**
 * Where each collection of the sum stands in the Figma file.
 *
 * The plan and the Inspector both ask it, so a collection's id, the id of each of
 * its modes and whether it may be written to are decided once.
 *
 * ### Collections built by an earlier sync
 *
 * The earlier sync built the product: one collection named for the document, a
 * mode per combination of every modifier's contexts. So only the base collection,
 * the one with the document's name, can have been built by it: when it holds any
 * mode other than `default` it is reported as built by an earlier sync and left
 * alone, and the run stops before its first write. A collection named after one
 * of the document's modifiers is the sum's own, whatever modes it holds.
 *
 * ### A modifier's collection that no longer matches its modifier
 *
 * - A mode the modifier no longer has (`goneModes`) is a mode to delete, which
 *   the plan lists as breaking and deletes only when it is allowed to.
 * - Figma's default mode is the first one and is fixed at creation. When the
 *   modifier no longer has that context (`defaultGone`), the collection can
 *   never match the document again: it is reported and nothing is written to it.
 *
 * Moving a file from the product to the sum is a migration, designed when a
 * consumer needs one.
 */

import type { FigmaCollectionIndex, IndexedCollection, IndexedMode } from './figmaCollectionIndex.js';
import type { Sum, SumCollection } from './sum.js';

export function symbolicCollectionId(collectionName: string): string {
  return `$col:${collectionName}`;
}

export function symbolicModeId(collectionName: string, modeName: string): string {
  return `$mode:${collectionName}/${modeName}`;
}

export interface CollectionStanding {
  spec: SumCollection;
  /** The collection of that name in the file, when there is one. */
  existing?: IndexedCollection;
  /**
   * Base collection only: the modes it holds besides `default`. Set means built
   * by an earlier sync: it is reported and never written to.
   */
  strangeModes: string[];
  /** A modifier's collection: the modes it holds that the modifier no longer has. */
  goneModes: IndexedMode[];
  /** A modifier's collection: Figma's default mode, when the modifier no longer has that context. */
  defaultGone?: string;
  /** The real id, or the symbolic one of the collection this plan creates. */
  id: string;
  /** The real mode id, or the symbolic one of a mode this plan creates. */
  modeId(mode: string): string;
}

export function standingOf(sum: Sum, figmaIndex: FigmaCollectionIndex): Map<string, CollectionStanding> {
  const standing = new Map<string, CollectionStanding>();
  for (const spec of sum.collections) {
    const existing = figmaIndex.byName[spec.name];
    const isBase = spec.modifier === undefined && !spec.axis;
    const unknown = existing ? existing.modes.filter((mode) => !spec.modes.includes(mode.name)) : [];
    const figmaDefault = existing?.modes[0]?.name;
    standing.set(spec.name, {
      spec,
      ...(existing ? { existing } : {}),
      strangeModes: isBase ? unknown.map((mode) => mode.name) : [],
      goneModes: isBase ? [] : unknown,
      ...(!isBase && figmaDefault !== undefined && !spec.modes.includes(figmaDefault) ? { defaultGone: figmaDefault } : {}),
      id: existing?.id ?? symbolicCollectionId(spec.name),
      modeId: (mode) => existing?.modes.find((m) => m.name === mode)?.modeId ?? symbolicModeId(spec.name, mode),
    });
  }
  return standing;
}

/** Whether the base collection exists and was built by an earlier sync. */
export const builtEarlier = (standing: CollectionStanding): boolean => standing.strangeModes.length > 0;

/**
 * Why nothing may be written to the collection, when that is so: the short reason a skipped token
 * carries, and the sentence that says it in full.
 */
export function closedBecause(standing: CollectionStanding): { skip: string; message: string } | undefined {
  const name = standing.spec.name;
  if (builtEarlier(standing)) {
    return {
      skip: 'built by an earlier sync',
      message:
        `Collection "${name}" was built by an earlier sync: it holds mode(s) ` +
        `${standing.strangeModes.join(', ')} besides "default". The base collection takes that name, so ` +
        `nothing is written to it. Rename or delete the old collection, or sync under another collection name.`,
    };
  }
  if (standing.defaultGone !== undefined) {
    return {
      skip: 'default mode removed',
      message:
        `Collection "${name}" has "${standing.defaultGone}" as its default mode, which the modifier no longer ` +
        `has. Figma fixes a collection's default mode when the collection is created and cannot reassign it, so ` +
        `nothing is written to this collection; recreating it is a migration.`,
    };
  }
  return undefined;
}
