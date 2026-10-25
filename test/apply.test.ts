/**
 * Apply: a token, or a group's tokens, on the layers of a scope, planned one operation per layer and field and written
 * through the field writer, with no stamp.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LOAD_DOCUMENT } from '../main/handlers/loadDocument.js';
import { PLAN_APPLY } from '../main/handlers/planApply.js';
import { EXECUTE_APPLY } from '../main/handlers/executeApplyBindings.js';
import { READ_SELECTION_BINDINGS } from '../main/handlers/readSelectionBindings.js';
import { resetState } from '../main/runtimeState.js';
import { applyFieldsFor } from '../shared/components/fields.js';
import type { Operation } from '../shared/operations.js';
import type { ApplyKind, Response } from '../shared/protocol.js';
import { createFigmaMock, useFigmaMock, type FigmaMockHandle } from './support/figmaMock.js';
import { oneFile } from './support/oneFile.js';

type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const DOCUMENT = {
  version: '2025-11-01',
  name: 'Core',
  sets: {
    base: {
      sources: [
        {
          badge: {
            backgroundColor: { $type: 'color', $value: { colorSpace: 'srgb', components: [0.1, 0.3, 0.5] } },
            borderRadius: { $type: 'dimension', $value: { value: 4, unit: 'px' } },
            paddingInline: { $type: 'dimension', $value: { value: 12, unit: 'px' } },
          },
          label: { color: { $type: 'color', $value: { colorSpace: 'srgb', components: [0, 0, 0] } } },
          tone: { veil: { $type: 'color', $value: { colorSpace: 'srgb', components: [0.2, 0.4, 0.6], alpha: 0.5 } } },
          space: { sm: { $type: 'dimension', $value: { value: 8, unit: 'px' } } },
          place: { inset: { $type: 'dimension', $value: { value: 1.5, unit: 'rem' } } },
        },
      ],
    },
  },
  modifiers: { scheme: { default: 'light', contexts: { light: [{}], dark: [{}] } } },
  resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/scheme' }],
};

/** The variables the sync would have made from the document; `without` leaves one out. */
async function scene(without?: string) {
  let builder = createFigmaMock().withCollection('Core', ['light']);
  const variables: [string, VariableResolvedDataType, VariableValue][] = [
    ['badge/backgroundColor', 'COLOR', { r: 0.1, g: 0.3, b: 0.5, a: 1 }],
    ['badge/borderRadius', 'FLOAT', 4],
    ['badge/paddingInline', 'FLOAT', 12],
    ['tone/veil', 'COLOR', { r: 0.2, g: 0.4, b: 0.6, a: 0.5 }],
    ['space/sm', 'FLOAT', 8],
  ];
  for (const [name, type, value] of variables) if (name !== without) builder = builder.withVariable('Core', name, type, { light: value });
  const mock = builder.install();
  await LOAD_DOCUMENT(oneFile(JSON.stringify(DOCUMENT), 'core.resolver.json'));
  return mock;
}

const frame = (name: string): Node => {
  const node = figma.createFrame() as Node;
  node.name = name;
  return node;
};

const posted = (mock: FigmaMockHandle) => mock.calls('ui.postMessage').map((call) => call.args[0] as Response);

async function plan(mock: FigmaMockHandle, tokens: string, kinds: ApplyKind[], field?: string): Promise<Operation[]> {
  await PLAN_APPLY({ tokens, scope: 'page', kinds, ...(field ? { field } : {}) });
  const answer = posted(mock).at(-1)!;
  assert.equal(answer.type, 'PLAN_READY', JSON.stringify(answer));
  assert.ok(answer.type === 'PLAN_READY');
  assert.equal(answer.payload.planType, 'apply');
  return answer.payload.operations;
}

const applies = (operations: Operation[]) =>
  operations.filter((op): op is Extract<Operation, { kind: 'APPLY_TOKEN' }> => op.kind === 'APPLY_TOKEN');

async function execute(mock: FigmaMockHandle) {
  await EXECUTE_APPLY();
  const answer = posted(mock).at(-1)!;
  assert.ok(answer.type === 'OPERATION_COMPLETE', JSON.stringify(answer));
  assert.equal(answer.payload.failed, 0, JSON.stringify(answer.payload.results.filter((result) => result.status === 'failed')));
  return answer.payload;
}

/** The ids of the variables the badge's fields are bound to, as Figma reports them. */
const badgeBindings = (node: Node) => ({
  fill: node.fills[0]?.boundVariables?.color?.id,
  corner: node.boundVariables.topLeftRadius?.id,
  left: node.boundVariables.paddingLeft?.id,
  right: node.boundVariables.paddingRight?.id,
});

const badgeVariables = (mock: FigmaMockHandle) => ({
  fill: mock.variable('Core', 'badge/backgroundColor')!.id,
  corner: mock.variable('Core', 'badge/borderRadius')!.id,
  left: mock.variable('Core', 'badge/paddingInline')!.id,
  right: mock.variable('Core', 'badge/paddingInline')!.id,
});

describe('PLAN_APPLY and EXECUTE_APPLY', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  it('plans a group on a page of frames, one operation per layer and field, and binds each after Execute', async () => {
    const mock = await scene();
    const [one, two] = [frame('One'), frame('Two')];
    const operations = await plan(mock, '{badge}', ['frames']);

    assert.deepEqual(
      applies(operations).map((op) => `${op.nodeName} ${op.field} ${op.path}`),
      ['One', 'Two'].flatMap((name) => [
        `${name} fills badge.backgroundColor`,
        `${name} cornerRadius badge.borderRadius`,
        `${name} paddingLeft badge.paddingInline`,
        `${name} paddingRight badge.paddingInline`,
      ]),
    );
    assert.deepEqual(
      operations.filter((op) => op.kind !== 'APPLY_TOKEN'),
      [],
    );

    const summary = await execute(mock);
    assert.equal(summary.applied, 8);
    assert.deepEqual(badgeBindings(one), badgeVariables(mock));
    assert.deepEqual(badgeBindings(two), badgeVariables(mock));
  });

  it('writes no stamp: the writes are the person’s', async () => {
    const mock = await scene();
    const one = frame('One');
    await plan(mock, '{badge}', ['frames']);
    await execute(mock);

    assert.deepEqual(mock.calls('node.setSharedPluginData'), []);
    assert.deepEqual(one.getSharedPluginDataKeys('toghen'), []);
  });

  it('overrides on an instance, and leaves its main component as it was', async () => {
    const mock = await scene();
    const main = figma.createComponent() as Node;
    main.name = 'Chip';
    const instance = main.createInstance() as Node;
    const fills = JSON.stringify(main.fills);
    const operations = await plan(mock, '{badge}', ['instances']);

    assert.deepEqual([...new Set(applies(operations).map((op) => op.nodeId))], [instance.id]);
    await execute(mock);
    assert.deepEqual(badgeBindings(instance), badgeVariables(mock));
    assert.deepEqual(main.boundVariables, {});
    assert.equal(JSON.stringify(main.fills), fills);
  });

  it('writes a component definition', async () => {
    const mock = await scene();
    const main = figma.createComponent() as Node;
    main.name = 'Chip';
    frame('Plain');
    const operations = await plan(mock, '{badge}', ['components']);

    assert.deepEqual([...new Set(applies(operations).map((op) => op.nodeName))], ['Chip']);
    await execute(mock);
    assert.deepEqual(badgeBindings(main), badgeVariables(mock));
  });

  it('puts one token on the field it is given', async () => {
    const mock = await scene();
    const row = frame('Row');
    row.layoutMode = 'HORIZONTAL';
    const operations = await plan(mock, 'space.sm', ['frames'], 'itemSpacing');

    assert.deepEqual(
      applies(operations).map((op) => [op.field, op.path, op.written]),
      [['itemSpacing', 'space.sm', undefined]],
    );
    await execute(mock);
    assert.equal(row.boundVariables.itemSpacing.id, mock.variable('Core', 'space/sm')!.id);
  });

  it('refuses a field the token’s type cannot reach, and writes nothing', async () => {
    const mock = await scene();
    frame('One');
    const operations = await plan(mock, 'space.sm', ['frames'], 'fills');

    assert.deepEqual(applies(operations), []);
    assert.deepEqual(operations, [
      { kind: 'WARNING', message: 'token {space.sm} is a dimension, and "fills" takes color or gradient', path: 'space.sm' },
    ]);
  });

  it('writes a dimension on a field Figma cannot bind as its value, the defaults’ context named before Execute', async () => {
    const mock = await scene();
    const one = frame('One');
    const operations = await plan(mock, 'place.inset', ['frames'], 'x');

    const [op] = applies(operations);
    assert.deepEqual([op.variableId, op.value, op.context], [undefined, 24, 'light']);
    assert.equal(op.written, `"x" of "One": the token is written as its value in "light"; it will not follow the token until the next run`);

    const summary = await execute(mock);
    assert.equal(summary.results[0].figmaId, undefined);
    assert.equal(one.x, 24);
    assert.deepEqual(one.boundVariables, {});
  });

  it('names the defaults’ context of a colour’s alpha before Execute, and writes the paint’s opacity', async () => {
    const mock = await scene();
    const one = frame('One');
    const operations = await plan(mock, 'tone.veil', ['frames'], 'fills');

    const [op] = applies(operations);
    assert.equal(op.context, 'light');
    assert.equal(
      op.written,
      `"fills" of "One": the colour's alpha is written as its value in "light"; it will not follow the token until the next run`,
    );

    const summary = await execute(mock);
    // Written in part as a value: no variable is answered for it.
    assert.equal(summary.results[0].figmaId, undefined);
    assert.equal(one.fills[0].boundVariables.color.id, mock.variable('Core', 'tone/veil')!.id);
    assert.equal(one.fills[0].opacity, 0.5);
  });

  it('says a token with no variable in this file once, as a problem row, and plans the rest', async () => {
    const mock = await scene('badge/borderRadius');
    frame('One');
    frame('Two');
    const operations = await plan(mock, '{badge}', ['frames']);

    assert.deepEqual(
      operations.filter((op) => op.kind === 'WARNING'),
      [
        {
          kind: 'WARNING',
          message:
            'token {badge.borderRadius} names no variable in this file: looked for "badge/borderRadius"; run the variable sync first',
          path: 'badge.borderRadius',
        },
      ],
    );
    assert.equal(applies(operations).length, 6);
    assert.ok(!applies(operations).some((op) => op.field === 'cornerRadius'));
  });

  it('says a key with no field on the layer as one skip row per layer', async () => {
    const mock = await scene();
    frame('One');
    const operations = await plan(mock, '{label}', ['frames']);
    assert.deepEqual(operations, [{ kind: 'SKIP', reason: '"color" has no field on this layer in Figma, skipped', path: 'One' }]);
  });

  it('reads each field of the table as bound or plain, after Apply', async () => {
    const mock = await scene();
    const one = frame('One');
    await plan(mock, '{badge}', ['frames']);
    await execute(mock);
    figma.currentPage.selection = [one];
    await READ_SELECTION_BINDINGS({ scope: 'selection' });

    const answer = posted(mock).at(-1)!;
    assert.ok(answer.type === 'SELECTION_BINDINGS');
    const rows = new Map(answer.payload.nodes[0].fields.map((row) => [row.field, row.bound]));
    assert.deepEqual(rows.get('fills'), { name: 'badge/backgroundColor', tokenPath: null });
    assert.deepEqual(rows.get('cornerRadius'), { name: 'badge/borderRadius', tokenPath: null });
    assert.equal(rows.get('paddingTop'), null);
    assert.ok(!rows.has('textStyle'));
  });

  it('says what a plain field holds, and a value Apply wrote reads as plain: no stamp says it came from a token', async () => {
    const mock = await scene();
    const one = frame('One');
    await plan(mock, '{space.sm}', ['frames'], 'x');
    await execute(mock);
    figma.currentPage.selection = [one];
    await READ_SELECTION_BINDINGS({ scope: 'selection' });

    const answer = posted(mock).at(-1)!;
    assert.ok(answer.type === 'SELECTION_BINDINGS');
    const rows = new Map(answer.payload.nodes[0].fields.map((row) => [row.field, row]));
    assert.deepEqual(rows.get('x'), { field: 'x', bound: null, holds: '8' });
    assert.deepEqual(rows.get('paddingTop'), { field: 'paddingTop', bound: null, holds: '0' });
  });
});

describe('applyFieldsFor', () => {
  it('offers one token the fields its type reaches on a frame, and none a component file writes part by part', () => {
    const dimension = applyFieldsFor('dimension');
    for (const field of ['paddingLeft', 'cornerRadius', 'itemSpacing', 'x', 'width']) assert.ok(dimension.includes(field), field);
    for (const field of ['fills', 'effects', 'layoutGrids', 'fontSize']) assert.ok(!dimension.includes(field), field);
    assert.deepEqual(applyFieldsFor('color'), ['fills', 'strokes']);
    assert.deepEqual(applyFieldsFor('number'), ['opacity', 'cornerSmoothing']);
    assert.deepEqual(applyFieldsFor('typography'), []);
    assert.deepEqual(applyFieldsFor('shadow'), []);
  });
});
