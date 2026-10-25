/**
 * A run against a Figma file, through the plugin: `variables`, `components` and `sync`.
 *
 * The same steps in the same order, whichever of the three asked (specs.md, *The command line*, *A run*):
 * read the files from disk, pair with the plugin, sync the variables and the styles, run each component file.
 * The command line is a courier: a component file travels as its text and its name, and the plugin reads,
 * validates and builds it (`main/components/file.ts`), so a problem with a file is the plugin's to report, with
 * the file name and line. A dry run goes through every step and writes nothing, giving each component run the
 * names the earlier plans would have created, so a name a run would make resolves where an unmade one would stop it.
 * With a library, two plugins pair: the steps run in the library file, and the library's keys go to the target file's
 * lock (`copyKeys`).
 */

import { resolve } from 'node:path';
import { load, Resolver, type ResolverDocument } from '@toghen/lib';
import { namesOfFiles } from '../main/components/file.js';
import { declaredLibraries } from '../main/components/resolve.js';
import { orderFiles } from '../shared/components/order.js';
import { inputsFromDocument } from '../shared/inputs.js';
import type { Pending, RunOptions } from '../shared/components/steps.js';
import type { Operation, SkipCause } from '../shared/operations.js';
import { pendingNames } from '../shared/pendingNames.js';
import type { Command, LockedLibrary, Overrides, PlanPayload, Response } from '../shared/protocol.js';
import { PORT, newCode, pairing, serve, type Bridge } from './bridge.js';
import { bridgeOn, closeTab, openFigcraft, pinPath, type FigcraftBridge } from './figcraft.js';
import { counted, describeTarget, enable, libraryName, lockedFrom, publish } from './figcraftLibrary.js';

export interface Io {
  /** Where relative paths are resolved: the directory the person ran the command from. */
  cwd: string;
  readFile(path: string): string;
  stdout(text: string): void;
  stderr(text: string): void;
}

/** What a run needs beyond reading and printing: where the pairing code is kept, and, for tests, the port and how long to wait for a plugin paired earlier. */
export interface RunIo extends Io {
  /** Where the pairing code is kept between runs. */
  pairingFile: string;
  /** Tests only: the port to listen on. The plugin's manifest names 3055, which is the only port it may reach. */
  port?: number;
  /** How long to wait for a plugin paired in an earlier run to reconnect before asking for a new code. */
  pairedWaitMs?: number;
}

/** How the entry is loaded: `--name` and `--overrides`, as the person typed them. */
export interface LoadArguments {
  /** Token files only: the collection's name. */
  name?: string;
  /** The path of a JSON object: a `$ref` as written → the location to read instead. */
  overrides?: string;
}

export interface RunArguments extends LoadArguments {
  /** What to sync, when the run syncs variables and styles: a resolver document, one token file, or several in order. */
  entry?: string | string[];
  /** A resolver document that is only loaded into the plugin (`components --resolver`): the files take their axes from it, and nothing is synced. */
  designResolver?: string;
  files: string[];
  /** A resolver document whose resolved tokens are the data of the artboard files among `files`. */
  input?: string;
  collection?: string;
  page?: string;
  dryRun: boolean;
  allowBreaking: boolean;
  /** Write the document's value over a mode, or a component's field, edited in Figma. */
  overwriteDrift?: boolean;
  /** List every skip, the quiet ones too, and every patch of a component set with its fields. */
  verbose?: boolean;
  /** Run into the file FigCraft shows, through its control socket on this port, instead of through the plugin. */
  figcraft?: number;
  /** Run into this `.figcraft` file headless, with `figcraft-cli mcp` and no app, and save it once the run has completed. */
  figcraftFile?: string;
  /**
   * The library's name, as Figma names it: pair a second plugin, in the library file, build there, and copy the
   * library's keys into the target file's lock. With no entry and no files (`lock <name>`), only the copy.
   */
  library?: string;
  /**
   * The libraries the files may take names from (`RunOptions.libraries`): their names as the lock holds them, in Figma;
   * their `.figcraft` files, in FigCraft, which the run enables and refreshes in the lock first.
   */
  uses?: string[];
}

/** What the command line loaded: the bundle the core made, and the `LOAD_DOCUMENT` that has the plugin make it again. */
export interface Source {
  /** `load`'s self-contained document. */
  document: ResolverDocument;
  /**
   * The payload to send: every file the load read, by its absolute path, with the entry, the name and the map. The
   * plugin runs the same `load` over them, so its screen shows the composition and the collisions it found, and a
   * relative `$ref` resolves there as it did here.
   */
  load: Omit<Extract<Command, { type: 'LOAD_DOCUMENT' }>['payload'], 'dryRun'>;
}

/** The label of an entry in a message: its paths as typed, in order. */
export const entryLabel = (entry: string | string[]): string => (typeof entry === 'string' ? entry : entry.join(', '));

/** Loads the entry, reading only what its references reach, and keeps each file read for the plugin. */
export async function readSource(entry: string | string[], io: Io, { name, overrides: mapFile }: LoadArguments = {}): Promise<Source> {
  const at = (path: string): string => resolve(io.cwd, path);
  const absolute = typeof entry === 'string' ? at(entry) : entry.map(at);
  let overrides: Overrides | undefined;
  if (mapFile !== undefined) {
    let map: unknown;
    try {
      map = JSON.parse(io.readFile(at(mapFile)));
    } catch (error) {
      throw new Error(`--overrides ${mapFile} cannot be read as JSON: ${(error as Error).message}`);
    }
    if (map === null || typeof map !== 'object' || Array.isArray(map)) {
      throw new Error(`--overrides ${mapFile} must hold one JSON object: a $ref as written → the location to read instead`);
    }
    overrides = map as Overrides;
  }
  const read = new Map<string, string>();
  const { document } = await load(absolute, {
    read: async (location) => {
      const text = io.readFile(location);
      read.set(location, text);
      return text;
    },
    ...(name !== undefined ? { name } : {}),
    ...(overrides !== undefined ? { overrides } : {}),
  });
  return {
    document,
    load: {
      files: [...read].map(([path, text]) => ({ path, text })),
      entry: absolute,
      ...(name !== undefined ? { name } : {}),
      ...(overrides !== undefined ? { overrides } : {}),
    },
  };
}

/** The data of the artboard files: the `--input` document, bundled with its source files, and resolved at its defaults. */
export async function readInputs(file: string, io: Io): Promise<Record<string, unknown>> {
  const { document } = await load(resolve(io.cwd, file), { read: async (location) => io.readFile(location) });
  return inputsFromDocument(document);
}

/** An artboard file by its name. */
const isArtboard = (file: string): boolean => /\.artboard\.kdl$/.test(file);

/** A component file as it travels: its text, and its name as the person typed it, for messages. */
interface ComponentText {
  fileName: string;
  text: string;
}

const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** A skip's cause in a summary's words. */
const CAUSE_WORDS: Record<SkipCause, string> = {
  unchanged: 'unchanged',
  drifted: 'drifted',
  copy: 'copies',
  'unsupported-type': 'unsupported type',
  'refused-routing': 'refused',
  'closed-collection': 'in a closed collection',
  'type-conflict': 'type conflict',
  'cannot-write': 'cannot be written',
  'cannot-build': 'cannot be built',
  'no-font': 'no font',
  'font-not-loaded': 'font not loaded',
};

/** How many skips of one cause are listed before the rest are only counted. */
const LISTED = 10;

/** What a plan says it would do, in the counts the plugin's own surface shows, its skips by cause, and each warning it raised. */
function describePlan(label: string, plan: PlanPayload, io: Io, verbose: boolean): void {
  const s = plan.summary ?? {};
  // The most frequent cause first; the drifted count is among them, so it is not said again beside them (R14).
  const causes = Object.entries(s.skipsByCause ?? {}).sort(([, a], [, b]) => b - a) as [SkipCause, number][];
  const byCause = causes.length > 0 ? ` (${causes.map(([cause, n]) => `${n} ${CAUSE_WORDS[cause]}`).join(' · ')})` : '';
  const parts = [`${s.creates ?? 0} creates`, `${s.updates ?? 0} updates`, `${s.skips ?? 0} skips${byCause}`];
  if (s.modes) parts.push(`${s.modes} modes`);
  if (s.scopes) parts.push(`${s.scopes} scopes`);
  if (s.drifted && s.skipsByCause === undefined) parts.push(`${s.drifted} drifted`);
  if (s.warnings) parts.push(`${s.warnings} warnings`);
  if (s.breaking) parts.push(`${s.breaking} breaking`);
  io.stdout(`${label} plan: ${parts.join(' · ')}\n`);
  describeRows(plan.operations, io);
  describeSkips(plan.operations, io, verbose);
}

/**
 * The skips `describeRows` leaves: each problem cause's rows, ten of them and then how many more (R12: the counts above
 * are whole, only the list is cut). `unchanged` is quiet: counted, and listed only with `--verbose`, which lists every row.
 */
function describeSkips(operations: Operation[], io: Io, verbose: boolean): void {
  const groups = new Map<SkipCause, string[]>();
  for (const operation of operations) {
    if (operation.kind !== 'SKIP' || !operation.cause || operation.reported || operation.cause === 'drifted') continue;
    if (operation.cause === 'unchanged' && !verbose) continue;
    const line = operation.cause === 'unchanged' ? `unchanged: ${operation.path}` : `skipped: ${operation.reason}`;
    groups.set(operation.cause, [...(groups.get(operation.cause) ?? []), line]);
  }
  for (const lines of groups.values()) {
    const listed = verbose ? lines : lines.slice(0, LISTED);
    for (const line of listed) io.stdout(`  ${line}\n`);
    if (listed.length < lines.length) io.stdout(`  …and ${lines.length - listed.length} more; --verbose lists them\n`);
  }
}

/** The steps that write to a member that exists: a member a real run counts as updated has at least one. */
const MEMBER_WRITES = new Set(['CREATE_LAYER', 'REPLACE_LAYER', 'MOVE_LAYER', 'PATCH_LAYER', 'SWAP_COMPONENT', 'DELETE_LAYER']);

/** The rows a person must not have to count to find: breaking steps, notes, warnings, reported skips, drift. */
function describeRows(operations: Operation[], io: Io): void {
  for (const operation of operations) {
    if (operation.kind === 'BREAKING') io.stdout(`  breaking: ${operation.message}\n`);
    else if (operation.kind === 'NOTE') io.stdout(`  note: ${operation.message}\n`);
    else if (operation.kind === 'WARNING') io.stdout(`  warning: ${operation.path ? `${operation.path} — ` : ''}${operation.message}\n`);
    else if (operation.kind === 'SKIP' && operation.reported) io.stdout(`  skipped: ${operation.reason}\n`);
    else if (operation.kind === 'SKIP' && operation.reason === 'drifted')
      io.stdout(`  drifted: ${operation.path}${operation.message ? ` — ${operation.message}` : ''}\n`);
  }
}

/** The plugins a run holds: the one in the target file, and, with `--library`, the one in the library file. */
type RoleName = 'library' | 'target';

/** Where a role's code is kept between runs: the target's in the pairing file, the library's beside it. */
const keptIn = (io: RunIo, role: RoleName): string => (role === 'target' ? io.pairingFile : `${io.pairingFile}.library`);

/**
 * Waits for the plugins. A plugin paired in an earlier run reconnects on its own with its role's kept code; for every
 * role nobody came back for, the person is told a new code, with the file it is for.
 */
async function pairUp(io: RunIo, port: number, library?: string): Promise<Partial<Record<RoleName, Bridge>> & { target: Bridge }> {
  const roles: RoleName[] = library === undefined ? ['target'] : ['library', 'target'];
  const kept = new Map(roles.map((role) => [role, pairing.read(keptIn(io, role))]));
  // A role with no kept code listens with one nobody was told, until it is given one below.
  const bridges = await serve(
    port,
    Object.fromEntries(roles.map((role) => [role, kept.get(role) ?? newCode()])) as Record<RoleName, string>,
  );
  const close = async (error: unknown): Promise<never> => {
    await bridges.target.close();
    throw error;
  };
  const paired = new Set<RoleName>();
  for (const role of roles)
    bridges[role].paired.then(
      () => paired.add(role),
      () => {},
    );

  const back = roles.filter((role) => kept.get(role) !== undefined);
  if (back.length > 0) {
    io.stdout(`Looking for the plugin${back.length === 1 ? '' : 's'} paired earlier on ws://localhost:${bridges.target.port}…\n`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.all(back.map((role) => bridges[role].paired)),
      new Promise((done) => (timer = setTimeout(done, io.pairedWaitMs ?? 3000))),
    ])
      .finally(() => clearTimeout(timer))
      .catch(close);
  }

  const fresh = roles.filter((role) => !paired.has(role));
  if (fresh.length > 0) {
    const codes = new Map<RoleName, string>();
    for (const role of fresh) {
      // A kept code nobody came back with is replaced, so a plugin still open with it is refused from now on.
      const code = newCode();
      bridges[role].renew(code);
      pairing.write(keptIn(io, role), code);
      codes.set(role, code);
    }
    if (library === undefined) {
      io.stdout(
        `Pairing code: ${codes.get('target')}\nOpen the Toghen plugin in the target file, type the code into the Source card at the foot of its Load pane, and press Connect.\n`,
      );
    } else {
      const said = fresh
        .map((role) =>
          role === 'library'
            ? `in the library file "${library}", enter ${codes.get(role)}`
            : `in the target file, enter ${codes.get(role)}`,
        )
        .join('; ');
      io.stdout(
        `${said[0].toUpperCase()}${said.slice(1)}.\nOpen the Toghen plugin in ${fresh.length === 1 ? 'that file' : 'each file'}, type the code into the Source card at the foot of its Load pane, and press Connect.\n`,
      );
    }
    io.stdout(`Waiting for the plugin${fresh.length === 1 ? '' : 's'} on ws://localhost:${bridges.target.port}…\n`);
    await Promise.all(fresh.map((role) => bridges[role].paired)).catch(close);
  }
  io.stdout(roles.length === 1 ? 'The plugin is paired.\n' : 'Both plugins are paired.\n');
  return bridges;
}

/** Runs the steps. Returns the exit code: 0 when every step succeeded, 1 when a check failed or Figma refused a step. */
export async function run(args: RunArguments, io: RunIo): Promise<number> {
  // 1. Read everything from disk. Nothing is read for meaning here but the order the component files go in: the plugin does the rest.
  const entry = args.entry ?? args.designResolver;
  let source: Source | undefined;
  if (entry !== undefined) {
    try {
      source = await readSource(entry, io, args);
    } catch (error) {
      io.stderr(`${entryLabel(entry)}: ${(error as Error).message}\n`);
      return 1;
    }
  }
  let inputs: Record<string, unknown> | undefined;
  if (args.input !== undefined) {
    try {
      inputs = await readInputs(args.input, io);
    } catch (error) {
      io.stderr(`${args.input}: ${(error as Error).message}\n`);
      return 1;
    }
  }
  const components: ComponentText[] = [];
  let unreadable = false;
  for (const file of args.files) {
    try {
      components.push({ fileName: file, text: io.readFile(resolve(io.cwd, file)) });
    } catch (error) {
      io.stderr(`${file} cannot be read: ${(error as Error).message}\n`);
      unreadable = true;
    }
  }
  if (unreadable) return 1;

  // 2. Wait for the plugin, or both with a library, or reach FigCraft, which needs no plugin.
  let bridge: Bridge;
  let target: Bridge | undefined;
  /** A headless FigCraft file's save, made only once the run has completed. */
  let save: (() => Promise<string>) | undefined;
  /** With FigCraft and a library: the target's bridge, and the library's when the run builds there. */
  let figcraft: { target: FigcraftBridge; library?: FigcraftBridge & { made?: true }; path: string } | undefined;
  try {
    if (args.figcraftFile !== undefined || args.figcraft !== undefined) {
      const opened =
        args.figcraftFile !== undefined
          ? await openFigcraft({ file: resolve(io.cwd, args.figcraftFile) }, io)
          : await openFigcraft(args.figcraft!, io);
      io.stdout(
        args.figcraftFile !== undefined
          ? `Writing into ${args.figcraftFile} headless, with figcraft-cli ${opened.version}.\n`
          : `Writing into "${opened.pin.tab.name}" in FigCraft on port ${args.figcraft}.\n`,
      );
      bridge = opened;
      save = opened.save;
      if (args.library !== undefined) {
        const path = resolve(io.cwd, args.library);
        figcraft = { target: opened, path };
        if (opened.pin.tab.path === path)
          throw new Error(`The target is the library ${args.library} itself: show, or name, the file that uses it.`);
        // `lock` builds nothing, so it needs only the target; a build happens in the library file.
        if (args.entry !== undefined || args.files.length > 0) {
          const pin = await pinPath(opened.control, path);
          const library = Object.assign(await bridgeOn(opened.control, pin, io, false), pin.made ? { made: true as const } : {});
          figcraft.library = library;
          bridge = library;
          io.stdout(
            pin.made
              ? `Building the library ${args.library}, a new file.\n`
              : `Building the library ${args.library}, in "${pin.tab.name}".\n`,
          );
        }
      }
    } else {
      const paired = await pairUp(io, io.port ?? PORT, args.library);
      // With a library, everything is built in the library file, where components are made; the target gets the lock.
      bridge = paired.library ?? paired.target;
      target = paired.target;
    }
  } catch (error) {
    io.stderr(`${(error as Error).message}\n`);
    await figcraft?.target.close();
    return 1;
  }

  const by = args.entry !== undefined || args.files.length > 0 ? 'build' : 'command line';
  try {
    // FigCraft: each library the files use is enabled in the target, and its entry in the lock read again from the
    // target's listing of it, before anything is resolved. A dry run does neither, and resolves through the lock as it is.
    if (args.uses && (args.figcraft !== undefined || args.figcraftFile !== undefined) && !args.dryRun) {
      const target = bridge as FigcraftBridge;
      for (const use of args.uses) {
        const path = resolve(io.cwd, use);
        const entry = lockedFrom(await enable(target.control, target.pin, path, false, io), path, 'command line');
        const written = await target.request({ type: 'LOCK_WRITE', payload: { library: libraryName(path), entry } }, ['LOCK']);
        if (written.type === 'ERROR') throw new Error(`The lock in "${target.pin.tab.name}" was not written: ${written.payload.message}`);
        io.stdout(`Using ${use}: the lock in "${target.pin.tab.name}" holds "${libraryName(path)}", ${counted(entry)}.\n`);
      }
    }
    let built = await runSteps(args, source, components, inputs, bridge, io);
    // FigCraft: the library is published and saved, then enabled in the target, its updates accepted and the lock
    // written, all before the target is saved.
    if (figcraft && args.library !== undefined) {
      if (built !== 0)
        io.stderr(`The library was not published and the lock in the target was not written: the build in the library did not complete.\n`);
      else built = await finishFigcraftLibrary(args.library, figcraft, by, args.dryRun, io);
    }
    // A headless file is saved whole or not at all: a run that stopped partway, or wrote nothing, leaves it as it was.
    if (save && !args.dryRun) {
      if (built === 0) io.stdout(`Saved ${await save()}.\n`);
      else io.stderr(`${args.figcraftFile} was not saved: the run did not complete.\n`);
    }
    if (figcraft || args.library === undefined || target === undefined) return built;
    if (built !== 0) {
      io.stderr(`The lock in the target file was not written: the build in the library file did not complete.\n`);
      return built;
    }
    return await copyKeys(args.library, bridge, target, by, args.dryRun, io);
  } catch (error) {
    io.stderr(`${(error as Error).message}\n`);
    return 1;
  } finally {
    if (figcraft) {
      if (figcraft.library) {
        await figcraft.library.close();
        // A file the run made and did not save is not left behind as an empty tab.
        if (figcraft.library.made && figcraft.library.pin.tab.path === null)
          await closeTab(figcraft.target.control, figcraft.library.pin).catch(() => {});
      }
      await figcraft.target.close();
    } else await bridge.close();
  }
}

/**
 * The end of a FigCraft library run: the library published and saved, then, in the target, enabled (or pointed at its
 * new path after a move), that library's updates accepted, and the lock written from the target's own listing of it.
 * `lock` does the target's half alone. A dry run does none of it and says what is waiting.
 */
async function finishFigcraftLibrary(
  given: string,
  figcraft: { target: FigcraftBridge; library?: FigcraftBridge; path: string },
  by: LockedLibrary['by'],
  dryRun: boolean,
  io: Io,
): Promise<number> {
  const { target, library, path } = figcraft;
  const control = target.control;
  if (dryRun) {
    await describeTarget(control, target.pin, path, io);
    io.stdout('Dry run: the library was not published or saved, and the lock in the target was not written.\n');
    return 0;
  }
  if (library) {
    // The library's own record goes in first, so the file saved holds it.
    await library.flush();
    await publish(control, library.pin, path, io);
  }
  const listed = await enable(control, target.pin, path, true, io);
  const name = libraryName(path);
  const entry = lockedFrom(listed, path, by);
  const written = await target.request({ type: 'LOCK_WRITE', payload: { library: name, entry } }, ['LOCK']);
  if (written.type === 'ERROR') {
    io.stderr(`The lock in "${target.pin.tab.name}" was not written: ${written.payload.message}\n`);
    return 1;
  }
  io.stdout(`The lock in "${target.pin.tab.name}" holds "${name}" (${given}), written by the ${by}: ${counted(entry)}.\n`);
  return 0;
}

async function runSteps(
  args: RunArguments,
  source: Source | undefined,
  components: ComponentText[],
  inputs: Record<string, unknown> | undefined,
  bridge: Bridge,
  io: RunIo,
): Promise<number> {
  /** A response of the expected type, or an error that stops the run with what the plugin said. */
  const ask = async (command: Command, answer: Response['type']): Promise<Response> => {
    const response = await bridge.request(command, [answer]);
    if (response.type === 'ERROR') throw new Error(`${command.type}: ${response.payload.message}`);
    return response;
  };

  // 3. The design system, when there is one: the plugin answers a file's `(modifier)` axes and `tokens=` groups from it.
  // The files themselves travel, not the bundle: the plugin loads them as the screen's own pick is loaded, so the
  // composition it carries is its own, and the load's collisions and the map's unused keys come back as rows, printed here.
  if (source) {
    const loaded = await ask(
      { type: 'LOAD_DOCUMENT', payload: { ...source.load, ...(args.dryRun ? { dryRun: true } : {}) } },
      'DOCUMENT_LOADED',
    );
    if (loaded.type === 'DOCUMENT_LOADED') describeRows(loaded.payload.report?.operations ?? [], io);
  }

  // The plugin reads every file before anything is written: a design half applied is worse than none. A sync also has the
  // names each file writes checked against the design system it is about to build.
  if (components.length > 0) {
    const checked = await bridge.request(
      {
        type: 'CHECK_COMPONENTS',
        payload: {
          files: components,
          ...(args.entry !== undefined ? { names: true } : {}),
          ...(inputs ? { inputs } : {}),
          dryRun: args.dryRun,
          ...(args.allowBreaking ? { allowBreaking: true } : {}),
        },
      },
      ['COMPONENTS_CHECKED'],
    );
    if (checked.type === 'ERROR') {
      for (const problem of checked.payload.problems ?? [checked.payload.message]) io.stderr(`${problem}\n`);
      return 1;
    }
    // Members outside any set are breaking: a dry run lists them, a run with --allow-breaking removes them at its end.
    if (checked.type === 'COMPONENTS_CHECKED') for (const line of checked.payload.strays ?? []) io.stdout(`breaking: ${line}\n`);
  }

  // The component files go in dependency order, in a real run and a dry run alike (`shared/components/order.ts`):
  // read here, against the design system, only for what each defines and names. A name a declared library holds is not a file's.
  let ordered = components;
  if (components.length > 1) {
    let design: Resolver | null = null;
    try {
      design = source ? new Resolver(source.document) : null;
    } catch {
      // A document the core refuses was the load's to say.
    }
    let fromLibraries = new Set<string>();
    if (args.uses) {
      const lock = await ask({ type: 'GET_LOCK', payload: {} }, 'LOCK');
      if (lock.type === 'LOCK') {
        const declared = args.uses.map((use) => (args.figcraft !== undefined || args.figcraftFile !== undefined ? libraryName(use) : use));
        fromLibraries = new Set(
          declaredLibraries(declared, lock.payload.overrides).flatMap((library) =>
            Object.keys(lock.payload.libraries[library]?.components ?? {}),
          ),
        );
      }
    }
    try {
      ordered = orderFiles(namesOfFiles(components, inputs, design), fromLibraries);
    } catch (error) {
      io.stderr(`${(error as Error).message}; nothing was written\n`);
      return 1;
    }
  }

  const planned: Operation[] = [];
  if (source && args.entry !== undefined) {
    // 4. The variables.
    // Both plans are given the same collection name: the style plan binds a style's members to the variables the variable plan put there.
    const collection = args.collection !== undefined ? { collectionName: args.collection } : {};
    const steps: { label: string; plan: Command; execute: Command }[] = [
      {
        label: 'Variable',
        plan: {
          type: 'PLAN_VARIABLE_SYNC',
          payload: {
            ...collection,
            ...(args.allowBreaking ? { allowBreaking: true } : {}),
            ...(args.overwriteDrift ? { overwriteDrift: true } : {}),
          },
        },
        execute: { type: 'EXECUTE_VARIABLE_SYNC', payload: {} },
      },
      // 5. The styles, since a component's text names a text style.
      {
        label: 'Style',
        plan: { type: 'PLAN_STYLE_SYNC', payload: { ...collection, ...(args.overwriteDrift ? { overwriteDrift: true } : {}) } },
        execute: { type: 'EXECUTE_STYLE_SYNC', payload: {} },
      },
    ];
    for (const step of steps) {
      const response = await ask(step.plan, 'PLAN_READY');
      if (response.type !== 'PLAN_READY') continue;
      describePlan(step.label, response.payload, io, args.verbose === true);
      planned.push(...response.payload.operations);
      // A plan that stopped (the base collection built by an earlier sync, a modifier with no default) stops the
      // whole run, a dry run included: a style or a component built against variables that were not synced would bind the wrong things.
      const stop = response.payload.operations.find((operation) => operation.kind === 'WARNING' && operation.stops);
      if (stop) {
        io.stderr(`${step.label} sync stopped, so nothing was written and no style or component was run.\n`);
        return 1;
      }
      // Breaking steps are advisory in a dry run and a gate in a real one, as a component's are: nothing is written before someone who read them says so.
      const breaking = response.payload.operations.filter((operation) => operation.kind === 'BREAKING').length;
      if (breaking > 0 && !args.dryRun && !args.allowBreaking) {
        io.stderr(
          `${step.label} sync will not run: ${plural(breaking, 'step')} would lose something in Figma, and nothing was written; pass --allow-breaking to take ${breaking === 1 ? 'it' : 'them'}\n`,
        );
        return 1;
      }
      if (args.dryRun) continue;
      const done = await ask(step.execute, 'OPERATION_COMPLETE');
      if (done.type !== 'OPERATION_COMPLETE') continue;
      const { applied, skipped, failed, cancelled } = done.payload;
      io.stdout(
        `${step.label} sync: ${applied} applied · ${skipped} skipped${failed ? ` · ${failed} failed` : ''}${cancelled ? ` · ${cancelled} cancelled` : ''}\n`,
      );
      for (const result of done.payload.results) {
        if (result.status === 'skipped' && result.operation.kind === 'SKIP' && result.operation.reported)
          io.stdout(`  skipped: ${result.reason}\n`);
      }
      if (failed > 0) {
        for (const result of done.payload.results)
          if (result.status === 'failed') io.stderr(`  failed: ${result.reason ?? 'no reason given'}\n`);
        io.stderr(`${step.label} sync did not complete, so no component was run.\n`);
        return 1;
      }
    }
  }

  // A dry run writes nothing, so what the plans would have made is told to each component run.
  let pending: Pending | undefined;
  if (args.dryRun && args.entry !== undefined) {
    const collections = await ask({ type: 'GET_FIGMA_COLLECTIONS', payload: {} }, 'FIGMA_COLLECTIONS');
    if (collections.type === 'FIGMA_COLLECTIONS') pending = pendingNames(planned, collections.payload);
  }

  // 6. Each component file, one at a time. A dry run tells each the sets the files before it would create (ruling 7a).
  let exit = 0;
  const created: string[] = [];
  for (const { fileName, text } of ordered) {
    if (created.length > 0) pending = { ...(pending ?? { variables: [], textStyles: [] }), components: [...created] };
    const options: RunOptions = {
      ...(args.page !== undefined ? { page: args.page } : {}),
      ...(args.uses
        ? { libraries: args.uses.map((use) => (args.figcraft !== undefined || args.figcraftFile !== undefined ? libraryName(use) : use)) }
        : {}),
      dryRun: args.dryRun,
      ...(args.allowBreaking ? { allowBreaking: true } : {}),
      ...(args.overwriteDrift ? { overwriteDrift: true } : {}),
      ...(pending ? { pending } : {}),
    };
    const response = await bridge.request(
      { type: 'RUN_COMPONENT', payload: { text, fileName, options, ...(inputs && isArtboard(fileName) ? { inputs } : {}) } },
      ['COMPONENT_RUN'],
    );
    if (response.type === 'ERROR') {
      io.stderr(`${fileName}: was not ${args.dryRun ? 'planned' : 'built'}: ${response.payload.message.split('\n')[0]}\n`);
      for (const problem of response.payload.problems ?? []) io.stderr(`  - ${problem}\n`);
      if (!response.payload.problems) io.stderr(`  ${response.payload.message}\n`);
      exit = 1;
    } else if (response.type === 'COMPONENT_RUN') {
      const { component: name, report } = response.payload;
      if (report.dryRun && report.steps.some((step) => step.kind === 'CREATE_SET')) created.push(name);
      // A dry run of a set applies nothing, so what it would update is counted from its steps: the members a write step names.
      const updated =
        report.dryRun && !report.artboard
          ? `${new Set(report.steps.filter((step) => MEMBER_WRITES.has(step.kind)).map((step) => step.member)).size} would update`
          : `${report.updated.length} updated`;
      io.stdout(
        `${name}${report.dryRun ? ' (dry run)' : ''}: ${plural(report.steps.length, 'step')} · ${report.created.length} created · ${updated} · ${report.deleted.length} deleted${report.breaking.length ? ` · ${report.breaking.length} breaking` : ''}\n`,
      );
      // An artboard's plan is its layers: what is made, patched, moved or removed, one line each.
      if (report.artboard) {
        const verbs: Partial<Record<string, string>> = {
          CREATE_ARTBOARD: 'create the artboard and every layer in it',
          CREATE_LAYER: 'create',
          REPLACE_LAYER: 'replace',
          MOVE_LAYER: 'move',
          PATCH_LAYER: 'patch',
          DELETE_LAYER: 'remove',
          SWAP_COMPONENT: 'swap',
        };
        for (const step of report.steps)
          if (verbs[step.kind]) io.stdout(`  ${verbs[step.kind]}${step.address !== undefined ? ` ${step.address}` : ''}\n`);
      } else if (args.verbose) {
        // A set's patches, one line each, with the fields each writes where the reply names them.
        for (const step of report.steps) {
          if (step.kind === 'PATCH_LAYER')
            io.stdout(`  patch ${step.member} ${step.address}${step.changes?.length ? `: ${step.changes.join(', ')}` : ''}\n`);
        }
      }
      for (const step of report.steps)
        if ((step.kind === 'RENAME_AXIS' || step.kind === 'DELETE_LAYER') && step.message) io.stdout(`  ${step.message}\n`);
      for (const [what, lines] of [
        ['pending', report.pending],
        ['breaking', report.breaking],
        ['warning', report.warnings],
        ['left', report.notes],
      ] as const) {
        for (const line of lines) io.stdout(`  ${what}: ${line}\n`);
      }
    }
  }
  // The end of the run, once: the strays removed when allowed, and each page's sets and artboards stacked again.
  if (components.length > 0) {
    const finished = await bridge.request(
      { type: 'FINISH_COMPONENTS', payload: { dryRun: args.dryRun, ...(args.allowBreaking ? { allowBreaking: true } : {}) } },
      ['COMPONENTS_FINISHED'],
    );
    if (finished.type === 'ERROR') {
      io.stderr(`${finished.payload.message}\n`);
      exit = 1;
    } else if (finished.type === 'COMPONENTS_FINISHED') {
      for (const line of [...finished.payload.removed, ...finished.payload.moved]) io.stdout(`${line}\n`);
      for (const line of finished.payload.notes) io.stdout(`  note: ${line}\n`);
    }
  }
  // 7. Exit. The plugin stays open, and finds the next run by itself.
  return exit;
}

/**
 * The lock from the command line: asks the plugin in the library file for its own keys, and has the plugin in the
 * target file write them as the library's entry, whole. Every set or style not published as it is now is one line: its
 * key is in the lock, and it imports once a person publishes the library and accepts its update. A dry run writes nothing.
 */
async function copyKeys(library: string, from: Bridge, to: Bridge, by: LockedLibrary['by'], dryRun: boolean, io: Io): Promise<number> {
  const read = await from.request({ type: 'LIBRARY_KEYS', payload: {} }, ['LIBRARY_KEYS_READ']);
  if (read.type === 'ERROR') throw new Error(`LIBRARY_KEYS: ${read.payload.message}`);
  if (read.type !== 'LIBRARY_KEYS_READ') return 1;
  const keys = read.payload;
  const entry: LockedLibrary = {
    ...(keys.fileKey !== undefined ? { fileKey: keys.fileKey } : {}),
    by,
    components: Object.fromEntries(Object.entries(keys.components).map(([name, { key, set }]) => [name, { key, set }])),
    styles: Object.fromEntries(Object.entries(keys.styles).map(([path, { key, kind }]) => [path, { key, kind }])),
    variables: Object.fromEntries(Object.entries(keys.variables).map(([id, { key }]) => [id, key])),
  };
  const counts = [
    plural(Object.keys(entry.components).length, 'component'),
    plural(Object.keys(entry.styles).length, 'style'),
    plural(Object.keys(entry.variables).length, 'variable'),
  ];
  io.stdout(
    `Library "${library}": ${counts.join(' · ')} · ${entry.fileKey !== undefined ? `file key ${entry.fileKey}` : 'no file key (only a private or development plugin reads it)'}\n`,
  );

  const then = 'publish the library, then accept its update in the target file.';
  for (const [name, { status }] of Object.entries(keys.components))
    if (status !== 'CURRENT') io.stdout(`"${name}" is not published as it is now (${status}): ${then}\n`);
  for (const [path, { kind, status }] of Object.entries(keys.styles)) {
    if (status !== undefined && status !== 'CURRENT')
      io.stdout(`The ${kind.toLowerCase()} style "${path.split('.').join('/')}" is not published as it is now (${status}): ${then}\n`);
  }
  for (const line of keys.warnings ?? []) io.stdout(`warning: ${line}\n`);
  const variables = Object.values(keys.variables).filter(({ status }) => status !== 'CURRENT').length;
  if (variables > 0)
    io.stdout(
      `${plural(variables, 'variable')} ${variables === 1 ? 'is not published as it is' : 'are not published as they are'} now: ${then}\n`,
    );

  if (dryRun) {
    io.stdout('Dry run: the lock in the target file was not written.\n');
    return 0;
  }
  const written = await to.request({ type: 'LOCK_WRITE', payload: { library, entry } }, ['LOCK']);
  if (written.type === 'ERROR') {
    io.stderr(`The lock in the target file was not written: ${written.payload.message}\n`);
    return 1;
  }
  io.stdout(`The lock in the target file holds "${library}", written by the ${by}.\n`);
  return 0;
}
