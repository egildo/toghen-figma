import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toEffectStyleProps, toPaintStyleProps, toTextStyleProps } from '../main/utils/figmaStyleAdapter.js';

describe('figmaStyleAdapter', () => {
  it('converts typography token value to text style props', () => {
    const props = toTextStyleProps({
      fontFamily: 'Inter',
      fontStyle: 'Semi Bold',
      fontSize: { value: 16, unit: 'px' },
      fontWeight: 600,
      lineHeight: '120%',
      letterSpacing: '0.5px',
      textTransform: 'uppercase',
      textDecoration: 'underline',
    });

    assert.equal(props.fontFamily, 'Inter');
    assert.equal(props.fontStyle, 'Semi Bold');
    assert.equal(props.fontSize, 16);
    assert.equal(props.lineHeight.unit, 'PERCENT');
    assert.equal(props.lineHeight.value, 120);
    assert.equal(props.textCase, 'UPPER');
    assert.equal(props.textDecoration, 'UNDERLINE');
  });

  it('reads a unitless lineHeight as a multiplier, not pixels', () => {
    // The case that matters and had no coverage: 1.6 is a ratio of the font
    // size. Sent down the PIXELS branch it becomes a 1.6 *pixel* line height and
    // the text collapses into a smear. Every typography token in the demo
    // document uses this form.
    const cases: Array<[unknown, LineHeight]> = [
      [1.6, { unit: 'PERCENT', value: 160 }],
      [1, { unit: 'PERCENT', value: 100 }],
      ['1.5', { unit: 'PERCENT', value: 150 }],
      ['120%', { unit: 'PERCENT', value: 120 }],
      ['normal', { unit: 'AUTO' }],
      // A real length stays a length.
      [
        { value: 24, unit: 'px' },
        { unit: 'PIXELS', value: 24 },
      ],
      ['24px', { unit: 'PIXELS', value: 24 }],
    ];

    for (const [input, expected] of cases) {
      const props = toTextStyleProps({ fontFamily: 'Inter', fontSize: { value: 16, unit: 'px' }, lineHeight: input });
      assert.deepEqual(props.lineHeight, expected, `lineHeight ${JSON.stringify(input)}`);
    }
  });

  it('reads proportional letterSpacing as a percentage', () => {
    // em and % are proportional to the font size; this used to hardcode PIXELS,
    // so '0.05em' became 0.05px when 0.8px was meant.
    const cases: Array<[unknown, LetterSpacing]> = [
      ['0.02em', { unit: 'PERCENT', value: 2 }],
      ['-0.01em', { unit: 'PERCENT', value: -1 }],
      ['2%', { unit: 'PERCENT', value: 2 }],
      [
        { value: -0.5, unit: 'px' },
        { unit: 'PIXELS', value: -0.5 },
      ],
      ['0.5px', { unit: 'PIXELS', value: 0.5 }],
      [undefined, { unit: 'PIXELS', value: 0 }],
    ];

    const typography = (letterSpacing: unknown) => ({
      fontFamily: 'Inter',
      fontSize: { value: 16, unit: 'px' },
      lineHeight: 1.5,
      letterSpacing,
    });

    for (const [input, expected] of cases) {
      const props = toTextStyleProps(typography(input));
      assert.deepEqual(props.letterSpacing, expected, `letterSpacing ${JSON.stringify(input)}`);
    }

    // A bare number is not a dimension. It used to become pixels here, and
    // garbage became 0; the library rejects both, and so does the adapter.
    assert.throws(() => toTextStyleProps(typography(0)), /string or DimensionValue/);
    assert.throws(() => toTextStyleProps(typography('wide')), /Invalid dimension string/);
    assert.throws(() => toTextStyleProps(typography('x%')), /Invalid letterSpacing/);
  });

  it('accepts a gradient written as a bare array of stops', () => {
    // W3C DTCG §9.7 defines a gradient value as an array of stops, which is what
    // the demo document uses. This used to throw "must be an object" before a
    // single operation was planned, so style sync was dead on our own document.
    const props = toPaintStyleProps([
      { color: { colorSpace: 'srgb', components: [0, 0.4, 0.8] }, position: 0 },
      { color: { colorSpace: 'srgb', components: [0, 0.302, 0.6] }, position: 1 },
    ]);

    const paint = props.paints[0] as GradientPaint;
    assert.equal(paint.type, 'GRADIENT_LINEAR', 'a stops-only gradient is linear');
    assert.equal(paint.gradientStops.length, 2);
    assert.ok(Math.abs(paint.gradientStops[0].color.b - 0.8) < 1e-9);
  });

  it('still accepts the object gradient form with type and angle', () => {
    const props = toPaintStyleProps({
      type: 'radial',
      angle: '90deg',
      stops: [
        { color: '#000000', position: 0 },
        { color: '#ffffff', position: 1 },
      ],
    });

    assert.equal((props.paints[0] as GradientPaint).type, 'GRADIENT_RADIAL');
  });

  it('narrows a fontFamily stack to the primary family', () => {
    // @toghen/lib preserves the whole W3C fallback stack (§9.1 forbids
    // collapsing it); a Figma text style binds exactly one family, so the
    // narrowing happens here. Without it the family would come out as the
    // joined string "Inter,system-ui,sans-serif" and fail to load.
    const props = toTextStyleProps({
      fontFamily: ['Inter', 'system-ui', 'sans-serif'],
      fontSize: { value: 16, unit: 'px' },
      lineHeight: { value: 24, unit: 'px' },
    });

    assert.equal(props.fontFamily, 'Inter');
  });

  it('converts shadow token value to effect style props', () => {
    const props = toEffectStyleProps({
      color: '#00000080',
      offsetX: '0px',
      offsetY: '4px',
      blur: '16px',
      spread: '2px',
      inset: false,
    });

    assert.equal(props.effects.length, 1);
    assert.equal(props.effects[0].type, 'DROP_SHADOW');
    assert.equal(props.effects[0].offset.y, 4);
    assert.equal(props.effects[0].radius, 16);
    assert.equal(props.effects[0].spread, 2);
  });

  it('converts gradient token value to paint style props', () => {
    const props = toPaintStyleProps({
      type: 'linear',
      angle: '45deg',
      stops: [
        { color: '#ff0000', position: 0 },
        { color: '#0000ff', position: 1 },
      ],
    });

    assert.equal(props.paints.length, 1);
    const paint = props.paints[0] as GradientPaint;
    assert.equal(paint.type, 'GRADIENT_LINEAR');
    assert.equal(paint.gradientStops.length, 2);
  });

  describe('gradient placement', () => {
    const transformFor = (angle: string | number): Transform => {
      const props = toPaintStyleProps({
        type: 'linear',
        angle,
        stops: [
          { color: '#0066cc', position: 0 },
          { color: '#004d99', position: 1 },
        ],
      });
      return (props.paints[0] as GradientPaint).gradientTransform;
    };

    const closeTo = (actual: Transform, expected: number[][], message: string) => {
      for (let row = 0; row < 2; row += 1) {
        for (let col = 0; col < 3; col += 1) {
          assert.ok(
            Math.abs(actual[row][col] - expected[row][col]) < 1e-9,
            `${message}: [${row}][${col}] was ${actual[row][col]}, expected ${expected[row][col]}`,
          );
        }
      }
    };

    it('places a 0° gradient exactly as measured against a real file', () => {
      // `.reference/figma/measured_behaviour.md` §6: a GRADIENT_LINEAR paint
      // given [[1,0,0],[0,1,0]] reads back unchanged and runs left to right
      // across the whole layer. That is the one case with ground truth, so it
      // is the anchor.
      //
      // The old transform scaled by ½, so the layer sampled only the ramp's
      // second half: this gradient rendered entirely between #0059b2 and
      // #004d99, and #0066cc appeared nowhere on the shape.
      closeTo(
        transformFor(0),
        [
          [1, 0, 0],
          [0, 1, 0],
        ],
        '0°',
      );
    });

    it('reverses the gradient at 180°', () => {
      closeTo(
        transformFor('180deg'),
        [
          [-1, 0, 1],
          [0, -1, 1],
        ],
        '180°',
      );
    });

    it('turns the gradient at 90°', () => {
      closeTo(
        transformFor('90deg'),
        [
          [0, -1, 1],
          [1, 0, 0],
        ],
        '90°',
      );
    });

    it('leaves the stops untouched whatever the angle', () => {
      // The angle positions the ramp; it must never reorder or recolour it.
      for (const angle of [0, 45, 90, 180, 270]) {
        const props = toPaintStyleProps({
          type: 'linear',
          angle,
          stops: [
            { color: '#0066cc', position: 0 },
            { color: '#004d99', position: 1 },
          ],
        });
        const stops = (props.paints[0] as GradientPaint).gradientStops;
        assert.equal(stops[0].position, 0, `${angle}deg`);
        assert.ok(Math.abs(stops[0].color.b - 0.8) < 1e-9, `${angle}deg first stop`);
        assert.ok(Math.abs(stops[1].color.b - 0.6) < 1e-9, `${angle}deg last stop`);
      }
    });
  });
});

describe('values Figma cannot hold as written', () => {
  const typography = (extra: Record<string, unknown>) => ({
    fontFamily: ['Inter'],
    fontSize: { value: 12, unit: 'px' },
    fontWeight: 500,
    lineHeight: 1.5,
    ...extra,
  });

  it('writes a letter spacing in em, structured or as a string, as a percentage of the font size', () => {
    assert.deepEqual(toTextStyleProps(typography({ letterSpacing: { value: 0.08, unit: 'em' } })).letterSpacing, {
      unit: 'PERCENT',
      value: 8,
    });
    assert.deepEqual(toTextStyleProps(typography({ letterSpacing: '0.08em' })).letterSpacing, { unit: 'PERCENT', value: 8 });
    assert.deepEqual(toTextStyleProps(typography({ letterSpacing: { value: -0.02, unit: 'em' } })).letterSpacing, {
      unit: 'PERCENT',
      value: -2,
    });
  });

  it("leaves a typography member that is not one of Figma's fields out of the text style, without a word", () => {
    const props = toTextStyleProps(typography({ fontVariantNumeric: 'tabular-nums', tabSize: 4 }));
    assert.deepEqual(Object.keys(props).sort(), [
      'fontFamily',
      'fontSize',
      'fontStyle',
      'letterSpacing',
      'lineHeight',
      'textCase',
      'textDecoration',
    ]);
  });

  it('refuses a shadow colour or a gradient stop that is currentColor, in words', () => {
    const shadow = {
      color: 'currentColor',
      offsetX: { value: 0, unit: 'px' },
      offsetY: { value: 2, unit: 'px' },
      blur: { value: 4, unit: 'px' },
    };
    assert.throws(() => toEffectStyleProps(shadow), /currentColor, which Figma cannot hold/);
    assert.throws(
      () => toEffectStyleProps([{ ...shadow, color: { colorSpace: 'srgb', components: [0, 0, 0] } }, shadow]),
      /currentColor, which Figma cannot hold/,
    );
    assert.throws(
      () =>
        toPaintStyleProps([
          { color: { colorSpace: 'srgb', components: [1, 0, 0] }, position: 0 },
          { color: 'currentColor', position: 1 },
        ]),
      /currentColor, which Figma cannot hold/,
    );
  });

  it('writes transparent, which lib stores structured, at alpha 0 with no special case', () => {
    const clear = { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0, hex: '#00000000' };
    const [effect] = toEffectStyleProps({
      color: clear,
      offsetX: { value: 0, unit: 'px' },
      offsetY: { value: 2, unit: 'px' },
      blur: { value: 4, unit: 'px' },
    }).effects;
    assert.deepEqual((effect as DropShadowEffect).color, { r: 0, g: 0, b: 0, a: 0 });
  });
});
