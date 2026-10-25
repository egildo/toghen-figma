# Plan: the nine open issues (24 October 2026)

**Part 2 of the round of 24 October 2026.** Part 1, lib computes every value it can, is in [toghen-lib/plan-2026-10-24-computed-values.md](https://codeberg.org/Toghen/lib/src/branch/main/.reference/plans/plan-2026-10-24-computed-values.md). Questions are numbered across both files: 1 to 5 there, 6 to 11 here.

**Provenance.** Issues #123 to #131, filed today by Egildo from a downstream design system that runs `toghen-figma` 6.4.1, live into Figma and headless into FigCraft 0.10.0. The consumer's names (its project, its components, its token paths) appear in this file only as provenance. Code, tests, fixtures and docs use synthetic names, as CLAUDE.md requires.

Every finding was checked against `main` at figma 6.4.1. Paths are under `toghen-figma/` unless they say otherwise.

## Rulings (24 October 2026)

Egildo answered every question of both plans and vetoed none of the 24 settlements (11 here, 13 in the lib plan); they all stand. Questions 1 to 5 (1a, 2b, 3a, 4b, 5a) are ruled in the [lib plan](https://codeberg.org/Toghen/lib/src/branch/main/.reference/plans/plan-2026-10-24-computed-values.md#rulings-24-october-2026).

- **6b.** A literal brace is written doubled: `{{size.sm}}` is the text `{size.sm}`.
- **7a.** A first dry run checks only a pending component's name; its properties and slots are checked on the run that builds it, and the dry run says so once per component.
- **8a.** A paint bound to a variable is compared by its variable only.
- **9a.** `check` refuses a bound `width`/`height` beside `HUG` or `FILL` on the same axis, naming both fields and the token.
- **10b.** A library collection's mode is built for FigCraft now; Figma refuses it with a sentence until it is measured.
- **11b.** The "handled in the other sync" rows are dropped from both plans.

## Summary

| # | Issue | Unit | Wave | Depends on |
|---|---|---|---|---|
| 123 | A shadow with `color-mix()` colour; a skipped style says why | Lib plan (L1, L3, F1) and **A** | 1–3 | Part 1 |
| 128 | A plan prints its skips grouped by reason | **A** | 1 | — |
| 124 | `check` says how to name a folded state | **B** | 1 | — |
| 125 | `check` refuses `#null` for a size | **B** | 1 | — |
| 127 | An unchanged run into FigCraft writes nothing | **D** (and **A** for the trail, **B** if question 9 is (a)) | 1 | — |
| 129 | A data file can hold a literal brace | Lib plan **L5**; F1 tests it | 1 | — |
| 126 | An artboard can pin a library collection's mode | **F** | 2 | D (shares the FigCraft fake) |
| 131 | A first dry run counts components the same run would create | **C** | 3 | A (CLI files), F (`resolve.ts`) |
| 130 | An artboard can size an instance | **G** | 3 | F (`figcraftApply.ts`) |
| docs | All figma docs of the round | **D-figma** | 4 | everything |

## 1. Findings and design, issue by issue

### 1.1 #123: a shadow whose colour is `color-mix()`

**Findings.** `toEffectStyleProps` (`main/utils/figmaStyleAdapter.ts:211`) calls lib's `normalizeColorToSRGB01` (`:220`), which throws on any colour string not starting with `#` (`toghen-lib/src/utils/normalize-color.ts:67`). The throw is caught in the style plan (`main/engines/styleSyncEngine.ts:333-342`) and kept as a SKIP, *cannot be built in <mode>: String color values must be CSS hex strings.*, but the skip is not `reported`, so the command line counts it and prints nothing (`cli/run.ts:165-173`). The reason names neither the token (only `path` does) nor the value.

The issue says lib "already resolves that colour for a variable". It does not: the variable path calls the same function (`main/utils/figmaTokenAdapter.ts:81`) and would skip it the same way. What the reporter saw is that a colour token whose value is the mix is refused a `figma.value` key, because `sum.ts:497` sees a value the type allows.

**Design.** Part 1 makes the value computable (lib plan, units L1 and L3): the shadow resolves to a structured colour at alpha 0.05, and the effect style builds. Unit F1 (lib plan) proves it with a synthetic shadow in the structured shapes. Unit A here makes any remaining style skip print its reason. `figma.value` on a shadow is not built (lib plan, settlement 13).

### 1.2 #128: skips grouped by reason

**Findings.**

- A SKIP is `{ kind: 'SKIP'; reason: string; path: string; message?; reported?: true }` (`shared/operations.ts:121-136`). The reason is free text that embeds per-token detail (`cannot be built in light: …`), so nothing can group on it.
- The variable plan (`main/engines/variableSyncEngine.ts`, `buildPlan`) skips at `:204` (a copy, reported), `:237` (unsupported type), `:241` (*style-type (handled in style sync phase)*, one per style token), `:254` (refused routing, reported), `:264-266` (closed collection, type conflict), `:275` (*cannot be written in <ctx>*, one per cell), `:366-371` (unchanged, drifted). `summarizePlan` (`:505-520`) counts only `skips` and `drifted`.
- The style plan (`main/engines/styleSyncEngine.ts`, `buildPlan`) skips at `:298-304` (unsupported type), `:307-313` (*variable-type (handled in variable sync phase)*, one per variable token: most of the reported 2050), `:337-341` (cannot be built), `:354` (no font family, reported), `:384` (unchanged), `:388-395` (drifted), `:423` (a copy, reported). `summarizePlan` at `:429-438`. At execute, `main/handlers/executeStyleSync.ts:17-40` turns a font that fails to load into a reported skip.
- `main/engines/batchRunner.ts:93-102` turns every SKIP, WARNING, BREAKING and NOTE into a `status: 'skipped'` result, so the `skipped` count after execute counts warnings and notes too: one count under two names (R14).
- The command line prints `${s.skips} skips` (`cli/run.ts:152-162`), then only reported and drifted skips (`:165-173`), and `applied · skipped` after execute (`:444-448`). There is no `--verbose` (`cli/main.ts:69-76`).
- The plugin's screen draws one `SKIP` row per skip (`ui/components/results.js:83-87`), with one `skip` filter chip (`:173`).
- Binding rules: **R14** (`ux-rulebook.md:128-139`): one event, one row; a count is not reported twice under two names; enforced in what the plan emits. **R4** (`:39-46`): a reported problem is separable at a glance, *"a warning buried in eighty identical-looking skips is a warning nobody reads"*. **R12** (`:112-118`) on truncation.

**Design.**

- **A skip carries a cause.** `SKIP` gains `cause`, one of a closed set: `unchanged`, `drifted`, `copy`, `unsupported-type`, `refused-routing`, `closed-collection`, `type-conflict`, `cannot-write` (variables), `cannot-build` (styles), `no-font`, `font-not-loaded`. The `reason` stays the sentence, and now names the token and the context in its own words (`"shadow.raised" cannot be built in light: …`).
- **The other-phase rows** (*handled in style sync phase* and its twin) are question 11.
- **The summary** keeps one count per cause: `PlanPayload.summary` (`shared/protocol.ts:269-273`) gains `skipsByCause`. Nothing is counted twice: `skips` is the sum.
- **The command line** prints `variables plan: 3 creates · 0 updates · 239 skips (180 unchanged · 40 cannot be written · 19 unsupported type)`. The quiet causes (`unchanged`) are counted and not listed. Every other cause is a problem: its rows are printed, at most ten per cause, then *…and 31 more; --verbose lists them* (R12: the counts are never cut, the list is). `--verbose` on `variables`, `components` and `sync` lists every skip, quiet ones included.
- **After execute**, `skipped` counts SKIP rows only; warnings and notes keep their own counts (R14).
- **The screen** does not change: one row per skip, as R14 requires. The cause is in the operation for any later use.

### 1.3 #124: `check` and a folded state

**Findings.**

- `check` (`cli/check.ts:24`) builds the resolver and the sum (`:29`, `resolveSumModes`) and calls `checkComponents(files, { names: true }, design)` (`main/components/file.ts:140`). The name test is `file.ts:162`: a name passes if `getNodeKind(path) === 'token'`. `{button.plain.hover.color}` is a token, so it passes.
- The fold is the parts vocabulary, not a modifier: `main/utils/folds.ts:61` `foldsOf(collection, paths, unfold)` decides per component and axis (it does not fold under `layout=parts`, when a token carries this axis with one already folded, when the twin is missing, or past `MAX_MODES`, `:84-92`). `foldTokens` (`:130`) drops the part tokens it folds (`:153`), except a part a modifier varies, which keeps its own variable (`:152`). It runs in `buildSum` (`main/utils/sum.ts:286-310`), giving `tokenByPath`.
- All of it is pure (`folds.ts`, `sum.ts`, `resolverModes.ts`, `tokenPath.ts` import only lib and local modules) and depends on the resolver document plus the `unfold` list, which comes from the files `check` reads. No Figma state.
- `setUnfolded(resolver, unfold)` runs after the name loop (`file.ts:168`), so today the `layout=parts` list is not known while names are checked.
- `names no variable` comes from `main/components/resolve.ts:461` (`lookVariable`), against Figma's variables; only a dry or real run reaches it.

**Design.** `checkComponents` reads every file's `layout=parts` first, then builds the sum once (`buildSum(resolver, baseName, defaultTokenTypeMap)`), then checks names. A name that is a token of a variable type and is not in `tokenByPath` is a folded part: the error reads *`{button.plain.hover.color}` is the `hover` part of `button.plain.color`, which is one variable with a mode per `interaction`: name `{button.plain.color}`; the member pins the mode (a `tokens=` axis, or `modes interaction=hover`).* The rest path comes from `folds.parts`. Synthetic names in the tests.

### 1.4 #125: `#null` on a size

**Findings.**

- `component-files.md:148`: sizes take *a dimension, or `#null`*; `:264`: *`#null` clears a size*; `:295`: *`#null` sets a size to null*. `specs.md:776` agrees; the only worked example is `minWidth=#null` (`specs.md:843`).
- `shared/components/check.ts:125` accepts `#null` for every field whose value is `size`, `width` and `height` included.
- Figma: `applyFields` (`main/components/apply.ts:312`) reads `literal()` (`:90`) as `undefined` for null, so `width=#null` does nothing at all, silently. The limits are cleared through `writeField` (`fieldWriter.ts:207`).
- FigCraft: `fieldCommands` → `writeDimension` (`cli/figcraftApply.ts:250-255`) sends `node.set { width: null }`, which FigCraft refuses: *width must be a number*.

**Design.** `#null` stays for `minWidth`, `maxWidth`, `minHeight`, `maxHeight`, where clearing has a meaning. On `width` and `height`, `check` refuses it: *`width=#null`: a width cannot be cleared; to let the layer size itself write `layoutSizingHorizontal=HUG` (or `FILL`).* One change at `check.ts:125`, so both targets and the dry run stop before a build.

### 1.5 #127: an unchanged run into FigCraft writes something

**Findings.** The comparison: `loadScene` reads FigCraft with `page.list` and `node.get` (`cli/figcraft.ts:351-367`); `sceneOf` turns each layer into a Figma-shaped node (`cli/figcraftScene.ts:336-582`); `reportedOf` hashes what the view reports (`main/components/receipt.ts:35-63`, `fieldWriter.ts:241, 255`); `expectedOf` hashes what the file would leave (`receipt.ts:147`); `diffMember.patch` (`shared/components/diff.ts:317-329`) writes a field whose expected value differs from the receipt held. If a target always reports a field other than expected, the receipt keeps the reported value and the field is written on every run.

The cause was isolated from the reporter's saved runs (outside this repository), by hashing candidate values with `hashOf` (`diff.ts:121`) and matching them against the stamps in the saved files. Two causes, together accounting for every rewritten member:

1. **A bound paint's alpha depends on the layer's mode.** FigCraft paints a bound colour with the variable's colour in the layer's mode, alpha included, at paint opacity 1; the view reports `opacity = paint.opacity × alpha` (`figcraftScene.ts:203`). `expectedPaint` (`receipt.ts:71-82`) takes the alpha at the declared defaults (`alphaOf`, `fieldWriter.ts:30`). A colour transparent at rest and opaque when selected, on a layer whose member pins `selected`, is therefore patched on every run. That is all four members of the four-member set, and six of the 54 in the larger one. Removing the file's `modes` line did not help, because Toghen leaves a field the file stops naming as it is, so the pin stayed.
2. **A bound `height` beside `HUG`.** `tokens=` binds the component's `height` token to the root and its label while the file says `layoutSizingVertical=HUG` and `textAutoResize=WIDTH_AND_HEIGHT`. FigCraft settles on fixed whatever the order (`figcraftApply.ts:295, 297, 388`). The file contradicts itself, and every member but the bare one, which binds no height, is rewritten: two patches each, 109 steps. Figma probably does the same (`apply.ts:326-329` binds a token height after setting the sizing); not measured.

Ruled out: names and stamp ids (they match), copies (none), `strokeWeight=(literal)1`, the text styles (the bare member uses the same style and is not rewritten).

Also found: **a dry run of a component set always says `0 updated`.** It returns before any apply (`main/components/run.ts:159-164`), and the command line prints `report.updated.length` (`cli/run.ts:483`). Per-step lines are printed only for artboards (`:485-488`). So a freshness check in CI that sums `created/updated/deleted` from a dry run can never see a component rewrite. The steps are in the reply (`report.steps`, `PATCH_LAYER` with its `fields`, `diff.ts:359`).

The fakes hide both causes: the FigCraft fake keeps a bound paint at its written colour (`test/support/fakeFigcraft.ts:544-551`), and binds a height without changing sizing. The closest "second run writes nothing" test is `test/figcraftComponents.test.ts:53-100`; no fixture has a pinned mode on a nested layer with a per-mode alpha, or a height token beside `HUG`.

**Design.**

- The fake first: `variable.bind fills/N/color` paints the variable's value in the node's mode, opacity 1; `variable.bind height|width` sets that axis's sizing to fixed and a text's `textAutoResize` to `NONE`. Two failing tests in `figcraftComponents.test.ts`, each a second run that must write nothing.
- Cause 1 by question 8. Cause 2 by question 9.
- The trail (unit A): a dry run counts `PATCH_LAYER` and the other write steps per member and prints `n would update`; `--verbose` prints `patch <member> <layer>: <fields>` for sets as it does for artboards. A field that cannot be read back is named in that line (*written again every run: FigCraft reports no …*), where a target cannot report one. The text styles' weight is the one known case and is already documented.

### 1.6 #129: a literal brace in a data file

**Findings.**

- A data file is the `--input` document of an artboard (`guide.md:902, 913`; `component-files.md:576`), read by lib: `cli/run.ts:135` `readInputs` → `shared/inputs.ts` `inputsFromDocument` → `new Resolver(doc).resolveToDesignSystem({})`. toghen-figma has no scanner of its own.
- Lib's scanner: `toghen-lib/src/core/alias-syntax.ts:32` `REFERENCE = /\{([^{}]+)\}/`, `:35` `WHOLE_REFERENCE`. No escape; only `{}` is text. `alias.ts:185` `walk()` dereferences or interpolates any string with a reference, whatever its `$type`. `src/resolver/chains.ts:325-345` `reach()` throws *names no token* for every brace. `$description` is never scanned (`resolver.ts:642`).
- W3C (`.reference/w3c-token-format/w3c-format.md`): braces must not appear in names (`:340-343`); a curly reference is a whole value (`:686`); nothing on braces inside a string, no escape.
- Component files use `referenceTarget` (whole reference only): `shared/components/check.ts:93`, `members.ts:132`. `"Hi {x}"` is plain text, `"{x}"` a token. An input that resolves to exactly `"{…}"` and lands in a text is then read as a reference.

**Design.** One mechanism in lib's grammar, so token values, data files and component files all honour it (question 6). Lib plan unit L5 builds it in `alias-syntax.ts` (scanner, `holdsReference`, `referenceTarget`), `alias.ts` (`walk`, `interpolate`: the escape is removed in the resolved string, which is never re-scanned) and `chains.ts` if `reach` scans on its own. Tests: lib (`test/unit/core/alias.test.ts`), the data file (unit F1, `test/inputs.test.ts`), a component file's text (unit B adds one case to `cliCheck.test.ts`).

### 1.7 #126: an artboard pins a library collection's mode

**Findings.**

- One resolver serves both file kinds and both targets: `resolve()` (`main/components/resolve.ts:304`) collects `modes` pins (`:174-178`), reads `figma.variables.getLocalVariableCollectionsAsync()` (`:366`), and fails at `:689` with *no local variable collection named "…"*. It never calls `inLibraries` (`:334`), which tokens (`:422-433`) and styles (`:641-673`) already use.
- Applied in Figma by `node.setExplicitVariableModeForCollection(pin.collection, pin.modeId)` (`main/components/apply.ts:382-385`); in FigCraft by `variable.setMode { ids, collection, mode }` (`cli/figcraftApply.ts:402-406`), recorded in `unreportedOf` (`:413-425`) since FigCraft does not report pinned modes (`.reference/figcraft/request-node-get.md:14-37`).
- The FigCraft shim's `getLocalVariableCollectionsAsync` returns the file's own collections; library copies sit in `view.copies` (`cli/figcraftFile.ts:116-127`), reached only through `getVariableCollectionByIdAsync` and `importVariableByKeyAsync` (`cli/figcraft.ts:484-492`).
- `--use` gives the resolver `lock.libraries[name]`, a `LockedLibrary` (`shared/protocol.ts:396-411`): components, styles, and `variables: Record<"<collection>/<variable>", key>`. No collection entries, no modes; the collection name is the prefix of a variable id.
- Figma, measured (`.reference/figma/measured_behaviour.md` §15, `:378-398`): importing a variable by key gives its collection, `remote: true`, with its modes; there is no import-collection-by-key API; an import drops out within minutes when the library is not enabled. **Not measured:** `setExplicitVariableModeForCollection` with a remote collection (only local pins are, `:198`, `:259`).
- FigCraft has a command for it: `library.setVariableMode { library, collection, mode, ids? }`, which copies the collection in (linked, read-only) and sets its mode on the frames (`.reference/skills-research/figcraft-commands-0.9.0.txt:436-437`).
- The docs say it is not built: `specs.md:1775` (*Not in this design*), `component-files.md:132`, `specs.md:924`, `guide.md:492`.
- A component file's `modes`, the folded-axis pins included (`members.ts:249-261`), goes through the same code, so the fix serves both file kinds.

**Design.**

- In `resolve()`, a collection that is not local is looked up in the `--use` libraries: one whose variables' ids start with `<collection>/`. Found in more than one place (local and a library, or two libraries), it is an error naming each, as a component name found twice already is.
- The pin carries `{ library, collection }` for a library collection.
- **FigCraft:** `library.setVariableMode`; the unreported record keys it `library:<library>/<collection>`, so a second run compares it.
- **Figma:** question 10.
- The mode's name is checked where the target can say it: Figma reads the imported collection's modes; FigCraft's command fails with its own message, which the run reports. The lock format does not change.

### 1.8 #131: a first dry run and the components it would create

**Findings.**

- The message is `main/components/resolve.ts:735`, in `lookupComponent`; `locateComponent` (`:269-284`) returns `missing` when no local node has the name.
- `Pending` (`shared/components/steps.ts:29-41`) holds variables, text styles, effect styles, modes and removed variables, and no components. The command line builds it once from the variable and style plans (`cli/run.ts:457-462`, `shared/pendingNames.ts`), never from earlier component reports, which carry `component` (`protocol.ts:571`) and a `CREATE_SET` step when the set is new (`main/components/file.ts:74-98`).
- Files run in the typed order, component files before artboards (`cli/main.ts:157-158`). There is no dependency sort, for the real run either: a real run where A nests B and B is typed later fails the same way.
- `checkComponents` already parses every file and returns the names each defines (`file.ts:140-174`); `references()` in `resolve.ts:107-213` collects each file's `components` names.
- `checkInstances` (`resolve.ts:903-974`) checks an instance's properties and slots only when the component resolved. Dry-run receipts already tolerate an unresolved component (`receipt.ts:141-152`, `run.ts:105-112`).
- FigCraft runs the same handlers in-process (`cli/figcraft.ts:302`), so both targets behave alike. Documented as a limitation: `guide.md:912`, `reference.md:1468`, `decisions.md:103, 1426, 1510`; the design of `pending` is `specs.md:1682-1703`.

**Design.**

- **Order.** A new pure `shared/components/order.ts`: sort component files so a file comes after every file defining a component it names; ties keep the typed order; a name a `--use` library defines is not a dependency; a cycle is refused, naming the files. Artboards still come last. Real runs and dry runs both use it.
- **Pending components.** A dry run adds each set an earlier report creates to `Pending.components`; `lookupComponent` treats a pending name as present. What is checked against a pending component is question 7.

### 1.9 #130: an artboard sizes an instance

**Findings.**

- The table allows it already: `shared/components/fields.ts:192-195` gives `layoutSizingHorizontal/Vertical`, `width`, `minWidth`, `maxWidth` to every kind and the height family to `FRAME SLOT TEXT INSTANCE` (`:42`). The gate is `check.ts:448`; the artboard-only refusals (`:437-447`) cover only `SLOT`, `tokens` and `isExposedInstance`. `component-files.md:147-148` and `specs.md:1001` say an `INSTANCE` takes sizes.
- What is missing is the artboard docs (`component-files.md:598-603` lists only `set` and `slot` for an artboard's `INSTANCE`) and any test: no test sizes an instance.
- Both writers handle sizing for every kind (`main/components/apply.ts:310-329`; `cli/figcraftApply.ts:292-296`). **A hazard:** both write sizing *before* the instance's properties (Figma: `applyLayerStep` in `main/components/update.ts:274-299` calls `applyFields`, then `settle` → `applyInstanceProperties`, `apply.ts:198`; FigCraft: `fieldCommands`, then `instanceCommands`, `figcraftApply.ts:438-447`). A variant switch may reset a written size. Nothing measured covers it; `measured_behaviour.md:140` says a library slot of fixed height can be set to `HUG` but not resized in an instance.
- Nothing documents that an instance's own size is off limits; the rulings exclude overrides *inside* an instance (`specs.md:1180, 1261`; `decisions.md:295, 1242`).

**Design.** Write an instance's properties first and its sizing after, in both writers, and whenever a step writes an instance's properties it writes its sizing fields again after them. Tests on both targets: an artboard instance with `width=(literal)480 layoutSizingVertical=HUG` and a variant set; a second run writes nothing. Docs: the artboard section says an `INSTANCE` takes sizes.

## 2. Units

No two units of one wave share a file. Each unit's doc changes are written by **D-figma** in wave 4 from the unit's notes, so no doc file is shared either. Tests are synthetic.

### Wave 1 (parallel with the lib plan's wave 1)

**A. Reports** (#128, #123's printing, #127's trail). `shared/operations.ts`, `shared/protocol.ts` (`PlanPayload.summary`), `main/engines/variableSyncEngine.ts`, `main/engines/styleSyncEngine.ts`, `main/handlers/executeStyleSync.ts`, `main/engines/batchRunner.ts`, `main/handlers/planVariableSync.ts`, `main/handlers/planStyleSync.ts`, `cli/run.ts`, `cli/main.ts` (`--verbose`). Tests: `test/cliRun.test.ts`, `test/styleSyncEngine.test.ts`, `test/variableSyncEngine.test.ts`, `test/largeDocument.test.ts`, `test/batchRunner.test.ts`.

**B. Check** (#124, #125; #127's cause 2 if question 9 is (a); #129's component-file case). `cli/check.ts`, `main/components/file.ts`, `shared/components/check.ts`, `shared/components/validate.ts` (only for question 9 (a)). Tests: `test/cliCheck.test.ts`, `test/components/readComponentFile.test.ts`.

**D. Read-back** (#127). `main/components/receipt.ts`, `main/components/fieldWriter.ts`, `cli/figcraftScene.ts`, `test/support/fakeFigcraft.ts`, `shared/components/axes.ts` (only for question 9 (b)). Tests: `test/figcraftComponents.test.ts`, `test/components/receipt.test.ts`.

### Wave 2

**F. Library modes** (#126). `main/components/resolve.ts`, `main/components/apply.ts`, `cli/figcraftApply.ts`, `cli/figcraft.ts`, `cli/figcraftFile.ts`, `test/support/fakeFigcraft.ts` (`library.setVariableMode`), `test/support/figmaMock.ts`. Tests: `test/figcraftLibraries.test.ts`, `test/components/axes.test.ts`. With question 10 (a), it also prepares the desktop probe (section 4).

### Wave 3

**C. Order and pending components** (#131). New `shared/components/order.ts`, `shared/components/steps.ts`, `shared/pendingNames.ts`, `cli/main.ts`, `cli/run.ts`, `main/components/resolve.ts`. Tests: new `test/components/order.test.ts`, `test/components/pending.test.ts`, `test/cliRun.test.ts`.

**G. Instance sizing** (#130). `main/components/update.ts`, `cli/figcraftApply.ts`. Tests: `test/components/artboardRun.test.ts`, `test/figcraftComponents.test.ts`.

The lib plan's **F1** (`main/utils/sum.ts`, `test/computedValues.test.ts`, `test/inputs.test.ts`) runs in this wave too; it shares no file with C or G.

### Wave 4

**D-figma. Docs and the integration check.** The doc changes of section 6. Then `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm --filter @toghen/figma build`, and the leak check on the built stylesheet (`[object Object]`, an unresolved `toghen(`).

## 3. Risks

1. **#127's two causes are inferred from saved files, not reproduced live.** The probes in the fake reproduce the mechanism as read from FigCraft's saved model. A FigCraft that behaves otherwise in a case the saved files did not hold would leave rewrites. Unit D finishes with one headless run into a real FigCraft (the `personal:figcraft` routine), twice, expecting `0 would update` the second time.
2. **The receipt's representation changes** (question 8 (a)): every bound paint's held hash changes. The diff rule restamps a field whose reported value equals the expected one (`diff.ts:317-329`), so the first run after the release restamps without writing. A test asserts it.
3. **Figma's library pin is not measured** (question 10).
4. **The sort can reorder a run someone relied on.** Ties keep the typed order, so only files with a dependency move.
5. **`check` grows a sum build.** `buildSum` over a large document is what a dry run already does; not measured for `check`.
6. **Skip causes are a closed set.** A new skip site must pick one. A test enumerates the causes the two plans emit, so a site without one fails.

## 4. Tests and measurements

- Every issue gets a test that fails on `main` first, with synthetic tokens and component names.
- #123: the shadow in structured shapes (`{colorSpace, components}`, `{value, unit}`) through the style plan to an effect style, and a shadow that still cannot build (`color-mix(in srgb, currentColor 5%, transparent)`) printing its cause and reason.
- #127: second runs that write nothing, for both causes, in the fake, then once in a real FigCraft.
- #126, question 10 (a) only: a desktop probe in TEST_GROUND, pinning a mode of the *Toghen Test Library*'s collection on a frame, recorded as a dated section of `.reference/figma/measured_behaviour.md` by Egildo's routine.

## 5. Settled by the planner (veto any)

1. A skip carries a `cause` from a closed set; `reason` stays the sentence and names the token and the context.
2. Problem causes are listed up to ten per cause, then a count; `--verbose` lists all. Counts are never cut (R12).
3. After execute, `skipped` counts SKIP rows only (R14).
4. The plugin's screen does not change this round, apart from question 11.
5. `check` refuses `#null` on `width` and `height`; the limits keep it.
6. The folded-name error names the rest path and how the member pins the mode.
7. A dry run of a set prints `n would update` from its steps; `--verbose` prints each patch with its fields.
8. A library collection named in `modes` is found through the lock's variable ids; the lock format does not change; a name found twice is an error.
9. Component files run in dependency order, in real runs too; a cycle is refused.
10. An instance's sizing is written after its properties, and again whenever they are.
11. `figma.value` on a shadow is not built (lib plan, settlement 13).

## 6. Docs that change (written by D-figma)

- **reference.md**: *The command line: toghen-figma* (`:1477-1478`): the grouped summary, `--verbose`, `would update`; SKIP's `cause` and the summary fields (`:653-658`, `:720-730`); *Order of component steps* (`:1468`); the message formats for a library collection (`:462`, `:478`).
- **specs.md**: *A large document* (`:527`): skips by cause, and the shadow colour sentence (with F1); *A dry run across steps* (`:1682-1703`): pending components; the order of files (`:1035`); *Artboard files* (`:999-1027`): instance sizing; *Not in this design* (`:1775`): the library collection line goes; `:924`.
- **component-files.md**: `#null` (`:148`, `:264`, `:295`); *How parts become variables* (`:388-394`): what `check` says; `modes` (`:132`): local or a `--use` library's; *Artboard files* (`:598-603`): `INSTANCE` takes sizes; the brace escape, where text is described.
- **guide.md**: *Checking files with no plugin* (`:470`); the first dry run (`:912`); `:492`; `:958`.
- **decisions.md**: *Ruled: the nine issues of 24 October 2026*, one entry per ruling, and *Found in the build: why an unchanged FigCraft run wrote members* with the two causes and how they were found; the superseded limitation texts moved whole.
- **ux-rulebook.md, ux-map.md, ux-smell-log.md**: no rule changes. If question 11 is (b), `ux-smell-log.md` records the other-phase rows as a smell closed under R14.
- **ui.md** *The result surface* (`:358-391`): only if question 11 is (b).

## 7. Questions

**6. How a literal brace is written** (#129, lib-level).

*Context.* Lib reads any `{…}` in a string as a reference (`alias-syntax.ts:32`), whatever the `$type`, and W3C defines no escape. A data file that shows a token's name as text, a description-like string token, and a component file's text all need one way to say "this brace is text". Data files are JSON, component files KDL.

*Alternatives.*

- **(a) A backslash: `\{size.sm}`.** The convention of CSS and most grammars. In JSON it is written `"\\{size.sm}"`, in KDL `"\\{size.sm}"` or a raw string: easy to get wrong by one backslash. Today `\{a}` is a backslash and a reference, a meaning nobody is likely to use.
- **(b) Doubled braces: `{{size.sm}}` is the text `{size.sm}`.** As in Python's and .NET's format strings. Written the same in JSON and KDL, no escaping. Today `{{a}}` means a brace, a's value and a brace, again unlikely to be used.
- **(c) `$type: "string"` is never scanned.** No new syntax, but a string token could no longer reference another string token, and a component file's text has no `$type`.
- **(d) An `$extensions["com.toghen"].literal: true` flag on the token.** Explicit, per token, and silent in the value; does not reach a component file's text.

*Recommendation.* **(b)**, because data files are JSON, where a doubled brace reads as what it means and a backslash must itself be escaped.

**7. What a first dry run checks against a component it would create** (#131).

*Context.* `checkInstances` (`resolve.ts:903-974`) checks an instance's properties and slots against the built component. A component the same dry run would create has no node yet; its definition exists only in its parsed file.

*Alternatives.*

- **(a) Names only.** A pending component counts as present; its instances' properties and slots are checked on the run that builds it, and the dry run says so once per component (*the properties of `<component>` are checked when it is built*).
- **(b) Full checks from the parsed file.** The command line passes each pending component's declared properties and slots in `Pending`; `checkInstances` reads them. A first dry run catches a wrong property name too; more code in `Pending` and in the check.

*Recommendation.* **(a)**, because the noise is the defect; a wrong property on the first build stops that build with its own message.

**8. How a bound paint's opacity is compared** (#127, cause 1).

*Context.* A paint bound to a colour variable takes its colour and alpha from the variable in the layer's mode. The receipt compares an opacity computed at the defaults, so a layer pinned to a mode where the alpha differs is rewritten on every run.

*Alternatives.*

- **(a) A bound paint is compared by its variable only.** Expected and reported both drop the opacity when the paint is bound (an explicit paint opacity in the file stays compared). Target-independent and mode-independent; a person changing the opacity of a bound paint by hand is no longer seen as drift. Existing receipts restamp once, with no write.
- **(b) The expected alpha is computed in the layer's mode**, from the pins on the member and its ancestors. Exact, and drift on a bound paint stays visible; needs the layer's effective mode at receipt time, and assumes Figma paints a bound alpha the way FigCraft does, which is not measured.

*Recommendation.* **(a)**, because the opacity of a bound paint is the variable's, not something the file says.

**9. A bound `height` (or `width`) beside `HUG` or `FILL`** (#127, cause 2).

*Context.* `tokens=` binds a component's `height` token while the file says `layoutSizingVertical=HUG`. A size bound to a variable is a fixed size, so FigCraft keeps the height and makes the frame fixed, and the next run writes `HUG` again. The file says two things that cannot both hold.

*Alternatives.*

- **(a) `check` refuses the pair**, naming both fields and the token: *write `HUG` and drop the height token, or keep the token and drop `HUG`*. The author decides; one edit per component file.
- **(b) An explicit `HUG`/`FILL` wins:** `tokens=` does not bind that axis's size token, and `check` notes it. The file's explicit word beats the automatic expansion; the token is silently unused in Figma.
- **(c) The bound size wins:** Toghen writes and expects `FIXED` whenever a size is bound, and `check` notes that `HUG` is ignored. Closest to CSS, where the token is a fixed height; the explicit `HUG` is overridden.

*Recommendation.* **(a)**, because a contradiction should be shown to the person who wrote it, not settled by a precedence rule they cannot see.

**10. A library collection's mode in Figma** (#126).

*Context.* FigCraft has a command for it (`library.setVariableMode`). Figma has no collection-by-key import: the path is to import one variable of the collection by key, take its collection, and pin it with `setExplicitVariableModeForCollection`. Importing is measured; pinning a remote collection is not, and only the desktop app can measure it.

*Alternatives.*

- **(a) Build both now; merge after a desktop measurement.** Unit F writes the Figma path and a probe; Egildo runs it in TEST_GROUND before the merge. Both targets alike; the round waits on a desktop session.
- **(b) FigCraft now; Figma refuses with a sentence** (*a library collection's mode is not measured in Figma yet*) and the measurement is added to the open desktop measurements. The round does not wait; the targets differ for a while.

*Recommendation.* **(b)**, because the reporter uses FigCraft and an unmeasured Figma path is the kind this project measures before it builds.

**11. The "handled in the other sync" rows** (#128).

*Context.* The variable plan emits one SKIP per style token (*style-type (handled in style sync phase)*) and the style plan one per variable token; they are most of the 2050 style skips. The same token is then counted as a skip in one plan and as a create, an update or a skip in the other. R14 says a count is not reported twice under two names.

*Alternatives.*

- **(a) Keep the rows,** counted under their own cause (`other-sync`), quiet like `unchanged`. No screen change; the counts stay large.
- **(b) Drop the rows from both plans.** A plan lists only the tokens it is for; the `skips` count falls to real skips. The screen's Plan shows fewer SKIP rows; ui.md and the smell log say why.

*Recommendation.* **(b)**, because those rows record nothing that happened in that plan, which is what R14 forbids.

## 8. What the build found (24 October 2026)

Built on the integration branch `round-2026-10-24`: A, B and D (wave 1), F (wave 2), C and G (wave 3), D-figma (wave 4), beside the lib plan's units; the lib plan's F1 closed wave 2 in figma. The root `pnpm build`, `pnpm typecheck` and `pnpm test` are green (figma 1524). The plugin's built `ui.html` holds no `[object Object]` and no `toghen(`.

### What deviated from the plan

- **A (#128):** `cause` is optional on the SKIP type, because the apply, scaffold and bindings plans emit skips too; a test forces a cause in the two sync plans. The plan lines read `Variable plan:` / `Style plan:`. The line naming a field a target cannot read back was not built: no such field was found in this round, and the text styles' weight is already documented.
- **Integration:** a set's `PATCH_LAYER` step now carries its fields (and restamped ones) into the reply (`main/components/file.ts` `summarize`), so `--verbose` prints what a patch writes; the unit could not reach that file in its wave.
- **B (#124, #125, 9a):** besides a bound width or height beside `HUG`/`FILL`, a bound size beside a text's `textAutoResize` that sizes that axis is refused too: the same contradiction, measured by D in FigCraft.
- **C (#131):** the order is computed in `cli/run.ts` from files read in Node (not in `main.ts`). An instance-swap value named only through an instance's `set` value is not a dependency for the sort (`ponytail:` comment).
- **F (#126):** the target switch for library modes is a module flag set in `cli/figcraft.ts`; the clean place is `run.ts`'s target check. A FigCraft dry run needs the library locked first.
- **G (#130):** the re-written sizing after a variant switch lives in `withResets` (`main/components/apply.ts`), the one function both writers share.
- **Trailers:** two units' commits were reworded to the round's co-author line before merging.

### What the build discovered

- **#127, both causes reproduced against real figcraft-cli 0.10.0** (headless, a synthetic file, twice with nothing changed): a bound colour is painted with the variable's value in the layer's effective mode (a child takes its root's pinned mode), alpha in the colour, paint opacity 1; a bound height or width fixes that axis's sizing and a text's auto-resize, whatever the order of writes. After ruling 8a, an old receipt restamps once without a write and every later run reads `0 updated`. Cause 2 is now refused by `check` (9a).
- **FigCraft 0.10.0 on a variant switch** (G, measured): a fixed axis goes back to the new variant's size, a hug axis takes its hugged size, a fill axis keeps its size; writing `width` on a hugging instance makes it fixed.
- An untyped or unsupported token is skipped in both plans, so it is counted once in each.

### What is left, or not verified

- **Figma desktop measurements**, none made: pinning a library collection's mode (refused in Figma by ruling 10b), what a variant switch does to an instance's size, what a bound size does to `HUG`.
- **#126 never ran against a real FigCraft:** `library.setVariableMode`'s parameter names come from the 0.9.0 command list, and FigCraft's error wording is not measured.
- **A bound paint's opacity is still written at the defaults' alpha** by both writers (`fieldWriter.ts` ~`:135`, `figcraftApply.ts` ~`:211`). Since 8a no longer compares it, rewrites stop; whether FigCraft draws a member pinned to another mode with that opacity on top of the colour's alpha is not checked.
- **#129:** an `(input)` value that resolves to exactly `{…}` and lands in an artboard's `characters` is still read as a token reference.
- **Skills now untrue** (`toghen-skills/`, for its own re-check routine): `pipeline/messages.md:49, 61, 76, 88`, `pipeline/example.md:213`, `pipeline/SKILL.md:213, 215, 222, 226, 348, 357`, `figcraft/toghen-target.md:57`.
- No version bumped, nothing pushed.
