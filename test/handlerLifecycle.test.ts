/**
 * Handlers whose job is to *not* lose things, plus the two that used to answer
 * every request with "not implemented in this milestone".
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, useFigmaMock } from './support/figmaMock.js';
import { CANCEL_OPERATION } from '../main/handlers/cancelOperation.js';
import { GET_SELECTION, GET_FIGMA_COLLECTIONS } from '../main/handlers/getSelection.js';
import { getState, setState } from '../main/runtimeState.js';
import { SimpleAbortController } from '../main/utils/abortController.js';
import type { Operation } from '../shared/operations.js';

const posted = (calls: ReadonlyArray<{ args: readonly unknown[] }>) => calls.map((call) => call.args[0] as { type: string; payload: any });

describe('CANCEL_OPERATION', () => {
  useFigmaMock();

  it('aborts the run and leaves the plan where it is', async () => {
    // Clearing `lastPlan` here raced the handler still executing it: by the
    // time the run reported what it had applied, the plan describing the
    // rest had already been thrown away.
    createFigmaMock().install();

    const plan: Operation[] = [{ kind: 'SKIP', reason: 'unchanged', path: 'Demo.a' }];
    const controller = new SimpleAbortController();
    setState({ activeOperation: controller, lastPlan: plan, lastPlanType: 'variable_sync' });

    await CANCEL_OPERATION();

    assert.equal(controller.signal.aborted, true, 'the run should be told to stop');
    assert.equal(getState().activeOperation, null);
    assert.equal(getState().lastPlan, plan, 'the plan should survive the cancel');
    assert.equal(getState().lastPlanType, 'variable_sync');
  });
});

describe('GET_SELECTION', () => {
  useFigmaMock();

  it('answers with what is selected now', async () => {
    const mock = createFigmaMock()
      .withSelection([
        { id: 'n1', name: 'Card', type: 'FRAME', boundVariables: {} },
        { id: 'n2', name: 'Badge', type: 'FRAME', boundVariables: {} },
      ])
      .install();

    await GET_SELECTION();

    const [message] = posted(mock.calls('ui.postMessage'));
    assert.equal(message.type, 'SELECTION_CHANGED');
    assert.deepEqual(message.payload.names, ['Card', 'Badge']);
    assert.equal(message.payload.count, 2);
  });
});

describe('GET_FIGMA_COLLECTIONS', () => {
  useFigmaMock();

  it('answers with the file’s collections and their modes', async () => {
    const mock = createFigmaMock().withCollection('Demo', ['light', 'dark']).install();

    await GET_FIGMA_COLLECTIONS();

    const [message] = posted(mock.calls('ui.postMessage'));
    assert.equal(message.type, 'FIGMA_COLLECTIONS');
    assert.equal(message.payload.length, 1);
    assert.equal(message.payload[0].name, 'Demo');
    assert.deepEqual(
      message.payload[0].modes.map((mode: { name: string }) => mode.name),
      ['light', 'dark'],
    );
  });

  it('counts the variables each collection holds', async () => {
    const mock = createFigmaMock()
      .withCollection('Demo', ['light', 'dark'])
      .withCollection('Empty')
      .withVariable('Demo', 'color/primary', 'COLOR')
      .withVariable('Demo', 'color/accent', 'COLOR')
      .install();

    await GET_FIGMA_COLLECTIONS();

    const [message] = posted(mock.calls('ui.postMessage'));
    const counts = Object.fromEntries(
      message.payload.map((collection: { name: string; variableCount: number }) => [collection.name, collection.variableCount]),
    );
    assert.deepEqual(counts, { Demo: 2, Empty: 0 });
  });
});
