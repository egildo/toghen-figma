/**
 * A set's or an artboard's fingerprint: what a run would write for it, hashed, so a run told to skip what has not
 * changed (`skipUnchanged`) leaves it unread while its stamp holds the same (specs, *Skipping what has not changed*).
 *
 * It covers what decides the writes: the members as kdlet expanded them, the component's properties, the page; for
 * each token, what is written, the variable a field binds with what it holds in each mode, its aliases followed, or
 * the value a field Figma cannot bind is written as, and the style a field applies; for each component an instance
 * shows, which one it is and its property definitions, which an instance's properties are written against; and this
 * package's version, so a new version reads everything once. Where a source position moved and nothing else did, the
 * fingerprint is the same.
 */

import { hashOf } from '../../shared/components/diff.js';
import type { ComponentRef } from '../../shared/components/model.js';
import type { Desired } from '../../shared/components/steps.js';
import { VERSION } from '../../shared/version.js';
import type { Resolved } from './resolve.js';

/** Where a file wrote something: not what a run writes. */
const POSITIONS = new Set(['loc', 'fieldLoc', 'fromAxes']);

const attempt = <T>(read: () => T): T | undefined => {
  try {
    return read();
  } catch (_unresolved) {
    return undefined;
  }
};

/** The fingerprint, or undefined where a dry run counted a name as pending: what it stands for is not written yet. */
export async function fingerprintOf(desired: Desired, resolved: Resolved, page: string | undefined): Promise<string | undefined> {
  if (resolved.pending.length > 0) return undefined;
  const tokens: Record<string, unknown> = {};
  const components: Record<string, unknown> = {};
  const modes: Record<string, unknown> = {};

  // Each variable a token reaches, by id, with what it holds in each mode, read once: a token's own variable, then each
  // variable an alias in it names, however deep. Kept flat, so a chain of aliases is read once, not once per path to it.
  const variables: Record<string, unknown> = {};
  const reach = async (variable: Variable): Promise<void> => {
    if (variable.id in variables) return;
    variables[variable.id] = variable.valuesByMode ?? {};
    for (const value of Object.values(variable.valuesByMode ?? {})) {
      const alias = value as VariableAlias;
      if (typeof alias !== 'object' || alias === null || alias.type !== 'VARIABLE_ALIAS') continue;
      const target = await figma.variables.getVariableByIdAsync(alias.id);
      if (target) await reach(target);
    }
  };
  const token = async (path: string, field: string): Promise<void> => {
    const key = `${field} ${path}`;
    if (key in tokens) return;
    const variable = attempt(() => resolved.variable(path));
    if (variable) await reach(variable);
    const style =
      field === 'textStyle'
        ? attempt(() => resolved.textStyle(path))
        : field === 'effectStyle'
          ? attempt(() => resolved.effectStyle(path))
          : undefined;
    tokens[key] = {
      variable: variable?.id ?? null,
      style: style ? style.id : null,
      value: resolved.valueOf(path) ?? null,
      composite: resolved.composite(path) ?? null,
      text: resolved.textValue(field, path) ?? null,
      stack: attempt(() => resolved.stack(path)) ?? null,
    };
  };
  const component = (ref: ComponentRef): void => {
    const key = JSON.stringify(ref);
    if (key in components) return;
    const node = attempt(() => resolved.component(ref));
    const set = node?.parent?.type === 'COMPONENT_SET' ? (node.parent as ComponentSetNode) : node;
    components[key] = {
      id: node?.id ?? null,
      source: resolved.componentSource(ref),
      definitions: (set && attempt(() => set.componentPropertyDefinitions)) ?? null,
    };
  };

  // Every token and component a field names, wherever in the field's value it sits.
  const visit = async (field: string, value: unknown): Promise<void> => {
    if (Array.isArray(value)) {
      for (const item of value) await visit(field, item);
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    const v = value as { kind?: string; path?: string; key?: string; value?: unknown };
    if (v.kind === 'token' && typeof v.path === 'string') return token(v.path, field);
    if (field === 'component' && v.kind === 'plain' && typeof v.value === 'string') return component({ name: v.value });
    if (field === 'component' && v.kind === 'key' && typeof v.key === 'string') return component({ key: v.key });
    if (field === 'modes' && v.kind === undefined) {
      for (const [collection, mode] of Object.entries(value as Record<string, string>)) {
        const pin = attempt(() => resolved.mode(collection, mode));
        modes[`${collection}=${mode}`] = pin ? { collection: pin.collection.id, mode: pin.modeId } : null;
      }
      return;
    }
    for (const inner of Object.values(value)) await visit(field, inner);
  };
  const walk = async (layer: Desired['members'][number]['tree']): Promise<void> => {
    for (const [field, value] of Object.entries(layer.fields)) await visit(field, value);
    for (const child of layer.children) await walk(child);
  };
  for (const member of desired.members) await walk(member.tree);
  // A property's default component, its token default, and its preferred components: what the set's properties are written with.
  for (const property of desired.component.properties) {
    if (property.type === 'INSTANCE_SWAP') component(property.default);
    if ((property.type === 'BOOLEAN' || property.type === 'TEXT') && typeof property.default === 'object')
      await token(property.default.token, 'default');
    if (property.type === 'INSTANCE_SWAP' || property.type === 'SLOT')
      for (const value of property.preferredValues ?? []) component('key' in value ? { key: value.key } : { name: value.name });
  }

  const written = JSON.parse(
    JSON.stringify({ desired, page: page ?? null }, (key, value) => (POSITIONS.has(key) ? undefined : value)),
  ) as unknown;
  const whole = { version: VERSION, written, tokens, variables, components, modes };
  // Two hashes of 32 bits, so that two different inputs share a fingerprint only by a chance of one in 2^64.
  return `${hashOf(whole)}${hashOf(['salt', whole])}`;
}
