/**
 * A library in FigCraft: a `.figcraft` file published as a library, enabled in another file by its path (FigCraft
 * 0.10.0; .reference/plans/toghen-figma/plan-2026-10-23-figcraft-libraries.md, 1.1, and specs.md, *FigCraft*, *Libraries*).
 *
 * FigCraft names a library by the id its file keeps, so a moved file is the same library; a run reaches it by its
 * path. An asset is the library's own id for it: a component's or set's node id in the library file, `VariableID:n`,
 * `S:n`. Toghen's key for it is `<library id>:<asset id>`, which for a variable or a style is also its copy's id in a
 * file that uses it. The using file's listing of the library (`library.list {assets}`) names every component, style
 * and variable, so the lock is filled from it: no second plugin, and nothing for a person to pick.
 */

import { basename } from 'node:path';
import type { LockedLibrary } from '../shared/protocol.js';
import { inFile, savePinned, type Control, type Pin } from './figcraft.js';

/** A library as `library.list {assets: true}` lists it in a file that enabled it. */
export interface FcLibrary {
  id: string;
  name: string;
  path?: string;
  version?: number;
  error?: string;
  updates?: number;
  components?: Array<{ id: number | string; name: string; set: boolean }>;
  styles?: Array<{ id: string; name: string; type: string }>;
  collections?: Array<{ id: string; name: string }>;
  variables?: Array<{ id: string; name: string; collection: string }>;
}

/** The lock's name for a library: its file's name without `.figcraft`, which a person and a blueprint can write. */
export const libraryName = (path: string): string => basename(path).replace(/\.figcraft$/i, '');

/** A share link names a team library on a `figcraft-server`: outside this machine, and not built. */
export const isShareLink = (path: string): boolean => /^[a-z][a-z0-9+.-]*:\/\//i.test(path);

/** A FigCraft key: `<library id>:<asset id>`. */
export const keyOf = (library: string, asset: number | string): string => `${library}:${asset}`;

/** A key in FigCraft's form, split; a Figma key (forty hex digits) is not one. */
export function splitKey(key: string): { library: string; asset: string } | undefined {
  const match = /^([0-9a-f]{16}):(.+)$/.exec(key);
  return match ? { library: match[1], asset: match[2] } : undefined;
}

const KINDS: Record<string, 'TEXT' | 'EFFECT' | 'PAINT'> = { text: 'TEXT', effect: 'EFFECT', paint: 'PAINT' };

/**
 * The lock's entry for a library, from the using file's listing of it: each component and set by its name, each text,
 * effect and paint style by the token path its name spells (`/` to `.`, as a person's pick keeps one), each variable
 * by `<collection>/<name>`. It keeps the library's id, which finds it after a move, and no path: every run is given
 * the path again.
 */
export function lockedFrom(library: FcLibrary, by: LockedLibrary['by']): LockedLibrary {
  const collections = new Map((library.collections ?? []).map((collection) => [collection.id, collection.name]));
  const entry: LockedLibrary = { id: library.id, by, components: {}, styles: {}, variables: {} };
  for (const component of library.components ?? [])
    entry.components[component.name] = { key: keyOf(library.id, component.id), set: component.set };
  for (const style of library.styles ?? []) {
    const kind = KINDS[style.type.toLowerCase()];
    if (kind) entry.styles[style.name.split('/').join('.')] = { key: keyOf(library.id, style.id), kind };
  }
  for (const variable of library.variables ?? []) {
    const collection = collections.get(variable.collection);
    if (collection !== undefined) entry.variables[`${collection}/${variable.name}`] = keyOf(library.id, variable.id);
  }
  return entry;
}

const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;

interface Say {
  stdout(text: string): void;
}

// Each function below takes the library's path twice: `path`, absolute, which FigCraft is sent, and `given`, as the
// person typed it, which the lines print (reference.md, *The command line*).

/**
 * Publishes the pinned library file and saves it at `path`, since a library is seen by other files only once saved.
 * FigCraft refuses a publish with nothing changed since the last (measured, 0.10.0: `no changes to publish since
 * version N`); that is a library already in step, not a failure, so the run says so and goes on to the target.
 */
export async function publish(control: Control, pin: Pin, path: string, given: string, say: Say): Promise<number> {
  let version: number;
  let said: string;
  try {
    const [published] = (await inFile(control, pin, 'Publish library', [{ command: 'library.publish', params: {} }])) as [
      { version: number },
    ];
    version = published.version;
    said = `Published the library ${given} as version ${version}, and saved it.\n`;
  } catch (error) {
    const unchanged = /no changes to publish since version (\d+)/.exec(error instanceof Error ? error.message : String(error));
    if (!unchanged) throw error;
    version = Number(unchanged[1]);
    said = `The library ${given} is already published as version ${version}: nothing to publish.\n`;
  }
  // Said once the save is done: a save that fails is the run's error, and nothing claims it.
  await savePinned(control, pin, path, given);
  say.stdout(said);
  return version;
}

/** The target's listing of the library at `path`, by its id when known. */
async function listed(control: Control, target: Pin, path: string, id?: string): Promise<FcLibrary | undefined> {
  const [list] = (await inFile(control, target, 'Read', [{ command: 'library.list', params: { assets: true } }])) as [
    { libraries: FcLibrary[] },
  ];
  return list.libraries.find((library) => (id !== undefined ? library.id === id : library.path === path));
}

/**
 * In the target: enables the library at `path` (or points it there after a move: the same id at a new path), accepts
 * that library's updates when asked, and answers its listing, from which the lock is written.
 */
export async function enable(control: Control, target: Pin, path: string, given: string, accept: boolean, say: Say): Promise<FcLibrary> {
  const [added] = (await inFile(control, target, 'Enable library', [{ command: 'library.add', params: { path } }])) as [{ id: string }];
  const [updates] = (await inFile(control, target, 'Read', [{ command: 'library.updates', params: {} }])) as [
    { libraries: Array<{ id: string; components: unknown[]; styles: unknown[]; variables: unknown[]; collections: unknown[] }> },
  ];
  const mine = updates.libraries.find((library) => library.id === added.id);
  const count = mine ? mine.components.length + mine.styles.length + mine.variables.length + mine.collections.length : 0;
  if (accept) {
    if (count > 0)
      await inFile(control, target, 'Accept library updates', [{ command: 'library.acceptUpdates', params: { ids: [added.id] } }]);
    say.stdout(
      `Enabled ${given} in "${target.tab.name}"${count > 0 ? `, and accepted ${plural(count, 'update')} from it` : ', with no update to accept'}.\n`,
    );
  } else if (count > 0)
    say.stdout(
      `${given} has ${plural(count, 'update')} for "${target.tab.name}" not accepted: a run with --library accepts them, or lock does.\n`,
    );
  const library = await listed(control, target, path, added.id);
  if (!library) throw new Error(`FigCraft does not list the library ${given} in "${target.tab.name}" after enabling it.`);
  return library;
}

/**
 * What a dry run says of the target: whether the library is enabled there, found by the id the target's lock holds for
 * it when it holds one; at another path, when it moved; and the updates waiting from it, with what the run would do
 * with them: a run that builds publishes the library first, and `lock` publishes nothing.
 */
export async function describeTarget(
  control: Control,
  target: Pin,
  path: string,
  given: string,
  id: string | undefined,
  publishes: boolean,
  say: Say,
): Promise<void> {
  const library = await listed(control, target, path, id);
  if (!library) return say.stdout(`Dry run: ${given} is not enabled in "${target.tab.name}"; a run would enable it.\n`);
  if (library.path !== undefined && library.path !== path)
    return say.stdout(`Dry run: "${target.tab.name}" has the library at ${library.path}; a run would point it at ${given}.\n`);
  if (library.error) return say.stdout(`Dry run: "${target.tab.name}" cannot read ${given}: ${library.error}\n`);
  say.stdout(
    `Dry run: "${target.tab.name}" has ${plural(library.updates ?? 0, 'update')} from ${given} waiting; a run would ${publishes ? 'publish the library first, then accept them' : 'accept them, then write the lock'}.\n`,
  );
}

/** One line counting a lock entry. */
export const counted = (entry: LockedLibrary): string =>
  [
    plural(Object.keys(entry.components).length, 'component'),
    plural(Object.keys(entry.styles).length, 'style'),
    plural(Object.keys(entry.variables).length, 'variable'),
  ].join(' · ');
