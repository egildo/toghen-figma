import { SimpleAbortController } from '../utils/abortController.js';
import type { Response } from '../../shared/protocol.js';
import { runOperations } from '../engines/batchRunner.js';
import { getState, setState } from '../runtimeState.js';
import { buildSyncStatePayload } from '../utils/syncState.js';

function postToUi(message: Response): void {
  figma.ui.postMessage(message);
}

export async function EXECUTE_VARIABLE_SYNC(): Promise<void> {
  const state = getState();

  if (!state.resolver) {
    postToUi({
      type: 'ERROR',
      payload: {
        message: 'Load a resolver document before executing sync.',
        code: 'NO_RESOLVER',
        commandType: 'EXECUTE_VARIABLE_SYNC',
      },
    });
    return;
  }

  if (!state.lastPlan || state.lastPlanType !== 'variable_sync') {
    postToUi({
      type: 'ERROR',
      payload: {
        message: 'Create a variable sync plan before executing.',
        code: 'NO_PLAN',
        commandType: 'EXECUTE_VARIABLE_SYNC',
      },
    });
    return;
  }

  const controller = new SimpleAbortController();
  setState({ activeOperation: controller });

  try {
    const summary = await runOperations(state.lastPlan, {
      signal: controller.signal,
      onProgress: (completed, total, currentLabel) => {
        postToUi({
          type: 'OPERATION_PROGRESS',
          payload: { completed, total, currentLabel },
        });
      },
    });

    // What the run applied is already stamped on each variable it wrote, from what Figma reported back, so a run
    // that stopped halfway resumes: the next plan holds exactly the modes that did not land.
    setState({
      activeOperation: null,
      lastPlan: null,
      lastPlanType: null,
    });

    postToUi({
      type: 'OPERATION_COMPLETE',
      payload: summary,
    });

    // The stamps just moved. A run that changes them and leaves the header
    // reading the old numbers is the defect this reporting exists to close.
    postToUi({
      type: 'SYNC_STATE',
      payload: await buildSyncStatePayload(state.resolver, state.conversionMap),
    });
  } catch (error) {
    setState({ activeOperation: null });
    postToUi({
      type: 'ERROR',
      payload: {
        message: error instanceof Error ? error.message : String(error),
        code: 'FIGMA_API_ERROR',
        commandType: 'EXECUTE_VARIABLE_SYNC',
      },
    });
  }
}
