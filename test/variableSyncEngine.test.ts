import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver, type ResolverDocument } from '@toghen/lib';
import { VariableSyncEngine, type VariablePlan } from '../main/engines/variableSyncEngine.js';
import { defaultTokenTypeMap } from '../shared/tokenTypeMap.js';
import type { Operation } from '../shared/operations.js';
import { createFigmaMock, useFigmaMock, type FigmaMockHandle } from './support/figmaMock.js';
import { stampAs, stampAsApplied, stampAsHeld, stampOf } from './support/stamps.js';
import { runOperations } from '../main/engines/batchRunner.js';
import { hashOf } from '../main/components/stamp.js';

/** The base collection's name, and so the lookup prefix of every token path. */
const COLLECTION = 'Demo';

/**
 * Two themes; `color.primary` differs between them, `spacing.md` does not.
 *
 * The sum puts `spacing.md` in the base collection `Demo` (one mode, `default`)
 * and `color.primary` in the collection `theme` (a mode per context).
 */
function themedDocument(overrides: Partial<ResolverDocument> = {}): Resolver {
  return new Resolver({
    version: '2025-11-01',
    name: COLLECTION,
    sets: {
      base: {
        sources: [{ spacing: { md: { $type: 'dimension', $value: '16px' } } }],
      },
    },
    modifiers: {
      theme: {
        default: 'light',
        contexts: {
          light: [{ color: { primary: { $type: 'color', $value: '#0055cc' } } }],
          dark: [{ color: { primary: { $type: 'color', $value: '#112233' } } }],
        },
      },
    },
    resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
    ...overrides,
  } as ResolverDocument);
}

const plan = (resolver: Resolver, name = COLLECTION) => new VariableSyncEngine().buildPlan(resolver, name, defaultTokenTypeMap);

/** The file holds the scopes a plan gives its variables, as a file does once a run has written them. */
function holdScopesOf(mock: FigmaMockHandle, plan: VariablePlan): void {
  for (const op of plan.operations) {
    if (op.kind === 'SET_VARIABLE_SCOPES') mock.variables().find((variable) => variable.id === op.variableId)!.scopes = op.scopes;
  }
}

const setValuesFor = (plan: VariablePlan, path: string) =>
  plan.operations.filter((op) => op.kind === 'SET_VARIABLE_VALUE' && op.tokenPath === path);

const creates = (plan: VariablePlan) =>
  plan.operations.filter((op): op is Extract<Operation, { kind: 'CREATE_VARIABLE' }> => op.kind === 'CREATE_VARIABLE');

const collectionsCreated = (plan: VariablePlan) =>
  plan.operations.filter((op): op is Extract<Operation, { kind: 'CREATE_COLLECTION' }> => op.kind === 'CREATE_COLLECTION');

const warnings = (plan: VariablePlan) =>
  plan.operations.filter((op): op is Extract<Operation, { kind: 'WARNING' }> => op.kind === 'WARNING');

/** The value written for a token in a mode of the collection it lives in. */
function valueIn(plan: VariablePlan, path: string, mode: string) {
  const op = setValuesFor(plan, path).find((w) => w.kind === 'SET_VARIABLE_VALUE' && w.modeName === mode);
  assert.ok(op && op.kind === 'SET_VARIABLE_VALUE', `no ${mode} write for ${path}`);
  return op.value;
}

const modeIdOf = (mock: ReturnType<ReturnType<typeof createFigmaMock>['install']>, collection: string, mode: string) =>
  mock.collection(collection)!.modes.find((m) => m.name === mode)!.modeId;

const rgb = (r: number, g: number, b: number) => ({ r, g, b, a: 1 });

describe('VariableSyncEngine — the sum: one collection per modifier', () => {
  useFigmaMock();

  it('creates a base collection with one mode, and a collection per modifier', async () => {
    createFigmaMock().install();

    const result = await plan(themedDocument());

    assert.deepEqual(
      collectionsCreated(result).map((op) => [op.name, op.modes]),
      [
        ['Demo', ['default']],
        ['theme', ['light', 'dark']],
      ],
    );
  });

  it('puts the declared default first even when it is not declared first', async () => {
    createFigmaMock().install();

    const resolver = themedDocument({
      modifiers: {
        theme: {
          default: 'light',
          // dark declared first — declaration order would make it modes[0].
          contexts: {
            dark: [{ color: { primary: { $type: 'color', $value: '#112233' } } }],
            light: [{ color: { primary: { $type: 'color', $value: '#0055cc' } } }],
          },
        },
      },
    } as Partial<ResolverDocument>);

    const created = collectionsCreated(await plan(resolver)).find((op) => op.name === 'theme');

    // Figma's default mode is always modes[0] and cannot be reassigned or
    // reordered later, so creation order is the only chance to get it right.
    assert.deepEqual(created?.modes, ['light', 'dark']);
  });

  it('gives a token no modifier defines to the base collection, in its one mode', async () => {
    createFigmaMock().install();

    const result = await plan(themedDocument());

    const created = creates(result).find((op) => op.path === 'spacing/md');
    assert.ok(created, 'named without the collection, a slash between groups');
    assert.equal(created.collectionId, '$col:Demo');
    assert.deepEqual(
      setValuesFor(result, 'Demo.spacing.md').map((op) => op.kind === 'SET_VARIABLE_VALUE' && [op.modeName, op.modeId]),
      [['default', '$mode:Demo/default']],
    );
  });

  it('gives a token one modifier defines to that modifier’s collection, a value in every mode', async () => {
    createFigmaMock().install();

    const result = await plan(themedDocument());

    const created = creates(result).find((op) => op.path === 'color/primary');
    assert.equal(created?.collectionId, '$col:theme');
    assert.deepEqual(
      setValuesFor(result, 'Demo.color.primary').map((op) => op.kind === 'SET_VARIABLE_VALUE' && op.modeName),
      ['light', 'dark'],
    );
  });

  it('carries the base in a context that does not define the token', async () => {
    createFigmaMock().install();

    const resolver = themedDocument({
      modifiers: {
        density: {
          default: 'regular',
          contexts: {
            regular: [{}],
            compact: [{ spacing: { md: { $value: '12px' } } }],
          },
        },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/density' }],
    } as Partial<ResolverDocument>);
    const result = await plan(resolver);

    // Figma modes are dense: the context that says nothing carries the base.
    assert.equal(valueIn(result, 'Demo.spacing.md', 'regular'), 16);
    assert.equal(valueIn(result, 'Demo.spacing.md', 'compact'), 12);
    assert.equal(creates(result).find((op) => op.path === 'spacing/md')?.collectionId, '$col:density');
    assert.ok(!collectionsCreated(result).some((op) => op.name === 'theme'), 'and no collection for a modifier the document lacks');
  });

  it('writes a token that varies only through a reference once, in the base collection, as an alias', async () => {
    createFigmaMock().install();

    const resolver = new Resolver({
      version: '2025-11-01',
      name: COLLECTION,
      sets: {
        base: { sources: [{ color: { $type: 'color', button: { bg: { $value: '{color.brand}' } }, brand: { $value: '#0055cc' } } }] },
      },
      modifiers: {
        theme: {
          default: 'light',
          contexts: {
            light: [{}],
            dark: [{ color: { brand: { $value: '#112233' } } }],
          },
        },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
    } as ResolverDocument);
    const result = await plan(resolver);

    // `color.brand` varies on theme; `color.button.bg` does not, it points at it.
    assert.equal(creates(result).find((op) => op.path === 'color/brand')?.collectionId, '$col:theme');
    const bg = creates(result).find((op) => op.path === 'color/button/bg');
    assert.equal(bg?.collectionId, '$col:Demo', 'never copied into the modifier’s modes');
    assert.equal(setValuesFor(result, 'Demo.color.button.bg').length, 1);
    assert.deepEqual(valueIn(result, 'Demo.color.button.bg', 'default'), {
      type: 'VARIABLE_ALIAS',
      id: '$var:theme/color/brand',
    });
  });

  it('reports a hole, and writes nothing for the token', async () => {
    createFigmaMock().install();

    const resolver = themedDocument({
      modifiers: {
        theme: {
          default: 'light',
          contexts: {
            light: [{ color: { primary: { $type: 'color', $value: '#0055cc' } } }],
            dark: [
              { color: { primary: { $type: 'color', $value: '#112233' } } },
              // Defined by dark alone, with no base: light has no value.
              { color: { overlay: { $type: 'color', $value: '#00000080' } } },
            ],
          },
        },
      },
    } as Partial<ResolverDocument>);

    const result = await plan(resolver);

    assert.ok(!creates(result).some((op) => op.path === 'color/overlay'));
    assert.equal(setValuesFor(result, 'Demo.color.overlay').length, 0);
    const reported = warnings(result).filter((op) => op.path === 'Demo.color.overlay');
    assert.equal(reported.length, 1);
    assert.match(reported[0].message, /no value where theme=light/);
  });

  it('reports a $type that varies across contexts, and writes nothing for the token', async () => {
    createFigmaMock().install();

    const resolver = themedDocument({
      modifiers: {
        theme: {
          default: 'light',
          contexts: {
            light: [{ size: { gap: { $type: 'dimension', $value: '8px' } } }],
            dark: [{ size: { gap: { $type: 'number', $value: 8 } } }],
          },
        },
      },
    } as Partial<ResolverDocument>);

    const result = await plan(resolver);

    assert.ok(!creates(result).some((op) => op.path === 'size/gap'));
    assert.ok(warnings(result).some((op) => op.path === 'Demo.size.gap' && /different types/.test(op.message)));
  });

  it('reports a token lib cannot factor, and writes nothing for it', async () => {
    createFigmaMock().install();

    // A context that sets only the unit of a dimension the base writes whole:
    // a partial composite, which a chain cannot hold.
    const resolver = themedDocument({
      sets: {
        base: { sources: [{ size: { gap: { $type: 'dimension', $value: { value: 16, unit: 'px' } } } }] },
      },
      modifiers: {
        density: {
          default: 'regular',
          contexts: { regular: [{}], compact: [{ size: { gap: { $value: { unit: 'rem' } } } }] },
        },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/density' }],
    } as Partial<ResolverDocument>);

    const result = await plan(resolver);

    assert.ok(!creates(result).some((op) => op.path === 'size/gap'), 'binding it early would bring the product back for this token');
    assert.ok(warnings(result).some((op) => op.path === 'Demo.size.gap' && /not written/.test(op.message)));
  });

  it('stops with one warning when a modifier declares no default', async () => {
    createFigmaMock().install();

    const resolver = themedDocument({
      modifiers: {
        theme: {
          contexts: {
            light: [{ color: { primary: { $type: 'color', $value: '#0055cc' } } }],
            dark: [{ color: { primary: { $type: 'color', $value: '#112233' } } }],
          },
        },
      },
    } as Partial<ResolverDocument>);

    const result = await plan(resolver);

    assert.equal(result.operations.length, 1);
    assert.ok(result.operations[0].kind === 'WARNING' && /"theme" declares no default/.test(result.operations[0].message));
  });

  it('reads a name that two collections would share as a stop', async () => {
    createFigmaMock().install();

    const result = await plan(themedDocument(), 'theme');

    assert.equal(result.operations.length, 1);
    assert.ok(result.operations[0].kind === 'WARNING' && /also the name of the modifier "theme"/.test(result.operations[0].message));
  });
});

describe('VariableSyncEngine — values Figma cannot hold as written', () => {
  const doc = (extra: Record<string, unknown>, state?: Record<string, unknown>) =>
    new Resolver({
      version: '2025-11-01',
      name: COLLECTION,
      sets: {
        base: {
          sources: [
            {
              ink: {
                $type: 'color',
                clear: { $value: 'transparent' },
                follow: { $value: 'currentColor' },
                viaAlias: { $value: '{ink.follow}' },
                solid: { $value: { colorSpace: 'srgb', components: [0.2, 0.4, 0.6] } },
              },
              ...extra,
            },
          ],
        },
      },
      ...(state
        ? { modifiers: { state }, resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/state' }] }
        : { resolutionOrder: [{ $ref: '#/sets/base' }] }),
    } as ResolverDocument);

  it('writes transparent as a COLOR at alpha 0, and reports a currentColor token, directly or through a reference', async () => {
    createFigmaMock().install();
    const result = await plan(doc({}));

    assert.deepEqual(valueIn(result, 'Demo.ink.clear', 'default'), { r: 0, g: 0, b: 0, a: 0 });
    assert.ok(creates(result).some((op) => op.path === 'ink/clear'));
    assert.ok(creates(result).some((op) => op.path === 'ink/solid'));

    for (const path of ['Demo.ink.follow', 'Demo.ink.viaAlias']) {
      assert.ok(!creates(result).some((op) => op.path === path.replace('Demo.', '').replace(/\./g, '/')), `${path} is not created`);
      assert.equal(setValuesFor(result, path).length, 0);
      const reported = warnings(result).filter((op) => op.path === path);
      assert.equal(reported.length, 1, `${path} is reported once`);
      assert.equal(reported[0].message, `"${path}" is currentColor, which Figma cannot hold; skipped.`);
    }
  });

  it('skips and reports a token that only one context defines, naming the token and the context', async () => {
    createFigmaMock().install();
    const result = await plan(
      doc(
        {},
        {
          default: 'rest',
          contexts: {
            rest: [],
            pressed: [{ ds: { button: { pin: { color: { $type: 'color', $value: { colorSpace: 'srgb', components: [1, 0, 0] } } } } } }],
          },
        },
      ),
    );

    assert.ok(!creates(result).some((op) => op.path === 'ds/button/pin/color'));
    assert.equal(setValuesFor(result, 'Demo.ds.button.pin.color').length, 0);
    const reported = warnings(result).filter((op) => op.path === 'Demo.ds.button.pin.color');
    assert.equal(reported.length, 1);
    assert.match(
      reported[0].message,
      /^"Demo\.ds\.button\.pin\.color" is defined only in state=pressed and has no value where state=rest, the default; a Figma variable needs a value in every mode, so it is skipped\.$/,
    );
    // The rest of the document is written.
    assert.ok(creates(result).some((op) => op.path === 'ink/solid'));
  });
});

describe('VariableSyncEngine — a chain of aliases', () => {
  useFigmaMock();

  const LIGHT = { colorSpace: 'srgb', components: [0.9, 0.9, 0.9] };
  const DARK = { colorSpace: 'srgb', components: [0.2, 0.2, 0.2] };
  const ALERT = { colorSpace: 'srgb', components: [0.8, 0.1, 0.1] };

  /**
   * `button.backgroundColor` is defined by the base, by `scheme` (dark) and by
   * `tone` (alert): two links. `tone` is last in the resolution order, so it wins and
   * holds the head; `scheme` holds the link.
   */
  function chainDocument(): Resolver {
    return new Resolver({
      version: '2025-11-01',
      name: COLLECTION,
      sets: { base: { sources: [{ button: { backgroundColor: { $type: 'color', $value: LIGHT } } }] } },
      modifiers: {
        scheme: {
          default: 'light',
          contexts: { light: [{}], dark: [{ button: { backgroundColor: { $value: DARK } } }] },
        },
        tone: {
          default: 'neutral',
          contexts: { neutral: [{}], alert: [{ button: { backgroundColor: { $value: ALERT } } }] },
        },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/scheme' }, { $ref: '#/modifiers/tone' }],
    } as ResolverDocument);
  }

  it('creates the head in the last link’s collection and each earlier link, suffixed, in its own', async () => {
    createFigmaMock().install();

    const result = await plan(chainDocument());

    assert.deepEqual(
      creates(result).map((op) => [op.path, op.collectionId]),
      [
        ['button/backgroundColor', '$col:tone'],
        ['button/backgroundColor--scheme', '$col:scheme'],
      ],
    );
  });

  it('aliases the head to the next link in the contexts that do not define the token', async () => {
    createFigmaMock().install();

    const result = await plan(chainDocument());

    assert.deepEqual(valueIn(result, 'Demo.button.backgroundColor', 'neutral'), {
      type: 'VARIABLE_ALIAS',
      id: '$var:scheme/button/backgroundColor--scheme',
    });
    assert.deepEqual(valueIn(result, 'Demo.button.backgroundColor', 'alert'), { r: 0.8, g: 0.1, b: 0.1, a: 1 });
  });

  it('gives the earliest link the base where it does not define the token', async () => {
    createFigmaMock().install();

    const result = await plan(chainDocument());

    // A link is recorded under the token’s generated path, `~` and the modifier.
    assert.deepEqual(valueIn(result, 'Demo.button.backgroundColor~scheme', 'light'), { r: 0.9, g: 0.9, b: 0.9, a: 1 });
    assert.deepEqual(valueIn(result, 'Demo.button.backgroundColor~scheme', 'dark'), { r: 0.2, g: 0.2, b: 0.2, a: 1 });
  });

  it('writes the CSS spelling as each variable’s code syntax, the link’s with its suffix', async () => {
    createFigmaMock().install();

    const result = await plan(chainDocument());
    const syntax = result.operations.filter((op) => op.kind === 'SET_CODE_SYNTAX');

    assert.deepEqual(
      syntax.map((op) => op.kind === 'SET_CODE_SYNTAX' && [op.variableId, op.platform, op.value]),
      [
        ['$var:tone/button/backgroundColor', 'WEB', 'var(--button-background-color)'],
        ['$var:scheme/button/backgroundColor--scheme', 'WEB', 'var(--button-background-color--scheme)'],
      ],
    );
  });

  it('sets the values after every variable is created, since the head aliases a variable created later', async () => {
    createFigmaMock().install();

    const { operations } = await plan(chainDocument());
    const lastCreate = Math.max(...operations.map((op, at) => (op.kind === 'CREATE_VARIABLE' ? at : -1)));
    const firstSet = operations.findIndex((op) => op.kind === 'SET_VARIABLE_VALUE');

    assert.ok(firstSet > lastCreate);
  });

  it('stamps each link under its own key, with a receipt for each of its own modes', async () => {
    const mock = createFigmaMock().install();

    await runOperations((await plan(chainDocument())).operations, { onProgress: () => {} });

    const receipts = mock.variables().map((variable) => {
      const stamp = stampOf(variable)!;
      const modes = mock.collections().find((collection) => collection.id === variable.variableCollectionId)!.modes;
      return [stamp.is.token, modes.filter((mode) => stamp.receipt[mode.modeId] !== undefined).map((mode) => mode.name)];
    });
    assert.deepEqual(receipts.sort(), [
      ['Demo.button.backgroundColor', ['neutral', 'alert']],
      ['Demo.button.backgroundColor~scheme', ['light', 'dark']],
    ]);
  });
});

describe('VariableSyncEngine — code syntax', () => {
  useFigmaMock();

  it('writes var() with the CSS name on every variable it creates', async () => {
    createFigmaMock().install();

    const { operations } = await plan(themedDocument());

    assert.deepEqual(
      operations.filter((op) => op.kind === 'SET_CODE_SYNTAX').map((op) => op.kind === 'SET_CODE_SYNTAX' && [op.variableId, op.value]),
      [
        ['$var:Demo/spacing/md', 'var(--spacing-md)'],
        ['$var:theme/color/primary', 'var(--color-primary)'],
      ],
    );
  });

  it('writes the syntax of a variable that has none, without making the path stale', async () => {
    const mock = createFigmaMock()
      .withCollection(COLLECTION, ['default'])
      .withCollection('theme', ['light', 'dark'])
      .withVariable(COLLECTION, 'spacing/md', 'FLOAT', { default: 16 })
      .withVariable('theme', 'color/primary', 'COLOR', {
        light: { r: 0, g: 1 / 3, b: 0.8, a: 1 },
        dark: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255, a: 1 },
      })
      .install();
    const first = await plan(themedDocument());
    holdScopesOf(mock, first);
    const spacingId = mock.variable(COLLECTION, 'spacing/md')!.id;
    await stampAsApplied(first.operations);

    const result = await plan(themedDocument());

    const written = result.operations.filter((op) => op.kind === 'SET_CODE_SYNTAX');
    assert.equal(written.length, 2);
    assert.equal(written[0].kind === 'SET_CODE_SYNTAX' && written[0].variableId, spacingId);
    assert.ok(result.operations.some((op) => op.kind === 'SKIP' && op.path === 'Demo.spacing.md' && op.reason === 'unchanged'));

    // Once Figma holds it, nothing is planned.
    mock.variable(COLLECTION, 'spacing/md')!.setVariableCodeSyntax('WEB', 'var(--spacing-md)');
    mock.variable('theme', 'color/primary')!.setVariableCodeSyntax('WEB', 'var(--color-primary)');
    const again = await plan(themedDocument());
    assert.equal(again.operations.filter((op) => op.kind === 'SET_CODE_SYNTAX').length, 0);
  });
});

describe('VariableSyncEngine — collections an earlier sync built', () => {
  useFigmaMock();

  it('stops before its first write when the base collection’s name is taken by one', async () => {
    // The product sync: one collection named for the document, a mode per combination.
    createFigmaMock().withCollection(COLLECTION, ['light', 'dark']).install();

    const result = await plan(themedDocument());

    assert.equal(result.operations.length, 1, 'one warning, nothing to run');
    assert.ok(result.operations[0].kind === 'WARNING');
    assert.match(result.operations[0].message, /built by an earlier sync/);
    assert.match(result.operations[0].message, /light, dark/);
  });

  it('leaves a modifier’s collection whose default context is gone alone, and does not write the tokens that live in it', async () => {
    createFigmaMock()
      .withCollection(COLLECTION, ['default'])
      // A collection of the modifier’s name whose first mode, Figma’s default, is a context the modifier does not have.
      .withCollection('theme', ['light/cosy', 'dark/cosy'])
      .install();

    const result = await plan(themedDocument());

    assert.ok(
      warnings(result).some((op) =>
        /Collection "theme" has "light\/cosy" as its default mode, which the modifier no longer has/.test(op.message),
      ),
    );
    assert.ok(
      !result.operations.some((op) => op.kind === 'BREAKING' || op.kind === 'DELETE_MODE'),
      'and none of its modes is listed for deletion',
    );
    assert.ok(!result.operations.some((op) => op.kind === 'ADD_MODE'), 'nothing is added to it');
    assert.ok(!creates(result).some((op) => op.path === 'color/primary'), 'and the token that lives in it is not written');
    assert.ok(
      creates(result).some((op) => op.path === 'spacing/md'),
      'but the rest of the document is',
    );
    assert.ok(
      result.operations.some(
        (op) =>
          op.kind === 'SKIP' &&
          op.path === 'Demo.color.primary' &&
          op.cause === 'closed-collection' &&
          op.reason === '"Demo.color.primary" is not written: default mode removed',
      ),
    );
  });

  it('does not take a variable the earlier sync recorded for a token', async () => {
    // The record names a variable in the old collection; the sum never reaches into it.
    const mock = createFigmaMock()
      .withCollection(COLLECTION, ['default'])
      .withCollection('old', ['light', 'dark'])
      .withVariable('old', 'color/primary', 'COLOR')
      .install();
    stampAsHeld(mock.variable('old', 'color/primary')!, 'Demo.color.primary');

    const result = await plan(themedDocument());

    assert.ok(
      creates(result).some((op) => op.path === 'color/primary'),
      'it is made again, where it belongs',
    );
  });
});

describe('VariableSyncEngine — a context removed from the document', () => {
  useFigmaMock();

  const GONE =
    'the mode "sepia" of collection "theme" is gone: values in it are lost, and a frame or variant pinned to it falls back to "light"';

  const breaking = (result: VariablePlan) =>
    result.operations.filter((op): op is Extract<Operation, { kind: 'BREAKING' }> => op.kind === 'BREAKING');
  const deletions = (result: VariablePlan) =>
    result.operations.filter((op): op is Extract<Operation, { kind: 'DELETE_MODE' }> => op.kind === 'DELETE_MODE');
  const allowing = (resolver: Resolver) =>
    new VariableSyncEngine().buildPlan(resolver, COLLECTION, defaultTokenTypeMap, { allowBreaking: true });

  /** A file whose `theme` collection still holds `sepia`, a context the document no longer has. */
  const withSepia = (modes = ['light', 'dark', 'sepia']) =>
    createFigmaMock().withCollection(COLLECTION, ['default']).withCollection('theme', modes).install();

  it('takes a modifier’s collection holding an extra mode as the sum’s own, and does not stop', async () => {
    withSepia();

    const result = await plan(themedDocument());

    assert.ok(!warnings(result).some((op) => /earlier sync/.test(op.message)));
    assert.ok(
      creates(result).some((op) => op.path === 'color/primary'),
      'its tokens are written',
    );
    assert.equal(breaking(result).length, 1);
  });

  it('still stops before its first write when the base collection holds a mode besides default', async () => {
    createFigmaMock().withCollection(COLLECTION, ['default', 'light']).install();

    const result = await plan(themedDocument());

    assert.equal(result.operations.length, 1);
    assert.match(
      (result.operations[0] as { message: string }).message,
      /built by an earlier sync: it holds mode\(s\) light besides "default"/,
    );
  });

  it('lists the mode as breaking, without carrying the deletion, when breaking is not allowed', async () => {
    withSepia();

    const result = await plan(themedDocument());

    assert.deepEqual(
      breaking(result).map((op) => op.message),
      [GONE],
    );
    assert.deepEqual(deletions(result), []);
    assert.equal(new VariableSyncEngine().summarizePlan(result.operations).breaking, 1);
  });

  it('carries the deletion when breaking is allowed, after every value is written, naming the mode by its real id', async () => {
    const mock = withSepia();

    const result = await allowing(themedDocument());

    assert.deepEqual(
      breaking(result).map((op) => op.message),
      [GONE],
      'it is listed all the same',
    );
    const deleted = deletions(result);
    assert.equal(deleted.length, 1);
    assert.equal(deleted[0].modeId, modeIdOf(mock, 'theme', 'sepia'));
    assert.equal(deleted[0].collectionId, mock.collection('theme')!.id);
    assert.equal(result.operations.indexOf(deleted[0]), result.operations.length - 1, 'last of the plan');
    assert.ok(
      result.operations.some((op) => op.kind === 'SET_VARIABLE_VALUE'),
      'values are written before it',
    );
  });

  it('never deletes the default mode: a modifier whose default context is gone is reported and its collection is left alone', async () => {
    // Figma’s default is `sepia`, which the document no longer has.
    withSepia(['sepia', 'light', 'dark']);

    const result = await allowing(themedDocument());

    assert.deepEqual(deletions(result), []);
    assert.deepEqual(breaking(result), []);
    assert.ok(
      warnings(result).some((op) =>
        /Collection "theme" has "sepia" as its default mode, which the modifier no longer has/.test(op.message),
      ),
    );
    assert.ok(!result.operations.some((op) => op.kind === 'ADD_MODE'), 'no mode is added to it');
    assert.ok(!result.operations.some((op) => op.kind === 'SET_VARIABLE_VALUE' && /\[theme:/.test(op.label)), 'no value is written to it');
    assert.ok(
      creates(result).some((op) => op.path === 'spacing/md'),
      'the rest of the document is',
    );
  });

  it('deletes only the modes the modifier lacks when Figma’s default is not the document’s but is still a context', async () => {
    const mock = withSepia(['dark', 'light', 'sepia']);

    const result = await allowing(themedDocument());

    assert.deepEqual(
      deletions(result).map((op) => op.modeName),
      ['sepia'],
    );
    assert.ok(breaking(result)[0].message.endsWith('falls back to "dark"'));
    assert.ok(deletions(result).every((op) => op.modeId !== mock.collection('theme')!.defaultModeId));
  });

  it('leaves a collection of a modifier the document no longer has alone, and says so', async () => {
    const mock = createFigmaMock()
      .withCollection(COLLECTION, ['default'])
      .withCollection('theme', ['light', 'dark'])
      .withCollection('scheme', ['day', 'night'])
      .withVariable('scheme', 'color/old', 'COLOR')
      .install();
    // Its stamp: the document once put `color.old` in the collection of a modifier it has dropped.
    stampAsHeld(mock.variable('scheme', 'color/old')!, 'Demo.color.old');

    const result = await allowing(themedDocument());

    assert.ok(warnings(result).some((op) => /Collection "scheme" holds variables this document wrote/.test(op.message)));
    assert.deepEqual(deletions(result), [], 'not deleted');
    const schemeId = mock.collection('scheme')!.id;
    assert.ok(!result.operations.some((op) => 'collectionId' in op && op.collectionId === schemeId), 'and nothing is written to it');
  });
});

describe('VariableSyncEngine — the dirty check', () => {
  useFigmaMock();

  /** Plans, "applies", and returns extensions describing the synced state. */
  async function syncedOnce() {
    const mock = createFigmaMock()
      .withCollection(COLLECTION, ['default'])
      .withCollection('theme', ['light', 'dark'])
      // Applied: Figma holds a value in every mode, as it does once a run has written them.
      .withVariable('theme', 'color/primary', 'COLOR', { light: rgb(0, 1 / 3, 0.8), dark: rgb(0x11 / 255, 0x22 / 255, 0x33 / 255) })
      .withVariable(COLLECTION, 'spacing/md', 'FLOAT', { default: 16 })
      .install();

    const first = await plan(themedDocument());
    holdScopesOf(mock, first);
    await stampAsApplied(first.operations);

    return { mock };
  }

  it('skips a path only when every mode is unchanged', async () => {
    await syncedOnce();

    const result = await plan(themedDocument());

    assert.equal(setValuesFor(result, 'Demo.color.primary').length, 0, 'no writes');
    assert.ok(
      result.operations.some((op) => op.kind === 'SKIP' && op.path === 'Demo.color.primary' && op.reason === 'unchanged'),
      'one SKIP for the path',
    );
  });

  it('writes the dark value when only the dark value changed', async () => {
    // The defect this whole migration exists for. The old engine hashed only the
    // first permutation, so a dark-only edit left the hash equal, the plan said
    // "SKIP — unchanged", and dark stayed stale for good — with the UI reporting
    // a clean run. The previous version of this test asserted that behaviour.
    await syncedOnce();

    const edited = themedDocument({
      modifiers: {
        theme: {
          default: 'light',
          contexts: {
            light: [{ color: { primary: { $type: 'color', $value: '#0055cc' } } }],
            dark: [{ color: { primary: { $type: 'color', $value: '#2e2e44' } } }],
          },
        },
      },
    } as Partial<ResolverDocument>);

    const result = await plan(edited);
    const writes = setValuesFor(result, 'Demo.color.primary');

    assert.equal(writes.length, 1, 'exactly one mode is stale');
    assert.equal(writes[0].kind === 'SET_VARIABLE_VALUE' && writes[0].modeName, 'dark');
    assert.ok(
      !result.operations.some((op) => op.kind === 'SKIP' && op.path === 'Demo.color.primary' && op.reason === 'unchanged'),
      'and the path must not also report as unchanged',
    );
  });

  it('writes every mode of a stamped variable whose receipt holds none of them, though Figma agrees', async () => {
    const mock = createFigmaMock()
      .withCollection(COLLECTION, ['default'])
      .withCollection('theme', ['light', 'dark'])
      .withVariable('theme', 'color/primary', 'COLOR', { light: rgb(0, 1 / 3, 0.8), dark: rgb(0x11 / 255, 0x22 / 255, 0x33 / 255) })
      .install();
    // Stamped as Toghen's, with nothing written yet: a run that stopped after the create.
    stampAs(mock.variable('theme', 'color/primary')!, 'Demo.color.primary');

    const result = await plan(themedDocument());

    assert.equal(setValuesFor(result, 'Demo.color.primary').length, 2, 'both modes are written, so the stamp says so');
  });
});

describe('VariableSyncEngine — reconciliation', () => {
  useFigmaMock();

  it('renames a variable a user renamed in Figma', async () => {
    const mock = createFigmaMock()
      .withCollection(COLLECTION, ['default'])
      .withCollection('theme', ['light', 'dark'])
      .withVariable('theme', 'color/renamed-by-hand', 'COLOR')
      .install();

    stampAsHeld(mock.variable('theme', 'color/renamed-by-hand')!, 'Demo.color.primary');

    const { operations } = await plan(themedDocument());
    const rename = operations.find((op) => op.kind === 'RENAME_VARIABLE');

    // A rename does not change the stamp, so the variable is still found, and
    // the drift was previously invisible.
    assert.ok(rename && rename.kind === 'RENAME_VARIABLE');
    assert.equal(rename.name, 'color/primary');
    assert.ok(!operations.some((op) => op.kind === 'CREATE_VARIABLE' && op.path === 'color/primary'), 'and it must not be recreated');
  });

  it('renames a variable that still has the collection prefix, though its value is unchanged', async () => {
    // A document with no modifiers: the earlier sync's one mode, `default`, is the sum's, so the
    // collection is reused and the variable stamped for the token is renamed in place, not made twice.
    const resolver = themedDocument({ modifiers: {}, resolutionOrder: [{ $ref: '#/sets/base' }] } as Partial<ResolverDocument>);
    const mock = createFigmaMock()
      .withCollection(COLLECTION, ['default'])
      .withVariable(COLLECTION, 'Demo/spacing/md', 'FLOAT', { default: 16 })
      .install();
    const first = await plan(resolver);
    // The first plan creates the variable under its own name, with its scopes; the file holds them on the one it already has.
    mock.variable(COLLECTION, 'Demo/spacing/md')!.scopes = creates(first)[0].scopes!;
    stampAsHeld(mock.variable(COLLECTION, 'Demo/spacing/md')!, 'Demo.spacing.md');

    const { operations } = await plan(resolver);

    const rename = operations.find((op) => op.kind === 'RENAME_VARIABLE');
    assert.ok(rename && rename.kind === 'RENAME_VARIABLE');
    assert.equal(rename.name, 'spacing/md');
    assert.ok(operations.some((op) => op.kind === 'SKIP' && op.path === 'Demo.spacing.md' && op.reason === 'unchanged'));
    assert.ok(!operations.some((op) => op.kind === 'CREATE_VARIABLE' || op.kind === 'SET_VARIABLE_VALUE'));
  });

  it('refuses a type change instead of planning a create that Figma rejects', async () => {
    const mock = createFigmaMock()
      .withCollection(COLLECTION, ['default'])
      .withCollection('theme', ['light', 'dark'])
      // The document says color; Figma holds a FLOAT under that name.
      .withVariable('theme', 'color/primary', 'FLOAT')
      .install();

    stampAsHeld(mock.variable('theme', 'color/primary')!, 'Demo.color.primary');

    const { operations } = await plan(themedDocument());

    assert.ok(operations.some((op) => op.kind === 'WARNING' && op.path === 'Demo.color.primary' && /cannot change type/.test(op.message)));
    assert.ok(
      !operations.some((op) => op.kind === 'CREATE_VARIABLE' && op.path === 'color/primary'),
      'a create would be rejected by Figma for a name that already exists, losing the symbolic id',
    );
    assert.equal(setValuesFor({ operations }, 'Demo.color.primary').length, 0);
  });

  it('adds a mode the collection lacks', async () => {
    createFigmaMock().withCollection(COLLECTION, ['default']).withCollection('theme', ['light']).install();

    const { operations } = await plan(themedDocument());

    assert.ok(operations.some((op) => op.kind === 'ADD_MODE' && op.collectionName === 'theme' && op.modeName === 'dark'));
  });

  it('warns when Figma’s default mode is not the document’s', async () => {
    createFigmaMock()
      .withCollection(COLLECTION, ['default'])
      // dark first, so Figma's default is dark while the document says light.
      .withCollection('theme', ['dark', 'light'])
      .install();

    const { operations } = await plan(themedDocument());

    assert.ok(operations.some((op) => op.kind === 'WARNING' && /default mode/.test(op.message) && /"dark"/.test(op.message)));
  });
});

describe('VariableSyncEngine — drift', () => {
  useFigmaMock();

  /**
   * A file where both variables already hold exactly what the document says,
   * with extensions recording that state — i.e. a clean, freshly-synced file.
   */
  async function cleanlySynced() {
    const mock = createFigmaMock()
      .withCollection(COLLECTION, ['default'])
      .withCollection('theme', ['light', 'dark'])
      .withVariable('theme', 'color/primary', 'COLOR', {
        light: { r: 0, g: 1 / 3, b: 0.8, a: 1 },
        dark: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255, a: 1 },
      })
      .withVariable(COLLECTION, 'spacing/md', 'FLOAT', { default: 16 })
      .install();
    for (const [collection, name, syntax] of [
      [COLLECTION, 'spacing/md', 'var(--spacing-md)'],
      ['theme', 'color/primary', 'var(--color-primary)'],
    ]) {
      mock.variable(collection, name)!.setVariableCodeSyntax('WEB', syntax);
    }

    const first = await plan(themedDocument());
    holdScopesOf(mock, first);
    await stampAsApplied(first.operations);

    return { mock };
  }

  /**
   * Every drift explanation for a path, wherever it is carried.
   *
   * Deliberately looks in both places. A drifted path that is *only* drifted
   * carries its explanation on the SKIP; one that also has work to do has no
   * SKIP, so the explanation stands alone as a WARNING. The assertion that
   * matters is that it is said exactly once, not where it is said.
   */
  const driftMessages = (plan: VariablePlan, path: string): string[] =>
    plan.operations.flatMap((op) => {
      if (op.kind === 'WARNING' && op.path === path && /Changed in Figma/.test(op.message)) {
        return [op.message];
      }
      if (op.kind === 'SKIP' && op.path === path && op.message) {
        return [op.message];
      }
      return [];
    });

  it('reports a value a person changed in Figma', async () => {
    // The state the plugin was structurally unable to see: it wrote to Figma,
    // remembered the hash of what it wrote, and never once read back.
    const { mock } = await cleanlySynced();

    mock.variable('theme', 'color/primary')!.valuesByMode[modeIdOf(mock, 'theme', 'dark')] = rgb(1, 0, 0);

    const result = await plan(themedDocument());

    const messages = driftMessages(result, 'Demo.color.primary');
    assert.equal(messages.length, 1);
    assert.match(messages[0], /dark/);
    assert.doesNotMatch(messages[0], /light/, 'only the mode that moved');
  });

  it('says it once, on the row it belongs to', async () => {
    // It used to arrive twice: a WARNING explaining the drift and a SKIP
    // recording it, so four drifted tokens filled eight rows and the summary
    // reported the same count twice as `4 drifted · 4 warnings`.
    const { mock } = await cleanlySynced();
    mock.variable(COLLECTION, 'spacing/md')!.valuesByMode[modeIdOf(mock, COLLECTION, 'default')] = 24;

    const result = await plan(themedDocument());

    const forPath = result.operations.filter((op) => 'path' in op && op.path === 'Demo.spacing.md');
    assert.equal(forPath.length, 1, `expected one row, got ${forPath.map((op) => op.kind)}`);
    assert.equal(forPath[0].kind, 'SKIP');
    assert.ok(forPath[0].kind === 'SKIP' && forPath[0].message, 'and it carries its own explanation');

    const summary = new VariableSyncEngine().summarizePlan(result.operations);
    assert.equal(summary.drifted, 1);
    assert.equal(summary.warnings, 0, 'the count is not reported a second time as a warning');
  });

  it('still explains drift on a path that also has work to do', async () => {
    // `dark` edited in Figma while `light` moved in the document. There is no
    // SKIP to carry the explanation, because the path is not skipped — so it
    // stands alone. Attaching the message only to the SKIP would have lost it.
    //
    // It has to be a *theme-specific* token: `spacing.md` has one value, so it
    // cannot have work in one mode and drift in another.
    const { mock } = await cleanlySynced();
    mock.variable('theme', 'color/primary')!.valuesByMode[modeIdOf(mock, 'theme', 'dark')] = rgb(1, 0, 0);

    // Only `light` moves in the document; `dark` moved in Figma.
    const edited = themedDocument({
      modifiers: {
        theme: {
          default: 'light',
          contexts: {
            light: [{ color: { primary: { $type: 'color', $value: '#00aa55' } } }],
            dark: [{ color: { primary: { $type: 'color', $value: '#112233' } } }],
          },
        },
      },
    });
    const result = await plan(edited);

    const messages = driftMessages(result, 'Demo.color.primary');
    assert.equal(messages.length, 1, 'the drift is still reported exactly once');
    assert.match(messages[0], /dark/);
    assert.ok(
      result.operations.some((op) => op.kind === 'WARNING' && op.path === 'Demo.color.primary'),
      'and it stands alone, because there is no skip to carry it',
    );
    assert.equal(setValuesFor(result, 'Demo.color.primary').length, 1, 'the light value is still written');
  });

  it('reports a hand edit where the document moved too, and leaves it alone', async () => {
    // What the root record could not see: its hash was the token's, so a document that moved hid any edit in Figma.
    const { mock } = await cleanlySynced();
    mock.variable(COLLECTION, 'spacing/md')!.valuesByMode[modeIdOf(mock, COLLECTION, 'default')] = 24;
    const moved = themedDocument({
      sets: { base: { sources: [{ spacing: { md: { $type: 'dimension', $value: { value: 20, unit: 'px' } } } }] } },
    } as Partial<ResolverDocument>);

    const result = await plan(moved);

    assert.equal(setValuesFor(result, 'Demo.spacing.md').length, 0, 'the edit is not overwritten');
    assert.ok(result.operations.some((op) => op.kind === 'SKIP' && op.path === 'Demo.spacing.md' && op.reason === 'drifted'));
    const overwritten = await new VariableSyncEngine().buildPlan(moved, COLLECTION, defaultTokenTypeMap, { overwriteDrift: true });
    assert.deepEqual(
      setValuesFor(overwritten, 'Demo.spacing.md').map((op) => op.kind === 'SET_VARIABLE_VALUE' && op.value),
      [20],
      'and --overwrite-drift writes the document',
    );
  });

  it('leaves the drifted value alone rather than overwriting it', async () => {
    // The document still asks for what was written, so there is nothing to
    // sync — and quietly restoring 16 would destroy a deliberate local edit.
    const { mock } = await cleanlySynced();
    mock.variable(COLLECTION, 'spacing/md')!.valuesByMode[modeIdOf(mock, COLLECTION, 'default')] = 24;

    const result = await plan(themedDocument());

    assert.equal(setValuesFor(result, 'Demo.spacing.md').length, 0, 'no write is planned');
    assert.ok(
      result.operations.some((op) => op.kind === 'SKIP' && op.path === 'Demo.spacing.md' && op.reason === 'drifted'),
      'and the skip says drifted, not unchanged',
    );
  });

  it('says nothing about a file that matches the document', async () => {
    // The complement: the fix must not be "always warn".
    await cleanlySynced();

    const result = await plan(themedDocument());

    assert.equal(driftMessages(result, 'Demo.spacing.md').length, 0);
    assert.equal(driftMessages(result, 'Demo.color.primary').length, 0);
    assert.ok(result.operations.some((op) => op.kind === 'SKIP' && op.path === 'Demo.spacing.md' && op.reason === 'unchanged'));
    assert.deepEqual(
      result.operations.filter((op) => op.kind !== 'SKIP' && op.kind !== 'WARNING'),
      [],
      'and plans no work at all',
    );
  });

  it('does not mistake float32 storage for a person', async () => {
    // Measured: Figma stores float32, so 0.4 reads back as 0.4000000059604645
    // (.reference/figma/measured_behaviour.md). The receipt hashes what Figma
    // reports after the write, float32 and all, so the next read compares exactly.
    const { mock } = await cleanlySynced();
    const lightModeId = modeIdOf(mock, 'theme', 'light');
    const variable = mock.variable('theme', 'color/primary')!;

    const stored = variable.valuesByMode[lightModeId] as RGBA;
    variable.valuesByMode[lightModeId] = { ...stored, g: Math.fround(stored.g), b: Math.fround(stored.b) };
    stampAsHeld(variable, 'Demo.color.primary');

    const result = await plan(themedDocument());

    assert.equal(driftMessages(result, 'Demo.color.primary').length, 0);
    assert.equal(setValuesFor(result, 'Demo.color.primary').length, 0, 'and nothing is written');
  });
});

describe('VariableSyncEngine — a reference becomes an alias', () => {
  useFigmaMock();

  const BRAND = { colorSpace: 'srgb', components: [0, 0.4, 0.8] };
  const WHITE = { colorSpace: 'srgb', components: [1, 1, 1] };
  const BRAND_ALIAS = { type: 'VARIABLE_ALIAS', id: '$var:Demo/color/brand' };

  /**
   * `color.button.bg` refers to `color.brand` and is declared first, so path
   * order alone would plan its values before the variable it points at exists.
   * `color.accent` is a reference in light and a literal in dark.
   * `label.weight` is a string referring to a fontWeight: STRING against FLOAT.
   */
  function aliasDocument(): Resolver {
    return new Resolver({
      version: '2025-11-01',
      name: COLLECTION,
      sets: {
        base: {
          sources: [
            {
              color: {
                $type: 'color',
                button: { bg: { $value: '{color.brand}' } },
                brand: { $value: BRAND },
              },
              font: { weight: { bold: { $type: 'fontWeight', $value: 700 } } },
              label: { weight: { $type: 'string', $value: '{font.weight.bold}' } },
            },
          ],
        },
      },
      modifiers: {
        theme: {
          default: 'light',
          contexts: {
            light: [{ color: { accent: { $type: 'color', $value: '{color.brand}' } } }],
            dark: [{ color: { accent: { $type: 'color', $value: WHITE } } }],
          },
        },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
    } as ResolverDocument);
  }

  it('aliases a new variable to another new one, after both are created', async () => {
    createFigmaMock().install();

    const result = await plan(aliasDocument());
    const indexOfCreate = (name: string) => result.operations.findIndex((op) => op.kind === 'CREATE_VARIABLE' && op.path === name);

    const brandCreate = indexOfCreate('color/brand');
    const bgCreate = indexOfCreate('color/button/bg');
    assert.ok(brandCreate >= 0 && bgCreate >= 0, 'both variables are created');

    const writes = setValuesFor(result, 'Demo.color.button.bg');
    assert.equal(writes.length, 1, 'once, in the base collection’s one mode');
    for (const write of writes) {
      assert.ok(write.kind === 'SET_VARIABLE_VALUE');
      assert.deepEqual(write.value, BRAND_ALIAS);
      const at = result.operations.indexOf(write);
      assert.ok(at > brandCreate && at > bgCreate, 'the alias is set after both creates');
    }
  });

  it('aliases to the id of a target that already exists', async () => {
    const mock = createFigmaMock().withCollection(COLLECTION, ['default']).withVariable(COLLECTION, 'color/brand', 'COLOR').install();

    const result = await plan(aliasDocument());

    assert.deepEqual(valueIn(result, 'Demo.color.button.bg', 'default'), {
      type: 'VARIABLE_ALIAS',
      id: mock.variable(COLLECTION, 'color/brand')!.id,
    });
  });

  it('writes the value, and says why, when the target becomes another variable type', async () => {
    createFigmaMock().install();

    const result = await plan(aliasDocument());

    assert.equal(valueIn(result, 'Demo.label.weight', 'default'), '700');
    const reported = result.operations.filter((op) => op.kind === 'WARNING' && op.path === 'Demo.label.weight');
    assert.equal(reported.length, 1, 'one warning, not one per mode');
    assert.ok(reported[0].kind === 'WARNING');
    assert.equal(
      reported[0].message,
      '"Demo.label.weight" refers to "Demo.font.weight.bold", but they become different variable ' +
        'types (STRING, FLOAT), so the value is written instead of an alias.',
    );
  });

  it('aliases in the context that refers, and writes the value in the context that does not', async () => {
    createFigmaMock().install();

    const result = await plan(aliasDocument());

    // The alias crosses collections: `accent` lives in `theme`, `brand` in the base.
    assert.deepEqual(valueIn(result, 'Demo.color.accent', 'light'), BRAND_ALIAS);
    assert.deepEqual(valueIn(result, 'Demo.color.accent', 'dark'), { r: 1, g: 1, b: 1, a: 1 });
  });

  it('agrees with a variable a designer aliased by hand to the same target', async () => {
    // The smell this closes: a hand-made alias never equalled a baked value, so
    // it read as drift on every sync, forever.
    const mock = createFigmaMock()
      .withCollection(COLLECTION, ['default'])
      .withVariable(COLLECTION, 'color/brand', 'COLOR', { default: { r: 0, g: 0.4, b: 0.8, a: 1 } })
      .withVariable(COLLECTION, 'color/button/bg', 'COLOR')
      .install();
    const brandId = mock.variable(COLLECTION, 'color/brand')!.id;
    const bg = mock.variable(COLLECTION, 'color/button/bg')!;
    for (const mode of mock.collection(COLLECTION)!.modes) {
      bg.valuesByMode[mode.modeId] = { type: 'VARIABLE_ALIAS', id: brandId };
    }
    for (const variable of mock.variables()) {
      variable.setVariableCodeSyntax('WEB', `var(--${variable.name.replace(/\//g, '-')})`);
    }

    const first = await plan(aliasDocument());
    holdScopesOf(mock, first);
    await stampAsApplied(first.operations);
    const result = await plan(aliasDocument());

    assert.ok(
      result.operations.some((op) => op.kind === 'SKIP' && op.path === 'Demo.color.button.bg' && op.reason === 'unchanged'),
      'SKIP unchanged, not drifted',
    );
    assert.equal(new VariableSyncEngine().summarizePlan(result.operations).drifted, 0);
  });

  it('stamps what Figma reports for a token in the structured shapes, one receipt per mode', async () => {
    const mock = createFigmaMock().install();
    const resolver = themedDocument({
      sets: {
        base: { sources: [{ spacing: { md: { $type: 'dimension', $value: { value: 16, unit: 'px' } } } }] },
      },
      modifiers: {
        theme: {
          default: 'light',
          contexts: {
            light: [{ color: { primary: { $type: 'color', $value: { colorSpace: 'srgb', components: [0, 0.4, 0.8] } } } }],
            dark: [{ color: { primary: { $type: 'color', $value: { colorSpace: 'srgb', components: [0.1, 0.2, 0.3] } } } }],
          },
        },
      },
    } as Partial<ResolverDocument>);

    await runOperations((await plan(resolver)).operations, { onProgress: () => {} });

    const colour = stampOf(mock.variable('theme', 'color/primary')!)!;
    assert.deepEqual(colour.is, { token: 'Demo.color.primary' });
    assert.notEqual(colour.receipt[modeIdOf(mock, 'theme', 'light')], colour.receipt[modeIdOf(mock, 'theme', 'dark')]);
    assert.ok(stampOf(mock.variable(COLLECTION, 'spacing/md')!)!.receipt[modeIdOf(mock, COLLECTION, 'default')]);
    assert.deepEqual(
      (await plan(resolver)).operations.filter((op) => op.kind !== 'SKIP'),
      [],
      'and the next plan has nothing to write',
    );
  });

  it('hashes what Figma reads back after the write, not the value it was sent', async () => {
    // The mock keeps numbers as float32, as Figma does: a receipt of the value sent would read as a hand edit.
    const mock = createFigmaMock().install();
    const resolver = themedDocument({
      sets: { base: { sources: [{ spacing: { md: { $type: 'dimension', $value: { value: 0.3, unit: 'px' } } } }] } },
    } as Partial<ResolverDocument>);
    const operations = (await plan(resolver)).operations;
    await runOperations(operations, { onProgress: () => {} });

    const sent = operations.find((op) => op.kind === 'SET_VARIABLE_VALUE' && op.tokenPath === 'Demo.spacing.md');
    assert.ok(sent && sent.kind === 'SET_VARIABLE_VALUE');
    const held = mock.valueFor(COLLECTION, 'spacing/md', 'default');
    assert.equal(held, Math.fround(0.3), 'Figma holds float32');
    const receipt = stampOf(mock.variable(COLLECTION, 'spacing/md')!)!.receipt[modeIdOf(mock, COLLECTION, 'default')];
    assert.equal(receipt, hashOf(held));
    assert.notEqual(receipt, hashOf(sent.value), 'not the value the plan sent');
    assert.ok(
      (await plan(resolver)).operations.some((op) => op.kind === 'SKIP' && op.path === 'Demo.spacing.md' && op.reason === 'unchanged'),
    );
  });
});
