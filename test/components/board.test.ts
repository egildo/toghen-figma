import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFigmaMock, useFigmaMock } from '../support/figmaMock.js';
import { memberBoard } from '../../shared/components/diff.js';
import { readComponentFile } from '../../shared/components/index.js';
import { run } from '../../main/components/run.js';
import { desiredFromText } from './support.js';

// The nodes a test reads are the mock's, through the API the engine used.
type Node = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** A synthetic component: each axis is a name and a count, its values `<name>1`, `<name>2`, … */
const component = (axes: [string, number][], header = '', extra = ''): string => `component Board${header}
properties {
${axes.map(([name, count]) => `    VARIANT ${name} ${Array.from({ length: count }, (_, at) => `${name}${at + 1}`).join(' ')}`).join('\n')}
}
${extra}FRAME Board layoutMode=NONE width=(literal)80 height=(literal)60
`;

const read = (text: string) => {
  const file = readComponentFile(text);
  assert.deepEqual(
    file.problems.filter((problem) => problem.severity === 'error'),
    [],
    text,
  );
  return file;
};

/** The board of a file, with each member's cell by name. */
const boardOf = (text: string) => {
  const file = read(text);
  const board = memberBoard(file.members, file.component!);
  return { ...board, at: Object.fromEntries(board.cells.map((cell) => [cell.name, [cell.row, cell.column]])) as Record<string, number[]> };
};

const SIX: [string, number][] = ['a', 'b', 'c', 'd', 'e', 'f'].map((name) => [name, 2]);

describe('the board: which axes go across', () => {
  it('is one row for a component with one axis, and one cell for a component with none', () => {
    const one = boardOf(component([['tone', 3]]));
    assert.deepEqual(
      one.cells.map((cell) => [cell.row, cell.column]),
      [
        [0, 0],
        [0, 1],
        [0, 2],
      ],
    );
    assert.deepEqual(one.columnGaps, [0, 40, 40]);
    assert.deepEqual(one.rowGaps, [0]);

    const none = boardOf(`component Dot\nFRAME Dot layoutMode=NONE\n`);
    assert.deepEqual(
      none.cells.map((cell) => [cell.row, cell.column]),
      [[0, 0]],
    );
  });

  it('lays out two axes of a few values as it always did: the last across, the first down', () => {
    const { at, columnGaps, rowGaps } = boardOf(
      component([
        ['kind', 3],
        ['state', 3],
      ]),
    );
    assert.deepEqual(at['kind=kind1, state=state1'], [0, 0]);
    assert.deepEqual(at['kind=kind1, state=state3'], [0, 2]);
    assert.deepEqual(at['kind=kind3, state=state2'], [2, 1]);
    assert.deepEqual(
      [columnGaps, rowGaps],
      [
        [0, 40, 40],
        [0, 40, 40],
      ],
    );
  });

  it('keeps the last axis across when it is the longer, however many there are down', () => {
    const { columnGaps, rowGaps } = boardOf(
      component([
        ['a', 5],
        ['b', 2],
      ]),
    );
    assert.equal(columnGaps.length, 2);
    // The columns are fewer than the rows, but one axis only is down: it is never moved across.
    assert.equal(rowGaps.length, 5);
  });

  it('balances a long list of short axes: it moves axes across while the columns are fewer than the rows', () => {
    // Down a, b, c and across d, e, f: eight columns against eight rows.
    const { columnGaps, rowGaps, at } = boardOf(component(SIX));
    assert.equal(columnGaps.length, 8);
    assert.equal(rowGaps.length, 8);
    assert.deepEqual(at['a=a1, b=b1, c=c1, d=d1, e=e1, f=f1'], [0, 0]);
    assert.deepEqual(at['a=a2, b=b1, c=c1, d=d1, e=e1, f=f1'], [4, 0], 'the first axis is the most significant down');
    assert.deepEqual(at['a=a1, b=b1, c=c1, d=d2, e=e1, f=f1'], [0, 4], 'and the first across is the most significant across');
    assert.deepEqual(at['a=a1, b=b1, c=c2, d=d1, e=e1, f=f2'], [1, 1]);
  });

  it('stops balancing when the columns are at least the rows', () => {
    // Across c(10) alone is ten columns against four rows: a and b stay down.
    const { columnGaps, rowGaps } = boardOf(
      component([
        ['a', 2],
        ['b', 2],
        ['c', 10],
      ]),
    );
    assert.equal(columnGaps.length, 10);
    assert.equal(rowGaps.length, 4);
    // c(2) is fewer than nine rows, so b moves across; then six columns against three rows, and a, alone down, stays.
    const six = boardOf(
      component([
        ['a', 3],
        ['b', 3],
        ['c', 2],
      ]),
    );
    assert.equal(six.columnGaps.length, 6);
    assert.equal(six.rowGaps.length, 3);
  });

  it('goes by the axes the file names with across=, in the order they were declared in', () => {
    const { columnGaps, rowGaps, at } = boardOf(
      component(
        [
          ['a', 2],
          ['b', 3],
          ['c', 2],
        ],
        ' across="c, a"',
      ),
    );
    assert.equal(columnGaps.length, 4);
    assert.equal(rowGaps.length, 3);
    // a is declared before c, so a is the outer group of the columns however the list is written.
    assert.deepEqual(at['a=a2, b=b1, c=c1'], [0, 2]);
    assert.deepEqual(at['a=a1, b=b3, c=c2'], [2, 1]);
  });

  it('allows listing every axis: one row', () => {
    const { rowGaps, columnGaps, cells } = boardOf(
      component(
        [
          ['a', 2],
          ['b', 2],
        ],
        ' across="a, b"',
      ),
    );
    assert.deepEqual(rowGaps, [0]);
    assert.equal(columnGaps.length, 4);
    assert.ok(cells.every((cell) => cell.row === 0));
  });

  it('puts the default member, the first value of every axis, at the origin whatever the split', () => {
    for (const header of ['', ' across="a"', ' across="b, c"', ' across="a, b, c"']) {
      const { at } = boardOf(
        component(
          [
            ['a', 2],
            ['b', 3],
            ['c', 2],
          ],
          header,
        ),
      );
      assert.deepEqual(at['a=a1, b=b1, c=c1'], [0, 0], header);
    }
  });

  it('keeps the cell of a combination the file excludes empty, so the columns and rows stay aligned', () => {
    const { at, columnGaps, rowGaps } = boardOf(
      component(
        [
          ['a', 2],
          ['b', 2],
        ],
        '',
        '',
      ).replace('FRAME Board', 'exclude a=a2 b=b2\nFRAME Board'),
    );
    assert.deepEqual(Object.keys(at), ['a=a1, b=b1', 'a=a1, b=b2', 'a=a2, b=b1']);
    assert.deepEqual(at['a=a2, b=b1'], [1, 0]);
    assert.deepEqual([columnGaps.length, rowGaps.length], [2, 2]);
  });
});

describe('the board: gaps grow outward', () => {
  it('is 40 inside a group, 80 between the groups of the next axis out and 120 beyond', () => {
    const { columnGaps, rowGaps } = boardOf(component(SIX));
    // Across d, e, f: f changes inside a group of two (40), e between them (80), d between those (120).
    assert.deepEqual(columnGaps, [0, 40, 80, 40, 120, 40, 80, 40]);
    assert.deepEqual(rowGaps, [0, 40, 80, 40, 120, 40, 80, 40]);
  });

  it('goes by the outermost axis whose value changes, and an axis of one value never changes', () => {
    // Across a(2) b(1) c(2): from the second column to the third both a and c change; a is outermost (level 2).
    const { columnGaps } = boardOf(
      component(
        [
          ['a', 2],
          ['b', 1],
          ['c', 2],
        ],
        ' across="a, b, c"',
      ),
    );
    assert.deepEqual(columnGaps, [0, 40, 120, 40]);
  });
});

describe('the board: the set is laid out from the members’ measured sizes', () => {
  useFigmaMock();

  const placed = async (text: string) => {
    const mock = createFigmaMock().install();
    const report = await run(desiredFromText(text));
    const set = mock.node(report.setId!) as Node;
    const at = (name: string) => {
      const member = (set.children as Node[]).find((child) => child.name === name)!;
      return [member.x, member.y];
    };
    return { set, at };
  };

  it('puts the columns 40 apart inside a group and 80 between groups, and the default member at the origin', async () => {
    // Across b and c (a is down, being the only axis left there): 80 wide and 60 tall, three columns gaps 40, 80, 40.
    const { set, at } = await placed(
      component([
        ['a', 2],
        ['b', 2],
        ['c', 2],
      ]),
    );
    assert.deepEqual(at('a=a1, b=b1, c=c1'), [0, 0]);
    assert.deepEqual(at('a=a1, b=b1, c=c2'), [120, 0]);
    assert.deepEqual(at('a=a1, b=b2, c=c1'), [280, 0], '80 + 40 + 80 + 80');
    assert.deepEqual(at('a=a1, b=b2, c=c2'), [400, 0]);
    assert.deepEqual(at('a=a2, b=b1, c=c1'), [0, 100]);
    assert.deepEqual([set.width, set.height], [480, 160]);
  });

  it('lets a column with no member take no width but keep its gap', async () => {
    // b2 is excluded in every row: the middle column is empty.
    const { set, at } = await placed(
      component([
        ['a', 2],
        ['b', 3],
      ]).replace('FRAME Board', 'exclude b=b2\nFRAME Board'),
    );
    assert.deepEqual(at('a=a1, b=b1'), [0, 0]);
    assert.deepEqual(at('a=a1, b=b3'), [160, 0], '80 wide, then 40 for the empty column’s gap and 40 for its own');
    assert.equal(set.width, 240);
  });

  it('lays an existing set out on the new board at its next run', async () => {
    const mock = createFigmaMock().install();
    const text = component([
      ['a', 2],
      ['b', 2],
    ]);
    const first = await run(desiredFromText(text));
    const set = mock.node(first.setId!) as Node;
    assert.equal(set.width, 200);

    await run(
      desiredFromText(
        component(
          [
            ['a', 2],
            ['b', 2],
          ],
          ' across="a, b"',
        ),
      ),
    );
    assert.deepEqual([set.width, set.height], [480, 60], 'one row of four: 40, 80 and 40 between them');
  });
});

describe('the board: across= is refused with the value named', () => {
  const problems = (text: string): string[] =>
    readComponentFile(text)
      .problems.filter((p) => p.severity === 'error')
      .map((p) => p.message);

  it('refuses a name that is not an axis of the component', () => {
    assert.deepEqual(problems(component([['a', 2]], ' across="size"')), ['component: across names "size", which is not a VARIANT axis']);
  });

  it('refuses a name given twice', () => {
    assert.deepEqual(
      problems(
        component(
          [
            ['a', 2],
            ['b', 2],
          ],
          ' across="a, a"',
        ),
      ),
      ['component: across="a, a" names "a" twice'],
    );
  });

  it('refuses an empty name', () => {
    assert.deepEqual(
      problems(
        component(
          [
            ['a', 2],
            ['b', 2],
          ],
          ' across="a,"',
        ),
      ),
      ['component: across="a," has an empty name; write the axes\' names separated by commas'],
    );
  });

  it('refuses what is not a string, or is tagged', () => {
    assert.match(problems(component([['a', 2]], ' across=3'))[0], /across takes the names of axes in quotes.*not 3/);
    assert.match(
      problems(component([['a', 2]], ' across=(literal)"a"'))[0],
      /across takes the names of axes in quotes.*not \(literal\)"a"/,
    );
  });

  it('is a key of the component line like tokens and layout', () => {
    assert.deepEqual(problems(component([['a', 2]], ' board="a"')), ['component has no "board"; it takes tokens, layout, across']);
  });

  it('points at the line it was written on', () => {
    const [problem] = readComponentFile(component([['a', 2]], ' across="size"')).problems;
    assert.equal(problem.line, 1);
  });
});
