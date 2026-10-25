/**
 * The functions that spell the Figma name a token path becomes.
 *
 * Variable sync writes a variable, and the component engine looks one up, by this
 * name, so both call it and nothing else. It lives in a module of its own, and
 * `correspondence.ts` re-exports it, so that the component script, which bundles
 * only the engine, does not carry the sync comparison and its dependencies with it.
 *
 * A name has no collection in it: the variable lives in a collection, and a
 * component file writes `{space.md}`, not `{ds.space.md}`. So the path these take
 * is a *reference path*, the token's path without the collection segment, and
 * lib's `referencePath()` turns a lookup path into one. Keys keep their spelling:
 * `button.backgroundColor` is `button/backgroundColor`.
 */
export function tokenPathToVariableName(path: string, separator = '/'): string {
  return path.replace(/\./g, separator);
}

/**
 * A chain link's variable name: the token's name, `--`, the modifier.
 *
 * The head of a chain lives in another collection under the bare name, and a
 * name found in two collections stops a component build, so a link needs the
 * suffix. It is the CSS adapter's link rule, so one rule names a link in both targets.
 */
export function linkVariableName(path: string, modifier: string): string {
  return `${tokenPathToVariableName(path)}--${modifier}`;
}
