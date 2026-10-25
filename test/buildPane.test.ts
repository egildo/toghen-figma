/**
 * What the Build pane asks of the main thread: a kept blueprint's needs looked up by the locator's dry pass
 * (`LOOK_UP_NEEDS`), and a relink planned by a dry build of every kept file (`PLAN_RELINK`). Neither imports or
 * writes anything. The libraries are synthetic, as the mock holds them; no token is named.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, useFigmaMock, type FigmaMockHandle, type MockLibrary } from './support/figmaMock.js';
import { run } from '../main/components/run.js';
import { LOOK_UP_NEEDS, PLAN_RELINK } from '../main/handlers/templates.js';
import { saveLock } from '../main/utils/lockStore.js';
import { saveTemplates } from '../main/utils/templateStore.js';
import { resetState, setState } from '../main/runtimeState.js';
import { readComponentFile } from '../shared/components/index.js';
import type { Desired } from '../shared/components/index.js';
import type { NeedsPayload, PlanPayload, Response } from '../shared/protocol.js';

type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const key = (n: number): string => n.toString(16).padStart(40, 'a');
const ICON_KEY = key(1);
const PIN_KEY = key(2);
const CORE: MockLibrary = {
  name: 'Core',
  components: [
    { name: 'Icon', key: ICON_KEY },
    { name: 'Pin', key: PIN_KEY },
  ],
};

const BADGE_BODY = `component Badge {
    properties {
        VARIANT Tone calm loud
    }
    FRAME Badge layoutMode=HORIZONTAL {
        INSTANCE Glyph component=Icon
    }
}
`;

const TAG_BODY = `component Tag {
    FRAME Tag layoutMode=HORIZONTAL {
        INSTANCE Mark component=Dot
        INSTANCE Place component=Pin
        INSTANCE Gone component=Missing
        INSTANCE Inner component=Badge
    }
}
`;

const blueprint = (...bodies: string[]): string =>
  `page Buttons\n\ntokens "tokens/ds.resolver.json"\nlibrary Core\nlibrary "Toghen Test Library"\n\n${bodies.join('\n')}`;

/** The component file Badge was built from, before the file moved to the library. */
const BADGE_FILE = `component Badge
properties {
    VARIANT Tone calm loud
}
FRAME Badge layoutMode=HORIZONTAL {
    INSTANCE Glyph component=Icon
}
`;

const figmaOf = (): any => (globalThis as { figma?: unknown }).figma; // eslint-disable-line @typescript-eslint/no-explicit-any
const posted = (mock: FigmaMockHandle) => mock.calls('ui.postMessage').map((call) => call.args[0] as Response);

/** Badge built against the file's own Icon, which a person then renames; the lock sends Icon and Pin to Core. */
async function builtLocally(): Promise<FigmaMockHandle> {
  const mock = createFigmaMock().withComponent('Icon').withComponent('Dot').withLibrary(CORE).install();
  const file = readComponentFile(BADGE_FILE);
  await run(JSON.parse(JSON.stringify({ component: file.component, members: file.members })) as Desired);
  const [local] = figmaOf()
    .root.children[0].findAllWithCriteria({ types: ['COMPONENT'] })
    .filter((node: Node) => node.name === 'Icon');
  local.name = 'Icon (old)';
  const components = { Icon: { key: ICON_KEY, set: false }, Pin: { key: PIN_KEY, set: false } };
  assert.deepEqual(saveLock({ libraries: { Core: { by: 'person', components, styles: {}, variables: {} } } }), { ok: true });
  return mock;
}

const keep = (text: string) =>
  assert.deepEqual(saveTemplates([{ name: 'Buttons', fileName: 'buttons.blueprint.kdl', text, kept: '2026-10-22T09:00:00.000Z' }]), {
    ok: true,
  });

describe('the Build pane, from the main thread', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  it('looks up a blueprint’s needs: found, from the lock, would swap, missing, and satisfied by itself', async () => {
    const mock = await builtLocally();
    keep(blueprint(BADGE_BODY, TAG_BODY));
    setState({ composition: { form: 'resolver', entry: 'ds.resolver.json', reads: [] } });
    const writes = mock.writes().length;

    await LOOK_UP_NEEDS({ name: 'Buttons' });

    const message = posted(mock).at(-1)!;
    assert.equal(message.type, 'NEEDS');
    const needs = message.payload as NeedsPayload;
    assert.equal(needs.name, 'Buttons');
    assert.ok(!Number.isNaN(Date.parse(needs.lookedAt)));
    // Held against what Load loaded, by the entry's file name.
    assert.equal(needs.tokens?.state, 'loaded');
    assert.deepEqual(needs.libraries, [
      { name: 'Core', state: 'in the lock', by: 'person' },
      { name: 'Toghen Test Library', state: 'missing' },
    ]);
    assert.deepEqual(
      needs.components.map((need) => [need.name, need.state, need.library]),
      [
        ['Icon', 'would swap', 'Core'],
        ['Dot', 'found', undefined],
        ['Pin', 'from a library', 'Core'],
        ['Missing', 'missing', undefined],
        ['Badge', 'satisfied', undefined],
      ],
    );
    assert.equal(needs.components[0].detail, '2 stamped instances show another component now');
    // Tag names a component nothing holds, so its dry pass stops, and the look says what it could not answer.
    assert.equal(needs.notes.length, 1);
    assert.match(needs.notes[0], /^buttons\.blueprint\.kdl, component "Tag" could not be planned/);

    // A look imports nothing and writes nothing.
    assert.equal(mock.writes().length, writes);
  });

  it('says the tokens differ, or are not loaded, without reading a file', async () => {
    const mock = await builtLocally();
    keep(blueprint(BADGE_BODY));
    await LOOK_UP_NEEDS({ name: 'Buttons' });
    assert.equal((posted(mock).at(-1)!.payload as NeedsPayload).tokens?.state, 'not loaded');

    setState({ composition: { form: 'tokens', entry: ['base.tokens.json'], reads: [] } });
    await LOOK_UP_NEEDS({ name: 'Buttons' });
    const tokens = (posted(mock).at(-1)!.payload as NeedsPayload).tokens!;
    assert.deepEqual([tokens.state, tokens.detail], ['differs', 'the loaded document is base.tokens.json']);
  });

  it('plans a relink: one row per swap, a line for the library they import from, and nothing imported', async () => {
    const mock = await builtLocally();
    keep(blueprint(BADGE_BODY));
    const writes = mock.writes().length;

    await PLAN_RELINK();

    const message = posted(mock).at(-1)!;
    assert.equal(message.type, 'PLAN_READY');
    const plan = message.payload as PlanPayload;
    assert.equal(plan.planType, 'relink');
    assert.deepEqual(
      plan.operations.map((op) => [op.kind, 'message' in op ? op.message : '']),
      [
        ['SWAP_COMPONENT', '"Glyph" in "Badge/Tone=calm" swaps from "Icon (old)" (this file) to "Icon" from library "Core"'],
        ['SWAP_COMPONENT', '"Glyph" in "Badge/Tone=loud" swaps from "Icon (old)" (this file) to "Icon" from library "Core"'],
        [
          'NOTE',
          '2 swaps import from library "Core" by key, which needs the library published and its update accepted in this file; the plugin cannot see whether it is. If the build says a key did not import, publish the library, then accept its update here.',
        ],
      ],
    );
    assert.deepEqual(plan.summary, { swaps: 2, libraries: 1, stopped: 0 });
    assert.deepEqual(
      mock.writes().filter((call) => call.api.startsWith('import')),
      [],
    );
    assert.equal(mock.writes().length, writes);
  });

  it('says when nothing would swap, and a file it could not plan is a row of its own', async () => {
    const mock = await builtLocally();
    keep(blueprint(TAG_BODY));
    await PLAN_RELINK();
    const plan = posted(mock).at(-1)!.payload as PlanPayload;
    assert.deepEqual(
      plan.operations.map((op) => op.kind),
      ['NOTE', 'WARNING'],
    );
    assert.equal(
      plan.operations[0].kind === 'NOTE' && plan.operations[0].message,
      'In the files that could be planned, no stamped instance would swap to another component.',
    );
  });
});
