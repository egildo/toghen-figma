import { normalizeColorToSRGB01, normalizeDimensionToPx, fontFamilyNames, type ColorValue, type DimensionValue } from '@toghen/lib';

const EPSILON = 1e-9;

/**
 * The spec models fontFamily as an ordered fallback stack, and `@toghen/lib`
 * preserves it as an array — §9.1 forbids collapsing it during resolution.
 * This is the stack as a list of names, however it was written.
 */
export function fontStack(fontFamily: unknown): string[] {
  if (Array.isArray(fontFamily) || (typeof fontFamily === 'string' && fontFamily.trim())) {
    return fontFamilyNames(fontFamily).map(String);
  }
  return [String(fontFamily ?? '')];
}

/**
 * Figma names exactly one family, in a STRING variable: the stack's first.
 * A text style may take a later one (`utils/fontStack.ts`), but the variable
 * keeps the token's meaning and does not depend on the machine that ran the sync.
 */
export function toFigmaFontFamily(fontFamily: unknown): string {
  return fontStack(fontFamily)[0] ?? '';
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function toHexByte(value: number): string {
  return Math.round(clamp01(value) * 255)
    .toString(16)
    .padStart(2, '0');
}

/**
 * Converts a token colour to Figma's `RGBA`.
 *
 * Figma's `RGB`/`RGBA` channels are **sRGB** 0–1 — the same encoding the colour
 * picker shows and the same one `normalizeColorToSRGB01()` produces. So this is
 * a pass-through, and that is the whole point: this function used to apply the
 * sRGB→linear transfer curve on top, which shipped every mid-tone several stops
 * too dark (`#808080` became `#373737`).
 *
 * It also disagreed with `figmaStyleAdapter`, which has always written shadow
 * and gradient colours as plain sRGB — so one token value rendered two
 * different ways in the same file depending on where it landed.
 *
 * `clamp01` stays: culori can return slightly out-of-gamut channels when
 * converting from wider spaces such as `lab` or `oklch`, and Figma rejects
 * values outside 0–1.
 *
 * ### Known limitation: Display P3 documents
 *
 * Figma's channels are gamma-encoded **in the document's colour profile**, not
 * unconditionally sRGB: *"All colors are specified in the same color space
 * which will be the color profile of the document, `documentColorProfile`."*
 * In a default (sRGB) document these are ordinary sRGB values and this
 * pass-through is exact. In a **Display P3** document the same numbers are read
 * as P3 coordinates, so an sRGB token would land slightly more saturated.
 *
 * Handling that means reading `figma.root.documentColorProfile` and converting
 * sRGB→P3 when it is `DISPLAY_P3`. Not done here: it needs its own decision
 * about which profile a token document is authored in, and the error is far
 * smaller than the sRGB→linear conversion this replaced.
 *
 * Since Update 141 a paint, a gradient stop and an effect colour may carry a
 * `sourceColor` (sRGB, Display P3, OKLCH and others) beside `r`/`g`/`b`, which
 * stay the profile's projection. That could carry a token's `colorSpace` as
 * authored, for paints and effects; Figma documents nothing of the kind for
 * variables. Not used here.
 */
function toFigmaRgba(value: string | ColorValue): RGBA {
  const srgb = normalizeColorToSRGB01(value);
  return {
    r: clamp01(srgb.r),
    g: clamp01(srgb.g),
    b: clamp01(srgb.b),
    a: clamp01(srgb.a),
  };
}

/**
 * What a number is in Figma: `percent` for an opacity, which a variable bound to a layer's opacity holds as a
 * percentage (`55` is 55%, drawn at 0.55), and nothing for every other number.
 */
export type FigmaUnit = 'percent';

/** An opacity from 0 to 1, as the percentage a Figma variable holds. Rounded to what a float can say, so 0.55 is 55 and not 55.00000000000001. */
const toPercent = (fraction: number): number => Number((fraction * 100).toPrecision(12));

/**
 * A token value in Figma's representation. `unit` says the number is an opacity: it is written × 100.
 * Both sides of a comparison (`figmaValuesEqual`) are in this representation, so they compare in percent.
 */
export function toFigmaValue(value: unknown, type: string, unit?: FigmaUnit): VariableValue {
  switch (type) {
    case 'color':
      if (
        typeof value !== 'string' &&
        (typeof value !== 'object' || value === null || !('colorSpace' in value) || !('components' in value))
      ) {
        throw new Error(`Unsupported color value format: ${JSON.stringify(value)}`);
      }
      return toFigmaRgba(value as string | ColorValue);

    case 'dimension':
      // The library does the unit arithmetic, and throws on a non-dimension.
      return normalizeDimensionToPx(value as DimensionValue);

    case 'letterSpacing':
      // Figma binds a number to letter spacing as pixels. `em` has none: sum.ts reports it before it gets here.
      if (typeof value === 'object' && value !== null && (value as { unit?: unknown }).unit === 'em') {
        throw new Error('A letter spacing in em has no pixel value without a font size.');
      }
      return normalizeDimensionToPx(value as DimensionValue);

    case 'number':
    case 'fontWeight': {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        throw new Error(`Cannot convert value "${String(value)}" to number.`);
      }
      return unit === 'percent' && type === 'number' ? toPercent(numeric) : numeric;
    }

    case 'string':
      return String(value);

    case 'fontFamily':
      return toFigmaFontFamily(value);

    case 'boolean':
      return Boolean(value);

    default:
      throw new Error(`Cannot convert type "${type}" to a Figma Variable value.`);
  }
}

/**
 * Relative tolerance for comparing two numbers Figma has stored.
 *
 * **Figma stores float32.** Measured: `0.4` reads back as `0.4000000059604645`
 * and a PERCENT line height of `160` as `160.0000023841858` — see
 * `.reference/figma/measured_behaviour.md`. So a value written and read back is
 * never bit-identical to the one sent, and comparing with `===` would report
 * every token in the file as changed.
 *
 * The tolerance is **relative** because the error is. float32 carries a 24-bit
 * mantissa, so its relative epsilon is ~1.19e-7; an absolute tolerance tuned for
 * a colour channel in 0–1 would be far too tight for a `9999px` radius.
 */
const FLOAT32_RELATIVE_TOLERANCE = 1e-6;
/** Floor for values at or near zero, where a relative tolerance vanishes. */
const NEAR_ZERO_TOLERANCE = 1e-9;

export function numbersEqual(a: number, b: number): boolean {
  if (a === b) return true;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;

  const scale = Math.max(Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= Math.max(NEAR_ZERO_TOLERANCE, FLOAT32_RELATIVE_TOLERANCE * scale);
}

function isRgbLike(value: unknown): value is RGBA {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as RGB).r === 'number' &&
    typeof (value as RGB).g === 'number' &&
    typeof (value as RGB).b === 'number'
  );
}

export function isAlias(value: unknown): value is VariableAlias {
  return typeof value === 'object' && value !== null && (value as VariableAlias).type === 'VARIABLE_ALIAS';
}

/**
 * Whether two Figma variable values are the same value.
 *
 * Both sides must already be in **Figma's** representation. Do not compare by
 * round-tripping through `fromFigmaValue()`: that is lossy by design — a
 * `{colorSpace, components}` token becomes a hex string on the way back — so a
 * comparison made there would report differences that do not exist.
 *
 * An alias never equals a concrete value. A designer pointing a variable at
 * another variable really has changed it, and saying so is the honest answer.
 */
export function figmaValuesEqual(a: VariableValue | undefined, b: VariableValue | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;

  if (isAlias(a) || isAlias(b)) {
    return isAlias(a) && isAlias(b) && a.id === b.id;
  }

  if (typeof a === 'number' && typeof b === 'number') {
    return numbersEqual(a, b);
  }

  if (isRgbLike(a) && isRgbLike(b)) {
    // Alpha is optional on RGB; Figma treats an absent alpha as opaque.
    return numbersEqual(a.r, b.r) && numbersEqual(a.g, b.g) && numbersEqual(a.b, b.b) && numbersEqual(a.a ?? 1, b.a ?? 1);
  }

  return a === b;
}

/**
 * Turns a value Figma holds back into something readable.
 *
 * **The alias case is checked before the type**, and that ordering is the whole
 * of it: a `VariableAlias` is an object with no `r`/`g`/`b`, so a COLOR variable
 * pointed at another variable would fall through `clamp01(undefined ?? 0)` and
 * read back as a confident `#000000`. A silently wrong value is worse than an
 * unreadable one — this is the only place in the plugin where a Figma value is
 * shown to a person rather than compared, so it is the only place that mistake
 * would be believed.
 *
 * The alias's target name is not knowable here. `resolveAliasName` is how the
 * caller — which holds the variable index — supplies it; without one the id is
 * shown, which is at least true.
 */
export function fromFigmaValue(
  value: VariableValue,
  type: VariableResolvedDataType,
  resolveAliasName?: (variableId: string) => string | undefined,
): unknown {
  if (isAlias(value)) {
    return `→ ${resolveAliasName?.(value.id) ?? value.id}`;
  }

  switch (type) {
    case 'COLOR': {
      const color = value as RGBA;
      // Figma channels are already sRGB — see toFigmaRgba().
      const r = clamp01(color.r ?? 0);
      const g = clamp01(color.g ?? 0);
      const b = clamp01(color.b ?? 0);
      const a = clamp01(color.a ?? 1);

      const hex = `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
      const alphaHex = toHexByte(a);
      return Math.abs(a - 1) < EPSILON ? hex : `${hex}${alphaHex}`;
    }
    case 'FLOAT':
    case 'STRING':
    case 'BOOLEAN':
      return value;
    default:
      return value;
  }
}
