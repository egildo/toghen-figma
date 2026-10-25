/**
 * FigCraft's file in Figma's words, and Figma's operations in FigCraft's: the two translations the FigCraft target needs.
 *
 * FigCraft's variables are Figma's model, spelled its own way: `variable.list` answers collections with mode ids, values
 * per mode id, aliases, scopes and code syntax, with types in lower case; `style.list` answers each style's value, in
 * snake case. So the plans read FigCraft through the same shapes they read Figma through, a style's fields included,
 * which its stamp's receipt hashes, and each plan operation becomes one or a few FigCraft commands. Nothing here talks to
 * FigCraft; `figcraft.ts` does, and this module is tested without it (specs.md, *The command line*, *FigCraft*).
 */

import type { Operation, StyleBinding } from '../shared/operations.js';

/** A FigCraft command, as `engine.execute` and `command.batch` take it. `{"$step": n}` in params stands for step n's `id`. */
export interface Step {
  command: string;
  params: Record<string, unknown>;
}

export interface FcCollection {
  id: string;
  name: string;
  modes: { id: string; name: string }[];
}

export interface FcVariable {
  id: string;
  name: string;
  collection: string;
  resolvedType: 'color' | 'number' | 'string' | 'boolean';
  values: Record<string, { type: string; value: unknown }>;
  scopes?: string[];
  codeSyntax?: { WEB?: string };
  description?: string;
}

export interface FcStyle {
  id: string;
  name: string;
  type: 'text' | 'effect' | 'paint' | 'grid';
  /** The style's fields that follow a variable, by FigCraft's field name: `fontSize`, `effects/0/radius`. */
  bound?: Record<string, string>;
  /** A text style's value. A bound field lists the variable's value. */
  style?: FcText;
  effects?: FcEffect[];
  paints?: FcPaint[];
}

/** A length as `style.list` gives one. */
interface FcLength {
  unit: 'pixels' | 'percent' | 'auto';
  value?: number;
}

interface FcText {
  font_family: string;
  font_style: string;
  font_size: number;
  line_height: FcLength;
  letter_spacing: FcLength;
  case: string;
  decoration: string;
}

interface FcEffect {
  type: string;
  color: RGBA;
  offset: [number, number];
  radius: number;
  spread: number;
  visible: boolean;
  blend: string;
  show_behind?: boolean;
}

export interface FcPaint {
  type: string;
  kind?: string;
  stops?: { color: RGBA; position: number }[];
  from?: [number, number];
  to?: [number, number];
  opacity?: number;
  visible?: boolean;
  blend?: string;
}

export interface FcListing {
  collections: FcCollection[];
  variables: FcVariable[];
  styles: FcStyle[];
}

const FIGMA_TYPE = { color: 'COLOR', number: 'FLOAT', string: 'STRING', boolean: 'BOOLEAN' } as const;
const FC_TYPE: Partial<Record<VariableResolvedDataType, FcVariable['resolvedType']>> = {
  COLOR: 'color',
  FLOAT: 'number',
  STRING: 'string',
  BOOLEAN: 'boolean',
};

/** The file as the plans read Figma: collections, variables and local styles, with only the fields they read. */
export interface FigmaView {
  collections: Pick<VariableCollection, 'id' | 'name' | 'modes' | 'defaultModeId' | 'variableIds'>[];
  variables: Pick<
    Variable,
    'id' | 'name' | 'variableCollectionId' | 'resolvedType' | 'valuesByMode' | 'scopes' | 'codeSyntax' | 'description'
  >[];
  /** A style with the fields `reportOf` reads, as Figma reports them: what its stamp's receipt hashes. */
  styles: ({ id: string; name: string; type: 'TEXT' | 'EFFECT' | 'PAINT' | 'GRID' } & Record<string, unknown>)[];
  /**
   * A library's copies in the file, as Figma gives an imported variable or style: `remote`, keyed by their id, which is
   * `<library id>:<asset id>`. Found by id, never listed as the file's own.
   */
  copies?: Pick<FigmaView, 'collections' | 'variables' | 'styles'>;
}

/**
 * A library's copy, which `variable.list` and `style.list` list beside the file's own once a layer uses a library's
 * variable or style: its id carries the library's id (`294b4f2d88c18a6e:VariableID:1`, `294b4f2d88c18a6e:S:1`), a
 * copied collection's mode ids do not (measured 23 October 2026).
 */
export const fromLibrary = (id: string): boolean => /^[0-9a-f]{16}:/.test(id);

/**
 * The file as the plans read it: its own collections, variables and styles, as Figma's `getLocal…` lists them, never a
 * library's; and apart, a library's copies, as Figma's imported ones.
 */
export function figmaView(all: FcListing): FigmaView {
  const part = (library: boolean): FcListing => ({
    collections: all.collections.filter((c) => fromLibrary(c.id) === library),
    variables: all.variables.filter((v) => fromLibrary(v.id) === library),
    styles: all.styles.filter((style) => fromLibrary(style.id) === library),
  });
  const copies = shaped(part(true));
  const remote = <T extends { id: string }>(object: T): T => Object.assign(object, { remote: true, key: object.id });
  return {
    ...shaped(part(false)),
    copies: { collections: copies.collections.map(remote), variables: copies.variables.map(remote), styles: copies.styles.map(remote) },
  };
}

/** A listing in Figma's shapes. */
function shaped(listing: FcListing): Omit<FigmaView, 'copies'> {
  const collections = listing.collections.map((collection) => ({
    id: collection.id,
    name: collection.name,
    modes: collection.modes.map((mode) => ({ modeId: mode.id, name: mode.name })),
    defaultModeId: collection.modes[0]?.id ?? '',
    variableIds: listing.variables.filter((variable) => variable.collection === collection.id).map((variable) => variable.id),
  }));
  const variables = listing.variables.map((variable) => ({
    id: variable.id,
    name: variable.name,
    variableCollectionId: variable.collection,
    resolvedType: FIGMA_TYPE[variable.resolvedType],
    valuesByMode: Object.fromEntries(
      Object.entries(variable.values).map(([mode, held]): [string, VariableValue] => [
        mode,
        held.type === 'alias' ? { type: 'VARIABLE_ALIAS', id: String(held.value) } : (held.value as VariableValue),
      ]),
    ),
    // A variable FigCraft lists without scopes is offered to every field, as Figma's default is.
    scopes: (variable.scopes ?? ['ALL_SCOPES']) as VariableScope[],
    codeSyntax: variable.codeSyntax?.WEB !== undefined ? { WEB: variable.codeSyntax.WEB } : {},
    description: variable.description ?? '',
  }));
  const styles = listing.styles.map((style) => ({
    id: style.id,
    name: style.name,
    type: style.type.toUpperCase() as FigmaView['styles'][number]['type'],
    ...reported(style),
  }));
  return { collections, variables, styles };
}

/** FigCraft's camel case as Figma's upper snake case: `dropShadow` is `DROP_SHADOW`, `smallCaps` is `SMALL_CAPS`. */
const figmaWord = (word: string): string => word.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase();

const aliasOf = (id: string): VariableAlias => ({ type: 'VARIABLE_ALIAS', id });

/** A length as Figma reports one. */
function lengthOf(held: FcLength): { unit: 'AUTO' } | { unit: 'PIXELS' | 'PERCENT'; value: number } {
  return held.unit === 'auto' ? { unit: 'AUTO' } : { unit: held.unit === 'percent' ? 'PERCENT' : 'PIXELS', value: held.value ?? 0 };
}

/**
 * Figma's gradient transform from the ramp's ends. Toghen writes a rotation about the layer's centre and nothing else
 * (`angleToLinearTransform`), so the gradient's square is taken as a square: its second side is its first turned a
 * quarter. The inverse of `throughInverse`, for the two points `paintsValue` writes.
 */
export function transformOf(paint: FcPaint): Transform {
  const [fx, fy] = paint.from ?? [0, 0.5];
  const [tx, ty] = paint.to ?? [1, 0.5];
  // The square's sides in the layer: a linear ramp runs from its left middle, the others from its centre.
  const linear = paint.kind === 'linear';
  const [a, b] = linear ? [tx - fx, ty - fy] : [2 * (tx - fx), 2 * (ty - fy)];
  const [c, d] = [-b, a];
  const [ox, oy] = linear ? [fx - 0.5 * c, fy - 0.5 * d] : [fx - 0.5 * (a + c), fy - 0.5 * (b + d)];
  const det = a * d - b * c;
  return [
    [d / det, -c / det, (c * oy - d * ox) / det],
    [-b / det, a / det, (b * ox - a * oy) / det],
  ];
}

/** The fields `reportOf` reads, from what `style.list` gives: a text style's value, an effect style's shadows, a paint style's gradients. */
function reported(style: FcStyle): Record<string, unknown> {
  const bound = Object.entries(style.bound ?? {});
  if (style.style) {
    const text = style.style;
    return {
      fontName: { family: text.font_family, style: text.font_style },
      fontSize: text.font_size,
      lineHeight: lengthOf(text.line_height),
      letterSpacing: lengthOf(text.letter_spacing),
      textCase: figmaWord(text.case),
      textDecoration: figmaWord(text.decoration),
      boundVariables: Object.fromEntries(bound.filter(([field]) => !field.includes('/')).map(([field, id]) => [field, aliasOf(id)])),
    };
  }
  if (style.effects) {
    return {
      effects: style.effects.map((effect, index) => ({
        type: figmaWord(effect.type),
        color: effect.color,
        offset: { x: effect.offset[0], y: effect.offset[1] },
        radius: effect.radius,
        spread: effect.spread,
        visible: effect.visible,
        blendMode: figmaWord(effect.blend),
        ...(effect.show_behind !== undefined ? { showShadowBehindNode: effect.show_behind } : {}),
        boundVariables: Object.fromEntries(
          bound
            .filter(([field]) => field.startsWith(`effects/${index}/`))
            .map(([field, id]) => [field.slice(`effects/${index}/`.length), aliasOf(id)]),
        ),
      })),
    };
  }
  if (style.paints) {
    return {
      paints: style.paints.map((paint) =>
        paint.type === 'gradient' && paint.kind
          ? {
              type: `GRADIENT_${figmaWord(paint.kind)}`,
              gradientStops: (paint.stops ?? []).map((stop) => ({ position: stop.position, color: stop.color })),
              gradientTransform: transformOf(paint),
              opacity: paint.opacity ?? 1,
              visible: paint.visible ?? true,
              blendMode: figmaWord(paint.blend ?? 'normal'),
            }
          : { type: figmaWord(paint.type) },
      ),
    };
  }
  return {};
}

/** What an operation becomes in FigCraft: its steps, run as one batch, and the id the run records for it. */
export interface Translation {
  steps: Step[];
  /** The id of what the operation made or changed, from the steps' results. */
  idOf(results: unknown[]): string | undefined;
}

const idAt =
  (index: number) =>
  (results: unknown[]): string | undefined => {
    const id = (results[index] as { id?: unknown } | undefined)?.id;
    return id === undefined ? undefined : String(id);
  };
const fixed = (id: string | undefined) => (): string | undefined => id;

/** A value as `variable.set` takes it: a colour as `{r, g, b, a}` in 0–1, as Figma holds it, and an alias as `{alias}`. */
function valueFor(value: VariableValue): unknown {
  if (typeof value === 'object' && value !== null && 'type' in value && value.type === 'VARIABLE_ALIAS') return { alias: value.id };
  return value;
}

/** A length as FigCraft's text fields take one: a number in pixels, or a percentage. */
function length(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const { unit, value: amount } = value as { unit?: string; value?: number };
  if (unit === 'AUTO') return 'auto';
  if (unit === 'PERCENT') return `${amount}%`;
  return amount;
}

/** Figma's text style properties in FigCraft's spelling. Case and decoration are `case` and `decoration` in a style's value. */
function textValue(props: Record<string, unknown>): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  if (typeof props.fontFamily === 'string') value.fontFamily = props.fontFamily;
  if (typeof props.fontStyle === 'string') value.fontStyle = props.fontStyle;
  if (typeof props.fontSize === 'number') value.fontSize = props.fontSize;
  if (props.lineHeight !== undefined) value.lineHeight = length(props.lineHeight);
  if (props.letterSpacing !== undefined) value.letterSpacing = length(props.letterSpacing);
  if (typeof props.textCase === 'string') value.case = props.textCase === 'SMALL_CAPS' ? 'smallCaps' : props.textCase.toLowerCase();
  if (typeof props.textDecoration === 'string') value.decoration = props.textDecoration.toLowerCase();
  return value;
}

const EFFECT_TYPE: Record<string, string> = {
  DROP_SHADOW: 'dropShadow',
  INNER_SHADOW: 'innerShadow',
  LAYER_BLUR: 'layerBlur',
  BACKGROUND_BLUR: 'backgroundBlur',
};

/** Figma's effects in FigCraft's spelling: a shadow whole, a layer blur by its radius. */
export function effectsValue(props: Record<string, unknown>): unknown[] {
  return ((props.effects as Effect[] | undefined) ?? []).map((effect) => {
    if (effect.type === 'LAYER_BLUR') return { type: 'layerBlur', radius: effect.radius, visible: effect.visible };
    if (effect.type !== 'DROP_SHADOW' && effect.type !== 'INNER_SHADOW')
      throw new Error(`FigCraft target: an effect of ${effect.type} is not translated.`);
    return {
      type: EFFECT_TYPE[effect.type],
      color: effect.color,
      offset: [effect.offset.x, effect.offset.y],
      radius: effect.radius,
      spread: effect.spread ?? 0,
      visible: effect.visible,
      blend: 'normal',
    };
  });
}

const GRADIENT_KIND: Record<string, string> = {
  GRADIENT_LINEAR: 'linear',
  GRADIENT_RADIAL: 'radial',
  GRADIENT_ANGULAR: 'angular',
  GRADIENT_DIAMOND: 'diamond',
};

/**
 * Where a layer-space point lands under the inverse of Figma's gradient transform. Figma's transform takes the layer's
 * unit square to the gradient's, whose ramp runs from (0, ½) to (1, ½); FigCraft takes the ramp's ends in the layer.
 */
function throughInverse(transform: Transform, x: number, y: number): [number, number] {
  const [[a, b, c], [d, e, f]] = transform;
  const det = a * e - b * d;
  const px = x - c;
  const py = y - f;
  return [(e * px - b * py) / det, (a * py - d * px) / det];
}

/** Figma's gradients in FigCraft's spelling: a style's paints, and a layer's, which `node.set` takes alike (measured 23 October 2026). */
export function paintsValue(props: Record<string, unknown>): unknown[] {
  return ((props.paints as Paint[] | undefined) ?? []).map((paint) => {
    const kind = GRADIENT_KIND[paint.type];
    if (!kind || !('gradientStops' in paint)) throw new Error(`FigCraft target: a paint style of ${paint.type} is not translated.`);
    // A linear ramp runs along the middle of the gradient's square; the others start at its centre.
    const start = kind === 'linear' ? throughInverse(paint.gradientTransform, 0, 0.5) : throughInverse(paint.gradientTransform, 0.5, 0.5);
    return {
      type: 'gradient',
      kind,
      stops: paint.gradientStops.map((stop) => ({ color: stop.color, position: stop.position })),
      from: start,
      to: throughInverse(paint.gradientTransform, 1, 0.5),
      opacity: paint.opacity ?? 1,
      visible: paint.visible ?? true,
      blend: 'normal',
    };
  });
}

/**
 * A style binding's field in FigCraft's words, or nothing when FigCraft binds no such field. FigCraft binds a text
 * style's family and style, not its weight; a weight stays written into the style's font style, as an unbound value.
 */
function boundField(styleType: 'TEXT' | 'EFFECT' | 'PAINT', binding: StyleBinding): string | undefined {
  if (styleType === 'TEXT') return binding.field === 'fontWeight' ? undefined : binding.field;
  if (styleType === 'EFFECT') return `effects/${binding.index ?? 0}/${binding.field}`;
  return undefined;
}

function styleValue(styleType: 'TEXT' | 'EFFECT' | 'PAINT', props: Record<string, unknown>): unknown {
  if (styleType === 'TEXT') return textValue(props);
  if (styleType === 'EFFECT') return effectsValue(props);
  return paintsValue(props);
}

const binds = (style: unknown, styleType: 'TEXT' | 'EFFECT' | 'PAINT', bindings: readonly StyleBinding[] = []): Step[] =>
  bindings.flatMap((binding) => {
    const field = boundField(styleType, binding);
    return field === undefined ? [] : [{ command: 'style.bind', params: { style, field, variable: binding.variableId } }];
  });

/**
 * One operation as FigCraft commands. `held` is the style an `UPDATE_STYLE` changes, as FigCraft lists it: its
 * bound fields are let go before the new value is written, since a field that stays bound ignores the value.
 */
export function translate(op: Operation, held?: FcStyle): Translation {
  switch (op.kind) {
    case 'CREATE_COLLECTION':
      if (op.modes.length === 0) throw new Error(`CREATE_COLLECTION requires at least one mode: ${op.name}`);
      return { steps: [{ command: 'variable.createCollection', params: { name: op.name, modes: op.modes } }], idOf: idAt(0) };
    case 'ADD_MODE':
      return {
        steps: [{ command: 'variable.addMode', params: { collection: op.collectionId, name: op.modeName } }],
        idOf: fixed(op.collectionId),
      };
    case 'DELETE_MODE':
      return {
        steps: [{ command: 'variable.removeMode', params: { collection: op.collectionId, mode: op.modeId } }],
        idOf: fixed(op.collectionId),
      };
    case 'DELETE_VARIABLE':
      return { steps: [{ command: 'variable.delete', params: { variable: op.variableId } }], idOf: fixed(op.variableId) };
    case 'CREATE_VARIABLE':
      if (!FC_TYPE[op.variableType]) throw new Error(`FigCraft has no ${op.variableType} variables.`);
      return {
        steps: [
          { command: 'variable.create', params: { collection: op.collectionId, name: op.path, type: FC_TYPE[op.variableType] } },
          ...(op.scopes ? [{ command: 'variable.update', params: { variable: { $step: 0 }, scopes: op.scopes } }] : []),
        ],
        idOf: idAt(0),
      };
    case 'SET_VARIABLE_SCOPES':
      return {
        steps: [{ command: 'variable.update', params: { variable: op.variableId, scopes: op.scopes } }],
        idOf: fixed(op.variableId),
      };
    case 'SET_VARIABLE_VALUE':
      return {
        steps: [{ command: 'variable.set', params: { variable: op.variableId, mode: op.modeId, value: valueFor(op.value) } }],
        idOf: fixed(op.variableId),
      };
    case 'RENAME_VARIABLE':
      return { steps: [{ command: 'variable.update', params: { variable: op.variableId, name: op.name } }], idOf: fixed(op.variableId) };
    case 'SET_CODE_SYNTAX':
      return {
        steps: [{ command: 'variable.update', params: { variable: op.variableId, codeSyntax: { [op.platform]: op.value } } }],
        idOf: fixed(op.variableId),
      };
    case 'CREATE_STYLE':
      return {
        steps: [
          {
            command: 'style.create',
            params: { type: op.styleType.toLowerCase(), name: op.name, value: styleValue(op.styleType, op.props) },
          },
          ...binds({ $step: 0 }, op.styleType, op.bindings),
        ],
        idOf: idAt(0),
      };
    case 'UPDATE_STYLE': {
      if (!held) throw new Error(`Style not found: ${op.styleId}`);
      const styleType = held.type.toUpperCase() as 'TEXT' | 'EFFECT' | 'PAINT';
      if (styleType !== 'TEXT' && styleType !== 'EFFECT' && styleType !== 'PAINT') throw new Error(`Unsupported style type: ${held.type}`);
      return {
        steps: [
          ...Object.keys(held.bound ?? {}).map((field) => ({ command: 'style.bind', params: { style: op.styleId, field } })),
          { command: 'style.update', params: { style: op.styleId, value: styleValue(styleType, op.props) } },
          ...binds(op.styleId, styleType, op.bindings),
        ],
        idOf: fixed(op.styleId),
      };
    }
    case 'BIND_VARIABLE':
    case 'UNBIND_VARIABLE':
    case 'APPLY_TOKEN':
      throw new Error('Binding layers is not built for FigCraft yet; the FigCraft target syncs variables and styles.');
    // Nothing to write in the file: the stamp goes into the record (`figcraftRecord.ts`).
    case 'STAMP':
      return { steps: [], idOf: fixed(op.id) };
    case 'SKIP':
    case 'WARNING':
    case 'BREAKING':
    case 'NOTE':
    case 'SWAP_COMPONENT':
      throw new Error(`No executor for operation kind: ${op.kind}`);
    default: {
      const _exhaustive: never = op;
      throw new Error(`Unhandled operation kind: ${String(_exhaustive)}`);
    }
  }
}
