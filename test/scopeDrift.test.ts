/**
 * Scopes follow the drift rule, and the mock refuses what Figma refuses.
 *
 * Toghen stamps each variable with a receipt of the scopes Figma reported after it wrote them. A list Figma holds that
 * hashes as the receipt was not touched, so the plan's is written over it; one that differs was changed by a designer,
 * and is kept and said until `--overwrite-drift`. A variable with no receipt for its scopes is rewritten only if it
 * holds what older Toghen wrote.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver, type ResolverDocument } from '@toghen/lib';
import { VariableSyncEngine, type VariablePlan } from '../main/engines/variableSyncEngine.js';
import { LOAD_DOCUMENT } from '../main/handlers/loadDocument.js';
import { oneFile } from './support/oneFile.js';
import { PLAN_VARIABLE_SYNC } from '../main/handlers/planVariableSync.js';
import { EXECUTE_VARIABLE_SYNC } from '../main/handlers/executeVariableSync.js';
import { getState, resetState } from '../main/runtimeState.js';
import { hashOf } from '../main/components/stamp.js';
import { reportedScopes } from '../main/utils/tokenStamps.js';
import { defaultTokenTypeMap } from '../shared/tokenTypeMap.js';
import type { Operation } from '../shared/operations.js';
import { createFigmaMock, useFigmaMock } from './support/figmaMock.js';
import { stampAs, stampOf } from './support/stamps.js';

const px = (value: number) => ({ value, unit: 'px' });

const DOCUMENT = {
  version: '2025-11-01',
  name: 'Demo',
  sets: { base: { sources: [{ button: { gap: { $type: 'dimension', $value: px(4) }, opacity: { $type: 'number', $value: 0.5 } } }] } },
  resolutionOrder: [{ $ref: '#/sets/base' }],
} as unknown as ResolverDocument;

const PATH = 'Demo.button.gap';
const planOf = (options = {}): Promise<VariablePlan> =>
  new VariableSyncEngine().buildPlan(new Resolver(DOCUMENT), 'Demo', defaultTokenTypeMap, options);

const forPath = (p: VariablePlan, kind: Operation['kind']) =>
  p.operations.filter((op) => op.kind === kind && 'path' in op && op.path === PATH);
const setsScopes = (p: VariablePlan) =>
  p.operations.filter(
    (op): op is Extract<Operation, { kind: 'SET_VARIABLE_SCOPES' }> => op.kind === 'SET_VARIABLE_SCOPES' && op.path === PATH,
  );

/**
 * A file where `button/gap` and `button/opacity` hold the document's values and code syntax, with the scopes given
 * to the gap, and stamps for the values (and for the scopes, when `recorded` is).
 */
async function fileWith(held: VariableScope[], recorded?: VariableScope[]) {
  const mock = createFigmaMock()
    .withCollection('Demo', ['default'])
    .withVariable('Demo', 'button/gap', 'FLOAT', { default: 4 }, held)
    .withVariable('Demo', 'button/opacity', 'FLOAT', { default: 50 }, ['OPACITY'])
    .install();
  for (const variable of mock.variables()) variable.setVariableCodeSyntax('WEB', `var(--${variable.name.replace(/\//g, '-')})`);
  const gap = mock.variable('Demo', 'button/gap')!;
  const opacity = mock.variable('Demo', 'button/opacity')!;
  const mode = mock.collection('Demo')!.modes[0].modeId;
  stampAs(gap, PATH, { [mode]: 4, ...(recorded ? { scopes: reportedScopes(recorded) } : {}) });
  stampAs(opacity, 'Demo.button.opacity', { [mode]: 50, scopes: ['OPACITY'] });
  return { mock, gap };
}

describe('scopes of an existing variable — the drift rule', () => {
  useFigmaMock();

  it('leaves a variable that already holds the plan’s scopes', async () => {
    await fileWith(['GAP'], ['GAP']);
    const p = await planOf();
    assert.equal(setsScopes(p).length, 0);
    assert.equal(forPath(p, 'SKIP')[0].kind === 'SKIP' && (forPath(p, 'SKIP')[0] as { reason: string }).reason, 'unchanged');
  });

  it('compares as sets, whatever order Figma stores them in', async () => {
    // Plan for a dimension named for nothing: four scopes, which Figma reads back in an order of its own.
    const doc = {
      ...DOCUMENT,
      sets: { base: { sources: [{ button: { thing: { $type: 'dimension', $value: px(4) } } }] } },
    } as unknown as ResolverDocument;
    const mock = createFigmaMock()
      .withCollection('Demo', ['default'])
      .withVariable('Demo', 'button/thing', 'FLOAT', { default: 4 }, ['STROKE_FLOAT', 'WIDTH_HEIGHT', 'GAP', 'CORNER_RADIUS'])
      .install();
    const variable = mock.variable('Demo', 'button/thing')!;
    variable.setVariableCodeSyntax('WEB', 'var(--button-thing)');
    stampAs(variable, 'Demo.button.thing', {
      ...variable.valuesByMode,
      scopes: reportedScopes(['GAP', 'CORNER_RADIUS', 'WIDTH_HEIGHT', 'STROKE_FLOAT']),
    });
    const p = await new VariableSyncEngine().buildPlan(new Resolver(doc), 'Demo', defaultTokenTypeMap);
    assert.equal(p.operations.filter((op) => op.kind === 'SET_VARIABLE_SCOPES').length, 0);
  });

  it('writes the plan’s scopes over scopes nobody changed since Toghen wrote them', async () => {
    const { gap } = await fileWith(['WIDTH_HEIGHT'], ['WIDTH_HEIGHT']);
    const p = await planOf();

    const [write] = setsScopes(p);
    assert.ok(write);
    assert.deepEqual(write.scopes, ['GAP']);
    assert.equal(write.variableId, gap.id);
    assert.equal(p.operations.filter((op) => op.kind === 'BREAKING').length, 0, 'a scope change is not breaking');
    assert.equal(new VariableSyncEngine().summarizePlan(p.operations).scopes, 1);
    assert.equal(new VariableSyncEngine().summarizePlan(p.operations).drifted, 0);
  });

  it('keeps scopes a designer changed, and says so on the row', async () => {
    await fileWith(['STROKE_FLOAT'], ['WIDTH_HEIGHT']);
    const p = await planOf();

    assert.equal(setsScopes(p).length, 0);
    const [skip] = forPath(p, 'SKIP') as Array<{ reason: string; message?: string }>;
    assert.equal(skip.reason, 'drifted');
    assert.match(
      skip.message ?? '',
      /The scopes were changed in Figma since the last sync \(Figma holds STROKE_FLOAT; the document asks for GAP\)/,
    );
    assert.match(skip.message ?? '', /--overwrite-drift/);
    assert.equal(new VariableSyncEngine().summarizePlan(p.operations).drifted, 1);
  });

  it('writes them over a designer’s with --overwrite-drift, and says nothing of it', async () => {
    await fileWith(['STROKE_FLOAT'], ['WIDTH_HEIGHT']);
    const p = await planOf({ overwriteDrift: true });

    assert.deepEqual(
      setsScopes(p).map((op) => op.scopes),
      [['GAP']],
    );
    assert.equal(new VariableSyncEngine().summarizePlan(p.operations).drifted, 0);
    assert.equal(forPath(p, 'SKIP').length, 1, 'the path is skipped only as unchanged: its values did not move');
    assert.equal((forPath(p, 'SKIP')[0] as { reason: string }).reason, 'unchanged');
  });

  it('rewrites a variable with no record that still holds what older Toghen wrote', async () => {
    await fileWith(['ALL_SCOPES']);
    const p = await planOf();
    assert.deepEqual(
      setsScopes(p).map((op) => op.scopes),
      [['GAP']],
    );
  });

  it('keeps a variable with no record that holds scopes somebody set on purpose', async () => {
    await fileWith(['STROKE_FLOAT']);
    const p = await planOf();

    assert.equal(setsScopes(p).length, 0);
    assert.equal((forPath(p, 'SKIP')[0] as { reason: string }).reason, 'drifted');
    const overwritten = await planOf({ overwriteDrift: true });
    assert.equal(setsScopes(overwritten).length, 1);
  });

  it('treats LETTER_SPACING as what older Toghen wrote for a letter spacing', async () => {
    const doc = {
      ...DOCUMENT,
      sets: {
        base: {
          sources: [
            {
              track: {
                $type: 'letterSpacing',
                tight: { $value: px(-1), $extensions: { 'com.toghen': { figma: { scopes: ['FONT_SIZE'] } } } },
              },
            },
          ],
        },
      },
    } as unknown as ResolverDocument;
    const mock = createFigmaMock()
      .withCollection('Demo', ['default'])
      .withVariable('Demo', 'track/tight', 'FLOAT', { default: -1 }, ['LETTER_SPACING'])
      .install();
    const variable = mock.variable('Demo', 'track/tight')!;
    variable.setVariableCodeSyntax('WEB', 'var(--track-tight)');
    stampAs(variable, 'Demo.track.tight', { ...variable.valuesByMode });
    // Held LETTER_SPACING is what older Toghen wrote to a letter spacing, so a new purpose is written over it.
    const p = await new VariableSyncEngine().buildPlan(new Resolver(doc), 'Demo', defaultTokenTypeMap);
    assert.deepEqual(
      p.operations.filter((op) => op.kind === 'SET_VARIABLE_SCOPES').map((op) => (op as { scopes: string[] }).scopes),
      [['FONT_SIZE']],
    );
  });

  it('gives a new variable its scopes in the create, and records them as written', async () => {
    const mock = createFigmaMock().install();
    resetState();
    await LOAD_DOCUMENT(oneFile(JSON.stringify(DOCUMENT)));
    await PLAN_VARIABLE_SYNC({});
    await EXECUTE_VARIABLE_SYNC();

    assert.deepEqual(mock.variable('Demo', 'button/gap')!.scopes, ['GAP']);
    assert.equal(stampOf(mock.variable('Demo', 'button/gap')!)?.receipt.scopes, hashOf(['GAP']));
    assert.equal(stampOf(mock.variable('Demo', 'button/opacity')!)?.receipt.scopes, hashOf(['OPACITY']));
    assert.equal(mock.valueFor('Demo', 'button/opacity', 'default'), 50);
  });
});

describe('scopes of an existing variable — through the handlers, run after run', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  const sync = async (options: { overwriteDrift?: boolean } = {}) => {
    await PLAN_VARIABLE_SYNC({ ...options });
    const plan = getState().lastPlan as Operation[];
    await EXECUTE_VARIABLE_SYNC();
    return plan;
  };

  it('rewrites a file made before scopes, once, and then leaves it alone', async () => {
    const mock = createFigmaMock()
      .withCollection('Demo', ['default'])
      .withVariable('Demo', 'button/gap', 'FLOAT', { default: 4 })
      .withVariable('Demo', 'button/opacity', 'FLOAT', { default: 0.5 })
      .install();
    await LOAD_DOCUMENT(oneFile(JSON.stringify(DOCUMENT)));

    const first = await sync();
    assert.equal(first.filter((op) => op.kind === 'SET_VARIABLE_SCOPES').length, 2);
    assert.deepEqual(mock.variable('Demo', 'button/gap')!.scopes, ['GAP']);
    assert.deepEqual(mock.variable('Demo', 'button/opacity')!.scopes, ['OPACITY']);
    assert.equal(mock.valueFor('Demo', 'button/opacity', 'default'), 50, 'an opacity written as 0 to 1 is rewritten as a percentage');

    const second = await sync();
    assert.deepEqual(
      second.filter((op) => op.kind !== 'SKIP' && op.kind !== 'NOTE'),
      [],
    );
  });

  it('keeps a designer’s scopes through every run, and takes them back only with --overwrite-drift', async () => {
    const mock = createFigmaMock().install();
    await LOAD_DOCUMENT(oneFile(JSON.stringify(DOCUMENT)));
    await sync();

    mock.variable('Demo', 'button/gap')!.scopes = ['STROKE_FLOAT'];
    const kept = await sync();
    assert.equal(kept.filter((op) => op.kind === 'SET_VARIABLE_SCOPES').length, 0);
    assert.ok(kept.some((op) => op.kind === 'SKIP' && op.path === PATH && op.reason === 'drifted'));
    assert.deepEqual(mock.variable('Demo', 'button/gap')!.scopes, ['STROKE_FLOAT']);

    const taken = await sync({ overwriteDrift: true });
    assert.equal(taken.filter((op) => op.kind === 'SET_VARIABLE_SCOPES').length, 1);
    assert.deepEqual(mock.variable('Demo', 'button/gap')!.scopes, ['GAP']);
    assert.equal(stampOf(mock.variable('Demo', 'button/gap')!)?.receipt.scopes, hashOf(['GAP']));

    const quiet = await sync();
    assert.ok(!quiet.some((op) => op.kind === 'SKIP' && op.reason === 'drifted'));
  });

  it('follows a change of the document’s declaration for scopes nobody touched', async () => {
    const mock = createFigmaMock().install();
    await LOAD_DOCUMENT(oneFile(JSON.stringify(DOCUMENT)));
    await sync();

    const declared = JSON.parse(JSON.stringify(DOCUMENT));
    declared.sets.base.sources[0].button.gap.$extensions = { 'com.toghen': { figma: { scopes: ['WIDTH_HEIGHT'] } } };
    await LOAD_DOCUMENT(oneFile(JSON.stringify(declared)));
    // Loading again replaces the record with the file's: the one written above.
    const plan = await sync();
    assert.equal(plan.filter((op) => op.kind === 'SET_VARIABLE_SCOPES').length, 1);
    assert.deepEqual(mock.variable('Demo', 'button/gap')!.scopes, ['WIDTH_HEIGHT']);
  });
});

describe('the mock refuses what Figma refuses', () => {
  useFigmaMock();

  const fresh = (type: VariableResolvedDataType) => {
    const mock = createFigmaMock().withCollection('Demo', ['default']).withVariable('Demo', 'v', type).install();
    return mock.variable('Demo', 'v')!;
  };

  it('starts at ALL_SCOPES and accepts [], and reads back what was set', () => {
    const variable = fresh('FLOAT');
    assert.deepEqual(variable.scopes, ['ALL_SCOPES']);
    variable.scopes = [];
    assert.deepEqual(variable.scopes, []);
    variable.scopes = ['OPACITY', 'GAP'];
    assert.deepEqual([...variable.scopes].sort(), ['GAP', 'OPACITY']);
  });

  it('refuses ALL_FILLS beside another fill scope, and takes the fill scopes together', () => {
    const variable = fresh('COLOR');
    assert.throws(() => (variable.scopes = ['ALL_FILLS', 'FRAME_FILL']), /If ALL_FILLS is set, other fill scopes cannot be set/);
    variable.scopes = ['FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL'];
    variable.scopes = ['ALL_FILLS', 'STROKE_COLOR'];
  });

  it('refuses ALL_SCOPES beside anything', () => {
    assert.throws(() => (fresh('FLOAT').scopes = ['ALL_SCOPES', 'GAP']), /If ALL_SCOPES is set, other scopes cannot be set/);
  });

  it('refuses a scope the type does not take, and takes COLOR_OPACITY on a float', () => {
    assert.throws(() => (fresh('FLOAT').scopes = ['FRAME_FILL']), /Invalid scope for this variable type/);
    assert.throws(() => (fresh('COLOR').scopes = ['OPACITY']), /Invalid scope for this variable type/);
    assert.throws(() => (fresh('COLOR').scopes = ['COLOR_OPACITY']), /Invalid scope for this variable type/);
    const variable = fresh('FLOAT');
    variable.scopes = ['COLOR_OPACITY'];
    assert.deepEqual(variable.scopes, ['COLOR_OPACITY']);
  });
});
