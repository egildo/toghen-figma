/**
 * The document as a graph, for the Tokens pane: values per mode, what each
 * token points to and what points to it, in the structured shapes the format
 * documents rather than convenient strings.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver, type ResolverDocument } from '@toghen/lib';
import { createFigmaMock, useFigmaMock } from './support/figmaMock.js';
import { GET_TOKEN_GRAPH, buildTokenGraph } from '../main/handlers/tokenGraph.js';
import { LOAD_DOCUMENT } from '../main/handlers/loadDocument.js';
import { oneFile } from './support/oneFile.js';
import { resetState } from '../main/runtimeState.js';
import type { TokenGraphPayload } from '../shared/protocol.js';

const rgb = (r: number, g: number, b: number, alpha?: number) => ({
  colorSpace: 'srgb',
  components: [r, g, b],
  ...(alpha !== undefined ? { alpha } : {}),
});

const DOCUMENT = {
  version: '2025-11-01',
  name: 'Acme',
  sets: {
    base: {
      sources: [
        {
          palette: { blue: { $type: 'color', $value: rgb(0, 0.4, 0.8) } },
          space: { md: { $type: 'dimension', $value: { value: 16, unit: 'px' } } },
          font: { body: { $type: 'fontFamily', $value: ['Inter', 'sans-serif'] } },
          shade: { $type: 'color', $value: rgb(0, 0, 0, 0.25) },
          elevation: {
            raised: {
              $type: 'shadow',
              $value: [
                { color: '{shade}', offsetX: { value: 0, unit: 'px' }, offsetY: { value: 2, unit: 'px' }, blur: { value: 8, unit: 'px' } },
                { color: '{shade}', offsetX: { value: 0, unit: 'px' }, offsetY: { value: 0, unit: 'px' }, blur: { value: 1, unit: 'px' } },
              ],
            },
          },
        },
      ],
    },
  },
  modifiers: {
    theme: {
      default: 'light',
      contexts: {
        light: [{ color: { brand: { $type: 'color', $value: '{palette.blue}' } } }],
        dark: [{ color: { brand: { $type: 'color', $value: rgb(1, 1, 1) } } }],
      },
    },
  },
  resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
} as unknown as ResolverDocument;

const entry = (graph: TokenGraphPayload, path: string) => {
  const found = graph.tokens.find((token) => token.path === path);
  assert.ok(found, `${path} is in the graph`);
  return found;
};

describe('buildTokenGraph', () => {
  it('writes each value for reading, per mode of the sum', () => {
    const graph = buildTokenGraph(new Resolver(DOCUMENT));

    assert.deepEqual(graph.modes, ['light', 'dark']);
    assert.deepEqual(entry(graph, 'Acme.color.brand').valueByMode, { light: '#0066cc', dark: '#ffffff' });
    assert.equal(entry(graph, 'Acme.space.md').valueByMode.light, '16px');
    assert.equal(entry(graph, 'Acme.font.body').valueByMode.light, 'Inter, sans-serif');
    assert.equal(entry(graph, 'Acme.shade').valueByMode.light, '#00000040');
    assert.equal(entry(graph, 'Acme.elevation.raised').valueByMode.light, 'shadow, 2 layers');
    for (const token of graph.tokens) {
      for (const value of Object.values(token.valueByMode)) assert.doesNotMatch(String(value), /\[object Object\]/);
    }
  });

  it('names what each token points to, in any mode, and what points to it', () => {
    const graph = buildTokenGraph(new Resolver(DOCUMENT));

    // Light points to the palette; dark is a literal. The edge is still there.
    assert.deepEqual(entry(graph, 'Acme.color.brand').references, ['Acme.palette.blue']);
    assert.deepEqual(entry(graph, 'Acme.palette.blue').referencedBy, ['Acme.color.brand']);
    // A composite's members refer too, once each.
    assert.deepEqual(entry(graph, 'Acme.elevation.raised').references, ['Acme.shade']);
    assert.deepEqual(entry(graph, 'Acme.shade').referencedBy, ['Acme.elevation.raised']);
  });

  it('gives the group, the type, and the CSS name', () => {
    const brand = entry(buildTokenGraph(new Resolver(DOCUMENT)), 'Acme.color.brand');
    assert.equal(brand.group, 'Acme.color');
    assert.equal(brand.type, 'color');
    assert.equal(brand.codeSyntax, '--color-brand');
  });
});

describe('GET_TOKEN_GRAPH', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  it('is posted after a load, and answered when asked', async () => {
    const mock = createFigmaMock().install();
    await LOAD_DOCUMENT(oneFile(JSON.stringify(DOCUMENT)));
    await GET_TOKEN_GRAPH();

    const graphs = mock
      .calls('ui.postMessage')
      .map((call) => call.args[0] as { type: string; payload: TokenGraphPayload })
      .filter((message) => message.type === 'TOKEN_GRAPH');
    assert.equal(graphs.length, 2);
    assert.ok(graphs[1].payload.tokens.length > 0);
  });

  it('says a document is needed when none is loaded', async () => {
    const mock = createFigmaMock().install();
    await GET_TOKEN_GRAPH();

    const [message] = mock.calls('ui.postMessage').map((call) => call.args[0] as { type: string; payload: { code: string } });
    assert.equal(message.type, 'ERROR');
    assert.equal(message.payload.code, 'NO_RESOLVER');
  });
});
