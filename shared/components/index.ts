/**
 * A component file, read, validated and expanded.
 *
 * Pure: no Figma API and no Node API, so the plugin runs it on the text of a file
 * whichever way the text came. The file format is owned by
 * `reference.md`, *Component files*; the design is `specs.md`, *Components from
 * files*.
 *
 * The file is a kdlet file. kdlet reads it; this reads the five words that are
 * Toghen's; kdlet evaluates the document once per combination of the variant axes;
 * and Toghen checks each tree it gets back.
 */

import type { Document } from 'kdlet';
import { checkLeftOutModes, foldedAxes, partGuardAxis, resolveAxes, selectionOf } from './axes.js';
import type { DesignSource } from './axes.js';
import { checkPins, checkRoots } from './check.js';
import { groupsUsed, resolveComponentGroup, resolveGroups, sayings, skippedParts } from './groups.js';
import type { SkippedPart } from './groups.js';
import { evaluateMembers, toMember } from './members.js';
import type { Evaluated } from './members.js';
import { isArtboardText, readArtboardFile } from './artboard.js';
import { readFile } from './read.js';
import { validateComponent, validateMember, validateMembers } from './validate.js';
import type { Component, Member, Problem } from './model.js';

export type * from './model.js';
export { FIELDS, LAYER_KINDS, PROPERTY_TYPES } from './fields.js';
export type { FieldSpec, PropertyType, ValueKind } from './fields.js';
export { combinations, evaluateMembers, toArtboardLayer, toLayer, toMember } from './members.js';
export { ARTBOARD_WORD, isArtboardText, readArtboardFile } from './artboard.js';
export { BLUEPRINT_WORDS, blueprintNeeds, isBlueprintFile, readBlueprint } from './blueprint.js';
export type { Blueprint, BlueprintNeeds, BlueprintTokens, ComponentNeed } from './blueprint.js';
export { expandSegments, INPUT_SEGMENT, pinsOf, resolveAxes, viaAxes } from './axes.js';
export type { DesignSource } from './axes.js';
export { applyBindings } from './bindings.js';
export type { Evaluated } from './members.js';
export type * from './steps.js';
export { diff, memberBoard, MEMBER_GAP } from './diff.js';
export { SET_GAP, describeStack, restack } from './stack.js';
export type { Plan, TopLevel } from './stack.js';
export type { Board, LayerSnapshot, MemberCell, MemberSnapshot, PropertySnapshot, SetSnapshot, Snapshot, UnstampedNode } from './diff.js';

export interface ComponentFile {
  /** True for an artboard file: `component` then holds only its name, and `members` its one frame. */
  artboard?: true;
  /** Absent only when the file holds no usable `component` node (or `artboard` node). */
  component?: Component;
  /** What kdlet evaluates, once per combination: the file without the words that are Toghen's, as plain JSON. */
  document?: Document;
  /** Empty when the component has errors: a file that is wrong is not expanded. */
  members: Member[];
  /** Errors and warnings, in file order. Nothing is built while any is an error. */
  problems: Problem[];
}

const position = (problem: Problem): number => (problem.line === undefined ? Infinity : problem.line * 100000 + (problem.column ?? 0));

/**
 * Problems found member by member, as the file's: one found in every member is one
 * problem, and a member is named only when it is found in some and not all.
 */
function perMember(found: { member: string; problems: Problem[] }[]): Problem[] {
  const groups = new Map<string, { problem: Problem; members: string[] }>();
  for (const { member, problems } of found) {
    for (const problem of problems) {
      const key = `${problem.severity}:${problem.line}:${problem.column}:${problem.message}`;
      const group = groups.get(key) ?? { problem, members: [] };
      group.members.push(member);
      groups.set(key, group);
    }
  }
  const out: Problem[] = [];
  for (const { problem, members } of groups.values()) {
    const { member: _member, ...bare } = problem;
    if (members.length === found.length) out.push(bare);
    else for (const member of members) out.push({ ...bare, member });
  }
  return out;
}

/**
 * kdlet checks a guard's name when it reads the file, before the axes from the tokens are known, so its error cannot
 * say that the name is a part key. This says it, and the line that declares the guard; it matches kdlet's wording,
 * which its test pins.
 */
function withPartHint(problem: Problem, component: Component): Problem {
  const name = /^no guard named "([^"]+)" is in scope here/.exec(problem.message)?.[1];
  const axis = name === undefined ? undefined : partGuardAxis(component, name);
  if (axis === undefined) return problem;
  return {
    ...problem,
    message: `${problem.message}. "${name}" is a value of the axis "${axis}", taken from the parts of "${component.tokens}": declare it with guard ${name}, and Toghen supplies its body`,
  };
}

/**
 * One warning for each token a layer names outright that some members' selections would replace, naming each member
 * and the token it skips. A warning, not an error: naming the rest is sometimes meant.
 */
function skippedPartWarnings(evaluated: Evaluated[], component: Component, source: DesignSource | undefined): Problem[] {
  const byReference = new Map<string, { path: string; loc: SkippedPart['loc']; members: string[] }>();
  for (const e of evaluated) {
    for (const { path, chosen, loc } of skippedParts(e.roots, source, selectionOf(component, e.combination), foldedAxes(component))) {
      const key = `${loc?.line}:${loc?.column}:${path}`;
      const entry = byReference.get(key) ?? { path, loc, members: [] };
      entry.members.push(`"${e.name}" selects {${chosen}}`);
      byReference.set(key, entry);
    }
  }
  return [...byReference.values()].map(({ path, loc, members }) => ({
    severity: 'warning',
    message: `{${path}} names the rest's variable, which a member's parts replace: ${members.join('; ')}. Bind the group with tokens= to follow them, or keep the rest if that is meant`,
    ...(loc ?? {}),
  }));
}

/**
 * Reads, validates and expands one component file, in one pass.
 *
 * Every problem in the file is reported, not the first. The members are evaluated
 * and checked only when the component itself has no errors, since a member of a
 * broken component would repeat the same errors once per combination.
 *
 * A file with an `artboard` node at the top is an artboard file and is read as one (`artboard.ts`), against the
 * `inputs` given; a component file ignores them.
 */
export function readComponentFile(text: string, source?: DesignSource, inputs?: Record<string, unknown>): ComponentFile {
  if (isArtboardText(text)) return readArtboardFile(text, inputs);
  const read = readFile(text);
  if (!read.component) return { members: [], problems: read.problems };
  const { component, document } = read;

  // An axis that takes its values from a modifier, and the axes `tokens=` brings in, need the
  // design system. Until they are known the axes are not, so a file whose axes cannot be filled
  // is not checked against them: it would be told about guards and exclusions that are not wrong.
  const axes = resolveAxes(component, source, read.componentLoc);
  // The same goes for the token groups: what `tokens=` infers from is stored on the component, for the script and the plugin, which have no design system.
  const problems = [
    ...read.problems.map((problem) => withPartHint(problem, component)),
    ...axes,
    ...(axes.length > 0 ? [] : [...validateComponent(component, document), ...resolveComponentGroup(component, source, read.componentLoc)]),
  ];
  let members: Member[] = [];
  if (!problems.some((problem) => problem.severity === 'error')) {
    const evaluated = evaluateMembers(component, document);
    const at = read.componentLoc ?? { line: 1, column: 1 };
    const said = sayings();
    // A tree kdlet had problems with is not checked further: what is wrong in it would be said twice.
    const found = evaluated.map((e) => {
      const own = [...e.problems];
      if (own.length === 0) own.push(...checkRoots(e.roots, component.name, at), ...checkPins(e.roots, component));
      if (own.length === 0) {
        // A member that selects part groups binds their tokens: its plans are made for that selection.
        const selection = selectionOf(component, e.combination);
        own.push(...resolveGroups(component, groupsUsed(e.roots, e.combination), source, selection));
        if (Object.keys(selection).length > 0) own.push(...resolveComponentGroup(component, source, read.componentLoc, selection));
      }
      const member = own.length === 0 ? toMember(e, component, said.seen) : undefined;
      if (member) own.push(...checkLeftOutModes(member.tree, source));
      if (member) own.push(...validateMember(component, member));
      return { name: e.name, problems: own, member };
    });
    problems.push(...perMember(found.map((f) => ({ member: f.name, problems: f.problems }))));
    members = [];
    for (const f of found) if (f.member) members.push(f.member);
    if (members.length === evaluated.length) problems.push(...validateMembers(component, members));
    problems.push(...skippedPartWarnings(evaluated, component, source));
    if (problems.some((problem) => problem.severity === 'error')) members = [];
    // What inference skipped or could not bind travels with the component: the run's report says it, and the engine has no design system to work it out from.
    if (said.notes.size > 0) component.notes = [...said.notes];
    if (said.warnings.size > 0) component.warnings = [...said.warnings];
  }

  // A stable sort: problems on one line keep the order they were found in.
  const ordered = problems.map((problem, index) => ({ problem, index }));
  ordered.sort((a, b) => position(a.problem) - position(b.problem) || a.index - b.index);
  return { component, document, members, problems: ordered.map((entry) => entry.problem) };
}
