import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { figmaValuesEqual, fromFigmaValue, toFigmaValue } from '../main/utils/figmaTokenAdapter.js';
import { toEffectStyleProps, toPaintStyleProps } from '../main/utils/figmaStyleAdapter.js';

/**
 * Figma's RGB channels are sRGB 0–1.
 *
 * The old tests asserted only `#ff0000` — channels 0 and 1, which are the two
 * fixed points of the sRGB transfer curve. A spurious sRGB→linear conversion is
 * invisible at those values, so the suite stayed green while every mid-tone
 * shipped several stops too dark. Every case below uses a channel that moves.
 */
const MID = 0x80 / 255; // 0.5019607843137255

/** Never assert `fromFigmaValue(toFigmaValue(x)) === x`. */
const ROUND_TRIP_WARNING =
  'the round trip is the exact inverse of the bug it would be testing, so it ' +
  'passes either way — assert against literal expected values instead';

describe('figmaTokenAdapter.toFigmaValue', () => {
  it('writes colors as sRGB, unconverted', () => {
    const value = toFigmaValue({ colorSpace: 'srgb', components: [0, 0.4, 0.8] }, 'color') as RGBA;

    // Under the old linear conversion these were 0, 0.13287, 0.60383.
    assert.ok(Math.abs(value.r - 0) < 1e-9);
    assert.ok(Math.abs(value.g - 0.4) < 1e-9, `g was ${value.g}`);
    assert.ok(Math.abs(value.b - 0.8) < 1e-9, `b was ${value.b}`);
    assert.equal(value.a, 1);
  });

  it('writes a mid grey unchanged', () => {
    const value = toFigmaValue('#808080', 'color') as RGBA;

    // Old behaviour: 0.2158605 on every channel — #373737 in the picker.
    for (const channel of ['r', 'g', 'b'] as const) {
      assert.ok(Math.abs(value[channel] - MID) < 1e-9, `${channel} was ${value[channel]}, expected ${MID}`);
    }
  });

  it('preserves alpha', () => {
    const value = toFigmaValue('#ff000080', 'color') as RGBA;
    assert.equal(value.r, 1);
    assert.equal(value.g, 0);
    assert.equal(value.b, 0);
    assert.ok(Math.abs(value.a - MID) < 1e-6);
  });

  it('agrees with the style adapter on the same color', () => {
    // The regression guard that survives refactors: a token value must land the
    // same way whether it becomes a Variable, a shadow, or a gradient stop.
    // These disagreed before — one path converted to linear and two did not, so
    // a single source colour rendered two different ways in one Figma file.
    const source = { colorSpace: 'srgb', components: [0, 0.4, 0.8] };

    const asVariable = toFigmaValue(source, 'color') as RGBA;
    const shadowEffect = toEffectStyleProps({
      color: source,
      offsetX: { value: 0, unit: 'px' },
      offsetY: { value: 0, unit: 'px' },
      blur: { value: 0, unit: 'px' },
    }).effects[0];
    assert.equal(shadowEffect.type, 'DROP_SHADOW');
    const asShadow = (shadowEffect as DropShadowEffect).color;
    const asGradientStop = toPaintStyleProps([{ color: source, position: 0 }]).paints[0] as GradientPaint;

    assert.deepEqual(
      { r: asVariable.r, g: asVariable.g, b: asVariable.b },
      { r: asShadow.r, g: asShadow.g, b: asShadow.b },
      'variable and shadow colors must match',
    );
    assert.deepEqual(
      { r: asVariable.r, g: asVariable.g, b: asVariable.b },
      {
        r: asGradientStop.gradientStops[0].color.r,
        g: asGradientStop.gradientStops[0].color.g,
        b: asGradientStop.gradientStops[0].color.b,
      },
      'variable and gradient stop colors must match',
    );
  });

  it('converts dimension strings and objects to px', () => {
    assert.equal(toFigmaValue('16px', 'dimension'), 16);
    assert.equal(toFigmaValue('2rem', 'dimension'), 32);
    assert.equal(toFigmaValue({ value: 3, unit: 'pt' }, 'dimension'), 4);
  });

  it('narrows a font stack to its first family, as the style adapter does', () => {
    assert.equal(toFigmaValue(['Inter', 'system-ui', 'sans-serif'], 'fontFamily'), 'Inter');
    assert.equal(toFigmaValue('Inter', 'fontFamily'), 'Inter');
    // a string with commas is a list: the first family, without its quotes
    assert.equal(toFigmaValue("'Plex Sans', system-ui, sans-serif", 'fontFamily'), 'Plex Sans');
    assert.equal(toFigmaValue("'Foo, Bar', serif", 'fontFamily'), 'Foo, Bar');
  });

  it('throws for unsupported type', () => {
    assert.throws(() => toFigmaValue('x', 'gradient'));
  });
});

describe('figmaTokenAdapter.fromFigmaValue', () => {
  it('reads sRGB COLOR values back to CSS hex', () => {
    // Literal table, not a round trip — see ROUND_TRIP_WARNING.
    assert.equal(fromFigmaValue({ r: 1, g: 0, b: 0, a: 1 }, 'COLOR'), '#ff0000');
    assert.equal(fromFigmaValue({ r: MID, g: MID, b: MID, a: 1 }, 'COLOR'), '#808080', ROUND_TRIP_WARNING);
    assert.equal(fromFigmaValue({ r: 0, g: 0.4, b: 0.8, a: 1 }, 'COLOR'), '#0066cc');
  });

  it('appends alpha only when it is not fully opaque', () => {
    assert.equal(fromFigmaValue({ r: 1, g: 0, b: 0, a: 1 }, 'COLOR'), '#ff0000');
    assert.equal(fromFigmaValue({ r: 1, g: 0, b: 0, a: MID }, 'COLOR'), '#ff000080');
  });

  it('passes through non-color values', () => {
    assert.equal(fromFigmaValue(24, 'FLOAT'), 24);
    assert.equal(fromFigmaValue('text', 'STRING'), 'text');
    assert.equal(fromFigmaValue(true, 'BOOLEAN'), true);
  });
});

describe('figmaTokenAdapter.figmaValuesEqual', () => {
  it('accepts the float32 drift Figma actually stores', () => {
    // Measured, not assumed: .reference/figma/measured_behaviour.md records
    // 0.4 reading back as 0.4000000059604645 and a PERCENT line height of 160
    // as 160.0000023841858. Exact comparison would report every value in the
    // file as changed.
    assert.equal(figmaValuesEqual(0.4, 0.4000000059604645), true);
    assert.equal(figmaValuesEqual(160, 160.0000023841858), true);
    assert.equal(figmaValuesEqual({ r: 0, g: 0.4, b: 0.8, a: 1 }, { r: 0, g: 0.4000000059604645, b: 0.8, a: 1 }), true);
  });

  it('scales the tolerance with the magnitude', () => {
    // float32 error is relative, so an absolute tolerance tuned for a colour
    // channel would reject a 9999px radius that merely round-tripped.
    assert.equal(figmaValuesEqual(9999, Math.fround(9999)), true);
    assert.equal(figmaValuesEqual(9999, 9998), false, 'a real difference still differs');
  });

  it('still sees a change a person would make', () => {
    // One step of an 8-bit colour channel is 1/255 — four orders of magnitude
    // above the tolerance, so nothing a designer can pick is swallowed.
    assert.equal(figmaValuesEqual({ r: 0, g: 0, b: 0, a: 1 }, { r: 1 / 255, g: 0, b: 0, a: 1 }), false);
    assert.equal(figmaValuesEqual(16, 24), false);
    assert.equal(figmaValuesEqual('a', 'b'), false);
    assert.equal(figmaValuesEqual(true, false), false);
  });

  it('treats an absent alpha as opaque', () => {
    assert.equal(figmaValuesEqual({ r: 1, g: 0, b: 0 }, { r: 1, g: 0, b: 0, a: 1 }), true);
    assert.equal(figmaValuesEqual({ r: 1, g: 0, b: 0 }, { r: 1, g: 0, b: 0, a: 0.5 }), false);
  });

  it('never equates an alias with a concrete value', () => {
    // Pointing a variable at another variable really is a change, and saying so
    // is the honest answer rather than a special case to swallow.
    const alias: VariableAlias = { type: 'VARIABLE_ALIAS', id: 'VariableID:1:2' };
    assert.equal(figmaValuesEqual(alias, { r: 1, g: 0, b: 0, a: 1 }), false);
    assert.equal(figmaValuesEqual(alias, alias), true);
    assert.equal(figmaValuesEqual(alias, { type: 'VARIABLE_ALIAS', id: 'VariableID:9:9' }), false);
  });

  it('reports a missing value as different from any value', () => {
    assert.equal(figmaValuesEqual(undefined, 16), false);
    assert.equal(figmaValuesEqual(undefined, undefined), true);
  });
});
