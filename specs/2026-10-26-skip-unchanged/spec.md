# Feature Specification: Skip a set or an artboard whose inputs have not changed

**Feature folder**: `specs/2026-10-26-skip-unchanged`

**Created**: 26 October 2026

**Status**: Ready

**Input**: User description: "Plan the fingerprints as well." A sibling consumer asked that a run leave alone, without reading it, a component set or an artboard whose inputs have not changed, so that a check that three large files are in step answers in seconds.

## Findings *(mandatory)*

- **F1. A run reads the FigCraft file once, then again only where a write reached.** Built in 0.1.3. The first set or artboard reads every page; later ones read again only the top-level layers a write touched, with those holding an instance of a changed component. *Checked*: `cli/figcraft.ts:519` (`refreshPages`), `cli/figcraft.ts:255` (`touchedBy`). *Status*: Confirmed
- **F2. That one read is still the whole file.** Before planning anything, the first component command reads every layer of every page. On 9,686 layers in 80 artboards a dry run takes 2.7 s, measured against `figcraft-cli` 0.10.0; most of it is that read and the views built from it. The reporter's largest file has about 53,000 layers. *Checked*: `cli/figcraft.ts` (`loadScene`, the `whole` branch). *Status*: Confirmed
- **F3. Every set and every artboard is compared layer by layer.** A set's or an artboard's plan comes from a snapshot of all its stamped layers and their receipts, then a diff against the file. Nothing lets a run decide "unchanged" without the snapshot. *Checked*: `main/components/run.ts:145` and `:224`, `shared/components/diff.ts:519` and `:532`. *Status*: Confirmed
- **F4. A stamp holds what a node is and what Toghen last saw of it, not what it was built from.** A stamp holds the node's identity, its own id, a receipt per field (a hash of what FigCraft or Figma reported after the write), and where a set or artboard was placed. No stamp records the inputs. *Checked*: `main/components/stamp.ts:62`. *Status*: Confirmed
- **F5. The comparison is what finds a change made by hand.** A field whose value no longer matches its receipt is reported as changed in Figma and left alone. A run that skips the comparison would not see such a change. *Checked*: `shared/components/diff.ts` (the drift rows, `--overwrite-drift`). *Status*: Confirmed
- **F6. A set's or an artboard's inputs are more than its file.** What a run writes depends on the component or artboard file, on kdlet's expansion of it (includes, guards, `--input`), on the resolved tokens it names in every mode it pins, on the components it instantiates (locally or through the lock, `--use`), and on Toghen's own code. *Checked*: `main/components/resolve.ts:309` (`locateComponent`, the lock), `cli/main.ts:78` (`--input`, `--use`). *Status*: Confirmed

- **F7. Measured by the reporter on 0.1.4, their three files.** Bench library `sync`, nothing changed: 11 s (was 46–49 s). UI library `sync`, 129 components and 1,784 variables, nothing changed: 2 min 45 s. All 129 artboards, about 53,000 layers, three changed: 9 min 8 s (was 43–45 min). A dry run of all three files: 3 min 29 s (was about 20 min). They still ask for the fingerprints: the UI library run and the full artboard run are now the long ones. *Checked*: the reporter's comment on the GitHub issue, 26 October 2026. *Status*: Confirmed

## User Scenarios & Testing *(mandatory)*

### Checking that a large file is in step, in seconds (Priority: P1)

A design system's maintainer runs a dry run in continuous integration after every change, to check that the design files match the repository. Today it reads every layer of each file. With fingerprints, a set or an artboard whose inputs are what they were when it was last built answers "in step" from its stamp alone.

**Why this priority**: it is the check the reporter runs most, and the one that blocks their work daily.

**Independent Test**: build a file of many artboards, change nothing, dry-run with fingerprints: the run reads only the top-level layers' stamps, and reports every set and artboard as in step.

**Acceptance Scenarios**:

1. **Given** a file built by 0.1.4 and no input changed, **When** a dry run with fingerprints runs, **Then** it reads no layer below the top level and plans nothing.
2. **Given** one artboard file changed, **When** the same dry run runs, **Then** it reads and plans that artboard only.
3. **Given** a token's value changed, **When** the same dry run runs, **Then** every set and artboard that uses the token is read and planned, and the others are not.

### A run that rebuilds only what changed (Priority: P2)

After changing two component files, a real run writes those two sets, the artboards that show them, and nothing else, without reading the rest.

**Why this priority**: it shortens every real run, but a real run after 0.1.3 is already bounded by FigCraft's own time for each write.

**Independent Test**: build, change one component file, run: only that set and the artboards that instantiate it are read and written.

**Acceptance Scenarios**:

1. **Given** one component changed, **When** a run runs, **Then** that set and each artboard holding an instance of it are read and planned; the others are skipped by fingerprint.

### Edge Cases

- A stamp written before fingerprints existed has none: the set or artboard is read and compared, as today, and gets a fingerprint when next written.
- A component in a library changed (a new lock entry, `--use`): every artboard that instantiates it must be read.
- A change made by hand in the file, with no input changed: fingerprints alone do not see it (see the drift question).
- Toghen itself changed (a new version that writes differently): its version is part of the fingerprint, so a new version reads everything once.
- A token in a structured W3C shape (`{colorSpace, components}`, `{value, unit}`, a `fontFamily` array): the fingerprint hashes the resolved value as the run would write it, not the source text.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A set's or an artboard's stamp MUST hold a fingerprint of everything that decides what the run writes for it (F6), written when the run writes it.
- **FR-002**: A run MUST read a set's or an artboard's layers when its fingerprint is missing or differs.
- **FR-003**: A run MUST NOT write a set or an artboard whose fingerprint matches, whatever mode it runs in.
- **FR-004**: The report MUST say, for each set or artboard left alone by fingerprint, that it was, so a reader never takes "skipped" for "checked".
- **FR-005**: Whether a matching fingerprint also skips the reading, and so the check for changes made by hand, is decided by the drift question below.

### Key Entities

- **Fingerprint**: a hash, on a set's or an artboard's stamp, of the inputs that decide what a run writes for it: its expanded members, the resolved values and variables they bind in each mode, the components it instantiates by key, and Toghen's version.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: on a synthetic file of 9,686 layers in 80 artboards, a dry run with nothing changed and fingerprints in use takes under one second, against 2.7 s in 0.1.3.
- **SC-002**: the same dry run with one artboard changed reads that artboard's layers and no other artboard's.
- **SC-003**: the gate commands pass, and a test in the structured token shapes shows a token's value change invalidates exactly the sets and artboards that use it.

## Assumptions

- The fingerprint lives on the set's or artboard's own stamp, so a copy a person makes carries it and is told apart as it is today, by the stamp's id.
- The Figma target gets the same fingerprints: the engine is shared, and a run in Figma pays for reading layers too.
- The reporter measures 0.1.3 on their files before this is built; the measurement may make this feature unnecessary.

## Questions *(mandatory when a decision is open)*

1. **Should fingerprints be built now, or after the reporter has measured 0.1.3?**
   - *Context*: 0.1.3 removed the cost that grew with the square of the file's size. A dry run of 9,686 layers went from 53 s to 2.7 s. The reporter has now measured (F7): their check went from about 20 min to 3 min 29 s, and a full artboard run is 9 min; they still ask for fingerprints. Fingerprints add a hash that must cover every input (F6); one input left out means a change the run never sees.
   - a. Wait for the measurement: build only if a check of their files still takes more than they can wait. Costs a round trip with the reporter. *Recommended*: the remaining cost may be small enough, and a missed input is a silent wrong answer.
   - b. Build now: the fastest check sooner, at the risk of building what is no longer needed.

2. **When a fingerprint matches, should the run still look for changes made by hand?**
   - *Context*: only the layer-by-layer comparison finds a change made by hand (F5). Skipping it is where all the speed comes from. Today Toghen always reports such a change and never overwrites it unasked.
   - a. Default as today, and an opt-in flag that trusts the fingerprints and skips the reading: a check that is fast when asked for, and safe when not. *Recommended*: keeps today's promise by default, and gives continuous integration its fast check.
   - b. Trust the fingerprints by default, and an opt-in `--check-drift` that reads everything (the reporter's proposal): fast by default, but a change made by hand goes unseen unless asked for.
   - c. Trust the fingerprints only in a dry run: a check is fast, a real run is safe. Two behaviours for one flag-less command, which is harder to explain.

3. **What does the fingerprint hash: the inputs as written, or what the run would write?**
   - *Context*: hashing the files and the token documents as text is simple, but any edit to a shared token file would invalidate every set and artboard. Hashing what the run would write (expanded members, resolved values per mode, component keys) invalidates exactly what changed, but means resolving before deciding to skip, which costs a little time for each set and artboard.
   - a. What the run would write, after kdlet and resolution, before any reading of the file. *Recommended*: exact, and resolution is cheap next to reading layers (under 0.3 s for 80 artboards in the profile).
   - b. The inputs as written: cheapest, but coarse, and an include or a lock change must be added by hand to the list.

## Answers (26 October 2026)

1. b. Build now: the reporter's measurement (F7) shows the UI library run and the full artboard run are still the long ones.
2. a. Today's full check stays the default; an opt-in flag trusts the fingerprints and skips the reading.
3. a. The fingerprint hashes what the run would write, after kdlet and resolution.

