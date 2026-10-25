/**
 * A token whose value is only a reference is judged by its target: where the target is a variable (by its own value, or by
 * its `figma.value`), the token is an alias to it in every mode. Synthetic tokens, in the structured shapes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver, type ResolverDocument } from '@toghen/lib';
import { VariableSyncEngine, type VariablePlan } from '../main/engines/variableSyncEngine.js';
import { buildSum } from '../main/utils/sum.js';
import { defaultTokenTypeMap } from '../shared/tokenTypeMap.js';
import { runOperations } from '../main/engines/batchRunner.js';
import { INSPECT_CORRESPONDENCE } from '../main/handlers/inspectCorrespondence.js';
import { setState } from '../main/runtimeState.js';
import type { Operation } from '../shared/operations.js';
import type { InspectionPayload, Response } from '../shared/protocol.js';
import { createFigmaMock, useFigmaMock } from './support/figmaMock.js';

const srgb = (r: number, g: number, b: number) => ({ colorSpace: 'srgb', components: [r, g, b] });
const figma = (value: unknown) => ({ 'com.toghen': { figma: { value } } });

const document = (): ResolverDocument =>
  ({
    version: '2025-11-01',
    name: 'Demo',
    sets: {
      base: {
        sources: [
          {
            ink: { $type: 'color', primary: { $value: srgb(0.1, 0.1, 0.1) }, alert: { $value: srgb(0.8, 0, 0) } },
            // No context names a value: skipped.
            bare: { text: { $type: 'color', $value: 'currentColor' } },
            chip: {
              // Only a reference to a role Figma holds as a variable.
              color: { $type: 'color', $value: '{t.text}' },
              // A reference to a reference.
              edge: { $type: 'color', $value: '{chip.color}' },
              // A reference to a token skipped for its value, and to one skipped for being defined in one context only.
              bare: { $type: 'color', $value: '{bare.text}' },
              // A key on a reference to a variable, and on references that are not.
              keyed: { $type: 'color', $value: '{t.text}', $extensions: figma('{ink.primary}') },
              keyedBare: { $type: 'color', $value: '{bare.text}', $extensions: figma('{ink.primary}') },
            },
          },
        ],
      },
    },
    modifiers: {
      tone: {
        default: 'neutral',
        contexts: {
          neutral: [
            {
              t: { text: { $type: 'color', $value: 'currentColor', $extensions: figma('{ink.primary}') } },
              chip: { partial: { $type: 'color', $value: srgb(0.5, 0.5, 0.5) } },
            },
          ],
          alert: [
            {
              t: { text: { $type: 'color', $value: '{ink.alert}' }, only: { $type: 'color', $value: '{ink.alert}' } },
              chip: { partial: { $type: 'color', $value: '{t.only}' } },
            },
          ],
        },
      },
    },
    resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/tone' }],
  }) as ResolverDocument;

const sumOf = (doc: ResolverDocument = document()) => buildSum(new Resolver(doc), 'Demo', defaultTokenTypeMap);
const reasonOf = (sum: ReturnType<typeof sumOf>, path: string) => {
  const routing = sum.tokenByPath.get(path)!.routing;
  assert.equal(routing.kind, 'refused', `${path} is ${routing.kind}`);
  return routing.kind === 'refused' ? routing.reason : '';
};
const refTo = (sum: ReturnType<typeof sumOf>, path: string) => {
  const token = sum.tokenByPath.get(path)!;
  assert.equal(token.routing.kind, 'variable', `${path} is ${token.routing.kind}`);
  return token.variables.map((variable) => [...variable.cells.values()].map((cell) => (cell.kind === 'value' ? 'value' : cell.to)));
};

describe('a reference to a variable is an alias — the sum', () => {
  it('judges a reference by its target, not by the currentColor beneath it', () => {
    assert.deepEqual(refTo(sumOf(), 'Demo.chip.color'), [['Demo.t.text']]);
  });

  it('follows a chain of references', () => {
    assert.deepEqual(refTo(sumOf(), 'Demo.chip.edge'), [['Demo.chip.color']]);
  });

  it('skips a reference to an unholdable target, as before', () => {
    assert.equal(reasonOf(sumOf(), 'Demo.chip.bare'), '"Demo.chip.bare" is currentColor, which Figma cannot hold; skipped.');
  });

  it('does not alias a target skipped for another reason: its value is written with a warning, as before', async () => {
    createFigmaMock().install();
    const sum = sumOf();
    assert.match(reasonOf(sum, 'Demo.t.only'), /is defined only in tone=alert/);
    assert.equal(sum.tokenByPath.get('Demo.chip.partial')!.routing.kind, 'variable');
    const p = await new VariableSyncEngine().buildPlan(new Resolver(document()), 'Demo', defaultTokenTypeMap);
    const messages = p.operations
      .filter((op) => op.kind === 'WARNING' && op.path === 'Demo.chip.partial')
      .map((op) => (op as { message: string }).message);
    assert.deepEqual(messages, [
      '"Demo.chip.partial" refers to "Demo.t.only", which does not become a variable, so the value is written instead of an alias.',
    ]);
  });
});

describe('a key on a reference to a variable is refused', () => {
  it('naming the token, and nothing is written for it', () => {
    assert.equal(
      reasonOf(sumOf(), 'Demo.chip.keyed'),
      '"Demo.chip.keyed" has a figma.value, but it is a reference to "Demo.t.text", which Figma holds as a variable; remove the key, so that it follows the modes.',
    );
  });

  it('stays allowed on a reference to a target Figma does not hold', () => {
    assert.deepEqual(refTo(sumOf(), 'Demo.chip.keyedBare'), [['Demo.ink.primary']]);
  });

  it('stays allowed on a value that is itself unholdable', () => {
    const doc = document();
    (doc.sets as any).base.sources[0].chip.own = { $type: 'color', $value: 'currentColor', $extensions: figma('{ink.primary}') };
    assert.deepEqual(refTo(sumOf(doc), 'Demo.chip.own'), [['Demo.ink.primary']]);
  });

  it('ignores a key a context only inherits from the base, where the context refers to a variable', () => {
    const doc = document();
    (doc.sets as any).base.sources[0].chip.mix = { $type: 'color', $value: 'currentColor', $extensions: figma('{ink.primary}') };
    (doc.modifiers!.tone.contexts.alert[0] as any).chip = { mix: { $type: 'color', $value: '{t.text}' } };
    const sum = sumOf(doc);
    assert.deepEqual(refTo(sum, 'Demo.chip.mix'), [['Demo.ink.primary', 'Demo.t.text']]);
  });
});

describe('a reference to a variable is an alias — the plan, the file and the Inspector', () => {
  useFigmaMock();
  const plan = (doc: ResolverDocument = document()): Promise<VariablePlan> =>
    new VariableSyncEngine().buildPlan(new Resolver(doc), 'Demo', defaultTokenTypeMap);
  const valueOps = (p: VariablePlan, path: string) =>
    p.operations.filter(
      (op): op is Extract<Operation, { kind: 'SET_VARIABLE_VALUE' }> => op.kind === 'SET_VARIABLE_VALUE' && op.tokenPath === path,
    );
  const warnings = (p: VariablePlan, path: string) => p.operations.filter((op) => op.kind === 'WARNING' && op.path === path);

  it('writes an alias, with no warning', async () => {
    createFigmaMock().install();
    const p = await plan();
    for (const path of ['Demo.chip.color', 'Demo.chip.edge']) {
      assert.ok(valueOps(p, path).length > 0, path);
      assert.deepEqual(
        valueOps(p, path).map((op) => (op.value as { type: string }).type),
        ['VARIABLE_ALIAS'],
      );
      assert.deepEqual(warnings(p, path), [], path);
    }
  });

  it('reports a key on such a reference as one warning, and writes nothing for it', async () => {
    createFigmaMock().install();
    const p = await plan();
    assert.equal(warnings(p, 'Demo.chip.keyed').length, 1);
    assert.equal(valueOps(p, 'Demo.chip.keyed').length, 0);
  });

  it('shows the alias in each mode of the written file', async () => {
    // The reference sits in a modifier's context too, so its variable has a mode per tone.
    const doc = document();
    (doc.modifiers!.tone.contexts.neutral[0] as any).chip = { tinted: { $type: 'color', $value: '{t.text}' } };
    (doc.modifiers!.tone.contexts.alert[0] as any).chip = { tinted: { $type: 'color', $value: '{t.text}' } };
    const mock = createFigmaMock().install();
    await runOperations((await plan(doc)).operations, { onProgress: () => {} });
    const text = mock.variable('tone', 't/text')!;
    const tinted = mock.variable('tone', 'chip/tinted')!;
    assert.equal(Object.keys(tinted.valuesByMode).length, 2);
    for (const value of Object.values(tinted.valuesByMode) as { type: string; id: string }[]) {
      assert.deepEqual(value, { type: 'VARIABLE_ALIAS', id: text.id });
    }
    const color = mock.variable('Demo', 'chip/color')!;
    assert.deepEqual(Object.values(color.valuesByMode), [{ type: 'VARIABLE_ALIAS', id: text.id }]);
  });

  it('shows the token as usable in the Inspector, and a reference to an unholdable target as blocked', async () => {
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
    for (const path of ['Demo.chip.color', 'Demo.chip.edge'])
      assert.equal(tokens.find((token) => token.path === path)?.state, 'absent', path);
    assert.equal(tokens.find((token) => token.path === 'Demo.chip.bare')?.state, 'blocked');
  });
});

describe('a document with no figma.value key plans as before', () => {
  useFigmaMock();
  it('skips a reference down to currentColor, by its own reason, and keeps every other token', async () => {
    createFigmaMock().install();
    const doc = document();
    const base = (doc.sets as any).base.sources[0];
    delete base.chip.keyed;
    delete base.chip.keyedBare;
    (doc.modifiers!.tone.contexts.neutral[0] as any).t.text = { $type: 'color', $value: 'currentColor' };
    const p = await new VariableSyncEngine().buildPlan(new Resolver(doc), 'Demo', defaultTokenTypeMap);
    const messages = p.operations.filter((op) => op.kind === 'WARNING').map((op) => (op as { message: string }).message);
    assert.ok(messages.includes('"Demo.chip.color" is currentColor, which Figma cannot hold; skipped.'));
    assert.ok(messages.includes('"Demo.chip.edge" is currentColor, which Figma cannot hold; skipped.'));
    assert.ok(messages.includes('"Demo.t.text" is currentColor, which Figma cannot hold; skipped.'));
    assert.ok(p.operations.some((op) => op.kind === 'CREATE_VARIABLE' && op.path === 't/only') === false);
  });
});
