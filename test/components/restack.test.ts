import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, useFigmaMock, type FigmaMockHandle } from '../support/figmaMock.js';
import { beginRun, finishRun } from '../../main/components/endOfRun.js';
import { run } from '../../main/components/run.js';
import { describeStack, restack, type TopLevel } from '../../shared/components/stack.js';
import { desiredFromText, stampOf } from './support.js';

// The nodes a test reads are the mock's, through the API the engine used.
type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const figmaOf = (): any => (globalThis as { figma?: unknown }).figma; // eslint-disable-line @typescript-eslint/no-explicit-any

/** A top-level node: 100 wide, `height` tall, at (x, y). */
const node = (id: string, y: number, height: number, rest: Partial<TopLevel> = {}): TopLevel => ({
  id,
  name: id,
  x: 0,
  y,
  width: 100,
  height,
  toghen: true,
  ...rest,
});
const placedAt = (n: TopLevel): TopLevel => ({ ...n, placed: { x: n.x, y: n.y } });
const positions = (plan: ReturnType<typeof restack>) => Object.fromEntries(plan.stamps.map((stamp) => [stamp.id, [stamp.x, stamp.y]]));

describe('restack: which sets are Toghen’s, and where the stack goes', () => {
  it('pushes the sets below down when a set grew', () => {
    // A was 60 tall and B sat 100 under it; A is now 200 tall.
    const plan = restack([placedAt(node('A', 0, 200)), placedAt(node('B', 160, 60)), placedAt(node('C', 320, 30))]);
    assert.deepEqual(positions(plan), { A: [0, 0], B: [0, 300], C: [0, 460] });
    assert.deepEqual(
      plan.moves.map((move) => move.id),
      ['B', 'C'],
      'A did not move',
    );
  });

  it('stacks them in their current order, top to bottom and then left to right, on the leftmost left edge', () => {
    const plan = restack([
      placedAt(node('B', 500, 50, { x: 40 })),
      placedAt(node('A', 100, 50, { x: 10 })),
      placedAt(node('C', 500, 50, { x: 30 })),
    ]);
    assert.deepEqual(positions(plan), { A: [10, 100], C: [10, 250], B: [10, 400] });
  });

  it('does not move a set that was moved by hand, and flows the stack around it', () => {
    // H was dragged to where B’s place is: B goes below it instead.
    const plan = restack([
      placedAt(node('A', 0, 200)),
      placedAt(node('B', 300, 60)),
      { ...placedAt(node('H', 350, 100)), x: 0, placed: { x: 900, y: 0 } },
    ]);
    assert.deepEqual(positions(plan), { A: [0, 0], B: [0, 550] });
    assert.deepEqual(plan.moves, [{ id: 'B', name: 'B', x: 0, y: 550 }]);
    assert.deepEqual(plan.notes, [], 'H overlaps nothing now');
  });

  it('counts a position within half a pixel of the stamp as still Toghen’s', () => {
    const plan = restack([placedAt(node('A', 0, 200)), { ...placedAt(node('B', 300, 60)), y: 300.4 }]);
    assert.deepEqual(positions(plan), { A: [0, 0], B: [0, 300] });
    const hand = restack([placedAt(node('A', 0, 200)), { ...placedAt(node('B', 300, 60)), y: 300.6 }]);
    assert.deepEqual(positions(hand), { A: [0, 0] }, 'a bit more is a move by hand');
  });

  it('goes below a node that is not Toghen’s when it would overlap it, again until it overlaps nothing', () => {
    const dot = node('Dot', 150, 100, { toghen: false });
    const wide = node('Wide', 300, 50, { toghen: false });
    const plan = restack([placedAt(node('A', 0, 100)), placedAt(node('B', 160, 60)), dot, wide]);
    // B would sit at 200, overlapping Dot (150-250): below Dot at 350, overlapping Wide (300-350)? no: 350 is its edge; clear.
    assert.deepEqual(positions(plan), { A: [0, 0], B: [0, 350] });
  });

  it('notes a set moved by hand that overlaps something, and leaves it where it is', () => {
    const plan = restack([
      placedAt(node('A', 0, 100)),
      { ...placedAt(node('Button', 500, 400)), placed: { x: 0, y: 0 } },
      node('Dot', 600, 50, { toghen: false }),
    ]);
    assert.deepEqual(plan.notes, ['"Button" was moved by hand and overlaps "Dot"; it was left where it is.']);
    assert.ok(!plan.stamps.some((stamp) => stamp.id === 'Button'), 'and its stamp is not rewritten');
    assert.ok(!plan.moves.some((move) => move.id === 'Button'));
  });

  it('joins a set with no stamp to the stack when it overlaps another of Toghen’s', () => {
    const plan = restack([placedAt(node('A', 0, 200)), node('Old', 100, 60)]);
    assert.deepEqual(positions(plan), { A: [0, 0], Old: [0, 300] });
  });

  it('stamps a set with no stamp where it is when it overlaps nothing, and leaves it there', () => {
    const plan = restack([placedAt(node('A', 0, 100)), node('Old', 500, 60, { x: 30 })]);
    assert.deepEqual(positions(plan), { A: [0, 0], Old: [30, 500] });
    assert.deepEqual(plan.moves, []);
  });

  it('lets two sets from before positions were recorded, overlapping each other, both join', () => {
    const plan = restack([node('X', 0, 100), node('Y', 50, 100)]);
    assert.deepEqual(positions(plan), { X: [0, 0], Y: [0, 200] });
  });

  it('puts a set made by the run at the end of the stack, in the order they were made', () => {
    const plan = restack([
      placedAt(node('A', 0, 100)),
      node('N2', 0, 40, { created: 1 }),
      node('N1', 0, 40, { created: 0 }),
      placedAt(node('B', 200, 60)),
    ]);
    assert.deepEqual(positions(plan), { A: [0, 0], B: [0, 200], N1: [0, 360], N2: [0, 500] });
  });

  it('puts the first set made on an empty page at the origin, and the next under it', () => {
    const plan = restack([node('N1', 0, 60, { created: 0 }), node('N2', 0, 90, { created: 1 })]);
    assert.deepEqual(positions(plan), { N1: [0, 0], N2: [0, 160] });
  });

  it('starts a set made on a page of other things at their top left, and below what it would overlap', () => {
    const far = node('Far', 50, 200, { x: -30, toghen: false, width: 40 });
    const wide = node('Wide', 0, 10, { x: 10, toghen: false, width: 500 });
    const plan = restack([far, wide, node('N', 0, 60, { created: 0, width: 80 })]);
    assert.deepEqual(positions(plan), { N: [-30, 350] });
  });

  it('takes the place of a set made by the run for a placeholder: it does not make an old set overlap, and the old set stays', () => {
    const plan = restack([node('Old', 0, 100, { x: 10 }), node('N', 0, 100, { created: 0 })]);
    assert.deepEqual(positions(plan), { Old: [10, 0], N: [10, 200] });
    assert.deepEqual(
      plan.moves.map((move) => move.id),
      ['N'],
    );
  });
});

describe('restack: what a dry run says', () => {
  it('names the sets a run would restack and those moved by hand, without positions', () => {
    const lines = describeStack('Components', [
      placedAt(node('A', 0, 100)),
      placedAt(node('B', 200, 60)),
      { ...placedAt(node('H', 500, 60)), placed: { x: 7, y: 7 } },
      node('Dot', 900, 10, { toghen: false }),
    ]);
    assert.deepEqual(lines, [
      'page "Components": a run would restack "A", "B"',
      'page "Components": "H" was moved by hand and would be left where it is',
    ]);
  });

  it('says nothing of a page with no set on it', () => {
    assert.deepEqual(describeStack('Empty', [node('Dot', 0, 10, { toghen: false })]), []);
  });
});

describe('the end of a run, on a page', () => {
  useFigmaMock();

  const sized = (name: string, height: number): string => `component ${name}
FRAME ${name} layoutMode=NONE width=(literal)80 height=(literal)${height}
`;
  const at = (n: Node) => [n.x, n.y];
  const build = async (mock: FigmaMockHandle, name: string, height: number): Promise<Node> =>
    mock.node((await run(desiredFromText(sized(name, height)))).setId!) as Node;

  it('puts the first set on an empty page at the origin, and the sets of several runs in turn, each under the one before', async () => {
    const mock = createFigmaMock().install();
    const sets: Node[] = [];
    for (const [name, height] of [
      ['A', 60],
      ['B', 90],
      ['C', 30],
    ] as const) {
      beginRun();
      sets.push(await build(mock, name, height));
      const finished = await finishRun({});
      assert.equal(finished.notes.length, 0);
    }
    assert.deepEqual(sets.map(at), [
      [0, 0],
      [0, 160],
      [0, 350],
    ]);
  });

  it('says where each set made went', async () => {
    const mock = createFigmaMock().install();
    beginRun();
    await build(mock, 'A', 60);
    await build(mock, 'B', 90);
    const finished = await finishRun({});
    assert.deepEqual(finished.moved, ['moved "B" to 0, 160'], 'A was made at the origin and did not move');
  });

  it('puts a set under everything at the top level: its left edge on the leftmost, 100 px under the lowest', async () => {
    const mock = createFigmaMock().install();
    const far = figmaOf().createFrame();
    far.x = -30;
    far.y = 50;
    far.resize(40, 200);
    const wide = figmaOf().createFrame();
    wide.x = 10;
    wide.y = 0;
    wide.resize(500, 10);

    beginRun();
    const set = await build(mock, 'Second', 60);
    await finishRun({});

    assert.deepEqual(at(set), [-30, 350], 'under 50 + 200, on the leftmost left edge');
    assert.deepEqual(
      [at(far), at(wide)],
      [
        [-30, 50],
        [10, 0],
      ],
      'nothing else moved',
    );
  });

  it('pushes the sets below down when a set grew', async () => {
    const mock = createFigmaMock().install();
    beginRun();
    const a = await build(mock, 'A', 60);
    const b = await build(mock, 'B', 60);
    const c = await build(mock, 'C', 60);
    await finishRun({});
    assert.deepEqual([a, b, c].map(at), [
      [0, 0],
      [0, 160],
      [0, 320],
    ]);

    beginRun();
    await build(mock, 'A', 200);
    const finished = await finishRun({});

    assert.deepEqual([a, b, c].map(at), [
      [0, 0],
      [0, 300],
      [0, 460],
    ]);
    assert.deepEqual(finished.moved, ['moved "B" to 0, 300', 'moved "C" to 0, 460']);
  });

  it('leaves a set moved by hand where it is, with its stamp, and flows the others around it', async () => {
    const mock = createFigmaMock().install();
    beginRun();
    const a = await build(mock, 'A', 60);
    const b = await build(mock, 'B', 60);
    const c = await build(mock, 'C', 60);
    await finishRun({});
    const stamp = b.getSharedPluginData('toghen', 'stamp');
    assert.deepEqual(stampOf(b)?.placed, { x: 0, y: 160 });
    // B is dragged next to C's place; A grows into the space.
    b.x = 500;
    b.y = 300;

    beginRun();
    await build(mock, 'A', 120);
    const finished = await finishRun({});

    assert.deepEqual(at(b), [500, 300], 'not moved');
    assert.equal(b.getSharedPluginData('toghen', 'stamp'), stamp, 'and not stamped again');
    assert.deepEqual(
      [at(a), at(c)],
      [
        [0, 0],
        [0, 220],
      ],
      'C follows A',
    );
    assert.deepEqual(finished.notes, []);
  });

  it('flows the stack below a set moved by hand that it would overlap, and notes nothing when that clears it', async () => {
    const mock = createFigmaMock().install();
    beginRun();
    const a = await build(mock, 'A', 60);
    const b = await build(mock, 'B', 60);
    await finishRun({});
    b.x = 10;
    b.y = 10;

    beginRun();
    await build(mock, 'A', 60);
    const finished = await finishRun({});

    assert.deepEqual(at(b), [10, 10], 'not moved');
    assert.deepEqual(at(a), [0, 170], 'A went under B');
    assert.deepEqual(finished.notes, []);
  });

  it('notes a set moved by hand that overlaps something it cannot be cleared of, and does not move it', async () => {
    const mock = createFigmaMock().install();
    beginRun();
    await build(mock, 'A', 60);
    const b = await build(mock, 'Button', 60);
    await finishRun({});
    const dot = figmaOf().createFrame();
    dot.name = 'Dot';
    dot.x = 20;
    dot.y = 210;
    dot.resize(40, 40);
    b.x = 0;
    b.y = 200;

    beginRun();
    await build(mock, 'A', 60);
    const finished = await finishRun({});

    assert.deepEqual(at(b), [0, 200]);
    assert.deepEqual(finished.notes, ['"Button" was moved by hand and overlaps "Dot"; it was left where it is.']);
  });

  it('moves a set from before positions were recorded when it overlaps another, and stamps one that does not', async () => {
    const mock = createFigmaMock().install();
    beginRun();
    const a = await build(mock, 'A', 60);
    const b = await build(mock, 'B', 60);
    const c = await build(mock, 'C', 60);
    await finishRun({});
    // Forget what Toghen recorded: these sets are from before the stamp. B is piled on A; C is clear of both.
    for (const set of [a, b, c]) {
      const { placed: _forgotten, ...rest } = stampOf(set)!;
      set.setSharedPluginData('toghen', 'stamp', JSON.stringify(rest));
    }
    b.y = 20;
    c.y = 900;

    beginRun();
    await build(mock, 'A', 60);
    await finishRun({});

    assert.deepEqual(
      [a, b, c].map(at),
      [
        [0, 0],
        [0, 160],
        [0, 900],
      ],
      'B joined the stack and went under A; C stayed',
    );
    assert.deepEqual(stampOf(c)?.placed, { x: 0, y: 900 }, 'and C is stamped where it is');
    assert.deepEqual(stampOf(a)?.placed, { x: 0, y: 0 });
  });

  it('writes the stamps after the moves', async () => {
    const mock = createFigmaMock().install();
    beginRun();
    await build(mock, 'A', 60);
    await build(mock, 'B', 60);
    const before = mock.calls().length;
    await finishRun({});

    const calls = mock.calls().slice(before);
    const lastMove = calls.map((call) => call.api === 'node.set' && (call.args[1] === 'x' || call.args[1] === 'y')).lastIndexOf(true);
    const firstStamp = calls.findIndex(
      (call) => call.api === 'node.setSharedPluginData' && call.args[1] === 'toghen' && call.args[2] === 'stamp',
    );
    assert.ok(lastMove !== -1 && firstStamp > lastMove, 'every stamp follows the last move');
  });

  it('stacks an artboard’s frame with the sets, and stamps it', async () => {
    const mock = createFigmaMock().install();
    beginRun();
    const a = await build(mock, 'A', 60);
    await finishRun({});
    // A frame an earlier run placed at 300, stamped with the keys from before the stamp.
    const frame = figmaOf().createFrame();
    frame.setSharedPluginData('toghen', 'artboard', 'Docs');
    frame.setSharedPluginData('toghen', 'placed', '{"x":0,"y":300}');
    frame.y = 300;
    frame.resize(80, 40);
    assert.deepEqual(at(a), [0, 0]);

    // The set grows to 400 tall: the frame is Toghen's, so it goes under it.
    beginRun();
    await build(mock, 'A', 400);
    await finishRun({});
    assert.deepEqual(at(frame), [0, 500]);
    assert.deepEqual(
      stampOf(frame),
      { is: { artboard: 'Docs' }, receipt: {}, placed: { x: 0, y: 500 }, id: frame.id },
      "moved over to the stamp, with the frame's id",
    );
    assert.deepEqual(frame.getSharedPluginDataKeys('toghen'), ['stamp'], 'and the old keys are gone');
  });

  it('looks at no page the run did not touch', async () => {
    const mock = createFigmaMock().withPage('Page 1').withPage('Other').install();
    beginRun();
    await build(mock, 'A', 60);
    await finishRun({});
    const other = (figmaOf().root.children as Node[]).find((page) => page.name === 'Other');
    assert.deepEqual(other.children, []);
    beginRun();
    const finished = await finishRun({});
    assert.deepEqual(finished, { removed: [], moved: [], notes: [] });
  });

  it('says in a dry run which sets it would restack, writes nothing, and gives no positions', async () => {
    const mock = createFigmaMock().install();
    beginRun();
    const a = await build(mock, 'A', 60);
    const b = await build(mock, 'B', 60);
    await finishRun({});
    b.x = 400;
    b.y = 400;

    beginRun();
    await run(desiredFromText(sized('A', 80)), { dryRun: true });
    const writes = mock.writes().length;
    const finished = await finishRun({ dryRun: true });

    assert.deepEqual(finished.notes, [
      'page "Page 1": a run would restack "A"',
      'page "Page 1": "B" was moved by hand and would be left where it is',
    ]);
    assert.deepEqual(finished.moved, []);
    assert.equal(mock.writes().length, writes);
    assert.deepEqual(
      [at(a), at(b)],
      [
        [0, 0],
        [400, 400],
      ],
    );
  });
});
