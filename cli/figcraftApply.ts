/**
 * The component engine's writes, in FigCraft's commands: the FigCraft target's apply (plan, *Components in FigCraft*).
 *
 * The run is the plugin's own (`main/components/run.ts`): it resolves, snapshots and plans through the FigCraft view of
 * the file (`figcraftScene.ts`), and hands the steps here instead of to Figma's apply. Each step becomes FigCraft
 * commands, sent as one batch, one undo step: `{"$step": n}` stands for what an earlier command of the batch made, so a
 * member is built whole in one request. The receipts are then taken as in Figma, last, from what FigCraft reports once
 * every write is in, through the same `stampReceipts`, and sent as one more batch.
 *
 * Not every field is built for FigCraft yet: `refuses` names those a run would write, and the run stops before its first
 * write, a dry run included.
 */

import { renameAxis, slotKey } from '../shared/components/diff.js';
import { FIELDS } from '../shared/components/fields.js';
import type {
  ComponentRef,
  Constraints,
  GridPlacement,
  Layer,
  LayoutGridRecord,
  Member,
  Property,
  SetField,
  Track,
  Value,
} from '../shared/components/model.js';
import type { Desired, SetSpec, Step } from '../shared/components/steps.js';
import { placeMembers, slotNodesOf, stampSet, withResets, type Applied, type AppliedArtboard } from '../main/components/apply.js';
import { alphaOf, effectsOf, gradientPaint, layoutGridOf, literalBlur, withAlias } from '../main/components/fieldWriter.js';
import { stampReceipts, type Written } from '../main/components/receipt.js';
import { preferredOf, type Resolved } from '../main/components/resolve.js';
import { membersOf, stampedTree } from '../main/components/snapshot.js';
import { stampOn, strip, updateStamp, type Identity } from '../main/components/stamp.js';
import type { Updated } from '../main/components/update.js';
import { UNREPORTED_KEY, type Scene, type Unreported } from './figcraftScene.js';
import { effectsValue, paintsValue, type Step as Command } from './figcraftFile.js';
import { splitKey } from './figcraftLibrary.js';

/** What the apply needs of the target: a batch in the pinned file, the file as it is now, and the view's writes sent. */
export interface Target {
  batch(label: string, commands: Command[]): Promise<unknown[]>;
  scene(): Promise<Scene>;
  flush(label: string): Promise<void>;
}

/** A node the batch has not made yet, as the batch names it, or one that exists, by its id. */
type Ref = number | { $step: number };

class Batch {
  readonly commands: Command[] = [];
  add(command: string, params: Record<string, unknown>): Ref {
    this.commands.push({ command, params });
    return { $step: this.commands.length - 1 };
  }
}

const idOf = (results: unknown[], ref: Ref): number => (typeof ref === 'number' ? ref : Number((results[ref.$step] as { id: unknown }).id));

// ---------------------------------------------------------------------------
// what is built for FigCraft
// ---------------------------------------------------------------------------

/** A plain field: its `node.set` name, and its value in FigCraft's spelling. */
const lower = (value: unknown): string => String(value).toLowerCase();
const camel = (value: unknown): string => lower(value).replace(/_(.)/g, (_, c: string) => c.toUpperCase());
const PLAIN: Record<string, [string, (value: unknown) => unknown]> = {
  layoutMode: ['layout', (value) => (value === 'NONE' ? null : lower(value))],
  layoutWrap: ['wrap', (value) => value === 'WRAP'],
  layoutPositioning: ['absolute', (value) => value === 'ABSOLUTE'],
  layoutSizingHorizontal: ['sizingH', lower],
  layoutSizingVertical: ['sizingV', lower],
  primaryAxisAlignItems: ['mainAlign', camel],
  counterAxisAlignItems: ['crossAlign', lower],
  strokeAlign: ['strokeAlign', lower],
  clipsContent: ['clip', (value) => value],
  textAutoResize: ['textAutoResize', camel],
  textAlignHorizontal: ['textAlign', lower],
  textAlignVertical: ['textAlignVertical', lower],
  textCase: ['textCase', camel],
  textDecoration: ['textDecoration', lower],
  visible: ['visible', (value) => value],
  rotation: ['rotation', (value) => value],
  counterAxisAlignContent: ['contentAlign', camel],
  strokeJoin: ['strokeJoin', lower],
  strokeCap: ['strokeCap', (value) => STROKE_CAP[String(value)] ?? camel(value)],
  blendMode: ['blend', (value) => BLEND[String(value)] ?? camel(value)],
  leadingTrim: ['leadingTrim', camel],
  gridChildHorizontalAlign: ['gridAlignH', (value) => (value === 'AUTO' ? null : lower(value))],
  gridChildVerticalAlign: ['gridAlignV', (value) => (value === 'AUTO' ? null : lower(value))],
};

/** Figma's line caps FigCraft spells otherwise than in camel case (measured 23 October 2026, 0.10.0). */
export const STROKE_CAP: Record<string, string> = { ARROW_LINES: 'lineArrow', ARROW_EQUILATERAL: 'triangleArrow' };

/** Figma's blend modes FigCraft spells otherwise than in camel case. */
export const BLEND: Record<string, string> = { PASS_THROUGH: 'pass through', LINEAR_BURN: 'plusDarker', LINEAR_DODGE: 'plusLighter' };

/** Figma's constraints in FigCraft's words, per axis. */
export const CONSTRAINT: Record<'horizontal' | 'vertical', Record<string, string>> = {
  horizontal: { MIN: 'left', MAX: 'right', STRETCH: 'leftRight', CENTER: 'center', SCALE: 'scale' },
  vertical: { MIN: 'top', MAX: 'bottom', STRETCH: 'topBottom', CENTER: 'center', SCALE: 'scale' },
};

/**
 * Fields FigCraft takes and does not report (measured 23 October 2026): normal against pass-through, corner smoothing,
 * a line's cap, a text's maximum lines, paragraph spacing and indent, and constraints where FigCraft leaves them out. What
 * Toghen wrote of them is kept beside the stamp, and read back from there wherever FigCraft reports nothing.
 */
export const UNREPORTED_FIELDS = [
  'blendMode',
  'cornerSmoothing',
  'strokeCap',
  'maxLines',
  'paragraphSpacing',
  'paragraphIndent',
  'constraints',
  'isExposedInstance',
];

/** A dimension: its `node.set` name, and the field `variable.bind` binds. */
const DIMENSION: Record<string, string> = {
  itemSpacing: 'gap',
  counterAxisSpacing: 'crossGap',
  paddingTop: 'paddingTop',
  paddingRight: 'paddingRight',
  paddingBottom: 'paddingBottom',
  paddingLeft: 'paddingLeft',
  cornerRadius: 'cornerRadius',
  strokeWeight: 'strokeWeight',
  strokeTopWeight: 'strokeTopWeight',
  strokeRightWeight: 'strokeRightWeight',
  strokeBottomWeight: 'strokeBottomWeight',
  strokeLeftWeight: 'strokeLeftWeight',
  opacity: 'opacity',
  width: 'width',
  height: 'height',
  minWidth: 'minWidth',
  maxWidth: 'maxWidth',
  minHeight: 'minHeight',
  maxHeight: 'maxHeight',
  x: 'x',
  y: 'y',
  // In a grid, `gap` is the column gap and `crossGap` the row gap (measured 23 October 2026).
  gridColumnGap: 'gap',
  gridRowGap: 'crossGap',
  cornerSmoothing: 'cornerSmoothing',
  listSpacing: 'listSpacing',
  maxLines: 'maxLines',
};
const CORNERS = ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'];
const TEXT = ['fontFamily', 'fontStyle', 'fontWeight', 'fontSize', 'lineHeight', 'letterSpacing', 'paragraphSpacing', 'paragraphIndent'];
const OTHER = [
  'modes',
  'fills',
  'strokes',
  'effects',
  'layoutGrids',
  'effectStyle',
  'textStyle',
  'characters',
  'component',
  'set',
  'constraints',
  'dashPattern',
  'grid',
  'gridRowSizes',
  'gridColumnSizes',
  'isExposedInstance',
];

/** The fields a FigCraft run writes. Any other is refused by name, before the run writes anything. */
export const BUILT = new Set([...Object.keys(PLAIN), ...Object.keys(DIMENSION), ...CORNERS, ...TEXT, ...OTHER]);

/** Where a new member stands while it joins its set: off the set's top-left corner. The end of the run lays the members out. */
const AWAY = 100000;

/** Why a run cannot be built in FigCraft: each field, kind or property it would need that is not built here yet. */
export function refuses(desired: Desired, steps: Step[], _resolved: Resolved): string[] {
  const out = new Set<string>();
  const where = (layer: Layer): string => `"${desired.component.name}" ${layer.address}`;
  const visit = (layer: Layer, fields: readonly string[] = Object.keys(layer.fields), deep = true): void => {
    for (const field of fields) {
      if (!BUILT.has(field) && !field.startsWith('set ')) out.add(`${where(layer)}: the field ${field} is not built in FigCraft yet`);
      if (field === 'strokeCap' && (layer.fields.strokeCap as { value?: unknown }).value === 'TRIANGLE_FILLED')
        out.add(`${where(layer)}: the line cap TRIANGLE_FILLED has no match in FigCraft, whose one triangle is ARROW_EQUILATERAL`);
      if (field === 'textTruncation')
        out.add(
          `${where(layer)}: textTruncation is not built in FigCraft, whose truncation is a text's sizing (textAutoResize "truncate"), not Figma's ending`,
        );
      const named = layer.fields.component as Value;
      if (field === 'component' && named.kind === 'key' && !splitKey(named.key))
        out.add(
          `${where(layer)}: a component named by a Figma key is not built in FigCraft, whose keys are <library id>:<asset id>; name the component, and declare its library with --use`,
        );
    }
    if (deep) {
      layer.children.forEach((child) => {
        visit(child);
      });
    }
  };
  for (const step of steps) {
    if (step.kind === 'CREATE_SET') {
      step.members.forEach((member) => {
        visit(member.tree);
      });
    } else if (step.kind === 'CREATE_ARTBOARD' || step.kind === 'CREATE_MEMBER') visit(step.member.tree);
    else if (step.kind === 'CREATE_LAYER' || step.kind === 'REPLACE_LAYER') visit(step.layer, Object.keys(step.layer.fields), false);
    else if (step.kind === 'PATCH_LAYER') visit(step.layer, step.fields, false);
  }
  for (const property of desired.component.properties) {
    if (preferredOf(property).some((value) => 'key' in value)) {
      out.add(
        `"${desired.component.name}": the preferred values of "${property.name}" name Figma's published keys, which FigCraft does not hold; name the components with name=`,
      );
    }
    const given = (property as { default?: unknown }).default;
    if ((property.type === 'TEXT' || property.type === 'BOOLEAN') && typeof given === 'object')
      out.add(`"${desired.component.name}": the default of "${property.name}" is a token, which FigCraft does not bind to a property yet`);
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// one layer's fields, as commands
// ---------------------------------------------------------------------------

interface Build {
  resolved: Resolved;
  spec: SetSpec;
  /** Property name to its default, which a wired field shows. */
  defaults: Map<string, string | boolean>;
  /** Wires to make once the set has its properties: a layer, the field, the property (or none, to unwire). */
  wires: Array<{ ref: Ref; field: 'visible' | 'characters' | 'mainComponent'; property: string | null }>;
  /** What fills a new instance's slot, made once the instance and its slot layer exist. */
  later: Array<{ instance: Ref; layer: Layer }>;
  /** Frames to make slots, and instances to expose, once they are inside a main component, which FigCraft requires. */
  slots: Array<{ ref: Ref; name: string }>;
  exposes: Array<{ ref: Ref; exposed: boolean }>;
  /** An artboard's: no layer of it is in a component, so none is wired to a property, nor taken off one. */
  artboard?: true;
}

/** A length as FigCraft takes one: pixels as a number, a percentage as `"150%"`, auto as `"auto"`. */
function lengthFor(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const { unit, value: amount } = value as { unit: string; value?: number };
  return unit === 'AUTO' ? 'auto' : unit === 'PERCENT' ? `${amount}%` : amount;
}

/**
 * A file's paint as FigCraft takes it, and what is then bound in it, by the field after the paint's index: `color` for
 * a solid, `stops/<j>/color` for a gradient's stop that follows a token.
 */
function paintFor(build: Build, paint: Value): { paint: unknown; binds: Array<[string, string]> } {
  if (paint.kind !== 'token') return { paint: String((paint as { value: string }).value), binds: [] };
  const composite = build.resolved.composite(paint.path);
  if (composite?.paint) {
    const gradient = gradientPaint(build.resolved, composite);
    const binds = gradient.gradientStops.flatMap(
      (stop, j): Array<[string, string]> => (stop.boundVariables?.color ? [[`stops/${j}/color`, stop.boundVariables.color.id]] : []),
    );
    return { paint: paintsValue({ paints: [gradient] })[0], binds };
  }
  const variable = build.resolved.color(paint.path);
  const alpha = alphaOf(build.resolved, paint.path);
  // The colour is the variable's once it is bound, which FigCraft paints at once (measured); black stands in until then.
  return { paint: { type: 'solid', color: '#000000', ...(alpha < 1 ? { opacity: alpha } : {}) }, binds: [['color', variable.id]] };
}

/** A grid track as FigCraft takes one: Figma's `FIXED`, `FLEX` and `HUG` are FigCraft's `fixed`, `fill` and `hug`. */
const trackFor = (track: Track): { sizing: string; value?: number } =>
  track.type === 'HUG' ? { sizing: 'hug' } : { sizing: track.type === 'FLEX' ? 'fill' : 'fixed', value: track.value ?? 1 };

/** FigCraft's names for a layout grid's fields, and for the parts `variable.bind` binds (`layoutGrids/<i>/count`). */
const GRID_AS: Record<string, string> = { count: 'count', gutterSize: 'gutter', offset: 'offset', sectionSize: 'size' };

/** A layout grid as FigCraft's `grids` takes it, from Figma's. */
function gridFor(grid: LayoutGrid): Record<string, unknown> {
  const read = grid as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { kind: grid.pattern.toLowerCase(), visible: grid.visible ?? true, color: grid.color };
  if (grid.pattern !== 'GRID') out.align = grid.alignment.toLowerCase();
  for (const [figma, fc] of Object.entries(GRID_AS)) if (typeof read[figma] === 'number') out[fc] = read[figma];
  return out;
}

/**
 * The commands that write a layer's fields, in Figma's order (`applyFields`): layout first, then the text, the size,
 * the dimensions, the paints, the strokes, visibility, modes. With `only`, those fields alone, and nothing a new node
 * is given beyond them.
 */
function fieldCommands(batch: Batch, build: Build, ref: Ref, layer: Layer, root: boolean, only?: ReadonlySet<string>): void {
  const f = layer.fields;
  const has = (name: string): boolean => name in f && (!only || only.has(name));
  const set = (props: Record<string, unknown>): void => void batch.add('node.set', { ids: [ref], props });
  const bind = (field: string, variable: string | null): void => void batch.add('variable.bind', { ids: [ref], field, variable });
  const value = (name: string): Value => f[name] as Value;
  const plainOf = (v: Value): unknown => (v as { value: unknown }).value;
  const container = layer.kind === 'FRAME' || layer.kind === 'SLOT';

  const writePlain = (name: string): void => {
    const v = value(name);
    if (v.kind === 'property' || v.kind === 'token') return;
    const [prop, to] = PLAIN[name];
    set({ [prop]: to(plainOf(v)) });
  };
  const writeDimension = (name: string): void => {
    const v = value(name);
    const fc = DIMENSION[name] ?? name;
    if (v.kind === 'token' && FIELDS[name]?.token?.bind) bind(fc, build.resolved.variable(v.path).id);
    else if (v.kind === 'token') set({ [fc]: build.resolved.valueOf(v.path)!.value });
    else set({ [fc]: plainOf(v) });
  };
  const wire = (field: 'visible' | 'characters' | 'mainComponent', name: string): void => {
    const v = f[name] as Value | undefined;
    if (v?.kind === 'property') {
      build.wires.push({ ref, field, property: v.name });
    } else if (!build.artboard && (v?.kind === 'literal' || (v?.kind === 'token' && only && !root)))
      build.wires.push({ ref, field, property: null });
  };

  if (has('layoutMode')) writePlain('layoutMode');
  for (const [name, count, tracks] of [
    ['gridColumnSizes', 'gridColumns', 'columnTracks'],
    ['gridRowSizes', 'gridRows', 'rowTracks'],
  ] as const) {
    if (has(name)) set({ [count]: (f[name] as Track[]).length, [tracks]: (f[name] as Track[]).map(trackFor) });
  }
  for (const name of ['layoutWrap', 'counterAxisAlignContent', 'layoutPositioning']) if (has(name)) writePlain(name);
  if (has('grid')) {
    const cell = f.grid as GridPlacement;
    set({ gridRow: cell.row, gridColumn: cell.column, gridRowSpan: cell.rowSpan ?? 1, gridColumnSpan: cell.columnSpan ?? 1 });
  }
  for (const name of ['gridChildHorizontalAlign', 'gridChildVerticalAlign']) if (has(name)) writePlain(name);

  if (layer.kind === 'TEXT') {
    if (has('textStyle')) applyStyle(batch, ref, build.resolved.textStyle((value('textStyle') as { path: string }).path).id);
    if (has('characters')) {
      const v = value('characters');
      if (v.kind === 'token') bind('characters', build.resolved.variable(v.path).id);
      else set({ characters: v.kind === 'property' ? String(build.defaults.get(v.name)) : String(plainOf(v)) });
      wire('characters', 'characters');
    }
    for (const name of TEXT) {
      if (!has(name)) continue;
      const v = value(name);
      if (v.kind === 'token') {
        const written = build.resolved.textValue(name, v.path);
        if (written) set({ [name]: lengthFor(written.value) });
        else bind(name, build.resolved.variable(v.path).id);
      } else set({ [name]: plainOf(v) });
    }
  }

  for (const name of ['width', 'height']) if (has(name) && value(name).kind !== 'token') writeDimension(name);
  // An instance carries its main's bound size, and FigCraft keeps a bound size fixed whatever sizing is set beside it, so
  // an instance that hugs or fills lets that binding go first; the main keeps it (measured 25 October 2026, 0.10.0).
  for (const [name, size] of [
    ['layoutSizingHorizontal', 'width'],
    ['layoutSizingVertical', 'height'],
  ] as const) {
    if (layer.kind === 'INSTANCE' && has(name) && !(size in f) && ['FILL', 'HUG'].includes(plainOf(value(name)) as string))
      bind(size, null);
  }
  for (const name of ['layoutSizingHorizontal', 'layoutSizingVertical']) if (has(name)) writePlain(name);
  for (const name of ['minWidth', 'maxWidth', 'minHeight', 'maxHeight']) if (has(name)) writeDimension(name);
  for (const name of ['width', 'height']) if (has(name) && value(name).kind === 'token') writeDimension(name);
  if (has('rotation')) writePlain('rotation');
  for (const name of ['primaryAxisAlignItems', 'counterAxisAlignItems']) if (has(name)) writePlain(name);

  for (const name of [
    'itemSpacing',
    'counterAxisSpacing',
    'gridRowGap',
    'gridColumnGap',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'opacity',
    'x',
    'y',
    'cornerSmoothing',
  ])
    if (has(name)) writeDimension(name);
  // A corner the file names beside `cornerRadius` overrides its corner. FigCraft keeps the four as one field: a value
  // written to it lets every corner's variable go, and a corner bound beside a bound `cornerRadius` does nothing
  // (measured 23 October 2026). So with any corner of its own, the four are written as one list, then each corner that
  // follows a token is bound on its own, and `cornerRadius` never is.
  if (CORNERS.some((name) => name in f)) {
    if (has('cornerRadius') || CORNERS.some(has)) {
      const cornerValue = (name: string): Value | undefined => (name in f ? value(name) : (f.cornerRadius as Value | undefined));
      // A bound corner shows its variable's value once bound; 0 stands in until then.
      set({
        cornerRadius: CORNERS.map((name) => {
          const corner = cornerValue(name);
          return corner === undefined || corner.kind === 'token' ? 0 : Number(plainOf(corner));
        }),
      });
      for (const name of CORNERS) {
        const corner = cornerValue(name);
        if (corner?.kind === 'token') bind(name, build.resolved.variable(corner.path).id);
      }
    }
  } else if (has('cornerRadius')) writeDimension('cornerRadius');

  // A list is written whole, then its parts bound: written after a binding, a value lets it go.
  for (const list of ['fills', 'strokes'] as const) {
    if (has(list)) {
      const paints = (f[list] as Value[]).map((paint) => paintFor(build, paint));
      set({ [list]: paints.map((paint) => paint.paint) });
      paints.forEach((paint, at) => {
        paint.binds.forEach(([part, variable]) => {
          bind(`${list}/${at}/${part}`, variable);
        });
      });
    }
  }
  if (has('effects')) {
    const effects: Effect[] = [];
    for (const effect of f.effects as Value[]) {
      if (effect.kind === 'token') effects.push(...effectsOf(build.resolved, build.resolved.composite(effect.path)!, withAlias));
      else effects.push(literalBlur(Number(plainOf(effect))));
    }
    set({ effects: effectsValue({ effects }) });
    effects.forEach((effect, at) => {
      for (const [part, alias] of Object.entries((effect as { boundVariables?: Record<string, VariableAlias> }).boundVariables ?? {}))
        bind(`effects/${at}/${part}`, alias.id);
    });
  }
  if (has('layoutGrids')) {
    // A bound field starts at 0 and shows its variable's value once bound.
    const grids = (f.layoutGrids as LayoutGridRecord[]).map((record) => layoutGridOf(build.resolved, record, withAlias, () => 0));
    set({ grids: grids.map(gridFor) });
    grids.forEach((grid, at) => {
      for (const [part, alias] of Object.entries((grid as { boundVariables?: Record<string, VariableAlias> }).boundVariables ?? {}))
        bind(`layoutGrids/${at}/${GRID_AS[part]}`, alias.id);
    });
  }
  // A new frame starts with a fill, and one the file does not declare is not one it wants.
  if (!only && !has('fills') && (container || root)) set({ fills: [] });
  if (has('effectStyle')) applyStyle(batch, ref, build.resolved.effectStyle((value('effectStyle') as { path: string }).path).id);

  // Per-side strokes take strokeAlign INSIDE, after the weight (Figma's order, kept so both targets draw alike).
  const sides = ['strokeTopWeight', 'strokeRightWeight', 'strokeBottomWeight', 'strokeLeftWeight'];
  const anySide = sides.some(has);
  if (anySide) set({ strokeAlign: 'inside' });
  // FigCraft keeps the four sides as one field: a side written as a value lets every side's variable go, and the bound
  // `strokeWeight`'s too (measured 23 October 2026, 0.10.0). So with any side of its own, as with the corners, the four
  // are written as one list, a side the file does not name taking `strokeWeight` (else none), then each side that follows
  // a token is bound on its own, and `strokeWeight` never is.
  if (sides.some((side) => side in f)) {
    if (has('strokeWeight') || anySide) {
      const sideValue = (side: string): Value | undefined => (side in f ? value(side) : (f.strokeWeight as Value | undefined));
      const bound = (v: Value | undefined): v is Extract<Value, { kind: 'token' }> =>
        v?.kind === 'token' && !!FIELDS.strokeWeight?.token?.bind;
      // A bound side shows its variable's value once bound; 0 stands in until then.
      set(
        Object.fromEntries(
          sides.map((side) => {
            const v = sideValue(side);
            return [side, v === undefined || bound(v) ? 0 : plainOf(v)];
          }),
        ),
      );
      for (const side of sides) {
        const v = sideValue(side);
        if (bound(v)) bind(side, build.resolved.variable(v.path).id);
      }
    }
  } else if (has('strokeWeight')) writeDimension('strokeWeight');
  if (has('strokeAlign') || (anySide && 'strokeAlign' in f)) writePlain('strokeAlign');
  for (const name of ['strokeJoin', 'strokeCap']) if (has(name)) writePlain(name);
  if (has('dashPattern')) {
    const dashes = f.dashPattern as Value[];
    set({
      dashes: dashes[0]?.kind === 'token' ? build.resolved.valueOf(dashes[0].path)!.value : dashes.map((dash) => Number(plainOf(dash))),
    });
  }
  if (has('clipsContent')) writePlain('clipsContent');
  if (has('blendMode')) writePlain('blendMode');
  if (has('constraints')) {
    const { horizontal, vertical } = f.constraints as Constraints;
    set({ constraints: { horizontal: CONSTRAINT.horizontal[horizontal], vertical: CONSTRAINT.vertical[vertical] } });
  }
  if (layer.kind === 'TEXT') {
    for (const name of ['textAutoResize', 'leadingTrim']) if (has(name)) writePlain(name);
    // After truncation, as in Figma (`maxLines` holds only beside it); listed for a text that gives it alone.
    for (const name of ['listSpacing', 'maxLines']) if (has(name)) writeDimension(name);
  }

  if (has('visible')) {
    const v = value('visible');
    if (v.kind === 'token') bind('visible', build.resolved.variable(v.path).id);
    else set({ visible: v.kind === 'property' ? Boolean(build.defaults.get(v.name)) : plainOf(v) });
    wire('visible', 'visible');
  }
  if (has('component')) wire('mainComponent', 'component');
  if (has('isExposedInstance')) build.exposes.push({ ref, exposed: Boolean(plainOf(value('isExposedInstance'))) });

  if (has('modes')) {
    for (const [collection, mode] of Object.entries(f.modes as Record<string, string>)) {
      const pin = build.resolved.mode(collection, mode);
      // A library's collection is copied in (linked, read-only) by the command that pins it; FigCraft checks the mode.
      if (pin.library) {
        const params = { library: pin.library.id ?? pin.library.name, collection: pin.collection.name, mode: pin.modeId, ids: [ref] };
        pinnedAt.set(params, pin.where);
        batch.add('library.setVariableMode', params);
      } else batch.add('variable.setMode', { ids: [ref], collection: pin.collection.id, mode: pin.modeId });
    }
  }
  // FigCraft keeps the wiring and the modes but does not report them: what the layer now holds of them, as the file
  // says, is kept beside the stamp whenever one of them is written, a wiring the file took away included.
  if (['visible', 'characters', 'component', 'modes', ...UNREPORTED_FIELDS].some(has))
    set({ pluginData: { [UNREPORTED_KEY]: JSON.stringify(unreportedOf(build, layer)) } });
}

/** A library mode's pin, by its command's params, as the file wrote it: FigCraft's error about the mode names no line. */
const pinnedAt = new WeakMap<object, string>();

/** A failed batch that pinned a library collection's mode says where the file pinned it. */
function withPins(error: unknown, commands: readonly Command[]): Error {
  const wheres = commands.flatMap((c) => (pinnedAt.has(c.params) ? [pinnedAt.get(c.params)!] : []));
  const message = (error as Error).message;
  return wheres.length === 0
    ? (error as Error)
    : new Error(`${message}; this batch pinned a library collection's mode at ${wheres.join(', ')}`);
}

/** A layer's wiring by field, and its pinned modes by collection id, as the file declares them. */
function unreportedOf(build: Build, layer: Layer): Unreported {
  const out: Unreported = {};
  for (const [field, name] of [
    ['visible', 'visible'],
    ['characters', 'characters'],
    ['mainComponent', 'component'],
  ] as const) {
    const v = layer.fields[name] as Value | undefined;
    if (v?.kind === 'property') out.references = { ...out.references, [field]: v.name };
  }
  if (layer.fields.modes) {
    out.modes = {};
    for (const [collection, mode] of Object.entries(layer.fields.modes as Record<string, string>)) {
      const pin = build.resolved.mode(collection, mode);
      out.modes[pin.collection.id] = pin.modeId;
    }
  }
  // The fields FigCraft does not report, as Figma would hold them: a bound one is read from its binding instead.
  for (const field of UNREPORTED_FIELDS) {
    const v = layer.fields[field] as Value | undefined;
    if (v === undefined || (v.kind === 'token' && FIELDS[field]?.token?.bind)) continue;
    const held =
      field === 'constraints'
        ? { ...(v as unknown as Constraints) }
        : v.kind === 'token'
          ? build.resolved.valueOf(v.path)?.value
          : (v as { value: unknown }).value;
    out.fields = { ...out.fields, [field]: held };
  }
  return out;
}

/** An instance's properties, by the names its component gives them: a token's variable bound, a swap by its component. */
function instanceCommands(batch: Batch, build: Build, ref: Ref, layer: Layer, only?: ReadonlySet<string>): void {
  const entries = Object.entries((layer.fields.set as SetField | undefined) ?? {}).filter(([name]) => !only || only.has(`set ${name}`));
  if (layer.kind !== 'INSTANCE' || entries.length === 0) return;
  const properties: Record<string, unknown> = {};
  for (const [name, { value }] of entries) {
    if (typeof value === 'object' && 'token' in value)
      batch.add('variable.bind', { ids: [ref], field: `componentProperties/${name}`, variable: build.resolved.variable(value.token).id });
    else if (typeof value === 'string' && componentNamed(build, value)) properties[name] = Number(componentNamed(build, value));
    else properties[name] = value;
  }
  if (Object.keys(properties).length > 0) batch.add('instance.setProperties', { ids: [ref], properties });
}

/**
 * A style applied to a layer. A library's style is copied into the file only as it is applied (FigCraft has no import
 * alone), so its id, `<library id>:<asset id>`, is applied with `library.applyStyle`, which copies it in once.
 */
function applyStyle(batch: Batch, ref: Ref, id: string): void {
  const library = splitKey(id);
  if (library) batch.add('library.applyStyle', { library: library.library, style: library.asset, ids: [ref] });
  else batch.add('style.apply', { ids: [ref], style: id });
}

/** A component of the file by its name, for an instance swap's value: its id, or undefined when the text names none. */
function componentNamed(build: Build, name: string): string | undefined {
  try {
    return build.resolved.component({ name } as ComponentRef).id;
  } catch (_notAComponent) {
    return undefined;
  }
}

/** The component an instance layer shows: as the file names it, or a swap property's default. */
function componentOf(build: Build, layer: Layer): string {
  const value = layer.fields.component as Value | undefined;
  if (value?.kind === 'plain' && typeof value.value === 'string') return build.resolved.component({ name: value.value }).id;
  if (value?.kind === 'property') {
    const declared = build.spec.properties.find((p) => p.type === 'INSTANCE_SWAP' && p.name === value.name) as
      | (Property & { default: ComponentRef })
      | undefined;
    if (declared) return build.resolved.component(declared.default).id;
  }
  throw new Error(`INSTANCE "${layer.address}" names no component to make an instance of`);
}

/** Makes a layer and what is in it. Answers its ref; `made` collects each layer made with its ref. */
function createCommands(
  batch: Batch,
  build: Build,
  layer: Layer,
  parent: Ref | undefined,
  made: Array<{ ref: Ref; layer: Layer }>,
  root = false,
): Ref {
  const name = root ? undefined : (layer.name ?? layer.address);
  const at = parent !== undefined ? { parent } : {};
  const ref =
    layer.kind === 'TEXT'
      ? batch.add('text.create', { text: '', x: 0, y: 0, ...at })
      : layer.kind === 'INSTANCE'
        ? batch.add('instance.create', { component: Number(componentOf(build, layer)), ...at })
        : layer.kind === 'LINE'
          ? batch.add('node.create', { type: 'line', ...at })
          : batch.add('frame.create', { ...at, ...(root ? {} : { name }) });
  if (name !== undefined) batch.add('node.set', { ids: [ref], props: { name } });
  if (layer.kind === 'INSTANCE') forgetMains(batch, ref);
  made.push({ ref, layer });
  if (layer.kind === 'SLOT') build.slots.push({ ref, name: layer.address });
  // An instance's properties before its fields: a variant switch may resize it, and the size the file states comes after.
  instanceCommands(batch, build, ref, layer);
  fieldCommands(batch, build, ref, layer, root);
  if (layer.kind === 'FRAME' || layer.kind === 'SLOT') for (const child of layer.children) createCommands(batch, build, child, ref, made);
  // What fills a new instance's slot goes in the instance's slot layer, which has an id only once the instance is made:
  // it is made by a second batch (`createArtboard`), any structure command taking the slot layer as its parent (measured).
  if (layer.kind === 'INSTANCE')
    for (const child of layer.children) if (child.slot !== undefined) build.later.push({ instance: ref, layer: child });
  return ref;
}

/**
 * An instance is made with a copy of its main's layer data (measured), Toghen's stamp and record among it: the run
 * empties both on an instance it makes, so what the instance holds is only ever its own.
 */
const forgetMains = (batch: Batch, ref: Ref): void =>
  void batch.add('node.set', { ids: [ref], props: { pluginData: { 'toghen.stamp': '', [UNREPORTED_KEY]: '' } } });

/** A member: its root frame, named for its combination, its layers, then made a component. */
function memberCommands(batch: Batch, build: Build, member: Member, made: Array<{ ref: Ref; layer: Layer; is?: Identity }>): Ref {
  const ref = batch.add('frame.create', { name: member.name });
  made.push({ ref, layer: member.tree, is: { member: member.name } });
  fieldCommands(batch, build, ref, member.tree, true);
  for (const child of member.tree.children) createCommands(batch, build, child, ref, made);
  batch.add('component.create', { ids: [ref] });
  slotsMade(batch, build);
  return ref;
}

/** The ids of the components and sets a property offers first, as FigCraft takes them: each by name, resolved (one by key is refused). */
const preferredIds = (resolved: Resolved, property: Property): number[] =>
  preferredOf(property).map((value) => Number(resolved.preferred(value)!.id));

/** The frames made into slots, each with its property, by the slot's name: FigCraft makes a slot only inside a main. */
const slotsMade = (batch: Batch, build: Build): void => {
  for (const { ref, name } of build.slots.splice(0)) {
    const property = build.spec.properties.find((p) => p.type === 'SLOT' && p.name === name);
    const preferred = property ? preferredIds(build.resolved, property) : [];
    batch.add('component.makeSlot', { id: ref, name, ...(preferred.length > 0 ? { preferred } : {}) });
  }
};

const PROPERTY_TYPE: Record<string, string> = { TEXT: 'text', BOOLEAN: 'boolean', INSTANCE_SWAP: 'instanceSwap' };

function propertyCommands(batch: Batch, build: Build, set: Ref, property: Property): void {
  if (!(property.type in PROPERTY_TYPE)) return;
  const given =
    property.type === 'INSTANCE_SWAP'
      ? Number(build.resolved.component(property.default).id)
      : (property as { default: string | boolean }).default;
  const preferred = preferredIds(build.resolved, property);
  batch.add('component.addProperty', {
    id: set,
    name: property.name,
    type: PROPERTY_TYPE[property.type],
    default: given,
    ...(preferred.length > 0 ? { preferred } : {}),
  });
}

const wireCommands = (batch: Batch, build: Build): void => {
  slotsMade(batch, build);
  for (const { ref, field, property } of build.wires.splice(0)) batch.add('component.bindProperty', { layer: ref, property, field });
  for (const { ref, exposed } of build.exposes.splice(0)) batch.add('component.exposeInstance', { id: ref, exposed });
};

/** A slot property's description and settings, which FigCraft's slots do not hold, kept on the set beside its stamp. */
function slotRecord(batch: Batch, set: Ref, spec: SetSpec): void {
  const slots: Unreported['slots'] = {};
  for (const property of spec.properties) {
    if (property.type !== 'SLOT') continue;
    slots[property.name] = {
      ...(property.description !== undefined ? { description: property.description } : {}),
      ...(property.slotSettings ? { slotSettings: property.slotSettings as Record<string, number | boolean> } : {}),
    };
  }
  if (Object.keys(slots).length > 0)
    batch.add('node.set', { ids: [set], props: { pluginData: { [UNREPORTED_KEY]: JSON.stringify({ slots }) } } });
}

function buildOf(resolved: Resolved, spec: SetSpec, artboard = false): Build {
  const defaults = new Map<string, string | boolean>();
  for (const property of spec.properties)
    if (property.type === 'BOOLEAN' || property.type === 'TEXT') defaults.set(property.name, property.default as string | boolean);
  return { resolved, spec, defaults, wires: [], slots: [], exposes: [], later: [], ...(artboard ? { artboard: true as const } : {}) };
}

// ---------------------------------------------------------------------------
// the steps
// ---------------------------------------------------------------------------

/** A layer this run wrote, by its FigCraft id: its receipt is taken once the run's writes are in. */
interface Wrote {
  id: number;
  layer: Layer;
  fields?: string[];
  /** A layer this run made: stamped with what it is first. */
  is?: Identity;
}

/** Stamps what the run made and takes every receipt, from the file as FigCraft now reports it, and sends them. */
async function stampAll(target: Target, scene: Scene, wrote: Wrote[], label: string): Promise<void> {
  const written: Written[] = [];
  for (const { id, layer, fields, is } of wrote) {
    const node = scene.byId(String(id));
    if (!node) continue;
    if (is) updateStamp(node, { is: { ...is, address: layer.address }, receipt: {} });
    written.push({ node, layer, ...(fields ? { fields } : {}) });
  }
  await stampReceipts(written);
  await target.flush(label);
}

const pageSelect = (batch: Batch, page: { id: string }): void => void batch.add('page.select', { id: Number(page.id) });

/**
 * What one field's write takes with it in FigCraft beyond Figma's resets: a value written to a corner or a side lets
 * the variables of all four go, so the corners (and `cornerRadius`) or the sides (and `strokeWeight`) the file declares
 * are written again.
 */
function figcraftResets(layer: Layer, fields: Set<string>): Set<string> {
  for (const group of [
    ['cornerRadius', ...CORNERS],
    ['strokeWeight', 'strokeTopWeight', 'strokeRightWeight', 'strokeBottomWeight', 'strokeLeftWeight'],
  ]) {
    if (group.some((name) => fields.has(name))) for (const name of group) if (name in layer.fields) fields.add(name);
  }
  return fields;
}

export function figcraftWriter(to: Target) {
  const target: Target = {
    ...to,
    batch: async (label, commands) => {
      try {
        return await to.batch(label, commands);
      } catch (error) {
        throw withPins(error, commands);
      }
    },
  };
  /** A component set that does not exist yet: every member, combined, named, given its properties and wired, in one batch. */
  async function createSet(step: Extract<Step, { kind: 'CREATE_SET' }>, resolved: Resolved): Promise<Applied> {
    const build = buildOf(resolved, step.component);
    const batch = new Batch();
    pageSelect(batch, resolved.page);
    const made: Array<{ ref: Ref; layer: Layer; is?: Identity }> = [];
    const members = step.members.map((member) => memberCommands(batch, build, member, made));
    const set = batch.add('component.combineVariants', { ids: members });
    // Combining names a member without `=` "Property 1=Default" (measured), so each takes its name again.
    step.members.forEach((member, at) => {
      batch.add('node.set', { ids: [members[at]], props: { name: member.name } });
    });
    batch.add('node.set', {
      ids: [set],
      props: {
        name: step.component.name,
        ...(step.component.description !== undefined ? { description: step.component.description } : {}),
      },
    });
    for (const property of step.component.properties) propertyCommands(batch, build, set, property);
    wireCommands(batch, build);
    slotRecord(batch, set, step.component);
    const results = await target.batch(`Build ${step.component.name}`, batch.commands);
    const setId = idOf(results, set);

    const scene = await target.scene();
    const setNode = scene.byId(String(setId)) as unknown as ComponentSetNode;
    updateStamp(setNode, { is: { component: step.component.name } });
    placeMembers(setNode, step.members, step.component);
    stampSet(setNode, step.component);
    await stampAll(
      target,
      scene,
      made.map(({ ref, layer, is }) => ({ id: idOf(results, ref), layer, is: is ?? {} })),
      'Toghen stamps',
    );
    return { setId: String(setId), created: step.members.map((member) => member.name), warnings: [] };
  }

  /** An artboard that does not exist yet: its frame and its layers, in one batch. */
  async function createArtboard(step: Extract<Step, { kind: 'CREATE_ARTBOARD' }>, resolved: Resolved): Promise<AppliedArtboard> {
    const build = buildOf(resolved, { name: step.member.name, properties: [] }, true);
    const batch = new Batch();
    pageSelect(batch, resolved.page);
    const made: Array<{ ref: Ref; layer: Layer; is?: Identity }> = [];
    const frame = batch.add('frame.create', { name: step.member.tree.name ?? step.member.tree.address });
    made.push({ ref: frame, layer: step.member.tree, is: { artboard: step.member.name } });
    fieldCommands(batch, build, frame, step.member.tree, true);
    for (const child of step.member.tree.children) createCommands(batch, build, child, frame, made);
    const results = await target.batch(`Build ${step.member.name}`, batch.commands);
    const wrote = made.map(({ ref, layer, is }) => ({ id: idOf(results, ref), layer, is: is ?? {} }));
    // Then what fills the new instances' slots, in their slot layers, now that those have ids.
    const filled: Array<{ ref: Ref; layer: Layer }> = [];
    if (build.later.length > 0) {
      const scene = await target.scene();
      const fill = new Batch();
      pageSelect(fill, resolved.page);
      for (const { instance, layer } of build.later.splice(0)) {
        const slot = slotNodesOf(scene.byId(String(idOf(results, instance)))!).find((candidate) => candidate.name === layer.slot);
        if (!slot) throw new Error(`"${step.member.name}": the instance has no slot "${layer.slot}" for "${layer.address}"`);
        createCommands(fill, build, layer, Number(slot.id), filled);
      }
      const placed = await target.batch(`Fill the slots of ${step.member.name}`, fill.commands);
      wrote.push(...filled.map(({ ref, layer }) => ({ id: idOf(placed, ref), layer, is: {} })));
    }
    await stampAll(target, await target.scene(), wrote, 'Toghen stamps');
    return { frameId: String(idOf(results, frame)), created: [...made, ...filled].map(({ layer }) => layer.address), warnings: [] };
  }

  /**
   * The steps on a set or an artboard that exists, one batch each, in the plan's order. `artboard` is the frame of an
   * artboard; a set's members are found by their ids.
   */
  async function updateSteps(rootId: string, steps: Step[], desired: Desired, resolved: Resolved, artboard: boolean): Promise<Updated> {
    const result: Updated = { created: [], updated: [], deleted: [], warnings: [] };
    const spec = desired.component;
    const build = buildOf(resolved, spec, artboard);
    const wrote: Wrote[] = [];
    let scene = await target.scene();
    const root = scene.byId(rootId);
    if (!root) throw new Error(`${artboard ? 'the artboard' : 'the component set'} ${rootId} is no longer in the file`);
    // What a delete or a replace took with it: a later delete of a layer in there finds nothing, and is done already,
    // as the plugin's writer takes it (`applyArtboardUpdate`).
    const gone = new Set<string>();
    const goes = (id: string): void => {
      const visit = (node: SceneNode): void => {
        gone.add(node.id);
        for (const child of 'children' in node ? node.children : []) visit(child);
      };
      const node = scene.byId(id);
      if (node) visit(node);
    };
    const page = (() => {
      let up: BaseNode | null = root;
      while (up && up.type !== 'PAGE') up = up.parent;
      return up as PageNode;
    })();
    // Each of Toghen's layers by address, per member (one for an artboard), as the snapshot read them.
    const indexes = new Map<string, Map<string, number>>();
    const layersOf = async (memberId: string): Promise<Map<string, number>> => {
      let layers = indexes.get(memberId);
      if (!layers) {
        layers = new Map();
        for (const { node, address, copyOf } of await stampedTree(scene.byId(memberId) as unknown as ComponentNode, artboard)) {
          if (address === undefined || copyOf) continue;
          layers.set(address, Number(node.id));
          // In an artboard, a layer that fills a slot names the instance's slot as its parent.
          if (artboard && node.type === 'INSTANCE')
            for (const slot of slotNodesOf(node)) layers.set(slotKey(address, slot.name), Number(slot.id));
        }
        indexes.set(memberId, layers);
      }
      return layers;
    };
    const layerAt = (member: string, address: string): Layer | undefined => {
      const find = (layer: Layer): Layer | undefined => (layer.address === address ? layer : layer.children.map(find).find(Boolean));
      const found = desired.members.find((candidate) => candidate.name === member);
      return found && find(found.tree);
    };
    // Each batch shows the page first, where a new node is made; a step's refs count it.
    const send = async (label: string, batch: Batch): Promise<unknown[]> =>
      batch.commands.length === 1 ? [] : target.batch(label, batch.commands);
    const stripAll = (ids: readonly string[] = []): void => {
      for (const id of ids) {
        const copy = scene.byId(id);
        if (copy) strip(copy);
      }
    };
    /** Where a layer goes among its parent's children: after the layer before it in the file, or first. */
    const indexFor = (parent: number, after: number | undefined, named: boolean): number => {
      const children = ((scene.byId(String(parent)) as unknown as { children?: SceneNode[] })?.children ?? []).map((child) =>
        Number(child.id),
      );
      const at = after !== undefined ? children.indexOf(after) : -1;
      return at >= 0 ? at + 1 : named ? children.length : 0;
    };

    let createdMembers = false;
    for (const step of steps) {
      const batch = new Batch();
      pageSelect(batch, page);
      switch (step.kind) {
        case 'ADD_PROPERTY':
          propertyCommands(batch, build, Number(rootId), step.property);
          await send(`Add property ${step.property.name}`, batch);
          break;
        case 'EDIT_PROPERTY': {
          const property = step.property;
          const edit: Record<string, unknown> = {};
          if (step.changes.includes('defaultValue') && property.type in PROPERTY_TYPE) {
            edit.default =
              property.type === 'INSTANCE_SWAP'
                ? Number(resolved.component(property.default).id)
                : (property as { default: string | boolean }).default;
          }
          if (step.changes.includes('preferredValues')) edit.preferred = preferredIds(resolved, property);
          if (Object.keys(edit).length > 0) batch.add('component.editProperty', { id: Number(rootId), name: property.name, ...edit });
          if (property.type === 'SLOT' && (step.changes.includes('description') || step.changes.includes('slotSettings')))
            slotRecord(batch, Number(rootId), spec);
          await send(`Edit property ${property.name}`, batch);
          break;
        }
        case 'DELETE_PROPERTY':
          batch.add('component.deleteProperty', { id: Number(rootId), name: step.name });
          await send(`Delete property ${step.name}`, batch);
          break;
        case 'RENAME_AXIS': {
          batch.add('component.editProperty', { id: Number(rootId), name: step.from, newName: step.to });
          await send(`Rename axis ${step.from}`, batch);
          for (const child of (root as unknown as ComponentSetNode).children) {
            const stamped = child.type === 'COMPONENT' ? stampOn(child)?.is.member : undefined;
            const renamed = stamped === undefined ? undefined : renameAxis(stamped, step.from, step.to);
            if (renamed !== undefined) updateStamp(child, { is: { member: renamed } });
          }
          break;
        }
        case 'CREATE_MEMBER': {
          // Every new member at the first of these steps, appended together, then wired: the set's properties are its own.
          if (createdMembers) break;
          createdMembers = true;
          const made: Array<{ ref: Ref; layer: Layer; is?: Identity }> = [];
          // A member that joins a set in FigCraft 0.10.0 gets none of its properties, and a layer of it cannot be wired
          // then; one that holds them already keeps them (measured 23 October 2026). So each new member is given the
          // set's properties and wired while it stands alone, then joins after the members there, away from the set's
          // top-left corner, whose member FigCraft takes for the set's default.
          const refs = steps
            .filter((s): s is Extract<Step, { kind: 'CREATE_MEMBER' }> => s.kind === 'CREATE_MEMBER')
            .map(({ member }) => {
              const ref = memberCommands(batch, build, member, made);
              for (const property of spec.properties) propertyCommands(batch, build, ref, property);
              return ref;
            });
          wireCommands(batch, build);
          batch.add('node.set', { ids: refs, props: { x: AWAY, y: AWAY } });
          batch.add('node.reparent', {
            ids: refs,
            parent: Number(rootId),
            index: ((root as unknown as { children?: unknown[] }).children ?? []).length,
          });
          const results = await send(`Add members to ${spec.name}`, batch);
          wrote.push(...made.map(({ ref, layer, is }) => ({ id: idOf(results, ref), layer, is: is ?? {} })));
          for (const { is } of made) if (is?.member !== undefined) result.created.push(is.member);
          break;
        }
        case 'DELETE_MEMBER':
          batch.add('edit.delete', { ids: [Number(step.memberId)] });
          await send(`Delete ${step.name}`, batch);
          stripAll(step.strip);
          result.deleted.push(step.name);
          break;
        case 'CREATE_LAYER':
        case 'REPLACE_LAYER': {
          const layers = await layersOf(step.memberId);
          const parent = layers.get(step.parent);
          if (parent === undefined)
            throw new Error(`"${step.member}": the parent "${step.parent}" of "${step.layer.address}" does not exist`);
          const made: Array<{ ref: Ref; layer: Layer }> = [];
          const ref = createCommands(batch, build, step.layer, parent, made);
          if (step.layer.kind === 'SLOT' && !artboard) slotRecord(batch, Number(rootId), spec);
          batch.add('node.reorder', {
            id: ref,
            index: indexFor(parent, step.after !== undefined ? layers.get(step.after) : undefined, step.after !== undefined),
          });
          if (step.kind === 'REPLACE_LAYER') {
            batch.add('edit.delete', { ids: [Number(step.nodeId)] });
            goes(step.nodeId);
          }
          wireCommands(batch, build);
          const results = await send(`${step.kind === 'CREATE_LAYER' ? 'Add' : 'Replace'} ${step.layer.address}`, batch);
          if (step.kind === 'REPLACE_LAYER') stripAll(step.strip);
          for (const { ref: made_, layer } of made) {
            wrote.push({ id: idOf(results, made_), layer, is: {} });
            layers.set(layer.address, idOf(results, made_));
          }
          // What fills a new instance's slot comes in steps of its own, with the slot as their parent, which has an id
          // only once the instance is made: the plugin's run registers it the same way (`registerSlots`).
          const instances = made.filter(({ layer }) => layer.kind === 'INSTANCE');
          if (artboard && instances.length > 0) {
            scene = await target.scene();
            for (const { ref: made_, layer } of instances)
              for (const slot of slotNodesOf(scene.byId(String(idOf(results, made_)))!))
                layers.set(slotKey(layer.address, slot.name), Number(slot.id));
          }
          if (artboard) result.created.push(step.layer.address);
          else if (!result.updated.includes(step.member)) result.updated.push(step.member);
          break;
        }
        case 'MOVE_LAYER': {
          const layers = await layersOf(step.memberId);
          const parent = layers.get(step.parent);
          if (parent === undefined) throw new Error(`"${step.member}": cannot move "${step.address}"`);
          batch.add('node.reparent', {
            ids: [Number(step.nodeId)],
            parent,
            index: indexFor(parent, step.after !== undefined ? layers.get(step.after) : undefined, step.after !== undefined),
          });
          await send(`Move ${step.address}`, batch);
          if (!artboard && !result.updated.includes(step.member)) result.updated.push(step.member);
          break;
        }
        case 'PATCH_LAYER':
        case 'SWAP_COMPONENT': {
          const layer = step.kind === 'PATCH_LAYER' ? step.layer : layerAt(step.member, step.address);
          if (!layer)
            throw new Error(
              `"${step.member}": the layer "${step.kind === 'PATCH_LAYER' ? step.layer.address : step.address}" is no longer in the file`,
            );
          const isRoot = step.nodeId === step.memberId;
          const only = step.kind === 'PATCH_LAYER' ? figcraftResets(layer, withResets(layer, step.fields)) : new Set(['component']);
          const id = Number(step.nodeId);
          if (step.kind === 'SWAP_COMPONENT') batch.add('instance.swap', { ids: [id], component: Number(componentOf(build, layer)) });
          // Its properties, then its fields: the sizing a variant switch may undo is among them (`withResets`).
          instanceCommands(batch, build, id, layer, only);
          fieldCommands(batch, build, id, layer, isRoot, only);
          // A layer a person renamed is found by its stamp, and gets the file's name back.
          batch.add('node.set', { ids: [id], props: { name: isRoot && !artboard ? step.member : (layer.name ?? layer.address) } });
          wireCommands(batch, build);
          await send(`${step.kind === 'PATCH_LAYER' ? 'Update' : 'Swap'} ${layer.address}`, batch);
          wrote.push({ id, layer, fields: step.kind === 'PATCH_LAYER' ? [...only, ...(step.restamp ?? [])] : ['component'] });
          const name = artboard ? layer.address : step.member;
          if (!result.updated.includes(name)) result.updated.push(name);
          break;
        }
        case 'DELETE_LAYER':
          if (!gone.has(step.nodeId)) {
            goes(step.nodeId);
            batch.add('edit.delete', { ids: [Number(step.nodeId)] });
            await send(`Delete ${step.address}`, batch);
          }
          stripAll(step.strip);
          if (artboard) result.deleted.push(step.address);
          else if (!result.updated.includes(step.member)) result.updated.push(step.member);
          break;
        default:
          break;
      }
    }

    // Last: the layout, the set's receipt and every layer's, from what FigCraft reports once every write is in.
    await target.flush('Toghen stamps');
    scene = await target.scene();
    const now = scene.byId(rootId);
    if (!artboard && now) {
      const set = now as unknown as ComponentSetNode;
      if (steps.some((step) => step.kind === 'RELAYOUT'))
        placeMembers(set, desired.members as Member[], spec, new Set((await membersOf(set)).copies.map(({ copy }) => copy)));
      stampSet(set, spec);
    }
    await stampAll(target, scene, wrote, 'Toghen stamps');
    return result;
  }

  return {
    createSet,
    createArtboard,
    update: (setId: string, steps: Step[], desired: Desired, resolved: Resolved) => updateSteps(setId, steps, desired, resolved, false),
    updateArtboard: (frameId: string, steps: Step[], desired: Desired, resolved: Resolved) =>
      updateSteps(frameId, steps, desired, resolved, true),
    refuses,
  };
}

export type FigcraftWriter = ReturnType<typeof figcraftWriter>;
