/**
 * The order a run's files go in: each file after every file that defines a component it names.
 *
 * A file that names a component a later file defines would find nothing, since that set is not built yet. So files
 * are sorted by what they define and name; ties keep the order they were typed in, so only a file with a dependency
 * moves. A name a declared library defines resolves there, and is no dependency on a file. A cycle is refused, naming
 * its files. An artboard defines nothing, so it never comes before a component file it could follow.
 */

export interface FileNames {
  fileName: string;
  /** The component the file defines; none for an artboard, or a file that does not read. */
  defines?: string;
  /** The components it names by name. */
  names: readonly string[];
}

/** `files` in the order to run them. Throws when they name each other in a cycle, with the files of the cycle in order. */
export function orderFiles<T extends FileNames>(files: readonly T[], fromLibraries: ReadonlySet<string> = new Set()): T[] {
  const definer = new Map<string, number>();
  files.forEach((file, i) => {
    if (file.defines !== undefined && !definer.has(file.defines)) definer.set(file.defines, i);
  });
  const after = files.map((file, i) => {
    const on = new Set<number>();
    for (const name of file.names) {
      const at = definer.get(name);
      if (at !== undefined && at !== i && !fromLibraries.has(name)) on.add(at);
    }
    return [...on];
  });

  const done = new Set<number>();
  const ordered: T[] = [];
  while (ordered.length < files.length) {
    // The first file typed whose every dependency has run: what keeps the typed order among ties.
    const next = files.findIndex((_, i) => !done.has(i) && after[i].every((at) => done.has(at)));
    if (next === -1) {
      // Every file left waits on another left: follow the waits from one until a file comes round again.
      const path: number[] = [];
      let at = files.findIndex((_, i) => !done.has(i));
      while (!path.includes(at)) {
        path.push(at);
        at = after[at].find((dependency) => !done.has(dependency))!;
      }
      const cycle = [...path.slice(path.indexOf(at)), at].map((i) => files[i].fileName);
      throw new Error(`the component files name each other in a cycle, so none of them can be built first: ${cycle.join(' → ')}`);
    }
    done.add(next);
    ordered.push(files[next]);
  }
  return ordered;
}
