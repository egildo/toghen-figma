/**
 * Axes from the tokens, and `include`.
 *
 * A variant axis may take its values from a modifier of the design system, and a
 * component may name its token group and get an axis for every element-state modifier
 * the group depends on. Both are read against a synthetic design system in the W3C
 * structured shapes, through the same `designSourceOf` the plugin uses, so what is
 * proved here is what a file sent to the plugin meets.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver, type ResolverDocument } from '@toghen/lib';
import { designSourceOf } from '../../main/utils/designSource.js';
import { LOAD_DOCUMENT } from '../../main/handlers/loadDocument.js';
import { oneFile } from '../support/oneFile.js';
import { CHECK_COMPONENTS, RUN_COMPONENT } from '../../main/handlers/runComponent.js';
import { resetState } from '../../main/runtimeState.js';
import type { Response } from '../../shared/protocol.js';
import { run } from '../../main/components/run.js';
import { readComponentFile } from '../../shared/components/index.js';
import type { Desired, DesignSource } from '../../shared/components/index.js';
import { createFigmaMock, useFigmaMock } from '../support/figmaMock.js';
import { saveLock } from '../../main/utils/lockStore.js';

type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const px = (value: number) => ({ value, unit: 'px' });
const srgb = (...components: number[]) => ({ colorSpace: 'srgb', components });

const CSS = (selector: string) => ({ 'com.toghen': { css: { selector } } });

/**
 * - `state` is a world like any modifier: rest, hover, pressed. Declared with `pressed` before `rest` and
 *   `rest` as the default, to show the default comes first. It is no longer special: only an axis a file takes from it by hand.
 * - `theme` and `density` are worlds too.
 * - `button` has a parts vocabulary: the axis `pointer` with the keys `hover` and `pressed`, and a token under each.
 *   `button.backgroundColor` varies with `state` and `theme`; `badge.color` with `theme` alone; `page.gap` with `density`.
 */
const DOCUMENT = {
  version: '2025-11-01',
  name: 'Demo',
  sets: {
    base: {
      sources: [
        {
          button: {
            $extensions: { 'com.toghen': { css: { parts: { pointer: { hover: ':hover', pressed: ':active' } } } } },
            backgroundColor: { $type: 'color', $value: srgb(0.9, 0.9, 0.9) },
            borderRadius: { $type: 'dimension', $value: px(6) },
            hover: { backgroundColor: { $type: 'color', $value: srgb(0.8, 0.8, 0.8) } },
            pressed: { backgroundColor: { $type: 'color', $value: srgb(0.7, 0.7, 0.7) } },
          },
          badge: { color: { $type: 'color', $value: srgb(0.5, 0.5, 0.5) } },
          card: { bg: { $type: 'color', $value: '{button.backgroundColor}' } },
          page: { gap: { $type: 'dimension', $value: px(8) } },
        },
      ],
    },
  },
  modifiers: {
    theme: {
      default: 'light',
      $extensions: CSS("[data-theme='{context}']"),
      contexts: {
        light: [{}],
        dark: [{ button: { backgroundColor: { $value: srgb(0.2, 0.2, 0.2) } }, badge: { color: { $value: srgb(0.7, 0.7, 0.7) } } }],
      },
    },
    density: {
      default: 'cosy',
      $extensions: CSS("[data-density='{context}']"),
      contexts: { cosy: [{}], compact: [{ page: { gap: { $value: px(4) } } }] },
    },
    state: {
      default: 'rest',
      $extensions: CSS("[data-state='{context}']"),
      contexts: {
        pressed: [{ button: { backgroundColor: { $value: srgb(0.4, 0.4, 0.4) } } }],
        hover: [{ button: { backgroundColor: { $value: srgb(0.8, 0.8, 0.8) } } }],
        rest: [{}],
      },
    },
  },
  resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }, { $ref: '#/modifiers/density' }, { $ref: '#/modifiers/state' }],
} as ResolverDocument;
const DESIGN = new Resolver(DOCUMENT);

const design = designSourceOf(DESIGN);

/** `null` is no design system at all; leaving it out is the synthetic one. */
const read = (text: string, source: DesignSource | null = design) => readComponentFile(text, source ?? undefined);
const errors = (file: ReturnType<typeof readComponentFile>) =>
  file.problems.filter((problem) => problem.severity === 'error').map((problem) => problem.message);

/** A one-layer component with `properties`, and `rest` written after the root. */
const component = (header: string, properties: string, rest = '') => `component Button${header}
properties {
${properties}
}
FRAME Button layoutMode=HORIZONTAL {
    fills "{button.backgroundColor}"
}
${rest}`;

describe('an axis that takes its values from a modifier', () => {
  const file = read(component('', '    VARIANT State (modifier)"state"'));

  it('has the modifier’s contexts, default first, whatever order the document declares them in', () => {
    assert.deepEqual(errors(file), []);
    assert.deepEqual(file.component?.properties, [
      { type: 'VARIANT', name: 'State', values: ['rest', 'pressed', 'hover'], modifier: 'state', loc: { line: 3, column: 5 } },
    ]);
  });

  it('makes a member per context, the default context’s first', () => {
    assert.deepEqual(
      file.members.map((member) => member.name),
      ['State=rest', 'State=pressed', 'State=hover'],
    );
  });

  it('pins the modifier’s collection to the member’s value on its root, with no line written for it', () => {
    assert.deepEqual(
      file.members.map((member) => member.tree.fields.modes),
      [{ state: 'rest' }, { state: 'pressed' }, { state: 'hover' }],
    );
  });

  it('is read by a guard as an input, as any axis is', () => {
    const guarded = read(`component Button
properties {
    VARIANT State (modifier)"state"
}
guard hovered { is (input)State hover }
FRAME Button layoutMode=HORIZONTAL {
    fills "{button.backgroundColor}"
    when hovered { fills "{card.bg}" }
}
`);
    assert.deepEqual(errors(guarded), []);
    const fills = (name: string) =>
      (guarded.members.find((member) => member.name === name)?.tree.fields.fills as { path: string }[])[0].path;
    assert.equal(fills('State=hover'), 'card.bg');
    assert.equal(fills('State=rest'), 'button.backgroundColor');
  });

  it('adds a member when the document gains a context', () => {
    const withFocus: DesignSource = {
      contexts: (name) => (name === 'state' ? ['rest', 'pressed', 'hover', 'focus'] : undefined),
      partsOf: () => [],
    };
    assert.deepEqual(
      read(component('', '    VARIANT State (modifier)"state"'), withFocus).members.map((member) => member.name),
      ['State=rest', 'State=pressed', 'State=hover', 'State=focus'],
    );
  });

  it('stops the read when the design system has no such modifier', () => {
    const missing = read(component('', '    VARIANT State (modifier)"nowhere"'));
    assert.deepEqual(errors(missing), [
      'VARIANT "State" takes its values from the modifier "nowhere", which the design system does not have',
    ]);
    assert.deepEqual(missing.members, []);
  });

  it('stops the read when no design system is loaded, and says what to give', () => {
    const none = read(component('', '    VARIANT State (modifier)"state"'), null);
    assert.match(
      errors(none)[0],
      /takes its values from the modifier "state", and no design system is loaded; load its resolver document in the plugin, or pass it to the command line/,
    );
    assert.equal(none.problems[0].line, 3);
  });

  it('refuses a context a variant value cannot be', () => {
    const odd: DesignSource = { contexts: () => ['rest', 'a,b'], partsOf: () => [] };
    assert.match(errors(read(component('', '    VARIANT State (modifier)"state"'), odd))[0], /the context "a,b" cannot be a variant value/);
  });

  it('is the tag’s only place: beside other values, twice, and in a layer', () => {
    assert.match(
      errors(read(component('', '    VARIANT State (modifier)"state" hover'))).join('\n'),
      /takes \(modifier\)"<name>" alone, or a list of values/,
    );
    assert.match(
      errors(read(component('', '    VARIANT State (modifier)"state" (modifier)"theme"'))).join('\n'),
      /takes \(modifier\)"<name>" alone/,
    );
    assert.match(
      errors(read(component('', '    VARIANT State rest hover', 'FRAME Other cornerRadius=(modifier)"state"\n'))).join('\n'),
      /modifier/,
    );
    assert.match(errors(read(component('', '    BOOLEAN Flag default=(modifier)#true'))).join('\n'), /Flag/);
  });

  it('refuses a file that also pins the same collection on its root', () => {
    const own = read(`component Button
properties {
    VARIANT State (modifier)"state"
}
FRAME Button layoutMode=HORIZONTAL {
    modes state=hover
}
`);
    assert.match(errors(own)[0], /modes state=… on the root layer: the VARIANT axis "State" already pins "state"/);
    assert.equal(own.problems[0].line, 6);
    assert.deepEqual(own.members, []);
  });

  it('refuses the same pin written by a when', () => {
    const own = read(`component Button
properties {
    VARIANT State (modifier)"state"
}
guard hovered { is (input)State hover }
FRAME Button layoutMode=HORIZONTAL {
    when hovered { modes state=pressed }
}
`);
    assert.match(errors(own)[0], /two writers of one pin/);
    assert.equal(own.problems[0].line, 7);
  });

  it('lets the file pin another collection on its root, beside the axis’s pin', () => {
    const both = read(`component Button
properties {
    VARIANT State (modifier)"state"
}
FRAME Button layoutMode=HORIZONTAL {
    modes theme=dark
}
`);
    assert.deepEqual(errors(both), []);
    assert.deepEqual(both.members[1].tree.fields.modes, { theme: 'dark', state: 'pressed' });
  });
});

describe('a component that names its token group', () => {
  it('gets an axis for every axis of the parts vocabulary its subgroups use, and none for a world', () => {
    const file = read(component(' tokens="{button}"', ''));

    assert.deepEqual(errors(file), []);
    // `button.backgroundColor` varies with `theme` and `state`, which are worlds: only `pointer`, from the parts, is an axis.
    assert.deepEqual(
      file.component?.properties.map((property) => [
        property.type,
        property.name,
        'modifier' in property ? property.modifier : undefined,
        'values' in property ? property.values : undefined,
      ]),
      [['VARIANT', 'pointer', 'pointer', ['rest', 'hover', 'pressed']]],
    );
    assert.deepEqual(
      file.members.map((member) => member.name),
      ['pointer=rest', 'pointer=hover', 'pointer=pressed'],
    );
    assert.equal(file.component?.tokens, 'button');
    assert.deepEqual(file.members[2].tree.fields.modes, { pointer: 'pressed' }, 'a folded axis pins the collection named after it');
    assert.deepEqual(file.members[0].tree.fields.modes, { pointer: 'rest' });
  });

  it('gets none for a group with no parts, whatever worlds its tokens vary with', () => {
    const file = read(component(' tokens="{badge}"', ''));

    assert.deepEqual(errors(file), []);
    assert.deepEqual(file.component?.properties, [], 'badge.color varies on theme, which a designer sets on the frame around');
    assert.deepEqual(
      file.members.map((member) => member.name),
      ['Button'],
    );
    assert.equal(file.members[0].tree.fields.modes, undefined);
  });

  it('gets none for a group that depends on nothing', () => {
    assert.deepEqual(read(component(' tokens="{page}"', '')).component?.properties, []);
  });

  it('puts the part axes after the declared ones', () => {
    const file = read(`component Button tokens="{button}"
properties {
    VARIANT Size small large
    BOOLEAN Flag default=#true
}
FRAME Button layoutMode=HORIZONTAL {
    FRAME Extra visible=(property)Flag
}
`);
    assert.deepEqual(errors(file), []);
    assert.deepEqual(
      file.members.map((member) => member.name),
      [
        'Size=small, pointer=rest',
        'Size=small, pointer=hover',
        'Size=small, pointer=pressed',
        'Size=large, pointer=rest',
        'Size=large, pointer=hover',
        'Size=large, pointer=pressed',
      ],
    );
  });

  it('may still declare a world by hand, which is then the author’s choice', () => {
    const file = read(component('', '    VARIANT Scheme (modifier)"theme"'));
    assert.deepEqual(errors(file), []);
    assert.deepEqual(
      file.members.map((member) => member.tree.fields.modes),
      [{ theme: 'light' }, { theme: 'dark' }],
    );
  });

  it('stops the read when the group names nothing', () => {
    const file = read(component(' tokens="{nothing}"', ''));
    assert.deepEqual(errors(file), ['component tokens="{nothing}" names no token and no group of the design system']);
    assert.deepEqual(file.members, []);
  });

  it('stops the read when no design system is loaded', () => {
    assert.match(
      errors(read(component(' tokens="{button}"', ''), null))[0],
      /takes its axes from the tokens it names, and no design system is loaded/,
    );
  });

  it('wants a token reference in quotes', () => {
    assert.match(
      errors(read(component(' tokens="button"', '')))[0],
      /tokens takes a token reference in quotes, such as tokens="\{button\}"/,
    );
    assert.match(errors(read(component(' tokens=3', '')))[0], /tokens takes a token reference in quotes/);
  });

  it('lets a declared axis of the same name win; when the inferred one would fold, it stops and says what to do', () => {
    const file = read(component(' tokens="{button}"', '    VARIANT pointer a b'));
    assert.match(errors(file)[0], /^VARIANT "pointer" is declared and also comes from the parts of "button", which fold it into modes/);
    assert.match(errors(file)[0], /Drop the declared axis, or lay the component out with layout=parts$/);
  });
});

describe('include', () => {
  const header = `component Button
properties {
    VARIANT Size small medium large
    VARIANT State rest hover pressed
}
`;
  const root = 'FRAME Button layoutMode=HORIZONTAL\n';
  const names = (text: string) => read(header + text + root).members.map((member) => member.name);

  it('builds every combination when the file writes none', () => {
    assert.equal(names('').length, 9);
  });

  it('builds only the combinations a line matches', () => {
    assert.deepEqual(names('include State=rest Size=small\ninclude State=hover Size=small\n'), [
      'Size=small, State=rest',
      'Size=small, State=hover',
    ]);
  });

  it('matches any value of an axis a line does not name', () => {
    assert.deepEqual(names('include State=rest\n'), ['Size=small, State=rest', 'Size=medium, State=rest', 'Size=large, State=rest']);
  });

  it('is narrowed by exclude, which removes from what include kept', () => {
    assert.deepEqual(names('include State=rest\ninclude Size=small\nexclude Size=small State=pressed\nexclude Size=large State=rest\n'), [
      'Size=small, State=rest',
      'Size=small, State=hover',
      'Size=medium, State=rest',
    ]);
  });

  it('keeps the members in declared axis order, the last axis fastest, whatever order the lines are in', () => {
    assert.deepEqual(names('include Size=large State=hover\ninclude Size=small State=rest\n'), [
      'Size=small, State=rest',
      'Size=large, State=hover',
    ]);
  });

  it('must include the default member, as exclude may not remove it', () => {
    const file = read(`${header}include Size=large State=hover\n${root}`);
    assert.match(errors(file)[0], /include does not include the default member \(Size=small, State=rest\)/);
    assert.equal(file.problems[0].line, 6);
    assert.deepEqual(file.members, []);
  });

  it('is held to the axes like exclude: an axis that is none, a value that is none', () => {
    assert.match(
      errors(read(`${header}include Weight=bold State=rest\n${root}`)).join('\n'),
      /include names "Weight", which is not a VARIANT axis/,
    );
    assert.match(
      errors(read(`${header}include Size=huge\n${root}`)).join('\n'),
      /include Size: "huge" is not one of its values \(small, medium, large\)/,
    );
  });

  it('takes one value for each axis it names, quoted when it is not a word', () => {
    assert.match(errors(read(`${header}include\n${root}`)).join('\n'), /include needs at least one Axis=value/);
    assert.match(errors(read(`${header}include Size=3\n${root}`)).join('\n'), /include takes Size="<value>"/);
  });

  it('works on an axis taken from a modifier', () => {
    const file = read(`component Button
properties {
    VARIANT State (modifier)"state"
    VARIANT Size small large
}
include State=rest
include State=hover Size=small
FRAME Button layoutMode=HORIZONTAL
`);
    assert.deepEqual(
      file.members.map((member) => member.name),
      ['State=rest, Size=small', 'State=rest, Size=large', 'State=hover, Size=small'],
    );
    assert.deepEqual(
      file.members.map((member) => member.tree.fields.modes),
      [{ state: 'rest' }, { state: 'rest' }, { state: 'hover' }],
    );
  });
});

describe('a component with an axis from a modifier, built against the file', () => {
  useFigmaMock();

  /** What variable sync leaves: a collection per modifier, a mode per context, the default first. */
  const fileMock = () =>
    createFigmaMock()
      .withCollection('state', ['rest', 'pressed', 'hover'])
      .withCollection('Demo', ['default'])
      .withVariable('Demo', 'button/backgroundColor', 'COLOR', { default: { r: 1, g: 1, b: 1, a: 1 } });

  const desired = (text: string): Desired => {
    const parsed = read(text);
    assert.deepEqual(errors(parsed), []);
    return JSON.parse(JSON.stringify({ component: parsed.component, members: parsed.members })) as Desired;
  };

  it('pins each member to its mode of the modifier’s collection, and the frame around decides the rest', async () => {
    const mock = fileMock().install();
    const report = await run(desired(component('', '    VARIANT State (modifier)"state"')));

    const set = mock.node(report.setId!) as Node;
    const state = mock.collection('state')!;
    assert.deepEqual(
      set.children.map((member: Node) => [member.name, member.explicitVariableModes]),
      [
        ['State=rest', { [state.id]: state.modes[0].modeId }],
        ['State=pressed', { [state.id]: state.modes[1].modeId }],
        ['State=hover', { [state.id]: state.modes[2].modeId }],
      ],
    );
    assert.equal(mock.collections().length, 2, 'and no collection of the theme is pinned: the frame around the instance decides it');
  });

  it('stops before it writes when the collection or the context is not in the file', async () => {
    const mock = createFigmaMock()
      .withCollection('Demo', ['default'])
      .withVariable('Demo', 'button/backgroundColor', 'COLOR', { default: { r: 1, g: 1, b: 1, a: 1 } })
      .install();
    const before = mock.writes().length;

    await assert.rejects(run(desired(component('', '    VARIANT State (modifier)"state"'))), /no local variable collection named "state"/);
    assert.equal(mock.writes().length, before);
  });

  it('refuses a collection a declared library holds, in a dry run as in a real one: not measured in Figma yet', async () => {
    const mock = createFigmaMock()
      .withCollection('Demo', ['default'])
      .withVariable('Demo', 'button/backgroundColor', 'COLOR', { default: { r: 1, g: 1, b: 1, a: 1 } })
      .install();
    saveLock({ libraries: { Kit: { by: 'build', components: {}, styles: {}, variables: { 'state/accent': 'a'.repeat(40) } } } });
    const before = mock.writes().length;
    const sentence =
      /modes state=rest: a library collection's mode \("state" in library "Kit"\) is not measured in Figma yet; pin it on FigCraft, or use a local collection/;
    for (const dryRun of [true, false])
      await assert.rejects(run(desired(component('', '    VARIANT State (modifier)"state"')), { libraries: ['Kit'], dryRun }), sentence);
    assert.equal(mock.writes().length, before);
    assert.deepEqual(mock.calls('importVariableByKeyAsync'), [], 'no unmeasured call: nothing is imported to find the collection');
  });

  it('names the local collections and the libraries it looked in for a collection nobody holds', async () => {
    createFigmaMock()
      .withCollection('Demo', ['default'])
      .withVariable('Demo', 'button/backgroundColor', 'COLOR', { default: { r: 1, g: 1, b: 1, a: 1 } })
      .install();
    saveLock({ libraries: { Kit: { by: 'build', components: {}, styles: {}, variables: { 'ground/accent': 'a'.repeat(40) } } } });
    await assert.rejects(
      run(desired(component('', '    VARIANT State (modifier)"state"')), { libraries: ['Kit'] }),
      /modes state=rest: no local variable collection named "state" \(this file has "Demo"\), and library "Kit" holds none/,
    );
  });

  it('builds the members an include keeps, and reconciles them in place', async () => {
    const mock = fileMock().install();
    const text = component('', '    VARIANT State (modifier)"state"', 'include State=rest\ninclude State=hover\n');

    const first = await run(desired(text));
    const set = mock.node(first.setId!) as Node;
    assert.deepEqual(
      set.children.map((member: Node) => member.name),
      ['State=rest', 'State=hover'],
    );

    const second = await run(
      desired(component('', '    VARIANT State (modifier)"state"', 'include State=rest\ninclude State=hover\ninclude State=pressed\n')),
    );
    assert.equal(second.setId, first.setId);
    assert.equal((mock.node(first.setId!) as Node).children.length, 3, 'a member new to the set is added');
  });
});

describe('the plugin, with and without a design system loaded', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  const text = component(' tokens="{button}"', '');
  const mock = () =>
    createFigmaMock()
      .withCollection('pointer', ['rest', 'hover', 'pressed'])
      .withCollection('Demo', ['default'])
      .withVariable('Demo', 'button/backgroundColor', 'COLOR', { default: { r: 1, g: 1, b: 1, a: 1 } })
      .withVariable('Demo', 'button/borderRadius', 'FLOAT', { default: 6 })
      .install();
  const last = (m: ReturnType<typeof mock>) =>
    m
      .calls('ui.postMessage')
      .map((call) => call.args[0] as Response)
      .at(-1)!;

  it('refuses a file that needs a design system when none is loaded, naming the line and what it needs', async () => {
    const m = mock();
    await RUN_COMPONENT({ text, fileName: 'ui/button.component.kdl', options: { dryRun: true } });

    const message = last(m);
    assert.ok(message.type === 'ERROR');
    assert.match(
      message.payload.problems![0],
      /^ui\/button\.component\.kdl:1:1 component tokens="\{button\}" takes its axes from the tokens it names, and no design system is loaded/,
    );

    const modifier = component('', '    VARIANT State (modifier)"state"');
    await RUN_COMPONENT({ text: modifier, fileName: 'ui/button.component.kdl', options: { dryRun: true } });
    const named = last(m);
    assert.ok(named.type === 'ERROR');
    assert.match(
      named.payload.problems![0],
      /^ui\/button\.component\.kdl:3:5 VARIANT "State" takes its values from the modifier "state", and no design system is loaded/,
    );
  });

  it('takes the axes from the resolver document the plugin has loaded', async () => {
    const m = mock();
    await LOAD_DOCUMENT(oneFile(JSON.stringify(DOCUMENT), 'demo.resolver.json'));
    await RUN_COMPONENT({ text, fileName: 'ui/button.component.kdl', options: { dryRun: true } });

    const message = last(m);
    assert.ok(message.type === 'COMPONENT_RUN', JSON.stringify(message));
    assert.deepEqual(
      message.payload.report.steps.map((step) => [step.kind, step.members]),
      [['CREATE_SET', 3]],
    );
  });

  it('checks the files the same way, before anything is sent on', async () => {
    const m = mock();
    await CHECK_COMPONENTS({ files: [{ fileName: 'ui/button.component.kdl', text }] });
    const refused = last(m);
    assert.ok(refused.type === 'ERROR');
    assert.match(refused.payload.problems![0], /^ui\/button\.component\.kdl:1:1 component tokens=/);

    await LOAD_DOCUMENT(oneFile(JSON.stringify(DOCUMENT), 'demo.resolver.json'));
    await CHECK_COMPONENTS({ files: [{ fileName: 'ui/button.component.kdl', text }], names: true });
    assert.equal(last(m).type, 'COMPONENTS_CHECKED');
  });
});
