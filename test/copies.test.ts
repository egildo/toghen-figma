/**
 * A copy carries the stamp: variables and styles.
 *
 * A person's duplicate of an object Toghen wrote takes its stamp along, id and all. The stamp records the id of the
 * object it was written on, so the copy is told from the original: the copy is left alone and listed, the original
 * kept up. Where only an object whose id does not match is left, it is the original moved, adopted, and stamped again
 * with its own id. A stamp from before the id was recorded is read as its object's own. Run end to end through the
 * handlers against the mock file, with a synthetic document in the W3C structured shapes.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LOAD_DOCUMENT } from '../main/handlers/loadDocument.js';
import { oneFile } from './support/oneFile.js';
import { PLAN_VARIABLE_SYNC } from '../main/handlers/planVariableSync.js';
import { EXECUTE_VARIABLE_SYNC } from '../main/handlers/executeVariableSync.js';
import { PLAN_STYLE_SYNC } from '../main/handlers/planStyleSync.js';
import { EXECUTE_STYLE_SYNC } from '../main/handlers/executeStyleSync.js';
import { EXPORT_DOCUMENT } from '../main/handlers/exportDocument.js';
import { getState, resetState } from '../main/runtimeState.js';
import { buildSyncStatePayload } from '../main/utils/syncState.js';
import { VariableSyncEngine } from '../main/engines/variableSyncEngine.js';
import { StyleSyncEngine } from '../main/engines/styleSyncEngine.js';
import type { Operation } from '../shared/operations.js';
import { createFigmaMock, useFigmaMock, type FigmaMockHandle, type MockStyle, type MockVariable } from './support/figmaMock.js';
import { copyStamp, recordedId, stampIdOf } from './support/stamps.js';

const srgb = (...components: number[]) => ({ colorSpace: 'srgb', components });
const LABEL = 'Demo.color.label';
const HEADING = 'Demo.text.heading';

/** A label colour, a gap, and a heading in the structured shapes: a colour's components, a dimension's value and unit, a font stack. */
function document(label = 0.2, headingSize = 16, where: 'base' | 'theme' = 'base'): string {
  const labelToken = { label: { $type: 'color', $value: srgb(label, label, label) } };
  return JSON.stringify({
    version: '2025-11-01',
    name: 'Demo',
    sets: {
      base: {
        sources: [
          {
            color: where === 'base' ? labelToken : {},
            space: { gap: { $type: 'dimension', $value: { value: 8, unit: 'px' } } },
            text: {
              heading: {
                $type: 'typography',
                $value: {
                  fontFamily: ['Inter', 'sans-serif'],
                  fontSize: { value: headingSize, unit: 'px' },
                  fontWeight: 400,
                  lineHeight: 1.5,
                  fontStyle: 'Regular',
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
        contexts: { light: [where === 'theme' ? { color: labelToken } : {}], dark: [where === 'theme' ? { color: labelToken } : {}] },
      },
    },
    resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
  });
}

const plan = (): Operation[] => getState().lastPlan as Operation[];
async function syncVariables(json: string, allowBreaking = false): Promise<Operation[]> {
  await LOAD_DOCUMENT(oneFile(json));
  await PLAN_VARIABLE_SYNC({ allowBreaking });
  const operations = plan();
  await EXECUTE_VARIABLE_SYNC();
  return operations;
}
async function syncStyles(json: string): Promise<Operation[]> {
  await LOAD_DOCUMENT(oneFile(json));
  await PLAN_STYLE_SYNC({});
  const operations = plan();
  await EXECUTE_STYLE_SYNC();
  return operations;
}
const naming = (operations: Operation[], id: string) => operations.filter((op) => Object.values(op).includes(id));
const copyRows = (operations: Operation[]) =>
  operations.filter((op): op is Extract<Operation, { kind: 'SKIP' }> => op.kind === 'SKIP' && /is a copy of Toghen's/.test(op.reason));
const stamps = (operations: Operation[]) => operations.filter((op) => op.kind === 'STAMP');
const rawStamp = (object: MockVariable | MockStyle) => object.getSharedPluginData('toghen', 'stamp');

/** A person's duplicate of a variable: the same values, in the same collection, under the editor's name for it. */
async function duplicate(original: MockVariable, name = `${original.name} copy`): Promise<MockVariable> {
  const collection = await figma.variables.getVariableCollectionByIdAsync(original.variableCollectionId);
  const copy = figma.variables.createVariable(name, collection!, original.resolvedType);
  for (const [modeId, value] of Object.entries(original.valuesByMode)) copy.setValueForMode(modeId, value);
  copyStamp(original, copy as unknown as MockVariable);
  return copy as unknown as MockVariable;
}

describe('a copy of a variable Toghen wrote', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  it('is left alone and listed, and the original is still written', async () => {
    const mock = createFigmaMock().install();
    await syncVariables(document());
    const original = mock.variable('Demo', 'color/label')!;
    const counted = (await buildSyncStatePayload(getState().resolver)).recordedCount;
    const copy = await duplicate(original);
    const held = { values: JSON.stringify(copy.valuesByMode), stamp: rawStamp(copy) };

    const operations = await syncVariables(document(0.6));

    assert.deepEqual(
      copyRows(operations).map((op) => [op.path, op.reason, op.reported]),
      [[LABEL, `"color/label copy" (${copy.id}) is a copy of Toghen's "color/label", left alone`, true]],
    );
    assert.deepEqual(
      naming(operations, copy.id).map((op) => op.kind),
      [],
      'no step touches the copy',
    );
    assert.ok(
      operations.some((op) => op.kind === 'SET_VARIABLE_VALUE' && op.variableId === original.id),
      'the original is written',
    );
    assert.equal(mock.valueFor('Demo', 'color/label', 'default') !== undefined, true);
    assert.deepEqual({ values: JSON.stringify(copy.valuesByMode), stamp: rawStamp(copy) }, held, 'the copy holds what it held');
    assert.equal((await buildSyncStatePayload(getState().resolver)).recordedCount, counted, "and is not counted as Toghen's");

    await EXPORT_DOCUMENT({ includeExtensions: true });
    const exported = mock
      .calls('ui.postMessage')
      .map((call) => call.args[0] as { type: string; payload: { json: string } })
      .filter((message) => message.type === 'DOCUMENT_EXPORTED')
      .pop()!;
    const stamp = JSON.parse(exported.payload.json).color.label.$extensions['com.toghen.figma'].stamp;
    assert.equal(stamp.id, undefined, 'the id stays in the Figma file, out of the token file');
  });

  it('is never removed as a variable its token left behind', async () => {
    const mock = createFigmaMock().install();
    await syncVariables(document());
    const original = mock.variable('Demo', 'color/label')!;
    const copy = await duplicate(original);

    // The token moves from the base collection to theme's: the original is removed, the copy left.
    const operations = await syncVariables(document(0.2, 16, 'theme'), true);

    assert.deepEqual(
      operations.filter((op) => op.kind === 'DELETE_VARIABLE').map((op) => op.kind === 'DELETE_VARIABLE' && op.variableId),
      [original.id],
    );
    assert.equal(operations.filter((op) => op.kind === 'BREAKING').length, 1, "one move listed: the original's");
    assert.ok(
      mock.variables().some((variable) => variable.id === copy.id),
      'the copy is still in the file',
    );
  });

  it('cut and pasted, the one left is the original moved: adopted, and stamped again with its own id', async () => {
    const mock = createFigmaMock().install();
    await syncVariables(document());
    const moved = mock.variable('Demo', 'color/label')!;
    stampIdOf(moved, 'VariableID:gone');

    await LOAD_DOCUMENT(oneFile(document()));
    await PLAN_VARIABLE_SYNC({});
    const operations = plan();
    assert.deepEqual(
      stamps(operations),
      [{ kind: 'STAMP', target: 'variable', id: moved.id, path: LABEL }],
      'nothing else is written to it, so the stamp is written on its own',
    );
    assert.ok(!operations.some((op) => op.kind === 'CREATE_VARIABLE'), 'adopted, not made again');
    assert.equal(new VariableSyncEngine().summarizePlan(operations).updates, 1, 'a write, in the dry run too');
    await EXECUTE_VARIABLE_SYNC();
    assert.equal(recordedId(moved), moved.id);

    await PLAN_VARIABLE_SYNC({});
    assert.deepEqual(stamps(plan()), [], 'once stamped, it is its own');
  });

  it('where several claim an original that is gone, takes the one with the lowest id and lists the rest as copies', async () => {
    const mock = createFigmaMock().install();
    await syncVariables(document());
    const first = mock.variable('Demo', 'color/label')!;
    const second = await duplicate(first);
    for (const variable of [first, second]) stampIdOf(variable, 'VariableID:gone');
    const [lowest, other] = [first, second].sort((a, b) => (a.id < b.id ? -1 : 1));

    const operations = await syncVariables(document());

    assert.deepEqual(
      stamps(operations).map((op) => op.kind === 'STAMP' && op.id),
      [lowest.id],
    );
    assert.deepEqual(
      copyRows(operations).map((op) => op.reason),
      [`"${other.name}" (${other.id}) is a copy of Toghen's "${lowest.name}", left alone`],
    );
  });

  it('reads a stamp written before the id as its own, and gives it the id on the next write', async () => {
    const mock = createFigmaMock().install();
    await syncVariables(document());
    const label = mock.variable('Demo', 'color/label')!;
    stampIdOf(label, undefined);

    await LOAD_DOCUMENT(oneFile(document()));
    await PLAN_VARIABLE_SYNC({});
    assert.deepEqual(stamps(plan()), [], 'its own: nothing to stamp again');
    assert.ok(plan().some((op) => op.kind === 'SKIP' && op.path === LABEL && op.reason === 'unchanged'));
    assert.equal(recordedId(label), undefined);

    await syncVariables(document(0.6));
    assert.equal(recordedId(label), label.id);
  });
});

describe('a copy of a variable whose token left it behind', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  const breaking = (operations: Operation[]) =>
    operations.filter((op) => op.kind === 'BREAKING').map((op) => op.kind === 'BREAKING' && op.message);
  const MOVED = (copy: MockVariable) =>
    `"color/label" moves from "Demo" to "theme"; the old variable is removed; its copy "color/label copy" (${copy.id}) keeps no stamp.`;

  it('keeps no stamp once the old variable is removed, and the next run neither adopts nor removes it', async () => {
    const mock = createFigmaMock().install();
    await syncVariables(document());
    const copy = await duplicate(mock.variable('Demo', 'color/label')!);
    const values = JSON.stringify(copy.valuesByMode);

    const operations = await syncVariables(document(0.2, 16, 'theme'), true);
    assert.deepEqual(breaking(operations), [MOVED(copy)], 'the row of the removal names the copy');
    assert.equal(rawStamp(copy), '', 'stripped');
    assert.deepEqual([copy.name, JSON.stringify(copy.valuesByMode)], ['color/label copy', values], 'and nothing else of it changes');

    const next = await syncVariables(document(0.2, 16, 'theme'), true);
    assert.deepEqual(naming(next, copy.id), [], 'not adopted, not removed as a move');
    assert.deepEqual(breaking(next), []);
    assert.ok(mock.variables().some((variable) => variable.id === copy.id));
  });

  it('keeps its stamp where the removal is not taken, and the row says what taking it would do', async () => {
    const mock = createFigmaMock().install();
    await syncVariables(document());
    const copy = await duplicate(mock.variable('Demo', 'color/label')!);
    const held = rawStamp(copy);

    const operations = await syncVariables(document(0.2, 16, 'theme'));
    assert.deepEqual(breaking(operations), [MOVED(copy)]);
    assert.ok(!operations.some((op) => op.kind === 'DELETE_VARIABLE'));
    assert.equal(rawStamp(copy), held);
  });
});

describe('a copy of a style Toghen wrote', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  async function synced(): Promise<{ mock: FigmaMockHandle; heading: MockStyle }> {
    const mock = createFigmaMock().install();
    await syncVariables(document());
    await syncStyles(document());
    return { mock, heading: mock.styles('TEXT').find((style) => style.name === 'text/heading')! };
  }
  /** A person's duplicate of a style, under the editor's name for it. */
  const duplicate = (original: MockStyle): MockStyle => {
    const copy = figma.createTextStyle() as unknown as MockStyle;
    copy.name = `${original.name} copy`;
    copyStamp(original, copy);
    return copy;
  };

  it('is left alone and listed, and the original is still written', async () => {
    const { mock, heading } = await synced();
    const counted = (await buildSyncStatePayload(getState().resolver)).recordedCount;
    const copy = duplicate(heading);
    const held = rawStamp(copy);

    const operations = await syncStyles(document(0.2, 20));

    assert.deepEqual(
      copyRows(operations).map((op) => [op.path, op.reason]),
      [[HEADING, `"text/heading copy" (${copy.id}) is a copy of Toghen's "text/heading", left alone`]],
    );
    assert.deepEqual(
      naming(operations, copy.id).map((op) => op.kind),
      [],
      'no step touches the copy',
    );
    assert.ok(
      operations.some((op) => op.kind === 'UPDATE_STYLE' && op.styleId === heading.id),
      'the original is written',
    );
    assert.equal((heading as unknown as TextStyle).fontSize, 20);
    assert.equal(rawStamp(copy), held, 'the copy keeps the stamp it carried');
    assert.equal((await buildSyncStatePayload(getState().resolver)).recordedCount, counted, "and is not counted as Toghen's");
    assert.equal(mock.styles('TEXT').length, 2, 'nothing made, nothing removed');
  });

  it('cut and pasted, the one left is adopted, and stamped again with its own id', async () => {
    const { heading } = await synced();
    stampIdOf(heading, 'S:gone');

    await LOAD_DOCUMENT(oneFile(document()));
    await PLAN_STYLE_SYNC({});
    const operations = plan();
    assert.deepEqual(stamps(operations), [{ kind: 'STAMP', target: 'style', id: heading.id, path: HEADING }]);
    assert.ok(!operations.some((op) => op.kind === 'CREATE_STYLE'), 'adopted, not made again');
    assert.equal(new StyleSyncEngine().summarizePlan(operations).updates, 1, 'a write, in the dry run too');
    await EXECUTE_STYLE_SYNC();
    assert.equal(recordedId(heading), heading.id);
  });

  it('reads a stamp written before the id as its own, and gives it the id on the next write', async () => {
    const { heading } = await synced();
    stampIdOf(heading, undefined);

    await LOAD_DOCUMENT(oneFile(document()));
    await PLAN_STYLE_SYNC({});
    assert.deepEqual(
      plan()
        .filter((op) => op.kind === 'SKIP' && op.path === HEADING)
        .map((op) => op.kind === 'SKIP' && op.reason),
      ['unchanged'],
    );
    assert.deepEqual(stamps(plan()), []);

    await syncStyles(document(0.2, 20));
    assert.equal(recordedId(heading), heading.id);
  });
});
