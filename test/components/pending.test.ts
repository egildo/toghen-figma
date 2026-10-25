import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, useFigmaMock } from '../support/figmaMock.js';
import { run } from '../../main/components/run.js';
import { readComponentFile } from '../../shared/components/index.js';
import type { Desired, Pending } from '../../shared/components/index.js';

function desiredFrom(text: string): Desired {
  const file = readComponentFile(text);
  assert.deepEqual(
    file.problems.filter((p) => p.severity === 'error'),
    [],
    text,
  );
  return JSON.parse(JSON.stringify({ component: file.component, members: file.members })) as Desired;
}

// A component that names a dimension token, a colour token and a text style, each on a line of its own.
const panel = (spacing = '{space.xl}'): string => `component Panel
properties {
    TEXT Title default="Title"
}
FRAME Panel layoutMode=VERTICAL itemSpacing="${spacing}" {
    fills "{surface.page}"
    TEXT Heading characters=(property)Title textStyle="{text.label}"
}
`;

/** `Tokens` holds `space.sm` and `surface.page`; the style `text.label` is there too. `space.xl` is not. */
const fileMock = () =>
  createFigmaMock()
    .withFonts([{ family: 'Inter', style: 'Regular' }])
    .withCollection('Tokens', ['light'])
    .withVariable('Tokens', 'space/sm', 'FLOAT', { light: 8 })
    .withVariable('Tokens', 'surface/page', 'COLOR', { light: { r: 1, g: 1, b: 1, a: 1 } })
    .withStyle('TEXT', 'text/label', { fontName: { family: 'Inter', style: 'Regular' } });

const XL: Pending = { variables: [{ collection: 'Tokens', name: 'space/xl', type: 'FLOAT' }], textStyles: [] };

describe('a dry run across steps: pending names', () => {
  useFigmaMock();

  it('counts a name the sync would create as present, and reports it apart from the steps', async () => {
    const mock = fileMock().install();
    const writes = mock.writes().length;

    const report = await run(desiredFrom(panel()), { dryRun: true, pending: XL });

    assert.equal(report.dryRun, true);
    assert.deepEqual(
      report.steps.map((step) => step.kind),
      ['CREATE_SET'],
    );
    assert.deepEqual(report.pending, ['token {space.xl} (line 5): the variable sync would create "space/xl"']);
    assert.equal(mock.writes().length, writes);
  });

  it('counts a mode pin the variable sync would create as present, and still stops for one it would not', async () => {
    const pinned = panel().replace('    fills "{surface.page}"\n', '    fills "{surface.page}"\n    modes state=hover\n');
    const pending: Pending = {
      ...XL,
      modes: [
        { collection: 'state', mode: 'rest' },
        { collection: 'state', mode: 'hover' },
      ],
    };
    fileMock().install();
    const report = await run(desiredFrom(pinned), { dryRun: true, pending });
    assert.ok(
      report.pending.some((line) => /^modes state=hover .*the variable sync would create it$/.test(line)),
      report.pending.join('\n'),
    );

    fileMock().install();
    await assert.rejects(run(desiredFrom(pinned), { dryRun: true, pending: XL }), /no local variable collection named "state"/);
  });

  it('reports nothing pending when every name is in the file', async () => {
    fileMock().withVariable('Tokens', 'space/xl', 'FLOAT', { light: 32 }).install();
    const report = await run(desiredFrom(panel()), { dryRun: true, pending: XL });
    assert.deepEqual(report.pending, []);
  });

  it('still stops for a name that is neither in the file nor pending, as it does with no pending at all', async () => {
    fileMock().install();
    await assert.rejects(
      run(desiredFrom(panel()), { dryRun: true }),
      /token \{space\.xl\} \(line 5\) names no variable: looked for "space\/xl" in "Tokens"/,
    );
    // A variable of another name is not this one.
    await assert.rejects(
      run(desiredFrom(panel()), {
        dryRun: true,
        pending: { variables: [{ collection: 'Other', name: 'size/xl', type: 'FLOAT' }], textStyles: [] },
      }),
      /token \{space\.xl\} \(line 5\) names no variable: looked for "space\/xl"/,
    );
  });

  it("matches by the engine's own rule: the name without the collection, not the old prefixed one", async () => {
    fileMock().install();
    const wrongName: Pending = { variables: [{ collection: 'Tokens', name: 'Tokens/space/xl', type: 'FLOAT' }], textStyles: [] };
    await assert.rejects(run(desiredFrom(panel()), { dryRun: true, pending: wrongName }), /names no variable/);
  });

  it('checks the type of a pending variable like that of one in the file', async () => {
    fileMock().install();
    const asColor: Pending = { variables: [{ collection: 'Tokens', name: 'space/xl', type: 'COLOR' }], textStyles: [] };
    await assert.rejects(
      run(desiredFrom(panel()), { dryRun: true, pending: asColor }),
      /is a COLOR variable the sync would create, but a dimension or opacity needs a FLOAT one/,
    );
  });

  it('counts a pending colour variable and a pending text style too, and lists each with its line', async () => {
    createFigmaMock()
      .withFonts([{ family: 'Inter', style: 'Regular' }])
      .withCollection('Tokens', ['light'])
      .withVariable('Tokens', 'space/xl', 'FLOAT', { light: 32 })
      .install();
    const pending: Pending = {
      variables: [{ collection: 'Tokens', name: 'surface/page', type: 'COLOR' }],
      textStyles: ['text/label'],
    };

    const report = await run(desiredFrom(panel()), { dryRun: true, pending });

    assert.deepEqual(report.pending, [
      'token {surface.page} (line 6): the variable sync would create "surface/page"',
      'text style {text.label} (line 7): the style sync would create "text/label"',
    ]);
  });

  it('finds a pending variable under a collection the plan would create', async () => {
    createFigmaMock()
      .withFonts([{ family: 'Inter', style: 'Regular' }])
      .install();
    const pending: Pending = {
      variables: [
        { collection: 'Tokens', name: 'space/xl', type: 'FLOAT' },
        { collection: 'Tokens', name: 'surface/page', type: 'COLOR' },
      ],
      textStyles: ['text/label'],
    };
    const report = await run(desiredFrom(panel()), { dryRun: true, pending });
    assert.equal(report.pending.length, 3);
  });

  it('joins a pending variable to the ambiguity check', async () => {
    fileMock().withCollection('Other', ['light']).withVariable('Other', 'space/xl', 'FLOAT', { light: 40 }).install();
    const error = await run(desiredFrom(panel()), { dryRun: true, pending: XL }).then(
      () => assert.fail('expected a problem'),
      (e: Error & { problems: string[] }) => e,
    );
    assert.match(
      error.problems[0],
      /token \{space\.xl\} \(line 5\) is ambiguous, it matches Other: "space\/xl"; Tokens: "space\/xl" \(the sync would create it\)/,
    );
  });

  it('is refused by a real run, before anything is written', async () => {
    const mock = fileMock().install();
    const writes = mock.writes().length;

    await assert.rejects(run(desiredFrom(panel()), { pending: XL }), (error: Error & { problems: string[] }) => {
      assert.match(error.message, /will not build "Panel": nothing was written/);
      assert.match(error.problems[0], /pending names are for a dry run/);
      return true;
    });
    assert.equal(mock.writes().length, writes);
  });

  it('is not asked for by a real run that resolves: its pending list is empty', async () => {
    fileMock().withVariable('Tokens', 'space/xl', 'FLOAT', { light: 32 }).install();
    const report = await run(desiredFrom(panel()));
    assert.deepEqual(report.pending, []);
    assert.equal(report.created.length, 1);
  });
});

// A set that nests another, and sets a property on it that only the built component could say it has.
const stage = (nested = 'Chip'): string => `component Stage
FRAME Stage layoutMode=VERTICAL itemSpacing="{space.sm}" {
    INSTANCE First component=${nested} {
        set Tone=hot
    }
    INSTANCE Second component=${nested}
}
`;
const NOTHING: Pending = { variables: [], textStyles: [] };

describe('a dry run across files: pending components (ruling 7a)', () => {
  useFigmaMock();

  it('counts a set an earlier file would create as present, by its name only, and says so once', async () => {
    const mock = fileMock().install();
    const writes = mock.writes().length;

    const report = await run(desiredFrom(stage()), { dryRun: true, pending: { ...NOTHING, components: ['Chip'] } });

    assert.deepEqual(
      report.steps.map((step) => step.kind),
      ['CREATE_SET'],
    );
    assert.deepEqual(report.pending, [
      'component "Chip" (line 3): a file earlier in this run would create it; the properties and slots of instances of "Chip" are checked when it is built',
    ]);
    assert.equal(mock.writes().length, writes);
  });

  it('still stops for a component that is neither in the file nor pending, as before', async () => {
    fileMock().install();
    await assert.rejects(run(desiredFrom(stage()), { dryRun: true }), /component "Chip" \(line 3\) is not in this file/);
    await assert.rejects(
      run(desiredFrom(stage('Missing')), { dryRun: true, pending: { ...NOTHING, components: ['Chip'] } }),
      /component "Missing" \(line 3\) is not in this file/,
    );
  });

  it('is refused by a real run, as every pending name is', async () => {
    fileMock().install();
    await assert.rejects(
      run(desiredFrom(stage()), { pending: { ...NOTHING, components: ['Chip'] } }),
      /will not build "Stage": nothing was written/,
    );
  });
});
