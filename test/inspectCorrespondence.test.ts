import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Resolver, type ResolverDocument } from '@toghen/lib';
import { INSPECT_CORRESPONDENCE } from '../main/handlers/inspectCorrespondence.js';
import { VariableSyncEngine } from '../main/engines/variableSyncEngine.js';
import { getState, resetState, setState } from '../main/runtimeState.js';
import { defaultTokenTypeMap, type TokenTypeConversionMap } from '../shared/tokenTypeMap.js';
import type { InspectionPayload, TokenReport } from '../shared/protocol.js';
import { createFigmaMock, useFigmaMock, type FigmaMockHandle } from './support/figmaMock.js';
import { stampAsApplied } from './support/stamps.js';

/**
 * The base collection's name is the document's `name`, through
 * `figmaCollectionNameFor` — the same expression the sync plan uses, so both
 * look at the same Figma collections. `spacing.md` lives in it; `color.primary`
 * lives in the `theme` collection, which the modifier names.
 */
const COLLECTION = 'Demo';

/** Two themes; `color.primary` differs between them, `spacing.md` does not. */
function themedDocument(primary: { light: unknown; dark: unknown } = { light: '#0055cc', dark: '#112233' }): Resolver {
  return new Resolver({
    version: '2025-11-01',
    name: COLLECTION,
    sets: {
      base: {
        sources: [{ spacing: { md: { $type: 'dimension', $value: '16px' } } }],
      },
    },
    modifiers: {
      theme: {
        default: 'light',
        contexts: {
          light: [{ color: { primary: { $type: 'color', $value: primary.light } } }],
          dark: [{ color: { primary: { $type: 'color', $value: primary.dark } } }],
        },
      },
    },
    resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
  } as ResolverDocument);
}

/** The last inspection the handler posted. */
function inspection(mock: FigmaMockHandle): InspectionPayload {
  const posted = mock
    .calls('ui.postMessage')
    .map((call) => call.args[0] as { type: string; payload: unknown })
    .filter((message) => message.type === 'CORRESPONDENCE');

  assert.ok(posted.length > 0, 'no CORRESPONDENCE was posted');
  return posted[posted.length - 1].payload as InspectionPayload;
}

const tokenAt = (payload: InspectionPayload, path: string): TokenReport => {
  const token = payload.tokens.find((entry) => entry.path === path);
  assert.ok(token, `no token reported for ${path}`);
  return token;
};

const modeOf = (token: TokenReport, mode: string) => {
  const found = token.modes.find((entry) => entry.mode === mode);
  assert.ok(found, `no mode "${mode}" on ${token.path}`);
  return found;
};

/**
 * Stamps the file as though every value the plan would write had been applied.
 *
 * Built by running the real planner rather than by hand: the receipts have to
 * be for the writes the engine plans, or a test would assert against stamps no
 * sync could ever have written.
 */
async function recordAsSynced(resolver: Resolver, _mock: FigmaMockHandle): Promise<void> {
  await stampAsApplied((await new VariableSyncEngine().buildPlan(resolver, COLLECTION, defaultTokenTypeMap)).operations);
}

function load(resolver: Resolver | null, conversionMap: TokenTypeConversionMap = defaultTokenTypeMap): void {
  setState({ resolver, conversionMap });
}

/** A file already holding exactly what `themedDocument()` asks for. */
function syncedFile(): FigmaMockHandle {
  return createFigmaMock()
    .withCollection(COLLECTION, ['default'])
    .withCollection('theme', ['light', 'dark'])
    .withVariable('theme', 'color/primary', 'COLOR', {
      light: { r: 0, g: 1 / 3, b: 0.8, a: 1 },
      dark: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255, a: 1 },
    })
    .withVariable(COLLECTION, 'spacing/md', 'FLOAT', { default: 16 })
    .install();
}

const modeIdFor = (mock: FigmaMockHandle, mode: string, collection = 'theme'): string =>
  mock.collection(collection)!.modes.find((entry) => entry.name === mode)!.modeId;

describe('INSPECT_CORRESPONDENCE', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  it('refuses to guess when no document is loaded', async () => {
    const mock = createFigmaMock().install();

    await INSPECT_CORRESPONDENCE();

    const errors = mock
      .calls('ui.postMessage')
      .map((call) => call.args[0] as { type: string; payload: { code?: string } })
      .filter((message) => message.type === 'ERROR');
    assert.equal(errors.length, 1);
    assert.equal(errors[0].payload.code, 'NO_RESOLVER');
  });

  it('stamps when it looked', async () => {
    const mock = syncedFile();
    load(themedDocument());

    const before = Date.now();
    await INSPECT_CORRESPONDENCE();
    const after = Date.now();

    // Not decoration: the picture is only true for the instant it was taken,
    // and a standing claim with no timestamp is the badge from smell #22.
    const at = Date.parse(inspection(mock).checkedAt);
    assert.ok(at >= before && at <= after, `checkedAt ${at} outside [${before}, ${after}]`);
  });

  it('calls a file that matches the document current', async () => {
    const mock = syncedFile();
    const resolver = themedDocument();
    load(resolver);
    await recordAsSynced(resolver, mock);

    await INSPECT_CORRESPONDENCE();
    const payload = inspection(mock);

    assert.equal(payload.counts.current, 2);
    assert.equal(payload.counts.drifted, 0);
    assert.equal(payload.counts.outdated, 0);
    assert.equal(tokenAt(payload, 'Demo.color.primary').state, 'current');
  });

  it('shows both sides in the same representation', async () => {
    const mock = syncedFile();
    const resolver = themedDocument();
    load(resolver);
    await recordAsSynced(resolver, mock);

    await INSPECT_CORRESPONDENCE();
    const light = modeOf(tokenAt(inspection(mock), 'Demo.color.primary'), 'theme / light');

    // A hex string against `{r: 0, g: 0.333…, b: 0.8, a: 1}` would leave the
    // reader to do the conversion this pane exists to have already done.
    assert.equal(light.documentValue, '#0055cc');
    assert.equal(light.figmaValue, '#0055cc');
    assert.equal(light.agrees, true);
  });

  it('names a value changed in Figma, and only the mode it changed in', async () => {
    const mock = syncedFile();
    const resolver = themedDocument();
    load(resolver);
    await recordAsSynced(resolver, mock);

    mock.variable('theme', 'color/primary')!.valuesByMode[modeIdFor(mock, 'dark')] = { r: 1, g: 0, b: 0, a: 1 };

    await INSPECT_CORRESPONDENCE();
    const token = tokenAt(inspection(mock), 'Demo.color.primary');

    assert.equal(token.state, 'drifted');
    assert.match(token.note ?? '', /dark/);
    assert.doesNotMatch(token.note ?? '', /light/);
    assert.equal(modeOf(token, 'theme / dark').agrees, false);
    assert.equal(modeOf(token, 'theme / light').agrees, true);
  });

  it('does not mistake float32 storage for a person', async () => {
    const mock = syncedFile();
    const resolver = themedDocument();
    load(resolver);
    await recordAsSynced(resolver, mock);

    // What Figma actually returns after being sent 0.8 — see
    // `.reference/figma/measured_behaviour.md`.
    mock.variable('theme', 'color/primary')!.valuesByMode[modeIdFor(mock, 'light')] = {
      r: 0,
      g: 0.3333333432674408,
      b: 0.800000011920929,
      a: 1,
    };

    await INSPECT_CORRESPONDENCE();

    assert.equal(tokenAt(inspection(mock), 'Demo.color.primary').state, 'current');
  });

  it('reads the documented structured colour shape, not only a hex string', async () => {
    const mock = createFigmaMock()
      .withCollection(COLLECTION, ['default'])
      .withCollection('theme', ['light', 'dark'])
      .withVariable('theme', 'color/primary', 'COLOR', {
        light: { r: 0, g: 0.4, b: 0.8, a: 1 },
        dark: { r: 0x11 / 255, g: 0x22 / 255, b: 0x33 / 255, a: 1 },
      })
      .withVariable(COLLECTION, 'spacing/md', 'FLOAT', { default: 16 })
      .install();

    load(
      themedDocument({
        light: { colorSpace: 'srgb', components: [0, 0.4, 0.8], alpha: 1 },
        dark: '#112233',
      }),
    );

    await INSPECT_CORRESPONDENCE();
    const light = modeOf(tokenAt(inspection(mock), 'Demo.color.primary'), 'theme / light');

    assert.equal(light.documentValue, '#0066cc');
    assert.equal(light.agrees, true);
  });

  it('says the document moved without claiming Figma stood still', async () => {
    const mock = syncedFile();
    await recordAsSynced(themedDocument(), mock);
    // The document now asks for something else; Figma still holds the old value.
    load(themedDocument({ light: '#ff0000', dark: '#112233' }));

    await INSPECT_CORRESPONDENCE();
    const token = tokenAt(inspection(mock), 'Demo.color.primary');

    assert.equal(token.state, 'outdated');
    assert.match(token.note ?? '', /document has changed/);
    // It says what moved and what Figma holds, not what a sync would do.
    assert.doesNotMatch(token.note ?? '', /still holds|untouched|unchanged/);
  });

  it('names a value changed in Figma as drifted where the document moved too', async () => {
    const mock = syncedFile();
    await recordAsSynced(themedDocument(), mock);
    load(themedDocument({ light: '#ff0000', dark: '#112233' }));
    mock.variable('theme', 'color/primary')!.valuesByMode[modeIdFor(mock, 'light')] = { r: 0, g: 1, b: 0, a: 1 };

    await INSPECT_CORRESPONDENCE();
    const token = tokenAt(inspection(mock), 'Demo.color.primary');

    assert.equal(token.state, 'drifted');
    assert.match(token.note ?? '', /light/);
  });

  it('calls it current when both sides agree and only the stamp is behind', async () => {
    const mock = syncedFile();
    await recordAsSynced(themedDocument(), mock);

    // Both sides move to the same new value: the stamp is stale, but a direct
    // comparison says the two agree — and agreement is the fact that was checked.
    load(themedDocument({ light: '#ff0000', dark: '#112233' }));
    mock.variable('theme', 'color/primary')!.valuesByMode[modeIdFor(mock, 'light')] = {
      r: 1,
      g: 0,
      b: 0,
      a: 1,
    };

    await INSPECT_CORRESPONDENCE();
    const token = tokenAt(inspection(mock), 'Demo.color.primary');

    assert.equal(token.state, 'current');
    assert.match(token.note ?? '', /stamp does not record this value/);
  });

  it('reports a token no variable holds as absent', async () => {
    const mock = createFigmaMock().withCollection(COLLECTION, ['default']).install();
    load(themedDocument());

    await INSPECT_CORRESPONDENCE();
    const payload = inspection(mock);

    assert.equal(payload.counts.absent, 2);
    assert.equal(tokenAt(payload, 'Demo.spacing.md').state, 'absent');
  });

  it('distinguishes a variable it never wrote from one it did', async () => {
    // Present by name, with nothing recorded about it: syncing would write into
    // somebody else's object, and calling that "absent" would hide the fact.
    const mock = syncedFile();
    load(themedDocument());

    await INSPECT_CORRESPONDENCE();
    const token = tokenAt(inspection(mock), 'Demo.spacing.md');

    assert.equal(token.state, 'adopted');
    assert.match(token.note ?? '', /already exists and was not/);
  });

  it('blocks a token whose name is taken by a variable of another type', async () => {
    const mock = createFigmaMock()
      .withCollection(COLLECTION, ['default'])
      .withVariable(COLLECTION, 'spacing/md', 'STRING', { default: '16px' })
      .install();
    load(themedDocument());

    await INSPECT_CORRESPONDENCE();
    const token = tokenAt(inspection(mock), 'Demo.spacing.md');

    assert.equal(token.state, 'blocked');
    assert.match(token.note ?? '', /cannot change a variable's type/);
  });

  it('blocks a token no variable can hold', async () => {
    const mock = syncedFile();
    load(themedDocument(), { ...defaultTokenTypeMap, dimension: { target: 'skip' } });

    await INSPECT_CORRESPONDENCE();
    const token = tokenAt(inspection(mock), 'Demo.spacing.md');

    assert.equal(token.state, 'blocked');
    assert.match(token.note ?? '', /No Figma variable can hold/);
  });

  it('shows a style-backed token rather than dropping it, and says it was not measured', async () => {
    const mock = syncedFile();
    // `typography`, `shadow` and `gradient` route to styles in the default map;
    // this reaches the same branch without a composite fixture.
    load(themedDocument(), { ...defaultTokenTypeMap, dimension: { target: 'style', styleType: 'TEXT' } });

    await INSPECT_CORRESPONDENCE();
    const payload = inspection(mock);
    const token = tokenAt(payload, 'Demo.spacing.md');

    assert.equal(token.state, 'not_inspected');
    assert.match(token.note ?? '', /not compared yet/);
    // Counted apart, so a summary cannot fold an unmeasured token into "current".
    assert.equal(payload.counts.not_inspected, 1);
    assert.equal(payload.counts.current + payload.counts.adopted, 1);
  });

  it('shows a reference as the variable it will alias, by name', async () => {
    const mock = createFigmaMock().install();
    load(
      new Resolver({
        version: '2025-11-01',
        name: COLLECTION,
        sets: {
          base: {
            sources: [
              {
                color: {
                  $type: 'color',
                  brand: { $value: { colorSpace: 'srgb', components: [0, 0.4, 0.8] } },
                  link: { $value: '{color.brand}' },
                },
              },
            ],
          },
        },
        resolutionOrder: [{ $ref: '#/sets/base' }],
      } as ResolverDocument),
    );

    await INSPECT_CORRESPONDENCE();
    const token = tokenAt(inspection(mock), 'Demo.color.link');

    // Neither variable exists yet, so the alias holds a symbolic id; the row
    // names the variable rather than showing the symbol.
    assert.equal(modeOf(token, 'Demo / default').documentValue, '→ color/brand');
  });

  it('reports a chain as one token, a row for each mode of each link, and drift in either', async () => {
    const chain = new Resolver({
      version: '2025-11-01',
      name: COLLECTION,
      sets: { base: { sources: [{ button: { bg: { $type: 'color', $value: '#eeeeee' } } }] } },
      modifiers: {
        scheme: { default: 'light', contexts: { light: [{}], dark: [{ button: { bg: { $value: '#333333' } } }] } },
        tone: { default: 'neutral', contexts: { neutral: [{}], alert: [{ button: { bg: { $value: '#cc2222' } } }] } },
      },
      resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/scheme' }, { $ref: '#/modifiers/tone' }],
    } as ResolverDocument);
    const mock = createFigmaMock().install();
    load(chain);

    await INSPECT_CORRESPONDENCE();
    const token = tokenAt(inspection(mock), 'Demo.button.bg');

    assert.equal(token.state, 'absent');
    assert.deepEqual(
      token.modes.map((mode) => mode.mode),
      ['tone / neutral', 'tone / alert', 'scheme / light', 'scheme / dark'],
    );
    // The head, `neutral`, is an alias to the link in the other collection.
    assert.equal(modeOf(token, 'tone / neutral').documentValue, '→ button/bg--scheme');
    assert.equal(modeOf(token, 'scheme / dark').documentValue, '#333333');
    assert.equal(token.variableName, 'button/bg');
  });

  it('blocks a token with a hole, and says where', async () => {
    const mock = createFigmaMock().install();
    load(
      new Resolver({
        version: '2025-11-01',
        name: COLLECTION,
        sets: { base: { sources: [{}] } },
        modifiers: {
          theme: {
            default: 'light',
            // Defined by dark alone, and no base: light has no value.
            contexts: { light: [{}], dark: [{ color: { overlay: { $type: 'color', $value: '#00000080' } } }] },
          },
        },
        resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
      } as ResolverDocument),
    );

    await INSPECT_CORRESPONDENCE();
    const token = tokenAt(inspection(mock), 'Demo.color.overlay');

    assert.equal(token.state, 'blocked');
    assert.match(token.note ?? '', /no value where theme=light/);
    assert.deepEqual(token.modes, []);
  });

  it('blocks a token whose collection lost its default context', async () => {
    const mock = createFigmaMock().withCollection(COLLECTION, ['default']).withCollection('theme', ['light/cosy', 'dark/cosy']).install();
    load(themedDocument());

    await INSPECT_CORRESPONDENCE();
    const payload = inspection(mock);

    assert.equal(tokenAt(payload, 'Demo.color.primary').state, 'blocked');
    assert.match(tokenAt(payload, 'Demo.color.primary').note ?? '', /default mode, which the modifier no longer has/);
    assert.equal(tokenAt(payload, 'Demo.spacing.md').state, 'absent');
  });

  it('says so when the sum cannot be built', async () => {
    const mock = createFigmaMock().install();
    load(
      new Resolver({
        version: '2025-11-01',
        name: COLLECTION,
        sets: { base: { sources: [{ color: { primary: { $type: 'color', $value: '#0055cc' } } }] } },
        modifiers: { theme: { contexts: { light: [{}], dark: [{}] } } },
        resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/theme' }],
      } as ResolverDocument),
    );

    await INSPECT_CORRESPONDENCE();

    const errors = mock
      .calls('ui.postMessage')
      .map((call) => call.args[0] as { type: string; payload: { message?: string } })
      .filter((message) => message.type === 'ERROR');
    assert.equal(errors.length, 1);
    assert.match(errors[0].payload.message ?? '', /"theme" declares no default/);
  });

  it('leaves the loaded document alone', async () => {
    const mock = syncedFile();
    const resolver = themedDocument();
    load(resolver);

    await INSPECT_CORRESPONDENCE();

    // Looking is not a command. Nothing here may leave a plan behind for the
    // Execute buttons to pick up.
    assert.equal(getState().resolver, resolver);
    assert.equal(getState().lastPlan, null);
    assert.equal(inspection(mock).collectionName, COLLECTION);
  });
});
