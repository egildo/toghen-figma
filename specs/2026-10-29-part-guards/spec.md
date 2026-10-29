# Feature Specification: Guards for part keys, and a warning for a token named outright

**Feature folder**: `specs/2026-10-29-part-guards`

**Created**: 29 October 2026

**Status**: Ready

**Input**: Two issues a sibling consumer opened against 0.1.10, both found building component files against the FigCraft target.

- *A token named outright does not follow a part left in the path, and the check says nothing.* A text that writes `fills "{button.color}"` keeps the rest's colour in every member, even in a member whose selection has its own variable (`button.solid.disabled.color`). Written as `tokens="{button}"`, the same members bind the part's variable.
- *A part's value has no guard, and kdlet's error does not say where it would come from.* A component whose `selection` axis comes from its group's parts cannot write `when selected` without first writing `guard selected { is (input)selection selected }`, and kdlet's error gives no clue that `selected` is a value of an axis the file never declares.

## Findings *(mandatory)*

- **F1. A layer bound with `tokens=` follows the member's selection; a reference written outright does not.** `applyBindings` looks the group's plan up under `planKey(group, selection)`, and writes only fields the layer does not already have. A field written on the layer is kept as written, so it always names the rest's variable. *Checked*: `shared/components/bindings.ts:43`, `:51`. *Status*: Confirmed
- **F2. A folded axis hides the gap; an axis left in the path does not.** The selection holds only the part axes left in the path; a folded axis pins a mode on the root instead, and the rest's variable carries the folded parts as modes. *Checked*: `shared/components/axes.ts:227` (`selectionOf`), `:243` (`pinsOf`). *Status*: Confirmed
- **F3. The design source already answers which token a key is under a selection.** `group(path, selection)` returns, in `paths`, every key whose token moved to a part group the selection chose. lib's `applies` rules which one wins. *Checked*: `main/utils/designSource.ts:86`, `shared/components/model.ts:252`. *Status*: Confirmed
- **F4. Each member is checked with its selection and the design source in hand.** `readComponentFile` evaluates each member, computes its selection, and resolves its groups for that selection, before the tree is bound. Its warnings reach both the check (`toghen-figma check`) and a run's report. *Checked*: `shared/components/index.ts:90`; `main/components/file.ts:164`, `:208`. *Status*: Confirmed
- **F5. The check's folded-part error is the mirror case.** Naming a part token that a fold took into the rest's variable is an error that names the rest. It reads every member's names merged, with no selection. *Checked*: `main/components/file.ts:236`, `:243`. *Status*: Confirmed
- **F6. kdlet checks that a guard's name is in scope when it reads the file.** The error is kdlet's own text, `no guard named "<name>" is in scope here; …`. It is raised by `read`, before Toghen knows any axis. *Checked*: `node_modules/kdlet/dist/index.js:41`, `:167`. *Status*: Confirmed
- **F7. kdlet lets a host supply the body of a guard the file declares without one.** `evaluate` takes `guards`, by name, each a function of the inputs. *Checked*: `node_modules/kdlet/dist/index.d.ts:211`. *Status*: Confirmed
- **F8. Component files and artboard files refuse a guard with no body today.** The reason given is that the file has no host. *Checked*: `shared/components/validate.ts:337`, `shared/components/artboard.ts:37`; `component-files.md:277`. *Status*: Confirmed
- **F9. Members are evaluated with the axis values as inputs, and no host guards.** *Checked*: `shared/components/members.ts:94`. *Status*: Confirmed
- **F10. Axes taken from the parts are VARIANT properties marked `part`, filled in after the file is read.** A declared axis of the same name is marked `part` and keeps its declared values. *Checked*: `shared/components/axes.ts:169`–`:218`; `shared/components/index.ts:98`. *Status*: Confirmed
- **F11. lib refuses a key that is a value of two axes in one parts vocabulary.** So a part key names one axis among the part axes. A declared axis can still hold the same value as a part axis. *Checked*: `lib/src/core/collection.ts:881`. *Status*: Confirmed

## User Scenarios & Testing *(mandatory)*

### A guard for a part key is declared by name only (Priority: P1)

A design system's component takes a `selection` axis from its group's parts. Its file writes `guard selected` and then `when selected primaryAxisAlignItems=MAX`. Toghen supplies the body, and the selected members put the knob at the end.

**Why this priority**: it is the ruling taken on the second issue, and it removes the most common guard a parts-driven component needs.

**Independent Test**: a synthetic group with one part axis; a file that declares the bodiless guard; the selected member has the field, the rest member does not.

**Acceptance Scenarios**:

1. **Given** a group whose parts give an axis `selection` with `selected`, **When** the file writes `guard selected` with no body and uses it in a `when`, **Then** the file reads, and only the `selection=selected` members take the `when`'s fields.
2. **Given** the same file, **When** the guard is written with a body, **Then** the written body is used, as today.
3. **Given** a bodiless guard whose name is no part key of the component, **When** the file is read, **Then** it is refused, and the message says a bodiless guard is supplied only for a part key, naming the part keys there are.

### The error for an undeclared part key says what to write (Priority: P1)

The same file writes `when selected` with no guard line. The read fails as today, and the message adds that `selected` is a value of the axis `selection`, taken from the parts of the group, and that `guard selected` declares it.

**Why this priority**: kdlet checks the name before Toghen knows the axes (F6), so the guard line stays. The hint is what saves the round trip.

**Independent Test**: the same synthetic group; a file with `when selected` and no guard; the problem's message carries the hint, at kdlet's line and column.

**Acceptance Scenarios**:

1. **Given** a `when` naming a part key with no guard in scope, **When** the file is read, **Then** the error keeps kdlet's text and adds the axis, the group and `guard selected`.
2. **Given** a `when` naming something that is no part key, **When** the file is read, **Then** the error is kdlet's alone.

### A token named outright that a part would replace is warned of (Priority: P2)

A text in a parts-driven button writes `fills "{button.color}"`. In each member whose selection gives its own `color` (the disabled ones), the check warns once for the file, naming the token, the members and the token the selection gives.

**Why this priority**: today the output is quietly wrong. A warning, not an error, since naming the rest is sometimes meant.

**Independent Test**: a synthetic group with an axis left in the path and a part group that gives `color`; a file naming `{button.color}` outright; the warning lists the disabled members and `button.disabled.color`.

**Acceptance Scenarios**:

1. **Given** a member whose selection gives its own token for the key, **When** the file is checked, **Then** a warning says the reference names the rest, which member skips which token, and that `tokens=` would follow it.
2. **Given** an axis that is folded, **When** the same reference is checked, **Then** no warning: the folded parts are modes of the rest's variable.
3. **Given** a layer bound with `tokens=`, or a reference already naming the part's token, **When** checked, **Then** no warning.
4. **Given** several members skip the same token for the same reference, **When** checked, **Then** one warning names them all.

### Edge Cases

- A part key that is also a value of a declared axis: the bodiless guard is refused, since its meaning would be ambiguous; the author writes the body.
- `rest` as a bodiless guard name: refused, since every part axis has it.
- A bodiless guard inside a `define`: still refused. Inside a definition `(input)` reads a parameter, not an axis (`validate.ts:343`).
- A file read with no design system: the part axes are unknown, so a bodiless guard cannot be supplied. The existing "needs the design system" problem already stops the file (`axes.ts:165`).
- An artboard file: still refuses a bodiless guard. It takes no axes from tokens.
- A token whose parent is a part group, not a component group (`button.disabled.color` written in a `when`): no warning, since it already names a part.
- Tokens in the structured W3C shapes: the synthetic group's colours are `{colorSpace, components}` and its dimensions `{value, unit}`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A component file MUST accept a guard with no body when its name is a value, other than `rest`, of exactly one VARIANT axis and that axis is a part axis. Toghen supplies the body: the axis's input equals the name.
- **FR-002**: Any other bodiless guard MUST still be refused, with a message that says when a body is supplied and lists the part keys.
- **FR-003**: When kdlet's read reports a guard not in scope whose name is a part key of the component, the error MUST add the axis, the group and the line to write.
- **FR-004**: For each member, a token reference written outright on a layer MUST be compared with what the member's selection gives for the same key in the token's parent group. When they differ, the read MUST warn, once per reference and file, naming the members and the token each skips.
- **FR-005**: The warning MUST NOT fire for a folded axis, a field inferred from `tokens=`, or a reference that already names the selected token.
- **FR-006**: `component-files.md` MUST say both: when a guard's body is supplied, and that a reference written outright names one variable, follows a folded axis through its modes, and does not follow an axis left in the path.

## Success Criteria *(mandatory)*

- **SC-001**: `pnpm check` passes in figma.
- **SC-002**: The plugin builds, and its output holds no `[object Object]` and no unresolved `toghen(`.
- **SC-003**: Every acceptance scenario above is a test with synthetic tokens.

## Assumptions

- The hint matches kdlet's message text (F6). kdlet's problems carry no code. If kdlet changes its wording, the hint's test fails, which is where the coupling should show.
- The warning lives in the read (F4), not beside the folded-part error in the check (F5). The read has each member's selection and the design source, so no names need splitting per member, and a real run reports the warning too.

## Questions *(mandatory when a decision is open)*

1. **How much does Toghen supply of a guard for a part key?**
   - *Context*: kdlet checks a guard's name when it reads the file, before Toghen knows the axes (F6, F7).
   - a. The body only: the file declares `guard selected`, and Toghen supplies the body. One repository. *Recommended*: every guard stays visible in the file.
   - b. Name and body: `when selected` with no guard line. Needs a kdlet release that takes the host's guard names at read time.

2. **Is the warning for a token named outright part of this feature?**
   - *Context*: both issues touch the component-file check and the same doc.
   - a. Yes, one feature. *Recommended*: one pass over shared ground.
   - b. A feature of its own.

## Answers (29 October 2026)

1. a. The body only.
2. a. One feature.
