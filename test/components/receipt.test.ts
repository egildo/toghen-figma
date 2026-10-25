import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, useFigmaMock } from '../support/figmaMock.js';
import { oneFile } from '../support/oneFile.js';
import { run } from '../../main/components/run.js';
import { LOAD_DOCUMENT } from '../../main/handlers/loadDocument.js';
import { resetState } from '../../main/runtimeState.js';
import { fieldNames, hashOf } from '../../shared/components/diff.js';
import type { Step } from '../../shared/components/steps.js';
import { byAddress, desiredFromText, runFile, stampOf, walk } from './support.js';

// The nodes a test reads are the mock's, through the API the engine used.
type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const SWATCH = (colour = '#336699cc') => `component Swatch
properties {
    VARIANT Tone calm loud
}
FRAME Swatch layoutMode=VERTICAL opacity=(literal)0.4 itemSpacing="{space.sm}" {
    fills (literal)"${colour}"
    FRAME Chip layoutMode=HORIZONTAL paddingTop="{space.sm}" cornerRadius=(literal)4 topLeftRadius=(literal)8
}
`;

const swatchMock = () =>
  createFigmaMock().withCollection('Demo', ['light']).withVariable('Demo', 'space/sm', 'FLOAT', { light: 8 }).install();

const patches = (steps: Step[]) =>
  steps.flatMap((step) => (step.kind === 'PATCH_LAYER' ? [[step.member, step.layer.address, step.fields]] : []));

/** What the code before the stamp wrote on a node: six keys, and for a layer the names of its fields with no hash. */
function toOldKeys(node: Node): void {
  const stamp = stampOf(node);
  if (!stamp) return;
  node.setSharedPluginData('toghen', 'stamp', '');
  if (stamp.is.component !== undefined) {
    node.setSharedPluginData('toghen', 'component', stamp.is.component);
    node.setSharedPluginData('toghen', 'properties', JSON.stringify(Object.keys(stamp.receipt)));
  }
  if (stamp.is.member !== undefined) node.setSharedPluginData('toghen', 'member', stamp.is.member);
  if (stamp.is.address !== undefined)
    node.setSharedPluginData('toghen', 'address', JSON.stringify({ address: stamp.is.address, fields: Object.keys(stamp.receipt) }));
  if (stamp.placed) node.setSharedPluginData('toghen', 'placed', JSON.stringify(stamp.placed));
}

describe('a receipt: what Figma reported, compared exactly', () => {
  useFigmaMock();

  it('reads a colour and an opacity Figma keeps as float32 as unchanged, and writes only the field the file moved', async () => {
    const mock = swatchMock();
    const first = await run(desiredFromText(SWATCH()));
    const set = mock.node(first.setId!) as Node;

    // Figma keeps a colour channel and an opacity as float32: 0.4 reads back as 0.4000000059604645.
    for (const member of set.children as Node[]) {
      member.fills = member.fills.map((paint: Node) => ({
        ...paint,
        color: { r: Math.fround(paint.color.r), g: Math.fround(paint.color.g), b: Math.fround(paint.color.b) },
        opacity: Math.fround(paint.opacity),
      }));
      member.opacity = Math.fround(0.4);
    }
    assert.notEqual(Math.fround(0.4), 0.4);
    assert.deepEqual(patches((await run(desiredFromText(SWATCH()))).steps), [], 'nothing moved, in the file or in Figma');

    const moved = await run(desiredFromText(SWATCH('#336699ff')));
    assert.deepEqual(patches(moved.steps), [
      ['Tone=calm', 'Swatch', ['fills']],
      ['Tone=loud', 'Swatch', ['fills']],
    ]);
    assert.equal(set.children[0].fills[0].opacity, 1);
    assert.equal(set.children[0].opacity, Math.fround(0.4), 'a field the file did not move is not written');
  });

  it('writes the corners again after the radius that resets them, and reads them as unchanged after', async () => {
    const mock = swatchMock();
    const first = await run(desiredFromText(SWATCH()));
    const chip = walk((mock.node(first.setId!) as Node).children[0]).find((node: Node) => node.name === 'Chip');

    const moved = await run(desiredFromText(SWATCH().replace('cornerRadius=(literal)4', 'cornerRadius=(literal)6')));
    assert.deepEqual(patches(moved.steps)[0], ['Tone=calm', 'Chip', ['cornerRadius']]);
    assert.deepEqual([chip.cornerRadius, chip.topLeftRadius, chip.topRightRadius], [6, 8, 6]);
    assert.deepEqual(
      patches((await run(desiredFromText(SWATCH().replace('cornerRadius=(literal)4', 'cornerRadius=(literal)6')))).steps),
      [],
    );
  });
});

/** A radius and a stroke weight bound to tokens: Figma reports each binding on its parts (corners, sides), not under the field. */
const BADGE = `component Badge
properties {
    VARIANT Tone calm loud
}
FRAME Badge layoutMode=HORIZONTAL cornerRadius="{radius.md}" strokeWeight="{stroke.thin}" {
    strokes (literal)"#336699"
}
`;

const badgeMock = () =>
  createFigmaMock()
    .withCollection('Demo', ['light'])
    .withVariable('Demo', 'radius/md', 'FLOAT', { light: 7 })
    .withVariable('Demo', 'stroke/thin', 'FLOAT', { light: 1 })
    .install();

describe('a receipt of a field Figma binds by its parts', () => {
  useFigmaMock();

  it('reads a bound radius and stroke weight as bound, so a second run writes nothing', async () => {
    const mock = badgeMock();
    const first = await run(desiredFromText(BADGE));
    const root = (mock.node(first.setId!) as Node).children[0];
    assert.equal(root.boundVariables.cornerRadius, undefined, 'the real shape: no key for the field itself');
    assert.equal(root.cornerRadius, 7, 'and the field reads as the resolved number');

    const second = await run(desiredFromText(BADGE));
    assert.deepEqual(patches(second.steps), []);
    assert.deepEqual(second.notes, []);
  });

  it('does not read a change of the variable’s value as drift', async () => {
    const mock = badgeMock();
    const first = await run(desiredFromText(BADGE));
    const radius = mock.variable('Demo', 'radius/md')!;
    radius.valuesByMode[Object.keys(radius.valuesByMode)[0]] = 9;
    // What Figma shows once the variable resolves to its new value; the corners stay bound.
    for (const member of (mock.node(first.setId!) as Node).children) member.cornerRadius = 9;

    const after = await run(desiredFromText(BADGE));
    assert.deepEqual(patches(after.steps), []);
    assert.ok(!after.steps.some((step) => step.kind === 'LEAVE' && step.what === 'drift'), 'not a hand edit');
  });

  it('reads a corner bound by hand to another variable as drift', async () => {
    const mock = badgeMock();
    const first = await run(desiredFromText(BADGE));
    const other = mock.variable('Demo', 'stroke/thin')!;
    (mock.node(first.setId!) as Node).children[0].setBoundVariable('topLeftRadius', other);

    const after = await run(desiredFromText(BADGE));
    assert.ok(after.steps.some((step) => step.kind === 'LEAVE' && step.what === 'drift' && /cornerRadius/.test(step.message)));
  });
});

describe('a node stamped before the stamp', () => {
  useFigmaMock();

  it('is read from its old keys, has every field written once, and is stamped in the new form with its old keys gone', async () => {
    const mock = swatchMock();
    const first = await run(desiredFromText(SWATCH()));
    const set = mock.node(first.setId!) as Node;
    const nodes = walk(set) as Node[];
    const ids = nodes.map((node) => node.id);
    for (const node of nodes) toOldKeys(node);
    assert.deepEqual(set.getSharedPluginDataKeys('toghen').sort(), ['component', 'properties']);

    const migrated = await run(desiredFromText(SWATCH()));
    assert.equal(migrated.setId, first.setId, 'found by its old keys: not foreign, not built again');
    assert.deepEqual([migrated.created, migrated.deleted, migrated.breaking], [[], [], []]);
    assert.deepEqual(
      walk(set).map((node: Node) => node.id),
      ids,
      'every node kept',
    );
    // The old record named the fields and held no hash of them: each is written, as before receipts.
    const desired = desiredFromText(SWATCH());
    const swatch = desired.members[0].tree;
    assert.deepEqual(patches(migrated.steps).slice(0, 2), [
      ['Tone=calm', 'Swatch', fieldNames(swatch)],
      ['Tone=calm', 'Chip', fieldNames(swatch.children[0])],
    ]);

    for (const node of walk(set) as Node[]) {
      assert.deepEqual(node.getSharedPluginDataKeys('toghen'), ['stamp'], `${node.name}: the old keys are deleted`);
      assert.ok(
        Object.values(stampOf(node)!.receipt).every((hash) => hash !== ''),
        `${node.name}: every field has its hash`,
      );
    }
    assert.deepEqual(stampOf(set)!.is, { component: 'Swatch' });
    assert.deepEqual(stampOf(set.children[1])!.is, { member: 'Tone=loud', address: 'Swatch' });

    assert.deepEqual(patches((await run(desiredFromText(SWATCH()))).steps), [], 'and the next run reads it as any other');
  });
});

describe('a receipt of a paint bound to a colour', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  // A colour half transparent at the defaults and a quarter in the dark scheme, in the W3C structured shape.
  const DOCUMENT = {
    version: '2025-11-01',
    name: 'Core',
    sets: {
      base: { sources: [{ tone: { dot: { $type: 'color', $value: { colorSpace: 'srgb', components: [0.2, 0.4, 0.6], alpha: 0.5 } } } }] },
    },
    modifiers: {
      scheme: {
        default: 'light',
        contexts: { light: [{}], dark: [{ tone: { dot: { $value: { colorSpace: 'srgb', components: [0.2, 0.4, 0.6], alpha: 0.25 } } } }] },
      },
    },
    resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/scheme' }],
  };
  const DOT = 'component Dot\nFRAME Dot width=(literal)8 height=(literal)8 {\n    fills "{tone.dot}"\n}\n';
  const setUp = async () => {
    const mock = createFigmaMock()
      .withCollection('Core', ['light', 'dark'])
      .withVariable('Core', 'tone/dot', 'COLOR', { light: { r: 0.2, g: 0.4, b: 0.6, a: 0.5 }, dark: { r: 0.2, g: 0.4, b: 0.6, a: 0.25 } })
      .install();
    await LOAD_DOCUMENT(oneFile(JSON.stringify(DOCUMENT), 'core.resolver.json'));
    const first = await runFile(mock, DOT);
    const dot = byAddress((mock.node(first.setId!) as Node).children[0]).get('Dot')!;
    return { mock, dot, variable: mock.variable('Core', 'tone/dot')!.id };
  };
  const binds = (mock: { calls(api: string): ReadonlyArray<unknown> }) => mock.calls('setBoundVariableForPaint').length;

  it('holds the variable only, though the paint is written with the alpha at the defaults as its opacity', async () => {
    const { dot, variable } = await setUp();
    assert.equal(dot.fills[0].opacity, 0.5);
    assert.equal(stampOf(dot)!.receipt.fills, hashOf([{ variable }]));
  });

  it('restamps, and does not write, a paint whose receipt holds the opacity the code before 8a compared', async () => {
    const { mock, dot, variable } = await setUp();
    const stamp = stampOf(dot)!;
    stamp.receipt.fills = hashOf([{ variable, opacity: Math.fround(0.5) }]);
    dot.setSharedPluginData('toghen', 'stamp', JSON.stringify(stamp));

    const before = binds(mock);
    const again = await runFile(mock, DOT);
    assert.equal(binds(mock), before, 'no paint written');
    assert.ok(!again.steps.some((step) => step.kind === 'LEAVE'), 'no drift said');
    assert.equal(stampOf(dot)!.receipt.fills, hashOf([{ variable }]));
  });

  it('takes an opacity the paint shows in another mode for no change: a pinned mode is not drift', async () => {
    const { mock, dot } = await setUp();
    // What a target that paints the variable's alpha in the layer's mode reports for a layer in the dark scheme.
    dot.fills = [{ ...dot.fills[0], opacity: 0.25 }];
    const before = binds(mock);
    const again = await runFile(mock, DOT);
    assert.equal(binds(mock), before);
    assert.ok(!again.steps.some((step) => step.kind === 'LEAVE' || step.kind === 'PATCH_LAYER'), 'nothing written or said');
  });
});
