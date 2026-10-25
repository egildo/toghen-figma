/**
 * What a variable is for: the Figma fields it can fill (its scopes), and whether it is an opacity.
 *
 * A W3C token says neither. Its `$type` is `number` or `dimension`, and a dimension may be a gap, a radius or a
 * width. So the purpose of a token is read from four sources, the first that answers winning
 * (specs.md, *What a variable is for*):
 *
 * 1. **A declaration**, `$extensions["com.toghen"].figma.scopes`, on the token or the nearest group above it.
 * 2. **The name**: the token's last key, through the table component files infer bindings with (`scopesOfKey`).
 * 3. **References**: the tokens that refer to it, directly or through tokens with no purpose of their own, in any mode.
 * 4. **The type**, for scope only. It never makes a token an opacity.
 *
 * Nothing here touches Figma. The sum asks it once, after every token is built and folded, and each token keeps the
 * answer (`SumToken.purpose`), so the plan, the comparison and the Inspector read one.
 */

import { referencePath, type Collection, type DesignSystem } from '@toghen/lib';
import { scopesOfKey } from '../../shared/components/groups.js';
import { flatMap } from './lists.js';
import type { Referrer } from './resolverModes.js';
import type { Purpose, SumToken } from './sum.js';

/** What each kind of Figma variable may be scoped to. `ALL_SCOPES` suits all. Measured: `COLOR_OPACITY` is accepted on a `FLOAT`. */
const SUITING: Partial<Record<VariableResolvedDataType, readonly VariableScope[]>> = {
  COLOR: ['ALL_SCOPES', 'ALL_FILLS', 'FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL', 'STROKE_COLOR', 'EFFECT_COLOR'],
  FLOAT: [
    'ALL_SCOPES',
    'CORNER_RADIUS',
    'WIDTH_HEIGHT',
    'GAP',
    'STROKE_FLOAT',
    'EFFECT_FLOAT',
    'OPACITY',
    'COLOR_OPACITY',
    'FONT_WEIGHT',
    'FONT_SIZE',
    'LINE_HEIGHT',
    'LETTER_SPACING',
    'PARAGRAPH_SPACING',
    'PARAGRAPH_INDENT',
  ],
  STRING: ['ALL_SCOPES', 'TEXT_CONTENT', 'FONT_FAMILY', 'FONT_STYLE'],
  BOOLEAN: ['ALL_SCOPES'],
};

const ALL_SCOPES: readonly VariableScope[] = ([] as VariableScope[]).concat(...(Object.values(SUITING) as VariableScope[][]));
const FILLS: readonly VariableScope[] = ['FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL'];

/** The scopes of a token no source reaches, by its `$type`. Anything not listed is offered to every field. */
const BY_TYPE: Record<string, readonly VariableScope[]> = {
  color: ['ALL_FILLS', 'STROKE_COLOR', 'EFFECT_COLOR'],
  dimension: ['GAP', 'WIDTH_HEIGHT', 'CORNER_RADIUS', 'STROKE_FLOAT'],
  fontWeight: ['FONT_WEIGHT'],
  fontFamily: ['FONT_FAMILY'],
  letterSpacing: ['LETTER_SPACING'],
  // A bare number is never offered to OPACITY or COLOR_OPACITY, where Figma would read 1 as 1%. Figma has no "all but" scope, so the rest are named.
  number: [
    'CORNER_RADIUS',
    'WIDTH_HEIGHT',
    'GAP',
    'STROKE_FLOAT',
    'EFFECT_FLOAT',
    'FONT_WEIGHT',
    'FONT_SIZE',
    'LINE_HEIGHT',
    'LETTER_SPACING',
    'PARAGRAPH_SPACING',
    'PARAGRAPH_INDENT',
  ],
};

/** The scope a member of a composite fills, when the composite is one a reference gives a purpose through. */
const MEMBERS: Record<string, Record<string, VariableScope>> = {
  typography: {
    fontFamily: 'FONT_FAMILY',
    fontWeight: 'FONT_WEIGHT',
    fontSize: 'FONT_SIZE',
    lineHeight: 'LINE_HEIGHT',
    letterSpacing: 'LETTER_SPACING',
  },
  shadow: { color: 'EFFECT_COLOR', offsetX: 'EFFECT_FLOAT', offsetY: 'EFFECT_FLOAT', blur: 'EFFECT_FLOAT', spread: 'EFFECT_FLOAT' },
  border: { color: 'STROKE_COLOR', width: 'STROKE_FLOAT' },
};

const suits = (type: VariableResolvedDataType, scope: VariableScope): boolean => (SUITING[type] ?? ['ALL_SCOPES']).includes(scope);

/**
 * Figma refuses `ALL_FILLS` beside another fill scope and `ALL_SCOPES` beside anything, so a union is normalised:
 * `ALL_SCOPES` absorbs the rest, `ALL_FILLS` absorbs the fill scopes. Only scopes the variable's type takes are kept.
 */
export function normalizeScopes(scopes: Iterable<VariableScope>, type: VariableResolvedDataType): VariableScope[] {
  const kept = [...new Set(scopes)].filter((scope) => suits(type, scope));
  if (kept.includes('ALL_SCOPES')) return ['ALL_SCOPES'];
  const result = kept.includes('ALL_FILLS') ? kept.filter((scope) => !FILLS.includes(scope)) : kept;
  return result.sort();
}

/** Whether two lists of scopes name the same scopes. Figma stores them in an order of its own, so they are compared as sets. */
export function sameScopes(a: readonly VariableScope[], b: readonly VariableScope[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((scope) => right.has(scope));
}

/** The reason a declared list is refused, in words, or the list when it is sound. */
export function checkDeclaration(list: unknown, type: VariableResolvedDataType): { scopes: VariableScope[] } | { problem: string } {
  if (!Array.isArray(list) || list.some((entry) => typeof entry !== 'string')) {
    return { problem: 'figma.scopes must be a list of Figma scope names' };
  }
  const scopes = [...new Set(list as string[])];
  const unknown = scopes.filter((scope) => !ALL_SCOPES.includes(scope as VariableScope));
  if (unknown.length > 0)
    return {
      problem: `${unknown.map((scope) => `"${scope}"`).join(', ')} ${unknown.length === 1 ? 'is not a scope' : 'are not scopes'} Figma has`,
    };
  if (scopes.includes('COLOR_OPACITY')) {
    return { problem: "COLOR_OPACITY is not supported: the unit of a paint's opacity has not been measured, and Toghen never binds it" };
  }
  if (scopes.includes('ALL_SCOPES') && scopes.length > 1)
    return { problem: 'ALL_SCOPES cannot be listed with other scopes, as Figma refuses it' };
  const otherFills = scopes.filter((scope) => FILLS.includes(scope as VariableScope));
  if (scopes.includes('ALL_FILLS') && otherFills.length > 0)
    return { problem: `ALL_FILLS cannot be listed with ${otherFills.join(', ')}, as Figma refuses it` };
  if (scopes.includes('OPACITY') && scopes.length > 1)
    return { problem: 'OPACITY cannot be listed with other scopes: one number cannot be in two units' };
  const misfit = scopes.filter((scope) => !suits(type, scope as VariableScope));
  if (misfit.length > 0) return { problem: `${misfit.join(', ')} ${misfit.length === 1 ? 'does' : 'do'} not suit a ${type} variable` };
  return { scopes: scopes as VariableScope[] };
}

/** What a token's own definition says about its scopes: the list it holds, or the context that redefines it. */
export interface Declared {
  scopes?: unknown;
  /** `modifier=context`, where a context redefines the list. */
  conflict?: string;
}

/** The `figma.scopes` an `$extensions` object holds, when it holds any. */
export function scopesIn(extensions: unknown): unknown {
  const figma = (extensions as { 'com.toghen'?: { figma?: unknown } } | null | undefined)?.['com.toghen']?.figma;
  return typeof figma === 'object' && figma !== null ? (figma as { scopes?: unknown }).scopes : undefined;
}

export interface PurposeInput {
  collection: Collection;
  ds: DesignSystem;
  /** The Figma name of the base collection: a cell in it is not in any context. */
  baseName: string;
  /** The tokens that are variables, the folded ones as they now are. */
  tokens: SumToken[];
  /** The part tokens a fold took into another token's variable, by the token that stands for them. */
  partsOf: ReadonlyMap<string, string>;
  declared: ReadonlyMap<string, Declared>;
  /** Who refers to each token (full lookup paths), in any mode Figma gets. */
  referrers: ReadonlyMap<string, readonly Referrer[]>;
  /** The `$type` a path has, when one. */
  typeOf(path: string): string | undefined;
}

/** One thing that refers to a token and what it gives it: scopes, and whether they are an opacity's. */
interface Gift {
  scopes: VariableScope[];
  opacity: boolean;
}

/**
 * Gives every variable token its purpose, and refuses the ones whose declaration or opacity cannot be written.
 * Returns the warnings that are not a token's refusal.
 */
export function assignPurposes(input: PurposeInput): string[] {
  const { collection, referrers } = input;
  const warnings: string[] = [];
  const byPath = new Map(input.tokens.map((token) => [token.path, token]));
  const typeOfVariable = (token: SumToken): VariableResolvedDataType =>
    (token.routing as { variableType: VariableResolvedDataType }).variableType;

  // Where a group holds a list: the nearest one, from the token's group up to the root.
  const holders = new Map<string, { group: string; scopes: unknown } | null>();
  const nearestGroup = (refPath: string): { group: string; scopes: unknown } | null => {
    const segments = refPath.split('.').slice(0, -1);
    for (let depth = segments.length; depth >= 0; depth--) {
      const group = segments.slice(0, depth).join('.');
      let found = holders.get(group);
      if (found === undefined) {
        const scopes = scopesIn(collection.getGroupAttribute(group, '$extensions'));
        found = scopes === undefined ? null : { group, scopes };
        holders.set(group, found);
      }
      if (found) return found;
    }
    return null;
  };

  const refusals = new Map<string, string>();

  /** The purpose a token has of its own, from a declaration or else from its name; `null` when it has neither. */
  // `hidden`: the list is `[]`. That says only that the variable is hidden: whether it is an opacity comes from its name,
  // and failing that from the tokens that refer to it, as if it declared nothing (`named`: its name answered).
  type Own = Gift & { source: 'declaration' | 'name'; hidden?: true; named?: boolean };
  const own = new Map<string, Own | null>();
  const ownOf = (token: SumToken): Own | null => {
    if (own.has(token.path)) return own.get(token.path) as Own | null;
    const type = typeOfVariable(token);
    const refPath = referencePath(token.path);
    const declaration = input.declared.get(refPath);
    const holder = declaration?.scopes !== undefined ? { group: undefined, scopes: declaration.scopes } : nearestGroup(refPath);

    let result: Own | null = null;
    if (declaration?.conflict !== undefined) {
      refusals.set(
        token.path,
        `"${token.path}" redefines figma.scopes in ${declaration.conflict}, and a variable has one list for all its modes; skipped.`,
      );
      result = { scopes: [], opacity: false, source: 'declaration' };
    } else if (holder) {
      const checked = checkDeclaration(holder.scopes, type);
      if ('problem' in checked) {
        const where =
          holder.group === undefined ? '' : ` (declared on ${holder.group === '' ? 'the document root' : `the group "${holder.group}"`})`;
        refusals.set(
          token.path,
          `"${token.path}" has figma.scopes ${JSON.stringify(holder.scopes)}${where}, but ${checked.problem}; skipped.`,
        );
        result = { scopes: [], opacity: false, source: 'declaration' };
      } else if (checked.scopes.length === 0) {
        const named = scopesOfKey(refPath.slice(refPath.lastIndexOf('.') + 1))?.filter((scope) => suits(type, scope)) ?? [];
        result = { scopes: [], opacity: named.includes('OPACITY'), source: 'declaration', hidden: true, named: named.length > 0 };
      } else {
        result = { scopes: checked.scopes, opacity: checked.scopes.includes('OPACITY'), source: 'declaration' };
      }
    } else {
      const named = scopesOfKey(refPath.slice(refPath.lastIndexOf('.') + 1))?.filter((scope) => suits(type, scope));
      if (named && named.length > 0) result = { scopes: named, opacity: named.includes('OPACITY'), source: 'name' };
    }
    own.set(token.path, result);
    return result;
  };

  // A part is judged by the token that stands for it, whose variable it is a cell of.
  const gifts = new Map<string, Gift | null>();
  const flowing = new Set<string>();
  const ownOfAny = (path: string): { token: SumToken; own: Own | null } | undefined => {
    const token = byPath.get(input.partsOf.get(path) ?? path);
    return token && token.routing.kind === 'variable' ? { token, own: ownOf(token) } : undefined;
  };

  /** Whether a token is an opacity: its own say, and for a hidden one that its name leaves open, the tokens that refer to it. */
  const opacityOf = (token: SumToken, mine: Own): boolean =>
    mine.hidden && !mine.named ? flowedInto(token.path)?.opacity === true && suits(typeOfVariable(token), 'OPACITY') : mine.opacity;

  /** What the tokens that refer to `path` give it, reached through tokens with no purpose of their own. `null` when nothing does. */
  const flowedInto = (path: string): Gift | null => {
    if (gifts.has(path)) return gifts.get(path) as Gift | null;
    if (flowing.has(path)) return null;
    flowing.add(path);
    const given: Gift[] = [];
    for (const { from, at } of referrers.get(path) ?? []) {
      const fromType = input.typeOf(from);
      const member = MEMBERS[fromType ?? ''];
      if (member) {
        // A composite: the member's field.
        const key = at.split('.').find((segment) => segment !== '' && !/^\d+$/.test(segment));
        const scope = key === undefined ? undefined : member[key];
        if (scope) given.push({ scopes: [scope], opacity: false });
        continue;
      }
      if (at !== '') continue;
      const referrer = ownOfAny(from);
      if (referrer === undefined) continue;
      // A hidden token gives nothing to the scopes of what it refers to, but passes an opacity on as any token does.
      const gift = referrer.own?.hidden
        ? { scopes: [], opacity: opacityOf(referrer.token, referrer.own) }
        : (referrer.own ?? flowedInto(from));
      if (gift && (gift.scopes.length > 0 || gift.opacity)) given.push(gift);
    }
    flowing.delete(path);
    const opacities = given.filter((gift) => gift.opacity);
    const plain = given.filter((gift) => !gift.opacity);
    // Two units meet: the token stays plain, and holds what the others want.
    const result: Gift | null =
      given.length === 0
        ? null
        : opacities.length > 0 && plain.length === 0
          ? { scopes: ['OPACITY'], opacity: true }
          : { scopes: flatMap(plain, (gift) => gift.scopes), opacity: false };
    gifts.set(path, result);
    return result;
  };

  for (const token of input.tokens) {
    if (token.routing.kind !== 'variable') continue;
    const type = typeOfVariable(token);
    const mine = ownOf(token);
    let purpose: Purpose;
    if (mine) {
      purpose = { scopes: mine.scopes, opacity: opacityOf(token, mine), source: mine.source };
    } else {
      const flowed = flowedInto(token.path);
      const scopes = flowed ? normalizeScopes(flowed.scopes, type) : [];
      if (flowed && (flowed.opacity ? suits(type, 'OPACITY') : scopes.length > 0)) {
        purpose = { scopes: flowed.opacity ? ['OPACITY'] : scopes, opacity: flowed.opacity && suits(type, 'OPACITY'), source: 'reference' };
      } else {
        const listed = BY_TYPE[token.type ?? ''];
        purpose = { scopes: listed ? [...listed] : ['ALL_SCOPES'], opacity: false, source: 'type' };
      }
    }
    token.purpose = purpose;
  }

  // The tokens a part stands in for: a part that declares a list of its own is ignored.
  for (const [part, rest] of input.partsOf) {
    if (input.declared.get(referencePath(part))?.scopes !== undefined) {
      warnings.push(
        `"${part}" declares figma.scopes, but it is folded into "${rest}", whose variable is judged on its rest token; the list is ignored.`,
      );
    }
  }

  // An opacity is a number from 0 to 1 in every cell, or it is refused: a wrong unit draws a layer at 1%.
  for (const token of input.tokens) {
    if (token.routing.kind !== 'variable' || !token.purpose?.opacity || refusals.has(token.path)) continue;
    const bad = outsideUnit(token, input.baseName);
    if (bad)
      refusals.set(
        token.path,
        `"${token.path}" is an opacity, a number from 0 to 1, and is ${bad.value}${bad.where ? ` in ${bad.where}` : ''}; skipped.`,
      );
  }

  for (const [path, reason] of refusals) {
    const token = byPath.get(path) as SumToken;
    token.routing = { kind: 'refused', reason, skip: true };
    token.variables = [];
  }
  return warnings;
}

/** The first cell of an opacity that is not a number from 0 to 1: the value as written, and the context it is in. */
function outsideUnit(token: SumToken, baseName: string): { value: string; where: string } | undefined {
  for (const variable of token.variables) {
    for (const [mode, cell] of variable.cells) {
      if (cell.kind === 'link') continue;
      const value = cell.value;
      // A reference whose value cannot be read has nothing to check: it is reported where it is written.
      if (value === undefined) continue;
      if (typeof value === 'number' && value >= 0 && value <= 1) continue;
      return { value: JSON.stringify(value), where: variable.collection === baseName ? '' : `${variable.collection}=${mode}` };
    }
  }
  return undefined;
}
