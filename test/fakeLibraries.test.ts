/**
 * The fake's libraries against what FigCraft 0.10.0 did on 23 October 2026 (.reference/plans/toghen-figma/plan-2026-10-23-figcraft-libraries.md,
 * 1.1). A FigCraft release that changes one of these is caught when the live run is repeated, and this file says what
 * the fake must change with it. Synthetic names only.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { connect, type Control } from '../cli/figcraft.js';
import { startFakeFigcraft, type FakeFigcraft } from './support/fakeFigcraft.js';

const LIBRARY = '/work/library.figcraft';

describe("the fake's FigCraft libraries", () => {
  let fake: FakeFigcraft;
  let control: Control;
  /** One command, in the tab at `index`. */
  const run = async (index: number, command: string, params: Record<string, unknown> = {}): Promise<any> => {
    const [, result] = (await control.call('engine.execute', {
      command: 'command.batch',
      params: {
        commands: [
          { command: 'doc.switch', params: { index } },
          { command, params },
        ],
      },
    })) as [unknown, unknown];
    return result;
  };
  const refused = async (index: number, command: string, params: Record<string, unknown>): Promise<string> => {
    try {
      await run(index, command, params);
    } catch (error) {
      return (error as Error).message;
    }
    throw new Error(`${command} was not refused`);
  };

  before(async () => {
    fake = await startFakeFigcraft(['library', 'target']);
    control = await connect(fake.port);
    // The library: a collection, a variable, a set of three variants (one bound, all stamped), a component, a style.
    await run(0, 'variable.createCollection', { name: 'lib', modes: ['light', 'dark'] });
    await run(0, 'variable.create', {
      collection: 'VariableCollectionId:1',
      name: 'color/accent',
      type: 'color',
      values: { light: { r: 0.2, g: 0.4, b: 1, a: 1 }, dark: { r: 0.6, g: 0.7, b: 1, a: 1 } },
    });
    for (const tone of ['calm', 'loud', 'quiet']) {
      const { id } = await run(0, 'frame.create', { name: `Tone=${tone}`, width: 80, height: 24 });
      await run(0, 'component.create', { ids: [id] });
      await run(0, 'node.set', { ids: [id], props: { pluginData: { toghen: `member ${tone}` } } });
    }
    const set = await run(0, 'component.combineVariants', { ids: [2, 3, 4] });
    await run(0, 'node.set', { ids: [set.id], props: { name: 'Badge' } });
    await run(0, 'variable.bind', { ids: [2], field: 'fill', variable: 'VariableID:1' });
    const icon = await run(0, 'frame.create', { name: 'Icon', width: 16, height: 16 });
    await run(0, 'component.create', { ids: [icon.id] });
    await run(0, 'style.create', { type: 'text', name: 'text/label', value: { fontFamily: 'Inter', fontStyle: 'Regular', fontSize: 14 } });
  });
  after(async () => {
    control.close();
    await fake.close();
  });

  it('publishes into the file, seen by others once saved, and refuses a file never published', async () => {
    assert.match(await refused(1, 'library.add', { path: '/work/nowhere.figcraft' }), /No such file or directory/);
    const first = await run(0, 'library.publish', {});
    assert.match(first.id, /^[0-9a-f]{16}$/);
    assert.equal(first.version, 1);
    assert.match(await refused(1, 'library.add', { path: LIBRARY }), /No such file/);
    await run(0, 'file.save', { path: LIBRARY });
    const added = await run(1, 'library.add', { path: LIBRARY });
    assert.equal(added.id, first.id);
    assert.deepEqual(
      added.components.map((c: any) => [c.name, c.set]),
      [
        ['Badge', true],
        ['Icon', false],
      ],
    );
    assert.equal((await run(1, 'library.add', { path: LIBRARY })).id, first.id, 'twice is once');
    assert.equal((await run(1, 'library.list', {})).libraries.length, 1);
  });

  it("copies in what is imported: once, on no page, carrying the library's data; a variant is no asset", async () => {
    const { libraries } = await run(1, 'library.list', { assets: true });
    const id = libraries[0].id;
    const byName = (await run(1, 'library.import', { library: id, component: 'Badge' })).component;
    const badge = libraries[0].components.find((c: any) => c.name === 'Badge').id;
    assert.equal(
      (await run(1, 'library.import', { library: LIBRARY, component: badge })).component,
      byName,
      'idempotent, by id and through the path',
    );
    assert.match(await refused(1, 'library.import', { library: id, component: 'Tone=calm' }), /publishes no component "Tone=calm"/);
    const pages = await run(1, 'page.list', {});
    assert.ok(!(fake.tabs[1].pages[0].children ?? []).some((node) => node.id === byName), 'on no page');
    assert.ok(pages.length >= 1);
    const copy = await run(1, 'node.get', { id: byName });
    assert.equal(copy.type, 'COMPONENT_SET');
    const instance = await run(1, 'instance.create', { component: copy.children[0].id });
    assert.equal(
      (await run(1, 'node.get', { id: instance.id })).pluginData.toghen,
      'member calm',
      "an instance carries the library's data",
    );
    // The bound variant brought its variable: prefixed, its collection's mode ids not.
    const variables = await run(1, 'variable.list', {});
    assert.equal(variables.variables[0].id, `${id}:VariableID:1`);
    assert.equal(variables.collections[0].id, `${id}:VariableCollectionId:1`);
    assert.deepEqual(
      variables.collections[0].modes.map((mode: any) => mode.id),
      ['VariableCollectionId:1/mode1', 'VariableCollectionId:1/mode2'],
    );
    assert.equal((await run(1, 'library.importVariable', { library: id, variable: 'color/accent' })).variable, `${id}:VariableID:1`);
    const text = await run(1, 'text.create', { text: 'x' });
    assert.match(await refused(1, 'library.applyStyle', { library: id, style: 'text/label' }), /nothing is selected/);
    assert.equal((await run(1, 'library.applyStyle', { library: id, style: 'text/label', ids: [text.id] })).style, `${id}:S:1`);
    assert.ok((await run(1, 'style.list', {})).some((style: any) => style.id === `${id}:S:1`));
  });

  it('lists a newer version as updates, and accepting keeps copies, matches variants by id, and leaves a remade asset alone', async () => {
    const id = (await run(1, 'library.list', {})).libraries[0].id;
    const setCopy = (await run(1, 'library.import', { library: id, component: 'Badge' })).component;
    const before = await run(1, 'node.get', { id: setCopy });
    const loud = before.children.find((c: any) => c.name === 'Tone=loud').id;
    const quiet = before.children.find((c: any) => c.name === 'Tone=quiet').id;
    const quietInstance = await run(1, 'instance.create', { component: quiet });
    const iconCopy = (await run(1, 'library.import', { library: id, component: 'Icon' })).component;
    // A publish with no change is refused (measured, 0.10.0), and nothing waits.
    assert.match(await refused(0, 'library.publish', {}), /no changes to publish since version 1/);
    assert.equal((await run(1, 'library.updates', {})).count, 0);
    // A value, a variant renamed, one removed, one added; the component deleted and made again.
    await run(0, 'variable.set', { variable: 'VariableID:1', mode: 'light', value: { r: 0, g: 0.8, b: 0.4, a: 1 } });
    await run(0, 'node.set', { ids: [3], props: { name: 'Tone=bold' } });
    await run(0, 'edit.delete', { ids: [4] });
    const added = await run(0, 'frame.create', { name: 'Tone=new', width: 80, height: 24, parent: 5 });
    await run(0, 'component.create', { ids: [added.id] });
    const icon = fake.tabs[0].pages[0].children!.find((node) => node.name === 'Icon')!;
    await run(0, 'edit.delete', { ids: [icon.id] });
    const remade = await run(0, 'frame.create', { name: 'Icon', width: 20, height: 20 });
    await run(0, 'component.create', { ids: [remade.id] });
    await run(0, 'library.publish', {});
    await run(0, 'file.save', { path: LIBRARY });
    const updates = await run(1, 'library.updates', {});
    assert.deepEqual(
      updates.libraries[0].components.map((c: any) => c.name),
      ['Badge'],
      'the remade Icon is no update',
    );
    assert.deepEqual(
      updates.libraries[0].variables.map((v: any) => v.name),
      ['color/accent'],
    );
    await run(1, 'library.acceptUpdates', { ids: [id] });
    const after = await run(1, 'node.get', { id: setCopy });
    assert.equal(after.children.find((c: any) => c.id === loud)?.name, 'Tone=bold', 'renamed in place');
    assert.ok(!after.children.some((c: any) => c.id === quiet), 'removed');
    assert.ok(
      after.children.some((c: any) => c.name === 'Tone=new'),
      'added',
    );
    assert.equal((await run(1, 'node.get', { id: quietInstance.id })).mainComponent, quiet, 'its instance keeps a main that is gone');
    assert.ok(
      fake.tabs[1].copies!.some((copy) => copy.id === iconCopy),
      'the old Icon stays',
    );
    assert.notEqual(
      (await run(1, 'library.import', { library: id, component: 'Icon' })).component,
      iconCopy,
      'an import by name brings the new one beside it',
    );
    const accent = (await run(1, 'variable.list', {})).variables.find((v: any) => v.id === `${id}:VariableID:1`);
    assert.equal(accent.values['VariableCollectionId:1/mode1'].value.g, 0.8);
  });

  it('reports a moved library, and enabling it at its new path keeps the same library and its copies', async () => {
    const id = (await run(1, 'library.list', {})).libraries[0].id;
    const copies = fake.tabs[1].copies!.length;
    fake.disk.set('/work/moved/library.figcraft', fake.disk.get(LIBRARY));
    fake.disk.delete(LIBRARY);
    assert.match((await run(1, 'library.list', {})).libraries[0].error, /No such file/);
    assert.match((await run(1, 'library.updates', {})).errors[0].error, /No such file/);
    assert.match(await refused(1, 'library.import', { library: id, component: 'Badge' }), /No such file/);
    assert.equal((await run(1, 'library.add', { path: '/work/moved/library.figcraft' })).id, id);
    assert.equal((await run(1, 'library.list', {})).libraries.length, 1);
    await run(1, 'library.import', { library: id, component: 'Badge' });
    assert.equal(fake.tabs[1].copies!.length, copies, 'the same copies');
  });
});
