/**
 * A copy carries the stamp: layers, members and sets.
 *
 * Duplicating a node in Figma takes its shared plugin data along, so a person's copy holds the stamp of the node it was
 * made from, id and all (the mock's `clone()` does the same). The id tells them apart: a copy is left alone, listed as
 * one, and never deleted; the original is still reconciled. A cut and paste gives a node a new id and leaves only the
 * node whose id does not match: it is the original moved, adopted, and stamped again with its own. A stamp written
 * before the id was recorded is read as its node's own.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, useFigmaMock, type FigmaMockHandle } from '../support/figmaMock.js';
import { run } from '../../main/components/run.js';
import { beginRun, findStrays, finishRun, noteTouched, pageOf } from '../../main/components/endOfRun.js';
import { byAddress, desiredFromText, stampOf } from './support.js';

// The nodes a test reads are the mock's, through the API the engine used.
type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const card = (footer = 'FRAME Footer layoutMode=HORIZONTAL'): string => `component Card
properties {
    VARIANT Tone calm loud
}
FRAME Card layoutMode=VERTICAL {
    FRAME Body layoutMode=VERTICAL itemSpacing=(literal)8 {
        FRAME Badge layoutMode=VERTICAL
    }
    ${footer}
}
`;
const VERTICAL = 'FRAME Footer layoutMode=VERTICAL';

const cardMock = () => createFigmaMock().withFonts([{ family: 'Inter', style: 'Regular' }]);
const build = async (mock: FigmaMockHandle, text = card()): Promise<Node> => mock.node((await run(desiredFromText(text))).setId!) as Node;
const member = (set: Node, tone: string): Node => (set.children as Node[]).find((child) => child.name === `Tone=${tone}`);
const naming = <T extends object>(steps: T[], id: string): T[] => steps.filter((step) => Object.values(step).includes(id));
const rawStamp = (node: Node): string => node.getSharedPluginData('toghen', 'stamp');
/** Rewrites the id a node's stamp records: another node's, as on a pasted node, or none, as before the id was recorded. */
function stampIdOf(node: Node, id: string | undefined): void {
  const { id: _held, ...rest } = JSON.parse(rawStamp(node));
  node.setSharedPluginData('toghen', 'stamp', JSON.stringify(id === undefined ? rest : { ...rest, id }));
}
/** A cut and paste: the node is copied where it was, and the original removed. The copy has a new id. */
function cutAndPaste(node: Node): Node {
  const parent = node.parent;
  const at = parent.children.indexOf(node);
  const pasted = node.clone();
  parent.insertChild(at, pasted);
  node.remove();
  return pasted;
}

describe('a copy of a layer Toghen made', () => {
  useFigmaMock();

  it('is left alone and listed, and the original is still patched', async () => {
    const mock = cardMock().install();
    const set = await build(mock);
    const calm = member(set, 'calm');
    const footer = byAddress(calm).get('Footer');
    const copy = footer.clone();
    byAddress(calm).get('Body').appendChild(copy);
    const held = rawStamp(copy);

    const planned = await run(desiredFromText(card(VERTICAL)), { dryRun: true });
    assert.deepEqual(naming(planned.steps, copy.id), [], 'no step names the copy');
    assert.ok(
      planned.steps.some((step) => step.kind === 'PATCH_LAYER' && step.nodeId === footer.id),
      'the original is patched',
    );
    assert.ok(
      planned.notes.includes(`member "Tone=calm": "Footer" (${copy.id}) is a copy of Toghen's layer "Footer", left alone`),
      planned.notes.join('\n'),
    );

    await run(desiredFromText(card(VERTICAL)));
    assert.equal(footer.layoutMode, 'VERTICAL');
    assert.equal(copy.layoutMode, 'HORIZONTAL', 'the copy keeps what it had');
    assert.equal(copy.parent.id, byAddress(calm).get('Body').id, 'and where the person put it');
    assert.equal(rawStamp(copy), held);
  });

  it('is not deleted where no layer of its address is declared, in another member, or once the file drops the original', async () => {
    const mock = cardMock().install();
    const set = await build(mock);
    const calmFooter = byAddress(member(set, 'calm')).get('Footer');
    const copy = calmFooter.clone();
    byAddress(member(set, 'loud')).get('Body').appendChild(copy);

    const kept = await run(desiredFromText(card()));
    assert.ok(mock.node(copy.id), 'pasted in another member: still there');
    assert.ok(
      kept.notes.includes(`member "Tone=loud": "Footer" (${copy.id}) is a copy of Toghen's layer "Footer", left alone`),
      kept.notes.join('\n'),
    );

    // The file drops the footer: the originals go, the copy stays.
    const dropped = await run(desiredFromText(card('')), { allowBreaking: true });
    assert.equal(mock.node(calmFooter.id), undefined, 'the original is deleted');
    assert.ok(mock.node(copy.id), 'the copy is not');
    assert.deepEqual(naming(dropped.steps, copy.id), []);
  });

  it('cut and pasted, is the original moved: adopted, and stamped again with its own id, a write in the dry run', async () => {
    const mock = cardMock().install();
    const set = await build(mock);
    const calm = member(set, 'calm');
    const pasted = cutAndPaste(byAddress(calm).get('Footer'));

    const planned = await run(desiredFromText(card()), { dryRun: true });
    assert.deepEqual(
      naming(planned.steps, pasted.id).map((step) => step.kind),
      ['PATCH_LAYER'],
      'nothing else to write, so the stamp is',
    );
    assert.ok(!planned.steps.some((step) => step.kind === 'CREATE_LAYER'), 'adopted, not made again');

    await run(desiredFromText(card()));
    assert.equal(stampOf(pasted)?.is.address, 'Footer');
    assert.equal((stampOf(pasted) as { id?: string }).id, pasted.id);
    const again = await run(desiredFromText(card()), { dryRun: true });
    assert.deepEqual(naming(again.steps, pasted.id), [], 'once stamped, it is its own');
  });

  it('reads a stamp written before the id as its own, and gives it the id on the next write', async () => {
    const mock = cardMock().install();
    const set = await build(mock);
    const footer = byAddress(member(set, 'calm')).get('Footer');
    stampIdOf(footer, undefined);

    const planned = await run(desiredFromText(card()), { dryRun: true });
    assert.deepEqual(naming(planned.steps, footer.id), [], 'its own, unchanged: nothing to write');
    assert.equal(
      planned.notes.some((note) => /copy/.test(note)),
      false,
    );

    await run(desiredFromText(card(VERTICAL)));
    assert.equal((stampOf(footer) as { id?: string }).id, footer.id);
  });
});

describe('a copy of a set Toghen made', () => {
  useFigmaMock();

  it('is left alone and listed, and the original is still reconciled: two sets with one stamp no longer stop the run', async () => {
    const mock = cardMock().install();
    const set = await build(mock);
    const copy = set.clone();
    copy.x = 2000;
    const copyFooter = byAddress(member(copy, 'calm')).get('Footer');

    beginRun();
    const report = await run(desiredFromText(card(VERTICAL)));
    await finishRun({});
    assert.equal(report.setId, set.id);
    assert.ok(report.notes.includes(`"Card" (${copy.id}) is a copy of Toghen's set "Card", left alone`), report.notes.join('\n'));
    assert.equal(byAddress(member(set, 'calm')).get('Footer').layoutMode, 'VERTICAL');
    assert.equal(copyFooter.layoutMode, 'HORIZONTAL', 'nothing in the copy is patched');
    assert.deepEqual([copy.x, copy.y], [2000, 0], 'nor moved at the end of the run');
  });

  it('cut and pasted, is the original moved: adopted with its members and layers, and stamped again', async () => {
    const mock = cardMock().install();
    const set = await build(mock);
    const pasted = set.clone();
    set.remove();

    const planned = await run(desiredFromText(card()), { dryRun: true });
    assert.ok(!planned.steps.some((step) => step.kind === 'CREATE_SET'), 'adopted, not built again');
    assert.ok(
      planned.steps.some((step) => step.kind === 'PATCH_LAYER'),
      'a write, in the dry run',
    );

    const report = await run(desiredFromText(card()));
    assert.equal(report.setId, pasted.id);
    for (const node of [pasted, ...(pasted.children as Node[]), byAddress(member(pasted, 'calm')).get('Footer')]) {
      assert.equal((stampOf(node) as { id?: string }).id, node.id, `${node.name} records its own id`);
    }
  });

  it('a copy of a member, in its set, is listed and not deleted or laid out', async () => {
    const mock = cardMock().install();
    const set = await build(mock);
    const copy = member(set, 'calm').clone();
    copy.name = 'Tone=calm copy';
    set.appendChild(copy);
    copy.x = 999;

    const report = await run(desiredFromText(card()));
    assert.ok(
      report.notes.includes(`"Tone=calm copy" (${copy.id}) in the set is a copy of Toghen's member "Tone=calm", left alone`),
      report.notes.join('\n'),
    );
    assert.ok(mock.node(copy.id));
    assert.equal(copy.x, 999);
  });

  it('a copy of a member outside any set is not a stray: never removed, and said', async () => {
    const mock = cardMock().install();
    const set = await build(mock);
    const copy = member(set, 'calm').clone();

    beginRun();
    assert.deepEqual(await findStrays(), []);
    noteTouched(pageOf(set));
    const finished = await finishRun({ allowBreaking: true });
    assert.ok(mock.node(copy.id), 'not removed');
    assert.deepEqual(finished.removed, []);
    assert.ok(
      finished.notes.includes(`"Tone=calm" (${copy.id}) is a copy of Toghen's member "Tone=calm", outside any set, left alone`),
      finished.notes.join('\n'),
    );
  });

  it('reads a set stamp written before the id as its own, and gives it the id', async () => {
    const mock = cardMock().install();
    const set = await build(mock);
    stampIdOf(set, undefined);

    const report = await run(desiredFromText(card()));
    assert.equal(report.setId, set.id);
    assert.equal((stampOf(set) as { id?: string }).id, set.id);
  });
});

describe('a copy whose original Toghen removes', () => {
  useFigmaMock();

  /** The node and everything in it. */
  const tree = (node: Node): Node[] => [node, ...((node.children ?? []) as Node[]).flatMap(tree)];
  const TONE_LOUD = card().replace('VARIANT Tone calm loud', 'VARIANT Tone loud');

  it('a layer the file dropped: its copy in another member keeps no stamp, and the next run neither adopts nor deletes it', async () => {
    const mock = cardMock().install();
    const set = await build(mock);
    const calmFooter = byAddress(member(set, 'calm')).get('Footer');
    const copy = calmFooter.clone();
    copy.name = 'Footer copy';
    byAddress(member(set, 'loud')).get('Body').appendChild(copy);

    const dropped = await run(desiredFromText(card('')));
    const deletion = dropped.steps.find((step) => step.kind === 'DELETE_LAYER' && step.nodeId === calmFooter.id);
    assert.deepEqual(deletion?.kind === 'DELETE_LAYER' ? [deletion.strip, deletion.message] : [], [
      [copy.id],
      `removes "Footer"; its copy "Footer copy" (${copy.id}) keeps no stamp`,
    ]);
    assert.equal(rawStamp(copy), '', 'the stamp is stripped');
    assert.equal(copy.name, 'Footer copy', 'and nothing else of the copy changes');

    const next = await run(desiredFromText(card('')));
    assert.ok(mock.node(copy.id), 'not deleted');
    assert.deepEqual(naming(next.steps, copy.id), [], 'not adopted: no step names it');
    assert.ok(next.notes.includes(`member "Tone=loud": "Footer copy" (${copy.id}) has no stamp and was left alone`), next.notes.join('\n'));
  });

  it('a member gone: its copy outside the set, and everything in it, keeps no stamp, and is never removed as a stray', async () => {
    const mock = cardMock().install();
    const set = await build(mock);
    const copy = member(set, 'calm').clone();

    const report = await run(desiredFromText(TONE_LOUD), { allowBreaking: true });
    assert.ok(
      report.breaking.includes(
        `the member "Tone=calm" is gone: instances of it lose their variant; its copy "Tone=calm" (${copy.id}) keeps no stamp`,
      ),
      report.breaking.join('\n'),
    );
    assert.deepEqual(
      tree(copy).map(rawStamp),
      tree(copy).map(() => ''),
      'the copy and its layers',
    );

    beginRun();
    assert.deepEqual(await findStrays(), []);
    noteTouched(pageOf(set));
    const finished = await finishRun({ allowBreaking: true });
    assert.deepEqual(finished.removed, []);
    assert.ok(mock.node(copy.id));
  });

  it('in a copied set, the copy of the member Toghen removes keeps no stamp, nor does anything in it; the rest of the copy keeps its', async () => {
    const mock = cardMock().install();
    const set = await build(mock);
    const copied = set.clone();
    const [calm, loud] = [member(copied, 'calm'), member(copied, 'loud')];

    const report = await run(desiredFromText(TONE_LOUD), { allowBreaking: true });
    assert.ok(
      report.breaking.some((line) => line.endsWith(`; its copy "Tone=calm" (${calm.id}) keeps no stamp`)),
      report.breaking.join('\n'),
    );
    assert.deepEqual(
      tree(calm).map(rawStamp),
      tree(calm).map(() => ''),
    );
    assert.ok(
      tree(loud).every((node) => rawStamp(node) !== ''),
      'the copy of a member still there keeps its stamp',
    );
    assert.notEqual(rawStamp(copied), '', 'and so does the copied set');
  });

  it("a dry run lists the strip on the deletion's row and changes nothing", async () => {
    const mock = cardMock().install();
    const set = await build(mock);
    const copy = byAddress(member(set, 'calm')).get('Footer').clone();
    byAddress(member(set, 'loud')).get('Body').appendChild(copy);
    const held = rawStamp(copy);

    const planned = await run(desiredFromText(card('')), { dryRun: true });
    assert.deepEqual(
      planned.steps
        .filter((step) => step.kind === 'DELETE_LAYER' && step.message)
        .map((step) => step.kind === 'DELETE_LAYER' && step.message),
      [`removes "Footer"; its copy "Footer" (${copy.id}) keeps no stamp`],
      'one row',
    );
    assert.equal(rawStamp(copy), held);
    assert.ok(mock.node(byAddress(member(set, 'calm')).get('Footer').id), 'nothing removed');
  });

  it('a deletion that is not taken strips nothing, though its row says what it would', async () => {
    const mock = cardMock().install();
    const set = await build(mock);
    const copy = member(set, 'calm').clone();
    const held = tree(copy).map(rawStamp);

    await assert.rejects(run(desiredFromText(TONE_LOUD)), (error: { problems: string[] }) =>
      error.problems.some((line) => line.endsWith(`its copy "Tone=calm" (${copy.id}) keeps no stamp`)),
    );
    assert.deepEqual(tree(copy).map(rawStamp), held);
  });

  it("a stray removed: its copy keeps no stamp, and is not the next run's stray", async () => {
    const mock = cardMock().install();
    const set = await build(mock);
    const stray = member(set, 'calm');
    figma.currentPage.appendChild(stray);
    const copy = stray.clone();

    beginRun();
    const [found] = await findStrays();
    assert.equal(found.id, stray.id);
    noteTouched(pageOf(set));
    const finished = await finishRun({ allowBreaking: true });
    assert.deepEqual(finished.removed, [`removed "Tone=calm" (${stray.id}); its copy "Tone=calm" (${copy.id}) keeps no stamp`]);
    assert.deepEqual(
      tree(copy).map(rawStamp),
      tree(copy).map(() => ''),
    );
    assert.deepEqual(await findStrays(), []);
    assert.ok(mock.node(copy.id));
  });
});
