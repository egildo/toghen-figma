/**
 * Component files and blueprints kept in the Figma file, so a set can be planned and built
 * again from the plugin's screen without the command line.
 *
 * Kept in the file rather than per user: a template is
 * part of what the file is built from, and everyone who opens the file should
 * be able to build from it. Sharded (`shardedData.ts`), as older builds kept the sync record,
 * since one file of a few dozen members can pass Figma's 100 kB per entry.
 */

import { isPlainObject, readSharded, toAsciiJson, writeSharded } from './shardedData.js';

const KEY = 'templates';

/** Our own limit: room for a few hundred files, and for other plugins. */
const MAX_SHARDS = 8;

export interface KeptTemplate {
  /** The component's name, or a blueprint's page (`.blueprint.kdl`), which is the key: one template per name. */
  name: string;
  fileName: string;
  text: string;
  /** When it was kept, ISO. */
  kept: string;
}

/** The kept templates, in the order they were first kept. A damaged record reads as none. */
export function loadTemplates(): KeptTemplate[] {
  let payload: string;
  try {
    payload = readSharded(KEY);
  } catch {
    return [];
  }
  if (!payload) return [];
  try {
    const parsed: unknown = JSON.parse(payload);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is KeptTemplate =>
        isPlainObject(entry) &&
        typeof entry.name === 'string' &&
        typeof entry.fileName === 'string' &&
        typeof entry.text === 'string' &&
        typeof entry.kept === 'string',
    );
  } catch {
    return [];
  }
}

/** Writes the list. Returns why it could not, rather than throwing. */
export function saveTemplates(templates: readonly KeptTemplate[]): { ok: true } | { ok: false; reason: string } {
  const written = writeSharded(KEY, toAsciiJson(templates), MAX_SHARDS);
  if (written.ok) return { ok: true };
  if (written.tooBig) {
    return {
      ok: false,
      reason: `The kept templates come to ${Math.round(written.bytes / 1024)} kB, more than this plugin keeps in one file. Forget one first.`,
    };
  }
  return { ok: false, reason: written.reason ?? 'Figma refused the write.' };
}

/** Keeps one, replacing the template of the same name and, when named, the one it takes the place of. */
export function keepTemplate(templates: readonly KeptTemplate[], template: KeptTemplate, replaces?: string): KeptTemplate[] {
  const without = templates.filter((kept) => kept.name !== template.name && kept.name !== replaces);
  const at = templates.findIndex((kept) => kept.name === template.name || kept.name === replaces);
  if (at < 0) return [...without, template];
  // Where it was, so replacing a file does not move its row.
  const before = templates.slice(0, at).filter((kept) => kept.name !== template.name && kept.name !== replaces);
  return [...before, template, ...without.slice(before.length)];
}
