import type { Resolver } from '@toghen/lib';
import type { TokenTypeConversionMap } from '../../shared/tokenTypeMap.js';
import { countSkipsByCause, type Operation, type SkipCounts, type SyncPlan } from '../../shared/operations.js';
import { indexFigmaCollections } from '../utils/figmaCollectionIndex.js';
import { flatMap } from '../utils/lists.js';
import {
  compareToken,
  describeRouting,
  driftedModes as driftedModesOf,
  staleModes as staleModesOf,
  unwritableCells,
} from '../utils/correspondence.js';
import { builtEarlier, closedBecause, standingOf, type CollectionStanding } from '../utils/standing.js';
import { MAX_MODES } from '../utils/resolverModes.js';
import { layoutSaid } from '../utils/folds.js';
import { movesOf } from '../utils/moves.js';
import { keepsNoStamp } from '../components/stamp.js';
import { buildSum, type Sum, type SumCollection } from '../utils/sum.js';

export interface PlanSummary {
  [key: string]: number | SkipCounts;
  total: number;
  creates: number;
  updates: number;
  skips: number;
  /** `skips` by cause: their sum is `skips`. */
  skipsByCause: SkipCounts;
  /** Paths Figma holds a different value for than the last sync wrote. */
  drifted: number;
  modes: number;
  warnings: number;
  renames: number;
  /** Variables whose scopes the plan writes, apart from creating them. */
  scopes: number;
  /** Steps that lose something in Figma: modes the document no longer has. */
  breaking: number;
}

export interface PlanOptions {
  /** Whether the plan carries the steps that lose something in Figma, or only lists them. */
  allowBreaking?: boolean;
  /** Whether a mode Figma holds another value for than the sync wrote is written with the document's, or left alone. */
  overwriteDrift?: boolean;
}

/** @see SyncPlan — shared with style sync, which has the same contract. */
export type VariablePlan = SyncPlan;

/**
 * Moves every `SET_VARIABLE_VALUE` after every `CREATE_VARIABLE`, keeping each
 * group's order.
 *
 * Paths are planned in document order, so an alias can be planned before the
 * variable it points at is created, and the runner resolves a symbolic id only
 * once its producer has run. A stable partition is all that fixes: the one
 * dependency between those two kinds is set-after-create, and everything else
 * stays where document order put it. A general sort would reorder rows for no
 * dependency at all.
 */
function createsBeforeSets(operations: Operation[]): Operation[] {
  const sets = operations.filter((op) => op.kind === 'SET_VARIABLE_VALUE');
  const rest = operations.filter((op) => op.kind !== 'SET_VARIABLE_VALUE');

  let lastCreate = -1;
  rest.forEach((op, index) => {
    if (op.kind === 'CREATE_VARIABLE') lastCreate = index;
  });
  if (lastCreate < 0) return operations;

  return [...rest.slice(0, lastCreate + 1), ...sets, ...rest.slice(lastCreate + 1)];
}

function scopesOperation(variableId: string, scopes: VariableScope[], path: string): Operation {
  return { kind: 'SET_VARIABLE_SCOPES', variableId, scopes, path };
}

/** Writes the web code syntax. Android and iOS are not written: their spellings are not Toghen's to invent. */
function codeSyntaxOperation(variableId: string, value: string, path: string): Operation {
  return { kind: 'SET_CODE_SYNTAX', variableId, platform: 'WEB', value, path };
}

export class VariableSyncEngine {
  /**
   * Builds a variable sync plan: the sum, a base collection and a collection per modifier.
   *
   * Where every token lives, and what each mode of it holds, is `utils/sum.ts`;
   * the comparison with Figma lives in `utils/correspondence.ts`, which the
   * Inspector reads too. This method decides only what to *do* about the
   * answer — see that file for how a variable's stamp tells a hand edit from a
   * document that moved.
   *
   * `collectionName` names the base collection. A modifier's collection is named
   * after the modifier.
   *
   * A token whose home changed since the last sync (`utils/moves.ts`) is one breaking step: the old variable is
   * removed and a new one created, aliases to the old one written again.
   *
   * A mode a modifier's collection holds and the modifier no longer has is a
   * breaking step: it is always listed (`BREAKING`), and the plan carries the
   * deletion (`DELETE_MODE`, after every value is written) only with `allowBreaking`.
   */
  async buildPlan(
    resolver: Resolver,
    collectionName: string,
    conversionMap: TokenTypeConversionMap,
    options: PlanOptions = {},
  ): Promise<VariablePlan> {
    const deletions: Operation[] = [];
    const operations: Operation[] = [];
    // A plan that stops before its first write: one warning, nothing to run.
    const stopped = (message: string): VariablePlan => ({
      operations: [{ kind: 'WARNING', message, stops: true }],
    });

    let sum: Sum;
    try {
      sum = buildSum(resolver, collectionName, conversionMap);
    } catch (error) {
      return stopped(error instanceof Error ? error.message : String(error));
    }

    // Figma refuses the 11th mode of a collection, after everything before it is written. Found here, a dry run
    // finds it too. Every collection over the limit is said, so a document is fixed in one pass.
    const over = sum.collections.filter((collection) => collection.modes.length > MAX_MODES);
    if (over.length > 0) {
      return {
        operations: over.map((collection) => ({
          kind: 'WARNING' as const,
          message:
            `"${collection.name}" has ${collection.modes.length} contexts for Figma and Figma allows ${MAX_MODES} modes per collection; ` +
            `keep at most ${MAX_MODES} of them in figma.include.`,
          stops: true as const,
        })),
      };
    }

    if (sum.tokens.length === 0) {
      return { operations };
    }

    const sharing = sum.collections.slice(1).find((collection) => collection.name === collectionName);
    if (sharing) {
      return stopped(
        `The base collection is named "${collectionName}", which is also the name of the modifier ` +
          `"${sharing.name}" and its collection. Name the base collection something else.`,
      );
    }

    const figmaIndex = await indexFigmaCollections();
    const standing = standingOf(sum, figmaIndex);

    // The base collection holds the tokens no modifier defines. If an earlier
    // sync took its name, nothing is written at all: the run stops before it starts.
    const base = standing.get(collectionName) as CollectionStanding;
    if (builtEarlier(base)) {
      return stopped((closedBecause(base) as { message: string }).message);
    }

    for (const spec of sum.collections) {
      const here = standing.get(spec.name) as CollectionStanding;
      const closed = closedBecause(here);
      if (closed) {
        operations.push({ kind: 'WARNING', message: `${closed.message} The tokens that live in it are not written.` });
      } else if (!here.existing) {
        operations.push({
          kind: 'CREATE_COLLECTION',
          symbolicId: here.id,
          name: spec.name,
          // Default first: Figma's default mode is always modes[0], and it can be
          // neither assigned nor reordered afterwards, so creation order is the
          // only non-destructive chance to get it right.
          modes: spec.modes,
        });
      } else {
        const reconciled = this.reconcileModes(here, spec, options.allowBreaking === true);
        operations.push(...reconciled.operations);
        deletions.push(...reconciled.deletions);
      }
    }

    // A collection holding variables stamped for this document's tokens, which no collection of the sum is named for
    // any more: its modifier is gone. Removing a whole collection is not designed, so it is left alone.
    const named = new Set(sum.collections.map((collection) => collection.name));
    const vanished = new Set<string>();
    for (const [token, stamped] of Object.entries(figmaIndex.variablesByToken)) {
      if (!token.startsWith(`${sum.dsName}.`)) continue;
      for (const variable of stamped) {
        const collection = figmaIndex.byId[variable.variableCollectionId];
        if (collection && !named.has(collection.name)) vanished.add(collection.name);
      }
    }
    for (const name of vanished) {
      operations.push({
        kind: 'WARNING',
        message:
          `Collection "${name}" holds variables this document wrote, but nothing in the document is named ` +
          `"${name}" any more (a modifier of that name is gone). It is left alone.`,
      });
    }

    // A person's copy of a variable this document's sync wrote carries its stamp, and is left alone: listed, so that a
    // copy nobody noticed does not become a question later.
    for (const { copy, of } of figmaIndex.copies) {
      const token = of.stamp?.is.token;
      if (token === undefined || !token.startsWith(`${sum.dsName}.`)) continue;
      operations.push({
        kind: 'SKIP',
        reason: `"${copy.name}" (${copy.id}) is a copy of Toghen's "${of.name}", left alone`,
        path: token,
        cause: 'copy',
        reported: true,
      });
    }

    // No silent mixing: a component whose parts are not all folded is said, with the token or the condition that stopped each axis.
    for (const layout of sum.layouts) {
      const said = layoutSaid(layout);
      if (said) operations.push({ kind: 'WARNING', message: said });
    }

    // What the purposes of the variables have to say apart from a token's refusal: a part that declares a list its variable ignores.
    for (const message of sum.warnings) operations.push({ kind: 'WARNING', message });

    // A token whose home changed since the last sync: the variable stamped for it is in the old collection. It is
    // removed and a new one made (Figma has no move for a variable): the new variable is linked as a first one, and
    // every value is written. An alias to the old one is written again, since the document's alias names the new one.
    const moves = movesOf(sum, standing, figmaIndex);

    for (const token of sum.tokens) {
      const compared = compareToken({ token, sum, standing, figmaIndex });
      const { routing, variables } = compared;
      const path = token.path;

      if (routing.kind === 'type-conflict') {
        operations.push({
          kind: 'WARNING',
          message:
            `Token has different types across contexts (${routing.types.join(', ')}); ` +
            `a Figma variable has one type, so it cannot be synced.`,
          path,
        });
        continue;
      }
      if (routing.kind === 'unsupported') {
        operations.push({
          kind: 'SKIP',
          reason: `"${path}": unsupported token type ${routing.tokenType || 'none'}`,
          path,
          cause: 'unsupported-type',
        });
        continue;
      }
      // A style's token is the style plan's: this plan lists only the tokens it is for (ruling 11b).
      if (routing.kind === 'style') continue;
      if (routing.kind === 'missing-route') {
        operations.push({
          kind: 'WARNING',
          message: `Missing variableType route for token type ${routing.tokenType}`,
          path,
        });
        continue;
      }
      if (routing.kind === 'refused') {
        // A list of scopes or an opacity Figma cannot hold is a skip, said once, as a value it cannot hold is.
        operations.push(
          routing.skip
            ? { kind: 'SKIP', reason: describeRouting(routing), path, cause: 'refused-routing', reported: true }
            : { kind: 'WARNING', message: describeRouting(routing), path },
        );
        continue;
      }

      // A token is written whole or not at all: a chain with a link in a
      // collection nothing may be written to would be half a chain.
      const refused = variables.find((variable) => variable.link.action === 'refuse');
      if (refused && refused.link.action === 'refuse') {
        operations.push({ kind: 'WARNING', message: refused.link.reason, path });
        const closed = closedBecause(standing.get(refused.collection) as CollectionStanding);
        operations.push({
          kind: 'SKIP',
          reason: `"${path}" is not written: ${closed?.skip ?? 'a variable it links to has another type'}`,
          path,
          cause: closed ? 'closed-collection' : 'type-conflict',
        });
        continue;
      }

      // A value Figma cannot hold is a skip, one row for each cell, and the token is not half written: the plan goes on.
      const unwritable = unwritableCells(compared);
      if (unwritable.length > 0) {
        for (const cell of unwritable) {
          operations.push({
            kind: 'SKIP',
            reason: `"${path}" cannot be written in ${cell.context}: ${cell.reason}`,
            path,
            cause: 'cannot-write',
          });
        }
        continue;
      }

      const stale = variables.map((variable) => staleModesOf(variable, options.overwriteDrift));
      // Taken on purpose, drift is written and not reported.
      const drifted = options.overwriteDrift ? [] : [...new Set(flatMap(variables, (variable) => driftedModesOf(variable)))];
      // Scopes follow the drift rule too: a list a designer changed is kept, and said.
      const scopeDrift = options.overwriteDrift ? [] : variables.filter((variable) => variable.scopes.state === 'drift');
      const writesScopes = (variable: (typeof variables)[number]): boolean =>
        variable.scopes.state === 'write' || (variable.scopes.state === 'drift' && options.overwriteDrift === true);

      const driftMessages = [
        ...(drifted.length > 0
          ? [
              `Changed in Figma since the last sync (${drifted.join(', ')}). ` +
                `Figma no longer holds the value that was written, so this is a local edit — ` +
                `it is left alone rather than overwritten; pass --overwrite-drift to write the document's value.`,
            ]
          : []),
        ...scopeDrift.map(
          (variable) =>
            `The scopes ${variables.length > 1 ? `of "${variable.name}" ` : ''}were changed in Figma since the last sync ` +
            `(Figma holds ${(variable.scopes.held ?? []).join(', ') || 'none'}; the document asks for ${variable.scopes.planned.join(', ') || 'none'}). ` +
            `They are left alone rather than overwritten; pass --overwrite-drift to write the document's scopes.`,
        ),
      ];
      const driftMessage = driftMessages.length > 0 ? driftMessages.join(' ') : undefined;

      for (const message of new Set(flatMap(variables, (variable) => variable.aliasWarnings))) {
        operations.push({ kind: 'WARNING', message, path });
      }

      // The step that loses something: listed always, until it is taken, and carried only when the request allows
      // breaking, after every value (and every alias to the old variable) is written.
      for (const variable of variables) {
        for (const move of moves.get(variable.key) ?? []) {
          // A person's copy of the old variable loses its stamp with it, so it is never taken for the original moved.
          const copies = figmaIndex.copies.filter(({ of }) => of.id === move.variableId).map(({ copy }) => copy);
          operations.push({
            kind: 'BREAKING',
            message: `"${move.name}" moves from "${move.from}" to "${move.to}"; the old variable is removed${copies.length > 0 ? `; ${keepsNoStamp(copies)}` : ''}.`,
            moved: { collection: move.from, name: move.oldName },
          });
          if (options.allowBreaking) {
            deletions.push({
              kind: 'DELETE_VARIABLE',
              variableId: move.variableId,
              variableName: move.oldName,
              collectionName: move.from,
              ...(variable.link.action === 'create' ? { after: variable.link.symbolicId } : {}),
              ...(copies.length > 0 ? { strip: copies.map((copy) => copy.id) } : {}),
            });
          }
        }
      }

      // A variable that moved records its own id on the next write to it; where the plan writes nothing to it that
      // stamps it, the stamp is written on its own.
      variables.forEach((variable, index) => {
        const link = variable.link;
        if (
          link.action === 'use' &&
          figmaIndex.variableById[link.variableId]?.moved &&
          stale[index].length === 0 &&
          !writesScopes(variable)
        ) {
          operations.push({ kind: 'STAMP', target: 'variable', id: link.variableId, path: variable.key });
        }
      });

      if (stale.every((modes) => modes.length === 0)) {
        // The values are the document's and Figma has not moved, but the variable
        // may carry a name that is not today's (the collection prefix it had,
        // `Demo/color/brand`, or a designer's rename) or lack the code syntax.
        // Neither is a value, so both are written here and neither makes the path stale.
        for (const variable of variables) {
          if (variable.link.action !== 'use') continue;
          if (variable.link.rename) {
            operations.push({
              kind: 'RENAME_VARIABLE',
              variableId: variable.link.variableId,
              name: variable.link.rename,
              path: variable.key,
            });
          }
          if (!variable.codeSyntaxHeld) {
            operations.push(codeSyntaxOperation(variable.link.variableId, variable.codeSyntax, variable.key));
          }
          if (writesScopes(variable)) operations.push(scopesOperation(variable.link.variableId, variable.scopes.planned, variable.key));
        }
        // One SKIP per clean path, not one per mode — a large document would
        // otherwise bury the real work under hundreds of rows. A drifted path
        // is skipped too, but calling it "unchanged" would be a lie: something
        // did change, in the file rather than the document.
        //
        // The explanation rides on the skip rather than beside it. A separate
        // WARNING made one drifted token into two rows, and made the summary
        // report the same count twice as `4 drifted · 4 warnings`.
        operations.push({
          kind: 'SKIP',
          reason: driftMessage ? 'drifted' : 'unchanged',
          ...(driftMessage ? { message: driftMessage } : {}),
          path,
          cause: driftMessage ? 'drifted' : 'unchanged',
        });
        continue;
      }

      // Drift and stale work can land on the same path — `light` edited in
      // Figma while `dark` moved in the document. There is no SKIP to carry the
      // explanation then, because the path *does* have work to do, so it stands
      // on its own. Dropping it here is how the careless version of this change
      // would lose a drift report entirely.
      if (driftMessage) {
        operations.push({ kind: 'WARNING', message: driftMessage, path });
      }

      variables.forEach((variable, index) => {
        const here = standing.get(variable.collection) as CollectionStanding;
        const link = variable.link;
        if (link.action === 'refuse') return;

        let variableId: string;
        if (link.action === 'create') {
          variableId = link.symbolicId;
          operations.push({
            kind: 'CREATE_VARIABLE',
            symbolicId: variableId,
            collectionId: here.id,
            path: variable.name,
            variableType: routing.variableType,
            // A variable is made for what it is for, never with Figma's default of every field.
            scopes: variable.scopes.planned,
            tokenPath: variable.key,
          });
          operations.push(codeSyntaxOperation(variableId, variable.codeSyntax, variable.key));
        } else {
          variableId = link.variableId;
          if (link.rename) {
            operations.push({ kind: 'RENAME_VARIABLE', variableId, name: link.rename, path: variable.key });
          }
          if (!variable.codeSyntaxHeld) {
            operations.push(codeSyntaxOperation(variableId, variable.codeSyntax, variable.key));
          }
          if (writesScopes(variable)) operations.push(scopesOperation(variableId, variable.scopes.planned, variable.key));
        }

        for (const { modeName, value } of stale[index]) {
          operations.push({
            kind: 'SET_VARIABLE_VALUE',
            variableId,
            modeId: here.modeId(modeName),
            value,
            label: `${variable.name} [${variable.collection}: ${modeName}]`,
            tokenPath: variable.key,
            modeName,
          });
        }
      });
    }

    // What stays offered to every field is said once, so that it is a choice and not an oversight.
    const everywhere = sum.tokens
      .filter((token) => token.routing.kind === 'variable' && token.purpose?.source === 'type' && token.purpose.scopes[0] === 'ALL_SCOPES')
      .map((token) => token.path);
    if (everywhere.length > 0) {
      const many = everywhere.length > 1;
      operations.push({
        kind: 'NOTE',
        message: `${everywhere.length} variable${many ? 's are' : ' is'} offered to every field: ${everywhere.join(', ')}; declare figma.scopes to narrow ${many ? 'them' : 'it'}.`,
      });
    }

    return { operations: [...createsBeforeSets(operations), ...deletions] };
  }

  /**
   * Adds the modes the modifier has and the collection lacks, lists the modes the collection holds and the
   * modifier no longer has as breaking, and reports the one mode problem that cannot be fixed.
   *
   * The deletions come back apart: they run last, after every value of the remaining modes is written.
   * A collection whose Figma default mode is gone from the modifier is closed and never gets here.
   * The default mode is the first of `modes`, and that is a context the modifier still has, so no mode
   * listed for deletion is ever the default one.
   */
  private reconcileModes(
    existing: CollectionStanding,
    spec: SumCollection,
    allowBreaking: boolean,
  ): { operations: Operation[]; deletions: Operation[] } {
    const collection = existing.existing as NonNullable<CollectionStanding['existing']>;
    const operations: Operation[] = [];
    const deletions: Operation[] = [];

    for (const modeName of spec.modes) {
      if (!collection.modes.some((mode) => mode.name === modeName)) {
        operations.push({
          kind: 'ADD_MODE',
          collectionId: collection.id,
          collectionName: collection.name,
          modeName,
        });
      }
    }

    const figmaDefault = collection.modes[0]?.name;
    for (const gone of existing.goneModes) {
      operations.push({
        kind: 'BREAKING',
        message:
          `the mode "${gone.name}" of collection "${collection.name}" is gone: values in it are lost, ` +
          `and a frame or variant pinned to it falls back to "${figmaDefault}"`,
      });
      if (allowBreaking) {
        deletions.push({
          kind: 'DELETE_MODE',
          collectionId: collection.id,
          collectionName: collection.name,
          modeId: gone.modeId,
          modeName: gone.name,
        });
      }
    }

    // Figma's default mode is modes[0] and cannot be reassigned or reordered;
    // the only way to change it destroys a mode and everything in it. So this
    // reports rather than acts.
    if (figmaDefault && figmaDefault !== spec.modes[0]) {
      operations.push({
        kind: 'WARNING',
        message:
          `Figma's default mode for collection "${collection.name}" is "${figmaDefault}", but the document's ` +
          `default is "${spec.modes[0]}". Figma cannot reorder modes or reassign the ` +
          `default, so nodes bound to these variables will resolve to "${figmaDefault}" unless ` +
          `the collection is recreated.`,
      });
    }

    return { operations, deletions };
  }

  summarizePlan(operations: Operation[]): PlanSummary {
    return {
      total: operations.length,
      // A **subset** of `skips`, not a figure beside it: a drifted path is
      // skipped, but for the opposite reason — not "nothing to do" but
      // "something happened here that the document does not know about". So
      // `52 skips · 4 drifted` reads as four of the fifty-two, and the two do
      // not sum. An earlier comment here claimed they were counted apart,
      // which they never were.
      drifted: operations.filter((op) => op.kind === 'SKIP' && op.reason === 'drifted').length,
      creates: operations.filter((op) => op.kind === 'CREATE_COLLECTION' || op.kind === 'CREATE_VARIABLE').length,
      updates: operations.filter((op) => op.kind === 'SET_VARIABLE_VALUE' || op.kind === 'STAMP').length,
      skips: operations.filter((op) => op.kind === 'SKIP').length,
      skipsByCause: countSkipsByCause(operations),
      modes: operations.filter((op) => op.kind === 'ADD_MODE').length,
      warnings: operations.filter((op) => op.kind === 'WARNING').length,
      renames: operations.filter((op) => op.kind === 'RENAME_VARIABLE').length,
      scopes: operations.filter((op) => op.kind === 'SET_VARIABLE_SCOPES').length,
      breaking: operations.filter((op) => op.kind === 'BREAKING').length,
    };
  }
}
