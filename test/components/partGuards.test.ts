/**
 * Guards for part keys, and the tokens a layer names outright that a member's parts replace.
 *
 * A guard declared with no body by a part key's name is Toghen's to supply: it holds where the key's axis has that
 * value. kdlet checks a guard's name before the axes are known, so its error for an undeclared part key is given the
 * line to write. A reference written on a layer names one variable; where an axis left in the path gives the member a
 * variable of its own for the key, the read warns. Synthetic tokens in the W3C structured shapes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver, type ResolverDocument } from '@toghen/lib';
import { designSourceOf } from '../../main/utils/designSource.js';
import { checkComponents } from '../../main/components/file.js';
import { readComponentFile } from '../../shared/components/index.js';

const srgb = (...components: number[]) => ({ colorSpace: 'srgb', components });
const fill = (...components: number[]) => ({ $type: 'color', $value: srgb(...components) });

/**
 * `toggle` has a hover part and a selected one, and a hover over the selected one: so `pointer` folds and
 * `selection` stays in the path. `tag` has only a hover part, which folds.
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
              'com.toghen': { css: { parts: { pointer: { hover: ':hover' }, selection: { selected: '[aria-checked=true]' } } } },
            },
            toggle: {
              backgroundColor: fill(1, 1, 1),
              color: fill(0, 0, 0),
              paddingTop: { $type: 'dimension', $value: { value: 4, unit: 'px' } },
              hover: { backgroundColor: fill(0.95, 0.95, 0.95) },
              selected: { backgroundColor: fill(0, 0, 1), color: fill(1, 1, 1), hover: { backgroundColor: fill(0, 0, 0.9) } },
            },
            tag: {
              color: fill(0, 0, 0),
              hover: { color: fill(0.2, 0.2, 0.2) },
            },
          },
        },
      ],
    },
  },
  resolutionOrder: [{ $ref: '#/sets/base' }],
} as unknown as ResolverDocument;

const resolver = new Resolver(DOCUMENT);
const read = (text: string) => readComponentFile(text, designSourceOf(resolver));
const of = (file: ReturnType<typeof readComponentFile>, severity: 'error' | 'warning') =>
  file.problems.filter((problem) => problem.severity === severity).map((problem) => problem.message);
const TOGGLE = (body: string, header = '') =>
  `component Toggle tokens="{ui.toggle}"\n${header}FRAME Toggle layoutMode=HORIZONTAL {\n${body}\n}\n`;
const ends = (file: ReturnType<typeof readComponentFile>) =>
  Object.fromEntries(file.members.map((member) => [member.name, member.tree.fields.primaryAxisAlignItems !== undefined]));

describe('a guard declared by a part key alone', () => {
  it('is supplied: it holds where the key’s axis has that value', () => {
    const file = read(TOGGLE('    when selected primaryAxisAlignItems=MAX', 'guard selected\n'));
    assert.deepEqual(of(file, 'error'), []);
    assert.deepEqual(ends(file), {
      'pointer=rest, selection=rest': false,
      'pointer=rest, selection=selected': true,
      'pointer=hover, selection=rest': false,
      'pointer=hover, selection=selected': true,
    });
  });

  it('is supplied for a folded axis’s key too', () => {
    const file = read(TOGGLE('    when hover primaryAxisAlignItems=MAX', 'guard hover\n'));
    assert.deepEqual(of(file, 'error'), []);
    assert.deepEqual(Object.values(ends(file)), [false, false, true, true]);
  });

  it('keeps a body that is written', () => {
    const file = read(TOGGLE('    when selected primaryAxisAlignItems=MAX', 'guard selected { is (input)selection rest }\n'));
    assert.deepEqual(of(file, 'error'), []);
    assert.deepEqual(Object.values(ends(file)), [true, false, true, false]);
  });

  for (const [what, header] of [
    ['a name that is no part key', 'guard nope\n'],
    ['rest, which every part axis has', 'guard rest\n'],
    ['a key a declared axis also has', 'properties {\n    VARIANT Size small selected\n}\nguard selected\n'],
  ] as const) {
    it(`is refused for ${what}, listing the part keys`, () => {
      const file = read(TOGGLE('', header));
      const [message] = of(file, 'error');
      assert.match(message, /has no body, which marks a guard the host supplies; Toghen supplies one only for a part key/);
      assert.match(message, header.includes('Size') ? /\(here "hover"\)/ : /\(here "hover", "selected"\)/);
    });
  }

  it('is refused inside a define, where (input) reads a parameter', () => {
    const file = read(TOGGLE('    +knob', 'define knob {\n    guard selected\n    FRAME Knob\n}\n'));
    assert.match(of(file, 'error')[0], /guard "selected" has no body/);
  });
});

describe('a when that names an undeclared part key', () => {
  it('keeps kdlet’s error and says the guard to declare', () => {
    const file = read(TOGGLE('    when selected primaryAxisAlignItems=MAX'));
    const [problem] = file.problems;
    assert.match(problem.message, /^no guard named "selected" is in scope here; /);
    assert.match(
      problem.message,
      /"selected" is a value of the axis "selection", taken from the parts of "ui\.toggle": declare it with guard selected, and Toghen supplies its body$/,
    );
    assert.deepEqual([problem.line, problem.column], [3, 10]);
  });

  it('is kdlet’s alone for a name that is no part key', () => {
    const [message] = of(read(TOGGLE('    when nope primaryAxisAlignItems=MAX')), 'error');
    assert.match(
      message,
      /^no guard named "nope" is in scope here; a guard is visible from where it is written inward, and a definition sees only its own$/,
    );
  });
});

describe('a token named outright that a member’s parts replace', () => {
  const LABEL = (fills: string) => `    TEXT Label characters="On" {\n        fills "${fills}"\n    }`;

  it('is warned of once, naming every member and the token it skips', () => {
    const file = read(TOGGLE(LABEL('{ui.toggle.color}')));
    assert.deepEqual(of(file, 'error'), []);
    assert.deepEqual(of(file, 'warning'), [
      `{ui.toggle.color} names the rest's variable, which a member's parts replace: "pointer=rest, selection=selected" selects {ui.toggle.selected.color}; "pointer=hover, selection=selected" selects {ui.toggle.selected.color}. Bind the group with tokens= to follow them, or keep the rest if that is meant`,
    ]);
    assert.equal(file.problems.find((problem) => problem.severity === 'warning')?.line, 4);
    // The warning changes nothing: the reference is bound as written.
    assert.deepEqual(file.members[1].tree.children[0].fields.fills, [{ kind: 'token', path: 'ui.toggle.color' }]);
  });

  it('is not warned of for an axis that folds', () => {
    const file = read(`component Tag tokens="{ui.tag}"\nFRAME Tag layoutMode=HORIZONTAL {\n${LABEL('{ui.tag.color}')}\n}\n`);
    assert.deepEqual(of(file, 'error'), []);
    assert.deepEqual(of(file, 'warning'), []);
  });

  it('is not warned of for a layer bound with tokens=, or a reference to the part itself', () => {
    const bound = read(TOGGLE('    TEXT Label characters="On" tokens="{ui.toggle}"'));
    assert.deepEqual(of(bound, 'warning'), []);
    const part = read(TOGGLE(LABEL('{ui.toggle.selected.color}')));
    assert.deepEqual(of(part, 'warning'), []);
  });

  it('is said by the check of the files', () => {
    const { errors, warnings } = checkComponents(
      [{ fileName: 'toggle.component.kdl', text: TOGGLE(LABEL('{ui.toggle.color}')) }],
      { names: true },
      resolver,
    );
    assert.deepEqual(errors, []);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /^toggle\.component\.kdl:4:\d+ warning: \{ui\.toggle\.color\} names the rest's variable/);
  });
});
