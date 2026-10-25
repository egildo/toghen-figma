import type { PlanType, Response } from '../../shared/protocol.js';
import { runOperations } from '../engines/batchRunner.js';
import { getState, setState } from '../runtimeState.js';
import { SimpleAbortController } from '../utils/abortController.js';

function postToUi(message: Response): void {
  figma.ui.postMessage(message);
}

/** Runs the last plan, when it is one of `planType`: the conventions' bindings, or Apply's tokens. */
async function executePlan(planType: PlanType, commandType: string, missing: string): Promise<void> {
  const state = getState();
  if (!state.lastPlan || state.lastPlanType !== planType) {
    postToUi({
      type: 'ERROR',
      payload: {
        message: missing,
        code: 'NO_PLAN',
        commandType,
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
        commandType,
      },
    });
  }
}

export function EXECUTE_APPLY_BINDINGS(): Promise<void> {
  return executePlan('apply_bindings', 'EXECUTE_APPLY_BINDINGS', 'Create an apply-bindings plan before executing.');
}

/** Apply's execution: every `APPLY_TOKEN` written through the field writer. No stamp is written. */
export function EXECUTE_APPLY(): Promise<void> {
  return executePlan('apply', 'EXECUTE_APPLY', 'Create an apply plan before executing.');
}
