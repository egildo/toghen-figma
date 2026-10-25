import type { QueryScope } from '../../shared/protocol.js';
import { resolveScopeRoots } from '../utils/pageRoots.js';

function walkNodes(node: SceneNode, visitor: (node: SceneNode) => void): void {
  visitor(node);
  if ('children' in node) {
    for (const child of node.children) {
      walkNodes(child, visitor);
    }
  }
}

export function buildMatcher(expr: string): (name: string) => boolean {
  const trimmed = expr.trim();
  if (!trimmed || trimmed === '**') {
    return () => true;
  }

  // `*` is the only wildcard this engine defines, so every other regex
  // metacharacter is escaped to its literal self. `?` used to be left through:
  // a query for a node genuinely named `Card?` compiled to `Card?`, which makes
  // the `d` optional and quietly matched `Car` instead.
  const escaped = trimmed.replace(/[.+^${}()|[\]\\?]/g, '\\$&');
  const pattern = `^${escaped.replace(/\*/g, '[^/]*')}$`;
  const re = new RegExp(pattern);
  return (name: string) => re.test(name);
}

export class QueryEngine {
  async resolve(expr: string, scope: QueryScope): Promise<SceneNode[]> {
    const roots = await resolveScopeRoots(scope);
    const matcher = buildMatcher(expr);
    const results: SceneNode[] = [];

    for (const root of roots) {
      walkNodes(root, (node) => {
        if (matcher(node.name)) {
          results.push(node);
        }
      });
    }

    return results;
  }
}
