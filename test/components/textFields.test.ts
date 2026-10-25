/**
 * Text fields, and the bindings of `visible`, `characters` and instance properties: a text field is bound on the whole
 * text; a line height or letter spacing binds in pixels only, so one in another unit is written as its value (measured
 * §14); `maxLines` follows `textTruncation`; a text field beside `textStyle` is refused; a `boolean` or `string` token
 * binds `visible`, `characters`, an instance's property and a property's default.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LOAD_DOCUMENT } from '../../main/handlers/loadDocument.js';
import { resetState } from '../../main/runtimeState.js';
import { readComponentFile } from '../../shared/components/index.js';
import { createFigmaMock, useFigmaMock } from '../support/figmaMock.js';
import { oneFile } from '../support/oneFile.js';
import { byAddress, keyOfProperty, runFile } from './support.js';

type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const DOCUMENT = {
  version: '2025-11-01',
  name: 'Core',
  sets: {
    base: {
      sources: [
        {
          font: {
            body: { $type: 'fontFamily', $value: ['Inter', 'sans-serif'] },
            strong: { $type: 'string', $value: 'Bold' },
            heavy: { $type: 'fontWeight', $value: 700 },
            size: { $type: 'dimension', $value: { value: 14, unit: 'px' } },
            leading: { $type: 'number', $value: 1.5 },
            tight: { $type: 'dimension', $value: { value: 20, unit: 'px' } },
            tracking: { $type: 'letterSpacing', $value: { value: 0.02, unit: 'em' } },
            gap: { $type: 'dimension', $value: { value: 8, unit: 'px' } },
            lines: { $type: 'number', $value: 2 },
          },
          flag: { shown: { $type: 'boolean', $value: false } },
          copy: { title: { $type: 'string', $value: 'Hello' } },
        },
      ],
    },
  },
  modifiers: { scheme: { default: 'light', contexts: { light: [{}], dark: [{}] } } },
  resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/scheme' }],
};

/** The variables the sync would have made: a font stack's variable holds its first family. */
const mockOf = () =>
  createFigmaMock()
    .withFonts([
      { family: 'Inter', style: 'Regular' },
      { family: 'Inter', style: 'Bold' },
    ])
    .withCollection('Core', ['default'])
    .withVariable('Core', 'font/body', 'STRING', { default: 'Inter' })
    .withVariable('Core', 'font/strong', 'STRING', { default: 'Bold' })
    .withVariable('Core', 'font/heavy', 'FLOAT', { default: 700 })
    .withVariable('Core', 'font/size', 'FLOAT', { default: 14 })
    .withVariable('Core', 'font/leading', 'FLOAT', { default: 1.5 })
    .withVariable('Core', 'font/tight', 'FLOAT', { default: 20 })
    .withVariable('Core', 'font/gap', 'FLOAT', { default: 8 })
    .withVariable('Core', 'font/lines', 'FLOAT', { default: 2 })
    .withVariable('Core', 'flag/shown', 'BOOLEAN', { default: false })
    .withVariable('Core', 'copy/title', 'STRING', { default: 'Hello' })
    .withStyle('TEXT', 'text/label', { fontName: { family: 'Inter', style: 'Regular' } });

const LABEL = `component Label
FRAME Label layoutMode=HORIZONTAL {
    TEXT Text characters="Ready" fontFamily="{font.body}" fontStyle="{font.strong}" fontSize="{font.size}" lineHeight="{font.leading}" letterSpacing="{font.tracking}" paragraphSpacing="{font.gap}" textCase=UPPER textAlignHorizontal=CENTER textTruncation=ENDING maxLines="{font.lines}"
}
`;

const STACK_LINE = `"fontFamily" of "Label/Text": {font.body} is a font stack, and its variable holds the first family, "Inter"; "sans-serif" is not used`;
const LINE_HEIGHT_LINE = `"lineHeight" of "Label/Text": the token is written as its value in "light"; it will not follow the token until the next run`;
const LETTER_SPACING_LINE = `"letterSpacing" of "Label/Text": the token is written as its value in "light"; it will not follow the token until the next run`;
const MAX_LINES_LINE = `"maxLines" of "Label/Text": the token is written as its value in "light"; it will not follow the token until the next run`;

async function loaded() {
  const mock = mockOf().install();
  await LOAD_DOCUMENT(oneFile(JSON.stringify(DOCUMENT), 'core.resolver.json'));
  return mock;
}

const textOf = (mock: { node(id: string): unknown }, setId: string | undefined, address = 'Text'): Node =>
  byAddress((mock.node(setId!) as Node).children[0]).get(address)!;

describe('text fields', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  it('writes a doubled brace as a literal one: characters="{{font.size}}" is the text {font.size}, not the token', async () => {
    const mock = await loaded();
    const report = await runFile(
      mock,
      'component Label\nFRAME Label layoutMode=HORIZONTAL {\n    TEXT Text characters="{{font.size}} and {{" textStyle="{text.label}"\n}\n',
    );
    const text = textOf(mock, report.setId);
    assert.equal(text.characters, '{font.size} and {');
    assert.equal(text.boundVariables.characters, undefined, 'no token is bound');
  });

  it('binds the family of a fontFamily array, the style and a { value, unit } size on the whole text, and says the stack', async () => {
    const mock = await loaded();
    const report = await runFile(mock, LABEL);
    const text = textOf(mock, report.setId);

    assert.deepEqual(text.boundVariables.fontFamily, [{ type: 'VARIABLE_ALIAS', id: mock.variable('Core', 'font/body')!.id }]);
    assert.deepEqual(text.boundVariables.fontStyle, [{ type: 'VARIABLE_ALIAS', id: mock.variable('Core', 'font/strong')!.id }]);
    assert.deepEqual(text.boundVariables.fontSize, [{ type: 'VARIABLE_ALIAS', id: mock.variable('Core', 'font/size')!.id }]);
    assert.deepEqual(text.boundVariables.paragraphSpacing, [{ type: 'VARIABLE_ALIAS', id: mock.variable('Core', 'font/gap')!.id }]);
    assert.deepEqual(text.fontName, { family: 'Inter', style: 'Bold' });
    assert.equal(text.fontSize, 14);
    assert.ok(report.warnings.includes(STACK_LINE), report.warnings.join('\n'));
  });

  it('writes a unitless line height and an em letter spacing as PERCENT values, each with its line', async () => {
    const mock = await loaded();
    const report = await runFile(mock, LABEL);
    const text = textOf(mock, report.setId);

    assert.deepEqual(text.lineHeight, { unit: 'PERCENT', value: 150 });
    assert.deepEqual(text.letterSpacing, { unit: 'PERCENT', value: 2 });
    assert.equal(text.boundVariables.lineHeight, undefined);
    assert.equal(text.boundVariables.letterSpacing, undefined);
    assert.deepEqual([...report.warnings].sort(), [LETTER_SPACING_LINE, LINE_HEIGHT_LINE, MAX_LINES_LINE, STACK_LINE].sort());
  });

  it('binds a line height in pixels', async () => {
    const mock = await loaded();
    const report = await runFile(
      mock,
      `component Label
FRAME Label {
    TEXT Text characters="Ready" lineHeight="{font.tight}" letterSpacing=(literal)1
}
`,
    );
    const text = textOf(mock, report.setId);
    assert.deepEqual(text.boundVariables.lineHeight, [{ type: 'VARIABLE_ALIAS', id: mock.variable('Core', 'font/tight')!.id }]);
    assert.deepEqual(text.lineHeight, { unit: 'PIXELS', value: 20 });
    assert.deepEqual(text.letterSpacing, { unit: 'PIXELS', value: 1 });
  });

  it('binds a weight, which cannot be assigned, and Figma picks the style', async () => {
    const mock = await loaded();
    const report = await runFile(
      mock,
      `component Label
FRAME Label {
    TEXT Text characters="Ready" fontWeight="{font.heavy}"
}
`,
    );
    const text = textOf(mock, report.setId);
    assert.deepEqual(text.boundVariables.fontWeight, [{ type: 'VARIABLE_ALIAS', id: mock.variable('Core', 'font/heavy')!.id }]);
    assert.deepEqual([text.fontName.style, text.fontWeight], ['Bold', 700]);
  });

  it('sets maxLines after textTruncation, which keeps it', async () => {
    const mock = await loaded();
    const report = await runFile(mock, LABEL);
    const text = textOf(mock, report.setId);
    assert.deepEqual([text.textTruncation, text.maxLines, text.textCase, text.textAlignHorizontal], ['ENDING', 2, 'UPPER', 'CENTER']);
    const order = mock.calls('node.set').map((call) => call.args[1]);
    assert.ok(order.indexOf('textTruncation') < order.indexOf('maxLines'));
  });

  it('plans nothing on a second run: the receipts read the bound fields and the written values', async () => {
    const mock = await loaded();
    const first = await runFile(mock, LABEL);
    const again = await runFile(mock, LABEL);

    assert.equal(again.setId, first.setId);
    assert.deepEqual(
      again.steps.filter((step) => step.kind === 'PATCH_LAYER' || /^(CREATE|DELETE|REPLACE|ADD)/.test(step.kind)),
      [],
    );
    assert.deepEqual([again.created, again.updated, again.deleted], [[], [], []]);
  });

  it('writes again what the file changes, in the font the text is in', async () => {
    const mock = await loaded();
    const first = await runFile(mock, LABEL);
    const again = await runFile(
      mock,
      LABEL.replace('fontSize="{font.size}"', 'fontSize=(literal)16').replace('textCase=UPPER', 'textCase=LOWER'),
    );
    const text = textOf(mock, first.setId);
    assert.equal(again.steps.filter((step) => step.kind === 'PATCH_LAYER').length, 1);
    assert.deepEqual([text.fontSize, text.textCase, text.boundVariables.fontSize], [16, 'LOWER', undefined]);
  });

  it('says the lines in a dry run, and writes nothing', async () => {
    const mock = await loaded();
    const report = await runFile(mock, LABEL, { dryRun: true });
    assert.deepEqual([...report.warnings].sort(), [LETTER_SPACING_LINE, LINE_HEIGHT_LINE, MAX_LINES_LINE, STACK_LINE].sort());
    assert.deepEqual(mock.calls('node.setRangeBoundVariable'), []);
  });

  it('refuses a line height when no design system is loaded: only the token says its unit', async () => {
    const mock = mockOf().install();
    await assert.rejects(
      runFile(
        mock,
        `component Label
FRAME Label {
    TEXT Text characters="Ready" lineHeight="{font.tight}"
}
`,
      ),
      /token \{font\.tight\} \(line 3\) on "lineHeight" is bound in pixels or written as its value, as its unit says, and no design system is loaded/,
    );
  });

  it('refuses a text field beside textStyle, naming both', () => {
    const file = readComponentFile(`component Label
FRAME Label {
    TEXT Text characters="Ready" textStyle="{text.label}" fontSize="{font.size}" textAlignHorizontal=CENTER
}
`);
    const messages = file.problems.map((problem) => problem.message);
    assert.deepEqual(messages, [
      '"fontSize" and "textStyle" on TEXT "Text": a text style sets the fontSize too, and two sources for one value would disagree; write one of them',
    ]);
  });

  it('refuses a literal weight, which Figma cannot assign, and a maxLines below 1', () => {
    const file = readComponentFile(`component Label
FRAME Label {
    TEXT Text characters="Ready" fontWeight=(literal)700 textTruncation=ENDING maxLines=(literal)0
}
`);
    const messages = file.problems.map((problem) => problem.message);
    assert.equal(messages.length, 2, messages.join('\n'));
    assert.match(messages[0], /"fontWeight" takes a token reference/);
    assert.match(messages[1], /"maxLines" on TEXT "Text" takes a whole number of at least 1, not \(literal\)0/);
  });
});

describe('visible, characters and instance properties bound to a token', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  const BADGE = `component Badge
properties {
    TEXT Title default="{copy.title}"
    BOOLEAN Shown default="{flag.shown}"
}
FRAME Badge {
    TEXT Name characters="{copy.title}" visible="{flag.shown}"
    TEXT Caption characters=(property)Title visible=(property)Shown
}
`;

  it('binds visible to a boolean token and characters to a string token', async () => {
    const mock = await loaded();
    const report = await runFile(mock, BADGE);
    const name = textOf(mock, report.setId, 'Name');
    assert.deepEqual(name.boundVariables.visible, { type: 'VARIABLE_ALIAS', id: mock.variable('Core', 'flag/shown')!.id });
    assert.deepEqual(name.boundVariables.characters, { type: 'VARIABLE_ALIAS', id: mock.variable('Core', 'copy/title')!.id });
    assert.deepEqual([name.visible, name.characters], [false, 'Hello']);
  });

  it('binds a property default to a token, and a wired text shows its value', async () => {
    const mock = await loaded();
    const report = await runFile(mock, BADGE);
    const set = mock.node(report.setId!) as Node;
    const definition = set.componentPropertyDefinitions[keyOfProperty(set, 'Title', 'TEXT')];
    assert.deepEqual(definition.boundVariables, { defaultValue: { type: 'VARIABLE_ALIAS', id: mock.variable('Core', 'copy/title')!.id } });
    assert.equal(textOf(mock, report.setId, 'Caption').characters, 'Hello');
  });

  it('binds an instance’s property to a string token, and plans nothing on a second run', async () => {
    const mock = await loaded();
    await runFile(mock, BADGE, {}, 'badge.component.kdl');
    const CARD = `component Card
FRAME Card {
    INSTANCE Mark component=Badge {
        set Title="{copy.title}"
    }
}
`;
    const first = await runFile(mock, CARD, {}, 'card.component.kdl');
    const mark = textOf(mock, first.setId, 'Mark');
    const key = Object.keys(mark.componentProperties).find((candidate) => candidate.startsWith('Title#'))!;
    assert.deepEqual(mark.boundVariables.componentProperties, {
      [key]: { type: 'VARIABLE_ALIAS', id: mock.variable('Core', 'copy/title')!.id },
    });
    assert.equal(mark.componentProperties[key].value, 'Hello');

    const again = await runFile(mock, CARD, {}, 'card.component.kdl');
    assert.deepEqual(
      again.steps.filter((step) => step.kind === 'PATCH_LAYER' || /^(CREATE|DELETE|REPLACE|ADD)/.test(step.kind)),
      [],
    );
  });

  it('plans nothing on a second run for a bound visible and characters', async () => {
    const mock = await loaded();
    const first = await runFile(mock, BADGE);
    const again = await runFile(mock, BADGE);
    assert.equal(again.setId, first.setId);
    assert.deepEqual(
      again.steps.filter((step) => step.kind === 'PATCH_LAYER' || /^(CREATE|DELETE|REPLACE|ADD)/.test(step.kind)),
      [],
    );
  });

  it('refuses a token of the wrong type on an instance property', async () => {
    const mock = await loaded();
    await runFile(mock, BADGE, {}, 'badge.component.kdl');
    await assert.rejects(
      runFile(
        mock,
        `component Card
FRAME Card {
    INSTANCE Mark component=Badge {
        set Shown="{copy.title}"
    }
}
`,
        {},
        'card.component.kdl',
      ),
      /token \{copy\.title\} \(line 4\) is a STRING variable, but a field bound to a BOOLEAN variable needs a BOOLEAN one/,
    );
  });
});
