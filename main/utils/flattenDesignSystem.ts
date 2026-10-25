import type { DesignSystem, DesignToken } from '@toghen/lib';

export interface FlattenedTokenEntry {
  path: string;
  token: DesignToken;
  collection: string;
}

/**
 * Yields every token of a `DesignSystem`, resolved.
 *
 * A system may hold a multi-mode collection alongside a single-mode one, and a
 * mode that only some collections know about skips the others rather than
 * aborting the walk (`getAllPaths()` throws `InvalidModeError` for a mode its
 * collection does not declare).
 *
 * @param ds - The system to walk
 * @param mode - Optional mode; collections lacking it are skipped. When omitted,
 *   each collection's own default mode is used.
 */
export function* flattenDesignSystem(ds: DesignSystem, mode?: string): Generator<FlattenedTokenEntry> {
  for (const collectionName of ds.getCollectionNames()) {
    const collection = ds.getCollection(collectionName);
    if (!collection) continue;

    if (mode !== undefined && !collection.getModes().includes(mode)) {
      continue;
    }

    for (const tokenPath of collection.getAllPaths(mode)) {
      const path = `${collectionName}.${tokenPath}`;
      const token = ds.resolveToken(path, mode);
      if (!token) continue;

      yield { path, token, collection: collectionName };
    }
  }
}
