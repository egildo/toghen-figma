/**
 * The last few resolver documents this user loaded, kept so they can be loaded
 * again without finding the file.
 *
 * ### Why it holds the bundle, not a path or the files
 *
 * A plugin cannot re-read a file from disk. The UI gets a `File` at the moment
 * the user picks it and nothing afterwards — no path, no handle, no second
 * read. So a recents list that stored only a name would be a list you can look
 * at and not click. The bundle travels with the entry: the document the core's
 * `load` returned, every reference to another file already resolved, so it
 * loads again with no file at all. The composition (what that load read, and
 * how) travels beside it, so the screen can still say where it came from.
 *
 * Entries kept before the core loaded documents hold the document's text as
 * `json`. Such an entry is a resolver document by construction; it is read as
 * one, once, and the list is written back in the new shape.
 *
 * ### Why per user rather than per file
 *
 * `figma.clientStorage` is scoped to the person, not the document, and follows
 * them into every file they open — the same argument that put the window size
 * there. Recents are a property of someone's working habits. Putting them in
 * the file instead would publish one person's in-progress token documents to
 * everyone with access to it, and would make the list start empty in each new
 * file, which is the opposite of useful.
 *
 * ### Size
 *
 * Figma documents no quota for `clientStorage`, and the typings state only that
 * `setAsync` "will reject with an error message if storage failed" — so there
 * is no number here to enforce, and inventing one would be a guess dressed as a
 * constraint. Instead the write is attempted and, if it is refused, the oldest
 * entry is dropped and it is attempted again, down to a single entry. A recents
 * list is a convenience; it must never be the reason a load fails.
 */

import type { ResolverDocument } from '@toghen/lib';
import type { Composition, RecentDocumentSummary } from '../../shared/protocol.js';

/** Key in `figma.clientStorage`, which is per user rather than per file. */
export const RECENTS_KEY = 'recentDocuments';

/**
 * How many to keep.
 *
 * Enough to cover the systems someone moves between, short enough to read
 * without scanning. It is a list you glance at, not one you search.
 */
export const MAX_RECENTS = 5;

export interface RecentDocument extends RecentDocumentSummary {
  /** The bundle: `load`'s self-contained document, so the entry loads again without its files. */
  document: ResolverDocument;
  /** What the load that stored it read, and how. */
  composition: Composition;
}

/**
 * Reads the list, newest first.
 *
 * Never throws and never rejects. A corrupt or half-written blob reads as "no
 * recents", which costs the user a trip to the file picker — the safe
 * direction, and the one they were taking anyway before this existed.
 */
export async function loadRecents(): Promise<RecentDocument[]> {
  try {
    const stored: unknown = await figma.clientStorage.getAsync(RECENTS_KEY);
    if (!Array.isArray(stored)) return [];

    const recents = stored.map(fromOldShape).filter(isRecentDocument).slice(0, MAX_RECENTS);
    if (stored.some(isOldShape)) return await writeAsFarAsItFits(recents);
    return recents;
  } catch {
    return [];
  }
}

/**
 * Puts an entry at the top of the list and writes it back.
 *
 * Entries are identified by {@link RecentDocument.key}, so loading an edited
 * document replaces its entry and moves it to the front rather than growing a
 * second row that differs only by timestamp. Editing a document and loading it
 * again is a normal working loop, not a new system.
 *
 * @returns the list as stored, so the caller can report it without re-reading.
 */
export async function rememberRecent(entry: RecentDocument): Promise<RecentDocument[]> {
  const existing = await loadRecents();
  const next = [entry, ...existing.filter((item) => item.key !== entry.key)].slice(0, MAX_RECENTS);

  return writeAsFarAsItFits(next);
}

/** Drops one entry, by key. */
export async function forgetRecent(key: string): Promise<RecentDocument[]> {
  const next = (await loadRecents()).filter((item) => item.key !== key);
  return writeAsFarAsItFits(next);
}

/** What the UI needs to draw the list — everything except the document itself. */
export function summarize(recents: readonly RecentDocument[]): RecentDocumentSummary[] {
  // The documents are deliberately left behind. The UI never needs them, and
  // posting five of them across the iframe boundary on every load is work
  // nobody asked for.
  return recents.map(({ document: _document, composition: _composition, ...summary }) => summary);
}

/**
 * Writes the list, shedding the oldest entries until the write is accepted.
 *
 * `setAsync` rejects when storage fails and names no budget beforehand, so the
 * only way to find the limit is to reach it. Shedding from the end drops the
 * least recently used first, which is the entry a user is least likely to miss.
 */
async function writeAsFarAsItFits(entries: RecentDocument[]): Promise<RecentDocument[]> {
  for (let count = entries.length; count > 0; count -= 1) {
    const attempt = entries.slice(0, count);
    try {
      await figma.clientStorage.setAsync(RECENTS_KEY, attempt);
      return attempt;
    } catch {
      // Try again with one fewer.
    }
  }

  try {
    await figma.clientStorage.deleteAsync(RECENTS_KEY);
  } catch {
    // Nothing further to try, and nothing here is worth failing a load over.
  }
  return [];
}

function isRecentDocument(value: unknown): value is RecentDocument {
  if (typeof value !== 'object' || value === null) return false;

  const entry = value as Partial<RecentDocument>;
  return (
    typeof entry.key === 'string' &&
    typeof entry.name === 'string' &&
    typeof entry.document === 'object' &&
    entry.document !== null &&
    typeof entry.composition === 'object' &&
    entry.composition !== null &&
    typeof entry.loadedAt === 'string'
  );
}

/** An entry kept before the core loaded documents: the document's text as `json`, and no composition. */
const isOldShape = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && typeof (value as { json?: unknown }).json === 'string';

/** An old entry read as the resolver document it always was; any other value as it is. One that does not parse is dropped by the filter. */
function fromOldShape(value: unknown): unknown {
  if (!isOldShape(value)) return value;
  const { json, ...entry } = value as RecentDocumentSummary & { json: string };
  try {
    const document = JSON.parse(json) as ResolverDocument;
    const composition: Composition = { form: 'resolver', entry: entry.fileName ?? entry.key, reads: [] };
    return { ...entry, document, composition };
  } catch {
    return null;
  }
}
