/**
 * A token that changes collection is moved, not doubled.
 *
 * When the document changes where a token lives (it starts to vary on a modifier, stops varying, moves between
 * modifiers, or between the base and the collection of a folded part axis), the variable the last sync recorded is in
 * the old collection. The plan removes it (a `BREAKING` row, the removal carried only with `allowBreaking`), creates
 * the new one, and writes again every alias that pointed at the old one. A variable the sync did not record is left alone.
 *
 * Synthetic documents in the W3C structured shapes; what a run leaves in the mock file is read back.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, useFigmaMock, type FigmaMockHandle } from './support/figmaMock.js';
import { LOAD_DOCUMENT } from '../main/handlers/loadDocument.js';
import { oneFile } from './support/oneFile.js';
import { PLAN_VARIABLE_SYNC } from '../main/handlers/planVariableSync.js';
import { EXECUTE_VARIABLE_SYNC } from '../main/handlers/executeVariableSync.js';
import { getState } from '../main/runtimeState.js';
import { run } from '../main/components/run.js';
import { runOperations } from '../main/engines/batchRunner.js';
import { readComponentFile } from '../shared/components/index.js';
import type { Desired } from '../shared/components/index.js';
import { pendingNames } from '../shared/pendingNames.js';
import type { Operation } from '../shared/operations.js';

const srgb = (...components: number[]) => ({ colorSpace: 'srgb', components });
// As Figma holds a colour it was given: every channel float32.
const rgba = (r: number, g: number, b: number) => ({ r: Math.fround(r), g: Math.fround(g), b: Math.fround(b), a: 1 });
const color = (...components: number[]) => ({ $type: 'color', $value: srgb(...components) });
const px = (value: number) => ({ value, unit: 'px' });

type Where = 'base' | 'state' | 'theme';

/**
 * `checkbox.background` lives where `where` says: constant (base), or defined by a context of `state` or of `theme`.
 * `link.fill` is only a reference to it, and `checkbox.radius` never moves.
 */
function document(where: Where): string {
  const defines = (modifier: Where, context: string) => ({
    [context]: [where === modifier ? { checkbox: { background: { $value: srgb(0.5, 0.5, 0.5) } } } : {}],
  });
  return JSON.stringify({
    version: '2025-11-01',
    name: 'Demo',
    sets: {
      base: {
        sources: [
          {
            checkbox: { background: color(0.9, 0.9, 0.9), radius: { $type: 'dimension', $value: px(4) } },
            link: { fill: { $type: 'color', $value: '{checkbox.background}' } },
          },
        ],
      },
    },
    modifiers: {
      state: { default: 'rest', contexts: { rest: [{}], ...defines('state', 'pressed') } },
      theme: { default: 'light', contexts: { light: [{}], ...defines('theme', 'dark') } },
    },
    resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/state' }, { $ref: '#/modifiers/theme' }],
  });
}

const plan = (): Operation[] => {
  const { lastPlan } = getState();
  assert.ok(lastPlan, 'a plan should have been stored');
  return lastPlan;
};
async function sync(json: string, allowBreaking = true): Promise<Operation[]> {
  await LOAD_DOCUMENT(oneFile(json));
  await PLAN_VARIABLE_SYNC({ allowBreaking });
  const operations = plan();
  await EXECUTE_VARIABLE_SYNC();
  return operations;
}
const where = (mock: FigmaMockHandle, name: string) =>
  mock
    .variables()
    .filter((variable) => variable.name === name)
    .map((variable) => mock.collections().find((collection) => collection.id === variable.variableCollectionId)!.name);
const breaking = (operations: Operation[]) => operations.filter((op) => op.kind === 'BREAKING');
const MOVES = (from: string, to: string) => `"checkbox/background" moves from "${from}" to "${to}"; the old variable is removed.`;

describe('a token that changes collection', () => {
  useFigmaMock();

  it('goes from constant to varying on a modifier: one breaking step, the old variable removed, the new one created', async () => {
    const mock = createFigmaMock().install();
    await sync(document('base'));
    assert.deepEqual(where(mock, 'checkbox/background'), ['Demo']);
    const oldId = mock.variable('Demo', 'checkbox/background')!.id;

    await LOAD_DOCUMENT(oneFile(document('state')));
    await PLAN_VARIABLE_SYNC({ allowBreaking: true });
    const operations = plan();
    assert.deepEqual(
      breaking(operations).map((op) => op.kind === 'BREAKING' && op.message),
      [MOVES('Demo', 'state')],
    );
    assert.deepEqual(
      operations
        .filter((op) => op.kind === 'DELETE_VARIABLE')
        .map((op) => op.kind === 'DELETE_VARIABLE' && [op.variableId, op.variableName, op.collectionName]),
      [[oldId, 'checkbox/background', 'Demo']],
    );
    await EXECUTE_VARIABLE_SYNC();

    assert.deepEqual(where(mock, 'checkbox/background'), ['state']);
    assert.deepEqual(mock.valueFor('state', 'checkbox/background', 'rest'), rgba(0.9, 0.9, 0.9));
    assert.deepEqual(mock.valueFor('state', 'checkbox/background', 'pressed'), rgba(0.5, 0.5, 0.5));
    assert.equal(mock.variable('state', 'checkbox/background')!.codeSyntax.WEB, 'var(--checkbox-background)');
    assert.equal(mock.variables().length, 3, 'the radius, the link and the moved token: no second variable of the name');
  });

  it('goes from varying back to constant', async () => {
    const mock = createFigmaMock().install();
    await sync(document('state'));
    assert.deepEqual(where(mock, 'checkbox/background'), ['state']);

    const operations = await sync(document('base'));

    assert.deepEqual(
      breaking(operations).map((op) => op.kind === 'BREAKING' && op.message),
      [MOVES('state', 'Demo')],
    );
    assert.deepEqual(where(mock, 'checkbox/background'), ['Demo']);
    assert.deepEqual(mock.valueFor('Demo', 'checkbox/background', 'default'), rgba(0.9, 0.9, 0.9));
  });

  it('goes between two modifiers', async () => {
    const mock = createFigmaMock().install();
    await sync(document('state'));

    const operations = await sync(document('theme'));

    assert.deepEqual(
      breaking(operations).map((op) => op.kind === 'BREAKING' && op.message),
      [MOVES('state', 'theme')],
    );
    assert.deepEqual(where(mock, 'checkbox/background'), ['theme']);
    assert.deepEqual(mock.valueFor('theme', 'checkbox/background', 'dark'), rgba(0.5, 0.5, 0.5));
  });

  it('writes again every alias that pointed at the old variable, in the same plan, before the old one is removed', async () => {
    const mock = createFigmaMock().install();
    await sync(document('base'));
    const oldId = mock.variable('Demo', 'checkbox/background')!.id;
    assert.deepEqual(mock.valueFor('Demo', 'link/fill', 'default'), { type: 'VARIABLE_ALIAS', id: oldId });

    await LOAD_DOCUMENT(oneFile(document('state')));
    await PLAN_VARIABLE_SYNC({ allowBreaking: true });
    const operations = plan();
    const sets = operations.flatMap((op, index) => (op.kind === 'SET_VARIABLE_VALUE' && op.tokenPath === 'Demo.link.fill' ? [index] : []));
    const removal = operations.findIndex((op) => op.kind === 'DELETE_VARIABLE');
    assert.equal(sets.length, 1, 'the referrer is written again though its own value did not move');
    assert.ok(removal > sets[0], 'and before the removal');
    assert.equal(removal, operations.length - 1, 'the removal is the last step');
    await EXECUTE_VARIABLE_SYNC();

    const moved = mock.variable('state', 'checkbox/background')!;
    assert.deepEqual(mock.valueFor('Demo', 'link/fill', 'default'), { type: 'VARIABLE_ALIAS', id: moved.id });
    assert.notEqual(moved.id, oldId);
    assert.deepEqual(
      mock.variable('Demo', 'link/fill')!.resolveForConsumer({}).value,
      rgba(0.9, 0.9, 0.9),
      'and it resolves through the new variable',
    );
  });

  it('settles: the next plan has nothing left to write or to list', async () => {
    createFigmaMock().install();
    await sync(document('base'));
    await sync(document('state'));

    await PLAN_VARIABLE_SYNC({ allowBreaking: true });

    assert.deepEqual(
      plan().filter((op) => op.kind !== 'SKIP'),
      [],
    );
  });

  it('lists the step without carrying it when the request does not allow breaking, and leaves the old variable', async () => {
    const mock = createFigmaMock().install();
    await sync(document('base'));

    const operations = await sync(document('state'), false);

    assert.deepEqual(
      breaking(operations).map((op) => op.kind === 'BREAKING' && op.message),
      [MOVES('Demo', 'state')],
    );
    assert.ok(!operations.some((op) => op.kind === 'DELETE_VARIABLE'), 'the screen’s plan does not carry the removal');
    assert.deepEqual(where(mock, 'checkbox/background').sort(), ['Demo', 'state'], 'the screen’s execute leaves the old variable');
  });

  it('plans a document with no moved token exactly as before: no step, no change to a settled plan', async () => {
    createFigmaMock().install();
    await sync(document('state'));
    await LOAD_DOCUMENT(oneFile(document('state')));
    await PLAN_VARIABLE_SYNC({ allowBreaking: true });

    const operations = plan();
    assert.ok(!operations.some((op) => op.kind === 'BREAKING' || op.kind === 'DELETE_VARIABLE'));
    assert.deepEqual(
      operations.filter((op) => op.kind !== 'SKIP'),
      [],
    );
  });

  it('leaves a variable of the same name that the sync did not record alone', async () => {
    // a variable made by hand in the base collection: no record names it
    const mock = createFigmaMock()
      .withCollection('Demo', ['default'])
      .withVariable('Demo', 'checkbox/background', 'COLOR', { default: rgba(0.1, 0.2, 0.3) })
      .install();

    const operations = await sync(document('state'));

    assert.deepEqual(breaking(operations), []);
    assert.ok(!operations.some((op) => op.kind === 'DELETE_VARIABLE'));
    assert.deepEqual(where(mock, 'checkbox/background').sort(), ['Demo', 'state']);
    assert.deepEqual(mock.valueFor('Demo', 'checkbox/background', 'default'), rgba(0.1, 0.2, 0.3), 'untouched');
  });

  it('removes nothing when the recorded variable is already gone from the file', async () => {
    const mock = createFigmaMock().install();
    await sync(document('base'));
    mock.variable('Demo', 'checkbox/background')!.remove();

    const operations = await sync(document('state'));

    assert.deepEqual(breaking(operations), []);
    assert.deepEqual(where(mock, 'checkbox/background'), ['state']);
  });

  it('does not remove a variable a person moved out of the collection the record says', async () => {
    const mock = createFigmaMock().withCollection('Mine', ['default']).install();
    await sync(document('base'));
    // a designer moved the variable into a collection of their own
    const elsewhere = mock.collection('Demo')!;
    const variable = mock.variable('Demo', 'checkbox/background')!;
    const mine = mock.collection('Mine')!;
    variable.variableCollectionId = mine.id;
    variable.valuesByMode = { [mine.modes[0].modeId]: variable.valuesByMode[elsewhere.modes[0].modeId] };

    const operations = await sync(document('state'));

    assert.deepEqual(breaking(operations), []);
    assert.ok(
      mock.variables().some((v) => v.id === variable.id),
      'the designer’s variable stays',
    );
  });

  it('does not remove a variable a person moved into another of the document’s collections', async () => {
    const mock = createFigmaMock().install();
    await sync(document('state'));
    // a designer moved the radius, whose home is the base collection, into the state collection
    const variable = mock.variable('Demo', 'checkbox/radius')!;
    const state = mock.collection('state')!;
    const value = Object.values(variable.valuesByMode)[0];
    variable.variableCollectionId = state.id;
    variable.valuesByMode = Object.fromEntries(state.modes.map((mode) => [mode.modeId, value]));

    const operations = await sync(document('state'));

    assert.deepEqual(breaking(operations), []);
    assert.ok(!operations.some((op) => op.kind === 'DELETE_VARIABLE'));
    assert.ok(
      mock.variables().some((v) => v.id === variable.id),
      'the designer’s variable stays',
    );
  });

  it('removes every variable a token left behind, one step each', async () => {
    const mock = createFigmaMock().install();
    await sync(document('base'));
    await sync(document('state'), false);
    await sync(document('theme'), false);
    assert.deepEqual(where(mock, 'checkbox/background').sort(), ['Demo', 'state', 'theme']);

    const operations = await sync(document('theme'));

    assert.deepEqual(
      breaking(operations)
        .map((op) => op.kind === 'BREAKING' && op.message)
        .sort(),
      [MOVES('Demo', 'theme'), MOVES('state', 'theme')],
    );
    assert.equal(operations.filter((op) => op.kind === 'DELETE_VARIABLE').length, 2);
    assert.deepEqual(where(mock, 'checkbox/background'), ['theme']);
  });
});

describe('a collection the document no longer names', () => {
  useFigmaMock();

  it('is left alone: a token that left it is not moved out of it', async () => {
    const mock = createFigmaMock().install();
    await sync(document('state'));
    const gone = JSON.parse(document('base'));
    delete gone.modifiers.state;
    gone.resolutionOrder = gone.resolutionOrder.filter((entry: { $ref: string }) => entry.$ref !== '#/modifiers/state');

    const operations = await sync(JSON.stringify(gone));

    assert.deepEqual(breaking(operations), []);
    assert.ok(!operations.some((op) => op.kind === 'DELETE_VARIABLE'));
    assert.deepEqual(where(mock, 'checkbox/background').sort(), ['Demo', 'state']);
  });
});

describe('a token that moves between the base and the collection of a folded part axis', () => {
  useFigmaMock();

  const VOCABULARY = { 'com.toghen': { css: { parts: { pointer: { hover: ':hover' } } } } };
  // `pill` keeps folding the axis, so its collection stays the document's when `chip` loses its part
  const parts = (withHover: boolean) =>
    JSON.stringify({
      version: '2025-11-01',
      name: 'Demo',
      sets: {
        base: {
          sources: [
            {
              ui: {
                $extensions: VOCABULARY,
                pill: { background: color(0.2, 0.2, 0.2), hover: { background: color(0.3, 0.3, 0.3) } },
                chip: { background: color(0.9, 0.9, 0.9), ...(withHover ? { hover: { background: color(0.8, 0.8, 0.8) } } : {}) },
              },
            },
          ],
        },
      },
      modifiers: {},
      resolutionOrder: [{ $ref: '#/sets/base' }],
    });
  const NAME = '"ui/chip/background"';

  it('moves from the base to the axis collection when a part appears, and back when it goes', async () => {
    const mock = createFigmaMock().install();
    await sync(parts(false));
    assert.deepEqual(where(mock, 'ui/chip/background'), ['Demo']);

    const folded = await sync(parts(true));
    assert.deepEqual(
      breaking(folded).map((op) => op.kind === 'BREAKING' && op.message),
      [`${NAME} moves from "Demo" to "pointer"; the old variable is removed.`],
    );
    assert.deepEqual(where(mock, 'ui/chip/background'), ['pointer']);
    assert.deepEqual(mock.valueFor('pointer', 'ui/chip/background', 'hover'), rgba(0.8, 0.8, 0.8));

    const back = await sync(parts(false));
    assert.deepEqual(
      breaking(back).map((op) => op.kind === 'BREAKING' && op.message),
      [`${NAME} moves from "pointer" to "Demo"; the old variable is removed.`],
    );
    assert.deepEqual(where(mock, 'ui/chip/background'), ['Demo']);
  });
});

describe('a dry run across steps counts a move, so that a name is not ambiguous', () => {
  useFigmaMock();

  const box = `component Box\nFRAME Box layoutMode=VERTICAL {\n    fills "{checkbox.background}"\n}\n`;
  const desired = (): Desired => {
    const file = readComponentFile(box);
    assert.deepEqual(
      file.problems.filter((p) => p.severity === 'error'),
      [],
    );
    return JSON.parse(JSON.stringify({ component: file.component, members: file.members })) as Desired;
  };

  async function planned() {
    const mock = createFigmaMock().install();
    await sync(document('base'));
    await LOAD_DOCUMENT(oneFile(document('state')));
    await PLAN_VARIABLE_SYNC({});
    const operations = plan();
    const pending = pendingNames(
      operations,
      mock.collections().map((c) => ({ id: c.id, name: c.name })),
    );
    return { mock, operations, pending };
  }

  it('lists the breaking row in the dry run, naming both collections, when breaking is not allowed', async () => {
    const { operations, pending } = await planned();
    assert.deepEqual(
      operations.filter((op) => op.kind === 'BREAKING').map((op) => op.kind === 'BREAKING' && op.message),
      [MOVES('Demo', 'state')],
    );
    assert.deepEqual(pending.removed, [{ collection: 'Demo', name: 'checkbox/background' }]);
  });

  it('counts the step: the name is in one collection after it, not two', async () => {
    const { pending } = await planned();
    const report = await run(desired(), { dryRun: true, pending });
    assert.deepEqual(report.pending, ['token {checkbox.background} (line 3): the variable sync would create "checkbox/background"']);
  });

  it('is ambiguous without the step counted, as before', async () => {
    const { pending } = await planned();
    await assert.rejects(
      run(desired(), { dryRun: true, pending: { ...pending, removed: undefined } }),
      (error: Error & { problems?: string[] }) => {
        assert.match(
          error.problems![0],
          /is ambiguous, it matches Demo: "checkbox\/background"; state: "checkbox\/background" \(the sync would create it\)/,
        );
        return true;
      },
    );
  });
});

describe('a name found in two collections after an earlier sync moved the token', () => {
  useFigmaMock();

  const box = `component Box\nFRAME Box layoutMode=VERTICAL {\n    fills "{checkbox.background}"\n}\n`;
  const desired = (): Desired =>
    JSON.parse(JSON.stringify({ component: readComponentFile(box).component, members: readComponentFile(box).members })) as Desired;

  it('says the older variable was written by an earlier sync, when the record holds the other', async () => {
    const mock = createFigmaMock().install();
    await sync(document('base'));
    // the screen's execute leaves the old variable, and the record then names the new one
    await sync(document('state'), false);
    assert.deepEqual(where(mock, 'checkbox/background').sort(), ['Demo', 'state']);

    await assert.rejects(run(desired(), {}), (error: Error & { problems?: string[] }) => {
      assert.match(error.problems![0], /is ambiguous, it matches Demo: "checkbox\/background"; state: "checkbox\/background"/);
      assert.match(
        error.problems![0],
        /the one in "state" is the one the sync recorded for this token, and the one in "Demo" was written by an earlier sync, from before the token moved: delete it in Figma$/,
      );
      return true;
    });
  });

  it('says nothing of the sort about a variable made by hand', async () => {
    createFigmaMock()
      .withCollection('Demo', ['default'])
      .withVariable('Demo', 'checkbox/background', 'COLOR', { default: rgba(0.1, 0.2, 0.3) })
      .install();
    await sync(document('state'));

    await assert.rejects(run(desired(), {}), (error: Error & { problems?: string[] }) => {
      assert.match(error.problems![0], /is ambiguous/);
      assert.doesNotMatch(error.problems![0], /earlier sync/);
      return true;
    });
  });
});

describe('the removal of a moved variable', () => {
  useFigmaMock();

  it('runs only if the variable that replaces it was made', async () => {
    const mock = createFigmaMock().withCollection('Demo', ['default']).withVariable('Demo', 'a/b', 'FLOAT', { default: 1 }).install();
    const old = mock.variable('Demo', 'a/b')!;
    const operations: Operation[] = [
      {
        kind: 'CREATE_VARIABLE',
        symbolicId: '$var:state/a/b',
        collectionId: 'VariableCollectionId:nowhere',
        path: 'a/b',
        variableType: 'FLOAT',
      },
      { kind: 'DELETE_VARIABLE', variableId: old.id, variableName: 'a/b', collectionName: 'Demo', after: '$var:state/a/b' },
    ];

    const summary = await runOperations(operations, { onProgress: () => {} });

    assert.deepEqual(
      summary.results.map((r) => [r.operation.kind, r.status]),
      [
        ['CREATE_VARIABLE', 'failed'],
        ['DELETE_VARIABLE', 'skipped'],
      ],
    );
    assert.ok(
      mock.variables().some((v) => v.id === old.id),
      'the old variable is still there',
    );
  });
});
