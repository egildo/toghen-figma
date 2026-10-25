import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FIELDS } from '../../shared/components/fields.js';
import { scopesOfField } from '../../shared/components/groups.js';
import { BOUND_BY_PARTS, PAINT_PROPERTIES } from '../../main/utils/boundVariables.js';

// The roster's Bind and Token columns (`.reference/figma/property_roster.md`), for every field the table has:
// field, token type, call, the name the call takes, variable type, scope on a frame, scope on a text, parts.
type Row = [string, string | string[], string, string, string, string[], string[], string[]?];
const CORNERS = ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'];
const SIDES = ['strokeTopWeight', 'strokeRightWeight', 'strokeBottomWeight', 'strokeLeftWeight'];
const same = (field: string, scope: string, parts?: string[], type = 'dimension'): Row => [
  field,
  type,
  'field',
  field,
  'FLOAT',
  [scope],
  [scope],
  parts,
];

const BOUND: Row[] = [
  same('opacity', 'OPACITY', undefined, 'number'),
  ...['width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight'].map((field) => same(field, 'WIDTH_HEIGHT')),
  ...['itemSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'gridRowGap', 'gridColumnGap'].map((field) =>
    same(field, 'GAP'),
  ),
  same('cornerRadius', 'CORNER_RADIUS', CORNERS),
  ...CORNERS.map((field) => same(field, 'CORNER_RADIUS')),
  same('strokeWeight', 'STROKE_FLOAT', SIDES),
  ...SIDES.map((field) => same(field, 'STROKE_FLOAT')),
  ['fills', ['color', 'gradient'], 'paint', 'color', 'COLOR', ['FRAME_FILL', 'SHAPE_FILL'], ['TEXT_FILL']],
  ['strokes', ['color', 'gradient'], 'paint', 'color', 'COLOR', ['STROKE_COLOR'], ['STROKE_COLOR']],
  // Wrap, grid child, position, appearance and strokes.
  same('counterAxisSpacing', 'GAP'),
];

/** Fields Figma cannot bind (measured `Unknown field`) that take a token, written as its value, by the token type. */
const VALUES: Record<string, string> = { x: 'dimension', y: 'dimension', cornerSmoothing: 'number', dashPattern: 'strokeStyle' };

// Unit 4: effects and layout grids bind by parts; the row names the case the parts share.
BOUND.push(
  ['effects', ['shadow', 'dimension'], 'effect', 'radius', 'FLOAT', ['EFFECT_FLOAT'], ['EFFECT_FLOAT']],
  ['layoutGrids', ['number', 'dimension', 'color'], 'grid', 'count', 'FLOAT', [], []],
);

/** Fields that take a style, by the token type the style is made from. */
const STYLES: Record<string, string> = { textStyle: 'typography', effectStyle: 'shadow' };

/** Fields that take no token today: enums, structures, a component. */
const NONE = [
  'modes',
  'grid',
  'layoutSizingHorizontal',
  'layoutSizingVertical',
  'rotation',
  'layoutMode',
  'primaryAxisAlignItems',
  'counterAxisAlignItems',
  'gridRowSizes',
  'gridColumnSizes',
  'clipsContent',
  'textAutoResize',
  'component',
  'isExposedInstance',
  'tokens',
  'set',
  // Wrap, grid child, position, appearance and strokes.
  'layoutWrap',
  'counterAxisAlignContent',
  'gridChildHorizontalAlign',
  'gridChildVerticalAlign',
  'layoutPositioning',
  'constraints',
  'blendMode',
  'strokeAlign',
  'strokeCap',
  'strokeJoin',
];

// Text fields, `visible` and `characters`: field, token types, call, variable type, scopes (on a text), or no binding.
type TextRow = [string, string[], ('field' | 'text')?, string?, string[]?];
const TEXT_ROWS: TextRow[] = [
  ['visible', ['boolean'], 'field', 'BOOLEAN', []],
  ['characters', ['string'], 'field', 'STRING', ['TEXT_CONTENT']],
  ['fontFamily', ['fontFamily', 'string'], 'text', 'STRING', ['FONT_FAMILY']],
  ['fontStyle', ['string'], 'text', 'STRING', ['FONT_STYLE']],
  ['fontWeight', ['fontWeight', 'number'], 'text', 'FLOAT', ['FONT_WEIGHT']],
  ['fontSize', ['dimension'], 'text', 'FLOAT', ['FONT_SIZE']],
  ['lineHeight', ['dimension', 'number'], 'text', 'FLOAT', ['LINE_HEIGHT']],
  ['letterSpacing', ['dimension', 'letterSpacing'], 'text', 'FLOAT', ['LETTER_SPACING']],
  ['paragraphSpacing', ['dimension'], 'text', 'FLOAT', ['PARAGRAPH_SPACING']],
  ['paragraphIndent', ['dimension'], 'text', 'FLOAT', ['PARAGRAPH_INDENT']],
  ['listSpacing', ['dimension']],
  ['maxLines', ['number']],
];
/** The text enums: plain, no token. */
const TEXT_ENUMS = ['textAlignHorizontal', 'textAlignVertical', 'textCase', 'textDecoration', 'textTruncation', 'leadingTrim'];

describe('the field table holds the roster', () => {
  it('names every field once, in one of the lists', () => {
    const listed = [
      ...BOUND.map(([field]) => field),
      ...Object.keys(STYLES),
      ...Object.keys(VALUES),
      ...NONE,
      ...TEXT_ROWS.map(([field]) => field),
      ...TEXT_ENUMS,
    ];
    assert.deepEqual([...listed].sort(), Object.keys(FIELDS).sort());
  });

  for (const [field, type, call, name, variable, frame, text, parts] of BOUND) {
    it(`binds ${field}`, () => {
      assert.deepEqual(FIELDS[field].token?.types, [type].flat());
      const bind = FIELDS[field].token?.bind;
      assert.deepEqual([bind?.call, bind?.field, bind?.variable, bind?.parts], [call, name, variable, parts]);
      assert.deepEqual([scopesOfField(field, false), scopesOfField(field, true)], [frame, text]);
    });
  }

  it('gives a style field its token type and no binding', () => {
    for (const [field, type] of Object.entries(STYLES)) assert.deepEqual(FIELDS[field].token, { types: [type] });
  });

  it('gives a field Figma cannot bind its token type and no binding', () => {
    for (const [field, type] of Object.entries(VALUES)) assert.deepEqual(FIELDS[field].token, { types: [type] });
  });

  it('gives no token to the rest', () => {
    for (const field of [...NONE, ...TEXT_ENUMS]) assert.equal(FIELDS[field].token, undefined, field);
  });

  for (const [field, types, call, variable, scopes] of TEXT_ROWS) {
    it(`${call ? 'binds' : 'writes as a value'} ${field}`, () => {
      assert.deepEqual(FIELDS[field].token?.types, types);
      const bind = FIELDS[field].token?.bind;
      assert.deepEqual([bind?.call, bind?.field, bind?.variable], call ? [call, field, variable] : [undefined, undefined, undefined]);
      if (scopes) assert.deepEqual(scopesOfField(field, true), scopes);
    });
  }

  it('reads the parts and the paints from it', () => {
    assert.deepEqual(BOUND_BY_PARTS, { cornerRadius: CORNERS, strokeWeight: SIDES });
    assert.deepEqual(PAINT_PROPERTIES, { fills: 'fills[0].color', strokes: 'strokes[0].color' });
  });
});
