/**
 * The tab strip: choosing which pane is in front, and nothing else.
 *
 * The strip is the design system's `<tg-tabs>` (the tab list, its arrow keys, its
 * roving tabindex); this file only says which tabs there are and keeps them
 * true to the state. Five panes, and room for a sixth without a label
 * truncating at the minimum window width (R7): below 400px the icons step aside
 * and the words stay. With nothing loaded, Sync, Tokens and Apply have
 * nothing to show and are inert, `aria-disabled`, which the strip passes over.
 */

import { icon } from '../markup.js';
import { setState } from '../state.js';
import { inspectIfShowing } from '../inspect.js';
import { readSelection } from './pane-apply.js';
import { send } from '../commandBus.js';

const TABS = [
  { panel: 'load', label: 'Load', glyph: 'upload' },
  { panel: 'sync', label: 'Sync', glyph: 'collection', needsDocument: true },
  { panel: 'tokens', label: 'Tokens', glyph: 'token', needsDocument: true },
  { panel: 'apply', label: 'Apply', glyph: 'layer', needsDocument: true },
  { panel: 'build', label: 'Build', glyph: 'template' },
];

const strip = () => document.querySelector('tg-tabs');

/** Brings a pane forward, and reads what it shows: each pane reads when it is opened, not on load. */
function open(panel) {
  setState({ activePanel: panel });
  // What a pane shows is only true for the moment it was read, and the pane may never be opened.
  inspectIfShowing();
  if (panel === 'apply') readSelection();
  if (panel === 'build') {
    send({ type: 'GET_TEMPLATES', payload: {} });
    send({ type: 'GET_LOCK', payload: {} });
  }
}

/** Draws the tabs once, and listens. */
export function initTabs() {
  const tabs = strip();
  if (!tabs) return;
  tabs.innerHTML = TABS.map(
    (tab) =>
      `<button type="button" data-panel="${tab.panel}" data-value="${tab.panel}">${icon(tab.glyph)}<span>${tab.label}</span></button>`,
  ).join('');

  // The strip chooses a tab on a click or an arrow and says so with `tg-change`. Pressing the tab that is
  // already in front is a choice it does not announce, and the pane has always read again then, so that
  // click is caught on the way in, before the strip sees it.
  tabs.addEventListener(
    'click',
    (event) => {
      const tab = event.target.closest?.('[data-panel]');
      if (tab && tab.getAttribute('aria-selected') === 'true' && tab.getAttribute('aria-disabled') !== 'true') open(tab.dataset.panel);
    },
    true,
  );
  tabs.addEventListener('tg-change', (event) => open(event.detail.item.dataset.panel));
}

/** Marks the tab in front, and the tabs that have nothing to show yet. */
export function drawTabs(state) {
  for (const button of strip()?.querySelectorAll('[data-panel]') ?? []) {
    const tab = TABS.find((candidate) => candidate.panel === button.dataset.panel);
    const inert = tab.needsDocument && !state.documentLoaded;
    button.setAttribute('aria-selected', String(state.activePanel === tab.panel));
    if (inert) {
      button.setAttribute('aria-disabled', 'true');
      button.title = 'Load a design system first';
    } else {
      button.removeAttribute('aria-disabled');
      button.removeAttribute('title');
    }
  }
}
