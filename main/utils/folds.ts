/**
 * Parts folded into modes, or left as one variable each.
 *
 * A subgroup whose key is in the parts vocabulary is a part (lib's `partsOf`). A component is the group
 * above the first part of a path, and it varies along the vocabulary's axes. Each axis, for each component, is
 * either folded or not:
 *
 * - **Folded:** a collection named after the axis, `rest` first and a mode per value. The variable of the
 *   rest token (the path with the part segment removed) takes its cell in a mode from the part token.
 * - **Not folded:** the segment stays in the path, and the part token is a variable of its own.
 *
 * The decision is per axis per component, in the vocabulary's order, and the reason an axis did not fold is kept
 * to be said. This file only decides and re-homes; where a token lives otherwise is `sum.ts`.
 */

import { cssLinkName, cssPropertyName, referencePath, type Collection, type Part, type Resolver } from '@toghen/lib';
import { REST } from '../../shared/components/axes.js';
import { flatMap } from './lists.js';
import { MAX_MODES } from './resolverModes.js';
import { linkVariableName } from './tokenPath.js';
import type { SumCell, SumCollection, SumToken, SumVariable } from './sum.js';

/**
 * The component groups a loaded document lays out as one variable per part (`layout=parts` in a component file),
 * as the command line told the plugin when it checked the files. Every plan and every reader of the sum asks it,
 * so they agree on where a variable is.
 */
const unfolded = new WeakMap<Resolver, readonly string[]>();
export const unfoldedFor = (resolver: Resolver): readonly string[] => unfolded.get(resolver) ?? [];
export const setUnfolded = (resolver: Resolver, groups: readonly string[]): void => void unfolded.set(resolver, groups);

export interface AxisFold {
  axis: string;
  /** The part keys the component uses on this axis, in the vocabulary's order. */
  values: string[];
  folded: boolean;
  /** Why it did not fold, in words. */
  why?: string;
}

export interface ComponentFold {
  /** The component's group: the path above the first part. */
  group: string;
  /** Every axis its parts use, in the vocabulary's order. */
  axes: AxisFold[];
}

export interface Folds {
  components: ComponentFold[];
  /** Folded axis to the modes of its collection, `rest` first, shared by every component that folds it. */
  collections: Map<string, string[]>;
  /** Rest path to folded axis (in vocabulary order) to mode to the path of the part token that gives it. */
  parts: Map<string, Map<string, Map<string, string>>>;
}

/**
 * Decides, for every component the paths hold, which axes fold. `unfold` names the groups laid out as
 * one variable per part whatever the tokens allow (`layout=parts`). Throws what lib throws for a bad vocabulary
 * or two parts of one axis on a path.
 */
export function foldsOf(collection: Collection, paths: readonly string[], unfold: readonly string[] = []): Folds {
  // Each part token by its component (lib's `partsOf`), with the parts it passes through and their twins.
  const byGroup = new Map<string, { path: string; parts: Part[] }[]>();
  for (const path of paths) {
    const { parts, component } = collection.partsOf(path);
    if (component === null) continue;
    (byGroup.get(component) ?? byGroup.set(component, []).get(component)!).push({ path, parts });
  }

  const folds: Folds = { components: [], collections: new Map(), parts: new Map() };
  for (const [group, tokens] of byGroup) {
    const folded = new Set<string>();
    const axes: AxisFold[] = [];
    // The component's axes and their values, in precedence order (lib's `axesOf`).
    for (const { axis, values } of collection.axesOf(group)) {
      const partOf = (token: (typeof tokens)[number]) => token.parts.find((part) => part.axis === axis);
      const carrying = tokens.filter((token) => partOf(token) !== undefined);
      if (carrying.length === 0) continue;
      const clash = carrying.find((token) => token.parts.some((part) => folded.has(part.axis)));
      // The twin along this axis: the token its cell falls back to.
      const lacking = carrying.find((token) => !partOf(token)!.twinExists);
      const modes = folds.collections.get(axis) ?? [REST];
      const merged = [...modes, ...values.filter((value) => !modes.includes(value))];
      const why = unfold.includes(group)
        ? 'the component is laid out as one variable per part (layout=parts)'
        : clash
          ? `"${clash.path}" carries it together with the folded "${clash.parts.find((part) => folded.has(part.axis))!.axis}"`
          : lacking
            ? `no rest value: "${lacking.path}" needs "${partOf(lacking)!.twin}", which is not defined`
            : merged.length > MAX_MODES
              ? `its values ${merged.slice(MAX_MODES).join(', ')} do not fit the ${folds.collections.has(axis) ? 'shared ' : ''}collection "${axis}", which already holds ${modes.length} mode${modes.length === 1 ? '' : 's'} (${modes.join(', ')}) and Figma allows ${MAX_MODES}`
              : undefined;
      axes.push({ axis, values, folded: why === undefined, ...(why ? { why } : {}) });
      if (why) continue;
      folded.add(axis);
      folds.collections.set(axis, merged);
      for (const token of carrying) {
        const { twin: rest, key } = partOf(token)!;
        const modesOf = folds.parts.get(rest) ?? folds.parts.set(rest, new Map()).get(rest)!;
        const byMode = modesOf.get(axis) ?? modesOf.set(axis, new Map()).get(axis)!;
        byMode.set(key, token.path);
      }
    }
    folds.components.push({ group, axes });
  }
  return folds;
}

/** What a component's layout is, in one sentence, when some axis stays in the path; `undefined` when every axis folded. */
export function layoutSaid({ group, axes }: ComponentFold): string | undefined {
  const stays = axes.filter((axis) => !axis.folded);
  if (stays.length === 0) return undefined;
  const folded = axes.filter((axis) => axis.folded);
  return (
    `"${group}": ` +
    (folded.length > 0 ? `folds ${folded.map((axis) => `"${axis.axis}" (modes ${[REST, ...axis.values].join(', ')})`).join(', ')}; ` : '') +
    stays.map((axis) => `"${axis.axis}" stays in the path, one variable per part: ${axis.why}`).join('; ') +
    '.'
  );
}

/**
 * Re-homes the tokens a fold touches. A rest token's variable becomes the head of a chain through the folded
 * axes' collections, in vocabulary order (the later axis wins, as the later modifier does), above any chain the
 * worlds already made. Each cell takes the part token's cell, an alias to the part token's own variable when it
 * varies with a world and so keeps one, and falls back to the rest where there is no part token.
 *
 * Part tokens that fed a cell and need no variable of their own are dropped.
 */
export function foldTokens(
  tokens: SumToken[],
  folds: Folds,
  dsName: string,
  baseName: string,
): { tokens: SumToken[]; collections: SumCollection[] } {
  const byPath = new Map(tokens.map((token) => [token.path, token]));
  const dropped = new Set<string>();
  const folded = new Map<string, SumToken>();

  for (const [rest, axes] of folds.parts) {
    const token = byPath.get(`${dsName}.${rest}`);
    if (token?.routing.kind !== 'variable' || token.variables.length === 0) continue;
    const { variableType } = token.routing;
    const [head, ...below] = token.variables;
    const worlds = head.collection !== baseName;

    // The part token's cell: its value, or an alias to its variable when worlds give it one. A part token that
    // is not a variable of this type is not folded: it stays what it is, and the mode falls back to the rest.
    // A part that is a whole reference to its rest has no cell of its own (the mode falls back to the rest), and
    // one that is a whole reference to a sibling part folded into the same rest takes that part's cell. `seen`
    // stops a loop of siblings, which falls back to the rest as well.
    const siblings = new Set(flatMap([...axes.values()], (byMode) => [...byMode.values()]));
    const cellOf = (path: string, seen = new Set<string>([path])): SumCell | undefined => {
      const part = byPath.get(`${dsName}.${path}`);
      const first = part?.variables[0];
      if (part?.routing.kind !== 'variable' || part.routing.variableType !== variableType || !first) return undefined;
      if (first.collection !== baseName) return { kind: 'link', to: first.key };
      dropped.add(part.path);
      const cell = first.cells.get('default');
      if (cell?.kind !== 'reference') return cell;
      if (cell.to === token.path) return undefined;
      const sibling = referencePath(cell.to);
      if (!siblings.has(sibling)) return cell;
      return seen.has(sibling) ? undefined : cellOf(sibling, seen.add(sibling));
    };

    // The rest, kept as a link below when worlds vary it; otherwise its single cell is the axis's `rest`.
    const demoted: SumVariable | undefined = worlds
      ? {
          ...head,
          key: `${dsName}.${rest}~${head.collection}`,
          name: linkVariableName(rest, head.collection),
          codeSyntax: `var(${cssLinkName(cssPropertyName(token.path), head.collection)})`,
        }
      : undefined;
    let under = demoted;
    const rows: SumVariable[] = [];
    const names = [...axes.keys()];
    for (const [axis, byMode] of axes) {
      const last = axis === names[names.length - 1];
      const cells = new Map<string, SumCell>();
      for (const mode of folds.collections.get(axis) as string[]) {
        const part = byMode.get(mode);
        const own = part === undefined ? undefined : cellOf(part);
        cells.set(mode, own ?? (under ? { kind: 'link', to: under.key } : (head.cells.get('default') as SumCell)));
      }
      under = {
        key: last ? token.path : `${dsName}.${rest}~${axis}`,
        name: last ? head.name : linkVariableName(rest, axis),
        collection: axis,
        codeSyntax: last ? head.codeSyntax : `var(${cssLinkName(cssPropertyName(token.path), axis)})`,
        cells,
      };
      rows.unshift(under);
    }
    folded.set(token.path, { ...token, variables: [...rows, ...(demoted ? [demoted] : []), ...below] });
  }

  return {
    tokens: tokens.filter((token) => !dropped.has(token.path)).map((token) => folded.get(token.path) ?? token),
    collections: [...folds.collections].map(([name, modes]): SumCollection => ({ name, axis: true, modes })),
  };
}
