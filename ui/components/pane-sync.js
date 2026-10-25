/**
 * The Sync pane: the state of the design system in this file, and the commands
 * that act on the whole of it.
 *
 * It needs a document, so its tab is inert with nothing loaded, as Tokens' is
 * (R8). Reading down: what is loaded, what this Figma file holds of it, and
 * what can be done. Where the document came from is the Load pane's.
 */

import { TgElement, define } from './base.js';
import { card, chip, dot, icon, row } from '../markup.js';
import { countOf, escAttr, escHtml, formatClock, monogram } from '../format.js';
import { send } from '../commandBus.js';
import { getState, setState } from '../state.js';
import { openPopover } from './popover.js';
import { inspectIfShowing } from '../inspect.js';

/* ── What the file says about drift ───────────────────────────────────── */

/**
 * How many paths drifted, according to whichever check looked most recently.
 *
 * Two things can answer: a sync plan, and the Tokens pane. Taking the more
 * recent of the two, and naming it, is the guard against two regions of one
 * screen making different claims about the same file with neither saying when
 * it looked (R11). `null` means nothing here knows, which is not zero.
 */
export function driftKnownFrom(state) {
  const looks = [];
  const plan = state.plan;
  if (plan && (plan.planType === 'variable_sync' || plan.planType === 'style_sync')) {
    looks.push({ at: state.planAt ?? '', count: plan.summary?.drifted ?? 0, source: 'planned' });
  }
  if (state.inspection) {
    looks.push({ at: state.inspection.checkedAt, count: state.inspection.counts?.drifted ?? 0, source: 'inspected' });
  }
  if (looks.length === 0) return null;
  // ISO-8601 UTC strings compare correctly as strings.
  const latest = looks.reduce((newest, look) => (look.at > newest.at ? look : newest));
  return { count: latest.count, source: `${latest.source} ${formatClock(latest.at)}`.trim() };
}

/**
 * The worst state among the tokens a collection holds, from the last picture.
 * Drift outranks absence: a drifted value is someone's edit a sync would not
 * take, an absent one is work a sync will do.
 */
function collectionDot(state, name) {
  if (!state.inspection) return 'unread';
  let worst = 'none';
  for (const token of state.inspection.tokens) {
    if (!token.modes.some((mode) => mode.mode.startsWith(`${name} / `))) continue;
    if (token.state === 'drifted' || token.state === 'outdated') return 'drifted';
    if (token.state === 'absent') worst = 'absent';
  }
  return worst;
}

/**
 * What made a collection, said after its name: a modifier's, or a folded part axis's (smell #44). The base
 * collection is named after the document and says nothing more.
 */
export const collectionKind = (collection) => (collection.axis ? 'part axis' : collection.modifier ? 'modifier' : '');

/* ── The parts ────────────────────────────────────────────────────────── */

function identityCard(state) {
  const contexts = Object.values(state.modifiers ?? {}).reduce((sum, list) => sum + list.length, 0);
  const modifierCount = Object.keys(state.modifiers ?? {}).length;
  const chips = [
    chip(`${icon('token')}${countOf(state.tokenCount, 'token')}`),
    modifierCount ? chip(`${icon('mode')}${countOf(modifierCount, 'modifier')} · ${countOf(contexts, 'mode')}`) : '',
    state.styleCount ? chip(`${icon('style')}${countOf(state.styleCount, 'style')}`) : '',
    state.templates?.templates.length ? chip(`${icon('template')}${countOf(state.templates.templates.length, 'template')}`) : '',
  ].join('');
  return card(
    null,
    `${monogram(state.documentName, 'lg')}<div class="identity-text">` +
      `<div class="identity-head"><h1 data-text="heading">${escHtml(state.documentName)}</h1>` +
      `${state.documentVersion ? `<span data-text="code" class="muted">${escHtml(state.documentVersion)}</span>` : ''}` +
      `${state.loadedAt ? `<span class="faint push">loaded ${escHtml(formatClock(state.loadedAt))}</span>` : ''}</div>` +
      `${state.documentDescription ? `<p class="muted">${escHtml(state.documentDescription)}</p>` : ''}` +
      `<div class="chips">${chips}</div></div>`,
    '',
    'identity',
  );
}

function syncLine(state) {
  const sync = state.syncState;
  if (!sync) return '';
  if (!sync.hasRecord) return row(dot('none'), `<span><strong>Never synced</strong> in this file</span>`);

  // The stamps say what a sync wrote, not when: an event, never a claim that everything agrees (R11).
  const parts = ['<strong>Written by a sync</strong>'];
  if (sync.documentTokenCount !== null) parts.push(`${sync.coveredCount} of ${sync.documentTokenCount} recorded`);
  if (sync.partialCount) parts.push(`<strong>${sync.partialCount} partial</strong>`);
  const drift = driftKnownFrom(state);
  if (drift?.count) {
    parts.push(
      `<button type="button" class="tg-button warn" data-variant="link" data-action="open-drift" title="${escAttr(drift.source)}">${drift.count} drifted</button> <span class="faint">(${escHtml(drift.source)})</span>`,
    );
  } else if (drift) {
    // The one all-clear the pane gives, earned by something having just looked.
    parts.push(`no drift <span class="faint">(${escHtml(drift.source)})</span>`);
  }
  return row(dot(drift?.count ? 'drifted' : 'none'), `<span>${parts.join(' · ')}</span>`);
}

function collectionsTable(state) {
  const docCollections = state.docCollections;
  if (!docCollections) return '';
  const figma = state.figmaCollections;
  const line = (mark, name, modes, count, dotState, countAttrs = '') =>
    `<tr><td>${icon(mark, undefined, 'muted')}</td><td>${name}</td><td class="modes">${modes}</td><td class="num"${countAttrs}>${count}</td><td>${dot(dotState)}</td></tr>`;
  const rows = docCollections.map((collection) => {
    const held = figma?.find((candidate) => candidate.name === collection.name);
    const kind = collectionKind(collection);
    const name = `${escHtml(collection.name)}${kind ? ` <span class="faint">${kind}</span>` : ''}`;
    const modes = escHtml(collection.modes.join(' · '));
    if (figma && !held) {
      return line('collection', name, `${modes} <span class="err">not in Figma</span>`, `0 / ${collection.variableCount}`, 'absent');
    }
    const count = !held
      ? `${collection.variableCount}`
      : held.variableCount < collection.variableCount
        ? `${held.variableCount} / ${collection.variableCount}`
        : `${held.variableCount}`;
    return line(
      'collection',
      name,
      modes,
      count,
      held ? collectionDot(state, collection.name) : 'unread',
      held ? '' : ' title="What the document would build; Figma not read yet"',
    );
  });
  if (state.styleCount) {
    rows.push(line('style', 'styles', `${countOf(state.styleCount, 'style token')} · not compared`, `${state.styleCount}`, 'unread'));
  }
  return `<table class="tg-table collections"><tbody>${rows.join('')}</tbody></table>`;
}

function syncCard(state) {
  const busy = state.status === 'running' || state.status === 'planning';
  const planType = state.plan?.planType;
  // Execute is always the primary button; whether it can be pressed is its state, not its look.
  const pair = (target, planAction, execAction) => {
    const canExecute = planType === target && !busy;
    return (
      `<button type="button" class="tg-button" data-action="${planAction}"${busy ? ' disabled' : ''}>Plan</button>` +
      `<button type="button" class="tg-button" data-variant="primary" data-action="${execAction}"${canExecute ? '' : ' disabled'}>Execute</button>`
    );
  };
  // One context per modifier, each at its default and on screen before the export runs (R10);
  // a modifier with one context is no choice, so it has no control.
  const select = Object.entries(state.modifiers ?? {})
    .filter(([, contexts]) => contexts.length > 1)
    .map(
      ([modifier, contexts]) =>
        `<select id="export-${escAttr(modifier)}" class="tg-select" data-size="sm" aria-label="${escAttr(modifier)} to export" data-export-modifier="${escAttr(modifier)}" title="${escAttr(modifier)}">${contexts
          .map(
            (context) =>
              `<option value="${escAttr(context)}"${context === state.modifierDefaults?.[modifier] ? ' selected' : ''}>${escHtml(context)}</option>`,
          )
          .join('')}</select>`,
    )
    .join('');
  return card(
    'Sync',
    row(
      icon('variable'),
      '<span class="strong">Variables</span><span class="faint">a collection per modifier</span>',
      pair('variable_sync', 'plan-variables', 'execute-variables'),
    ) +
      row(
        icon('style'),
        '<span class="strong">Styles</span><span class="faint">text, effect, grid</span>',
        pair('style_sync', 'plan-styles', 'execute-styles'),
      ) +
      row(
        icon('export'),
        `<span class="strong">Export</span>${select}<label class="tg-checkbox"><input type="checkbox" id="export-extensions" checked>$extensions</label>`,
        `<button type="button" class="tg-button" data-action="export">Export</button>`,
      ),
    '',
    'commands',
  );
}

/* ── The element ──────────────────────────────────────────────────────── */

class TgPaneSync extends TgElement {
  setup() {
    this.innerHTML = `<div class="pane-body sync"></div>`;
    this.body = this.querySelector('.pane-body');

    const plan = (type) => {
      setState({ status: 'planning', errorMessage: null, lastResult: null });
      send({ type, payload: {} });
    };
    const execute = (type) => {
      setState({ status: 'running', errorMessage: null });
      send({ type, payload: {} });
    };
    this.on('click', '[data-action="plan-variables"]', () => plan('PLAN_VARIABLE_SYNC'));
    this.on('click', '[data-action="plan-styles"]', () => plan('PLAN_STYLE_SYNC'));
    this.on('click', '[data-action="execute-variables"]', () => execute('EXECUTE_VARIABLE_SYNC'));
    this.on('click', '[data-action="execute-styles"]', () => execute('EXECUTE_STYLE_SYNC'));
    this.on('click', '[data-action="export"]', () => {
      // A DTCG file holds one combination, so the context of each modifier is on screen and sent (R10).
      const contexts = Object.fromEntries(
        [...this.querySelectorAll('[data-export-modifier]')].map((el) => [el.dataset.exportModifier, el.value]),
      );
      const includeExtensions = !!this.querySelector('#export-extensions')?.checked;
      send({ type: 'EXPORT_DOCUMENT', payload: { includeExtensions, contexts } });
    });
    this.on('click', '[data-action="open-drift"]', (link) => {
      const drifted = (getState().inspection?.tokens ?? []).filter((token) => token.state === 'drifted' || token.state === 'outdated');
      if (drifted.length === 1) {
        openPopover(drifted[0].path, link);
        return;
      }
      setState({ activePanel: 'tokens', inspectOnlyDifferences: true });
      inspectIfShowing();
    });
  }

  update(state) {
    // The tab is inert with nothing loaded; this is only what a stray arrival would see.
    if (!state.documentLoaded) {
      this.patch(`<p class="empty-line">Load a design system first.</p>`, this.body);
      return;
    }
    const looked = state.collectionsAt ? `looked ${formatClock(state.collectionsAt)}` : 'not looked yet';
    this.patch(
      identityCard(state) + card('In this Figma file', syncLine(state) + collectionsTable(state), looked) + syncCard(state),
      this.body,
    );
  }
}

define('tg-pane-sync', TgPaneSync);
