# Feature Specification: A member binds what the precedence picks, folded parts included

**Feature folder**: `specs/2026-10-29-folded-precedence`

**Created**: 29 October 2026

**Status**: Ready

**Input**: An issue a sibling consumer opened against 0.1.11. In a component whose `pointer` axis stays in the path while a later axis, `availability`, folds, the member `pointer=hover, availability=disabled` binds `hover.backgroundColor` and pins `availability=disabled`. lib's `applies` picks `disabled.backgroundColor` for that combination, and the stylesheet draws it; the member draws the hover's fill, since the hover's variable has no `availability` mode.

## Findings *(mandatory)*

- **F1. A member asks lib with the path-kept axes only.** `selectionOf` keeps a part axis only when it is not folded, and the design source answers `group(path, selection)` with lib's `applies(path, selection)`. *Checked*: `shared/components/axes.ts:227`; `main/utils/designSource.ts:86`–`:90`. *Status*: Confirmed
- **F2. lib's `applies` ranks every part the selection names, folded or not.** More parts wins; on a tie, the latest differing axis in the vocabulary wins. So `{pointer: hover, availability: disabled}` gives `disabled.backgroundColor` (one part each, availability later), and `{pointer: hover}` gives `hover.backgroundColor`. *Checked*: `lib/src/core/collection.ts:846`. *Status*: Confirmed
- **F3. A folded part lives as a mode of its twin's variable, its path with the folded segment removed.** `disabled.backgroundColor` is a cell of `backgroundColor`'s chain; `hover.backgroundColor` has an `availability` row only if some `hover.disabled.<key>` token exists. *Checked*: `main/utils/folds.ts:93`–`:99`, `:173`–`:190`. *Status*: Confirmed
- **F4. No token carries two folded parts.** An axis does not fold when a token carrying it already carries a folded axis ("carries it together with the folded …"), so that axis stays in the path. *Checked*: `main/utils/folds.ts:80`, `:86`. *Status*: Confirmed
- **F5. A folded variable's chain picks what `applies` picks, among the tokens folded into it.** Its rows run in the vocabulary's order, a later row's part cell winning over the rows below it; among tokens with the same path-kept parts and one folded part each, `applies` breaks the tie by the later axis too. *Checked*: `main/utils/folds.ts:173`–`:190` against F2. *Status*: Confirmed
- **F6. So binding the winner's twin is exact.** Let `applies` over the member's whole choice, path-kept and folded axes, pick `W`. Take out `W`'s folded part, if it has one (F4): that is the variable `V` that carries `W`. The member's pins select `W` in `V`'s chain (F5), since `W` beats every token folded into `V`. Where `W` has no folded part, `V` is `W`, and no token folded into it can win, since such a token would have one more part than `W`. *Status*: Confirmed by the argument above
- **F7. Where the two agree, binding the twin changes nothing.** In the folded-and-kept example of the parts tests, the member `pointer=hover, variant=primary` gets `primary.hover.backgroundColor` from `applies`, whose twin along the folded `pointer` is `primary.backgroundColor`, which it binds today. *Checked*: `test/components/partsAxes.test.ts:105`. *Status*: Confirmed
- **F8. The member's choice reaches the binding through two places.** `selectionOf` feeds the plans (`resolveGroups`, `resolveComponentGroup`) and the binding (`applyBindings` through `toMember`), which store and find a plan by `planKey(group, selection)`; the warning for a token named outright reads it too. *Checked*: `shared/components/index.ts:104`, `:155`; `shared/components/members.ts:281`; `shared/components/bindings.ts:43`. *Status*: Confirmed

## User Scenarios & Testing *(mandatory)*

### A member draws what the stylesheet draws (Priority: P1)

A design system's option has a hover part left in the path and a disabled part that folds. The member that is both hovered and disabled binds the rest's background, and its `availability=disabled` pin draws the disabled ground, as the stylesheet does.

**Why this priority**: today the output is quietly wrong, and only a token that restates the precedence works around it.

**Independent Test**: a synthetic group with `hover` and `selected.hover` parts (so `pointer` stays in the path) and a `disabled` part that folds; read through the plugin's design source; the hovered, disabled member binds `backgroundColor`.

**Acceptance Scenarios**:

1. **Given** the member `pointer=hover, availability=disabled`, **When** its layers are bound from `tokens=`, **Then** the fill binds `backgroundColor`, and the root pins `availability=disabled`.
2. **Given** the member `pointer=hover, availability=rest`, **When** bound, **Then** the fill binds `hover.backgroundColor`, as today.
3. **Given** a key the disabled part does not give (`borderRadius`), **When** the hovered, disabled member is bound, **Then** it binds what it binds today.
4. **Given** a token `hover.disabled.backgroundColor` in the group, **When** the hovered, disabled member is bound, **Then** it binds `hover.backgroundColor`, whose `availability` row carries that token.
5. **Given** the parts tests' folded `pointer` and kept `variant`, **When** read, **Then** every member binds what it binds today.

### Edge Cases

- A folded part that is not a variable of its twin's type stays a token of its own, and its twin's mode falls back to the rest (`folds.ts:147`). Binding the twin would then draw the rest. The binding keeps the winner's own path when the sum keeps a variable for it, as the check's folded-part error already asks (`main/components/file.ts:237`): such a part is not a cell of its twin.
- A `tokens=` group below the component (`button.label`): the folded axes are the component's, found from the winner's own parts, whatever group was asked.
- `layout=parts`: nothing folds, so the twin is always the winner, as today.
- The warning for a token named outright compares with the twin, so a reference to the rest under a folded part is not warned of, as today.
- Tokens in the structured shapes: colours as `{colorSpace, components}`, dimensions as `{value, unit}`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A member's choice MUST include every part axis whose value is not `rest`, folded or kept in the path.
- **FR-002**: For each key, the design source MUST ask lib's `applies` with that choice, and answer the variable that carries the winner: the winner's path with its folded part's segment removed, when that part is folded into its twin; the winner itself otherwise.
- **FR-003**: Members that differ only in a folded axis MUST keep their own plans, stored under the whole choice.
- **FR-004**: Every member of the existing parts tests MUST bind what it binds today.
- **FR-005**: The specs and component files MUST say that a member binds the variable carrying the token the precedence picks over all its parts, and why that is exact (F4, F5).

## Success Criteria *(mandatory)*

- **SC-001**: `pnpm check` passes in figma.
- **SC-002**: The plugin builds, with no `[object Object]` and no unresolved `toghen(` in its output.
- **SC-003**: Every acceptance scenario is a test with synthetic tokens.

## Assumptions

- The ruling stays lib's: the adapter only maps lib's answer to the variable Figma has for it, which is the fold's layout and the adapter's own.
- A library built before the fix rebinds on the next run: the bound field's value changes, so the diff writes it. No migration.

## Questions *(mandatory when a decision is open)*

1. **Where is the disagreement settled?**
   - *Context*: the issue offers three places, from least to most change.
   - a. Only a warning in the plan or the check. The output stays wrong.
   - b. Bind the variable that carries the token `applies` picks over the whole choice. *Recommended*: exact (F6), small, in figma alone.
   - c. Give every path-kept variable a mode for every folded axis. Exact too, but more variables and modes, and a change to the fold's layout.

## Answers (29 October 2026)

1. b. Bind the variable that carries the token `applies` picks.
