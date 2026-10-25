/**
 * Bindings inferred from a CSS-keyed group.
 *
 * A layer that names a token group (`tokens="{button}"`) gets the bindings the keys of the group's
 * tokens imply. The table is proved row by row against a design system that only says which keys a
 * group has; the rest (a composite border, a typography token, a subgroup, the component line, a
 * build against the mock, the file sent to the plugin as text) is proved against a synthetic design system in the
 * W3C structured shapes, through the same `designSourceOf` the plugin uses.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver, type ResolverDocument } from '@toghen/lib';
import { designSourceOf } from '../../main/utils/designSource.js';
import { run } from '../../main/components/run.js';
import { LOAD_DOCUMENT } from '../../main/handlers/loadDocument.js';
import { oneFile } from '../support/oneFile.js';
import { CHECK_COMPONENTS } from '../../main/handlers/runComponent.js';
import { resetState } from '../../main/runtimeState.js';
import { ComponentRunError } from '../../main/components/errors.js';
import { readComponentFile } from '../../shared/components/index.js';
import type { DesignSource, GroupInfo, Layer, Value } from '../../shared/components/index.js';
import { createFigmaMock, useFigmaMock } from '../support/figmaMock.js';
import { byAddress, runFile, stampOf } from './support.js';

type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const errors = (file: ReturnType<typeof readComponentFile>) =>
  file.problems.filter((problem) => problem.severity === 'error').map((problem) => problem.message);

// ---------------------------------------------------------------------------
// A design system that only says which keys a group has
// ---------------------------------------------------------------------------

/** `g` is a group with these keys (and composite borders); `tok` is a token; nothing else exists. */
const keysOf = (keys: string[], borders?: GroupInfo['borders']): DesignSource => ({
  contexts: () => undefined,
  partsOf: () => [],
  group: (path) => (path === 'g' ? { keys, ...(borders ? { borders } : {}) } : path === 'tok' ? 'token' : undefined),
});

type Kind = 'FRAME' | 'SLOT' | 'TEXT';

/** A component with one layer of the kind, naming the group `g`, under a root. */
function layerOf(kind: Kind, layout: string, extra = '') {
  const body = layout === 'GRID' ? 'gridRowSizes { FLEX; }\n        gridColumnSizes { FLEX; }\n' : '';
  const line =
    kind === 'TEXT'
      ? `TEXT Layer tokens="{g}" characters="Hello" ${extra}`
      : `${kind} ${kind === 'SLOT' ? 'Body' : 'Layer'} tokens="{g}" layoutMode=${layout} ${extra} {\n        ${body}    }`;
  return `component Thing
${kind === 'SLOT' ? 'properties {\n    SLOT Body\n}\n' : ''}FRAME Root layoutMode=VERTICAL {
    ${line}
}
`;
}

const token = (path: string): Value => ({ kind: 'token', path });
const PAINTS = ['fills', 'strokes'];

/** The fields a layer should have, from field to the key of `g` that fills it. */
const bound = (map: Record<string, string>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(map).map(([field, path]) => [field, PAINTS.includes(field) ? [token(path)] : token(path)]));

/** The layer the first member has under its root, and the file it came from. */
function infer(kind: Kind, layout: string, keys: string[], borders?: GroupInfo['borders'], extra = '') {
  const file = readComponentFile(layerOf(kind, layout, extra), keysOf(keys, borders));
  assert.deepEqual(errors(file), []);
  const layer = file.members[0].tree.children[0] as Layer;
  return {
    file,
    layer,
    fields: Object.fromEntries(
      Object.entries(layer.fields).filter(
        ([field]) => !['layoutMode', 'characters', 'gridRowSizes', 'gridColumnSizes'].includes(field) && !extra.includes(field),
      ),
    ),
  };
}

describe('the table: which fields a CSS key fills', () => {
  const FLOW = ['HORIZONTAL', 'VERTICAL'];
  // key, the kinds it applies to, the layouts it applies in, and the fields it fills (field: path).
  const rows: [string, Kind[], string[], Record<string, string>][] = [
    ['backgroundColor', ['FRAME', 'SLOT'], ['NONE'], { fills: 'g.backgroundColor' }],
    ['color', ['TEXT'], ['NONE'], { fills: 'g.color' }],
    ['borderColor', ['FRAME', 'SLOT'], ['NONE'], { strokes: 'g.borderColor' }],
    ['borderWidth', ['FRAME', 'SLOT'], ['NONE'], { strokeWeight: 'g.borderWidth' }],
    ['borderTopWidth', ['FRAME', 'SLOT'], ['NONE'], { strokeTopWeight: 'g.borderTopWidth' }],
    ['borderRightWidth', ['FRAME', 'SLOT'], ['NONE'], { strokeRightWeight: 'g.borderRightWidth' }],
    ['borderBottomWidth', ['FRAME', 'SLOT'], ['NONE'], { strokeBottomWeight: 'g.borderBottomWidth' }],
    ['borderLeftWidth', ['FRAME', 'SLOT'], ['NONE'], { strokeLeftWeight: 'g.borderLeftWidth' }],
    ['borderRadius', ['FRAME', 'SLOT'], ['NONE'], { cornerRadius: 'g.borderRadius' }],
    ['borderTopLeftRadius', ['FRAME', 'SLOT'], ['NONE'], { topLeftRadius: 'g.borderTopLeftRadius' }],
    ['borderTopRightRadius', ['FRAME', 'SLOT'], ['NONE'], { topRightRadius: 'g.borderTopRightRadius' }],
    ['borderBottomRightRadius', ['FRAME', 'SLOT'], ['NONE'], { bottomRightRadius: 'g.borderBottomRightRadius' }],
    ['borderBottomLeftRadius', ['FRAME', 'SLOT'], ['NONE'], { bottomLeftRadius: 'g.borderBottomLeftRadius' }],
    [
      'padding',
      ['FRAME', 'SLOT'],
      ['NONE'],
      { paddingTop: 'g.padding', paddingRight: 'g.padding', paddingBottom: 'g.padding', paddingLeft: 'g.padding' },
    ],
    ['paddingBlock', ['FRAME', 'SLOT'], ['NONE'], { paddingTop: 'g.paddingBlock', paddingBottom: 'g.paddingBlock' }],
    ['paddingInline', ['FRAME', 'SLOT'], ['NONE'], { paddingLeft: 'g.paddingInline', paddingRight: 'g.paddingInline' }],
    ['paddingTop', ['FRAME', 'SLOT'], ['NONE'], { paddingTop: 'g.paddingTop' }],
    ['paddingRight', ['FRAME', 'SLOT'], ['NONE'], { paddingRight: 'g.paddingRight' }],
    ['paddingBottom', ['FRAME', 'SLOT'], ['NONE'], { paddingBottom: 'g.paddingBottom' }],
    ['paddingLeft', ['FRAME', 'SLOT'], ['NONE'], { paddingLeft: 'g.paddingLeft' }],
    ['gap', ['FRAME', 'SLOT'], FLOW, { itemSpacing: 'g.gap' }],
    ['gap', ['FRAME'], ['GRID'], { gridRowGap: 'g.gap', gridColumnGap: 'g.gap' }],
    ['rowGap', ['FRAME'], ['GRID'], { gridRowGap: 'g.rowGap' }],
    ['columnGap', ['FRAME'], ['GRID'], { gridColumnGap: 'g.columnGap' }],
    ['width', ['FRAME', 'SLOT', 'TEXT'], ['NONE'], { width: 'g.width' }],
    ['height', ['FRAME', 'SLOT', 'TEXT'], ['NONE'], { height: 'g.height' }],
    ['minWidth', ['FRAME', 'SLOT', 'TEXT'], ['NONE'], { minWidth: 'g.minWidth' }],
    ['maxWidth', ['FRAME', 'SLOT', 'TEXT'], ['NONE'], { maxWidth: 'g.maxWidth' }],
    ['minHeight', ['FRAME', 'SLOT', 'TEXT'], ['NONE'], { minHeight: 'g.minHeight' }],
    ['maxHeight', ['FRAME', 'SLOT', 'TEXT'], ['NONE'], { maxHeight: 'g.maxHeight' }],
    ['opacity', ['FRAME', 'SLOT', 'TEXT'], ['NONE'], { opacity: 'g.opacity' }],
    ['font', ['TEXT'], ['NONE'], { textStyle: 'g.font' }],
  ];

  for (const [key, kinds, layouts, fields] of rows) {
    for (const kind of kinds) {
      for (const layout of kind === 'TEXT' ? ['NONE'] : layouts) {
        it(`${key} on a ${kind}${kind === 'TEXT' ? '' : ` with layoutMode ${layout}`} fills ${Object.keys(fields).join(', ')}`, () => {
          const { file, fields: got } = infer(kind, layout, [key]);
          assert.deepEqual(got, bound(fields));
          assert.equal(file.component?.notes, undefined, 'and says nothing');
        });
      }
    }
  }

  it('skips, into the notes and not as a warning, a key the table lacks for the layer’s kind', () => {
    const cases: [Kind, string, string][] = [
      ['FRAME', 'transition', '"transition" has no field on this layer in Figma, skipped'],
      ['FRAME', 'cursor', '"cursor" has no field on this layer in Figma, skipped'],
      ['TEXT', 'backgroundColor', '"backgroundColor" has no field on this layer in Figma, skipped'],
      ['TEXT', 'borderRadius', '"borderRadius" has no field on this layer in Figma, skipped'],
      ['TEXT', 'padding', '"padding" has no field on this layer in Figma, skipped'],
      ['FRAME', 'color', '"color" has no field on this layer in Figma, skipped'],
      ['FRAME', 'font', '"font" has no field on this layer in Figma, skipped'],
      ['TEXT', 'gap', '"gap" has no field on this layer in Figma, skipped'],
      ['FRAME', 'border', '"border" has no field on this layer in Figma, skipped'], // a plain token, not a composite
    ];
    for (const [kind, key, note] of cases) {
      const { file, fields } = infer(kind, 'NONE', [key]);
      assert.deepEqual(fields, {}, `${kind} ${key}`);
      assert.deepEqual(file.component?.notes, [`${kind} "Layer" tokens="{g}": ${note}`]);
      assert.equal(file.component?.warnings, undefined);
      assert.deepEqual(file.problems, []);
    }
  });

  it('skips a gap where the layout makes it meaningless, and says what the layout needs', () => {
    const none = infer('FRAME', 'NONE', ['gap', 'rowGap', 'columnGap']);
    assert.deepEqual(none.fields, {});
    assert.deepEqual(none.file.component?.notes, [
      'FRAME "Layer" tokens="{g}": "gap" needs a layer whose layoutMode is HORIZONTAL, VERTICAL or GRID, skipped',
      'FRAME "Layer" tokens="{g}": "rowGap" needs a GRID layer, skipped',
      'FRAME "Layer" tokens="{g}": "columnGap" needs a GRID layer, skipped',
    ]);

    const flow = infer('FRAME', 'HORIZONTAL', ['gap', 'rowGap', 'columnGap']);
    assert.deepEqual(flow.fields, bound({ itemSpacing: 'g.gap' }));
    assert.deepEqual(flow.file.component?.notes, [
      'FRAME "Layer" tokens="{g}": "rowGap" needs a GRID layer, skipped',
      'FRAME "Layer" tokens="{g}": "columnGap" needs a GRID layer, skipped',
    ]);

    const grid = infer('FRAME', 'GRID', ['gap', 'rowGap', 'columnGap']);
    assert.deepEqual(
      grid.fields,
      bound({ gridRowGap: 'g.rowGap', gridColumnGap: 'g.columnGap' }),
      'and a grid has no itemSpacing, which the layout checks would refuse',
    );
    assert.equal(grid.file.component?.notes, undefined);
  });

  it('reads the layout from the evaluated layer: a when that changes it changes where the gap goes, member by member', () => {
    const file = readComponentFile(
      `component Thing
properties {
    VARIANT Layout row none
}
guard bare { is (input)Layout none }
FRAME Root layoutMode=VERTICAL {
    FRAME Box tokens="{g}" layoutMode=HORIZONTAL {
        when bare layoutMode=NONE
    }
}
`,
      keysOf(['gap']),
    );
    assert.deepEqual(errors(file), []);
    const [row, none] = file.members.map((member) => (member.tree.children[0] as Layer).fields);
    assert.deepEqual(row.itemSpacing, token('g.gap'));
    assert.equal('itemSpacing' in none, false);
    assert.deepEqual(file.component?.notes, [
      'FRAME "Box" tokens="{g}": "gap" needs a layer whose layoutMode is HORIZONTAL, VERTICAL or GRID, skipped',
    ]);
  });

  it('leaves layout enums and shadows out: they are skipped like any key without a field', () => {
    const { file, fields } = infer('FRAME', 'NONE', ['flexDirection', 'justifyContent', 'alignItems', 'boxShadow']);
    assert.deepEqual(fields, {});
    assert.equal(file.component?.notes?.length, 4);
  });

  it('says a skipped key once per key and layer, however many members repeat it', () => {
    const file = readComponentFile(
      `component Thing
properties {
    VARIANT Size small large
}
FRAME Root layoutMode=VERTICAL tokens="{g}"
`,
      keysOf(['transition', 'cursor']),
    );
    assert.equal(file.members.length, 2);
    assert.deepEqual(file.component?.notes, [
      'FRAME "Root" tokens="{g}": "transition" has no field on this layer in Figma, skipped',
      'FRAME "Root" tokens="{g}": "cursor" has no field on this layer in Figma, skipped',
    ]);
  });

  it('takes the inferred field off the layer: the engine is given only fields that are Figma’s', () => {
    const { layer } = infer('FRAME', 'NONE', ['backgroundColor']);
    assert.equal('tokens' in layer.fields, false);
    assert.equal(layer.fieldLoc?.fills?.line, 3, 'and a problem with an inferred field points at the line that named the group');
  });
});

describe('what wins when two writers want one field', () => {
  const key = (keys: string[], extra = '', borders?: GroupInfo['borders']) => infer('FRAME', 'NONE', keys, borders, extra).layer.fields;

  it('a field the file writes on the layer wins over the group', () => {
    const fields = key(['borderRadius', 'padding'], 'cornerRadius=(literal)3 paddingTop=(literal)1');
    assert.deepEqual(fields.cornerRadius, { kind: 'literal', value: 3 });
    assert.deepEqual(fields.paddingTop, { kind: 'literal', value: 1 });
    assert.deepEqual(fields.paddingBottom, token('g.padding'), 'and the group fills only what the layer does not have');
  });

  it('a field the file writes as a child node wins too', () => {
    const file = readComponentFile(
      `component Thing
FRAME Root layoutMode=VERTICAL tokens="{g}" {
    fills "{other.fill}"
}
`,
      keysOf(['backgroundColor']),
    );
    assert.deepEqual(errors(file), []);
    assert.deepEqual(file.members[0].tree.fields.fills, [token('other.fill')]);
  });

  it('a when wins over the group, member by member', () => {
    const file = readComponentFile(
      `component Thing
properties {
    VARIANT State rest hover
}
guard hovered { is (input)State hover }
FRAME Root layoutMode=VERTICAL tokens="{g}" {
    when hovered cornerRadius=(literal)0 {
        fills "{other.fill}"
    }
}
`,
      keysOf(['backgroundColor', 'borderRadius', 'opacity']),
    );
    assert.deepEqual(errors(file), []);
    const [rest, hover] = file.members.map((member) => member.tree.fields);
    assert.deepEqual(rest.fills, [token('g.backgroundColor')]);
    assert.deepEqual(rest.cornerRadius, token('g.borderRadius'));
    assert.deepEqual(hover.fills, [token('other.fill')], 'the hovered member keeps what the when wrote');
    assert.deepEqual(hover.cornerRadius, { kind: 'literal', value: 0 });
    assert.deepEqual(hover.opacity, token('g.opacity'), 'and takes the group’s for what the when left');
  });

  it('the more specific key wins for padding, whatever the order of the document', () => {
    for (const keys of [
      ['padding', 'paddingBlock', 'paddingTop'],
      ['paddingTop', 'paddingBlock', 'padding'],
      ['paddingBlock', 'paddingTop', 'padding'],
    ]) {
      const fields = key(keys);
      assert.deepEqual(fields.paddingTop, token('g.paddingTop'), keys.join());
      assert.deepEqual(fields.paddingBottom, token('g.paddingBlock'), keys.join());
      assert.deepEqual(fields.paddingLeft, token('g.padding'), keys.join());
      assert.deepEqual(fields.paddingRight, token('g.padding'), keys.join());
    }
    const inline = key(['padding', 'paddingInline', 'paddingLeft']);
    assert.deepEqual(
      [inline.paddingLeft, inline.paddingRight, inline.paddingTop],
      [token('g.paddingLeft'), token('g.paddingInline'), token('g.padding')],
    );
  });

  it('borderColor and borderWidth win over a composite border, and borderTopWidth over borderWidth', () => {
    const border = { border: { color: 'surface.edge', width: 'thin' } };
    for (const keys of [
      ['border', 'borderColor', 'borderWidth', 'borderTopWidth'],
      ['borderTopWidth', 'borderWidth', 'borderColor', 'border'],
    ]) {
      const fields = key(keys, '', border);
      assert.deepEqual(fields.strokes, [token('g.borderColor')], keys.join());
      assert.deepEqual(fields.strokeWeight, token('g.borderWidth'), keys.join());
      assert.deepEqual(fields.strokeTopWeight, token('g.borderTopWidth'), keys.join());
    }
    const alone = key(['border'], '', border);
    assert.deepEqual(alone.strokes, [token('surface.edge')], 'the border’s own members bind when nothing is more specific');
    assert.deepEqual(alone.strokeWeight, token('thin'));
  });

  it('rowGap and columnGap win over gap in a grid', () => {
    const { fields } = infer('FRAME', 'GRID', ['gap', 'columnGap']);
    assert.deepEqual(fields, bound({ gridRowGap: 'g.gap', gridColumnGap: 'g.columnGap' }));
  });
});

describe('refusals', () => {
  const read = (text: string, source: DesignSource | undefined = keysOf(['backgroundColor'])) => errors(readComponentFile(text, source));

  it('refuses tokens on an INSTANCE, which has no overrides in this design', () => {
    const found = read(`component Thing
properties {
    INSTANCE_SWAP Icon default=Glyph
}
FRAME Root layoutMode=VERTICAL {
    INSTANCE Icon tokens="{g}" component=(property)Icon
}
`);
    assert.deepEqual(found, [
      'tokens does not apply to an INSTANCE layer, in INSTANCE "Icon": an instance’s overrides are not in this design'.replace('’', "'"),
    ]);
  });

  it('refuses a path that is a token, not a group', () => {
    const file = readComponentFile(layerOf('FRAME', 'NONE').replace('{g}', '{tok}'), keysOf([]));
    assert.deepEqual(errors(file), [
      'tokens="{tok}" names a token, not a group: a layer takes its bindings from the tokens inside a group',
    ]);
    assert.equal(file.problems[0].line, 3, 'at the line that wrote it');
    assert.deepEqual(file.members, []);
  });

  it('refuses a path that names nothing', () => {
    assert.deepEqual(read(layerOf('FRAME', 'NONE').replace('{g}', '{nowhere}')), [
      'tokens="{nowhere}" names no token and no group of the design system',
    ]);
  });

  it('refuses a value that is not a reference to a group, in quotes', () => {
    assert.match(
      read(layerOf('FRAME', 'NONE').replace('"{g}"', '"g"'))[0],
      /"tokens" takes a token reference naming a group, such as "\{button\}", not "g"/,
    );
    assert.match(read(layerOf('FRAME', 'NONE').replace('"{g}"', '(literal)3'))[0], /"tokens" takes a token reference naming a group/);
  });

  it('says what to give when no design system is loaded, at the line that named the group', () => {
    const file = readComponentFile(layerOf('FRAME', 'NONE'));
    assert.match(
      errors(file)[0],
      /^tokens="\{g\}" takes its bindings from the tokens it names, and no design system is loaded; load its resolver document in the plugin, or pass it to the command line$/,
    );
    assert.equal(file.problems[0].line, 3);
  });

  it('is not defeated by a source that cannot describe a group', () => {
    const blind: DesignSource = { contexts: () => undefined, partsOf: () => [] };
    assert.match(read(layerOf('FRAME', 'NONE'), blind)[0], /no design system is loaded/);
  });

  it('still names a group written inside a when, in the member it belongs to', () => {
    const found = read(`component Thing
properties {
    VARIANT State rest hover
}
guard hovered { is (input)State hover }
FRAME Root layoutMode=VERTICAL {
    when hovered tokens="{nowhere}"
}
`);
    assert.deepEqual(found, ['tokens="{nowhere}" names no token and no group of the design system']);
  });
});

// ---------------------------------------------------------------------------
// A design system in the structured shapes
// ---------------------------------------------------------------------------

const px = (value: number) => ({ value, unit: 'px' });
const srgb = (...components: number[]) => ({ colorSpace: 'srgb', components });
/**
 * - `button`: a CSS-keyed group, with a composite `border` whose colour is a reference and whose width is
 *   a literal, a key (`transition`) Figma has no field for, a subgroup `label` that is not read, and a
 *   fill that has a hover part: the parts vocabulary has the axis `pointer`.
 * - `outline`: a composite border whose colour is a literal and whose width is a reference.
 * - `dashed`: a composite border whose style is a dash pattern.
 * - `button.label`: the group a text names, with a colour and a typography token.
 */
const DOCUMENT = {
  version: '2025-11-01',
  name: 'Demo',
  sets: {
    base: {
      sources: [
        {
          surface: { edge: { $type: 'color', $value: srgb(0.1, 0.1, 0.1) } },
          thin: { $type: 'dimension', $value: px(1) },
          button: {
            $extensions: { 'com.toghen': { css: { parts: { pointer: { hover: ':hover' } } } } },
            backgroundColor: { $type: 'color', $value: srgb(0.9, 0.9, 0.9) },
            hover: { backgroundColor: { $type: 'color', $value: srgb(0.8, 0.8, 0.8) } },
            borderRadius: { $type: 'dimension', $value: px(6) },
            paddingBlock: { $type: 'dimension', $value: px(8) },
            gap: { $type: 'dimension', $value: px(4) },
            transition: { $type: 'duration', $value: { value: 100, unit: 'ms' } },
            border: { $type: 'border', $value: { color: '{surface.edge}', width: px(2), style: 'solid' } },
            label: {
              color: { $type: 'color', $value: srgb(0, 0, 0) },
              font: {
                $type: 'typography',
                $value: { fontFamily: ['Inter', 'sans-serif'], fontSize: px(16), fontWeight: 500, lineHeight: 1.5, letterSpacing: px(0) },
              },
            },
          },
          outline: { border: { $type: 'border', $value: { color: srgb(1, 0, 0), width: '{thin}', style: 'solid' } } },
          dashed: {
            border: {
              $type: 'border',
              $value: { color: '{surface.edge}', width: px(1), style: { dashArray: [px(2), px(1)], lineCap: 'round' } },
            },
          },
        },
      ],
    },
  },
  resolutionOrder: [{ $ref: '#/sets/base' }],
} as unknown as ResolverDocument;

const design = designSourceOf(new Resolver(DOCUMENT));

describe('the design system answers for a group', () => {
  it('gives the tokens one level down, and a composite border’s members', () => {
    const group = design.group?.('button') as GroupInfo;
    assert.deepEqual(group.keys, ['backgroundColor', 'borderRadius', 'paddingBlock', 'gap', 'transition', 'border']);
    assert.deepEqual(
      group.borders,
      { border: { color: 'surface.edge' } },
      'the colour is a reference to a token; the width is a literal and is not here',
    );
  });

  it('does not read a subgroup as a key of its parent, and reads it as a group of its own', () => {
    assert.deepEqual((design.group?.('button.label') as GroupInfo).keys, ['color', 'font']);
  });

  it('says a path is a token, and that another names nothing', () => {
    assert.equal(design.group?.('button.gap'), 'token');
    assert.equal(design.group?.('nowhere'), undefined);
  });

  it('marks a border whose style is not solid, in the structured shape of a dash pattern', () => {
    assert.deepEqual(design.group?.('dashed'), { keys: ['border'], borders: { border: { color: 'surface.edge', unsolid: true } } });
    assert.deepEqual(design.group?.('outline'), { keys: ['border'], borders: { border: { width: 'thin' } } });
  });
});

describe('inferring from a real design system', () => {
  const read = (text: string) => readComponentFile(text, design);

  it('binds a text from the group it names: a colour to its fills, a typography token to its text style', () => {
    const file = read(`component Thing
FRAME Root layoutMode=VERTICAL {
    TEXT Caption tokens="{button.label}" characters="Save"
}
`);
    assert.deepEqual(errors(file), []);
    assert.deepEqual((file.members[0].tree.children[0] as Layer).fields, {
      characters: { kind: 'plain', value: 'Save' },
      fills: [token('button.label.color')],
      textStyle: token('button.label.font'),
    });
  });

  it('binds a composite border’s members that are references, and reports the literal one', () => {
    const file = read(`component Thing
FRAME Root layoutMode=VERTICAL tokens="{button}"
`);
    assert.deepEqual(errors(file), []);
    const fields = file.members[0].tree.fields;
    assert.deepEqual(fields.strokes, [token('surface.edge')], 'the referenced token’s variable, not the border’s own');
    assert.equal('strokeWeight' in fields, false, 'a literal width has no variable and is not written');
    assert.deepEqual(file.component?.warnings, [
      'FRAME "Root" tokens="{button}": the width of "border" is a literal, which has no variable to bind, so it was left out',
    ]);
  });

  it('reports the literal colour of another border, and binds its width reference', () => {
    const file = read(`component Thing
FRAME Root layoutMode=VERTICAL tokens="{outline}"
`);
    const fields = file.members[0].tree.fields;
    assert.deepEqual(fields.strokeWeight, token('thin'));
    assert.equal('strokes' in fields, false);
    assert.deepEqual(file.component?.warnings, [
      'FRAME "Root" tokens="{outline}": the color of "border" is a literal, which has no variable to bind, so it was left out',
    ]);
  });

  it('refuses a border whose style is not solid, at the line that named the group', () => {
    const file = read(`component Thing
FRAME Root layoutMode=VERTICAL tokens="{dashed}"
`);
    assert.deepEqual(errors(file), [
      'tokens="{dashed}": the border "dashed.border" has a style other than solid, and Figma\'s dash pattern is not in this design; it cannot be bound',
    ]);
    assert.equal(file.problems[0].line, 2);
    assert.deepEqual(file.members, []);
  });

  it('says the keys Figma has no field for in the notes, and not as a warning', () => {
    const file = read(`component Thing
FRAME Root layoutMode=HORIZONTAL tokens="{button}"
`);
    assert.deepEqual(file.component?.notes, ['FRAME "Root" tokens="{button}": "transition" has no field on this layer in Figma, skipped']);
    assert.deepEqual(file.problems, []);
  });

  describe('the component line’s group', () => {
    const file = read(`component Button tokens="{button}"
FRAME Button layoutMode=HORIZONTAL {
    FRAME Inner layoutMode=VERTICAL
}
`);

    it('applies to the root frame, and not to the layers under it', () => {
      assert.deepEqual(errors(file), []);
      const [rest] = file.members;
      assert.deepEqual(rest.tree.fields.fills, [token('button.backgroundColor')]);
      assert.deepEqual(rest.tree.fields.cornerRadius, token('button.borderRadius'));
      assert.deepEqual(rest.tree.fields.itemSpacing, token('button.gap'), 'the root is a flow');
      assert.deepEqual(
        [rest.tree.fields.paddingTop, rest.tree.fields.paddingBottom, rest.tree.fields.paddingLeft],
        [token('button.paddingBlock'), token('button.paddingBlock'), undefined],
      );
      assert.deepEqual((rest.tree.children[0] as Layer).fields, { layoutMode: { kind: 'plain', value: 'VERTICAL' } });
    });

    it('gets the same fields in every part, which pins the mode and so changes what the bound variable reads', () => {
      assert.deepEqual(
        file.members.map((member) => member.name),
        ['pointer=rest', 'pointer=hover'],
      );
      assert.deepEqual(file.members[1].tree.fields.fills, [token('button.backgroundColor')]);
      assert.deepEqual(file.members[1].tree.fields.modes, { pointer: 'hover' });
    });

    it('is replaced on the root by a group the root names itself', () => {
      const own = read(`component Button tokens="{button}"
FRAME Button layoutMode=HORIZONTAL tokens="{outline}"
`);
      assert.deepEqual(own.members[0].tree.fields.strokeWeight, token('thin'));
      assert.equal('fills' in own.members[0].tree.fields, false);
    });

    it('binds nothing when it names a token, as the axes already read it', () => {
      const token_ = read('component Button tokens="{button.gap}"\nFRAME Button layoutMode=HORIZONTAL\n');
      assert.deepEqual(errors(token_), []);
      assert.deepEqual(token_.members[0].tree.fields, { layoutMode: { kind: 'plain', value: 'HORIZONTAL' } });
    });

    it('refuses a border that is not solid there too', () => {
      assert.match(
        errors(read('component Button tokens="{dashed}"\nFRAME Button layoutMode=HORIZONTAL\n'))[0],
        /the border "dashed.border" has a style other than solid/,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

const rgba = (r: number, g: number, b: number) => ({ r, g, b, a: 1 });

/** What variable sync leaves for the button's tokens, and the label's text style. */
const buttonMock = () =>
  createFigmaMock()
    .withFonts([{ family: 'Inter', style: 'Regular' }])
    .withCollection('pointer', ['rest', 'hover'])
    .withCollection('Demo', ['default'])
    .withVariable('Demo', 'button/backgroundColor', 'COLOR', { default: rgba(0.9, 0.9, 0.9) })
    .withVariable('Demo', 'button/borderRadius', 'FLOAT', { default: 6 })
    .withVariable('Demo', 'button/paddingBlock', 'FLOAT', { default: 8 })
    .withVariable('Demo', 'button/gap', 'FLOAT', { default: 4 })
    .withVariable('Demo', 'surface/edge', 'COLOR', { default: rgba(0.1, 0.1, 0.1) })
    .withVariable('Demo', 'button/label/color', 'COLOR', { default: rgba(0, 0, 0) })
    .withStyle('TEXT', 'button/label/font', { fontName: { family: 'Inter', style: 'Regular' } });

const BUTTON = `component Button tokens="{button}"
properties {
    TEXT Label default="Save"
}
FRAME Button layoutMode=HORIZONTAL layoutSizingHorizontal=HUG layoutSizingVertical=HUG {
    TEXT Caption tokens="{button.label}" characters=(property)Label
}
`;

describe('a component with inferred bindings, built against the file', () => {
  useFigmaMock();

  it('binds the root and the text to the variables and the style the group names, and writes no field of the layer’s own', async () => {
    const mock = buttonMock().install();
    const file = readComponentFile(BUTTON, design);
    assert.deepEqual(errors(file), []);
    const report = await run({ component: file.component!, members: file.members });

    const set = mock.node(report.setId!) as Node;
    assert.deepEqual(
      set.children.map((member: Node) => member.name),
      ['pointer=rest', 'pointer=hover'],
    );
    const variable = (name: string) => mock.variable('Demo', name)!.id;
    for (const member of set.children) {
      const layers = byAddress(member);
      const root = layers.get('Button')!;
      assert.equal(root.fills[0].boundVariables.color.id, variable('button/backgroundColor'));
      // Figma reports a bound radius on its four corners.
      assert.equal(root.boundVariables.bottomRightRadius.id, variable('button/borderRadius'));
      assert.equal(root.boundVariables.itemSpacing.id, variable('button/gap'));
      assert.equal(root.boundVariables.paddingTop.id, variable('button/paddingBlock'));
      assert.equal(root.strokes[0].boundVariables.color.id, variable('surface/edge'));
      const caption = layers.get('Caption')!;
      assert.equal(caption.fills[0].boundVariables.color.id, variable('button/label/color'));
      assert.equal(caption.textStyleId, mock.styles('TEXT').find((s) => s.name === 'button/label/font')!.id);
      assert.equal(stampOf(root)!.receipt.tokens, undefined, 'and the receipt holds fields that are Figma’s');
    }
    const hover = mock.collection('pointer')!;
    assert.deepEqual((set.children[1] as Node).explicitVariableModes, { [hover.id]: hover.modes[1].modeId });
  });

  it('stops, as any reference does, when the variable it infers does not exist', async () => {
    const mock = createFigmaMock().withCollection('pointer', ['rest', 'hover']).withCollection('Demo', ['default']).install();
    const before = mock.writes().length;
    const file = readComponentFile(BUTTON, design);
    await assert.rejects(run({ component: file.component!, members: file.members }), (error: unknown) => {
      assert.ok(error instanceof ComponentRunError);
      assert.ok(
        error.problems.some((problem) => /token \{button\.backgroundColor\} \(line \d+\) names no variable/.test(problem)),
        error.problems.join('\n'),
      );
      return true;
    });
    assert.equal(mock.writes().length, before);
  });

  it('stops when a variable it infers is of the wrong type for the field', async () => {
    // a radius token that is a colour variable
    const wrong = createFigmaMock()
      .withCollection('pointer', ['rest', 'hover'])
      .withCollection('Demo', ['default'])
      .withVariable('Demo', 'button/borderRadius', 'COLOR', { default: rgba(0, 0, 0) })
      .install();
    const file = readComponentFile('component Thing\nFRAME Root layoutMode=VERTICAL tokens="{button}"\n', design);
    await assert.rejects(
      run({ component: file.component!, members: file.members }),
      /token \{button\.borderRadius\}.* is a COLOR variable, but a dimension or opacity needs a FLOAT one/,
    );
    assert.equal(wrong.writes().length, 0);
  });

  it('stops when a name matches in two collections', async () => {
    createFigmaMock()
      .withCollection('pointer', ['rest', 'hover'])
      .withCollection('Demo', ['default'])
      .withCollection('Other', ['default'])
      .withVariable('Demo', 'button/borderRadius', 'FLOAT', { default: 6 })
      .withVariable('Other', 'button/borderRadius', 'FLOAT', { default: 6 })
      .install();
    const file = readComponentFile('component Thing\nFRAME Root layoutMode=VERTICAL tokens="{button}"\n', design);
    await assert.rejects(run({ component: file.component!, members: file.members }), /token \{button\.borderRadius\}.* is ambiguous/);
  });

  it('reports the notes and the warnings of the reader in the run’s report, from the component the plugin read', async () => {
    const mock = buttonMock().install();
    resetState();
    await LOAD_DOCUMENT(oneFile(JSON.stringify(DOCUMENT), 'demo.resolver.json'));
    const report = await runFile(mock, BUTTON, { dryRun: true });

    assert.ok(
      report.notes.includes('FRAME "Button" tokens="{button}": "transition" has no field on this layer in Figma, skipped'),
      report.notes.join('\n'),
    );
    assert.deepEqual(report.warnings, [
      'FRAME "Button" tokens="{button}": the width of "border" is a literal, which has no variable to bind, so it was left out',
    ]);
  });
});

describe('the plugin reads the groups a file names from the design system it has loaded', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  it('stops, naming the line, when the file names a group and no design system is loaded', async () => {
    const mock = buttonMock().install();
    await assert.rejects(
      runFile(mock, BUTTON, {}, 'ui/button.component.kdl'),
      /ui\/button\.component\.kdl:1:1 component tokens="\{button\}" takes its axes from the tokens it names/,
    );
  });

  it('refuses the same file in the check, naming the line and the file', async () => {
    const mock = buttonMock().install();
    await CHECK_COMPONENTS({ files: [{ fileName: 'ui/button.component.kdl', text: BUTTON }] });
    const [message] = mock.calls('ui.postMessage').map((call) => call.args[0] as { type: string; payload: { problems: string[] } });
    assert.equal(message.type, 'ERROR');
    assert.match(message.payload.problems[0], /^ui\/button\.component\.kdl:1:1 component tokens="\{button\}" takes its axes/);
  });

  it('builds, in Figma, the bindings the plugin inferred from the loaded design system', async () => {
    const mock = buttonMock().install();
    await LOAD_DOCUMENT(oneFile(JSON.stringify(DOCUMENT), 'demo.resolver.json'));
    const report = await runFile(mock, BUTTON, {}, 'ui/button.component.kdl');

    const set = mock.node(report.setId!) as Node;
    const root = byAddress(set.children[0]).get('Button')!;
    assert.equal(root.fills[0].boundVariables.color.id, mock.variable('Demo', 'button/backgroundColor')!.id);
    assert.equal(root.boundVariables.bottomRightRadius.id, mock.variable('Demo', 'button/borderRadius')!.id);
    assert.equal(
      byAddress(set.children[0]).get('Caption')!.textStyleId,
      mock.styles('TEXT').find((s) => s.name === 'button/label/font')!.id,
    );
    assert.ok(report.notes.some((note: string) => note.includes('"transition" has no field')));
    assert.equal(report.warnings.length, 1);
  });
});
