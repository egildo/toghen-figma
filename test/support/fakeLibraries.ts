/**
 * FigCraft's local libraries, as the fake control socket answers `library.*` (measured against FigCraft 0.10.0 on
 * 23 October 2026, .reference/plans/toghen-figma/plan-2026-10-23-figcraft-libraries.md, 1.1):
 *
 * - `library.publish` gives the file a library id, kept in the file, and a new version; each asset keeps the version
 *   it last changed in, and a publish with nothing changed since the last is refused. Other files read a library from disk, so a publish is seen only
 *   once its file is saved.
 * - `library.add {path}` enables it; twice is once; a file never published is refused.
 * - An asset is named by its id in the library file (a component's or set's node id, `VariableID:n`, `S:n`) or by
 *   its name. A variant is no asset of its own.
 * - What a file imports is a read-only copy: a component's has a local id and is on no page, and carries the library's
 *   layer data; a variable's, a collection's and a style's id is the library's behind the library id, and a copied
 *   collection's mode ids are not prefixed. Importing is idempotent.
 * - `library.updates` lists the copies whose asset has a newer version; `library.acceptUpdates` brings them in: a copy
 *   keeps its id, a variant is matched by id, so one removed leaves its instances with a missing main, and one added is
 *   a new copy. An asset deleted and made again is another asset, never an update.
 * - A library whose file is gone is listed with an error; importing from it fails; enabling it at its new path finds
 *   the same id and keeps every copy.
 */

/** What the fake's files hold that this module reads and writes. */
export interface LibraryFile {
  name: string;
  path: string | null;
  collections: Array<{ id: string; name: string; modes: Array<{ id: string; name: string }> }>;
  variables: Array<Record<string, any>>;
  styles: Array<Record<string, any>>;
  pages: Array<{ id: number; name: string; children?: Array<Record<string, any>> }>;
  /** The library this file published last: its id, version, and each asset with its version and what it was. */
  published?: Published;
  /** The libraries this file enabled. */
  libraries?: Array<{ id: string; path: string; name: string; seenVersion: number }>;
  /** Copies of library components, on no page. */
  copies?: Array<Record<string, any>>;
}

interface Asset {
  id: number | string;
  name: string;
  version: number;
  /** The asset as it was published: a component's tree, a variable, a style, a collection. */
  value: any;
  set?: boolean;
  collection?: string;
  type?: string;
}

interface Published {
  id: string;
  name: string;
  version: number;
  description?: string;
  components: Asset[];
  styles: Asset[];
  collections: Asset[];
  variables: Asset[];
}

export interface LibraryHelpers {
  /** The files saved on disk, by path. */
  disk: Map<string, unknown>;
  /** A new layer id in the file. */
  newId(f: LibraryFile): number;
  /** Applies a style to a layer, as `style.apply` does. */
  applyStyle(f: LibraryFile, id: number, style: Record<string, any>): void;
}

let issued = 0;
const copyOf = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const isLibraryCopy = (id: unknown): boolean => /^[0-9a-f]{16}:/.test(String(id));

/** What a file offers to publish: its top-level components and sets, its own styles and collections, names starting with `.` or `_` left out. */
function offered(f: LibraryFile): Omit<Published, 'id' | 'name' | 'version'> {
  const kept = (name: string) => !/^[._]/.test(name);
  const components: Asset[] = f.pages
    .flatMap((page) => page.children ?? [])
    .filter((node) => (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') && kept(node.name))
    .map((node) => ({ id: node.id, name: node.name, version: 0, value: copyOf(node), set: node.type === 'COMPONENT_SET' }));
  const collections = f.collections
    .filter((c) => !isLibraryCopy(c.id) && kept(c.name))
    .map((c) => ({ id: c.id, name: c.name, version: 0, value: copyOf(c) }));
  const variables = f.variables
    .filter((v) => !isLibraryCopy(v.id) && collections.some((c) => c.id === v.collection) && !v.hiddenFromPublishing)
    .map((v) => ({ id: v.id, name: v.name, version: 0, value: copyOf(v), collection: v.collection, type: v.resolvedType }));
  const styles = f.styles
    .filter((s) => !isLibraryCopy(s.id) && kept(s.name))
    .map((s) => ({ id: s.id, name: s.name, version: 0, value: copyOf(s), type: s.type }));
  return { components, styles, collections, variables };
}

/** Each asset keeps the version it last changed in. */
function versioned(now: Asset[], before: Asset[] | undefined, version: number): Asset[] {
  return now.map((asset) => {
    const was = before?.find((old) => old.id === asset.id);
    return { ...asset, version: was && JSON.stringify(was.value) === JSON.stringify(asset.value) ? was.version : version };
  });
}

const listed = (asset: Asset): Record<string, unknown> => ({
  id: asset.id,
  name: asset.name,
  version: asset.version,
  ...(asset.set !== undefined ? { set: asset.set } : {}),
  ...(asset.collection !== undefined ? { collection: asset.collection } : {}),
  ...(asset.type !== undefined ? { type: asset.type } : {}),
});

const assetsOf = (published: Published) => ({
  components: published.components.map(listed),
  styles: published.styles.map(listed),
  collections: published.collections.map((asset) => ({ ...listed(asset), modes: asset.value.modes })),
  variables: published.variables.map(listed),
});

/** The library as its file on disk holds it, or why it cannot be read. */
function readLibrary(helpers: LibraryHelpers, path: string): Published {
  const saved = helpers.disk.get(path) as LibraryFile | undefined;
  if (!saved) throw new Error(`${path}: No such file or directory (os error 2)`);
  if (!saved.published) throw new Error(`${path} has no published library: open it and publish it first (Libraries ▸ Publish library…)`);
  return saved.published;
}

/** An enabled library, by its id, name or path. */
function enabled(f: LibraryFile, which: unknown): NonNullable<LibraryFile['libraries']>[number] {
  const found = (f.libraries ?? []).find((library) => library.id === which || library.name === which || library.path === which);
  if (!found) throw new Error(`invalid parameters: no enabled library ${String(which)}`);
  return found;
}

function assetIn(assets: Asset[], which: unknown, library: string, kind: string): Asset {
  const found = assets.find((asset) => asset.id === which || String(asset.id) === String(which) || asset.name === which);
  if (!found)
    throw new Error(
      `invalid parameters for \`library.${kind}\`: "${library}" publishes no ${kind === 'import' ? 'component' : kind} "${String(which)}"`,
    );
  return found;
}

/** A layer tree copied in with ids of the file's own, keeping the library's ids as `hidden.from` to match variants by id. */
function copyTree(
  helpers: LibraryHelpers,
  f: LibraryFile,
  node: Record<string, any>,
  library: string,
  renamed: (id: string) => string,
): Record<string, any> {
  const { id, children, hidden: _hidden, ...rest } = copyOf(node);
  const copy: Record<string, any> = { ...rest, id: helpers.newId(f), hidden: { from: id } };
  if (copy.boundVariables)
    copy.boundVariables = Object.fromEntries(
      Object.entries(copy.boundVariables).map(([field, variable]) => [field, renamed(String(variable))]),
    );
  if (children) copy.children = children.map((child: Record<string, any>) => copyTree(helpers, f, child, library, renamed));
  return copy;
}

/** Copies a published variable in, with its collection and what it aliases: ids prefixed, mode ids not. */
function copyVariable(f: LibraryFile, published: Published, asset: Asset): string {
  const id = `${published.id}:${asset.id}`;
  const held = f.variables.find((variable) => variable.id === id);
  if (held) return id;
  const collection = published.collections.find((c) => c.id === asset.collection);
  const collectionId = `${published.id}:${asset.collection}`;
  if (collection && !f.collections.some((c) => c.id === collectionId))
    f.collections.push({
      id: collectionId,
      name: collection.name,
      modes: copyOf(collection.value.modes),
      hidden: { library: published.id, key: collection.id, version: collection.version },
    } as any);
  const value = copyOf(asset.value);
  f.variables.push({ ...value, id, collection: collectionId, hidden: { library: published.id, key: asset.id, version: asset.version } });
  for (const held of Object.values(value.values ?? {}) as Array<{ type: string; value: unknown }>) {
    if (held.type !== 'alias') continue;
    const target = published.variables.find((variable) => variable.id === held.value);
    if (target) held.value = copyVariable(f, published, target);
  }
  return id;
}

/** Copies a component or set in, or answers the copy made before. */
function copyComponent(helpers: LibraryHelpers, f: LibraryFile, published: Published, asset: Asset): number {
  const copies = (f.copies ??= []);
  const held = copies.find((copy) => copy.hidden?.library === published.id && copy.hidden?.key === asset.id);
  if (held) return held.id;
  const renamed = (variable: string): string => {
    const target = published.variables.find((candidate) => candidate.id === variable);
    return target ? copyVariable(f, published, target) : variable;
  };
  const copy = copyTree(helpers, f, asset.value, published.id, renamed);
  copy.hidden = { ...copy.hidden, library: published.id, key: asset.id, version: asset.version };
  copies.push(copy);
  return copy.id;
}

/** The copies whose asset has a newer version in its library. */
function updatesOf(helpers: LibraryHelpers, f: LibraryFile) {
  const libraries: Array<Record<string, any>> = [];
  const errors: Array<Record<string, unknown>> = [];
  for (const library of f.libraries ?? []) {
    let published: Published;
    try {
      published = readLibrary(helpers, library.path);
    } catch (error) {
      errors.push({ id: library.id, name: library.name, error: (error as Error).message });
      continue;
    }
    const components = (f.copies ?? [])
      .filter((copy) => copy.hidden?.library === library.id)
      .flatMap((copy) => {
        const asset = published.components.find((candidate) => candidate.id === copy.hidden.key);
        return asset && asset.version > copy.hidden.version ? [{ id: copy.id, key: asset.id, name: asset.name, asset }] : [];
      });
    const variables = f.variables
      .filter((variable) => variable.hidden?.library === library.id)
      .flatMap((variable) => {
        const asset = published.variables.find((candidate) => candidate.id === variable.hidden.key);
        return asset && asset.version > variable.hidden.version ? [{ id: variable.id, key: asset.id, name: asset.name, asset }] : [];
      });
    const styles = f.styles
      .filter((style) => style.hidden?.library === library.id)
      .flatMap((style) => {
        const asset = published.styles.find((candidate) => candidate.id === style.hidden.key);
        return asset && asset.version > style.hidden.version ? [{ id: style.id, key: asset.id, name: asset.name, asset }] : [];
      });
    if (components.length + variables.length + styles.length > 0)
      libraries.push({
        id: library.id,
        name: library.name,
        version: published.version,
        published,
        components,
        variables,
        styles,
        collections: [],
      });
  }
  return { libraries, errors };
}

/** A copy brought up to its asset: same id, variants matched by their library ids, one removed gone, one added new. */
function acceptComponent(helpers: LibraryHelpers, f: LibraryFile, copy: Record<string, any>, asset: Asset, published: Published): void {
  const renamed = (variable: string): string => {
    const target = published.variables.find((candidate) => candidate.id === variable);
    return target ? copyVariable(f, published, target) : variable;
  };
  const update = (held: Record<string, any>, now: Record<string, any>): void => {
    const { id: _id, children, hidden: _hidden, ...rest } = copyOf(now);
    for (const key of Object.keys(held)) if (!['id', 'children', 'hidden'].includes(key)) delete held[key];
    Object.assign(held, rest);
    if (held.boundVariables)
      held.boundVariables = Object.fromEntries(
        Object.entries(held.boundVariables).map(([field, variable]) => [field, renamed(String(variable))]),
      );
    if (!children) return;
    const kept = (held.children ?? []) as Array<Record<string, any>>;
    held.children = children.map((child: Record<string, any>) => {
      const match = kept.find((old) => old.hidden?.from === child.id);
      if (!match) return copyTree(helpers, f, child, published.id, renamed);
      update(match, child);
      return match;
    });
  };
  update(copy, asset.value);
  copy.hidden = { ...copy.hidden, version: asset.version };
}

/** Answers a `library.*` command, or `undefined` for any other. */
export function libraryCommand(helpers: LibraryHelpers, f: LibraryFile, command: string, params: Record<string, any>): unknown {
  switch (command) {
    case 'library.publish': {
      const now = offered(f);
      const version = (f.published?.version ?? 0) + 1;
      const before = f.published;
      // Nothing changed since the last publish is refused (measured, 0.10.0, by a consumer's run).
      if (
        before &&
        (['components', 'styles', 'collections', 'variables'] as const).every(
          (kind) =>
            JSON.stringify(versioned(now[kind], before[kind], version).map((asset) => [asset.id, asset.version])) ===
            JSON.stringify(before[kind].map((asset) => [asset.id, asset.version])),
        )
      )
        throw new Error(`command \`library.publish\` is not available right now: no changes to publish since version ${before.version}`);
      f.published = {
        id: before?.id ?? (++issued).toString(16).padStart(16, 'a'),
        // The document's name at this publish (measured: `Untitled` for one never saved).
        name: f.name,
        version,
        ...(params.description !== undefined ? { description: params.description } : {}),
        components: versioned(now.components, before?.components, version),
        styles: versioned(now.styles, before?.styles, version),
        collections: versioned(now.collections, before?.collections, version),
        variables: versioned(now.variables, before?.variables, version),
      };
      const p = f.published;
      return {
        id: p.id,
        version,
        components: p.components.length,
        styles: p.styles.length,
        collections: p.collections.length,
        variables: p.variables.length,
      };
    }
    case 'library.add': {
      const published = readLibrary(helpers, params.path);
      const libraries = (f.libraries ??= []);
      const held = libraries.find((library) => library.id === published.id);
      // The same id at a new path is the same library, moved: every copy stays.
      if (held) held.path = params.path;
      else libraries.push({ id: published.id, path: params.path, name: published.name, seenVersion: published.version });
      return { id: published.id, name: published.name, path: params.path, version: published.version, ...assetsOf(published) };
    }
    case 'library.list': {
      const { libraries: updates } = updatesOf(helpers, f);
      const libraries = (f.libraries ?? []).map((library) => {
        try {
          const published = readLibrary(helpers, library.path);
          const pending = updates.find((update) => update.id === library.id);
          const count = pending ? pending.components.length + pending.variables.length + pending.styles.length : 0;
          return {
            id: library.id,
            name: published.name,
            path: library.path,
            version: published.version,
            seenVersion: library.seenVersion,
            server: false,
            updates: count,
            ...(params.assets ? assetsOf(published) : {}),
          };
        } catch (error) {
          return { id: library.id, name: library.name, seenVersion: library.seenVersion, server: false, error: (error as Error).message };
        }
      });
      return {
        libraries,
        published: f.published ? { id: f.published.id, name: f.published.name, version: f.published.version } : null,
        publishable: offered(f),
      };
    }
    case 'library.import': {
      const library = enabled(f, params.library);
      const published = readLibrary(helpers, library.path);
      return { component: copyComponent(helpers, f, published, assetIn(published.components, params.component, library.name, 'import')) };
    }
    case 'library.importVariable': {
      const library = enabled(f, params.library);
      const published = readLibrary(helpers, library.path);
      return { variable: copyVariable(f, published, assetIn(published.variables, params.variable, library.name, 'variable')) };
    }
    case 'library.applyStyle': {
      if (!params.ids?.length) throw new Error('command `style.apply` is not available right now: nothing is selected (pass `ids`)');
      const library = enabled(f, params.library);
      const published = readLibrary(helpers, library.path);
      const asset = assetIn(published.styles, params.style, library.name, 'style');
      const id = `${published.id}:${asset.id}`;
      const style = f.styles.find((held) => held.id === id) ?? {
        ...copyOf(asset.value),
        id,
        bound: {},
        hidden: { library: published.id, key: asset.id, version: asset.version },
      };
      if (!f.styles.includes(style)) f.styles.push(style);
      for (const node of params.ids) helpers.applyStyle(f, node, style);
      return { style: id };
    }
    case 'library.updates': {
      const { libraries, errors } = updatesOf(helpers, f);
      const strip = (items: Array<Record<string, any>>) => items.map(({ id, key, name }) => ({ id, key, name }));
      return {
        count: libraries.reduce((n, library) => n + library.components.length + library.variables.length + library.styles.length, 0),
        errors,
        libraries: libraries.map((library) => ({
          id: library.id,
          name: library.name,
          version: library.version,
          components: strip(library.components),
          variables: strip(library.variables),
          styles: strip(library.styles),
          collections: [],
        })),
      };
    }
    case 'library.acceptUpdates': {
      const { libraries } = updatesOf(helpers, f);
      const counts = { components: 0, styles: 0, collections: 0, variables: 0, skipped: [] as unknown[] };
      for (const library of libraries) {
        if (params.ids && !params.ids.includes(library.id)) continue;
        for (const { id, asset } of library.components) {
          acceptComponent(helpers, f, f.copies!.find((copy) => copy.id === id)!, asset, library.published);
          counts.components += 1;
        }
        for (const { id, asset } of library.variables) {
          const held = f.variables.find((variable) => variable.id === id)!;
          held.name = asset.name;
          held.values = copyOf(asset.value.values);
          held.hidden = { ...held.hidden, version: asset.version };
          counts.variables += 1;
        }
        for (const { id, asset } of library.styles) {
          const held = f.styles.find((style) => style.id === id)!;
          Object.assign(held, { ...copyOf(asset.value), id, bound: {}, hidden: { ...held.hidden, version: asset.version } });
          counts.styles += 1;
        }
        const enabledOne = (f.libraries ?? []).find((candidate) => candidate.id === library.id);
        if (enabledOne) enabledOne.seenVersion = library.version;
      }
      return counts;
    }
    case 'library.remove':
    case 'library.publishToServer':
    case 'library.swap':
      throw new Error(`the fake does not answer ${command}`);
    default:
      return undefined;
  }
}
