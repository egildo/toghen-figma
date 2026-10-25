import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { installFigma } from './support/partialApi.js';
import { LOAD_CONVENTIONS } from '../main/handlers/loadConventions.js';
import { PLAN_APPLY_BINDINGS } from '../main/handlers/planApplyBindings.js';
import { resetState } from '../main/runtimeState.js';

function frame(name: string): SceneNode {
  return {
    id: `node_${name}`,
    name,
    type: 'FRAME',
    children: [],
    boundVariables: {},
  } as unknown as SceneNode;
}

function setupFigmaMock() {
  const messages: Array<any> = [];
  const selected = [frame('Button/Primary')];

  installFigma({
    ui: {
      postMessage: (message: any) => messages.push(message),
    },
    currentPage: {
      selection: selected,
      children: selected,
    },
    root: {
      children: [{ children: selected, loadAsync: async () => {} }],
    },
    variables: {
      getLocalVariables: () => [
        {
          id: 'var_padding',
          name: 'Button/Primary/paddingLeft',
          resolvedType: 'FLOAT',
        },
      ],
      getLocalVariablesAsync: async () => [
        {
          id: 'var_padding',
          name: 'Button/Primary/paddingLeft',
          resolvedType: 'FLOAT',
        },
      ],
    },
  });

  return messages;
}

describe('PLAN_APPLY_BINDINGS', () => {
  beforeEach(() => {
    resetState();
  });

  it('builds apply-bindings plan with BIND_VARIABLE operations', async () => {
    const messages = setupFigmaMock();

    await LOAD_CONVENTIONS({
      json: JSON.stringify([
        {
          id: 'padding-left',
          pattern: '{component}/paddingLeft',
          property: 'paddingLeft',
          nodeTypes: ['FRAME'],
          variableType: 'FLOAT',
        },
      ]),
    });

    await PLAN_APPLY_BINDINGS({ query: '**', scope: 'selection' });

    const last = messages.at(-1);
    assert.equal(last?.type, 'PLAN_READY');
    assert.equal(last?.payload.planType, 'apply_bindings');
    assert.ok(last?.payload.operations.some((op: any) => op.kind === 'BIND_VARIABLE'));
  });
});
