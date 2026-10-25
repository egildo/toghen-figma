/**
 * The relink: an instance whose component's name the lock now sends to a library's key is swapped, one
 * `SWAP_COMPONENT` row per instance, in a set's members and in an artboard. The library is synthetic, as the mock's
 * library block holds one (a real library file, published: measured behaviour §7, §15); no tokens are named.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, useFigmaMock, type FigmaMockHandle, type MockLibrary } from './support/figmaMock.js';
import { run } from '../main/components/run.js';
import { summarize } from '../main/components/file.js';
import { saveLock } from '../main/utils/lockStore.js';
import { readComponentFile } from '../shared/components/index.js';
import type { Desired, RunOptions, Step } from '../shared/components/index.js';
import { byAddress } from './components/support.js';

type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const ICON_KEY = 'c0'.padStart(40, 'a');
const CORE: MockLibrary = { name: 'Core', components: [{ name: 'Icon', key: ICON_KEY }] };
const declared: RunOptions = { libraries: ['Core'] };

const BADGE = `component Badge
properties {
    VARIANT Tone calm loud
}
FRAME Badge layoutMode=HORIZONTAL {
    INSTANCE Glyph component=Icon
}
`;

const BOARD = `artboard Board
FRAME Board layoutMode=VERTICAL {
    INSTANCE Glyph component=Icon
}
`;

const desiredFrom = (text: string): Desired => {
  const file = readComponentFile(text);
  assert.deepEqual(
    file.problems.filter((p) => p.severity === 'error'),
    [],
    text,
  );
  return JSON.parse(
    JSON.stringify({ component: file.component, members: file.members, ...(file.artboard ? { artboard: true } : {}) }),
  ) as Desired;
};

const figmaOf = (): any => (globalThis as { figma?: unknown }).figma; // eslint-disable-line @typescript-eslint/no-explicit-any
const swaps = (steps: Step[]) => steps.filter((step): step is Extract<Step, { kind: 'SWAP_COMPONENT' }> => step.kind === 'SWAP_COMPONENT');
const changes = (steps: Step[]) => steps.filter((step) => step.kind !== 'LEAVE' && step.kind !== 'RELAYOUT');

/** A file built against its own `Icon`, which a person then renames, and a lock that sends `Icon` to the library's. */
async function builtLocally(text: string, more?: MockLibrary): Promise<{ mock: FigmaMockHandle; setId: string }> {
  const builder = createFigmaMock().withComponent('Icon').withLibrary(CORE);
  const mock = (more ? builder.withLibrary(more) : builder).install();
  const first = await run(desiredFrom(text));
  const [local] = figmaOf()
    .root.children[0].findAllWithCriteria({ types: ['COMPONENT'] })
    .filter((node: Node) => node.name === 'Icon');
  // A name found both here and in a declared library stops the build: the file's own goes out of the way.
  local.name = 'Icon (old)';
  assert.deepEqual(
    saveLock({ libraries: { Core: { by: 'person', components: { Icon: { key: ICON_KEY, set: false } }, styles: {}, variables: {} } } }),
    { ok: true },
  );
  return { mock, setId: first.setId! };
}

describe('the relink', () => {
  useFigmaMock();

  it('plans one SWAP_COMPONENT per instance, in two members, and swaps and stamps them on a real run', async () => {
    const { mock, setId } = await builtLocally(BADGE);

    const plan = await run(desiredFrom(BADGE), { ...declared, dryRun: true });
    const planned = swaps(plan.steps);
    assert.deepEqual(
      planned.map((step) => [step.member, step.address, step.from, step.to, step.library, step.fromLibrary]),
      [
        ['Tone=calm', 'Glyph', 'Icon (old)', 'Icon', 'Core', undefined],
        ['Tone=loud', 'Glyph', 'Icon (old)', 'Icon', 'Core', undefined],
      ],
    );
    // The swap is its own row: no patch carries the component.
    assert.ok(!plan.steps.some((step) => step.kind === 'PATCH_LAYER' && step.fields.includes('component')));
    assert.equal(
      summarize(planned[0]).message,
      '"Glyph" in "Badge/Tone=calm" swaps from "Icon (old)" (this file) to "Icon" from library "Core"',
    );
    // A dry run imports nothing, and says what it would.
    assert.deepEqual(
      mock.writes().filter((call) => call.api.startsWith('import')),
      [],
    );
    assert.ok(
      plan.pending.includes('component "Icon" (line 6): would import the component "Icon" from library "Core"'),
      plan.pending.join('\n'),
    );

    const real = await run(desiredFrom(BADGE), declared);
    assert.equal(swaps(real.steps).length, 2);
    assert.deepEqual(real.updated.sort(), ['Tone=calm', 'Tone=loud']);
    for (const member of (mock.node(setId) as Node).children) {
      const glyph = byAddress(member).get('Glyph');
      assert.equal((await glyph.getMainComponentAsync()).key, ICON_KEY);
    }

    // The receipt holds the library's component now: the next run plans nothing, real or dry.
    assert.deepEqual(changes((await run(desiredFrom(BADGE), declared)).steps), []);
    assert.deepEqual(changes((await run(desiredFrom(BADGE), { ...declared, dryRun: true })).steps), []);
  });

  it('names the library a swapped-from component came from, where the lock holds its key', async () => {
    // The file moves to a second library, whose Icon has another key.
    const moved = 'c1'.padStart(40, 'a');
    await builtLocally(BADGE, { name: 'Core 2', components: [{ name: 'Icon', key: moved }] });
    await run(desiredFrom(BADGE), declared);
    assert.deepEqual(
      saveLock({
        libraries: {
          Core: { by: 'person', components: { Icon: { key: ICON_KEY, set: false } }, styles: {}, variables: {} },
          'Core 2': { by: 'person', components: { Icon: { key: moved, set: false } }, styles: {}, variables: {} },
        },
      }),
      { ok: true },
    );
    const plan = await run(desiredFrom(BADGE), { libraries: ['Core 2'], dryRun: true });
    assert.equal(
      summarize(swaps(plan.steps)[0]).message,
      '"Glyph" in "Badge/Tone=calm" swaps from "Icon" from library "Core" to "Icon" from library "Core 2"',
    );
  });

  it('plans nothing when nothing changed', async () => {
    createFigmaMock().withComponent('Icon').install();
    await run(desiredFrom(BADGE));
    assert.deepEqual(changes((await run(desiredFrom(BADGE))).steps), []);
    assert.deepEqual(changes((await run(desiredFrom(BADGE), { dryRun: true })).steps), []);
  });

  it('swaps an artboard’s instance the same way', async () => {
    const { mock, setId } = await builtLocally(BOARD);
    const plan = await run(desiredFrom(BOARD), { ...declared, dryRun: true });
    assert.deepEqual(
      swaps(plan.steps).map((step) => summarize(step).message),
      ['"Glyph" in "Board" swaps from "Icon (old)" (this file) to "Icon" from library "Core"'],
    );
    assert.deepEqual(
      mock.writes().filter((call) => call.api.startsWith('import')),
      [],
    );

    const real = await run(desiredFrom(BOARD), declared);
    assert.deepEqual(real.updated, ['Glyph']);
    assert.equal(
      (
        await byAddress(mock.node(setId) as Node)
          .get('Glyph')
          .getMainComponentAsync()
      ).key,
      ICON_KEY,
    );
    assert.deepEqual(changes((await run(desiredFrom(BOARD), declared)).steps), []);
  });
});
