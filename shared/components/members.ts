/**
 * A component file's document to members.
 *
 * A component set is the variant matrix built out: one member per combination of
 * axis values, minus the combinations `exclude` names. Each combination is one
 * evaluation of the file's document by kdlet, with the axis values as its inputs;
 * the tree that comes back is that member's. This file is the Figma vocabulary
 * kdlet is given, the matrix, and the step from kdlet's tree to the model's layers.
 *
 * It runs in the plugin, so it holds no Figma API, no Node API and nothing from
 * `@toghen/lib`: the checks that need the library's reference grammar are
 * `check.ts`'s, and are kept apart for that reason.
 */

import { literalText, referenceTarget } from '@toghen/lib';
import { defineVocabulary, evaluate } from 'kdlet';
import type { Document, Json, OutNode, Structure } from 'kdlet';
import { expandSegments, pinsOf, selectionOf } from './axes.js';
import type { Expanded } from './axes.js';
import { applyBindings } from './bindings.js';
import { FIELDS, LAYER_KINDS, STRUCTURED_FIELDS } from './fields.js';
import type { Component, FieldValue, Layer, LayerKind, LayoutGridRecord, Member, Modes, Problem, SetField, Track, Value } from './model.js';

/** The tags a value may carry, on top of kdlet's own `input`. */
export const TAGS = ['literal', 'property', 'key'] as const;

/** The word that fills an instance's slot in an artboard file: `slot Content { … }`. It is no layer, and a component file refuses it. */
export const SLOT_WORD = 'slot';

/**
 * What kdlet is told about Figma: the layer kinds, the fields written as child
 * nodes, the layer's name as its address, and the three tags. Every field
 * replaces, except `set` (an artboard instance's property values), where a `when` adds
 * to what the line before it set. `slot` is an element so that its body may hold a
 * `when` or an `each`; only an artboard file may use it, and `check.ts` refuses it in any other.
 */
export const vocabulary = defineVocabulary({
  elements: [...LAYER_KINDS, SLOT_WORD],
  childFields: STRUCTURED_FIELDS,
  adds: ['set'],
  address: (node) => (typeof node.args[0] === 'string' ? node.args[0] : undefined),
  tags: TAGS,
});

/** `Axis=value, Axis=value`, as the set's members are named. */
export function memberName(combination: Record<string, string>): string {
  return Object.entries(combination)
    .map(([axis, value]) => `${axis}=${value}`)
    .join(', ');
}

/**
 * Every combination the set holds, in declared axis order, the last axis varying fastest.
 *
 * When the file writes `include`, only the combinations one of its lines matches are
 * candidates; `exclude` then removes from those. A line names one value for each axis it
 * mentions, and an axis it does not mention matches any value.
 */
export function combinations(component: Component): Record<string, string>[] {
  let all: Record<string, string>[] = [{}];
  for (const property of component.properties) {
    if (property.type !== 'VARIANT') continue;
    const next: Record<string, string>[] = [];
    for (const partial of all) {
      for (const value of property.values) next.push({ ...partial, [property.name]: value });
    }
    all = next;
  }
  const matches = (line: { combination: Record<string, string> }, combination: Record<string, string>): boolean =>
    Object.entries(line.combination).every(([axis, value]) => combination[axis] === value);
  return all.filter(
    (combination) =>
      (component.include === undefined || component.include.some((line) => matches(line, combination))) &&
      !component.exclude.some((exclusion) => matches(exclusion, combination)),
  );
}

/** One combination, evaluated: kdlet's tree for it, and what kdlet found wrong. */
export interface Evaluated {
  /** The member's name: its combination, or the component's name when there are no axes. */
  name: string;
  combination: Record<string, string>;
  roots: OutNode[];
  problems: Problem[];
}

/**
 * Evaluates the document once per combination, the axis values being its inputs. A reference that takes a path
 * segment from an axis (`{hue.(input)hue.soft}`) is expanded for the member, so that everything after sees an
 * ordinary one; kdlet leaves a string as it is written, and the segment is Toghen's.
 */
export function evaluateMembers(component: Component, document: Document): Evaluated[] {
  return combinations(component).map((combination) => {
    const { tree, problems } = evaluate(document, { vocabulary, inputs: combination });
    const expanded = expandSegments(tree, combination);
    return {
      name: Object.keys(combination).length > 0 ? memberName(combination) : component.name,
      combination,
      roots: expanded.roots,
      problems: [
        ...problems.map((problem) => ({
          severity: 'error' as const,
          message: problem.message,
          line: problem.line,
          column: problem.column,
        })),
        ...expanded.problems,
      ],
    };
  });
}

// ---------------------------------------------------------------------------
// From kdlet's tree to layers
// ---------------------------------------------------------------------------

/** A value carrying a host tag, as kdlet keeps it. */
export const tagged = (json: Json | undefined): { tag: string; value: Json } | undefined =>
  json !== null && typeof json === 'object' && !Array.isArray(json) && 'tag' in json && 'value' in json && typeof json.tag === 'string'
    ? { tag: json.tag, value: json.value }
    : undefined;

/** A token reference's path: `"{space.md}"` is `space.md` (lib's `referenceTarget`). The grammar was checked where the file was read. */
const pathOf = (text: string): string => referenceTarget(text)!;

function toValue(json: Json, field: string): Value {
  const tag = tagged(json);
  if (tag) {
    if (tag.tag === 'literal') return { kind: 'literal', value: tag.value as number | string };
    if (tag.tag === 'property') return { kind: 'property', name: tag.value as string };
    return { kind: 'key', key: tag.value as string };
  }
  const spec = FIELDS[field];
  const text =
    spec.value === 'dimension' ||
    spec.value === 'size' ||
    spec.value === 'token' ||
    spec.value === 'group' ||
    spec.value === 'paints' ||
    spec.value === 'dashes' ||
    spec.value === 'effects' ||
    spec.value === 'grids';
  if (text && typeof json === 'string') return { kind: 'token', path: pathOf(json) };
  // `visible` and `characters` take a token reference too; any other text is plain.
  if (spec.token && typeof json === 'string' && referenceTarget(json) !== undefined) return { kind: 'token', path: pathOf(json) };
  // A doubled brace is a literal one, as in a token's value: `"{{size.sm}}"` is the text `{size.sm}`. Both targets read it from here.
  return { kind: 'plain', value: typeof json === 'string' ? literalText(json) : (json as number | boolean | null) };
}

function toTrack(track: Structure): Track {
  if (track.name === 'HUG') return { type: 'HUG' };
  const [value] = track.args;
  // A bare FLEX reads as 1.
  return { type: track.name as 'FLEX' | 'FIXED', value: value === undefined ? 1 : (value as number) };
}

/** A layout grid's node, `COLUMNS alignment=STRETCH count=12 gutterSize="{space.md}"`, as a record: each property a value. */
function toLayoutGrid(grid: Structure, field: string): LayoutGridRecord {
  const record: LayoutGridRecord = { pattern: grid.name as LayoutGridRecord['pattern'] };
  for (const [key, raw] of Object.entries(grid.props)) {
    if (key === 'alignment') record.alignment = raw as LayoutGridRecord['alignment'];
    else record[key as 'count'] = toValue(raw, field);
  }
  return record;
}

function toFieldValue(field: string, json: Json): FieldValue {
  switch (FIELDS[field].value) {
    case 'paints':
    case 'effects':
      return (json as Json[]).map((paint) => toValue(paint, field));
    case 'grids':
      return (json as Structure).children.map((grid) => toLayoutGrid(grid, field));
    case 'tracks':
      return (json as Structure).children.map(toTrack);
    case 'placement': {
      const { props } = json as Structure;
      const place: { row: number; column: number; rowSpan?: number; columnSpan?: number } = {
        row: props.row as number,
        column: props.column as number,
      };
      if (props.rowSpan !== undefined) place.rowSpan = props.rowSpan as number;
      if (props.columnSpan !== undefined) place.columnSpan = props.columnSpan as number;
      return place;
    }
    case 'modes':
      return { ...((json as Structure).props as Modes) };
    // A dash pattern is a list, as paints are: one token, or lengths; none is a solid stroke.
    case 'dashes':
      return Array.isArray(json) ? json.map((dash) => toValue(dash, field)) : [];
    case 'constraints': {
      const { props } = json as Structure;
      return { horizontal: props.horizontal as string, vertical: props.vertical as string };
    }
    case 'set': {
      // Every `set` line adds to the ones before it; a later write of one name replaces the earlier.
      const set: SetField = {};
      for (const line of json as Structure[]) {
        for (const [name, raw] of Object.entries(line.props)) {
          const tag = tagged(raw);
          // A token reference binds its variable to the property.
          const token = !tag && typeof raw === 'string' && referenceTarget(raw) !== undefined ? { token: pathOf(raw) } : undefined;
          set[name] = { value: tag ? { key: tag.value as string } : (token ?? (raw as string | boolean)), loc: line.propLocs[name] };
        }
      }
      return set;
    }
    default:
      return toValue(json, field);
  }
}

/** A validated node of kdlet's tree as a layer. Its positions come with it: a problem found later still names the line. */
export function toLayer(node: OutNode): Layer {
  const fields: Record<string, FieldValue> = {};
  for (const [field, json] of Object.entries(node.fields)) fields[field] = toFieldValue(field, json);
  const layer: Layer = {
    kind: node.name as LayerKind,
    address: String(node.args[0]),
    fields,
    children: node.children.map(toLayer),
    loc: node.loc,
    fieldLoc: { ...node.fieldLocs },
  };
  const fromAxes = (node as Expanded).fromAxes;
  if (fromAxes) layer.fromAxes = fromAxes;
  return layer;
}

/**
 * A validated node of an artboard file's tree as a layer.
 *
 * A layer inside an `each` has the keys of the `each`es around it after its name, so that the rows of one
 * template have addresses of their own: `Row["a"]`, or `Cell["a",2]` inside two. An `INSTANCE`'s `slot`
 * nodes are flattened: the layers inside one become children of the instance, each marked with its slot.
 */
export function toArtboardLayer(node: OutNode, slot?: string): Layer {
  const fields: Record<string, FieldValue> = {};
  for (const [field, json] of Object.entries(node.fields)) fields[field] = toFieldValue(field, json);
  const name = String(node.args[0]);
  const layer: Layer = {
    kind: node.name as LayerKind,
    address: node.identity.keys.length > 0 ? `${name}${JSON.stringify(node.identity.keys)}` : name,
    fields,
    children: [],
    loc: node.loc,
    fieldLoc: { ...node.fieldLocs },
  };
  if (layer.address !== name) layer.name = name;
  if (slot !== undefined) layer.slot = slot;
  for (const child of node.children) {
    if (child.name === SLOT_WORD) {
      (layer.slots ??= []).push({ name: String(child.args[0]), loc: child.loc });
      for (const inner of child.children) layer.children.push(toArtboardLayer(inner, String(child.args[0])));
    } else {
      layer.children.push(toArtboardLayer(child));
    }
  }
  return layer;
}

/**
 * A validated evaluation as a member.
 *
 * An axis that takes its values from a modifier pins that modifier's collection on the
 * member's root to the member's value, with no line in the file: `modes state=hover`. The
 * file may not write a pin of its own for the same collection (`checkPins`), so two writers
 * of one pin never disagree here.
 *
 * `tokens=` on a layer (and on the component line, for the root) becomes the fields the
 * group's keys imply, here and not earlier: only the evaluated layer knows which fields a
 * `when` has already written, and those win. `seen` is told what each layer got.
 */
export function toMember(evaluated: Evaluated, component?: Component, seen?: Parameters<typeof applyBindings>[2]): Member {
  const tree = toLayer(evaluated.roots[0]);
  if (component) applyBindings(tree, component, seen, selectionOf(component, evaluated.combination));
  const pins = component ? pinsOf(component, evaluated.combination) : {};
  if (Object.keys(pins).length > 0) tree.fields.modes = { ...((tree.fields.modes as Modes | undefined) ?? {}), ...pins };
  return { name: evaluated.name, combination: evaluated.combination, tree };
}
