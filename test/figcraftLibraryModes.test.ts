/**
 * A `modes` pin on a collection a `--use` library holds, into FigCraft: found through the lock's variable ids, pinned
 * with `library.setVariableMode`, and compared on the next run from what the run recorded. Synthetic libraries with a
 * `tone` collection (modes `rest`, `error`) and a `ground` collection, in W3C structured colours.
 */

import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main, type Io } from '../cli/main.js';
import { libraryCommand } from './support/fakeLibraries.js';
import { startFakeFigcraft, type FakeFigcraft } from './support/fakeFigcraft.js';

const here = dirname(fileURLToPath(import.meta.url));

async function command(argv: string[], files: Record<string, string>) {
  let stdout = '';
  let stderr = '';
  const io: Io = {
    cwd: here,
    readFile: (path) => files[path] ?? readFileSync(path, 'utf8'),
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
    pairingFile: join(here, 'never-written'),
  };
  return { code: await main(argv, io), stdout, stderr };
}

/** The id the lock in the target keeps for a library: its record on the divider, sharded as in Figma. */
function libraryId(fake: FakeFigcraft, name: string): string {
  const page = fake.tabs[0].pages.find((candidate) => candidate.pluginData?.toghen)!;
  const root = JSON.parse(page.pluginData!.toghen).root;
  const { shards } = JSON.parse(root['toghen/lock']) as { shards: number };
  return JSON.parse(Array.from({ length: shards }, (_, i) => root[`toghen/lock.${i}`]).join('')).libraries[name].id;
}

const folder = mkdtempSync(join(tmpdir(), 'toghen-library-modes-'));
after(() => rmSync(folder, { recursive: true, force: true }));

const color = (r: number, g: number, b: number) => ({ type: 'color', value: { colorSpace: 'srgb', components: [r, g, b], alpha: 1 } });

/** A library file holding `collections`, each with one colour variable, published and saved at `<name>.figcraft`. */
function library(fake: FakeFigcraft, name: string, collections: Record<string, string[]>): string {
  const path = join(folder, `${name}.figcraft`);
  const file = {
    name,
    path,
    collections: Object.entries(collections).map(([collection, modes], i) => ({
      id: `VariableCollectionId:${i + 1}`,
      name: collection,
      modes: modes.map((mode, m) => ({ id: `VariableCollectionId:${i + 1}/mode${m + 1}`, name: mode })),
    })),
    variables: Object.entries(collections).map(([, modes], i) => ({
      id: `VariableID:${i + 1}`,
      name: 'accent',
      collection: `VariableCollectionId:${i + 1}`,
      resolvedType: 'COLOR',
      values: Object.fromEntries(modes.map((_, m) => [`VariableCollectionId:${i + 1}/mode${m + 1}`, color(m / 2, 0.2, 0.4)])),
    })),
    styles: [],
    pages: [{ id: 1, name: 'Page 1', current: true }],
  };
  libraryCommand({ disk: fake.disk, newId: () => 0, applyStyle: () => {} }, file, 'library.publish', {});
  fake.disk.set(path, JSON.parse(JSON.stringify(file)));
  return path;
}

const STAGE = join(folder, 'stage.artboard.kdl');
const stage = (pin: string) => `artboard Stage

FRAME Stage layoutMode=VERTICAL {
    modes ${pin}
    FRAME Inner layoutMode=VERTICAL
}
`;
const CHIP = join(folder, 'chip.component.kdl');
const chip = `component Chip

FRAME Chip layoutMode=HORIZONTAL {
    FRAME Dot {
        modes tone=error
    }
}
`;

const run = (fake: FakeFigcraft, file: string, text: string, uses: string[], flags: string[] = []) => {
  fake.active = 0;
  return command(
    [
      'components',
      file,
      '--resolver',
      'fixtures/sample.resolver.json',
      '--figcraft',
      String(fake.port),
      ...uses.flatMap((use) => ['--use', use]),
      ...flags,
    ],
    { [file]: text },
  );
};

const nodes = (fake: FakeFigcraft) => {
  const all: Array<Record<string, any>> = [];
  const walk = (list: Array<Record<string, any>>) =>
    list.forEach((node) => {
      all.push(node);
      walk(node.children ?? []);
    });
  fake.tabs[0].pages.forEach((page) => {
    walk(page.children ?? []);
  });
  return all;
};

describe("a library collection's mode, into FigCraft", () => {
  it('pins an artboard to it with library.setVariableMode, and a second run writes nothing', async () => {
    const fake = await startFakeFigcraft(['app']);
    try {
      const tones = library(fake, 'tones', { tone: ['rest', 'error'], ground: ['plain'] });
      // The lock first, so the dry run has the library's variables to look in.
      assert.equal((await command(['lock', tones, '--figcraft', String(fake.port)], {})).code, 0);
      const dry = await run(fake, STAGE, stage('tone=error'), [tones], ['--dry-run']);
      assert.equal(dry.code, 0, dry.stdout + dry.stderr);
      assert.ok(!fake.tabs[0].collections.length, 'a dry run copies nothing in');

      const first = await run(fake, STAGE, stage('tone=error'), [tones]);
      assert.equal(first.code, 0, first.stdout + first.stderr);
      assert.match(first.stdout, /Stage: 1 step · \d+ created/);
      const id = libraryId(fake, 'tones');
      const copied = fake.tabs[0].collections.find((collection) => collection.name === 'tone')!;
      assert.equal(copied.id, `${id}:VariableCollectionId:1`, "the library's collection, copied in");
      const frame = nodes(fake).find((node) => node.name === 'Stage')!;
      assert.deepEqual(frame.hidden.modes, { [copied.id]: 'VariableCollectionId:1/mode2' }, 'pinned to "error"');
      assert.deepEqual(JSON.parse(frame.pluginData['toghen.unreported']).modes, { 'library:tones/tone': 'error' });

      const labels = fake.labels.length;
      const second = await run(fake, STAGE, stage('tone=error'), [tones]);
      assert.equal(second.code, 0, second.stdout + second.stderr);
      assert.match(second.stdout, /Stage: \d+ steps? · 0 created · 0 updated · 0 deleted/);
      assert.ok(!fake.labels.slice(labels).some((label) => /^(Build|Update) /.test(label)), fake.labels.slice(labels).join(', '));

      // Another mode is a change the next run writes.
      const third = await run(fake, STAGE, stage('tone=rest'), [tones]);
      assert.equal(third.code, 0, third.stdout + third.stderr);
      assert.match(third.stdout, /Stage: 1 step · 0 created · 1 updated/);
      assert.deepEqual(nodes(fake).find((node) => node.name === 'Stage')!.hidden.modes, { [copied.id]: 'VariableCollectionId:1/mode1' });
    } finally {
      await fake.close();
    }
  });

  it('pins a layer of a component file to it, and a second run writes nothing', async () => {
    const fake = await startFakeFigcraft(['app']);
    try {
      const tones = library(fake, 'tones', { tone: ['rest', 'error'], ground: ['plain'] });
      const first = await run(fake, CHIP, chip, [tones]);
      assert.equal(first.code, 0, first.stdout + first.stderr);
      const id = libraryId(fake, 'tones');
      const dot = nodes(fake).find((node) => node.name === 'Dot')!;
      assert.deepEqual(dot.hidden.modes, { [`${id}:VariableCollectionId:1`]: 'VariableCollectionId:1/mode2' });

      const second = await run(fake, CHIP, chip, [tones]);
      assert.equal(second.code, 0, second.stdout + second.stderr);
      assert.match(second.stdout, /Chip: \d+ steps? · 0 created · 0 updated · 0 deleted/);
    } finally {
      await fake.close();
    }
  });

  it('refuses a collection in this file and in a library, naming both, and writes nothing', async () => {
    const fake = await startFakeFigcraft(['app']);
    try {
      const tones = library(fake, 'tones', { tone: ['rest', 'error'] });
      fake.tabs[0].collections.push({
        id: 'VariableCollectionId:1',
        name: 'tone',
        modes: [{ id: 'VariableCollectionId:1/mode1', name: 'error' }],
      });
      const result = await run(fake, STAGE, stage('tone=error'), [tones]);
      assert.equal(result.code, 1);
      assert.match(
        result.stderr,
        /modes tone=error \(line 4\): the collection "tone" is in this file and in library "tones": a name found in both stops the build/,
      );
      assert.ok(!nodes(fake).some((node) => node.name === 'Stage'));
    } finally {
      await fake.close();
    }
  });

  it('refuses a collection two libraries hold, naming both', async () => {
    const fake = await startFakeFigcraft(['app']);
    try {
      const tones = library(fake, 'tones', { tone: ['rest', 'error'] });
      const hues = library(fake, 'hues', { tone: ['rest', 'error'], ground: ['plain'] });
      const result = await run(fake, STAGE, stage('tone=error'), [tones, hues]);
      assert.equal(result.code, 1);
      assert.match(
        result.stderr,
        /modes tone=error \(line 4\): the collection "tone" is in libraries "tones" and "hues": a name found in two stops the build/,
      );
    } finally {
      await fake.close();
    }
  });

  it('names where it looked for a collection nobody holds', async () => {
    const fake = await startFakeFigcraft(['app']);
    try {
      const tones = library(fake, 'tones', { tone: ['rest', 'error'], ground: ['plain'] });
      fake.tabs[0].collections.push({
        id: 'VariableCollectionId:1',
        name: 'surface',
        modes: [{ id: 'VariableCollectionId:1/mode1', name: 'base' }],
      });
      const result = await run(fake, STAGE, stage('shade=dark'), [tones]);
      assert.equal(result.code, 1);
      assert.match(
        result.stderr,
        /modes shade=dark \(line 4\): no local variable collection named "shade" \(this file has "surface"\), and library "tones" holds none/,
      );
    } finally {
      await fake.close();
    }
  });

  it("reports FigCraft's own error for a mode the library's collection does not have, and writes nothing", async () => {
    const fake = await startFakeFigcraft(['app']);
    try {
      const tones = library(fake, 'tones', { tone: ['rest', 'error'] });
      const result = await run(fake, STAGE, stage('tone=loud'), [tones]);
      assert.equal(result.code, 1);
      assert.match(
        result.stderr,
        /stage\.artboard\.kdl: was not built: .*the collection "tone" has no mode "loud"; this batch pinned a library collection's mode at modes tone=loud \(line 4\)/,
      );
      assert.ok(!nodes(fake).some((node) => node.name === 'Stage'));
    } finally {
      await fake.close();
    }
  });
});
