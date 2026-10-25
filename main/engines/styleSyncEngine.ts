import type { Resolver } from '@toghen/lib';
import type { TokenTypeConversionMap } from '../../shared/tokenTypeMap.js';
import { countSkipsByCause, type Operation, type SkipCounts, type StyleBinding, type SyncPlan } from '../../shared/operations.js';
import { getStamp, receiptOf, type Stamp } from '../components/stamp.js';
import { getIndexedVariableByCollectionAndName, indexFigmaCollections, type IndexedVariable } from '../utils/figmaCollectionIndex.js';
import { fontStack, numbersEqual } from '../utils/figmaTokenAdapter.js';
import { chooseFamily, fallbackNote, listFonts, noFamilyReason } from '../utils/fontStack.js';
import { isPlainObject } from '../utils/shardedData.js';
import { localStyles, reportOf, type StyleKind } from '../utils/tokenStamps.js';
import { toEffectStyleProps, toPaintStyleProps, toTextStyleProps } from '../utils/figmaStyleAdapter.js';
import { figmaCollectionNameFor, resolveSumModes, snapshotModes, type SnapshotToken } from '../utils/resolverModes.js';
import { closedBecause, standingOf } from '../utils/standing.js';
import { buildSum } from '../utils/sum.js';
import { referencePath } from '@toghen/lib';
import { tokenPathToVariableName } from '../utils/tokenPath.js';

export interface StylePlanSummary {
  total: number;
  creates: number;
  updates: number;
  skips: number;
  /** `skips` by cause: their sum is `skips`. */
  skipsByCause: SkipCounts;
  /** Styles Figma holds something else in than the last sync wrote: a subset of `skips`, as for variables. */
  drifted: number;
  warnings: number;
  [key: string]: number | SkipCounts;
}

export interface StylePlanOptions {
  /** Whether a style changed in Figma since the sync wrote it is written with the document's value, or left alone. */
  overwriteDrift?: boolean;
}

interface IndexedStyle {
  id: string;
  style: BaseStyle;
  stamp?: Stamp;
  moved?: true;
}

interface StyleIndex {
  /** By kind and the token its stamp names. A copy is not among them. */
  byToken: Record<string, IndexedStyle>;
  byNameAndType: Record<string, IndexedStyle>;
  /** The copies a person made of a style Toghen wrote, each with the original and the token its stamp names. */
  copies: Array<{ copy: BaseStyle; of: BaseStyle; token: string }>;
}

function keyOf(styleType: StyleKind, name: string): string {
  return `${styleType}::${name}`;
}

/** A style is named as a variable is: the token path without the collection, `/` between groups. */
function tokenPathToStyleName(path: string): string {
  return tokenPathToVariableName(referencePath(path));
}

async function indexStyles(): Promise<StyleIndex> {
  const byToken: Record<string, IndexedStyle> = {};
  const byNameAndType: Record<string, IndexedStyle> = {};
  const copies: StyleIndex['copies'] = [];
  for (const { style, styleType, stamp, moved, copyOf } of await localStyles()) {
    const indexed: IndexedStyle = { id: style.id, style, ...(stamp ? { stamp } : {}), ...(moved ? { moved } : {}) };
    byNameAndType[keyOf(styleType, style.name)] = indexed;
    if (stamp?.is.token !== undefined) byToken[keyOf(styleType, stamp.is.token)] = indexed;
    const token = copyOf ? getStamp(copyOf)?.is.token : undefined;
    if (copyOf && token !== undefined) copies.push({ copy: style, of: copyOf, token });
  }
  return { byToken, byNameAndType, copies };
}

/**
 * What Figma would report for the fields a style plan writes, in `reportOf`'s shape: the props, and every field a
 * binding can name bound to its variable or to nothing. Compared with what Figma reports by `holds`, it says whether
 * the document asks for something else than the style holds.
 */
export function wantedOf(styleType: StyleKind, props: Record<string, unknown>, bindings: readonly StyleBinding[]): Record<string, unknown> {
  const bound = (fields: Record<string, BindableField>, index?: number) => {
    const aliases: Record<string, unknown> = {};
    for (const { field } of Object.values(fields)) {
      const binding = bindings.find((b) => b.field === field && (index === undefined || (b.index ?? 0) === index));
      aliases[field] = binding ? { type: 'VARIABLE_ALIAS', id: binding.variableId } : undefined;
    }
    return aliases;
  };
  if (styleType === 'TEXT') {
    const { fontFamily, fontStyle, ...rest } = props;
    return { ...rest, fontName: { family: fontFamily, style: fontStyle }, boundVariables: bound(TEXT_FIELDS) };
  }
  if (styleType === 'EFFECT') {
    return {
      effects: (props.effects as Record<string, unknown>[]).map((effect, index) => ({
        ...effect,
        boundVariables: bound(EFFECT_FIELDS, index),
      })),
    };
  }
  return props;
}

/**
 * Whether what Figma reports holds every field `wanted` names: numbers within float32's tolerance, as a variable's are
 * compared, lists item by item, and an object's other keys, which Figma adds (a paint's `visible`), left alone.
 */
export function holds(reported: unknown, wanted: unknown): boolean {
  if (typeof wanted === 'number') return typeof reported === 'number' && numbersEqual(reported, wanted);
  if (Array.isArray(wanted))
    return Array.isArray(reported) && reported.length === wanted.length && wanted.every((item, index) => holds(reported[index], item));
  if (isPlainObject(wanted)) {
    const object = isPlainObject(reported) ? reported : {};
    return Object.entries(wanted).every(([key, item]) => holds(object[key], item));
  }
  return reported === wanted;
}

function buildStyleProps(value: unknown, tokenType: string, styleType: 'TEXT' | 'EFFECT' | 'PAINT'): Record<string, unknown> {
  switch (styleType) {
    case 'TEXT':
      return toTextStyleProps(value) as unknown as Record<string, unknown>;
    case 'EFFECT':
      return toEffectStyleProps(value) as unknown as Record<string, unknown>;
    case 'PAINT':
      return toPaintStyleProps(value) as unknown as Record<string, unknown>;
    default:
      throw new Error(`Unsupported style mapping ${styleType} for token type ${tokenType}`);
  }
}

interface BindableField {
  field: string;
  type: VariableResolvedDataType;
}

/** A typography member → the text style field of the same name. */
const TEXT_FIELDS: Record<string, BindableField & { field: VariableBindableTextField }> = {
  fontFamily: { field: 'fontFamily', type: 'STRING' },
  fontStyle: { field: 'fontStyle', type: 'STRING' },
  fontWeight: { field: 'fontWeight', type: 'FLOAT' },
  fontSize: { field: 'fontSize', type: 'FLOAT' },
  letterSpacing: { field: 'letterSpacing', type: 'FLOAT' },
  lineHeight: { field: 'lineHeight', type: 'FLOAT' },
};

/** A shadow layer's member → the effect field it binds to. `blur` is Figma's `radius`. */
const EFFECT_FIELDS: Record<string, BindableField & { field: VariableBindableEffectField }> = {
  color: { field: 'color', type: 'COLOR' },
  offsetX: { field: 'offsetX', type: 'FLOAT' },
  offsetY: { field: 'offsetY', type: 'FLOAT' },
  blur: { field: 'radius', type: 'FLOAT' },
  spread: { field: 'spread', type: 'FLOAT' },
};

/**
 * Whether the variable's value means exactly what Figma reads in this field.
 *
 * A bound field reads the variable's number as the unit the field is already
 * in, so a unitless `1.5` bound to a PERCENT line height would read as 1.5%. And
 * a font stack is written to its variable as one joined string, which no font
 * is called. Those members keep their value. This is not warned about: each is
 * an ordinary way to author a token, and it would warn on every plan.
 */
function meansTheSame(member: string, _value: unknown, props: Record<string, unknown>): boolean {
  switch (member) {
    case 'lineHeight':
    case 'letterSpacing':
      return (props[member] as { unit?: string } | undefined)?.unit === 'PIXELS';
    default:
      return true;
  }
}

/**
 * The bindings a style's members can carry, and why any cannot.
 *
 * A member binds when it is one whole reference (`memberOf`), its field is
 * bindable, the unit rule holds, and the target's variable already exists with
 * the field's type. The style phase runs after the variable phase and cannot
 * create variables, so a missing one is a warning, not a plan step.
 */
function planBindings(
  path: string,
  token: SnapshotToken,
  styleType: 'TEXT' | 'EFFECT' | 'PAINT',
  props: Record<string, unknown>,
  variableFor: (to: string) => IndexedVariable | undefined,
): { bindings: StyleBinding[]; warnings: string[] } {
  const bindings: StyleBinding[] = [];
  const warnings: string[] = [];

  for (const [at, to] of Object.entries(token.memberOf ?? {})) {
    let spec: BindableField | undefined;
    let index: number | undefined;

    if (styleType === 'TEXT') {
      spec = TEXT_FIELDS[at];
      if (spec && !meansTheSame(at, (token.value as Record<string, unknown>)[at], props)) continue;
    } else if (styleType === 'EFFECT') {
      // `'0.color'` in a list of layers, `'color'` in a single one.
      const address = /^(?:(\d+)\.)?([^.]+)$/.exec(at);
      spec = address ? EFFECT_FIELDS[address[2]] : undefined;
      index = Number(address?.[1] ?? 0);
    }
    if (!spec) continue;

    const variable = variableFor(to);
    if (!variable) {
      warnings.push(`"${path}.${at}" refers to "${to}", which has no variable yet; sync variables first, then styles, to bind it.`);
      continue;
    }
    if (variable.resolvedType !== spec.type) {
      warnings.push(
        `"${path}.${at}" refers to "${to}", but that variable is ${variable.resolvedType} and the field ` +
          `takes ${spec.type}, so the value is written instead of a binding.`,
      );
      continue;
    }

    bindings.push({ field: spec.field, variableId: variable.id, ...(index !== undefined ? { index } : {}) });
  }

  return { bindings, warnings };
}

export class StyleSyncEngine {
  /**
   * Plans the styles for the document's **default** mode.
   *
   * Figma styles genuinely have no modes, so one mode has to be chosen — but the
   * choice used to be `getPermutations()[0]`, which follows declaration order
   * and ignores `default`. A document declaring `contexts: {dark, light},
   * default: 'light'` therefore had every one of its styles built from the dark
   * theme, and said so in a warning naming "dark" as if that were intended.
   *
   * `collectionName` names the base collection, as in the variable plan; a
   * member's variable is looked for in the collection its token lives in
   * (`utils/sum.ts`), by its stamp, else by name.
   *
   * A style is found by its stamp, and by name only to adopt one: an adopted
   * style is written whole, whatever its stamp says, since that receipt is not
   * this token's. A stamped style whose fields Figma reports otherwise than the
   * receipt was changed in Figma: drift, kept and said unless `overwriteDrift`.
   */
  async buildPlan(
    resolver: Resolver,
    conversionMap: TokenTypeConversionMap,
    collectionName: string = figmaCollectionNameFor(resolver),
    options: StylePlanOptions = {},
  ): Promise<SyncPlan> {
    const operations: Operation[] = [];

    // The sum, as the variable plan reads it: the default mode is the defaults of every modifier.
    const resolution = resolveSumModes(resolver);
    const { defaultMode, modeNames } = resolution;
    const snapshot = snapshotModes(resolution).find((s) => s.modeName === defaultMode);
    if (!snapshot) {
      return { operations };
    }

    if (modeNames.length > 1) {
      const others = modeNames.filter((name) => name !== defaultMode);
      operations.push({
        kind: 'WARNING',
        message:
          `Figma styles have no modes, so these are built from the document's default ` +
          `mode "${defaultMode}". Values in ${others.join(', ')} are not represented; ` +
          `use variables for anything that has to change per mode. A member bound to a ` +
          `variable is the exception: it follows that variable's modes.`,
      });
    }

    const styleIndex = await indexStyles();
    const figmaIndex = await indexFigmaCollections();
    const sum = buildSum(resolver, collectionName, conversionMap);
    const standing = standingOf(sum, figmaIndex);
    // The head of the target's variables, as the variable plan links a token:
    // its stamp first, then the name in the collection the variable lives in.
    const variableFor = (to: string): IndexedVariable | undefined => {
      const head = sum.tokenByPath.get(to)?.variables[0];
      if (!head) return undefined;
      const home = standing.get(head.collection);
      // A collection nothing may be written to (see `closedBecause`) is not bound to either.
      if (!home || closedBecause(home)) return undefined;
      return (
        figmaIndex.variablesByToken[head.key]?.find((stamped) => stamped.variableCollectionId === home.existing?.id) ??
        (home.existing ? getIndexedVariableByCollectionAndName(figmaIndex, home.existing.id, head.name) : undefined)
      );
    };

    // Read at the first text style, once: a plan without one never asks.
    let listed: Awaited<ReturnType<typeof listFonts>> | undefined;

    for (const [path, token] of snapshot.pathToToken) {
      const route = conversionMap[token.type];
      if (!route || route.target === 'skip') {
        operations.push({
          kind: 'SKIP',
          reason: `"${path}": unsupported token type ${token.type || 'none'}`,
          path,
          cause: 'unsupported-type',
        });
        continue;
      }

      // A variable's token is the variable plan's: this plan lists only the tokens it is for (ruling 11b).
      if (route.target === 'variable') continue;

      if (!route.styleType) {
        operations.push({
          kind: 'WARNING',
          message: `Missing styleType route for token type ${token.type}`,
          path,
        });
        continue;
      }

      const styleName = tokenPathToStyleName(path);

      // References nested inside a composite value — a typography token's
      // fontFamily, a shadow's colour — are already expanded: @toghen/lib owns
      // reference resolution, and the snapshot holds resolved values.
      // A malformed value fails this one token, not the plan. The plugin does
      // not register the core's validators, so this is where bad input is met.
      let props: Record<string, unknown>;
      try {
        // The core's own refusal is the reason: it names the token, the mode and the member.
        if (token.refused !== undefined) throw new Error(token.refused);
        props = buildStyleProps(token.value, token.type, route.styleType);
      } catch (err) {
        // A skip naming the token, the mode the style is built from and the reason: the plan goes on.
        operations.push({
          kind: 'SKIP',
          reason: `"${path}" cannot be built in ${defaultMode}: ${err instanceof Error ? err.message : String(err)}`,
          path,
          cause: 'cannot-build',
        });
        continue;
      }

      // A stack is a fallback: the first family Figma lists with the style asked for. A later one is said, and
      // leaves the family unbound, since the variable holds the first.
      let fellBack = false;
      const asked = { ...props };
      if (route.styleType === 'TEXT') {
        const stack = fontStack((token.value as Record<string, unknown>).fontFamily);
        listed ??= await listFonts();
        const choice = chooseFamily(stack, props.fontStyle as string, listed);
        if (!choice) {
          operations.push({ kind: 'SKIP', reason: noFamilyReason(path, stack), path, cause: 'no-font', reported: true });
          continue;
        }
        if (choice.passedOver.length > 0) {
          fellBack = true;
          props.fontFamily = choice.family;
          operations.push({ kind: 'WARNING', message: fallbackNote(path, choice), path });
        }
      }

      const { bindings, warnings } = planBindings(path, token, route.styleType, props, variableFor);
      for (const message of warnings) {
        operations.push({ kind: 'WARNING', message, path });
      }
      const written = fellBack ? bindings.filter((binding) => binding.field !== 'fontFamily') : bindings;

      const stamped = styleIndex.byToken[keyOf(route.styleType, path)];
      const styleId = (stamped ?? styleIndex.byNameAndType[keyOf(route.styleType, styleName)])?.id;
      if (stamped) {
        const reported = reportOf(stamped.style);
        const moved = Object.entries(receiptOf(reported))
          .filter(([field, hash]) => stamped.stamp?.receipt[field] !== hash)
          .map(([field]) => field);
        // What this machine would write, or what one with the first family would: two machines with different
        // fonts each leave the other's style alone.
        const agrees =
          holds(reported, wantedOf(route.styleType, props, written)) || holds(reported, wantedOf(route.styleType, asked, bindings));
        const skips = (agrees && moved.length === 0) || (!agrees && moved.length > 0 && !options.overwriteDrift);
        // A style that moved records its own id on its next write; one the plan does not write is stamped on its own.
        if (skips && stamped.moved) operations.push({ kind: 'STAMP', target: 'style', id: stamped.id, path });
        if (agrees && moved.length === 0) {
          operations.push({ kind: 'SKIP', reason: 'unchanged', path, cause: 'unchanged' });
          continue;
        }
        if (!agrees && moved.length > 0 && !options.overwriteDrift) {
          operations.push({
            kind: 'SKIP',
            reason: 'drifted',
            cause: 'drifted',
            message:
              `Changed in Figma since the last sync (${moved.join(', ')}). Figma no longer holds what was written, so this is a ` +
              `local edit — it is left alone rather than overwritten; pass --overwrite-drift to write the document's value.`,
            path,
          });
          continue;
        }
      }

      if (styleId) {
        operations.push({
          kind: 'UPDATE_STYLE',
          styleId,
          props,
          tokenPath: path,
          ...(written.length > 0 ? { bindings: written } : {}),
        });
      } else {
        operations.push({
          kind: 'CREATE_STYLE',
          styleType: route.styleType,
          name: styleName,
          props,
          tokenPath: path,
          ...(written.length > 0 ? { bindings: written } : {}),
        });
      }
    }

    // A person's copy of a style this document's sync wrote is left alone, and listed.
    const document = `${sum.dsName}.`;
    for (const { copy, of, token } of styleIndex.copies) {
      if (token.startsWith(document))
        operations.push({
          kind: 'SKIP',
          reason: `"${copy.name}" (${copy.id}) is a copy of Toghen's "${of.name}", left alone`,
          path: token,
          cause: 'copy',
          reported: true,
        });
    }

    return { operations };
  }

  summarizePlan(operations: Operation[]): StylePlanSummary {
    return {
      total: operations.length,
      creates: operations.filter((op) => op.kind === 'CREATE_STYLE').length,
      updates: operations.filter((op) => op.kind === 'UPDATE_STYLE' || op.kind === 'STAMP').length,
      skips: operations.filter((op) => op.kind === 'SKIP').length,
      skipsByCause: countSkipsByCause(operations),
      drifted: operations.filter((op) => op.kind === 'SKIP' && op.reason === 'drifted').length,
      warnings: operations.filter((op) => op.kind === 'WARNING').length,
    };
  }
}
