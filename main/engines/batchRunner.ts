import type { Operation, OperationResult, OperationSummary } from '../../shared/operations.js';
import { executeOperation, labelForOperation } from './operationExecutor.js';
import { SymbolicIdRegistry } from '../utils/symbolicIdRegistry.js';
import type { SimpleAbortSignal } from '../utils/abortController.js';
import { dependenciesOf } from '../utils/planSymbols.js';
import { isAlias } from '../utils/figmaTokenAdapter.js';

export interface BatchRunOptions {
  onProgress: (completed: number, total: number, label: string) => void;
  signal?: SimpleAbortSignal;
}

function resolveOperationIds(op: Operation, registry: SymbolicIdRegistry): Operation {
  switch (op.kind) {
    case 'ADD_MODE':
      return { ...op, collectionId: registry.resolve(op.collectionId) };
    case 'DELETE_MODE':
    case 'DELETE_VARIABLE':
      return op;
    case 'CREATE_VARIABLE':
      return { ...op, collectionId: registry.resolve(op.collectionId) };
    case 'SET_VARIABLE_VALUE':
      return {
        ...op,
        variableId: registry.resolve(op.variableId),
        modeId: registry.resolve(op.modeId),
        // An alias may point at a variable this same plan creates.
        value: isAlias(op.value) ? { ...op.value, id: registry.resolve(op.value.id) } : op.value,
      };
    case 'BIND_VARIABLE':
      return { ...op, variableId: registry.resolve(op.variableId) };
    case 'RENAME_VARIABLE':
    case 'SET_CODE_SYNTAX':
    case 'SET_VARIABLE_SCOPES':
      return { ...op, variableId: registry.resolve(op.variableId) };
    case 'UNBIND_VARIABLE':
    case 'APPLY_TOKEN':
    case 'STAMP':
    case 'CREATE_COLLECTION':
    case 'CREATE_STYLE':
    case 'UPDATE_STYLE':
    case 'SKIP':
    case 'WARNING':
    case 'BREAKING':
    case 'NOTE':
    case 'SWAP_COMPONENT':
      return op;
    default: {
      const _exhaustive: never = op;
      return _exhaustive;
    }
  }
}

async function registerSymbolicOutputs(originalOp: Operation, figmaId: string | undefined, registry: SymbolicIdRegistry): Promise<void> {
  if (!figmaId) return;

  if (originalOp.kind === 'CREATE_COLLECTION' && originalOp.symbolicId) {
    registry.register(originalOp.symbolicId, figmaId);

    const collection = await figma.variables.getVariableCollectionByIdAsync(figmaId);
    if (collection) {
      for (const mode of collection.modes) {
        registry.register(`$mode:${originalOp.name}/${mode.name}`, mode.modeId);
      }
    }
    return;
  }

  if (originalOp.kind === 'ADD_MODE') {
    const collection = await figma.variables.getVariableCollectionByIdAsync(figmaId);
    const mode = collection?.modes.find((m) => m.name === originalOp.modeName);
    if (collection && mode) {
      registry.register(`$mode:${collection.name}/${originalOp.modeName}`, mode.modeId);
    }
    return;
  }

  if (originalOp.kind === 'CREATE_VARIABLE' && originalOp.symbolicId) {
    registry.register(originalOp.symbolicId, figmaId);
  }
}

export async function runOperations(ops: Operation[], options: BatchRunOptions): Promise<OperationSummary> {
  const results: OperationResult[] = [];
  const startTime = Date.now();
  const registry = new SymbolicIdRegistry();

  /** The plan's rows that are not skips: carried into the results, and counted by the plan, not as skipped here. */
  const isCounted = (op: Operation) => op.kind === 'WARNING' || op.kind === 'BREAKING' || op.kind === 'NOTE';
  const isRow = (op: Operation) => op.kind === 'SKIP' || isCounted(op);
  const executable = ops.filter((op) => !isRow(op));
  const skipped = ops.filter(isRow);

  skipped.forEach((op) => {
    results.push({
      operation: op,
      status: 'skipped',
      reason: op.kind === 'SKIP' ? op.reason : op.message,
    });
  });

  // Symbols whose producing operation failed. Everything downstream of one is
  // reported as a skipped prerequisite rather than as its own failure — a
  // CREATE_COLLECTION that hits the mode cap used to cascade into hundreds of
  // identical "Unresolved symbolic ID" errors that said nothing about the cause.
  const failedSymbols = new Set<string>();

  for (let i = 0; i < executable.length; i += 1) {
    const operation = executable[i];

    if (options.signal?.aborted) {
      results.push({
        operation,
        status: 'skipped',
        reason: 'cancelled',
      });
      continue;
    }

    const blockedBy = blockingSymbol(operation, failedSymbols);
    if (blockedBy) {
      results.push({
        operation,
        status: 'skipped',
        reason: `prerequisite failed: ${blockedBy}`,
      });
      recordFailedSymbol(operation, failedSymbols);
      continue;
    }

    let resolvedOperation: Operation;
    try {
      resolvedOperation = resolveOperationIds(operation, registry);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      results.push({
        operation,
        status: 'failed',
        reason,
      });
      recordFailedSymbol(operation, failedSymbols);
      continue;
    }

    options.onProgress(i + 1, executable.length, labelForOperation(resolvedOperation));

    const opStart = Date.now();
    try {
      const figmaId = await executeOperation(resolvedOperation);
      results.push({
        operation: resolvedOperation,
        status: 'applied',
        figmaId,
        durationMs: Date.now() - opStart,
      });

      await registerSymbolicOutputs(operation, figmaId, registry);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      results.push({
        operation: resolvedOperation,
        status: 'failed',
        reason,
        durationMs: Date.now() - opStart,
      });
      recordFailedSymbol(operation, failedSymbols);
    }
  }

  return {
    total: ops.length,
    applied: results.filter((r) => r.status === 'applied').length,
    // A skip, a prerequisite that failed, a cancellation: a warning, a note or a breaking row was counted by the plan under its own name (R14).
    skipped: results.filter((r) => r.status === 'skipped' && !isCounted(r.operation)).length,
    failed: results.filter((r) => r.status === 'failed').length,
    cancelled: results.filter((r) => r.status === 'skipped' && r.reason === 'cancelled').length,
    durationMs: Date.now() - startTime,
    results,
  };
}

/** The symbolic id an operation produces, if any. */
function producedSymbol(op: Operation): string | undefined {
  if (op.kind === 'CREATE_COLLECTION' || op.kind === 'CREATE_VARIABLE') {
    return op.symbolicId;
  }
  return undefined;
}

/** Records that an operation's output symbol will never resolve. */
function recordFailedSymbol(op: Operation, failedSymbols: Set<string>): void {
  const symbol = producedSymbol(op);
  if (symbol) failedSymbols.add(symbol);
}

/** The failed symbol an operation depends on, if any. */
function blockingSymbol(op: Operation, failedSymbols: Set<string>): string | undefined {
  return dependenciesOf(op).find((dependency) => failedSymbols.has(dependency));
}
