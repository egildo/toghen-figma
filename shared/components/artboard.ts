/**
 * An artboard file: `artboard <Name>` and one root `FRAME`, in the component file's vocabulary.
 *
 * A component file says what a component is, and is expanded once per combination of variant values. An
 * artboard file says what a frame on a page holds: instances of components, with their properties set and their
 * slots filled, and it is evaluated once, with the inputs the command line hands it. The same kdlet reads and
 * evaluates it, and the same checks refuse what is wrong with a layer; what differs is the header, the words
 * `slot`, and that `each`, `define` and `+call` are allowed, since inputs give them a list to repeat.
 *
 * The file is read into the same shape a component file is (`ComponentFile`): a name, and one member, whose tree is
 * the frame. So the engine's snapshot, diff and apply serve both, and an artboard is found again by its stamp.
 */

import type { Node } from '@bgotink/kdl';
import type { Document, Item } from 'kdlet';
import { evaluate, read as readDocument } from 'kdlet';
import { checkArtboardRoots } from './check.js';
import type { ComponentFile } from './index.js';
import { vocabulary, toArtboardLayer } from './members.js';
import type { Member, Problem } from './model.js';
import { HOST_WORDS, locOf, report, split } from './read.js';
import { validateArtboard } from './validate.js';

/** The top-level word that makes a file an artboard file. */
export const ARTBOARD_WORD = 'artboard';

const WORDS = [ARTBOARD_WORD, ...HOST_WORDS];

/** Whether the text is an artboard file: it has an `artboard` node at the top. */
export function isArtboardText(text: string): boolean {
  return readDocument(text, { words: WORDS }).nodes.some((item) => item.kind === 'host' && item.name === ARTBOARD_WORD);
}

/** What an artboard file cannot say: a guard no host is there to supply. */
function checkDocument(items: Item[], problems: Problem[]): void {
  for (const item of items) {
    if (item.kind === 'guard' && item.body === undefined) {
      problems.push({
        severity: 'error',
        message: `guard "${item.name}" has no body, which marks a guard the host supplies; an artboard file has no host to supply one`,
        line: item.loc.line,
        column: item.loc.column,
      });
    }
    if ('children' in item) checkDocument(item.children, problems);
  }
}

const position = (problem: Problem): number => (problem.line === undefined ? Infinity : problem.line * 100000 + (problem.column ?? 0));

/**
 * Reads, evaluates and validates one artboard file against its inputs.
 *
 * Every problem is reported, not the first. The tree is checked only when kdlet found nothing wrong in the
 * evaluation (a missing input is kdlet's, with the line where it would be shown).
 */
export function readArtboardFile(text: string, inputs: Record<string, unknown> = {}): ComponentFile {
  const sink: Problem[] = [];
  const read = readDocument(text, { words: WORDS });
  for (const problem of read.problems)
    sink.push({ severity: 'error', message: problem.message, line: problem.line, column: problem.column });
  const document: Document = { nodes: read.nodes.filter((item) => item.kind !== 'host'), problems: [] };
  if (read.nodes.length === 0 && read.problems.length > 0) return { document, members: [], problems: sink };

  const words: Node[] = [];
  for (const item of read.nodes) if (item.kind === 'host') words.push(item.node);
  const headers = words.filter((word) => word.getName() === ARTBOARD_WORD);
  if (headers.length === 0) {
    sink.push({ severity: 'error', message: 'the file needs one "artboard <Name>"' });
    return { document, members: [], problems: sink };
  }
  if (headers.length > 1) report(sink, 'a file holds one artboard', headers[1]);
  for (const word of words) {
    const name = word.getName();
    if (name === ARTBOARD_WORD) continue;
    report(
      sink,
      name === 'component'
        ? 'a file holds an artboard or a component, not both'
        : `${name} belongs to a component file: an artboard has no component properties, variant axes or members`,
      word,
    );
  }

  const header = headers[0];
  const { args, props } = split(sink, header, ARTBOARD_WORD);
  for (const [key, entry] of props) report(sink, `artboard has no "${key}"`, entry);
  for (const child of header.children?.nodes ?? []) {
    report(sink, 'artboard has no body: write the root FRAME beside it, at the top of the file', child);
  }
  const name = args[0]?.getValue();
  const named = args.length === 1 && args[0].getTag() === null && typeof name === 'string' && name !== '';
  if (!named) report(sink, 'artboard needs its name as its only argument', args[0] ?? header);
  const at = locOf(header) ?? { line: 1, column: 1 };

  checkDocument(document.nodes, sink);
  let members: Member[] = [];
  const artboardName = typeof name === 'string' ? name : '';
  if (!sink.some((problem) => problem.severity === 'error')) {
    const { tree, problems } = evaluate(document, { vocabulary, inputs });
    sink.push(
      ...problems.map((problem) => ({ severity: 'error' as const, message: problem.message, line: problem.line, column: problem.column })),
    );
    // A tree kdlet had problems with is not checked further: what is wrong in it would be said twice.
    if (problems.length === 0) {
      sink.push(...checkArtboardRoots(tree, artboardName, at));
      if (!sink.some((problem) => problem.severity === 'error')) {
        const root = toArtboardLayer(tree[0]);
        sink.push(...validateArtboard(root));
        members = [{ name: artboardName, combination: {}, tree: root }];
      }
    }
  }
  if (sink.some((problem) => problem.severity === 'error')) members = [];

  // A stable sort: problems on one line keep the order they were found in.
  const ordered = sink.map((problem, index) => ({ problem, index }));
  ordered.sort((a, b) => position(a.problem) - position(b.problem) || a.index - b.index);
  return {
    artboard: true,
    component: { name: artboardName, properties: [], exclude: [] },
    document,
    members,
    problems: ordered.map((entry) => entry.problem),
  };
}
