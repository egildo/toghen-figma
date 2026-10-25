import { lastAsker } from './commandBus.js';
import { render } from './render.js';

const initialState = {
  /* ── The document that was loaded ── */
  documentLoaded: false,
  documentName: null,
  documentDescription: null,
  /** The version the system declares for itself, if any. */
  documentVersion: null,
  tokenCount: 0,
  styleCount: 0,
  modifiers: {},
  /** The sum's modes. */
  modes: [],
  /** The default context of each modifier. */
  modifierDefaults: {},
  /** The mode the document resolves to with no context chosen. */
  defaultMode: '',
  /** The collections a variable sync would build, from the document; null when the sum could not be built. */
  docCollections: null,
  /** The file it came from, for the Source card. */
  fileName: null,
  /** When this screen saw it load; null when it was loaded before the screen opened. */
  loadedAt: null,
  /** What the load read and how (`Composition`): the Load pane's standing picture. Null with nothing loaded. */
  composition: null,

  /* ── The Load pane, before Load runs ── */
  /**
   * The files picked and not loaded yet: `{ files: {path,text}[], entry, form, name, folder }`, or null.
   * The entry and, for token files, the collection name are on screen before Load runs (R10).
   */
  loadPick: null,
  /** An overrides map picked beside them: `{ fileName, map }`, or null. */
  loadOverrides: null,

  /**
   * What the Figma *file* records about having been synced — separate from the
   * document above, and answerable before any document is loaded.
   *
   * Null until the main thread answers, which is not the same as "no record":
   * the difference between "not asked yet" and "asked, and there is none" is
   * what keeps the empty state from flashing a wrong claim on open.
   */
  syncState: null,

  /** Design systems this user loaded before, newest first. Summaries only. */
  recents: [],

  /** The file's variable collections as last read, and when. */
  figmaCollections: null,
  collectionsAt: null,

  /**
   * The last picture the Tokens pane took, or null when it has not looked.
   *
   * Null is not "everything is fine" — it is "nobody has checked", and the two
   * must not render the same way. Cleared whenever the file or the document
   * moves under it, because a picture of a file that has since changed is worse
   * than no picture.
   */
  inspection: null,
  inspecting: false,
  /** The document's tokens as a graph: values, and the edges between them. */
  tokenGraph: null,
  /** The Tokens browser's open columns, as group paths from the root; null follows attention. */
  tokensTrail: null,
  tokensQuery: '',
  inspectOpenPath: null,
  inspectOnlyDifferences: false,

  conventionsLoaded: false,
  conventionCount: 0,
  conventionsFileName: null,
  auditResult: null,

  status: 'idle',
  plan: null,
  /** When `plan` was made, so the drift note can pick the more recent check. */
  planAt: null,
  progress: { completed: 0, total: 0, label: '' },
  lastResult: null,

  /* ── The shared result surface ── */
  /**
   * Which command produced what the surface shows. One surface serves every
   * pane, so it cannot be inferred from which button lit up (R6).
   */
  resultsSource: null,
  /** Who asked: 'command line', or null for the screen (R6). */
  resultsOrigin: null,
  /** When what the surface shows arrived. */
  resultsAt: null,
  /** What the last component run reported, or why it stopped. */
  componentResult: null,
  resultsCollapsed: true,
  /** A count chip pressed as a filter: the kind of row shown, or null for all. */
  resultsFilter: null,
  resultsShowAll: false,
  /**
   * What the surface's own Execute sends, when the plan on it can be executed
   * from there (a build plan). Null otherwise: the pane's Execute is the way.
   */
  resultsExecute: null,
  /** The checkbox under a breaking step: the next Execute of that plan may break. */
  allowBreaking: false,

  /**
   * The bridge to the command line, as last observed. `phase` is an event that
   * happened, with the time it did, and never a standing claim.
   */
  commandLine: { phase: 'off', at: null },

  selection: [],

  /* ── The Apply pane ── */
  /** Selection, page or file: the layers the pane reads, and its commands write. */
  selectionScope: 'selection',
  /** What the scope's layers are bound to, as last read; null before the first read. */
  selectionBindings: null,
  selectionReading: false,
  /** The one-click Bind waiting for its plan, so its Execute follows: `{ nodeId, property }`. */
  pendingBind: null,
  /** Apply's settings: the token query (a token's path or a group's), the field for one token ('' is by its last key), and the kinds. */
  applyTokens: '',
  applyField: '',
  applyKinds: ['frames', 'instances', 'components'],

  /**
   * Bound layers on the current page, by variable name, as last counted; `null`
   * while a count is asked. Cleared whenever the file may have moved under it.
   */
  boundLayers: {},

  /* ── The Build pane ── */
  /** The kept blueprints and component files, as last summarised; null before the first answer. */
  templates: null,
  templatesOpen: null,
  /** The template whose build plan was asked for, so the surface can offer its Execute. */
  pendingBuild: null,
  /** The lock, as last read; null before the first answer. */
  lock: null,
  /** The last look at each blueprint's needs, by its name (`NeedsPayload`). No entry is "not looked", never "fine". */
  needs: {},
  /** The blueprint whose needs are being looked up; cleared by the answer and by any error. */
  needsLooking: null,

  /** The drift popover: the token it answers and where it opened, or null. */
  popover: null,

  /** Which of the window's two remembered sizes it is at; null until the main thread says. */
  windowMode: null,

  activePanel: 'load',
  errorMessage: null,
};

let state = { ...initialState };

export function getState() {
  return state;
}

export function setState(patch) {
  state = { ...state, ...patch };
  render(state);
}

/**
 * Records a new result and opens the surface to show it.
 *
 * Anything arriving in the surface supersedes what was there, so the stale half
 * of a previous result cannot be read as part of this one.
 */
export function showResults(source, patch) {
  setState({
    resultsSource: source,
    resultsOrigin: lastAsker() === 'command line' ? 'command line' : null,
    resultsAt: new Date().toISOString(),
    componentResult: null,
    resultsCollapsed: false,
    resultsFilter: null,
    resultsShowAll: false,
    resultsExecute: null,
    allowBreaking: false,
    plan: null,
    lastResult: null,
    auditResult: null,
    ...patch,
  });
}

export function toggleResults() {
  setState({ resultsCollapsed: !state.resultsCollapsed });
}

export function resetState() {
  state = { ...initialState };
  render(state);
}
