/**
 * Values the core computes, through the real engines: a colour written `color-mix()`, a dimension written `calc()`,
 * the shadow of issue #123 whose colour mixes a token with `transparent`, a gradient of a named colour and an
 * `oklch()` string. A value the core cannot compute (a mix with `currentColor`) is one skip with the core's reason.
 * Synthetic tokens in the W3C structured shapes, the Figma mock.
 */

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeColorToSRGB01, Resolver, type ResolverDocument } from '@toghen/lib';
import { VariableSyncEngine } from '../main/engines/variableSyncEngine.js';
import { StyleSyncEngine } from '../main/engines/styleSyncEngine.js';
import { run } from '../main/components/run.js';
import { readComponentFile, type Desired } from '../shared/components/index.js';
import { resetState, setState } from '../main/runtimeState.js';
import { toPaintStyleProps } from '../main/utils/figmaStyleAdapter.js';
import { defaultTokenTypeMap } from '../shared/tokenTypeMap.js';
import type { Operation } from '../shared/operations.js';
import { createFigmaMock, useFigmaMock } from './support/figmaMock.js';
import { byAddress } from './components/support.js';

const shadowOf = (color: string) => ({ color, offsetX: '0px', offsetY: '1px', blur: '2px', spread: '0px' });

const DOCUMENT = {
  version: '2025-11-01',
  name: 'Demo',
  sets: {
    base: {
      sources: [
        {
          ink: { $type: 'color', $value: { colorSpace: 'oklch', components: [0.3, 0.1, 260] } },
          paper: { $type: 'color', $value: { colorSpace: 'oklch', components: [0.95, 0.02, 90] } },
          wash: { $type: 'color', $value: 'color-mix(in oklch, {ink} 40%, {paper})' },
          glow: { $type: 'color', $value: 'color-mix(in srgb, currentColor 40%, {ink})' },
          space: { md: { $type: 'dimension', $value: { value: 1, unit: 'rem' } } },
          gap: { $type: 'dimension', $value: 'calc({space.md} * 2)' },
          shadow: {
            $type: 'shadow',
            ink: { $type: 'color', $value: { colorSpace: 'srgb', components: [0.2, 0.4, 0.6] } },
            raised: { $value: shadowOf('color-mix(in srgb, {shadow.ink} 5%, transparent)') },
            lit: { $value: shadowOf('color-mix(in srgb, currentColor 40%, {shadow.ink})') },
          },
          elevation: { card: { $type: 'shadow', $value: '{shadow.raised}' } },
          sky: {
            $type: 'gradient',
            $value: {
              type: 'linear',
              angle: '0.25turn',
              stops: [
                { color: 'rebeccapurple', position: 0 },
                { color: 'oklch(0.7 0.15 150)', position: 1 },
              ],
            },
          },
        },
      ],
    },
  },
  resolutionOrder: [{ $ref: '#/sets/base' }],
} as unknown as ResolverDocument;

type Skip = Extract<Operation, { kind: 'SKIP' }>;
const valueOf = (operations: Operation[], path: string): unknown =>
  operations.find(
    (op): op is Extract<Operation, { kind: 'SET_VARIABLE_VALUE' }> => op.kind === 'SET_VARIABLE_VALUE' && op.tokenPath === path,
  )?.value;
const styleOf = (operations: Operation[], path: string) =>
  operations.find((op): op is Extract<Operation, { kind: 'CREATE_STYLE' }> => op.kind === 'CREATE_STYLE' && op.tokenPath === path);
const near = (actual: number, expected: number, what: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${what}: ${actual} is not ${expected}`);

describe('values the core computes, in Figma', () => {
  useFigmaMock();
  afterEach(() => resetState());

  it('writes a COLOR variable from color-mix() of two oklch tokens, as the core computes the mix', async () => {
    createFigmaMock().install();
    const { operations } = await new VariableSyncEngine().buildPlan(new Resolver(DOCUMENT), 'Demo', defaultTokenTypeMap);
    const wash = valueOf(operations, 'Demo.wash') as { r: number; g: number; b: number; a: number };
    assert.ok(wash, 'the mix is written');
    const expected = normalizeColorToSRGB01('color-mix(in oklch, oklch(0.3 0.1 260) 40%, oklch(0.95 0.02 90))');
    for (const channel of ['r', 'g', 'b', 'a'] as const) near(wash[channel], expected[channel], channel);
  });

  it("skips a COLOR variable that mixes currentColor, with the core's reason, and writes the rest", async () => {
    createFigmaMock().install();
    const { operations } = await new VariableSyncEngine().buildPlan(new Resolver(DOCUMENT), 'Demo', defaultTokenTypeMap);
    const rows = operations.filter((op): op is Skip => op.kind === 'SKIP' && op.path === 'Demo.glow');
    assert.equal(rows.length, 1, JSON.stringify(rows));
    assert.equal(rows[0].cause, 'cannot-write');
    assert.match(
      rows[0].reason,
      /^"Demo\.glow" cannot be written in Demo \/ default: Token "\w+\.glow" \(mode "[^"]+"\): .*currentColor has no value until an element uses it/,
    );
    assert.equal(valueOf(operations, 'Demo.glow'), undefined, 'not half written');
    assert.ok(valueOf(operations, 'Demo.wash'), 'the plan went on');
  });

  it('writes a FLOAT variable from calc() of a rem token, in pixels', async () => {
    createFigmaMock().install();
    const { operations } = await new VariableSyncEngine().buildPlan(new Resolver(DOCUMENT), 'Demo', defaultTokenTypeMap);
    assert.equal(valueOf(operations, 'Demo.gap'), 32);
  });

  it('builds the effect style of a shadow whose colour mixes a token with transparent: the token at alpha 0.05 (issue #123)', async () => {
    createFigmaMock().install();
    const { operations } = await new StyleSyncEngine().buildPlan(new Resolver(DOCUMENT), defaultTokenTypeMap);
    const raised = styleOf(operations, 'Demo.shadow.raised');
    assert.ok(raised, JSON.stringify(operations.filter((op) => op.kind === 'SKIP')));
    const [effect] = (
      raised.props as {
        effects: Array<{
          color: { r: number; g: number; b: number; a: number };
          offset: { x: number; y: number };
          radius: number;
          spread: number;
        }>;
      }
    ).effects;
    near(effect.color.r, 0.2, 'r');
    near(effect.color.g, 0.4, 'g');
    near(effect.color.b, 0.6, 'b');
    near(effect.color.a, 0.05, 'a');
    assert.deepEqual([effect.offset.x, effect.offset.y, effect.radius, effect.spread], [0, 1, 2, 0]);
  });

  it('builds the paint style of a gradient of a named colour and an oklch() string, at an angle in turns', async () => {
    createFigmaMock().install();
    const { operations } = await new StyleSyncEngine().buildPlan(new Resolver(DOCUMENT), defaultTokenTypeMap);
    const sky = styleOf(operations, 'Demo.sky');
    assert.ok(sky);
    const [paint] = (
      sky.props as {
        paints: Array<{ gradientStops: Array<{ color: { r: number; g: number; b: number; a: number } }>; gradientTransform: unknown }>;
      }
    ).paints;
    const [purple, green] = paint.gradientStops.map((stop) => stop.color);
    near(purple.r, 0x66 / 255, 'r');
    near(purple.g, 0x33 / 255, 'g');
    near(purple.b, 0x99 / 255, 'b');
    const expected = normalizeColorToSRGB01('oklch(0.7 0.15 150)');
    for (const channel of ['r', 'g', 'b', 'a'] as const) near(green[channel], expected[channel], channel);
    const quarter = toPaintStyleProps({
      type: 'linear',
      angle: 90,
      stops: [
        { color: '#000000', position: 0 },
        { color: '#ffffff', position: 1 },
      ],
    });
    assert.deepEqual(paint.gradientTransform, (quarter.paints[0] as { gradientTransform: unknown }).gradientTransform, '0.25turn is 90deg');
  });

  it("skips a shadow that mixes currentColor, with the core's reason, and builds the rest", async () => {
    createFigmaMock().install();
    const { operations } = await new StyleSyncEngine().buildPlan(new Resolver(DOCUMENT), defaultTokenTypeMap);
    const rows = operations.filter((op): op is Skip => op.kind === 'SKIP' && op.path === 'Demo.shadow.lit');
    assert.equal(rows.length, 1, JSON.stringify(rows));
    assert.equal(rows[0].cause, 'cannot-build');
    assert.ok(rows[0].reason.startsWith('"Demo.shadow.lit" cannot be built in '), rows[0].reason);
    assert.match(rows[0].reason, /Token "Demo\.shadow\.lit" \(mode "[^"]+"\): color: .*currentColor has no value until an element uses it/);
    assert.ok(styleOf(operations, 'Demo.shadow.raised'), 'the plan went on');
  });
});

describe('a component file binding the computed shadow', () => {
  useFigmaMock();
  beforeEach(() => setState({ resolver: new Resolver(DOCUMENT) }));
  afterEach(() => resetState());

  it('binds the effect style the shadow becomes, through a reference, in a document holding a value the core refuses', async () => {
    const mock = createFigmaMock().withStyle('EFFECT', 'shadow/raised', {}).install();
    const [style] = await (
      globalThis as unknown as { figma: { getLocalEffectStylesAsync(): Promise<Array<{ id: string }>> } }
    ).figma.getLocalEffectStylesAsync();
    const file = readComponentFile(
      'component Card\nFRAME Card layoutMode=VERTICAL {\n    FRAME Box layoutMode=NONE effectStyle="{elevation.card}"\n}\n',
    );
    assert.deepEqual(
      file.problems.filter((problem) => problem.severity === 'error'),
      [],
    );
    const desired = JSON.parse(JSON.stringify({ component: file.component, members: file.members })) as Desired;
    const report = await run(desired);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assert.equal(byAddress(mock.node(report.setId!) as any).get('Box')!.effectStyleId, style.id);
  });
});
