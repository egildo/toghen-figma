/**
 * Wrap, a grid child's alignment, position, appearance and strokes: the fields the roster's sections 3 to 7 add. A
 * bindable one is bound (`counterAxisSpacing`); an unbindable one that takes a token is written as its value at the
 * declared defaults, said once (`x`, `dashPattern`); an enum is plain. A second run plans nothing.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LOAD_DOCUMENT } from '../../main/handlers/loadDocument.js';
import { resetState } from '../../main/runtimeState.js';
import { readComponentFile } from '../../shared/components/index.js';
import { createFigmaMock, useFigmaMock } from '../support/figmaMock.js';
import { oneFile } from '../support/oneFile.js';
import { byAddress, runFile, stampOf } from './support.js';

type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const DOCUMENT = {
  version: '2025-11-01',
  name: 'Core',
  sets: {
    base: {
      sources: [
        {
          space: {
            sm: { $type: 'dimension', $value: { value: 8, unit: 'px' } },
            md: { $type: 'dimension', $value: { value: 1, unit: 'rem' } },
          },
          smooth: { $type: 'number', $value: 0.6 },
          tone: { edge: { $type: 'color', $value: { colorSpace: 'srgb', components: [0.1, 0.2, 0.3] } } },
          stroke: {
            dashed: {
              $type: 'strokeStyle',
              $value: {
                dashArray: [
                  { value: 4, unit: 'px' },
                  { value: 2, unit: 'px' },
                ],
                lineCap: 'round',
              },
            },
            plain: { $type: 'strokeStyle', $value: 'dashed' },
          },
        },
      ],
    },
  },
  modifiers: { scheme: { default: 'light', contexts: { light: [{}], dark: [{}] } } },
  resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/scheme' }],
};

const mockOf = () =>
  createFigmaMock()
    .withCollection('Core', ['default'])
    .withVariable('Core', 'space/sm', 'FLOAT', { default: 8 })
    .withVariable('Core', 'tone/edge', 'COLOR', { default: { r: 0.1, g: 0.2, b: 0.3, a: 1 } });

async function loaded() {
  const mock = mockOf().install();
  await LOAD_DOCUMENT(oneFile(JSON.stringify(DOCUMENT), 'core.resolver.json'));
  return mock;
}

const line = (field: string, where: string): string =>
  `"${field}" of "${where}": the token is written as its value in "light"; it will not follow the token until the next run`;

/** Every field this file adds, on the layers that take it, tokens and literals both. */
const PANEL = `component Panel
FRAME Panel cornerSmoothing="{smooth}" blendMode=MULTIPLY strokeJoin=ROUND strokeAlign=OUTSIDE strokeBottomWeight=(literal)2 {
    strokes "{tone.edge}"
    dashPattern "{stroke.dashed}"
    FRAME Row layoutMode=VERTICAL layoutWrap=WRAP counterAxisAlignContent=SPACE_BETWEEN counterAxisSpacing="{space.sm}" {
        FRAME Pin layoutPositioning=ABSOLUTE x="{space.md}" y=(literal)-4 {
            constraints horizontal=MAX vertical=STRETCH
        }
    }
    FRAME Cells layoutMode=GRID {
        gridRowSizes { FIXED 20; }
        gridColumnSizes { FIXED 20; }
        FRAME Cell gridChildHorizontalAlign=CENTER gridChildVerticalAlign=MAX {
            grid row=0 column=0
        }
    }
    LINE Rule strokeCap=ROUND {
        strokes "{tone.edge}"
        dashPattern (literal)1 (literal)3
    }
}
`;

const problemsOf = (text: string): string[] =>
  readComponentFile(text)
    .problems.filter((problem) => problem.severity === 'error')
    .map((problem) => problem.message);

describe('wrap, grid child, position, appearance and stroke fields', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  it('binds counterAxisSpacing from a { value, unit } dimension on a wrapping frame, after its layout', async () => {
    const mock = await loaded();
    const report = await runFile(mock, `component Row\nFRAME Row layoutMode=HORIZONTAL layoutWrap=WRAP counterAxisSpacing="{space.sm}"\n`);
    const row = byAddress((mock.node(report.setId!) as Node).children[0]).get('Row')!;
    assert.equal(row.layoutWrap, 'WRAP');
    assert.equal(row.boundVariables.counterAxisSpacing.id, mock.variable('Core', 'space/sm')!.id);
    assert.equal(row.counterAxisSpacing, 8);
  });

  it('writes x from a dimension token as its value at the defaults, and says so in a dry run and a real one', async () => {
    const mock = await loaded();
    const file = `component Card\nFRAME Card {\n    FRAME Badge x="{space.md}" y=(literal)3\n}\n`;
    const dry = await runFile(mock, file, { dryRun: true });
    assert.deepEqual(dry.warnings, [line('x', 'Card/Badge')]);

    const report = await runFile(mock, file);
    const badge = byAddress((mock.node(report.setId!) as Node).children[0]).get('Badge')!;
    assert.deepEqual([badge.x, badge.y], [16, 3]);
    assert.deepEqual(report.warnings, [line('x', 'Card/Badge')]);
    assert.equal(
      mock.calls('node.setBoundVariable').some((call) => call.args[1] === 'x'),
      false,
    );
  });

  it('writes dashPattern from a strokeStyle token as its dash array, and a literal list as given', async () => {
    const mock = await loaded();
    const report = await runFile(mock, PANEL);
    const layers = byAddress((mock.node(report.setId!) as Node).children[0]);
    assert.deepEqual(layers.get('Panel')!.dashPattern, [4, 2]);
    assert.deepEqual(layers.get('Rule')!.dashPattern, [1, 3]);
    assert.ok(report.warnings.includes(line('dashPattern', 'Panel')));
  });

  it('writes every field it adds, and a declared strokeAlign wins over the one a side implies', async () => {
    const mock = await loaded();
    const report = await runFile(mock, PANEL);
    const layers = byAddress((mock.node(report.setId!) as Node).children[0]);
    const panel = layers.get('Panel')!;
    assert.deepEqual(
      [panel.strokeAlign, panel.strokeBottomWeight, panel.strokeTopWeight, panel.blendMode, panel.strokeJoin, panel.cornerSmoothing],
      ['OUTSIDE', 2, 0, 'MULTIPLY', 'ROUND', 0.6],
    );
    const row = layers.get('Row')!;
    assert.deepEqual([row.layoutWrap, row.counterAxisAlignContent], ['WRAP', 'SPACE_BETWEEN']);
    const pin = layers.get('Pin')!;
    assert.deepEqual(
      [pin.layoutPositioning, pin.x, pin.y, pin.constraints],
      ['ABSOLUTE', 16, -4, { horizontal: 'MAX', vertical: 'STRETCH' }],
    );
    const cell = layers.get('Cell')!;
    assert.deepEqual([cell.gridChildHorizontalAlign, cell.gridChildVerticalAlign], ['CENTER', 'MAX']);
    assert.equal(layers.get('Rule')!.strokeCap, 'ROUND');
  });

  it('keeps a receipt for each, so a second run plans nothing', async () => {
    const mock = await loaded();
    const first = await runFile(mock, PANEL);
    const layers = byAddress((mock.node(first.setId!) as Node).children[0]);
    const receipt = (address: string): string[] => Object.keys(stampOf(layers.get(address))!.receipt).sort();
    assert.deepEqual(receipt('Panel'), [
      'blendMode',
      'cornerSmoothing',
      'dashPattern',
      'strokeAlign',
      'strokeBottomWeight',
      'strokeJoin',
      'strokes',
    ]);
    assert.deepEqual(receipt('Pin'), ['constraints', 'layoutPositioning', 'x', 'y']);
    assert.deepEqual(receipt('Row'), ['counterAxisAlignContent', 'counterAxisSpacing', 'layoutMode', 'layoutWrap']);
    assert.deepEqual(receipt('Cell'), ['grid', 'gridChildHorizontalAlign', 'gridChildVerticalAlign']);
    assert.deepEqual(receipt('Rule'), ['dashPattern', 'strokeCap', 'strokes']);

    const again = await runFile(mock, PANEL);
    assert.equal(again.setId, first.setId);
    assert.deepEqual(
      again.steps.filter((step) => step.kind === 'PATCH_LAYER' || /^(CREATE|DELETE|REPLACE|ADD)/.test(step.kind)),
      [],
    );
    assert.deepEqual([again.created, again.updated, again.deleted], [[], [], []]);
  });

  it('sees a hand edit of a declared strokeAlign, and puts it back', async () => {
    const mock = await loaded();
    const first = await runFile(mock, PANEL);
    const panel = byAddress((mock.node(first.setId!) as Node).children[0]).get('Panel')!;
    panel.strokeAlign = 'CENTER';
    const again = await runFile(mock, PANEL, { overwriteDrift: true });
    assert.equal(panel.strokeAlign, 'OUTSIDE');
    assert.ok(again.steps.some((step) => step.kind === 'PATCH_LAYER'));
  });

  it('refuses an enum value a field lacks, and constraints that miss an axis', () => {
    assert.deepEqual(problemsOf(`component A\nFRAME A layoutMode=HORIZONTAL layoutWrap=SOMETIMES strokeJoin=SHARP\n`), [
      '"layoutWrap" takes one of NO_WRAP WRAP, not "SOMETIMES"',
      '"strokeJoin" takes one of MITER BEVEL ROUND, not "SHARP"',
    ]);
    assert.deepEqual(problemsOf(`component A\nFRAME A {\n    FRAME B {\n        constraints horizontal=LEFT\n    }\n}\n`), [
      '"constraints" needs "vertical"',
      '"horizontal" in "constraints" takes one of MIN CENTER MAX STRETCH SCALE, not "LEFT"',
    ]);
    assert.deepEqual(problemsOf(`component A\nFRAME A {\n    strokes (literal)"#000000"\n    dashPattern 4 (literal)2\n}\n`), [
      '"dashPattern" has a bare 4: write (literal)4 or a token reference',
    ]);
    assert.deepEqual(problemsOf(`component A\nFRAME A strokeCap=ROUND\n`), ['"strokeCap" does not apply to a FRAME layer, in FRAME "A"']);
  });

  it('refuses a field whose layout is not there: wrap with no layoutMode, a cell alignment outside a grid, x where a parent places', () => {
    assert.deepEqual(problemsOf(`component A\nFRAME A layoutWrap=WRAP\n`), [
      'FRAME "A" has layoutWrap, which wraps a flow; its layoutMode is NONE, and it needs HORIZONTAL or VERTICAL',
    ]);
    assert.deepEqual(
      problemsOf(`component A\nFRAME A x=(literal)1 layoutMode=HORIZONTAL {\n    FRAME B gridChildHorizontalAlign=MIN y=(literal)2\n}\n`),
      [
        'FRAME "A" is the root, which Toghen places on the page, so it takes no x',
        'FRAME "B" has gridChildHorizontalAlign, which aligns a child in its grid cell, but its parent "A" is not a GRID',
        'FRAME "B" has y, but its parent "A" places it (layoutMode HORIZONTAL); write layoutPositioning=ABSOLUTE to place it yourself',
      ],
    );
    assert.deepEqual(problemsOf(`component A\nFRAME A {\n    FRAME B layoutPositioning=ABSOLUTE\n}\n`), [
      'FRAME "B" has layoutPositioning, which only a child of an auto-layout frame takes, but its parent "A" has no layout',
    ]);
  });

  it('refuses a token of a type the field does not take, and a stroke style with no lengths', async () => {
    const mock = await loaded();
    await assert.rejects(
      runFile(mock, `component A\nFRAME A {\n    FRAME B x="{smooth}"\n}\n`),
      /token \{smooth\} \(line 3\) on "x" is written as its value, which Figma cannot bind; it is a number, and "x" takes a dimension/,
    );
    await assert.rejects(
      runFile(mock, `component A\nFRAME A {\n    strokes "{tone.edge}"\n    dashPattern "{stroke.plain}"\n}\n`),
      /token \{stroke\.plain\} \(line 4\) on "dashPattern" is written as its value, which Figma cannot bind, and its value is not one Figma can take there/,
    );
  });

  it('the mock refuses to bind a field Figma cannot, with Figma’s message', () => {
    const mock = mockOf().install();
    const frame = (globalThis as unknown as { figma: { createFrame(): Node } }).figma.createFrame();
    for (const field of ['x', 'cornerSmoothing', 'dashPattern', 'layoutWrap', 'strokeAlign', 'blendMode']) {
      assert.throws(() => frame.setBoundVariable(field, mock.variable('Core', 'space/sm')), {
        message: `in setBoundVariable: Unknown field: '${field}'`,
      });
    }
  });
});
