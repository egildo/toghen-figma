/**
 * Questions the Figma adapter asks the core instead of answering them itself: which token applies under a
 * selection of parts, the name of a chain's link, the default mode, what a name is, and the reference grammar.
 * Synthetic tokens in the W3C structured shapes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { referencesIn, Resolver, type ResolverDocument } from '@toghen/lib';
import { buildTokenGraph } from '../main/handlers/tokenGraph.js';
import { buildDocumentStatePayload } from '../main/utils/buildPayloads.js';
import { designSourceOf } from '../main/utils/designSource.js';
import { figmaContexts, resolveSumModes } from '../main/utils/resolverModes.js';
import { buildSum } from '../main/utils/sum.js';
import { defaultTokenTypeMap } from '../shared/tokenTypeMap.js';

const srgb = (...components: number[]) => ({ colorSpace: 'srgb', components });
const fill = (...components: number[]) => ({ $type: 'color', $value: srgb(...components) });
const VOCABULARY = { 'com.toghen': { css: { parts: { variant: { primary: "[data-variant='primary']" }, state: { hover: ':hover' } } } } };

/** A button laid out one variable per part, with its primary and hover groups in the order given. */
function button(order: 'primary first' | 'hover first'): ResolverDocument {
  const primary = { primary: { backgroundColor: fill(0, 0, 1), color: fill(1, 1, 1) } };
  const hover = { hover: { backgroundColor: fill(0.9, 0.9, 0.9) } };
  return {
    version: '2025-11-01',
    name: 'Demo',
    sets: {
      base: {
        sources: [
          {
            $extensions: VOCABULARY,
            button: {
              backgroundColor: fill(1, 1, 1),
              color: fill(0, 0, 0),
              padding: { $type: 'dimension', $value: { value: 8, unit: 'px' } },
              ...(order === 'primary first' ? { ...primary, ...hover } : { ...hover, ...primary }),
            },
          },
        ],
      },
    },
    resolutionOrder: [{ $ref: '#/sets/base' }],
  } as unknown as ResolverDocument;
}

describe('the token that applies under a selection', () => {
  it('is the later axis on a tie, whichever key the document gives first', () => {
    for (const order of ['primary first', 'hover first'] as const) {
      const info = designSourceOf(new Resolver(button(order))).group!('button', { variant: 'primary', state: 'hover' });
      assert.ok(info && typeof info === 'object', order);
      assert.deepEqual(info.paths, { backgroundColor: 'button.hover.backgroundColor', color: 'button.primary.color' }, order);
      assert.deepEqual([...info.keys].sort(), ['backgroundColor', 'color', 'padding'], order);
    }
  });
});

describe("a chain link's code syntax", () => {
  it('is the core link name: the modifier as written, capitals kept', () => {
    const document = {
      version: '2025-11-01',
      name: 'Demo',
      sets: { base: { sources: [{ surface: { raised: fill(1, 1, 1) } }] } },
      modifiers: {
        colorScheme: { default: 'light', contexts: { light: [], dark: [{ surface: { raised: { $value: srgb(0.17, 0.17, 0.17) } } }] } },
        tone: { default: 'neutral', contexts: { neutral: [], loud: [{ surface: { raised: { $value: srgb(0.9, 0, 0) } } }] } },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/colorScheme' }, { $ref: '#/modifiers/tone' }],
    } as unknown as ResolverDocument;
    const sum = buildSum(new Resolver(document), 'Demo', defaultTokenTypeMap);
    const token = sum.tokenByPath.get('Demo.surface.raised')!;
    assert.deepEqual(
      token.variables.map((variable) => variable.codeSyntax),
      ['var(--surface-raised)', 'var(--surface-raised--colorScheme)'],
    );
  });
});

/** A theme whose default context, `light`, is declared first or after `dark`; `dark` alone adds `surface.glow`, which refers to `ink`. */
function themed(order: 'default first' | 'default last'): ResolverDocument {
  const light = { light: [] };
  const dark = {
    dark: [
      {
        surface: { raised: { $value: srgb(0.17, 0.17, 0.17) } },
        glow: { $type: 'color', $value: '{ink}' },
      },
    ],
  };
  return {
    version: '2025-11-01',
    name: 'Demo',
    sets: {
      base: {
        sources: [
          {
            ink: fill(0, 0, 0),
            surface: { raised: fill(1, 1, 1) },
            gap: { $type: 'dimension', $value: { value: 8, unit: 'px' } },
            body: { $type: 'fontFamily', $value: ['Sans', 'sans-serif'] },
          },
        ],
      },
    },
    modifiers: { theme: { default: 'light', contexts: order === 'default first' ? { ...light, ...dark } : { ...dark, ...light } } },
    resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
  } as unknown as ResolverDocument;
}

describe('the default mode', () => {
  it("is the core's, wherever the document declares the default context", () => {
    for (const order of ['default first', 'default last'] as const) {
      const resolver = new Resolver(themed(order));
      const resolution = resolveSumModes(resolver);
      assert.equal(resolution.defaultMode, resolver.getModeName({}), order);
      assert.equal(resolution.defaultMode, resolution.modeNames[0], order);
      assert.equal(buildDocumentStatePayload(resolver).defaultMode, resolver.getModeName({}), order);
      assert.deepEqual(figmaContexts(resolver.getModifiers()[0]), ['light', 'dark'], order);
      assert.deepEqual(designSourceOf(resolver).contexts('theme'), ['light', 'dark'], order);
      // The theme's Figma collection starts with its default context.
      const sum = buildSum(resolver, 'Demo', defaultTokenTypeMap);
      assert.deepEqual(sum.collections.find((collection) => collection.modifier === 'theme')?.modes, ['light', 'dark'], order);
    }
  });
});

describe('the paths in any mode, walked once', () => {
  it('count, graph and refer to a token only a context adds', () => {
    const resolver = new Resolver(themed('default last'));
    // ink, surface.raised, gap, body, and glow, which only dark has.
    assert.equal(buildDocumentStatePayload(resolver).tokenCount, 5);
    const graph = buildTokenGraph(resolver);
    assert.deepEqual(
      graph.tokens.map((token) => token.path),
      ['Demo.ink', 'Demo.surface.raised', 'Demo.gap', 'Demo.body', 'Demo.glow'],
    );
    const glow = graph.tokens.find((token) => token.path === 'Demo.glow')!;
    assert.equal(glow.type, 'color');
    assert.equal(glow.valueByMode[resolver.getModeName({})], null);
    assert.deepEqual(glow.references, ['Demo.ink']);
    assert.deepEqual(graph.tokens.find((token) => token.path === 'Demo.ink')!.referencedBy, ['Demo.glow']);
    assert.deepEqual(designSourceOf(resolver).children!(''), ['ink', 'surface', 'gap', 'body', 'glow']);
  });
});

describe("the core's reference grammar", () => {
  it('reads an axis segment as part of one reference, its written text whole', () => {
    const written = referencesIn('0 2px {hue.(input)hue.soft} {space.(input)"Header in".md} {ink}').map((reference) => reference.written);
    assert.deepEqual(written, ['{hue.(input)hue.soft}', '{space.(input)"Header in".md}', '{ink}']);
  });
});
