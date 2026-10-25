/**
 * Parts, folded into modes or left as one variable each.
 *
 * A subgroup whose key is in the parts vocabulary is a part. Per component, per axis, the sync either folds
 * it (a collection named after the axis, a mode per part, the cell from the part token else the rest token) or
 * leaves it in the path (one variable per part), and says which, and why not. Synthetic documents in the W3C
 * structured shapes (`{colorSpace,components}`, `{value,unit}`); what a run leaves in the mock file is read back.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver, type ResolverDocument } from '@toghen/lib';
import { VariableSyncEngine } from '../main/engines/variableSyncEngine.js';
import { LOAD_DOCUMENT } from '../main/handlers/loadDocument.js';
import { oneFile } from './support/oneFile.js';
import { PLAN_VARIABLE_SYNC } from '../main/handlers/planVariableSync.js';
import { EXECUTE_VARIABLE_SYNC } from '../main/handlers/executeVariableSync.js';
import { CHECK_COMPONENTS } from '../main/handlers/runComponent.js';
import { INSPECT_CORRESPONDENCE } from '../main/handlers/inspectCorrespondence.js';
import { getState, resetState } from '../main/runtimeState.js';
import { buildDocumentStatePayload } from '../main/utils/buildPayloads.js';
import type { InspectionPayload } from '../shared/protocol.js';
import { defaultTokenTypeMap } from '../shared/tokenTypeMap.js';
import { createFigmaMock, useFigmaMock, type FigmaMockHandle } from './support/figmaMock.js';

const px = (value: number) => ({ value, unit: 'px' });
const srgb = (...components: number[]) => ({ colorSpace: 'srgb', components });
// As Figma holds a colour it was given: every channel float32.
const rgba = (r: number, g: number, b: number) => ({ r: Math.fround(r), g: Math.fround(g), b: Math.fround(b), a: 1 });
const color = (...components: number[]) => ({ $type: 'color', $value: srgb(...components) });

const VOCABULARY = {
  'com.toghen': {
    css: {
      parts: {
        pointer: { hover: ':hover', pressed: ':active' },
        variant: { primary: "[data-variant='primary']", quiet: "[data-variant='quiet']" },
        enabled: { disabled: ':disabled' },
      },
    },
  },
};

/** A document whose `ui` group carries the vocabulary, with `groups` under it and `modifiers` beside. */
function document(groups: Record<string, unknown>, modifiers: Record<string, unknown> = {}, order: string[] = []) {
  return {
    version: '2025-11-01',
    name: 'Demo',
    sets: { base: { sources: [{ ui: { $extensions: VOCABULARY, ...groups } }] } },
    modifiers,
    resolutionOrder: [{ $ref: '#/sets/base' }, ...order.map((name) => ({ $ref: `#/modifiers/${name}` }))],
  } as unknown as ResolverDocument;
}

/**
 * - `chip`: a rest and two pointer parts; a radius with none.
 * - `button`: pointer parts and a disabled part, over one rest: two axes folding independently, a chain.
 * - `card`: `primary` and `primary.hover` over a rest and a hover: the cross-axis token.
 * - `tag`: a hover part with no rest to fall back to.
 */
const GROUPS = {
  chip: {
    background: color(0.9, 0.9, 0.9),
    radius: { $type: 'dimension', $value: px(6) },
    hover: { background: color(0.8, 0.8, 0.8) },
    pressed: { background: color(0.7, 0.7, 0.7) },
  },
  button: { background: color(0.9, 0.9, 0.9), hover: { background: color(0.8, 0.8, 0.8) }, disabled: { background: color(0.5, 0.5, 0.5) } },
  card: {
    background: color(1, 1, 1),
    hover: { background: color(0.95, 0.95, 0.95) },
    primary: { background: color(0, 0, 1), hover: { background: color(0, 0, 0.9) } },
  },
  tag: { radius: { $type: 'dimension', $value: px(2) }, hover: { background: color(0.4, 0.4, 0.4) } },
};

const sync = async (doc: ResolverDocument, files: { fileName: string; text: string }[] = []) => {
  await LOAD_DOCUMENT(oneFile(JSON.stringify(doc)));
  if (files.length > 0) await CHECK_COMPONENTS({ files });
  await PLAN_VARIABLE_SYNC({});
  const operations = getState().lastPlan!;
  await EXECUTE_VARIABLE_SYNC();
  return operations;
};

const where = (mock: FigmaMockHandle, name: string) =>
  mock
    .variables()
    .filter((variable) => variable.name === name)
    .map((variable) => mock.collections().find((collection) => collection.id === variable.variableCollectionId)!.name);
const collections = (mock: FigmaMockHandle) =>
  mock.collections().map((collection) => [collection.name, collection.modes.map((mode) => mode.name)]);
const warnings = (operations: { kind: string; message?: string }[]) =>
  operations.filter((op) => op.kind === 'WARNING').map((op) => op.message);

describe('a component whose parts are on one axis', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  it('folds them into a collection named after the axis: rest first, a mode per part', async () => {
    const mock = createFigmaMock().install();
    await sync(document({ chip: GROUPS.chip }));

    assert.deepEqual(collections(mock), [
      ['Demo', ['default']],
      ['pointer', ['rest', 'hover', 'pressed']],
    ]);
  });

  it("says in the document's payload which collection an axis made, so the screen can name it (smell #44)", () => {
    const theme = {
      contexts: { light: [{ ui: { chip: { border: color(0, 0, 0) } } }], dark: [{ ui: { chip: { border: color(1, 1, 1) } } }] },
      default: 'light',
    };
    const payload = buildDocumentStatePayload(new Resolver(document({ chip: GROUPS.chip }, { theme }, ['theme'])));

    assert.deepEqual(
      payload.collections?.map(({ name, modifier, axis, modes }) => ({ name, modifier, axis, modes })),
      [
        { name: 'Demo', modifier: undefined, axis: undefined, modes: ['default'] },
        { name: 'theme', modifier: 'theme', axis: undefined, modes: ['light', 'dark'] },
        { name: 'pointer', modifier: undefined, axis: true, modes: ['rest', 'hover', 'pressed'] },
      ],
    );
  });

  it('strips the part from the name, takes each cell from the part token, and makes no variable for a part', async () => {
    const mock = createFigmaMock().install();
    await sync(document({ chip: GROUPS.chip }));

    assert.deepEqual(where(mock, 'ui/chip/background'), ['pointer']);
    assert.deepEqual(where(mock, 'ui/chip/radius'), ['Demo'], 'a token with no part stays in the base collection');
    assert.deepEqual(where(mock, 'ui/chip/hover/background'), []);
    assert.equal(mock.variables().length, 2);
    assert.deepEqual(mock.valueFor('pointer', 'ui/chip/background', 'rest'), rgba(0.9, 0.9, 0.9));
    assert.deepEqual(mock.valueFor('pointer', 'ui/chip/background', 'hover'), rgba(0.8, 0.8, 0.8));
    assert.deepEqual(mock.valueFor('pointer', 'ui/chip/background', 'pressed'), rgba(0.7, 0.7, 0.7));
    assert.equal(mock.variable('pointer', 'ui/chip/background')!.codeSyntax.WEB, 'var(--ui-chip-background)');
  });

  it('falls back to the rest token where a mode has no part token of its own', async () => {
    const mock = createFigmaMock().install();
    // `chip` has both parts; `pill` only hover, so its pressed cell is its rest.
    await sync(document({ chip: GROUPS.chip, pill: { background: color(0.2, 0.2, 0.2), hover: { background: color(0.3, 0.3, 0.3) } } }));

    assert.deepEqual(
      collections(mock)[1],
      ['pointer', ['rest', 'hover', 'pressed']],
      'one collection, shared by the components that fold the axis',
    );
    assert.deepEqual(mock.valueFor('pointer', 'ui/pill/background', 'hover'), rgba(0.3, 0.3, 0.3));
    assert.deepEqual(mock.valueFor('pointer', 'ui/pill/background', 'pressed'), rgba(0.2, 0.2, 0.2));
  });

  it('says nothing when every axis folded, and leaves nothing to do the second time', async () => {
    const mock = createFigmaMock().install();
    const operations = await sync(document({ chip: GROUPS.chip }));
    assert.deepEqual(warnings(operations), []);

    await PLAN_VARIABLE_SYNC({});
    assert.deepEqual(
      getState().lastPlan!.filter((op) => op.kind !== 'SKIP'),
      [],
    );
    assert.equal(mock.variables().length, 2);
  });

  it('is read back as current by the Inspector, a chain included', async () => {
    const mock = createFigmaMock().install();
    await sync(document({ chip: GROUPS.chip, button: GROUPS.button }));
    await INSPECT_CORRESPONDENCE();

    const posted = mock
      .calls('ui.postMessage')
      .map((call) => call.args[0] as { type: string; payload: unknown })
      .filter((message) => message.type === 'CORRESPONDENCE');
    const payload = posted[posted.length - 1].payload as InspectionPayload;
    const state = (path: string) => payload.tokens.find((token) => token.path === path)?.state;
    assert.equal(state('Demo.ui.chip.background'), 'current');
    assert.equal(state('Demo.ui.button.background'), 'current');
    assert.equal(state('Demo.ui.chip.hover.background'), undefined, 'a part folded into modes has no variable to inspect');
    assert.equal(payload.counts.drifted + payload.counts.outdated + payload.counts.absent + payload.counts.blocked, 0);
  });
});

describe('two axes that fold independently', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  it('chain across the axis collections, the later axis the head', async () => {
    const mock = createFigmaMock().install();
    await sync(document({ button: GROUPS.button }));

    assert.deepEqual(collections(mock), [
      ['Demo', ['default']],
      ['pointer', ['rest', 'hover']],
      ['enabled', ['rest', 'disabled']],
    ]);
    assert.deepEqual(where(mock, 'ui/button/background'), ['enabled']);
    assert.deepEqual(where(mock, 'ui/button/background--pointer'), ['pointer']);
    assert.equal(mock.variables().length, 2);

    const link = mock.variable('pointer', 'ui/button/background--pointer')!;
    assert.deepEqual(mock.valueFor('pointer', 'ui/button/background--pointer', 'rest'), rgba(0.9, 0.9, 0.9));
    assert.deepEqual(mock.valueFor('pointer', 'ui/button/background--pointer', 'hover'), rgba(0.8, 0.8, 0.8));
    assert.deepEqual(
      mock.valueFor('enabled', 'ui/button/background', 'rest'),
      { type: 'VARIABLE_ALIAS', id: link.id },
      'what the later axis does not define is the earlier one',
    );
    assert.deepEqual(mock.valueFor('enabled', 'ui/button/background', 'disabled'), rgba(0.5, 0.5, 0.5));
    assert.equal(mock.variable('pointer', 'ui/button/background--pointer')!.codeSyntax.WEB, 'var(--ui-button-background--pointer)');
  });
});

describe('the order of the vocabulary decides, not the order of the group’s keys', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  it('gives the same collections, modes and chain when the group lists its parts the other way round', async () => {
    const forward = createFigmaMock().install();
    await sync(document({ button: GROUPS.button, chip: GROUPS.chip }));
    const expected = {
      collections: collections(forward),
      cells: [
        forward.valueFor('pointer', 'ui/chip/background', 'pressed'),
        forward.valueFor('enabled', 'ui/button/background', 'disabled'),
      ],
      head: where(forward, 'ui/button/background'),
      link: where(forward, 'ui/button/background--pointer'),
    };

    resetState();
    const reverse = createFigmaMock().install();
    const { disabled, hover, ...button } = GROUPS.button;
    const { pressed, hover: chipHover, ...chip } = GROUPS.chip;
    await sync(document({ chip: { pressed, hover: chipHover, ...chip }, button: { disabled, hover, ...button } }));

    assert.deepEqual(
      collections(reverse).map(([name, modes]) => [name, [...(modes as string[])].sort()]),
      collections(forward).map(([name, modes]) => [name, [...(modes as string[])].sort()]),
    );
    assert.deepEqual(
      collections(reverse)
        .map(([name]) => name)
        .sort(),
      collections(forward)
        .map(([name]) => name)
        .sort(),
    );
    assert.deepEqual(
      collections(reverse).find(([name]) => name === 'pointer'),
      ['pointer', ['rest', 'hover', 'pressed']],
      'values in the vocabulary’s order',
    );
    assert.deepEqual(
      expected.collections.find(([name]) => name === 'pointer'),
      ['pointer', ['rest', 'hover', 'pressed']],
    );
    assert.deepEqual(where(reverse, 'ui/button/background'), expected.head, 'the later axis of the vocabulary is the head');
    assert.deepEqual(where(reverse, 'ui/button/background--pointer'), expected.link);
    assert.deepEqual(
      [reverse.valueFor('pointer', 'ui/chip/background', 'pressed'), reverse.valueFor('enabled', 'ui/button/background', 'disabled')],
      expected.cells,
    );
  });
});

describe('a token that carries two axes', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  it('blocks the later axis: it stays in the path, and the earlier one still folds', async () => {
    const mock = createFigmaMock().install();
    const operations = await sync(document({ card: GROUPS.card }));

    // `pointer` folds (hover, in the vocabulary first); `variant` stays, since `primary.hover.background` carries both.
    assert.deepEqual(collections(mock), [
      ['Demo', ['default']],
      ['pointer', ['rest', 'hover']],
    ]);
    assert.deepEqual(where(mock, 'ui/card/background'), ['pointer']);
    assert.deepEqual(
      where(mock, 'ui/card/primary/background'),
      ['pointer'],
      'button.primary.hover.background is ui/card/primary/background in mode hover',
    );
    assert.deepEqual(where(mock, 'ui/card/primary/hover/background'), []);
    assert.deepEqual(where(mock, 'ui/card/hover/background'), []);
    assert.deepEqual(mock.valueFor('pointer', 'ui/card/primary/background', 'rest'), rgba(0, 0, 1));
    assert.deepEqual(mock.valueFor('pointer', 'ui/card/primary/background', 'hover'), rgba(0, 0, 0.9));
    assert.deepEqual(mock.valueFor('pointer', 'ui/card/background', 'hover'), rgba(0.95, 0.95, 0.95));
    assert.deepEqual(warnings(operations), [
      '"ui.card": folds "pointer" (modes rest, hover); "variant" stays in the path, one variable per part: "ui.card.primary.hover.background" carries it together with the folded "pointer".',
    ]);
  });
});

describe('a component that cannot fold an axis', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  it('keeps one variable per part when a part token has no rest value, and says which one', async () => {
    const mock = createFigmaMock().install();
    const operations = await sync(document({ tag: GROUPS.tag }));

    assert.deepEqual(collections(mock), [['Demo', ['default']]]);
    assert.deepEqual(where(mock, 'ui/tag/hover/background'), ['Demo']);
    assert.deepEqual(warnings(operations), [
      '"ui.tag": "pointer" stays in the path, one variable per part: no rest value: "ui.tag.hover.background" needs "ui.tag.background", which is not defined.',
    ]);
  });

  it('keeps one variable per part when the axis would hold more modes than Figma allows', async () => {
    const mock = createFigmaMock().install();
    const steps = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, k) => [`s${k + 1}`, `[data-step='${k + 1}']`]));
    const stepped = (count: number) => ({
      $extensions: { 'com.toghen': { css: { parts: { step: steps(count) } } } },
      level: color(0.5, 0.5, 0.5),
      ...Object.fromEntries(Array.from({ length: count }, (_, k) => [`s${k + 1}`, { level: color(k / 20, 0.5, 0.5) }])),
    });
    const operations = await sync(document({ dial: stepped(9), deck: stepped(10) }));

    // nine parts and rest are ten modes; ten parts and rest are eleven.
    assert.deepEqual(
      collections(mock).map(([name, modes]) => [name, (modes as string[]).length]),
      [
        ['Demo', 1],
        ['step', 10],
      ],
    );
    assert.deepEqual(where(mock, 'ui/dial/level'), ['step']);
    assert.deepEqual(where(mock, 'ui/deck/level'), ['Demo']);
    assert.deepEqual(where(mock, 'ui/deck/s10/level'), ['Demo']);
    assert.deepEqual(warnings(operations), [
      '"ui.deck": "step" stays in the path, one variable per part: its values s10 do not fit the shared collection "step", which already holds 10 modes (rest, s1, s2, s3, s4, s5, s6, s7, s8, s9) and Figma allows 10.',
    ]);
  });

  it('keeps one variable per part when the component is laid out so (layout=parts)', async () => {
    const mock = createFigmaMock().install();
    const file = {
      fileName: 'ui/chip.component.kdl',
      text: 'component Chip tokens="{ui.chip}" layout=parts\nFRAME Chip layoutMode=HORIZONTAL\n',
    };
    const operations = await sync(document({ chip: GROUPS.chip, button: GROUPS.button }), [file]);

    // `chip` is laid out in the path; `button` still folds.
    assert.deepEqual(where(mock, 'ui/chip/background'), ['Demo']);
    assert.deepEqual(where(mock, 'ui/chip/hover/background'), ['Demo']);
    assert.deepEqual(where(mock, 'ui/chip/pressed/background'), ['Demo']);
    assert.deepEqual(where(mock, 'ui/button/background'), ['enabled']);
    assert.deepEqual(warnings(operations), [
      '"ui.chip": "pointer" stays in the path, one variable per part: the component is laid out as one variable per part (layout=parts).',
    ]);
  });

  it('stops the plan when a folded axis has the name of a modifier, naming both', async () => {
    createFigmaMock().install();
    const doc = document({ chip: GROUPS.chip }, { pointer: { default: 'fine', contexts: { fine: [{}], coarse: [{}] } } }, ['pointer']);
    await LOAD_DOCUMENT(oneFile(JSON.stringify(doc)));
    await PLAN_VARIABLE_SYNC({});

    const [stop] = getState().lastPlan!;
    assert.equal(stop.kind, 'WARNING');
    assert.match(
      (stop as { message: string }).message,
      /^The part axis "pointer" folds into a collection of that name, and the base collection or a modifier already has it\./,
    );
  });
});

describe('parts beside worlds', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  const themed = (hoverDark: boolean) =>
    document(
      { chip: { background: color(0.9, 0.9, 0.9), hover: { background: color(0.8, 0.8, 0.8) } } },
      {
        theme: {
          default: 'light',
          contexts: {
            light: [{}],
            dark: [
              {
                ui: {
                  chip: {
                    background: { $value: srgb(0.2, 0.2, 0.2) },
                    ...(hoverDark ? { hover: { background: { $value: srgb(0.1, 0.1, 0.1) } } } : {}),
                  },
                },
              },
            ],
          },
        },
      },
      ['theme'],
    );

  it('puts the rest where the world varies it, below the axis, and copies a part that no world varies', async () => {
    const mock = createFigmaMock().install();
    await sync(themed(false));

    assert.deepEqual(where(mock, 'ui/chip/background'), ['pointer']);
    assert.deepEqual(where(mock, 'ui/chip/background--theme'), ['theme']);
    const rest = mock.variable('theme', 'ui/chip/background--theme')!;
    assert.deepEqual(mock.valueFor('theme', 'ui/chip/background--theme', 'dark'), rgba(0.2, 0.2, 0.2));
    assert.deepEqual(mock.valueFor('pointer', 'ui/chip/background', 'rest'), { type: 'VARIABLE_ALIAS', id: rest.id });
    assert.deepEqual(mock.valueFor('pointer', 'ui/chip/background', 'hover'), rgba(0.8, 0.8, 0.8));
    assert.equal(mock.variables().length, 2);
  });

  it('keeps a variable for a part that a world varies, and the cell aliases it', async () => {
    const mock = createFigmaMock().install();
    await sync(themed(true));

    const hover = mock.variable('theme', 'ui/chip/hover/background')!;
    assert.ok(hover, 'the part token varies with the theme, so it keeps the variable its cell aliases');
    assert.deepEqual(mock.valueFor('theme', 'ui/chip/hover/background', 'dark'), rgba(0.1, 0.1, 0.1));
    assert.deepEqual(mock.valueFor('pointer', 'ui/chip/background', 'hover'), { type: 'VARIABLE_ALIAS', id: hover.id });
  });

  it('plans the same worlds as before for a document with no parts', async () => {
    createFigmaMock().install();
    const doc = document({}, {}, []);
    const plan = await new VariableSyncEngine().buildPlan(new Resolver(doc), 'Demo', defaultTokenTypeMap);
    assert.deepEqual(
      plan.operations.filter((op) => op.kind === 'WARNING'),
      [],
    );
  });
});

describe('a part that refers to its own rest or to a sibling part', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  const ref = (path: string) => ({ $type: 'color', $value: `{${path}}` });
  const brand = color(0.1, 0.2, 0.3);
  const alias = (mock: FigmaMockHandle, collection: string, name: string) => ({
    type: 'VARIABLE_ALIAS',
    id: mock.variable(collection, name)!.id,
  });

  it('takes the rest’s alias in the part’s mode, and makes no variable for the part', async () => {
    const mock = createFigmaMock().install();
    const operations = await sync(
      document({ brand, chip: { background: ref('ui.brand'), hover: { background: ref('ui.chip.background') } } }),
    );

    assert.deepEqual(mock.valueFor('pointer', 'ui/chip/background', 'rest'), alias(mock, 'Demo', 'ui/brand'));
    assert.deepEqual(mock.valueFor('pointer', 'ui/chip/background', 'hover'), alias(mock, 'Demo', 'ui/brand'));
    assert.deepEqual(where(mock, 'ui/chip/hover/background'), []);
    assert.deepEqual(warnings(operations), []);
  });

  it('takes the rest’s value when the rest is a value', async () => {
    const mock = createFigmaMock().install();
    const operations = await sync(
      document({ chip: { background: color(0.9, 0.9, 0.9), hover: { background: ref('ui.chip.background') } } }),
    );

    assert.deepEqual(mock.valueFor('pointer', 'ui/chip/background', 'hover'), rgba(0.9, 0.9, 0.9));
    assert.deepEqual(warnings(operations), []);
  });

  it('writes no loop with two folded axes, and a part that refers to a sibling takes what the sibling takes', async () => {
    const mock = createFigmaMock().install();
    const operations = await sync(
      document({
        brand,
        button: {
          background: ref('ui.brand'),
          hover: { background: ref('ui.button.background') },
          disabled: { background: ref('ui.button.hover.background') },
        },
      }),
    );

    const brandAlias = alias(mock, 'Demo', 'ui/brand');
    const link = alias(mock, 'pointer', 'ui/button/background--pointer');
    assert.deepEqual(mock.valueFor('pointer', 'ui/button/background--pointer', 'rest'), brandAlias);
    assert.deepEqual(mock.valueFor('pointer', 'ui/button/background--pointer', 'hover'), brandAlias);
    assert.deepEqual(mock.valueFor('enabled', 'ui/button/background', 'rest'), link);
    assert.deepEqual(
      mock.valueFor('enabled', 'ui/button/background', 'disabled'),
      link,
      'the sibling falls back to the rest, so the chain does',
    );
    // Every mode ends at the brand colour: follow the aliases, in the default mode of each collection.
    let held = mock.valueFor('enabled', 'ui/button/background', 'disabled') as { type?: string; id?: string };
    for (let depth = 0; held.type === 'VARIABLE_ALIAS' && depth < 8; depth++) {
      const next = mock.variables().find((variable) => variable.id === held.id)!;
      held = Object.values(next.valuesByMode)[0] as typeof held;
    }
    assert.deepEqual(held, rgba(0.1, 0.2, 0.3));
    assert.deepEqual(warnings(operations), []);
  });

  it('takes the value of a sibling part that holds one', async () => {
    const mock = createFigmaMock().install();
    const operations = await sync(
      document({
        chip: {
          background: color(0.9, 0.9, 0.9),
          hover: { background: color(0.8, 0.8, 0.8) },
          pressed: { background: ref('ui.chip.hover.background') },
        },
      }),
    );

    assert.deepEqual(mock.valueFor('pointer', 'ui/chip/background', 'pressed'), rgba(0.8, 0.8, 0.8));
    assert.deepEqual(where(mock, 'ui/chip/pressed/background'), []);
    assert.deepEqual(warnings(operations), []);
  });

  it('writes the value, with a warning, where an alias would lead back to the variable (a mode Figma holds)', async () => {
    const mock = createFigmaMock().install();
    const plain = { x: color(0.2, 0.2, 0.2), t: color(0.4, 0.4, 0.4) };
    await sync(document(plain));
    // A designer points `t` at `x` in Figma; the document has not moved, so the plan leaves it.
    const x = mock.variable('Demo', 'ui/x')!;
    const t = mock.variable('Demo', 'ui/t')!;
    t.setValueForMode(Object.keys(t.valuesByMode)[0], { type: 'VARIABLE_ALIAS', id: x.id });

    resetState();
    const operations = await sync(document({ x: ref('ui.t'), t: plain.t }));

    assert.deepEqual(
      x.valuesByMode[Object.keys(x.valuesByMode)[0]],
      rgba(0.4, 0.4, 0.4),
      'the value is written, since an alias to t would loop',
    );
    assert.deepEqual(warnings(operations), [
      '"Demo.ui.x" refers to "Demo.ui.t", which leads back to "ui/x" in Figma, so the value is written instead of an alias.',
    ]);
  });
});
