/**
 * `$extensions["com.toghen"].figma.value`: a token (or a context's own definition of it) names the value the variable
 * plan writes where its CSS value is one Figma cannot hold. Synthetic tokens, in the structured shapes.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver, type ResolverDocument } from '@toghen/lib';
import { VariableSyncEngine, type VariablePlan } from '../main/engines/variableSyncEngine.js';
import { buildSum } from '../main/utils/sum.js';
import { defaultTokenTypeMap } from '../shared/tokenTypeMap.js';
import { runOperations } from '../main/engines/batchRunner.js';
import { INSPECT_CORRESPONDENCE } from '../main/handlers/inspectCorrespondence.js';
import { LOAD_DOCUMENT } from '../main/handlers/loadDocument.js';
import { oneFile } from './support/oneFile.js';
import { setState } from '../main/runtimeState.js';
import type { Operation } from '../shared/operations.js';
import type { InspectionPayload, Response } from '../shared/protocol.js';
import { createFigmaMock, float32, useFigmaMock } from './support/figmaMock.js';
import { byAddress, runFile } from './components/support.js';

const px = (value: number) => ({ value, unit: 'px' });
const srgb = (r: number, g: number, b: number) => ({ colorSpace: 'srgb', components: [r, g, b] });
const figma = (value: unknown) => ({ 'com.toghen': { figma: { value } } });

const document = (): ResolverDocument =>
  ({
    version: '2025-11-01',
    name: 'Demo',
    sets: {
      base: {
        sources: [
          {
            ink: {
              $type: 'color',
              primary: { $value: srgb(0.1, 0.1, 0.1) },
              alert: { $value: srgb(0.8, 0, 0) },
              inherited: { $value: 'currentColor' },
            },
            size: { $type: 'dimension', gap: { $value: px(4) } },
            track: { $type: 'letterSpacing', wide: { $value: { value: 0.08, unit: 'em' } } },
            // Not a token Figma can hold in the default tone, nor named by a key: skipped as before.
            bare: { text: { $type: 'color', $value: 'currentColor' } },
            // At the base, no modifier: the key is the token's own.
            link: {
              ink: { $type: 'color', $value: 'currentColor', $extensions: figma('{ink.primary}') },
              rule: { $type: 'letterSpacing', $value: { value: 0.08, unit: 'em' }, $extensions: figma(px(0.5)) },
            },
          },
        ],
      },
    },
    modifiers: {
      tone: {
        default: 'neutral',
        contexts: {
          neutral: [
            {
              t: {
                // CSS: the text colour around the element. Figma: the primary ink.
                text: { $type: 'color', $value: 'currentColor', $extensions: figma('{ink.primary}') },
                // The same, with no $type: lib keeps `inherit` as written.
                plain: { $value: 'inherit', $extensions: figma('{ink.primary}') },
                // A literal of the token's own type.
                fixed: { $type: 'color', $value: 'currentColor', $extensions: figma(srgb(0.2, 0.2, 0.2)) },
                // Nothing names what Figma writes: skipped, and the token with it.
                unnamed: { $type: 'color', $value: 'currentColor' },
              },
            },
          ],
          alert: [
            {
              t: {
                text: { $type: 'color', $value: '{ink.alert}' },
                plain: { $value: '{ink.alert}' },
                fixed: { $type: 'color', $value: '{ink.alert}' },
                unnamed: { $type: 'color', $value: '{ink.alert}' },
              },
            },
          ],
        },
      },
    },
    resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/tone' }],
  }) as ResolverDocument;

const sumOf = (doc: ResolverDocument = document()) => buildSum(new Resolver(doc), 'Demo', defaultTokenTypeMap);
const cellsOf = (sum: ReturnType<typeof sumOf>, path: string) =>
  Object.fromEntries(
    sum.tokenByPath
      .get(path)!
      .variables.flatMap((variable) => [...variable.cells].map(([mode, cell]) => [`${variable.collection}/${mode}`, cell])),
  );
const reasonOf = (sum: ReturnType<typeof sumOf>, path: string) => {
  const routing = sum.tokenByPath.get(path)!.routing;
  assert.equal(routing.kind, 'refused', `${path} is ${routing.kind}`);
  return routing.kind === 'refused' ? routing.reason : '';
};

describe('figma.value — the sum', () => {
  it("writes the named reference in the cell whose value is currentColor, and the context's own value in the other", () => {
    const cells = cellsOf(sumOf(), 'Demo.t.text');
    assert.deepEqual(Object.keys(cells), ['tone/neutral', 'tone/alert']);
    assert.equal(cells['tone/neutral'].kind, 'reference');
    assert.equal((cells['tone/neutral'] as { to: string }).to, 'Demo.ink.primary');
    assert.deepEqual((cells['tone/neutral'] as { value: unknown }).value, srgb(0.1, 0.1, 0.1));
    assert.equal((cells['tone/alert'] as { to: string }).to, 'Demo.ink.alert');
  });

  it("writes a literal of the token's own type as that value", () => {
    const cells = cellsOf(sumOf(), 'Demo.t.fixed');
    assert.deepEqual(cells['tone/neutral'], { kind: 'value', value: srgb(0.2, 0.2, 0.2) });
    assert.equal(cells['tone/alert'].kind, 'reference');
  });

  it('takes the type of the value a key names for a token with no $type, which lib keeps as written', () => {
    const sum = sumOf();
    const plain = sum.tokenByPath.get('Demo.t.plain')!;
    assert.equal(plain.type, 'color');
    assert.deepEqual(plain.routing, { kind: 'variable', variableType: 'COLOR' });
    const cells = cellsOf(sum, 'Demo.t.plain');
    assert.equal((cells['tone/neutral'] as { to: string }).to, 'Demo.ink.primary');
    assert.equal((cells['tone/alert'] as { to: string }).to, 'Demo.ink.alert');
  });

  it('is read from a token that is not in a modifier, in the base collection', () => {
    const sum = sumOf();
    assert.deepEqual(cellsOf(sum, 'Demo.link.ink'), {
      'Demo/default': { kind: 'reference', to: 'Demo.ink.primary', value: srgb(0.1, 0.1, 0.1) },
    });
  });

  it('also covers what the plan skips for another value Figma cannot hold: an em letter spacing', () => {
    assert.deepEqual(cellsOf(sumOf(), 'Demo.link.rule'), { 'Demo/default': { kind: 'value', value: px(0.5) } });
  });

  it('leaves the token as it was where no cell names a value: skipped, and reported as before', () => {
    const sum = sumOf();
    assert.equal(reasonOf(sum, 'Demo.t.unnamed'), '"Demo.t.unnamed" is currentColor, which Figma cannot hold; skipped.');
    assert.equal(reasonOf(sum, 'Demo.bare.text'), '"Demo.bare.text" is currentColor, which Figma cannot hold; skipped.');
    assert.equal(reasonOf(sum, 'Demo.ink.inherited'), '"Demo.ink.inherited" is currentColor, which Figma cannot hold; skipped.');
    assert.equal(
      reasonOf(sum, 'Demo.track.wide'),
      '"Demo.track.wide" is a letter spacing in em, and a Figma variable bound to letter spacing carries pixels; skipped.',
    );
  });

  it('leaves an untyped token with no key unsupported, as before', () => {
    const doc = document();
    delete (doc.modifiers!.tone.contexts.neutral[0] as any).t.plain.$extensions;
    const plain = sumOf(doc).tokenByPath.get('Demo.t.plain')!;
    assert.equal(plain.routing.kind, 'type-conflict');
  });
});

describe('figma.value — across definitions', () => {
  it('uses a key the token states at its base for a context that redefines the value as currentColor, and ignores it in one that redefines it as a reference', () => {
    const doc = document();
    (doc.sets as any).base.sources[0].inh = { x: { $type: 'color', $value: 'currentColor', $extensions: figma('{ink.primary}') } };
    (doc.modifiers!.tone.contexts.alert[0] as any).inh = { x: { $type: 'color', $value: '{ink.alert}' } };
    const sum = sumOf(doc);
    const cells = cellsOf(sum, 'Demo.inh.x');
    assert.equal(sum.tokenByPath.get('Demo.inh.x')!.routing.kind, 'variable');
    assert.equal((cells['tone/neutral'] as { to: string }).to, 'Demo.ink.primary');
    assert.equal((cells['tone/alert'] as { to: string }).to, 'Demo.ink.alert');
  });

  it('writes the cells of a chain, each link its own', () => {
    const doc = document();
    (doc.modifiers as any).density = {
      default: 'roomy',
      contexts: {
        roomy: [],
        compact: [{ chain: { x: { $type: 'color', $value: '{ink.primary}' } } }],
      },
    };
    (doc.modifiers!.tone.contexts.neutral[0] as any).chain = {
      x: { $type: 'color', $value: 'currentColor', $extensions: figma('{ink.primary}') },
    };
    (doc.modifiers!.tone.contexts.alert[0] as any).chain = { x: { $type: 'color', $value: '{ink.alert}' } };
    (doc as any).resolutionOrder.push({ $ref: '#/modifiers/density' });
    const sum = sumOf(doc);
    const token = sum.tokenByPath.get('Demo.chain.x')!;
    assert.equal(token.routing.kind, 'variable');
    const to = (collection: string, mode: string) => {
      const cell = token.variables.find((variable) => variable.collection === collection)!.cells.get(mode)!;
      return cell.kind === 'reference' ? cell.to : cell.kind;
    };
    assert.equal(to('density', 'roomy'), 'link');
    assert.equal(to('density', 'compact'), 'Demo.ink.primary');
    assert.equal(to('tone', 'neutral'), 'Demo.ink.primary');
    assert.equal(to('tone', 'alert'), 'Demo.ink.alert');
  });
});

describe('figma.value — what is refused, naming the token', () => {
  /** The document with a token's keyed definition replaced, and the reason the sum gives for it. */
  const refused = (path: string[], definition: Record<string, unknown>, context: 'neutral' | 'alert' = 'neutral') => {
    const doc = document();
    let at: any = (doc.modifiers!.tone.contexts[context][0] as any).t;
    for (const key of path.slice(0, -1)) at = at[key];
    at[path.at(-1)!] = definition;
    return reasonOf(sumOf(doc), `Demo.t.${path.join('.')}`);
  };

  it('a key on a token whose value Figma can hold', () => {
    assert.equal(
      refused(['text'], { $type: 'color', $value: srgb(0, 0, 0), $extensions: figma('{ink.primary}') }),
      '"Demo.t.text" in tone=neutral has a figma.value, but its value is one Figma can hold; remove the key, so that the value stays the one both outputs write.',
    );
  });

  it('a key on a context whose value is a reference, while another context needs it', () => {
    assert.equal(
      refused(['text'], { $type: 'color', $value: '{ink.alert}', $extensions: figma('{ink.primary}') }, 'alert'),
      '"Demo.t.text" in tone=alert has a figma.value, but its value is one Figma can hold; remove the key, so that the value stays the one both outputs write.',
    );
  });

  it('a key on a token with no cell to replace anything: a base token whose value can be held', () => {
    const doc = document();
    (doc.sets as any).base.sources[0].link.ink = { $type: 'color', $value: srgb(0, 0, 0), $extensions: figma('{ink.primary}') };
    assert.match(reasonOf(sumOf(doc), 'Demo.link.ink'), /^"Demo\.link\.ink" has a figma\.value, but its value is one Figma can hold/);
  });

  it('a reference that does not resolve', () => {
    assert.match(
      refused(['text'], { $type: 'color', $value: 'currentColor', $extensions: figma('{ink.missing}') }),
      /^"Demo\.t\.text" in tone=neutral: figma\.value "\{ink\.missing\}" cannot be resolved: /,
    );
  });

  it("a reference whose type is not the token's own", () => {
    assert.equal(
      refused(['text'], { $type: 'color', $value: 'currentColor', $extensions: figma('{size.gap}') }),
      '"Demo.t.text" in tone=neutral: figma.value "{size.gap}" is a dimension, and the token is a color.',
    );
  });

  it("a literal that is not a value of the token's type", () => {
    assert.match(
      refused(['text'], { $type: 'color', $value: 'currentColor', $extensions: figma('not a colour') }),
      /^"Demo\.t\.text" in tone=neutral: figma\.value "not a colour" is not a value of the token's type, color: /,
    );
  });

  it('a value that Figma cannot hold either', () => {
    assert.equal(
      refused(['text'], { $type: 'color', $value: 'currentColor', $extensions: figma('{ink.inherited}') }),
      '"Demo.t.text" in tone=neutral: figma.value "{ink.inherited}" is a value Figma cannot hold either.',
    );
  });

  it('a literal on a token with no $type, which has no type to take from it', () => {
    assert.equal(
      refused(['plain'], { $value: 'inherit', $extensions: figma(srgb(0, 0, 0)) }),
      '"Demo.t.plain" has no $type, and its figma.value {"colorSpace":"srgb","components":[0,0,0]} does not give it one: only a reference to a token has a type to give.',
    );
  });

  it('reports each as one warning in the plan, and writes nothing for the token', async () => {
    createFigmaMock().install();
    const doc = document();
    (doc.modifiers!.tone.contexts.neutral[0] as any).t.text = { $type: 'color', $value: 'currentColor', $extensions: figma('{size.gap}') };
    const plan = await new VariableSyncEngine().buildPlan(new Resolver(doc), 'Demo', defaultTokenTypeMap);
    const rows = plan.operations.filter((op) => op.kind === 'WARNING' && op.path === 'Demo.t.text');
    assert.equal(rows.length, 1);
    assert.equal(
      plan.operations.some((op) => op.kind === 'CREATE_VARIABLE' && op.path === 't/text'),
      false,
    );
  });
});

describe('figma.value — not covered', () => {
  it('a token defined in one context only is skipped for that, key or no key', () => {
    const doc = document();
    delete (doc.modifiers!.tone.contexts.neutral[0] as any).t.text;
    (doc.modifiers!.tone.contexts.alert[0] as any).t.text = { $type: 'color', $value: 'currentColor', $extensions: figma('{ink.primary}') };
    assert.match(
      reasonOf(sumOf(doc), 'Demo.t.text'),
      /^"Demo\.t\.text" is defined only in tone=alert and has no value where tone=neutral, the default/,
    );
  });
});

describe('figma.value — the plan, the file, the Inspector and a component file', () => {
  useFigmaMock();
  const plan = (): Promise<VariablePlan> => new VariableSyncEngine().buildPlan(new Resolver(document()), 'Demo', defaultTokenTypeMap);
  const valueOps = (p: VariablePlan, path: string) =>
    p.operations.filter(
      (op): op is Extract<Operation, { kind: 'SET_VARIABLE_VALUE' }> => op.kind === 'SET_VARIABLE_VALUE' && op.tokenPath === path,
    );
  const warnings = (p: VariablePlan, path: string) => p.operations.filter((op) => op.kind === 'WARNING' && op.path === path);

  it('creates a variable with a value in every mode, an alias to what the key names, for a token that is currentColor in one tone and a reference in another', async () => {
    createFigmaMock().install();
    const p = await plan();

    assert.ok(p.operations.some((op) => op.kind === 'CREATE_VARIABLE' && op.path === 't/text' && op.variableType === 'COLOR'));
    const ops = valueOps(p, 'Demo.t.text');
    assert.deepEqual(
      ops.map((op) => op.modeName),
      ['neutral', 'alert'],
    );
    assert.deepEqual(
      ops.map((op) => (op.value as { type: string }).type),
      ['VARIABLE_ALIAS', 'VARIABLE_ALIAS'],
    );
    assert.deepEqual(warnings(p, 'Demo.t.text'), []);
    // A literal is written as the colour, the other tone stays an alias.
    assert.deepEqual(
      valueOps(p, 'Demo.t.fixed').map((op) => op.value),
      [
        { r: 0.2, g: 0.2, b: 0.2, a: 1 },
        { type: 'VARIABLE_ALIAS', id: '$var:Demo/ink/alert' },
      ],
    );
    // The base token is a variable of the base collection, and the em letter spacing a pixel number.
    assert.equal(valueOps(p, 'Demo.link.ink').length, 1);
    assert.deepEqual(
      valueOps(p, 'Demo.link.rule').map((op) => op.value),
      [0.5],
    );
  });

  it('still skips and reports a token no definition names a value for', async () => {
    createFigmaMock().install();
    const p = await plan();
    for (const path of ['Demo.t.unnamed', 'Demo.bare.text']) {
      assert.deepEqual(
        warnings(p, path).map((op) => (op as { message: string }).message),
        [`"${path}" is currentColor, which Figma cannot hold; skipped.`],
      );
      assert.equal(valueOps(p, path).length, 0);
    }
  });

  it("writes the file: the variable holds a value in each mode, resolving to the tone's colour", async () => {
    const mock = createFigmaMock().install();
    await runOperations((await plan()).operations, { onProgress: () => {} });
    const text = mock.variable('tone', 't/text')!;
    assert.equal(text.resolvedType, 'COLOR');
    assert.equal(Object.keys(text.valuesByMode).length, 2);
    assert.deepEqual(mock.valueFor('tone', 't/fixed', 'neutral'), float32({ r: 0.2, g: 0.2, b: 0.2, a: 1 }));
    assert.equal(mock.variable('tone', 't/unnamed'), undefined);
  });

  it('shows the token as usable in the Inspector, and the unnamed one as blocked', async () => {
    const mock = createFigmaMock().install();
    setState({ resolver: new Resolver(document()), conversionMap: defaultTokenTypeMap });
    await INSPECT_CORRESPONDENCE();
    const report = mock
      .calls('ui.postMessage')
      .map((call) => call.args[0] as Response)
      .filter((message) => message.type === 'CORRESPONDENCE')
      .at(-1);
    assert.ok(report && report.type === 'CORRESPONDENCE');
    const tokens = (report.payload as InspectionPayload).tokens;
    for (const path of ['Demo.t.text', 'Demo.t.plain', 'Demo.t.fixed', 'Demo.link.ink', 'Demo.link.rule']) {
      assert.equal(tokens.find((token) => token.path === path)?.state, 'absent', path);
    }
    assert.equal(tokens.find((token) => token.path === 'Demo.t.unnamed')?.state, 'blocked');
  });

  it('lets a component file bind the token: its variable is found, and the layer is filled by it', async () => {
    const mock = createFigmaMock().install();
    await runOperations((await plan()).operations, { onProgress: () => {} });
    await LOAD_DOCUMENT(oneFile(JSON.stringify(document()), 'demo.resolver.json'));
    const report = await runFile(
      mock,
      'component Chip\nFRAME Root layoutMode=VERTICAL {\n    FRAME Body layoutMode=VERTICAL {\n        fills "{t.text}"\n    }\n}\n',
    );
    const set = mock.node(report.setId!) as any;
    const body = byAddress(set.children[0]).get('Body')!;
    assert.equal(body.fills[0].boundVariables.color.id, mock.variable('tone', 't/text')!.id);
  });

  it('keeps refusing a component file that binds a token with no named value, as before', async () => {
    const mock = createFigmaMock().install();
    await runOperations((await plan()).operations, { onProgress: () => {} });
    await LOAD_DOCUMENT(oneFile(JSON.stringify(document()), 'demo.resolver.json'));
    await assert.rejects(
      runFile(
        mock,
        'component Chip\nFRAME Root layoutMode=VERTICAL {\n    FRAME Body layoutMode=VERTICAL {\n        fills "{t.unnamed}"\n    }\n}\n',
      ),
      /token \{t\.unnamed\} \(line 4\) names no variable/,
    );
  });
});
