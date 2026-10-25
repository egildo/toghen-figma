/**
 * A segment of a reference from an axis, and axes from a group.
 *
 * `{hue.(input)hue.soft.backgroundColor}` takes its second segment from the member's value of the axis `hue`,
 * and `VARIANT hue from="{hue}"` takes the axis's values from the children of a token group. Both are read
 * against a synthetic design system in the W3C structured shapes, through the same `designSourceOf` the plugin
 * uses, so what is proved here is what a file sent to the plugin meets.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver, type ResolverDocument } from '@toghen/lib';
import { designSourceOf } from '../../main/utils/designSource.js';
import { LOAD_DOCUMENT } from '../../main/handlers/loadDocument.js';
import { oneFile } from '../support/oneFile.js';
import { CHECK_COMPONENTS } from '../../main/handlers/runComponent.js';
import { resetState } from '../../main/runtimeState.js';
import { run } from '../../main/components/run.js';
import { readComponentFile } from '../../shared/components/index.js';
import type { Desired, DesignSource, Layer, Value } from '../../shared/components/index.js';
import type { Response } from '../../shared/protocol.js';
import { createFigmaMock, useFigmaMock } from '../support/figmaMock.js';

const srgb = (...components: number[]) => ({ colorSpace: 'srgb', components });
const colour = (r: number) => ({ $type: 'color', $value: srgb(r, 0.5, 0.5) });

/** One hue: a soft and a solid look, each a background, a border and a text colour. */
const hue = (r: number, looks: string[] = ['soft', 'solid']) =>
  Object.fromEntries(looks.map((look) => [look, { backgroundColor: colour(r), borderColor: colour(r / 2), color: colour(r / 4) }]));

/** A document whose `hue` group holds the given hues, in this order. `amber` has no solid look. */
const documentOf = (hues: string[]): ResolverDocument =>
  ({
    version: '2025-11-01',
    name: 'Demo',
    sets: {
      base: {
        sources: [
          {
            hue: Object.fromEntries(
              hues.map((name, index) => [name, hue(0.2 + index / 10, name === 'amber' ? ['soft'] : ['soft', 'solid'])]),
            ),
            size: {
              small: { $type: 'dimension', $value: { value: 4, unit: 'px' } },
              large: { $type: 'dimension', $value: { value: 8, unit: 'px' } },
            },
            'Header in': { $type: 'color', $value: srgb(0.1, 0.1, 0.1) },
          },
        ],
      },
    },
    resolutionOrder: [{ $ref: '#/sets/base' }],
  }) as ResolverDocument;

const HUES = ['blue', 'rose', 'green'];
const design = designSourceOf(new Resolver(documentOf(HUES)));

const read = (text: string, source: DesignSource | null = design) => readComponentFile(text, source ?? undefined);
const errors = (file: ReturnType<typeof readComponentFile>) =>
  file.problems.filter((problem) => problem.severity === 'error').map((problem) => problem.message);
const pathOf = (value: unknown): string => (value as Value & { path: string }).path;
const fillOf = (layer: Layer): string => pathOf((layer.fields.fills as Value[])[0]);
const child = (layer: Layer, address: string): Layer => layer.children.find((candidate) => candidate.address === address)!;

/** An avatar: a hue axis from the group, a look axis written out, fill, stroke and text from the hue and the look. */
const AVATAR = `component Avatar
properties {
    VARIANT hue from="{hue}"
    VARIANT look soft solid
}
guard soft { is (input)look soft }
guard solid { is (input)look solid }
FRAME Avatar layoutMode=HORIZONTAL {
    when soft {
        fills "{hue.(input)hue.soft.backgroundColor}"
        strokes "{hue.(input)hue.soft.borderColor}"
    }
    when solid {
        fills "{hue.(input)hue.solid.backgroundColor}"
        strokes "{hue.(input)hue.solid.borderColor}"
    }
    TEXT Initials characters="AB" {
        when soft { fills "{hue.(input)hue.soft.color}" }
        when solid { fills "{hue.(input)hue.solid.color}" }
    }
}
`;

describe('an axis that takes its values from a group', () => {
  const file = read(AVATAR);

  it('has the names of the group’s children, in the document’s order, the first one the default', () => {
    assert.deepEqual(errors(file), []);
    assert.deepEqual(file.component?.properties[0], {
      type: 'VARIANT',
      name: 'hue',
      values: ['blue', 'rose', 'green'],
      from: 'hue',
      loc: { line: 3, column: 5 },
    });
    assert.deepEqual(
      file.members.map((member) => member.name),
      [
        'hue=blue, look=soft',
        'hue=blue, look=solid',
        'hue=rose, look=soft',
        'hue=rose, look=solid',
        'hue=green, look=soft',
        'hue=green, look=solid',
      ],
    );
  });

  it('is a new member when the tokens gain a child, with no edit to the file', () => {
    const more = read(AVATAR, designSourceOf(new Resolver(documentOf([...HUES, 'violet']))));
    assert.deepEqual(errors(more), []);
    assert.deepEqual(
      more.members.map((member) => member.name),
      [...file.members.map((member) => member.name), 'hue=violet, look=soft', 'hue=violet, look=solid'],
    );
    assert.equal(fillOf(more.members[6].tree), 'hue.violet.soft.backgroundColor');
  });

  it('is pruned by exclude, as any axis is', () => {
    const pruned = read(`${AVATAR}exclude hue=rose\n`);
    assert.deepEqual(errors(pruned), []);
    assert.deepEqual(
      pruned.members.map((member) => member.name),
      ['hue=blue, look=soft', 'hue=blue, look=solid', 'hue=green, look=soft', 'hue=green, look=solid'],
    );
    assert.match(
      errors(read(`${AVATAR}exclude hue=nowhere\n`))[0],
      /exclude hue: "nowhere" is not one of its values \(blue, rose, green\)/,
    );
  });

  it('is a group’s children whether they are groups or tokens', () => {
    const sizes = read(
      'component Dot\nproperties {\n    VARIANT size from="{size}"\n}\nFRAME Dot layoutMode=HORIZONTAL opacity="{size.(input)size}"\n',
    );
    assert.deepEqual(errors(sizes), []);
    assert.deepEqual(
      sizes.members.map((member) => [member.name, pathOf(member.tree.fields.opacity)]),
      [
        ['size=small', 'size.small'],
        ['size=large', 'size.large'],
      ],
    );
  });

  it('stops the read when the group names nothing, or is a token, or no design system is loaded', () => {
    const at = (group: string, source?: DesignSource | null) =>
      errors(read(`component A\nproperties {\n    VARIANT hue from="{${group}}"\n}\nFRAME A layoutMode=HORIZONTAL\n`, source));
    assert.deepEqual(at('nowhere'), [
      'VARIANT "hue" takes its values from the group "{nowhere}", which names no token and no group of the design system',
    ]);
    assert.match(at('size.small')[0], /"\{size\.small\}", which is a token, not a group/);
    assert.match(at('hue', null)[0], /takes its values from the group "\{hue\}", and no design system is loaded/);
    assert.deepEqual(read('component A\nproperties {\n    VARIANT hue from="{nowhere}"\n}\nFRAME A layoutMode=HORIZONTAL\n').members, []);
  });

  it('refuses a source that cannot say, a bad value, and a form that is not a reference', () => {
    const silent: DesignSource = { contexts: () => undefined, partsOf: () => [] };
    assert.match(errors(read(AVATAR, silent))[0], /takes its values from the group "\{hue\}", and no design system is loaded/);
    const odd: DesignSource = { ...silent, children: () => ['blue', 'a,b'] };
    assert.match(errors(read(AVATAR, odd))[0], /the child "a,b" cannot be a variant value/);
    const form = (text: string) => errors(read(`component A\nproperties {\n    VARIANT hue ${text}\n}\nFRAME A layoutMode=HORIZONTAL\n`));
    assert.match(form('from="hue"')[0], /from takes a token reference in quotes/);
    assert.match(form('from=3')[0], /from takes a token reference in quotes/);
    assert.match(form('from="{hue}" blue')[0], /takes from="\{group\}" alone, or a list of values/);
    assert.match(form('(modifier)"state" from="{hue}"')[0], /takes from="\{group\}" alone/);
    assert.match(form('from="{hue.(input)x}"')[0], /cannot hold an \(input\) segment/);
    assert.match(form('from="{a..b}"')[0], /is not a token reference: empty path segment/);
    assert.match(
      errors(read('component A\nproperties {\n    BOOLEAN B default=#true from="{hue}"\n}\nFRAME A layoutMode=HORIZONTAL\n'))[0],
      /has no "from"/,
    );
  });
});

describe('a reference with a segment from an axis', () => {
  const file = read(AVATAR);

  it('is an ordinary reference in every member, to the token its axes name', () => {
    assert.deepEqual(errors(file), []);
    assert.equal(file.members.length, 6);
    for (const member of file.members) {
      const [h, look] = [member.combination.hue, member.combination.look];
      const root = member.tree;
      assert.equal(fillOf(root), `hue.${h}.${look}.backgroundColor`, member.name);
      assert.equal(pathOf((root.fields.strokes as Value[])[0]), `hue.${h}.${look}.borderColor`, member.name);
      assert.equal(fillOf(child(root, 'Initials')), `hue.${h}.${look}.color`, member.name);
    }
  });

  it('notes the axes a field took, and no field that took none', () => {
    const root = file.members[0].tree;
    assert.deepEqual(root.fromAxes, { fills: ['hue'], strokes: ['hue'] });
    assert.deepEqual(child(root, 'Initials').fromAxes, { fills: ['hue'] });
  });

  it('may take several segments, and a quoted axis name', () => {
    const both = read(`component Tag
properties {
    VARIANT hue from="{hue}"
    VARIANT look soft solid
    VARIANT "Header in" on off
}
FRAME Tag layoutMode=HORIZONTAL {
    fills "{hue.(input)hue.(input)look.backgroundColor}"
    strokes #"{tone.(input)"Header in"}"#
}
`);
    assert.deepEqual(errors(both), []);
    assert.equal(fillOf(both.members[0].tree), 'hue.blue.soft.backgroundColor');
    assert.equal(pathOf((both.members[0].tree.fields.strokes as Value[])[0]), 'tone.on');
    assert.deepEqual(both.members[0].tree.fromAxes, { fills: ['hue', 'look'], strokes: ['Header in'] });
  });

  it('takes the quoted form in the middle of a path as well', () => {
    const quoted = read(`component Tag
properties {
    VARIANT "Header in" soft solid
}
FRAME Tag layoutMode=HORIZONTAL {
    fills #"{hue.blue.(input)"Header in".backgroundColor}"#
}
`);
    assert.deepEqual(errors(quoted), []);
    assert.deepEqual(
      quoted.members.map((member) => fillOf(member.tree)),
      ['hue.blue.soft.backgroundColor', 'hue.blue.solid.backgroundColor'],
    );
  });

  it('binds the group a tokens= value names, per member', () => {
    const grouped = read(`component Chip
properties {
    VARIANT hue from="{hue}"
}
FRAME Chip layoutMode=HORIZONTAL tokens="{hue.(input)hue.soft}"
`);
    assert.deepEqual(errors(grouped), []);
    assert.deepEqual(
      grouped.members.map((member) => [member.name, fillOf(member.tree), pathOf((member.tree.fields.strokes as Value[])[0])]),
      [
        ['hue=blue', 'hue.blue.soft.backgroundColor', 'hue.blue.soft.borderColor'],
        ['hue=rose', 'hue.rose.soft.backgroundColor', 'hue.rose.soft.borderColor'],
        ['hue=green', 'hue.green.soft.backgroundColor', 'hue.green.soft.borderColor'],
      ],
    );
    assert.deepEqual(grouped.members[1].tree.fromAxes?.fills, ['hue'], 'and a field the group inferred says where its group came from');
  });

  it('is left alone where it is no reference: text, a tagged value, and a file with no segment at all', () => {
    const plain = read(`component Note
properties {
    VARIANT hue from="{hue}"
}
FRAME Note layoutMode=HORIZONTAL {
    TEXT Label characters="use (input)hue here"
}
`);
    assert.deepEqual(errors(plain), []);
    assert.equal((plain.members[0].tree.children[0].fields.characters as Value & { value: string }).value, 'use (input)hue here');
    assert.equal(plain.members[0].tree.children[0].fromAxes, undefined);
    assert.equal(JSON.stringify(plain.members[0].tree).includes('fromAxes'), false);
  });

  it('refuses an axis the file does not have, at the line of the field', () => {
    const missing = read(AVATAR.replace('"{hue.(input)hue.soft.backgroundColor}"', '"{hue.(input)tone.soft.backgroundColor}"'));
    const problem = missing.problems.find((candidate) => /tone/.test(candidate.message))!;
    assert.match(
      problem.message,
      /"\{hue\.\(input\)tone\.soft\.backgroundColor\}": the file has no VARIANT axis "tone" to take a segment from \(its axes: hue, look\)/,
    );
    assert.equal(problem.line, 10);
    assert.deepEqual(missing.members, []);
    assert.match(errors(read('component A\nFRAME A layoutMode=HORIZONTAL {\n    fills "{hue.(input)tone.x}"\n}\n'))[0], /\(it has none\)/);
  });

  it('refuses a segment that is not a whole one, an unclosed quote, and no name', () => {
    const body = (path: string) => errors(read(AVATAR.replace('hue.(input)hue.soft.backgroundColor', path)));
    assert.match(
      body('hue.blue-(input)hue.backgroundColor')[0],
      /\(input\) takes a whole segment of the path, and the segment "blue-\(input\)hue" has text around it/,
    );
    assert.match(body('hue.(input)hue-x.backgroundColor')[0], /the file has no VARIANT axis "hue-x"/);
    assert.match(
      errors(
        read('component A\nproperties {\n    VARIANT n a b\n}\nFRAME A layoutMode=HORIZONTAL {\n    fills #"{x.(input)"n.y}"#\n}\n'),
      )[0],
      /the quote after \(input\) is never closed/,
    );
    assert.match(
      errors(
        read('component A\nproperties {\n    VARIANT n a b\n}\nFRAME A layoutMode=HORIZONTAL {\n    fills #"{x.(input)"n"z.y}"#\n}\n'),
      )[0],
      /text follows the quoted axis name/,
    );
    assert.match(
      errors(read('component A\nproperties {\n    VARIANT n a b\n}\nFRAME A layoutMode=HORIZONTAL {\n    fills "{x.(input).y}"\n}\n'))[0],
      /needs the name of an axis/,
    );
  });

  it('refuses a value that cannot be a segment, naming the member', () => {
    const dotted = read(
      'component A\nproperties {\n    VARIANT n "1.5" "2"\n}\nFRAME A layoutMode=HORIZONTAL {\n    fills "{x.(input)n}"\n}\n',
    );
    assert.deepEqual(
      dotted.problems.map((problem) => [problem.member, problem.line]),
      [['n=1.5', 6]],
    );
    assert.match(dotted.problems[0].message, /the value "1\.5" of the axis "n" cannot be a path segment/);
  });

  it('is no part of the component line’s own tokens=', () => {
    const line = read(
      'component Chip tokens="{hue.(input)hue.soft}"\nproperties {\n    VARIANT hue from="{hue}"\n}\nFRAME Chip layoutMode=HORIZONTAL\n',
    );
    assert.match(
      errors(line)[0],
      /component: tokens="\{hue\.\(input\)hue\.soft\}" takes no \(input\) segment: the line is read once for the file/,
    );
    assert.equal(line.problems[0].line, 1);
  });

  it('is checked as any reference is: the form of the field, and the group a tokens= names', () => {
    // A fill that expands to something that is no whole reference is still refused where the field is checked.
    assert.match(
      errors(read(AVATAR.replace('fills "{hue.(input)hue.soft.backgroundColor}"', 'fills "{hue.(input)hue.}"')))[0],
      /is not a token reference: empty path segment/,
    );
    const group = read(
      'component Chip\nproperties {\n    VARIANT hue from="{hue}"\n}\nFRAME Chip layoutMode=HORIZONTAL tokens="{hue.(input)hue.nowhere}"\n',
    );
    assert.deepEqual(
      group.problems.map((problem) => [problem.member, problem.message]),
      [
        ['hue=blue', 'tokens="{hue.blue.nowhere}" (taken from hue=blue) names no token and no group of the design system'],
        ['hue=rose', 'tokens="{hue.rose.nowhere}" (taken from hue=rose) names no token and no group of the design system'],
        ['hue=green', 'tokens="{hue.green.nowhere}" (taken from hue=green) names no token and no group of the design system'],
      ],
    );
  });
});

describe('a token that a member’s reference names and the tokens do not hold', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  const withAmber = documentOf([...HUES, 'amber']);
  const text = AVATAR;

  it('is said by the check of the files, naming the member, the axis value and the line', async () => {
    const mock = createFigmaMock().install();
    await LOAD_DOCUMENT(oneFile(JSON.stringify(withAmber), 'demo.resolver.json'));
    await CHECK_COMPONENTS({ files: [{ fileName: 'ui/avatar.component.kdl', text }], names: true });
    const message = mock
      .calls('ui.postMessage')
      .map((call) => call.args[0] as Response)
      .at(-1)!;
    assert.ok(message.type === 'ERROR', JSON.stringify(message));
    const problems = message.payload.problems!;
    const said = (token: string) => problems.filter((problem) => problem.includes(`{${token}}`));
    // The one member that has no such token is named, with the axis value its reference took, and the line of the field.
    assert.deepEqual(said('hue.amber.solid.backgroundColor'), [
      'ui/avatar.component.kdl:14:9 token {hue.amber.solid.backgroundColor} is not in the design system "Demo" (member "hue=amber, look=solid", hue=amber)',
    ]);
    assert.match(
      said('hue.amber.solid.borderColor')[0],
      /^ui\/avatar\.component\.kdl:15:\d+ token .* \(member "hue=amber, look=solid", hue=amber\)$/,
    );
    assert.match(
      said('hue.amber.solid.color')[0],
      /^ui\/avatar\.component\.kdl:19:\d+ token .* \(member "hue=amber, look=solid", hue=amber\)$/,
    );
    assert.equal(problems.length, 3, 'and nothing else is missing');
  });

  it('is said by the build in Figma, naming the member, the axis value and the line', async () => {
    const mock = createFigmaMock().withCollection('Demo', ['default']);
    for (const name of HUES) {
      for (const look of ['soft', 'solid'])
        for (const key of ['backgroundColor', 'borderColor', 'color'])
          mock.withVariable('Demo', `hue/${name}/${look}/${key}`, 'COLOR', { default: { r: 1, g: 1, b: 1, a: 1 } });
    }
    mock.install();
    const file = readComponentFile(text, designSourceOf(new Resolver(withAmber)));
    assert.deepEqual(errors(file), []);
    const desired = JSON.parse(JSON.stringify({ component: file.component, members: file.members })) as Desired;
    await assert.rejects(
      run(desired),
      /token \{hue\.amber\.soft\.backgroundColor\} \(line 10, member "hue=amber, look=soft", hue=amber\) names no variable: looked for "hue\/amber\/soft\/backgroundColor" in "Demo"/,
    );
  });

  it('builds every member to its own token when the file holds them all', async () => {
    const mock = createFigmaMock().withCollection('Demo', ['default']);
    HUES.forEach((name, index) => {
      for (const look of ['soft', 'solid']) {
        for (const key of ['backgroundColor', 'borderColor', 'color'])
          mock.withVariable('Demo', `hue/${name}/${look}/${key}`, 'COLOR', { default: { r: index / 10, g: 0, b: 0, a: 1 } });
      }
    });
    const installed = mock.install();
    const file = readComponentFile(text, design);
    const report = await run(JSON.parse(JSON.stringify({ component: file.component, members: file.members })) as Desired);
    const set = installed.node(report.setId!) as { children: { name: string }[] };
    assert.deepEqual(
      set.children.map((member) => member.name),
      file.members.map((member) => member.name),
    );
    assert.equal(set.children.length, 6);
  });
});
