/**
 * A plan is a little dependency graph, and it can be checked before anything is
 * written.
 *
 * This was the one thing the old dry-run mode could tell you that a plan could
 * not — and it was always a property of the *plan*, never of a way of running
 * it. Dry run is gone (Plan already shows what would happen without touching the
 * file, which made a second "look but don't touch" command redundant); the check
 * it justified now runs when the plan is built.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, useFigmaMock } from './support/figmaMock.js';
import { LOAD_DOCUMENT } from '../main/handlers/loadDocument.js';
import { oneFile } from './support/oneFile.js';
import { PLAN_VARIABLE_SYNC } from '../main/handlers/planVariableSync.js';
import { getState } from '../main/runtimeState.js';
import { danglingSymbolWarnings, dependenciesOf, producedSymbols } from '../main/utils/planSymbols.js';
import type { Operation } from '../shared/operations.js';

const COLLECTION = 'Demo';

const DOC = JSON.stringify({
  version: '2025-11-01',
  name: COLLECTION,
  sets: {
    base: {
      sources: [
        {
          color: {
            bg: { $type: 'color', $value: '#ffffff' },
            fg: { $type: 'color', $value: '#101010' },
          },
        },
      ],
    },
  },
  resolutionOrder: [{ $ref: '#/sets/base' }],
});

describe('plan symbols', () => {
  it('knows what a plan creates', () => {
    const ops: Operation[] = [
      { kind: 'CREATE_COLLECTION', symbolicId: '$col:Demo', name: 'Demo', modes: ['light', 'dark'] },
      { kind: 'CREATE_VARIABLE', symbolicId: '$var:Demo/a', collectionId: '$col:Demo', path: 'Demo/a', variableType: 'FLOAT' },
    ];

    assert.deepEqual([...producedSymbols(ops)].sort(), ['$col:Demo', '$mode:Demo/dark', '$mode:Demo/light', '$var:Demo/a']);
  });

  it('knows what an operation waits on', () => {
    assert.deepEqual(
      dependenciesOf({
        kind: 'SET_VARIABLE_VALUE',
        variableId: '$var:x',
        modeId: '$mode:Demo/light',
        value: 1,
        label: 'x',
        tokenPath: 'Demo.x',
        modeName: 'light',
      }),
      ['$var:x', '$mode:Demo/light'],
    );
    assert.deepEqual(dependenciesOf({ kind: 'WARNING', message: 'no deps' }), []);
  });

  it('says nothing about a plan that satisfies itself', () => {
    const ops: Operation[] = [
      { kind: 'CREATE_COLLECTION', symbolicId: '$col:Demo', name: 'Demo', modes: ['light'] },
      { kind: 'CREATE_VARIABLE', symbolicId: '$var:Demo/a', collectionId: '$col:Demo', path: 'Demo/a', variableType: 'FLOAT' },
      {
        kind: 'SET_VARIABLE_VALUE',
        variableId: '$var:Demo/a',
        modeId: '$mode:Demo/light',
        value: 1,
        label: 'Demo/a [light]',
        tokenPath: 'Demo.a',
        modeName: 'light',
      },
    ];

    assert.deepEqual(danglingSymbolWarnings(ops), []);
  });

  it('reports a reference nothing in the plan creates', () => {
    const ops: Operation[] = [
      {
        kind: 'SET_VARIABLE_VALUE',
        variableId: '$var:nothing-creates-this',
        modeId: '$mode:Demo/light',
        value: 1,
        label: 'x',
        tokenPath: 'Demo.x',
        modeName: 'light',
      },
    ];

    const warnings = danglingSymbolWarnings(ops);
    assert.equal(warnings.length, 2, 'both the variable and the mode are dangling');
    assert.match(warnings.map((w) => (w.kind === 'WARNING' ? w.message : '')).join(' '), /nothing-creates-this/);
  });

  it('reports each dangling symbol once, however many operations want it', () => {
    // Otherwise a broken collection produces one warning per variable in the
    // document, which buries the single fact worth reading.
    const ops: Operation[] = [
      { kind: 'CREATE_VARIABLE', symbolicId: '$var:a', collectionId: '$col:missing', path: 'a', variableType: 'FLOAT' },
      { kind: 'CREATE_VARIABLE', symbolicId: '$var:b', collectionId: '$col:missing', path: 'b', variableType: 'FLOAT' },
      { kind: 'CREATE_VARIABLE', symbolicId: '$var:c', collectionId: '$col:missing', path: 'c', variableType: 'FLOAT' },
    ];

    assert.equal(danglingSymbolWarnings(ops).length, 1);
  });

  it('ignores real Figma ids', () => {
    const ops: Operation[] = [
      {
        kind: 'SET_VARIABLE_VALUE',
        variableId: 'VariableID:1:2',
        modeId: '1:0',
        value: 1,
        label: 'x',
        tokenPath: 'Demo.x',
        modeName: 'light',
      },
    ];

    assert.deepEqual(danglingSymbolWarnings(ops), []);
  });
});

describe('plan validation, through the handler', () => {
  useFigmaMock();

  it('leaves a sound first-run plan unwarned', async () => {
    // Every symbol a first sync references is created by the same plan, so a
    // check that fired here would cry wolf on the most ordinary case there is.
    createFigmaMock().install();

    await LOAD_DOCUMENT(oneFile(DOC));
    await PLAN_VARIABLE_SYNC({ collectionName: COLLECTION });

    const plan = getState().lastPlan ?? [];
    assert.ok(plan.length > 0);
    assert.equal(plan.filter((op) => op.kind === 'WARNING' && /nothing in it creates/.test(op.message)).length, 0);
  });
});
