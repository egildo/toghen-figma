/**
 * Which variables a layer is bound to, property by property, the first fill's
 * and stroke's paints included (those are bound on the paint, not the node).
 */

import { FIELDS, type FieldSpec } from '../../shared/components/fields.js';

/** Field to what `pick` reads from its row of the field table, for the fields it reads something from. */
function fromTable<T>(pick: (name: string, spec: FieldSpec) => T | undefined): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [name, spec] of Object.entries(FIELDS)) {
    const value = pick(name, spec);
    if (value !== undefined) out[name] = value;
  }
  return out;
}

/** The property names a paint binding is reported under, as conventions name them: `fills[0].color`, read from the field table. */
export const PAINT_PROPERTIES: Readonly<Record<string, string>> = fromTable((name, spec) =>
  spec.token?.bind?.call === 'paint' ? `${name}[0].${spec.token.bind.field}` : undefined,
);

/**
 * Fields whose binding Figma reports on their parts, read from the field table. Bound to a variable, `cornerRadius` is
 * reported as its four corners bound to it, with no `cornerRadius` key (measured 20 October 2026), and `strokeWeight`
 * as its four sides.
 */
export const BOUND_BY_PARTS: Readonly<Record<string, readonly string[]>> = fromTable((_name, spec) => spec.token?.bind?.parts);

/**
 * The id of the variable a field is bound to, in a node's `boundVariables`. A field Figma binds by its parts is bound
 * when every part is bound to one variable; `null` when only some are, or to different variables, and `undefined`
 * when the field is not bound at all.
 */
export function boundIdOf(bound: Record<string, unknown>, field: string): string | null | undefined {
  // A text field is reported as an array of aliases, one per bound range: bound when they all name one variable.
  // ponytail: a field bound on one range only reads as bound too (measured §14: one alias); `getRangeBoundVariable`
  // over the whole text would tell, should a person's partial binding need catching.
  const ranges = bound[field];
  if (Array.isArray(ranges) && FIELDS[field]?.token?.bind?.call === 'text') {
    const ids = new Set(ranges.map(idOf));
    return ids.size === 0 ? undefined : ids.size === 1 ? ([...ids][0] ?? null) : null;
  }
  const own = idOf(bound[field]);
  const parts = BOUND_BY_PARTS[field];
  if (own !== undefined || !parts) return own;
  const ids = new Set(parts.map((part) => idOf(bound[part])));
  return ids.size === 1 ? [...ids][0] : null;
}

/** Property → bound variable id. */
export function boundVariablesOf(node: SceneNode): Map<string, string> {
  const found = new Map<string, string>();
  const bound = (node as { boundVariables?: Record<string, unknown> }).boundVariables ?? {};
  for (const [property, value] of Object.entries(bound)) {
    const id = idOf(Array.isArray(value) ? value[0] : value);
    if (id && !(property in PAINT_PROPERTIES)) found.set(property, id);
  }
  // A field bound by its parts is named once, as the file and the conventions name it.
  for (const [field, parts] of Object.entries(BOUND_BY_PARTS)) {
    const id = boundIdOf(bound, field);
    if (!id) continue;
    for (const part of parts) found.delete(part);
    found.set(field, id);
  }
  for (const [key, property] of Object.entries(PAINT_PROPERTIES)) {
    const paints = (node as unknown as Record<string, unknown>)[key];
    if (!Array.isArray(paints) || paints.length === 0) continue;
    const id = idOf((paints[0] as { boundVariables?: { color?: unknown } }).boundVariables?.color);
    if (id) found.set(property, id);
  }
  return found;
}

export function boundVariableIds(node: SceneNode): string[] {
  return [...boundVariablesOf(node).values()];
}

function idOf(alias: unknown): string | undefined {
  if (typeof alias === 'string') return alias;
  if (typeof alias === 'object' && alias !== null && typeof (alias as { id?: unknown }).id === 'string')
    return (alias as { id: string }).id;
  return undefined;
}
