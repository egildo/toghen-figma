/**
 * The field writer: a token bound where Figma can bind it, written as its value at the declared defaults where it
 * cannot. The proof case is a paint's alpha, which Figma cannot bind (measured §14).
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LOAD_DOCUMENT } from '../../main/handlers/loadDocument.js';
import { resetState } from '../../main/runtimeState.js';
import { createFigmaMock, useFigmaMock } from '../support/figmaMock.js';
import { oneFile } from '../support/oneFile.js';
import { byAddress, runFile } from './support.js';

type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const DOCUMENT = {
  version: '2025-11-01',
  name: 'Core',
  sets: {
    base: {
      sources: [
        {
          tone: { dot: { $type: 'color', $value: { colorSpace: 'srgb', components: [0.2, 0.4, 0.6], alpha: 0.5 } } },
          space: { sm: { $type: 'dimension', $value: { value: 8, unit: 'px' } } },
        },
      ],
    },
  },
  modifiers: {
    scheme: {
      default: 'light',
      contexts: { light: [{}], dark: [{ tone: { dot: { $value: { colorSpace: 'srgb', components: [0.8, 0.6, 0.4], alpha: 0.25 } } } }] },
    },
    density: { default: 'comfortable', contexts: { comfortable: [{}], compact: [{}] } },
  },
  resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/scheme' }, { $ref: '#/modifiers/density' }],
};

const BADGE = `component Badge
FRAME Badge layoutMode=HORIZONTAL paddingLeft="{space.sm}" {
    FRAME Dot width=(literal)8 height=(literal)8 {
        fills "{tone.dot}"
    }
}
`;

/** The variables the sync would have made from the document, its alpha included. */
const mockOf = () =>
  createFigmaMock()
    .withCollection('Core', ['default'])
    .withVariable('Core', 'tone/dot', 'COLOR', { default: { r: 0.2, g: 0.4, b: 0.6, a: 0.5 } })
    .withVariable('Core', 'space/sm', 'FLOAT', { default: 8 });

const ALPHA_LINE = `"fills" of "Badge/Dot": the colour's alpha is written as its value in "light/comfortable"; it will not follow the token until the next run`;

describe('the field writer', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  it('binds a paint’s colour and writes the colour’s alpha as the paint’s opacity, at the defaults, said once', async () => {
    const mock = mockOf().install();
    await LOAD_DOCUMENT(oneFile(JSON.stringify(DOCUMENT), 'core.resolver.json'));
    const report = await runFile(mock, BADGE);

    const layers = byAddress((mock.node(report.setId!) as Node).children[0]);
    const [paint] = layers.get('Dot')!.fills;
    assert.equal(paint.boundVariables.color.id, mock.variable('Core', 'tone/dot')!.id);
    assert.equal(paint.opacity, 0.5);
    assert.deepEqual(report.warnings, [ALPHA_LINE]);
  });

  it('binds a { value, unit } dimension', async () => {
    const mock = mockOf().install();
    await LOAD_DOCUMENT(oneFile(JSON.stringify(DOCUMENT), 'core.resolver.json'));
    const report = await runFile(mock, BADGE);
    const root = byAddress((mock.node(report.setId!) as Node).children[0]).get('Badge')!;
    assert.equal(root.boundVariables.paddingLeft.id, mock.variable('Core', 'space/sm')!.id);
  });

  it('plans nothing on a second run: the receipt holds the opacity it wrote', async () => {
    const mock = mockOf().install();
    await LOAD_DOCUMENT(oneFile(JSON.stringify(DOCUMENT), 'core.resolver.json'));
    const first = await runFile(mock, BADGE);
    const again = await runFile(mock, BADGE);

    assert.equal(again.setId, first.setId);
    assert.deepEqual(
      again.steps.filter((step) => step.kind === 'PATCH_LAYER' || /^(CREATE|DELETE|REPLACE|ADD)/.test(step.kind)),
      [],
    );
    assert.deepEqual([again.created, again.updated, again.deleted, again.warnings], [[], [], [], []]);
  });

  it('says the line in a dry run, and writes nothing', async () => {
    const mock = mockOf().install();
    await LOAD_DOCUMENT(oneFile(JSON.stringify(DOCUMENT), 'core.resolver.json'));
    const report = await runFile(mock, BADGE, { dryRun: true });

    assert.deepEqual(report.warnings, [ALPHA_LINE]);
    assert.equal(report.setId, undefined);
    assert.deepEqual(mock.calls('node.set'), []);
    assert.deepEqual(mock.calls('setBoundVariableForPaint'), []);
  });

  it('refuses, with the line, a colour with an alpha when no design system is loaded', async () => {
    const mock = mockOf().install();
    await assert.rejects(
      runFile(mock, BADGE),
      /token \{tone\.dot\} \(line 4\) has an alpha, written as the paint's opacity, which Figma cannot bind, and no design system is loaded; load its resolver document in the plugin, or pass it to the command line/,
    );
  });
});
