/**
 * A blueprint: one kdlet document, `<page>.blueprint.kdl`, that folds component files and artboard files into one
 * page and declares what it needs.
 *
 * The reader reads the blueprint's own words (`page`, `tokens`, `library`, and `component` and `artboard` as
 * containers) and hands each body to the readers of today's files. A body is handed over as the blueprint's own
 * text with everything else blanked out: the other bodies and the blueprint's words become spaces, the braces of
 * the body too, and the top-level `guard` and `define` nodes stay where they are. What is left is the body's file,
 * header line first, at the lines and columns it has in the blueprint; so a blueprint is checked exactly as its
 * files would be, and every problem points at the blueprint's own line.
 *
 * The format is `component-files.md`, *Blueprints*; the shapes are `reference.md`'s.
 */

import { getLocation, parse } from '@bgotink/kdl';
import type { Node } from '@bgotink/kdl';
import { read as readDocument } from 'kdlet';
import { ARTBOARD_WORD, readArtboardFile } from './artboard.js';
import type { DesignSource } from './axes.js';
import { readComponentFile } from './index.js';
import type { ComponentFile } from './index.js';
import type { ComponentRef, Layer, Loc, Problem, SetField, Value } from './model.js';
import { report, split } from './read.js';

/** The words that are a blueprint's own. Beside them, a blueprint holds only kdlet's shared `guard` and `define`. */
export const BLUEPRINT_WORDS = ['page', 'tokens', 'library', 'component', ARTBOARD_WORD] as const;

/** Whether a file name is a blueprint's. */
export const isBlueprintFile = (fileName: string): boolean => /\.blueprint\.kdl$/.test(fileName);

/** `tokens <entry>… [name=…] [overrides=…]`: what the core's `load` is given. */
export interface BlueprintTokens {
  /** One resolver document, one token file, or several token files, as written. */
  entries: string[];
  /** The collection's name, for token files. */
  name?: string;
  /** The file that holds the overrides map. */
  overrides?: string;
}

export interface Blueprint {
  /** Absent when the blueprint has no usable `page` line. */
  page?: string;
  tokens?: BlueprintTokens;
  /** The `library` lines, in file order. */
  libraries: string[];
  /** Each `component` and `artboard` body, read as its file would be, in file order. */
  bodies: ComponentFile[];
  /** The blueprint's own problems and every body's, in file order, each once. */
  problems: Problem[];
}

/** One component a blueprint's bodies name. */
export interface ComponentNeed {
  ref: ComponentRef;
  /** A `component` body of the same blueprint defines it. Never true of a key. */
  satisfied: boolean;
  /** Where the blueprint first names it. */
  loc?: Loc;
}

export interface BlueprintNeeds {
  tokens?: BlueprintTokens;
  libraries: string[];
  /** Every component the bodies name, once each, in the order first named. */
  components: ComponentNeed[];
}

const position = (problem: Problem): number => (problem.line === undefined ? Infinity : problem.line * 100000 + (problem.column ?? 0));

const blank = (text: string): string => text.replace(/[^\r\n]/gu, ' ');

/** The blueprint's text with only `keep` left, and the braces of `body` blanked: the body's file, at the blueprint's lines. */
function fileOf(text: string, keep: Node[], body: Node): string {
  const ranges: [number, number][] = [];
  for (const node of keep) {
    const at = getLocation(node)!;
    if (node !== body || !node.children) {
      ranges.push([at.start.offset, at.end.offset]);
      continue;
    }
    const inside = getLocation(node.children!)!;
    // The `{` stands just before the children, and the `}` just after them.
    ranges.push([at.start.offset, inside.start.offset - 1], [inside.start.offset, inside.end.offset]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  let out = '';
  let from = 0;
  for (const [start, end] of ranges) {
    out += blank(text.slice(from, start)) + text.slice(start, end);
    from = end;
  }
  return out + blank(text.slice(from));
}

/** Text in quotes, or why not. */
function text(entry: { getValue(): unknown; getTag(): string | null }): string | undefined {
  const value = entry.getValue();
  return entry.getTag() === null && typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * Reads a blueprint's text, and each body against the design system and the inputs, as its file would be read.
 *
 * Every problem is reported, not the first.
 */
export function readBlueprint(source: string, design?: DesignSource, inputs?: Record<string, unknown>): Blueprint {
  const sink: Problem[] = [];
  const blueprint: Blueprint = { libraries: [], bodies: [], problems: sink };
  let nodes: Node[];
  try {
    nodes = parse(source, { storeLocations: true }).nodes;
  } catch {
    // kdlet says what is wrong with text that is not KDL, as it does for a file.
    for (const problem of readDocument(source).problems)
      sink.push({ severity: 'error', message: problem.message, line: problem.line, column: problem.column });
    return blueprint;
  }

  const shared = nodes.filter((node) => node.getName() === 'guard' || node.getName() === 'define');
  const bodies: Node[] = [];
  let page: Node | undefined;
  let tokens: Node | undefined;
  for (const node of nodes) {
    const word = node.getName();
    if (word === 'guard' || word === 'define') continue;
    if (word === 'component' || word === ARTBOARD_WORD) {
      const header = (node.children?.nodes ?? []).find((child) => child.getName() === 'component' || child.getName() === ARTBOARD_WORD);
      if (header)
        report(
          sink,
          `the body of ${word} has its own "${header.getName()}" line: in a blueprint the name and its attributes go on the ${word} line, and the body holds the rest`,
          header,
        );
      else bodies.push(node);
      continue;
    }
    const { args, props } = split(sink, node, word);
    if (word === 'page') {
      if (page) report(sink, 'a blueprint builds into one page: "page" is written twice', node);
      page = page ?? node;
      for (const [key, entry] of props) report(sink, `page has no "${key}"`, entry);
      for (const child of node.children?.nodes ?? []) report(sink, 'page takes no child nodes', child);
      const name = args.length === 1 ? text(args[0]) : undefined;
      if (name === undefined) report(sink, 'page needs its name as its only argument', args[0] ?? node);
      else if (page === node) blueprint.page = name;
    } else if (word === 'tokens') {
      if (tokens) report(sink, 'a blueprint loads its tokens once: "tokens" is written twice', node);
      tokens = tokens ?? node;
      for (const child of node.children?.nodes ?? []) report(sink, 'tokens takes no child nodes', child);
      const entries: string[] = [];
      for (const arg of args) {
        const entry = text(arg);
        if (entry === undefined) report(sink, 'tokens takes the locations of a resolver document or of token files, in quotes', arg);
        else entries.push(entry);
      }
      if (args.length === 0) report(sink, 'tokens needs a resolver document, a token file or several token files', node);
      const loaded: BlueprintTokens = { entries };
      for (const [key, entry] of props) {
        const value = text(entry);
        if (key !== 'name' && key !== 'overrides') report(sink, `tokens has no "${key}"; it takes name and overrides`, entry);
        else if (value === undefined)
          report(
            sink,
            `tokens: ${key} takes ${key === 'name' ? "the collection's name" : 'the location of an overrides map'}, in quotes`,
            entry,
          );
        else if (key === 'name') loaded.name = value;
        else loaded.overrides = value;
      }
      if (tokens === node && entries.length === args.length && entries.length > 0) blueprint.tokens = loaded;
    } else if (word === 'library') {
      for (const [key, entry] of props) report(sink, `library has no "${key}"`, entry);
      for (const child of node.children?.nodes ?? []) report(sink, 'library takes no child nodes', child);
      const name = args.length === 1 ? text(args[0]) : undefined;
      if (name === undefined) report(sink, "library needs the library's name as its only argument", args[0] ?? node);
      else blueprint.libraries.push(name);
    } else {
      report(
        sink,
        `"${word}" is not a word of a blueprint: it holds page, tokens, library, component and artboard, and the guard and define its bodies share`,
        node,
      );
    }
  }
  if (!page) sink.push({ severity: 'error', message: 'the blueprint needs one "page <Name>"' });

  const named = new Map<string, Node>();
  for (const body of bodies) {
    const artboard = body.getName() === ARTBOARD_WORD;
    const file = fileOf(source, [...shared, body], body);
    const read = artboard ? readArtboardFile(file, inputs) : readComponentFile(file, design);
    blueprint.bodies.push(read);
    sink.push(...read.problems);
    const name = read.component?.name;
    if (!name) continue;
    const key = `${body.getName()}:${name}`;
    if (named.has(key)) report(sink, `${body.getName()} "${name}" is written twice in the blueprint`, body);
    named.set(key, body);
  }

  // A problem of a shared guard or define is found once per body: say it once.
  const seen = new Set<string>();
  const once = sink.filter((problem) => {
    const key = `${problem.severity}:${problem.line}:${problem.column}:${problem.member}:${problem.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const ordered = once.map((problem, index) => ({ problem, index }));
  ordered.sort((a, b) => position(a.problem) - position(b.problem) || a.index - b.index);
  blueprint.problems = ordered.map((entry) => entry.problem);
  return blueprint;
}

/**
 * What a blueprint needs: its tokens, its libraries, and every component its bodies name, by name or by key. A name a
 * `component` body of the same blueprint defines is satisfied by it. A body that does not read has no members, so it
 * names nothing here.
 */
export function blueprintNeeds(blueprint: Blueprint): BlueprintNeeds {
  const defined = new Set<string>();
  for (const body of blueprint.bodies) if (!body.artboard && body.component) defined.add(body.component.name);
  const found = new Map<string, ComponentNeed>();
  const add = (ref: ComponentRef, loc?: Loc): void => {
    const key = 'name' in ref ? `name:${ref.name}` : `key:${ref.key}`;
    if (!found.has(key)) found.set(key, { ref, satisfied: 'name' in ref && defined.has(ref.name), ...(loc ? { loc } : {}) });
  };
  const walk = (layer: Layer): void => {
    const component = layer.fields.component as Value | undefined;
    const at = layer.fieldLoc?.component ?? layer.loc;
    if (component?.kind === 'plain' && typeof component.value === 'string') add({ name: component.value }, at);
    else if (component?.kind === 'key') add({ key: component.key }, at);
    for (const entry of Object.values((layer.fields.set as SetField | undefined) ?? {})) {
      if (typeof entry.value === 'object' && 'key' in entry.value) add({ key: entry.value.key }, entry.loc ?? layer.fieldLoc?.set);
    }
    for (const child of layer.children) walk(child);
  };
  for (const body of blueprint.bodies) {
    for (const property of body.component?.properties ?? []) if (property.type === 'INSTANCE_SWAP') add(property.default, property.loc);
    for (const member of body.members) walk(member.tree);
  }
  return {
    ...(blueprint.tokens ? { tokens: blueprint.tokens } : {}),
    libraries: [...new Set(blueprint.libraries)],
    components: [...found.values()],
  };
}
