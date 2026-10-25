/**
 * A font stack is a fallback in Figma too: a text style takes the first family
 * of the stack that Figma lists with the style asked for, as CSS takes the first
 * the platform has. The generic families are CSS keywords, never in Figma's
 * list, so they are named but not looked up.
 */

const GENERIC_FAMILIES: ReadonlySet<string> = new Set([
  'monospace',
  'serif',
  'sans-serif',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-monospace',
  'ui-sans-serif',
  'ui-serif',
  'ui-rounded',
]);

const keyOf = (family: string, style: string): string => `${family}\u0000${style}`;

/** The fonts Figma lists, as a lookup by family and style. Read once per plan. */
export async function listFonts(): Promise<ReadonlySet<string>> {
  const fonts = await figma.listAvailableFontsAsync();
  return new Set(fonts.map(({ fontName }) => keyOf(fontName.family, fontName.style)));
}

export interface FontChoice {
  family: string;
  /** The families before it that were passed over, in stack order. */
  passedOver: string[];
}

/** The first family that is listed with `style`, or nothing when none is. */
export function chooseFamily(stack: readonly string[], style: string, listed: ReadonlySet<string>): FontChoice | undefined {
  const at = stack.findIndex((family) => !GENERIC_FAMILIES.has(family.toLowerCase()) && listed.has(keyOf(family, style)));
  return at < 0 ? undefined : { family: stack[at], passedOver: stack.slice(0, at) };
}

/** `"a"`, `"a" and "b"`, `"a", "b" and "c"`. */
function quoted(names: readonly string[]): string {
  const all = names.map((name) => `"${name}"`);
  return all.length < 2 ? all.join('') : `${all.slice(0, -1).join(', ')} and ${all[all.length - 1]}`;
}

const areNotAvailable = (names: readonly string[]): string => `${quoted(names)} ${names.length === 1 ? 'is' : 'are'} not available`;

/** What a style that fell back to a later family says. */
export function fallbackNote(path: string, choice: FontChoice): string {
  return `"${path}" uses "${choice.family}": ${areNotAvailable(choice.passedOver)} in Figma.`;
}

/** Why a style none of whose families loads is skipped. */
export function noFamilyReason(path: string, stack: readonly string[]): string {
  return `"${path}" has no family Figma can load: ${areNotAvailable(stack)}.`;
}
