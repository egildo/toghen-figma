/**
 * What the file's stamps say about having been synced, read back for the screen.
 *
 * Every variable and style a sync writes carries a stamp, and the dirty check reads them. These tests pin the
 * counting rules, because every one of them is a place where a plausible reading would make the status quietly lie.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver, type ResolverDocument } from '@toghen/lib';
import { createFigmaMock, useFigmaMock, type FigmaMockHandle } from './support/figmaMock.js';
import { setStamp } from '../main/components/stamp.js';
import { stampWritten } from '../main/utils/tokenStamps.js';
import { buildSyncStatePayload } from '../main/utils/syncState.js';

const COLLECTION = 'Demo';

/**
 * Two themes. `color.primary` exists in both; `color.accent` only in `dark`.
 *
 * That last token is the point of the fixture: the sum refuses a token with a
 * hole, and measuring it against every mode the *document* declares would
 * report the file's stamps wrongly either way.
 */
function themedDocument(): Resolver {
  return new Resolver({
    version: '2025-11-01',
    name: COLLECTION,
    sets: {
      base: { sources: [{ spacing: { md: { $type: 'dimension', $value: { value: 16, unit: 'px' } } } }] },
    },
    modifiers: {
      theme: {
        default: 'light',
        contexts: {
          light: [{ color: { primary: { $type: 'color', $value: { colorSpace: 'srgb', components: [0, 0.33, 0.8] } } } }],
          dark: [
            {
              color: {
                primary: { $type: 'color', $value: { colorSpace: 'srgb', components: [0.07, 0.13, 0.2] } },
                accent: { $type: 'color', $value: { colorSpace: 'srgb', components: [1, 0.53, 0] } },
              },
            },
          ],
        },
      },
    },
    resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
  } as ResolverDocument);
}

/**
 * A file holding a variable for each entry, stamped for the token with a receipt for the modes named:
 * `token → [collection, modes]`, as a sync would have left it.
 */
function fileWith(entries: Record<string, [string, string[]]>): FigmaMockHandle {
  const mock = createFigmaMock()
    .withCollection(COLLECTION, ['default'])
    .withCollection('theme', ['light', 'dark'])
    .withCollection('scheme', ['light', 'dark'])
    .withCollection('tone', ['neutral', 'alert'])
    .install();
  stamp(mock, entries);
  return mock;
}

function stamp(mock: FigmaMockHandle, entries: Record<string, [string, string[]]>): void {
  for (const [token, [name, modes]] of Object.entries(entries)) {
    const collection = mock.collection(name)!;
    const variable = figma.variables.createVariable(token, collection.id, 'COLOR');
    const reported: Record<string, unknown> = {};
    for (const mode of modes) reported[collection.modes.find((held) => held.name === mode)!.modeId] = mode;
    stampWritten(variable, token, reported);
  }
}

/** `color.primary` lives in the `theme` collection: a mode per context. */
const bothModes: [string, string[]] = ['theme', ['light', 'dark']];
/** `spacing.md` lives in the base collection: its one mode, `default`. */
const baseMode: [string, string[]] = [COLLECTION, ['default']];

describe('buildSyncStatePayload — the file, with no document', () => {
  useFigmaMock();

  it('says a never-synced file has no record', async () => {
    createFigmaMock().install();

    const payload = await buildSyncStatePayload(null);

    assert.equal(payload.hasRecord, false);
    assert.equal(payload.recordedCount, 0);
  });

  it('reports the stamps without a document, and no coverage', async () => {
    fileWith({ 'Demo.color.primary': bothModes, 'Demo.spacing.md': baseMode });

    const payload = await buildSyncStatePayload(null);

    assert.equal(payload.hasRecord, true);
    assert.equal(payload.recordedCount, 2);

    // Null rather than zero. Nothing has been asked, and `0 of 0` reads as
    // "nothing is synced" — the opposite of what the file holds.
    assert.equal(payload.documentTokenCount, null);
    assert.equal(payload.coveredCount, null);
    assert.equal(payload.partialCount, null);
  });

  it('names whose stamps they are, by the leading segment of the tokens they name', async () => {
    fileWith({ 'Demo.color.primary': bothModes, 'Demo.spacing.md': baseMode, 'Other.color.primary': bothModes });

    assert.deepEqual((await buildSyncStatePayload(null)).recordNames, ['Demo', 'Other']);
  });
});

describe('buildSyncStatePayload — coverage against a document', () => {
  useFigmaMock();

  it('counts a token complete when every mode of the collection it lives in is stamped', async () => {
    fileWith({
      'Demo.color.primary': bothModes,
      'Demo.spacing.md': baseMode,
      // Only `dark` gives this one a value: a hole in `light`, which the sum refuses and never writes.
      'Demo.color.accent': ['theme', ['dark']],
    });

    const payload = await buildSyncStatePayload(themedDocument());

    assert.equal(payload.documentTokenCount, 3);
    assert.equal(payload.coveredCount, 2, 'a token with a hole is not covered, whatever its stamp holds');
    assert.equal(payload.partialCount, 0);
  });

  it('counts a chain complete when every link is stamped, and partial when one is not', async () => {
    const chain = new Resolver({
      version: '2025-11-01',
      name: COLLECTION,
      sets: { base: { sources: [{ button: { bg: { $type: 'color', $value: '#eeeeee' } } }] } },
      modifiers: {
        scheme: { default: 'light', contexts: { light: [{}], dark: [{ button: { bg: { $value: '#333333' } } }] } },
        tone: { default: 'neutral', contexts: { neutral: [{}], alert: [{ button: { bg: { $value: '#cc2222' } } }] } },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/scheme' }, { $ref: '#/modifiers/tone' }],
    } as ResolverDocument);

    const mock = fileWith({ 'Demo.button.bg': ['tone', ['neutral', 'alert']] });
    assert.equal((await buildSyncStatePayload(chain)).documentTokenCount, 1);
    assert.equal((await buildSyncStatePayload(chain)).coveredCount, 0);
    assert.equal((await buildSyncStatePayload(chain)).partialCount, 1, 'half a chain is half done');

    stamp(mock, { 'Demo.button.bg~scheme': ['scheme', ['light', 'dark']] });
    assert.equal((await buildSyncStatePayload(chain)).coveredCount, 1);
  });

  it('calls a token partial when one of its modes never landed', async () => {
    // `dark` was cancelled mid-run. Re-planning is the resume, and the status has to agree with what that plan will contain.
    fileWith({ 'Demo.color.primary': ['theme', ['light']], 'Demo.spacing.md': baseMode });

    const payload = await buildSyncStatePayload(themedDocument());

    assert.equal(payload.coveredCount, 1);
    assert.equal(payload.partialCount, 1);
    assert.equal(payload.documentTokenCount, 3);
  });

  it('does not count a variable stamped for the token in another collection than its home', async () => {
    // What a token leaves behind when it moves: Toghen's, and not this token's coverage.
    fileWith({ 'Demo.color.primary': [COLLECTION, ['default']] });

    const payload = await buildSyncStatePayload(themedDocument());

    assert.equal(payload.coveredCount, 0);
    assert.equal(payload.partialCount, 0);
    assert.equal(payload.hasRecord, true, 'the stamp is still counted');
  });

  it('counts a style-backed token by its stamp', async () => {
    const styled = new Resolver({
      version: '2025-11-01',
      name: COLLECTION,
      sets: {
        base: {
          sources: [
            {
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
      resolutionOrder: [{ $ref: '#/sets/base' }],
    } as ResolverDocument);
    createFigmaMock().install();
    // Figma styles have no modes: the stamp is the whole record.
    setStamp(figma.createTextStyle(), { is: { token: 'Demo.text.body' }, receipt: {} });

    const payload = await buildSyncStatePayload(styled);

    assert.equal(payload.coveredCount, 1);
    assert.equal(payload.recordedCount, 1);
  });

  it('counts another document’s stamps, but out of coverage', async () => {
    // They belong to some other document synced into the same file. They are real, and they are not this document's coverage.
    fileWith({ 'Demo.color.primary': bothModes, 'Other.color.brand': bothModes });

    const payload = await buildSyncStatePayload(themedDocument());

    assert.equal(payload.recordedCount, 2);
    assert.equal(payload.coveredCount, 1);
    assert.equal(payload.documentTokenCount, 3);
  });

  it('reports zero coverage for a document this file has never seen', async () => {
    fileWith({ 'Other.color.brand': bothModes });

    const payload = await buildSyncStatePayload(themedDocument());

    assert.equal(payload.hasRecord, true);
    assert.equal(payload.coveredCount, 0);
    assert.equal(payload.partialCount, 0);
  });
});
