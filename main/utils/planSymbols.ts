import type { Operation } from '../../shared/operations.js';
import { isAlias } from './figmaTokenAdapter.js';

/**
 * What a plan's operations produce and depend on, in symbolic ids.
 *
 * A plan is a little dependency graph: `CREATE_COLLECTION` produces a symbol
 * that `CREATE_VARIABLE` consumes, which produces one that `SET_VARIABLE_VALUE`
 * consumes. `batchRunner` resolves those at execution time; this module is the
 * same knowledge, factored out so the graph can also be *checked* before
 * anything is written.
 */

/** Symbolic ids start with `$`; everything else is a real Figma id. */
export const isSymbolic = (id: string): boolean => id.startsWith('$');

/** Every symbol a plan's own operations would create. */
export function producedSymbols(ops: readonly Operation[]): Set<string> {
  const produced = new Set<string>();

  for (const op of ops) {
    switch (op.kind) {
      case 'CREATE_COLLECTION':
        if (op.symbolicId) produced.add(op.symbolicId);
        for (const modeName of op.modes) {
          produced.add(`$mode:${op.name}/${modeName}`);
        }
        break;
      case 'ADD_MODE':
        produced.add(`$mode:${op.collectionName}/${op.modeName}`);
        break;
      case 'CREATE_VARIABLE':
        if (op.symbolicId) produced.add(op.symbolicId);
        break;
      default:
        break;
    }
  }

  return produced;
}

/** The ids an operation needs resolved before it can run. */
export function dependenciesOf(op: Operation): string[] {
  switch (op.kind) {
    case 'ADD_MODE':
    case 'CREATE_VARIABLE':
      return [op.collectionId];
    case 'SET_VARIABLE_VALUE':
      // An alias's target is a prerequisite too: a failed create blocks it.
      return isAlias(op.value) ? [op.variableId, op.modeId, op.value.id] : [op.variableId, op.modeId];
    case 'DELETE_VARIABLE':
      return op.after ? [op.after] : [];
    case 'BIND_VARIABLE':
    case 'RENAME_VARIABLE':
    case 'SET_CODE_SYNTAX':
    case 'SET_VARIABLE_SCOPES':
      return [op.variableId];
    default:
      return [];
  }
}

/**
 * Warns about references no operation in the plan satisfies.
 *
 * This is the one thing the old dry-run mode could tell you that a plan could
 * not — and it was always a property of the *plan*, not of a way of running it.
 * Checking it here means it is reported when the plan is built, on the screen
 * the user is already reading, rather than requiring a second command whose only
 * job was to walk the same list without touching anything.
 *
 * A dangling symbol is a bug in an engine, not something a user can cause. It is
 * reported rather than thrown because a plan that is 90% sound is still worth
 * showing, with the broken part named.
 */
export function danglingSymbolWarnings(ops: readonly Operation[]): Operation[] {
  const produced = producedSymbols(ops);
  const seen = new Set<string>();
  const warnings: Operation[] = [];

  for (const op of ops) {
    for (const dependency of dependenciesOf(op)) {
      if (!isSymbolic(dependency) || produced.has(dependency) || seen.has(dependency)) {
        continue;
      }
      seen.add(dependency);
      warnings.push({
        kind: 'WARNING',
        message: `This plan refers to "${dependency}", which nothing in it creates. Every operation depending on it will be skipped.`,
      });
    }
  }

  return warnings;
}
