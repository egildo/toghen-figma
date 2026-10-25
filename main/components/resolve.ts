/**
 * Everything a file names, turned into Figma objects, before anything is written.
 *
 * A reference is looked up by name and never falls back: a token that matches
 * nothing stops the build, and so does one that matches in two collections. A
 * component that silently stopped following its tokens is the defect this whole
 * design exists to prevent, so the lookup either finds exactly one thing or
 * reports why not. Every problem is collected and thrown together, so a run
 * fixes a file in one pass.
 */

import { findInEveryPage } from '../utils/pageRoots.js';
import { viaAxes } from '../../shared/components/axes.js';
import { FIELDS, PIXELS_ONLY_FIELDS, SHADOW_FIELDS } from '../../shared/components/fields.js';
import { scopesOfField } from '../../shared/components/groups.js';
import type {
  ComponentRef,
  Layer,
  LayoutGridRecord,
  Loc,
  Member,
  PreferredValue,
  Property,
  SetField,
  Value,
} from '../../shared/components/model.js';
import type { Desired, RunOptions } from '../../shared/components/steps.js';
import { getState } from '../runtimeState.js';
import { readToken, resolveSumModes, type MultiModeResolution } from '../utils/resolverModes.js';
import { fontStack, toFigmaValue } from '../utils/figmaTokenAdapter.js';
import { toEffectStyleProps, toFigmaLetterSpacing, toFigmaLineHeight, toPaintStyleProps } from '../utils/figmaStyleAdapter.js';
import { normalizeDimensionToPx, type DimensionValue } from '@toghen/lib';
import { buildSum, type Sum } from '../utils/sum.js';
import { keyIn, loadLock } from '../utils/lockStore.js';
import type { Lock, LockedLibrary, Overrides } from '../../shared/protocol.js';
import { styleTargetOf } from '../utils/styleTarget.js';
import { tokenPathToVariableName } from '../utils/tokenPath.js';
import { ComponentRunError } from './errors.js';
import { getStamp, isOwn } from './stamp.js';

export interface Resolved {
  page: PageNode;
  /** The variable a dimension or opacity token names. */
  float(path: string): Variable;
  /** The variable a colour token names. */
  color(path: string): Variable;
  textStyle(path: string): TextStyle;
  /** The effect style style sync made from a shadow token. */
  effectStyle(path: string): EffectStyle;
  /** The component to make an instance of. A set resolves to its default variant. */
  component(ref: ComponentRef): ComponentNode;
  /** Where the locator found a component, imported or not: the name it answered with, the key it imports by, the declared library it came from. */
  componentSource(ref: ComponentRef): { name: string; key?: string; library?: string };
  /** The component or the set a preferred value by name names; undefined for one by key, and for a name a dry run did not import. */
  preferred(value: PreferredValue): ComponentNode | ComponentSetNode | undefined;
  mode(collection: string, mode: string): ModePin;
  /** The text styles the members use, whose fonts must be loaded before any text is written. */
  textStyles(): TextStyle[];
  /** What a dry run counted as present because `options.pending` said it would be created, one line each. */
  pending: string[];
  /** What the run noticed and leaves as it is: a variable bound to a field it is not offered to, which still draws. */
  notes: string[];
  /**
   * A token's value at the declared defaults, as the core answers it in Figma's representation, and the defaults' mode
   * name: what a field, or part of one, that Figma cannot bind is written as. Undefined when the run did not need it.
   * A `strokeStyle` gives its dash array, in pixels, for `dashPattern`.
   */
  valueOf(path: string): { value: VariableValue | number[]; context: string } | undefined;
  /** A gradient token on a paint, or a shadow or dimension token on `effects`, read from the core (unit 4). Undefined for any other. */
  composite(path: string): Composite | undefined;
  /** The variable a token names, of any type: what a text field, `visible`, `characters` or an instance property binds. */
  variable(path: string): Variable;
  /**
   * A line height or letter spacing that is not in pixels, as Figma takes it (PERCENT, or AUTO), at the declared
   * defaults, and the defaults' mode name: written as its value, since Figma binds these in pixels only. Undefined when
   * the token is in pixels, and bound.
   */
  textValue(field: string, path: string): { value: LineHeight | LetterSpacing; context: string } | undefined;
  /** The families of a `fontFamily` token that is a stack of more than one, as the core gives it; its variable holds the first. */
  stack(path: string): string[] | undefined;
  /** What a `string` or `boolean` variable holds in its collection's default mode: what a layer wired to a property whose default it is shows. */
  shows(path: string): string | boolean;
}

/**
 * What a layer's `modes` pins: a mode of a local collection, or of a collection a `--use` library holds. A library's
 * is known by its library and collection names only, which FigCraft's `library.setVariableMode` takes; its `collection.id`
 * is `library:<library>/<collection>` and its `modeId` the mode's name, so the record of what a run pinned compares it.
 */
export type ModePin =
  | { collection: VariableCollection; modeId: string; library?: undefined }
  /** `where` is the pin as the file wrote it, with its line, for the target's own error about the mode. */
  | { library: { name: string; id?: string }; collection: { id: string; name: string }; modeId: string; where: string };

/** Whether the target pins a library collection's mode: FigCraft's does; Figma's waits for a measurement in the desktop app. */
let libraryModes = false;
export function pinLibraryModes(on: boolean): void {
  libraryModes = on;
}

/**
 * A token that becomes one Figma object or several, with parts bound one by one (unit 4): a gradient's paint, whose
 * stops bind their colours; a shadow's effects, whose five fields bind; a dimension's layer blur, whose radius binds.
 */
export interface Composite {
  /** A gradient's paint at the declared defaults, unbound. */
  paint?: GradientPaint;
  /** A shadow's effects, or a blur's one, at the declared defaults, unbound. */
  effects?: Effect[];
  /** The token each bound part follows, by part: `<index>.<field>`, the stop or effect and its field (`1.color`, `0.radius`). */
  bound: Record<string, string>;
  /** The parts written as values, in the file's words, for the report: `stop positions`, `spread`. */
  written: string[];
  /** The declared defaults' mode name, which the written parts follow. */
  context: string;
}

/** A reference and where the file first wrote it, so a message can say `line 12`. */
export interface Wanted {
  loc?: Loc;
  /** The member the reference was first found in. */
  member?: string;
  /** The member and the axis values a reference was expanded from (`{hue.(input)hue.soft}`), when it was: said beside the line. */
  via?: string;
}

const at = (wanted: Wanted): string => {
  const parts = [wanted.loc ? `line ${wanted.loc.line}` : '', wanted.via ?? ''].filter((part) => part !== '');
  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
};
const pathKey = (path: string): string => `{${path}}`;

function references(layer: Layer, into: References, member?: Member): void {
  for (const [field, value] of Object.entries(layer.fields)) {
    const spec = FIELDS[field];
    const at = layer.fieldLoc?.[field];
    if (!spec) continue;
    // A reference expanded from an axis says which member and which axis values made it: the same path is not the same line in every member.
    const axes = layer.fromAxes?.[field];
    const loc: Wanted = {
      ...(at ? { loc: at } : {}),
      ...(member ? { member: member.name } : {}),
      ...(member && axes ? { via: `member "${member.name}", ${viaAxes(axes, member.combination)}` } : {}),
    };
    // The field a token is bound to, once per token and field: what the unit and the scopes of its variable are held against.
    const bind = (path: string): void => {
      const fields = into.bound.get(path) ?? into.bound.set(path, new Map()).get(path)!;
      if (!fields.has(field)) fields.set(field, { text: layer.kind === 'TEXT', where: loc });
    };
    const given = value as Value;
    if (PIXELS_ONLY_FIELDS.includes(field)) {
      // A line height or letter spacing: bound in pixels, written as its value otherwise. Which, the token's unit says.
      if (given.kind === 'token' && !into.metrics.has(`${field} ${given.path}`))
        into.metrics.set(`${field} ${given.path}`, { ...loc, field, path: given.path });
    } else if (spec.token?.bind && (spec.value === 'token' || spec.value === 'boolean' || spec.value === 'string')) {
      // A font's halves, `visible` and `characters`: the variable type is the table's.
      if (given.kind === 'token') {
        addTyped(into, given.path, spec.token.bind.variable, loc);
        bind(given.path);
      }
    } else if ((spec.value === 'dimension' || spec.value === 'size') && !spec.token?.bind) {
      // A field Figma cannot bind: the token is written as its value, which the core gives.
      const scalar = value as Value;
      if (scalar.kind === 'token' && !into.values.has(scalar.path)) into.values.set(scalar.path, { ...loc, field });
    } else if (spec.value === 'dimension' || spec.value === 'size') {
      const scalar = value as Value;
      if (scalar.kind === 'token') {
        into.floats.set(scalar.path, into.floats.get(scalar.path) ?? loc);
        bind(scalar.path);
      }
    } else if (spec.value === 'dashes') {
      // A dash pattern Figma cannot bind: its strokeStyle token is written as its dash array, which the core gives.
      for (const dash of value as Value[])
        if (dash.kind === 'token' && !into.values.has(dash.path)) into.values.set(dash.path, { ...loc, field });
    } else if (spec.value === 'paints') {
      for (const paint of value as Value[]) {
        if (paint.kind === 'token') {
          into.colors.set(paint.path, into.colors.get(paint.path) ?? loc);
          bind(paint.path);
        }
      }
    } else if (spec.value === 'effects') {
      // Unit 4: a shadow or a blur, which only the design system tells apart; `resolve` asks it.
      for (const effect of value as Value[])
        if (effect.kind === 'token') into.effects.set(effect.path, into.effects.get(effect.path) ?? loc);
    } else if (spec.value === 'grids') {
      // Unit 4: a grid's numbers are bound; its colour is written as its value.
      for (const grid of value as LayoutGridRecord[]) {
        for (const [key, part] of Object.entries(grid)) {
          if (typeof part !== 'object' || part.kind !== 'token') continue;
          if (key === 'color') {
            if (!into.values.has(part.path)) into.values.set(part.path, { ...loc, field });
          } else {
            into.floats.set(part.path, into.floats.get(part.path) ?? loc);
            bind(part.path);
          }
        }
      }
    } else if (spec.value === 'token') {
      const scalar = value as Value;
      const styles = field === 'effectStyle' ? into.effectStyles : into.textStyles;
      if (scalar.kind === 'token') styles.set(scalar.path, styles.get(scalar.path) ?? loc);
    } else if (spec.value === 'component') {
      const scalar = value as Value;
      if (scalar.kind === 'plain' && typeof scalar.value === 'string') addComponent(into, { name: scalar.value }, at);
      else if (scalar.kind === 'key') addComponent(into, { key: scalar.key }, at);
    } else if (spec.value === 'modes') {
      for (const [collection, mode] of Object.entries(value as Record<string, string>)) {
        const key = `${collection}=${mode}`;
        into.modes.set(key, into.modes.get(key) ?? { loc: at });
      }
    }
  }
  for (const child of layer.children) references(child, into, member);
}

/** The tokens and text styles the members name, each with where the file first wrote it: what a repository can check without Figma. */
export function namedTokens(
  members: Member[],
): Pick<References, 'floats' | 'colors' | 'textStyles' | 'effectStyles' | 'effects'> & { others: Map<string, Wanted> } {
  const into = emptyReferences();
  for (const member of members) references(member.tree, into, member);
  // The tokens of the text fields, `visible` and `characters`, once each.
  const others = new Map<string, Wanted>();
  for (const entry of [...into.typed.values(), ...into.metrics.values()]) if (!others.has(entry.path)) others.set(entry.path, entry);
  return { ...into, others };
}

const emptyReferences = (): References => ({
  floats: new Map(),
  colors: new Map(),
  textStyles: new Map(),
  effectStyles: new Map(),
  components: new Map(),
  modes: new Map(),
  bound: new Map(),
  values: new Map(),
  typed: new Map(),
  metrics: new Map(),
  effects: new Map(),
});

/** A token whose variable of this type is bound, once per type: a path wanted as two types is refused by the second lookup. */
function addTyped(into: References, path: string, type: VariableResolvedDataType, where: Wanted): void {
  const key = `${type} ${path}`;
  if (!into.typed.has(key)) into.typed.set(key, { ...where, path, type });
}

/** The preferred values of an `INSTANCE_SWAP` or a `SLOT`; none for any other property. */
export const preferredOf = (property: Property): PreferredValue[] =>
  property.type === 'INSTANCE_SWAP' || property.type === 'SLOT' ? (property.preferredValues ?? []) : [];

const componentKey = (ref: ComponentRef): string => ('name' in ref ? `name:${ref.name}` : `key:${ref.key}`);

function addComponent(into: References, ref: ComponentRef, loc?: Loc): void {
  const key = componentKey(ref);
  if (!into.components.has(key)) into.components.set(key, { ref, loc });
}

export interface References {
  floats: Map<string, Wanted>;
  colors: Map<string, Wanted>;
  textStyles: Map<string, Wanted>;
  effectStyles: Map<string, Wanted>;
  components: Map<string, Wanted & { ref: ComponentRef }>;
  modes: Map<string, Wanted>;
  /** Each token the members bind, to each field it is bound to, and whether that layer is a text. */
  bound: Map<string, Map<string, { text: boolean; where: Wanted }>>;
  /** Each token on a field Figma cannot bind, with the first field it is on: written as its value. */
  values: Map<string, Wanted & { field: string }>;
  /** Each token bound as a `STRING`, `BOOLEAN` or (a font's weight) `FLOAT` variable, by type and path. */
  typed: Map<string, Wanted & { path: string; type: VariableResolvedDataType }>;
  /** Each token on a line height or letter spacing, by field and path: bound in pixels, written as its value otherwise. */
  metrics: Map<string, Wanted & { field: string; path: string }>;
  /** Each token on `effects`: a shadow or a blur, as the design system says (unit 4). */
  effects: Map<string, Wanted>;
}

/** What a failed import says. An unpublished key fails as an unknown one does (measured), so the error cannot tell which. */
export const NOT_IMPORTED = 'not published, or not this key: publish the library, then accept its update in this file';

/** The libraries a file declares, each read through the overrides map, as the locator reads them. */
export const declaredLibraries = (declared: readonly string[], overrides: Overrides = {}): string[] => [
  ...new Set(declared.map((name) => overrides[name] ?? name)),
];

/** The components and sets a file can make an instance of, on every page loaded: a member of a set is named for its combination, and is not one. */
export const localComponents = (): SceneNode[] =>
  findInEveryPage({ types: ['COMPONENT', 'COMPONENT_SET'] }).filter(
    (node) => !(node.type === 'COMPONENT' && node.parent?.type === 'COMPONENT_SET'),
  );

/** Where the locator finds a component a file names, and why it finds none or too many. */
export type Located =
  /** The overrides map sends the name to a key. */
  | { at: 'key'; name: string; key: string }
  | { at: 'library'; name: string; library: string; key: string; set: boolean }
  | { at: 'file'; name: string; node: SceneNode }
  | { at: 'missing'; name: string }
  /** In this file and in a declared library: it stops the build. */
  | { at: 'both'; name: string; here: SceneNode[]; libraries: string[] }
  | { at: 'several'; name: string; libraries: string[] }
  | { at: 'ambiguous'; name: string; here: SceneNode[] };

/**
 * A component's name, answered in the locator's one order, never falling back: the overrides map first, then a
 * declared library's lock entry, then this file. `name` is the name it answered with. Reads only: nothing is imported.
 */
export function locateComponent(written: string, libraries: readonly string[], lock: Lock, local: readonly SceneNode[]): Located {
  const name = lock.overrides?.[written] ?? written;
  const key = keyIn(name);
  if (key !== undefined) return { at: 'key', name, key };
  const here = local.filter((node) => node.name === name);
  const from = libraries.filter((library) => lock.libraries[library]?.components[name] !== undefined);
  if (from.length > 0) {
    if (here.length > 0) return { at: 'both', name, here, libraries: from };
    if (from.length > 1) return { at: 'several', name, libraries: from };
    const entry = lock.libraries[from[0]].components[name];
    return { at: 'library', name, library: from[0], key: entry.key, set: entry.set };
  }
  if (here.length === 0) return { at: 'missing', name };
  if (here.length > 1) return { at: 'ambiguous', name, here };
  return { at: 'file', name, node: here[0] };
}

/** The collection and the name the variable sync gives a token, by its path: what the lock keeps a library's variables by. */
export function variableSlots(
  sum = sumOfLoadedDocument(),
): ((path: string) => { collection: string; name: string } | undefined) | undefined {
  return sum && ((path) => sum.tokenByPath.get(`${sum.dsName}.${path}`)?.variables[0]);
}

/** What a file names, as `resolve` looks it up. */
function wantedOf(desired: Desired): References {
  const wanted = emptyReferences();
  for (const member of desired.members) references(member.tree, wanted, member);
  for (const property of desired.component.properties) {
    if (property.type === 'INSTANCE_SWAP') addComponent(wanted, property.default, property.loc);
    // A preferred value by name is found as an instance swap's default is; one by key is the target's to take.
    for (const value of preferredOf(property)) if ('name' in value) addComponent(wanted, { name: value.name }, value.loc ?? property.loc);
    // A default that is a token binds its variable: a `boolean` one to a BOOLEAN property, a `string` one to a TEXT property.
    if ((property.type === 'BOOLEAN' || property.type === 'TEXT') && typeof property.default === 'object') {
      addTyped(
        wanted,
        property.default.token,
        property.type === 'BOOLEAN' ? 'BOOLEAN' : 'STRING',
        property.loc ? { loc: property.loc } : {},
      );
    }
  }
  return wanted;
}

/**
 * The components a file names by name, as `resolve` looks them up: an instance's `component`, an `INSTANCE_SWAP`
 * default, a preferred value. What the order of a run's files is computed from (`shared/components/order.ts`).
 */
// ponytail: a component named only as an instance's `set` value of an INSTANCE_SWAP is left out, since which `set`
// values name components is known only from the built component; add it if a run is found misordered by one.
export const namedComponents = (desired: Desired): string[] =>
  [...wantedOf(desired).components.values()]
    .map(({ ref }) => ('name' in ref ? ref.name : undefined))
    .filter((name): name is string => name !== undefined);

/**
 * Resolves what `desired` names.
 *
 * Reads the file's variables, styles, components and pages; writes nothing, with
 * one exception the caller controls: what a published key names (a `(key)` in the
 * file, the overrides map, or the lock for a declared library) has to be imported
 * to be found, and a dry run does not import.
 *
 * Each name is answered in one order, and never falls back: the lock's overrides map
 * replaces it first; a name a declared library's lock entry holds imports by key; any
 * other resolves in this file. A name found both in this file and in a declared
 * library stops the build. See `specs.md`, *The lock*.
 */
export async function resolve(desired: Desired, options: RunOptions): Promise<Resolved> {
  const wanted = wantedOf(desired);

  const problems: string[] = [];
  const pending: string[] = [];
  const notes: string[] = [];

  // The lock: the overrides map, and the declared libraries' entries. A library's name is replaced by the map too.
  const lock = loadLock();
  const overrides = lock.overrides ?? {};
  const libraries = declaredLibraries(options.libraries ?? [], overrides);
  for (const name of libraries) {
    if (!lock.libraries[name])
      notes.push(
        `library "${name}" is declared, and the lock holds nothing for it: discover its variables, or pick its components, in the Build pane`,
      );
  }
  const replaced = (name: string, label: string): string => {
    const to = overrides[name];
    if (to === undefined) return name;
    notes.push(`${label} is read as ${keyIn(to) === undefined ? `"${to}"` : to}, as the overrides map says`);
    return to;
  };
  const inLibraries = <T>(pick: (library: LockedLibrary) => T | undefined): { library: string; entry: T }[] => {
    const found: { library: string; entry: T }[] = [];
    for (const library of libraries) {
      const entry = lock.libraries[library] && pick(lock.libraries[library]);
      if (entry !== undefined) found.push({ library, entry });
    }
    return found;
  };
  const quoted = (names: string[]): string => names.map((name) => `"${name}"`).join(' and ');
  const both = (label: string, here: string, from: { library: string }[]): string =>
    `${label} is in this file (${here}) and in library ${quoted(from.map((f) => f.library))}: a name found in both stops the build; rename one, or name the one to use in the overrides map`;
  const several = (label: string, from: { library: string }[]): string =>
    `${label} is in libraries ${quoted(from.map((f) => f.library))}: name the one to use in the overrides map, as (key)"…"`;
  // Importing writes to the file, so a dry run says what it would import and imports nothing.
  const importing = async (label: string, from: string, load: () => Promise<void>): Promise<void> => {
    if (options.dryRun) return void pending.push(`${label}: would import ${from}`);
    try {
      await load();
    } catch {
      problems.push(`${label}: ${from} did not import: ${NOT_IMPORTED}`);
    }
  };

  // The page
  let page: PageNode | undefined;
  if (options.page === undefined) {
    page = figma.currentPage;
  } else {
    page = figma.root.children.find((candidate) => candidate.name === options.page);
    if (!page) problems.push(`no page named "${options.page}" in this file`);
  }

  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const variables = await figma.variables.getLocalVariablesAsync();

  // Tokens: a path is looked for by the name the variable sync writes, `tokenPathToVariableName(path)`, in every collection.
  // A name found in two collections stops the build; there is no syntax for choosing.
  const floats = new Map<string, Variable>();
  const colors = new Map<string, Variable>();
  const textStyles = new Map<string, TextStyle>();
  const effectStyles = new Map<string, EffectStyle>();

  // A variable an earlier step of a dry run would remove, because its token moves to another collection, is not counted.
  const removing = options.pending?.removed ?? [];
  const variableMatches = (path: string): { collection: VariableCollection; variable: Variable }[] => {
    const found: { collection: VariableCollection; variable: Variable }[] = [];
    const name = tokenPathToVariableName(path);
    for (const collection of collections) {
      if (removing.some((gone) => gone.collection === collection.name && gone.name === name)) continue;
      for (const variable of variables) {
        if (variable.variableCollectionId === collection.id && variable.name === name) found.push({ collection, variable });
      }
    }
    return found;
  };

  // Among the variables of one token's name, the one the sync stamped for it in the collection it lives in, and one
  // stamped for it in another: written by an earlier sync, before the token moved.
  const olderFrom = (path: string, matches: { collection: VariableCollection; variable: Variable }[]): string => {
    const { resolver, conversionMap } = getState();
    if (!resolver || matches.length < 2) return '';
    let lookup: string;
    let home: string | undefined;
    try {
      const { dsCollectionName } = resolveSumModes(resolver);
      lookup = `${dsCollectionName}.${path}`;
      home = buildSum(resolver, dsCollectionName, conversionMap).tokenByPath.get(lookup)?.variables[0]?.collection;
    } catch {
      return '';
    }
    // A person's copy carries the stamp of the variable it was made from, and is not one the sync wrote.
    const stamped = (m: { variable: Variable }) => {
      const stamp = getStamp(m.variable);
      return stamp?.is.token === lookup && isOwn(m.variable, stamp);
    };
    const current = matches.find((m) => stamped(m) && m.collection.name === home);
    const older = matches.find((m) => m !== current && stamped(m));
    return current && older
      ? `; the one in "${current.collection.name}" is the one the sync recorded for this token, and the one in "${older.collection.name}" was written by an earlier sync, from before the token moved: delete it in Figma`
      : '';
  };

  // What an earlier step would create is looked up by the same rule, so a dry run and the real run that follows it agree.
  const pendingVariables = (path: string): NonNullable<RunOptions['pending']>['variables'] =>
    (options.pending?.variables ?? []).filter((entry) => entry.name === tokenPathToVariableName(path));

  // A library's variable is kept by its collection and name, which only the loaded document gives.
  const sum = sumOfLoadedDocument();
  const slotOf = variableSlots(sum);
  const libraryVariable = (path: string, label: string): { library: string; entry: { id: string; key: string } }[] | undefined => {
    if (inLibraries((library) => (Object.keys(library.variables).length > 0 ? library : undefined)).length === 0) return [];
    if (!slotOf) {
      problems.push(
        `${label} may be a library's, and the lock keeps a library's variables by the collection the variable sync gives each token; no design system is loaded to say which: load its resolver document`,
      );
      return undefined;
    }
    const slot = slotOf(path);
    const id = slot && `${slot.collection}/${slot.name}`;
    return id === undefined
      ? []
      : inLibraries((library) => (library.variables[id] === undefined ? undefined : { id, key: library.variables[id] }));
  };
  const importVariable = (
    path: string,
    label: string,
    key: string,
    from: string,
    type: VariableResolvedDataType,
    into: Map<string, Variable>,
    what: string,
  ): Promise<void> =>
    importing(label, from, async () => {
      const variable = await figma.variables.importVariableByKeyAsync(key);
      if (variable.resolvedType !== type) problems.push(`${label} is a ${variable.resolvedType} variable, but ${what} needs a ${type} one`);
      else into.set(path, variable);
    });

  // `written` is the path as the file wrote it, which the engine asks for; `path` is what the overrides map replaced it with.
  const lookVariable = async (
    written: string,
    where: Wanted,
    type: VariableResolvedDataType,
    into: Map<string, Variable>,
    what: string,
  ): Promise<void> => {
    const label = `token ${pathKey(written)}${at(where)}`;
    const path = replaced(written, label);
    const key = keyIn(path);
    if (key !== undefined) return importVariable(written, label, key, `(key)"${key}" from the overrides map`, type, into, what);
    const fromLibrary = libraryVariable(path, label);
    if (fromLibrary === undefined) return;
    const matches = variableMatches(path);
    if (fromLibrary.length > 0) {
      if (matches.length > 0)
        problems.push(both(label, matches.map((m) => `${m.collection.name}: "${m.variable.name}"`).join('; '), fromLibrary));
      else if (fromLibrary.length > 1) problems.push(several(label, fromLibrary));
      else
        return importVariable(
          written,
          label,
          fromLibrary[0].entry.key,
          `"${fromLibrary[0].entry.id}" from library "${fromLibrary[0].library}"`,
          type,
          into,
          what,
        );
      return;
    }
    // A pending name that is already in the file is the variable in the file, not a second one.
    const coming = pendingVariables(path).filter(
      (entry) => !matches.some((m) => m.collection.name === entry.collection && m.variable.name === entry.name),
    );
    if (matches.length === 0 && coming.length === 1 && coming[0].type === type) {
      pending.push(`${label}: the variable sync would create "${coming[0].name}"`);
    } else if (matches.length + coming.length === 0) {
      const tried =
        collections.length > 0
          ? `"${tokenPathToVariableName(path)}" in ${collections.map((c) => `"${c.name}"`).join(', ')}`
          : 'no collection';
      problems.push(`${label} names no variable: looked for ${tried}`);
    } else if (matches.length + coming.length > 1) {
      const names = [
        ...matches.map((m) => `${m.collection.name}: "${m.variable.name}"`),
        ...coming.map((c) => `${c.collection}: "${c.name}" (the sync would create it)`),
      ].join('; ');
      problems.push(
        `${label} is ambiguous, it matches ${names}; a design system whose names collide has a naming problem for you to fix${olderFrom(path, matches)}`,
      );
    } else if (matches.length === 0) {
      problems.push(`${label} is a ${coming[0].type} variable the sync would create, but ${what} needs a ${type} one`);
    } else if (matches[0].variable.resolvedType !== type) {
      problems.push(`${label} is a ${matches[0].variable.resolvedType} variable, but ${what} needs a ${type} one`);
    } else {
      into.set(written, matches[0].variable);
    }
  };
  // Gradients and effects (unit 4). A paint token the design system says is a gradient, and every token on `effects`, is
  // read from the core at the declared defaults: the Figma objects it makes, and the tokens its members refer to. A
  // member that refers to a token with a variable is bound to that variable; any other part is written as its value.
  const core = coreAtDefaults();
  const needs = ' and no design system is loaded; load its resolver document in the plugin, or pass it to the command line';
  const composites = new Map<string, Composite>();
  // A member's token is bound when the locator would find a variable for it: the overrides map names one, a declared
  // library holds it, a variable in the file has its name, or a dry run's sync would make one. The lookup below then holds it to its rules.
  const bindable = (path: string, where: Wanted, into: Map<string, Wanted>): boolean => {
    const named = overrides[path] !== undefined || (libraryVariable(path, `token ${pathKey(path)}${at(where)}`)?.length ?? 0) > 0;
    if (!named && variableMatches(path).length + pendingVariables(path).length === 0) return false;
    if (!into.has(path)) into.set(path, where);
    return true;
  };
  const unreadable = (path: string, where: Wanted, what: string, error: unknown): void =>
    void problems.push(`token ${pathKey(path)}${at(where)} is a ${what} Figma cannot take: ${(error as Error).message}`);
  if (core) {
    for (const [path, where] of [...wanted.colors].filter(([candidate]) => core.valueOf(candidate)?.type === 'gradient')) {
      wanted.colors.delete(path);
      const value = core.raw(path);
      let paint: GradientPaint;
      try {
        paint = toPaintStyleProps(value).paints[0] as GradientPaint;
      } catch (error) {
        unreadable(path, where, 'gradient', error);
        continue;
      }
      // A W3C gradient is a list of stops and has no angle: it runs left to right. Toghen's object form may carry one.
      const angled =
        typeof value === 'object' && value !== null && !Array.isArray(value) && (value as { angle?: unknown }).angle !== undefined;
      const references = core.references(path);
      const bound: Record<string, string> = {};
      const written = angled ? ['stop positions', 'angle'] : ['stop positions'];
      paint.gradientStops.forEach((_stop, index) => {
        const target = references[`${index}.color`] ?? references[`stops.${index}.color`];
        if (target !== undefined && bindable(target, where, wanted.colors)) bound[`${index}.color`] = target;
        else written.push(`colour of stop ${index + 1}`);
      });
      composites.set(path, { paint, bound, written, context: core.context });
    }
  }
  for (const [path, where] of wanted.effects) {
    const type = core?.valueOf(path)?.type;
    if (!core) problems.push(`token ${pathKey(path)}${at(where)} on "effects" is a shadow or a blur, as the design system says,${needs}`);
    else if (type === 'dimension') {
      // A layer blur, its radius bound to the token's variable.
      wanted.floats.set(path, wanted.floats.get(path) ?? where);
      const radius = core.valueOf(path)?.value as number;
      composites.set(path, {
        effects: [{ type: 'LAYER_BLUR', blurType: 'NORMAL', radius, visible: true }],
        bound: { '0.radius': path },
        written: [],
        context: core.context,
      });
    } else if (type === 'shadow') {
      const value = core.raw(path);
      let effects: Effect[];
      try {
        effects = toEffectStyleProps(value).effects;
      } catch (error) {
        unreadable(path, where, 'shadow', error);
        continue;
      }
      const shadows = (Array.isArray(value) ? value : [value]) as Record<string, unknown>[];
      const references = core.references(path);
      const bound: Record<string, string> = {};
      const written: string[] = [];
      shadows.forEach((shadow, index) => {
        for (const [member, field] of Object.entries(SHADOW_FIELDS)) {
          if (shadow[member] === undefined) continue;
          const target = references[Array.isArray(value) ? `${index}.${member}` : member];
          if (target !== undefined && bindable(target, where, field === 'color' ? wanted.colors : wanted.floats))
            bound[`${index}.${field}`] = target;
          else if (!written.includes(member)) written.push(member);
        }
      });
      composites.set(path, { effects, bound, written, context: core.context });
    } else if (type === undefined)
      problems.push(`token ${pathKey(path)}${at(where)} on "effects": the loaded design system has no such token`);
    else
      problems.push(
        `token ${pathKey(path)}${at(where)} is a ${type}, and "effects" takes a shadow, or a dimension for a layer blur's radius`,
      );
  }

  for (const [path, where] of wanted.floats) await lookVariable(path, where, 'FLOAT', floats, 'a dimension or opacity');
  for (const [path, where] of wanted.colors) await lookVariable(path, where, 'COLOR', colors, 'a fill or stroke');

  // Text fields, `visible`, `characters`, instance properties and property defaults: by the variable type each binds.
  const strings = new Map<string, Variable>();
  const booleans = new Map<string, Variable>();
  const typedInto: Partial<Record<VariableResolvedDataType, Map<string, Variable>>> = {
    FLOAT: floats,
    STRING: strings,
    BOOLEAN: booleans,
    COLOR: colors,
  };
  const lookTyped = async (path: string, where: Wanted, type: VariableResolvedDataType): Promise<void> => {
    if (!typedInto[type]!.has(path)) await lookVariable(path, where, type, typedInto[type]!, `a field bound to a ${type} variable`);
  };
  for (const entry of wanted.typed.values()) await lookTyped(entry.path, entry, entry.type);

  // A line height or letter spacing in pixels is bound; in any other unit it is written as its value, at the declared
  // defaults. Only the core can say which: the unit is the token's, and a variable holds a bare number.
  const textValues = new Map<string, { value: LineHeight | LetterSpacing; context: string }>();
  for (const [key, where] of wanted.metrics) {
    const { field, path } = where;
    const token = core?.valueOf(path) === undefined ? undefined : { value: core.raw(path) };
    const said = `token ${pathKey(path)}${at(where)} on "${field}" is bound in pixels or written as its value, as its unit says`;
    if (!core || !token) {
      problems.push(
        `${said}, and ${core ? 'the loaded design system has no such token' : 'no design system is loaded; load its resolver document in the plugin, or pass it to the command line'}`,
      );
      continue;
    }
    let figmaValue: LineHeight | LetterSpacing;
    try {
      figmaValue = field === 'lineHeight' ? toFigmaLineHeight(token.value) : toFigmaLetterSpacing(token.value);
    } catch (error) {
      problems.push(`token ${pathKey(path)}${at(where)} on "${field}": ${(error as Error).message}`);
      continue;
    }
    if (figmaValue.unit === 'PIXELS') {
      await lookTyped(path, where, 'FLOAT');
      const fields = wanted.bound.get(path) ?? wanted.bound.set(path, new Map()).get(path)!;
      if (!fields.has(field)) fields.set(field, { text: true, where });
    } else {
      textValues.set(key, { value: figmaValue, context: core.context });
    }
  }

  // What a variable is for is held against what binds it. A unit that does not fit draws wrongly (an opacity bound to a
  // width is 1px, a plain number bound to opacity is 1%), so it stops the component; a scope that does not fit still draws.
  if (sum) {
    for (const [path, byField] of wanted.bound) {
      const token = sum.tokenByPath.get(`${sum.dsName}.${path}`);
      const purpose = token?.routing.kind === 'variable' ? token.purpose : undefined;
      if (!purpose) continue;
      for (const [field, { text, where }] of byField) {
        const place = `token ${sum.dsName}.${path}${where.member !== undefined ? ` in member "${where.member}"` : ''}`;
        const line = where.loc ? ` (line ${where.loc.line})` : '';
        if (field === 'opacity' && !purpose.opacity) {
          problems.push(`${place} is bound to opacity but is not an opacity; declare figma.scopes ["OPACITY"] on it${line}`);
        } else if (field !== 'opacity' && purpose.opacity) {
          problems.push(`${place} is an opacity, bound to ${field}${line}`);
        } else if (purpose.scopes.length > 0) {
          const fits = scopesOfField(field, text);
          const offered = (scope: VariableScope): boolean =>
            purpose.scopes.includes('ALL_SCOPES') ||
            purpose.scopes.includes(scope) ||
            (purpose.scopes.includes('ALL_FILLS') && /_FILL$/.test(scope));
          if (fits.length > 0 && !fits.some(offered)) {
            notes.push(
              `${sum.dsName}.${path} is bound to ${field} but is offered to ${purpose.scopes.join(', ')} only; declare figma.scopes to widen it.`,
            );
          }
        }
      }
    }
  }

  // What Figma cannot bind is written as the token's value at the declared defaults, which only the core answers. A
  // colour's alpha is such a part: a paint's opacity does not bind. Without the core it cannot be known, so a colour
  // whose variable holds an alpha below 1 stops the run, as does any token on a field with no binding.
  const values = new Map<string, { value: VariableValue | number[]; context: string }>();
  const valueAt = (path: string, where: Wanted, what: string): void => {
    if (!core) return void problems.push(`token ${pathKey(path)}${at(where)} ${what},${needs}`);
    const answer = core.valueOf(path);
    // ponytail: a token is held against the first field the file writes it on; another field of another type is not checked.
    const types = (FIELDS[(where as { field?: string }).field ?? '']?.token?.types ?? []) as readonly string[];
    if (answer === undefined) problems.push(`token ${pathKey(path)}${at(where)} ${what}, and the loaded design system has no such token`);
    else if (types.length > 0 && !types.includes(answer.type)) {
      problems.push(
        `token ${pathKey(path)}${at(where)} ${what}; it is a ${answer.type || 'token with no type'}, and "${(where as { field: string }).field}" takes a ${types.join(' or a ')}`,
      );
    } else if (answer.value === undefined)
      problems.push(`token ${pathKey(path)}${at(where)} ${what}, and its value is not one Figma can take there`);
    else values.set(path, { value: answer.value, context: core.context });
  };
  for (const [path, where] of wanted.values) valueAt(path, where, `on "${where.field}" is written as its value, which Figma cannot bind`);
  for (const [path, where] of wanted.colors) {
    const variable = colors.get(path);
    const translucent =
      !!variable && Object.values(variable.valuesByMode).some((value) => typeof value === 'object' && 'a' in value && value.a < 1);
    const value = core?.valueOf(path)?.value;
    if (value !== undefined) values.set(path, { value, context: core!.context });
    else if (translucent) valueAt(path, where, "has an alpha, written as the paint's opacity, which Figma cannot bind");
  }

  // A style is named as a variable is, and no collection comes into it. A name the sync would create is found by the same rule.
  // A token that is only a reference to a style names the style its target becomes, the chain followed.
  const state = getState();
  const targetOf = styleTargetOf(state.resolver, state.conversionMap);
  // A library's style is kept by the token path it is named from: the target, as for a local one.
  const lookStyle = async <S extends BaseStyle>(
    what: string,
    styleType: 'TEXT' | 'EFFECT',
    wantedStyles: Map<string, Wanted>,
    local: readonly S[],
    pendingNames: string[] | undefined,
    into: Map<string, S>,
  ): Promise<void> => {
    const importStyle = (path: string, label: string, key: string, from: string): Promise<void> =>
      importing(label, from, async () => {
        const style = await figma.importStyleByKeyAsync(key);
        if (style.type !== styleType) problems.push(`${label} is a ${style.type.toLowerCase()} style, not a ${what}`);
        else into.set(path, style as S);
      });
    for (const [path, where] of wantedStyles) {
      const label = `${what} ${pathKey(path)}${at(where)}`;
      const written = replaced(path, label);
      const key = keyIn(written);
      if (key !== undefined) {
        await importStyle(path, label, key, `(key)"${key}" from the overrides map`);
        continue;
      }
      const target = targetOf(written, styleType);
      const name = tokenPathToVariableName(target);
      const matches = local.filter((style) => style.name === name);
      const fromLibrary = inLibraries((library) => (library.styles[target]?.kind === styleType ? library.styles[target] : undefined));
      if (fromLibrary.length > 0) {
        if (matches.length > 0) problems.push(both(label, `"${name}"`, fromLibrary));
        else if (fromLibrary.length > 1) problems.push(several(label, fromLibrary));
        else await importStyle(path, label, fromLibrary[0].entry.key, `"${name}" from library "${fromLibrary[0].library}"`);
        continue;
      }
      const coming = (pendingNames ?? []).includes(name) && matches.length === 0 ? [name] : [];
      if (matches.length === 0 && coming.length === 1) pending.push(`${label}: the style sync would create "${coming[0]}"`);
      else if (matches.length + coming.length === 0) problems.push(`${label} names no ${what}`);
      else if (matches.length + coming.length > 1) {
        problems.push(
          `${label} is ambiguous, it matches ${[...matches.map((m) => `"${m.name}"`), ...coming.map((c) => `"${c}" (the sync would create it)`)].join(', ')}`,
        );
      } else into.set(path, matches[0]);
    }
  };
  await lookStyle('text style', 'TEXT', wanted.textStyles, await figma.getLocalTextStylesAsync(), options.pending?.textStyles, textStyles);
  await lookStyle(
    'effect style',
    'EFFECT',
    wanted.effectStyles,
    await figma.getLocalEffectStylesAsync(),
    options.pending?.effectStyles,
    effectStyles,
  );

  // Modes: a collection by name, local or a declared library's, and a mode of it by name. A library's collection is the
  // prefix of its variables' ids in the lock; its modes are not in the lock, so the target says whether the mode is there.
  const modes = new Map<string, ModePin>();
  for (const [key, where] of wanted.modes) {
    const at_ = key.indexOf('=');
    const collectionName = key.slice(0, at_);
    const modeName = key.slice(at_ + 1);
    const label = `modes ${key}${at(where)}`;
    const named = collections.filter((c) => c.name === collectionName);
    const holding = inLibraries((library) =>
      Object.keys(library.variables).some((id) => id.startsWith(`${collectionName}/`)) ? library : undefined,
    );
    // A dry run counts a mode the variable sync would create; a real run builds against what the file holds.
    const coming = (options.pending?.modes ?? []).some((m) => m.collection === collectionName && m.mode === modeName);
    if (holding.length > 0 && (named.length > 0 || coming)) {
      problems.push(
        `${label}: the collection "${collectionName}" is in this file and in library ${quoted(holding.map((h) => h.library))}: a name found in both stops the build; rename one`,
      );
    } else if (holding.length > 1) {
      problems.push(
        `${label}: the collection "${collectionName}" is in libraries ${quoted(holding.map((h) => h.library))}: a name found in two stops the build; rename one, or declare only one of them`,
      );
    } else if (holding.length === 1) {
      const { library, entry } = holding[0];
      if (!libraryModes)
        problems.push(
          `${label}: a library collection's mode ("${collectionName}" in library "${library}") is not measured in Figma yet; pin it on FigCraft, or use a local collection`,
        );
      else
        modes.set(key, {
          library: { name: library, ...(entry.id !== undefined ? { id: entry.id } : {}) },
          collection: { id: `library:${library}/${collectionName}`, name: collectionName },
          modeId: modeName,
          where: label,
        });
    } else if (coming && (named.length === 0 || (named.length === 1 && !named[0].modes.some((m) => m.name === modeName)))) {
      pending.push(`${label}: the variable sync would create it`);
    } else if (named.length === 0) {
      const here = collections.length > 0 ? `this file has ${collections.map((c) => `"${c.name}"`).join(', ')}` : 'this file has none';
      const looked =
        libraries.length === 0
          ? 'and no library is declared'
          : `and ${libraries.length === 1 ? 'library' : 'libraries'} ${quoted(libraries)} ${libraries.length === 1 ? 'holds' : 'hold'} none`;
      problems.push(`${label}: no local variable collection named "${collectionName}" (${here}), ${looked}`);
    } else if (named.length > 1) {
      problems.push(`${label}: ${named.length} local collections are named "${collectionName}"`);
    } else {
      const mode = named[0].modes.find((m) => m.name === modeName);
      if (!mode)
        problems.push(
          `${label}: "${collectionName}" has no mode "${modeName}" (it has ${named[0].modes.map((m) => `"${m.name}"`).join(', ')})`,
        );
      else modes.set(key, { collection: named[0], modeId: mode.modeId });
    }
  }

  // Components: by name, exactly one, in this file or in a declared library's lock entry; or by published key.
  const components = new Map<string, ComponentNode>();
  const sources = new Map<string, { name: string; key?: string; library?: string }>();
  // A key names a component or a set; `set` says which when the lock knows.
  const importComponent = async (ref: ComponentRef, key: string, set?: boolean): Promise<void> => {
    if (set !== true) {
      try {
        return void components.set(componentKey(ref), await figma.importComponentByKeyAsync(key));
      } catch (notAComponent) {
        if (set === false) throw notAComponent;
      }
    }
    // unmeasured: that a key names either a component or a set, and that the component call is the one that fails for a set
    components.set(componentKey(ref), (await figma.importComponentSetByKeyAsync(key)).defaultVariant);
  };
  const local = localComponents();
  const attempted = new Set<string>();
  const lookupComponent = async (ref: ComponentRef, entry: Wanted): Promise<void> => {
    const key = componentKey(ref);
    if (attempted.has(key)) return;
    attempted.add(key);
    if ('name' in ref) {
      const label = `component "${ref.name}"${at(entry)}`;
      replaced(ref.name, label);
      const located = locateComponent(ref.name, libraries, lock, local);
      const ids = (nodes: SceneNode[]): string => nodes.map((m) => m.id).join(', ');
      const named = (from: string[]): { library: string }[] => from.map((library) => ({ library }));
      if (located.at === 'key') {
        sources.set(key, { name: located.name, key: located.key });
        return importing(label, `(key)"${located.key}" from the overrides map`, () => importComponent(ref, located.key));
      }
      if (located.at === 'both') problems.push(both(label, ids(located.here), named(located.libraries)));
      else if (located.at === 'several') problems.push(several(label, named(located.libraries)));
      else if (located.at === 'library') {
        sources.set(key, { name: located.name, key: located.key, library: located.library });
        await importing(
          label,
          `${located.set ? 'the component set' : 'the component'} "${located.name}" from library "${located.library}"`,
          () => importComponent(ref, located.key, located.set),
        );
      } else if (located.at === 'missing' && options.dryRun && options.pending?.components?.includes(located.name)) {
        // A set a file earlier in the same dry run would create (ruling 7a): its name is checked, and what is set on its instances is not yet.
        pending.push(
          `${label}: a file earlier in this run would create it; the properties and slots of instances of "${located.name}" are checked when it is built`,
        );
      } else if (located.at === 'missing') problems.push(`${label} is not in this file`);
      else if (located.at === 'ambiguous')
        problems.push(`${label} is ambiguous, this file has ${located.here.length} of that name (${ids(located.here)})`);
      else {
        sources.set(key, { name: located.name });
        const node = located.node as ComponentNode | ComponentSetNode;
        components.set(key, node.type === 'COMPONENT_SET' ? node.defaultVariant : node);
      }
    } else if (options.dryRun) {
      // Importing writes to the file, and a dry run writes nothing: a key is not checked.
      return;
    } else {
      try {
        await importComponent(ref, ref.key);
      } catch (_notASet) {
        problems.push(
          `component key "${ref.key}"${at(entry)} is neither a published component nor a published component set: ${NOT_IMPORTED}`,
        );
      }
    }
  };
  for (const entry of wanted.components.values()) await lookupComponent(entry.ref, entry);
  // A preferred value by name is answered as an instance swap's default is: a set gives its default variant to a
  // COMPONENT, and itself to a COMPONENT_SET, which a component that is no set cannot answer.
  const preferredNode = (value: PreferredValue): ComponentNode | ComponentSetNode | undefined => {
    const node = 'name' in value ? components.get(componentKey({ name: value.name })) : undefined;
    return node && value.type === 'COMPONENT_SET' && node.parent?.type === 'COMPONENT_SET' ? node.parent : node;
  };
  for (const property of desired.component.properties) {
    for (const value of preferredOf(property)) {
      if ('name' in value && value.type === 'COMPONENT_SET' && preferredNode(value)?.type === 'COMPONENT') {
        problems.push(
          `preferred COMPONENT_SET name="${value.name}"${at({ loc: value.loc })}: "${value.name}" is a component, not a set; write preferred COMPONENT`,
        );
      }
    }
  }

  // Every instance is held against the component it is an instance of: the properties `set` names, and the slots it fills.
  // A component file's members share their layers, so a problem found in several is said once.
  for (const member of desired.members) await checkInstances(member.tree, components, lookupComponent, lookTyped, problems);
  problems.splice(0, problems.length, ...new Set(problems));

  if (problems.length > 0 || !page) {
    throw new ComponentRunError(
      `cannot build "${desired.component.name}": ${problems.length} thing${problems.length === 1 ? '' : 's'} the file names could not be resolved, and nothing was written`,
      problems,
    );
  }

  // What a variable holds in its collection's default mode, its aliases followed.
  const atDefault = (variable: Variable | undefined): VariableValue | undefined => {
    for (let depth = 0; variable && depth < 16; depth++) {
      const collection = collections.find((candidate) => candidate.id === variable!.variableCollectionId);
      const value = variable.valuesByMode[collection?.defaultModeId ?? ''];
      const alias = value as VariableAlias | undefined;
      if (typeof alias !== 'object' || alias === null || alias.type !== 'VARIABLE_ALIAS') return value;
      variable = variables.find((candidate) => candidate.id === alias.id);
    }
    return undefined;
  };

  const found = <T>(map: Map<string, T>, key: string, what: string): T => {
    const value = map.get(key);
    if (value === undefined) throw new Error(`${what} was not resolved: the engine asked for something the file does not name`);
    return value;
  };
  return {
    page,
    float: (path) => found(floats, path, `token ${pathKey(path)}`),
    color: (path) => found(colors, path, `token ${pathKey(path)}`),
    textStyle: (path) => found(textStyles, path, `text style ${pathKey(path)}`),
    effectStyle: (path) => found(effectStyles, path, `effect style ${pathKey(path)}`),
    component: (ref) => found(components, componentKey(ref), `component ${JSON.stringify(ref)}`),
    preferred: preferredNode,
    componentSource: (ref) =>
      sources.get(componentKey(ref)) ?? ('name' in ref ? { name: ref.name } : { name: `(key)"${ref.key}"`, key: ref.key }),
    mode: (collection, mode) => found(modes, `${collection}=${mode}`, `mode ${collection}=${mode}`),
    textStyles: () => [...textStyles.values()],
    pending,
    notes,
    valueOf: (path) => values.get(path),
    composite: (path) => composites.get(path),
    variable: (path) => found([floats, colors, strings, booleans].find((map) => map.has(path)) ?? floats, path, `token ${pathKey(path)}`),
    textValue: (field, path) => textValues.get(`${field} ${path}`),
    stack: (path) => {
      const families = core?.valueOf(path)?.type === 'fontFamily' ? fontStack(core.raw(path)) : [];
      return families.length > 1 ? families : undefined;
    },
    shows: (path) => atDefault(found(strings.has(path) ? strings : booleans, path, `token ${pathKey(path)}`)) as string | boolean,
  };
}

/**
 * The loaded document's tokens at the declared defaults: the core's default mode, the same in every member. `valueOf`
 * is undefined for a path the document does not have; its `value` is undefined when Figma cannot take it.
 */
export function coreAtDefaults():
  | {
      context: string;
      valueOf(path: string): { type: string; value?: VariableValue | number[] } | undefined;
      /** The token's value, resolved, as the core gives it (unit 4). */
      raw(path: string): unknown;
      /** The references the token's members make, by member (`0.color`), as token paths: through a reference that is the whole value. */
      references(path: string): Record<string, string>;
    }
  | undefined {
  const { resolver } = getState();
  if (!resolver) return undefined;
  let sum: MultiModeResolution;
  try {
    sum = resolveSumModes(resolver);
  } catch {
    return undefined;
  }
  const lookup = (path: string): string => `${sum.dsCollectionName}.${path}`;
  return {
    context: sum.defaultMode,
    raw: (path) => readToken(sum.ds, lookup(path), sum.defaultMode)?.$value,
    references: (path) => {
      const out: Record<string, string> = {};
      let at = lookup(path);
      // A token whose whole value is a reference takes its members from the token it names; the core refuses a loop.
      for (;;) {
        const made = sum.ds.referencesOf(at, sum.defaultMode).filter((reference) => !reference.interpolated);
        const whole = made.find((reference) => reference.at === '');
        if (!whole) {
          for (const reference of made) out[reference.at] = reference.to.slice(sum.dsCollectionName.length + 1);
          return out;
        }
        at = whole.to;
      }
    },
    valueOf: (path) => {
      const token = readToken(sum.ds, lookup(path), sum.defaultMode);
      if (!token) return undefined;
      const type = token.$type ?? '';
      // A value the core refuses to compute is one Figma cannot take either.
      if (token.refused !== undefined) return { type };
      try {
        // A stroke style's dashes, for dashPattern; a keyword such as `dashed` names no lengths, and throws.
        if (type === 'strokeStyle')
          return { type, value: (token.$value as { dashArray: DimensionValue[] }).dashArray.map((dash) => normalizeDimensionToPx(dash)) };
        return { type, value: toFigmaValue(token.$value, type) };
      } catch {
        return { type };
      }
    },
  };
}

/** The sum of the loaded document, when there is one and it can be built: what each variable is for. */
function sumOfLoadedDocument(): Sum | undefined {
  const { resolver, conversionMap } = getState();
  if (!resolver) return undefined;
  try {
    return buildSum(resolver, resolver.name || 'resolved', conversionMap);
  } catch {
    return undefined;
  }
}

type Definitions = ComponentPropertyDefinitions;

/** The display name of a property: Figma suffixes the key of every property but a variant (`Name#12:0`), and the file never writes the suffix. */
const displayName = (key: string): string => key.split('#')[0];

const describeValue = (value: SetField[string]['value']): string =>
  typeof value !== 'object' ? JSON.stringify(value) : 'token' in value ? `"{${value.token}}"` : `(key)${JSON.stringify(value.key)}`;

/**
 * Holds every `INSTANCE` of a member or an artboard against its component: what `set` writes must be a property the component has,
 * of a kind that takes the value, and what `slot` fills must be a slot it has. Every problem is collected, with the line.
 *
 * The properties live on the set when the component is a variant of one (a variant member cannot be asked), and the
 * names are the display names, so a name that two properties share is ambiguous and refused.
 */
async function checkInstances(
  layer: Layer,
  components: Map<string, ComponentNode>,
  lookupComponent: (ref: ComponentRef, entry: Wanted) => Promise<void>,
  lookTyped: (path: string, where: Wanted, type: VariableResolvedDataType) => Promise<void>,
  problems: string[],
): Promise<void> {
  const value = layer.fields.component as Value | undefined;
  const ref: ComponentRef | undefined =
    value?.kind === 'key'
      ? { key: value.key }
      : value?.kind === 'plain' && typeof value.value === 'string'
        ? { name: value.value }
        : undefined;
  const node = ref ? components.get(componentKey(ref)) : undefined;
  if (layer.kind === 'INSTANCE' && node) {
    const host = node.parent?.type === 'COMPONENT_SET' ? node.parent : node;
    const definitions: Definitions = host.componentPropertyDefinitions;
    const of = `INSTANCE "${layer.address}"`;
    const component = `component "${host.name}"`;
    const properties = Object.entries(definitions);
    const names = properties.map(([key]) => `"${displayName(key)}"`);

    for (const [name, entry] of Object.entries((layer.fields.set as SetField | undefined) ?? {})) {
      const where = at({ loc: entry.loc ?? layer.fieldLoc?.set });
      const matches = properties.filter(([key]) => displayName(key) === name);
      if (matches.length === 0) {
        problems.push(
          `${of}${where}: ${component} has no property "${name}"${names.length > 0 ? ` (it has ${names.join(', ')})` : ' (it has none)'}`,
        );
        continue;
      }
      if (matches.length > 1) {
        problems.push(
          `${of}${where}: ${component} has ${matches.length} properties named "${name}" (${matches.map(([, definition]) => definition.type).join(', ')}), so the name does not say which to set; rename one of them`,
        );
        continue;
      }
      const [, definition] = matches[0];
      const given = entry.value;
      const wrong = (takes: string): void =>
        void problems.push(
          `${of}${where}: ${component} property "${name}" is a ${definition.type} and takes ${takes}, not ${describeValue(given)}`,
        );
      // A token binds its variable to a BOOLEAN or a TEXT property: a `boolean` token's, or a `string` token's.
      const token = typeof given === 'object' && 'token' in given ? given.token : undefined;
      if (token !== undefined && (definition.type === 'BOOLEAN' || definition.type === 'TEXT')) {
        await lookTyped(token, { loc: entry.loc }, definition.type === 'BOOLEAN' ? 'BOOLEAN' : 'STRING');
      } else if (token !== undefined) {
        wrong(definition.type === 'VARIANT' ? 'one of its values as text' : 'a component name or (key)"…"');
      } else if (definition.type === 'VARIANT') {
        const options = definition.variantOptions ?? [];
        if (typeof given !== 'string') wrong('one of its values as text');
        else if (!options.includes(given))
          problems.push(
            `${of}${where}: "${given}" is not a value of ${component} property "${name}" (${options.map((option) => `"${option}"`).join(', ')})`,
          );
      } else if (definition.type === 'BOOLEAN') {
        if (typeof given !== 'boolean') wrong('#true or #false');
      } else if (definition.type === 'TEXT') {
        if (typeof given !== 'string') wrong('text');
      } else if (definition.type === 'INSTANCE_SWAP') {
        if (typeof given === 'boolean') wrong('a component name or (key)"…"');
        else
          await lookupComponent(typeof given === 'object' ? { key: (given as { key: string }).key } : { name: given }, { loc: entry.loc });
      } else {
        problems.push(
          `${of}${where}: ${component} property "${name}" is a ${definition.type}, which is filled with \`slot ${name} { … }\` and not set`,
        );
      }
    }

    const slots = new Map<string, Loc | undefined>();
    for (const slot of layer.slots ?? []) slots.set(slot.name, slot.loc);
    for (const child of layer.children) if (child.slot !== undefined && !slots.has(child.slot)) slots.set(child.slot, child.loc);
    for (const [name, loc] of slots) {
      const matches = properties.filter(([key]) => displayName(key) === name);
      const slotted = matches.filter(([, definition]) => definition.type === 'SLOT');
      const have = properties.filter(([, definition]) => definition.type === 'SLOT').map(([key]) => `"${displayName(key)}"`);
      if (slotted.length === 0) {
        problems.push(
          `${of}${at({ loc })}: ${component} has no slot "${name}"${matches.length > 0 ? ` ("${name}" is a ${matches[0][1].type} property)` : ''}${have.length > 0 ? ` (its slots are ${have.join(', ')})` : ' (it has no slots)'}`,
        );
      } else if (matches.length > 1) {
        problems.push(
          `${of}${at({ loc })}: ${component} has ${matches.length} properties named "${name}", so the name does not say which slot to fill; rename one of them`,
        );
      }
    }
  }
  for (const child of layer.children) await checkInstances(child, components, lookupComponent, lookTyped, problems);
}
