import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, useFigmaMock, type FigmaMockHandle } from '../support/figmaMock.js';
import { run } from '../../main/components/run.js';
import { ComponentRunError } from '../../main/components/errors.js';
import { readComponentFile } from '../../shared/components/index.js';
import type { Desired } from '../../shared/components/index.js';
import { byAddress, controlMock, desiredOf, fixture, keyOfProperty, rgba, shellMock, stampOf, walk } from './support.js';

// The nodes a test reads are the mock's, through the API the engine used.
type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const setOf = (mock: FigmaMockHandle, id: string | undefined): Node => {
  assert.ok(id, 'the run reported no set');
  return mock.node(id);
};

const nameOf = (key: string): string => key.split('#')[0];

describe('a component file builds a component set: the worked example', () => {
  useFigmaMock();

  async function build(configure = (b: ReturnType<typeof shellMock>) => b) {
    const mock = configure(shellMock()).install();
    const report = await run(desiredOf('shell'));
    return { mock, report, set: setOf(mock, report.setId) };
  }

  it('creates one stamped set of seven members, named as Figma names them', async () => {
    const { mock, report, set } = await build();

    assert.equal(report.dryRun, false);
    assert.deepEqual(
      report.steps.map((step) => step.kind),
      ['CREATE_SET'],
    );
    assert.equal(mock.calls('combineAsVariants').length, 1);

    assert.equal(set.type, 'COMPONENT_SET');
    assert.equal(set.name, 'Shell');
    assert.equal(set.description, 'The outer layout of a screen: a header, a nav rail, the content and an aside.');
    assert.deepEqual(
      set.children.map((member: Node) => member.name),
      [
        'Columns=grow fixed, Header in=page',
        'Columns=grow fixed, Header in=content',
        'Columns=fixed grow, Header in=page',
        'Columns=fixed grow, Header in=content',
        'Columns=grow share, Header in=page',
        'Columns=grow share, Header in=content',
        'Columns=single, Header in=page',
      ],
    );
    assert.deepEqual(
      report.created,
      set.children.map((member: Node) => member.name),
    );
    assert.deepEqual(set.variantGroupProperties, {
      Columns: { values: ['grow fixed', 'fixed grow', 'grow share', 'single'] },
      'Header in': { values: ['page', 'content'] },
    });
  });

  it('loads pages one by one, never with loadAllPagesAsync, which use_figma does not support', async () => {
    const { mock } = await build((b) => b.withPage('Other'));
    assert.equal(mock.calls('loadAllPagesAsync').length, 0);
    assert.ok(mock.calls('page.loadAsync').length >= 1);
  });

  it('stamps the set, each member and every layer, with the fields Toghen set', async () => {
    const { set } = await build();
    const desired = desiredOf('shell');

    // One key on each node, the stamp: what the node is, and a receipt of what Toghen owns on it.
    assert.deepEqual(set.getSharedPluginDataKeys('toghen'), ['stamp']);
    assert.deepEqual(stampOf(set)!.is, { component: 'Shell' });
    assert.deepEqual(Object.keys(stampOf(set)!.receipt), ['Show Nav', 'Show Aside', 'Header', 'Nav', 'Content', 'Aside']);

    set.children.forEach((member: Node, index: number) => {
      assert.deepEqual(stampOf(member)!.is, { member: desired.members[index].name, address: 'Shell' });
      const layers = byAddress(member);
      const expected: { address: string; fields: string[] }[] = [];
      const collect = (layer: (typeof desired.members)[number]['tree']) => {
        expected.push({ address: layer.address, fields: Object.keys(layer.fields) });
        layer.children.forEach(collect);
      };
      collect(desired.members[index].tree);

      // Every node the engine made is stamped: as many stamped layers as the member has layers.
      assert.equal(walk(member).length, expected.length);
      assert.equal(layers.size, expected.length);
      for (const { address, fields } of expected) {
        const stamp = stampOf(layers.get(address));
        assert.equal(stamp!.is.address, address);
        assert.deepEqual(Object.keys(stamp!.receipt), fields);
        assert.deepEqual(layers.get(address)!.getSharedPluginDataKeys('toghen'), ['stamp']);
      }
    });
  });

  it('binds every token field to the right variable, and paints through the returned copy', async () => {
    const { mock, set } = await build();
    const variable = (name: string) => mock.variable('Demo', `${name}`)!.id;
    const layers = byAddress(set.children[0]);

    const header = layers.get('Header region')!;
    assert.equal(header.boundVariables.paddingTop.id, variable('space/lg'));
    assert.equal(header.boundVariables.paddingBottom.id, variable('space/md'));
    assert.equal(header.paddingTop, 24, 'a bound variable drives the value');

    const root = layers.get('Shell')!;
    assert.equal(root.fills.length, 1);
    assert.equal(root.fills[0].type, 'SOLID');
    assert.equal(root.fills[0].boundVariables.color.id, variable('surface/page'));
    assert.equal(header.strokes[0].boundVariables.color.id, variable('border/subtle'));

    // The paint that was written is the copy Figma returned, not the one that was passed in.
    assert.ok(mock.calls('setBoundVariableForPaint').length >= 3);
  });

  it('clears the default white fill of a frame the file gives none, and of the slots', async () => {
    const { set } = await build();
    const layers = byAddress(set.children[0]);
    for (const address of ['Header region', 'Body', 'Lanes', 'Main lane', 'Header', 'Nav', 'Content', 'Aside']) {
      assert.deepEqual(layers.get(address)!.fills, [], `${address} keeps no default fill`);
    }
  });

  it('lays out per-side strokes: strokeWeight first, the other sides none, align inside', async () => {
    const { mock, set } = await build();
    const header = byAddress(set.children[0]).get('Header region')!;

    assert.deepEqual([header.strokeTopWeight, header.strokeRightWeight, header.strokeBottomWeight, header.strokeLeftWeight], [0, 0, 1, 0]);
    assert.equal(header.strokeAlign, 'INSIDE');

    const fields = mock
      .calls('node.set')
      .filter((call) => call.args[0] === header.id)
      .map((call) => call.args[1]);
    assert.ok(fields.indexOf('strokeWeight') !== -1 && fields.indexOf('strokeWeight') < fields.indexOf('strokeBottomWeight'));
    assert.ok(fields.indexOf('strokeAlign') < fields.indexOf('strokeBottomWeight'));
  });

  it('places the grid children in their cells, with the tracks the members ask for', async () => {
    const { set } = await build();
    const [fixedDefault, , , , , growShareContent] = set.children as Node[];

    const lanes = byAddress(fixedDefault).get('Lanes')!;
    assert.equal(lanes.layoutMode, 'GRID');
    assert.deepEqual(
      lanes.gridRowSizes.map((t: Node) => [t.type, t.value]),
      [['FLEX', 1]],
    );
    assert.deepEqual(
      lanes.gridColumnSizes.map((t: Node) => t.type),
      ['FLEX', 'HUG'],
    );

    const main = byAddress(fixedDefault).get('Main lane')!;
    const aside = byAddress(fixedDefault).get('Aside region')!;
    assert.deepEqual([main.gridRowAnchorIndex, main.gridColumnAnchorIndex], [0, 0]);
    assert.deepEqual([aside.gridRowAnchorIndex, aside.gridColumnAnchorIndex], [0, 1]);

    // The golden split of the member the rules change.
    const share = byAddress(growShareContent).get('Lanes')!;
    assert.deepEqual(
      share.gridColumnSizes.map((t: Node) => [t.type, t.value]),
      [
        ['FLEX', 1],
        ['FLEX', 1.618],
      ],
    );
  });

  it('builds the moved region under its new parent, in one pass', async () => {
    const { set } = await build();
    const content = set.children[5] as Node; // Columns=grow share, Header in=content
    const layers = byAddress(content);

    assert.deepEqual(
      content.children.map((c: Node) => c.name),
      ['Body'],
    );
    assert.deepEqual(
      layers.get('Main lane')!.children.map((c: Node) => c.name),
      ['Header region', 'Content'],
    );
    assert.equal(layers.get('Aside')!.minWidth, null, 'a cleared size is null, not left at its old value');
  });

  it('makes slots that do not clip, one property each shared by name across the members', async () => {
    const { set } = await build();

    for (const member of set.children as Node[]) {
      const slots = walk(member).filter((node: Node) => node.type === 'SLOT');
      assert.deepEqual(slots.map((slot: Node) => slot.name).sort(), ['Aside', 'Content', 'Header', 'Nav']);
      for (const slot of slots) assert.equal(slot.clipsContent, false);
    }

    const definitions = set.componentPropertyDefinitions as Record<string, { type: string; description?: string }>;
    const slots = Object.entries(definitions).filter(([, definition]) => definition.type === 'SLOT');
    assert.deepEqual(slots.map(([key]) => nameOf(key)).sort(), ['Aside', 'Content', 'Header', 'Nav']);
    assert.equal(definitions[keyOfProperty(set, 'Header', 'SLOT')].description, 'The title and its commands.');
    assert.equal(definitions[keyOfProperty(set, 'Aside', 'SLOT')].description, 'The panel beside the content.');
  });

  it('resizes an empty hugging slot to its minimum and only then sets it back to HUG', async () => {
    const { mock, set } = await build();
    const header = byAddress(set.children[0]).get('Header')!;

    assert.equal(header.layoutSizingVertical, 'HUG', 'a resize after HUG would have reset it');
    assert.equal(header.height, 48);
    const calls = mock.calls().filter((call) => call.args[0] === header.id);
    const resize = calls.findIndex((call) => call.api === 'node.resize');
    const hug = calls.findIndex((call) => call.api === 'node.set' && call.args[1] === 'layoutSizingVertical' && call.args[2] === 'HUG');
    assert.ok(resize !== -1 && resize < hug);
  });

  it('sizes the root from its literals, and lays the members out with the default top-left', async () => {
    const { set } = await build();
    const [defaultMember, headerInContent, , , , , single] = set.children as Node[];

    assert.deepEqual([defaultMember.x, defaultMember.y, defaultMember.width, defaultMember.height], [0, 0, 1440, 900]);
    // Columns are the values of the last axis, rows the other combinations in order.
    assert.equal(headerInContent.x, 1440 + 40);
    assert.equal(headerInContent.y, 0);
    assert.deepEqual([single.x, single.y], [0, (900 + 40) * 3], 'the last row holds the one member of Columns=single');
    assert.equal(set.width, 1440 + 40 + 1440);
    assert.equal(set.height, (900 + 40) * 3 + 900);
  });

  it('wires Show Nav and Show Aside on the members that keep them', async () => {
    const { set } = await build();
    const navKey = keyOfProperty(set, 'Show Nav', 'BOOLEAN');
    const asideKey = keyOfProperty(set, 'Show Aside', 'BOOLEAN');

    for (const member of set.children as Node[]) {
      assert.deepEqual(byAddress(member).get('Nav region')!.componentPropertyReferences, { visible: navKey });
    }
    const [first, , , , , , single] = set.children as Node[];
    assert.deepEqual(byAddress(first).get('Aside region')!.componentPropertyReferences, { visible: asideKey });

    // A patch that replaced the wire left the property alive and wired to nothing in that member.
    const gone = byAddress(single).get('Aside region')!;
    assert.equal(gone.visible, false);
    assert.equal(gone.componentPropertyReferences.visible, undefined);
  });

  it('takes the properties’ defaults as the wired layers’ own values', async () => {
    const { set } = await build();
    const nav = byAddress(set.children[0]).get('Nav region')!;
    assert.equal(nav.visible, true);
    assert.equal(set.componentPropertyDefinitions[keyOfProperty(set, 'Show Nav')].defaultValue, true);
  });

  const propertyRenames = (mock: FigmaMockHandle, set: Node) =>
    mock.calls('node.editComponentProperty').filter((call) => set.children.some((m: Node) => m.id === call.args[0]));

  it('renames each slot’s property itself when renaming the node does not, on every member', async () => {
    const { mock, set } = await build();
    assert.equal(propertyRenames(mock, set).length, 4 * 7);
  });

  it('leaves the property alone when renaming the node renames it', async () => {
    const { mock, set } = await build((b) => b.withSlotRenameFollowingNode());
    assert.equal(propertyRenames(mock, set).length, 0);
    assert.deepEqual(
      Object.entries(set.componentPropertyDefinitions as Record<string, { type: string }>)
        .filter(([, definition]) => definition.type === 'SLOT')
        .map(([key]) => nameOf(key))
        .sort(),
      ['Aside', 'Content', 'Header', 'Nav'],
    );
  });
});

describe('a component file builds a component set: the order of the calls', () => {
  useFigmaMock();

  it('appends a node to its parent before it sets any layout sizing', async () => {
    const mock = shellMock().install();
    const report = await run(desiredOf('shell'));
    const set = setOf(mock, report.setId);
    const memberIds = new Set((set.children as Node[]).map((m) => m.id));

    const calls = mock.calls();
    let checked = 0;
    calls.forEach((call, index) => {
      if (call.api !== 'node.set' || !/^layoutSizing/.test(String(call.args[1]))) return;
      const id = call.args[0] as string;
      if (memberIds.has(id)) return; // a member's root has no parent to be appended to
      checked += 1;
      const appended = calls.findIndex((c) => c.api === 'node.appendChild' && c.args[1] === id);
      assert.ok(appended !== -1 && appended < index, `${id} was sized before it was appended`);
    });
    assert.ok(checked > 20, 'the example sizes many layers');
  });

  it('resizes before it hugs, wherever a layer does both', async () => {
    const mock = shellMock().install();
    await run(desiredOf('shell'));

    const calls = mock.calls();
    const hug = (id: unknown) =>
      calls.findIndex((c) => c.api === 'node.set' && /^layoutSizing/.test(String(c.args[1])) && c.args[0] === id && c.args[2] === 'HUG');
    const resized = calls.filter((c) => c.api === 'node.resize').map((c) => c.args[0]);
    const both = resized.filter((id) => hug(id) !== -1);
    assert.ok(both.length >= 7, 'the empty hugging slot of every member is resized to its minimum, then hugs');
    for (const id of both) {
      const first = calls.findIndex((c) => c.api === 'node.resize' && c.args[0] === id);
      assert.ok(first < hug(id), `${String(id)} was resized after it was set to HUG`);
    }
  });

  it('sets layoutMode before anything that depends on it, and the tracks before the children’s cells', async () => {
    const mock = shellMock().install();
    const report = await run(desiredOf('shell'));
    const lanes = byAddress(setOf(mock, report.setId).children[0]).get('Lanes')!;

    const calls = mock.calls();
    const at = (predicate: (c: (typeof calls)[number]) => boolean) => calls.findIndex(predicate);
    const layout = at((c) => c.api === 'node.set' && c.args[0] === lanes.id && c.args[1] === 'layoutMode');
    const columns = at((c) => c.api === 'node.set' && c.args[0] === lanes.id && c.args[1] === 'gridColumnCount');
    const cell = at((c) => c.api === 'node.setGridChildPosition');
    assert.ok(layout !== -1 && layout < columns && columns < cell);
  });

  it('adds the properties and pins the modes before it combines the members', async () => {
    const mock = controlMock().install();
    await run(desiredOf('control'));

    const combine = mock.calls().findIndex((c) => c.api === 'combineAsVariants');
    const lastBefore = (api: string) =>
      mock
        .calls()
        .map((c, i) => (c.api === api ? i : -1))
        .filter((i) => i !== -1)
        .pop()!;
    assert.ok(lastBefore('node.addComponentProperty') < combine);
    assert.ok(lastBefore('node.setExplicitVariableModeForCollection') < combine);
    assert.ok(lastBefore('createInstance') < combine);
  });

  it('switches page once, before the first node exists, and loads fonts before writing text', async () => {
    const mock = controlMock().install();
    await run(desiredOf('control'));

    assert.equal(mock.calls('setCurrentPageAsync').length, 1);
    assert.ok(mock.callOrder('setCurrentPageAsync', 'createComponent'));
    assert.ok(mock.callOrder('loadFontAsync', 'createText') || mock.calls('loadFontAsync').length >= 3);
    const firstCharacters = mock.calls().findIndex((c) => c.api === 'node.set' && c.args[1] === 'characters');
    const lastFont = mock
      .calls()
      .map((c, i) => (c.api === 'loadFontAsync' ? i : -1))
      .filter((i) => i !== -1)
      .pop()!;
    assert.ok(lastFont < firstCharacters);
  });
});

describe('a component file builds a component set: the control', () => {
  useFigmaMock();

  async function build() {
    const mock = controlMock().install();
    const report = await run(desiredOf('control'));
    return { mock, report, set: setOf(mock, report.setId) };
  }

  it('builds the sparse set, twelve members', async () => {
    const { set } = await build();
    assert.equal(set.children.length, 12);
    assert.ok(!set.children.some((m: Node) => /Variant=outline, State=(hover|pressed)/.test(m.name)));
  });

  it('pins the mode on the members whose rule matched, and on no others', async () => {
    const { mock, set } = await build();
    const scale = mock.collection('Scale')!;
    for (const member of set.children as Node[]) {
      const pinned = /Size=small/.test(member.name);
      assert.deepEqual(member.explicitVariableModes, pinned ? { [scale.id]: scale.modes[1].modeId } : {}, member.name);
    }
  });

  it('wires the TEXT, INSTANCE_SWAP and BOOLEAN properties, with the defaults as the layers’ values', async () => {
    const { set } = await build();
    const layers = byAddress(set.children[0]);
    const labelKey = keyOfProperty(set, 'Label', 'TEXT');
    const iconKey = keyOfProperty(set, 'Icon', 'INSTANCE_SWAP');
    const showKey = keyOfProperty(set, 'Show Icon', 'BOOLEAN');

    assert.deepEqual(layers.get('Caption')!.componentPropertyReferences, { characters: labelKey });
    assert.equal(layers.get('Caption')!.characters, 'Label');
    assert.deepEqual(layers.get('Leading icon')!.componentPropertyReferences, { visible: showKey, mainComponent: iconKey });
  });

  it('makes an instance of the component the property defaults to, and swaps to nothing else', async () => {
    const { mock, set } = await build();
    const glyph = mock.node((set.parent.children as Node[]).find((n: Node) => n.type === 'COMPONENT' && n.name === 'Glyph').id) as Node;
    const instance = byAddress(set.children[0]).get('Leading icon')!;

    assert.equal((await instance.getMainComponentAsync()).id, glyph.id);
    assert.equal(set.componentPropertyDefinitions[keyOfProperty(set, 'Icon')].defaultValue, glyph.id);
  });

  it('applies a text style, then the characters, then the auto-resize', async () => {
    const { mock, set } = await build();
    const [rest] = set.children as Node[];
    const small = (set.children as Node[]).find((m) => m.name === 'Variant=solid, State=rest, Size=small')!;
    const caption = (member: Node) => (walk(member) as Node[]).find((n) => n.name === 'Caption')!;
    assert.equal(caption(rest).textStyleId, mock.styles('TEXT').find((s) => s.name === 'text/label')!.id);
    assert.equal(caption(small).textStyleId, mock.styles('TEXT').find((s) => s.name === 'text/label-small')!.id);

    const calls = mock.calls().filter((c) => c.args[0] === caption(rest).id);
    const at = (api: string, field?: string) => calls.findIndex((c) => c.api === api && (field === undefined || c.args[1] === field));
    // Measured: a text sized while it is empty stays 0 wide, so its characters come before its sizing.
    assert.ok(at('node.setTextStyleIdAsync') < at('node.set', 'characters'));
    assert.ok(at('node.set', 'characters') < at('node.set', 'textAutoResize'));
  });

  it('writes a colour literal as a paint with its alpha in opacity, and a rule’s empty fills as none', async () => {
    const { set } = await build();
    const [rest] = set.children as Node[];
    const root = byAddress(rest).get('Control')!;
    assert.deepEqual(root.strokes, [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 }, opacity: Math.fround(0x80 / 255) }]);

    const outline = (set.children as Node[]).find((m) => m.name === 'Variant=outline, State=rest, Size=medium')!;
    const layers = byAddress(outline).get('Control')!;
    assert.deepEqual(layers.fills, []);
    assert.equal(layers.strokes.length, 1);
    assert.ok(layers.strokes[0].boundVariables.color);
  });

  it('hugs the root, which is itself auto-layout', async () => {
    const { set } = await build();
    const root = (set.children as Node[])[0];
    assert.deepEqual([root.layoutSizingHorizontal, root.layoutSizingVertical], ['HUG', 'HUG']);
    assert.equal(root.minHeight, 44);
  });
});

describe('a component file builds a component set: what stops it', () => {
  useFigmaMock();

  async function refused(mock: FigmaMockHandle, name = 'shell', options = {}) {
    const before = mock.writes().length;
    const error = await run(desiredOf(name), options).then(
      () => assert.fail('the run should have thrown'),
      (thrown: unknown) => thrown,
    );
    assert.ok(error instanceof ComponentRunError, String(error));
    assert.equal(mock.writes().length, before, 'nothing was written');
    return error;
  }

  it('lists every reference that does not resolve, in one error, and writes nothing', async () => {
    const mock = createFigmaMock().withCollection('Demo', ['light']).withVariable('Demo', 'space/md', 'FLOAT', { light: 16 }).install();

    const error = await refused(mock);
    assert.equal(error.problems.length, 3);
    assert.match(error.problems.join('\n'), /token \{surface\.page\} \(line \d+\) names no variable: looked for "surface\/page" in "Demo"/);
    assert.match(error.problems.join('\n'), /token \{border\.subtle\}/);
    assert.match(error.problems.join('\n'), /token \{space\.lg\}/);
    assert.match(error.message, /3 things the file names could not be resolved, and nothing was written/);
  });

  it('refuses a token that matches in two collections, and names both', async () => {
    const mock = createFigmaMock()
      .withCollection('Demo', ['light'])
      .withCollection('Other', ['light'])
      .withVariable('Demo', 'surface/page', 'COLOR', { light: rgba(1, 1, 1) })
      .withVariable('Demo', 'border/subtle', 'COLOR', { light: { r: 1, g: 1, b: 1, a: 1 } })
      .withVariable('Demo', 'space/lg', 'FLOAT', { light: 24 })
      .withVariable('Demo', 'space/md', 'FLOAT', { light: 16 })
      .withVariable('Other', 'space/md', 'FLOAT', { light: 12 })
      .install();

    const error = await refused(mock);
    assert.equal(error.problems.length, 1);
    assert.match(error.problems[0], /token \{space\.md\} \(line \d+\) is ambiguous, it matches Demo: "space\/md"; Other: "space\/md"/);
  });

  it('refuses a variable of the wrong type rather than binding it', async () => {
    const mock = createFigmaMock()
      .withCollection('Demo', ['light'])
      .withVariable('Demo', 'surface/page', 'FLOAT', { light: 1 })
      .withVariable('Demo', 'border/subtle', 'COLOR', { light: { r: 1, g: 1, b: 1, a: 1 } })
      .withVariable('Demo', 'space/lg', 'FLOAT', { light: 24 })
      .withVariable('Demo', 'space/md', 'FLOAT', { light: 16 })
      .install();

    const error = await refused(mock);
    assert.match(error.problems[0], /token \{surface\.page\}.*is a FLOAT variable, but a fill or stroke needs a COLOR one/);
  });

  it('refuses a missing mode, a missing component and a missing text style, all at once', async () => {
    const mock = createFigmaMock()
      .withCollection('Demo', ['light'])
      .withCollection('Scale', ['default', 'large'])
      .withVariable('Demo', 'space/md', 'FLOAT', { light: 16 })
      .withVariable('Demo', 'space/sm', 'FLOAT', { light: 8 })
      .withVariable('Demo', 'radius/md', 'FLOAT', { light: 6 })
      .withVariable('Demo', 'surface/control', 'COLOR', { light: { r: 1, g: 1, b: 1, a: 1 } })
      .withVariable('Demo', 'surface/control-active', 'COLOR', { light: { r: 1, g: 1, b: 1, a: 1 } })
      .withVariable('Demo', 'border/strong', 'COLOR', { light: { r: 1, g: 1, b: 1, a: 1 } })
      .install();

    const error = await refused(mock, 'control');
    const text = error.problems.join('\n');
    assert.match(text, /modes Scale=small \(line \d+\): "Scale" has no mode "small" \(it has "default", "large"\)/);
    assert.match(text, /component "Glyph" \(line \d+\) is not in this file/);
    assert.match(text, /text style \{text\.label\} \(line \d+\) names no text style/);
    assert.match(text, /text style \{text\.label-small\}/);
  });

  it('refuses a preferred value by name, which Figma does not take until measured, by name and line, before any write', async () => {
    const mock = controlMock().install();
    const text = fixture('control').replace(
      'INSTANCE_SWAP Icon default=Glyph',
      'INSTANCE_SWAP Icon default=Glyph {\n        preferred COMPONENT name="Glyph"\n    }',
    );
    const file = readComponentFile(text);
    assert.deepEqual(file.problems, []);
    const before = mock.writes().length;
    const error = await run(JSON.parse(JSON.stringify({ component: file.component, members: file.members })) as Desired, {
      dryRun: true,
    }).then(
      () => assert.fail('the run should have thrown'),
      (thrown: unknown) => thrown as ComponentRunError,
    );
    assert.ok(error instanceof ComponentRunError, String(error));
    assert.deepEqual(error.problems, [
      `"Control": the preferred values of "Icon" by name are not written in Figma until measured in the desktop app; name them by key (line ${text.split('\n').findIndex((line) => line.includes('name="Glyph"')) + 1})`,
    ]);
    assert.equal(mock.writes().length, before, 'nothing was written');
  });

  it('refuses a page that is not in the file', async () => {
    const mock = shellMock().install();
    const error = await refused(mock, 'shell', { page: 'Nowhere' });
    assert.deepEqual(error.problems, ['no page named "Nowhere" in this file']);
  });

  it('refuses a set of the same name that Toghen did not make, and writes nothing', async () => {
    const mock = shellMock().install();
    const lone = figma.createComponent();
    lone.name = 'Tone=calm';
    const foreign = figma.combineAsVariants([lone], figma.currentPage);
    foreign.name = 'Shell';

    const error = await refused(mock);
    assert.match(error.problems[0], new RegExp(`already exists \\(${foreign.id}\\) and Toghen did not make it`));
    assert.match(error.message, /will not build "Shell": nothing was written/);
  });

  it('refuses two sets stamped as one component rather than picking one', async () => {
    const mock = shellMock().install();
    await run(desiredOf('shell'));
    const other = figma.combineAsVariants([figma.createComponent()], figma.currentPage);
    other.setSharedPluginData('toghen', 'component', 'Shell');

    const error = await refused(mock);
    assert.match(error.message, /more than one set is stamped as it/);
  });
});

describe('a component file builds a component set: a dry run, and a page', () => {
  useFigmaMock();

  it('returns the steps and writes nothing', async () => {
    const mock = shellMock().install();
    const report = await run(desiredOf('shell'), { dryRun: true });

    assert.equal(report.dryRun, true);
    assert.deepEqual(
      report.steps.map((step) => step.kind),
      ['CREATE_SET'],
    );
    assert.equal(report.setId, undefined);
    assert.deepEqual(mock.writes(), []);
    assert.equal(
      figma.root.children.reduce((n, page) => n + page.findAllWithCriteria({ types: ['COMPONENT_SET'] }).length, 0),
      0,
    );
  });

  it('still reports what it would refuse, and what does not resolve', async () => {
    shellMock().install();
    const lone = figma.createComponent();
    lone.name = 'Tone=calm';
    figma.combineAsVariants([lone], figma.currentPage).name = 'Shell';
    const dry = await run(desiredOf('shell'), { dryRun: true });
    assert.deepEqual(
      dry.steps.map((step) => step.kind),
      ['REFUSE_FOREIGN'],
    );

    const partial = createFigmaMock().withCollection('Demo', ['light']).install();
    await assert.rejects(run(desiredOf('shell'), { dryRun: true }), /could not be resolved/);
    assert.deepEqual(partial.writes(), []);
  });

  it('builds on the page it is told to, and leaves the plugin on it', async () => {
    const mock = shellMock().withPage('Page 1').withPage('Library').install();
    const report = await run(desiredOf('shell'), { page: 'Library' });
    const set = setOf(mock, report.setId);

    assert.equal(set.parent.name, 'Library');
    assert.equal(mock.currentPageName(), 'Library');
  });
});

describe('a component file builds a component set: published components', () => {
  useFigmaMock();

  const card = (second: string): Desired => {
    const file = readComponentFile(`component Card
properties {
    INSTANCE_SWAP Badge default=(key)"k1"
}
FRAME Card layoutMode=VERTICAL {
    INSTANCE Chip component=(property)Badge
    INSTANCE Divider component=(key)"${second}"
}
`);
    assert.deepEqual(file.problems, []);
    return JSON.parse(JSON.stringify({ component: file.component, members: file.members })) as Desired;
  };

  it('imports a component by its published key, and makes instances and a property default from it', async () => {
    const mock = createFigmaMock().withPublishedComponent('k1', 'Badge').withPublishedComponent('k2', 'Rule').install();
    const report = await run(card('k2'));
    const set = setOf(mock, report.setId);
    const layers = byAddress(set.children[0]);

    assert.equal((await layers.get('Chip')!.getMainComponentAsync()).name, 'Badge');
    assert.equal((await layers.get('Divider')!.getMainComponentAsync()).name, 'Rule');
    assert.deepEqual(
      mock
        .calls('importComponentByKeyAsync')
        .map((c) => c.args[0])
        .sort(),
      ['k1', 'k2'],
    );
  });

  it('does not import in a dry run, since importing writes to the file', async () => {
    const mock = createFigmaMock().withPublishedComponent('k1', 'Badge').withPublishedComponent('k2', 'Rule').install();
    const report = await run(card('k2'), { dryRun: true });

    assert.equal(report.steps[0].kind, 'CREATE_SET');
    assert.deepEqual(mock.writes(), []);
  });

  it('refuses a key that is neither a published component nor a published set', async () => {
    createFigmaMock().withPublishedComponent('k1', 'Badge').install();
    await assert.rejects(
      run(card('unknown')),
      /component key "unknown" \(line \d+\) is neither a published component nor a published component set/,
    );
  });
});
