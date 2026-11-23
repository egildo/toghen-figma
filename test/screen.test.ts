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
