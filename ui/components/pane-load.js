/**
 * The Load pane: what the design system is made of, the files it reads and how
 * they combine.
 *
 * Two states, and they look different (R8). With nothing loaded there is one
 * way in: files or a folder, dropped or chosen, or a design system loaded
 * before; the command line's connection stays because it is how a document may
 * also arrive. With a document loaded the pane is a standing picture of the load
 * (R15): its form and entry, the files it read, the overrides map, and the
 * collections the document makes. How those collections stand in Figma is the
 * Sync pane's.
 *
 * Picking does not load. The files wait, with the entry the pane chose and, for
 * token files, the collection's name in a field, until Load is pressed: a
 * choice made for the person is on screen before the command runs (R10).
 */

import { TgElement, define } from './base.js';
import { callout, card, dot, icon, row } from '../markup.js';
import { countOf, escAttr, escHtml, formatClock, formatDay, monogram } from '../format.js';
import { send } from '../commandBus.js';
import { connectCommandLine, disconnectCommandLine } from '../bridge.js';
import { getState, setState } from '../state.js';
import { overridesTable } from './overrides-table.js';
import { collectionKind } from './pane-sync.js';

/** The pairing code the command line prints: eight letters and digits, shown as two fours. */
const CODE_LENGTH = 8;
const codeOf = (text) => text.toUpperCase().replace(/[^A-Z0-9]/g, '');

/* ── Which file is the entry ──────────────────────────────────────────── */

/** A resolver document: named `.resolver.json`, or JSON whose top level has a `resolutionOrder` list, as the core tells them apart. */
function isResolverDocument({ path, text }) {
  if (/\.resolver\.json$/i.test(path)) return true;
  try {
    return Array.isArray(JSON.parse(text)?.resolutionOrder);
  } catch {
    return false;
  }
}

/**
 * What a pick loads. The first resolver document among the files is the entry, and the rest are what its `$ref`s
 * may read. With none, every file is a token file, merged in the order given, the later winning. The collection's
 * name, which only token files use, starts as the folder's name, or the first file's name without its extensions.
 */
export function pickOf(files, folder) {
  const resolver = files.find(isResolverDocument);
  const first = files[0].path;
  const name = folder ? first.split('/')[0] : first.replace(/\..*$/, '') || first;
  if (resolver) return { files, folder, form: 'resolver', entry: resolver.path, name };
  return { files, folder, form: 'tokens', entry: files.length === 1 ? first : files.map((file) => file.path), name };
}

const asList = (entry) => (Array.isArray(entry) ? entry : [entry]);
const code = (text) => `<span data-text="code">${escHtml(text)}</span>`;

/* ── The parts ────────────────────────────────────────────────────────── */

function commandLineBlock(state) {
  const { phase, at } = state.commandLine;
  const time = at ? escHtml(formatClock(at)) : '';
  if (phase === 'off' || phase === 'refused') {
    return (
      row(
        icon('command-line'),
        phase === 'refused'
          ? `<span class="err">The command line did not accept that code (${time}). Type the one it printed.</span>`
          : '<span class="muted">The command line can load the document itself. Paste the code it printed.</span>',
      ) +
      `<tg-row data-density="roomy"><span data-part="label"><label class="tg-field" data-variant="code">` +
      `<input id="cl-code" type="text" aria-label="Pairing code" placeholder="Code from toghen-figma" autocomplete="off" spellcheck="false"></label></span>` +
      `<span data-part="trailing"><button type="button" class="tg-button" data-action="connect" disabled>Connect</button></span></tg-row>`
    );
  }
  const words = {
    connecting: 'Connecting to the command line…',
    paired: `Command line connected at ${time}`,
    lost: `Lost the command line at ${time}. Run it again; this keeps trying.`,
    unreachable: `Nothing answered on localhost:3055 (tried at ${time}). Run toghen-figma; this keeps trying.`,
  };
  return row(
    icon('command-line') + dot(phase === 'paired' ? 'connected' : 'busy'),
    `<span class="muted">${words[phase] ?? ''}</span>`,
    `<button type="button" class="tg-button" data-size="sm" data-action="disconnect">Disconnect</button>`,
  );
}

function sourceCard(state) {
  const file = state.documentLoaded
    ? row(
        icon('template'),
        state.fileName ? code(state.fileName) : '<span class="faint">no file name was given</span>',
        `<button type="button" class="tg-button" data-size="sm" data-action="choose">Replace…</button>`,
      )
    : '';
  return card('Source', file + commandLineBlock(state));
}

/** The files picked and not loaded yet: the entry the pane chose, the name, the overrides map, and Load beside them (R3, R10). */
function pickCard(state) {
  const pick = state.loadPick;
  if (!pick) return '';
  const entries = asList(pick.entry);
  const rule =
    pick.form === 'resolver'
      ? `<span><strong>A resolver document</strong> is the entry; the other files are there for its references.</span>`
      : entries.length > 1
        ? `<span><strong>${entries.length} token files</strong>, one collection, merged in this order: a later file wins.</span>`
        : `<span><strong>A token file</strong>, one collection.</span>`;
  const files = pick.files
    .map((file) => {
      const place = entries.indexOf(file.path);
      const mark =
        pick.form === 'resolver' ? (place === 0 ? '<span class="faint">entry</span>' : '') : `<span class="faint">${place + 1}</span>`;
      return row(icon(place === -1 ? 'template' : pick.form === 'resolver' ? 'collection' : 'token'), code(file.path), mark);
    })
    .join('');
  const name =
    pick.form === 'tokens'
      ? `<tg-row data-density="roomy"><span data-part="leading">${icon('collection')}</span><span data-part="label"><span class="strong">Collection</span>` +
        `<label class="tg-field" data-variant="code"><input id="load-name" type="text" data-controlled aria-label="Collection name" value="${escAttr(pick.name)}" autocomplete="off" spellcheck="false"></label></span></tg-row>`
      : '';
  const map = state.loadOverrides;
  const overrides = row(
    icon('sheet'),
    `<span class="strong">Overrides map</span>${map ? `${code(map.fileName)}<span class="faint">${countOf(Object.keys(map.map).length, 'entry', 'entries')}</span>` : '<span class="faint">none: every reference reads the file it names</span>'}`,
    map
      ? `<button type="button" class="tg-button" data-size="sm" data-variant="quiet" data-action="drop-overrides">Remove</button>`
      : `<button type="button" class="tg-button" data-size="sm" data-action="choose-overrides">Choose…</button>`,
  );
  const ready = pick.form === 'resolver' || pick.name.trim() !== '';
  const go = row(
    '',
    `<span class="faint">${countOf(pick.files.length, 'file')} picked${pick.folder ? ` from ${escHtml(pick.files[0].path.split('/')[0])}` : ''}</span>`,
    `<button type="button" class="tg-button" data-variant="quiet" data-action="clear-pick">Clear</button>` +
      `<button type="button" class="tg-button" data-variant="primary" data-action="load"${ready ? '' : ' disabled'}>Load</button>`,
  );
  return card('To load', row(icon('info'), rule) + files + name + overrides + go, '', 'pick');
}

function emptyState(state) {
  const sync = state.syncState;
  const names = sync?.recordNames ?? [];
  const record = sync?.hasRecord
    ? callout(
        'info',
        names.length ? `This file holds a record from ${escHtml(names.join(' and '))}` : 'This file holds a sync record',
        `${countOf(sync.recordedCount, 'variable or style', 'variables and styles')} stamped by a sync. Load it again to compare.`,
        `<button type="button" class="tg-button" data-size="sm" data-action="choose">Load it</button>`,
      )
    : '';

  const recents = state.recents ?? [];
  const recentRows = recents
    .map((entry) => {
      const shape = entry.modifiers?.length ? entry.modifiers.join(', ') : countOf(entry.modes?.length ?? 0, 'mode');
      const own = names.includes(entry.key) || names.includes(entry.name);
      // The line is the row's summary button and loads; Forget is in the row's trailing part, beside that button, not inside it, so neither hides the other from a screen reader.
      return (
        `<tg-row data-density="roomy" data-recent title="${escAttr([entry.description, entry.fileName].filter(Boolean).join('\n'))}">` +
        `<button type="button" data-part="summary" data-action="load-recent" data-key="${escAttr(entry.key)}">` +
        `<span data-part="leading">${monogram(entry.name)}</span>` +
        `<span data-part="label"><span class="recent-name"><strong>${escHtml(entry.name)}</strong>` +
        `${entry.version ? `<span data-text="code" class="muted">${escHtml(entry.version)}</span>` : ''}</span>` +
        `<span class="meta">${countOf(entry.tokenCount, 'token')} · ${escHtml(shape)}</span></span>` +
        `<span data-part="value" class="faint">${own ? "this file's record" : escHtml(formatDay(entry.loadedAt))}</span></button>` +
        `<span data-part="trailing"><button type="button" class="tg-button forget" data-shape="icon" data-variant="quiet" data-size="xs" data-action="forget" data-key="${escAttr(entry.key)}" aria-label="Forget ${escAttr(entry.name)}" title="Forget">${icon('close', 'sm')}</button></span>` +
        `</tg-row>`
      );
    })
    .join('');

  return (
    card(
      null,
      `<span class="placeholder">${icon('collection', 'xl')}</span>` +
        `<div class="identity-text"><h1 data-text="title">No design system in view</h1><p class="muted">Load a resolver document, token files or a folder, or pick one you loaded before.</p></div>`,
      '',
      'identity empty',
    ) +
    record +
    `<button type="button" class="tg-dropzone" data-drop data-action="choose">${icon('upload', 'lg', 'muted')}<span class="strong">Drop a resolver document or token files here</span>` +
    `<span data-text="code" class="faint">*.resolver.json · *.tokens.json</span><span class="tg-button push" data-size="sm">Choose…</span></button>` +
    `<div class="pick-folder"><button type="button" class="tg-button" data-size="sm" data-variant="quiet" data-action="choose-folder">${icon('group')}Choose a folder…</button></div>` +
    pickCard(state) +
    (recentRows ? card('Loaded before', recentRows) : '') +
    `<div class="push-down">${sourceCard(state)}</div>`
  );
}

/** The overrides map as the load used it: every reference it sent elsewhere, then every key that matched nothing. */
function overridesRows(composition) {
  const seen = new Set();
  const used = composition.reads
    .filter((read) => read.overridden)
    .filter((read) => !seen.has(`${read.ref}\n${read.location}`) && seen.add(`${read.ref}\n${read.location}`))
    .map((read) => ({ from: read.ref, to: read.location }));
  const unused = (composition.overrides?.unused ?? []).map((key) => ({
    from: key,
    to: composition.overrides.map[key] ?? '',
    unused: true,
  }));
  return [...used, ...unused];
}

function loadedState(state) {
  const composition = state.composition;
  const entries = composition ? asList(composition.entry) : [];
  const form =
    composition?.form === 'tokens'
      ? row(
          icon('token'),
          `<span><strong>${entries.length > 1 ? `${entries.length} token files` : 'A token file'}</strong> as one collection, ${code(state.documentName)}</span>`,
        )
      : row(icon('collection'), `<span><strong>A resolver document</strong>, ${code(entries[0] ?? state.fileName ?? '')}</span>`);
  const bundle = composition?.fromBundle
    ? row(
        icon('info'),
        '<span class="muted">Loaded from its stored bundle: no file was read again. The files below are those the load that stored it read.</span>',
      )
    : '';
  const when = composition?.fromBundle ? 'from the bundle' : state.loadedAt ? `loaded ${formatClock(state.loadedAt)}` : '';

  // Each file once: the entry, or the token files in order, then whatever the references read.
  const locations = [...new Set([...entries, ...(composition?.reads ?? []).map((read) => read.location)])];
  const overridden = new Set((composition?.reads ?? []).filter((read) => read.overridden).map((read) => read.location));
  const files = locations
    .map((location) => {
      const place = entries.indexOf(location);
      const note =
        place === -1
          ? overridden.has(location)
            ? 'by the overrides map'
            : ''
          : composition.form === 'tokens' && entries.length > 1
            ? `${place + 1}`
            : 'entry';
      return row(icon('template'), code(location), note ? `<span class="faint">${note}</span>` : '');
    })
    .join('');

  const mapRows = composition ? overridesRows(composition) : [];
  const map = mapRows.length
    ? card(
        'Overrides map',
        overridesTable(mapRows, { from: 'Ref as written', to: 'File read' }),
        countOf(mapRows.length, 'entry', 'entries'),
      )
    : '';

  const collections = state.docCollections
    ? card(
        'Collections it makes',
        `<table class="tg-table collections"><tbody>${state.docCollections
          .map((collection) => {
            const kind = collectionKind(collection);
            return `<tr><td>${icon('collection', undefined, 'muted')}</td><td>${escHtml(collection.name)}${kind ? ` <span class="faint">${kind}</span>` : ''}</td><td class="modes">${escHtml(collection.modes.join(' · '))}</td></tr>`;
          })
          .join('')}</tbody></table>`,
        'compared with Figma in Sync',
      )
    : '';

  return (
    pickCard(state) +
    card('Composition', form + bundle, when) +
    (files ? card('Files read', files, countOf(locations.length, 'file')) : '') +
    map +
    collections +
    `<div class="push-down">${sourceCard(state)}</div>`
  );
}

/* ── The element ──────────────────────────────────────────────────────── */

class TgPaneLoad extends TgElement {
  setup() {
    // The file inputs outlive every redraw. A folder pick gives each file its path inside the folder, so a resolver
    // document's `$ref`s to sibling folders resolve.
    this.innerHTML =
      `<input type="file" id="load-files" accept="application/json,.json" multiple hidden>` +
      `<input type="file" id="load-folder" webkitdirectory hidden>` +
      `<input type="file" id="load-overrides" accept="application/json,.json" hidden>` +
      `<div class="pane-body load"></div>`;
    this.body = this.querySelector('.pane-body');
    const filesInput = this.querySelector('#load-files');
    const folderInput = this.querySelector('#load-folder');
    const overridesInput = this.querySelector('#load-overrides');

    // A file input fires `change` only when the selection changes, so picking the same path again after editing the
    // file would be silently a no-op. Clearing the value makes the next pick a change again; the File is already held.
    filesInput.addEventListener('change', () => {
      this.read([...(filesInput.files ?? [])], false);
      filesInput.value = '';
    });
    folderInput.addEventListener('change', () => {
      this.read([...(folderInput.files ?? [])], true);
      folderInput.value = '';
    });
    overridesInput.addEventListener('change', () => {
      const file = overridesInput.files?.[0];
      if (file) this.readOverrides(file);
      overridesInput.value = '';
    });

    this.on('click', '[data-action="choose"]', (_el, event) => {
      event.preventDefault();
      filesInput.click();
    });
    this.on('click', '[data-action="choose-folder"]', () => folderInput.click());
    this.on('click', '[data-action="choose-overrides"]', () => overridesInput.click());
    this.on('click', '[data-action="drop-overrides"]', () => setState({ loadOverrides: null }));
    this.on('click', '[data-action="clear-pick"]', () => setState({ loadPick: null, loadOverrides: null }));
    this.on('input', '#load-name', (field) => {
      const pick = getState().loadPick;
      if (pick) setState({ loadPick: { ...pick, name: field.value } });
    });
    this.on('click', '[data-action="load"]', () => this.load());
    this.on('keydown', '#load-name', (_field, event) => {
      if (event.key === 'Enter') this.load();
    });

    this.on('dragover', '[data-drop]', (zone, event) => {
      event.preventDefault();
      zone.setAttribute('data-over', '');
    });
    this.on('dragleave', '[data-drop]', (zone) => zone.removeAttribute('data-over'));
    this.on('drop', '[data-drop]', (zone, event) => {
      event.preventDefault();
      zone.removeAttribute('data-over');
      this.read([...(event.dataTransfer?.files ?? [])], false);
    });

    this.on('click', '[data-action="load-recent"]', (row) => {
      setState({ status: 'idle', errorMessage: null });
      send({ type: 'LOAD_RECENT', payload: { key: row.dataset.key } });
    });
    this.on('click', '[data-action="forget"]', (button) => send({ type: 'FORGET_RECENT', payload: { key: button.dataset.key } }));

    const connect = () => {
      const typed = this.querySelector('#cl-code')?.value ?? '';
      if (codeOf(typed).length === CODE_LENGTH) connectCommandLine(typed.trim());
    };
    this.on('input', '#cl-code', (field) => {
      const button = this.querySelector('[data-action="connect"]');
      if (button) button.disabled = codeOf(field.value).length !== CODE_LENGTH;
    });
    this.on('keydown', '#cl-code', (_field, event) => {
      if (event.key === 'Enter') connect();
    });
    this.on('click', '[data-action="connect"]', connect);
    this.on('click', '[data-action="disconnect"]', () => disconnectCommandLine());
  }

  /** Reads what was picked and holds it for Load. Only `.json` files are kept: a folder may hold anything. */
  async read(picked, folder) {
    const json = picked.filter((file) => /\.json$/i.test(file.name));
    if (json.length === 0) {
      if (picked.length)
        setState({
          status: 'error',
          errorMessage: folder ? 'That folder holds no .json file.' : 'Pick .json files: a resolver document, or token files.',
        });
      return;
    }
    const files = await Promise.all(
      json.map(async (file) => ({ path: (folder && file.webkitRelativePath) || file.name, text: await file.text() })),
    );
    // A folder's order is the browser's, so its files go by path; a flat pick keeps the order it was given.
    if (folder) files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    setState({ loadPick: pickOf(files, folder), status: 'idle', errorMessage: null });
  }

  /** An overrides map: one JSON object, a `$ref` as written to the location to read instead. */
  async readOverrides(file) {
    let map;
    try {
      map = JSON.parse(await file.text());
    } catch {
      map = null;
    }
    const valid =
      map !== null && typeof map === 'object' && !Array.isArray(map) && Object.values(map).every((value) => typeof value === 'string');
    if (!valid) {
      setState({
        status: 'error',
        errorMessage: `${file.name} is not an overrides map: it must be one JSON object, each key a $ref as written and each value the file to read instead.`,
      });
      return;
    }
    setState({ loadOverrides: { fileName: file.name, map }, status: 'idle', errorMessage: null });
  }

  load() {
    const { loadPick: pick, loadOverrides: map } = getState();
    if (!pick || (pick.form === 'tokens' && pick.name.trim() === '')) return;
    setState({ status: 'idle', errorMessage: null });
    send({
      type: 'LOAD_DOCUMENT',
      payload: {
        files: pick.files,
        entry: pick.entry,
        // Token files always carry a name: a flat pick has no folder for the core to take one from. A resolver document has its own.
        ...(pick.form === 'tokens' ? { name: pick.name.trim() } : {}),
        ...(map ? { overrides: map.map } : {}),
      },
    });
  }

  update(state) {
    this.patch(state.documentLoaded ? loadedState(state) : emptyState(state), this.body);
    // The Connect button's state belongs to the field, which the redraw kept.
    const field = this.querySelector('#cl-code');
    const button = this.querySelector('[data-action="connect"]');
    if (field && button) button.disabled = codeOf(field.value).length !== CODE_LENGTH;
  }
}

define('tg-pane-load', TgPaneLoad);
