/**
 * The sum, planned and executed against the mock file, and read back.
 *
 * `variableSyncEngine.test.ts` proves the plan; this proves what a run leaves in
 * the file: collections and modes, names without the collection, values and
 * aliases across collections, the code syntax Dev Mode shows, and that a second
 * run and the Inspector agree the file is the document's.
 *
 * Synthetic tokens in the W3C structured shapes, so a serialisation bug (an
 * `[object Object]`, a colour as a string) cannot hide behind plain strings.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, float32, useFigmaMock, type FigmaMockHandle } from './support/figmaMock.js';
import type { InspectionPayload } from '../shared/protocol.js';
import { LOAD_DOCUMENT } from '../main/handlers/loadDocument.js';
import { oneFile } from './support/oneFile.js';
import { PLAN_VARIABLE_SYNC } from '../main/handlers/planVariableSync.js';
import { EXECUTE_VARIABLE_SYNC } from '../main/handlers/executeVariableSync.js';
import { PLAN_STYLE_SYNC } from '../main/handlers/planStyleSync.js';
import { EXECUTE_STYLE_SYNC } from '../main/handlers/executeStyleSync.js';
import { INSPECT_CORRESPONDENCE } from '../main/handlers/inspectCorrespondence.js';
import { getState, resetState } from '../main/runtimeState.js';
import type { Operation } from '../shared/operations.js';

const px = (value: number) => ({ value, unit: 'px' });
const srgb = (...components: number[]) => ({ colorSpace: 'srgb', components });

/**
 * - `button.backgroundColor`: the base, `scheme` (dark) and `tone` (alert): a chain of two links.
 * - `font.size.md`: `density` (compact): one link.
 * - `space.gap`: the base alone.
 * - `text.body`: a typography token whose size refers to `font.size.md`: a style, bound to a variable in `density`.
 */
const DOCUMENT = JSON.stringify({
  version: '2025-11-01',
  name: 'Demo',
  sets: {
    base: {
      sources: [
        {
          button: { backgroundColor: { $type: 'color', $value: srgb(0.9, 0.9, 0.9) } },
          font: { size: { md: { $type: 'dimension', $value: px(16) } } },
          space: { gap: { $type: 'dimension', $value: px(8) } },
          text: {
            body: {
              $type: 'typography',
              $value: { fontFamily: ['Inter'], fontSize: '{font.size.md}', fontWeight: 400, lineHeight: 1.5, fontStyle: 'Regular' },
            },
          },
        },
      ],
    },
  },
  modifiers: {
    scheme: { default: 'light', contexts: { light: [{}], dark: [{ button: { backgroundColor: { $value: srgb(0.2, 0.2, 0.2) } } }] } },
    tone: { default: 'neutral', contexts: { neutral: [{}], alert: [{ button: { backgroundColor: { $value: srgb(0.8, 0.1, 0.1) } } }] } },
    density: { default: 'regular', contexts: { regular: [{}], compact: [{ font: { size: { md: { $value: px(14) } } } }] } },
  },
  resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/scheme' }, { $ref: '#/modifiers/tone' }, { $ref: '#/modifiers/density' }],
});

const plan = (): Operation[] => {
  const { lastPlan } = getState();
  assert.ok(lastPlan, 'a plan should have been stored');
  return lastPlan;
};

async function syncVariables(): Promise<void> {
  await PLAN_VARIABLE_SYNC({});
  await EXECUTE_VARIABLE_SYNC();
}

const modeId = (mock: FigmaMockHandle, collection: string, mode: string) =>
  mock.collection(collection)!.modes.find((m) => m.name === mode)!.modeId;

describe('the sum, run against the file', () => {
  useFigmaMock();

  it('leaves a base collection and a collection per modifier, default context first', async () => {
    const mock = createFigmaMock().install();
    await LOAD_DOCUMENT(oneFile(DOCUMENT));
    await syncVariables();

    assert.deepEqual(
      mock.collections().map((c) => [c.name, c.modes.map((m) => m.name)]),
      [
        ['Demo', ['default']],
        ['scheme', ['light', 'dark']],
        ['tone', ['neutral', 'alert']],
        ['density', ['regular', 'compact']],
      ],
    );
    for (const collection of mock.collections()) {
      assert.equal(collection.defaultModeId, collection.modes[0].modeId);
    }
  });

  it('names each variable without the collection, and puts it where it lives', async () => {
    const mock = createFigmaMock().install();
    await LOAD_DOCUMENT(oneFile(DOCUMENT));
    await syncVariables();

    const where = (name: string) =>
      mock
        .variables()
        .filter((v) => v.name === name)
        .map((v) => mock.collections().find((c) => c.id === v.variableCollectionId)!.name);

    assert.deepEqual(where('space/gap'), ['Demo']);
    assert.deepEqual(where('font/size/md'), ['density']);
    assert.deepEqual(where('button/backgroundColor'), ['tone'], 'the head, under the token’s name, in the last link’s collection');
    assert.deepEqual(where('button/backgroundColor--scheme'), ['scheme'], 'the earlier link, suffixed, in its own');
    assert.equal(mock.variables().length, 4);
  });

  it('writes the values in Figma’s shapes, and aliases across collections', async () => {
    const mock = createFigmaMock().install();
    await LOAD_DOCUMENT(oneFile(DOCUMENT));
    await syncVariables();

    assert.equal(mock.valueFor('Demo', 'space/gap', 'default'), 8);
    assert.equal(mock.valueFor('density', 'font/size/md', 'regular'), 16);
    assert.equal(mock.valueFor('density', 'font/size/md', 'compact'), 14);

    const link = mock.variable('scheme', 'button/backgroundColor--scheme')!;
    assert.deepEqual(mock.valueFor('scheme', 'button/backgroundColor--scheme', 'light'), float32({ r: 0.9, g: 0.9, b: 0.9, a: 1 }));
    assert.deepEqual(mock.valueFor('scheme', 'button/backgroundColor--scheme', 'dark'), float32({ r: 0.2, g: 0.2, b: 0.2, a: 1 }));
    assert.deepEqual(mock.valueFor('tone', 'button/backgroundColor', 'neutral'), { type: 'VARIABLE_ALIAS', id: link.id });
    assert.deepEqual(mock.valueFor('tone', 'button/backgroundColor', 'alert'), float32({ r: 0.8, g: 0.1, b: 0.1, a: 1 }));

    // The head resolves through the link, at the consumer.
    assert.deepEqual(
      mock.variable('tone', 'button/backgroundColor')!.resolveForConsumer({}).value,
      float32({ r: 0.9, g: 0.9, b: 0.9, a: 1 }),
    );
  });

  it('writes the CSS name as each variable’s code syntax, the link’s with its modifier', async () => {
    const mock = createFigmaMock().install();
    await LOAD_DOCUMENT(oneFile(DOCUMENT));
    await syncVariables();

    assert.equal(mock.variable('Demo', 'space/gap')!.codeSyntax.WEB, 'var(--space-gap)');
    assert.equal(mock.variable('density', 'font/size/md')!.codeSyntax.WEB, 'var(--font-size-md)');
    assert.equal(mock.variable('tone', 'button/backgroundColor')!.codeSyntax.WEB, 'var(--button-background-color)');
    assert.equal(mock.variable('scheme', 'button/backgroundColor--scheme')!.codeSyntax.WEB, 'var(--button-background-color--scheme)');
    assert.equal(mock.variable('Demo', 'space/gap')!.codeSyntax.ANDROID, undefined, 'Android and iOS are not Toghen’s to invent');
    assert.equal(mock.variable('Demo', 'space/gap')!.codeSyntax.iOS, undefined);
  });

  it('leaves nothing to do the second time, in this session and after the plugin is reopened', async () => {
    const mock = createFigmaMock().install();
    await LOAD_DOCUMENT(oneFile(DOCUMENT));
    await syncVariables();

    for (const reopened of [false, true]) {
      if (reopened) {
        resetState();
        await LOAD_DOCUMENT(oneFile(DOCUMENT));
      }
      const writesBefore = mock.writes().length;
      await PLAN_VARIABLE_SYNC({});

      assert.deepEqual(
        plan().filter((op) => op.kind !== 'SKIP'),
        [],
        `nothing planned${reopened ? ' after reopening' : ''}`,
      );
      assert.equal(mock.writes().length, writesBefore);
    }
  });

  it('writes only the context that moved, in the collection it lives in', async () => {
    const mock = createFigmaMock().install();
    await LOAD_DOCUMENT(oneFile(DOCUMENT));
    await syncVariables();

    await LOAD_DOCUMENT(oneFile(DOCUMENT.replace('"value":14', '"value":13')));
    await PLAN_VARIABLE_SYNC({});

    const sets = plan().filter((op) => op.kind === 'SET_VARIABLE_VALUE');
    assert.equal(sets.length, 1);
    assert.equal(sets[0].kind === 'SET_VARIABLE_VALUE' && sets[0].modeName, 'compact');
    await EXECUTE_VARIABLE_SYNC();
    assert.equal(mock.valueFor('density', 'font/size/md', 'compact'), 13);
    assert.equal(mock.valueFor('density', 'font/size/md', 'regular'), 16);
  });

  it('binds a style member to the variable in the collection its token lives in', async () => {
    const mock = createFigmaMock()
      .withFonts([{ family: 'Inter', style: 'Regular' }])
      .install();
    await LOAD_DOCUMENT(oneFile(DOCUMENT));
    await syncVariables();
    await PLAN_STYLE_SYNC({});
    await EXECUTE_STYLE_SYNC();

    const style = mock.styles('TEXT').find((s) => s.name === 'text/body');
    assert.ok(style, 'named without the collection');
    const bound = style.boundVariables as Record<string, { id: string }>;
    assert.equal(bound.fontSize.id, mock.variable('density', 'font/size/md')!.id);
  });

  it('is read back as current by the Inspector, a chain included', async () => {
    const mock = createFigmaMock().install();
    await LOAD_DOCUMENT(oneFile(DOCUMENT));
    await syncVariables();
    await INSPECT_CORRESPONDENCE();

    const posted = mock
      .calls('ui.postMessage')
      .map((call) => call.args[0] as { type: string; payload: unknown })
      .filter((message) => message.type === 'CORRESPONDENCE');
    const payload = posted[posted.length - 1].payload as InspectionPayload;

    const state = (path: string) => payload.tokens.find((token) => token.path === path)?.state;
    assert.equal(state('Demo.button.backgroundColor'), 'current');
    assert.equal(state('Demo.font.size.md'), 'current');
    assert.equal(state('Demo.space.gap'), 'current');
    assert.equal(state('Demo.text.body'), 'not_inspected', 'a style');
    assert.equal(payload.counts.drifted + payload.counts.outdated + payload.counts.absent + payload.counts.blocked, 0);

    // A hand edit to the link is seen in the chain’s token.
    mock.variable('scheme', 'button/backgroundColor--scheme')!.valuesByMode[modeId(mock, 'scheme', 'dark')] = { r: 1, g: 0, b: 0, a: 1 };
    await INSPECT_CORRESPONDENCE();
    const again = mock
      .calls('ui.postMessage')
      .map((call) => call.args[0] as { type: string; payload: unknown })
      .filter((message) => message.type === 'CORRESPONDENCE');
    const drifted = (again[again.length - 1].payload as InspectionPayload).tokens.find(
      (token) => token.path === 'Demo.button.backgroundColor',
    );
    assert.equal(drifted?.state, 'drifted');
    assert.match(drifted?.note ?? '', /scheme\/dark/);
  });

  it('writes a colour a context spells as a hex string, and one a group types, in Figma’s shape', async () => {
    const mock = createFigmaMock().install();
    const document = JSON.parse(DOCUMENT);
    document.sets.base.sources[0].ink = { $type: 'color', line: { $value: '#cccccc' } };
    document.modifiers.scheme.contexts.dark = [
      { button: { backgroundColor: { $value: '#333333' } }, ink: { line: { $value: '#000000' } } },
    ];
    await LOAD_DOCUMENT(oneFile(JSON.stringify(document)));
    await syncVariables();

    const grey = (v: number) => float32({ r: v / 255, g: v / 255, b: v / 255, a: 1 });
    assert.deepEqual(mock.valueFor('scheme', 'button/backgroundColor--scheme', 'dark'), grey(0x33));
    assert.deepEqual(mock.valueFor('scheme', 'ink/line', 'light'), grey(0xcc));
    assert.deepEqual(mock.valueFor('scheme', 'ink/line', 'dark'), grey(0));
    assert.doesNotMatch(JSON.stringify(mock.variables().map((v) => v.valuesByMode)), /object Object|#/);
  });

  it('leaves no [object Object] in what it wrote', async () => {
    const mock = createFigmaMock().install();
    await LOAD_DOCUMENT(oneFile(DOCUMENT));
    await syncVariables();

    assert.doesNotMatch(JSON.stringify(mock.variables().map((v) => [v.name, v.valuesByMode, v.codeSyntax])), /object Object/);
  });
});

describe('a context removed from the document, run against the file', () => {
  useFigmaMock();

  /** The document with a third density context, `loose`, which the later document drops. */
  const withLoose = () => {
    const document = JSON.parse(DOCUMENT);
    document.modifiers.density.contexts.loose = [{ font: { size: { md: { $value: px(18) } } } }];
    return JSON.stringify(document);
  };
  const modeNames = (mock: FigmaMockHandle) => mock.collection('density')!.modes.map((m) => m.name);

  async function fileWithLoose() {
    const mock = createFigmaMock().install();
    await LOAD_DOCUMENT(oneFile(withLoose()));
    await syncVariables();
    assert.deepEqual(modeNames(mock), ['regular', 'compact', 'loose']);
    await LOAD_DOCUMENT(oneFile(DOCUMENT));
    return mock;
  }

  it('is listed as breaking on the screen, whose own execute leaves the mode and its values in the file', async () => {
    const mock = await fileWithLoose();

    await PLAN_VARIABLE_SYNC({});

    const listed = plan().filter((op) => op.kind === 'BREAKING');
    assert.equal(listed.length, 1);
    assert.match(
      listed[0].kind === 'BREAKING' ? listed[0].message : '',
      /the mode "loose" of collection "density" is gone: values in it are lost, and a frame or variant pinned to it falls back to "regular"/,
    );
    assert.ok(!plan().some((op) => op.kind === 'DELETE_MODE'), 'the screen’s plan does not carry the deletion');

    await EXECUTE_VARIABLE_SYNC();

    assert.deepEqual(modeNames(mock), ['regular', 'compact', 'loose']);
    assert.equal(mock.valueFor('density', 'font/size/md', 'loose'), 18);
  });

  it('is deleted, with the values in it, when the request allows breaking, and the remaining modes keep theirs', async () => {
    const mock = await fileWithLoose();

    await PLAN_VARIABLE_SYNC({ allowBreaking: true });
    assert.equal(plan().filter((op) => op.kind === 'DELETE_MODE').length, 1);
    await EXECUTE_VARIABLE_SYNC();

    assert.deepEqual(modeNames(mock), ['regular', 'compact']);
    assert.equal(mock.valueFor('density', 'font/size/md', 'compact'), 14);
    assert.equal(mock.valueFor('density', 'font/size/md', 'regular'), 16);

    // Settled: nothing left to list, nothing left to write.
    await PLAN_VARIABLE_SYNC({ allowBreaking: true });
    assert.deepEqual(
      plan().filter((op) => op.kind !== 'SKIP'),
      [],
    );
  });
});
