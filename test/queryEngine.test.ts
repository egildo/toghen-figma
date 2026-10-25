import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { installFigma } from './support/partialApi.js';
import { QueryEngine, buildMatcher } from '../main/engines/queryEngine.js';

function node(id: string, name: string, children: SceneNode[] = []): SceneNode {
  return {
    id,
    name,
    type: 'FRAME',
    children,
  } as unknown as SceneNode;
}

function setupFigmaMock(): void {
  const selected = [node('s1', 'Button/Primary')];
  const pageNodes = [node('p1', 'Button/Primary'), node('p2', 'Button/Secondary'), node('p3', 'Card/Base')];

  installFigma({
    currentPage: {
      selection: selected,
      children: pageNodes,
    },
    root: {
      children: [
        { children: pageNodes, loadAsync: async () => {} },
        { children: [node('x1', 'Button/Tertiary')], loadAsync: async () => {} },
      ],
    },
  });
}

describe('QueryEngine', () => {
  beforeEach(() => {
    setupFigmaMock();
  });

  it('buildMatcher supports wildcard expressions', () => {
    const matcher = buildMatcher('Button/*');
    assert.equal(matcher('Button/Primary'), true);
    assert.equal(matcher('Button/Secondary'), true);
    assert.equal(matcher('Card/Base'), false);
  });

  it('treats every character but * as a literal', () => {
    // `*` is the only wildcard this engine defines. `?` used to reach the regex
    // unescaped, so a query for a node genuinely named `Card?` compiled to
    // `Card?` — which makes the `d` optional and matched `Car` instead.
    const matcher = buildMatcher('Card?');
    assert.equal(matcher('Card?'), true);
    assert.equal(matcher('Card'), false);
    assert.equal(matcher('Car'), false);

    assert.equal(buildMatcher('Button (v2)')('Button (v2)'), true);
    assert.equal(buildMatcher('a+b')('a+b'), true);
    assert.equal(buildMatcher('a+b')('aab'), false);
  });

  it('resolves nodes for selection scope', async () => {
    const engine = new QueryEngine();
    const results = await engine.resolve('Button/*', 'selection');
    assert.equal(results.length, 1);
    assert.equal(results[0].name, 'Button/Primary');
  });

  it('resolves nodes for file scope including all loaded pages', async () => {
    const engine = new QueryEngine();
    const results = await engine.resolve('Button/*', 'file');
    assert.equal(results.length, 3);
  });
});
