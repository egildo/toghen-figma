/**
 * A layer's receipt: for each field Toghen owns on it, a hash of what Figma reports for it.
 *
 * Two readings in one shape. `reportedOf` reads a node: what Figma holds now, which right after a write is the
 * receipt and on a later run is compared with it (a hand edit shows as a difference). `expectedOf` reads the file:
 * what Figma would report once the file's value is written, compared with the receipt to tell whether the file moved.
 * Each field reads as the same plain data from both sides, so the two compare exactly: a bound field as its variable,
 * a wired field as its property's key, a number as float32, since that is how Figma keeps it.
 *
 * Specs, *Identity: what is ours*, says how the two comparisons decide what a run writes.
 */

import { fieldNames } from '../../shared/components/diff.js';
import { FIELDS } from '../../shared/components/fields.js';
import type {
  ComponentRef,
  Constraints,
  FieldValue,
  GridPlacement,
  Layer,
  LayoutGridRecord,
  SetField,
  Track,
  Value,
} from '../../shared/components/model.js';
import { BOUND_BY_PARTS, boundIdOf } from '../utils/boundVariables.js';
import {
  effectsOf,
  expectedText,
  f32,
  gradientPaint,
  layoutGridOf,
  literalBlur,
  reportedEffect,
  reportedGrid,
  reportField,
  reportedPaint,
  withAlias,
} from './fieldWriter.js';
import type { Resolved } from './resolve.js';
import { receiptOf, stampOn, updateStamp } from './stamp.js';

/** A layer Toghen wrote in this run, and the fields it wrote: every field it declares when `fields` is absent. */
export interface Written {
  node: SceneNode;
  layer: Layer;
  fields?: string[];
}

/** A component as both sides name it: a variant by its set, since a `set` on an artboard's instance picks the variant. */
const componentId = (component: ComponentNode | null): string | null =>
  component === null ? null : component.parent?.type === 'COMPONENT_SET' ? component.parent.id : component.id;

const nameOf = (key: string): string => key.split('#')[0];

/** What Figma reports now for each of these fields of a node, by the names `fieldNames` gives them. */
export async function reportedOf(node: SceneNode, fields: string[]): Promise<Record<string, unknown>> {
  const read = node as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const bound = (node as unknown as { boundVariables?: Record<string, unknown> }).boundVariables ?? {};
  for (const field of fields) {
    if (field.startsWith('set ')) {
      const properties = (node as InstanceNode).componentProperties;
      const key = Object.keys(properties).find((candidate) => nameOf(candidate) === field.slice(4));
      // A property bound to a variable is reported on the instance's `boundVariables.componentProperties` (roster, *Instance and component*).
      const variable = key === undefined ? undefined : (bound.componentProperties as Record<string, VariableAlias> | undefined)?.[key]?.id;
      out[field] = key === undefined ? null : variable !== undefined ? { variable } : properties[key].value;
    } else if (FIELDS[field]?.wires !== undefined) {
      const wired = node.componentPropertyReferences?.[field === 'component' ? 'mainComponent' : (field as 'visible' | 'characters')];
      const variable = field === 'component' ? undefined : boundIdOf(bound, field);
      if (field === 'component')
        out[field] = wired !== undefined ? { property: wired } : componentId(await (node as InstanceNode).getMainComponentAsync());
      else out[field] = wired !== undefined ? { property: wired, shows: read[field] } : variable !== undefined ? { variable } : read[field];
    } else if (field === 'modes') {
      out[field] = node.explicitVariableModes;
    } else if (field === 'grid') {
      const cell = node as unknown as GridChildrenMixin;
      out[field] = {
        row: cell.gridRowAnchorIndex,
        column: cell.gridColumnAnchorIndex,
        rowSpan: cell.gridRowSpan,
        columnSpan: cell.gridColumnSpan,
      };
    } else if (FIELDS[field]?.value === 'tracks') {
      out[field] = (read[field] as GridTrackSize[]).map((track) => ({
        type: track.type,
        value: track.type === 'HUG' ? null : f32(track.value),
      }));
    } else {
      out[field] = reportField(node, field);
    }
  }
  return out;
}

/** What a wired field reads from the set, by property name: the key the set holds the property under now, and its default, which the field shows. */
export interface Wiring {
  keys: Map<string, string>;
  defaults: Map<string, string | boolean>;
}

function expectedPaint(resolved: Resolved, paint: Value): unknown {
  // Unit 4: a gradient reads as the writer would leave it.
  const composite = paint.kind === 'token' ? resolved.composite(paint.path) : undefined;
  if (composite?.paint) return reportedPaint(gradientPaint(resolved, composite));
  // A bound paint by its variable only: its alpha is the variable's, in whatever mode the layer is in (ruling 8a).
  if (paint.kind === 'token') return { variable: resolved.color(paint.path).id };
  const hex = String((paint as { value: string }).value);
  const channel = (at: number): number => parseInt(hex.slice(at, at + 2), 16) / 255;
  return { color: [channel(1), channel(3), channel(5)].map(f32), opacity: f32(hex.length === 9 ? channel(7) : 1) };
}

function expectedField(resolved: Resolved, wiring: Wiring, field: string, value: FieldValue): unknown {
  const scalar = value as Value;
  if (FIELDS[field]?.token?.bind?.call === 'paint') return (value as Value[]).map((paint) => expectedPaint(resolved, paint));
  if (FIELDS[field]?.token?.bind?.call === 'text') return expectedText(resolved, field, scalar);
  // Unit 4: effects and layout grids read as the writer would leave them, each bound part by its variable.
  if (FIELDS[field]?.value === 'effects') {
    const effects: Effect[] = [];
    for (const effect of value as Value[]) {
      if (effect.kind === 'token') effects.push(...effectsOf(resolved, resolved.composite(effect.path)!, withAlias));
      else effects.push(literalBlur(Number((effect as { value: number }).value)));
    }
    return effects.map(reportedEffect);
  }
  if (FIELDS[field]?.value === 'grids')
    return (value as LayoutGridRecord[]).map((record) => reportedGrid(layoutGridOf(resolved, record, withAlias, () => 0)));
  if (field === 'textStyle') return resolved.textStyle((value as { path: string }).path).id;
  if (field === 'effectStyle') return resolved.effectStyle((value as { path: string }).path).id;
  if (field === 'modes') {
    const pins: Record<string, string> = {};
    for (const [collection, mode] of Object.entries(value as Record<string, string>)) {
      const pin = resolved.mode(collection, mode);
      pins[pin.collection.id] = pin.modeId;
    }
    return pins;
  }
  if (field === 'grid') {
    const cell = value as GridPlacement;
    return { row: cell.row, column: cell.column, rowSpan: cell.rowSpan ?? 1, columnSpan: cell.columnSpan ?? 1 };
  }
  if (FIELDS[field]?.value === 'tracks')
    return (value as Track[]).map((track) => ({ type: track.type, value: track.type === 'HUG' ? null : f32(track.value) }));
  // A dash pattern as its lengths, a token's at the defaults; constraints as Figma reports them.
  if (FIELDS[field]?.value === 'dashes') {
    const dashes = value as Value[];
    if (dashes[0]?.kind === 'token') return (resolved.valueOf(dashes[0].path)!.value as number[]).map(f32);
    return dashes.map((dash) => f32((dash as { value: number }).value));
  }
  if (FIELDS[field]?.value === 'constraints') return { ...(value as Constraints) };
  if (scalar.kind === 'property') {
    const property = wiring.keys.get(scalar.name) ?? null;
    const shows = wiring.defaults.get(scalar.name);
    return field === 'component' ? { property } : { property, shows: field === 'visible' ? Boolean(shows) : String(shows) };
  }
  if (field === 'component')
    return componentId(
      resolved.component(scalar.kind === 'key' ? { key: scalar.key } : { name: String((scalar as { value: string }).value) }),
    );
  if (scalar.kind === 'token')
    return FIELDS[field]?.token?.bind ? { variable: resolved.variable(scalar.path).id } : f32(resolved.valueOf(scalar.path)?.value);
  return f32((scalar as { value: unknown }).value);
}

/** An instance property's value as `componentProperties` reports it: a swap by its component's id. */
function expectedSet(resolved: Resolved, value: SetField[string]['value']): unknown {
  if (typeof value === 'object')
    return 'token' in value ? { variable: resolved.variable(value.token).id } : resolved.component({ key: value.key }).id;
  if (typeof value !== 'string') return value;
  // ponytail: a text that is also the name of a component the file swaps in reads as that component, and is written
  // again on every run; the property's type, which would say, is only known from the instance.
  try {
    return resolved.component({ name: value } as ComponentRef).id;
  } catch (_notAComponent) {
    return value;
  }
}

/**
 * The receipt the file's value would leave, for each field of a layer. A field whose lookup fails (a name a dry run
 * only expects) has none, and reads as moved.
 */
export function expectedOf(layer: Layer, resolved: Resolved, wiring: Wiring): Record<string, string> {
  const expected: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(layer.fields)) {
    try {
      if (field === 'set')
        for (const [name, entry] of Object.entries(value as SetField)) expected[`set ${name}`] = expectedSet(resolved, entry.value);
      else expected[field] = expectedField(resolved, wiring, field, value);
    } catch (_unresolved) {
      // Left out: the field is written.
    }
  }
  // A field bound by its parts (`cornerRadius`, `strokeWeight`) beside a part of its own the file names: the target
  // reports the field bound only when all four parts end on one variable, else `{ variable: null }` (`boundIdOf`), so
  // the file's side reads the same; otherwise every run took the file for moved and wrote the field again.
  for (const [field, parts] of Object.entries(BOUND_BY_PARTS)) {
    if (!(field in expected) || !parts.some((part) => part in layer.fields)) continue;
    try {
      const ids = parts.map((part) => {
        const value = (layer.fields[part] ?? layer.fields[field]) as Value;
        return value.kind === 'token' && FIELDS[part]?.token?.bind ? resolved.variable(value.path).id : undefined;
      });
      if (ids.some((id) => id !== undefined)) expected[field] = { variable: new Set(ids).size === 1 ? ids[0] : null };
    } catch (_unresolved) {
      delete expected[field];
    }
  }
  return receiptOf(expected);
}

/**
 * Writes each layer's receipt once the run's writes are done: after a member is in its set, since combining gives its
 * wired layers the set's keys. A field the run wrote takes the hash of what Figma reports now; one it did not keeps the
 * hash it had, so a field kept as drift is still drift on the next run. The receipt lists the fields the file declares
 * now: one it stopped declaring was reported once and leaves it.
 */
export async function stampReceipts(written: Written[]): Promise<void> {
  for (const { node, layer, fields } of written) {
    if (node.removed) continue;
    const names = fieldNames(layer);
    const now = receiptOf(await reportedOf(node, fields ?? names));
    const held = stampOn(node)?.receipt ?? {};
    const receipt: Record<string, string> = {};
    for (const name of names) receipt[name] = now[name] ?? held[name] ?? '';
    updateStamp(node, { receipt });
  }
}
