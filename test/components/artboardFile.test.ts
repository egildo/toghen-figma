import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readComponentFile } from '../../shared/components/index.js';
import type { Layer, Problem, SetField } from '../../shared/components/index.js';

/** The one-based line of the first line of `text` containing `needle`. */
const lineOf = (text: string, needle: string): number => {
  const index = text.split('\n').findIndex((line) => line.includes(needle));
  assert.notEqual(index, -1, `the text has no line containing ${needle}`);
  return index + 1;
};

const errors = (problems: Problem[]): Problem[] => problems.filter((problem) => problem.severity === 'error');

const find = (layer: Layer, address: string): Layer | undefined =>
  layer.address === address ? layer : layer.children.map((child) => find(child, address)).find((found) => found !== undefined);

// A page of rows, one per property of the component documented: the shape an artboard file is for.
const PAGE = `artboard Docs

guard flagged { is (input)mode flagged }

FRAME "Docs page" layoutMode=VERTICAL layoutSizingHorizontal=HUG layoutSizingVertical=HUG itemSpacing="{space.md}" {
    fills "{surface.page}"
    TEXT Heading characters=(input)title textStyle="{text.label}"
    each p in=(input)properties key=name {
        guard required { is (p)kind required }
        INSTANCE Row component=PropertyRow {
            set Name=(p)name Kind=(p)kind
            when required { set Highlighted=#true }
            slot Extra {
                TEXT Note characters=(p)note textStyle="{text.label}"
            }
        }
    }
}
`;

const INPUTS = {
  title: 'Button',
  mode: 'plain',
  properties: [
    { name: 'variant', kind: 'required', note: 'The look.' },
    { name: 'size', kind: 'plain', note: 'How big.' },
  ],
};

describe('an artboard file: its header and its root', () => {
  it('reads as one frame, named, with the component file shape: a name, no properties, one member', () => {
    const file = readComponentFile(PAGE, undefined, INPUTS);
    assert.deepEqual(errors(file.problems), []);
    assert.equal(file.artboard, true);
    assert.deepEqual(file.component, { name: 'Docs', properties: [], exclude: [] });
    assert.equal(file.members.length, 1);
    assert.equal(file.members[0].name, 'Docs');
    assert.equal(file.members[0].tree.kind, 'FRAME');
    assert.equal(file.members[0].tree.address, 'Docs page');
  });

  it('gives each repeated layer an address of its own: its name and the keys of the each around it', () => {
    const { tree } = readComponentFile(PAGE, undefined, INPUTS).members[0];
    assert.deepEqual(
      tree.children.map((child) => child.address),
      ['Heading', 'Row["variant"]', 'Row["size"]'],
    );
    // What Figma shows is the name the file wrote, and the address is what the next run finds the layer by.
    assert.equal(tree.children[1].name, 'Row');
    assert.equal(tree.children[0].name, undefined);
  });

  it('flattens the layers of a slot into the instance, each marked with its slot, and keeps the slot a layer fills nothing in', () => {
    const { tree } = readComponentFile(PAGE, undefined, INPUTS).members[0];
    const row = tree.children[1];
    assert.deepEqual(
      row.slots?.map((slot) => slot.name),
      ['Extra'],
    );
    assert.deepEqual(
      row.children.map((child) => [child.address, child.slot]),
      [['Note["variant"]', 'Extra']],
    );

    const empty = readComponentFile(`artboard A\nFRAME A {\n    INSTANCE Row component=PropertyRow {\n        slot Extra\n    }\n}\n`);
    assert.deepEqual(errors(empty.problems), []);
    const instance = find(empty.members[0].tree, 'Row')!;
    assert.deepEqual(
      instance.slots?.map((slot) => slot.name),
      ['Extra'],
    );
    assert.deepEqual(instance.children, []);
  });

  it('reads set as the instance’s properties by display name, a later write of one name replacing the earlier, with the line of each value', () => {
    const { tree } = readComponentFile(PAGE, undefined, INPUTS).members[0];
    const first = tree.children[1].fields.set as SetField;
    // `variant` is required, so the `when` added Highlighted to what the line before it set.
    assert.deepEqual(Object.keys(first), ['Name', 'Kind', 'Highlighted']);
    assert.deepEqual(first.Name.value, 'variant');
    assert.equal(first.Highlighted.value, true);
    assert.equal(first.Highlighted.loc?.line, lineOf(PAGE, 'when required { set Highlighted'));
    const second = tree.children[2].fields.set as SetField;
    assert.deepEqual(Object.keys(second), ['Name', 'Kind']);
  });

  it('reads a swap as a component name or (key), and keeps a boolean a boolean', () => {
    const file = readComponentFile(
      `artboard A\nFRAME A {\n    INSTANCE Row component=PropertyRow {\n        set Icon=Glyph Other=(key)"abc" On=#false\n    }\n}\n`,
    );
    assert.deepEqual(errors(file.problems), []);
    const set = find(file.members[0].tree, 'Row')!.fields.set as SetField;
    assert.deepEqual([set.Icon.value, set.Other.value, set.On.value], ['Glyph', { key: 'abc' }, false]);
  });

  it('lets a guard read the inputs, and a when apply what it holds for', () => {
    const text =
      'artboard A\nguard flagged { is (input)mode flagged }\nFRAME A {\n    when flagged opacity=(literal)0.5\n    else opacity=(literal)1\n}\n';
    const opacity = (mode: string) =>
      (readComponentFile(text, undefined, { mode }).members[0].tree.fields.opacity as { value: number }).value;
    assert.equal(opacity('flagged'), 0.5);
    assert.equal(opacity('plain'), 1);
  });

  it('takes a define and a call, and a repeated address that the define takes from a parameter', () => {
    const text = `artboard A
define row label {
    INSTANCE (input)label component=PropertyRow {
        set Name=(input)label
    }
}
FRAME A {
    +row label="One"
    +row label="Two"
}
`;
    const file = readComponentFile(text);
    assert.deepEqual(errors(file.problems), []);
    assert.deepEqual(
      file.members[0].tree.children.map((child) => child.address),
      ['One', 'Two'],
    );
  });
});

describe('an artboard file: what it refuses', () => {
  const refused = (text: string, inputs: Record<string, unknown> = {}): Problem[] => {
    const file = readComponentFile(text, undefined, inputs);
    assert.deepEqual(file.members, [], 'nothing is built while there is an error');
    return errors(file.problems);
  };

  it('wants one artboard, with a name, no body and no property', () => {
    assert.match(refused('artboard A\nartboard B\nFRAME A\n')[0].message, /a file holds one artboard/);
    assert.match(refused('artboard\nFRAME A\n')[0].message, /artboard needs its name as its only argument/);
    assert.match(refused('artboard A {\n  FRAME A\n}\n')[0].message, /artboard has no body/);
    assert.match(refused('artboard A tokens="{x}"\nFRAME A\n')[0].message, /artboard has no "tokens"/);
  });

  it('carries no properties, no exclude, no include, no description and no component', () => {
    for (const [word, text] of [
      ['properties', 'properties {\n  TEXT T default="x"\n}\n'],
      ['exclude', 'exclude A=b\n'],
      ['include', 'include A=b\n'],
      ['description', 'description "x"\n'],
    ] as const) {
      const problems = refused(`artboard A\n${text}FRAME A\n`);
      assert.match(problems[0].message, new RegExp(`${word} belongs to a component file`), word);
      assert.equal(problems[0].line, 2, 'with the line of the word');
    }
    assert.match(refused('artboard A\ncomponent B\nFRAME A\n')[0].message, /an artboard or a component, not both/);
  });

  it('wants one root FRAME', () => {
    assert.match(refused('artboard A\n')[0].message, /artboard "A" needs one root FRAME/);
    assert.match(refused('artboard A\nFRAME A\nFRAME B\n')[0].message, /exactly one root FRAME; this is a second/);
    assert.match(refused('artboard A\nTEXT A characters="x"\n')[0].message, /root layer must be a FRAME, not a TEXT/);
  });

  it('refuses a missing input where it would be shown, with its line', () => {
    const problems = refused(PAGE, { ...INPUTS, title: undefined });
    assert.equal(problems.length, 1);
    assert.equal(problems[0].line, lineOf(PAGE, 'TEXT Heading'));
    assert.match(problems[0].message, /title/);
    // A list that is not there is an error, not an empty list.
    const noList = refused(PAGE, { title: 'x' });
    assert.ok(noList.some((problem) => problem.line === lineOf(PAGE, 'each p in')));
  });

  it('refuses an each with no key, and a guard the host would have to supply', () => {
    assert.ok(refused('artboard A\nFRAME A {\n  each p in=(input)l {\n    FRAME X\n  }\n}\n', { l: [] }).length > 0);
    const hostGuard = refused('artboard A\nguard pricey\nFRAME A\n');
    assert.match(hostGuard[0].message, /guard "pricey" has no body.*an artboard file has no host/);
    assert.equal(hostGuard[0].line, 2);
  });

  it('refuses addresses that repeat, naming the line of the first, and says how a definition avoids it', () => {
    const text =
      'artboard A\nFRAME A {\n    TEXT Same characters="a" textStyle="{text.label}"\n    TEXT Same characters="b" textStyle="{text.label}"\n}\n';
    const [problem] = refused(text);
    assert.match(problem.message, /TEXT "Same" repeats the address of TEXT "Same" \(line 3\)/);
    assert.match(problem.message, /takes its layers' names from a parameter/);
    assert.equal(problem.line, 4);
  });

  it('refuses a (property) wire, tokens=, a SLOT layer and a bare number, as the artboard has none of a component’s properties', () => {
    const wired = refused('artboard A\nFRAME A {\n    TEXT T characters=(property)Label textStyle="{text.label}"\n}\n');
    assert.match(wired[0].message, /an artboard has no component properties to wire to/);
    assert.equal(wired[0].line, 3);
    assert.match(refused('artboard A\nFRAME A tokens="{button}"\n')[0].message, /tokens does not apply in an artboard file/);
    assert.match(refused('artboard A\nFRAME A {\n    SLOT Content\n}\n')[0].message, /a SLOT layer makes the slot of a component/);
    assert.match(refused('artboard A\nFRAME A itemSpacing=8\n')[0].message, /a bare 8/);
  });

  it('refuses what set and slot may not be', () => {
    const instance = (body: string) => `artboard A\nFRAME A {\n    INSTANCE Row component=PropertyRow {\n        ${body}\n    }\n}\n`;
    assert.match(refused(instance('set'))[0].message, /"set" needs at least one Name=value/);
    assert.match(refused(instance('set foo'))[0].message, /"set" takes properties.*not "foo"/);
    assert.match(refused(instance('set Count=3'))[0].message, /"Count" in "set" takes text, #true, #false or \(key\)/);
    assert.match(refused(instance('set Name=(literal)"x"'))[0].message, /"Name" in "set" takes text/);
    assert.match(refused(instance('set Name="x" {\n            FRAME F\n        }'))[0].message, /"set" takes no child nodes/);
    assert.match(refused(instance('slot Extra\n        slot Extra'))[0].message, /fills the slot "Extra" twice/);
    assert.match(refused(instance('slot Extra visible=#false'))[0].message, /slot "Extra" has no field "visible"/);
    assert.match(
      refused('artboard A\nFRAME A {\n    INSTANCE Row component=PropertyRow isExposedInstance=#true\n}\n')[0].message,
      /isExposedInstance does not apply in an artboard file/,
    );
    assert.match(refused(instance('slot'))[0].message, /slot needs the name of the slot/);
    assert.match(refused(instance('FRAME Stray'))[0].message, /cannot hold FRAME "Stray".*put it in a slot/);
    // A slot fills an instance's slot, and stands directly in it.
    assert.match(refused('artboard A\nFRAME A {\n    slot Extra\n}\n')[0].message, /"slot" fills a slot of the instance it stands in/);
    assert.match(
      refused(instance('slot Extra {\n            slot Inner\n        }'))[0].message,
      /stands inside an INSTANCE, not inside another slot/,
    );
    // set belongs to an INSTANCE.
    assert.match(
      refused('artboard A\nFRAME A {\n    TEXT T characters="x" textStyle="{text.label}" {\n        set Name="x"\n    }\n}\n')[0].message,
      /"set" does not apply to a TEXT layer/,
    );
  });

  it('refuses the same word pairs in a component file: slot and each, and a file named for the wrong kind is the plugin’s', () => {
    const component = (layers: string, head = 'component C\n') => `${head}FRAME C {\n    ${layers}\n}\n`;
    const slot = errors(readComponentFile(component('INSTANCE I component=Other {\n        slot Extra\n    }')).problems);
    assert.match(slot[0].message, /fills an instance's slot in an artboard file/);
    const each = errors(readComponentFile(component('each p in=(input)l key=name {\n        FRAME X\n    }')).problems);
    assert.match(each[0].message, /"each" is not built for component files/);
  });
});

describe('a component file is unchanged by the artboard words', () => {
  it('is not mistaken for an artboard, and ignores the inputs it is given', () => {
    const text = 'component C\nFRAME C layoutMode=VERTICAL\n';
    const read = readComponentFile(text, undefined, { anything: 1 });
    assert.equal(read.artboard, undefined);
    assert.deepEqual(read.problems, []);
    assert.equal(read.members.length, 1);
    assert.equal(read.members[0].name, 'C');
  });
});
