/**
 * The one place a field that carries a token is written, and read back.
 *
 * The rule, as `specs.md` says it once: a token goes on any field; it is bound where Figma can bind it (the field
 * table's `bind`); it is written as its resolved value where Figma cannot; and a written value follows one context
 * only, the declared defaults, said once per run and field in the report. A literal is written as given.
 */

import { FIELDS, GRID_FIELDS, PIXELS_ONLY_FIELDS, namesStyle } from '../../shared/components/fields.js';
import type { Layer, LayoutGridRecord, Value } from '../../shared/components/model.js';
import type { Step } from '../../shared/components/steps.js';
import { boundIdOf } from '../utils/boundVariables.js';
import type { Build } from './apply.js';
import type { Composite, Resolved } from './resolve.js';

/** What writing a field came to. */
export type FieldWrite =
  | { how: 'bound'; variable: Variable }
  /** A token on a field, or part of one, Figma cannot bind: its value, in this context. */
  | { how: 'value'; context: string }
  /** A style made from the token, applied. */
  | { how: 'style' }
  /** A literal. */
  | { how: 'plain' };

/** A number as Figma keeps it: float32. */
export const f32 = (value: unknown): unknown => (typeof value === 'number' ? Math.fround(value) : (value ?? null));

/** A colour token's alpha at the declared defaults, from the core; 1 when the core gives none. */
export function alphaOf(resolved: Resolved, path: string): number {
  return (resolved.valueOf(path)?.value as RGBA | undefined)?.a ?? 1;
}

function hexPaint(hex: string): SolidPaint {
  const channel = (at: number): number => parseInt(hex.slice(at, at + 2), 16) / 255;
  // A paint's colour carries no alpha: opacity is the paint's own.
  return { type: 'SOLID', color: { r: channel(1), g: channel(3), b: channel(5) }, opacity: hex.length === 9 ? channel(7) : 1 };
}

/** Says, once per run and field, that a value was written and will not follow its token. */
/**
 * The report's line for a field of a layer that is written, wholly or in part, as a token's value: once per run, field
 * and layer, in a dry run as in a real one. Undefined when nothing of it is.
 */
export function valueLine(component: string, resolved: Resolved, layer: Layer, field: string): string | undefined {
  const spec = FIELDS[field];
  const value = layer.fields[field];
  if (!spec?.token || value === undefined) return undefined;
  let what: string | undefined;
  let path = '';
  let context: string | undefined;
  // The root layer is the component itself, and is named once.
  const where = layer.address === component ? layer.address : `${component}/${layer.address}`;
  if (spec.token.bind?.call === 'text' && (value as Value).kind === 'token') {
    // A line height or letter spacing that is not in pixels is written as its value; a font stack binds its first family.
    path = (value as { path: string }).path;
    const written = resolved.textValue(field, path);
    if (written) [what, context] = ['the token', written.context];
    const stack = field === 'fontFamily' ? resolved.stack(path) : undefined;
    if (stack) {
      const rest = stack
        .slice(1)
        .map((family) => `"${family}"`)
        .join(', ');
      return `"${field}" of "${where}": {${path}} is a font stack, and its variable holds the first family, "${stack[0]}"; ${rest} ${stack.length === 2 ? 'is' : 'are'} not used`;
    }
  } else if (spec.token.bind?.call === 'paint') {
    const translucent = (value as Value[]).find((paint) => paint.kind === 'token' && alphaOf(resolved, paint.path) < 1);
    if (translucent?.kind === 'token') [what, path] = ["the colour's alpha", translucent.path];
  } else if (spec.value === 'dashes') {
    // A dash pattern is a list, which holds a token only alone.
    const [dash] = value as Value[];
    if (dash?.kind === 'token') [what, path] = ['the token', dash.path];
  } else if (!spec.token.bind && spec.value !== 'token' && (value as Value).kind === 'token') {
    [what, path] = ['the token', (value as { path: string }).path];
  }
  // Unit 4: a gradient or a shadow whose parts Figma cannot bind, and a layout grid's colour.
  if (what === undefined && (spec.value === 'paints' || spec.value === 'effects')) {
    for (const part of value as Value[]) {
      const composite = part.kind === 'token' ? resolved.composite(part.path) : undefined;
      if (!composite || composite.written.length === 0) continue;
      [what, context] = [
        `part of the ${composite.paint ? 'gradient' : 'shadow'} "{${(part as { path: string }).path}}" (${composite.written.join(', ')})`,
        composite.context,
      ];
      break;
    }
  } else if (what === undefined && spec.value === 'grids') {
    const colour = (value as LayoutGridRecord[]).find((grid) => grid.color?.kind === 'token')?.color;
    if (colour?.kind === 'token') [what, path] = ["a grid's colour", colour.path];
  }
  if (what === undefined) return undefined;
  return `"${field}" of "${where}": ${what} is written as its value in "${context ?? resolved.valueOf(path)!.context}"; it will not follow the token until the next run`;
}

/** The lines a dry run's steps would say as they write: every field of a layer they create, and the fields they patch. */
export function plannedValueLines(component: string, resolved: Resolved, steps: Step[]): string[] {
  const lines = new Set<string>();
  const add = (layer: Layer, fields: string[], deep: boolean): void => {
    for (const field of fields) {
      const line = valueLine(component, resolved, layer, field);
      if (line) lines.add(line);
    }
    if (deep) for (const child of layer.children) add(child, Object.keys(child.fields), true);
  };
  for (const step of steps) {
    if (step.kind === 'CREATE_SET') for (const member of step.members) add(member.tree, Object.keys(member.tree.fields), true);
    else if (step.kind === 'CREATE_ARTBOARD' || step.kind === 'CREATE_MEMBER')
      add(step.member.tree, Object.keys(step.member.tree.fields), true);
    else if (step.kind === 'CREATE_LAYER' || step.kind === 'REPLACE_LAYER') add(step.layer, Object.keys(step.layer.fields), false);
    else if (step.kind === 'PATCH_LAYER') add(step.layer, step.fields, false);
  }
  return [...lines];
}

const STYLES: Record<string, (node: SceneNode, build: Build, path: string) => Promise<void>> = {
  textStyle: (node, build, path) => (node as TextNode).setTextStyleIdAsync(build.resolved.textStyle(path).id),
  effectStyle: (node, build, path) => (node as BlendMixin).setEffectStyleIdAsync(build.resolved.effectStyle(path).id),
};

/** Writes one field of a layer, as the field table says a token reaches it. */
export async function writeField(build: Build, node: SceneNode, layer: Layer, field: string): Promise<FieldWrite> {
  const spec = FIELDS[field];
  const target = node as unknown as Record<string, unknown>;
  const line = valueLine(build.spec.name, build.resolved, layer, field);
  if (line && !build.warnings.includes(line)) build.warnings.push(line);

  if (spec.token?.bind?.call === 'paint') {
    let written: FieldWrite = { how: 'plain' };
    target[field] = (layer.fields[field] as Value[]).map((paint) => {
      if (paint.kind !== 'token') return hexPaint(String((paint as { value: string }).value));
      const composite = build.resolved.composite(paint.path);
      if (composite?.paint) {
        written = compositeWrite(build.resolved, composite, written);
        return gradientPaint(build.resolved, composite);
      }
      const variable = build.resolved.color(paint.path);
      // Measured: a paint bound again on an existing node keeps the colour it was given, and Figma draws that, so it is given the variable's.
      const { r, g, b } = variable.resolveForConsumer(node).value as RGBA;
      // Measured: a paint's opacity does not bind (§14), so a colour's alpha is written as the paint's opacity, at the defaults.
      const alpha = alphaOf(build.resolved, paint.path);
      const solid: SolidPaint = alpha < 1 ? { type: 'SOLID', color: { r, g, b }, opacity: alpha } : { type: 'SOLID', color: { r, g, b } };
      if (alpha < 1) written = { how: 'value', context: build.resolved.valueOf(paint.path)!.context };
      else if (written.how === 'plain') written = { how: 'bound', variable };
      // Measured: setBoundVariableForPaint returns a new paint; the fills are the returned copy.
      return figma.variables.setBoundVariableForPaint(solid, 'color', variable);
    });
    return written;
  }

  if (spec.value === 'effects') {
    let written: FieldWrite = { how: 'plain' };
    const bind: Bind<Effect> = (effect, part, variable) =>
      figma.variables.setBoundVariableForEffect(effect, part as VariableBindableEffectField, variable);
    const effects: Effect[] = [];
    for (const effect of layer.fields.effects as Value[]) {
      if (effect.kind !== 'token') {
        effects.push(literalBlur(Number((effect as { value: number }).value)));
        continue;
      }
      const composite = build.resolved.composite(effect.path)!;
      written = compositeWrite(build.resolved, composite, written);
      effects.push(...effectsOf(build.resolved, composite, bind));
    }
    target.effects = effects;
    return written;
  }
  if (spec.value === 'grids') {
    const records = layer.fields.layoutGrids as LayoutGridRecord[];
    const bind: Bind<LayoutGrid> = (grid, part, variable) =>
      figma.variables.setBoundVariableForLayoutGrid(grid, part as VariableBindableLayoutGridField, variable);
    // A bound field starts at the number its variable gives this node, as a paint starts at its colour.
    target.layoutGrids = records.map((record) =>
      layoutGridOf(build.resolved, record, bind, (variable) => variable.resolveForConsumer(node).value as number),
    );
    const colour = records.find((record) => record.color?.kind === 'token')?.color;
    if (colour?.kind === 'token') return { how: 'value', context: build.resolved.valueOf(colour.path)!.context };
    for (const record of records) {
      for (const field of GRID_FIELDS[record.pattern === 'GRID' ? 'GRID' : record.alignment!]) {
        const part = record[field as 'count'];
        if (part?.kind === 'token') return { how: 'bound', variable: build.resolved.float(part.path) };
      }
    }
    return { how: 'plain' };
  }
  if (spec.value === 'dashes') {
    // Measured: not bindable (`Unknown field`). A strokeStyle token is written as its dash array, at the defaults.
    const dashes = layer.fields[field] as Value[];
    if (dashes[0]?.kind === 'token') {
      const { value: resolved, context } = build.resolved.valueOf(dashes[0].path)!;
      target[field] = resolved;
      return { how: 'value', context };
    }
    target[field] = dashes.map((dash) => (dash as { value: number }).value);
    return { how: 'plain' };
  }

  const value = layer.fields[field] as Value;
  if (value.kind === 'token' && namesStyle(spec)) {
    await STYLES[field](node, build, value.path);
    return { how: 'style' };
  }
  if (spec.token?.bind?.call === 'text') return writeTextField(build, node as TextNode, field, value);
  if (value.kind === 'token' && spec.token?.bind) {
    const variable = build.resolved.variable(value.path);
    (node as unknown as { setBoundVariable(f: VariableBindableNodeField, v: Variable): void }).setBoundVariable(
      spec.token.bind.field as VariableBindableNodeField,
      variable,
    );
    return { how: 'bound', variable };
  }
  if (value.kind === 'token') {
    // A field Figma cannot bind: resolve() refused the run unless the core gave the value.
    const { value: resolved, context } = build.resolved.valueOf(value.path)!;
    target[field] = resolved;
    return { how: 'value', context };
  }
  if (value.kind === 'literal') target[field] = value.value;
  else if (value.kind === 'plain' && value.value === null) target[field] = null;
  return { how: 'plain' };
}

/**
 * A text field: bound on the whole text, since Figma binds a text field per range (`setRangeBoundVariable`); a line
 * height or letter spacing not in pixels written as its value instead, and a literal one taken as pixels.
 */
function writeTextField(build: Build, text: TextNode, field: string, value: Value): FieldWrite {
  const target = text as unknown as Record<string, unknown>;
  if (value.kind === 'token') {
    const written = build.resolved.textValue(field, value.path);
    if (written) {
      target[field] = written.value;
      return { how: 'value', context: written.context };
    }
    const variable = build.resolved.variable(value.path);
    // unmeasured: what an empty text takes; a range needs at least one character
    text.setRangeBoundVariable(0, text.characters.length, field as VariableBindableTextField, variable);
    return { how: 'bound', variable };
  }
  if (value.kind === 'literal') target[field] = PIXELS_ONLY_FIELDS.includes(field) ? { unit: 'PIXELS', value: value.value } : value.value;
  return { how: 'plain' };
}

/** A text field's value as Figma keeps it: a number, and the number in a line height or letter spacing, as float32. */
function keptText(value: unknown): unknown {
  if (typeof value === 'object' && value !== null && typeof (value as { value?: unknown }).value === 'number') {
    return { ...(value as object), value: f32((value as { value: number }).value) };
  }
  return f32(value);
}

/**
 * What Figma reports for a paint: a bound paint as its variable only (ruling 8a). Its opacity is left out: the colour's
 * alpha is the variable's, which a target paints in the layer's mode (FigCraft) or Toghen writes at the defaults
 * (Figma), so it is not something the file says. A receipt that held the opacity is taken again, with no write.
 */
export function reportedPaint(paint: Paint): unknown {
  const bound = (paint as SolidPaint).boundVariables?.color;
  if (bound) return { variable: bound.id };
  if (paint.type.startsWith('GRADIENT_')) return reportedGradient(paint as GradientPaint);
  if (paint.type !== 'SOLID') return { type: paint.type };
  return { color: [paint.color.r, paint.color.g, paint.color.b].map(f32), opacity: f32(paint.opacity ?? 1) };
}

/**
 * What Figma reports now for one field of a node, as the receipt compares it: a paint per paint, a style by its id,
 * and a field bound by its parts (`cornerRadius`, `strokeWeight`) as bound when every part names one variable.
 * Parts bound apart read as `{ variable: null }`, which the file's value never leaves: a hand edit.
 */
export function reportField(node: SceneNode, field: string): unknown {
  const read = node as unknown as Record<string, unknown>;
  const spec = FIELDS[field];
  if (spec?.token?.bind?.call === 'paint') {
    const paints = read[field];
    return Array.isArray(paints) ? paints.map(reportedPaint) : null;
  }
  if (spec?.value === 'effects' || spec?.value === 'grids') {
    const parts = read[field];
    return Array.isArray(parts) ? parts.map(spec.value === 'effects' ? reportedEffect : reportedGrid) : null;
  }
  if (namesStyle(spec)) return read[`${field}Id`];
  if (spec?.value === 'dashes') return (read[field] as number[]).map(f32);
  const bound = boundIdOf((node as unknown as { boundVariables?: Record<string, unknown> }).boundVariables ?? {}, field);
  if (bound !== undefined) return { variable: bound };
  if (spec?.token?.bind?.call === 'text') {
    // A font's halves have no getter of their own: they are the halves of `fontName`.
    const font = (node as TextNode).fontName as FontName;
    return keptText(field === 'fontFamily' ? font.family : field === 'fontStyle' ? font.style : read[field]);
  }
  return f32(read[field]);
}

/** What the file's value of a text field would leave in the receipt, as `reportField` reads it: undefined for a field that is not one. */
export function expectedText(resolved: Resolved, field: string, value: Value): unknown {
  if (FIELDS[field]?.token?.bind?.call !== 'text') return undefined;
  if (value.kind === 'token') {
    const written = resolved.textValue(field, value.path);
    return written ? keptText(written.value) : { variable: resolved.variable(value.path).id };
  }
  const given = (value as { value: unknown }).value;
  return keptText(PIXELS_ONLY_FIELDS.includes(field) ? { unit: 'PIXELS', value: given } : given);
}

// ---------------------------------------------------------------------------
// Gradients, effects and layout grids (unit 4)
// ---------------------------------------------------------------------------

/** Binds one part of a Figma object: the Plugin API's helper when writing, `withAlias` for the receipt's expected side. */
export type Bind<T> = (target: T, part: string, variable: Variable) => T;

const aliasOf = (variable: Variable): VariableAlias => ({ type: 'VARIABLE_ALIAS', id: variable.id });

/** What the binding helpers return: a copy of the object with the alias in its `boundVariables`. */
export const withAlias = <T>(target: T, part: string, variable: Variable): T =>
  ({ ...target, boundVariables: { ...(target as { boundVariables?: object }).boundVariables, [part]: aliasOf(variable) } }) as T;

/** What writing a composite token comes to, after what the field's earlier parts came to: written as a value wins, then bound. */
function compositeWrite(resolved: Resolved, composite: Composite, before: FieldWrite): FieldWrite {
  if (composite.written.length > 0) return { how: 'value', context: composite.context };
  const [part, path] = Object.entries(composite.bound)[0] ?? [];
  if (before.how !== 'plain' || path === undefined) return before;
  return { how: 'bound', variable: part.endsWith('.color') ? resolved.color(path) : resolved.float(path) };
}

/**
 * A gradient token's paint, each stop whose colour follows a token bound by writing the alias into the stop: the
 * helper refuses a gradient, and the alias in the stop reads back bound (measured §14). Positions and the transform are
 * the core's at the declared defaults.
 */
export function gradientPaint(resolved: Resolved, composite: Composite): GradientPaint {
  const paint = composite.paint!;
  const gradientStops = paint.gradientStops.map((stop, index) => {
    const path = composite.bound[`${index}.color`];
    return path === undefined ? stop : { ...stop, boundVariables: { color: aliasOf(resolved.color(path)) } };
  });
  return { ...paint, gradientStops };
}

/** A shadow's or a blur's effects, each part that follows a token bound with `bind`. */
export function effectsOf(resolved: Resolved, composite: Composite, bind: Bind<Effect>): Effect[] {
  return composite.effects!.map((effect, index) => {
    let out = effect;
    for (const [part, path] of Object.entries(composite.bound)) {
      const [at, name] = part.split('.');
      if (Number(at) === index) out = bind(out, name, name === 'color' ? resolved.color(path) : resolved.float(path));
    }
    return out;
  });
}

/** A `(literal)` radius on `effects`: a layer blur of that many pixels. */
export const literalBlur = (radius: number): Effect => ({ type: 'LAYER_BLUR', blurType: 'NORMAL', radius, visible: true });

/** The colour a grid that names none is given. // unmeasured: that it is Figma's own for a new grid, red at 10% */
const GRID_COLOUR: RGBA = { r: 1, g: 0, b: 0, a: 0.1 };

/** A grid's colour, which Figma cannot bind: a token's value at the declared defaults, or a `(literal)` `#rrggbb[aa]`. */
function gridColour(resolved: Resolved, value: Value | undefined): RGBA {
  if (value === undefined) return GRID_COLOUR;
  if (value.kind === 'token') return resolved.valueOf(value.path)!.value as RGBA;
  const { color, opacity } = hexPaint(String((value as { value: string }).value));
  return { ...color, a: opacity ?? 1 };
}

/**
 * One grid of `layoutGrids`: the fields its alignment takes (`GRID_FIELDS`), each token bound with `bind`, starting at
 * the number `numberOf` gives; a literal or a plain count as given; an offset the file leaves out, 0.
 */
export function layoutGridOf(
  resolved: Resolved,
  record: LayoutGridRecord,
  bind: Bind<LayoutGrid>,
  numberOf: (variable: Variable) => number,
): LayoutGrid {
  const grid: Record<string, unknown> = { pattern: record.pattern };
  if (record.pattern !== 'GRID') grid.alignment = record.alignment;
  const bound: [string, Variable][] = [];
  for (const field of GRID_FIELDS[record.pattern === 'GRID' ? 'GRID' : record.alignment!]) {
    const value = record[field as 'count'];
    if (value?.kind === 'token') {
      const variable = resolved.float(value.path);
      bound.push([field, variable]);
      grid[field] = numberOf(variable);
    } else grid[field] = value === undefined ? 0 : (value as { value: number }).value;
  }
  grid.visible = true;
  grid.color = gridColour(resolved, record.color);
  return bound.reduce((out, [field, variable]) => bind(out, field, variable), grid as unknown as LayoutGrid);
}

const rgbaOf = (color: RGBA): unknown[] => [color.r, color.g, color.b, color.a].map(f32);

/** A part as the receipt reads it: its variable when bound, else its number. */
const partOf = (bound: Record<string, VariableAlias | undefined> | undefined, part: string, value: unknown): unknown =>
  bound?.[part] ? { variable: bound[part]!.id } : f32(value);

function reportedGradient(paint: GradientPaint): unknown {
  const stops = paint.gradientStops.map((stop) => ({
    position: f32(stop.position),
    color: stop.boundVariables?.color ? { variable: stop.boundVariables.color.id } : rgbaOf(stop.color),
  }));
  return { type: paint.type, stops, transform: [...paint.gradientTransform[0], ...paint.gradientTransform[1]].map(f32) };
}

/** What Figma reports for an effect: each of a shadow's fields, a blur's radius, by its variable when bound. */
export function reportedEffect(effect: Effect): unknown {
  const bound = (effect as { boundVariables?: Record<string, VariableAlias> }).boundVariables;
  if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
    return {
      type: effect.type,
      // Measured: binding the colour replaces its alpha with the variable's, so a bound colour reads as its variable alone.
      color: bound?.color ? { variable: bound.color.id } : rgbaOf(effect.color),
      offsetX: partOf(bound, 'offsetX', effect.offset.x),
      offsetY: partOf(bound, 'offsetY', effect.offset.y),
      radius: partOf(bound, 'radius', effect.radius),
      spread: partOf(bound, 'spread', effect.spread ?? 0),
    };
  }
  if (effect.type === 'LAYER_BLUR' || effect.type === 'BACKGROUND_BLUR')
    return { type: effect.type, radius: partOf(bound, 'radius', effect.radius) };
  return { type: effect.type };
}

/** What Figma reports for a layout grid: the fields its alignment takes, each by its variable when bound, and its colour. */
export function reportedGrid(grid: LayoutGrid): unknown {
  const read = grid as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { pattern: grid.pattern };
  if (grid.pattern !== 'GRID') out.alignment = grid.alignment;
  for (const field of GRID_FIELDS[grid.pattern === 'GRID' ? 'GRID' : grid.alignment] ?? []) {
    out[field] = partOf(grid.boundVariables as Record<string, VariableAlias> | undefined, field, read[field] ?? 0);
  }
  out.color = grid.color ? rgbaOf(grid.color) : null;
  return out;
}

// ---------------------------------------------------------------------------
// Apply: one token on one field of a layer no blueprint built (`PLAN_APPLY`), and the conventions' bindings. No
// component, no receipt, no stamp: the layer and the run are made up around the one call to `writeField`.
// ---------------------------------------------------------------------------

/**
 * The field table's kind for a Figma layer: a slot is a `SLOT`, a text a `TEXT`, a line a `LINE`, every other frame
 * kind a `FRAME`. An instance and a component definition read as frames, as the roster counts them: Figma gives them
 * a frame's fields, and on an instance a write is an override. The table's `INSTANCE` is what a component file may
 * say of one, and the format leaves overrides out.
 */
export const applyKindOf = (node: SceneNode): Layer['kind'] =>
  node.type === 'SLOT' || node.type === 'TEXT' || node.type === 'LINE' ? node.type : 'FRAME';

/** The layer `writeField` reads: the node, with the one field holding the token. */
export function applyLayer(node: SceneNode, field: string, path: string): Layer {
  const token: Value = { kind: 'token', path };
  // A field written as a list (paints, dashes) holds the token alone.
  const list = FIELDS[field]?.value === 'paints' || FIELDS[field]?.value === 'dashes';
  return { kind: applyKindOf(node), address: node.name, fields: { [field]: list ? [token] : token }, children: [] };
}

/**
 * What `writeField` asks of a run, for one token: its variable, where the field binds it, and its value at the declared
 * defaults. A composite (a gradient, a shadow, a grid) is a component file's to write, part by part: Apply's plan refuses it.
 */
export function resolvedFor(variable: Variable | undefined, atDefaults?: { value: VariableValue | number[]; context: string }): Resolved {
  const none = (what: string) => (): never => {
    throw new Error(`Apply writes a token's variable or its value, not ${what}`);
  };
  const bound = (): Variable => variable ?? none('a token with no variable')();
  return {
    get page() {
      return figma.currentPage;
    },
    float: bound,
    color: bound,
    textStyle: none('a text style'),
    effectStyle: none('an effect style'),
    component: none('a component'),
    componentSource: none('a component'),
    preferred: none('a component'),
    mode: none('a mode'),
    textStyles: () => [],
    pending: [],
    notes: [],
    valueOf: () => atDefaults,
    composite: () => undefined,
    variable: bound,
    // A text field is bound whole; Apply writes no text, so no line height is written as a value.
    textValue: () => undefined,
    stack: () => undefined,
    shows: none('what a property shows'),
  };
}

/** Writes one token on one field of a node, through `writeField`. */
export function writeToken(node: SceneNode, field: string, path: string, resolved: Resolved): Promise<FieldWrite> {
  // `writeField` reads a run's name, its resolved names and its warnings; Apply says what it writes in its plan.
  const run = { spec: { name: node.name }, resolved, warnings: [] as string[] } as unknown as Build;
  return writeField(run, node, applyLayer(node, field, path), field);
}
