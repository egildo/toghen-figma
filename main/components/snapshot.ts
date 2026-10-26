/**
 * What is in the file that is ours, as plain data.
 *
 * Finds a component's set, its members and their layers by stamp, wherever a
 * designer moved them, and reports what it found that is *not* ours: a set of the
 * same name that Toghen did not make, nodes inside a set that carry no stamp, and
 * the copies a person made of Toghen's nodes, which carry their stamps.
 * The diff is taken from this, and it never sees a Figma node.
 *
 * Must run after every page is loaded (`page.loadAsync()`): under dynamic-page
 * access a page's contents are not there until it is loaded.
 */

import { findInEveryPage } from '../utils/pageRoots.js';
import { parseCombination, slotKey } from '../../shared/components/diff.js';
import type {
  ArtboardSnapshot,
  LayerSnapshot,
  MemberSnapshot,
  PropertySnapshot,
  Snapshot,
  SetSnapshot,
} from '../../shared/components/diff.js';
import type { LayerKind, SlotSettings as SlotModelSettings } from '../../shared/components/model.js';
import { slotNodesOf } from './apply.js';
import { ComponentRunError } from './errors.js';
import { isOwn, receiptOf, sortNodes, stampedAs, stampOn, type Sorted, type Stamp } from './stamp.js';
import { reportedOf } from './receipt.js';
import { loadLock } from '../utils/lockStore.js';

const LAYER_TYPES: Record<string, LayerKind> = { FRAME: 'FRAME', SLOT: 'SLOT', TEXT: 'TEXT', INSTANCE: 'INSTANCE', LINE: 'LINE' };

/**
 * A stamped layer's receipt, and the hash of what Figma reports now for each field with a hash in it. An instance's
 * component is always read, and said as `main`: the diff tells a swap from a receipt to take again by it (`SWAP_COMPONENT`).
 */
async function receiptAndReported(
  node: SceneNode,
  receipt: Record<string, string>,
  libraryOf: () => Map<string, string>,
): Promise<Pick<LayerSnapshot, 'receipt' | 'reported' | 'main'>> {
  const fields = Object.keys(receipt).filter((field) => receipt[field] !== '');
  if (node.type !== 'INSTANCE') return { receipt, reported: receiptOf(await reportedOf(node, fields)) };
  const reported = receiptOf(await reportedOf(node, fields.includes('component') ? fields : [...fields, 'component']));
  const component = await node.getMainComponentAsync();
  const shown = component?.parent?.type === 'COMPONENT_SET' ? component.parent : component;
  if (!shown) return { receipt, reported };
  return {
    receipt,
    reported,
    main: { name: shown.name, key: shown.key, ...(shown.remote ? { library: libraryOf().get(shown.key) ?? '' } : {}) },
  };
}

/** The library the lock holds each component key under, read once a snapshot meets a library's component. */
function librariesByKey(): () => Map<string, string> {
  let byKey: Map<string, string> | undefined;
  return () => {
    if (byKey) return byKey;
    byKey = new Map();
    for (const [library, entry] of Object.entries(loadLock().libraries))
      for (const { key } of Object.values(entry.components)) byKey.set(key, library);
    return byKey;
  };
}

/** A node of a member or an artboard's frame, as the walk found it. */
export interface TreeNode {
  node: SceneNode;
  index: number;
  /** The key of the layer it sits in: an address, or for a layer in an instance's slot, `slotKey` of the instance and the slot. */
  parent?: string;
  /** Set on a layer Toghen stamped, of a kind it makes. */
  stamp?: Stamp;
  address?: string;
  kind?: LayerKind;
  /** Toghen's layer, moved: its stamp names another id (`sortOut`). */
  moved?: true;
  /** A person's copy of a layer Toghen made: the original. */
  copyOf?: SceneNode;
}

/**
 * The nodes of a member, or an artboard's frame, the root first: each stamped layer by the address in its stamp, sorted
 * into Toghen's and a person's copies (`sortNodes`), and the nodes that carry no stamp. The walk goes into a stamped
 * layer only: an unstamped node's contents are its own business, and an instance's children belong to its component;
 * in an artboard the layers in an instance's slots are walked, under the slot's key. What is inside a copy is left out
 * with it. The snapshot and the update both read a tree through this, so they agree on which node is which layer.
 */
export async function stampedTree(root: SceneNode & ChildrenMixin, slots: boolean): Promise<TreeNode[]> {
  const found: Array<TreeNode & { up?: TreeNode }> = [];
  const add = (
    node: SceneNode,
    index: number,
    parent: string | undefined,
    up: TreeNode | undefined,
    kind: LayerKind | undefined,
  ): TreeNode => {
    const stamp = stampOn(node);
    const address = stamp?.is.address;
    const entry = {
      node,
      index,
      ...(parent !== undefined ? { parent } : {}),
      up,
      ...(stamp && address !== undefined && kind ? { stamp, address, kind } : {}),
    };
    found.push(entry);
    return entry;
  };
  const walk = (node: BaseNode & ChildrenMixin, parent: string | undefined, up: TreeNode, slot = false): void => {
    for (const [index, child] of (node.children as readonly SceneNode[]).entries()) {
      // A slot's default content comes with the instance, stamped as its component's layer: the component's, not the
      // artboard's. What the artboard places in a slot carries a stamp of its own. // ponytail: a person's cut and paste
      // of the artboard's slot content is left out too, not read as moved; tell the two apart when someone needs it.
      const stamp = slot ? stampOn(child) : undefined;
      if (stamp && !isOwn(child, stamp)) continue;
      const entry = add(child, index, parent, up, LAYER_TYPES[child.type]);
      if (entry.address === undefined) continue;
      if (child.type === 'INSTANCE') {
        if (slots) for (const held of slotNodesOf(child)) walk(held, slotKey(entry.address, held.name), entry, true);
      } else if ('children' in child) {
        walk(child, entry.address, entry);
      }
    }
  };
  const top = add(root, 0, undefined, undefined, 'FRAME');
  walk(root, top.address, top);

  const sorted = await sortNodes(found.filter((entry) => entry.address !== undefined).map((entry) => entry.node));
  const copyOf = new Map(sorted.copies.map(({ copy, of }) => [copy, of]));
  const underCopy = (entry: TreeNode & { up?: TreeNode }): boolean => {
    for (let up = entry.up as (TreeNode & { up?: TreeNode }) | undefined; up; up = up.up) if (copyOf.has(up.node)) return true;
    return false;
  };
  return found
    .filter((entry) => !underCopy(entry))
    .map(({ up: _up, ...entry }) => ({
      ...entry,
      ...(sorted.moved.has(entry.node) ? { moved: true as const } : {}),
      ...(copyOf.has(entry.node) ? { copyOf: copyOf.get(entry.node) } : {}),
    }));
}

/**
 * A member, or an artboard's frame, as plain data: its layers by the address in their stamps, with their receipts, the
 * copies a person made of them, and the nodes in it that carry no stamp. The root is the node itself: one node is the
 * member (or the artboard) and a layer.
 */
async function snapshotTree(root: ComponentNode | FrameNode, name: string, slots: boolean): Promise<MemberSnapshot> {
  const layers: LayerSnapshot[] = [];
  const unstamped: MemberSnapshot['unstamped'] = [];
  const copies: NonNullable<MemberSnapshot['copies']> = [];
  const libraryOf = librariesByKey();
  for (const entry of await stampedTree(root, slots)) {
    const { node } = entry;
    const parent = entry.parent !== undefined ? { parent: entry.parent } : {};
    if (!entry.stamp || entry.address === undefined || !entry.kind) {
      // Not ours: reported, and left alone. What is inside it is its own business.
      if (node !== root) unstamped.push({ id: node.id, name: node.name, ...parent });
    } else if (entry.copyOf) {
      copies.push({ id: node.id, name: node.name, address: entry.address });
    } else {
      layers.push({
        id: node.id,
        name: node.name,
        address: entry.address,
        kind: entry.kind,
        index: entry.index,
        ...(await receiptAndReported(node, entry.stamp.receipt, libraryOf)),
        ...parent,
        ...(entry.moved ? { moved: true } : {}),
      });
    }
  }
  return { id: root.id, name, layers, unstamped, ...(copies.length > 0 ? { copies } : {}) };
}

/** Figma reports an unset limit as null; the file leaves it out. */
function withoutNulls(settings: SlotSettings): SlotModelSettings {
  const out: SlotModelSettings = {};
  for (const [key, value] of Object.entries(settings))
    if (value !== null && value !== undefined) (out as Record<string, unknown>)[key] = value;
  return out;
}

/**
 * What is wrong with a set Figma reports as broken, from its children's names and stamps, which stay readable when the
 * set's own properties do not: members with other axes than most, a combination two members share, a name that does not
 * read as `Axis=value, …`. Each is said to be ours or made by hand.
 */
function describeBroken(set: ComponentSetNode, componentName: string): string[] {
  const children = set.children.filter((child): child is ComponentNode => child.type === 'COMPONENT');
  const who = (child: ComponentNode): string => (stampOn(child)?.is.member !== undefined ? 'ours' : 'made by hand');
  const lines = [`cannot build "${componentName}": Figma reports its set (${set.id}) as broken, and nothing was written`];

  const axesOf = new Map<ComponentNode, string>();
  const byName = new Map<string, ComponentNode[]>();
  for (const child of children) {
    const pairs = parseCombination(child.name);
    if (!pairs) {
      lines.push(`member "${child.name}" (${child.id}, ${who(child)}) does not read as Axis=value, …`);
      continue;
    }
    axesOf.set(child, pairs.map(([axis]) => axis).join(', '));
    byName.set(child.name, [...(byName.get(child.name) ?? []), child]);
  }
  // The axes most members have; on a tie, the first met.
  const counts = new Map<string, number>();
  for (const axes of axesOf.values()) counts.set(axes, (counts.get(axes) ?? 0) + 1);
  const usual = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  for (const [child, axes] of axesOf) {
    if (usual && axes !== usual[0])
      lines.push(`member "${child.name}" (${child.id}, ${who(child)}) has the axes ${axes}; the other ${usual[1]} have ${usual[0]}`);
  }
  for (const [name, same] of byName) {
    if (same.length > 1)
      lines.push(
        `"${name}" is the name of ${same.length === 2 ? 'two' : same.length} members (${same.map((child) => `${child.id}, ${who(child)}`).join('; ')})`,
      );
  }
  lines.push('delete or rename the members named, then run again');
  return lines;
}

/** Figma's own message for a set it calls broken, the one every read of its properties then throws. */
const isBroken = (error: unknown): boolean => error instanceof Error && /Component set .*has existing errors/.test(error.message);

/** The lines that name what is wrong with the component's stamped set, when Figma reports it broken. Reads it, and nothing else. */
export function brokenSetLines(set: ComponentSetNode, componentName: string): string[] | undefined {
  try {
    void set.componentPropertyDefinitions;
    return undefined;
  } catch (error) {
    if (!isBroken(error)) throw error;
    return describeBroken(set, componentName);
  }
}

/** The members of a set, Toghen's and a person's copies (`sortNodes`): its components stamped as members. */
export const membersOf = (set: ComponentSetNode): Promise<Sorted<ComponentNode>> =>
  sortNodes(set.children.filter((child): child is ComponentNode => child.type === 'COMPONENT' && stampOn(child)?.is.member !== undefined));

async function snapshotSet(set: ComponentSetNode, componentName: string): Promise<SetSnapshot> {
  const broken = brokenSetLines(set, componentName);
  if (broken) throw new ComponentRunError(broken[0], broken.slice(1));
  const members: MemberSnapshot[] = [];
  const unstamped: SetSnapshot['unstamped'] = [];
  const copies: NonNullable<SetSnapshot['copies']> = [];
  const sorted = await membersOf(set);
  const copyOf = new Map<SceneNode, ComponentNode>(sorted.copies.map(({ copy, of }) => [copy, of]));
  for (const child of set.children) {
    const of = copyOf.get(child);
    if (of) copies.push({ id: child.id, name: child.name, of: stampOn(of)?.is.member ?? of.name });
    else if (sorted.ours.includes(child as ComponentNode))
      members.push(await snapshotTree(child as ComponentNode, stampOn(child)?.is.member as string, false));
    else unstamped.push({ id: child.id, name: child.name });
  }
  // The set's properties, ours and not. A `VARIANT` axis is derived from the members' names and is not one to edit.
  const definitions: PropertySnapshot[] = Object.entries(set.componentPropertyDefinitions)
    .filter(([, definition]) => definition.type !== 'VARIANT')
    .map(([key, definition]) => ({
      key,
      name: key.split('#')[0],
      type: definition.type as PropertySnapshot['type'],
      defaultValue: definition.defaultValue,
      ...(definition.description !== undefined ? { description: definition.description } : {}),
      ...(definition.preferredValues ? { preferredValues: definition.preferredValues } : {}),
      ...(definition.slotSettings ? { slotSettings: withoutNulls(definition.slotSettings) } : {}),
    }));
  return {
    id: set.id,
    definitions,
    properties: Object.keys(stampOn(set)?.receipt ?? {}),
    members,
    unstamped,
    ...(copies.length > 0 ? { copies } : {}),
  };
}

/** The sets stamped as this component, Toghen's and a person's copies (`sortNodes`). */
const stampedSets = (componentName: string): Promise<Sorted<ComponentSetNode>> =>
  sortNodes(
    findInEveryPage({ types: ['COMPONENT_SET'], sharedPluginData: stampedAs('component') }).filter(
      (set): set is ComponentSetNode => stampOn(set)?.is.component === componentName,
    ),
  );

/**
 * A set or an artboard's frame with what is inside it, read: FigCraft may hold a top-level layer read without it (a dry
 * run that skips what has not changed reads only what it compares), and reads it when asked. In Figma nothing is left.
 */
async function loaded<T extends SceneNode>(node: T): Promise<T> {
  if ('loadAsync' in node) await (node as { loadAsync(): Promise<void> }).loadAsync();
  return node;
}

/**
 * The set or the artboard's frame Toghen built for `desired`, found by its stamp alone, and nothing in it read: what a
 * run that skips what has not changed compares its fingerprint with. Undefined where there is none, or more than one.
 */
export async function builtNode(desired: {
  component: { name: string };
  members: { name: string }[];
  artboard?: true;
}): Promise<SceneNode | undefined> {
  const { ours } = desired.artboard
    ? await sortNodes(
        findInEveryPage({ types: ['FRAME'], sharedPluginData: stampedAs('artboard') }).filter(
          (frame) => stampOn(frame)?.is.artboard === desired.members[0]?.name,
        ),
      )
    : await stampedSets(desired.component.name);
  return ours.length === 1 ? ours[0] : undefined;
}

/** The lines naming what is wrong with each of these components' stamped sets that Figma reports as broken, for the check that runs before a sync writes anything. A copy is not Toghen's to check. */
export async function brokenSetProblems(componentNames: string[]): Promise<string[]> {
  // The same page-by-page loading a run does before it reads the file.
  if (componentNames.length > 0) for (const page of figma.root.children) await page.loadAsync();
  const lines: string[] = [];
  for (const name of componentNames) for (const set of (await stampedSets(name)).ours) lines.push(...(brokenSetLines(set, name) ?? []));
  return lines;
}

/**
 * Finds the set Toghen built for `componentName`, the copies a person made of it, and any set that merely has its name.
 *
 * A copy carries the set's stamp, and its id says it is a copy (`sortNodes`). Two sets whose stamps are both their own
 * (stamped before the stamp recorded an id) cannot be told apart by anything but a guess, so that stops the run rather
 * than being resolved by picking one.
 */
export async function takeSnapshot(componentName: string): Promise<Snapshot> {
  const { ours, copies } = await stampedSets(componentName);

  if (ours.length > 1) {
    throw new ComponentRunError(`cannot build "${componentName}": more than one set is stamped as it`, [
      `${ours.map((set) => set.id).join(', ')} all claim to be "${componentName}"; delete or unstamp all but one`,
    ]);
  }

  const foreign = findInEveryPage({ types: ['COMPONENT_SET'] })
    .filter((set) => set.name === componentName && stampOn(set)?.is.component === undefined)
    .map((set) => ({ id: set.id, name: set.name }));

  return {
    ...(ours.length === 1 ? { set: await snapshotSet(await loaded(ours[0]), componentName) } : {}),
    foreign,
    ...(copies.length > 0 ? { copies: copies.map(({ copy }) => ({ id: copy.id, name: copy.name })) } : {}),
  };
}

/**
 * Finds the frame Toghen built for the artboard `name`, wherever a person moved it, and the copies a person made of it.
 *
 * A frame that merely has the artboard's name is not looked at: nothing is adopted by name. Two frames whose stamps
 * are both their own cannot be told apart, so that stops the run.
 */
export async function takeArtboardSnapshot(name: string): Promise<ArtboardSnapshot> {
  const { ours, copies } = await sortNodes(
    findInEveryPage({ types: ['FRAME'], sharedPluginData: stampedAs('artboard') }).filter(
      (frame): frame is FrameNode => stampOn(frame)?.is.artboard === name,
    ),
  );
  if (ours.length > 1) {
    throw new ComponentRunError(`cannot build "${name}": more than one frame is stamped as it`, [
      `${ours.map((frame) => frame.id).join(', ')} all claim to be the artboard "${name}"; delete or unstamp all but one`,
    ]);
  }
  return {
    ...(ours.length === 1 ? { artboard: await snapshotTree(await loaded(ours[0]), name, true) } : {}),
    ...(copies.length > 0 ? { copies: copies.map(({ copy }) => ({ id: copy.id, name: copy.name })) } : {}),
  };
}
