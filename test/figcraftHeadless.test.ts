/**
 * A headless run: `sync … --figcraft-file <path.figcraft>`, through a fake `figcraft-cli mcp` child process
 * (`support/fakeFigcraftCli.mjs`) that passes each command on to the fake control socket. Synthetic component files on
 * the sample design system (W3C structured colours and dimensions).
 */

import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main, type Io } from '../cli/main.js';
import { startFakeFigcraft, type FakeFigcraft } from './support/fakeFigcraft.js';

const here = dirname(fileURLToPath(import.meta.url));
const FILES = ['fixtures/figcraft/icon.component.kdl', 'fixtures/figcraft/button.component.kdl'];
const folder = mkdtempSync(join(tmpdir(), 'toghen-headless-'));
const file = join(folder, 'design.figcraft');
const log = join(folder, 'calls.jsonl');

const sync = (...flags: string[]) => syncFiles(FILES, ...flags);

async function syncFiles(files: string[], ...flags: string[]) {
  let stdout = '';
  let stderr = '';
  const io: Io = {
    cwd: here,
    readFile: (path) => readFileSync(path, 'utf8'),
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
    pairingFile: join(here, 'never-written'),
  };
  const code = await main(['sync', 'fixtures/sample.resolver.json', ...files, '--figcraft-file', file, ...flags], io);
  return { code, stdout, stderr };
}

/** The tool calls the fake CLI received since the last call to this. */
function calls(): Array<{ tool: string; arguments: Record<string, any> }> {
  if (!existsSync(log)) return [];
  const read = readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  rmSync(log);
  return read;
}

describe('a headless run into a .figcraft file', () => {
  let fake: FakeFigcraft;
  before(() => {
    process.env.FIGCRAFT_CLI = join(here, 'support', 'fakeFigcraftCli.mjs');
    process.env.FAKE_FIGCRAFT_LOG = log;
  });
  beforeEach(async () => {
    await fake?.close();
    // The session's untitled file, and the file on disk once opened.
    fake = await startFakeFigcraft(['Untitled', 'design']);
    fake.tabs[1].path = file;
    process.env.FAKE_FIGCRAFT_PORT = String(fake.port);
    delete process.env.FAKE_FIGCRAFT_VERSION;
    writeFileSync(file, '');
    calls();
  });
  after(async () => {
    await fake?.close();
    rmSync(folder, { recursive: true, force: true });
  });

  it('opens the file, writes every request into it, saves it, and plans nothing on a second run', async () => {
    const first = await sync();
    assert.equal(first.code, 0, first.stderr);
    assert.match(first.stdout, /Writing into .*design\.figcraft headless, with figcraft-cli 0\.10\.0/);
    assert.match(first.stdout, /Button: 1 step · 2 created/);
    assert.match(first.stdout, new RegExp(`Saved ${file}\\.`));

    const [untitled, design] = fake.tabs;
    assert.equal(untitled.variables.length + untitled.styles.length, 0, 'the untitled file is untouched');
    assert.ok(design.variables.length > 40);

    const made = calls();
    assert.deepEqual(made[0], { tool: 'open_file', arguments: { path: file } });
    assert.deepEqual(made.at(-1), { tool: 'save_file', arguments: { path: file } });
    // Every batch is pinned: it shows the file first, and lists the tabs last.
    const batches = made.filter(
      (call) =>
        call.tool === 'run_command' &&
        call.arguments.command === 'command.batch' &&
        call.arguments.params.commands[0].command === 'doc.switch',
    );
    assert.ok(batches.length > 10);
    assert.ok(batches.every((call) => call.arguments.params.commands[0].params.index === 1));

    const second = await sync();
    assert.equal(second.code, 0, second.stderr);
    assert.match(second.stdout, /Variable plan: 0 creates · 0 updates/);
    assert.match(second.stdout, /Button: 1 step · 0 created · 0 updated · 0 deleted/);
  });

  it('makes the file when there is none yet', async () => {
    rmSync(file);
    const result = await sync();
    assert.equal(result.code, 0, result.stderr);
    const made = calls();
    assert.ok(!made.some((call) => call.tool === 'open_file'));
    assert.deepEqual(made.at(-1), { tool: 'save_file', arguments: { path: file } });
    assert.ok(fake.tabs[0].variables.length > 40, "written into the session's untitled file, which the save names");
  });

  it('saves nothing in a dry run', async () => {
    // Built first: a dry run of a set that places another's instance needs that set made.
    assert.equal((await sync()).code, 0);
    calls();
    const labels = fake.labels.length;
    const result = await sync('--dry-run');
    assert.equal(result.code, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /Saved/);
    assert.ok(!calls().some((call) => call.tool === 'save_file'));
    assert.deepEqual(
      fake.labels.slice(labels).filter((label) => label !== 'Read'),
      [],
    );
  });

  it('runs a file after the file whose set it nests, and a first dry run counts that set as pending (#131)', async () => {
    // Button nests Icon and is typed first, into a file that has neither.
    const reversed = [...FILES].reverse();
    const dry = await syncFiles(reversed, '--dry-run');
    assert.equal(dry.code, 0, dry.stderr);
    assert.doesNotMatch(dry.stdout + dry.stderr, /not in this file/);
    assert.deepEqual(dry.stdout.match(/pending: component "Icon".*/g), [
      'pending: component "Icon" (line 15): a file earlier in this run would create it; the properties and slots of instances of "Icon" are checked when it is built',
    ]);
    assert.ok(dry.stdout.indexOf('Icon (dry run)') < dry.stdout.indexOf('Button (dry run)'));

    const real = await syncFiles(reversed);
    assert.equal(real.code, 0, real.stderr);
    assert.ok(real.stdout.indexOf('Icon:') < real.stdout.indexOf('Button:'));
    assert.match(real.stdout, /Button: 1 step · 2 created/);
  });

  it('saves nothing when the run stops partway', async () => {
    fake.refuse = 'component.combineVariants';
    const result = await sync();
    assert.equal(result.code, 1);
    assert.match(result.stderr, /design\.figcraft was not saved: the run did not complete/);
    assert.ok(!calls().some((call) => call.tool === 'save_file'));
  });

  it('refuses a figcraft-cli older than 0.8.0, whose node.get does not report the stamps', async () => {
    process.env.FAKE_FIGCRAFT_VERSION = '0.7.0';
    const result = await sync();
    assert.equal(result.code, 1);
    assert.match(result.stderr, /is 0\.7\.0: a headless run needs figcraft-cli 0\.8\.0 or later/);
    assert.deepEqual(calls(), []);
  });

  it('says where to find figcraft-cli when there is none', async () => {
    const cli = process.env.FIGCRAFT_CLI;
    process.env.FIGCRAFT_CLI = join(folder, 'no-such-cli');
    try {
      const result = await sync();
      assert.equal(result.code, 1);
      assert.match(result.stderr, /was not found: put figcraft-cli on the PATH, or name it with FIGCRAFT_CLI/);
    } finally {
      process.env.FIGCRAFT_CLI = cli;
    }
  });

  it('takes a .figcraft file, not beside --figcraft, and a library as a .figcraft file too', async () => {
    const stderr = async (...argv: string[]) => {
      let said = '';
      const code = await main(argv, {
        cwd: here,
        readFile: () => '',
        stdout: () => {},
        stderr: (text) => (said += text),
        pairingFile: join(here, 'never-written'),
      });
      assert.equal(code, 1);
      return said;
    };
    assert.match(await stderr('variables', 'fixtures/sample.resolver.json', '--figcraft-file', 'design.fig'), /takes a \.figcraft file/);
    assert.match(
      await stderr('variables', 'fixtures/sample.resolver.json', '--figcraft-file', 'd.figcraft', '--figcraft', '7981'),
      /--figcraft and --figcraft-file do not go together/,
    );
    assert.match(
      await stderr('variables', 'fixtures/sample.resolver.json', '--figcraft-file', 'd.figcraft', '--library', 'Lib'),
      /--library takes the library's \.figcraft file with --figcraft or --figcraft-file/,
    );
  });
});
