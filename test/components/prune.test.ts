/**
 * `--prune`: the files are the whole system, so a set or an artboard Toghen made that none of them declares has no source.
 * It is breaking, as a stray is: listed by a dry run, stopping a real run, and removed at the end of one allowed to break.
 * A person's copy of it stays and loses its stamp; a page it leaves empty stays (specs, *Removing what has no source*).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, useFigmaMock, type FigmaMockHandle } from '../support/figmaMock.js';
import { run } from '../../main/components/run.js';
import { CHECK_COMPONENTS, FINISH_COMPONENTS, RUN_COMPONENT } from '../../main/handlers/runComponent.js';
import type { Response } from '../../shared/protocol.js';
import { desiredFromText, runFile } from './support.js';

type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type Payload<T extends Response['type']> = Extract<Response, { type: T }>['payload'];

const figmaOf = (): any => (globalThis as { figma?: unknown }).figma; // eslint-disable-line @typescript-eslint/no-explicit-any

const component = (name: string): string => `component ${name}
properties {
    VARIANT kind quiet loud
}
FRAME ${name} layoutMode=VERTICAL
`;
const KEPT = { fileName: 'kept.component.kdl', text: component('Kept') };
const GONE = component('Gone');
const BOARD = `artboard Board
FRAME Board layoutMode=VERTICAL {
    FRAME Inner layoutMode=VERTICAL
}
`;

const sent = (mock: FigmaMockHandle): Response[] => mock.calls('ui.postMessage').map((call) => call.args[0] as Response);
const lastOf = <T extends Response['type']>(mock: FigmaMockHandle, type: T): Payload<T> => {
  const found = sent(mock)
    .filter((message) => message.type === type)
    .at(-1);
  assert.ok(found, `no ${type} was posted`);
  return found.payload as Payload<T>;
};
const page = (name: string): Node => (figmaOf().root.children as Node[]).find((candidate) => candidate.name === name);
const line = (kind: string, name: string, id: string, on: string): string =>
  `the ${kind} "${name}" (${id}) on page "${on}" has no source: no file in the run declares ${kind === 'set' ? 'component' : 'artboard'} "${name}"; it is removed with --allow-breaking.`;

/** Kept on Page 1, Gone alone on its own page: the file a run with only Kept's file finds Gone in. */
async function built(): Promise<{ mock: FigmaMockHandle; kept: string; gone: string }> {
  const mock = createFigmaMock().withPage('Page 1').withPage('Old').install();
  const kept = (await run(desiredFromText(KEPT.text))).setId!;
  const gone = (await run(desiredFromText(GONE), { page: 'Old' })).setId!;
  return { mock, kept, gone };
}

describe('--prune: what no file declares', () => {
  useFigmaMock();

  it('is listed only when the files are said to be the whole system', async () => {
    const { mock, gone } = await built();
    await CHECK_COMPONENTS({ files: [KEPT], dryRun: true });
    assert.equal(lastOf(mock, 'COMPONENTS_CHECKED').orphans, undefined);
    await CHECK_COMPONENTS({ files: [KEPT], dryRun: true, prune: true });
    assert.deepEqual(lastOf(mock, 'COMPONENTS_CHECKED').orphans, [line('set', 'Gone', gone, 'Old')]);
  });

  it('is listed by a dry run and removed by none', async () => {
    const { mock, gone } = await built();
    await CHECK_COMPONENTS({ files: [KEPT], dryRun: true, prune: true });
    await RUN_COMPONENT({ ...KEPT, options: { dryRun: true } });
    await FINISH_COMPONENTS({ dryRun: true });
    assert.deepEqual(lastOf(mock, 'COMPONENTS_FINISHED').removed, []);
    assert.ok(mock.node(gone));
  });

  it('stops a real run without --allow-breaking before anything is written', async () => {
    const { mock, gone } = await built();
    const writes = mock.writes().length;
    await CHECK_COMPONENTS({ files: [KEPT], dryRun: false, prune: true });
    const error = lastOf(mock, 'ERROR');
    assert.deepEqual(error.problems, [line('set', 'Gone', gone, 'Old')]);
    assert.equal(mock.writes().length, writes, 'nothing was written');
  });

  it('is removed at the end of a run allowed to break; its copy stays without a stamp, and its emptied page stays', async () => {
    const { mock, kept, gone } = await built();
    const copy = (mock.node(gone) as Node).clone();
    page('Page 1').appendChild(copy);
    await CHECK_COMPONENTS({ files: [KEPT], dryRun: false, allowBreaking: true, prune: true });
    const listed = lastOf(mock, 'COMPONENTS_CHECKED').orphans ?? [];
    assert.equal(listed.length, 1);
    assert.match(listed[0], /keeps no stamp\.$/);
    await RUN_COMPONENT({ ...KEPT, options: { allowBreaking: true } });
    assert.ok(mock.node(gone), 'the removal waits for the end of the run');
    await FINISH_COMPONENTS({ allowBreaking: true });

    const finished = lastOf(mock, 'COMPONENTS_FINISHED');
    assert.equal(finished.removed.length, 1);
    assert.match(finished.removed[0], new RegExp(`^removed the set "Gone" \\(${gone}\\) from page "Old"; its copy`));
    assert.ok(finished.notes.includes('page "Old" holds nothing now; it is left as it is'));
    assert.ok(!mock.node(gone));
    assert.ok(page('Old'), 'the page stays');
    assert.ok(mock.node(kept), 'what the files declare stays');
    assert.equal(copy.getSharedPluginData('toghen', 'stamp'), '');
  });

  it('takes an artboard no file declares, and leaves one a file declares', async () => {
    const mock = createFigmaMock().withPage('Page 1').install();
    const board = (await runFile(mock, BOARD, {}, 'board.artboard.kdl')).setId!;
    await CHECK_COMPONENTS({ files: [KEPT], dryRun: true, prune: true });
    assert.deepEqual(lastOf(mock, 'COMPONENTS_CHECKED').orphans, [line('artboard', 'Board', board, 'Page 1')]);
    await CHECK_COMPONENTS({ files: [KEPT, { fileName: 'board.artboard.kdl', text: BOARD }], dryRun: true, prune: true });
    assert.equal(lastOf(mock, 'COMPONENTS_CHECKED').orphans, undefined);
  });
});
