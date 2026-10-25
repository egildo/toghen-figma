import type { DesignSystem } from '@toghen/lib';
import type { Stamp } from '../components/stamp.js';
import { flattenDesignSystem } from '../utils/flattenDesignSystem.js';
import { referencePath } from '@toghen/lib';

/** Namespace this plugin owns inside a token's `$extensions`. */
const NAMESPACE = 'com.toghen.figma';

/** Namespace for facts about the document rather than about one token. */
const DOCUMENT_NAMESPACE = 'com.toghen';

export interface ExportOptions {
  includeExtensions: boolean;
  /** Mode to export. Omitted for a document with a single mode. */
  mode?: string;
  /**
   * The version the design system declares for itself, if it declares one.
   *
   * Carried through so the export says which revision it came from. Without it
   * the provenance stopped at the resolver document: the token file named the
   * mode in its filename and nothing at all about the system.
   */
  documentVersion?: string;
}

/**
 * Writes the design system out as DTCG JSON. `stamps` are what the variables and styles of this file carry, by the
 * token each names: written out under the token's `$extensions` for reading only, since a target's ids and
 * receipts belong to one file and loading a document never reads them back.
 */
export function exportToJSON(ds: DesignSystem, stamps: ReadonlyMap<string, Stamp>, options: ExportOptions): string {
  const output: Record<string, unknown> = {};

  /*
   * Provenance first, so it reads at the top of the file.
   *
   * §6.3.2: "Groups MAY include an optional `$extensions` property where tools
   * MAY add proprietary, user-, team- or vendor-specific data." A token file's
   * root is a group — §6.1 identifies a group as any object without `$value` —
   * so this is where a fact about the whole document belongs.
   *
   * It cannot collide with a token: §5.1 requires that token and group names
   * MUST NOT begin with `$`.
   *
   * Gated on the same switch as per-token extensions. The control says
   * "Include $extensions", and writing vendor data into a file where the user
   * asked for none would contradict it.
   */
  if (options.includeExtensions && options.documentVersion) {
    output.$extensions = {
      [DOCUMENT_NAMESPACE]: { version: options.documentVersion },
    };
  }

  for (const { path, token } of flattenDesignSystem(ds, options.mode)) {
    const tokenObj: Record<string, unknown> = {
      $value: token.$value,
      $type: token.$type,
    };

    if (token.$description) {
      tokenObj.$description = token.$description;
    }

    if (options.includeExtensions) {
      const stamp = stamps.get(path);
      const existingExtensions = token.$extensions ?? {};

      if (Object.keys(existingExtensions).length > 0 || stamp) {
        // Merged *into* whatever the token already carries under our namespace,
        // not over it. Replacing the object wholesale dropped any key another
        // build had written there.
        const existingOurs = existingExtensions[NAMESPACE];
        tokenObj.$extensions = {
          ...existingExtensions,
          ...(stamp
            ? {
                [NAMESPACE]: {
                  ...(isPlainObject(existingOurs) ? existingOurs : {}),
                  stamp,
                },
              }
            : {}),
        };
      }
    }

    // The collection is where the tokens live, not a group of them: without it the
    // file is a DTCG document again, and loads back as one.
    setNestedPath(output, referencePath(path), tokenObj);
  }

  return JSON.stringify(output, null, 2);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Writes `value` at a dotted path, refusing to overwrite anything on the way.
 *
 * A backstop, not the enforcement: `Collection.setToken()` rejects a node that
 * is both a token and a group, so a `DesignSystem` cannot legally hold this
 * shape. It stays because the old code responded to a collision by replacing
 * whatever it found with an empty object — the token already written at the
 * shorter path vanished from the export without a word, and the export is what
 * a user reloads next session.
 */
function setNestedPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    const next = current[key];

    if (next === undefined) {
      current[key] = {};
    } else if (!isPlainObject(next) || '$value' in next) {
      throw new Error(`Cannot export "${path}": "${parts.slice(0, i + 1).join('.')}" is already a token, so it cannot also be a group.`);
    }

    current = current[key] as Record<string, unknown>;
  }

  const leaf = parts[parts.length - 1];
  if (current[leaf] !== undefined) {
    throw new Error(`Cannot export "${path}": it is both a token and a group.`);
  }
  current[leaf] = value;
}
