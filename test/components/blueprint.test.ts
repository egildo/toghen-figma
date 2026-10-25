/**
 * Blueprints: one document that folds component files and artboard files into a page and declares what it needs.
 *
 * A body is read by the readers of today's files, so it reads as its file would, with every problem at the
 * blueprint's own line. Synthetic tokens in the W3C structured shapes, read through the `designSourceOf` the plugin uses.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver, type ResolverDocument } from '@toghen/lib';
import { designSourceOf } from '../../main/utils/designSource.js';
import { KEEP_TEMPLATE, GET_TEMPLATES, PLAN_BUILD } from '../../main/handlers/templates.js';
import { loadTemplates } from '../../main/utils/templateStore.js';
import { resetState } from '../../main/runtimeState.js';
import { blueprintNeeds, readArtboardFile, readBlueprint, readComponentFile } from '../../shared/components/index.js';
import type { Problem } from '../../shared/components/index.js';
import type { Response } from '../../shared/protocol.js';
import { createFigmaMock, useFigmaMock, type FigmaMockHandle } from '../support/figmaMock.js';

const px = (value: number) => ({ value, unit: 'px' });
const srgb = (...components: number[]) => ({ colorSpace: 'srgb', components });

const DOCUMENT = {
  version: '2025-11-01',
  name: 'Demo',
  sets: {
    base: {
      sources: [
        {
          space: { sm: { $type: 'dimension', $value: px(4) } },
          button: { backgroundColor: { $type: 'color', $value: srgb(0, 0, 1) }, paddingLeft: { $type: 'dimension', $value: px(8) } },
          text: {
            label: {
              $type: 'typography',
              $value: {
                fontFamily: ['Synthetic Sans', 'sans-serif'],
                fontSize: px(12),
                fontWeight: 400,
                lineHeight: 1.2,
                letterSpacing: px(0),
              },
            },
          },
        },
      ],
    },
  },
  resolutionOrder: [{ $ref: '#/sets/base' }],
} as unknown as ResolverDocument;

const design = designSourceOf(new Resolver(DOCUMENT));

const COMPONENT = `component Button tokens="{button}"
properties {
    VARIANT Tone calm loud
    INSTANCE_SWAP Icon default=Glyph
}
FRAME Button layoutMode=HORIZONTAL itemSpacing="{space.sm}" {
    INSTANCE Icon component=(property)Icon
    TEXT Label characters="Go" textStyle="{text.label}"
}
`;

const ARTBOARD = `artboard "Button reference"
FRAME Page layoutMode=VERTICAL {
    INSTANCE Set component=Button
    INSTANCE Mark component=(key)"0f3a"
    INSTANCE Note component=Badge
}
`;

/** A file folded into a blueprint: its header line opens the body, and the rest is the body. */
const fold = (file: string): string => {
  const [header, ...body] = file.trimEnd().split('\n');
  return `${header} {\n${body.map((line) => `    ${line}`).join('\n')}\n}\n`;
};

const HEAD = `page Buttons

tokens "tokens/ds.resolver.json" overrides="themes/warm.overrides.json"
library Core
`;

const blueprintOf = (...files: string[]): string => [HEAD, ...files.map(fold)].join('\n');

/** The one-based line of the first line of `text` containing `needle`. */
const lineOf = (text: string, needle: string): number => {
  const index = text.split('\n').findIndex((line) => line.includes(needle));
  assert.notEqual(index, -1, `the text has no line containing ${needle}`);
  return index + 1;
};

const PLACES = new Set(['loc', 'fieldLoc', 'acrossLoc', 'line', 'column', 'argLocs', 'fieldLocs']);
/** What was read, without where it was written: a body and its file stand at different lines. */
const unplaced = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (key, inner) => (PLACES.has(key) ? undefined : inner)));

const messages = (problems: Problem[]): string[] => problems.map((problem) => problem.message);

describe('reading a blueprint', () => {
  it('reads its page, tokens and libraries, and each body as its file would read', () => {
    const text = blueprintOf(COMPONENT, ARTBOARD);
    const blueprint = readBlueprint(text, design);
    assert.deepEqual(blueprint.problems, []);
    assert.equal(blueprint.page, 'Buttons');
    assert.deepEqual(blueprint.tokens, { entries: ['tokens/ds.resolver.json'], overrides: 'themes/warm.overrides.json' });
    assert.deepEqual(blueprint.libraries, ['Core']);

    const [component, artboard] = blueprint.bodies;
    const file = readComponentFile(COMPONENT, design);
    assert.equal(component.members.length, 2);
    assert.deepEqual(unplaced(component.component), unplaced(file.component));
    assert.deepEqual(unplaced(component.members), unplaced(file.members));

    const board = readArtboardFile(ARTBOARD);
    assert.equal(artboard.artboard, true);
    assert.equal(artboard.members.length, 1);
    assert.deepEqual(unplaced(artboard.members), unplaced(board.members));
  });

  it("says a body's problems as its file does, at the blueprint's lines", () => {
    const broken = COMPONENT.replace('itemSpacing="{space.sm}"', 'itemSpacing="{space.sm}" nonsense=1');
    const text = blueprintOf(broken, ARTBOARD);
    const blueprint = readBlueprint(text, design);
    const file = readComponentFile(broken, design);
    assert.ok(file.problems.length > 0);
    assert.deepEqual(messages(blueprint.problems), messages(file.problems));
    assert.equal(blueprint.problems[0].line, lineOf(text, 'nonsense=1'));
    // The body's lines stand four columns in: the column moves with them.
    assert.equal(blueprint.problems[0].column, file.problems[0].column! + 4);
    assert.deepEqual(blueprint.bodies[0].members, []);
  });

  it('shares a guard and a define written at the top with every body', () => {
    const text = `page Badges

guard loud { is (input)Tone loud }
define dot { FRAME Dot }

component Badge {
    properties {
        VARIANT Tone calm loud
    }
    FRAME Badge layoutMode=HORIZONTAL {
        when loud itemSpacing="{space.sm}"
        +dot
    }
}

artboard Sheet {
    FRAME Sheet layoutMode=VERTICAL {
        +dot
        INSTANCE One component=Badge
    }
}
`;
    const blueprint = readBlueprint(text, design);
    assert.deepEqual(blueprint.problems, []);
    assert.deepEqual(
      blueprint.bodies.map((body) => body.members.length),
      [2, 1],
    );
  });

  it('refuses what is not a blueprint, each at its line', () => {
    const cases: [string, string, RegExp][] = [
      ['no page', 'library Core\n', /needs one "page <Name>"/],
      ['a second page', 'page A\npage B\n', /"page" is written twice/],
      ['a second tokens', 'page A\ntokens "a.tokens.json"\ntokens "b.tokens.json"\n', /"tokens" is written twice/],
      ['a word that is none of these', 'page A\nFRAME Stray\n', /"FRAME" is not a word of a blueprint/],
      [
        'a body with its own header line',
        'page A\ncomponent Badge {\n    component Badge\n    FRAME Badge\n}\n',
        /has its own "component" line/,
      ],
      [
        'each in a component body',
        'page A\ncomponent Badge {\n    FRAME Badge {\n        each p in=(input)rows key=name { FRAME Row }\n    }\n}\n',
        /"each" is not built for component files/,
      ],
      [
        'a component written twice',
        'page A\ncomponent Badge {\n    FRAME Badge\n}\ncomponent Badge {\n    FRAME Badge\n}\n',
        /component "Badge" is written twice/,
      ],
    ];
    for (const [what, text, message] of cases) {
      const errors = readBlueprint(text).problems.filter((problem) => problem.severity === 'error');
      const found = errors.find((problem) => message.test(problem.message));
      assert.ok(found, `${what}: ${JSON.stringify(messages(errors))}`);
      if (what !== 'no page') assert.equal(typeof found.line, 'number', `${what} has a line`);
    }
  });

  it('says text that is not KDL as a file does', () => {
    const { problems } = readBlueprint('page A {\n');
    assert.match(problems[0].message, /^not valid KDL/);
  });
});

describe("a blueprint's needs", () => {
  it('lists its tokens, its libraries and every component its bodies name, marking those it defines', () => {
    const text = blueprintOf(COMPONENT, ARTBOARD);
    const needs = blueprintNeeds(readBlueprint(text, design));
    assert.deepEqual(needs.tokens, { entries: ['tokens/ds.resolver.json'], overrides: 'themes/warm.overrides.json' });
    assert.deepEqual(needs.libraries, ['Core']);
    assert.deepEqual(
      needs.components.map(({ ref, satisfied, loc }) => ({ ref, satisfied, line: loc?.line })),
      [
        { ref: { name: 'Glyph' }, satisfied: false, line: lineOf(text, 'INSTANCE_SWAP Icon') },
        { ref: { name: 'Button' }, satisfied: true, line: lineOf(text, 'INSTANCE Set') },
        { ref: { key: '0f3a' }, satisfied: false, line: lineOf(text, 'INSTANCE Mark') },
        { ref: { name: 'Badge' }, satisfied: false, line: lineOf(text, 'INSTANCE Note') },
      ],
    );
  });

  it('reads several token files with a collection name', () => {
    const needs = blueprintNeeds(readBlueprint('page A\ntokens "a.tokens.json" "b.tokens.json" name=Demo\n'));
    assert.deepEqual(needs, { tokens: { entries: ['a.tokens.json', 'b.tokens.json'], name: 'Demo' }, libraries: [], components: [] });
  });
});

describe('keeping a blueprint in the file', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  const posted = (mock: FigmaMockHandle) => mock.calls('ui.postMessage').map((call) => call.args[0] as Response);
  const BADGES =
    'page Badges\n\ncomponent Badge {\n    properties {\n        VARIANT Tone calm loud\n    }\n    FRAME Badge layoutMode=VERTICAL\n}\n';

  it("keeps one that reads, under its page's name, and lists it", async () => {
    const mock = createFigmaMock().install();
    await KEEP_TEMPLATE({ fileName: 'badges.blueprint.kdl', text: BADGES });
    assert.deepEqual(
      loadTemplates().map((kept) => [kept.name, kept.fileName]),
      [['Badges', 'badges.blueprint.kdl']],
    );
    await GET_TEMPLATES();
    const listed = posted(mock)
      .filter((message) => message.type === 'TEMPLATES')
      .at(-1)!;
    assert.ok(listed.type === 'TEMPLATES');
    assert.equal(listed.payload.templates[0].members, 2);
    assert.deepEqual(listed.payload.templates[0].problems, []);
  });

  it('refuses one that does not read, with every problem at its line', async () => {
    const mock = createFigmaMock().install();
    const text = 'page Badges\npage Again\n\ncomponent Badge {\n    FRAME Badge nonsense=1\n}\n';
    await KEEP_TEMPLATE({ fileName: 'badges.blueprint.kdl', text });
    const [message] = posted(mock);
    assert.ok(message.type === 'ERROR');
    assert.equal(message.payload.code, 'INVALID_TEMPLATE');
    assert.deepEqual(
      message.payload.problems!.map((problem) => problem.replace(/ .*/, '')),
      ['badges.blueprint.kdl:2:1', `badges.blueprint.kdl:${lineOf(text, 'nonsense')}:${text.split('\n')[4].indexOf('nonsense') + 1}`],
    );
    assert.deepEqual(loadTemplates(), []);
  });

  it('refuses a blueprint named as a kept component, and building one as a whole', async () => {
    const mock = createFigmaMock().install();
    await KEEP_TEMPLATE({ fileName: 'badge.component.kdl', text: 'component Badges\nFRAME Badges layoutMode=VERTICAL\n' });
    await KEEP_TEMPLATE({ fileName: 'badges.blueprint.kdl', text: BADGES });
    const clash = posted(mock).at(-1)!;
    assert.ok(clash.type === 'ERROR');
    assert.match(clash.payload.message, /already kept from badge\.component\.kdl/);

    await KEEP_TEMPLATE({ fileName: 'badges.blueprint.kdl', text: BADGES.replace('page Badges', 'page Sheet') });
    await PLAN_BUILD({ name: 'Sheet' });
    const refused = posted(mock).at(-1)!;
    assert.ok(refused.type === 'ERROR');
    assert.match(refused.payload.message, /not built as a whole/);
  });
});
