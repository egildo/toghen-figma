/**
 * Reads the stamps on the file's variables and styles into something the screen can say.
 *
 * ### Why this exists
 *
 * Each variable and style a sync writes carries a stamp (`tokenStamps.ts`): the
 * token it holds and a receipt of what was written. The dirty check reads them,
 * and without this none of it would reach the UI: a user opening a file they
 * synced last week would have no way to learn that they had.
 *
 * ### What "covered" means here, exactly
 *
 * A token is covered when its variable's stamp holds a receipt for **every mode
 * that token actually has a value in**, not every mode the document declares.
 * A token contributed only by `dark` is complete with one, and measuring it
 * against both modes would report it permanently half-done. This mirrors
 * `VariableSyncEngine`, which builds `staleModes` only from modes where the
 * token resolves; the two have to agree or the status contradicts the plan.
 *
 * Style-backed tokens are the exception: Figma styles have no modes, so a style
 * stamped for the token is complete.
 *
 * ### What it deliberately does not claim
 *
 * Coverage is *presence of a stamp*, not currency. A token whose document value
 * changed since the last sync still counts as covered: the stamp exists, the
 * document has simply moved, and the plan is what says so. Answering "is it up
 * to date?" here would mean keeping a second copy of the dirty check in step
 * with the engine's. One dirty check, in the engine, is the arrangement worth having.
 */

import type { Resolver } from '@toghen/lib';
import type { SyncStatePayload } from '../../shared/protocol.js';
import { defaultTokenTypeMap, type TokenTypeConversionMap } from '../../shared/tokenTypeMap.js';
import { indexFigmaCollections, type FigmaCollectionIndex } from './figmaCollectionIndex.js';
import { figmaCollectionNameFor } from './resolverModes.js';
import { buildSum, type SumToken } from './sum.js';
import { localStyles } from './tokenStamps.js';

/**
 * Builds the payload describing what this Figma file's stamps say about being synced.
 *
 * @param resolver - The loaded document, or `null`. Without one the file-level
 *   facts are still answered and the coverage counts are `null`: there is
 *   nothing to measure the stamps against, and reporting `0` would read as
 *   "nothing is synced" when the truth is "nothing has been asked".
 */
export async function buildSyncStatePayload(
  resolver: Resolver | null,
  conversionMap: TokenTypeConversionMap = defaultTokenTypeMap,
): Promise<SyncStatePayload> {
  const figmaIndex = await indexFigmaCollections();
  const styled = new Set<string>();
  for (const { stamp } of await localStyles()) if (stamp?.is.token !== undefined) styled.add(stamp.is.token);
  const tokens = [...Object.keys(figmaIndex.variablesByToken), ...styled];
  const recordedCount = Object.values(figmaIndex.variablesByToken).reduce((count, stamped) => count + stamped.length, 0) + styled.size;

  const base = {
    hasRecord: recordedCount > 0,
    recordedCount,
    recordNames: recordNamesOf(tokens),
  };

  if (!resolver) {
    return { ...base, documentTokenCount: null, coveredCount: null, partialCount: null };
  }

  let sumTokens: SumToken[];
  try {
    sumTokens = buildSum(resolver, figmaCollectionNameFor(resolver), conversionMap).tokens;
  } catch {
    // A document the sum cannot be built from has no coverage to count; the plan says why.
    return { ...base, documentTokenCount: null, coveredCount: null, partialCount: null };
  }

  let covered = 0;
  let partial = 0;
  for (const token of sumTokens) {
    const coverage = token.routing.kind === 'style' ? (styled.has(token.path) ? 'covered' : 'none') : coverageOfToken(token, figmaIndex);
    if (coverage === 'covered') covered += 1;
    if (coverage === 'partial') partial += 1;
  }

  return {
    ...base,
    documentTokenCount: sumTokens.length,
    coveredCount: covered,
    partialCount: partial,
  };
}

type Coverage = 'covered' | 'partial' | 'none';

/**
 * A token is the variables it is made of: one, or the links of a chain, each
 * stamped with a key of its own. It is covered when every one of them is.
 */
function coverageOfToken(token: SumToken, figmaIndex: FigmaCollectionIndex): Coverage {
  if (token.variables.length === 0) return 'none';

  const each = token.variables.map((variable): Coverage => {
    const collection = figmaIndex.byName[variable.collection];
    const stamped = figmaIndex.variablesByToken[variable.key]?.find((held) => held.variableCollectionId === collection?.id);
    const modes = [...variable.cells.keys()];
    if (!stamped || !collection || modes.length === 0) return 'none';
    const receipt = stamped.stamp?.receipt ?? {};
    const recorded = modes.filter((mode) => {
      const modeId = collection.modes.find((held) => held.name === mode)?.modeId;
      return modeId !== undefined && receipt[modeId] !== undefined;
    }).length;
    if (recorded === modes.length) return 'covered';
    return recorded > 0 ? 'partial' : 'none';
  });
  if (each.every((coverage) => coverage === 'covered')) return 'covered';
  return each.some((coverage) => coverage !== 'none') ? 'partial' : 'none';
}

/**
 * Whose stamps they are: the leading segment of every token they name, each
 * once, in the order first met.
 *
 * A lookup path starts with the document's name, which is also the name of the
 * base collection variable sync writes, so this names the documents synced into
 * the file without a document loaded to compare against.
 */
function recordNamesOf(tokens: readonly string[]): string[] {
  const names = new Set<string>();
  for (const path of tokens) {
    const dot = path.indexOf('.');
    if (dot > 0) names.add(path.slice(0, dot));
  }
  return [...names];
}
