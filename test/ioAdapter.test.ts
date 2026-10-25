import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Collection, DesignSystem, DesignToken, Resolver, type ResolverDocument } from '@toghen/lib';
import { exportToJSON } from '../main/engines/ioAdapter.js';
import type { Stamp } from '../main/components/stamp.js';

function createDesignSystem(): DesignSystem {
  const ds = new DesignSystem();
  const base = new Collection('Demo');

  base.setToken(
    'color.primary',
    new DesignToken('#0055cc', 'color', 'Primary color', {
      vendor: { source: 'seed' },
    }),
  );
  base.setToken('spacing.md', new DesignToken('16px', 'dimension'));

  ds.addCollection(base);
  return ds;
}

describe('exportToJSON', () => {
  it('exports W3C-like token structure without extensions when disabled', () => {
    const ds = createDesignSystem();
    const json = exportToJSON(ds, new Map<string, Stamp>(), {
      includeExtensions: false,
    });

    const parsed = JSON.parse(json) as Record<string, any>;
    assert.equal(parsed.color.primary.$value.hex, '#0055cc');
    assert.equal(parsed.color.primary.$type, 'color');
    assert.equal(parsed.color.primary.$description, 'Primary color');
    assert.equal(parsed.color.primary.$extensions, undefined);
  });

  it('writes a token’s stamp out under com.toghen.figma, for reading, when includeExtensions is true', () => {
    const ds = createDesignSystem();
    const stamp: Stamp = { is: { token: 'Demo.color.primary' }, receipt: { '1:0': 'k2x9-1c', scopes: 'p0q-b' } };

    const json = exportToJSON(ds, new Map([['Demo.color.primary', stamp]]), {
      includeExtensions: true,
    });

    const parsed = JSON.parse(json) as Record<string, any>;
    assert.equal(parsed.color.primary.$extensions.vendor.source, 'seed');
    assert.deepEqual(parsed.color.primary.$extensions['com.toghen.figma'].stamp, stamp);
    assert.equal(parsed.spacing.md.$extensions, undefined);
  });

  it('keeps keys the document already had under our own namespace', () => {
    // Replacing the namespace object wholesale dropped anything another build
    // had written there.
    const ds = new DesignSystem();
    const collection = new Collection('Demo');
    collection.setToken(
      'color.primary',
      new DesignToken('#0055cc', 'color', undefined, {
        'com.toghen.figma': { variableId: 'VariableID:old', writtenByAFutureBuild: 42 },
      }),
    );
    ds.addCollection(collection);

    const stamps = new Map<string, Stamp>([['Demo.color.primary', { is: { token: 'Demo.color.primary' }, receipt: {} }]]);

    const parsed = JSON.parse(exportToJSON(ds, stamps, { includeExtensions: true })) as Record<string, any>;
    const ours = parsed.color.primary.$extensions['com.toghen.figma'];

    assert.deepEqual(ours.stamp, { is: { token: 'Demo.color.primary' }, receipt: {} }, 'the stamp is written beside it');
    assert.equal(ours.writtenByAFutureBuild, 42, 'the unknown key should survive');
  });

  it('does not write the collection as the top-level key, so the export loads back as a DTCG document', () => {
    const json = exportToJSON(createDesignSystem(), new Map<string, Stamp>(), { includeExtensions: false });
    const parsed = JSON.parse(json) as Record<string, any>;

    assert.equal(parsed.Demo, undefined);
    assert.deepEqual(Object.keys(parsed).sort(), ['color', 'spacing']);

    // The file is a token set again: a resolver document reads it, and finds the tokens at their own paths.
    const resolver = new Resolver({
      version: '2025-11-01',
      name: 'Again',
      sets: { exported: { sources: [parsed] } },
      resolutionOrder: [{ $ref: '#/sets/exported' }],
    } as ResolverDocument);
    const again = resolver.resolveToDesignSystem();
    assert.equal((again.resolveValue('Again.color.primary') as { hex: string }).hex, '#0055cc');
    assert.deepEqual(again.resolveValue('Again.spacing.md'), { value: 16, unit: 'px' });
  });
});
