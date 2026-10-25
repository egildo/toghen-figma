/**
 * The layers a token's variable is bound to, on the current page, and
 * selecting them.
 *
 * The current page only: under `documentAccess: dynamic-page` a whole-file scan
 * loads every page, and the screen says "on this page" rather than claiming a
 * number it did not read.
 */

import type { Command, Response } from '../../shared/protocol.js';
import { boundVariableIds } from '../utils/boundVariables.js';

type Payload<T extends Command['type']> = Extract<Command, { type: T }>['payload'];

export async function COUNT_BOUND_LAYERS(payload: Payload<'COUNT_BOUND_LAYERS'>): Promise<void> {
  const wanted = new Set(
    (await figma.variables.getLocalVariablesAsync())
      .filter((variable) => variable.name === payload.variableName)
      .map((variable) => variable.id),
  );
  const ids: string[] = [];
  if (wanted.size > 0) {
    const visit = (node: SceneNode) => {
      if (boundVariableIds(node).some((id) => wanted.has(id))) ids.push(node.id);
      if ('children' in node) for (const child of node.children) visit(child);
    };
    for (const node of figma.currentPage.children) visit(node);
  }
  postToUi({ type: 'BOUND_LAYERS', payload: { variableName: payload.variableName, ids, pageName: figma.currentPage.name } });
}

/** Selects the layers with these ids that are on the current page, and brings them into view. */
export async function SELECT_NODES(payload: Payload<'SELECT_NODES'>): Promise<void> {
  const nodes: SceneNode[] = [];
  for (const id of payload.ids) {
    const node = await figma.getNodeByIdAsync(id);
    if (node && 'visible' in node && onCurrentPage(node)) nodes.push(node as SceneNode);
  }
  figma.currentPage.selection = nodes;
  if (nodes.length > 0) figma.viewport.scrollAndZoomIntoView(nodes);
}

function onCurrentPage(node: BaseNode): boolean {
  let current: BaseNode | null = node;
  while (current && current.type !== 'PAGE') current = current.parent;
  return current?.id === figma.currentPage.id;
}

function postToUi(response: Response): void {
  figma.ui.postMessage(response);
}
