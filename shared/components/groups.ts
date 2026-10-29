/**
 * The token groups a component file names, read from the design system.
 *
 * `tokens="{group}"` on a layer, and on the component line for the root, infers bindings
 * from the keys of the group's tokens (`bindings.ts`). That needs what the group holds, and
 * only the reader has the design system: the answer is stored on the component
 * (`Component.groups`), so the engine infers the same bindings without one. Like
 * `resolveAxes`, this is the reader's step.
 */

import { referenceTarget } from '@toghen/lib';
import type { OutNode } from 'kdlet';
import { foldedAxes, planKey, viaAxes } from './axes.js';
import type { DesignSource, Expanded } from './axes.js';
import { FIELDS } from './fields.js';
import type { Component, GroupInfo, GroupPlan, Laid, Layer, Loc, Problem } from './model.js';

// ---------------------------------------------------------------------------
// The table: which Figma fields a CSS key fills. DTCG does not know; this adapter does.
// ---------------------------------------------------------------------------

/** A Figma field and how specific the key that offers it is: the higher rank wins, whatever the document's order. */
type Target = [field: string, rank: number];

const SIDES = ['Top', 'Right', 'Bottom', 'Left'] as const;

/** Keys whose Figma field has the same name, on every kind of layer. */
const SAME = ['opacity', 'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight'];

/** The keys whose field depends on the layer's layout. */
const GAPS = ['gap', 'rowGap', 'columnGap'];

/**
 * The fields a key writes on a `TEXT` or on a `FRAME` or `SLOT`, or `undefined` when it writes none.
 *
 * Figma has only horizontal writing, so `paddingBlock` is top and bottom and `paddingInline` left and
 * right. A more specific key outranks a general one for the same field: `paddingTop` over `paddingBlock`
 * over `padding`, `borderColor` and `borderWidth` over a composite `border`.
 */
function targets(key: string, text: boolean, color: boolean): Target[] | undefined {
  if (SAME.includes(key)) return [[key, 1]];
  if (text) return key === 'color' ? [['fills', 1]] : key === 'font' ? [['textStyle', 1]] : undefined;
  const padding = /^padding(Top|Right|Bottom|Left)$/.exec(key);
  if (padding) return [[key, 3]];
  const stroke = /^border(Top|Right|Bottom|Left)Width$/.exec(key);
  if (stroke) return [[`stroke${stroke[1]}Weight`, 3]];
  const corner = /^border(Top|Bottom)(Left|Right)Radius$/.exec(key);
  if (corner) return [[`${corner[1].toLowerCase()}${corner[2]}Radius`, 3]];
  switch (key) {
    case 'backgroundColor':
      return [['fills', 1]];
    // The shorthand, when the token holds one colour: a gradient or an image has no fill to bind. `backgroundColor` outranks it.
    case 'background':
      return color ? [['fills', 0]] : undefined;
    case 'borderColor':
      return [['strokes', 2]];
    case 'borderWidth':
      return [['strokeWeight', 2]];
    case 'borderRadius':
      return [['cornerRadius', 1]];
    case 'padding':
      return SIDES.map((side): Target => [`padding${side}`, 1]);
    case 'paddingBlock':
      return [
        ['paddingTop', 2],
        ['paddingBottom', 2],
      ];
    case 'paddingInline':
      return [
        ['paddingLeft', 2],
        ['paddingRight', 2],
      ];
    default:
      return undefined;
  }
}

/**
 * The Figma scope a field belongs to, as the field table holds it: the pickers a variable bound to it should be offered in. The field is one
 * `targets()` gives; a fill is a frame's or a text's. Variable sync reads the same table, so a variable is
 * scoped to the fields the component files will bind it to.
 */
export function scopesOfField(field: string, text: boolean): VariableScope[] {
  const scope = FIELDS[field]?.token?.bind?.scope ?? [];
  return [...('text' in scope ? (text ? scope.text : scope.other) : scope)];
}

/**
 * The scopes a token whose last key is `key` is for, on a text layer and on a frame, or `undefined` when the
 * key fills no field. A key is read as a variable holds one colour, as `background` does.
 */
export function scopesOfKey(key: string): VariableScope[] | undefined {
  const scopes = new Set<VariableScope>();
  for (const text of [true, false]) {
    for (const [field] of targets(key, text, true) ?? []) for (const scope of scopesOfField(field, text)) scopes.add(scope);
  }
  if (GAPS.includes(key)) scopes.add('GAP');
  return scopes.size > 0 ? [...scopes] : undefined;
}

/** Works out what a group binds on each kind of layer, from the keys of its tokens. */
export function planOf(group: string, info: GroupInfo): GroupPlan {
  const path = (key: string): string => info.paths?.[key] ?? `${group}.${key}`;
  const has = (key: string): boolean => info.keys.includes(key);
  const needs = (key: string, what: string): string => `"${key}" needs ${what}, skipped`;
  const laid = (): Laid => ({ set: {} });

  /** What the keys that do not depend on the layout bind on a `TEXT`, or on a `FRAME` or `SLOT`. */
  const laidOver = (text: boolean): Laid => {
    const offers = new Map<string, { rank: number; path: string }>();
    const offer = (field: string, rank: number, to: string): void => {
      const held = offers.get(field);
      if (!held || rank > held.rank) offers.set(field, { rank, path: to });
    };
    const out = laid();
    for (const key of info.keys) {
      // Only the key `border` is the composite the table knows. Variable sync makes no variable for it: its
      // members are what bind. A member that is a literal has no variable, and a literal written in its place
      // would stop following the tokens, so it is left out and said.
      const border = key === 'border' && !text ? info.borders?.[key] : undefined;
      if (border) {
        for (const [member, field, to] of [
          ['color', 'strokes', border.color],
          ['width', 'strokeWeight', border.width],
        ] as const) {
          if (to !== undefined) offer(field, 1, to);
          else (out.warnings ??= []).push(`the ${member} of "${key}" is a literal, which has no variable to bind, so it was left out`);
        }
        continue;
      }
      if (!text && GAPS.includes(key)) continue;
      const to = targets(key, text, info.colors?.includes(key) ?? false);
      if (to) for (const [field, rank] of to) offer(field, rank, path(key));
      else (out.notes ??= []).push(`"${key}" has no field on this layer in Figma, skipped`);
    }
    for (const [field, { path: to }] of offers) out.set[field] = to;
    return out;
  };

  /**
   * What the gaps bind on a `FRAME` or `SLOT` of this layout. A gap spaces children: `itemSpacing` in a flow, the
   * two grid gaps in a grid, nothing in a layer with no layout. `rowGap` and `columnGap` outrank `gap`, in a grid only.
   */
  const gapsOver = (layout: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'GRID'): Laid | undefined => {
    const out = laid();
    const note = (line: string): void => void (out.notes ??= []).push(line);
    if (layout === 'GRID') {
      const row = has('rowGap') ? 'rowGap' : has('gap') ? 'gap' : undefined;
      const column = has('columnGap') ? 'columnGap' : has('gap') ? 'gap' : undefined;
      if (row) out.set.gridRowGap = path(row);
      if (column) out.set.gridColumnGap = path(column);
    } else {
      if (has('gap')) {
        if (layout === 'NONE') note(needs('gap', 'a layer whose layoutMode is HORIZONTAL, VERTICAL or GRID'));
        else out.set.itemSpacing = path('gap');
      }
      for (const key of ['rowGap', 'columnGap']) if (has(key)) note(needs(key, 'a GRID layer'));
    }
    return Object.keys(out.set).length > 0 || out.notes ? out : undefined;
  };

  const plan: GroupPlan = { TEXT: laidOver(true), box: laidOver(false) };
  for (const layout of ['NONE', 'HORIZONTAL', 'VERTICAL', 'GRID'] as const) {
    const over = gapsOver(layout);
    if (over) plan[layout] = over;
  }
  return plan;
}

/** A group a layer names, and where. */
export interface GroupUse {
  path: string;
  loc?: Loc;
  /** The axis values the path was expanded from (`hue=rose`), for a message; absent when it took none. */
  via?: string;
}

/** Every `tokens=` in one member's evaluated tree, as the group path and the line it was written at. */
export function groupsUsed(roots: OutNode[], combination: Record<string, string> = {}): GroupUse[] {
  const used: GroupUse[] = [];
  const visit = (node: OutNode): void => {
    const group = node.kind === 'element' ? node.fields.tokens : undefined;
    const axes = (node as Expanded).fromAxes?.tokens;
    // The form was checked (`check.ts`): a whole reference in quotes.
    if (typeof group === 'string')
      used.push({
        path: referenceTarget(group)!,
        loc: node.fieldLocs.tokens ?? node.loc,
        ...(axes ? { via: viaAxes(axes, combination) } : {}),
      });
    for (const child of node.children) visit(child);
  };
  for (const root of roots) visit(root);
  return used;
}

/** A token a layer names outright, where the member's selection gives another for the same key: `{button.color}` for `button.disabled.color`. */
export interface SkippedPart {
  path: string;
  chosen: string;
  loc: Loc | undefined;
}

/**
 * The tokens a member names outright that its selection would replace. A reference written on a layer names one
 * variable: a folded axis reaches it through the variable's modes, but an axis left in the path has a variable of its
 * own for the key, which only `tokens=` follows (`bindings.ts`). Asked of the group the token is in, under the
 * member's selection; the folded axes are not in a selection, so they are never said.
 */
export function skippedParts(
  roots: OutNode[],
  source: DesignSource | undefined,
  selection: Record<string, string>,
  folded: readonly string[],
): SkippedPart[] {
  const skipped: SkippedPart[] = [];
  if (!source?.group || Object.keys(selection).length === 0) return skipped;
  const ask = source.group.bind(source);
  const answers = new Map<string, GroupInfo | 'token' | undefined>();
  const seen = (text: string, loc: Loc | undefined): void => {
    const path = referenceTarget(text);
    const dot = path === undefined ? -1 : path.lastIndexOf('.');
    if (path === undefined || dot < 0) return;
    const group = path.slice(0, dot);
    if (!answers.has(group)) {
      try {
        answers.set(group, ask(group, selection, folded));
      } catch {
        // A group the design system cannot answer for is said where the reference is checked.
        answers.set(group, undefined);
      }
    }
    const info = answers.get(group);
    const chosen = typeof info === 'object' ? info.paths?.[path.slice(dot + 1)] : undefined;
    if (chosen !== undefined && chosen !== path) skipped.push({ path, chosen, loc });
  };
  const values = (value: unknown, loc: Loc | undefined): void => {
    if (typeof value === 'string') seen(value, loc);
    else if (Array.isArray(value)) for (const item of value) values(item, loc);
    else if (value !== null && typeof value === 'object') for (const item of Object.values(value)) values(item, loc);
  };
  const visit = (node: OutNode): void => {
    if (node.kind === 'element') {
      for (const [field, value] of Object.entries(node.fields)) if (field !== 'tokens') values(value, node.fieldLocs[field] ?? node.loc);
    }
    for (const child of node.children) visit(child);
  };
  for (const root of roots) visit(root);
  return skipped;
}

function lookup(
  source: DesignSource | undefined,
  path: string,
  loc: Loc | undefined,
  problems: Problem[],
  selection?: Record<string, string>,
  folded?: readonly string[],
): GroupInfo | 'token' | undefined | 'failed' {
  const fail = (message: string): 'failed' => {
    problems.push({ severity: 'error', message, ...(loc ?? {}) });
    return 'failed';
  };
  if (!source?.group)
    return fail(
      `tokens="{${path}}" takes its bindings from the tokens it names, and no design system is loaded; load its resolver document in the plugin, or pass it to the command line`,
    );
  try {
    return source.group(path, selection, folded);
  } catch (error) {
    return fail(`tokens="{${path}}": the design system could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** A border whose style is not solid cannot be bound: Figma's dash pattern is not in this design. */
function unsolid(info: GroupInfo, path: string, loc: Loc | undefined, problems: Problem[]): void {
  for (const [key, border] of Object.entries(info.borders ?? {})) {
    if (border.unsolid) {
      problems.push({
        severity: 'error',
        message: `tokens="{${path}}": the border "${path}.${key}" has a style other than solid, and Figma's dash pattern is not in this design; it cannot be bound`,
        ...(loc ?? {}),
      });
    }
  }
}

/**
 * Stores what each group a member's layers name holds, on the component, and refuses a group
 * that is a token or names nothing (an `INSTANCE` is refused where the field is checked).
 */
export function resolveGroups(
  component: Component,
  used: GroupUse[],
  source: DesignSource | undefined,
  selection: Record<string, string> = {},
): Problem[] {
  const problems: Problem[] = [];
  for (const { path, loc, via } of used) {
    const found = lookup(source, path, loc, problems, selection, foldedAxes(component));
    if (found === 'failed') continue;
    const from = via ? ` (taken from ${via})` : '';
    if (found === undefined)
      problems.push({
        severity: 'error',
        message: `tokens="{${path}}"${from} names no token and no group of the design system`,
        ...(loc ?? {}),
      });
    else if (found === 'token')
      problems.push({
        severity: 'error',
        message: `tokens="{${path}}"${from} names a token, not a group: a layer takes its bindings from the tokens inside a group`,
        ...(loc ?? {}),
      });
    else {
      unsolid(found, path, loc, problems);
      (component.groups ??= {})[planKey(path, selection)] = planOf(path, found);
    }
  }
  return problems;
}

/**
 * The group the component line names, for the root layer. Whether it names anything was asked of
 * the design system already (it gives the axes); a group the source cannot describe, or a path
 * that is a token, binds nothing.
 */
export function resolveComponentGroup(
  component: Component,
  source: DesignSource | undefined,
  loc: Loc | undefined,
  selection: Record<string, string> = {},
): Problem[] {
  const problems: Problem[] = [];
  const path = component.tokens;
  if (path === undefined || !source?.group) return problems;
  let found: GroupInfo | 'token' | undefined;
  try {
    found = source.group(path, selection, foldedAxes(component));
  } catch {
    return problems; // said by resolveAxes
  }
  if (found === undefined || found === 'token') return problems;
  unsolid(found, path, loc, problems);
  (component.groups ??= {})[planKey(path, selection)] = planOf(path, found);
  return problems;
}

/**
 * Collects what inference says about each layer, once per key and layer, however many members repeat it:
 * pass `seen` to `toMember`. Run in the reader, where the plans are made, and not in the engine.
 */
export function sayings(): { notes: Set<string>; warnings: Set<string>; seen: (layer: Layer, group: string, laid: Laid) => void } {
  const notes = new Set<string>();
  const warnings = new Set<string>();
  const seen = (layer: Layer, group: string, laid: Laid): void => {
    const where = `${layer.kind} "${layer.address}" tokens="{${group}}": `;
    for (const line of laid.notes ?? []) notes.add(where + line);
    for (const line of laid.warnings ?? []) warnings.add(where + line);
  };
  return { notes, warnings, seen };
}
