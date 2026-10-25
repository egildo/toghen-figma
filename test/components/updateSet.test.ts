import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, useFigmaMock, type FigmaMockHandle } from '../support/figmaMock.js';
import { run } from '../../main/components/run.js';
import { readComponentFile } from '../../shared/components/index.js';
import type { Desired } from '../../shared/components/index.js';
import { byAddress, desiredOf, fixture, keyOfProperty, shellMock, stampOf, walk } from './support.js';

// The nodes a test reads are the mock's, through the API the engine used.
type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any

function desiredFrom(text: string): Desired {
  const file = readComponentFile(text);
  assert.deepEqual(
    file.problems.filter((p) => p.severity === 'error'),
    [],
    text,
  );
  return JSON.parse(JSON.stringify({ component: file.component, members: file.members })) as Desired;
}

interface CardOptions {
  tone?: string;
  titleProperty?: string;
  header?: string;
  bodyField?: string;
  bodyChildren?: string;
  footer?: string;
  extraProperties?: string;
  slot?: string;
}

/** A rule a variant writes inside the layer it changes: the `loud` tone dims the header. */
const LOUD = 'when loud opacity=(literal)0.5';

/** A small synthetic component whose parts each test can change one at a time. */
const card = (o: CardOptions = {}): string => `component Card
properties {
    VARIANT Tone ${o.tone ?? 'calm loud'}
    ${o.titleProperty ?? 'TEXT Title default="Title"'}
    BOOLEAN "Show Badge" default=#true
    ${o.extraProperties ?? ''}
}
guard loud { is (input)Tone loud }
FRAME Card layoutMode=VERTICAL {
    ${o.header ?? `FRAME Header layoutMode=HORIZONTAL {\n        ${LOUD}\n        TEXT Heading characters=(property)Title\n    }`}
    FRAME Body layoutMode=VERTICAL ${o.bodyField ?? 'itemSpacing=(literal)8'} {
        ${o.bodyChildren ?? 'FRAME Badge visible=(property)"Show Badge" layoutMode=VERTICAL'}
    }
    ${o.footer ?? 'FRAME Footer layoutMode=HORIZONTAL'}
}
`;

const cardMock = () => createFigmaMock().withFonts([{ family: 'Inter', style: 'Regular' }]);

/** Every node under a set, by id, with the address it is stamped with. */
function census(set: Node): Map<string, string> {
  const nodes = new Map<string, string>();
  for (const node of walk(set) as Node[]) {
    const is = stampOf(node)?.is;
    nodes.set(node.id, is?.address ?? is?.component ?? node.name);
  }
  return nodes;
}

const kinds = (steps: { kind: string }[]) => steps.map((step) => step.kind);

/**
 * Builds `before`, then plans `after` as a dry run, which must write nothing,
 * then applies it.
 */
async function change(mock: FigmaMockHandle, before: string, after: string) {
  const first = await run(desiredFrom(before));
  const set = mock.node(first.setId!) as Node;
  const ids = census(set);

  const writes = mock.writes().length;
  const planned = await run(desiredFrom(after), { dryRun: true });
  assert.equal(mock.writes().length, writes, 'a dry run writes nothing');
  assert.equal(planned.dryRun, true);

  // The tests that follow a breaking change are about what the change does; the gate has its own tests below.
  const report = await run(desiredFrom(after), { allowBreaking: true });
  assert.equal(report.setId, first.setId, 'the set is patched, not rebuilt');
  return { set, ids, planned, report };
}

describe('a component set updates in place: nothing changed', () => {
  useFigmaMock();

  it('creates nothing and deletes nothing, and every node keeps its id', async () => {
    const mock = shellMock().install();
    const first = await run(desiredOf('shell'));
    const set = mock.node(first.setId!) as Node;
    const before = census(set);
    const creates = mock.calls('createComponent').length + mock.calls('createFrame').length + mock.calls('createSlot').length;
    const writes = mock.writes().length;

    const again = await run(desiredOf('shell'));

    assert.equal(again.setId, first.setId);
    assert.deepEqual(again.created, []);
    assert.deepEqual(again.deleted, []);
    assert.deepEqual(again.breaking, []);
    assert.deepEqual(again.notes, []);
    assert.equal(mock.calls('createComponent').length + mock.calls('createFrame').length + mock.calls('createSlot').length, creates);
    assert.equal(mock.calls('node.remove').length, 0);
    assert.equal(mock.calls('combineAsVariants').length, 1);
    assert.deepEqual(census(mock.node(first.setId!) as Node), before);
    assert.equal(again.steps.filter((step) => /^(CREATE|DELETE|REPLACE|ADD)/.test(step.kind)).length, 0);
    // A slot with no preferred values reads back as [] from Figma: that is not a change.
    assert.deepEqual(
      again.steps.filter((step) => step.kind === 'EDIT_PROPERTY'),
      [],
    );
    // Every receipt matches the file and Figma both: no member is patched, and nothing in one is written but where the board puts it.
    assert.deepEqual(
      again.steps.filter((step) => step.kind === 'PATCH_LAYER'),
      [],
    );
    assert.deepEqual(again.updated, []);
    const inMembers = new Set((set.children as Node[]).flatMap(walk).map((node: Node) => node.id));
    const placing = (call: { api: string; args: readonly unknown[] }) =>
      call.api === 'node.set' && (call.args[1] === 'x' || call.args[1] === 'y');
    assert.deepEqual(
      mock
        .writes()
        .slice(writes)
        .filter((call) => inMembers.has(call.args[0]) && !placing(call)),
      [],
    );
  });

  it('keeps the layout: the members are laid out again where they were', async () => {
    const mock = shellMock().install();
    const first = await run(desiredOf('shell'));
    const set = mock.node(first.setId!) as Node;
    const positions = () => (set.children as Node[]).map((m) => [m.x, m.y]);
    const before = positions();

    await run(desiredOf('shell'));
    assert.deepEqual(positions(), before);
  });
});

describe('a component set updates in place: a token changes', () => {
  useFigmaMock();

  it('re-binds the same node to the new variable', async () => {
    const mock = shellMock().install();
    const first = await run(desiredOf('shell'));
    const set = mock.node(first.setId!) as Node;
    const header = byAddress(set.children[0]).get('Header region')!;
    const ids = census(set);
    assert.equal(header.boundVariables.paddingTop.id, mock.variable('Demo', 'space/lg')!.id);

    const edited = fixture('shell').replace('paddingTop="{space.lg}"', 'paddingTop="{space.md}"');
    const report = await run(desiredFrom(edited));

    assert.equal(byAddress(set.children[0]).get('Header region')!.id, header.id);
    assert.equal(header.boundVariables.paddingTop.id, mock.variable('Demo', 'space/md')!.id);
    assert.equal(header.paddingTop, 16);
    assert.deepEqual(census(set), ids);
    assert.deepEqual(report.created, []);
  });
});

describe('a component set updates in place: a bound paint', () => {
  useFigmaMock();

  // Figma draws a bound paint's own colour on a node it already held: a reconcile once left every bound fill black.
  it('carries the colour its variable resolves to, on a member built and on one patched', async () => {
    const mock = shellMock().install();
    const first = await run(desiredOf('shell'));
    const root = (mock.node(first.setId!) as Node).children[0];
    const page = { r: 0.96, g: 0.97, b: 1 };
    assert.deepEqual(root.fills[0].color, page);

    // Unbound and black by hand: drift, which the file's value is written over.
    root.fills = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
    await run(desiredOf('shell'), { overwriteDrift: true });

    assert.deepEqual(root.fills[0].color, page);
    assert.equal(root.fills[0].boundVariables.color.id, mock.variable('Demo', 'surface/page')!.id);
  });
});

describe('a component set updates in place: members', () => {
  useFigmaMock();

  it('appends the members a new variant value needs, and leaves the others as they are', async () => {
    const mock = cardMock().install();
    const { set, ids, report, planned } = await change(mock, card(), card({ tone: 'calm loud quiet' }));

    assert.deepEqual(report.created, ['Tone=quiet']);
    assert.equal(planned.steps.filter((s) => s.kind === 'CREATE_MEMBER').length, 1);
    assert.deepEqual(
      (set.children as Node[]).map((m) => m.name),
      ['Tone=calm', 'Tone=loud', 'Tone=quiet'],
    );
    for (const [id] of ids) assert.ok(mock.node(id), `${id} is still in the file`);

    const added = set.children[2] as Node;
    assert.equal(stampOf(added)?.is.member, 'Tone=quiet');
    assert.equal(byAddress(added).size, 6, 'the new member is built whole, and stamped');
    // Its layers reference the set's own property keys.
    assert.deepEqual(byAddress(added).get('Heading')!.componentPropertyReferences, { characters: keyOfProperty(set, 'Title', 'TEXT') });
    assert.equal(added.x > set.children[1].x, true, 'and laid out after the others');
  });

  it('deletes the members a removed value leaves behind, and reports that it breaks their instances', async () => {
    const mock = cardMock().install();
    const { set, ids, report, planned } = await change(mock, card({ tone: 'calm loud quiet' }), card());

    assert.deepEqual(report.deleted, ['Tone=quiet']);
    assert.match(report.breaking[0], /the member "Tone=quiet" is gone: instances of it lose their variant/);
    assert.match(planned.breaking[0], /Tone=quiet/, 'a dry run says it too');
    assert.deepEqual(
      (set.children as Node[]).map((m) => m.name),
      ['Tone=calm', 'Tone=loud'],
    );
    const members = [...ids].filter(([id, address]) => address === 'Card' && id !== set.id).map(([id]) => id);
    assert.equal(members.length, 3);
    assert.ok(mock.node(members[0]) && mock.node(members[1]), 'the members that stay keep their ids');
    assert.equal(mock.node(members[2]), undefined);
  });

  it('leaves a member with no stamp alone, and says so', async () => {
    const mock = cardMock().install();
    const first = await run(desiredFrom(card()));
    const set = mock.node(first.setId!) as Node;
    const stranger = figma.createComponent();
    stranger.name = 'Tone=hand-made';
    set.appendChild(stranger);

    const report = await run(desiredFrom(card()));
    assert.ok(set.children.some((m: Node) => m.id === stranger.id));
    assert.match(report.notes.join('\n'), /"Tone=hand-made" .* has no member stamp and was left alone/);
  });
});

describe('a component set updates in place: layers', () => {
  useFigmaMock();

  it('finds a layer a designer renamed by its stamp, patches it, and gives it the file’s name back', async () => {
    const mock = cardMock().install();
    const first = await run(desiredFrom(card()));
    const set = mock.node(first.setId!) as Node;
    const header = byAddress(set.children[1]).get('Header')!;
    header.name = 'Top bar';
    header.opacity = 0.2;
    set.children[1].name = 'Tone=renamed'; // a name that keeps the axes: one without them would make Figma call the set broken

    const report = await run(desiredFrom(card()));

    assert.equal(header.name, 'Header');
    assert.equal(set.children[1].name, 'Tone=loud', 'the member is named for its combination again');
    assert.equal(byAddress(set.children[1]).get('Header')!.id, header.id);
    assert.equal(header.opacity, 0.2, 'a field edited by hand is drift, and kept');
    assert.deepEqual(report.notes, [
      'member "Tone=loud", layer "Header": "opacity" was changed in Figma since Toghen wrote it, and was left as it is; pass --overwrite-drift to write the file\'s value',
    ]);
    // Patched for their names alone.
    const patches = report.steps.flatMap((step) => (step.kind === 'PATCH_LAYER' ? [[step.member, step.layer.address, step.fields]] : []));
    assert.deepEqual(patches, [
      ['Tone=loud', 'Card', []],
      ['Tone=loud', 'Header', []],
    ]);

    // Said again on the next run, until someone settles it: here the file's side.
    assert.equal((await run(desiredFrom(card()), { dryRun: true })).notes.length, 1);
    const overwritten = await run(desiredFrom(card()), { overwriteDrift: true });
    assert.equal(header.opacity, 0.5, 'the file’s value is written over it');
    assert.match(
      overwritten.warnings.join('\n'),
      /"opacity" was changed in Figma since Toghen wrote it; the file's value is written over it/,
    );
    assert.deepEqual((await run(desiredFrom(card()))).notes, [], 'and the next run is quiet');
  });

  it('leaves a node with no stamp alone, and says so', async () => {
    const mock = cardMock().install();
    const first = await run(desiredFrom(card()));
    const set = mock.node(first.setId!) as Node;
    const body = byAddress(set.children[0]).get('Body')!;
    const stranger = figma.createFrame();
    stranger.name = 'Added by hand';
    body.appendChild(stranger);

    const report = await run(desiredFrom(card()));
    assert.ok(body.children.some((c: Node) => c.id === stranger.id));
    assert.match(report.notes.join('\n'), /member "Tone=calm": "Added by hand" \(.*\) has no stamp and was left alone/);
  });

  it('moves a layer the file moved: the same node, in its new parent', async () => {
    const mock = cardMock().install();
    const moved = card({
      bodyChildren: '',
      footer: 'FRAME Footer layoutMode=HORIZONTAL {\n            FRAME Badge visible=(property)"Show Badge" layoutMode=VERTICAL\n        }',
    });
    const first = await run(desiredFrom(card()));
    const set = mock.node(first.setId!) as Node;
    const badge = byAddress(set.children[0]).get('Badge')!;

    const planned = await run(desiredFrom(moved), { dryRun: true });
    assert.ok(kinds(planned.steps).includes('MOVE_LAYER'));
    await run(desiredFrom(moved));

    assert.equal(byAddress(set.children[0]).get('Badge')!.id, badge.id);
    assert.equal(stampOf(badge.parent)?.is.address, 'Footer');
    assert.equal(badge.parent.id, byAddress(set.children[0]).get('Footer')!.id);
  });

  it('re-orders a layer the file put elsewhere among its siblings', async () => {
    const mock = cardMock().install();
    const first = await run(desiredFrom(card()));
    const set = mock.node(first.setId!) as Node;
    const root = set.children[0] as Node;
    const order = () => root.children.map((c: Node) => c.name);
    assert.deepEqual(order(), ['Header', 'Body', 'Footer']);

    const swapped = card().replace(/(\s*FRAME Header[\s\S]*?\n {4}\})(\s*FRAME Body[\s\S]*?\n {4}\})/, '$2$1');
    assert.notEqual(swapped, card());
    await run(desiredFrom(swapped));
    assert.deepEqual(order(), ['Body', 'Header', 'Footer']);
  });

  it('does not move a layer for a node it does not own beside it', async () => {
    const mock = cardMock().install();
    const first = await run(desiredFrom(card()));
    const set = mock.node(first.setId!) as Node;
    const root = set.children[0] as Node;
    const stranger = figma.createFrame();
    root.insertChild(0, stranger);

    const report = await run(desiredFrom(card()), { dryRun: true });
    assert.ok(!kinds(report.steps).includes('MOVE_LAYER'));
  });

  it('replaces a layer whose kind changed, reports it, and moves what was inside', async () => {
    const mock = cardMock().install();
    const { set, ids, report } = await change(
      mock,
      card({ footer: 'FRAME Footer layoutMode=HORIZONTAL {\n            FRAME Note layoutMode=VERTICAL\n        }' }),
      card({
        footer: 'SLOT Footer layoutMode=HORIZONTAL {\n            FRAME Note layoutMode=VERTICAL\n        }',
        extraProperties: 'SLOT Footer description="Below the body."',
      }),
    );
    const footer = byAddress(set.children[0]).get('Footer')!;

    assert.equal(footer.type, 'SLOT');
    assert.match(report.breaking.join('\n'), /member "Tone=calm", layer "Footer" changed from FRAME to SLOT: overrides on it are lost/);
    const oldFooter = [...ids].find(([, address]) => address === 'Footer')![0];
    assert.notEqual(footer.id, oldFooter);
    assert.equal(mock.node(oldFooter), undefined, 'the old node is gone');
    const note = byAddress(set.children[0]).get('Note')!;
    assert.equal([...ids].find(([, address]) => address === 'Note')![0], note.id, 'what was inside is the same node');
    assert.equal(note.parent.id, footer.id);
  });

  it('creates a layer the file gained, in its place, on every member', async () => {
    const mock = cardMock().install();
    const { set, ids } = await change(
      mock,
      card(),
      card({
        bodyChildren:
          'FRAME Badge visible=(property)"Show Badge" layoutMode=VERTICAL\n            TEXT Caption characters="New" layoutMode=NONE'.replace(
            ' layoutMode=NONE',
            '',
          ),
      }),
    );
    for (const member of set.children as Node[]) {
      const layers = byAddress(member);
      const body = layers.get('Body')!;
      assert.deepEqual(
        body.children.map((c: Node) => c.name),
        ['Badge', 'Caption'],
      );
      assert.equal(layers.get('Caption')!.characters, 'New');
    }
    assert.ok(![...ids.values()].includes('Caption'));
  });

  it('deletes a layer the file no longer has', async () => {
    const mock = cardMock().install();
    const { set, ids } = await change(mock, card(), card({ footer: '' }));
    for (const member of set.children as Node[]) assert.equal(byAddress(member).has('Footer'), false);
    const gone = [...ids].filter(([, address]) => address === 'Footer').map(([id]) => id);
    assert.equal(gone.length, 2);
    for (const id of gone) assert.equal(mock.node(id), undefined);
  });

  it('leaves the value of a field the file stopped declaring, and says so', async () => {
    const mock = cardMock().install();
    const { set, report } = await change(mock, card(), card({ bodyField: '' }));
    const body = byAddress(set.children[0]).get('Body')!;

    assert.equal(body.itemSpacing, 8, 'the value is left where it was');
    assert.match(
      report.notes.join('\n'),
      /member "Tone=calm", layer "Body": the file no longer declares "itemSpacing", so its value was left as it is/,
    );
    assert.deepEqual(Object.keys(stampOf(body)!.receipt), ['layoutMode'], 'the receipt lists what is set now');

    // Said once: the next run has nothing left to report.
    const again = await run(desiredFrom(card({ bodyField: '' })));
    assert.deepEqual(again.notes, []);
  });

  it('rewrites each layer’s stamp with the fields now set', async () => {
    const mock = cardMock().install();
    const { set } = await change(
      mock,
      card(),
      card({
        header: `FRAME Header layoutMode=HORIZONTAL cornerRadius=(literal)4 {\n        ${LOUD}\n        TEXT Heading characters=(property)Title\n    }`,
      }),
    );
    const header = byAddress(set.children[0]).get('Header')!;
    assert.deepEqual(Object.keys(stampOf(header)!.receipt).sort(), ['cornerRadius', 'layoutMode']);
    assert.equal(header.cornerRadius, 4);
  });
});

describe('a component set updates in place: properties', () => {
  useFigmaMock();

  it('adds a property the file gained, and wires the layers that use it with the set’s keys', async () => {
    const mock = cardMock().install();
    const { set, report } = await change(
      mock,
      card(),
      card({
        extraProperties: 'BOOLEAN Compact default=#false',
        footer: 'FRAME Footer layoutMode=HORIZONTAL visible=(property)Compact',
      }),
    );
    const key = keyOfProperty(set, 'Compact', 'BOOLEAN');
    for (const member of set.children as Node[]) {
      assert.deepEqual(byAddress(member).get('Footer')!.componentPropertyReferences, { visible: key });
      assert.equal(byAddress(member).get('Footer')!.visible, false, 'the layer takes the default');
    }
    assert.deepEqual(Object.keys(stampOf(set)!.receipt), ['Title', 'Show Badge', 'Compact']);
    assert.equal(report.breaking.length, 0);
  });

  it('edits a changed default, and the layers that follow it', async () => {
    const mock = cardMock().install();
    const { set } = await change(mock, card(), card({ titleProperty: 'TEXT Title default="Heading"' }));

    assert.equal(set.componentPropertyDefinitions[keyOfProperty(set, 'Title')].defaultValue, 'Heading');
    assert.equal(byAddress(set.children[0]).get('Heading')!.characters, 'Heading');
  });

  it('deletes a property the file no longer declares, and reports it', async () => {
    const mock = cardMock().install();
    const { set, report } = await change(
      mock,
      card(),
      card({
        titleProperty: '',
        header: `FRAME Header layoutMode=HORIZONTAL {\n        ${LOUD}\n        TEXT Heading characters="Fixed"\n    }`,
      }),
    );
    const names = Object.keys(set.componentPropertyDefinitions).map((key) => key.split('#')[0]);
    assert.ok(!names.includes('Title'));
    assert.ok(names.includes('Show Badge'));
    assert.match(report.breaking.join('\n'), /the TEXT property "Title" is no longer declared: instances lose it/);
    assert.deepEqual(Object.keys(stampOf(set)!.receipt), ['Show Badge']);
    assert.equal(byAddress(set.children[0]).get('Heading')!.characters, 'Fixed');
  });

  it('leaves a property a designer added, and reports it', async () => {
    const mock = cardMock().install();
    const first = await run(desiredFrom(card()));
    const set = mock.node(first.setId!) as Node;
    const foreign = set.addComponentProperty('Extra', 'BOOLEAN', true);

    const report = await run(desiredFrom(card()));
    assert.ok(Object.keys(set.componentPropertyDefinitions).includes(foreign));
    assert.match(report.notes.join('\n'), /the set has a property "Extra" that Toghen did not add; it was left as it is/);
  });

  it('does not adopt a foreign property by name', async () => {
    const mock = cardMock().install();
    const first = await run(desiredFrom(card()));
    const set = mock.node(first.setId!) as Node;
    set.addComponentProperty('Compact', 'BOOLEAN', true);

    const report = await run(
      desiredFrom(
        card({ extraProperties: 'BOOLEAN Compact default=#false', footer: 'FRAME Footer layoutMode=HORIZONTAL visible=(property)Compact' }),
      ),
    );
    assert.match(report.notes.join('\n'), /a property "Compact" that Toghen did not add, and the file declares one of that name/);
    assert.equal(set.componentPropertyDefinitions[keyOfProperty(set, 'Compact')].defaultValue, true, 'its default is not edited');
    assert.equal(Object.keys(stampOf(set)!.receipt).includes('Compact'), true, 'and it is recorded as declared');
  });

  it('replaces a property whose type changed, and reports it', async () => {
    const mock = cardMock().install();
    const { set, report } = await change(
      mock,
      card({ extraProperties: 'BOOLEAN Flag default=#true', footer: 'FRAME Footer layoutMode=HORIZONTAL visible=(property)Flag' }),
      card({ extraProperties: 'TEXT Flag default="x"', footer: 'TEXT Footer characters=(property)Flag' }),
    );
    assert.match(report.breaking.join('\n'), /the BOOLEAN property "Flag" became a TEXT/);
    assert.equal(set.componentPropertyDefinitions[keyOfProperty(set, 'Flag')].type, 'TEXT');
  });

  it('edits a slot’s description in place', async () => {
    const mock = cardMock().install();
    const before = card({
      extraProperties: 'SLOT Content description="Above."',
      bodyChildren:
        'SLOT Content layoutMode=VERTICAL clipsContent=#false\n            FRAME Badge visible=(property)"Show Badge" layoutMode=VERTICAL',
    });
    const after = before.replace('Above.', 'Below.');
    const { set, planned } = await change(mock, before, after);

    assert.ok(planned.steps.some((s) => s.kind === 'EDIT_PROPERTY'));
    assert.equal(set.componentPropertyDefinitions[keyOfProperty(set, 'Content', 'SLOT')].description, 'Below.');
  });
});

describe('a component set updates in place: a dry run', () => {
  useFigmaMock();

  it('returns the steps and writes nothing, whatever it would change', async () => {
    const mock = shellMock().install();
    const first = await run(desiredOf('shell'));
    const set = mock.node(first.setId!) as Node;
    const nav = byAddress(set.children[0]).get('Nav region')!;
    nav.name = 'Left rail';
    set.addComponentProperty('Extra', 'BOOLEAN', true);
    const edited = fixture('shell').replace('paddingTop="{space.lg}"', 'paddingTop="{space.md}"');

    const writes = mock.writes().length;
    const report = await run(desiredFrom(edited), { dryRun: true });

    assert.equal(mock.writes().length, writes);
    assert.equal(report.setId, undefined);
    assert.ok(report.steps.some((step) => step.kind === 'PATCH_LAYER'));
    assert.match(report.notes.join('\n'), /"Extra"/);
    assert.equal(nav.name, 'Left rail', 'a dry run does not give the name back');
  });
});

describe('a component set updates in place: what stops it', () => {
  useFigmaMock();

  it('still refuses a foreign set, and a set that lost its stamp is foreign', async () => {
    const mock = cardMock().install();
    const first = await run(desiredFrom(card()));
    (mock.node(first.setId!) as Node).setSharedPluginData('toghen', 'stamp', '');

    await assert.rejects(run(desiredFrom(card())), /Toghen did not make it/);
  });

  it('resolves names before it writes, on an update too', async () => {
    const mock = cardMock().install();
    await run(desiredFrom(card()));
    const writes = mock.writes().length;
    const fill = card({
      header: `FRAME Header layoutMode=HORIZONTAL {\n        ${LOUD}\n        fills "{surface.missing}"\n        TEXT Heading characters=(property)Title\n    }`,
    });

    await assert.rejects(run(desiredFrom(fill)), /token \{surface\.missing\} \(line \d+\) names no variable/);
    assert.equal(mock.writes().length, writes);
  });
});

describe('a component set updates in place: breaking steps stop a real run', () => {
  useFigmaMock();

  const WITH_QUIET = card({ tone: 'calm loud quiet' });

  it('stops before its first write and lists what would break', async () => {
    const mock = cardMock().install();
    const first = await run(desiredFrom(WITH_QUIET));
    const set = mock.node(first.setId!) as Node;
    const writes = mock.writes().length;

    await assert.rejects(run(desiredFrom(card())), (error: Error & { problems?: string[] }) => {
      assert.match(
        error.message,
        /will not change "Card": 1 step would break instances, and nothing was written; pass allowBreaking to take it/,
      );
      assert.match(error.problems!.join('\n'), /the member "Tone=quiet" is gone/);
      return true;
    });
    assert.equal(mock.writes().length, writes, 'nothing was written');
    assert.deepEqual(
      (set.children as Node[]).map((m) => m.name),
      ['Tone=calm', 'Tone=loud', 'Tone=quiet'],
    );
  });

  it('takes them when allowBreaking says so', async () => {
    const mock = cardMock().install();
    const first = await run(desiredFrom(WITH_QUIET));

    const report = await run(desiredFrom(card()), { allowBreaking: true });
    assert.deepEqual(report.deleted, ['Tone=quiet']);
    assert.equal(report.setId, first.setId);
    assert.equal((mock.node(first.setId!) as Node).children.length, 2);
  });

  it('leaves a dry run as it was: it lists the breaking steps and takes none', async () => {
    const mock = cardMock().install();
    await run(desiredFrom(WITH_QUIET));
    const writes = mock.writes().length;

    const planned = await run(desiredFrom(card()), { dryRun: true });
    assert.match(planned.breaking[0], /Tone=quiet/);
    assert.equal(mock.writes().length, writes);
  });

  it('does not stop a run that breaks nothing: a first build, and a change that only adds', async () => {
    cardMock().install();
    const first = await run(desiredFrom(card()));
    assert.deepEqual(first.breaking, []);
    const added = await run(desiredFrom(WITH_QUIET));
    assert.deepEqual(added.created, ['Tone=quiet']);
  });
});
