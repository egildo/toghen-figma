/**
 * The one way a component file reaches Figma: its text and its file name.
 *
 * The command line sends them, and the Templates pane keeps them in the file and
 * sends them again; both end here. The plugin reads the KDL, evaluates it with
 * kdlet once per member, validates, and then snapshots, diffs and applies
 * (`run.ts`). A problem with the file is a `ComponentRunError` whose reasons are
 * `<file>:<line>:<column> <message>`, so the person is told where it is, on the
 * screen or in the terminal.
 *
 * The axes a file reads from the tokens (`(modifier)`) and its `tokens=` groups are
 * answered from the resolver document the plugin has loaded; a file that needs one
 * with none loaded is refused, naming what it needs (`shared/components/axes.ts`).
 */

import type { Collection, Part, Resolver } from '@toghen/lib';
import { readBlueprint, readComponentFile } from '../../shared/components/index.js';
import type { Blueprint, ComponentFile, Desired, Layer, Problem, RunOptions, Step } from '../../shared/components/index.js';
import type { CompactReport, StepSummary } from '../../shared/components/steps.js';
import { getState } from '../runtimeState.js';
import { designSourceOf } from '../utils/designSource.js';
import { defaultTokenTypeMap } from '../../shared/tokenTypeMap.js';
import { setUnfolded } from '../utils/folds.js';
import { figmaCollectionNameFor, resolveSumModes } from '../utils/resolverModes.js';
import { buildSum, type Sum } from '../utils/sum.js';
import { ComponentRunError } from './errors.js';
import { namedComponents, namedTokens } from './resolve.js';
import { run } from './run.js';

// kdlet reads a record's fields with Object.hasOwn (ES2022), and the plugin sandbox is built for ES2017: make sure it is there.
const sandbox = Object as { hasOwn?: unknown };
if (!sandbox.hasOwn) {
  Object.defineProperty(Object, 'hasOwn', {
    value: (object: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(object, key),
    configurable: true,
    writable: true,
  });
}

/** `<file>:<line>:<column> <message>`, the shape editors and terminals make a link of. */
export function describe(fileName: string, problem: Problem): string {
  const place = problem.line !== undefined ? `${fileName}:${problem.line}:${problem.column ?? 1}` : fileName;
  return `${place} ${problem.severity === 'warning' ? 'warning: ' : ''}${problem.member !== undefined ? `[${problem.member}] ` : ''}${problem.message}`;
}

/**
 * Reads a file against the loaded design system, when there is one. An artboard file (an `artboard` node at the top) is
 * read against `inputs`, the data the command line resolved; a component file takes none.
 */
export function readComponentText(
  text: string,
  inputs?: Record<string, unknown>,
  resolver: Resolver | null = getState().resolver,
): ComponentFile {
  return readComponentFile(text, resolver ? designSourceOf(resolver) : undefined, inputs);
}

/** Reads a blueprint as {@link readComponentText} reads a file: each body against the loaded design system and `inputs`. */
export function readBlueprintText(
  text: string,
  inputs?: Record<string, unknown>,
  resolver: Resolver | null = getState().resolver,
): Blueprint {
  return readBlueprint(text, resolver ? designSourceOf(resolver) : undefined, inputs);
}

/** A file named for one kind that holds the other, which is a mistake the name makes plain. */
function wrongKind(read: ComponentFile, fileName: string): string | undefined {
  if (read.artboard && /\.component\.kdl$/.test(fileName)) return `${fileName}: named as a component file, but it holds an artboard`;
  if (!read.artboard && read.component && /\.artboard\.kdl$/.test(fileName))
    return `${fileName}: named as an artboard file, but it holds a component`;
  return undefined;
}

/** What stops a file from being used: every error, with its place, or why there is no component at all. */
export function readErrors(read: ComponentFile, fileName: string): string[] {
  const errors = read.problems.filter((problem) => problem.severity === 'error');
  const kind = wrongKind(read, fileName);
  if (kind) return [kind, ...errors.map((problem) => describe(fileName, problem))];
  if (read.component && read.document && errors.length === 0) return [];
  return errors.length > 0
    ? errors.map((problem) => describe(fileName, problem))
    : [`${fileName}: ${read.artboard ? 'no artboard node' : 'no component node'}`];
}

/** What the report says of a step: what it did and to what, without the layer it carried. */
export function summarize(step: Step): StepSummary {
  const summary: StepSummary = { kind: step.kind };
  if ('member' in step) summary.member = typeof step.member === 'string' ? step.member : step.member.name;
  if (step.kind === 'DELETE_MEMBER') summary.member = step.name;
  if ('layer' in step) summary.address = step.layer.address;
  if ('address' in step) summary.address = step.address;
  if ('property' in step) summary.property = step.property.name;
  if (step.kind === 'DELETE_PROPERTY') summary.property = step.name;
  if ('changes' in step) summary.changes = step.changes;
  // A patch names the fields it writes, and the ones whose stamp it only takes again.
  if (step.kind === 'PATCH_LAYER') summary.changes = [...step.fields, ...(step.restamp ?? []).map((field) => `${field} (restamp)`)];
  if (step.kind === 'RENAME_AXIS') {
    summary.from = step.from;
    summary.to = step.to;
    summary.message = `axis "${step.from}" is renamed "${step.to}": every member keeps its node, and instances keep their value`;
  }
  if (step.kind === 'SWAP_COMPONENT') {
    summary.from = step.from;
    summary.to = step.to;
    const where = step.component === step.member ? `"${step.member}"` : `"${step.component}/${step.member}"`;
    const from =
      step.from === ''
        ? 'a component no longer in the file'
        : `"${step.from}" ${step.fromLibrary === undefined ? '(this file)' : step.fromLibrary === '' ? '(a library the lock does not name)' : `from library "${step.fromLibrary}"`}`;
    const to = `"${step.to}" ${step.library === undefined ? '(this file)' : `from library "${step.library}"`}`;
    summary.message = `"${step.address}" in ${where} swaps from ${from} to ${to}`;
  }
  if (step.kind === 'CREATE_SET') summary.members = step.members.length;
  if (step.kind === 'CREATE_ARTBOARD') {
    const count = (layer: Layer): number => 1 + layer.children.reduce((sum, child) => sum + count(child), 0);
    summary.layers = count(step.member.tree);
  }
  if ('message' in step) summary.message = step.message;
  if ('breaks' in step && step.breaks) summary.breaks = step.breaks;
  return summary;
}

/** What a file that read asks the engine for: its component, its members, and whether it is an artboard. */
export function desiredOf(read: ComponentFile): Desired {
  const { name, description, properties, across } = read.component!;
  return {
    component: { name, ...(description !== undefined ? { description } : {}), properties, ...(across !== undefined ? { across } : {}) },
    members: read.members,
    ...(read.artboard ? { artboard: true as const } : {}),
  };
}

/**
 * What each file defines and the components it names by name, for the order a run's files go in
 * (`shared/components/order.ts`). A file that does not read defines and names nothing: the check says why.
 */
export function namesOfFiles<T extends { fileName: string; text: string }>(
  files: readonly T[],
  inputs: Record<string, unknown> | undefined,
  resolver: Resolver | null,
): (T & { defines?: string; names: string[] })[] {
  return files.map((file) => {
    const read = readComponentText(file.text, inputs, resolver);
    if (!read.component || readErrors(read, file.fileName).length > 0) return { ...file, names: [] };
    return { ...file, ...(read.artboard ? {} : { defines: read.component.name }), names: namedComponents(desiredOf(read)) };
  });
}

/** Reads, evaluates and validates one component file, then makes Figma agree with it. */
export async function runComponentFile(
  text: string,
  fileName: string,
  options: RunOptions = {},
  inputs?: Record<string, unknown>,
): Promise<{ component: string; report: CompactReport }> {
  const read = readComponentText(text, inputs);
  const errors = readErrors(read, fileName);
  if (errors.length > 0 || !read.component) {
    throw new ComponentRunError(
      `${fileName} does not read: ${errors.length === 1 ? 'one problem' : `${errors.length} problems`}, and nothing was written`,
      errors,
    );
  }
  const { component } = read;
  const report = await run(desiredOf(read), options);
  // What the file warned of, and what inferring bindings from `tokens=` skipped or could not bind.
  report.notes.push(...(component.notes || []));
  report.warnings.push(
    ...read.problems.filter((problem) => problem.severity === 'warning').map((problem) => describe(fileName, problem)),
    ...(component.warnings || []),
  );
  return { component: component.name, report: { ...report, steps: report.steps.map(summarize) } };
}

/**
 * Reads every file, and with `names` checks the names each writes against the design system loaded. Returns every
 * problem of every file: nothing should be written while any file is wrong, since a design half applied is worse than none.
 * The names are the design system's definition, not Figma's: a variable a sync is about to make is a name that is defined.
 *
 * The groups the files lay out as one variable per part (`layout=parts`) are told to the loaded document, so the variable
 * sync that follows puts those components' variables where the files look for them.
 */
export function checkComponentFiles(
  files: { fileName: string; text: string }[],
  options: { names: boolean; inputs?: Record<string, unknown> },
  resolver: Resolver | null = getState().resolver,
): string[] {
  return checkComponents(files, options, resolver).errors;
}

/**
 * {@link checkComponentFiles}, and the warnings of the files too, each as `<file>:<line>:<column> warning: <message>`. The
 * plugin's check says the errors; the command with no plugin (`toghen-figma check`) says both. Given the resolver, it reads
 * nothing from the plugin's state.
 *
 * With `names`, a token the parts fold took into its rest's variable (`folds.ts`) is an error that names the rest and the
 * mode to pin: it has no variable of its own. The sum is built once, after every file's `layout=parts` is known.
 */
export function checkComponents(
  files: { fileName: string; text: string }[],
  options: { names: boolean; inputs?: Record<string, unknown> },
  resolver: Resolver | null,
): { errors: string[]; warnings: string[]; components: string[] } {
  const problems: string[] = [];
  const warnings: string[] = [];
  const unfold: string[] = [];
  const components: string[] = [];
  // Every file first: the groups laid out as one variable per part decide which parts fold, and so which names are variables.
  const reads: { fileName: string; read: ComponentFile }[] = [];
  for (const { fileName, text } of files) {
    const read = readComponentText(text, options.inputs, resolver);
    const errors = readErrors(read, fileName);
    problems.push(...errors);
    warnings.push(...read.problems.filter((problem) => problem.severity === 'warning').map((problem) => describe(fileName, problem)));
    if (read.component?.layout === 'parts' && read.component.tokens !== undefined) unfold.push(read.component.tokens);
    if (errors.length === 0 && read.component && !read.artboard) components.push(read.component.name);
    if (errors.length === 0) reads.push({ fileName, read });
  }
  if (resolver) setUnfolded(resolver, unfold);
  if (!options.names || !resolver) return { errors: problems, warnings, components };

  const { ds, dsCollectionName } = resolveSumModes(resolver);
  const tokens = ds.getCollection(dsCollectionName) as Collection;
  // The variables the sync makes, as it makes them. A document the sum cannot be built from is the variable sync's to say.
  let sum: Sum | undefined;
  try {
    sum = buildSum(resolver, figmaCollectionNameFor(resolver), defaultTokenTypeMap);
  } catch {
    sum = undefined;
  }
  // A token the fold took into its rest's variable has none of its own: the part of the axis that folded, if it is one.
  const foldedPart = (path: string): Part | undefined => {
    if (!sum || sum.tokenByPath.has(`${sum.dsName}.${path}`)) return undefined;
    const { parts, component } = tokens.partsOf(path);
    const axes = sum.layouts.find((layout) => layout.group === component)?.axes ?? [];
    return parts.find((part) => axes.some((axis) => axis.axis === part.axis && axis.folded));
  };
  for (const { fileName, read } of reads) {
    const named = namedTokens(read.members);
    for (const [what, names] of [
      ['token', named.floats],
      ['token', named.colors],
      ['token', named.effects],
      ['token', named.others],
      ['text style', named.textStyles],
      ['effect style', named.effectStyles],
    ] as const) {
      for (const [path, where] of names) {
        const place = where.loc ? `${fileName}:${where.loc.line}:${where.loc.column}` : fileName;
        const via = where.via ? ` (${where.via})` : '';
        // A token in any mode: the core says what a name is.
        if (tokens.getNodeKind(path) !== 'token') {
          problems.push(`${place} ${what} {${path}} is not in the design system "${dsCollectionName}"${via}`);
          continue;
        }
        const part = foldedPart(path);
        if (part) {
          problems.push(
            `${place} ${what} {${path}}${via} is the "${part.key}" part of "${part.twin}", which is one variable with a mode per "${part.axis}": name {${part.twin}}; the member pins the mode (a tokens= axis, or modes ${part.axis}=${part.key})`,
          );
        }
      }
    }
  }
  return { errors: problems, warnings, components };
}
