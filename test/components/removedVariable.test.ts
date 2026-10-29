/**
 * A field whose variable the sync removed is not drift: the binding went with the variable, not with a hand edit, so
 * the next run binds the variable the file now gives it, without `overwriteDrift`. A field a person unbound while its
 * variable is still there stays drift. Synthetic tokens in the W3C structured shapes.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LOAD_DOCUMENT } from '../../main/handlers/loadDocument.js';
import { resetState } from '../../main/runtimeState.js';
import { createFigmaMock, useFigmaMock } from '../support/figmaMock.js';
import { oneFile } from '../support/oneFile.js';
import { byAddress, runFile } from './support.js';

type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const srgb = (...components: number[]) => ({ $type: 'color', $value: { colorSpace: 'srgb', components } });

const DOCUMENT = {
  version: '2025-11-01',
  name: 'Core',
  sets: { base: { sources: [{ ground: { old: srgb(1, 1, 1), new: srgb(0, 0, 1) } }] } },
  resolutionOrder: [{ $ref: '#/sets/base' }],
};

const card = (token: string) => `component Card
FRAME Card layoutMode=VERTICAL {
    fills "{ground.${token}}"
}
`;

const mockOf = () =>
  createFigmaMock()
    .withCollection('Core', ['default'])
    .withVariable('Core', 'ground/old', 'COLOR', { default: { r: 1, g: 1, b: 1, a: 1 } })
    .withVariable('Core', 'ground/new', 'COLOR', { default: { r: 0, g: 0, b: 1, a: 1 } });

/** Builds the card bound to `ground.old`, then does to its fill what removing a variable does: the colour stays, unbound. */
async function unbound(remove: (variable: Node) => void) {
  const mock = mockOf().install();
  await LOAD_DOCUMENT(oneFile(JSON.stringify(DOCUMENT), 'core.resolver.json'));
  const first = await runFile(mock, card('old'));
  const layer = (): Node => byAddress((mock.node(first.setId!) as Node).children[0]).get('Card')!;
  remove(mock.variable('Core', 'ground/old'));
  layer().fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: 1 }];
  return { mock, layer, id: (name: string) => mock.variable('Core', name)?.id };
}

const drift = (notes: string[]) => notes.filter((note) => note.includes('was changed in Figma'));

describe('a binding whose variable was removed', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  it('is bound to the variable the file now gives, in the next run, without overwriting drift', async () => {
    const { mock, layer, id } = await unbound((variable) => variable.remove());
    const report = await runFile(mock, card('new'));
    assert.deepEqual(drift(report.notes), []);
    assert.equal(layer().fills[0].boundVariables?.color?.id, id('ground/new'));
    assert.deepEqual(drift((await runFile(mock, card('new'))).notes), [], 'and the next run is quiet');
  });

  it('counts as removed when its id now names another variable', async () => {
    const { mock, layer, id } = await unbound((variable) => {
      variable.name = 'ground/reused';
    });
    assert.deepEqual(drift((await runFile(mock, card('new'))).notes), []);
    assert.equal(layer().fills[0].boundVariables?.color?.id, id('ground/new'));
  });

  it('is drift when its variable is still there: a person unbound it', async () => {
    const { mock, layer } = await unbound(() => {});
    const report = await runFile(mock, card('new'));
    assert.equal(drift(report.notes).length, 1);
    assert.equal(layer().fills[0].boundVariables?.color, undefined, 'the hand edit is kept');
  });
});
