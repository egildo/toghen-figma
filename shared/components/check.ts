/**
 * Toghen's own checks on the tree kdlet returns for one member.
 *
 * kdlet has checked what is its own: that every node is one of the four layer
 * kinds, that every reference and tag resolves, that every `when` names a guard.
 * What is left is Figma's: which fields a kind takes, and whether a field's value
 * has the form that field wants. A value arrives as kdlet keeps it: plain JSON, a
 * host tag as `{ tag, value }`, a field written as a child node as a list of its
 * arguments or, with properties or children, as a structure.
 *
 * It reads token references with the core's grammar, so it is kept apart from
 * the evaluation, which trusts a file that was checked here. A problem points at the position kdlet carried: the line of a
 * `when` when a `when` wrote the field. A field written as a list of arguments
 * (`fills`) has one position, its own node's, so a problem with one paint points
 * at the node and not at the paint.
 */

import { parseReferencePath, referenceTarget } from '@toghen/lib';
import type { Json, Loc, OutNode, Structure } from 'kdlet';
import { FIELDS, GRID_ALIGNMENTS, GRID_FIELDS, GRID_PATTERNS, STYLE_TEXT_FIELDS, isStructured } from './fields.js';
import type { FieldSpec } from './fields.js';
import { SLOT_WORD, tagged } from './members.js';
import type { Component, LayerKind, Problem } from './model.js';

const HEX_COLOUR = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** A value as the file wrote it, for a message: `(literal)8`, `#true`, `"abc"`. */
function show(json: Json | undefined): string {
  const tag = tagged(json);
  const raw = tag ? tag.value : json;
  const body =
    typeof raw === 'string'
      ? JSON.stringify(raw)
      : raw === null || raw === undefined
        ? '#null'
        : raw === true
          ? '#true'
          : raw === false
            ? '#false'
            : String(raw);
  return `${tag ? `(${tag.tag})` : ''}${body}`;
}

const isStructure = (json: Json | undefined): json is Structure =>
  json !== null && typeof json === 'object' && !Array.isArray(json) && 'children' in json && 'props' in json;

const specOf = (name: string): FieldSpec | undefined => (Object.prototype.hasOwnProperty.call(FIELDS, name) ? FIELDS[name] : undefined);

class Sink {
  readonly problems: Problem[] = [];

  /** True for an artboard file: it has `slot`, no component properties, no `SLOT` layers and no `tokens=`. */
  constructor(readonly artboard = false) {}

  error(message: string, at: Loc): void {
    this.problems.push({ severity: 'error', message, line: at.line, column: at.column });
  }

  /** A token's path must be one a token could have; the grammar is the core's. */
  token(text: string, name: string, at: Loc): void {
    try {
      parseReferencePath(referenceTarget(text) ?? '');
    } catch (error) {
      this.error(`"${text}" is not a token reference: ${(error as Error).message} (in "${name}")`, at);
    }
  }

  /** A plain whole number, for indices, spans and counts. */
  count(json: Json | undefined, what: string, minimum: number, at: Loc): void {
    if (typeof json === 'number' && Number.isInteger(json) && json >= minimum) return;
    this.error(`${what} takes a whole number of at least ${minimum}, not ${show(json)}`, at);
  }
}

// ---------------------------------------------------------------------------
// Scalar fields: a property of the layer
// ---------------------------------------------------------------------------

function checkScalar(sink: Sink, name: string, spec: FieldSpec, json: Json, at: Loc): void {
  const tag = tagged(json);
  const raw = tag ? tag.value : json;
  const tagName = tag ? tag.tag : null;
  const fail = (expects: string): void => sink.error(`"${name}" takes ${expects}, not ${show(json)}`, at);
  if (sink.artboard && tagName === 'property') {
    sink.error(`"${name}" is wired to ${show(json)}, but an artboard has no component properties to wire to`, at);
    return;
  }
  const wired = (expects: string): void => {
    if (!(spec.wires && typeof raw === 'string')) fail(expects);
  };

  switch (spec.value) {
    case 'boolean':
      // On a wirable field `(literal)` says the value is fixed on purpose, in a `when` that takes the field off its property.
      if ((tagName === null || (tagName === 'literal' && spec.wires)) && typeof raw === 'boolean') return;
      // A `boolean` token binds its variable.
      if (tagName === null && spec.token && typeof raw === 'string' && referenceTarget(raw) !== undefined) {
        sink.token(raw, name, at);
        return;
      }
      if (tagName === 'property') {
        wired(`#true, #false or (property)"<${spec.wires} property>"`);
        return;
      }
      fail(spec.wires ? `#true, #false or (property)"<${spec.wires} property>"` : '#true or #false');
      return;

    case 'string':
      if (tagName === 'literal' && spec.wires && typeof raw === 'string') return;
      if (tagName === null && typeof raw === 'string') {
        // A `string` token binds its variable; a field no token reaches takes text only.
        if (referenceTarget(raw) !== undefined) {
          if (spec.token) sink.token(raw, name, at);
          else fail('text, and a token reference is not text');
          return;
        }
        return;
      }
      if (tagName === 'property') {
        wired(`text or (property)"<${spec.wires} property>"`);
        return;
      }
      fail(`text or (property)"<${spec.wires} property>"`);
      return;

    case 'component':
      if (tagName === null && typeof raw === 'string' && referenceTarget(raw) === undefined) return;
      if (tagName === 'key' && typeof raw === 'string') return;
      if (tagName === 'property') {
        wired('a component name, (key)"…" or (property)"<INSTANCE_SWAP property>"');
        return;
      }
      fail('a component name, (key)"…" or (property)"<INSTANCE_SWAP property>"');
      return;

    case 'token':
      if (tagName === null && typeof raw === 'string' && referenceTarget(raw) !== undefined) {
        sink.token(raw, name, at);
        return;
      }
      fail('a token reference such as "{text.body}"');
      return;

    case 'group':
      if (tagName === null && typeof raw === 'string' && referenceTarget(raw) !== undefined) {
        sink.token(raw, name, at);
        return;
      }
      fail('a token reference naming a group, such as "{button}"');
      return;

    case 'angle':
      if ((tagName === null || tagName === 'literal') && typeof raw === 'number' && Number.isFinite(raw)) return;
      fail('a number of degrees');
      return;

    case 'enum':
      if (tagName === null && typeof raw === 'string' && spec.options?.includes(raw)) return;
      fail(`one of ${spec.options?.join(' ')}`);
      return;

    case 'dimension':
    case 'size': {
      if (tagName === null && typeof raw === 'string' && referenceTarget(raw) !== undefined) {
        sink.token(raw, name, at);
        return;
      }
      if (tagName === 'literal' && typeof raw === 'number' && Number.isFinite(raw)) return;
      // `#null` clears a limit; a width or a height has nothing to clear to, and the layer sizes itself by its sizing.
      const clears = spec.value === 'size' && name !== 'width' && name !== 'height';
      if (tagName === null && raw === null && clears) return;
      if (tagName === null && raw === null && spec.value === 'size') {
        sink.error(
          `"${name}=#null": a ${name} cannot be cleared; to let the layer size itself, write layoutSizing${name === 'width' ? 'Horizontal' : 'Vertical'}=HUG (or FILL)`,
          at,
        );
        return;
      }
      const expects = `a token reference or a (literal) number${clears ? ', or #null' : ''}`;
      if (tagName === null && typeof raw === 'number') {
        sink.error(
          `"${name}" takes ${expects}: a bare ${raw} would be a number nobody chose, write (literal)${raw} or a token reference`,
          at,
        );
        return;
      }
      fail(expects);
      return;
    }

    default:
      return;
  }
}

function checkPaint(sink: Sink, name: string, json: Json, at: Loc): void {
  const tag = tagged(json);
  const raw = tag ? tag.value : json;
  if (!tag && typeof raw === 'string' && referenceTarget(raw) !== undefined) {
    sink.token(raw, name, at);
    return;
  }
  if (tag && tag.tag === 'literal' && typeof raw === 'string' && HEX_COLOUR.test(raw)) return;
  if (!tag && typeof raw === 'string' && HEX_COLOUR.test(raw)) {
    sink.error(`"${name}" has a bare colour ${show(raw)}: write (literal)${show(raw)} or a token reference`, at);
    return;
  }
  sink.error(`"${name}" takes token references or (literal) colours such as (literal)"#rrggbb", not ${show(json)}`, at);
}

// ---------------------------------------------------------------------------
// Structured fields: a child node of the layer
// ---------------------------------------------------------------------------

/** What a structured field may be built from: nothing it is not allowed to carry. */
function plainShape(
  sink: Sink,
  name: string,
  s: Structure,
  allow: { args?: boolean; props?: readonly string[]; children?: boolean },
): void {
  const what = `"${name}"`;
  if (!allow.args) for (const [index] of s.args.entries()) sink.error(`${what} takes no arguments`, s.argLocs[index]);
  for (const key of Object.keys(s.props)) {
    if (!allow.props?.includes(key))
      sink.error(`${what} has no "${key}"${allow.props?.length ? `; it takes ${allow.props.join(', ')}` : ''}`, s.propLocs[key]);
  }
  if (!allow.children) for (const child of s.children) sink.error(`${what} takes no child nodes`, child.loc);
}

const emptyList = (json: Json): boolean => Array.isArray(json) && json.length === 0;

function checkTracks(sink: Sink, name: string, json: Json, at: Loc): void {
  const what = `"${name}"`;
  if (!isStructure(json)) {
    sink.error(emptyList(json) ? `${what} needs at least one track` : `${what} takes its tracks as child nodes: FLEX, FIXED or HUG`, at);
    return;
  }
  plainShape(sink, name, json, { children: true });
  for (const track of json.children) {
    const type = track.name;
    const inner = `${type} in ${what}`;
    for (const key of Object.keys(track.props)) sink.error(`${inner} has no "${key}"`, track.propLocs[key]);
    for (const child of track.children) sink.error(`${inner} takes no child nodes`, child.loc);
    if (type === 'HUG') {
      for (const [index] of track.args.entries()) sink.error('HUG takes no arguments', track.argLocs[index]);
    } else if (type === 'FLEX' || type === 'FIXED') {
      const [number] = track.args;
      if (track.args.length > 1) sink.error(`${type} takes one number`, track.argLocs[1]);
      const where = track.argLocs[0] ?? track.loc;
      if (type === 'FLEX' && number === undefined) continue;
      if (type === 'FLEX' && typeof number === 'number' && number > 0) continue;
      if (type === 'FIXED' && typeof number === 'number' && number >= 0) continue;
      sink.error(
        type === 'FLEX'
          ? `FLEX takes a number above 0, or none for 1, not ${show(number)}`
          : `FIXED takes a number of at least 0, not ${number === undefined ? 'nothing' : show(number)}`,
        where,
      );
    } else {
      sink.error(`unknown track "${type}" in ${what}; a track is FLEX, FIXED or HUG`, track.loc);
    }
  }
  if (json.children.length === 0) sink.error(`${what} needs at least one track`, json.loc);
}

function checkPlacement(sink: Sink, name: string, json: Json, at: Loc): void {
  const what = `"${name}"`;
  if (!isStructure(json)) {
    sink.error(emptyList(json) ? `${what} needs "row"` : `${what} takes no arguments`, at);
    if (emptyList(json)) sink.error(`${what} needs "column"`, at);
    return;
  }
  plainShape(sink, name, json, { props: ['row', 'column', 'rowSpan', 'columnSpan'] });
  for (const [key, value] of Object.entries(json.props)) {
    if (['row', 'column', 'rowSpan', 'columnSpan'].includes(key))
      sink.count(value, `"${key}"`, key === 'rowSpan' || key === 'columnSpan' ? 1 : 0, json.propLocs[key]);
  }
  for (const key of ['row', 'column']) if (!(key in json.props)) sink.error(`${what} needs "${key}"`, json.loc);
}

function checkModes(sink: Sink, name: string, json: Json, at: Loc): void {
  const what = `"${name}"`;
  if (!isStructure(json)) {
    sink.error(emptyList(json) ? `${what} needs at least one Collection=mode` : `${what} takes no arguments`, at);
    return;
  }
  plainShape(sink, name, json, { props: Object.keys(json.props) });
  for (const [collection, mode] of Object.entries(json.props)) {
    if (typeof mode !== 'string' || mode === '')
      sink.error(`"${collection}" in ${what} takes a mode name, not ${show(mode)}`, json.propLocs[collection]);
  }
  if (Object.keys(json.props).length === 0) sink.error(`${what} needs at least one Collection=mode`, json.loc);
}

/** `set Name=value …`: one structure per line, each a name and a text, a boolean or a `(key)`; `set` adds, so the field holds a list of them. */
function checkSet(sink: Sink, name: string, json: Json, at: Loc): void {
  const lines = Array.isArray(json) ? json : [json];
  if (lines.length === 0) sink.error(`"${name}" needs at least one Name=value`, at);
  for (const line of lines) {
    if (!isStructure(line)) {
      sink.error(`"${name}" takes properties, as in \`${name} Name="text" Enabled=#true\`, not ${show(line)}`, at);
      continue;
    }
    plainShape(sink, name, line, { props: Object.keys(line.props) });
    if (Object.keys(line.props).length === 0) sink.error(`"${name}" needs at least one Name=value`, line.loc);
    for (const [property, value] of Object.entries(line.props)) {
      const tag = tagged(value);
      const okay = tag
        ? tag.tag === 'key' && typeof tag.value === 'string' && tag.value !== ''
        : typeof value === 'string' || typeof value === 'boolean';
      if (!okay) {
        sink.error(
          `"${property}" in "${name}" takes text, #true, #false or (key)"…", not ${show(value)}`,
          line.propLocs[property] ?? line.loc,
        );
      } else if (!tag && typeof value === 'string' && referenceTarget(value) !== undefined) {
        // A `string` or `boolean` token binds its variable to the property.
        sink.token(value, `${name} ${property}`, line.propLocs[property] ?? line.loc);
      }
    }
  }
}

// Wrap, grid child, position, appearance and strokes: the two structured fields they add.

/** `dashPattern "{stroke.dashed}"` (a strokeStyle token), `dashPattern (literal)4 (literal)2`, or a bare `dashPattern`: solid. */
function checkDashes(sink: Sink, name: string, json: Json, at: Loc): void {
  let dashes: Json[] = [];
  let locs: Loc[] = [];
  if (isStructure(json)) {
    plainShape(sink, name, json, { args: true });
    [dashes, locs] = [json.args, json.argLocs];
  } else if (Array.isArray(json)) {
    [dashes, locs] = [json, json.map(() => at)];
  }
  const isToken = (dash: Json): boolean => !tagged(dash) && typeof dash === 'string' && referenceTarget(dash) !== undefined;
  if (dashes.length > 1 && dashes.some(isToken)) {
    sink.error(`"${name}" takes one token reference or (literal) lengths, not a token beside other values`, at);
    return;
  }
  dashes.forEach((dash, index) => {
    const tag = tagged(dash);
    const raw = tag ? tag.value : dash;
    if (isToken(dash)) {
      sink.token(raw as string, name, locs[index]);
      return;
    }
    if (tag?.tag === 'literal' && typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return;
    if (!tag && typeof raw === 'number') {
      sink.error(`"${name}" has a bare ${raw}: write (literal)${raw} or a token reference`, locs[index]);
      return;
    }
    sink.error(`"${name}" takes a strokeStyle token reference or (literal) lengths of at least 0, not ${show(dash)}`, locs[index]);
  });
}

/** `constraints horizontal=MIN vertical=STRETCH`: both axes, each one of the field's options. */
function checkConstraints(sink: Sink, name: string, spec: FieldSpec, json: Json, at: Loc): void {
  const what = `"${name}"`;
  if (!isStructure(json)) {
    sink.error(`${what} takes horizontal= and vertical=, as in \`${name} horizontal=MIN vertical=MIN\``, at);
    return;
  }
  plainShape(sink, name, json, { props: ['horizontal', 'vertical'] });
  for (const axis of ['horizontal', 'vertical']) {
    const value = json.props[axis];
    if (!(axis in json.props)) sink.error(`${what} needs "${axis}"`, json.loc);
    else if (typeof value !== 'string' || !spec.options?.includes(value)) {
      sink.error(`"${axis}" in ${what} takes one of ${spec.options?.join(' ')}, not ${show(value)}`, json.propLocs[axis] ?? json.loc);
    }
  }
}

function checkStructured(sink: Sink, name: string, spec: FieldSpec, json: Json, at: Loc): void {
  if (!isStructure(json) && !Array.isArray(json)) {
    sink.error(`"${name}" is written as a child node, \`${name} …\`, not as a property`, at);
    return;
  }
  switch (spec.value) {
    case 'paints':
      if (isStructure(json)) {
        plainShape(sink, name, json, { args: true });
        for (const [index, paint] of json.args.entries()) checkPaint(sink, name, paint, json.argLocs[index]);
      } else {
        for (const paint of json) checkPaint(sink, name, paint, at);
      }
      return;
    case 'tracks':
      checkTracks(sink, name, json, at);
      return;
    case 'placement':
      checkPlacement(sink, name, json, at);
      return;
    case 'set':
      checkSet(sink, name, json, at);
      return;
    case 'effects':
      if (isStructure(json)) {
        plainShape(sink, name, json, { args: true });
        for (const [index, effect] of json.args.entries()) checkEffect(sink, name, effect, json.argLocs[index]);
      } else {
        for (const effect of json) checkEffect(sink, name, effect, at);
      }
      return;
    case 'grids':
      checkGrids(sink, name, json, at);
      return;
    case 'dashes':
      checkDashes(sink, name, json, at);
      return;
    case 'constraints':
      checkConstraints(sink, name, spec, json, at);
      return;
    default:
      checkModes(sink, name, json, at);
      return;
  }
}

// ---------------------------------------------------------------------------
// Effects and layout grids (unit 4)
// ---------------------------------------------------------------------------

/** An effect: a shadow or a dimension token (a layer blur's radius), which the design system tells apart, or a `(literal)` radius. */
function checkEffect(sink: Sink, name: string, json: Json, at: Loc): void {
  const tag = tagged(json);
  const raw = tag ? tag.value : json;
  if (!tag && typeof raw === 'string' && referenceTarget(raw) !== undefined) {
    sink.token(raw, name, at);
    return;
  }
  if (tag?.tag === 'literal' && typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return;
  if (!tag && typeof raw === 'number') {
    sink.error(`"${name}" has a bare ${raw}: write (literal)${raw} for a layer blur of that radius, or a token reference`, at);
    return;
  }
  sink.error(
    `"${name}" takes token references to shadows and dimensions (a layer blur's radius), or a (literal) radius, not ${show(json)}`,
    at,
  );
}

const GRID_KEYS = ['count', 'gutterSize', 'offset', 'sectionSize'];
const DIMENSION_SPEC: FieldSpec = { nodes: [], value: 'dimension' };

/**
 * `layoutGrids { COLUMNS alignment=STRETCH count=12 gutterSize="{space.md}" … }`: one child node per grid, its fields
 * as properties. A field the grid's alignment does not take is refused with its line, as Figma refuses to bind it.
 */
function checkGrids(sink: Sink, name: string, json: Json, at: Loc): void {
  const what = `"${name}"`;
  if (!isStructure(json)) {
    sink.error(emptyList(json) ? `${what} needs at least one grid` : `${what} takes its grids as child nodes: COLUMNS, ROWS or GRID`, at);
    return;
  }
  plainShape(sink, name, json, { children: true });
  if (json.children.length === 0) sink.error(`${what} needs at least one grid`, json.loc);
  for (const grid of json.children) {
    const pattern = grid.name;
    if (!(GRID_PATTERNS as readonly string[]).includes(pattern)) {
      sink.error(`unknown grid "${pattern}" in ${what}; a grid is COLUMNS, ROWS or GRID`, grid.loc);
      continue;
    }
    const inner = `${pattern} in ${what}`;
    for (const [index] of grid.args.entries()) sink.error(`${inner} takes no arguments`, grid.argLocs[index]);
    for (const child of grid.children) sink.error(`${inner} takes no child nodes`, child.loc);
    const square = pattern === 'GRID';
    const alignment = square ? 'GRID' : grid.props.alignment;
    if (!square && alignment === undefined) sink.error(`${inner} needs "alignment": one of ${GRID_ALIGNMENTS.join(' ')}`, grid.loc);
    else if (!square && !(GRID_ALIGNMENTS as readonly Json[]).includes(alignment)) {
      sink.error(`"alignment" in ${inner} takes one of ${GRID_ALIGNMENTS.join(' ')}, not ${show(alignment)}`, grid.propLocs.alignment);
    }
    const takes = typeof alignment === 'string' ? GRID_FIELDS[alignment] : undefined;
    for (const [key, value] of Object.entries(grid.props)) {
      const loc = grid.propLocs[key] ?? grid.loc;
      if (key === 'alignment' && !square) continue;
      if (key === 'color') {
        checkPaint(sink, `color" in "${pattern}`, value, loc);
        continue;
      }
      if (!GRID_KEYS.includes(key)) {
        sink.error(
          `${inner} has no "${key}"; it takes ${[...(square ? [] : ['alignment']), ...(square ? ['sectionSize'] : GRID_KEYS), 'color'].join(', ')}`,
          loc,
        );
        continue;
      }
      if (takes && !takes.includes(key)) {
        sink.error(
          `"${key}" does not apply to ${square ? 'a square GRID' : `a ${alignment} grid`} in ${what}: Figma takes ${takes.join(', ')} there, and refuses to bind "${key}"`,
          loc,
        );
        continue;
      }
      if (key !== 'count') checkScalar(sink, key, DIMENSION_SPEC, value, loc);
      else {
        const tag = tagged(value);
        const raw = tag ? tag.value : value;
        if (!tag && typeof raw === 'string' && referenceTarget(raw) !== undefined) sink.token(raw, key, loc);
        else if ((!tag || tag.tag === 'literal') && typeof raw === 'number' && Number.isInteger(raw) && raw >= 1) continue;
        else sink.error(`"count" in ${inner} takes a token reference or a whole number of at least 1, not ${show(value)}`, loc);
      }
    }
    // What Figma needs to draw the grid: the offset alone defaults, to 0.
    for (const key of takes ?? []) if (key !== 'offset' && !(key in grid.props)) sink.error(`${inner} needs "${key}"`, grid.loc);
  }
}

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

/** `slot Content { … }`: the layers that fill a slot of the instance it stands in. It has a name and layers inside, and no fields of its own. */
function checkSlotWord(sink: Sink, node: OutNode, parent: LayerKind): void {
  if (!sink.artboard) {
    sink.error(
      `"${SLOT_WORD}" fills an instance's slot in an artboard file; a component file makes a slot with a SLOT layer and a SLOT property`,
      node.loc,
    );
  } else if (parent !== 'INSTANCE') {
    sink.error(
      `"${SLOT_WORD}" fills a slot of the instance it stands in, so it stands directly inside an INSTANCE, not a ${parent}`,
      node.loc,
    );
  }
  const first = node.args[0];
  if (typeof first !== 'string' || first === '')
    sink.error(`${SLOT_WORD} needs the name of the slot it fills as its first argument`, node.loc);
  if (node.args.length > 1) sink.error(`${SLOT_WORD} takes one name`, node.argLocs[1]);
  for (const field of Object.keys(node.fields))
    sink.error(`${SLOT_WORD} "${String(first ?? '')}" has no field "${field}"; it holds layers`, node.fieldLocs[field] ?? node.loc);
}

function checkNode(sink: Sink, node: OutNode): void {
  if (node.kind === 'call') {
    sink.error(`"+${node.name}" calls a definition this file does not define`, node.loc);
    return;
  }
  const kind = node.name as LayerKind;
  const first = node.args[0];
  const named = typeof first === 'string' && first !== '';
  if (!named) sink.error(`${kind} needs a name as its first argument`, node.loc);
  if (node.args.length > 1) sink.error(`${kind} takes one name`, node.argLocs[1]);
  const what = `${kind} "${named ? first : ''}"`;
  if (sink.artboard && kind === 'SLOT') {
    sink.error(
      `${what}: a SLOT layer makes the slot of a component; in an artboard, fill an instance's slot with \`${SLOT_WORD} <Name> { … }\` inside the INSTANCE`,
      node.loc,
    );
  }

  for (const [name, json] of Object.entries(node.fields)) {
    const at = node.fieldLocs[name] ?? node.loc;
    const spec = specOf(name);
    if (!spec) sink.error(`unknown field "${name}" on ${what}`, at);
    else if (name === 'tokens' && kind === 'INSTANCE')
      sink.error(`tokens does not apply to an INSTANCE layer, in ${what}: an instance's overrides are not in this design`, at);
    else if (name === 'tokens' && sink.artboard)
      sink.error(`tokens does not apply in an artboard file, in ${what}: bind each field with a token reference`, at);
    else if (name === 'isExposedInstance' && sink.artboard)
      sink.error(
        `isExposedInstance does not apply in an artboard file, in ${what}: an exposed instance is one inside a component, whose instances list its properties`,
        at,
      );
    else if (!spec.nodes.includes(kind)) {
      sink.error(
        `"${name}" does not apply to a ${kind} layer, in ${what}${kind === 'LINE' && /[hH]eight$/.test(name) ? ': a line has a length, width, and no height' : ''}`,
        at,
      );
    } else if (isStructured(spec)) checkStructured(sink, name, spec, json, at);
    else checkScalar(sink, name, spec, json, at);
  }
  if (kind === 'TEXT') checkText(sink, node, what);
  if ('effects' in node.fields && 'effectStyle' in node.fields) {
    // Unit 4: a style sets the layer's effects, so the two fields would be two writers of one list.
    sink.error(
      `${what} has both "effects" and "effectStyle": the effect style sets the effects that "effects" sets, so the two would disagree; keep one`,
      node.fieldLocs.effects ?? node.loc,
    );
  }
  if (kind === 'INSTANCE' && !('component' in node.fields)) {
    // An instance is an instance of something.
    sink.error(
      `${what} needs component=<a component's name>, component=(key)"…" or component=(property)"<INSTANCE_SWAP property>"`,
      node.loc,
    );
  }

  const slots = new Set<string>();
  for (const child of node.children) {
    if (child.kind === 'element' && child.name === SLOT_WORD) {
      checkSlotWord(sink, child, kind);
      const slotName = String(child.args[0] ?? '');
      if (slots.has(slotName)) sink.error(`${what} fills the slot "${slotName}" twice; write one ${SLOT_WORD} for it`, child.loc);
      slots.add(slotName);
      // What stands inside a slot is a layer, and may not be another `slot`.
      for (const inner of child.children) {
        if (inner.kind === 'element' && inner.name === SLOT_WORD)
          sink.error(`${SLOT_WORD} stands inside an INSTANCE, not inside another ${SLOT_WORD}`, inner.loc);
        else checkNode(sink, inner);
      }
      continue;
    }
    if (child.kind === 'element' && (kind === 'TEXT' || kind === 'INSTANCE' || kind === 'LINE')) {
      sink.error(
        `${what} cannot hold ${child.name} "${String(child.args[0] ?? '')}": a ${kind} has no child layers${sink.artboard && kind === 'INSTANCE' ? `; put it in a slot, ${SLOT_WORD} <Name> { … }` : ''}`,
        child.loc,
      );
    }
    checkNode(sink, child);
  }
}

// ---------------------------------------------------------------------------
// Text fields
// ---------------------------------------------------------------------------

/**
 * A text field beside `textStyle` is a second source for one value, the style's and the field's, and is refused naming
 * both. `maxLines` is a whole number of at least 1: Figma refuses 0 (measured §14).
 */
function checkText(sink: Sink, node: OutNode, what: string): void {
  if ('textStyle' in node.fields) {
    for (const field of STYLE_TEXT_FIELDS) {
      if (field in node.fields) {
        sink.error(
          `"${field}" and "textStyle" on ${what}: a text style sets the ${field} too, and two sources for one value would disagree; write one of them`,
          node.fieldLocs[field] ?? node.loc,
        );
      }
    }
  }
  const maxLines = tagged(node.fields.maxLines);
  if (maxLines?.tag === 'literal' && !(typeof maxLines.value === 'number' && Number.isInteger(maxLines.value) && maxLines.value >= 1)) {
    sink.error(
      `"maxLines" on ${what} takes a whole number of at least 1, not ${show(node.fields.maxLines)}`,
      node.fieldLocs.maxLines ?? node.loc,
    );
  }
}

/**
 * What is wrong in one member's tree, by Toghen's rules: the root, and every layer's
 * fields. `at` is where the component is named, for a file with no root layer.
 */
export function checkRoots(roots: OutNode[], component: string, at: Loc): Problem[] {
  const sink = new Sink();
  if (roots.length === 0) sink.error(`component "${component}" needs one root FRAME`, at);
  roots.forEach((root, index) => {
    if (index > 0) sink.error('a component has exactly one root FRAME; this is a second', root.loc);
    else if (root.kind === 'element' && root.name !== 'FRAME')
      sink.error(`the component's root layer must be a FRAME, not a ${root.name}`, root.loc);
    if (root.kind === 'element' && root.name === SLOT_WORD) return;
    checkNode(sink, root);
  });
  return sink.problems;
}

/**
 * A pin the file writes on the root for a collection an axis already pins.
 *
 * `VARIANT State (modifier)"state"` pins the collection `state` on each member's root, so a
 * `modes state=…` the file writes there (or a `when` writes there) would be a second writer of
 * one pin, and the two would disagree in some member. It is an error, not a quiet override.
 */
export function checkPins(roots: OutNode[], component: Component): Problem[] {
  const sink = new Sink();
  const pinned = new Map<string, string>();
  for (const property of component.properties) {
    if (property.type === 'VARIANT' && property.modifier !== undefined) pinned.set(property.modifier, property.name);
  }
  const root = roots[0];
  const modes = root?.fields.modes;
  if (pinned.size === 0 || !isStructure(modes)) return sink.problems;
  const at = root.fieldLocs?.modes ?? root.loc;
  for (const collection of Object.keys(modes.props)) {
    const axis = pinned.get(collection);
    if (axis !== undefined) {
      sink.error(
        `modes ${collection}=… on the root layer: the VARIANT axis "${axis}" already pins "${collection}" to its value in every member; ` +
          `two writers of one pin would disagree, so the file does not write it`,
        at,
      );
    }
  }
  return sink.problems;
}

/**
 * What is wrong in an artboard file's tree, by Toghen's rules: the root, and every layer's fields.
 * `at` is where the artboard is named, for a file with no root layer.
 */
export function checkArtboardRoots(roots: OutNode[], artboard: string, at: Loc): Problem[] {
  const sink = new Sink(true);
  if (roots.length === 0) sink.error(`artboard "${artboard}" needs one root FRAME`, at);
  roots.forEach((root, index) => {
    if (index > 0) sink.error('an artboard has exactly one root FRAME; this is a second', root.loc);
    else if (root.kind === 'element' && root.name !== 'FRAME')
      sink.error(`the artboard's root layer must be a FRAME, not a ${root.name}`, root.loc);
    if (root.kind === 'element' && root.name === SLOT_WORD) return;
    checkNode(sink, root);
  });
  return sink.problems;
}
