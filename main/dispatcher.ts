import type { Command, Response } from '../shared/protocol.js';
import * as handlers from './handlers/index.js';

type HandlerFn = (payload: any) => Promise<void> | void;

export function setupDispatcher(): void {
  figma.ui.onmessage = async (command: Command) => {
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
  };
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
