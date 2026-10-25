/**
 * `toghen-figma members <entry.json>… <file>… [--name <name>] [--overrides <map.json>] [--input <document>]`: each file
 * read and expanded against the design system, printed as JSON, with no plugin and no Figma file.
 *
 * The reader is the one every run uses (`readComponentText`, `main/components/file.ts`): the members are what a build
 * would make, in the plain model `reference.md` owns (*Component files*). It is for a tool that draws a file's members
 * somewhere Toghen does not, which then reads them here rather than through Toghen's own modules.
 */

import { Resolver } from '@toghen/lib';
import { resolve } from 'node:path';
import { readComponentText } from '../main/components/file.js';
import { resolveSumModes } from '../main/utils/resolverModes.js';
import { entryLabel, readInputs, readSource, type Io, type LoadArguments } from './run.js';

export interface MembersArguments extends LoadArguments {
  /** A resolver document, one token file, or several in order. */
  entry: string | string[];
  files: string[];
  input?: string;
}

/** Prints `[{file, component, artboard?, members, problems}]` on the standard output. 1 when a file has an error, or cannot be read. */
export async function members(args: MembersArguments, io: Io): Promise<number> {
  let design: Resolver;
  try {
    design = new Resolver((await readSource(args.entry, io, args)).document);
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
  const out: unknown[] = [];
  let failed = false;
  for (const file of args.files) {
    let text: string;
    try {
      text = io.readFile(resolve(io.cwd, file));
    } catch (error) {
      io.stderr(`${file} cannot be read: ${(error as Error).message}\n`);
      failed = true;
      continue;
    }
    const read = readComponentText(text, inputs, design);
    if (read.problems.some((problem) => problem.severity === 'error')) failed = true;
    out.push({
      file,
      component: read.component,
      ...(read.artboard ? { artboard: true } : {}),
      members: read.members,
      problems: read.problems,
    });
  }
  io.stdout(`${JSON.stringify(out, null, 1)}\n`);
  return failed ? 1 : 0;
}
