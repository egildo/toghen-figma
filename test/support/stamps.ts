/**
 * Stamps for tests that plan against a file as though an earlier sync had written it.
 */

import type { Operation } from '../../shared/operations.js';
import { getStamp, NAMESPACE, STAMP_KEY, type Stamp } from '../../main/components/stamp.js';
import { reportedScopes, stampWritten } from '../../main/utils/tokenStamps.js';
import type { MockPluginData, MockVariable } from './figmaMock.js';

/**
 * Stamps each existing variable a plan writes as though the plan had run, and leaves the file's values as they are:
 * the receipt hashes what each operation sends, which is what the file holds when a test seeds it with the document's
 * values (a value written through the mock reads back as float32). A test then changes the file or the document to say
 * who moved.
 */
export async function stampAsApplied(operations: readonly Operation[]): Promise<void> {
  for (const op of operations) {
    if (op.kind !== 'SET_VARIABLE_VALUE' && op.kind !== 'SET_VARIABLE_SCOPES') continue;
    const variable = await figma.variables.getVariableByIdAsync(op.variableId);
    if (!variable) continue;
    if (op.kind === 'SET_VARIABLE_VALUE') stampWritten(variable, op.tokenPath, { [op.modeId]: op.value });
    else stampWritten(variable, op.path, { scopes: reportedScopes(op.scopes) });
  }
}

/** Stamps a variable as Toghen's for `token`, with a receipt of `reported`. */
export function stampAs(variable: MockVariable, token: string, reported: Record<string, unknown> = {}): void {
  stampWritten(variable as unknown as Variable, token, reported);
}

/** Stamps a variable as Toghen's for `token`, as though it had written what the variable holds now, scopes included. */
export function stampAsHeld(variable: MockVariable, token: string): void {
  stampAs(variable, token, { ...variable.valuesByMode, scopes: reportedScopes(variable.scopes) });
}

/** The stamp on a mock variable, collection or style. */
export const stampOf = (object: MockPluginData): Stamp | undefined => getStamp(object as unknown as PluginDataMixin);

/**
 * What a person's duplicate does to a stamp: the copy carries the original's, id and all. Figma's Plugin API has no
 * duplicate for a variable or a style, so a test makes the object and copies the stamp onto it, as the editor would.
 */
export function copyStamp(from: MockPluginData, to: MockPluginData): void {
  to.setSharedPluginData(NAMESPACE, STAMP_KEY, from.getSharedPluginData(NAMESPACE, STAMP_KEY));
}

/** Rewrites the id an object's stamp records: another object's, as on a pasted object, or none (`undefined`), as before the id was recorded. */
export function stampIdOf(object: MockPluginData, id: string | undefined): void {
  const { id: _held, ...rest } = JSON.parse(object.getSharedPluginData(NAMESPACE, STAMP_KEY)) as Record<string, unknown>;
  object.setSharedPluginData(NAMESPACE, STAMP_KEY, JSON.stringify(id === undefined ? rest : { ...rest, id }));
}

/** The id an object's stamp records, read as stored. */
export const recordedId = (object: MockPluginData): unknown =>
  (JSON.parse(object.getSharedPluginData(NAMESPACE, STAMP_KEY) || '{}') as { id?: unknown }).id;
