import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, useFigmaMock } from './support/figmaMock.js';
import { getStamp, hashOf, NAMESPACE, receiptOf, setStamp, STAMP_KEY, type Stamp } from '../main/components/stamp.js';

/**
 * The stamp: what an object is and a receipt of what Figma reported after Toghen wrote it, kept on the object.
 * Values are what Figma reports, float32 and all, since that is what a later read compares against.
 */
describe('the stamp', () => {
  useFigmaMock();

  const install = () =>
    createFigmaMock()
      .withFonts([{ family: 'Inter', style: 'Regular' }])
      .install();

  it('is kept on a variable, a collection, a style and a node, each under its own object', () => {
    install();
    const collection = figma.variables.createVariableCollection('theme');
    const surface = figma.variables.createVariable('surface', collection, 'COLOR');
    const text = figma.variables.createVariable('text', collection, 'COLOR');
    const style = figma.createPaintStyle();
    const frame = figma.createFrame();

    const reported = { r: 0.4000000059604645, g: 0.20000000298023224, b: 1, a: 1 };
    setStamp(surface, { is: { token: 'ds.color.surface' }, receipt: receiptOf({ 'value light': reported, scopes: ['FRAME_FILL'] }) });
    setStamp(collection, { is: { modifier: 'theme' }, receipt: {} });
    setStamp(style, { is: { token: 'ds.shadow.raised' }, receipt: receiptOf({ effects: [] }) });
    setStamp(frame, { is: { artboard: 'Card', address: 'root' }, receipt: {}, placed: { x: 40, y: -12.5 } });

    // Each with the id of the object it was written on.
    assert.deepEqual(getStamp(surface), {
      is: { token: 'ds.color.surface' },
      id: surface.id,
      receipt: { 'value light': hashOf(reported), scopes: hashOf(['FRAME_FILL']) },
    });
    assert.deepEqual(getStamp(collection), { is: { modifier: 'theme' }, id: collection.id, receipt: {} });
    assert.deepEqual(getStamp(style)?.is, { token: 'ds.shadow.raised' });
    assert.deepEqual(getStamp(frame), {
      is: { artboard: 'Card', address: 'root' },
      id: frame.id,
      receipt: {},
      placed: { x: 40, y: -12.5 },
    });
    // A stamp belongs to its object: the variable beside it has none.
    assert.equal(getStamp(text), undefined);
    assert.deepEqual(surface.getSharedPluginDataKeys(NAMESPACE), [STAMP_KEY]);
  });

  it('counts as a write to the file, which a dry run must not make', () => {
    const mock = install();
    const collection = figma.variables.createVariableCollection('ds');
    setStamp(collection, { is: { base: true }, receipt: {} });
    assert.equal(mock.writes().filter((call) => call.api === 'collection.setSharedPluginData').length, 1);
    assert.deepEqual(getStamp(collection)?.is, { base: true });
  });

  it('hashes what Figma reports whatever the order of its keys, and tells float32 from the JSON number', () => {
    assert.equal(hashOf({ r: 0.4000000059604645, g: 0, b: 1, a: 1 }), hashOf({ a: 1, b: 1, g: 0, r: 0.4000000059604645 }));
    assert.notEqual(hashOf({ r: 0.4, g: 0, b: 1, a: 1 }), hashOf({ r: 0.4000000059604645, g: 0, b: 1, a: 1 }));
    // Structured shapes, nested: a line height as Figma reports it, and a W3C colour and dimension.
    assert.equal(hashOf({ lineHeight: { unit: 'PIXELS', value: 20 } }), hashOf({ lineHeight: { value: 20, unit: 'PIXELS' } }));
    assert.equal(
      hashOf({ colorSpace: 'srgb', components: [0.4, 0.2, 1], alpha: 1 }),
      hashOf({ alpha: 1, components: [0.4, 0.2, 1], colorSpace: 'srgb' }),
    );
    assert.notEqual(hashOf({ value: 4, unit: 'px' }), hashOf({ value: 4, unit: 'rem' }));
    // An alias as Figma reports it is a value like any other.
    assert.notEqual(hashOf({ type: 'VARIABLE_ALIAS', id: 'VariableID:1' }), hashOf({ type: 'VARIABLE_ALIAS', id: 'VariableID:2' }));
  });

  it('reads no stamp from an object that has none, or one it cannot interpret, and never throws', () => {
    install();
    const collection = figma.variables.createVariableCollection('ds');
    const variable = figma.variables.createVariable('gap', collection, 'FLOAT');
    assert.equal(getStamp(variable), undefined);

    for (const raw of [
      'not json',
      '"text"',
      '[]',
      '{}',
      '{"is":{},"receipt":{}}',
      '{"is":{"token":"ds.gap"}}',
      '{"is":{"token":7,"base":"yes"},"receipt":{}}',
    ]) {
      variable.setSharedPluginData(NAMESPACE, STAMP_KEY, raw);
      assert.equal(getStamp(variable), undefined, raw);
    }

    const broken = {
      getSharedPluginData: () => {
        throw new Error('The node does not exist');
      },
    } as unknown as PluginDataMixin;
    assert.equal(getStamp(broken), undefined);
  });

  it('keeps what it can read of a stamp edited by hand, and drops the rest', () => {
    install();
    const variable = figma.variables.createVariable('gap', figma.variables.createVariableCollection('ds'), 'FLOAT');
    variable.setSharedPluginData(
      NAMESPACE,
      STAMP_KEY,
      JSON.stringify({ is: { token: 'ds.gap', colour: 'red' }, receipt: { value: 'abc-1', scopes: 3 }, placed: { x: '1', y: 2 } }),
    );
    const expected: Stamp = { is: { token: 'ds.gap' }, receipt: { value: 'abc-1' } };
    assert.deepEqual(getStamp(variable), expected);
  });
});
