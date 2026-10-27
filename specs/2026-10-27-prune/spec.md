# Feature Specification: Remove what Toghen built from a source that no longer exists

**Feature folder**: `specs/2026-10-27-prune`

**Created**: 27 October 2026

**Status**: Folded

**Input**: User description: "write a plan with questions for removing what has no source; I'll rule on it." A consumer deleted a component from their source: its component file and its artboard file are gone. After a full build the library still holds the component's set, and the file of artboards still holds its artboard. A dry run over the remaining files says both files are in step. They ask for either a way to remove what Toghen made from a source that no longer exists, or a listing of it so a script can fail on it.

## Findings *(mandatory)*

- **F1. A run reads only the files it is given.** A set or an artboard is found by its stamp, by the name its file declares (`stampedSets`, `builtNode`). One that no file in the run declares is never looked for, so nothing reports it. *Checked*: `main/components/snapshot.ts:282`, `:302`. *Status*: Confirmed
- **F2. No step removes a set or an artboard.** Ruled when copies were settled: steps remove members, layers and properties, never a whole set. *Checked*: specs.md, *A copy whose original Toghen removes*. *Status*: Confirmed
- **F3. There is one precedent: strays.** A member outside any set is found once per run, before anything is written, on every page; it is always breaking; a real run without `--allow-breaking` stops on it, and with it the stray is removed at the end of the run and reported; a person's copy of it loses its stamp, said on the same line. *Checked*: `main/components/endOfRun.ts:61`, `main/handlers/runComponent.ts:43`; specs.md, *A member outside any set is a breaking step*. *Status*: Confirmed
- **F4. Every set and artboard Toghen made is stamped with what it is.** A set's stamp names its component, an artboard frame's names its artboard; a person's copy carries the stamp and is told apart by the id in it (`sortNodes`). So a run can list every set and artboard it made in a file, and which are copies, without any file. *Checked*: `main/components/stamp.ts`, `stampedAs`. *Status*: Confirmed
- **F5. Toghen makes no page.** A run builds into a page that exists (`--page`, else the current one), and pages carry no stamp. A page left empty is the person's page. *Checked*: `main/components/resolve.ts` (`no page named …`), no `createPage` in the engine. *Status*: Confirmed
- **F6. Removing a set breaks instances Toghen cannot see.** A library's set may have instances in files that use it, which the run never opens. This is why every breaking step stops a real run unless `--allow-breaking` is given. *Checked*: specs.md, *Breaking steps stop a real run*. *Status*: Confirmed
- **F7. In the reporter's layout, two runs each own a file.** A `sync` over the component files builds the library; a `components` run over the artboard files builds the file of artboards. Each would find what has no source in the file it writes.

## Prior art

- **`kubectl apply --prune`** deletes what an earlier apply made and the files given no longer declare. Its scope was the long-standing hazard: given a subset of the files, it pruned the rest. Kubernetes answered with *ApplySets*, a recorded group whose members are the only candidates for pruning.
- **Terraform** keeps a state of what it made; `plan` shows a resource no longer in the configuration as *destroy*, and `apply` destroys it. The scope is the state, which a partial configuration cannot narrow by accident.
- **Strays** (F3) are Toghen's own answer for members: found before writing, breaking, removed at the end with consent.

## User Scenarios & Testing *(mandatory)*

### A check that fails on what has no source (Priority: P1)

A design system's maintainer deletes a component. Their continuous integration runs a dry run over all their files; it reports the component's set and artboard as having no source, and exits non-zero, so the deletion cannot be forgotten.

**Acceptance Scenarios**:

1. **Given** a file built from three component files, **When** a dry run is given two of them as the whole system, **Then** it lists the third's set as having no source and exits non-zero.
2. **Given** the same file, **When** a dry run is given one file without saying it is the whole system, **Then** it reports nothing about the others.

### Removing it (Priority: P2)

The maintainer accepts the removal; a real run removes the set and the artboard, strips the stamps of a person's copies of them, and reports each.

**Acceptance Scenarios**:

1. **Given** the scenario above, **When** a real run is given the same files with the removal accepted, **Then** the set is removed, a person's copy of it is left and loses its stamp, and both are reported.
2. **Given** a page that held only the removed artboard, **When** the run ends, **Then** the page is left as it is (see Question 3).

### Edge Cases

- A person's copy of a set or artboard: never removed; its stamp is stripped when its original goes (F3's rule).
- A set whose component another file still names (an instance, a swap's default): the run already stops on the name that does not resolve, before it removes anything.
- A library run with `--library`: each run looks only in the file it writes (F7).
- A set built by a version before stamps held an id: it is ours by stamp, as today.

## Requirements *(mandatory)*

- **FR-001**: A run told that its files are the whole system MUST list each set and each artboard frame stamped by Toghen, and not a copy, that no file in the run declares.
- **FR-002**: A run not told so MUST NOT list or remove anything outside its files.
- **FR-003**: Removing one MUST be a breaking step, listed in a dry run and taken by a real run only with consent (Question 2).
- **FR-004**: A person's copy MUST be left, its stamp stripped when its original goes, and said on the same line, as for strays.
- **FR-005**: The ruling that no step removes a set (F2) is superseded for this case only, and the record says so.

## Questions *(mandatory when a decision is open)*

1. **What tells a run that its files are the whole system?**
   - *Context*: F1 and the prior art: the danger is a run given a subset that takes the rest for gone.
   - a. A flag on the run, `--prune`: the files given are the whole system for that file, and what they do not declare is listed. *Recommended*: explicit, the same name `kubectl` uses, and a script that checks everything passes it once.
   - b. `sync` always means the whole system; `components` never does. Fewer flags, but a `sync` over one file would list everything else, and the reporter's artboards are built with `components`.
   - c. A recorded group, as Kubernetes' ApplySets: the file holds the list of sources it was built from, and a source missing from a later run is pruned. Safest against a partial run, but a second record to keep in step, and a rename looks like a removal.

2. **Is removing what has no source taken with `--allow-breaking`, or with its own consent?**
   - *Context*: F3 and F6: strays are removed with `--allow-breaking`; a set's removal breaks more than a member's.
   - a. `--prune` lists them, and a real run removes them only with `--allow-breaking` too, as strays. *Recommended*: one gate for every breaking step; `--prune` alone in a real run stops before its first write, listing them.
   - b. `--prune` is the consent: it lists in a dry run and removes in a real run. One flag, but a breaking removal that `--allow-breaking` does not gate.

3. **What happens to a page left empty?**
   - *Context*: F5: Toghen never makes a page.
   - a. Left as it is, and the run says it is now empty. *Recommended*: a page is the person's; Toghen removes only what it stamped.
   - b. Removed when the run's removal left it empty. Tidier for the reporter, but Toghen would delete what it did not make.

4. **Should a listing without removal exist on its own?**
   - *Context*: the reporter's second option: a list a script can fail on.
   - a. No: a dry run with `--prune` is that listing, and exits non-zero when it lists anything. *Recommended*: one way to ask.
   - b. A separate command (`toghen-figma orphans`), reading the file and the files, writing nothing. Clearer to find, a second command for one question.

## Assumptions

- The Figma target gets the same: the engine is shared.
- Variables and styles are out of scope: the variable sync already removes a variable whose token is gone, and its own breaking gate covers it.

## Answers (27 October 2026)

1. a. A flag on the run, `--prune`: the files given are the whole system.
2. a. A real run removes them only with `--allow-breaking` too.
3. a. A page left empty is left as it is, and the run says so.
4. a. A dry run with `--prune` is the listing, and exits non-zero when it lists anything.
