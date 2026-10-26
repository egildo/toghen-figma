/**
 * `toghen-figma`: the one command.
 *
 *     toghen-figma variables <entry.json>… [--name <name>] [--overrides <map.json>] [--collection <name>] [--dry-run] [--allow-breaking] [--overwrite-drift] [--verbose] [--figcraft <port> | --figcraft-file <path.figcraft>]
 *     toghen-figma components <file>… [--resolver <entry.json>] [--name <name>] [--overrides <map.json>] [--input <document>] [--page <name>] [--dry-run] [--allow-breaking] [--overwrite-drift] [--skip-unchanged] [--verbose] [--figcraft <port> | --figcraft-file <path.figcraft>]
 *     toghen-figma sync <entry.json>… <file>… [--name <name>] [--overrides <map.json>] [--collection <name>] [--input <document>] [--page <name>] [--dry-run] [--allow-breaking] [--overwrite-drift] [--skip-unchanged] [--verbose] [--figcraft <port> | --figcraft-file <path.figcraft>]
 *     toghen-figma check <entry.json>… <file>… [--name <name>] [--overrides <map.json>] [--input <document>]
 *     toghen-figma members <entry.json>… <file>… [--name <name>] [--overrides <map.json>] [--input <document>]
 *     toghen-figma lock <library name>
 *     toghen-figma lock <library.figcraft> (--figcraft <port> | --figcraft-file <path.figcraft>) [--dry-run]
 *
 * `variables`, `components` and `sync` take `--library <name>`: two plugins pair, the run builds in the library file,
 * and the library's keys are written into the target file's lock (`run.ts`, `copyKeys`). `lock` only copies the keys.
 * With FigCraft, `--library` names the library's `.figcraft` file: the run builds there, publishes and saves it, and
 * enables it in the target, accepts its updates and writes the lock (`run.ts`, `finishFigcraftLibrary`).
 * Every `.json` argument is the entry the core's `load` takes, in order: one resolver document, one token file, or
 * several token files (the last wins). A file is a `<name>.component.kdl` (a component set) or a `<name>.artboard.kdl`
 * (a frame of instances, built from `--input`).
 * Every command runs against a Figma file through the plugin (`run.ts`), which does all the reading of a file:
 * the command line sends text. `--figcraft <port>` runs `variables`, `components` and `sync` against the file FigCraft shows instead (`figcraft.ts`),
 * and `--figcraft-file <path.figcraft>` against a file with no app, through `figcraft-cli mcp`, saving it at the end.
 * `bin.mjs` runs it; this module exports `main`.
 */

import { check } from './check.js';
import { members } from './members.js';
import { isShareLink } from './figcraftLibrary.js';
import { run, type RunIo } from './run.js';

export type { RunIo as Io } from './run.js';

const USAGE = `usage: toghen-figma variables <entry.json>… [--name <name>] [--overrides <map.json>] [--collection <name>] [--dry-run] [--allow-breaking] [--overwrite-drift] [--verbose] [--figcraft <port> | --figcraft-file <path.figcraft>] [--library <library>]
       toghen-figma components <file>… [--resolver <entry.json>] [--name <name>] [--overrides <map.json>] [--input <document>] [--page <name>] [--dry-run] [--allow-breaking] [--overwrite-drift] [--skip-unchanged] [--verbose] [--figcraft <port> | --figcraft-file <path.figcraft>] [--library <library> | --use <library>…]
       toghen-figma sync <entry.json>… <file>… [--name <name>] [--overrides <map.json>] [--collection <name>] [--input <document>] [--page <name>] [--dry-run] [--allow-breaking] [--overwrite-drift] [--skip-unchanged] [--verbose] [--figcraft <port> | --figcraft-file <path.figcraft>] [--library <library> | --use <library>…]
       toghen-figma check <entry.json>… <file>… [--name <name>] [--overrides <map.json>] [--input <document>]
       toghen-figma members <entry.json>… <file>… [--name <name>] [--overrides <map.json>] [--input <document>]
       toghen-figma lock <library name>
       toghen-figma lock <library.figcraft> (--figcraft <port> | --figcraft-file <path.figcraft>) [--dry-run]

every .json argument is the entry, in order: one resolver document, one token file, or several token files merged in order, the last winning.
--name names the collection of token files; it defaults to the name of the folder that holds them. --overrides is a JSON object that maps
a $ref as written to the location to read instead, resolved against the document that holds the $ref.
a file is a <name>.component.kdl (a component set) or a <name>.artboard.kdl (a frame of instances with their properties and slots set).
files run in dependency order, each component file after every file that defines a component it names, artboards last; files that name each other in a cycle stop the run. --input is a resolver document whose tokens, resolved at their default contexts and nested by path,
are the data an artboard file reads with (input); it is read only when an artboard file is among the files.
check reads the files against the design system as the plugin's check does, with no plugin and no Figma file, prints each problem as <file>:<line>:<column> <message>, and exits 1 when a file has an error.
members reads the files the same way and prints each one's component, members and problems as JSON, the members a build would make.
--figcraft runs into the file FigCraft shows: its variables, its styles and the component and artboard files, through the control port it was started with (figcraft --control <port>), with no plugin.
--figcraft-file runs the same into a .figcraft file with no app, through figcraft-cli mcp (0.8.0 or later; FIGCRAFT_CLI names it, else the one on the PATH),
and saves the file once the run has completed. A file that does not exist yet is made. A dry run, or a run that stops partway, saves nothing.
--library pairs two plugins, one in the library file (named as Figma names the library) and one in the target file: the run builds in the library file,
then writes the library's keys into the target file's lock. lock does only the second half. Publishing the library and accepting its update are a person's steps.
with --figcraft or --figcraft-file, --library names the library's .figcraft file: the run builds there, publishes it and saves it, then enables it in
the target (the file FigCraft shows, or the --figcraft-file), accepts that library's updates and writes the target's lock. lock does the target's half.
--use declares a library the component and artboard files may name components, styles and tokens from, through the target's lock; it may be given
more than once. In Figma it is the library's name, as the lock holds it; in FigCraft its .figcraft file, which the run enables and whose lock entry it
refreshes first (a dry run neither). Without --use, every name is found in the file, as before.
a plan prints its skips counted by cause, and lists the rows of every cause but unchanged, ten per cause and then how many more.
--verbose lists every skip, the unchanged ones too, and every patch of a component set with the fields it writes.
--skip-unchanged leaves unread each set and artboard whose stamp holds the fingerprint of what this run would write for it, and says it is unchanged.
it trusts the fingerprint: a change made by hand in such a set or artboard is not looked for. Without it, every one is read and compared, as before.
`;

/** An artboard file by its name; any other file is a component file. */
const isArtboard = (file: string): boolean => /\.artboard\.kdl$/.test(file);

/** A part of the entry: a resolver document or a token file. */
const isEntry = (file: string): boolean => /\.json$/i.test(file);

/** The flags of the load, which every command takes: they shape the entry, or `--resolver`'s. */
const LOAD = ['--name', '--overrides'];

/** Which flags each command takes. */
const FLAGS: Record<string, { value: string[]; switches: string[] }> = {
  variables: {
    value: ['--collection', '--figcraft', '--figcraft-file', '--library', ...LOAD],
    switches: ['--dry-run', '--allow-breaking', '--overwrite-drift', '--verbose'],
  },
  components: {
    value: ['--page', '--resolver', '--input', '--figcraft', '--figcraft-file', '--library', '--use', ...LOAD],
    switches: ['--dry-run', '--allow-breaking', '--overwrite-drift', '--skip-unchanged', '--verbose'],
  },
  sync: {
    value: ['--collection', '--page', '--input', '--figcraft', '--figcraft-file', '--library', '--use', ...LOAD],
    switches: ['--dry-run', '--allow-breaking', '--overwrite-drift', '--skip-unchanged', '--verbose'],
  },
  check: { value: ['--input', ...LOAD], switches: [] },
  members: { value: ['--input', ...LOAD], switches: [] },
  lock: { value: ['--figcraft', '--figcraft-file'], switches: ['--dry-run'] },
};

/** Runs the command. Returns the exit code: 0, or 1 when anything failed. */
export async function main(argv: string[], io: RunIo): Promise<number> {
  const [command, ...rest] = argv;
  if (command === undefined || !(command in FLAGS)) {
    io.stderr(`${command === undefined ? 'no command given' : `unknown command ${command}`}\n${USAGE}`);
    return 1;
  }

  const allowed = FLAGS[command];
  const positionals: string[] = [];
  const options: Record<string, string | true> = {};
  /** `--use`, which may be given more than once: a library each. */
  const uses: string[] = [];
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (allowed.switches.includes(arg)) options[arg] = true;
    else if (allowed.value.includes(arg)) {
      const value = rest[i + 1];
      if (value === undefined || value.startsWith('--')) return fail(io, `${arg} needs a value`);
      if (arg === '--use') uses.push(value);
      else options[arg] = value;
      i += 1;
    } else if (arg.startsWith('--')) return fail(io, `unknown option ${arg} for ${command}`);
    else positionals.push(arg);
  }

  const figcraftFile = typeof options['--figcraft-file'] === 'string' ? options['--figcraft-file'] : undefined;
  const inFigcraft = options['--figcraft'] !== undefined || figcraftFile !== undefined;
  if (figcraftFile !== undefined && options['--figcraft'] !== undefined)
    return fail(io, '--figcraft and --figcraft-file do not go together: one runs into the app, the other into a file with no app');
  if (figcraftFile !== undefined && !/\.figcraft$/i.test(figcraftFile))
    return fail(io, `--figcraft-file takes a .figcraft file, which the run saves; got ${figcraftFile}`);
  let figcraft: number | undefined;
  if (typeof options['--figcraft'] === 'string') {
    figcraft = Number(options['--figcraft']);
    if (!Number.isInteger(figcraft) || figcraft < 1 || figcraft > 65535)
      return fail(io, `--figcraft takes the port FigCraft's control socket listens on, a number; got ${options['--figcraft']}`);
  }
  const into = { ...(figcraft !== undefined ? { figcraft } : {}), ...(figcraftFile !== undefined ? { figcraftFile } : {}) };

  /** In FigCraft a library is its `.figcraft` file, on this machine: a team library's share link reaches a server. */
  const figcraftLibrary = (path: string, flag: string): string | undefined => {
    if (isShareLink(path))
      return `${flag} ${path} names a team library on a figcraft-server, which reaches outside this machine and is not built: name a .figcraft file`;
    if (!/\.figcraft$/i.test(path)) return `${flag} takes the library's .figcraft file with --figcraft or --figcraft-file; got ${path}`;
    return undefined;
  };

  if (command === 'lock') {
    if (positionals.length !== 1)
      return fail(
        io,
        inFigcraft
          ? "lock takes the library's .figcraft file, and nothing else"
          : "lock takes the library's name, as Figma names it, and nothing else",
      );
    const wrong = inFigcraft ? figcraftLibrary(positionals[0], 'lock') : undefined;
    if (wrong) return fail(io, wrong);
    if (!inFigcraft && options['--dry-run'] !== undefined)
      return fail(io, "lock --dry-run is FigCraft's: in Figma, lock writes nothing a dry run could hold back");
    return run({ files: [], dryRun: options['--dry-run'] === true, allowBreaking: false, library: positionals[0], ...into }, io);
  }
  const library = typeof options['--library'] === 'string' ? options['--library'] : undefined;
  if (library !== undefined && inFigcraft) {
    const wrong = figcraftLibrary(library, '--library');
    if (wrong) return fail(io, wrong);
  }
  if (uses.length > 0 && library !== undefined)
    return fail(
      io,
      '--use and --library do not go together: --library runs the files into the library, --use runs them into a file that uses libraries',
    );
  for (const use of inFigcraft ? uses : []) {
    const wrong = figcraftLibrary(use, '--use');
    if (wrong) return fail(io, wrong);
  }

  const entries = positionals.filter(isEntry);
  const files = positionals.filter((file) => !isEntry(file));
  if (command === 'components' && entries.length > 0)
    return fail(io, `components takes the design system with --resolver; ${entries.join(', ')} is not a component file`);
  if (command !== 'components' && entries.length === 0) return fail(io, 'no entry given: a resolver document or token files (.json)');
  if ((command === 'check' || command === 'members') && files.length === 0) return fail(io, 'no component file given');
  if (command === 'variables' && files.length > 0)
    return fail(io, 'variables takes the entry and nothing else; sync runs component files too');
  if (command !== 'variables' && files.length === 0)
    return fail(io, command === 'sync' ? 'no component file given; variables syncs the tokens alone' : 'no component file given');
  const entry = entries.length === 1 ? entries[0] : entries.length > 1 ? entries : undefined;

  const input = typeof options['--input'] === 'string' ? options['--input'] : undefined;
  if (input !== undefined && !files.some(isArtboard))
    return fail(io, '--input is read only when an artboard file (<name>.artboard.kdl) is among the files; none is');

  const loading = {
    ...(typeof options['--name'] === 'string' ? { name: options['--name'] } : {}),
    ...(typeof options['--overrides'] === 'string' ? { overrides: options['--overrides'] } : {}),
  };
  // A component file is run before an artboard file: the artboard makes instances of what the components made.
  const ordered = [...files.filter((file) => !isArtboard(file)), ...files.filter(isArtboard)];

  if (command === 'members') return members({ entry: entry!, ...loading, files: ordered, ...(input !== undefined ? { input } : {}) }, io);
  if (command === 'check') return check({ entry: entry!, ...loading, files: ordered, ...(input !== undefined ? { input } : {}) }, io);

  return run(
    {
      ...(entry !== undefined ? { entry } : {}),
      ...loading,
      files: ordered,
      ...(input !== undefined ? { input } : {}),
      ...(typeof options['--collection'] === 'string' ? { collection: options['--collection'] } : {}),
      ...(typeof options['--page'] === 'string' ? { page: options['--page'] } : {}),
      ...(typeof options['--resolver'] === 'string' ? { designResolver: options['--resolver'] } : {}),
      dryRun: options['--dry-run'] === true,
      allowBreaking: options['--allow-breaking'] === true,
      ...(options['--overwrite-drift'] === true ? { overwriteDrift: true } : {}),
      ...(options['--skip-unchanged'] === true ? { skipUnchanged: true } : {}),
      ...(options['--verbose'] === true ? { verbose: true } : {}),
      ...(figcraft !== undefined ? { figcraft } : {}),
      ...(figcraftFile !== undefined ? { figcraftFile } : {}),
      ...(library !== undefined ? { library } : {}),
      ...(uses.length > 0 ? { uses } : {}),
    },
    io,
  );
}

function fail(io: RunIo, message: string): number {
  io.stderr(`${message}\n${USAGE}`);
  return 1;
}
