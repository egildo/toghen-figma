/**
 * Axes from the tokens: a variant axis that takes its values from a modifier of the
 * design system, and the axes a component gets from the parts of the tokens it names.
 *
 * Coordination with Figma stays in variable sync and in component files. The
 * resolver gives the modes (variable sync makes a collection per modifier, a mode
 * per context); a component file may take an axis from a modifier, so that a context
 * added to the document adds a member on the next run, and each member pins the
 * modifier's collection to its context. A component that names its token group gets
 * an axis for every axis of the parts vocabulary its subgroups use, with `rest` as the default
 * value. An axis that folded into modes pins the collection named after it; one that stayed in the
 * path pins nothing and chooses the part's variables. Worlds, theme and density, are never axes of their own: a
 * designer sets them on the frame an instance sits in, as CSS takes them from an ancestor.
 *
 * The design system is reached through `DesignSource`, which holds no `@toghen/lib`:
 * this file runs wherever a file is read, and the answers come from the plugin
 * (`main/utils/designSource.ts`), which asks lib, from the resolver document it has loaded. Once resolved, an axis is a plain `VARIANT`
 * with its values written out and the modifier it came from, so the members
 * are built from the component alone.
 */

import { referencesIn } from '@toghen/lib';
import type { Json, OutNode } from 'kdlet';
import type { Component, GroupInfo, Layer, Loc, Problem, Property } from './model.js';

/** The default value of a part axis, and the mode a folded axis starts with. */
export const REST = 'rest';

/** One axis of the parts vocabulary a component's token group uses, as the design system lays it out. */
export interface PartAxis {
  axis: string;
  /** The part keys the component uses on this axis, without `rest`. */
  values: string[];
  /** Folded into a collection of modes, or left in the path as one variable per part. */
  folded: boolean;
}

/** What a component file may ask of the design system it is read against. */
export interface DesignSource {
  /**
   * The contexts of a modifier that Figma gets, the default first: all of them unless the modifier lists
   * the ones Figma gets (`figma.include`). `undefined` when the design system has no such modifier.
   */
  contexts(modifier: string): string[] | undefined;
  /** The contexts of a modifier that Figma does not get; empty when it gets them all. Absent from a source that cannot say. */
  leftOut?(modifier: string): string[] | undefined;
  /**
   * The axes of the parts vocabulary the subgroups of a group use, in the vocabulary's order, each folded or
   * not; empty for a group that is no component. `layoutParts` lays every axis of this component out in the path
   * (`layout=parts`). `undefined` when the group names no token and no group.
   */
  partsOf(group: string, layoutParts?: boolean): PartAxis[] | undefined;
  /**
   * The tokens one level down in a group, for the bindings `tokens=` infers from their keys:
   * `'token'` when the path is a token, not a group; `undefined` when it names nothing. A `selection`
   * (axis to part key, for the axes left in the path) adds the keys of the part groups it selects, which
   * outrank the group's own. Absent
   * from a source that cannot say, in which case no binding is inferred.
   */
  group?(path: string, selection?: Record<string, string>): GroupInfo | 'token' | undefined;
  /**
   * The names of a group's children, tokens and groups alike, in the document's order, for an axis that takes its
   * values from a group (`VARIANT hue from="{hue}"`): `'token'` when the path is a token; `undefined` when it names
   * nothing. Absent from a source that cannot say.
   */
  children?(path: string): string[] | 'token' | undefined;
}

type Variant = Extract<Property, { type: 'VARIANT' }>;

/** A character a variant axis or value cannot hold, and why. */
const AXIS_NAME = /[,=.]/;
const VALUE = /[,=]/;

/**
 * Fills in the axes a file leaves to the design system, in place: the values of every
 * `VARIANT … (modifier)"…"`, and the axis for every part axis `tokens=` brings in.
 *
 * Returns the problems it found. An axis it could not fill is left with no values, so
 * the caller does not go on to check a component whose axes it does not know.
 */
export function resolveAxes(component: Component, source: DesignSource | undefined, componentLoc?: Loc): Problem[] {
  const problems: Problem[] = [];
  const fail = (message: string, loc?: Loc): void => {
    problems.push({ severity: 'error', message, ...(loc ?? {}) });
  };
  const needsSource = (what: string, loc?: Loc): void =>
    fail(`${what}, and no design system is loaded; load its resolver document in the plugin, or pass it to the command line`, loc);

  // The design system may refuse to answer (a document it cannot build the sum of): that is the file's problem to report, not a crash.
  const ask = <T>(question: () => T, loc?: Loc): T | undefined => {
    try {
      return question();
    } catch (error) {
      fail(`the design system could not be read: ${error instanceof Error ? error.message : String(error)}`, loc);
      return undefined;
    }
  };

  const variants = component.properties.filter((property): property is Variant => property.type === 'VARIANT');
  for (const axis of variants) {
    if (axis.from !== undefined) {
      const group = axis.from;
      const what = `VARIANT "${axis.name}" takes its values from the group "{${group}}"`;
      if (!source?.children) {
        needsSource(what, axis.loc);
        continue;
      }
      let children: string[] | 'token' | undefined;
      try {
        children = source.children(group);
      } catch (error) {
        fail(`${what}, but the design system could not be read: ${error instanceof Error ? error.message : String(error)}`, axis.loc);
        continue;
      }
      if (children === undefined) {
        fail(`${what}, which names no token and no group of the design system`, axis.loc);
      } else if (children === 'token') {
        fail(`${what}, which is a token, not a group: the values are the names of a group's children`, axis.loc);
      } else {
        const bad = children.find((child) => child === '' || VALUE.test(child));
        if (bad !== undefined)
          fail(
            `${what}, and the child "${bad}" cannot be a variant value: a value cannot be empty or contain "," or "=", which member names use`,
            axis.loc,
          );
        else axis.values = children;
      }
      continue;
    }
    if (axis.modifier === undefined) continue;
    const what = `VARIANT "${axis.name}" takes its values from the modifier "${axis.modifier}"`;
    if (!source) {
      needsSource(what, axis.loc);
      continue;
    }
    const modifier = axis.modifier;
    let contexts: string[] | undefined;
    try {
      contexts = source.contexts(modifier);
    } catch (error) {
      fail(`${what}, but the design system could not be read: ${error instanceof Error ? error.message : String(error)}`, axis.loc);
      continue;
    }
    if (!contexts) {
      fail(`${what}, which the design system does not have`, axis.loc);
      continue;
    }
    // The checks a written value gets, on the contexts the document gives.
    const bad = contexts.find((context) => context === '' || VALUE.test(context));
    if (bad !== undefined) {
      fail(
        `${what}, and the context "${bad}" cannot be a variant value: a value cannot be empty or contain "," or "=", which member names use`,
        axis.loc,
      );
      continue;
    }
    axis.values = contexts;
    const left = ask(() => source.leftOut?.(modifier), axis.loc);
    if (left && left.length > 0) axis.leftOut = left;
  }

  if (component.tokens !== undefined) {
    const what = `component tokens="{${component.tokens}}"`;
    if (!source) {
      needsSource(`${what} takes its axes from the tokens it names`, componentLoc);
    } else {
      const group = component.tokens;
      const found = ask(() => source.partsOf(group, component.layout === 'parts'), componentLoc);
      if (found === undefined) {
        // Either the design system could not be read (said above) or the group names nothing.
        if (!problems.some((problem) => /could not be read/.test(problem.message)))
          fail(`${what} names no token and no group of the design system`, componentLoc);
      } else {
        for (const { axis, values, folded } of found) {
          // A declared axis of the same name wins: it is marked as a part axis and keeps its values (a value with no part group reads the rest).
          const declared = variants.find(
            (variant) => variant.name === axis && variant.modifier === undefined && variant.from === undefined,
          );
          if (declared) {
            if (folded) {
              fail(
                `VARIANT "${axis}" is declared and also comes from the parts of "${group}", which fold it into modes, and a mode cannot hold the declared values that have no part. Drop the declared axis, or lay the component out with layout=parts`,
                declared.loc ?? componentLoc,
              );
              continue;
            }
            declared.part = true;
            const left = values.filter((value) => !declared.values.includes(value));
            if (left.length > 0) {
              const keys = left.map((value) => `"${value}"`).join(', ');
              problems.push({
                severity: 'warning',
                message: `VARIANT "${axis}" is declared and also comes from the parts of "${group}"; the declared values win, and ${keys} ${left.length === 1 ? 'is' : 'are'} left out.`,
                ...(componentLoc ?? {}),
              });
            }
            continue;
          }
          if (AXIS_NAME.test(axis) || values.some((value) => value === '' || value === REST || VALUE.test(value))) {
            fail(
              `${what} has parts on the axis "${axis}", which cannot be a variant: an axis name cannot contain ",", "=" or ".", and a part key cannot be "${REST}" or contain "," or "="`,
              componentLoc,
            );
            continue;
          }
          // After the declared ones, in the vocabulary's order. A folded axis pins the collection named after it.
          component.properties.push({
            type: 'VARIANT',
            name: axis,
            values: [REST, ...values],
            part: true,
            ...(folded ? { modifier: axis } : {}),
            ...(componentLoc ? { loc: componentLoc } : {}),
          });
        }
      }
    }
  }
  return problems;
}

/**
 * The part keys a combination selects on the axes left in the path, axis to key, `rest` left out: the part
 * groups whose tokens a member's layers bind (`variant=primary` binds `button.primary.backgroundColor`).
 */
export function selectionOf(component: Component, combination: Record<string, string>): Record<string, string> {
  const selection: Record<string, string> = {};
  for (const property of component.properties) {
    if (property.type === 'VARIANT' && property.part && property.modifier === undefined && combination[property.name] !== REST)
      selection[property.name] = combination[property.name];
  }
  return selection;
}

/** The key a group's plan is stored under for a selection: `button|variant=primary`, or the group itself when the selection is empty. */
export function planKey(group: string, selection: Record<string, string>): string {
  const keys = Object.keys(selection);
  return keys.length === 0 ? group : `${group}|${keys.map((axis) => `${axis}=${selection[axis]}`).join(',')}`;
}

/** The pins a combination puts on every member's root: modifier name to the context, `modes state=hover`. */
export function pinsOf(component: Component, combination: Record<string, string>): Record<string, string> {
  const pins: Record<string, string> = {};
  for (const property of component.properties) {
    if (property.type === 'VARIANT' && property.modifier !== undefined) pins[property.modifier] = combination[property.name];
  }
  return pins;
}

/**
 * A `modes <modifier>=<context>` that names a context Figma does not get (the modifier's `figma.include`
 * leaves it out): the collection has no such mode, so the layer could not be pinned to it. An error naming
 * it, at the line of the field, for every layer of the tree. A source that cannot say finds nothing.
 */
export function checkLeftOutModes(tree: Layer, source: DesignSource | undefined): Problem[] {
  const problems: Problem[] = [];
  if (!source?.leftOut) return problems;
  const walk = (layer: Layer): void => {
    const modes = layer.fields.modes;
    if (typeof modes === 'object' && modes !== null && !Array.isArray(modes)) {
      for (const [modifier, context] of Object.entries(modes as Record<string, string>)) {
        let left: string[] | undefined;
        try {
          left = source.leftOut?.(modifier);
        } catch {
          // A design system that cannot be read is said by the axes, once.
        }
        if (left?.includes(context)) {
          problems.push({
            severity: 'error',
            message: `modes ${modifier}=${context}: "${context}" is a context of the modifier "${modifier}" that Figma does not get, since its figma.include leaves it out`,
            ...(layer.fieldLoc?.modes ?? layer.loc ?? {}),
          });
        }
      }
    }
    for (const child of layer.children) walk(child);
  };
  walk(tree);
  return problems;
}

// ---------------------------------------------------------------------------
// A segment of a reference from an axis
// ---------------------------------------------------------------------------

/** The text that makes a path segment of a reference the value of an axis: `{hue.(input)hue.soft}`. */
export const INPUT_SEGMENT = '(input)';

/** `hue=rose, look=soft`: the values an expansion took, for a message. */
export const viaAxes = (axes: string[], combination: Record<string, string>): string =>
  axes.map((axis) => `${axis}=${combination[axis]}`).join(', ');

/** A member's tree with its references' axis segments replaced, as kdlet returns it, and the axes each field took. */
export interface Expanded extends OutNode {
  fromAxes?: Record<string, string[]>;
}

/**
 * The path of one reference with its `(input)<Axis>` segments replaced by the member's value of the axis.
 *
 * An axis name holds no dot, so a segment ends at the next dot or at the end; a name written in quotes
 * (`(input)"Header in"`) ends at the closing quote. Throws the reason, in the file's words.
 */
function expandPath(path: string, combination: Record<string, string>, used: Set<string>): string {
  let out = '';
  let at = 0;
  while (at < path.length) {
    let end = path.indexOf('.', at);
    if (end < 0) end = path.length;
    if (path.startsWith(INPUT_SEGMENT, at)) {
      let axis: string;
      const start = at + INPUT_SEGMENT.length;
      if (path[start] === '"') {
        const close = path.indexOf('"', start + 1);
        if (close < 0) throw new Error(`the quote after ${INPUT_SEGMENT} is never closed`);
        axis = path.slice(start + 1, close);
        end = close + 1;
        if (end < path.length && path[end] !== '.')
          throw new Error(`${INPUT_SEGMENT} takes a whole segment, and text follows the quoted axis name`);
      } else {
        axis = path.slice(start, end);
      }
      if (axis === '') throw new Error(`${INPUT_SEGMENT} needs the name of an axis`);
      if (!Object.prototype.hasOwnProperty.call(combination, axis)) {
        const known = Object.keys(combination);
        throw new Error(
          `the file has no VARIANT axis "${axis}" to take a segment from${known.length > 0 ? ` (its axes: ${known.join(', ')})` : ' (it has none)'}`,
        );
      }
      const value = combination[axis];
      // A name has no dot or brace, so such a value could only ever make a path of another shape than the file wrote.
      if (/[.{}]/.test(value))
        throw new Error(`the value "${value}" of the axis "${axis}" cannot be a path segment: a token's name holds no ".", "{" or "}"`);
      used.add(axis);
      out += value;
    } else {
      const segment = path.slice(at, end);
      if (segment.includes(INPUT_SEGMENT))
        throw new Error(`${INPUT_SEGMENT} takes a whole segment of the path, and the segment "${segment}" has text around it`);
      out += segment;
    }
    at = end;
    if (at < path.length) {
      out += '.';
      at += 1;
    }
  }
  return out;
}

/**
 * Replaces the axis segments in every reference of one member's tree, before anything checks it: the references
 * that come out are ordinary, and every check on a reference applies to them. A tagged value (`(literal)…`) is
 * left alone. The nodes it changes are copies; a tree with no segment is returned as it came.
 *
 * Each field that took a segment is noted on its node (`fromAxes`), so a token that is missing can be said to
 * come from `hue=rose`. A reference that cannot be expanded is a problem at the line of its field, and is left as written.
 */
export function expandSegments(roots: OutNode[], combination: Record<string, string>): { roots: OutNode[]; problems: Problem[] } {
  const problems: Problem[] = [];

  const rewrite = (json: Json, used: Set<string>, fail: (message: string) => void): Json => {
    if (typeof json === 'string') {
      if (!json.includes(INPUT_SEGMENT)) return json;
      // The references as the core's grammar reads them, each replaced where it is written.
      let out = '';
      let from = 0;
      for (const { written } of referencesIn(json)) {
        const at = json.indexOf(written, from);
        out += json.slice(from, at);
        from = at + written.length;
        try {
          out += written.includes(INPUT_SEGMENT) ? `{${expandPath(written.slice(1, -1), combination, used)}}` : written;
        } catch (error) {
          fail(`"${json}": ${(error as Error).message}`);
          out += written;
        }
      }
      return out + json.slice(from);
    }
    if (json === null || typeof json !== 'object') return json;
    if (Array.isArray(json)) {
      const next = json.map((item) => rewrite(item, used, fail));
      return next.every((item, index) => item === json[index]) ? json : next;
    }
    // A tagged value is a literal on purpose, a property or a key: not a reference.
    if ('tag' in json && 'value' in json && typeof json.tag === 'string') return json;
    const record = json as Record<string, Json>;
    const next: Record<string, Json> = {};
    let changed = false;
    for (const key of Object.keys(record)) {
      next[key] = rewrite(record[key], used, fail);
      if (next[key] !== record[key]) changed = true;
    }
    return changed ? next : json;
  };

  const visit = (node: OutNode): OutNode => {
    if (node.kind === 'call') return node;
    const fields: Record<string, Json> = {};
    const fromAxes: Record<string, string[]> = {};
    let changed = false;
    for (const [name, json] of Object.entries(node.fields)) {
      const used = new Set<string>();
      const at = node.fieldLocs[name] ?? node.loc;
      fields[name] = rewrite(json, used, (message) => problems.push({ severity: 'error', message, line: at.line, column: at.column }));
      if (fields[name] !== json) changed = true;
      if (used.size > 0) fromAxes[name] = [...used];
    }
    const children = node.children.map(visit);
    if (!changed && children.every((child, index) => child === node.children[index])) return node;
    const copy: Expanded = { ...node, fields, children };
    if (Object.keys(fromAxes).length > 0) copy.fromAxes = fromAxes;
    return copy;
  };

  return { roots: roots.map(visit), problems };
}
