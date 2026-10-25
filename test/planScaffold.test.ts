import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { installFigma } from './support/partialApi.js';
import { LOAD_CONVENTIONS } from '../main/handlers/loadConventions.js';
import { PLAN_SCAFFOLD } from '../main/handlers/planScaffold.js';
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
      getLocalVariables: () => [],
      getLocalVariableCollections: () => [],
      getLocalVariablesAsync: async () => [],
      getLocalVariableCollectionsAsync: async () => [],
    },
  });

  return messages;
}

describe('PLAN_SCAFFOLD', () => {
  beforeEach(() => {
    resetState();
  });

  it('returns INVALID_CONVENTIONS when conventions are not loaded', async () => {
    const messages = setupFigmaMock();
    await PLAN_SCAFFOLD({ query: '**', scope: 'selection' });

    assert.equal(messages.at(-1)?.type, 'ERROR');
    assert.equal(messages.at(-1)?.payload.code, 'INVALID_CONVENTIONS');
  });

  it('builds scaffold plan with create + bind operations', async () => {
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

    await PLAN_SCAFFOLD({ query: 'Button/*', scope: 'selection' });

    const last = messages.at(-1);
    assert.equal(last?.type, 'PLAN_READY');
    assert.equal(last?.payload.planType, 'scaffold');
    assert.ok(last?.payload.operations.some((op: any) => op.kind === 'CREATE_COLLECTION'));
    assert.ok(last?.payload.operations.some((op: any) => op.kind === 'CREATE_VARIABLE'));
    assert.ok(last?.payload.operations.some((op: any) => op.kind === 'BIND_VARIABLE'));
  });
});
