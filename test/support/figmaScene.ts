/**
 * The scene graph behind the Figma mock: nodes that can be created, parented,
 * sized, bound, stamped, combined into component sets and found again.
 *
 * It keeps `figmaMock.ts`'s charter: it fails the way Figma fails. What it
 * throws was **measured** (`.reference/figma/measured_behaviour.md`, *Component
 * sets, slots and layout*) or is **typed** (`@figma/plugin-typings`). Where the
 * mock had to assume something neither states, the line says
 * `// unmeasured: <what to check>`, and those lines are the checklist for a pass
 * in a real file. If this file and a measurement disagree, this file is wrong.
 *
 * ### What is not modelled
 *
 * There is no layout engine. A node is as big as it was last resized, so a
 * hugging frame does not grow around its children; sizing traps are reproduced as
 * the *rules* Figma enforces (what throws, what resets), not as geometry.
 *
 * ### How members are checked
 *
 * A node is a Proxy over {@link Impl}. Reading a member the mock does not have
 * throws by name, as `partialApi` does, and so does writing one, since Figma
 * refuses to write a property that has no setter. The last lines of this file
 * fail to compile if `Impl` declares a member none of the real node types has,
 * which is the check `partialApi`'s excess-property rule gives an object literal.
 */

import type { MockCollection, MockPage, MockStyle, MockVariable } from './figmaMock.js';

/** What a scene needs from the mock that owns it. */
export interface SceneEnv {
  record(api: string, ...args: unknown[]): void;
  nextId(prefix: string): string;
  documentAccess(): 'dynamic-page' | 'default';
  isFontLoaded(font: FontName): boolean;
  variableById(id: string): MockVariable | undefined;
  collectionById(id: string): MockCollection | undefined;
  styleById(id: string): MockStyle | undefined;
  pages(): MockPage[];
  currentPage(): MockPage;
  pageApi(page: MockPage): PageNode;
  /** True once `loadAllPagesAsync()` ran: what `findAllWithCriteria` on the document needs under dynamic-page (measured 2026-10-08). */
  allPagesLoaded(): boolean;
  pluginDataFailure(): string | undefined;
  /** Whether renaming a slot node renames its property. Unmeasured, so a test can pick. */
  slotRenameFollowsNode(): boolean;
  /** What a local object of this name reads from `getPublishStatusAsync()`: `UNPUBLISHED` unless a test said otherwise. */
  publishStatus(name: string): PublishStatus;
}

export type Kind = 'FRAME' | 'COMPONENT' | 'COMPONENT_SET' | 'TEXT' | 'INSTANCE' | 'SLOT' | 'LINE';

/** A component property as the mock holds it. A key is `name#id`, and follows the name. */
interface Property {
  id: string;
  name: string;
  type: ComponentPropertyType;
  defaultValue: string | boolean;
  /** The variable the default is bound to, when it was given as an alias. */
  defaultVariable?: string;
  preferredValues?: InstanceSwapPreferredValue[];
  description?: string;
  slotSettings?: SlotSettings;
  /** The slot nodes that are this property, for a `SLOT`. */
  slotNodes?: Impl[];
}

const keyOf = (property: Property): string =>
  // Measured (measured in a real file through use_figma, 2026-09-29): a SLOT key carries the `#id` suffix (`Header#149:44`); a VARIANT key does not (`Columns`).
  `${property.name}#${property.id}`;

const REFERENCE_TYPE = { visible: 'BOOLEAN', characters: 'TEXT', mainComponent: 'INSTANCE_SWAP' } as const;

/** Members that exist only on some kinds of node. Anything absent here is on every kind. */
const ONLY: Record<string, Kind[]> = {
  characters: ['TEXT'],
  fontName: ['TEXT'],
  textStyleId: ['TEXT'],
  textAutoResize: ['TEXT'],
  setTextStyleIdAsync: ['TEXT'],
  // The text fields (property roster, *Text*).
  fontSize: ['TEXT'],
  fontWeight: ['TEXT'],
  lineHeight: ['TEXT'],
  letterSpacing: ['TEXT'],
  paragraphSpacing: ['TEXT'],
  paragraphIndent: ['TEXT'],
  listSpacing: ['TEXT'],
  textAlignHorizontal: ['TEXT'],
  textAlignVertical: ['TEXT'],
  textCase: ['TEXT'],
  textDecoration: ['TEXT'],
  textTruncation: ['TEXT'],
  maxLines: ['TEXT'],
  leadingTrim: ['TEXT'],
  setRangeBoundVariable: ['TEXT'],
  mainComponent: ['INSTANCE'],
  getMainComponentAsync: ['INSTANCE'],
  swapComponent: ['INSTANCE'],
  componentProperties: ['INSTANCE'],
  setProperties: ['INSTANCE'],
  createInstance: ['COMPONENT'],
  createSlot: ['COMPONENT'],
  variantProperties: ['COMPONENT'],
  defaultVariant: ['COMPONENT_SET'],
  variantGroupProperties: ['COMPONENT_SET'],
  description: ['COMPONENT', 'COMPONENT_SET'],
  componentPropertyDefinitions: ['COMPONENT', 'COMPONENT_SET'],
  addComponentProperty: ['COMPONENT', 'COMPONENT_SET'],
  editComponentProperty: ['COMPONENT', 'COMPONENT_SET'],
  deleteComponentProperty: ['COMPONENT', 'COMPONENT_SET'],
  layoutMode: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE'],
  primaryAxisAlignItems: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE'],
  counterAxisAlignItems: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE'],
  itemSpacing: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE'],
  paddingTop: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE'],
  paddingRight: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE'],
  paddingBottom: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE'],
  paddingLeft: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE'],
  cornerRadius: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE'],
  topLeftRadius: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE'],
  topRightRadius: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE'],
  bottomRightRadius: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE'],
  bottomLeftRadius: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE'],
  clipsContent: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE', 'COMPONENT_SET'],
  // Measured (measured behaviour §13): set on an instance inside a component, its properties are listed on that component's instances.
  isExposedInstance: ['INSTANCE'],
  strokes: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE', 'TEXT', 'COMPONENT_SET', 'LINE'],
  strokeWeight: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE', 'TEXT', 'LINE'],
  strokeTopWeight: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE'],
  strokeRightWeight: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE'],
  strokeBottomWeight: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE'],
  strokeLeftWeight: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE'],
  strokeAlign: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE', 'TEXT', 'LINE'],
  gridRowCount: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE'],
  gridColumnCount: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE'],
  gridRowGap: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE'],
  gridColumnGap: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE'],
  gridRowSizes: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE'],
  gridColumnSizes: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE'],
  // Wrap, corners and strokes: the auto-layout frame's, the corner's and the stroke's own. `x`, `y`, `constraints`,
  // `layoutPositioning`, `blendMode` and a grid child's alignment are on every kind here.
  layoutWrap: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE'],
  counterAxisAlignContent: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE'],
  counterAxisSpacing: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE'],
  cornerSmoothing: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE'],
  strokeCap: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE', 'TEXT', 'LINE'],
  strokeJoin: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE', 'TEXT', 'LINE'],
  dashPattern: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE', 'TEXT', 'LINE'],
  children: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE', 'COMPONENT_SET'],
  appendChild: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE', 'COMPONENT_SET'],
  insertChild: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE', 'COMPONENT_SET'],
  // Unit 4: the frame kinds take layout grids (the roster, §10).
  layoutGrids: ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE', 'COMPONENT_SET'],
};

// -- Libraries: keys and publish status (the lock) ------------------------------
//
// Measured (measured behaviour §15): every local component and set has a key of 40 hex digits, published or not, and
// `getPublishStatusAsync()` answers locally, `UNPUBLISHED`. A library's component carries the key it was published under.
Object.assign(ONLY, { key: ['COMPONENT', 'COMPONENT_SET'], getPublishStatusAsync: ['COMPONENT', 'COMPONENT_SET'] });
const publishedKeys = new WeakMap<object, string>();
/** A key of 40 hex digits, the same for one id every time. */
export const hexKey = (id: string): string =>
  Array.from(id, (char) => char.charCodeAt(0).toString(16))
    .join('')
    .padEnd(40, '0')
    .slice(0, 40);

const AUTO_LAYOUT: Kind[] = ['FRAME', 'COMPONENT', 'SLOT', 'INSTANCE'];

/** Fields Figma reports a binding of on their parts. */
const BY_PARTS: Record<string, string[]> = {
  cornerRadius: ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'],
  strokeWeight: ['strokeTopWeight', 'strokeRightWeight', 'strokeBottomWeight', 'strokeLeftWeight'],
};

/** Fields a variable can be bound to, and the variable type each takes. */
const BINDABLE: Record<string, VariableResolvedDataType> = {
  height: 'FLOAT',
  width: 'FLOAT',
  itemSpacing: 'FLOAT',
  paddingLeft: 'FLOAT',
  paddingRight: 'FLOAT',
  paddingTop: 'FLOAT',
  paddingBottom: 'FLOAT',
  cornerRadius: 'FLOAT',
  topLeftRadius: 'FLOAT',
  topRightRadius: 'FLOAT',
  bottomRightRadius: 'FLOAT',
  bottomLeftRadius: 'FLOAT',
  minWidth: 'FLOAT',
  maxWidth: 'FLOAT',
  minHeight: 'FLOAT',
  maxHeight: 'FLOAT',
  strokeWeight: 'FLOAT',
  strokeTopWeight: 'FLOAT',
  strokeRightWeight: 'FLOAT',
  strokeBottomWeight: 'FLOAT',
  strokeLeftWeight: 'FLOAT',
  opacity: 'FLOAT',
  gridRowGap: 'FLOAT',
  gridColumnGap: 'FLOAT',
  // Measured (§14): binds on a frame that does not wrap too, and waits.
  counterAxisSpacing: 'FLOAT',
  visible: 'BOOLEAN',
  characters: 'STRING',
};

/** A paint as Figma keeps it: its opacity as float32. // unmeasured: that a paint's opacity is kept as float32, as a variable's numbers are (§1) */
const keptPaint = (paint: Paint): Paint =>
  typeof paint.opacity === 'number' ? { ...paint, opacity: Math.fround(paint.opacity) } : { ...paint };
const WHITE: Paint = { type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 1, visible: true, blendMode: 'NORMAL' };
const BLACK: Paint = { type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 1, visible: true, blendMode: 'NORMAL' };

/** Fields a variable can be bound to on a text's range, and the variable type each takes (typings; measured §14). */
const TEXT_BINDABLE: Record<string, VariableResolvedDataType> = {
  fontFamily: 'STRING',
  fontStyle: 'STRING',
  fontWeight: 'FLOAT',
  fontSize: 'FLOAT',
  lineHeight: 'FLOAT',
  letterSpacing: 'FLOAT',
  paragraphSpacing: 'FLOAT',
  paragraphIndent: 'FLOAT',
};

/** A style's weight, as Inter's styles have them (measured §9, §14: `Bold` is 700). unmeasured: the other names' weights */
const WEIGHTS: Record<string, number> = {
  Thin: 100,
  'Extra Light': 200,
  Light: 300,
  Regular: 400,
  Medium: 500,
  'Semi Bold': 600,
  Bold: 700,
  'Extra Bold': 800,
  Black: 900,
};

/** The font a new text node starts with. // unmeasured: which font that is; Inter Regular is the usual answer. */
export const DEFAULT_FONT: FontName = { family: 'Inter', style: 'Regular' };

const notNode = (what: string): never => {
  throw new Error(`${what}: expected a node`);
};

/** Registered by `Impl`'s constructor so a proxy can be turned back into its state. */
const implOf = new WeakMap<object, Impl>();

function unwrap(node: unknown, what: string): Impl {
  const impl = typeof node === 'object' && node !== null ? implOf.get(node) : undefined;
  return impl ?? notNode(what);
}

class Impl {
  readonly id: string;
  readonly type: Kind;
  /** The proxy other code holds; children and parents are stored as `Impl`. */
  proxy!: SceneNode;
  removed = false;

  private _name: string;
  private _x = 0;
  private _y = 0;
  private _w = 100;
  private _h = 100;
  private parentRef: Impl | MockPage | null = null;
  private kids: Impl[] = [];
  private values: Record<string, unknown> = {};
  private bound: Record<string, VariableAlias> = {};
  private data = new Map<string, string>();
  private modes: Record<string, string> = {};
  private refs: Partial<Record<'visible' | 'characters' | 'mainComponent', Property>> = {};
  private props: Property[] = [];
  // unmeasured: how many rows and columns a frame has when its layoutMode becomes GRID, and what type they are
  private rowTracks: GridTrackSize[] = [{ type: 'FLEX' }];
  private columnTracks: GridTrackSize[] = [{ type: 'FLEX' }];
  private cell: { row: number; column: number } | undefined;
  private _main: Impl | undefined;
  /** An instance's own values for its component's properties, by key. */
  private overrides = new Map<string, string | boolean>();
  private _fontName: FontName = DEFAULT_FONT;
  private _styleId = '';
  private _effectStyleId = '';
  private _description = '';
  private _characters = '';
  /** Set on a component imported from a library: it has no page. */
  remote = false;

  constructor(
    private readonly env: SceneEnv,
    type: Kind,
  ) {
    this.type = type;
    this.id = env.nextId(`${type}:`);
    this._name = {
      FRAME: 'Frame',
      COMPONENT: 'Component',
      COMPONENT_SET: 'Component set',
      TEXT: 'Text',
      INSTANCE: 'Instance',
      SLOT: 'Slot',
      LINE: 'Line',
    }[type];
    // A new frame starts with one white solid fill, and a new slot clips its content. Measured.
    // unmeasured: whether a new component, slot or component set starts with the same white fill
    if (type === 'FRAME' || type === 'COMPONENT' || type === 'SLOT' || type === 'COMPONENT_SET') this.values.fills = [WHITE];
    if (type === 'TEXT') this.values.fills = [BLACK];
    // A line has a length and no height. unmeasured: that a new line starts with a black stroke
    if (type === 'LINE') {
      this._h = 0;
      this.values.strokes = [BLACK];
    }
    if (type === 'TEXT') this.values.textAutoResize = 'WIDTH_AND_HEIGHT';
    // Measured (measured in a real file through use_figma, 2026-09-29): a new frame clips its content; a component, read as a member of a set, does not.
    this.values.clipsContent = type !== 'COMPONENT';
  }

  // -- identity and tree --------------------------------------------------

  get name(): string {
    return this._name;
  }
  set name(value: string) {
    this.write('name', value);
    this._name = value;
    if (this.type === 'SLOT' && this.env.slotRenameFollowsNode()) {
      // unmeasured: whether renaming a slot node renames its component property
      for (const owner of this.owners()) {
        const property = owner.props.find((p) => p.slotNodes?.includes(this));
        if (property) property.name = value;
      }
    }
  }

  get parent(): (BaseNode & ChildrenMixin) | null {
    const ref = this.parentRef;
    if (ref === null) return null;
    return (ref instanceof Impl ? ref.proxy : this.env.pageApi(ref)) as unknown as BaseNode & ChildrenMixin;
  }

  get children(): readonly SceneNode[] {
    return this.kids.map((kid) => kid.proxy);
  }

  /** Where this node sits in its parent, for tests and the graph's own bookkeeping. */
  indexInParent(): number {
    const ref = this.parentRef;
    if (ref instanceof Impl) return ref.kids.indexOf(this);
    return ref ? ref.nodes.indexOf(this.proxy as never) : -1;
  }

  /** A name given by the mock itself, not by the code under test: nothing is recorded. */
  setInitialName(name: string): void {
    this._name = name;
  }

  gridCell(): { row: number; column: number } | undefined {
    return this.cell;
  }

  parentImpl(): Impl | MockPage | null {
    return this.parentRef;
  }

  childImpls(): readonly Impl[] {
    return this.kids;
  }

  appendChild(child: SceneNode): void {
    const node = unwrap(child, 'appendChild');
    // A node already in this parent moves to the end: one fewer child once it has left. unmeasured: that Figma does the same
    this.insertAt(this.kids.length - (node.parentRef === this ? 1 : 0), node, 'appendChild');
  }

  insertChild(index: number, child: SceneNode): void {
    this.insertAt(index, unwrap(child, 'insertChild'), 'insertChild');
  }

  private insertAt(index: number, child: Impl, api: string): void {
    this.env.record(`node.${api}`, this.id, child.id);
    if (this.type === 'INSTANCE') {
      throw new Error('Cannot move node. New parent is an instance or is within an instance');
    }
    if (this.type === 'COMPONENT_SET' && child.type !== 'COMPONENT') {
      // unmeasured: whether anything but a component may be appended to a set
      throw new Error('in appendChild: a component set can only contain components');
    }
    for (let up: Impl | MockPage | null = this; up instanceof Impl; up = up.parentRef) {
      if (up === child) throw new Error('Cannot move node. A node cannot be moved into itself or its own descendant');
    }
    child.detach();
    if (index < 0 || index > this.kids.length) throw new Error(`Invalid index ${index} for insertChild`);
    this.kids.splice(index, 0, child);
    child.parentRef = this;
    // Measured (measured in a real file through use_figma, 2026-09-29): a component appended to an existing set has its same-named properties merged into the set's,
    // its slots included, and its layers wired with the set's keys.
    if (this.type === 'COMPONENT_SET') this.mergeProperties([child]);
    if (this.values.layoutMode === 'GRID') {
      // Figma places a child appended to a grid in the first free cell.
      // unmeasured: what a child appended to a grid with no free cell is given
      child.cell = this.firstFreeCell(child);
    } else {
      child.cell = undefined;
    }
  }

  /** Puts a node on a page, as `createFrame()` does on the current page. */
  attachToPage(page: MockPage): void {
    this.detach();
    this.parentRef = page;
    page.nodes.push(this.proxy as never);
  }

  private detach(): void {
    const ref = this.parentRef;
    if (ref instanceof Impl) {
      ref.kids.splice(ref.kids.indexOf(this), 1);
    } else if (ref) {
      const at = ref.nodes.indexOf(this.proxy as never);
      if (at !== -1) ref.nodes.splice(at, 1);
    }
    this.parentRef = null;
  }

  /**
   * Typed: duplicates the node, with everything in it, under the current page. Its shared plugin data comes along, as a
   * duplicate made in the editor takes it (decisions, *Ruled: a copy carries the stamp*); a paste is a clone put
   * somewhere, and a cut and paste a clone and the original removed.
   * // unmeasured: that clone() copies shared plugin data as the editor's duplicate does
   */
  clone(): SceneNode {
    this.env.record('node.clone', this.id);
    const copy = this.duplicate();
    copy.attachToPage(this.env.currentPage());
    return copy.proxy;
  }

  private duplicate(): Impl {
    const copy = makeNode(this.env, this.type);
    Object.assign(copy, {
      _name: this._name,
      _x: this._x,
      _y: this._y,
      _w: this._w,
      _h: this._h,
      values: structuredClone(this.values),
      bound: { ...this.bound },
      data: new Map(this.data),
      modes: { ...this.modes },
      refs: { ...this.refs },
      props: this.props.map((property) => ({ ...property })),
      rowTracks: [...this.rowTracks],
      columnTracks: [...this.columnTracks],
      _main: this._main,
      overrides: new Map(this.overrides),
      _fontName: { ...this._fontName },
      _styleId: this._styleId,
      _effectStyleId: this._effectStyleId,
      _description: this._description,
      _characters: this._characters,
    });
    for (const kid of this.kids) {
      const twin = kid.duplicate();
      copy.kids.push(twin);
      twin.parentRef = copy;
      twin.cell = kid.cell;
    }
    return copy;
  }

  remove(): void {
    this.env.record('node.remove', this.id);
    this.detach();
    this.removed = true;
  }

  // -- plugin data ---------------------------------------------------------

  setSharedPluginData(namespace: string, key: string, value: string): void {
    this.env.record('node.setSharedPluginData', this.id, namespace, key, value);
    const failure = this.env.pluginDataFailure();
    if (failure) throw new Error(failure);
    if (!/^[a-zA-Z0-9]{3,}$/.test(namespace)) {
      throw new Error('in setSharedPluginData: namespace must be at least 3 alphanumeric characters');
    }
    const bytes = utf8(namespace) + utf8(key) + utf8(value);
    if (bytes > 100 * 1024) throw new Error(`in setSharedPluginData: entry is ${bytes} bytes, over the ${100 * 1024} byte limit`);
    if (value === '') this.data.delete(`${namespace}/${key}`);
    else this.data.set(`${namespace}/${key}`, value);
  }

  getSharedPluginData(namespace: string, key: string): string {
    return this.data.get(`${namespace}/${key}`) ?? '';
  }

  getSharedPluginDataKeys(namespace: string): string[] {
    return [...this.data.keys()].filter((k) => k.startsWith(`${namespace}/`)).map((k) => k.slice(namespace.length + 1));
  }

  hasSharedData(namespace: string, keys: string[] | undefined): boolean {
    const present = this.getSharedPluginDataKeys(namespace);
    return keys && keys.length > 0 ? keys.some((k) => present.includes(k)) : present.length > 0;
  }

  // -- geometry and layout -------------------------------------------------

  get x(): number {
    return this._x;
  }
  set x(value: number) {
    this.write('x', value);
    this._x = value;
  }
  get y(): number {
    return this._y;
  }
  set y(value: number) {
    this.write('y', value);
    this._y = value;
  }
  get width(): number {
    return this._w;
  }
  get height(): number {
    return this._h;
  }

  resize(width: number, height: number): void {
    this.env.record('node.resize', this.id, width, height);
    // unmeasured: that resize() takes a height of 0 on a line, as the plugin examples draw one
    if (!(width >= 0.01) || !(height >= (this.type === 'LINE' ? 0 : 0.01)))
      throw new Error('in resize: Width and height must be at least 0.01');
    this._w = width;
    this._h = height;
    // Measured: resize() resets hug sizing. FILL is left alone.
    // unmeasured: whether resize() also resets a FILL axis
    for (const axis of ['layoutSizingHorizontal', 'layoutSizingVertical']) {
      if (this.values[axis] === 'HUG') this.values[axis] = 'FIXED';
    }
  }

  resizeWithoutConstraints(width: number, height: number): void {
    this.env.record('node.resizeWithoutConstraints', this.id, width, height);
    if (!(width >= 0.01) || !(height >= 0.01)) throw new Error('in resizeWithoutConstraints: Width and height must be at least 0.01');
    this._w = width;
    this._h = height;
  }

  get layoutSizingHorizontal(): string {
    return (this.values.layoutSizingHorizontal as string | undefined) ?? 'FIXED';
  }
  set layoutSizingHorizontal(value: 'FIXED' | 'HUG' | 'FILL') {
    this.setSizing('layoutSizingHorizontal', value);
  }
  get layoutSizingVertical(): string {
    return (this.values.layoutSizingVertical as string | undefined) ?? 'FIXED';
  }
  set layoutSizingVertical(value: 'FIXED' | 'HUG' | 'FILL') {
    this.setSizing('layoutSizingVertical', value);
  }

  private setSizing(field: string, value: 'FIXED' | 'HUG' | 'FILL'): void {
    this.write(field, value);
    if (!['FIXED', 'HUG', 'FILL'].includes(value)) throw new Error(`Property "${field}" failed validation: invalid value ${String(value)}`);
    const parent = this.parentRef instanceof Impl ? this.parentRef : undefined;
    const parentIsAutoLayout =
      parent !== undefined &&
      AUTO_LAYOUT.includes(parent.type) &&
      parent.values.layoutMode !== undefined &&
      parent.values.layoutMode !== 'NONE';
    // Measured: FILL or HUG on a node with no auto-layout parent throws.
    // Measured (measured in a real file through use_figma, 2026-09-29): HUG on a component's root, auto-layout itself inside a set that is not, is accepted.
    // unmeasured: HUG on a text node whose parent is not auto-layout
    const selfIsAutoLayout = AUTO_LAYOUT.includes(this.type) && this.values.layoutMode !== undefined && this.values.layoutMode !== 'NONE';
    const allowed =
      value === 'FIXED' ||
      (value === 'FILL' && parentIsAutoLayout) ||
      (value === 'HUG' && (parentIsAutoLayout || selfIsAutoLayout || this.type === 'TEXT'));
    if (!allowed) {
      throw new Error(`in set_${field}: only auto-layout frames and their children can be ${value}; this node has no auto-layout parent`);
    }
    this.values[field] = value;
  }

  get layoutMode(): string {
    return (this.values.layoutMode as string | undefined) ?? 'NONE';
  }
  set layoutMode(value: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'GRID') {
    this.write('layoutMode', value);
    // Typed: a slot cannot be a grid.
    if (this.type === 'SLOT' && value === 'GRID') throw new Error('cannotApplyGridToSlot');
    this.values.layoutMode = value;
  }

  get gridRowCount(): number {
    return this.rowTracks.length;
  }
  set gridRowCount(value: number) {
    this.setCount('gridRowCount', this.rowTracks, value);
  }
  get gridColumnCount(): number {
    return this.columnTracks.length;
  }
  set gridColumnCount(value: number) {
    this.setCount('gridColumnCount', this.columnTracks, value);
  }
  private setCount(field: string, tracks: GridTrackSize[], count: number): void {
    this.write(field, count);
    // Typed: applicable only to a GRID; a count below 1 throws.
    if (this.values.layoutMode !== 'GRID') throw new Error(`in set_${field}: only a frame with layoutMode GRID has tracks`);
    if (!(count >= 1)) throw new Error(`in set_${field}: a grid needs at least 1`);
    while (tracks.length < count) tracks.push({ type: 'FLEX' });
    tracks.length = count;
  }
  /** The live track objects: mutating one changes the grid, as the typings say. */
  get gridRowSizes(): GridTrackSize[] {
    return this.rowTracks;
  }
  get gridColumnSizes(): GridTrackSize[] {
    return this.columnTracks;
  }

  setGridChildPosition(row: number, column: number): void {
    this.env.record('node.setGridChildPosition', this.id, row, column);
    const parent = this.parentRef instanceof Impl ? this.parentRef : undefined;
    if (parent?.values.layoutMode !== 'GRID') throw new Error('in setGridChildPosition: the parent is not a grid');
    if (row < 0 || row >= parent.rowTracks.length || column < 0 || column >= parent.columnTracks.length) {
      throw new Error('in setGridChildPosition: the cell is outside the grid');
    }
    if (parent.kids.some((kid) => kid !== this && kid.cell?.row === row && kid.cell.column === column)) {
      throw new Error('in setGridChildPosition: the cell is occupied');
    }
    this.cell = { row, column };
  }
  get gridRowAnchorIndex(): number {
    return this.cell?.row ?? 0;
  }
  get gridColumnAnchorIndex(): number {
    return this.cell?.column ?? 0;
  }
  get gridRowSpan(): number {
    return (this.values.gridRowSpan as number | undefined) ?? 1;
  }
  set gridRowSpan(value: number) {
    this.write('gridRowSpan', value);
    this.values.gridRowSpan = value;
  }
  get gridColumnSpan(): number {
    return (this.values.gridColumnSpan as number | undefined) ?? 1;
  }
  set gridColumnSpan(value: number) {
    this.write('gridColumnSpan', value);
    this.values.gridColumnSpan = value;
  }

  private firstFreeCell(child: Impl): { row: number; column: number } | undefined {
    for (let row = 0; row < this.rowTracks.length; row += 1) {
      for (let column = 0; column < this.columnTracks.length; column += 1) {
        if (!this.kids.some((kid) => kid !== child && kid.cell?.row === row && kid.cell.column === column)) return { row, column };
      }
    }
    return undefined;
  }

  // -- plain fields --------------------------------------------------------

  private plainGet<T>(field: string, fallback: T): T {
    return (this.values[field] as T | undefined) ?? fallback;
  }
  private plainSet(field: string, value: unknown): void {
    this.write(field, value);
    this.values[field] = value;
  }

  get visible(): boolean {
    return this.plainGet('visible', true);
  }
  set visible(value: boolean) {
    this.plainSet('visible', value);
  }
  get opacity(): number {
    return this.plainGet('opacity', 1);
  }
  set opacity(value: number) {
    this.plainSet('opacity', value);
  }
  get primaryAxisAlignItems(): string {
    return this.plainGet('primaryAxisAlignItems', 'MIN');
  }
  set primaryAxisAlignItems(value: 'MIN' | 'MAX' | 'CENTER' | 'SPACE_BETWEEN') {
    this.plainSet('primaryAxisAlignItems', value);
  }
  get counterAxisAlignItems(): string {
    return this.plainGet('counterAxisAlignItems', 'MIN');
  }
  set counterAxisAlignItems(value: 'MIN' | 'MAX' | 'CENTER' | 'BASELINE') {
    this.plainSet('counterAxisAlignItems', value);
  }
  get itemSpacing(): number {
    return this.plainGet('itemSpacing', 0);
  }
  set itemSpacing(value: number) {
    this.plainSet('itemSpacing', value);
  }
  get paddingTop(): number {
    return this.plainGet('paddingTop', 0);
  }
  set paddingTop(value: number) {
    this.plainSet('paddingTop', value);
  }
  get paddingRight(): number {
    return this.plainGet('paddingRight', 0);
  }
  set paddingRight(value: number) {
    this.plainSet('paddingRight', value);
  }
  get paddingBottom(): number {
    return this.plainGet('paddingBottom', 0);
  }
  set paddingBottom(value: number) {
    this.plainSet('paddingBottom', value);
  }
  get paddingLeft(): number {
    return this.plainGet('paddingLeft', 0);
  }
  set paddingLeft(value: number) {
    this.plainSet('paddingLeft', value);
  }
  get cornerRadius(): number {
    return this.plainGet('cornerRadius', 0);
  }
  set cornerRadius(value: number) {
    this.plainSet('cornerRadius', value);
    // Setting the radius sets every corner. unmeasured: that it also drops the corners' variable bindings
    for (const corner of ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius']) delete this.values[corner];
  }
  get topLeftRadius(): number {
    return this.plainGet('topLeftRadius', this.cornerRadius);
  }
  set topLeftRadius(value: number) {
    this.plainSet('topLeftRadius', value);
  }
  get topRightRadius(): number {
    return this.plainGet('topRightRadius', this.cornerRadius);
  }
  set topRightRadius(value: number) {
    this.plainSet('topRightRadius', value);
  }
  get bottomRightRadius(): number {
    return this.plainGet('bottomRightRadius', this.cornerRadius);
  }
  set bottomRightRadius(value: number) {
    this.plainSet('bottomRightRadius', value);
  }
  get bottomLeftRadius(): number {
    return this.plainGet('bottomLeftRadius', this.cornerRadius);
  }
  set bottomLeftRadius(value: number) {
    this.plainSet('bottomLeftRadius', value);
  }
  get rotation(): number {
    return this.plainGet('rotation', 0);
  }
  set rotation(value: number) {
    this.plainSet('rotation', value);
  }
  get gridRowGap(): number {
    return this.plainGet('gridRowGap', 0);
  }
  set gridRowGap(value: number) {
    this.plainSet('gridRowGap', value);
  }
  get gridColumnGap(): number {
    return this.plainGet('gridColumnGap', 0);
  }
  set gridColumnGap(value: number) {
    this.plainSet('gridColumnGap', value);
  }
  get clipsContent(): boolean {
    return this.plainGet('clipsContent', true);
  }
  set clipsContent(value: boolean) {
    this.plainSet('clipsContent', value);
  }
  get isExposedInstance(): boolean {
    return this.plainGet('isExposedInstance', false);
  }
  set isExposedInstance(value: boolean) {
    this.plainSet('isExposedInstance', value);
  }
  get minWidth(): number | null {
    return this.plainGet('minWidth', null);
  }
  set minWidth(value: number | null) {
    this.plainSet('minWidth', value);
  }
  get maxWidth(): number | null {
    return this.plainGet('maxWidth', null);
  }
  set maxWidth(value: number | null) {
    this.plainSet('maxWidth', value);
  }
  get minHeight(): number | null {
    return this.plainGet('minHeight', null);
  }
  set minHeight(value: number | null) {
    this.plainSet('minHeight', value);
  }
  get maxHeight(): number | null {
    return this.plainGet('maxHeight', null);
  }
  set maxHeight(value: number | null) {
    this.plainSet('maxHeight', value);
  }

  get fills(): readonly Paint[] {
    return this.plainGet('fills', []);
  }
  set fills(value: readonly Paint[]) {
    if (!Array.isArray(value)) throw new Error('Property "fills" failed validation: Expected array');
    this.plainSet(
      'fills',
      value.map(keptPaint).map((paint) => this.stopsBound(paint)),
    );
  }
  get strokes(): readonly Paint[] {
    return this.plainGet('strokes', []);
  }
  set strokes(value: readonly Paint[]) {
    if (!Array.isArray(value)) throw new Error('Property "strokes" failed validation: Expected array');
    this.plainSet(
      'strokes',
      value.map(keptPaint).map((paint) => this.stopsBound(paint)),
    );
  }

  // -- effects and layout grids (unit 4) -------------------------------------

  get effects(): readonly Effect[] {
    return this.plainGet('effects', []);
  }
  set effects(value: readonly Effect[]) {
    if (!Array.isArray(value)) throw new Error('Property "effects" failed validation: Expected array');
    this.plainSet(
      'effects',
      value.map((effect) => ({ ...effect })),
    );
  }
  get layoutGrids(): readonly LayoutGrid[] {
    return this.plainGet('layoutGrids', []);
  }
  set layoutGrids(value: readonly LayoutGrid[]) {
    if (!Array.isArray(value)) throw new Error('Property "layoutGrids" failed validation: Expected array');
    this.plainSet(
      'layoutGrids',
      value.map((grid) => ({ ...grid })),
    );
  }
  /** Measured §14: a gradient stop given an alias in its `boundVariables` reads back bound, its colour the variable's. */
  private stopsBound(paint: Paint): Paint {
    if (!('gradientStops' in paint)) return paint;
    const gradientStops = paint.gradientStops.map((stop) => {
      const found = stop.boundVariables?.color ? this.env.variableById(stop.boundVariables.color.id) : undefined;
      const collection = found ? this.env.collectionById(found.variableCollectionId) : undefined;
      const color = collection ? (found!.valuesByMode[collection.defaultModeId] as RGBA) : undefined;
      return color && 'r' in color ? { ...stop, color: { ...color } } : stop;
    });
    return { ...paint, gradientStops };
  }

  get strokeAlign(): string {
    return this.plainGet('strokeAlign', 'INSIDE');
  }
  set strokeAlign(value: 'CENTER' | 'INSIDE' | 'OUTSIDE') {
    this.plainSet('strokeAlign', value);
  }
  get strokeWeight(): number {
    return this.plainGet('strokeWeight', 1);
  }
  set strokeWeight(value: number) {
    this.write('strokeWeight', value);
    // unmeasured: whether setting strokeWeight sets all four side weights, which the engine relies on
    this.values.strokeWeight = value;
    this.values.sideWeightsGiven = true;
    for (const side of ['strokeTopWeight', 'strokeRightWeight', 'strokeBottomWeight', 'strokeLeftWeight']) this.values[side] = value;
  }
  get strokeTopWeight(): number {
    return this.plainGet('strokeTopWeight', 1);
  }
  set strokeTopWeight(value: number) {
    this.setSide('strokeTopWeight', value);
  }
  get strokeRightWeight(): number {
    return this.plainGet('strokeRightWeight', 1);
  }
  set strokeRightWeight(value: number) {
    this.setSide('strokeRightWeight', value);
  }
  get strokeBottomWeight(): number {
    return this.plainGet('strokeBottomWeight', 1);
  }
  set strokeBottomWeight(value: number) {
    this.setSide('strokeBottomWeight', value);
  }
  get strokeLeftWeight(): number {
    return this.plainGet('strokeLeftWeight', 1);
  }
  set strokeLeftWeight(value: number) {
    this.setSide('strokeLeftWeight', value);
  }
  private setSide(field: string, value: number): void {
    this.write(field, value);
    // Measured: set strokeWeight before the per-side weights, and give strokeAlign 'INSIDE'.
    // unmeasured: what Figma does when a side weight comes first or the align is not INSIDE; only the order is measured
    if (!this.values.sideWeightsGiven) throw new Error(`in set_${field}: set strokeWeight before the per-side weights`);
    if (this.values.strokeAlign !== undefined && this.values.strokeAlign !== 'INSIDE') {
      throw new Error(`in set_${field}: per-side stroke weights need strokeAlign INSIDE`);
    }
    this.values[field] = value;
  }

  // -- wrap, grid child, position, appearance and strokes -------------------

  get layoutWrap(): string {
    return this.plainGet('layoutWrap', 'NO_WRAP');
  }
  set layoutWrap(value: 'NO_WRAP' | 'WRAP') {
    this.write('layoutWrap', value);
    // Measured (§14): a VERTICAL frame takes WRAP, as a HORIZONTAL one does; a frame with no layout throws.
    // unmeasured: NO_WRAP on a frame with no layout, here accepted
    if (value === 'WRAP' && this.values.layoutMode !== 'HORIZONTAL' && this.values.layoutMode !== 'VERTICAL') {
      throw new Error('in set_layoutWrap: Can only set layoutWrap = WRAP on nodes with layoutMode === HORIZONTAL or VERTICAL');
    }
    this.values.layoutWrap = value;
  }
  get counterAxisAlignContent(): string {
    return this.plainGet('counterAxisAlignContent', 'AUTO');
  }
  set counterAxisAlignContent(value: 'AUTO' | 'SPACE_BETWEEN') {
    // Measured (§14): accepted on a HORIZONTAL frame that does not wrap. unmeasured: on a frame with no layout
    this.plainSet('counterAxisAlignContent', value);
  }
  get counterAxisSpacing(): number {
    // unmeasured: what a new frame reads; 0 here
    return this.plainGet('counterAxisSpacing', 0);
  }
  set counterAxisSpacing(value: number) {
    this.plainSet('counterAxisSpacing', value);
  }
  get gridChildHorizontalAlign(): string {
    return this.plainGet('gridChildHorizontalAlign', 'AUTO');
  }
  set gridChildHorizontalAlign(value: 'MIN' | 'CENTER' | 'MAX' | 'AUTO') {
    // unmeasured: whether it throws outside a grid
    this.plainSet('gridChildHorizontalAlign', value);
  }
  get gridChildVerticalAlign(): string {
    return this.plainGet('gridChildVerticalAlign', 'AUTO');
  }
  set gridChildVerticalAlign(value: 'MIN' | 'CENTER' | 'MAX' | 'AUTO') {
    this.plainSet('gridChildVerticalAlign', value);
  }
  get layoutPositioning(): string {
    return this.plainGet('layoutPositioning', 'AUTO');
  }
  set layoutPositioning(value: 'AUTO' | 'ABSOLUTE') {
    // unmeasured: whether it throws on a node whose parent has no auto-layout
    this.plainSet('layoutPositioning', value);
  }
  get constraints(): Constraints {
    return { ...this.plainGet<Constraints>('constraints', { horizontal: 'MIN', vertical: 'MIN' }) };
  }
  set constraints(value: Constraints) {
    this.plainSet('constraints', { horizontal: value.horizontal, vertical: value.vertical });
  }
  get blendMode(): string {
    // unmeasured: that a frame starts PASS_THROUGH and anything else NORMAL, as the editor shows them
    return this.plainGet('blendMode', AUTO_LAYOUT.includes(this.type) ? 'PASS_THROUGH' : 'NORMAL');
  }
  set blendMode(value: BlendMode) {
    this.plainSet('blendMode', value);
  }
  get cornerSmoothing(): number {
    return this.plainGet('cornerSmoothing', 0);
  }
  set cornerSmoothing(value: number) {
    this.plainSet('cornerSmoothing', value);
  }
  get strokeCap(): string {
    return this.plainGet('strokeCap', 'NONE');
  }
  set strokeCap(value: StrokeCap) {
    this.plainSet('strokeCap', value);
  }
  get strokeJoin(): string {
    return this.plainGet('strokeJoin', 'MITER');
  }
  set strokeJoin(value: StrokeJoin) {
    this.plainSet('strokeJoin', value);
  }
  get dashPattern(): readonly number[] {
    return [...this.plainGet<number[]>('dashPattern', [])];
  }
  set dashPattern(value: readonly number[]) {
    // Measured (§14): [4, 2] reads back as given. unmeasured: that a dash is kept as float32
    if (!Array.isArray(value)) throw new Error('Property "dashPattern" failed validation: Expected array');
    this.plainSet('dashPattern', [...value]);
  }

  // -- variables -----------------------------------------------------------

  get boundVariables(): Record<string, VariableAlias> {
    return this.bound;
  }

  setBoundVariable(field: VariableBindableNodeField, variable: Variable | null): void {
    this.env.record('node.setBoundVariable', this.id, field, variable?.id ?? null);
    // Measured (§14): every field outside the bindable lists is refused by name.
    if (!(field in BINDABLE)) throw new Error(`in setBoundVariable: Unknown field: '${String(field)}'`);
    // Measured 20 October 2026: a bound `cornerRadius` is reported as its four corners, with no `cornerRadius` key. A
    // bound `strokeWeight` is taken to be reported the same way, as its four sides.
    const parts = BY_PARTS[field];
    if (variable === null) {
      for (const key of parts ?? [field]) delete this.bound[key];
      return;
    }
    const found = this.env.variableById(variable.id);
    if (!found) throw new Error('in setBoundVariable: variable not found');
    if (found.resolvedType !== BINDABLE[field]) {
      throw new Error(`in setBoundVariable: ${String(field)} takes a ${BINDABLE[field]} variable, not a ${found.resolvedType}`);
    }
    for (const key of parts ?? [field]) this.bound[key] = { type: 'VARIABLE_ALIAS', id: found.id };
    // A bound variable drives the field's value.
    const collection = this.env.collectionById(found.variableCollectionId);
    const value = collection ? found.valuesByMode[collection.defaultModeId] : undefined;
    // A string bound to the characters is the text, written as characters are (measured §9); a boolean, the visibility.
    if (field === 'characters' && typeof value === 'string') {
      if (!this.env.isFontLoaded(this._fontName))
        throw new Error(`Cannot write to node with unloaded font "${this._fontName.family} ${this._fontName.style}"`);
      this._characters = value;
    }
    if (field === 'visible' && typeof value === 'boolean') this.values.visible = value;
    if (typeof value === 'number') {
      if (field === 'width') this._w = value;
      else if (field === 'height') this._h = value;
      // measured 2026-10-16: a FLOAT bound to opacity is read as a percentage, 55 as 0.55, and 150 is clamped to 1. A literal set on the node is read as written.
      else if (field === 'opacity') this.values[field] = Math.min(1, Math.max(0, value / 100));
      else this.values[field] = value;
      // The parts follow it, as when the field is set.
      if (field === 'cornerRadius') for (const corner of BY_PARTS.cornerRadius) delete this.values[corner];
      if (field === 'strokeWeight') {
        this.values.sideWeightsGiven = true;
        for (const side of BY_PARTS.strokeWeight) this.values[side] = value;
      }
    }
  }

  get explicitVariableModes(): Record<string, string> {
    return { ...this.modes };
  }

  setExplicitVariableModeForCollection(collection: VariableCollection | string, modeId: string): void {
    const id = typeof collection === 'string' ? collection : collection.id;
    this.env.record('node.setExplicitVariableModeForCollection', this.id, id, modeId);
    const found = this.env.collectionById(id);
    if (!found) throw new Error('in setExplicitVariableModeForCollection: collection not found');
    if (!found.modes.some((mode) => mode.modeId === modeId)) {
      throw new Error(`in setExplicitVariableModeForCollection: mode ${modeId} is not in collection ${found.name}`);
    }
    this.modes[id] = modeId;
  }

  // -- text ----------------------------------------------------------------

  get characters(): string {
    return this._characters;
  }
  set characters(value: string) {
    this.write('characters', value);
    // Measured: writing to a node with an unloaded font throws.
    if (!this.env.isFontLoaded(this._fontName)) {
      throw new Error(`Cannot write to node with unloaded font "${this._fontName.family} ${this._fontName.style}"`);
    }
    this._characters = value;
  }
  get fontName(): FontName {
    return this._fontName;
  }
  get textStyleId(): string {
    return this._styleId;
  }
  get textAutoResize(): string {
    return this.plainGet('textAutoResize', 'WIDTH_AND_HEIGHT');
  }
  set textAutoResize(value: 'NONE' | 'HEIGHT' | 'WIDTH_AND_HEIGHT') {
    this.plainSet('textAutoResize', value);
  }

  async setTextStyleIdAsync(styleId: string): Promise<void> {
    this.env.record('node.setTextStyleIdAsync', this.id, styleId);
    const style = this.env.styleById(styleId);
    if (style?.type !== 'TEXT') throw new Error('in setTextStyleIdAsync: text style not found');
    const font = style.fontName as FontName | undefined;
    // unmeasured: whether applying a style whose font is not loaded throws, as writing to the node does
    if (font && !this.env.isFontLoaded(font)) {
      throw new Error(`Cannot write to node with unloaded font "${font.family} ${font.style}"`);
    }
    if (font) this._fontName = font;
    this._styleId = styleId;
  }

  get effectStyleId(): string {
    return this._effectStyleId;
  }
  async setEffectStyleIdAsync(styleId: string): Promise<void> {
    this.env.record('node.setEffectStyleIdAsync', this.id, styleId);
    const style = this.env.styleById(styleId);
    if (style?.type !== 'EFFECT') throw new Error('in setEffectStyleIdAsync: effect style not found');
    this._effectStyleId = styleId;
  }

  // -- text fields (property roster, *Text*; measured §14) -----------------
  // Every setter needs the text's font loaded, as `characters` does (the roster: "Every setter needs the node's fonts
  // loaded first"). unmeasured: the defaults a new text starts with, here Figma's design panel's.

  /** Writes a text field, its font loaded. */
  private textSet(field: string, value: unknown): void {
    this.write(field, value);
    if (!this.env.isFontLoaded(this._fontName)) {
      throw new Error(`Cannot write to node with unloaded font "${this._fontName.family} ${this._fontName.style}"`);
    }
    this.values[field] = value;
    // Measured §14 for a line height: assigning a value removes the binding. unmeasured: that every bindable text field does
    if (field in TEXT_BINDABLE) delete this.bound[field];
  }
  /** A line height or letter spacing as Figma keeps it: its number as float32. unmeasured: that it is kept so, as a variable's numbers are (§1) */
  private metricSet(field: string, value: { unit: string; value?: number }): void {
    if (typeof value !== 'object' || value === null) throw new Error(`in set_${field}: expected an object with a unit`);
    this.textSet(field, value.value === undefined ? { ...value } : { ...value, value: Math.fround(value.value) });
  }
  get fontSize(): number {
    return this.plainGet('fontSize', 12);
  }
  set fontSize(value: number) {
    this.textSet('fontSize', value);
  }
  /** Measured §14: read-only on a text; it follows the style (`Bold` is 700) or a weight axis. */
  get fontWeight(): number {
    return this.plainGet('fontWeight', WEIGHTS[this._fontName.style] ?? 400);
  }
  set fontWeight(_value: number) {
    throw new Error('node.fontWeight: read-only property on TEXT node');
  }
  get lineHeight(): LineHeight {
    return this.plainGet<LineHeight>('lineHeight', { unit: 'AUTO' });
  }
  set lineHeight(value: LineHeight) {
    this.metricSet('lineHeight', value as { unit: string; value?: number });
  }
  get letterSpacing(): LetterSpacing {
    return this.plainGet<LetterSpacing>('letterSpacing', { unit: 'PERCENT', value: 0 });
  }
  set letterSpacing(value: LetterSpacing) {
    this.metricSet('letterSpacing', value);
  }
  get paragraphSpacing(): number {
    return this.plainGet('paragraphSpacing', 0);
  }
  set paragraphSpacing(value: number) {
    this.textSet('paragraphSpacing', value);
  }
  get paragraphIndent(): number {
    return this.plainGet('paragraphIndent', 0);
  }
  set paragraphIndent(value: number) {
    this.textSet('paragraphIndent', value);
  }
  get listSpacing(): number {
    return this.plainGet('listSpacing', 0);
  }
  set listSpacing(value: number) {
    this.textSet('listSpacing', value);
  }
  get textAlignHorizontal(): string {
    return this.plainGet('textAlignHorizontal', 'LEFT');
  }
  set textAlignHorizontal(value: string) {
    this.textSet('textAlignHorizontal', value);
  }
  get textAlignVertical(): string {
    return this.plainGet('textAlignVertical', 'TOP');
  }
  set textAlignVertical(value: string) {
    this.textSet('textAlignVertical', value);
  }
  get textCase(): string {
    return this.plainGet('textCase', 'ORIGINAL');
  }
  set textCase(value: string) {
    this.textSet('textCase', value);
  }
  get textDecoration(): string {
    return this.plainGet('textDecoration', 'NONE');
  }
  set textDecoration(value: string) {
    this.textSet('textDecoration', value);
  }
  get textTruncation(): string {
    return this.plainGet('textTruncation', 'DISABLED');
  }
  set textTruncation(value: string) {
    this.textSet('textTruncation', value);
  }
  get leadingTrim(): string {
    return this.plainGet('leadingTrim', 'NONE');
  }
  set leadingTrim(value: string) {
    this.textSet('leadingTrim', value);
  }
  get maxLines(): number | null {
    return this.plainGet<number | null>('maxLines', null);
  }
  /** Measured §14: below 1 it throws; while `textTruncation` is DISABLED it is dropped, with no error. */
  set maxLines(value: number | null) {
    if (typeof value === 'number' && value < 1)
      throw new Error('in set_maxLines: Property "maxLines" failed validation: Number must be greater than or equal to 1');
    this.textSet('maxLines', this.textTruncation === 'DISABLED' ? null : value);
  }

  /**
   * Binds a text field on a range. Measured §14: the type is checked, a bound line height or letter spacing reads in
   * pixels, `fontStyle` and `fontWeight` move the font, and the node reports the field as an array of aliases.
   * The typings: a new font must be loaded. unmeasured: a range that is not the whole text, which the mock does not
   * keep; and an empty one, which it refuses.
   */
  setRangeBoundVariable(start: number, end: number, field: VariableBindableTextField, variable: Variable | null): void {
    this.env.record('node.setRangeBoundVariable', this.id, start, end, field, variable?.id ?? null);
    if (start !== 0 || end !== this._characters.length) throw new Error('figma mock: a binding on part of a text is not implemented');
    if (start >= end) throw new Error('in setRangeBoundVariable: the range is empty');
    if (!(field in TEXT_BINDABLE)) throw new Error(`in setRangeBoundVariable: Unknown field: '${String(field)}'`);
    if (variable === null) {
      delete this.bound[field];
      return;
    }
    const found = this.env.variableById(variable.id);
    if (!found) throw new Error('in setRangeBoundVariable: variable not found');
    if (found.resolvedType !== TEXT_BINDABLE[field]) {
      throw new Error(`in setBoundVariable: variable of resolved type '${found.resolvedType}' cannot be bound to '${field}'`);
    }
    const value = found.resolveForConsumer(this.proxy).value;
    if (field === 'fontFamily' || field === 'fontStyle') {
      const font = { ...this._fontName, [field === 'fontFamily' ? 'family' : 'style']: String(value) };
      if (!this.env.isFontLoaded(font)) throw new Error(`Cannot write to node with unloaded font "${font.family} ${font.style}"`);
      this._fontName = font;
      delete this.values.fontWeight;
    } else if (field === 'fontWeight') {
      // Measured §14: on Inter 700 is `Bold`; a weight no style has keeps the style and sets the weight axis.
      const style = Object.entries(WEIGHTS).find(([, weight]) => weight === value)?.[0];
      if (style) this._fontName = { ...this._fontName, style };
      this.values.fontWeight = value;
    } else if (field === 'lineHeight' || field === 'letterSpacing') {
      this.values[field] = { unit: 'PIXELS', value };
    } else {
      this.values[field] = value;
    }
    (this.bound as Record<string, unknown>)[field] = [{ type: 'VARIABLE_ALIAS', id: found.id }];
  }

  // -- libraries: keys and publish status (the lock) -----------------------

  get key(): string {
    return publishedKeys.get(this) ?? hexKey(this.id);
  }
  async getPublishStatusAsync(): Promise<PublishStatus> {
    // Measured (§15, second pass): an imported component, set or variant reads `UNPUBLISHED`.
    return this.remote ? 'UNPUBLISHED' : this.env.publishStatus(this.name);
  }

  // -- components, properties, instances -----------------------------------

  get description(): string {
    return this._description;
  }
  set description(value: string) {
    this.plainSet('description', value);
    this._description = value;
  }

  get mainComponent(): ComponentNode | null {
    // Typed: write-only under dynamic-page access.
    if (this.env.documentAccess() === 'dynamic-page') {
      throw new Error('Cannot call with documentAccess: "dynamic-page". Use getMainComponentAsync instead.');
    }
    return (this._main?.proxy as unknown as ComponentNode | undefined) ?? null;
  }
  set mainComponent(value: ComponentNode | null) {
    const main = value === null ? undefined : unwrap(value, 'mainComponent');
    this.env.record('node.set', this.id, 'mainComponent', main?.id ?? null);
    if (main && main.type !== 'COMPONENT') throw new Error('in set_mainComponent: expected a component');
    this._main = main;
  }
  swapComponent(component: ComponentNode): void {
    const main = unwrap(component, 'swapComponent');
    this.env.record('node.swapComponent', this.id, main.id);
    if (main.type !== 'COMPONENT') throw new Error('in swapComponent: expected a component');
    this._main = main;
  }
  async getMainComponentAsync(): Promise<ComponentNode | null> {
    return (this._main?.proxy as unknown as ComponentNode | undefined) ?? null;
  }

  /** What an instance's properties come from: its component, or the set that component is a variant of. */
  private propertyHost(): Impl | undefined {
    const main = this._main;
    if (!main) return undefined;
    return main.isVariant() ? (main.parentRef as Impl) : main;
  }

  /**
   * An instance's properties by key: a variant by its axis, the others by `name#id`, as the component's definitions are keyed.
   * unmeasured: that a slot is not listed here
   */
  get componentProperties(): ComponentProperties {
    const host = this.propertyHost();
    const out: ComponentProperties = {};
    if (!host || !this._main) return out;
    if (host.type === 'COMPONENT_SET') {
      host.assertConsistent('Component set for node has existing errors', 'get_componentProperties');
      const current = parseVariantName(this._main._name);
      for (const [axis, { options }] of host.variantAxes()) out[axis] = { type: 'VARIANT', value: current[axis] ?? options[0] };
    }
    for (const property of host.props) {
      if (property.type === 'SLOT') continue;
      out[keyOf(property)] = { type: property.type, value: this.overrides.get(keyOf(property)) ?? property.defaultValue };
    }
    return out;
  }

  setProperties(properties: { [propertyName: string]: string | boolean | VariableAlias }): void {
    this.env.record('node.setProperties', this.id, properties);
    const host = this.propertyHost();
    if (!host || !this._main) throw new Error('in setProperties: the instance has no main component');
    const present = this.componentProperties;
    let variant = this._main._name;
    for (const [key, value] of Object.entries(properties)) {
      const property = present[key];
      if (!property) throw new Error(`in setProperties: no component property with the key ${key}`);
      if (typeof value === 'object') {
        // Roster, *Instance and component*: a BOOLEAN or a TEXT property takes an alias to a BOOLEAN or a STRING
        // variable. unmeasured: what other types and mismatches throw
        const expects = property.type === 'BOOLEAN' ? 'BOOLEAN' : property.type === 'TEXT' ? 'STRING' : undefined;
        const found = this.env.variableById(value.id);
        if (!found || found.resolvedType !== expects) throw new Error(`in setProperties: ${key} cannot be bound to that variable`);
        continue;
      }
      if (property.type === 'VARIANT') {
        const options = host.variantAxes().get(key)?.options ?? [];
        if (typeof value !== 'string' || !options.includes(value))
          throw new Error(`in setProperties: ${JSON.stringify(value)} is not a value of the variant property ${key}`);
        variant = Object.entries({ ...parseVariantName(variant), [key]: value })
          .map(([axis, v]) => `${axis}=${v}`)
          .join(', ');
      } else if (property.type === 'BOOLEAN' && typeof value !== 'boolean') {
        throw new Error(`in setProperties: ${key} takes a boolean`);
      } else if (property.type === 'TEXT' && typeof value !== 'string') {
        throw new Error(`in setProperties: ${key} takes a string`);
      } else if (property.type === 'INSTANCE_SWAP' && !(typeof value === 'string' && components.has(value))) {
        // Typed: an instance swap's value is the id of a component.
        throw new Error(`in setProperties: ${key} takes the id of a component`);
      }
    }
    // Applied together: a variant that does not exist as a member is refused before any value is kept.
    if (variant !== this._main._name) {
      const next = host.kids.find((kid) => kid._name === variant);
      if (!next) throw new Error(`in setProperties: the component set has no variant ${variant}`);
      this._main = next;
    }
    for (const [key, value] of Object.entries(properties)) {
      if (present[key].type === 'VARIANT') continue;
      if (typeof value === 'object') {
        // Read back in `boundVariables.componentProperties` (roster 173), the property showing the variable's value.
        this.overrides.set(key, this.env.variableById(value.id)!.resolveForConsumer(this.proxy).value as string | boolean);
        const bound = this.bound as unknown as { componentProperties?: Record<string, VariableAlias> };
        bound.componentProperties = { ...bound.componentProperties, [key]: { type: 'VARIABLE_ALIAS', id: value.id } };
      } else {
        this.overrides.set(key, value);
        const bound = this.bound as unknown as { componentProperties?: Record<string, VariableAlias> };
        if (bound.componentProperties) delete bound.componentProperties[key];
      }
    }
  }

  /** True when this component sits in a set: a variant. */
  private isVariant(): boolean {
    return this.type === 'COMPONENT' && this.parentRef instanceof Impl && this.parentRef.type === 'COMPONENT_SET';
  }

  /** The components whose properties this node's references may name: its own, or its set's. */
  private owners(): Impl[] {
    const owners: Impl[] = [];
    for (let up: Impl | MockPage | null = this.parentRef; up instanceof Impl; up = up.parentRef) {
      if (up.type === 'COMPONENT') {
        owners.push(up);
        if (up.parentRef instanceof Impl && up.parentRef.type === 'COMPONENT_SET') owners.push(up.parentRef);
      }
    }
    return owners;
  }

  get componentPropertyReferences(): Record<string, string> | null {
    if (this.owners().length === 0) return null;
    const out: Record<string, string> = {};
    for (const [field, property] of Object.entries(this.refs)) if (property) out[field] = keyOf(property);
    return out;
  }
  set componentPropertyReferences(value: { visible?: string; characters?: string; mainComponent?: string } | null) {
    this.env.record('node.set', this.id, 'componentPropertyReferences', value);
    // Typed: only a component sublayer or an instance sublayer has references.
    const owners = this.owners();
    if (owners.length === 0) {
      throw new Error('in set_componentPropertyReferences: only a sublayer of a component can reference a component property');
    }
    const next: typeof this.refs = {};
    for (const [field, key] of Object.entries(value ?? {})) {
      if (!(field in REFERENCE_TYPE)) throw new Error(`in set_componentPropertyReferences: ${field} cannot be wired to a property`);
      const found = owners.flatMap((o) => o.props).find((p) => keyOf(p) === key);
      if (!found) throw new Error(`in set_componentPropertyReferences: no component property named ${String(key)}`);
      if (found.type !== REFERENCE_TYPE[field as keyof typeof REFERENCE_TYPE]) {
        throw new Error(
          `in set_componentPropertyReferences: ${field} takes a ${REFERENCE_TYPE[field as keyof typeof REFERENCE_TYPE]} property, not a ${found.type}`,
        );
      }
      next[field as keyof typeof next] = found;
    }
    this.refs = next;
  }

  get componentPropertyDefinitions(): ComponentPropertyDefinitions {
    // Measured: reading it on a variant member throws. Read it on the set.
    if (this.isVariant()) {
      throw new Error('Can only get component property definitions of a component set or non-variant component');
    }
    const out: ComponentPropertyDefinitions = {};
    if (this.type === 'COMPONENT_SET') {
      this.assertConsistent('Component set has existing errors', 'get_componentPropertyDefinitions');
      for (const [axis, values] of this.variantAxes()) {
        out[axis] = { type: 'VARIANT', defaultValue: values.default, variantOptions: values.options };
      }
    }
    for (const property of this.props) {
      out[keyOf(property)] = {
        type: property.type,
        defaultValue: property.defaultValue,
        // Typed: a bound default is reported on the definition's `boundVariables`.
        ...(property.defaultVariable ? { boundVariables: { defaultValue: { type: 'VARIABLE_ALIAS', id: property.defaultVariable } } } : {}),
        // Measured: a SLOT with no preferred values reports `preferredValues: []`, not nothing.
        ...(property.preferredValues
          ? { preferredValues: property.preferredValues }
          : property.type === 'SLOT'
            ? { preferredValues: [] }
            : {}),
        ...(property.description !== undefined ? { description: property.description } : {}),
        ...(property.slotSettings ? { slotSettings: property.slotSettings } : {}),
      };
    }
    return out;
  }

  get variantProperties(): Record<string, string> | null {
    return this.isVariant() ? parseVariantName(this._name) : null;
  }

  get variantGroupProperties(): Record<string, { values: string[] }> {
    this.assertConsistent('Component set has existing errors', 'get_variantGroupProperties');
    const out: Record<string, { values: string[] }> = {};
    for (const [axis, { options }] of this.variantAxes()) out[axis] = { values: options };
    return out;
  }

  /**
   * Measured (measured in a real file through use_figma, 2026-10-14): a set whose members' names disagree on axes, or
   * repeat a combination, is broken, and the reads that need its axes throw. Appending the member that breaks it does not.
   */
  assertConsistent(message: string, api: string): void {
    const seen = new Set<string>();
    let axes: string | undefined;
    for (const kid of this.kids) {
      const entries = Object.entries(parseVariantName(kid._name)).sort(([a], [b]) => (a < b ? -1 : 1));
      const here = entries.map(([axis]) => axis).join('\u0000');
      const combination = entries.map(([axis, value]) => `${axis}=${value}`).join('\u0000');
      if ((axes !== undefined && here !== axes) || seen.has(combination)) throw new Error(`in ${api}: ${message}`);
      axes = here;
      seen.add(combination);
    }
  }

  private variantAxes(): Map<string, { default: string; options: string[] }> {
    const axes = new Map<string, { default: string; options: string[] }>();
    const dflt = this.defaultVariantImpl();
    const defaults = dflt ? parseVariantName(dflt._name) : {};
    for (const kid of this.kids) {
      for (const [axis, value] of Object.entries(parseVariantName(kid._name))) {
        const entry = axes.get(axis) ?? { default: defaults[axis] ?? value, options: [] };
        if (!entry.options.includes(value)) entry.options.push(value);
        axes.set(axis, entry);
      }
    }
    return axes;
  }

  private defaultVariantImpl(): Impl | undefined {
    // Measured (measured in a real file through use_figma, 2026-09-29): the default variant is the member of all first values, placed top-left.
    return [...this.kids].sort((a, b) => a._y - b._y || a._x - b._x)[0];
  }
  get defaultVariant(): ComponentNode {
    const found = this.defaultVariantImpl();
    if (!found) throw new Error('in defaultVariant: the component set is empty');
    return found.proxy as unknown as ComponentNode;
  }

  addComponentProperty(
    name: string,
    type: ComponentPropertyType,
    defaultValue: string | boolean | VariableAlias,
    options?: ComponentPropertyOptions,
  ): string {
    this.env.record('node.addComponentProperty', this.id, name, type, defaultValue);
    if (this.isVariant()) throw new Error('Can only add component properties to a component set or non-variant component');
    if (type === 'VARIANT' || type === 'SLOT') {
      // unmeasured: adding VARIANT and SLOT properties directly; the mock takes variants from member names and slots from createSlot()
      throw new Error(`figma mock: addComponentProperty(${type}) is not implemented; use member names or createSlot()`);
    }
    // Roster 174: a default may be an alias, which binds it. unmeasured: what a mismatched type throws, and that the
    // default then reads the variable's value in its default mode
    let defaultVariable: string | undefined;
    if (typeof defaultValue === 'object') {
      const found = this.env.variableById(defaultValue.id);
      if (!found || found.resolvedType !== (type === 'BOOLEAN' ? 'BOOLEAN' : 'STRING'))
        throw new Error('Property "defaultValue" failed validation: the variable does not fit');
      defaultVariable = found.id;
      defaultValue = found.resolveForConsumer(this.proxy).value as string | boolean;
    }
    if (type === 'BOOLEAN' && typeof defaultValue !== 'boolean')
      throw new Error('Property "defaultValue" failed validation: Expected boolean');
    if (type === 'TEXT' && typeof defaultValue !== 'string') throw new Error('Property "defaultValue" failed validation: Expected string');
    if (type === 'INSTANCE_SWAP') {
      // Typed: the default of an instance swap is a component's node id.
      // Measured (measured in a real file through use_figma, 2026-09-29): an instance swap's default is the component's node id.
      const target = typeof defaultValue === 'string' ? components.get(defaultValue) : undefined;
      if (!target || target.removed) {
        throw new Error('Property "defaultValue" failed validation: Expected the id of a component');
      }
    }
    if (options?.description !== undefined || options?.slotSettings !== undefined) {
      throw new Error(`in addComponentProperty: description and slotSettings are only supported for SLOT properties`);
    }
    if (options?.preferredValues && type !== 'INSTANCE_SWAP') {
      throw new Error('in addComponentProperty: preferredValues are only supported for INSTANCE_SWAP and SLOT properties');
    }
    // Measured: a BOOLEAN or VARIANT property named like a slot is renamed silently, `Nav` to `Nav2`.
    const clash = this.props.some((p) => p.type === 'SLOT' && p.name === name);
    const property: Property = {
      id: `${this.env.nextId('')}:0`,
      name: clash && type === 'BOOLEAN' ? `${name}2` : name,
      type,
      defaultValue,
      ...(defaultVariable ? { defaultVariable } : {}),
      ...(options?.preferredValues ? { preferredValues: options.preferredValues } : {}),
    };
    this.props.push(property);
    return keyOf(property);
  }

  editComponentProperty(
    key: string,
    value: {
      name?: string;
      defaultValue?: string | boolean | VariableAlias;
      preferredValues?: InstanceSwapPreferredValue[];
      description?: string;
      slotSettings?: SlotSettings;
    },
  ): string {
    this.env.record('node.editComponentProperty', this.id, key, value);
    if (this.isVariant()) throw new Error('Can only edit component properties of a component set or non-variant component');
    // Measured (measured in a real file through use_figma, 2026-10-14): renaming a VARIANT axis renames it in every member's name.
    if (this.type === 'COMPONENT_SET' && value.name !== undefined && this.variantAxes().has(key)) {
      for (const kid of this.kids) {
        kid._name = kid._name
          .split(', ')
          .map((part) => (part.startsWith(`${key}=`) ? `${value.name}${part.slice(key.length)}` : part))
          .join(', ');
      }
      return value.name;
    }
    const property = this.props.find((p) => keyOf(p) === key);
    if (!property) throw new Error(`in editComponentProperty: no component property named ${key}`);
    // Typed: which edits each property type supports.
    if (value.defaultValue !== undefined && (property.type === 'SLOT' || property.type === 'VARIANT')) {
      throw new Error('in editComponentProperty: defaultValue is not supported for SLOT or VARIANT properties');
    }
    if (value.preferredValues && property.type !== 'INSTANCE_SWAP' && property.type !== 'SLOT') {
      throw new Error('in editComponentProperty: preferredValues are only supported for INSTANCE_SWAP and SLOT properties');
    }
    if ((value.description !== undefined || value.slotSettings) && property.type !== 'SLOT') {
      throw new Error('in editComponentProperty: description and slotSettings are only supported for SLOT properties');
    }
    // unmeasured: that renaming a property leaves every layer that references it wired to it
    if (value.name !== undefined) property.name = value.name;
    if (value.defaultValue !== undefined && typeof value.defaultValue !== 'object') {
      property.defaultValue = value.defaultValue;
      delete property.defaultVariable;
    } else if (value.defaultValue !== undefined) {
      // Roster 174, as `addComponentProperty` takes it.
      const found = this.env.variableById(value.defaultValue.id);
      if (!found) throw new Error('in editComponentProperty: variable not found');
      property.defaultVariable = found.id;
      property.defaultValue = found.resolveForConsumer(this.proxy).value as string | boolean;
    }
    if (value.preferredValues) property.preferredValues = value.preferredValues;
    if (value.description !== undefined) property.description = value.description;
    if (value.slotSettings) property.slotSettings = value.slotSettings;
    return keyOf(property);
  }

  deleteComponentProperty(key: string): void {
    this.env.record('node.deleteComponentProperty', this.id, key);
    if (this.isVariant()) throw new Error('Can only delete component properties of a component set or non-variant component');
    const at = this.props.findIndex((p) => keyOf(p) === key);
    if (at === -1) throw new Error(`in deleteComponentProperty: no component property named ${key}`);
    const [gone] = this.props.splice(at, 1);
    if (gone.type === 'VARIANT') throw new Error('in deleteComponentProperty: a VARIANT property cannot be deleted');
    // unmeasured: what becomes of a slot node whose property is deleted; here it stays, as a slot with no property
    for (const node of descendants(this)) {
      for (const field of Object.keys(node.refs) as (keyof typeof node.refs)[]) if (node.refs[field] === gone) delete node.refs[field];
    }
  }

  createInstance(): InstanceNode {
    this.env.record('createInstance', this.id);
    const instance = makeNode(this.env, 'INSTANCE');
    instance._main = this;
    instance.setInitialName(this._name);
    instance.attachToPage(this.env.currentPage());
    // An instance has a slot for each slot of its component. unmeasured: where it sits, that it is named for the property, and that it starts empty
    for (const property of (this.isVariant() ? (this.parentRef as Impl) : this).props) {
      if (property.type !== 'SLOT') continue;
      const slot = makeNode(this.env, 'SLOT');
      slot.setInitialName(property.name);
      slot.values.clipsContent = true;
      instance.kids.push(slot);
      slot.parentRef = instance;
    }
    return instance.proxy as unknown as InstanceNode;
  }

  createSlot(): SlotNode {
    this.env.record('createSlot', this.id);
    // unmeasured: where createSlot() puts the property on a member that is already in a set: here, on the set
    const host: Impl = this.isVariant() ? (this.parentRef as Impl) : this;
    const slot = makeNode(this.env, 'SLOT');
    // unmeasured: the name a new slot and its property start with
    const taken = new Set(host.props.map((p) => p.name));
    let name = 'Slot';
    for (let n = 2; taken.has(name); n += 1) name = `Slot ${n}`;
    slot.setInitialName(name);
    const property: Property = { id: `${this.env.nextId('')}:0`, name, type: 'SLOT', defaultValue: '', slotNodes: [slot] };
    host.props.push(property);
    // Measured: slots clip by default.
    slot.values.clipsContent = true;
    this.insertAt(this.kids.length, slot, 'appendChild');
    return slot.proxy as unknown as SlotNode;
  }

  // -- combining -----------------------------------------------------------

  /** Makes `members` this set's children, merging their same-named properties. */
  adoptMembers(members: Impl[]): void {
    for (const member of members) {
      member.detach();
      this.kids.push(member);
      member.parentRef = this;
    }
    this.mergeProperties(members);
  }

  private mergeProperties(members: Impl[]): void {
    // Measured (measured in a real file through use_figma, 2026-09-29): same-named properties on the members merge into one property of the set, by name.
    // and type, which member's key survives, and whether the members' references follow. Here the first
    // member's property survives and every reference is repointed to it.
    for (const member of members) {
      for (const property of member.props) {
        const kept = this.props.find((p) => p.name === property.name && p.type === property.type);
        if (!kept) {
          this.props.push(property);
          continue;
        }
        if (kept === property) continue;
        if (property.slotNodes) kept.slotNodes = [...(kept.slotNodes ?? []), ...property.slotNodes];
        for (const node of descendants(member)) {
          for (const field of Object.keys(node.refs) as (keyof typeof node.refs)[])
            if (node.refs[field] === property) node.refs[field] = kept;
        }
      }
      member.props = [];
    }
  }

  // -- internals -----------------------------------------------------------

  /** Records a write, and refuses one to a node that has been removed. */
  private write(field: string, value: unknown): void {
    this.env.record('node.set', this.id, field, value);
    if (this.removed) throw new Error(`The node with id ${this.id} does not exist`);
  }
}

function descendants(root: Impl): Impl[] {
  return root.childImpls().flatMap((kid) => [kid, ...descendants(kid)]);
}

function parseVariantName(name: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of name.split(', ')) {
    const at = part.indexOf('=');
    if (at > 0) out[part.slice(0, at)] = part.slice(at + 1);
  }
  return out;
}

const utf8 = (text: string): number => new TextEncoder().encode(text).length;

/** Every component ever made, by id: an instance swap's default names one, on a page or in a library. */
const components = new Map<string, Impl>();

// -- construction ---------------------------------------------------------------

/** Every member `Impl` exposes, and the kinds it is on: the proxy's whole vocabulary. */
function makeNode(env: SceneEnv, type: Kind): Impl {
  const impl = new Impl(env, type);
  if (type === 'COMPONENT') components.set(impl.id, impl);
  // `this` inside every member is the raw node, never the proxy, so the graph only ever holds raw nodes.
  const proxy = new Proxy(impl, {
    get(target, prop) {
      // Symbols are probed by util.inspect and assertion libraries; `then` by every promise a node is returned
      // through, which is how a node handed back from an async call is tested for being thenable.
      if (typeof prop === 'symbol' || prop === 'then' || prop === 'toJSON') return undefined;
      const kinds = ONLY[prop];
      if (kinds && !kinds.includes(target.type)) {
        throw new Error(`${target.type}.${prop} does not exist: it is not a member of ${target.type} nodes`);
      }
      if (!(prop in target)) {
        throw new Error(
          `node(${target.type}).${prop} is not implemented in the Figma mock. Add it to the mock if the code under test legitimately needs it.`,
        );
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(target, prop, value) {
      if (typeof prop === 'symbol') return false;
      const kinds = ONLY[prop];
      if ((kinds && !kinds.includes(target.type)) || !(prop in target)) {
        // Measured for collections; the same message is Figma's for any property with no setter.
        throw new Error(`no setter for property ${prop}`);
      }
      return Reflect.set(target, prop, value, target);
    },
    has(target, prop) {
      const kinds = typeof prop === 'string' ? ONLY[prop] : undefined;
      return (!kinds || kinds.includes(target.type)) && prop in target;
    },
  }) as unknown as SceneNode;
  impl.proxy = proxy;
  implOf.set(proxy as unknown as object, impl);
  return impl;
}

export interface Scene {
  createFrame(): FrameNode;
  createComponent(): ComponentNode;
  createText(): TextNode;
  createLine(): LineNode;
  combineAsVariants(nodes: readonly ComponentNode[], parent: BaseNode & ChildrenMixin, index?: number): ComponentSetNode;
  appendToPage(page: MockPage, child: SceneNode): void;
  /** `figma.root.findAllWithCriteria`. */
  findAllWithCriteria(criteria: { types?: string[]; sharedPluginData?: { namespace: string; keys?: string[] } }): SceneNode[];
  /** `page.findAllWithCriteria`, the page's own nodes. */
  findAllWithCriteriaOnPage(
    page: MockPage,
    criteria: { types?: string[]; sharedPluginData?: { namespace: string; keys?: string[] } },
  ): SceneNode[];
  /** Makes a component that a library has published, importable by `key`. */
  publishComponent(key: string, name: string): void;
  importComponentByKey(key: string): ComponentNode;
  /** A component set a library has published, with its variants, each importable by its own key too. */
  publishComponentSet(key: string, name: string, variants: { key: string; name: string }[]): void;
  importComponentSetByKey(key: string): ComponentSetNode;
  /** A component that already lives on a page, as a fixture. */
  addComponent(name: string, page: MockPage): ComponentNode;
}

export function createScene(env: SceneEnv): Scene {
  const published = new Map<string, Impl>();
  const onCurrentPage = <N extends SceneNode>(impl: Impl): N => {
    impl.attachToPage(env.currentPage());
    return impl.proxy as unknown as N;
  };

  const everything = (): Impl[] =>
    env.pages().flatMap((page) =>
      page.nodes.flatMap((top) => {
        const impl = implOf.get(top as never);
        return impl ? [impl, ...descendants(impl)] : [];
      }),
    );

  return {
    createFrame() {
      env.record('createFrame');
      return onCurrentPage<FrameNode>(makeNode(env, 'FRAME'));
    },
    createComponent() {
      env.record('createComponent');
      return onCurrentPage<ComponentNode>(makeNode(env, 'COMPONENT'));
    },
    createText() {
      env.record('createText');
      return onCurrentPage<TextNode>(makeNode(env, 'TEXT'));
    },
    createLine() {
      env.record('createLine');
      return onCurrentPage<LineNode>(makeNode(env, 'LINE'));
    },
    combineAsVariants(nodes, parent, index) {
      env.record(
        'combineAsVariants',
        nodes.map((n) => n.id),
        parent.id,
        index,
      );
      if (nodes.length === 0) throw new Error('in combineAsVariants: the list of nodes must be non-empty');
      const members = nodes.map((node) => unwrap(node, 'combineAsVariants'));
      // Typed, and measured: combineAsVariants takes components and nothing else.
      const wrong = members.find((m) => m.type !== 'COMPONENT');
      if (wrong) throw new Error(`in combineAsVariants: ${wrong.type} ${wrong.id} is not a component`);
      const set = makeNode(env, 'COMPONENT_SET');
      // unmeasured: the name a new set starts with
      set.setInitialName(members[0].name);
      const page = env.pages().find((p) => p.id === parent.id);
      if (page) set.attachToPage(page);
      else unwrap(parent, 'combineAsVariants').appendChild(set.proxy);
      set.adoptMembers(members);
      // unmeasured: the set's origin, size and how members are offset once combined
      const left = Math.min(...members.map((m) => m.x));
      const top = Math.min(...members.map((m) => m.y));
      for (const member of members) {
        member.x -= left;
        member.y -= top;
      }
      set.x = left;
      set.y = top;
      set.resizeWithoutConstraints(Math.max(...members.map((m) => m.x + m.width)), Math.max(...members.map((m) => m.y + m.height)));
      return set.proxy as unknown as ComponentSetNode;
    },
    appendToPage(page, child) {
      env.record('node.appendChild', page.id, (child as { id: string }).id);
      unwrap(child, 'appendChild').attachToPage(page);
    },
    findAllWithCriteriaOnPage(page, criteria) {
      return page.nodes
        .flatMap((top) => {
          const impl = implOf.get(top as never);
          return impl ? [impl, ...descendants(impl)] : [];
        })
        .filter((impl) => !criteria.types || criteria.types.includes(impl.type))
        .filter(
          (impl) => !criteria.sharedPluginData || impl.hasSharedData(criteria.sharedPluginData.namespace, criteria.sharedPluginData.keys),
        )
        .map((impl) => impl.proxy);
    },
    findAllWithCriteria(criteria) {
      // Typed, and measured in the plugin: on the document, only after loadAllPagesAsync() under dynamic-page access.
      if (env.documentAccess() === 'dynamic-page' && !env.allPagesLoaded()) {
        throw new Error(
          'in findAllWithCriteria: Cannot call with documentAccess: dynamic-page without calling figma.loadAllPagesAsync() first.',
        );
      }
      return everything()
        .filter((impl) => !criteria.types || criteria.types.includes(impl.type))
        .filter(
          (impl) => !criteria.sharedPluginData || impl.hasSharedData(criteria.sharedPluginData.namespace, criteria.sharedPluginData.keys),
        )
        .map((impl) => impl.proxy);
    },
    publishComponent(key, name) {
      const impl = makeNode(env, 'COMPONENT');
      impl.setInitialName(name);
      impl.remote = true;
      publishedKeys.set(impl, key);
      published.set(key, impl);
    },
    importComponentByKey(key) {
      env.record('importComponentByKeyAsync', key);
      const found = published.get(key);
      // Measured (§15): an unpublished key and one that never existed fail alike.
      if (found?.type !== 'COMPONENT') throw new Error(`Component with key "${key}" not found`);
      return found.proxy as unknown as ComponentNode;
    },
    // -- Libraries: a published set, and importing one (the lock) --
    publishComponentSet(key, name, variants) {
      const members = variants.map((variant) => {
        const member = makeNode(env, 'COMPONENT');
        member.setInitialName(variant.name);
        member.remote = true;
        publishedKeys.set(member, variant.key);
        published.set(variant.key, member);
        return member;
      });
      const set = makeNode(env, 'COMPONENT_SET');
      set.setInitialName(name);
      set.remote = true;
      set.adoptMembers(members);
      publishedKeys.set(set, key);
      published.set(key, set);
      // unmeasured: whether an imported library variant has its set as its parent, as here
    },
    importComponentSetByKey(key) {
      env.record('importComponentSetByKeyAsync', key);
      const found = published.get(key);
      if (found?.type !== 'COMPONENT_SET') throw new Error(`Component set with key "${key}" not found`);
      return found.proxy as unknown as ComponentSetNode;
    },
    addComponent(name, page) {
      const impl = makeNode(env, 'COMPONENT');
      impl.setInitialName(name);
      impl.attachToPage(page);
      return impl.proxy as unknown as ComponentNode;
    },
  };
}

/** The mock's own view of a node, for assertions: never handed to the code under test. */
export function inspect(node: unknown): {
  id: string;
  type: Kind;
  parentId: string | undefined;
  index: number;
  childIds: string[];
  cell: { row: number; column: number } | undefined;
} {
  const impl = unwrap(node, 'inspect');
  const parent = impl.parentImpl();
  return {
    id: impl.id,
    type: impl.type,
    parentId: parent?.id,
    index: impl.indexInParent(),
    childIds: impl.childImpls().map((kid) => kid.id),
    cell: impl.gridCell(),
  };
}

// -- The typed check ------------------------------------------------------------
//
// Every member `Impl` declares must exist on some real node type. Internal
// helpers are named here so they are a decision, not an accident.

type Internal =
  | 'proxy'
  | 'removed'
  | 'remote'
  | 'indexInParent'
  | 'parentImpl'
  | 'childImpls'
  | 'attachToPage'
  | 'hasSharedData'
  | 'adoptMembers'
  | 'setInitialName'
  | 'gridCell'
  | 'assertConsistent';
type Real =
  | keyof FrameNode
  | keyof ComponentNode
  | keyof ComponentSetNode
  | keyof TextNode
  | keyof LineNode
  | keyof InstanceNode
  | keyof SlotNode;
export type UnknownMembers = Exclude<keyof Impl, Real | Internal>;
const noUnknownMembers: [UnknownMembers] extends [never] ? true : never = true;
void noUnknownMembers;
