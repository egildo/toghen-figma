/**
 * The design system, as a component file asks about it (`shared/components/axes.ts`).
 *
 * The reader holds no `@toghen/lib`, so what a file may ask (the contexts of a modifier,
 * the part axes a token group has) is answered here, by lib: in the
 * repository for the command line, and on the main thread for a template kept in a file. The answers are asked for lazily: a file that takes nothing from the tokens
 * never builds the sum, so a document the sum cannot be built from (a modifier with no
 * default) only matters to a file that needs it.
 */

import { referencePath, type Collection, type Resolver } from '@toghen/lib';
import type { DesignSource } from '../../shared/components/axes.js';
import type { GroupInfo } from '../../shared/components/model.js';
import { foldsOf, unfoldedFor, type Folds } from './folds.js';
import { figmaContexts, pathsInAnyMode, resolveSumModes, snapshotModes } from './resolverModes.js';
import type { ModeSnapshot } from './resolverModes.js';

interface Modifier {
  name: string;
  /** Every context, the default first: the default member of an axis, as the first mode of a Figma collection. */
  contexts: string[];
  /** The contexts Figma gets, in that order (`figmaContexts`). Read when asked: a modifier's bad `figma.include` is only the problem of a file that uses it. */
  figma(): string[];
}

export function designSourceOf(resolver: Resolver): DesignSource {
  let built:
    | { modifiers: Modifier[]; paths: string[]; collection: string; tokens: Collection; resolution: ReturnType<typeof resolveSumModes> }
    | undefined;
  const foldsCache = new Map<string, Folds>();
  // The values of every token in every context, read only for a group with a composite `border` in it.
  let snapshots: ModeSnapshot[] | undefined;
  const design = () => {
    if (built) return built;
    // The sum, as variable sync builds it; the modifiers in the document's declared order, with their spelling.
    const resolution = resolveSumModes(resolver);
    const { ds, dsCollectionName } = resolution;
    const collection = ds.getCollection(dsCollectionName);
    // `resolveSumModes` has refused a modifier with no default.
    const modifiers = resolver.getModifiers().map(
      (modifier): Modifier => ({
        name: modifier.name,
        contexts: [modifier.default!, ...modifier.contexts.filter((context) => context !== modifier.default)],
        figma: () => figmaContexts(modifier),
      }),
    );
    built = {
      modifiers,
      paths: [...pathsInAnyMode(resolution).keys()],
      collection: dsCollectionName,
      tokens: collection as Collection,
      resolution,
    };
    return built;
  };

  const foldsFor = (unfold: readonly string[]): Folds => {
    const key = unfold.join('\n');
    let folds = foldsCache.get(key);
    if (!folds) {
      const { paths, tokens } = design();
      foldsCache.set(key, (folds = foldsOf(tokens, paths, unfold)));
    }
    return folds;
  };

  /**
   * The variable that carries a token the precedence picked: its twin, when its part on a folded axis is a cell of the
   * twin's variable, so the member's pin on that axis selects it; the token itself otherwise. Exact, since no token
   * carries two folded parts and a folded variable's rows pick as lib's precedence does (`folds.ts`).
   */
  const carrier = (path: string, folded: readonly string[]): string => {
    if (folded.length === 0) return path;
    const { tokens } = design();
    const part = tokens.partsOf(path).parts.find((candidate) => folded.includes(candidate.axis));
    if (!part) return path;
    const cell = foldsFor(unfoldedFor(resolver)).parts.get(part.twin)?.get(part.axis)?.get(part.key) === path;
    // A part of another type than its twin stays a variable of its own (`foldTokens`).
    return cell && tokens.getToken(path)?.$type === tokens.getToken(part.twin)?.$type ? part.twin : path;
  };

  return {
    // A component file takes the contexts Figma gets: the others have no mode to pin.
    contexts: (modifier) =>
      design()
        .modifiers.find((entry) => entry.name === modifier)
        ?.figma(),
    leftOut: (modifier) => {
      const found = design().modifiers.find((entry) => entry.name === modifier);
      const gets = found?.figma();
      return found && gets ? found.contexts.filter((context) => !gets.includes(context)) : undefined;
    },
    partsOf: (group, layoutParts) => {
      const { tokens } = design();
      if (tokens.getNodeKind(group) === 'missing') return undefined;
      // This file's own layout decides its component; the others keep what the files checked before it said.
      const stored = unfoldedFor(resolver).filter((name) => name !== group);
      const unfold = layoutParts ? [...stored, group] : stored;
      return foldsFor(unfold).components.find((component) => component.group === group)?.axes ?? [];
    },
    children: (path) => {
      const { tokens } = design();
      if (tokens.getNodeKind(path) === 'token') return 'token';
      // One name for each child, tokens and groups alike, in document order (lib's `childrenOf`).
      const names = tokens.childrenOf(path).map((child) => child.key);
      return names.length > 0 ? names : undefined;
    },
    group: (path, selection = {}, folded = []) => {
      const { tokens, collection, resolution } = design();
      // The token each key is: in the group, or in a part group the member selects (`button.primary.backgroundColor`),
      // as lib's `applies` rules: more parts wins, then the later axis; the document's key order never matters. A
      // winner folded into its twin is bound through the twin, whose mode the member pins.
      const at = tokens.applies(path, selection);
      for (const key of Object.keys(at)) at[key] = carrier(at[key], folded);
      const keys = Object.keys(at);
      const kind = tokens.getNodeKind(path);
      if (keys.length === 0) return kind === 'group' ? { keys } : kind === 'token' ? 'token' : undefined;

      const info: GroupInfo = { keys };
      const moved = keys.filter((key) => at[key] !== `${path}.${key}`);
      if (moved.length > 0) {
        info.paths = {};
        for (const key of moved) info.paths[key] = at[key];
      }
      snapshots ??= snapshotModes(resolution);
      const prefix = `${collection}.`;
      for (const key of keys) {
        // `background` binds the fill only when its token is a colour in every context.
        if (key === 'background' && snapshots.every((snapshot) => snapshot.pathToToken.get(`${prefix}${at[key]}`)?.type === 'color'))
          info.colors = [key];
        // A composite `border`: its members are what binds. A member that is one whole reference binds the
        // token it refers to (in the default context); a style that is not solid, in any context, is not bindable.
        const token = (snapshot: ModeSnapshot) => snapshot.pathToToken.get(`${prefix}${at[key]}`);
        if (snapshots.every((snapshot) => token(snapshot)?.type !== 'border')) continue;
        const border: NonNullable<GroupInfo['borders']>[string] = {};
        const members = token(snapshots[0])?.memberOf ?? {};
        if (members.color) border.color = referencePath(members.color);
        if (members.width) border.width = referencePath(members.width);
        if (snapshots.some((snapshot) => token(snapshot) && (token(snapshot)?.value as { style?: unknown } | undefined)?.style !== 'solid'))
          border.unsolid = true;
        (info.borders ??= {})[key] = border;
      }
      return info;
    },
  };
}
