import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inputsFromDocument } from '../shared/inputs.js';

// A resolver document in the shapes the W3C format documents: structured dimension and colour values, a string,
// a list of records with a reference inside, and a modifier with a default.
const document = (extra: Record<string, unknown> = {}, modifiers: Record<string, unknown> = {}) => ({
  version: '2025-11-01',
  name: 'Data',
  sets: {
    base: {
      sources: [
        {
          ds: {
            size: { $type: 'dimension', md: { $value: { value: 16, unit: 'px' } } },
            brand: { $type: 'color', accent: { $value: { colorSpace: 'srgb', components: [0.1, 0.2, 0.3] } } },
            name: { first: { $value: 'First' } },
          },
          title: { $value: 'Button' },
          count: { $value: 3 },
          enabled: { $value: true },
          properties: {
            $value: [
              { name: 'variant', label: '{ds.name.first}', width: '{ds.size.md}', tint: '{ds.brand.accent}' },
              { name: 'size', label: 'Second' },
            ],
          },
          nested: { deeper: { text: { $value: 'down here' } } },
          ...extra,
        },
      ],
    },
  },
  modifiers,
  resolutionOrder: [{ $ref: '#/sets/base' }, ...Object.keys(modifiers).map((name) => ({ $ref: `#/modifiers/${name}` }))],
});

describe('the data an artboard is evaluated with', () => {
  it('is the resolved $value of each token, nested by path', () => {
    const data = inputsFromDocument(document());
    assert.equal(data.title, 'Button');
    assert.equal(data.count, 3);
    assert.equal(data.enabled, true);
    assert.deepEqual((data.nested as Record<string, unknown>).deeper, { text: 'down here' });
    // The system's own tokens are tokens of the document too, in the structured shapes the format gives them.
    assert.deepEqual((data.ds as { size: { md: unknown } }).size.md, { value: 16, unit: 'px' });
    assert.deepEqual((data.ds as { name: unknown }).name, { first: 'First' });
  });

  it('gives a list of records for a token whose value is one, and resolves a reference inside a record through the library', () => {
    const { properties } = inputsFromDocument(document()) as { properties: Record<string, unknown>[] };
    assert.equal(properties.length, 2);
    assert.equal(properties[0].label, 'First', 'a string token, by reference');
    assert.deepEqual(properties[0].width, { value: 16, unit: 'px' }, 'a dimension token, in its structured shape');
    assert.equal((properties[0].tint as { colorSpace: string }).colorSpace, 'srgb', 'a colour token, in its structured shape');
    assert.deepEqual(properties[1], { name: 'size', label: 'Second' });
    assert.doesNotMatch(JSON.stringify(properties), /\{ds\.|\[object Object\]/);
  });

  it('reads a doubled brace as a literal one, as lib does: "{{size.sm}}" is the text {size.sm}', () => {
    const data = inputsFromDocument(
      document({ literal: { $value: '{{size.sm}}' }, rows: { $value: [{ label: 'Width {{ds.size.md}}', width: '{ds.size.md}' }] } }),
    );
    assert.equal(data.literal, '{size.sm}');
    assert.deepEqual(
      data.rows,
      [{ label: 'Width {ds.size.md}', width: { value: 16, unit: 'px' } }],
      'the escape is text; the reference beside it still resolves',
    );
  });

  it('resolves every modifier at its default context', () => {
    const themed = document(
      {},
      { theme: { default: 'light', contexts: { light: [{ themed: { $value: 'A' } }], dark: [{ themed: { $value: 'B' } }] } } },
    );
    assert.equal(inputsFromDocument(themed).themed, 'A');
  });

  it('refuses a document that cannot be resolved, and says why', () => {
    assert.throws(() => inputsFromDocument({ version: 'nope' }), /is not a resolver document that resolves/);
    const noDefault = document({}, { theme: { contexts: { light: [{}], dark: [{}] } } });
    assert.throws(() => inputsFromDocument(noDefault), /is not a resolver document that resolves/);
    assert.throws(() => inputsFromDocument(document({ lost: { $value: [{ label: '{ds.nowhere}' }] } })), /token "lost" does not resolve/);
  });
});
