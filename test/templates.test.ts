/**
 * Component files kept in the Figma file, and building from them: the store,
 * sharded like the sync record, and the handlers the Templates pane sends.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, useFigmaMock, type FigmaMockHandle } from './support/figmaMock.js';
import { EXECUTE_BUILD, FORGET_TEMPLATE, KEEP_TEMPLATE, PLAN_BUILD } from '../main/handlers/templates.js';
import { keepTemplate, loadTemplates, saveTemplates, type KeptTemplate } from '../main/utils/templateStore.js';
import { resetState } from '../main/runtimeState.js';
import type { Response, TemplatesPayload } from '../shared/protocol.js';

const badge = (values = 'calm loud') => `component Badge\nproperties {\n    VARIANT Tone ${values}\n}\nFRAME Badge layoutMode=VERTICAL\n`;

const posted = (mock: FigmaMockHandle) => mock.calls('ui.postMessage').map((call) => call.args[0] as Response);
const lastTemplates = (mock: FigmaMockHandle): TemplatesPayload => {
  const found = posted(mock)
    .filter((message) => message.type === 'TEMPLATES')
    .at(-1);
  assert.ok(found && found.type === 'TEMPLATES', 'TEMPLATES was posted');
  return found.payload;
};

const kept = (name: string, text = badge()): KeptTemplate => ({
  name,
  fileName: `${name.toLowerCase()}.component.kdl`,
  text,
  kept: '2026-10-08T09:00:00.000Z',
});

describe('the template store', () => {
  useFigmaMock();

  it('keeps and reads back, across shards and with any character', () => {
    createFigmaMock().install();
    // Past one shard's 100 kB, and a character outside ASCII.
    const big = kept('Notice', `${badge()}// ${'é'.repeat(60_000)}\n`);
    assert.deepEqual(saveTemplates([kept('Badge'), big]), { ok: true });
    assert.deepEqual(loadTemplates(), [kept('Badge'), big]);
  });

  it('reads a damaged record as none', () => {
    createFigmaMock().withSharedPluginData('toghen', 'templates', 'not json').install();
    assert.deepEqual(loadTemplates(), []);
  });

  it('replaces a template in place, and the one a new file takes the place of', () => {
    const list = [kept('A'), kept('B'), kept('C')];
    assert.deepEqual(
      keepTemplate(list, kept('B', 'new')).map((t) => [t.name, t.text]),
      [
        ['A', badge()],
        ['B', 'new'],
        ['C', badge()],
      ],
    );
    assert.deepEqual(
      keepTemplate(list, kept('D'), 'B').map((t) => t.name),
      ['A', 'D', 'C'],
    );
    assert.deepEqual(
      keepTemplate(list, kept('E')).map((t) => t.name),
      ['A', 'B', 'C', 'E'],
    );
  });
});

describe('KEEP_TEMPLATE, GET_TEMPLATES, FORGET_TEMPLATE', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  it('keeps a file that reads, and summarises what it declares', async () => {
    const mock = createFigmaMock().install();
    await KEEP_TEMPLATE({ fileName: 'badge.component.kdl', text: badge() });

    const [summary] = lastTemplates(mock).templates;
    assert.equal(summary.name, 'Badge');
    assert.equal(summary.fileName, 'badge.component.kdl');
    assert.equal(summary.members, 2);
    assert.deepEqual(summary.axes, [{ name: 'Tone', values: ['calm', 'loud'] }]);
    assert.equal(summary.builtInto, null);
    // Nothing compares a set with its file: it says so rather than guessing.
    assert.equal(summary.differs, null);
  });

  it('refuses a file that does not read, naming each problem where it is', async () => {
    const mock = createFigmaMock().install();
    await KEEP_TEMPLATE({ fileName: 'broken.component.kdl', text: 'component Broken\nFRAME Broken nonsense=1\n' });

    const [message] = posted(mock);
    assert.ok(message.type === 'ERROR');
    assert.equal(message.payload.code, 'INVALID_TEMPLATE');
    assert.match(message.payload.problems![0], /^broken\.component\.kdl:\d+:\d+ /);
    assert.deepEqual(loadTemplates(), []);
  });

  it('forgets one', async () => {
    const mock = createFigmaMock().install();
    await KEEP_TEMPLATE({ fileName: 'badge.component.kdl', text: badge() });
    await FORGET_TEMPLATE({ name: 'Badge' });
    assert.deepEqual(lastTemplates(mock).templates, []);
  });
});

describe('PLAN_BUILD and EXECUTE_BUILD', () => {
  useFigmaMock();
  beforeEach(() => resetState());

  it('plans without writing, builds for real, and then names the set it built', async () => {
    const mock = createFigmaMock().install();
    await KEEP_TEMPLATE({ fileName: 'badge.component.kdl', text: badge() });
    const writes = mock.writes().length;

    await PLAN_BUILD({ name: 'Badge' });
    const plan = posted(mock).at(-1)!;
    assert.ok(plan.type === 'COMPONENT_RUN');
    assert.equal(plan.payload.report.dryRun, true);
    assert.equal(mock.writes().length, writes);

    await EXECUTE_BUILD({ name: 'Badge' });
    const run = posted(mock)
      .filter((message) => message.type === 'COMPONENT_RUN')
      .at(-1)!;
    assert.ok(run.type === 'COMPONENT_RUN');
    assert.equal(run.payload.report.dryRun, false);
    assert.equal(run.payload.report.created.length, 2);
    assert.deepEqual(lastTemplates(mock).templates[0].builtInto?.page, 'Page 1');
  });

  it('holds a breaking build unless it is allowed', async () => {
    const mock = createFigmaMock().install();
    await KEEP_TEMPLATE({ fileName: 'badge.component.kdl', text: badge('calm loud quiet') });
    await EXECUTE_BUILD({ name: 'Badge' });
    await KEEP_TEMPLATE({ fileName: 'badge.component.kdl', text: badge('calm loud') });

    await EXECUTE_BUILD({ name: 'Badge' });
    const refused = posted(mock).at(-1)!;
    assert.ok(refused.type === 'ERROR');
    assert.equal(refused.payload.code, 'COMPONENT_RUN_FAILED');

    await EXECUTE_BUILD({ name: 'Badge', allowBreaking: true });
    const taken = posted(mock)
      .filter((message) => message.type === 'COMPONENT_RUN')
      .at(-1)!;
    assert.ok(taken.type === 'COMPONENT_RUN');
    assert.equal(taken.payload.report.deleted.length, 1);
  });

  it('says so when no such template is kept', async () => {
    const mock = createFigmaMock().install();
    await PLAN_BUILD({ name: 'Nowhere' });
    const [message] = posted(mock);
    assert.ok(message.type === 'ERROR');
    assert.equal(message.payload.code, 'INVALID_TEMPLATE');
  });
});
