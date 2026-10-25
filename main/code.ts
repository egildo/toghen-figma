import { setupDispatcher } from './dispatcher.js';
import { buildSelectionPayload } from './utils/buildPayloads.js';
import { DEFAULT_WINDOW_SIZE, loadWindowSizes } from './handlers/resizeUi.js';
import type { Response } from '../shared/protocol.js';

declare const __html__: string;

// Shown hidden, then sized, then revealed. `clientStorage` is async, so opening
// at the default and resizing afterwards would show the restored size arriving
// as a visible jump.
figma.showUI(__html__, {
  width: DEFAULT_WINDOW_SIZE.width,
  height: DEFAULT_WINDOW_SIZE.height,
  themeColors: true,
  visible: false,
});

setupDispatcher();

void loadWindowSizes().then((sizes) => {
  const size = sizes[sizes.mode];
  figma.ui.resize(size.width, size.height);
  figma.ui.show();
  // The status bar's switch says which way it goes. Figma holds a message posted
  // before the window's page has loaded until it has.
  postToUi({ type: 'WINDOW_MODE', payload: { mode: sizes.mode } });
});

figma.on('run', () => {
  postToUi({
    type: 'SELECTION_CHANGED',
    payload: buildSelectionPayload(figma.currentPage.selection),
  });
});

// Selection is reported, and nothing else happens. Discarding the plan here
// threw away a variable- or style-sync plan — which has no connection to the
// selection at all — because the user clicked something while reading it. The
// scaffold and apply-bindings plans do name specific nodes, but they name them
// by id, so a change of selection does not invalidate them either.
figma.on('selectionchange', () => {
  postToUi({
    type: 'SELECTION_CHANGED',
    payload: buildSelectionPayload(figma.currentPage.selection),
  });
});

function postToUi(response: Response): void {
  figma.ui.postMessage(response);
}
