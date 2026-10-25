import { InvalidTokenError, referenceTarget, type DesignSystem, type Resolver } from '@toghen/lib';

/**
 * A resolver document resolved into its sum: a single multi-mode `DesignSystem`.
 *
 * @see resolveSumModes
 */
export interface MultiModeResolution {
  /** One collection, one mode per context of each modifier, and the defaults. */
  ds: DesignSystem;
  /** Name of the collection inside `ds` — the leading segment of every token path. */
  dsCollectionName: string;
  /** Mode names: the defaults first, then each other context on its own; the order Figma modes are created in. */
  modeNames: string[];
  /** The mode of the document's default context selections: the core's `getDefaultMode()`. */
  defaultMode: string;
}

/**
 * The Figma collection a document's variables belong in.
 *
 * Shared rather than repeated: the sync plan and the Inspector must look at the
 * *same* collection, or the one describing what is and the one proposing what to
 * do would be talking about two different sets of variables — and neither would
 * have any way to notice.
 */
export function figmaCollectionNameFor(resolver: Resolver, preferred?: string): string {
  return preferred?.trim() || resolver.name || 'resolved';
}

/**
 * The most modes Figma lets a collection hold, for every file. Figma's limit depends on the plan of
 * the file (4, 10, 20 or 40); Toghen does not read the plan and takes no other number, so what a
 * design system syncs does not depend on who pays for the file.
 */
export const MAX_MODES = 10;

/**
 * The contexts of a modifier that Figma gets, the default first: all of them, or the ones its
 * `$extensions["com.toghen"].figma.include` lists, in the document's order whatever order the list
 * is written in. CSS reads nothing from this key; the contexts it leaves out are still written there.
 *
 * @throws {Error} Naming the modifier, when `include` is not a list of names, names a context the
 *   modifier does not have, or leaves out the default context.
 */
export function figmaContexts(modifier: {
  name: string;
  default?: string;
  contexts: readonly string[];
  $extensions?: Record<string, any>;
}): string[] {
  // eslint-disable-line @typescript-eslint/no-explicit-any
  // `resolveSumModes` refuses a modifier with no default before any caller reaches here.
  const first = modifier.default!;
  const all = [first, ...modifier.contexts.filter((context) => context !== first)];
  const include: unknown = modifier.$extensions?.['com.toghen']?.figma?.include;
  if (include === undefined) return all;

  const where = `Modifier "${modifier.name}"`;
  if (!Array.isArray(include) || include.some((name) => typeof name !== 'string')) {
    throw new Error(`${where}: figma.include must be a list of context names.`);
  }
  const unknown = include.filter((name) => !all.includes(name));
  if (unknown.length > 0) {
    throw new Error(
      `${where} lists ${unknown.map((name) => `"${name}"`).join(', ')} in figma.include, which ` +
        `${unknown.length === 1 ? 'is not a context' : 'are not contexts'} of it (it has ${all.map((name) => `"${name}"`).join(', ')}).`,
    );
  }
  if (!include.includes(first)) {
    throw new Error(
      `${where}: figma.include must list its default context "${first}". Figma's default mode is the first ` +
        `one of the collection and is fixed when the collection is made, so the default cannot be left out.`,
    );
  }
  return all.filter((context) => include.includes(context));
}

/** One mode's view of the document: every token path and its resolved value. */
export interface ModeSnapshot {
  modeName: string;
  pathToToken: Map<string, SnapshotToken>;
}

export interface SnapshotToken {
  value: unknown;
  type: string;
  /** The core's reason, where it cannot compute the value for the type (then `value` is undefined): the token is one skip. */
  refused?: string;
  /**
   * The token this one is, when its whole value is one reference: the target's
   * lookup path, first hop. Syntactic only; whether Figma can express it as an
   * alias is decided where types are known, in `correspondence.ts`.
   */
  aliasOf?: string;
  /**
   * What each member of a composite refers to, when the member is one whole
   * reference: member address (`'fontSize'`, `'0.color'`) → target lookup path.
   * Absent when there are none. Whether Figma can bind it is decided where
   * fields are known, in `styleSyncEngine.ts`.
   */
  memberOf?: Record<string, string>;
}

/**
 * Resolves a document's **sum**: the defaults, and each context of each
 * modifier on its own, in one `DesignSystem`.
 *
 * It has a mode per context, not per combination: what a Figma file with a
 * collection per modifier holds, and the only system the plugin builds, since
 * the product of a large document does not finish. `defaultMode` is the core's
 * answer, `getDefaultMode()`, which the sum places first in `modeNames`.
 *
 * Lib builds the sum with `{}` as its base, which throws for a modifier that
 * declares no `default` (a legal document). The sum needs one for each, so this
 * throws, naming each such modifier; there is no fallback to the product.
 *
 * Built once per document: it is the slow part of a large load.
 */
export function resolveSumModes(resolver: Resolver): MultiModeResolution {
  const cached = sums.get(resolver);
  if (cached) return cached;

  const undeclared = resolver
    .getModifiers()
    .filter((modifier) => modifier.default === undefined)
    .map((modifier) => modifier.name);
  if (undeclared.length > 0) {
    throw new Error(
      undeclared.map((name) => `Modifier "${name}" declares no default context.`).join(' ') +
        ` The sum of the contexts needs a default for each modifier: its Figma collection starts with the default ` +
        `context, because Figma's default mode is fixed when the collection is made. Declare a "default" ` +
        `for ${undeclared.length === 1 ? 'it' : 'each'} and load the document again.`,
    );
  }

  const ds = resolver.resolveContextsToDesignSystem();
  const dsCollectionName = ds.getCollectionNames()[0];
  const collection = ds.getCollection(dsCollectionName);
  const modeNames = collection?.getModes() ?? [];

  const resolution = { ds, dsCollectionName, modeNames, defaultMode: collection?.getDefaultMode() ?? '' };
  sums.set(resolver, resolution);
  return resolution;
}

/** The sums already built, by document. A loaded document does not change. */
const sums = new WeakMap<Resolver, MultiModeResolution>();

/**
 * Reads every mode of a resolved system into a flat path → value map.
 *
 * References are expanded per mode, so a semantic token pointing at different
 * primitives in `light` and `dark` yields the two different concrete values.
 * Where a mode's whole value is one reference, `aliasOf` keeps what resolution
 * erased, and `memberOf` does the same for a composite's members; the library
 * says so, since the plugin never reads `{...}` itself.
 *
 * @param resolution - Output of {@link resolveSumModes}
 * @returns One snapshot per mode, in `modeNames` order
 */
export function snapshotModes(resolution: MultiModeResolution): ModeSnapshot[] {
  const { ds, dsCollectionName, modeNames } = resolution;
  const collection = ds.getCollection(dsCollectionName);
  if (!collection) return [];

  return modeNames.map((modeName) => {
    const pathToToken = new Map<string, SnapshotToken>();

    for (const tokenPath of collection.getAllPaths(modeName)) {
      const fullPath = `${dsCollectionName}.${tokenPath}`;
      const token = readToken(ds, fullPath, modeName);
      if (!token) continue;

      const references = ds.referencesOf(fullPath, modeName);
      const whole = references.length === 1 && references[0].at === '' && !references[0].interpolated;
      const memberOf: Record<string, string> = {};
      for (const ref of references) {
        if (ref.at !== '' && !ref.interpolated) memberOf[ref.at] = ref.to;
      }
      pathToToken.set(fullPath, {
        value: token.$value,
        type: token.$type,
        ...(token.refused === undefined ? {} : { refused: token.refused }),
        ...(whole ? { aliasOf: references[0].to } : {}),
        ...(Object.keys(memberOf).length > 0 ? { memberOf } : {}),
      });
    }

    return { modeName, pathToToken };
  });
}

/**
 * A token as the core resolves it in one mode, or null when it is not there. Where the core refuses to compute the
 * value for the type (a typed `dimension` that resolves to `8px 13px`), its type and the core's reason instead, so
 * that one token is one skip and not the stop of a plan. Any other failure is thrown.
 *
 * The core gives a token's type only with its value, so where it refuses the value the type is read here as the core
 * reads it (W3C DTCG §5.2.2): the token's own, else the type of the token its whole value refers to, else its
 * nearest group's.
 */
export function readToken(ds: DesignSystem, path: string, mode: string): { $type: string; $value?: unknown; refused?: string } | null {
  try {
    return ds.resolveToken(path, mode);
  } catch (error) {
    if (!(error instanceof InvalidTokenError)) throw error;
    return { $type: typeOfRefused(ds, path, mode), refused: error.message };
  }
}

function typeOfRefused(ds: DesignSystem, path: string, mode: string): string {
  const lookup = ds.lookupPath(path);
  const name = lookup.slice(0, lookup.indexOf('.'));
  const tokenPath = lookup.slice(name.length + 1);
  const collection = ds.getCollection(name);
  const raw = collection?.getToken(tokenPath, mode);
  if (!collection || !raw) return '';
  const target = referenceTarget(raw.$value);
  const through = target === undefined ? '' : (readToken(ds, `${name}.${target}`, mode)?.$type ?? '');
  if (raw.$type || through) return raw.$type || through;
  const segments = tokenPath.split('.');
  for (let i = segments.length - 1; i > 0; i -= 1) {
    const type = collection.getGroupAttribute(segments.slice(0, i).join('.'), '$type', mode);
    if (type !== null) return type as string;
  }
  return '';
}

/**
 * Every token path of the sum that has a value in at least one of `modes` (all of them when none are given), with
 * the modes it has one in. Reference paths, in order of first appearance, so a plan is stable between runs; the
 * modes in `modeNames` order. Planning from one mode's paths is what made mode-only tokens vanish without a warning.
 *
 * The core walks every mode only privately (`getAllPaths()` takes one), and this adapter is its one consumer, so
 * the walk is here, once: the sum, the token graph, the document's counts and the component files all call it.
 */
export function pathsInAnyMode(resolution: MultiModeResolution, modes: readonly string[] = resolution.modeNames): Map<string, string[]> {
  const collection = resolution.ds.getCollection(resolution.dsCollectionName);
  const found = new Map<string, string[]>();
  for (const mode of modes) {
    for (const path of collection?.getAllPaths(mode) ?? []) (found.get(path) ?? found.set(path, []).get(path)!).push(mode);
  }
  return found;
}

/** A reference to a token: who refers (a lookup path), and where in its value (`''` for the whole value, `fontSize` for a member). */
export interface Referrer {
  from: string;
  at: string;
}

/**
 * Who refers to each token, in the modes `pathsInAnyMode` gave: target lookup path → each referrer, once per member.
 * The core answers what one token refers to (`referencesOf()`); the reverse has one consumer, this adapter, so it
 * is built here, once, for the sum's purposes and the token graph alike.
 */
export function referrersOf(resolution: MultiModeResolution, paths: ReadonlyMap<string, readonly string[]>): Map<string, Referrer[]> {
  const { ds, dsCollectionName } = resolution;
  const referrers = new Map<string, Referrer[]>();
  for (const [path, modes] of paths) {
    const from = `${dsCollectionName}.${path}`;
    for (const mode of modes) {
      for (const { at, to } of ds.referencesOf(from, mode)) {
        const into = referrers.get(to) ?? referrers.set(to, []).get(to)!;
        if (!into.some((known) => known.from === from && known.at === at)) into.push({ from, at });
      }
    }
  }
  return referrers;
}
