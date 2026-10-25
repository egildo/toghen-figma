import type { QueryScope } from '../../shared/protocol.js';

/**
 * Resolves a query scope to the set of top-level nodes to walk.
 *
 * ### Why this exists
 *
 * Two call sites each carried their own copy of this, and both called
 * `figma.loadPageAsync(page)` — a method the Plugin API has never had. The real
 * form is `PageNode.loadAsync()`. Under `documentAccess: "dynamic-page"` (which
 * this plugin's manifest declares) a page's `children` is not readable until it
 * has been loaded, so every `scope: 'file'` operation threw before reaching any
 * work. Five test files mocked the invented method, so the suite reported it as
 * working.
 *
 * Keeping one implementation means the next correction lands once.
 *
 * @param scope - `'selection'`, `'page'`, or `'file'`
 * @returns The root nodes for that scope
 */
/**
 * `findAllWithCriteria` over every page, page by page.
 *
 * Under `documentAccess: "dynamic-page"` the plugin may not call it on the
 * document unless `figma.loadAllPagesAsync()` ran first (measured 2026-10-08, the
 * first command-line run in a real file), and `use_figma` does not support
 * `loadAllPagesAsync()`. On a loaded page the call is allowed in both, so the
 * caller loads every page and this searches each.
 */
export function findInEveryPage<T extends NodeType[]>(criteria: FindAllCriteria<T>): Array<{ type: T[number] } & SceneNode> {
  const found: Array<{ type: T[number] } & SceneNode> = [];
  for (const page of figma.root.children) found.push(...page.findAllWithCriteria(criteria));
  return found;
}

export async function resolveScopeRoots(scope: QueryScope): Promise<readonly SceneNode[]> {
  switch (scope) {
    case 'selection':
      return figma.currentPage.selection;

    case 'page':
      return figma.currentPage.children;

    case 'file': {
      const roots: SceneNode[] = [];
      for (const page of figma.root.children) {
        // Required before reading `children` under dynamic-page access.
        // Already-loaded pages resolve immediately, so this is safe to repeat.
        await page.loadAsync();
        roots.push(...page.children);
      }
      return roots;
    }

    default:
      return figma.currentPage.selection;
  }
}
