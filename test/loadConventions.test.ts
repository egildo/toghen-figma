import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { installFigma } from './support/partialApi.js';
import { GET_CONVENTIONS, LOAD_CONVENTIONS } from '../main/handlers/loadConventions.js';
import { getState, resetState } from '../main/runtimeState.js';

function setupFigmaMock() {
  const messages: Array<any> = [];
  installFigma({
    ui: {
      postMessage: (message: any) => messages.push(message),
    },
  });
  return messages;
}

describe('LOAD_CONVENTIONS / GET_CONVENTIONS', () => {
  beforeEach(() => {
    resetState();
  });

  it('loads valid conventions and updates runtime state', async () => {
    const messages = setupFigmaMock();
    const json = JSON.stringify([
      {
        id: 'padding-left',
        pattern: '{component}/paddingLeft',
        property: 'paddingLeft',
        nodeTypes: ['FRAME', 'COMPONENT'],
        variableType: 'FLOAT',
      },
    ]);

    await LOAD_CONVENTIONS({ json });

    assert.equal(getState().conventions.length, 1);
    assert.equal(messages.at(-1)?.type, 'CONVENTIONS_LOADED');
    assert.equal(messages.at(-1)?.payload.count, 1);
  });

  it('posts INVALID_CONVENTIONS when payload is invalid', async () => {
    const messages = setupFigmaMock();

    await LOAD_CONVENTIONS({ json: '{"not":"array"}' });

    assert.equal(messages.at(-1)?.type, 'ERROR');
    assert.equal(messages.at(-1)?.payload.code, 'INVALID_CONVENTIONS');
  });

  it('reports convention count via GET_CONVENTIONS', async () => {
    const messages = setupFigmaMock();
    const json = JSON.stringify([
      {
        id: 'padding-left',
        pattern: '{component}/paddingLeft',
        property: 'paddingLeft',
        nodeTypes: ['FRAME'],
        variableType: 'FLOAT',
      },
      {
        id: 'fill',
        pattern: '{component}/fill',
        property: 'fills[0].color',
        nodeTypes: ['FRAME'],
        variableType: 'COLOR',
      },
    ]);

    await LOAD_CONVENTIONS({ json });
    await GET_CONVENTIONS();

    assert.equal(messages.at(-1)?.type, 'CONVENTIONS_LOADED');
    assert.equal(messages.at(-1)?.payload.count, 2);
  });
});
