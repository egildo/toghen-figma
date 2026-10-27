/**
 * What happens once per run, around the component and artboard steps: strays, and with `--prune` the sets and artboards
 * no file declares, are found before anything is written; at the end they are removed and each page's sets and
 * artboards are stacked again.
 *
 * A run is one `components` or `sync` command, or one template run from the plugin's screen. Its steps arrive one file
 * at a time, so what the run has made or changed is kept here until `finishRun` (`specs.md`, *Strays, the board, and
 * where sets go*). The stack itself is `shared/components/stack.ts`; this is what reads Figma for it and writes back.
 */

import { describeStack, restack, type TopLevel } from '../../shared/components/stack.js';
import { findInEveryPage } from '../utils/pageRoots.js';
import { copiesFinder, keepsNoStamp, outermost, sortNodes, stampedAs, stampOn, strip, updateStamp, type Sorted } from './stamp.js';

/**
 * The pages this run made or changed a set or an artboard on, and the nodes it made, in the order it made them; with
 * `--prune`, what the run's files declare.
 */
const run = { pages: new Set<string>(), made: [] as string[], declared: undefined as Declared | undefined };

/** A new run: forgets what the one before made, if it never finished. */
export function beginRun(): void {
  run.pages.clear();
  run.made = [];
  run.declared = undefined;
}

/** A set or an artboard was made (`madeId`) or changed on this page. */
export function noteTouched(page: PageNode, madeId?: string): void {
  run.pages.add(page.id);
  if (madeId !== undefined) run.made.push(madeId);
}

export function pageOf(node: BaseNode): PageNode {
  let up: BaseNode | null = node;
  while (up && up.type !== 'PAGE') up = up.parent;
  if (!up) throw new Error(`the node ${node.id} is not on a page`);
  return up;
}

// ---------------------------------------------------------------------------
// strays
// ---------------------------------------------------------------------------

/** A member outside any set: a component stamped as a member whose parent is not a set stamped as a component. */
export interface Stray {
  id: string;
  /** Its combination, from its stamp: it names no component. */
  name: string;
  node: ComponentNode;
  /** The person's copies of it and of what is in it, whose stamps its removal strips (decisions, *A copy whose original Toghen removes*). */
  copies: SceneNode[];
}

/** The members outside any set, Toghen's and a person's copies of a member (`sortNodes`). Every page must be loaded. */
const loose = (): Promise<Sorted<ComponentNode>> =>
  sortNodes(
    (findInEveryPage({ types: ['COMPONENT'], sharedPluginData: stampedAs('member') }) as ComponentNode[]).filter(
      (node) =>
        stampOn(node)?.is.member !== undefined &&
        !(node.parent?.type === 'COMPONENT_SET' && stampOn(node.parent)?.is.component !== undefined),
    ),
  );

/** Every stray on every page, loading each page first. A person's copy of a member is not one: it is left alone. */
export async function findStrays(): Promise<Stray[]> {
  for (const page of figma.root.children) await page.loadAsync();
  const strays = (await loose()).ours;
  const copiesOf = strays.length > 0 ? copiesFinder() : undefined;
  return strays.map((node) => ({ id: node.id, name: stampOn(node)?.is.member ?? node.name, node, copies: copiesOf!(node) }));
}

const andCopies = (stray: Stray): string => (stray.copies.length > 0 ? `; ${keepsNoStamp(outermost(stray.copies))}` : '');

/** Always breaking: its instances may be in other files that use this one as a library, which the run cannot see. */
export const strayLine = (stray: Stray): string =>
  `"${stray.name}" (${stray.id}) is a member outside any set, left by an earlier run; it is removed with --allow-breaking${andCopies(stray)}.`;

// ---------------------------------------------------------------------------
// what has no source
// ---------------------------------------------------------------------------

/** The components and artboards a run's files declare, by the names their stamps hold. */
export interface Declared {
  components: ReadonlySet<string>;
  artboards: ReadonlySet<string>;
}

/** A set or an artboard frame Toghen made that no file of a pruning run declares (specs, *Removing what has no source*). */
export interface Orphan {
  id: string;
  kind: 'set' | 'artboard';
  name: string;
  node: ComponentSetNode | FrameNode;
  page: PageNode;
  copies: SceneNode[];
}

/** The run's files are the whole system (`--prune`): what they do not declare is listed now, and removed at the end. */
export function notePruning(declared: Declared): void {
  run.declared = declared;
}

/** Toghen's sets and artboard frames on every page that no file declares, loading each page first. A copy is not one. */
export async function findOrphans(declared: Declared): Promise<Orphan[]> {
  for (const page of figma.root.children) await page.loadAsync();
  const sets = (await sortNodes(findInEveryPage({ types: ['COMPONENT_SET'], sharedPluginData: stampedAs('component') }).filter(isStamped)))
    .ours as ComponentSetNode[];
  const frames = (await sortNodes(findInEveryPage({ types: ['FRAME'], sharedPluginData: stampedAs('artboard') }).filter(isStamped)))
    .ours as FrameNode[];
  const nameOf = (node: SceneNode): string => {
    const is = stampOn(node)?.is;
    return (node.type === 'COMPONENT_SET' ? is?.component : is?.artboard) ?? node.name;
  };
  const orphans = [
    ...sets.filter((node) => !declared.components.has(nameOf(node))).map((node) => ({ kind: 'set' as const, name: nameOf(node), node })),
    ...frames
      .filter((node) => !declared.artboards.has(nameOf(node)))
      .map((node) => ({ kind: 'artboard' as const, name: nameOf(node), node })),
  ];
  const copiesOf = orphans.length > 0 ? copiesFinder() : undefined;
  return orphans.map((orphan) => ({ ...orphan, id: orphan.node.id, page: pageOf(orphan.node), copies: copiesOf!(orphan.node) }));
}

const orphanCopies = (orphan: Orphan): string => (orphan.copies.length > 0 ? `; ${keepsNoStamp(outermost(orphan.copies))}` : '');

/** Always breaking, as a stray: a set's instances may be in other files that use this one as a library. */
export const orphanLine = (orphan: Orphan): string =>
  `the ${orphan.kind} "${orphan.name}" (${orphan.id}) on page "${orphan.page.name}" has no source: no file in the run declares ${orphan.kind === 'set' ? 'component' : 'artboard'} "${orphan.name}"; it is removed with --allow-breaking${orphanCopies(orphan)}.`;

// ---------------------------------------------------------------------------
// the end of a run
// ---------------------------------------------------------------------------

export interface Finished {
  /** One line for each stray removed, and each set or artboard with no source. */
  removed: string[];
  /** One line for each set or artboard moved. */
  moved: string[];
  /** A set moved by hand that overlaps something; and for a dry run, what each page would restack. */
  notes: string[];
}

const isStamped = (node: SceneNode): boolean =>
  (node.type === 'COMPONENT_SET' && stampOn(node)?.is.component !== undefined) ||
  (node.type === 'FRAME' && stampOn(node)?.is.artboard !== undefined);

/** The sets and artboard frames on every page that are a person's copies of Toghen's: they stay where the person put them. */
async function copiedBoards(): Promise<Set<SceneNode>> {
  const boards = [
    ...findInEveryPage({ types: ['COMPONENT_SET'], sharedPluginData: stampedAs('component') }),
    ...findInEveryPage({ types: ['FRAME'], sharedPluginData: stampedAs('artboard') }),
  ].filter(isStamped);
  return new Set((await sortNodes(boards)).copies.map(({ copy }) => copy));
}

const topLevel = (page: PageNode, copies: ReadonlySet<SceneNode>): TopLevel[] =>
  page.children.map((node) => {
    const placed = stampOn(node)?.placed;
    const made = run.made.indexOf(node.id);
    return {
      id: node.id,
      name: node.name,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      toghen: isStamped(node) && !copies.has(node),
      ...(placed ? { placed } : {}),
      ...(made !== -1 ? { created: made } : {}),
    };
  });

/**
 * Once, after the last component or artboard step of a run. A dry run says what each page would restack and which sets
 * were moved by hand, and writes nothing. A real run removes the strays when it is allowed to, then on each page it
 * touched stacks Toghen's sets and artboards again and writes their `placed` stamps once they are where they go.
 */
export async function finishRun(options: { dryRun?: boolean; allowBreaking?: boolean }): Promise<Finished> {
  const finished: Finished = { removed: [], moved: [], notes: [] };
  const pages = figma.root.children.filter((page) => run.pages.has(page.id));
  let copies = new Set<SceneNode>();
  if (pages.length > 0) {
    // Every page: a copy may be on another page than its original.
    for (const page of figma.root.children) await page.loadAsync();
    copies = await copiedBoards();
    // A person's copy of a member, outside any set, is said once a run and left alone.
    for (const { copy, of } of (await loose()).copies)
      finished.notes.push(
        `"${copy.name}" (${copy.id}) is a copy of Toghen's member "${stampOn(of)?.is.member ?? of.name}", outside any set, left alone`,
      );
  }

  if (options.dryRun) {
    for (const page of pages) finished.notes.push(...describeStack(page.name, topLevel(page, copies)));
  } else {
    // Strays first: a loose member at the top level is something the stack would flow around.
    if (options.allowBreaking) {
      for (const stray of await findStrays()) {
        stray.node.remove();
        for (const copy of stray.copies) strip(copy);
        finished.removed.push(`removed "${stray.name}" (${stray.id})${andCopies(stray)}`);
      }
      // What no file declares, when the files are the whole system. A page it leaves empty is the person's, and stays.
      if (run.declared) {
        const emptied = new Set<PageNode>();
        for (const orphan of await findOrphans(run.declared)) {
          orphan.node.remove();
          for (const copy of orphan.copies) strip(copy);
          finished.removed.push(
            `removed the ${orphan.kind} "${orphan.name}" (${orphan.id}) from page "${orphan.page.name}"${orphanCopies(orphan)}`,
          );
          if (orphan.page.children.length === 0) emptied.add(orphan.page);
        }
        for (const page of emptied) finished.notes.push(`page "${page.name}" holds nothing now; it is left as it is`);
      }
    }
    for (const page of pages) {
      const plan = restack(topLevel(page, copies));
      const nodes = new Map(page.children.map((node) => [node.id, node]));
      for (const move of plan.moves) {
        const node = nodes.get(move.id) as SceneNode;
        node.x = move.x;
        node.y = move.y;
        finished.moved.push(`moved "${move.name}" to ${move.x}, ${move.y}`);
      }
      // After the moves: a stamp says where the set is.
      for (const at of plan.stamps) {
        const node = nodes.get(at.id) as SceneNode;
        const held = stampOn(node)?.placed;
        if (!held || held.x !== at.x || held.y !== at.y) updateStamp(node, { placed: { x: at.x, y: at.y } });
      }
      finished.notes.push(...plan.notes);
    }
  }
  beginRun();
  return finished;
}
