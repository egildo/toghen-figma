/**
 * Reads Figma back and reports where every token stands.
 *
 * ### Why it is asked for rather than sent
 *
 * The answer is only true for the instant it was taken. Figma can change under
 * the plugin — a designer editing a variable in another panel raises no event
 * this codebase watches — so the payload carries `checkedAt` and the pane offers
 * to look again. A standing claim with no timestamp is the badge that was caught
 * lying in smell #22, wearing different clothes.
 *
 * It also costs a full read of the file's variables, which is not worth paying
 * on load for a pane the user may never open.
 *
 * ### Why it does not build its own comparison
 *
 * Everything here comes from `utils/correspondence.ts`, which is also what
 * `VariableSyncEngine` plans from, over the same sum (`utils/sum.ts`) and the
 * same account of where each collection stands (`utils/standing.ts`). Two
 * implementations of "does Figma agree with the document" would eventually
 * disagree, and a pane reporting drift beside a plan reporting none is precisely
 * the defect this milestone exists to avoid. This handler only renders the answer.
 */

import type { InspectionPayload, ModeReport, Response, TokenReport } from '../../shared/protocol.js';
import type { CorrespondenceState } from '../../shared/protocol.js';
import { getState } from '../runtimeState.js';
import { compareToken, describeState, variableNameOfSymbol, type TokenCorrespondence } from '../utils/correspondence.js';
import { indexFigmaCollections, type FigmaCollectionIndex } from '../utils/figmaCollectionIndex.js';
import { fromFigmaValue } from '../utils/figmaTokenAdapter.js';
import { flatMap } from '../utils/lists.js';
import { figmaCollectionNameFor } from '../utils/resolverModes.js';
import { standingOf } from '../utils/standing.js';
import { buildSum, type Sum } from '../utils/sum.js';

export async function INSPECT_CORRESPONDENCE(): Promise<void> {
  const state = getState();
  if (!state.resolver) {
    postToUi({
      type: 'ERROR',
      payload: {
        message: 'Load a resolver document before inspecting.',
        code: 'NO_RESOLVER',
        commandType: 'INSPECT_CORRESPONDENCE',
      },
    });
    return;
  }

  const collectionName = figmaCollectionNameFor(state.resolver);
  let sum: Sum;
  try {
    sum = buildSum(state.resolver, collectionName, state.conversionMap);
  } catch (error) {
    postToUi({
      type: 'ERROR',
      payload: {
        message: error instanceof Error ? error.message : String(error),
        code: 'INVALID_DOCUMENT',
        commandType: 'INSPECT_CORRESPONDENCE',
      },
    });
    return;
  }

  const figmaIndex = await indexFigmaCollections();
  // A mode a collection does not have yet resolves to an id Figma holds nothing
  // under, which reads back as "no value to compare" rather than as agreement.
  const standing = standingOf(sum, figmaIndex);

  const counts = emptyCounts();
  const tokens: TokenReport[] = [];

  for (const token of sum.tokens) {
    const correspondence = compareToken({ token, sum, standing, figmaIndex });

    const { state: tokenState, note } = describeState(correspondence);
    counts[tokenState] += 1;
    tokens.push(toReport(correspondence, tokenState, note, figmaIndex));
  }

  postToUi({
    type: 'CORRESPONDENCE',
    payload: {
      checkedAt: new Date().toISOString(),
      collectionName,
      tokens,
      counts,
    } satisfies InspectionPayload,
  });
}

function toReport(
  correspondence: TokenCorrespondence,
  state: CorrespondenceState,
  note: string | undefined,
  figmaIndex: FigmaCollectionIndex,
): TokenReport {
  const { routing } = correspondence;
  const variableType = routing.kind === 'variable' ? routing.variableType : undefined;

  // A mode is named with its collection, `theme / dark`, and the links of a
  // chain are each in a collection of their own, so no two rows of a token
  // share a name.
  const modes: ModeReport[] = flatMap(correspondence.variables, (variable) =>
    variable.modes.map((mode) => ({
      mode: `${variable.collection} / ${mode.mode}`,
      present: mode.present,
      documentValue: render(mode.documentValue, variableType, figmaIndex),
      figmaValue: render(mode.figmaValue, variableType, figmaIndex),
      agrees: mode.agrees,
    })),
  );

  return {
    path: correspondence.path,
    type: correspondence.type,
    state,
    ...(note ? { note } : {}),
    ...(variableType ? { variableName: correspondence.variableName } : {}),
    modes,
  };
}

/**
 * Renders one side for the screen.
 *
 * **Both sides go through the same function.** Showing the document's value as
 * the token wrote it (`#0066CC`, `{colorSpace, components}`) against Figma's
 * (`{r: 0, g: 0.4, b: 0.8, a: 1}`) would put two representations of one colour
 * side by side and leave the reader to do the conversion — which is the work
 * this pane exists to have already done.
 *
 * This is display only. `figmaValuesEqual` remains the sole judge of agreement:
 * rounding here and comparing the strings would turn a display precision into a
 * correctness rule, and Figma stores float32, so `0.4` reads back as
 * `0.4000000059604645`.
 */
function render(
  value: VariableValue | null,
  variableType: VariableResolvedDataType | undefined,
  figmaIndex: FigmaCollectionIndex,
): string | null {
  if (value === null || variableType === undefined) return null;
  // A document-side alias may point at a variable the next sync creates; its
  // symbolic id carries the name, which reads better than the symbol.
  const readable = fromFigmaValue(value, variableType, (id) => figmaIndex.variableById[id]?.name ?? variableNameOfSymbol(id));
  return typeof readable === 'string' ? readable : String(readable);
}

/**
 * Every state at zero.
 *
 * Seeded rather than accumulated so the UI can read `counts.drifted` without
 * asking whether the key exists — an absent key and a zero mean the same thing
 * here, and only one of them is safe to render.
 */
function emptyCounts(): Record<CorrespondenceState, number> {
  return {
    current: 0,
    drifted: 0,
    outdated: 0,
    absent: 0,
    adopted: 0,
    blocked: 0,
    not_inspected: 0,
  };
}

function postToUi(response: Response): void {
  figma.ui.postMessage(response);
}
