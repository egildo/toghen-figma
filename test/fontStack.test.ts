/**
 * A font stack is a fallback in Figma too: a text style takes the first family
 * of its stack that Figma lists with the style asked for.
 *
 * Synthetic families throughout; the fixtures use the documented shapes, a
 * stack as an array and as a comma string, a typography member as a reference
 * to a `fontFamily` token, and structured dimensions.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, useFigmaMock, type FigmaMockHandle } from './support/figmaMock.js';
import { stampOf } from './support/stamps.js';
import { LOAD_DOCUMENT } from '../main/handlers/loadDocument.js';
import { oneFile } from './support/oneFile.js';
import { PLAN_VARIABLE_SYNC } from '../main/handlers/planVariableSync.js';
import { EXECUTE_VARIABLE_SYNC } from '../main/handlers/executeVariableSync.js';
import { PLAN_STYLE_SYNC } from '../main/handlers/planStyleSync.js';
import { EXECUTE_STYLE_SYNC } from '../main/handlers/executeStyleSync.js';
import { getState } from '../main/runtimeState.js';
import { chooseFamily } from '../main/utils/fontStack.js';
import type { Operation, OperationSummary } from '../shared/operations.js';

const px = (value: number) => ({ value, unit: 'px' });
const regular = (family: string) => ({ family, style: 'Regular' });
/** A font as a style holds it: Figma reads it back with variation settings nobody set. */
const familyAndStyle = (font: unknown) => ({ family: (font as FontName).family, style: (font as FontName).style });

const typography = (fontFamily: unknown, fontStyle = 'Regular') => ({
  $type: 'typography',
  $value: { fontFamily, fontSize: '{font.size.md}', fontWeight: 400, lineHeight: 1.5, fontStyle },
});

const documentWith = (stack: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    version: '2025-11-01',
    name: 'Demo',
    sets: {
      base: {
        sources: [
          {
            font: {
              family: { code: { $type: 'fontFamily', $value: stack } },
              size: { md: { $type: 'dimension', $value: px(14) } },
            },
            text: { code: typography('{font.family.code}'), ...extra },
            effects: {
              raised: { $type: 'shadow', $value: { color: '#00000066', offsetX: px(0), offsetY: px(2), blur: px(8) } },
            },
          },
        ],
      },
    },
    resolutionOrder: [{ $ref: '#/sets/base' }],
  });

const STACK = ['Alpha Mono', 'Beta Mono', 'Gamma Mono', 'monospace'];

async function sync(json: string): Promise<{ plan: Operation[] }> {
  await LOAD_DOCUMENT(oneFile(json));
  await PLAN_VARIABLE_SYNC({});
  await EXECUTE_VARIABLE_SYNC();
  await PLAN_STYLE_SYNC({});
  const plan = [...getState().lastPlan!];
  await EXECUTE_STYLE_SYNC();
  return { plan };
}

const messages = (mock: FigmaMockHandle, type: string) =>
  mock
    .calls('ui.postMessage')
    .map((call) => call.args[0] as { type: string; payload: unknown })
    .filter((m) => m.type === type);

const styleOp = (plan: Operation[], path: string) => {
  const op = plan.find((o) => (o.kind === 'CREATE_STYLE' || o.kind === 'UPDATE_STYLE') && o.tokenPath === path);
  assert.ok(op && (op.kind === 'CREATE_STYLE' || op.kind === 'UPDATE_STYLE'), `no style planned for ${path}`);
  return op;
};

const notes = (plan: Operation[], path: string) =>
  plan.flatMap((op) => (op.kind === 'WARNING' && op.path === path && /not available/.test(op.message) ? [op.message] : []));

describe('a font stack falls back in Figma as it does in CSS', () => {
  useFigmaMock();

  it('takes the first family when Figma lists it: no note, the family bound, as before', async () => {
    const mock = createFigmaMock()
      .withFonts([regular('Alpha Mono'), regular('Beta Mono')])
      .install();
    const { plan } = await sync(documentWith(STACK));

    const code = styleOp(plan, 'Demo.text.code');
    assert.equal(code.kind, 'CREATE_STYLE');
    assert.deepEqual(code.props, {
      fontFamily: 'Alpha Mono',
      fontStyle: 'Regular',
      fontSize: 14,
      lineHeight: { unit: 'PERCENT', value: 150 },
      letterSpacing: { unit: 'PIXELS', value: 0 },
      textCase: 'ORIGINAL',
      textDecoration: 'NONE',
    });
    assert.deepEqual(
      code.bindings?.map((b) => b.field),
      ['fontFamily', 'fontSize'],
    );
    assert.deepEqual(notes(plan, 'Demo.text.code'), []);
    assert.deepEqual(familyAndStyle(mock.styles('TEXT')[0].fontName), regular('Alpha Mono'));
  });

  it('takes a later family when the first is not listed, says so, and leaves the family unbound', async () => {
    const mock = createFigmaMock()
      .withFonts([regular('Beta Mono')])
      .install();
    const { plan } = await sync(documentWith(STACK));

    const code = styleOp(plan, 'Demo.text.code');
    assert.equal(code.props.fontFamily, 'Beta Mono');
    assert.deepEqual(notes(plan, 'Demo.text.code'), ['"Demo.text.code" uses "Beta Mono": "Alpha Mono" is not available in Figma.']);
    // The other members still bind.
    assert.deepEqual(
      code.bindings?.map((b) => b.field),
      ['fontSize'],
    );
    const style = mock.styles('TEXT')[0];
    assert.deepEqual(familyAndStyle(style.fontName), regular('Beta Mono'));
    assert.deepEqual(Object.keys(style.boundVariables as object), ['fontSize']);
  });

  it('names every family it passed over, a generic one included', async () => {
    createFigmaMock()
      .withFonts([regular('Gamma Mono')])
      .install();
    const { plan } = await sync(documentWith(['ui-monospace', 'Alpha Mono', 'Beta Mono', 'Gamma Mono']));

    assert.deepEqual(notes(plan, 'Demo.text.code'), [
      '"Demo.text.code" uses "Gamma Mono": "ui-monospace", "Alpha Mono" and "Beta Mono" are not available in Figma.',
    ]);
  });

  it('reads a stack written as a comma string', async () => {
    createFigmaMock()
      .withFonts([regular('Beta Mono')])
      .install();
    const { plan } = await sync(documentWith(`"Alpha Mono", 'Beta Mono', monospace`));

    assert.equal(styleOp(plan, 'Demo.text.code').props.fontFamily, 'Beta Mono');
    assert.equal(notes(plan, 'Demo.text.code').length, 1);
  });

  it('asks for the style the text style resolves to', async () => {
    // Alpha has no Bold; Beta has.
    createFigmaMock()
      .withFonts([regular('Alpha Mono'), { family: 'Beta Mono', style: 'Bold' }])
      .install();
    const { plan } = await sync(documentWith(STACK, { strong: typography('{font.family.code}', 'Bold') }));

    assert.equal(styleOp(plan, 'Demo.text.code').props.fontFamily, 'Alpha Mono');
    assert.equal(styleOp(plan, 'Demo.text.strong').props.fontFamily, 'Beta Mono');
    assert.deepEqual(notes(plan, 'Demo.text.strong'), ['"Demo.text.strong" uses "Beta Mono": "Alpha Mono" is not available in Figma.']);
  });

  it('never looks up a generic family, even when the list holds one of that name', async () => {
    assert.equal(
      chooseFamily(['monospace', 'UI-Monospace'], 'Regular', new Set(['monospace\u0000Regular', 'UI-Monospace\u0000Regular'])),
      undefined,
    );

    createFigmaMock()
      .withFonts([regular('monospace'), regular('Beta Mono')])
      .install();
    const { plan } = await sync(documentWith(['ui-monospace', 'monospace', 'Beta Mono']));
    assert.equal(styleOp(plan, 'Demo.text.code').props.fontFamily, 'Beta Mono');
  });

  it('reads the font list once for a plan', async () => {
    const mock = createFigmaMock()
      .withFonts([regular('Beta Mono')])
      .install();
    await sync(documentWith(STACK, { strong: typography('{font.family.code}') }));
    assert.equal(mock.calls('listAvailableFontsAsync').length, 1);
  });

  it('skips a style none of whose families loads, with its reason, and goes on', async () => {
    const mock = createFigmaMock()
      .withFonts([regular('Delta Sans')])
      .install();
    const { plan } = await sync(
      documentWith(['ui-monospace', 'Alpha Mono', 'Beta Mono', 'monospace'], { label: typography('Delta Sans') }),
    );

    const skip = plan.find((op) => op.kind === 'SKIP' && op.path === 'Demo.text.code');
    assert.deepEqual(skip, {
      kind: 'SKIP',
      reason: '"Demo.text.code" has no family Figma can load: "ui-monospace", "Alpha Mono", "Beta Mono" and "monospace" are not available.',
      path: 'Demo.text.code',
      cause: 'no-font',
      reported: true,
    });
    assert.ok(
      plan.some((op) => op.kind === 'CREATE_STYLE' && op.tokenPath === 'Demo.text.label'),
      'the next style is planned',
    );
    assert.deepEqual(
      mock.styles('TEXT').map((s) => s.name),
      ['text/label'],
    );
    assert.deepEqual(
      mock.styles('EFFECT').map((s) => s.name),
      ['effects/raised'],
      'and the styles of other kinds',
    );
    assert.equal(messages(mock, 'ERROR').length, 0, 'nothing stopped');
    const done = messages(mock, 'OPERATION_COMPLETE').pop()!.payload as OperationSummary;
    assert.equal(done.failed, 0);
  });

  it('skips the one family a single-name stack cannot load', async () => {
    createFigmaMock()
      .withFonts([regular('Delta Sans')])
      .install();
    const { plan } = await sync(documentWith('Alpha Mono', { label: typography('Delta Sans') }));
    assert.match(
      (plan.find((op) => op.kind === 'SKIP' && op.path === 'Demo.text.code' && op.reported) as { reason: string }).reason,
      /^"Demo.text.code" has no family Figma can load: "Alpha Mono" is not available\.$/,
    );
  });

  it('skips, and does not stop, a font that was listed and then fails to load', async () => {
    const mock = createFigmaMock()
      .withFonts([regular('Delta Sans')])
      .withUnloadableFont(regular('Alpha Mono'))
      .install();
    const { plan } = await sync(documentWith(STACK, { label: typography('Delta Sans') }));

    assert.equal(styleOp(plan, 'Demo.text.code').props.fontFamily, 'Alpha Mono', 'planned: the list holds it');
    assert.deepEqual(
      mock.styles('TEXT').map((s) => s.name),
      ['text/label'],
    );
    assert.deepEqual(
      mock.styles('EFFECT').map((s) => s.name),
      ['effects/raised'],
    );
    assert.equal(messages(mock, 'ERROR').length, 0);
    const done = messages(mock, 'OPERATION_COMPLETE').pop()!.payload as OperationSummary;
    assert.equal(done.failed, 0);
    const skipped = done.results.find(
      (r) => r.status === 'skipped' && r.operation.kind === 'SKIP' && r.operation.path === 'Demo.text.code',
    );
    assert.match(
      skipped?.reason ?? '',
      /^"Demo.text.code" has no family Figma can load: "Alpha Mono" is listed but could not be loaded\.$/,
    );
    // Nothing is stamped for the skipped style, so the next plan tries it again.
    assert.ok(!mock.styles('TEXT').some((style) => stampOf(style)?.is.token === 'Demo.text.code'));
  });

  it('gives different families on two machines, and each leaves the style the other wrote', async () => {
    const codeSkip = () =>
      getState().lastPlan!.find((op): op is Extract<Operation, { kind: 'SKIP' }> => op.kind === 'SKIP' && op.path === 'Demo.text.code');
    const onlyBeta = () => {
      (figma as { listAvailableFontsAsync: () => Promise<Font[]> }).listAvailableFontsAsync = async () => [
        { fontName: regular('Beta Mono') } as Font,
      ];
    };

    createFigmaMock()
      .withFonts([regular('Alpha Mono'), regular('Beta Mono')])
      .install();
    const { plan } = await sync(documentWith(STACK));
    assert.equal(styleOp(plan, 'Demo.text.code').props.fontFamily, 'Alpha Mono');
    // Another machine: the same file and tokens, a list that lacks the first family.
    onlyBeta();
    await PLAN_STYLE_SYNC({});
    assert.equal(codeSkip()?.reason, 'unchanged', 'the first machine’s style is left');

    // The other way round: the machine that falls back writes first, and the next plan there is clean too.
    createFigmaMock()
      .withFonts([regular('Alpha Mono'), regular('Beta Mono')])
      .install();
    onlyBeta();
    const fallen = await sync(documentWith(STACK));
    assert.equal(styleOp(fallen.plan, 'Demo.text.code').props.fontFamily, 'Beta Mono');
    await PLAN_STYLE_SYNC({});
    assert.equal(codeSkip()?.reason, 'unchanged');
  });
});
