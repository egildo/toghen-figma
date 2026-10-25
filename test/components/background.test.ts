/**
 * `background` in a CSS-keyed group: the shorthand most stylesheets use for a plain colour. It fills the layer when its
 * token is a colour, and is skipped, with the usual note, when it is anything else. Synthetic tokens in the W3C structured
 * shapes, through the same `designSourceOf` the plugin uses.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver, type ResolverDocument } from '@toghen/lib';
import { designSourceOf } from '../../main/utils/designSource.js';
import { readComponentFile } from '../../shared/components/index.js';
import type { GroupInfo, Layer } from '../../shared/components/index.js';

const srgb = (r: number, g: number, b: number) => ({ colorSpace: 'srgb', components: [r, g, b] });
const color = (value: unknown) => ({ $type: 'color', $value: value });
const gradient = {
  $type: 'gradient',
  $value: [
    { color: srgb(1, 0, 0), position: 0 },
    { color: srgb(0, 0, 1), position: 1 },
  ],
};

const DOCUMENT = {
  version: '2025-11-01',
  name: 'ds',
  sets: {
    base: {
      sources: [
        {
          paper: color(srgb(1, 1, 1)),
          plain: { background: color(srgb(0.9, 0.9, 0.9)) },
          aliased: { background: color('{paper}') },
          graded: { background: gradient },
          // both spellings, in either order of the document: the more specific one fills
          before: { background: color(srgb(0.1, 0.1, 0.1)), backgroundColor: color(srgb(0.2, 0.2, 0.2)) },
          after: { backgroundColor: color(srgb(0.2, 0.2, 0.2)), background: color(srgb(0.1, 0.1, 0.1)) },
          varying: { background: color(srgb(0.9, 0.9, 0.9)) },
        },
      ],
    },
  },
  modifiers: {
    theme: {
      default: 'light',
      contexts: { light: [], dark: [{ varying: { background: gradient } }] },
    },
  },
  resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
} as unknown as ResolverDocument;

const design = designSourceOf(new Resolver(DOCUMENT));
const errors = (file: ReturnType<typeof readComponentFile>) =>
  file.problems.filter((problem) => problem.severity === 'error').map((problem) => problem.message);
const token = (path: string) => ({ kind: 'token', path });

/** What a layer of the kind gets from the group, and what the file says about it. */
function infer(kind: 'FRAME' | 'TEXT', group: string) {
  const line = kind === 'TEXT' ? `TEXT Layer tokens="{${group}}" characters="Hi"` : `FRAME Layer tokens="{${group}}" layoutMode=NONE`;
  const file = readComponentFile(`component Thing\nFRAME Root layoutMode=VERTICAL {\n    ${line}\n}\n`, design);
  assert.deepEqual(errors(file), []);
  return { file, fields: (file.members[0].tree.children[0] as Layer).fields };
}

describe('background fills the layer when its token is a colour', () => {
  it('is a fill on a frame, as backgroundColor is, and says nothing', () => {
    const { file, fields } = infer('FRAME', 'plain');
    assert.deepEqual(fields.fills, [token('plain.background')]);
    assert.equal(file.component?.notes, undefined);
  });

  it('follows a colour that is only a reference to another', () => {
    assert.deepEqual(infer('FRAME', 'aliased').fields.fills, [token('aliased.background')]);
  });

  it('is told by the design system as a colour in every context, and not otherwise', () => {
    assert.deepEqual((design.group?.('plain') as GroupInfo).colors, ['background']);
    assert.equal((design.group?.('graded') as GroupInfo).colors, undefined);
    assert.equal(
      (design.group?.('varying') as GroupInfo).colors,
      undefined,
      'a colour in one context and a gradient in another is not one colour',
    );
  });

  it('is skipped with the current note when the token holds a gradient, or is one only in a context', () => {
    for (const group of ['graded', 'varying']) {
      const { file, fields } = infer('FRAME', group);
      assert.equal('fills' in fields, false, group);
      assert.deepEqual(file.component?.notes, [
        `FRAME "Layer" tokens="{${group}}": "background" has no field on this layer in Figma, skipped`,
      ]);
    }
  });

  it('is skipped on a text, whose colour is the key color', () => {
    const { file, fields } = infer('TEXT', 'plain');
    assert.equal('fills' in fields, false);
    assert.deepEqual(file.component?.notes, ['TEXT "Layer" tokens="{plain}": "background" has no field on this layer in Figma, skipped']);
  });

  it('is outranked by backgroundColor, whichever the document writes first', () => {
    assert.deepEqual(infer('FRAME', 'before').fields.fills, [token('before.backgroundColor')]);
    assert.deepEqual(infer('FRAME', 'after').fields.fills, [token('after.backgroundColor')]);
  });
});
