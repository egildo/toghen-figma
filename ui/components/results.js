/**
 * The shared result surface: everything a command produces, from every pane,
 * rendered once (R2).
 *
 * Every plan type, the audit, and the component report go through one row
 * function, so a row reads the same whoever produced it (R14): a kind, what it
 * happened to, and why. A row that reports a problem carries a gutter and a
 * ground of its own and keeps its message whole (R4). The count chips are
 * filters, and when collapsed they stay in the bar while the source gives way
 * (R12: the counts end with the numbers worth reading).
 */

import { TgElement, define } from './base.js';
import { chip, icon } from '../markup.js';
import { countOf, escAttr, escHtml, formatClock } from '../format.js';
import { send } from '../commandBus.js';
import { getState, setState, toggleResults } from '../state.js';

export const MAX_ROWS = 200;

/** What each source is called in the header (R6). */
const SOURCE_NAMES = {
  variable_sync: 'variable sync',
  style_sync: 'style sync',
  scaffold: 'scaffold',
  apply_bindings: 'bindings',
  audit: 'audit',
  component: 'component run',
  load: 'load',
  discovery: 'discovery',
  relink: 'relink',
  apply: 'apply',
};

/* ── Rows ─────────────────────────────────────────────────────────────── */

/**
 * One row. `kind` is the word in the kind column; `filter` the chip it counts
 * under; `problem` is `warn` or `err` for a row that reports one, with
 * `message` as its second line.
 */
const row = (kind, path, detail = '', extra = {}) => ({ kind, path, detail, filter: extra.filter ?? kind.toLowerCase(), ...extra });

function operationRow(op) {
  switch (op.kind) {
    case 'CREATE_COLLECTION':
      return row('CREATE', op.name, `collection · ${op.modes.join(', ')}`);
    case 'ADD_MODE':
      return row('CREATE', `${op.collectionName} / ${op.modeName}`, 'mode');
    case 'DELETE_MODE':
      return row('BREAK', `${op.collectionName} / ${op.modeName}`, 'mode deleted', { filter: 'breaking', problem: 'err' });
    case 'DELETE_VARIABLE':
      return row('BREAK', `${op.collectionName} / ${op.variableName}`, 'variable deleted', { filter: 'breaking', problem: 'err' });
    case 'CREATE_VARIABLE':
      return row('CREATE', op.path, op.variableType.toLowerCase());
    case 'SET_VARIABLE_VALUE':
      return row('UPDATE', op.tokenPath, op.modeName);
    case 'RENAME_VARIABLE':
      return row('UPDATE', op.path, `renamed ${op.name}`);
    case 'SET_CODE_SYNTAX':
      return row('UPDATE', op.path, `code ${op.value}`);
    case 'SET_VARIABLE_SCOPES':
      return row('UPDATE', op.path, 'scopes');
    case 'RENAME_MODE':
      return row('UPDATE', op.name, 'mode renamed');
    case 'CREATE_STYLE':
      return row('CREATE', op.tokenPath, `${op.styleType.toLowerCase()} style`);
    case 'UPDATE_STYLE':
      return row('UPDATE', op.tokenPath, 'style');
    case 'STAMP':
      return row('UPDATE', op.path, 'stamp, moved');
    case 'BIND_VARIABLE':
      return row('UPDATE', `${op.nodeId} · ${op.property}`, 'bind');
    case 'UNBIND_VARIABLE':
      return row('UPDATE', `${op.nodeId} · ${op.property}`, 'unbind');
    case 'SET_VALUE':
      return row('UPDATE', `${op.nodeId} · ${op.property}`, 'value');
    case 'APPLY_TOKEN':
      // One layer's field: the token, bound or written as its value, and the line naming the context before Execute (R10, R14).
      return op.variableId
        ? row('UPDATE', `${op.nodeName} · ${op.field}`, `${op.path} · bound`, op.written ? { filter: 'written', message: op.written } : {})
        : row('UPDATE', `${op.nodeName} · ${op.field}`, `${op.path} · value in ${op.context ?? 'the defaults'}`, {
            filter: 'written',
            message: op.written,
          });
    case 'SKIP':
      // A drifted skip explains itself on its own row (R14), and it is a problem (R4).
      return op.reason === 'drifted'
        ? row('SKIP', op.path, 'drifted', { filter: 'drifted', problem: 'warn', message: op.message, quiet: false })
        : row('SKIP', op.path, op.reason, { quiet: op.reason === 'unchanged' });
    case 'WARNING':
      return row(op.stops ? 'FAIL' : 'WARN', op.path ?? '', '', {
        filter: 'warnings',
        problem: op.stops ? 'err' : 'warn',
        message: op.message,
      });
    case 'BREAKING':
      return row('BREAK', '', '', { filter: 'breaking', problem: 'err', message: op.message });
    case 'NOTE':
      return row('NOTE', '', '', { filter: 'notes', message: op.message });
    case 'SWAP_COMPONENT':
      // One row per instance a relink would swap, its from and to in the row (R14).
      return row('UPDATE', op.path, 'component swapped', { message: op.message });
    default:
      return row('NOTE', op.kind);
  }
}

/** A component run's step, as the printed script summarises it. */
function stepRow(step) {
  const where = [step.member, step.address].filter(Boolean).join(' › ');
  switch (step.kind) {
    case 'CREATE_SET':
      return row('CREATE', where || 'set', step.members !== undefined ? countOf(step.members, 'member') : 'set');
    case 'REFUSE_FOREIGN':
      return row('FAIL', where, '', { filter: 'breaking', problem: 'err', message: step.message });
    case 'ADD_PROPERTY':
      return row('CREATE', step.property ?? '', 'property');
    case 'EDIT_PROPERTY':
      return row('UPDATE', step.property ?? '', (step.changes ?? []).join(', '));
    case 'DELETE_PROPERTY':
      return step.breaks
        ? row('BREAK', step.property ?? '', 'property removed', { filter: 'breaking', problem: 'err', message: step.breaks })
        : row('UPDATE', step.property ?? '', 'property removed');
    case 'RENAME_AXIS':
      return row('UPDATE', `${step.from} → ${step.to}`, 'axis renamed · members and instances kept');
    case 'CREATE_MEMBER':
      return row('CREATE', where, 'new combination · appended');
    case 'DELETE_MEMBER':
      return row('BREAK', where, 'member removed', { filter: 'breaking', problem: 'err', message: step.breaks });
    case 'REMOVE_STRAY':
      return row('BREAK', where, 'member outside any set', { filter: 'breaking', problem: 'err', message: step.breaks });
    case 'CREATE_LAYER':
      return row('CREATE', where, 'layer');
    case 'REPLACE_LAYER':
      return row('BREAK', where, 'layer replaced', { filter: 'breaking', problem: 'err', message: step.breaks });
    case 'MOVE_LAYER':
      return row('UPDATE', where, 'moved');
    case 'PATCH_LAYER':
      return row('PATCH', where, 'fields the file declares');
    case 'SWAP_COMPONENT':
      // One row per instance swapped, its from and to in the row (R14).
      return row('UPDATE', where, 'component swapped', { message: step.message });
    case 'DELETE_LAYER':
      // A removal that strips the stamp from a person's copy says so in its own row (R14).
      return row('UPDATE', where, 'layer removed', { filter: 'delete', message: step.message });
    case 'RELAYOUT':
      return row('NOTE', 'members laid out again', '', { filter: 'notes' });
    default:
      return null;
  }
}

/** A component report's rows: the steps, then what was left alone, noticed, or counted as pending. */
function componentRows(result) {
  if (result.problems) {
    return result.problems.map((problem) => row('FAIL', '', '', { filter: 'breaking', problem: 'err', message: problem }));
  }
  const { report } = result;
  return [
    // A LEAVE step is reported as a note below, once (R14).
    ...report.steps
      .filter((step) => step.kind !== 'LEAVE')
      .map(stepRow)
      .filter(Boolean),
    ...report.notes.map((note) => row('NOTE', note, '', { filter: 'notes' })),
    ...report.warnings.map((warning) => row('WARN', '', '', { filter: 'warnings', problem: 'warn', message: warning })),
    ...report.pending.map((name) => row('NOTE', name, 'pending', { filter: 'notes' })),
  ];
}

/** One binding of one node, from an audit. */
function bindingRow(node, binding) {
  const path = `${node.nodeName} · ${binding.property}`;
  if (binding.status === 'ok') return row('BOUND', path, binding.variableName, { filter: 'bound', quiet: true });
  if (binding.status === 'unbound') return row('UNBOUND', path, binding.variableName, { filter: 'unbound', problem: 'warn' });
  return row('MISSING', path, `${binding.variableName} · no such variable`, { filter: 'missing', problem: 'err' });
}

/* ── What the surface shows ───────────────────────────────────────────── */

/** Whether a row counts under a chip. A drifted skip is a skip, and also its own count. */
const matches = (r, filter) => r.filter === filter || (filter === 'skip' && r.kind === 'SKIP');

/** The chip for one count; `null` hides a count that is zero and not worth saying. */
const count = (key, n, label, tone = 'plain', always = false) => (n || always ? { key, n, label, tone } : null);

/**
 * Everything the surface draws, from state: where it came from, the counts,
 * the rows, and the footer.
 */
export function resultView(state) {
  const named = SOURCE_NAMES[state.resultsSource] ?? state.resultsSource ?? '';
  const origin = state.resultsOrigin === 'command line' ? ', from the command line' : '';
  const time = state.resultsAt ? formatClock(state.resultsAt) : '';

  if (state.componentResult) {
    const result = state.componentResult;
    const rows = componentRows(result);
    const by = (filter) => rows.filter((r) => r.filter === filter).length;
    const breaking = by('breaking');
    const dryRun = !result.problems && result.report.dryRun;
    const execute = state.resultsExecute;
    return {
      source: result.problems ? result.headline : `${dryRun ? 'build plan' : 'build'} · ${result.name}${origin}`,
      time,
      note: result.problems ? 'nothing written' : dryRun ? 'nothing written' : 'written',
      chips: result.problems
        ? [count('breaking', breaking, 'problems', 'err', true)]
        : [
            count('patch', by('patch'), 'patch', 'plain', true),
            count('create', by('create'), 'create', 'ok', true),
            count('delete', by('delete'), 'delete', 'plain', true),
            count('breaking', breaking, 'breaking', 'err'),
            count('warnings', by('warnings'), 'warnings', 'warn'),
            count('notes', by('notes'), 'notes'),
          ],
      rows,
      breakingCheckbox: dryRun && breaking > 0 && !!execute,
      footer:
        dryRun && execute
          ? breaking && !state.allowBreaking
            ? { text: 'Execute is held by the breaking step.', tone: 'err', execute: { disabled: true } }
            : {
                text: breaking ? 'The breaking steps will be taken.' : '',
                execute: {
                  disabled: state.status === 'running',
                  command: { ...execute, payload: { ...execute.payload, allowBreaking: state.allowBreaking } },
                },
              }
          : null,
    };
  }

  if (state.lastResult) {
    const r = state.lastResult;
    const failed = (r.results ?? []).filter((result) => result.status === 'failed');
    return {
      source: `${named ? `${named}, ` : ''}done${origin}`,
      time,
      chips: [],
      rows: failed.map((result) => ({
        ...operationRow(result.operation),
        kind: 'FAIL',
        filter: 'failed',
        problem: 'err',
        message: result.reason ?? '',
      })),
      footer: {
        text: [
          `${r.applied} applied`,
          `${r.skipped} skipped`,
          `${r.failed} failed`,
          ...(r.cancelled ? [`${r.cancelled} cancelled`] : []),
        ].join(' · '),
        tone: r.failed ? 'err' : '',
      },
    };
  }

  if (state.plan) {
    // Counted from the rows, so a chip always says how many rows it shows.
    const rows = (state.plan.operations ?? []).map(operationRow);
    const by = (filter) => rows.filter((r) => matches(r, filter)).length;
    // A load's or a discovery's rows are what it found, not steps: no "plan" in the name, and no zero counts of writes it never makes.
    const steps = state.plan.planType !== 'load' && state.plan.planType !== 'discovery';
    return {
      source: `${named}${steps ? ' plan' : ''}${origin}`,
      time,
      chips: [
        count('create', by('create'), 'create', 'ok', steps),
        count('update', by('update'), 'update', 'plain', steps),
        count('written', by('written'), 'written as a value'),
        count('skip', by('skip'), 'skip'),
        count('drifted', by('drifted'), 'drifted', 'warn'),
        count('warnings', by('warnings'), 'warnings', 'warn'),
        count('breaking', by('breaking'), 'breaking', 'err'),
        count('notes', by('notes'), 'notes'),
      ],
      rows,
      footer: null,
    };
  }

  const nodes = state.auditResult?.nodes ?? [];
  if (state.auditResult) {
    const rows = [];
    for (const node of nodes) {
      const bindings = node.bindings ?? [];
      if (!bindings.length) rows.push(row('NOTE', node.nodeName, 'no convention matches', { filter: 'notes' }));
      for (const binding of bindings) rows.push(bindingRow(node, binding));
    }
    const by = (filter) => rows.filter((r) => r.filter === filter).length;
    return {
      source: `${named}${origin}`,
      time,
      chips: [
        count('bound', by('bound'), 'bound', 'plain', true),
        count('unbound', by('unbound'), 'unbound', 'warn'),
        count('missing', by('missing'), 'missing', 'err'),
        count('notes', by('notes'), 'no match'),
      ],
      rows,
      footer: nodes.length ? null : { text: 'Nothing in this scope to audit.' },
    };
  }

  return { source: '', time: '', chips: [], rows: [], footer: null };
}

/* ── Drawing ──────────────────────────────────────────────────────────── */

const KIND_TONE = {
  CREATE: 'ok',
  SKIP: 'skip',
  BREAK: 'err',
  FAIL: 'err',
  MISSING: 'err',
  WARN: 'warn',
  UNBOUND: 'warn',
  NOTE: 'quiet',
  BOUND: 'quiet',
};

function rowHtml(r) {
  const tone = r.kind === 'SKIP' && r.quiet ? 'quiet' : (KIND_TONE[r.kind] ?? '');
  const problem = r.problem ? ` problem problem-${r.problem}` : '';
  // The line is a dense row; the message, when there is one, sits under it on the same ground.
  return (
    `<div class="result-row${problem}${r.quiet && !r.problem ? ' quiet' : ''}">` +
    `<tg-row data-density="dense"${r.problem ? ` data-tone="${r.problem}"` : ''}><span data-part="leading" class="kind ${tone}">${escHtml(r.kind)}</span>` +
    // Paths keep their right end, the leaf: the cell is written right to left and ellipsised at its start (R12).
    (r.path ? `<span data-part="label" class="path" title="${escAttr(r.path)}"><bdi>${escHtml(r.path)}</bdi></span>` : '') +
    (r.detail ? `<span data-part="value" class="reason">${escHtml(r.detail)}</span>` : '') +
    `</tg-row>` +
    (r.message ? `<div class="message">${escHtml(r.message)}</div>` : '') +
    `</div>`
  );
}

class TgResults extends TgElement {
  setup() {
    this.innerHTML = `<div class="splitter" id="results-splitter" title="Drag to resize"><span></span></div><div class="surface"></div>`;
    this.surface = this.querySelector('.surface');

    this.on('click', '[data-action="toggle"]', (_bar, event) => {
      // A chip in the collapsed bar is a filter, not the bar.
      if (!event.target.closest('[data-filter]')) toggleResults();
    });
    // The bar is a button that is not a native one. A chip inside it is the design system's, and answers for itself.
    this.on('keydown', '.bar[role="button"]', (bar, event) => {
      if (event.target !== bar || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      bar.click();
    });
    this.on('click', '[data-filter]', (button) => {
      const key = button.dataset.filter;
      const state = getState();
      setState({ resultsFilter: state.resultsFilter === key ? null : key, resultsShowAll: false, resultsCollapsed: false });
    });
    this.on('click', '[data-action="show-all"]', () => setState({ resultsShowAll: true }));
    this.on('change', '#allow-breaking', (box) => setState({ allowBreaking: box.checked }));
    this.on('click', '[data-action="execute"]', () => {
      const view = resultView(getState());
      const command = view.footer?.execute?.command;
      if (!command) return;
      setState({ status: 'running', errorMessage: null });
      send(command);
    });
    this.on('click', '[data-action="cancel"]', () => {
      send({ type: 'CANCEL_OPERATION', payload: {} });
      setState({ status: 'idle' });
    });
  }

  update(state) {
    const view = resultView(state);
    const collapsed = state.resultsCollapsed;
    this.classList.toggle('is-collapsed', collapsed);
    this.classList.toggle('has-rows', view.rows.length > 0);

    const chips = view.chips.filter(Boolean).map((c) => {
      const pressed = state.resultsFilter === c.key;
      return chip(`<strong>${c.n}</strong> ${escHtml(c.label)}`, {
        tone: c.tone,
        size: 'sm',
        variant: 'code',
        attrs: `data-filter="${c.key}" aria-pressed="${pressed}" title="${pressed ? 'Show every row' : `Show only ${escAttr(c.label)}`}"`,
      });
    });

    const running = state.status === 'running';
    const progress = running
      ? `<div class="footer"><span class="progress">${state.progress.total ? `${state.progress.completed} of ${state.progress.total}` : 'running'}${state.progress.label ? ` · ${escHtml(state.progress.label)}` : ''}</span>` +
        `<button type="button" class="tg-button" data-size="sm" data-action="cancel">Cancel</button></div>`
      : '';

    const bar =
      `<header class="bar" data-action="toggle" role="button" aria-expanded="${!collapsed}">` +
      `${icon(collapsed ? 'chevronUp' : 'chevronDown', 'sm', 'muted')}<span class="title">Results</span>` +
      (view.source
        ? `<span class="source">${escHtml(view.source)}${view.time ? ` · ${escHtml(view.time)}` : ''}</span>`
        : `<span class="source none">nothing has run</span>`) +
      (collapsed ? `<span class="chips">${chips.join('')}</span>` : view.note ? `<span class="note">${escHtml(view.note)}</span>` : '') +
      `</header>`;

    if (collapsed) {
      this.patch(bar + progress, this.surface);
      return;
    }

    const filtered = state.resultsFilter ? view.rows.filter((r) => matches(r, state.resultsFilter)) : view.rows;
    const shown = state.resultsShowAll ? filtered : filtered.slice(0, MAX_ROWS);
    let rows = '';
    const lastBreaking = view.breakingCheckbox ? shown.map((r) => r.filter === 'breaking').lastIndexOf(true) : -1;
    shown.forEach((r, index) => {
      rows += rowHtml(r);
      if (index === lastBreaking) {
        rows += `<div class="allow-breaking"><label class="tg-checkbox"><input type="checkbox" id="allow-breaking" data-controlled${state.allowBreaking ? ' checked' : ''}>Allow breaking steps on this build</label></div>`;
      }
    });
    if (filtered.length > shown.length) {
      rows += `<button type="button" class="tg-button more" data-variant="quiet" data-size="sm" data-action="show-all">…and ${filtered.length - shown.length} more</button>`;
    }

    const footer = view.footer
      ? `<div class="footer">${view.footer.tone === 'err' && view.footer.execute ? `<span class="mark err">${icon('warning')}</span>` : ''}` +
        `<span class="${view.footer.tone === 'err' && !view.footer.execute ? 'err' : ''}">${escHtml(view.footer.text)}</span>` +
        (view.footer.execute
          ? `<button type="button" class="tg-button" data-variant="primary" data-action="execute"${view.footer.execute.disabled ? ' disabled' : ''}>Execute</button>`
          : '') +
        `</div>`
      : '';

    this.patch(
      bar +
        (chips.length ? `<div class="chips-row">${chips.join('')}<span class="hint">a count filters the rows</span></div>` : '') +
        `<div class="rows">${rows}</div>` +
        footer +
        progress,
      this.surface,
    );
  }
}

define('tg-results', TgResults);
