/**
 * Two components written to use what kdlet gives a component file beyond the first three fixtures
 * (`toggle`, `control`, `shell`): `else` chains, guards built from `all`, `any` and `not` over two
 * axes, a `when` inside a `when`, a `when` that adds a layer, a `define` with parameters called
 * several times, and a `define` whose `block` takes the caller's children.
 *
 * `notice` has the first group, `stepper` the second. Each is read, and then sent to the plugin as text and
 * run against the mock.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readComponentFile } from '../../shared/components/index.js';
import type { Layer, Member, Value } from '../../shared/components/index.js';
import { createFigmaMock, useFigmaMock, type FigmaMockHandle } from '../support/figmaMock.js';
import { byAddress, fixture, rgba, runFile, stampOf } from './support.js';

type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The tokens, styles and modes the two fixtures name: the test file's variables. */
function kdletFixturesMock() {
  const dimensions = { 'space/sm': 8, 'space/md': 16, 'space/lg': 24, 'radius/md': 6, 'radius/full': 999 };
  const colours = [
    'surface/page',
    'surface/muted',
    'surface/raised',
    'surface/accent',
    'surface/control',
    'surface/control-active',
    'border/subtle',
    'border/strong',
  ];
  const mock = createFigmaMock()
    .withFonts([
      { family: 'Inter', style: 'Regular' },
      { family: 'Inter', style: 'Medium' },
      { family: 'Inter', style: 'Semi Bold' },
    ])
    .withCollection('Demo', ['light'])
    .withCollection('Scale', ['default', 'small']);
  for (const [name, value] of Object.entries(dimensions)) mock.withVariable('Demo', `${name}`, 'FLOAT', { light: value });
  colours.forEach((name, i) => {
    mock.withVariable('Demo', `${name}`, 'COLOR', { light: rgba(i / 10, 0.5, 0.5) });
  });
  return mock
    .withStyle('TEXT', 'text/label', { fontName: { family: 'Inter', style: 'Medium' } })
    .withStyle('TEXT', 'text/label-small', { fontName: { family: 'Inter', style: 'Semi Bold' } });
}

const token = (path: string): Value => ({ kind: 'token', path });
const literal = (value: number): Value => ({ kind: 'literal', value });
const property = (name: string): Value => ({ kind: 'property', name });

const find = (layer: Layer, address: string): Layer | undefined =>
  layer.address === address ? layer : layer.children.map((child) => find(child, address)).find((found) => found !== undefined);

const addresses = (layer: Layer): string[] => layer.children.map((child) => child.address);

const member = (members: Member[], name: string): Member => {
  const found = members.find((m) => m.name === name);
  assert.ok(found, `no member named ${name}; there are ${members.map((m) => m.name).join(' | ')}`);
  return found;
};

/** The addresses of a built member's direct children, as stamped. */
const builtChildren = (node: Node): string[] => (node.children as Node[]).map((child) => stampOf(child)?.is.address as string);

/** A file is run the second time against what the first built: same set, same members, nothing created or deleted. */
async function buildsThenReconciles(mock: FigmaMockHandle, text: string, expected: number) {
  const execute = () => runFile(mock, text);
  const first = await execute();
  assert.equal(first.created.length, expected);
  const set = mock.node(first.setId!) as Node;
  assert.ok(set, 'the set exists');
  const ids = (set.children as Node[]).map((m) => m.id);

  const second = await execute();
  assert.equal(second.setId, first.setId);
  assert.deepEqual(second.created, []);
  assert.deepEqual(second.deleted, []);
  // Nothing changed in the file or in Figma: every receipt matches both, and no member is patched.
  assert.deepEqual(second.updated, []);
  assert.deepEqual(
    second.steps.filter((step) => step.kind === 'PATCH_LAYER'),
    [],
  );
  assert.deepEqual(
    (set.children as Node[]).map((m) => m.id),
    ids,
  );
  return { first, set };
}

for (const { name, count } of [
  { name: 'notice', count: 8 },
  { name: 'stepper', count: 6 },
]) {
  describe(`${name}: the file, sent to the plugin as text and run against the mock`, () => {
    useFigmaMock();

    it('builds the set, then reconciles it with the same ids', async () => {
      const mock = kdletFixturesMock().install();
      await buildsThenReconciles(mock, fixture(name), count);
    });

    it('builds on the page it is told to', async () => {
      const mock = kdletFixturesMock().withPage('Page 1').install();
      const report = await runFile(mock, fixture(name), { page: 'Page 1' });
      assert.equal(report.created.length, count);
    });
  });
}

describe('notice: else, guards over two axes, a when inside a when, a layer a when adds', () => {
  useFigmaMock();
  const text = fixture('notice');
  const file = readComponentFile(text);
  const root = (name: string) => member(file.members, name).tree;

  it('reads with no problem at all, warnings included', () => {
    assert.deepEqual(file.problems, []);
  });

  it('expands to the four tones by the two emphases, the last axis varying fastest', () => {
    assert.deepEqual(
      file.members.map((m) => m.name),
      [
        'Tone=info, Emphasis=subtle',
        'Tone=info, Emphasis=strong',
        'Tone=success, Emphasis=subtle',
        'Tone=success, Emphasis=strong',
        'Tone=warning, Emphasis=subtle',
        'Tone=warning, Emphasis=strong',
        'Tone=danger, Emphasis=subtle',
        'Tone=danger, Emphasis=strong',
      ],
    );
  });

  it('picks the surface with a chain of else: the first guard that holds, and the bare else for what is left', () => {
    const fills = (tone: string) => root(`Tone=${tone}, Emphasis=subtle`).fields.fills;
    assert.deepEqual(fills('info'), [token('surface.muted')]);
    assert.deepEqual(fills('success'), [token('surface.raised')]);
    assert.deepEqual(fills('warning'), [token('surface.page')]);
    assert.deepEqual(fills('danger'), [token('surface.control-active')]);
  });

  it('lets the when inside a when apply only where both hold: strong, and danger', () => {
    const fills = (tone: string) => root(`Tone=${tone}, Emphasis=strong`).fields.fills;
    assert.deepEqual(fills('danger'), [token('surface.accent')], 'strong danger takes the accent, after the chain');
    assert.deepEqual(fills('warning'), [token('surface.page')], 'strong alone leaves the chain’s fill');
    assert.deepEqual(fills('info'), [token('surface.muted')]);
    assert.deepEqual(root('Tone=danger, Emphasis=subtle').fields.fills, [token('surface.control-active')], 'danger alone does not');
  });

  it('writes the outer when’s fields on its line and its list, and nothing where it does not hold', () => {
    const subtle = root('Tone=info, Emphasis=subtle');
    const strong = root('Tone=info, Emphasis=strong');
    assert.deepEqual(subtle.fields.strokeWeight, literal(1));
    assert.deepEqual(subtle.fields.strokes, [token('border.subtle')]);
    assert.deepEqual(strong.fields.strokeWeight, literal(2));
    assert.deepEqual(strong.fields.strokes, [token('border.strong')]);
  });

  it('adds the alert bar where the guard built from any and all holds: every danger, and a warning only when strong', () => {
    const withBar = file.members.filter((m) => find(m.tree, 'Alert bar')).map((m) => m.name);
    assert.deepEqual(withBar, ['Tone=warning, Emphasis=strong', 'Tone=danger, Emphasis=subtle', 'Tone=danger, Emphasis=strong']);
  });

  it('puts the alert bar first under the root, ahead of the content, and nowhere else', () => {
    const alarming = root('Tone=danger, Emphasis=strong');
    assert.deepEqual(addresses(alarming), ['Alert bar', 'Content']);
    assert.deepEqual(alarming.children[0].fields.width, literal(4));
    assert.deepEqual(alarming.children[0].fields.fills, [token('border.strong')]);
    assert.deepEqual(addresses(root('Tone=info, Emphasis=subtle')), ['Content']);
    assert.deepEqual(addresses(root('Tone=warning, Emphasis=subtle')), ['Content']);
  });

  it('contrasts the quietest member with the loudest: surface, outline, bar and the action’s own fill', () => {
    const quiet = root('Tone=info, Emphasis=subtle');
    const loud = root('Tone=danger, Emphasis=strong');
    assert.deepEqual([quiet.fields.fills, loud.fields.fills], [[token('surface.muted')], [token('surface.accent')]]);
    assert.deepEqual([quiet.fields.strokes, loud.fields.strokes], [[token('border.subtle')], [token('border.strong')]]);
    assert.deepEqual([addresses(quiet), addresses(loud)], [['Content'], ['Alert bar', 'Content']]);
    assert.deepEqual(find(quiet, 'Action')?.fields.fills, [token('surface.control')]);
    assert.deepEqual(find(loud, 'Action')?.fields.fills, [token('surface.raised')]);
  });

  it('wires its two booleans to visible and its three texts to characters, in every member', () => {
    for (const m of file.members) {
      assert.deepEqual(find(m.tree, 'Title')?.fields.visible, property('Show Title'));
      assert.deepEqual(find(m.tree, 'Action')?.fields.visible, property('Show Action'));
      assert.deepEqual(find(m.tree, 'Title')?.fields.characters, property('Title'));
      assert.deepEqual(find(m.tree, 'Message')?.fields.characters, property('Message'));
      assert.deepEqual(find(m.tree, 'Action label')?.fields.characters, property('Action label'));
    }
  });

  it('builds the alert bar in the members that have it, as the first child, and not in the others', async () => {
    const mock = kdletFixturesMock().install();
    const report = await runFile(mock, text);
    const set = mock.node(report.setId!) as Node;
    const children = (name: string) => builtChildren((set.children as Node[]).find((m) => m.name === name));
    assert.deepEqual(children('Tone=danger, Emphasis=strong'), ['Alert bar', 'Content']);
    assert.deepEqual(children('Tone=warning, Emphasis=strong'), ['Alert bar', 'Content']);
    assert.deepEqual(children('Tone=warning, Emphasis=subtle'), ['Content']);
    assert.ok(byAddress((set.children as Node[])[0]).has('Action label'));
  });

  it('gives a text its characters before its sizing: sized while empty, it stays 0 wide in Figma (measured)', async () => {
    const mock = kdletFixturesMock().install();
    const report = await runFile(mock, text);
    const set = mock.node(report.setId!) as Node;
    const title = byAddress((set.children as Node[])[0]).get('Title') as Node;
    const calls = mock.calls().filter((c) => c.args[0] === title.id);
    const at = (field: string) => calls.findIndex((c) => c.api === 'node.set' && c.args[1] === field);
    assert.ok(at('characters') !== -1 && at('layoutSizingHorizontal') !== -1);
    assert.ok(at('characters') < at('layoutSizingHorizontal'), 'the characters are set before the text fills its parent');
  });
});

describe('stepper: parameters, defaults, a block, and a call made more than once', () => {
  useFigmaMock();
  const text = fixture('stepper');
  const file = readComponentFile(text);
  const root = (name: string) => member(file.members, name).tree;
  const step = (name: string, address: string) => find(root(name), address) as Layer;

  it('reads with no problem at all, warnings included', () => {
    assert.deepEqual(file.problems, []);
  });

  it('expands to the three progress values by the two sizes', () => {
    assert.deepEqual(
      file.members.map((m) => m.name),
      [
        'Progress=first, Size=comfortable',
        'Progress=first, Size=compact',
        'Progress=second, Size=comfortable',
        'Progress=second, Size=compact',
        'Progress=third, Size=comfortable',
        'Progress=third, Size=compact',
      ],
    );
  });

  it('makes three steps and two links from two definitions, each layer with the address its call gave it', () => {
    for (const m of file.members) {
      assert.deepEqual(addresses(m.tree), ['Step one', 'Link one', 'Step two', 'Link two', 'Step three']);
      assert.deepEqual(
        m.tree.children.map((c) => addresses(c)),
        [['Step one label'], [], ['Step two label'], [], ['Step three label']],
      );
    }
  });

  it('reads the same parameter differently in each call: current, done, and still to come', () => {
    const fills = (name: string) => ['Step one', 'Step two', 'Step three'].map((s) => step(name, s).fields.fills);
    assert.deepEqual(fills('Progress=first, Size=comfortable'), [
      [token('surface.accent')],
      [token('surface.muted')],
      [token('surface.muted')],
    ]);
    assert.deepEqual(fills('Progress=second, Size=comfortable'), [
      [token('surface.raised')],
      [token('surface.accent')],
      [token('surface.muted')],
    ]);
    assert.deepEqual(fills('Progress=third, Size=comfortable'), [
      [token('surface.raised')],
      [token('surface.raised')],
      [token('surface.accent')],
    ]);
  });

  it('lets a parameter left out take its default: a step with no done-at is never behind us', () => {
    // Step three was called with neither done-at nor also-done-at, so no progress makes it a done step.
    for (const m of file.members) {
      assert.notDeepEqual(find(m.tree, 'Step three')?.fields.fills, [token('surface.raised')]);
    }
    // Step two was called with one, so only the last progress does.
    assert.deepEqual(step('Progress=second, Size=comfortable', 'Step two').fields.fills, [token('surface.accent')]);
    assert.deepEqual(step('Progress=third, Size=comfortable', 'Step two').fields.fills, [token('surface.raised')]);
  });

  it('dims the steps still to come with the guard built from not, and no other', () => {
    const opacity = (name: string) => ['Step one', 'Step two', 'Step three'].map((s) => step(name, s).fields.opacity);
    assert.deepEqual(opacity('Progress=first, Size=comfortable'), [undefined, literal(0.6), literal(0.6)]);
    assert.deepEqual(opacity('Progress=second, Size=comfortable'), [undefined, undefined, literal(0.6)]);
    assert.deepEqual(opacity('Progress=third, Size=comfortable'), [undefined, undefined, undefined]);
  });

  it('draws the current step with the strong outline, and the others with the subtle', () => {
    const strokes = (name: string) => ['Step one', 'Step two', 'Step three'].map((s) => step(name, s).fields.strokes);
    assert.deepEqual(strokes('Progress=second, Size=comfortable'), [
      [token('border.subtle')],
      [token('border.strong')],
      [token('border.subtle')],
    ]);
  });

  it('calls a second definition twice and fills each link once the step before it is behind us', () => {
    const links = (name: string) => ['Link one', 'Link two'].map((l) => step(name, l).fields.fills);
    assert.deepEqual(links('Progress=first, Size=comfortable'), [[token('surface.muted')], [token('surface.muted')]]);
    assert.deepEqual(links('Progress=second, Size=comfortable'), [[token('surface.accent')], [token('surface.muted')]]);
    assert.deepEqual(links('Progress=third, Size=comfortable'), [[token('surface.accent')], [token('surface.accent')]]);
  });

  it('passes a property wire through a parameter: the third step and its link follow Show Third, the others are plainly visible', () => {
    const m = 'Progress=first, Size=comfortable';
    assert.deepEqual(step(m, 'Step three').fields.visible, property('Show Third'));
    assert.deepEqual(step(m, 'Link two').fields.visible, property('Show Third'));
    assert.deepEqual(step(m, 'Step one').fields.visible, { kind: 'plain', value: true });
    assert.deepEqual(step(m, 'Link one').fields.visible, { kind: 'plain', value: true });
  });

  it('puts the caller’s children in the block, and reads their when in the caller’s scope', () => {
    const label = (name: string, address: string) => step(name, address).children[0];
    assert.equal(label('Progress=first, Size=comfortable', 'Step one').address, 'Step one label');
    assert.deepEqual(label('Progress=first, Size=comfortable', 'Step one').fields.characters, property('First label'));
    assert.deepEqual(label('Progress=first, Size=comfortable', 'Step three').fields.characters, property('Third label'));
    assert.deepEqual(label('Progress=first, Size=comfortable', 'Step one').fields.textStyle, token('text.label'));
    assert.deepEqual(label('Progress=first, Size=compact', 'Step one').fields.textStyle, token('text.label-small'));
    assert.deepEqual(label('Progress=first, Size=compact', 'Step three').fields.textStyle, token('text.label-small'));
  });

  it('pins the scale mode and tightens the spacing in the compact members, and in no other', () => {
    for (const m of file.members) {
      const compact = m.combination.Size === 'compact';
      assert.deepEqual(m.tree.fields.modes, compact ? { Scale: 'small' } : undefined, m.name);
      assert.deepEqual(m.tree.fields.itemSpacing, token(compact ? 'space.sm' : 'space.md'), m.name);
    }
  });

  it('contrasts the first member with the last: who is current, who is done, the links, the spacing and the text style', () => {
    const start = 'Progress=first, Size=comfortable';
    const end = 'Progress=third, Size=compact';
    assert.deepEqual(
      ['Step one', 'Step two', 'Step three'].map((s) => step(start, s).fields.fills),
      [[token('surface.accent')], [token('surface.muted')], [token('surface.muted')]],
    );
    assert.deepEqual(
      ['Step one', 'Step two', 'Step three'].map((s) => step(end, s).fields.fills),
      [[token('surface.raised')], [token('surface.raised')], [token('surface.accent')]],
    );
    assert.deepEqual(
      ['Link one', 'Link two'].map((l) => [step(start, l).fields.fills, step(end, l).fields.fills]),
      [
        [[token('surface.muted')], [token('surface.accent')]],
        [[token('surface.muted')], [token('surface.accent')]],
      ],
    );
    assert.deepEqual([root(start).fields.itemSpacing, root(end).fields.itemSpacing], [token('space.md'), token('space.sm')]);
    assert.deepEqual([step(start, 'Step two').fields.opacity, step(end, 'Step two').fields.opacity], [literal(0.6), undefined]);
  });

  it('builds the dimmed steps with an opacity and the others without, as the mock holds them', async () => {
    const mock = kdletFixturesMock().install();
    const report = await runFile(mock, text);
    const set = mock.node(report.setId!) as Node;
    const layers = (name: string) => byAddress((set.children as Node[]).find((m) => m.name === name));
    assert.equal(layers('Progress=first, Size=comfortable').get('Step two').opacity, 0.6);
    assert.equal(layers('Progress=third, Size=comfortable').get('Step two').opacity, 1);
  });
});
