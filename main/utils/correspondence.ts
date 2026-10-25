/**
 * Where a token stands between the document and Figma — the one comparison.
 *
 * ### Why this is not inside the sync engine
 *
 * Two readers ask the same question for different reasons. `VariableSyncEngine`
 * asks it to decide **what to do**; the Inspector asks it to describe **what
 * is**. Written twice, the two answers disagree eventually — and a screen
 * reporting drift beside a plan reporting none is the exact shape of smell #22,
 * one layer deeper than where it was found.
 *
 * So the comparison lives here, and both read it. What each does with the answer
 * stays its own: the engine emits operations, the Inspector names a state.
 *
 * ### The two facts, and why they are named apart
 *
 * | Fact | From | Conclusive? |
 * |---|---|---|
 * | **agreement** — does Figma hold what the document asks for? | `toFigmaValue` + `figmaValuesEqual` | yes, wherever a variable exists |
 * | **provenance** — has Figma moved since Toghen wrote it? | the variable's stamp | yes, wherever Toghen wrote |
 *
 * `drifted` is provenance: the stamp's receipt is a hash of what Figma reported
 * right after the write, so a value Figma reports now that hashes otherwise was
 * changed in Figma since. That holds whether or not the document moved too.
 *
 * Where Figma has not moved, it holds exactly what was written, so agreement
 * says whether the document moved: the two comparisons a stamp is for
 * (`tokenStamps.ts`).
 *
 * ### Several variables to a token
 *
 * With the sum (`sum.ts`) a token is one variable, or the links of a chain, each
 * in a collection of its own with its own record. The comparison is per variable,
 * and the token's condition is read across them.
 */

import type { CorrespondenceState } from '../../shared/protocol.js';
import { hashOf } from '../components/stamp.js';
import { getIndexedVariableByCollectionAndName, type FigmaCollectionIndex } from './figmaCollectionIndex.js';
import { figmaValuesEqual, isAlias, toFigmaValue, type FigmaUnit } from './figmaTokenAdapter.js';
import { sameScopes } from './purpose.js';
import { flatMap } from './lists.js';
import type { CollectionStanding } from './standing.js';
import { closedBecause } from './standing.js';
import type { Sum, SumCell, SumToken, SumVariable, TokenRouting } from './sum.js';
import { referencePath } from '@toghen/lib';
import { tokenPathToVariableName } from './tokenPath.js';
import { reportedScopes } from './tokenStamps.js';

export type { TokenRouting };

/**
 * Which Figma variable backs one variable of the sum, and how that was decided.
 *
 * A token that is not routed to a variable at all — style-backed, unsupported,
 * typed differently in different contexts, refused — has no variables to link,
 * so it never gets here. A variable whose collection was built by an earlier
 * sync gets `refuse` too. There is no fourth "not applicable" case, deliberately:
 * with three the engine can narrow to `create | use` after one check, and a
 * nullable fourth state would have to be handled at a point where it is already
 * known to be impossible.
 */
export type VariableLink =
  | { action: 'create'; symbolicId: string }
  | { action: 'use'; variableId: string; rename?: string; adopted: boolean }
  | { action: 'refuse'; reason: string };

export interface ModeCorrespondence {
  mode: string;
  /** The document declares a value for this variable in this mode. */
  present: boolean;
  /** The document's value, in Figma's representation, so both sides compare. */
  documentValue: VariableValue | null;
  /** What Figma holds. Null when there is no variable, or none for this mode. */
  figmaValue: VariableValue | null;
  /** Toghen wrote the mode: the variable's stamp is this token's and has a receipt for it, and Figma holds a value there. */
  written: boolean;
  /** Written, and Figma now reports something else than right after the write: changed in Figma since. */
  drifted: boolean;
  /** Null when there is nothing to compare against, which is not "differs". */
  agrees: boolean | null;
  /**
   * Why the document's value here cannot be turned into a Figma value, when it cannot: a colour that is a keyword,
   * a dimension that is two. A value lib stores as written (an untyped token, reached through a reference) can be
   * anything, and Figma holds a colour, a number, a string or a boolean.
   */
  unwritable?: string;
}

/**
 * A variable's scopes, the plan's and Figma's.
 *
 * Scopes follow the drift rule: Toghen records what it last wrote, and a scope list Figma holds that is not the
 * record is a designer's. `write`: the plan's differ and nobody changed Figma's (or the variable has no record and
 * holds what older Toghen wrote). `drift`: the plan's differ and a designer changed Figma's.
 */
export interface ScopeComparison {
  /** What the plan wants, from the token's purpose. */
  planned: VariableScope[];
  /** What Figma holds. Absent for a variable that does not exist yet. */
  held?: VariableScope[];
  state: 'same' | 'write' | 'drift';
}

/** One Figma variable of a token: its single home, or one link of its chain. */
export interface VariableCorrespondence {
  /** The record key: the token's lookup path, or a chain link's generated lookup path. */
  key: string;
  /** The Figma variable name. */
  name: string;
  /** The collection it lives in. */
  collection: string;
  link: VariableLink;
  /** One entry per mode of its collection, the default context first. */
  modes: ModeCorrespondence[];
  /** Why a reference the document makes is written as a value instead of an alias. */
  aliasWarnings: string[];
  /** The web code syntax the variable should carry. */
  codeSyntax: string;
  /** Figma already holds that syntax on the variable. False for a variable that does not exist yet. */
  codeSyntaxHeld: boolean;
  scopes: ScopeComparison;
}

export interface TokenCorrespondence {
  path: string;
  /** The Figma variable name of the token (the head of a chain). */
  variableName: string;
  /** The document's `$type`, or null when the contexts disagree about it. */
  type: string | null;
  routing: TokenRouting;
  /** The head first, then each earlier link of a chain. Empty unless the token routes to variables. */
  variables: VariableCorrespondence[];
}

export { tokenPathToVariableName };

const VARIABLE_SYMBOL = '$var:';

/** A variable this plan creates, by its collection and name: two collections may hold one name. */
export function symbolicVariableId(collection: string, variableName: string): string {
  return `${VARIABLE_SYMBOL}${collection}/${variableName}`;
}

/** The variable name a symbolic variable id stands for, or undefined for a real id. */
export function variableNameOfSymbol(id: string): string | undefined {
  if (!id.startsWith(VARIABLE_SYMBOL)) return undefined;
  const rest = id.slice(VARIABLE_SYMBOL.length);
  return rest.slice(rest.indexOf('/') + 1);
}

export interface CompareTokenArgs {
  token: SumToken;
  sum: Sum;
  standing: ReadonlyMap<string, CollectionStanding>;
  /** The file's variables. An alias target is linked the way the target itself is, so a target renamed in Figma is still found by its stamp. */
  figmaIndex: FigmaCollectionIndex;
}

/**
 * Compares one token with Figma, in every variable it is made of.
 *
 * Values are only converted for variable-routed tokens. `toFigmaValue` throws on
 * a `shadow` or `typography` value by design — there is no variable shape for
 * them — so reaching it for a style-routed token would turn a token the plugin
 * handles perfectly well into a crash.
 */
export function compareToken(args: CompareTokenArgs): TokenCorrespondence {
  const { token } = args;
  const base = {
    path: token.path,
    variableName: tokenPathToVariableName(referencePath(token.path)),
    type: token.type,
    routing: token.routing,
  };
  if (token.routing.kind !== 'variable') return { ...base, variables: [] };

  const variableType = token.routing.variableType;
  const variables = token.variables.map((variable) => compareVariable(variable, token, variableType, args));
  return { ...base, variables };
}

function compareVariable(
  variable: SumVariable,
  token: SumToken,
  variableType: VariableResolvedDataType,
  args: CompareTokenArgs,
): VariableCorrespondence {
  const { figmaIndex } = args;
  const standing = args.standing.get(variable.collection) as CollectionStanding;
  const modeNames = standing.spec.modes;
  const tokenType = token.type as string;

  const base = {
    key: variable.key,
    name: variable.name,
    collection: variable.collection,
    codeSyntax: variable.codeSyntax,
  };

  // A number that is an opacity is written as the percentage Figma holds, and its hash says so.
  const unit: FigmaUnit | undefined = token.purpose?.opacity ? 'percent' : undefined;
  const planned = token.purpose?.scopes ?? ['ALL_SCOPES'];

  const link = linkVariable({ variable, variableType, figmaIndex, standing });
  if (link.action === 'refuse') {
    return {
      ...base,
      link,
      codeSyntaxHeld: true,
      scopes: { planned, state: 'same' },
      aliasWarnings: [],
      modes: modeNames.map((mode) => unmeasured(mode, variable.cells.has(mode))),
    };
  }

  const held = link.action === 'use' ? figmaIndex.variableById[link.variableId] : undefined;
  const figmaValues = held?.valuesByMode;
  // A receipt counts for the variable it is on, and only where Toghen found that variable by its stamp: one adopted by
  // name holds no receipt of this token's, whatever its stamp says.
  const receipt = link.action === 'use' && !link.adopted ? (held?.stamp?.receipt ?? {}) : {};
  const aliasWarnings = new Set<string>();

  const modes = modeNames.map((mode): ModeCorrespondence => {
    const cell = variable.cells.get(mode);
    if (!cell) return unmeasured(mode, false);
    // The core refuses to compute the value for the type, and says why: the cell cannot be written, and the token is skipped whole.
    if (cell.kind !== 'link' && cell.refused !== undefined) return { ...unmeasured(mode, false), unwritable: cell.refused };

    const alias = aliasTarget(token.path, cell, variableType, args);
    let aliased = alias && 'id' in alias ? alias : undefined;
    const value = cell.kind === 'link' ? undefined : cell.value;

    // An alias that would loop back into this variable is never written: the value is.
    if (aliased && leadsBack(aliased.target, variable, link.action === 'use' ? link.variableId : undefined, variableType, args)) {
      aliased = undefined;
      if (value !== undefined) {
        aliasWarnings.add(
          `"${token.path}" refers to "${(cell as { to: string }).to}", which leads back to "${variable.name}" in Figma, so the value is written instead of an alias.`,
        );
      }
    }

    // A reference that cannot be an alias and cannot be resolved has nothing to write, and says so
    // in place of the warning that would have promised the value.
    if (!aliased && value === undefined) {
      aliasWarnings.add(
        `"${token.path}" refers to "${(cell as { to: string }).to}", whose value cannot be read in ${variable.collection} / ${mode}, so nothing is written for it there.`,
      );
      return unmeasured(mode, false);
    }
    if (alias && 'warning' in alias) aliasWarnings.add(alias.warning);

    let documentValue: VariableValue;
    if (aliased) {
      documentValue = { type: 'VARIABLE_ALIAS', id: aliased.id };
    } else {
      try {
        documentValue = toFigmaValue(value, tokenType, unit);
      } catch (error) {
        return { ...unmeasured(mode, false), unwritable: error instanceof Error ? error.message : String(error) };
      }
    }

    const modeId = standing.modeId(mode);
    const heldValue = figmaValues?.[modeId];
    const figmaValue = heldValue === undefined ? null : heldValue;
    // A mode Figma holds nothing in was never written there, whatever a receipt says.
    const recorded = figmaValue === null ? undefined : receipt[modeId];

    return {
      mode,
      present: true,
      documentValue,
      figmaValue,
      written: recorded !== undefined,
      // Exact, not within a tolerance: the receipt hashes what Figma reported, float32 and all.
      drifted: recorded !== undefined && hashOf(figmaValue) !== recorded,
      agrees: figmaValue === null ? null : figmaValuesEqual(figmaValue, documentValue),
    };
  });

  return {
    ...base,
    link,
    modes,
    aliasWarnings: [...aliasWarnings],
    codeSyntaxHeld: held?.codeSyntaxWeb === variable.codeSyntax,
    scopes: compareScopes(
      planned,
      link,
      held?.scopes,
      receipt.scopes,
      token.type === 'letterSpacing' ? ['LETTER_SPACING'] : ['ALL_SCOPES'],
    ),
  };
}

/**
 * Whether the plan's scopes may be written to the variable, by the drift rule. `recorded` is the receipt's hash of the
 * scopes Figma reported after Toghen wrote them, from the variable's own stamp; a variable with none is judged by
 * whether it still holds what older Toghen wrote to every variable (`ALL_SCOPES`, or `LETTER_SPACING` for a letter
 * spacing): anything else is a designer's.
 */
function compareScopes(
  planned: VariableScope[],
  link: VariableLink,
  held: readonly VariableScope[] | undefined,
  recorded: string | undefined,
  formerly: readonly VariableScope[],
): ScopeComparison {
  if (link.action !== 'use' || held === undefined) return { planned, state: 'write' };
  if (sameScopes(held, planned)) return { planned, held: [...held], state: 'same' };
  const untouched = recorded !== undefined ? hashOf(reportedScopes(held)) === recorded : sameScopes(held, formerly);
  return { planned, held: [...held], state: untouched ? 'write' : 'drift' };
}

/**
 * The variable a reference or a chain's fall-through is written as an alias to,
 * or why it cannot be.
 *
 * The target is linked by `linkVariable`, the same call that decides the
 * target's own row, so the id here is the one the target's `CREATE_VARIABLE`
 * produces or the one it already has. Figma aliases only between variables of
 * one type, so a target that routes elsewhere keeps the value. A reference to a
 * token whose value is a chain aliases the head, the variable that carries the
 * token's name.
 */
function aliasTarget(
  owner: string,
  cell: SumCell,
  variableType: VariableResolvedDataType,
  args: CompareTokenArgs,
): { id: string; target: SumVariable } | { warning: string } | undefined {
  if (cell.kind === 'value') return undefined;

  const refused = (why: string) => ({
    warning: `"${owner}" refers to "${cell.to}", ${why}, so the value is written instead of an alias.`,
  });

  let target: SumVariable | undefined;
  if (cell.kind === 'link') {
    // The next link of the same token: the same variable type by construction.
    target = args.sum.variableByKey.get(cell.to);
    if (!target) return { warning: `"${owner}" falls through to "${cell.to}", which is not in the plan.` };
  } else {
    const targetToken = args.sum.tokenByPath.get(cell.to);
    if (targetToken?.routing.kind !== 'variable') return refused('which does not become a variable');
    if (targetToken.routing.variableType !== variableType) {
      return refused(`but they become different variable types (${variableType}, ${targetToken.routing.variableType})`);
    }
    // An alias hands over the raw number, so it joins variables of one unit only: a percentage to a percentage, a plain number to a plain number.
    const ownerOpacity = args.sum.tokenByPath.get(owner)?.purpose?.opacity === true;
    if (ownerOpacity !== (targetToken.purpose?.opacity === true)) {
      return {
        warning: `"${owner}" is ${ownerOpacity ? 'an opacity' : 'not an opacity'} and refers to "${cell.to}", which ${ownerOpacity ? 'is not one' : 'is one'}, so the value is written instead of an alias.`,
      };
    }
    target = targetToken.variables[0];
  }

  const link = linkVariable({
    variable: target,
    variableType,
    figmaIndex: args.figmaIndex,
    standing: args.standing.get(target.collection) as CollectionStanding,
  });
  if (link.action === 'refuse') return refused('which cannot be synced');

  return { id: link.action === 'create' ? link.symbolicId : link.variableId, target };
}

/**
 * Whether an alias to `from` would lead back to `goal`, the variable it is written into (`goalId` is the one Figma
 * holds for it, if any). Follows every mode of each variable: the aliases the plan writes (link and reference cells)
 * and the ones Figma holds, since a mode the plan leaves alone keeps what it has. A held alias that the plan is
 * about to replace counts too, which only ever writes a value where an alias would have done.
 */
function leadsBack(
  from: SumVariable,
  goal: SumVariable,
  goalId: string | undefined,
  variableType: VariableResolvedDataType,
  args: CompareTokenArgs,
): boolean {
  const seen = new Set<string>();
  const held = (id: string): boolean => {
    if (id === goalId) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return Object.values(args.figmaIndex.variableById[id]?.valuesByMode ?? {}).some((value) => isAlias(value) && held(value.id));
  };
  const walk = (variable: SumVariable): boolean => {
    if (variable.key === goal.key) return true;
    if (seen.has(variable.key)) return false;
    seen.add(variable.key);
    for (const cell of variable.cells.values()) {
      const next =
        cell.kind === 'link'
          ? args.sum.variableByKey.get(cell.to)
          : cell.kind === 'reference'
            ? args.sum.tokenByPath.get(cell.to)?.variables[0]
            : undefined;
      if (next && walk(next)) return true;
    }
    const link = linkVariable({
      variable,
      variableType,
      figmaIndex: args.figmaIndex,
      standing: args.standing.get(variable.collection) as CollectionStanding,
    });
    return link.action === 'use' && held(link.variableId);
  };
  return walk(from);
}

function unmeasured(mode: string, present: boolean): ModeCorrespondence {
  return {
    mode,
    present,
    documentValue: null,
    figmaValue: null,
    written: false,
    drifted: false,
    agrees: null,
  };
}

/* ─── The engine's view: what to do ─── */

/**
 * Modes whose value has to be written.
 *
 * Note that this is **provenance first, then agreement**: where Figma has not
 * moved since Toghen wrote, it holds what was written, and the mode is written
 * when the document asks for something else. Where Figma has moved and does not
 * hold the document's value, that is a hand edit: writing on agreement alone
 * would silently discard it. With `overwriteDrift` the edit is taken back on
 * purpose. A mode Toghen never wrote is written, and so is one Figma moved to
 * the document's own value, which changes nothing visible and stamps it.
 */
export function staleModes(variable: VariableCorrespondence, overwriteDrift = false): Array<{ modeName: string; value: VariableValue }> {
  return variable.modes
    .filter((mode) => mode.present && (mode.written && !mode.drifted ? mode.agrees === false : overwriteDrift || !isDrift(mode)))
    .map((mode) => ({ modeName: mode.mode, value: mode.documentValue as VariableValue }));
}

/** Modes Figma moved since Toghen wrote them, and that do not hold the document's value. */
export function driftedModes(variable: VariableCorrespondence): string[] {
  return variable.modes.filter(isDrift).map((mode) => mode.mode);
}

const isDrift = (mode: ModeCorrespondence): boolean => mode.drifted && mode.agrees === false;

/** The cells of a token whose value Figma cannot hold: where (`collection / mode`) and why. */
export function unwritableCells(correspondence: TokenCorrespondence): Array<{ context: string; reason: string }> {
  return flatMap(correspondence.variables, (variable) =>
    variable.modes
      .filter((mode) => mode.unwritable !== undefined)
      .map((mode) => ({ context: `${variable.collection} / ${mode.mode}`, reason: mode.unwritable as string })),
  );
}

/* ─── The Inspector's view: what is ─── */

export interface StateDescription {
  state: CorrespondenceState;
  /** Why, in words. Detail rides on the row it explains (R14). */
  note?: string;
}

/**
 * Names a token's condition, across every variable it is made of.
 *
 * Every phrase here describes something **observed**. None of them says what a
 * sync would do — that is the plan's sentence to write, and two regions of one
 * screen each predicting the future is how they come to disagree. Where the
 * Inspector and a plan differ, they differ about tense, not about fact.
 */
export function describeState(correspondence: TokenCorrespondence): StateDescription {
  const { routing, variables } = correspondence;

  if (routing.kind === 'style') {
    return { state: 'not_inspected', note: describeRouting(routing) };
  }
  if (routing.kind !== 'variable') {
    return { state: 'blocked', note: describeRouting(routing) };
  }

  const refused = variables.find((variable) => variable.link.action === 'refuse');
  if (refused && refused.link.action === 'refuse') return { state: 'blocked', note: refused.link.reason };

  const unwritable = unwritableCells(correspondence);
  if (unwritable.length > 0) {
    return { state: 'blocked', note: unwritable.map((cell) => `${cell.context}: ${cell.reason}`).join(' ') };
  }

  const missing = variables.filter((variable) => variable.link.action === 'create');
  if (missing.length === variables.length) {
    return { state: 'absent', note: 'No Figma variable holds this token.' };
  }
  if (missing.length > 0) {
    return {
      state: 'outdated',
      note: `The chain is incomplete: no Figma variable holds ${missing.map((variable) => `"${variable.name}"`).join(' or ')}.`,
    };
  }

  const drifted = flatMap(variables, (variable) => driftedModes(variable).map((mode) => `${variable.collection}/${mode}`));
  if (drifted.length > 0) {
    return {
      state: 'drifted',
      note: `Figma holds a different value in ${listModes(drifted)} than Toghen wrote there, so the change was made here.`,
    };
  }

  const adopted = variables.find((variable) => variable.link.action === 'use' && variable.link.adopted);
  if (adopted) {
    return {
      state: 'adopted',
      note: `A variable named "${adopted.name}" already exists and was not written by Toghen. Nothing records what it held before.`,
    };
  }

  const modes = flatMap(variables, (variable) => variable.modes.map((mode) => ({ ...mode, mode: `${variable.collection}/${mode.mode}` })));
  const unmeasuredModes = modes.filter((mode) => mode.present && mode.agrees === null).map((mode) => mode.mode);
  if (unmeasuredModes.length > 0) {
    return {
      state: 'outdated',
      note: `The variable exists but holds no value in ${listModes(unmeasuredModes)}.`,
    };
  }

  const unstamped = modes.filter((mode) => mode.present && (!mode.written || mode.drifted));
  const disagreeing = modes.filter((mode) => mode.agrees === false);

  if (disagreeing.length > 0) {
    return {
      state: 'outdated',
      note:
        `The document has changed since this was last written, and Figma holds ` +
        `something else in ${listModes(disagreeing.map((mode) => mode.mode))}.`,
    };
  }

  if (unstamped.length > 0) {
    // Both sides hold the same value; only the stamp does not say Toghen wrote
    // it. Calling this `outdated` would report a difference that a direct
    // comparison says is not there — and agreement is the fact this module can
    // actually check (R11).
    return {
      state: 'current',
      note:
        `Figma matches the document. The variable's stamp does not record this ` +
        `value, so a sync would write it again with no visible effect.`,
    };
  }

  return { state: 'current' };
}

/** Why a token's type or shape stops it reaching a Figma variable, in words. */
export function describeRouting(routing: TokenRouting): string {
  switch (routing.kind) {
    case 'style':
      return 'Backed by a Figma style. Styles are not compared yet, so this row reports nothing about it either way.';
    case 'type-conflict':
      return (
        `The document gives this token different types in different contexts ` +
        `(${routing.types.join(', ')}). A Figma variable has one type.`
      );
    case 'unsupported':
      return `No Figma variable can hold a token of type "${routing.tokenType ?? 'unknown'}".`;
    case 'missing-route':
      return `Type "${routing.tokenType}" is routed to a variable with no variable type to use.`;
    case 'refused':
      return routing.reason;
    case 'variable':
      return '';
  }
}

function listModes(modes: readonly string[]): string {
  return modes.length === 1 ? `${modes[0]}` : modes.join(' and ');
}

/* ─── Linking ─── */

/**
 * Decides which Figma variable backs a variable of the sum.
 *
 * Ordering matters. A type mismatch has to be caught *before* falling through to
 * "create", because Figma variables cannot change `resolvedType` and the name is
 * already taken — the old code planned a `CREATE_VARIABLE` that Figma rejects,
 * which lost the symbolic id and cascaded into every dependent operation
 * failing.
 *
 * A variable is found by its stamp, and only inside the collection the variable
 * belongs to: the sum never reaches into a collection an earlier sync built, and
 * the variable a token had before it moved collection is `moves.ts`'s. A name
 * finds one only to adopt it.
 */
function linkVariable(args: {
  variable: SumVariable;
  variableType: VariableResolvedDataType;
  figmaIndex: FigmaCollectionIndex;
  standing: CollectionStanding;
}): VariableLink {
  const { variable, variableType, figmaIndex, standing } = args;
  const { key: path, name: variableName } = variable;

  const closed = closedBecause(standing);
  if (closed) return { action: 'refuse', reason: closed.message };

  const cached = figmaIndex.variablesByToken[path]?.find((stamped) => stamped.variableCollectionId === standing.existing?.id);
  if (cached) {
    if (cached.resolvedType !== variableType) {
      return {
        action: 'refuse',
        reason:
          `"${path}" is ${variableType} in the document but the variable it is ` +
          `linked to is ${cached.resolvedType}. A Figma variable cannot change type — ` +
          `delete "${cached.name}" in Figma to have it recreated.`,
      };
    }
    // A manual rename in Figma does not change the stamp, so the variable is
    // still found. Without this the drift is invisible: the plan reports
    // "unchanged" and the file quietly diverges from the document.
    return {
      action: 'use',
      variableId: cached.id,
      rename: cached.name === variableName ? undefined : variableName,
      adopted: false,
    };
  }

  if (standing.existing) {
    const byName = getIndexedVariableByCollectionAndName(figmaIndex, standing.existing.id, variableName);
    if (byName) {
      if (byName.resolvedType !== variableType) {
        return {
          action: 'refuse',
          reason:
            `"${path}" is ${variableType} in the document but a ${byName.resolvedType} ` +
            `variable named "${variableName}" already exists. Figma cannot change a ` +
            `variable's type — delete it to have it recreated.`,
        };
      }
      // Found by name with no stamp of this token's: this variable was not
      // written by Toghen for it, and syncing writes into somebody else's
      // object. A receipt on it, if any, is another token's and is not read.
      // Worth naming apart from a plain link — see `adopted` in describeState.
      return { action: 'use', variableId: byName.id, adopted: true };
    }
  }

  return { action: 'create', symbolicId: symbolicVariableId(variable.collection, variableName) };
}
