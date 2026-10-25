/**
 * A declared axis and an inferred one of the same name. A file that declares `VARIANT variant soft solid` and names a
 * group whose parts use the `variant` axis was refused as a property that repeats a name; the declared axis now wins.
 * Synthetic tokens in the W3C structured shapes, read through the `designSourceOf` the plugin uses.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver, type ResolverDocument } from '@toghen/lib';
import { designSourceOf } from '../../main/utils/designSource.js';
import { readComponentFile } from '../../shared/components/index.js';
import type { Value } from '../../shared/components/index.js';

const srgb = (...components: number[]) => ({ colorSpace: 'srgb', components });
const fill = (...components: number[]) => ({ $type: 'color', $value: srgb(...components) });
const token = (path: string): Value => ({ kind: 'token', path });

/** `avatar` has parts on `variant` (solid, outline) and nothing else, so the axis would fold; the file declares soft and solid. */
const DOCUMENT = {
  version: '2025-11-01',
  name: 'Demo',
  sets: {
    base: {
      sources: [
        {
          ui: {
            $extensions: {
              'com.toghen': { css: { parts: { variant: { solid: "[data-variant='solid']", outline: "[data-variant='outline']" } } } },
            },
            avatar: {
              backgroundColor: fill(0.9, 0.9, 0.9),
              solid: { backgroundColor: fill(0, 0, 1) },
              outline: { backgroundColor: fill(1, 1, 1) },
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
const warnings = (file: ReturnType<typeof readComponentFile>) =>
  file.problems.filter((problem) => problem.severity === 'warning').map((problem) => problem.message);
const AVATAR = (header: string, properties = '    VARIANT variant soft solid') => `component Avatar${header}
properties {
${properties}
}
FRAME Avatar layoutMode=HORIZONTAL
`;

describe('a declared axis of the name of an inferred one', () => {
  const file = read(AVATAR(' tokens="{ui.avatar}" layout=parts'));

  it('wins: it is marked as a part axis and keeps its declared values', () => {
    assert.deepEqual(errors(file), []);
    assert.deepEqual(
      file.component?.properties.map(
        (property) => property.type === 'VARIANT' && [property.name, property.values, property.part, property.modifier],
      ),
      [['variant', ['soft', 'solid'], true, undefined]],
    );
    assert.deepEqual(
      file.members.map((member) => member.name),
      ['variant=soft', 'variant=solid'],
    );
  });

  it("selects the part group of the member's value, and reads the rest where the value has no part group", () => {
    const fills = Object.fromEntries(file.members.map((member) => [member.name, (member.tree.fields.fills as Value[])[0]]));
    assert.deepEqual(fills, {
      'variant=soft': token('ui.avatar.backgroundColor'),
      'variant=solid': token('ui.avatar.solid.backgroundColor'),
    });
  });

  it('warns on the component line of a part key the declared axis does not list, and not of a declared value with no part', () => {
    assert.deepEqual(warnings(file), [
      'VARIANT "variant" is declared and also comes from the parts of "ui.avatar"; the declared values win, and "outline" is left out.',
    ]);
    const warning = file.problems.find((problem) => problem.severity === 'warning')!;
    assert.equal(warning.line, 1);
  });

  it('says nothing when the declared values cover every part key', () => {
    const covered = read(AVATAR(' tokens="{ui.avatar}" layout=parts', '    VARIANT variant solid outline soft'));
    assert.deepEqual(errors(covered), []);
    assert.deepEqual(warnings(covered), []);
  });

  it('pins nothing, since the axis is left in the path', () => {
    assert.deepEqual(
      file.members.map((member) => member.tree.fields.modes),
      [undefined, undefined],
    );
  });
});

describe('a declared axis where the inferred one would fold', () => {
  it('refuses the file, and says to drop the declared axis or lay the component out with layout=parts', () => {
    const folded = read(AVATAR(' tokens="{ui.avatar}"'));
    assert.equal(errors(folded).length, 1);
    assert.match(
      errors(folded)[0],
      /^VARIANT "variant" is declared and also comes from the parts of "ui\.avatar", which fold it into modes/,
    );
    assert.match(errors(folded)[0], /Drop the declared axis, or lay the component out with layout=parts$/);
  });
});
