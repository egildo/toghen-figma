/**
 * What a variable is for: its scopes, and whether it is an opacity held as a percentage.
 *
 * Synthetic tokens in the W3C structured shapes (`{colorSpace, components}` colours, `{value, unit}` dimensions,
 * `fontFamily` arrays, typography and shadow composites whose members are references). The plan is read from
 * the engine; Figma is the mock.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver, type ResolverDocument } from '@toghen/lib';
import { VariableSyncEngine, type VariablePlan } from '../main/engines/variableSyncEngine.js';
import { runOperations } from '../main/engines/batchRunner.js';
import { figmaValuesEqual, toFigmaValue } from '../main/utils/figmaTokenAdapter.js';
import { defaultTokenTypeMap } from '../shared/tokenTypeMap.js';
import type { Operation } from '../shared/operations.js';
import { createFigmaMock, useFigmaMock } from './support/figmaMock.js';
import { stampAsHeld } from './support/stamps.js';

const px = (value: number) => ({ value, unit: 'px' });
const srgb = (...components: number[]) => ({ colorSpace: 'srgb', components });
const scopes = (...list: string[]) => ({ $extensions: { 'com.toghen': { figma: { scopes: list } } } });

type Doc = Record<string, unknown>;

/** A document of one set, optionally with a `theme` modifier (default `light`). */
function document(tokens: Doc, theme?: { light?: Doc; dark?: Doc }): ResolverDocument {
  return {
    version: '2025-11-01',
    name: 'Demo',
    sets: { base: { sources: [tokens] } },
    ...(theme ? { modifiers: { theme: { default: 'light', contexts: { light: [theme.light ?? {}], dark: [theme.dark ?? {}] } } } } : {}),
    resolutionOrder: [{ $ref: '#/sets/base' }, ...(theme ? [{ $ref: '#/modifiers/theme' }] : [])],
  } as unknown as ResolverDocument;
}

const planOf = (doc: ResolverDocument, options = {}): Promise<VariablePlan> =>
  new VariableSyncEngine().buildPlan(new Resolver(doc), 'Demo', defaultTokenTypeMap, options);

const creates = (p: VariablePlan) =>
  p.operations.filter((op): op is Extract<Operation, { kind: 'CREATE_VARIABLE' }> => op.kind === 'CREATE_VARIABLE');
/** The scopes a variable is created with, by its name. */
const scopesOf = (p: VariablePlan, name: string): string[] => {
  const found = creates(p).find((op) => op.path === name);
  assert.ok(found, `${name} is created`);
  return [...(found.scopes ?? [])].sort();
};
const valueOf = (p: VariablePlan, path: string, mode = 'default') => {
  const op = p.operations.find((o) => o.kind === 'SET_VARIABLE_VALUE' && o.tokenPath === path && o.modeName === mode);
  return op && op.kind === 'SET_VARIABLE_VALUE' ? op.value : undefined;
};
const skipsOf = (p: VariablePlan, path: string) =>
  p.operations.filter((op): op is Extract<Operation, { kind: 'SKIP' }> => op.kind === 'SKIP' && op.path === path);
const warningsOf = (p: VariablePlan, path: string) =>
  p.operations.filter((op): op is Extract<Operation, { kind: 'WARNING' }> => op.kind === 'WARNING' && op.path === path);

describe('toFigmaValue and figmaValuesEqual — an opacity in percent', () => {
  it('writes an opacity × 100, rounded to what a float can say, and leaves every other number alone', () => {
    assert.equal(toFigmaValue(1, 'number', 'percent'), 100);
    assert.equal(toFigmaValue(0.55, 'number', 'percent'), 55);
    assert.equal(toFigmaValue(0.07, 'number', 'percent'), 7);
    assert.equal(toFigmaValue(0.55, 'number'), 0.55);
    assert.equal(toFigmaValue(px(4), 'dimension'), 4);
  });

  it('compares what Figma holds with the percentage, within float32', () => {
    assert.equal(figmaValuesEqual(Math.fround(33.3), toFigmaValue(0.333, 'number', 'percent')), true);
    assert.equal(
      figmaValuesEqual(0.55, toFigmaValue(0.55, 'number', 'percent')),
      false,
      'a variable written as 0 to 1 is not the percentage',
    );
  });
});

describe('VariableSyncEngine — the name is a source of purpose', () => {
  useFigmaMock();

  const tokens = {
    button: {
      backgroundColor: { $type: 'color', $value: srgb(0.9, 0.9, 0.9) },
      color: { $type: 'color', $value: srgb(0, 0, 0) },
      borderColor: { $type: 'color', $value: srgb(0.5, 0.5, 0.5) },
      borderWidth: { $type: 'dimension', $value: px(1) },
      borderRadius: { $type: 'dimension', $value: px(6) },
      paddingBlock: { $type: 'dimension', $value: px(8) },
      gap: { $type: 'dimension', $value: px(4) },
      width: { $type: 'dimension', $value: px(120) },
      opacity: { $type: 'number', $value: 0.55 },
      unrelated: { $type: 'dimension', $value: px(3) },
    },
  };

  it('scopes a token by its last key, through the table component files bind with', async () => {
    createFigmaMock().install();
    const p = await planOf(document(tokens));

    assert.deepEqual(scopesOf(p, 'button/backgroundColor'), ['FRAME_FILL', 'SHAPE_FILL']);
    assert.deepEqual(scopesOf(p, 'button/color'), ['TEXT_FILL']);
    assert.deepEqual(scopesOf(p, 'button/borderColor'), ['STROKE_COLOR']);
    assert.deepEqual(scopesOf(p, 'button/borderWidth'), ['STROKE_FLOAT']);
    assert.deepEqual(scopesOf(p, 'button/borderRadius'), ['CORNER_RADIUS']);
    assert.deepEqual(scopesOf(p, 'button/paddingBlock'), ['GAP']);
    assert.deepEqual(scopesOf(p, 'button/gap'), ['GAP']);
    assert.deepEqual(scopesOf(p, 'button/width'), ['WIDTH_HEIGHT']);
    assert.deepEqual(scopesOf(p, 'button/opacity'), ['OPACITY']);
    // A key the table does not have falls to the type: a dimension.
    assert.deepEqual(scopesOf(p, 'button/unrelated'), ['CORNER_RADIUS', 'GAP', 'STROKE_FLOAT', 'WIDTH_HEIGHT']);
  });

  it('carries the record key of the variable the scopes belong to', async () => {
    createFigmaMock().install();
    const create = creates(await planOf(document(tokens))).find((op) => op.path === 'button/gap');
    assert.equal(create?.tokenPath, 'Demo.button.gap');
  });

  it('writes an opacity found by name as a percentage', async () => {
    createFigmaMock().install();
    const p = await planOf(document(tokens));
    assert.equal(valueOf(p, 'Demo.button.opacity'), 55);
  });

  it('puts the scopes on the variable Figma makes', async () => {
    const mock = createFigmaMock().install();
    const p = await planOf(document(tokens));
    await runOperations(p.operations, { onProgress: () => {} });
    assert.deepEqual(mock.variable('Demo', 'button/gap')!.scopes, ['GAP']);
    assert.equal(mock.valueFor('Demo', 'button/opacity', 'default'), 55);
  });
});

describe('VariableSyncEngine — a declaration wins', () => {
  useFigmaMock();

  it('scopes a token by its own list, over its name and its type', async () => {
    createFigmaMock().install();
    const p = await planOf(
      document({
        button: { gap: { $type: 'dimension', $value: px(4), ...scopes('WIDTH_HEIGHT') } },
        surface: { edge: { $type: 'color', $value: srgb(0, 0, 0), ...scopes('STROKE_COLOR', 'EFFECT_COLOR') } },
      }),
    );
    assert.deepEqual(scopesOf(p, 'button/gap'), ['WIDTH_HEIGHT']);
    assert.deepEqual(scopesOf(p, 'surface/edge'), ['EFFECT_COLOR', 'STROKE_COLOR']);
  });

  it('reads the nearest holder: the token, then each group above it, up to the root', async () => {
    createFigmaMock().install();
    const doc = document({
      ...scopes('GAP'),
      space: {
        ...scopes(),
        md: { $type: 'dimension', $value: px(16) },
        inner: {
          ...scopes('CORNER_RADIUS'),
          sm: { $type: 'dimension', $value: px(4) },
          own: { $type: 'dimension', $value: px(2), ...scopes('WIDTH_HEIGHT') },
        },
      },
      top: { $type: 'dimension', $value: px(1) },
    });
    const p = await planOf(doc);

    assert.deepEqual(scopesOf(p, 'space/md'), [], 'a group that declares [] hides what is in it');
    assert.deepEqual(scopesOf(p, 'space/inner/sm'), ['CORNER_RADIUS'], 'the nearest group wins');
    assert.deepEqual(scopesOf(p, 'space/inner/own'), ['WIDTH_HEIGHT'], 'the token wins over its group');
    assert.deepEqual(scopesOf(p, 'top'), ['GAP'], 'the root is a holder too');
  });

  it('hides a variable with [] and still lets it be an alias target', async () => {
    const mock = createFigmaMock().install();
    const p = await planOf(
      document({
        primitive: { ...scopes(), blue: { $type: 'color', $value: srgb(0, 0, 1) } },
        button: { backgroundColor: { $type: 'color', $value: '{primitive.blue}' } },
      }),
    );
    assert.deepEqual(scopesOf(p, 'primitive/blue'), []);
    // The primitive stays hidden whatever refers to it; the referrer is scoped by its name.
    assert.deepEqual(scopesOf(p, 'button/backgroundColor'), ['FRAME_FILL', 'SHAPE_FILL']);
    await runOperations(p.operations, { onProgress: () => {} });
    assert.deepEqual(mock.variable('Demo', 'primitive/blue')!.scopes, []);
    const alias = mock.valueFor('Demo', 'button/backgroundColor', 'default') as { type: string; id: string };
    assert.equal(alias.type, 'VARIABLE_ALIAS');
    assert.equal(alias.id, mock.variable('Demo', 'primitive/blue')!.id);
  });

  it('refuses a declaration Figma or Toghen cannot take, one skip naming the token and the reason', async () => {
    createFigmaMock().install();
    const dim = (list: unknown) => ({ $type: 'dimension', $value: px(1), $extensions: { 'com.toghen': { figma: { scopes: list } } } });
    const p = await planOf(
      document({
        notAList: { $type: 'dimension', $value: px(1), $extensions: { 'com.toghen': { figma: { scopes: 'GAP' } } } },
        unknownName: dim(['SPACING']),
        paintOpacity: dim(['COLOR_OPACITY']),
        opacityMixed: { $type: 'number', $value: 0.5, ...scopes('OPACITY', 'GAP') },
        allScopesMixed: dim(['ALL_SCOPES', 'GAP']),
        allFillsMixed: { $type: 'color', $value: srgb(0, 0, 0), ...scopes('ALL_FILLS', 'FRAME_FILL') },
        fillOnNumber: dim(['FRAME_FILL']),
        opacityOnColor: { $type: 'color', $value: srgb(0, 0, 0), ...scopes('OPACITY') },
        fine: dim(['GAP']),
      }),
    );

    const reasons: Record<string, RegExp> = {
      notAList: /list of Figma scope names/,
      unknownName: /"SPACING" is not a scope Figma has/,
      paintOpacity: /COLOR_OPACITY is not supported/,
      opacityMixed: /OPACITY cannot be listed with other scopes/,
      allScopesMixed: /ALL_SCOPES cannot be listed with other scopes/,
      allFillsMixed: /ALL_FILLS cannot be listed with FRAME_FILL/,
      fillOnNumber: /FRAME_FILL does not suit a FLOAT variable/,
      opacityOnColor: /OPACITY does not suit a COLOR variable/,
    };
    for (const [key, reason] of Object.entries(reasons)) {
      const skips = skipsOf(p, `Demo.${key}`);
      assert.equal(skips.length, 1, `${key} is skipped once`);
      assert.match(skips[0].reason, new RegExp(`^"Demo\\.${key}" has figma\\.scopes `));
      assert.match(skips[0].reason, reason);
      assert.match(skips[0].reason, /; skipped\.$/);
      assert.equal(skips[0].reported, true);
      assert.ok(!creates(p).some((op) => op.path === key), `${key} is not created`);
    }
    assert.deepEqual(scopesOf(p, 'fine'), ['GAP']);
  });

  it('refuses a context that redefines the list, naming the token and the context', async () => {
    createFigmaMock().install();
    const p = await planOf(
      document(
        { button: { gap: { $type: 'dimension', $value: px(4), ...scopes('GAP') } } },
        { dark: { button: { gap: { $type: 'dimension', $value: px(2), ...scopes('WIDTH_HEIGHT') } } } },
      ),
    );
    const skips = skipsOf(p, 'Demo.button.gap');
    assert.equal(skips.length, 1);
    assert.equal(
      skips[0].reason,
      '"Demo.button.gap" redefines figma.scopes in theme=dark, and a variable has one list for all its modes; skipped.',
    );
  });

  it('accepts a context that repeats the same list', async () => {
    createFigmaMock().install();
    const p = await planOf(
      document(
        { button: { gap: { $type: 'dimension', $value: px(4), ...scopes('GAP') } } },
        { dark: { button: { gap: { $type: 'dimension', $value: px(2), ...scopes('GAP') } } } },
      ),
    );
    assert.deepEqual(scopesOf(p, 'button/gap'), ['GAP']);
  });

  it('makes a token an opacity when its list holds OPACITY', async () => {
    createFigmaMock().install();
    const p = await planOf(document({ chip: { alpha: { $type: 'number', $value: 0.25, ...scopes('OPACITY') } } }));
    assert.deepEqual(scopesOf(p, 'chip/alpha'), ['OPACITY']);
    assert.equal(valueOf(p, 'Demo.chip.alpha'), 25);
  });

  it('judges a folded part by its rest token, and warns of a list the part declares', async () => {
    createFigmaMock().install();
    const doc = document({
      $extensions: { 'com.toghen': { css: { parts: { pointer: { hover: ':hover' } } } } },
      button: {
        gap: { $type: 'dimension', $value: px(4) },
        hover: { gap: { $type: 'dimension', $value: px(6), ...scopes('WIDTH_HEIGHT') } },
      },
    });
    const p = await planOf(doc);
    assert.deepEqual(scopesOf(p, 'button/gap'), ['GAP'], 'the variable is judged on its rest token');
    const said = p.operations.filter((op) => op.kind === 'WARNING' && /declares figma\.scopes/.test(op.message));
    assert.equal(said.length, 1);
    assert.match(
      (said[0] as { message: string }).message,
      /"Demo\.button\.hover\.gap" declares figma\.scopes, but it is folded into "Demo\.button\.gap"/,
    );
  });
});

describe('VariableSyncEngine — purpose flows along references', () => {
  useFigmaMock();

  it('gives a primitive the union of what refers to it', async () => {
    createFigmaMock().install();
    const p = await planOf(
      document({
        blue: { $type: 'color', $value: srgb(0, 0, 1) },
        button: { backgroundColor: { $type: 'color', $value: '{blue}' }, borderColor: { $type: 'color', $value: '{blue}' } },
      }),
    );
    assert.deepEqual(scopesOf(p, 'blue'), ['FRAME_FILL', 'SHAPE_FILL', 'STROKE_COLOR']);
  });

  it('walks through tokens that have no purpose of their own, in two hops, and makes the primitive an opacity', async () => {
    createFigmaMock().install();
    const p = await planOf(
      document({
        raw: { $type: 'number', $value: 0.5 },
        mid: { $type: 'number', $value: '{raw}' },
        alias: { $type: 'number', $value: '{mid}' },
        button: { opacity: { $type: 'number', $value: '{alias}' } },
      }),
    );
    for (const name of ['raw', 'mid', 'alias']) assert.deepEqual(scopesOf(p, name), ['OPACITY'], name);
    assert.equal(valueOf(p, 'Demo.raw'), 50);
    // The aliases hold: same unit all the way.
    assert.deepEqual(
      p.operations.filter((op) => op.kind === 'WARNING'),
      [],
    );
    const alias = valueOf(p, 'Demo.button.opacity') as { type?: string };
    assert.equal(alias.type, 'VARIABLE_ALIAS');
  });

  it('stops the walk at a token with a purpose of its own', async () => {
    createFigmaMock().install();
    const p = await planOf(
      document({
        raw: { $type: 'dimension', $value: px(4) },
        spacer: { $type: 'dimension', $value: '{raw}', ...scopes('WIDTH_HEIGHT') },
        button: { gap: { $type: 'dimension', $value: '{spacer}' } },
      }),
    );
    assert.deepEqual(scopesOf(p, 'spacer'), ['WIDTH_HEIGHT'], 'the declaration is its own');
    assert.deepEqual(scopesOf(p, 'raw'), ['WIDTH_HEIGHT'], 'what reaches raw is the nearest purpose, spacer’s');
  });

  it('gives nothing from a referrer that declares []', async () => {
    createFigmaMock().install();
    const p = await planOf(
      document({
        raw: { $type: 'dimension', $value: px(4) },
        hidden: { $type: 'dimension', $value: '{raw}', ...scopes() },
      }),
    );
    // Nothing reaches raw, so it falls to the type.
    assert.deepEqual(scopesOf(p, 'raw'), ['CORNER_RADIUS', 'GAP', 'STROKE_FLOAT', 'WIDTH_HEIGHT']);
  });

  it('normalises a union: ALL_FILLS absorbs the fill scopes, ALL_SCOPES absorbs the rest', async () => {
    createFigmaMock().install();
    const p = await planOf(
      document({
        blue: { $type: 'color', $value: srgb(0, 0, 1) },
        red: { $type: 'color', $value: srgb(1, 0, 0) },
        button: { backgroundColor: { $type: 'color', $value: '{blue}' }, borderColor: { $type: 'color', $value: '{red}' } },
        card: {
          surface: { $type: 'color', $value: '{blue}', ...scopes('ALL_FILLS') },
          anything: { $type: 'color', $value: '{red}', ...scopes('ALL_SCOPES') },
        },
      }),
    );
    assert.deepEqual(scopesOf(p, 'blue'), ['ALL_FILLS'], 'ALL_FILLS beside FRAME_FILL and SHAPE_FILL would be refused by Figma');
    assert.deepEqual(scopesOf(p, 'red'), ['ALL_SCOPES']);
  });

  it('takes the field of a member of a composite that refers to it', async () => {
    createFigmaMock().install();
    const p = await planOf(
      document({
        size: {
          md: { $type: 'dimension', $value: px(16) },
          blur: { $type: 'dimension', $value: px(8) },
          edge: { $type: 'dimension', $value: px(1) },
        },
        weight: { $type: 'fontWeight', $value: 500 },
        tint: { $type: 'color', $value: srgb(0, 0, 0) },
        outline: { $type: 'color', $value: srgb(1, 0, 0) },
        text: {
          body: {
            $type: 'typography',
            $value: {
              fontFamily: ['Inter', 'sans-serif'],
              fontSize: '{size.md}',
              fontWeight: '{weight}',
              lineHeight: 1.5,
              letterSpacing: px(0),
            },
          },
        },
        shadow: {
          raised: { $type: 'shadow', $value: { color: '{tint}', offsetX: px(0), offsetY: px(2), blur: '{size.blur}', spread: px(0) } },
        },
        frame: { border: { $type: 'border', $value: { color: '{outline}', width: '{size.edge}', style: 'solid' } } },
      }),
    );
    assert.deepEqual(scopesOf(p, 'size/md'), ['FONT_SIZE']);
    assert.deepEqual(scopesOf(p, 'weight'), ['FONT_WEIGHT']);
    assert.deepEqual(scopesOf(p, 'size/blur'), ['EFFECT_FLOAT']);
    assert.deepEqual(scopesOf(p, 'tint'), ['EFFECT_COLOR']);
    assert.deepEqual(scopesOf(p, 'outline'), ['STROKE_COLOR']);
    assert.deepEqual(scopesOf(p, 'size/edge'), ['STROKE_FLOAT']);
  });

  it('reads every mode of the sum: a reference made in one context counts', async () => {
    createFigmaMock().install();
    const p = await planOf(
      document(
        {
          raw: { $type: 'number', $value: 0.5 },
          other: { $type: 'number', $value: 0.25 },
          button: { opacity: { $type: 'number', $value: '{raw}' } },
        },
        { dark: { button: { opacity: { $type: 'number', $value: '{other}' } } } },
      ),
    );
    assert.deepEqual(scopesOf(p, 'raw'), ['OPACITY']);
    assert.deepEqual(scopesOf(p, 'other'), ['OPACITY']);
  });

  it('keeps a token plain when an opacity and a gap meet on it, and writes the opacity as its own value', async () => {
    createFigmaMock().install();
    const p = await planOf(
      document({
        half: { $type: 'number', $value: 0.5 },
        button: { opacity: { $type: 'number', $value: '{half}' }, gap: { $type: 'number', $value: '{half}' } },
      }),
    );
    assert.deepEqual(scopesOf(p, 'half'), ['GAP'], 'the union without OPACITY');
    assert.equal(valueOf(p, 'Demo.half'), 0.5, 'plain: its CSS value');
    assert.equal(valueOf(p, 'Demo.button.opacity'), 50, 'the opacity is written as its own value, in percent');
    const said = warningsOf(p, 'Demo.button.opacity');
    assert.deepEqual(
      said.map((op) => op.message),
      ['"Demo.button.opacity" is an opacity and refers to "Demo.half", which is not one, so the value is written instead of an alias.'],
    );
    const gap = valueOf(p, 'Demo.button.gap') as { type?: string };
    assert.equal(gap.type, 'VARIABLE_ALIAS', 'a plain number still joins a plain number');
  });

  it('writes a plain number that refers to an opacity as its own value, and says why', async () => {
    createFigmaMock().install();
    const p = await planOf(
      document({
        half: { $type: 'number', $value: 0.5 },
        button: { opacity: { $type: 'number', $value: '{half}' } },
        card: { weight: { $type: 'number', $value: '{half}' } },
      }),
    );
    assert.deepEqual(scopesOf(p, 'half'), ['OPACITY']);
    assert.equal(valueOf(p, 'Demo.card.weight'), 0.5, 'a plain number holds its CSS value');
    assert.deepEqual(
      warningsOf(p, 'Demo.card.weight').map((op) => op.message),
      ['"Demo.card.weight" is not an opacity and refers to "Demo.half", which is one, so the value is written instead of an alias.'],
    );
  });
});

describe('VariableSyncEngine — [] hides a variable and does not decide its unit', () => {
  useFigmaMock();

  it('keeps a hidden primitive an opacity when an opacity refers to it, and the alias holds', async () => {
    const mock = createFigmaMock().install();
    const p = await planOf(
      document({
        opacity: { ...scopes(), half: { $type: 'number', $value: 0.55 } },
        button: { opacity: { $type: 'number', $value: '{opacity.half}' } },
      }),
    );
    assert.deepEqual(scopesOf(p, 'opacity/half'), [], 'hidden');
    assert.equal(valueOf(p, 'Demo.opacity.half'), 55, 'and held as a percentage');
    assert.deepEqual(scopesOf(p, 'button/opacity'), ['OPACITY']);
    assert.deepEqual(
      p.operations.filter((op) => op.kind === 'WARNING'),
      [],
    );
    await runOperations(p.operations, { onProgress: () => {} });
    const alias = mock.valueFor('Demo', 'button/opacity', 'default') as { type: string; id: string };
    assert.equal(alias.type, 'VARIABLE_ALIAS');
    assert.equal(alias.id, mock.variable('Demo', 'opacity/half')!.id);
    assert.deepEqual(mock.variable('Demo', 'opacity/half')!.scopes, []);
  });

  it('makes a hidden token named opacity an opacity', async () => {
    createFigmaMock().install();
    const p = await planOf(document({ chip: { opacity: { $type: 'number', $value: 0.25, ...scopes() } } }));
    assert.deepEqual(scopesOf(p, 'chip/opacity'), []);
    assert.equal(valueOf(p, 'Demo.chip.opacity'), 25);
  });

  it('leaves a hidden token with no opacity referrer plain', async () => {
    createFigmaMock().install();
    const p = await planOf(
      document({
        hidden: { ...scopes(), raw: { $type: 'number', $value: 0.5 } },
        card: { gap: { $type: 'number', $value: '{hidden.raw}' } },
      }),
    );
    assert.deepEqual(scopesOf(p, 'hidden/raw'), []);
    assert.equal(valueOf(p, 'Demo.hidden.raw'), 0.5);
  });

  it('carries an opacity through a hidden token to a purpose-less one it refers to', async () => {
    createFigmaMock().install();
    const p = await planOf(
      document({
        raw: { $type: 'number', $value: 0.5 },
        hidden: { ...scopes(), mid: { $type: 'number', $value: '{raw}' } },
        button: { opacity: { $type: 'number', $value: '{hidden.mid}' } },
      }),
    );
    assert.deepEqual(scopesOf(p, 'hidden/mid'), []);
    assert.deepEqual(scopesOf(p, 'raw'), ['OPACITY'], 'the hidden token gave it no scope, but passed the opacity on');
    assert.equal(valueOf(p, 'Demo.raw'), 50);
    assert.equal(valueOf(p, 'Demo.hidden.mid') && (valueOf(p, 'Demo.hidden.mid') as { type?: string }).type, 'VARIABLE_ALIAS');
    assert.deepEqual(
      p.operations.filter((op) => op.kind === 'WARNING'),
      [],
    );
  });

  it('applies the 0 to 1 guard to a hidden opacity', async () => {
    createFigmaMock().install();
    const p = await planOf(document({ chip: { opacity: { $type: 'number', $value: 55, ...scopes() } } }));
    assert.equal(skipsOf(p, 'Demo.chip.opacity').length, 1);
  });
});

describe('VariableSyncEngine — the type is a fallback, for scope only', () => {
  useFigmaMock();

  it('scopes by type, and never makes a bare number an opacity', async () => {
    createFigmaMock().install();
    const p = await planOf(
      document({
        c: { $type: 'color', $value: srgb(1, 1, 1) },
        d: { $type: 'dimension', $value: px(2) },
        w: { $type: 'fontWeight', $value: 600 },
        f: { $type: 'fontFamily', $value: ['Inter', 'sans-serif'] },
        l: { $type: 'letterSpacing', $value: px(1) },
        n: { $type: 'number', $value: 1 },
        s: { $type: 'string', $value: 'x' },
        b: { $type: 'boolean', $value: true },
      }),
    );
    assert.deepEqual(scopesOf(p, 'c'), ['ALL_FILLS', 'EFFECT_COLOR', 'STROKE_COLOR']);
    assert.deepEqual(scopesOf(p, 'd'), ['CORNER_RADIUS', 'GAP', 'STROKE_FLOAT', 'WIDTH_HEIGHT']);
    assert.deepEqual(scopesOf(p, 'w'), ['FONT_WEIGHT']);
    assert.deepEqual(scopesOf(p, 'f'), ['FONT_FAMILY']);
    assert.deepEqual(scopesOf(p, 'l'), ['LETTER_SPACING']);
    const number = scopesOf(p, 'n');
    assert.ok(!number.includes('OPACITY') && !number.includes('COLOR_OPACITY') && !number.includes('ALL_SCOPES'));
    assert.deepEqual(number, [
      'CORNER_RADIUS',
      'EFFECT_FLOAT',
      'FONT_SIZE',
      'FONT_WEIGHT',
      'GAP',
      'LETTER_SPACING',
      'LINE_HEIGHT',
      'PARAGRAPH_INDENT',
      'PARAGRAPH_SPACING',
      'STROKE_FLOAT',
      'WIDTH_HEIGHT',
    ]);
    assert.equal(valueOf(p, 'Demo.n'), 1, 'written as it is');
    assert.deepEqual(scopesOf(p, 's'), ['ALL_SCOPES']);
    assert.deepEqual(scopesOf(p, 'b'), ['ALL_SCOPES']);
  });

  it('says once what stays offered to every field, as a note and not a warning', async () => {
    createFigmaMock().install();
    const p = await planOf(
      document({
        s: { $type: 'string', $value: 'x' },
        b: { $type: 'boolean', $value: true },
        declared: { $type: 'string', $value: 'y', ...scopes('ALL_SCOPES') },
        fine: { $type: 'dimension', $value: px(1) },
      }),
    );
    const notes = p.operations.filter((op): op is Extract<Operation, { kind: 'NOTE' }> => op.kind === 'NOTE');
    assert.deepEqual(
      notes.map((op) => op.message),
      ['2 variables are offered to every field: Demo.s, Demo.b; declare figma.scopes to narrow them.'],
    );
    const summary = new VariableSyncEngine().summarizePlan(p.operations);
    assert.equal(summary.warnings, 0, 'a note is not counted as a warning');
  });

  it('says nothing when every variable has scopes', async () => {
    createFigmaMock().install();
    const p = await planOf(document({ fine: { $type: 'dimension', $value: px(1) } }));
    assert.equal(p.operations.filter((op) => op.kind === 'NOTE').length, 0);
  });
});

describe('VariableSyncEngine — an opacity is a number from 0 to 1', () => {
  useFigmaMock();

  it('refuses a percentage already written as one, naming the context', async () => {
    createFigmaMock().install();
    const p = await planOf(
      document({ button: { opacity: { $type: 'number', $value: 1 } } }, { dark: { button: { opacity: { $type: 'number', $value: 55 } } } }),
    );
    const skips = skipsOf(p, 'Demo.button.opacity');
    assert.equal(skips.length, 1);
    assert.equal(skips[0].reason, '"Demo.button.opacity" is an opacity, a number from 0 to 1, and is 55 in theme=dark; skipped.');
    assert.equal(skips[0].reported, true);
    assert.equal(creates(p).length, 0);
  });

  it('refuses a value that is not a number, in the base too', async () => {
    createFigmaMock().install();
    const p = await planOf(
      document({
        button: { opacity: { $type: 'number', $value: 55 } },
        chip: { alpha: { $type: 'dimension', $value: px(1), ...scopes('OPACITY') } },
      }),
    );
    assert.equal(
      skipsOf(p, 'Demo.button.opacity')[0].reason,
      '"Demo.button.opacity" is an opacity, a number from 0 to 1, and is 55; skipped.',
    );
    assert.match(
      skipsOf(p, 'Demo.chip.alpha')[0].reason,
      /is an opacity, a number from 0 to 1, and is \{"value":1,"unit":"px"\}; skipped\.$/,
    );
  });

  it('accepts the ends of the range', async () => {
    createFigmaMock().install();
    const p = await planOf(document({ a: { opacity: { $type: 'number', $value: 0 } }, b: { opacity: { $type: 'number', $value: 1 } } }));
    assert.equal(valueOf(p, 'Demo.a.opacity'), 0);
    assert.equal(valueOf(p, 'Demo.b.opacity'), 100);
  });

  it('refuses a primitive whose value no opacity can have, through the reference that made it one', async () => {
    createFigmaMock().install();
    const p = await planOf(document({ raw: { $type: 'number', $value: 50 }, button: { opacity: { $type: 'number', $value: '{raw}' } } }));
    assert.equal(skipsOf(p, 'Demo.raw').length, 1);
    assert.equal(skipsOf(p, 'Demo.button.opacity').length, 1, 'and so is the opacity that resolves to it');
  });
});

describe('VariableSyncEngine — a variable written as 0 to 1 before opacities were percentages', () => {
  useFigmaMock();

  it('is rewritten on the next plan, not reported as drift', async () => {
    const doc = document({ button: { opacity: { $type: 'number', $value: 0.55 } } });
    const mock = createFigmaMock()
      .withCollection('Demo', ['default'])
      .withVariable('Demo', 'button/opacity', 'FLOAT', { default: 0.55 }, ['OPACITY'])
      .install();
    mock.variable('Demo', 'button/opacity')!.setVariableCodeSyntax('WEB', 'var(--button-opacity)');
    const variable = mock.variable('Demo', 'button/opacity')!;
    // Stamped by an earlier build, which wrote the value as it was, 0 to 1.
    stampAsHeld(variable, 'Demo.button.opacity');

    const p = await planOf(doc);

    assert.equal(valueOf(p, 'Demo.button.opacity'), 55, 'rewritten in percent');
    assert.equal(skipsOf(p, 'Demo.button.opacity').filter((op) => op.reason === 'drifted').length, 0);
    assert.equal(new VariableSyncEngine().summarizePlan(p.operations).drifted, 0);
  });

  it('is left alone once it holds the percentage its stamp knows', async () => {
    const doc = document({ button: { opacity: { $type: 'number', $value: 0.55 } } });
    const mock = createFigmaMock()
      .withCollection('Demo', ['default'])
      .withVariable('Demo', 'button/opacity', 'FLOAT', { default: Math.fround(55) }, ['OPACITY'])
      .install();
    const variable = mock.variable('Demo', 'button/opacity')!;
    variable.setVariableCodeSyntax('WEB', 'var(--button-opacity)');
    // What Figma reported after a write of 55, float32 and all.
    stampAsHeld(variable, 'Demo.button.opacity');

    const again = await planOf(doc);
    assert.deepEqual(
      again.operations.filter((op) => op.kind !== 'SKIP'),
      [],
    );
    assert.equal(skipsOf(again, 'Demo.button.opacity')[0].reason, 'unchanged');
  });
});
