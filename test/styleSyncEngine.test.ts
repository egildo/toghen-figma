import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { installFigma } from './support/partialApi.js';
import { Resolver, type ResolverDocument } from '@toghen/lib';
import { StyleSyncEngine } from '../main/engines/styleSyncEngine.js';
import { defaultTokenTypeMap } from '../shared/tokenTypeMap.js';
import type { Operation } from '../shared/operations.js';
import { runOperations } from '../main/engines/batchRunner.js';
import { createFigmaMock, useFigmaMock, type FigmaMockHandle } from './support/figmaMock.js';
import { stampAs, stampOf } from './support/stamps.js';
import { setStamp } from '../main/components/stamp.js';

function createResolver(headingSize = 16): Resolver {
  const doc: ResolverDocument = {
    version: '2025-11-01',
    name: 'Demo',
    sets: {
      base: {
        sources: [
          {
            color: {
              primary: { $type: 'color', $value: '#0055cc' },
            },
            text: {
              heading: {
                $type: 'typography',
                $value: {
                  fontFamily: 'Inter',
                  fontSize: { value: headingSize, unit: 'px' },
                  fontWeight: 600,
                  lineHeight: { value: 24, unit: 'px' },
                  fontStyle: 'Regular',
                },
              },
            },
            effects: {
              card: {
                $type: 'shadow',
                $value: {
                  color: '#00000066',
                  offsetX: '0px',
                  offsetY: '2px',
                  blur: '8px',
                },
              },
            },
            gradients: {
              hero: {
                $type: 'gradient',
                $value: {
                  type: 'linear',
                  angle: '90deg',
                  stops: [
                    { color: '#ff0000', position: 0 },
                    { color: '#0000ff', position: 1 },
                  ],
                },
              },
            },
          },
        ],
      },
    },
    resolutionOrder: [{ $ref: '#/sets/base' }],
  };

  return new Resolver(doc);
}

/**
 * A document whose modifier declares `dark` before `light` but defaults to
 * `light` — the shape that separates "first permutation" from "default mode".
 */
function createThemedResolver(): Resolver {
  const gradient = (color: string) => ({
    $type: 'gradient' as const,
    $value: {
      type: 'linear' as const,
      angle: '90deg',
      stops: [
        { color, position: 0 },
        { color: '#000000', position: 1 },
      ],
    },
  });

  return new Resolver({
    version: '2025-11-01',
    name: 'Demo',
    sets: {
      dark: { sources: [{ gradients: { hero: gradient('#111111') } }] },
      light: { sources: [{ gradients: { hero: gradient('#eeeeee') } }] },
    },
    modifiers: {
      theme: {
        // Declaration order deliberately puts the non-default first.
        contexts: { dark: [{ $ref: '#/sets/dark' }], light: [{ $ref: '#/sets/light' }] },
        default: 'light',
      },
    },
    resolutionOrder: [{ $ref: '#/modifiers/theme' }],
  });
}

function setupFigmaMock(params?: {
  textStyles?: Array<{ id: string; name: string }>;
  effectStyles?: Array<{ id: string; name: string }>;
  paintStyles?: Array<{ id: string; name: string }>;
}): void {
  installFigma({
    getLocalTextStyles: () => params?.textStyles ?? [],
    getLocalEffectStyles: () => params?.effectStyles ?? [],
    getLocalPaintStyles: () => params?.paintStyles ?? [],
    getLocalTextStylesAsync: async () => params?.textStyles ?? [],
    getLocalEffectStylesAsync: async () => params?.effectStyles ?? [],
    getLocalPaintStylesAsync: async () => params?.paintStyles ?? [],
    listAvailableFontsAsync: async () => [{ fontName: { family: 'Inter', style: 'Regular' } }],
    // A member that refers to a token is looked up among the file's variables.
    variables: {
      getLocalVariableCollectionsAsync: async () => [],
      getLocalVariablesAsync: async () => [],
    },
  });
}

describe('StyleSyncEngine', () => {
  beforeEach(() => {
    setupFigmaMock();
  });

  it('builds create-style operations for style-routed token types', async () => {
    const resolver = createResolver();
    const engine = new StyleSyncEngine();

    const { operations } = await engine.buildPlan(resolver, defaultTokenTypeMap);

    assert.ok(operations.some((op) => op.kind === 'CREATE_STYLE' && op.styleType === 'TEXT'));
    assert.ok(operations.some((op) => op.kind === 'CREATE_STYLE' && op.styleType === 'EFFECT'));
    assert.ok(operations.some((op) => op.kind === 'CREATE_STYLE' && op.styleType === 'PAINT'));
    // A variable's token is the variable plan's, and has no row here (ruling 11b).
    assert.ok(!operations.some((op) => 'path' in op && op.path === 'Demo.color.primary'));
  });

  it('carries the token path on every style operation', async () => {
    const { operations } = await new StyleSyncEngine().buildPlan(createResolver(), defaultTokenTypeMap);

    const creates = operations.filter((op) => op.kind === 'CREATE_STYLE');
    assert.ok(creates.length > 0);
    for (const op of creates) {
      assert.ok(op.kind === 'CREATE_STYLE' && op.tokenPath.startsWith('Demo.'));
    }
  });

  it('builds styles from the default mode, not the first-declared one', async () => {
    // Regression: the engine used getPermutations()[0], which follows
    // declaration order and ignores `default`, so every style in a document
    // declaring dark before light was silently built from the dark theme.
    const { operations } = await new StyleSyncEngine().buildPlan(createThemedResolver(), defaultTokenTypeMap);

    const paint = operations.find((op) => op.kind === 'CREATE_STYLE' && op.styleType === 'PAINT');
    assert.ok(paint && paint.kind === 'CREATE_STYLE', 'a paint style should be planned');

    const props = paint.props as { paints: Array<{ gradientStops: Array<{ color: RGBA }> }> };
    const first = props.paints[0].gradientStops[0];
    assert.ok(first.color.r > 0.5, `expected the light stop, got r=${first.color.r}`);
  });

  it('names the default mode and the modes it cannot represent', async () => {
    const { operations } = await new StyleSyncEngine().buildPlan(createThemedResolver(), defaultTokenTypeMap);

    const warning = operations.find((op) => op.kind === 'WARNING');
    assert.ok(warning && warning.kind === 'WARNING');
    assert.match(warning.message, /default mode "light"/);
    assert.match(warning.message, /dark/);
  });

  it('reports a malformed style token as a warning and keeps planning', async () => {
    const doc: ResolverDocument = {
      version: '2025-11-01',
      name: 'Demo',
      sets: {
        base: {
          sources: [
            {
              text: {
                // fontSize resolves to a bare number, which is not a dimension. Lib
                // checks a value on load, so only a reference can carry this far.
                size: { $type: 'number', $value: 16 },
                broken: {
                  $type: 'typography',
                  $value: { fontFamily: 'Inter', fontSize: '{text.size}', fontWeight: 400, lineHeight: 1.5 },
                },
                fine: {
                  $type: 'typography',
                  $value: {
                    fontFamily: 'Inter',
                    fontSize: { value: 16, unit: 'px' },
                    fontWeight: 400,
                    lineHeight: 1.5,
                  },
                },
              },
            },
          ],
        },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    };

    const { operations } = await new StyleSyncEngine().buildPlan(new Resolver(doc), defaultTokenTypeMap);

    const skip = operations.find((op) => op.kind === 'SKIP' && op.path === 'Demo.text.broken');
    assert.ok(skip && skip.kind === 'SKIP', 'the broken token should be a skip');
    assert.equal(skip.cause, 'cannot-build');
    assert.match(skip.reason, /^"Demo\.text\.broken" cannot be built in default: /);
    assert.ok(
      operations.some((op) => op.kind === 'CREATE_STYLE' && op.tokenPath === 'Demo.text.fine'),
      'the well-formed token should still be planned',
    );
  });

  it('resolves a reference nested inside a composite token value', async () => {
    // The plugin used to resolve nested references itself, taking the first
    // entry of a fontFamily array on the way. @toghen/lib now owns resolution,
    // so this checks the whole path end to end: the reference is expanded, the
    // stack survives resolution intact, and the adapter narrows it.
    setupFigmaMock();

    const resolver = new Resolver({
      version: '2025-11-01',
      name: 'Demo',
      sets: {
        base: {
          sources: [
            {
              font: {
                family: {
                  sans: { $type: 'fontFamily', $value: ['Inter', 'system-ui', 'sans-serif'] },
                },
              },
              text: {
                body: {
                  $type: 'typography',
                  $value: {
                    fontFamily: '{font.family.sans}',
                    fontSize: { value: 16, unit: 'px' },
                    fontWeight: 400,
                    lineHeight: { value: 24, unit: 'px' },
                    fontStyle: 'Regular',
                  },
                },
              },
            },
          ],
        },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    });

    const { operations } = await new StyleSyncEngine().buildPlan(resolver, defaultTokenTypeMap);

    const textOp = operations.find((op) => op.kind === 'CREATE_STYLE' && op.styleType === 'TEXT');
    assert.ok(textOp && textOp.kind === 'CREATE_STYLE', 'a text style should be planned');
    assert.equal((textOp.props as { fontFamily: string }).fontFamily, 'Inter');
  });
});

describe('StyleSyncEngine — the stamp on a style', () => {
  useFigmaMock();

  const HEADING = 'Demo.text.heading';
  const plan = (overwriteDrift = false) =>
    new StyleSyncEngine().buildPlan(createResolver(), defaultTokenTypeMap, undefined, { overwriteDrift });
  const forHeading = (operations: Operation[]) =>
    operations.filter((op) => ('tokenPath' in op && op.tokenPath === HEADING) || ('path' in op && op.path === HEADING));

  /** A file the style sync has run in once. */
  async function synced(): Promise<FigmaMockHandle> {
    const mock = createFigmaMock().install();
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    const summary = await runOperations((await plan()).operations, { onProgress: () => {} });
    assert.equal(summary.failed, 0);
    return mock;
  }
  const heading = (mock: FigmaMockHandle) => mock.styles('TEXT').find((style) => style.name === 'text/heading')!;

  it('stamps each style it writes, and skips it next time as unchanged', async () => {
    const mock = await synced();

    assert.deepEqual(stampOf(heading(mock))?.is, { token: HEADING });
    assert.ok(stampOf(heading(mock))?.receipt.fontSize, 'a receipt of what Figma reports, field by field');
    const again = forHeading((await plan()).operations);
    assert.deepEqual(
      again.map((op) => op.kind === 'SKIP' && op.reason),
      ['unchanged'],
    );
  });

  it('finds a style renamed in Figma by its stamp, and writes it in place', async () => {
    const mock = await synced();
    const style = heading(mock);
    style.name = 'Headings/Main';

    const operations = forHeading((await plan()).operations);

    assert.deepEqual(
      operations.map((op) => op.kind === 'SKIP' && op.reason),
      ['unchanged'],
      'its fields are still what was written',
    );
  });

  it('reports a style edited in Figma as drifted, and writes over it only with --overwrite-drift', async () => {
    const mock = await synced();
    heading(mock).fontSize = 40;

    const kept = forHeading((await plan()).operations);
    assert.equal(kept.length, 1);
    assert.ok(kept[0].kind === 'SKIP' && kept[0].reason === 'drifted');
    assert.match(kept[0].kind === 'SKIP' ? (kept[0].message ?? '') : '', /\(fontSize\).*--overwrite-drift/);
    assert.equal(new StyleSyncEngine().summarizePlan((await plan()).operations).drifted, 1);

    const taken = forHeading((await plan(true)).operations);
    assert.deepEqual(
      taken.map((op) => op.kind),
      ['UPDATE_STYLE'],
    );
  });

  it('writes a style the document moved, though nobody touched it in Figma', async () => {
    await synced();
    const { operations } = await new StyleSyncEngine().buildPlan(createResolver(20), defaultTokenTypeMap);

    assert.deepEqual(
      forHeading(operations).map((op) => op.kind),
      ['UPDATE_STYLE'],
    );
  });

  it('never trusts the receipt of a style it adopts by name: it writes it, and stamps it for this token', async () => {
    // The defect the root record had: a style found by name was skipped on a hash recorded for another style.
    const mock = await synced();
    const style = heading(mock);
    // The style holds exactly what the document asks, with a receipt that matches, but its stamp is another token's.
    setStamp(style as unknown as BaseStyle, { ...stampOf(style)!, is: { token: 'Demo.text.other' } });

    const operations = forHeading((await plan()).operations);
    assert.deepEqual(
      operations.map((op) => op.kind === 'UPDATE_STYLE' && op.styleId),
      [style.id],
      'adopted, so written whole',
    );

    await runOperations(operations, { onProgress: () => {} });
    assert.deepEqual(stampOf(style)?.is, { token: HEADING });
  });

  it('writes a style it adopts by name with no stamp at all, though it agrees', async () => {
    const mock = await synced();
    const style = heading(mock);
    style.setSharedPluginData('toghen', 'stamp', '');

    assert.deepEqual(
      forHeading((await plan()).operations).map((op) => op.kind),
      ['UPDATE_STYLE'],
    );
  });
});

describe('StyleSyncEngine — a member becomes a binding', () => {
  useFigmaMock();

  const SHADE = { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.4 };
  const px = (value: number) => ({ value, unit: 'px' });

  /**
   * `text.body` refers to a family and a size. `text.ratio` refers to a unitless
   * line height and an `em` letter spacing, both of which Figma reads as
   * PERCENT. `text.fixed` refers to a font stack and a line height in pixels.
   * `effects.raised` has two layers; only the second one's colour is a reference.
   */
  function bindingDocument(): Resolver {
    return new Resolver({
      version: '2025-11-01',
      name: 'Demo',
      sets: {
        base: {
          sources: [
            {
              font: {
                family: {
                  sans: { $type: 'fontFamily', $value: 'Inter' },
                  stack: { $type: 'fontFamily', $value: ['Inter', 'system-ui', 'sans-serif'] },
                },
                size: { md: { $type: 'dimension', $value: px(16) } },
              },
              type: {
                leading: { $type: 'number', $value: 1.5 },
                line: { $type: 'dimension', $value: px(24) },
                tracking: { $type: 'string', $value: '0.05em' },
              },
              color: { shade: { $type: 'color', $value: SHADE } },
              text: {
                body: {
                  $type: 'typography',
                  $value: {
                    fontFamily: '{font.family.sans}',
                    fontSize: '{font.size.md}',
                    fontWeight: 400,
                    lineHeight: 1.5,
                    fontStyle: 'Regular',
                  },
                },
                ratio: {
                  $type: 'typography',
                  $value: {
                    fontFamily: 'Inter',
                    fontSize: px(16),
                    fontWeight: 400,
                    lineHeight: '{type.leading}',
                    letterSpacing: '{type.tracking}',
                  },
                },
                fixed: {
                  $type: 'typography',
                  $value: {
                    fontFamily: '{font.family.stack}',
                    fontSize: px(16),
                    fontWeight: 400,
                    lineHeight: '{type.line}',
                  },
                },
                plain: {
                  $type: 'typography',
                  $value: {
                    fontFamily: ['Inter', 'sans-serif'],
                    fontSize: px(16),
                    fontWeight: 400,
                    lineHeight: 1.5,
                    fontStyle: 'Regular',
                  },
                },
              },
              effects: {
                raised: {
                  $type: 'shadow',
                  $value: [
                    { color: SHADE, offsetX: px(0), offsetY: px(1), blur: px(2), spread: px(0) },
                    { color: '{color.shade}', offsetX: px(0), offsetY: px(4), blur: px(8), spread: px(0) },
                  ],
                },
              },
            },
          ],
        },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    } as ResolverDocument);
  }

  /** The Figma file: the base collection `Demo`, with its one mode, holding these variables. */
  function fileWith(variables: Array<[string, VariableResolvedDataType]>) {
    let builder = createFigmaMock().withCollection('Demo', ['default']);
    for (const [name, type] of variables) builder = builder.withVariable('Demo', name, type);
    const mock = builder.install();
    return (name: string) => mock.variable('Demo', name)!.id;
  }

  const plan = () => new StyleSyncEngine().buildPlan(bindingDocument(), defaultTokenTypeMap);

  const styleOf = (operations: Operation[], path: string) => {
    const op = operations.find((o) => (o.kind === 'CREATE_STYLE' || o.kind === 'UPDATE_STYLE') && o.tokenPath === path);
    assert.ok(op && (op.kind === 'CREATE_STYLE' || op.kind === 'UPDATE_STYLE'), `no style planned for ${path}`);
    return op;
  };

  const warningsFor = (operations: Operation[], path: string) =>
    operations.flatMap((op) => (op.kind === 'WARNING' && op.path === path ? [op.message] : []));

  it('binds a member that refers to a token, and still carries its value', async () => {
    const id = fileWith([
      ['font/family/sans', 'STRING'],
      ['font/size/md', 'FLOAT'],
    ]);

    const { operations } = await plan();
    const body = styleOf(operations, 'Demo.text.body');

    assert.deepEqual(body.bindings, [
      { field: 'fontFamily', variableId: id('font/family/sans') },
      { field: 'fontSize', variableId: id('font/size/md') },
    ]);
    assert.equal(body.props.fontFamily, 'Inter');
    assert.equal(body.props.fontSize, 16);
    assert.deepEqual(warningsFor(operations, 'Demo.text.body'), []);
  });

  it('binds through the variable stamped for the token when the name finds nothing', async () => {
    // Renamed in Figma: only its stamp knows it.
    const mock = createFigmaMock().withCollection('Demo', ['default']).withVariable('Demo', 'renamed/size', 'FLOAT').install();
    const sizeId = mock.variable('Demo', 'renamed/size')!.id;
    stampAs(mock.variable('Demo', 'renamed/size')!, 'Demo.font.size.md');

    const { operations } = await plan();

    assert.deepEqual(styleOf(operations, 'Demo.text.body').bindings, [{ field: 'fontSize', variableId: sizeId }]);
  });

  it('keeps a unitless line height as a value, without a warning', async () => {
    // Figma reads a unitless 1.5 as PERCENT, so a FLOAT variable holding 1.5
    // would read as 1.5%. The variable exists with the right type, so only the
    // unit rule can be what keeps it unbound.
    fileWith([['type/leading', 'FLOAT']]);

    const { operations } = await plan();
    const ratio = styleOf(operations, 'Demo.text.ratio');

    assert.equal(ratio.bindings, undefined);
    assert.deepEqual(ratio.props.lineHeight, { unit: 'PERCENT', value: 150 });
    assert.deepEqual(warningsFor(operations, 'Demo.text.ratio'), []);
  });

  it('binds a line height that is a length', async () => {
    const id = fileWith([['type/line', 'FLOAT']]);

    const { operations } = await plan();

    assert.deepEqual(styleOf(operations, 'Demo.text.fixed').bindings, [{ field: 'lineHeight', variableId: id('type/line') }]);
  });

  it('keeps an em letter spacing as a value, without a warning', async () => {
    // A STRING variable against a FLOAT field would warn, were it looked up.
    fileWith([['type/tracking', 'STRING']]);

    const { operations } = await plan();

    assert.equal(styleOf(operations, 'Demo.text.ratio').bindings, undefined);
    assert.deepEqual(warningsFor(operations, 'Demo.text.ratio'), []);
  });

  it('binds a font stack, whose variable holds its first family', async () => {
    // The variable phase narrows a stack the way the style does, so the two agree.
    const id = fileWith([['font/family/stack', 'STRING']]);

    const { operations } = await plan();
    const fixed = styleOf(operations, 'Demo.text.fixed');

    assert.deepEqual(fixed.bindings, [{ field: 'fontFamily', variableId: id('font/family/stack') }]);
    assert.equal(fixed.props.fontFamily, 'Inter');
    assert.deepEqual(warningsFor(operations, 'Demo.text.fixed'), [
      '"Demo.text.fixed.lineHeight" refers to "Demo.type.line", which has no variable yet; ' +
        'sync variables first, then styles, to bind it.',
    ]);
  });

  it('warns, and writes the value, when the target has no variable yet', async () => {
    createFigmaMock().install();

    const { operations } = await plan();
    const body = styleOf(operations, 'Demo.text.body');

    assert.equal(body.bindings, undefined);
    assert.equal(body.props.fontSize, 16);
    assert.deepEqual(warningsFor(operations, 'Demo.text.body'), [
      '"Demo.text.body.fontFamily" refers to "Demo.font.family.sans", which has no variable yet; ' +
        'sync variables first, then styles, to bind it.',
      '"Demo.text.body.fontSize" refers to "Demo.font.size.md", which has no variable yet; ' +
        'sync variables first, then styles, to bind it.',
    ]);
    for (const path of ['Demo.text.ratio', 'Demo.text.fixed', 'Demo.text.plain', 'Demo.effects.raised']) {
      styleOf(operations, path);
    }
  });

  it('warns, and writes the value, when the variable has another type', async () => {
    const id = fileWith([
      ['font/family/sans', 'STRING'],
      ['font/size/md', 'STRING'],
    ]);

    const { operations } = await plan();

    assert.deepEqual(styleOf(operations, 'Demo.text.body').bindings, [{ field: 'fontFamily', variableId: id('font/family/sans') }]);
    assert.deepEqual(warningsFor(operations, 'Demo.text.body'), [
      '"Demo.text.body.fontSize" refers to "Demo.font.size.md", but that variable is STRING and ' +
        'the field takes FLOAT, so the value is written instead of a binding.',
    ]);
  });

  it('binds a shadow layer by its index', async () => {
    const id = fileWith([['color/shade', 'COLOR']]);

    const { operations } = await plan();

    assert.deepEqual(styleOf(operations, 'Demo.effects.raised').bindings, [{ field: 'color', variableId: id('color/shade'), index: 1 }]);
  });

  it('writes a style again when a member becomes bound, though its values did not move', async () => {
    const mock = createFigmaMock().withCollection('Demo', ['default']).install();
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    await runOperations((await plan()).operations, { onProgress: () => {} });
    const unchanged = await plan();
    assert.ok(unchanged.operations.some((op) => op.kind === 'SKIP' && op.path === 'Demo.text.body' && op.reason === 'unchanged'));

    figma.variables.createVariable('font/size/md', mock.collection('Demo')!.id, 'FLOAT');
    const bound = await plan();

    assert.deepEqual(styleOf(bound.operations, 'Demo.text.body').kind, 'UPDATE_STYLE', 'a binding is part of what was written');
    assert.ok(
      bound.operations.some((op) => op.kind === 'SKIP' && op.path === 'Demo.text.plain' && op.reason === 'unchanged'),
      'and a style that binds nothing is left',
    );
  });

  it('says a bound member follows its variable across modes', async () => {
    setupFigmaMock();

    const { operations } = await new StyleSyncEngine().buildPlan(createThemedResolver(), defaultTokenTypeMap);

    const warning = operations.find((op) => op.kind === 'WARNING');
    assert.ok(warning && warning.kind === 'WARNING');
    assert.match(warning.message, /A member bound to a variable is the exception: it follows that variable's modes\./);
  });

  it('skips and reports a style that holds currentColor, and builds the rest', async () => {
    setupFigmaMock();
    const resolver = new Resolver({
      version: '2025-11-01',
      name: 'Demo',
      sets: {
        base: {
          sources: [
            {
              ink: { $type: 'color', follow: { $value: 'currentColor' }, clear: { $value: 'transparent' } },
              effects: {
                $type: 'shadow',
                ink: { $value: { color: '{ink.follow}', offsetX: '0px', offsetY: '2px', blur: '8px' } },
                clear: { $value: { color: '{ink.clear}', offsetX: '0px', offsetY: '2px', blur: '8px' } },
              },
              text: {
                tag: {
                  $type: 'typography',
                  $value: {
                    fontFamily: ['Inter'],
                    fontSize: { value: 12, unit: 'px' },
                    fontWeight: 500,
                    lineHeight: 1.5,
                    letterSpacing: { value: 0.08, unit: 'em' },
                    fontVariantNumeric: 'tabular-nums',
                  },
                },
              },
            },
          ],
        },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    } as ResolverDocument);

    const { operations } = await new StyleSyncEngine().buildPlan(resolver, defaultTokenTypeMap);

    const skip = operations.find((op) => op.kind === 'SKIP' && op.path === 'Demo.effects.ink');
    assert.ok(skip && skip.kind === 'SKIP');
    assert.equal(skip.cause, 'cannot-build');
    assert.match(skip.reason, /^"Demo\.effects\.ink" cannot be built in default: it holds currentColor, which Figma cannot hold\./);
    assert.ok(!operations.some((op) => op.kind === 'CREATE_STYLE' && op.tokenPath === 'Demo.effects.ink'));

    const clear = operations.find((op) => op.kind === 'CREATE_STYLE' && op.tokenPath === 'Demo.effects.clear');
    assert.ok(clear && clear.kind === 'CREATE_STYLE');
    assert.equal((clear.props as { effects: Array<{ color: { a: number } }> }).effects[0].color.a, 0);

    const tag = operations.find((op) => op.kind === 'CREATE_STYLE' && op.tokenPath === 'Demo.text.tag');
    assert.ok(tag && tag.kind === 'CREATE_STYLE');
    assert.deepEqual((tag.props as { letterSpacing: unknown }).letterSpacing, { unit: 'PERCENT', value: 8 });
    assert.ok(!('fontVariantNumeric' in tag.props));
  });
});
