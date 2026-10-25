/**
 * `toghen-figma check <entry.json>… <file>… [--name <name>] [--overrides <map.json>] [--input <document>]`: the files
 * read against the design system, with no plugin and no Figma file.
 *
 * It is the plugin's own check (`checkComponents`, `main/components/file.ts`), given the resolver built here in Node, from
 * the document the core's `load` returned, as the plugin builds it when a document is loaded. What only Figma holds,
 * whether a variable already exists or is ambiguous between collections, is the dry run's to say.
 */

import { Resolver } from '@toghen/lib';
import { resolve } from 'node:path';
import { checkComponents } from '../main/components/file.js';
import { resolveSumModes } from '../main/utils/resolverModes.js';
import { entryLabel, readInputs, readSource, type Io, type LoadArguments } from './run.js';

export interface CheckArguments extends LoadArguments {
  /** A resolver document, one token file, or several in order. */
  entry: string | string[];
  files: string[];
  input?: string;
}

/** Prints every problem, one per line, and returns the exit code: 0 when no file has an error, 1 otherwise. */
export async function check(args: CheckArguments, io: Io): Promise<number> {
  let design: Resolver;
  try {
    design = new Resolver((await readSource(args.entry, io, args)).document);
    // As the plugin does when it loads a document: the sum, which refuses a modifier with no default.
    resolveSumModes(design);
  } catch (error) {
    io.stderr(`${entryLabel(args.entry)}: ${(error as Error).message}\n`);
    return 1;
  }
  let inputs: Record<string, unknown> | undefined;
  if (args.input !== undefined) {
    try {
      inputs = await readInputs(args.input, io);
    } catch (error) {
      io.stderr(`${args.input}: ${(error as Error).message}\n`);
      return 1;
    }
  }
  const files: { fileName: string; text: string }[] = [];
  let unreadable = false;
  for (const file of args.files) {
    try {
      files.push({ fileName: file, text: io.readFile(resolve(io.cwd, file)) });
    } catch (error) {
      io.stderr(`${file} cannot be read: ${(error as Error).message}\n`);
      unreadable = true;
    }
  }
  if (unreadable) return 1;

  const { errors, warnings } = checkComponents(files, { names: true, ...(inputs ? { inputs } : {}) }, design);
  for (const line of [...errors, ...warnings]) io.stderr(`${line}\n`);
  const noun = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  io.stdout(
    `${noun(files.length, 'file')} read: ${errors.length === 0 ? 'no errors' : noun(errors.length, 'error')}${warnings.length > 0 ? `, ${noun(warnings.length, 'warning')}` : ''}\n`,
  );
  return errors.length === 0 ? 0 : 1;
}
