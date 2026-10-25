/**
 * What the selected layers are bound to, property by property, for the
 * Selection pane. See `reference.md`, *What the selection is bound to*.
 *
 * The page and file scopes walk every layer `QueryEngine` reaches; the answer
 * is capped, and says how many it left out rather than drawing a list nobody
 * reads to the end.
 */

import type { Command, FieldBinding, PropertyBinding, Response, SelectionBindingsPayload } from '../../shared/protocol.js';
import { FIELDS, namesStyle } from '../../shared/components/fields.js';
import { applyKindOf, reportField } from '../components/fieldWriter.js';
import { PropertyMapper, type ExpectedBinding } from '../engines/propertyMapper.js';
import { QueryEngine } from '../engines/queryEngine.js';
import { getStamp, stampOn } from '../components/stamp.js';
import { getState } from '../runtimeState.js';
import { PAINT_PROPERTIES, boundVariablesOf } from '../utils/boundVariables.js';
import { loadTemplates } from '../utils/templateStore.js';

type ReadCommand = Extract<Command, { type: 'READ_SELECTION_BINDINGS' }>;

/** The most layers one answer carries. */
export const MAX_NODES = 200;

export async function READ_SELECTION_BINDINGS(payload: ReadCommand['payload']): Promise<void> {
  const state = getState();
  const all = payload.scope === 'selection' ? [...figma.currentPage.selection] : await new QueryEngine().resolve('**', payload.scope);
  const nodes = all.slice(0, MAX_NODES);

  // A variable's stamp says which token it was written for.
  const tokenOf = new Map<string, string>();
  const variableName = new Map<string, string>();
  for (const variable of await figma.variables.getLocalVariablesAsync()) {
    variableName.set(variable.id, variable.name);
    const token = getStamp(variable)?.is.token;
    if (token !== undefined) tokenOf.set(variable.id, token);
  }

  const mapper = state.conventions.length > 0 ? new PropertyMapper(state.conventions) : null;
  const kept = new Map(loadTemplates().map((template) => [template.name, template]));

  const out: SelectionBindingsPayload['nodes'] = [];
  for (const node of nodes) {
    const bound = boundVariablesOf(node);
    const expected = new Map<string, ExpectedBinding>();
    for (const binding of mapper ? await mapper.inferExpectedBindings(node) : []) expected.set(binding.property, binding);

    const template = templateOf(node, kept);
    const fields = new Set(template ? Object.keys(stampOn(node)?.receipt ?? {}) : []);

    const names = new Set<string>([...bound.keys(), ...expected.keys()]);
    for (const [key, property] of Object.entries(PAINT_PROPERTIES)) if (solidColor(node, key) !== null) names.add(property);

    const properties: PropertyBinding[] = [...names].map((property) => {
      const id = bound.get(property);
      const suggestion = expected.get(property);
      return {
        property,
        bound: id ? { variableName: variableName.get(id) ?? id, tokenPath: tokenOf.get(id) ?? null } : null,
        literal: id ? null : literalOf(node, property),
        suggestion: !id && suggestion?.exists && suggestion.variableId ? (tokenOf.get(suggestion.variableId) ?? null) : null,
        declaredBy: template && fields.has(fieldOf(property)) ? template.name : null,
      };
    });

    out.push({
      id: node.id,
      name: node.name,
      kind: node.type,
      builtFrom: template ? { template: template.name, fileName: template.fileName, kept: template.kept } : null,
      properties,
      fields: await fieldRows(node, variableName, tokenOf),
    });
  }

  postToUi({
    type: 'SELECTION_BINDINGS',
    payload: {
      scope: payload.scope,
      readAt: new Date().toISOString(),
      nodes: out,
      ...(all.length > nodes.length ? { more: all.length - nodes.length } : {}),
    },
  });
}

/**
 * A row for every field the field table lists, with a token column, for the layer's kind, read as the receipt reads
 * it (`reportField`): bound to a variable, or to a style, or plain, with what it holds where that reads as one value.
 * A layer of no kind the table has gets none.
 */
async function fieldRows(node: SceneNode, variableName: Map<string, string>, tokenOf: Map<string, string>): Promise<FieldBinding[]> {
  if (!['FRAME', 'COMPONENT', 'INSTANCE', 'SLOT', 'TEXT', 'LINE'].includes(node.type)) return [];
  const kind = applyKindOf(node);
  const rows: FieldBinding[] = [];
  for (const [field, spec] of Object.entries(FIELDS)) {
    if (!spec.token || !spec.nodes.includes(kind)) continue;
    const report = reportField(node, field);
    if (namesStyle(spec)) {
      const style = typeof report === 'string' && report !== '' ? await figma.getStyleByIdAsync(report) : null;
      rows.push({ field, bound: style ? { name: style.name, tokenPath: getStamp(style)?.is.token ?? null } : null });
      continue;
    }
    const reports = (Array.isArray(report) ? report : [report]) as Array<{ variable?: string | null } | null>;
    const id = reports.find((each) => typeof each?.variable === 'string')?.variable ?? undefined;
    rows.push(
      id
        ? { field, bound: { name: variableName.get(id) ?? id, tokenPath: tokenOf.get(id) ?? null } }
        : { field, bound: null, holds: literalOf(node, PAINT_PROPERTIES[field] ?? field) },
    );
  }
  return rows;
}

/** The kept template whose set this node is in, by the set's stamp. */
function templateOf<T>(node: SceneNode, kept: Map<string, T>): T | undefined {
  let current: BaseNode | null = node;
  while (current && current.type !== 'PAGE') {
    if (current.type === 'COMPONENT_SET') {
      const name = stampOn(current)?.is.component;
      return name !== undefined ? kept.get(name) : undefined;
    }
    current = current.parent;
  }
  return undefined;
}

/** The layer field a property is written by, in a component file's vocabulary. */
function fieldOf(property: string): string {
  if (property === PAINT_PROPERTIES.fills) return 'fills';
  if (property === PAINT_PROPERTIES.strokes) return 'strokes';
  return property;
}

/** The first paint's colour as hex, when it is a solid paint. */
function solidColor(node: SceneNode, key: string): string | null {
  const paints = (node as unknown as Record<string, unknown>)[key];
  if (!Array.isArray(paints) || paints.length === 0) return null;
  const paint = paints[0] as { type?: string; color?: { r: number; g: number; b: number }; opacity?: number };
  if (paint.type !== 'SOLID' || !paint.color) return null;
  const byte = (channel: number) =>
    Math.round(channel * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${byte(paint.color.r)}${byte(paint.color.g)}${byte(paint.color.b)}`;
}

/** What an unbound property holds, written for reading. */
function literalOf(node: SceneNode, property: string): string | null {
  if (property === PAINT_PROPERTIES.fills) return solidColor(node, 'fills');
  if (property === PAINT_PROPERTIES.strokes) return solidColor(node, 'strokes');
  const value = (node as unknown as Record<string, unknown>)[property];
  if (typeof value === 'number') return String(Math.round(value * 100) / 100);
  if (typeof value === 'string') return value;
  return null;
}

function postToUi(response: Response): void {
  figma.ui.postMessage(response);
}
