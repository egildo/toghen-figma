/**
 * The lock and the locator: a file that uses a published library resolves the library's variables, styles and
 * components through keys kept on its root, filled by discovery (variables) and by a person picking once (components
 * and styles). The library mirrors the fixture the probe of measured behaviour §15 will run against; tokens are
 * synthetic, in the W3C structured shapes.
 */

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver, type ResolverDocument } from '@toghen/lib';
import { createFigmaMock, useFigmaMock, type FigmaMockHandle, type MockLibrary } from './support/figmaMock.js';
import { run } from '../main/components/run.js';
import { ComponentRunError } from '../main/components/errors.js';
import { NOT_IMPORTED } from '../main/components/resolve.js';
import { DISCOVER_VARIABLES, LIBRARY_KEYS, LOCK_FORGET, LOCK_PICK, LOCK_WRITE, SET_BUILD_OVERRIDES } from '../main/handlers/lock.js';
import { loadLock, saveLock } from '../main/utils/lockStore.js';
import { saveTemplates } from '../main/utils/templateStore.js';
import { resetState, setState } from '../main/runtimeState.js';
import { readComponentFile } from '../shared/components/index.js';
import type { Desired, RunOptions } from '../shared/components/index.js';
import type { LibraryKeys, Lock, LockedLibrary, PlanPayload, Response } from '../shared/protocol.js';
import { byAddress } from './components/support.js';

type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const px = (value: number) => ({ value, unit: 'px' });
const srgb = (...components: number[]) => ({ colorSpace: 'srgb', components });
const rgb = (r: number, g: number, b: number) => ({ r, g, b, a: 1 });

/** The design system the library was synced from: its collection is `lib`, the sync's name for a document called so. */
const DOCUMENT = {
  version: '2025-11-01',
  name: 'lib',
  sets: {
    base: {
      sources: [
        {
          space: {
            sm: { $type: 'dimension', $value: px(4) },
            md: { $type: 'dimension', $value: px(8) },
            lg: { $type: 'dimension', $value: px(16) },
          },
          radius: { full: { $type: 'dimension', $value: px(999) } },
          color: {
            accent: { $type: 'color', $value: srgb(0.2, 0.4, 0.9) },
            calm: { $type: 'color', $value: srgb(0.9, 0.9, 0.9) },
            'on-accent': { $type: 'color', $value: srgb(1, 1, 1) },
          },
          text: {
            label: {
              $type: 'typography',
              $value: { fontFamily: ['Inter', 'sans-serif'], fontSize: px(12), fontWeight: 400, lineHeight: 1.2, letterSpacing: px(0) },
            },
          },
          shadow: {
            raised: {
              $type: 'shadow',
              $value: {
                color: { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.4 },
                offsetX: px(0),
                offsetY: px(2),
                blur: px(8),
                spread: px(0),
              },
            },
          },
        },
      ],
    },
  },
  resolutionOrder: [{ $ref: '#/sets/base' }],
} as unknown as ResolverDocument;

const LIBRARY = 'Toghen Test Library';
/** Synthetic keys of 40 hex digits, as Figma's are (measured, §15). */
const key = (n: number): string => n.toString(16).padStart(40, 'a');
const K = {
  lib: key(1),
  sm: key(2),
  md: key(3),
  full: key(4),
  accent: key(5),
  calm: key(6),
  onAccent: key(7),
  label: key(8),
  raised: key(9),
  icon: key(10),
  badge: key(11),
  calmBadge: key(12),
  loudBadge: key(13),
};

/** The library file the probe will read, as the mock holds it. */
const testLibrary = (more: Partial<MockLibrary> = {}): MockLibrary => ({
  name: LIBRARY,
  collections: [
    {
      name: 'lib',
      key: K.lib,
      variables: [
        { name: 'space/sm', key: K.sm, resolvedType: 'FLOAT', value: 4, scopes: ['GAP'] },
        { name: 'space/md', key: K.md, resolvedType: 'FLOAT', value: 8, scopes: ['GAP'] },
        { name: 'radius/full', key: K.full, resolvedType: 'FLOAT', value: 999, scopes: ['CORNER_RADIUS'] },
        { name: 'color/accent', key: K.accent, resolvedType: 'COLOR', value: rgb(0.2, 0.4, 0.9), scopes: ['ALL_FILLS'] },
        { name: 'color/calm', key: K.calm, resolvedType: 'COLOR', value: rgb(0.9, 0.9, 0.9), scopes: ['ALL_FILLS'] },
        { name: 'color/on-accent', key: K.onAccent, resolvedType: 'COLOR', value: rgb(1, 1, 1), scopes: ['TEXT_FILL'] },
      ],
    },
  ],
  styles: [
    { name: 'text/label', key: K.label, type: 'TEXT' },
    { name: 'shadow/raised', key: K.raised, type: 'EFFECT' },
  ],
  components: [{ name: 'Icon', key: K.icon }],
  sets: [
    {
      name: 'Badge',
      key: K.badge,
      variants: [
        { name: 'Tone=calm', key: K.calmBadge },
        { name: 'Tone=loud', key: K.loudBadge },
      ],
    },
  ],
  ...more,
});

/** What discovery and the pick would have written for the test library. */
const lockedLibrary = (): Lock['libraries'][string] => ({
  by: 'person',
  components: { Icon: { key: K.icon, set: false }, Badge: { key: K.badge, set: true } },
  styles: { 'text.label': { key: K.label, kind: 'TEXT' }, 'shadow.raised': { key: K.raised, kind: 'EFFECT' } },
  variables: { 'lib/space/sm': K.sm, 'lib/radius/full': K.full, 'lib/color/accent': K.accent, 'lib/color/on-accent': K.onAccent },
});

const CHIP = `component Chip
FRAME Chip layoutMode=HORIZONTAL itemSpacing="{space.sm}" cornerRadius="{radius.full}" effectStyle="{shadow.raised}" {
    fills "{color.accent}"
    TEXT Label characters="Chip" textStyle="{text.label}" {
        fills "{color.on-accent}"
    }
    INSTANCE Glyph component=Icon
    INSTANCE Tag component=Badge
}
`;

const desiredFrom = (text: string): Desired => {
  const file = readComponentFile(text);
  assert.deepEqual(
    file.problems.filter((p) => p.severity === 'error'),
    [],
  );
  return JSON.parse(JSON.stringify({ component: file.component, members: file.members })) as Desired;
};

const figmaOf = (): any => (globalThis as { figma?: unknown }).figma; // eslint-disable-line @typescript-eslint/no-explicit-any
const posted = (mock: FigmaMockHandle) => mock.calls('ui.postMessage').map((call) => call.args[0] as Response);
const problemsOf = async (promise: Promise<unknown>): Promise<string[]> => {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof ComponentRunError, String(error));
    return error.problems;
  }
  assert.fail('the run did not stop');
};

const withLock = (lock: Lock): void => assert.deepEqual(saveLock(lock), { ok: true });
const declared: RunOptions = { libraries: [LIBRARY] };

describe('the lock', () => {
  useFigmaMock();
  beforeEach(() => setState({ resolver: new Resolver(DOCUMENT) }));
  afterEach(() => resetState());

  it('round-trips through sharding, past one entry, and reads a damaged record as empty', () => {
    const mock = createFigmaMock().install();
    const variables: Record<string, string> = {};
    for (let n = 0; n < 2500; n += 1) variables[`lib/size/step-${n}-é`] = key(n);
    const lock: Lock = { libraries: { [LIBRARY]: { ...lockedLibrary(), variables, fileKey: 'synthetic' } }, overrides: { Glyph: 'Icon' } };
    withLock(lock);
    assert.ok(Object.keys(mock.sharedPluginData('toghen')).includes('lock.1'), 'the lock took more than one shard');
    assert.deepEqual(loadLock(), lock);

    createFigmaMock().withSharedPluginData('toghen', 'lock', 'not json').install();
    assert.deepEqual(loadLock(), { libraries: {} });
  });

  describe('discovery', () => {
    const keep = () =>
      saveTemplates([
        { name: 'Chip', fileName: 'chip.component.kdl', text: CHIP, kept: '2026-10-22T09:00:00.000Z' },
        {
          name: 'Chips',
          fileName: 'chips.blueprint.kdl',
          text: `page Chips\nlibrary "${LIBRARY}"\n\ncomponent Row {\n    FRAME Row layoutMode=HORIZONTAL itemSpacing="{space.md}" paddingLeft="{space.lg}"\n}\n`,
          kept: '2026-10-22T09:00:00.000Z',
        },
      ]);

    it('writes the key of every variable the kept files bind that one enabled library has', async () => {
      const mock = createFigmaMock().withLibrary(testLibrary()).install();
      keep();
      await DISCOVER_VARIABLES();

      const library = loadLock().libraries[LIBRARY];
      assert.equal(library.by, 'discovery');
      assert.deepEqual(library.variables, {
        'lib/space/sm': K.sm,
        'lib/radius/full': K.full,
        'lib/color/accent': K.accent,
        'lib/color/on-accent': K.onAccent,
        'lib/space/md': K.md,
      });

      const plan = posted(mock).find((message) => message.type === 'PLAN_READY')!.payload as PlanPayload;
      assert.equal(plan.planType, 'discovery');
      // One row per token: five found, and space.lg, which no library has.
      assert.equal(plan.operations.length, 6);
      assert.ok(plan.operations.some((op) => op.kind === 'NOTE' && op.message === '{space.lg}: no enabled library has "lib/space/lg".'));
      assert.deepEqual(plan.summary, { found: 5, choices: 0, 'not found': 1 });
      assert.equal(posted(mock).at(-1)!.type, 'LOCK');
    });

    it('lists a match in two libraries as a choice, and writes it under neither', async () => {
      const second: MockLibrary = {
        name: 'Second Library',
        collections: [{ name: 'lib', key: key(100), variables: [{ name: 'color/accent', key: key(101), resolvedType: 'COLOR' }] }],
      };
      const mock = createFigmaMock().withLibrary(testLibrary()).withLibrary(second).install();
      // A key written before the second library was enabled is no longer the lock's to answer.
      withLock({ libraries: { [LIBRARY]: { by: 'discovery', components: {}, styles: {}, variables: { 'lib/color/accent': K.accent } } } });
      keep();
      await DISCOVER_VARIABLES();

      const lock = loadLock();
      assert.equal(lock.libraries[LIBRARY].variables['lib/color/accent'], undefined);
      assert.equal(lock.libraries['Second Library'], undefined);
      const plan = posted(mock).find((message) => message.type === 'PLAN_READY')!.payload as PlanPayload;
      const choice = plan.operations.filter((op) => op.kind === 'WARNING');
      assert.deepEqual(choice, [
        {
          kind: 'WARNING',
          path: 'color.accent',
          message: `"lib/color/accent" is in "${LIBRARY}" and "Second Library": a choice, so nothing was written for it. Name the one to use in the overrides map, as (key)"…".`,
        },
      ]);
    });

    it('does not list a library that is not enabled', async () => {
      createFigmaMock()
        .withLibrary(testLibrary({ enabled: false }))
        .install();
      keep();
      await DISCOVER_VARIABLES();
      assert.deepEqual(loadLock().libraries, {});
    });

    it('needs the design system loaded, which gives each token its collection', async () => {
      resetState();
      const mock = createFigmaMock().withLibrary(testLibrary()).install();
      await DISCOVER_VARIABLES();
      const [error] = posted(mock);
      assert.ok(error.type === 'ERROR' && error.payload.code === 'NO_RESOLVER');
    });
  });

  describe('a person picking once', () => {
    it('writes the set of a selected variant, a component, and a selected layer’s library styles', async () => {
      const mock = createFigmaMock().withLibrary(testLibrary()).install();
      const figma = figmaOf();
      const badge = (await figma.importComponentSetByKeyAsync(K.badge)).defaultVariant.createInstance();
      figma.currentPage.selection = [badge];
      await LOCK_PICK({ library: LIBRARY });

      const icon = (await figma.importComponentByKeyAsync(K.icon)).createInstance();
      await icon.setEffectStyleIdAsync((await figma.importStyleByKeyAsync(K.raised)).id);
      figma.currentPage.selection = [icon];
      await LOCK_PICK({ library: LIBRARY });

      await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
      const text = figma.createText();
      await text.setTextStyleIdAsync((await figma.importStyleByKeyAsync(K.label)).id);
      figma.currentPage.selection = [text];
      await LOCK_PICK({ library: LIBRARY });

      assert.deepEqual(loadLock().libraries[LIBRARY], {
        by: 'person',
        components: { Badge: { key: K.badge, set: true }, Icon: { key: K.icon, set: false } },
        styles: { 'shadow.raised': { key: K.raised, kind: 'EFFECT' }, 'text.label': { key: K.label, kind: 'TEXT' } },
        variables: {},
      });
      assert.equal(posted(mock).at(-1)!.type, 'LOCK');
    });

    it('refuses a layer that holds nothing from a library, and writes nothing', async () => {
      const mock = createFigmaMock().withComponent('Local').install();
      const figma = figmaOf();
      const [local] = figma.root.children[0].findAllWithCriteria({ types: ['COMPONENT'] });
      figma.currentPage.selection = [local.createInstance()];
      await LOCK_PICK({ library: LIBRARY });
      const [error] = posted(mock);
      assert.ok(error.type === 'ERROR' && error.payload.code === 'INVALID_PICK', JSON.stringify(error));
      assert.deepEqual(loadLock(), { libraries: {} });
    });
  });

  describe('the locator', () => {
    it('resolves a declared library’s components, variables and styles through the lock, importing each by key', async () => {
      const mock = createFigmaMock().withLibrary(testLibrary()).install();
      withLock({ libraries: { [LIBRARY]: lockedLibrary() } });
      const report = await run(desiredFrom(CHIP), declared);

      const nodes = byAddress(mock.node(report.setId!) as Node);
      const chip = nodes.get('Chip')!;
      const figma = figmaOf();
      const variable = async (k: string) => (await figma.variables.importVariableByKeyAsync(k)).id;
      assert.equal(chip.boundVariables.itemSpacing.id, await variable(K.sm));
      assert.equal(chip.effectStyleId, (await figma.importStyleByKeyAsync(K.raised)).id);
      assert.equal(nodes.get('Label')!.textStyleId, (await figma.importStyleByKeyAsync(K.label)).id);
      assert.equal((await nodes.get('Glyph')!.getMainComponentAsync()).key, K.icon);
      assert.equal((await nodes.get('Tag')!.getMainComponentAsync()).parent.key, K.badge);
      for (const api of ['importVariableByKeyAsync', 'importStyleByKeyAsync', 'importComponentByKeyAsync', 'importComponentSetByKeyAsync'])
        assert.ok(mock.calls(api).length > 0, api);
    });

    it('leaves a component file local when its caller declares no library', async () => {
      createFigmaMock().withLibrary(testLibrary()).install();
      withLock({ libraries: { [LIBRARY]: lockedLibrary() } });
      const problems = await problemsOf(run(desiredFrom(CHIP)));
      assert.ok(problems.includes('component "Icon" (line 7) is not in this file'), problems.join('\n'));
    });

    it('stops on a name found in this file and in a declared library, naming both', async () => {
      createFigmaMock()
        .withCollection('lib', ['default'])
        .withVariable('lib', 'space/sm', 'FLOAT', { default: 4 })
        .withComponent('Icon')
        .withLibrary(testLibrary())
        .install();
      withLock({ libraries: { [LIBRARY]: lockedLibrary() } });
      const problems = await problemsOf(run(desiredFrom(CHIP), declared));
      assert.ok(
        problems.some((p) =>
          p.startsWith(
            `token {space.sm} (line 2) is in this file (lib: "space/sm") and in library "${LIBRARY}": a name found in both stops the build`,
          ),
        ),
        problems.join('\n'),
      );
      assert.ok(
        problems.some((p) => /^component "Icon" \(line 7\) is in this file \(.+\) and in library "Toghen Test Library"/.test(p)),
        problems.join('\n'),
      );
    });

    it('replaces a name from the overrides map first: a name, a key, and a library', async () => {
      const mock = createFigmaMock().withLibrary(testLibrary()).install();
      withLock({
        libraries: { Core: lockedLibrary() },
        overrides: { [LIBRARY]: 'Core', Icon: 'Badge', 'color.accent': `(key)"${K.calm}"` },
      });
      const report = await run(desiredFrom(CHIP), declared);
      const nodes = byAddress(mock.node(report.setId!) as Node);
      assert.equal((await nodes.get('Glyph')!.getMainComponentAsync()).parent.key, K.badge);
      assert.equal(nodes.get('Chip').fills[0].boundVariables.color.id, (await figmaOf().variables.importVariableByKeyAsync(K.calm)).id);
      assert.ok(report.notes.includes('component "Icon" (line 7) is read as "Badge", as the overrides map says'), report.notes.join('\n'));
      assert.ok(
        report.notes.includes(`token {color.accent} (line 3) is read as (key)"${K.calm}", as the overrides map says`),
        report.notes.join('\n'),
      );
    });

    it('imports nothing on a dry run, and says what it would import', async () => {
      const mock = createFigmaMock().withLibrary(testLibrary()).install();
      withLock({ libraries: { [LIBRARY]: lockedLibrary() } });
      const report = await run(desiredFrom(CHIP), { ...declared, dryRun: true });
      assert.deepEqual(
        mock.writes().filter((call) => call.api.startsWith('import')),
        [],
      );
      assert.ok(
        report.pending.includes(`token {space.sm} (line 2): would import "lib/space/sm" from library "${LIBRARY}"`),
        report.pending.join('\n'),
      );
      assert.ok(
        report.pending.includes(`component "Badge" (line 8): would import the component set "Badge" from library "${LIBRARY}"`),
        report.pending.join('\n'),
      );
      assert.ok(
        report.pending.includes(`effect style {shadow.raised} (line 2): would import "shadow/raised" from library "${LIBRARY}"`),
        report.pending.join('\n'),
      );
    });

    it('says what to do when a key does not import: not published, or not this key', async () => {
      createFigmaMock()
        .withLibrary(testLibrary({ published: false }))
        .install();
      withLock({ libraries: { [LIBRARY]: lockedLibrary() } });
      const problems = await problemsOf(run(desiredFrom(CHIP), declared));
      assert.ok(
        problems.includes(`token {space.sm} (line 2): "lib/space/sm" from library "${LIBRARY}" did not import: ${NOT_IMPORTED}`),
        problems.join('\n'),
      );
      assert.ok(
        problems.includes(`component "Icon" (line 7): the component "Icon" from library "${LIBRARY}" did not import: ${NOT_IMPORTED}`),
        problems.join('\n'),
      );
      assert.equal(NOT_IMPORTED, 'not published, or not this key: publish the library, then accept its update in this file');
    });
  });

  describe('forgetting and the overrides map', () => {
    it('forgets a library, and keeps the overrides map, dropping empty rows', () => {
      const mock = createFigmaMock().install();
      withLock({ libraries: { [LIBRARY]: lockedLibrary() } });
      SET_BUILD_OVERRIDES({ overrides: { Glyph: 'Icon', Empty: '' } });
      LOCK_FORGET({ library: LIBRARY });
      assert.deepEqual(loadLock(), { libraries: {}, overrides: { Glyph: 'Icon' } });
      SET_BUILD_OVERRIDES({ overrides: {} });
      assert.deepEqual(loadLock(), { libraries: {} });
      assert.equal(posted(mock).at(-1)!.type, 'LOCK');
    });
  });

  describe('written by the command line', () => {
    it("refuses an entry not in the lock's shape, and writes nothing", () => {
      const mock = createFigmaMock().install();
      LOCK_WRITE({ library: LIBRARY, entry: { by: 'somebody', components: {}, styles: {}, variables: {} } as unknown as LockedLibrary });
      LOCK_WRITE({ library: ' ', entry: lockedLibrary() });
      assert.deepEqual(
        posted(mock).map((message) => message.type),
        ['ERROR', 'ERROR'],
      );
      assert.deepEqual(loadLock(), { libraries: {} });
    });

    it('reads, in the library file, only the styles the style sync stamped, and every variable by its collection', async () => {
      const mock = createFigmaMock().withCollection('lib', ['default']).withPublishStatus('space/sm', 'CURRENT').install();
      const collection = (await figmaOf().variables.getLocalVariableCollectionsAsync())[0];
      figmaOf().variables.createVariable('space/sm', collection, 'FLOAT');
      const stamped = figmaOf().createTextStyle();
      stamped.name = 'text/label';
      stamped.setSharedPluginData('toghen', 'stamp', JSON.stringify({ is: { token: 'lib.text.label' }, id: stamped.id, receipt: {} }));
      figmaOf().createTextStyle().name = 'Hand made';

      await LIBRARY_KEYS();
      const read = posted(mock).at(-1)!;
      assert.equal(read.type, 'LIBRARY_KEYS_READ');
      const keys = read.payload as LibraryKeys;
      assert.deepEqual(Object.keys(keys.styles), ['text.label']);
      assert.deepEqual({ ...keys.styles['text.label'], key: '' }, { key: '', kind: 'TEXT', status: 'UNPUBLISHED' });
      assert.deepEqual(Object.keys(keys.variables), ['lib/space/sm']);
      assert.equal(keys.variables['lib/space/sm'].status, 'CURRENT');
      assert.ok(!('fileKey' in keys), 'figma.fileKey reads undefined in a plugin without enablePrivatePluginApi');
    });

    it('records a style’s status as undefined, with a warning, where Figma gives the style no getPublishStatusAsync', async () => {
      const mock = createFigmaMock().withCollection('lib', ['default']).install();
      const withMethod = figmaOf().createTextStyle();
      withMethod.name = 'text/label';
      withMethod.setSharedPluginData(
        'toghen',
        'stamp',
        JSON.stringify({ is: { token: 'lib.text.label' }, id: withMethod.id, receipt: {} }),
      );
      const without = figmaOf().createEffectStyle();
      without.name = 'shadow/raised';
      without.setSharedPluginData('toghen', 'stamp', JSON.stringify({ is: { token: 'lib.shadow.raised' }, id: without.id, receipt: {} }));
      Object.defineProperty(without, 'getPublishStatusAsync', { value: undefined });

      await LIBRARY_KEYS();
      const keys = posted(mock).at(-1)!.payload as LibraryKeys;
      assert.equal(keys.styles['text.label'].status, 'UNPUBLISHED');
      assert.equal(keys.styles['shadow.raised'].status, undefined);
      assert.deepEqual(keys.warnings, [
        'The publish status of the effect style "shadow/raised" could not be read: this Figma gives styles no getPublishStatusAsync.',
      ]);
    });
  });

  // Measured, §15 second pass: what a real file does with a published library's objects.
  describe('what an imported object does', () => {
    it('refuses a publish status for an imported variable and collection, and reads UNPUBLISHED for an imported component', async () => {
      createFigmaMock().withLibrary(testLibrary()).install();
      const variable = await figmaOf().variables.importVariableByKeyAsync(K.sm);
      await assert.rejects(
        variable.getPublishStatusAsync(),
        /in getPublishStatusAsync: can only query publish status for local variables$/,
      );
      const collection = await figmaOf().variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
      await assert.rejects(
        collection.getPublishStatusAsync(),
        /in getPublishStatusAsync: can only query publish status for local variable collections$/,
      );
      const component = await figmaOf().importComponentByKeyAsync(K.icon);
      assert.equal(await component.getPublishStatusAsync(), 'UNPUBLISHED');
    });

    it('gives the same id and a different object on each import of one variable', async () => {
      createFigmaMock().withLibrary(testLibrary()).install();
      const first = await figmaOf().variables.importVariableByKeyAsync(K.sm);
      const second = await figmaOf().variables.importVariableByKeyAsync(K.sm);
      assert.equal(first.id, second.id);
      assert.notEqual(first, second);
    });

    it('lists, in an imported collection, only the variables imported so far', async () => {
      createFigmaMock().withLibrary(testLibrary()).install();
      const first = await figmaOf().variables.importVariableByKeyAsync(K.sm);
      const listed = async () => (await figmaOf().variables.getVariableCollectionByIdAsync(first.variableCollectionId)).variableIds;
      assert.deepEqual(await listed(), [first.id]);
      await figmaOf().variables.importVariableByKeyAsync(K.sm);
      assert.deepEqual(await listed(), [first.id], 'a second import of one key adds nothing');
      const md = await figmaOf().variables.importVariableByKeyAsync(K.md);
      assert.deepEqual(await listed(), [first.id, md.id]);
    });
  });
});
