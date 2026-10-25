/**
 * A size the file says two things about.
 *
 * `#null` clears a size limit, and a width or a height has nothing to clear to. A width or a height bound to a token is a
 * fixed size, so beside a sizing that lets the layer size itself (`HUG`, `FILL`, a text's `textAutoResize`) the file
 * contradicts itself, whether it wrote the binding or `tokens=` inferred it. The check every run and `toghen-figma check`
 * share refuses both. Synthetic tokens in the W3C structured shapes, read through the `designSourceOf` the plugin uses.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver, type ResolverDocument } from '@toghen/lib';
import { designSourceOf } from '../../main/utils/designSource.js';
import { readComponentFile } from '../../shared/components/index.js';

const DOCUMENT = {
  version: '2025-11-01',
  name: 'Tokens',
  sets: {
    base: {
      sources: [
        {
          chip: {
            height: { $type: 'dimension', $value: { value: 32, unit: 'px' } },
            backgroundColor: { $type: 'color', $value: { colorSpace: 'srgb', components: [0.2, 0.4, 0.9] } },
          },
        },
      ],
    },
  },
  resolutionOrder: [{ $ref: '#/sets/base' }],
} as unknown as ResolverDocument;

const errors = (text: string) =>
  readComponentFile(text, designSourceOf(new Resolver(DOCUMENT)))
    .problems.filter((problem) => problem.severity === 'error')
    .map((problem) => problem.message);

describe('#null on a size', () => {
  const root = (fields: string) => `component Chip\nFRAME Chip layoutMode=HORIZONTAL ${fields}\n`;

  it('is refused on width and on height, saying how the layer sizes itself', () => {
    assert.deepEqual(errors(root('width=#null')), [
      '"width=#null": a width cannot be cleared; to let the layer size itself, write layoutSizingHorizontal=HUG (or FILL)',
    ]);
    assert.deepEqual(errors(root('height=#null')), [
      '"height=#null": a height cannot be cleared; to let the layer size itself, write layoutSizingVertical=HUG (or FILL)',
    ]);
  });

  it('clears a limit', () => {
    assert.deepEqual(errors(root('minWidth=#null maxWidth=#null minHeight=#null maxHeight=#null')), []);
  });
});

describe('a bound size beside a sizing that lets the layer size itself', () => {
  it('is refused when the file binds it, naming both fields and the token', () => {
    assert.deepEqual(errors('component Chip\nFRAME Chip layoutMode=HORIZONTAL layoutSizingVertical=HUG height="{chip.height}"\n'), [
      'FRAME "Chip": "height" is bound to {chip.height} while layoutSizingVertical=HUG: a bound height is a fixed size; write layoutSizingVertical=HUG and drop the height token, or keep the token and drop HUG',
    ]);
    const fill = errors(
      'component Chip\nFRAME Chip layoutMode=HORIZONTAL {\n    FRAME Box layoutSizingHorizontal=FILL width="{chip.height}"\n}\n',
    );
    assert.deepEqual(fill, [
      'FRAME "Box": "width" is bound to {chip.height} while layoutSizingHorizontal=FILL: a bound width is a fixed size; write layoutSizingHorizontal=FILL and drop the width token, or keep the token and drop FILL',
    ]);
  });

  it('is refused when tokens= binds it, on a frame and on a text that sizes itself', () => {
    const text = `component Chip tokens="{chip}"
FRAME Chip layoutMode=HORIZONTAL layoutSizingVertical=HUG {
    TEXT Label tokens="{chip}" characters="Go" textAutoResize=WIDTH_AND_HEIGHT
}
`;
    assert.deepEqual(errors(text), [
      'FRAME "Chip": "height" is bound to {chip.height} while layoutSizingVertical=HUG: a bound height is a fixed size; write layoutSizingVertical=HUG and drop the height token, or keep the token and drop HUG',
      'TEXT "Label": "height" is bound to {chip.height} while textAutoResize=WIDTH_AND_HEIGHT: a bound height is a fixed size; write textAutoResize=WIDTH_AND_HEIGHT and drop the height token, or keep the token and write textAutoResize=NONE',
    ]);
  });

  it('is a fixed size the file says once: a bound size with FIXED sizing, or HUG on the other axis', () => {
    const text = `component Chip tokens="{chip}"
FRAME Chip layoutMode=HORIZONTAL layoutSizingHorizontal=HUG layoutSizingVertical=FIXED {
    TEXT Label tokens="{chip}" characters="Go" textAutoResize=NONE
}
`;
    assert.deepEqual(errors(text), []);
  });
});
