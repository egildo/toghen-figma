import { drawTabs } from './components/tabs.js';

/**
 * Hands the state to every top-level element; each draws its own part.
 *
 * The elements are the shell's: the five panes, the result surface, the status
 * bar and the drift popover. The tab strip is the design system's `tg-tabs`, and
 * `drawTabs` keeps it true to the state. Which pane is in front is the
 * one thing decided here; a pane behind is not drawn until it comes forward.
 */

const PANES = {
  load: 'tg-pane-load',
  sync: 'tg-pane-sync',
  tokens: 'tg-pane-tokens',
  apply: 'tg-pane-apply',
  build: 'tg-pane-build',
};

const SHELL = ['tg-results', 'tg-status-bar', 'tg-popover'];

export function render(state) {
  drawTabs(state);
  for (const [panel, tag] of Object.entries(PANES)) {
    const pane = document.querySelector(tag);
    if (!pane) continue;
    pane.hidden = panel !== state.activePanel;
    if (!pane.hidden) pane.state = state;
  }
  for (const tag of SHELL) {
    const element = document.querySelector(tag);
    if (element) element.state = state;
  }
}
