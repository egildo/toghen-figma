/**
 * The Apply pane: what the selected layers are bound to, and putting a token
 * or a set on a scope.
 *
 * It follows Figma's selection. The scope (selection, page, file) chooses the
 * layers; the token query chooses the tokens, and is over tokens, never layer
 * names. A row per field the field table lists for the layer: bound, with where
 * that token stands from the Tokens pane's last look, or plain, with what it
 * holds. A value Apply wrote reads as plain too, since no stamp records it.
 * Apply's Plan and Execute, and the conventions' commands at the foot, report
 * on the result surface (R2); their settings sit beside them (R3). A one-click
 * Bind plans that one binding and executes it, both on the surface too.
 */

import { TgElement, define } from './base.js';
import { card, chip, dot, icon, row } from '../markup.js';
import { countOf, escAttr, escHtml, formatClock, formatDay } from '../format.js';
import { send } from '../commandBus.js';
import { getState, setState } from '../state.js';
import { driftDot, tokenModel } from './pane-tokens.js';
import { applyFieldsFor } from '../../shared/components/fields.ts';

const HEX = /^#[0-9a-f]{3,8}$/i;
const SET_KINDS = new Set(['COMPONENT_SET', 'COMPONENT', 'INSTANCE']);
/** The conventions name a paint's binding by its first paint; the field table, by the field. */
const FIELD_OF = { 'fills[0].color': 'fills', 'strokes[0].color': 'strokes' };
/** The layers Apply writes, as `PLAN_APPLY` names them. */
const KINDS = [
  ['frames', 'Frames'],
  ['instances', 'Instances'],
  ['components', 'Component definitions'],
];
const ON_SCOPE = { selection: 'On the selection', page: 'On this page', file: 'On the whole file' };

/** Asks the main thread to read the pane's scope again. */
export function readSelection() {
  const state = getState();
  if (!state.documentLoaded) return;
  setState({ selectionReading: true });
  send({ type: 'READ_SELECTION_BINDINGS', payload: { scope: state.selectionScope } });
}

const relative = (path) => path.slice(path.indexOf('.') + 1);
const swatch = (value) => (value && HEX.test(value) ? `<span class="tg-swatch" style="background-color:${value}"></span>` : '');

/**
 * The contexts in which a token's value differs from the default, by name:
 * `dark` for a mode `dark/default/rest` against `light/default/rest`.
 */
function differingContexts(entry, modes) {
  if (!entry || !modes?.length) return [];
  const base = entry.valueByMode[modes[0]];
  const parts = modes[0].split('/');
  const out = [];
  for (const mode of modes.slice(1)) {
    if (entry.valueByMode[mode] === null || entry.valueByMode[mode] === base) continue;
    const segments = mode.split('/');
    out.push(segments.find((segment, index) => segment !== parts[index]) ?? mode);
  }
  return out;
}

/**
 * A layer's rows: one per field the table lists, with what the conventions say of it; then any property the
 * conventions read that has no field row, so its Bind is not lost.
 */
function rowsOf(node) {
  const props = new Map(node.properties.map((property) => [FIELD_OF[property.property] ?? property.property, property]));
  const fields = node.fields ?? [];
  const rows = fields.map((field) => ({ ...field, prop: props.get(field.field) ?? null }));
  const listed = new Set(fields.map((field) => field.field));
  for (const [name, prop] of props) {
    if (listed.has(name)) continue;
    rows.push({
      field: prop.property,
      bound: prop.bound && { name: prop.bound.variableName, tokenPath: prop.bound.tokenPath },
      holds: prop.literal,
      prop,
    });
  }
  return rows;
}

function fieldRow(node, field, model, graphModes) {
  const prop = field.prop;
  // The leading mark says the template's file sets this field; an empty one keeps the labels in line.
  const template = prop?.declaredBy
    ? `<span data-part="leading" title="Declared by ${escAttr(prop.declaredBy)}">${icon('template', 'sm')}</span>`
    : '<span data-part="leading"></span>';
  const label = `<span data-part="label" data-text="code">${escHtml(field.field)}</span>`;

  if (field.bound) {
    const path = field.bound.tokenPath;
    const token = path ? model.byPath.get(path) : null;
    const value = token?.graph?.valueByMode?.[model.defaultMode] ?? null;
    const state = token ? token.dot : 'unread';
    const differs = differingContexts(token?.graph, graphModes);
    const note = prop?.declaredBy
      ? `from ${escHtml(prop.declaredBy)}`
      : node.builtFrom
        ? 'yours, not in the file'
        : differs.length
          ? `<span class="warn">${escHtml(differs.join(', '))} differs</span>`
          : value !== null
            ? `<span data-text="code">${escHtml(value)}</span>`
            : '';
    return (
      `<tg-row${state === 'drifted' ? ' data-tone="warn"' : ''}>${template}${label}` +
      `<span data-part="value">${swatch(value)}` +
      (path
        ? `<button type="button" class="tg-button" data-variant="link" data-text="code" data-goto="${escAttr(path)}">${escHtml(relative(path))}</button>`
        : `<span data-text="code">${escHtml(field.bound.name)}</span><span class="faint">not in the record</span>`) +
      `</span><span data-part="trailing"><span class="note">${note}</span>${token ? driftDot(token) : dot('unread')}</span></tg-row>`
    );
  }

  // Plain: what it holds, and nothing more (R11). A value Apply wrote is plain too; the pane says so once, beside Apply.
  const holds = field.holds ?? null;
  return (
    `<tg-row>${template}${label}` +
    `<span data-part="value">${swatch(holds)}` +
    // A plain field the file does not declare is not said to be anyone's: most hold the layer's defaults.
    `<span class="faint unbound">plain${holds !== null ? ` · <span data-text="code">${escHtml(holds)}</span>` : ''}</span></span>` +
    (prop?.suggestion
      ? `<span data-part="trailing"><button type="button" class="tg-button" data-variant="link" data-size="sm" data-bind-node="${escAttr(node.id)}" data-bind-property="${escAttr(prop.property)}">Bind ${escHtml(relative(prop.suggestion))}</button></span>`
      : '') +
    `</tg-row>`
  );
}

function scopeControl(scope) {
  return (
    // An id on each segment lets a redraw give the focus back to the one the arrow keys moved to.
    `<tg-segmented aria-label="Scope">` +
    ['selection', 'page', 'file']
      .map(
        (value) =>
          `<button type="button" id="scope-${value}" aria-checked="${scope === value}" data-value="${value}" data-scope="${value}">${value[0].toUpperCase()}${value.slice(1)}</button>`,
      )
      .join('') +
    `</tg-segmented>`
  );
}

/** Every token's and every group's path, without the collection, for the query's suggestions; kept per graph. */
const pathsOf = (() => {
  let graph = null;
  let paths = [];
  return (tokenGraph) => {
    if (tokenGraph !== graph) {
      graph = tokenGraph;
      const all = new Set();
      for (const entry of tokenGraph?.tokens ?? []) {
        const segments = relative(entry.path).split('.');
        for (let i = 1; i <= segments.length; i++) all.add(segments.slice(0, i).join('.'));
      }
      paths = [...all].sort();
    }
    return paths;
  };
})();

/** What the token query names: nothing typed, a token (its type and the fields it can reach), a group, or nothing known. */
export function applyQuery(state) {
  const path = (state.applyTokens ?? '').trim().replace(/^\{(.*)\}$/, '$1');
  if (!path) return { kind: 'empty', path };
  const tokens = state.tokenGraph?.tokens;
  // The graph not read yet: the main thread answers for the query.
  if (!tokens) return { kind: 'unknown', path };
  const token = tokens.find((entry) => relative(entry.path) === path);
  if (token) return { kind: 'token', path, type: token.type, fields: applyFieldsFor(token.type ?? '') };
  if (tokens.some((entry) => relative(entry.path).startsWith(`${path}.`))) return { kind: 'group', path };
  return { kind: 'none', path };
}

/** Apply's command group: the token query, the field for one token, the kinds, and Plan and Execute on the pane's scope (R3). */
function applyCard(state) {
  const busy = state.status === 'running' || state.status === 'planning';
  const query = applyQuery(state);
  const kinds = state.applyKinds ?? [];
  const said = {
    empty: 'a token, or a group, which is a set',
    unknown: '',
    token: `a ${escHtml(query.type ?? 'token with no type')} token${query.fields?.length ? '' : ': no field Apply writes takes it'}`,
    group: 'a group: its tokens reach fields by their last keys',
    none: `<span class="warn">names no token and no group of the design system</span>`,
  }[query.kind];
  const tokens =
    `<tg-row data-density="roomy"><span data-part="leading">${icon('token')}</span><span data-part="label" class="apply-query"><span class="strong">Tokens</span>` +
    `<label class="tg-field" data-variant="code"><input id="apply-tokens" type="text" data-controlled list="apply-paths" aria-label="A token's path or a group's" placeholder="space.sm, or a group" value="${escAttr(state.applyTokens ?? '')}" autocomplete="off" spellcheck="false"></label>` +
    `<datalist id="apply-paths">${pathsOf(state.tokenGraph)
      .map((path) => `<option value="${escAttr(path)}"></option>`)
      .join('')}</datalist>` +
    (said ? `<span class="faint">${said}</span>` : '') +
    `</span></tg-row>`;

  // One token takes a field picked from those its type reaches; a group needs none, so there is no control (R10's corollary).
  const fields = query.kind === 'token' ? query.fields : [];
  const field = fields.includes(state.applyField) ? state.applyField : '';
  const picker = fields.length
    ? row(
        icon('variable'),
        `<span class="strong">Field</span><select id="apply-field" class="tg-select" data-size="sm" data-controlled aria-label="The field to put the token on">` +
          `<option value=""${field ? '' : ' selected'}>by its last key</option>` +
          fields.map((name) => `<option value="${escAttr(name)}"${name === field ? ' selected' : ''}>${escHtml(name)}</option>`).join('') +
          `</select>`,
      )
    : '';

  const kindRow = row(
    icon('layer'),
    `<span class="apply-kinds">${KINDS.map(
      ([value, label]) =>
        `<label class="tg-checkbox"><input type="checkbox" id="apply-kind-${value}" data-controlled data-kind="${value}"${kinds.includes(value) ? ' checked' : ''}>${label}</label>`,
    ).join('')}</span>`,
  );

  // The context a written value takes is a choice made for the person, on screen before the command (R10).
  const words =
    (state.defaultMode
      ? `Where Figma cannot bind a field, the token's value is written as it is in <span data-text="code">${escHtml(state.defaultMode)}</span>, the declared defaults. `
      : '') +
    'Apply writes no stamp: a value it wrote reads as plain above, and on a component a file built, what it wrote reads as drift at the next build.';
  const notes = row(icon('info'), `<span class="faint apply-note">${words}</span>`);

  const canPlan = !busy && kinds.length > 0 && query.kind !== 'empty' && query.kind !== 'none';
  const canExecute = state.plan?.planType === 'apply' && !busy;
  const go = row(
    '',
    `<span class="strong">${ON_SCOPE[state.selectionScope] ?? ''}</span>`,
    `<button type="button" class="tg-button" data-action="plan-apply"${canPlan ? '' : ' disabled'}>Plan</button>` +
      `<button type="button" class="tg-button" data-variant="primary" data-action="execute-apply"${canExecute ? '' : ' disabled'}>Execute</button>`,
  );
  return card('Apply', tokens + picker + kindRow + notes + go, '', 'commands apply');
}

function conventionsCard(state) {
  const busy = state.status === 'running' || state.status === 'planning';
  const planType = state.plan?.planType;
  const pair = (target, planAction, execAction) => {
    const canExecute = planType === target && !busy;
    // Execute is always the primary button; whether it can be pressed is its state, not its look.
    return (
      `<button type="button" class="tg-button" data-action="${planAction}"${busy || !state.conventionsLoaded ? ' disabled' : ''}>Plan</button>` +
      `<button type="button" class="tg-button" data-variant="primary" data-action="${execAction}"${canExecute ? '' : ' disabled'}>Execute</button>`
    );
  };
  const conventions = state.conventionsLoaded
    ? row(
        icon('conventions'),
        `<span data-text="code">${escHtml(state.conventionsFileName ?? 'conventions')}</span><span class="faint">${countOf(state.conventionCount, 'pattern')}</span>`,
        `<button type="button" class="tg-button" data-size="sm" data-action="audit">Audit</button><button type="button" class="tg-button" data-size="sm" data-action="choose-conventions">Replace…</button>`,
      )
    : row(
        icon('conventions'),
        `<span class="muted" title="Conventions say which variable each layer property should be bound to">No conventions loaded</span>`,
        `<button type="button" class="tg-button" data-size="sm" data-action="choose-conventions">Load…</button>`,
      );
  const command = (label, planAction, executeAction, target) =>
    row('', `<span class="strong">${label}</span>`, pair(target, planAction, executeAction));
  return card(
    'Conventions',
    conventions +
      command('Bind what the patterns match', 'plan-bind', 'execute-bind', 'apply_bindings') +
      command('Scaffold missing variables, then bind', 'plan-scaffold', 'execute-scaffold', 'scaffold'),
    '',
    'commands',
  );
}

const foot = (state) => `<div class="sel-foot">${applyCard(state)}${conventionsCard(state)}</div>`;

class TgPaneApply extends TgElement {
  setup() {
    this.innerHTML = `<input type="file" id="conventions-file" accept="application/json,.json" hidden><div class="pane-body apply"></div>`;
    this.body = this.querySelector('.pane-body');
    const input = this.querySelector('#conventions-file');
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => {
          setState({ conventionsFileName: file.name, errorMessage: null });
          send({ type: 'LOAD_CONVENTIONS', payload: { json: typeof reader.result === 'string' ? reader.result : '' } });
        };
        reader.readAsText(file);
      }
      // Re-picking the same file after editing it must read it again.
      input.value = '';
    });

    // The segmented control chooses on a click or an arrow and says so; pressing the scope that is
    // already chosen is a choice it does not announce, and the pane has always read again then.
    this.on('tg-change', 'tg-segmented', (_control, event) => {
      setState({ selectionScope: event.detail.value });
      readSelection();
    });
    this.addEventListener(
      'click',
      (event) => {
        const button = event.target.closest?.('[data-scope]');
        if (button?.getAttribute('aria-checked') === 'true') readSelection();
      },
      true,
    );
    this.on('click', '[data-goto]', (link) => {
      const path = link.dataset.goto;
      const segments = path.split('.');
      segments.pop();
      setState({ activePanel: 'tokens', tokensTrail: segments.map((_, i) => segments.slice(0, i + 1).join('.')), inspectOpenPath: path });
    });
    this.on('click', '[data-bind-node]', (button) => {
      setState({
        status: 'planning',
        errorMessage: null,
        pendingBind: { nodeId: button.dataset.bindNode, property: button.dataset.bindProperty },
      });
      send({
        type: 'PLAN_APPLY_BINDINGS',
        payload: { query: '**', scope: getState().selectionScope, nodeId: button.dataset.bindNode, property: button.dataset.bindProperty },
      });
    });

    // Apply's settings are the state's, so the field picker follows the query as it is typed.
    this.on('input', '#apply-tokens', (field) => setState({ applyTokens: field.value }));
    this.on('change', '#apply-field', (select) => setState({ applyField: select.value }));
    this.on('change', '[data-kind]', () =>
      setState({ applyKinds: [...this.querySelectorAll('[data-kind]')].filter((box) => box.checked).map((box) => box.dataset.kind) }),
    );
    this.on('click', '[data-action="plan-apply"]', () => {
      const state = getState();
      const query = applyQuery(state);
      const field = query.kind === 'token' && query.fields.includes(state.applyField) ? state.applyField : undefined;
      setState({ status: 'planning', errorMessage: null, lastResult: null });
      send({
        type: 'PLAN_APPLY',
        payload: { tokens: query.path, ...(field ? { field } : {}), scope: state.selectionScope, kinds: state.applyKinds },
      });
    });

    this.on('click', '[data-action="choose-conventions"]', () => input.click());
    this.on('click', '[data-action="audit"]', () => send({ type: 'AUDIT_SELECTION', payload: { scope: getState().selectionScope } }));
    const plan = (type) => {
      setState({ status: 'planning', errorMessage: null, lastResult: null });
      send({ type, payload: { query: '**', scope: getState().selectionScope } });
    };
    const execute = (type) => {
      setState({ status: 'running', errorMessage: null });
      send({ type, payload: {} });
    };
    this.on('click', '[data-action="execute-apply"]', () => execute('EXECUTE_APPLY'));
    this.on('click', '[data-action="plan-bind"]', () => plan('PLAN_APPLY_BINDINGS'));
    this.on('click', '[data-action="execute-bind"]', () => execute('EXECUTE_APPLY_BINDINGS'));
    this.on('click', '[data-action="plan-scaffold"]', () => plan('PLAN_SCAFFOLD'));
    this.on('click', '[data-action="execute-scaffold"]', () => execute('EXECUTE_SCAFFOLD'));
  }

  update(state) {
    if (!state.documentLoaded) {
      this.patch('<p class="empty-line">Load a design system from Load to see what layers are bound to.</p>', this.body);
      return;
    }
    const read = state.selectionBindings;
    const scope = state.selectionScope;
    const nodes = read?.scope === scope ? read.nodes : [];

    if (nodes.length === 0) {
      const words = state.selectionReading
        ? 'Reading…'
        : scope === 'selection' || !read
          ? 'Select a layer to see what it is bound to.'
          : `Nothing on this ${scope === 'page' ? 'page' : 'file'} to read.`;
      this.patch(`<div class="selection-empty"><p class="muted">${words}</p>${scopeControl(scope)}</div>${foot(state)}`, this.body);
      return;
    }

    const model = tokenModel(state);
    const graphModes = state.tokenGraph?.modes ?? [];
    const rowsByNode = nodes.map(rowsOf);
    let bound = 0;
    let drifted = 0;
    let plain = 0;
    for (const field of rowsByNode.flat()) {
      if (!field.bound) plain += 1;
      else {
        bound += 1;
        const token = field.bound.tokenPath ? model.byPath.get(field.bound.tokenPath) : null;
        if (token?.dot === 'drifted') drifted += 1;
      }
    }

    const first = nodes[0];
    const builtFrom = nodes.length === 1 ? first.builtFrom : null;
    const title = nodes.length === 1 ? first.name : countOf(nodes.length + (read.more ?? 0), 'layer');
    const sub = builtFrom
      ? `${icon('template', 'sm')}built from <span data-text="code">${escHtml(builtFrom.fileName)}</span> · kept ${escHtml(formatDay(builtFrom.kept))} · ${countOf(nodes.length, 'layer')}`
      : `${countOf(nodes.length, 'layer')}${read.more ? `, and ${read.more} more not read` : ''}`;
    const follows = scope === 'selection' ? 'follows the selection' : `the whole ${scope}`;

    const head =
      `<header class="sel-head"><div class="sel-title">` +
      `<span class="tile">${icon(nodes.length === 1 && SET_KINDS.has(first.kind) ? 'set' : 'layer', 'lg')}</span>` +
      `<div class="titles"><h1 data-text="title">${escHtml(title)}</h1><span class="sub">${sub}</span></div>${scopeControl(scope)}</div>` +
      `<div class="counts">${chip(`${icon('variable', 'sm')}${bound} bound`, { size: 'sm' })}` +
      (drifted ? chip(`${dot('drifted')}${drifted} drifted`, { tone: 'warn', size: 'sm' }) : '') +
      (plain ? chip(`${plain} plain`, { size: 'sm' }) : '') +
      `<span class="looked">${state.selectionReading ? `${dot('busy')}reading…` : `read ${escHtml(formatClock(read.readAt))} · ${follows}`}</span></div></header>`;

    const body = nodes
      .map(
        (node, index) =>
          `<div class="band node-band" data-text="label">${icon(SET_KINDS.has(node.kind) ? 'set' : 'layer', 'sm')}${escHtml(node.name)} <span class="band-count">· ${escHtml(node.kind.toLowerCase().replace('_', ' '))}</span></div>` +
          (rowsByNode[index].length
            ? rowsByNode[index].map((field) => fieldRow(node, field, model, graphModes)).join('')
            : '<tg-row><span data-part="label" class="faint">No field a token reaches, and nothing the conventions name.</span></tg-row>'),
      )
      .join('');

    this.patch(`${head}<div class="props">${body}</div>${foot(state)}`, this.body);
  }
}

define('tg-pane-apply', TgPaneApply);
