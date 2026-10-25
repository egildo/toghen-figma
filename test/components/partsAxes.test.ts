/**
 * Axes from the parts vocabulary, in a component file.
 *
 * A component that names its token group gets one axis per vocabulary axis its subgroups use, `rest` the
 * default value. An axis folded into modes pins the collection named after it on every member's root; one
 * left in the path pins nothing and selects the part group the member's layers bind. `layout=parts` lays every
 * axis of a component in the path. Synthetic tokens in the W3C structured shapes, read through the
 * `designSourceOf` the plugin uses, and built against what the variable sync leaves in the mock file.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver, type ResolverDocument } from '@toghen/lib';
import { designSourceOf } from '../../main/utils/designSource.js';
import { LOAD_DOCUMENT } from '../../main/handlers/loadDocument.js';
import { oneFile } from '../support/oneFile.js';
import { PLAN_VARIABLE_SYNC } from '../../main/handlers/planVariableSync.js';
import { EXECUTE_VARIABLE_SYNC } from '../../main/handlers/executeVariableSync.js';
import { CHECK_COMPONENTS } from '../../main/handlers/runComponent.js';
import { resetState } from '../../main/runtimeState.js';
import { readComponentFile } from '../../shared/components/index.js';
import type { Layer, Value } from '../../shared/components/index.js';
import { createFigmaMock, useFigmaMock } from '../support/figmaMock.js';
import { byAddress, runFile } from './support.js';

type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const px = (value: number) => ({ value, unit: 'px' });
const srgb = (...components: number[]) => ({ colorSpace: 'srgb', components });
const fill = (...components: number[]) => ({ $type: 'color', $value: srgb(...components) });
const token = (path: string): Value => ({ kind: 'token', path });

/**
 * `card` has a rest and a hover part, a `primary` variant with its own fill, and a hover over the primary one: so
 * `pointer` folds and `variant` cannot. `chip` has two pointer parts and nothing else.
 */
const DOCUMENT = {
  version: '2025-11-01',
  name: 'Demo',
  sets: {
    base: {
      sources: [
        {
          ui: {
            $extensions: {
              'com.toghen': {
                css: {
                  parts: {
                    pointer: { hover: ':hover', pressed: ':active' },
                    variant: { primary: "[data-variant='primary']", quiet: "[data-variant='quiet']" },
                  },
                },
              },
            },
            card: {
              backgroundColor: fill(1, 1, 1),
              borderRadius: { $type: 'dimension', $value: px(6) },
              hover: { backgroundColor: fill(0.95, 0.95, 0.95) },
              primary: { backgroundColor: fill(0, 0, 1), hover: { backgroundColor: fill(0, 0, 0.9) } },
            },
            chip: {
              backgroundColor: fill(0.9, 0.9, 0.9),
              hover: { backgroundColor: fill(0.8, 0.8, 0.8) },
              pressed: { backgroundColor: fill(0.7, 0.7, 0.7) },
            },
          },
        },
      ],
    },
  },
  resolutionOrder: [{ $ref: '#/sets/base' }],
} as unknown as ResolverDocument;

const design = designSourceOf(new Resolver(DOCUMENT));
const read = (text: string) => readComponentFile(text, design);
const errors = (file: ReturnType<typeof readComponentFile>) =>
  file.problems.filter((problem) => problem.severity === 'error').map((problem) => problem.message);
const CARD = (header = ' tokens="{ui.card}"', rest = '') => `component Card${header}\n${rest}FRAME Card layoutMode=HORIZONTAL\n`;
const fieldsOf = (member: { tree: Layer }, ...names: string[]) => Object.fromEntries(names.map((name) => [name, member.tree.fields[name]]));

describe('the axes a token group gets from its parts', () => {
  const file = read(CARD());

  it('is one axis per vocabulary axis the subgroups use, `rest` its default and the part keys used its values', () => {
    assert.deepEqual(errors(file), []);
    assert.deepEqual(
      file.component?.properties.map((property) => property.type === 'VARIANT' && [property.name, property.values, property.modifier]),
      [
        ['pointer', ['rest', 'hover'], 'pointer'],
        ['variant', ['rest', 'primary'], undefined],
      ],
    );
    assert.deepEqual(
      file.members.map((member) => member.name),
      ['pointer=rest, variant=rest', 'pointer=rest, variant=primary', 'pointer=hover, variant=rest', 'pointer=hover, variant=primary'],
    );
  });

  it('pins the folded axis on every root and the unfolded one nowhere', () => {
    assert.deepEqual(
      file.members.map((member) => member.tree.fields.modes),
      [{ pointer: 'rest' }, { pointer: 'rest' }, { pointer: 'hover' }, { pointer: 'hover' }],
    );
  });

  it('binds the rest variable for a folded axis, and the part’s variable else the rest’s for an unfolded one', () => {
    const [plain, primary, hoverPlain, hoverPrimary] = file.members;
    assert.deepEqual(fieldsOf(plain, 'fills', 'cornerRadius'), {
      fills: [token('ui.card.backgroundColor')],
      cornerRadius: token('ui.card.borderRadius'),
    });
    assert.deepEqual(
      fieldsOf(primary, 'fills', 'cornerRadius'),
      { fills: [token('ui.card.primary.backgroundColor')], cornerRadius: token('ui.card.borderRadius') },
      'the radius has no primary part: the rest’s',
    );
    assert.deepEqual(fieldsOf(hoverPlain, 'fills'), { fills: [token('ui.card.backgroundColor')] }, 'hover is a mode of the same variable');
    assert.deepEqual(fieldsOf(hoverPrimary, 'fills'), { fills: [token('ui.card.primary.backgroundColor')] });
  });

  it('is what a guard reads, as any axis is', () => {
    const guarded = read(`${CARD().replace('FRAME Card layoutMode=HORIZONTAL', '')}guard hovered { is (input)pointer hover }
FRAME Card layoutMode=HORIZONTAL {
    when hovered strokeWeight="{ui.card.borderRadius}"
}
`);
    assert.deepEqual(errors(guarded), []);
    assert.deepEqual(
      guarded.members.map((member) => member.tree.fields.strokeWeight !== undefined),
      [false, false, true, true],
    );
  });

  it('is the same for a group with a single axis', () => {
    const chip = read(CARD(' tokens="{ui.chip}"'));
    assert.deepEqual(
      chip.members.map((member) => member.name),
      ['pointer=rest', 'pointer=hover', 'pointer=pressed'],
    );
  });
});

describe('include and exclude name part keys under the axis names', () => {
  it('builds only the combinations an include matches', () => {
    const file = read(CARD(' tokens="{ui.card}"', 'include pointer=rest variant=rest\ninclude pointer=hover variant=primary\n'));
    assert.deepEqual(errors(file), []);
    assert.deepEqual(
      file.members.map((member) => member.name),
      ['pointer=rest, variant=rest', 'pointer=hover, variant=primary'],
    );
    assert.deepEqual(
      file.members.map((member) => member.tree.fields.modes),
      [{ pointer: 'rest' }, { pointer: 'hover' }],
    );
  });

  it('removes the combinations an exclude names, and refuses a key the group does not use', () => {
    const file = read(CARD(' tokens="{ui.chip}"', 'exclude pointer=pressed\n'));
    assert.deepEqual(
      file.members.map((member) => member.name),
      ['pointer=rest', 'pointer=hover'],
    );
    assert.match(
      errors(read(CARD(' tokens="{ui.chip}"', 'exclude pointer=quiet\n'))).join('\n'),
      /exclude pointer: "quiet" is not one of its values \(rest, hover, pressed\)/,
    );
  });

  it('refuses an exclude of the rest member, the default', () => {
    assert.match(errors(read(CARD(' tokens="{ui.chip}"', 'exclude pointer=rest\n'))).join('\n'), /default member/);
  });
});

describe('layout=parts', () => {
  const file = read(CARD(' tokens="{ui.card}" layout=parts'));

  it('puts every axis of the component in the path: no pin, and the most specific part group binds', () => {
    assert.deepEqual(errors(file), []);
    assert.equal(file.component?.layout, 'parts');
    assert.deepEqual(
      file.component?.properties.map((property) => property.type === 'VARIANT' && [property.name, property.modifier]),
      [
        ['pointer', undefined],
        ['variant', undefined],
      ],
    );
    assert.deepEqual(
      file.members.map((member) => member.tree.fields.modes),
      [undefined, undefined, undefined, undefined],
    );
    const fills = Object.fromEntries(file.members.map((member) => [member.name, (member.tree.fields.fills as Value[])[0]]));
    assert.deepEqual(fills, {
      'pointer=rest, variant=rest': token('ui.card.backgroundColor'),
      'pointer=rest, variant=primary': token('ui.card.primary.backgroundColor'),
      'pointer=hover, variant=rest': token('ui.card.hover.backgroundColor'),
      'pointer=hover, variant=primary': token('ui.card.primary.hover.backgroundColor'),
    });
  });

  it('is a word of the component line, with a place: only parts, and only beside tokens=', () => {
    assert.match(errors(read(CARD(' tokens="{ui.card}" layout=folded')))[0], /layout takes "parts"/);
    assert.match(
      errors(read(CARD(' layout=parts')))[0],
      /layout=parts is the layout of the parts of a token group, so it needs tokens="\{group\}"/,
    );
  });
});

describe('built against what the variable sync leaves', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  const FILE = CARD();

  it('binds the folded rest variable and the unfolded part’s, and pins the mode on the root', async () => {
    const mock = createFigmaMock().install();
    await LOAD_DOCUMENT(oneFile(JSON.stringify(DOCUMENT)));
    await PLAN_VARIABLE_SYNC({});
    await EXECUTE_VARIABLE_SYNC();
    const report = await runFile(mock, FILE, {}, 'ui/card.component.kdl');

    const set = mock.node(report.setId!) as Node;
    const pointer = mock.collection('pointer')!;
    const member = (name: string) => set.children.find((child: Node) => child.name === name) as Node;
    const bound = (name: string) => byAddress(member(name)).get('Card')!.fills[0].boundVariables.color.id;

    assert.equal(bound('pointer=rest, variant=rest'), mock.variable('pointer', 'ui/card/backgroundColor')!.id);
    assert.equal(bound('pointer=hover, variant=primary'), mock.variable('pointer', 'ui/card/primary/backgroundColor')!.id);
    assert.deepEqual(member('pointer=hover, variant=primary').explicitVariableModes, { [pointer.id]: pointer.modes[1].modeId });
    assert.deepEqual(member('pointer=rest, variant=primary').explicitVariableModes, { [pointer.id]: pointer.modes[0].modeId });
    assert.equal(mock.variable('Demo', 'ui/card/hover/backgroundColor'), undefined);
  });

  it('builds a layout=parts component against the variables the sync left in the path, once the files were checked first', async () => {
    const mock = createFigmaMock().install();
    const text = CARD(' tokens="{ui.card}" layout=parts');
    await LOAD_DOCUMENT(oneFile(JSON.stringify(DOCUMENT)));
    await CHECK_COMPONENTS({ files: [{ fileName: 'ui/card.component.kdl', text }] });
    await PLAN_VARIABLE_SYNC({});
    await EXECUTE_VARIABLE_SYNC();
    const report = await runFile(mock, text, {}, 'ui/card.component.kdl');

    const set = mock.node(report.setId!) as Node;
    const hoverPrimary = set.children.find((child: Node) => child.name === 'pointer=hover, variant=primary') as Node;
    assert.equal(
      byAddress(hoverPrimary).get('Card')!.fills[0].boundVariables.color.id,
      mock.variable('Demo', 'ui/card/primary/hover/backgroundColor')!.id,
    );
    assert.equal(
      mock.variable('Demo', 'ui/card/backgroundColor')?.name,
      'ui/card/backgroundColor',
      'the card stayed in the path, in the base collection',
    );
    assert.equal(mock.variable('pointer', 'ui/card/backgroundColor'), undefined);
    assert.ok(mock.variable('pointer', 'ui/chip/backgroundColor'), 'while the chip, which the file did not lay out so, folded');
    assert.deepEqual(hoverPrimary.explicitVariableModes, {});
  });

  it('stops, as any reference does, when the variable sync folded what the file lays out in the path', async () => {
    const mock = createFigmaMock().install();
    await LOAD_DOCUMENT(oneFile(JSON.stringify(DOCUMENT)));
    await PLAN_VARIABLE_SYNC({});
    await EXECUTE_VARIABLE_SYNC();

    await assert.rejects(
      runFile(mock, CARD(' tokens="{ui.card}" layout=parts'), {}, 'ui/card.component.kdl'),
      /names no variable|does not read/,
    );
  });
});
