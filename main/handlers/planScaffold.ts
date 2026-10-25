import type { Command, Response } from '../../shared/protocol.js';
import type { Operation } from '../../shared/operations.js';
import { PropertyMapper } from '../engines/propertyMapper.js';
import { QueryEngine } from '../engines/queryEngine.js';
import { getState, setState } from '../runtimeState.js';
import { danglingSymbolWarnings } from '../utils/planSymbols.js';

type PlanScaffoldCommand = Extract<Command, { type: 'PLAN_SCAFFOLD' }>;

function postToUi(message: Response): void {
  figma.ui.postMessage(message);
}

function summarizeOperations(operations: Operation[]): Record<string, number> {
  return {
    total: operations.length,
    creates: operations.filter((op) => op.kind === 'CREATE_COLLECTION' || op.kind === 'CREATE_VARIABLE').length,
    binds: operations.filter((op) => op.kind === 'BIND_VARIABLE').length,
    skips: operations.filter((op) => op.kind === 'SKIP').length,
    warnings: operations.filter((op) => op.kind === 'WARNING').length,
  };
}

async function resolveScaffoldCollection(operations: Operation[], preferredName: string): Promise<string> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  if (collections.length > 0) {
    return collections[0].id;
  }

  const collectionName = preferredName.trim() || 'resolved';
  const symbolicId = `$col:${collectionName}`;
  operations.push({
    kind: 'CREATE_COLLECTION',
    symbolicId,
    name: collectionName,
    modes: ['default'],
  });
  return symbolicId;
}

export async function PLAN_SCAFFOLD(payload: PlanScaffoldCommand['payload']): Promise<void> {
  const state = getState();
  if (state.conventions.length === 0) {
    postToUi({
      type: 'ERROR',
      payload: {
        message: 'Load conventions before planning scaffold operations.',
        code: 'INVALID_CONVENTIONS',
        commandType: 'PLAN_SCAFFOLD',
      },
    });
    return;
  }

  const queryEngine = new QueryEngine();
  const mapper = new PropertyMapper(state.conventions);
  const nodes = await queryEngine.resolve(payload.query, payload.scope);

  const operations: Operation[] = [];
  if (nodes.length === 0) {
    operations.push({ kind: 'SKIP', reason: 'no nodes matched query', path: payload.query });
  } else {
    const collectionId = await resolveScaffoldCollection(operations, state.resolver?.name ?? 'resolved');
    for (const node of nodes) {
      operations.push(...(await mapper.planScaffold(node, collectionId)));
    }
  }

  operations.push(...danglingSymbolWarnings(operations));

  setState({
    lastPlan: operations,
    lastPlanType: 'scaffold',
  });

  postToUi({
    type: 'PLAN_READY',
    payload: {
      planType: 'scaffold',
      operations,
      summary: summarizeOperations(operations),
    },
  });
}
