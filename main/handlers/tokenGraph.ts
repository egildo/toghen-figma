/**
 * The loaded document as a graph: every token, its value in each mode, what it
 * points to and what points to it.
 *
 * The Tokens pane browses the document's own shape, so this reads the document
 * and nothing in Figma. Where a token stands in Figma is `CORRESPONDENCE`'s
 * answer; the screen merges the two by path. See `reference.md`, *The token graph*.
 */

import { cssPropertyName, normalizeColorToSRGB01, type Resolver } from '@toghen/lib';
import type { Response, TokenGraphEntry, TokenGraphPayload } from '../../shared/protocol.js';
import { getState } from '../runtimeState.js';
import { pathsInAnyMode, readToken, referrersOf, resolveSumModes } from '../utils/resolverModes.js';

export async function GET_TOKEN_GRAPH(): Promise<void> {
  const { resolver } = getState();
  if (!resolver) {
    postToUi({
      type: 'ERROR',
      payload: { message: 'Load a resolver document first.', code: 'NO_RESOLVER', commandType: 'GET_TOKEN_GRAPH' },
    });
    return;
  }
  postToUi({ type: 'TOKEN_GRAPH', payload: buildTokenGraph(resolver) });
}

/**
 * Builds the graph from the document's sum: the defaults and each context on
 * its own, which is what Figma holds. A document whose sum cannot be built (a
 * modifier with no default) is refused at load, so none reaches here.
 */
export function buildTokenGraph(resolver: Resolver): TokenGraphPayload {
  const resolution = resolveSumModes(resolver);
  const { ds, dsCollectionName, modeNames: modes } = resolution;
  // Every token, a token some context adds and the defaults do not have among them.
  const paths = pathsInAnyMode(resolution);
  const referrers = referrersOf(resolution, paths);

  const tokens = [...paths.keys()].map((refPath): TokenGraphEntry => {
    const path = `${dsCollectionName}.${refPath}`;
    const valueByMode: Record<string, string | null> = {};
    const references = new Set<string>();
    let type: string | null | undefined;
    for (const mode of modes) {
      const token = readToken(ds, path, mode);
      // A value the core refuses to compute has none to show; the plans say why.
      valueByMode[mode] = token && token.refused === undefined ? displayValue(token) : null;
      if (!token) continue;
      if (type === undefined) type = token.$type ?? null;
      for (const reference of ds.referencesOf(path, mode)) references.add(reference.to);
    }
    return {
      path,
      type: type ?? null,
      group: path.slice(0, path.lastIndexOf('.')),
      valueByMode,
      references: [...references],
      referencedBy: [...new Set((referrers.get(path) ?? []).map((referrer) => referrer.from))],
      codeSyntax: cssPropertyName(path),
    };
  });

  return { modes, tokens };
}

/**
 * A resolved value written for a person to read: a colour as hex, a dimension
 * with its unit, a font list joined, a composite named by its parts. For
 * display only; nothing compares these strings.
 */
export function displayValue(token: { $type: string; $value?: unknown }): string {
  const value: unknown = token.$value;
  try {
    switch (token.$type) {
      case 'color':
        return hexOf(value);
      case 'dimension':
      case 'letterSpacing':
      case 'duration':
        return lengthOf(value);
      case 'fontFamily':
        return Array.isArray(value) ? value.join(', ') : String(value);
      case 'typography': {
        const typography = value as Record<string, unknown>;
        const family = Array.isArray(typography.fontFamily) ? typography.fontFamily[0] : typography.fontFamily;
        return [typography.fontSize !== undefined ? lengthOf(typography.fontSize) : '', family ?? '', typography.fontWeight ?? '']
          .filter((part) => part !== '')
          .join(' ');
      }
      case 'shadow': {
        const layers = Array.isArray(value) ? value : [value];
        return layers.length === 1 ? 'shadow' : `shadow, ${layers.length} layers`;
      }
      default:
        break;
    }
  } catch {
    // Fall through to the plain spelling.
  }
  return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
}

function lengthOf(value: unknown): string {
  if (typeof value === 'object' && value !== null && 'value' in value) {
    const { value: amount, unit } = value as { value: number; unit: string };
    return `${amount}${unit}`;
  }
  return String(value);
}

function hexOf(value: unknown): string {
  const color = normalizeColorToSRGB01(value as Parameters<typeof normalizeColorToSRGB01>[0]);
  const byte = (channel: number) =>
    Math.round(Math.min(1, Math.max(0, channel)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${byte(color.r)}${byte(color.g)}${byte(color.b)}${color.a < 1 ? byte(color.a) : ''}`;
}

function postToUi(response: Response): void {
  figma.ui.postMessage(response);
}
