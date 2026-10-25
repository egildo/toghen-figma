/**
 * The root record of an older build, turned into stamps once (decisions, *Ruled: the stamp, one receipt per object,
 * for every target*).
 *
 * The record named, per token path, the variable or style written for it and a hash of the token's value per mode
 * name. A stamp hashes what Figma reports right after a write, and what Figma holds now is no proof of that: a hand
 * edit made before the upgrade, which the old build kept while the document stood still, would read as written and be
 * overwritten. So a field the record says was written is taken as written only where Figma holds the document's value,
 * a variable mode by mode and a style field by field; any other is stamped `UNPROVEN`, a hash no report has, and reads
 * as drift, kept and reported. Where the document moved since the write, the record's hash cannot say what
 * Figma held then, so a field Figma does not agree on is drift too, hand edit or not; `--overwrite-drift` writes it.
 */

import type { Resolver } from '@toghen/lib';
import type { TokenTypeConversionMap } from '../../shared/tokenTypeMap.js';
import { getStamp, hashOf, receiptOf, setStamp, UNPROVEN, type Stamp, type Stamped } from '../components/stamp.js';
import { holds, StyleSyncEngine, wantedOf } from '../engines/styleSyncEngine.js';
import { setState } from '../runtimeState.js';
import { VariableSyncEngine } from '../engines/variableSyncEngine.js';
import { figmaCollectionNameFor } from './resolverModes.js';
import { clearSharded, isPlainObject, readSharded } from './shardedData.js';
import { reportedScopes, reportOf, type StyleKind } from './tokenStamps.js';

/** Where older builds kept the root record. */
const RECORD_KEY = 'extensions';

/** Puts a stamp where the plans read it, before it is written: in `unwrittenStamps`, by the object's id. */
type Put = (object: Stamped, stamp: Stamp) => void;

/**
 * Turns the root record into stamps, then deletes it with its shards. One way only. The scopes the record kept are what
 * Toghen wrote, so they are stamped as such. An object already stamped is left as it is. The stamps are worked out in
 * memory, where the plans that prove them read them as the objects' own, and written at the end. With `dryRun` nothing
 * is written: the stamps stay in memory for the dry run's plans, and the record stays for the first real load. Never
 * throws: a record that cannot be read names nothing and is deleted, and one whose stamps cannot be written is kept for
 * the next try.
 */
export async function migrateRootRecord(
  resolver: Resolver,
  conversionMap: TokenTypeConversionMap,
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<void> {
  const unwritten = new Map<string, Stamp>();
  const objects: Stamped[] = [];
  const put: Put = (object, stamp) => {
    if (!unwritten.has(object.id)) objects.push(object);
    unwritten.set(object.id, { ...stamp, id: object.id });
  };
  setState({ unwrittenStamps: unwritten });
  try {
    let record: unknown;
    try {
      const payload = readSharded(RECORD_KEY);
      if (!payload) return;
      record = JSON.parse(payload);
    } catch (_unreadable) {
      record = undefined;
    }
    const variables = new Set<string>();
    const styles = new Map<string, BaseStyle>();
    for (const [token, entry] of Object.entries(isPlainObject(record) ? record : {})) {
      if (!isPlainObject(entry)) continue;
      const variable = typeof entry.variableId === 'string' ? await figma.variables.getVariableByIdAsync(entry.variableId) : null;
      if (variable && !getStamp(variable)) {
        const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
        const hashes = isPlainObject(entry.lastSyncedHashes) ? entry.lastSyncedHashes : {};
        const receipt: Record<string, string> = {};
        for (const mode of collection?.modes ?? []) {
          if (hashes[mode.name] !== undefined && variable.valuesByMode[mode.modeId] !== undefined) receipt[mode.modeId] = UNPROVEN;
        }
        if (Array.isArray(entry.lastSyncedScopes))
          Object.assign(receipt, receiptOf({ scopes: reportedScopes(entry.lastSyncedScopes as VariableScope[]) }));
        put(variable, { is: { token }, receipt });
        variables.add(variable.id);
      }
      const style = typeof entry.styleId === 'string' ? await figma.getStyleByIdAsync(entry.styleId) : null;
      if (style && !getStamp(style)) {
        // Taken, for now, as holding what was written: `proveAgreeing` asks the style plan which fields it does.
        put(style, { is: { token }, receipt: receiptOf(reportOf(style)) });
        styles.set(token, style);
      }
    }
    await proveAgreeing(resolver, conversionMap, variables, styles, put);
    if (dryRun) return;
    for (const object of objects) setStamp(object, unwritten.get(object.id)!);
    clearSharded(RECORD_KEY);
  } catch (_unwritable) {
    // Figma refused a stamp: the record is kept, and the next load tries again. A dry run plans as if it named nothing.
    unwritten.clear();
  } finally {
    if (!dryRun) setState({ unwrittenStamps: null });
  }
}

/**
 * Takes as written each field of these variables and styles that Figma holds the document's value in, and stamps
 * every other `UNPROVEN`. A variable's modes start unproven, so its plan writes one only where Figma agrees with the
 * document. A style starts as holding what was written, so its plan says, of one Figma agrees on, unchanged, and of
 * any other, what it would write: the fields that differ from that are the unproven ones. A plan that stops, or a
 * token it refuses, leaves every field unproven.
 */
async function proveAgreeing(
  resolver: Resolver,
  conversionMap: TokenTypeConversionMap,
  variables: Set<string>,
  styles: Map<string, BaseStyle>,
  put: Put,
): Promise<void> {
  const collectionName = figmaCollectionNameFor(resolver);
  if (variables.size > 0) {
    for (const op of (await new VariableSyncEngine().buildPlan(resolver, collectionName, conversionMap)).operations) {
      if (op.kind !== 'SET_VARIABLE_VALUE' || !variables.has(op.variableId)) continue;
      const variable = await figma.variables.getVariableByIdAsync(op.variableId);
      const stamp = variable ? getStamp(variable) : undefined;
      if (!variable || !stamp || stamp.receipt[op.modeId] !== UNPROVEN) continue;
      put(variable, { ...stamp, receipt: { ...stamp.receipt, ...receiptOf({ [op.modeId]: variable.valuesByMode[op.modeId] }) } });
    }
  }
  if (styles.size > 0) {
    const operations = (await new StyleSyncEngine().buildPlan(resolver, conversionMap, collectionName)).operations;
    for (const [token, style] of styles) {
      const op = operations.find(
        (o) => (o.kind === 'UPDATE_STYLE' && o.styleId === style.id) || (o.kind === 'SKIP' && o.reason === 'unchanged' && o.path === token),
      );
      // ponytail: a field is compared with what this machine would write only, so one that holds what a machine with
      // the stack's first family wrote stays unproven here, beside a field edited by hand; the plan's own check takes both.
      const wanted =
        op?.kind === 'UPDATE_STYLE'
          ? wantedOf(style.type as StyleKind, op.props as unknown as Record<string, unknown>, op.bindings ?? [])
          : {};
      const receipt: Record<string, string> = {};
      for (const [field, value] of Object.entries(reportOf(style)))
        receipt[field] = op && (!(field in wanted) || holds(value, wanted[field])) ? hashOf(value) : UNPROVEN;
      put(style, { is: { token }, receipt });
    }
  }
}
