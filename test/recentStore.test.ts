/**
 * The recents list: the last few design systems a user loaded, kept per user so
 * they can be loaded again without finding the file.
 *
 * The behaviour worth pinning is not "it stores things" but the three places a
 * plausible implementation goes quietly wrong: a re-loaded document growing a
 * second row, a version read from the wrong field, and a storage refusal taking
 * the load down with it.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, useFigmaMock, type FigmaMockHandle } from './support/figmaMock.js';
import { LOAD_DOCUMENT, LOAD_RECENT, GET_RECENTS, FORGET_RECENT } from '../main/handlers/loadDocument.js';
import { oneFile } from './support/oneFile.js';
import { MAX_RECENTS, RECENTS_KEY, loadRecents, rememberRecent, type RecentDocument } from '../main/utils/recentStore.js';
import { getState, resetState } from '../main/runtimeState.js';
import type { RecentDocumentSummary } from '../shared/protocol.js';

/**
 * A two-theme document. `version` at the root is the **format** version the
 * spec fixes; the system's own version rides on a set's `$extensions`, which is
 * where §4.3 allows extensions to live.
 */
const documentJson = (name: string, options: { systemVersion?: string; bg?: string } = {}): string =>
  JSON.stringify({
    version: '2025-11-01',
    name,
    description: `${name} tokens`,
    sets: {
      base: {
        ...(options.systemVersion ? { $extensions: { 'com.toghen': { version: options.systemVersion } } } : {}),
        sources: [{ color: { bg: { $type: 'color', $value: options.bg ?? '#ffffff' } } }],
      },
    },
    modifiers: {
      theme: {
        default: 'light',
        contexts: {
          light: [{ color: { fg: { $type: 'color', $value: '#000000' } } }],
          dark: [{ color: { fg: { $type: 'color', $value: '#ffffff' } } }],
        },
      },
    },
    resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
  });

/** The most recent `RECENTS` the main thread posted. */
const postedRecents = (mock: FigmaMockHandle): RecentDocumentSummary[] => {
  const messages = mock
    .calls('ui.postMessage')
    .map((call) => call.args[0] as { type: string; payload: unknown })
    .filter((message) => message.type === 'RECENTS');

  const latest = messages.at(-1);
  assert.ok(latest, 'no RECENTS was posted');
  return latest.payload as RecentDocumentSummary[];
};

const entry = (key: string, overrides: Partial<RecentDocument> = {}): RecentDocument => ({
  key,
  name: key,
  tokenCount: 2,
  modes: ['light', 'dark'],
  loadedAt: '2026-08-12T10:00:00.000Z',
  document: JSON.parse(documentJson(key)),
  composition: { form: 'resolver', entry: `${key}.resolver.json`, reads: [] },
  ...overrides,
});

describe('recents — what a row says', () => {
  useFigmaMock();

  it('records the design system’s own version, not the document format version', async () => {
    // Every conforming document declares `"2025-11-01"` at its root. Showing
    // that would put the same string on every row and distinguish nothing.
    const mock = createFigmaMock().install();
    resetState();

    await LOAD_DOCUMENT(oneFile(documentJson('demo', { systemVersion: '1.4.0' }), 'toghen.resolver.json'));

    const [recent] = postedRecents(mock);
    assert.equal(recent.name, 'demo');
    assert.equal(recent.version, '1.4.0');
    assert.notEqual(recent.version, '2025-11-01');
    assert.deepEqual(recent.modes, ['light', 'dark']);
    // The modifiers too, so the row can say what shape the system has.
    assert.deepEqual(recent.modifiers, ['theme']);
    assert.equal(recent.fileName, 'toghen.resolver.json');
  });

  it('leaves the version out when the system declares none', async () => {
    const mock = createFigmaMock().install();
    resetState();

    await LOAD_DOCUMENT(oneFile(documentJson('demo'), 'demo.resolver.json'));

    assert.equal(postedRecents(mock)[0].version, undefined);
  });

  it('never sends the document itself to the UI', async () => {
    // Five documents crossing the iframe boundary on every load is work
    // nobody asked for, and the UI has no use for them.
    const mock = createFigmaMock().install();
    resetState();

    await LOAD_DOCUMENT(oneFile(documentJson('demo')));

    assert.equal('document' in postedRecents(mock)[0], false);
    assert.equal('composition' in postedRecents(mock)[0], false);
    // But the main thread keeps it, or the row could not be clicked.
    assert.ok((await loadRecents())[0].document.name === 'demo');
  });
});

describe('recents — the list', () => {
  useFigmaMock();

  it('replaces an entry rather than growing a second one', async () => {
    // Editing a document and loading it again is a normal working loop, not
    // a new system. Keyed by name, the row is replaced and moves to the top.
    const mock = createFigmaMock().install();
    resetState();

    await LOAD_DOCUMENT(oneFile(documentJson('demo', { bg: '#ffffff' })));
    await LOAD_DOCUMENT(oneFile(documentJson('other')));
    await LOAD_DOCUMENT(oneFile(documentJson('demo', { bg: '#111111' })));

    const recents = postedRecents(mock);
    assert.equal(recents.length, 2, `expected 2 entries, got ${recents.map((r) => r.name)}`);
    assert.equal(recents[0].name, 'demo', 'the one just loaded comes first');
    // And it is the *new* document that was kept, not the first one.
    assert.ok(JSON.stringify((await loadRecents())[0].document).includes('#111111'));
  });

  it('keeps five, dropping the oldest', async () => {
    // Five as a literal, not as `MAX_RECENTS`. Written against the constant
    // this test passed with the cap raised to 99: it generated `cap + 2`
    // documents and asserted `cap` survived, which is true of any number.
    // A test that moves with the thing it measures measures nothing.
    createFigmaMock().install();
    resetState();

    for (let i = 0; i < 7; i += 1) {
      await LOAD_DOCUMENT(oneFile(documentJson(`system-${i}`)));
    }

    const stored = await loadRecents();
    assert.equal(stored.length, 5);
    assert.equal(stored[0].name, 'system-6', 'newest first');
    assert.deepEqual(
      stored.map((r) => r.name),
      ['system-6', 'system-5', 'system-4', 'system-3', 'system-2'],
      'the two oldest should have been dropped',
    );
    assert.equal(MAX_RECENTS, 5, 'and the constant says so too');
  });

  it('loads a stored document without the file, and by the same path', async () => {
    const mock = createFigmaMock().install();
    resetState();

    await LOAD_DOCUMENT(oneFile(documentJson('demo', { systemVersion: '1.4.0' })));
    resetState(); // Closing the plugin: the sandbox goes, clientStorage stays.
    assert.equal(getState().resolver, null);

    await LOAD_RECENT({ key: 'demo' });

    assert.ok(getState().resolver, 'the document should be loaded again');
    assert.equal(getState().resolver?.name, 'demo');
    const loaded = mock
      .calls('ui.postMessage')
      .map((call) => call.args[0] as { type: string })
      .filter((m) => m.type === 'DOCUMENT_LOADED');
    assert.ok(loaded.length >= 2, 'a recent load announces itself like any other');
  });

  it('keeps the bundle and the composition, not the files, and says a recent came from the bundle', async () => {
    const mock = createFigmaMock().install();
    resetState();
    const entryDocument = JSON.stringify({
      version: '2025-11-01',
      name: 'linked',
      sets: { base: { sources: [{ $ref: 'color.tokens.json' }] } },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    });
    const color = JSON.stringify({ color: { bg: { $type: 'color', $value: { colorSpace: 'srgb', components: [0.1, 0.2, 0.3] } } } });

    await LOAD_DOCUMENT({
      files: [
        { path: 'linked.resolver.json', text: entryDocument },
        { path: 'color.tokens.json', text: color },
      ],
      entry: 'linked.resolver.json',
    });

    const [stored] = await loadRecents();
    assert.equal('files' in stored, false);
    assert.deepEqual(stored.document.sets?.base.sources, [JSON.parse(color)], 'the bundle holds the tokens the reference read');
    assert.deepEqual(stored.composition.reads, [
      { ref: 'color.tokens.json', holder: 'linked.resolver.json', location: 'color.tokens.json', overridden: false },
    ]);

    resetState();
    await LOAD_RECENT({ key: 'linked' });
    const loaded = mock
      .calls('ui.postMessage')
      .map((call) => call.args[0] as { type: string; payload: { composition?: Record<string, unknown> } })
      .filter((m) => m.type === 'DOCUMENT_LOADED')
      .at(-1);
    assert.equal(loaded?.payload.composition?.fromBundle, true);
    assert.deepEqual(loaded?.payload.composition?.reads, stored.composition.reads);
    assert.equal(getState().resolver?.name, 'linked', 'with no file at hand');
  });

  it('reports the truth when a row is no longer there', async () => {
    // Another window, or a write that shed entries to fit. Failing silently
    // against a stale row leaves the user clicking something that does
    // nothing.
    const mock = createFigmaMock().install();
    resetState();

    await LOAD_RECENT({ key: 'never-loaded' });

    const errors = mock
      .calls('ui.postMessage')
      .map((call) => call.args[0] as { type: string; payload: { message?: string } })
      .filter((m) => m.type === 'ERROR');
    assert.equal(errors.length, 1);
    assert.match(errors[0].payload.message ?? '', /no longer in your recents/);
    assert.deepEqual(postedRecents(mock), [], 'and the real list is re-posted');
  });

  it('forgets one entry and keeps the rest', async () => {
    const mock = createFigmaMock().install();
    resetState();

    await LOAD_DOCUMENT(oneFile(documentJson('keep')));
    await LOAD_DOCUMENT(oneFile(documentJson('drop')));

    await FORGET_RECENT({ key: 'drop' });

    assert.deepEqual(
      postedRecents(mock).map((r) => r.name),
      ['keep'],
    );
  });

  it('answers GET_RECENTS from a previous session', async () => {
    const mock = createFigmaMock()
      .withClientStorage(RECENTS_KEY, [entry('from-last-week')])
      .install();
    resetState();

    await GET_RECENTS();

    assert.deepEqual(
      postedRecents(mock).map((r) => r.name),
      ['from-last-week'],
    );
  });
});

describe('recents — when storage will not take it', () => {
  useFigmaMock();

  it('sheds the oldest entries until the write is accepted', async () => {
    // Figma documents no quota and `setAsync` only rejects after the fact,
    // so the limit can only be found by reaching it.
    const one = JSON.stringify([entry('a')]).length;
    createFigmaMock()
      .withClientStorageCap(Math.floor(one * 1.5))
      .install();

    const stored = await rememberRecent(entry('b'));
    await rememberRecent(entry('c'));

    assert.equal(stored.length, 1, 'only what fits is kept');
    assert.deepEqual(
      (await loadRecents()).map((r) => r.key),
      ['c'],
      'and the newest is the one kept',
    );
  });

  it('never fails a load over a recents write', async () => {
    // A recents list is a convenience. Nothing about it is worth turning a
    // successful load into a reported failure.
    const mock = createFigmaMock().withClientStorageCap(1).install();
    resetState();

    await LOAD_DOCUMENT(oneFile(documentJson('demo')));

    assert.ok(getState().resolver, 'the document still loaded');
    const errors = mock
      .calls('ui.postMessage')
      .map((call) => call.args[0] as { type: string })
      .filter((m) => m.type === 'ERROR');
    assert.deepEqual(errors, [], 'and nothing was reported as an error');
    assert.deepEqual(postedRecents(mock), [], 'the list is honestly empty');
  });

  it('reads an entry of the old shape as a resolver document, once, and writes the list back', async () => {
    // Kept before the core loaded documents: the document's text as `json`, and no composition.
    const old = {
      key: 'legacy',
      name: 'legacy',
      tokenCount: 2,
      modes: ['light', 'dark'],
      fileName: 'legacy.resolver.json',
      loadedAt: '2026-08-12T10:00:00.000Z',
      json: documentJson('legacy'),
    };
    const mock = createFigmaMock()
      .withClientStorage(RECENTS_KEY, [old, { ...old, key: 'broken', json: '{ not json' }])
      .install();
    resetState();

    const [recent, ...rest] = await loadRecents();
    assert.equal(rest.length, 0, 'an old entry that does not parse is dropped');
    assert.equal(recent.document.name, 'legacy');
    assert.deepEqual(recent.composition, { form: 'resolver', entry: 'legacy.resolver.json', reads: [] });
    const written = mock.clientStorage(RECENTS_KEY) as Array<Record<string, unknown>>;
    assert.equal(written.length, 1);
    assert.ok(!('json' in written[0]) && 'document' in written[0], 'the list is written back in the new shape');

    await LOAD_RECENT({ key: 'legacy' });
    assert.equal(getState().resolver?.name, 'legacy', 'and it loads from its bundle');
  });

  it('reads nothing rather than throwing on a damaged blob', async () => {
    createFigmaMock()
      .withClientStorage(RECENTS_KEY, [{ nonsense: true }, 'not an entry', null])
      .install();

    assert.deepEqual(await loadRecents(), []);
  });
});
