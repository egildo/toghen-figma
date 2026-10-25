import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SymbolicIdRegistry } from '../main/utils/symbolicIdRegistry.js';

describe('SymbolicIdRegistry', () => {
  it('registers and resolves symbolic ids', () => {
    const registry = new SymbolicIdRegistry();
    registry.register('$col:Demo', 'VariableCollectionId:1');

    assert.equal(registry.has('$col:Demo'), true);
    assert.equal(registry.resolve('$col:Demo'), 'VariableCollectionId:1');
  });

  it('returns non-symbolic ids as-is', () => {
    const registry = new SymbolicIdRegistry();
    assert.equal(registry.resolve('VariableID:123'), 'VariableID:123');
  });

  it('throws on unresolved symbolic ids', () => {
    const registry = new SymbolicIdRegistry();
    assert.throws(() => registry.resolve('$var:missing'));
  });

  it('throws on invalid symbolic id registration', () => {
    const registry = new SymbolicIdRegistry();
    assert.throws(() => registry.register('not-symbolic', 'id_1'));
  });
});
