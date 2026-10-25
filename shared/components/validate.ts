/**
 * Model to problems: what needs more than one node to check.
 *
 * `check.ts` refuses what is wrong with a node and its fields on their own; this
 * refuses what is only wrong in relation to something else: a property nothing
 * wires, a grid child with no cell, a guard that compares a name that is no
 * variant axis. It runs once over the component as written (its properties, its
 * exclusions and the guards in its document), once over each member, because a
 * `when` can break what the other members got right, and once over all the
 * members together, for what only the whole set can say.
 */

import type { Document, Item } from 'kdlet';
import type { Condition, Operand } from 'kdlet-guards';
import { FIELDS, GRID_CHILD_FIELDS, GRID_ONLY_FIELDS, NOT_IN_GRID_FIELDS, WRAP_FIELDS, isStructured } from './fields.js';
import { memberName } from './members.js';
import type { Component, FieldValue, Layer, Loc, Member, Problem, Property, Value } from './model.js';

type Wirable = Property & { type: 'BOOLEAN' | 'TEXT' | 'INSTANCE_SWAP' };

const isWirable = (property: Property): property is Wirable =>
  property.type === 'BOOLEAN' || property.type === 'TEXT' || property.type === 'INSTANCE_SWAP';

function walk(layer: Layer, visit: (layer: Layer, parent: Layer | undefined) => void, parent?: Layer): void {
  visit(layer, parent);
  for (const child of layer.children) walk(child, visit, layer);
}

const plain = (layer: Layer, field: string): string | number | boolean | null | undefined => {
  const value = layer.fields[field] as Value | undefined;
  return value && value.kind === 'plain' ? value.value : undefined;
};

const describe = (layer: Layer): string => `${layer.kind} "${layer.address}"`;

/** Where a problem with one field of a layer should point: the field, else the layer. */
const fieldAt = (layer: Layer, field: string): Loc | undefined => layer.fieldLoc?.[field] ?? layer.loc;

export class Report {
  readonly problems: Problem[] = [];
  constructor(private readonly member?: string) {}

  error(message: string, loc?: Loc): void {
    this.add('error', message, loc);
  }

  warning(message: string, loc?: Loc): void {
    this.add('warning', message, loc);
  }

  private add(severity: Problem['severity'], message: string, loc?: Loc): void {
    this.problems.push({ severity, message, ...(loc ?? {}), ...(this.member !== undefined ? { member: this.member } : {}) });
  }
}

/**
 * Layout consistency for one layer and its children.
 *
 * A grid and a flow layout take disjoint fields, and Figma throws when a field
 * meets the wrong layout, so the file is refused before anything is built.
 */
export function checkLayout(layer: Layer, parent: Layer | undefined, report: Report): void {
  const mode = plain(layer, 'layoutMode') ?? 'NONE';
  const what = describe(layer);

  if (layer.kind === 'SLOT' && mode === 'GRID') {
    report.error(`${what} cannot be a GRID: a slot may sit in a grid but may not be one`, fieldAt(layer, 'layoutMode'));
    return;
  }

  if (!parent && 'grid' in layer.fields) {
    report.error(`${what} is the root and has no parent grid to place it in`, fieldAt(layer, 'grid'));
  }
  if (!parent) {
    for (const field of ['layoutSizingHorizontal', 'layoutSizingVertical']) {
      if (plain(layer, field) === 'FILL') {
        report.error(`${what} is the root and has no parent to fill; ${field} can be FIXED or HUG`, fieldAt(layer, field));
      }
    }
  }

  // A size bound to a token is a fixed size: beside a sizing that lets the layer size itself, the file says two things,
  // and the target settles on one of them, so every run writes the other again.
  for (const [size, sizing] of [
    ['width', 'layoutSizingHorizontal'],
    ['height', 'layoutSizingVertical'],
  ] as const) {
    const bound = layer.fields[size] as Value | undefined;
    if (bound?.kind !== 'token') continue;
    const said = plain(layer, sizing);
    const resize = plain(layer, 'textAutoResize');
    const auto =
      said === 'HUG' || said === 'FILL'
        ? `${sizing}=${said}`
        : resize === 'WIDTH_AND_HEIGHT' || (size === 'height' && resize === 'HEIGHT')
          ? `textAutoResize=${resize}`
          : undefined;
    if (auto === undefined) continue;
    const keep = auto.startsWith('textAutoResize') ? `write textAutoResize=${size === 'height' ? 'NONE' : 'HEIGHT'}` : `drop ${said}`;
    report.error(
      `${what}: "${size}" is bound to {${bound.path}} while ${auto}: a bound ${size} is a fixed size; write ${auto} and drop the ${size} token, or keep the token and ${keep}`,
      fieldAt(layer, size),
    );
  }

  // A frame that hugs an axis its children only fill has nothing to size it by: the target sets one of the two back
  // (FigCraft 0.10.0 sets the child to FIXED, measured 25 October 2026), so every later run finds the file's value changed.
  if (mode === 'HORIZONTAL' || mode === 'VERTICAL') {
    for (const [sizing, axis] of [
      ['layoutSizingHorizontal', 'width'],
      ['layoutSizingVertical', 'height'],
    ] as const) {
      if (plain(layer, sizing) !== 'HUG') continue;
      const flow = layer.children.filter((child) => plain(child, 'layoutPositioning') !== 'ABSOLUTE');
      if (flow.length === 0 || !flow.every((child) => plain(child, sizing) === 'FILL')) continue;
      report.error(
        `${flow.map(describe).join(', ')} ${flow.length === 1 ? 'fills' : 'fill'} the ${axis} of ${what}, which hugs it: a frame cannot hug children that only fill it; give "${layer.address}" a fixed ${axis}, or a child a ${axis} of its own`,
        fieldAt(flow[0], sizing),
      );
    }
  }

  if (mode === 'GRID') {
    for (const field of ['gridRowSizes', 'gridColumnSizes']) {
      if (!(field in layer.fields)) report.error(`${what} is a GRID and needs ${field}`, layer.loc);
    }
    for (const field of NOT_IN_GRID_FIELDS) {
      if (field in layer.fields) {
        report.error(
          `${what} is a GRID, which has no ${field}; a grid spaces itself with gridRowGap and gridColumnGap`,
          fieldAt(layer, field),
        );
      }
    }
    for (const [sizing, tracks, axis] of [
      ['layoutSizingHorizontal', 'gridColumnSizes', 'width'],
      ['layoutSizingVertical', 'gridRowSizes', 'height'],
    ] as const) {
      const list = layer.fields[tracks] as { type: string }[] | undefined;
      if (plain(layer, sizing) === 'HUG' && list?.some((track) => track.type === 'FLEX')) {
        report.error(
          `${what} hugs its ${axis}, so ${tracks} cannot hold a FLEX track: a FLEX track is invalid on an axis the grid hugs`,
          fieldAt(layer, tracks),
        );
      }
    }
    for (const child of layer.children) {
      if (!('grid' in child.fields)) {
        report.error(`${describe(child)} sits in the GRID "${layer.address}" and needs \`grid row= column=\``, child.loc);
      }
    }
  } else {
    for (const field of GRID_ONLY_FIELDS) {
      if (field in layer.fields) {
        report.error(`${what} is not a GRID (its layoutMode is ${mode}) and cannot have ${field}`, fieldAt(layer, field));
      }
    }
    for (const child of layer.children) {
      if ('grid' in child.fields) {
        report.error(`${describe(child)} has \`grid\`, but its parent "${layer.address}" is not a GRID`, fieldAt(child, 'grid'));
      }
    }
  }

  // Wrap, a grid child's alignment, and position: each means something only beside a layout, its own or its parent's.
  if (mode !== 'HORIZONTAL' && mode !== 'VERTICAL') {
    for (const field of WRAP_FIELDS) {
      if (field in layer.fields)
        report.error(
          `${what} has ${field}, which wraps a flow; its layoutMode is ${mode}, and it needs HORIZONTAL or VERTICAL`,
          fieldAt(layer, field),
        );
    }
  }
  const parentMode = parent ? (plain(parent, 'layoutMode') ?? 'NONE') : undefined;
  if (parentMode !== 'GRID') {
    for (const field of GRID_CHILD_FIELDS) {
      if (field in layer.fields)
        report.error(
          `${what} has ${field}, which aligns a child in its grid cell, but ${parent ? `its parent "${parent.address}" is not a GRID` : 'it is the root'}`,
          fieldAt(layer, field),
        );
    }
  }
  if ('layoutPositioning' in layer.fields && (parentMode === undefined || parentMode === 'NONE')) {
    report.error(
      `${what} has layoutPositioning, which only a child of an auto-layout frame takes, but ${parent ? `its parent "${parent.address}" has no layout` : 'it is the root'}`,
      fieldAt(layer, 'layoutPositioning'),
    );
  }
  for (const field of ['x', 'y']) {
    if (!(field in layer.fields)) continue;
    // The root is placed by Toghen: a member in its set, an artboard on the board.
    if (!parent) report.error(`${what} is the root, which Toghen places on the page, so it takes no ${field}`, fieldAt(layer, field));
    else if (parentMode !== 'NONE' && plain(layer, 'layoutPositioning') !== 'ABSOLUTE') {
      report.error(
        `${what} has ${field}, but its parent "${parent.address}" places it (layoutMode ${parentMode}); write layoutPositioning=ABSOLUTE to place it yourself`,
        fieldAt(layer, field),
      );
    }
  }
}

/** Every `(property)` a layer's fields wire, as field and property name. */
function wiresOf(fields: Record<string, FieldValue>): { field: string; name: string }[] {
  const wires: { field: string; name: string }[] = [];
  for (const [field, value] of Object.entries(fields)) {
    const spec = Object.prototype.hasOwnProperty.call(FIELDS, field) ? FIELDS[field] : undefined;
    if (spec && !isStructured(spec) && (value as Value).kind === 'property') {
      wires.push({ field, name: (value as { name: string }).name });
    }
  }
  return wires;
}

/** The wirable properties some layer of the member wires to a property of the right type. */
function wiredIn(member: Member, byName: Map<string, Property>): Set<string> {
  const wired = new Set<string>();
  walk(member.tree, (layer, parent) => {
    if (parent === undefined) return;
    for (const { field, name } of wiresOf(layer.fields)) {
      if (byName.get(name)?.type === FIELDS[field].wires) wired.add(name);
    }
  });
  return wired;
}

/**
 * The layers some member wires to the property, as `address` and `field`, for telling a member that
 * fixes one of them on purpose (`(literal)`) from one that lost the wire by accident.
 */
function sitesOf(members: Member[]): Map<string, { address: string; field: string }[]> {
  const sites = new Map<string, { address: string; field: string }[]>();
  for (const member of members) {
    walk(member.tree, (layer, parent) => {
      if (parent === undefined) return;
      for (const { field, name } of wiresOf(layer.fields)) {
        const list = sites.get(name) ?? [];
        if (!list.some((site) => site.address === layer.address && site.field === field))
          sites.set(name, [...list, { address: layer.address, field }]);
      }
    });
  }
  return sites;
}

/** True when the member writes `(literal)` on a field that other members wire to the property. */
function fixedOnPurpose(member: Member, sites: { address: string; field: string }[]): boolean {
  let fixed = false;
  walk(member.tree, (layer) => {
    for (const site of sites)
      if (layer.address === site.address && (layer.fields[site.field] as Value | undefined)?.kind === 'literal') fixed = true;
  });
  return fixed;
}

/** The variant axes by name, with their values. */
class Axes extends Map<string, string[]> {
  /** The contexts an axis taken from a modifier leaves to CSS (`figma.include`), by axis. */
  private readonly leftOut = new Map<string, { modifier: string; contexts: string[] }>();

  constructor(component: Component) {
    super();
    for (const property of component.properties) {
      if (property.type !== 'VARIANT') continue;
      this.set(property.name, property.values);
      if (property.modifier !== undefined && property.leftOut)
        this.leftOut.set(property.name, { modifier: property.modifier, contexts: property.leftOut });
    }
  }

  /** Why a value is none, when it is a context Figma does not get: said after the list of values. */
  note(axis: string, value: unknown): string {
    const left = this.leftOut.get(axis);
    return left && typeof value === 'string' && left.contexts.includes(value)
      ? `; "${value}" is a context of the modifier "${left.modifier}" that Figma does not get, since its figma.include leaves it out`
      : '';
  }
}

const axesOf = (component: Component): Axes => new Axes(component);

const propertiesByName = (component: Component): Map<string, Property> => {
  const byName = new Map<string, Property>();
  for (const property of component.properties) if (!byName.has(property.name)) byName.set(property.name, property);
  return byName;
};

// ---------------------------------------------------------------------------
// The component: properties, exclusions, and the guards of the document
// ---------------------------------------------------------------------------

function checkGuardWord(word: Condition, guard: string, axes: Axes, report: Report): void {
  const axisOf = (operand: Operand, at: Loc | undefined): string | undefined => {
    if (typeof operand !== 'object' || operand === null) return undefined;
    const { ref } = operand;
    if (ref.from !== 'input') return undefined;
    if (!axes.has(ref.field)) {
      report.error(
        `guard "${guard}" reads (input)${ref.field}, which is not a VARIANT axis; the axes are the only inputs a component file has`,
        operand.loc ?? at,
      );
      return undefined;
    }
    return ref.field;
  };
  if ('is' in word) {
    const axis = axisOf(word.is, word.loc);
    for (const value of word.values) {
      if (typeof value === 'object' && value !== null) {
        axisOf(value, word.loc);
      } else if (axis !== undefined) {
        const known = axes.get(axis) as string[];
        if (typeof value !== 'string' || !known.includes(value)) {
          report.error(
            `guard "${guard}": ${JSON.stringify(value)} is not one of ${axis}'s values (${known.join(', ')})${axes.note(axis, value)}`,
            word.loc,
          );
        }
      }
    }
  } else if ('has' in word) {
    axisOf(word.has, word.loc);
  } else if ('all' in word) {
    for (const inner of word.all) checkGuardWord(inner, guard, axes, report);
  } else if ('any' in word) {
    for (const inner of word.any) checkGuardWord(inner, guard, axes, report);
  }
}

/** What the document says that the axes must agree with, and what a component file cannot use of the language. */
function checkDocument(items: Item[], axes: Axes, report: Report, inDefinition = false): void {
  for (const item of items) {
    if (item.kind === 'each') {
      report.error('"each" is not built for component files: nothing supplies a list to repeat over', item.loc);
    } else if (item.kind === 'guard') {
      if (item.body === undefined) {
        report.error(
          `guard "${item.name}" has no body, which marks a guard the host supplies; a component file has no host to supply one`,
          item.loc,
        );
      } else if (!inDefinition) {
        // Inside a definition `(input)` reads a parameter, not an axis, so only the file's own guards are held to the axes.
        for (const word of item.body) checkGuardWord(word, item.name, axes, report);
      }
    }
    if ('children' in item) checkDocument(item.children, axes, report, inDefinition || item.kind === 'define');
  }
}

/**
 * The component as written: its properties, its exclusions, and the guards of its
 * document held against the variant axes.
 *
 * Errors unless marked; every message names the thing in the file's words and
 * carries the line and column of the node it is about.
 */
export function validateComponent(component: Component, document: Document): Problem[] {
  const report = new Report();
  const axes = axesOf(component);

  const byName = new Map<string, Property>();
  for (const property of component.properties) {
    const first = byName.get(property.name);
    if (first) {
      report.error(
        `${property.type} "${property.name}" repeats the name of ${first.type} "${first.name}"${first.loc ? ` (line ${first.loc.line})` : ''}; ` +
          `properties share one namespace, and Figma renames one of two that collide, silently`,
        property.loc,
      );
    } else {
      byName.set(property.name, property);
    }
  }

  checkDocument(document.nodes, axes, report);

  // `across=` names axes of the board; the axes are known only now, since some come from the design system.
  for (const name of component.across ?? []) {
    if (!axes.has(name)) report.error(`component: across names "${name}", which is not a VARIANT axis`, component.acrossLoc);
  }

  for (const exclusion of component.exclude) {
    for (const [axis, value] of Object.entries(exclusion.combination)) {
      const known = axes.get(axis);
      if (!known) report.error(`exclude names "${axis}", which is not a VARIANT axis`, exclusion.loc);
      else if (!known.includes(value))
        report.error(`exclude ${axis}: "${value}" is not one of its values (${known.join(', ')})${axes.note(axis, value)}`, exclusion.loc);
    }
  }
  // `include` names combinations by the same rule as `exclude`.
  for (const inclusion of component.include ?? []) {
    for (const [axis, value] of Object.entries(inclusion.combination)) {
      const known = axes.get(axis);
      if (!known) report.error(`include names "${axis}", which is not a VARIANT axis`, inclusion.loc);
      else if (!known.includes(value))
        report.error(`include ${axis}: "${value}" is not one of its values (${known.join(', ')})${axes.note(axis, value)}`, inclusion.loc);
    }
  }
  if (axes.size > 0) {
    const defaults: Record<string, string> = {};
    for (const [axis, values] of axes) defaults[axis] = values[0];
    for (const exclusion of component.exclude) {
      if (Object.entries(exclusion.combination).every(([axis, value]) => defaults[axis] === value)) {
        report.error(
          `exclude removes the default member (${memberName(defaults)}); the first value of every axis is the default and is always built`,
          exclusion.loc,
        );
      }
    }
    // With `include`, only what a line matches is built, and the default member is always built: some line must match it.
    const included = component.include;
    if (
      included !== undefined &&
      included.length > 0 &&
      !included.some((line) => Object.entries(line.combination).every(([axis, value]) => defaults[axis] === value))
    ) {
      report.error(
        `include does not include the default member (${memberName(defaults)}); the first value of every axis is the default and is always built, so some include line must match it`,
        included[0].loc,
      );
    }
  }

  return report.problems;
}

// ---------------------------------------------------------------------------
// One member
// ---------------------------------------------------------------------------

/**
 * One member's layers: names, wiring, slots and layout.
 *
 * The same member is evaluated again for every combination, so a problem found in
 * every member is found once per member. The caller reports it once, and names a
 * member only when the problem is found in some and not all.
 */
export function validateMember(component: Component, member: Member): Problem[] {
  const report = new Report(member.name);
  const byName = propertiesByName(component);

  const byAddress = new Map<string, Layer>();
  const slotLayers: Layer[] = [];
  walk(member.tree, (layer, parent) => {
    if (layer.kind === 'SLOT') slotLayers.push(layer);
    const first = byAddress.get(layer.address);
    if (first) {
      // Two SLOT layers for one property are reported once, as that.
      if (!(first.kind === 'SLOT' && layer.kind === 'SLOT')) {
        report.error(
          `${describe(layer)} repeats the name of ${describe(first)}${first.loc ? ` (line ${first.loc.line})` : ''}; ` +
            `a layer's name is its address, so names must be unique in the component`,
          layer.loc,
        );
      }
    } else {
      byAddress.set(layer.address, layer);
    }

    for (const { field, name } of wiresOf(layer.fields)) {
      const wants = FIELDS[field].wires;
      const property = byName.get(name);
      const loc = fieldAt(layer, field);
      if (parent === undefined) {
        // Figma lets a property reference only a layer inside the component, and the root layer is the component.
        report.error(
          `"${field}" of ${describe(layer)} is wired to (property)"${name}", but the root layer is the component itself; wire a layer inside it`,
          loc,
        );
      } else if (!property) {
        report.error(`"${field}" of ${describe(layer)} is wired to (property)"${name}", which is not a declared property`, loc);
      } else if (property.type !== wants) {
        report.error(`"${field}" of ${describe(layer)} wires to a ${wants} property, but "${name}" is a ${property.type}`, loc);
      }
    }
    checkLayout(layer, parent, report);
  });

  // Slots: each SLOT property has exactly one SLOT layer, and the reverse.
  for (const property of component.properties) {
    if (property.type !== 'SLOT') continue;
    const layers = slotLayers.filter((layer) => layer.address === property.name);
    if (layers.length === 0) report.error(`SLOT property "${property.name}" has no SLOT layer`, property.loc);
    if (layers.length > 1) {
      report.error(`SLOT property "${property.name}" has ${layers.length} SLOT layers; it has exactly one`, layers[1].loc);
    }
  }
  for (const layer of slotLayers) {
    if (byName.get(layer.address)?.type !== 'SLOT') {
      report.error(`${describe(layer)} names no SLOT property; a slot layer is named for the SLOT property it is`, layer.loc);
    }
  }
  return report.problems;
}

/**
 * The members together: a property no member wires is an error; one that some
 * member leaves wired to nothing is a warning for that member.
 *
 * The warning is not an error because it is sometimes what a `when` means (an
 * aside that a single-column layout does not have), and it is worth saying
 * because it is also exactly how a property goes dead by accident. A member that
 * writes `(literal)` on the field says it is meant (`characters=(literal)"Ready"`),
 * and gets no warning.
 */
export function validateMembers(component: Component, members: Member[]): Problem[] {
  const problems: Problem[] = [];
  const byName = propertiesByName(component);
  const wired = members.map((member) => ({ member, names: wiredIn(member, byName) }));
  const sites = sitesOf(members);
  for (const property of component.properties) {
    if (!isWirable(property)) continue;
    if (!wired.some(({ names }) => names.has(property.name))) {
      const by = { BOOLEAN: 'visible', TEXT: 'characters', INSTANCE_SWAP: 'component' }[property.type];
      problems.push({
        severity: 'error',
        message: `${property.type} property "${property.name}" is wired to no layer in any member; a layer wires it with ${by}=(property)"${property.name}"`,
        ...(property.loc ?? {}),
      });
      continue;
    }
    for (const { member, names } of wired) {
      if (!names.has(property.name) && !fixedOnPurpose(member, sites.get(property.name) ?? [])) {
        problems.push({
          severity: 'warning',
          message: `${property.type} property "${property.name}" is wired to nothing in this member`,
          ...(property.loc ?? {}),
          member: member.name,
        });
      }
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// An artboard
// ---------------------------------------------------------------------------

/**
 * An artboard's tree: addresses and layout.
 *
 * An address is the layer's name with the keys of the `each`es around it, and it is what the next run finds the
 * layer by, so two layers may not share one. The properties and slots of an instance are held against its
 * component in Figma, where the component is known (`main/components/resolve.ts`).
 */
export function validateArtboard(root: Layer): Problem[] {
  const report = new Report();
  const seen = new Map<string, Layer>();
  walk(root, (layer, parent) => {
    const first = seen.get(layer.address);
    if (first) {
      report.error(
        `${describe(layer)} repeats the address of ${describe(first)}${first.loc ? ` (line ${first.loc.line})` : ''}; ` +
          `a layer's name and the keys of the each around it are its address, so addresses must be unique in the artboard (a definition called twice takes its layers' names from a parameter)`,
        layer.loc,
      );
    } else {
      seen.set(layer.address, layer);
    }
    checkLayout(layer, parent, report);
  });
  return report.problems;
}
