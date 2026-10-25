/**
 * The root record of an older build becomes stamps, once.
 *
 * Older builds kept one record on the document root, keyed by token path: the variable or style written for it, a
 * hash of the token's value per mode name, and the scopes last written. The first load that finds it stamps each
 * object it names, taking as written only what Figma holds the document's value in, and deletes it with its shards.
 * Synthetic documents in the W3C structured shapes; the record is written into the mock file as an older build wrote it.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GET_SYNC_STATE, LOAD_DOCUMENT } from '../main/handlers/loadDocument.js';
import { oneFile } from './support/oneFile.js';
import { PLAN_VARIABLE_SYNC } from '../main/handlers/planVariableSync.js';
import { PLAN_STYLE_SYNC } from '../main/handlers/planStyleSync.js';
import { getState, resetState } from '../main/runtimeState.js';
import { hashOf, UNPROVEN } from '../main/components/stamp.js';
import { toAsciiJson, writeSharded } from '../main/utils/shardedData.js';
import { migrateRootRecord } from '../main/utils/rootRecord.js';
import { defaultTokenTypeMap } from '../shared/tokenTypeMap.js';
import { Resolver } from '@toghen/lib';
import type { Operation } from '../shared/operations.js';
import { createFigmaMock, useFigmaMock, type FigmaMockHandle } from './support/figmaMock.js';
import { stampAs, stampOf } from './support/stamps.js';

const LIGHT = { r: 0, g: 0.4, b: 0.8, a: 1 };
const DARK = { r: 0.1, g: 0.1, b: 0.3, a: 1 };
const srgb = (c: { r: number; g: number; b: number }) => ({ colorSpace: 'srgb', components: [c.r, c.g, c.b] });

const DOCUMENT = JSON.stringify({
  version: '2025-11-01',
  name: 'Demo',
  sets: {
    base: {
      sources: [
        {
          space: { md: { $type: 'dimension', $value: { value: 16, unit: 'px' } } },
          text: {
            body: {
              $type: 'typography',
              $value: { fontFamily: ['Inter'], fontSize: { value: 14, unit: 'px' }, fontWeight: 400, lineHeight: 1.5 },
            },
          },
        },
      ],
    },
  },
  modifiers: {
    theme: {
      default: 'light',
      contexts: {
        light: [{ color: { primary: { $type: 'color', $value: srgb(LIGHT) } } }],
        dark: [{ color: { primary: { $type: 'color', $value: srgb(DARK) } } }],
      },
    },
  },
  resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
});

const plan = () => getState().lastPlan as Operation[];
const forPath = (path: string) => plan().filter((op) => ('path' in op && op.path === path) || ('tokenPath' in op && op.tokenPath === path));
const migrate = () => migrateRootRecord(new Resolver(JSON.parse(DOCUMENT)), defaultTokenTypeMap);
const rootKeys = (mock: FigmaMockHandle) => Object.keys(mock.sharedPluginData('toghen'));

/** A file an older build synced: the variables and the style it wrote, and its record on the root. */
function syncedByAnOlderBuild() {
  const mock = createFigmaMock()
    .withCollection('Demo', ['default'])
    .withVariable('Demo', 'space/md', 'FLOAT', { default: 16 }, ['GAP'])
    .withCollection('theme', ['light', 'dark'])
    .withVariable('theme', 'color/primary', 'COLOR', { light: LIGHT, dark: DARK })
    // The font as Figma reads it back: with variation settings nobody set.
    .withStyle('TEXT', 'text/body', {
      fontName: { family: 'Inter', style: 'Regular', variationSettings: { wght: 400, slnt: 0 } },
      fontSize: 14,
      lineHeight: { unit: 'PERCENT', value: 150 },
      letterSpacing: { unit: 'PIXELS', value: 0 },
      textCase: 'ORIGINAL',
      textDecoration: 'NONE',
    })
    .install();
  const space = mock.variable('Demo', 'space/md')!;
  const primary = mock.variable('theme', 'color/primary')!;
  const body = mock.styles('TEXT')[0];
  const record = {
    'Demo.space.md': {
      variableId: space.id,
      collectionId: mock.collection('Demo')!.id,
      lastSyncedAt: '2026-10-01T09:00:00.000Z',
      lastSyncedHashes: { default: 'a1' },
      lastSyncedScopes: ['GAP'],
    },
    // `dark` never landed: the record holds a hash for `light` only.
    'Demo.color.primary': { variableId: primary.id, lastSyncedHashes: { light: 'b2' } },
    'Demo.text.body': { styleId: body.id, lastSyncedHashes: { default: 'c3' } },
    'Demo.gone.token': { variableId: 'VariableID:404:1', lastSyncedHashes: { default: 'd4' } },
  };
  // Kept as older builds kept it: an index and its shards.
  assert.equal(writeSharded('extensions', toAsciiJson(record), 8).ok, true);
  return { mock, space, primary, body };
}

describe('the root record of an older build', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  it('becomes a stamp on each object it names, from what Figma holds now, and is deleted with its shards', async () => {
    const { mock, space, primary, body } = syncedByAnOlderBuild();
    const modeOf = (collection: string, mode: string) => mock.collection(collection)!.modes.find((m) => m.name === mode)!.modeId;

    await LOAD_DOCUMENT(oneFile(DOCUMENT));

    assert.deepEqual(stampOf(space), {
      is: { token: 'Demo.space.md' },
      id: space.id,
      receipt: { [modeOf('Demo', 'default')]: hashOf(16), scopes: hashOf(['GAP']) },
    });
    assert.deepEqual(
      stampOf(primary),
      { is: { token: 'Demo.color.primary' }, id: primary.id, receipt: { [modeOf('theme', 'light')]: hashOf(LIGHT) } },
      'only the modes the record says were written',
    );
    assert.equal(stampOf(body)?.is.token, 'Demo.text.body');
    assert.ok(!Object.values(stampOf(body)!.receipt).includes(UNPROVEN), "the style holds the document's value: taken as written");
    assert.deepEqual(rootKeys(mock), [], 'the record and its shards are gone');
  });

  it('plans from the stamps as it did from the record: unchanged where nothing moved, the mode that never landed written', async () => {
    syncedByAnOlderBuild();
    await LOAD_DOCUMENT(oneFile(DOCUMENT));

    await PLAN_VARIABLE_SYNC({});

    assert.ok(forPath('Demo.space.md').some((op) => op.kind === 'SKIP' && op.reason === 'unchanged'));
    assert.deepEqual(
      forPath('Demo.color.primary')
        .filter((op) => op.kind === 'SET_VARIABLE_VALUE')
        .map((op) => op.kind === 'SET_VARIABLE_VALUE' && op.modeName),
      ['dark'],
    );
    assert.ok(
      !plan().some((op) => op.kind === 'CREATE_VARIABLE' && op.tokenPath === 'Demo.space.md'),
      'the variable is found by its stamp, not made again',
    );
  });

  it('sees a hand edit made after it as drift', async () => {
    const { space } = syncedByAnOlderBuild();
    await LOAD_DOCUMENT(oneFile(DOCUMENT));
    space.valuesByMode[Object.keys(space.valuesByMode)[0]] = 24;

    await PLAN_VARIABLE_SYNC({});

    assert.ok(forPath('Demo.space.md').some((op) => op.kind === 'SKIP' && op.reason === 'drifted'));
  });

  it('keeps a hand edit made before the upgrade as drift, for a variable and a style', async () => {
    // The old record kept such an edit while the document stood still; Figma's value now is not proof of a write.
    const { space, body } = syncedByAnOlderBuild();
    space.valuesByMode[Object.keys(space.valuesByMode)[0]] = 24;
    body.fontSize = 20;
    await LOAD_DOCUMENT(oneFile(DOCUMENT));

    await PLAN_VARIABLE_SYNC({});
    assert.ok(
      forPath('Demo.space.md').some((op) => op.kind === 'SKIP' && op.reason === 'drifted'),
      'the variable is kept, and said',
    );
    assert.ok(!forPath('Demo.space.md').some((op) => op.kind === 'SET_VARIABLE_VALUE'));
    await PLAN_STYLE_SYNC({});
    assert.deepEqual(
      forPath('Demo.text.body').map((op) => op.kind === 'SKIP' && op.reason),
      ['drifted'],
      'the style is kept, and said',
    );
  });

  it('stamps a style field by field: only the field edited before the upgrade stays unproven, and the drift names it alone', async () => {
    const { body } = syncedByAnOlderBuild();
    body.fontSize = 20;
    await LOAD_DOCUMENT(oneFile(DOCUMENT));

    const unproven = Object.entries(stampOf(body)!.receipt)
      .filter(([, hash]) => hash === UNPROVEN)
      .map(([field]) => field);
    assert.deepEqual(unproven, ['fontSize'], 'the font, read back with its variation settings, holds what the document asks for');
    await PLAN_STYLE_SYNC({});
    const [drift] = forPath('Demo.text.body');
    assert.ok(drift.kind === 'SKIP' && drift.reason === 'drifted');
    assert.match(drift.message ?? '', /\(fontSize\)/);
  });

  it("reads a style's font by its family and style: variation settings Figma reports otherwise are no change", async () => {
    const { body } = syncedByAnOlderBuild();
    await LOAD_DOCUMENT(oneFile(DOCUMENT));
    // Another machine's copy of the font, say, with an axis this one lacks.
    (body as unknown as { fontName: unknown }).fontName = {
      family: 'Inter',
      style: 'Regular',
      variationSettings: { wght: 400, slnt: 0, opsz: 14 },
    };

    await PLAN_STYLE_SYNC({});

    assert.deepEqual(
      forPath('Demo.text.body').map((op) => op.kind === 'SKIP' && op.reason),
      ['unchanged'],
    );
  });

  it('turns the record into stamps in memory only for a dry run: the plans read the same drift, and nothing is written', async () => {
    const { mock, space, body } = syncedByAnOlderBuild();
    space.valuesByMode[Object.keys(space.valuesByMode)[0]] = 24;
    body.fontSize = 20;
    const before = rootKeys(mock);
    const writes = mock.writes().length;

    await LOAD_DOCUMENT(oneFile(DOCUMENT, undefined, { dryRun: true }));
    await PLAN_VARIABLE_SYNC({});
    const variables = plan();
    await PLAN_STYLE_SYNC({});
    const styles = plan();
    await GET_SYNC_STATE();

    assert.deepEqual(rootKeys(mock), before, 'the record stays');
    assert.equal(mock.writes().length, writes, 'nothing is written');
    for (const object of [space, body]) assert.equal(object.getSharedPluginData('toghen', 'stamp'), '', 'no stamp');
    assert.ok(variables.some((op) => op.kind === 'SKIP' && op.reason === 'drifted' && op.path === 'Demo.space.md'));
    assert.ok(styles.some((op) => op.kind === 'SKIP' && op.reason === 'drifted' && op.path === 'Demo.text.body'));

    // The first real load migrates, and plans what the dry run said.
    await LOAD_DOCUMENT(oneFile(DOCUMENT));
    assert.deepEqual(rootKeys(mock), []);
    await PLAN_VARIABLE_SYNC({});
    assert.deepEqual(plan(), variables);
    await PLAN_STYLE_SYNC({});
    assert.deepEqual(plan(), styles);
  });

  it('waits for a document before it turns the record into stamps, since only a document can say what Figma agrees with', async () => {
    const { mock } = syncedByAnOlderBuild();
    const before = rootKeys(mock);

    await GET_SYNC_STATE();

    assert.deepEqual(rootKeys(mock), before);
  });

  it('runs once: a second load finds no record and changes nothing', async () => {
    const { mock } = syncedByAnOlderBuild();
    await LOAD_DOCUMENT(oneFile(DOCUMENT));
    const writes = mock.writes().length;

    await migrate();

    assert.equal(mock.writes().length, writes);
  });

  it('leaves an object already stamped as it is', async () => {
    const { space } = syncedByAnOlderBuild();
    stampAs(space, 'Demo.space.md', { mine: 'x' });

    await migrate();

    assert.deepEqual(stampOf(space)?.receipt, { mine: hashOf('x') });
  });

  it('stamps no style by name when the one the record named is gone, so the style plan adopts and writes it', async () => {
    // The defect the root record had: a style found by name was skipped on a hash recorded for another one.
    const { body } = syncedByAnOlderBuild();
    // The record names a style that is gone; another of the same name is in the file.
    writeSharded('extensions', toAsciiJson({ 'Demo.text.body': { styleId: 'S:gone', lastSyncedHashes: { default: 'c3' } } }), 8);

    await LOAD_DOCUMENT(oneFile(DOCUMENT));
    await PLAN_STYLE_SYNC({});

    assert.equal(stampOf(body), undefined);
    assert.deepEqual(
      forPath('Demo.text.body').map((op) => op.kind),
      ['UPDATE_STYLE'],
    );
  });

  it('deletes a record that cannot be read', async () => {
    const mock = createFigmaMock()
      .withSharedPluginData('toghen', 'extensions', '{"v":1,"shards":1}')
      .withSharedPluginData('toghen', 'extensions.0', '{"Demo.a": {"variableId"')
      .install();

    await migrate();

    assert.deepEqual(rootKeys(mock), []);
  });

  it('keeps the record when Figma refuses a stamp, for the next load to try again', async () => {
    const { mock } = syncedByAnOlderBuild();
    const before = rootKeys(mock);
    mock.failOn('variable.setSharedPluginData', 1, 'in setSharedPluginData: the file is read-only');

    await migrate();

    assert.deepEqual(rootKeys(mock), before);
  });
});
