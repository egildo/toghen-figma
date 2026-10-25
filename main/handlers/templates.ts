/**
 * Component files and blueprints kept in this Figma file, and building from them.
 *
 * A kept file is read against the loaded design system and built through the
 * same entry `RUN_COMPONENT` uses (`components/file.ts`): its text and its name.
 * A blueprint (`.blueprint.kdl`) is kept under its page's name once it reads; it
 * is not built as a whole yet. Its needs are looked up by the locator in a dry
 * pass (`LOOK_UP_NEEDS`), and a relink is planned by a dry build of every kept
 * file (`PLAN_RELINK`); neither imports anything.
 * See `reference.md`, *Templates kept in the file*.
 */

import type { Command, NeedsPayload, Response, TemplateSummary, TemplatesPayload } from '../../shared/protocol.js';
import type { Operation } from '../../shared/operations.js';
import { blueprintNeeds, isBlueprintFile } from '../../shared/components/index.js';
import type { Property, RunOptions, Step } from '../../shared/components/index.js';
import { beginRun, findStrays, finishRun, strayLine } from '../components/endOfRun.js';
import { ComponentRunError } from '../components/errors.js';
import {
  describe,
  desiredOf,
  readBlueprintText,
  readComponentText,
  readErrors,
  runComponentFile,
  summarize as summarizeStep,
} from '../components/file.js';
import { declaredLibraries, locateComponent, localComponents } from '../components/resolve.js';
import { run } from '../components/run.js';
import { getState } from '../runtimeState.js';
import { loadLock } from '../utils/lockStore.js';
import { sortNodes, stampedAs, stampOn } from '../components/stamp.js';
import { findInEveryPage } from '../utils/pageRoots.js';
import { keepTemplate, loadTemplates, saveTemplates, type KeptTemplate } from '../utils/templateStore.js';

type Payload<T extends Command['type']> = Extract<Command, { type: T }>['payload'];

export async function GET_TEMPLATES(): Promise<void> {
  postToUi({ type: 'TEMPLATES', payload: await summarize(loadTemplates()) });
}

export async function KEEP_TEMPLATE(payload: Payload<'KEEP_TEMPLATE'>): Promise<void> {
  const blueprint = isBlueprintFile(payload.fileName);
  const name = blueprint ? readBlueprintToKeep(payload) : readComponentToKeep(payload);
  if (name === undefined) return;
  // A row is found by its name: a blueprint whose page is named as a kept component would take that component's place.
  const other = loadTemplates().find(
    (kept) => kept.name === name && isBlueprintFile(kept.fileName) !== blueprint && kept.name !== payload.replaces,
  );
  if (other) {
    postToUi({
      type: 'ERROR',
      payload: {
        message: `${payload.fileName} was not kept: "${name}" is already kept from ${other.fileName}, and a blueprint and a component cannot share a name here. Forget that one first.`,
        code: 'INVALID_TEMPLATE',
        commandType: 'KEEP_TEMPLATE',
        problems: [],
      },
    });
    return;
  }

  const kept: KeptTemplate = { name, fileName: payload.fileName, text: payload.text, kept: new Date().toISOString() };
  const saved = saveTemplates(keepTemplate(loadTemplates(), kept, payload.replaces));
  if (!saved.ok) {
    postToUi({ type: 'ERROR', payload: { message: saved.reason, code: 'FIGMA_API_ERROR', commandType: 'KEEP_TEMPLATE' } });
    return;
  }
  await GET_TEMPLATES();
}

/** A blueprint is kept under its page's name when it reads; else every problem is said, and nothing is kept. */
function readBlueprintToKeep(payload: Payload<'KEEP_TEMPLATE'>): string | undefined {
  const read = readBlueprintText(payload.text);
  const problems = read.problems.filter((problem) => problem.severity === 'error').map((problem) => describe(payload.fileName, problem));
  if (problems.length === 0 && read.page !== undefined) return read.page;
  postToUi({
    type: 'ERROR',
    payload: {
      message: `${payload.fileName} does not read, so it was not kept: ${problems.length === 1 ? 'one problem' : `${problems.length} problems`}`,
      code: 'INVALID_TEMPLATE',
      commandType: 'KEEP_TEMPLATE',
      problems,
    },
  });
  return undefined;
}

/** A component file is kept under its component's name when it reads; else every problem is said, and nothing is kept. */
function readComponentToKeep(payload: Payload<'KEEP_TEMPLATE'>): string | undefined {
  const read = readComponentText(payload.text);
  const problems = readErrors(read, payload.fileName);
  if (read.artboard) {
    // An artboard reads its inputs from the command line; nothing on the screen supplies them, so it is built from there.
    postToUi({
      type: 'ERROR',
      payload: {
        message: `${payload.fileName} is an artboard file, which needs inputs only the command line gives, so it was not kept`,
        code: 'INVALID_TEMPLATE',
        commandType: 'KEEP_TEMPLATE',
        problems: [],
      },
    });
    return undefined;
  }
  if (!read.component || problems.length > 0) {
    postToUi({
      type: 'ERROR',
      payload: {
        message: read.component
          ? `${payload.fileName} does not read, so it was not kept: ${problems.length === 1 ? 'one problem' : `${problems.length} problems`}`
          : `${payload.fileName} holds no component, so it was not kept`,
        code: 'INVALID_TEMPLATE',
        commandType: 'KEEP_TEMPLATE',
        problems,
      },
    });
    return undefined;
  }
  return read.component.name;
}

export async function FORGET_TEMPLATE(payload: Payload<'FORGET_TEMPLATE'>): Promise<void> {
  const saved = saveTemplates(loadTemplates().filter((template) => template.name !== payload.name));
  if (!saved.ok) {
    postToUi({ type: 'ERROR', payload: { message: saved.reason, code: 'FIGMA_API_ERROR', commandType: 'FORGET_TEMPLATE' } });
    return;
  }
  await GET_TEMPLATES();
}

export async function PLAN_BUILD(payload: Payload<'PLAN_BUILD'>): Promise<void> {
  await build(payload.name, { dryRun: true }, 'PLAN_BUILD');
}

export async function EXECUTE_BUILD(payload: Payload<'EXECUTE_BUILD'>): Promise<void> {
  if (await build(payload.name, { allowBreaking: payload.allowBreaking === true }, 'EXECUTE_BUILD')) {
    // A build changes which sets exist, and so what the pane says about each template.
    await GET_TEMPLATES();
  }
}

/** Runs the engine on one kept template. True when it ran to the end. */
async function build(name: string, options: { dryRun?: boolean; allowBreaking?: boolean }, commandType: string): Promise<boolean> {
  const template = loadTemplates().find((kept) => kept.name === name);
  if (!template) {
    postToUi({
      type: 'ERROR',
      payload: { message: `No template named "${name}" is kept in this file.`, code: 'INVALID_TEMPLATE', commandType },
    });
    return false;
  }
  if (isBlueprintFile(template.fileName)) {
    postToUi({
      type: 'ERROR',
      payload: {
        message: `"${name}" is a blueprint, and a blueprint is not built as a whole yet: build each of its components from its own file.`,
        code: 'INVALID_TEMPLATE',
        commandType,
      },
    });
    return false;
  }

  try {
    // A template run from the screen is a run of its own: strays are found before anything is written, and the end of the run follows the build.
    beginRun();
    const strays = await findStrays();
    const lines = strays.map(strayLine);
    if (lines.length > 0 && !options.dryRun && !options.allowBreaking) {
      throw new ComponentRunError(
        `will not build "${name}": ${lines.length === 1 ? 'a member is' : `${lines.length} members are`} outside any set, and nothing was written; pass allowBreaking to remove ${lines.length === 1 ? 'it' : 'them'}`,
        lines,
      );
    }
    const built = await runComponentFile(template.text, template.fileName, options);
    const finished = await finishRun({ dryRun: options.dryRun === true, allowBreaking: options.allowBreaking === true });
    // The strays are breaking steps of the run, and what the end of it did is said among the notes.
    built.report.steps.push(...strays.map((stray, at) => ({ kind: 'REMOVE_STRAY' as const, member: stray.name, breaks: lines[at] })));
    built.report.breaking.push(...lines);
    built.report.notes.push(...finished.moved, ...finished.notes);
    postToUi({ type: 'COMPONENT_RUN', payload: built });
    return true;
  } catch (error) {
    if (!(error instanceof ComponentRunError)) throw error;
    postToUi({ type: 'ERROR', payload: { message: error.message, code: 'COMPONENT_RUN_FAILED', commandType, problems: error.problems } });
    return false;
  }
}

type Swap = Extract<Step, { kind: 'SWAP_COMPONENT' }>;

/**
 * A dry build of one kept file, through the engine a build runs, for what a relink would swap: each component file
 * as it is built, each body of a blueprint with its `library` lines declared. Nothing is written or imported. A file or
 * body the engine stops on is a line, since its swaps are then not known.
 */
async function dryPass(template: KeptTemplate): Promise<{ swaps: Swap[]; stopped: string[] }> {
  const swaps: Swap[] = [];
  const stopped: string[] = [];
  const pass = async (label: string, plan: () => Promise<Step[]>): Promise<void> => {
    try {
      swaps.push(...(await plan()).filter((step): step is Swap => step.kind === 'SWAP_COMPONENT'));
    } catch (error) {
      if (!(error instanceof ComponentRunError)) throw error;
      stopped.push(`${label} could not be planned, so what it would swap is not known: ${[error.message, ...error.problems].join('; ')}`);
    }
  };
  if (!isBlueprintFile(template.fileName)) {
    const read = readComponentText(template.text);
    const errors = readErrors(read, template.fileName);
    await pass(template.fileName, async () => {
      if (errors.length > 0) throw new ComponentRunError(`${template.fileName} does not read`, errors);
      return (await run(desiredOf(read), { dryRun: true })).steps;
    });
    return { swaps, stopped };
  }
  const read = readBlueprintText(template.text);
  const options: RunOptions = { dryRun: true, libraries: read.libraries };
  for (const body of read.bodies) {
    if (!body.component) continue;
    await pass(
      `${template.fileName}, ${body.artboard ? 'artboard' : 'component'} "${body.component.name}"`,
      async () => (await run(desiredOf(body), options)).steps,
    );
  }
  return { swaps, stopped };
}

/**
 * The relink, planned: a dry build of every kept file, keeping only the swaps, one row each (R14), and a line per
 * library the swaps import from. Whether that library is published, and its update accepted here, the plugin cannot
 * see, so the line says what the import needs rather than claiming it is missing (R11). Execute is each file's Build.
 */
export async function PLAN_RELINK(): Promise<void> {
  const operations: Operation[] = [];
  const from = new Map<string, number>();
  let stopped = 0;
  for (const template of loadTemplates()) {
    const pass = await dryPass(template);
    for (const swap of pass.swaps) {
      operations.push({ kind: 'SWAP_COMPONENT', path: template.name, message: summarizeStep(swap).message ?? '' });
      if (swap.library !== undefined) from.set(swap.library, (from.get(swap.library) ?? 0) + 1);
    }
    for (const line of pass.stopped) operations.push({ kind: 'WARNING', path: template.fileName, message: line });
    stopped += pass.stopped.length;
  }
  for (const [library, count] of from) {
    operations.push({
      kind: 'NOTE',
      message: `${count === 1 ? 'One swap imports' : `${count} swaps import`} from library "${library}" by key, which needs the library published and its update accepted in this file; the plugin cannot see whether it is. If the build says a key did not import, publish the library, then accept its update here.`,
    });
  }
  const swaps = operations.filter((operation) => operation.kind === 'SWAP_COMPONENT').length;
  if (swaps === 0)
    operations.unshift({
      kind: 'NOTE',
      message: `${stopped > 0 ? 'In the files that could be planned, no' : 'No'} stamped instance would swap to another component.`,
    });
  postToUi({ type: 'PLAN_READY', payload: { planType: 'relink', operations, summary: { swaps, libraries: from.size, stopped } } });
}

/**
 * One kept blueprint's needs, looked up now: its tokens held against what Load loaded, its libraries against the
 * lock, and each component it names answered by the locator, read only. A component found that a dry build would swap
 * a stamped instance to reads `would swap`. The answer is a standing picture for the Build pane, dated (R15).
 */
export async function LOOK_UP_NEEDS(payload: Payload<'LOOK_UP_NEEDS'>): Promise<void> {
  const template = loadTemplates().find((kept) => kept.name === payload.name);
  if (!template || !isBlueprintFile(template.fileName)) {
    postToUi({
      type: 'ERROR',
      payload: {
        message: `No blueprint named "${payload.name}" is kept in this file.`,
        code: 'INVALID_TEMPLATE',
        commandType: 'LOOK_UP_NEEDS',
      },
    });
    return;
  }
  const needs = blueprintNeeds(readBlueprintText(template.text));
  const lock = loadLock();
  for (const page of figma.root.children) await page.loadAsync();
  const local = localComponents();
  const libraries = declaredLibraries(needs.libraries, lock.overrides);
  const pass = await dryPass(template);

  const answer: NeedsPayload = {
    name: template.name,
    lookedAt: new Date().toISOString(),
    libraries: [],
    components: [],
    notes: pass.stopped,
  };
  if (needs.tokens) answer.tokens = { ...needs.tokens, ...tokensAgainstLoad(needs.tokens.entries, needs.tokens.overrides) };
  for (const name of needs.libraries) {
    const readAs = lock.overrides?.[name];
    const entry = lock.libraries[readAs ?? name];
    answer.libraries.push({
      name,
      state: entry ? 'in the lock' : 'missing',
      ...(entry ? { by: entry.by } : {}),
      ...(readAs !== undefined ? { readAs } : {}),
    });
  }
  const named = (list: string[]): string => list.map((library) => `"${library}"`).join(' and ');
  for (const need of needs.components) {
    if (!('name' in need.ref)) {
      answer.components.push({
        name: `(key)"${need.ref.key}"`,
        state: 'by key',
        detail: 'a published key: a look imports nothing, so it is not checked',
      });
      continue;
    }
    const name = need.ref.name;
    if (need.satisfied) {
      answer.components.push({ name, state: 'satisfied', detail: 'a component of this blueprint' });
      continue;
    }
    const located = locateComponent(name, libraries, lock, local);
    const swapping = pass.swaps.filter((swap) => swap.to === located.name).length;
    const swapped =
      swapping > 0
        ? {
            state: 'would swap' as const,
            detail: `${swapping === 1 ? 'a stamped instance shows' : `${swapping} stamped instances show`} another component now`,
          }
        : undefined;
    if (located.at === 'file') answer.components.push({ name, state: 'found', detail: 'in this file', ...swapped });
    else if (located.at === 'library') answer.components.push({ name, state: 'from a library', library: located.library, ...swapped });
    else if (located.at === 'key')
      answer.components.push({
        name,
        state: 'by key',
        detail: `the overrides map sends it to ${located.name}, not checked without importing it`,
        ...swapped,
      });
    else if (located.at === 'missing')
      answer.components.push({ name, state: 'missing', detail: "not in this file, and no declared library's lock entry holds it" });
    else if (located.at === 'ambiguous')
      answer.components.push({ name, state: 'problem', detail: `this file has ${located.here.length} of that name` });
    else if (located.at === 'both')
      answer.components.push({
        name,
        state: 'problem',
        detail: `in this file and in library ${named(located.libraries)}: a build stops on it`,
      });
    else
      answer.components.push({
        name,
        state: 'problem',
        detail: `in libraries ${named(located.libraries)}: name the one to use in the overrides map`,
      });
  }
  postToUi({ type: 'NEEDS', payload: answer });
}

const baseName = (path: string): string => path.split('/').pop() ?? path;

/**
 * A blueprint's `tokens` held against what Load loaded: the entry by its files' names (the plugin's files have no
 * folders), and whether a map was loaded with it. The plugin cannot read the map a blueprint names, so its hash is
 * said and the two maps are not compared.
 */
function tokensAgainstLoad(
  entries: string[],
  overrides: string | undefined,
): { state: 'loaded' | 'differs' | 'not loaded'; detail?: string } {
  const composition = getState().composition;
  if (!composition) return { state: 'not loaded', detail: 'nothing is loaded: load it in the Load pane' };
  const loaded = ([] as string[]).concat(composition.entry);
  if (loaded.map(baseName).join('\n') !== entries.map(baseName).join('\n'))
    return { state: 'differs', detail: `the loaded document is ${loaded.join(', ')}` };
  const map = composition.overrides;
  if (overrides !== undefined && !map) return { state: 'differs', detail: `loaded without the overrides map it names, ${overrides}` };
  if (overrides === undefined && map)
    return { state: 'differs', detail: `loaded with an overrides map it does not name (hash ${map.hash})` };
  return {
    state: 'loaded',
    ...(map ? { detail: `with an overrides map, hash ${map.hash}; the plugin cannot read ${overrides} to compare` } : {}),
  };
}

/**
 * What the pane shows of each kept template: what the file declares, read
 * again now, and where its set is. Every page is loaded to look, as the engine
 * does before a build: a set on another page is still built.
 */
async function summarize(templates: readonly KeptTemplate[]): Promise<TemplatesPayload> {
  const sets = new Map<string, { page: string; setId: string }>();
  if (templates.length > 0) {
    for (const page of figma.root.children) await page.loadAsync();
    // A person's copy of a set is not the template's set.
    for (const set of (await sortNodes(findInEveryPage({ types: ['COMPONENT_SET'], sharedPluginData: stampedAs('component') }))).ours) {
      const name = stampOn(set)?.is.component;
      if (name !== undefined && !sets.has(name)) sets.set(name, { page: pageOf(set), setId: set.id });
    }
  }

  const summaries: TemplateSummary[] = templates.map((template) => {
    if (isBlueprintFile(template.fileName)) {
      // A blueprint's row lists its needs; what it holds is its bodies, each read as its file would be.
      const read = readBlueprintText(template.text);
      const needs = blueprintNeeds(read);
      return {
        name: template.name,
        fileName: template.fileName,
        kept: template.kept,
        characters: template.text.length,
        members: read.bodies.reduce((sum, body) => sum + body.members.length, 0),
        axes: [],
        properties: [],
        tokenGroups: [],
        builtInto: null,
        differs: null,
        problems: read.problems.filter((problem) => problem.severity === 'error').map((problem) => describe(template.fileName, problem)),
        needs: {
          ...(needs.tokens ? { tokens: needs.tokens } : {}),
          libraries: needs.libraries,
          components: needs.components.map((need) => ({
            name: 'name' in need.ref ? need.ref.name : `(key)"${need.ref.key}"`,
            satisfied: need.satisfied,
          })),
        },
      };
    }
    const read = readComponentText(template.text);
    const component = read.component;
    const properties = component?.properties ?? [];
    return {
      name: template.name,
      fileName: template.fileName,
      kept: template.kept,
      characters: template.text.length,
      members: read.members.length,
      axes: properties
        .filter((property): property is Extract<Property, { type: 'VARIANT' }> => property.type === 'VARIANT')
        .map((property) => ({ name: property.name, values: [...property.values] })),
      properties: properties
        .filter((property) => property.type !== 'VARIANT')
        .map((property) => ({ name: property.name, type: property.type })),
      tokenGroups: Object.keys(component?.groups ?? {}),
      builtInto: sets.get(template.name) ?? null,
      // Nothing compares a set with its file yet: a dry run re-applies every declared field whether or not it changed.
      differs: null,
      problems: read.problems.filter((problem) => problem.severity === 'error').map((problem) => describe(template.fileName, problem)),
    };
  });

  return { lookedAt: new Date().toISOString(), templates: summaries };
}

function pageOf(node: BaseNode): string {
  let current: BaseNode | null = node;
  while (current && current.type !== 'PAGE') current = current.parent;
  return current?.name ?? '';
}

function postToUi(response: Response): void {
  figma.ui.postMessage(response);
}
