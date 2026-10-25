/**
 * Applies the steps that change a set that already exists.
 *
 * Identity is what makes this safe: a member keeps its node id, a layer is found
 * by the address in its stamp rather than by name, and a set is never deleted and
 * rebuilt, since that would change its key and break every instance of it. Only
 * the difference is applied, in the order the diff planned it: properties first,
 * so that a layer can be wired to a property the same run added.
 */

import { renameAxis } from '../../shared/components/diff.js';
import type { Layer, Member, Value } from '../../shared/components/model.js';
import type { Desired, Step } from '../../shared/components/steps.js';
import {
  applyFields,
  applyInstanceProperties,
  artboardBuild,
  buildChildren,
  createNode,
  defaultOf,
  editProperties,
  findKey,
  keyedPreferred,
  placeMembers,
  nameOf,
  orRemoveWhatItMade,
  registerSlots,
  shownDefault,
  stampNew,
  stampSet,
  withResets,
  type Build,
} from './apply.js';
import type { Resolved } from './resolve.js';
import { stampReceipts, type Written } from './receipt.js';
import { stampOn, stripNodes, updateStamp } from './stamp.js';
import { membersOf, stampedTree } from './snapshot.js';

export interface Updated {
  created: string[];
  updated: string[];
  deleted: string[];
  warnings: string[];
}

type Container = SceneNode & ChildrenMixin;

/**
 * Each of Toghen's layers of a member by address, the root (the member itself) included: as the snapshot read them
 * (`stampedTree`), so a person's copy of a layer is never taken for it.
 *
 * In an artboard an instance's slots are searched too, and each is kept under the key its layers name as their parent.
 */
async function indexMember(member: Container, slots = false): Promise<Map<string, SceneNode>> {
  const layers = new Map<string, SceneNode>();
  for (const { node, address, copyOf } of await stampedTree(member, slots)) {
    if (address === undefined || copyOf) continue;
    layers.set(address, node);
    if (slots && node.type === 'INSTANCE') registerSlots(layers, address, node);
  }
  return layers;
}

/** The keys of the set's properties by name: what a wired layer references. */
function keysOf(set: ComponentSetNode): Map<string, string> {
  const keys = new Map<string, string>();
  for (const [key, definition] of Object.entries(set.componentPropertyDefinitions)) {
    if (definition.type !== 'VARIANT') keys.set(nameOf(key), key);
  }
  return keys;
}

/** Puts a node in a parent after the layer that precedes it in the file, or first when nothing does. */
function placeAfter(parent: ChildrenMixin, node: SceneNode, after: SceneNode | undefined, named: boolean): void {
  const siblings = parent.children;
  // A predecessor the member does not have yet is not a reason to fail: the layer goes last.
  let index = after ? siblings.indexOf(after) + 1 : named ? siblings.length : 0;
  const current = siblings.indexOf(node);
  if (current !== -1 && current < index) index -= 1;
  parent.insertChild(index, node);
}

function pageOf(node: BaseNode): PageNode {
  let up: BaseNode | null = node;
  while (up && up.type !== 'PAGE') up = up.parent;
  if (!up) throw new Error(`the node ${node.id} is not on a page`);
  return up;
}

export async function applyUpdate(setId: string, steps: Step[], desired: Desired, resolved: Resolved): Promise<Updated> {
  const result: Updated = { created: [], updated: [], deleted: [], warnings: [] };
  const spec = desired.component;

  const found = await figma.getNodeByIdAsync(setId);
  if (found?.type !== 'COMPONENT_SET') throw new Error(`the component set ${setId} is no longer in the file`);
  const set = found;

  // New nodes are created on the current page and moved into place, so the page is the one the set is on.
  await figma.setCurrentPageAsync(pageOf(set));
  const hasText = (layer: Layer): boolean => layer.kind === 'TEXT' || layer.children.some(hasText);
  if (desired.members.some((member) => hasText(member.tree))) await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  for (const style of resolved.textStyles()) await figma.loadFontAsync(style.fontName);

  const defaults = new Map<string, string | boolean>();
  for (const property of spec.properties)
    if (property.type === 'BOOLEAN' || property.type === 'TEXT') defaults.set(property.name, shownDefault(resolved, property));
  // A person's copy of a member, in the set, is neither renamed nor laid out.
  const copies = new Set<SceneNode>((await membersOf(set)).copies.map(({ copy }) => copy));

  const indexes = new Map<string, Map<string, SceneNode>>();
  const memberNodes = new Map<string, ComponentNode>();
  const member = async (id: string): Promise<{ node: ComponentNode; layers: Map<string, SceneNode> }> => {
    let node = memberNodes.get(id);
    if (!node) {
      const looked = await figma.getNodeByIdAsync(id);
      if (looked?.type !== 'COMPONENT') throw new Error(`the member ${id} is no longer in the file`);
      node = looked;
      memberNodes.set(id, node);
      indexes.set(id, await indexMember(node));
    }
    return { node, layers: indexes.get(id)! };
  };
  // The set's keys, read once before the first new member is appended: from then on its members disagree on axes until the old ones are gone, and Figma will not be read.
  let keys: Map<string, string> | undefined;
  const written: Written[] = [];
  const build = (node: ComponentNode): Build => ({
    member: node,
    host: set,
    spec,
    resolved,
    keys: keys ?? keysOf(set),
    defaults,
    warnings: result.warnings,
    written,
  });
  const updated = new Set<string>();
  let madeSlot = false;
  const layerContext: LayerContext = {
    member,
    build: (owner) => build(owner as ComponentNode),
    updated,
    artboard: false,
    members: desired.members as Member[],
  };

  for (const step of steps) {
    switch (step.kind) {
      case 'ADD_PROPERTY': {
        const property = step.property;
        if (property.type === 'BOOLEAN' || property.type === 'TEXT')
          set.addComponentProperty(property.name, property.type, defaultOf(resolved, property));
        else if (property.type === 'INSTANCE_SWAP')
          set.addComponentProperty(property.name, 'INSTANCE_SWAP', resolved.component(property.default).id);
        break;
      }

      case 'EDIT_PROPERTY': {
        const property = step.property;
        const key = findKey(set.componentPropertyDefinitions, property.type, property.name);
        if (key === undefined) break;
        const edit: Parameters<ComponentSetNode['editComponentProperty']>[1] = {};
        for (const change of step.changes) {
          if (change === 'defaultValue' && property.type === 'INSTANCE_SWAP') edit.defaultValue = resolved.component(property.default).id;
          else if (change === 'defaultValue' && (property.type === 'BOOLEAN' || property.type === 'TEXT'))
            edit.defaultValue = defaultOf(resolved, property);
          else if (change === 'preferredValues' && (property.type === 'INSTANCE_SWAP' || property.type === 'SLOT'))
            edit.preferredValues = keyedPreferred(property.preferredValues ?? []);
          else if (change === 'description' && property.type === 'SLOT') edit.description = property.description ?? '';
          else if (change === 'slotSettings' && property.type === 'SLOT') edit.slotSettings = property.slotSettings ?? {};
        }
        set.editComponentProperty(key, edit);
        break;
      }

      case 'DELETE_PROPERTY': {
        const definitions = set.componentPropertyDefinitions;
        const key = Object.keys(definitions).find((k) => definitions[k].type !== 'VARIANT' && nameOf(k) === step.name);
        if (key !== undefined) set.deleteComponentProperty(key);
        break;
      }

      case 'RENAME_AXIS': {
        // Measured (measured in a real file through use_figma, 2026-10-14): one call renames the axis in every member's name and keeps each node and each instance's value; shared plugin data does not follow.
        set.editComponentProperty(step.from, { name: step.to });
        for (const child of set.children) {
          const stamped = child.type === 'COMPONENT' && !copies.has(child) ? stampOn(child)?.is.member : undefined;
          const renamed = stamped === undefined ? undefined : renameAxis(stamped, step.from, step.to);
          if (renamed !== undefined) updateStamp(child, { is: { member: renamed } });
        }
        break;
      }

      case 'CREATE_MEMBER': {
        // All the new members at the first of these steps: built away from the set, appended together, then wired. Once one
        // is in, the set may disagree with itself on axes (Figma then refuses to be read) until the old members are deleted.
        // Measured (measured in a real file through use_figma, 2026-09-29): appending is enough; the new member's slots join the set's properties, and its
        // layers take the set's keys. It is built with no properties of its own and wired after it is in.
        if (keys) break;
        keys = keysOf(set);
        // A failure removes every member this step made, appended or not, and what it left loose on the page, before it goes on.
        const created: ComponentNode[] = [];
        await orRemoveWhatItMade(pageOf(set), created, async () => {
          const made: { node: ComponentNode; own: Build }[] = [];
          for (const { member: file } of steps.filter((s): s is Extract<Step, { kind: 'CREATE_MEMBER' }> => s.kind === 'CREATE_MEMBER')) {
            const node = figma.createComponent();
            created.push(node);
            node.name = file.name;
            const own: Build = { ...build(node), host: node, deferred: [] };
            stampNew(own, node, file.tree, { member: file.name });
            await applyFields(own, node, file.tree, true);
            await buildChildren(own, node, file.tree);
            made.push({ node, own });
          }
          for (const { node } of made) set.appendChild(node);
          for (const { node, own } of made) {
            for (const assign of own.deferred!) assign();
            result.created.push(node.name);
          }
        });
        break;
      }

      case 'DELETE_MEMBER': {
        const gone = await figma.getNodeByIdAsync(step.memberId);
        if (gone) gone.remove();
        await stripNodes(step.strip);
        result.deleted.push(step.name);
        break;
      }

      case 'CREATE_LAYER':
      case 'REPLACE_LAYER':
      case 'MOVE_LAYER':
      case 'PATCH_LAYER':
      case 'SWAP_COMPONENT':
      case 'DELETE_LAYER':
        if (await applyLayerStep(step, layerContext)) madeSlot = true;
        break;

      case 'RELAYOUT': {
        placeMembers(set, desired.members as Member[], spec, copies);
        break;
      }

      default:
        break;
    }
  }

  if (spec.description !== undefined) set.description = spec.description;
  // A slot the run made has its property's description and settings still to take.
  if (madeSlot) editProperties(set, spec);
  // Last: what Figma reports once every step is in.
  stampSet(set, spec);
  await stampReceipts(written);
  result.updated.push(...updated);
  return result;
}

/** Whether a layer replaced by `layer` hands what is inside it to the new node, so the layers under it outlive it. */
export const keepsChildren = (layer: Layer, old: BaseNode): boolean =>
  (layer.kind === 'FRAME' || layer.kind === 'SLOT') && 'children' in old && old.type !== 'INSTANCE';

/** An instance whose component the locator now answers with another (the file named another, or the lock another key) is swapped to it. */
async function swapComponent(build: Build, instance: InstanceNode, layer: Layer): Promise<void> {
  const value = layer.fields.component as Value | undefined;
  if (!value || value.kind === 'property') return;
  const wanted =
    value.kind === 'key'
      ? build.resolved.component({ key: value.key })
      : build.resolved.component({ name: String((value as { value: string }).value) });
  const current = await instance.getMainComponentAsync();
  if (current?.id !== wanted.id) instance.swapComponent(wanted);
}

/** What the steps that change a layer need to find the member (or the artboard) they are in. */
interface LayerContext {
  member(id: string): Promise<{ node: Container; layers: Map<string, SceneNode> }>;
  build(owner: Container): Build;
  /** The members, or for an artboard the artboard, that a step changed. */
  updated: Set<string>;
  artboard: boolean;
  /** The file's members, where a step that carries no layer finds its own. */
  members: Member[];
}

/** The file's layer at an address in a member, by the member's name. */
function layerAt(members: Member[], name: string, address: string): Layer | undefined {
  const find = (layer: Layer): Layer | undefined => (layer.address === address ? layer : layer.children.map(find).find(Boolean));
  const member = members.find((candidate) => candidate.name === name);
  return member && find(member.tree);
}

/**
 * Applies one step that creates, replaces, moves, patches or deletes a layer: those of a member and those of an artboard.
 * Returns true when it made a `SLOT` layer, whose property still has its description and settings to take.
 */
async function applyLayerStep(step: Step, context: LayerContext): Promise<boolean> {
  const { member, build, updated, artboard } = context;
  const nameOfLayer = (layer: Layer): string => layer.name ?? layer.address;
  // An instance has the slots its component gives it; the layers in them name those as their parent. Its properties are
  // written before its fields: a variant switch may resize it, and the size the file states comes after.
  const settle = async (
    b: Build,
    node: SceneNode,
    layer: Layer,
    layers: Map<string, SceneNode>,
    only?: ReadonlySet<string>,
  ): Promise<void> => {
    if (layer.kind !== 'INSTANCE') return;
    await applyInstanceProperties(b, node, layer, only);
    if (artboard) registerSlots(layers, layer.address, node);
  };
  let madeSlot = false;

  switch (step.kind) {
    case 'CREATE_LAYER': {
      const { node: owner, layers } = await member(step.memberId);
      const parent = layers.get(step.parent) as Container | undefined;
      if (!parent) throw new Error(`member "${step.member}": the parent "${step.parent}" of "${step.layer.address}" does not exist`);
      const b = build(owner);
      const node = createNode(b, step.layer);
      if (step.layer.kind === 'SLOT') madeSlot = true;
      placeAfter(parent, node as SceneNode, step.after ? layers.get(step.after) : undefined, step.after !== undefined);
      node.name = nameOfLayer(step.layer);
      stampNew(b, node as SceneNode, step.layer);
      await settle(b, node as SceneNode, step.layer, layers);
      await applyFields(b, node as SceneNode, step.layer, false);
      layers.set(step.layer.address, node as SceneNode);
      updated.add(step.member);
      break;
    }

    case 'REPLACE_LAYER': {
      const { node: owner, layers } = await member(step.memberId);
      const old = await figma.getNodeByIdAsync(step.nodeId);
      const parent = layers.get(step.parent) as Container | undefined;
      if (!old || !parent) throw new Error(`member "${step.member}": cannot replace "${step.layer.address}"`);
      const b = build(owner);
      const node = createNode(b, step.layer);
      if (step.layer.kind === 'SLOT') madeSlot = true;
      placeAfter(parent, node as SceneNode, step.after ? layers.get(step.after) : undefined, step.after !== undefined);
      node.name = nameOfLayer(step.layer);
      stampNew(b, node as SceneNode, step.layer);
      await settle(b, node as SceneNode, step.layer, layers);
      await applyFields(b, node as SceneNode, step.layer, false);
      // What was inside comes along, so the layers under it stay the same nodes. A text or an instance holds none.
      if (keepsChildren(step.layer, old)) {
        for (const child of [...(old as BaseNode & ChildrenMixin).children]) node.appendChild(child as SceneNode);
      }
      old.remove();
      await stripNodes(step.strip);
      layers.set(step.layer.address, node as SceneNode);
      updated.add(step.member);
      break;
    }

    case 'MOVE_LAYER': {
      const { layers } = await member(step.memberId);
      const moving = await figma.getNodeByIdAsync(step.nodeId);
      const parent = layers.get(step.parent) as Container | undefined;
      if (!moving || !parent) throw new Error(`member "${step.member}": cannot move "${step.address}"`);
      placeAfter(parent, moving as SceneNode, step.after ? layers.get(step.after) : undefined, step.after !== undefined);
      updated.add(step.member);
      break;
    }

    case 'PATCH_LAYER': {
      const { node: owner, layers } = await member(step.memberId);
      const root = step.nodeId === step.memberId;
      const node = root ? owner : ((await figma.getNodeByIdAsync(step.nodeId)) as SceneNode | null);
      if (!node) throw new Error(`member "${step.member}": the layer "${step.layer.address}" is no longer in the file`);
      const b = build(owner);
      const only = withResets(step.layer, step.fields);
      await settle(b, node as SceneNode, step.layer, layers, only);
      await applyFields(b, node as SceneNode, step.layer, root, only);
      // A layer a designer renamed is still found by stamp, and gets the file's name back.
      node.name = root && !artboard ? step.member : nameOfLayer(step.layer);
      // Its receipt follows once the run's writes are done: one the file stopped declaring was reported and leaves it.
      b.written.push({ node: node as SceneNode, layer: step.layer, fields: [...only, ...(step.restamp ?? [])] });
      layers.set(step.layer.address, node as SceneNode);
      updated.add(step.member);
      break;
    }

    case 'SWAP_COMPONENT': {
      const { node: owner, layers } = await member(step.memberId);
      const node = (await figma.getNodeByIdAsync(step.nodeId)) as InstanceNode | null;
      const layer = layerAt(context.members, step.member, step.address);
      if (!node || !layer) throw new Error(`member "${step.member}": the instance "${step.address}" is no longer in the file`);
      const b = build(owner);
      // As a patch of `component` did: its property references written again, then the swap where the component differs.
      const only = new Set(['component']);
      await applyFields(b, node, layer, false, only);
      await swapComponent(b, node, layer);
      // Its receipt follows once the run's writes are done, so a real run holds the new component's and the next plans nothing.
      b.written.push({ node, layer, fields: ['component'] });
      await settle(b, node, layer, layers, only);
      updated.add(step.member);
      break;
    }

    case 'DELETE_LAYER': {
      const gone = await figma.getNodeByIdAsync(step.nodeId);
      // A layer inside one that was deleted is already gone.
      if (gone) gone.remove();
      await stripNodes(step.strip);
      updated.add(step.member);
      break;
    }

    default:
      break;
  }
  return madeSlot;
}

export interface UpdatedArtboard {
  /** The addresses of the layers made, patched and removed. */
  created: string[];
  updated: string[];
  deleted: string[];
  warnings: string[];
}

/**
 * Applies the steps that change an artboard that exists: the layers of its frame, in the order the diff planned them.
 *
 * The frame keeps its node id, and so does every layer the file still produces. A layer the file stopped producing is
 * removed, which the run's gate has already put to the person who ran it.
 */
export async function applyArtboardUpdate(frameId: string, steps: Step[], desired: Desired, resolved: Resolved): Promise<UpdatedArtboard> {
  const result: UpdatedArtboard = { created: [], updated: [], deleted: [], warnings: [] };
  const found = await figma.getNodeByIdAsync(frameId);
  if (found?.type !== 'FRAME') throw new Error(`the artboard ${frameId} is no longer in the file`);
  const frame = found;
  const [member] = desired.members;

  // New nodes are created on the current page and moved into place, so the page is the one the artboard is on.
  await figma.setCurrentPageAsync(pageOf(frame));
  const hasText = (layer: Layer): boolean => layer.kind === 'TEXT' || layer.children.some(hasText);
  if (hasText(member.tree)) await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  for (const style of resolved.textStyles()) await figma.loadFontAsync(style.fontName);

  const layers = await indexMember(frame, true);
  const written: Written[] = [];
  const context: LayerContext = {
    member: async () => ({ node: frame, layers }),
    build: () => artboardBuild(frame, member.name, resolved, result.warnings, written),
    updated: new Set<string>(),
    artboard: true,
    members: desired.members as Member[],
  };
  for (const step of steps) {
    await applyLayerStep(step, context);
    if (step.kind === 'CREATE_LAYER' || step.kind === 'REPLACE_LAYER') result.created.push(step.layer.address);
    else if (step.kind === 'PATCH_LAYER' || step.kind === 'SWAP_COMPONENT') {
      // A swapped instance with other fields to write is one layer updated, not two.
      const address = step.kind === 'PATCH_LAYER' ? step.layer.address : step.address;
      if (!result.updated.includes(address)) result.updated.push(address);
    } else if (step.kind === 'DELETE_LAYER') result.deleted.push(step.address);
  }
  await stampReceipts(written);
  return result;
}
