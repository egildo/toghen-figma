# Tasks: Guards for part keys, and a warning for a token named outright

**Input**: `specs/2026-10-29-part-guards/spec.md`

**Organization**: grouped by story. The last phase is Fold. `[P]` runs beside the other `[P]` tasks of its phase.

## Phase 1: Fixture

- [ ] T001 A synthetic token group in `test/components/fixtures` with two part axes: one folded (`interaction`: `hover`), one left in the path (`availability`: `disabled`, and a part group giving `color`). Colours as `{colorSpace, components}`, dimensions as `{value, unit}`. Shared by `partGuards.test.ts` and `outrightTokens.test.ts`.

## Phase 2: A guard for a part key, by name only (P1)

- [ ] T002 [P] Tests in `test/components/partGuards.test.ts`: the bodiless guard reads and drives a `when`; a written body still wins; a non-part name, `rest`, a value shared with a declared axis, and one inside a `define` are refused, naming the part keys.
- [ ] T003 `shared/components/validate.ts`: in `checkDocument`, accept a bodiless top-level guard whose name is a part key of exactly one VARIANT axis, the axis being a part axis; else refuse with the new message.
- [ ] T004 `shared/components/members.ts`: `evaluateMembers` passes `guards` to kdlet's `evaluate`, one per bodiless part-key guard the document declares, each `({ inputs }) => inputs[axis] === key`.

## Phase 3: The hint for an undeclared part key (P1)

- [ ] T005 [P] Tests in `partGuards.test.ts`: `when selected` with no guard gets the hint at kdlet's place; a name that is no part key gets kdlet's text alone.
- [ ] T006 `shared/components/index.ts`: after `resolveAxes`, add the hint to each kdlet problem matching `no guard named "<key>"` whose key is a part key.

## Phase 4: The warning for a token named outright (P2)

- [ ] T007 [P] Tests in `test/components/outrightTokens.test.ts`: the four acceptance scenarios, through `readComponentFile` and through `checkComponents`.
- [ ] T008 `shared/components/index.ts`: per member with a non-empty selection, walk the layer tree before bindings, and for each token written outright ask `source.group(parent, selection)`; collect a differing `paths[key]` per reference; after the members, one warning per reference naming the members and tokens.

## Phase 5: Fold

- [ ] T009 [P] `component-files.md`: the guard paragraph says when a body is supplied; *Bindings from a group* gains the sentence on a reference written outright.
- [ ] T010 [P] `specs.md`: the reason component files now act as a host for part-key guards only, and why the warning lives in the read.
- [ ] T011 `decisions.md`: a dated entry with both rulings and what was rejected (Toghen supplying the name too, which needs kdlet; the warning in the check beside the folded-part error).
- [ ] T012 `pnpm check`; `pnpm build`, and the plugin's output holds no `[object Object]` and no unresolved `toghen(`.
- [ ] T013 Mark the spec **Status: Folded** with the date.

## Dependencies

T001 first. Phases 2, 3 and 4 then run in any order: T003 and T004 touch validate and members; T006 and T008 both touch `index.ts`, so they go one after the other. Fold last.
