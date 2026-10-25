import type { Operation } from '../../shared/operations.js';
import type { Response } from '../../shared/protocol.js';
import { runOperations } from '../engines/batchRunner.js';
import { getState, setState } from '../runtimeState.js';
import { buildSyncStatePayload } from '../utils/syncState.js';
import { SimpleAbortController } from '../utils/abortController.js';

function postToUi(message: Response): void {
  figma.ui.postMessage(message);
}

/**
 * Loads the fonts the plan's text styles name. A font that was listed and
 * cannot be loaded costs its styles, not the run: each becomes a skip, as a
 * style with no family to load is skipped at plan time.
 */
async function preloadFontsForPlan(ops: readonly Operation[]): Promise<Operation[]> {
  const fontOf = (op: Operation): FontName | null => {
    if (op.kind !== 'CREATE_STYLE' && op.kind !== 'UPDATE_STYLE') return null;
    const props = op.props as Record<string, unknown>;
    if (typeof props.fontFamily !== 'string' || !props.fontFamily) return null;
    return { family: props.fontFamily, style: typeof props.fontStyle === 'string' ? props.fontStyle : 'Regular' };
  };

  const refs = [
    ...new Set(
      ops
        .map(fontOf)
        .filter((font) => font !== null)
        .map((font) => JSON.stringify(font)),
    ),
  ];
  const failed = new Set<string>();
  await Promise.all(refs.map((ref) => figma.loadFontAsync(JSON.parse(ref) as FontName).catch(() => void failed.add(ref))));

  return ops.map((op) => {
    const font = fontOf(op);
    if (!font || !failed.has(JSON.stringify(font)) || (op.kind !== 'CREATE_STYLE' && op.kind !== 'UPDATE_STYLE')) return op;
    return {
      kind: 'SKIP',
      reason: `"${op.tokenPath}" has no family Figma can load: "${font.family}" is listed but could not be loaded.`,
      path: op.tokenPath,
      cause: 'font-not-loaded',
      reported: true,
    };
  });
}

export async function EXECUTE_STYLE_SYNC(): Promise<void> {
  const state = getState();

  if (!state.resolver) {
    postToUi({
      type: 'ERROR',
      payload: {
        message: 'Load a resolver document before executing style sync.',
        code: 'NO_RESOLVER',
        commandType: 'EXECUTE_STYLE_SYNC',
      },
    });
    return;
  }

  if (!state.lastPlan || state.lastPlanType !== 'style_sync') {
    postToUi({
      type: 'ERROR',
      payload: {
        message: 'Create a style sync plan before executing.',
        code: 'NO_PLAN',
        commandType: 'EXECUTE_STYLE_SYNC',
      },
    });
    return;
  }

  const controller = new SimpleAbortController();
  setState({ activeOperation: controller });

  try {
    const plan = await preloadFontsForPlan(state.lastPlan);

    const summary = await runOperations(plan, {
      signal: controller.signal,
      onProgress: (completed, total, currentLabel) => {
        postToUi({
          type: 'OPERATION_PROGRESS',
          payload: { completed, total, currentLabel },
        });
      },
    });

    // What the run applied is already stamped on each style it wrote, from what Figma reported back.
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
        commandType: 'EXECUTE_STYLE_SYNC',
      },
    });
  }
}
