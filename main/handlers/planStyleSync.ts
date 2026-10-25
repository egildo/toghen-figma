import type { Command, Response } from '../../shared/protocol.js';
import { StyleSyncEngine } from '../engines/styleSyncEngine.js';
import { getState, setState } from '../runtimeState.js';
import { danglingSymbolWarnings } from '../utils/planSymbols.js';
import { figmaCollectionNameFor } from '../utils/resolverModes.js';

type PlanStyleSyncCommand = Extract<Command, { type: 'PLAN_STYLE_SYNC' }>;

function postToUi(response: Response): void {
  figma.ui.postMessage(response);
}

export async function PLAN_STYLE_SYNC(payload: PlanStyleSyncCommand['payload']): Promise<void> {
  const state = getState();
  if (!state.resolver) {
    postToUi({
      type: 'ERROR',
      payload: {
        message: 'Load a resolver document before planning style sync.',
        code: 'NO_RESOLVER',
        commandType: 'PLAN_STYLE_SYNC',
      },
    });
    return;
  }

  // The same name the variable plan was given, so a member's variable is looked for where that plan put it.
  const collectionName = figmaCollectionNameFor(state.resolver, payload.collectionName);
  const engine = new StyleSyncEngine();
  const { operations } = await engine.buildPlan(state.resolver, state.conversionMap, collectionName, {
    overwriteDrift: payload.overwriteDrift === true,
  });
  operations.push(...danglingSymbolWarnings(operations));
  const summary = engine.summarizePlan(operations);

  setState({
    lastPlan: operations,
    lastPlanType: 'style_sync',
  });

  postToUi({
    type: 'PLAN_READY',
    payload: {
      planType: 'style_sync',
      operations,
      summary,
    },
  });
}
