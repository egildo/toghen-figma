import type { Response } from '../../shared/protocol.js';
import { buildSelectionPayload } from '../utils/buildPayloads.js';
import { indexFigmaCollections } from '../utils/figmaCollectionIndex.js';

/**
 * Answers with the current selection.
 *
 * The UI hears about selection *changes* as they happen, so this covers the one
 * case that event cannot: a panel opening and needing to know what is selected
 * now, rather than waiting for the user to click something else.
 */
export async function GET_SELECTION(): Promise<void> {
  const response: Response = {
    type: 'SELECTION_CHANGED',
    payload: buildSelectionPayload(figma.currentPage.selection),
  };
  figma.ui.postMessage(response);
}

/**
 * Answers with the file's variable collections and their modes.
 *
 * The System pane matches them by name against the collections the document
 * would build, and shows how many variables each holds beside how many the
 * document would put there.
 */
export async function GET_FIGMA_COLLECTIONS(): Promise<void> {
  const index = await indexFigmaCollections();
  const variableCount: Record<string, number> = {};
  for (const variable of Object.values(index.variableById)) {
    variableCount[variable.variableCollectionId] = (variableCount[variable.variableCollectionId] ?? 0) + 1;
  }
  const response: Response = {
    type: 'FIGMA_COLLECTIONS',
    payload: Object.keys(index.byId).map((id) => ({
      id,
      name: index.byId[id].name,
      modes: index.byId[id].modes,
      variableCount: variableCount[id] ?? 0,
    })),
  };
  figma.ui.postMessage(response);
}
