/**
 * The acceptance test for persistence: does a sync survive closing the plugin?
 *
 * Everything below the handler layer is exercised for real — plan, execute,
 * and the stamps the run leaves on what it wrote — against the mock file. Closing and reopening the plugin
 * is `resetState()` without reinstalling the mock, which is exactly what happens
 * in Figma: the sandbox is torn down, the file is not.
 *
 * Before this, the second plan re-created and rewrote every variable in the
 * document while reporting a clean run, because the only record of the first one
 * lived in memory that no longer existed.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, useFigmaMock, type FigmaMockHandle } from './support/figmaMock.js';
import type { SyncStatePayload } from '../shared/protocol.js';
import { LOAD_DOCUMENT, GET_SYNC_STATE } from '../main/handlers/loadDocument.js';
import { oneFile } from './support/oneFile.js';
import { PLAN_VARIABLE_SYNC } from '../main/handlers/planVariableSync.js';
import { EXECUTE_VARIABLE_SYNC } from '../main/handlers/executeVariableSync.js';
import { PLAN_STYLE_SYNC } from '../main/handlers/planStyleSync.js';
import { EXECUTE_STYLE_SYNC } from '../main/handlers/executeStyleSync.js';
import { EXPORT_DOCUMENT } from '../main/handlers/exportDocument.js';
import { getState, resetState } from '../main/runtimeState.js';
import type { Operation } from '../shared/operations.js';
import { stampOf } from './support/stamps.js';

const COLLECTION = 'Demo';

const TWO_THEME_DOC = JSON.stringify({
  version: '2025-11-01',
  name: COLLECTION,
  sets: {
    light: {
      sources: [
        {
          color: { bg: { $type: 'color', $value: '#ffffff' } },
          effects: {
            card: {
              $type: 'shadow',
              $value: { color: '#00000022', offsetX: '0px', offsetY: '2px', blur: '8px' },
            },
          },
        },
      ],
    },
    dark: {
      sources: [
        {
          color: { bg: { $type: 'color', $value: '#1a1a2e' } },
          effects: {
            card: {
              $type: 'shadow',
              $value: { color: '#000000aa', offsetX: '0px', offsetY: '2px', blur: '8px' },
            },
          },
        },
      ],
    },
  },
  modifiers: {
    theme: {
      contexts: { light: [{ $ref: '#/sets/light' }], dark: [{ $ref: '#/sets/dark' }] },
      default: 'light',
    },
  },
  resolutionOrder: [{ $ref: '#/modifiers/theme' }],
});

function plan(): Operation[] {
  const { lastPlan } = getState();
  assert.ok(lastPlan, 'a plan should have been stored');
  return lastPlan;
}

const kinds = (operations: Operation[], kind: Operation['kind']) => operations.filter((op) => op.kind === kind);

async function syncVariables(): Promise<void> {
  await PLAN_VARIABLE_SYNC({ collectionName: COLLECTION });
  await EXECUTE_VARIABLE_SYNC();
}

async function syncStyles(): Promise<void> {
  await PLAN_STYLE_SYNC({});
  await EXECUTE_STYLE_SYNC();
}

/** Tears down the sandbox the way closing the plugin does, leaving the file. */
function reopenPlugin(): void {
  resetState();
}

describe('sync state across sessions', () => {
  useFigmaMock();

  it('re-plans variables as unchanged after the plugin is reopened', async () => {
    createFigmaMock().install();

    await LOAD_DOCUMENT(oneFile(TWO_THEME_DOC));
    await syncVariables();
    await PLAN_VARIABLE_SYNC({ collectionName: COLLECTION });
    assert.equal(kinds(plan(), 'SET_VARIABLE_VALUE').length, 0, 'same session should be clean');

    reopenPlugin();

    await LOAD_DOCUMENT(oneFile(TWO_THEME_DOC));
    await PLAN_VARIABLE_SYNC({ collectionName: COLLECTION });

    const reopened = plan();
    assert.equal(kinds(reopened, 'SET_VARIABLE_VALUE').length, 0, 'nothing should be rewritten');
    assert.equal(kinds(reopened, 'CREATE_VARIABLE').length, 0, 'nothing should be recreated');
    assert.ok(
      reopened.some((op) => op.kind === 'SKIP' && op.path === 'Demo.color.bg'),
      'the token should be reported as unchanged',
    );
  });

  it('still writes the one mode that changed after a reopen', async () => {
    // The complement: persistence must not turn the dirty check into a
    // blanket "everything is fine".
    createFigmaMock().install();

    await LOAD_DOCUMENT(oneFile(TWO_THEME_DOC));
    await syncVariables();

    reopenPlugin();

    await LOAD_DOCUMENT(oneFile(TWO_THEME_DOC.replace('#1a1a2e', '#0b0b1f')));
    await PLAN_VARIABLE_SYNC({ collectionName: COLLECTION });

    const writes = kinds(plan(), 'SET_VARIABLE_VALUE');
    assert.equal(writes.length, 1, `expected one write, got ${writes.length}`);
    assert.ok(writes[0].kind === 'SET_VARIABLE_VALUE' && writes[0].modeName === 'dark');
  });

  it('re-plans styles as unchanged after the plugin is reopened', async () => {
    createFigmaMock().install();

    await LOAD_DOCUMENT(oneFile(TWO_THEME_DOC));
    await syncStyles();

    reopenPlugin();

    await LOAD_DOCUMENT(oneFile(TWO_THEME_DOC));
    await PLAN_STYLE_SYNC({});

    const reopened = plan();
    assert.equal(kinds(reopened, 'CREATE_STYLE').length, 0, 'no style should be recreated');
    assert.equal(kinds(reopened, 'UPDATE_STYLE').length, 0, 'no style should be rewritten');
    assert.ok(
      reopened.some((op) => op.kind === 'SKIP' && op.path === 'Demo.effects.card'),
      'the shadow token should be reported as unchanged',
    );
  });

  it('stamps an updated style with the token path, not the Figma style name', async () => {
    // On UPDATE_STYLE the write-back used to turn the *live Figma style's*
    // name back into a token path. A style a designer had renamed therefore
    // had its record filed under a path the document does not contain, so
    // the real path stayed dirty forever and a phantom entry grew beside it.
    const mock = createFigmaMock().install();

    await LOAD_DOCUMENT(oneFile(TWO_THEME_DOC));
    await syncStyles();

    const style = mock.styles('EFFECT')[0];
    assert.ok(style, 'an effect style should exist');
    style.name = 'Renamed/By/A/Designer';

    // A changed value, so the second plan is an update rather than a skip.
    await LOAD_DOCUMENT(oneFile(TWO_THEME_DOC.replace('#00000022', '#00000044')));
    await PLAN_STYLE_SYNC({});
    assert.equal(kinds(plan(), 'UPDATE_STYLE').length, 1, 'the style should be updated in place');
    await EXECUTE_STYLE_SYNC();

    assert.deepEqual(stampOf(style)?.is, { token: 'Demo.effects.card' }, 'stamped for the token, not for its Figma name');
  });

  it('exports what the stamps say for reading, and never reads it back on import', async () => {
    // A target's ids and receipts belong to one file, and one token file feeds several.
    const mock = createFigmaMock().install();
    await LOAD_DOCUMENT(oneFile(TWO_THEME_DOC));
    await syncVariables();
    await EXPORT_DOCUMENT({ includeExtensions: true });
    const exported = mock
      .calls('ui.postMessage')
      .map((call) => call.args[0] as { type: string; payload: { json: string } })
      .find((m) => m.type === 'DOCUMENT_EXPORTED')!;
    const stamp = JSON.parse(exported.payload.json).color.bg.$extensions['com.toghen.figma'].stamp;
    assert.deepEqual(stamp.is, { token: 'Demo.color.bg' });

    // Into another file: the exported stamp names nothing there, and nothing is taken from it.
    createFigmaMock().install();
    const doc = JSON.parse(TWO_THEME_DOC);
    doc.sets.light.sources[0].color.bg.$extensions = { 'com.toghen.figma': { stamp, variableId: 'VariableID:1:1' } };
    await LOAD_DOCUMENT(oneFile(JSON.stringify(doc)));
    await PLAN_VARIABLE_SYNC({ collectionName: COLLECTION });

    assert.equal(kinds(plan(), 'CREATE_VARIABLE').length, 1, 'the variable is made, as in any file that never saw it');
  });
});

/**
 * The status the pane reads, measured against a run that actually happened.
 *
 * The unit tests pin the counting rules on a hand-written record. These pin the
 * thing that matters more: that the numbers on screen agree with what the
 * plugin has really done to the file — a status computed from a record nobody
 * wrote is exactly the decoration this milestone exists to replace.
 */
describe('the sync state the pane reports', () => {
  useFigmaMock();

  /** The most recent `SYNC_STATE` the main thread posted. */
  const lastSyncState = (mock: FigmaMockHandle): SyncStatePayload => {
    const states = mock
      .calls('ui.postMessage')
      .map((call) => call.args[0] as { type: string; payload: unknown })
      .filter((message) => message.type === 'SYNC_STATE');

    const latest = states.at(-1);
    assert.ok(latest, 'no SYNC_STATE was posted');
    return latest.payload as SyncStatePayload;
  };

  it('reports nothing recorded before anything has been synced', async () => {
    const mock = createFigmaMock().install();

    await LOAD_DOCUMENT(oneFile(TWO_THEME_DOC));

    const state = lastSyncState(mock);
    assert.equal(state.hasRecord, false);
    // Two tokens: `color.bg` goes to a variable, `effects.card` to a style.
    assert.equal(state.documentTokenCount, 2);
    assert.equal(state.coveredCount, 0);
  });

  it('follows a run without the document being reloaded', async () => {
    // The whole point of posting it from the execute handler. A run that
    // changes the record and leaves the header reading the old numbers is
    // the same defect in a new place.
    const mock = createFigmaMock().install();

    await LOAD_DOCUMENT(oneFile(TWO_THEME_DOC));
    await syncVariables();

    const state = lastSyncState(mock);
    assert.equal(state.hasRecord, true);
    assert.equal(state.coveredCount, 1, 'the variable landed; the style has not been synced');
    assert.equal(state.partialCount, 0, 'both of its modes landed');

    await syncStyles();

    const afterStyles = lastSyncState(mock);
    assert.equal(afterStyles.coveredCount, 2, 'now both tokens are recorded');
    assert.equal(afterStyles.documentTokenCount, 2);
  });

  it('survives the plugin closing, which is the answer the empty state gives', async () => {
    const mock = createFigmaMock().install();

    await LOAD_DOCUMENT(oneFile(TWO_THEME_DOC));
    await syncVariables();

    reopenPlugin();
    await GET_SYNC_STATE();

    const state = lastSyncState(mock);
    assert.equal(state.hasRecord, true, 'the file still holds the stamps');
    assert.ok(state.recordedCount > 0);
    // No document loaded yet, so there is nothing to measure against —
    // and `0 of 0` would read as "nothing is synced", which is the reverse
    // of what this file holds.
    assert.equal(state.documentTokenCount, null);
    assert.equal(state.coveredCount, null);
  });
});
