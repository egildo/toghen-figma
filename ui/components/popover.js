/**
 * The drift popover: one token's drift, where its dot was clicked.
 *
 * It opens on a drifted or upstream dot anywhere (a dot that carries
 * `data-path`), says in which modes Figma differs and why that is drift and not
 * a change in the document, and offers at most three actions: open the token in
 * the Tokens pane, select the layers bound to it on this page, and, disabled
 * until the pin model exists, put the document's value back. It closes on
 * Escape, on a click outside it, and when the pane in front changes.
 */

import { TgElement, define } from './base.js';
import { dot, icon } from '../markup.js';
import { countOf, escAttr, escHtml } from '../format.js';
import { send } from '../commandBus.js';
import { getState, setState } from '../state.js';
import { inspectIfShowing } from '../inspect.js';
import { tokenModel } from './pane-tokens.js';

const WIDTH = 316;
const HEX = /^#[0-9a-f]{3,8}$/i;
const relative = (path) => path.slice(path.indexOf('.') + 1);
const ancestorsOf = (path) => {
  const segments = path.split('.');
  segments.pop();
  return segments.map((_, index) => segments.slice(0, index + 1).join('.'));
};

/** Opens the popover on a token, beside the element that asked. */
export function openPopover(path, anchor) {
  const rect = anchor.getBoundingClientRect();
  const state = getState();
  setState({ popover: { path, x: rect.left, y: rect.bottom, panel: state.activePanel } });
  const report = state.inspection?.tokens.find((token) => token.path === path);
  if (report?.variableName && state.boundLayers[report.variableName] === undefined) {
    setState({ boundLayers: { ...state.boundLayers, [report.variableName]: null } });
    send({ type: 'COUNT_BOUND_LAYERS', payload: { variableName: report.variableName } });
  }
}

const close = () => {
  if (getState().popover) setState({ popover: null });
};

class TgPopover extends TgElement {
  setup() {
    this.setAttribute('role', 'dialog');
    document.addEventListener(
      'click',
      (event) => {
        const asking = event.target?.closest?.('tg-dot[data-path]');
        if (asking) {
          event.stopPropagation();
          openPopover(asking.dataset.path, asking);
          return;
        }
        if (!this.contains(event.target)) close();
      },
      true,
    );
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
      const asking = event.target?.closest?.('tg-dot[data-path]');
      if (asking && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        openPopover(asking.dataset.path, asking);
      }
    });

    this.on('click', '[data-action="close"]', close);
    this.on('click', '[data-action="open-in-tokens"]', () => {
      const path = getState().popover.path;
      setState({ popover: null, activePanel: 'tokens', tokensTrail: ancestorsOf(path), inspectOpenPath: path });
      inspectIfShowing();
    });
    this.on('click', '[data-action="select-layers"]', (button) => {
      send({ type: 'SELECT_NODES', payload: { ids: JSON.parse(button.dataset.ids) } });
      close();
    });
  }

  update(state) {
    const popover = state.popover;
    // A pane change closes it: it answers a dot that is no longer on screen.
    if (popover && popover.panel !== state.activePanel) {
      queueMicrotask(close);
    }
    this.hidden = !popover;
    if (!popover) {
      this.patch('');
      return;
    }

    const model = tokenModel(state);
    const token = model.byPath.get(popover.path);
    if (!token) {
      this.patch('');
      return;
    }
    const report = token.report;
    const upstream = token.dot === 'upstream';
    const drifted = (report?.modes ?? []).filter((mode) => mode.agrees === false);
    const title = upstream
      ? 'Drift upstream'
      : `Drifted in ${drifted.map((mode) => escHtml(mode.mode.split(' / ').pop())).join(', ') || 'Figma'}`;

    const isColor = (token.graph?.type ?? report?.type) === 'color';
    const cell = (value, tone = '') =>
      `<td${tone ? ` data-tone="${tone}"` : ''}>${isColor && HEX.test(value ?? '') ? `<span class="tg-swatch" data-size="sm" style="background-color:${value}"></span>` : ''}${escHtml(value ?? '—')}</td>`;
    const table = report?.modes?.length
      ? `<table class="tg-table modes" data-density="dense"><thead><tr><th>mode</th><th>document</th><th>Figma</th></tr></thead><tbody>${report.modes
          .map(
            (mode) =>
              `<tr><td class="muted">${escHtml(mode.mode.replace(' / ', '/'))}</td>${cell(mode.documentValue)}${cell(mode.figmaValue, mode.agrees === false ? 'warn' : '')}</tr>`,
          )
          .join('')}</tbody></table>`
      : '';

    const why = upstream
      ? `Agrees; <span data-text="code">${escHtml(relative(token.upstreamOf ?? ''))}</span>, which it points to, does not.`
      : escHtml(report?.note ?? '');

    const bound = report?.variableName ? state.boundLayers[report.variableName] : undefined;
    const select = !report?.variableName
      ? ''
      : !bound
        ? `<button type="button" class="tg-button" data-size="sm" disabled>Counting layers…</button>`
        : bound.ids.length
          ? `<button type="button" class="tg-button" data-size="sm" data-action="select-layers" data-ids="${escAttr(JSON.stringify(bound.ids))}">Select the ${countOf(bound.ids.length, 'layer')}</button>`
          : `<span class="faint">no layer on this page uses it</span>`;

    const left = Math.max(8, Math.min(popover.x - 40, window.innerWidth - WIDTH - 8));
    const top = Math.min(popover.y + 6, window.innerHeight - 220);
    this.style.left = `${left}px`;
    this.style.top = `${Math.max(8, top)}px`;
    this.setAttribute('aria-label', `${title}: ${relative(token.path)}`);

    this.patch(
      `<div class="pop-head">${dot(upstream ? 'upstream' : 'drifted')}<span class="strong">${title}</span>` +
        `<span data-text="code" class="muted path">${escHtml(relative(token.path))}</span>` +
        `<button type="button" class="tg-button push" data-shape="icon" data-variant="quiet" data-size="xs" data-action="close" aria-label="Close">${icon('close', 'sm')}</button></div>` +
        table +
        `<p class="why muted">${why}</p>` +
        `<div class="actions"><button type="button" class="tg-button" data-size="sm" data-action="open-in-tokens">Open in Tokens</button>${select}` +
        `<button type="button" class="tg-button" data-size="sm" disabled title="Needs a pin: the stamp holds hashes, not the values to put back">Put the document's value back</button></div>`,
    );
  }
}

define('tg-popover', TgPopover);
