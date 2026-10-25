/**
 * A large document: the sum everywhere, and a skip instead of a stop.
 *
 * The first large real document had seven modifiers of 6, 14, 3, 3, 2, 2 and 7
 * contexts, which make 21,168 combinations. Loading it built them all and did not
 * finish; the plan then stopped at the first value Figma cannot hold. Both are
 * proved here on synthetic tokens, in the W3C structured shapes.
 */

import { beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver, type ResolverDocument } from '@toghen/lib';
import { LOAD_DOCUMENT } from '../main/handlers/loadDocument.js';
import { oneFile } from './support/oneFile.js';
import { EXPORT_DOCUMENT } from '../main/handlers/exportDocument.js';
import { GET_TOKEN_GRAPH } from '../main/handlers/tokenGraph.js';
import { CHECK_COMPONENTS, RUN_COMPONENT } from '../main/handlers/runComponent.js';
import { VariableSyncEngine } from '../main/engines/variableSyncEngine.js';
import { StyleSyncEngine } from '../main/engines/styleSyncEngine.js';
import { INSPECT_CORRESPONDENCE } from '../main/handlers/inspectCorrespondence.js';
import { getState, resetState, setState } from '../main/runtimeState.js';
import { defaultTokenTypeMap } from '../shared/tokenTypeMap.js';
import type { Operation } from '../shared/operations.js';
import type { InspectionPayload, Response } from '../shared/protocol.js';
import { createFigmaMock, useFigmaMock } from './support/figmaMock.js';

const px = (value: number) => ({ value, unit: 'px' });
const srgb = (...components: number[]) => ({ colorSpace: 'srgb', components });

/** Seven modifiers of 6, 14, 3, 3, 2, 2 and 7 contexts: 21,168 combinations, 31 modes in the sum. */
const COUNTS = [6, 14, 3, 3, 2, 2, 7];
const PRODUCT = COUNTS.reduce((a, b) => a * b, 1);
const SUM_MODES = 1 + COUNTS.reduce((total, count) => total + count - 1, 0);

/** Modifier `m<i>` has contexts `c0 … c<n-1>`, default `c0`, and sets `m<i>.size` to `c<k>`'s `k + 1` px. */
function largeDocument(withDefaults = true): ResolverDocument {
  const modifiers: Record<string, unknown> = {};
  const base: Record<string, unknown> = {};
  COUNTS.forEach((count, i) => {
    base[`m${i}`] = { size: { $type: 'dimension', $value: px(0) } };
    const contexts: Record<string, unknown> = {};
    for (let k = 0; k < count; k += 1) contexts[`c${k}`] = [{ [`m${i}`]: { size: { $value: px(k + 1) } } }];
    modifiers[`m${i}`] = { ...(withDefaults ? { default: 'c0' } : {}), contexts };
  });
  return {
    version: '2025-11-01',
    name: 'Demo',
    sets: { base: { sources: [{ ...base, accent: { $type: 'color', $value: srgb(0, 0.33, 0.8) } }] } },
    modifiers,
    resolutionOrder: [{ $ref: '#/sets/base' }, ...COUNTS.map((_, i) => ({ $ref: `#/modifiers/m${i}` }))],
  } as ResolverDocument;
}

const posted = (mockFigma: ReturnType<ReturnType<typeof createFigmaMock>['install']>) =>
  mockFigma.calls('ui.postMessage').map((call) => call.args[0] as Response);

/** Fails a test that builds, or lists, the product of the contexts. */
function watchProduct() {
  return [mock.method(Resolver.prototype, 'getPermutations'), mock.method(Resolver.prototype, 'resolveAllToDesignSystem')];
}

describe('a document whose contexts multiply into the thousands', () => {
  useFigmaMock();
  beforeEach(() => {
    resetState();
    mock.restoreAll();
  });

  it('is more combinations than anything could build', () => {
    assert.equal(PRODUCT, 21168);
    assert.equal(SUM_MODES, 31);
  });

  it('loads quickly, builds no product, and states the sum’s modes', async () => {
    const figmaMock = createFigmaMock().install();
    const watched = watchProduct();

    const started = Date.now();
    await LOAD_DOCUMENT(oneFile(JSON.stringify(largeDocument())));
    const took = Date.now() - started;

    for (const spy of watched) assert.equal(spy.mock.callCount(), 0, 'the product was built');
    assert.ok(took < 30_000, `loading took ${took} ms`);

    const loaded = posted(figmaMock).find((message) => message.type === 'DOCUMENT_LOADED');
    assert.ok(loaded && loaded.type === 'DOCUMENT_LOADED');
    assert.equal(loaded.payload.modes.length, SUM_MODES);
    assert.equal(loaded.payload.defaultMode, loaded.payload.modes[0]);
    assert.equal(loaded.payload.tokenCount, 8);
    assert.equal(loaded.payload.modifierDefaults.m1, 'c0');
    assert.equal(Object.keys(loaded.payload.modifiers).length, COUNTS.length);
    assert.ok(!('permutations' in loaded.payload), 'the product’s mode list is gone from the payload');
    assert.equal(loaded.payload.collections?.length, COUNTS.length + 1);

    // The Tokens pane, the plan and the style plan read the same sum.
    GET_TOKEN_GRAPH();
    const graph = posted(figmaMock).find((message) => message.type === 'TOKEN_GRAPH');
    assert.ok(graph && graph.type === 'TOKEN_GRAPH');
    assert.equal(graph.payload.modes.length, SUM_MODES);

    // `m1` has 14 contexts, more modes than Figma holds in a collection: the plan says so, before it writes anything.
    const stopped = await new VariableSyncEngine().buildPlan(getState().resolver!, 'Demo', defaultTokenTypeMap);
    assert.deepEqual(stopped.operations, [
      {
        kind: 'WARNING',
        message: '"m1" has 14 contexts for Figma and Figma allows 10 modes per collection; keep at most 10 of them in figma.include.',
        stops: true,
      },
    ]);

    // Listing the ten Figma gets, the plan covers the sum of the rest.
    const trimmed = largeDocument();
    (trimmed.modifiers as unknown as Record<string, Record<string, unknown>>).m1.$extensions = {
      'com.toghen': { figma: { include: Array.from({ length: 10 }, (_, k) => `c${k}`) } },
    };
    const plan = await new VariableSyncEngine().buildPlan(new Resolver(trimmed), 'Demo', defaultTokenTypeMap);
    assert.ok(plan.operations.filter((op) => op.kind === 'SET_VARIABLE_VALUE').length >= SUM_MODES - 1 - 4);
    await new StyleSyncEngine().buildPlan(getState().resolver!, defaultTokenTypeMap);

    for (const spy of watched) assert.equal(spy.mock.callCount(), 0, 'a plan built the product');
  });

  it('exports the one combination asked for, each modifier at its default unless chosen', async () => {
    const figmaMock = createFigmaMock().install();
    await LOAD_DOCUMENT(oneFile(JSON.stringify(largeDocument())));
    const watched = watchProduct();
    const resolveOne = mock.method(Resolver.prototype, 'resolveToDesignSystem');

    await EXPORT_DOCUMENT({ includeExtensions: false });
    const byDefault = posted(figmaMock).at(-1)!;
    assert.ok(byDefault.type === 'DOCUMENT_EXPORTED');
    assert.equal(JSON.parse(byDefault.payload.json).m1.size.$value.value, 1);
    assert.equal(byDefault.payload.filename, 'Demo.c0.c0.c0.c0.c0.c0.c0.json');

    await EXPORT_DOCUMENT({ includeExtensions: false, contexts: { m1: 'c9', m6: 'c4' } });
    const chosen = posted(figmaMock).at(-1)!;
    assert.ok(chosen.type === 'DOCUMENT_EXPORTED');
    const tokens = JSON.parse(chosen.payload.json);
    assert.equal(tokens.m1.size.$value.value, 10);
    assert.equal(tokens.m6.size.$value.value, 5);
    assert.equal(tokens.m0.size.$value.value, 1, 'a modifier not named stays at its default');
    assert.equal(chosen.payload.filename, 'Demo.c0.c9.c0.c0.c0.c0.c4.json');

    assert.equal(resolveOne.mock.callCount(), 2, 'one combination each, nothing else');
    for (const spy of watched) assert.equal(spy.mock.callCount(), 0, 'the product was built');
  });

  it('refuses a context or a modifier the document does not have', async () => {
    const figmaMock = createFigmaMock().install();
    await LOAD_DOCUMENT(oneFile(JSON.stringify(largeDocument())));

    await EXPORT_DOCUMENT({ includeExtensions: false, contexts: { m1: 'sepia' } });
    const badContext = posted(figmaMock).at(-1)!;
    assert.ok(badContext.type === 'ERROR');
    assert.match(badContext.payload.message, /"sepia" is not one of the contexts of "m1"/);

    await EXPORT_DOCUMENT({ includeExtensions: false, contexts: { nothing: 'c0' } });
    const badModifier = posted(figmaMock).at(-1)!;
    assert.ok(badModifier.type === 'ERROR');
    assert.match(badModifier.payload.message, /"nothing" is not one of this document's modifiers/);
  });

  it('refuses to load when modifiers declare no default, naming each, and builds nothing', async () => {
    const figmaMock = createFigmaMock().install();
    const watched = watchProduct();

    await LOAD_DOCUMENT(oneFile(JSON.stringify(largeDocument(false))));

    const error = posted(figmaMock).find((message) => message.type === 'ERROR');
    assert.ok(error && error.type === 'ERROR');
    for (let i = 0; i < COUNTS.length; i += 1)
      assert.match(error.payload.message, new RegExp(`Modifier "m${i}" declares no default context`));
    assert.match(error.payload.message, /sum of the contexts needs a default/);
    assert.equal(getState().resolver, null);
    for (const spy of watched) assert.equal(spy.mock.callCount(), 0, 'the product was the fallback');
  });

  it('reads a component file against the sum: its names, and the contexts its axis takes', async () => {
    const figmaMock = createFigmaMock()
      .withCollection('m1', ['c0', 'c1'])
      .withCollection('m2', ['c0', 'c1', 'c2'])
      .withCollection('Demo', ['default'])
      .withVariable('m1', 'm1/size', 'FLOAT', { c0: 1, c1: 2 })
      .withVariable('Demo', 'accent', 'COLOR', { default: { r: 0, g: 0.33, b: 0.8, a: 1 } })
      .install();
    await LOAD_DOCUMENT(oneFile(JSON.stringify(largeDocument())));
    const watched = watchProduct();
    const text = `component Chip
properties {
    VARIANT Size (modifier)"m2"
}
FRAME Chip layoutMode=HORIZONTAL cornerRadius="{m1.size}" {
    fills "{accent}"
}
`;

    await CHECK_COMPONENTS({ files: [{ fileName: 'ui/chip.component.kdl', text }], names: true });
    const checked = posted(figmaMock).at(-1)!;
    assert.equal(checked.type, 'COMPONENTS_CHECKED', JSON.stringify(checked));

    const missing = text.replace('{m1.size}', '{m1.nope}');
    await CHECK_COMPONENTS({ files: [{ fileName: 'ui/chip.component.kdl', text: missing }], names: true });
    const refused = posted(figmaMock).at(-1)!;
    assert.ok(refused.type === 'ERROR');
    assert.match(refused.payload.problems![0], /token \{m1\.nope\} is not in the design system "Demo"/);

    await RUN_COMPONENT({ text, fileName: 'ui/chip.component.kdl', options: { dryRun: true } });
    const ran = posted(figmaMock).at(-1)!;
    assert.ok(ran.type === 'COMPONENT_RUN', JSON.stringify(ran));
    assert.deepEqual(
      ran.payload.report.steps.map((step) => [step.kind, step.members]),
      [['CREATE_SET', 3]],
    );

    for (const spy of watched) assert.equal(spy.mock.callCount(), 0, 'the product was built');
  });
});

/**
 * Untyped tokens are stored as written, and a typed token that refers to one gets
 * its value unchecked: lib refuses a typed `8px 13px` on load, so a reference is
 * the way a value Figma cannot hold reaches a plan.
 */
function awkwardDocument(): ResolverDocument {
  return {
    version: '2025-11-01',
    name: 'Demo',
    sets: {
      base: {
        sources: [
          {
            raw: {
              pad: { $value: '8px 13px' },
              percent: { $value: '55%' },
              tracking: { $value: '0.055em' },
              keyword: { $value: 'inherit' },
              share: { $value: '50%' },
              nope: { $value: 'not-a-colour' },
              fine: { $value: '#0055cc' },
            },
            sem: {
              pad: { $type: 'dimension', $value: '{raw.pad}' },
              percent: { $type: 'dimension', $value: '{raw.percent}' },
              tracking: { $type: 'dimension', $value: '{raw.tracking}' },
              keyword: { $type: 'color', $value: '{raw.keyword}' },
              share: { $type: 'color', $value: '{raw.share}' },
              nope: { $type: 'color', $value: '{raw.nope}' },
              fine: { $type: 'dimension', $value: px(16) },
              ink: { $type: 'color', $value: srgb(0, 0.33, 0.8) },
            },
            effects: {
              broken: { $type: 'shadow', $value: { color: '{raw.nope}', offsetX: px(0), offsetY: px(2), blur: px(8), spread: px(0) } },
              fine: { $type: 'shadow', $value: { color: srgb(0, 0, 0), offsetX: px(0), offsetY: px(2), blur: px(8), spread: px(0) } },
            },
            text: {
              broken: {
                $type: 'typography',
                $value: { fontFamily: ['Inter'], fontSize: '{raw.pad}', fontWeight: 400, lineHeight: 1.5 },
              },
              fine: { $type: 'typography', $value: { fontFamily: ['Inter'], fontSize: px(14), fontWeight: 400, lineHeight: 1.5 } },
            },
          },
        ],
      },
    },
    modifiers: {
      theme: {
        default: 'light',
        contexts: {
          light: [{}],
          dark: [{ sem: { ink: { $value: '{raw.nope}' } } }],
        },
      },
    },
    resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
  } as ResolverDocument;
}

type Skip = Extract<Operation, { kind: 'SKIP' }>;
const skipsOf = (operations: Operation[], path: string): Skip[] =>
  operations.filter((op): op is Skip => op.kind === 'SKIP' && op.path === path);

describe('a value Figma cannot hold is a skip, not a stop', () => {
  beforeEach(() => resetState());

  it('skips each variable it cannot convert, one row per cell, and plans the rest', async () => {
    createFigmaMock().install();
    const resolver = new Resolver(awkwardDocument());

    const { operations } = await new VariableSyncEngine().buildPlan(resolver, 'Demo', defaultTokenTypeMap);

    // A dimension that is two, a percentage, an em.
    for (const [path, shown] of [
      ['Demo.sem.pad', '8px 13px'],
      ['Demo.sem.percent', '55%'],
      ['Demo.sem.tracking', '0.055em'],
    ] as const) {
      const rows = skipsOf(operations, path);
      assert.equal(rows.length, 1, `${path}: one row for one thing that happened`);
      assert.equal(rows[0].cause, 'cannot-write');
      assert.ok(rows[0].reason.startsWith(`"${path}" cannot be written in Demo / default: `), rows[0].reason);
      assert.ok(rows[0].reason.includes(shown), `${path}: names the value, got ${rows[0].reason}`);
    }

    // A colour that is not a hex string: a CSS-wide keyword, a percentage, nonsense (a named colour now converts).
    for (const path of ['Demo.sem.keyword', 'Demo.sem.share', 'Demo.sem.nope']) {
      const rows = skipsOf(operations, path);
      assert.equal(rows.length, 1, `${path}: ${JSON.stringify(rows)}`);
      assert.ok(rows[0].reason.startsWith(`"${path}" cannot be written in Demo / default: `), rows[0].reason);
    }

    // The cell is named by its context: `ink` is fine in light and cannot be written in dark.
    const ink = skipsOf(operations, 'Demo.sem.ink');
    assert.equal(ink.length, 1);
    assert.match(ink[0].reason, /^"Demo\.sem\.ink" cannot be written in theme \/ dark: /);

    // A skipped token is not half written, and the rest of the plan stands.
    for (const name of ['pad', 'percent', 'tracking', 'keyword', 'share', 'nope', 'ink']) {
      assert.ok(!operations.some((op) => op.kind === 'SET_VARIABLE_VALUE' && op.tokenPath === `Demo.sem.${name}`), `${name} is written`);
    }
    assert.ok(
      operations.some((op) => op.kind === 'SET_VARIABLE_VALUE' && op.tokenPath === 'Demo.sem.fine'),
      'the fine token is planned',
    );
    assert.ok(operations.some((op) => op.kind === 'CREATE_COLLECTION' && op.name === 'theme'));
    assert.ok(!operations.some((op) => op.kind === 'WARNING' && op.stops), 'the plan did not stop');

    // R14: the skip says it all; no warning beside it.
    assert.ok(!operations.some((op) => op.kind === 'WARNING' && /Demo\.sem\.pad/.test(`${op.path}${op.message}`)));
  });

  it('counts the skips in the summary', async () => {
    createFigmaMock().install();
    const engine = new VariableSyncEngine();
    const { operations } = await engine.buildPlan(new Resolver(awkwardDocument()), 'Demo', defaultTokenTypeMap);
    assert.ok(engine.summarizePlan(operations).skips >= 7);
  });

  it('gives every skip of both plans a cause, counts them by cause, and lists only the tokens each plan is for', async () => {
    createFigmaMock().install();
    const doc = awkwardDocument();
    // A type neither a variable nor a style holds, in its structured shape.
    Object.assign(doc.sets!.base.sources[0], { motion: { quick: { $type: 'duration', $value: { value: 200, unit: 'ms' } } } });
    const resolver = new Resolver(doc);
    const variables = new VariableSyncEngine();
    const styles = new StyleSyncEngine();
    const plans = {
      variables: (await variables.buildPlan(resolver, 'Demo', defaultTokenTypeMap)).operations,
      styles: (await styles.buildPlan(resolver, defaultTokenTypeMap)).operations,
    };

    for (const [plan, operations] of Object.entries(plans)) {
      for (const op of operations) if (op.kind === 'SKIP') assert.ok(op.cause, `${plan}: the skip of ${op.path} has no cause`);
    }
    // One count per cause, and `skips` is their sum: nothing is counted twice.
    const counted = variables.summarizePlan(plans.variables);
    // The seven untyped `raw` tokens and the duration have no type a variable holds.
    assert.deepEqual(counted.skipsByCause, { 'cannot-write': 7, 'unsupported-type': 8 });
    assert.equal(counted.skips, 15);
    const built = styles.summarizePlan(plans.styles);
    assert.deepEqual(built.skipsByCause, { 'cannot-build': 2, 'unsupported-type': 8 });
    assert.equal(built.skips, 10);

    // Ruling 11b: a style's token has no row in the variable plan, nor a variable's in the style plan.
    for (const path of ['Demo.effects.fine', 'Demo.text.fine']) assert.deepEqual(skipsOf(plans.variables, path), [], path);
    for (const path of ['Demo.sem.fine', 'Demo.sem.ink']) assert.deepEqual(skipsOf(plans.styles, path), [], path);
  });

  it('skips each style it cannot build, with its reason, and plans the rest', async () => {
    createFigmaMock().install();
    const resolver = new Resolver(awkwardDocument());

    const { operations } = await new StyleSyncEngine().buildPlan(resolver, defaultTokenTypeMap);

    // A shadow whose colour is not a hex string; a typography whose size is two dimensions.
    for (const path of ['Demo.effects.broken', 'Demo.text.broken']) {
      const rows = skipsOf(operations, path);
      assert.equal(rows.length, 1, `${path}: ${JSON.stringify(rows)}`);
      assert.equal(rows[0].cause, 'cannot-build');
      assert.ok(rows[0].reason.startsWith(`"${path}" cannot be built in light: `), rows[0].reason);
      assert.ok(!operations.some((op) => op.kind === 'WARNING' && op.path === path), `${path}: a skip, not a warning`);
    }
    assert.ok(operations.some((op) => op.kind === 'CREATE_STYLE' && op.tokenPath === 'Demo.effects.fine'));
    assert.ok(operations.some((op) => op.kind === 'CREATE_STYLE' && op.tokenPath === 'Demo.text.fine'));
    assert.ok(!operations.some((op) => op.kind === 'CREATE_STYLE' && op.tokenPath === 'Demo.effects.broken'));
  });

  it('reports it as blocked, with the reason, where the Inspector looks', async () => {
    const figmaMock = createFigmaMock().install();
    setState({ resolver: new Resolver(awkwardDocument()), conversionMap: defaultTokenTypeMap });

    await INSPECT_CORRESPONDENCE();

    const report = posted(figmaMock)
      .filter((message) => message.type === 'CORRESPONDENCE')
      .at(-1);
    assert.ok(report && report.type === 'CORRESPONDENCE');
    const payload = report.payload as InspectionPayload;
    const pad = payload.tokens.find((token) => token.path === 'Demo.sem.pad');
    assert.equal(pad?.state, 'blocked');
    assert.match(pad?.note ?? '', /Demo \/ default: .*8px 13px/);
    assert.equal(payload.tokens.find((token) => token.path === 'Demo.sem.fine')?.state, 'absent', 'the rest is still read');
  });
});
