import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, useFigmaMock, type FigmaMockHandle } from './support/figmaMock.js';

/**
 * The scene graph is the mock, so its failures are what the engine's ordering
 * rules are written against: if one of these stops throwing, a test that "proves"
 * the engine respects it proves nothing. Each case names where the rule comes
 * from: measured, or typed.
 */
describe('the Figma mock’s scene graph', () => {
  useFigmaMock();

  const install = (configure: (b: ReturnType<typeof createFigmaMock>) => ReturnType<typeof createFigmaMock> = (b) => b): FigmaMockHandle =>
    configure(createFigmaMock().withFonts([{ family: 'Inter', style: 'Regular' }])).install();

  describe('sizing (measured)', () => {
    it('refuses FILL and HUG on a node with no auto-layout parent, and accepts them once it has one', () => {
      install();
      const parent = figma.createFrame();
      const child = figma.createFrame();
      parent.appendChild(child);

      assert.throws(() => (child.layoutSizingHorizontal = 'FILL'), /no auto-layout parent/);
      assert.throws(() => (child.layoutSizingVertical = 'HUG'), /no auto-layout parent/);
      child.layoutSizingHorizontal = 'FIXED';

      parent.layoutMode = 'VERTICAL';
      child.layoutSizingHorizontal = 'FILL';
      child.layoutSizingVertical = 'HUG';
      assert.equal(child.layoutSizingHorizontal, 'FILL');
    });

    it('refuses FILL on a node that has no parent at all', () => {
      install();
      const orphan = figma.createFrame();
      orphan.layoutMode = 'VERTICAL';
      assert.throws(() => (orphan.layoutSizingHorizontal = 'FILL'), /no auto-layout parent/);
    });

    it('lets resize() reset hug sizing', () => {
      install();
      const frame = figma.createFrame();
      frame.layoutMode = 'VERTICAL';
      frame.layoutSizingVertical = 'HUG';
      assert.equal(frame.layoutSizingVertical, 'HUG');

      frame.resize(200, 48);
      assert.equal(frame.layoutSizingVertical, 'FIXED');
      assert.equal(frame.height, 48);
    });

    it('starts a frame with one white solid fill and a slot clipping its content', () => {
      install();
      const frame = figma.createFrame();
      const fills = frame.fills as readonly Paint[];
      assert.equal(fills.length, 1);
      assert.deepEqual((fills[0] as SolidPaint).color, { r: 1, g: 1, b: 1 });

      const component = figma.createComponent();
      assert.equal(component.createSlot().clipsContent, true);
    });

    it('takes per-side stroke weights only after strokeWeight', () => {
      install();
      const frame = figma.createFrame();
      assert.throws(() => (frame.strokeBottomWeight = 2), /set strokeWeight before the per-side weights/);
      frame.strokeWeight = 0;
      frame.strokeBottomWeight = 2;
      assert.deepEqual([frame.strokeTopWeight, frame.strokeBottomWeight], [0, 2]);
    });
  });

  describe('grids and slots (typed)', () => {
    it('refuses a grid layout on a slot', () => {
      install();
      const slot = figma.createComponent().createSlot();
      assert.throws(() => (slot.layoutMode = 'GRID'), /cannotApplyGridToSlot/);
    });

    it('refuses tracks on a frame that is not a grid, and a cell outside or already taken', () => {
      install();
      const grid = figma.createFrame();
      assert.throws(() => (grid.gridRowCount = 2), /only a frame with layoutMode GRID has tracks/);

      grid.layoutMode = 'GRID';
      grid.gridRowCount = 2;
      grid.gridColumnCount = 2;
      grid.gridRowSizes[0].type = 'FIXED';
      grid.gridRowSizes[0].value = 24;
      assert.deepEqual(grid.gridRowSizes[0], { type: 'FIXED', value: 24 });

      const a = figma.createFrame();
      const b = figma.createFrame();
      grid.appendChild(a);
      grid.appendChild(b);
      a.setGridChildPosition(1, 1);
      assert.throws(() => b.setGridChildPosition(1, 1), /occupied/);
      assert.throws(() => b.setGridChildPosition(2, 0), /outside the grid/);
      b.setGridChildPosition(0, 1);
      assert.deepEqual([b.gridRowAnchorIndex, b.gridColumnAnchorIndex], [0, 1]);
    });
  });

  describe('variants and properties', () => {
    it('combines components and nothing else', () => {
      install();
      const component = figma.createComponent();
      assert.throws(
        () => figma.combineAsVariants([figma.createFrame() as unknown as ComponentNode], figma.currentPage),
        /is not a component/,
      );
      assert.throws(() => figma.combineAsVariants([], figma.currentPage), /non-empty/);
      const set = figma.combineAsVariants([component], figma.currentPage);
      assert.equal(set.type, 'COMPONENT_SET');
      assert.equal(component.parent?.id, set.id);
    });

    it('throws when a variant member’s componentPropertyDefinitions is read, and answers on the set', () => {
      install();
      const a = figma.createComponent();
      a.name = 'Size=small';
      const b = figma.createComponent();
      b.name = 'Size=large';
      a.addComponentProperty('Show Icon', 'BOOLEAN', true);
      const set = figma.combineAsVariants([a, b], figma.currentPage);

      assert.throws(() => a.componentPropertyDefinitions, /component set or non-variant component/);
      const definitions = set.componentPropertyDefinitions;
      assert.deepEqual(definitions.Size, { type: 'VARIANT', defaultValue: 'small', variantOptions: ['small', 'large'] });
      assert.ok(Object.keys(definitions).some((key) => key.startsWith('Show Icon#')));
    });

    it('renames a BOOLEAN that shares a slot’s name, silently, with a 2 suffix', () => {
      install();
      const component = figma.createComponent();
      const slot = component.createSlot();
      slot.name = 'Nav';
      component.editComponentProperty(Object.keys(component.componentPropertyDefinitions)[0], { name: 'Nav' });

      const key = component.addComponentProperty('Nav', 'BOOLEAN', true);
      assert.match(key, /^Nav2#/);
    });

    it('merges same-named properties across members and repoints their references', () => {
      install();
      const members = ['Tone=calm', 'Tone=loud'].map((name) => {
        const component = figma.createComponent();
        component.name = name;
        const key = component.addComponentProperty('Show Icon', 'BOOLEAN', true);
        const icon = figma.createFrame();
        component.appendChild(icon);
        icon.componentPropertyReferences = { visible: key };
        return { component, icon };
      });
      const set = figma.combineAsVariants(
        members.map((m) => m.component),
        figma.currentPage,
      );

      const keys = Object.keys(set.componentPropertyDefinitions).filter((key) => key.startsWith('Show Icon#'));
      assert.equal(keys.length, 1);
      for (const { icon } of members) assert.equal(icon.componentPropertyReferences?.visible, keys[0]);
    });

    it('lets only a sublayer of a component reference a property of the right type', () => {
      install();
      const component = figma.createComponent();
      const key = component.addComponentProperty('Show Icon', 'BOOLEAN', true);
      const loose = figma.createFrame();
      assert.throws(() => (loose.componentPropertyReferences = { visible: key }), /only a sublayer of a component/);
      assert.throws(() => (component.componentPropertyReferences = { visible: key }), /only a sublayer of a component/);

      const inside = figma.createFrame();
      component.appendChild(inside);
      assert.throws(() => (inside.componentPropertyReferences = { characters: key }), /characters takes a TEXT property/);
      inside.componentPropertyReferences = { visible: key };
      assert.deepEqual(inside.componentPropertyReferences, { visible: key });
    });

    it('restricts which edits each property type takes (typed)', () => {
      install();
      const component = figma.createComponent();
      const text = component.addComponentProperty('Label', 'TEXT', 'x');
      assert.throws(() => component.editComponentProperty(text, { description: 'd' }), /only supported for SLOT/);
      assert.throws(() => component.editComponentProperty(text, { preferredValues: [] }), /only supported for INSTANCE_SWAP and SLOT/);
      assert.throws(() => component.addComponentProperty('Flag', 'BOOLEAN', 'not a boolean' as unknown as boolean), /Expected boolean/);
      component.editComponentProperty(text, { defaultValue: 'y' });
      assert.equal(component.componentPropertyDefinitions[text].defaultValue, 'y');
    });

    it('picks the top-left member as the default variant', () => {
      install();
      const a = figma.createComponent();
      a.name = 'Size=small';
      const b = figma.createComponent();
      b.name = 'Size=large';
      a.x = 300;
      const set = figma.combineAsVariants([a, b], figma.currentPage);
      assert.equal(set.defaultVariant.id, b.id);
    });
  });

  describe('variables and paints (measured and typed)', () => {
    it('returns a new paint from setBoundVariableForPaint and leaves its argument alone', () => {
      const mock = createFigmaMock()
        .withCollection('Demo', ['light'])
        .withVariable('Demo', 'surface/page', 'COLOR', { light: { r: 1, g: 0.5, b: 0, a: 1 } })
        .install();
      const variable = mock.variable('Demo', 'surface/page')!;
      const paint: SolidPaint = { type: 'SOLID', color: { r: 0, g: 0, b: 0 } };

      const bound = figma.variables.setBoundVariableForPaint(paint, 'color', variable as unknown as Variable);
      assert.notEqual(bound, paint);
      assert.equal(paint.boundVariables, undefined);
      assert.equal(bound.boundVariables?.color?.id, variable.id);
    });

    it('binds a FLOAT variable to a dimension field, drives its value, and refuses the wrong type', () => {
      const mock = createFigmaMock()
        .withCollection('Demo', ['light'])
        .withVariable('Demo', 'space/md', 'FLOAT', { light: 16 })
        .withVariable('Demo', 'surface/page', 'COLOR', { light: { r: 1, g: 1, b: 1, a: 1 } })
        .install();
      const frame = figma.createFrame();

      frame.setBoundVariable('paddingTop', mock.variable('Demo', 'space/md') as unknown as Variable);
      assert.equal(frame.paddingTop, 16);
      assert.equal(frame.boundVariables?.paddingTop?.id, mock.variable('Demo', 'space/md')!.id);
      assert.throws(
        () => frame.setBoundVariable('paddingTop', mock.variable('Demo', 'surface/page') as unknown as Variable),
        /takes a FLOAT variable, not a COLOR/,
      );
    });

    it('pins a mode of a real collection and refuses a mode it does not have', () => {
      const mock = createFigmaMock().withCollection('Scale', ['default', 'small']).install();
      const collection = mock.collection('Scale')!;
      const frame = figma.createFrame();

      frame.setExplicitVariableModeForCollection(collection as unknown as VariableCollection, collection.modes[1].modeId);
      assert.deepEqual(frame.explicitVariableModes, { [collection.id]: collection.modes[1].modeId });
      assert.throws(
        () => frame.setExplicitVariableModeForCollection(collection as unknown as VariableCollection, 'nope'),
        /is not in collection Scale/,
      );
    });
  });

  describe('text (measured)', () => {
    it('refuses characters until the font is loaded', async () => {
      install();
      const text = figma.createText();
      assert.throws(() => (text.characters = 'Hi'), /unloaded font "Inter Regular"/);
      await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
      text.characters = 'Hi';
      assert.equal(text.characters, 'Hi');
    });
  });

  describe('plugin data and search', () => {
    it('holds shared plugin data on a node under the namespace and size rules the root enforces', () => {
      install();
      const frame = figma.createFrame();
      frame.setSharedPluginData('toghen', 'address', '{"a":1}');
      assert.equal(frame.getSharedPluginData('toghen', 'address'), '{"a":1}');
      assert.deepEqual(frame.getSharedPluginDataKeys('toghen'), ['address']);
      assert.throws(() => frame.setSharedPluginData('ab', 'k', 'v'), /at least 3 alphanumeric/);
      assert.throws(() => frame.setSharedPluginData('toghen', 'k', 'x'.repeat(100 * 1024)), /over the 102400 byte limit/);
      frame.setSharedPluginData('toghen', 'address', '');
      assert.deepEqual(frame.getSharedPluginDataKeys('toghen'), []);
    });

    it('finds nodes by type and by shared plugin data, on a loaded page, and on the document only after loadAllPagesAsync()', async () => {
      install((b) => b.withPage('Page 1').withPage('Other'));
      const stamped = figma.createComponent();
      stamped.setSharedPluginData('toghen', 'member', 'x');
      figma.createComponent();
      figma.createFrame().setSharedPluginData('toghen', 'other', 'y');

      assert.throws(() => figma.root.findAllWithCriteria({ types: ['COMPONENT'] }), /loadAllPagesAsync\(\) first/);
      // Loading every page opens each page to a search, not the document (measured in the plugin, 2026-10-08).
      for (const page of figma.root.children) await page.loadAsync();
      assert.throws(() => figma.root.findAllWithCriteria({ types: ['COMPONENT'] }), /loadAllPagesAsync\(\) first/);
      assert.equal(
        figma.root.children.reduce((n, page) => n + page.findAllWithCriteria({ types: ['COMPONENT'] }).length, 0),
        2,
      );
      await figma.loadAllPagesAsync();

      assert.equal(figma.root.findAllWithCriteria({ types: ['COMPONENT'] }).length, 2);
      assert.deepEqual(
        figma.root
          .findAllWithCriteria({ types: ['COMPONENT', 'FRAME'], sharedPluginData: { namespace: 'toghen', keys: ['member'] } })
          .map((n) => n.id),
        [stamped.id],
      );
      assert.equal(figma.root.findAllWithCriteria({ sharedPluginData: { namespace: 'toghen' } }).length, 2);
    });

    it('moves the current page and puts new nodes on it', async () => {
      const mock = createFigmaMock().withPage('Page 1').withPage('Library').install();
      const library = figma.root.children.find((p) => p.name === 'Library')!;
      await figma.setCurrentPageAsync(library);

      const frame = figma.createFrame();
      assert.equal(frame.parent?.id, library.id);
      assert.equal(mock.currentPageName(), 'Library');
    });
  });

  describe('the mock’s own charter', () => {
    it('throws by name for a member it does not have, and for one another kind of node has', () => {
      install();
      const frame = figma.createFrame();
      assert.throws(
        () => (frame as unknown as Record<string, unknown>).isMask,
        /node\(FRAME\)\.isMask is not implemented in the Figma mock/,
      );
      assert.throws(() => (frame as unknown as { characters: string }).characters, /does not exist: it is not a member of FRAME nodes/);
      assert.throws(() => ((frame as unknown as Record<string, unknown>).nonsense = 1), /no setter for property nonsense/);
    });

    it('imports only what a library published, and reads mainComponent write-only under dynamic-page access', async () => {
      createFigmaMock().withPublishedComponent('abc123', 'Published').install();
      const imported = await figma.importComponentByKeyAsync('abc123');
      assert.equal(imported.name, 'Published');
      await assert.rejects(figma.importComponentByKeyAsync('nope'), /Component with key "nope" not found/);

      const instance = imported.createInstance();
      assert.throws(() => instance.mainComponent, /getMainComponentAsync/);
      assert.equal((await instance.getMainComponentAsync())?.id, imported.id);
    });
  });
});
