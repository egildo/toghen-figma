/**
 * FigCraft's layers in Figma's words: the read side of the FigCraft target's components.
 *
 * FigCraft keeps Figma's layer model, spelled its own way: `node.get` answers a layer with its auto layout under
 * `layout`, its bindings as one flat map (`fills/0/color`, `gap`), its paints as hex colours. The component engine's
 * reads (the snapshot, resolution, the receipts, the end of a run) are written against Figma's nodes, so this module
 * gives each FigCraft layer as a node those reads understand, the way `figmaView` gives FigCraft's variables. They then
 * run as they do in Figma: the same stamps, the same receipts, the same plan (specs.md, *FigCraft*, *Components*).
 *
 * The nodes are read-only but for what the reads themselves write back: shared plugin data (a stamp), `remove()`, a
 * position (`x`, `y`) and a set's size (`resizeWithoutConstraints`), as the layout of a set's members writes them. Those are kept as writes (`Writes`) that the target sends to FigCraft; nothing here talks to it.
 *
 * Two fields FigCraft keeps but does not report: a layer's wiring to a component property, and a frame's variable
 * modes. What Toghen wrote of them is kept in the layer's own data (`UNREPORTED_KEY`) and read back from there: a hand
 * change to either is not seen until FigCraft reports them (plan, *Answers*, 2).
 */

import { FIELDS } from '../shared/components/fields.js';
import { transformOf } from './figcraftFile.js';

/** A layer as `node.get` answers it, with the fields this module reads. */
export interface FcNode {
  id: number;
  type: string;
  name: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  visible?: boolean;
  opacity?: number;
  rotation?: number;
  children?: FcNode[];
  pluginData?: Record<string, string>;
  layout?: {
    mode?: string;
    gap?: number;
    crossGap?: number;
    padding?: number[];
    mainAlign?: string;
    crossAlign?: string;
    wrap?: boolean;
    contentAlign?: string;
    columnTracks?: { sizing: string; value?: number }[];
    rowTracks?: { sizing: string; value?: number }[];
  };
  gridCell?: { column?: number; row?: number; columnSpan?: number; rowSpan?: number; alignH?: string | null; alignV?: string | null };
  constraints?: { horizontal?: string; vertical?: string };
  dashes?: number[];
  strokeJoin?: string;
  strokeCap?: string;
  blend?: string;
  cornerSmoothing?: number;
  listSpacing?: number;
  leadingTrim?: string;
  maxLines?: number;
  paragraphSpacing?: number;
  paragraphIndent?: number;
  /** A slot layer's property name: a frame FigCraft made a slot (`component.makeSlot`). */
  slot?: string;
  sizing?: { horizontal?: string; vertical?: string };
  absolute?: boolean;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  cornerRadius?: number | number[];
  strokeWeight?: number;
  strokeSides?: number[];
  strokeAlign?: string;
  clip?: boolean;
  fills?: FcPaint[];
  strokes?: FcPaint[];
  effects?: FcEffect[];
  grids?: FcGrid[];
  boundVariables?: Record<string, string>;
  styles?: { text?: string | null; effect?: string | null };
  characters?: string;
  fontFamily?: string;
  fontStyle?: string;
  fontSize?: number;
  fontWeight?: number;
  lineHeight?: string | number;
  letterSpacing?: string | number;
  textAlign?: string;
  textAlignVertical?: string;
  textAutoResize?: string;
  textCase?: string;
  textDecoration?: string;
  mainComponent?: number;
  componentProperties?: Record<string, string | boolean | number>;
  componentPropertyDefinitions?: Record<string, { type: string; default?: unknown; preferred?: unknown[] }>;
}

export interface FcPaint {
  type: string;
  /** A solid's, as hex. */
  color?: string;
  opacity?: number;
  visible?: boolean;
  /** A gradient's: `linear`, `radial`, `angular`, `diamond`, its stops and its ramp's ends in the layer. */
  kind?: string;
  stops?: { color: RGBA; position: number }[];
  from?: [number, number];
  to?: [number, number];
}

/** An effect as `node.get` answers it: a shadow whole, a blur by its radius. */
export interface FcEffect {
  type: string;
  color?: RGBA;
  offset?: [number, number];
  radius: number;
  spread?: number;
  visible?: boolean;
}

/** A layout grid as `node.get` answers it, under `grids`. */
export interface FcGrid {
  kind: string;
  align?: string;
  count?: number;
  gutter?: number;
  offset?: number;
  size?: number;
  color?: RGBA;
  visible?: boolean;
}

/** The layer data key that holds what Toghen wrote of the two fields FigCraft does not report. */
export const UNREPORTED_KEY = 'toghen.unreported';

/** What `UNREPORTED_KEY` holds: a layer's wiring by field, and a frame's modes by collection id. */
export interface Unreported {
  references?: Record<string, string>;
  modes?: Record<string, string>;
  /** Fields FigCraft takes and does not report, as Figma would hold them (`UNREPORTED_FIELDS` in `figcraftApply.ts`). */
  fields?: Record<string, unknown>;
  /** On a set or a component: each slot property's description and settings, which FigCraft's slots do not hold. */
  slots?: Record<string, { description?: string; slotSettings?: SlotSettings }>;
}

/** A slot property's settings, as Figma's `editComponentProperty` takes them. */
type SlotSettings = Record<string, number | boolean>;

/** Shared plugin data as FigCraft keeps it: one flat key, `namespace.key`. */
export const dataKey = (namespace: string, key: string): string => `${namespace}.${key}`;

/** What the reads wrote back, in the order they wrote it, for the target to send. */
export interface Writes {
  data: Map<number, Record<string, string>>;
  removed: number[];
  moved: Map<number, { x: number; y: number }>;
  sized: Map<number, { width: number; height: number }>;
}

export const noWrites = (): Writes => ({ data: new Map(), removed: [], moved: new Map(), sized: new Map() });
export const hasWrites = (writes: Writes): boolean =>
  writes.data.size > 0 || writes.removed.length > 0 || writes.moved.size > 0 || writes.sized.size > 0;

/** Empties the writes once they are sent. */
export function clearWrites(writes: Writes): void {
  writes.data.clear();
  writes.moved.clear();
  writes.sized.clear();
  writes.removed.length = 0;
}

/** The writes as FigCraft commands: the data, then the moves and sizes, then the removals. */
export function writeSteps(writes: Writes): Array<{ command: string; params: Record<string, unknown> }> {
  return [
    ...[...writes.data].map(([id, pluginData]) => ({ command: 'node.set', params: { ids: [id], props: { pluginData } } })),
    ...[...writes.moved].map(([id, { x, y }]) => ({ command: 'node.set', params: { ids: [id], props: { x, y } } })),
    ...[...writes.sized].map(([id, { width, height }]) => ({ command: 'node.set', params: { ids: [id], props: { width, height } } })),
    // A copy: the writes are cleared before the steps are sent.
    ...(writes.removed.length > 0 ? [{ command: 'edit.delete', params: { ids: [...writes.removed] } }] : []),
  ];
}

const upper = (value: string | undefined): string | undefined => value?.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();

/** A hex colour, `#rrggbb` or `#rrggbbaa`, as Figma's colour and a paint's opacity. */
function rgbOf(hex: string): { color: RGB; alpha: number } {
  const channel = (at: number): number => parseInt(hex.slice(at, at + 2), 16) / 255;
  return { color: { r: channel(1), g: channel(3), b: channel(5) }, alpha: hex.length === 9 ? channel(7) : 1 };
}

const alias = (id: string): VariableAlias => ({ type: 'VARIABLE_ALIAS', id });

/**
 * A paint as Figma holds it, its colour's variable on it as Figma's `setBoundVariableForPaint` leaves it; a gradient
 * with each stop's variable on the stop. `bound` reads the paint's bindings by the field after its index.
 */
function paintOf(paint: FcPaint, bound: (part: string) => string | undefined): Paint {
  if (paint.type === 'gradient' && paint.kind) {
    const gradientStops = (paint.stops ?? []).map((stop, j) => {
      const variable = bound(`stops/${j}/color`);
      return {
        position: stop.position,
        color: stop.color,
        ...(variable !== undefined ? { boundVariables: { color: alias(variable) } } : {}),
      };
    });
    return {
      type: `GRADIENT_${upper(paint.kind)}`,
      gradientStops,
      gradientTransform: transformOf(paint),
      opacity: paint.opacity ?? 1,
      visible: paint.visible ?? true,
    } as unknown as GradientPaint;
  }
  if (paint.type !== 'solid' || paint.color === undefined) return { type: (upper(paint.type) ?? 'UNKNOWN') as Paint['type'] } as Paint;
  const variable = bound('color');
  const { color, alpha } = rgbOf(paint.color);
  // A bound paint's colour is its variable's in the layer's mode, alpha included: the paint's opacity is its own.
  const opacity = (paint.opacity ?? 1) * (variable !== undefined ? 1 : alpha);
  return {
    type: 'SOLID',
    color,
    opacity,
    visible: paint.visible ?? true,
    ...(variable !== undefined ? { boundVariables: { color: alias(variable) } } : {}),
  } as SolidPaint;
}

/** The parts of the `index`th item of a list bound to a variable, by part: `effects/0/radius` is `{ radius }`. */
function partsBound(node: FcNode, list: string, index: number, names: Record<string, string> = {}): Record<string, VariableAlias> {
  const prefix = `${list}/${index}/`;
  const out: Record<string, VariableAlias> = {};
  for (const [field, id] of Object.entries(node.boundVariables ?? {}))
    if (field.startsWith(prefix)) out[names[field.slice(prefix.length)] ?? field.slice(prefix.length)] = alias(id);
  return out;
}

/** An effect as Figma holds it. */
function effectOf(node: FcNode, effect: FcEffect, index: number): Effect {
  const boundVariables = partsBound(node, 'effects', index);
  if (effect.type === 'layerBlur' || effect.type === 'backgroundBlur')
    return {
      type: upper(effect.type),
      blurType: 'NORMAL',
      radius: effect.radius,
      visible: effect.visible ?? true,
      boundVariables,
    } as unknown as Effect;
  return {
    type: upper(effect.type),
    color: effect.color,
    offset: { x: effect.offset?.[0] ?? 0, y: effect.offset?.[1] ?? 0 },
    radius: effect.radius,
    spread: effect.spread ?? 0,
    visible: effect.visible ?? true,
    blendMode: 'NORMAL',
    boundVariables,
  } as unknown as Effect;
}

/** FigCraft's names for a layout grid's bound parts, as Figma's. */
const GRID_NAMES: Record<string, string> = { count: 'count', gutter: 'gutterSize', offset: 'offset', size: 'sectionSize' };

/** A layout grid as Figma holds it. */
function gridOf(node: FcNode, grid: FcGrid, index: number): LayoutGrid {
  const out: Record<string, unknown> = {
    pattern: grid.kind.toUpperCase(),
    visible: grid.visible ?? true,
    color: grid.color,
    boundVariables: partsBound(node, 'layoutGrids', index, GRID_NAMES),
  };
  if (grid.kind !== 'grid') out.alignment = (grid.align ?? 'stretch').toUpperCase();
  for (const [fc, figma] of Object.entries(GRID_NAMES)) if (grid[fc as keyof FcGrid] !== undefined) out[figma] = grid[fc as keyof FcGrid];
  return out as unknown as LayoutGrid;
}

/** `node.get`'s length, `"Auto"`, `"150%"` or a number of pixels, as Figma's `LineHeight` or `LetterSpacing`. */
function lengthOf(value: string | number | undefined): { unit: string; value?: number } | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return { unit: 'PIXELS', value };
  if (/^auto$/i.test(value)) return { unit: 'AUTO' };
  if (value.endsWith('%')) return { unit: 'PERCENT', value: Number(value.slice(0, -1)) };
  return { unit: 'PIXELS', value: Number(value) };
}

const MAIN_ALIGN: Record<string, string> = {
  min: 'MIN',
  center: 'CENTER',
  max: 'MAX',
  spaceBetween: 'SPACE_BETWEEN',
  spaceEvenly: 'SPACE_EVENLY',
  spaceAround: 'SPACE_AROUND',
};
const RESIZE: Record<string, string> = { widthAndHeight: 'WIDTH_AND_HEIGHT', height: 'HEIGHT', none: 'NONE', truncate: 'TRUNCATE' };
const CORNERS = ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'];
const SIDES = ['strokeTopWeight', 'strokeRightWeight', 'strokeBottomWeight', 'strokeLeftWeight'];
/** FigCraft's binding names that differ from Figma's; in a grid, `gap` is the column gap and `crossGap` the row gap. */
const BOUND_AS: Record<string, string> = { gap: 'itemSpacing', crossGap: 'counterAxisSpacing' };
const BOUND_IN_GRID: Record<string, string> = { gap: 'gridColumnGap', crossGap: 'gridRowGap' };

/** FigCraft's words back into Figma's: a constraint per axis, a blend mode, a track's sizing. */
const CONSTRAINT_OF: Record<string, string> = {
  left: 'MIN',
  top: 'MIN',
  right: 'MAX',
  bottom: 'MAX',
  leftRight: 'STRETCH',
  topBottom: 'STRETCH',
  center: 'CENTER',
  scale: 'SCALE',
};
const BLEND_OF: Record<string, string> = { 'pass through': 'PASS_THROUGH', plusDarker: 'LINEAR_BURN', plusLighter: 'LINEAR_DODGE' };
const CAP_OF: Record<string, string> = { lineArrow: 'ARROW_LINES', triangleArrow: 'ARROW_EQUILATERAL' };
const TRACK_OF: Record<string, string> = { fixed: 'FIXED', fill: 'FLEX', hug: 'HUG' };
const trackOf = (track: { sizing: string; value?: number }) => ({ type: TRACK_OF[track.sizing] ?? 'FIXED', value: track.value ?? 0 });

/** A node's bindings as Figma reports them: a corner radius and a stroke weight by their parts, a text field as a range. */
function boundOf(node: FcNode): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [field, id] of Object.entries(node.boundVariables ?? {})) {
    if (/^(fills?|strokes?|effects|layoutGrids)(\/|$)/.test(field)) continue;
    if (field.startsWith('componentProperties/')) {
      out.componentProperties = { ...(out.componentProperties as object), [field.slice('componentProperties/'.length)]: alias(id) };
    } else if (field === 'cornerRadius') {
      for (const corner of CORNERS) out[corner] ??= alias(id);
    } else if (field === 'strokeWeight') {
      for (const side of SIDES) out[side] ??= alias(id);
    } else if (node.type === 'TEXT' && FIELDS[field]?.token?.bind?.call === 'text') {
      out[field] = [alias(id)];
    } else {
      out[(node.layout?.mode === 'grid' ? BOUND_IN_GRID[field] : undefined) ?? BOUND_AS[field] ?? field] = alias(id);
    }
  }
  return out;
}

/** What a paint's part is bound to: FigCraft says `fill` for the first fill's colour bound whole, `fills/0/color` by index. */
const paintBinding =
  (node: FcNode, list: 'fills' | 'strokes', index: number) =>
  (part: string): string | undefined =>
    node.boundVariables?.[`${list}/${index}/${part}`] ??
    (index === 0 && part === 'color' ? node.boundVariables?.[list === 'fills' ? 'fill' : 'stroke'] : undefined);

/** Figma's message for a set that cannot be read: what the engine's snapshot recognises. */
const brokenSet = (name: string): Error => new Error(`Component set "${name}" has existing errors`);

/** Each axis and its value, from a member's name `Axis=value, Axis=value`, or undefined when it does not read so. */
const combinationOf = (name: string): Array<[string, string]> | undefined => {
  const pairs = name.split(',').map((part) => part.split('=').map((half) => half.trim()));
  return pairs.every((pair) => pair.length === 2 && pair[0] !== '') ? (pairs as Array<[string, string]>) : undefined;
};

/**
 * A property's definition, as Figma's, from the way FigCraft lists it on a member. A slot's description and settings are
 * what Toghen wrote of them (`recorded`), which FigCraft does not hold. Preferred values are FigCraft's component and set
 * ids, each read as Figma reports one (`offered`): by the key the view gives that component or set.
 */
function definitionOf(
  definition: { type: string; default?: unknown; preferred?: unknown[] },
  offered: (id: unknown) => InstanceSwapPreferredValue,
  recorded?: { description?: string; slotSettings?: SlotSettings },
): ComponentPropertyDefinitions[string] {
  const type = definition.type === 'instanceSwap' ? 'INSTANCE_SWAP' : (upper(definition.type) as ComponentPropertyType);
  const preferredValues = (definition.preferred ?? []).map(offered);
  if (type === 'SLOT')
    return {
      type,
      preferredValues,
      ...(recorded?.description !== undefined ? { description: recorded.description } : {}),
      ...(recorded?.slotSettings ? { slotSettings: recorded.slotSettings } : {}),
    } as unknown as ComponentPropertyDefinitions[string];
  const defaultValue = type === 'INSTANCE_SWAP' ? String(definition.default) : definition.default;
  return { type, defaultValue, ...(type === 'INSTANCE_SWAP' ? { preferredValues } : {}) } as ComponentPropertyDefinitions[string];
}

export interface Scene {
  pages: SceneNode[];
  byId(id: string): SceneNode | undefined;
  /** A library's copy read after the scene was: viewed as the others are, found by id, on no page. */
  adopt(node: FcNode, key: string): SceneNode;
}

/**
 * A library's copies of components in the file, on no page: what each was imported from is `keyOf` its id. They are
 * the library's, never the file's: their data (the library's stamps, which come along) is not read as Toghen's here.
 */
export interface Copies {
  nodes: FcNode[];
  keyOf(id: string): string | undefined;
}

/** Each scene's index and its views of top-level layers and copies, for the next scene to keep (`sceneOf`'s `before`). */
const kept = new WeakMap<Scene, { index: Map<string, SceneNode>; tops: Map<FcNode, SceneNode>; viewer: { view: Keep; keep?: Keep } }>();

/**
 * The pages of a FigCraft file, each with its layers, as Figma nodes. `pages` are `node.get` of each page, children
 * to the depth the layers have. What the nodes write back goes into `writes`.
 */
export function sceneOf(
  pages: FcNode[],
  writes: Writes,
  copies: Copies = { nodes: [], keyOf: () => undefined },
  before?: Scene,
  deepen?: (node: FcNode) => Promise<void>,
): Scene {
  // With `before`, a top-level layer or a copy read as the same object is the same view: viewing every layer for each
  // set and each artboard was half a large run's time. The index and the viewer are shared, so a kept view finds what
  // is new by id. The viewer holds nothing of any scene: a view's functions hold its variables, and a viewer that held a
  // scene would keep each scene of the run alive, and every layer ever viewed in it.
  const prior = before && kept.get(before);
  const index = prior?.index ?? new Map<string, SceneNode>();
  index.clear();
  const viewer = prior?.viewer ?? viewerOf(index, writes, deepen);
  let previous = prior?.tops;
  const tops = new Map<FcNode, SceneNode>();
  viewer.keep = (node, parent, inInstance, copyOf) => {
    const old = previous?.get(node);
    const made = old ?? viewer.view(node, parent, inInstance, copyOf);
    if (old) {
      (old as { parent: SceneNode | null }).parent = parent;
      const enter = (at: SceneNode): void => {
        index.set(at.id, at);
        for (const child of (at as unknown as { children?: SceneNode[] }).children ?? []) enter(child);
      };
      enter(old);
    }
    tops.set(node, made);
    return made;
  };
  const views = pages.map((page) => viewer.view(page, null, false));
  // A copy's own data is the library's, as an instance's is its main's.
  for (const copy of copies.nodes) viewer.keep(copy, null, true, copies.keyOf(String(copy.id)));
  viewer.keep = undefined;
  previous = undefined;
  const scene: Scene = { pages: views, byId: (id) => index.get(id), adopt: (node, key) => viewer.view(node, null, true, key) };
  kept.set(scene, { index, tops, viewer });
  return scene;
}

type Keep = (node: FcNode, parent: SceneNode | null, inInstance: boolean, copyOf?: string) => SceneNode;

/**
 * What views a FigCraft node as a Figma node, over one index of the views by id and one set of writes. `keep` is set
 * while a scene is being built: a page's top-level layers go through it, so a scene keeps the views it can. `deepen`
 * reads what is inside a top-level layer a shallow read left out, when a run asks for it (`loadAsync`).
 */
function viewerOf(index: Map<string, SceneNode>, writes: Writes, deepen?: (node: FcNode) => Promise<void>): { view: Keep; keep?: Keep } {
  const viewer: { view: Keep; keep?: Keep } = { view };
  return viewer;

  function offered(id: unknown): InstanceSwapPreferredValue {
    const node = index.get(String(id)) as (SceneNode & { key?: string }) | undefined;
    return { type: node?.type === 'COMPONENT_SET' ? 'COMPONENT_SET' : 'COMPONENT', key: node?.key ?? String(id) };
  }

  function view(node: FcNode, parent: SceneNode | null, inInstance: boolean, copyOf?: string): SceneNode {
    const id = String(node.id);
    const data = { ...node.pluginData };
    const unreported = (): Unreported => {
      try {
        return JSON.parse((own(UNREPORTED_KEY) && data[UNREPORTED_KEY]) || '{}') as Unreported;
      } catch (_unreadable) {
        return {};
      }
    };
    // An instance is made with a copy of its main's layer data, which is the main's, not its own (measured): a layer
    // inside an instance is never Toghen's, and neither is an instance stamped as a member, which only a main can be.
    const own = (key: string): boolean => {
      if (!key.startsWith('toghen.')) return true;
      if (inInstance) return false;
      if (node.type !== 'INSTANCE') return true;
      try {
        return (JSON.parse(data['toghen.stamp'] ?? '{}') as { is?: { member?: string } }).is?.member === undefined;
      } catch (_unreadable) {
        return true;
      }
    };
    // What a search under a top-level layer found, by its criteria: a run searches every page for each set and each
    // artboard, and a layer no write touched answers as it did. A write in it, or a removal, forgets its answers.
    const searched = new Map<string, SceneNode[]>();
    const forget = (): void => {
      for (let at = out as { parent?: unknown; searched?: Map<string, SceneNode[]> } | undefined; at; at = at.parent as typeof at)
        at.searched?.clear();
    };
    const written = (key: string, value: string): void => {
      data[key] = value;
      writes.data.set(node.id, { ...writes.data.get(node.id), [key]: value });
      forget();
    };
    const layout = node.layout ?? {};
    const recorded = (field: string): any => unreported().fields?.[field];
    const padding = layout.padding ?? [0, 0, 0, 0];
    const corners = Array.isArray(node.cornerRadius)
      ? node.cornerRadius
      : [0, 1, 2, 3].map(() => (node.cornerRadius as number | undefined) ?? 0);
    const sides = node.strokeSides ?? [0, 1, 2, 3].map(() => node.strokeWeight ?? 0);
    let x = node.x ?? 0;
    let y = node.y ?? 0;
    const out: Record<string, unknown> = {
      id,
      // A frame FigCraft made a slot is Figma's SLOT, in a main and in its instances alike.
      type: node.slot !== undefined ? 'SLOT' : node.type,
      name: node.name,
      parent,
      removed: false,
      get x() {
        return x;
      },
      set x(value: number) {
        if (value === x) return;
        x = value;
        writes.moved.set(node.id, { x, y });
      },
      get y() {
        return y;
      },
      set y(value: number) {
        if (value === y) return;
        y = value;
        writes.moved.set(node.id, { x, y });
      },
      width: node.width ?? 0,
      height: node.height ?? 0,
      visible: node.visible ?? true,
      opacity: node.opacity ?? 1,
      rotation: node.rotation ?? 0,
      layoutMode: layout.mode ? upper(layout.mode) : 'NONE',
      itemSpacing: layout.gap ?? 0,
      counterAxisSpacing: layout.crossGap ?? 0,
      paddingTop: padding[0],
      paddingRight: padding[1],
      paddingBottom: padding[2],
      paddingLeft: padding[3],
      primaryAxisAlignItems: MAIN_ALIGN[layout.mainAlign ?? 'min'],
      counterAxisAlignItems: upper(layout.crossAlign ?? 'min'),
      layoutWrap: layout.wrap ? 'WRAP' : 'NO_WRAP',
      layoutSizingHorizontal: upper(node.sizing?.horizontal ?? 'fixed'),
      layoutSizingVertical: upper(node.sizing?.vertical ?? 'fixed'),
      layoutPositioning: node.absolute ? 'ABSOLUTE' : 'AUTO',
      minWidth: node.minWidth ?? null,
      maxWidth: node.maxWidth ?? null,
      minHeight: node.minHeight ?? null,
      maxHeight: node.maxHeight ?? null,
      cornerRadius: corners.every((corner) => corner === corners[0]) ? corners[0] : Symbol.for('figma.mixed'),
      ...Object.fromEntries(CORNERS.map((corner, at) => [corner, corners[at]])),
      strokeWeight: node.strokeWeight ?? 0,
      ...Object.fromEntries(SIDES.map((side, at) => [side, sides[at]])),
      strokeAlign: upper(node.strokeAlign ?? 'inside'),
      clipsContent: node.clip ?? false,
      fills: (node.fills ?? []).map((paint, at) => paintOf(paint, paintBinding(node, 'fills', at))),
      strokes: (node.strokes ?? []).map((paint, at) => paintOf(paint, paintBinding(node, 'strokes', at))),
      effects: (node.effects ?? []).map((effect, at) => effectOf(node, effect, at)),
      layoutGrids: (node.grids ?? []).map((grid, at) => gridOf(node, grid, at)),
      counterAxisAlignContent: upper(layout.contentAlign ?? 'auto'),
      gridColumnSizes: (layout.columnTracks ?? []).map(trackOf),
      gridRowSizes: (layout.rowTracks ?? []).map(trackOf),
      gridColumnGap: layout.gap ?? 0,
      gridRowGap: layout.crossGap ?? 0,
      gridRowAnchorIndex: node.gridCell?.row ?? 0,
      gridColumnAnchorIndex: node.gridCell?.column ?? 0,
      gridRowSpan: node.gridCell?.rowSpan ?? 1,
      gridColumnSpan: node.gridCell?.columnSpan ?? 1,
      gridChildHorizontalAlign: upper(node.gridCell?.alignH ?? 'auto'),
      gridChildVerticalAlign: upper(node.gridCell?.alignV ?? 'auto'),
      dashPattern: node.dashes ?? [],
      strokeJoin: upper(node.strokeJoin ?? 'miter'),
      // Reported where FigCraft reports them; else what Toghen wrote (`Unreported`).
      constraints: node.constraints
        ? { horizontal: CONSTRAINT_OF[node.constraints.horizontal ?? 'left'], vertical: CONSTRAINT_OF[node.constraints.vertical ?? 'top'] }
        : (recorded('constraints') ?? { horizontal: 'MIN', vertical: 'MIN' }),
      blendMode: node.blend ? (BLEND_OF[node.blend] ?? upper(node.blend)) : (recorded('blendMode') ?? 'PASS_THROUGH'),
      cornerSmoothing: node.cornerSmoothing ?? recorded('cornerSmoothing') ?? 0,
      strokeCap: node.strokeCap ? (CAP_OF[node.strokeCap] ?? upper(node.strokeCap)) : (recorded('strokeCap') ?? 'NONE'),
      isExposedInstance: recorded('isExposedInstance') ?? false,
      boundVariables: boundOf(node),
      effectStyleId: node.styles?.effect ?? '',
      get componentPropertyReferences() {
        return unreported().references;
      },
      get explicitVariableModes() {
        return unreported().modes ?? {};
      },
      getSharedPluginData: (namespace: string, key: string): string =>
        own(dataKey(namespace, key)) ? (data[dataKey(namespace, key)] ?? '') : '',
      setSharedPluginData: (namespace: string, key: string, value: string): void => written(dataKey(namespace, key), value),
      getSharedPluginDataKeys: (namespace: string): string[] =>
        Object.keys(data)
          .filter((key) => key.startsWith(`${namespace}.`) && own(key) && data[key] !== '')
          .map((key) => key.slice(namespace.length + 1)),
      resizeWithoutConstraints: (width: number, height: number): void => {
        if (width === out.width && height === out.height) return;
        out.width = width;
        out.height = height;
        writes.sized.set(node.id, { width, height });
      },
      remove: (): void => {
        out.removed = true;
        writes.removed.push(node.id);
        forget();
      },
      // A top-level layer a shallow read left without what is inside it (a dry run that skips what has not changed)
      // reads it when a run is about to compare it; any other layer is read already.
      loadAsync: async (): Promise<void> => {
        if (node.children !== undefined || !(node as { childCount?: number }).childCount || !deepen) return;
        await deepen(node);
        out.children = (node.children ?? []).map((child) => view(child, out as unknown as SceneNode, inside));
        forget();
      },
      findAllWithCriteria: (criteria: { types?: string[]; sharedPluginData?: { namespace: string; keys?: string[] } }): SceneNode[] => {
        const key = JSON.stringify(criteria);
        const kept = searched.get(key);
        if (kept) return [...kept];
        const found: SceneNode[] = [];
        const matches = (child: SceneNode): boolean => {
          const shared = criteria.sharedPluginData;
          const typed = !criteria.types || criteria.types.includes(child.type);
          return (
            typed &&
            (!shared ||
              (shared.keys ?? child.getSharedPluginDataKeys(shared.namespace)).some(
                (name) => child.getSharedPluginData(shared.namespace, name) !== '',
              ))
          );
        };
        const visit = (at: SceneNode): void => {
          for (const child of (at as unknown as { children?: SceneNode[] }).children ?? []) {
            if (matches(child)) found.push(child);
            // A page asks each top-level layer, which keeps its answer.
            if (node.type === 'PAGE')
              found.push(...(child as unknown as ChildrenMixin).findAllWithCriteria(criteria as FindAllCriteria<NodeType[]>));
            else visit(child);
          }
        };
        visit(out as unknown as SceneNode);
        if ((out.parent as BaseNode | null)?.type === 'PAGE') searched.set(key, found);
        return [...found];
      },
    };
    Object.defineProperty(out, 'searched', { value: searched });
    if (node.type === 'TEXT') {
      Object.assign(out, {
        characters: node.characters ?? '',
        fontName: { family: node.fontFamily ?? '', style: node.fontStyle ?? '' },
        fontSize: node.fontSize,
        fontWeight: node.fontWeight,
        lineHeight: lengthOf(node.lineHeight ?? 'auto'),
        letterSpacing: lengthOf(node.letterSpacing ?? 0),
        textAlignHorizontal: upper(node.textAlign ?? 'left'),
        textAlignVertical: upper(node.textAlignVertical ?? 'top'),
        textAutoResize: RESIZE[node.textAutoResize ?? 'none'] ?? 'NONE',
        textCase: upper(node.textCase ?? 'original'),
        textDecoration: upper(node.textDecoration ?? 'none'),
        textStyleId: node.styles?.text ?? '',
        listSpacing: node.listSpacing ?? 0,
        leadingTrim: upper(node.leadingTrim ?? 'none'),
        maxLines: node.maxLines ?? recorded('maxLines') ?? null,
        paragraphSpacing: node.paragraphSpacing ?? recorded('paragraphSpacing') ?? 0,
        paragraphIndent: node.paragraphIndent ?? recorded('paragraphIndent') ?? 0,
      });
    }
    // A library's copy is remote, as an imported component is in Figma, under the key it was imported by; a variant in it
    // has none of its own here, its set's being the one the lock and the swap compare.
    if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
      const remote =
        copyOf !== undefined ||
        (inInstance && parent?.type === 'COMPONENT_SET' && (parent as unknown as { remote?: boolean }).remote === true);
      Object.assign(out, { key: copyOf ?? (remote ? `${(parent as unknown as { key: string }).key}/${id}` : id), remote, description: '' });
    }
    if (node.type === 'INSTANCE') {
      out.getMainComponentAsync = async (): Promise<SceneNode | null> =>
        node.mainComponent === undefined ? null : (index.get(String(node.mainComponent)) ?? null);
      // A getter, read when asked: its main may be viewed after it (a library's copy is), which `Object.assign` would not wait for.
      Object.defineProperty(out, 'componentProperties', {
        enumerable: true,
        get() {
          const main =
            node.mainComponent === undefined
              ? undefined
              : (index.get(String(node.mainComponent)) as unknown as { definitions(): ComponentPropertyDefinitions } | undefined);
          const definitions = main?.definitions() ?? {};
          const values: ComponentProperties = {};
          for (const [name, value] of Object.entries(node.componentProperties ?? {})) {
            values[name] = {
              type: definitions[name]?.type ?? 'TEXT',
              value: typeof value === 'number' ? String(value) : value,
            } as ComponentProperties[string];
          }
          for (const [axis, value] of combinationOf((main as unknown as SceneNode | undefined)?.name ?? '') ?? [])
            values[axis] = { type: 'VARIANT', value };
          return values;
        },
      });
    }
    // What fills an instance's slot is the instance's own, with ids of its own (measured 23 October 2026), and Toghen
    // stamps what it placed there: inside a slot, a layer is no longer inside the instance.
    const inside = node.slot !== undefined && inInstance ? false : inInstance || node.type === 'INSTANCE';
    const children = (node.children ?? []).map((child) =>
      (node.type === 'PAGE' && viewer.keep ? viewer.keep : view)(child, out as unknown as SceneNode, inside),
    );
    out.children = children;
    // A member's definitions, Figma's way: read on the set, not on a member of one.
    const definitions = (slots?: Unreported['slots']): ComponentPropertyDefinitions => {
      const own: ComponentPropertyDefinitions = {};
      const recordedSlots = slots ?? unreported().slots;
      for (const [name, definition] of Object.entries(node.componentPropertyDefinitions ?? {}))
        own[name] = definitionOf(definition, offered, recordedSlots?.[name]);
      return own;
    };
    out.definitions = definitions;
    if (node.type === 'COMPONENT_SET') {
      const members = children.filter((child) => child.type === 'COMPONENT');
      Object.defineProperty(out, 'componentPropertyDefinitions', {
        get() {
          // A set two members of one combination share, or one of several whose name is not one, cannot be read, as in Figma.
          const names = members.map((member) => member.name);
          if (new Set(names).size !== names.length || (names.length > 1 && names.some((name) => !combinationOf(name))))
            throw brokenSet(node.name);
          const first = members[0] as unknown as { definitions(slots?: Unreported['slots']): ComponentPropertyDefinitions } | undefined;
          const all: ComponentPropertyDefinitions = { ...first?.definitions(unreported().slots) };
          const axes = new Map<string, string[]>();
          for (const member of members)
            for (const [axis, value] of combinationOf(member.name) ?? []) axes.set(axis, [...new Set([...(axes.get(axis) ?? []), value])]);
          for (const [axis, values] of axes)
            all[axis] = { type: 'VARIANT', defaultValue: values[0], variantOptions: values } as ComponentPropertyDefinitions[string];
          return all;
        },
      });
      // FigCraft's default variant is the one in the set's top-left corner.
      Object.defineProperty(out, 'defaultVariant', {
        get: () => [...members].sort((a, b) => a.y - b.y || a.x - b.x)[0],
      });
    } else if (node.type === 'COMPONENT') {
      Object.defineProperty(out, 'componentPropertyDefinitions', {
        get() {
          if (parent?.type === 'COMPONENT_SET') throw new Error('Can only get definitions of a component set or non-variant component');
          return definitions();
        },
      });
    }
    index.set(id, out as unknown as SceneNode);
    return out as unknown as SceneNode;
  }
}
