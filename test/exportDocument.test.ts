import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, useFigmaMock } from './support/figmaMock.js';
import { LOAD_DOCUMENT } from '../main/handlers/loadDocument.js';
import { oneFile } from './support/oneFile.js';
import { EXPORT_DOCUMENT } from '../main/handlers/exportDocument.js';
import { resetState } from '../main/runtimeState.js';

/** A file with nothing in it, and what the plugin posts to the screen, in order. */
function setupFigmaMock(): Array<any> {
  const mock = createFigmaMock().install();
  return new Proxy([], {
    get: (_target, prop) =>
      Reflect.get(
        mock.calls('ui.postMessage').map((call) => call.args[0]),
        prop,
      ),
  });
}

describe('EXPORT_DOCUMENT', () => {
  useFigmaMock();
  beforeEach(() => {
    resetState();
  });

  it('posts NO_RESOLVER when exporting before loading a document', async () => {
    const messages = setupFigmaMock();

    await EXPORT_DOCUMENT({ includeExtensions: true });

    assert.equal(messages.at(-1)?.type, 'ERROR');
    assert.equal(messages.at(-1)?.payload.code, 'NO_RESOLVER');
  });

  it('exports loaded document with filename and json payload', async () => {
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
    await EXPORT_DOCUMENT({ includeExtensions: true });

    const last = messages.at(-1);
    assert.equal(last?.type, 'DOCUMENT_EXPORTED');
    assert.equal(last?.payload.filename, 'Demo.json');

    const parsed = JSON.parse(last?.payload.json ?? '{}');
    assert.equal(parsed.color.primary.$value.hex, '#0055cc');
    assert.equal(parsed.color.primary.$extensions['com.toghen.figma'].variableId, 'v1');
  });

  it('names the exported mode when the document has more than one', async () => {
    // A DTCG token file holds one mode, so a multi-mode document cannot round
    // trip through here. It used to leave silently: the export was whichever
    // `DesignSystem` happened to be in state, named `<document>.json` as though
    // it were the whole thing.
    const mock = createFigmaMock().install();

    await LOAD_DOCUMENT(oneFile(TWO_MODE_DOC));
    await EXPORT_DOCUMENT({ includeExtensions: false });

    const last = lastMessage(mock.calls('ui.postMessage'));
    assert.equal(last?.type, 'DOCUMENT_EXPORTED');
    assert.equal(last?.payload.filename, 'Demo.light.json');

    const parsed = JSON.parse(last?.payload.json ?? '{}');
    assert.equal(parsed.color.bg.$value.hex, '#ffffff', 'the default mode should be exported');

    const notified = mock.calls('notify');
    assert.equal(notified.length, 1, 'the omitted mode should be named');
    assert.match(String(notified[0].args[0]), /dark/);
  });

  it('refuses a mode the document does not declare', async () => {
    const mock = createFigmaMock().install();

    await LOAD_DOCUMENT(oneFile(TWO_MODE_DOC));
    await EXPORT_DOCUMENT({ includeExtensions: false, contexts: { theme: 'sepia' } });

    const last = lastMessage(mock.calls('ui.postMessage'));
    assert.equal(last?.type, 'ERROR');
    assert.match(String(last?.payload.message), /not one of the contexts of "theme"/);
  });

  it('exports the mode it is asked for', async () => {
    const mock = createFigmaMock().install();

    await LOAD_DOCUMENT(oneFile(TWO_MODE_DOC));
    await EXPORT_DOCUMENT({ includeExtensions: false, contexts: { theme: 'dark' } });

    const last = lastMessage(mock.calls('ui.postMessage'));
    assert.equal(last?.payload.filename, 'Demo.dark.json');
    assert.equal(JSON.parse(last?.payload.json ?? '{}').color.bg.$value.hex, '#1a1a2e');
  });

  it('carries the version the system declares for itself', async () => {
    // Without this the provenance stopped at the resolver document: the token
    // file named the mode in its filename and nothing about the system.
    //
    // §6.3.2 of the token format: "Groups MAY include an optional `$extensions`
    // property where tools MAY add proprietary, user-, team- or vendor-specific
    // data." A token file's root is a group, so a fact about the whole document
    // belongs there.
    const mock = createFigmaMock().install();

    await LOAD_DOCUMENT(oneFile(VERSIONED_DOC));
    await EXPORT_DOCUMENT({ includeExtensions: true });

    const exported = JSON.parse(lastMessage(mock.calls('ui.postMessage'))?.payload.json ?? '{}');
    assert.deepEqual(exported.$extensions, { 'com.toghen': { version: '1.4.0' } });
    // And it is the system's own version, never the format version the spec
    // fixes at one string for every conforming document.
    assert.notEqual(exported.$extensions['com.toghen'].version, '2025-11-01');
  });

  it('writes no version when the system declares none', async () => {
    const mock = createFigmaMock().install();

    await LOAD_DOCUMENT(oneFile(TWO_MODE_DOC));
    await EXPORT_DOCUMENT({ includeExtensions: true });

    const exported = JSON.parse(lastMessage(mock.calls('ui.postMessage'))?.payload.json ?? '{}');
    assert.equal('$extensions' in exported, false, 'nothing to say, so nothing said');
  });

  it('respects the switch that says not to include extensions', async () => {
    // The control reads "Include $extensions". Writing vendor data into a file
    // where the user asked for none would contradict it.
    const mock = createFigmaMock().install();

    await LOAD_DOCUMENT(oneFile(VERSIONED_DOC));
    await EXPORT_DOCUMENT({ includeExtensions: false });

    const exported = JSON.parse(lastMessage(mock.calls('ui.postMessage'))?.payload.json ?? '{}');
    assert.equal('$extensions' in exported, false);
    assert.ok(exported.color, 'the tokens are still there');
  });
});

/** A system that versions itself, on a set — the only place §4.3 allows it. */
const VERSIONED_DOC = JSON.stringify({
  version: '2025-11-01',
  name: 'Demo',
  sets: {
    base: {
      $extensions: { 'com.toghen': { version: '1.4.0' } },
      sources: [{ color: { bg: { $type: 'color', $value: '#ffffff' } } }],
    },
  },
  resolutionOrder: [{ $ref: '#/sets/base' }],
});

const TWO_MODE_DOC = JSON.stringify({
  version: '2025-11-01',
  name: 'Demo',
  sets: {
    light: { sources: [{ color: { bg: { $type: 'color', $value: '#ffffff' } } }] },
    dark: { sources: [{ color: { bg: { $type: 'color', $value: '#1a1a2e' } } }] },
  },
  modifiers: {
    theme: {
      contexts: { light: [{ $ref: '#/sets/light' }], dark: [{ $ref: '#/sets/dark' }] },
      default: 'light',
    },
  },
  resolutionOrder: [{ $ref: '#/modifiers/theme' }],
});

function lastMessage(calls: ReadonlyArray<{ args: readonly unknown[] }>): any {
  return calls.length > 0 ? calls[calls.length - 1].args[0] : undefined;
}
