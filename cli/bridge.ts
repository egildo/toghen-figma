/**
 * The command line's half of the bridge: a localhost socket the plugin's UI connects to.
 *
 * It listens on a port the plugin's manifest names, and only on the loopback addresses. The socket's
 * origin is `null`, so it cannot tell the plugin from another page that opens the port; the two pair
 * instead. The plugin's first message is `{ "pair": "<code>" }`, and a connection without the right code
 * is closed with `REFUSED` and never sees a token. Once paired, messages in both directions are the plugin's
 * own protocol (`shared/protocol.ts`), one JSON object each, and the command line asks one question at a time.
 *
 * The code outlives the process: each run is a new one, and the plugin reconnects to it when it starts. It is kept in
 * a file only the person's account can read, and `pairing` is how a run reads and renews it.
 *
 * A run with a library holds two plugins at once, one in the library file and one in the target file: one code each,
 * one role each, on the same port (`serve`).
 */

import { randomInt, timingSafeEqual } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import type { Command, Response } from '../shared/protocol.js';

/** The port the manifest names. A port it does not declare is refused by Figma. */
export const PORT = 3055;
/** The close code for a pairing code the command line does not know. The plugin stops trying on it. */
export const REFUSED = 4001;
/** The close code for a plugin whose place another connection with the right code took. */
export const REPLACED = 4002;
/** After this many wrong codes in one run the run stops: nothing legitimate types a code that often. */
const MAX_REFUSALS = 5;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Eight characters from an alphabet without look-alikes, written `XXXX-XXXX`. */
export function newCode(): string {
  let code = '';
  for (let i = 0; i < 8; i += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** What is typed is compared without case, dashes or spaces. */
const normalize = (code: string): string => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

const same = (a: string, b: string): boolean => {
  const x = Buffer.from(normalize(a));
  const y = Buffer.from(normalize(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

/** The pairing code kept between runs, in a file only this account can read. */
export const pairing = {
  read(file: string): string | undefined {
    try {
      return readFileSync(file, 'utf8').trim() || undefined;
    } catch {
      return undefined;
    }
  },
  write(file: string, code: string): void {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    writeFileSync(file, `${code}\n`, { mode: 0o600 });
    // The mode above applies only to a file this call created.
    chmodSync(file, 0o600);
  },
};

/** The port is held by something else. */
export class PortTaken extends Error {
  constructor(readonly port: number) {
    super(
      `port ${port} is taken: another toghen-figma, or another program, is listening on it. Stop that one and run again; the plugin's manifest names this port, so it cannot be changed`,
    );
    this.name = 'PortTaken';
  }
}

/** The plugin went away, or the run was stopped, while a question was waiting. */
export class PluginGone extends Error {}

export interface Bridge {
  readonly port: number;
  /** Resolves once a plugin has paired; rejects when too many wrong codes were tried. */
  paired: Promise<void>;
  /**
   * Sends a command and resolves with the first response whose type is one of `answers`, or the `ERROR` that
   * names this command. Progress and anything else the plugin posts meanwhile goes to `onOther`.
   */
  request(command: Command, answers: Response['type'][], onOther?: (response: Response) => void): Promise<Response>;
  close(): Promise<void>;
}

const listen = (server: Server, port: number, host: string): Promise<void> =>
  new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

/** One plugin's end of the bridge, whose code a run can replace while it listens (a kept code nobody came back with). */
export interface Role extends Bridge {
  /** From now on this code pairs for the role, and the one before is refused. */
  renew(code: string): void;
}

/**
 * Starts listening, on 127.0.0.1 and, where there is one, ::1: `localhost` is either, depending on who asks.
 *
 * One code per role: a run with a library holds two plugins, one in each file, on the one port. A connection pairs as
 * the role whose code it gives, and replaces the plugin that held that role. Five wrong codes in all stop every role.
 * Closing any role closes the server, and every plugin's socket with it.
 */
export async function serve<R extends string>(port: number, codes: Record<R, string>): Promise<Record<R, Role>> {
  interface Held {
    code: string;
    plugin?: WebSocket;
    onMessage?: (response: Response) => void;
    onGone?: (error: Error) => void;
    markPaired: () => void;
    refuse: (error: Error) => void;
    paired: Promise<void>;
  }
  const held = {} as Record<R, Held>;
  for (const role of Object.keys(codes) as R[]) {
    const entry = { code: codes[role] } as Held;
    entry.paired = new Promise<void>((resolve, reject) => {
      entry.markPaired = resolve;
      entry.refuse = reject;
    });
    entry.paired.catch(() => {});
    held[role] = entry;
  }
  const all = Object.values<Held>(held);
  let refusals = 0;

  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 * 1024 });
  wss.on('connection', (socket) => {
    let mine: Held | undefined;
    socket.on('message', (data) => {
      let message: { pair?: unknown } & Partial<Response>;
      try {
        message = JSON.parse(data.toString());
      } catch {
        return socket.close(REFUSED, 'not JSON');
      }
      if (!mine) {
        const { pair } = message;
        const found = typeof pair === 'string' ? all.find((entry) => same(pair, entry.code)) : undefined;
        if (!found) {
          socket.close(REFUSED, 'pairing code refused');
          refusals += 1;
          if (refusals >= MAX_REFUSALS)
            for (const entry of all)
              entry.refuse(
                new Error(
                  `${refusals} connections gave a wrong pairing code, so the run stopped. Something other than the plugin is using port ${port}`,
                ),
              );
          return;
        }
        mine = found;
        found.plugin?.close(REPLACED, 'another connection paired');
        found.plugin = socket;
        socket.send(JSON.stringify({ paired: true }));
        found.markPaired();
        return;
      }
      mine.onMessage?.(message as Response);
    });
    socket.on('close', () => {
      if (!mine || mine.plugin !== socket) return;
      mine.plugin = undefined;
      mine.onGone?.(new PluginGone('the plugin disconnected: it was closed, or Figma lost it'));
    });
  });

  const servers = [createServer(), createServer()];
  for (const server of servers)
    server.on('upgrade', (request, socket, head) => wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request)));
  try {
    await listen(servers[0], port, '127.0.0.1');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') throw new PortTaken(port);
    throw error;
  }
  const bound = (servers[0].address() as AddressInfo).port;
  try {
    await listen(servers[1], bound, '::1');
  } catch (error) {
    // No IPv6 loopback is not a problem; a port something else holds there is.
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      servers[0].close();
      throw new PortTaken(bound);
    }
  }

  let closing: Promise<void> | undefined;
  const close = (): Promise<void> =>
    (closing ??= (async () => {
      for (const entry of all) {
        entry.onMessage = entry.onGone = undefined;
        // A paired plugin is closed with the normal code, and reconnects when the next run listens.
        entry.plugin?.close(1000);
      }
      for (const client of wss.clients) client.terminate();
      wss.close();
      await Promise.all(servers.map((server) => new Promise<void>((done) => (server.listening ? server.close(() => done()) : done()))));
    })());

  const roles = {} as Record<R, Role>;
  for (const role of Object.keys(held) as R[]) {
    const entry = held[role];
    roles[role] = {
      port: bound,
      paired: entry.paired,
      renew(code) {
        entry.code = code;
      },
      request(command, answers, onOther) {
        return new Promise((resolve, reject) => {
          const plugin = entry.plugin;
          if (!plugin || plugin.readyState !== plugin.OPEN) return reject(new PluginGone('the plugin is not connected'));
          entry.onGone = (error) => {
            entry.onMessage = entry.onGone = undefined;
            reject(error);
          };
          entry.onMessage = (response) => {
            const mine = response.type === 'ERROR' && response.payload.commandType === command.type;
            if (!mine && !answers.includes(response.type)) return onOther?.(response);
            entry.onMessage = entry.onGone = undefined;
            resolve(response);
          };
          plugin.send(JSON.stringify(command));
        });
      },
      close,
    };
  }
  return roles;
}
