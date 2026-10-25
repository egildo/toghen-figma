/**
 * Steps to a file that has changed, in the order Figma insists on.
 *
 * Every ordering rule below is a trap somebody paid for, and each is keyed to
 * `.reference/figma/measured_behaviour.md`, *Component sets, slots and layout*,
 * or to the typings. Do not reorder to tidy: a call that reads as out of place
 * here is usually the one that keeps a later call from throwing.
 */

import { memberBoard, slotKey } from '../../shared/components/diff.js';
import { FIELDS, TEXT_FIELDS } from '../../shared/components/fields.js';
import type {
  ComponentRef,
  Constraints,
  FieldValue,
  GridPlacement,
  Layer,
  Member,
  PreferredValue,
  Property,
  SetField,
  Track,
  Value,
} from '../../shared/components/model.js';
import type { SetSpec, Step } from '../../shared/components/steps.js';
import type { Resolved } from './resolve.js';
import { BOUND_BY_PARTS } from '../utils/boundVariables.js';
import { writeField } from './fieldWriter.js';
import { stampReceipts, type Written } from './receipt.js';
import { receiptOf, updateStamp, type Identity } from './stamp.js';

/** The size limits, written after the sizing: `width` and `height` are a resize, written as such. */
const LIMITS = Object.keys(FIELDS).filter((name) => FIELDS[name].value === 'size' && name !== 'width' && name !== 'height');
/** A layer's sizing: its sizes and how each axis is sized. */
const SIZING = [...Object.keys(FIELDS).filter((name) => FIELDS[name].value === 'size'), 'layoutSizingHorizontal', 'layoutSizingVertical'];
/** The dimension fields written in one go: all but a stroke's weights, which take the steps of their own below, and a text's (`applyTextFields`). */
const DIMENSIONS = Object.keys(FIELDS).filter(
  (name) =>
    FIELDS[name].value === 'dimension' && name !== 'strokeWeight' && !BOUND_BY_PARTS.strokeWeight.includes(name) && !(name in TEXT_FIELDS),
);

/** The font a new text node starts with, loaded before any text is written. // unmeasured: which font that is; Inter Regular is the usual answer */
const DEFAULT_FONT: FontName = { family: 'Inter', style: 'Regular' };

export interface Applied {
  setId: string;
  created: string[];
  warnings: string[];
}

export interface AppliedArtboard {
  frameId: string;
  /** The addresses of the layers made, the frame's first. */
  created: string[];
  warnings: string[];
}

/** What building one member needs to remember between its layers. */
export interface Build {
  member: ComponentNode;
  /**
   * Where the member's properties live: the member itself until it is combined, the set once it is in
   * one. Reading a variant member's definitions throws, so a member in a set asks its set.
   */
  host: ComponentNode | ComponentSetNode;
  /** When set, references are collected instead of assigned: a member not yet in its set has no keys to reference. */
  deferred?: (() => void)[];
  spec: SetSpec;
  resolved: Resolved;
  /** Property name to the key this member's `addComponentProperty` returned, for wiring. */
  keys: Map<string, string>;
  /** Property name to its default, which a wired field takes as its own value. */
  defaults: Map<string, string | boolean>;
  warnings: string[];
  /** The layers the run wrote, whose receipts are stamped once its writes are done (`stampReceipts`). */
  written: Written[];
  /** An artboard run: an instance takes its slot contents. */
  artboard?: boolean;
}

export const nameOf = (key: string): string => key.split('#')[0];

/** Preferred values as Figma takes them, by published key. One by name never gets here: the run refuses it in Figma (`run.ts`). */
export const keyedPreferred = (values: PreferredValue[]): InstanceSwapPreferredValue[] =>
  values.filter((value): value is InstanceSwapPreferredValue => 'key' in value);

/** A field's plain value, or undefined when it is absent or not plain. */
function plain(value: FieldValue | undefined): string | number | boolean | null | undefined {
  const scalar = value as Value | undefined;
  return scalar && scalar.kind === 'plain' ? scalar.value : undefined;
}

function literal(value: FieldValue | undefined): number | undefined {
  const scalar = value as Value | undefined;
  return scalar && scalar.kind === 'literal' && typeof scalar.value === 'number' ? scalar.value : undefined;
}

function setTracks(node: SceneNode, field: 'gridRowSizes' | 'gridColumnSizes', tracks: Track[]): void {
  // The typings: a grid's tracks are objects whose type and value are set through the frame's own
  // list, after its count is set. // unmeasured: whether assigning the whole array is also accepted
  const grid = node as unknown as GridLayoutMixin;
  if (field === 'gridRowSizes') grid.gridRowCount = tracks.length;
  else grid.gridColumnCount = tracks.length;
  tracks.forEach((track, index) => {
    const target = grid[field][index];
    target.type = track.type;
    if (track.value !== undefined) target.value = track.value;
  });
}

function componentOf(build: Build, value: Value | undefined, address: string): ComponentNode {
  if (value?.kind === 'plain' && typeof value.value === 'string') return build.resolved.component({ name: value.value });
  if (value?.kind === 'key') return build.resolved.component({ key: value.key });
  if (value?.kind === 'property') {
    const declared = build.spec.properties.find((p) => p.type === 'INSTANCE_SWAP' && p.name === value.name) as
      | (Property & { type: 'INSTANCE_SWAP'; default: ComponentRef })
      | undefined;
    if (declared) return build.resolved.component(declared.default);
  }
  throw new Error(`INSTANCE "${address}" names no component to make an instance of`);
}

/**
 * A slot is a property of the component as much as a layer: `createSlot()` makes
 * both, and the property's name is the slot's address.
 */
function createSlot(build: Build, address: string): SlotNode {
  const before = new Set(Object.keys(build.host.componentPropertyDefinitions));
  // unmeasured: where createSlot() puts the property when the member is already in a set
  const slot = build.member.createSlot();
  const added = Object.entries(build.host.componentPropertyDefinitions)
    .filter(([key, definition]) => definition.type === 'SLOT' && !before.has(key))
    .map(([key]) => key);

  slot.name = address;

  // unmeasured: whether renaming the slot renames its property. If it did not, the property still
  // carries the name it was made with, and a slot shared across members by name would not be shared.
  const definitions = build.host.componentPropertyDefinitions;
  const named = Object.entries(definitions).some(([key, definition]) => definition.type === 'SLOT' && nameOf(key) === address);
  if (!named) {
    if (added.length !== 1) throw new Error(`cannot tell which component property is the slot "${address}"`);
    build.host.editComponentProperty(added[0], { name: address });
  }
  return slot;
}

/** The slots of an instance, each the node that holds what fills it. A slot's contents are not searched: they belong to the layers in it. */
export function slotNodesOf(instance: BaseNode): SlotNode[] {
  const found: SlotNode[] = [];
  const visit = (node: BaseNode): void => {
    if (!('children' in node)) return;
    for (const child of node.children) {
      if (child.type === 'SLOT') found.push(child);
      else visit(child);
    }
  };
  visit(instance);
  return found;
}

/** The slot of an instance by the name of the slot property it fills. // unmeasured: that an instance's slot node is named for its property */
export function slotNodeOf(instance: BaseNode, slot: string, address: string): SlotNode {
  const found = slotNodesOf(instance).find((candidate) => candidate.name === slot);
  if (!found) throw new Error(`INSTANCE "${address}" has no slot "${slot}"`);
  return found;
}

/** Records the slots of an instance the run has just made or changed under the key their layers name as their parent. */
export function registerSlots(layers: Map<string, SceneNode>, address: string, instance: BaseNode): void {
  for (const slot of slotNodesOf(instance)) layers.set(slotKey(address, slot.name), slot);
}

/**
 * Stamps a node the run has just made with what it is, before its fields are set, so a step that fails partway leaves a
 * layer the next run finds. Its receipt follows once the run's writes are done: every field it declares is written.
 */
export function stampNew(build: Build, node: SceneNode, layer: Layer, is: Identity = {}): void {
  updateStamp(node, { is: { ...is, address: layer.address }, receipt: {} });
  build.written.push({ node, layer });
}

/** The set's receipt: for each property Toghen added, what Figma reports for its definition. */
export function stampSet(set: ComponentSetNode, spec: SetSpec): void {
  const definitions = set.componentPropertyDefinitions;
  const reported: Record<string, unknown> = {};
  for (const property of spec.properties) {
    if (property.type !== 'VARIANT')
      reported[property.name] = definitions[findKey(definitions, property.type, property.name) ?? ''] ?? null;
  }
  updateStamp(set, { is: { component: spec.name }, receipt: receiptOf(reported) });
}

/**
 * Sets the properties an instance declares with `set`, by the display names its component gives them.
 *
 * Figma keys a property that is not a variant with a suffix (`Name#12:0`); the file never writes it, so the key is
 * found among the instance's own by name. A property the file does not mention is not touched, and with `only`, nor
 * is one whose `set <Name>` it does not list.
 * // unmeasured: that setProperties takes those keys, a variant by its plain name, and an instance swap's component by id
 */
export async function applyInstanceProperties(build: Build, node: SceneNode, layer: Layer, only?: ReadonlySet<string>): Promise<void> {
  const set = Object.entries((layer.fields.set as SetField | undefined) ?? {}).filter(([name]) => !only || only.has(`set ${name}`));
  if (layer.kind !== 'INSTANCE' || set.length === 0) return;
  const instance = node as InstanceNode;
  const present = instance.componentProperties;
  const next: Record<string, string | boolean | VariableAlias> = {};
  let text = false;
  for (const [name, entry] of set) {
    const key = Object.keys(present).find((candidate) => nameOf(candidate) === name);
    if (key === undefined) throw new Error(`INSTANCE "${layer.address}" has no property "${name}"`);
    const value = entry.value;
    // A token's variable is bound to the property: the value is an alias to it (roster, *Instance and component*).
    if (typeof value === 'object' && 'token' in value)
      next[key] = figma.variables.createVariableAlias(build.resolved.variable(value.token));
    else if (typeof value === 'object') next[key] = build.resolved.component({ key: value.key }).id;
    else if (present[key].type === 'INSTANCE_SWAP') next[key] = build.resolved.component({ name: String(value) }).id;
    else next[key] = value;
    text = text || present[key].type === 'TEXT';
  }
  if (text) {
    // A text that follows a property is written through the instance, so its font has to be loaded first. // unmeasured: that this is needed
    const loadFonts = async (parent: BaseNode): Promise<void> => {
      if (!('children' in parent)) return;
      for (const child of parent.children) {
        // A mixed font (a symbol) is not one to load; what is in a slot is the artboard's own, loaded already.
        if (child.type === 'TEXT' && typeof child.fontName === 'object') await figma.loadFontAsync(child.fontName);
        if (child.type !== 'SLOT') await loadFonts(child);
      }
    };
    await loadFonts(instance);
  }
  instance.setProperties(next);
}

export function createNode(build: Build, layer: Layer): SceneNode & ChildrenMixin {
  switch (layer.kind) {
    case 'FRAME':
      return figma.createFrame();
    case 'SLOT':
      return createSlot(build, layer.address);
    case 'TEXT':
      return figma.createText() as unknown as SceneNode & ChildrenMixin;
    case 'LINE':
      return figma.createLine() as unknown as SceneNode & ChildrenMixin;
    case 'INSTANCE':
      return componentOf(build, layer.fields.component as Value | undefined, layer.address).createInstance() as unknown as SceneNode &
        ChildrenMixin;
  }
}

/**
 * The fields of one layer, in the order that keeps each call from throwing.
 *
 * The node is already in its parent, and its parent's own fields are already
 * set, so a `FILL` has an auto-layout parent to fill and a grid child has tracks
 * to sit in.
 *
 * With `only`, a layer that exists has just those of its fields written (`withResets` says which those are), and
 * what a new node is given beyond its fields (a cleared fill or stroke, no stroke weight) is not given again.
 */
export async function applyFields(build: Build, node: SceneNode, layer: Layer, root: boolean, only?: ReadonlySet<string>): Promise<void> {
  const f = layer.fields;
  const has = (name: string): boolean => name in f && (!only || only.has(name));
  const target = node as unknown as Record<string, unknown>;
  const container = layer.kind === 'FRAME' || layer.kind === 'SLOT';
  const references: { visible?: string; characters?: string; mainComponent?: string } = {};
  // A `(literal)` on a wirable field takes it off its property, which a layer built before may still be wired to.
  let unwire = false;
  // The references are written as one, so each is read from the file whichever of them is written.
  for (const [field, reference] of [
    ['visible', 'visible'],
    ['characters', 'characters'],
    ['component', 'mainComponent'],
  ] as const) {
    const value = f[field] as Value | undefined;
    if (value?.kind === 'property') references[reference] = build.keys.get(value.name);
    else if (value?.kind === 'literal') unwire = true;
    // A token takes a layer built before off its property too; a new layer, the root and an artboard's have none.
    else if (value?.kind === 'token' && only && !root && !build.artboard) unwire = true;
  }

  // Layout first: everything below depends on what kind of layout the node has.
  if (has('layoutMode')) target.layoutMode = plain(f.layoutMode);
  if (plain(f.layoutMode) === 'GRID') {
    // Tracks before the children are placed, and the children are placed as they are appended.
    if (has('gridRowSizes')) setTracks(node, 'gridRowSizes', f.gridRowSizes as Track[]);
    if (has('gridColumnSizes')) setTracks(node, 'gridColumnSizes', f.gridColumnSizes as Track[]);
  }
  if (has('grid')) {
    const cell = f.grid as GridPlacement;
    (node as unknown as GridChildrenMixin).setGridChildPosition(cell.row, cell.column);
    if (cell.rowSpan !== undefined) (node as unknown as GridChildrenMixin).gridRowSpan = cell.rowSpan;
    if (cell.columnSpan !== undefined) (node as unknown as GridChildrenMixin).gridColumnSpan = cell.columnSpan;
  }

  // Wrap, a grid child's alignment, and position. Measured: WRAP throws on a frame with no layout (§14), so it follows
  // layoutMode; counterAxisSpacing, a dimension, follows it below. A grid child is aligned once it has its cell. An
  // absolute child leaves the flow before it is sized or placed. // unmeasured: whether FILL on an absolute child throws
  for (const field of [
    'layoutWrap',
    'counterAxisAlignContent',
    'gridChildHorizontalAlign',
    'gridChildVerticalAlign',
    'layoutPositioning',
  ]) {
    if (has(field)) target[field] = plain(f[field]);
  }

  // Measured: a text that is given FILL while it is still empty is 0 wide, and stays 0 wide when its characters
  // arrive, so it wraps one letter to a line. The style and the characters go in before any sizing.
  if (layer.kind === 'TEXT') {
    const text = node as TextNode;
    // A text built before may be in a font this run has not loaded, and every write to a text needs its font.
    if (only && typeof text.fontName === 'object') await figma.loadFontAsync(text.fontName);
    if (has('textStyle')) await writeField(build, node, layer, 'textStyle');
    if (has('characters')) {
      const characters = f.characters as Value;
      // A wired text shows the property's default, and follows the property from there.
      if (characters.kind === 'token') await writeField(build, node, layer, 'characters');
      else
        text.characters =
          characters.kind === 'property' ? String(build.defaults.get(characters.name)) : String((characters as { value: string }).value);
    }
    await applyTextFields(build, text, layer, has);
  }

  // Measured: resize() resets hug sizing, so it comes before any HUG; and an empty hugging frame stays
  // 100 tall until resized, so one with a minimum is resized to it and then set back to HUG.
  const width = literal(has('width') ? f.width : undefined);
  const height = literal(has('height') ? f.height : undefined);
  let nextWidth = width ?? node.width;
  let nextHeight = height ?? node.height;
  if (container && layer.children.length === 0) {
    if (width === undefined && plain(f.layoutSizingHorizontal) === 'HUG') nextWidth = literal(f.minWidth) ?? nextWidth;
    if (height === undefined && plain(f.layoutSizingVertical) === 'HUG') nextHeight = literal(f.minHeight) ?? nextHeight;
  }
  const resized = nextWidth !== node.width || nextHeight !== node.height;
  if (resized) (node as LayoutMixin).resize(nextWidth, nextHeight);
  // A resize resets hug sizing, so after one the sizing the file declares is written again.
  const sizing = (name: string): boolean => has(name) || (resized && name in f);

  // Measured: FILL and HUG throw on a node with no auto-layout parent, which is why the node was appended first.
  if (sizing('layoutSizingHorizontal')) target.layoutSizingHorizontal = plain(f.layoutSizingHorizontal);
  if (sizing('layoutSizingVertical')) target.layoutSizingVertical = plain(f.layoutSizingVertical);
  for (const field of LIMITS) if (has(field)) await writeField(build, node, layer, field);
  for (const field of ['width', 'height'])
    if (has(field) && (f[field] as Value).kind === 'token') await writeField(build, node, layer, field);
  if (has('rotation')) (node as LayoutMixin).rotation = (f.rotation as { value: number }).value;

  if (has('primaryAxisAlignItems')) target.primaryAxisAlignItems = plain(f.primaryAxisAlignItems);
  if (has('counterAxisAlignItems')) target.counterAxisAlignItems = plain(f.counterAxisAlignItems);
  // `cornerRadius` first: each corner field then overrides its own corner.
  for (const field of DIMENSIONS) if (has(field)) await writeField(build, node, layer, field);

  // Measured: a new frame starts with a white fill, and a fill Toghen did not declare is not one it wants.
  // unmeasured: whether a new slot and a new component start with it too; they are cleared the same way
  if (has('fills')) await writeField(build, node, layer, 'fills');
  else if (!only && (container || root)) (node as GeometryMixin).fills = [];
  if (has('strokes')) await writeField(build, node, layer, 'strokes');
  // a new line starts with a 1 px black stroke (measured 10 October 2026); one the file does not declare is not one it wants, as with the frame's fill
  else if (!only && layer.kind === 'LINE') (node as GeometryMixin).strokes = [];
  if (has('effectStyle')) await writeField(build, node, layer, 'effectStyle');
  // Unit 4: effects and layout grids, each written whole.
  if (has('effects')) await writeField(build, node, layer, 'effects');
  if (has('layoutGrids')) await writeField(build, node, layer, 'layoutGrids');

  // Appearance, constraints and the stroke's shape: none depends on another field. `x`, `y`, `cornerSmoothing` and
  // `counterAxisSpacing` are dimensions, written above with the others.
  for (const field of ['blendMode', 'strokeCap', 'strokeJoin']) if (has(field)) target[field] = plain(f[field]);
  if (has('constraints')) target.constraints = { ...(f.constraints as Constraints) };
  if (has('dashPattern')) await writeField(build, node, layer, 'dashPattern');

  // Measured: per-side stroke weights take strokeAlign INSIDE, and strokeWeight is set before them. Neither the align
  // nor the zero weight below is a field: they are steps that go with writing a side (specs, *Drawing fields*), kept so a
  // set built before draws as it did. A declared `strokeAlign`, a field, is written after the sides.
  const sides = BOUND_BY_PARTS.strokeWeight;
  const anySide = sides.some(has);
  if (anySide) target.strokeAlign = 'INSIDE';
  if (has('strokeWeight')) await writeField(build, node, layer, 'strokeWeight');
  // A file that gives only a side means the other sides are none.
  else if (!only && anySide) target.strokeWeight = 0;
  for (const side of sides) if (has(side)) await writeField(build, node, layer, side);
  // A declared strokeAlign wins over the INSIDE above: written after the sides, and again whenever a side is, so a side
  // patched alone does not leave it INSIDE. // unmeasured: whether Figma keeps per-side weights at OUTSIDE or CENTER
  if (has('strokeAlign') || (anySide && 'strokeAlign' in f)) target.strokeAlign = plain(f.strokeAlign);

  // Measured: slots clip by default; the file says so whenever it wants otherwise, and a declared value is always written.
  if (has('clipsContent')) target.clipsContent = plain(f.clipsContent);
  if (has('isExposedInstance')) target.isExposedInstance = plain(f.isExposedInstance);

  if (layer.kind === 'TEXT' && has('textAutoResize'))
    (node as TextNode).textAutoResize = plain(f.textAutoResize) as TextNode['textAutoResize'];

  if (has('visible')) {
    const visible = f.visible as Value;
    if (visible.kind === 'token') await writeField(build, node, layer, 'visible');
    else node.visible = visible.kind === 'property' ? Boolean(build.defaults.get(visible.name)) : (visible as { value: boolean }).value;
  }

  // Pins are applied before the members are combined: a pin set later would have to be set on each member of the set.
  for (const [collection, mode] of Object.entries(has('modes') ? (f.modes as Record<string, string>) : {})) {
    const pin = build.resolved.mode(collection, mode);
    // `resolve` refuses a library collection's pin in Figma, where it is not measured.
    if (pin.library) throw new Error(`modes ${collection}=${mode}: a library collection's mode is not measured in Figma yet`);
    node.setExplicitVariableModeForCollection(pin.collection, pin.modeId);
  }

  if ((!only || ['visible', 'characters', 'component'].some(has)) && (unwire || Object.keys(references).length > 0)) {
    const assign = (): void => {
      node.componentPropertyReferences = references;
    };
    if (build.deferred) build.deferred.push(assign);
    else assign();
  }
}

/** What writing `fields` of a layer comes to: `cornerRadius` sets every corner and `strokeWeight` every side, so those the file declares are written again after it. */
export function withResets(layer: Layer, fields: string[]): Set<string> {
  const out = new Set(fields);
  for (const [field, after] of Object.entries(BOUND_BY_PARTS)) {
    if (out.has(field)) for (const other of after) if (other in layer.fields) out.add(other);
  }
  // New characters take the text fields the file declares again. unmeasured: whether a whole-text binding survives new characters
  if (out.has('characters')) for (const field of Object.keys(TEXT_FIELDS)) if (field in layer.fields) out.add(field);
  // An instance's properties may switch its variant, and with it its size: the sizing the file declares is written again.
  if (layer.kind === 'INSTANCE' && fields.some((field) => field.startsWith('set ')))
    for (const field of SIZING) if (field in layer.fields) out.add(field);
  return out;
}

// ---------------------------------------------------------------------------
// Text fields
// ---------------------------------------------------------------------------

/** A font's halves first: they decide the font, which every later write to the text needs loaded. */
const FONT_HALVES = ['fontFamily', 'fontStyle', 'fontWeight'];
/** The rest, written after the font; `maxLines` last, after `textTruncation`. */
const TEXT_REST = Object.keys(TEXT_FIELDS).filter((name) => !FONT_HALVES.includes(name) && name !== 'maxLines');

/**
 * The fields of a text beyond its characters, style and sizing, after its characters: a field is bound on the whole
 * text, so the text has its length. The font a binding names is loaded before it is bound, and the font the text
 * ends with after.
 */
async function applyTextFields(build: Build, text: TextNode, layer: Layer, has: (name: string) => boolean): Promise<void> {
  const f = layer.fields;
  const target = text as unknown as Record<string, unknown>;
  const halves = FONT_HALVES.filter(has);
  if (halves.length > 0) {
    // The family and the style the variables hold for this text; a weight's style is Figma's to choose.
    const current = text.fontName as FontName;
    const holds = (field: string, otherwise: string): string => {
      const value = f[field] as Value | undefined;
      return value?.kind === 'token' && has(field) ? String(build.resolved.variable(value.path).resolveForConsumer(text).value) : otherwise;
    };
    await figma.loadFontAsync({ family: holds('fontFamily', current.family), style: holds('fontStyle', current.style) });
    for (const field of halves) await writeField(build, text, layer, field);
    // unmeasured: whether binding a weight needs the style it picks loaded first; the run loads it after
    if (typeof text.fontName === 'object') await figma.loadFontAsync(text.fontName);
  }
  for (const field of TEXT_REST) {
    if (!has(field)) continue;
    if (FIELDS[field].value === 'enum') target[field] = (f[field] as { value: unknown }).value;
    else await writeField(build, text, layer, field);
  }
  // Measured: `maxLines` set while `textTruncation` is DISABLED is dropped silently, so it comes after it.
  if (has('maxLines')) await writeField(build, text, layer, 'maxLines');
}

export async function buildChildren(build: Build, parent: ChildrenMixin, layer: Layer): Promise<void> {
  for (const child of layer.children) {
    // A layer in an instance's slot goes into that slot, which the instance has once it is made.
    const into =
      child.slot === undefined ? parent : (slotNodeOf(parent as unknown as BaseNode, child.slot, layer.address) as ChildrenMixin);
    const node = createNode(build, child);
    // Append before anything is sized: FILL and HUG need the auto-layout parent to exist.
    into.appendChild(node as SceneNode);
    node.name = child.name ?? child.address;
    stampNew(build, node as SceneNode, child);
    // An instance's properties first: a variant switch may resize it, and the size the file states comes after.
    await applyInstanceProperties(build, node as SceneNode, child);
    await applyFields(build, node as SceneNode, child, false);
    if (child.kind === 'FRAME' || child.kind === 'SLOT' || child.kind === 'INSTANCE') await buildChildren(build, node, child);
  }
}

async function buildMember(
  member: Member,
  spec: SetSpec,
  resolved: Resolved,
  warnings: string[],
  written: Written[],
): Promise<ComponentNode> {
  // Named for the combination when it is created: renaming variants one by one breaks
  // variantProperties partway through the loop (measured).
  const root = figma.createComponent();
  root.name = member.name;

  const build: Build = { member: root, host: root, spec, resolved, keys: new Map(), defaults: new Map(), warnings, written };
  // The root layer is the member itself: one node, one stamp that says both.
  stampNew(build, root, member.tree, { member: member.name });

  // Properties go on the member before the members are combined, and are wired as their layers are built.
  for (const property of spec.properties) {
    if (property.type === 'BOOLEAN' || property.type === 'TEXT') {
      build.keys.set(property.name, root.addComponentProperty(property.name, property.type, defaultOf(resolved, property)));
      build.defaults.set(property.name, shownDefault(resolved, property));
    } else if (property.type === 'INSTANCE_SWAP') {
      // Typed: the default of an instance swap is a component's node id.
      build.keys.set(property.name, root.addComponentProperty(property.name, 'INSTANCE_SWAP', resolved.component(property.default).id));
    }
  }

  await applyFields(build, root, member.tree, true);
  await buildChildren(build, root, member.tree);
  return root;
}

/** A `BOOLEAN` or `TEXT` property's default as Figma takes it: a token's as an alias to its variable, which binds it. */
export function defaultOf(resolved: Resolved, property: Property): string | boolean | VariableAlias {
  const given = (property as { default: string | boolean | { token: string } }).default;
  return typeof given === 'object' ? figma.variables.createVariableAlias(resolved.variable(given.token)) : given;
}

/** What a layer wired to a `BOOLEAN` or `TEXT` property shows: its default, or what the default's variable holds in its default mode. */
export function shownDefault(resolved: Resolved, property: Property): string | boolean {
  const given = (property as { default: string | boolean | { token: string } }).default;
  return typeof given === 'object' ? resolved.shows(given.token) : given;
}

export function findKey(definitions: ComponentPropertyDefinitions, type: ComponentPropertyType, name: string): string | undefined {
  return Object.keys(definitions).find((key) => definitions[key].type === type && nameOf(key) === name);
}

export function placeMembers(set: ComponentSetNode, members: Member[], spec: SetSpec, copies: ReadonlySet<SceneNode> = new Set()): void {
  const { cells, columnGaps, rowGaps } = memberBoard(members, spec);
  const byName = new Map<string, ComponentNode>();
  // A person's copy of a member is not Toghen's to move.
  for (const child of set.children) if (child.type === 'COMPONENT' && !copies.has(child)) byName.set(child.name, child);

  // A column or row no member is in takes no size, but keeps its gap.
  const widths: number[] = new Array(columnGaps.length).fill(0);
  const heights: number[] = new Array(rowGaps.length).fill(0);
  for (const cell of cells) {
    const node = byName.get(cell.name);
    if (!node) continue;
    widths[cell.column] = Math.max(widths[cell.column], node.width);
    heights[cell.row] = Math.max(heights[cell.row], node.height);
  }
  const offsets = (sizes: number[], gaps: number[]): number[] => {
    let at = 0;
    return sizes.map((size, index) => {
      at += gaps[index];
      const start = at;
      at += size;
      return start;
    });
  };
  const xs = offsets(widths, columnGaps);
  const ys = offsets(heights, rowGaps);

  let right = 1;
  let bottom = 1;
  for (const cell of cells) {
    const node = byName.get(cell.name);
    if (!node) continue;
    node.x = xs[cell.column];
    node.y = ys[cell.row];
    right = Math.max(right, node.x + node.width);
    bottom = Math.max(bottom, node.y + node.height);
  }
  // The set is resized from the members' measured bounds: combining does not shrink or grow it around them.
  set.resizeWithoutConstraints(right, bottom);
}

/**
 * Runs a step that creates nodes, and if it throws removes every node it made before the error goes on.
 *
 * A plugin has no rollback: a node made before the failure stays in the file. `made` is what the step has put outside
 * the page's top level (a member appended to a set); what it left at the top level, the node being built included from
 * the moment it exists, is found by comparing the page with what it held before.
 */
export async function orRemoveWhatItMade<T>(page: PageNode, made: SceneNode[], step: () => Promise<T>): Promise<T> {
  const before = new Set(page.children.map((node) => node.id));
  try {
    return await step();
  } catch (error) {
    for (const node of [...made, ...page.children.filter((child) => !before.has(child.id))]) {
      try {
        if (!node.removed) node.remove();
      } catch (_gone) {
        // Removing is for tidiness; the step's own error is the one to report.
      }
    }
    throw error;
  }
}

export function editProperties(set: ComponentSetNode, spec: SetSpec): void {
  const definitions = set.componentPropertyDefinitions;
  for (const property of spec.properties) {
    if (property.type !== 'SLOT' && property.type !== 'INSTANCE_SWAP') continue;
    const key = findKey(definitions, property.type, property.name);
    if (key === undefined) continue;
    const options: Parameters<ComponentSetNode['editComponentProperty']>[1] = {};
    if (property.preferredValues) options.preferredValues = keyedPreferred(property.preferredValues);
    if (property.type === 'SLOT') {
      if (property.description !== undefined) options.description = property.description;
      if (property.slotSettings) options.slotSettings = property.slotSettings;
    }
    if (Object.keys(options).length > 0) set.editComponentProperty(key, options);
  }
}

/**
 * Creates a component set that does not exist yet, in the order the traps impose.
 *
 * One page switch, fonts loaded, every member built whole (properties, layers,
 * pins), then combined, named, stamped, laid out and given the settings a
 * property can only take once it belongs to a set. A plugin has no rollback, so a
 * failure anywhere removes what the step made (`orRemoveWhatItMade`) before it
 * throws: a set is created whole or not at all. Where it stands on the page is the
 * restack's (`endOfRun.ts`), at the end of the run.
 */
export async function applyCreateSet(step: Extract<Step, { kind: 'CREATE_SET' }>, resolved: Resolved): Promise<Applied> {
  const warnings: string[] = [];
  const { component, members } = step;

  // Page context resets on every call, so this is the one switch, before any node exists.
  await figma.setCurrentPageAsync(resolved.page);

  // A font has to be loaded before a node that uses it is written to.
  const hasText = (layer: Layer): boolean => layer.kind === 'TEXT' || layer.children.some(hasText);
  if (members.some((member) => hasText(member.tree))) await figma.loadFontAsync(DEFAULT_FONT);
  for (const style of resolved.textStyles()) await figma.loadFontAsync(style.fontName);

  return orRemoveWhatItMade(resolved.page, [], async () => {
    const built: ComponentNode[] = [];
    const written: Written[] = [];
    for (const member of members) built.push(await buildMember(member, component, resolved, warnings, written));

    // Properties and pins are on the members already: a set's members cannot take them afterwards.
    const set = figma.combineAsVariants(built, resolved.page);
    set.name = component.name;
    if (component.description !== undefined) set.description = component.description;

    placeMembers(set, members, component);
    editProperties(set, component);
    // Last: what Figma reports once the members are in the set and its properties are settled.
    stampSet(set, component);
    await stampReceipts(written);

    return { setId: set.id, created: members.map((member) => member.name), warnings };
  });
}

/**
 * Creates an artboard that does not exist yet: a frame on the run's page, stamped, with its layers in it.
 *
 * Fonts are loaded first, the frame is made and sized, and then its layers are appended before they are sized, as for a
 * member. An instance takes its properties before its slots are filled, since a variant may decide which slots it has.
 */
export async function applyCreateArtboard(step: Extract<Step, { kind: 'CREATE_ARTBOARD' }>, resolved: Resolved): Promise<AppliedArtboard> {
  const warnings: string[] = [];
  const { member } = step;

  // Page context resets on every call, so this is the one switch, before any node exists.
  await figma.setCurrentPageAsync(resolved.page);
  const hasText = (layer: Layer): boolean => layer.kind === 'TEXT' || layer.children.some(hasText);
  if (hasText(member.tree)) await figma.loadFontAsync(DEFAULT_FONT);
  for (const style of resolved.textStyles()) await figma.loadFontAsync(style.fontName);

  const frame = figma.createFrame();
  frame.name = member.tree.name ?? member.tree.address;
  const build = artboardBuild(frame, member.name, resolved, warnings, []);
  stampNew(build, frame, member.tree, { artboard: member.name });
  await applyFields(build, frame, member.tree, true);
  await buildChildren(build, frame, member.tree);
  await stampReceipts(build.written);

  const created: string[] = [];
  const collect = (layer: Layer): void => {
    created.push(layer.address);
    layer.children.forEach(collect);
  };
  collect(member.tree);
  return { frameId: frame.id, created, warnings };
}

/** What building the layers of an artboard needs: it has no component properties, so none of a member's wiring. */
export function artboardBuild(frame: FrameNode, name: string, resolved: Resolved, warnings: string[], written: Written[]): Build {
  return {
    member: frame as unknown as ComponentNode,
    host: frame as unknown as ComponentNode,
    spec: { name, properties: [] },
    resolved,
    keys: new Map(),
    defaults: new Map(),
    warnings,
    written,
    artboard: true,
  };
}
