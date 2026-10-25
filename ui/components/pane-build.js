/**
 * The Build pane: blueprints and component files kept in this Figma file, what
 * they need, the lock, and building from them.
 *
 * A row per kept file; one opens in place, inside its row (a disclosure: the
 * row's button opens it, and its commands live in the detail, outside that
 * button). Plan build sends the build plan to the result surface, where its
 * Execute waits (behind a checkbox when a step breaks instances); Build runs
 * it. Whether a built set still matches its file is not compared yet, so the
 * row says "not compared" rather than guessing.
 *
 * An open blueprint lists its needs, each "not looked" with the grey ring until
 * Look up asks the main thread (R16); the answer is a standing picture, dated,
 * drawn here and kept whatever runs elsewhere (R15). A blueprint is not built as
 * a whole yet, so its row has no Build at all (R10's corollary).
 *
 * Below the rows, the lock: one row per library, who wrote its entry (an event,
 * R11), Discover variables and Plan relink, whose rows go to the result surface
 * (R2); and Build's overrides map, in the table Load draws its map with.
 */

import { TgElement, define } from './base.js';
import { overridesTable } from './overrides-table.js';
import { callout, card, chip, dot, icon, row } from '../markup.js';
import { countOf, escAttr, escHtml, formatClock, formatDateTime, number } from '../format.js';
import { send } from '../commandBus.js';
import { getState, setState } from '../state.js';

const isBlueprint = (template) => /\.blueprint\.kdl$/.test(template.fileName);
const code = (words) => `<span data-text="code">${words}</span>`;

/** Who wrote a library's entry, as an event that happened (R11). */
const WRITTEN_BY = {
  discovery: 'found by discovery',
  build: 'written by a build',
  'command line': 'written by the command line',
  person: 'picked by a person',
};

/* ── A component file ─────────────────────────────────────────────────── */

/** A row's dot: absent when no set is built from it, grey when built but not compared. */
const fileDot = (template) =>
  template.problems.length
    ? 'absent'
    : !template.builtInto
      ? 'absent'
      : template.differs
        ? 'drifted'
        : template.differs === false
          ? 'none'
          : 'unread';

function fileStatus(template) {
  if (template.problems.length) return `<span class="err">does not read</span>`;
  if (!template.builtInto) return `<span class="err">not built yet</span>`;
  return `<span class="faint">built on ${escHtml(template.builtInto.page)} · not compared</span>`;
}

const keptLine = (template) =>
  `<tr><th scope="row">file</th><td>${code(escHtml(template.fileName))} <span class="faint">· ${number(template.characters)} chars · kept ${escHtml(formatDateTime(template.kept))}</span></td></tr>`;

const fileActions = (extra = '') =>
  `${extra}<button type="button" class="tg-button" data-size="sm" data-action="replace">Replace file…</button>` +
  `<button type="button" class="tg-button push" data-variant="quiet" data-size="sm" data-action="forget">Forget</button>`;

function fileDetail(template, busy) {
  const axes = template.axes.length
    ? template.axes.map((axis) => `${escHtml(axis.name)}: ${axis.values.map(escHtml).join(' · ')}`).join('&nbsp;&nbsp; ')
    : '<span class="faint">none</span>';
  const properties = template.properties.length
    ? template.properties.map((property) => `${escHtml(property.name)} ${escHtml(property.type)}`).join(' · ')
    : '<span class="faint">none</span>';
  const note = template.problems.length
    ? callout('err', `It no longer reads against the loaded design system.`, template.problems.map(escHtml).join('<br>'), '', true)
    : !template.builtInto
      ? callout('info', 'No set in this file is stamped as built from it. Build makes one on the current page.', '', '', true)
      : '';
  const held = busy || template.problems.length ? ' disabled' : '';
  return (
    `<div data-part="detail" class="tpl-detail">${note}<table class="tg-table edges" data-density="dense"><tbody>` +
    keptLine(template) +
    `<tr><th scope="row">axes</th><td>${code(axes)}</td></tr>` +
    `<tr><th scope="row">properties</th><td>${code(properties)}</td></tr>` +
    `<tr><th scope="row">tokens</th><td>${template.tokenGroups.length ? template.tokenGroups.map((group) => code(`{${escHtml(group)}}`)).join(' ') : '<span class="faint">no token group</span>'}</td></tr>` +
    `<tr><th scope="row">builds into</th><td>${template.builtInto ? `page <strong>${escHtml(template.builtInto.page)}</strong>` : 'the current page'}</td></tr>` +
    `</tbody></table><div class="actions">` +
    fileActions(
      `<button type="button" class="tg-button" data-size="sm" data-action="plan-build"${held}>Plan build</button>` +
        `<button type="button" class="tg-button" data-variant="primary" data-size="sm" data-action="build"${held}>Build</button>`,
    ) +
    `</div></div>`
  );
}

/* ── A blueprint ──────────────────────────────────────────────────────── */

/** The last look at a blueprint's needs, unless the file was kept again since: then nothing has looked at this one. */
function pictureOf(state, template) {
  const picture = state.needs?.[template.name];
  return picture && Date.parse(picture.lookedAt) >= Date.parse(template.kept) ? picture : null;
}

/** One need: its dot and its words. Unlooked, the grey ring and "not looked" (R16). */
const NOT_LOOKED = { dot: 'unread', words: '<span class="faint">not looked</span>' };

function tokensNeed(answer) {
  if (!answer) return NOT_LOOKED;
  const detail = answer.detail ? ` <span class="faint">· ${escHtml(answer.detail)}</span>` : '';
  if (answer.state === 'loaded') return { dot: 'none', words: `loaded${detail}` };
  if (answer.state === 'differs') return { dot: 'drifted', words: `<span class="warn">not what Load loaded</span>${detail}` };
  return { dot: 'absent', words: `<span class="err">not loaded</span>${detail}` };
}

function libraryNeed(answer) {
  if (!answer) return NOT_LOOKED;
  const readAs = answer.readAs ? ` <span class="faint">· read as ${escHtml(answer.readAs)}, as the overrides map says</span>` : '';
  return answer.state === 'in the lock'
    ? { dot: 'none', words: `in the lock <span class="faint">· ${WRITTEN_BY[answer.by] ?? ''}</span>${readAs}` }
    : { dot: 'absent', words: `<span class="err">not in the lock</span>${readAs}` };
}

function componentNeed(need, answer) {
  if (need.satisfied) return { dot: 'none', words: '<span class="faint">a component of this blueprint</span>' };
  if (!answer) return NOT_LOOKED;
  const detail = answer.detail ? ` <span class="faint">· ${escHtml(answer.detail)}</span>` : '';
  const from = answer.library ? ` <span class="faint">· from ${escHtml(answer.library)}</span>` : '';
  switch (answer.state) {
    case 'found':
      return { dot: 'none', words: `found${detail}` };
    case 'from a library':
      return { dot: 'none', words: `from library ${escHtml(answer.library)}` };
    case 'would swap':
      return { dot: 'drifted', words: `<span class="warn">would swap</span>${from}${detail}` };
    case 'by key':
      return { dot: 'unread', words: `by key${detail}` };
    case 'missing':
      return { dot: 'absent', words: `<span class="err">missing</span>${detail}` };
    default:
      return { dot: 'absent', words: `<span class="err">stops a build</span>${detail}` };
  }
}

/** A missing component's way in: with one layer selected, the library it comes from is named here and the pick written (R10). */
function pickControls(state, template, name) {
  if ((state.selection ?? []).length !== 1)
    return `<br><span class="faint">Place one from the assets panel and select it to use it here.</span>`;
  const id = `pick-${template.name}-${name}`.replace(/[^\w-]/g, '_');
  const library = template.needs.libraries[0] ?? '';
  return (
    `<span class="need-pick"><label class="tg-field"><input id="${escAttr(id)}" type="text" aria-label="The library it comes from" placeholder="Library name" value="${escAttr(library)}" autocomplete="off" spellcheck="false"></label>` +
    `<button type="button" class="tg-button" data-size="sm" data-action="pick" data-field="${escAttr(id)}">Use the selected instance</button></span>`
  );
}

/** The roll-up on the row: what the look found, with what nothing checked counted apart (R16). */
function blueprintStatus(template, picture) {
  if (template.problems.length) return { dot: 'absent', words: `<span class="err">does not read</span>` };
  const needs = template.needs ?? { libraries: [], components: [] };
  if (!picture) {
    const unlooked = needs.libraries.length + needs.components.filter((need) => !need.satisfied).length + (needs.tokens ? 1 : 0);
    return unlooked
      ? { dot: 'unread', words: `<span class="faint">${countOf(unlooked, 'need')} not looked</span>` }
      : { dot: 'none', words: '<span class="faint">needs nothing outside it</span>' };
  }
  const states = [
    picture.tokens && picture.tokens.state !== 'loaded' ? (picture.tokens.state === 'differs' ? 'differs' : 'missing') : null,
    ...picture.libraries.map((library) => (library.state === 'missing' ? 'missing' : null)),
    ...picture.components.map(
      (component) =>
        ({ missing: 'missing', problem: 'missing', 'would swap': 'would swap', 'by key': 'not checked' })[component.state] ?? null,
    ),
  ];
  const n = (word) => states.filter((state) => state === word).length;
  const parts = [
    n('missing') ? `<span class="err">${n('missing')} missing</span>` : '',
    n('differs') ? `<span class="warn">tokens differ</span>` : '',
    n('would swap') ? `<span class="warn">${n('would swap')} would swap</span>` : '',
    n('not checked') ? `<span class="faint">${n('not checked')} not checked</span>` : '',
  ].filter(Boolean);
  const dotState = n('missing') ? 'absent' : n('differs') || n('would swap') ? 'drifted' : n('not checked') ? 'unread' : 'none';
  return { dot: dotState, words: parts.length ? parts.join(' · ') : '<span class="faint">every need found</span>' };
}

function blueprintDetail(state, template) {
  const picture = pictureOf(state, template);
  const needs = template.needs ?? { libraries: [], components: [] };
  const looking = state.needsLooking === template.name;
  const line = (kind, name, need, extra = '') =>
    `<tr><th scope="row">${kind}</th><td>${dot(need.dot)} ${code(escHtml(name))} ${need.words}${extra}</td></tr>`;
  const tokens = needs.tokens ? line('tokens', needs.tokens.entries.join(', '), tokensNeed(picture?.tokens)) : '';
  const libraries = needs.libraries
    .map((name) => line('library', name, libraryNeed(picture?.libraries.find((library) => library.name === name))))
    .join('');
  const components = needs.components
    .map((need) => {
      const answer = picture?.components.find((component) => component.name === need.name);
      return line(
        'component',
        need.name,
        componentNeed(need, answer),
        answer?.state === 'missing' ? pickControls(state, template, need.name) : '',
      );
    })
    .join('');
  const none =
    tokens || libraries || components
      ? ''
      : `<tr><td colspan="2" class="faint">It names no tokens, libraries or components outside itself.</td></tr>`;
  const when = looking ? `${dot('busy')} looking…` : picture ? `looked ${escHtml(formatClock(picture.lookedAt))}` : 'not looked';
  const notes = (picture?.notes ?? [])
    .map((note) => callout('warn', 'Not everything could be looked at.', escHtml(note), '', true))
    .join('');
  const note = template.problems.length
    ? callout('err', `It no longer reads against the loaded design system.`, template.problems.map(escHtml).join('<br>'), '', true)
    : callout(
        'info',
        'A blueprint is not built as a whole yet.',
        'Build each of its components from its own file. Its needs are looked up here.',
        '',
        true,
      );
  return (
    `<div data-part="detail" class="tpl-detail">${note}<table class="tg-table edges" data-density="dense"><tbody>` +
    keptLine(template) +
    `<tr><th scope="row">builds into</th><td>page <strong>${escHtml(template.name)}</strong></td></tr>` +
    `</tbody></table>` +
    `<div class="needs-head"><span class="strong">Needs</span><span class="faint">${when}</span>` +
    `<button type="button" class="tg-button push" data-size="sm" data-action="look-up"${looking ? ' disabled' : ''}>${picture ? 'Look again' : 'Look up'}</button></div>` +
    `${notes}<table class="tg-table edges needs" data-density="dense"><tbody>${tokens}${libraries}${components}${none}</tbody></table>` +
    `<div class="actions">${fileActions()}</div></div>`
  );
}

/* ── The lock and the overrides map ───────────────────────────────────── */

function lockCard(state, busy) {
  const lock = state.lock;
  const held = busy ? ' disabled' : '';
  const actions = row(
    '',
    '',
    `<button type="button" class="tg-button" data-size="sm" data-action="discover"${held}>Discover variables</button>` +
      `<button type="button" class="tg-button" data-size="sm" data-action="plan-relink"${held}>Plan relink</button>`,
  );
  if (!lock) return card('Lock', `<p class="empty-line">Reading the lock…</p>`);
  const names = Object.keys(lock.libraries);
  const rows = names.length
    ? names
        .map((name) => {
          const library = lock.libraries[name];
          const counts = [
            countOf(Object.keys(library.components).length, 'component'),
            countOf(Object.keys(library.styles).length, 'style'),
            countOf(Object.keys(library.variables).length, 'variable'),
          ].join(' · ');
          const fileKey = library.fileKey ? ` · file ${code(escHtml(library.fileKey))}` : '';
          return row(
            icon('collection'),
            `<span><strong>${escHtml(name)}</strong> <span class="faint">${WRITTEN_BY[library.by] ?? ''}</span><br><span class="faint">${counts}${fileKey}</span></span>`,
            `<button type="button" class="tg-button" data-size="sm" data-variant="quiet" data-action="lock-forget" data-library="${escAttr(name)}">Forget</button>`,
          );
        })
        .join('')
    : row(
        icon('info'),
        `<span class="faint">No library yet. Discover finds variables; a missing component's need takes one from a selected instance.</span>`,
      );
  return card('Lock', rows + actions, countOf(names.length, 'library', 'libraries'));
}

function overridesCard(state) {
  const map = state.lock?.overrides ?? {};
  const entries = Object.entries(map);
  const table = entries.length
    ? overridesTable(
        entries.map(([from, to]) => ({ from, to })),
        { from: 'Name as written', to: 'Used instead' },
        { removable: true },
      )
    : '';
  const add =
    `<tg-row data-density="roomy" class="override-add"><span data-part="label">` +
    `<label class="tg-field" data-variant="code"><input id="ov-from" type="text" aria-label="Name as written" placeholder="Name as written" autocomplete="off" spellcheck="false"></label>` +
    `<label class="tg-field" data-variant="code"><input id="ov-to" type="text" aria-label="Used instead" placeholder='Name, or (key)"…"' autocomplete="off" spellcheck="false"></label></span>` +
    `<span data-part="trailing"><button type="button" class="tg-button" data-size="sm" data-action="override-add">Add</button></span></tg-row>`;
  return card('Overrides map', table + add, entries.length ? countOf(entries.length, 'entry', 'entries') : 'empty');
}

/* ── The pane ─────────────────────────────────────────────────────────── */

class TgPaneBuild extends TgElement {
  setup() {
    this.innerHTML = `<input type="file" id="template-file" accept=".kdl" hidden><div class="pane-body build"></div>`;
    this.body = this.querySelector('.pane-body');
    const input = this.querySelector('#template-file');
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) this.keep(file, this.replacing);
      this.replacing = undefined;
      input.value = '';
    });

    this.on('click', '[data-action="add"]', () => {
      this.replacing = undefined;
      input.click();
    });
    this.on('dragover', '[data-drop]', (zone, event) => {
      event.preventDefault();
      zone.setAttribute('data-over', '');
    });
    this.on('dragleave', '[data-drop]', (zone) => zone.removeAttribute('data-over'));
    this.on('drop', '[data-drop]', (zone, event) => {
      event.preventDefault();
      zone.removeAttribute('data-over');
      const file = event.dataTransfer?.files?.[0];
      if (file) this.keep(file);
    });
    // A row is a disclosure: its button toggles it, and the row says so.
    this.addEventListener('tg-toggle', (event) => {
      const name = event.target.closest?.('[data-template]')?.dataset.template;
      if (name !== undefined) setState({ templatesOpen: event.detail.expanded ? name : null });
    });
    const open = () => getState().templatesOpen;
    this.on('click', '[data-action="plan-build"]', () => {
      setState({ status: 'planning', errorMessage: null, pendingBuild: open() });
      send({ type: 'PLAN_BUILD', payload: { name: open() } });
    });
    this.on('click', '[data-action="build"]', () => {
      setState({ status: 'running', errorMessage: null });
      send({ type: 'EXECUTE_BUILD', payload: { name: open(), allowBreaking: false } });
    });
    this.on('click', '[data-action="replace"]', () => {
      this.replacing = open();
      input.click();
    });
    this.on('click', '[data-action="forget"]', () => send({ type: 'FORGET_TEMPLATE', payload: { name: open() } }));

    this.on('click', '[data-action="look-up"]', () => {
      setState({ needsLooking: open(), errorMessage: null });
      send({ type: 'LOOK_UP_NEEDS', payload: { name: open() } });
    });
    this.on('click', '[data-action="pick"]', (button) => {
      const library = this.querySelector(`#${CSS.escape(button.dataset.field)}`)?.value ?? '';
      setState({ errorMessage: null });
      send({ type: 'LOCK_PICK', payload: { library } });
    });
    this.on('click', '[data-action="discover"]', () => {
      setState({ status: 'planning', errorMessage: null });
      send({ type: 'DISCOVER_VARIABLES', payload: {} });
    });
    this.on('click', '[data-action="plan-relink"]', () => {
      setState({ status: 'planning', errorMessage: null });
      send({ type: 'PLAN_RELINK', payload: {} });
    });
    this.on('click', '[data-action="lock-forget"]', (button) =>
      send({ type: 'LOCK_FORGET', payload: { library: button.dataset.library } }),
    );

    const overrides = () => ({ ...(getState().lock?.overrides ?? {}) });
    this.on('click', '[data-action="override-add"]', () => {
      const from = this.querySelector('#ov-from');
      const to = this.querySelector('#ov-to');
      if (!from.value.trim() || !to.value.trim()) return;
      send({ type: 'SET_BUILD_OVERRIDES', payload: { overrides: { ...overrides(), [from.value.trim()]: to.value.trim() } } });
      from.value = '';
      to.value = '';
    });
    this.on('click', '[data-action="override-remove"]', (button) => {
      const map = overrides();
      delete map[button.dataset.key];
      send({ type: 'SET_BUILD_OVERRIDES', payload: { overrides: map } });
    });
  }

  keep(file, replaces) {
    const reader = new FileReader();
    reader.onload = () => {
      setState({ errorMessage: null });
      send({
        type: 'KEEP_TEMPLATE',
        payload: { fileName: file.name, text: typeof reader.result === 'string' ? reader.result : '', ...(replaces ? { replaces } : {}) },
      });
    };
    reader.readAsText(file);
  }

  update(state) {
    const payload = state.templates;
    const templates = payload?.templates ?? [];
    const add = `<button type="button" class="tg-dropzone push" data-size="sm" data-action="add" data-drop>${icon('plus', 'sm')}Add a .kdl file</button>`;
    const busy = state.status === 'running' || state.status === 'planning';
    const cards = `<div class="build-cards">${lockCard(state, busy)}${overridesCard(state)}</div>`;

    if (!payload) {
      this.patch(`<p class="empty-line">Reading what this file keeps…</p>`, this.body);
      return;
    }
    if (templates.length === 0) {
      this.patch(
        `<div class="build-empty" data-drop><p class="muted">No blueprints or component files kept in this file.</p>${add}` +
          `<p class="faint">A file kept here can be planned and built again without the command line.</p></div>` +
          cards,
        this.body,
      );
      return;
    }

    const blueprints = templates.filter(isBlueprint);
    const files = templates.filter((template) => !isBlueprint(template));
    const notBuilt = files.filter((template) => !template.builtInto).length;
    const unread = files.filter((template) => template.builtInto && template.differs === null).length;
    const head =
      `<header class="tpl-head"><div class="tpl-title"><h1 data-text="title">${countOf(templates.length, 'file')} kept in this file</h1>${add}</div>` +
      `<div class="counts">${files.length ? chip(`${icon('set', 'sm')}${countOf(files.length, 'component')}`, { size: 'sm' }) : ''}` +
      (blueprints.length ? chip(`${icon('template', 'sm')}${countOf(blueprints.length, 'blueprint')}`, { size: 'sm' }) : '') +
      (notBuilt ? chip(`${dot('absent')}${notBuilt} not built`, { tone: 'err', size: 'sm' }) : '') +
      (unread ? chip(`${dot('unread')}${unread} not compared`, { size: 'sm' }) : '') +
      `<span class="looked">looked ${escHtml(formatClock(payload.lookedAt))}</span></div></header>`;

    const rows = templates
      .map((template) => {
        const isOpen = state.templatesOpen === template.name;
        const blueprint = isBlueprint(template);
        const status = blueprint
          ? blueprintStatus(template, pictureOf(state, template))
          : { dot: fileDot(template), words: fileStatus(template) };
        const gutter = status.dot === 'absent' ? 'err' : status.dot === 'drifted' ? 'warn' : 'accent';
        const sub = blueprint
          ? `blueprint · ${countOf(template.members, 'member')}`
          : `${countOf(template.members, 'member')} · ${countOf(template.axes.length, 'axis', 'axes')}`;
        // The detail is always in the row: the element makes a row a disclosure only if it holds one, and closed it is hidden.
        return (
          `<tg-row class="tpl-row" data-density="roomy" data-template="${escAttr(template.name)}" aria-expanded="${isOpen}"${isOpen && gutter !== 'accent' ? ` data-tone="${gutter}"` : ''}>` +
          `<span data-part="leading">${icon(blueprint ? 'template' : 'set')}</span>` +
          `<span data-part="label"><span${isOpen ? ' class="strong"' : ''}>${escHtml(template.name)}</span>` +
          `<span class="faint">${sub}</span></span>` +
          `<span data-part="value">${status.words}</span><span data-part="trailing">${dot(status.dot)}</span>` +
          `${blueprint ? blueprintDetail(state, template) : fileDetail(template, busy)}</tg-row>`
        );
      })
      .join('');

    this.patch(`${head}<div class="tpl-rows" data-drop>${rows}</div>${cards}`, this.body);
  }
}

define('tg-pane-build', TgPaneBuild);
