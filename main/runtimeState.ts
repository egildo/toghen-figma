import type { DesignSystem, Resolver, ResolverDocument } from '@toghen/lib';
import type { PropertyConvention } from '../shared/conventions.js';
import type { Operation } from '../shared/operations.js';
import type { Composition, PlanType } from '../shared/protocol.js';
import { defaultTokenTypeMap, type TokenTypeConversionMap } from '../shared/tokenTypeMap.js';
import type { SimpleAbortController } from './utils/abortController.js';
import type { Stamp } from './components/stamp.js';

export interface PluginRuntimeState {
  resolver: Resolver | null;
  resolverDoc: ResolverDocument | null;
  designSystem: DesignSystem | null;
  /** The file the document was read from, when the load said; the screen's Source card names it. */
  fileName: string | null;
  /** What the load read and how; the document state carries it. */
  composition: Composition | null;

  conventions: PropertyConvention[];
  conversionMap: TokenTypeConversionMap;

  lastPlan: Operation[] | null;
  lastPlanType: PlanType | null;
  activeOperation: SimpleAbortController | null;
  /**
   * The stamps a dry run's load would have written in turning an older build's root record into stamps, by object id,
   * read as the objects' own so its plans read as after the migration (`utils/rootRecord.ts`). `null` unless the
   * document was loaded for a dry run.
   */
  unwrittenStamps: Map<string, Stamp> | null;
}
// There was a `syncMetadata` here — `lastSyncedAt`, `pendingCount`,
// `errorCount` — written by both execute handlers and read by nothing at all.
// The two counts were dead outright, and what was synced is answered by the
// stamps on the file's own variables and styles, which survive closing the
// plugin as the in-memory copy never did. See `utils/syncState.ts`. Two sources
// of truth for one fact is how they begin to disagree.

const createInitialState = (): PluginRuntimeState => ({
  resolver: null,
  resolverDoc: null,
  designSystem: null,
  fileName: null,
  composition: null,

  conventions: [],
  conversionMap: defaultTokenTypeMap,

  lastPlan: null,
  lastPlanType: null,
  activeOperation: null,
  unwrittenStamps: null,
});

let state: PluginRuntimeState = createInitialState();

export function getState(): Readonly<PluginRuntimeState> {
  return state;
}

export function setState(patch: Partial<PluginRuntimeState>): void {
  state = { ...state, ...patch };
}

export function resetState(): void {
  state = createInitialState();
}
