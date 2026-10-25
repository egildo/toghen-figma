/**
 * One value kept in the file's shared plugin data across numbered shards: what the kept templates are stored in.
 *
 * Sized in real terms rather than against a test-only limit: the point is to cross Figma's actual 100 kB entry cap, so
 * the constant under test is the one that ships.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, useFigmaMock, PLUGIN_DATA_ENTRY_LIMIT_BYTES } from './support/figmaMock.js';
import { clearSharded, readSharded, toAsciiJson, writeSharded } from '../main/utils/shardedData.js';

const NAMESPACE = 'toghen';
const KEY = 'kept';

/** A payload of `count` entries, each the size of a realistic one. */
const big = (count: number, prefix = 'demo.color.swatch') =>
  toAsciiJson(
    Object.fromEntries(
      Array.from({ length: count }, (_, i) => [
        `${prefix}-${i}.value`,
        { id: `VariableID:1234:${i}`, hashes: { light: `hash-light-${i}`, dark: `hash-dark-${i}` } },
      ]),
    ),
  );

describe('shardedData', () => {
  useFigmaMock();

  it('round-trips a value through the file, and reads nothing where none was kept', () => {
    createFigmaMock().install();
    assert.equal(readSharded(KEY), '');

    const payload = big(2);
    assert.equal(writeSharded(KEY, payload, 8).ok, true);
    assert.equal(readSharded(KEY), payload);
  });

  it('splits a value too large for one entry across shards, each within the byte limit', () => {
    const mock = createFigmaMock().install();
    const payload = big(1200);

    const result = writeSharded(KEY, payload, 8);

    assert.equal(result.ok, true, result.reason);
    assert.ok(result.bytes > PLUGIN_DATA_ENTRY_LIMIT_BYTES, `only ${result.bytes} bytes`);
    assert.ok(result.shards > 1, `expected sharding, got ${result.shards}`);
    assert.equal(readSharded(KEY), payload);
    for (const [key, value] of Object.entries(mock.sharedPluginData(NAMESPACE))) {
      assert.ok(NAMESPACE.length + key.length + value.length <= PLUGIN_DATA_ENTRY_LIMIT_BYTES, `${key} is too big`);
    }
  });

  it('keeps names that are not ASCII as pure ASCII, so a shard is measured in bytes', () => {
    const mock = createFigmaMock().install();
    const payload = big(600, 'デモ.カラー.スウォッチ');

    assert.equal(writeSharded(KEY, payload, 8).ok, true);
    assert.equal(readSharded(KEY), payload);
    assert.doesNotMatch(Object.values(mock.sharedPluginData(NAMESPACE)).join(''), /[\u0080-￿]/);
  });

  it('clears shards a shrinking value no longer needs', () => {
    const mock = createFigmaMock().install();
    writeSharded(KEY, big(1200), 8);

    writeSharded(KEY, big(1), 8);

    assert.deepEqual(Object.keys(mock.sharedPluginData(NAMESPACE)).sort(), [KEY, `${KEY}.0`]);
  });

  it('refuses a value past the shards allowed, and keeps nothing rather than the older value', () => {
    const mock = createFigmaMock().install();
    writeSharded(KEY, big(10), 8);

    const result = writeSharded(KEY, big(12_000), 8);

    assert.equal(result.tooBig, true);
    assert.deepEqual(mock.sharedPluginData(NAMESPACE), {});
  });

  it('reads an index in a format it does not know as nothing kept', () => {
    createFigmaMock()
      .withSharedPluginData(NAMESPACE, KEY, '{"v":99,"shards":1}')
      .withSharedPluginData(NAMESPACE, `${KEY}.0`, '"x"')
      .install();
    assert.equal(readSharded(KEY), '');
  });

  it('reports rather than throws when the file refuses the write', () => {
    createFigmaMock().withPluginDataFailure('in setSharedPluginData: storage is full').install();

    const result = writeSharded(KEY, big(2), 8);

    assert.equal(result.ok, false);
    assert.match(result.reason ?? '', /storage is full/);
  });

  it('clears a value with every shard', () => {
    const mock = createFigmaMock().install();
    writeSharded(KEY, big(1200), 8);

    clearSharded(KEY);

    assert.deepEqual(mock.sharedPluginData(NAMESPACE), {});
  });
});
