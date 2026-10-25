/**
 * The Tokens pane: the document as a browser of groups and tokens, and where
 * each token stands in this Figma file.
 *
 * A standing picture (R15): it says when it looked, offers to look again, and
 * never borrows the result surface. It describes and navigates; it changes
 * nothing in the file.
 *
 * Columns, Finder-style: the root lists the top groups, opening a group opens
 * its column to the right, a token opens its detail. When the columns do not
 * fit, the leftmost collapse into spines. In a narrow window the detail opens
 * in place, inside its row; in a wide one it is a panel to the right. Both are
 * decided from the pane's own width, so the window switch needs no message.
 *
 * A column is a `tg-list` (a listbox) and its rows are the options: choosing
 * one opens a group or shows a token (`tg-change`), and Enter, or a second
 * click, activates it (`tg-activate`): the same for a group, a toggle for a token.
 */

import { TgElement, define } from './base.js';
import { callout, chip, dot, icon } from '../markup.js';
import { countOf, escAttr, escHtml, formatClock } from '../format.js';
import { getState, setState } from '../state.js';
import { inspect } from '../inspect.js';
import { send } from '../commandBus.js';

const COLUMN = 200;
const SPINE = 22;
const PANEL = 300;
/** In place, the open token's column needs this much to show its detail. */
const OPEN_COLUMN = 300;

/** How much a dot outranks another, for a group's worst. Drift first: someone's edit. */
const RANK = { none: 0, unread: 1, upstream: 2, absent: 3, drifted: 4 };
const worse = (a, b) => (RANK[b] > RANK[a] ? b : a);

/** The states that want a person to look. `not_inspected` is an admission, not a fault. */
const ATTENTION = new Set(['drifted', 'outdated', 'absent', 'adopted', 'blocked']);

const STYLE_TYPES = new Set(['typography', 'shadow', 'gradient']);
const HEX = /^#[0-9a-f]{3,8}$/i;

/* ── The model: the graph and the picture, merged by path ─────────────── */

function dotOfReport(report) {
  if (!report) return 'unread';
  switch (report.state) {
    case 'current':
      return 'none';
    case 'drifted':
    case 'outdated':
      return 'drifted';
    case 'absent':
    case 'blocked':
      return 'absent';
    default:
      // `not_inspected`, and `adopted`: nothing Toghen wrote or compared.
      return 'unread';
  }
}

export function tokenModel(state) {
  const graph = state.tokenGraph;
  const reports = new Map((state.inspection?.tokens ?? []).map((report) => [report.path, report]));
  const byPath = new Map();
  for (const entry of graph?.tokens ?? []) byPath.set(entry.path, { path: entry.path, graph: entry, report: reports.get(entry.path) });
  for (const [path, report] of reports) if (!byPath.has(path)) byPath.set(path, { path, graph: null, report });

  const base = new Map();
  for (const token of byPath.values()) base.set(token.path, dotOfReport(token.report));

  // Upstream: it agrees, and something it points to, at any distance, has drifted.
  const upstream = new Map();
  const driftsUpstream = (path, seen = new Set()) => {
    if (upstream.has(path)) return upstream.get(path);
    if (seen.has(path)) return false;
    seen.add(path);
    const refs = byPath.get(path)?.graph?.references ?? [];
    const answer = refs.some((ref) => base.get(ref) === 'drifted' || driftsUpstream(ref, seen));
    upstream.set(path, answer);
    return answer;
  };
  for (const token of byPath.values()) {
    const own = base.get(token.path);
    token.dot = own === 'none' && driftsUpstream(token.path) ? 'upstream' : own;
    if (token.dot === 'upstream') {
      token.upstreamOf = (token.graph?.references ?? []).find((ref) => base.get(ref) === 'drifted' || upstream.get(ref));
    }
  }

  const counts = { total: byPath.size, drifted: 0, absent: 0, unread: 0 };
  for (const token of byPath.values()) {
    if (token.dot === 'drifted') counts.drifted += 1;
    else if (token.dot === 'absent') counts.absent += 1;
    else if (token.dot === 'unread') counts.unread += 1;
  }
  return { byPath, counts, defaultMode: graph?.modes?.[0] };
}

/** Groups the visible tokens into the tree their dotted paths already are. */
function buildTree(tokens) {
  const root = { key: '', name: '', children: new Map(), tokens: [], count: 0, unread: 0, worst: 'none' };
  for (const token of tokens) {
    const segments = token.path.split('.');
    const leaf = segments.pop();
    let node = root;
    let key = '';
    for (const segment of segments) {
      key = key ? `${key}.${segment}` : segment;
      let child = node.children.get(segment);
      if (!child) {
        child = { key, name: segment, parent: node, children: new Map(), tokens: [], count: 0, unread: 0, worst: 'none' };
        node.children.set(segment, child);
      }
      node = child;
    }
    node.tokens.push({ ...token, leaf });
  }
  const total = (node) => {
    for (const child of node.children.values()) {
      total(child);
      node.count += child.count;
      node.unread += child.unread;
      node.worst = worse(node.worst, child.worst);
    }
    for (const token of node.tokens) {
      node.count += 1;
      if (token.dot === 'unread') node.unread += 1;
      node.worst = worse(node.worst, token.dot);
    }
  };
  total(root);
  return root;
}

function nodeAt(root, key) {
  let node = root;
  for (const segment of key.split('.')) {
    node = node.children.get(segment);
    if (!node) return null;
  }
  return node;
}

/**
 * The open columns. What the person opened wins; until they do, it follows
 * what wants attention, one group at a time, as the old tree's default did.
 */
function trailOf(state, root) {
  const top = [...root.children.values()];
  if (top.length === 0) return [];
  const chosen = state.tokensTrail;
  if (chosen?.length) {
    const kept = [];
    for (const key of chosen) {
      if (!nodeAt(root, key)) break;
      kept.push(key);
    }
    // Past what was chosen, only a group that is alone in its parent opens.
    if (kept.length) return descend(nodeAt(root, kept[kept.length - 1]), kept, false);
  }
  return descend(top[0], [top[0].key], true);
}

/**
 * Opens further down from `node`: into a group that is the only thing in its
 * parent (what a search narrowed to one branch wants), and, when `attention`,
 * into the first group holding something that wants a look.
 */
function descend(node, trail, attention) {
  for (;;) {
    const children = [...node.children.values()];
    const only = children.length === 1 && node.tokens.length === 0 ? children[0] : null;
    const wanting =
      attention && !node.tokens.some((token) => RANK[token.dot] >= RANK.upstream)
        ? children.find((child) => RANK[child.worst] >= RANK.upstream)
        : null;
    const next = only ?? wanting;
    if (!next) return trail;
    trail = [...trail, next.key];
    node = next;
  }
}

/** The group keys from the root down to the group holding `path`. */
function ancestorsOf(path) {
  const segments = path.split('.');
  segments.pop();
  return segments.map((_, index) => segments.slice(0, index + 1).join('.'));
}

/* ── Drawing ──────────────────────────────────────────────────────────── */

const relative = (path) => path.slice(path.indexOf('.') + 1);

function swatchOrGlyph(token, value) {
  if (token.graph?.type === 'color' || token.report?.type === 'color') {
    return HEX.test(value ?? '')
      ? `<span class="tg-swatch" style="background-color:${value}"></span>`
      : '<span class="tg-swatch" data-variant="empty"></span>';
  }
  return icon(STYLE_TYPES.has(token.graph?.type ?? token.report?.type) ? 'style' : 'token', undefined, 'faint');
}

function defaultValue(token, model) {
  const value = token.graph?.valueByMode?.[model.defaultMode];
  if (value !== undefined && value !== null) return value;
  return token.report?.modes?.[0]?.documentValue ?? '';
}

/** What nothing has compared is counted apart, never folded into the quiet ones (R16). */
const unreadWords = (node) => (node.unread ? `${node.unread} not inspected` : '');

function groupRow(node, selected) {
  return (
    `<tg-row data-open-group="${escAttr(node.key)}"${selected ? ' aria-selected="true"' : ''}` +
    `${node.unread ? ` title="${countOf(node.count, 'token')} · ${unreadWords(node)}"` : ''}>` +
    `<span data-part="leading">${icon('group')}</span><span data-part="label"${selected ? ' class="strong"' : ''}>${escHtml(node.name)}</span>` +
    `<span data-part="value" data-text="small">${node.count}</span><span data-part="trailing">${dot(node.worst)}${icon('chevronRight', 'sm', 'faint')}</span></tg-row>`
  );
}

/** An option of a column. The open token is the selected one; `detail`, when there is one, is its in-place detail. */
function tokenRow(token, model, open, roomy, detail = '') {
  const value = defaultValue(token, model);
  const tone = token.dot === 'drifted' || token.dot === 'upstream' ? 'warn' : token.dot === 'absent' ? 'err' : 'accent';
  // A drifted or absent token says so in the gutter's colour while it is open.
  return (
    `<tg-row data-open-token="${escAttr(token.path)}"${open ? ' aria-selected="true"' : ''}${open && tone !== 'accent' ? ` data-tone="${tone}"` : ''}>` +
    `<span data-part="leading">${swatchOrGlyph(token, value)}</span><span data-part="label"${open ? ' class="strong"' : ''}>${escHtml(token.leaf)}</span>` +
    `<span data-part="value" data-text="code">${escHtml(value)}</span>` +
    `<span data-part="trailing">${roomy && token.dot === 'absent' && !open ? '<span class="state-word err">no variable yet</span>' : ''}${driftDot(token)}</span>` +
    `${detail}</tg-row>`
  );
}

/** A token's dot; a drifted or upstream one opens the drift popover. */
export function driftDot(token) {
  return token.dot === 'drifted' || token.dot === 'upstream'
    ? dot(token.dot, `data-path="${escAttr(token.path)}" tabindex="0" role="button" title="What drifted"`)
    : dot(token.dot);
}

/** The one-sentence callout for a token that is not simply current. */
function stateCallout(token) {
  const report = token.report;
  if (token.dot === 'none') return '';
  if (token.dot === 'upstream') {
    return callout(
      'warn',
      `Agrees; <span data-text="code">${escHtml(relative(token.upstreamOf ?? ''))}</span>, which it points to, does not.`,
      '',
      '',
      true,
    );
  }
  if (token.dot === 'unread') {
    const words = report?.note ?? (report ? 'Not compared yet.' : 'Not looked at yet: look again to compare it with Figma.');
    return callout('info', escHtml(words), '', '', true);
  }
  return callout(token.dot === 'absent' ? 'err' : 'warn', escHtml(report?.note ?? ''), '', '', true);
}

function modeTable(token, _model) {
  const isColor = (token.graph?.type ?? token.report?.type) === 'color';
  const cell = (value, tone = '') =>
    `<td${tone ? ` data-tone="${tone}"` : ''}>${isColor && HEX.test(value ?? '') ? `<span class="tg-swatch" data-size="sm" style="background-color:${value}"></span>` : ''}${escHtml(value ?? '—')}</td>`;
  let rows;
  if (token.report?.modes?.length) {
    rows = token.report.modes.map((mode) => {
      const state = mode.agrees === false ? 'drifted' : mode.present && mode.figmaValue === null ? 'absent' : 'none';
      return (
        `<tr><td class="muted">${escHtml(mode.mode.replace(' / ', '/'))}</td>${cell(mode.present ? mode.documentValue : 'no value')}` +
        `${cell(mode.figmaValue, mode.agrees === false ? 'warn' : '')}` +
        `<td>${dot(state)}</td></tr>`
      );
    });
  } else if (token.graph) {
    rows = Object.entries(token.graph.valueByMode).map(
      ([mode, value]) =>
        `<tr><td class="muted">${escHtml(mode)}</td>${cell(value)}<td class="faint">${token.report ? 'a style' : 'not looked'}</td><td></td></tr>`,
    );
  } else {
    return '';
  }
  return (
    `<table class="tg-table modes" data-density="dense"><thead><tr><th>mode</th><th>document</th><th>Figma</th><th></th></tr></thead>` +
    `<tbody>${rows.join('')}</tbody></table>`
  );
}

function edges(token, boundLayers) {
  const report = token.report;
  const graph = token.graph;
  const links = (paths) =>
    `<span class="links">${paths.map((path) => `<button type="button" class="tg-button" data-variant="link" data-text="code" data-goto="${escAttr(path)}">${escHtml(relative(path))}</button>`).join('')}</span>`;
  const rows = [];
  if (report?.variableName) {
    rows.push([
      'lives in',
      `<span class="inline">${icon('variable', 'sm')}<span data-text="code">${escHtml(report.variableName)}</span><span class="faint">${escHtml((graph?.type ?? report.type ?? '').toUpperCase())}</span></span>`,
    ]);
  } else if (token.dot === 'absent') {
    rows.push(['lives in', '<span class="err">no variable yet</span>']);
  }
  if (graph?.references?.length) rows.push(['points to', links(graph.references)]);
  if (graph?.referencedBy?.length) rows.push(['used by', links(graph.referencedBy)]);
  if (graph?.codeSyntax) rows.push(['code', `<span data-text="code">${escHtml(graph.codeSyntax)}</span>`]);
  const bound = report?.variableName ? boundLayers[report.variableName] : undefined;
  rows.push([
    'bound to',
    !report?.variableName
      ? '<span class="faint">no variable to be bound to</span>'
      : !bound
        ? '<span class="faint">counting…</span>'
        : `<span class="inline">${icon('layer', 'sm')}${countOf(bound.ids.length, 'layer')} on this page</span>`,
  ]);
  return `<table class="tg-table edges" data-density="dense"><tbody>${rows.map(([label, value]) => `<tr><th scope="row">${label}</th><td>${value}</td></tr>`).join('')}</tbody></table>`;
}

function actions(token, boundLayers) {
  const bound = token.report?.variableName ? boundLayers[token.report.variableName] : undefined;
  return (
    `<div class="actions">` +
    (bound?.ids.length
      ? `<button type="button" class="tg-button" data-size="sm" data-select-ids="${escAttr(JSON.stringify(bound.ids))}">Select bound layers</button>`
      : '') +
    `<button type="button" class="tg-button" data-size="sm" data-action="copy-path">Copy path</button>` +
    `<span class="faint push">revert needs a pin</span></div>`
  );
}

function statusChip(token) {
  if (token.dot === 'drifted') {
    const modes = (token.report?.modes ?? []).filter((mode) => mode.agrees === false).map((mode) => mode.mode.split(' / ').pop());
    return chip(`${dot('drifted')}drifted${modes.length ? ` in ${escHtml(modes.join(', '))}` : ''}`, { tone: 'warn', size: 'sm' });
  }
  if (token.dot === 'absent') return chip(`${dot('absent')}not in Figma`, { tone: 'err', size: 'sm' });
  if (token.dot === 'upstream') return chip(`${dot('upstream')}drift upstream`, { tone: 'warn', size: 'sm' });
  if (token.dot === 'unread') return chip(`${dot('unread')}not inspected`, { size: 'sm' });
  return '';
}

/** The detail of the open token's row, in the row, when the window is narrow. */
function detailInPlace(token, model, boundLayers) {
  return `<div data-part="detail" class="detail in-place">${stateCallout(token)}${modeTable(token, model)}${edges(token, boundLayers)}${actions(token, boundLayers)}</div>`;
}

function detailPanel(token, model, boundLayers) {
  if (!token) {
    return `<div class="detail panel empty"><p class="faint">Open a token to see where it stands, what it points to and what uses it.</p></div>`;
  }
  const value = defaultValue(token, model);
  const isColor = (token.graph?.type ?? token.report?.type) === 'color';
  return (
    `<div class="detail panel"><div class="panel-head">` +
    `${isColor && HEX.test(value) ? `<span class="tg-swatch" data-size="lg" style="background-color:${value}"></span>` : ''}` +
    `<h2 data-text="title">${escHtml(relative(token.path))}</h2>` +
    `${chip(`${icon('token', 'sm')}${escHtml((token.graph?.type ?? token.report?.type ?? '').toUpperCase())}`, { size: 'sm' })}` +
    `<span class="push">${statusChip(token)}</span></div>` +
    (token.report?.note && token.dot !== 'none'
      ? `<p class="note muted">${escHtml(token.report.note)}</p>`
      : token.dot === 'upstream'
        ? stateCallout(token)
        : '') +
    modeTable(token, model) +
    edges(token, boundLayers) +
    actions(token, boundLayers) +
    `</div>`
  );
}

function column(node, label, trail, index, model, open, inPlace, width, boundLayers) {
  const groups = [...node.children.values()];
  const next = trail[index + 1];
  let body = groups.map((child) => groupRow(child, child.key === next)).join('');
  for (const token of node.tokens) {
    const isOpen = token.path === open;
    body += tokenRow(token, model, isOpen, !width, isOpen && inPlace ? detailInPlace(token, model, boundLayers) : '');
  }
  return (
    `<div class="column" data-column="${index}" style="${width ? `width:${width}px` : 'flex:1'}">` +
    `<div class="band" data-text="label">${escHtml(label)} <span class="band-count">· ${countOf(node.count, 'token')}${node.unread ? ` · ${unreadWords(node)}` : ''}</span>${dot(node.worst)}</div>` +
    `<tg-list aria-label="${escAttr(label)}">${body}</tg-list></div>`
  );
}

/* ── The element ──────────────────────────────────────────────────────── */

class TgPaneTokens extends TgElement {
  setup() {
    this.width = 0;
    new ResizeObserver(() => {
      const width = Math.round(this.clientWidth);
      if (width !== this.width && this.state) {
        this.width = width;
        this.update(this.state);
      }
    }).observe(this);

    this.on('input', '#tokens-query', (field) => setState({ tokensQuery: field.value }));
    this.on('change', '#tokens-differences', (box) => setState({ inspectOnlyDifferences: box.checked }));
    this.on('click', '[data-action="look-again"]', () => inspect());

    // A column's rows are options: choosing one, or activating it (Enter, a second click), opens a group or a token.
    this.addEventListener('tg-change', (event) => this.choose(event.detail.item, false));
    this.addEventListener('tg-activate', (event) => this.choose(event.detail.item, true));
    this.on('click', '[data-spine]', (spine) => {
      const index = Number(spine.dataset.spine);
      const trail = this.trail.slice(0, index + 1);
      const open = getState().inspectOpenPath;
      setState({ tokensTrail: trail, inspectOpenPath: open && ancestorsOf(open).join() === trail.join() ? open : null });
    });
    this.on('click', '[data-goto]', (link) => this.goTo(link.dataset.goto));
    this.on('click', '[data-action="copy-path"]', () => copyText(relative(getState().inspectOpenPath ?? '')));
    this.on('click', '[data-select-ids]', (button) =>
      send({ type: 'SELECT_NODES', payload: { ids: JSON.parse(button.dataset.selectIds) } }),
    );
  }

  /**
   * An option was chosen (`activated` false) or activated. A group opens its
   * column either way. A token is shown when chosen; activated, it is toggled,
   * so Enter or a second click closes the open one.
   */
  choose(row, activated) {
    if (row.dataset.openGroup !== undefined) {
      // A row under "also in" opens a sibling of the last column, beside its parent.
      const index =
        row.dataset.alsoParent !== undefined ? Number(row.dataset.alsoParent) : Number(row.closest('[data-column]').dataset.column);
      const trail = this.trail.slice(0, index + 1).concat(row.dataset.openGroup);
      const open = getState().inspectOpenPath;
      setState({ tokensTrail: trail, inspectOpenPath: open && ancestorsOf(open).join() === trail.join() ? open : null });
    } else if (row.dataset.openToken !== undefined) {
      const index = Number(row.closest('[data-column]').dataset.column);
      const path = row.dataset.openToken;
      setState({
        tokensTrail: this.trail.slice(0, index + 1),
        inspectOpenPath: activated && getState().inspectOpenPath === path ? null : path,
      });
    }
  }

  /** Opens the browser on one token, wherever it is, clearing a filter that hides it. */
  goTo(path) {
    const shown = this.visible?.some((token) => token.path === path);
    setState({
      tokensTrail: ancestorsOf(path),
      inspectOpenPath: path,
      ...(shown ? {} : { tokensQuery: '', inspectOnlyDifferences: false }),
      activePanel: 'tokens',
    });
  }

  update(state) {
    if (!state.documentLoaded) {
      this.patch('<div class="pane-body"><p class="empty-line">Load a design system from Load to browse its tokens.</p></div>');
      return;
    }
    const width = this.width || Math.round(this.clientWidth) || 460;
    const model = tokenModel(state);
    const wide = width >= 2 * COLUMN + PANEL;

    // The header: find, filter, look again; then the counts and when it looked (R15).
    const looked = state.inspecting
      ? `${dot('busy')}<span>looking…</span>`
      : state.inspection
        ? `<span>looked ${escHtml(formatClock(state.inspection.checkedAt))}</span>`
        : '<span>not looked yet</span>';
    const counts =
      chip(`${icon('token', 'sm')}${model.counts.total}`, { size: 'sm' }) +
      (model.counts.drifted ? chip(`${dot('drifted')}${model.counts.drifted} drifted`, { tone: 'warn', size: 'sm' }) : '') +
      (model.counts.absent ? chip(`${dot('absent')}${model.counts.absent} absent`, { tone: 'err', size: 'sm' }) : '') +
      (model.counts.unread ? chip(`${dot('unread')}${model.counts.unread} not inspected`, { size: 'sm' }) : '');
    const controls =
      `<label class="tg-field find">${icon('search', undefined, 'faint')}<input id="tokens-query" type="search" aria-label="Find a token" placeholder="Find a token or a value" value="${escAttr(state.tokensQuery)}" autocomplete="off" spellcheck="false" data-controlled></label>` +
      `<label class="tg-checkbox" data-variant="boxed"><input type="checkbox" id="tokens-differences" data-controlled${state.inspectOnlyDifferences ? ' checked' : ''}>Differences</label>`;
    const lookAgain = `<button type="button" class="tg-button" data-shape="icon" data-action="look-again" title="Look again" aria-label="Look again"${state.inspecting ? ' disabled' : ''}>${icon('look-again')}</button>`;
    const head = wide
      ? `<header class="tokens-head wide">${controls}<span class="counts">${counts}</span><span class="looked">${looked}</span>${lookAgain}</header>`
      : `<header class="tokens-head"><div class="controls">${controls}${lookAgain}</div><div class="counts">${counts}<span class="looked">${looked}</span></div></header>`;

    // What is shown: the query and the Differences filter narrow the tokens first.
    const query = state.tokensQuery.trim().toLowerCase();
    let visible = [...model.byPath.values()];
    if (query)
      visible = visible.filter(
        (token) => token.path.toLowerCase().includes(query) || String(defaultValue(token, model)).toLowerCase().includes(query),
      );
    if (state.inspectOnlyDifferences) visible = visible.filter((token) => token.report && ATTENTION.has(token.report.state));
    this.visible = visible;

    if (!state.tokenGraph && !state.inspection) {
      this.trail = [];
      this.patch(`${head}<p class="empty-line">${state.inspecting ? 'Looking…' : 'Reading the document…'}</p>`);
      return;
    }
    if (visible.length === 0) {
      this.trail = [];
      const why = state.inspectOnlyDifferences
        ? state.inspection
          ? 'Nothing differs.'
          : 'Nothing has been compared yet. Look again to compare the document with Figma.'
        : 'No token matches.';
      this.patch(`${head}<p class="empty-line">${why}</p>`);
      return;
    }

    const root = buildTree(visible);
    const trail = trailOf(state, root);
    this.trail = trail;
    const nodes = trail.map((key) => nodeAt(root, key));
    const open = state.inspectOpenPath && ancestorsOf(state.inspectOpenPath).join() === trail.join() ? state.inspectOpenPath : null;
    const openToken = open ? (nodes[nodes.length - 1].tokens.find((token) => token.path === open) ?? null) : null;
    // The detail says how many layers on this page use the token's variable; asked once per variable.
    const variableName = openToken?.report?.variableName;
    if (variableName && state.boundLayers[variableName] === undefined) {
      // Asked after this draw: `null` marks it asked, so it is asked once until the counts are cleared.
      queueMicrotask(() => {
        if (getState().boundLayers[variableName] !== undefined) return;
        setState({ boundLayers: { ...getState().boundLayers, [variableName]: null } });
        send({ type: 'COUNT_BOUND_LAYERS', payload: { variableName } });
      });
    }

    // How many columns fit after the spines, counted from the right; the rest are spines.
    const n = nodes.length;
    const lastWidth = wide ? COLUMN : openToken ? OPEN_COLUMN : COLUMN;
    const room = width - (wide ? PANEL : 0);
    let spines = 0;
    while (spines < n - 1 && spines * SPINE + (n - spines - 1) * COLUMN + lastWidth > room) spines += 1;
    const overflow = spines * SPINE + (n - spines - 1) * COLUMN + lastWidth > room;

    // The first column is the document itself, under its own name.
    const label = (node, index) => (index === 0 && !node.key.includes('.') ? (state.documentName ?? node.name) : node.name);
    let strip = '';
    nodes.forEach((node, index) => {
      if (index < spines) {
        strip +=
          `<button type="button" class="spine" data-spine="${index}" title="${escAttr(label(node, index))}">` +
          `<span class="spine-label">${escHtml(label(node, index))} · ${node.count}</span>${dot(node.worst)}</button>`;
      } else {
        const last = index === n - 1;
        strip += column(node, label(node, index), trail, index, model, open, !wide, last && !wide ? 0 : COLUMN, state.boundLayers);
      }
    });

    // Narrow, when the parent's column has become a spine: the groups beside the open one.
    let also = '';
    const leaf = nodes[n - 1];
    if (!wide && n >= 2 && n - 2 < spines && leaf?.parent?.key) {
      const siblings = [...leaf.parent.children.values()].filter((child) => child !== leaf);
      if (siblings.length) {
        also =
          `<div class="also"><div class="band" data-text="label">also in ${escHtml(leaf.parent.name)}</div>` +
          `<tg-list aria-label="also in ${escAttr(leaf.parent.name)}">` +
          siblings
            .map((child) => groupRow(child, false).replace('data-open-group', `data-also-parent="${n - 2}" data-open-group`))
            .join('') +
          `</tg-list></div>`;
      }
    }

    this.patch(
      head +
        `<div class="browser${overflow ? ' overflow' : ''}"><div class="strip" style="${overflow ? `min-width:${spines * SPINE + (n - spines - 1) * COLUMN + lastWidth}px` : ''}">${strip}` +
        `${wide ? detailPanel(openToken, model, state.boundLayers) : ''}</div></div>` +
        also,
    );
  }
}

/**
 * Copies text. The plugin's iframe is not given the clipboard permission the
 * asynchronous API needs, so the old command is used.
 */
function copyText(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  try {
    document.execCommand('copy');
  } finally {
    area.remove();
  }
}

define('tg-pane-tokens', TgPaneTokens);
