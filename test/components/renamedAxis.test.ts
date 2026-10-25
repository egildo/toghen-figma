import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, useFigmaMock } from '../support/figmaMock.js';
import { diff } from '../../shared/components/diff.js';
import type { Snapshot } from '../../shared/components/diff.js';
import { readComponentFile } from '../../shared/components/index.js';
import type { Desired } from '../../shared/components/index.js';
import { run } from '../../main/components/run.js';
import { CHECK_COMPONENTS } from '../../main/handlers/runComponent.js';
import type { Response } from '../../shared/protocol.js';

// The nodes a test reads are the mock's, through the API the engine used.
type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** A synthetic component with two axes, each test naming them. */
const probe = (kind = 'kind quiet loud', state = 'state rest hover'): string => `component Probe
properties {
    VARIANT ${kind}
    ${state ? `VARIANT ${state}` : ''}
}
FRAME Probe layoutMode=VERTICAL
`;

function desiredFrom(text: string): Desired {
  const file = readComponentFile(text);
  assert.deepEqual(
    file.problems.filter((p) => p.severity === 'error'),
    [],
    text,
  );
  return JSON.parse(JSON.stringify({ component: file.component, members: file.members })) as Desired;
}

const names = (set: Node): string[] => set.children.map((member: Node) => member.name);

/** The snapshot of a set whose members hold these combinations: all the diff reads to infer a rename. */
const held = (...combinations: string[]): Snapshot => ({
  foreign: [],
  set: {
    id: '1:1',
    definitions: [],
    properties: [],
    unstamped: [],
    members: combinations.map((name, index) => ({ id: `1:${index + 2}`, name, layers: [], unstamped: [] })),
  },
});

const FOUR = ['kind=quiet, state=rest', 'kind=quiet, state=hover', 'kind=loud, state=rest', 'kind=loud, state=hover'];

const renames = (text: string, snapshot: Snapshot) => {
  const { component, members } = desiredFrom(text);
  return diff(members, component, snapshot).filter((step) => step.kind === 'RENAME_AXIS');
};

describe('a held set whose axis is renamed and something else changed (no rename is inferred)', () => {
  useFigmaMock();

  it('runs with allowBreaking to completion, reading the set only while it is consistent', async () => {
    const mock = createFigmaMock().install();
    const first = await run(desiredFrom(probe()));
    const set = mock.node(first.setId!) as Node;

    // The mock throws Figma's error on any read of a set whose members disagree on axes: the new members are all in before the old go.
    const report = await run(desiredFrom(probe('kind quiet loud', 'mode rest active')), { allowBreaking: true });

    assert.equal(report.created.length, 4);
    assert.equal(report.deleted.length, 4);
    assert.deepEqual(names(set).sort(), [
      'kind=loud, mode=active',
      'kind=loud, mode=rest',
      'kind=quiet, mode=active',
      'kind=quiet, mode=rest',
    ]);
    assert.deepEqual(Object.keys(set.componentPropertyDefinitions), ['kind', 'mode']);
  });

  it('runs the same when an axis is added', async () => {
    const mock = createFigmaMock().install();
    const first = await run(desiredFrom(probe()));
    const set = mock.node(first.setId!) as Node;

    await run(desiredFrom(probe().replace('VARIANT state rest hover', 'VARIANT state rest hover\n    VARIANT size sm lg')), {
      allowBreaking: true,
    });

    assert.equal(set.children.length, 8);
    assert.deepEqual(Object.keys(set.componentPropertyDefinitions), ['kind', 'state', 'size']);
  });
});

describe('diff: a renamed axis is inferred under a strict rule', () => {
  it('infers a rename of one axis, at its position, with the same values in any order', () => {
    assert.deepEqual(renames(probe('kind quiet loud', 'interaction hover rest'), held(...FOUR)), [
      { kind: 'RENAME_AXIS', from: 'state', to: 'interaction' },
    ]);
  });

  it('pairs the members by their new names, so the rest of the plan is an ordinary patch', () => {
    const { component, members } = desiredFrom(probe('kind quiet loud', 'interaction rest hover'));
    const kinds = diff(members, component, held(...FOUR)).map((step) => step.kind);
    assert.equal(kinds[0], 'RENAME_AXIS');
    assert.ok(!kinds.includes('CREATE_MEMBER') && !kinds.includes('DELETE_MEMBER'));
  });

  it('infers nothing when two axes are renamed', () => {
    assert.deepEqual(renames(probe('tone quiet loud', 'interaction rest hover'), held(...FOUR)), []);
  });

  it('infers nothing when a value changed with the name', () => {
    assert.deepEqual(renames(probe('kind quiet loud', 'interaction rest focus'), held(...FOUR)), []);
  });

  it('infers nothing when an axis is added or removed', () => {
    assert.deepEqual(
      renames(probe().replace('VARIANT state rest hover', 'VARIANT state rest hover\n    VARIANT size sm lg'), held(...FOUR)),
      [],
    );
    assert.deepEqual(renames(probe('kind quiet loud', ''), held(...FOUR)), []);
  });

  it('infers nothing when the held stamps disagree on their axes', () => {
    assert.deepEqual(
      renames(probe('kind quiet loud', 'interaction rest hover'), held('kind=quiet, state=rest', 'kind=quiet, state=hover', 'kind=loud')),
      [],
    );
  });

  it('infers nothing when the axes are only reordered, or the held names do not read', () => {
    assert.deepEqual(renames(probe('state rest hover', 'kind quiet loud'), held(...FOUR)), []);
    assert.deepEqual(renames(probe('kind quiet loud', 'interaction rest hover'), held('Probe')), []);
  });

  it('infers nothing from a set with no members', () => {
    assert.deepEqual(renames(probe('kind quiet loud', 'interaction rest hover'), held()), []);
  });
});

describe('a renamed axis, run', () => {
  useFigmaMock();

  it('renames it in place: every member keeps its node, the stamps follow, an instance keeps its value, nothing breaks', async () => {
    const mock = createFigmaMock().install();
    const first = await run(desiredFrom(probe()));
    const set = mock.node(first.setId!) as Node;
    const ids = set.children.map((member: Node) => member.id);
    const hovered = set.children.find((member: Node) => member.name === 'kind=loud, state=hover');
    const instance = hovered.createInstance();

    // No allowBreaking: the step breaks nothing.
    const dry = await run(desiredFrom(probe('kind quiet loud', 'interaction rest hover')), { dryRun: true });
    assert.deepEqual(
      dry.steps.filter((step) => step.kind === 'RENAME_AXIS'),
      [{ kind: 'RENAME_AXIS', from: 'state', to: 'interaction' }],
    );
    assert.deepEqual(dry.breaking, []);

    const report = await run(desiredFrom(probe('kind quiet loud', 'interaction rest hover')));

    assert.deepEqual(report.breaking, []);
    assert.deepEqual(report.created, []);
    assert.deepEqual(report.deleted, []);
    assert.deepEqual(
      set.children.map((member: Node) => member.id),
      ids,
    );
    assert.deepEqual(names(set), [
      'kind=quiet, interaction=rest',
      'kind=quiet, interaction=hover',
      'kind=loud, interaction=rest',
      'kind=loud, interaction=hover',
    ]);
    for (const member of set.children) assert.equal(JSON.parse(member.getSharedPluginData('toghen', 'stamp')).is.member, member.name);
    assert.equal(instance.componentProperties.interaction.value, 'hover');
    assert.equal(instance.componentProperties.kind.value, 'loud');

    const again = await run(desiredFrom(probe('kind quiet loud', 'interaction rest hover')));
    assert.deepEqual(
      again.steps.filter((step) => step.kind === 'RENAME_AXIS'),
      [],
    );
  });
});

describe('a set Figma already reports as broken', () => {
  useFigmaMock();

  const broken = async () => {
    const mock = createFigmaMock().install();
    const first = await run(desiredFrom(probe()));
    return { mock, set: mock.node(first.setId!) as Node };
  };

  it('stops the snapshot naming a member with other axes than the rest, said to be made by hand, and writes nothing', async () => {
    const { mock, set } = await broken();
    const stranger = figma.createComponent();
    stranger.name = 'kind=quiet';
    set.appendChild(stranger);
    const writes = mock.writes().length;

    await assert.rejects(run(desiredFrom(probe())), (error: Error) => {
      assert.match(
        error.message,
        new RegExp(`cannot build "Probe": Figma reports its set \\(${set.id}\\) as broken, and nothing was written`),
      );
      assert.match(
        error.message,
        new RegExp(`member "kind=quiet" \\(${stranger.id}, made by hand\\) has the axes kind; the other 4 have kind, state`),
      );
      assert.match(error.message, /delete or rename the members named, then run again/);
      return true;
    });
    assert.equal(mock.writes().length, writes);
  });

  it('names a combination two members share, with both ids, ours when stamped', async () => {
    const { mock, set } = await broken();
    const [one, two] = set.children;
    two.name = one.name;
    const writes = mock.writes().length;

    await assert.rejects(run(desiredFrom(probe())), (error: Error) => {
      assert.match(error.message, new RegExp(`"${one.name}" is the name of two members \\(${one.id}, ours; ${two.id}, ours\\)`));
      return true;
    });
    assert.equal(mock.writes().length, writes);
  });

  it('names a member whose name does not read as axes and values', async () => {
    const { set } = await broken();
    const [one] = set.children;
    one.name = 'Renamed member';

    await assert.rejects(
      run(desiredFrom(probe())),
      new RegExp(`member "Renamed member" \\(${one.id}, ours\\) does not read as Axis=value`),
    );
  });

  it('is a problem the check before any write returns', async () => {
    const { mock, set } = await broken();
    set.children[1].name = set.children[0].name;
    const writes = mock.writes().length;
    const before = mock.calls('ui.postMessage').length;

    await CHECK_COMPONENTS({ files: [{ fileName: 'probe.component.kdl', text: probe() }] });

    const [message] = mock
      .calls('ui.postMessage')
      .slice(before)
      .map((call) => call.args[0] as Response);
    assert.ok(message.type === 'ERROR');
    assert.equal(message.payload.commandType, 'CHECK_COMPONENTS');
    assert.match(message.payload.problems!.join('\n'), new RegExp(`Figma reports its set \\(${set.id}\\) as broken`));
    assert.equal(mock.writes().length, writes);
  });

  it('is no problem for the check when the set is whole', async () => {
    const { mock } = await broken();
    const before = mock.calls('ui.postMessage').length;
    await CHECK_COMPONENTS({ files: [{ fileName: 'probe.component.kdl', text: probe() }] });
    const [message] = mock
      .calls('ui.postMessage')
      .slice(before)
      .map((call) => call.args[0] as Response);
    assert.equal(message.type, 'COMPONENTS_CHECKED');
  });
});
