/**
 * Gradients, effects and layout grids as fields (unit 4): a gradient token on `fills` binds each stop's colour by
 * writing the alias into the stop; `effects` binds a shadow's five fields and a blur's radius; `layoutGrids` binds the
 * fields its alignment takes. Every token is in the W3C structured shapes.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LOAD_DOCUMENT } from '../../main/handlers/loadDocument.js';
import { resetState } from '../../main/runtimeState.js';
import { readComponentFile } from '../../shared/components/index.js';
import { createFigmaMock, useFigmaMock } from '../support/figmaMock.js';
import { oneFile } from '../support/oneFile.js';
import { byAddress, runFile } from './support.js';

type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const px = (value: number) => ({ $type: 'dimension', $value: { value, unit: 'px' } });
const srgb = (components: number[], alpha?: number) => ({
  $type: 'color',
  $value: { colorSpace: 'srgb', components, ...(alpha === undefined ? {} : { alpha }) },
});

const DOCUMENT = {
  version: '2025-11-01',
  name: 'Core',
  sets: {
    base: {
      sources: [
        {
          color: { start: srgb([1, 0.5, 0]), end: srgb([0, 0.25, 1]), shadow: srgb([0, 0, 0], 0.25) },
          gradient: {
            dawn: {
              $type: 'gradient',
              $value: [
                { color: '{color.start}', position: 0 },
                { color: '{color.end}', position: 1 },
              ],
            },
          },
          lift: { x: px(0), y: px(1), blur: px(3), spread: px(0) },
          shadow: {
            raised: {
              $type: 'shadow',
              $value: { color: '{color.shadow}', offsetX: '{lift.x}', offsetY: '{lift.y}', blur: '{lift.blur}', spread: '{lift.spread}' },
            },
            flat: {
              $type: 'shadow',
              $value: {
                color: '{color.shadow}',
                offsetX: { value: 0, unit: 'px' },
                offsetY: { value: 1, unit: 'px' },
                blur: { value: 3, unit: 'px' },
                spread: { value: 0, unit: 'px' },
              },
            },
          },
          blur: { soft: px(4) },
          columns: { count: { $type: 'number', $value: 12 } },
          space: { sm: px(8), md: px(16) },
        },
      ],
    },
  },
  modifiers: { scheme: { default: 'light', contexts: { light: [{}], dark: [{}] } } },
  resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/scheme' }],
};

const CARD = `component Card
FRAME Card layoutMode=VERTICAL {
    fills "{gradient.dawn}"
    effects "{shadow.raised}" "{blur.soft}" (literal)2
    layoutGrids {
        COLUMNS alignment=STRETCH count="{columns.count}" gutterSize="{space.sm}" offset="{space.md}"
        ROWS alignment=CENTER count=3 gutterSize=(literal)4 sectionSize="{space.md}" color=(literal)"#00ff0033"
    }
    FRAME Flat {
        effects "{shadow.flat}"
    }
}
`;

/** The variables the sync would have made from the document. */
const mockOf = () =>
  createFigmaMock()
    .withCollection('Core', ['default'])
    .withVariable('Core', 'color/start', 'COLOR', { default: { r: 1, g: 0.5, b: 0, a: 1 } })
    .withVariable('Core', 'color/end', 'COLOR', { default: { r: 0, g: 0.25, b: 1, a: 1 } })
    .withVariable('Core', 'color/shadow', 'COLOR', { default: { r: 0, g: 0, b: 0, a: 0.25 } })
    .withVariable('Core', 'lift/x', 'FLOAT', { default: 0 })
    .withVariable('Core', 'lift/y', 'FLOAT', { default: 1 })
    .withVariable('Core', 'lift/blur', 'FLOAT', { default: 3 })
    .withVariable('Core', 'lift/spread', 'FLOAT', { default: 0 })
    .withVariable('Core', 'blur/soft', 'FLOAT', { default: 4 })
    .withVariable('Core', 'columns/count', 'FLOAT', { default: 12 })
    .withVariable('Core', 'space/sm', 'FLOAT', { default: 8 })
    .withVariable('Core', 'space/md', 'FLOAT', { default: 16 });

const GRADIENT_LINE = `"fills" of "Card": part of the gradient "{gradient.dawn}" (stop positions) is written as its value in "light"; it will not follow the token until the next run`;
const FLAT_LINE = `"effects" of "Card/Flat": part of the shadow "{shadow.flat}" (offsetX, offsetY, blur, spread) is written as its value in "light"; it will not follow the token until the next run`;

async function built() {
  const mock = mockOf().install();
  await LOAD_DOCUMENT(oneFile(JSON.stringify(DOCUMENT), 'core.resolver.json'));
  const report = await runFile(mock, CARD);
  const layers = byAddress((mock.node(report.setId!) as Node).children[0]);
  const id = (name: string) => mock.variable('Core', name)!.id;
  return { mock, report, layers, id };
}

const boundIds = (bound: Record<string, { id: string }> | undefined) =>
  Object.fromEntries(Object.entries(bound ?? {}).map(([field, alias]) => [field, alias.id]));

describe('gradients, effects and layout grids as fields', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  it('binds each gradient stop’s colour by writing the alias into the stop, and writes the positions', async () => {
    const { layers, id } = await built();
    const [paint] = layers.get('Card')!.fills;
    assert.equal(paint.type, 'GRADIENT_LINEAR');
    assert.deepEqual(
      paint.gradientStops.map((stop: Node) => [stop.position, stop.boundVariables?.color?.id]),
      [
        [0, id('color/start')],
        [1, id('color/end')],
      ],
    );
    // A W3C gradient has no angle: it runs left to right, the transform measured for that (§6).
    assert.deepEqual(
      paint.gradientTransform.map((row: number[]) => row.map((n) => n + 0)),
      [
        [1, 0, 0],
        [0, 1, 0],
      ],
    );
  });

  it('binds every member of a shadow that refers to a token, and a blur’s radius; a literal radius is a plain layer blur', async () => {
    const { mock, layers, id } = await built();
    const [shadow, blur, literal] = layers.get('Card')!.effects;
    assert.equal(shadow.type, 'DROP_SHADOW');
    assert.deepEqual(boundIds(shadow.boundVariables), {
      color: id('color/shadow'),
      offsetX: id('lift/x'),
      offsetY: id('lift/y'),
      radius: id('lift/blur'),
      spread: id('lift/spread'),
    });
    assert.deepEqual([shadow.offset, shadow.radius, shadow.spread], [{ x: 0, y: 1 }, 3, 0]);
    assert.deepEqual([blur.type, blur.radius, boundIds(blur.boundVariables)], ['LAYER_BLUR', 4, { radius: id('blur/soft') }]);
    assert.deepEqual([literal.type, literal.radius, literal.boundVariables], ['LAYER_BLUR', 2, undefined]);
    assert.ok(mock.calls('setBoundVariableForEffect').length >= 6);
  });

  it('writes a shadow’s literal members as values, binds its colour, and says so once', async () => {
    const { report, layers, id } = await built();
    const [shadow] = layers.get('Flat')!.effects;
    assert.deepEqual(boundIds(shadow.boundVariables), { color: id('color/shadow') });
    assert.deepEqual([shadow.offset, shadow.radius, shadow.spread], [{ x: 0, y: 1 }, 3, 0]);
    assert.deepEqual([...report.warnings].sort(), [FLAT_LINE, GRADIENT_LINE].sort());
  });

  it('binds the fields a grid’s alignment takes, and writes a literal and the colour', async () => {
    const { layers, id } = await built();
    const [columns, rows] = layers.get('Card')!.layoutGrids;
    assert.deepEqual(
      [columns.pattern, columns.alignment, columns.count, columns.gutterSize, columns.offset],
      ['COLUMNS', 'STRETCH', 12, 8, 16],
    );
    assert.deepEqual(boundIds(columns.boundVariables), { count: id('columns/count'), gutterSize: id('space/sm'), offset: id('space/md') });
    assert.equal('sectionSize' in columns, false, 'a STRETCH grid takes no section size');
    assert.deepEqual([rows.alignment, rows.count, rows.gutterSize, rows.sectionSize], ['CENTER', 3, 4, 16]);
    assert.deepEqual(boundIds(rows.boundVariables), { sectionSize: id('space/md') });
    assert.equal('offset' in rows, false, 'a CENTER grid takes no offset');
    assert.deepEqual(rows.color, { r: 0, g: 1, b: 0, a: 0x33 / 255 });
  });

  it('says the same lines in a dry run, and binds nothing', async () => {
    const mock = mockOf().install();
    await LOAD_DOCUMENT(oneFile(JSON.stringify(DOCUMENT), 'core.resolver.json'));
    const report = await runFile(mock, CARD, { dryRun: true });
    assert.deepEqual([...report.warnings].sort(), [FLAT_LINE, GRADIENT_LINE].sort());
    assert.deepEqual([mock.calls('setBoundVariableForEffect'), mock.calls('setBoundVariableForLayoutGrid')], [[], []]);
  });

  it('plans nothing on a second run: each part reads back as it was written', async () => {
    const { mock } = await built();
    const again = await runFile(mock, CARD);
    assert.deepEqual(
      again.steps.filter((step) => step.kind === 'PATCH_LAYER' || /^(CREATE|DELETE|REPLACE|ADD)/.test(step.kind)),
      [],
    );
    assert.deepEqual([again.created, again.updated, again.deleted], [[], [], []]);
  });

  it('reads a grid field unbound by hand as drift, per part', async () => {
    const { mock, layers } = await built();
    const card = layers.get('Card')!;
    card.layoutGrids = card.layoutGrids.map((grid: Node, index: number) =>
      index === 0 ? { ...grid, boundVariables: { count: grid.boundVariables.count, gutterSize: grid.boundVariables.gutterSize } } : grid,
    );
    const again = await runFile(mock, CARD);
    assert.ok(
      again.steps.some((step) => step.kind === 'LEAVE' && /"layoutGrids" was changed in Figma/.test(step.message ?? '')),
      JSON.stringify(again.steps),
    );
  });

  it('refuses a colour token’s binding on a blur, as Figma does', async () => {
    const mock = mockOf().install();
    const blur = { type: 'LAYER_BLUR', blurType: 'NORMAL', radius: 4, visible: true } as Effect;
    assert.throws(
      () => figma.variables.setBoundVariableForEffect(blur, 'color', mock.variable('Core', 'color/shadow') as unknown as Variable),
      /Expected 'radius', received 'color'/,
    );
  });
});

describe('what the reader refuses in effects and layout grids', () => {
  const problems = (body: string) =>
    readComponentFile(`component Card\nFRAME Card {\n${body}\n}\n`).problems.map((problem) => `${problem.line}: ${problem.message}`);

  it('refuses a field the grid’s alignment does not take, with its line', () => {
    assert.deepEqual(
      problems(
        `    layoutGrids {\n        COLUMNS alignment=CENTER count=3 gutterSize=(literal)4 sectionSize=(literal)80 offset=(literal)8\n    }`,
      ),
      [
        `4: "offset" does not apply to a CENTER grid in "layoutGrids": Figma takes count, gutterSize, sectionSize there, and refuses to bind "offset"`,
      ],
    );
    assert.deepEqual(problems(`    layoutGrids {\n        GRID sectionSize=(literal)8 count=2\n    }`), [
      `4: "count" does not apply to a square GRID in "layoutGrids": Figma takes sectionSize there, and refuses to bind "count"`,
    ]);
  });

  it('refuses effects beside an effect style, naming both', () => {
    const both = readComponentFile(
      `component Card\nFRAME Card effectStyle="{shadow.raised}" {\n    effects "{shadow.raised}"\n}\n`,
    ).problems;
    assert.deepEqual(
      both.map((problem) => problem.message),
      [
        `FRAME "Card" has both "effects" and "effectStyle": the effect style sets the effects that "effects" sets, so the two would disagree; keep one`,
      ],
    );
  });

  it('refuses a bare number on effects', () => {
    assert.match(
      problems(`    effects 4`)[0],
      /"effects" has a bare 4: write \(literal\)4 for a layer blur of that radius, or a token reference/,
    );
  });
});
