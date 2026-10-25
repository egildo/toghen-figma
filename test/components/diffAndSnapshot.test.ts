import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { diff } from '../../shared/components/diff.js';
import type { Snapshot } from '../../shared/components/diff.js';
import { run } from '../../main/components/run.js';
import { takeSnapshot } from '../../main/components/snapshot.js';
import { useFigmaMock } from '../support/figmaMock.js';
import { desiredOf, shellMock, byAddress } from './support.js';

// The nodes a test reads are the mock's, through the API the engine used.
type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any

describe('diff: the design’s table of situations', () => {
  const { component, members } = desiredOf('shell');
  const empty: Snapshot = { foreign: [] };

  it('creates a set when there is none stamped and none of the name', () => {
    const steps = diff(members, component, empty);
    assert.equal(steps.length, 1);
    assert.equal(steps[0].kind, 'CREATE_SET');
    assert.deepEqual((steps[0] as { members: unknown }).members, members);
    assert.equal((steps[0] as { component: { name: string } }).component.name, 'Shell');
  });

  it('refuses a set of the name that Toghen did not make, and does nothing else', () => {
    const steps = diff(members, component, { foreign: [{ id: '10:1', name: 'Shell' }] });
    assert.equal(steps.length, 1);
    assert.deepEqual(steps[0], {
      kind: 'REFUSE_FOREIGN',
      component: 'Shell',
      nodeIds: ['10:1'],
      message: steps[0].kind === 'REFUSE_FOREIGN' ? steps[0].message : '',
    });
    assert.match((steps[0] as { message: string }).message, /10:1.*Toghen did not make.*never adopts a set by name/);
  });

  it('refuses the foreign set first when a stamped one exists as well', () => {
    const stamped = { id: '20:1', definitions: [], properties: [], members: [], unstamped: [] };
    const steps = diff(members, component, { set: stamped, foreign: [{ id: '10:1', name: 'Shell' }] });
    assert.deepEqual(
      steps.map((s) => s.kind),
      ['REFUSE_FOREIGN'],
    );
  });

  it('reconciles a set it built before: an empty one gets every member and a layout', () => {
    const stamped = { id: '20:1', definitions: [], properties: [], members: [], unstamped: [] };
    const steps = diff(members, component, { set: stamped, foreign: [] });
    assert.equal(steps.filter((s) => s.kind === 'CREATE_MEMBER').length, 7);
    assert.equal(steps[steps.length - 1].kind, 'RELAYOUT');
  });

  it('does not change what it is given', () => {
    const before = JSON.stringify({ component, members });
    diff(members, component, empty);
    assert.equal(JSON.stringify({ component, members }), before);
  });
});

describe('snapshot: what is ours in the file', () => {
  useFigmaMock();

  async function built() {
    const mock = shellMock().install();
    const report = await run(desiredOf('shell'));
    return { mock, set: mock.node(report.setId!) as Node };
  }

  it('finds the set by stamp, its members by combination and their layers by address', async () => {
    const { set } = await built();
    const { component, members } = desiredOf('shell');
    const snapshot = await takeSnapshot('Shell');

    assert.equal(snapshot.set?.id, set.id);
    assert.deepEqual(snapshot.foreign, []);
    assert.deepEqual(
      snapshot.set?.properties,
      component.properties.filter((p) => p.type !== 'VARIANT').map((p) => p.name),
    );
    assert.deepEqual(
      snapshot.set?.members.map((m) => m.name),
      members.map((m) => m.name),
    );
    assert.deepEqual(snapshot.set?.unstamped, []);

    const first = snapshot.set!.members[0];
    assert.deepEqual(first.unstamped, []);
    const layer = (address: string) => first.layers.find((l) => l.address === address)!;
    assert.deepEqual(
      { kind: layer('Shell').kind, parent: layer('Shell').parent, name: layer('Shell').name },
      { kind: 'FRAME', parent: undefined, name: 'Columns=grow fixed, Header in=page' },
    );
    assert.deepEqual([layer('Body').parent, layer('Body').index], ['Shell', 1]);
    assert.deepEqual([layer('Lanes').parent, layer('Lanes').index], ['Body', 1]);
    assert.equal(layer('Header').kind, 'SLOT');
    assert.deepEqual(Object.keys(layer('Aside region').receipt).sort(), [
      'grid',
      'layoutMode',
      'layoutSizingHorizontal',
      'layoutSizingVertical',
      'strokeLeftWeight',
      'strokes',
      'visible',
    ]);
  });

  it('reads each layer’s receipt as what Figma reports right after the build, field by field', async () => {
    await built();
    for (const member of (await takeSnapshot('Shell')).set!.members) {
      for (const layer of member.layers) {
        assert.ok(
          Object.values(layer.receipt).every((hash) => /^[0-9a-z]+-[0-9a-z]+$/.test(hash)),
          `${member.name} ${layer.address}`,
        );
        assert.deepEqual(layer.reported, layer.receipt, `${member.name} ${layer.address}`);
      }
    }
  });

  it('finds a layer by its stamp after a designer renamed it, and reports the name it has now', async () => {
    const { set } = await built();
    const nav = byAddress(set.children[0]).get('Nav region')!;
    nav.name = 'Left rail';

    const snapshot = await takeSnapshot('Shell');
    const found = snapshot.set!.members[0].layers.find((l) => l.address === 'Nav region');
    assert.equal(found?.id, nav.id);
    assert.equal(found?.name, 'Left rail');
  });

  it('finds a set wherever a designer moved it, on another page', async () => {
    const mock = shellMock().withPage('Page 1').withPage('Elsewhere').install();
    const report = await run(desiredOf('shell'), { page: 'Page 1' });
    const set = mock.node(report.setId!) as Node;
    await figma.setCurrentPageAsync(figma.root.children[1]);
    figma.root.children[1].appendChild(set);

    assert.equal((await takeSnapshot('Shell')).set?.id, set.id);
  });

  it('reports a node in a member that carries no stamp, and does not look inside it', async () => {
    const { set } = await built();
    const region = byAddress(set.children[0]).get('Body')!;
    const stranger = figma.createFrame();
    stranger.name = 'Added by hand';
    region.appendChild(stranger);
    stranger.appendChild(figma.createFrame());
    set.children[0].appendChild(figma.createFrame());

    const snapshot = await takeSnapshot('Shell');
    assert.deepEqual(
      snapshot.set!.members[0].unstamped.map((n) => [n.name, n.parent]),
      [
        ['Added by hand', 'Body'],
        ['Frame', 'Shell'],
      ],
    );
  });

  it('reports a child of the set that is not a member of ours, and a set of the name that is not ours', async () => {
    const { set } = await built();
    const component = figma.createComponent();
    component.name = 'Columns=extra, Header in=page';
    set.appendChild(component);

    const lone = figma.createComponent();
    lone.name = 'x';
    const foreign = figma.combineAsVariants([lone], figma.currentPage);
    foreign.name = 'Shell';

    const snapshot = await takeSnapshot('Shell');
    assert.deepEqual(
      snapshot.set!.unstamped.map((n) => n.id),
      [component.id],
    );
    assert.deepEqual(snapshot.foreign, [{ id: foreign.id, name: 'Shell' }]);
  });

  it('finds nothing in a file with no set', async () => {
    shellMock().install();
    await figma.loadAllPagesAsync();
    assert.deepEqual(await takeSnapshot('Shell'), { foreign: [] });
  });
});
