/**
 * The lock, written from the plugin: variables by discovery, a component or a style by a person picking it once,
 * forgetting a library, and Build's overrides map. See `specs.md`, *The lock*.
 *
 * The Plugin API lists a library's variables, but not its components or styles: those import by key only. So
 * discovery fills variables, and a component or a style is picked from what a person placed from the assets panel.
 * The library file knows its own keys, though: the command line, paired with a plugin in each file, asks the library's
 * for them (`LIBRARY_KEYS`) and has the target's write them (`LOCK_WRITE`).
 */

import type { Command, LibraryKeys, Lock, LockedLibrary, Overrides, Response } from '../../shared/protocol.js';
import type { Operation } from '../../shared/operations.js';
import { isBlueprintFile } from '../../shared/components/index.js';
import type { Member } from '../../shared/components/index.js';
import { readBlueprintText, readComponentText } from '../components/file.js';
import { namedTokens, variableSlots } from '../components/resolve.js';
import { sortNodes, stampOn, stampedAs } from '../components/stamp.js';
import { isLibrary, libraryIn, loadLock, saveLock } from '../utils/lockStore.js';
import { findInEveryPage } from '../utils/pageRoots.js';
import { localStyles } from '../utils/tokenStamps.js';
import { loadTemplates } from '../utils/templateStore.js';

type Payload<T extends Command['type']> = Extract<Command, { type: T }>['payload'];

export function GET_LOCK(): void {
  postToUi({ type: 'LOCK', payload: loadLock() });
}

/**
 * For each token the kept files bind, the collection and name the variable sync gives it, matched by both names
 * against the variables of the enabled libraries. A match in one library is written under its name; a match in two
 * is a choice, listed and never picked (R10). One row per variable found, per choice, and per token not found (R14).
 */
export async function DISCOVER_VARIABLES(): Promise<void> {
  const slotOf = variableSlots();
  if (!slotOf) {
    postToUi({
      type: 'ERROR',
      payload: {
        message: 'Load the design system first: discovery looks for each token by the collection and the name the variable sync gives it.',
        code: 'NO_RESOLVER',
        commandType: 'DISCOVER_VARIABLES',
      },
    });
    return;
  }

  // The tokens the kept files bind, each once, in the order first met.
  const paths = new Set<string>();
  for (const template of loadTemplates()) {
    const members: Member[] = isBlueprintFile(template.fileName)
      ? ([] as Member[]).concat(...readBlueprintText(template.text).bodies.map((body) => body.members))
      : readComponentText(template.text).members;
    const named = namedTokens(members);
    for (const path of [...named.floats.keys(), ...named.colors.keys()]) paths.add(path);
  }

  // Each enabled library's collections, and a collection's variables read once.
  const collections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
  const read = new Map<string, LibraryVariable[]>();
  const variablesOf = async (key: string): Promise<LibraryVariable[]> => {
    if (!read.has(key)) read.set(key, await figma.teamLibrary.getVariablesInLibraryCollectionAsync(key));
    return read.get(key)!;
  };

  const lock = loadLock();
  const overrides = lock.overrides ?? {};
  const found = new Map<string, Record<string, string>>();
  const operations: Operation[] = [];
  const counts = { found: 0, choices: 0, 'not found': 0 };
  for (const path of paths) {
    const slot = slotOf(path);
    if (!slot) {
      operations.push({
        kind: 'NOTE',
        message: `{${path}} is not a variable of the loaded design system, so no library was looked in for it.`,
      });
      counts['not found'] += 1;
      continue;
    }
    const id = `${slot.collection}/${slot.name}`;
    const matches: { library: string; key: string }[] = [];
    for (const collection of collections) {
      if (collection.name !== slot.collection) continue;
      for (const variable of await variablesOf(collection.key))
        if (variable.name === slot.name) matches.push({ library: collection.libraryName, key: variable.key });
    }
    // A name that was a match before and is a choice now is no longer the lock's to answer.
    if (matches.length !== 1) for (const library of Object.values(lock.libraries)) delete library.variables[id];
    if (matches.length === 0) {
      operations.push({ kind: 'NOTE', message: `{${path}}: no enabled library has "${id}".` });
      counts['not found'] += 1;
    } else if (matches.length === 1) {
      const into = found.get(matches[0].library) ?? found.set(matches[0].library, {}).get(matches[0].library)!;
      into[id] = matches[0].key;
      operations.push({ kind: 'NOTE', message: `{${path}}: "${id}" in library "${matches[0].library}".` });
      counts.found += 1;
    } else {
      const libraries = matches.map((match) => `"${match.library}"`).join(' and ');
      operations.push(
        overrides[path] !== undefined
          ? { kind: 'NOTE', message: `{${path}}: "${id}" is in ${libraries}, and the overrides map names the one to use.` }
          : {
              kind: 'WARNING',
              path,
              message: `"${id}" is in ${libraries}: a choice, so nothing was written for it. Name the one to use in the overrides map, as (key)"…".`,
            },
      );
      counts.choices += 1;
    }
  }
  if (paths.size === 0) operations.push({ kind: 'NOTE', message: 'No kept file binds a token, so there was nothing to look for.' });

  for (const [name, variables] of found) {
    const library = libraryIn(lock, name, 'discovery');
    lock.libraries[name] = { ...library, by: 'discovery', variables: { ...library.variables, ...variables } };
  }
  const saved = saveLock(lock);
  if (!saved.ok) {
    postToUi({ type: 'ERROR', payload: { message: saved.reason, code: 'FIGMA_API_ERROR', commandType: 'DISCOVER_VARIABLES' } });
    return;
  }
  postToUi({ type: 'PLAN_READY', payload: { planType: 'discovery', operations, summary: counts } });
  GET_LOCK();
}

/**
 * Writes what one selected layer names from a library, under the library the command names: the Plugin API gives
 * no library's name for a remote component or style. An instance's component (its set, when it is a variant of
 * one), and the layer's text and effect styles, each only when it is remote.
 */
export async function LOCK_PICK(payload: Payload<'LOCK_PICK'>): Promise<void> {
  const refuse = (message: string): void =>
    postToUi({ type: 'ERROR', payload: { message, code: 'INVALID_PICK', commandType: 'LOCK_PICK' } });
  const name = payload.library.trim();
  if (name === '') return refuse('Name the library the selected layer comes from: Figma does not say it to a plugin.');
  const selection = figma.currentPage.selection;
  if (selection.length !== 1)
    return refuse(
      `Select one layer: an instance placed from a library, or a layer with a library style. ${selection.length} are selected.`,
    );
  const node = selection[0];

  const lock = loadLock();
  const library: LockedLibrary = { ...libraryIn(lock, name, 'person'), by: 'person' };
  library.components = { ...library.components };
  library.styles = { ...library.styles };
  let picked = 0;

  if (node.type === 'INSTANCE') {
    const main = await node.getMainComponentAsync();
    if (main?.remote) {
      // unmeasured: whether a library variant read from an instance has its set as its parent; the typings say a remote component may have none
      const set = main.parent?.type === 'COMPONENT_SET' ? main.parent : undefined;
      library.components[set ? set.name : main.name] = { key: set ? set.key : main.key, set: set !== undefined };
      picked += 1;
    }
  }
  const styles: [string, 'TEXT' | 'EFFECT'][] = [
    ['textStyleId', 'TEXT'],
    ['effectStyleId', 'EFFECT'],
  ];
  for (const [field, kind] of styles) {
    const id = field in node ? (node as unknown as Record<string, unknown>)[field] : undefined;
    const style = typeof id === 'string' && id !== '' ? await figma.getStyleByIdAsync(id) : null;
    if (!style?.remote) continue;
    // A style is kept by the token path it is named from, as the style sync names it.
    library.styles[style.name.split('/').join('.')] = { key: style.key, kind };
    picked += 1;
  }
  if (picked === 0)
    return refuse(
      `"${node.name}" holds nothing from a library: select an instance placed from Figma's assets panel, or a layer with a library's text or effect style.`,
    );

  lock.libraries[name] = library;
  save(lock, 'LOCK_PICK');
}

export function LOCK_FORGET(payload: Payload<'LOCK_FORGET'>): void {
  const lock = loadLock();
  delete lock.libraries[payload.library];
  save(lock, 'LOCK_FORGET');
}

export function SET_BUILD_OVERRIDES(payload: Payload<'SET_BUILD_OVERRIDES'>): void {
  const lock = loadLock();
  const overrides: Overrides = {};
  for (const [name, to] of Object.entries(payload.overrides ?? {}))
    if (typeof to === 'string' && name !== '' && to !== '') overrides[name] = to;
  if (Object.keys(overrides).length > 0) lock.overrides = overrides;
  else delete lock.overrides;
  save(lock, 'SET_BUILD_OVERRIDES');
}

/**
 * In a library file: what it knows of its own keys, for the command line to copy into a target file's lock (the
 * third filler). Each stamped set and each style the style sync stamped, every local variable, each with its publish
 * status, and the file's key where `figma.fileKey` reads: only a private plugin, or a development one with
 * `enablePrivatePluginApi` in its manifest. A published plugin would lose it.
 */
export async function LIBRARY_KEYS(): Promise<void> {
  const keys: LibraryKeys = { components: {}, styles: {}, variables: {} };
  const warnings: string[] = [];
  const fileKey = figma.fileKey;
  if (typeof fileKey === 'string' && fileKey !== '') keys.fileKey = fileKey;

  // A person's copy of a set carries its stamp and is not the library's set (`sortNodes`).
  for (const page of figma.root.children) await page.loadAsync();
  // Only local objects are asked their publish status: an imported one throws or reads `UNPUBLISHED` (§15, second pass).
  const stamped = await sortNodes(findInEveryPage({ types: ['COMPONENT_SET', 'COMPONENT'], sharedPluginData: stampedAs('component') }));
  for (const node of stamped.ours) {
    const name = stampOn(node)?.is.component;
    if (name === undefined || name in keys.components) continue;
    keys.components[name] = { key: node.key, set: node.type === 'COMPONENT_SET', status: await node.getPublishStatusAsync() };
  }
  // A style is kept by the token path its name spells, as a person's pick keeps one.
  for (const { style, styleType, stamp } of await localStyles()) {
    if (!stamp) continue;
    // unmeasured in the desktop plugin: the connector's runtime had no `getPublishStatusAsync` on any style (§15, second
    // pass), although the typings give every style one through `PublishableMixin`. Called where it exists, and said where not.
    const read = (style as { getPublishStatusAsync?: unknown }).getPublishStatusAsync;
    const path = style.name.split('/').join('.');
    const status = typeof read === 'function' ? await style.getPublishStatusAsync() : undefined;
    if (status === undefined)
      warnings.push(
        `The publish status of the ${styleType.toLowerCase()} style "${style.name}" could not be read: this Figma gives styles no getPublishStatusAsync.`,
      );
    keys.styles[path] = { key: style.key, kind: styleType, status };
  }
  const collections = new Map(
    (await figma.variables.getLocalVariableCollectionsAsync()).map((collection) => [collection.id, collection.name]),
  );
  for (const variable of await figma.variables.getLocalVariablesAsync()) {
    const collection = collections.get(variable.variableCollectionId);
    if (collection !== undefined)
      keys.variables[`${collection}/${variable.name}`] = { key: variable.key, status: await variable.getPublishStatusAsync() };
  }
  if (warnings.length > 0) keys.warnings = warnings;
  postToUi({ type: 'LIBRARY_KEYS_READ', payload: keys });
}

/** In a target file: one library's entry, as the command line read it from the library file, written over the one there. */
export function LOCK_WRITE(payload: Payload<'LOCK_WRITE'>): void {
  const name = typeof payload.library === 'string' ? payload.library.trim() : '';
  if (name === '' || !isLibrary(payload.entry)) {
    postToUi({
      type: 'ERROR',
      payload: {
        message: "LOCK_WRITE needs a library name and an entry in the lock's shape.",
        code: 'INVALID_PICK',
        commandType: 'LOCK_WRITE',
      },
    });
    return;
  }
  const lock = loadLock();
  lock.libraries[name] = payload.entry;
  save(lock, 'LOCK_WRITE');
}

function save(lock: Lock, commandType: string): void {
  const saved = saveLock(lock);
  if (!saved.ok) postToUi({ type: 'ERROR', payload: { message: saved.reason, code: 'FIGMA_API_ERROR', commandType } });
  else GET_LOCK();
}

function postToUi(response: Response): void {
  figma.ui.postMessage(response);
}
