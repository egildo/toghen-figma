#!/usr/bin/env node
/**
 * `figcraft-cli` as a headless run meets it: `figcraft-cli mcp`, MCP's JSON-RPC over stdio, with the tools the run
 * calls (`run_command`, `open_file`, `save_file`). It holds no file of its own: each command goes on to the fake
 * control socket (`fakeFigcraft.ts`) at `FAKE_FIGCRAFT_PORT`, so a test reads what was written there. A file is
 * "opened" by showing the fake's tab whose path it is. `FAKE_FIGCRAFT_VERSION` is the version it says it is, and every
 * tool call is appended to `FAKE_FIGCRAFT_LOG`, one JSON line each.
 */

import { appendFileSync } from 'node:fs';
import { connect } from 'node:net';
import { createInterface } from 'node:readline';

const { FAKE_FIGCRAFT_PORT: port, FAKE_FIGCRAFT_VERSION: version = '0.10.0', FAKE_FIGCRAFT_LOG: log } = process.env;
if (process.argv[2] !== 'mcp') {
  process.stderr.write('the fake answers mcp only\n');
  process.exit(2);
}
process.stderr.write('figcraft MCP server (fake) on stdio\n');

const socket = connect(Number(port), '127.0.0.1');
socket.setEncoding('utf8');
const replies = createInterface({ input: socket });
const waiting = [];
replies.on('line', (line) => waiting.shift()(JSON.parse(line)));
let next = 1;
const engine = (command, params = {}) =>
  new Promise((resolve, reject) => {
    waiting.push((reply) => (reply.ok ? resolve(reply.result) : reject(new Error(reply.error))));
    socket.write(`${JSON.stringify({ id: next++, method: 'engine.execute', params: { command, params } })}\n`);
  });

const tools = {
  run_command: ({ command, params }) => engine(command, params),
  open_file: async ({ path }) => {
    const index = (await engine('doc.list')).findIndex((tab) => tab.path === path);
    if (index < 0) return { opened: await engine('file.open', { path }) };
    await engine('doc.switch', { index });
    return { opened: { index } };
  },
  save_file: async ({ path }) => ({ path, bytes: 0 }),
};

const send = (message) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
let queue = Promise.resolve();
createInterface({ input: process.stdin }).on('line', (line) => {
  const { id, method, params } = JSON.parse(line);
  queue = queue.then(async () => {
    if (id === undefined) return;
    if (method === 'initialize')
      return send({
        id,
        result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'figcraft', version } },
      });
    if (method !== 'tools/call') return send({ id, error: { code: -32601, message: `unknown method ${method}` } });
    if (log) appendFileSync(log, `${JSON.stringify({ tool: params.name, arguments: params.arguments })}\n`);
    try {
      const tool = tools[params.name];
      if (!tool) throw new Error(`unknown tool ${params.name}`);
      send({
        id,
        result: { content: [{ type: 'text', text: JSON.stringify(await tool(params.arguments ?? {}), null, 2) }], isError: false },
      });
    } catch (error) {
      send({ id, result: { content: [{ type: 'text', text: error.message }], isError: true } });
    }
  });
});
process.stdin.on('end', () => queue.then(() => socket.end()));
