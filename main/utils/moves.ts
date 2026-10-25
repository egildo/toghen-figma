/**
 * The variables a token has left behind by changing collection.
 *
 * A token's home follows what the document says about it (`sum.ts`): the base collection, a modifier's, a folded
 * axis's. When the document changes where a token lives (it starts to vary on a modifier, stops varying, moves between
 * modifiers, or between the base and a shared axis collection), the variable the last sync wrote for it is in the old
 * collection, and the sync would write a second one in the new. Figma's Plugin API has no move for a variable, so the
 * old one is removed and a new one created: one step.
 *
 * What the sync wrote is what its stamps say it wrote: a variable stamped for the variable's key, in another collection
 * than its home. A variable with no stamp of that key is somebody else's, and is never touched. Nor is one that is not
 * in the collection the sync wrote it in (a person moved it): its receipt is keyed by the ids of the modes it was
 * written in, and none of them is a mode of the collection it is in now. Nor is one in a collection nothing may be
 * written to (`closedBecause`). Only a collection that is still one of the document's counts:
 * a collection the document no longer names (a modifier that is gone, a base collection under another `--collection`
 * name, a collection of a person's own) is left alone, as `variableSyncEngine` already says of it. The step is listed
 * until it is taken: the old variable keeps its stamp until it is removed.
 */

import type { FigmaCollectionIndex } from './figmaCollectionIndex.js';
import { closedBecause, type CollectionStanding } from './standing.js';
import type { Sum } from './sum.js';

/** A stamped variable that is in another collection than its token's home now. */
export interface Move {
  /** The key of the sum variable it was written for. */
  key: string;
  /** The Figma id of the variable to remove. */
  variableId: string;
  /** The variable's name in the old collection. */
  oldName: string;
  /** The old collection. */
  from: string;
  /** The collection the token lives in now. */
  to: string;
  /** The name the token's variable has now. */
  name: string;
}

/** Every variable each sum variable left behind, by its key: more than one where a token moved twice and neither old one was removed. */
export function movesOf(
  sum: Sum,
  standing: ReadonlyMap<string, CollectionStanding>,
  figmaIndex: FigmaCollectionIndex,
): Map<string, Move[]> {
  const moves = new Map<string, Move[]>();
  for (const token of sum.tokens) {
    if (token.routing.kind !== 'variable') continue;
    for (const variable of token.variables) {
      const home = standing.get(variable.collection);
      if (!home || closedBecause(home)) continue;
      for (const old of figmaIndex.variablesByToken[variable.key] ?? []) {
        if (old.variableCollectionId === home.existing?.id) continue;
        const left = figmaIndex.byId[old.variableCollectionId];
        const leftStanding = left ? standing.get(left.name) : undefined;
        if (!left || !leftStanding || leftStanding.existing?.id !== left.id || closedBecause(leftStanding)) continue;
        const writtenHere = left.modes.some((mode) => old.stamp?.receipt[mode.modeId] !== undefined);
        if (!writtenHere) continue;
        moves.set(variable.key, [
          ...(moves.get(variable.key) ?? []),
          { key: variable.key, variableId: old.id, oldName: old.name, from: left.name, to: variable.collection, name: variable.name },
        ]);
      }
    }
  }
  return moves;
}
