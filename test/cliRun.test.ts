/**
 * The command line against a fake plugin, over a real localhost socket.
 *
 * The plugin side is the real handlers with the Figma mock behind them (`support/fakePlugin.ts`), so what
 * is exercised is the command line's protocol, pairing and ordering, and the engines it drives.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, type Io } from '../cli/main.js';
import { createFigmaMock, useFigmaMock, type FigmaMockHandle } from './support/figmaMock.js';
import { connectFakePlugin } from './support/fakePlugin.js';
import type { RunOptions } from '../shared/components/steps.js';

// Tokens in the shapes the W3C format documents: structured dimension, colour and typography values.
const base = (extra: Record<string, unknown> = {}) => ({
  space: {
    $type: 'dimension',
    sm: { $value: { value: 8, unit: 'px' } },
    ...extra,
  },
  surface: { page: { $type: 'color', $value: { colorSpace: 'srgb', components: [0.96, 0.97, 1] } } },
  text: {
    label: {
      $type: 'typography',
      $value: { fontFamily: ['Inter'], fontSize: { value: 14, unit: 'px' }, fontWeight: 400, lineHeight: 1.5, fontStyle: 'Regular' },
    },
  },
});

const resolver = JSON.stringify({
  version: '2025-11-01',
  name: 'Tokens',
  sets: { base: { sources: [{ $ref: './base.tokens.json' }] } },
  resolutionOrder: [{ $ref: '#/sets/base' }],
});
const tokens = (withXl: boolean) => JSON.stringify(base(withXl ? { xl: { $value: { value: 32, unit: 'px' } } } : {}));

// Line 5 names `{space.xl}`.
const panel = (spacing = '{space.xl}') => `component Panel
properties {
    TEXT Title default="Title"
}
FRAME Panel layoutMode=VERTICAL itemSpacing="${spacing}" {
    fills "{surface.page}"
    TEXT Heading characters=(property)Title textStyle="{text.label}"
}
`;
const badge = (values: string) => `component Badge\nproperties {\n    VARIANT Tone ${values}\n}\nFRAME Badge layoutMode=VERTICAL\n`;

const fileMock = () =>
  createFigmaMock()
    .withFonts([{ family: 'Inter', style: 'Regular' }])
    .withCollection('Tokens', ['default'])
    .install();

interface Started {
  /** Resolves with the first match of `pattern` in what the command has printed. */
  waitFor(pattern: RegExp): Promise<RegExpExecArray>;
  done: Promise<{ code: number; stdout: string; stderr: string }>;
  pairingFile: string;
}

/** Starts the command on a port of the system's choosing, reading `files` from /repo. */
function start(
  argv: string[],
  files: Record<string, string>,
  options: { pairingFile?: string; pairedWaitMs?: number; port?: number } = {},
): Started {
  const pairingFile = options.pairingFile ?? join(mkdtempSync(join(tmpdir(), 'toghen-pair-')), 'pairing');
  let stdout = '';
  let stderr = '';
  const io: Io = {
    cwd: '/repo',
    readFile: (path) => {
      if (!(path in files)) throw new Error(`no such file ${path}`);
      return files[path];
    },
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
    pairingFile,
    port: options.port ?? 0,
    pairedWaitMs: options.pairedWaitMs ?? 200,
  };
  const done = main(argv, io).then((code) => ({ code, stdout, stderr }));
  const waitFor = async (pattern: RegExp) => {
    for (let i = 0; i < 500; i += 1) {
      const found = pattern.exec(stdout);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`the command never printed ${pattern}; it printed:\n${stdout}\n${stderr}`);
  };
  return { waitFor, done, pairingFile };
}

/** Pairs a fake plugin with a run that prints a code. */
async function pair(run: Started, mock: FigmaMockHandle) {
  const code = (await run.waitFor(/Pairing code: (\S+)/))[1];
  const port = Number((await run.waitFor(/ws:\/\/localhost:(\d+)/))[1]);
  const plugin = connectFakePlugin(port, code, mock);
  await plugin.paired;
  return Object.assign(plugin, { code, port });
}

const files = (components: Record<string, string>, withXl: boolean) => ({
  '/repo/tokens/resolver.json': resolver,
  '/repo/tokens/base.tokens.json': tokens(withXl),
  ...Object.fromEntries(Object.entries(components).map(([name, text]) => [`/repo/${name}`, text])),
});

describe('toghen-figma: pairing', () => {
  useFigmaMock();

  it('refuses a connection without the code, and one with a wrong code, and sends it nothing', async () => {
    const mock = fileMock();
    const run = start(['variables', 'tokens/resolver.json'], files({}, false));
    const code = (await run.waitFor(/Pairing code: (\S+)/))[1];
    // The hint names what the screen shows: the Source card, at the foot of the Load pane (ui/components/pane-load.js).
    await run.waitFor(
      /Open the Toghen plugin in the target file, type the code into the Source card at the foot of its Load pane, and press Connect\./,
    );
    const port = Number((await run.waitFor(/ws:\/\/localhost:(\d+)/))[1]);

    const wrong = connectFakePlugin(port, 'AAAA-AAAA', mock);
    assert.equal(await wrong.closed, 4001);
    assert.deepEqual(wrong.received, []);

    const silent = new WebSocket(`ws://127.0.0.1:${port}`);
    const closed = new Promise<number>((resolve) => (silent.onclose = (event) => resolve(event.code)));
    silent.onopen = () => silent.send(JSON.stringify({ type: 'GET_SELECTION', payload: {} }));
    assert.equal(await closed, 4001, 'a command is not a code');

    // What is typed is compared without case, dashes or spaces.
    const plugin = connectFakePlugin(port, code.toLowerCase().replace('-', ' '), mock);
    await plugin.paired;
    const result = await run.done;
    assert.equal(result.code, 0, result.stderr);
    assert.ok(!plugin.received.includes('GET_SELECTION'));
  });

  it('stops after too many wrong codes', async () => {
    const mock = fileMock();
    const run = start(['variables', 'tokens/resolver.json'], files({}, false));
    const port = Number((await run.waitFor(/ws:\/\/localhost:(\d+)/))[1]);
    for (let i = 0; i < 5; i += 1) await connectFakePlugin(port, 'AAAA-AAAA', mock).closed;

    const result = await run.done;
    assert.equal(result.code, 1);
    assert.match(result.stderr, /5 connections gave a wrong pairing code, so the run stopped/);
  });

  it('keeps the code in a file only this account can read, and finds a plugin paired in an earlier run without a new one', async () => {
    const mock = fileMock();
    const first = start(['variables', 'tokens/resolver.json'], files({}, false));
    const plugin = await pair(first, mock);
    assert.equal((await first.done).code, 0);
    assert.equal(await plugin.closed, 1000, 'the run closes the socket normally');

    assert.equal(statSync(first.pairingFile).mode & 0o777, 0o600);
    assert.equal(readFileSync(first.pairingFile, 'utf8').trim(), plugin.code);

    // The next run listens again; the plugin, which retries, comes back with the same code.
    const second = start(['variables', 'tokens/resolver.json'], files({}, false), { pairingFile: first.pairingFile, pairedWaitMs: 5000 });
    const port = Number((await second.waitFor(/Looking for the plugin paired earlier on ws:\/\/localhost:(\d+)/))[1]);
    const back = connectFakePlugin(port, plugin.code, mock);
    const result = await second.done;
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /The plugin is paired\./);
    assert.doesNotMatch(result.stdout, /Pairing code/);
    await back.closed;
  });

  it('prints a new code when the plugin paired earlier does not come back, as when it was closed', async () => {
    const mock = fileMock();
    const first = start(['variables', 'tokens/resolver.json'], files({}, false));
    const old = await pair(first, mock);
    await first.done;

    const second = start(['variables', 'tokens/resolver.json'], files({}, false), { pairingFile: first.pairingFile, pairedWaitMs: 50 });
    const renewed = (await second.waitFor(/Pairing code: (\S+)/))[1];
    assert.notEqual(renewed, old.code);
    assert.equal(readFileSync(first.pairingFile, 'utf8').trim(), renewed, 'and the file holds it');
    const port = Number((await second.waitFor(/Waiting for the plugin on ws:\/\/localhost:(\d+)/))[1]);

    assert.equal(await connectFakePlugin(port, old.code, mock).closed, 4001, 'the old code is no longer good');
    await connectFakePlugin(port, renewed, mock).paired;
    assert.equal((await second.done).code, 0);
  });

  it('reports a port that is taken, and stops', async () => {
    const holder = createServer();
    await new Promise<void>((resolve) => holder.listen(0, '127.0.0.1', resolve));
    const taken = (holder.address() as { port: number }).port;
    try {
      const result = await start(['variables', 'tokens/resolver.json'], files({}, false), { port: taken }).done;
      assert.equal(result.code, 1);
      assert.match(result.stderr, new RegExp(`port ${taken} is taken`));
    } finally {
      holder.close();
    }
  });
});

describe('toghen-figma sync', () => {
  useFigmaMock();

  /** A first sync that puts `space.sm`, `surface.page` and the text style in the file, and the panel on its page. */
  async function firstSync(mock: FigmaMockHandle) {
    const run = start(
      ['sync', 'tokens/resolver.json', 'ui/panel.component.kdl'],
      files({ 'ui/panel.component.kdl': panel('{space.sm}') }, false),
    );
    await pair(run, mock);
    const result = await run.done;
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    return { run, result };
  }

  it('syncs the variables, then the styles, then runs each component, in that order', async () => {
    const mock = fileMock();
    const run = start(['sync', 'tokens/resolver.json', 'ui/panel.component.kdl'], files({ 'ui/panel.component.kdl': panel() }, true));
    const plugin = await pair(run, mock);
    const result = await run.done;

    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.deepEqual(plugin.received, [
      'LOAD_DOCUMENT',
      'CHECK_COMPONENTS',
      'PLAN_VARIABLE_SYNC',
      'EXECUTE_VARIABLE_SYNC',
      'PLAN_STYLE_SYNC',
      'EXECUTE_STYLE_SYNC',
      'RUN_COMPONENT',
      'FINISH_COMPONENTS',
    ]);
    assert.match(result.stdout, /Variable plan: 3 creates/);
    assert.match(result.stdout, /Variable sync: \d+ applied/);
    assert.match(result.stdout, /Style plan: 1 creates/);
    assert.match(result.stdout, /Panel: \d+ steps? · 1 created · 0 updated · 0 deleted/);

    // What the plugin made, and the component bound to it.
    const names = mock
      .variables()
      .map((v) => v.name)
      .sort();
    assert.deepEqual(names, ['space/sm', 'space/xl', 'surface/page']);
    assert.deepEqual(
      mock.styles('TEXT').map((s) => s.name),
      ['text/label'],
    );
    // The structured values arrived as Figma's: 32 px, and a colour as {r,g,b,a}, with no [object Object] anywhere.
    const xl = mock.variables().find((v) => v.name === 'space/xl')!;
    assert.deepEqual(Object.values(xl.valuesByMode), [32]);
    assert.doesNotMatch(result.stdout + result.stderr, /\[object Object\]/);
  });

  it('a dry run across the steps writes nothing, and a name the variable sync would make counts as present', async () => {
    const mock = fileMock();
    await firstSync(mock);
    const writes = mock.writes().length;

    // The resolver now defines `space.xl`, and the component uses it on line 5.
    const run = start(
      ['sync', 'tokens/resolver.json', 'ui/panel.component.kdl', '--dry-run'],
      files({ 'ui/panel.component.kdl': panel() }, true),
    );
    const plugin = await pair(run, mock);
    const result = await run.done;

    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.deepEqual(plugin.received, [
      'LOAD_DOCUMENT',
      'CHECK_COMPONENTS',
      'PLAN_VARIABLE_SYNC',
      'PLAN_STYLE_SYNC',
      'GET_FIGMA_COLLECTIONS',
      'RUN_COMPONENT',
      'FINISH_COMPONENTS',
    ]);
    assert.equal(plugin.commands[0].payload.dryRun, true, 'the load is told it is for a dry run, so it migrates nothing');
    assert.match(result.stdout, /Variable plan: 1 creates/);
    assert.match(result.stdout, /Panel \(dry run\): /);
    assert.match(result.stdout, /pending: token \{space\.xl\} \(line 5\): the variable sync would create "space\/xl"/);
    // Loading the document remembers it in the user's storage, which is not the file; everything else must be absent.
    const wrote = mock
      .writes()
      .slice(writes)
      .map((call) => call.api)
      .filter((api) => !/clientStorage/.test(api));
    assert.deepEqual(wrote, [], 'nothing in the file changed');
    assert.ok(!mock.variables().some((v) => v.name === 'space/xl'));
  });

  it('a dry run stops when the plan would make a name a second time, in another collection', async () => {
    const mock = fileMock();
    await firstSync(mock);

    const run = start(
      ['sync', 'tokens/resolver.json', 'ui/panel.component.kdl', '--dry-run', '--collection', 'Other'],
      files({ 'ui/panel.component.kdl': panel() }, true),
    );
    await pair(run, mock);
    const result = await run.done;

    assert.equal(result.code, 1);
    assert.match(result.stderr, /ui\/panel\.component\.kdl: was not planned/);
    // `--collection Other` names the base collection Other, which the plan would fill with every
    // base token again: `surface/page` is then in both, and a name found in two collections stops a build.
    assert.match(
      result.stderr,
      /token \{surface\.page\} \(line 6\) is ambiguous, it matches Tokens: "surface\/page"; Other: "surface\/page" \(the sync would create it\)/,
    );
  });

  it('binds a style to the variables in the collection --collection named, not the one named after the document', async () => {
    const mock = createFigmaMock()
      .withFonts([{ family: 'Inter', style: 'Regular' }])
      .install();
    // `text.label` refers to `space.sm`, so the style plan has to find that variable where the variable plan put it.
    const referring = JSON.parse(tokens(false));
    referring.text.label.$value.fontSize = '{space.sm}';
    const input = { '/repo/tokens/resolver.json': resolver, '/repo/tokens/base.tokens.json': JSON.stringify(referring) };

    const run = start(['variables', 'tokens/resolver.json', '--collection', 'Other'], input);
    await pair(run, mock);
    const result = await run.done;

    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.deepEqual(
      mock.collections().map((c) => c.name),
      ['Other'],
    );
    const label = mock.styles('TEXT').find((s) => s.name === 'text/label')!;
    assert.deepEqual((label.boundVariables as Record<string, unknown>).fontSize, {
      type: 'VARIABLE_ALIAS',
      id: mock.variable('Other', 'space/sm')!.id,
    });
    assert.doesNotMatch(result.stdout + result.stderr, /has no variable yet|sync variables/);
  });

  it('has the plugin check every name against the design system before it writes anything, and say where the file wrote it', async () => {
    const mock = fileMock();
    const run = start(
      ['sync', 'tokens/resolver.json', 'ui/panel.component.kdl'],
      files({ 'ui/panel.component.kdl': panel('{space.nowhere}') }, false),
    );
    const plugin = await pair(run, mock);
    const result = await run.done;

    assert.equal(result.code, 1);
    assert.match(result.stderr, /^ui\/panel\.component\.kdl:5:\d+ token \{space\.nowhere\} is not in the design system "Tokens"/m);
    assert.deepEqual(plugin.received, ['LOAD_DOCUMENT', 'CHECK_COMPONENTS'], 'the variables were not synced');
    assert.deepEqual(
      mock
        .writes()
        .map((call) => call.api)
        .filter((api) => !/clientStorage/.test(api)),
      [],
      'nothing in the file changed',
    );
  });

  it('names a text style the design system does not define too', async () => {
    const mock = fileMock();
    const bad = panel().replace('{text.label}', '{text.missing}');
    const run = start(['sync', 'tokens/resolver.json', 'ui/panel.component.kdl'], files({ 'ui/panel.component.kdl': bad }, true));
    await pair(run, mock);
    const result = await run.done;
    assert.equal(result.code, 1);
    assert.match(result.stderr, /ui\/panel\.component\.kdl:7:\d+ text style \{text\.missing\} is not in the design system "Tokens"/);
  });

  it('is a courier: it sends the text of a file and its name, and no component and no packed document', async () => {
    const mock = fileMock();
    const text = panel('{space.sm}');
    const run = start(['sync', 'tokens/resolver.json', 'ui/panel.component.kdl'], files({ 'ui/panel.component.kdl': text }, false));
    const plugin = await pair(run, mock);
    assert.equal((await run.done).code, 0);

    const sent = plugin.commands.filter((command) => command.type === 'RUN_COMPONENT' || command.type === 'CHECK_COMPONENTS');
    assert.deepEqual(
      sent.map((command) => command.type),
      ['CHECK_COMPONENTS', 'RUN_COMPONENT'],
    );
    const [check, runComponent] = sent;
    assert.deepEqual(check.payload.files, [{ fileName: 'ui/panel.component.kdl', text }]);
    assert.deepEqual(Object.keys(runComponent.payload).sort(), ['fileName', 'options', 'text']);
    assert.equal(runComponent.payload.text, text);
    assert.equal(runComponent.payload.fileName, 'ui/panel.component.kdl');
    for (const key of ['component', 'document', 'members']) assert.ok(!(key in runComponent.payload), `${key} is not sent`);
  });

  it('prints what the plugin says of a file with a KDL syntax error: its name and its line, and nothing is run', async () => {
    const mock = fileMock();
    const run = start(['components', 'ui/x.component.kdl'], { '/repo/ui/x.component.kdl': 'component X {\n  FRAME X {\n' });
    const plugin = await pair(run, mock);
    const result = await run.done;

    assert.equal(result.code, 1);
    assert.match(result.stderr, /^ui\/x\.component\.kdl:\d+:\d+ not valid KDL/m);
    assert.deepEqual(plugin.received, ['CHECK_COMPONENTS']);
    assert.equal(mock.writes().length, 0);
  });

  it('reads nothing itself: a file it cannot read is the only problem it reports, before it waits for a plugin', async () => {
    const run = start(['components', 'ui/missing.component.kdl'], {}, { pairedWaitMs: 10 });
    const result = await run.done;
    assert.equal(result.code, 1);
    assert.match(result.stderr, /^ui\/missing\.component\.kdl cannot be read: no such file \/repo\/ui\/missing\.component\.kdl/m);
    assert.equal(existsSync(run.pairingFile), false, 'no pairing was started');
  });

  it('loads the resolver document a components run takes its axes from, and syncs nothing', async () => {
    const mock = createFigmaMock().withCollection('Tokens', ['default']).withCollection('theme', ['light', 'dark']).install();
    const button = 'component Panel\nproperties {\n    VARIANT Tone (modifier)"theme"\n}\nFRAME Panel layoutMode=VERTICAL\n';
    const themed = JSON.stringify({
      version: '2025-11-01',
      name: 'Tokens',
      sets: { base: { sources: [base()] } },
      modifiers: { theme: { default: 'light', contexts: { light: [{}], dark: [{}] } } },
      resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
    });
    const run = start(['components', 'ui/panel.component.kdl', '--resolver', 'tokens/resolver.json', '--dry-run'], {
      '/repo/tokens/resolver.json': themed,
      '/repo/ui/panel.component.kdl': button,
    });
    const plugin = await pair(run, mock);
    const result = await run.done;

    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.deepEqual(plugin.received, ['LOAD_DOCUMENT', 'CHECK_COMPONENTS', 'RUN_COMPONENT', 'FINISH_COMPONENTS']);
    assert.match(result.stdout, /Panel \(dry run\): 1 step/);
  });

  it('refuses a real run that would break instances, lists them, and takes them with --allow-breaking', async () => {
    const mock = fileMock();
    const build = start(['components', 'ui/badge.component.kdl'], files({ 'ui/badge.component.kdl': badge('calm loud quiet') }, false));
    await pair(build, mock);
    assert.equal((await build.done).code, 0);
    const writes = mock.writes().length;

    const narrow = files({ 'ui/badge.component.kdl': badge('calm loud') }, false);
    const refused = start(['components', 'ui/badge.component.kdl'], narrow, { pairingFile: build.pairingFile, pairedWaitMs: 5000 });
    const port = Number((await refused.waitFor(/ws:\/\/localhost:(\d+)/))[1]);
    connectFakePlugin(port, readFileSync(build.pairingFile, 'utf8').trim(), mock);
    const stopped = await refused.done;

    assert.equal(stopped.code, 1);
    assert.match(
      stopped.stderr,
      /ui\/badge\.component\.kdl: was not built: will not change "Badge": 1 step would break instances, and nothing was written/,
    );
    assert.match(stopped.stderr, /the member "Tone=quiet" is gone/);
    assert.equal(mock.writes().length, writes, 'nothing was written');

    const allowed = start(['components', 'ui/badge.component.kdl', '--allow-breaking'], narrow, {
      pairingFile: build.pairingFile,
      pairedWaitMs: 5000,
    });
    const port2 = Number((await allowed.waitFor(/ws:\/\/localhost:(\d+)/))[1]);
    connectFakePlugin(port2, readFileSync(build.pairingFile, 'utf8').trim(), mock);
    const taken = await allowed.done;
    assert.equal(taken.code, 0, taken.stderr);
    assert.match(taken.stdout, /Badge: .* 1 deleted · 1 breaking/);
    assert.match(taken.stdout, /breaking: .*Tone=quiet/);
  });

  it('lists a member outside any set in a dry run, stops a real run on it, and removes it with --allow-breaking', async () => {
    const mock = fileMock();
    const figmaOf = (
      globalThis as unknown as {
        figma: { createComponent(): { id: string; setSharedPluginData(namespace: string, key: string, value: string): void } };
      }
    ).figma;
    const stray = figmaOf.createComponent();
    stray.setSharedPluginData('toghen', 'member', 'Tone=gone');
    const text = files({ 'ui/badge.component.kdl': badge('calm loud') }, false);
    const sentence = `"Tone=gone" (${stray.id}) is a member outside any set, left by an earlier run; it is removed with --allow-breaking.`;
    const strays = () =>
      (globalThis as unknown as { figma: { currentPage: { children: { id: string }[] } } }).figma.currentPage.children.filter(
        (node) => node.id === stray.id,
      ).length;

    const dry = start(['components', 'ui/badge.component.kdl', '--dry-run'], text);
    await pair(dry, mock);
    const planned = await dry.done;
    assert.equal(planned.code, 0, planned.stderr);
    assert.match(planned.stdout, new RegExp(`^breaking: ${sentence.replace(/[().]/g, '\\$&')}$`, 'm'));
    assert.equal(strays(), 1, 'a dry run removes none');

    const refused = start(['components', 'ui/badge.component.kdl'], text, { pairingFile: dry.pairingFile, pairedWaitMs: 5000 });
    const port = Number((await refused.waitFor(/ws:\/\/localhost:(\d+)/))[1]);
    const plugin = connectFakePlugin(port, readFileSync(dry.pairingFile, 'utf8').trim(), mock);
    const stopped = await refused.done;
    assert.equal(stopped.code, 1);
    assert.ok(stopped.stderr.includes(sentence), stopped.stderr);
    assert.deepEqual(plugin.received, ['CHECK_COMPONENTS'], 'it stopped before its first write');
    assert.equal(strays(), 1);

    const allowed = start(['components', 'ui/badge.component.kdl', '--allow-breaking'], text, {
      pairingFile: dry.pairingFile,
      pairedWaitMs: 5000,
    });
    const port2 = Number((await allowed.waitFor(/ws:\/\/localhost:(\d+)/))[1]);
    connectFakePlugin(port2, readFileSync(dry.pairingFile, 'utf8').trim(), mock);
    const taken = await allowed.done;
    assert.equal(taken.code, 0, taken.stderr);
    assert.ok(taken.stdout.includes(`removed "Tone=gone" (${stray.id})`), taken.stdout);
    assert.equal(strays(), 0);
  });

  it('prints where a set went when the end of the run moved it', async () => {
    const mock = fileMock();
    const build = start(
      ['components', 'ui/badge.component.kdl', 'ui/chip.component.kdl'],
      files({ 'ui/badge.component.kdl': badge('calm loud'), 'ui/chip.component.kdl': badge('calm').replace('Badge', 'Chip') }, false),
    );
    await pair(build, mock);
    const result = await build.done;
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /^moved "Chip" to 0, \d+$/m, 'the second set went under the first');
  });

  it('syncs the variables with the parts folded, then builds a component whose axes come from the parts, pinned to the collection of the axis', async () => {
    const mock = fileMock();
    const states = JSON.stringify({
      version: '2025-11-01',
      name: 'Tokens',
      sets: {
        base: {
          sources: [
            {
              button: {
                $extensions: { 'com.toghen': { css: { parts: { pointer: { hover: ':hover' } } } } },
                bg: { $type: 'color', $value: { colorSpace: 'srgb', components: [0.9, 0.9, 0.9] } },
                hover: { bg: { $type: 'color', $value: { colorSpace: 'srgb', components: [0.8, 0.8, 0.8] } } },
              },
              text: base().text,
            },
          ],
        },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    });
    const button = 'component Button tokens="{button}"\nFRAME Button layoutMode=HORIZONTAL {\n    fills "{button.bg}"\n}\n';
    const input = { '/repo/tokens/resolver.json': states, '/repo/ui/button.component.kdl': button };

    const run = start(['sync', 'tokens/resolver.json', 'ui/button.component.kdl'], input);
    await pair(run, mock);
    const result = await run.done;

    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Variable plan: .* creates/);
    assert.match(result.stdout, /Button: \d+ steps? · 2 created/);
    // The parts: the token lives in the collection of the axis, a mode per part, and the hover token has no variable of its own.
    assert.deepEqual(
      mock.collections().map((c) => [c.name, c.modes.map((m) => m.name)]),
      [
        ['Tokens', ['default']],
        ['pointer', ['rest', 'hover']],
      ],
    );
    assert.deepEqual(
      mock.variables().map((v) => v.name),
      ['button/bg'],
    );
    // The set has a member per part, each pinned to its mode of that collection and no other.
    type Found = { name: string; children: { name: string; explicitVariableModes: Record<string, string> }[] };
    const figmaRoot = (globalThis as unknown as { figma: { root: { children: { findAllWithCriteria(criteria: object): Found[] }[] } } })
      .figma.root;
    const [set] = figmaRoot.children.flatMap((page) => page.findAllWithCriteria({ types: ['COMPONENT_SET'] }));
    const collection = mock.collection('pointer')!;
    assert.deepEqual(
      set.children.map((member) => [member.name, member.explicitVariableModes]),
      [
        ['pointer=rest', { [collection.id]: collection.modes[0].modeId }],
        ['pointer=hover', { [collection.id]: collection.modes[1].modeId }],
      ],
    );
  });

  it('exits 1 when the plugin goes away in the middle of a run', async () => {
    const mock = fileMock();
    const run = start(
      ['sync', 'tokens/resolver.json', 'ui/panel.component.kdl'],
      files({ 'ui/panel.component.kdl': panel('{space.sm}') }, false),
    );
    const plugin = await pair(run, mock);
    plugin.close();
    const result = await run.done;
    assert.equal(result.code, 1);
    assert.match(result.stderr, /the plugin disconnected|the plugin is not connected/);
  });
});

describe('toghen-figma variables: a context removed from the document', () => {
  useFigmaMock();

  const document = (contexts: string[]) => ({
    '/repo/tokens/resolver.json': JSON.stringify({
      version: '2025-11-01',
      name: 'Tokens',
      sets: { base: { sources: [{ space: { $type: 'dimension', sm: { $value: { value: 8, unit: 'px' } } } }] } },
      modifiers: {
        state: {
          default: 'rest',
          contexts: Object.fromEntries(
            contexts.map((context, index) => [
              context,
              [index === 0 ? {} : { space: { sm: { $value: { value: 8 + index, unit: 'px' } } } }],
            ]),
          ),
        },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/state' }],
    }),
  });
  const modeNames = (mock: FigmaMockHandle) => mock.collection('state')!.modes.map((m) => m.name);
  const withoutClientStorage = (mock: FigmaMockHandle) => mock.writes().filter((call) => !/clientStorage/.test(call.api)).length;

  /** A file the plugin has synced with three contexts; the later runs drop `pressed`. */
  async function synced() {
    const mock = createFigmaMock().install();
    const build = start(['variables', 'tokens/resolver.json'], document(['rest', 'hover', 'pressed']));
    await pair(build, mock);
    assert.equal((await build.done).code, 0);
    assert.deepEqual(modeNames(mock), ['rest', 'hover', 'pressed']);
    return { mock, pairingFile: build.pairingFile };
  }

  /** Another run of the command, against the plugin paired by the first. */
  async function again(argv: string[], pairingFile: string, mock: FigmaMockHandle) {
    const run = start(argv, document(['rest', 'hover']), { pairingFile, pairedWaitMs: 5000 });
    const port = Number((await run.waitFor(/ws:\/\/localhost:(\d+)/))[1]);
    const plugin = connectFakePlugin(port, readFileSync(pairingFile, 'utf8').trim(), mock);
    const result = await run.done;
    return { ...result, plugin };
  }

  const GONE =
    /the mode "pressed" of collection "state" is gone: values in it are lost, and a frame or variant pinned to it falls back to "rest"/;

  it('lists the mode in a dry run, and writes nothing', async () => {
    const { mock, pairingFile } = await synced();
    const writes = withoutClientStorage(mock);

    const result = await again(['variables', 'tokens/resolver.json', '--dry-run'], pairingFile, mock);

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Variable plan: .* 1 breaking/);
    assert.match(result.stdout, new RegExp(`  breaking: ${GONE.source}`));
    assert.equal(withoutClientStorage(mock), writes);
    assert.deepEqual(modeNames(mock), ['rest', 'hover', 'pressed']);
  });

  it('stops a real run before its first write, exits 1, and lists every such mode', async () => {
    const { mock, pairingFile } = await synced();
    const writes = withoutClientStorage(mock);

    const result = await again(['variables', 'tokens/resolver.json'], pairingFile, mock);

    assert.equal(result.code, 1);
    assert.match(result.stdout, GONE);
    assert.match(
      result.stderr,
      /Variable sync will not run: 1 step would lose something in Figma, and nothing was written; pass --allow-breaking to take it/,
    );
    assert.deepEqual(result.plugin.received, ['LOAD_DOCUMENT', 'PLAN_VARIABLE_SYNC'], 'the plan was never executed');
    assert.equal(withoutClientStorage(mock), writes);
    assert.deepEqual(modeNames(mock), ['rest', 'hover', 'pressed']);
  });

  it('stops the whole run when the base collection was built by an earlier sync, a dry run included', async () => {
    const mock = createFigmaMock().withCollection('Tokens', ['rest/cosy', 'hover/cosy']).install();
    const writes = withoutClientStorage(mock);
    for (const extra of [['--dry-run'], []]) {
      const run = start(['variables', 'tokens/resolver.json', ...extra], document(['rest', 'hover']));
      await pair(run, mock);
      const result = await run.done;
      assert.equal(result.code, 1, result.stdout);
      assert.match(result.stdout, /built by an earlier sync/);
      assert.match(result.stderr, /Variable sync stopped, so nothing was written and no style or component was run\./);
      assert.doesNotMatch(result.stdout, /Style plan/);
    }
    assert.equal(withoutClientStorage(mock), writes);
  });

  it('deletes the mode with --allow-breaking, passed to the variable plan', async () => {
    const { mock, pairingFile } = await synced();

    const result = await again(['variables', 'tokens/resolver.json', '--allow-breaking'], pairingFile, mock);

    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, GONE, 'listed all the same');
    assert.match(result.stdout, /Variable sync: [1-9]\d* applied/);
    assert.deepEqual(modeNames(mock), ['rest', 'hover']);
    assert.deepEqual(Object.values(mock.variable('state', 'space/sm')!.valuesByMode), [8, 9]);
  });
});

describe('toghen-figma variables: a token that moved to another collection', () => {
  useFigmaMock();

  // `space.sm` is constant in the first document and defined by a context of `state` in the second.
  const document = (varies: boolean) => ({
    '/repo/tokens/resolver.json': JSON.stringify({
      version: '2025-11-01',
      name: 'Tokens',
      sets: { base: { sources: [{ space: { $type: 'dimension', sm: { $value: { value: 8, unit: 'px' } } } }] } },
      modifiers: {
        state: {
          default: 'rest',
          contexts: { rest: [{}], hover: [varies ? { space: { sm: { $value: { value: 9, unit: 'px' } } } } : {}] },
        },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/state' }],
    }),
  });
  const MOVES = /"space\/sm" moves from "Tokens" to "state"; the old variable is removed\./;
  const homes = (mock: FigmaMockHandle) =>
    mock
      .variables()
      .filter((v) => v.name === 'space/sm')
      .map((v) => mock.collections().find((c) => c.id === v.variableCollectionId)!.name);
  const withoutClientStorage = (mock: FigmaMockHandle) => mock.writes().filter((call) => !/clientStorage/.test(call.api)).length;

  async function synced() {
    const mock = createFigmaMock().install();
    const build = start(['variables', 'tokens/resolver.json'], document(false));
    await pair(build, mock);
    assert.equal((await build.done).code, 0);
    assert.deepEqual(homes(mock), ['Tokens']);
    return { mock, pairingFile: build.pairingFile };
  }
  async function again(argv: string[], pairingFile: string, mock: FigmaMockHandle) {
    const run = start(argv, document(true), { pairingFile, pairedWaitMs: 5000 });
    const port = Number((await run.waitFor(/ws:\/\/localhost:(\d+)/))[1]);
    const plugin = connectFakePlugin(port, readFileSync(pairingFile, 'utf8').trim(), mock);
    const result = await run.done;
    return { ...result, plugin };
  }

  it('lists the move in a dry run, naming both collections, and writes nothing', async () => {
    const { mock, pairingFile } = await synced();
    const writes = withoutClientStorage(mock);

    const result = await again(['variables', 'tokens/resolver.json', '--dry-run'], pairingFile, mock);

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Variable plan: .* 1 breaking/);
    assert.match(result.stdout, new RegExp(`  breaking: ${MOVES.source}`));
    assert.equal(withoutClientStorage(mock), writes);
    assert.deepEqual(homes(mock), ['Tokens']);
  });

  it('stops a real run before its first write, exits 1, and leaves the old variable', async () => {
    const { mock, pairingFile } = await synced();
    const writes = withoutClientStorage(mock);

    const result = await again(['variables', 'tokens/resolver.json'], pairingFile, mock);

    assert.equal(result.code, 1);
    assert.match(result.stdout, MOVES);
    assert.match(
      result.stderr,
      /Variable sync will not run: 1 step would lose something in Figma, and nothing was written; pass --allow-breaking to take it/,
    );
    assert.deepEqual(result.plugin.received, ['LOAD_DOCUMENT', 'PLAN_VARIABLE_SYNC'], 'the plan was never executed');
    assert.equal(withoutClientStorage(mock), writes);
    assert.deepEqual(homes(mock), ['Tokens']);
  });

  it('removes the old variable and makes the new one with --allow-breaking', async () => {
    const { mock, pairingFile } = await synced();

    const result = await again(['variables', 'tokens/resolver.json', '--allow-breaking'], pairingFile, mock);

    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, MOVES, 'listed all the same');
    assert.deepEqual(homes(mock), ['state']);
    assert.deepEqual(Object.values(mock.variable('state', 'space/sm')!.valuesByMode), [8, 9]);
  });
});

describe('toghen-figma: artboard files and --input', () => {
  useFigmaMock();

  const row =
    'component Row\nproperties {\n    TEXT Name default="name"\n}\nFRAME Row layoutMode=VERTICAL {\n    TEXT Label characters=(property)Name\n}\n';
  const page =
    'artboard Docs\nFRAME Page layoutMode=VERTICAL {\n    each r in=(input)rows key=id {\n        INSTANCE Row component=Row {\n            set Name=(r)label\n        }\n    }\n}\n';
  // The data is a resolver document: a list of records is one token, and a record points at a token of the document.
  const input = (rows?: unknown[]) => ({
    '/repo/data/docs.json': JSON.stringify({
      version: '2025-11-01',
      name: 'Data',
      sets: { base: { sources: [{ $ref: './rows.tokens.json' }] } },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    }),
    '/repo/data/rows.tokens.json': JSON.stringify({
      ds: { name: { first: { $value: 'First' } } },
      rows: {
        $value: rows ?? [
          { id: 'a', label: '{ds.name.first}' },
          { id: 'b', label: 'Second' },
        ],
      },
    }),
    '/repo/ui/row.component.kdl': row,
    '/repo/ui/docs.artboard.kdl': page,
  });

  it('runs the component files first and the artboard files after, whatever the order they were given in, and sends the resolved data to the artboard alone', async () => {
    const mock = fileMock();
    const run = start(['components', 'ui/docs.artboard.kdl', 'ui/row.component.kdl', '--input', 'data/docs.json'], input());
    const plugin = await pair(run, mock);
    const result = await run.done;

    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.deepEqual(plugin.received, ['CHECK_COMPONENTS', 'RUN_COMPONENT', 'RUN_COMPONENT', 'FINISH_COMPONENTS']);
    const [check, first, second] = plugin.commands;
    assert.deepEqual(
      (check.payload.files as { fileName: string }[]).map((file) => file.fileName),
      ['ui/row.component.kdl', 'ui/docs.artboard.kdl'],
    );
    assert.deepEqual([first.payload.fileName, second.payload.fileName], ['ui/row.component.kdl', 'ui/docs.artboard.kdl']);
    assert.ok(!('inputs' in first.payload), 'a component file is sent no data');

    // Each leaf is its resolved $value, nested by path, and the reference inside a record was resolved by the library.
    const expected = {
      ds: { name: { first: 'First' } },
      rows: [
        { id: 'a', label: 'First' },
        { id: 'b', label: 'Second' },
      ],
    };
    assert.deepEqual(second.payload.inputs, expected);
    assert.deepEqual(check.payload.inputs, expected);

    assert.match(result.stdout, /Row: \d+ steps? · 1 created/);
    assert.match(result.stdout, /Docs: 1 step · 3 created · 0 updated · 0 deleted\n {2}create the artboard and every layer in it/);
    assert.doesNotMatch(result.stdout + result.stderr, /\[object Object\]/);
  });

  it('lists the layers a dry run would make, patch and remove, and writes nothing', async () => {
    const mock = fileMock();
    const build = start(['components', 'ui/row.component.kdl', 'ui/docs.artboard.kdl', '--input', 'data/docs.json'], input());
    await pair(build, mock);
    assert.equal((await build.done).code, 0);
    const writes = mock.writes().length;

    const rows = [
      { id: 'a', label: 'Changed' },
      { id: 'c', label: 'Third' },
    ];
    const dry = start(['components', 'ui/docs.artboard.kdl', '--input', 'data/docs.json', '--dry-run'], input(rows), {
      pairingFile: build.pairingFile,
      pairedWaitMs: 5000,
    });
    const port = Number((await dry.waitFor(/ws:\/\/localhost:(\d+)/))[1]);
    connectFakePlugin(port, readFileSync(build.pairingFile, 'utf8').trim(), mock);
    const result = await dry.done;

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Docs \(dry run\): 3 steps/);
    assert.match(result.stdout, /^ {2}create Row\["c"\]$/m);
    assert.match(result.stdout, /^ {2}patch Row\["a"\]$/m);
    assert.match(result.stdout, /^ {2}remove Row\["b"\]$/m);
    assert.match(result.stdout, /breaking: artboard "Docs", layer "Row\["b"\]" is no longer in the file/);
    assert.equal(mock.writes().length, writes);

    // A real run stops there, and --allow-breaking takes it.
    const stopped = start(['components', 'ui/docs.artboard.kdl', '--input', 'data/docs.json'], input(rows), {
      pairingFile: build.pairingFile,
      pairedWaitMs: 5000,
    });
    connectFakePlugin(Number((await stopped.waitFor(/ws:\/\/localhost:(\d+)/))[1]), readFileSync(build.pairingFile, 'utf8').trim(), mock);
    const refused = await stopped.done;
    assert.equal(refused.code, 1);
    assert.match(
      refused.stderr,
      /ui\/docs\.artboard\.kdl: was not built: will not change "Docs": 1 step would remove layers, and nothing was written/,
    );
    assert.equal(mock.writes().length, writes);
  });

  it('reads --input only when an artboard file is among the files', async () => {
    const run = start(['components', 'ui/row.component.kdl', '--input', 'data/docs.json'], input(), { pairedWaitMs: 10 });
    const result = await run.done;
    assert.equal(result.code, 1);
    assert.match(result.stderr, /--input is read only when an artboard file \(<name>\.artboard\.kdl\) is among the files; none is/);
    assert.equal(existsSync(run.pairingFile), false, 'it stopped before it waited for a plugin');
  });

  it('stops on an inputs document that does not resolve, naming it, before it waits for a plugin', async () => {
    const broken = {
      ...input(),
      '/repo/data/rows.tokens.json': JSON.stringify({ rows: { $value: [{ id: 'a', label: '{ds.nowhere}' }] } }),
    };
    const run = start(['components', 'ui/docs.artboard.kdl', '--input', 'data/docs.json'], broken, { pairedWaitMs: 10 });
    const result = await run.done;
    assert.equal(result.code, 1);
    assert.match(result.stderr, /^data\/docs\.json: token "rows" does not resolve: /m);
    assert.equal(existsSync(run.pairingFile), false);
  });

  it('stops when the artboard reads an input the document does not have, with the file and line, and writes nothing', async () => {
    const mock = fileMock();
    const run = start(['components', 'ui/row.component.kdl', 'ui/docs.artboard.kdl', '--input', 'data/docs.json'], {
      ...input(),
      '/repo/ui/docs.artboard.kdl': page.replace('(input)rows', '(input)lines'),
    });
    const plugin = await pair(run, mock);
    const result = await run.done;
    assert.equal(result.code, 1);
    assert.match(result.stderr, /^ui\/docs\.artboard\.kdl:3:\d+ .*lines/m);
    assert.deepEqual(plugin.received, ['CHECK_COMPONENTS']);
    assert.equal(mock.writes().length, 0);
  });

  it('puts the artboard after the variables, the styles and every component in a sync', async () => {
    const mock = fileMock();
    const files = {
      ...input(),
      '/repo/tokens/resolver.json': resolver,
      '/repo/tokens/base.tokens.json': tokens(false),
    };
    const run = start(['sync', 'tokens/resolver.json', 'ui/docs.artboard.kdl', 'ui/row.component.kdl', '--input', 'data/docs.json'], files);
    const plugin = await pair(run, mock);
    const result = await run.done;
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.deepEqual(plugin.received, [
      'LOAD_DOCUMENT',
      'CHECK_COMPONENTS',
      'PLAN_VARIABLE_SYNC',
      'EXECUTE_VARIABLE_SYNC',
      'PLAN_STYLE_SYNC',
      'EXECUTE_STYLE_SYNC',
      'RUN_COMPONENT',
      'RUN_COMPONENT',
      'FINISH_COMPONENTS',
    ]);
    assert.deepEqual(
      plugin.commands.filter((command) => command.type === 'RUN_COMPONENT').map((command) => command.payload.fileName),
      ['ui/row.component.kdl', 'ui/docs.artboard.kdl'],
    );
  });

  it('says in its usage that there are artboard files and --input', async () => {
    for (const argv of [[], ['print']]) {
      let stderr = '';
      await main(argv, { cwd: '/repo', pairingFile: '/nowhere', readFile: () => '', stdout: () => {}, stderr: (text) => (stderr += text) });
      assert.match(stderr, /toghen-figma components <file>… \[--resolver <entry\.json>\] .*\[--input <document>\]/);
      assert.match(stderr, /toghen-figma sync <entry\.json>… <file>… .*\[--input <document>\]/);
      assert.match(stderr, /<name>\.artboard\.kdl \(a frame of instances with their properties and slots set\)/);
      assert.match(stderr, /files run in dependency order/);
    }
  });
});

describe('toghen-figma variables: the mode limit and figma.include', () => {
  useFigmaMock();

  /** A modifier of `count` contexts, `c0` the default, each setting `space.sm`; `include` lists the ones Figma gets. */
  const document = (count: number, include?: string[]) => ({
    '/repo/tokens/resolver.json': JSON.stringify({
      version: '2025-11-01',
      name: 'Tokens',
      sets: { base: { sources: [{ space: { $type: 'dimension', sm: { $value: { value: 8, unit: 'px' } } } }] } },
      modifiers: {
        hue: {
          default: 'c0',
          ...(include ? { $extensions: { 'com.toghen': { figma: { include } } } } : {}),
          contexts: Object.fromEntries(
            Array.from({ length: count }, (_, k) => [
              `c${k}`,
              [k === 0 ? {} : { space: { sm: { $value: { value: 8 + k, unit: 'px' } } } }],
            ]),
          ),
        },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/hue' }],
    }),
  });
  const modeNames = (mock: FigmaMockHandle) => mock.collection('hue')!.modes.map((m) => m.name);
  const withoutClientStorage = (mock: FigmaMockHandle) => mock.writes().filter((call) => !/clientStorage/.test(call.api)).length;
  const LIMIT = '"hue" has 14 contexts for Figma and Figma allows 10 modes per collection; keep at most 10 of them in figma.include.';

  it('stops a dry run on a modifier over the limit, exits 1, and runs nothing after it', async () => {
    const mock = createFigmaMock().install();
    const writes = withoutClientStorage(mock);
    const run = start(['variables', 'tokens/resolver.json', '--dry-run'], document(14));
    const plugin = await pair(run, mock);
    const result = await run.done;

    assert.equal(result.code, 1, result.stdout);
    assert.ok(result.stdout.includes(LIMIT), result.stdout);
    assert.match(result.stderr, /Variable sync stopped, so nothing was written and no style or component was run\./);
    assert.deepEqual(plugin.received, ['LOAD_DOCUMENT', 'PLAN_VARIABLE_SYNC']);
    assert.equal(withoutClientStorage(mock), writes);
    assert.equal(mock.collection('hue'), undefined);
  });

  it('stops a real run the same way, before its first write', async () => {
    const mock = createFigmaMock().install();
    const writes = withoutClientStorage(mock);
    const run = start(['variables', 'tokens/resolver.json'], document(14));
    const plugin = await pair(run, mock);
    const result = await run.done;

    assert.equal(result.code, 1);
    assert.ok(result.stdout.includes(LIMIT), result.stdout);
    assert.deepEqual(plugin.received, ['LOAD_DOCUMENT', 'PLAN_VARIABLE_SYNC'], 'the plan was never executed');
    assert.equal(withoutClientStorage(mock), writes);
  });

  it('syncs only the contexts the list names, and nothing else', async () => {
    const mock = createFigmaMock().install();
    const run = start(['variables', 'tokens/resolver.json'], document(14, ['c9', 'c0', 'c3']));
    await pair(run, mock);
    const result = await run.done;

    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.deepEqual(modeNames(mock), ['c0', 'c3', 'c9']);
    assert.deepEqual(Object.values(mock.variable('hue', 'space/sm')!.valuesByMode), [8, 11, 17]);
  });

  describe('a context taken out of the list', () => {
    const GONE = /the mode "c2" of collection "hue" is gone: values in it are lost, and a frame or variant pinned to it falls back to "c0"/;

    async function synced() {
      const mock = createFigmaMock().install();
      const build = start(['variables', 'tokens/resolver.json'], document(14, ['c0', 'c1', 'c2']));
      await pair(build, mock);
      assert.equal((await build.done).code, 0);
      assert.deepEqual(modeNames(mock), ['c0', 'c1', 'c2']);
      return { mock, pairingFile: build.pairingFile };
    }
    async function again(argv: string[], pairingFile: string, mock: FigmaMockHandle) {
      const run = start(argv, document(14, ['c0', 'c1']), { pairingFile, pairedWaitMs: 5000 });
      const port = Number((await run.waitFor(/ws:\/\/localhost:(\d+)/))[1]);
      const plugin = connectFakePlugin(port, readFileSync(pairingFile, 'utf8').trim(), mock);
      const result = await run.done;
      return { ...result, plugin };
    }

    it('is listed in a dry run, which writes nothing', async () => {
      const { mock, pairingFile } = await synced();
      const writes = withoutClientStorage(mock);

      const result = await again(['variables', 'tokens/resolver.json', '--dry-run'], pairingFile, mock);

      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, GONE);
      assert.equal(withoutClientStorage(mock), writes);
      assert.deepEqual(modeNames(mock), ['c0', 'c1', 'c2']);
    });

    it('stops a real run before its first write, as a context removed from the document does', async () => {
      const { mock, pairingFile } = await synced();
      const writes = withoutClientStorage(mock);

      const result = await again(['variables', 'tokens/resolver.json'], pairingFile, mock);

      assert.equal(result.code, 1);
      assert.match(
        result.stderr,
        /Variable sync will not run: 1 step would lose something in Figma, and nothing was written; pass --allow-breaking to take it/,
      );
      assert.deepEqual(result.plugin.received, ['LOAD_DOCUMENT', 'PLAN_VARIABLE_SYNC']);
      assert.equal(withoutClientStorage(mock), writes);
      assert.deepEqual(modeNames(mock), ['c0', 'c1', 'c2']);
    });

    it('deletes the mode with --allow-breaking', async () => {
      const { mock, pairingFile } = await synced();

      const result = await again(['variables', 'tokens/resolver.json', '--allow-breaking'], pairingFile, mock);

      assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
      assert.deepEqual(modeNames(mock), ['c0', 'c1']);
    });
  });
});

describe('toghen-figma sync: a font stack that Figma cannot load', () => {
  useFigmaMock();

  // `text.note` falls back to its second family, `text.mono` has none Figma lists; `text.label` is the panel's own.
  const stackTokens = JSON.stringify({
    ...base(),
    font: { family: { mono: { $type: 'fontFamily', $value: ['ui-monospace', 'Menlo Nowhere', 'monospace'] } } },
    text: {
      ...base().text,
      note: {
        $type: 'typography',
        $value: {
          fontFamily: ['Gone Sans', 'Inter'],
          fontSize: { value: 12, unit: 'px' },
          fontWeight: 400,
          lineHeight: 1.5,
          fontStyle: 'Regular',
        },
      },
      mono: {
        $type: 'typography',
        $value: {
          fontFamily: '{font.family.mono}',
          fontSize: { value: 12, unit: 'px' },
          fontWeight: 400,
          lineHeight: 1.5,
          fontStyle: 'Regular',
        },
      },
    },
  });
  const withStacks = () => ({
    ...files({ 'ui/panel.component.kdl': panel('{space.sm}') }, false),
    '/repo/tokens/base.tokens.json': stackTokens,
  });

  it('lists the notes and the skips in a dry run, before anything is written', async () => {
    const mock = fileMock();
    const run = start(['sync', 'tokens/resolver.json', 'ui/panel.component.kdl', '--dry-run'], withStacks());
    await pair(run, mock);
    const result = await run.done;

    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /warning: Tokens\.text\.note — "Tokens\.text\.note" uses "Inter": "Gone Sans" is not available in Figma\./);
    assert.match(
      result.stdout,
      /skipped: "Tokens\.text\.mono" has no family Figma can load: "ui-monospace", "Menlo Nowhere" and "monospace" are not available\./,
    );
    assert.deepEqual(mock.styles('TEXT'), []);
  });

  it('lists the variables left offered to every field as a note, not as a warning', async () => {
    const mock = fileMock();
    const withNote = {
      ...files({ 'ui/panel.component.kdl': panel('{space.sm}') }, false),
      '/repo/tokens/base.tokens.json': JSON.stringify({
        ...base(),
        label: { $type: 'string', $value: 'x' },
        chip: { opacity: { $type: 'number', $value: 0.4 } },
      }),
    };
    const run = start(['sync', 'tokens/resolver.json', 'ui/panel.component.kdl', '--dry-run'], withNote);
    await pair(run, mock);
    const result = await run.done;

    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, / {2}note: 1 variable is offered to every field: Tokens\.label; declare figma\.scopes to narrow it\./);
    assert.doesNotMatch(result.stdout, /warning: .*offered to every field/);
    assert.doesNotMatch(result.stdout, /\d+ warnings/);
    assert.deepEqual(mock.variables(), [], 'a dry run writes nothing');
  });

  it('writes the styles that can be written, tells the skip, and goes on to the component', async () => {
    const mock = fileMock();
    const run = start(['sync', 'tokens/resolver.json', 'ui/panel.component.kdl'], withStacks());
    const plugin = await pair(run, mock);
    const result = await run.done;

    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /skipped: "Tokens\.text\.mono" has no family Figma can load/);
    assert.deepEqual(
      mock
        .styles('TEXT')
        .map((s) => s.name)
        .sort(),
      ['text/label', 'text/note'],
    );
    assert.ok(plugin.received.includes('RUN_COMPONENT'), 'the component file ran');
    assert.match(result.stdout, /Panel: \d+ steps? · 1 created/);
    assert.doesNotMatch(result.stdout + result.stderr, /\[object Object\]|toghen\(/);
  });
});

describe('toghen-figma variables: --overwrite-drift', () => {
  useFigmaMock();

  /** A first sync, then a hand edit of `space.sm` in the file; each later run is another command against the paired plugin. */
  async function edited() {
    const mock = fileMock();
    const build = start(['variables', 'tokens/resolver.json'], files({}, false));
    await pair(build, mock);
    assert.equal((await build.done).code, 0);
    const variable = mock.variable('Tokens', 'space/sm')!;
    variable.valuesByMode[mock.collection('Tokens')!.modes[0].modeId] = 99;
    return { mock, variable, pairingFile: build.pairingFile };
  }

  async function again(argv: string[], pairingFile: string, mock: FigmaMockHandle) {
    const run = start(argv, files({}, false), { pairingFile, pairedWaitMs: 5000 });
    const port = Number((await run.waitFor(/ws:\/\/localhost:(\d+)/))[1]);
    const plugin = connectFakePlugin(port, readFileSync(pairingFile, 'utf8').trim(), mock);
    const result = await run.done;
    return { ...result, plugin };
  }

  const planned = (plugin: { commands: Array<{ type: string; payload: Record<string, unknown> }> }) =>
    plugin.commands.find((command) => command.type === 'PLAN_VARIABLE_SYNC')!.payload;

  it('sends nothing about drift without the flag, and leaves the edit alone', async () => {
    const { variable, pairingFile, mock } = await edited();

    const result = await again(['variables', 'tokens/resolver.json'], pairingFile, mock);

    assert.equal(result.code, 0, result.stderr);
    assert.ok(!('overwriteDrift' in planned(result.plugin)));
    assert.deepEqual(Object.values(variable.valuesByMode), [99]);
  });

  it("sends overwriteDrift to the variable plan, and the document's value is written back", async () => {
    const { variable, pairingFile, mock } = await edited();

    const result = await again(['variables', 'tokens/resolver.json', '--overwrite-drift'], pairingFile, mock);

    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(planned(result.plugin).overwriteDrift, true);
    assert.deepEqual(Object.values(variable.valuesByMode), [8]);
  });

  it('is a flag of components too, sent with each component file', async () => {
    const run = start(
      ['sync', 'tokens/resolver.json', 'ui/panel.component.kdl', '--overwrite-drift'],
      files({ 'ui/panel.component.kdl': panel('{space.sm}') }, false),
    );
    const plugin = await pair(run, fileMock());
    assert.equal((await run.done).code, 0);

    const runComponent = plugin.commands.find((command) => command.type === 'RUN_COMPONENT')!;
    assert.equal((runComponent.payload.options as { overwriteDrift?: boolean }).overwriteDrift, true);
    const without = start(['components', 'ui/panel.component.kdl', '--dry-run'], files({ 'ui/panel.component.kdl': panel() }, false));
    const quiet = await pair(without, fileMock());
    await without.done;
    assert.ok(!('overwriteDrift' in (quiet.commands.find((command) => command.type === 'RUN_COMPONENT')!.payload.options as object)));
  });
});

describe('toghen-figma: the entry, --name and --overrides', () => {
  useFigmaMock();

  const colour = (r: number, g: number, b: number) => ({ $type: 'color', $value: { colorSpace: 'srgb', components: [r, g, b] } });
  const kit = {
    '/repo/kit/base.tokens.json': JSON.stringify({
      color: { brand: colour(1, 0, 0) },
      space: { md: { $type: 'dimension', $value: { value: 16, unit: 'px' } } },
    }),
    '/repo/kit/brand.tokens.json': JSON.stringify({ color: { brand: colour(0, 0, 1) } }),
  };
  const loadCommand = (plugin: { commands: Array<{ type: string; payload: Record<string, unknown> }> }) =>
    plugin.commands.find((command) => command.type === 'LOAD_DOCUMENT')!.payload;
  const loadedPayload = (mock: FigmaMockHandle) =>
    mock
      .calls('ui.postMessage')
      .map((call) => call.args[0] as { type: string; payload: Record<string, any> })
      .filter((message) => message.type === 'DOCUMENT_LOADED')
      .at(-1)!.payload;

  it('takes several .json entries in order with --name, sends the files themselves, and prints the collision the plugin reports', async () => {
    const mock = createFigmaMock().install();
    const run = start(['variables', 'kit/base.tokens.json', 'kit/brand.tokens.json', '--name', 'Brand', '--dry-run'], kit);
    const plugin = await pair(run, mock);
    const result = await run.done;

    assert.equal(result.code, 0, result.stderr);
    const sent = loadCommand(plugin);
    assert.deepEqual(sent.entry, ['/repo/kit/base.tokens.json', '/repo/kit/brand.tokens.json']);
    assert.equal(sent.name, 'Brand');
    assert.deepEqual(
      (sent.files as Array<{ path: string }>).map((file) => file.path),
      ['/repo/kit/base.tokens.json', '/repo/kit/brand.tokens.json'],
    );
    const loaded = loadedPayload(mock);
    assert.equal(loaded.name, 'Brand');
    assert.equal(loaded.composition.form, 'tokens');
    assert.match(
      result.stdout,
      /warning: color\.brand — Given a value by "\/repo\/kit\/base\.tokens\.json", "\/repo\/kit\/brand\.tokens\.json" in set "base"; the last wins\./,
    );
    assert.match(result.stdout, /Variable plan: 3 creates/, 'the collection and two variables');
  });

  it('reads --overrides and passes the map to the load, whose reads say what it swapped', async () => {
    const mock = createFigmaMock().install();
    const resolver = JSON.stringify({
      version: '2025-11-01',
      name: 'Kit',
      sets: { base: { sources: [{ $ref: './base.tokens.json' }] } },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    });
    const map = { './base.tokens.json': './brand.tokens.json', './gone.tokens.json': './base.tokens.json' };
    const run = start(['variables', 'kit/kit.resolver.json', '--overrides', 'map.json', '--dry-run'], {
      ...kit,
      '/repo/kit/kit.resolver.json': resolver,
      '/repo/map.json': JSON.stringify(map),
    });
    const plugin = await pair(run, mock);
    const result = await run.done;

    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(loadCommand(plugin).overrides, map);
    assert.deepEqual(loadedPayload(mock).composition.reads, [
      { ref: './base.tokens.json', holder: '/repo/kit/kit.resolver.json', location: '/repo/kit/brand.tokens.json', overridden: true },
    ]);
    assert.match(result.stdout, /warning: The overrides map's key "\.\/gone\.tokens\.json" matched no reference/);
    assert.match(result.stdout, /Variable plan: 2 creates/, 'the collection and the one variable of the swapped file');
  });

  it('stops on a map that is not one JSON object, before it waits for a plugin', async () => {
    const run = start(['variables', 'kit/base.tokens.json', '--overrides', 'map.json'], { ...kit, '/repo/map.json': '["a", "b"]' });
    const result = await run.done;

    assert.equal(result.code, 1);
    assert.match(result.stderr, /^kit\/base\.tokens\.json: --overrides map\.json must hold one JSON object/);
    assert.doesNotMatch(result.stdout, /Pairing code/);
  });
});

describe('toghen-figma: the lock from the command line, two plugins on one bridge', () => {
  useFigmaMock();

  const LIBRARY = 'Toghen Test Library';
  const icon = () =>
    `component Icon\nproperties {\n    VARIANT Size small large\n}\nFRAME Icon layoutMode=HORIZONTAL itemSpacing="{space.sm}"\n`;
  const library = () => files({ 'ui/badge.component.kdl': badge('calm loud'), 'ui/icon.component.kdl': icon() }, false);

  /** The target file's lock, read in the target file. */
  const lockOf = async (target: FigmaMockHandle) => {
    target.use();
    const { loadLock } = await import('../main/utils/lockStore.js');
    return loadLock();
  };

  /** Pairs a plugin in each file, each with the code printed for its file. */
  async function pairBoth(run: Started, libraryFile: FigmaMockHandle, targetFile: FigmaMockHandle) {
    const [, libraryCode, targetCode] = await run.waitFor(
      new RegExp(`In the library file "${LIBRARY}", enter (\\S+); in the target file, enter (\\S+)\\.`),
    );
    await run.waitFor(
      /Open the Toghen plugin in each file, type the code into the Source card at the foot of its Load pane, and press Connect\./,
    );
    const port = Number((await run.waitFor(/Waiting for the plugins on ws:\/\/localhost:(\d+)/))[1]);
    return {
      port,
      libraryCode,
      targetCode,
      libraryPlugin: connectFakePlugin(port, libraryCode, libraryFile),
      targetPlugin: connectFakePlugin(port, targetCode, targetFile),
    };
  }

  it("pairs each file with its own code, builds in the library file, writes its keys into the target file's lock, and says what is not published", async () => {
    const libraryFile = createFigmaMock()
      .withFonts([{ family: 'Inter', style: 'Regular' }])
      .withCollection('Tokens', ['default'])
      .withPublishStatus('Badge', 'CHANGED')
      .withPublishStatus('Icon', 'CURRENT')
      .withPublishStatus('text/label', 'CURRENT')
      .install();
    const targetFile = createFigmaMock().install();
    const run = start(['sync', 'tokens/resolver.json', 'ui/badge.component.kdl', 'ui/icon.component.kdl', '--library', LIBRARY], library());

    const { port, libraryCode, targetCode, libraryPlugin, targetPlugin } = await pairBoth(run, libraryFile, targetFile);
    assert.notEqual(libraryCode, targetCode);
    // A wrong code is refused whichever file it was typed for, before and after a plugin paired.
    assert.equal(await connectFakePlugin(port, 'AAAA-AAAA', targetFile).closed, 4001);
    await libraryPlugin.paired;
    assert.equal(await connectFakePlugin(port, 'BBBB-BBBB', libraryFile).closed, 4001);
    await targetPlugin.paired;
    const result = await run.done;

    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Both plugins are paired\./);
    // Everything is built in the library file; the target file is only told the lock.
    assert.deepEqual(libraryPlugin.received, [
      'LOAD_DOCUMENT',
      'CHECK_COMPONENTS',
      'PLAN_VARIABLE_SYNC',
      'EXECUTE_VARIABLE_SYNC',
      'PLAN_STYLE_SYNC',
      'EXECUTE_STYLE_SYNC',
      'RUN_COMPONENT',
      'RUN_COMPONENT',
      'FINISH_COMPONENTS',
      'LIBRARY_KEYS',
    ]);
    assert.deepEqual(targetPlugin.received, ['LOCK_WRITE']);
    assert.deepEqual(targetFile.variables(), []);

    const entry = (await lockOf(targetFile)).libraries[LIBRARY];
    assert.equal(entry.by, 'build');
    assert.ok(!('fileKey' in entry), 'the library plugin read no file key, so none is written');
    assert.deepEqual(Object.keys(entry.components).sort(), ['Badge', 'Icon']);
    for (const component of Object.values(entry.components)) {
      assert.equal(component.set, true);
      assert.match(component.key, /^[0-9a-f]{40}$/);
    }
    assert.notEqual(entry.components.Badge.key, entry.components.Icon.key);
    assert.deepEqual(Object.keys(entry.styles), ['text.label']);
    assert.equal(entry.styles['text.label'].kind, 'TEXT');
    assert.deepEqual(Object.keys(entry.variables).sort(), ['Tokens/space/sm', 'Tokens/surface/page']);
    const sm = libraryFile.variable('Tokens', 'space/sm') as unknown as { key: string };
    assert.equal(entry.variables['Tokens/space/sm'], sm.key);

    assert.match(
      result.stdout,
      /"Badge" is not published as it is now \(CHANGED\): publish the library, then accept its update in the target file\./,
    );
    assert.doesNotMatch(result.stdout, /"Icon" is not published/);
    assert.doesNotMatch(result.stdout, /text style "text\/label" is not published/);
    assert.match(result.stdout, /2 variables are not published as they are now/);
    assert.match(result.stdout, new RegExp(`The lock in the target file holds "${LIBRARY}", written by the build\\.`));
    assert.doesNotMatch(result.stdout + result.stderr, /\[object Object\]/);

    // The next run finds both plugins with the codes kept for each file, and asks for none.
    const again = start(['lock', LIBRARY], library(), { pairingFile: run.pairingFile, pairedWaitMs: 5000 });
    const back = Number((await again.waitFor(/Looking for the plugins paired earlier on ws:\/\/localhost:(\d+)/))[1]);
    connectFakePlugin(back, libraryCode, libraryFile);
    connectFakePlugin(back, targetCode, targetFile);
    const second = await again.done;
    assert.equal(second.code, 0, second.stderr);
    assert.doesNotMatch(second.stdout, /enter/);
  });

  it('lock copies the keys with no build, as the command line, with the file key where the library plugin reads one', async () => {
    const libraryFile = createFigmaMock()
      .withFonts([{ family: 'Inter', style: 'Regular' }])
      .withCollection('Tokens', ['default'])
      .withFileKey('LIBRARYFILEKEY01')
      .install();
    // The library's sets, built earlier by a plain run in the library file.
    const build = start(['components', 'ui/badge.component.kdl'], library());
    await pair(build, libraryFile);
    assert.equal((await build.done).code, 0);

    const targetFile = createFigmaMock().install();
    const run = start(['lock', LIBRARY], library());
    const { libraryPlugin, targetPlugin } = await pairBoth(run, libraryFile, targetFile);
    const result = await run.done;

    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.deepEqual(libraryPlugin.received, ['LIBRARY_KEYS']);
    assert.deepEqual(targetPlugin.received, ['LOCK_WRITE']);
    const entry = (await lockOf(targetFile)).libraries[LIBRARY];
    assert.equal(entry.by, 'command line');
    assert.equal(entry.fileKey, 'LIBRARYFILEKEY01');
    assert.deepEqual(Object.keys(entry.components), ['Badge']);
    // Nothing in a file nobody published reads CURRENT.
    assert.match(result.stdout, /"Badge" is not published as it is now \(UNPUBLISHED\)/);
  });

  it("replaces the library's entry whole, and leaves every other library's", async () => {
    const libraryFile = createFigmaMock().install();
    const targetFile = createFigmaMock().install();
    const { saveLock } = await import('../main/utils/lockStore.js');
    saveLock({
      libraries: {
        [LIBRARY]: { by: 'person', components: { Gone: { key: 'a'.repeat(40), set: true } }, styles: {}, variables: {} },
        'Other Test Library': { by: 'discovery', components: {}, styles: {}, variables: { 'Tokens/space/sm': 'b'.repeat(40) } },
      },
    });
    const run = start(['lock', LIBRARY], library());
    await pairBoth(run, libraryFile, targetFile);
    assert.equal((await run.done).code, 0);

    const lock = await lockOf(targetFile);
    assert.deepEqual(lock.libraries[LIBRARY], { by: 'command line', components: {}, styles: {}, variables: {} });
    assert.equal(lock.libraries['Other Test Library'].variables['Tokens/space/sm'], 'b'.repeat(40));
  });

  it('a dry run reads the keys and writes no lock', async () => {
    const libraryFile = createFigmaMock()
      .withFonts([{ family: 'Inter', style: 'Regular' }])
      .withCollection('Tokens', ['default'])
      .install();
    const targetFile = createFigmaMock().install();
    const run = start(['components', 'ui/badge.component.kdl', '--dry-run', '--library', LIBRARY], library());
    const { targetPlugin } = await pairBoth(run, libraryFile, targetFile);
    const result = await run.done;

    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.deepEqual(targetPlugin.received, []);
    assert.match(result.stdout, /Dry run: the lock in the target file was not written\./);
    assert.deepEqual((await lockOf(targetFile)).libraries, {});
  });

  it('--use declares a library for the files run into the target, through its lock; without it, nothing changes', async () => {
    const targetFile = createFigmaMock().install();
    const { saveLock } = await import('../main/utils/lockStore.js');
    saveLock({
      libraries: { [LIBRARY]: { by: 'build', components: { Badge: { key: 'c'.repeat(40), set: true } }, styles: {}, variables: {} } },
    });
    const holder = {
      'ui/holder.component.kdl': 'component Holder\nFRAME Holder layoutMode=HORIZONTAL {\n    INSTANCE Glyph component=Badge\n}\n',
    };

    const plain = start(['components', 'ui/holder.component.kdl', '--dry-run'], files(holder, false));
    await pair(plain, targetFile);
    const without = await plain.done;
    assert.equal(without.code, 1);
    assert.match(without.stderr, /component "Badge" \(line 3\) is not in this file/);

    const using = start(
      ['components', 'ui/holder.component.kdl', '--dry-run', '--use', LIBRARY, '--use', 'Other Test Library'],
      files(holder, false),
      { pairingFile: plain.pairingFile, pairedWaitMs: 5000 },
    );
    const back = Number((await using.waitFor(/Looking for the plugin paired earlier on ws:\/\/localhost:(\d+)/))[1]);
    connectFakePlugin(back, (await import('node:fs')).readFileSync(plain.pairingFile, 'utf8').trim(), targetFile);
    const result = await using.done;
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(
      result.stdout,
      new RegExp(`pending: component "Badge" \\(line 3\\): would import the component set "Badge" from library "${LIBRARY}"`),
    );
    assert.match(result.stdout, /library "Other Test Library" is declared, and the lock holds nothing for it/);
  });

  it('refuses --use beside --library', async () => {
    const result = await start(['components', 'ui/badge.component.kdl', '--library', LIBRARY, '--use', LIBRARY], library()).done;
    assert.equal(result.code, 1);
    assert.match(result.stderr, /^--use and --library do not go together/);
  });

  it('with --figcraft, --library takes a .figcraft file on this machine, refusing a name or a share link before it connects', async () => {
    const named = await start(['variables', 'tokens/resolver.json', '--figcraft', '4000', '--library', LIBRARY], library()).done;
    assert.equal(named.code, 1);
    assert.match(named.stderr, /^--library takes the library's \.figcraft file with --figcraft or --figcraft-file; got /);
    const linked = await start(
      ['variables', 'tokens/resolver.json', '--figcraft', '4000', '--library', 'ws://127.0.0.1:47900/f/abc'],
      library(),
    ).done;
    assert.equal(linked.code, 1);
    assert.match(linked.stderr, /names a team library on a figcraft-server, which reaches outside this machine and is not built/);
    assert.doesNotMatch(named.stdout + linked.stdout, /enter|Pairing code|Nothing answered/);
  });

  it("lock takes the library's name and nothing else", async () => {
    const result = await start(['lock'], {}).done;
    assert.equal(result.code, 1);
    assert.match(result.stderr, /^lock takes the library's name/);
  });
});

describe('toghen-figma: skips by cause, and --verbose', () => {
  useFigmaMock();

  // Twelve dimensions Figma cannot hold (a two-value padding, reached through an untyped token), and a shadow whose
  // colour mixes `currentColor`, which no style can hold (reached the same way: the load refuses it written in place);
  // the rest in the W3C structured shapes.
  const shadow = {
    color: 'color-mix(in srgb, currentColor 5%, transparent)',
    offsetX: { value: 0, unit: 'px' },
    offsetY: { value: 2, unit: 'px' },
    blur: { value: 8, unit: 'px' },
    spread: { value: 0, unit: 'px' },
  };
  const awkward = JSON.stringify({
    ...base(),
    raw: { pad: { $value: '8px 13px' }, shadow: { $value: shadow } },
    pad: { $type: 'dimension', ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`p${i}`, { $value: '{raw.pad}' }])) },
    effects: { $type: 'shadow', raised: { $value: '{raw.shadow}' } },
  });
  const awkwardFiles = (components: Record<string, string> = {}) => ({
    ...files(components, false),
    '/repo/tokens/base.tokens.json': awkward,
  });

  /** Runs again into the same file, with the plugin paired by `first`. */
  async function again(argv: string[], given: Record<string, string>, first: Started, mock: FigmaMockHandle) {
    const run = start(argv, given, { pairingFile: first.pairingFile, pairedWaitMs: 5000 });
    connectFakePlugin(Number((await run.waitFor(/ws:\/\/localhost:(\d+)/))[1]), readFileSync(first.pairingFile, 'utf8').trim(), mock);
    return run.done;
  }

  it("counts a plan's skips by cause, and lists ten rows of each problem cause, then how many more", async () => {
    const mock = fileMock();
    const run = start(['variables', 'tokens/resolver.json', '--dry-run'], awkwardFiles());
    await pair(run, mock);
    const result = await run.done;

    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /^Variable plan: \d+ creates · \d+ updates · 14 skips \(12 cannot be written · 2 unsupported type\)$/m);
    const written = result.stdout.match(/^ {2}skipped: "Tokens\.pad\.p\d+" cannot be written in .+$/gm) ?? [];
    assert.equal(written.length, 10, result.stdout);
    assert.match(result.stdout, /^ {2}skipped: "Tokens\.raw\.pad": unsupported token type none$/m);
    // The counts are whole; only the list is cut (R12).
    assert.match(result.stdout, /^ {2}…and 2 more; --verbose lists them$/m);

    // The shadow that cannot be built says so, with its cause, the token, the mode and the reason.
    assert.match(result.stdout, /^Style plan: 1 creates · 0 updates · 3 skips \(2 unsupported type · 1 cannot be built\)$/m);
    assert.match(result.stdout, /^ {2}skipped: "Tokens\.effects\.raised" cannot be built in default: .+$/m);
    // Ruling 11b: neither plan has a row for the other's tokens.
    assert.doesNotMatch(result.stdout, /handled in|sync phase/);
    assert.doesNotMatch(result.stdout, /\[object Object\]/);
  });

  it('--verbose lists every skip, the unchanged ones too', async () => {
    const mock = fileMock();
    const first = start(['variables', 'tokens/resolver.json'], awkwardFiles());
    await pair(first, mock);
    const synced = await first.done;
    assert.equal(synced.code, 0, `${synced.stdout}\n${synced.stderr}`);

    const quiet = await again(['variables', 'tokens/resolver.json', '--dry-run'], awkwardFiles(), first, mock);
    assert.match(
      quiet.stdout,
      /^Variable plan: 0 creates · 0 updates · 16 skips \(12 cannot be written · 2 unchanged · 2 unsupported type\)$/m,
    );
    assert.doesNotMatch(quiet.stdout, /unchanged: /, 'unchanged is counted, not listed');

    const verbose = await again(['variables', 'tokens/resolver.json', '--dry-run', '--verbose'], awkwardFiles(), first, mock);
    assert.equal(verbose.code, 0, `${verbose.stdout}\n${verbose.stderr}`);
    assert.equal((verbose.stdout.match(/^ {2}skipped: "Tokens\.pad\.p\d+" cannot be written in .+$/gm) ?? []).length, 12);
    assert.doesNotMatch(verbose.stdout, /…and \d+ more/);
    assert.match(verbose.stdout, /^ {2}unchanged: Tokens\.space\.sm$/m);
    assert.match(verbose.stdout, /^ {2}unchanged: Tokens\.text\.label$/m);
  });

  it('a dry run of a set says how many members it would update, and --verbose lists each patch', async () => {
    const mock = fileMock();
    const first = start(
      ['sync', 'tokens/resolver.json', 'ui/panel.component.kdl'],
      files({ 'ui/panel.component.kdl': panel('{space.sm}') }, true),
    );
    await pair(first, mock);
    assert.equal((await first.done).code, 0);
    const writes = mock.writes().length;

    // The panel now spaces its heading with `space.xl`: one member, patched.
    const changed = files({ 'ui/panel.component.kdl': panel('{space.xl}') }, true);
    const dry = await again(
      ['components', 'ui/panel.component.kdl', '--resolver', 'tokens/resolver.json', '--dry-run', '--verbose'],
      changed,
      first,
      mock,
    );
    assert.equal(dry.code, 0, `${dry.stdout}\n${dry.stderr}`);
    assert.match(dry.stdout, /^Panel \(dry run\): \d+ steps? · 0 created · 1 would update · 0 deleted$/m);
    assert.match(dry.stdout, /^ {2}patch Panel Panel: .+$/m);
    assert.deepEqual(
      mock
        .writes()
        .slice(writes)
        .map((call) => call.api)
        .filter((api) => !/clientStorage/.test(api)),
      [],
      'a dry run writes nothing',
    );

    // A real run counts what it updated, as before.
    const real = await again(['components', 'ui/panel.component.kdl', '--resolver', 'tokens/resolver.json'], changed, first, mock);
    assert.equal(real.code, 0, `${real.stdout}\n${real.stderr}`);
    assert.match(real.stdout, /^Panel: \d+ steps? · 0 created · 1 updated · 0 deleted$/m);
    assert.doesNotMatch(real.stdout, /patch Panel/, 'without --verbose, no patch lines');
  });
});

describe('toghen-figma sync: files that nest each other (#131)', () => {
  useFigmaMock();

  // Stage nests Chip, sets a property on it and is typed first.
  const stage = `component Stage
FRAME Stage layoutMode=VERTICAL itemSpacing="{space.sm}" {
    INSTANCE First component=Chip {
        set Tone=hot
    }
    INSTANCE Second component=Chip
}
`;
  const chip = badge('hot cold').replace(/Badge/g, 'Chip');
  const nested = { 'ui/stage.component.kdl': stage, 'ui/chip.component.kdl': chip };
  const argv = ['sync', 'tokens/resolver.json', 'ui/stage.component.kdl', 'ui/chip.component.kdl'];

  it('a first dry run counts the set an earlier file would create, and says once that its instances are checked when it is built', async () => {
    const mock = fileMock();
    const run = start([...argv, '--dry-run'], files(nested, false));
    const plugin = await pair(run, mock);
    const result = await run.done;

    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.doesNotMatch(result.stdout + result.stderr, /not in this file/);
    // The file it nests runs first, whatever the typed order.
    const ran = plugin.commands.filter((command) => command.type === 'RUN_COMPONENT').map((command) => command.payload.fileName);
    assert.deepEqual(ran, ['ui/chip.component.kdl', 'ui/stage.component.kdl']);
    assert.deepEqual(result.stdout.match(/pending: component "Chip".*/g), [
      'pending: component "Chip" (line 3): a file earlier in this run would create it; the properties and slots of instances of "Chip" are checked when it is built',
    ]);
    // Only a file after the one that would create the set is told of it.
    const told = plugin.commands
      .filter((command) => command.type === 'RUN_COMPONENT')
      .map((command) => (command.payload.options as RunOptions).pending?.components);
    assert.deepEqual(told, [undefined, ['Chip']]);
  });

  it('a real run of the same typed order builds the nested set first, then the set that nests it', async () => {
    const mock = fileMock();
    const run = start(argv, files(nested, false));
    const plugin = await pair(run, mock);
    const result = await run.done;

    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Chip: .* · 2 created/);
    assert.match(result.stdout, /Stage: .* · 1 created/);
    assert.ok(
      plugin.commands
        .filter((command) => command.type === 'RUN_COMPONENT')
        .every((command) => (command.payload.options as RunOptions).pending === undefined),
      'a real run carries no pending names',
    );
  });

  it('still stops on an instance of a component that neither exists nor is created earlier in the run', async () => {
    const mock = fileMock();
    const run = start(
      ['sync', 'tokens/resolver.json', 'ui/stage.component.kdl', '--dry-run'],
      files({ 'ui/stage.component.kdl': stage }, false),
    );
    await pair(run, mock);
    const result = await run.done;
    assert.equal(result.code, 1);
    assert.match(result.stderr, /component "Chip" \(line 3\) is not in this file/);
  });

  it('refuses files that nest each other in a cycle, naming them, before anything is written', async () => {
    const mock = fileMock();
    const loop = {
      'ui/stage.component.kdl': stage,
      'ui/chip.component.kdl': 'component Chip\nFRAME Chip layoutMode=VERTICAL {\n    INSTANCE Back component=Stage\n}\n',
    };
    const run = start(argv, files(loop, false));
    const plugin = await pair(run, mock);
    const result = await run.done;
    assert.equal(result.code, 1);
    assert.match(
      result.stderr,
      /in a cycle, so none of them can be built first: ui\/stage\.component\.kdl → ui\/chip\.component\.kdl → ui\/stage\.component\.kdl; nothing was written/,
    );
    assert.ok(!plugin.received.includes('PLAN_VARIABLE_SYNC'));
  });
});
