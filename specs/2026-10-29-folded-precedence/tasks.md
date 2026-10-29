# Tasks: A member binds what the precedence picks, folded parts included

**Input**: `specs/2026-10-29-folded-precedence/spec.md`

**Organization**: one story, then Fold. `[P]` runs beside the other `[P]` tasks of its phase.

## Phase 1: Tests first

- [ ] T001 `test/components/foldedPrecedence.test.ts`: a synthetic group whose `pointer` stays in the path (a `hover` part and a `selected.hover` one) and whose `availability` folds (`disabled`); the five acceptance scenarios, read through `designSourceOf`. Scenarios 1 and 4 fail before the change.

## Phase 2: The binding

- [ ] T002 `shared/components/axes.ts`: `selectionOf` returns every part axis whose value is not `rest`, folded or kept; its comment says why, and that the design source maps the winner to its variable.
- [ ] T003 `main/utils/designSource.ts`: `group(path, selection)` asks `applies` with the whole choice, then maps each winner to its twin along its folded part, when that part is a cell of the twin (the sum keeps no variable for it). `paths`, `colors` and `borders` read the mapped path.
- [ ] T004 Run the parts, bindings and outright-token tests unchanged: every member binds what it binds today (FR-004).

## Phase 3: Fold

- [ ] T005 [P] `component-files.md`, *A member follows its parts*: a member binds the variable carrying the token the precedence picks over all its parts.
- [ ] T006 [P] `specs.md`, beside *A member follows its parts*: why binding the twin is exact (no token carries two folded parts; a chain picks as `applies` does).
- [ ] T007 `decisions.md`: a dated entry, with the two options not chosen.
- [ ] T008 `pnpm check`; `pnpm build`, and the output holds no `[object Object]` and no unresolved `toghen(`.
- [ ] T009 Mark the spec **Status: Folded** with the date; remove this file.
