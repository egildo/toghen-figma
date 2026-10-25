import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Collection, DesignSystem, DesignToken } from '@toghen/lib';
import { flattenDesignSystem } from '../main/utils/flattenDesignSystem.js';

describe('flattenDesignSystem', () => {
  it('flattens all collection tokens into full paths', () => {
    const ds = new DesignSystem();
    const base = new Collection('resolved');
    base.setToken('colors.primary', new DesignToken('#0055cc', 'color'));
    base.setToken('spacing.md', new DesignToken('16px', 'dimension'));
    ds.addCollection(base);

    const entries = [...flattenDesignSystem(ds)];
    assert.equal(entries.length, 2);
    assert.deepEqual(
      entries.map((e) => e.path),
      ['resolved.colors.primary', 'resolved.spacing.md'],
    );
    assert.deepEqual(
      entries.map((e) => e.collection),
      ['resolved', 'resolved'],
    );
  });
});
