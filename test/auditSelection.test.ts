import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { installFigma } from './support/partialApi.js';
import { LOAD_CONVENTIONS } from '../main/handlers/loadConventions.js';
import { AUDIT_SELECTION } from '../main/handlers/auditSelection.js';
import { resetState } from '../main/runtimeState.js';

function createFrame(id: string, name: string, bound = {}): SceneNode {
  return {
    id,
    name,
    type: 'FRAME',
    boundVariables: bound,
    children: [],
  } as unknown as SceneNode;
}

function setupFigmaMock() {
  const messages: Array<any> = [];
  const selected = [createFrame('n1', 'Button/Primary', { paddingLeft: { id: 'var_padding' } })];

  installFigma({
    ui: {
      postMessage: (message: any) => messages.push(message),
    },
    currentPage: {
      selection: selected,
      children: selected,
    },
    root: {
      children: [
        {
          children: selected,
          loadAsync: async () => {},
        },
      ],
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

describe('AUDIT_SELECTION', () => {
  beforeEach(() => {
    resetState();
  });

  it('posts INVALID_CONVENTIONS when conventions are missing', async () => {
    const messages = setupFigmaMock();

    await AUDIT_SELECTION({ scope: 'selection' });

    assert.equal(messages.at(-1)?.type, 'ERROR');
    assert.equal(messages.at(-1)?.payload.code, 'INVALID_CONVENTIONS');
  });

  it('audits nodes in selection scope when conventions are loaded', async () => {
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

    await AUDIT_SELECTION({ scope: 'selection' });

    const last = messages.at(-1);
    assert.equal(last?.type, 'AUDIT_RESULT');
    assert.equal(last?.payload.nodes.length, 1);
    assert.equal(last?.payload.nodes[0].bindings[0].status, 'ok');
  });
});
