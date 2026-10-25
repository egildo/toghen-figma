/**
 * Makes Figma agree with a component file: resolve, snapshot, diff, apply.
 *
 * `desired` is a component file already read, validated and expanded
 * (`file.ts` does that, from the file's text). Everything the members name is
 * addressed by name and resolved here, and a name that does not resolve stops the
 * run before its first write: the plugin does not roll back, so the engine
 * checks everything it can foresee first.
 *
 * Run one file at a time against a Figma file: two interleave.
 */

import { diff, diffArtboard, type Receipts } from '../../shared/components/diff.js';
import type { Desired, Report, RunOptions, Step } from '../../shared/components/steps.js';
import { applyCreateArtboard, applyCreateSet, shownDefault, type Applied, type AppliedArtboard } from './apply.js';
import { noteTouched, pageOf } from './endOfRun.js';
import { ComponentRunError } from './errors.js';
import { expectedOf, type Wiring } from './receipt.js';
import { plannedValueLines } from './fieldWriter.js';
import { preferredOf, resolve, type Resolved } from './resolve.js';
import { copiesFinder, keepsNoStamp, outermost } from './stamp.js';
import { applyArtboardUpdate, applyUpdate, keepsChildren, type Updated, type UpdatedArtboard } from './update.js';
import { takeArtboardSnapshot, takeSnapshot } from './snapshot.js';

const refusal = (step: Step): step is Extract<Step, { kind: 'REFUSE_FOREIGN' }> => step.kind === 'REFUSE_FOREIGN';

/** What writes a run's steps into another file than Figma's: the command line's FigCraft target (`cli/figcraftApply.ts`). */
export interface ComponentWriter {
  createSet(step: Extract<Step, { kind: 'CREATE_SET' }>, resolved: Resolved): Promise<Applied>;
  update(setId: string, steps: Step[], desired: Desired, resolved: Resolved): Promise<Updated>;
  createArtboard(step: Extract<Step, { kind: 'CREATE_ARTBOARD' }>, resolved: Resolved): Promise<AppliedArtboard>;
  updateArtboard(frameId: string, steps: Step[], desired: Desired, resolved: Resolved): Promise<UpdatedArtboard>;
  /** What the plan needs that this writer does not build, one line each: a run, a dry run included, stops on any. */
  refuses(desired: Desired, steps: Step[], resolved: Resolved): string[];
}

let writer: ComponentWriter | undefined;

/** Sends every run's steps to `next` instead of Figma's API; `undefined` puts Figma's back. */
export function writeComponentsWith(next: ComponentWriter | undefined): void {
  writer = next;
}

/** Stops the run, before it writes or reports a plan, when the writer cannot build what the plan needs. */
function refuseUnbuilt(desired: Desired, steps: Step[], resolved: Resolved): void {
  const lines = writer?.refuses(desired, steps, resolved) ?? [];
  if (lines.length > 0) throw new ComponentRunError(`will not build "${desired.component.name}": nothing was written`, lines);
}

/**
 * What Figma's own writer does not build: a preferred value by name. Figma takes preferred values by published key, and
 * whether it takes a resolved component's key, a local one's included, waits for a measurement in the desktop app.
 */
function refusedInFigma(desired: Desired): string[] {
  const lines: string[] = [];
  for (const property of desired.component.properties) {
    const named = preferredOf(property).find((value) => 'name' in value) as { loc?: { line: number } } | undefined;
    if (named)
      lines.push(
        `"${desired.component.name}": the preferred values of "${property.name}" by name are not written in Figma until measured in the desktop app; name them by key${named.loc ? ` (line ${named.loc.line})` : ''}`,
      );
  }
  return lines;
}

/** What a plan says about what it leaves alone, what it overwrites and what it breaks, for the report. */
function describe(steps: Step[]): Pick<Report, 'notes' | 'breaking' | 'warnings'> {
  const notes: string[] = [];
  const breaking: string[] = [];
  const warnings: string[] = [];
  for (const step of steps) {
    if (step.kind === 'LEAVE') notes.push(step.message);
    if (step.kind === 'OVERWRITE') warnings.push(step.message);
    if ('breaks' in step && step.breaks) breaking.push(step.breaks);
  }
  return { notes, breaking, warnings };
}

/**
 * Each step that deletes a node names the person's copies of it, and of what is in it, whose stamps it strips once it
 * runs; its own row says so (decisions, *A copy whose original Toghen removes*). A copy is named by the first step that
 * removes what it copies, so a layer deleted inside another is said once.
 */
async function withStrips(steps: Step[]): Promise<void> {
  let copiesOf: ReturnType<typeof copiesFinder> | undefined;
  const named = new Set<string>();
  for (const step of steps) {
    if (step.kind !== 'DELETE_MEMBER' && step.kind !== 'DELETE_LAYER' && step.kind !== 'REPLACE_LAYER') continue;
    const node = (await figma.getNodeByIdAsync(step.kind === 'DELETE_MEMBER' ? step.memberId : step.nodeId)) as SceneNode | null;
    if (!node) continue;
    copiesOf ??= copiesFinder();
    const copies = copiesOf(node, step.kind !== 'REPLACE_LAYER' || !keepsChildren(step.layer, node)).filter((copy) => !named.has(copy.id));
    if (copies.length === 0) continue;
    for (const copy of copies) named.add(copy.id);
    step.strip = copies.map((copy) => copy.id);
    const said = keepsNoStamp(outermost(copies));
    if (step.breaks) step.breaks = `${step.breaks}; ${said}`;
    else if (step.kind === 'DELETE_LAYER') step.message = `removes "${step.address}"; ${said}`;
  }
}

/** What the diff compares each layer's receipt with: the receipt the file's value would leave. */
const receiptsOf = (resolved: Resolved, wiring: Wiring, options: RunOptions): Receipts => ({
  expected: (layer) => expectedOf(layer, resolved, wiring),
  component: (ref) => resolved.componentSource(ref),
  preferred: (value) => {
    const node = resolved.preferred(value);
    return node ? { type: value.type, key: node.key } : value;
  },
  defaultComponent: (ref) => {
    try {
      return resolved.component(ref).id;
    } catch (_missing) {
      // A component the run cannot find is said by the write that needs it; here it only means the default is set again.
      return undefined;
    }
  },
  ...(options.overwriteDrift ? { overwriteDrift: true } : {}),
});

/** Tells the end of the run which page a set or an artboard is on, the run's page for one yet to be made. */
async function noteSet(existingId: string | undefined, page: PageNode): Promise<void> {
  const node = existingId === undefined ? null : await figma.getNodeByIdAsync(existingId);
  noteTouched(node ? pageOf(node) : page);
}

export async function run(desired: Desired, options: RunOptions = {}): Promise<Report> {
  // A real run builds against what is in the file. A name only a plan said would exist would be a binding to nothing.
  if (options.pending && !options.dryRun) {
    throw new ComponentRunError(`will not build "${desired.component.name}": nothing was written`, [
      'pending names are for a dry run: a real run resolves against what the file holds, and the steps before it have made those names',
    ]);
  }
  if (!writer) {
    const refused = refusedInFigma(desired);
    if (refused.length > 0) throw new ComponentRunError(`will not build "${desired.component.name}": nothing was written`, refused);
  }
  // Under dynamic-page access a page's contents are not there until it is loaded, and the snapshot reads every page.
  // Page by page, not loadAllPagesAsync(): a measured choice, and it loads only what the snapshot reads.
  // The searches then run page by page too (findInEveryPage): the plugin may not search the document itself.
  for (const page of figma.root.children) await page.loadAsync();

  const resolved = await resolve(desired, options);
  if (desired.artboard) return runArtboard(desired, resolved, options);
  const snapshot = await takeSnapshot(desired.component.name);
  const wiring: Wiring = {
    keys: new Map((snapshot.set?.definitions ?? []).map((definition) => [definition.name, definition.key])),
    defaults: new Map(),
  };
  for (const property of desired.component.properties) {
    if (property.type !== 'BOOLEAN' && property.type !== 'TEXT') continue;
    try {
      wiring.defaults.set(property.name, shownDefault(resolved, property));
    } catch (_pending) {
      // A default's variable a dry run only expects: a field wired to it reads as moved, and is written.
    }
  }
  const steps = diff(desired.members, desired.component, snapshot, receiptsOf(resolved, wiring, options));
  await withStrips(steps);
  refuseUnbuilt(desired, steps, resolved);
  const report: Report = {
    dryRun: !!options.dryRun,
    steps,
    created: [],
    updated: [],
    deleted: [],
    pending: resolved.pending,
    ...describe(steps),
  };
  report.notes.push(...resolved.notes);

  if (options.dryRun) {
    // What the run would write as a value is said before it runs (R10).
    report.warnings.push(...plannedValueLines(desired.component.name, resolved, steps));
    await noteSet(snapshot.set?.id, resolved.page);
    return report;
  }

  const refused = steps.filter(refusal);
  if (refused.length > 0) {
    throw new ComponentRunError(
      `will not build "${desired.component.name}": nothing was written`,
      refused.map((step) => step.message),
    );
  }

  // Breaking steps are advisory in a dry run and a gate in a real one: only someone who read them and said so takes them.
  if (report.breaking.length > 0 && !options.allowBreaking) {
    throw new ComponentRunError(
      `will not change "${desired.component.name}": ${report.breaking.length} step${report.breaking.length === 1 ? '' : 's'} would break instances, and nothing was written; pass allowBreaking to take ${report.breaking.length === 1 ? 'it' : 'them'}`,
      report.breaking,
    );
  }

  const create = steps.find((step): step is Extract<Step, { kind: 'CREATE_SET' }> => step.kind === 'CREATE_SET');
  if (create) {
    const applied = await (writer ? writer.createSet(create, resolved) : applyCreateSet(create, resolved));
    report.setId = applied.setId;
    noteTouched(resolved.page, applied.setId);
    report.created.push(...applied.created);
    report.warnings.push(...applied.warnings);
  } else if (snapshot.set) {
    const applied = await (writer
      ? writer.update(snapshot.set.id, steps, desired, resolved)
      : applyUpdate(snapshot.set.id, steps, desired, resolved));
    report.setId = snapshot.set.id;
    await noteSet(snapshot.set.id, resolved.page);
    report.created.push(...applied.created);
    report.updated.push(...applied.updated);
    report.deleted.push(...applied.deleted);
    report.warnings.push(...applied.warnings);
  }
  return report;
}

/**
 * An artboard: snapshot its frame by stamp, plan the difference, and apply it.
 *
 * The gate is the set's: a layer the file stopped producing is removed, which is a breaking step, so a real run
 * that has one stops before its first write unless it was told to take it. A layer without our stamp is never touched.
 */
async function runArtboard(desired: Desired, resolved: Resolved, options: RunOptions): Promise<Report> {
  const [member] = desired.members;
  const snapshot = await takeArtboardSnapshot(member.name);
  const steps = diffArtboard(member, snapshot, receiptsOf(resolved, { keys: new Map(), defaults: new Map() }, options));
  await withStrips(steps);
  refuseUnbuilt(desired, steps, resolved);
  const report: Report = {
    artboard: true,
    dryRun: !!options.dryRun,
    steps,
    created: [],
    updated: [],
    deleted: [],
    pending: resolved.pending,
    ...describe(steps),
  };
  report.notes.push(...resolved.notes);
  if (options.dryRun) {
    report.warnings.push(...plannedValueLines(member.name, resolved, steps));
    await noteSet(snapshot.artboard?.id, resolved.page);
    return report;
  }

  if (report.breaking.length > 0 && !options.allowBreaking) {
    throw new ComponentRunError(
      `will not change "${member.name}": ${report.breaking.length} step${report.breaking.length === 1 ? '' : 's'} would remove layers, and nothing was written; pass allowBreaking to take ${report.breaking.length === 1 ? 'it' : 'them'}`,
      report.breaking,
    );
  }

  const create = steps.find((step): step is Extract<Step, { kind: 'CREATE_ARTBOARD' }> => step.kind === 'CREATE_ARTBOARD');
  if (create) {
    const applied = await (writer ? writer.createArtboard(create, resolved) : applyCreateArtboard(create, resolved));
    report.setId = applied.frameId;
    noteTouched(resolved.page, applied.frameId);
    report.created.push(...applied.created);
    report.warnings.push(...applied.warnings);
  } else if (snapshot.artboard) {
    report.setId = snapshot.artboard.id;
    // A run with nothing to change does not even switch pages.
    if (!steps.some((step) => step.kind !== 'LEAVE' && step.kind !== 'OVERWRITE')) return report;
    const applied = await (writer
      ? writer.updateArtboard(snapshot.artboard.id, steps, desired, resolved)
      : applyArtboardUpdate(snapshot.artboard.id, steps, desired, resolved));
    await noteSet(snapshot.artboard.id, resolved.page);
    report.created.push(...applied.created);
    report.updated.push(...applied.updated);
    report.deleted.push(...applied.deleted);
    report.warnings.push(...applied.warnings);
  }
  return report;
}
