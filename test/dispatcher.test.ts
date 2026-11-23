import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver } from '@toghen/lib';
import { setupDispatcher } from '../main/dispatcher.js';
import { getState, setState } from '../main/runtimeState.js';
import { defaultTokenTypeMap } from '../shared/tokenTypeMap.js';
import type { Response } from '../shared/protocol.js';
import { createFigmaMock, useFigmaMock } from './support/figmaMock.js';

/** Two synthetic dimensions, in the W3C shape. */
const resolver = (): Resolver =>
  new Resolver({
    version: '2025-11-01',
    name: 'Demo',
    sets: {
      base: {
        sources: [
          { a: { $type: 'dimension', $value: { value: 1, unit: 'px' } }, b: { $type: 'dimension', $value: { value: 2, unit: 'px' } } },
        ],
      },
    },
    resolutionOrder: [{ $ref: '#/sets/base' }],
  });

const setUp = () => {
  const mock = createFigmaMock().install();
  setupDispatcher();
  setState({ resolver: resolver(), conversionMap: defaultTokenTypeMap });
  const send = (type: string, payload: unknown = {}): Promise<void> =>
    (figma.ui.onmessage as (command: unknown) => Promise<void>)({ type, payload });
  const posted = (type: Response['type']): Response[] =>
    mock
      .calls('ui.postMessage')
      .map((call) => call.args[0] as Response)
      .filter((message) => message.type === type);
  return { mock, send, posted };
};

describe('the dispatcher', () => {
  useFigmaMock();

  it('runs one command at a time: two executes of one plan apply it once', async () => {
    const { mock, send, posted } = setUp();
    await send('PLAN_VARIABLE_SYNC');

    await Promise.all([send('EXECUTE_VARIABLE_SYNC'), send('EXECUTE_VARIABLE_SYNC')]);

    assert.equal(posted('OPERATION_COMPLETE').length, 1);
    assert.equal(mock.collections().length, 1);
    assert.deepEqual(
      mock
        .variables()
        .map((variable) => variable.name)
        .sort(),
      ['a', 'b'],
    );
  });

  it('keeps a plan made while an execute runs', async () => {
    const { send } = setUp();
    await send('PLAN_VARIABLE_SYNC');

    await Promise.all([send('EXECUTE_VARIABLE_SYNC'), send('PLAN_VARIABLE_SYNC')]);

    assert.equal(getState().lastPlanType, 'variable_sync');
    assert.ok(getState().lastPlan, 'the plan made after the execute began is there to execute');
  });

  it('lets a cancel reach the run in progress', async () => {
    const { send, posted } = setUp();
    await send('PLAN_VARIABLE_SYNC');

    const running = send('EXECUTE_VARIABLE_SYNC');
    // The mock answers within one turn of the event loop, so the cancel is sent as soon as the execute has begun.
    while (!getState().activeOperation) await Promise.resolve();
    await send('CANCEL_OPERATION');
    await running;

    const [complete] = posted('OPERATION_COMPLETE') as Extract<Response, { type: 'OPERATION_COMPLETE' }>[];
    assert.ok(complete.payload.cancelled > 0, 'the run stopped where the cancel found it');
  });
});
