import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, useFigmaMock } from '../support/figmaMock.js';
import { run } from '../../main/components/run.js';
import { desiredFromText, runFile } from './support.js';

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

/** A synthetic artboard: a frame holding two frames, each with a padding. */
const sheet = (padding = 4): string => `artboard Sheet

FRAME Sheet layoutMode=VERTICAL {
    FRAME First layoutMode=VERTICAL paddingLeft=(literal)${padding}
    FRAME Second layoutMode=VERTICAL paddingLeft=(literal)${padding}
}
`;

describe('a step that fails removes what it created: a new artboard', () => {
  useFigmaMock();

  it('leaves no node when a layer of the artboard fails: the frame and what is in it are removed', async () => {
    const mock = createFigmaMock().install();
    mock.failOn('createFrame', 3);
    await assert.rejects(runFile(mock, sheet(), {}, 'sheet.artboard.kdl'), /injected failure/);
    assert.deepEqual(topLevel(), []);
  });

  it('leaves what was on the page alone', async () => {
    const mock = createFigmaMock().withComponent('Mark').install();
    mock.failOn('createFrame', 2);
    await assert.rejects(runFile(mock, sheet(), {}, 'sheet.artboard.kdl'), /injected failure/);
    assert.deepEqual(
      topLevel().map((node) => node.name),
      ['Mark'],
    );
  });
});

describe('an update that fails partway stamps what it wrote', () => {
  useFigmaMock();

  /** Three members, each with a padding on its inner frame. */
  const padded = (padding: number): string => `component Probe
properties {
    VARIANT kind quiet loud calm
}
FRAME Probe layoutMode=VERTICAL {
    FRAME Inner layoutMode=VERTICAL paddingLeft=(literal)${padding}
}
`;
  const paddings = (set: Node): number[] => (set.children as Node[]).map((member) => member.children[0].paddingLeft);

  it('a set: the next run reads its writes as its own and finishes them, and none is skipped as unchanged', async () => {
    const mock = createFigmaMock().install();
    const set = mock.node((await run(desiredFromText(padded(4)))).setId!) as Node;
    // Each member's patch writes the padding, then the name: the third write is the second member's padding.
    mock.failOn('node.set', 3);
    await assert.rejects(run(desiredFromText(padded(8))), /injected failure/);
    assert.deepEqual(paddings(set), [8, 4, 4], 'the run stopped after the first member');

    const back = await run(desiredFromText(padded(4)), { dryRun: true, skipUnchanged: true });
    assert.equal(back.unchanged, undefined, 'the fingerprint of the run before the failed one is gone');

    const again = await run(desiredFromText(padded(8)), { dryRun: true });
    assert.deepEqual(
      again.steps.filter((step) => step.kind === 'LEAVE'),
      [],
      'what the failed run wrote is not taken for a hand edit',
    );
    assert.equal(again.steps.filter((step) => step.kind === 'PATCH_LAYER').length, 2);

    await run(desiredFromText(padded(8)));
    assert.deepEqual(paddings(set), [8, 8, 8]);
    assert.equal((await run(desiredFromText(padded(8)), { dryRun: true, skipUnchanged: true })).unchanged, true);
  });

  it('an artboard: the next run reads its writes as its own and finishes them, and it is not skipped as unchanged', async () => {
    const mock = createFigmaMock().install();
    const frame = mock.node((await runFile(mock, sheet(4), {}, 'sheet.artboard.kdl')).setId!) as Node;
    const padding = (): number[] => (frame.children as Node[]).map((layer) => layer.paddingLeft);
    // Each layer's patch writes the padding, then the name: the third write is the second layer's padding.
    mock.failOn('node.set', 3);
    await assert.rejects(runFile(mock, sheet(8), {}, 'sheet.artboard.kdl'), /injected failure/);
    assert.deepEqual(padding(), [8, 4], 'the run stopped after the first layer');

    const back = await runFile(mock, sheet(4), { dryRun: true, skipUnchanged: true }, 'sheet.artboard.kdl');
    assert.equal(back.unchanged, undefined, 'the fingerprint of the run before the failed one is gone');

    const again = await runFile(mock, sheet(8), { dryRun: true }, 'sheet.artboard.kdl');
    assert.deepEqual(
      again.steps.filter((step) => step.kind === 'LEAVE'),
      [],
      'what the failed run wrote is not taken for a hand edit',
    );
    assert.deepEqual(
      again.steps.filter((step) => step.kind === 'PATCH_LAYER').map((step) => step.address),
      ['Second'],
    );

    await runFile(mock, sheet(8), {}, 'sheet.artboard.kdl');
    assert.deepEqual(padding(), [8, 8]);
  });
});
