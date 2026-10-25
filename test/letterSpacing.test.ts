/**
 * A `letterSpacing` token in Figma: a pixel variable scoped to letter spacing, or a reported skip in em;
 * and a text style that takes its letter spacing from one. Synthetic tokens, in the structured shapes
 * and the string forms alike.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver, type ResolverDocument } from '@toghen/lib';
import { VariableSyncEngine, type VariablePlan } from '../main/engines/variableSyncEngine.js';
import { StyleSyncEngine } from '../main/engines/styleSyncEngine.js';
import { runOperations } from '../main/engines/batchRunner.js';
import { toFigmaValue } from '../main/utils/figmaTokenAdapter.js';
import { INSPECT_CORRESPONDENCE } from '../main/handlers/inspectCorrespondence.js';
import { setState } from '../main/runtimeState.js';
import { defaultTokenTypeMap } from '../shared/tokenTypeMap.js';
import type { Operation } from '../shared/operations.js';
import type { InspectionPayload, Response } from '../shared/protocol.js';
import { createFigmaMock, useFigmaMock } from './support/figmaMock.js';

const px = (value: number) => ({ value, unit: 'px' });

const type = (letterSpacing: string) => ({
  $type: 'typography' as const,
  $value: { fontFamily: ['Inter'], fontSize: px(16), fontWeight: 400, lineHeight: px(24), letterSpacing },
});

const document = (): ResolverDocument =>
  ({
    version: '2025-11-01',
    name: 'Demo',
    sets: {
      base: {
        sources: [
          {
            track: {
              $type: 'letterSpacing',
              px: { $value: px(1.5) },
              rem: { $value: { value: 0.1, unit: 'rem' } },
              str: { $value: '2px' },
              tight: { $value: { value: -0.02, unit: 'em' } },
              wide: { $value: '0.08em' },
              viaWide: { $value: '{track.wide}' },
            },
            gap: { $type: 'dimension', $value: px(4) },
            text: {
              fixed: type('{track.px}'),
              tight: type('{track.tight}'),
              wide: type('{track.wide}'),
            },
          },
        ],
      },
    },
    resolutionOrder: [{ $ref: '#/sets/base' }],
  }) as ResolverDocument;

const plan = (): Promise<VariablePlan> => new VariableSyncEngine().buildPlan(new Resolver(document()), 'Demo', defaultTokenTypeMap);

const creates = (p: VariablePlan) =>
  p.operations.filter((op): op is Extract<Operation, { kind: 'CREATE_VARIABLE' }> => op.kind === 'CREATE_VARIABLE');
const valueOf = (p: VariablePlan, path: string) => {
  const op = p.operations.find((o) => o.kind === 'SET_VARIABLE_VALUE' && o.tokenPath === path);
  return op && op.kind === 'SET_VARIABLE_VALUE' ? op.value : undefined;
};
const reported = (p: VariablePlan, path: string) =>
  p.operations.filter((op): op is Extract<Operation, { kind: 'WARNING' }> => op.kind === 'WARNING' && op.path === path);

describe('toFigmaValue — letterSpacing', () => {
  it('is pixels, rem through the library, and refuses em', () => {
    assert.equal(toFigmaValue({ value: 1.5, unit: 'px' }, 'letterSpacing'), 1.5);
    assert.equal(toFigmaValue({ value: 0.1, unit: 'rem' }, 'letterSpacing'), 1.6);
    assert.throws(() => toFigmaValue({ value: 0.08, unit: 'em' }, 'letterSpacing'), /em/);
  });
});

describe('VariableSyncEngine — letterSpacing tokens', () => {
  useFigmaMock();

  it('writes px and rem as FLOAT variables in pixels scoped to letter spacing, from strings and structured values', async () => {
    createFigmaMock().install();
    const p = await plan();

    for (const [name, pixels] of [
      ['track/px', 1.5],
      ['track/rem', 1.6],
      ['track/str', 2],
    ] as const) {
      const create = creates(p).find((op) => op.path === name);
      assert.ok(create, `${name} is created`);
      assert.equal(create.variableType, 'FLOAT');
      assert.deepEqual(create.scopes, ['LETTER_SPACING']);
      assert.equal(valueOf(p, `Demo.${name.replace('/', '.')}`), pixels);
    }
    // A dimension named for a gap is scoped to gaps, and not to letter spacing.
    const gap = creates(p).find((op) => op.path === 'gap');
    assert.deepEqual(gap?.scopes, ['GAP']);
  });

  it('skips and reports one that is in em, from a string, structured, or through a reference', async () => {
    createFigmaMock().install();
    const p = await plan();

    for (const name of ['tight', 'wide', 'viaWide']) {
      const path = `Demo.track.${name}`;
      assert.ok(!creates(p).some((op) => op.path === `track/${name}`), `${path} is not created`);
      assert.equal(valueOf(p, path), undefined);
      const rows = reported(p, path);
      assert.equal(rows.length, 1, `${path} is reported once`);
      assert.equal(
        rows[0].message,
        `"${path}" is a letter spacing in em, and a Figma variable bound to letter spacing carries pixels; skipped.`,
      );
    }
  });

  it('puts the scope on the variable Figma makes, and nothing about em in the file', async () => {
    const mock = createFigmaMock().install();
    const p = await plan();
    await runOperations(p.operations, { onProgress: () => {} });

    assert.deepEqual(mock.variable('Demo', 'track/px')!.scopes, ['LETTER_SPACING']);
    assert.deepEqual(mock.variable('Demo', 'gap')!.scopes, ['GAP']);
    assert.equal(mock.variable('Demo', 'track/wide'), undefined);
  });

  it('reports an em letter spacing as blocked, with the reason, where the Inspector looks', async () => {
    const mock = createFigmaMock().install();
    setState({ resolver: new Resolver(document()), conversionMap: defaultTokenTypeMap });
    await INSPECT_CORRESPONDENCE();

    const report = mock
      .calls('ui.postMessage')
      .map((call) => call.args[0] as Response)
      .filter((message) => message.type === 'CORRESPONDENCE')
      .at(-1);
    assert.ok(report && report.type === 'CORRESPONDENCE');
    const tokens = (report.payload as InspectionPayload).tokens;
    const wide = tokens.find((token) => token.path === 'Demo.track.wide');
    assert.equal(wide?.state, 'blocked');
    assert.equal(
      wide?.note,
      '"Demo.track.wide" is a letter spacing in em, and a Figma variable bound to letter spacing carries pixels; skipped.',
    );
    assert.equal(tokens.find((token) => token.path === 'Demo.track.px')?.state, 'absent');
  });
});

describe('StyleSyncEngine — a text style taking its letter spacing from a letterSpacing token', () => {
  useFigmaMock();

  const stylePlan = () => new StyleSyncEngine().buildPlan(new Resolver(document()), defaultTokenTypeMap);
  const styleOf = (operations: Operation[], path: string) => {
    const op = operations.find((o) => o.kind === 'CREATE_STYLE' && o.tokenPath === path);
    assert.ok(op && op.kind === 'CREATE_STYLE', `no style for ${path}`);
    return op;
  };

  it('builds from the resolved em as PERCENT and leaves the member unbound, without a warning', async () => {
    createFigmaMock().withCollection('Demo', ['default']).install();
    const { operations } = await stylePlan();

    for (const [path, percent] of [
      ['Demo.text.tight', -2],
      ['Demo.text.wide', 8],
    ] as const) {
      const style = styleOf(operations, path);
      const { letterSpacing } = style.props as { letterSpacing: { unit: string; value: number } };
      assert.equal(letterSpacing.unit, 'PERCENT');
      assert.ok(Math.abs(letterSpacing.value - percent) < 1e-9, `${path}: ${letterSpacing.value}`);
      assert.equal(style.bindings, undefined);
      assert.deepEqual(
        operations.filter((op) => op.kind === 'WARNING' && op.path === path),
        [],
      );
    }
  });

  it('binds a px letter spacing as a dimension is bound, and still writes its pixels', async () => {
    const handle = createFigmaMock().withCollection('Demo', ['default']).withVariable('Demo', 'track/px', 'FLOAT').install();
    const { operations } = await stylePlan();
    const fixed = styleOf(operations, 'Demo.text.fixed');

    assert.deepEqual(fixed.bindings, [{ field: 'letterSpacing', variableId: handle.variable('Demo', 'track/px')!.id }]);
    assert.deepEqual((fixed.props as { letterSpacing: unknown }).letterSpacing, { unit: 'PIXELS', value: 1.5 });
  });
});
