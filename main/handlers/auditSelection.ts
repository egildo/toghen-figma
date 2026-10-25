import type { Command, QueryScope, Response } from '../../shared/protocol.js';
import { PropertyMapper } from '../engines/propertyMapper.js';
import { resolveScopeRoots } from '../utils/pageRoots.js';
import { getState } from '../runtimeState.js';

type AuditSelectionCommand = Extract<Command, { type: 'AUDIT_SELECTION' }>;

function postToUi(message: Response): void {
  figma.ui.postMessage(message);
}

function collectFromRoots(roots: readonly SceneNode[]): SceneNode[] {
  const out: SceneNode[] = [];

  const walk = (node: SceneNode): void => {
    out.push(node);
    if ('children' in node) {
      for (const child of node.children) {
        walk(child);
      }
    }
  };

  for (const root of roots) {
    walk(root);
  }

  return out;
}

async function resolveNodes(scope: QueryScope): Promise<SceneNode[]> {
  return collectFromRoots(await resolveScopeRoots(scope));
}

export async function AUDIT_SELECTION(payload: AuditSelectionCommand['payload']): Promise<void> {
  const state = getState();

  if (state.conventions.length === 0) {
    postToUi({
      type: 'ERROR',
      payload: {
        message: 'Load conventions before running audit.',
        code: 'INVALID_CONVENTIONS',
        commandType: 'AUDIT_SELECTION',
      },
    });
    return;
  }

  const mapper = new PropertyMapper(state.conventions);
  const nodes = await resolveNodes(payload.scope);
  const results = await Promise.all(nodes.map((node) => mapper.auditNode(node)));

  postToUi({
    type: 'AUDIT_RESULT',
    payload: {
      nodes: results,
    },
  });
}
