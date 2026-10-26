/**
 * A document's sum is built once and shared: a run asks for it in each plan and each component file, and on a large
 * document each build is most of a second. A different base name, map or set of unfolded groups is a different sum.
 * Synthetic tokens in the W3C structured shapes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver, type ResolverDocument } from '@toghen/lib';
import { setUnfolded } from '../main/utils/folds.js';
import { buildSum } from '../main/utils/sum.js';
import { defaultTokenTypeMap } from '../shared/tokenTypeMap.js';

const srgb = (...components: number[]) => ({ colorSpace: 'srgb', components });

const DOCUMENT: ResolverDocument = {
  version: '2025-11-01',
  name: 'Demo',
  sets: {
    base: {
      sources: [
        {
          color: { surface: { $type: 'color', $value: srgb(1, 1, 1) } },
          space: { gap: { $type: 'dimension', $value: { value: 8, unit: 'px' } } },
          font: { family: { $type: 'fontFamily', $value: ['Inter', 'sans-serif'] } },
        },
      ],
    },
  },
  modifiers: {
    scheme: {
      default: 'light',
      contexts: { light: [], dark: [{ color: { surface: { $type: 'color', $value: srgb(0.1, 0.1, 0.1) } } }] },
    },
  },
  resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/scheme' }],
} as ResolverDocument;

describe('the sum of a document', () => {
  it('is built once for the same document, base name and map', () => {
    const resolver = new Resolver(DOCUMENT);
    const first = buildSum(resolver, 'Demo', defaultTokenTypeMap);
    assert.equal(buildSum(resolver, 'Demo', defaultTokenTypeMap), first);
    assert.deepEqual(
      first.tokens.map((token) => token.path),
      ['ds.color.surface', 'ds.space.gap', 'ds.font.family'].map((path) => path.replace('ds', first.dsName)),
    );
  });

  it('is built again for another base name, another map or other unfolded groups', () => {
    const resolver = new Resolver(DOCUMENT);
    const first = buildSum(resolver, 'Demo', defaultTokenTypeMap);
    assert.notEqual(buildSum(resolver, 'Other', defaultTokenTypeMap), first);
    assert.notEqual(buildSum(resolver, 'Demo', { ...defaultTokenTypeMap }), first);
    setUnfolded(resolver, ['color']);
    const unfolded = buildSum(resolver, 'Demo', defaultTokenTypeMap);
    assert.notEqual(unfolded, first);
    assert.equal(buildSum(resolver, 'Demo', defaultTokenTypeMap), unfolded);
  });

  it('is not shared between two documents', () => {
    assert.notEqual(
      buildSum(new Resolver(DOCUMENT), 'Demo', defaultTokenTypeMap),
      buildSum(new Resolver(DOCUMENT), 'Demo', defaultTokenTypeMap),
    );
  });
});
