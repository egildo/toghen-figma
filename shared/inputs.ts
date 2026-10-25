/**
 * The data an artboard file is evaluated with: a resolver document, resolved at its defaults.
 *
 * The document is the design system's own format, read by `@toghen/lib` (the command line bundles its files first,
 * as it does for the design system). Its tokens are the data: each one's resolved `$value`, nested by path, so
 * `title` is `inputs.title` and `ds.size.md` is `inputs.ds.size.md`. A token whose `$value` is a list of records
 * gives a list, and a reference inside a record is resolved by the library, like any other, so the data can point at
 * the design system's tokens when the document's sources include them. Every modifier is resolved at its default context.
 */

import { Resolver } from '@toghen/lib';

const COLLECTION = 'inputs';

/** The resolved tokens of a resolver document, nested by path. Throws, saying what is wrong with the document, when it cannot be resolved. */
export function inputsFromDocument(document: unknown): Record<string, unknown> {
  let system: ReturnType<Resolver['resolveToDesignSystem']>;
  try {
    // The defaults of every modifier: `{}` selects nothing, and each modifier takes its own default (one with none is refused).
    system = new Resolver(document as ConstructorParameters<typeof Resolver>[0]).resolveToDesignSystem({}, undefined, COLLECTION);
  } catch (error) {
    throw new Error(`is not a resolver document that resolves: ${(error as Error).message}`);
  }
  const collection = system.getCollection(COLLECTION);
  const inputs: Record<string, unknown> = {};
  for (const path of collection?.getAllPaths() ?? []) {
    let value: unknown;
    try {
      value = system.resolveToken(`${COLLECTION}.${path}`)?.$value;
    } catch (error) {
      throw new Error(`token "${path}" does not resolve: ${(error as Error).message}`);
    }
    // The library keeps a token and a group of one name apart (the token wins), so a path never meets a value on the way down.
    const names = path.split('.');
    let into = inputs;
    for (const name of names.slice(0, -1)) into = (into[name] ??= {}) as Record<string, unknown>;
    into[names[names.length - 1]] = value;
  }
  return inputs;
}
