/**
 * The command line's connections end, rather than wait for an answer that cannot come: a plugin window another one
 * replaced, FigCraft's control socket after it closed, and a headless `figcraft-cli mcp` that never answers or writes
 * something that is not MCP on its standard output. Synthetic stand-ins only.
 */

import { after, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPLACED, serve } from '../cli/bridge.js';
import { connect, headless } from '../cli/figcraft.js';
import type { Command, Response } from '../shared/protocol.js';

const folder = mkdtempSync(join(tmpdir(), 'toghen-connections-'));
after(() => rmSync(folder, { recursive: true, force: true }));

/** A stand-in for `figcraft-cli`, written as an executable script: `body` runs as `figcraft-cli mcp` would. */
function cliScript(name: string, body: string): string {
  const path = join(folder, name);
  writeFileSync(path, `#!/usr/bin/env node\n${body}\n`, { mode: 0o755 });
  return path;
}

/** Answers `initialize` as figcraft-cli 0.18.1 does, and every other request with `then`, when given. */
const answering = (then = '') => `
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  for (const line of chunk.split('\\n').filter(Boolean)) {
    const { id, method } = JSON.parse(line);
    if (method === 'initialize')
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result: { serverInfo: { name: 'figcraft', version: '0.18.1' } } }) + '\\n');
    ${then}
  }
});`;

/** A socket that pairs with `code` and then holds every command it is sent, answering none. */
function holdingPlugin(port: number, code: string) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  const closed = new Promise<number>((resolve) => (socket.onclose = (event) => resolve(event.code)));
  const paired = new Promise<void>((resolve) => {
    socket.onmessage = (event) => {
      if (JSON.parse(String(event.data)).paired) resolve();
    };
  });
  socket.onopen = () => socket.send(JSON.stringify({ pair: code }));
  return { paired, closed };
}

describe('the plugin bridge, when another window pairs with the same code', () => {
  it('refuses the question the replaced window held, with a sentence, and closes that window as replaced', { timeout: 5000 }, async () => {
    const roles = await serve(0, { target: 'ABCD-EFGH' });
    try {
      const first = holdingPlugin(roles.target.port, 'ABCD-EFGH');
      await first.paired;
      const asked = assert.rejects(
        roles.target.request({ type: 'GET_LOCK', payload: {} } as Command, ['LOCK'] as Response['type'][]),
        /another plugin window paired with the same code/,
      );
      await holdingPlugin(roles.target.port, 'ABCD-EFGH').paired;
      await asked;
      assert.equal(await first.closed, REPLACED);
    } finally {
      await roles.target.close();
    }
  });

  it("is not reconnected by the replaced window's bridge, which would take the place back", async () => {
    // The screen's bridge in Node: the few globals its imports reach, and a WebSocket that only records itself.
    const sockets: Array<{ onclose?: (event: { code: number }) => void; close(): void }> = [];
    const { WebSocket: real } = globalThis;
    Object.assign(globalThis, {
      window: globalThis,
      parent: { postMessage() {} },
      HTMLElement: class {},
      customElements: { define() {}, get() {} },
      document: { querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, documentElement: { dataset: {} } },
      WebSocket: class {
        constructor() {
          sockets.push(this as never);
        }
        send() {}
        close() {}
      },
    });
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const { connectCommandLine, disconnectCommandLine } = await import(new URL('../ui/bridge.js', import.meta.url).href);
      connectCommandLine('ABCD-EFGH');
      sockets[0].onclose?.({ code: 1006 });
      mock.timers.tick(1000);
      assert.equal(sockets.length, 2, 'a lost connection is tried again');
      sockets[1].onclose?.({ code: REPLACED });
      mock.timers.tick(5000);
      assert.equal(sockets.length, 2, 'a replaced one is not');
      disconnectCommandLine();
    } finally {
      mock.timers.reset();
      globalThis.WebSocket = real;
    }
  });
});

describe("FigCraft's control socket", () => {
  const listening = async (onLine: (line: string, socket: import('node:net').Socket) => void): Promise<Server> => {
    const server = createServer((socket) => {
      socket.setEncoding('utf8');
      socket.on('data', (chunk: string) => {
        for (const line of chunk.split('\n').filter(Boolean)) onLine(line, socket);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    return server;
  };
  const portOf = (server: Server) => (server.address() as { port: number }).port;

  it('refuses a call made after FigCraft closed the connection, as its idle timeout does', { timeout: 5000 }, async () => {
    const server = await listening((line, socket) => {
      socket.end(`${JSON.stringify({ id: JSON.parse(line).id, ok: true, result: [] })}\n`);
    });
    try {
      const control = await connect(portOf(server));
      assert.deepEqual(await control.call('engine.execute', { command: 'doc.list', params: {} }), []);
      await new Promise((resolve) => setTimeout(resolve, 50));
      await assert.rejects(control.call('engine.execute', { command: 'doc.list', params: {} }), /FigCraft closed the connection/);
    } finally {
      server.close();
    }
  });

  it('gives each call the reply that carries its id', { timeout: 5000 }, async () => {
    const held: Array<{ id: number; socket: import('node:net').Socket }> = [];
    const server = await listening((line, socket) => {
      held.push({ id: JSON.parse(line).id, socket });
      // Answered last first.
      if (held.length === 2)
        for (const { id, socket: to } of held.reverse()) to.write(`${JSON.stringify({ id, ok: true, result: `answer ${id}` })}\n`);
    });
    try {
      const control = await connect(portOf(server));
      const answers = await Promise.all([control.call('engine.execute', {}), control.call('engine.execute', {})]);
      assert.deepEqual(answers, ['answer 1', 'answer 2']);
      control.close();
    } finally {
      server.close();
    }
  });
});

describe('a headless figcraft-cli that does not answer as MCP', () => {
  const file = join(folder, 'none.figcraft');
  // Long enough for a script to start, short enough for a test.
  const waits = { start: 10_000, request: 300 };

  it('gives up on an initialize that never comes', { timeout: 5000 }, async () => {
    const cli = cliScript('silent', "process.stdin.on('data', () => {});");
    await assert.rejects(headless(file, cli, { ...waits, start: 300 }), /silent mcp did not answer initialize within 0\.3 s/);
  });

  it('gives up on a request that never comes back, and refuses every one after it', { timeout: 5000 }, async () => {
    const control = await headless(file, cliScript('stalls', answering()), waits);
    await assert.rejects(
      control.call('engine.execute', { command: 'doc.list', params: {} }),
      /stalls mcp did not answer doc\.list within 0\.3 s/,
    );
    await assert.rejects(control.call('engine.execute', { command: 'doc.list', params: {} }), /did not answer doc\.list/);
    control.close();
  });

  it('reports a line that is not JSON on its standard output, and stops, rather than throwing', { timeout: 5000 }, async () => {
    const cli = cliScript('noisy', `process.stdout.write('indexing fonts...\\n');\n${answering()}`);
    await assert.rejects(headless(file, cli, waits), /noisy mcp wrote what is not MCP on its standard output: "indexing fonts\.\.\."/);
  });
});
