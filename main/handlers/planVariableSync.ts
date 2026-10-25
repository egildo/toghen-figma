import type { Command, Response } from '../../shared/protocol.js';
import { VariableSyncEngine } from '../engines/variableSyncEngine.js';
import { getState, setState } from '../runtimeState.js';
import { danglingSymbolWarnings } from '../utils/planSymbols.js';
import { figmaCollectionNameFor } from '../utils/resolverModes.js';

type PlanVariableSyncCommand = Extract<Command, { type: 'PLAN_VARIABLE_SYNC' }>;

export async function PLAN_VARIABLE_SYNC(payload: PlanVariableSyncCommand['payload']): Promise<void> {
  const state = getState();
  if (!state.resolver) {
    postToUi({
      type: 'ERROR',
      payload: {
        message: 'Load a resolver document before planning sync.',
        code: 'NO_RESOLVER',
        commandType: 'PLAN_VARIABLE_SYNC',
      },
    });
    return;
  }

  const collectionName = figmaCollectionNameFor(state.resolver, payload.collectionName);
  const engine = new VariableSyncEngine();
  const { operations } = await engine.buildPlan(state.resolver, collectionName, state.conversionMap, {
    allowBreaking: payload.allowBreaking === true,
    overwriteDrift: payload.overwriteDrift === true,
  });
  operations.push(...danglingSymbolWarnings(operations));
  const summary = engine.summarizePlan(operations);

  setState({
    lastPlan: operations,
    lastPlanType: 'variable_sync',
  });

  postToUi({
    type: 'PLAN_READY',
    payload: {
      planType: 'variable_sync',
      operations,
      summary,
    },
  });
}

function postToUi(response: Response): void {
  figma.ui.postMessage(response);
}
