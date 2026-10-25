/**
 * `operationExecutor` is the only module that writes to a user's Figma file, and
 * it had no test file at all. These cover the paths where a failure damages the
 * document rather than merely reporting badly.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executeOperation, labelForOperation } from '../main/engines/operationExecutor.js';
import { runOperations } from '../main/engines/batchRunner.js';
import type { Operation } from '../shared/operations.js';
import { createFigmaMock, useFigmaMock, type FigmaMockHandle } from './support/figmaMock.js';

const noProgress = () => {};

describe('operationExecutor — CREATE_COLLECTION', () => {
  useFigmaMock();

  it('renames the built-in mode rather than adding alongside it', async () => {
    const mock = createFigmaMock().install();

    await executeOperation({
      kind: 'CREATE_COLLECTION',
      symbolicId: '$col:Demo',
      name: 'Demo',
      modes: ['light', 'dark'],
    });

    const collection = mock.collection('Demo');
    assert.equal(collection?.modes.length, 2, 'not three — the built-in mode is renamed, not kept');
    assert.deepEqual(
      collection?.modes.map((m) => m.name),
      ['light', 'dark'],
    );
    assert.equal(collection?.defaultModeId, collection?.modes[0].modeId);
  });

  it('rolls back when the mode cap is hit partway through', async () => {
    // Without the rollback the collection survives with a partial set of modes.
    // The next run finds it by name, takes the "already exists" branch, emits
    // ADD_MODE, and hits the cap again — every run, forever, until the user
    // finds and deletes it by hand.
    const mock = createFigmaMock().withModeCap(2).install();

    await assert.rejects(
      () =>
        executeOperation({
          kind: 'CREATE_COLLECTION',
          symbolicId: '$col:Demo',
          name: 'Demo',
          modes: ['light', 'dark', 'sepia'],
        }),
      /Limited to 2 modes only/,
    );

    assert.deepEqual(mock.collections(), [], 'no half-built collection may survive');
  });

  it('rejects a plan with no modes', async () => {
    createFigmaMock().install();
    await assert.rejects(() => executeOperation({ kind: 'CREATE_COLLECTION', name: 'Demo', modes: [] }), /at least one mode/);
  });
});

describe('operationExecutor — bindings', () => {
  useFigmaMock();

  it('binds through the async node accessor and records the alias', async () => {
    const mock = createFigmaMock()
      .withCollection('Demo', ['light'])
      .withVariable('Demo', 'Demo/spacing/md', 'FLOAT')
      .withPage('Page 1', [{ id: '1:2', name: 'Card', type: 'FRAME', boundVariables: {} }])
      .install();

    const variableId = mock.variable('Demo', 'Demo/spacing/md')!.id;
    await executeOperation({
      kind: 'BIND_VARIABLE',
      nodeId: '1:2',
      property: 'paddingLeft',
      variableId,
    });

    // Assert the resulting binding, not merely that nothing threw — a fix that
    // swallowed the error would pass the weaker check.
    assert.deepEqual(mock.node('1:2')?.boundVariables.paddingLeft, {
      type: 'VARIABLE_ALIAS',
      id: variableId,
    });

    // And prove the deprecated accessor was never reached: it throws under
    // `documentAccess: "dynamic-page"`, which this plugin's manifest declares.
    assert.equal(mock.calls('figma.getNodeById').length, 0);
    assert.equal(mock.calls('getNodeByIdAsync').length, 1);
  });

  it('refuses to bind a page', async () => {
    createFigmaMock().withPage('Page 1').install();
    const pageId = figma.root.children[0].id;

    await assert.rejects(
      () => executeOperation({ kind: 'BIND_VARIABLE', nodeId: pageId, property: 'x', variableId: 'v' }),
      /cannot be bound to/,
    );
  });
});

describe('operationExecutor — style bindings', () => {
  useFigmaMock();

  const INTER = { family: 'Inter', style: 'Regular' };
  const TEXT_PROPS = {
    fontFamily: 'Inter',
    fontStyle: 'Regular',
    fontSize: 16,
    lineHeight: { unit: 'PERCENT', value: 150 },
    letterSpacing: { unit: 'PIXELS', value: 0 },
    textCase: 'ORIGINAL',
    textDecoration: 'NONE',
  };
  const CLEARED = ['fontFamily', 'fontStyle', 'fontWeight', 'fontSize', 'letterSpacing', 'lineHeight'].map((field) => [
    'style.setBoundVariable',
    field,
    null,
  ]);

  /** A text style Figma already holds, and a FLOAT variable to bind it to. */
  async function textFile() {
    const mock = createFigmaMock().withFonts([INTER]).withCollection('Demo').withVariable('Demo', 'Demo/font/size/md', 'FLOAT').install();
    await figma.loadFontAsync(INTER);
    return { mock, sizeId: mock.variable('Demo', 'Demo/font/size/md')!.id };
  }

  const styleWrites = (mock: FigmaMockHandle) =>
    mock
      .calls()
      .filter((call) => call.api === 'style.setBoundVariable' || call.api === 'style.fontName')
      .map((call) => [call.api, ...call.args]);

  it('clears every bindable text field on update, then writes, then binds', async () => {
    // A bound field ignores a written value: without the clear, a member that
    // stopped being a reference would go on following the old variable.
    const { mock, sizeId } = await textFile();
    const style = figma.createTextStyle();

    await executeOperation({
      kind: 'UPDATE_STYLE',
      styleId: style.id,
      props: TEXT_PROPS,
      tokenPath: 'Demo.text.body',
      bindings: [{ field: 'fontSize', variableId: sizeId }],
    });

    assert.deepEqual(styleWrites(mock), [...CLEARED, ['style.fontName', INTER], ['style.setBoundVariable', 'fontSize', sizeId]]);
    assert.deepEqual(mock.styles('TEXT')[0].boundVariables, {
      fontSize: { type: 'VARIABLE_ALIAS', id: sizeId },
    });
  });

  it('writes, then binds, a text style it creates', async () => {
    const { mock, sizeId } = await textFile();

    await executeOperation({
      kind: 'CREATE_STYLE',
      styleType: 'TEXT',
      name: 'Demo/text/body',
      props: TEXT_PROPS,
      tokenPath: 'Demo.text.body',
      bindings: [{ field: 'fontSize', variableId: sizeId }],
    });

    assert.deepEqual(styleWrites(mock), [
      ['style.fontName', INTER],
      ['style.setBoundVariable', 'fontSize', sizeId],
    ]);
  });

  it('binds an effect layer through setBoundVariableForEffect, assigning effects once', async () => {
    const mock = createFigmaMock()
      .withCollection('Demo')
      .withVariable('Demo', 'Demo/color/shade', 'COLOR')
      .withStyle('EFFECT', 'Demo/effects/raised', { effects: [] })
      .install();
    const shadeId = mock.variable('Demo', 'Demo/color/shade')!.id;
    const layer = (y: number) => ({
      type: 'DROP_SHADOW',
      color: { r: 0, g: 0, b: 0, a: 0.4 },
      offset: { x: 0, y },
      radius: 2 * y,
      spread: 0,
      visible: true,
      blendMode: 'NORMAL',
    });

    await executeOperation({
      kind: 'UPDATE_STYLE',
      styleId: mock.styles('EFFECT')[0].id,
      props: { effects: [layer(1), layer(4)] },
      tokenPath: 'Demo.effects.raised',
      bindings: [{ field: 'color', variableId: shadeId, index: 1 }],
    });

    assert.deepEqual(
      mock.calls('setBoundVariableForEffect').map((call) => call.args),
      [['color', shadeId]],
    );
    assert.equal(mock.calls('style.effects').length, 1, 'effects is assigned once');
    const effects = mock.styles('EFFECT')[0].effects as Array<{ boundVariables?: unknown }>;
    assert.equal(effects[0].boundVariables, undefined);
    assert.deepEqual(effects[1].boundVariables, { color: { type: 'VARIABLE_ALIAS', id: shadeId } });
  });

  it('fails the operation, leaving no style behind, when a variable is missing', async () => {
    const { mock } = await textFile();

    const summary = await runOperations(
      [
        {
          kind: 'CREATE_STYLE',
          styleType: 'TEXT',
          name: 'Demo/text/body',
          props: TEXT_PROPS,
          tokenPath: 'Demo.text.body',
          bindings: [{ field: 'fontSize', variableId: 'VariableID:gone' }],
        },
      ],
      { onProgress: noProgress },
    );

    assert.equal(summary.failed, 1);
    assert.match(summary.results[0].reason ?? '', /Variable not found: VariableID:gone/);
    assert.deepEqual(mock.styles('TEXT'), []);
  });
});

describe('batchRunner — failure semantics', () => {
  useFigmaMock();

  const collectionPlan = (): Operation[] => [
    { kind: 'CREATE_COLLECTION', symbolicId: '$col:Demo', name: 'Demo', modes: ['light', 'dark', 'sepia'] },
    {
      kind: 'CREATE_VARIABLE',
      symbolicId: '$var:Demo/a',
      collectionId: '$col:Demo',
      path: 'Demo/a',
      variableType: 'FLOAT',
    },
    {
      kind: 'SET_VARIABLE_VALUE',
      variableId: '$var:Demo/a',
      modeId: '$mode:Demo/light',
      value: 1,
      label: 'Demo/a [light]',
      tokenPath: 'Demo.a',
      modeName: 'light',
    },
  ];

  it('reports a cascade as one failure and skipped prerequisites', async () => {
    const mock = createFigmaMock().withModeCap(2).install();

    const summary = await runOperations(collectionPlan(), { onProgress: noProgress });

    assert.equal(summary.failed, 1, 'only the operation that actually failed');
    assert.equal(summary.skipped, 2, 'its dependents are skipped, not counted as errors');
    assert.ok(
      summary.results.some((r) => r.status === 'skipped' && /prerequisite failed: \$col:Demo/.test(r.reason ?? '')),
      'and the reason names the prerequisite, not "Unresolved symbolic ID"',
    );
    assert.deepEqual(mock.collections(), []);
  });

  it('counts a cancelled operation apart from a failed one', async () => {
    createFigmaMock().install();

    // Abort before the run starts: nothing is attempted.
    const summary = await runOperations(collectionPlan(), {
      onProgress: noProgress,
      signal: { aborted: true },
    });

    assert.equal(summary.cancelled, 3);
    assert.equal(summary.failed, 0, 'a deliberate stop is not an error');
  });

  it('fails the one operation whose symbol was never created', async () => {
    createFigmaMock().install();

    const ops: Operation[] = [
      {
        kind: 'SET_VARIABLE_VALUE',
        variableId: '$var:never-created',
        modeId: '$mode:Demo/light',
        value: 1,
        label: 'orphan [light]',
        tokenPath: 'Demo.orphan',
        modeName: 'light',
      },
    ];

    const summary = await runOperations(ops, { onProgress: noProgress });

    // The plan-time check in `planSymbols` reports this before a run starts;
    // this is the backstop for a plan that reached execution anyway.
    assert.equal(summary.failed, 1);
  });
});

describe('operationExecutor — SET_CODE_SYNTAX', () => {
  useFigmaMock();

  it('writes the web code syntax of a variable', async () => {
    const mock = createFigmaMock().withCollection('Demo', ['default']).withVariable('Demo', 'color/primary', 'COLOR').install();
    const variable = mock.variable('Demo', 'color/primary')!;

    await executeOperation({
      kind: 'SET_CODE_SYNTAX',
      variableId: variable.id,
      platform: 'WEB',
      value: 'var(--color-primary)',
      path: 'Demo.color.primary',
    });

    assert.deepEqual(variable.codeSyntax, { WEB: 'var(--color-primary)' }, 'and no other platform');
  });

  it('writes it to a variable the same run created, through its symbolic id', async () => {
    const mock = createFigmaMock().install();
    const ops: Operation[] = [
      { kind: 'CREATE_COLLECTION', symbolicId: '$col:Demo', name: 'Demo', modes: ['default'] },
      { kind: 'CREATE_VARIABLE', symbolicId: '$var:Demo/a', collectionId: '$col:Demo', path: 'a', variableType: 'FLOAT' },
      { kind: 'SET_CODE_SYNTAX', variableId: '$var:Demo/a', platform: 'WEB', value: 'var(--a)', path: 'Demo.a' },
    ];

    const summary = await runOperations(ops, { onProgress: noProgress });

    assert.equal(summary.failed, 0);
    assert.equal(mock.variable('Demo', 'a')!.codeSyntax.WEB, 'var(--a)');
  });

  it('is skipped as a prerequisite when the variable it names failed to be created', async () => {
    createFigmaMock().install();
    const ops: Operation[] = [
      // No such collection: the create fails, and the syntax has nothing to be written to.
      { kind: 'CREATE_VARIABLE', symbolicId: '$var:Demo/a', collectionId: 'VariableCollectionId:none', path: 'a', variableType: 'FLOAT' },
      { kind: 'SET_CODE_SYNTAX', variableId: '$var:Demo/a', platform: 'WEB', value: 'var(--a)', path: 'Demo.a' },
    ];

    const summary = await runOperations(ops, { onProgress: noProgress });

    assert.equal(summary.failed, 1, 'only the create');
    assert.match(summary.results[1].reason ?? '', /prerequisite failed/);
  });
});

describe('operationExecutor — labels', () => {
  useFigmaMock();

  it('labels every operation kind without leaking "undefined"', () => {
    const ops: Operation[] = [
      { kind: 'CREATE_COLLECTION', name: 'Demo', modes: ['light'] },
      { kind: 'ADD_MODE', collectionId: 'c', collectionName: 'Demo', modeName: 'dark' },
      { kind: 'CREATE_VARIABLE', collectionId: 'c', path: 'Demo/a', variableType: 'FLOAT' },
      {
        kind: 'SET_VARIABLE_VALUE',
        variableId: 'v',
        modeId: 'm',
        value: 1,
        label: 'Demo/a [light]',
        tokenPath: 'Demo.a',
        modeName: 'light',
      },
      { kind: 'RENAME_VARIABLE', variableId: 'v', name: 'Demo/b', path: 'Demo.b' },
      { kind: 'SET_CODE_SYNTAX', variableId: 'v', platform: 'WEB', value: 'var(--a)', path: 'Demo.a' },
      { kind: 'CREATE_STYLE', styleType: 'TEXT', name: 'Demo/body', props: {}, tokenPath: 'Demo.body' },
      { kind: 'UPDATE_STYLE', styleId: 's', props: {}, tokenPath: 'Demo.body' },
      { kind: 'BIND_VARIABLE', nodeId: 'n', property: 'p', variableId: 'v' },
      { kind: 'UNBIND_VARIABLE', nodeId: 'n', property: 'p' },
      { kind: 'SKIP', reason: 'unchanged', path: 'Demo.a' },
      { kind: 'WARNING', message: 'careful' },
      { kind: 'DELETE_MODE', collectionId: 'c', collectionName: 'Demo', modeId: 'm', modeName: 'dark' },
      { kind: 'BREAKING', message: 'the mode "dark" of collection "Demo" is gone' },
    ];

    for (const op of ops) {
      const label = labelForOperation(op);
      assert.ok(label.length > 0, `${op.kind} has no label`);
      assert.doesNotMatch(label, /undefined/, `${op.kind} label leaks undefined`);
    }
  });
});

describe('operationExecutor — DELETE_MODE', () => {
  useFigmaMock();

  const file = () =>
    createFigmaMock()
      .withCollection('state', ['rest', 'hover', 'pressed'])
      .withVariable('state', 'button/bg', 'FLOAT', { rest: 1, hover: 2, pressed: 3 })
      .install();
  const deleteOf = (mock: FigmaMockHandle, mode: string): Operation => ({
    kind: 'DELETE_MODE',
    collectionId: mock.collection('state')!.id,
    collectionName: 'state',
    modeId: mock.collection('state')!.modes.find((m) => m.name === mode)!.modeId,
    modeName: mode,
  });

  it('removes the mode, and the values in it with it', async () => {
    const mock = file();
    const pressed = mock.collection('state')!.modes[2].modeId;

    await executeOperation(deleteOf(mock, 'pressed'));

    assert.deepEqual(
      mock.collection('state')!.modes.map((m) => m.name),
      ['rest', 'hover'],
    );
    assert.ok(!(pressed in mock.variable('state', 'button/bg')!.valuesByMode));
    assert.equal(Object.keys(mock.variable('state', 'button/bg')!.valuesByMode).length, 2);
  });

  it('refuses to delete the default mode, which would promote another', async () => {
    const mock = file();

    await assert.rejects(() => executeOperation(deleteOf(mock, 'rest')), /default mode "rest" of collection "state" is never deleted/);
    assert.equal(mock.collection('state')!.modes.length, 3);
  });

  it('is a row to the runner when it is a BREAKING, and a write when it is a DELETE_MODE', async () => {
    const mock = file();
    const ops: Operation[] = [{ kind: 'BREAKING', message: 'the mode "pressed" of collection "state" is gone' }, deleteOf(mock, 'pressed')];

    const summary = await runOperations(ops, { onProgress: noProgress });

    assert.deepEqual(
      summary.results.map((r) => [r.operation.kind, r.status]),
      [
        ['BREAKING', 'skipped'],
        ['DELETE_MODE', 'applied'],
      ],
    );
    assert.equal(labelForOperation(ops[1]), 'Deleting mode "pressed" of "state"');
  });
});
