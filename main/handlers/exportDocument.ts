import type { ResolverInput } from '@toghen/lib';
import type { Command, Response } from '../../shared/protocol.js';
import { exportToJSON } from '../engines/ioAdapter.js';
import type { Stamp } from '../components/stamp.js';
import { getState } from '../runtimeState.js';
import { indexFigmaCollections } from '../utils/figmaCollectionIndex.js';
import { flatMap } from '../utils/lists.js';
import { localStyles } from '../utils/tokenStamps.js';

type ExportDocumentCommand = Extract<Command, { type: 'EXPORT_DOCUMENT' }>;

/**
 * Writes the resolved tokens out as DTCG JSON, for one combination of contexts.
 *
 * Figma styles and this format are both single-mode, so a document with several
 * contexts cannot round-trip through here. The combination is chosen
 * deliberately: one context per modifier, each defaulting to the modifier's
 * default and shown on the screen before the command runs. It is resolved on its
 * own (`resolver.resolveToDesignSystem(input)`), never as part of the product of
 * every combination, which a large document cannot finish. The combination
 * appears in the filename, and the contexts left out are named to the user.
 */
export async function EXPORT_DOCUMENT(payload: ExportDocumentCommand['payload']): Promise<void> {
  const { resolver } = getState();

  if (!resolver) {
    postToUi({
      type: 'ERROR',
      payload: {
        message: 'Load a resolver document before exporting.',
        code: 'NO_RESOLVER',
        commandType: 'EXPORT_DOCUMENT',
      },
    });
    return;
  }

  try {
    const declared = resolver.getModifiers();
    const modifiers = declared.map((modifier) => modifier.name);
    const asked = payload.contexts ?? {};
    for (const name of Object.keys(asked)) {
      if (!modifiers.includes(name)) {
        throw new Error(`"${name}" is not one of this document's modifiers (${modifiers.join(', ') || 'none'}).`);
      }
    }

    const input: ResolverInput = {};
    for (const { name, contexts, default: fallback } of declared) {
      const context = asked[name] ?? fallback;
      if (context === undefined || !contexts.includes(context)) {
        throw new Error(`"${context}" is not one of the contexts of "${name}" (${contexts.join(', ')}).`);
      }
      input[name] = context;
    }

    const ds = resolver.resolveToDesignSystem(input);
    const mode = resolver.getModeName(input);

    const json = exportToJSON(ds, payload.includeExtensions ? await stampsByToken() : new Map(), {
      includeExtensions: payload.includeExtensions,
      // Where the tokens came from. The resolver document can say which
      // revision of the system it describes; without carrying it here, the
      // export said only which combination it held.
      documentVersion: resolver.getDeclaredVersion(),
    });

    const omitted = flatMap(declared, ({ name, contexts }) => contexts.filter((context) => context !== input[name]));
    if (omitted.length > 0) {
      figma.notify(
        `Exported ${mode}. ${omitted.join(', ')} ${omitted.length === 1 ? 'is' : 'are'} ` +
          `not in this file — DTCG token files hold one context of each modifier.`,
      );
    }

    const baseName = resolver.name?.trim() || 'resolver';
    // A mode name joins the contexts with "/", which a filename cannot hold.
    const filename = omitted.length > 0 ? `${baseName}.${mode.replace(/\//g, '.')}.json` : `${baseName}.json`;

    postToUi({
      type: 'DOCUMENT_EXPORTED',
      payload: { json, filename },
    });
  } catch (error) {
    postToUi({
      type: 'ERROR',
      payload: {
        message: error instanceof Error ? error.message : String(error),
        code: 'INVALID_DOCUMENT',
        commandType: 'EXPORT_DOCUMENT',
      },
    });
  }
}

/**
 * The stamp each variable and style Toghen wrote in the file carries, by the token it names, without its id: a target's
 * ids stay in the file they belong to, out of the token file. A person's copy is not Toghen's and is not among them.
 */
async function stampsByToken(): Promise<Map<string, Stamp>> {
  const stamps = new Map<string, Stamp>();
  const add = (stamp: Stamp | undefined): void => {
    if (stamp?.is.token === undefined) return;
    const { id: _id, ...rest } = stamp;
    stamps.set(stamp.is.token, rest);
  };
  for (const stamped of Object.values((await indexFigmaCollections()).variablesByToken)) for (const { stamp } of stamped) add(stamp);
  for (const { stamp } of await localStyles()) add(stamp);
  return stamps;
}

function postToUi(message: Response): void {
  figma.ui.postMessage(message);
}
