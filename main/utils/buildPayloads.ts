import type { Resolver } from '@toghen/lib';
import { figmaCollectionNameFor, pathsInAnyMode, readToken, resolveSumModes } from './resolverModes.js';
import { buildSum } from './sum.js';
import { defaultTokenTypeMap, type TokenTypeConversionMap } from '../../shared/tokenTypeMap.js';
import type { DocumentCollectionSummary, DocumentStatePayload, SelectionPayload } from '../../shared/protocol.js';

export function buildDocumentStatePayload(
  resolver: Resolver,
  conversionMap: TokenTypeConversionMap = defaultTokenTypeMap,
  fileName: string | null = null,
): DocumentStatePayload {
  const modifiers: Record<string, string[]> = {};
  const modifierDefaults: Record<string, string> = {};
  for (const modifier of resolver.getModifiers()) {
    modifiers[modifier.name] = modifier.contexts;
    if (modifier.default !== undefined) modifierDefaults[modifier.name] = modifier.default;
  }
  // The sum, as `LOAD_DOCUMENT` builds it; never the product, which a large
  // document cannot finish. The count is of distinct token paths: a token is
  // one token however many modes give it a value.
  const resolution = resolveSumModes(resolver);
  const { ds, dsCollectionName, defaultMode, modeNames } = resolution;
  const paths = pathsInAnyMode(resolution);
  const tokenCount = paths.size;
  let styleCount = 0;
  for (const [path, [mode]] of paths) {
    const type = readToken(ds, `${dsCollectionName}.${path}`, mode)?.$type;
    if (type !== undefined && conversionMap[type]?.target === 'style') styleCount += 1;
  }

  const version = resolver.getDeclaredVersion();
  const collections = sumCollections(resolver, conversionMap);

  return {
    loaded: true,
    name: resolver.name ?? 'Untitled',
    description: resolver.description,
    tokenCount,
    modifiers,
    modes: modeNames,
    modifierDefaults,
    defaultMode,
    ...(version ? { version } : {}),
    ...(fileName ? { fileName } : {}),
    styleCount,
    ...(collections ? { collections } : {}),
  };
}

/**
 * The collections a variable sync would build, with how many variables each
 * would hold, from the same sum the plan builds from.
 *
 * Undefined when the sum cannot be built: the plan says why, and a table drawn
 * from a guess would contradict it.
 */
function sumCollections(resolver: Resolver, conversionMap: TokenTypeConversionMap): DocumentCollectionSummary[] | undefined {
  try {
    const sum = buildSum(resolver, figmaCollectionNameFor(resolver), conversionMap);
    const counts = new Map<string, number>();
    for (const token of sum.tokens) {
      for (const variable of token.variables) {
        counts.set(variable.collection, (counts.get(variable.collection) ?? 0) + 1);
      }
    }
    return sum.collections.map((collection) => ({
      name: collection.name,
      ...(collection.modifier ? { modifier: collection.modifier } : {}),
      // A folded part axis's collection says so, or the screen draws it like the base collection (smell #44).
      ...(collection.axis ? { axis: true as const } : {}),
      modes: [...collection.modes],
      variableCount: counts.get(collection.name) ?? 0,
    }));
  } catch {
    return undefined;
  }
}

export function buildSelectionPayload(selection: readonly SceneNode[]): SelectionPayload {
  return {
    ids: selection.map((node) => node.id),
    names: selection.map((node) => node.name),
    count: selection.length,
  };
}
