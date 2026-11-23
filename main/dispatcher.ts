import type { Command, Response } from '../shared/protocol.js';
import * as handlers from './handlers/index.js';

type HandlerFn = (payload: any) => Promise<void> | void;

/** What runs at once, beside the command in progress: stopping it, and sizing the window, neither of which reads the file. */
const AT_ONCE: ReadonlySet<string> = new Set(['CANCEL_OPERATION', 'RESIZE_UI']);

export function setupDispatcher(): void {
  // One command at a time, in the order they came: two executes in flight applied one plan twice, and a plan made
  // while an execute ran was cleared when it finished. `dispatch` never rejects, so the queue never stops.
  let queue: Promise<void> = Promise.resolve();
  figma.ui.onmessage = (command: Command) => {
    if (AT_ONCE.has(command.type)) return dispatch(command);
    queue = queue.then(() => dispatch(command));
    return queue;
  };
}

async function dispatch(command: Command): Promise<void> {
  const handler = (handlers as unknown as Record<string, HandlerFn>)[command.type];
  if (!handler) {
    postError(`Unknown command: ${command.type}`, command.type);
    return;
  }

  try {
    await handler(command.payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    postError(message, command.type);
  }
}

function postError(message: string, commandType: string): void {
  const response: Response = {
    type: 'ERROR',
    payload: {
      message,
      code: 'FIGMA_API_ERROR',
      commandType,
    },
  };
  figma.ui.postMessage(response);
}
