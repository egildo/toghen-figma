/**
 * The stamps the variable and style syncs keep on what they write.
 *
 * A stamp (`components/stamp.ts`) lives on the object it describes: the token the object holds, and a receipt, for
 * each field Toghen owns, of what Figma reported right after Toghen wrote it. A variable's fields are its value in each
 * mode, keyed by the mode's id, and `scopes`; a style's are the properties a style plan writes (`reportOf`). What
 * Figma reports now against the receipt says whether anyone changed the object since (drift); where nobody did, the
 * document against what Figma holds says whether the document moved.
 *
 * Kept on the object, a receipt cannot be carried onto another one, which a record keyed by token path on the
 * document root could (decisions, *Ruled: the stamp, one receipt per object, for every target*). Older builds kept
 * that record; `rootRecord.ts` turns it into stamps, once.
 */

import { getStamp, receiptOf, setStamp, sortOut, type Stamp, type Stamped } from '../components/stamp.js';

/** Adds to an object's receipt what Figma reports for the fields just written. A stamp for another token starts again. */
export function stampWritten(object: Stamped, token: string, reported: Record<string, unknown>): void {
  const held = getStamp(object);
  const receipt = held?.is.token === token ? held.receipt : {};
  setStamp(object, { is: { token }, receipt: { ...receipt, ...receiptOf(reported) } });
}

/** Scopes as a receipt hashes them: Figma keeps them in an order of its own, and they compare as a set. */
export const reportedScopes = (scopes: readonly VariableScope[]): VariableScope[] => [...scopes].sort();

/** What Figma reports for the properties a style plan writes: what a style's receipt hashes, field by field. */
export function reportOf(style: BaseStyle): Record<string, unknown> {
  switch (style.type) {
    case 'TEXT': {
      const text = style as TextStyle;
      return {
        // Figma reads a font back with variation settings nobody set (measured 20 October 2026): a style holds its family and style.
        fontName: { family: text.fontName.family, style: text.fontName.style },
        fontSize: text.fontSize,
        lineHeight: text.lineHeight,
        letterSpacing: text.letterSpacing,
        textCase: text.textCase,
        textDecoration: text.textDecoration,
        boundVariables: text.boundVariables,
      };
    }
    case 'EFFECT':
      return { effects: (style as EffectStyle).effects };
    case 'PAINT':
      return { paints: (style as PaintStyle).paints };
    default:
      return {};
  }
}

export type StyleKind = 'TEXT' | 'EFFECT' | 'PAINT';

/** A local style, with its stamp when it is Toghen's. */
export interface LocalStyle {
  style: BaseStyle;
  styleType: StyleKind;
  /** Absent on a style Toghen did not write, and on a person's copy of one. */
  stamp?: Stamp;
  /** The style moved: its stamp names another id, which the next write replaces with its own. */
  moved?: true;
  /** A person's copy of a style Toghen wrote: the original. It carries the original's stamp, which is not read as its own. */
  copyOf?: BaseStyle;
}

/** The file's local styles, each with its stamp when it is Toghen's, and each copy of one with its original (`sortOut`). */
export async function localStyles(): Promise<LocalStyle[]> {
  const [text, effect, paint] = await Promise.all([
    figma.getLocalTextStylesAsync(),
    figma.getLocalEffectStylesAsync(),
    figma.getLocalPaintStylesAsync(),
  ]);
  const all = [
    ...text.map((style) => ({ style, styleType: 'TEXT' as const })),
    ...effect.map((style) => ({ style, styleType: 'EFFECT' as const })),
    ...paint.map((style) => ({ style, styleType: 'PAINT' as const })),
  ];
  const byId = new Map<string, BaseStyle>(all.map(({ style }) => [style.id, style]));
  const sorted = await sortOut(
    all.map(({ style }) => style),
    getStamp,
    (id) => byId.get(id),
  );
  const copyOf = new Map(sorted.copies.map(({ copy, of }) => [copy, of]));
  return all.map(({ style, styleType }) => {
    const of = copyOf.get(style);
    if (of) return { style, styleType, copyOf: of };
    const stamp = getStamp(style);
    return { style, styleType, ...(stamp ? { stamp } : {}), ...(sorted.moved.has(style) ? { moved: true as const } : {}) };
  });
}
