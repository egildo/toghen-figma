import { send } from './commandBus.js';
import { getState, setState } from './state.js';

/**
 * Asks the main thread to look, unless it already is.
 *
 * Guarded because the picture is expensive, a full read of the file's
 * variables, and two overlapping looks would race to set `inspection`.
 */
export function inspect() {
  if (getState().inspecting) return;
  setState({ inspecting: true, errorMessage: null });
  send({ type: 'INSPECT_CORRESPONDENCE', payload: {} });
}

/**
 * Looks only if the Tokens pane is in front and has nothing to show, and asks
 * for the document's graph if the screen does not hold it.
 *
 * Called when the pane is opened, and when the file or the document moved
 * under the picture. Looking while the pane is hidden would pay for an answer
 * nobody asked for; the pane asks for itself when it is opened.
 */
export function inspectIfShowing() {
  const state = getState();
  if (state.activePanel !== 'tokens' || !state.documentLoaded) return;
  if (!state.tokenGraph) send({ type: 'GET_TOKEN_GRAPH', payload: {} });
  if (!state.inspection) inspect();
}
