import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../../cli/main.js';

describe('toghen-figma: its arguments', () => {
  const run = async (argv: string[]) => {
    const out = { stdout: '', stderr: '' };
    const code = await main(argv, {
      cwd: '/repo',
      pairingFile: '/nowhere',
      readFile: () => '',
      stdout: (text) => (out.stdout += text),
      stderr: (text) => (out.stderr += text),
    });
    return { code, ...out };
  };

  it('names a command, and knows only the three', async () => {
    for (const [argv, message] of [
      [[], /no command given/],
      [['print'], /unknown command print/],
    ] as const) {
      const result = await run([...argv]);
      assert.equal(result.code, 1);
      assert.match(result.stderr, message);
      assert.match(result.stderr, /usage: toghen-figma variables <entry\.json>…/);
    }
  });

  it('prints the usage for --help, and exits 0', async () => {
    for (const flag of ['--help', '-h']) {
      const result = await run([flag]);
      assert.equal(result.code, 0);
      assert.match(result.stdout, /^usage: toghen-figma variables <entry\.json>…/);
      assert.equal(result.stderr, '');
    }
  });

  it('asks each command for what it needs, and refuses what belongs to another', async () => {
    for (const [argv, message] of [
      [['variables'], /no entry given: a resolver document or token files/],
      [['variables', 'r.json', 'a.component.kdl'], /variables takes the entry and nothing else/],
      [['variables', 'r.json', '--page', 'P'], /unknown option --page for variables/],
      [['sync', 'r.json'], /no component file given; variables syncs the tokens alone/],
      [['sync', 'r.json', 'a.kdl', '--collection'], /--collection needs a value/],
      [['components'], /no component file given/],
      [['components', 'r.json', 'a.kdl'], /components takes the design system with --resolver; r\.json is not a component file/],
      [['check', 'r.json', 'a.kdl', '--name'], /--name needs a value/],
      [['components', 'a.kdl', '--collection', 'X'], /unknown option --collection for components/],
      // The printed scripts are gone: their flags are options no command knows.
      [['components', 'a.kdl', '--print'], /unknown option --print for components/],
      [['components', 'a.kdl', '--stored'], /unknown option --stored for components/],
      [['components', 'a.kdl', '--out', 'd'], /unknown option --out for components/],
      [['components', '--engine'], /unknown option --engine for components/],
      [['components', 'a.kdl', '--page'], /--page needs a value/],
    ] as const) {
      const result = await run([...argv]);
      assert.equal(result.code, 1, argv.join(' '));
      assert.match(result.stderr, message);
    }
  });
});

describe('the command', () => {
  it('runs when reached through a symlink, as a linked package is', () => {
    const dir = mkdtempSync(join(tmpdir(), 'toghen-cli-'));
    const link = join(dir, 'toghen-figma');
    symlinkSync(fileURLToPath(new URL('../../cli/bin.mjs', import.meta.url)), link);
    // A file that is not there stops the run before it waits for a plugin: the command ran, and read from disk.
    const run = spawnSync(process.execPath, [link, 'components', 'missing.component.kdl'], {
      encoding: 'utf8',
      env: { ...process.env, INIT_CWD: dir },
    });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /^missing\.component\.kdl cannot be read: /m);
    assert.equal(run.stdout, '');
  });

  it('reads paths from the directory it runs in, not the one a package manager was started in', () => {
    // A script that changes directory first: `cd design && toghen-figma check …`, which pnpm starts with INIT_CWD at the root.
    const root = mkdtempSync(join(tmpdir(), 'toghen-cwd-'));
    const design = join(root, 'design');
    mkdirSync(design);
    writeFileSync(
      join(design, 'base.tokens.json'),
      JSON.stringify({ surface: { $type: 'color', $value: { colorSpace: 'srgb', components: [0.96, 0.97, 1] } } }),
    );
    writeFileSync(
      join(design, 'ds.resolver.json'),
      JSON.stringify({
        version: '2025-11-01',
        name: 'Tokens',
        sets: { base: { sources: [{ $ref: './base.tokens.json' }] } },
        resolutionOrder: [{ $ref: '#/sets/base' }],
      }),
    );
    writeFileSync(join(design, 'card.component.kdl'), 'component Card\n\nFRAME Card layoutMode=VERTICAL {\n    fills "{surface}"\n}\n');
    const run = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('../../cli/bin.mjs', import.meta.url)), 'check', 'ds.resolver.json', 'card.component.kdl'],
      { encoding: 'utf8', cwd: design, env: { ...process.env, INIT_CWD: root } },
    );
    assert.equal(run.status, 0, run.stderr);
  });
});
