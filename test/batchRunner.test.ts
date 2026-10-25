import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { installFigma } from './support/partialApi.js';
import { runOperations } from '../main/engines/batchRunner.js';
import type { Operation } from '../shared/operations.js';

type Mode = { modeId: string; name: string };
type MockCollection = {
  id: string;
  name: string;
  modes: Mode[];
  addMode: (name: string) => string;
  renameMode: (modeId: string, name: string) => void;
};
type MockVariable = {
  id: string;
  name: string;
  variableCollectionId: string;
  resolvedType: VariableResolvedDataType;
  valuesByMode: Record<string, VariableValue>;
  setValueForMode: (modeId: string, value: VariableValue) => void;
  /** Where the run keeps the variable's stamp. */
  getSharedPluginData: (namespace: string, key: string) => string;
  setSharedPluginData: (namespace: string, key: string, value: string) => void;
};

function createCollectionStore() {
  const collections = new Map<string, MockCollection>();
  const variables = new Map<string, MockVariable>();

  let colCounter = 0;
  let modeCounter = 0;
  let varCounter = 0;

  function createVariableCollection(name: string): MockCollection {
    const id = `col_${++colCounter}`;
    const firstMode: Mode = { modeId: `mode_${++modeCounter}`, name: 'Mode 1' };

    const collection: MockCollection = {
      id,
      name,
      modes: [firstMode],
      addMode(modeName: string) {
        const modeId = `mode_${++modeCounter}`;
        this.modes.push({ modeId, name: modeName });
        return modeId;
      },
      renameMode(modeId: string, modeName: string) {
        const mode = this.modes.find((m) => m.modeId === modeId);
        if (mode) mode.name = modeName;
      },
    };

    collections.set(id, collection);
    return collection;
  }

  function createVariable(path: string, collection: MockCollection, type: VariableResolvedDataType): MockVariable {
    const id = `var_${++varCounter}`;
    const variable: MockVariable = {
      id,
      name: path,
      variableCollectionId: collection.id,
      resolvedType: type,
      valuesByMode: {},
      setValueForMode(modeId: string, value: VariableValue) {
        this.valuesByMode[modeId] = value;
      },
      getSharedPluginData: (namespace, key) => data.get(`${namespace}/${key}`) ?? '',
      setSharedPluginData: (namespace, key, value) => void data.set(`${namespace}/${key}`, value),
    };
    const data = new Map<string, string>();
    variables.set(id, variable);
    return variable;
  }

  installFigma({
    variables: {
      createVariableCollection,
      getVariableCollectionById: (id: string) => collections.get(id) ?? null,
      createVariable,
      getVariableById: (id: string) => variables.get(id) ?? null,
      getLocalVariableCollections: () => [...collections.values()],
      getLocalVariables: () => [...variables.values()],
      getVariableCollectionByIdAsync: async (id: string) => collections.get(id) ?? null,
      getVariableByIdAsync: async (id: string) => variables.get(id) ?? null,
      getLocalVariableCollectionsAsync: async () => [...collections.values()],
      getLocalVariablesAsync: async () => [...variables.values()],
    },
  });

  return { collections, variables };
}

describe('runOperations', () => {
  beforeEach(() => {
    createCollectionStore();
  });

  it('executes plan with symbolic ids and applies values', async () => {
    const ops: Operation[] = [
      { kind: 'CREATE_COLLECTION', symbolicId: '$col:Demo', name: 'Demo', modes: ['light', 'dark'] },
      {
        kind: 'CREATE_VARIABLE',
        symbolicId: '$var:Demo/color/primary',
        collectionId: '$col:Demo',
        path: 'Demo/color/primary',
        variableType: 'COLOR',
      },
      {
        kind: 'SET_VARIABLE_VALUE',
        variableId: '$var:Demo/color/primary',
        modeId: '$mode:Demo/light',
        value: { r: 1, g: 0, b: 0, a: 1 },
        label: 'Demo/color/primary [light]',
        tokenPath: 'Demo.token',
        modeName: '$mode:Demo/light',
      },
      {
        kind: 'SET_VARIABLE_VALUE',
        variableId: '$var:Demo/color/primary',
        modeId: '$mode:Demo/dark',
        value: { r: 0, g: 0, b: 0, a: 1 },
        label: 'Demo/color/primary [dark]',
        tokenPath: 'Demo.token',
        modeName: '$mode:Demo/dark',
      },
    ];

    const progress: string[] = [];
    const summary = await runOperations(ops, {
      onProgress: (_done, _total, label) => progress.push(label),
    });

    assert.equal(summary.failed, 0);
    assert.equal(summary.applied, 4);
    assert.equal(progress.length, 4);

    const variable = figma.variables.getLocalVariables()[0];
    assert.ok(variable);

    const collection = figma.variables.getVariableCollectionById(variable.variableCollectionId);
    assert.ok(collection);
    const light = collection?.modes.find((m) => m.name === 'light');
    const dark = collection?.modes.find((m) => m.name === 'dark');

    assert.ok(light);
    assert.ok(dark);
    assert.deepEqual(variable.valuesByMode[light!.modeId], { r: 1, g: 0, b: 0, a: 1 });
    assert.deepEqual(variable.valuesByMode[dark!.modeId], { r: 0, g: 0, b: 0, a: 1 });
  });

  it('reports unresolved symbolic references as failed operations', async () => {
    const ops: Operation[] = [
      {
        kind: 'SET_VARIABLE_VALUE',
        variableId: '$var:missing',
        modeId: '$mode:Demo/light',
        value: 16,
        label: 'Demo/spacing/md [light]',
        tokenPath: 'Demo.token',
        modeName: '$mode:Demo/light',
      },
    ];

    const summary = await runOperations(ops, {
      onProgress: () => {},
    });

    assert.equal(summary.applied, 0);
    assert.equal(summary.failed, 1);
    assert.match(summary.results[0].reason ?? '', /Unresolved symbolic ID/);
  });

  it("counts only skips as skipped: a warning, a note and a breaking row keep the plan's own counts (R14)", async () => {
    const ops: Operation[] = [
      { kind: 'SKIP', reason: 'unchanged', path: 'Demo.space.sm', cause: 'unchanged' },
      {
        kind: 'SKIP',
        reason: '"Demo.space.pad" cannot be written in Demo / default: it holds 8px 13px',
        path: 'Demo.space.pad',
        cause: 'cannot-write',
      },
      { kind: 'WARNING', message: 'a warning', path: 'Demo.space.sm' },
      { kind: 'NOTE', message: 'a note' },
      { kind: 'BREAKING', message: 'a breaking row', moved: { collection: 'Demo', name: 'space/old' } },
    ];

    const summary = await runOperations(ops, { onProgress: () => {} });

    assert.equal(summary.skipped, 2);
    // Each row is still in the results, as the plan listed it.
    assert.equal(summary.results.length, 5);
  });
});

describe('runOperations — aliases', () => {
  const createVariable = (name: string, collectionId = '$col:Demo'): Operation => ({
    kind: 'CREATE_VARIABLE',
    symbolicId: `$var:${name}`,
    collectionId,
    path: name,
    variableType: 'COLOR',
  });

  const aliasBgToBrand: Operation = {
    kind: 'SET_VARIABLE_VALUE',
    variableId: '$var:Demo/color/bg',
    modeId: '$mode:Demo/light',
    value: { type: 'VARIABLE_ALIAS', id: '$var:Demo/color/brand' },
    label: 'Demo/color/bg [light]',
    tokenPath: 'Demo.color.bg',
    modeName: 'light',
  };

  let store: ReturnType<typeof createCollectionStore>;
  beforeEach(() => {
    store = createCollectionStore();
  });

  it('resolves an alias to a variable created earlier in the plan', async () => {
    const summary = await runOperations(
      [
        { kind: 'CREATE_COLLECTION', symbolicId: '$col:Demo', name: 'Demo', modes: ['light'] },
        createVariable('Demo/color/brand'),
        createVariable('Demo/color/bg'),
        aliasBgToBrand,
      ],
      { onProgress: () => {} },
    );

    assert.equal(summary.failed, 0);
    const byName = (name: string) => [...store.variables.values()].find((v) => v.name === name)!;
    const light = [...store.collections.values()][0].modes.find((m) => m.name === 'light')!;
    assert.deepEqual(byName('Demo/color/bg').valuesByMode[light.modeId], {
      type: 'VARIABLE_ALIAS',
      id: byName('Demo/color/brand').id,
    });
  });

  it('blocks an alias whose target failed to be created', async () => {
    const summary = await runOperations(
      [
        { kind: 'CREATE_COLLECTION', symbolicId: '$col:Demo', name: 'Demo', modes: ['light'] },
        // No such collection, so this create fails and its symbol never resolves.
        createVariable('Demo/color/brand', 'col_missing'),
        createVariable('Demo/color/bg'),
        aliasBgToBrand,
      ],
      { onProgress: () => {} },
    );

    const alias = summary.results.find((r) => r.operation.kind === 'SET_VARIABLE_VALUE');
    assert.equal(alias?.status, 'skipped');
    assert.equal(alias?.reason, 'prerequisite failed: $var:Demo/color/brand');
  });
});
