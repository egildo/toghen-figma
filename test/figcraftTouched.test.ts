/**
 * What a batch written to FigCraft touched, for the next read to read again (`touchedBy`): the layers its steps name by
 * id, and what its results made. Two misreadings cost a large run its speed: `{ $step: n }`, a step's place in the
 * batch, read as an id; and an id nested in a result (an instance's component) read as a layer written.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { touchedBy, type Touched } from '../cli/figcraft.js';

const touched = (steps: Array<{ command: string; params: Record<string, unknown> }>, results?: unknown[]): Touched => {
  const into: Touched = { all: false, ids: new Set() };
  touchedBy(into, steps, results);
  return into;
};

describe('what a batch touched', () => {
  it('is each layer a step names by id, and what each result made, by its own id', () => {
    const t = touched(
      [
        { command: 'node.set', params: { ids: [12, 13], props: { x: 4 } } },
        { command: 'node.reparent', params: { ids: [14], parent: 20, index: 0 } },
        { command: 'instance.create', params: { component: 2, parent: { $step: 6 } } },
      ],
      [{ ok: true }, { ok: true }, { id: 31, component: { id: 2 } }],
    );
    assert.equal(t.all, false);
    assert.deepEqual(
      [...t.ids].sort((a, b) => a - b),
      [12, 13, 14, 20, 31],
    );
  });

  it('is everything after a write that may change what no id names: a variable, a style, a library', () => {
    assert.equal(touched([{ command: 'variable.update', params: { id: 'VariableID:1' } }]).all, true);
    assert.equal(touched([{ command: 'variable.bind', params: { ids: [5], field: 'gap', variable: 'VariableID:1' } }]).all, false);
  });
});
