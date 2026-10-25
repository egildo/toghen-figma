import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { format, parse } from '@bgotink/kdl';
import { readComponentFile } from '../../shared/components/index.js';
import type { Layer, Member, Problem, Track, Value } from '../../shared/components/index.js';

const fixture = (name: string): string => readFileSync(new URL(`./fixtures/${name}.component.kdl`, import.meta.url), 'utf8');

const SHELL = fixture('shell');
const CONTROL = fixture('control');

/** The one-based line of the first line of `text` containing `needle`. */
const lineOf = (text: string, needle: string): number => {
  const index = text.split('\n').findIndex((line) => line.includes(needle));
  assert.notEqual(index, -1, `the fixture has no line containing ${needle}`);
  return index + 1;
};

const find = (layer: Layer, address: string): Layer | undefined =>
  layer.address === address ? layer : layer.children.map((child) => find(child, address)).find((found) => found !== undefined);

const parentOf = (layer: Layer, address: string): Layer | undefined =>
  layer.children.some((child) => child.address === address)
    ? layer
    : layer.children.map((child) => parentOf(child, address)).find((found) => found !== undefined);

const member = (members: Member[], name: string): Member => {
  const found = members.find((m) => m.name === name);
  assert.ok(found, `no member named ${name}; there are ${members.map((m) => m.name).join(' | ')}`);
  return found;
};

const token = (path: string): Value => ({ kind: 'token', path });

describe('readComponentFile: the worked example', () => {
  const file = readComponentFile(SHELL);

  it('validates with nothing but the Show Aside warning', () => {
    assert.ok(file.component);
    assert.deepEqual(
      file.problems.map((p) => [p.severity, p.member]),
      [['warning', 'Columns=single, Header in=page']],
    );
    assert.match(file.problems[0].message, /BOOLEAN property "Show Aside" is wired to nothing in this member/);
    assert.equal(file.problems[0].line, lineOf(SHELL, 'BOOLEAN "Show Aside"'));
  });

  it('expands to seven members, the excluded combination absent', () => {
    assert.deepEqual(
      file.members.map((m) => m.name),
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
  });

  it('makes the default member the file with no `when` applying: the header region under the root', () => {
    const { tree } = file.members[0];
    assert.deepEqual(
      tree.children.map((c) => c.address),
      ['Header region', 'Body'],
    );
    assert.deepEqual(find(tree, 'Lanes')?.fields.gridColumnSizes as Track[], [{ type: 'FLEX', value: 1 }, { type: 'HUG' }]);
  });

  it('writes the fields of the whens that hold in Columns=grow share, Header in=content, and moves the header region', () => {
    const { tree } = member(file.members, 'Columns=grow share, Header in=content');
    const lanes = find(tree, 'Lanes');

    assert.deepEqual(lanes?.fields.gridColumnSizes as Track[], [
      { type: 'FLEX', value: 1 },
      { type: 'FLEX', value: 1.618 },
    ]);
    // `#null` clears the size: the field is present and null, which is not the same as absent.
    assert.deepEqual(find(tree, 'Aside')?.fields.minWidth, { kind: 'plain', value: null });

    assert.deepEqual(
      tree.children.map((c) => c.address),
      ['Body'],
    );
    assert.deepEqual(
      find(tree, 'Main lane')?.children.map((c) => c.address),
      ['Header region', 'Content'],
    );
  });

  it('builds the header region from one definition, so the layer has one address whichever parent it sits in', () => {
    const page = member(file.members, 'Columns=grow fixed, Header in=page').tree;
    const content = member(file.members, 'Columns=grow fixed, Header in=content').tree;
    assert.equal(parentOf(page, 'Header region')?.address, 'Shell');
    assert.equal(parentOf(content, 'Header region')?.address, 'Main lane');
    assert.deepEqual(find(page, 'Header region'), { ...find(content, 'Header region'), loc: find(page, 'Header region')?.loc });
    // The slot inside is the same layer too: a member has exactly one SLOT layer for the Header property.
    assert.equal(parentOf(content, 'Header')?.address, 'Header region');
  });

  it('leaves minWidth as written in every member the clearing when does not match', () => {
    assert.deepEqual(find(file.members[0].tree, 'Aside')?.fields.minWidth, { kind: 'literal', value: 384 });
  });

  it('sets a wired field to plain false where a when replaces the wire', () => {
    const single = member(file.members, 'Columns=single, Header in=page');
    assert.deepEqual(find(single.tree, 'Aside region')?.fields.visible, { kind: 'plain', value: false });
    assert.deepEqual(find(file.members[0].tree, 'Aside region')?.fields.visible, {
      kind: 'property',
      name: 'Show Aside',
    });
  });

  it('reads token references without their braces, and structure in its real shapes', () => {
    const root = file.members[0].tree;
    assert.deepEqual(root.fields.fills, [token('surface.page')]);
    assert.deepEqual(find(root, 'Header region')?.fields.paddingTop, token('space.lg'));
    assert.deepEqual(find(root, 'Header region')?.fields.strokeBottomWeight, { kind: 'literal', value: 1 });
    assert.deepEqual(find(root, 'Aside region')?.fields.grid, { row: 0, column: 1 });
    assert.deepEqual(find(root, 'Lanes')?.fields.gridRowSizes, [{ type: 'FLEX', value: 1 }]);
    assert.deepEqual(find(root, 'Lanes')?.fields.gridColumnSizes, [{ type: 'FLEX', value: 1 }, { type: 'HUG' }]);
  });

  it('locates a field a when wrote at the when, with the column', () => {
    const share = member(file.members, 'Columns=grow share, Header in=page').tree;
    const line = SHELL.split('\n').findIndex((l) => l.includes('when grow-share { gridColumnSizes'));
    assert.equal(find(share, 'Lanes')?.fieldLoc?.gridColumnSizes?.line, line + 1);
    assert.equal(find(share, 'Lanes')?.fieldLoc?.gridColumnSizes?.column, SHELL.split('\n')[line].indexOf('gridColumnSizes') + 1);
    // The field a when did not write keeps the line of the layer that wrote it first.
    assert.equal(find(share, 'Lanes')?.fieldLoc?.gridRowSizes?.line, lineOf(SHELL, 'gridRowSizes { FLEX; }'));
  });

  it('travels as plain JSON, and so does the document', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(file.members)), file.members);
    assert.deepEqual(JSON.parse(JSON.stringify(file.document)), file.document);
    assert.ok(
      file.document?.nodes.every((item) => item.kind !== 'host'),
      'the words that are Toghen’s stay behind',
    );
  });
});

describe('readComponentFile: the control', () => {
  const file = readComponentFile(CONTROL);

  it('validates clean', () => {
    assert.deepEqual(file.problems, []);
  });

  it('is sparse: two excludes remove six of eighteen', () => {
    assert.equal(file.members.length, 12);
    assert.ok(file.members.every((m) => !/Variant=outline, State=(hover|pressed)/.test(m.name)));
    assert.equal(file.members[0].name, 'Variant=solid, State=rest, Size=medium');
  });

  it('applies a guard that lists two values to both states and neither other', () => {
    const fill = (name: string) => find(member(file.members, name).tree, 'Control')?.fields.fills;
    assert.deepEqual(fill('Variant=solid, State=hover, Size=medium'), [token('surface.control-active')]);
    assert.deepEqual(fill('Variant=solid, State=pressed, Size=medium'), [token('surface.control-active')]);
    assert.deepEqual(fill('Variant=solid, State=rest, Size=medium'), [token('surface.control')]);
  });

  it('pins a mode on the members its when matches, and no others', () => {
    const pinned = file.members.filter((m) => find(m.tree, 'Control')?.fields.modes !== undefined);
    assert.ok(pinned.length > 0);
    assert.ok(pinned.every((m) => m.combination.Size === 'small'));
    assert.equal(pinned.length, file.members.filter((m) => m.combination.Size === 'small').length);
    assert.deepEqual(find(pinned[0].tree, 'Control')?.fields.modes, { Scale: 'small' });
  });

  it('lets a when write a list whole, including the empty one', () => {
    const outline = member(file.members, 'Variant=outline, State=rest, Size=medium');
    const control = find(outline.tree, 'Control');
    assert.deepEqual(control?.fields.fills, []);
    assert.deepEqual(control?.fields.strokes, [token('border.strong')]);
  });

  it('changes a child layer from inside it: the caption’s text style follows the size', () => {
    const style = (name: string) => find(member(file.members, name).tree, 'Caption')?.fields.textStyle;
    assert.deepEqual(style('Variant=solid, State=rest, Size=small'), token('text.label-small'));
    assert.deepEqual(style('Variant=solid, State=rest, Size=large'), token('text.label'));
  });

  it('wires a TEXT, an INSTANCE_SWAP and a BOOLEAN, and reads a colour literal with alpha', () => {
    const root = file.members[0].tree;
    assert.deepEqual(find(root, 'Caption')?.fields.characters, { kind: 'property', name: 'Label' });
    assert.deepEqual(find(root, 'Leading icon')?.fields.component, { kind: 'property', name: 'Icon' });
    assert.deepEqual(find(root, 'Leading icon')?.fields.visible, { kind: 'property', name: 'Show Icon' });
    assert.deepEqual(find(root, 'Control')?.fields.strokes, [{ kind: 'literal', value: '#ffffff80' }]);
    assert.deepEqual(find(root, 'Control')?.fields.minHeight, { kind: 'literal', value: 44 });
  });

  it('locates each field where it was last written, the when included', () => {
    const small = member(file.members, 'Variant=solid, State=rest, Size=small');
    const root = small.tree;
    const line = lineOf(CONTROL, 'when small paddingLeft="{space.sm}"');
    assert.equal(root.fieldLoc?.paddingLeft?.line, line);
    assert.equal(root.fieldLoc?.paddingLeft?.column, CONTROL.split('\n')[line - 1].indexOf('paddingLeft') + 1);
    assert.equal(root.fieldLoc?.modes?.line, line);
    assert.equal(root.fieldLoc?.paddingTop?.line, lineOf(CONTROL, 'FRAME Control'));
  });
});

describe('readComponentFile: formatting round trip', () => {
  for (const [name, text] of [
    ['the worked example', SHELL],
    ['the control', CONTROL],
  ] as const) {
    it(`format(parse(text)) equals the text of ${name}, comments included`, () => {
      const printed = format(parse(text, { storeLocations: true }));
      assert.equal(printed, text);
      assert.ok(/\/\//.test(printed), 'the fixture has comments to lose');
    });
  }
});

// -- Invalid files ------------------------------------------------------------

/**
 * A component with one variant axis and one guard, and a root with one layer: the
 * smallest that is valid, so a case changes one thing and the rest stays quiet.
 * The root layer is on line 6, and what a case puts in it from line 7.
 */
const valid = (parts: { properties?: string; layers?: string; rest?: string; guards?: string } = {}): string =>
  [
    'component Box',
    'properties {',
    parts.properties ?? '    VARIANT Tone calm loud',
    '}',
    parts.guards ?? 'guard loud { is (input)Tone loud }',
    'FRAME Box layoutMode=VERTICAL {',
    parts.layers ?? '    FRAME Inner layoutMode=VERTICAL',
    '}',
    parts.rest ?? '',
    '',
  ].join('\n');

interface Case {
  name: string;
  kdl: string;
  /** What the message says. */
  says: RegExp;
  /** A fragment of the line the problem is on. */
  at: string;
  /** The problem is on the last line holding the fragment, not the first. */
  last?: boolean;
  severity?: Problem['severity'];
}

const cases: Case[] = [
  {
    name: 'a bare number in a dimension field',
    kdl: valid({ layers: '    FRAME Inner paddingTop=8' }),
    says: /"paddingTop" takes a token reference or a \(literal\) number.*write \(literal\)8/,
    at: 'paddingTop=8',
  },
  {
    name: 'a bare colour',
    kdl: valid({ layers: '    FRAME Inner {\n        fills "#ff0000"\n    }' }),
    says: /bare colour "#ff0000": write \(literal\)"#ff0000"/,
    at: 'fills "#ff0000"',
  },
  {
    name: 'an unknown tag',
    kdl: valid({ layers: '    FRAME Inner paddingTop=(px)8' }),
    says: /unknown tag "\(px\)"/,
    at: 'paddingTop=(px)8',
  },
  {
    name: 'an unknown field',
    kdl: valid({ layers: '    FRAME Inner gap=(literal)8' }),
    says: /unknown field "gap" on FRAME "Inner"/,
    at: 'gap=',
  },
  {
    name: 'a typo in a field a when writes',
    kdl: valid({ layers: '    FRAME Inner layoutMode=VERTICAL {\n        when loud paddingTopp="{space.md}"\n    }' }),
    says: /unknown field "paddingTopp" on FRAME "Inner"/,
    at: 'paddingTopp',
  },
  {
    name: 'a when that names a guard that does not exist',
    kdl: valid({ layers: '    FRAME Inner layoutMode=VERTICAL {\n        when louder visible=#false\n    }' }),
    says: /no guard named "louder" is in scope here/,
    at: 'when louder',
  },
  {
    name: 'a when outside the element it would change',
    kdl: valid({ rest: 'when loud visible=#false' }),
    says: /"when" stands directly in an element's body/,
    at: 'when loud visible',
  },
  {
    name: 'a field written as a property when it is a child node',
    kdl: valid({ layers: '    FRAME Inner fills="{surface.page}"' }),
    says: /"fills" is written as a child node, `fills …`, not as a property/,
    at: 'fills=',
  },
  {
    name: 'a field that is a property written as a child node',
    kdl: valid({ layers: '    FRAME Inner {\n        layoutMode VERTICAL\n    }' }),
    says: /"layoutMode" is not an element of this vocabulary/,
    at: 'layoutMode VERTICAL',
  },
  {
    name: 'two properties with one name, a SLOT named like a BOOLEAN',
    kdl: valid({
      properties: '    BOOLEAN Nav default=#true\n    SLOT Nav description="The rail."',
      layers: '    FRAME Rail visible=(property)Nav\n    SLOT Nav',
    }),
    says: /SLOT "Nav" repeats the name of BOOLEAN "Nav" \(line 3\).*silently/,
    at: 'SLOT Nav description',
  },
  {
    name: 'a KDL property written twice on one node',
    kdl: valid({ layers: '    FRAME Inner layoutMode=VERTICAL layoutMode=HORIZONTAL' }),
    says: /"layoutMode" is written twice on "FRAME".*keep only the last/,
    at: 'layoutMode=VERTICAL layoutMode=HORIZONTAL',
  },
  {
    name: 'two layers with one address',
    kdl: valid({ layers: '    FRAME Inner layoutMode=VERTICAL\n    TEXT Inner characters="x"' }),
    says: /TEXT "Inner" repeats the name of FRAME "Inner" \(line 7\)/,
    at: 'TEXT Inner',
  },
  {
    name: 'a GRID on a slot',
    kdl: valid({
      properties: '    SLOT Body description="."',
      layers: '    SLOT Body layoutMode=GRID',
      guards: '',
    }),
    says: /SLOT "Body" cannot be a GRID/,
    at: 'layoutMode=GRID',
  },
  {
    name: 'a grid field on a layer that is not a grid',
    kdl: valid({ layers: '    FRAME Inner layoutMode=VERTICAL {\n        gridRowSizes { FLEX; }\n    }' }),
    says: /FRAME "Inner" is not a GRID \(its layoutMode is VERTICAL\) and cannot have gridRowSizes/,
    at: 'gridRowSizes',
  },
  {
    name: 'a grid child without a cell',
    kdl: valid({
      layers:
        '    FRAME Grid layoutMode=GRID {\n        gridRowSizes { FLEX; }\n        gridColumnSizes { FLEX; }\n        FRAME Cell layoutMode=VERTICAL\n    }',
    }),
    says: /FRAME "Cell" sits in the GRID "Grid" and needs `grid row= column=`/,
    at: 'FRAME Cell',
  },
  {
    name: 'a flex track on an axis the grid hugs',
    kdl: valid({
      layers:
        '    FRAME Grid layoutMode=GRID layoutSizingHorizontal=HUG {\n        gridRowSizes { FLEX; }\n        gridColumnSizes { FLEX; }\n    }',
    }),
    says: /hugs its width, so gridColumnSizes cannot hold a FLEX track/,
    at: 'gridColumnSizes',
  },
  {
    name: 'a BOOLEAN that nothing wires',
    kdl: valid({ properties: '    BOOLEAN "Show Icon" default=#true', guards: '' }),
    says: /BOOLEAN property "Show Icon" is wired to no layer/,
    at: 'BOOLEAN "Show Icon"',
  },
  {
    name: 'a TEXT property wired to visible',
    kdl: valid({
      properties: '    TEXT Label default="x"',
      layers: '    FRAME Inner visible=(property)Label',
      guards: '',
    }),
    says: /"visible" of FRAME "Inner" wires to a BOOLEAN property, but "Label" is a TEXT/,
    at: 'visible=(property)Label',
  },
  {
    name: 'a property wired to the root layer',
    kdl: valid({
      properties: '    BOOLEAN Shown default=#true',
      layers: '    FRAME Inner visible=(property)Shown',
      guards: '',
    }).replace('FRAME Box layoutMode=VERTICAL {', 'FRAME Box layoutMode=VERTICAL visible=(property)Shown {'),
    says: /"visible" of FRAME "Box" is wired to \(property\)"Shown", but the root layer is the component itself/,
    at: 'FRAME Box layoutMode=VERTICAL visible',
  },
  {
    name: 'an instance of nothing',
    kdl: valid({ layers: '    INSTANCE Icon layoutSizingHorizontal=FIXED' }),
    says: /INSTANCE "Icon" needs component=/,
    at: 'INSTANCE Icon',
  },
  {
    name: 'a variant value with =',
    kdl: valid({ properties: '    VARIANT Tone "calm=quiet" loud', guards: '' }),
    says: /a variant value cannot contain "," or "="/,
    at: '"calm=quiet"',
  },
  {
    name: 'a variant axis with a dot, which a guard could not read',
    kdl: valid({ properties: '    VARIANT "Tone.x" calm loud', guards: '' }),
    says: /an axis name cannot contain ",", "=" or "\."/,
    at: '"Tone.x"',
  },
  {
    name: 'a boolean variant value',
    kdl: valid({ properties: '    VARIANT Flag #false #true', guards: '' }),
    says: /has value #false, which is not a string; quote it/,
    at: '#false',
  },
  {
    name: 'excluding the default member',
    kdl: valid({ rest: 'exclude Tone=calm' }),
    says: /exclude removes the default member \(Tone=calm\)/,
    at: 'exclude Tone=calm',
  },
  {
    name: 'excluding an axis that does not exist',
    kdl: valid({ rest: 'exclude Mood=loud' }),
    says: /exclude names "Mood", which is not a VARIANT axis/,
    at: 'exclude Mood=loud',
  },
  {
    name: 'excluding a value an axis does not have',
    kdl: valid({ rest: 'exclude Tone=quiet' }),
    says: /exclude Tone: "quiet" is not one of its values \(calm, loud\)/,
    at: 'exclude Tone=quiet',
  },
  {
    name: 'a guard that reads something that is no variant axis',
    kdl: valid({ guards: 'guard quiet { is (input)Mood calm }' }),
    says: /guard "quiet" reads \(input\)Mood, which is not a VARIANT axis/,
    at: 'guard quiet',
  },
  {
    name: 'a guard that lists a value the axis does not have',
    kdl: valid({ guards: 'guard quiet { is (input)Tone calm quiet }' }),
    says: /guard "quiet": "quiet" is not one of Tone's values \(calm, loud\)/,
    at: 'guard quiet',
  },
  {
    name: 'a guard with no body, which only a host could supply',
    kdl: valid({ guards: 'guard loud' }),
    says: /guard "loud" has no body, which marks a guard the host supplies/,
    at: 'guard loud',
  },
  {
    name: 'an each, which nothing supplies a list for',
    kdl: valid({ layers: '    each row in=(input)rows key=id {\n        FRAME Row layoutMode=VERTICAL\n    }' }),
    says: /"each" is not built for component files/,
    at: 'each row',
  },
  {
    name: 'a call to a definition the file does not define',
    kdl: valid({ layers: '    +nowhere' }),
    says: /"\+nowhere" calls a definition this file does not define/,
    at: '+nowhere',
  },
  {
    name: 'a call that leaves out a parameter',
    kdl: valid({ layers: '    +region', rest: 'define region title {\n    FRAME Region layoutMode=VERTICAL\n}' }),
    says: /"region" needs "title"/,
    at: '+region',
  },
  {
    name: 'two SLOT layers for one property',
    kdl: valid({
      properties: '    SLOT Body description="."',
      layers: '    SLOT Body layoutMode=VERTICAL\n    SLOT Body layoutMode=VERTICAL',
      guards: '',
    }),
    says: /SLOT property "Body" has 2 SLOT layers; it has exactly one/,
    at: 'SLOT Body layoutMode=VERTICAL',
    last: true,
  },
];

describe('readComponentFile: invalid files', () => {
  for (const c of cases) {
    it(`refuses ${c.name}, with its line and column`, () => {
      const file = readComponentFile(c.kdl);
      const found = file.problems.filter((p) => c.says.test(p.message));
      assert.equal(found.length, 1, `expected one problem like ${c.says}, got:\n${JSON.stringify(file.problems, null, 2)}`);
      assert.equal(found[0].severity, c.severity ?? 'error');
      const lines = c.kdl.split('\n');
      const matching = lines.flatMap((l, i) => (l.includes(c.at) ? [i + 1] : []));
      assert.ok(matching.length > 0, `no line holds ${c.at}`);
      const line = c.last ? matching[matching.length - 1] : matching[0];
      assert.equal(found[0].line, line);
      assert.ok(typeof found[0].column === 'number' && found[0].column >= 1);
      assert.deepEqual(file.members, [], 'a file with errors builds nothing');
    });
  }

  it('points at the very column of the entry, not at the space before it', () => {
    const kdl = valid({ layers: '    FRAME Inner   paddingTop=8' });
    const [problem] = readComponentFile(kdl).problems;
    assert.equal(problem.column, kdl.split('\n')[6].indexOf('paddingTop') + 1);
  });

  it('catches a when that makes a slot a grid in the member it produces, and names that member only', () => {
    const kdl = valid({
      properties: '    VARIANT Tone calm loud\n    SLOT Body description="."',
      layers: '    SLOT Body layoutMode=VERTICAL {\n        when loud layoutMode=GRID\n    }',
    });
    const file = readComponentFile(kdl);
    const problems = file.problems.filter((p) => p.severity === 'error');
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /SLOT "Body" cannot be a GRID/);
    assert.equal(problems[0].member, 'Tone=loud');
    // The line is the when's, which put the value there, not the slot's.
    assert.equal(problems[0].line, lineOf(kdl, 'when loud layoutMode=GRID'));
  });

  it('reports a value that is wrong in every member once, without a member, and in one member with it', () => {
    const everywhere = readComponentFile(valid({ layers: '    FRAME Inner paddingTop=8' }));
    assert.equal(everywhere.problems.length, 1);
    assert.equal(everywhere.problems[0].member, undefined);

    const once = readComponentFile(valid({ layers: '    FRAME Inner layoutMode=VERTICAL {\n        when loud paddingTop=8\n    }' }));
    assert.equal(once.problems.length, 1);
    assert.equal(once.problems[0].member, 'Tone=loud');
    assert.equal(once.problems[0].line, 8);
  });

  it('reports every problem of a stage in one run, not the first', () => {
    // Reading the file, and holding the properties, exclusions and guards against the axes, are one stage.
    const early = valid({
      properties: '    VARIANT Tone calm loud\n    BOOLEAN Tone default=#true',
      layers: '    FRAME Inner layoutMode=VERTICAL {\n        when louder visible=#false\n    }',
      rest: 'exclude Tone=calm',
    });
    assert.ok(readComponentFile(early).problems.length >= 3, JSON.stringify(readComponentFile(early).problems));
    // Checking the members is the next: every field and value wrong in a layer is named.
    const later = readComponentFile(valid({ layers: '    FRAME Inner paddingTop=8 gap=(literal)1\n    TEXT Inner' }));
    assert.equal(later.problems.length, 2, JSON.stringify(later.problems));
  });

  it('does not check a member further while its fields are wrong: a stage that cannot run says nothing', () => {
    // The duplicate address is found once the layers' fields are right.
    const file = readComponentFile(valid({ layers: '    FRAME Inner paddingTop=8\n    TEXT Inner' }));
    assert.ok(!file.problems.some((p) => /repeats the name/.test(p.message)));
    const fixed = readComponentFile(valid({ layers: '    FRAME Inner paddingTop=(literal)8\n    TEXT Inner characters="x"' }));
    assert.ok(fixed.problems.some((p) => /repeats the name/.test(p.message)));
  });

  it('reports invalid KDL with its position', () => {
    const file = readComponentFile('component Box\nFRAME Box {\n');
    assert.equal(file.component, undefined);
    assert.match(file.problems[0].message, /not valid KDL/);
    assert.ok(file.problems[0].line !== undefined);
    assert.equal(file.problems.length, 1, 'and says nothing more about a file it could not read');
  });

  it('asks for one component, and refuses a body on it, with the line', () => {
    assert.match(readComponentFile('FRAME Box layoutMode=VERTICAL\n').problems[0].message, /the file needs one "component <Name>"/);
    const two = readComponentFile('component A\ncomponent B\nFRAME A\n');
    assert.ok(two.problems.some((p) => /a file holds one component/.test(p.message) && p.line === 2));
    const old = readComponentFile('component A {\n    FRAME A layoutMode=VERTICAL\n}\n');
    assert.ok(old.problems.some((p) => /component has no body/.test(p.message) && p.line === 2));
  });

  it('asks for exactly one root FRAME, and a FRAME at that', () => {
    const none = readComponentFile('component A\n');
    assert.ok(none.problems.some((p) => /component "A" needs one root FRAME/.test(p.message) && p.line === 1));
    const two = readComponentFile('component A\nFRAME A layoutMode=VERTICAL\nFRAME B layoutMode=VERTICAL\n');
    assert.ok(two.problems.some((p) => /exactly one root FRAME; this is a second/.test(p.message) && p.line === 3));
  });
});

describe('readComponentFile: what a component declares', () => {
  const kdl = `component Card
properties {
    VARIANT Tone calm loud
    BOOLEAN "Show Badge" default=#false
    TEXT Title default="Untitled"
    INSTANCE_SWAP Badge default=(key)"abc123" {
        preferred COMPONENT key="k1"
        preferred COMPONENT_SET key="k2"
    }
    SLOT Body description="The content." minChildren=1 maxChildren=4 allowPreferredValuesOnly=#true stretchChildOnInsert=#false displayEmptyByDefault=#true {
        preferred COMPONENT key="k3"
    }
}
FRAME Card layoutMode=VERTICAL {
    TEXT Heading characters=(property)Title
    INSTANCE Badge visible=(property)"Show Badge" component=(property)Badge
    INSTANCE Divider component=(key)"def456"
    INSTANCE Chip component=Chip
    SLOT Body layoutMode=VERTICAL
}
`;

  it('reads each property type with its defaults, settings and preferred values', () => {
    const file = readComponentFile(kdl);
    assert.deepEqual(file.problems, []);
    assert.deepEqual(
      file.component?.properties.map(({ loc: _loc, ...rest }) => rest),
      [
        { type: 'VARIANT', name: 'Tone', values: ['calm', 'loud'] },
        { type: 'BOOLEAN', name: 'Show Badge', default: false },
        { type: 'TEXT', name: 'Title', default: 'Untitled' },
        {
          type: 'INSTANCE_SWAP',
          name: 'Badge',
          default: { key: 'abc123' },
          preferredValues: [
            { type: 'COMPONENT', key: 'k1' },
            { type: 'COMPONENT_SET', key: 'k2' },
          ],
        },
        {
          type: 'SLOT',
          name: 'Body',
          description: 'The content.',
          preferredValues: [{ type: 'COMPONENT', key: 'k3' }],
          slotSettings: {
            minChildren: 1,
            maxChildren: 4,
            allowPreferredValuesOnly: true,
            stretchChildOnInsert: false,
            displayEmptyByDefault: true,
          },
        },
      ],
    );
  });

  it('reads a preferred value by name, with its line, and refuses one with both key= and name=, or neither', () => {
    const named = readComponentFile(kdl.replace('preferred COMPONENT_SET key="k2"', 'preferred COMPONENT_SET name="Badges"'));
    assert.deepEqual(named.problems, []);
    const badge = named.component?.properties.find((p) => p.name === 'Badge');
    assert.deepEqual(badge?.type === 'INSTANCE_SWAP' && badge.preferredValues, [
      { type: 'COMPONENT', key: 'k1' },
      { type: 'COMPONENT_SET', name: 'Badges', loc: { line: lineOf(kdl, 'COMPONENT_SET key="k2"'), column: 9 } },
    ]);

    const both = readComponentFile(kdl.replace('preferred COMPONENT key="k3"', 'preferred COMPONENT key="k3" name="Chip"'));
    assert.deepEqual(
      both.problems.map((p) => [p.message, p.line]),
      [['preferred COMPONENT takes key= or name=, not both', lineOf(kdl, 'key="k3"')]],
    );
    const neither = readComponentFile(kdl.replace('preferred COMPONENT key="k3"', 'preferred COMPONENT'));
    assert.deepEqual(
      neither.problems.map((p) => [p.message, p.line]),
      [['preferred COMPONENT needs key="<published key>" or name="<component name>"', lineOf(kdl, 'key="k3"')]],
    );
    const empty = readComponentFile(kdl.replace('preferred COMPONENT key="k3"', 'preferred COMPONENT name=""'));
    assert.match(empty.problems[0].message, /needs key="<published key>" or name="<component name>"/);
  });

  it('names a component by name or by published key, and nowhere else accepts a key', () => {
    const root = readComponentFile(kdl).members[0].tree;
    assert.deepEqual(find(root, 'Divider')?.fields.component, { kind: 'key', key: 'def456' });
    assert.deepEqual(find(root, 'Chip')?.fields.component, { kind: 'plain', value: 'Chip' });
    const refused = readComponentFile(kdl.replace('component=Chip', 'component=(key)7'));
    assert.match(refused.problems[0].message, /"component" takes a component name/);
    const outside = readComponentFile(kdl.replace('characters=(property)Title', 'characters=(key)"x"'));
    assert.ok(outside.problems.some((p) => /"characters" takes text/.test(p.message)));
  });

  it('takes a component with no variant axis as one member named for the component', () => {
    const file = readComponentFile(kdl.replace('    VARIANT Tone calm loud\n', ''));
    assert.deepEqual(file.problems, []);
    assert.deepEqual(
      file.members.map((m) => m.name),
      ['Card'],
    );
  });

  it('refuses an axis name a member name could not carry', () => {
    const file = readComponentFile(kdl.replace('VARIANT Tone', 'VARIANT "Tone, a"'));
    assert.match(file.problems[0].message, /an axis name cannot contain/);
  });

  it('refuses a property name with #, and a repeated variant value', () => {
    const file = readComponentFile(kdl.replace('TEXT Title', 'TEXT "Title#1"').replace('calm loud', 'calm calm'));
    const messages = file.problems.map((p) => p.message);
    assert.ok(messages.some((m) => /cannot contain "#"/.test(m)));
    assert.ok(messages.some((m) => /lists "calm" twice/.test(m)));
  });

  it('refuses child layers under a TEXT, a root that is not a FRAME, and a root with a parent to fill', () => {
    const nested = readComponentFile(
      kdl.replace('TEXT Heading characters=(property)Title', 'TEXT Heading characters=(property)Title {\n FRAME Inner\n }'),
    );
    assert.ok(nested.problems.some((p) => /a TEXT has no child layers/.test(p.message)));
    const root = readComponentFile(
      kdl.replace('FRAME Card layoutMode=VERTICAL {', 'FRAME Card layoutMode=VERTICAL layoutSizingHorizontal=FILL {'),
    );
    assert.ok(root.problems.some((p) => /root and has no parent to fill/.test(p.message)));
    const notFrame = readComponentFile(kdl.replace('FRAME Card layoutMode=VERTICAL {', 'SLOT Card layoutMode=VERTICAL {'));
    assert.ok(notFrame.problems.some((p) => /root layer must be a FRAME/.test(p.message)));
  });

  it('refuses a track with the wrong number, and a grid cell without a column', () => {
    const grid = (tracks: string, cell: string) =>
      readComponentFile(`component G
FRAME G layoutMode=GRID {
    gridRowSizes { ${tracks} }
    gridColumnSizes { FLEX; }
    FRAME Cell layoutMode=VERTICAL {
        ${cell}
    }
}
`);
    assert.ok(grid('FIXED;', 'grid row=0 column=0').problems.some((p) => /FIXED takes a number/.test(p.message)));
    assert.ok(grid('FLEX 0;', 'grid row=0 column=0').problems.some((p) => /FLEX takes a number above 0/.test(p.message)));
    assert.ok(grid('HUG 1;', 'grid row=0 column=0').problems.some((p) => /HUG takes no arguments/.test(p.message)));
    assert.ok(grid('FLEX;', 'grid row=0').problems.some((p) => /needs "column"/.test(p.message)));
    assert.ok(grid('FLEX;', 'grid row=-1 column=0').problems.some((p) => /"row" takes a whole number of at least 0/.test(p.message)));
    assert.ok(grid('FLEX;', 'grid row=0 column=0 gap=1').problems.some((p) => /"grid" has no "gap"/.test(p.message)));
    assert.ok(grid('FLEX;', 'grid 1').problems.some((p) => /"grid" takes no arguments/.test(p.message)));
    assert.deepEqual(grid('FIXED 24; HUG; FLEX 2;', 'grid row=0 column=0 rowSpan=2').problems, []);
  });

  it('points at the track, or the cell, that is wrong', () => {
    const text = `component G
FRAME G layoutMode=GRID {
    gridRowSizes {
        FLEX
        FLEX 0
    }
    gridColumnSizes { FLEX; }
    FRAME Cell layoutMode=VERTICAL {
        grid row=0 column=x
    }
}
`;
    const problems = readComponentFile(text).problems;
    const track = problems.find((p) => /FLEX takes a number above 0/.test(p.message));
    assert.equal(track?.line, 5);
    assert.equal(track?.column, 14);
    const cell = problems.find((p) => /"column" takes a whole number/.test(p.message));
    assert.equal(cell?.line, 9);
    assert.equal(cell?.column, 20);
  });
});

describe('readComponentFile: a when is written inside the layer it changes', () => {
  const file = (body: string) => `component Tag
properties {
    VARIANT Tone calm loud quiet
}
guard loud { is (input)Tone loud }
guard hushed { is (input)Tone calm quiet }
FRAME Tag layoutMode=VERTICAL {
${body}
}
`;

  it('applies its fields after the layer’s own line, and its children after the layer’s own, in file order', () => {
    const tag = (m: string) =>
      member(
        readComponentFile(
          file(
            '    FRAME Mark opacity=(literal)1 {\n        when loud opacity=(literal)0.5\n        fills "{a.b}"\n        when loud { fills "{c.d}" }\n    }',
          ),
        ).members,
        m,
      ).tree;
    const mark = find(tag('Tone=loud'), 'Mark');
    assert.deepEqual(mark?.fields.opacity, { kind: 'literal', value: 0.5 });
    assert.deepEqual(mark?.fields.fills, [token('c.d')]);
    assert.deepEqual(find(tag('Tone=calm'), 'Mark')?.fields.fills, [token('a.b')]);
  });

  it('follows a when with an else, that applies when the when did not', () => {
    const members = readComponentFile(
      file(
        '    FRAME Mark {\n        when loud opacity=(literal)0.5\n        else hushed opacity=(literal)0.8\n        else opacity=(literal)0.2\n    }',
      ),
    ).members;
    const opacity = (m: string) => (find(member(members, m).tree, 'Mark')?.fields.opacity as { value: number }).value;
    assert.deepEqual([opacity('Tone=calm'), opacity('Tone=loud'), opacity('Tone=quiet')], [0.8, 0.5, 0.8]);
  });

  it('makes a layer exist in some members only, with the same address where it does', () => {
    const members = readComponentFile(
      file('    FRAME Base layoutMode=VERTICAL\n    when loud { FRAME Extra layoutMode=VERTICAL }'),
    ).members;
    assert.deepEqual(
      members.map((m) => m.tree.children.map((c) => c.address)),
      [['Base'], ['Base', 'Extra'], ['Base']],
    );
  });

  it('moves a region to another parent by calling one definition under opposite guards', () => {
    const text = `component Pair
properties {
    VARIANT Place first second
}
guard in-second { is (input)Place second }
guard in-first { not in-second }
define note {
    FRAME Note layoutMode=VERTICAL
}
FRAME Pair layoutMode=VERTICAL {
    FRAME First layoutMode=VERTICAL {
        when in-first { +note }
    }
    FRAME Second layoutMode=VERTICAL {
        when in-second { +note }
    }
}
`;
    const file = readComponentFile(text);
    assert.deepEqual(file.problems, []);
    assert.deepEqual(
      file.members.map((m) => parentOf(m.tree, 'Note')?.address),
      ['First', 'Second'],
    );
  });

  it('refuses a definition that reads a guard written outside it: a definition is closed', () => {
    const text = file('    +mark').replace(
      'FRAME Tag layoutMode=VERTICAL {',
      'define mark {\n    FRAME Mark layoutMode=VERTICAL {\n        when loud opacity=(literal)0.5\n    }\n}\nFRAME Tag layoutMode=VERTICAL {',
    );
    const problems = readComponentFile(text).problems;
    assert.ok(
      problems.some((p) => /no guard named "loud" is in scope here/.test(p.message)),
      JSON.stringify(problems),
    );
  });
});
