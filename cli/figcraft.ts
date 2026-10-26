/**
 * The FigCraft target: `toghen-figma variables <resolver> --figcraft <port>` syncs into a file open in FigCraft.
 *
 * FigCraft runs no Figma plugin, so there is nothing to pair with. It listens on a loopback control socket instead
 * (`figcraft --control <port>`), newline-delimited JSON, and runs its own commands there. This module stands in for
 * the plugin: it runs the plugin's own handlers in this process, with a `figma` that answers their reads from what
 * FigCraft lists, and writes each plan operation as FigCraft commands (`figcraftFile.ts`). The run's steps are the
 * Figma run's (`run.ts`), so the plans, their checks and their report are the same (specs.md, *The command line*, *FigCraft*).
 *
 * FigCraft acts on the file a window shows. The run pins the file shown when it starts, and every request carries that
 * window and switches it back to that file inside the same batch, so a write lands there even if the person looked at
 * another tab meanwhile. A request reads the tabs back in the same batch, and the run stops if the file moved.
 *
 * With no app, `--figcraft-file <path.figcraft>` runs against a file headless: `figcraft-cli mcp` as a child process,
 * spoken to in MCP over its stdio (`headless`). The same commands go through it, so everything above the transport is
 * unchanged: the session opens the file, has no window, and saves the file once the run has completed.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { connect as connectSocket, type Socket } from 'node:net';
import * as handlers from '../main/handlers/index.js';
import { labelForOperation, writeOperationsWith } from '../main/engines/operationExecutor.js';
import { writeComponentsWith } from '../main/components/run.js';
import { pinLibraryModes } from '../main/components/resolve.js';
import type { Operation } from '../shared/operations.js';
import type { Command, Response } from '../shared/protocol.js';
import type { Bridge } from './bridge.js';
import { figmaView, translate, type FcListing, type FcStyle, type FigmaView, type Step } from './figcraftFile.js';
import {
  attach,
  guard,
  readExtras,
  readRecord,
  RECORD_KEY,
  RECORD_PAGE,
  recordText,
  type Extras,
  type StampRecord,
} from './figcraftRecord.js';
import { figcraftWriter } from './figcraftApply.js';
import { splitKey, type FcLibrary } from './figcraftLibrary.js';
import { clearWrites, hasWrites, noWrites, sceneOf, writeSteps, type FcNode, type Scene } from './figcraftScene.js';

/** One connection to FigCraft, its control socket or a headless session: one request, one reply, in order. */
export interface Control {
  call(method: string, params: Record<string, unknown>): Promise<unknown>;
  /** Opens a file on disk in a tab of its own, or shows it where it is open already; answers nothing. */
  open(path: string, window?: number): Promise<void>;
  /** A headless session saves its file, and answers the path saved; the app's file is the person's to save. */
  save?(): Promise<string>;
  /** A headless session's `figcraft-cli` version. */
  version?: string;
  close(): void;
}

/**
 * A data handler that calls `line` with each whole line. Each chunk is searched once: a reply of many megabytes, which
 * a read of a large file is, arrives in many chunks, and searching all that had arrived on each one cost its length
 * times its chunks.
 */
export function byLine(line: (text: string) => void): (chunk: string) => void {
  let parts: string[] = [];
  return (chunk) => {
    for (let at = chunk.indexOf('\n'); at >= 0; at = chunk.indexOf('\n')) {
      parts.push(chunk.slice(0, at));
      line(parts.join(''));
      parts = [];
      chunk = chunk.slice(at + 1);
    }
    if (chunk) parts.push(chunk);
  };
}

export function connect(port: number): Promise<Control> {
  return new Promise((resolve, reject) => {
    const socket: Socket = connectSocket(port, '127.0.0.1');
    const waiting: Array<{ resolve(value: unknown): void; reject(error: Error): void }> = [];
    let next = 1;
    socket.setEncoding('utf8');
    socket.once('error', (error) =>
      reject(new Error(`Nothing answered on 127.0.0.1:${port}: ${error.message}. Start FigCraft with --control ${port}.`)),
    );
    socket.on(
      'data',
      byLine((line) => {
        const reply = JSON.parse(line) as { ok: boolean; result?: unknown; error?: string };
        const pending = waiting.shift();
        if (reply.ok) pending?.resolve(reply.result);
        else pending?.reject(new Error(reply.error ?? 'FigCraft refused the request'));
      }),
    );
    socket.on('close', () => {
      for (const pending of waiting.splice(0)) pending.reject(new Error('FigCraft closed the connection'));
    });
    const call = (method: string, params: Record<string, unknown>): Promise<unknown> =>
      new Promise((done, fail) => {
        waiting.push({ resolve: done, reject: fail });
        socket.write(`${JSON.stringify({ id: next++, method, params })}\n`);
      });
    socket.once('connect', () => {
      socket.on('error', () => {});
      resolve({
        call,
        open: async (path, window) =>
          void (await call('engine.execute', { command: 'file.open', params: { path }, ...(window !== undefined ? { window } : {}) })),
        close: () => socket.end(),
      });
    });
  });
}

/** The oldest `figcraft-cli` a headless run takes: its `node.get` reports layer data, which holds the stamps, from 0.8.0. */
export const HEADLESS_SINCE = '0.8.0';

/** Whether version `a` comes before `b`, both `major.minor.patch`. */
const before = (a: string, b: string): boolean => {
  const [x, y] = [a, b].map((version) => version.split(/[.+-]/).slice(0, 3).map(Number));
  const at = x.findIndex((part, i) => part !== y[i]);
  return at >= 0 && !(x[at] > y[at]);
};

/**
 * A headless FigCraft session on `file`: `figcraft-cli mcp` (`FIGCRAFT_CLI`, else the one on the PATH) as a child
 * process, MCP's JSON-RPC over its stdio. `engine.execute` goes as the `run_command` tool, which runs the same command
 * registry the socket does; there is no window, so nothing else is offered. The file is opened when it exists; when it
 * does not, the session's untitled file is the one written, and saving gives it the path.
 */
export function headless(file: string, cli = process.env.FIGCRAFT_CLI || 'figcraft-cli'): Promise<Control> {
  const child = spawn(cli, ['mcp'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const waiting = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  let said = '';
  let next = 1;
  let ended: Error | undefined;
  const end = (error: Error): void => {
    ended ??= error;
    for (const pending of waiting.values()) pending.reject(ended);
    waiting.clear();
  };
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => (said = (said + chunk).slice(-2000)));
  child.stdout.on(
    'data',
    byLine((line) => {
      const reply = JSON.parse(line) as { id?: number; result?: unknown; error?: { message: string } };
      const pending = reply.id === undefined ? undefined : waiting.get(reply.id);
      if (!pending) return;
      waiting.delete(reply.id!);
      if (reply.error) pending.reject(new Error(reply.error.message));
      else pending.resolve(reply.result);
    }),
  );
  child.on('error', (error: NodeJS.ErrnoException) =>
    end(
      new Error(
        error.code === 'ENOENT'
          ? `${cli} was not found: put figcraft-cli on the PATH, or name it with FIGCRAFT_CLI.`
          : `${cli} did not start: ${error.message}`,
      ),
    ),
  );
  child.on('exit', (code) => end(new Error(`${cli} mcp ended (exit ${code})${said.trim() ? `: ${said.trim().split('\n').pop()}` : ''}`)));
  child.stdin.on('error', () => {});

  const send = (message: Record<string, unknown>): void => void child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  const rpc = (method: string, params: unknown): Promise<unknown> =>
    ended
      ? Promise.reject(ended)
      : new Promise((resolve, reject) => {
          const id = next++;
          waiting.set(id, { resolve, reject });
          send({ id, method, params });
        });
  /** A tool's answer, its text read as JSON; a tool error is a refusal, as the socket's `ok: false` is. */
  const tool = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    const { content, isError } = (await rpc('tools/call', { name, arguments: args })) as {
      content: Array<{ text?: string }>;
      isError?: boolean;
    };
    const text = content.map((part) => part.text ?? '').join('');
    if (isError) throw new Error(text || `FigCraft refused ${name}`);
    return JSON.parse(text);
  };
  const close = (): void => void child.stdin.end();

  return (async () => {
    try {
      const { serverInfo } = (await rpc('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'toghen-figma', version: '1' },
      })) as { serverInfo?: { version?: string } };
      const version = serverInfo?.version ?? 'of no version';
      if (!/^\d+\.\d+\.\d+/.test(version) || before(version, HEADLESS_SINCE)) {
        throw new Error(
          `${cli} is ${version}: a headless run needs figcraft-cli ${HEADLESS_SINCE} or later, whose node.get reports the layer data that holds Toghen's stamps.`,
        );
      }
      send({ method: 'notifications/initialized' });
      if (existsSync(file)) await tool('open_file', { path: file });
      const control: Control = {
        version,
        call: (method, params) =>
          method === 'engine.execute'
            ? tool('run_command', { command: params.command, params: params.params ?? {} })
            : Promise.reject(new Error(`A headless FigCraft has no ${method}.`)),
        open: async (path) => void (await tool('open_file', { path })),
        save: async () => ((await tool('save_file', { path: file })) as { path?: string }).path ?? file,
        close,
      };
      return control;
    } catch (error) {
      close();
      throw error;
    }
  })();
}

/** A tab as `doc.list` lists it. */
interface Tab {
  index: number;
  name: string;
  path: string | null;
  active: boolean;
}

/** The file the run writes into: the window it is in, and the tab it is, as it was when the run began. */
export interface Pin {
  window?: number;
  tab: Tab;
  /** Set once the file left its tab: every later request is refused before it is sent. */
  lost?: string;
  /** What the writes since the layers were last read touched (`touchedBy`), for the next read to read again. */
  touched?: Touched;
}

/** The layers a write touched, by id; `all` when it may have changed what no id names (a variable, a style, a library). */
export interface Touched {
  all: boolean;
  ids: Set<number>;
}

/** The parameters, and the result fields, that name a layer a command writes. A layer only referred to (an instance's `component`) is not one. */
const NAMES_A_LAYER = new Set(['id', 'ids', 'parent', 'layer']);
/**
 * Commands that write the layers they name and nothing else: binding a variable or applying a style to a layer
 * included. Any other write may change what a layer shows (a variable's value, a style, a library's update).
 */
const LAYER_COMMANDS =
  /^(node|frame|text|instance|component|edit)\.|^(page\.select|variable\.bind|variable\.setMode|style\.apply|style\.bind|library\.applyStyle)$/;

/** Adds to `into` what a batch's steps and results touched. */
export function touchedBy(into: Touched, steps: readonly Step[], results: readonly unknown[] | undefined): void {
  const collect = (value: unknown, named: boolean): void => {
    if (typeof value === 'number' && named) into.ids.add(value);
    else if (Array.isArray(value)) for (const item of value) collect(item, named);
    else if (value && typeof value === 'object')
      for (const [key, inner] of Object.entries(value)) collect(inner, NAMES_A_LAYER.has(key) || (named && key === '$step'));
  };
  for (const step of steps) {
    if (!LAYER_COMMANDS.test(step.command)) into.all = true;
    collect(step.params, false);
  }
  // What a batch made is named by its result.
  if (results) collect(results, false);
}

const sameFile = (a: Tab, b: Tab | undefined): boolean => b !== undefined && a.name === b.name && a.path === b.path;

/** FigCraft's front window, when it reports windows: a window id keeps the requests in one window when it has several. */
async function frontWindow(control: Control): Promise<number | undefined> {
  // With one window (a screen reader keeps it to one), or headless, there is none to give.
  const windows = (await control.call('window.list', {}).catch(() => [])) as Array<{ id: number; focused: boolean }>;
  return windows.find((candidate) => candidate.focused)?.id;
}

const tabsIn = async (control: Control, window: number | undefined): Promise<Tab[]> =>
  (await control.call('engine.execute', { command: 'doc.list', params: {}, ...(window !== undefined ? { window } : {}) })) as Tab[];

/** The file FigCraft shows in its front window. */
export async function pinShownFile(control: Control): Promise<Pin> {
  const window = await frontWindow(control);
  const tab = (await tabsIn(control, window)).find((candidate) => candidate.active);
  if (!tab) throw new Error('FigCraft shows no file: open the file to sync into, then run again.');
  return { ...(window !== undefined ? { window } : {}), tab };
}

/**
 * The file at `path`, pinned: its tab where it is open, else a tab it is opened in. A file that does not exist yet is a
 * new document named after it, with no path until it is saved there (`made`), which is the caller's to do.
 */
export async function pinPath(control: Control, path: string): Promise<Pin & { made?: true }> {
  const window = await frontWindow(control);
  const at = { ...(window !== undefined ? { window } : {}) };
  const open = (await tabsIn(control, window)).find((tab) => tab.path === path);
  if (open) return { ...at, tab: open };
  // FigCraft opens it, or says it is not there (`No such file or directory`); the file system it reads is its own.
  const missing = await control.open(path, window).then(
    () => false,
    (error: Error) => {
      if (/No such file|os error 2/i.test(error.message)) return true;
      throw error;
    },
  );
  if (!missing) {
    const tab = (await tabsIn(control, window)).find((candidate) => candidate.path === path);
    if (!tab) throw new Error(`FigCraft did not open ${path}.`);
    return { ...at, tab };
  }
  const { index } = (await control.call('engine.execute', {
    command: 'file.new',
    params: { name: basename(path).replace(/\.figcraft$/i, '') },
    ...at,
  })) as { index: number };
  const tab = (await tabsIn(control, window))[index];
  if (!tab) throw new Error(`FigCraft did not make a file for ${path}.`);
  return { ...at, tab, made: true };
}

/**
 * Runs `steps` in the pinned file as one batch, one undo step named `label`, and answers their results. The batch
 * shows the pinned file first, and lists the tabs last: a file that is no longer at its tab stops the run.
 */
export async function inFile(control: Control, pin: Pin, label: string, steps: Step[]): Promise<unknown[]> {
  if (pin.lost) throw new Error(pin.lost);
  if (label !== 'Read') pin.touched ??= { all: false, ids: new Set() };
  const touched = label === 'Read' ? undefined : pin.touched;
  if (touched) touchedBy(touched, steps, undefined);
  const answer = control.call('engine.execute', {
    command: 'command.batch',
    params: {
      label,
      commands: [
        { command: 'doc.switch', params: { index: pin.tab.index } },
        { command: 'command.batch', params: { commands: steps } },
        { command: 'doc.list', params: {} },
      ],
    },
    ...(pin.window !== undefined ? { window: pin.window } : {}),
  });
  // A batch that fails is rolled back, but nothing says how far it got: the next read reads everything.
  const [, results, tabs] = (await answer.catch((error: Error) => {
    if (touched) touched.all = true;
    throw error;
  })) as [unknown, unknown[], Tab[]];
  if (touched) touchedBy(touched, [], results);
  if (!sameFile(pin.tab, tabs[pin.tab.index])) {
    pin.lost = `FigCraft no longer has "${pin.tab.name}" at the tab it was in (a tab before it closed?): nothing more is written, and the step before this may have gone to "${tabs[pin.tab.index]?.name ?? 'no file'}".`;
    throw new Error(pin.lost);
  }
  return results;
}

/**
 * Saves the pinned file at `path`, in a batch of its own that shows it first. A file made by the run gets its path
 * here, and its pin follows it.
 */
export async function savePinned(control: Control, pin: Pin, path: string): Promise<void> {
  if (pin.lost) throw new Error(pin.lost);
  const [, , tabs] = (await control.call('engine.execute', {
    command: 'command.batch',
    params: {
      commands: [
        { command: 'doc.switch', params: { index: pin.tab.index } },
        { command: 'file.save', params: { path } },
        { command: 'doc.list', params: {} },
      ],
    },
    ...(pin.window !== undefined ? { window: pin.window } : {}),
  })) as [unknown, unknown, Tab[]];
  const now = tabs[pin.tab.index];
  if (now?.path !== path) {
    pin.lost = `FigCraft no longer has "${pin.tab.name}" at the tab it was in: it was not saved at ${path}.`;
    throw new Error(pin.lost);
  }
  pin.tab = now;
}

/** Closes the pinned file's tab, unsaved changes and all: only for a file the run made and did not save. */
export async function closeTab(control: Control, pin: Pin): Promise<void> {
  await control.call('engine.execute', {
    command: 'file.close',
    params: { index: pin.tab.index, force: true },
    ...(pin.window !== undefined ? { window: pin.window } : {}),
  });
}

/** A FigCraft key as the parameters of a `library.*` command: the library's id, and the asset's id under `kind`. */
function libraryAsset(
  key: string,
  kind: 'component' | 'variable' | 'style',
): { library: string; asset: string; params: Record<string, unknown> } {
  const split = splitKey(key);
  const what = kind === 'component' ? 'Component' : kind === 'variable' ? 'Variable' : 'Style';
  if (!split)
    throw new Error(
      `${what} with key "${key}" not found: a FigCraft key is <library id>:<asset id>, and a Figma key names nothing in FigCraft`,
    );
  // A component's asset id is its node id in the library file, a number.
  const asset = kind === 'component' && /^\d+$/.test(split.asset) ? Number(split.asset) : split.asset;
  return { ...split, params: { library: split.library, [kind]: asset } };
}

type Handler = (payload: unknown) => Promise<void> | void;

/** The commands that read and write layers: they run against the file's layers as they are when each is sent. */
const COMPONENT_COMMANDS = new Set(['CHECK_COMPONENTS', 'RUN_COMPONENT', 'FINISH_COMPONENTS']);

/** What a run says outside its responses: Figma's toasts, which a plugin shows and the command line prints. */
interface Say {
  stdout(text: string): void;
  stderr(text: string): void;
}

/** A page as `page.list` lists it. */
interface Page {
  id: number;
  name: string;
  current: boolean;
}

/** The page that holds the record, found by its data rather than its name, and the record it holds. */
async function readStamps(control: Control, pin: Pin): Promise<{ page?: number; record: StampRecord; extras: Extras }> {
  const [pages] = (await inFile(control, pin, 'Read', [{ command: 'page.list', params: {} }])) as [Page[]];
  const held = (await inFile(
    control,
    pin,
    'Read',
    pages.map((page) => ({ command: 'node.get', params: { id: page.id, depth: 0 } })),
  )) as Array<{ pluginData?: Record<string, string> }>;
  const index = held.findIndex((page) => page.pluginData?.[RECORD_KEY]);
  if (index < 0) return { record: new Map(), extras: readExtras(undefined) };
  const text = held[index].pluginData![RECORD_KEY];
  return { page: pages[index].id, record: readRecord(text), extras: readExtras(text) };
}

/**
 * Writes the record back, as one undo step. With no page holding it yet, a divider is made for it: FigCraft shows a
 * divider as a line in the pages list and never opens it, so the page shown stays shown.
 */
async function writeStamps(control: Control, pin: Pin, page: number | undefined, record: StampRecord, extras: Extras): Promise<void> {
  const data = { pluginData: { [RECORD_KEY]: recordText(record, extras) } };
  await inFile(
    control,
    pin,
    'Toghen stamps',
    page !== undefined
      ? [{ command: 'node.set', params: { ids: [page], props: data } }]
      : [
          { command: 'page.add', params: { name: RECORD_PAGE } },
          { command: 'node.set', params: { ids: [{ $step: 0 }], props: data } },
        ],
  );
}

/**
 * Every page of the pinned file with its layers, as `node.get` answers them. `node.get` lists a layer's children one
 * level down, whatever depth it is asked for (measured 23 October 2026), so the layers are read a level at a time, each
 * level in one request.
 */
async function readPages(control: Control, pin: Pin): Promise<{ pages: FcNode[]; current?: number }> {
  const [list] = (await inFile(control, pin, 'Read', [{ command: 'page.list', params: {} }])) as [Page[]];
  const pages = (await inFile(
    control,
    pin,
    'Read',
    list.map((page) => ({ command: 'node.get', params: { id: page.id } })),
  )) as FcNode[];
  await readDown(control, pin, pages);
  return { pages, current: list.find((page) => page.current)?.id };
}

/** The layers under `roots`, read a level at a time into each node's `children`. */
async function readDown(control: Control, pin: Pin, roots: FcNode[]): Promise<void> {
  for (let level = roots; level.length > 0; ) {
    const held = level.flatMap((node) => (node.children ?? []).filter((child) => (child as { childCount?: number }).childCount));
    if (held.length === 0) break;
    const read = (await inFile(
      control,
      pin,
      'Read',
      held.map((node) => ({ command: 'node.get', params: { id: node.id } })),
    )) as FcNode[];
    held.forEach((node, at) => {
      node.children = read[at].children;
    });
    level = held;
  }
}

/**
 * A library's copies in the file, by id, with what is in them. A copy is on no page, so `node.get` reaches it only by
 * its id; one that is gone (FigCraft drops a copy nothing uses) is left out.
 */
async function readCopies(control: Control, pin: Pin, ids: readonly string[]): Promise<FcNode[]> {
  const get = (some: readonly string[]) =>
    inFile(
      control,
      pin,
      'Read',
      some.map((id) => ({ command: 'node.get', params: { id: Number(id) } })),
    ) as Promise<FcNode[]>;
  // All in one request; one that is gone fails it, and then each is asked for alone.
  const copies =
    ids.length === 0
      ? []
      : (await get(ids).catch(async () => (await Promise.all(ids.map((id) => get([id]).catch(() => [])))).flat())).filter(Boolean);
  await readDown(control, pin, copies);
  return copies;
}

/**
 * The pages as `readPages` reads them, reading again only what may have changed since `before`: each page with its
 * list of top-level layers, then each top-level layer a write touched, and each that holds an instance of a component
 * in one of those; the others are kept as `before` holds them. Read whole for each set and each artboard, a file of
 * many made a run's time grow with the square of the file's size.
 */
async function refreshPages(
  control: Control,
  pin: Pin,
  before: { pages: FcNode[] },
  touched: Touched,
): Promise<{ pages: FcNode[]; current?: number }> {
  // Each layer's top-level layer; what components each top-level layer holds, and what mains its instances show.
  const topOf = new Map<number, FcNode>();
  const holds = new Map<FcNode, number[]>();
  const shows = new Map<FcNode, Set<number>>();
  for (const page of before.pages)
    for (const top of page.children ?? []) {
      const held: number[] = [];
      const shown = new Set<number>();
      const visit = (node: FcNode): void => {
        topOf.set(node.id, top);
        if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') held.push(node.id);
        if (node.type === 'INSTANCE' && node.mainComponent !== undefined) shown.add(Number(node.mainComponent));
        for (const child of node.children ?? []) visit(child);
      };
      visit(top);
      holds.set(top, held);
      shows.set(top, shown);
    }
  const stale = new Set([...touched.ids].flatMap((id) => topOf.get(id) ?? []));
  // A component that changed shows changed in each instance of it, and so in what holds that instance.
  for (let grew = true; grew; ) {
    grew = false;
    const changed = new Set([...stale].flatMap((top) => holds.get(top) ?? []));
    for (const [top, mains] of shows)
      if (!stale.has(top) && [...mains].some((id) => changed.has(id))) {
        stale.add(top);
        grew = true;
      }
  }

  const [list] = (await inFile(control, pin, 'Read', [{ command: 'page.list', params: {} }])) as [Page[]];
  const pages = (await inFile(
    control,
    pin,
    'Read',
    list.map((page) => ({ command: 'node.get', params: { id: page.id } })),
  )) as FcNode[];
  const read: FcNode[] = [];
  for (const page of pages)
    page.children = (page.children ?? []).map((top) => {
      const kept = topOf.get(top.id);
      if (kept?.id === top.id && !stale.has(kept)) return kept;
      read.push(top);
      return top;
    });
  await readDown(control, pin, [{ children: read } as FcNode]);
  return { pages, current: list.find((page) => page.current)?.id };
}

/**
 * The `figma` the handlers meet: the reads the variable and style plans make, answered from FigCraft, and nothing
 * else. FigCraft's variables and styles hold no data, so their stamps live in one record on a page (`figcraftRecord.ts`),
 * read when the run begins and answered through each listed variable and style; `flush` writes it back.
 */
async function figmaFor(control: Control, pin: Pin, say: Say, posted: Response[]) {
  let listing: FcListing | undefined;
  let view: FigmaView | undefined;
  const stamps = await readStamps(control, pin);
  const record = stamps.record;
  let guarded = false;
  let changed = false;
  const fresh = async (): Promise<FigmaView> => {
    if (!view) {
      const [variables, styles] = (await inFile(control, pin, 'Read', [
        { command: 'variable.list', params: {} },
        { command: 'style.list', params: {} },
      ])) as [Omit<FcListing, 'styles'>, FcStyle[]];
      listing = { ...variables, styles };
      view = figmaView(listing);
      const listed = [...view.variables, ...view.styles];
      // An id FigCraft gave again since the record was written names another object: its entry goes, once, at the first read.
      if (!guarded) guard(record, listed);
      guarded = true;
      attach(listed, record, () => (changed = true));
    }
    return view;
  };
  let fonts: Set<string> | undefined;
  const fontList = async (): Promise<Set<string>> => {
    if (!fonts) {
      const families = (await control.call('engine.execute', { command: 'text.fonts', params: {} })) as string[];
      const styles = (await control.call('engine.execute', {
        command: 'command.batch',
        params: { commands: families.map((family) => ({ command: 'text.fonts', params: { family } })) },
      })) as string[][];
      fonts = new Set(families.flatMap((family, i) => (styles[i] ?? []).map((style) => `${family}\u0000${style}`)));
    }
    return fonts;
  };
  // The root's shared plugin data (the lock) persists in the record, as FigCraft's root holds none.
  const shared = stamps.extras.root;
  const stored = new Map<string, unknown>();
  // The layers, as the component engine reads them (`figcraftScene.ts`), and what its reads write back.
  const writes = noWrites();
  let scene: Scene = sceneOf([], writes);
  let current: string | undefined;
  // What each library copy was imported from (`<library id>:<asset id>`), kept in the record: FigCraft gives no read for it.
  const copies = stamps.extras.copies;
  // The layers as last read, and the library copies by id: a read takes again only what a write touched since (`pin.touched`).
  let last: { pages: FcNode[]; current?: number } | undefined;
  const copyNodes = new Map<string, FcNode>();
  const loadScene = async (): Promise<Scene> => {
    const touched = pin.touched;
    pin.touched = undefined;
    const whole = !last || touched?.all === true;
    if (whole) copyNodes.clear();
    if (whole) last = await readPages(control, pin);
    else if (touched) last = await refreshPages(control, pin, last!, touched);
    const ids = [...copies.keys()];
    for (const node of await readCopies(
      control,
      pin,
      ids.filter((id) => !copyNodes.has(id)),
    ))
      copyNodes.set(String(node.id), node);
    scene = sceneOf(
      last!.pages,
      writes,
      { nodes: ids.flatMap((id) => copyNodes.get(id) ?? []), keyOf: (id) => copies.get(id) },
      whole ? undefined : scene,
    );
    current = last!.current === undefined ? undefined : String(last!.current);
    return scene;
  };
  /** A library's component or set copied into the file (once: FigCraft's import is idempotent), and noted in the record. */
  const importCopy = async (key: string): Promise<SceneNode> => {
    const [imported] = (await inFile(control, pin, 'Import library component', [
      { command: 'library.import', params: libraryAsset(key, 'component').params },
    ])) as [{ component: number }];
    const id = String(imported.component);
    if (copies.get(id) !== key) {
      copies.set(id, key);
      changed = true;
    }
    return scene.byId(id) ?? scene.adopt((await readCopies(control, pin, [id]))[0], key);
  };
  const flushScene = async (label: string): Promise<void> => {
    if (!hasWrites(writes)) return;
    const steps = writeSteps(writes);
    clearWrites(writes);
    await inFile(control, pin, label, steps);
  };
  const currentPage = (): SceneNode | undefined => (current !== undefined ? scene.byId(current) : undefined) ?? scene.pages[0];
  const stylesOf = async (type: string) => (await fresh()).styles.filter((style) => style.type === type);

  const write = async (op: Operation): Promise<string | undefined> => {
    await fresh();
    if (
      op.kind === 'DELETE_MODE' &&
      view!.collections.find((collection) => collection.id === op.collectionId)?.defaultModeId === op.modeId
    ) {
      throw new Error(`The default mode "${op.modeName}" of collection "${op.collectionName}" is never deleted.`);
    }
    const held = op.kind === 'UPDATE_STYLE' ? listing!.styles.find((style) => style.id === op.styleId) : undefined;
    const translation = translate(op, held);
    if (translation.steps.length === 0) return translation.idOf([]);
    // A deleted variable's id may be given to the next one made: its entry goes with it.
    if (op.kind === 'DELETE_VARIABLE' && record.delete(op.variableId)) changed = true;
    try {
      return translation.idOf(await inFile(control, pin, labelForOperation(op), translation.steps));
    } finally {
      view = undefined;
    }
  };

  const api = {
    variables: {
      getLocalVariableCollectionsAsync: async () => (await fresh()).collections,
      getLocalVariablesAsync: async (type?: VariableResolvedDataType) =>
        (await fresh()).variables.filter((variable) => !type || variable.resolvedType === type),
      getVariableByIdAsync: async (id: string) => {
        const held = await fresh();
        return [...held.variables, ...(held.copies?.variables ?? [])].find((variable) => variable.id === id) ?? null;
      },
      getVariableCollectionByIdAsync: async (id: string) => {
        const held = await fresh();
        return [...held.collections, ...(held.copies?.collections ?? [])].find((collection) => collection.id === id) ?? null;
      },
      importVariableByKeyAsync: async (key: string) => {
        const [imported] = (await inFile(control, pin, 'Import library variable', [
          { command: 'library.importVariable', params: libraryAsset(key, 'variable').params },
        ])) as [{ variable: string }];
        view = undefined;
        const variable = (await fresh()).copies?.variables.find((candidate) => candidate.id === imported.variable);
        if (!variable) throw new Error(`Variable with key "${key}" not found`);
        return variable;
      },
    },
    getStyleByIdAsync: async (id: string) => {
      const held = await fresh();
      return [...held.styles, ...(held.copies?.styles ?? [])].find((style) => style.id === id) ?? null;
    },
    // FigCraft copies a library's style in only as it applies it: a style not yet copied is answered from the library's
    // listing with the copy's id it will have, and the writer applies it with `library.applyStyle` (figcraftApply.ts).
    importStyleByKeyAsync: async (key: string) => {
      const held = (await fresh()).copies?.styles.find((style) => style.id === key);
      if (held) return held;
      const { library, asset } = libraryAsset(key, 'style');
      const [list] = (await inFile(control, pin, 'Read', [{ command: 'library.list', params: { assets: true } }])) as [
        { libraries: FcLibrary[] },
      ];
      const listed = list.libraries.find((candidate) => candidate.id === library)?.styles?.find((style) => style.id === asset);
      if (!listed) throw new Error(`Style with key "${key}" not found`);
      return { id: key, key, name: listed.name, type: listed.type.toUpperCase(), remote: true };
    },
    importComponentByKeyAsync: async (key: string) => {
      const node = await importCopy(key);
      if (node.type !== 'COMPONENT') throw new Error(`Component with key "${key}" not found`);
      return node;
    },
    importComponentSetByKeyAsync: async (key: string) => {
      const node = await importCopy(key);
      if (node.type !== 'COMPONENT_SET') throw new Error(`Component set with key "${key}" not found`);
      return node;
    },
    getNodeByIdAsync: async (id: string) => scene.byId(id) ?? null,
    setCurrentPageAsync: async () => {},
    loadAllPagesAsync: async () => {},
    get currentPage() {
      return currentPage();
    },
    getLocalTextStylesAsync: () => stylesOf('TEXT'),
    getLocalEffectStylesAsync: () => stylesOf('EFFECT'),
    getLocalPaintStylesAsync: () => stylesOf('PAINT'),
    listAvailableFontsAsync: async () =>
      [...(await fontList())].map((key) => {
        const [family, style] = key.split('\u0000');
        return { fontName: { family, style } };
      }),
    loadFontAsync: async (font: FontName) => {
      if (!(await fontList()).has(`${font.family}\u0000${font.style}`))
        throw new Error(`FigCraft does not list ${font.family} ${font.style}`);
    },
    root: {
      get children() {
        return scene.pages;
      },
      getSharedPluginData: (namespace: string, key: string) => shared.get(`${namespace}/${key}`) ?? '',
      setSharedPluginData: (namespace: string, key: string, value: string) => {
        const at = `${namespace}/${key}`;
        if ((shared.get(at) ?? '') === value) return;
        if (value === '') shared.delete(at);
        else shared.set(at, value);
        changed = true;
      },
      getSharedPluginDataKeys: (namespace: string) =>
        [...shared.keys()].filter((key) => key.startsWith(`${namespace}/`)).map((key) => key.slice(namespace.length + 1)),
    },
    clientStorage: {
      getAsync: async (key: string) => stored.get(key),
      setAsync: async (key: string, value: unknown) => void stored.set(key, value),
      deleteAsync: async (key: string) => void stored.delete(key),
    },
    ui: { postMessage: (message: Response) => void posted.push(message) },
    notify: (message: string) => say.stderr(`${message}\n`),
  };
  // A read the plans do not make here is a FigCraft target that is incomplete, said as such rather than as a TypeError.
  const figma = new Proxy(api, {
    get: (target, property) => {
      if (property in target) return target[property as keyof typeof target];
      throw new Error(`The FigCraft target does not offer figma.${String(property)}.`);
    },
  });
  /** Writes the record back when the run stamped anything: never in a dry run, which writes nothing. */
  const flush = async (): Promise<void> => {
    if (changed) {
      await writeStamps(control, pin, stamps.page, record, stamps.extras);
      // A first write made the page: the next flush writes onto it.
      if (stamps.page === undefined) stamps.page = (await readStamps(control, pin)).page;
    }
    changed = false;
  };
  return { figma, write, flush, loadScene, flushScene };
}

/** A bridge to one pinned file: the plugin's handlers, run here, reading and writing that file. */
export type FigcraftBridge = Bridge & {
  pin: Pin;
  control: Control;
  version?: string;
  /** A headless session's target is saved by the run once it has completed. */
  save?(): Promise<string>;
  /** Writes the record (stamps, the lock) now rather than at close: before the file is saved by the run. */
  flush(): Promise<void>;
};

/**
 * A bridge to a file open in FigCraft, at a control port, or to a file run headless: the plugin's handlers, run here,
 * reading and writing through the control socket or the session. It answers the commands the command line sends, as
 * the plugin would. A headless bridge also saves its file (`save`), which the run asks for once it has completed.
 */
export async function openFigcraft(at: number | { file: string }, say: Say): Promise<FigcraftBridge> {
  const control = typeof at === 'number' ? await connect(at) : await headless(at.file);
  try {
    return await bridgeOn(control, await pinShownFile(control), say, true);
  } catch (error) {
    control.close();
    throw error;
  }
}

/**
 * A bridge to the pinned file over a connection it may share with another (a library run holds two files). Each
 * request makes its own `figma` and writers the global ones before the handler runs, so two bridges take turns.
 * `owns` says whether closing the bridge closes the connection.
 */
export async function bridgeOn(control: Control, pin: Pin, say: Say, owns: boolean): Promise<FigcraftBridge> {
  const posted: Response[] = [];
  const target = await figmaFor(control, pin, say, posted);
  const { figma, write, flush, loadScene, flushScene } = target;
  const writer = figcraftWriter({
    batch: (label, steps) => inFile(control, pin, label, steps),
    scene: loadScene,
    flush: flushScene,
  });
  const global = globalThis as { figma?: unknown };
  const activate = (): void => {
    global.figma = figma;
    writeOperationsWith(write);
    writeComponentsWith(writer);
    pinLibraryModes(true);
  };
  activate();

  const save = control.save;
  return {
    port: 0,
    pin,
    control,
    ...(control.version !== undefined ? { version: control.version } : {}),
    // The stamps go in first, so the file saved holds them; the file is shown first, since a session saves the one it shows.
    ...(owns && save
      ? {
          save: async () => {
            await flush();
            await inFile(control, pin, 'Read', [{ command: 'doc.list', params: {} }]);
            return save();
          },
        }
      : {}),
    paired: Promise.resolve(),
    flush,
    async request(command: Command, answers: Response['type'][], onOther?: (response: Response) => void): Promise<Response> {
      posted.length = 0;
      activate();
      const handler = (handlers as unknown as Record<string, Handler>)[command.type];
      try {
        if (!handler) throw new Error(`Unknown command: ${command.type}`);
        // A component command reads the layers as they are now, and what its reads wrote back goes to FigCraft after it.
        const layers = COMPONENT_COMMANDS.has(command.type);
        if (layers) await loadScene();
        await handler(command.payload);
        if (layers) await flushScene(`Toghen: ${command.type === 'FINISH_COMPONENTS' ? 'restack' : 'stamps'}`);
      } catch (error) {
        posted.push({ type: 'ERROR', payload: { message: (error as Error).message, code: 'FIGMA_API_ERROR', commandType: command.type } });
      }
      for (const response of posted.splice(0)) {
        if (answers.includes(response.type) || response.type === 'ERROR') return response;
        onOther?.(response);
      }
      throw new Error(`${command.type}: nothing answered`);
    },
    async close(): Promise<void> {
      // Written once, at the end, and when a run stops partway, so the stamps of what it did write are kept.
      try {
        await flush();
      } catch (error) {
        say.stderr(
          `The stamps were not written into FigCraft: ${(error as Error).message}. The next run adopts what this one wrote by name.\n`,
        );
      }
      if (global.figma === figma) {
        writeOperationsWith(undefined);
        writeComponentsWith(undefined);
        pinLibraryModes(false);
        delete global.figma;
      }
      if (owns) control.close();
    },
  };
}
