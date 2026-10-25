import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, useFigmaMock, type FigmaMockHandle } from '../support/figmaMock.js';
import { beginRun, findStrays } from '../../main/components/endOfRun.js';
import { run } from '../../main/components/run.js';
import { CHECK_COMPONENTS, FINISH_COMPONENTS, RUN_COMPONENT } from '../../main/handlers/runComponent.js';
import { EXECUTE_BUILD, KEEP_TEMPLATE, PLAN_BUILD } from '../../main/handlers/templates.js';
import type { Response } from '../../shared/protocol.js';
import { desiredFromText } from './support.js';

// The nodes a test reads are the mock's, through the API the engine used.
type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Payload<T extends Response['type']> = Extract<Response, { type: T }>['payload'];

const figmaOf = (): any => (globalThis as { figma?: unknown }).figma; // eslint-disable-line @typescript-eslint/no-explicit-any

const PROBE = `component Probe
properties {
    VARIANT kind quiet loud
}
FRAME Probe layoutMode=VERTICAL
`;
const FILE = { fileName: 'probe.component.kdl', text: PROBE };

const sent = (mock: FigmaMockHandle): Response[] => mock.calls('ui.postMessage').map((call) => call.args[0] as Response);
const lastOf = <T extends Response['type']>(mock: FigmaMockHandle, type: T): Payload<T> => {
  const found = sent(mock)
    .filter((message) => message.type === type)
    .at(-1);
  assert.ok(found, `no ${type} was posted`);
  return found.payload as Payload<T>;
};

/** A member that an earlier run left outside any set, on the named page. */
async function leaveStray(combination: string, page: string): Promise<Node> {
  const target = (figmaOf().root.children as Node[]).find((candidate) => candidate.name === page);
  const before = figmaOf().currentPage;
  await figmaOf().setCurrentPageAsync(target);
  const stray = figmaOf().createComponent();
  stray.setSharedPluginData('toghen', 'member', combination);
  await figmaOf().setCurrentPageAsync(before);
  return stray;
}

const line = (stray: Node, combination: string): string =>
  `"${combination}" (${stray.id}) is a member outside any set, left by an earlier run; it is removed with --allow-breaking.`;
const onPages = (): Node[] => (figmaOf().root.children as Node[]).flatMap((page) => page.children as Node[]);

describe('strays: a member outside any set', () => {
  useFigmaMock();

  it('is found on every page, and a member in its set is not one', async () => {
    const mock = createFigmaMock().withPage('Page 1').withPage('Other').install();
    const first = await run(desiredFromText(PROBE));
    assert.deepEqual(await findStrays(), []);
    const stray = await leaveStray('kind=loud', 'Other');

    assert.deepEqual(
      (await findStrays()).map((found) => found.id),
      [stray.id],
    );
    assert.ok(mock.node(first.setId!));
  });

  it('is a member dragged out of its set by a designer', async () => {
    const mock = createFigmaMock().install();
    const first = await run(desiredFromText(PROBE));
    const set = mock.node(first.setId!) as Node;
    const dragged = set.children[1] as Node;
    figmaOf().currentPage.appendChild(dragged);

    assert.deepEqual(
      (await findStrays()).map((found) => found.name),
      ['kind=loud'],
    );
  });

  it('is also a member whose set is not stamped as a component', async () => {
    const mock = createFigmaMock().install();
    const first = await run(desiredFromText(PROBE));
    (mock.node(first.setId!) as Node).setSharedPluginData('toghen', 'stamp', '');

    assert.deepEqual((await findStrays()).map((found) => found.name).sort(), ['kind=loud', 'kind=quiet']);
  });

  it('stops a real check before anything is written, and lists each stray in the spec’s words', async () => {
    const mock = createFigmaMock().withPage('Page 1').withPage('Other').install();
    const stray = await leaveStray('interaction=disabled', 'Other');
    const writes = mock.writes().length;

    await CHECK_COMPONENTS({ files: [FILE], dryRun: false });

    const error = lastOf(mock, 'ERROR');
    assert.equal(error.code, 'COMPONENT_RUN_FAILED');
    assert.deepEqual(error.problems, [line(stray, 'interaction=disabled')]);
    assert.equal(mock.writes().length, writes, 'nothing was written');
    assert.ok(onPages().includes(stray), 'and the stray is still there');
  });

  it('lists them in a dry run and removes none', async () => {
    const mock = createFigmaMock().withPage('Page 1').withPage('Other').install();
    const stray = await leaveStray('kind=loud', 'Other');

    await CHECK_COMPONENTS({ files: [FILE], dryRun: true });
    assert.deepEqual(lastOf(mock, 'COMPONENTS_CHECKED'), { files: 1, strays: [line(stray, 'kind=loud')] });
    await RUN_COMPONENT({ ...FILE, options: { dryRun: true } });
    await FINISH_COMPONENTS({ dryRun: true });

    assert.deepEqual(lastOf(mock, 'COMPONENTS_FINISHED').removed, []);
    assert.ok(onPages().includes(stray));
  });

  it('lets a real run through with the flag, and removes them at the end of the run, reporting each', async () => {
    const mock = createFigmaMock().withPage('Page 1').withPage('Other').install();
    const stray = await leaveStray('kind=loud', 'Other');

    await CHECK_COMPONENTS({ files: [FILE], dryRun: false, allowBreaking: true });
    assert.deepEqual(lastOf(mock, 'COMPONENTS_CHECKED').strays, [line(stray, 'kind=loud')]);
    await RUN_COMPONENT({ ...FILE, options: { allowBreaking: true } });
    assert.ok(onPages().includes(stray), 'the sweep waits for the end of the run');
    await FINISH_COMPONENTS({ allowBreaking: true });

    assert.deepEqual(lastOf(mock, 'COMPONENTS_FINISHED').removed, [`removed "kind=loud" (${stray.id})`]);
    assert.ok(!onPages().includes(stray));
    assert.deepEqual(await findStrays(), []);
  });

  it('is never removed by an end of run that was not told it may', async () => {
    const mock = createFigmaMock().withPage('Page 1').withPage('Other').install();
    const stray = await leaveStray('kind=loud', 'Other');
    beginRun();
    await RUN_COMPONENT({ ...FILE, options: {} });
    await FINISH_COMPONENTS({});
    assert.deepEqual(lastOf(mock, 'COMPONENTS_FINISHED').removed, []);
    assert.ok(onPages().includes(stray));
  });

  it('says nothing when there are none', async () => {
    const mock = createFigmaMock().install();
    await CHECK_COMPONENTS({ files: [FILE], dryRun: false });
    assert.deepEqual(lastOf(mock, 'COMPONENTS_CHECKED'), { files: 1 });
  });
});

describe('strays: a template run from the screen', () => {
  useFigmaMock();

  const kept = async (mock: FigmaMockHandle) => {
    await KEEP_TEMPLATE({ fileName: FILE.fileName, text: PROBE });
    assert.equal(lastOf(mock, 'TEMPLATES').templates.length, 1);
  };

  it('lists the stray as a breaking step of the plan', async () => {
    const mock = createFigmaMock().withPage('Page 1').withPage('Other').install();
    await kept(mock);
    const stray = await leaveStray('kind=loud', 'Other');

    await PLAN_BUILD({ name: 'Probe' });

    const { report } = lastOf(mock, 'COMPONENT_RUN');
    assert.deepEqual(report.breaking, [line(stray, 'kind=loud')]);
    const step = report.steps.find((candidate) => candidate.kind === 'REMOVE_STRAY');
    assert.deepEqual(step, { kind: 'REMOVE_STRAY', member: 'kind=loud', breaks: line(stray, 'kind=loud') });
    assert.ok(onPages().includes(stray));
  });

  it('stops before its first write unless the breaking steps were allowed', async () => {
    const mock = createFigmaMock().withPage('Page 1').withPage('Other').install();
    await kept(mock);
    const stray = await leaveStray('kind=loud', 'Other');
    const made = mock.calls('createComponent').length;

    await EXECUTE_BUILD({ name: 'Probe' });

    const error = lastOf(mock, 'ERROR');
    assert.deepEqual(error.problems, [line(stray, 'kind=loud')]);
    assert.equal(mock.calls('createComponent').length, made, 'no member was made');
    assert.ok(onPages().includes(stray));

    await EXECUTE_BUILD({ name: 'Probe', allowBreaking: true });
    assert.ok(!onPages().includes(stray));
    assert.equal(lastOf(mock, 'COMPONENT_RUN').report.created.length, 2);
  });
});
