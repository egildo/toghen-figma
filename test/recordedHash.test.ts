/**
 * A receipt belongs to the variable it is on.
 *
 * The root record kept one hash per mode name for a token path, and used to count it for whatever variable the path
 * pointed at later. A token that moved to a collection of its own kept the hashes of the variable it left, so a mode
 * the new collection gained read as already written, and Figma filled it with its default. A stamp is kept on the
 * variable itself, so its receipt cannot be carried onto another one. Run end to end through the handlers against
 * the mock file, with a synthetic document in the W3C structured shapes.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LOAD_DOCUMENT } from '../main/handlers/loadDocument.js';
import { oneFile } from './support/oneFile.js';
import { PLAN_VARIABLE_SYNC } from '../main/handlers/planVariableSync.js';
import { EXECUTE_VARIABLE_SYNC } from '../main/handlers/executeVariableSync.js';
import { getState, resetState } from '../main/runtimeState.js';
import { hashOf } from '../main/components/stamp.js';
import type { Operation } from '../shared/operations.js';
import { createFigmaMock, float32, useFigmaMock, type FigmaMockHandle } from './support/figmaMock.js';
import { stampAs, stampAsHeld, stampOf } from './support/stamps.js';

const PATH = 'Demo.color.primary';
const LIGHT = { r: 0, g: 0.4, b: 0.8, a: 1 };
const DARK = { r: 0.1, g: 0.1, b: 0.3, a: 1 };
const RED = { r: 1, g: 0, b: 0, a: 1 };
const srgb = (c: { r: number; g: number; b: number }) => ({ colorSpace: 'srgb', components: [c.r, c.g, c.b] });

const DOCUMENT = JSON.stringify({
  version: '2025-11-01',
  name: 'Demo',
  modifiers: {
    theme: {
      default: 'light',
      contexts: {
        light: [{ color: { primary: { $type: 'color', $value: srgb(LIGHT) } } }],
        dark: [{ color: { primary: { $type: 'color', $value: srgb(DARK) } } }],
      },
    },
  },
  resolutionOrder: [{ $ref: '#/modifiers/theme' }],
});

const plan = () => getState().lastPlan as Operation[];
const writes = () => plan().filter((op): op is Extract<Operation, { kind: 'SET_VARIABLE_VALUE' }> => op.kind === 'SET_VARIABLE_VALUE');
const writtenModes = () =>
  writes()
    .map((op) => op.modeName)
    .sort();
const skips = () => plan().filter((op): op is Extract<Operation, { kind: 'SKIP' }> => op.kind === 'SKIP' && op.path === PATH);
const modeId = (mock: FigmaMockHandle, collection: string, mode: string) =>
  mock.collection(collection)!.modes.find((m) => m.name === mode)!.modeId;
/** The modes of `theme` a variable's stamp holds a receipt for. */
const receiptModes = (mock: FigmaMockHandle) => {
  const receipt = stampOf(mock.variable('theme', 'color/primary')!)?.receipt ?? {};
  return mock
    .collection('theme')!
    .modes.filter((mode) => receipt[mode.modeId] !== undefined)
    .map((mode) => mode.name)
    .sort();
};

/** A file with `color/primary` in a `theme` collection holding the given modes, valued where `values` says so. */
function themeFile(modes: string[], values: Record<string, RGBA>) {
  return createFigmaMock()
    .withCollection('Demo', ['default'])
    .withCollection('theme', modes)
    .withVariable('theme', 'color/primary', 'COLOR', values)
    .install();
}

const load = () => LOAD_DOCUMENT(oneFile(DOCUMENT));

describe('a receipt belongs to the variable it is on', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  it('writes a mode the collection gains, though the token’s old variable has a receipt for it', async () => {
    // The reported case: the token had a variable elsewhere, stamped with receipts for both modes; the variable in
    // the new collection has only `light`, and gains `dark`.
    const mock = createFigmaMock()
      .withCollection('Demo', ['default'])
      .withCollection('old', ['light', 'dark'])
      .withVariable('old', 'color/primary', 'COLOR', { light: LIGHT, dark: DARK })
      .withCollection('theme', ['light'])
      .withVariable('theme', 'color/primary', 'COLOR', { light: LIGHT })
      .install();
    const old = mock.variable('old', 'color/primary')!;
    stampAsHeld(old, PATH);
    const before = stampOf(old);
    await load();

    await PLAN_VARIABLE_SYNC({});

    assert.deepEqual(writtenModes(), ['dark', 'light'], 'written whole, as a first sync is');
    assert.deepEqual(skips(), [], 'not skipped as unchanged or drifted');
    await EXECUTE_VARIABLE_SYNC();
    assert.deepEqual(
      mock.valueFor('theme', 'color/primary', 'dark'),
      float32(DARK),
      "and Figma holds the document's value, not its default",
    );
    assert.deepEqual(receiptModes(mock), ['dark', 'light'], 'the new variable is stamped for what was written to it');
    assert.deepEqual(stampOf(old), before, 'and the old one keeps its own: a receipt is never carried onto another variable');

    await PLAN_VARIABLE_SYNC({});
    assert.deepEqual(writtenModes(), []);
    assert.equal(skips()[0]?.reason, 'unchanged');
  });

  it('writes a mode Figma holds no value for, though the stamp has a receipt for it', async () => {
    const mock = themeFile(['light', 'dark'], { light: LIGHT });
    stampAs(mock.variable('theme', 'color/primary')!, PATH, {
      [modeId(mock, 'theme', 'light')]: LIGHT,
      [modeId(mock, 'theme', 'dark')]: DARK,
    });
    await load();

    await PLAN_VARIABLE_SYNC({});

    assert.deepEqual(writtenModes(), ['dark'], 'only the mode with nothing in it');
  });

  it('writes every mode of a variable adopted by name, whatever its stamp says', async () => {
    const mock = themeFile(['light', 'dark'], { light: LIGHT, dark: DARK });
    // The values agree and its receipt matches them, but the stamp is another token's.
    const variable = mock.variable('theme', 'color/primary')!;
    stampAs(variable, 'Demo.color.other', { ...variable.valuesByMode, codeSyntax: 'var(--color-other)' });
    await load();

    await PLAN_VARIABLE_SYNC({});
    assert.deepEqual(writtenModes(), ['dark', 'light']);
    await EXECUTE_VARIABLE_SYNC();

    const stamp = stampOf(mock.variable('theme', 'color/primary')!)!;
    assert.deepEqual(stamp.is, { token: PATH });
    assert.equal(stamp.receipt.codeSyntax, undefined, 'nothing of the other token’s receipt is kept');
  });

  it('still skips the stamped variable when it holds what was written', async () => {
    const mock = themeFile(['light', 'dark'], { light: LIGHT, dark: DARK });
    stampAsHeld(mock.variable('theme', 'color/primary')!, PATH);
    await load();

    await PLAN_VARIABLE_SYNC({});

    assert.deepEqual(writtenModes(), []);
    assert.equal(skips()[0]?.reason, 'unchanged');
  });

  it('adds to the receipt of the same variable, so a run that stopped halfway resumes', async () => {
    const mock = themeFile(['light', 'dark'], { light: LIGHT });
    stampAs(mock.variable('theme', 'color/primary')!, PATH, { [modeId(mock, 'theme', 'light')]: LIGHT });
    await load();

    await PLAN_VARIABLE_SYNC({});
    assert.deepEqual(writtenModes(), ['dark']);
    await EXECUTE_VARIABLE_SYNC();

    const receipt = stampOf(mock.variable('theme', 'color/primary')!)!.receipt;
    assert.equal(receipt[modeId(mock, 'theme', 'light')], hashOf(LIGHT), 'light kept from before');
    assert.equal(receipt[modeId(mock, 'theme', 'dark')], hashOf(float32(DARK)), 'dark added, from what Figma reports');
    assert.deepEqual(mock.valueFor('theme', 'color/primary', 'dark'), float32(DARK));
  });
});

describe('--overwrite-drift', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  /** A file synced once from the document, then edited by hand in `dark`. */
  async function drifted() {
    const mock = createFigmaMock().install();
    await load();
    await PLAN_VARIABLE_SYNC({});
    await EXECUTE_VARIABLE_SYNC();
    mock.variable('theme', 'color/primary')!.valuesByMode[modeId(mock, 'theme', 'dark')] = RED;
    return mock;
  }

  it("leaves a mode edited in Figma alone, and says how to take the document's side", async () => {
    const mock = await drifted();

    await PLAN_VARIABLE_SYNC({});

    assert.deepEqual(writtenModes(), []);
    const skip = skips()[0];
    assert.equal(skip.reason, 'drifted');
    assert.match(skip.message!, /\(dark\)/);
    assert.match(skip.message!, /pass --overwrite-drift to write the document's value\.$/);
    assert.deepEqual(mock.valueFor('theme', 'color/primary', 'dark'), RED);
  });

  it("writes the document's value over it, only in the mode that moved, and stamps it", async () => {
    const mock = await drifted();

    await PLAN_VARIABLE_SYNC({ overwriteDrift: true });

    assert.deepEqual(writtenModes(), ['dark']);
    assert.deepEqual(skips(), [], 'no drifted skip, and no warning about it');
    assert.ok(!plan().some((op) => op.kind === 'WARNING'));
    await EXECUTE_VARIABLE_SYNC();
    assert.deepEqual(mock.valueFor('theme', 'color/primary', 'dark'), float32(DARK));

    await PLAN_VARIABLE_SYNC({});
    assert.deepEqual(writtenModes(), [], 'clean without the flag afterwards');
    assert.equal(skips()[0]?.reason, 'unchanged');
  });
});

describe('a renamed variable', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  it('keeps its token: found by its stamp, renamed back, and nothing written again', async () => {
    const mock = createFigmaMock().install();
    await load();
    await PLAN_VARIABLE_SYNC({});
    await EXECUTE_VARIABLE_SYNC();
    const variable = mock.variable('theme', 'color/primary')!;
    variable.name = 'brand/primary';

    await PLAN_VARIABLE_SYNC({});

    assert.deepEqual(writtenModes(), [], 'its values are Toghen’s as they were');
    assert.ok(plan().some((op) => op.kind === 'RENAME_VARIABLE' && op.variableId === variable.id && op.name === 'color/primary'));
    assert.ok(!plan().some((op) => op.kind === 'CREATE_VARIABLE'), 'and no second variable is made');
  });
});
