import { load, Resolver, type Collision, type ResolverDocument } from '@toghen/lib';
import type { Operation } from '../../shared/operations.js';
import type { Command, Composition, PlanPayload, Response } from '../../shared/protocol.js';
import { getState, setState } from '../runtimeState.js';
import { buildDocumentStatePayload } from '../utils/buildPayloads.js';
import { migrateRootRecord } from '../utils/rootRecord.js';
import { resolveSumModes } from '../utils/resolverModes.js';
import { buildSyncStatePayload } from '../utils/syncState.js';
import { buildTokenGraph } from './tokenGraph.js';
import { forgetRecent, loadRecents, rememberRecent, summarize } from '../utils/recentStore.js';

type LoadDocumentCommand = Extract<Command, { type: 'LOAD_DOCUMENT' }>;
type LoadRecentCommand = Extract<Command, { type: 'LOAD_RECENT' }>;
type ForgetRecentCommand = Extract<Command, { type: 'FORGET_RECENT' }>;

/**
 * Loads what the screen or the command line picked, through the core's `load`: a resolver document whose `$ref`s
 * name picked files, one token file, or several in order, under an overrides map when one is given. The plugin
 * reads no file itself: `read` is a lookup among the files that came with the command, and a file that is not
 * among them is the core's error, naming the reference and the document that holds it.
 */
export async function LOAD_DOCUMENT({ files, entry, name, overrides, dryRun }: LoadDocumentCommand['payload']): Promise<void> {
  const texts = new Map(files.map((file) => [file.path, file.text]));
  let loaded: Awaited<ReturnType<typeof load>>;
  let form: Composition['form'];
  try {
    loaded = await load(entry, {
      read: async (location) => {
        const text = texts.get(location);
        if (text === undefined) throw new Error('It is not among the files picked.');
        return text;
      },
      ...(name !== undefined ? { name } : {}),
      ...(overrides !== undefined ? { overrides } : {}),
    });
    // The core tells the forms apart by `resolutionOrder`; the composition says which it was (R9).
    form =
      typeof entry === 'string' && Array.isArray((JSON.parse(texts.get(entry)!) as { resolutionOrder?: unknown }).resolutionOrder)
        ? 'resolver'
        : 'tokens';
  } catch (error) {
    // The core's own words: they name the file, the reference, and what it is not (R13).
    postError(error instanceof Error ? error.message : 'The document could not be loaded.', 'LOAD_DOCUMENT');
    return;
  }

  const composition: Composition = {
    form,
    entry,
    reads: loaded.reads,
    ...(overrides !== undefined && loaded.overrides ? { overrides: { map: overrides, ...loaded.overrides } } : {}),
  };
  const report = loadReport(loaded.collisions, composition.overrides?.unused ?? []);
  await open(loaded.document, composition, labelOf(entry), { remember: true, dryRun: dryRun === true, ...(report ? { report } : {}) });
}

/**
 * Loads a document the user loaded before, from the bundle kept for them.
 *
 * The bundle is self-contained, so there is nothing to read: it goes to the same tail as a fresh load, deliberately,
 * since one way in means one set of behaviours to keep correct. The composition is the one the stored load had, marked
 * as coming from the bundle. Its collisions were reported when it was first loaded, and are not reported again.
 */
export async function LOAD_RECENT(payload: LoadRecentCommand['payload']): Promise<void> {
  const entry = (await loadRecents()).find((recent) => recent.key === payload.key);

  if (entry === undefined) {
    // The list the user clicked is no longer the list that exists — another
    // window, or a write that shed entries to fit. Say so and re-post the
    // truth rather than failing silently against a stale row.
    postToUi({ type: 'RECENTS', payload: summarize(await loadRecents()) });
    postError(`"${payload.key}" is no longer in your recents. Load the file again.`, 'LOAD_RECENT');
    return;
  }

  await open(entry.document, { ...entry.composition, fromBundle: true }, entry.fileName, { remember: true });
}

export async function GET_RECENTS(): Promise<void> {
  postToUi({ type: 'RECENTS', payload: summarize(await loadRecents()) });
}

export async function FORGET_RECENT(payload: ForgetRecentCommand['payload']): Promise<void> {
  postToUi({ type: 'RECENTS', payload: summarize(await forgetRecent(payload.key)) });
}

/** What the Source card and the recents list name a load by: the entry's file name, or its files' names in order. */
function labelOf(entry: string | string[]): string {
  return (typeof entry === 'string' ? [entry] : entry).map((path) => path.slice(path.lastIndexOf('/') + 1)).join(', ');
}

/**
 * The rows a load reports, in a plan's shape so the result surface draws them (R2): one per collision, and one per
 * key of the overrides map that matched no reference (R14). A collision whose values differ is a warning, since the
 * earlier value is lost; one whose values are equal as written is a note, quiet (R4). Undefined when there is nothing to say.
 */
export function loadReport(collisions: Collision[], unused: string[]): PlanPayload | undefined {
  const operations: Operation[] = [
    ...collisions.map((collision): Operation => {
      const scope =
        collision.set !== undefined ? `set "${collision.set}"` : `context "${collision.context}" of modifier "${collision.modifier}"`;
      const files = collision.files.map((file) => `"${file}"`).join(', ');
      return collision.redundant
        ? { kind: 'NOTE', message: `${collision.path} is given the same value by ${files} in ${scope}.` }
        : { kind: 'WARNING', path: collision.path, message: `Given a value by ${files} in ${scope}; the last wins.` };
    }),
    ...unused.map(
      (key): Operation => ({
        kind: 'WARNING',
        message: `The overrides map's key "${key}" matched no reference, so nothing was read in its place.`,
      }),
    ),
  ];
  return operations.length > 0 ? { planType: 'load', operations } : undefined;
}

/**
 * Resolves and announces a loaded document — however it arrived.
 *
 * @param remember - whether this load joins the recents list. Only a load that
 *   succeeded is remembered: an entry that cannot be loaded is worse than no
 *   entry, because it looks like one that can.
 */
async function open(
  doc: ResolverDocument,
  composition: Composition,
  fileName: string | undefined,
  { remember, dryRun = false, report }: { remember: boolean; dryRun?: boolean; report?: PlanPayload },
): Promise<void> {
  try {
    const resolver = new Resolver(doc);
    // The sum: the defaults and each context on its own, never the product of
    // every combination, which a large document cannot finish. A modifier with
    // no `default` is a legal document that has no sum; this refuses it, naming
    // each such modifier, rather than the generic "Invalid document".
    const designSystem = resolveSumModes(resolver).ds;

    // What a sync wrote is read from the stamps on the file's own variables and styles, never from the document:
    // a target's ids belong to one file, and one document feeds several. A file an older build synced holds a root
    // record instead, turned into stamps here, once: the document says which fields Figma agrees on. A dry run's load
    // keeps them in memory and writes nothing, so the record waits for the first real load.
    await migrateRootRecord(resolver, getState().conversionMap, { dryRun });

    setState({
      resolver,
      resolverDoc: doc,
      designSystem,
      fileName: fileName ?? null,
      composition,
      lastPlan: null,
      lastPlanType: null,
    });

    // The load's rows ride on its own answer rather than on a `PLAN_READY` of their own: the command line takes the
    // first `PLAN_READY` after its next command as that command's plan, and a second message could arrive first.
    postToUi({
      type: 'DOCUMENT_LOADED',
      payload: {
        ...buildDocumentStatePayload(resolver, getState().conversionMap, getState().fileName),
        composition,
        ...(report ? { report } : {}),
      },
    });

    // The Tokens pane browses the document's own shape, which needs no look at Figma.
    postToUi({ type: 'TOKEN_GRAPH', payload: buildTokenGraph(resolver) });

    // Coverage only becomes computable now: without a document there is nothing
    // to measure the file's stamps against.
    postToUi({
      type: 'SYNC_STATE',
      payload: await buildSyncStatePayload(resolver),
    });

    if (remember) {
      const state = buildDocumentStatePayload(resolver, getState().conversionMap);
      const { fromBundle: _fromBundle, ...stored } = composition;
      const recents = await rememberRecent({
        // The name identifies the system; the filename is a fallback, because
        // every one of these files is called `*.resolver.json`.
        key: resolver.name?.trim() || fileName || state.name,
        name: resolver.name?.trim() || fileName || state.name,
        version: resolver.getDeclaredVersion(),
        description: resolver.description,
        tokenCount: state.tokenCount,
        modes: state.modes,
        modifiers: Object.keys(state.modifiers),
        fileName,
        loadedAt: new Date().toISOString(),
        // The bundle and how it was made, never the files: it loads again with none.
        document: doc,
        composition: stored,
      });
      postToUi({ type: 'RECENTS', payload: summarize(recents) });
    }
  } catch (error) {
    postError(error instanceof Error ? error.message : 'Invalid document', 'LOAD_DOCUMENT');
  }
}

function postError(message: string, commandType: string): void {
  postToUi({ type: 'ERROR', payload: { message, code: 'INVALID_DOCUMENT', commandType } });
}

export async function GET_DOCUMENT_STATE(): Promise<void> {
  const state = getState();
  if (!state.resolver) {
    postToUi({
      type: 'DOCUMENT_STATE',
      payload: {
        loaded: false,
        name: 'Untitled',
        tokenCount: 0,
        modifiers: {},
        modes: [],
        modifierDefaults: {},
        defaultMode: '',
        styleCount: 0,
      },
    });
    return;
  }

  postToUi({
    type: 'DOCUMENT_STATE',
    payload: {
      ...buildDocumentStatePayload(state.resolver, state.conversionMap, state.fileName),
      ...(state.composition ? { composition: state.composition } : {}),
    },
  });
}

/**
 * Answers what this Figma file records about having been synced.
 *
 * Answerable with no document loaded, which is the point: the plugin opens into
 * a file, not into a document, and "you synced this file before" is the first
 * useful thing it can say.
 */
export async function GET_SYNC_STATE(): Promise<void> {
  // A file an older build synced is turned into stamps with a document in hand, which says what Figma agrees on;
  // asked before one is loaded, its root record waits for the first load. A dry run's load is not one.
  const { resolver, conversionMap, unwrittenStamps } = getState();
  if (resolver && !unwrittenStamps) await migrateRootRecord(resolver, conversionMap);
  postToUi({
    type: 'SYNC_STATE',
    payload: await buildSyncStatePayload(resolver, conversionMap),
  });
}

function postToUi(message: Response): void {
  figma.ui.postMessage(message);
}
