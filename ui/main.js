// The design system's elements (dot, chip, tabs, segmented, callout, card, row): defined once, before any markup is drawn.
import '@toghen/ui/elements.js';
import { onResponse, send, lastAsker } from './commandBus.js';
import { render } from './render.js';
import { getState, setState, showResults } from './state.js';
import { initShell } from './shell.js';
import { initBridge } from './bridge.js';
import { inspectIfShowing } from './inspect.js';
import { initTabs } from './components/tabs.js';
import './components/results.js';
import './components/status-bar.js';
import './components/pane-load.js';
import './components/pane-sync.js';
import './components/pane-tokens.js';
import './components/pane-apply.js';
import './components/pane-build.js';
import './components/popover.js';
import { readSelection } from './components/pane-apply.js';

function downloadJSON(json, filename) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Asks what the file's collections hold now; the Sync pane says when it looked. */
const lookAtCollections = () => send({ type: 'GET_FIGMA_COLLECTIONS', payload: {} });

function initResponses() {
  onResponse((response) => {
    switch (response.type) {
      case 'DOCUMENT_LOADED':
      case 'DOCUMENT_STATE': {
        const p = response.payload;
        // Answered, not inferred (R9): `loaded: false` is how "nothing" is said.
        const loaded = p.loaded !== false;
        setState({
          documentLoaded: loaded,
          documentName: loaded ? p.name : null,
          documentDescription: p.description ?? null,
          documentVersion: p.version ?? null,
          tokenCount: p.tokenCount,
          styleCount: p.styleCount ?? 0,
          modifiers: p.modifiers,
          modes: p.modes,
          modifierDefaults: p.modifierDefaults ?? {},
          defaultMode: p.defaultMode ?? '',
          docCollections: p.collections ?? null,
          fileName: p.fileName ?? null,
          composition: loaded ? (p.composition ?? null) : null,
          // Only a load this window saw has a time it can state.
          loadedAt: response.type === 'DOCUMENT_LOADED' ? new Date().toISOString() : getState().loadedAt,
          status: 'idle',
          plan: null,
          progress: { completed: 0, total: 0, label: '' },
          lastResult: null,
          auditResult: null,
          resultsSource: null,
          resultsOrigin: null,
          componentResult: null,
          resultsExecute: null,
          errorMessage: null,
          // A picture of the previous document describes nothing here. Cleared
          // rather than left standing, because a stale one looks exactly like a
          // fresh one.
          inspection: null,
          inspectOpenPath: null,
          tokensTrail: null,
          // A new document brings its own graph right behind this message.
          tokenGraph: response.type === 'DOCUMENT_LOADED' ? null : getState().tokenGraph,
          // Sync, Tokens and Apply need a document; with none, the Load pane is the way in.
          activePanel: loaded || ['build'].includes(getState().activePanel) ? getState().activePanel : 'load',
          // A load clears what was picked for it; a reply that loads nothing leaves the pick for another try.
          ...(loaded ? { loadPick: null, loadOverrides: null } : {}),
        });
        // What the load itself reported, its collisions and the map's unused keys, one row each, headed `load` (R2, R6).
        if (response.type === 'DOCUMENT_LOADED' && p.report) showResults('load', { status: 'idle', plan: p.report });
        if (loaded) {
          lookAtCollections();
          inspectIfShowing();
        }
        break;
      }
      case 'TOKEN_GRAPH':
        setState({ tokenGraph: response.payload });
        break;
      case 'CORRESPONDENCE':
        // A new look is a new moment: the layer counts were of the old one.
        setState({ inspection: response.payload, inspecting: false, errorMessage: null, boundLayers: {} });
        break;
      case 'RECENTS':
        setState({ recents: response.payload });
        break;
      case 'SYNC_STATE':
        // Only the sync state: it arrives beside other answers and after every
        // execute, and must not disturb whatever the surface is showing.
        setState({ syncState: response.payload });
        break;
      case 'FIGMA_COLLECTIONS':
        setState({ figmaCollections: response.payload, collectionsAt: new Date().toISOString() });
        break;
      case 'CONVENTIONS_LOADED':
        setState({ conventionsLoaded: true, conventionCount: response.payload.count, status: 'idle', errorMessage: null });
        break;
      case 'PLAN_READY': {
        // The Apply pane's one-click Bind: its plan is on the surface, and its Execute follows.
        const bind = getState().pendingBind;
        if (bind && response.payload.planType === 'apply_bindings') {
          showResults('apply_bindings', {
            status: 'running',
            plan: response.payload,
            planAt: new Date().toISOString(),
            pendingBind: null,
            errorMessage: null,
          });
          send({ type: 'EXECUTE_APPLY_BINDINGS', payload: {} });
          break;
        }
        showResults(response.payload.planType, {
          status: 'ready',
          plan: response.payload,
          // The Sync pane's drift note has two possible sources, and picking
          // the more recent one needs both to be dated.
          planAt: new Date().toISOString(),
          progress: { completed: 0, total: 0, label: '' },
          errorMessage: null,
        });
        break;
      }
      case 'AUDIT_RESULT':
        showResults('audit', { status: 'complete', auditResult: response.payload, errorMessage: null });
        break;
      case 'OPERATION_PROGRESS':
        setState({
          status: 'running',
          progress: { completed: response.payload.completed, total: response.payload.total, label: response.payload.currentLabel },
          errorMessage: null,
        });
        break;
      case 'OPERATION_COMPLETE':
        // The source is kept: it says which command finished, and the plan it
        // came from is gone by now.
        setState({
          status: 'complete',
          resultsCollapsed: false,
          resultsAt: new Date().toISOString(),
          resultsFilter: null,
          plan: null,
          auditResult: null,
          lastResult: response.payload,
          resultsOrigin: lastAsker() === 'command line' ? 'command line' : null,
          progress: { completed: 0, total: 0, label: '' },
          errorMessage: null,
          // A run has just changed the file the picture describes.
          inspection: null,
          boundLayers: {},
        });
        if (getState().documentLoaded) {
          lookAtCollections();
          inspectIfShowing();
          // The Apply pane in front reads its layers again: an apply or a bind has just written them.
          if (getState().activePanel === 'apply') readSelection();
        }
        break;
      case 'DOCUMENT_EXPORTED':
        downloadJSON(response.payload.json, response.payload.filename);
        setState({ status: 'idle', errorMessage: null });
        break;
      case 'SELECTION_CHANGED':
        setState({ selection: response.payload.names });
        // The Apply pane follows the selection when that is its scope.
        if (getState().activePanel === 'apply' && getState().selectionScope === 'selection') readSelection();
        break;
      case 'SELECTION_BINDINGS':
        setState({ selectionBindings: response.payload, selectionReading: false });
        break;
      case 'BOUND_LAYERS':
        setState({ boundLayers: { ...getState().boundLayers, [response.payload.variableName]: response.payload } });
        break;
      case 'TEMPLATES':
        setState({ templates: response.payload });
        break;
      case 'LOCK':
        setState({ lock: response.payload });
        break;
      case 'NEEDS':
        // A standing picture of one blueprint's needs, drawn in the Build pane and kept whatever runs elsewhere (R15).
        setState({ needs: { ...getState().needs, [response.payload.name]: response.payload }, needsLooking: null });
        break;
      case 'WINDOW_MODE':
        setState({ windowMode: response.payload.mode });
        break;
      case 'COMPONENT_RUN': {
        // A build plan the Build pane asked for can be executed from the surface.
        const name = response.payload.component;
        const asked = getState().pendingBuild === name && response.payload.report.dryRun;
        showResults('component', {
          status: 'idle',
          componentResult: { name, report: response.payload.report },
          resultsExecute: asked ? { type: 'EXECUTE_BUILD', payload: { name } } : null,
          pendingBuild: null,
          errorMessage: null,
        });
        break;
      }
      case 'ERROR': {
        // A component run that stopped names every reason, and they are rows, not a banner.
        if (response.payload.problems) {
          const headline = response.payload.message.split('\n')[0];
          showResults('component', {
            status: 'error',
            componentResult: { headline, problems: response.payload.problems },
            errorMessage: headline,
            pendingBuild: null,
          });
          break;
        }
        // `inspecting` is cleared whatever failed: a latch only one path can
        // release is a latch that eventually sticks on "looking…".
        setState({
          status: 'error',
          errorMessage: response.payload.message,
          inspecting: false,
          selectionReading: false,
          pendingBind: null,
          pendingBuild: null,
          needsLooking: null,
        });
        break;
      }
      default:
        break;
    }
  });
}

function init() {
  initShell();
  initTabs();
  initBridge();
  initResponses();
  render(getState());
  send({ type: 'GET_DOCUMENT_STATE', payload: {} });
  // The plugin opens into a *file*, not into a document, and "you synced this
  // file before" is the first useful thing it can say.
  send({ type: 'GET_SYNC_STATE', payload: {} });
  send({ type: 'GET_RECENTS', payload: {} });
  // The Sync pane counts the templates, and the Build pane lists them.
  send({ type: 'GET_TEMPLATES', payload: {} });
}

init();
