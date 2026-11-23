import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintOf } from '../../main/components/fingerprint.js';
import type { Resolved } from '../../main/components/resolve.js';
import { desiredFromText } from './support.js';

/** An artboard showing one instance of a component named by its published key. */
const desired = desiredFromText(`artboard Sheet

FRAME Sheet layoutMode=VERTICAL {
    INSTANCE Mark component=(key)"k1"
}
`);

/** What the fingerprint reads of a resolution: the component an instance shows, and nothing pending. */
const resolvedTo = (component: { id: string; key: string; remote: boolean }): Resolved =>
  ({
    pending: [],
    component: () => ({ ...component, parent: null, componentPropertyDefinitions: {} }),
    componentSource: () => ({ name: 'Mark', key: component.key }),
  }) as unknown as Resolved;

describe('the fingerprint', () => {
  it('names a library component by its key: its node id changes from one import to the next (measured §15)', async () => {
    const before = await fingerprintOf(desired, resolvedTo({ id: '126:6', key: 'k1', remote: true }), undefined);
    const after = await fingerprintOf(desired, resolvedTo({ id: '127:6', key: 'k1', remote: true }), undefined);
    assert.equal(after, before);
  });

  it('names a component of the file by its node id, which another of the same key would not have', async () => {
    const before = await fingerprintOf(desired, resolvedTo({ id: '12:3', key: 'k1', remote: false }), undefined);
    const after = await fingerprintOf(desired, resolvedTo({ id: '12:4', key: 'k1', remote: false }), undefined);
    assert.notEqual(after, before);
  });
});
