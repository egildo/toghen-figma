/**
 * Component files check what they bind against what each variable is for.
 *
 * A unit that does not fit stops the component (an opacity bound to a width is 1px, a plain number bound to
 * opacity is 1%); a scope that does not fit is a note, since Figma binds a variable in any scope. A literal
 * opacity stays 0 to 1 on the layer. Synthetic tokens in the W3C structured shapes; the variables are the ones the
 * variable sync writes into the mock, so the layer's resulting opacity is read back from it.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ResolverDocument } from '@toghen/lib';
import { LOAD_DOCUMENT } from '../../main/handlers/loadDocument.js';
import { oneFile } from '../support/oneFile.js';
import { PLAN_VARIABLE_SYNC } from '../../main/handlers/planVariableSync.js';
import { EXECUTE_VARIABLE_SYNC } from '../../main/handlers/executeVariableSync.js';
import { resetState } from '../../main/runtimeState.js';
import { createFigmaMock, useFigmaMock } from '../support/figmaMock.js';
import { byAddress, runFile } from './support.js';

type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const px = (value: number) => ({ value, unit: 'px' });
const srgb = (...components: number[]) => ({ colorSpace: 'srgb', components });

const DOCUMENT = {
  version: '2025-11-01',
  name: 'Demo',
  sets: {
    base: {
      sources: [
        {
          button: {
            opacity: { $type: 'number', $value: 0.55 },
            alpha: { $type: 'number', $value: 0.5 },
            width: { $type: 'dimension', $value: px(120) },
          },
          surface: {
            edge: { $type: 'color', $value: srgb(0.1, 0.1, 0.1), $extensions: { 'com.toghen': { figma: { scopes: ['STROKE_COLOR'] } } } },
            page: { $type: 'color', $value: srgb(1, 1, 1), $extensions: { 'com.toghen': { figma: { scopes: ['ALL_FILLS'] } } } },
            hidden: { $type: 'color', $value: srgb(0, 0, 0), $extensions: { 'com.toghen': { figma: { scopes: [] } } } },
          },
        },
      ],
    },
  },
  resolutionOrder: [{ $ref: '#/sets/base' }],
} as unknown as ResolverDocument;

const file = (root: string) => `component Thing\nFRAME Root layoutMode=VERTICAL ${root}\n`;

/** The variables the document makes, written into the mock by the variable sync. */
async function synced() {
  const mock = createFigmaMock().install();
  resetState();
  await LOAD_DOCUMENT(oneFile(JSON.stringify(DOCUMENT), 'demo.resolver.json'));
  await PLAN_VARIABLE_SYNC({});
  await EXECUTE_VARIABLE_SYNC();
  return mock;
}

describe('a component file binds a variable of the unit its field takes', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  it('stops, naming the token, when opacity is bound to a token that is not an opacity', async () => {
    const mock = await synced();
    await assert.rejects(
      runFile(mock, file('opacity="{button.alpha}"'), { dryRun: true }),
      /token Demo\.button\.alpha in member "[^"]*" is bound to opacity but is not an opacity; declare figma\.scopes \["OPACITY"\] on it/,
    );
  });

  it('stops, naming the token, when an opacity is bound to another field', async () => {
    const mock = await synced();
    await assert.rejects(
      runFile(mock, file('width="{button.opacity}"')),
      /token Demo\.button\.opacity in member "[^"]*" is an opacity, bound to width/,
    );
    assert.equal(mock.styles().length + mock.calls('createComponent').length, 0, 'and nothing was written');
  });

  it('builds a layer bound to an opacity at the token’s value, read back from the file', async () => {
    const mock = await synced();
    const report = await runFile(mock, file('opacity="{button.opacity}"'));

    const set = mock.node(report.setId!) as Node;
    const root = byAddress(set.children[0]).get('Root')!;
    assert.equal(root.boundVariables.opacity.id, mock.variable('Demo', 'button/opacity')!.id);
    assert.equal(mock.valueFor('Demo', 'button/opacity', 'default'), 55);
    // The consumer's defect: the layer was drawn at 1% when the variable held 1. It is the token's 0.55 now.
    assert.ok(Math.abs(root.opacity - 0.55) < 1e-9, `the layer is drawn at ${root.opacity}`);
  });

  it('keeps a literal opacity as 0 to 1 on the layer', async () => {
    const mock = await synced();
    const report = await runFile(mock, file('opacity=(literal)0.8'));
    const root = byAddress((mock.node(report.setId!) as Node).children[0]).get('Root')!;
    assert.equal(root.opacity, 0.8);
  });
});

describe('a component file notes a variable bound outside its scopes', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  it('says it in the notes, once per token and field, and still builds the binding', async () => {
    const mock = await synced();
    const report = await runFile(mock, `component Thing\nFRAME Root layoutMode=VERTICAL {\n    fills "{surface.edge}"\n}\n`);

    assert.deepEqual(
      report.notes.filter((note) => /surface\.edge/.test(note)),
      ['Demo.surface.edge is bound to fills but is offered to STROKE_COLOR only; declare figma.scopes to widen it.'],
    );
    const root = byAddress((mock.node(report.setId!) as Node).children[0]).get('Root')!;
    assert.equal(root.fills[0].boundVariables.color.id, mock.variable('Demo', 'surface/edge')!.id, 'Figma binds a variable in any scope');
    assert.deepEqual(report.warnings, []);
  });

  it('says nothing about a variable offered to the field, nor about one a system hid on purpose', async () => {
    const mock = await synced();
    const report = await runFile(
      mock,
      `component Thing
FRAME Root layoutMode=VERTICAL {
    fills "{surface.page}"
    strokes "{surface.edge}"
    FRAME Hidden layoutMode=VERTICAL {
        fills "{surface.hidden}"
    }
}
`,
      { dryRun: true },
    );
    assert.deepEqual(
      report.notes.filter((note) => /surface\./.test(note)),
      [],
    );
  });

  it('says it once when two members bind the same token to the same field', async () => {
    const mock = await synced();
    const report = await runFile(
      mock,
      `component Thing
properties {
    VARIANT State rest hover
}
FRAME Root layoutMode=VERTICAL {
    fills "{surface.edge}"
}
`,
      { dryRun: true },
    );
    assert.equal(report.notes.filter((note) => /surface\.edge/.test(note)).length, 1);
  });
});
