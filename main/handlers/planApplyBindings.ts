import type { Command, Response } from '../../shared/protocol.js';
import type { Operation } from '../../shared/operations.js';
import { PropertyMapper } from '../engines/propertyMapper.js';
import { QueryEngine } from '../engines/queryEngine.js';
import { getState, setState } from '../runtimeState.js';
import { danglingSymbolWarnings } from '../utils/planSymbols.js';

type PlanApplyBindingsCommand = Extract<Command, { type: 'PLAN_APPLY_BINDINGS' }>;

function postToUi(message: Response): void {
  figma.ui.postMessage(message);
}

function summarizeOperations(operations: Operation[]): Record<string, number> {
  return {
    total: operations.length,
    binds: operations.filter((op) => op.kind === 'BIND_VARIABLE').length,
    skips: operations.filter((op) => op.kind === 'SKIP').length,
    warnings: operations.filter((op) => op.kind === 'WARNING').length,
  };
}

async function nodeById(id: string): Promise<SceneNode[]> {
  const node = await figma.getNodeByIdAsync(id);
  return node && 'visible' in node ? [node as SceneNode] : [];
}

export async function PLAN_APPLY_BINDINGS(payload: PlanApplyBindingsCommand['payload']): Promise<void> {
  const state = getState();
  if (state.conventions.length === 0) {
    postToUi({
      type: 'ERROR',
      payload: {
        message: 'Load conventions before planning apply bindings.',
        code: 'INVALID_CONVENTIONS',
        commandType: 'PLAN_APPLY_BINDINGS',
      },
    });
    return;
  }

  const mapper = new PropertyMapper(state.conventions);
  // One node, from the Selection pane's Bind; otherwise what the query matches in scope.
  const nodes =
    payload.nodeId !== undefined ? await nodeById(payload.nodeId) : await new QueryEngine().resolve(payload.query, payload.scope);

  const operations: Operation[] = [];
  if (nodes.length === 0) {
    operations.push({ kind: 'SKIP', reason: 'no nodes matched query', path: payload.nodeId ?? payload.query });
  } else {
    for (const node of nodes) {
      const planned = await mapper.planApplyBindings(node);
      operations.push(
        ...(payload.property === undefined
          ? planned
          : planned.filter((op) => op.kind === 'BIND_VARIABLE' && op.property === payload.property)),
      );
    }
    if (operations.length === 0) {
      operations.push({ kind: 'SKIP', reason: 'no applicable unbound variables found', path: payload.query });
    }
  }

  operations.push(...danglingSymbolWarnings(operations));

  setState({
    lastPlan: operations,
    lastPlanType: 'apply_bindings',
  });

  postToUi({
    type: 'PLAN_READY',
    payload: {
      planType: 'apply_bindings',
      operations,
      summary: summarizeOperations(operations),
    },
  });
}
