/**
 * The status bar: the plugin's own condition, in one line.
 *
 * Left, whether it is busy or failed, and the error. Right, the two things
 * that are about the plugin itself rather than the design system: the command
 * line's connection, as an event with its time (R11), and the window switch.
 */

import { TgElement, define } from './base.js';
import { dot, icon } from '../markup.js';
import { escHtml, formatClock } from '../format.js';
import { send } from '../commandBus.js';

const WORDS = { idle: 'idle', ready: 'idle', complete: 'idle', planning: 'running', running: 'running', error: 'error' };

class TgStatusBar extends TgElement {
  setup() {
    this.setAttribute('role', 'status');
    this.on('click', '[data-action="window"]', (button) => {
      send({ type: 'RESIZE_UI', payload: { mode: button.dataset.mode } });
    });
  }

  update(state) {
    const word = WORDS[state.status] ?? state.status;
    const busy = word === 'running';
    const { phase, at } = state.commandLine;
    const wide = state.windowMode === 'wide';

    this.patch(
      `<span class="condition">${dot(busy ? 'busy' : word === 'error' ? 'error' : 'idle')}` +
        `<span>${word}</span></span>` +
        (state.errorMessage ? `<span class="error" title="${escHtml(state.errorMessage)}">${escHtml(state.errorMessage)}</span>` : '') +
        `<span class="right">` +
        (phase === 'paired'
          ? `<span class="command-line" title="Command line connected at ${escHtml(formatClock(at))}">${icon('command-line')}${dot('connected')}${escHtml(formatClock(at))}</span>`
          : '') +
        (state.windowMode
          ? `<button type="button" class="tg-button" data-shape="icon" data-variant="quiet" data-size="xs" data-action="window" data-mode="${wide ? 'narrow' : 'wide'}"` +
            ` title="${wide ? 'Narrow window' : 'Wide window'}" aria-label="${wide ? 'Narrow window' : 'Wide window'}">${icon(wide ? 'windowNarrow' : 'windowWide')}</button>`
          : '') +
        `</span>`,
    );
  }
}

define('tg-status-bar', TgStatusBar);
