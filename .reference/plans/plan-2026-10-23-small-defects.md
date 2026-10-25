# Plan: the small defects the skills research found (23 October 2026)

Writing the three skills on 23 October found defects in Toghen that the skills now teach as they are (`toghen-skills/decisions.md`, *What the writing found*; `.reference/skills-research/pipeline-2026-10-23.md`, section 7; `figma-docs-2026-10-23.md`, *Contradictions with Toghen's docs*). This round fixes what is small, says which items are not small, and updates the skills once the fixes land. Every finding below was checked against the code on `main` at figma 6.3.0, lib 5.1.0, postcss 0.20.0, query 0.1.0.

## 1. Findings

### 1.1 The pairing hint names a pane that does not exist

**Confirmed.** `pairUp` in `cli/run.ts` (from line 179) prints, at lines 211 and 214, *type the code under "Command line" on its System pane*. There is no System pane, and no "Command line" heading either:

- The tab strip is **Load · Sync · Tokens · Apply · Build** (`ui/components/tabs.js:19–23`).
- The code field is in the Load pane's **Source** card (`sourceCard` and `commandLineBlock` in `ui/components/pane-load.js:60–99`), with the placeholder *Code from toghen-figma* and a **Connect** button.
- The card is at the foot of both states of the pane, loaded or not (`ux-map.md`, *Load* and *Source card*).
- `guide.md:62` and `guide.md:785` already say it right: *the Source card at the foot of the Load pane*, then **Connect**.

The "System pane" is the Design System pane's name before the 22 October split. R8's spot was amended then (`ux-rulebook.md:81–84`), and this string was missed. No test asserts the hint: `test/cliRun.test.ts` matches only `Pairing code: (\S+)`.

### 1.2 `toghen-query check` exits 0 when it finds problems

**Confirmed, and wider than `check`.** `main` in `toghen-query/src/main.ts:47–52` prints a one-shot answer and returns 0 whatever it was. So `check` exits 0 with problems listed, and so does an `error:` answer (a path the core does not have) or a usage error. Only two things exit otherwise:
- a session, 1 when its replay differs (line 42);
- a load that throws, 2 (line 72).

What the rule allows. The package "computes no semantics" (`specs.md`, *The one rule*): no walking a value, no comparing modes. An exit code that reads *what kind of answer came back* computes nothing:
- `ask` in `src/query.ts:31–45` already sorts every answer into `answer`, `error`, `usage` or `unknown`;
- the core's `check` is documented as "what is wrong with the collection's tokens" (`toghen-lib/src/core/collection.ts:893–896`), so a non-empty list is the core's own word that something is wrong.

What would be a decision. **Collisions** come from `load`, not `check`, and the core calls that report advisory (`toghen-lib/reference.md`, *Collisions*: the last source still wins). The plugin shows a redundant one as a quiet note and any other as a warning (`main/handlers/loadDocument.ts:102–113`). So whether a collision fails the exit code is a choice (question 1).

Sessions are the spec, but a session holds a transcript, not an exit code. The one-shot's exit code belongs with `test/ways-in.test.ts`, which runs the command as a process and already asserts `status`. No session changes.

One trap: `help` is answered with the kind `usage` (`query.ts:33`), so "a usage error exits 1" must leave `help` out.

### 1.3 Export to DTCG has no command

**Confirmed, and the gap is recorded wrongly.** The skill (`pipeline/SKILL.md:282`, `:324`) and the research both call it "export Figma back to DTCG". It is not that. `EXPORT_DOCUMENT` (`main/handlers/exportDocument.ts:23–100`):
- resolves the **loaded resolver document** at one combination of contexts (`resolver.resolveToDesignSystem`);
- writes it with `exportToJSON` (`main/engines/ioAdapter.ts:31`), a pure function;
- with `$extensions` ticked, adds the stamps this file's variables and styles carry (`stampsByToken`).

It reads no variable's value from Figma. So a command would give a pipeline its own document at one combination, flattened, plus the file's stamps, which "loading a document never reads back" by design (`guide.md:140`). Nothing in it returns from Figma to tokens.

What a command would cost, measured against the code:
- `cli/main.ts`:
  - an `export` command with its flags;
  - the contexts as `modifier=context` words, which the positional parser takes for files today (`isEntry`, line 54);
  - a refusal with `--figcraft`, since FigCraft has no plugin to export.
- `cli/run.ts`: after `LOAD_DOCUMENT`, one `ask({ type: 'EXPORT_DOCUMENT', … }, 'DOCUMENT_EXPORTED')`, then write the JSON. `RunIo` has no `writeFile` yet (`bin.mjs` gives the real one).
- `ui/main.js:163`: every response the main thread posts reaches the screen as well as the socket (`ui/bridge.js:8–11`). So a command-line export would also start a download in the plugin. The fix is to skip the download when `lastAsker()` is the command line (`ui/commandBus.js:10–11`), as the results already do (`ui/main.js:149`).
- A test against the fake plugin, and the docs.

About one unit, paired like `variables`. Not a round of its own, but not free either, and it touches the plugin's screen. Question 2.

### 1.4 `--library` beside a FigCraft flag says FigCraft has no libraries

**Confirmed.** The check and its comment are at `cli/main.ts:98–99`:

> --library and --figcraft do not go together: FigCraft has no libraries to publish or import from

FigCraft 0.10.0 has local libraries (a `.figcraft` file, `library.add`, `library.import`) and lacks only published keys (`.reference/skills-research/figcraft-2026-10-23.md`). The same claim appears in:
- `cli/figcraftApply.ts:146`, the refusal of a component named by key: *in FigCraft, which has no libraries here*;
- `guide.md:818`;
- `specs.md:1600`;
- the test's name at `test/cliRun.test.ts:1226`. Its assertion matches only the message's first words, so it survives a reword.

The refusal itself stays: the FigCraft round ruled that libraries in FigCraft get a round of their own (`plan-2026-10-23-figcraft-finish.md`, answer 2). Only the reason given is wrong.

### 1.5 Twelve places where the docs disagree with Figma's, re-read

Each item from the research, checked against the doc it names. **D** means a doc edit only; **M** means it needs a measurement in the desktop app first.

| # | What | Where | Verdict |
|---|---|---|---|
| 1 | Mode limits per plan | `specs.md:467` gives "4 on Starter … 40 on Enterprise (as Figma documents it)"; `measured_behaviour.md:59` says "not documented anywhere" | **D.** The plans table now gives Professional 10, Organization 20, Enterprise unlimited with extended collections. The REST `POST` still caps a collection at 40. The ruling, 10 for everyone, stands. The research flags that two readings of the table disagree, so the sentence should cite the table by date and leave out Starter. |
| 2 | `clientStorage` quota | `specs.md:717, 725`; `reference.md:305, 513, 521` | **D.** Figma documents 5 MB per plugin, on the local machine, not synced, lost with the plugin id or the cache. "Figma names no quota" is wrong, and "per user" should read "per user, on one machine". The shed-and-retry fallback is right and stays; only the stated reason changes. |
| 3 | Pattern fills | `measured_behaviour.md:159` (§7): "cannot be set" | **D.** Settable since Update 123 (`setFillsAsync`). §7 came from another project's scripts. Leave the line as the record and add a dated note. No Toghen code uses pattern fills. |
| 4 | Vertical wrap | `measured_behaviour.md:320` (§14), heading *Settable where the typings say it throws* | **D.** Documented since Update 140 and typed since 1.141.0. The measurement stands; only the heading is stale. `component-files.md:179` is already right. |
| 5 | `slotContentId` | `measured_behaviour.md:185` (§8) | **D.** Still undeclared in typings 1.142.0, but documented in the *Working with component properties* guide, while Figma's `SlotNode` page omits it. One dated note. |
| 6 | `COLOR_OPACITY` unit | `specs.md:620`; `decisions.md:804` | **D now, M later.** Update 139 defines `COLOR_OPACITY` for colour-opacity pickers and adds composed colours. "Cannot be measured from code" is no longer true: a composed colour can be written and read back. Its unit is still unstated (an example suggests 0 to 100). The refusal stays until measured (question 4). |
| 7 | Display P3, `sourceColor` | the comment in `main/utils/figmaTokenAdapter.ts:60–72` | **D.** Update 141 adds `sourceColor` on paints, gradient stops and effects, not on variables. The limitation stands. The comment gains one sentence: there is now an API that could carry a token's colour space for paints and effects. |
| 8 | Undo | `specs.md:1552`; `measured_behaviour.md:205` | **No change.** The docs say `triggerUndo` reverts to the last commit; Toghen measured it going past the commit in five trials of six. The measurement wins, and the rule "never undo" stays. A one-line note that the docs say otherwise keeps the next reader from "correcting" it. |
| 9 | `teamlibrary` permission | `measured_behaviour.md:368, 386` (§15), still an open question | **D.** The manifest docs say the `figma.teamLibrary` methods throw without it. The manifest already declares it. The question becomes "documented, not measured". Measuring it stays on the desktop list. |
| 10 | Vendored snapshots | `.reference/figma/figma_dev_docs_TOC.md:10–11` (captures of 4 August and 10 March 2026) | **D, or a refresh** (question 3). The captures predate Updates 134–141: composed colours, `COLOR_OPACITY`, custom animation styles, `sourceColor`, vertical wrap, variable fonts. |
| 11 | Typings at 1.139.0 | `toghen-figma/package.json:23` (`^1.139.0`, installed 1.139.0); `specs.md:733` | **Measured for this plan: the bump is clean.** Details below the table. |
| 12 | REST reads shared plugin data | `specs.md:1526–1533` (*Why there is no Figma sign-in*) | **D.** Toghen's stamps and its lock are shared plugin data (`main/components/stamp.ts:103`, `main/utils/shardedData.ts:117`). `GET /v1/files/:key?plugin_data=shared` reads them with a personal token, on any plan. One sentence there. A read-only drift report from CI would be a capability of its own, recorded under *Not in this design* with the need that would bring it in. |

How item 11 was measured. A scratch copy of `toghen-figma` (`main`, `shared`, `cli`, `test`, `scripts`, the three tsconfigs) was built with `@figma/plugin-typings` 1.142.0 from npm, and `tsc --listFiles` confirmed that copy was read. Both configs of `pnpm typecheck` passed with **zero errors**:
- `tsc -p tsconfig.plugin.json`;
- `tsc -p tsconfig.test.json`.

Why nothing breaks. The widened `StyleType` (`'CUSTOM_ANIMATION'`) and `BaseStyle` (`CustomAnimationStyle`) meet two switches with a `default`:
- `reportOf`, `main/utils/tokenStamps.ts:29`;
- `applyStyleProps`, `main/engines/operationExecutor.ts:53`.

And every style list Toghen reads asks for text, effect and paint styles by name (`tokenStamps.ts:68`, `main/components/resolve.ts:667–668`), so a custom animation style never reaches them. The bump is `package.json` and the lockfile.

### 1.6 The smaller ones

- **The fold "never ran in a real file."** **Confirmed stale.** `component-files.md:391` says it; `guide.md:608` and `specs.md:1118` record the live run of 13 October 2026. One sentence, in this round.
- **The migration off `state` modifiers**, "read from the code: no test covers it, and it has not been run in a real file" (`guide.md:668`). Still true, so not a defect. Out of this round.
- **`scripts/expectation-sheet.ts`** (144 lines). **Confirmed:**
  - it builds a `Resolver` from the parsed JSON with no `load` (line 27), so a document whose `$ref`s point at other files does not resolve;
  - it names the base collection `demo` (lines 37, 81);
  - it prints a watch list of the sample's paths (lines 53–62).

  `specs.md:626` presents it as working "for a resolver document" and says to regenerate it before a manual run. Since the command line exists, a dry run prints the plan from the real engines against the real file. Question 5 decides whether it belongs in this round.

### 1.7 The skills

`toghen-skills/plugins/toghen/skills/` teaches defects 1 to 4 as they are today:

**pipeline/SKILL.md**
- line 116: `check` "exits 0 either way";
- line 169: the `--library` message;
- line 196: the "System pane";
- line 282: "Export back to DTCG";
- *Known defects*, lines 318–326.

**The pipeline's other files**
- `pipeline/messages.md`: lines 16, 28, 114, 148;
- `pipeline/commands.md:146–154`: the CI recipe that greps `check`'s output.

**figma/SKILL.md:22**
- "Toghen builds against ^1.139.0".

Each skill's pins (`compatibility`, `metadata`, the *Pinned* table) name figma 6.3.0 and query 0.1.0. The plugin is at 0.2.0 (`.claude-plugin/plugin.json`), and `toghen-skills/specs.md` (*Keeping a skill pinned*) says to bump it with any change to the text.

## 2. Design

**The pairing hint names what is on the screen.** Both lines of `pairUp` say: *Open the Toghen plugin in the target file (each file), type the code into the Source card at the foot of its Load pane, and press Connect.* These are the guide's words, from line 62. No UI change: the card keeps its title and adds no heading. R5 (section chrome must be earned) and the map's *Command line group* ("one field and one button … nothing else") rule out a heading added only so a message can name it. A test asserts that the hint names the Load pane and the Source card, so a rename of either has to change the hint too.

**The FigCraft library message says why.** The new wording: *--library and --figcraft do not go together: a run does not build FigCraft's libraries, which are local files with no published keys*. The refusal of a component named by key says *a component named by its key is not built in FigCraft, whose libraries have no published keys*. The same correction goes into `guide.md:818`, `specs.md:1600`, the comment and the test's name. `decisions.md:1220` is the archive, and gets a dated line instead of an edit.

**`toghen-query`'s one-shot exit code reads the kind of answer** (question 1 recommends this form).
- **0** for an answer;
- **1** for an `error:`, a usage error or an unknown command, and for a `check` whose collection check lists anything;
- `help` exits 0;
- the prompt still exits 0;
- a session's code is unchanged;
- `--json` exits the same as plain text.

How. A form may carry `fails?: (answer) => boolean`. Only `check` has one: true when `incomplete`, `holes` or `nonFactorable` is not empty. `main` returns 1 when `ask` gave anything but an answer, or when the form's `fails` says so. Collisions print as now and do not fail, because the core calls them advisory (question 1).

Where it is written down:
- `specs.md` gains a short *Exit codes* section, beside *The one rule*, saying why this is not semantics: the code reads what kind of answer came back, and the core's own word for `check`;
- `guide.md` gains the codes under *Three ways in*;
- `decisions.md` gains the ruling.

**Export** (question 2). Recommended: no command this round. Instead, correct the record wherever it says "back to tokens":
- the guide's *Export tokens* gains one sentence: it writes the loaded document at one combination, not what the file holds;
- the skills;
- `specs.md`, *Not in this design*, gains the command, with the need that would bring it in.

If question 2 says build it, the unit is as measured in 1.3, run in parallel with the others:

```
toghen-figma export <entry.json>… [modifier=context …] [--extensions] --out <file.json>
```

**Figma's docs.** Each item marked D in 1.5:
- **specs and reference** are edited in place;
- **decisions.md** gains one dated section, *Against Figma's documentation (23 October 2026)*, that lists what changed and why: the archive is added to, not rewritten;
- **`measured_behaviour.md`** keeps every measurement as written, gains a dated section 16 that says what the docs now say about §3, §7, §8, §14 and §15, and gets a pointer "(see §16)" beside each stale line.

The typings go to `^1.142.0`, and `specs.md:733` says the engine was typechecked against 1.142.0 on 23 October 2026.

**The skills, last.** When the fixes have landed:
- the defects come out of *Known defects* and out of every line listed in 1.7;
- the CI recipe in `commands.md` relies on the exit code, with the `collisions` grep kept as an optional stricter step;
- every pin names the versions this round publishes;
- the plugin goes to 0.3.0;
- `toghen-skills/decisions.md` gains a dated line: the four defects fixed, and in which versions.

## 3. Units

Units 1, 2 and 3 touch different files, except `specs.md` and `guide.md`, which units 1 and 3 edit in sections far apart. They run **in parallel**. Unit 4 runs **last**, once they are merged and the versions are known.

1. **The command line's words** (defects 1 and 4).
   - Files:
     - `cli/run.ts` (`pairUp`);
     - `cli/main.ts` (lines 98–99);
     - `cli/figcraftApply.ts` (line 146);
     - `test/cliRun.test.ts`: the hint names the Load pane and the Source card; the test name at 1226;
     - `guide.md:818`, `specs.md:1600`, and a dated line in `decisions.md`.
   - Done when the tests are green, and no "System pane" or "FigCraft has no libraries" is left outside the archive (`decisions.md`, the plans).
2. **`toghen-query`'s exit code** (defect 2).
   - Files:
     - `src/commands.ts`: `fails` on the `Form` interface and on `check`;
     - `src/main.ts`: the one-shot return;
     - `test/ways-in.test.ts`: one test per code. A clean `check` on the running example exits 0; `check` on `sessions/fixtures/broken.resolver.json` exits 1; an `error:` exits 1; `help` exits 0; the prompt with an error in it exits 0. The fixtures already hold every case;
     - `specs.md`, `guide.md`, `decisions.md`.
   - Done when `pnpm --filter @toghen/query test` is green and every session replays unchanged.
3. **Figma's docs and the typings** (defects 5 and 6).
   - Files:
     - `package.json` and `pnpm-lock.yaml` (the typings);
     - `specs.md`: 467, 620, 717, 725, 733, 1526–1533, *Not in this design*;
     - `reference.md`: 305, 513, 521;
     - `decisions.md`: the dated section;
     - `component-files.md:391`;
     - the comment in `main/utils/figmaTokenAdapter.ts`;
     - `.reference/figma/measured_behaviour.md`: section 16 and the pointers;
     - `.reference/figma/figma_dev_docs_TOC.md`: question 3;
     - `specs.md:626` and the script: question 5.
   - Done when `pnpm typecheck`, `pnpm test` and `pnpm build` are green on the bumped typings; the plugin is rebuilt and its stylesheet holds no `[object Object]` and no unresolved `toghen(`; and each of the twelve items is either edited or answered by a line that says why not.
4. **The skills** (after 1–3 and the version bump).
   - Files:
     - `pipeline/SKILL.md`, `messages.md`, `commands.md`, `example.md` (if its `check` line changes);
     - `figma/SKILL.md`, and the pins in all three skills;
     - `.claude-plugin/plugin.json` (0.3.0);
     - `toghen-skills/decisions.md`.
   - The versions it pins: **figma 6.3.1** (a message and docs; the typings are a dev dependency), or 6.4.0 if question 2 builds the command; **query 0.2.0** (an exit code changes behaviour). The coordinator confirms them at the bump.
   - Done when every line of 1.7 is gone or rewritten, and the pins match `package.json`.

## 4. Risks

- **A script that runs `toghen-query` one-shot and ignores its output** starts failing on an error it used to swallow. That is the point, and there is one user. The guide and the skill say so.
- **"Collisions do not fail"** surprises someone who reads `check` as one report. The guide says it in one sentence, and the skill keeps the stricter grep.
- **The pairing hint is matched by people and agents, not by code.** `cliRun.test.ts` matches only `Pairing code:`, and the skills match the first line. Changing the second line breaks nothing that parses.
- **The typings bump is clean today.** The next one may not be: a new `StyleType` member reaches the two switches' `default`, which throws in `applyStyleProps`. Only a style Toghen fetched by id could get there, and Toghen fetches styles by kind. Left as is.
- **Doc edits drift from the research's wording.** Each D item cites Figma's page and date, as the research did, so the next check can find it.

## 5. Questions

1. **What `toghen-query` exits with.** A one-shot exits 0 whatever it prints. The package computes no semantics, so the code can only read what the core already said.
   - (a) 1 for an `error:`, a usage error, an unknown command, or a `check` whose collection check lists anything; 0 otherwise, `help` included. Collisions do not fail, as the core calls them advisory. The prompt and sessions are unchanged.
   - (b) As (a), and a non-redundant collision fails too. The plugin shows those as warnings, but the core calls them advisory, so this would be the package's own ruling.
   - (c) No change to the code. The guide shows a `--json` recipe (`jq -e`) for CI.

   Recommended: (a). It reads only the kind of answer and the core's own word for `check`, and it makes the command usable in CI on its own.
2. **An export command.** The plugin's Export writes the loaded document at one combination, plus the file's stamps. It reads nothing back from Figma (finding 1.3).
   - (a) Not this round. Correct the record ("back to tokens" is wrong) in the guide, specs and skills, and name the command under *Not in this design* with the need that would bring it in.
   - (b) This round, one unit in parallel: `toghen-figma export … --out <file>`, paired like `variables`, refused with `--figcraft`, the plugin not downloading when the command line asked. figma becomes 6.4.0.
   - (c) Its own round, as a real round trip: reading the file's variables back into DTCG, which no screen does today.

   Recommended: (a). A pipeline already holds the document. The command would add only one combination flattened and stamps that are never read back, and it costs a change to the plugin's screen.
3. **The vendored Figma snapshots,** captured before Updates 134–141.
   - (a) A dated note at the top of the index, naming the updates and the pages they touch. Refresh when someone next works on variables or styles.
   - (b) Refresh the variables, styles and data-types pages now, as a research unit in parallel.

   Recommended: (a). Nothing in this round or the open list works on variables, and the research file already holds the differences with their sources.
4. **`COLOR_OPACITY`'s unit,** now measurable by writing a composed colour and reading it back, in the desktop app.
   - (a) This round edits the docs only: the unit is stated nowhere and is measurable now. The measurement joins the desktop list beside the `teamlibrary` permission and keys after a republish.
   - (b) Measure it this round in the test file, then allow the scope.

   Recommended: (a). It needs the desktop app and a person, and no consumer has asked for the scope.
5. **The expectation sheet** reads only a bundled document, names its base `demo` and watches the sample's paths.
   - (a) Not this round. Correct `specs.md:626` to say what it reads: a bundled document, the base `demo`, the sample's rows.
   - (b) Fix it this round, about 30 lines: `load` the entry, take the base from `--collection` or the document's name, and print every variable instead of the watch list.
   - (c) Delete it. A dry run of `toghen-figma variables` prints the plan from the real engines against the real file, and `toghen-query value … across` prints every mode's value.

   Recommended: (a), or (c) if you no longer use it. Nothing has needed it since the command line arrived, and fixing a tool nobody runs is building for later.

## Answers (23 October 2026)

1. **(a)** A one-shot `toghen-query` exits 1 for an `error:`, a usage error, an unknown command, or a `check` whose collection check lists anything; 0 otherwise, `help` included. Collisions do not fail. The prompt and sessions are unchanged.
2. **(a)** No export command this round. The record is corrected wherever it says "back to tokens", and the command is named under *Not in this design* with the need that would bring it in.
3. **(a)** A dated note at the top of the snapshots' index; a refresh waits until someone next works on variables or styles.
4. **(a)** `COLOR_OPACITY`: the docs only. Its measurement joins the desktop list.
5. **(a)** The expectation sheet stays as it is; `specs.md` says what it reads.
