/**
 * One JSON value kept in the Figma file's shared plugin data, split across
 * numbered shards with an index saying how many there are.
 *
 * ```
 * toghen/<key>      {"v":1,"shards":2}
 * toghen/<key>.0    {"first part…
 * toghen/<key>.1    …the rest"}
 * ```
 *
 * Figma caps one entry at 100 kB counting namespace and key, so anything that
 * can grow is sharded. The payload is escaped to pure ASCII first, so its
 * character count is its byte count and no surrogate pair is split across a
 * shard boundary. The index is cleared first, the shards written, then the
 * index: a write interrupted part-way leaves no index, which reads as nothing
 * stored, never as a mixture of old and new shards.
 *
 * The kept templates (`templateStore.ts`) and the lock (`lockStore.ts`) are kept this way. So was the sync
 * record of older builds, which `rootRecord.ts` reads once and deletes.
 */

/** Figma requires a namespace of at least three alphanumeric characters. */
export const NAMESPACE = 'toghen';

/** Figma's documented cap on one entry, counting namespace + key + value. */
const ENTRY_LIMIT_BYTES = 100 * 1024;
/** Generous allowance for the namespace plus the longest shard key. */
const KEY_OVERHEAD_BYTES = 64;
export const SHARD_CAPACITY = ENTRY_LIMIT_BYTES - KEY_OVERHEAD_BYTES;

const FORMAT_VERSION = 1;

export interface ShardedWrite {
  ok: boolean;
  /** Set when the payload needed more shards than allowed; nothing was kept. */
  tooBig?: boolean;
  /** Set when Figma refused a write. */
  reason?: string;
  bytes: number;
  shards: number;
}

/**
 * The stored payload, or `''` when there is none.
 *
 * Throws only when the index itself is not JSON; a missing index, a future
 * version, or a count that is not a whole number read as nothing stored.
 */
export function readSharded(key: string): string {
  const index = read(key);
  if (!index) return '';

  const parsed: unknown = JSON.parse(index);
  if (!isPlainObject(parsed)) return '';
  if (parsed.v !== FORMAT_VERSION) return '';

  const count = parsed.shards;
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) return '';

  let payload = '';
  for (let i = 0; i < count; i += 1) {
    payload += read(`${key}.${i}`);
  }
  return payload;
}

/**
 * Writes `payload` (already ASCII, see `toAsciiJson`) under `key`. Returns rather
 * than throws: a caller that has just written to Figma must not have that work
 * reported as failed because its record could not be kept.
 */
export function writeSharded(key: string, payload: string, maxShards: number): ShardedWrite {
  const shards = chunk(payload, SHARD_CAPACITY);
  try {
    // Clearing the index first is the commit protocol: see the note at the top.
    write(key, '');

    if (shards.length > maxShards) {
      clearShardsFrom(key, 0);
      return { ok: false, tooBig: true, bytes: payload.length, shards: 0 };
    }

    shards.forEach((shard, index) => {
      write(`${key}.${index}`, shard);
    });
    clearShardsFrom(key, shards.length);
    write(key, toAsciiJson({ v: FORMAT_VERSION, shards: shards.length }));
    return { ok: true, bytes: payload.length, shards: shards.length };
  } catch (error) {
    return { ok: false, bytes: payload.length, shards: 0, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Removes the value kept under `key`: the index first, then every shard. */
export function clearSharded(key: string): void {
  write(key, '');
  clearShardsFrom(key, 0);
}

/**
 * Serializes to JSON containing only ASCII. `JSON.stringify` already escapes
 * control characters, so what remains above U+007F is escaped here; the result
 * parses back identically, astral characters included.
 */
export function toAsciiJson(value: unknown): string {
  return JSON.stringify(value).replace(/[\u0080-￿]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function read(key: string): string {
  return figma.root.getSharedPluginData(NAMESPACE, key);
}

/** Figma removes the key when the value is the empty string. */
function write(key: string, value: string): void {
  figma.root.setSharedPluginData(NAMESPACE, key, value);
}

/**
 * Removes every shard of `key` from `first` upward. A value that shrinks leaves
 * shards behind; enumerating the namespace rather than trusting the previous
 * index also cleans up after an interrupted write.
 */
function clearShardsFrom(key: string, first: number): void {
  const prefix = `${key}.`;
  for (const stored of figma.root.getSharedPluginDataKeys(NAMESPACE)) {
    if (!stored.startsWith(prefix)) continue;
    const rest = stored.slice(prefix.length);
    if (/^\d+$/.test(rest) && Number(rest) >= first) write(stored, '');
  }
}

function chunk(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}
