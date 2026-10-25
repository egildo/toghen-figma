/**
 * A Figma mock that fails the way Figma fails.
 *
 * Every behaviour here that throws was **measured against a real file** — see
 * `.reference/figma/measured_behaviour.md`, which is this module's
 * specification. If the two disagree, this file is wrong.
 *
 * The point is not to stub the API. It is to reproduce its *failure* surface,
 * because that is where the severe bugs lived: a mode cap nobody had hit, a
 * duplicate-name rejection nobody had triggered, deprecated sync methods that
 * throw under `documentAccess: "dynamic-page"` but that every old mock happily
 * implemented, and a page whose children are unreadable until it is loaded.
 *
 * Nodes (frames, components, sets, text, slots, instances) are `figmaScene.ts`'s:
 * a scene graph with the same charter, whose assumptions are marked
 * `// unmeasured:`. Everything here that creates or finds a node delegates to it.
 *
 * @example
 * ```typescript
 * const mock = createFigmaMock()
 *   .withCollection('Demo', ['light', 'dark'])
 *   .withFonts([{ family: 'Inter', style: 'Regular' }])
 *   .install();
 *
 * // …exercise the code under test…
 *
 * assert.equal(mock.collection('Demo')?.modes.length, 2);
 * ```
 */

import { afterEach } from 'node:test';
import { partialApi } from './partialApi.js';
import { createScene, hexKey, type Scene, type SceneEnv } from './figmaScene.js';

/**
 * Mode cap for a new collection.
 *
 * 10 is measured on a **pro** file, along with the exact error text. The cap is
 * plan-dependent and Figma documents it nowhere, so other tiers are deliberately
 * absent rather than guessed — pass `withModeCap()` to model one.
 */
export const MEASURED_PRO_MODE_CAP = 10;

/** Message Figma raises when a collection is already at its mode cap. */
export const modeCapMessage = (cap: number) => `in addMode: Limited to ${cap} modes only`;

const FILL_SCOPES: VariableScope[] = ['FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL'];

/** The scopes each kind of variable takes: measured for FLOAT and COLOR on 2026-10-16 (a fill on a FLOAT, OPACITY on a COLOR, are refused; COLOR_OPACITY is taken by a FLOAT). */
const SCOPES_OF_TYPE: Partial<Record<VariableResolvedDataType, VariableScope[]>> = {
  COLOR: ['ALL_SCOPES', 'ALL_FILLS', ...FILL_SCOPES, 'STROKE_COLOR', 'EFFECT_COLOR'],
  FLOAT: [
    'ALL_SCOPES',
    'CORNER_RADIUS',
    'WIDTH_HEIGHT',
    'GAP',
    'STROKE_FLOAT',
    'EFFECT_FLOAT',
    'OPACITY',
    'COLOR_OPACITY',
    'FONT_WEIGHT',
    'FONT_SIZE',
    'LINE_HEIGHT',
    'LETTER_SPACING',
    'PARAGRAPH_SPACING',
    'PARAGRAPH_INDENT',
  ],
  // unmeasured: which scopes a STRING and a BOOLEAN take; the typings name TEXT_CONTENT, FONT_FAMILY and FONT_STYLE for text
  STRING: ['ALL_SCOPES', 'TEXT_CONTENT', 'FONT_FAMILY', 'FONT_STYLE'],
  BOOLEAN: ['ALL_SCOPES'],
};

/** Message Figma raises for a deprecated sync call under dynamic-page access. */
export const dynamicPageMessage = (method: string) =>
  `Cannot call ${method} with documentAccess: "dynamic-page". Use the async version instead.`;

/**
 * Cap on one shared-plugin-data entry, counting namespace + key + value.
 *
 * Unlike the mode cap this is **documented, not measured** — it comes from
 * `@figma/plugin-typings`, which states "Total entry size cannot exceed 100 kB".
 * The message below is therefore ours, not Figma's; nothing in the plugin parses
 * it, and inventing a plausible-looking Figma string would be worse than an
 * obviously local one.
 */
export const PLUGIN_DATA_ENTRY_LIMIT_BYTES = 100 * 1024;

/** Shared plugin data, as Figma's `PluginDataMixin` holds it on the root, a collection, a variable and a style alike. */
export interface MockPluginData {
  getSharedPluginData(namespace: string, key: string): string;
  setSharedPluginData(namespace: string, key: string, value: string): void;
  getSharedPluginDataKeys(namespace: string): string[];
}

export interface MockMode {
  modeId: string;
  name: string;
}

export interface MockCollection extends MockPluginData {
  id: string;
  name: string;
  modes: MockMode[];
  defaultModeId: string;
  variableIds: string[];
  addMode(name: string): string;
  renameMode(modeId: string, name: string): void;
  removeMode(modeId: string): void;
  remove(): void;
}

export interface MockVariable extends MockPluginData {
  id: string;
  name: string;
  variableCollectionId: string;
  resolvedType: VariableResolvedDataType;
  valuesByMode: Record<string, VariableValue>;
  codeSyntax: { WEB?: string; ANDROID?: string; iOS?: string };
  scopes: VariableScope[];
  setValueForMode(modeId: string, value: VariableValue): void;
  setVariableCodeSyntax(platform: 'WEB' | 'ANDROID' | 'iOS', value: string): void;
  resolveForConsumer(node: unknown): { value: VariableValue; resolvedType: VariableResolvedDataType };
  remove(): void;
}

export interface MockStyle extends MockPluginData {
  id: string;
  name: string;
  type: StyleType;
  [key: string]: unknown;
}

export interface MockNode {
  id: string;
  name: string;
  type: string;
  children?: MockNode[];
  boundVariables: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MockPage {
  id: string;
  name: string;
  loaded: boolean;
  nodes: MockNode[];
}

/** A library a file can use, as the mock holds it: what a library file published. Keys are the test's to choose. */
export interface MockLibrary {
  /** As Figma names it: `libraryName` in a listed collection. */
  name: string;
  /** False: nothing of it imports, and it is not listed (§15). */
  published?: boolean;
  /** False: not listed by `figma.teamLibrary`, though its keys import (unmeasured). */
  enabled?: boolean;
  /** One mode each, `default`. */
  collections?: {
    name: string;
    key: string;
    variables: { name: string; key: string; resolvedType: VariableResolvedDataType; value?: VariableValue; scopes?: VariableScope[] }[];
  }[];
  styles?: { name: string; key: string; type: 'TEXT' | 'EFFECT' | 'PAINT' }[];
  components?: { name: string; key: string }[];
  sets?: { name: string; key: string; variants: { name: string; key: string }[] }[];
}

/**
 * Measured (§15): a local variable has a key of 40 hex digits, published or not, and reads `UNPUBLISHED`. A test that
 * plays the library file says what else an object reads (`withPublishStatus`). unmeasured: a local style's key and
 * status, taken to be a variable's.
 */
const localPublishing = (id: string, status: () => PublishStatus | undefined = () => undefined) => ({
  key: hexKey(id),
  remote: false,
  getPublishStatusAsync: async (): Promise<PublishStatus> => status() ?? 'UNPUBLISHED',
});

export interface CallRecord {
  api: string;
  args: readonly unknown[];
}

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}${++idCounter}`;

/** A value as Figma keeps it: every number in it as float32. */
export const float32 = (value: unknown): unknown => {
  if (typeof value === 'number') return Math.fround(value);
  if (Array.isArray(value)) return value.map(float32);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, float32(item)]));
};

/** The fields of a style that hold numbers, by the style's type: each is kept as float32 once written. */
const NUMERIC_STYLE_FIELDS: Record<string, string[]> = { TEXT: ['fontSize', 'lineHeight', 'letterSpacing'], PAINT: ['paints'], EFFECT: [] };

/** The calls that change the file, as opposed to reading it: what a dry run must not make. */
const WRITE_CALL =
  /^(create|combine|import|setCurrentPage|node\.|setSharedPluginData|setValueForMode|setVariableCodeSyntax|addMode|renameMode|removeMode|collection\.|variable\.|style\.)/;

/**
 * Handle returned by {@link FigmaMockBuilder.install}, for inspecting what the
 * code under test actually did.
 */
export interface FigmaMockHandle {
  collections(): MockCollection[];
  collection(name: string): MockCollection | undefined;
  variables(): MockVariable[];
  variable(collectionName: string, variableName: string): MockVariable | undefined;
  /** Resolved value of a variable in a named mode. */
  valueFor(collectionName: string, variableName: string, modeName: string): VariableValue | undefined;
  styles(type?: StyleType): MockStyle[];
  node(id: string): MockNode | undefined;
  loadedFonts(): string[];
  /** Everything stored on `figma.root` under a namespace, key → value. */
  sharedPluginData(namespace: string): Record<string, string>;
  /** A value from `figma.clientStorage`, as the plugin would read it. */
  clientStorage(key: string): unknown;
  /** Every recorded API call, in order. Optionally filtered by name. */
  calls(api?: string): CallRecord[];
  /** The recorded calls that change the file, since the mock was installed. A dry run makes none. */
  writes(): CallRecord[];
  /** The page a node is created on, and the one the plugin last switched to. */
  currentPageName(): string;
  /** True when the first named call precedes the second. */
  callOrder(first: string, second: string): boolean;
  /** Makes the `nth` call of `api` from now on throw `message` before it does anything: a step that fails halfway. */
  failOn(api: string, nth: number, message?: string): void;
  uninstall(): void;
  /** Makes this mock `figma` again: two files in one test, each a mock, take turns (`fakePlugin.ts`). */
  use(): void;
}

class FigmaMockBuilder {
  private modeCap = MEASURED_PRO_MODE_CAP;
  private documentAccess: 'dynamic-page' | 'default' = 'dynamic-page';
  private colorProfile: 'SRGB' | 'DISPLAY_P3' = 'SRGB';
  private readonly collections: MockCollection[] = [];
  private readonly variables: MockVariable[] = [];
  private readonly styles: MockStyle[] = [];
  private readonly pages: MockPage[] = [];
  /** The fonts the file lists and loads; `withFonts` replaces the default set the first time it is called. */
  private fonts: FontName[] = DEFAULT_FONTS.map((font) => ({ ...font }));
  private fontsSet = false;
  /** Listed by `listAvailableFontsAsync`, yet `loadFontAsync` refuses them. */
  private readonly unloadableFonts: FontName[] = [];
  private readonly loadedFonts = new Set<string>();
  private readonly calls: CallRecord[] = [];
  private selection: MockNode[] = [];
  /** Calls a test made fail: the api name, and how many more calls of it are let through before the next one throws. */
  private readonly failures: { api: string; remaining: number; message: string }[] = [];
  /** Shared plugin data on `figma.root`, keyed `namespace/key`. */
  private readonly sharedData = new Map<string, string>();
  private pluginDataFailure: string | undefined;
  private currentIndex = 0;
  /** How many calls setup made: the builder's own seeding is not the plugin writing to the file. */
  private installedAt = 0;
  private allLoaded = false;
  private slotRenameFollows = false;
  private scene: Scene | undefined;
  private readonly publishedComponents: { key: string; name: string }[] = [];
  private readonly componentFixtures: { name: string; page?: string }[] = [];
  /** `figma.clientStorage`, which is per user rather than per file. */
  private readonly clientData = new Map<string, unknown>();
  /**
   * Bytes `clientStorage` will accept for one key, or `undefined` for no
   * limit. Figma documents no quota and `setAsync` only rejects after the
   * fact, so a test that wants to see the rejection has to impose one.
   */
  private clientStorageCap: number | undefined;

  /** Seeds `figma.clientStorage`, as a previous session would have. */
  withClientStorage(key: string, value: unknown): this {
    this.clientData.set(key, value);
    return this;
  }

  /**
   * Makes `clientStorage.setAsync` reject past `bytes` of serialized value.
   *
   * Figma names no quota, and the typings say only that `setAsync` "will
   * reject with an error message if storage failed" — so the shedding path
   * cannot be reached without a limit to hit.
   */
  withClientStorageCap(bytes: number): this {
    this.clientStorageCap = bytes;
    return this;
  }

  /** Mode cap for collections. Defaults to the measured pro-tier cap of 10. */
  withModeCap(cap: number): this {
    this.modeCap = cap;
    return this;
  }

  /** Defaults to `'dynamic-page'`, matching the plugin's manifest. */
  withDocumentAccess(access: 'dynamic-page' | 'default'): this {
    this.documentAccess = access;
    return this;
  }

  withColorProfile(profile: 'SRGB' | 'DISPLAY_P3'): this {
    this.colorProfile = profile;
    return this;
  }

  withCollection(name: string, modeNames: string[] = ['Mode 1']): this {
    const collection = this.makeCollection(name);
    // Mirrors Figma: the collection arrives with one mode, so the first
    // declared mode is a rename and the rest are additions.
    collection.renameMode(collection.modes[0].modeId, modeNames[0]);
    for (const modeName of modeNames.slice(1)) {
      collection.addMode(modeName);
    }
    return this;
  }

  withVariable(
    collectionName: string,
    variableName: string,
    type: VariableResolvedDataType,
    valuesByModeName: Record<string, VariableValue> = {},
    scopes?: VariableScope[],
  ): this {
    const collection = this.collections.find((c) => c.name === collectionName);
    if (!collection) {
      throw new Error(`withVariable: no collection named "${collectionName}"`);
    }

    const variable = this.makeVariable(variableName, collection, type);
    if (scopes) variable.scopes = scopes;
    for (const [modeName, value] of Object.entries(valuesByModeName)) {
      const mode = collection.modes.find((m) => m.name === modeName);
      if (!mode) throw new Error(`withVariable: no mode "${modeName}" in "${collectionName}"`);
      variable.valuesByMode[mode.modeId] = value;
    }
    return this;
  }

  withStyle(type: StyleType, name: string, props: Record<string, unknown> = {}): this {
    const id = nextId('S:');
    this.styles.push(
      this.bindableStyle({
        id,
        name,
        type,
        ...props,
        ...this.pluginData((namespace, key, value) => this.record('style.setSharedPluginData', id, namespace, key, value)),
      }),
    );
    return this;
  }

  withFonts(fonts: FontName[]): this {
    if (!this.fontsSet) this.fonts = [];
    this.fontsSet = true;
    this.fonts.push(...fonts);
    return this;
  }

  /** A font the list shows and a load refuses, as a font that was listed and then could not be loaded. */
  withUnloadableFont(font: FontName): this {
    this.unloadableFonts.push(font);
    return this;
  }

  withPage(name: string, nodes: MockNode[] = []): this {
    this.pages.push({ id: nextId('page'), name, loaded: false, nodes: nodes.map(bindable) });
    return this;
  }

  withSelection(nodes: MockNode[]): this {
    this.selection = nodes;
    return this;
  }

  /** Seeds `figma.root` shared plugin data, as a previous session would have. */
  withSharedPluginData(namespace: string, key: string, value: string): this {
    this.sharedData.set(`${namespace}/${key}`, value);
    return this;
  }

  /**
   * Makes every plugin-data write fail.
   *
   * Figma can refuse a write for reasons a caller cannot anticipate or check
   * for, and this one runs *after* a sync has already changed the file — so
   * what matters is that the refusal is reported, not raised.
   */
  withPluginDataFailure(message: string): this {
    this.pluginDataFailure = message;
    return this;
  }

  /**
   * A component a library has published, which `importComponentByKeyAsync` finds.
   *
   * Publishing is a human step (measured), so the mock has no way to publish: a
   * fixture stands in for a file that already did.
   */
  withPublishedComponent(key: string, name: string): this {
    this.publishedComponents.push({ key, name });
    return this;
  }

  /** A component that already lives in the file, on the named page or the first. */
  withComponent(name: string, page?: string): this {
    this.componentFixtures.push({ name, page });
    return this;
  }

  /**
   * Makes renaming a slot node rename its component property.
   *
   * // unmeasured: whether Figma does. The default is that it does not, which is
   * the harder case for the code under test.
   */
  withSlotRenameFollowingNode(): this {
    this.slotRenameFollows = true;
    return this;
  }

  install(): FigmaMockHandle {
    if (this.pages.length === 0) {
      this.pages.push({ id: nextId('page'), name: 'Page 1', loaded: true, nodes: [] });
    }
    // The current page is always loaded — only other pages need loadAsync().
    this.pages[0].loaded = true;

    this.installedAt = this.calls.length;
    this.scene = createScene(this.sceneEnv());
    for (const { key, name } of this.publishedComponents) this.scene.publishComponent(key, name);
    for (const { name, page } of this.componentFixtures) {
      const target = page ? this.pages.find((p) => p.name === page) : this.pages[0];
      if (!target) throw new Error(`withComponent: no page named "${page}"`);
      this.scene.addComponent(name, target);
    }
    this.publishLibraries();

    this.api = this.buildApi();
    setGlobalFigma(this.api);
    return this.buildHandle();
  }

  private api: PluginAPI | undefined;

  // -- Libraries (the lock) -------------------------------------------------
  //
  // Measured (measured behaviour §15): an unpublished key does not import, even in its own file, and fails with the
  // message a key that never existed gives; `getPublishStatusAsync()` answers locally, `UNPUBLISHED`.
  // unmeasured (§15): what a listed collection and variable look like beyond the typings (here, exactly the typed
  // fields); whether a variable imports from a library published but not enabled in the file (here it does); whether a key survives a republish (here a
  // key is fixed); what a library's imported style reads as its publish status (here `CURRENT`).

  // The library file's own side, which the command line reads (`LIBRARY_KEYS`): its publish statuses, and its key.
  // unmeasured (§15 and §7): a status other than `UNPUBLISHED`, which needs a published library; and `figma.fileKey`
  // in the desktop plugin with `enablePrivatePluginApi`, measured only through the connector. Without either, a local
  // object reads `UNPUBLISHED` and `figma.fileKey` reads `undefined`, as a published plugin's would.
  private readonly publishStatus = new Map<string, PublishStatus>();
  private fileKey: string | undefined;

  /** What `getPublishStatusAsync()` answers for the local set, component, style or variable of this name. */
  withPublishStatus(name: string, status: PublishStatus): this {
    this.publishStatus.set(name, status);
    return this;
  }

  /** `figma.fileKey`, as a private or development plugin with `enablePrivatePluginApi` reads it. */
  withFileKey(key: string): this {
    this.fileKey = key;
    return this;
  }

  private readonly libraries: MockLibrary[] = [];
  private readonly remote = {
    collections: [] as MockCollection[],
    variables: new Map<string, MockVariable>(),
    styles: new Map<string, MockStyle>(),
  };

  /** A library this file can use: published and enabled unless it says otherwise. Publishing and enabling are human steps (§7). */
  withLibrary(library: MockLibrary): this {
    this.libraries.push(library);
    return this;
  }

  private publishLibraries(): void {
    for (const library of this.libraries) {
      if (library.published === false) continue;
      for (const collection of library.collections ?? []) {
        const modeId = nextId('mode');
        // Measured (§15, second pass): an imported collection answers no publish status, and lists only the variables
        // the file has imported of it so far (`importVariable`).
        const remote = {
          id: nextId('VariableCollectionId:'),
          name: collection.name,
          key: collection.key,
          remote: true,
          modes: [{ modeId, name: 'default' }],
          defaultModeId: modeId,
          variableIds: [] as string[],
          getPublishStatusAsync: async (): Promise<PublishStatus> => {
            throw new Error('in getPublishStatusAsync: can only query publish status for local variable collections');
          },
        };
        this.remote.collections.push(remote as unknown as MockCollection);
        for (const variable of collection.variables) {
          const id = nextId('VariableID:');
          this.remote.variables.set(variable.key, {
            id,
            name: variable.name,
            key: variable.key,
            remote: true,
            variableCollectionId: remote.id,
            resolvedType: variable.resolvedType,
            valuesByMode: variable.value === undefined ? {} : { [modeId]: variable.value },
            scopes: variable.scopes ?? ['ALL_SCOPES'],
            codeSyntax: {},
            // A library's variable holds a value here, never an alias.
            resolveForConsumer: () => ({ value: variable.value, resolvedType: variable.resolvedType }),
            // Measured (§15, second pass): an imported variable refuses, an imported component reads `UNPUBLISHED`.
            getPublishStatusAsync: async (): Promise<PublishStatus> => {
              throw new Error('in getPublishStatusAsync: can only query publish status for local variables');
            },
            ...this.pluginData((namespace, key, value) => this.record('variable.setSharedPluginData', id, namespace, key, value)),
          } as unknown as MockVariable);
        }
      }
      for (const style of library.styles ?? []) {
        const id = nextId('S:');
        this.remote.styles.set(style.key, {
          id,
          name: style.name,
          key: style.key,
          type: style.type,
          remote: true,
          ...(style.type === 'TEXT' ? { fontName: { family: 'Inter', style: 'Regular' } } : {}),
          ...(style.type === 'EFFECT' ? { effects: [] } : {}),
          getPublishStatusAsync: async () => 'CURRENT',
          ...this.pluginData((namespace, key, value) => this.record('style.setSharedPluginData', id, namespace, key, value)),
        });
      }
      for (const component of library.components ?? []) this.scene!.publishComponent(component.key, component.name);
      for (const set of library.sets ?? []) this.scene!.publishComponentSet(set.key, set.name, set.variants);
    }
  }

  private remoteStyle(id: string): MockStyle | undefined {
    return [...this.remote.styles.values()].find((style) => style.id === id);
  }

  private importVariable(key: string): Variable {
    this.record('importVariableByKeyAsync', key);
    const found = this.remote.variables.get(key);
    if (!found) throw new Error(`Variable with key "${key}" not found`);
    // Measured (§15, second pass): one id, a different object each time; the collection lists what was imported so far.
    const collection = this.remote.collections.find((candidate) => candidate.id === found.variableCollectionId);
    if (collection && !collection.variableIds.includes(found.id)) collection.variableIds.push(found.id);
    return { ...found } as unknown as Variable;
  }

  /** `figma.teamLibrary` and `figma.importStyleByKeyAsync`: what a library offers a file. */
  private libraryApi(): Pick<PluginAPI, 'teamLibrary' | 'importStyleByKeyAsync'> {
    const listed = () => this.libraries.filter((library) => library.published !== false && library.enabled !== false);
    return {
      teamLibrary: partialApi<TeamLibraryAPI>('figma.teamLibrary', {
        getAvailableLibraryVariableCollectionsAsync: async () => {
          this.record('teamLibrary.getAvailableLibraryVariableCollectionsAsync');
          return listed().flatMap((library) =>
            (library.collections ?? []).map((collection) => ({ name: collection.name, key: collection.key, libraryName: library.name })),
          );
        },
        getVariablesInLibraryCollectionAsync: async (key: string) => {
          this.record('teamLibrary.getVariablesInLibraryCollectionAsync', key);
          const collection = listed()
            .flatMap((library) => library.collections ?? [])
            .find((candidate) => candidate.key === key);
          // unmeasured: the message; the typings say only that it rejects for a collection that does not exist
          if (!collection) throw new Error(`Variable collection with key "${key}" not found`);
          return collection.variables.map((variable) => ({ name: variable.name, key: variable.key, resolvedType: variable.resolvedType }));
        },
      }),
      importStyleByKeyAsync: async (key: string) => {
        this.record('importStyleByKeyAsync', key);
        const found = this.remote.styles.get(key);
        // unmeasured: the message for a style, taken to read as the component's and the variable's do (§15)
        if (!found) throw new Error(`Style with key "${key}" not found`);
        return found as unknown as BaseStyle;
      },
    };
  }

  // -- internals ----------------------------------------------------------

  private sceneEnv(): SceneEnv {
    return {
      record: (api, ...args) => this.record(api, ...args),
      nextId,
      documentAccess: () => this.documentAccess,
      isFontLoaded: (font) => this.loadedFonts.has(fontKey(font)),
      variableById: (id) => this.variables.find((v) => v.id === id) ?? [...this.remote.variables.values()].find((v) => v.id === id),
      collectionById: (id) => this.collections.find((c) => c.id === id) ?? this.remote.collections.find((c) => c.id === id),
      styleById: (id) => this.styles.find((s) => s.id === id) ?? this.remoteStyle(id),
      pages: () => this.pages,
      currentPage: () => this.pages[this.currentIndex],
      pageApi: (page) => this.pageApi(page),
      // Measured 2026-10-08 in the plugin: under dynamic-page, only loadAllPagesAsync() opens the document
      // to findAllWithCriteria; loading every page with loadAsync() does not. A loaded page may be searched.
      allPagesLoaded: () => this.allLoaded,
      pluginDataFailure: () => this.pluginDataFailure,
      slotRenameFollowsNode: () => this.slotRenameFollows,
      publishStatus: (name) => this.publishStatus.get(name) ?? 'UNPUBLISHED',
    };
  }

  private record(api: string, ...args: unknown[]): void {
    this.calls.push({ api, args });
    // A call a test asked to fail throws as Figma would, before it does anything.
    const at = this.failures.findIndex((failure) => failure.api === api);
    if (at !== -1 && (this.failures[at].remaining -= 1) === 0) throw new Error(this.failures.splice(at, 1)[0].message);
  }

  /**
   * Deprecated sync accessors are **present** on the real API and throw under
   * dynamic-page access — they are not absent. A missing member would produce
   * `undefined is not a function`, a different failure with different catch
   * behaviour, so the mock has to reproduce the throw rather than the absence.
   */
  private guardSync(method: string): void {
    this.record(method);
    if (this.documentAccess === 'dynamic-page') {
      throw new Error(dynamicPageMessage(method));
    }
  }

  /**
   * Shared plugin data on one object, its writes recorded by `record` before they are checked, so a refused write
   * is still a call made.
   */
  private pluginData(record: (namespace: string, key: string, value: string) => void, data = new Map<string, string>()): MockPluginData {
    return {
      getSharedPluginData: (namespace: string, key: string) => data.get(`${namespace}/${key}`) ?? '',

      setSharedPluginData: (namespace: string, key: string, value: string) => {
        record(namespace, key, value);
        if (this.pluginDataFailure) {
          throw new Error(this.pluginDataFailure);
        }
        if (!/^[a-zA-Z0-9]{3,}$/.test(namespace)) {
          throw new Error(`in setSharedPluginData: namespace must be at least 3 alphanumeric characters`);
        }
        // The limit is on *bytes*, and it counts the namespace and
        // key too. Enforcing it in characters would let a payload
        // of multi-byte token names pass here and throw in Figma.
        const bytes = utf8Length(namespace) + utf8Length(key) + utf8Length(value);
        if (bytes > PLUGIN_DATA_ENTRY_LIMIT_BYTES) {
          throw new Error(`in setSharedPluginData: entry is ${bytes} bytes, over the ` + `${PLUGIN_DATA_ENTRY_LIMIT_BYTES} byte limit`);
        }
        if (value === '') {
          data.delete(`${namespace}/${key}`);
        } else {
          data.set(`${namespace}/${key}`, value);
        }
      },

      getSharedPluginDataKeys: (namespace: string) =>
        [...data.keys()].filter((entry) => entry.startsWith(`${namespace}/`)).map((entry) => entry.slice(namespace.length + 1)),
    };
  }

  private makeCollection(name: string): MockCollection {
    const firstMode: MockMode = { modeId: nextId('mode'), name: 'Mode 1' };
    const modes: MockMode[] = [firstMode];
    const self = this;
    const id = nextId('VariableCollectionId:');

    const collection: MockCollection = {
      id,
      name,
      modes,
      // Replaced below by a getter tracking modes[0]; present here so the
      // literal satisfies MockCollection without an assertion.
      defaultModeId: firstMode.modeId,
      variableIds: [],
      addMode(modeName: string): string {
        self.record('addMode', modeName);
        if (this.modes.length >= self.modeCap) {
          throw new Error(modeCapMessage(self.modeCap));
        }
        const modeId = nextId('mode');
        this.modes.push({ modeId, name: modeName });
        return modeId;
      },
      renameMode(modeId: string, modeName: string): void {
        self.record('renameMode', modeId, modeName);
        const mode = this.modes.find((m) => m.modeId === modeId);
        if (!mode) throw new Error(`in renameMode: no mode with id ${modeId}`);
        mode.name = modeName;
      },
      removeMode(modeId: string): void {
        self.record('removeMode', modeId);
        const index = this.modes.findIndex((m) => m.modeId === modeId);
        if (index === -1) throw new Error(`in removeMode: no mode with id ${modeId}`);
        if (this.modes.length === 1) throw new Error('in removeMode: cannot remove the last mode');
        this.modes.splice(index, 1);
        // The values the removed mode held go with it.
        for (const variable of self.variables) {
          if (variable.variableCollectionId === this.id) delete variable.valuesByMode[modeId];
        }
        // unmeasured: what happens to a frame or a variant pinned to the removed mode (the spec says it falls back to the default mode); the mock has no pinned nodes
      },
      ...this.pluginData((namespace, key, value) => self.record('collection.setSharedPluginData', id, namespace, key, value)),
      remove(): void {
        self.record('collection.remove', this.id);
        const index = self.collections.indexOf(collection);
        if (index !== -1) self.collections.splice(index, 1);
      },
    };

    // Measured: defaultModeId always tracks modes[0] and has no setter.
    // Removing modes[0] promotes the next mode, which falls out of this.
    Object.defineProperty(collection, 'defaultModeId', {
      get: () => collection.modes[0]?.modeId,
      set: () => {
        throw new Error('no setter for property');
      },
      enumerable: true,
    });

    this.collections.push(collection);
    return collection;
  }

  private makeVariable(name: string, collection: MockCollection, type: VariableResolvedDataType): MockVariable {
    const self = this;

    const duplicate = this.variables.some((v) => v.variableCollectionId === collection.id && v.name === name);
    if (duplicate) {
      throw new Error(`Variable with name "${name}" already exists in this collection`);
    }

    const id = nextId('VariableID:');
    const variable: MockVariable = {
      id,
      name,
      variableCollectionId: collection.id,
      resolvedType: type,
      valuesByMode: {},
      codeSyntax: {},
      scopes: ['ALL_SCOPES'],
      // measured 2026-10-08 (measured behaviour §10): a name holding `--` (a chain link, `tone/alert--scheme`) is accepted as written
      // measured 2026-10-08 (measured behaviour §10): `codeSyntax` reads back what `setVariableCodeSyntax` wrote, keyed by platform
      setVariableCodeSyntax(platform: 'WEB' | 'ANDROID' | 'iOS', value: string): void {
        self.record('setVariableCodeSyntax', this.id, platform, value);
        this.codeSyntax[platform] = value;
      },
      setValueForMode(modeId: string, value: VariableValue): void {
        self.record('setValueForMode', this.id, modeId, value);
        const owner = self.collections.find((c) => c.id === this.variableCollectionId);
        if (owner && !owner.modes.some((m) => m.modeId === modeId)) {
          throw new Error(`in setValueForMode: mode ${modeId} is not in collection ${owner.name}`);
        }
        // unmeasured: Figma's message for an alias that loops, and whether it follows every mode of each variable; the mock does, the stricter reading
        const alias = value as { type?: string; id?: string };
        if (alias?.type === 'VARIABLE_ALIAS') {
          const seen = new Set<string>();
          const reaches = (id: string): boolean => {
            if (id === this.id) return true;
            if (seen.has(id)) return false;
            seen.add(id);
            const next = self.variables.find((v) => v.id === id);
            return Object.values(next?.valuesByMode ?? {}).some(
              (held) => (held as { type?: string }).type === 'VARIABLE_ALIAS' && reaches((held as { id: string }).id),
            );
          };
          if (reaches(alias.id as string)) {
            throw new Error(`in setValueForMode: alias to ${alias.id} would create a circular reference`);
          }
        }
        // measured (decisions, *Ruled: the stamp*): Figma keeps a number as float32, so 0.4 reads back as 0.4000000059604645
        this.valuesByMode[modeId] = float32(value) as VariableValue;
      },
      // unmeasured: the consumer's explicit modes; the mock resolves in the default mode, following aliases
      resolveForConsumer(): { value: VariableValue; resolvedType: VariableResolvedDataType } {
        let current: MockVariable | undefined = this;
        for (let depth = 0; current && depth < 16; depth++) {
          const owner = self.collections.find((c) => c.id === current!.variableCollectionId);
          const value: VariableValue = current.valuesByMode[owner?.defaultModeId ?? ''];
          const alias = value as { type?: string; id?: string };
          if (alias?.type !== 'VARIABLE_ALIAS') return { value, resolvedType: this.resolvedType };
          current = self.variables.find((v) => v.id === alias.id);
        }
        throw new Error(`in resolveForConsumer: ${this.name} does not resolve`);
      },
      // unmeasured: what Figma does with an alias that points at the removed variable; the mock leaves it pointing at an id that no longer resolves
      ...this.pluginData((namespace, key, value) => self.record('variable.setSharedPluginData', id, namespace, key, value)),
      remove(): void {
        self.record('variable.remove', this.id);
        const index = self.variables.indexOf(variable);
        if (index !== -1) self.variables.splice(index, 1);
        const at = collection.variableIds.indexOf(variable.id);
        if (at !== -1) collection.variableIds.splice(at, 1);
      },
    };

    // measured 2026-10-16: scopes read back as set, in an order of Figma's own (so compare them as sets); [] is accepted;
    // ALL_SCOPES beside another scope, ALL_FILLS beside another fill scope, and a scope the type does not take, are refused.
    // unmeasured: the order Figma reads them back in, which the mock does not reproduce
    let scopes: VariableScope[] = ['ALL_SCOPES'];
    Object.defineProperty(variable, 'scopes', {
      get: () => [...scopes],
      set: (next: VariableScope[]) => {
        self.record('variable.scopes', variable.id, next);
        if (next.includes('ALL_SCOPES') && next.length > 1) throw new Error('If ALL_SCOPES is set, other scopes cannot be set');
        if (next.includes('ALL_FILLS') && next.some((scope) => FILL_SCOPES.includes(scope))) {
          throw new Error('If ALL_FILLS is set, other fill scopes cannot be set');
        }
        if (next.some((scope) => !SCOPES_OF_TYPE[type]?.includes(scope))) throw new Error('Invalid scope for this variable type');
        scopes = [...next];
      },
      enumerable: true,
    });

    Object.assign(
      variable,
      localPublishing(id, () => self.publishStatus.get(variable.name)),
    );
    this.variables.push(variable);
    collection.variableIds.push(variable.id);
    return variable;
  }

  private makeStyle(type: StyleType, factory: string): MockStyle {
    this.record(factory);
    const id = nextId('S:');
    const style: MockStyle = {
      id,
      name: '',
      type,
      ...this.pluginData((namespace, key, value) => this.record('style.setSharedPluginData', id, namespace, key, value)),
      ...localPublishing(id, () => this.publishStatus.get(style.name)),
      remove: () => {
        const index = this.styles.indexOf(style);
        if (index !== -1) this.styles.splice(index, 1);
      },
    };
    // Measured: assigning a font that has not been loaded throws.
    // Measured 20 October 2026: Figma reads a style's font back with its variation settings, which were never set.
    Object.defineProperty(style, 'fontName', {
      get: () => style._fontName && { ...style._fontName, variationSettings: { wght: 400, slnt: 0 } },
      set: (font: FontName) => {
        if (!this.loadedFonts.has(fontKey(font))) {
          throw new Error(`Cannot write to node with unloaded font "${font.family} ${font.style}"`);
        }
        // Recorded only once the assignment actually lands, so
        // `callOrder('loadFontAsync', 'style.fontName')` means what it
        // says: a font was set, and it was loaded first.
        this.record('style.fontName', font);
        style._fontName = font;
      },
      enumerable: true,
    });

    this.styles.push(this.bindableStyle(style));
    return style;
  }

  /**
   * The binding surface a real style has: `setBoundVariable` on a text style,
   * and an `effects` whose assignment is recorded, since assigning it is how an
   * effect style's bindings are written.
   */
  private bindableStyle(style: MockStyle): MockStyle {
    if (style.type === 'TEXT') {
      const bound: Record<string, unknown> = {};
      style.boundVariables = bound;
      style.setBoundVariable = (field: string, variable: { id: string } | null) => {
        this.record('style.setBoundVariable', field, variable?.id ?? null);
        if (variable) {
          bound[field] = { type: 'VARIABLE_ALIAS', id: variable.id };
        } else {
          delete bound[field];
        }
      };
    }
    if (style.type === 'EFFECT') {
      let effects = style.effects;
      Object.defineProperty(style, 'effects', {
        get: () => effects,
        set: (value: unknown) => {
          this.record('style.effects', value);
          effects = float32(value);
        },
        enumerable: true,
      });
    }
    for (const field of NUMERIC_STYLE_FIELDS[style.type] ?? []) {
      let held = style[field];
      Object.defineProperty(style, field, {
        get: () => held,
        set: (value: unknown) => {
          held = float32(value);
        },
        enumerable: true,
      });
    }
    return style;
  }

  private pageApi(page: MockPage): PageNode {
    const self = this;
    return partialApi<PageNode>(`page(${page.name})`, {
      id: page.id,
      type: 'PAGE',
      name: page.name,
      appendChild: (child: SceneNode) => self.scene!.appendToPage(page, child),
      findAllWithCriteria: ((criteria: { types?: string[]; sharedPluginData?: { namespace: string; keys?: string[] } }) => {
        if (self.documentAccess === 'dynamic-page' && !page.loaded) {
          throw new Error(`Cannot call findAllWithCriteria on page "${page.name}" before PageNode.loadAsync()`);
        }
        return self.scene!.findAllWithCriteriaOnPage(page, criteria);
      }) as unknown as PageNode['findAllWithCriteria'],
      loadAsync: async () => {
        self.record('page.loadAsync', page.id);
        page.loaded = true;
      },
      get children(): readonly SceneNode[] {
        if (!page.loaded) {
          throw new Error(`Cannot read children of page "${page.name}". Call PageNode.loadAsync() first.`);
        }
        return page.nodes as unknown as readonly SceneNode[];
      },
      get selection(): readonly SceneNode[] {
        return self.selection as unknown as readonly SceneNode[];
      },
      // Assignment, as the real `PageNode.selection` takes it.
      set selection(nodes: readonly SceneNode[]) {
        self.record(
          'page.selection',
          nodes.map((node) => node.id),
        );
        self.selection = nodes as unknown as MockNode[];
      },
    });
  }

  private buildApi(): PluginAPI {
    const self = this;
    const allNodes = () => this.pages.flatMap((p) => flatten(p.nodes));

    // `createVariable` is overloaded (collection object / deprecated id string),
    // and an overload set cannot be satisfied structurally by one arrow
    // function. Annotating the member with its own type is the narrowest way
    // to keep the rest of the object literal excess-property-checked.
    const createVariable: VariablesAPI['createVariable'] = ((
      name: string,
      collection: VariableCollection | string,
      type: VariableResolvedDataType,
    ): Variable => {
      self.record('createVariable', name, type);
      const collectionId = typeof collection === 'string' ? collection : collection.id;
      const owner = self.collections.find((c) => c.id === collectionId);
      if (!owner) throw new Error('in createVariable: collection not found');
      return self.makeVariable(name, owner, type) as unknown as Variable;
    }) as VariablesAPI['createVariable'];

    const variablesApi = partialApi<VariablesAPI>('figma.variables', {
      createVariableCollection: (name: string) => {
        self.record('createVariableCollection', name);
        return self.makeCollection(name) as unknown as VariableCollection;
      },
      createVariable,
      // Typed: an alias names the variable by id.
      createVariableAlias: (variable: Variable) => ({ type: 'VARIABLE_ALIAS', id: variable.id }) as VariableAlias,
      importVariableByKeyAsync: async (key: string) => self.importVariable(key),
      // Measured (§15, second pass): an imported variable and its collection resolve by id.
      getVariableByIdAsync: async (id: string) => {
        const remote = [...self.remote.variables.values()].find((v) => v.id === id);
        return (self.variables.find((v) => v.id === id) ?? (remote && { ...remote }) ?? null) as unknown as Variable | null;
      },
      getVariableCollectionByIdAsync: async (id: string) =>
        (self.collections.find((c) => c.id === id) ??
          self.remote.collections.find((c) => c.id === id) ??
          null) as unknown as VariableCollection | null,
      getLocalVariablesAsync: async () => self.variables as unknown as Variable[],
      getLocalVariableCollectionsAsync: async () => self.collections as unknown as VariableCollection[],
      setBoundVariableForPaint: (paint: SolidPaint, field: 'color', variable: Variable | null) => {
        self.record('setBoundVariableForPaint', field, variable?.id ?? null);
        // Measured §14: the helper binds solid paints only; a gradient's stops take the alias written into them.
        if (paint.type !== 'SOLID') throw new Error('in setBoundVariableForPaint: can only bind variables to solid paints');
        const bound = { ...paint } as SolidPaint & { boundVariables?: Record<string, unknown> };
        bound.boundVariables = variable ? { [field]: { type: 'VARIABLE_ALIAS', id: variable.id } } : {};
        return bound;
      },
      setBoundVariableForEffect: (effect: Effect, field: VariableBindableEffectField, variable: Variable | null) => {
        self.record('setBoundVariableForEffect', field, variable?.id ?? null);
        // Measured §14: a blur binds its radius only; a COLOR on a number field is refused. unmeasured: the message for any float field but radius, and for a FLOAT on colour
        if ((effect.type === 'LAYER_BLUR' || effect.type === 'BACKGROUND_BLUR') && field !== 'radius') {
          throw new Error(
            `in setBoundVariableForEffect: Property "field" failed validation: Invalid enum value. Expected 'radius', received '${field}'`,
          );
        }
        if (variable && field !== 'color' && variable.resolvedType !== 'FLOAT')
          throw new Error(`in setBoundVariableForEffect: can only bind float variables to ${field}`);
        if (variable && field === 'color' && variable.resolvedType !== 'COLOR')
          throw new Error('in setBoundVariableForEffect: can only bind color variables to color');
        // A copy, as Figma returns one: the effect passed in is not changed.
        const previous = (effect as { boundVariables?: Record<string, unknown> }).boundVariables ?? {};
        const boundVariables = { ...previous };
        const copy = { ...effect } as Record<string, unknown>;
        if (variable) {
          boundVariables[field] = { type: 'VARIABLE_ALIAS', id: variable.id };
          // Measured §14: binding the colour replaces the shadow's alpha with the variable's.
          if (field === 'color') copy.color = { ...((variable as unknown as MockVariable).resolveForConsumer(null).value as RGBA) };
        } else {
          delete boundVariables[field];
        }
        return { ...copy, boundVariables } as unknown as Effect;
      },
      setBoundVariableForLayoutGrid: (grid: LayoutGrid, field: VariableBindableLayoutGridField, variable: Variable | null) => {
        self.record('setBoundVariableForLayoutGrid', field, variable?.id ?? null);
        // Measured §14: the fields a grid binds depend on its alignment, and Figma's message lists them in this order.
        // unmeasured: MIN beyond sectionSize, and MAX, taken to bind all four
        const takes =
          grid.pattern === 'GRID'
            ? ['sectionSize']
            : grid.alignment === 'STRETCH'
              ? ['count', 'offset', 'gutterSize']
              : grid.alignment === 'CENTER'
                ? ['sectionSize', 'count', 'gutterSize']
                : ['sectionSize', 'count', 'offset', 'gutterSize'];
        if (!takes.includes(field)) {
          throw new Error(
            `in setBoundVariableForLayoutGrid: Property "field" failed validation: Invalid enum value. Expected ${takes.map((name) => `'${name}'`).join(' | ')}, received '${field}'`,
          );
        }
        // unmeasured: the message for a variable that is not a FLOAT
        if (variable && variable.resolvedType !== 'FLOAT')
          throw new Error(`in setBoundVariableForLayoutGrid: can only bind float variables to ${field}`);
        const boundVariables = { ...((grid as { boundVariables?: Record<string, unknown> }).boundVariables ?? {}) };
        if (variable) boundVariables[field] = { type: 'VARIABLE_ALIAS', id: variable.id };
        else delete boundVariables[field];
        return { ...grid, boundVariables } as LayoutGrid;
      },
      // Deprecated sync twins: present, and throwing, exactly as in Figma.
      getVariableById: (_id: string) => {
        self.guardSync('figma.variables.getVariableById');
        return null;
      },
      getVariableCollectionById: (_id: string) => {
        self.guardSync('figma.variables.getVariableCollectionById');
        return null;
      },
      getLocalVariables: (_type?: VariableResolvedDataType): Variable[] => {
        self.guardSync('figma.variables.getLocalVariables');
        return [];
      },
      getLocalVariableCollections: (): VariableCollection[] => {
        self.guardSync('figma.variables.getLocalVariableCollections');
        return [];
      },
    });

    return partialApi<PluginAPI>('figma', {
      variables: variablesApi,
      fileKey: self.fileKey,

      get root(): DocumentNode {
        return partialApi<DocumentNode>('figma.root', {
          documentColorProfile: self.colorProfile,
          children: self.pages.map((p) => self.pageApi(p)),

          ...self.pluginData((namespace, key, value) => self.record('setSharedPluginData', namespace, key, value.length), self.sharedData),

          findAllWithCriteria: ((criteria: { types?: string[]; sharedPluginData?: { namespace: string; keys?: string[] } }) =>
            self.scene!.findAllWithCriteria(criteria)) as unknown as DocumentNode['findAllWithCriteria'],
        });
      },

      clientStorage: partialApi<ClientStorageAPI>('figma.clientStorage', {
        getAsync: async (key: string) => {
          self.record('clientStorage.getAsync', key);
          return self.clientData.get(key);
        },
        setAsync: async (key: string, value: unknown) => {
          self.record('clientStorage.setAsync', key);
          const bytes = JSON.stringify(value ?? null).length;
          if (self.clientStorageCap !== undefined && bytes > self.clientStorageCap) {
            throw new Error(`in setAsync: value is ${bytes} bytes, over the ` + `${self.clientStorageCap} this mock accepts`);
          }
          self.clientData.set(key, value);
        },
        deleteAsync: async (key: string) => {
          self.record('clientStorage.deleteAsync', key);
          self.clientData.delete(key);
        },
      }),

      notify: (message: string, options?: NotificationOptions) => {
        self.record('notify', message, options);
        return partialApi<NotificationHandler>('figma.notify', {
          cancel: () => undefined,
        });
      },

      get currentPage(): PageNode {
        return self.pageApi(self.pages[self.currentIndex]);
      },

      viewport: partialApi<ViewportAPI>('figma.viewport', {
        scrollAndZoomIntoView: (nodes: ReadonlyArray<BaseNode>) => {
          self.record(
            'viewport.scrollAndZoomIntoView',
            nodes.map((node) => node.id),
          );
        },
      }),

      setCurrentPageAsync: async (page: PageNode) => {
        self.record('setCurrentPageAsync', page.id);
        const index = self.pages.findIndex((p) => p.id === page.id);
        if (index === -1) throw new Error('in setCurrentPageAsync: page not found');
        self.pages[index].loaded = true;
        self.currentIndex = index;
      },

      loadAllPagesAsync: async () => {
        self.record('loadAllPagesAsync');
        for (const page of self.pages) page.loaded = true;
        self.allLoaded = true;
      },

      createFrame: () => self.scene!.createFrame(),
      createComponent: () => self.scene!.createComponent(),
      createText: () => self.scene!.createText(),
      createLine: () => self.scene!.createLine(),
      combineAsVariants: (nodes: ReadonlyArray<ComponentNode>, parent: BaseNode & ChildrenMixin, index?: number) =>
        self.scene!.combineAsVariants(nodes, parent, index),
      importComponentByKeyAsync: async (key: string) => self.scene!.importComponentByKey(key),
      // unmeasured: that a key names one or the other
      importComponentSetByKeyAsync: async (key: string) => self.scene!.importComponentSetByKey(key),
      ...self.libraryApi(),

      getNodeByIdAsync: async (id: string) => {
        self.record('getNodeByIdAsync', id);
        // Resolves anything in the document, pages included — which is
        // why callers have to narrow the result before treating it as a
        // SceneNode.
        const page = self.pages.find((p) => p.id === id);
        if (page) {
          return { id: page.id, name: page.name, type: 'PAGE', removed: false } as unknown as BaseNode;
        }
        const found = allNodes().find((n) => n.id === id);
        return (found ?? null) as unknown as BaseNode | null;
      },

      // unmeasured: what the list holds for a system alias or a font the machine lacks; here, only what the test set.
      listAvailableFontsAsync: async (): Promise<Font[]> => {
        self.record('listAvailableFontsAsync');
        return [...self.fonts, ...self.unloadableFonts].map((fontName) => ({ fontName }));
      },

      loadFontAsync: async (font: FontName) => {
        self.record('loadFontAsync', font);
        const available = self.fonts.some((f) => f.family === font.family && f.style === font.style);
        if (!available) {
          throw new Error(`Cannot load font ${font.family} ${font.style}`);
        }
        self.loadedFonts.add(fontKey(font));
      },

      createTextStyle: () => self.makeStyle('TEXT', 'createTextStyle') as unknown as TextStyle,
      createEffectStyle: () => self.makeStyle('EFFECT', 'createEffectStyle') as unknown as EffectStyle,
      createPaintStyle: () => self.makeStyle('PAINT', 'createPaintStyle') as unknown as PaintStyle,

      getLocalTextStylesAsync: async () => self.styles.filter((s) => s.type === 'TEXT') as unknown as TextStyle[],
      getLocalEffectStylesAsync: async () => self.styles.filter((s) => s.type === 'EFFECT') as unknown as EffectStyle[],
      getLocalPaintStylesAsync: async () => self.styles.filter((s) => s.type === 'PAINT') as unknown as PaintStyle[],
      getStyleByIdAsync: async (id: string) =>
        (self.styles.find((s) => s.id === id) ?? self.remoteStyle(id) ?? null) as unknown as BaseStyle | null,

      ui: partialApi<UIAPI>('figma.ui', {
        postMessage: (message: unknown) => self.record('ui.postMessage', message),
        resize: (width: number, height: number) => self.record('ui.resize', width, height),
      }),

      // Deprecated sync twins.
      getNodeById: (_id: string) => {
        self.guardSync('figma.getNodeById');
        return null;
      },
      getStyleById: (_id: string) => {
        self.guardSync('figma.getStyleById');
        return null;
      },
      getLocalTextStyles: (): TextStyle[] => {
        self.guardSync('figma.getLocalTextStyles');
        return [];
      },
      getLocalEffectStyles: (): EffectStyle[] => {
        self.guardSync('figma.getLocalEffectStyles');
        return [];
      },
      getLocalPaintStyles: (): PaintStyle[] => {
        self.guardSync('figma.getLocalPaintStyles');
        return [];
      },
    });
  }

  private buildHandle(): FigmaMockHandle {
    const findVariable = (collectionName: string, variableName: string) => {
      const collection = this.collections.find((c) => c.name === collectionName);
      if (!collection) return undefined;
      return this.variables.find((v) => v.variableCollectionId === collection.id && v.name === variableName);
    };

    return {
      collections: () => [...this.collections],
      collection: (name) => this.collections.find((c) => c.name === name),
      variables: () => [...this.variables],
      variable: findVariable,
      valueFor: (collectionName, variableName, modeName) => {
        const collection = this.collections.find((c) => c.name === collectionName);
        const mode = collection?.modes.find((m) => m.name === modeName);
        const variable = findVariable(collectionName, variableName);
        return mode && variable ? variable.valuesByMode[mode.modeId] : undefined;
      },
      styles: (type) => (type ? this.styles.filter((s) => s.type === type) : [...this.styles]),
      node: (id) => this.pages.flatMap((p) => flatten(p.nodes)).find((n) => n.id === id),
      loadedFonts: () => [...this.loadedFonts],
      sharedPluginData: (namespace) => {
        const entries: Record<string, string> = {};
        for (const [entry, value] of this.sharedData) {
          if (entry.startsWith(`${namespace}/`)) {
            entries[entry.slice(namespace.length + 1)] = value;
          }
        }
        return entries;
      },
      clientStorage: (key) => this.clientData.get(key),
      calls: (api) => (api ? this.calls.filter((c) => c.api === api) : [...this.calls]),
      writes: () => this.calls.slice(this.installedAt).filter((c) => WRITE_CALL.test(c.api)),
      currentPageName: () => this.pages[this.currentIndex].name,
      callOrder: (first, second) => {
        const a = this.calls.findIndex((c) => c.api === first);
        const b = this.calls.findIndex((c) => c.api === second);
        return a !== -1 && b !== -1 && a < b;
      },
      failOn: (api, nth, message = `injected failure in ${api}`) => {
        this.failures.push({ api, remaining: nth, message });
      },
      uninstall: () => setGlobalFigma(undefined),
      use: () => setGlobalFigma(this.api),
    };
  }
}

const DEFAULT_FONTS: FontName[] = [
  { family: 'Inter', style: 'Regular' },
  { family: 'Inter', style: 'Bold' },
  { family: 'Roboto', style: 'Regular' },
  { family: 'Menlo', style: 'Regular' },
];

const fontKey = (font: FontName) => `${font.family} / ${font.style}`;

/**
 * Length of a string once encoded as UTF-8.
 *
 * Figma's plugin-data limit is in bytes, and the whole point of the store's
 * ASCII escaping is that characters and bytes agree. Measuring characters here
 * would make the mock agree with a buggy implementation.
 */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate: this and its pair encode as four bytes.
      bytes += 4;
      i += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/**
 * Gives a node fixture the binding surface every real SceneNode has.
 *
 * `setBoundVariable` exists on essentially every node in Figma, so a fixture
 * without it makes the code under test take an error path that cannot occur.
 */
function bindable(node: MockNode): MockNode {
  const decorated: MockNode = {
    removed: false,
    ...node,
    boundVariables: { ...(node.boundVariables ?? {}) },
    children: node.children?.map(bindable),
  };

  decorated.setBoundVariable = (field: string, variable: { id: string } | null) => {
    if (variable) {
      decorated.boundVariables[field] = { type: 'VARIABLE_ALIAS', id: variable.id };
    } else {
      delete decorated.boundVariables[field];
    }
  };

  return decorated;
}

function flatten(nodes: MockNode[]): MockNode[] {
  // `in` rather than a read: a scene node of a kind with no children (a text node) throws when asked.
  return nodes.flatMap((node) => [node, ...flatten('children' in node ? (node.children ?? []) : [])]);
}

/**
 * The only place in the repo that touches `globalThis.figma`.
 *
 * Note this is a plain assignment rather than `declare global { var figma }` —
 * `@figma/plugin-typings` already declares `const figma` in its own global
 * block, and a `var` redeclaration collides with it.
 */
function setGlobalFigma(api: PluginAPI | undefined): void {
  (globalThis as { figma?: PluginAPI }).figma = api;
}

export function createFigmaMock(): FigmaMockBuilder {
  return new FigmaMockBuilder();
}

/**
 * Clears the global mock and the plugin's runtime state after each test.
 *
 * Call once at describe scope. Without the `runtimeState` half, handler tests
 * leak a loaded document into each other.
 */
export function useFigmaMock(): void {
  afterEach(async () => {
    setGlobalFigma(undefined);
    const { resetState } = await import('../../main/runtimeState.js');
    resetState?.();
  });
}
