/**
 * KDL text to a component's header and a document.
 *
 * A component file is a kdlet file. kdlet reads it, and hands back the five words
 * that are Toghen's (`component`, `description`, `properties`, `exclude`, `include`) as
 * parser nodes, unread; this file reads those into the model's `Component`, and
 * leaves the rest, the layers and everything that varies, to kdlet's evaluation
 * (`members.ts`).
 *
 * The reader is tolerant on purpose: a value it cannot accept is reported and
 * left out, and reading carries on, so one run names every problem in the file
 * rather than the first. What it refuses here is the shape of the five words; the
 * layers are `check.ts`'s, and what needs more than one node is `validate.ts`'s.
 */

import { getLocation } from '@bgotink/kdl';
import type { Entry, Node } from '@bgotink/kdl';
import { read as readDocument } from 'kdlet';
import type { Document } from 'kdlet';
import { parseReferencePath, referenceTarget } from '@toghen/lib';
import { INPUT_SEGMENT } from './axes.js';
import { PROPERTY_TYPES } from './fields.js';
import type { Component, ComponentRef, Exclusion, Loc, PreferredValue, Problem, Property, SlotSettings } from './model.js';

/** The top-level words that are Toghen's, and not kdlet's or Figma's. */
export const HOST_WORDS = ['component', 'description', 'properties', 'exclude', 'include'] as const;

type Sink = Problem[];
type Raw = string | number | boolean | null;

/** Where a node or entry starts, one-based, as an editor shows it. */
export function locOf(element: Node | Entry): Loc | undefined {
  const stored = getLocation(element);
  return stored ? { line: stored.start.line, column: stored.start.column } : undefined;
}

export function report(sink: Sink, message: string, at?: Node | Entry, severity: Problem['severity'] = 'error'): void {
  const loc = at ? locOf(at) : undefined;
  sink.push({ severity, message, ...(loc ?? {}) });
}

/** A value as the file wrote it, for a message: `(literal)8`, `#true`, `"abc"`. */
function show(tag: string | null, raw: Raw): string {
  const body =
    typeof raw === 'string'
      ? JSON.stringify(raw)
      : raw === null
        ? '#null'
        : raw === true
          ? '#true'
          : raw === false
            ? '#false'
            : String(raw);
  return `${tag ? `(${tag})` : ''}${body}`;
}

/** The arguments and the properties of a node, with a property written twice reported and dropped. */
export function split(sink: Sink, node: Node, what: string): { args: Entry[]; props: [string, Entry][] } {
  const args: Entry[] = [];
  const props: [string, Entry][] = [];
  const seen = new Set<string>();
  for (const entry of node.entries) {
    const key = entry.getName();
    if (key === null) {
      args.push(entry);
    } else if (seen.has(key)) {
      report(sink, `"${key}" is written twice on ${what}; KDL would keep only the last`, entry);
    } else {
      seen.add(key);
      props.push([key, entry]);
    }
  }
  return { args, props };
}

function noArguments(sink: Sink, args: Entry[], what: string): void {
  for (const arg of args) report(sink, `${what} takes no arguments`, arg);
}

function noChildren(sink: Sink, node: Node, what: string): void {
  for (const child of node.children?.nodes ?? []) report(sink, `${what} takes no child nodes`, child);
}

function onlyKeys(sink: Sink, props: [string, Entry][], allowed: string[], what: string): void {
  for (const [key, entry] of props) {
    if (!allowed.includes(key)) {
      report(sink, `${what} has no "${key}"${allowed.length ? `; it takes ${allowed.join(', ')}` : ''}`, entry);
    }
  }
}

/** A plain non-negative whole number, for indices, spans and counts. */
function readCount(sink: Sink, entry: Entry, what: string, minimum: number): number | undefined {
  const raw = entry.getValue();
  if (entry.getTag() === null && typeof raw === 'number' && Number.isInteger(raw) && raw >= minimum) return raw;
  report(sink, `${what} takes a whole number of at least ${minimum}, not ${show(entry.getTag(), raw)}`, entry);
  return undefined;
}

// ---------------------------------------------------------------------------
// exclude
// ---------------------------------------------------------------------------

/** `exclude Axis=value …`: one value for each axis it names. */
function readCombination(sink: Sink, node: Node, what: string): Record<string, string> {
  const { args, props } = split(sink, node, what);
  noArguments(sink, args, what);
  const combination: Record<string, string> = {};
  for (const [axis, entry] of props) {
    const raw = entry.getValue();
    if (entry.getTag() !== null || typeof raw !== 'string' || raw === '') {
      report(sink, `${what} takes ${axis}="<value>", not ${show(entry.getTag(), raw)}; quote a value that is not a word`, entry);
      continue;
    }
    combination[axis] = raw;
  }
  if (props.length === 0) report(sink, `${what} needs at least one Axis=value`, node);
  return combination;
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

function propertyName(sink: Sink, arg: Entry | undefined, type: string, node: Node): string | undefined {
  const name = arg?.getValue();
  if (!arg || arg.getTag() !== null || typeof name !== 'string' || name === '') {
    report(sink, `${type} needs a name as its first argument`, node);
    return undefined;
  }
  if (name.includes('#')) {
    report(sink, `${type} "${name}": a property name cannot contain "#", which Figma uses to tell properties apart`, arg);
  }
  return name;
}

function readPreferred(sink: Sink, node: Node, what: string): PreferredValue[] | undefined {
  const preferred: PreferredValue[] = [];
  for (const child of node.children?.nodes ?? []) {
    if (child.getName() !== 'preferred') {
      report(
        sink,
        `unknown node "${child.getName()}" in ${what}; only "preferred COMPONENT key=…" or "preferred COMPONENT name=…" belongs here`,
        child,
      );
      continue;
    }
    const { args, props } = split(sink, child, 'preferred');
    noChildren(sink, child, 'preferred');
    onlyKeys(sink, props, ['key', 'name'], 'preferred');
    const type = args[0]?.getValue();
    const key = props.find(([k]) => k === 'key')?.[1];
    const name = props.find(([k]) => k === 'name')?.[1];
    const value = (key ?? name)?.getValue();
    if (args.length !== 1 || (type !== 'COMPONENT' && type !== 'COMPONENT_SET')) {
      report(sink, `preferred takes COMPONENT or COMPONENT_SET as its argument`, args[0] ?? child);
    } else if (key && name) {
      report(sink, `preferred ${type} takes key= or name=, not both`, child);
    } else if (typeof value !== 'string' || value === '') {
      report(sink, `preferred ${type} needs key="<published key>" or name="<component name>"`, child);
    } else if (key) {
      preferred.push({ type, key: value });
    } else {
      const loc = locOf(child);
      preferred.push({ type, name: value, ...(loc ? { loc } : {}) });
    }
  }
  return preferred.length ? preferred : undefined;
}

function readProperty(sink: Sink, node: Node): Property | undefined {
  const type = node.getName();
  if (!(PROPERTY_TYPES as readonly string[]).includes(type)) {
    report(sink, `unknown property type "${type}"; a property is VARIANT, BOOLEAN, TEXT, INSTANCE_SWAP or SLOT`, node);
    return undefined;
  }
  const { args, props } = split(sink, node, type);
  const name = propertyName(sink, args[0], type, node);
  const loc = locOf(node);
  const at = loc ? { loc } : {};
  const what = `${type} "${name ?? ''}"`;
  const prop = (key: string) => props.find(([k]) => k === key)?.[1];

  if (type === 'VARIANT') {
    onlyKeys(sink, props, ['from'], what);
    noChildren(sink, node, what);
    if (name === undefined) return undefined;
    if (/[,=.]/.test(name)) {
      report(
        sink,
        `${what}: an axis name cannot contain ",", "=" or ".": member names use the first two, and a guard reads the axis as (input)<name>, which takes no dot`,
        args[0],
      );
    }
    // `from="{group}"` alone: the values are the names of the group's children, which the design system gives (`axes.ts`).
    const from = prop('from');
    if (from) {
      const group = from.getValue();
      if (args.length !== 1) {
        report(sink, `${what} takes from="{group}" alone, or a list of values; not both, and not (modifier)`, args[1] ?? from);
      } else if (from.getTag() !== null || typeof group !== 'string' || referenceTarget(group) === undefined) {
        report(sink, `${what}: from takes a token reference in quotes, such as from="{hue}", not ${show(from.getTag(), group)}`, from);
      } else if (group.includes(INPUT_SEGMENT)) {
        report(
          sink,
          `${what}: from="${group}" cannot hold an ${INPUT_SEGMENT} segment: the values of an axis cannot come from an axis`,
          from,
        );
      } else {
        try {
          const target = referenceTarget(group)!;
          parseReferencePath(target);
          return { type, name, values: [], from: target, ...at };
        } catch (error) {
          report(sink, `${what}: from=${show(null, group)} is not a token reference: ${(error as Error).message}`, from);
        }
      }
      return undefined;
    }
    // `(modifier)"state"` alone: the values are the modifier's contexts, which the design system gives (`axes.ts`).
    const fromModifier = args.slice(1).find((arg) => arg.getTag() === 'modifier');
    if (fromModifier) {
      const modifier = fromModifier.getValue();
      if (args.length !== 2) {
        report(sink, `${what} takes (modifier)"<name>" alone, or a list of values; not both, and not several modifiers`, fromModifier);
      } else if (typeof modifier !== 'string' || modifier === '') {
        report(sink, `${what}: (modifier) takes the name of a modifier of the design system, in quotes`, fromModifier);
      } else {
        return { type, name, values: [], modifier, ...at };
      }
      return undefined;
    }
    const values: string[] = [];
    for (const arg of args.slice(1)) {
      const value = arg.getValue();
      if (arg.getTag() !== null || typeof value !== 'string') {
        report(sink, `${what} has value ${show(arg.getTag(), value)}, which is not a string; quote it, as in "${String(value)}"`, arg);
      } else if (value === '') {
        report(sink, `${what} has an empty value`, arg);
      } else if (/[,=]/.test(value)) {
        report(sink, `${what} has value "${value}": a variant value cannot contain "," or "=", which member names use`, arg);
      } else if (values.includes(value)) {
        report(sink, `${what} lists "${value}" twice`, arg);
      } else {
        values.push(value);
      }
    }
    if (values.length === 0 && args.length <= 1) report(sink, `${what} needs at least one value`, node);
    return { type, name, values, ...at };
  }

  if (args.length > 1) report(sink, `${what} takes one name`, args[1]);

  if (type === 'BOOLEAN' || type === 'TEXT') {
    onlyKeys(sink, props, ['default'], what);
    noChildren(sink, node, what);
    const entry = prop('default');
    const value = entry?.getValue();
    // A token reference binds the default to its variable: a `boolean` token's, or a `string` token's.
    let token: { token: string } | undefined;
    if (entry && entry.getTag() === null && typeof value === 'string' && referenceTarget(value) !== undefined) {
      try {
        parseReferencePath(referenceTarget(value)!);
        token = { token: referenceTarget(value)! };
      } catch (error) {
        report(sink, `${what}: default=${show(null, value)} is not a token reference: ${(error as Error).message}`, entry);
        return undefined;
      }
    }
    const ok = token !== undefined || (entry && entry.getTag() === null && typeof value === (type === 'BOOLEAN' ? 'boolean' : 'string'));
    if (!ok) {
      report(sink, `${what} needs default=${type === 'BOOLEAN' ? '#true or #false' : '"<text>"'}, or a token reference`, entry ?? node);
    }
    if (name === undefined || !ok) return undefined;
    return type === 'BOOLEAN'
      ? { type, name, default: token ?? (value as boolean), ...at }
      : { type, name, default: token ?? (value as string), ...at };
  }

  if (type === 'INSTANCE_SWAP') {
    onlyKeys(sink, props, ['default'], what);
    const entry = prop('default');
    const value = entry?.getValue();
    let def: ComponentRef | undefined;
    if (entry && entry.getTag() === null && typeof value === 'string' && value !== '' && referenceTarget(value) === undefined)
      def = { name: value };
    else if (entry && entry.getTag() === 'key' && typeof value === 'string' && value !== '') def = { key: value };
    else report(sink, `${what} needs default=<a component name> or default=(key)"<published key>"`, entry ?? node);
    const preferredValues = readPreferred(sink, node, what);
    if (name === undefined || !def) return undefined;
    return { type, name, default: def, ...(preferredValues ? { preferredValues } : {}), ...at };
  }

  // SLOT
  const keys = ['description', 'minChildren', 'maxChildren', 'allowPreferredValuesOnly', 'stretchChildOnInsert', 'displayEmptyByDefault'];
  onlyKeys(sink, props, keys, what);
  const slot: Extract<Property, { type: 'SLOT' }> = { type: 'SLOT', name: name ?? '', ...at };
  const description = prop('description');
  if (description) {
    const text = description.getValue();
    if (description.getTag() === null && typeof text === 'string') slot.description = text;
    else report(sink, `${what}: description takes text`, description);
  }
  const settings: SlotSettings = {};
  for (const key of ['minChildren', 'maxChildren'] as const) {
    const entry = prop(key);
    const n = entry ? readCount(sink, entry, `${what}: ${key}`, 0) : undefined;
    if (n !== undefined) settings[key] = n;
  }
  for (const key of ['allowPreferredValuesOnly', 'stretchChildOnInsert', 'displayEmptyByDefault'] as const) {
    const entry = prop(key);
    if (!entry) continue;
    const flag = entry.getValue();
    if (entry.getTag() === null && typeof flag === 'boolean') settings[key] = flag;
    else report(sink, `${what}: ${key} takes #true or #false, not ${show(entry.getTag(), flag)}`, entry);
  }
  if (settings.minChildren !== undefined && settings.maxChildren !== undefined && settings.minChildren > settings.maxChildren) {
    report(sink, `${what}: minChildren ${settings.minChildren} is above maxChildren ${settings.maxChildren}`, node);
  }
  if (Object.keys(settings).length) slot.slotSettings = settings;
  const preferredValues = readPreferred(sink, node, what);
  if (preferredValues) slot.preferredValues = preferredValues;
  return name === undefined ? undefined : slot;
}

// ---------------------------------------------------------------------------
// The file
// ---------------------------------------------------------------------------

export interface Read {
  /** Absent only when the file holds no usable `component` node. */
  component?: Component;
  /** Where the component is named, for a problem with the file as a whole. */
  componentLoc?: Loc;
  /** kdlet's document, without the nodes that are Toghen's: plain JSON, ready to travel. */
  document: Document;
  problems: Problem[];
}

/**
 * Reads a component file's text: kdlet reads the file, and the five words that are
 * Toghen's are read here.
 *
 * Returns whatever could be read alongside every problem found, so a caller can
 * show all of them at once.
 */
export function readFile(text: string): Read {
  const sink: Sink = [];
  const read = readDocument(text, { words: HOST_WORDS });
  for (const problem of read.problems)
    sink.push({ severity: 'error', message: problem.message, line: problem.line, column: problem.column });
  // kdlet hands back no nodes for a file that is not KDL at all, and says so.
  const document: Document = { nodes: read.nodes.filter((item) => item.kind !== 'host'), problems: [] };
  if (read.nodes.length === 0 && read.problems.length > 0) return { document, problems: sink };

  const words: Node[] = [];
  for (const item of read.nodes) if (item.kind === 'host') words.push(item.node);
  const roots = words.filter((node) => node.getName() === 'component');
  if (roots.length === 0) {
    sink.push({ severity: 'error', message: 'the file needs one "component <Name>"' });
    return { document, problems: sink };
  }
  if (roots.length > 1) report(sink, 'a file holds one component', roots[1]);
  const root = roots[0];

  const { args, props } = split(sink, root, 'component');
  onlyKeys(sink, props, ['tokens', 'layout', 'across'], 'component');
  for (const child of root.children?.nodes ?? []) {
    report(
      sink,
      'component has no body: write the description, the properties, the layers and the rest at the top of the file, beside it',
      child,
    );
  }
  const name = args[0]?.getValue();
  if (args.length !== 1 || args[0].getTag() !== null || typeof name !== 'string' || name === '') {
    report(sink, 'component needs its name as its only argument', args[0] ?? root);
  }

  const component: Component = { name: typeof name === 'string' ? name : '', properties: [], exclude: [] };
  const tokens = props.find(([key]) => key === 'tokens')?.[1];
  if (tokens) {
    const group = tokens.getValue();
    let path: string | undefined;
    if (typeof group === 'string' && group.includes(INPUT_SEGMENT)) {
      report(
        sink,
        `component: tokens=${show(tokens.getTag(), group)} takes no ${INPUT_SEGMENT} segment: the line is read once for the file, and not once for each member`,
        tokens,
      );
    } else if (tokens.getTag() === null && typeof group === 'string' && referenceTarget(group) !== undefined) {
      try {
        path = referenceTarget(group)!;
        parseReferencePath(path);
      } catch (error) {
        report(sink, `component: tokens=${show(null, group)} is not a token reference: ${(error as Error).message}`, tokens);
      }
    } else {
      report(
        sink,
        `component: tokens takes a token reference in quotes, such as tokens="{button}", not ${show(tokens.getTag(), group)}`,
        tokens,
      );
    }
    if (path !== undefined) component.tokens = path;
  }
  const layout = props.find(([key]) => key === 'layout')?.[1];
  if (layout) {
    if (layout.getTag() !== null || layout.getValue() !== 'parts')
      report(
        sink,
        `component: layout takes "parts" (one variable per part), not ${show(layout.getTag(), layout.getValue())}; leave it out for the folded layout`,
        layout,
      );
    else if (component.tokens === undefined)
      report(sink, 'component: layout=parts is the layout of the parts of a token group, so it needs tokens="{group}"', layout);
    else component.layout = 'parts';
  }
  const across = props.find(([key]) => key === 'across')?.[1];
  if (across) {
    const raw = across.getValue();
    if (across.getTag() !== null || typeof raw !== 'string') {
      report(
        sink,
        `component: across takes the names of axes in quotes, separated by commas, such as across="state, size", not ${show(across.getTag(), raw)}`,
        across,
      );
    } else {
      const names = raw.split(',').map((name) => name.trim());
      const seen = new Set<string>();
      for (const name of names) {
        if (name === '')
          report(sink, `component: across=${show(null, raw)} has an empty name; write the axes' names separated by commas`, across);
        else if (seen.has(name)) report(sink, `component: across=${show(null, raw)} names "${name}" twice`, across);
        seen.add(name);
      }
      if (!names.includes('')) {
        component.across = [...seen];
        const loc = locOf(across);
        if (loc) component.acrossLoc = loc;
      }
    }
  }
  let sawProperties = false;
  let sawDescription = false;
  for (const word of words) {
    const kind = word.getName();
    if (kind === 'description') {
      const d = split(sink, word, 'description');
      noChildren(sink, word, 'description');
      onlyKeys(sink, d.props, [], 'description');
      const text = d.args[0]?.getValue();
      if (sawDescription) report(sink, 'description is written twice', word);
      else if (d.args.length !== 1 || d.args[0].getTag() !== null || typeof text !== 'string')
        report(sink, 'description takes one piece of text', word);
      else component.description = text;
      sawDescription = true;
    } else if (kind === 'properties') {
      const p = split(sink, word, 'properties');
      noArguments(sink, p.args, 'properties');
      onlyKeys(sink, p.props, [], 'properties');
      if (sawProperties) report(sink, 'properties is written twice', word);
      sawProperties = true;
      for (const declaration of word.children?.nodes ?? []) {
        const property = readProperty(sink, declaration);
        if (property) component.properties.push(property);
      }
    } else if (kind === 'exclude' || kind === 'include') {
      noChildren(sink, word, kind);
      const combination: Exclusion = { combination: readCombination(sink, word, kind) };
      const loc = locOf(word);
      if (loc) combination.loc = loc;
      if (Object.keys(combination.combination).length > 0) {
        if (kind === 'exclude') component.exclude.push(combination);
        else component.include = [...(component.include ?? []), combination];
      }
    }
  }
  return { component, ...(locOf(root) ? { componentLoc: locOf(root) } : {}), document, problems: sink };
}
