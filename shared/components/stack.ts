/**
 * Where Toghen's sets and artboards go on a page. Pure: this is tested without Figma.
 *
 * Toghen records where it put each set and artboard (a `placed` stamp). One whose position still equals its stamp is
 * Toghen's to place, and after a run those are stacked again, so a set that grew pushes the ones below it down. One
 * whose position differs was moved by hand and is the designer's: never moved, and the stack flows around it.
 */

/** The gap between two sets of the stack. */
export const SET_GAP = 100;

/** How far a node may be from its stamp and still count as where Toghen put it. */
const SAME = 0.5;

/** A top-level node of a page, as plain data. */
export interface TopLevel {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** A component set or an artboard's frame that Toghen made. */
  toghen: boolean;
  /** Its `placed` stamp, when it has one. */
  placed?: { x: number; y: number };
  /** Made by this run, and its place in the order they were made: it joins the stack at its end. */
  created?: number;
}

export interface Plan {
  /** The nodes whose position changes. */
  moves: { id: string; name: string; x: number; y: number }[];
  /** The nodes whose `placed` stamp is written, at the position they have after the moves. */
  stamps: { id: string; x: number; y: number }[];
  /** What the restack leaves for the person to see: a set moved by hand that overlaps something. */
  notes: string[];
}

/** The page's nodes, by what the restack does with each. */
export interface Sorted {
  /** Toghen's, and those from before positions were recorded that overlap another of Toghen's: in their current order, top to bottom and then left to right. */
  stack: TopLevel[];
  /** Made by this run, in the order they were made. */
  created: TopLevel[];
  /** Moved by hand: left where they are. */
  byHand: TopLevel[];
  /** From before positions were recorded, overlapping nothing: left where they are and stamped there. */
  inPlace: TopLevel[];
  /** Everything else at the top level. */
  others: TopLevel[];
}

const overlaps = (a: Pick<TopLevel, 'x' | 'y' | 'width' | 'height'>, b: Pick<TopLevel, 'x' | 'y' | 'width' | 'height'>): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const round = (value: number): number => Math.round(value * 100) / 100;
const quoted = (names: string[]): string => names.map((name) => `"${name}"`).join(', ');

export function sortTopLevel(nodes: TopLevel[]): Sorted {
  const sorted: Sorted = { stack: [], created: [], byHand: [], inPlace: [], others: [] };
  // A set made by this run sits at a placeholder position, which says nothing about what it overlaps.
  const known = nodes.filter((node) => node.toghen && node.created === undefined);
  for (const node of nodes) {
    if (!node.toghen) sorted.others.push(node);
    else if (node.created !== undefined) sorted.created.push(node);
    else if (node.placed)
      (Math.abs(node.x - node.placed.x) <= SAME && Math.abs(node.y - node.placed.y) <= SAME ? sorted.stack : sorted.byHand).push(node);
    else (known.some((other) => other !== node && overlaps(node, other)) ? sorted.stack : sorted.inPlace).push(node);
  }
  sorted.stack.sort((a, b) => a.y - b.y || a.x - b.x);
  sorted.created.sort((a, b) => (a.created as number) - (b.created as number));
  return sorted;
}

/**
 * The restack of one page: the stack's left edges on the leftmost of them, the first where the topmost is, each next
 * `SET_GAP` below the one before; one that would overlap a node outside the stack goes below that node instead. Made by
 * this run, a set joins at the end. With no set in the stack yet, it starts at the top left of what else is on the page.
 */
export function restack(nodes: TopLevel[]): Plan {
  const sorted = sortTopLevel(nodes);
  const fixed = [...sorted.byHand, ...sorted.inPlace, ...sorted.others];
  const anchor = sorted.stack.length > 0 ? sorted.stack : fixed;
  const left = anchor.length > 0 ? Math.min(...anchor.map((node) => node.x)) : 0;
  let y = anchor.length > 0 ? Math.min(...anchor.map((node) => node.y)) : 0;

  const plan: Plan = { moves: [], stamps: [], notes: [] };
  const final: TopLevel[] = [];
  for (const node of [...sorted.stack, ...sorted.created]) {
    let at = y;
    for (;;) {
      const hit = fixed.find((other) => overlaps({ x: left, y: at, width: node.width, height: node.height }, other));
      if (!hit) break;
      at = hit.y + hit.height + SET_GAP;
    }
    const x = round(left);
    at = round(at);
    if (Math.abs(node.x - x) > 0.001 || Math.abs(node.y - at) > 0.001) plan.moves.push({ id: node.id, name: node.name, x, y: at });
    plan.stamps.push({ id: node.id, x, y: at });
    final.push({ ...node, x, y: at });
    y = at + node.height + SET_GAP;
  }
  for (const node of sorted.inPlace) plan.stamps.push({ id: node.id, x: node.x, y: node.y });

  for (const hand of sorted.byHand) {
    const hits = [...final, ...fixed].filter((other) => other.id !== hand.id && overlaps(hand, other));
    if (hits.length > 0)
      plan.notes.push(`"${hand.name}" was moved by hand and overlaps ${quoted(hits.map((hit) => hit.name))}; it was left where it is.`);
  }
  return plan;
}

/** What a dry run says of a page: which sets a run would restack, and which were moved by hand and would stay. No positions: the sizes of the sets it would build are not known until they are built. */
export function describeStack(page: string, nodes: TopLevel[]): string[] {
  const sorted = sortTopLevel(nodes);
  const lines: string[] = [];
  if (sorted.stack.length > 0) lines.push(`page "${page}": a run would restack ${quoted(sorted.stack.map((node) => node.name))}`);
  if (sorted.byHand.length > 0)
    lines.push(
      `page "${page}": ${quoted(sorted.byHand.map((node) => node.name))} ${sorted.byHand.length === 1 ? 'was' : 'were'} moved by hand and would be left where ${sorted.byHand.length === 1 ? 'it is' : 'they are'}`,
    );
  return lines;
}
