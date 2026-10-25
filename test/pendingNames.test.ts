import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Operation } from '../shared/operations.js';
import { pendingNames } from '../shared/pendingNames.js';

const variable = (collectionId: string, path: string, variableType: VariableResolvedDataType): Operation => ({
  kind: 'CREATE_VARIABLE',
  collectionId,
  path,
  variableType,
});
const style = (styleType: 'TEXT' | 'EFFECT' | 'PAINT', name: string): Operation => ({
  kind: 'CREATE_STYLE',
  styleType,
  name,
  props: {},
  tokenPath: name.replace(/\//g, '.'),
});

describe('pendingNames: what a pair of plans would create', () => {
  it('names a variable by the collection that exists, and keeps its full name and type', () => {
    const pending = pendingNames(
      [variable('VariableCollectionId:1:1', 'Tokens/space/xl', 'FLOAT')],
      [{ id: 'VariableCollectionId:1:1', name: 'Tokens' }],
    );
    assert.deepEqual(pending, {
      variables: [{ collection: 'Tokens', name: 'Tokens/space/xl', type: 'FLOAT' }],
      textStyles: [],
      effectStyles: [],
      modes: [],
    });
  });

  it('names a variable by the collection the plan creates, through its symbolic id', () => {
    const pending = pendingNames(
      [
        { kind: 'CREATE_COLLECTION', symbolicId: '$col:Fresh', name: 'Fresh', modes: ['light', 'dark'] },
        variable('$col:Fresh', 'Fresh/surface/page', 'COLOR'),
      ],
      [{ id: 'VariableCollectionId:1:1', name: 'Tokens' }],
    );
    assert.deepEqual(pending.variables, [{ collection: 'Fresh', name: 'Fresh/surface/page', type: 'COLOR' }]);
  });

  it('keeps the modes of a collection the plan creates, and a mode it adds to one that exists', () => {
    const pending = pendingNames(
      [
        { kind: 'CREATE_COLLECTION', symbolicId: '$col:state', name: 'state', modes: ['rest', 'hover'] },
        { kind: 'ADD_MODE', collectionId: 'VariableCollectionId:1:1', collectionName: 'theme', modeName: 'dark' },
      ],
      [{ id: 'VariableCollectionId:1:1', name: 'theme' }],
    );
    assert.deepEqual(pending.modes, [
      { collection: 'state', mode: 'rest' },
      { collection: 'state', mode: 'hover' },
      { collection: 'theme', mode: 'dark' },
    ]);
  });

  it('leaves out a variable whose collection it cannot name', () => {
    assert.deepEqual(pendingNames([variable('$col:Nowhere', 'Nowhere/space/xl', 'FLOAT')], []).variables, []);
  });

  it('keeps text and effect styles only: paint styles are not named by a component file', () => {
    const pending = pendingNames(
      [style('TEXT', 'Tokens/text/label'), style('EFFECT', 'Tokens/shadow/raised'), style('PAINT', 'Tokens/fill/page')],
      [],
    );
    assert.deepEqual(pending.textStyles, ['Tokens/text/label']);
    assert.deepEqual(pending.effectStyles, ['Tokens/shadow/raised']);
  });

  it('ignores operations that create nothing', () => {
    const operations: Operation[] = [
      { kind: 'SKIP', reason: 'unchanged', path: 'Tokens.space.sm' },
      { kind: 'RENAME_VARIABLE', variableId: 'v', name: 'Tokens/space/sm', path: 'Tokens.space.sm' },
      { kind: 'UPDATE_STYLE', styleId: 's', props: {}, tokenPath: 'Tokens.text.label' },
      { kind: 'WARNING', message: 'x' },
    ];
    assert.deepEqual(pendingNames(operations, []), { variables: [], textStyles: [], effectStyles: [], modes: [] });
  });

  it('takes the operations of both plans in one list, in order', () => {
    const pending = pendingNames(
      [variable('c', 'Tokens/space/xl', 'FLOAT'), variable('c', 'Tokens/space/2xl', 'FLOAT'), style('TEXT', 'Tokens/text/body')],
      [{ id: 'c', name: 'Tokens' }],
    );
    assert.deepEqual(
      pending.variables.map((v) => v.name),
      ['Tokens/space/xl', 'Tokens/space/2xl'],
    );
    assert.deepEqual(pending.textStyles, ['Tokens/text/body']);
  });
});
