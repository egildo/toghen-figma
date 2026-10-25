/**
 * The FigCraft target: `variables --figcraft <port>`, against a fake of FigCraft's control socket, and the two
 * translations it rests on (Figma's operations into FigCraft's commands, FigCraft's listing into Figma's shapes).
 *
 * The run uses the sample design system: W3C structured colours and dimensions, a font stack, typography, shadow and
 * gradient tokens, aliases, and a theme modifier with two contexts.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main, type Io } from '../cli/main.js';
import { figmaView, translate, type FcListing, type FcStyle } from '../cli/figcraftFile.js';
import { guard, readRecord, recordText } from '../cli/figcraftRecord.js';
import { listedStyle, startFakeFigcraft } from './support/fakeFigcraft.js';
import { toEffectStyleProps, toPaintStyleProps, toTextStyleProps } from '../main/utils/figmaStyleAdapter.js';
import { holds, wantedOf } from '../main/engines/styleSyncEngine.js';
import { reportOf, type StyleKind } from '../main/utils/tokenStamps.js';

const here = dirname(fileURLToPath(import.meta.url));

async function sync(port: number, ...flags: string[]) {
  let stdout = '';
  let stderr = '';
  const io: Io = {
    cwd: here,
    readFile: (path) => readFileSync(path, 'utf8'),
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
    pairingFile: join(here, 'never-written'),
  };
  const code = await main(['variables', 'fixtures/sample.resolver.json', '--figcraft', String(port), ...flags], io);
  return { code, stdout, stderr };
}

describe('the FigCraft target, end to end', () => {
  it('syncs the variables and styles into the file FigCraft shows, with no plugin', async () => {
    const fake = await startFakeFigcraft(['Other', 'Target']);
    fake.active = 1;
    try {
      const result = await sync(fake.port);
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /Writing into "Target" in FigCraft/);
      assert.match(result.stdout, /Variable sync: \d+ applied/);
      assert.match(result.stdout, /Style sync: 7 applied/);

      const [other, target] = fake.tabs;
      assert.equal(other.variables.length + other.styles.length, 0, 'the other tab is untouched');
      assert.deepEqual(
        target.collections.map((c) => [c.name, c.modes.map((m) => m.name)]),
        [
          ['demo', ['default']],
          ['theme', ['light', 'dark']],
        ],
      );

      const byName = (name: string) => target.variables.find((v) => v.name === name)!;
      // A structured colour is written as Figma holds it, in 0–1.
      assert.deepEqual(byName('color/blue-500').values['VariableCollectionId:1/mode1'], {
        type: 'color',
        value: { r: 0, g: 0.4, b: 0.8, a: 1 },
      });
      assert.deepEqual(byName('color/blue-500').codeSyntax, { WEB: 'var(--color-blue-500)' });
      assert.deepEqual(byName('color/blue-500').scopes, ['ALL_FILLS', 'STROKE_COLOR', 'EFFECT_COLOR']);
      // A structured dimension is a number in pixels.
      assert.deepEqual(byName('spacing/md').values['VariableCollectionId:1/mode1'], { type: 'number', value: 16 });
      // A reference is an alias, in each mode of the modifier's collection.
      const button = byName('component/button/bg');
      assert.equal(button.collection, 'VariableCollectionId:2');
      assert.ok(
        Object.values(button.values).every((held: any) => held.type === 'alias'),
        JSON.stringify(button.values),
      );

      const style = (name: string) => target.styles.find((s) => s.name === name)!;
      // A font stack's first family, a unitless line height as a percentage, case and decoration in FigCraft's words.
      assert.deepEqual(style('typo/body').value, {
        fontFamily: 'Inter',
        fontStyle: 'Regular',
        fontSize: 16,
        lineHeight: '160%',
        letterSpacing: 0,
        case: 'original',
        decoration: 'none',
      });
      assert.equal(style('typo/body').bound.fontFamily, byName('font/family/sans').id, 'a member that is a reference is bound');
      const [shadow] = style('shadow/md').value;
      assert.deepEqual(
        { type: shadow.type, offset: shadow.offset, radius: shadow.radius, spread: shadow.spread },
        { type: 'dropShadow', offset: [0, 4], radius: 12, spread: -2 },
      );
      const [gradient] = style('gradient/brand').value;
      assert.deepEqual(
        { kind: gradient.kind, from: gradient.from, to: gradient.to, positions: gradient.stops.map((s: any) => s.position) },
        { kind: 'linear', from: [0, 0.5], to: [1, 0.5], positions: [0, 1] },
      );

      // Each write is one undo step, named after what it did.
      assert.ok(fake.labels.includes('Creating collection "theme"'), fake.labels.slice(0, 5).join(' | '));
    } finally {
      await fake.close();
    }
  });

  it('writes nothing in a dry run', async () => {
    const fake = await startFakeFigcraft();
    try {
      const result = await sync(fake.port, '--dry-run');
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /Variable plan: \d+ creates/);
      assert.deepEqual([fake.tabs[0].collections, fake.tabs[0].styles], [[], []]);
    } finally {
      await fake.close();
    }
  });

  it('keeps writing into the file it began in when another tab is shown meanwhile', async () => {
    const fake = await startFakeFigcraft(['Target', 'Elsewhere']);
    let requests = 0;
    fake.afterRequest = () => {
      if (++requests === 6) fake.active = 1;
    };
    try {
      const result = await sync(fake.port);
      assert.equal(result.code, 0, result.stderr);
      assert.equal(fake.tabs[1].variables.length + fake.tabs[1].collections.length, 0);
      assert.ok(fake.tabs[0].variables.length > 40);
    } finally {
      await fake.close();
    }
  });

  it('stops when the file is no longer at its tab', async () => {
    const fake = await startFakeFigcraft(['First', 'Target']);
    fake.active = 1;
    let requests = 0;
    fake.afterRequest = () => {
      // A tab opened before it moves the file one tab along.
      if (++requests === 6) fake.tabs.unshift({ ...fake.tabs[0], name: 'Opened', variables: [], collections: [], styles: [] });
    };
    try {
      const result = await sync(fake.port);
      assert.equal(result.code, 1);
      assert.match(result.stderr, /no longer has "Target" at the tab it was in/);
      // Only the one step that went before the check could tell: every later one was refused unsent.
      assert.ok(fake.tabs[1].variables.length + fake.tabs[1].collections.length <= 2, JSON.stringify(fake.tabs[1].collections));
    } finally {
      await fake.close();
    }
  });

  it('says what to do when nothing listens on the port', async () => {
    const fake = await startFakeFigcraft();
    const port = fake.port;
    await fake.close();
    const result = await sync(port);
    assert.equal(result.code, 1);
    assert.match(result.stderr, new RegExp(`Nothing answered on 127\\.0\\.0\\.1:${port}.*--control ${port}`));
  });

  it('refuses a port that is not one', async () => {
    const result = await sync('figcraft' as unknown as number);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /--figcraft takes the port/);
  });
});

describe('the stamps in FigCraft, kept on a page', () => {
  const record = (fake: Awaited<ReturnType<typeof startFakeFigcraft>>) =>
    readRecord(fake.tabs[0].pages.find((page) => page.pluginData?.toghen)?.pluginData?.toghen);
  const variableNamed = (fake: Awaited<ReturnType<typeof startFakeFigcraft>>, name: string) =>
    fake.tabs[0].variables.find((v) => v.name === name)!;

  it('keeps every stamp on a divider page, leaves the page shown as it was, and plans nothing on a second run', async () => {
    const fake = await startFakeFigcraft();
    try {
      assert.equal((await sync(fake.port)).code, 0);
      const pages = fake.tabs[0].pages;
      assert.deepEqual(
        pages.map((page) => [page.name, page.current, page.divider ?? false]),
        [
          ['Page 1', true, false],
          ['-toghen', false, true],
        ],
      );
      const stamps = record(fake);
      assert.equal(
        stamps.size,
        fake.tabs[0].variables.length + fake.tabs[0].styles.length,
        'every variable and style Toghen wrote is stamped',
      );
      assert.ok(fake.labels.includes('Toghen stamps'));

      const labels = fake.labels.length;
      const second = await sync(fake.port);
      assert.equal(second.code, 0, second.stderr);
      assert.match(second.stdout, /Variable plan: 0 creates · 0 updates/);
      assert.match(second.stdout, /Style plan: 0 creates · 0 updates/);
      assert.ok(
        !fake.labels.slice(labels).some((label) => label !== 'Read'),
        `a run that writes nothing writes no stamps either: ${fake.labels.slice(labels).join(' | ')}`,
      );
    } finally {
      await fake.close();
    }
  });

  it('finds the page by its data, not its name', async () => {
    const fake = await startFakeFigcraft();
    try {
      await sync(fake.port);
      fake.tabs[0].pages[1].name = 'Stamps';
      const second = await sync(fake.port);
      assert.match(second.stdout, /Variable plan: 0 creates · 0 updates/);
      assert.equal(fake.tabs[0].pages.length, 2);
    } finally {
      await fake.close();
    }
  });

  it('keeps a value or a style changed in FigCraft, says so, and writes over it with --overwrite-drift', async () => {
    const fake = await startFakeFigcraft();
    try {
      await sync(fake.port);
      const spacing = variableNamed(fake, 'spacing/md');
      const mode = Object.keys(spacing.values)[0];
      spacing.values[mode] = { type: 'number', value: 99 };
      const body = fake.tabs[0].styles.find((s) => s.name === 'typo/body')!;
      body.value = { ...body.value, fontSize: 30 };

      const kept = await sync(fake.port);
      assert.match(kept.stdout, /drifted: demo\.spacing\.md/);
      assert.match(kept.stdout, /drifted: demo\.typo\.body — Changed in Figma since the last sync \(fontSize\)/);
      assert.deepEqual([spacing.values[mode], body.value.fontSize], [{ type: 'number', value: 99 }, 30]);

      assert.equal((await sync(fake.port, '--overwrite-drift')).code, 0);
      assert.deepEqual(
        [variableNamed(fake, 'spacing/md').values[mode], fake.tabs[0].styles.find((s) => s.name === 'typo/body')!.value.fontSize],
        [{ type: 'number', value: 16 }, 16],
      );
      assert.match((await sync(fake.port)).stdout, /Variable plan: 0 creates · 0 updates/);
    } finally {
      await fake.close();
    }
  });

  it('finds a variable renamed in FigCraft by its stamp, and names it back rather than making another', async () => {
    const fake = await startFakeFigcraft();
    try {
      await sync(fake.port);
      const count = fake.tabs[0].variables.length;
      const spacing = variableNamed(fake, 'spacing/md');
      spacing.name = 'gaps/medium';
      const second = await sync(fake.port);
      assert.match(second.stdout, /Variable plan: 0 creates/);
      assert.deepEqual([fake.tabs[0].variables.length, spacing.name], [count, 'spacing/md']);
    } finally {
      await fake.close();
    }
  });

  it('adopts by name when the page is gone, and makes it again', async () => {
    const fake = await startFakeFigcraft();
    try {
      await sync(fake.port);
      const count = fake.tabs[0].variables.length;
      fake.tabs[0].pages.splice(1, 1);
      assert.equal((await sync(fake.port)).code, 0);
      assert.equal(fake.tabs[0].variables.length, count, 'no variable made twice');
      assert.equal(record(fake).size, count + fake.tabs[0].styles.length);
    } finally {
      await fake.close();
    }
  });

  it('makes no page in a dry run', async () => {
    const fake = await startFakeFigcraft();
    try {
      assert.equal((await sync(fake.port, '--dry-run')).code, 0);
      assert.equal(fake.tabs[0].pages.length, 1);
    } finally {
      await fake.close();
    }
  });

  it('keeps the stamps of what a run wrote before it failed', async () => {
    const fake = await startFakeFigcraft();
    const refuse = fake.refuse;
    fake.refuse = 'style.create';
    try {
      const result = await sync(fake.port);
      assert.equal(result.code, 1);
      assert.ok(fake.tabs[0].variables.length > 40);
      assert.equal(record(fake).size, fake.tabs[0].variables.length, 'every variable written is stamped');
    } finally {
      fake.refuse = refuse;
      await fake.close();
    }
  });

  it('drops an entry whose id FigCraft gave to another kind of object, or to nothing', () => {
    const stamps = readRecord(
      recordText(
        new Map([
          ['VariableID:1', { of: 'variable COLOR C:1', stamp: { is: { token: 'ink' }, receipt: {} } }],
          ['VariableID:2', { of: 'variable COLOR C:1', stamp: { is: { token: 'gap' }, receipt: {} } }],
          ['VariableID:3', { of: 'variable FLOAT C:1', stamp: { is: { token: 'gone' }, receipt: {} } }],
          ['S:1', { of: 'style TEXT', stamp: { is: { token: 'body' }, receipt: {} } }],
        ]),
      ),
    );
    guard(stamps, [
      { id: 'VariableID:1', resolvedType: 'COLOR', variableCollectionId: 'C:1' },
      // Deleted, and its id given to a number: not the variable the stamp was written on.
      { id: 'VariableID:2', resolvedType: 'FLOAT', variableCollectionId: 'C:1' },
      { id: 'S:1', type: 'TEXT' },
    ]);
    assert.deepEqual([...stamps.keys()], ['VariableID:1', 'S:1']);
    assert.equal(readRecord('not json').size, 0, 'a record edited by hand reads as none');
  });
});

describe("FigCraft's listing in Figma's shapes", () => {
  const listing: FcListing = {
    collections: [
      {
        id: 'C:1',
        name: 'theme',
        modes: [
          { id: 'C:1/m1', name: 'light' },
          { id: 'C:1/m2', name: 'dark' },
        ],
      },
    ],
    variables: [
      {
        id: 'V:1',
        name: 'ink',
        collection: 'C:1',
        resolvedType: 'color',
        values: { 'C:1/m1': { type: 'color', value: { r: 1, g: 0, b: 0, a: 1 } }, 'C:1/m2': { type: 'alias', value: 'V:2' } },
      },
      {
        id: 'V:2',
        name: 'gap',
        collection: 'C:1',
        resolvedType: 'number',
        values: { 'C:1/m1': { type: 'number', value: 4 } },
        scopes: ['GAP'],
        codeSyntax: { WEB: 'var(--gap)' },
      },
    ],
    styles: [{ id: 'S:1', name: 'body', type: 'text', bound: { fontSize: 'V:2' } }],
  };

  it('reads types, aliases, scopes, code syntax and the default mode as Figma spells them', () => {
    const view = figmaView(listing);
    assert.deepEqual(view.collections[0], {
      id: 'C:1',
      name: 'theme',
      modes: [
        { modeId: 'C:1/m1', name: 'light' },
        { modeId: 'C:1/m2', name: 'dark' },
      ],
      defaultModeId: 'C:1/m1',
      variableIds: ['V:1', 'V:2'],
    });
    assert.equal(view.variables[0].resolvedType, 'COLOR');
    assert.deepEqual(view.variables[0].valuesByMode['C:1/m2'], { type: 'VARIABLE_ALIAS', id: 'V:2' });
    assert.deepEqual(view.variables[0].scopes, ['ALL_SCOPES'], 'a variable listed without scopes is offered everywhere');
    assert.deepEqual(
      [view.variables[1].resolvedType, view.variables[1].scopes, view.variables[1].codeSyntax],
      ['FLOAT', ['GAP'], { WEB: 'var(--gap)' }],
    );
    assert.deepEqual(view.styles, [{ id: 'S:1', name: 'body', type: 'TEXT' }]);
  });

  /** A style as Toghen writes it, then as FigCraft lists it back, then as the plans read it: what Figma would report. */
  const roundTrip = (
    styleType: StyleKind,
    props: Record<string, unknown>,
    bindings: { field: string; variableId: string; index?: number }[] = [],
  ) => {
    const steps = translate({ kind: 'CREATE_STYLE', styleType, name: 's', tokenPath: 's', props, bindings }).steps;
    const stored: Record<string, any> = { id: 'S:1', name: 's', type: styleType.toLowerCase(), value: steps[0].params.value };
    for (const step of steps.slice(1)) stored.bound = { ...stored.bound, [step.params.field as string]: step.params.variable };
    const style = figmaView({ collections: [], variables: [], styles: [listedStyle(stored, () => 4) as unknown as FcStyle] }).styles[0];
    return reportOf(style as unknown as BaseStyle);
  };

  it('reads a style back as Figma would report it, in the W3C structured shapes: a typography, a shadow, a gradient', () => {
    const typography = toTextStyleProps({
      fontFamily: ['Inter', 'sans-serif'],
      fontSize: { value: 16, unit: 'px' },
      fontStyle: 'Bold',
      lineHeight: 1.5,
      letterSpacing: { value: 0.5, unit: 'px' },
      textTransform: 'uppercase',
    });
    assert.ok(
      holds(
        roundTrip('TEXT', typography as unknown as Record<string, unknown>),
        wantedOf('TEXT', typography as unknown as Record<string, unknown>, []),
      ),
    );
    const shadow = toEffectStyleProps([
      {
        color: { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.15 },
        offsetX: { value: 0, unit: 'px' },
        offsetY: { value: 4, unit: 'px' },
        blur: { value: 12, unit: 'px' },
        spread: { value: -2, unit: 'px' },
      },
      {
        color: { colorSpace: 'srgb', components: [1, 0, 0] },
        offsetX: { value: 1, unit: 'px' },
        offsetY: { value: 2, unit: 'px' },
        blur: { value: 3, unit: 'px' },
        inset: true,
      },
    ]);
    assert.ok(
      holds(
        roundTrip('EFFECT', shadow as unknown as Record<string, unknown>),
        wantedOf('EFFECT', shadow as unknown as Record<string, unknown>, []),
      ),
    );
    const gradient = toPaintStyleProps([
      { color: { colorSpace: 'srgb', components: [0, 0.4, 0.8] }, position: 0 },
      { color: { colorSpace: 'srgb', components: [0, 0.302, 0.6] }, position: 1 },
    ]);
    assert.ok(
      holds(
        roundTrip('PAINT', gradient as unknown as Record<string, unknown>),
        wantedOf('PAINT', gradient as unknown as Record<string, unknown>, []),
      ),
    );
  });

  it("reads a turned gradient's transform back from the ends of its ramp", () => {
    const turned = {
      paints: [
        {
          type: 'GRADIENT_LINEAR',
          gradientTransform: [
            [0, -1, 1],
            [1, 0, 0],
          ],
          gradientStops: [{ position: 0, color: { r: 1, g: 0, b: 0, a: 1 } }],
          visible: true,
          opacity: 1,
          blendMode: 'NORMAL',
        },
      ],
    };
    const [paint] = roundTrip('PAINT', turned).paints as { gradientTransform: Transform }[];
    assert.deepEqual(
      paint.gradientTransform.map((row) => row.map((n) => Math.round(n * 1e9) / 1e9 + 0)),
      [
        [0, -1, 1],
        [1, 0, 0],
      ],
    );
  });

  it("reads a bound field back as an alias, a text style's by its name and an effect's by its layer", () => {
    const typography = toTextStyleProps({
      fontFamily: 'Inter',
      fontSize: { value: 16, unit: 'px' },
      lineHeight: 1.5,
      letterSpacing: { value: 0, unit: 'px' },
    });
    const text = roundTrip('TEXT', typography as unknown as Record<string, unknown>, [{ field: 'fontSize', variableId: 'V:2' }]);
    assert.deepEqual([text.boundVariables, text.fontSize], [{ fontSize: { type: 'VARIABLE_ALIAS', id: 'V:2' } }, 4]);
    const shadow = toEffectStyleProps({
      color: { colorSpace: 'srgb', components: [0, 0, 0] },
      offsetX: { value: 0, unit: 'px' },
      offsetY: { value: 4, unit: 'px' },
      blur: { value: 12, unit: 'px' },
    });
    const [effect] = roundTrip('EFFECT', shadow as unknown as Record<string, unknown>, [{ field: 'radius', variableId: 'V:2', index: 0 }])
      .effects as Record<string, unknown>[];
    assert.deepEqual([effect.boundVariables, effect.radius], [{ radius: { type: 'VARIABLE_ALIAS', id: 'V:2' } }, 4]);
  });
});

describe("Figma's operations as FigCraft commands", () => {
  it('makes a variable with its scopes in one batch, the scopes naming the variable just made', () => {
    const { steps, idOf } = translate({
      kind: 'CREATE_VARIABLE',
      collectionId: 'C:1',
      path: 'space/sm',
      variableType: 'FLOAT',
      scopes: ['GAP'],
    });
    assert.deepEqual(steps, [
      { command: 'variable.create', params: { collection: 'C:1', name: 'space/sm', type: 'number' } },
      { command: 'variable.update', params: { variable: { $step: 0 }, scopes: ['GAP'] } },
    ]);
    assert.equal(idOf([{ id: 'V:9' }, { ok: true }]), 'V:9');
  });

  it('writes a colour as Figma holds it, and an alias as FigCraft takes one', () => {
    const colour = translate({
      kind: 'SET_VARIABLE_VALUE',
      variableId: 'V:1',
      modeId: 'C:1/m1',
      value: { r: 0.1, g: 0.2, b: 0.3, a: 0.5 },
      label: '',
      tokenPath: 'ink',
      modeName: 'light',
    });
    assert.deepEqual(colour.steps[0].params.value, { r: 0.1, g: 0.2, b: 0.3, a: 0.5 });
    const alias = translate({
      kind: 'SET_VARIABLE_VALUE',
      variableId: 'V:1',
      modeId: 'C:1/m2',
      value: { type: 'VARIABLE_ALIAS', id: 'V:2' },
      label: '',
      tokenPath: 'ink',
      modeName: 'dark',
    });
    assert.deepEqual(alias.steps[0].params.value, { alias: 'V:2' });
  });

  it("spells a text style in FigCraft's words: lengths as pixels or percentages, case and decoration", () => {
    const { steps } = translate({
      kind: 'CREATE_STYLE',
      styleType: 'TEXT',
      name: 'heading',
      tokenPath: 'heading',
      props: {
        fontFamily: 'Inter',
        fontStyle: 'Bold',
        fontSize: 28,
        lineHeight: { unit: 'AUTO' },
        letterSpacing: { unit: 'PERCENT', value: -2 },
        textCase: 'SMALL_CAPS',
        textDecoration: 'UNDERLINE',
      },
      bindings: [
        { field: 'fontSize', variableId: 'V:2' },
        { field: 'fontWeight', variableId: 'V:3' },
      ],
    });
    assert.deepEqual(steps, [
      {
        command: 'style.create',
        params: {
          type: 'text',
          name: 'heading',
          value: {
            fontFamily: 'Inter',
            fontStyle: 'Bold',
            fontSize: 28,
            lineHeight: 'auto',
            letterSpacing: '-2%',
            case: 'smallCaps',
            decoration: 'underline',
          },
        },
      },
      // FigCraft binds no font weight: the weight stays in the font style, written.
      { command: 'style.bind', params: { style: { $step: 0 }, field: 'fontSize', variable: 'V:2' } },
    ]);
  });

  it("lets go of a style's bound fields before writing it again", () => {
    const { steps } = translate(
      {
        kind: 'UPDATE_STYLE',
        styleId: 'S:1',
        tokenPath: 'shadow',
        props: {
          effects: [
            {
              type: 'INNER_SHADOW',
              color: { r: 0, g: 0, b: 0, a: 0.5 },
              offset: { x: 1, y: 2 },
              radius: 3,
              spread: 0,
              visible: true,
              blendMode: 'NORMAL',
            },
          ],
        },
        bindings: [{ field: 'radius', variableId: 'V:2', index: 0 }],
      },
      { id: 'S:1', name: 'shadow', type: 'effect', bound: { 'effects/0/color': 'V:1' } },
    );
    assert.deepEqual(steps, [
      { command: 'style.bind', params: { style: 'S:1', field: 'effects/0/color' } },
      {
        command: 'style.update',
        params: {
          style: 'S:1',
          value: [
            {
              type: 'innerShadow',
              color: { r: 0, g: 0, b: 0, a: 0.5 },
              offset: [1, 2],
              radius: 3,
              spread: 0,
              visible: true,
              blend: 'normal',
            },
          ],
        },
      },
      { command: 'style.bind', params: { style: 'S:1', field: 'effects/0/radius', variable: 'V:2' } },
    ]);
  });

  it('places a gradient by the ends of its ramp: left to right at no rotation, upright at a quarter turn', () => {
    const paint = (gradientTransform: Transform) =>
      (
        translate({
          kind: 'CREATE_STYLE',
          styleType: 'PAINT',
          name: 'g',
          tokenPath: 'g',
          props: {
            paints: [
              {
                type: 'GRADIENT_LINEAR',
                gradientTransform,
                gradientStops: [
                  { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
                  { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
                ],
                visible: true,
                opacity: 1,
                blendMode: 'NORMAL',
              },
            ],
          },
        }).steps[0].params.value as any[]
      )[0];
    const flat = paint([
      [1, 0, 0],
      [0, 1, 0],
    ]);
    assert.deepEqual([flat.kind, flat.from, flat.to], ['linear', [0, 0.5], [1, 0.5]]);
    // A quarter turn about the centre, as Toghen builds it for 90°.
    const turned = paint([
      [0, -1, 1],
      [1, 0, 0],
    ]);
    assert.deepEqual(
      [turned.from, turned.to].map((point: number[]) => point.map((n) => Math.round(n * 1e9) / 1e9 + 0)),
      [
        [0.5, 1],
        [0.5, 0],
      ],
    );
  });

  it('refuses what the target does not build yet, by name', () => {
    assert.throws(
      () => translate({ kind: 'BIND_VARIABLE', nodeId: '1', property: 'width', variableId: 'V:1' }),
      /Binding layers is not built for FigCraft yet/,
    );
    assert.throws(() => translate({ kind: 'UPDATE_STYLE', styleId: 'S:9', tokenPath: 'x', props: {} }), /Style not found: S:9/);
  });
});
