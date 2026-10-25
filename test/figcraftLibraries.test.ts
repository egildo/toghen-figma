/**
 * Libraries in FigCraft, end to end against the fake: a run with `--library <file.figcraft>` builds in the library
 * file, publishes and saves it, enables it in the target, accepts its updates there and writes the target's lock; `lock`
 * does the target's half. Live (`--figcraft`) and headless (`--figcraft-file`). Synthetic component files on the sample
 * design system (W3C structured colours and dimensions).
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main, type Io } from '../cli/main.js';
import { lockedFrom } from '../cli/figcraftLibrary.js';
import type { Lock } from '../shared/protocol.js';
import { startFakeFigcraft, type FakeFigcraft } from './support/fakeFigcraft.js';

const here = dirname(fileURLToPath(import.meta.url));
const COMPONENTS = ['fixtures/figcraft/icon.component.kdl', 'fixtures/figcraft/button.component.kdl'];
const folder = mkdtempSync(join(tmpdir(), 'toghen-libraries-'));
const LIBRARY = join(folder, 'ds.figcraft');

export async function command(argv: string[], files: Record<string, string> = {}) {
  let stdout = '';
  let stderr = '';
  const io: Io = {
    cwd: here,
    readFile: (path) => files[path] ?? readFileSync(path, 'utf8'),
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
    pairingFile: join(here, 'never-written'),
  };
  const code = await main(argv, io);
  return { code, stdout, stderr };
}

/** The lock a FigCraft file keeps, in its record on the divider: the root's shared plugin data, sharded as in Figma. */
export function lockIn(fake: FakeFigcraft, index: number): Lock {
  const page = fake.tabs[index].pages.find((candidate) => candidate.pluginData?.toghen);
  const root = page ? (JSON.parse(page.pluginData!.toghen).root ?? {}) : {};
  const head = root['toghen/lock'];
  if (!head) return { libraries: {} };
  const { shards } = JSON.parse(head) as { shards: number };
  return JSON.parse(Array.from({ length: shards }, (_, i) => root[`toghen/lock.${i}`]).join(''));
}

const libraryTab = (fake: FakeFigcraft): number => fake.tabs.findIndex((tab) => tab.path === LIBRARY);

after(() => rmSync(folder, { recursive: true, force: true }));

describe('a library run into FigCraft', () => {
  it("turns the listing of a library into the lock's entry, keyed in FigCraft's form", () => {
    const entry = lockedFrom(
      {
        id: '00000000000000a1',
        name: 'ds',
        components: [{ id: 5, name: 'Badge', set: true }],
        styles: [
          { id: 'S:1', name: 'text/label', type: 'text' },
          { id: 'S:2', name: 'grid/base', type: 'grid' },
        ],
        collections: [{ id: 'VariableCollectionId:1', name: 'Tokens' }],
        variables: [{ id: 'VariableID:3', name: 'color/accent', collection: 'VariableCollectionId:1' }],
      },
      '/work/ds.figcraft',
      'build',
    );
    assert.deepEqual(entry, {
      path: '/work/ds.figcraft',
      id: '00000000000000a1',
      by: 'build',
      components: { Badge: { key: '00000000000000a1:5', set: true } },
      styles: { 'text.label': { key: '00000000000000a1:S:1', kind: 'TEXT' } },
      variables: { 'Tokens/color/accent': '00000000000000a1:VariableID:3' },
    });
  });

  it('builds in the library, publishes and saves it, then enables it in the target, accepts its updates and writes the lock', async () => {
    const fake = await startFakeFigcraft(['target']);
    try {
      const sync = (flags: string[] = [], files = COMPONENTS) =>
        command(['sync', 'fixtures/sample.resolver.json', ...files, '--figcraft', String(fake.port), '--library', LIBRARY, ...flags]);

      // A dry run first: the library does not exist yet, and nothing is left behind. (A dry run of Button would stop on
      // the Icon the dry run did not make, as in Figma.)
      const dry = await sync(['--dry-run'], COMPONENTS.slice(0, 1));
      assert.equal(dry.code, 0, dry.stdout + dry.stderr);
      assert.match(dry.stdout, /Building the library .*ds\.figcraft, a new file\./);
      assert.match(dry.stdout, /is not enabled in "target"; a run would enable it/);
      assert.equal(fake.tabs.length, 1, 'the file the dry run made is closed');
      assert.equal(fake.disk.size, 0);

      const first = await sync();
      assert.equal(first.code, 0, first.stderr);
      assert.match(first.stdout, /Button: 1 step · 2 created/);
      assert.match(first.stdout, /Published the library .*ds\.figcraft as version 1, and saved it\./);
      assert.match(first.stdout, /Enabled .*ds\.figcraft in "target", with no update to accept\./);
      assert.match(
        first.stdout,
        /The lock in "target" holds "ds" \(.*ds\.figcraft\), written by the build: 2 components · \d+ styles · \d+ variables\./,
      );
      const at = libraryTab(fake);
      assert.ok(at > 0, 'the library is a tab of its own, left open');
      assert.ok(
        fake.tabs[0].pages.every((page) => !page.children?.some((node) => node.type === 'COMPONENT_SET')),
        'nothing built in the target',
      );
      const lock = lockIn(fake, 0);
      const entry = lock.libraries.ds;
      assert.equal(entry.path, LIBRARY);
      assert.match(entry.id!, /^[0-9a-f]{16}$/);
      assert.deepEqual(Object.keys(entry.components).sort(), ['Button', 'Icon']);
      assert.match(entry.components.Button.key, new RegExp(`^${entry.id}:\\d+$`));
      assert.ok(Object.values(entry.variables).every((key) => key.startsWith(`${entry.id}:VariableID:`)));

      // A second run: nothing to build, nothing to publish (FigCraft refuses it, and the run goes on), the same lock.
      const second = await sync();
      assert.equal(second.code, 0, second.stderr);
      assert.match(second.stdout, /Button: \d+ steps? · 0 created · 0 updated · 0 deleted/);
      assert.match(second.stdout, /is already published as version 1: nothing to publish\./);
      assert.doesNotMatch(second.stdout, /as version 2/);
      assert.match(second.stdout, /with no update to accept/);
      assert.deepEqual(lockIn(fake, 0), lock);
    } finally {
      await fake.close();
    }
  });

  it('writes nothing in either file when the build in the library does not complete', async () => {
    const fake = await startFakeFigcraft(['target']);
    try {
      fake.refuse = 'component.combineVariants';
      const result = await command([
        'sync',
        'fixtures/sample.resolver.json',
        ...COMPONENTS,
        '--figcraft',
        String(fake.port),
        '--library',
        join(folder, 'broken.figcraft'),
      ]);
      assert.equal(result.code, 1);
      assert.match(result.stderr, /The library was not published and the lock in the target was not written/);
      assert.equal(fake.disk.size, 0, 'nothing saved');
      assert.deepEqual(lockIn(fake, 0).libraries, {});
      assert.ok(!(fake.tabs[0].libraries ?? []).length, 'not enabled');
    } finally {
      await fake.close();
    }
  });

  it('lock enables a library published by hand, accepts its updates and writes the lock, building nothing', async () => {
    const fake = await startFakeFigcraft(['target']);
    try {
      assert.equal(
        (await command(['sync', 'fixtures/sample.resolver.json', ...COMPONENTS, '--figcraft', String(fake.port), '--library', LIBRARY]))
          .code,
        0,
      );
      fake.tabs[0].libraries = [];
      fake.tabs[0].pages = fake.tabs[0].pages.filter((page) => !page.pluginData?.toghen);
      const labels = fake.labels.length;
      const dry = await command(['lock', LIBRARY, '--figcraft', String(fake.port), '--dry-run']);
      assert.equal(dry.code, 0, dry.stderr);
      assert.match(dry.stdout, /is not enabled in "target"/);
      assert.ok(!fake.tabs[0].libraries.length);
      const locked = await command(['lock', LIBRARY, '--figcraft', String(fake.port)]);
      assert.equal(locked.code, 0, locked.stderr);
      assert.match(locked.stdout, /written by the command line/);
      assert.equal(lockIn(fake, 0).libraries.ds.by, 'command line');
      assert.ok(!fake.labels.slice(labels).some((label) => /Publish/.test(label)), 'nothing published');
    } finally {
      await fake.close();
    }
  });

  it('refuses a target that is the library itself', async () => {
    const fake = await startFakeFigcraft(['ds']);
    fake.tabs[0].path = LIBRARY;
    try {
      const result = await command([
        'sync',
        'fixtures/sample.resolver.json',
        ...COMPONENTS,
        '--figcraft',
        String(fake.port),
        '--library',
        LIBRARY,
      ]);
      assert.equal(result.code, 1);
      assert.match(result.stderr, /The target is the library .* itself/);
    } finally {
      await fake.close();
    }
  });
});

describe('a run that uses a library in FigCraft', () => {
  const library = join(folder, 'kit.figcraft');
  const GALLERY = join(folder, 'gallery.artboard.kdl');
  const gallery = `artboard Gallery

FRAME Gallery layoutMode=VERTICAL layoutSizingHorizontal=HUG layoutSizingVertical=HUG itemSpacing="{spacing.md}" {
    fills "{color.bg.surface}"
    TEXT Title characters=(literal)"Library" textStyle="{typo.body}"
    INSTANCE Primary component=Button {
        set Label="Go" Size=large
    }
    INSTANCE Glyph component=Icon
}
`;
  const build = (fake: FakeFigcraft, files: Record<string, string> = {}) => {
    fake.active = 0;
    return command(['sync', 'fixtures/sample.resolver.json', ...COMPONENTS, '--figcraft', String(fake.port), '--library', library], files);
  };
  const use = (fake: FakeFigcraft, flags: string[] = []) => {
    fake.active = 0;
    return command(
      ['components', GALLERY, '--resolver', 'fixtures/sample.resolver.json', '--figcraft', String(fake.port), '--use', library, ...flags],
      { [GALLERY]: gallery },
    );
  };
  const frameOf = (fake: FakeFigcraft) =>
    fake.tabs[0].pages.flatMap((page) => page.children ?? []).find((node) => node.name === 'Gallery')!;

  it("builds the target from the library's components, variables and styles, plans nothing on a second run, and leaves the library's stamps alone", async () => {
    const fake = await startFakeFigcraft(['app']);
    try {
      assert.equal((await build(fake)).code, 0);
      const dry = await use(fake, ['--dry-run']);
      assert.equal(dry.code, 0, dry.stdout + dry.stderr);
      assert.match(dry.stdout, /pending: component "Button" \(line 6\): would import the component set "Button" from library "kit"/);
      assert.match(dry.stdout, /pending: token \{color\.bg\.surface\} \(line 4\): would import .* from library "kit"/);
      assert.ok(!(fake.tabs[0].copies ?? []).length, 'a dry run imports nothing');

      const first = await use(fake);
      assert.equal(first.code, 0, first.stdout + first.stderr);
      assert.match(first.stdout, /Using .*kit\.figcraft: the lock in "app" holds "kit", 2 components/);
      assert.match(first.stdout, /Gallery: 1 step · \d+ created/);
      const frame = frameOf(fake);
      const id = lockIn(fake, 0).libraries.kit.id!;
      assert.match(
        frame.boundVariables?.fill ?? frame.boundVariables?.['fills/0/color'],
        new RegExp(`^${id}:VariableID:`),
        "bound to the library's variable",
      );
      const title = frame.children!.find((node) => node.name === 'Title')!;
      assert.match(title.styles.text, new RegExp(`^${id}:S:`), "the library's text style");
      const copies = new Set(
        (fake.tabs[0].copies ?? []).flatMap((copy) => [copy.id, ...(copy.children ?? []).map((child: { id: number }) => child.id)]),
      );
      for (const name of ['Primary', 'Glyph'])
        assert.ok(
          copies.has(frame.children!.find((node) => node.name === name)!.mainComponent),
          `${name} is an instance of a library copy`,
        );
      assert.ok(
        !fake.tabs[0].pages.flatMap((page) => page.children ?? []).some((node) => node.type === 'COMPONENT_SET'),
        "no set of the target's own",
      );

      const second = await use(fake);
      assert.equal(second.code, 0, second.stdout + second.stderr);
      assert.match(second.stdout, /Gallery: \d+ steps? · 0 created · 0 updated · 0 deleted/);
      assert.doesNotMatch(second.stdout + second.stderr, /\[object Object\]|foreign|drift/);
    } finally {
      await fake.close();
    }
  });

  it("offers a library's component as a preferred value, named by name", async () => {
    const fake = await startFakeFigcraft(['app']);
    const HOLDER = join(folder, 'holder.component.kdl');
    const holder = `component Holder
properties {
    INSTANCE_SWAP Mark default=Icon {
        preferred COMPONENT_SET name="Icon"
    }
}
FRAME Holder layoutMode=HORIZONTAL {
    INSTANCE Glyph component=(property)Mark
}
`;
    const run = () => {
      fake.active = 0;
      return command(
        ['components', HOLDER, '--resolver', 'fixtures/sample.resolver.json', '--figcraft', String(fake.port), '--use', library],
        { [HOLDER]: holder },
      );
    };
    try {
      assert.equal((await build(fake)).code, 0);
      const first = await run();
      assert.equal(first.code, 0, first.stdout + first.stderr);
      const set = fake.tabs[0].pages
        .flatMap((page) => page.children ?? [])
        .find((node) => node.type === 'COMPONENT_SET' && node.name === 'Holder')!;
      const icon = fake.tabs[0].copies!.find((copy) => copy.name === 'Icon')!;
      assert.deepEqual(set.children![0].componentPropertyDefinitions.Mark.preferred, [icon.id], "the library copy's id");
      const labels = fake.labels.length;
      const second = await run();
      assert.equal(second.code, 0, second.stdout + second.stderr);
      // An instance swap's default is set again on every run (before this round too); its preferred values are not.
      assert.ok(fake.labels.slice(labels).every((label) => !/preferred/i.test(label)));
      assert.deepEqual(set.children![0].componentPropertyDefinitions.Mark.preferred, [icon.id]);
    } finally {
      await fake.close();
    }
  });

  it("relinks Toghen's instances when the library makes a component again, in a dry run and a real one, and leaves a person's", async () => {
    const fake = await startFakeFigcraft(['app']);
    try {
      assert.equal((await build(fake)).code, 0);
      assert.equal((await use(fake)).code, 0);
      // A person places an instance of the same copy.
      const glyph = JSON.parse(JSON.stringify(frameOf(fake).children!.find((node) => node.name === 'Glyph')!));
      const theirs = { ...JSON.parse(JSON.stringify(glyph)), id: 9000, name: 'Theirs', pluginData: {} };
      fake.tabs[0].pages[0].children!.push(theirs);

      // The library's Icon is deleted and made again: another asset, under the same name.
      const at = fake.tabs.findIndex((tab) => tab.path === library);
      fake.tabs[at].pages[0].children = fake.tabs[at].pages[0].children!.filter((node) => node.name !== 'Icon');
      const remade = await build(fake);
      assert.equal(remade.code, 0, remade.stdout + remade.stderr);

      const dry = await use(fake, ['--dry-run']);
      assert.equal(dry.code, 0, dry.stdout + dry.stderr);
      // The dry run imports nothing: the key the lock now holds is held against the one the instance's copy came from.
      assert.match(dry.stdout, /\n {2}swap Glyph\n/);
      const relink = await use(fake);
      assert.equal(relink.code, 0, relink.stdout + relink.stderr);
      assert.match(relink.stdout, /Gallery: 1 step · 0 created · 1 updated · 0 deleted\n {2}swap Glyph\n/);
      const after = frameOf(fake).children!.find((node) => node.name === 'Glyph')!;
      assert.notEqual(after.mainComponent, glyph.mainComponent, 'swapped to the new copy');
      assert.equal(after.id, glyph.id, 'in place');
      assert.equal(
        fake.tabs[0].pages[0].children!.find((node) => node.name === 'Theirs')!.mainComponent,
        glyph.mainComponent,
        "a person's instance is left",
      );
      const third = await use(fake);
      assert.match(third.stdout, /Gallery: \d+ steps? · 0 created · 0 updated · 0 deleted/);
    } finally {
      await fake.close();
    }
  });
});

describe('a library run headless', () => {
  const target = join(folder, 'app.figcraft');
  const log = join(folder, 'calls.jsonl');
  let fake: FakeFigcraft;
  before(async () => {
    process.env.FIGCRAFT_CLI = join(here, 'support', 'fakeFigcraftCli.mjs');
    process.env.FAKE_FIGCRAFT_LOG = log;
    delete process.env.FAKE_FIGCRAFT_VERSION;
    fake = await startFakeFigcraft(['Untitled', 'app']);
    fake.tabs[1].path = target;
    process.env.FAKE_FIGCRAFT_PORT = String(fake.port);
    writeFileSync(target, '');
  });
  after(async () => {
    await fake.close();
  });

  it('opens both files in one session, publishes and saves the library, and saves the target last, with its lock', async () => {
    const library = join(folder, 'headless-ds.figcraft');
    const result = await command(['sync', 'fixtures/sample.resolver.json', ...COMPONENTS, '--figcraft-file', target, '--library', library]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Published the library .*headless-ds\.figcraft as version 1/);
    assert.match(result.stdout, /The lock in "app" holds "headless-ds"/);
    const calls = existsSync(log)
      ? readFileSync(log, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
      : [];
    assert.deepEqual(calls.at(-1), { tool: 'save_file', arguments: { path: target } });
    assert.ok(fake.disk.has(library), 'the library saved at its path');
    const index = fake.tabs.findIndex((tab) => tab.path === target);
    assert.equal(lockIn(fake, index).libraries['headless-ds'].path, library);
    const again = await command(['sync', 'fixtures/sample.resolver.json', ...COMPONENTS, '--figcraft-file', target, '--library', library]);
    assert.equal(again.code, 0, again.stderr);
    assert.match(again.stdout, /Button: \d+ steps? · 0 created · 0 updated · 0 deleted/);
    assert.match(again.stdout, /is already published as version 1: nothing to publish\./);
    assert.match(again.stdout, /The lock in "app" holds "headless-ds"/);
  });

  it('builds a file that uses the library headless, saves it, and plans nothing on a second run', async () => {
    const library = join(folder, 'headless-ds.figcraft');
    const shelf = join(folder, 'shelf.artboard.kdl');
    const text =
      'artboard Shelf\n\nFRAME Shelf layoutMode=VERTICAL itemSpacing="{spacing.md}" {\n    fills "{color.bg.surface}"\n    INSTANCE Primary component=Button\n}\n';
    const use = () =>
      command(['components', shelf, '--resolver', 'fixtures/sample.resolver.json', '--figcraft-file', target, '--use', library], {
        [shelf]: text,
      });
    // Run alone, this test builds the library the one before it builds.
    if (!fake.disk.has(library))
      assert.equal(
        (await command(['sync', 'fixtures/sample.resolver.json', ...COMPONENTS, '--figcraft-file', target, '--library', library])).code,
        0,
      );
    const first = await use();
    assert.equal(first.code, 0, first.stdout + first.stderr);
    assert.match(first.stdout, /Shelf: 1 step · 2 created/);
    assert.match(first.stdout, /Saved /);
    const second = await use();
    assert.equal(second.code, 0, second.stdout + second.stderr);
    assert.match(second.stdout, /Shelf: \d+ steps? · 0 created · 0 updated · 0 deleted/);
  });
});
