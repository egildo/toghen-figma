/**
 * The token a style name is spelled from, when a file names a style through references.
 *
 * `effectStyle="{kbd.boxShadow}"` where `kbd.boxShadow` is only `{elevation.raised}` binds the style the target
 * becomes, as a reference to a token Figma holds is an alias of it. The chain of whole-value references is followed
 * to the first token that is not one, in the default context (styles have no modes). If that token is not a style of
 * the kind asked for, or the path is not in the document, the path asked about is returned unchanged and names what
 * it named before.
 */

import type { Resolver } from '@toghen/lib';
import type { TokenTypeConversionMap } from '../../shared/tokenTypeMap.js';
import { resolveSumModes, snapshotModes, type SnapshotToken } from './resolverModes.js';
import { referencePath } from '@toghen/lib';

export function styleTargetOf(
  resolver: Resolver | null | undefined,
  conversionMap: TokenTypeConversionMap,
): (path: string, styleType: 'TEXT' | 'EFFECT') => string {
  let read: { tokens: Map<string, SnapshotToken>; prefix: string } | null | undefined;
  const tokens = () => {
    if (read === undefined) {
      read = null;
      if (resolver) {
        try {
          const resolution = resolveSumModes(resolver);
          const snapshot = snapshotModes(resolution).find((s) => s.modeName === resolution.defaultMode);
          if (snapshot) read = { tokens: snapshot.pathToToken, prefix: `${resolution.dsCollectionName}.` };
        } catch {
          // a document the sum cannot be built from names no style through a reference
        }
      }
    }
    return read;
  };

  return (path, styleType) => {
    const found = tokens();
    if (!found) return path;
    const seen = new Set<string>();
    for (let at = path; !seen.has(at); ) {
      seen.add(at);
      const token = found.tokens.get(`${found.prefix}${at}`);
      if (!token) return path;
      if (!token.aliasOf)
        return conversionMap[token.type]?.target === 'style' && conversionMap[token.type]?.styleType === styleType ? at : path;
      at = referencePath(token.aliasOf);
    }
    return path;
  };
}
