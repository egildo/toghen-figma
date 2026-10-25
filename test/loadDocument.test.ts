import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, useFigmaMock } from './support/figmaMock.js';
import { LOAD_DOCUMENT, GET_DOCUMENT_STATE, GET_SYNC_STATE } from '../main/handlers/loadDocument.js';
import { oneFile } from './support/oneFile.js';
import { getState, resetState } from '../main/runtimeState.js';

/** Shape of the messages the handler posts back to the UI. */
type PostedMessage = { type: string; payload?: { code?: string; [k: string]: unknown } };

function setupFigmaMock(): PostedMessage[] {
  const messages: PostedMessage[] = [];
  const mock = createFigmaMock().install();
  // The mock records each call; reading them in order keeps `messages.at(-1)` the last thing posted.
  return new Proxy(messages, {
    get: (_target, prop) =>
      Reflect.get(
        mock.calls('ui.postMessage').map((call) => call.args[0] as PostedMessage),
        prop,
      ),
  });
}

/**
 * Finds a posted message by type.
 *
 * These assertions used to read `messages.at(-1)`, which quietly encoded "the
 * load posts exactly one thing, last". It posts two now — the document, then
 * what the file records about being synced — and every one of them broke on
 * the addition rather than on a defect.
 */
const posted = (messages: PostedMessage[], type: string): PostedMessage | undefined => messages.find((message) => message.type === type);

describe('LOAD_DOCUMENT', () => {
  useFigmaMock();
  beforeEach(() => {
    resetState();
  });

  it('says what the document would build: its collections, their sizes, and its styles', async () => {
    const messages = setupFigmaMock();
    const json = JSON.stringify({
      version: '2025-11-01',
      name: 'Acme',
      sets: {
        base: {
          $extensions: { 'com.toghen': { version: '2.1.0' } },
          sources: [
            {
              space: { md: { $type: 'dimension', $value: { value: 16, unit: 'px' } } },
              font: { body: { $type: 'fontFamily', $value: ['Inter', 'sans-serif'] } },
              type: {
                body: {
                  $type: 'typography',
                  $value: {
                    fontFamily: ['Inter'],
                    fontSize: { value: 14, unit: 'px' },
                    fontWeight: 400,
                    lineHeight: 1.4,
                    letterSpacing: { value: 0, unit: 'px' },
                  },
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
            light: [{ color: { bg: { $type: 'color', $value: { colorSpace: 'srgb', components: [1, 1, 1] } } } }],
            dark: [{ color: { bg: { $type: 'color', $value: { colorSpace: 'srgb', components: [0, 0, 0] } } } }],
          },
        },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
    });

    await LOAD_DOCUMENT(oneFile(json, 'acme.resolver.json'));

    const payload = posted(messages, 'DOCUMENT_LOADED')?.payload as Record<string, unknown>;
    assert.equal(payload.version, '2.1.0');
    assert.equal(payload.fileName, 'acme.resolver.json');
    assert.equal(payload.styleCount, 1);
    assert.deepEqual(payload.collections, [
      { name: 'Acme', modes: ['default'], variableCount: 2 },
      { name: 'theme', modifier: 'theme', modes: ['light', 'dark'], variableCount: 1 },
    ]);
  });

  it('loads a valid resolver document and updates runtime state', async () => {
    const messages = setupFigmaMock();
    const json = JSON.stringify({
      version: '2025-11-01',
      name: 'Demo',
      sets: {
        base: {
          sources: [
            {
              color: {
                primary: {
                  $type: 'color',
                  $value: '#0055cc',
                  $extensions: {
                    'com.toghen.figma': { variableId: 'v1' },
                  },
                },
              },
            },
          ],
        },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    });

    await LOAD_DOCUMENT(oneFile(json));

    const state = getState();
    assert.ok(state.resolver);
    assert.ok(state.designSystem);

    const loaded = posted(messages, 'DOCUMENT_LOADED');
    assert.ok(loaded, 'the load should be announced');
    assert.equal(loaded.payload?.loaded, true);
    // Sent so export can preselect it. A single-mode document's default is the
    // one mode it has, and it still has to be named rather than assumed.
    assert.equal(loaded.payload?.defaultMode, 'default');

    // The file's own record travels with the load: coverage is only computable
    // once there is a document to measure it against.
    assert.ok(posted(messages, 'SYNC_STATE'), 'the sync state should follow the load');
  });

  it('refuses a document whose modifier declares no default, and names the modifier', async () => {
    // W3C allows a modifier with no `default` — the caller is then required to
    // choose a context. The plugin's one design system is the sum of the
    // contexts, which needs a default for each modifier; the fallback was the
    // product of every combination, which a large document cannot finish. So the
    // load is refused, with the modifier named (R13), and nothing is loaded.
    const messages = setupFigmaMock();
    const json = JSON.stringify({
      version: '2025-11-01',
      name: 'Demo',
      sets: {
        light: { sources: [{ color: { bg: { $type: 'color', $value: '#ffffff' } } }] },
        dark: { sources: [{ color: { bg: { $type: 'color', $value: '#1a1a2e' } } }] },
      },
      modifiers: {
        theme: { contexts: { light: [{ $ref: '#/sets/light' }], dark: [{ $ref: '#/sets/dark' }] } },
      },
      resolutionOrder: [{ $ref: '#/modifiers/theme' }],
    });

    await LOAD_DOCUMENT(oneFile(json));

    assert.equal(posted(messages, 'DOCUMENT_LOADED'), undefined);
    const error = posted(messages, 'ERROR');
    assert.equal(error?.payload?.code, 'INVALID_DOCUMENT');
    assert.match(String(error?.payload?.message), /Modifier "theme" declares no default context/);
    assert.match(String(error?.payload?.message), /sum of the contexts needs a default/);
    assert.equal(getState().resolver, null);
  });

  it('names every modifier that declares no default', async () => {
    const messages = setupFigmaMock();
    const context = { color: { bg: { $type: 'color', $value: '#ffffff' } } };
    const json = JSON.stringify({
      version: '2025-11-01',
      name: 'Demo',
      sets: { base: { sources: [context] } },
      modifiers: {
        theme: { contexts: { light: [{ $ref: '#/sets/base' }], dark: [{ $ref: '#/sets/base' }] } },
        density: { contexts: { cosy: [{ $ref: '#/sets/base' }], compact: [{ $ref: '#/sets/base' }] } },
        tone: { default: 'calm', contexts: { calm: [{ $ref: '#/sets/base' }], loud: [{ $ref: '#/sets/base' }] } },
      },
      resolutionOrder: [{ $ref: '#/modifiers/theme' }, { $ref: '#/modifiers/density' }, { $ref: '#/modifiers/tone' }],
    });

    await LOAD_DOCUMENT(oneFile(json));

    const message = String(posted(messages, 'ERROR')?.payload?.message);
    assert.match(message, /"theme"/);
    assert.match(message, /"density"/);
    assert.doesNotMatch(message, /"tone"/);
  });

  it('answers GET_DOCUMENT_STATE with "nothing loaded" rather than a placeholder', async () => {
    // The reply carried a name and a token count and no way to say there was no
    // document, so the UI read any reply as proof of one — and the plugin opened
    // straight into the loaded pane, titled "Untitled", with live buttons.
    const messages = setupFigmaMock();

    await GET_DOCUMENT_STATE();

    const state = posted(messages, 'DOCUMENT_STATE');
    assert.ok(state);
    assert.equal(state.payload?.loaded, false);
  });

  it('answers GET_SYNC_STATE with no document loaded', async () => {
    // The plugin opens into a *file*, not into a document. "You synced this
    // file before" has to be answerable before anything is picked.
    const messages = setupFigmaMock();

    await GET_SYNC_STATE();

    const sync = posted(messages, 'SYNC_STATE');
    assert.ok(sync);
    assert.equal(sync.payload?.documentTokenCount, null, 'nothing to measure against yet');
  });

  it('posts INVALID_DOCUMENT when json is invalid', async () => {
    const messages = setupFigmaMock();

    await LOAD_DOCUMENT(oneFile('{ invalid'));

    assert.equal(messages.at(-1)?.type, 'ERROR');
    assert.equal(messages.at(-1)?.payload?.code, 'INVALID_DOCUMENT');
    // The core's words, naming the file.
    assert.match(String(messages.at(-1)?.payload?.message), /"test\.resolver\.json" is not JSON/);
  });

  it('loads a token file, the plugin’s own export included, rather than calling it the wrong format', async () => {
    // A token file used to be refused with a message saying so (R13, smell #29). The core loads one now, so that
    // message became false: the file is a collection of its own, named as the screen names it.
    const messages = setupFigmaMock();
    const exported = JSON.stringify({
      $extensions: { 'com.toghen': { version: '1.0.0' } },
      demo: { color: { bg: { $type: 'color', $value: { colorSpace: 'srgb', components: [0.1, 0.1, 0.18] } } } },
    });

    await LOAD_DOCUMENT({ ...oneFile(exported, 'demo.dark.json'), name: 'demo' });

    assert.equal(posted(messages, 'ERROR'), undefined);
    const payload = posted(messages, 'DOCUMENT_LOADED')?.payload as Record<string, any>;
    assert.equal(payload.name, 'demo');
    assert.equal(payload.composition.form, 'tokens');
  });

  it('still names the real fault for a resolver document that is simply wrong', async () => {
    // The guard must not swallow the honest error for a document that really is
    // a resolver document with something missing.
    const messages = setupFigmaMock();
    const json = JSON.stringify({
      name: 'Demo',
      sets: { base: { sources: [{ a: { $type: 'color', $value: '#000000' } }] } },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    });

    await LOAD_DOCUMENT(oneFile(json));

    assert.match(String(posted(messages, 'ERROR')?.payload?.message), /version/);
  });

  it('posts INVALID_DOCUMENT when resolver validation fails', async () => {
    const messages = setupFigmaMock();
    const json = JSON.stringify({ version: 'wrong', resolutionOrder: [] });

    await LOAD_DOCUMENT(oneFile(json));

    assert.equal(messages.at(-1)?.type, 'ERROR');
    assert.equal(messages.at(-1)?.payload?.code, 'INVALID_DOCUMENT');
  });
});

describe('LOAD_DOCUMENT: through the core', () => {
  useFigmaMock();
  beforeEach(() => {
    resetState();
  });

  // The W3C structured shapes: a colour's components, a dimension's value and unit, a font family's list.
  const colour = (r: number, g: number, b: number) => ({ $type: 'color', $value: { colorSpace: 'srgb', components: [r, g, b] } });
  const base = JSON.stringify({
    color: { brand: colour(1, 0, 0), bg: colour(1, 1, 1) },
    space: { md: { $type: 'dimension', $value: { value: 16, unit: 'px' } } },
    font: { body: { $type: 'fontFamily', $value: ['Inter', 'sans-serif'] } },
  });
  const brand = JSON.stringify({ color: { brand: colour(0, 0, 1) } });
  const system = (ref: string) =>
    JSON.stringify({
      version: '2025-11-01',
      name: 'System',
      sets: { base: { sources: [{ $ref: ref }] } },
      resolutionOrder: [{ $ref: '#/sets/base' }],
    });

  type Graph = { tokens: Array<{ path: string; valueByMode: Record<string, string | null> }> };
  /** A token's value in the default mode, as the Tokens pane writes it: a string, never an object. */
  const value = (messages: PostedMessage[], path: string) =>
    (posted(messages, 'TOKEN_GRAPH')?.payload as unknown as Graph).tokens.find((token) => token.path === path)?.valueByMode.default;
  const loaded = (messages: PostedMessage[]) => posted(messages, 'DOCUMENT_LOADED')?.payload as Record<string, any>;

  it('loads a resolver document whose $refs name picked files', async () => {
    const messages = setupFigmaMock();

    await LOAD_DOCUMENT({
      files: [
        { path: 'tokens/system.resolver.json', text: system('base.tokens.json') },
        { path: 'tokens/base.tokens.json', text: base },
      ],
      entry: 'tokens/system.resolver.json',
      name: 'ignored for a resolver document',
    });

    assert.equal(posted(messages, 'ERROR'), undefined);
    assert.equal(value(messages, 'System.color.brand'), '#ff0000');
    assert.equal(value(messages, 'System.space.md'), '16px');
    assert.equal(value(messages, 'System.font.body'), 'Inter, sans-serif');
    assert.deepEqual(loaded(messages).composition, {
      form: 'resolver',
      entry: 'tokens/system.resolver.json',
      reads: [{ ref: 'base.tokens.json', holder: 'tokens/system.resolver.json', location: 'tokens/base.tokens.json', overridden: false }],
    });
    assert.equal(loaded(messages).fileName, 'system.resolver.json');
    assert.equal(loaded(messages).report, undefined, 'nothing collided, so there is nothing to report');
  });

  it('loads one token file, its collection named by the name sent', async () => {
    const messages = setupFigmaMock();

    await LOAD_DOCUMENT({ files: [{ path: 'base.tokens.json', text: base }], entry: 'base.tokens.json', name: 'base' });

    assert.equal(loaded(messages).name, 'base');
    assert.equal(loaded(messages).composition.form, 'tokens');
    assert.equal(value(messages, 'base.space.md'), '16px');
    assert.equal(value(messages, 'base.font.body'), 'Inter, sans-serif');
  });

  it('merges token files in order, the later winning, and reports the collision as one warning row', async () => {
    const messages = setupFigmaMock();
    const entry = ['tokens/base.tokens.json', 'tokens/brand.tokens.json'];

    // No name: the files share a folder, which names the collection.
    await LOAD_DOCUMENT({
      files: [
        { path: entry[0], text: base },
        { path: entry[1], text: brand },
      ],
      entry,
    });

    assert.equal(loaded(messages).name, 'tokens');
    assert.equal(value(messages, 'tokens.color.brand'), '#0000ff', 'the later file wins');
    assert.equal(value(messages, 'tokens.color.bg'), '#ffffff');
    assert.deepEqual(loaded(messages).composition.entry, entry);
    assert.equal(loaded(messages).fileName, 'base.tokens.json, brand.tokens.json');
    const report = loaded(messages).report;
    assert.equal(report.planType, 'load');
    assert.equal(report.operations.length, 1, 'one row per collision (R14)');
    assert.equal(report.operations[0].kind, 'WARNING');
    assert.equal(report.operations[0].path, 'color.brand');
    assert.match(report.operations[0].message, /"tokens\/base\.tokens\.json", "tokens\/brand\.tokens\.json" in set "base"; the last wins/);
  });

  it('reports a collision whose values are equal as written as a quiet note', async () => {
    const messages = setupFigmaMock();
    const again = JSON.stringify({ color: { bg: { $value: { components: [1, 1, 1], colorSpace: 'srgb' }, $type: 'color' } } });

    await LOAD_DOCUMENT({
      files: [
        { path: 'a.tokens.json', text: base },
        { path: 'b.tokens.json', text: again },
      ],
      entry: ['a.tokens.json', 'b.tokens.json'],
      name: 'pair',
    });

    const [row] = loaded(messages).report.operations;
    assert.equal(row.kind, 'NOTE');
    assert.match(row.message, /^color\.bg is given the same value by "a\.tokens\.json", "b\.tokens\.json"/);
  });

  it('reads the file an overrides map names instead, says so in reads, and reports a key that matched nothing', async () => {
    const messages = setupFigmaMock();
    const overrides = { 'base.tokens.json': 'brand.tokens.json', './unused.tokens.json': 'base.tokens.json' };

    await LOAD_DOCUMENT({
      files: [
        { path: 'system.resolver.json', text: system('base.tokens.json') },
        { path: 'base.tokens.json', text: base },
        { path: 'brand.tokens.json', text: brand },
      ],
      entry: 'system.resolver.json',
      overrides,
    });

    assert.equal(value(messages, 'System.color.brand'), '#0000ff', 'the swapped file was read');
    assert.equal(value(messages, 'System.space.md'), undefined, 'and the original was not');
    const { composition, report } = loaded(messages);
    assert.deepEqual(composition.reads, [
      { ref: 'base.tokens.json', holder: 'system.resolver.json', location: 'brand.tokens.json', overridden: true },
    ]);
    assert.deepEqual(composition.overrides.map, overrides);
    assert.deepEqual(composition.overrides.unused, ['./unused.tokens.json']);
    assert.match(composition.overrides.hash, /^[0-9a-f]{16}$/);
    assert.equal(report.operations.length, 1);
    assert.equal(report.operations[0].kind, 'WARNING');
    assert.match(report.operations[0].message, /"\.\/unused\.tokens\.json" matched no reference/);
  });

  it('names a file that is neither form in the core’s words', async () => {
    const messages = setupFigmaMock();

    await LOAD_DOCUMENT({ ...oneFile('[1, 2]', 'list.json'), name: 'list' });

    const error = posted(messages, 'ERROR');
    assert.equal(error?.payload?.code, 'INVALID_DOCUMENT');
    assert.match(String(error?.payload?.message), /points to no group of tokens in "list\.json"/);
    assert.equal(getState().resolver, null);
  });

  it('names a reference to a file that was not picked, and the document that holds it', async () => {
    const messages = setupFigmaMock();

    await LOAD_DOCUMENT(oneFile(system('missing.tokens.json'), 'system.resolver.json'));

    const message = String(posted(messages, 'ERROR')?.payload?.message);
    assert.match(message, /\$ref "missing\.tokens\.json" in "system\.resolver\.json"/);
    assert.match(message, /not among the files picked/);
  });

  it('answers GET_DOCUMENT_STATE with the composition of the load', async () => {
    const messages = setupFigmaMock();
    await LOAD_DOCUMENT({ files: [{ path: 'base.tokens.json', text: base }], entry: 'base.tokens.json', name: 'base' });

    await GET_DOCUMENT_STATE();

    const state = posted(messages, 'DOCUMENT_STATE')?.payload as Record<string, any>;
    assert.equal(state.loaded, true);
    assert.equal(state.composition.form, 'tokens');
    assert.equal(state.report, undefined, 'a load’s rows are its answer’s, not the state’s');
  });
});
