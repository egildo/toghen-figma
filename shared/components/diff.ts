/**
 * Members and a snapshot to steps. Pure: this is tested without Figma.
 *
 * The snapshot is what the Figma side found by stamp, as plain data; the diff is
 * the design's table of situations turned into code. A dry run stops here.
 */

import type {
  Component,
  ComponentRef,
  Layer,
  LayerKind,
  Member,
  PreferredValue,
  Property,
  SetField,
  SlotSettings,
  Value,
} from './model.js';
import type { SetSpec, Step } from './steps.js';

/** A node inside a member that carries no stamp: someone else's. */
export interface UnstampedNode {
  id: string;
  name: string;
  /** The address of the stamped layer it sits in, when it sits in one. */
  parent?: string;
}

export interface LayerSnapshot {
  id: string;
  /** The layer's name in Figma now, which a designer may have changed. */
  name: string;
  address: string;
  kind: LayerKind;
  /** The address of its parent layer; absent for the root, which is the member itself. */
  parent?: string;
  index: number;
  /** The fields Toghen owns on it, each with the hash of what Figma reported when Toghen last wrote it: its stamp's receipt. An empty hash is a field owned before receipts. */
  receipt: Record<string, string>;
  /** The same fields, each with the hash of what Figma reports now. */
  reported: Record<string, string>;
  /** Toghen's layer, moved: its stamp names another id, so it is patched, if only to write its stamp again with its own. */
  moved?: true;
  /**
   * An instance's component as Figma holds it now, a variant by its set: its name, its key, and for a library's the
   * library the lock holds its key under (empty when none). `reported.component` is then always read, receipt or not.
   */
  main?: { name: string; key: string; library?: string };
}

export interface MemberSnapshot {
  id: string;
  /** The combination, from its stamp. */
  name: string;
  layers: LayerSnapshot[];
  unstamped: UnstampedNode[];
  /** Layers a person copied from one of Toghen's: each carries the original's stamp, and is left alone. */
  copies?: { id: string; name: string; address: string }[];
}

/** A property of the set as Figma holds it, without the `VARIANT` axes, which follow the members' names. */
export interface PropertySnapshot {
  key: string;
  name: string;
  type: 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP' | 'SLOT';
  defaultValue: string | boolean;
  description?: string;
  preferredValues?: PreferredValue[];
  slotSettings?: SlotSettings;
}

export interface SetSnapshot {
  id: string;
  /** Every property of the set that is not a variant axis, ours or not. */
  definitions: PropertySnapshot[];
  /** The names of the component properties Toghen added: the keys of the set's receipt. */
  properties: string[];
  members: MemberSnapshot[];
  /** Children of the set that are not a stamped member. */
  unstamped: { id: string; name: string }[];
  /** Members a person copied from one of Toghen's, each with the combination of the original: left alone. */
  copies?: { id: string; name: string; of: string }[];
}

export interface Snapshot {
  /** The set stamped with this component's name. */
  set?: SetSnapshot;
  /** Sets of the same name that carry no stamp. */
  foreign: { id: string; name: string }[];
  /** Sets a person copied from Toghen's: they carry its stamp, and are left alone. */
  copies?: { id: string; name: string }[];
}

/** The frame stamped as this artboard, read like a member: its layers by stamp, and what is not ours. */
export interface ArtboardSnapshot {
  artboard?: MemberSnapshot;
  /** Frames a person copied from the artboard's: left alone. */
  copies?: { id: string; name: string }[];
}

/**
 * The parent a layer in an instance's slot has: not the instance, which has the slot, but the slot of it.
 * Nothing else has an address with this character in it.
 */
export const slotKey = (address: string, slot: string): string => `${address}\u0000${slot}`;
const slotPrefix = (address: string): string => `${address}\u0000`;

/** The fields a layer's receipt lists: its field names, and for an instance each property its `set` writes. */
export function fieldNames(layer: Layer): string[] {
  const names: string[] = [];
  for (const field of Object.keys(layer.fields)) {
    if (field === 'set') for (const name of Object.keys(layer.fields.set as SetField)) names.push(`set ${name}`);
    else names.push(field);
  }
  return names;
}

/** The same data with every object's keys in order, so two writes of it give one text. */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) out[key] = stable((value as Record<string, unknown>)[key]);
  return out;
}

/**
 * A value in a few characters: a hash of its JSON with every object's keys in order, so key order does not change it.
 * FNV-1a: not a defence against anything, only a way to tell two values apart that is short enough for a stamp.
 */
export function hashOf(value: unknown): string {
  const text = JSON.stringify(stable(value)) ?? '';
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${hash.toString(36)}-${text.length.toString(36)}`;
}

/** What the diff is told about receipts: the receipt the file's value would leave on a layer (`expectedOf`), and whether drift is overwritten. */
export interface Receipts {
  expected(layer: Layer): Record<string, string>;
  overwriteDrift?: boolean;
  /** What the locator answered for a component the file names: its name, the key it imports (or would), and the declared library it came from. */
  component?(ref: ComponentRef): { name: string; key?: string; library?: string };
  /** A preferred value as the target reports it: one by name as the key of what the locator answered, when it answered. */
  preferred?(value: PreferredValue): PreferredValue;
  /** The id an instance swap's default would be set to: that of the component the locator answers, when it answers. */
  defaultComponent?(ref: ComponentRef): string | undefined;
}

const specOf = (component: SetSpec): SetSpec => ({
  name: component.name,
  ...(component.description !== undefined ? { description: component.description } : {}),
  properties: component.properties,
  ...(component.across !== undefined ? { across: component.across } : {}),
});

/** `Axis=value, Axis=value` as pairs, or undefined when a part does not read as one (a name no member of ours has). */
export function parseCombination(name: string): [string, string][] | undefined {
  const pairs: [string, string][] = [];
  for (const part of name.split(', ')) {
    const at = part.indexOf('=');
    if (at < 1) return undefined;
    pairs.push([part.slice(0, at), part.slice(at + 1)]);
  }
  return pairs;
}

/** A combination with one axis renamed, or undefined when the name does not read as one. */
export function renameAxis(name: string, from: string, to: string): string | undefined {
  return parseCombination(name)
    ?.map(([axis, value]) => `${axis === from ? to : axis}=${value}`)
    .join(', ');
}

/**
 * An axis the file renamed, when that is the only difference in the axes: the held members all have the same axes, the
 * file's differ from them in one name at one position, the new name is not held, and the values on it are the old ones
 * (as sets: the order is the layout's). Anything looser is a replacement, left to the members created and deleted.
 */
function inferRename(members: Member[], set: SetSnapshot): { from: string; to: string } | undefined {
  const held = set.members.map((member) => parseCombination(member.name));
  if (held.length === 0 || held.some((pairs) => pairs === undefined)) return undefined;
  const axes = (held[0] as [string, string][]).map(([axis]) => axis);
  if (held.some((pairs) => (pairs as [string, string][]).map(([axis]) => axis).join('\u0000') !== axes.join('\u0000'))) return undefined;
  const wanted = members[0] ? Object.keys(members[0].combination) : [];
  const at = axes.findIndex((axis, index) => axis !== wanted[index]);
  if (
    at === -1 ||
    axes.length !== wanted.length ||
    axes.some((axis, index) => index !== at && axis !== wanted[index]) ||
    axes.includes(wanted[at])
  )
    return undefined;
  const values = (list: string[]): string => [...new Set(list)].sort().join('\u0000');
  const used = held.map((pairs) => (pairs as [string, string][])[at][1]);
  return values(used) === values(members.map((member) => member.combination[wanted[at]])) ? { from: axes[at], to: wanted[at] } : undefined;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The layer without its children: a step patches one layer, and its children are steps of their own. */
const bare = (layer: Layer): Layer => ({ ...layer, children: [] });

/**
 * Properties: what to add, edit and delete on the set.
 *
 * Ours are the names in the set's `properties` stamp. A property in the set that
 * the stamp does not list is foreign and is left, and reported, even when the
 * file declares the same name: the design never adopts by name.
 */
function diffProperties(component: SetSpec, set: SetSnapshot, receipts?: Receipts): Step[] {
  const steps: Step[] = [];
  const declared = component.properties.filter((p): p is Exclude<Property, { type: 'VARIANT' }> => p.type !== 'VARIANT');
  const ours = new Set(set.properties);
  const held = new Map(set.definitions.map((definition) => [definition.name, definition]));

  // A property whose type changed cannot be edited into the new one: it is replaced, and instances lose it.
  for (const property of declared) {
    const definition = held.get(property.name);
    if (definition && definition.type !== property.type && ours.has(property.name)) {
      steps.push({
        kind: 'DELETE_PROPERTY',
        name: property.name,
        breaks: `the ${definition.type} property "${property.name}" became a ${property.type}: instances lose its overrides`,
      });
      held.delete(property.name);
    }
  }

  for (const property of declared) {
    const definition = held.get(property.name);
    if (!definition) {
      // A SLOT property comes with its SLOT layer, which is made with `createSlot()`.
      if (property.type !== 'SLOT') steps.push({ kind: 'ADD_PROPERTY', property });
    } else if (!ours.has(property.name)) {
      steps.push({
        kind: 'LEAVE',
        what: 'property',
        message: `the set has a property "${property.name}" that Toghen did not add, and the file declares one of that name; it was left as it is`,
      });
    } else {
      const changes: string[] = [];
      // A default that is a token is bound to a variable, which only the Figma side can resolve: it is always re-set.
      if ((property.type === 'BOOLEAN' || property.type === 'TEXT') && definition.defaultValue !== property.default) {
        changes.push('defaultValue');
      }
      // An instance swap's default is the id of the component the file names, which only the target side can resolve:
      // compared through the receipts, and re-set when they cannot answer.
      if (property.type === 'INSTANCE_SWAP' && definition.defaultValue !== receipts?.defaultComponent?.(property.default))
        changes.push('defaultValue');
      // Figma reports a slot with no preferred values as `[]` (measured), and the file leaves them out: the same thing.
      const preferred = (property.type === 'INSTANCE_SWAP' || property.type === 'SLOT' ? (property.preferredValues ?? []) : []).map(
        (value) => receipts?.preferred?.(value) ?? value,
      );
      if ((property.type === 'INSTANCE_SWAP' || property.type === 'SLOT') && !same(definition.preferredValues ?? [], preferred)) {
        changes.push('preferredValues');
      }
      if (property.type === 'SLOT') {
        if (definition.description !== property.description) changes.push('description');
        if (!same(definition.slotSettings, property.slotSettings)) changes.push('slotSettings');
      }
      if (changes.length > 0) steps.push({ kind: 'EDIT_PROPERTY', property, changes });
    }
  }

  const declaredNames = new Set(declared.map((property) => property.name));
  for (const definition of set.definitions) {
    if (declaredNames.has(definition.name)) continue;
    if (ours.has(definition.name)) {
      steps.push({
        kind: 'DELETE_PROPERTY',
        name: definition.name,
        breaks: `the ${definition.type} property "${definition.name}" is no longer declared: instances lose it`,
      });
    } else {
      steps.push({
        kind: 'LEAVE',
        what: 'property',
        message: `the set has a property "${definition.name}" that Toghen did not add; it was left as it is`,
      });
    }
  }
  return steps;
}

interface Placed {
  layer: Layer;
  /** The address of the layer it sits in, or for a layer in an instance's slot, `slotKey` of the instance and the slot. */
  parent: string;
  /** The address of the layer before it under its parent, in the file. */
  after?: string;
}

/** The layers of a tree but the root, parents before their children. */
function placed(parent: Layer, out: Placed[] = []): Placed[] {
  // Under one parent, the layers of each slot are a row of their own.
  const previous = new Map<string, string>();
  for (const layer of parent.children) {
    const key = layer.slot === undefined ? parent.address : slotKey(parent.address, layer.slot);
    const after = previous.get(key);
    out.push({ layer, parent: key, ...(after !== undefined ? { after } : {}) });
    previous.set(key, layer.address);
    placed(layer, out);
  }
  return out;
}

/**
 * One member that exists: what to do to each of its layers.
 *
 * Layers are found by the address in their stamp, never by name, so a layer a
 * designer renamed is still ours and is patched. A layer is moved when its
 * parent changed, or when the order of the layers the file and the member share
 * differs; a node Toghen does not own beside it does not count.
 *
 * A field is written only when its receipt says to (`patch`); without `receipts` every declared field is.
 */
function diffMember(member: Member, snap: MemberSnapshot, component: string, artboard = false, receipts?: Receipts): Step[] {
  const steps: Step[] = [];
  const context = { member: member.name, memberId: snap.id };
  const byAddress = new Map(snap.layers.filter((layer) => layer.id !== snap.id).map((layer) => [layer.address, layer]));
  const rootStamp = snap.layers.find((layer) => layer.id === snap.id);
  const what = artboard ? 'artboard' : 'member';

  /**
   * Which of a layer's fields to write, from the two comparisons with its receipt. Figma against the receipt: a field
   * that differs was edited by hand since Toghen wrote it, and is drift, kept and said, or with `overwriteDrift` written
   * and said; unless Figma already holds what the file asks for, which is agreement: nothing is written or said, and the
   * receipt is taken again. The file against the receipt: a field that differs moved in the file, and is written. A
   * field the receipt lacks, or holds no hash for, is new to Toghen and written. The layer is patched when a field is to
   * be written or its receipt taken again, when in a set its name is not the file's, or when its receipt lists a field
   * the file no longer declares, which is said once.
   */
  const patch = (layer: Layer, existing: LayerSnapshot | undefined, nodeId: string, name: string): void => {
    const declared = fieldNames(layer);
    const expected = existing && receipts ? receipts.expected(layer) : {};
    const fields: string[] = [];
    const restamp: string[] = [];
    for (const field of declared) {
      const held = existing?.receipt[field];
      if (!held) fields.push(field);
      else if (existing.reported[field] !== held && existing.reported[field] === expected[field]) restamp.push(field);
      else if (existing.reported[field] !== held) {
        const at = `${what} "${member.name}", layer "${layer.address}": "${field}" was changed in Figma since Toghen wrote it`;
        if (receipts?.overwriteDrift) {
          steps.push({
            kind: 'OVERWRITE',
            member: member.name,
            address: layer.address,
            message: `${at}; the file's value is written over it`,
          });
          fields.push(field);
        } else {
          steps.push({
            kind: 'LEAVE',
            what: 'drift',
            message: `${at}, and was left as it is; pass --overwrite-drift to write the file's value`,
          });
        }
      } else if (expected[field] !== held) fields.push(field);
    }
    const dropped = Object.keys(existing?.receipt ?? {}).filter((field) => !declared.includes(field));
    for (const field of dropped) {
      steps.push({
        kind: 'LEAVE',
        what: 'field',
        message: `${what} "${member.name}", layer "${layer.address}": the file no longer declares "${field}", so its value was left as it is`,
      });
    }
    // An instance whose component is to be written is swapped: a step of its own, so each swap is one row (R14).
    const swapped = layer.fields.component as Value | undefined;
    if (existing && layer.kind === 'INSTANCE' && fields.includes('component') && swapped && swapped.kind !== 'property') {
      fields.splice(fields.indexOf('component'), 1);
      const ref: ComponentRef = swapped.kind === 'key' ? { key: swapped.key } : { name: String((swapped as { value: string }).value) };
      const to = receipts?.component?.(ref) ?? { name: 'name' in ref ? ref.name : `(key)"${ref.key}"` };
      const shown = existing.reported.component;
      // Figma already shows it: only the receipt is taken again. A dry run that would import it compares keys instead.
      if (shown !== undefined && shown === expected.component) restamp.push('component');
      else if (expected.component !== undefined || to.key === undefined || to.key !== existing.main?.key) {
        steps.push({
          kind: 'SWAP_COMPONENT',
          ...context,
          nodeId,
          address: layer.address,
          component,
          from: existing.main?.name ?? '',
          ...(existing.main?.library !== undefined ? { fromLibrary: existing.main.library } : {}),
          to: to.name,
          ...(to.library !== undefined ? { library: to.library } : {}),
        });
      }
    }
    if (
      !existing ||
      fields.length > 0 ||
      restamp.length > 0 ||
      dropped.length > 0 ||
      existing.moved ||
      (!artboard && existing.name !== name)
    ) {
      steps.push({ kind: 'PATCH_LAYER', ...context, nodeId, layer: bare(layer), fields, ...(restamp.length > 0 ? { restamp } : {}) });
    }
  };

  patch(member.tree, rootStamp, snap.id, member.name);

  const layers = placed(member.tree);
  const desiredSequence = new Map<string, string[]>();
  for (const entry of layers) desiredSequence.set(entry.parent, [...(desiredSequence.get(entry.parent) ?? []), entry.layer.address]);

  // A layer replaced by another kind, where either kind is an instance, loses what its slots held: those layers are made again.
  const lost = new Set<string>();
  if (artboard) {
    const replaced = layers.filter(({ layer }) => {
      const existing = byAddress.get(layer.address);
      return existing && existing.kind !== layer.kind && (existing.kind === 'INSTANCE' || layer.kind === 'INSTANCE');
    });
    const isIn = (parent: string | undefined, address: string): boolean =>
      parent !== undefined && (parent === address || parent.startsWith(slotPrefix(address)));
    const frontier = replaced.map(({ layer }) => layer.address);
    while (frontier.length > 0) {
      const address = frontier.pop() as string;
      for (const candidate of snap.layers) {
        if (candidate.id !== snap.id && !lost.has(candidate.address) && isIn(candidate.parent, address)) {
          lost.add(candidate.address);
          frontier.push(candidate.address);
        }
      }
    }
  }

  // The order of the children a parent shares between the file and the member.
  const sharedOrder = (parent: string): { desired: string[]; actual: string[] } => {
    const inFile = desiredSequence.get(parent) ?? [];
    const inMember = snap.layers
      .filter((layer) => layer.parent === parent && inFile.includes(layer.address) && !lost.has(layer.address))
      .sort((a, b) => a.index - b.index)
      .map((layer) => layer.address);
    return { desired: inFile.filter((address) => inMember.includes(address)), actual: inMember };
  };

  for (const { layer, parent, after } of layers) {
    const existing = lost.has(layer.address) ? undefined : byAddress.get(layer.address);
    const place = after !== undefined ? { after } : {};
    if (!existing) {
      steps.push({ kind: 'CREATE_LAYER', ...context, layer: bare(layer), parent, ...place });
      continue;
    }
    if (existing.kind !== layer.kind) {
      steps.push({
        kind: 'REPLACE_LAYER',
        ...context,
        nodeId: existing.id,
        layer: bare(layer),
        parent,
        ...place,
        breaks: `${what} "${member.name}", layer "${layer.address}" changed from ${existing.kind} to ${layer.kind}: overrides on it are lost`,
      });
      continue;
    }
    const order = sharedOrder(parent);
    const before = (list: string[]): string | undefined => list[list.indexOf(layer.address) - 1];
    if (existing.parent !== parent || before(order.desired) !== before(order.actual)) {
      steps.push({ kind: 'MOVE_LAYER', ...context, nodeId: existing.id, address: layer.address, parent, ...place });
    }
    patch(layer, existing, existing.id, layer.name ?? layer.address);
  }

  // Deletions last: what a deleted layer held that the file still wants has been moved out by now.
  const wanted = new Set(layers.map((entry) => entry.layer.address));
  // A layer whose parent is removed goes with it, so it has no step of its own: a second delete would find nothing.
  // A parent the file still wants is moved out first, with what it holds, and is no reason to skip.
  const parentRemoved = (layer: LayerSnapshot): boolean =>
    layer.parent !== undefined && byAddress.has(layer.parent) && !wanted.has(layer.parent);
  for (const layer of byAddress.values()) {
    // A layer that is made again is not removed here: the old one went with what replaced its parent.
    if (wanted.has(layer.address) || parentRemoved(layer)) continue;
    steps.push({
      kind: 'DELETE_LAYER',
      ...context,
      nodeId: layer.id,
      address: layer.address,
      ...(artboard
        ? { breaks: `artboard "${member.name}", layer "${layer.address}" is no longer in the file: it is removed, with whatever it holds` }
        : {}),
    });
  }
  for (const node of snap.unstamped) {
    steps.push({
      kind: 'LEAVE',
      what: 'unstamped-node',
      message: `${what} "${member.name}": "${node.name}" (${node.id}) has no stamp and was left alone`,
    });
  }
  for (const node of snap.copies ?? []) {
    steps.push({
      kind: 'LEAVE',
      what: 'copy',
      message: `${what} "${member.name}": "${node.name}" (${node.id}) is a copy of Toghen's layer "${node.address}", left alone`,
    });
  }
  return steps;
}

/** A copy of a set or an artboard's frame, as its row says. */
const copyRows = (copies: { id: string; name: string }[] | undefined, what: string): Step[] =>
  (copies ?? []).map((node) => ({
    kind: 'LEAVE',
    what: 'copy',
    message: `"${node.name}" (${node.id}) is a copy of Toghen's ${what}, left alone`,
  }));

/**
 * What to do about an artboard, given what Figma holds: build it whole when it is not there, otherwise the difference.
 *
 * The frame is found by its stamp wherever a person moved it, and its layers by theirs. A layer without a stamp
 * is left alone and said. Nothing is adopted by name, so a frame that merely has the artboard's name is not touched.
 */
export function diffArtboard(member: Member, snapshot: ArtboardSnapshot, receipts?: Receipts): Step[] {
  if (!snapshot.artboard) return [{ kind: 'CREATE_ARTBOARD', member }];
  return [...diffMember(member, snapshot.artboard, member.name, true, receipts), ...copyRows(snapshot.copies, `artboard "${member.name}"`)];
}

/**
 * What to do about a component, given what Figma holds.
 *
 * A foreign set is refused before anything else: two sets of one name are
 * ambiguous for anyone, and Toghen never adopts by name. A set Toghen made is
 * reconciled: only the difference between the file and the stamped nodes is
 * planned, in the order it can be applied.
 */
export function diff(members: Member[], component: SetSpec, snapshot: Snapshot, receipts?: Receipts): Step[] {
  if (snapshot.foreign.length > 0) {
    const ids = snapshot.foreign.map((node) => node.id);
    return [
      {
        kind: 'REFUSE_FOREIGN',
        component: component.name,
        nodeIds: ids,
        message: `a component set named "${component.name}" already exists (${ids.join(', ')}) and Toghen did not make it; rename or delete it, or build on a page where it is not. Toghen never adopts a set by name`,
      },
    ];
  }
  const set = snapshot.set;
  if (!set) return [{ kind: 'CREATE_SET', component: specOf(component), members }];

  const steps: Step[] = diffProperties(component, set, receipts);
  // A renamed axis is renamed in place; the members are then paired by their new names, as any others.
  const rename = inferRename(members, set);
  if (rename) steps.push({ kind: 'RENAME_AXIS', ...rename });
  const present = rename
    ? set.members.map((member) => ({ ...member, name: renameAxis(member.name, rename.from, rename.to) as string }))
    : set.members;
  const held = new Map(present.map((member) => [member.name, member]));
  const wanted = new Set(members.map((member) => member.name));

  for (const member of members) {
    const existing = held.get(member.name);
    if (existing) steps.push(...diffMember(member, existing, component.name, false, receipts));
  }
  for (const member of members) {
    if (!held.has(member.name)) steps.push({ kind: 'CREATE_MEMBER', member });
  }
  for (const member of present) {
    if (!wanted.has(member.name)) {
      steps.push({
        kind: 'DELETE_MEMBER',
        memberId: member.id,
        name: member.name,
        breaks: `the member "${member.name}" is gone: instances of it lose their variant`,
      });
    }
  }
  for (const node of set.unstamped) {
    steps.push({
      kind: 'LEAVE',
      what: 'unstamped-member',
      message: `"${node.name}" (${node.id}) in the set has no member stamp and was left alone`,
    });
  }
  for (const node of set.copies ?? []) {
    steps.push({
      kind: 'LEAVE',
      what: 'copy',
      message: `"${node.name}" (${node.id}) in the set is a copy of Toghen's member "${node.of}", left alone`,
    });
  }
  steps.push(...copyRows(snapshot.copies, `set "${component.name}"`));
  steps.push({ kind: 'RELAYOUT' });
  return steps;
}

export interface MemberCell {
  name: string;
  row: number;
  column: number;
}

/** The board of a set's members: where each sits, and the gap before each column and each row. */
export interface Board {
  cells: MemberCell[];
  /** `columnGaps[c]` is the gap between column `c - 1` and column `c`; the first is 0. One entry per column of the board, empty ones included. */
  columnGaps: number[];
  rowGaps: number[];
}

// ponytail: a fixed gap between members; a design that wants another spacing makes it an option
/** The gap between two members inside the innermost group of an axis. */
export const MEMBER_GAP = 40;

type Axis = { name: string; values: string[] };

/**
 * The axes that go across. The file may name them (`across=` on the component line); otherwise the last axis goes
 * across, and while the columns are fewer than the rows and more than one axis is down, the last of the down axes
 * moves across too. Either way they keep the order they were declared in.
 */
function acrossAxes(axes: Axis[], across: string[] | undefined): Axis[] {
  if (across) return axes.filter((axis) => across.includes(axis.name));
  const product = (list: Axis[]): number => list.reduce((count, axis) => count * axis.values.length, 1);
  let split = axes.length - 1;
  while (split > 1 && product(axes.slice(split)) < product(axes.slice(0, split))) split -= 1;
  return axes.slice(split);
}

/**
 * One direction of the board as a mixed-radix count: a member's index among the combinations of these axes (each
 * axis's values in declared order, the earlier axis the more significant), and the gap before each index, which
 * grows outward: 40 px times one plus the nesting level of the outermost axis whose value changes there.
 */
function count(axes: Axis[]): { indexOf(combination: Record<string, string>): number; gaps: number[] } {
  const radix = axes.map((axis) => axis.values.length);
  const stride = radix.map((_, at) => radix.slice(at + 1).reduce((product, r) => product * r, 1));
  const total = radix.reduce((product, r) => product * r, 1);
  const digit = (index: number, at: number): number => Math.floor(index / stride[at]) % radix[at];
  const gaps = Array.from({ length: total }, (_, index) => {
    if (index === 0) return 0;
    const changed = axes.findIndex((_axis, at) => digit(index - 1, at) !== digit(index, at));
    return MEMBER_GAP * (1 + (axes.length - 1 - changed));
  });
  return {
    indexOf: (combination) => axes.reduce((sum, axis, at) => sum + axis.values.indexOf(combination[axis.name]) * stride[at], 0),
    gaps,
  };
}

/**
 * Where each member sits on the set's board, the variant matrix designers draw: the axes are split into those that go
 * across and those that go down, and within each direction they nest, an earlier axis being the outer group. The member
 * of every first value is at the origin, which is how Figma picks a set's default variant. A combination the file
 * excludes leaves its cell empty, so the columns and rows stay aligned.
 */
export function memberBoard(members: Member[], component: Pick<Component, 'properties' | 'across'>): Board {
  const axes = component.properties.filter((p) => p.type === 'VARIANT') as Axis[];
  const across = acrossAxes(axes, component.across);
  const down = axes.filter((axis) => !across.includes(axis));
  const columns = count(across);
  const rows = count(down);
  return {
    cells: members.map((member) => ({
      name: member.name,
      row: rows.indexOf(member.combination),
      column: columns.indexOf(member.combination),
    })),
    columnGaps: columns.gaps,
    rowGaps: rows.gaps,
  };
}
