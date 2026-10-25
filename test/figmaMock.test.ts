/**
 * Tests for the mock itself.
 *
 * The mock is the specification the rest of the suite is written against, so
 * the behaviours it reproduces need to be pinned as tightly as the production
 * code — otherwise a drifting mock silently re-blesses the bugs it exists to
 * catch. Every expectation here comes from
 * `.reference/figma/measured_behaviour.md`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, dynamicPageMessage, modeCapMessage, useFigmaMock, MEASURED_PRO_MODE_CAP } from './support/figmaMock.js';

describe('figmaMock — collections and modes', () => {
  useFigmaMock();

  it('gives a new collection exactly one mode, named "Mode 1"', () => {
    createFigmaMock().install();
    const collection = figma.variables.createVariableCollection('probe');

    assert.equal(collection.modes.length, 1);
    assert.equal(collection.modes[0].name, 'Mode 1');
    assert.equal(collection.defaultModeId, collection.modes[0].modeId);
  });

  it('refuses to add a mode past the cap, with Figma’s wording', () => {
    const mock = createFigmaMock().withModeCap(3).install();
    const collection = figma.variables.createVariableCollection('probe');

    collection.addMode('b');
    collection.addMode('c');

    assert.throws(() => collection.addMode('d'), new RegExp(modeCapMessage(3)));
    assert.equal(mock.collection('probe')?.modes.length, 3);
  });

  it('defaults the cap to the measured pro-tier value', () => {
    createFigmaMock().install();
    const collection = figma.variables.createVariableCollection('probe');

    for (let i = 1; i < MEASURED_PRO_MODE_CAP; i++) collection.addMode(`m${i}`);
    assert.throws(() => collection.addMode('one too many'));
  });

  it('keeps defaultModeId locked to modes[0] and rejects assignment', () => {
    createFigmaMock().install();
    const collection = figma.variables.createVariableCollection('probe');
    const second = collection.addMode('second');

    assert.throws(() => {
      (collection as { defaultModeId: string }).defaultModeId = second;
    }, /no setter for property/);

    // Removing modes[0] promotes the next mode — the only lever that exists.
    collection.removeMode(collection.defaultModeId);
    assert.equal(collection.defaultModeId, second);
    assert.equal(collection.defaultModeId, collection.modes[0].modeId);
  });

  it('rejects a duplicate variable name within a collection', () => {
    createFigmaMock().install();
    const collection = figma.variables.createVariableCollection('probe');

    figma.variables.createVariable('color/brand', collection, 'COLOR');
    assert.throws(() => figma.variables.createVariable('color/brand', collection, 'COLOR'), /already exists/);
  });

  it('rejects a value written for a mode of another collection', () => {
    createFigmaMock().install();
    const a = figma.variables.createVariableCollection('a');
    const b = figma.variables.createVariableCollection('b');
    const variable = figma.variables.createVariable('x', a, 'FLOAT');

    assert.throws(() => variable.setValueForMode(b.defaultModeId, 1), /not in collection/);
  });

  it('rejects an alias that reaches the variable it is set on, itself included', () => {
    createFigmaMock().install();
    const collection = figma.variables.createVariableCollection('probe');
    const a = figma.variables.createVariable('a', collection, 'COLOR');
    const b = figma.variables.createVariable('b', collection, 'COLOR');

    assert.throws(() => a.setValueForMode(collection.defaultModeId, { type: 'VARIABLE_ALIAS', id: a.id }), /circular/);
    b.setValueForMode(collection.defaultModeId, { type: 'VARIABLE_ALIAS', id: a.id });
    assert.throws(() => a.setValueForMode(collection.defaultModeId, { type: 'VARIABLE_ALIAS', id: b.id }), /circular/);
  });
});

describe('figmaMock — dynamic-page access', () => {
  useFigmaMock();

  it('keeps deprecated sync accessors present, and throwing', () => {
    createFigmaMock().install();

    // Present, not absent: a missing member would be `undefined is not a
    // function`, which is a different failure with different catch behaviour.
    assert.equal(typeof figma.getNodeById, 'function');
    assert.throws(() => figma.getNodeById('1:2'), new RegExp(dynamicPageMessage('figma.getNodeById')));
    assert.throws(() => figma.variables.getLocalVariables(), /dynamic-page/);
    assert.throws(() => figma.getLocalTextStyles(), /dynamic-page/);
  });

  it('lets the sync accessors work when access is not dynamic-page', () => {
    createFigmaMock().withDocumentAccess('default').install();
    assert.doesNotThrow(() => figma.getNodeById('1:2'));
  });

  it('will not read a page’s children before it is loaded', async () => {
    const mock = createFigmaMock()
      .withPage('Page 1')
      .withPage('Page 2', [{ id: '2:1', name: 'Card', type: 'FRAME', boundVariables: {} }])
      .install();

    const second = figma.root.children[1];
    assert.throws(() => second.children, /loadAsync/);

    await second.loadAsync();
    assert.equal(second.children.length, 1);
    assert.equal(mock.calls('page.loadAsync').length, 1);
  });
});

describe('figmaMock — fonts', () => {
  useFigmaMock();

  it('rejects a font family the file does not have', async () => {
    createFigmaMock()
      .withFonts([{ family: 'Inter', style: 'Regular' }])
      .install();

    await assert.rejects(() => figma.loadFontAsync({ family: 'Nonesuch', style: 'Regular' }), /Cannot load font Nonesuch/);
  });

  it('refuses to assign a font that has not been loaded', async () => {
    const mock = createFigmaMock()
      .withFonts([{ family: 'Inter', style: 'Regular' }])
      .install();
    const style = figma.createTextStyle();

    assert.throws(() => {
      style.fontName = { family: 'Inter', style: 'Regular' };
    }, /unloaded font/);

    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    assert.doesNotThrow(() => {
      style.fontName = { family: 'Inter', style: 'Regular' };
    });

    assert.ok(mock.callOrder('loadFontAsync', 'style.fontName'), 'the font must be loaded before it is assigned');
  });
});

describe('figmaMock — unimplemented members', () => {
  useFigmaMock();

  it('names the missing member instead of failing as undefined', () => {
    createFigmaMock().install();

    assert.throws(
      () => (figma as unknown as { createSlide: () => void }).createSlide(),
      /figma\.createSlide is not implemented in the Figma mock/,
    );
  });
});
