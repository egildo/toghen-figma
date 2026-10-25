import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, useFigmaMock } from '../support/figmaMock.js';
import { CHECK_COMPONENTS, RUN_COMPONENT } from '../../main/handlers/runComponent.js';
import type { Response } from '../../shared/protocol.js';
import { byAddress, controlMock, fixture, runFile, shellMock } from './support.js';

type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const posted = (calls: ReadonlyArray<{ args: readonly unknown[] }>) => calls.map((call) => call.args[0] as Response);

/** What the command line sends: the file's text and its name, and the options. Nothing read, nothing packed. */
const send = (text: string, options = {}, fileName = 'shell.component.kdl') => RUN_COMPONENT({ text, fileName, options });

describe('RUN_COMPONENT', () => {
  useFigmaMock();

  it("reads the text it is sent and answers with the engine's report, steps summarised", async () => {
    const mock = shellMock().install();

    await send(fixture('shell'));

    const [message] = posted(mock.calls('ui.postMessage'));
    assert.equal(message.type, 'COMPONENT_RUN');
    assert.ok(message.type === 'COMPONENT_RUN');
    assert.equal(message.payload.component, 'Shell');
    assert.equal(message.payload.report.created.length, 7);
    assert.equal(message.payload.report.dryRun, false);
    assert.ok(message.payload.report.setId);
    assert.ok(!JSON.stringify(message.payload.report).includes('"fields":'), 'a step carries what it did, not its layer');
  });

  it('takes the dry run and the pending names a command line sends, and writes nothing', async () => {
    const mock = shellMock().install();
    const writes = mock.writes().length;
    const pending = { variables: [], textStyles: [] };

    await send(fixture('shell'), { dryRun: true, pending });

    const [message] = posted(mock.calls('ui.postMessage'));
    assert.ok(message.type === 'COMPONENT_RUN');
    assert.equal(message.payload.report.dryRun, true);
    assert.deepEqual(
      message.payload.report.steps.map((s) => s.kind),
      ['CREATE_SET'],
    );
    assert.equal(mock.writes().length, writes);
  });

  it('answers a run that stopped with an ERROR that carries every reason', async () => {
    // The tokens the example names are not in this file.
    const mock = shellMock().install();
    const bare = fixture('shell').replace(/\{space\.lg\}/g, '{space.nowhere}');

    await send(bare);

    const [message] = posted(mock.calls('ui.postMessage'));
    assert.ok(message.type === 'ERROR');
    assert.equal(message.payload.code, 'COMPONENT_RUN_FAILED');
    assert.equal(message.payload.commandType, 'RUN_COMPONENT');
    assert.match(message.payload.problems![0], /token \{space\.nowhere\} \(line \d+\) names no variable/);
  });

  it('refuses a breaking change the options did not allow, and takes it when they did', async () => {
    const mock = createFigmaMock().install();
    const tone = (values: string) => `component Badge\nproperties {\n    VARIANT Tone ${values}\n}\nFRAME Badge layoutMode=VERTICAL\n`;
    await send(tone('calm loud quiet'));
    const narrower = tone('calm loud');

    await send(narrower);
    const refused = posted(mock.calls('ui.postMessage'))[1];
    assert.ok(refused.type === 'ERROR');
    assert.match(refused.payload.message, /would break instances, and nothing was written/);

    await send(narrower, { allowBreaking: true });
    const taken = posted(mock.calls('ui.postMessage'))[2];
    assert.ok(taken.type === 'COMPONENT_RUN');
    assert.ok(taken.payload.report.deleted.length > 0);
  });
});

describe('RUN_COMPONENT: a file with a problem, reported by the plugin with its name and line', () => {
  useFigmaMock();

  it('reports KDL that does not parse with the file name and the line, and writes nothing', async () => {
    const mock = createFigmaMock().install();
    const writes = mock.writes().length;

    await send('component X {\n  FRAME X {\n', {}, 'ui/x.component.kdl');

    const [message] = posted(mock.calls('ui.postMessage'));
    assert.ok(message.type === 'ERROR');
    assert.equal(message.payload.code, 'COMPONENT_RUN_FAILED');
    assert.match(message.payload.message, /^ui\/x\.component\.kdl does not read: /);
    assert.match(message.payload.problems![0], /^ui\/x\.component\.kdl:\d+:\d+ not valid KDL/);
    assert.equal(mock.writes().length, writes);
  });

  it('reports every error of a file that reads but is wrong, each at its line', async () => {
    const mock = shellMock().install();
    const broken = fixture('shell').replace('paddingTop="{space.lg}"', 'paddingTop=8').replace('FRAME Body', 'FRAME Body gap=1');
    const bare = broken.split('\n').findIndex((l) => l.includes('paddingTop=8')) + 1;
    const gap = broken.split('\n').findIndex((l) => l.includes('gap=1')) + 1;

    await send(broken, {}, 'bad.component.kdl');

    const [message] = posted(mock.calls('ui.postMessage'));
    assert.ok(message.type === 'ERROR');
    const errors = message.payload.problems!.filter((p) => !/ warning: /.test(p));
    assert.equal(errors.length, 2);
    assert.match(
      errors[0],
      new RegExp(`^bad\\.component\\.kdl:${bare}:\\d+ "paddingTop" takes a token reference or a \\(literal\\) number`),
    );
    assert.match(errors[1], new RegExp(`^bad\\.component\\.kdl:${gap}:\\d+ unknown field "gap" on FRAME "Body"`));
  });

  it('says a file with no component node does not read, by its name', async () => {
    const mock = createFigmaMock().install();
    await send('FRAME Alone\n', {}, 'alone.component.kdl');
    const [message] = posted(mock.calls('ui.postMessage'));
    assert.ok(message.type === 'ERROR');
    assert.match(message.payload.message, /^alone\.component\.kdl does not read: one problem/);
    assert.match(message.payload.problems![0], /^alone\.component\.kdl .*component <Name>/);
  });

  it("lets what is not the engine's own failure reach the dispatcher", async () => {
    shellMock().install();
    const figma = (globalThis as unknown as { figma: { variables: { getLocalVariablesAsync(): Promise<never> } } }).figma;
    figma.variables.getLocalVariablesAsync = async () => {
      throw new Error('Figma said no');
    };
    await assert.rejects(send(fixture('shell')), /Figma said no/);
  });
});

describe('RUN_COMPONENT: the engine, on a file sent as text', () => {
  useFigmaMock();

  it('builds the set the first time, and reconciles it the second, with the same ids', async () => {
    const mock = shellMock().install();

    const first = await runFile(mock, fixture('shell'));
    assert.equal(first.dryRun, false);
    assert.equal(first.created.length, 7);
    const set = mock.node(first.setId!) as Node;
    assert.equal(set.name, 'Shell');
    const ids = (set.children as Node[]).map((member) => member.id);

    // A token the header's padding names changes: every member has the header, and only it is patched.
    const second = await runFile(mock, fixture('shell').replace('paddingTop="{space.lg}"', 'paddingTop="{space.md}"'));
    assert.equal(second.setId, first.setId);
    assert.deepEqual(second.created, []);
    assert.deepEqual(second.deleted, []);
    assert.equal(second.updated.length, 7);
    assert.deepEqual(
      [...new Set(second.steps.filter((step) => step.kind === 'PATCH_LAYER').map((step) => step.address))],
      ['Header region'],
    );
    assert.deepEqual(
      (set.children as Node[]).map((member) => member.id),
      ids,
    );
    assert.ok(second.steps.some((step) => step.kind === 'PATCH_LAYER' && step.member && step.address));
    assert.doesNotMatch(JSON.stringify(second), /"fields":/);
  });

  it('with a dry run plans and writes nothing', async () => {
    const mock = shellMock().install();
    const writes = mock.writes().length;

    const report = await runFile(mock, fixture('shell'), { dryRun: true });
    assert.equal(report.dryRun, true);
    assert.deepEqual(
      report.steps.map((step) => step.kind),
      ['CREATE_SET'],
    );
    assert.deepEqual(mock.writes().slice(writes), []);
  });

  it('puts Object.hasOwn back where the sandbox lacks it, as one built for ES2017 does', async () => {
    const hasOwn = Object.hasOwn;
    // @ts-expect-error: the sandbox lacks it, and a test may take it away
    delete Object.hasOwn;
    try {
      // A second evaluation of the module, as the plugin's first one would be.
      await import(new URL('../../main/components/file.js?sandbox', import.meta.url).href);
      assert.equal(typeof Object.hasOwn, 'function');
    } finally {
      Object.hasOwn = hasOwn;
    }
  });

  it('builds on the page it is told to', async () => {
    const mock = shellMock().withPage('Page 1').withPage('Library').install();
    const report = await runFile(mock, fixture('shell'), { page: 'Library' });
    assert.equal((mock.node(report.setId!) as Node).parent.name, 'Library');
  });

  it('stops with every problem, and nothing written, when a name does not resolve', async () => {
    const mock = createFigmaMock().withCollection('Demo', ['light']).install();
    const writes = mock.writes().length;

    await assert.rejects(runFile(mock, fixture('shell')), /4 things the file names could not be resolved, and nothing was written/);
    assert.deepEqual(mock.writes().slice(writes), []);
  });

  it('runs the control, with its tokens, styles, mode and component', async () => {
    const mock = controlMock().install();
    const report = await runFile(mock, fixture('control'));
    assert.equal(report.created.length, 12);
    assert.ok(byAddress((mock.node(report.setId!) as Node).children[0]).has('Leading icon'));
  });

  it('says which line of the file a name that does not resolve came from', async () => {
    const mock = createFigmaMock().withCollection('Demo', ['light']).install();
    const line =
      fixture('shell')
        .split('\n')
        .findIndex((l) => l.includes('fills "{surface.page}"')) + 1;

    await assert.rejects(runFile(mock, fixture('shell')), new RegExp(`token \\{surface\\.page\\} \\(line ${line}\\) names no variable`));
  });
});

describe('CHECK_COMPONENTS', () => {
  useFigmaMock();

  it('says every problem of every file, with its name, and writes nothing', async () => {
    const mock = shellMock().install();
    const writes = mock.writes().length;

    await CHECK_COMPONENTS({
      files: [
        { fileName: 'shell.component.kdl', text: fixture('shell') },
        { fileName: 'x.component.kdl', text: 'component X {\n  FRAME X {\n' },
      ],
    });

    const [message] = posted(mock.calls('ui.postMessage'));
    assert.ok(message.type === 'ERROR');
    assert.equal(message.payload.commandType, 'CHECK_COMPONENTS');
    assert.equal(message.payload.problems!.length, 1);
    assert.match(message.payload.problems![0], /^x\.component\.kdl:\d+:\d+ not valid KDL/);
    assert.equal(mock.writes().length, writes);
  });

  it('answers when every file reads', async () => {
    const mock = shellMock().install();
    await CHECK_COMPONENTS({ files: [{ fileName: 'shell.component.kdl', text: fixture('shell') }] });
    assert.deepEqual(posted(mock.calls('ui.postMessage')), [{ type: 'COMPONENTS_CHECKED', payload: { files: 1 } }]);
  });
});
