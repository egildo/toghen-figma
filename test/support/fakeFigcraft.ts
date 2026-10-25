/**
 * FigCraft's control socket, as the FigCraft target meets it: newline-delimited JSON on a loopback port, the commands
 * the target sends, and nothing more. Each open tab is a file of variable collections, variables and styles, and the
 * commands act on the active tab, as FigCraft's do. Pages hold layer data and layers. A `command.batch` resolves
 * `{"$step": n}` and is undone whole when a step fails. Layers are kept in `node.get`'s shapes, with what was measured
 * against FigCraft 0.9.0 (plan, *Components in FigCraft*): a node id is never given again, an instance is made with a
 * copy of its main's layer data, an edit of a bound field lets its variable go, and a property's wiring and a frame's
 * modes are kept but not reported. The shapes are the ones FigCraft 0.7.0 answered with, measured (decisions.md, *A FigCraft target*), and
 * `style.list` the one 0.9.0 answers with (`listedStyle`).
 */

import { createServer, type Server, type Socket } from 'node:net';
import { libraryCommand, type LibraryFile } from './fakeLibraries.js';

interface File {
  name: string;
  path: string | null;
  collections: Array<{ id: string; name: string; modes: Array<{ id: string; name: string }> }>;
  variables: Array<Record<string, any>>;
  styles: Array<Record<string, any>>;
  pages: Array<{ id: number; name: string; current: boolean; divider?: true; pluginData?: Record<string, string>; children?: Layer[] }>;
  /** The next layer id: never given again, as FigCraft's are not (measured). */
  nextNode?: number;
  published?: LibraryFile['published'];
  libraries?: LibraryFile['libraries'];
  /** Copies of library components: on no page, found by id (`fakeLibraries.ts`). */
  copies?: Layer[];
}

/** A layer as `node.get` answers it, plus what FigCraft keeps but does not report (`hidden`). */
export type Layer = Record<string, any> & {
  id: number;
  type: string;
  name: string;
  children?: Layer[];
  hidden?: { refs?: Record<string, string>; modes?: Record<string, string>; fields?: Record<string, unknown> };
};

/** What FigCraft takes and does not report (measured 23 October 2026): kept on the layer, never in `node.get`. */
const UNREPORTED = ['cornerSmoothing', 'maxLines', 'paragraphSpacing', 'paragraphIndent', 'strokeCap'];
const LAYOUT_KEYS = ['contentAlign', 'gridColumns', 'gridRows'];
const CELL_KEYS: Record<string, string> = {
  gridRow: 'row',
  gridColumn: 'column',
  gridRowSpan: 'rowSpan',
  gridColumnSpan: 'columnSpan',
  gridAlignH: 'alignH',
  gridAlignV: 'alignV',
};

export interface FakeFigcraft {
  port: number;
  tabs: File[];
  active: number;
  /** Each batch's label, in order: one undo step each. */
  labels: string[];
  /** A command the fake refuses, for a test of a run that fails partway. */
  refuse?: string;
  /** Called after every request, for a test that moves tabs between them. */
  afterRequest?: () => void;
  /** The files saved, by path, as `file.save` wrote them and `file.open` reads them. */
  disk: Map<string, unknown>;
  close(): Promise<void>;
}

const file = (name: string, path: string | null = null): File => ({
  name,
  path,
  collections: [],
  variables: [],
  styles: [],
  pages: [{ id: 1, name: 'Page 1', current: true }],
});

/** The id FigCraft gives a new object: the highest in use plus one, so the newest one's id is given again once it is deleted (measured). */
function nextId(taken: ReadonlyArray<Record<string, any>>, prefix: string): string {
  return `${prefix}${Math.max(0, ...taken.map((object) => Number(String(object.id).slice(prefix.length)))) + 1}`;
}

const KINDS: Record<string, string> = { color: 'color', number: 'number', string: 'string', boolean: 'boolean' };
const DEFAULTS: Record<string, unknown> = { color: { r: 0, g: 0, b: 0, a: 1 }, number: 0, string: '', boolean: true };

function held(value: unknown, type: string): { type: string; value: unknown } {
  if (value && typeof value === 'object' && 'alias' in value) return { type: 'alias', value: (value as { alias: string }).alias };
  return { type, value };
}

function resolveSteps(value: unknown, results: unknown[]): unknown {
  if (Array.isArray(value)) return value.map((item) => resolveSteps(item, results));
  if (value && typeof value === 'object') {
    if ('$step' in value) return (results[(value as { $step: number }).$step] as { id: unknown }).id;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveSteps(item, results)]));
  }
  return value;
}

/** A length as `style.list` gives one, from one `style.create` took: a number in pixels, `"N%"` or `"auto"`. */
function listedLength(value: unknown, otherwise: Record<string, unknown>): Record<string, unknown> {
  if (value === undefined) return otherwise;
  if (value === 'auto') return { unit: 'auto' };
  if (typeof value === 'string' && value.endsWith('%')) return { unit: 'percent', value: Number(value.slice(0, -1)) };
  return { unit: 'pixels', value };
}

/** Where a bound field's value shows in `style.list`: a text style's key, or a path into its effects. */
const TEXT_KEYS: Record<string, string> = {
  fontFamily: 'font_family',
  fontStyle: 'font_style',
  fontSize: 'font_size',
  lineHeight: 'line_height',
  letterSpacing: 'letter_spacing',
};

/**
 * A style as FigCraft 0.9.0's `style.list` gives it (measured 22 October 2026): a text style's value under `style`,
 * in snake case with lengths as `{unit, value}`; effects with `show_behind`; gradient stops in float32. A bound field
 * lists its variable's value in the default mode, where FigCraft resolves it.
 */
export function listedStyle(stored: Record<string, any>, valueOf: (variable: string) => unknown): Record<string, unknown> {
  const { value, ...rest } = stored;
  const bound: Record<string, string> = stored.bound ?? {};
  if (stored.type === 'text') {
    const text: Record<string, unknown> = {
      case: value.case ?? 'original',
      decoration: value.decoration ?? 'none',
      fills: null,
      font_family: value.fontFamily,
      font_size: value.fontSize,
      font_style: value.fontStyle,
      letter_spacing: listedLength(value.letterSpacing, { unit: 'percent', value: 0 }),
      line_height: listedLength(value.lineHeight, { unit: 'auto' }),
      link: null,
    };
    for (const [field, variable] of Object.entries(bound)) {
      const key = TEXT_KEYS[field];
      if (key === 'line_height' || key === 'letter_spacing') text[key] = { unit: 'pixels', value: valueOf(variable) };
      else if (key) text[key] = valueOf(variable);
    }
    return { ...rest, style: text };
  }
  if (stored.type === 'effect') {
    const effects: Record<string, any>[] = (value as Record<string, any>[]).map((effect) => ({
      ...effect,
      show_behind: false,
      offset: [...effect.offset],
    }));
    for (const [field, variable] of Object.entries(bound)) {
      const [, index, part] = field.split('/');
      const effect = effects[Number(index)];
      if (part === 'offsetX') effect.offset[0] = valueOf(variable);
      else if (part === 'offsetY') effect.offset[1] = valueOf(variable);
      else effect[part] = valueOf(variable);
    }
    return { ...rest, effects };
  }
  const fround = (color: Record<string, number>) =>
    Object.fromEntries(Object.entries(color).map(([channel, n]) => [channel, Math.fround(n)]));
  return {
    ...rest,
    paints: (value as Record<string, any>[]).map((paint) => ({
      ...paint,
      stops: paint.stops.map((stop: Record<string, any>) => ({ ...stop, color: fround(stop.color) })),
      // The third handle FigCraft keeps: the ramp's start, plus the ramp turned a quarter.
      width: [paint.from[0] - (paint.to[1] - paint.from[1]), paint.from[1] + (paint.to[0] - paint.from[0])],
    })),
  };
}

/** Every layer of a file, depth first, with the list it is in. */
function* walk(list: Layer[]): Generator<{ node: Layer; list: Layer[] }> {
  for (const node of list) {
    yield { node, list };
    if (node.children) yield* walk(node.children);
  }
}

const allLayers = (f: File): Array<{ node: Layer; list: Layer[] }> => [
  ...f.pages.flatMap((page) => [...walk(page.children ?? [])]),
  ...walk(f.copies ?? []),
];

/** What FigCraft lists of a variable or a style: the fake's own bookkeeping (`hidden`) left out. */
const unhidden = <T extends Record<string, any>>(object: T): T => {
  const { hidden: _hidden, ...rest } = object;
  return rest as T;
};

function layer(f: File, id: number): Layer {
  const found = allLayers(f).find(({ node }) => node.id === id)?.node;
  if (!found) throw new Error(`no layer ${id}`);
  return found;
}

function parentOf(f: File, id: number): Layer[] {
  const found = allLayers(f).find(({ node }) => node.id === id);
  if (!found) throw new Error(`no layer ${id}`);
  return found.list;
}

const detach = (f: File, id: number): void => {
  const list = parentOf(f, id);
  list.splice(
    list.findIndex((node) => node.id === id),
    1,
  );
};

const newId = (f: File): number => {
  f.nextNode ??= Math.max(1, ...f.pages.map((page) => page.id), ...allLayers(f).map(({ node }) => node.id)) + 1;
  return f.nextNode++;
};

/** Puts a new layer in its parent, or on the page shown. */
function place(f: File, node: Layer, parent: number | undefined): void {
  if (parent === undefined) {
    const page = f.pages.find((candidate) => candidate.current) ?? f.pages[0];
    (page.children ??= []).push(node);
  } else (layer(f, parent).children ??= []).push(node);
}

const membersOf = (f: File, id: number): Layer[] => {
  const node = layer(f, id);
  return node.type === 'COMPONENT_SET' ? (node.children ?? []).filter((child) => child.type === 'COMPONENT') : [node];
};

/** An instance: a copy of its main with ids of its own, carrying the main's layer data, as FigCraft's does (measured). */
function instanceOf(f: File, main: Layer): Layer {
  const copy = (node: Layer): Layer => {
    const { id: _id, children, hidden: _hidden, componentPropertyDefinitions: _definitions, ...rest } = node;
    return { ...JSON.parse(JSON.stringify(rest)), id: newId(f), ...(children ? { children: children.map(copy) } : {}) };
  };
  const node = copy(main);
  node.type = 'INSTANCE';
  node.mainComponent = main.id;
  node.componentProperties = Object.fromEntries(
    Object.entries(main.componentPropertyDefinitions ?? {}).map(([name, definition]: [string, any]) => [name, definition.default]),
  );
  return node;
}

/** A layer's ancestors, nearest first. */
function ancestorsOf(f: File, id: number): Layer[] {
  const find = (list: Layer[], above: Layer[]): Layer[] | undefined => {
    for (const node of list) {
      if (node.id === id) return above;
      const found = node.children && find(node.children, [node, ...above]);
      if (found) return found;
    }
    return undefined;
  };
  for (const list of [...f.pages.map((page) => page.children ?? []), f.copies ?? []]) {
    const found = find(list, []);
    if (found) return found;
  }
  return [];
}

/** A colour variable's value where a layer is: in the mode the layer or its nearest ancestor pins, else the collection's first; an alias followed. */
function colourAt(f: File, id: string, at: Layer[]): { r: number; g: number; b: number; a?: number } | undefined {
  const v = f.variables.find((candidate) => candidate.id === id);
  if (!v) return undefined;
  const collection = f.collections.find((c) => c.id === v.collection)!;
  const mode = at.map((node) => node.hidden?.modes?.[collection.id]).find((pinned) => pinned !== undefined) ?? collection.modes[0].id;
  const held = v.values[mode] ?? v.values[collection.modes[0].id];
  return held.type === 'alias' ? colourAt(f, held.value, at) : held.value;
}

const hexOf = ({ r, g, b, a = 1 }: { r: number; g: number; b: number; a?: number }): string =>
  `#${[r, g, b, ...(a < 1 ? [a] : [])]
    .map((channel) =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`;

/**
 * A layer as `node.get` lists it among its parent's children: its fields, and how many children it has, not what they
 * are. `node.get` gives a layer's children one level down, whatever depth it is asked for (measured 23 October 2026).
 * What FigCraft does not report is left out. `above` is the layer's ancestors, nearest first.
 *
 * What a binding settles, measured against FigCraft 0.10.0 headless (24 October 2026): a solid paint bound to a colour
 * variable shows the variable's value in the layer's mode, its alpha in the colour, at paint opacity 1; a bound
 * `height` makes the layer's vertical sizing fixed, and a text's resizing `none`; a bound `width` makes the horizontal
 * sizing fixed, and a text that resized both ways resize its height only. Whatever was written before or after.
 */
function shown(f: File, node: Layer, above: Layer[]): Record<string, unknown> {
  const { hidden: _hidden, children, ...rest } = node;
  const out: Record<string, any> = {
    ...JSON.parse(JSON.stringify(rest)),
    ...(children && children.length > 0 ? { childCount: children.length } : {}),
  };
  const bound: Record<string, string> = out.boundVariables ?? {};
  for (const list of ['fills', 'strokes']) {
    (out[list] as Record<string, any>[] | undefined)?.forEach((paint, at) => {
      const variable = bound[`${list}/${at}/color`];
      const colour = variable === undefined || paint.type !== 'solid' ? undefined : colourAt(f, variable, [node, ...above]);
      if (!colour) return;
      paint.color = hexOf(colour);
      delete paint.opacity;
    });
  }
  const text = node.type === 'TEXT';
  if (bound.height !== undefined) {
    out.sizing = { horizontal: 'fixed', ...out.sizing, vertical: 'fixed', ...(text ? { horizontal: 'fixed' } : {}) };
    if (text) out.textAutoResize = 'none';
  }
  if (bound.width !== undefined) {
    out.sizing = { vertical: 'fixed', ...out.sizing, horizontal: 'fixed' };
    if (text && out.textAutoResize === 'widthAndHeight') out.textAutoResize = 'height';
  }
  return out;
}

/** `node.set`'s names into `node.get`'s shapes. An edit of a bound field lets its variable go (FigCraft's docs). */
function setProps(node: Layer, props: Record<string, any>): void {
  const unbind = (field: string): void => {
    if (node.boundVariables) delete node.boundVariables[field];
  };
  const layout = (): Record<string, any> =>
    (node.layout ??= { mode: undefined, gap: 0, crossGap: 0, padding: [0, 0, 0, 0], mainAlign: 'min', crossAlign: 'min', wrap: false });
  const sides = ['Top', 'Right', 'Bottom', 'Left'];
  for (const [key, value] of Object.entries(props)) {
    if (key === 'pluginData') node.pluginData = { ...node.pluginData, ...(value as object) };
    else if (key === 'layout') {
      if (value === null) delete node.layout;
      else layout().mode = value;
    } else if (key === 'gap' || key === 'crossGap' || key === 'mainAlign' || key === 'crossAlign' || key === 'wrap') {
      layout()[key] = value;
      unbind(key);
    } else if (key.startsWith('padding')) {
      const at = sides.indexOf(key.slice('padding'.length));
      layout().padding[at] = value;
      unbind(key);
    } else if (key === 'sizingH' || key === 'sizingV')
      node.sizing = { horizontal: 'fixed', vertical: 'fixed', ...node.sizing, [key === 'sizingH' ? 'horizontal' : 'vertical']: value };
    else if (key === 'fills' || key === 'strokes') {
      const colour = (text: unknown): boolean => typeof text === 'string' && /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(text);
      const gradient = (paint: unknown): boolean =>
        (paint as { type?: unknown })?.type === 'gradient' && Array.isArray((paint as { stops?: unknown }).stops);
      if (
        !Array.isArray(value) ||
        !value.every((paint) => colour(paint) || colour((paint as { color?: unknown })?.color) || gradient(paint))
      )
        throw new Error(`invalid parameters for \`node.set\`: \`${key}\` must be paints or colours`);
      node[key] = (value as unknown[]).map((paint) => (typeof paint === 'string' ? { type: 'solid', color: paint } : paint));
      for (const field of Object.keys(node.boundVariables ?? {}))
        if (field.startsWith(`${key}/`) || field === key.slice(0, -1)) unbind(field);
    } else if (key.startsWith('stroke') && key.endsWith('Weight') && key !== 'strokeWeight') {
      node.strokeSides = node.strokeSides ?? [0, 1, 2, 3].map(() => node.strokeWeight ?? 0);
      node.strokeSides[sides.indexOf(key.slice('stroke'.length, -'Weight'.length))] = value;
      // The four sides are one field: a side written lets every side's variable go, and `strokeWeight`'s (measured 23 October 2026).
      for (const side of sides) unbind(`stroke${side}Weight`);
      unbind('strokeWeight');
    } else if (key === 'cornerRadius') {
      // So are the four corners: a value written to them lets `cornerRadius` and every corner go (measured 23 October 2026).
      node.cornerRadius = value;
      for (const field of ['cornerRadius', 'topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius']) unbind(field);
    } else if (key === 'absolute') node.absolute = value || undefined;
    else if (LAYOUT_KEYS.includes(key)) layout()[key] = value;
    else if (key === 'columnTracks' || key === 'rowTracks')
      layout()[key] = (value as { sizing: string; value?: number }[]).map((track) => ({ sizing: track.sizing, value: track.value ?? 0 }));
    else if (key in CELL_KEYS)
      node.gridCell = {
        column: 0,
        row: 0,
        columnSpan: 1,
        rowSpan: 1,
        alignH: null,
        alignV: null,
        ...node.gridCell,
        [CELL_KEYS[key]]: value,
      };
    else if (UNREPORTED.includes(key)) node.hidden = { ...node.hidden, fields: { ...node.hidden?.fields, [key]: value } };
    else if (key === 'blend') {
      // Normal and pass-through both read back with no `blend` key (measured 23 October 2026).
      if (value === 'normal' || value === 'pass through') delete node.blend;
      else node.blend = value;
    } else {
      node[key] = value;
      unbind(key);
    }
  }
}

export async function startFakeFigcraft(
  names: string[] = ['Untitled'],
  fonts: Record<string, string[]> = { Inter: ['Regular', 'Bold'] },
): Promise<FakeFigcraft> {
  const fake: FakeFigcraft = {
    port: 0,
    tabs: names.map((name) => file(name)),
    active: 0,
    labels: [],
    disk: new Map(),
    close: async () => {},
  };
  const tab = (): File => fake.tabs[fake.active];
  const variable = (id: string) => {
    const found = tab().variables.find((candidate) => candidate.id === id || candidate.name === id);
    if (!found) throw new Error(`no such variable ${id}`);
    return found;
  };
  const style = (id: string) => {
    const found = tab().styles.find((candidate) => candidate.id === id || candidate.name === id);
    if (!found) throw new Error(`no such style ${id}`);
    return found;
  };

  const libraryHelpers = {
    disk: fake.disk,
    newId: (into: unknown) => newId(into as File),
    applyStyle: (into: unknown, id: number, applied: Record<string, any>) => {
      const node = layer(into as File, id);
      const kind = applied.type === 'text' ? 'text' : 'effect';
      node.styles = { effect: null, fill: null, grid: null, stroke: null, text: null, ...node.styles, [kind]: applied.id };
    },
  };

  const run = (command: string, params: Record<string, any>): unknown => {
    const f = tab();
    if (command === fake.refuse) throw new Error(`refused ${command}`);
    switch (command) {
      case 'doc.list':
        return fake.tabs.map((t, index) => ({ index, name: t.name, path: t.path, active: index === fake.active, dirty: false }));
      case 'doc.switch':
        if (!fake.tabs[params.index]) throw new Error(`no tab ${params.index}`);
        fake.active = params.index;
        return { ok: true };
      // Files on disk are `disk`'s: a tab is opened from what was saved there, and a save writes it there whole.
      case 'file.new':
        fake.tabs.push(file(params.name ?? 'Untitled'));
        fake.active = fake.tabs.length - 1;
        return { index: fake.active };
      case 'file.open': {
        const open = fake.tabs.findIndex((t) => t.path === params.path);
        if (open < 0) {
          const saved = fake.disk.get(params.path);
          if (!saved) throw new Error(`${params.path}: No such file or directory (os error 2)`);
          fake.tabs.push(JSON.parse(JSON.stringify(saved)));
        }
        fake.active = open < 0 ? fake.tabs.length - 1 : open;
        return { index: fake.active };
      }
      case 'file.save': {
        const path: string | undefined = params.path ?? f.path ?? undefined;
        if (!path) throw new Error('programmatic saves need a path the first time');
        f.path = path;
        f.name = path.replace(/^.*\//, '').replace(/\.figcraft$/i, '');
        fake.disk.set(path, JSON.parse(JSON.stringify(f)));
        return { path, bytes: 1 };
      }
      case 'file.close':
        if (!fake.tabs[params.index ?? fake.active]) throw new Error(`no tab ${params.index}`);
        fake.tabs.splice(params.index ?? fake.active, 1);
        fake.active = Math.min(fake.active, fake.tabs.length - 1);
        return { ok: true };
      case 'command.batch': {
        const saved = JSON.stringify(fake.tabs);
        const savedActive = fake.active;
        const results: unknown[] = [];
        try {
          // A nested batch keeps its own references to its own steps.
          for (const step of params.commands)
            results.push(
              run(
                step.command,
                step.command === 'command.batch' ? step.params : (resolveSteps(step.params ?? {}, results) as Record<string, any>),
              ),
            );
        } catch (error) {
          fake.tabs.splice(0, fake.tabs.length, ...JSON.parse(saved));
          fake.active = savedActive;
          throw error;
        }
        return results;
      }
      case 'text.fonts':
        return params.family ? (fonts[params.family] ?? []) : Object.keys(fonts);
      case 'variable.list':
        return { collections: f.collections.map(unhidden), variables: f.variables.map(unhidden) };
      case 'style.list': {
        const valueOf = (id: string): unknown => {
          let held = variable(id);
          for (let hops = 0; hops < 16; hops += 1) {
            const value = Object.values(held.values)[0] as { type: string; value: unknown };
            if (value.type !== 'alias') return value.value;
            held = variable(String(value.value));
          }
          throw new Error(`alias loop at ${id}`);
        };
        return f.styles.map((stored) => listedStyle(unhidden(stored), valueOf));
      }
      case 'variable.createCollection': {
        const id = nextId(f.collections, 'VariableCollectionId:');
        f.collections.push({
          id,
          name: params.name,
          modes: (params.modes ?? ['Mode 1']).map((name: string, i: number) => ({ id: `${id}/mode${i + 1}`, name })),
        });
        return { id };
      }
      case 'variable.addMode': {
        const collection = f.collections.find((c) => c.id === params.collection);
        if (!collection) throw new Error(`no such collection ${params.collection}`);
        const id = `${collection.id}/mode${collection.modes.length + 1}`;
        collection.modes.push({ id, name: params.name });
        for (const v of f.variables.filter((v) => v.collection === collection.id)) v.values[id] = v.values[collection.modes[0].id];
        return { id };
      }
      case 'variable.removeMode': {
        const collection = f.collections.find((c) => c.id === params.collection)!;
        collection.modes = collection.modes.filter((mode) => mode.id !== params.mode);
        return { ok: true };
      }
      case 'variable.create': {
        if (!KINDS[params.type]) throw new Error(`invalid parameters for \`variable.create\`: type: color|number|string|boolean`);
        const collection = f.collections.find((c) => c.id === params.collection);
        if (!collection) throw new Error(`no such collection ${params.collection}`);
        const id = nextId(f.variables, 'VariableID:');
        f.variables.push({
          id,
          name: params.name,
          collection: collection.id,
          resolvedType: params.type,
          description: '',
          values: Object.fromEntries(collection.modes.map((mode) => [mode.id, { type: params.type, value: DEFAULTS[params.type] }])),
        });
        return { id };
      }
      case 'variable.set': {
        const v = variable(params.variable);
        const collection = f.collections.find((c) => c.id === v.collection)!;
        const mode = collection.modes.find((m) => m.id === params.mode || m.name === params.mode) ?? collection.modes[0];
        if (params.value?.alias === v.id) throw new Error('invalid parameters for `variable.set`: the alias would refer back to itself');
        v.values[mode.id] = held(params.value, v.resolvedType);
        return { ok: true };
      }
      case 'variable.update': {
        const v = variable(params.variable);
        if (params.name !== undefined) v.name = params.name;
        if (params.scopes !== undefined) v.scopes = params.scopes;
        if (params.codeSyntax !== undefined) v.codeSyntax = { ...v.codeSyntax, ...params.codeSyntax };
        return { ok: true };
      }
      case 'variable.delete':
        f.variables = f.variables.filter((v) => v.id !== variable(params.variable).id);
        return { ok: true };
      case 'style.create': {
        const id = nextId(f.styles, 'S:');
        f.styles.push({ id, name: params.name, type: params.type, value: params.value });
        return { id };
      }
      case 'style.update':
        style(params.style).value = params.value;
        return { ok: true };
      case 'style.bind': {
        const s = style(params.style);
        if (params.variable === undefined) {
          if (s.bound) delete s.bound[params.field];
        } else s.bound = { ...s.bound, [params.field]: variable(params.variable).id };
        return { ok: true };
      }
      case 'page.list':
        return f.pages.map(({ id, name, current, divider }) => ({ id, name, current, divider: divider ?? false, children: 0 }));
      case 'page.add': {
        // FigCraft shows the page it adds, except a divider (a name starting with `-`), which is never opened. Pages and
        // layers take their ids from one count (measured: the first frame of a new file is 2, its page 1).
        const id = newId(f);
        if (String(params.name ?? '').startsWith('-')) {
          f.pages.push({ id, name: params.name, current: false, divider: true });
          return { divider: true, id };
        }
        for (const page of f.pages) page.current = false;
        f.pages.push({ id, name: params.name ?? `Page ${id}`, current: true });
        return { id };
      }
      case 'page.select': {
        const page = f.pages.find((candidate) => candidate.id === params.id);
        if (!page) throw new Error(`no page ${params.id}`);
        for (const other of f.pages) other.current = other === page;
        return { ok: true };
      }
      case 'node.get': {
        const page = f.pages.find((candidate) => candidate.id === params.id);
        if (page)
          return {
            id: page.id,
            name: page.name,
            type: 'PAGE',
            ...(page.pluginData ? { pluginData: page.pluginData } : {}),
            children: (page.children ?? []).map((child) => shown(f, child, [])),
          };
        const node = layer(f, params.id);
        const above = ancestorsOf(f, node.id);
        return { ...shown(f, node, above), children: (node.children ?? []).map((child) => shown(f, child, [node, ...above])) };
      }
      case 'node.set': {
        for (const id of params.ids) {
          const page = f.pages.find((candidate) => candidate.id === id);
          // An empty value keeps its key, as FigCraft does (measured).
          if (page && params.props.pluginData) page.pluginData = { ...page.pluginData, ...params.props.pluginData };
          else if (!page) setProps(layer(f, id), params.props);
        }
        return { ok: true };
      }
      case 'frame.create': {
        const node: Layer = {
          id: newId(f),
          type: 'FRAME',
          name: params.name ?? 'Frame',
          x: params.x ?? 0,
          y: params.y ?? 0,
          width: params.width ?? 100,
          height: params.height ?? 100,
          clip: true,
          fills: [{ type: 'solid', color: '#FFFFFF' }],
          children: [],
        };
        place(f, node, params.parent);
        if (params.props) setProps(node, params.props);
        return { id: node.id };
      }
      case 'node.create': {
        if (params.type !== 'line') throw new Error(`the fake makes lines only, not ${params.type}`);
        const node: Layer = {
          id: newId(f),
          type: 'LINE',
          name: params.name ?? 'Line',
          x: params.x ?? 0,
          y: params.y ?? 0,
          width: params.width ?? 100,
          height: 0,
          strokeAlign: 'center',
          strokeWeight: 1,
          strokes: [{ type: 'solid', color: '#000000' }],
        };
        place(f, node, params.parent);
        if (params.props) setProps(node, params.props);
        return { id: node.id };
      }
      case 'text.create': {
        const node: Layer = {
          id: newId(f),
          type: 'TEXT',
          name: params.text || 'Text',
          x: params.x ?? 0,
          y: params.y ?? 0,
          width: 10,
          height: 15,
          characters: params.text ?? '',
          fontFamily: 'Inter',
          fontStyle: 'Regular',
          fontSize: 12,
          lineHeight: 'Auto',
          letterSpacing: '0%',
          textAlign: 'left',
          textAutoResize: 'widthAndHeight',
          fills: [{ type: 'solid', color: '#000000' }],
        };
        place(f, node, params.parent);
        return { id: node.id };
      }
      case 'instance.create': {
        let main = layer(f, params.component);
        if (main.type === 'COMPONENT_SET') main = [...(main.children ?? [])].sort((a, b) => a.y - b.y || a.x - b.x)[0];
        const node = instanceOf(f, main);
        place(f, node, params.parent);
        return { id: node.id };
      }
      case 'component.create': {
        for (const id of params.ids) layer(f, id).type = 'COMPONENT';
        return { id: params.ids[0] };
      }
      case 'component.combineVariants': {
        const members = params.ids.map((id: number) => layer(f, id));
        if (members.some((member: Layer) => member.type !== 'COMPONENT')) throw new Error('select components only');
        const set: Layer = { id: newId(f), type: 'COMPONENT_SET', name: 'Component 1', x: 0, y: 0, width: 100, height: 100, children: [] };
        place(f, set, undefined);
        for (const member of members) {
          detach(f, member.id);
          set.children!.push(member);
          // A name without `=` becomes "Property 1=Default" (measured).
          if (!member.name.includes('=')) member.name = 'Property 1=Default';
        }
        return { id: set.id };
      }
      case 'component.addProperty': {
        // An instance swap and a slot list their preferred values, `[]` for none (measured: `preferred: []`).
        const offers = params.type === 'instanceSwap' || params.type === 'slot' ? { preferred: params.preferred ?? [] } : {};
        for (const member of membersOf(f, params.id))
          member.componentPropertyDefinitions = {
            ...member.componentPropertyDefinitions,
            [params.name]: { type: params.type, default: params.default, ...offers },
          };
        return { id: params.id, name: params.name };
      }
      case 'component.editProperty': {
        for (const member of membersOf(f, params.id)) {
          const definitions = member.componentPropertyDefinitions ?? {};
          if (params.newName !== undefined && params.name in definitions) {
            definitions[params.newName] = definitions[params.name];
            delete definitions[params.name];
          } else if (params.newName !== undefined) {
            member.name = member.name
              .split(', ')
              .map((pair: string) =>
                pair.startsWith(`${params.name}=`) ? `${params.newName}=${pair.slice(params.name.length + 1)}` : pair,
              )
              .join(', ');
          }
          const name = params.newName ?? params.name;
          if (params.default !== undefined && definitions[name]) definitions[name].default = params.default;
          if (params.preferred !== undefined && definitions[name]) definitions[name].preferred = params.preferred;
          member.componentPropertyDefinitions = definitions;
        }
        return { ok: true };
      }
      case 'component.deleteProperty': {
        for (const member of membersOf(f, params.id))
          if (member.componentPropertyDefinitions) delete member.componentPropertyDefinitions[params.name];
        return { ok: true };
      }
      case 'component.makeSlot': {
        // Only a frame inside a main component becomes a slot (measured 23 October 2026); its property is the main's.
        const main = allLayers(f).find(
          ({ node }) => node.type === 'COMPONENT' && [...walk(node.children ?? [])].some(({ node: inner }) => inner.id === params.id),
        )?.node;
        if (!main)
          throw new Error(
            'invalid parameters for `component.makeSlot`: only a frame inside a main component (not inside an instance) can become a slot',
          );
        const frame = layer(f, params.id);
        frame.slot = params.name ?? frame.name;
        main.componentPropertyDefinitions = {
          ...main.componentPropertyDefinitions,
          [frame.slot]: { type: 'slot', preferred: params.preferred ?? [] },
        };
        return { id: frame.id, name: frame.slot };
      }
      case 'instance.slotInsert': {
        const at = layer(f, params.id);
        const slot = at.slot !== undefined ? at : [...walk(at.children ?? [])].find(({ node }) => node.slot === params.slot)?.node;
        if (!slot) throw new Error(`no slot ${params.slot}`);
        const node = instanceOf(f, layer(f, params.component));
        (slot.children ??= []).splice(params.index ?? slot.children.length, 0, node);
        slot.overrides = ['slot'];
        return { id: node.id, slot: slot.id };
      }
      case 'component.exposeInstance': {
        // Kept, and not reported by `node.get` (measured).
        const node = layer(f, params.id);
        node.hidden = { ...node.hidden, fields: { ...node.hidden?.fields, isExposedInstance: params.exposed ?? true } };
        return { id: node.id, exposed: params.exposed ?? true };
      }
      case 'component.bindProperty': {
        // Kept, and never reported: no read answers it (measured). A layer of a member that does not hold the property is
        // refused: a member that joined a set after its properties were added holds none of them (measured 23 October 2026).
        const node = layer(f, params.layer);
        const holder = allLayers(f)
          .map(({ node: candidate }) => candidate)
          .find(
            (candidate) =>
              candidate.type === 'COMPONENT' && [...walk(candidate.children ?? [])].some(({ node: inside }) => inside.id === node.id),
          );
        if (params.property && holder && !holder.componentPropertyDefinitions?.[params.property])
          throw new Error(`invalid parameters for \`component.bindProperty\`: the component has no property \`${params.property}\``);
        node.hidden = { ...node.hidden, refs: { ...node.hidden?.refs, [params.field]: params.property } };
        return { ok: true };
      }
      case 'variable.bind': {
        for (const id of params.ids) {
          const node = layer(f, id);
          node.boundVariables = { ...node.boundVariables };
          if (params.variable === null) delete node.boundVariables[params.field];
          else node.boundVariables[params.field] = variable(params.variable).id;
        }
        return { ok: true };
      }
      case 'variable.setMode': {
        // Kept, and never reported (measured).
        for (const id of params.ids) {
          const node = layer(f, id);
          node.hidden = { ...node.hidden, modes: { ...node.hidden?.modes, [params.collection]: params.mode } };
        }
        return { ok: true };
      }
      case 'style.apply': {
        const kind = style(params.style).type === 'text' ? 'text' : 'effect';
        for (const id of params.ids) {
          const node = layer(f, id);
          node.styles = { effect: null, fill: null, grid: null, stroke: null, text: null, ...node.styles, [kind]: style(params.style).id };
        }
        return { ok: true };
      }
      case 'edit.delete': {
        for (const id of params.ids) detach(f, id);
        return { deleted: params.ids };
      }
      case 'node.reparent': {
        for (const id of params.ids) {
          const node = layer(f, id);
          detach(f, id);
          const parent = layer(f, params.parent);
          parent.children = parent.children ?? [];
          parent.children.splice(params.index ?? parent.children.length, 0, node);
        }
        return { ok: true };
      }
      case 'node.reorder': {
        const holder = parentOf(f, params.id);
        const at = holder.findIndex((child) => child.id === params.id);
        const [node] = holder.splice(at, 1);
        holder.splice(params.index, 0, node);
        return { ok: true };
      }
      case 'instance.swap': {
        for (const id of params.ids) layer(f, id).mainComponent = params.component;
        return { ok: true };
      }
      case 'instance.setProperties': {
        for (const id of params.ids) {
          const node = layer(f, id);
          node.componentProperties = { ...node.componentProperties };
          // A variant property switches the variant the instance shows (measured); the others are values of its own.
          const main = layer(f, node.mainComponent);
          const pairs = main.name.split(', ').map((pair: string) => pair.split('='));
          let wanted = pairs;
          for (const [name, value] of Object.entries(params.properties)) {
            if (pairs.some(([axis]: string[]) => axis === name))
              wanted = wanted.map(([axis, held]: string[]) => [axis, axis === name ? String(value) : held]);
            else node.componentProperties[name] = value;
          }
          const combination = wanted.map((pair: string[]) => pair.join('=')).join(', ');
          if (combination !== main.name) {
            const variant = parentOf(f, main.id).find((sibling) => sibling.name === combination);
            if (!variant) throw new Error(`no variant ${combination}`);
            node.mainComponent = variant.id;
            // Measured 24 October 2026 (0.10.0, headless): a switch to another variant gives a fixed axis the variant's
            // size, a width written before included, and a hug axis the variant's hugged size; a fill axis keeps its
            // size, and each axis keeps its sizing. Setting the variant the instance shows changes nothing.
            if (node.sizing?.horizontal !== 'fill') node.width = variant.width;
            if (node.sizing?.vertical !== 'fill') node.height = variant.height;
          }
        }
        return { ok: true };
      }
      case 'library.setVariableMode': {
        // FigCraft 0.9.0's command list: copies the collection in (linked, read-only), its id the library's behind the
        // library id and its mode ids not, as a variable's import does; the mode is kept on the frames and never reported.
        const { libraries } = libraryCommand(libraryHelpers, f, 'library.list', { assets: true }) as {
          libraries: Array<Record<string, any>>;
        };
        const library = libraries.find((candidate) => [candidate.id, candidate.name, candidate.path].includes(params.library));
        if (!library || library.error) throw new Error(`invalid parameters: no enabled library ${String(params.library)}`);
        const collection = library.collections.find(
          (candidate: Record<string, any>) => candidate.id === params.collection || candidate.name === params.collection,
        );
        if (!collection)
          throw new Error(
            `invalid parameters for \`library.setVariableMode\`: "${library.name}" publishes no collection "${String(params.collection)}"`,
          );
        const mode = collection.modes.find(
          (candidate: { id: string; name: string }) => candidate.id === params.mode || candidate.name === params.mode,
        );
        if (!mode)
          throw new Error(
            `invalid parameters for \`library.setVariableMode\`: the collection "${collection.name}" has no mode "${String(params.mode)}"`,
          );
        const id = `${library.id}:${collection.id}`;
        if (!f.collections.some((held) => held.id === id))
          f.collections.push({
            id,
            name: collection.name,
            modes: JSON.parse(JSON.stringify(collection.modes)),
            hidden: { library: library.id, key: collection.id, version: collection.version },
          } as File['collections'][number]);
        for (const node of params.ids ?? []) {
          const held = layer(f, node);
          held.hidden = { ...held.hidden, modes: { ...held.hidden?.modes, [id]: mode.id } };
        }
        return { collection: id };
      }
      default: {
        const answer = libraryCommand(libraryHelpers, f, command, params);
        if (answer === undefined) throw new Error(`unknown command ${command}`);
        return answer;
      }
    }
  };

  const server: Server = createServer((socket: Socket) => {
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      for (let end = buffer.indexOf('\n'); end >= 0; end = buffer.indexOf('\n')) {
        const request = JSON.parse(buffer.slice(0, end)) as { id: number; method: string; params: Record<string, any> };
        buffer = buffer.slice(end + 1);
        let reply: Record<string, unknown>;
        try {
          if (request.method === 'window.list')
            reply = {
              id: request.id,
              ok: true,
              result: [{ id: 0, main: true, focused: true, active: tab().name, files: fake.tabs.map((t) => t.name) }],
            };
          else if (request.method === 'engine.execute') {
            if (request.params.command === 'command.batch' && request.params.params.label) fake.labels.push(request.params.params.label);
            reply = { id: request.id, ok: true, result: run(request.params.command, request.params.params ?? {}) };
          } else throw new Error(`unknown method ${request.method}`);
        } catch (error) {
          reply = { id: request.id, ok: false, error: (error as Error).message };
        }
        socket.write(`${JSON.stringify(reply)}\n`);
        fake.afterRequest?.();
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  fake.port = (server.address() as { port: number }).port;
  fake.close = () => new Promise((resolve) => server.close(() => resolve()));
  return fake;
}
