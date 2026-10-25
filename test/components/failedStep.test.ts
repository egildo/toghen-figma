import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, useFigmaMock } from '../support/figmaMock.js';
import { run } from '../../main/components/run.js';
import { desiredFromText } from './support.js';

// The nodes a test reads are the mock's, through the API the engine used.
type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const figmaOf = (): any => (globalThis as { figma?: unknown }).figma; // eslint-disable-line @typescript-eslint/no-explicit-any
const topLevel = (): Node[] => figmaOf().currentPage.children;

/** A synthetic component: two values on one axis, each member a frame holding a frame. */
const nested = (values = 'quiet loud'): string => `component Probe
properties {
    VARIANT kind ${values}
}
FRAME Probe layoutMode=VERTICAL {
    FRAME Inner layoutMode=VERTICAL
}
`;

/** The same with nothing under the root, so a member is only appended to its set. */
const bare = (values: string): string => `component Probe
properties {
    VARIANT kind ${values}
}
FRAME Probe layoutMode=VERTICAL
`;

describe('a step that fails removes what it created: a new set', () => {
  useFigmaMock();

  const failing = async (api: string, nth: number) => {
    const mock = createFigmaMock().install();
    mock.failOn(api, nth);
    await assert.rejects(run(desiredFromText(nested())), /injected failure/);
    return mock;
  };

  it('leaves no node when the layer of the first member fails: the member being built is removed', async () => {
    await failing('createFrame', 1);
    assert.deepEqual(topLevel(), []);
  });

  it('leaves no node when the second member fails: the first, built already, is removed', async () => {
    await failing('createComponent', 2);
    assert.deepEqual(topLevel(), []);
  });

  it('leaves no node when combining fails: every member built is removed', async () => {
    await failing('combineAsVariants', 1);
    assert.deepEqual(topLevel(), []);
  });

  it('leaves no node when the set is made and its layout fails: the set and its members are removed', async () => {
    const mock = await failing('node.resizeWithoutConstraints', 2);
    assert.deepEqual(topLevel(), []);
    assert.equal(mock.calls('combineAsVariants').length, 1, 'the set had been made');
  });

  it('does not mask the failure with the removal of what was made', async () => {
    const mock = createFigmaMock().install();
    mock.failOn('createFrame', 1, 'Figma said no');
    await assert.rejects(run(desiredFromText(nested())), /^Error: Figma said no$/);
  });

  it('leaves what was on the page alone', async () => {
    const mock = createFigmaMock().withComponent('Mark').install();
    mock.failOn('createComponent', 2);
    await assert.rejects(run(desiredFromText(nested())), /injected failure/);
    assert.deepEqual(
      topLevel().map((node) => node.name),
      ['Mark'],
    );
  });
});

describe('a step that fails removes what it created: new members of a set that exists', () => {
  useFigmaMock();

  const built = async (text: string) => {
    const mock = createFigmaMock().install();
    const first = await run(desiredFromText(text));
    return { mock, set: mock.node(first.setId!) as Node };
  };

  it('removes the members already made when a later one fails to be made', async () => {
    const { mock, set } = await built(nested('quiet'));
    mock.failOn('createComponent', 2);
    await assert.rejects(run(desiredFromText(nested('quiet loud calm'))), /injected failure/);
    assert.deepEqual(topLevel(), [set], 'only the set is on the page');
    assert.deepEqual(
      (set.children as Node[]).map((member) => member.name),
      ['kind=quiet'],
    );
  });

  it('removes the member being built when its layer fails', async () => {
    const { mock, set } = await built(nested('quiet'));
    mock.failOn('createFrame', 1);
    await assert.rejects(run(desiredFromText(nested('quiet loud'))), /injected failure/);
    assert.deepEqual(topLevel(), [set]);
    assert.equal(set.children.length, 1);
  });

  it('removes the members already appended to the set when a later append fails', async () => {
    const { mock, set } = await built(bare('quiet'));
    // Nothing is built under a root, so the appends are the only appendChild calls the step makes.
    mock.failOn('node.appendChild', 2);
    await assert.rejects(run(desiredFromText(bare('quiet loud calm'))), /injected failure/);
    assert.deepEqual(topLevel(), [set]);
    assert.deepEqual(
      (set.children as Node[]).map((member) => member.name),
      ['kind=quiet'],
      'the one appended is out of the set again, and the set reads',
    );
    assert.deepEqual(Object.keys(set.componentPropertyDefinitions), ['kind']);
  });
});
