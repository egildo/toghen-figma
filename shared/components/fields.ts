/**
 * The field vocabulary: which fields each kind of layer takes, and what kind of
 * value each field holds.
 *
 * Field names are the Plugin API's own, uppercase enums included, so nothing here
 * is a rename. One table serves the reader (what may this node say), the
 * validator (does a rule's patch fit the layer it addresses) and, later, the
 * Figma-side engine (which fields a layer has set).
 */

import type { LayerKind } from './model.js';

export const LAYER_KINDS: readonly LayerKind[] = ['FRAME', 'SLOT', 'TEXT', 'INSTANCE', 'LINE'];

export const PROPERTY_TYPES = ['VARIANT', 'BOOLEAN', 'TEXT', 'INSTANCE_SWAP', 'SLOT'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

/**
 * What a field's value looks like in the file.
 *
 * - `boolean`, `string`, `component`: plain, or a `(property)` wire (see `wires`); `visible` and `characters` also take a
 *   token reference, whose `boolean` or `string` variable is bound.
 * - `dimension`: a token or a `(literal)` number. A bare number is refused.
 * - `size`: a dimension, or `#null` to clear it.
 * - `token`: a token reference only: a style (`textStyle`, `effectStyle`), or, where the field's token binds, a variable
 *   (`fontFamily`, `fontStyle`, `fontWeight`).
 * - `group`: a token reference naming a group; `tokens=`, which the reader turns into the
 *   bindings the group's keys imply (`bindings.ts`) and then drops.
 * - `angle`: a plain number, degrees as Figma takes them; no token type holds one.
 * - `enum`: one of `options`.
 * - `paints`, `tracks`, `placement`, `modes`, `set`: structured, written as child nodes.
 * - `effects`, `grids`: structured, written as child nodes: a list of shadow and blur tokens, a list of layout grids.
 * - `dashes`: a child node whose arguments are one token reference (a `strokeStyle`), or `(literal)` lengths, or none.
 * - `constraints`: a child node, `constraints horizontal=… vertical=…`, both given.
 */
export type ValueKind =
  | 'boolean'
  | 'string'
  | 'component'
  | 'dimension'
  | 'size'
  | 'angle'
  | 'token'
  | 'enum'
  | 'group'
  | 'paints'
  | 'tracks'
  | 'placement'
  | 'modes'
  | 'set'
  | 'effects'
  | 'grids'
  | 'dashes'
  | 'constraints';

/**
 * How a variable is bound to a field: the roster's Bind column (`.reference/figma/property_roster.md`).
 *
 * - `call`: the Plugin API call that binds it. `field` is `setBoundVariable`; `paint` is `setBoundVariableForPaint`;
 *   `effect`, `grid`, `text` and `property` are `setBoundVariableForEffect`, `setBoundVariableForLayoutGrid`, a
 *   whole-text `setRangeBoundVariable` and `setProperties` with an alias. `text` binds the text fields; the others no
 *   field uses yet.
 * - `field`: the name that call takes.
 * - `scope`: the scopes whose pickers offer a variable for it, or, where a text differs, one list for a text and
 *   one for every other layer (a fill).
 * - `parts`: the fields Figma reports the binding on instead of this one, on a layer that has them.
 */
export interface TokenBinding {
  call: 'field' | 'paint' | 'effect' | 'grid' | 'text' | 'property';
  field: string;
  variable: VariableResolvedDataType;
  scope?: readonly VariableScope[] | { readonly text: readonly VariableScope[]; readonly other: readonly VariableScope[] };
  parts?: readonly string[];
}

/**
 * How a token reaches a field: the roster's Bind and Token columns. `types` are the token types it carries. With
 * `bind`, the token's variable is bound. Without it, a field whose value is `token` names a style (`textStyle`,
 * `effectStyle`), and any other is written as the token's resolved value (`x`, `y`, `cornerSmoothing`, `dashPattern`).
 */
export interface FieldToken {
  types: readonly string[];
  bind?: TokenBinding;
}

export interface FieldSpec {
  nodes: readonly LayerKind[];
  value: ValueKind;
  options?: readonly string[];
  /** The property type a `(property)` value must name, when the field can be wired. */
  wires?: PropertyType;
  /** How a token reaches the field; absent, the field takes no token. */
  token?: FieldToken;
}

const ALL = LAYER_KINDS;
const CONTAINER: readonly LayerKind[] = ['FRAME', 'SLOT'];
/** The kinds that carry a fill, and name a group: everything but an instance. */
const STYLED: readonly LayerKind[] = ['FRAME', 'SLOT', 'TEXT'];
/** A line has a length (`width`) and no height. */
const HEIGHT: readonly LayerKind[] = ['FRAME', 'SLOT', 'TEXT', 'INSTANCE'];
/** The kinds that take a stroke. */
const STROKED: readonly LayerKind[] = ['FRAME', 'SLOT', 'LINE'];
const SIZING = ['FIXED', 'HUG', 'FILL'] as const;
/** The frame kinds, which take a layout grid. */
const FRAMES: readonly LayerKind[] = ['FRAME', 'SLOT', 'INSTANCE'];
/** How a grid child sits in its cell. */
const IN_CELL = ['MIN', 'CENTER', 'MAX', 'AUTO'] as const;
/** Figma's `BlendMode`. */
const BLEND_MODES = [
  'PASS_THROUGH',
  'NORMAL',
  'DARKEN',
  'MULTIPLY',
  'LINEAR_BURN',
  'COLOR_BURN',
  'LIGHTEN',
  'SCREEN',
  'LINEAR_DODGE',
  'COLOR_DODGE',
  'OVERLAY',
  'SOFT_LIGHT',
  'HARD_LIGHT',
  'DIFFERENCE',
  'EXCLUSION',
  'HUE',
  'SATURATION',
  'COLOR',
  'LUMINOSITY',
] as const;
/** Figma's `StrokeCap`. */
const STROKE_CAPS = [
  'NONE',
  'ROUND',
  'SQUARE',
  'ARROW_LINES',
  'ARROW_EQUILATERAL',
  'DIAMOND_FILLED',
  'TRIANGLE_FILLED',
  'CIRCLE_FILLED',
] as const;

/** The corners `cornerRadius` sets, and the sides `strokeWeight` sets: Figma reports either's binding on these. */
const CORNERS = ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'];
const SIDES = ['strokeTopWeight', 'strokeRightWeight', 'strokeBottomWeight', 'strokeLeftWeight'];

/** A field bound with `setBoundVariable` to a FLOAT variable under its own name. */
const float = (field: string, scope: VariableScope, types: readonly string[] = ['dimension'], parts?: readonly string[]): FieldToken => ({
  types,
  bind: { call: 'field', field, variable: 'FLOAT', scope: [scope], ...(parts ? { parts } : {}) },
});

const dimensions = (names: string[], scope: VariableScope): Record<string, FieldSpec> =>
  names.reduce<Record<string, FieldSpec>>((table, name) => {
    table[name] = { nodes: CONTAINER, value: 'dimension', token: float(name, scope) };
    return table;
  }, {});

const sizes = (names: string[], nodes: readonly LayerKind[]): Record<string, FieldSpec> =>
  names.reduce<Record<string, FieldSpec>>((table, name) => {
    table[name] = { nodes, value: 'size', token: float(name, 'WIDTH_HEIGHT') };
    return table;
  }, {});

// ---------------------------------------------------------------------------
// Text fields: the roster's text rows (`property_roster.md`, *Text*)
// ---------------------------------------------------------------------------

/** A text field bound on the whole text, `setRangeBoundVariable(0, length, …)`: Figma reports it as an array of aliases. */
const wholeText = (field: string, variable: VariableResolvedDataType, scope: VariableScope, types: readonly string[]): FieldToken => ({
  types,
  bind: { call: 'text', field, variable, scope: [scope] },
});
const TEXT_ONLY: readonly LayerKind[] = ['TEXT'];

/**
 * The fields of a text beyond its characters, style and sizing. `fontFamily`, `fontStyle` and `fontWeight` take a token
 * only: a font's halves are bound, and `fontWeight` cannot be assigned (measured §14). A line height or letter spacing
 * binds in pixels only (measured §14), so one in another unit is written as its value. `listSpacing` and `maxLines`
 * cannot be bound.
 */
export const TEXT_FIELDS: Readonly<Record<string, FieldSpec>> = {
  fontFamily: { nodes: TEXT_ONLY, value: 'token', token: wholeText('fontFamily', 'STRING', 'FONT_FAMILY', ['fontFamily', 'string']) },
  fontStyle: { nodes: TEXT_ONLY, value: 'token', token: wholeText('fontStyle', 'STRING', 'FONT_STYLE', ['string']) },
  fontWeight: { nodes: TEXT_ONLY, value: 'token', token: wholeText('fontWeight', 'FLOAT', 'FONT_WEIGHT', ['fontWeight', 'number']) },
  fontSize: { nodes: TEXT_ONLY, value: 'dimension', token: wholeText('fontSize', 'FLOAT', 'FONT_SIZE', ['dimension']) },
  lineHeight: { nodes: TEXT_ONLY, value: 'dimension', token: wholeText('lineHeight', 'FLOAT', 'LINE_HEIGHT', ['dimension', 'number']) },
  letterSpacing: {
    nodes: TEXT_ONLY,
    value: 'dimension',
    token: wholeText('letterSpacing', 'FLOAT', 'LETTER_SPACING', ['dimension', 'letterSpacing']),
  },
  paragraphSpacing: {
    nodes: TEXT_ONLY,
    value: 'dimension',
    token: wholeText('paragraphSpacing', 'FLOAT', 'PARAGRAPH_SPACING', ['dimension']),
  },
  paragraphIndent: {
    nodes: TEXT_ONLY,
    value: 'dimension',
    token: wholeText('paragraphIndent', 'FLOAT', 'PARAGRAPH_INDENT', ['dimension']),
  },
  listSpacing: { nodes: TEXT_ONLY, value: 'dimension', token: { types: ['dimension'] } },
  maxLines: { nodes: TEXT_ONLY, value: 'dimension', token: { types: ['number'] } },
  textAlignHorizontal: { nodes: TEXT_ONLY, value: 'enum', options: ['LEFT', 'CENTER', 'RIGHT', 'JUSTIFIED'] },
  textAlignVertical: { nodes: TEXT_ONLY, value: 'enum', options: ['TOP', 'CENTER', 'BOTTOM'] },
  textCase: { nodes: TEXT_ONLY, value: 'enum', options: ['ORIGINAL', 'UPPER', 'LOWER', 'TITLE', 'SMALL_CAPS', 'SMALL_CAPS_FORCED'] },
  textDecoration: { nodes: TEXT_ONLY, value: 'enum', options: ['NONE', 'UNDERLINE', 'STRIKETHROUGH'] },
  textTruncation: { nodes: TEXT_ONLY, value: 'enum', options: ['DISABLED', 'ENDING'] },
  leadingTrim: { nodes: TEXT_ONLY, value: 'enum', options: ['CAP_HEIGHT', 'NONE'] },
};

/** The text fields a text style also sets: one beside `textStyle` would be a second source for one value, and is refused. */
export const STYLE_TEXT_FIELDS: readonly string[] = [
  'fontFamily',
  'fontStyle',
  'fontWeight',
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'paragraphSpacing',
  'paragraphIndent',
  'listSpacing',
  'textCase',
  'textDecoration',
  'leadingTrim',
];

/** A field that names a style: a `token` field whose token is not bound. */
export const namesStyle = (spec: FieldSpec | undefined): boolean => spec?.value === 'token' && !spec.token?.bind;

/** A line height and a letter spacing bind in pixels only: whether one is bound or written as its value depends on its token. */
export const PIXELS_ONLY_FIELDS: readonly string[] = ['lineHeight', 'letterSpacing'];

export const FIELDS: Readonly<Record<string, FieldSpec>> = {
  visible: {
    nodes: ALL,
    value: 'boolean',
    wires: 'BOOLEAN',
    token: { types: ['boolean'], bind: { call: 'field', field: 'visible', variable: 'BOOLEAN' } },
  },
  opacity: { nodes: ALL, value: 'dimension', token: float('opacity', 'OPACITY', ['number']) },
  modes: { nodes: ALL, value: 'modes' },
  grid: { nodes: ALL, value: 'placement' },
  layoutSizingHorizontal: { nodes: ALL, value: 'enum', options: SIZING },
  layoutSizingVertical: { nodes: ALL, value: 'enum', options: SIZING },
  ...sizes(['width', 'minWidth', 'maxWidth'], ALL),
  ...sizes(['height', 'minHeight', 'maxHeight'], HEIGHT),
  rotation: { nodes: ALL, value: 'angle' },

  // `SLOT` may not be a grid; that is checked where the layer's kind is known,
  // so a patch that makes a slot a grid is caught in the member it produces.
  layoutMode: { nodes: CONTAINER, value: 'enum', options: ['NONE', 'HORIZONTAL', 'VERTICAL', 'GRID'] },
  primaryAxisAlignItems: {
    nodes: CONTAINER,
    value: 'enum',
    options: ['MIN', 'MAX', 'CENTER', 'SPACE_BETWEEN', 'SPACE_EVENLY', 'SPACE_AROUND'],
  },
  counterAxisAlignItems: { nodes: CONTAINER, value: 'enum', options: ['MIN', 'MAX', 'CENTER', 'BASELINE'] },
  ...dimensions(['itemSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'gridRowGap', 'gridColumnGap'], 'GAP'),
  ...dimensions(SIDES, 'STROKE_FLOAT'),
  cornerRadius: { nodes: CONTAINER, value: 'dimension', token: float('cornerRadius', 'CORNER_RADIUS', ['dimension'], CORNERS) },
  ...dimensions(CORNERS, 'CORNER_RADIUS'),
  strokeWeight: { nodes: STROKED, value: 'dimension', token: float('strokeWeight', 'STROKE_FLOAT', ['dimension'], SIDES) },
  gridRowSizes: { nodes: CONTAINER, value: 'tracks' },
  gridColumnSizes: { nodes: CONTAINER, value: 'tracks' },
  clipsContent: { nodes: CONTAINER, value: 'boolean' },
  fills: {
    nodes: STYLED,
    value: 'paints',
    token: {
      types: ['color', 'gradient'],
      bind: { call: 'paint', field: 'color', variable: 'COLOR', scope: { text: ['TEXT_FILL'], other: ['FRAME_FILL', 'SHAPE_FILL'] } },
    },
  },
  strokes: {
    nodes: STROKED,
    value: 'paints',
    token: { types: ['color', 'gradient'], bind: { call: 'paint', field: 'color', variable: 'COLOR', scope: ['STROKE_COLOR'] } },
  },
  effectStyle: { nodes: CONTAINER, value: 'token', token: { types: ['shadow'] } },

  characters: {
    nodes: ['TEXT'],
    value: 'string',
    wires: 'TEXT',
    token: { types: ['string'], bind: { call: 'field', field: 'characters', variable: 'STRING', scope: ['TEXT_CONTENT'] } },
  },
  textStyle: { nodes: ['TEXT'], value: 'token', token: { types: ['typography'] } },
  textAutoResize: { nodes: ['TEXT'], value: 'enum', options: ['NONE', 'HEIGHT', 'WIDTH_AND_HEIGHT'] },
  ...TEXT_FIELDS,

  component: { nodes: ['INSTANCE'], value: 'component', wires: 'INSTANCE_SWAP' },
  // A component file only: the instance's own properties are listed on the component's instances.
  isExposedInstance: { nodes: ['INSTANCE'], value: 'boolean' },

  tokens: { nodes: STYLED, value: 'group' },

  // The values of an instance's properties, by display name.
  set: { nodes: ['INSTANCE'], value: 'set' },

  // Wrap, a grid child's alignment, position, appearance and strokes: the roster's sections 3 to 7. Where the format
  // narrows the roster: the wrap fields and `cornerSmoothing` are on FRAME and SLOT, as the other auto-layout and corner
  // fields are; the stroke fields are on the kinds that take `strokes`; `strokeCap` is on a LINE only, since a frame's
  // outline has no open end to cap.
  layoutWrap: { nodes: CONTAINER, value: 'enum', options: ['NO_WRAP', 'WRAP'] },
  counterAxisAlignContent: { nodes: CONTAINER, value: 'enum', options: ['AUTO', 'SPACE_BETWEEN'] },
  counterAxisSpacing: { nodes: CONTAINER, value: 'dimension', token: float('counterAxisSpacing', 'GAP') },
  gridChildHorizontalAlign: { nodes: ALL, value: 'enum', options: IN_CELL },
  gridChildVerticalAlign: { nodes: ALL, value: 'enum', options: IN_CELL },
  layoutPositioning: { nodes: ALL, value: 'enum', options: ['AUTO', 'ABSOLUTE'] },
  // `options` are what each axis takes: Figma's `ConstraintType`.
  constraints: { nodes: ALL, value: 'constraints', options: ['MIN', 'CENTER', 'MAX', 'STRETCH', 'SCALE'] },
  // Measured: not bindable (`Unknown field`), so a token is written as its value.
  x: { nodes: ALL, value: 'dimension', token: { types: ['dimension'] } },
  y: { nodes: ALL, value: 'dimension', token: { types: ['dimension'] } },
  blendMode: { nodes: ALL, value: 'enum', options: BLEND_MODES },
  cornerSmoothing: { nodes: CONTAINER, value: 'dimension', token: { types: ['number'] } },
  strokeAlign: { nodes: STROKED, value: 'enum', options: ['INSIDE', 'OUTSIDE', 'CENTER'] },
  strokeCap: { nodes: ['LINE'], value: 'enum', options: STROKE_CAPS },
  strokeJoin: { nodes: STROKED, value: 'enum', options: ['MITER', 'BEVEL', 'ROUND'] },
  dashPattern: { nodes: STROKED, value: 'dashes', token: { types: ['strokeStyle'] } },

  // Effects and layout grids (unit 4). Each binds by parts: a shadow's five fields and a blur's radius
  // (`SHADOW_FIELDS`), a grid's fields as its alignment allows (`GRID_FIELDS`). `field` and `variable` name the case
  // the parts share; a shadow's colour is a COLOR, scope `EFFECT_COLOR`. No scope names a layout grid.
  effects: {
    nodes: ALL,
    value: 'effects',
    token: { types: ['shadow', 'dimension'], bind: { call: 'effect', field: 'radius', variable: 'FLOAT', scope: ['EFFECT_FLOAT'] } },
  },
  layoutGrids: {
    nodes: FRAMES,
    value: 'grids',
    token: { types: ['number', 'dimension', 'color'], bind: { call: 'grid', field: 'count', variable: 'FLOAT' } },
  },
};

/**
 * The fields Apply can put one token of `type` on, in the table's order: those whose token column takes the type, on a
 * frame (Apply reads an instance and a component definition as one). A style field, effects and layout grids are left
 * out: a component file writes those, part by part. The Apply pane offers these when its query names one token.
 */
export const applyFieldsFor = (type: string): string[] =>
  Object.keys(FIELDS).filter((name) => {
    const spec = FIELDS[name];
    return (
      !!spec.token?.types.includes(type) &&
      spec.nodes.includes('FRAME') &&
      !namesStyle(spec) &&
      spec.value !== 'effects' &&
      spec.value !== 'grids'
    );
  });

/** Fields written as a child node of the layer rather than as a KDL property. */
export const isStructured = (spec: FieldSpec): boolean =>
  spec.value === 'paints' ||
  spec.value === 'tracks' ||
  spec.value === 'placement' ||
  spec.value === 'modes' ||
  spec.value === 'set' ||
  spec.value === 'dashes' ||
  spec.value === 'constraints' ||
  spec.value === 'effects' ||
  spec.value === 'grids';

/** The fields that only make sense in a grid, and those that only make sense outside one. */
export const GRID_ONLY_FIELDS = ['gridRowSizes', 'gridColumnSizes', 'gridRowGap', 'gridColumnGap'] as const;
export const NOT_IN_GRID_FIELDS = ['primaryAxisAlignItems', 'counterAxisAlignItems', 'itemSpacing'] as const;
/** The fields of a wrapping flow: only on a frame whose layoutMode is HORIZONTAL or VERTICAL (measured: WRAP throws on any other). */
export const WRAP_FIELDS = ['layoutWrap', 'counterAxisAlignContent', 'counterAxisSpacing'] as const;
/** The fields that align a child in its cell: only on a child of a grid. */
export const GRID_CHILD_FIELDS = ['gridChildHorizontalAlign', 'gridChildVerticalAlign'] as const;

/** The fields written as a child node: the vocabulary tells kdlet, which then hands them over as a list or a structure. */
export const STRUCTURED_FIELDS: readonly string[] = Object.keys(FIELDS).filter((name) => isStructured(FIELDS[name]));

// ---------------------------------------------------------------------------
// Effects and layout grids (unit 4)
// ---------------------------------------------------------------------------

/**
 * A shadow token's members, by the effect field each is bound to with `setBoundVariableForEffect`: all five bind on a
 * drop and an inner shadow (measured §14). A layer blur binds `radius` only.
 */
export const SHADOW_FIELDS = { color: 'color', offsetX: 'offsetX', offsetY: 'offsetY', blur: 'radius', spread: 'spread' } as const;

/** The patterns of a layout grid, as the Plugin API names them: columns, rows, and a square grid. */
export const GRID_PATTERNS = ['COLUMNS', 'ROWS', 'GRID'] as const;
export const GRID_ALIGNMENTS = ['MIN', 'MAX', 'STRETCH', 'CENTER'] as const;

/**
 * The fields a layout grid takes, by its alignment, or `GRID` for a square grid: those `setBoundVariableForLayoutGrid`
 * binds (measured §14: `STRETCH` refuses `sectionSize`, `CENTER` refuses `offset`, `MIN` binds `sectionSize`, a square
 * grid binds `sectionSize` only). `MAX` is taken to be `MIN`'s mirror. // unmeasured: MAX
 */
export const GRID_FIELDS: Readonly<Record<string, readonly string[]>> = {
  STRETCH: ['count', 'gutterSize', 'offset'],
  CENTER: ['count', 'gutterSize', 'sectionSize'],
  MIN: ['count', 'gutterSize', 'offset', 'sectionSize'],
  MAX: ['count', 'gutterSize', 'offset', 'sectionSize'],
  GRID: ['sectionSize'],
};
