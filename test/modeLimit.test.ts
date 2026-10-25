/**
 * Figma's mode limit, and the contexts Figma gets.
 *
 * A collection holds at most ten modes, for every file. A modifier says which of its contexts Figma gets
 * (`$extensions["com.toghen"].figma.include`); CSS still writes them all. The plan finds a collection over the
 * limit before anything is written, so a dry run and a real run find it alike.
 *
 * Synthetic documents in the W3C structured shapes (`{colorSpace,components}`, `{value,unit}`).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver, type ResolverDocument } from '@toghen/lib';
import { VariableSyncEngine, type VariablePlan } from '../main/engines/variableSyncEngine.js';
import { designSourceOf } from '../main/utils/designSource.js';
import { MAX_MODES } from '../main/utils/resolverModes.js';
import { LOAD_DOCUMENT } from '../main/handlers/loadDocument.js';
import { oneFile } from './support/oneFile.js';
import { PLAN_VARIABLE_SYNC } from '../main/handlers/planVariableSync.js';
import { EXECUTE_VARIABLE_SYNC } from '../main/handlers/executeVariableSync.js';
import { getState, resetState } from '../main/runtimeState.js';
import { readComponentFile } from '../shared/components/index.js';
import { defaultTokenTypeMap } from '../shared/tokenTypeMap.js';
import type { Operation } from '../shared/operations.js';
import { createFigmaMock, useFigmaMock } from './support/figmaMock.js';

const px = (value: number) => ({ value, unit: 'px' });
const srgb = (...components: number[]) => ({ colorSpace: 'srgb', components });
const figma = (include: string[]) => ({ 'com.toghen': { figma: { include } } });

const names = (count: number) => Array.from({ length: count }, (_, k) => `c${k}`);

/**
 * - `space.gap` is the base alone.
 * - `swatch.fill` is the base, and `hue` sets it in every context but the default: `c<k>` is `k/20` red.
 * - `ring.color` has no base and only the last context of `hue` defines it.
 * - `badge.bg` is the base, `tone` (alert) and `hue` (`c1`, and the last context): a chain of two links.
 */
function document(count: number, include?: string[]): ResolverDocument {
  const contexts: Record<string, unknown> = {};
  names(count).forEach((context, k) => {
    const defines: Record<string, unknown> = {};
    if (k > 0) defines.swatch = { fill: { $value: srgb(k / 20, 0.2, 0.4) } };
    if (k === count - 1) defines.ring = { color: { $type: 'color', $value: srgb(0.1, 0.1, 0.1) } };
    if (k === 1 || k === count - 1) defines.badge = { bg: { $value: srgb(0, k / 20, 0) } };
    contexts[context] = [defines];
  });
  return {
    version: '2025-11-01',
    name: 'Demo',
    sets: {
      base: {
        sources: [
          {
            space: { gap: { $type: 'dimension', $value: px(8) } },
            swatch: { fill: { $type: 'color', $value: srgb(0.5, 0.5, 0.5) } },
            badge: { bg: { $type: 'color', $value: srgb(0.9, 0.9, 0.9) } },
          },
        ],
      },
    },
    modifiers: {
      tone: { default: 'neutral', contexts: { neutral: [{}], alert: [{ badge: { bg: { $value: srgb(0.8, 0.1, 0.1) } } }] } },
      hue: { default: 'c0', ...(include ? { $extensions: figma(include) } : {}), contexts },
    },
    resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/tone' }, { $ref: '#/modifiers/hue' }],
  } as ResolverDocument;
}

const plan = (resolver: Resolver, options: { allowBreaking?: boolean } = {}) =>
  new VariableSyncEngine().buildPlan(resolver, 'Demo', defaultTokenTypeMap, options);

const stops = (result: VariablePlan) =>
  result.operations.filter((op): op is Extract<Operation, { kind: 'WARNING' }> => op.kind === 'WARNING' && op.stops === true);
const created = (result: VariablePlan) =>
  result.operations.filter((op): op is Extract<Operation, { kind: 'CREATE_COLLECTION' }> => op.kind === 'CREATE_COLLECTION');
const sets = (result: VariablePlan, path: string) =>
  result.operations.filter(
    (op): op is Extract<Operation, { kind: 'SET_VARIABLE_VALUE' }> => op.kind === 'SET_VARIABLE_VALUE' && op.tokenPath === path,
  );
const valueIn = (result: VariablePlan, path: string, mode: string) => sets(result, path).find((op) => op.modeName === mode)?.value;
const mentions = (result: VariablePlan, path: string) =>
  result.operations.filter(
    (op) =>
      ('path' in op && op.path?.startsWith(path)) ||
      ('tokenPath' in op && op.tokenPath?.startsWith(path)) ||
      ('message' in op && op.message !== undefined && op.message.includes(path)),
  );

const message = (modifier: string, count: number) =>
  `"${modifier}" has ${count} contexts for Figma and Figma allows 10 modes per collection; keep at most 10 of them in figma.include.`;

describe('the mode limit', () => {
  useFigmaMock();

  it('is ten, one constant', () => {
    assert.equal(MAX_MODES, 10);
  });

  it('stops the plan, with the exact message and nothing else, for a modifier of 14 contexts and no key', async () => {
    createFigmaMock().install();

    const result = await plan(new Resolver(document(14)));

    assert.deepEqual(result.operations, [{ kind: 'WARNING', message: message('hue', 14), stops: true }]);
  });

  it('writes nothing: the stop is in the plan, which is all a dry run and a real run read', async () => {
    const mock = createFigmaMock().install();
    resetState();
    await LOAD_DOCUMENT(oneFile(JSON.stringify(document(14))));
    await PLAN_VARIABLE_SYNC({});

    assert.deepEqual(getState().lastPlan, [{ kind: 'WARNING', message: message('hue', 14), stops: true }]);
    await EXECUTE_VARIABLE_SYNC();
    assert.deepEqual([mock.collections(), mock.variables()], [[], []], 'the plan holds nothing to run');
  });

  it('says every collection over the limit, not only the first', async () => {
    createFigmaMock().install();
    const doc = document(14);
    (doc.modifiers as Record<string, { contexts: Record<string, unknown> }>).tone.contexts = Object.fromEntries(
      names(11).map((context) => [context, [{}]]),
    );
    (doc.modifiers as Record<string, { default: string }>).tone.default = 'c0';

    const result = await plan(new Resolver(doc));

    assert.deepEqual(
      stops(result).map((op) => op.message),
      [message('tone', 11), message('hue', 14)],
    );
  });

  it('counts a key listing eleven, and stops the same way', async () => {
    createFigmaMock().install();

    const result = await plan(new Resolver(document(14, names(11))));

    assert.deepEqual(result.operations, [{ kind: 'WARNING', message: message('hue', 11), stops: true }]);
  });

  it('lets a modifier of exactly ten through, with no key', async () => {
    createFigmaMock().install();

    const result = await plan(new Resolver(document(10)));

    assert.deepEqual(stops(result), []);
    assert.deepEqual(created(result).find((op) => op.name === 'hue')?.modes, names(10));
  });

  it('plans a key that lists every context exactly as no key does', async () => {
    createFigmaMock().install();

    const without = await plan(new Resolver(document(10)));
    const all = await plan(new Resolver(document(10, names(10))));

    assert.deepEqual(all.operations, without.operations);
  });
});

describe('figma.include: the contexts Figma gets', () => {
  useFigmaMock();

  it('makes the modes from the list, the default first and the rest in the document’s order, whatever order it is written in', async () => {
    createFigmaMock().install();

    const result = await plan(new Resolver(document(14, ['c9', 'c3', 'c0', 'c13', 'c1'])));

    assert.deepEqual(stops(result), []);
    assert.deepEqual(created(result).find((op) => op.name === 'hue')?.modes, ['c0', 'c1', 'c3', 'c9', 'c13']);
  });

  it('writes each listed context’s own value and no other', async () => {
    createFigmaMock().install();

    const result = await plan(new Resolver(document(14, ['c9', 'c3', 'c0', 'c13', 'c1'])));

    assert.deepEqual(
      sets(result, 'Demo.swatch.fill').map((op) => op.modeName),
      ['c0', 'c1', 'c3', 'c9', 'c13'],
    );
    assert.deepEqual(valueIn(result, 'Demo.swatch.fill', 'c0'), { r: 0.5, g: 0.5, b: 0.5, a: 1 }, 'the default carries the base');
    assert.deepEqual(valueIn(result, 'Demo.swatch.fill', 'c3'), { r: 0.15, g: 0.2, b: 0.4, a: 1 });
    assert.deepEqual(valueIn(result, 'Demo.swatch.fill', 'c9'), { r: 0.45, g: 0.2, b: 0.4, a: 1 });
    assert.ok(
      !result.operations.some((op) => op.kind === 'SET_VARIABLE_VALUE' && ['c2', 'c4', 'c12'].includes(op.modeName)),
      'no left-out context is written',
    );
  });

  it('leaves CSS alone: the lib resolves every context, and stores the key without reading it', () => {
    const resolver = new Resolver(document(14, ['c0', 'c1']));

    assert.deepEqual(resolver.getModifiers().find((m) => m.name === 'hue')?.contexts, names(14));
    assert.deepEqual(resolver.valueAt('swatch.fill', { hue: 'c12' }), srgb(0.6, 0.2, 0.4), 'a left-out context still has its value');
  });

  it('gives a token defined only in left-out contexts no variable, and does not report it', async () => {
    createFigmaMock().install();

    const result = await plan(new Resolver(document(14, ['c0', 'c1'])));

    assert.deepEqual(mentions(result, 'Demo.ring'), []);
    assert.ok(!result.operations.some((op) => op.kind === 'CREATE_VARIABLE' && op.path === 'ring/color'));
    assert.ok(
      result.operations.some((op) => op.kind === 'CREATE_VARIABLE' && op.path === 'space/gap'),
      'the rest of the plan stands',
    );
  });

  it('still refuses that token when its context is one Figma gets (the hole is real there)', async () => {
    createFigmaMock().install();

    const result = await plan(new Resolver(document(5, ['c0', 'c1', 'c4'])));

    assert.ok(
      mentions(result, 'Demo.ring').some(
        (op) => op.kind === 'WARNING' && /defined only in hue=c4 and has no value where hue=c0/.test(op.message),
      ),
    );
  });

  it('does not write a chain’s link for a left-out context, and aliases the rest as before', async () => {
    createFigmaMock().install();

    const result = await plan(new Resolver(document(14, ['c0', 'c1', 'c5'])));

    // The head lives in `hue` (the last link): its own value where hue defines it, an alias to the `tone` link where not.
    assert.deepEqual(
      sets(result, 'Demo.badge.bg').map((op) => op.modeName),
      ['c0', 'c1', 'c5'],
    );
    assert.deepEqual(valueIn(result, 'Demo.badge.bg', 'c0'), { type: 'VARIABLE_ALIAS', id: '$var:tone/badge/bg--tone' });
    assert.deepEqual(valueIn(result, 'Demo.badge.bg', 'c1'), { r: 0, g: 0.05, b: 0, a: 1 });
    assert.deepEqual(valueIn(result, 'Demo.badge.bg', 'c5'), { type: 'VARIABLE_ALIAS', id: '$var:tone/badge/bg--tone' });
    assert.deepEqual(
      sets(result, 'Demo.badge.bg~tone').map((op) => op.modeName),
      ['neutral', 'alert'],
    );
  });

  it('leaves out of the record a token’s types in a left-out context', async () => {
    createFigmaMock().install();
    const doc = document(14, ['c0', 'c1']);
    // `c7` makes `space.gap` a string; only a context Figma does not get.
    (doc.modifiers as Record<string, { contexts: Record<string, unknown[]> }>).hue.contexts.c7 = [
      { space: { gap: { $type: 'string', $value: 'wide' } } },
    ];

    const result = await plan(new Resolver(doc));

    assert.deepEqual(
      mentions(result, 'Demo.space.gap').filter((op) => op.kind === 'WARNING'),
      [],
      'no type conflict',
    );
    assert.deepEqual(valueIn(result, 'Demo.space.gap', 'c0') ?? valueIn(result, 'Demo.space.gap', 'default'), 8);
  });

  for (const [what, include, expected] of [
    ['leaves out the default context', ['c1', 'c2'], /^Modifier "hue": figma\.include must list its default context "c0"/],
    [
      'names a context the modifier does not have',
      ['c0', 'c99'],
      /^Modifier "hue" lists "c99" in figma\.include, which is not a context of it/,
    ],
    ['is not a list', 'c0', /^Modifier "hue": figma\.include must be a list of context names/],
    ['is an empty list', [], /^Modifier "hue": figma\.include must list its default context "c0"/],
  ] as const) {
    it(`stops the plan, naming the modifier, when the list ${what}`, async () => {
      createFigmaMock().install();

      const result = await plan(new Resolver(document(14, include as unknown as string[])));

      assert.equal(result.operations.length, 1);
      assert.equal(result.operations[0].kind, 'WARNING');
      assert.match((result.operations[0] as { message: string }).message, expected);
      assert.equal((result.operations[0] as { stops?: true }).stops, true);
    });
  }
});

describe('a context taken out of the list, or put in', () => {
  useFigmaMock();

  const GONE = 'the mode "c2" of collection "hue" is gone: values in it are lost, and a frame or variant pinned to it falls back to "c0"';
  const synced = () => createFigmaMock().withCollection('Demo', ['default']).withCollection('hue', ['c0', 'c1', 'c2']).install();

  it('is a mode removed: listed as breaking, and not carried without allowBreaking', async () => {
    synced();

    const result = await plan(new Resolver(document(14, ['c0', 'c1'])));

    assert.deepEqual(
      result.operations.filter((op) => op.kind === 'BREAKING').map((op) => (op as { message: string }).message),
      [GONE],
    );
    assert.deepEqual(
      result.operations.filter((op) => op.kind === 'DELETE_MODE'),
      [],
    );
  });

  it('is deleted with allowBreaking, last of the plan, after the values of the remaining modes', async () => {
    const mock = synced();

    const result = await plan(new Resolver(document(14, ['c0', 'c1'])), { allowBreaking: true });

    const deleted = result.operations.filter((op): op is Extract<Operation, { kind: 'DELETE_MODE' }> => op.kind === 'DELETE_MODE');
    assert.deepEqual(
      deleted.map((op) => [op.collectionName, op.modeName, op.modeId]),
      [['hue', 'c2', mock.collection('hue')!.modes[2].modeId]],
    );
    assert.equal(result.operations.indexOf(deleted[0]), result.operations.length - 1);
    assert.ok(result.operations.some((op) => op.kind === 'SET_VARIABLE_VALUE'));
  });

  it('is a mode added when it is put in later', async () => {
    createFigmaMock().withCollection('Demo', ['default']).withCollection('hue', ['c0', 'c1']).install();

    const result = await plan(new Resolver(document(14, ['c0', 'c1', 'c2'])));

    assert.deepEqual(
      result.operations.filter((op) => op.kind === 'ADD_MODE').map((op) => (op as { modeName: string }).modeName),
      ['c2'],
    );
    assert.deepEqual(
      result.operations.filter((op) => op.kind === 'BREAKING'),
      [],
    );
  });

  it('is not taken for a context removed from the document when the list never named it', async () => {
    synced();

    // Three listed, none removed: nothing to say.
    const result = await plan(new Resolver(document(14, ['c0', 'c1', 'c2'])));

    assert.deepEqual(
      result.operations.filter((op) => op.kind === 'BREAKING' || op.kind === 'ADD_MODE'),
      [],
    );
  });
});

describe('component files and the contexts Figma gets', () => {
  const STATES = ['rest', 'hover', 'pressed', 'disabled', 'busy', 'invalid'];
  const design = (include?: string[]) =>
    designSourceOf(
      new Resolver({
        version: '2025-11-01',
        name: 'Demo',
        sets: { base: { sources: [{ button: { bg: { $type: 'color', $value: srgb(0.9, 0.9, 0.9) } } }] } },
        modifiers: {
          state: {
            default: 'rest',
            $extensions: {
              'com.toghen': { css: { selector: "[data-state='{context}']" }, ...(include ? figma(include)['com.toghen'] : {}) },
            },
            contexts: Object.fromEntries(
              STATES.map((state, k) => [state, [k === 0 ? {} : { button: { bg: { $value: srgb(k / 10, 0.5, 0.5) } } }]]),
            ),
          },
        },
        resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/state' }],
      } as ResolverDocument),
    );
  const read = (text: string, include: string[] | null = ['rest', 'hover', 'pressed']) =>
    readComponentFile(text, design(include ?? undefined));
  const errors = (file: ReturnType<typeof readComponentFile>) => file.problems.filter((problem) => problem.severity === 'error');
  const component = (header: string, properties: string, rest = '') => `component Button${header}
properties {
${properties}
}
guard busy { is (input)State busy }
FRAME Button layoutMode=HORIZONTAL {
    fills "{button.bg}"
${rest}}
`;
  // The guard above names `busy` in every file below; the ones that are not about it drop it.
  const plain = (header: string, properties: string, rest = '') =>
    component(header, properties, rest).replace('guard busy { is (input)State busy }\n', '');

  it('gives a (modifier) axis only the contexts Figma gets, in the document’s order, the default first', () => {
    const file = read(plain('', '    VARIANT State (modifier)"state"'), ['pressed', 'rest', 'hover']);

    assert.deepEqual(errors(file), []);
    assert.deepEqual(
      file.members.map((member) => member.name),
      ['State=rest', 'State=hover', 'State=pressed'],
    );
    assert.deepEqual(
      file.members.map((member) => member.tree.fields.modes),
      [{ state: 'rest' }, { state: 'hover' }, { state: 'pressed' }],
    );
  });

  it('brings no axis in with a tokens= group: a modifier is a world, and only a file takes an axis from it', () => {
    const file = read(plain(' tokens="{button}"', ''));

    assert.deepEqual(errors(file), []);
    assert.deepEqual(file.component?.properties, []);
    assert.equal(file.members.length, 1);
  });

  it('gives every context when the modifier has no key', () => {
    const file = read(plain('', '    VARIANT State (modifier)"state"'), null);

    assert.deepEqual(
      file.members.map((member) => member.name),
      STATES.map((state) => `State=${state}`),
    );
  });

  it('is an error, naming it with the line, to exclude a left-out context as an axis value', () => {
    const file = read(plain('', '    VARIANT State (modifier)"state"', '').replace('FRAME Button', 'exclude State=busy\nFRAME Button'));

    const [problem] = errors(file);
    assert.match(
      problem.message,
      /^exclude State: "busy" is not one of its values \(rest, hover, pressed\); "busy" is a context of the modifier "state" that Figma does not get, since its figma\.include leaves it out$/,
    );
    assert.equal(problem.line, 5);
    assert.deepEqual(file.members, []);
  });

  it('is an error, naming it with the line, to include one, or to read one in a guard', () => {
    const included = read(plain('', '    VARIANT State (modifier)"state"').replace('FRAME Button', 'include State=disabled\nFRAME Button'));
    assert.match(
      errors(included)[0].message,
      /^include State: "disabled" is not one of its values .*"disabled" is a context of the modifier "state" that Figma does not get/,
    );
    assert.equal(errors(included)[0].line, 5);

    const guarded = read(component('', '    VARIANT State (modifier)"state"'));
    assert.match(
      errors(guarded)[0].message,
      /^guard "busy": "busy" is not one of State's values .*"busy" is a context of the modifier "state" that Figma does not get/,
    );
    assert.equal(errors(guarded)[0].line, 5);
  });

  it('is an error, naming it with the line, to pin one with modes <modifier>=<context>', () => {
    const file = read(plain('', '    VARIANT Size small large', '    FRAME Inner {\n        modes state=busy\n    }\n'));

    assert.equal(errors(file).length, 1, 'once, not once for each member');
    assert.equal(
      errors(file)[0].message,
      'modes state=busy: "busy" is a context of the modifier "state" that Figma does not get, since its figma.include leaves it out',
    );
    assert.equal(errors(file)[0].line, 8);
    assert.equal(errors(file)[0].member, undefined);
  });

  it('lets modes pin a context Figma gets', () => {
    const file = read(plain('', '    VARIANT Size small large', '    FRAME Inner {\n        modes state=hover\n    }\n'));

    assert.deepEqual(errors(file), []);
  });

  it('says a modifier whose list is wrong cannot be read, at the axis, and only to a file that uses it', () => {
    const wrong = read(plain('', '    VARIANT State (modifier)"state"'), ['hover']);
    assert.match(errors(wrong)[0].message, /could not be read: Modifier "state": figma\.include must list its default context "rest"/);
    assert.equal(errors(wrong)[0].line, 3);

    const other = read(plain('', '    VARIANT Size small large'), ['hover']);
    assert.deepEqual(errors(other), [], 'a file that takes nothing from the tokens never reads the list');
  });
});
