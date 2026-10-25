import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useFigmaMock, type FigmaMockHandle } from '../support/figmaMock.js';
import { beginRun } from '../../main/components/endOfRun.js';
import { FINISH_COMPONENTS } from '../../main/handlers/runComponent.js';
import { KEEP_TEMPLATE } from '../../main/handlers/templates.js';
import { loadTemplates } from '../../main/utils/templateStore.js';
import { resetState } from '../../main/runtimeState.js';
import type { Response } from '../../shared/protocol.js';
import { byAddress, controlMock, runFile, stampOf, walk } from './support.js';

// The nodes a test reads are the mock's, through the API the engine used.
type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any

// A component the artboard makes instances of: a variant, a text, a boolean, a swap and a slot.
const ROW = `component PropertyRow
properties {
    VARIANT Kind plain required
    TEXT Name default="name"
    BOOLEAN Highlighted default=#false
    INSTANCE_SWAP Icon default=Glyph
    SLOT Extra
}
FRAME PropertyRow layoutMode=HORIZONTAL layoutSizingHorizontal=HUG layoutSizingVertical=HUG {
    TEXT Label characters=(property)Name textStyle="{text.label}"
    INSTANCE Marker visible=(property)Highlighted component=(property)Icon
    SLOT Extra layoutMode=VERTICAL layoutSizingHorizontal=HUG layoutSizingVertical=HUG
}
`;

// A second component, to swap to and to hold a slot of its own.
const PANEL = `component Panel
properties {
    SLOT Content
}
FRAME Panel layoutMode=VERTICAL layoutSizingHorizontal=HUG layoutSizingVertical=HUG {
    SLOT Content layoutMode=VERTICAL layoutSizingHorizontal=HUG layoutSizingVertical=HUG
}
`;

// One template, many data sets: a heading, then a row per property documented, in a panel.
const PAGE = `artboard Docs

FRAME "Docs page" layoutMode=VERTICAL layoutSizingHorizontal=HUG layoutSizingVertical=HUG itemSpacing="{space.md}" {
    fills "{surface.control}"
    TEXT Heading characters=(input)title textStyle="{text.label}"
    INSTANCE Frame component=Panel {
        slot Content {
            each p in=(input)properties key=name {
                guard required { is (p)kind required }
                INSTANCE Row component=PropertyRow {
                    set Name=(p)name Kind=(p)kind
                    when required { set Highlighted=#true }
                    slot Extra {
                        TEXT Note characters=(p)note textStyle="{text.label}"
                    }
                }
            }
        }
    }
}
`;

const inputs = (
  rows: { name: string; kind: string; note: string }[] = [
    { name: 'variant', kind: 'required', note: 'The look.' },
    { name: 'size', kind: 'plain', note: 'How big.' },
  ],
  title = 'Button',
) => ({ title, properties: rows });

const FILE = 'docs.artboard.kdl';

/** A file holding the two components the page makes instances of, and a component to swap to. */
async function library(): Promise<FigmaMockHandle & { rowSetId: string }> {
  const mock = controlMock().withComponent('Mark').withPublishedComponent('abc', 'Published').install();
  const row = await runFile(mock, ROW, {}, 'row.component.kdl');
  await runFile(mock, PANEL, {}, 'panel.component.kdl');
  return Object.assign(mock, { rowSetId: row.setId! });
}

/** The nodes of the artboard, by the address they are stamped with. */
const layersOf = (frame: Node): Map<string, Node> => byAddress(frame);
const frameOf = (mock: FigmaMockHandle, id: string | undefined): Node => {
  assert.ok(id, 'the run reported no frame');
  return mock.node(id) as Node;
};
const propertiesOf = (instance: Node): Record<string, string | boolean> => {
  const out: Record<string, string | boolean> = {};
  for (const [key, property] of Object.entries(instance.componentProperties as Record<string, { value: string | boolean }>))
    out[key.split('#')[0]] = property.value;
  return out;
};
const kinds = (steps: { kind: string }[]) => steps.map((step) => step.kind);
const only = (steps: { kind: string; address?: string }[], kind: string) =>
  steps.filter((step) => step.kind === kind).map((step) => step.address);

describe('an artboard file builds a frame of instances', () => {
  useFigmaMock();

  it('creates one stamped frame on the run’s page, below what is there once the run ends, and says so', async () => {
    beginRun();
    const mock = await library();
    const report = await runFile(mock, PAGE, {}, FILE, inputs());
    await FINISH_COMPONENTS({});
    const frame = frameOf(mock, report.setId);

    assert.equal(report.artboard, true);
    assert.deepEqual(kinds(report.steps), ['CREATE_ARTBOARD']);
    assert.equal(frame.type, 'FRAME');
    assert.equal(frame.name, 'Docs page');
    assert.equal(stampOf(frame)?.is.artboard, 'Docs');
    assert.equal(frame.parent.type, 'PAGE');
    const others = (frame.parent.children as Node[]).filter((node) => node.id !== frame.id);
    assert.ok(others.length > 0 && frame.y > Math.max(...others.map((node) => node.y)), 'below the component set it documents');
    assert.deepEqual(report.created, ['Docs page', 'Heading', 'Frame', 'Row["variant"]', 'Note["variant"]', 'Row["size"]', 'Note["size"]']);
  });

  it('stamps every layer with its address and a receipt of the fields written', async () => {
    const mock = await library();
    const frame = frameOf(mock, (await runFile(mock, PAGE, {}, FILE, inputs())).setId);
    const layers = layersOf(frame);
    assert.deepEqual([...layers.keys()].sort(), [
      'Docs page',
      'Frame',
      'Heading',
      'Note["size"]',
      'Note["variant"]',
      'Row["size"]',
      'Row["variant"]',
    ]);

    const row = stampOf(layers.get('Row["variant"]'))!;
    assert.equal(row.is.address, 'Row["variant"]');
    assert.deepEqual(Object.keys(row.receipt), ['component', 'set Name', 'set Kind', 'set Highlighted']);
    for (const hash of Object.values(row.receipt)) assert.match(hash, /^[0-9a-z]+-[0-9a-z]+$/);
    // Figma shows the name the file wrote; the address carries the key, so the next run finds the row.
    assert.equal(layers.get('Row["variant"]')!.name, 'Row');
    assert.equal(layers.get('Row["size"]')!.name, 'Row');
    // Every node the engine made is stamped, and the nodes an instance holds for its component are not walked.
    const unstamped = walk(frame).filter((node: Node) => node !== frame && node.type !== 'SLOT' && stampOf(node)?.is.address === undefined);
    assert.deepEqual(
      unstamped.map((node: Node) => node.type),
      [],
    );
  });

  it('sets an instance’s properties by display name: a variant, a text, a boolean, and leaves the others as the component has them', async () => {
    const mock = await library();
    const frame = frameOf(mock, (await runFile(mock, PAGE, {}, FILE, inputs())).setId);
    const layers = layersOf(frame);

    assert.deepEqual(propertiesOf(layers.get('Row["variant"]')!), {
      Kind: 'required',
      Name: 'variant',
      Highlighted: true,
      Icon: propertiesOf(layers.get('Row["variant"]')!).Icon,
    });
    const size = propertiesOf(layers.get('Row["size"]')!);
    assert.deepEqual(
      [size.Kind, size.Name, size.Highlighted],
      ['plain', 'size', false],
      'a property the file never mentions keeps the component’s default',
    );
    // The suffixed key is Figma's: setProperties was handed the key the instance reports, never the display name alone.
    const calls = mock.calls('node.setProperties').map((call) => Object.keys(call.args[1] as object));
    assert.ok(
      calls.every((keys) => keys.every((key) => key === 'Kind' || /^[A-Za-z]+#\d+:\d+$/.test(key))),
      JSON.stringify(calls),
    );
  });

  it('fills an instance’s slot with the layers inside it, one slot of the panel and one of each row', async () => {
    const mock = await library();
    const frame = frameOf(mock, (await runFile(mock, PAGE, {}, FILE, inputs())).setId);
    const layers = layersOf(frame);

    const panelSlot = (layers.get('Frame')!.children as Node[]).find((child) => child.type === 'SLOT');
    assert.deepEqual(
      (panelSlot.children as Node[]).map((child) => stampOf(child)?.is.address),
      ['Row["variant"]', 'Row["size"]'],
    );
    for (const key of ['variant', 'size']) {
      const slot = (layers.get(`Row["${key}"]`)!.children as Node[]).find((child) => child.type === 'SLOT' && child.name === 'Extra');
      assert.deepEqual(
        (slot.children as Node[]).map((child) => child.type),
        ['TEXT'],
      );
      assert.equal(slot.children[0].characters, key === 'variant' ? 'The look.' : 'How big.');
    }
  });

  it('swaps a component by name and by key, to the component’s id', async () => {
    const mock = await library();
    const text = `artboard Swaps\nFRAME S {\n    INSTANCE ByName component=PropertyRow {\n        set Icon=Mark\n    }\n    INSTANCE ByKey component=PropertyRow {\n        set Icon=(key)"abc"\n    }\n}\n`;
    const frame = frameOf(mock, (await runFile(mock, text, {}, 'swaps.artboard.kdl')).setId);
    const layers = layersOf(frame);
    const [byName, byKey] = ['ByName', 'ByKey'].map((address) => propertiesOf(layers.get(address)!).Icon as string);
    assert.equal((mock.node(byName) as Node).name, 'Mark');
    assert.notEqual(byKey, byName);
    assert.deepEqual(
      mock.calls('importComponentByKeyAsync').map((call) => call.args[0]),
      ['abc'],
    );
  });
});

describe('a second run changes only the difference', () => {
  useFigmaMock();

  it('with the same inputs, plans nothing and writes nothing', async () => {
    const mock = await library();
    const first = await runFile(mock, PAGE, {}, FILE, inputs());
    const writes = mock.writes().length;
    const again = await runFile(mock, PAGE, {}, FILE, inputs());

    assert.equal(again.setId, first.setId, 'the frame is patched, not rebuilt');
    assert.deepEqual(again.steps, []);
    assert.deepEqual([again.created, again.updated, again.deleted, again.notes, again.breaking, again.warnings], [[], [], [], [], [], []]);
    assert.equal(mock.writes().length, writes);
  });

  it('with one text changed, patches that row’s note and nothing else, and every node keeps its id', async () => {
    const mock = await library();
    const first = await runFile(mock, PAGE, {}, FILE, inputs());
    const ids = new Map([...layersOf(frameOf(mock, first.setId)).entries()].map(([address, node]) => [address, node.id]));

    const changed = inputs([
      { name: 'variant', kind: 'required', note: 'The look.' },
      { name: 'size', kind: 'plain', note: 'How tall.' },
    ]);
    const dry = await runFile(mock, PAGE, { dryRun: true }, FILE, changed);
    assert.deepEqual(
      dry.steps.map((step) => [step.kind, step.address]),
      [['PATCH_LAYER', 'Note["size"]']],
    );

    const report = await runFile(mock, PAGE, {}, FILE, changed);
    assert.deepEqual(report.updated, ['Note["size"]']);
    const layers = layersOf(frameOf(mock, report.setId));
    assert.equal(layers.get('Note["size"]')!.characters, 'How tall.');
    for (const [address, id] of ids) assert.equal(layers.get(address)!.id, id, address);
  });

  it('with a property’s value changed, patches that instance and sets the new value', async () => {
    const mock = await library();
    const first = await runFile(mock, PAGE, {}, FILE, inputs());
    const changed = inputs([
      { name: 'variant', kind: 'plain', note: 'The look.' },
      { name: 'size', kind: 'plain', note: 'How big.' },
    ]);
    const report = await runFile(mock, PAGE, {}, FILE, changed);
    assert.deepEqual(report.updated, ['Row["variant"]']);
    const row = layersOf(frameOf(mock, first.setId)).get('Row["variant"]')!;
    // Required to plain: the variant is switched, and the boolean the `when` set is not set again (the file no longer says it).
    assert.equal(propertiesOf(row).Kind, 'plain');
    assert.match(report.notes.join('\n'), /the file no longer declares "set Highlighted", so its value was left as it is/);
  });

  it('with a row added, creates its layers where the file puts them and moves nothing', async () => {
    const mock = await library();
    const first = await runFile(mock, PAGE, {}, FILE, inputs());
    const before = layersOf(frameOf(mock, first.setId));
    const rows = [
      { name: 'color', kind: 'plain', note: 'Which.' },
      { name: 'variant', kind: 'required', note: 'The look.' },
      { name: 'size', kind: 'plain', note: 'How big.' },
    ];
    const report = await runFile(mock, PAGE, {}, FILE, inputs(rows));
    assert.deepEqual(kinds(report.steps), ['CREATE_LAYER', 'CREATE_LAYER']);
    assert.deepEqual(report.created, ['Row["color"]', 'Note["color"]']);

    const after = layersOf(frameOf(mock, first.setId));
    const slot = (after.get('Frame')!.children as Node[]).find((child) => child.type === 'SLOT');
    assert.deepEqual(
      (slot.children as Node[]).map((child) => stampOf(child)?.is.address),
      ['Row["color"]', 'Row["variant"]', 'Row["size"]'],
    );
    assert.equal(after.get('Row["variant"]')!.id, before.get('Row["variant"]')!.id);
    assert.equal(after.get('Note["color"]')!.characters, 'Which.');
  });

  it('with a row removed, the removal is a breaking step: a real run stops before writing, a dry run lists it, and --allow-breaking takes it', async () => {
    const mock = await library();
    const first = await runFile(mock, PAGE, {}, FILE, inputs());
    const one = inputs([{ name: 'variant', kind: 'required', note: 'The look.' }]);

    const dry = await runFile(mock, PAGE, { dryRun: true }, FILE, one);
    assert.deepEqual(only(dry.steps, 'DELETE_LAYER'), ['Row["size"]', 'Note["size"]']);
    assert.equal(dry.breaking.length, 2);
    assert.match(dry.breaking[0], /artboard "Docs", layer "Row\["size"\]" is no longer in the file: it is removed, with whatever it holds/);

    const writes = mock.writes().length;
    await assert.rejects(
      runFile(mock, PAGE, {}, FILE, one),
      /will not change "Docs": 2 steps would remove layers, and nothing was written; pass allowBreaking to take them\n.*Row\["size"\]/,
    );
    assert.equal(mock.writes().length, writes, 'nothing was written');
    assert.ok(layersOf(frameOf(mock, first.setId)).has('Row["size"]'));

    const report = await runFile(mock, PAGE, { allowBreaking: true }, FILE, one);
    assert.deepEqual(report.deleted, ['Row["size"]', 'Note["size"]']);
    const after = layersOf(frameOf(mock, first.setId));
    assert.equal(after.has('Row["size"]'), false);
    assert.equal(after.has('Row["variant"]'), true);
  });

  it('leaves a layer without our stamp alone, in the frame and in a slot, and says so', async () => {
    const mock = await library();
    const first = await runFile(mock, PAGE, {}, FILE, inputs());
    const layers = layersOf(frameOf(mock, first.setId));
    const stranger = figma.createFrame();
    stranger.name = 'Added by hand';
    layers.get('Docs page')!.appendChild(stranger);
    const slot = (layers.get('Frame')!.children as Node[]).find((child) => child.type === 'SLOT');
    const stranger2 = figma.createFrame();
    stranger2.name = 'Added to a slot';
    slot.appendChild(stranger2);

    const report = await runFile(mock, PAGE, {}, FILE, inputs());
    assert.ok(layers.get('Docs page')!.children.some((child: Node) => child.id === stranger.id));
    assert.ok(slot.children.some((child: Node) => child.id === stranger2.id));
    assert.equal(report.notes.filter((note) => /has no stamp and was left alone/.test(note)).length, 2);
    assert.deepEqual(
      report.steps.filter((step) => step.kind !== 'LEAVE'),
      [],
      'nothing else changed',
    );
  });

  it('finds the frame by its stamp wherever a person moved it, and does not adopt a frame of the same name', async () => {
    const mock = await library();
    const first = await runFile(mock, PAGE, {}, FILE, inputs());
    const frame = frameOf(mock, first.setId);
    frame.name = 'Renamed by a person';
    frame.x = 4000;

    const again = await runFile(mock, PAGE, {}, FILE, inputs());
    assert.equal(again.setId, first.setId);
    assert.deepEqual(again.steps, []);
    assert.equal(frame.x, 4000, 'where it was put');

    // A frame that merely has the name is another thing.
    const lookalike = figma.createFrame();
    lookalike.name = 'Other';
    const other = await runFile(mock, PAGE.replace('artboard Docs', 'artboard Other'), {}, 'other.artboard.kdl', inputs());
    assert.notEqual(other.setId, first.setId);
    assert.equal(stampOf(lookalike), undefined);
  });
});

describe('an artboard on a page, with layers that move and change kind', () => {
  useFigmaMock();

  const two = (holder: string) => `artboard Moves
FRAME M layoutMode=VERTICAL {
    INSTANCE RowA component=PropertyRow {
        ${holder === 'A' ? 'slot Extra {\n            TEXT Note characters="n" textStyle="{text.label}"\n        }' : ''}
    }
    INSTANCE RowB component=PropertyRow {
        ${holder === 'B' ? 'slot Extra {\n            TEXT Note characters="n" textStyle="{text.label}"\n        }' : ''}
    }
}
`;

  it('is built on the page --page names, and the components stay where they were', async () => {
    const mock = controlMock().withPage('Docs').withComponent('Mark').install();
    await runFile(mock, ROW, {}, 'row.component.kdl');
    await runFile(mock, PANEL, {}, 'panel.component.kdl');
    const report = await runFile(mock, PAGE, { page: 'Docs' }, FILE, inputs());
    assert.equal(frameOf(mock, report.setId).parent.name, 'Docs');
    await assert.rejects(
      runFile(mock, PAGE.replace('artboard Docs', 'artboard Elsewhere'), { page: 'Nowhere' }, 'e.artboard.kdl', inputs()),
      /no page named "Nowhere" in this file/,
    );
  });

  it('moves a layer from one instance’s slot to another’s: the same node, and no patch', async () => {
    const mock = await library();
    const first = await runFile(mock, two('A'), {}, 'm.artboard.kdl');
    const note = layersOf(frameOf(mock, first.setId)).get('Note')!;

    const report = await runFile(mock, two('B'), {}, 'm.artboard.kdl');
    assert.deepEqual(
      report.steps.map((step) => [step.kind, step.address]),
      [['MOVE_LAYER', 'Note']],
    );
    const after = layersOf(frameOf(mock, first.setId));
    assert.equal(after.get('Note')!.id, note.id);
    assert.equal(stampOf(after.get('Note')!.parent.parent)?.is.address, 'RowB', 'inside RowB’s slot');
    assert.equal((after.get('RowA')!.children as Node[]).find((child) => child.type === 'SLOT')!.children.length, 0);
  });

  it('replaces an instance by a frame, a breaking step, and makes what was in its slot again inside the frame', async () => {
    const mock = await library();
    const instance = `artboard K\nFRAME K {\n    INSTANCE Box component=Panel {\n        slot Content {\n            TEXT Inner characters="a" textStyle="{text.label}"\n        }\n    }\n}\n`;
    const frame = `artboard K\nFRAME K {\n    FRAME Box layoutMode=VERTICAL {\n        TEXT Inner characters="a" textStyle="{text.label}"\n    }\n}\n`;
    const first = await runFile(mock, instance, {}, 'k.artboard.kdl');
    const inner = layersOf(frameOf(mock, first.setId)).get('Inner')!;

    await assert.rejects(
      runFile(mock, frame, {}, 'k.artboard.kdl'),
      /will not change "K": 1 step would remove layers.*changed from INSTANCE to FRAME/s,
    );
    const report = await runFile(mock, frame, { allowBreaking: true }, 'k.artboard.kdl');
    assert.deepEqual(
      report.steps.map((step) => [step.kind, step.address]),
      [
        ['REPLACE_LAYER', 'Box'],
        ['CREATE_LAYER', 'Inner'],
      ],
    );
    const after = layersOf(frameOf(mock, first.setId));
    assert.equal(after.get('Box')!.type, 'FRAME');
    assert.notEqual(after.get('Inner')!.id, inner.id);
    assert.equal(after.get('Inner')!.parent.id, after.get('Box')!.id);
    assert.ok(!walk(frameOf(mock, first.setId)).some((node: Node) => node.id === inner.id), 'the old text went with the old instance');

    // And back: the frame becomes an instance, and its text goes into the slot.
    const back = await runFile(mock, instance, { allowBreaking: true }, 'k.artboard.kdl');
    assert.deepEqual(
      back.steps.map((step) => step.kind),
      ['REPLACE_LAYER', 'CREATE_LAYER'],
    );
    const slot = (layersOf(frameOf(mock, first.setId)).get('Box')!.children as Node[]).find((child) => child.type === 'SLOT');
    assert.deepEqual(
      (slot.children as Node[]).map((child) => child.type),
      ['TEXT'],
    );
  });

  it('does not import a key in a dry run, and says in a real run when a key is no component', async () => {
    const mock = await library();
    const keyed = (key: string) =>
      `artboard Keys\nFRAME K {\n    INSTANCE Row component=PropertyRow {\n        set Icon=(key)"${key}"\n    }\n}\n`;
    const dry = await runFile(mock, keyed('zzz'), { dryRun: true }, 'k.artboard.kdl');
    assert.deepEqual(kinds(dry.steps), ['CREATE_ARTBOARD']);
    assert.equal(mock.calls('importComponentByKeyAsync').length, 0);
    await assert.rejects(
      runFile(mock, keyed('zzz'), {}, 'k.artboard.kdl'),
      /component key "zzz" \(line 4\) is neither a published component nor a published component set/,
    );
  });
});

describe('a hand edit', () => {
  useFigmaMock();

  it('is drift where the file declares the property: kept and said, and written over with overwriteDrift', async () => {
    const mock = await library();
    const first = await runFile(mock, PAGE, {}, FILE, inputs());
    const row = layersOf(frameOf(mock, first.setId)).get('Row["size"]')!;
    const name = Object.keys(row.componentProperties).find((key) => key.startsWith('Name#'))!;
    row.setProperties({ [name]: 'renamed by hand' });
    const note = layersOf(frameOf(mock, first.setId)).get('Note["size"]')!;
    note.characters = 'typed over';

    const kept = await runFile(mock, PAGE, {}, FILE, inputs());
    assert.deepEqual(kinds(kept.steps), ['LEAVE', 'LEAVE']);
    assert.deepEqual(kept.notes, [
      'artboard "Docs", layer "Row["size"]": "set Name" was changed in Figma since Toghen wrote it, and was left as it is; pass --overwrite-drift to write the file\'s value',
      'artboard "Docs", layer "Note["size"]": "characters" was changed in Figma since Toghen wrote it, and was left as it is; pass --overwrite-drift to write the file\'s value',
    ]);
    assert.equal(propertiesOf(row).Name, 'renamed by hand');
    assert.equal(note.characters, 'typed over');

    const dry = await runFile(mock, PAGE, { dryRun: true, overwriteDrift: true }, FILE, inputs());
    assert.deepEqual(kinds(dry.steps), ['OVERWRITE', 'PATCH_LAYER', 'OVERWRITE', 'PATCH_LAYER']);
    const report = await runFile(mock, PAGE, { overwriteDrift: true }, FILE, inputs());
    assert.deepEqual(report.updated, ['Row["size"]', 'Note["size"]']);
    assert.equal(propertiesOf(row).Name, 'size');
    assert.equal(note.characters, 'How big.');
    assert.equal(report.warnings.length, 2, 'said, as it did it');

    // And once put back, the next run is quiet.
    assert.deepEqual((await runFile(mock, PAGE, {}, FILE, inputs())).steps, []);
  });

  it('agrees once the file asks for what the person typed: no drift, nothing written, and the receipt taken again', async () => {
    const mock = await library();
    const first = await runFile(mock, PAGE, {}, FILE, inputs());
    const note = layersOf(frameOf(mock, first.setId)).get('Note["size"]')!;
    note.characters = 'How tall.';
    const changed = inputs([
      { name: 'variant', kind: 'required', note: 'The look.' },
      { name: 'size', kind: 'plain', note: 'How tall.' },
    ]);
    const writes = mock.writes().filter((call) => call.api === 'node.set' && call.args[1] === 'characters').length;

    const agreed = await runFile(mock, PAGE, {}, FILE, changed);
    assert.deepEqual(agreed.notes, [], 'not drift: Figma holds what the file asks for');
    assert.deepEqual(
      agreed.steps.map((step) => [step.kind, step.address]),
      [['PATCH_LAYER', 'Note["size"]']],
      'a patch that only takes the receipt',
    );
    assert.equal(
      mock.writes().filter((call) => call.api === 'node.set' && call.args[1] === 'characters').length,
      writes,
      'the text is not written',
    );
    assert.equal(note.characters, 'How tall.');

    assert.deepEqual((await runFile(mock, PAGE, {}, FILE, changed)).steps, [], 'and the next run is quiet');
  });

  it('is left alone where the file does not mention the property', async () => {
    const mock = await library();
    const first = await runFile(mock, PAGE, {}, FILE, inputs());
    const row = layersOf(frameOf(mock, first.setId)).get('Row["size"]')!;
    const highlighted = Object.keys(row.componentProperties).find((key) => key.startsWith('Highlighted#'))!;
    row.setProperties({ [highlighted]: true });

    const report = await runFile(mock, PAGE, {}, FILE, inputs());
    assert.deepEqual(report.steps, []);
    assert.deepEqual(report.warnings, []);
    assert.equal(propertiesOf(row).Highlighted, true, 'the designer’s choice stays');
  });
});

describe('an artboard stamped before the stamp', () => {
  useFigmaMock();

  /** What the code before the stamp wrote on an artboard's node: its keys, and for a layer its fields and a digest of what the file declared. */
  function toOldKeys(node: Node): void {
    const stamp = stampOf(node);
    if (!stamp) return;
    node.setSharedPluginData('toghen', 'stamp', '');
    if (stamp.is.artboard !== undefined) node.setSharedPluginData('toghen', 'artboard', stamp.is.artboard);
    if (stamp.is.address !== undefined)
      node.setSharedPluginData(
        'toghen',
        'address',
        JSON.stringify({ address: stamp.is.address, fields: Object.keys(stamp.receipt), digest: 'd1g-35t' }),
      );
    if (stamp.placed) node.setSharedPluginData('toghen', 'placed', JSON.stringify(stamp.placed));
  }

  it('keeps a hand edit as drift, and writes nothing where Figma holds the file’s value', async () => {
    const mock = await library();
    const first = await runFile(mock, PAGE, {}, FILE, inputs());
    const frame = frameOf(mock, first.setId);
    const typed = layersOf(frame).get('Note["size"]')!;
    for (const node of walk(frame) as Node[]) toOldKeys(node);
    typed.characters = 'typed over';

    const migrated = await runFile(mock, PAGE, {}, FILE, inputs());
    assert.equal(migrated.setId, first.setId, 'found by its old keys');
    assert.equal(typed.characters, 'typed over', 'the hand edit is kept');
    assert.deepEqual(migrated.notes, [
      'artboard "Docs", layer "Note["size"]": "characters" was changed in Figma since Toghen wrote it, and was left as it is; pass --overwrite-drift to write the file\'s value',
    ]);

    const again = await runFile(mock, PAGE, {}, FILE, inputs());
    assert.deepEqual(kinds(again.steps), ['LEAVE'], 'every other field was taken as written');
    assert.equal(typed.characters, 'typed over');
  });
});

describe('an artboard run refuses before it writes', () => {
  useFigmaMock();

  const fails = async (text: string, pattern: RegExp, data: Record<string, unknown> = inputs(), options = {}) => {
    const mock = await library();
    const writes = mock.writes().length;
    await assert.rejects(runFile(mock, text, options, FILE, data), pattern);
    assert.equal(mock.writes().length, writes, 'nothing was written');
    return mock;
  };
  const page = (body: string) => `artboard Docs\nFRAME Docs {\n    INSTANCE Row component=PropertyRow {\n        ${body}\n    }\n}\n`;

  it('names a property the component does not have, with its line and the properties it has', async () => {
    await fails(
      page('set Nme="x"'),
      /INSTANCE "Row" \(line 4\): component "PropertyRow" has no property "Nme" \(it has "Kind", "Name", "Highlighted", "Icon", "Extra"\)/,
    );
  });

  it('names a variant value the property does not offer', async () => {
    await fails(
      page('set Kind=wrong'),
      /INSTANCE "Row" \(line 4\): "wrong" is not a value of component "PropertyRow" property "Kind" \("plain", "required"\)/,
    );
  });

  it('names a value of the wrong kind, for each type', async () => {
    await fails(
      page('set Highlighted="yes"'),
      /component "PropertyRow" property "Highlighted" is a BOOLEAN and takes #true or #false, not "yes"/,
    );
    await fails(page('set Name=#true'), /property "Name" is a TEXT and takes text, not true/);
    await fails(page('set Kind=#true'), /property "Kind" is a VARIANT and takes one of its values as text, not true/);
    await fails(page('set Icon=#true'), /property "Icon" is a INSTANCE_SWAP and takes a component name or \(key\)"…", not true/);
  });

  it('names a swap that is no component in the file', async () => {
    await fails(page('set Icon=Nowhere'), /component "Nowhere" \(line 4\) is not in this file/);
  });

  it('refuses a slot as a property, and a property as a slot, and a slot the component lacks', async () => {
    await fails(page('set Extra="x"'), /property "Extra" is a SLOT, which is filled with `slot Extra \{ … \}` and not set/);
    await fails(
      page('slot Name {\n            FRAME F\n        }'),
      /component "PropertyRow" has no slot "Name" \("Name" is a TEXT property\) \(its slots are "Extra"\)/,
    );
    await fails(page('slot Missing'), /INSTANCE "Row" \(line 4\): component "PropertyRow" has no slot "Missing" \(its slots are "Extra"\)/);
  });

  it('refuses a name that two properties share, naming the component and both types', async () => {
    const mock = await library();
    // A component whose author gave a text and a boolean one name: Figma allows what a component file never writes.
    (mock.node(mock.rowSetId) as Node).addComponentProperty('Highlighted', 'TEXT', 'twin');
    await assert.rejects(
      runFile(mock, page('set Highlighted=#true'), {}, FILE, inputs()),
      /component "PropertyRow" has 2 properties named "Highlighted" \((BOOLEAN, TEXT|TEXT, BOOLEAN)\), so the name does not say which to set; rename one of them/,
    );
  });

  it('names a component that is not in the file, and one that is ambiguous, with the line', async () => {
    await fails(`artboard Docs\nFRAME Docs {\n    INSTANCE Row component=Nope\n}\n`, /component "Nope" \(line 3\) is not in this file/);
    const mock = controlMock().withComponent('Twin').withComponent('Twin').install();
    await assert.rejects(
      runFile(mock, `artboard Docs\nFRAME Docs {\n    INSTANCE Row component=Twin\n}\n`, {}, FILE),
      /component "Twin" \(line 3\) is ambiguous, this file has 2 of that name/,
    );
  });

  it('stops on an inputs problem the file reads: a missing input names the line, and nothing is written', async () => {
    const mock = await library();
    const writes = mock.writes().length;
    await assert.rejects(runFile(mock, PAGE, {}, FILE, { properties: [] }), /docs\.artboard\.kdl:5:\d+ .*title/s);
    assert.equal(mock.writes().length, writes);
  });

  it('stops on two frames stamped as one artboard', async () => {
    const mock = await library();
    await runFile(mock, PAGE, {}, FILE, inputs());
    const copy = figma.createFrame();
    copy.setSharedPluginData('toghen', 'artboard', 'Docs');
    await assert.rejects(runFile(mock, PAGE, {}, FILE, inputs()), /more than one frame is stamped as it/);
  });

  it('stops on a file named for one kind that holds the other', async () => {
    const mock = await library();
    await assert.rejects(runFile(mock, PAGE, {}, 'docs.component.kdl', inputs()), /named as a component file, but it holds an artboard/);
    await assert.rejects(runFile(mock, ROW, {}, 'row.artboard.kdl'), /named as an artboard file, but it holds a component/);
  });
});

describe('an artboard sizes an instance', () => {
  useFigmaMock();

  // A component with a variant axis: switching it is what may undo a size written before.
  const BOX = `component Box
properties {
    VARIANT Size small large
}
FRAME Box layoutMode=HORIZONTAL width=(literal)120 height=(literal)40
`;
  const SIZED = `artboard Sized
FRAME Page layoutMode=VERTICAL {
    INSTANCE Card component=Box width=(literal)480 layoutSizingVertical=HUG {
        set Size=(input)size
    }
    INSTANCE Wide component=Box layoutSizingHorizontal=FILL {
        set Size=large
    }
}
`;
  const sized = async () => {
    const mock = controlMock().install();
    await runFile(mock, BOX, {}, 'box.component.kdl');
    return mock;
  };
  /** The calls on one node that write its properties or its sizing, in the order they came. */
  const writesOn = (mock: FigmaMockHandle, id: string) =>
    mock
      .calls()
      .filter(
        (call) =>
          call.args[0] === id &&
          (call.api === 'node.setProperties' ||
            call.api === 'node.resize' ||
            (call.api === 'node.set' && /^(layoutSizing|width|height)/.test(String(call.args[1])))),
      )
      .map((call) => (call.api === 'node.set' ? String(call.args[1]) : call.api));

  it('builds an instance at the width the file states, hugging its height, with the variant it sets', async () => {
    const mock = await sized();
    const frame = frameOf(mock, (await runFile(mock, SIZED, {}, 'sized.artboard.kdl', { size: 'large' })).setId);
    const card = layersOf(frame).get('Card')!;
    assert.equal(propertiesOf(card).Size, 'large');
    assert.equal(card.width, 480);
    assert.equal(card.layoutSizingVertical, 'HUG');
    // The properties first, the sizing after: a variant switch cannot undo the size.
    assert.deepEqual(writesOn(mock, card.id), ['node.setProperties', 'node.resize', 'layoutSizingVertical']);
  });

  it('fills its auto-layout parent when the file says FILL, after its properties', async () => {
    const mock = await sized();
    const frame = frameOf(mock, (await runFile(mock, SIZED, {}, 'sized.artboard.kdl', { size: 'large' })).setId);
    const wide = layersOf(frame).get('Wide')!;
    assert.equal(wide.layoutSizingHorizontal, 'FILL');
    assert.deepEqual(writesOn(mock, wide.id), ['node.setProperties', 'layoutSizingHorizontal']);
  });

  it('writes nothing on a second run', async () => {
    const mock = await sized();
    await runFile(mock, SIZED, {}, 'sized.artboard.kdl', { size: 'large' });
    const writes = mock.writes().length;
    const again = await runFile(mock, SIZED, {}, 'sized.artboard.kdl', { size: 'large' });
    assert.deepEqual(again.steps, []);
    assert.equal(mock.writes().length, writes);
  });

  it('writes the sizing again after a variant switch, so the stated width stays, and the run after writes nothing', async () => {
    const mock = await sized();
    const first = await runFile(mock, SIZED, {}, 'sized.artboard.kdl', { size: 'large' });
    const card = layersOf(frameOf(mock, first.setId)).get('Card')!;
    const before = mock.calls().length;

    const report = await runFile(mock, SIZED, {}, 'sized.artboard.kdl', { size: 'small' });
    assert.deepEqual(
      report.steps.map((step) => [step.kind, step.address]),
      [['PATCH_LAYER', 'Card']],
    );
    assert.equal(propertiesOf(card).Size, 'small');
    assert.equal(card.width, 480);
    assert.equal(card.layoutSizingVertical, 'HUG');
    const after = mock
      .calls()
      .slice(before)
      .filter((call) => call.args[0] === card.id);
    const order = after
      .filter((call) => call.api === 'node.setProperties' || (call.api === 'node.set' && call.args[1] === 'layoutSizingVertical'))
      .map((call) => call.api);
    assert.deepEqual(order, ['node.setProperties', 'node.set'], 'the sizing is written again, after the properties');

    const third = await runFile(mock, SIZED, {}, 'sized.artboard.kdl', { size: 'small' });
    assert.deepEqual(third.steps, []);
  });
});

describe('a component file is built as before', () => {
  useFigmaMock();

  it('still refuses each, set and slot, and builds a component with no artboard word near it', async () => {
    const mock = controlMock().install();
    await assert.rejects(
      runFile(mock, 'component C\nFRAME C {\n    each p in=(input)l key=name {\n        FRAME X\n    }\n}\n'),
      /"each" is not built for component files/,
    );
    const report = await runFile(mock, ROW);
    assert.equal(report.artboard, undefined);
    assert.deepEqual(kinds(report.steps), ['CREATE_SET']);
  });

  it('does not keep an artboard file in the Figma file: its data comes from the command line', async () => {
    resetState();
    const mock = controlMock().install();
    await KEEP_TEMPLATE({ fileName: 'docs.artboard.kdl', text: PAGE });
    const message = mock
      .calls('ui.postMessage')
      .map((call) => call.args[0] as Response)
      .at(-1)!;
    assert.ok(message.type === 'ERROR');
    assert.equal(message.payload.code, 'INVALID_TEMPLATE');
    assert.match(
      message.payload.message,
      /docs\.artboard\.kdl is an artboard file, which needs inputs only the command line gives, so it was not kept/,
    );
    assert.deepEqual(loadTemplates(), []);
  });
});
