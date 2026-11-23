/**
 * The screen's pure parts, run in Node: what each element draws from a state, what the result surface shows, and
 * where the Sync pane takes its drift note from. The page is the small shim of `support/screen.ts`, so nothing is
 * laid out; what is checked is the markup and the state. The look is the preview's to check.
 *
 * The design system is synthetic: one collection, `ds`, with a light mode and a few colour tokens.
 */

import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { draw, fire, make, screen, sent, words } from './support/screen.js';

let state: any;
let sync: any;
let tokens: any;
let results: any;

before(async () => {
  state = await screen('state.js');
  await screen('components/status-bar.js');
  await screen('components/popover.js');
  sync = await screen('components/pane-sync.js');
  tokens = await screen('components/pane-tokens.js');
  results = await screen('components/results.js');
  await screen('main.js');
});

const at = (time: string) => `2026-11-23T${time}:00.000Z`;
const mode = (agrees: boolean) => ({
  mode: 'ds / light',
  present: true,
  documentValue: '#111111',
  figmaValue: agrees ? '#111111' : '#222222',
  agrees,
});
const report = (path: string, tokenState: string, extra = {}) => ({
  path,
  type: 'color',
  state: tokenState,
  modes: [mode(tokenState !== 'drifted')],
  ...extra,
});
const loaded = (patch: object) => ({
  ...state.getState(),
  documentLoaded: true,
  documentName: 'ds',
  syncState: { hasRecord: true, documentTokenCount: 3, coveredCount: 3, partialCount: 0 },
  ...patch,
});
/** The Tokens pane's look: two drifted variables. */
const lookedAt = (time: string, drifted: number) => ({
  checkedAt: at(time),
  collectionName: 'ds',
  counts: { drifted },
  tokens: Array.from({ length: drifted }, (_, n) => report(`ds.color.c${n}`, 'drifted')),
});
const planOf = (planType: string, drifted: number) => ({ planType, operations: [], summary: { drifted } });
const syncLineOf = (html: string) => words(html).match(/In this Figma file.*?(?= Sync Variables)/)?.[0] ?? '';

describe('text in an attribute is escaped for an attribute', () => {
  const hostile = 'a" onmouseover="alert(1)" x="';

  it("the status bar's error tooltip", () => {
    const html = draw('tg-status-bar', { ...state.getState(), status: 'error', errorMessage: `${hostile}.json is not an overrides map` });
    // No tag gains a handler: the quote stays inside the title.
    assert.doesNotMatch(html, /<[^>]*\son\w+="/);
    assert.match(html, /title="a&quot; onmouseover=&quot;alert\(1\)&quot; x=&quot;\.json is not an overrides map"/);
  });

  it("the popover's label is the words, and its markup escapes them once", () => {
    const popover = make('tg-popover');
    const inspection = {
      checkedAt: at('10:00'),
      collectionName: 'ds',
      counts: { drifted: 1 },
      tokens: [{ ...report('ds.color.a&b', 'drifted'), modes: [{ ...mode(false), mode: 'ds / dark & dim' }] }],
    };
    popover.update({ ...loaded({ inspection }), activePanel: 'tokens', popover: { path: 'ds.color.a&b', x: 0, y: 0, panel: 'tokens' } });
    assert.equal(popover.getAttribute('aria-label'), 'Drifted in dark & dim: color.a&b');
    assert.match(popover.html, /Drifted in dark &amp; dim</);
  });
});

describe('the drift note claims only what a check covering those tokens found (R11)', () => {
  it('a style plan that found none does not clear the variables the Tokens pane found drifted', () => {
    const s = loaded({ inspection: lookedAt('10:00', 2), plan: planOf('style_sync', 0), planAt: at('10:05') });
    const drift = sync.driftKnownFrom(s);
    assert.equal(drift.count, 2);
    assert.match(drift.source, /^inspected /);
    const line = syncLineOf(draw('tg-pane-sync', s));
    assert.match(line, /2 drifted \(inspected [^)]+\)/);
    assert.doesNotMatch(line, /no drift/);
  });

  it('a style plan and a look that both found drift are both counted, and both named', () => {
    const drift = sync.driftKnownFrom(loaded({ inspection: lookedAt('10:00', 2), plan: planOf('style_sync', 1), planAt: at('10:05') }));
    assert.equal(drift.count, 3);
    assert.match(drift.source, /^inspected .+, planned /);
  });

  it('a style plan alone clears only the styles, and says so', () => {
    const s = loaded({ plan: planOf('style_sync', 0), planAt: at('10:05') });
    const line = syncLineOf(draw('tg-pane-sync', s));
    assert.match(line, /no drift in styles \(planned [^)]+\)/);
  });

  it('a variable plan and the look check the same tokens, so the more recent one answers', () => {
    const newer = sync.driftKnownFrom(loaded({ inspection: lookedAt('10:00', 2), plan: planOf('variable_sync', 0), planAt: at('10:05') }));
    assert.equal(newer.count, 0);
    assert.match(newer.source, /^planned /);
    const line = syncLineOf(draw('tg-pane-sync', loaded({ inspection: lookedAt('10:00', 0) })));
    assert.match(line, /no drift \(inspected [^)]+\)/);
    assert.doesNotMatch(line, /in styles/);
  });

  it('nothing looked: no note at all', () => {
    assert.equal(sync.driftKnownFrom(loaded({})), null);
  });
});

describe("a collection's dot reads every state the Tokens pane reads, the same way (R16)", () => {
  const collectionDot = (tokenState: string) => {
    const s = loaded({
      inspection: { checkedAt: at('10:00'), collectionName: 'ds', counts: {}, tokens: [report('ds.color.a', tokenState)] },
      docCollections: [{ name: 'ds', modes: ['light'], variableCount: 1 }],
      figmaCollections: [{ id: '1', name: 'ds', modes: [], variableCount: 1 }],
    });
    const table = draw('tg-pane-sync', s).match(/<table class="tg-table collections">.*?<\/table>/)?.[0] ?? '';
    const dot = table.match(/<tg-dot(?: data-state="([a-z]+)")?/)?.[1] ?? 'none';
    return { dot, pane: tokens.tokenModel({ ...s, tokenGraph: null }).byPath.get('ds.color.a').dot };
  };

  for (const tokenState of ['current', 'drifted', 'outdated', 'absent', 'blocked', 'adopted', 'not_inspected']) {
    it(tokenState, () => {
      const { dot, pane } = collectionDot(tokenState);
      assert.equal(dot, pane);
    });
  }

  it('an adopted token is not "looked, and agrees"', () => {
    assert.equal(collectionDot('adopted').dot, 'unread');
  });
});

describe('Cancel leaves the screen busy until the run says it is over', () => {
  it('stays running, with Execute off, until OPERATION_COMPLETE', () => {
    const surface = make('tg-results');
    surface.setup();
    const build = {
      componentResult: { name: 'Badge', report: { dryRun: true, steps: [], notes: [], warnings: [], pending: [] } },
      resultsExecute: { type: 'EXECUTE_BUILD', payload: { name: 'Badge' } },
    };
    state.setState({ ...loaded({ plan: planOf('variable_sync', 0) }), ...build, status: 'running' });
    sent.length = 0;

    fire(surface, 'click', '[data-action="cancel"]');
    assert.deepEqual(
      sent.map((command) => command.type),
      ['CANCEL_OPERATION'],
    );
    assert.equal(state.getState().status, 'running');
    assert.equal(results.resultView(state.getState()).footer.execute.disabled, true);
    assert.match(draw('tg-pane-sync', state.getState()), /data-action="execute-variables" disabled/);

    (globalThis as any).window.onmessage({
      data: { pluginMessage: { type: 'OPERATION_COMPLETE', payload: { applied: 1, skipped: 0, failed: 0, cancelled: 3, results: [] } } },
    });
    assert.equal(state.getState().status, 'complete');
  });
});
