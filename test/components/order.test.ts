import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { orderFiles, type FileNames } from '../../shared/components/order.js';

const file = (fileName: string, defines: string | undefined, ...names: string[]): FileNames => ({
  fileName,
  ...(defines !== undefined ? { defines } : {}),
  names,
});
const order = (files: FileNames[], library?: Set<string>): string[] => orderFiles(files, library).map((f) => f.fileName);

describe("the order of a run's component files", () => {
  it('puts a file after the file that defines a component it names', () => {
    assert.deepEqual(order([file('stage', 'Stage', 'Chip'), file('chip', 'Chip')]), ['chip', 'stage']);
    // Two levels: the deepest first.
    assert.deepEqual(order([file('stage', 'Stage', 'Card'), file('card', 'Card', 'Chip'), file('chip', 'Chip')]), [
      'chip',
      'card',
      'stage',
    ]);
  });

  it('keeps the typed order among files that do not depend on each other, so only a file with a dependency moves', () => {
    assert.deepEqual(order([file('b', 'B'), file('a', 'A'), file('c', 'C')]), ['b', 'a', 'c']);
    assert.deepEqual(
      order([file('b', 'B'), file('stage', 'Stage', 'Chip'), file('a', 'A'), file('chip', 'Chip'), file('board', undefined, 'Stage')]),
      ['b', 'a', 'chip', 'stage', 'board'],
    );
    // A name no file defines, and a file naming itself, are no dependency on a file.
    assert.deepEqual(order([file('stage', 'Stage', 'Elsewhere', 'Stage'), file('chip', 'Chip')]), ['stage', 'chip']);
  });

  it("takes a name a declared library defines as the library's, not as a dependency on a file", () => {
    assert.deepEqual(order([file('stage', 'Stage', 'Chip'), file('chip', 'Chip')], new Set(['Chip'])), ['stage', 'chip']);
  });

  it('refuses a cycle, naming the files in it and only those', () => {
    assert.throws(
      () => orderFiles([file('free', 'Free'), file('outer', 'Outer', 'A'), file('a', 'A', 'B'), file('b', 'B', 'A')]),
      (error: Error) => {
        assert.match(error.message, /name each other in a cycle/);
        assert.match(error.message, /: a → b → a$/);
        assert.doesNotMatch(error.message, /outer|free/);
        return true;
      },
    );
  });
});
