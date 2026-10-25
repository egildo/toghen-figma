import type { Response } from '../../shared/protocol.js';
import { runOperations } from '../engines/batchRunner.js';
import { getState, setState } from '../runtimeState.js';
import { SimpleAbortController } from '../utils/abortController.js';

function postToUi(message: Response): void {
  figma.ui.postMessage(message);
}

export async function EXECUTE_SCAFFOLD(): Promise<void> {
  const state = getState();
  if (!state.lastPlan || state.lastPlanType !== 'scaffold') {
    postToUi({
      type: 'ERROR',
      payload: {
        message: 'Create a scaffold plan before executing.',
        code: 'NO_PLAN',
        commandType: 'EXECUTE_SCAFFOLD',
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

    setState({
      activeOperation: null,
      lastPlan: null,
      lastPlanType: null,
    });

    postToUi({
      type: 'OPERATION_COMPLETE',
      payload: summary,
    });
  } catch (error) {
    setState({ activeOperation: null });
    postToUi({
      type: 'ERROR',
      payload: {
        message: error instanceof Error ? error.message : String(error),
        code: 'FIGMA_API_ERROR',
        commandType: 'EXECUTE_SCAFFOLD',
      },
    });
  }
}
