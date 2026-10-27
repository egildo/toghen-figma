import type { Command, Response } from '../../shared/protocol.js';
import { ComponentRunError } from '../components/errors.js';
import { beginRun, findOrphans, findStrays, finishRun, notePruning, orphanLine, strayLine } from '../components/endOfRun.js';
import { checkComponents, runComponentFile } from '../components/file.js';
import { brokenSetProblems } from '../components/snapshot.js';
import { getState } from '../runtimeState.js';

type RunComponentCommand = Extract<Command, { type: 'RUN_COMPONENT' }>;
type CheckComponentsCommand = Extract<Command, { type: 'CHECK_COMPONENTS' }>;
type FinishComponentsCommand = Extract<Command, { type: 'FINISH_COMPONENTS' }>;

/**
 * Runs one component file, given as text and a name: the entry the Templates pane's build uses too (`components/file.ts`).
 *
 * The engine stops with a `ComponentRunError` before its first write for everything it can foresee
 * (a file that does not read, a name that does not resolve, a set that is not ours, a step that breaks
 * instances), so those come back as an `ERROR` carrying every reason. Anything else is Figma's, and
 * the dispatcher reports it. A plugin does not roll back: a failure in the middle of the writes leaves
 * what was written, and the next run reconciles it.
 */
export async function RUN_COMPONENT(payload: RunComponentCommand['payload']): Promise<void> {
  try {
    postToUi({ type: 'COMPONENT_RUN', payload: await runComponentFile(payload.text, payload.fileName, payload.options, payload.inputs) });
  } catch (error) {
    if (!(error instanceof ComponentRunError)) throw error;
    postToUi({
      type: 'ERROR',
      payload: { message: error.message, code: 'COMPONENT_RUN_FAILED', commandType: 'RUN_COMPONENT', problems: error.problems },
    });
  }
}

/** Reads every file and says every problem of every file, and which of their sets Figma already reports as broken, writing nothing. */
export async function CHECK_COMPONENTS(payload: CheckComponentsCommand['payload']): Promise<void> {
  const { errors, components, artboards } = checkComponents(
    payload.files,
    { names: payload.names === true, ...(payload.inputs ? { inputs: payload.inputs } : {}) },
    getState().resolver,
  );
  const problems = [...errors, ...(await brokenSetProblems(components))];
  // The start of a run. Strays are found once, here, before anything is written: they are breaking, so a real run without the flag stops on them.
  beginRun();
  const strays = payload.files.length > 0 ? (await findStrays()).map(strayLine) : [];
  if (strays.length > 0 && !payload.dryRun && !payload.allowBreaking) problems.push(...strays);
  // With --prune the files are the whole system: what none declares is breaking, as a stray is, and goes at the end.
  let orphans: string[] = [];
  if (payload.prune && errors.length === 0) {
    const declared = { components: new Set(components), artboards: new Set(artboards) };
    notePruning(declared);
    orphans = (await findOrphans(declared)).map(orphanLine);
    if (orphans.length > 0 && !payload.dryRun && !payload.allowBreaking) problems.push(...orphans);
  }
  if (problems.length === 0)
    return postToUi({
      type: 'COMPONENTS_CHECKED',
      payload: { files: payload.files.length, ...(strays.length > 0 ? { strays } : {}), ...(orphans.length > 0 ? { orphans } : {}) },
    });
  postToUi({
    type: 'ERROR',
    payload: {
      message: `${problems.length === 1 ? 'one problem' : `${problems.length} problems`} in the component files, and nothing was sent on`,
      code: 'COMPONENT_RUN_FAILED',
      commandType: 'CHECK_COMPONENTS',
      problems,
    },
  });
}

/** The end of a run: the strays removed when allowed, and each page's sets and artboards stacked again. */
export async function FINISH_COMPONENTS(payload: FinishComponentsCommand['payload']): Promise<void> {
  postToUi({ type: 'COMPONENTS_FINISHED', payload: await finishRun(payload) });
}

function postToUi(response: Response): void {
  figma.ui.postMessage(response);
}
