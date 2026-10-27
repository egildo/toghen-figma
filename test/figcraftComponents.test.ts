/**
 * Component and artboard files into FigCraft: `sync … --figcraft <port>`, against the fake of FigCraft's control socket.
 *
 * The run is the plugin's own: it reads the file's layers through the FigCraft view (`cli/figcraftScene.ts`) and writes
 * through FigCraft's commands (`cli/figcraftApply.ts`). Synthetic files on the sample design system (W3C structured
 * colours and dimensions): a component with no axes, a component with a variant axis, a text and a boolean property and
 * an instance of the first, and an artboard of an instance on a pinned theme.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main, type Io } from '../cli/main.js';
import { noWrites, sceneOf, type FcNode } from '../cli/figcraftScene.js';
import { hashOf } from '../shared/components/diff.js';
import { startFakeFigcraft, type FakeFigcraft, type Layer } from './support/fakeFigcraft.js';

const here = dirname(fileURLToPath(import.meta.url));
const FILES = ['fixtures/figcraft/icon.component.kdl', 'fixtures/figcraft/button.component.kdl', 'fixtures/figcraft/showcase.artboard.kdl'];

async function sync(fake: FakeFigcraft, flags: string[] = [], files: Record<string, string> = {}, extra: string[] = []) {
  let stdout = '';
  let stderr = '';
  const io: Io = {
    cwd: here,
    readFile: (path) => files[path] ?? readFileSync(path, 'utf8'),
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
    pairingFile: join(here, 'never-written'),
  };
  const code = await main(['sync', 'fixtures/sample.resolver.json', ...FILES, ...extra, '--figcraft', String(fake.port), ...flags], io);
  return { code, stdout, stderr };
}

const layers = (fake: FakeFigcraft): Layer[] => {
  const out: Layer[] = [];
  const walk = (node: Layer): void => {
    out.push(node);
    (node.children ?? []).forEach(walk);
  };
  for (const page of fake.tabs[0].pages) (page.children ?? []).forEach(walk);
  return out;
};
const named = (fake: FakeFigcraft, type: string, name: string): Layer => {
  const found = layers(fake).find((node) => node.type === type && node.name === name);
  assert.ok(found, `no ${type} "${name}"`);
  return found!;
};
const stampOf = (node: Layer) => JSON.parse(node.pluginData?.['toghen.stamp'] ?? '{}');

describe('component files into FigCraft, end to end', () => {
  it('builds the sets and the artboard, stamps every layer on the layer itself, and plans nothing on a second run', async () => {
    const fake = await startFakeFigcraft();
    try {
      const first = await sync(fake);
      assert.equal(first.code, 0, first.stderr);
      assert.match(first.stdout, /Button: 1 step · 2 created/);
      assert.match(first.stdout, /Showcase: 1 step · 3 created/);

      // Combining names a member with no axes "Property 1=Default"; the run names it again.
      assert.deepEqual(
        named(fake, 'COMPONENT_SET', 'Icon').children!.map((member) => member.name),
        ['Icon'],
      );
      const button = named(fake, 'COMPONENT_SET', 'Button');
      assert.deepEqual(
        button.children!.map((member) => member.name),
        ['Size=small', 'Size=large'],
      );
      assert.deepEqual(stampOf(button).is, { component: 'Button' });
      const small = button.children![0];
      assert.deepEqual(stampOf(small).is, { member: 'Size=small', address: 'Button' });
      assert.equal(stampOf(small).id, String(small.id), 'a stamp names the layer it is on');
      assert.ok(Object.keys(stampOf(small).receipt).includes('paddingTop'), 'the receipt lists the fields the file declares');
      assert.deepEqual(Object.keys(small.componentPropertyDefinitions), ['Label', 'Show icon']);

      // The instance of Icon, wired to "Show icon"; the wiring is kept beside the stamp, since FigCraft does not report it.
      const mark = small.children!.find((child) => child.name === 'Mark')!;
      assert.equal(mark.type, 'INSTANCE');
      assert.equal(mark.mainComponent, named(fake, 'COMPONENT', 'Icon').id);
      assert.deepEqual(mark.hidden?.refs, { visible: 'Show icon' });
      assert.deepEqual(JSON.parse(mark.pluginData!['toghen.unreported']), { references: { visible: 'Show icon' } });
      assert.equal(small.boundVariables.paddingTop, fake.tabs[0].variables.find((v) => v.name === 'spacing/sm')!.id);

      // The artboard, its frame pinned to the dark theme.
      const showcase = named(fake, 'FRAME', 'Showcase');
      assert.deepEqual(stampOf(showcase).is, { artboard: 'Showcase', address: 'Showcase' });
      assert.equal(Object.values(showcase.hidden!.modes!).length, 1);
      const primary = showcase.children!.find((child) => child.name === 'Primary')!;
      assert.equal(primary.mainComponent, button.children![1].id, 'Size=large picks the large member');
      assert.equal(primary.componentProperties.Label, 'Go');

      const labels = fake.labels.length;
      const second = await sync(fake);
      assert.equal(second.code, 0, second.stderr);
      assert.match(second.stdout, /Icon: 1 step · 0 created · 0 updated · 0 deleted/);
      assert.match(second.stdout, /Button: 1 step · 0 created · 0 updated · 0 deleted/);
      assert.doesNotMatch(second.stdout, /moved "/, 'every set is where the first run put it');
      assert.match(second.stdout, /Showcase: 0 steps/);
      assert.doesNotMatch(second.stdout, /changed in Figma/);
      assert.deepEqual(
        fake.labels.slice(labels).filter((label) => label !== 'Read'),
        [],
        'a run with nothing to change writes nothing',
      );
    } finally {
      await fake.close();
    }
  });

  it("keeps a field changed by hand and says so, and writes the file's value over it with --overwrite-drift", async () => {
    const fake = await startFakeFigcraft();
    try {
      assert.equal((await sync(fake)).code, 0);
      const small = named(fake, 'COMPONENT', 'Size=small');
      // A hand edit: FigCraft lets the variable go when a bound field is given a value.
      small.layout.padding[0] = 3;
      delete small.boundVariables.paddingTop;

      const kept = await sync(fake);
      assert.equal(kept.code, 0, kept.stderr);
      assert.match(
        kept.stdout,
        /"Size=small", layer "Button": "paddingTop" was changed in Figma since Toghen wrote it, and was left as it is/,
      );
      assert.equal(small.layout.padding[0], 3);
      assert.equal(small.boundVariables.paddingTop, undefined);

      const overwritten = await sync(fake, ['--overwrite-drift']);
      assert.equal(overwritten.code, 0, overwritten.stderr);
      assert.ok(named(fake, 'COMPONENT', 'Size=small').boundVariables.paddingTop, 'bound again');
      assert.doesNotMatch((await sync(fake)).stdout, /changed in Figma/);
    } finally {
      await fake.close();
    }
  });

  it('takes a layer off its property when the file writes a value instead, and keeps no wiring for it', async () => {
    const fake = await startFakeFigcraft();
    const path = join(here, 'fixtures/figcraft/tag.component.kdl');
    const tag = (hint: string) =>
      `component Tag\nproperties {\n    TEXT Name default="Tag"\n}\nFRAME Tag layoutMode=HORIZONTAL {\n    TEXT Label characters=(property)Name\n    TEXT Hint characters=${hint}\n}\n`;
    const run = (hint: string) => sync(fake, [], { [path]: tag(hint) }, ['fixtures/figcraft/tag.component.kdl']);
    try {
      assert.equal((await run('(property)Name')).code, 0);
      const hint = () => named(fake, 'COMPONENT', 'Tag').children!.find((child) => child.name === 'Hint')!;
      assert.deepEqual(hint().hidden?.refs, { characters: 'Name' });
      const changed = await run('(literal)"Send"');
      assert.equal(changed.code, 0, changed.stderr);
      assert.equal(hint().characters, 'Send');
      assert.equal(hint().hidden?.refs?.characters, null, 'unwired');
      assert.deepEqual(JSON.parse(hint().pluginData!['toghen.unreported']), {});
      assert.match((await run('(literal)"Send"')).stdout, /Tag: 1 step · 0 created · 0 updated/);
    } finally {
      await fake.close();
    }
  });

  it('writes a doubled brace in a text as a literal one, as the Figma target does', async () => {
    const fake = await startFakeFigcraft();
    const path = join(here, 'fixtures/figcraft/tag.component.kdl');
    const text = 'component Tag\nFRAME Tag layoutMode=HORIZONTAL {\n    TEXT Hint characters="{{size.sm}}"\n}\n';
    try {
      const ran = await sync(fake, [], { [path]: text }, ['fixtures/figcraft/tag.component.kdl']);
      assert.equal(ran.code, 0, ran.stderr);
      const hint = named(fake, 'COMPONENT', 'Tag').children!.find((child) => child.name === 'Hint')!;
      assert.equal(hint.characters, '{size.sm}');
    } finally {
      await fake.close();
    }
  });

  it('adds a member for a new value, and removes one only with --allow-breaking', async () => {
    const fake = await startFakeFigcraft();
    const path = join(here, 'fixtures/figcraft/button.component.kdl');
    const text = readFileSync(path, 'utf8');
    try {
      assert.equal((await sync(fake)).code, 0);
      const grown = await sync(fake, [], { [path]: text.replace('VARIANT Size small large', 'VARIANT Size small large huge') });
      assert.equal(grown.code, 0, grown.stderr);
      assert.deepEqual(
        named(fake, 'COMPONENT_SET', 'Button').children!.map((member) => member.name),
        ['Size=small', 'Size=large', 'Size=huge'],
      );
      assert.deepEqual(stampOf(named(fake, 'COMPONENT', 'Size=huge')).is, { member: 'Size=huge', address: 'Button' });

      // Back to two values: the huge member goes.
      const shrunk = { [path]: text };
      const refused = await sync(fake, [], shrunk);
      assert.equal(refused.code, 1);
      assert.match(refused.stderr, /would break instances, and nothing was written/);
      assert.equal(named(fake, 'COMPONENT_SET', 'Button').children!.length, 3);

      const taken = await sync(fake, ['--allow-breaking'], shrunk);
      assert.equal(taken.code, 0, taken.stderr);
      assert.deepEqual(
        named(fake, 'COMPONENT_SET', 'Button').children!.map((member) => member.name),
        ['Size=small', 'Size=large'],
      );
    } finally {
      await fake.close();
    }
  });

  it('writes the values of corners and sides first and binds after, so no binding is let go, and never binds cornerRadius beside a corner', async () => {
    const fake = await startFakeFigcraft();
    const path = join(here, 'fixtures/figcraft/tab.component.kdl');
    const tab = `component Tab\nFRAME Tab cornerRadius="{radius.md}" bottomLeftRadius=(literal)0 bottomRightRadius=(literal)0 strokeWeight="{spacing.xs}" strokeTopWeight=(literal)0 strokeBottomWeight="{spacing.sm}" {\n    strokes "{color.border.default}"\n}\n`;
    const run = (flags: string[] = []) => sync(fake, flags, { [path]: tab }, ['fixtures/figcraft/tab.component.kdl']);
    try {
      const first = await run();
      assert.equal(first.code, 0, first.stderr);
      const node = named(fake, 'COMPONENT', 'Tab');
      const radius = fake.tabs[0].variables.find((v) => v.name === 'radius/md')!.id;
      assert.deepEqual(node.cornerRadius.slice(2), [0, 0]);
      assert.equal(node.boundVariables.topLeftRadius, radius);
      assert.equal(node.boundVariables.topRightRadius, radius);
      assert.equal(node.boundVariables.cornerRadius, undefined, 'a corner bound beside a bound cornerRadius would do nothing');
      assert.equal(
        node.boundVariables.strokeBottomWeight,
        fake.tabs[0].variables.find((v) => v.name === 'spacing/sm')!.id,
        'the side written as a value first leaves the bound side bound',
      );
      assert.equal(
        node.boundVariables.strokeLeftWeight,
        fake.tabs[0].variables.find((v) => v.name === 'spacing/xs')!.id,
        'a side the file does not name follows strokeWeight, bound on its own',
      );
      assert.equal(node.boundVariables.strokeWeight, undefined, 'strokeWeight is never bound beside a side of its own');
      assert.equal(node.strokeSides[0], 0);
      assert.match((await run()).stdout, /Tab: 1 step · 0 created · 0 updated · 0 deleted/);

      // A hand edit of one corner lets FigCraft's corner variables go; --overwrite-drift writes them back, every one bound again.
      node.cornerRadius = [8, 8, 0, 2];
      for (const corner of ['topLeftRadius', 'topRightRadius']) delete node.boundVariables[corner];
      assert.match((await run()).stdout, /changed in Figma/);
      assert.equal((await run(['--overwrite-drift'])).code, 0);
      assert.equal(named(fake, 'COMPONENT', 'Tab').boundVariables.topLeftRadius, radius);
      assert.deepEqual(named(fake, 'COMPONENT', 'Tab').cornerRadius.slice(2), [0, 0]);
      assert.equal(
        named(fake, 'COMPONENT', 'Tab').boundVariables.strokeBottomWeight,
        fake.tabs[0].variables.find((v) => v.name === 'spacing/sm')!.id,
      );
      assert.doesNotMatch((await run()).stdout, /changed in Figma/);
    } finally {
      await fake.close();
    }
  });

  it('writes a gradient, effects and layout grids whole, then binds their parts, and reads them back as Figma reports them', async () => {
    const fake = await startFakeFigcraft();
    const path = join(here, 'fixtures/figcraft/card.component.kdl');
    const card = `component Card\nFRAME Card width=(literal)200 height=(literal)120 {\n    fills "{gradient.brand}"\n    effects "{shadow.md}" (literal)2\n    layoutGrids {\n        COLUMNS alignment=STRETCH count=(literal)4 gutterSize="{spacing.sm}" offset="{spacing.xs}"\n        GRID sectionSize=(literal)10\n    }\n}\n`;
    const run = (flags: string[] = []) => sync(fake, flags, { [path]: card }, ['fixtures/figcraft/card.component.kdl']);
    try {
      const first = await run();
      assert.equal(first.code, 0, first.stderr);
      const node = named(fake, 'COMPONENT', 'Card');
      const id = (name: string) => fake.tabs[0].variables.find((v) => v.name === name)!.id;
      assert.equal(node.fills[0].type, 'gradient');
      assert.equal(node.fills[0].kind, 'linear');
      assert.deepEqual(
        node.effects.map((effect: { type: string }) => effect.type),
        ['dropShadow', 'layerBlur'],
      );
      assert.equal(node.effects[1].radius, 2);
      assert.deepEqual(
        node.grids.map((grid: { kind: string }) => grid.kind),
        ['columns', 'grid'],
      );
      assert.equal(node.boundVariables['layoutGrids/0/gutter'], id('spacing/sm'));
      assert.equal(node.boundVariables['layoutGrids/0/offset'], id('spacing/xs'));
      assert.match((await run()).stdout, /Card: 1 step · 0 created · 0 updated · 0 deleted/);

      // A hand edit of the blur is drift, kept and said.
      node.effects[1].radius = 9;
      const kept = await run();
      assert.match(kept.stdout, /"effects" was changed in Figma/);
      assert.equal(named(fake, 'COMPONENT', 'Card').effects[1].radius, 9);
      assert.equal((await run(['--overwrite-drift'])).code, 0);
      assert.equal(named(fake, 'COMPONENT', 'Card').effects[1].radius, 2);
    } finally {
      await fake.close();
    }
  });

  it('builds grid layout, wrap, dashes, joins, constraints, blend, a line and text fields, and keeps what FigCraft does not report', async () => {
    const fake = await startFakeFigcraft();
    const run = (flags: string[] = []) => sync(fake, flags, {}, ['fixtures/figcraft/panel.component.kdl']);
    try {
      const first = await run();
      assert.equal(first.code, 0, first.stderr);
      const panel = named(fake, 'COMPONENT', 'Panel');
      const child = (name: string) => panel.children!.find((node) => node.name === name)!;
      const grid = child('Grid');
      const id = (name: string) => fake.tabs[0].variables.find((v) => v.name === name)!.id;
      assert.equal(grid.layout.mode, 'grid');
      assert.deepEqual(grid.layout.columnTracks, [
        { sizing: 'fixed', value: 60 },
        { sizing: 'fill', value: 1 },
        { sizing: 'hug', value: 0 },
      ]);
      assert.equal(grid.boundVariables.gap, id('spacing/sm'), 'in a grid, gap is the column gap');
      assert.equal(grid.boundVariables.crossGap, id('spacing/xs'));
      const note = grid.children![0];
      assert.deepEqual([note.gridCell.row, note.gridCell.column, note.gridCell.alignH], [0, 1, 'center']);
      assert.equal(note.leadingTrim, 'capHeight');
      assert.equal(note.listSpacing, 6);
      assert.equal(note.hidden!.fields!.paragraphSpacing, 4, 'written, though FigCraft does not report it');
      assert.equal(child('Row').layout.contentAlign, 'spaceBetween');
      assert.deepEqual(child('Row').dashes, [4, 2]);
      assert.equal(child('Row').strokeJoin, 'round');
      assert.deepEqual(child('Pin').constraints, { horizontal: 'leftRight', vertical: 'bottom' });
      assert.equal(child('Rule').type, 'LINE');
      assert.equal(child('Rule').hidden!.fields!.strokeCap, 'round');
      assert.equal(panel.blend, 'multiply');
      assert.equal(panel.hidden!.fields!.cornerSmoothing, 0.6);
      assert.deepEqual(JSON.parse(panel.pluginData!['toghen.unreported']).fields, { blendMode: 'MULTIPLY', cornerSmoothing: 0.6 });
      assert.match((await run()).stdout, /Panel: 1 step · 0 created · 0 updated · 0 deleted/);

      // A hand edit FigCraft reports is drift; one it does not report goes unseen, as the specs say.
      child('Row').dashes = [1, 1];
      note.hidden!.fields!.paragraphSpacing = 9;
      const kept = await run();
      assert.match(kept.stdout, /layer "Row": "dashPattern" was changed in Figma/);
      assert.doesNotMatch(kept.stdout, /paragraphSpacing/);
    } finally {
      await fake.close();
    }
  });

  it("makes a slot with its property, exposes a nested instance, and fills an instance's slot from an artboard", async () => {
    const fake = await startFakeFigcraft();
    const run = (flags: string[] = []) =>
      sync(fake, flags, {}, ['fixtures/figcraft/holder.component.kdl', 'fixtures/figcraft/shelf.artboard.kdl']);
    try {
      const first = await run();
      assert.equal(first.code, 0, first.stderr);
      const holder = named(fake, 'COMPONENT', 'Holder');
      const slot = holder.children!.find((node) => node.name === 'Content')!;
      assert.equal(slot.slot, 'Content');
      assert.equal(holder.componentPropertyDefinitions.Content.type, 'slot');
      assert.equal(holder.children!.find((node) => node.name === 'Mark')!.hidden!.fields!.isExposedInstance, true);
      const set = named(fake, 'COMPONENT_SET', 'Holder');
      assert.deepEqual(JSON.parse(set.pluginData!['toghen.unreported']).slots, {
        Content: { description: 'What the holder holds.', slotSettings: { minChildren: 0 } },
      });

      // The artboard's instance holds an Icon in its slot, stamped there by Toghen.
      const box = named(fake, 'FRAME', 'Shelf').children!.find((node) => node.name === 'Box')!;
      const filled = box.children!.find((node) => node.slot === 'Content')!;
      // Made in a second batch, once the instance's slot layer has an id, in the file's order.
      assert.deepEqual(
        filled.children!.map((node) => node.name),
        ['Inside', 'Caption'],
      );
      assert.equal(filled.children![0].mainComponent, named(fake, 'COMPONENT', 'Icon').id);
      assert.equal(stampOf(filled.children![0]).is.address, 'Inside');
      assert.equal(stampOf(filled.children![1]).is.address, 'Caption');

      const second = await run();
      assert.equal(second.code, 0, second.stderr);
      assert.match(second.stdout, /Holder: 1 step · 0 created · 0 updated · 0 deleted/);
      assert.match(second.stdout, /Shelf: 0 steps/);
      assert.doesNotMatch(second.stdout, /changed in Figma/);
    } finally {
      await fake.close();
    }
  });

  it('writes preferred values by name as the ids of the components and sets they name, and plans no change on a second run', async () => {
    const fake = await startFakeFigcraft();
    const path = join(here, 'fixtures/figcraft/picker.component.kdl');
    const picker = `component Picker
properties {
    INSTANCE_SWAP Mark default=Icon {
        preferred COMPONENT name="Icon"
        preferred COMPONENT_SET name="Button"
    }
    SLOT Content minChildren=0 {
        preferred COMPONENT name="Icon"
    }
}
FRAME Picker layoutMode=VERTICAL layoutSizingHorizontal=HUG layoutSizingVertical=HUG {
    INSTANCE Mark component=(property)Mark
    SLOT Content layoutMode=VERTICAL layoutSizingHorizontal=HUG layoutSizingVertical=HUG
}
`;
    const run = () => sync(fake, [], { [path]: picker }, ['fixtures/figcraft/picker.component.kdl']);
    try {
      const first = await run();
      assert.equal(first.code, 0, first.stderr);
      const icon = named(fake, 'COMPONENT', 'Icon').id;
      const button = named(fake, 'COMPONENT_SET', 'Button').id;
      const definitions = named(fake, 'COMPONENT', 'Picker').componentPropertyDefinitions;
      assert.deepEqual(definitions.Mark.preferred, [icon, button]);
      assert.deepEqual(definitions.Content.preferred, [icon]);

      // A second run edits neither the default nor the preferred values: made read-only here, they would fail an edit
      // that sent them again.
      Object.defineProperty(definitions.Mark, 'preferred', { value: [icon, button], writable: false, enumerable: true });
      const labels = fake.labels.length;
      const second = await run();
      assert.equal(second.code, 0, second.stderr);
      assert.deepEqual(
        fake.labels.slice(labels).filter((label) => label !== 'Read' && label !== 'Toghen stamps'),
        [],
      );

      // Preferred values changed by hand are written again.
      definitions.Content.preferred = [button];
      assert.equal((await run()).code, 0);
      assert.deepEqual(named(fake, 'COMPONENT', 'Picker').componentPropertyDefinitions.Content.preferred, [icon]);

      // A component with no instance swap: its second run writes nothing at all.
      const slotOnly = picker
        .replace(/ {4}INSTANCE_SWAP Mark[\s\S]*?\n {4}}\n/, '')
        .replace('    INSTANCE Mark component=(property)Mark\n', '')
        .replace(/Picker/g, 'Tray');
      assert.equal((await sync(fake, [], { [path]: slotOnly }, ['fixtures/figcraft/picker.component.kdl'])).code, 0);
      assert.deepEqual(named(fake, 'COMPONENT', 'Tray').componentPropertyDefinitions.Content.preferred, [icon]);
      const before = fake.labels.length;
      const again = await sync(fake, [], { [path]: slotOnly }, ['fixtures/figcraft/picker.component.kdl']);
      assert.equal(again.code, 0, again.stderr);
      assert.deepEqual(
        fake.labels.slice(before).filter((label) => label !== 'Read'),
        [],
      );
    } finally {
      await fake.close();
    }
  });

  it('stops on a preferred name that is not in the file, or a set that is a lone component, with its line, before any write', async () => {
    const fake = await startFakeFigcraft();
    const path = join(here, 'fixtures/figcraft/picker.component.kdl');
    const picker = (preferred: string) =>
      `component Picker\nproperties {\n    SLOT Content minChildren=0 {\n        ${preferred}\n    }\n}\nFRAME Picker layoutMode=VERTICAL {\n    SLOT Content layoutMode=VERTICAL\n}\n`;
    try {
      assert.equal((await sync(fake)).code, 0);
      // A component a person made, in no set.
      fake.tabs[0].pages[0].children!.push({
        id: 9000,
        type: 'COMPONENT',
        name: 'Loose',
        x: 10000,
        y: 10000,
        width: 10,
        height: 10,
        children: [],
      });
      const labels = fake.labels.length;
      const missing = await sync(fake, [], { [path]: picker('preferred COMPONENT name="Nowhere"') }, [
        'fixtures/figcraft/picker.component.kdl',
      ]);
      assert.equal(missing.code, 1);
      assert.match(missing.stderr, /component "Nowhere" \(line 4\) is not in this file/);
      const lone = await sync(fake, [], { [path]: picker('preferred COMPONENT_SET name="Loose"') }, [
        'fixtures/figcraft/picker.component.kdl',
      ]);
      assert.equal(lone.code, 1);
      assert.match(
        lone.stderr,
        /preferred COMPONENT_SET name="Loose" \(line 4\): "Loose" is a component, not a set; write preferred COMPONENT/,
      );
      assert.deepEqual(
        fake.labels.slice(labels).filter((label) => label !== 'Read'),
        [],
        'nothing was written',
      );
    } finally {
      await fake.close();
    }
  });

  it("refuses preferred values by key=, which name Figma's published keys", async () => {
    const fake = await startFakeFigcraft();
    const path = join(here, 'fixtures/figcraft/holder.component.kdl');
    const keyed = readFileSync(path, 'utf8').replace('minChildren=0', 'minChildren=0 {\n        preferred COMPONENT key="0123abcd"\n    }');
    try {
      assert.equal((await sync(fake)).code, 0);
      const result = await sync(fake, ['--dry-run'], { [path]: keyed }, ['fixtures/figcraft/holder.component.kdl']);
      assert.equal(result.code, 1);
      assert.match(result.stderr, /the preferred values of "Content" name Figma's published keys, which FigCraft does not hold/);
    } finally {
      await fake.close();
    }
  });

  it("reads a library's variables, listed beside the file's own, as no variables of the file", async () => {
    const fake = await startFakeFigcraft();
    try {
      assert.equal((await sync(fake)).code, 0);
      // What `variable.list` lists once a layer is bound to a library variable: its ids prefixed, its mode ids not (measured).
      const local = fake.tabs[0].collections[0];
      fake.tabs[0].collections.push({ id: `294b4f2d88c18a6e:${local.id}`, name: local.name, modes: local.modes });
      fake.tabs[0].variables.push({
        ...fake.tabs[0].variables[0],
        id: `294b4f2d88c18a6e:${fake.tabs[0].variables[0].id}`,
        collection: `294b4f2d88c18a6e:${local.id}`,
      });
      const second = await sync(fake);
      assert.equal(second.code, 0, second.stderr);
      assert.doesNotMatch(second.stdout, /ambiguous|moved|changed in Figma/);
      assert.match(second.stdout, /Button: 1 step · 0 created · 0 updated · 0 deleted/);
    } finally {
      await fake.close();
    }
  });

  it("reads a library's styles, listed beside the file's own, as no styles of the file", async () => {
    const library = await startFakeFigcraft();
    const fake = await startFakeFigcraft();
    try {
      assert.equal((await sync(library)).code, 0);
      const made = library.tabs[0].styles.length;
      assert.ok(made > 0, 'the sample makes styles');
      // What `style.list` lists once a layer uses a library's styles: their ids prefixed with the library's (measured).
      fake.tabs[0].styles.push(
        ...library.tabs[0].styles.map((style) => ({ ...JSON.parse(JSON.stringify(style)), id: `294b4f2d88c18a6e:${style.id}`, bound: {} })),
      );
      const first = await sync(fake);
      assert.equal(first.code, 0, first.stderr);
      // Made in the file, not adopted from the library's read-only copies by name.
      assert.match(first.stdout, new RegExp(`Style plan: ${made} creates`));
    } finally {
      await library.close();
      await fake.close();
    }
  });

  /**
   * The sample design system with a colour that is transparent in the light theme and opaque in the dark one, and a
   * height (W3C structured shapes): what an unchanged run read back from FigCraft and wrote again (#127).
   */
  const SAMPLE = join(here, 'fixtures/sample.resolver.json');
  const sample = (): string => {
    const document = JSON.parse(readFileSync(SAMPLE, 'utf8'));
    document.sets.primitives.sources[0].color.veil = { $value: { colorSpace: 'srgb', components: [0.2, 0.3, 0.4], alpha: 0 } };
    document.modifiers.theme.contexts.dark[0].color.veil = { $value: { colorSpace: 'srgb', components: [0.2, 0.3, 0.4], alpha: 1 } };
    document.sets.primitives.sources[0].pill = { height: { $type: 'dimension', $value: { value: 32, unit: 'px' } } };
    return JSON.stringify(document);
  };
  const VEIL = join(here, 'fixtures/figcraft/veil.component.kdl');
  const veil = `component Veil\nproperties {\n    VARIANT Theme (modifier)"theme"\n}\nFRAME Veil layoutMode=HORIZONTAL {\n    fills "{color.veil}"\n    FRAME Dot width=(literal)8 height=(literal)8 {\n        fills "{color.veil}"\n    }\n}\n`;
  const PILL = join(here, 'fixtures/figcraft/pill.component.kdl');
  const pill = `component Pill tokens="{pill}"\nproperties {\n    TEXT Label default="Pill"\n}\nFRAME Pill layoutMode=HORIZONTAL layoutSizingHorizontal=HUG layoutSizingVertical=FIXED {\n    TEXT Caption tokens="{pill}" characters=(property)Label textAutoResize=NONE\n}\n`;
  const read = (fake: FakeFigcraft, run: Awaited<ReturnType<typeof sync>>, line: RegExp, labels: number): void => {
    assert.equal(run.code, 0, run.stderr);
    assert.match(run.stdout, line);
    assert.doesNotMatch(run.stdout, /changed in Figma/);
    assert.deepEqual(
      fake.labels.slice(labels).filter((label) => label !== 'Read'),
      [],
      'a run with nothing to change writes nothing',
    );
  };

  it('compares a paint bound to a colour by its variable only, so a member pinned where the alpha differs is not written again', async () => {
    const fake = await startFakeFigcraft();
    const files = { [SAMPLE]: sample(), [VEIL]: veil };
    const run = (flags: string[] = []) => sync(fake, flags, files, ['fixtures/figcraft/veil.component.kdl']);
    try {
      const first = await run();
      assert.equal(first.code, 0, first.stderr);
      assert.match(first.stdout, /Veil: 1 step · 2 created/);
      const labels = fake.labels.length;
      read(fake, await run(['--dry-run']), /Veil \(dry run\): 1 step · 0 created · 0 would update · 0 deleted/, labels);
      read(fake, await run(), /Veil: 1 step · 0 created · 0 updated · 0 deleted/, labels);
    } finally {
      await fake.close();
    }
  });

  it('restamps, and does not write, a bound paint whose receipt holds the opacity the code before 8a compared', async () => {
    const fake = await startFakeFigcraft();
    const files = { [SAMPLE]: sample(), [VEIL]: veil };
    const run = () => sync(fake, [], files, ['fixtures/figcraft/veil.component.kdl']);
    try {
      assert.equal((await run()).code, 0);
      const light = named(fake, 'COMPONENT', 'Theme=light');
      const variable = fake.tabs[0].variables.find((v) => v.name === 'color/veil')!.id;
      const stamp = stampOf(light);
      assert.equal(stamp.receipt.fills, hashOf([{ variable }]));
      // What a run before 8a held for a paint at alpha 0: the variable and the opacity.
      stamp.receipt.fills = hashOf([{ variable, opacity: 0 }]);
      light.pluginData!['toghen.stamp'] = JSON.stringify(stamp);

      fake.refuse = 'variable.bind';
      const again = await run();
      assert.equal(again.code, 0, again.stderr);
      assert.doesNotMatch(again.stdout, /changed in Figma/);
      assert.equal(stampOf(light).receipt.fills, hashOf([{ variable }]), 'stamped again in the new form, with no paint written');
    } finally {
      await fake.close();
    }
  });

  it('writes nothing on a second run of a bound height beside FIXED, and keeps it fixed whatever is set beside it', async () => {
    const fake = await startFakeFigcraft();
    const files = { [SAMPLE]: sample(), [PILL]: pill };
    const run = () => sync(fake, [], files, ['fixtures/figcraft/pill.component.kdl']);
    try {
      assert.equal((await run()).code, 0);
      const labels = fake.labels.length;
      read(fake, await run(), /Pill: 1 step · 0 created · 0 updated · 0 deleted/, labels);
      // A hug set by hand on a bound height: FigCraft keeps the layer fixed while the height is bound (measured).
      const root = named(fake, 'COMPONENT', 'Pill');
      root.sizing = { ...root.sizing, vertical: 'hug' };
      root.children!.find((child) => child.name === 'Caption')!.textAutoResize = 'widthAndHeight';
      read(fake, await run(), /Pill: 1 step · 0 created · 0 updated · 0 deleted/, labels);
    } finally {
      await fake.close();
    }
  });

  const SIZED = join(here, 'fixtures/figcraft/sized.artboard.kdl');
  const sized = (size: string): string =>
    `artboard Sized\nFRAME Sized layoutMode=VERTICAL {\n    INSTANCE Card component=Button width=(literal)480 layoutSizingVertical=HUG {\n        set Size=${size}\n    }\n    INSTANCE Wide component=Button layoutSizingHorizontal=FILL {\n        set Size=large\n    }\n}\n`;

  it('sizes an instance after its properties, so a variant switch, which resets a fixed size in FigCraft, keeps the stated width', async () => {
    const fake = await startFakeFigcraft();
    const run = (size: string) => sync(fake, [], { [SIZED]: sized(size) }, ['fixtures/figcraft/sized.artboard.kdl']);
    try {
      const first = await run('large');
      assert.equal(first.code, 0, first.stderr);
      const card = named(fake, 'INSTANCE', 'Card');
      const wide = named(fake, 'INSTANCE', 'Wide');
      const large = named(fake, 'COMPONENT', 'Size=large');
      assert.equal(card.mainComponent, large.id);
      assert.equal(card.width, 480, 'the width the file states, written after the variant switch');
      assert.equal(card.sizing?.vertical, 'hug');
      assert.equal(wide.mainComponent, large.id);
      assert.equal(wide.sizing?.horizontal, 'fill', 'it fills its auto-layout parent');

      const labels = fake.labels.length;
      read(fake, await run('large'), /Sized: 0 steps/, labels);

      // Only the variant changes: the patch writes the properties, then the sizing again, and the artboard's stamp takes
      // the new fingerprint.
      const switched = await run('small');
      assert.equal(switched.code, 0, switched.stderr);
      assert.deepEqual(
        fake.labels.slice(labels).filter((label) => label !== 'Read' && label !== 'Toghen stamps'),
        ['Update Card', 'Toghen: stamps'],
      );
      assert.equal(card.mainComponent, named(fake, 'COMPONENT', 'Size=small').id);
      assert.equal(card.width, 480);
      assert.equal(card.sizing?.vertical, 'hug');
      const after = fake.labels.length;
      read(fake, await run('small'), /Sized: 0 steps/, after);
    } finally {
      await fake.close();
    }
  });

  const SLAB = join(here, 'fixtures/figcraft/slab.component.kdl');
  const slab = `component Slab\nFRAME Slab layoutMode=VERTICAL layoutSizingHorizontal=FIXED layoutSizingVertical=HUG width="{pill.height}" {\n    FRAME Face layoutSizingHorizontal=FILL height=(literal)8\n}\n`;
  const ROW = join(here, 'fixtures/figcraft/row.artboard.kdl');
  const row = `artboard Row\nFRAME Row layoutMode=VERTICAL layoutSizingHorizontal=FIXED width=(literal)300 {\n    INSTANCE Filled component=Slab layoutSizingHorizontal=FILL\n}\n`;

  it("lets an instance that fills go of its main's bound width, which FigCraft would keep fixed, and plans nothing on a second run", async () => {
    const fake = await startFakeFigcraft();
    const files = { [SAMPLE]: sample(), [SLAB]: slab, [ROW]: row };
    const run = () => sync(fake, [], files, ['fixtures/figcraft/slab.component.kdl', 'fixtures/figcraft/row.artboard.kdl']);
    try {
      assert.equal((await run()).code, 0);
      const filled = named(fake, 'INSTANCE', 'Filled');
      assert.equal(filled.boundVariables?.width, undefined, 'the instance lets the width go');
      assert.ok(named(fake, 'COMPONENT', 'Slab').boundVariables?.width, 'the main keeps it');
      assert.equal(filled.sizing?.horizontal, 'fill');
      const labels = fake.labels.length;
      read(fake, await run(), /Row: 0 steps/, labels);
    } finally {
      await fake.close();
    }
  });

  const TRAY = join(here, 'fixtures/figcraft/tray.component.kdl');
  const tray = `component Tray\nproperties {\n    SLOT Body minChildren=0\n}\nFRAME Tray layoutMode=VERTICAL layoutSizingHorizontal=HUG layoutSizingVertical=HUG {\n    SLOT Body layoutMode=VERTICAL layoutSizingHorizontal=HUG layoutSizingVertical=HUG {\n        TEXT Text characters=(literal)"Default"\n    }\n}\n`;
  const TRAYS = join(here, 'fixtures/figcraft/trays.artboard.kdl');
  const trays = `artboard Trays\nFRAME Trays layoutMode=VERTICAL layoutSizingHorizontal=HUG layoutSizingVertical=HUG {\n    INSTANCE One component=Tray\n    INSTANCE Two component=Tray\n}\n`;

  it("leaves a slot's default content, which comes with each instance stamped as its component's, to the component", async () => {
    const fake = await startFakeFigcraft();
    const run = () =>
      sync(fake, [], { [TRAY]: tray, [TRAYS]: trays }, ['fixtures/figcraft/tray.component.kdl', 'fixtures/figcraft/trays.artboard.kdl']);
    try {
      assert.equal((await run()).code, 0);
      const labels = fake.labels.length;
      const second = await run();
      read(fake, second, /Trays: 0 steps/, labels);
      assert.doesNotMatch(second.stdout, /copy of Toghen's layer "Text"|breaking/);
    } finally {
      await fake.close();
    }
  });

  const boards = (note: string): Record<string, string> =>
    Object.fromEntries(
      [0, 1, 2, 3].map((at) => [
        join(here, `fixtures/figcraft/board${at}.artboard.kdl`),
        `artboard Board${at}\nFRAME Board${at} layoutMode=VERTICAL {\n    FRAME Row${at} layoutMode=HORIZONTAL {\n        TEXT Note${at} characters=(literal)"${at === 0 ? note : 'kept'}"\n    }\n    INSTANCE Mark${at} component=Icon\n}\n`,
      ]),
    );
  const boardFiles = [0, 1, 2, 3].map((at) => `fixtures/figcraft/board${at}.artboard.kdl`);

  it('reads each layer once in a run, however many sets and artboards it runs, and again only what a write touched', async () => {
    const fake = await startFakeFigcraft();
    const run = (note: string, flags: string[] = []) => sync(fake, flags, boards(note), boardFiles);
    const readsOf = (name: string): number => fake.gets.filter((id) => id === named(fake, 'FRAME', name).id).length;
    try {
      assert.equal((await run('first')).code, 0);
      fake.gets.length = 0;
      const unchanged = await run('first', ['--dry-run']);
      assert.equal(unchanged.code, 0, unchanged.stderr);
      for (const at of [0, 1, 2, 3]) assert.equal(readsOf(`Row${at}`), 1, `Row${at} is read once`);

      // A literal text patched on one artboard (its text unwired from no property: an artboard has none): that artboard
      // is read again after the write, and the others are not.
      fake.gets.length = 0;
      const changed = await run('second');
      assert.equal(changed.code, 0, changed.stderr);
      assert.match(changed.stdout, /Board0: 1 step · 0 created · 1 updated/);
      assert.ok(readsOf('Row0') > 1, 'the artboard written is read again');
      for (const at of [1, 2, 3]) assert.equal(readsOf(`Row${at}`), 1, `Row${at}, not written, is read once`);
      const labels = fake.labels.length;
      read(fake, await run('second'), /Board3: 0 steps/, labels);
    } finally {
      await fake.close();
    }
  });

  const ROWS = join(here, 'fixtures/figcraft/rows.artboard.kdl');
  const rows = (count: number, label: string): string =>
    `artboard Rows\nFRAME Rows layoutMode=VERTICAL {\n${Array.from(
      { length: count },
      (_, at) =>
        `    INSTANCE Row${at} component=Holder {\n        slot Content {\n            TEXT Caption${at} characters=(literal)"${label} ${at}"\n        }\n    }\n`,
    ).join('')}}\n`;

  it('adds an instance and fills its slot on an artboard that exists, and a dry run counts what the run would create and update', async () => {
    const fake = await startFakeFigcraft();
    const run = (count: number, label: string, flags: string[] = []) =>
      sync(fake, flags, { [ROWS]: rows(count, label) }, ['fixtures/figcraft/holder.component.kdl', 'fixtures/figcraft/rows.artboard.kdl']);
    try {
      assert.match(
        (await run(1, 'A', ['--dry-run'])).stdout,
        /Rows \(dry run\): 1 step · 3 would create · 0 would update · 0 would delete/,
      );
      assert.match((await run(1, 'A')).stdout, /Rows: 1 step · 3 created · 0 updated · 0 deleted/);

      // A second row: the instance, then what fills its slot, which has an id only once the instance is made.
      assert.match(
        (await run(2, 'A', ['--dry-run'])).stdout,
        /Rows \(dry run\): 2 steps · 2 would create · 0 would update · 0 would delete/,
      );
      const added = await run(2, 'A');
      assert.equal(added.code, 0, added.stderr);
      assert.match(added.stdout, /Rows: 2 steps · 2 created · 0 updated · 0 deleted/);
      assert.equal(named(fake, 'TEXT', 'Caption1').characters, 'A 1');

      // Changed texts: the dry run counts the layers the run then updates.
      assert.match(
        (await run(2, 'B', ['--dry-run'])).stdout,
        /Rows \(dry run\): 2 steps · 0 would create · 2 would update · 0 would delete/,
      );
      assert.match((await run(2, 'B')).stdout, /Rows: 2 steps · 0 created · 2 updated · 0 deleted/);
      const labels = fake.labels.length;
      read(fake, await run(2, 'B'), /Rows: 0 steps/, labels);
    } finally {
      await fake.close();
    }
  });

  it('removes a layer with what it holds in one step, and passes over a removed layer that went with what replaced its parent', async () => {
    const fake = await startFakeFigcraft();
    const NEST = join(here, 'fixtures/figcraft/nest.artboard.kdl');
    const before = `artboard Nest
FRAME Nest layoutMode=VERTICAL {
    TEXT Title characters=(literal)"Nest"
    FRAME Part layoutMode=VERTICAL {
        TEXT Head characters=(literal)"Head"
        FRAME Box layoutMode=VERTICAL {
            TEXT Note characters=(literal)"Note"
        }
    }
    FRAME Swap layoutMode=VERTICAL {
        TEXT Inner characters=(literal)"Inner"
    }
}
`;
    const after = `artboard Nest
FRAME Nest layoutMode=VERTICAL {
    TEXT Title characters=(literal)"Nest"
    TEXT Swap characters=(literal)"Swap"
}
`;
    const run = (text: string, flags: string[] = []) => sync(fake, flags, { [NEST]: text }, ['fixtures/figcraft/nest.artboard.kdl']);
    try {
      assert.equal((await run(before)).code, 0);
      const dry = await run(after, ['--dry-run']);
      // Part, with Head, Box and Note in it, is one removal; Inner is one of its own, since Swap is made again.
      assert.deepEqual(
        [...dry.stdout.matchAll(/layer "([^"]+)" is no longer in the file/g)].map((match) => match[1]),
        ['Part', 'Inner'],
      );
      const done = await run(after, ['--allow-breaking']);
      assert.equal(done.code, 0, done.stderr);
      assert.match(done.stdout, /Nest: 3 steps · 1 created · 0 updated · 2 deleted/);
      for (const name of ['Part', 'Head', 'Box', 'Note', 'Inner'])
        assert.ok(!layers(fake).some((node) => node.name === name), `"${name}" is still in the file`);
      assert.equal(named(fake, 'TEXT', 'Swap').characters, 'Swap');
    } finally {
      await fake.close();
    }
  });

  it('lists, with --prune, an artboard no file declares: a dry run fails on it, and a run allowed to break removes it from the file', async () => {
    const fake = await startFakeFigcraft();
    const without = async (flags: string[]) => {
      let stdout = '';
      let stderr = '';
      const io: Io = {
        cwd: here,
        readFile: (path) => readFileSync(path, 'utf8'),
        stdout: (text) => (stdout += text),
        stderr: (text) => (stderr += text),
        pairingFile: join(here, 'never-written'),
      };
      const code = await main(
        ['sync', 'fixtures/sample.resolver.json', ...FILES.slice(0, 2), '--figcraft', String(fake.port), '--prune', ...flags],
        io,
      );
      return { code, stdout, stderr };
    };
    try {
      assert.equal((await sync(fake)).code, 0);
      const showcase = named(fake, 'FRAME', 'Showcase');
      const dry = await without(['--dry-run']);
      assert.equal(dry.code, 1);
      assert.match(dry.stdout, new RegExp(`breaking: the artboard "Showcase" \\(${showcase.id}\\) on page "[^"]+" has no source`));
      assert.match(dry.stderr, /one set or artboard has no source; a run with --prune and --allow-breaking removes it/);
      const stopped = await without([]);
      assert.equal(stopped.code, 1);
      assert.ok(layers(fake).includes(showcase), 'a run without --allow-breaking writes nothing');
      const done = await without(['--allow-breaking']);
      assert.equal(done.code, 0, done.stderr);
      assert.match(done.stdout, new RegExp(`removed the artboard "Showcase" \\(${showcase.id}\\)`));
      assert.ok(!layers(fake).some((node) => node.name === 'Showcase'), 'the artboard is gone from the file');
      assert.ok(named(fake, 'COMPONENT_SET', 'Button'), 'what the files declare stays');
    } finally {
      await fake.close();
    }
  });

  it('skips, with --skip-unchanged, a set or artboard whose fingerprint is the same, unread, and reads and plans one that changed', async () => {
    const fake = await startFakeFigcraft();
    const run = (note: string, flags: string[] = []) => sync(fake, flags, boards(note), boardFiles);
    const readsOf = (name: string): number => fake.gets.filter((id) => id === named(fake, 'FRAME', name).id).length;
    try {
      assert.equal((await run('first')).code, 0);

      // Nothing changed: every set and artboard is unchanged, and no artboard's insides are read.
      fake.gets.length = 0;
      const same = await run('first', ['--dry-run', '--skip-unchanged']);
      assert.equal(same.code, 0, same.stderr);
      for (const name of ['Icon', 'Button', 'Board0', 'Board3'])
        assert.match(same.stdout, new RegExp(`${name} \\(dry run\\): unchanged, its fingerprint the same; not read`));
      for (const at of [0, 1, 2, 3]) assert.equal(readsOf(`Row${at}`), 0, `Row${at} is not read`);

      // One artboard changed: it is read and planned, the others are not.
      fake.gets.length = 0;
      const changed = await run('second', ['--dry-run', '--skip-unchanged']);
      assert.match(changed.stdout, /Board0 \(dry run\): 1 step · 0 would create · 1 would update · 0 would delete/);
      assert.match(changed.stdout, /Board1 \(dry run\): unchanged/);
      assert.ok(readsOf('Row0') > 0, 'the changed artboard is read');
      assert.equal(readsOf('Row1'), 0, 'an unchanged one is not');

      // A real run writes it and stamps its new fingerprint; then everything is unchanged again.
      assert.match((await run('second')).stdout, /Board0: 1 step · 0 created · 1 updated/);
      assert.equal((await run('second', ['--dry-run', '--skip-unchanged'])).stdout.match(/unchanged, its fingerprint/g)?.length, 7);

      // The fingerprint is trusted: a change made by hand is not looked for with the flag, and is found without it.
      named(fake, 'TEXT', 'Note2').characters = 'by hand';
      assert.match((await run('second', ['--dry-run', '--skip-unchanged'])).stdout, /Board2 \(dry run\): unchanged/);
      assert.match((await run('second', ['--dry-run'])).stdout, /Board2 \(dry run\): 1 step/);
    } finally {
      await fake.close();
    }
  });

  it("reads again, with --skip-unchanged, a set whose token's value changed, and stamps its new fingerprint", async () => {
    const fake = await startFakeFigcraft();
    const document = (hex: number) => {
      const read = JSON.parse(readFileSync(SAMPLE, 'utf8'));
      // `color.brand.danger` is an alias of this one: the fingerprint follows the alias to the value it holds.
      read.sets.primitives.sources[0].color['red-500'].$value = { colorSpace: 'srgb', components: [hex, 0.2, 0.2] };
      return JSON.stringify(read);
    };
    try {
      assert.equal((await sync(fake, [], { [SAMPLE]: document(0.8) })).code, 0);
      assert.match((await sync(fake, ['--skip-unchanged'], { [SAMPLE]: document(0.8) })).stdout, /Icon: unchanged/);
      // The variable sync writes the new value first; the set that binds it is then read, compared and stamped again.
      const after = await sync(fake, ['--skip-unchanged'], { [SAMPLE]: document(0.6) });
      assert.equal(after.code, 0, after.stderr);
      assert.doesNotMatch(after.stdout, /Icon: unchanged/);
      assert.match(after.stdout, /Button: unchanged/);
      assert.match((await sync(fake, ['--skip-unchanged'], { [SAMPLE]: document(0.6) })).stdout, /Icon: unchanged/);
    } finally {
      await fake.close();
    }
  });

  it('refuses by name what is not built for FigCraft yet, before it writes anything, a dry run included', async () => {
    const fake = await startFakeFigcraft();
    const path = join(here, 'fixtures/figcraft/button.component.kdl');
    const lined = readFileSync(path, 'utf8').replace(
      'TEXT Caption characters=(property)Label',
      'TEXT Caption characters=(property)Label textTruncation=ENDING',
    );
    try {
      assert.equal((await sync(fake)).code, 0);
      const labels = fake.labels.length;
      for (const flags of [['--dry-run'], []]) {
        const result = await sync(fake, flags, { [path]: lined });
        assert.equal(result.code, 1);
        assert.match(result.stderr, /"Button" Caption: textTruncation is not built in FigCraft/);
      }
      assert.ok(!fake.labels.slice(labels).some((label) => label.includes('Caption')), 'nothing of Button was written');
    } finally {
      await fake.close();
    }
  });
});

describe("FigCraft's layers as Figma nodes", () => {
  const node = (fields: Partial<FcNode> & { id: number; type: string; name: string }): FcNode => fields as FcNode;

  it('reads auto layout, paints and their bindings, and a text, as Figma spells them', () => {
    const scene = sceneOf(
      [
        node({
          id: 1,
          type: 'PAGE',
          name: 'Page 1',
          children: [
            node({
              id: 2,
              type: 'FRAME',
              name: 'Card',
              layout: { mode: 'horizontal', gap: 8, padding: [1, 2, 3, 4], mainAlign: 'spaceBetween', crossAlign: 'center' },
              sizing: { horizontal: 'hug', vertical: 'fill' },
              cornerRadius: [4, 4, 0, 0],
              fills: [{ type: 'solid', color: '#FF000080' }],
              boundVariables: { 'fills/0/color': 'VariableID:1', gap: 'VariableID:2', cornerRadius: 'VariableID:3' },
              children: [
                node({
                  id: 3,
                  type: 'TEXT',
                  name: 'Label',
                  characters: 'Hi',
                  fontFamily: 'Inter',
                  fontStyle: 'Bold',
                  lineHeight: '150%',
                  letterSpacing: 2,
                  boundVariables: { fontSize: 'VariableID:4' },
                }),
              ],
            }),
          ],
        }),
      ],
      noWrites(),
    );
    const card = scene.byId('2') as unknown as Record<string, any>;
    assert.equal(card.layoutMode, 'HORIZONTAL');
    assert.equal(card.primaryAxisAlignItems, 'SPACE_BETWEEN');
    assert.equal(card.counterAxisAlignItems, 'CENTER');
    assert.deepEqual([card.paddingTop, card.paddingRight, card.paddingBottom, card.paddingLeft], [1, 2, 3, 4]);
    assert.deepEqual([card.layoutSizingHorizontal, card.layoutSizingVertical], ['HUG', 'FILL']);
    assert.equal(card.topLeftRadius, 4);
    assert.equal(card.bottomLeftRadius, 0);
    assert.deepEqual(card.fills[0].boundVariables, { color: { type: 'VARIABLE_ALIAS', id: 'VariableID:1' } });
    assert.equal(card.fills[0].opacity, 1, "a bound paint's alpha is its variable's, not the paint's opacity");
    assert.deepEqual(card.boundVariables.itemSpacing, { type: 'VARIABLE_ALIAS', id: 'VariableID:2' });
    assert.deepEqual(
      card.boundVariables.topLeftRadius,
      { type: 'VARIABLE_ALIAS', id: 'VariableID:3' },
      'a corner radius is bound by its corners, as Figma reports it',
    );
    const label = scene.byId('3') as unknown as Record<string, any>;
    assert.deepEqual(label.fontName, { family: 'Inter', style: 'Bold' });
    assert.deepEqual(label.lineHeight, { unit: 'PERCENT', value: 150 });
    assert.deepEqual(label.letterSpacing, { unit: 'PIXELS', value: 2 });
    assert.deepEqual(label.boundVariables.fontSize, [{ type: 'VARIABLE_ALIAS', id: 'VariableID:4' }], 'a text field is bound by its range');
    assert.equal(label.parent.id, '2');
  });

  it("does not take an instance's copy of its main's stamp for its own, nor what is inside an instance", () => {
    const stamp = (is: object, id: number) => ({ 'toghen.stamp': JSON.stringify({ is, receipt: {}, id: String(id) }) });
    const scene = sceneOf(
      [
        node({
          id: 1,
          type: 'PAGE',
          name: 'Page 1',
          children: [
            node({
              id: 2,
              type: 'COMPONENT',
              name: 'Chip',
              pluginData: stamp({ member: 'Chip', address: 'Chip' }, 2),
              children: [node({ id: 3, type: 'TEXT', name: 'Label', pluginData: stamp({ address: 'Label' }, 3) })],
            }),
            node({
              id: 4,
              type: 'INSTANCE',
              name: 'Chip',
              mainComponent: 2,
              pluginData: stamp({ member: 'Chip', address: 'Chip' }, 2),
              children: [node({ id: 5, type: 'TEXT', name: 'Label', pluginData: stamp({ address: 'Label' }, 3) })],
            }),
            node({ id: 6, type: 'INSTANCE', name: 'Mark', mainComponent: 2, pluginData: stamp({ address: 'Mark' }, 6) }),
          ],
        }),
      ],
      noWrites(),
    );
    assert.equal(scene.byId('4')!.getSharedPluginData('toghen', 'stamp'), '');
    assert.equal(scene.byId('5')!.getSharedPluginData('toghen', 'stamp'), '');
    assert.notEqual(scene.byId('6')!.getSharedPluginData('toghen', 'stamp'), '', 'an instance Toghen stamped as a layer is its own');
  });

  it('cannot read a set two members of one combination share, as Figma cannot', () => {
    const scene = sceneOf(
      [
        node({
          id: 1,
          type: 'PAGE',
          name: 'Page 1',
          children: [
            node({
              id: 2,
              type: 'COMPONENT_SET',
              name: 'Chip',
              children: [node({ id: 3, type: 'COMPONENT', name: 'Size=small' }), node({ id: 4, type: 'COMPONENT', name: 'Size=small' })],
            }),
          ],
        }),
      ],
      noWrites(),
    );
    assert.throws(() => (scene.byId('2') as unknown as ComponentSetNode).componentPropertyDefinitions, /has existing errors/);
  });

  it('keeps what a read writes back as writes: a stamp, a move, a removal', () => {
    const writes = noWrites();
    const scene = sceneOf(
      [node({ id: 1, type: 'PAGE', name: 'Page 1', children: [node({ id: 2, type: 'FRAME', name: 'A', x: 0, y: 0 })] })],
      writes,
    );
    const frame = scene.byId('2')!;
    frame.setSharedPluginData('toghen', 'stamp', '{}');
    frame.x = 10;
    frame.x = 10;
    frame.remove();
    assert.deepEqual(writes.data.get(2), { 'toghen.stamp': '{}' });
    assert.deepEqual(writes.moved.get(2), { x: 10, y: 0 });
    assert.deepEqual(writes.removed, [2]);
  });
});
