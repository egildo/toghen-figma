import {
  normalizeColorToSRGB01,
  normalizeDimensionToPx,
  normalizeGradient,
  normalizeLineHeight,
  type DimensionValue,
  type GradientKind,
  type GradientValue,
  type ShadowValue,
  type TypographyValue,
} from '@toghen/lib';
import { toFigmaFontFamily } from './figmaTokenAdapter.js';

export interface TextStyleProps {
  fontFamily: string;
  fontStyle: string;
  fontSize: number;
  lineHeight: LineHeight;
  letterSpacing: LetterSpacing;
  textCase: TextCase;
  textDecoration: TextDecoration;
}

export interface EffectStyleProps {
  effects: Effect[];
}

export interface PaintStyleProps {
  paints: Paint[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * A length in pixels. The unit arithmetic is the library's, and so is the
 * check: `normalizeDimensionToPx()` throws on anything that is not a dimension,
 * which is why the cast below claims nothing it cannot back.
 */
function toPx(value: unknown): number {
  return normalizeDimensionToPx(value as DimensionValue);
}

/**
 * Converts a W3C `lineHeight` to Figma's `LineHeight`.
 *
 * The library reads the value; this only reshapes it. The case that matters is
 * the **unitless multiplier** — `1.5`, the W3C form and the one the demo uses.
 * It is a ratio of the font size, which Figma expresses as PERCENT. Sending it
 * down the PIXELS branch, as this once did, sets a 1.5 *pixel* line height and
 * collapses the text. A length, `'24px'` or `{value, unit}`, stays in PIXELS.
 *
 * `'normal'` is not a W3C value and the library rejects it, but it has an exact
 * Figma counterpart — AUTO, the font's own leading — so it is mapped here.
 */
export function toFigmaLineHeight(value: unknown): LineHeight {
  if (typeof value === 'string' && value.trim().toLowerCase() === 'normal') {
    return { unit: 'AUTO' };
  }

  const lineHeight = normalizeLineHeight(value as TypographyValue['lineHeight']);
  switch (lineHeight.unit) {
    case 'ratio':
      return { unit: 'PERCENT', value: lineHeight.value * 100 };
    case 'percent':
      return { unit: 'PERCENT', value: lineHeight.value };
    case 'px':
      return { unit: 'PIXELS', value: lineHeight.value };
  }
}

/**
 * Converts a W3C `letterSpacing` to Figma's `LetterSpacing`.
 *
 * A W3C letterSpacing is a dimension, and goes to PIXELS through the library.
 * `em` and `%` are not W3C units, but they are how letter spacing is usually
 * written, and both are proportional to the font size — which Figma expresses
 * as PERCENT, `1em` being 100%. This once hardcoded PIXELS, so `'0.05em'`
 * became 0.05px (imperceptible, when 0.8px was meant) and `'5%'` became 5px.
 *
 * An absent letterSpacing is 0, as the library's `getLetterSpacingPx()` has it.
 */
export function toFigmaLetterSpacing(value: unknown): LetterSpacing {
  if (value === undefined) {
    return { unit: 'PIXELS', value: 0 };
  }

  // `{ value, unit: 'em' }`, the structured form of the string below.
  if (isObject(value) && value.unit === 'em' && typeof value.value === 'number' && Number.isFinite(value.value)) {
    return { unit: 'PERCENT', value: value.value * 100 };
  }

  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    const suffix = text.endsWith('%') ? '%' : text.endsWith('em') && !text.endsWith('rem') ? 'em' : '';
    if (suffix) {
      const amount = Number(text.slice(0, -suffix.length) || NaN);
      if (!Number.isFinite(amount)) {
        throw new Error(`Invalid letterSpacing '${value}'.`);
      }
      return { unit: 'PERCENT', value: suffix === 'em' ? amount * 100 : amount };
    }
  }

  return { unit: 'PIXELS', value: toPx(value) };
}

function normalizeTextCase(value: unknown): TextCase {
  if (typeof value !== 'string') return 'ORIGINAL';
  switch (value.trim().toLowerCase()) {
    case 'uppercase':
      return 'UPPER';
    case 'lowercase':
      return 'LOWER';
    case 'capitalize':
      return 'TITLE';
    default:
      return 'ORIGINAL';
  }
}

function normalizeTextDecoration(value: unknown): TextDecoration {
  if (typeof value !== 'string') return 'NONE';
  switch (value.trim().toLowerCase()) {
    case 'underline':
      return 'UNDERLINE';
    case 'line-through':
    case 'strikethrough':
      return 'STRIKETHROUGH';
    default:
      return 'NONE';
  }
}

/**
 * Positions a linear gradient within a layer, rotated by `angleDeg`.
 *
 * A rotation about the layer's centre — `translate(½,½) ∘ rotate(θ) ∘
 * translate(−½,−½)` — and nothing else:
 *
 * ```
 * ⎡ cosθ  −sinθ   ½ − ½cosθ + ½sinθ ⎤
 * ⎣ sinθ   cosθ   ½ − ½sinθ − ½cosθ ⎦
 * ```
 *
 * At 0° that is exactly `[[1,0,0],[0,1,0]]`, the transform measured against a
 * real file for a full-width left-to-right gradient — see
 * `.reference/figma/measured_behaviour.md` §6. That identity is the anchor, and
 * the test asserts it.
 *
 * This used to scale by ½ as well, so the layer sampled only the ramp's second
 * half: a `#0066cc → #004d99` gradient rendered entirely between `#0059b2` and
 * `#004d99`, with its first stop appearing nowhere on the shape. It went
 * unnoticed because nothing tested the function and the probe only ever
 * round-tripped a hand-written transform.
 *
 * ### Unmeasured
 *
 * At angles that are not multiples of 90° the gradient's extent along the
 * diagonal exceeds the unit square, so a 45° gradient does not span corner to
 * corner the way a CSS `linear-gradient` does. Correcting that needs a
 * measurement of Figma's convention rather than more arithmetic. The W3C array
 * form is always 0°, so no spec-conformant gradient is affected today.
 */
function angleToLinearTransform(angleDeg: number): Transform {
  const radians = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return [
    [cos, -sin, 0.5 - 0.5 * cos + 0.5 * sin],
    [sin, cos, 0.5 - 0.5 * sin - 0.5 * cos],
  ];
}

export function toTextStyleProps(value: unknown): TextStyleProps {
  if (!isObject(value)) {
    throw new Error('Typography token value must be an object.');
  }

  // No cast: every reader below accepts `unknown` and narrows for itself — the
  // dimensions through the library, which throws on a value it cannot read — so
  // asserting the shape here would only be a claim we cannot back.
  return {
    fontFamily: toFigmaFontFamily(value.fontFamily),
    fontStyle: String(value.fontStyle ?? 'Regular'),
    fontSize: toPx(value.fontSize),
    lineHeight: toFigmaLineHeight(value.lineHeight),
    letterSpacing: toFigmaLetterSpacing(value.letterSpacing),
    textCase: normalizeTextCase(value.textTransform),
    textDecoration: normalizeTextDecoration(value.textDecoration),
  };
}

/**
 * `currentColor` has no value until an element uses it, and Figma has no equivalent, so a style holding it
 * (a shadow's colour, a gradient stop) cannot be built. Said in words rather than as the colour
 * parser's complaint about a string that is not hex.
 */
function refuseCurrentColor(value: unknown): void {
  if (typeof value === 'string' && value.trim().toLowerCase() === 'currentcolor') {
    throw new Error('it holds currentColor, which Figma cannot hold.');
  }
  if (isObject(value) || Array.isArray(value)) {
    Object.values(value).forEach(refuseCurrentColor);
  }
}

export function toEffectStyleProps(value: unknown): EffectStyleProps {
  refuseCurrentColor(value);
  const list = Array.isArray(value) ? value : [value];

  const effects: Effect[] = list.map((raw) => {
    if (!isObject(raw)) {
      throw new Error('Shadow token value must be an object or array of objects.');
    }

    const color = normalizeColorToSRGB01(raw.color as ShadowValue['color']);

    return {
      type: raw.inset ? 'INNER_SHADOW' : 'DROP_SHADOW',
      color,
      offset: {
        x: toPx(raw.offsetX),
        y: toPx(raw.offsetY),
      },
      radius: toPx(raw.blur),
      spread: raw.spread === undefined ? 0 : toPx(raw.spread),
      visible: true,
      blendMode: 'NORMAL',
    };
  });

  return { effects };
}

const GRADIENT_PAINT_TYPE: Record<GradientKind, GradientPaint['type']> = {
  linear: 'GRADIENT_LINEAR',
  radial: 'GRADIENT_RADIAL',
  angular: 'GRADIENT_ANGULAR',
  conic: 'GRADIENT_ANGULAR',
};

export function toPaintStyleProps(value: unknown): PaintStyleProps {
  refuseCurrentColor(value);
  // `normalizeGradient` accepts both gradient forms — the W3C array of stops
  // (§9.7) and Toghen's object form. This used to require the object form and
  // reject arrays outright, which made every spec-conformant gradient token
  // throw before a single operation was planned.
  const gradient = normalizeGradient(value as GradientValue);

  const paint: GradientPaint = {
    type: GRADIENT_PAINT_TYPE[gradient.type],
    gradientStops: gradient.stops.map((stop) => ({
      position: stop.position,
      color: stop.color,
    })),
    gradientTransform: angleToLinearTransform(gradient.angleDeg),
    visible: true,
    opacity: 1,
    blendMode: 'NORMAL',
  };

  return {
    paints: [paint],
  };
}
