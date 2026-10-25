/**
 * The sum: where every token lives in Figma, decided before Figma is looked at.
 *
 * Variable sync used to build the product, one collection with a mode per
 * combination of every modifier's contexts. Figma's own model is the sum: a frame
 * sets a mode per collection, its children inherit each independently, and an
 * alias across collections resolves at the node that uses it. So this builds a
 * base collection (one mode, `default`) and one collection per modifier (a mode
 * per context, the default context first), and gives each token a home from what
 * lib reports about it, `contextsOf()`:
 *
 * | Links | Home |
 * |---|---|
 * | none | the base collection; a base that is a reference is an alias |
 * | one | that modifier's collection; a context that does not define it carries the base |
 * | two or more | a chain of aliases: the head, named for the token, in the last link's collection; each earlier link `<path>--<modifier>` in its own |
 *
 * Nothing here touches Figma, so the Inspector, the plan and the style plan all
 * ask one place, and the tests need no mock. What Figma holds is `standing.ts`'s.
 *
 * A token that has no home is not filled and not guessed: a hole, a `$type` that
 * varies, a token lib reports as non-factorable. Each is a `refused` routing with
 * the reason in words, and the engine reports it and writes nothing for it.
 */

import {
  cssLinkName,
  cssPropertyName,
  holdsReference,
  InvalidTokenError,
  normalizeTokenValue,
  parseReferencePath,
  referencePath,
  referenceTarget,
  type Resolver,
  type ResolverInput,
} from '@toghen/lib';
import type { TokenTypeConversionMap } from '../../shared/tokenTypeMap.js';
import { flatMap } from './lists.js';
import { foldsOf, foldTokens, unfoldedFor, type ComponentFold } from './folds.js';
import { figmaContexts, pathsInAnyMode, readToken, referrersOf, resolveSumModes } from './resolverModes.js';
import { linkVariableName, tokenPathToVariableName } from './tokenPath.js';
import { assignPurposes, scopesIn, type Declared } from './purpose.js';

/**
 * Where a token's type sends it — decided before any value is looked at.
 *
 * The failing kinds are kept apart rather than collapsed into one "cannot
 * sync", because the engine reports them differently and has always done so: a
 * type that varies is a `WARNING`, an unsupported type is a `SKIP` that names
 * it, and a style-routed token is a `SKIP` that points at the other phase.
 */
export type TokenRouting =
  | { kind: 'variable'; variableType: VariableResolvedDataType }
  | { kind: 'style' }
  /** The same path has different `$type`s in different contexts. */
  | { kind: 'type-conflict'; types: string[] }
  | { kind: 'unsupported'; tokenType: string | undefined }
  /** Routed to a variable by the conversion map, but with no `variableType`. */
  | { kind: 'missing-route'; tokenType: string }
  /**
   * A variable token with no home: a hole, a non-factorable value, or one that cannot be read in a context.
   * `skip`: refused for what it asks of Figma (a scope list, an opacity outside 0 to 1), and said as a skip and not a warning.
   */
  | { kind: 'refused'; reason: string; skip?: true };

/**
 * What one mode of one variable holds, as the document spells it.
 *
 * `reference` and `link` become aliases when Figma can hold one. A reference keeps
 * the value it resolves to in this context (`value`), for the case where it cannot:
 * the target is not a variable, or is another variable type.
 */
export type SumCell =
  /** `refused`: the core's reason, where it cannot compute the value for the type; the cell cannot be written. */
  | { kind: 'value'; value: unknown; refused?: string }
  | { kind: 'reference'; to: string; value?: unknown; refused?: string }
  /** The next link of a chain: always the same token, so always the same variable type. */
  | { kind: 'link'; to: string };

export interface SumVariable {
  /** What its stamp names it by: the token's lookup path; a chain link's generated lookup path (`ds.tone.alert~scheme`). */
  key: string;
  name: string;
  /** The Figma collection it lives in. */
  collection: string;
  /** `var(--surface-accent)`: the CSS spelling, which lib owns. */
  codeSyntax: string;
  /** One cell per mode of its collection, in the collection's order. */
  cells: Map<string, SumCell>;
}

export interface SumCollection {
  name: string;
  /** The modifier it stands for; absent for the base collection. */
  modifier?: string;
  /** Set for the collection of a folded part axis (`folds.ts`), named after the axis. */
  axis?: true;
  /** The default context first: Figma's default mode is `modes[0]`, fixed at creation. */
  modes: string[];
}

/**
 * What a variable is for (`purpose.ts`): the Figma fields it can fill, and whether it is an opacity, a number from 0
 * to 1 that Figma holds as a percentage. `source` says which of the four readings answered.
 */
export interface Purpose {
  scopes: VariableScope[];
  opacity: boolean;
  source: 'declaration' | 'name' | 'reference' | 'type';
}

export interface SumToken {
  /** The lookup path, `ds.color.brand`: the token a stamp names. */
  path: string;
  /** The document's `$type`, or null when the contexts disagree about it. */
  type: string | null;
  routing: TokenRouting;
  /** What the variable is for. Set on every token that routes to a variable. */
  purpose?: Purpose;
  /** The head first, then each earlier link of a chain. Empty unless `routing` is `variable`. */
  variables: SumVariable[];
}

export interface Sum {
  /** The leading segment of every lookup path. Not the Figma collection's name. */
  dsName: string;
  /** The base collection first, then one per modifier in the order the document declares them. */
  collections: SumCollection[];
  tokens: SumToken[];
  tokenByPath: Map<string, SumToken>;
  variableByKey: Map<string, SumVariable>;
  /** How each component's parts are laid out: which axes folded, and why the others did not. */
  layouts: ComponentFold[];
  /** What the purposes of the variables have to say apart from a token's refusal. */
  warnings: string[];
}

/** The routing of a type, or the several types a token has. */
function routeTypes(types: readonly string[], conversionMap: TokenTypeConversionMap): TokenRouting {
  if (types.length > 1) return { kind: 'type-conflict', types: [...types] };

  const tokenType = types[0];
  const route = tokenType === undefined ? undefined : conversionMap[tokenType];

  if (!route || route.target === 'skip') return { kind: 'unsupported', tokenType };
  if (route.target === 'style') return { kind: 'style' };
  if (!route.variableType) return { kind: 'missing-route', tokenType: tokenType as string };

  return { kind: 'variable', variableType: route.variableType };
}

/** The colour keyword that stands for the text colour around an element. */
function isCurrentColor(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === 'currentcolor';
}

/** A letter spacing in `em`, structured as lib stores it. */
function isEmLetterSpacing(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as { unit?: unknown }).unit === 'em';
}

/** The path a value names when it is one whole reference, checked by the core's grammar; otherwise undefined. */
function wholeTarget(value: unknown): string | undefined {
  const target = referenceTarget(value);
  return target === undefined ? undefined : parseReferencePath(target).join('.');
}

/** What a definition of a token says Figma writes where it cannot hold the CSS value: `$extensions["com.toghen"].figma.value`. */
function figmaValueIn(extensions: unknown): unknown {
  const figma = (extensions as { 'com.toghen'?: { figma?: unknown } } | null | undefined)?.['com.toghen']?.figma;
  return typeof figma === 'object' && figma !== null ? (figma as { value?: unknown }).value : undefined;
}

/** Whether any definition of a token carries a `figma.value`. A token whose extensions lib cannot factor is looked at cell by cell. */
function namesFigmaValue(about: ReturnType<Resolver['contextsOf']>): boolean {
  const chain = about.chains.$extensions;
  if (!chain) return about.nonFactorable.some((entry) => entry.property === '$extensions');
  return [
    chain.base,
    ...flatMap(chain.links, (link) => Object.values(link.steps).map((step) => ('value' in step ? step.value : undefined))),
  ].some((extensions) => figmaValueIn(extensions) !== undefined);
}

/** Where a cell is: a modifier's context, or the base (neither given). */
interface CellAt {
  modifier?: string;
  context?: string;
}

/** What the document says at a cell of a token: its resolved type and `figma.value` there, and the mode that is (for the type of what a key names). */
interface Named {
  at(refPath: string, cell: CellAt): { type: string | undefined; key: unknown; mode: string | undefined };
  /** The type of the token a reference path names, in a mode if it has one there. */
  typeOf(refPath: string, mode: string | undefined): string | undefined;
}

/**
 * Builds the sum of a document.
 *
 * Throws when lib cannot build it: a modifier with no `default` (see
 * `resolveSumModes`). The engines turn that into a plan that says so.
 *
 * @param baseName - The Figma name of the base collection, not the lookup prefix
 */
export function buildSum(resolver: Resolver, baseName: string, conversionMap: TokenTypeConversionMap): Sum {
  const resolution = resolveSumModes(resolver);
  const { ds, dsCollectionName: dsName, modeNames } = resolution;
  const collection = ds.getCollection(dsName);
  if (!collection) throw new Error('resolveContextsToDesignSystem produced no collection');

  const collections: SumCollection[] = [{ name: baseName, modes: ['default'] }];
  const defaults: Record<string, string | undefined> = {};
  // The contexts of each modifier that Figma does not get (its `figma.include`): CSS writes them, the sum does not.
  const leftOut = new Map<string, Set<string>>();
  for (const modifier of resolver.getModifiers()) {
    defaults[modifier.name] = modifier.default;
    const modes = figmaContexts(modifier);
    collections.push({ name: modifier.name, modifier: modifier.name, modes });
    leftOut.set(modifier.name, new Set(modifier.contexts.filter((context) => !modes.includes(context))));
  }
  const leftOutModes = new Set<string>();
  for (const [modifier, contexts] of leftOut)
    for (const context of contexts) leftOutModes.add(resolver.getModeName({ [modifier]: context }));

  // Every path in any mode Figma gets, in first-appearance order, so a plan is stable between runs;
  // and the types it has there. A token that only the contexts Figma does not get define is not here: it has no variable and is not reported.
  const paths = pathsInAnyMode(
    resolution,
    modeNames.filter((name) => !leftOutModes.has(name)),
  );
  const typesByPath = new Map<string, Set<string>>();
  for (const [refPath, modes] of paths) {
    const types = new Set<string>();
    for (const mode of modes) {
      const type = readToken(ds, `${dsName}.${refPath}`, mode)?.$type;
      if (type !== undefined) types.add(type);
    }
    typesByPath.set(refPath, types);
  }
  // Who refers to each token, in any mode Figma gets: what a variable is for flows along references.
  const referrers = referrersOf(resolution, paths);

  const tokens: SumToken[] = [];
  const tokenByPath = new Map<string, SumToken>();
  const variableByKey = new Map<string, SumVariable>();
  /** What each token's own definition says about its scopes. */
  const declared = new Map<string, Declared>();

  // The mode of a cell is lib's to name; a cell's own definition of the token is read from the system lib resolved for it.
  const modeOf = ({ modifier, context }: CellAt): string | undefined => {
    if (modifier === undefined || context === undefined) return collection.getDefaultMode();
    try {
      return resolver.getModeName({ [modifier]: context });
    } catch {
      return undefined;
    }
  };
  const named: Named = {
    at: (refPath, cell) => {
      const mode = modeOf(cell);
      if (mode === undefined) return { type: undefined, key: undefined, mode };
      return {
        type: readToken(ds, `${dsName}.${refPath}`, mode)?.$type,
        key: figmaValueIn(collection.getToken(refPath, mode)?.$extensions),
        mode,
      };
    },
    typeOf: (refPath, mode) => {
      for (const candidate of mode === undefined ? modeNames : [mode, ...modeNames]) {
        const type = readToken(ds, `${dsName}.${refPath}`, candidate)?.$type;
        if (type !== undefined) return type;
      }
      return undefined;
    },
  };

  // A token is judged by the tokens it refers to, so each is built when first asked for, wherever it comes in the document.
  const built = new Map<string, SumToken>();
  const building = new Set<string>();
  const targetOf = (path: string): SumToken | undefined => {
    // The sum holds one collection, so every lookup path is in it.
    const refPath = referencePath(path);
    const types = typesByPath.get(refPath);
    if (!types || building.has(refPath)) return undefined;
    let token = built.get(refPath);
    if (!token) {
      building.add(refPath);
      token = buildToken(resolver, dsName, baseName, refPath, types, conversionMap, defaults, leftOut, named, targetOf, declared);
      building.delete(refPath);
      built.set(refPath, token);
    }
    return token;
  };

  for (const refPath of typesByPath.keys()) tokens.push(targetOf(`${dsName}.${refPath}`) as SumToken);

  // Parts: a folded axis is a collection of its own, and the part tokens that fed it have no variable.
  const folds = foldsOf(collection, [...typesByPath.keys()], unfoldedFor(resolver));
  const taken = new Set(collections.map((entry) => entry.name));
  for (const axis of folds.collections.keys()) {
    if (taken.has(axis))
      throw new Error(
        `The part axis "${axis}" folds into a collection of that name, and the base collection or a modifier already has it. Rename the axis in the parts vocabulary, or lay its component out as one variable per part (layout=parts).`,
      );
  }
  const folded = foldTokens(tokens, folds, dsName, baseName);
  collections.push(...folded.collections);

  // What each variable is for. A part a fold took into another token's variable is judged by that token.
  const kept = new Set(folded.tokens.map((token) => token.path));
  const partsOf = new Map<string, string>();
  for (const [rest, axes] of folds.parts) {
    for (const byMode of axes.values()) {
      for (const part of byMode.values()) if (!kept.has(`${dsName}.${part}`)) partsOf.set(`${dsName}.${part}`, `${dsName}.${rest}`);
    }
  }
  const typeOf = (path: string): string | undefined => {
    const types = typesByPath.get(referencePath(path));
    return types?.size === 1 ? [...types][0] : undefined;
  };
  const warnings = assignPurposes({ collection, ds, baseName, tokens: folded.tokens, partsOf, declared, referrers, typeOf });

  for (const token of folded.tokens) {
    tokenByPath.set(token.path, token);
    for (const variable of token.variables) variableByKey.set(variable.key, variable);
  }

  return { dsName, collections, tokens: folded.tokens, tokenByPath, variableByKey, layouts: folds.components, warnings };
}

/** What a token's own definition says about its scopes: the list on its base, and the context that redefines it. */
function declarationIn(contexts: ReturnType<Resolver['contextsOf']>, out: (modifier: string, context: string) => boolean): Declared {
  const chain = contexts.chains.$extensions;
  if (!chain) return {};
  const base = scopesIn(chain.base);
  for (const link of chain.links) {
    for (const [context, step] of Object.entries(link.steps)) {
      if (out(link.modifier, context) || !('value' in step)) continue;
      const found = scopesIn(step.value);
      if (found !== undefined && JSON.stringify(found) !== JSON.stringify(base)) return { conflict: `${link.modifier}=${context}` };
    }
  }
  return base === undefined ? {} : { scopes: base };
}

function buildToken(
  resolver: Resolver,
  dsName: string,
  baseName: string,
  refPath: string,
  modeTypes: ReadonlySet<string>,
  conversionMap: TokenTypeConversionMap,
  defaults: Readonly<Record<string, string | undefined>>,
  leftOut: ReadonlyMap<string, ReadonlySet<string>>,
  named: Named,
  targetOf: (path: string) => SumToken | undefined,
  declared: Map<string, Declared>,
): SumToken {
  const path = `${dsName}.${refPath}`;
  /** Whether Figma does not get this context of this modifier: nothing of it is written. */
  const out = (modifier: string, context: string): boolean => leftOut.get(modifier)?.has(context) === true;

  // The types the token has anywhere: in any mode of the sum, and in any step of
  // its `$type` chain (a context that sets only the type, which the sum may not reach together).
  const types = new Set<string>(modeTypes);

  let contexts: ReturnType<Resolver['contextsOf']> | undefined;
  let contextsError: string | undefined;
  try {
    contexts = resolver.contextsOf(refPath);
  } catch (error) {
    contextsError = error instanceof Error ? error.message : String(error);
  }

  if (contexts) declared.set(refPath, declarationIn(contexts, out));

  const typeChain = contexts?.chains.$type;
  if (typeChain) {
    for (const link of typeChain.links) {
      for (const [context, step] of Object.entries(link.steps)) {
        if (!out(link.modifier, context) && 'value' in step && typeof step.value === 'string') types.add(step.value);
      }
    }
    if (typeof typeChain.base === 'string') types.add(typeChain.base);
  }

  // `figma.value`: a definition says what Figma writes where it cannot hold the CSS value. A token with no `$type` takes the type of what its keys name.
  const keyed = contexts !== undefined && namesFigmaValue(contexts);
  const cells = (): CellAt[] => {
    const chain = contexts?.chains.$value;
    if (!chain) return [];
    if (chain.links.length === 0) return [{}];
    return flatMap(chain.links, (link) =>
      Object.entries(link.steps)
        .filter(([context, step]) => 'value' in step && !out(link.modifier, context))
        .map(([context]): CellAt => ({ modifier: link.modifier, context })),
    );
  };
  let keyProblem: string | undefined;
  if (keyed && types.has('')) {
    const untyped = cells()
      .map((cell) => named.at(refPath, cell))
      .filter((found) => found.type === '');
    if (untyped.length > 0 && untyped.every((found) => found.key !== undefined)) {
      types.delete('');
      for (const { key, mode } of untyped) {
        const target = wholeTarget(key);
        const given = target === undefined ? undefined : named.typeOf(target, mode);
        if (given) types.add(given);
        else
          keyProblem = `"${path}" has no $type, and its figma.value ${JSON.stringify(key)} does not give it one: only a reference to a token has a type to give.`;
      }
    }
  }

  const routing = routeTypes([...types], conversionMap);
  const type = types.size === 1 ? [...types][0] : null;
  const unhomed = (reason: string): SumToken => ({ path, type, routing: { kind: 'refused', reason }, variables: [] });
  if (keyProblem) return unhomed(keyProblem);

  // Only a variable token needs a home; a style is built from the default mode.
  if (routing.kind !== 'variable') return { path, type, routing, variables: [] };

  if (!contexts) return unhomed(`lib cannot read this token across contexts: ${contextsError}`);
  const unfactorable = contexts.nonFactorable.find((entry) => entry.property === '$value');
  if (unfactorable) {
    // A chain cannot hold it, and binding it early, one variable per cell, would bring the product back for this one token.
    return unhomed(`${unfactorable.detail} A chain cannot hold it, so it is not written.`);
  }
  const chain = contexts.chains.$value;
  if (!chain) return unhomed('The token defines no value in any context.');
  // A hole in a context Figma does not get is not one: nothing is written there.
  const holes = chain.holes.filter((hole) => !Object.entries(hole).some(([modifier, context]) => out(modifier, context)));
  if (holes.length > 0) {
    const where = holes
      .map((hole) =>
        Object.entries(hole)
          .map(([modifier, context]) => `${modifier}=${context}`)
          .join(' '),
      )
      .join(', ');
    // Only a context defines it and the default is a hole: a variable needs a value in every mode.
    const defined = flatMap(chain.links, (link) =>
      Object.entries(link.steps)
        .filter(([context, step]) => 'value' in step && !out(link.modifier, context))
        .map(([context]) => `${link.modifier}=${context}`),
    );
    if (
      chain.base === undefined &&
      defined.length > 0 &&
      holes.some((hole) => Object.entries(hole).every(([modifier, context]) => defaults[modifier] === context))
    ) {
      return unhomed(
        `"${path}" is defined only in ${defined.join(', ')} and has no value where ${where}, the default; a Figma variable needs a value in every mode, so it is skipped.`,
      );
    }
    return unhomed(`The token has no value where ${where}, and a hole is not filled or guessed, so it is not written.`);
  }

  const name = tokenPathToVariableName(refPath);
  // `currentColor` has no value until an element uses it, and Figma has no equivalent: no variable holds it,
  // directly or through a reference that resolves to it.
  // A letter spacing in `em` is the same: a variable bound to letter spacing carries pixels, and `em` has none without a font size.
  const unholdable = (value: unknown): boolean =>
    (type === 'color' && isCurrentColor(value)) || (type === 'letterSpacing' && isEmLetterSpacing(value));
  // A reference to a token that is a variable (of this variable type) is an alias to it, whatever the chain beneath it ends in.
  const aliasesVariable = (cell: SumCell): boolean => {
    if (cell.kind !== 'reference') return false;
    const target = targetOf(cell.to);
    return target?.routing.kind === 'variable' && target.routing.variableType === routing.variableType && target.variables.length > 0;
  };
  const holds = (token: SumToken, test: (value: unknown) => boolean): boolean =>
    token.variables.some((variable) =>
      [...variable.cells.values()].some((cell) => cell.kind !== 'link' && !aliasesVariable(cell) && test(cell.value)),
    );
  const withoutUnholdable = (token: SumToken): SumToken =>
    type === 'color' && holds(token, isCurrentColor)
      ? unhomed(`"${path}" is currentColor, which Figma cannot hold; skipped.`)
      : type === 'letterSpacing' && holds(token, isEmLetterSpacing)
        ? unhomed(`"${path}" is a letter spacing in em, and a Figma variable bound to letter spacing carries pixels; skipped.`)
        : token;
  const cellFor = (raw: unknown, valuePath: string, input: ResolverInput, at: CellAt = {}): SumCell => {
    // What the value is in this context with everything followed; undefined when lib cannot say, with the core's
    // reason where it refuses to compute the value for the type.
    let refused: string | undefined;
    const resolved = (): unknown => {
      try {
        return resolver.valueAt(valuePath, input);
      } catch (error) {
        if (error instanceof InvalidTokenError) refused = error.message;
        return undefined;
      }
    };
    const key = keyed ? named.at(refPath, at) : undefined;
    let cell: SumCell | undefined;
    if (wholeTarget(raw) !== undefined) {
      const value = resolved();
      cell = { kind: 'reference', to: `${dsName}.${wholeTarget(raw)}`, value, ...(refused === undefined ? {} : { refused }) };
    } else if (holdsReference(raw)) {
      const value = resolved();
      if (refused !== undefined) cell = { kind: 'value', value, refused };
      else if (value === undefined) throw new Error(`The value "${JSON.stringify(raw)}" cannot be resolved in ${JSON.stringify(input)}.`);
      else cell = { kind: 'value', value };
    } else if (key?.key === undefined) {
      // A chain's value comes from lib in the shape it stores.
      return { kind: 'value', value: raw };
    } else {
      // Where a key is given, a value lib cannot read as the type is one Figma cannot hold. The type may be the key's,
      // given to a token with no $type of its own, which lib keeps as written: so the value is checked against it here.
      try {
        cell = { kind: 'value', value: normalizeTokenValue(type as string, raw, refPath) };
      } catch {
        cell = undefined;
      }
    }
    return key?.key === undefined ? (cell as SumCell) : keyedCell(key.key, cell, at, input);
  };
  /** Whether the definition a cell's value comes from carries its own `$extensions`, and not the ones another definition of the token gives it by falling through. */
  const definesKey = ({ modifier, context }: CellAt): boolean => {
    const extensions = contexts?.chains.$extensions;
    if (!extensions || modifier === undefined) return true;
    const link = extensions.links.find((candidate) => candidate.modifier === modifier);
    const step = link?.steps[context as string];
    // A step that carries the base to a context that defines nothing says so.
    return step !== undefined && 'value' in step && !step.base;
  };
  /** What a cell that Figma cannot hold is written as instead: the value its key names, checked like any reference. Throws, naming the token and the context. */
  const keyedCell = (key: unknown, own: SumCell | undefined, at: CellAt, input: ResolverInput): SumCell => {
    const where = `"${path}"${at.modifier === undefined ? '' : ` in ${at.modifier}=${at.context}`}`;
    // A reference to a variable follows the modes, so it never takes a key of its own: one the cell only inherits says nothing about it.
    if (own !== undefined && own.kind === 'reference' && aliasesVariable(own) && unholdable(own.value)) {
      if (!definesKey(at)) return own;
      throw new Error(
        `${where} has a figma.value, but it is a reference to "${own.to}", which Figma holds as a variable; remove the key, so that it follows the modes.`,
      );
    }
    if (own !== undefined && own.kind !== 'link' && own.refused === undefined && !unholdable(own.value)) {
      // A key the cell only inherits from another definition of the token says nothing about this one.
      if (!definesKey(at)) return own;
      throw new Error(
        `${where} has a figma.value, but its value is one Figma can hold; remove the key, so that the value stays the one both outputs write.`,
      );
    }
    const said = `${where}: figma.value ${JSON.stringify(key)}`;
    let cell: SumCell;
    const target = wholeTarget(key);
    if (target !== undefined) {
      let value: unknown;
      try {
        value = resolver.valueAt(target, input);
      } catch (error) {
        throw new Error(`${said} cannot be resolved: ${error instanceof Error ? error.message : String(error)}`);
      }
      const targetType = named.typeOf(target, named.at(refPath, at).mode);
      if (targetType !== type)
        throw new Error(
          `${said} is ${targetType ? `a ${targetType}` : 'not a token'}, and the token is ${type ? `a ${type}` : 'untyped'}.`,
        );
      cell = { kind: 'reference', to: `${dsName}.${target}`, value };
    } else {
      try {
        cell = { kind: 'value', value: normalizeTokenValue(type as string, key, refPath) };
      } catch (error) {
        throw new Error(`${said} is not a value of the token's type, ${type}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (unholdable(cell.value)) throw new Error(`${said} is a value Figma cannot hold either.`);
    return cell;
  };

  try {
    // No link: the base, in the base collection.
    if (chain.links.length === 0) {
      return withoutUnholdable({
        path,
        type,
        routing,
        variables: [
          {
            key: path,
            name,
            collection: baseName,
            codeSyntax: `var(${cssPropertyName(path)})`,
            cells: new Map([['default', cellFor(chain.base, refPath, {}, {})]]),
          },
        ],
      });
    }

    // One link or a chain: the head (links[0], the last-winning modifier) under the token's name, each earlier link under `<path>--<modifier>`.
    const variables = chain.links.map((link, index): SumVariable => {
      const cells = new Map<string, SumCell>();
      for (const [context, step] of Object.entries(link.steps)) {
        if (out(link.modifier, context)) continue;
        if ('value' in step)
          cells.set(context, cellFor(step.value, link.path, { [link.modifier]: context }, { modifier: link.modifier, context }));
        else if ('fallThrough' in step) cells.set(context, { kind: 'link', to: `${dsName}.${step.fallThrough}` });
      }
      return {
        key: index === 0 ? path : `${dsName}.${link.path}`,
        name: index === 0 ? name : linkVariableName(refPath, link.modifier),
        collection: link.modifier,
        codeSyntax: index === 0 ? `var(${cssPropertyName(path)})` : `var(${cssLinkName(cssPropertyName(path), link.modifier)})`,
        cells,
      };
    });
    return withoutUnholdable({ path, type, routing, variables });
  } catch (error) {
    return unhomed(error instanceof Error ? error.message : String(error));
  }
}
