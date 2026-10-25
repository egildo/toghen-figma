/**
 * The plugin, as the command line meets it: a socket client that pairs and then answers commands.
 *
 * It does what the plugin's UI does (`ui/bridge.js`): the first message is the pairing code, and after that
 * each command is handed to the real handlers on the main thread, with the Figma mock behind them, and every
 * response they post goes back down the socket. Node's own `WebSocket` is the client.
 */

import type { FigmaMockHandle } from './figmaMock.js';
import * as handlers from '../../main/handlers/index.js';
import type { Response } from '../../shared/protocol.js';

type Handler = (payload: unknown) => Promise<void> | void;
type Mock = FigmaMockHandle;

export interface FakePlugin {
  /** Resolves when the command line said `paired`, and rejects with the close code when it refused. */
  paired: Promise<void>;
  /** Resolves with the close code once the socket closes. */
  closed: Promise<number>;
  /** The commands it received, in order. */
  received: string[];
  /** The same, with what each carried: what the command line actually sent. */
  commands: Array<{ type: string; payload: Record<string, unknown> }>;
  close(): void;
}

export function connectFakePlugin(port: number, code: string, mock: Mock): FakePlugin {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  const received: string[] = [];
  const commands: Array<{ type: string; payload: Record<string, unknown> }> = [];
  let forwarded = mock.calls('ui.postMessage').length;
  let markPaired: () => void;
  let markClosed: (code: number) => void;
  let refuse: (code: number) => void;
  const paired = new Promise<void>((resolve, reject) => {
    markPaired = resolve;
    refuse = (closeCode) => reject(new Error(`closed ${closeCode}`));
  });
  paired.catch(() => {});
  const closed = new Promise<number>((resolve) => (markClosed = resolve));

  socket.onopen = () => socket.send(JSON.stringify({ pair: code }));
  socket.onclose = (event) => {
    refuse(event.code);
    markClosed(event.code);
  };
  // One command at a time, as the main thread takes them.
  let queue = Promise.resolve();
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as { paired?: boolean; type?: string; payload?: unknown };
    if (message.paired) return markPaired();
    queue = queue.then(async () => {
      received.push(message.type!);
      commands.push({ type: message.type!, payload: message.payload as Record<string, unknown> });
      const handler = (handlers as unknown as Record<string, Handler>)[message.type!];
      // Two fake plugins, one per file, each answer from their own mock. The plugin's runtime state (the loaded
      // document, the last plan) is one module's, so it is shared: a test gives the load to one of them only.
      mock.use();
      try {
        if (!handler) throw new Error(`Unknown command: ${message.type}`);
        await handler(message.payload);
      } catch (error) {
        const response: Response = {
          type: 'ERROR',
          payload: { message: (error as Error).message, code: 'FIGMA_API_ERROR', commandType: message.type! },
        };
        (globalThis as { figma?: { ui: { postMessage(m: unknown): void } } }).figma!.ui.postMessage(response);
      }
      const posted = mock.calls('ui.postMessage');
      for (; forwarded < posted.length; forwarded += 1) socket.send(JSON.stringify(posted[forwarded].args[0]));
    });
  };

  return { paired, closed, received, commands, close: () => socket.close() };
}
