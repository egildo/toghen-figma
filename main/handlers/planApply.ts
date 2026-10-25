/**
 * Apply's plan: a token, or a group's tokens, on the layers of a scope. See `reference.md`, *Apply a token to layers*.
 *
 * The query is over tokens, not layer names: a token's path, or a group's, which is a set. A set reaches fields by each
 * token's last key, through the table `tokens=` uses in a component file (`planOf`); one token takes the field it is
 * given, or reaches one by its last key as a set's member does. One operation per layer and field; a field the layer
 * has not, or a token the file has no variable for, is a row saying so. What is written as a value is said here,
 * before Execute, with the context it takes: the declared defaults.
 */

import { FIELDS, namesStyle } from '../../shared/components/fields.js';
import { planOf } from '../../shared/components/groups.js';
import type { GroupInfo, Laid } from '../../shared/components/model.js';
import type { Operation } from '../../shared/operations.js';
import type { ApplyKind, Command, Response } from '../../shared/protocol.js';
import { applyKindOf, applyLayer, resolvedFor, valueLine } from '../components/fieldWriter.js';
import { coreAtDefaults } from '../components/resolve.js';
import { QueryEngine } from '../engines/queryEngine.js';
import { getState, setState } from '../runtimeState.js';
import { designSourceOf } from '../utils/designSource.js';
import { tokenPathToVariableName } from '../utils/tokenPath.js';

type Payload = Extract<Command, { type: 'PLAN_APPLY' }>['payload'];

/** The Figma layer types each kind takes. */
const TYPES: Record<ApplyKind, readonly string[]> = { frames: ['FRAME', 'SLOT'], instances: ['INSTANCE'], components: ['COMPONENT'] };

/** What one token on one field comes to: what to write, or the problem that stops it. */
type Check = { problem: string } | { variable?: Variable; atDefaults?: { value: VariableValue | number[]; context: string } };

function fail(message: string, code: 'NO_RESOLVER' | 'INVALID_QUERY' = 'INVALID_QUERY'): void {
  figma.ui.postMessage({ type: 'ERROR', payload: { message, code, commandType: 'PLAN_APPLY' } } satisfies Response);
}

export async function PLAN_APPLY(payload: Payload): Promise<void> {
  const { resolver } = getState();
  if (!resolver) return fail('Load a design system before planning apply: its tokens are what Apply writes.', 'NO_RESOLVER');
  const path = payload.tokens.trim().replace(/^\{(.*)\}$/, '$1');
  // The core at the declared defaults, as a build asks it: each token's type, and its value in Figma's representation.
  const core = coreAtDefaults();
  if (!core) return fail('The loaded design system has no declared defaults to read its tokens at.', 'NO_RESOLVER');

  // The fields each layer kind gets, as a component file's `tokens=` would give them.
  const found = designSourceOf(resolver).group!(path);
  if (found === undefined) return fail(`"${path}" names no token and no group of the design system`);
  let plan: ReturnType<typeof planOf> | undefined;
  if (payload.field !== undefined) {
    if (found !== 'token')
      return fail(`"${path}" is a group: a field is picked for one token, and a group's tokens reach fields by their last keys`);
    if (!Object.prototype.hasOwnProperty.call(FIELDS, payload.field) || !FIELDS[payload.field].token)
      return fail(`"${payload.field}" is not a field a token reaches`);
  } else if (found === 'token') {
    // One token is a set of one: it reaches a field by its last key.
    const key = path.slice(path.lastIndexOf('.') + 1);
    const info: GroupInfo = { keys: [key], paths: { [key]: path }, ...(core.valueOf(path)?.type === 'color' ? { colors: [key] } : {}) };
    plan = planOf(path, info);
  } else {
    plan = planOf(path, found);
  }

  // Each token is checked against each field once, however many layers it goes on.
  const variables = await figma.variables.getLocalVariablesAsync();
  const checks = new Map<string, Check>();
  const check = (at: string, field: string): Check => {
    const key = `${at}\n${field}`;
    let result = checks.get(key);
    if (!result) checks.set(key, (result = checkToken(at, field)));
    return result;
  };
  const checkToken = (at: string, field: string): Check => {
    const spec = FIELDS[field].token!;
    const token = core.valueOf(at);
    const type = token?.type ?? '';
    if (!token) return { problem: `token {${at}} is not in the design system` };
    if (!spec.types.includes(type))
      return { problem: `token {${at}} is a ${type || 'token with no type'}, and "${field}" takes ${spec.types.join(' or ')}` };
    if (namesStyle(FIELDS[field])) return { problem: `"${field}" takes a style, which Apply does not write; a component file does` };
    // A gradient, a shadow or a grid is written part by part, each part bound or written: a component file's work.
    if (type === 'gradient' || FIELDS[field].value === 'effects' || FIELDS[field].value === 'grids') {
      return { problem: `token {${at}} on "${field}" is written part by part, which Apply does not do; a component file does` };
    }
    const atDefaults = token.value === undefined ? undefined : { value: token.value, context: core.context };
    if (!spec.bind)
      return atDefaults
        ? { atDefaults }
        : { problem: `token {${at}} on "${field}" is written as its value, and Figma cannot take its value` };
    const name = tokenPathToVariableName(at);
    const named = variables.filter((variable) => variable.name === name);
    if (named.length === 0)
      return { problem: `token {${at}} names no variable in this file: looked for "${name}"; run the variable sync first` };
    if (named.length > 1) return { problem: `token {${at}} is ambiguous, ${named.length} variables in this file are named "${name}"` };
    if (named[0].resolvedType !== spec.bind.variable)
      return { problem: `token {${at}} is a ${named[0].resolvedType} variable, and "${field}" needs a ${spec.bind.variable} one` };
    return { variable: named[0], atDefaults };
  };

  const kinds = new Set<string>();
  for (const kind of payload.kinds) for (const type of TYPES[kind] ?? []) kinds.add(type);
  const layers = (await new QueryEngine().resolve('**', payload.scope)).filter((node) => kinds.has(node.type));

  const operations: Operation[] = [];
  const said = new Set<string>();
  const once = (row: Operation, key: string): void => {
    if (!said.has(key)) operations.push(row);
    said.add(key);
  };
  if (layers.length === 0)
    operations.push({ kind: 'SKIP', reason: `no ${payload.kinds.join(', ') || 'layers'} in ${payload.scope}`, path });
  for (const node of layers) {
    const kind = applyKindOf(node);
    const layout = ((node as Partial<FrameNode>).layoutMode ?? 'NONE') as 'NONE';
    const laid: Laid[] = plan
      ? [plan.box, plan[layout]].filter((each): each is Laid => each !== undefined)
      : [{ set: { [payload.field!]: path } }];
    for (const each of laid) {
      for (const note of each.notes ?? []) operations.push({ kind: 'SKIP', reason: note, path: node.name });
      for (const warning of each.warnings ?? []) once({ kind: 'WARNING', message: warning, path }, warning);
      for (const [field, at] of Object.entries(each.set)) {
        if (!FIELDS[field].nodes.includes(kind)) {
          operations.push({ kind: 'SKIP', reason: `a ${kind} has no field "${field}"`, path: `${node.name} · ${field}` });
          continue;
        }
        const checked = check(at, field);
        if ('problem' in checked) {
          once({ kind: 'WARNING', message: checked.problem, path: at }, checked.problem);
          continue;
        }
        const written = valueLine(node.name, resolvedFor(checked.variable, checked.atDefaults), applyLayer(node, field, at), field);
        operations.push({
          kind: 'APPLY_TOKEN',
          nodeId: node.id,
          nodeName: node.name,
          field,
          path: at,
          ...(checked.variable ? { variableId: checked.variable.id } : {}),
          ...(written && checked.atDefaults ? { value: checked.atDefaults.value, context: checked.atDefaults.context, written } : {}),
        });
      }
    }
  }

  setState({ lastPlan: operations, lastPlanType: 'apply' });
  figma.ui.postMessage({
    type: 'PLAN_READY',
    payload: {
      planType: 'apply',
      operations,
      summary: {
        total: operations.length,
        applies: operations.filter((op) => op.kind === 'APPLY_TOKEN').length,
        written: operations.filter((op) => op.kind === 'APPLY_TOKEN' && op.written !== undefined).length,
        skips: operations.filter((op) => op.kind === 'SKIP').length,
        warnings: operations.filter((op) => op.kind === 'WARNING').length,
      },
    },
  } satisfies Response);
}
