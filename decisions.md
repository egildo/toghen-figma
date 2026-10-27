# @toghen/figma — Decisions (archive)

This is the archive for the package. It keeps the rulings and their status, the designs that were superseded, what each build found, and the questions still waiting for a ruling. [specs.md](specs.md) says how the package works now and why; this file says how it got there and what is undecided. It is added to, never rewritten: a section that moves here from `specs.md` keeps the text it had.

## Moved: a repository of its own, numbered from 0.1.0 (25 October 2026)

**Status:** done.

**The change.** The package left the Toghen monorepo for its own repository, [`Toghen/figma`](https://codeberg.org/Toghen/figma) on Codeberg, in one first commit. Its history before the split is not carried over. Its version starts again at 0.1.0; the last version before the split was 7.0.1. Links that crossed into other packages now point at their repositories.

**Why.** Ruled by Egildo on 25 October 2026: one repository per package, and a [house](https://codeberg.org/Toghen/house) repository for what they share (the constitution, the speckit preset, the Biome config, the purity check). The plan is in house, `.reference/plans/workspace/plan-2026-10-25-tooling-codeberg.md`.

**With it.** Biome lints and formats the code, `pnpm check` runs every gate, and speckit with the house preset runs the rounds. The package is published on npm for the first time. A `files` list keeps tests and `.reference` out of it, `tsx` is a runtime dependency because the command line runs TypeScript, and `prepack` builds the plugin. The leak check (`scripts/check-leaks.mjs`) runs in `pnpm check`. The Figma file keys of the test files are gone from `.reference`.

## Open questions

Questions waiting for a ruling. The open questions of the moved pin model and proposals stay with those sections below.

### Components from files

- **A field the file stops declaring.** The first round leaves its value and reports it. Resetting it needs Figma's default for every field, which the Plugin API does not publish; the pin model's recorded values would have given the previous one, but the stamp keeps hashes, not values (ruled 20 October 2026).
- **A data file's literal brace on a text.** A doubled brace in a data file, `"{{size.sm}}"`, resolves to the text `{size.sm}`; when that value reaches `characters` through `(input)`, the component reader sees one whole reference and binds the token `size.sm`. The brace survives lib and is lost one step later. Added 24 October 2026.
- **Renaming a variant value** reads as one member removed and another added, so the instances on the old one lose it. Telling a rename from a replacement needs something the file does not say today. A renamed *axis* is inferred since 14 October 2026 (see the ruling below); a value is not, since a value gone and another come on one axis is a replacement as often as a rename.

### Measurements only the desktop app can give

- **`COLOR_OPACITY`'s unit.** A composed colour (Update 139) lets a paint's opacity follow a variable, so the unit can now be measured from code: write one with a `FLOAT` opacity and read back what it resolves to. Until then a declaration naming the scope is refused (specs, *What a variable is for*). Added 23 October 2026.
- **The `teamlibrary` permission.** Documented as required by the `figma.teamLibrary` methods; the manifest declares it. Whether the desktop plugin fails without it, and what `figma.root.name` reads there, are unmeasured (measured behaviour §15, question 6).
- **Keys after a republish.** Whether a variable's and a set's keys survive a republish, and a set's a rebuild in place (§15, question 4). The keys are recorded for the comparison.
- **A library collection's mode.** Whether `setExplicitVariableModeForCollection` takes a collection reached by importing one of its variables by key (`remote: true`); only local pins are measured (§15 measures the import). Until then `modes` on a library's collection is refused in Figma, in a dry run as in a real one, and pinned in FigCraft (*Ruled: the nine issues of 24 October 2026*, ruling 10b). Added 24 October 2026.
- **An instance's size after a variant switch.** Measured in FigCraft 0.10.0 (a fixed axis takes the variant's size, a hug axis its hugged size, a fill axis keeps its own); Figma is written the same way, properties first and the sizing after, and not measured. Added 24 October 2026.
- **A resolved component's key as a preferred value.** Whether `editComponentProperty` takes, as a preferred value, the key of a component the locator answered, a local component's included. Until it is measured, a `preferred … name=` is refused in Figma by name, before any write, and Figma takes preferred values by `key=` only (component-files.md, *preferred*). Added 23 October 2026.

### The command line

- **The browser app.** The bridge was measured in the desktop app only. Whether a development plugin runs in the browser, and whether the browser allows the socket, is not known.
- **A published plugin.** The manifest names the socket under `devAllowedDomains`, which holds only while a plugin is in development. Publishing needs it under `allowedDomains` with a `reasoning` (documented, not measured), and that is not done.
- **Keeping a file the command line sent.** The redesign drew a callout, *the command line sent this file; keep it here*, and it is not built: the command line sends the compact component and the packed document, not the file's text, so the plugin has nothing it could keep. Sending the text too, under its file name, would make it possible; wanted when someone builds from the command line and then wants the screen to build again.
- **A run's responses are matched by type.** The command line asks one question at a time and takes the first answer of the type it expects, or the `ERROR` that names the command. A person pressing a button at the screen during a run could produce another answer of that type. Numbering requests would close this; nothing has shown it is needed.

## Moved from *Integration Contract with @toghen/lib*

### Known redundancy — the collection-name prefix

> **Ruled 8 October 2026: the prefix goes** (see *Names and code syntax*). The
> migration concern below is answered by the sum, which writes new collections.
> Kept for the record.

`tokenPathToVariableName()` (now in `main/utils/tokenPath.ts`) and
`tokenPathToStyleName()` (`styleSyncEngine.ts`) mapped the *full* token path,
including its leading collection segment, into Figma names. Since
`planVariableSync` names the Figma collection from the same source, a document
called `demo` produces a variable `demo/color/brand/primary` inside a collection
already called `demo`. `ioAdapter` has the same shape: the collection name
becomes the top-level key of exported JSON, which stops that export from being a
round-trippable DTCG document.

This is deliberately left alone for now. Removing the prefix is not a one-line
change:

- The reverse mapping (`variableNameToTokenPath`, `styleNameToTokenPath`) parses
  a label string and has no collection information to re-attach.
- `extensionsCache` is keyed by full path in `loadDocument`, `executeVariableSync`
  and `ioAdapter`, and is persisted into `$extensions['com.toghen.figma']`.
  Changing one side only makes every `lastSyncedHash` lookup miss, so every
  variable and style is treated as new and duplicated alongside the user's
  existing ones.
- It rewrites identifiers **stored in the user's Figma file**, which needs a
  deliberate migration rather than a rename.

A follow-up should handle round-trip symmetry, an `extensionsCache` key
migration, and the `ioAdapter` round-trip together. `hashToken()` correctly
excludes the path and needs no change either way.

## Moved from *Values Figma cannot hold as written*

  - *Found in the build.* An `em` letter spacing is also covered, since the plan skips it for its value by the same mechanism, so a ramp in `em` can name a pixel value for Figma. A key a context only inherits from the token's base is used where that context's value is unholdable, and ignored where it is holdable; only a key in the cell's own definition triggers the refusal. A literal on an untyped token is refused, since a literal has no type to give: an untyped token names a reference. Styles holding `currentColor` (a shadow or gradient colour) are unchanged: the key reads in the variable plan only.

## Moved from *A font stack is a fallback in Figma too*

  - *Found in the build.* At execution the plan has no stack to consult, so a listed font that fails to load is skipped with `"<path>" has no family Figma can load: "<family>" is listed but could not be loaded.` The skip carries `reported: true`, so the command line lists it among thousands of ordinary skips. Family matching against the list is exact and case-sensitive. The style asked for is the `fontStyle` (default `Regular`); `fontWeight` is not mapped to a style name. A fallback style's note is repeated on every plan, even when the style is unchanged.

## Moved from *Figma's mode limit, and the contexts Figma gets*

- **Found in the build.**
  - *One sentence for both cases.* The stop reads `"hue" has 14 contexts for Figma and Figma allows 10 modes per collection; keep at most 10 of them in figma.include.` whether the modifier has no key or a key that lists too many. Every collection over the limit is named in one pass, one warning each.
  - *A token with a base and a definition only in left-out contexts* keeps its home in the modifier's collection, every listed mode carrying the base, so that listing a context later does not move a variable between collections. The no-variable rule above applies to a token with no base.
  - *What still shows every context:* the Tokens pane, the loaded document's mode list and the style-sync warning. Only the plan and the collection summary use the contexts Figma gets. The command line's name check still counts a token defined only in left-out contexts as defined, so a file binding it passes that check and fails later at lookup, as any token without a variable does.
  - *Artboard files* read no design system and need no check.
  - *Not measured:* the limit for plans other than Professional (the 10 rests on a failure on that plan), and what a frame or variant pinned to a deleted mode does.

## Moved from *Names and code syntax*

**Built, with choices the rulings left open** (8 October 2026):

- A modifier with no `default` cannot build the sum, and the plan is one warning.
- The plan creates the base collection and every modifier's collection even when empty.
- A base collection named like a modifier stops the plan.
- A collection holding only modes the sum has is reused, and the plan adds its missing modes.
- The sync record counts only inside a variable's home collection, so a token whose home moves is made again.
- A chain link is keyed in the record by lib's generated path (`ds.path~modifier`) and named in Figma `path--modifier`.
- An alias hashes by its target.
- Variable descriptions are still not written.
- The document pane's mode list and the export still name the product's permutations. *Superseded by* A large document, below.
- A referenced token with no value in the default combination makes lib's `resolveContextsToDesignSystem` fail for the whole document, so the plan is that one warning rather than a report per token.

## Moved from *Artboard files*

**Found in the build.**
- **Measured in a test file, 12 October 2026:** `setProperties` takes the keys an instance reports in `componentProperties` (`Label#101:0`, a variant by its plain name) and refuses an unknown key; an `INSTANCE_SWAP` takes a component's id; `componentProperties` lists a slot too, with type `SLOT`, and `setProperties` does not take it; the slot node inside an instance is named as its property's display name and takes `appendChild`. Not measured: font loading for a text property, a variant combination that does not exist, and whether a swap drops the instance's other values.
- **kdlet's own words.** The list form is `each p in=(input)properties key=name`, read as `(p)name`, not the shorthand the issue wrote. kdlet reads no dotted path, so a record is flat: `size.width` is not readable, and the data carries `width`. A repeated layer's address is its name plus its keys, `Row["variant"]`; Figma shows the name only.
- **`set` adds.** A `when` can add one property to what an earlier `set` gave, and the same name written twice takes the later value.
- **`artboard <Name>` is a header, as `component <Name>` is,** with the root `FRAME` a separate node. The frame's Figma name is that `FRAME`'s address, and the stamp is keyed by the artboard's name. A frame is found by its stamp wherever it was moved, and a frame that only has the same name is not adopted.
- **What is refused in an artboard file:** `tokens=`, since group binding is built around a component; `(property)`; a `SLOT` layer; and `description`, which nothing would read. A kept template (the Templates pane) cannot be an artboard file, since the screen cannot supply the inputs.
- **Patching only the difference** needed a digest of the declared fields in the stamp, plus a live read of an instance's properties and texts. A hand edit is reported only when the layer's digest is unchanged: if the file changed that layer in the same run, the edit cannot be told from the file's own change. A hand edit to a declared structural field (layout, fill) is not detected.
- **A dry run of a first-ever `sync`** cannot resolve an instance whose `component=` the same run would create: `pending` covers variables and styles only, not components. Run the components first, or accept the stop.
- **The plugin screen's wording** for a command-line artboard run still uses member wording, since the rulebook binds screen changes. Left for a screen round.

## Moved from *A segment of a reference from an axis, and axes from a group*

**Found in the build.** kdlet needed no change: it has no interpolation in strings, so the reference reaches Toghen verbatim and the segment is expanded per member right after evaluation, before any check. A value that holds `.`, `{` or `}` is refused as a segment; a segment is whole (`blue-(input)hue` is an error); generic and reserved family keywords are matched without regard to case. A group's children are ordered as the document's paths first meet them (JS object-key order), so purely numeric child names come first, numerically: the "document order" has that ceiling. Not run in a real file: a set with many values of one axis, and variable binding through expanded references.

## Moved from *Bindings from a CSS-keyed group*

- a literal border member is a warning, not a note;
- a non-`solid` border is an error at read time;
- a root's own `tokens=` replaces the component line's on the root;
- `rowGap` and `columnGap` outrank `gap`;
- the plan per group is worked out in the repository and carried in the component header, so a printed script binds the same as the plugin.

Cost: the engine grew by 555 characters, and the `notice` fixture's inline script had 39 characters left under `use_figma`'s 50,000. The first command-line run in a real file (8 October 2026) then added a page-by-page search and dry-run mode pins, and `notice` no longer fits inline (50,217): like `shell` and `stepper` it is printed `--stored`, the normal way, at 6,437.

## Moved from *From file to Figma*

Building it settled points the design left open:

- The checks accept a `#null` only on sizes.
- A variant axis name follows the value rule (no `,` or `=`) and has no dot, since a guard cannot read one.
- The root layer has no parent, so it may not fill one and may not carry `grid`; it is the component itself, so no property is wired to it.
- The checks refuse a `FLEX` track on an axis the grid hugs, since [measured behaviour](.reference/figma/measured_behaviour.md#7-component-sets-slots-and-layout) says it is invalid.
- A `TEXT` or `INSTANCE` layer takes no child layers.
- The checks refuse `each`, since nothing gives a component file a list, and a guard with no body, which only a host could supply.
- Dropped with the rules that patch by address: a rule addressing a layer that does not exist, a `move` into itself, and two moves that meet.

Building the engine settled more, and amends the design where it was silent or where a choice had to be made:

- The **root layer is the member's component itself**: its fields are set on the component, it takes the member's name and not its address, and the one node carries both the `member` and the `address` stamp; for the same reason no property is wired to it.
- The engine refuses a foreign set **before** it considers a stamped one, since two sets of one name are ambiguous for anyone.
- **Fills** that the file does not declare are cleared on every frame, slot and root, not only on a frame, since a new component and a new slot are not known to start empty.
- A file that gives **only a side's stroke weight** gets `strokeWeight = 0` first, so the other sides are none.
- An **`INSTANCE` must name its component**.
- A **property's default** takes its layer's value: a wired `visible` starts as the boolean's default and a wired `characters` as the text's.
- A **slot's property** is made by `createSlot()` under a name of Figma's choosing, so the engine names the node, reads the member's properties, and renames the property itself only if it did not follow.
- **Same-named properties on the members** are added on each member before combining, on the assumption that Figma merges them by name into one property of the set. That assumption and every other the mock had to make is a `// unmeasured:` line in `test/support/figmaScene.ts` and `figmaMock.ts`, and that list is the checklist for the first pass in a real file.
- A **dry run does not import** a component named by a published key, since importing writes to the file, so it cannot check a key.

Reconciliation settled its own points:

- **Every declared field is re-applied** rather than compared, since comparing needs the pin model's recorded values; it costs a patch step per layer on an unchanged file.
- A layer's place is **after the previous layer the file names**, and two layers are re-ordered only when the order of those the file and the member share differs, so a node Toghen does not own beside a layer does not make every run move it.
- A member new to an existing set is built **with no properties of its own**, appended, and wired afterwards with the set's keys, since a member in a set cannot take properties.
- The engine **never adopts by name** a property in the set that Toghen did not add, even when the file declares one of that name: it leaves and reports the property, and wires layers to it.
- A property whose type changed is deleted and added, and the engine reports it as breaking.
- A layer that becomes another kind is replaced in place and **takes what was inside it**, so the layers under it stay the same nodes.
- The stamp of every patched layer is rewritten with the fields now set, which is why a field the file stopped declaring is reported once.
- The engine does not restore the set's name, only its description and its `properties` stamp; it does restore a member's name and a layer's name.

## Moved from *Components from files*

### Two runtimes, one engine

> **Superseded on 10 October 2026** by *One runtime: the plugin*. Kept as the record of the printed scripts.

The read, evaluate and validate steps run in the repository (the evaluation again in Figma). The snapshot, diff and apply steps run in Figma, and are the same code in both runtimes.

- **The command**, first. It reads the files, validates them, and prints one standalone Plugin API script per component set: the component's header and the file's document as data, followed by the Figma-side engine, bundled and minified, which evaluates the document into members again in Figma. An agent runs it through `use_figma`. Everything inside is addressed by name and resolved in Figma, and a name that does not resolve throws. That uses a trap as a guarantee: a failed script rolls back entirely, so a component set is changed whole or not at all.
- **The plugin.** It runs the same engine on the component and document the command line sends (`RUN_COMPONENT`; see *The command line*). It has no control for choosing a file on its own screen: the files are read in the repository.

**The script's size, and what it returns, were found in a real file.** `use_figma` accepts at most 50,000 characters of code, and the first printed script for the worked example was 96,932: 44,583 of expanded members and 52 kB of engine. Carrying the component instead of its members, and minifying the engine, brought it to about 38,500, and the command now refuses a script over the limit rather than printing one that would be refused.

`use_figma` also truncates what a script returns at about 20 kB, which cut the report of a reconcile (77 patch steps with their layers) before `created`, `deleted` and `breaking`; the script returns each step summarised.

The engine has grown with every round since (29,500, then 40,000, then 43,500; 44,396 on 8 October 2026), and the room it leaves a component has shrunk to about 5,600. The answer, measured to work in the same pass, is to store the engine once in the document's shared plugin data and send only the component, evaluating the stored engine with `new Function`: a first call stores it, later calls send a few kilobytes. It is built, and it is the normal way; the reference keeps the current figures.

**On kdlet, the size was measured again.** The engine now bundles kdlet's `evaluate`, about 8,200 characters minified, and takes about 40,000, so a script has roughly 10,000 left. There were two ways to carry a component. Carrying the members, evaluated in the repository, needs only the engine without kdlet (28,300) and the members as JSON; the worked example's seven were 43,605 characters with positions and 24,684 without, so that way printed 54,000 at best and did not fit.

Carrying the document and bundling `evaluate` fits all three fixtures, with the positions. The document kdlet reads is several times the size of its file (13,716 characters for the worked example's 2,995), and the reader is not bundled, so what travels is plain JSON and `compact.ts` packs it: it leaves out the position of a value, which an evaluation reads only to report a problem with it, and writes each object as a number naming its list of keys followed by its values. The worked example's document is 6,072 characters packed. The printed scripts, before and after:

| Fixture | Members | Before | After |
|---|---|---|---|
| Toggle | 2 | 33,434 | 42,407 |
| Control | 12 | 34,577 | 43,660 |
| Shell, the worked example | 7 | 38,989 | 47,241 |

All three are within the 50,000 limit, and the worked example has about 2,700 left, which is less headroom than before the move to kdlet (about 11,000): a component about a quarter bigger than the worked example, or a long description, will be refused by the command with its size.

**The gate and `pending` cost headroom.** On 4 October 2026, with the breaking gate and `pending` in the engine, the same three scripts print at 44,073, 45,326 and 48,907 characters, and the engine's own script at 41,912. The worked example has 1,093 left, so the printing command refuses a component only slightly bigger, or with a long description, and gives its size; such a component wants the stored engine (the stored scripts are 2,777, 4,030 and 7,611). Through the plugin there is no limit.

**The engine can be stored in the file.** *Built in the command, proved against the mock, and run in a real file.* `components --engine` prints a script that stores the engine in the document's shared plugin data, with an id taken from its source. `components … --stored` prints component scripts that carry no engine: each checks the stored id against the one it was printed for, evaluates the stored engine with `new Function`, and runs. A missing or different engine stops the script before any write. The same three fixtures, printed this way:

| Script | Characters |
|---|---|
| The engine's script, once per file and per version of Toghen | 40,246 |
| Toggle | 2,792 |
| Control | 4,045 |
| Shell, the worked example | 7,626 |

So the room for one component goes from about 10,000 characters to nearly all 50,000. Both kinds of script have run in a real file: the engine's script stored it, and two scripts printed with `--stored` each built their set from it (see *What a real file settled*). A script that carries its engine needs nothing in the file, and is for a component small enough to fit; see the 5 October 2026 paragraph below.

**With kdlet 0.1.0 the engine grew, and the stored engine became the normal way.** On 5 October 2026, with the published `kdlet` and `kdlet-guards` in place of the local package, the engine's script printed at 43,512 characters, more than any earlier figure here. The cause is the move of the guards into their own package: kdlet's `evaluate` now calls `kdlet-guards`' evaluator, which builds a trace for every condition, and that code is in the bundle (the reader and the KDL parser are not). The printed scripts with the engine in them are now Toggle 45,637, Control 46,840 and Notice 49,333, so each fits, with 4,363, 3,160 and 667 characters left; the worked example (Shell, 50,477) and Stepper (50,564) are over the 50,000 limit by 477 and 564, and the command refuses them inline. Printed with `--stored` they are 7,581 and 7,668 (Toggle 2,741, Control 3,944, Notice 6,437).

The limit was not raised and the fixtures were not shortened. Instead the stored engine is the normal way to print a component, the one that always fits, and the script that carries its engine is for a component small enough to fit. The refusal says so: it names `components --engine` and `--stored` first. The plugin is the other way to build a component and has no such limit, so nothing new was added for this.

One script per set, never two at once, because two scripts against one file interleave and a rollback of one cannot account for the other.

### What a real file settled

An earlier pass, recorded in [measured behaviour](.reference/figma/measured_behaviour.md#8-component-sets-built-from-files-through-use_figma), ran the engine against variables that variable sync had written. This pass added breaking changes and different fixtures. The command's scripts were run through `use_figma` against an empty Figma file holding only synthetic tokens (a collection of dimension and colour variables, two text styles, a second collection with two modes, and one small component to swap in). Three of the repository's fixtures went through it, in the format of the time (rules that patched layers by address; the fixtures have since been rewritten in the kdlet format and run only against the mock):

- **A small component** with one variant axis, a boolean, a text property and a `when` rule: created, then reconciled twice. The first reconcile added a variant value and changed a field on an existing layer; the second removed a value and a property. Node ids survived both, and the dry run listed exactly the steps the real run then took.
- **A control** with three variant axes and an `exclude` rule (12 members), an `INSTANCE_SWAP` property, per-member `modes`, a literal stroke and a fill emptied by a rule: created in one run, every binding and the swap wiring read back correct.
- **A layout** with four `SLOT` properties, a `GRID` frame with per-member track sizes, a region moved into another layer, and a `#null` clearing a minimum width: created in one run (7 members), every slot bound to its property and every track as the file said.

A script that failed after several writes (a wrong call in a setup script, not the engine) left none of them behind, as the rollback rule says.

An instance of the small component, with a text override, survived the reconcile that removed a property and a member: it kept the override and its place, and lost only what the file removed.

What the real file showed that the design had to guess:

- **Deleting a property clears the references to it.** A layer the file had wired to a property keeps its current value, but no longer follows anything. The note "the file no longer declares `visible`, so its value was left as it is" is true of the value and says nothing of the wiring, so it reads as less change than there was.
- **An instance of a removed member is neither detached nor remapped.** It stays an instance, pointing at the removed component, which no longer has a parent; its overrides on deleted properties are gone. This is what "instances lose their variant" means, and a person has to swap it.
- **`breaking` was advisory.** A run that found breaking steps performed them; only a set of the same name that Toghen did not make stopped a run, and a dry run was the only gate. That was what the real file showed, and it is why *Breaking steps stop a real run* below was decided: a real run now stops before its first write unless `allowBreaking` says otherwise.
- **A reconcile patches every declared layer**, changed or not, and the dry run lists all of those steps. Writing a value that is already there changes nothing, so no harm is done, but the list says more than changed.

**The first pass of the kdlet format.** On 4 October 2026 the layout's script, in the kdlet format and 47,256 characters long, ran through `use_figma` against the set the earlier format had built. It reconciled in place. The set and its seven members kept their node ids, and every member kept its ten layers. The run made 77 patch steps and one relayout, and no create, move, delete or breaking step. Read back afterwards:

- the header region is the first child of `Main lane` in the three `Header in=content` members, and of the member itself in the others;
- the column tracks are `FLEX, HUG`, then `HUG, FLEX`, then `FLEX 1, FLEX 1.618`, as the file says;
- the aside's minimum width is cleared in the `grow share` members;
- in `single` the aside region is hidden and wired to nothing.

So kdlet's evaluator, a `define` called in two places and structured fields all work inside Figma, and the new format asks for the same component the earlier one did.

**The first sets created in the kdlet format, and the first run of the stored engine.** On 4 October 2026 the engine's script (40,246 characters) stored the engine in the same file, and the two scripts printed with `--stored` for the notice and the stepper fixtures (6,577 and 7,716 characters) each created their set from it: eight members and six. Read back, the fills, stroke weights, the layer that exists in three members only, the dimmed steps, the spacing and the pinned mode were all as the files say. One thing was wrong: the notice's texts were 0 wide and wrapped one letter to a line. A probe found the cause, recorded in [measured behaviour](.reference/figma/measured_behaviour.md#8-component-sets-built-from-files-through-use_figma): a text given its sizing while still empty stays 0 wide. The engine now sets a text's style and characters before its sizing. A new set is also created at the page's origin, on top of whatever is there.

**All five fixtures, created from scratch.** The same day the file was pruned of every set Toghen had built, the corrected engine was stored (40,263 characters), and the five scripts printed with `--stored` each created their set on a page of its own: the small component (2 members), the control (12), the layout (7), the notice (8) and the stepper (6). Read back: the notice's members are 420 by 113 or 115 with their texts 364 to 386 wide, so the fix holds in Figma; the control's icons are instances of the swap component, its outline members have no fill and its small members pin the mode; the layout has its four slots in every member, the header region under `Main lane` in the three `content` members, and the tracks and the cleared minimum width as the file says.

**The first reconcile through the stored engine.** Still on 4 October 2026, the control was reconciled twice, with an instance of one member placed beside it, its label overridden. First to an edited copy of its file: one size value dropped, a text property added with a layer wired to it, and the radius token changed. Then back to the fixture. Each script was about 4,300 characters, and each dry run listed exactly the steps its real run took. The set, the eight members both files share and their layers kept their node ids through both runs; the four members of the dropped size were deleted and built again, and the dry run had named the deletions and the removed property as breaking. The instance kept its override and its main component through both, and gained the new property, then lost it.

The read-back found a defect: the patched members drew their bound fill and stroke black, while the members built in the same run drew the variable's colour. Both paints were bound to the same variable; the patched ones carried the black colour the engine started its paint from, and Figma drew that ([measured behaviour](.reference/figma/measured_behaviour.md#8-component-sets-built-from-files-through-use_figma)). So every reconcile turned every bound paint it patched black on the canvas. The engine now starts a bound paint from the colour its variable resolves to for the layer. Stored again (40,341 characters) and run through the same two reconciles, all twelve members' bound paints matched their variables, and patched members drew the same as built ones.

Not yet exercised in a real file: a slot that a later run renames or removes, a component near the script-size ceiling, and the `// unmeasured:` lines individually (see *Remaining Work*).

### Text from documents (proposed)

> **Status: proposed, nothing built.** The text of a design often already exists as Markdown in the design system's repository: a datasheet's descriptions, a manual's paragraphs. Typing it again into Figma drifts. This note says how a text layer could take its content from a document. The reference syntax, the field that names a document, is not designed yet.

**Settled** (by the maintainer):

| Decision | What it means |
|---|---|
| **A text layer holds only what Figma holds in text** | Nothing is kept that Figma has no native text equivalent for. The set is below. |
| **The parser is mdast, through unified** | `remark-parse` with the GFM extension, queried with `unist-util-select` and `mdast-util-heading-range`. All of it runs in the repository's command, never in the Figma bundle, so none of it reaches `@toghen/lib`'s dependencies. |
| **Content is read where the files are** | The command reads the document and prints the result into the script, as it does the component. |

**What a text layer can hold**

| In a text layer | From the document | Applied as |
|---|---|---|
| Paragraphs | paragraph, heading text | `\n` |
| A line break inside a paragraph | hard break | `U+2028` |
| Bold, italic, both | `strong`, `emphasis`, nested | a range text style |
| Strikethrough | `delete` | `STRIKETHROUGH` on the range |
| A link | `link`, a resolved `linkReference`, an autolink | a hyperlink, `UNDERLINE`, and a fill |
| Ordered and unordered lists, nested | `list` | list options and indentation from 1, one paragraph per item |

Out, because Figma has nothing native for it in text: inline code, task checkboxes, blockquotes, raw HTML, images and footnotes. A table is not text either; it is a layout of text layers, which the component already owns, and a query can fill each cell from a row.

**How a document is queried.** The tree is flat: a heading is a sibling of its content, not its parent, so "what is under Specifications" is not a selector. A query is two steps. The first finds a section by heading path (`heading-range`, which takes the nodes up to the next heading of the same or higher rank, subsections included; a nested path is a range inside a range). The second picks inside it with a selector over mdast's node names (`table > tableRow`, `listItem`). Attribute values in selectors are quoted (`[depth="2"]`). A heading is matched by its plain text, not by a text node, since `Super **fast**` is several. Every node carries its position, so an error can say `pump.md:12:1`, in the form the component files already use.

**What a run of text is.** The query returns a list of runs, each with its text and marks, not a string: marks nest (`**bold *and italic* text**` is three runs), runs with the same marks merge, and the layer applies them. This is why content cannot travel as a string variable: a text bound to one keeps its ranges only while the text is unchanged, and a new value comes back as one segment in one font (measured, [section 9](.reference/figma/measured_behaviour.md#9-rich-text-in-a-text-node)). Plain, unmarked strings can still be tokens.

**Marks as styles (proposed).** Measured: a range given a font name leaves the node's text style and stops following it, while a range given a text style of its own follows that style's later changes; hyperlink, decoration and fill leave the style alone. So bold and italic would be text styles, resolved by name like every other token, and a link would be a hyperlink plus `UNDERLINE` plus a fill that may be a colour token. The layer would say, once, how each mark looks:

- A mark the layer lists is kept, and the list is also the whitelist: there is no second flag. A mark not listed is unwrapped, its text stays, and it is reported in `notes` with its position.
- Bold and italic together is a third style. The command refuses a layer that keeps both and names no style for the pair, and a style name that does not resolve.
- The command refuses a node that is neither text nor styling (raw HTML, an image, a footnote, a checkbox state), with `file:line:column`. Dropping it can lose text: the spike glued "Esc" and "new line" together when `<br>` was dropped.
- A mark that only styles text and has no native equivalent (inline code, a blockquote) is unwrapped and reported.
- An ordered list that starts above 1 is numbered from 1, because `TextListOptions` has no start number, and is reported.

The alternative, not yet rejected, is a separate `keep` whitelist next to a mapping of marks to styles. It costs a second name for the same set, and leaves "what does bold look like" to be said elsewhere.

**What the engine would add.** A step that applies a list of runs to a text layer: the layer's text style first, then each range's style, hyperlink, decoration and fill, then list options and indentation per paragraph. Bold and italic by font name are not used.

**Its size.** The runs are printed into the script, so a long text competes with the engine for the 50,000 characters. The stored-engine upgrade under *Two runtimes, one engine* would carry content too, or the content could be a second payload.

**Still open:**

- the reference syntax and where it sits in a text layer;
- whether the layer's list of marks replaces the `keep` whitelist;
- how a query reports a section that matched nothing;
- what happens to a `marks` entry for a style the document never uses (probably nothing, but it should not warn).

### Sheets: designs assembled from components and content (proposed)

> **Status: proposed; its first part, the artboard file, is ruled below and is the thing to read for what is decided.** A component file says what a part is. A design that is assembled from parts and from content, a datasheet or a manual page, is a different thing, and it needs things a component file deliberately lacks: repetition, content, and values for an instance's properties. This note gives that thing its own file kind, the **sheet**, and leaves the component file as it is.

**Why a second file.** A component file is a fixed tree with variants: it is the desired state of one part, found again by stamp and patched in place. Content that varies with a document does not fit it. A table of twenty rows is twenty copies of one layer, and the number is in the document. Putting that in a component would make the part's shape depend on the data, and would make a design out of what is a library entry. The specs also rule instance overrides out of the component file, as "what a design does with a component". A sheet is that design.

**What Pug has, and what of it is needed.** Pug is a template language: a page calls mixins with data. The same split holds here, and most of its features already exist under other names.

| Pug | In Toghen | Needed |
|---|---|---|
| Mixin | A Figma component with properties. A mixin call is an `INSTANCE`. | No. Figma holds the library; the component file defines each entry. |
| `if` | `when` on variant axes. A section that matches nothing is an error, or marked optional. | No. A flag, not logic. |
| `include`, `extends` | Nothing. | Not yet. Add if a sheet outgrows one file. |
| `each` | Nothing. | **Yes.** The one real gap. |
| Interpolation | A reference to the item being iterated, and to a named input. | Yes, once `each` exists. |
| `:markdown` filter | A `(markdown)` tag that reuses the converter from *Text from documents*. | Optional: short fixed rich text. |

**`each`.** It takes an enumerable set from a content query, and its body is laid out once per item. A sketch, not a format:

```kdl
each row in=(content)"pump.md" {
    section "Specifications"
    select "table > tableRow:not(:first-child)"
    key "tableCell:first-child"
    INSTANCE "Spec row" component=SpecRow {
        props Parameter=(content)row Value=(content)row
    }
}
```

- **It expands in the repository**, before the engine, as the variant matrix does. The matrix expands what varies by axis; `each` expands what varies by content. Neither puts logic in Figma, and the engine still receives plain layers.
- **The body is an instance of a component, not inlined layers.** Inlined rows would carry every layer of every row in the printed script and meet the 50,000-character limit quickly. An instance and its property values are a few dozen characters. Setting an instance's properties is what a sheet adds to the format.
- **Every item has a key.** Identity is stamped, and an index changes for every row after an insertion, which would patch each one into the next. The key is taken from content (a first cell, a heading) and the sheet says which. Two items with one key are an error.
- **Rules address the template, not a copy.** A copy's address is its template's name and the key, so addresses stay unique where the component format requires it.

**Where it stops.**
- **No pagination.** Figma has no text flow between frames, and splitting content over pages means measuring text after layout, which is a typesetter. The sheet puts content into frames in an auto-layout stack, and a person decides where pages break.
- **No `if`, no `extends`.** See the table.

**Open.**
- **Rich text through a property.** A TEXT component property is a plain string. Whether marks survive on an instance's text that follows one is not measured, and it decides whether a row's cell can carry bold. If not, a row would need layers rather than a property.
- **What a sheet's output is.** A frame on a page, found again by stamp like a set, or something else. A frame has no variant members, so the reconcile is a layer tree compared by address and key.
- **The inputs.** Whether a sheet can take the document as a named input, so one layout serves many documents.

**Direction (stated by the maintainer), and what is built.** This templating language was to be made independent, and adopted by Toghen for the automated creation of Figma files, not left as a part of Toghen's component format. It is now independent: [kdlet](https://codeberg.org/egildo/kdlet) is its own repository, and a component file is a kdlet file.

- **Built:** inputs, references, guards, `when` and `else`, definitions and `+call`, and a vocabulary that gives kdlet Figma's layer kinds, fields and tags, with the variant axes as inputs. The split the note describes held, with the variant matrix and the value rules Toghen's, on top of fundamentals kdlet gives.
- **Still proposed:** `each`, which kdlet can read but a component file refuses, since nothing supplies a list; content queries and keys from documents; interpolation; and the sheet itself.

Any syntax decision in this note should be read against the same rule: one that cannot be stated without naming Figma belongs in the node vocabulary, not in the language. No timeline is set.

### Prior art

| What | Borrowed | Left |
|---|---|---|
| Toghen's own variable sync | Desired state compared with Figma's; drifted, abandoned and foreign | Planning outside Figma: here the state to compare with lives inside it |
| [class-variance-authority](https://cva.style/docs/getting-started/variants), Stitches | The variant matrix: axes, rules that match several axes, a list of values meaning any of them | Separate per-axis and compound sections: one ordered rule list says both |
| [Chakra slot recipes](https://www.chakra-ui.com/docs/theming/slot-recipes) | A rule patches named parts, not the whole component | CSS as the payload |
| [Terraform](https://developer.hashicorp.com/terraform/cli/commands/plan), [Kubernetes](https://kubernetes.io/docs/concepts/architecture/controller/) | Desired state, a diff, reconcile against a record of ownership | A state file beside the source: the stamps live on the nodes themselves |
| [story.to.design](https://story.to.design/) | Proof that code-to-Figma component sets with variants are wanted and workable | Rendering running code as the source: layer names come from the DOM, not the anatomy, and values arrive baked |
| [Lona](https://github.com/Lona/Lona), [Mitosis](https://mitosis.builder.io/docs/overview/) | Keeping a component's contract apart from its tree | A portable component model compiled to many targets |
| [KDL](https://kdl.dev/) and [@bgotink/kdl](https://github.com/bgotink/kdl) | The syntax, and a parser that preserves formatting and comments, for the day Toghen writes a file back | — |
| [kdlet](https://codeberg.org/egildo/kdlet) | The template language itself: inputs, guards, `when`, `define`. Toghen is its second consumer | Its own variants and matrix, which stay Toghen's |

### Axes from the tokens, and `include`

*Superseded 13 October 2026 for states: an axis comes from the parts vocabulary, not from an element-state modifier; see [Parts](specs.md#parts-axes-from-subgroups-folded-into-modes-or-one-variable-each). What follows records the build as it is.*

Status: **built, and run in a real file** (ruled and built 8 October 2026; first command-line run, [measured behaviour §11](.reference/figma/measured_behaviour.md#11-the-first-command-line-run-in-a-real-file)). Depends on *Variables per modifier: the sum*: a pin of one modifier's collection is what lets a variant fix a state while the frame around the instance decides the theme.

The direction: coordination with Figma stays in variable sync and component
files. The resolver gives the modes; a component file prints the variants wired
to them, may take its axes from the tokens, and generates every combination,
narrowed by `exclude` and `include`.

**An axis can take its values from a modifier.**

```kdl
properties {
    VARIANT State (modifier)"state"
}
```

The values are the modifier's contexts, in the document's order, the default context first, so it is the default member.

- Each member pins `modes state=<value>` on its root without a line written for it. A `modes` field the file writes on the root for the same collection is an error, since two writers of one pin would disagree.
- Adding a context to the document adds a member on the next run.
- The existing checks apply to the context names: no `,` or `=` in a value.
- `(modifier)` is a fourth tag beside `literal`, `property` and `key`, accepted only as a `VARIANT`'s value list, and a modifier the document does not have stops the read.
- Guards read the axis as before: `(input)State`.

**A component may name its token group, and get its state axes.**

```kdl
component Button tokens="{button}"
```

Every element-state modifier (`"inherits": false`) that the group's tokens depend on (lib's `dependsOn`, over the tokens under the group) becomes an axis, named after the modifier and taking its values from it as above, unless the file declares an axis with that modifier itself.

- Ambient modifiers never become axes: a designer sets theme and density on the frame an instance sits in, as CSS takes them from an ancestor. A file may still declare one by hand (a `Size` axis pinning density), which is then the author's choice, written out.
- An inferred axis comes after the declared ones, in resolution order.
- The group is a reference, read with the core's grammar; a group that names nothing stops the read.

**`include` beside `exclude`.**

```kdl
include State=rest Size=medium
include State=hover Size=medium
```

When any `include` is present, only the combinations an `include` matches are
built, and `exclude` then removes from those. Each line follows `exclude`'s
rule: one value per axis it names, an axis it does not name matching any value.
The default member must be included, as it already may not be excluded. Prior
art for the pair: Style Dictionary's `expand`, `include` and `exclude`.

## The pin model — designed, not built

*Superseded in part on 20 October 2026 by* The stamp, one receipt per object, for every target, *below: the Figma file is a target, not the reference, and the record holds hashes, not values. Kept as the record of the design round.*

> **Provenance.** This is the landing of a design round. Nothing below is built **except the first step, reading Figma's values back, which is.** The rest was argued from the spec and from what the engines can and cannot observe, and has not been tested against reality. Read it as direction, and expect the implementation rounds to amend it.

### The problem it answers

The plugin used to write to Figma and remember what it wrote, without ever
reading what Figma *holds*. Every difference it could detect was a difference in
the **document**; a designer editing a variable by hand was invisible.

**Step one is done.** `indexFigmaCollections()` now carries `valuesByMode`, and
`figmaValuesEqual()` compares the two sides in Figma's own representation, with a *relative* tolerance, because Figma stores float32 and `0.4` reads back as `0.4000000059604645`. `VariableSyncEngine` skips a drifted path with `reason: 'drifted'` and the explanation on the skip, rather than overwriting the edit; `drifted` is a subset of `skips` in `summarizePlan()`.

**Step two is done, and it moved a boundary.** The comparison now lives in `main/utils/correspondence.ts`, read by the engine *and* by the Inspector, so "where does this token stand" has one implementation and two readers. The
Inspector asks it a question the engine does not: **is Figma holding the
document's value?**, everywhere, rather than only where provenance says the
document stood still. Standing drift therefore turned out **not** to need the
pinned state; it needs only a direct comparison and something willing to look.
What still needs values rather than hashes is *reverting* a drifted token, which
is why the Inspector describes and never acts.

**What it still cannot see, and why that matters here.** Drift is detected only
where the document has *not* moved: there the recorded hash proves that what
was written is what the document still asks for, so anything else in Figma is a
local edit. Where the document has also moved, there is nothing to compare
against: the record holds a *hash* of a token value, and a hash cannot be
reversed. That limitation is not a gap to patch in the engine. It is the
concrete argument for the pinned state below holding **values**.

### The model

The Figma file holds a **pinned state**: the design system as this file knows
it, holding actual token *values*, not hashes. A JSON document is an **import
source**; the pinned state is the reference everything is measured against.

That gives two independent two-way comparisons rather than one three-way merge:

| Comparison | Question |
|---|---|
| pinned state ↔ Figma | has anything **drifted**? |
| import ↔ pinned state | is the document **behind**? |

Value-level *conflict* stops existing as a per-token state, because there is no question of who wins: the pin is the reference. A document arriving while drift is outstanding is a situation shown once, not a badge on four hundred rows.

### Vocabulary

- **pin** *(verb)*: promote Figma's current values to be the reference. Nothing is written to disk; something is held still. Optionally accompanied by downloading a new JSON.
- **drifted**: *moved since the last pin*. The definition and the name close on each other; that is the test the word passed.
- **revert**: restore a drifted token to its pinned value. Token by token, or by group.
- **behind**: an imported document that predates the current pin.

Chosen over `save` (which implies writing something down, when the operation
promotes one side over another) and over `touched`. `sync` survives as the name
of the feature.

The rhyme is dependency pinning (npm, pip, cargo), where a pin is a declared fixed point that stops things moving underneath the code that depends on it. It strains in one place worth knowing: package pinning is *prospective* (stop this changing), this is
*retrospective* (it changed, and the change is being blessed). Both reduce to
"this is now the reference point."

### What it costs

- **The state holds values, not hashes.** A token cannot be reverted from a
  hash. This is a swap rather than an addition: with values present, drift is a
  direct comparison and `lastSyncedHashes` disappears. Measured at 192 bytes per
  token (see *Sync-state persistence*); a colour value is
  roughly 45 bytes against a 6-byte hash, so values put that near 350 bytes per
  token. Against the 8-shard limit in *Sync-state persistence* that is still
  some 2,300 tokens, and the limit is ours to raise. **Size is not a reason to
  hesitate here**: an earlier draft of this section implied it was.
- ~~**The plugin must read Figma.**~~ Done; see above.

### The open gap: lineage

*"The state knows the document is behind"* is not yet a claim the plugin can make. It can tell that an import **differs** from the pin. It cannot tell whether that import is behind, ahead, or from an unrelated lineage, so importing a colleague's newer JSON would be reported as "behind" while overwriting the better version.

Proposed fix, using machinery already built: when a new JSON is downloaded, stamp the pin's revision into the file's **root `$extensions`** under `com.toghen.figma`. DTCG permits it (*"Groups MAY include an optional `$extensions` property"*), and a token file's root is a group. On import:

| Stamp | Reading |
|---|---|
| matches the current pin | genuinely **behind**: safe to say so |
| unknown revision | a different lineage: ask, never assume |
| absent | never been here; a first import |

Without the stamp, "behind" is a guess wearing a status badge.

### Where the model stops

Two designers in two Figma files can both pin, and there is no merge, nor can there be one without lineage deeper than a single stamp. A boundary of the design, recorded rather than solved.

### Still open

- ~~**Where the pin lives** (Egildo, 14 October 2026).~~ Ruled 20 October 2026: on each object, as a stamp (see the ruling below). He wants a sturdier pin system kept on the Figma objects themselves, as each object's own `$extensions`-like data (shared plugin data on a variable or a style), rather than in one record on the document root keyed by token path. The case for it is the drift bug of the same day: a record keyed by path carried one variable's hashes onto another, which a record kept on the variable cannot do. Not designed yet; it reshapes *What it costs* (no shard limit, one entry per object) and *Sync-state persistence* in the specs.
- ~~What a **first-class picture** of this looks like on screen.~~ Built: the
  Inspector, a tree of the token paths with a state per token and both sides'
  values side by side. It is where `revert` will live when there is something to
  revert to.
- Whether **orphans** get states of their own. A Figma variable no token claims
  is either *foreign* (never ours: leave alone) or *abandoned* (was ours, the
  token left the document: offer to remove). The plugin **can** now tell them
  apart: it enumerates Figma's side, and the sync record is the discriminator.
  Deliberately left out of the Inspector's first round; what remains open is not
  whether it is knowable but what that area of the screen is *for*.
- ~~Whether **refused** and **incomplete** belong in this vocabulary.~~ Settled
  in the Inspector, and the answer was fewer states, not more: everything that
  answers *can the link exist?* is one state, `blocked`, with a note saying
  which. A token with no value in a declared mode is not a state at all: it is
  a property of one mode's row.

## What has been built

Two numbering schemes ran here, one after the other, and keeping both would be
the doc equivalent of two sources of truth.

**Phases 0–7 built the capability**: skeleton and build, document loading and dispatcher, variable sync planning and execution, export, conventions and audit, query/scaffold/bindings, and the style adapter. All complete, all under test.

**Milestones M1–M3 rebuilt the screen** around what that capability could
already do, and each landed a rulebook entry per defect found:

| | What it did | Left behind |
|---|---|---|
| **M1** | Three panes, one shared result surface, a resizable window | R1–R8 |
| **M2** | The Design System pane says what the *file* records: coverage, dates, recents by name and version | R9–R14 |
| **M3** | The Inspector: where every token stands, read from Figma on demand | R15–R16 |

**Components from files: the format and the first build.** A component file is a kdlet file: kdlet reads it and evaluates it once per variant combination, and `shared/components/` reads the words that are Toghen's, checks each tree and turns it into a member (one variant combination, a component of the set), with no Figma involved. `run` in `main/components/` resolves every name the members use, finds what is already in the file by stamp (Toghen's marker in a node's shared plugin data), and creates a component set that does not exist yet, in the order the measured traps impose, stamped so that a later run recognises its own work.

**Components from files: the command.** `pnpm --silent --filter @toghen/figma components <file>…` reads, evaluates and validates each file in the repository and prints one script per component: the component's header and the file's packed document as JSON, the engine (with kdlet's evaluator in it) bundled in memory by `esbuild`, and one call. Any error stops everything and prints `<file>:<line>:<column> <message>`; nothing is printed for the files that were fine. The plugin runtime, which runs the same engine on what the command line sends, is built and described under *The command line*; reverts are what remains.

**Components from files: reconciliation.** Running a file against a set Toghen already made changes only the difference, in place: properties, members and layers are compared with what the stamps say Toghen made, node ids survive, what is not Toghen's is left and reported, and what breaks instances is named before it is written. The command that prints the script is built, and so is the gate that stops a run that would break instances; the design is *Components from files* below.

**Variables per modifier, and the command line, 8 October 2026.** Variable sync builds the sum (a base collection and one per modifier, names without a collection prefix, web code syntax, chain links `path--modifier`); a component file takes its state axes and its bindings from a CSS-keyed token group; and `toghen-figma sync` runs the whole job through the plugin from an npm script. All of it ran in a real file the same day ([measured behaviour §10 and §11](.reference/figma/measured_behaviour.md#10-collections-per-modifier-code-syntax-and-pins)): the sum, a reconcile, a breaking change refused and taken, and a removed context's mode deleted behind the same gate.

Open work is in *Remaining Work* below; the rules are in
[ux-rulebook.md](./ux-rulebook.md) and what prompted each is in
[ux-smell-log.md](./ux-smell-log.md).

## Remaining Work

- [x] Manual end-to-end validation inside a real Figma file: first run done.
      Colour (`0066CC` in an sRGB document), dark-mode values, 160% line height,
      bindings, dry run, export and cross-session persistence all confirmed. It
      found three defects, all now fixed: a document could not be reloaded after
      editing, `angleToLinearTransform` disagreed with the measured transform at
      0°, and an empty `{variant}` left a double slash in a variable name.
- [ ] Re-run the gradient comparison: the dark-only edit has since passed
      (`2 applied · 50 skipped · 0 failed`, both writes labelled `[dark]`)
- [ ] Build the pin model (above). Reading Figma's values back is done, and so
      is showing where every token stands; what is left is the pinned state
      holding **values** rather than hashes, which is what `revert` needs
- [x] **The screen rebuilt** (8 October 2026): four panes (System, Tokens, Selection, Templates), the plugin's own design system as a Toghen token document built through `@toghen/postcss`, the fonts inlined, the drift popover and the window's two sizes. See `ui.md`. Not yet run in Figma: every check so far is the preview page and the mock, and the main thread now bundles the component file reader, whose use of newer built-ins in the plugin sandbox has not been measured
- [ ] Compare a built set with its kept template, so the Templates pane can say which differ (see *Templates kept in the file*)
- [ ] Compare **styles** as well as variables. The Tokens pane marks a
      style-backed token `not inspected` rather than omitting it, so the gap is
      visible on screen rather than only in this list
- [ ] Decide what to do about **orphans**, Figma variables no token claims. The
      plugin can now tell *abandoned* from *foreign*; what is undecided is where
      on screen they belong
- [x] ~~Removing the Figma collection-name prefix~~: built with *Names and code syntax*
- [ ] Components from files (designed above). The file format on kdlet, its checks, the engine (creating and reconciling by stamp) and the command that prints its script are built; all five fixtures have been created in a real file through the stored engine, the layout reconciled, and the control reconciled through the stored engine. Built since, and run in a real file on 8 October 2026: the plugin runtime, which runs the same engine on the component and document the command line sends (see *The command line*), the gate on breaking steps, axes and bindings from the tokens. Still to do: reverts, which need the pin model's recorded values
- [ ] The command line (built, above, and run in a real file on 8 October 2026): the commands, pairing, `RUN_COMPONENT`, the plugin's half of the bridge and the dry run across steps. Still to do: the browser app, a published plugin's `allowedDomains`, and the style plan's collection name under `--collection`
- [ ] Text from documents (proposed above). The reference syntax first; then the converter from mdast to runs, in its own package; then the engine step that applies runs to a text layer
- [ ] Sheets (proposed above): a second file kind that assembles components and content, with `each`, content queries and instance properties. Before any code: measure marks through a text property, and decide whether the templating language is split out first (see *Direction* in that note)
- [ ] Check the `// unmeasured:` lines of `test/support/figmaScene.ts`, `figmaMock.ts` and `main/components/` one by one in a real Figma file. Passes of the engine have run in a real file (see *What a real file settled*, and section 8 of measured behaviour) and found no engine defect, but they read results back rather than measuring each assumption, so the mock's assumptions there are still the design's, not Figma's
- [x] **Variables per modifier, names and code syntax** (ruled and built 8 October 2026; run end to end in a real file the same day): see *Variables per modifier: the sum* and *Names and code syntax*. The question below is answered by them; kept for the record.
- [x] ~~**Question: independent modifiers in Figma.**~~ Answered by the sum (8 October 2026): one collection per modifier, aliasing across. What the 6 October review had settled or left open is now all ruled and built: a hole is refused; a variable's type and description come from the chain's base link and a varying `$type` is refused; a one-link token whose base is a reference is a plain alias, a chain exists only for two or more links; a generated link is named `path--modifier` with no collection prefix (`--` in a variable name verified live, §10); a non-factorable token is refused; a token that depends on a modifier only through a reference stays an alias in the base collection; and the behaviour was measured on Toghen-made collections (§10 and §11), not only hand-made ones.
- [ ] **Question: a mode's CSS selector in code syntax.** A modifier can now say how its contexts appear in CSS (`$extensions["com.toghen"].css`, read by `getContextSelector`). Whether a variable's mode can carry that, so code syntax names the selector as well as the property, is not looked into
- [x] ~~Persisting the loaded resolver document, so reopening the plugin does
      not require re-loading the JSON~~: done by the recents list above, which
      stores each document and loads it back by name. Reopening still takes one
      click rather than none; making the last one reload automatically is a
      separate question about whether a plugin should act before being asked

## Moved from the specs: history, upgrade notes and removed passages

These passages were history in a living section and moved here unchanged, under the heading of the section they came from.

### Moved from *Variables per modifier: the sum*: the removed-context rule's status

(*ruled and built 8 October 2026; run live the same day, [measured behaviour §11](.reference/figma/measured_behaviour.md#11-the-first-command-line-run-in-a-real-file)*). 

### Moved from *Variables per modifier: the sum*: the old collections rule

 (The first rule, "a collection holding a mode the sum does not have", read the sum's own `state` collection as foreign once a context left the document, and froze it: found by the first breaking run in a real file.)

### Moved from *The command line*: the first run

> **Status: built on 4 October 2026, run in a real file on 8 October 2026.** Built and proved first against a fake plugin over a real localhost socket, with the real handlers and the Figma mock behind it, and the plugin's screen in a browser against a real run of the command; the bridge alone had been measured in Figma with a throwaway plugin ([measured behaviour](.reference/figma/measured_behaviour.md#a-plugin-reached-from-a-local-process)). Then, in `TEST_GROUIND` with the real plugin in the desktop app:
>
> - a dry run and a real `sync`, which found two defects, both fixed the same day ([measured behaviour §11](.reference/figma/measured_behaviour.md#11-the-first-command-line-run-in-a-real-file));
> - a reconcile through the plugin, keeping every id;
> - a breaking change, refused without `--allow-breaking` and taken with it;
> - a removed context's mode, deleted behind the same gate;
> - the pairing code renewing after the plugin was closed.
>
> Still open: see [open questions](decisions.md#the-command-line).

### Moved from *Reference resolution belongs to the library*: the removed copies

Those copies were more forgiving than the library in
the wrong way: a bare number became pixels, an unknown unit was read as `px`,
and garbage became `0`, so a broken token produced a zero-sized style instead
of an error.

### Moved from *Reference resolution belongs to the library*: the removed composite resolver

The plugin previously carried its own `resolveCompositeValue()` in `styleSyncEngine.ts` because the library did not walk composites. It has been removed: it duplicated token semantics in an adapter, swallowed resolution errors, and collapsed a `fontFamily` array to its first entry, which W3C DTCG §9.1 forbids during resolution.

### Moved from *Values, mapping and bindings*: upgrade notes

**Upgrade note.** A `fontFamily` token whose value is a stack hashes differently
now, so each such variable is re-set once, from the joined string to the first
family. Single-family tokens are untouched.

**Upgrade note.** `hashToken()` hashes the *resolved* value, and typography
tokens whose `fontFamily` is a reference now resolve to an array rather than a
string. Expect a one-time full re-sync of text styles on the first run after
this change; subsequent runs settle back to `SKIP`.

**Upgrade note.** The alias target is part of the hash of an aliased mode, and
only of an aliased one: a token that is not an alias hashes exactly as before.
Expect a one-time re-set of aliased tokens on the first run after this change,
as each baked value is replaced by its alias; subsequent runs settle back to
`SKIP`.

**Upgrade note.** The bindings are part of a style's hash only when at least one is written: a style that binds nothing hashes exactly as before. Expect a one-time update of styles with bindable members on the first run after this change, and again for any style whose target variables are created later (run variables, then styles); subsequent runs settle back to `SKIP`.

### Moved from *Bindings from a CSS-keyed group*: the collection name before 8 October 2026

Until 8 October 2026 only the variable
  plan took the name: the command line's `--collection` renamed the base
  collection for variables while styles went on looking under the document's
  name, so every reference in a style fell to the warning below. Found by
  reading, fixed the same day, tested with a run whose `--collection` is not the
  document's name.

### Moved from *The command line*: the plugin's size

 The plugin's `code.js` grew from 204,647 to 251,086 characters minified (453,573 to 538,820 unminified), of which about 41 kB is the engine with kdlet's evaluator and about 5 kB the screen's new group, which `code.js` embeds.

### Moved from *The command line*: the problem the printed scripts answered

Components from files work, and they reach Figma the hard way. The command prints a script, an agent copies it into `use_figma` character for character, and the script must fit in 50,000 characters. The engine has to be stored in the file first, about 40,000 characters, and stored again after every change to Toghen. On 4 October 2026 a one-line fix to the engine meant copying all of it by hand once more.

### Moved from *One runtime: the plugin*: the printed scripts

Printed scripts existed so that an agent could reach a file through `use_figma`, and nearly everything around them served that tool's limits: 50,000 characters of code, about 20 kB of return value. The document was packed to fit, the engine was stored in the file and checked by id, a component too big was refused, and the report was summarised. The command line reaches the plugin over a local socket with none of those limits, and it has run in a real file. So the scripts go, and with them everything that only they needed:

**An engine stored in a file by an earlier version** stays there, unread. Nothing deletes it; it is a few kilobytes of plugin data on the document root.

The printed scripts are removed (*One runtime: the plugin*): `--print`, `--stored`, `--out` and `--engine` are gone, and `components` runs through the plugin like the other commands.

- `toghen-figma components --print`, `--stored`, `--out` and `--engine`, and the printing in `cli/components.ts`;
- the stored engine: storing it in shared plugin data, its id, the check, and evaluating it with `new Function`;
- the document packed for travel (`shared/components/compact.ts`), and the script's size refusals;
- the summarised report, where only the script needed it.

### Moved from *The command line*: the bridge measurements

What the throwaway plugin measured:

| Question | Answer |
|---|---|
| Can the UI open the socket? | Yes, with `ws://localhost:3055` under `devAllowedDomains`. A published plugin declares it under `allowedDomains` with a `reasoning` (documented, not measured) |
| Does a request reach the Plugin API and return? | Yes: pages and variable collections read in 7 ms |
| Is there a size limit? | None found: 10,000,000 characters arrived whole in 150 ms |
| Does it recover when the command stops and starts again? | Yes: the UI retries and reconnects |
| Can the command tell the plugin from another page? | No: the socket's origin is `null` |

### Moved from *Key Files for Reference*: the printed-script command

| `cli/components.ts` | `components --print`: one script per component file for `use_figma`, and the engine's |

### Moved from *Key Files for Reference*: the packed document

| `shared/components/compact.ts` | The document packed to travel in a script, and unpacked there |

### Moved from *Sync-state persistence*: the root record

`extensionsCache` maps a token path to the Figma object backing it and to the
hash of the value last written there. It is what the dirty check reads.

It is stored in the Figma file, under `figma.root` shared plugin data in the
`toghen` namespace, by `main/utils/extensionStore.ts`. That is the only place it
can correctly live: variable and style ids are file-scoped, so a record carried
around inside the JSON document is valid only for whichever file produced it.
On load the two are merged field by field, with the file winning.

The shape on disk is one JSON object, `{ tokenPath: extension }`, escaped to
pure ASCII and split across numbered shards with an index recording the count:

```
toghen/extensions      {"v":1,"shards":2}
toghen/extensions.0    …
toghen/extensions.1    …
```

Three constraints shape that:

- Figma caps one entry at **100 kB**, counting namespace and key. A few hundred
  tokens across two modes crosses it, and the throw would land *after* the sync
  had already written to the file.
- The cap is in **bytes**. Escaping to ASCII makes characters and bytes agree,
  so the budget can be enforced with `String.length`, and makes a surrogate
  pair unsplittable across a shard boundary.
- There are no transactions. The index is cleared first, then the shards, then
  the index: an interrupted write reads back as "no record" and costs one full
  re-sync, rather than as a record that is subtly wrong.

`MAX_SHARDS` (8, ~800 kB) is **ours, not Figma's**. Figma enforces the per-entry
100 kB above; whether it also caps plugin data across a whole document is not established here: it is absent from the typings and from the vendored docs, and there is no API to ask. The limit is a courtesy to other plugins, and a knob.

For scale: measured on a document of 45 tokens across two modes, its record occupied **8.4 kB in one shard**, about 192 bytes per token, so one entry holds roughly 500 tokens and the 8-shard limit sits some 95× above real usage. 

### Moved from *A recorded hash belongs to one variable*: the record's rulings as built

> Built. A recorded hash counts only for the variable it was recorded for; a record that moves to another variable starts again; `--overwrite-drift` takes the document's side.

**The problem.** The record keeps, per token path, the variable's id and one hash per **mode name**. Nothing ties a hash to the variable it was written to. When the variable behind a path changes (a token that moved collection when the parts became collections of their own, a variable recreated), `updateExtensionsAfterVariableSync` merges the new hashes into the old ones, so a hash written for `disabled` in the old variable stays in the record of the new one. When the new variable's collection later gains a `disabled` mode, the planner finds that hash, equal to the document's, reads the mode as already written, and writes nothing. Figma fills the new mode with its default, and the next run reads the difference as a local edit and protects it. A disabled item renders white on white, and the sync calls it drift.

**1. Reading: a hash counts for the variable it was recorded for.** `documentUnmoved` holds only when all of these do:

- the link is the recorded variable itself (`use` through the record's `variableId`, not `adopted` by name, not `create`);
- Figma holds a value for the mode (a mode the collection does not have yet, or has no value in, was never written);
- the hash recorded for the mode equals the document's, as now.

Anything else is stale and written. A path adopted by name, or created, is written whole, as a first sync is.

This cannot repair a record the old merge already damaged on the variable it now names: there Figma holds a value (the default it filled in), the variable is the recorded one, and the stray hash matches. Such a mode reads as drifted, and `--overwrite-drift` below repairs it.

**2. Writing: a record that moves to another variable starts again.** When the variable a run wrote to is not the one the record names, the record's hashes are replaced by those of the modes written now, not merged into. A record whose variable is unchanged merges as now, so a run that stopped halfway still resumes.

**3. `--overwrite-drift` takes the document's side.** A record already wrong cannot be told from a real edit, so drift needs a way to be resolved without editing every mode by hand. `PLAN_VARIABLE_SYNC` takes `overwriteDrift`; the command line spells it `--overwrite-drift`. With it, each drifted mode is planned as a `SET_VARIABLE_VALUE` with the document's value, and the record is written for it as for any other. The dry run with the flag lists those writes; without the flag, a drifted path is skipped as now, and its message ends `pass --overwrite-drift to write the document's value`. All or nothing: a list of paths waits until someone needs to keep some drift and overwrite the rest. The screen never sets it, as with `allowBreaking`; its drift row names the command-line flag, which a person at the screen cannot act on there. Prior art: `kubectl apply --server-side` refuses a field another manager owns, and `--force-conflicts` takes it.

The record still holds hashes, not values, and still lives on the document root, keyed by path. Moving it onto the variables themselves is ruled, not built: see [the stamp](decisions.md#ruled-the-stamp-one-receipt-per-object-for-every-target-20-october-2026).

### Moved from *The stamp module*: the first step

> Built: the module and the test fakes. Not built: any sync reading or writing it. The variable and style syncs, and the components, move onto it next, in two lanes that touch different files.

### Moved from *What a variable is for*: the record and the unit

- *The record sees the unit.* The hash of an opacity cell includes the unit. Without it, a variable written as `1` before this round would read as unmoved (its hash matches the document) and disagreeing (Figma holds `1`, the plan wants `100`): drift, protected, never fixed. With it, the first run after this round reads every opacity as moved and rewrites it.

### Moved from *Reading it back for the screen*: the record's date

`main/utils/syncState.ts` turns that record into `SyncStatePayload`: whether the file carries one, how many entries, when it was last written, and, with a document loaded, how much of it the record covers. The System pane reads that, and it is answerable **before any document is loaded**, which is what lets the empty state say "this file was synced on the 12th" rather than nothing.

### Moved from *Recently loaded documents*: the record's date and its limit

`runtimeState` holds no sync metadata. `lastSyncedAt` is answered by the sync record itself, which survives the plugin closing.

Past `MAX_SHARDS` the plugin clears the store and tells the user through `figma.notify`. A stale record produces `SKIP — unchanged` for values nobody
wrote; a redundant re-sync does not.

## Ruled: the hand-over round (13 October 2026)

- **A declared axis and an inferred one of the same name.** Ruled: the declared axis wins. Rejected: merging only when the values agree, which still refused the reported case; the inferred axis winning, which overrides what the author wrote. A declared axis against an inferred one that would fold is refused, since a mode cannot hold a declared value with no part.
- **The offline check.** Ruled: a command, `toghen-figma check`. Rejected: exporting the reader as built JavaScript, a public API to document and keep from a private package, when an agent needs a command.

## Ruled: a renamed axis, and a set Figma reports as broken (14 October 2026)

A sync stopped on two sets with Figma's `Component set has existing errors`. The cause was the run itself: an axis renamed in the parts vocabulary paired no member, so every member was created anew beside the old ones, the first append broke the set, and the next read threw.

- **The crash.** Ruled: the set is read only while it is consistent, and new members are built away from it and appended together. Rejected: catching the error and carrying on, since the reads it guards are the keys the wiring needs.
- **A renamed axis.** Ruled: inferred under a strict rule (one name changed, same position, same values) and applied with `editComponentProperty`, which keeps every member and instance. Rejected for now: a declared rename like Terraform's `moved` block, since the axis often comes from the parts vocabulary, which the component file does not name and which the library should not burden with Figma's history, and since the line is dead once run. Wanted if the inference gets a real case wrong. Rejected: leaving it as delete and add, which takes every instance's variant on a change of name alone.
- **A renamed value.** Left open: a value gone and another come is a replacement as often as a rename.
- **A set already broken.** Ruled: named, member by member, from the children's names, which stay readable; also in the check before any write. Rejected: deleting and rebuilding it under `--allow-breaking`, since a new set has a new key and breaks every instance in every file that uses it, which is what reconciling in place exists to prevent.

## Ruled: a recorded hash belongs to one variable (14 October 2026)

A sync reported twenty variables as drifted that nobody had edited, each white in a mode the sync itself had added. Read from the code, not reproduced: the record's hashes are keyed by mode name per token path, and a hash written to an old variable survived into the record of the new one, so a new mode of the same name read as already written.

- **Reading.** Ruled: a recorded hash counts only for the variable it was recorded for, and only where Figma holds a value for the mode.
- **Writing.** Ruled: a record that moves to another variable starts again instead of merging.
- **Taking the document's side.** Ruled: `--overwrite-drift`, all or nothing, listed by the dry run. Rejected for now: a list of paths, wanted when someone needs to keep some drift and overwrite the rest. Rejected: writing every mode a run adds in the same step regardless of the record, which the reading rule already covers.
- **Where the record lives.** Left to the pin model: Egildo wants it kept on the Figma objects themselves (see *The pin model*, *Still open*).

## Ruled: a folded part that refers to its own rest (15 October 2026)

After `--overwrite-drift`, the twenty white values were still white, and a read of the file found 36 of them. Each belonged to a part token that refers to its own rest, a pattern components use so that a host overriding the rest in CSS does not reach the part. Folded, the part's reference pointed at the very variable it became a mode of, and the plan wrote that variable as an alias of itself; with two folded axes, a loop through the earlier axis's link. Figma refused the write and kept the white it gives a new colour variable. Reproduced in the mock, which had accepted the self-alias silently. The diagnosis of the round above was therefore wrong for these values; its rulings stand on their own.

- **A part that refers to its rest.** Ruled: it falls back to the rest, as if the part did not exist. Rejected: writing the resolved value, which loses the alias the rest has; dropping such parts as redundant, since the CSS needs them.
- **A part that refers to a sibling part.** Ruled: it takes that part's cell, by the same rules. Rejected: the resolved value with a warning, which was the behaviour and named the sibling wrongly as not a variable.
- **A safety net.** Ruled: the plan never writes an alias that leads back to its own variable through any mode; it writes the value and warns. Built over-cautious: a held alias about to be replaced counts too, which costs one run.
- **The mock.** Ruled: it refuses an alias that loops, through every mode. Unmeasured against Figma: the message, and whether Figma follows every mode.


## Ruled: what a variable is for (16 October 2026)

A consumer's file had about 3,700 variables, every one at `ALL_SCOPES`, and every member that bound an opacity variable drawn at 1%: Figma reads a `FLOAT` bound to a layer's opacity as a percentage, and the token held `1`. Both defects come from one gap: a W3C token does not say what it is for. Walked one point at a time with Egildo.

- **Where purpose comes from.** Considered: the type alone (too coarse: a dimension is a gap, a radius or a width); a richer type of Toghen's own, as Tokens Studio has `opacity` and `spacing` (a type the format does not have); the name, as Style Dictionary's category/type/item reads the path; where a token is bound; a declaration, as Figma sets scopes per variable by hand. Ruled: all but the richer type, in order. A declaration wins; then the name; then the tokens that refer to it; then the type, for scope only.
- **The name.** Ruled: the last key, read through the table component files already use to infer bindings, so the two readers cannot disagree. Naming leaves by CSS property is Toghen's component model, not a consumer's convention. An opacity found by name must be a number from 0 to 1, or it is refused: a wrong unit draws a button at 1%, so the unit needs certainty where a scope can be a best guess.
- **References.** Ruled: a token with no purpose of its own takes the purpose of what refers to it, scope as the union. It must: a Figma alias hands over the raw number, so a primitive must be in its referrer's unit. Where an opacity and a plain number meet on one primitive, the primitive stays plain and the opacity referrer is written as its value, with the existing warning for a value written instead of an alias.
- **Usage.** Ruled: a check, not a source. A unit mismatch in a component file's binding stops the component; a scope mismatch is a note. Rejected as a source: a variable's scope would depend on which component files happen to be synced, and the variable plan reads tokens alone.
- **The type.** Ruled: a fallback for scope only, never the unit. A bare `number` is kept away from opacity. What stays at all scopes is listed once as a note, not as warnings.
- **Hiding primitives.** Ruled: no default. A system hides a branch by declaring an empty list on its group. Rejected: hiding by default, a policy every other system would have to undo.
- **The declaration's key.** Ruled: `$extensions["com.toghen"].figma.scopes`, beside `figma.value`, holding Figma's scope names verbatim, the nearest holder winning. Rejected: Figma's own `com.figma.scopes`, which Figma's native export writes: Toghen giving meaning to another vendor's key would borrow its voice, and Toghen never imports from Figma, so no round trip asks for it. `OPACITY` in the list makes the token an opacity, and may not be mixed with another scope.
- **Existing variables.** Ruled: scopes follow the drift rule. Toghen records what it wrote; untouched scopes are rewritten, a designer's are kept unless `--overwrite-drift`; a variable with no record is rewritten only if it still holds what older Toghen wrote. Rejected: rewriting every run, which the consumer's issue proposed, since it would erase scopes set by hand.
- **Learned while specifying.** The record's hash did not cover the unit, so without a change every opacity written before this round would have read as drift and been protected forever. The hash of an opacity cell now includes the unit. Figma's typings settle one unknown: scopes only filter pickers, and the Plugin API binds a variable in any scope.
- **Measured the same day** in the test file: a variable bound to opacity is read divided by 100 and clamped at 100; an empty scope list is accepted; Figma refuses `ALL_FILLS` or `ALL_SCOPES` beside the scopes they cover, and any scope that does not suit the variable's type, which the declaration rules now repeat. A paint's opacity cannot be bound through the Plugin API at all.
- **Amended after the build** (17 October 2026). The build showed that a primitive hidden with `[]` stopped being an opacity, since a declaration wins and the empty list holds no `OPACITY`; its opacity referrers then lost their alias. Ruled: an empty list only hides; whether the token is an opacity still comes from its name and the tokens that refer to it.
- **Open.** `COLOR_OPACITY`, the opacity of a paint, has a unit no code can measure; a declaration naming it is refused until someone measures it by hand in Figma's picker.

## Ruled: strays, the board, and where sets go (17 October 2026)

A consumer's file showed three defects after a run that stopped halfway and three later runs: two empty members loose at a page's origin, a 55-member set laid out as one 4,000 px column, and that set grown down over the four sets below it. Read from the code: a member is created loose and appended afterwards, with no rollback in a plugin; the grid put only the last axis across; a set that existed was never moved. Walked one point at a time with Egildo.

- **A failed step.** Ruled: a step that fails removes every node it created. No alternative was weighed: a half-built member is never useful.
- **Strays.** Ruled: found once per run, since a stray's stamp names no component; every removal is a breaking step, listed, and taken only with `--allow-breaking`. First proposed: a stray with no instances deleted freely. Withdrawn before the spec was written, because it contradicts the ruling of *Breaking steps stop a real run*: the run sees instances in this file only, and a loose component in a published library may be used elsewhere. A member dragged out of its set by a designer is a stray too; the set is the truth.
- **The board.** Ruled: a pivot table, the variant matrix designers draw by hand and that variant-organizing plugins produce: axes across and down, nested in declared order, gaps growing outward (40 px a level), empty cells kept so columns align, the default member top-left. `across="a, b"` on the component line chooses the axes across; without it, axes go across from the last until the columns are at least the rows. Left out: row and column labels, which a component set cannot hold, since it may hold only its members.
- **Where sets go.** Ruled: Toghen records where it placed each set and artboard, and after every run restacks the ones still there, leaving a set moved by hand alone and flowing around it. A set from before this round is moved only if it overlaps another. Rejected: restacking every set on every run, which undoes a designer's arrangement; never moving a set, which is the defect. The rule is the drift rule's: what Toghen wrote and nobody changed is Toghen's to change.

## Ruled: a FigCraft target (19 October 2026)

Egildo asked for the plugin to work in FigCraft as well as in Figma. Investigated first, against FigCraft 0.7.0 run live from the command line, then a route agreed with him.

- **Whether FigCraft runs the plugin.** It does not. FigCraft's plugins are WebAssembly modules with a JSON manifest, run in an interpreter with no file system or network, acting only through FigCraft's commands; their panels are fields FigCraft draws. Its documentation says JavaScript plugins written for other apps do not run, and lists running Figma's as an open decision of its owner that would need a JavaScript engine and an API shim. So no `manifest.json`, `code.js` or `ui.html`, no `figma.*`, no `figma.ui.postMessage`.
- **What it offers instead.** A loopback control socket (`--control <port>`) running the same commands as its menus, and an MCP server over it (`figcraft-cli mcp --attach`). Measured: collections with named modes and mode ids, four variable types, values per mode, aliases, scopes with Figma's names, Web code syntax, rename, modes added, renamed and removed; text, effect and paint styles with variables bound to their fields; frames, auto layout, components, variants, component properties, instances, variable bindings on layers and a variable mode per frame. A request takes about 15 ms; a `command.batch` runs many commands in one frame as one undo step, resolves `{"$step": n}` to an earlier step's id, and is undone whole when a step fails.
- **The route.** Considered: the plugin running in FigCraft as it is, or with small guards (impossible, above); a Rust or WebAssembly port of the plugin as a FigCraft plugin (a second plugin to keep, for a screen FigCraft would draw with its own widgets); a FigCraft target behind the same plans; not yet. Ruled: the target, built in two stages, variables and styles first. Components later, since the component engine works on Figma's nodes directly and would need a second snapshot and apply; the variables and styles go through two narrow seams, the reads the plans make and one operation writer.
- **How the target runs the plans.** Ruled: the plugin's own handlers, run by the command line in its process, with a `figma` that answers their reads from FigCraft and an operation writer that sends FigCraft commands. Rejected: a `figma` that also writes, mirroring Figma's synchronous setters and ids, since `createVariable` returns an id at once and FigCraft answers later; the ids recorded would have been the mirror's. Rejected: talking to FigCraft through `figcraft-cli mcp`, a second program in between for what the socket already does.
- **Which file.** FigCraft acts on the file a window shows, and the run found a second program driving the same FigCraft and switching its tabs. Ruled: the run pins the file shown when it starts, and every batch shows that file again before its steps and lists the tabs after them; a file no longer at its tab stops the run. Rejected: a check before each write, which leaves a frame in which a tab switch sends the write elsewhere, about once in two switches. A window of its own per run would be cleaner, but FigCraft keeps one window while a screen reader runs, which it was on this machine.
- **Found while building.** FigCraft's documentation says a text style's value takes `node.set`'s spellings; for case and decoration it takes `case` and `decoration`, and ignores `textCase` and `textDecoration` without a word. A style that is updated keeps its bound fields, which then override the new value, so a bound field is let go first. FigCraft binds no font weight on a text style. A variable is made with a value in every mode (0, `true`, black or empty), as Figma's are.
- **Open: the sync record.** FigCraft keeps the layer data a command writes, but no command reads it back, so the record of what Toghen wrote does not survive the run. Every run therefore writes every value again, a hand edit is overwritten with no drift warning, and a renamed token makes a new variable. Ways it could come back, none chosen: a FigCraft command that reads layer data, asked of FigCraft upstream, after which the record lives where Figma's does; a private variable collection holding it, which shows in the variables panel and in FigCraft's CSS export; a file kept by the command line beside the repository, which belongs to one machine and fails for an unsaved file; skipping a value FigCraft already holds when no record speaks for it, which would change the plan's rule in Figma too.

## Ruled: the stamp, one receipt per object, for every target (20 October 2026)

Designed, not built. Two things brought it up. FigCraft's command line can now read back the layer data a command writes, which the FigCraft target was waiting on for its sync record. And on 14 October Egildo asked for the record to live on the Figma objects themselves (see *The pin model*, *Still open*). He asked for it in general: one way to track what Toghen wrote, for variables and for components, in every target, so a diff and a sync are quick. Walked one choice at a time with Egildo.

- **What the Figma file is.** Ruled: a target. It receives the token file, as every other target does. Rejected: a peer that can be ahead of the token file, which is what *The pin model* designed, with the file's pinned state as the reference and the token file as only an import source. Toghen turns one token source into many targets, and a peer would make it two sources. A hand edit worth keeping goes back into the token file.
- **What the record holds.** Ruled: a receipt. For each field Toghen owns, the field's name and a hash of what the target reports right after the write. Hashing what the target reports, not the token's value, makes a later read compare exactly, even where Figma stores a number less precisely than the JSON (`0.4` reads back as `0.4000000059604645`). It also sees a hand edit where the document has moved too, which today's record cannot, since its hash is the token's. Rejected: values, which *The pin model* chose so that a token could be reverted from the record. In a target, reverting writes the document's value again, which the document already holds; values would be a second copy of the truth. The canon went the same way: Kubernetes first kept each object's full last-applied configuration on the object, and its server-side apply later kept only which fields each tool manages.
- **Where it lives.** Ruled: on the object it describes, as Kubernetes keeps it, in shared plugin data in the `toghen` namespace. Variables, collections and styles take it as layers already do. A record on an object cannot be carried onto another one, so the defect of *A recorded hash belongs to one variable* cannot happen by construction. Rejected: one record on the document root, keyed by token path, as Terraform keeps its state. It is what Toghen has today, and the defect came from it. The cost of the choice is reading every variable's data on each run: a few hundred small synchronous reads.
- **Ids in the token file.** Ruled: none. A target's ids belong to one file, and one token file feeds several. Export may still write the record out for reading; import never reads it back. The token file's root `$extensions` keeps only the document revision, which *The open gap: lineage* needs to say an import is behind.
- **The name.** Ruled: *stamp*, the name the code already gives each node's record (specs, *Identity is stamped in the Figma file*). One entry per object now says both which object it is and what Toghen wrote there. Rejected: *pin*, which now means a frozen reference, the model ruled out above. It stays the name of that model here.

### What it collapses

**Variables and styles.** The root record goes, and with it the sharding and the write order that serve it (kept templates still use them: they are content, not state), the hashes carried from plan to execution, the merge of the record with the token file's `$extensions` on import, and the rule that resets a record that moves to another variable. A variable is found by its stamp; matching by name stays only to adopt a variable with no stamp. Two comparisons remain: document against stamp (the document moved), and target against stamp (drifted).

**Components, layers and frames.** Each node's six keys (`component`, `properties`, `member`, `address`, `artboard`, `placed`) become one entry: what the node is, the fields Toghen applied with their hashes, and where Toghen placed it. The list of fields becomes the receipt's keys. A member stops writing every declared field on every run: an unchanged field is skipped, and a field edited by hand is drift, kept and reported as for a variable. The artboard digest goes.

**FigCraft.** Only layers and pages hold data there, not variables or styles. Its stamps live together in one record on a page, keyed by object id, in the same shape: the root record's form, kept only where the object has no room of its own. Asking FigCraft for data on variables and styles would remove the exception.

### How it lands

First run after the build: read the root record, write a stamp on each object it names, delete the record. One way only. Order: the stamp module, and test fakes that hold data on variables and styles; variables, then styles; components; FigCraft, once its release ships. After the first step the two lanes touch different files.

### What the read found

Read from the code, not reproduced: when a style's recorded id is gone, the style sync adopts a style by name and still trusts the old record's hash, and the record is never reset when the style behind a path changes. So a style the run never wrote can be skipped as unchanged. *A recorded hash belongs to one variable* fixed this for variables only. A stamp on the style removes it the same way.

### What the build found: variables and styles (20 October 2026)

Built for variables and styles; the components are the other lane's. The root record, its sharding, the hashes carried from plan to execution, the merge with the token file's `$extensions` and the reset of a record that moves are gone; see *Sync-state persistence* in the specs.

- **The document against the stamp.** A receipt hashes what Figma reported, so on its own it cannot say whether the document moved. Built: where Figma still reports what the receipt says, it holds exactly what was written, and the document is compared with it as before (`figmaValuesEqual`); where Figma moved, it is drift whatever the document did. No second hash of the document was needed, and the hashes that existed only to make the old record read as moved (the unit of an opacity, the first family of a stack) went with it.
- **Styles have drift now.** Before, a style edited by hand was kept only while the document stood still, and nothing said so. A style is now compared field by field with its receipt, a drifted one is a `SKIP` that says so, and `--overwrite-drift` reaches the style plan too. Comparing a style with the document needed a comparison of its own (`holds`), within float32's tolerance, since a style has no `figmaValuesEqual`.
- **Two machines with different fonts.** The record's hash ignored which family a machine fell back to. A receipt cannot, so a fallen-back style is compared both as this machine would write it and as one with the first family would.
- **No time on the screen.** The stamp holds no time, so the System pane and the Tokens pane lost "synced on" and "written". The sync line says *Written by a sync*, an event rather than a claim that everything agrees, which keeps R11.
- **A moved token's old variable keeps its stamp**, so the move is listed on every plan until it is taken, where the record forgot it after the first run that did not take it. A component file's ambiguity message now tells the two variables apart by their stamps and the token's home, not by code syntax.
- **Collections carry no stamp.** Nothing reads one: collections are found by name, as before. Wanted when a collection renamed by hand should be found again.

### What the component build found (20 October 2026)

Built for components, layers and artboards: one stamp per node, a receipt per layer, drift kept and `--overwrite-drift` for components too. The specs say how it works ([*Identity: what is ours*](specs.md#identity-what-is-ours)); this is what the build ran into.

- **The receipt is taken last.** A member's wired layers take the set's property keys only when the member joins the set, so a receipt read right after the layer's own write named keys the set no longer has, and the next run read every wired field as drift. Every receipt of a run is written once its writes are done.
- **One write resets another.** `cornerRadius` sets every corner, `strokeWeight` every side, and a resize resets hug sizing. Writing only the field that moved left the others changed under their receipts, read as drift on the next run; the fields a write resets are written after it.
- **The file's side is worked out, not hashed from the file.** Comparing the file with a receipt of what Figma reported needs what Figma would report for the file's value: a token as its variable, a wired field as the set's key, a number as float32. A wired field carries the value it shows too, since a changed default changes it without changing the key. Where that guess can be wrong, the cost is a write on every run, not a missed edit.
- **An artboard follows the set's rule.** It had its own: the file won on every property and text it set, said as an `OVERWRITE`. The ruling makes a hand edit drift for every target, so an artboard keeps one too, and `OVERWRITE` now says that `--overwrite-drift` wrote over it. A layer an artboard's person renamed is still not renamed back for that alone, as the digest had it.
- **Templates could now be compared.** A dry run plans a patch only where a receipt says so, so the screen's *not compared* could be answered; nothing asks yet.

### What the review found (20 October 2026)

- **Migration took Figma's word.** Both migrations stamped what Figma held at upgrade time as written, so a hand edit the old build kept became written and the next run overwrote it. A field Toghen cannot prove holds what it wrote is now stamped `UNPROVEN`, a hash no report has: it is taken as written once Figma holds the source's value, and reads as drift otherwise. For the root record that needs the document, so the migration waits for one to load. A document that moved while Figma held the old value reads as drift too; the record's hash cannot tell it from a hand edit.
- **Agreement is not drift.** A component field Figma had moved to the file's own value was reported as drift on every run. It is now stamped again without a write, as a variable's mode is.
- **A variable a person moved** into another of the document's collections could be removed as a move. The record knew its collection; the stamp knows the modes it was written in, so a variable none of whose receipt's modes belong to its collection is left alone. Every variable a token left behind is listed, not the last.
- **The mock kept numbers exactly**, so no test could tell a receipt of the read-back from one of the value sent. It keeps them as float32 now, as Figma does.

## Moved from the specs: the components' six stamp keys, reverts, and a hand edit on an artboard

These passages left the specs when the components moved onto the stamp, and moved here unchanged, under the heading of the section they came from.

### Moved from *The stamp module*

Its status line then is above, under the first step.

The components' six keys stay in the module beside it until the component sync moves over.

### Moved from *Identity: what is ours*

Reconciling needs to know what is ours, and a name cannot say it: a designer renames layers. So every node Toghen creates carries a **stamp**, shared plugin data in the `toghen` namespace, the one the plugin already uses on the document root.

| Node | Key | Value |
|---|---|---|
| component set | `component` | the component's name in the file |
| member | `member` | its combination, `Columns=grow share, Header in=content` |
| layer | `address` | its address in the file, and the fields Toghen set on it, as JSON |
| component set | `properties` | the names of the component properties Toghen added, since a property cannot carry data of its own |

The snapshot finds them with `findAllWithCriteria({ sharedPluginData: { namespace: 'toghen', keys: [...] } })` on each page after loading it with `page.loadAsync()`, so a set is found wherever a designer moved it.

| a stamped layer, same kind | patch its fields; re-parent and re-order it if the file moved it |

**Reverts are later.** A stamp says what is ours; it does not say what value we last wrote. Restoring a hand edit means writing the document's value again; the stamp will record, per field, a hash of what Toghen wrote, so a hand edit can be seen field by field (ruled, not built: [the stamp](decisions.md#ruled-the-stamp-one-receipt-per-object-for-every-target-20-october-2026)).

### Moved from *Artboard files*

**A hand edit.** The file wins on what it declares: a property or text the file sets is set again on every run, and the plan says when it overwrote a value that differed. A property the file never mentions is left alone. This is the rule the component engine follows for what it manages (see [open questions](decisions.md#components-from-files), where a field the file stops declaring is left and reported).

### Moved from *Templates kept in the file*

What it does not do yet: say whether a built set still matches its file. A dry
run cannot answer it, since it re-applies every declared field whether or not
anything changed, so the screen says *not compared*. A comparison would read
the snapshot against the members field by field; it is wanted when someone asks
which sets are stale, and *Build everything that differs* waits on it.

## Ruled: a copy carries the stamp (20 October 2026)

Found by the review of the stamp's build. In Figma a duplicated layer takes its shared plugin data with it, so a copy holds the original's stamp, and nothing told the two apart: a lookup picked one by the order of a map or a search, so Toghen could patch the copy, leave the original unmaintained, or delete a layer a person made. Whether duplicating a variable or a style copies its data too is not measured; the rule covers them either way. Walked with Egildo.

- **What tells them apart.** Ruled: the stamp records the Figma id of the object it was written on. Prior art: Kubernetes, where ownership names an object's `uid` rather than its name, so an object that only looks like the owned one is never taken for it. The id stays inside the file, which the stamp ruling allows; it bars ids from the token file only.
- **Both exist.** Ruled: the object whose id matches its stamp is Toghen's. The other is a person's copy: never patched, never deleted, never counted as Toghen's.
- **Only one exists, and its id does not match.** Ruled: it is the original, moved. Cut and paste gives a layer a new id, and nothing else distinguishes that from a duplicate whose original was deleted afterwards. Toghen adopts it and writes its new id into the stamp. Rejected: treating it as foreign, which would rebuild a layer a designer only moved.
- **What a copy becomes.** Ruled: listed in the dry run as a copy of Toghen's object, left alone. Rejected: ignoring it without a word, since a copy nobody notices becomes a question later.
- **Sets and artboards.** Two sets or artboards with one stamp used to stop the run. Under this rule the id decides there too, and the copy is listed like any other.
- **A stamp with no id.** Every stamp written before this rule has none: it is read as matching its object, and the id is written on the next write.

### What the build found (20 October 2026)

Built for variables, styles, sets, members, layers and artboard frames; the specs say how it works ([*Sync-state persistence*](specs.md#sync-state-persistence), [*The stamp module*](specs.md#the-stamp-module-first-step-of-the-ruling-built-20-october-2026), [*Identity: what is ours*](specs.md#identity-what-is-ours)).

- **Grouped by the id a stamp names.** A copy pasted into another member, or onto another page, has no twin of its address or name beside it. Grouping the objects whose stamps name one id, and looking that id up wherever it is, finds its original all the same; grouping by what a stamp says the object is would have read it as an original moved.
- **A stamp with no id can still be copied.** Two sets or artboard frames whose stamps are both their own, stamped before the id and copied since, cannot be told apart by it, so the run still stops for them, naming both.
- **What is inside a copy goes with it.** A copied frame holds copies of its layers; they are left out with it and not listed one by one, so a duplicated set is one row.
- **A write that is only a stamp.** A variable or style moved, with nothing else to write, gets a plan step of its own, `STAMP`, counted as an update. A layer's is a `PATCH_LAYER` with no fields, as for a receipt taken again.
- **Not measured.** Whether Figma's duplicate of a variable or a style copies its shared plugin data, and whether `clone()` copies a node's. The mock's `clone()` does.
- ~~**Still open: a copy whose original Toghen removes.**~~ Ruled the same day; see *A copy whose original Toghen removes*, below. When a run deletes the original (a layer the file dropped, a member gone, a variable its token left behind), the copy is, on the next run, the only object left whose stamp names another id: by the ruling, the original moved. It is adopted, and the step that removed its original can then remove it too. Telling the two apart needs a record of what Toghen removed, which the stamp, on the object, cannot keep.

### A copy whose original Toghen removes (ruled 20 October 2026)

Walked with Egildo.

- **Ruled:** when a run deletes an object Toghen wrote, it strips its stamp from every copy of that object in the same run. The copy becomes a plain object of the person's: never adopted, never removed. No record of what Toghen removed is needed: a copy can only be made while its original exists, so a run that deletes an original sees every copy it has. Stripping removes Toghen's own data and nothing of the person's, so it is not the patch the copy ruling forbids. The dry run lists each strip on the deletion's row, and the strip happens only if the deletion does.
- **Rejected:** a record of what Toghen removed, kept on the document root, which brings back the central record the stamp ruling retired.

#### What the build found (20 October 2026)

Built for the variables a token left behind, members, layers and strays; the specs say how ([*Sync-state persistence*](specs.md#sync-state-persistence), [*Identity: what is ours*](specs.md#identity-what-is-ours)).

- **No step removes a style or a set**, so neither strips anything. A copied set loses stamps only where the run deletes a member or a layer of the original: the copies of it, and of what is in it.
- **A replaced layer is a deletion too.** `REPLACE_LAYER` removes the old node, so its copies are stripped; the layers inside it move to the new node and keep theirs.
- **A row names the outermost copies.** A copied member's layers are stripped with it but not listed one by one, as a copy is one row. A layer deleted inside another that is deleted names its copies once, on the first of the two rows.
- **The copy's own row stays.** The plan that strips a copy still lists it as a copy left alone; the strip is said on the deletion's row, and a removal that is not taken leaves the row's words true of what taking it would do.

## What the real-Figma test found (20 October 2026)

A sync run in the Figma desktop app, against the stamp's build. Three defects, each fixed with a test that failed before; the specs say how it works now ([*Identity: what is ours*](specs.md#identity-what-is-ours), [*The first run after the upgrade*](specs.md#the-first-run-after-the-upgrade)).

- **A bound radius is reported on its corners.** Measured: after `cornerRadius` is bound to a variable, `boundVariables` holds `topLeftRadius`, `topRightRadius`, `bottomLeftRadius` and `bottomRightRadius`, each naming it, and no `cornerRadius`, and `node.cornerRadius` reads as the resolved number. The receipt hashed that number while the file's side was the variable, so every run wrote the radius of every member again, and a token's new value would have read as a hand edit. A field Figma binds by its parts now reads as bound when every part names one variable, and as `{ variable: null }`, which no file's value leaves, when they name different ones or only some are bound. The Plugin API's bindable fields have two such: `cornerRadius` and `strokeWeight`, whose sides are taken to be reported the same way (not measured). The test fake reports them so. The same reading fixes two other readers of `boundVariables`: the audit, which called such a binding unbound, and the Selection pane, which listed four corners. The variable and style syncs are not affected: a style's bindable fields have no parts.
- **A dry run migrated the root record.** The load turned an older build's root record into stamps and deleted it whatever the run, `--dry-run` included. The command line now tells the load it is for a dry run, and the stamps are then worked out in memory, read by the plans as the objects' own, and not written. Ruled with the fix: the migration waits for the first real load, not the first write, since the load is where it already ran. The screen asking for the sync state after a dry run's load does not migrate either.
- **A style was proved whole.** Measured: a text style whose size alone was edited by hand before the upgrade had all seven fields stamped `UNPROVEN`, and its drift row named all seven. The migration now proves a style field by field, as a variable mode by mode, so the row names the size alone. Also measured: Figma reads a style's font back with `variationSettings` (`{ wght: 400, slnt: 0 }` for a regular weight), which nobody set; the receipt now hashes the font's family and style only, so a machine that reports other settings does not read it as changed. The test fake reads a font back so.
- **Not done.** A radius set as a number with one corner set apart reads as Figma's mixed value (so the Plugin API types it; not measured), which no file's value matches, so such a layer's radius is written on every run, as it was. A style field is proved against what this machine would write only, so on a machine that falls back to a later family of a stack, a font another machine wrote with the first stays unproven beside a field edited by hand.

## Ruled: a component file gives an instance its properties (21 October 2026)

From the issue *A component file can give an instance its properties*: a composite built from the atoms (a row holding a badge, a person, a segmented control) could make an instance of an atom but not tell it what to show, since `set` was an artboard word. So every composite drew its atoms inline, and an atom's change no longer reached them.

- **Ruled:** `set <Name>=<value>…` on an `INSTANCE` in a component file, with the artboard's rules: display names, a variant's value, a boolean, a text, a swap; refused with the line when the component lacks the name or the value. A value is a literal or `(input)<axis>`, so each member sets its own. The build found the engine already generic: the reader kept `set` as a field, the resolve held an instance against its component, the receipt hashed `set Name`, the diff patched it. What changed is the `artboardOnly` flag on the field, the two gates that applied the properties only on an artboard run, and the resolve, which held instances only on one. A problem found in several members of a component file is said once.
- **Not buildable: `(property)` on a `set`,** the issue's second kind, a `TEXT Name` on the composite reaching the nested instance's `Name`. Measured the same day ([measured behaviour §13](.reference/figma/measured_behaviour.md#13-a-nested-instances-properties-cannot-be-wired-to-the-hosts)): the Plugin API refuses a nested property key on `componentPropertyReferences` (`Unrecognized key(s)`), and refuses any reference on a layer inside a nested instance (`Cannot set component property references on instance sublayer`). The Figma UI has no such link either: passing a nested instance's property through to the host's is an open Figma feature request, so this is Figma's model, not an API gap. What Figma has is exposure, `isExposedInstance`, which lists the nested instance's properties on the composite's instances and makes no property of the composite's. **Built the same day as a field,** `isExposedInstance=#true` on an `INSTANCE`, named as Figma names it like every other field; refused in an artboard file, whose instance is inside no component. Not a wire, and not written in the issue's form; the issue closes with the measurement.
- **Not built: `slot` on an `INSTANCE` in a component file.** The issue did not need it, and a component file has `SLOT` layers of its own to keep apart from it.

## Ruled: the adapter no longer normalizes a chain's values (21 October 2026)

**Status:** ruled and built.

The core now gives each step of a `$value` chain, and its base, in the shape it stores (see the
[lib's decisions](https://codeberg.org/Toghen/lib/src/branch/main/decisions.md#ruled-a-chains-values-come-in-their-stored-shape-21-october-2026)).
`cellFor()` in `main/utils/sum.ts` no longer normalizes a step or the base of a cell with no `figma.value` key. Two
calls to `normalizeTokenValue()` stay, since neither puts a chain value in its stored shape. A keyed cell checks its
value against the Figma type, which for a token with no `$type` is the type of the value the key names: the core
keeps such a value as written, and a value that type rejects is one Figma cannot hold. And the key's own literal is
normalized, which is not a chain value. Every golden file is the same. A test in `variableSum.test.ts` writes a
colour that a context spells as a hex string, one typed by its group, and reads back Figma's colour.

## Built: the field table's token column (22 October 2026)

Unit 1 of the Figma round (`.reference/plans/toghen-figma/plan-2026-10-22.md`). The field table had no binding column: whether a field binds, how, to which variable type and scope, and whether Figma reports it on parts, was listed again in `groups.ts` (`scopesOfField`, regular expressions), `boundVariables.ts` (`BOUND_BY_PARTS`, `PAINT_PROPERTIES`), `apply.ts` (the size limits, the thirteen dimensions, the sides, `CORNERS`, `SIDES`) and the receipt's if-chains.

- **Built.** `FieldSpec.token`, `{ types, bind?: { call, field, variable, scope?, parts? } }`, filled for every field that takes a token: opacity, the six sizes, the sixteen dimension fields, `strokeWeight`, `fills`, `strokes`, `textStyle`, `effectStyle`. `scopesOfField` keeps its signature and reads the table; `BOUND_BY_PARTS` and `PAINT_PROPERTIES` are derived from it; `apply.ts` reads its lists from it, and `withResets` reads the parts; `reportedOf` and `expectedField` branch on the table where they branched on a field's kind (paints, wires, styles, tracks). A test holds the table against a list taken from the roster for every field it has. The roster's line on `primaryAxisAlignItems` is corrected (typings 1.139.0 declare `SPACE_EVENLY` and `SPACE_AROUND`), and its Toghen column says *bound*, *written as a value* or *plain* on every row Toghen covers.
- **What the build found.** The existing suite passed unchanged, receipts included, so no built set rewrites itself. The plugin's target library (ES2017) has no `Object.fromEntries`, so the derived maps are built by a loop. Two orders changed where nothing depends on them: `BOUND_BY_PARTS` lists the corners clockwise, as `apply.ts` did (only ever read as a set), and `opacity` is now written before the other dimensions rather than after (independent properties).
- **Decided alone.** A style field carries its token type and no `bind`: a field whose value kind is `token` names a style, so no `call: 'style'` was added; the roster calls those rows *bound, to a style*. `scope` is a list, or `{ text, other }` for a fill, the smallest shape that holds what `scopesOfField` said (a text's fill is `TEXT_FILL`, any other layer's `FRAME_FILL` and `SHAPE_FILL`). Every scope is a list, even of one, so a reader never asks which. `visible` and `characters` get no column yet: they take no token today. The receipt still names `modes`, `grid`, `component` and the two styles where it treats one field alone.

## Built: the adapter asks the core what it answers (22 October 2026)

**Status:** ruled and built. Unit 6 of the [plan of 22 October](.reference/plans/plan-2026-10-22.md#unit-6-ask-the-core-what-it-answers),
findings 1.1.3, 1.1.4, 1.1.6, 1.1.7 and 1.1.8. What the adapter asks now is in
[*Integration Contract with @toghen/lib*](specs.md#integration-contract-with-toghenlib).

- **Lookup paths sliced by hand (1.1.3): closed.** `sum.ts`, `purpose.ts`, `folds.ts` and `designSource.ts` take a
  lookup path's reference path with `referencePath()`. The check in `sum.ts` that a path starts with the collection's
  name went with its slice: the sum holds one collection, so every lookup path is in it. **Kept:** the concatenations
  that build a lookup path (`${dsName}.${refPath}`). `lookupPath()` reads a first segment named like the only
  collection as that collection, so a group of that name would lose its tokens; the concatenation has no such case.
  Also kept, as planned: the filters over Figma stamps by the collection's prefix (`variableSyncEngine.ts`,
  `styleSyncEngine.ts`), which no document answers.
- **"Is this a token" (1.1.3): closed.** A component file's names are checked with `Collection.getNodeKind()` instead
  of a set built by resolving every token of every mode. A document with a broken token no longer stops the check of
  the names; the token is reported where it is synced.
- **The default mode (1.1.4): closed.** `resolveSumModes()` takes `getDefaultMode()`, and the sum's cell with no
  modifier reads it. `orderedModeNames`, always `modeNames`, is gone. The fallbacks `modifier.default ??
  modifier.contexts[0]` in `figmaContexts()` and `designSource.ts` are now the declared default alone:
  `resolveSumModes()` refuses a modifier with none before either is reached. A test declares a theme's default after
  its other context and gets the same default mode, payload, contexts and Figma collection.
- **The reference grammar (1.1.6): closed.** A test showed that the core's `referencesIn()` reads `{hue.(input)hue.soft}`
  and `{space.(input)"Header in".md}` each as one reference, written whole. `expandSegments()` in `axes.ts` now finds
  references with it, and `BRACED` is gone. `axes.ts` may import the lib: both runtimes that read a component file
  carry it, and `members.ts` and `read.ts` already imported from it. The sentence in the specs that said `members.ts`
  was free of the lib was stale, from when a component was printed as a script, and is rewritten.
- **Paths in any mode (1.1.7): closed.** One function, `pathsInAnyMode()` in `resolverModes.ts`, called by the sum,
  the token graph, the document's counts and `designSource.ts`; `unionOfPaths()` is gone. The document's token count
  now counts a token that only a context defines, as its comment always said it did, and so does its style count.
  `snapshotModes()` still reads one mode at a time, which is the core's own `getAllPaths(mode)`.
- **Who refers to a token (1.1.8): closed.** One function, `referrersOf()`, beside the walk; the sum's purposes and the
  token graph's `referencedBy` both read it. The `Referrer` type moved there from `purpose.ts`. Its order is by
  referring token, then mode, where the sum's was by mode first: the purposes sort their scopes, so nothing written
  changed.
- **The stale comment (1.1.8): closed.** `flattenDesignSystem.ts` no longer cites `ds.entries`.
- **Not touched:** finding 1.1.5, a chain step normalized by the adapter, was closed on 21 October (the entry above).

## Built: the blueprint reader and its needs (22 October 2026)

**Status:** built, as unit 13 of the plan of 22 October 2026 (section 2.6). The specs say how
([*Blueprints*](specs.md#blueprints)); the format is [component-files.md](component-files.md#blueprints).

- **The shape.** `<page>.blueprint.kdl`: one `page`, at most one `tokens` (the core's three forms of `load`, with
  `name` and `overrides`), any number of `library`, and `component` and `artboard` bodies, each the file minus its
  header line, whose attributes stay on the body's line. `guard` and `define` at the top are shared by every body.
  Component and artboard files stay readable alone (the maintainer's answer).
- **Built.** The reader, which hands each body to the readers of today's files; the needs (tokens, libraries,
  every component named, those the blueprint defines marked satisfied, keys listed as keys); keeping a blueprint
  in the file, refused with every problem when it does not read.
- **Not built.** Building a blueprint as a whole, a blueprint from the command line, holding `tokens` against
  what was loaded, resolving the needs in Figma (units 11 and 14), the page created by a run.
- **Decided alone.**
  - *How a body reaches the readers:* as the blueprint's text with everything but the body and the shared `guard`
    and `define` blanked to spaces, and the body's braces too. Lines and columns are the blueprint's with no
    change to kdlet or to the readers. **Rejected:** re-serialising the body, which moves every line; an offset
    or a parsed node list handed to the readers, which kdlet does not take.
  - *A shared guard or define is read with every body,* so it is checked by each: a guard that reads an axis
    one component body has is refused in another component body that lacks it. A problem with it is said once.
  - *A blueprint is kept under its page's name,* and a blueprint and a component file cannot share a name in
    the list, since a row is found by its name. **Rejected:** keying a blueprint by its file name, which the Build
    pane would have to undo.
  - *Two bodies of one kind and name are refused,* since they would build one set or artboard twice.
  - *An artboard body is read with no inputs when kept,* since nothing on the screen supplies them; one that
    reads `(input)` is refused there. An artboard file alone is still not kept.
  - *Building a kept blueprint is refused,* saying it is not built as a whole yet, rather than reading it as a
    component file and listing problems that are not its own.
  - *`preferred` keys are not listed as needs.* A preferred value is a choice offered in Figma, not a component
    the page builds from.

## Built: load through the core, in the plugin and the command line (22 October 2026)

**Status:** built. Unit 7 of the plan of 22 October ([plan](.reference/plans/plan-2026-10-22.md), 2.1); the reference and the specs say how it works now ([*The load*](reference.md#the-load), [*Commands and arguments*](specs.md#commands-and-arguments), [*Recently loaded documents*](specs.md#recently-loaded-documents)).

The plugin never called the core's `load`: the screen sent one file's text, and the main thread parsed it and built a resolver. Only a self-contained resolver document loaded, and the message for a token file, written for R13 (smell #29), said it could not be loaded, which the core's loading chapter made false. The command line called `load` with one path and dropped what it answered besides the document.

- **Built:** `LOAD_DOCUMENT { files, entry, name?, overrides?, dryRun? }`, and `load(entry, { read, name, overrides })` on the main thread with `read` a lookup among `files`. `looksLikeTokenFile` and its message are deleted; every failure is the core's or the resolver's own message. The document state carries `composition` (form, entry, reads, the map with its hash and unused keys). `Overrides` is exported once from `shared/protocol.ts`.
- **Decided: the load's rows ride on `DOCUMENT_LOADED`,** as `report`, a `PlanPayload` with the new `planType: 'load'`, rather than a `PLAN_READY` of their own. The result surface takes only plan payloads, so a plan-like payload is the smallest honest route; but a second message after the load would race the command line, which takes the first `PLAN_READY` after its next command as that command's plan. A differing collision is a `WARNING` with the token path, an equal one a `NOTE` (quiet, R4), an unused key of the map a `WARNING`, one each (R14). Nothing executes a `load` report. The surface heads it `load`, not `load plan`, and shows no zero counts of creates and updates (R6).
- **Decided: the command line sends the files themselves,** every file its own `load` read, by absolute path, with the entry as absolute paths, and the name and map as given. The plugin runs the same `load`, so its composition and its collision rows are its own, and the command prints the rows the plugin answers with. *Not chosen:* the bundle as one file and the composition beside it, which would have the screen show an account of a load its own `load` never made.
- **Decided: `components` refuses a `.json` positional.** Its design system comes from `--resolver`, which now takes `--name` and `--overrides` like any entry; a `.json` beside its component files would otherwise be read as a component file.
- **Decided: the System pane changes its words, not its shape.** One picked file is sent as `{ files: [{ path, text }], entry, name }`, the name being the file's without its extensions, since a flat pick has no folder for the core to name a collection after. The empty state now says a token file loads. The folder pick, the multiple pick, the editable name (R10) and the map's table are the Load pane's, unit 8.
- **Decided: a recent keeps the bundle and the composition,** not the files, and a recent loaded again is marked `fromBundle` and reports no rows: its collisions were reported when its files were loaded. An entry of the old shape, the text alone, is read as a resolver document once and the list written back.
- **`check` drops its round trip:** the resolver is built from the document `load` returns, and the entry takes the same forms as the other commands.
- **Not measured: `BigInt` in the Figma sandbox.** `load` hashes the map with `BigInt`, called as a function rather than written as a literal, so the plugin still bundles for ES2017. Whether Figma's main-thread runtime has `BigInt` is not measured; if it lacks it, a load with an overrides map throws there, and a load without one never reaches the hash. The screen sends no map until unit 8; the command line does with `--overrides`.
- **Not done:** `check` prints no collisions, since no plugin answers it. `--input` loads its document as before, with no name or map of its own.

## Built: the Load and Sync panes (22 October 2026)

**Status:** built. Unit 8 of the plan of 22 October ([plan](.reference/plans/plan-2026-10-22.md), 1.3, 2.1, 2.5); the screen is described in [ui.md](ui.md#the-five-panes), the areas in [ux-map.md](ux-map.md).

The System pane is split in two, and the tab strip reads **Load · Sync · Tokens · Selection · Templates**. Selection and Templates keep their names and code until units 10 and 14.

- **Built: Load.** Nothing loaded: the dropzone takes several files, **Choose a folder…** opens an `<input webkitdirectory>` whose `webkitRelativePath` is sent as each file's `path`, the recents and the record callout as before, the Source card at the foot. A pick does not load: it waits in a *To load* card with the entry the pane chose, the collection's name in a field for token files (R10), an optional overrides map, and **Load** beside them (R3). Loaded: the form and the entry, one row per file read, the overrides map as a table, the collections the document makes, and the Source card. A recent loaded from its bundle says so.
- **Built: Sync.** The identity card, *In this Figma file* and the Sync card, moved whole; its tab is inert with nothing loaded, as Tokens' is. A reply saying nothing is loaded brings Load forward.
- **Built: the overrides table** (`ui/components/overrides-table.js`), a function the panes call with their rows and their two column names, so the Build pane can draw Figma objects with it. A key that matched nothing is a row with the warning icon and its words in the warning tone (R4).
- **Built: smell #44 closed.** `DocumentStatePayload.collections` carries `axis: true` for a folded part axis's collection (`buildPayloads.ts`, from the sum's own flag), tested in the structured shapes in `partsFold.test.ts`. The table says *part axis* after such a name, and *modifier* after a modifier's.
- **Built: R8 amended,** with the maintainer's sign-off: its spot is the Load pane, its limit and reason unchanged.
- **Decided alone: the entry rule.** The first picked file named `.resolver.json`, or whose top level parses to a `resolutionOrder` list (one `JSON.parse` per file, the core's own test), is the entry; otherwise every picked file is a token file, the list in pick order the entry, a folder's files in the order of their paths, since a browser's folder order is its own. Only `.json` files are taken from a pick. *Not chosen:* asking which file is the entry, a question nearly every pick answers by its names.
- **Decided alone: every pick waits for Load,** a resolver document too, not only token files. The overrides map applies to a resolver document's `$ref`s as much as to anything, and one flow is one set of behaviours to keep correct.
- **Decided alone: the name comes from the first dot.** `brand.base.tokens.json` gives `brand`, as unit 7's screen did; the field is there to change it.
- **Decided alone: the strip's padding below 400px.** At 320px with the old rule (no padding on a tab) five labels fitted, but a sixth as long as *Templates* sat flush against its neighbour, `SelectionTemplatesTemplates`, whole yet unreadable as three words. Below 400px the strip now gives up its own inset and each tab keeps 4px a side (`--tg-sp-1`).
- **R7, looked at in the preview** (`pnpm --filter @toghen/figma preview`, a 320 × 600 size added to the page) with the browser pane, at 320px and 460px in the light theme, and once at 980px in the dark. Measured in the frame: at 320px the five labels are whole (each label's `scrollWidth` equal to its `clientWidth`), on one line (every tab 36px tall), the strip not scrolling (`scrollWidth` 320). A sixth tab added by script, labelled *Templates*, the longest label there is: all six whole, on one line, at least 8px between labels, the last ending at 316px. The pick was driven by calling the pane's `read` with constructed files, since the browser's file dialog cannot be driven: a flat pick of two token files, a folder pick with a resolver document, a folder of token files; Load and a recent round-tripped through the fixtures.
- **Not measured, still: `BigInt` in the Figma sandbox.** The screen now sends an overrides map, so a load with one reaches the hash unit 7 noted; it has not been run inside Figma.
- **Not built:** a folder dropped on the dropzone (a drop takes files; a folder is chosen). A test of the entry rule: `ui/` has no test runner, and the rule was checked in the preview only.
- **Found:** smell #45, the Sync table's modes cell cutting *not in Figma* at 320px (R12); open.

## Built: the field writer (22 October 2026)

**Status:** built. Unit 2 of the plan of 22 October ([plan](.reference/plans/plan-2026-10-22.md), 2.2); the specs say the rule once ([*From file to Figma*](specs.md#from-file-to-figma)), the reference gives the contract ([*The field writer*](reference.md#the-field-writer)).

The writes of a token-carrying field were spread through `applyFields` (`setDimension`, `paints()`, `hexPaint`, the style calls) and their reads through the receipt's branches. A solid paint bound to a colour token dropped the token's alpha: Figma binds a paint's colour and not its opacity (measured §14).

- **Built:** `writeField(build, node, layer, field)` in `main/components/fieldWriter.ts`, through which every field with a `token` column in `applyFields` is written: bound by the table's `bind`, a style for `textStyle` and `effectStyle`, the resolved value where there is no binding, a literal as given. Its twin `reportField(node, field)` is the receipt's read of a paint, a style and a bound or plain field. `Resolved.valueOf(path)` gives the core's value at the declared defaults; `resolve()` asks for it for every colour on a paint and every token on a field with no binding, and refuses, with the line, a token that needs it when no document is loaded or the document lacks it. A colour token with an alpha below 1 binds the paint's colour and writes the paint's `opacity` as the alpha, said once per run, field and layer in the report's warnings.
- **Ruled by the maintainer: the context of a written value is the declared defaults,** the core's default mode (the sum's `defaultMode`), the same in every member, named by its mode name. **Next step:** the context the layer's pinned modes name, wanted when a pin makes a written value wrong (a member pinned to a dark context whose alpha differs from the default's).
- **Found:** the core names the default mode with its contexts joined by a slash (`light/comfortable`); the report uses the name as the core gives it.
- **Found: per-side weights need `INSIDE`** (measured §7), so `strokeAlign = 'INSIDE'` stays a step of writing a side's weight, and is said in the specs as a creation step with the cleared fill, the cleared line stroke and `strokeWeight = 0`. Removing it would change what a set built before draws. `strokeAlign` as a field is unit 3's.
- **Decided: a paint's receipt names its opacity only when it is not 1.** A bound paint read as `{ variable }` before; it still does at opacity 1, so no receipt stamped earlier changes its hash, and the existing suite passes unchanged in its receipts. A bound paint at another opacity reads `{ variable, opacity }`, so a second run writes nothing and a hand-edited opacity is drift.
- **Decided: with no document loaded, a colour stops the run only when its variable holds an alpha below 1.** Refusing every colour token without a document would refuse every file that binds a colour today and has never needed the core. Figma's variable is read to tell that a value is needed, never for the value written. A document that is loaded but lacks the token is refused the same way when the variable is translucent.
- **Decided: the line names the root layer once** (`"fills" of "Badge"`), and a nested layer as `<component>/<address>`. It goes into the report's warnings, as the run writes. **Changed on review, the same day:** a dry run says it too, for every field its steps would write as a value (a created set, member, artboard or layer, and a patch's fields), once per field and layer, since R10 puts a choice made for the person on screen before the command runs, and for a component file the dry run is that before. `valueLine` makes the line for both runs, so they say the same words.
- **Decided: the mock keeps a paint's opacity as float32,** as Figma keeps a variable's numbers (§1); unmeasured for a paint, and marked so. One existing assertion of a literal's opacity now compares with the float32.
- **Not done:** where the Apply pane shows the dry run's line is unit 10's. A token on a field without a binding is wired through `resolve()` and the writer for dimension and size fields, but no such field exists yet; units 3 to 5 add them.

## Built: the lock and the locator, in the plugin (22 October 2026)

**Status:** built. Unit 11 of the plan of 22 October ([plan](.reference/plans/plan-2026-10-22.md), 1.4, 1.5, 2.3); the specs say why ([*The lock*](specs.md#the-lock)), the reference owns the shape and the messages ([*The lock*](reference.md#the-lock)).

- **Built: the record,** `toghen/lock` on the root, through `shardedData.ts` (`main/utils/lockStore.ts`): per library its components, styles and variables by name, `by`, and `fileKey` where a run could read it; Build's overrides map beside them. No hash, no time, no receipt: the stamp ruling stands.
- **Built: two of the three fillers.** `DISCOVER_VARIABLES` (rows to the result surface, `planType: 'discovery'`) and `LOCK_PICK`; with `GET_LOCK`, `LOCK_FORGET`, `SET_BUILD_OVERRIDES` (`main/handlers/lock.ts`). The command line's filler is unit 15.
- **Built: the locator's order** in `resolve.ts`: the overrides map, then a declared library through the lock (import by key), then the file. A name in the file and in a declared library stops the build naming both; so does a name in two declared libraries. `RunOptions.libraries` carries the declared libraries; nothing passes it yet but a test, since a blueprint is not built as a whole.
- **Ruled by the maintainer, recorded:** the manifest gets `"permissions": ["teamlibrary"]` and `"enablePrivatePluginApi": true`, so `figma.fileKey` reads while the plugin is in development; **a published plugin would lose `figma.fileKey`**, and the lock does not depend on it. Variable keys go in the lock. Library styles are filled as components are. A name found both locally and in a declared library stops the build. Build's overrides map lives in the lock's record. Built against the typings and the mock, marked unmeasured where §15 is silent, without waiting for the library to be published.
- **§15, as it bears here:** an unpublished key fails as an unknown one does, so a failed import says *not published, or not this key: publish the library, then accept its update in this file*. The typings give no library's name for a remote component or style (checked: `ComponentNode`, `BaseStyle`), so a pick always carries one from the screen.
- **Decided alone: a key in the overrides map is written `(key)"…"`,** as a component file writes one; any other value is a name. A library's name can be replaced too (the plan's 2.1). The map applies to every run in the file, being the file's record, and each replacement is said among the run's notes.
- **Decided alone: discovery's rows.** One per token the kept files bind: found, a choice, not found, or not a variable of the document (R14, R16). A choice drops any key written for that variable earlier, from every library, so the lock never answers a choice. A choice the overrides map names is a quiet note.
- **Decided alone: discovery matches by the collection the sync gives with the document's own name** (`figmaCollectionNameFor`), as the variable sync does by default; a library synced under a collection name passed by hand is not found. A run whose declared libraries hold variables needs the document loaded, and stops on each token without it.
- **Decided alone: a style is kept by the target token path,** the reference followed as the local lookup does; a pick spells the path from the style's name (`/` to `.`), which cannot be exact for a key holding `/`. A pick takes text and effect styles; `PAINT` stays in the shape, read by nothing yet. A pick of a local component is refused.
- **Decided alone: a declared library with no entry is a note,** not a stop: everything may still resolve in the file.
- **Decided alone: the old `(key)` failure keeps its words** and ends with the new reason, so the two say the same thing.
- **Found: the mock's import messages disagreed with §15** (`Could not find a published component with key …`). They now read `Component with key "…" not found` and `Component set with key "…" not found`, and a set imports for real; one scene test changed with them.
- **The mock** gains `withLibrary` (collections, variables, styles, components, sets; `published`, `enabled`), `figma.teamLibrary`, `importVariableByKeyAsync`, `importStyleByKeyAsync`, keys and `getPublishStatusAsync`, mirroring *Toghen Test Library*. Unmeasured, and marked: a listed collection and variable beyond the typings, a variable imported from a library not enabled (here it imports), two imports of one key (here one id), a key across a republish (here fixed), the style's error message, the publish status of what was imported (here `CURRENT`), a library variant's parent (here its set).
- **Not done:** `fileKey` is written by no filler here: in the consuming file neither can read the library's key. The Build pane (unit 14) and the relink (unit 12).

## Built: fields for wrap, grid child, position, appearance and strokes (22 October 2026)

**Status:** built. Unit 3 of the plan of 22 October ([plan](.reference/plans/plan-2026-10-22.md), 2.2); the rows are in [*Fields by layer kind*](component-files.md#fields-by-layer-kind), the order in [*From file to Figma*](specs.md#from-file-to-figma).

- **Built:** fifteen rows in the field table, as the roster gives them. Plain enums: `layoutWrap`, `counterAxisAlignContent`, `gridChildHorizontalAlign`, `gridChildVerticalAlign`, `layoutPositioning`, `blendMode`, `strokeAlign`, `strokeCap`, `strokeJoin`. Bound: `counterAxisSpacing` (FLOAT, `GAP`), the one bindable layout field Toghen lacked. Written as a value through the field writer: `x`, `y` (dimension), `cornerSmoothing` (number), `dashPattern` (a `strokeStyle` token's `dashArray`, in pixels, or `(literal)` lengths). Structured: `constraints`. Each has a receipt; a second run over a set that uses all of them plans nothing.
- **Built: the order.** `layoutWrap` and `counterAxisAlignContent` right after `layoutMode` and the cell (measured: `WRAP` throws on a frame with no layout); a cell alignment once the cell is set; `layoutPositioning` before sizing; `counterAxisSpacing`, `x`, `y` and `cornerSmoothing` with the other dimensions, after sizing; the rest after the effect style.
- **Built: `strokeAlign` declared wins.** Writing a side's weight still sets `INSIDE` first, as a creation step, so a layer that does not declare `strokeAlign` draws as before and no receipt changes. A declared one is written after the sides, and again whenever a side is patched, so a side patched alone does not leave it `INSIDE`.
- **Built: the mock** has the setters, refuses `WRAP` with Figma's measured message, binds `counterAxisSpacing`, and refuses `setBoundVariable` on any field outside its bindable list with Figma's message, `in setBoundVariable: Unknown field: '<name>'` (§14), replacing a message of its own that no test read.
- **Decided alone: `dashPattern` is a child node, as `fills` is**: one token reference, or `(literal)` lengths (a bare number is refused, as for a dimension), or none for a solid stroke, which a `when` needs to undo a dashed base. A token beside other values is refused.
- **Decided alone: `constraints` is one structured field,** `constraints horizontal=MIN vertical=STRETCH`, both axes required: the field keeps the Plugin API's name and shape, as `grid row= column=` does. *Not chosen:* two scalar fields with names Figma does not have.
- **Decided alone: where the format narrows the roster.** The wrap fields and `cornerSmoothing` on **FRAME** and **SLOT**, as the other auto-layout and corner fields; the stroke fields on the kinds that take `strokes` (**FRAME**, **SLOT**, **LINE**); `strokeCap` on a **LINE** only, since a frame's outline has no open end to cap.
- **Decided alone: relations are checked per member** (`validate.ts`, beside the grid's), since a `when` may set the layout: the wrap fields need `HORIZONTAL` or `VERTICAL`; a cell alignment a `GRID` parent; `layoutPositioning` a parent with a layout; `x` and `y` are refused on the root, which Toghen places (a member in its set, an artboard on the board), and on a child its parent's layout places unless it is `ABSOLUTE`. Figma would ignore those writes and read back another position, so the next run would see the file as moved.
- **Decided alone: a token on a field written as a value is held against the field's `types`.** `x="{opacity.half}"` stops the run with its line. Its limit: a token is checked against the first field the file writes it on only.
- **Found:** a `strokeStyle` token may be a keyword (`dashed`), which names no lengths; `valueOf` gives no value for it, and the run stops with its line rather than guess a pattern.
- **Unmeasured, marked in the mock:** `NO_WRAP` and `counterAxisAlignContent` on a frame with no layout; a cell alignment or `layoutPositioning` outside the layout they need (the checks refuse both first); `FILL` on an absolute child; whether Figma keeps per-side weights at `OUTSIDE` or `CENTER`; a new frame's `counterAxisSpacing` and `blendMode`; whether a dash is kept as float32.
- **Not done:** `strokeCap` from a `strokeStyle`'s `lineCap` (the plan gives `strokeCap` no token); `cornerSmoothing` is not range-checked, as `opacity` is not.

## Built: gradients, effects and layout grids as fields (22 October 2026)

**Status:** built. Unit 4 of the plan of 22 October ([plan](.reference/plans/plan-2026-10-22.md), 1.2, 2.2); the format is in [component-files.md](component-files.md#gradients-effects-and-layout-grids), the contract in [reference.md](reference.md#the-field-writer), the rule in [specs.md](specs.md#from-file-to-figma).

A paint took a colour token or a hex only, effects reached a layer only through an effect style, and layout grids not at all, although Figma binds a gradient's stops, a shadow's five fields, a blur's radius and a grid's fields (measured §14).

- **Built:** a `gradient` token in `fills` and `strokes`; `effects`, a list of shadow and dimension tokens and `(literal)` radii, on every layer kind; `layoutGrids`, a list of `COLUMNS`, `ROWS` and `GRID` nodes, on `FRAME`, `SLOT` and `INSTANCE`. Rows in the field table, with `SHADOW_FIELDS` and `GRID_FIELDS` beside it; checks; `Resolved.composite`; writes through `writeField`; receipts per part. The mock gains effects and layout grids on a node, `setBoundVariableForLayoutGrid`, the refusals measured in §14, the alias in a gradient stop read back with the variable's colour, and the shadow's alpha replaced when its colour binds.
- **Ruled by the maintainer:** a gradient binds its stops, and there is no fill-style field; Toghen adds no token type.
- **Decided alone: a blur is a dimension token in `effects`.** The design system already says whether a token is a shadow or a dimension, so `effects "{shadow.raised}" "{blur.soft}"` needs no tag and no second field. A `(literal)` number is a layer blur of that radius. *Not chosen:* a `(blur)` tag, a word every other field would have to refuse; a `blur` field, a second writer of the effects list. A background blur has no form: nothing asked for one.
- **Decided alone: the angle comes from the token.** A W3C gradient is a list of stops and has none, so it runs left to right, the transform measured in §6. The object form's `angle` is turned about the layer's centre by the function style sync uses. Neither is bindable, so the report names the stop positions, and the angle when the token has one.
- **Decided alone: a member is bound when its reference names a token with a variable, and written otherwise.** A reference whose first hop has no variable (a token the sync routes elsewhere) is written, not refused: the token is still followed at the next run. A token whose whole value is a reference takes its members from the token it names. A blur's dimension token is held to the rule of every bound dimension: no variable stops the run.
- **Decided alone: `effects` needs the loaded document,** as a written value does: only the core tells a shadow from a blur. A gradient needs it to be told from a colour; with no document a paint token is a colour, as before.
- **Decided alone: a grid field its alignment does not take is refused**, literal or token, with its line, and every field it takes is required but `offset` (0). `count` takes a whole number bare, as `row` and `rowSpan` do; a dimension takes `(literal)`. A grid with no `color` is given red at 10%, Figma's colour for a new grid (unmeasured).
- **Decided alone: `effects` beside `effectStyle` is one error**, at the `effects` line, naming both.
- **Decided alone: a receipt reads per part, and a hand-made gradient now reads as its stops.** Before, any paint that was not solid read `{ type }`. Toghen never wrote a gradient, so no receipt held one: no existing receipt changes its hash.
- **Not measured:** whether a stop's alias written by the plugin rather than through `use_figma` reads back the same; `MAX` alignment (taken as `MIN`); `blurType: 'NORMAL'` on a layer blur, as the typings declare it; whether Figma keeps the number a bound grid field was given or the variable's.
- **Not done:** a background blur; `boundVariables.effects` and `.layoutGrids` on the mock's node, which nothing reads.

## Built: text fields, and the bindings of `visible`, `characters` and instance properties (22 October 2026)

**Status:** built. Unit 5 of the plan of 22 October ([plan](.reference/plans/plan-2026-10-22.md), 2.2); the specs say it in [*From file to Figma*](specs.md#from-file-to-figma), *A text's fields*; the format is in [*Fields by layer kind*](component-files.md#fields-by-layer-kind).

A text took `characters`, `textStyle` and `textAutoResize` only: its size, font, line height and letter spacing reached it through a text style or not at all. `visible`, `characters`, an instance's `set` values and a property's default took plain values, though Figma binds each.

- **Built: the text rows of the field table** (`TEXT_FIELDS`, `shared/components/fields.ts`): `fontFamily`, `fontStyle`, `fontWeight`, `fontSize`, `lineHeight`, `letterSpacing`, `paragraphSpacing`, `paragraphIndent` bound on the whole text (`call: 'text'`, `setRangeBoundVariable(0, length, …)`); `listSpacing` and `maxLines` written as a value; six enums plain. They are written after the characters, the font's halves first with the font they name loaded, `maxLines` after `textTruncation` (measured §14).
- **Built: a line height or letter spacing binds in pixels only** (measured §14). `resolve()` asks the core for the token's value and converts it as style sync does (`toFigmaLineHeight`, `toFigmaLetterSpacing`): PIXELS binds; a unitless line height or an `em` letter spacing is written as PERCENT at the declared defaults, with the report's line. `Resolved.textValue(field, path)` carries it.
- **Built: a `fontFamily` stack binds its variable,** which holds the first family; the report says so once per run, field and layer.
- **Built: `boolean` and `string` tokens bind** `visible` and `characters` (`setBoundVariable`), an instance's `set` value (`setProperties` with an alias, read back in `boundVariables.componentProperties`) and a property's `default` (an alias to `addComponentProperty` and `editComponentProperty`). `Resolved.variable(path)` finds a variable of any type. A `(property)` wire is unchanged.
- **Built: receipts.** A text field reads bound when every alias of its array names one variable (`boundIdOf`); a bound `visible`, `characters` or property value reads `{ variable }`. An existing field's receipt hashes as before: the new branches are reached only by a binding the old code never made.
- **Ruled by the maintainer: a text field beside `textStyle` is refused, naming both.** The fields refused are those a text style sets (`STYLE_TEXT_FIELDS`); alignment, truncation and `maxLines` go beside a style.
- **Decided alone: `fontFamily`, `fontStyle` and `fontWeight` take a token only.** A plain font would need its own load and `fontName` write, and `fontWeight` cannot be assigned at all (measured). A font chosen by hand is a text style's job.
- **Decided alone: a token on a line height or letter spacing needs the document loaded, in pixels too.** A variable holds a bare number, so only the token says whether 1.5 is a multiplier or pixels; binding a multiplier would draw 1.5 px.
- **Decided alone: a `(literal)` line height or letter spacing is pixels,** as every other dimension's literal is.
- **Decided alone: a bound default is re-set on every run,** as an instance swap's is: the diff runs without Figma and cannot match a variable to a path. A layer wired to it shows what the variable holds in its collection's default mode.
- **Decided alone: new characters write the declared text fields again** (`withResets`). Unmeasured whether a whole-text binding survives new characters; writing again is harmless.
- **Decided alone: a token on a wired field takes a layer built before off its property,** as `(literal)` does, on an update only.
- **Found:** the core refuses an `em` dimension (`unit must be one of 'px', 'rem', 'pt', or 'mm'`), so an `em` letter spacing is a `letterSpacing` token.
- **The mock** gained the text fields, `setRangeBoundVariable`, aliases in `setProperties` and in a default, and `createVariableAlias`, marked `unmeasured:` past §14: that every text setter needs the font loaded, that assigning any text field drops its binding, the weights of Inter's style names, an empty range refused.
- **Not done:** a field on part of a text; `getRangeBoundVariable` to tell a text bound on one range from one bound whole (`boundIdOf` carries a `ponytail:` note); `textDecoration`'s style, offset, thickness and colour; lists; wrap style.

## Built: the relink step (22 October 2026)

**Status:** built. Unit 12 of the plan of 22 October ([plan](.reference/plans/plan-2026-10-22.md), 1.4, 2.4); the step is in [reference.md](reference.md#steps), the rule in [specs.md](specs.md#identity-what-is-ours), *A swap is its own step*.

The diff already planned a swap when the locator answered a component's name with another one: `component` went among a `PATCH_LAYER`'s fields, and the update called `swapComponent`. Nothing said a swap happened, and a relink of forty instances read as forty patches.

- **Built:** `SWAP_COMPONENT`, one per stamped instance, before the layer's `PATCH_LAYER`, which keeps its other fields; in a set's members and in an artboard, which share the reconciler. The update applies it as the patch did (the property references, then `swapComponent`) and takes the layer's receipt again once the run's writes are done, so a second run plans nothing. Its row: *"Glyph" in "Badge/Tone=calm" swaps from "Icon" (this file) to "Icon" from library "Core"*, counted as an update; the plugin's Results shows it as an `UPDATE` row.
- **Built:** the snapshot reads every stamped instance's component (name, key, and for a library's the library the lock holds its key under), and `reported.component` whatever the receipt holds; the locator says where it found each component (`componentSource`), imported or not.
- **Found:** a dry run imports nothing, so a library's component has no expected id and always read as moved: after a relink, every later dry run (the Build pane's *Plan relink*) would have planned the swaps again. A dry run now compares the key it would import with the key of the instance's component.
- **Decided alone: Figma already showing the file's component is a receipt taken again, not a swap**, as for any field; a receipt with no hash for `component` no longer reads as a swap that writes nothing.
- **Decided alone: `fromLibrary`**, beside the plan's shape, so the row can say where the old component came from; empty when the lock holds its key under no library, since a remote component names none.
- **Decided alone: `component` on the step is the set or artboard the instance is in**, for the row's place.
- **Not done: counting the instances a person placed.** Inside a member, an unstamped instance is said as any unstamped node already is. Elsewhere in the file, counting them needs every instance on every page (`getInstancesAsync` is unmeasured and not in the mock), which a run does not read; left out.
- **Not done:** the command line counts a swap among the steps and the updates, but prints no line of its own for it (`cli/` is unit 15's this round).

## Built: the lock from the command line (22 October 2026)

**Status:** built. Unit 15 of the plan of 22 October ([plan](.reference/plans/plan-2026-10-22.md), 1.5, 2.3); the flow is in [specs.md](specs.md#a-run) (*A run with a library*), [*Commands and arguments*](specs.md#commands-and-arguments) and [*Pairing*](specs.md#pairing), the shapes in [reference.md](reference.md#the-lock), the steps in [guide.md](guide.md#syncing-from-a-repository).

No Plugin API call lists a library's components or styles, and a consuming file cannot read the library's file key. The library file knows both of its own, so the command line pairs a plugin in each file and copies the keys across.

- **Built:** `--library <name>` on `variables`, `components` and `sync`, and `toghen-figma lock <name>`. Two pairings on one bridge (`serve` takes a code per role); `LIBRARY_KEYS` in the library file (stamped sets, and a stamped component outside a set though the engine makes none today; stamped text, effect and paint styles; every local variable; each with its publish status; `figma.fileKey` where it reads); `LOCK_WRITE` in the target file, replacing the library's entry whole. One printed line per set or style not `CURRENT`, and one counting the variables. The mock gains `withPublishStatus`, `withFileKey`, a key and status on a local style, and `use()`, so two fake plugins in one test answer from two files.
- **Ruled by the maintainer:** the lock holds the file key only where a run could read it, with `enablePrivatePluginApi` set while in development; a published plugin would lose it. Variable keys go in the lock; library styles are filled as components are.
- **Decided alone: a run with a library builds in the library file.** Components are made, and published, there; a target file holds nothing of the library locally, only keys. The target file gets only `LOCK_WRITE`. *Not chosen:* building into the target and reading keys from it, which would give local keys nobody publishes.
- **Decided alone: the bridge's smallest change is one code per role on the one port.** Pairing is otherwise as it was: eight characters, five wrong codes across both roles stop the run, loopback only, the kept-code rule per role. A kept code nobody came back with is replaced in place (`renew`) rather than by restarting the server, which would drop a plugin that had already paired. The library's code is kept beside the target's, in `<pairing file>.library`, one for every library: a run for another library waits the short while, then prints a new code. *Not chosen:* two ports (the manifest names one) and one shared code (the command could not tell the files apart).
- **Decided alone: every local variable is listed, stamped or not,** as discovery lists every variable a published library offers; styles and sets are listed only when stamped, since they are kept by the name Toghen gave them. A style is keyed by the token path its name spells, as a person's pick keys one; its stamp's token carries the design system's prefix, which the locator does not use.
- **Decided alone: no lock after a build that did not complete,** and none in a dry run, which reads the keys and prints the lines. `by` is `'build'` when the run sent an entry or a file to the library plugin, `'command line'` for `lock`.
- **Decided alone: `variables` takes `--library` too,** which is what makes refusing `--library` with `--figcraft` a check rather than an unknown option: FigCraft has no library model in this design.
- **Found:** the plugin's runtime state is one module's, so the two fake plugins share the loaded document; the tests give the load to the library plugin only, as a real run does.
- **Unmeasured, marked in the mock:** any status but `UNPUBLISHED` (it needs a published library, §7 and §15); `figma.fileKey` in the desktop plugin with `enablePrivatePluginApi` (measured only through the connector, §15); a local style's key and status, taken to be a variable's.
- **Not done:** the plugin's screen shows nothing of the second plugin, and a person cannot tell from the target file which library run wrote its lock beyond `by`. The library's name is typed by the person, since no plugin reads it (§15: `figma.root.name` read `Document`).

- **Measured, 22 October 2026 (§15, second pass): the mock changed, and styles are guarded.** A real library's imports disagreed with the mock in four places, so the mock follows the measurement: an imported variable and collection refuse `getPublishStatusAsync()` (`can only query publish status for local variables` / `… local variable collections`) and an imported component, set or variant reads `UNPUBLISHED`; two imports of one variable key give the same id and a different object; an imported collection's `variableIds` lists only what the file has imported of it. No caller relied on the old behaviour: the lock asks a publish status only of local objects. A style has no `getPublishStatusAsync` in the connector's runtime though the typings give one, which may be the connector and not Figma, so `LIBRARY_KEYS` still calls it where it is a function, records `undefined` where it is not, and adds a line to `LibraryKeys.warnings`, which the command line prints. The mock keeps giving styles the method. unmeasured in the desktop plugin.

## Built: Apply, the plan and its execution (22 October 2026)

**Status:** built. Unit 9 of the plan of 22 October ([plan](.reference/plans/plan-2026-10-22.md), 2.5, the Apply row); the specs say it once ([*Apply, through the field writer*](specs.md#apply-through-the-field-writer-built-22-october-2026)), the reference gives the messages and the operation ([*Apply a token to layers*](reference.md#apply-a-token-to-layers)). The pane is unit 10's.

- **Built:** `PLAN_APPLY { tokens, field?, scope, kinds }` (`main/handlers/planApply.ts`) and `EXECUTE_APPLY` (in `executeApplyBindings.ts`, which now runs either plan by its type: smaller than a second file). One `APPLY_TOKEN` per layer and field, `planType: 'apply'`. A group's tokens come from `DesignSource.group`, the answer `tokens=` gets, and reach fields through `planOf`, now exported from `groups.ts`: the same table, not a copy.
- **Built: one binding path.** `writeToken(node, field, path, resolved)`, in the field writer's own block, makes the layer (`applyLayer`) and the run around one call to `writeField`; `resolvedFor(variable, atDefaults?)` is the `Resolved` it reads. `bindNodeProperty` sends a convention's property that is a `field` binding of the table through it. `fills[0].color` and `strokes[0].color` keep their first-paint binding, since the writer replaces a field's paints and a convention binds the first paint of several; the conventions' tests pass unchanged.
- **Built:** `READ_SELECTION_BINDINGS` adds `fields`, a row per field of the table with a token column for the layer's kind, bound (a variable or a style, by name) or plain, read with `reportField`. The existing payload is unchanged.
- **Ruled by the maintainer:** the query is over tokens; Apply writes no stamp, so an applied field a built component declares reads as drift at the next build (said in the guide); the conventions card stays.
- **Decided alone: an instance and a component definition read the field table as a `FRAME`** (`applyKindOf`). The table's `INSTANCE` is what a component file may say, which leaves overrides out; Apply writes overrides, and Figma gives an instance a frame's fields, as the roster counts it. Without this a group on an instance would be all skip rows.
- **Decided alone: the plan carries what it writes.** The token's variable id and, where the field or a colour's alpha is written as a value, the value at the defaults, the mode name and the `written` line (`valueLine`, the build's words). Execute reads no document: it writes what the plan said, as a sync plan does. An applied operation answers the variable as `figmaId` when the field was bound whole, and none when it was written, in part or whole, as a value.
- **Decided alone: the variable is looked up by name in this file** (`tokenPathToVariableName`, every collection), not through `resolve()`, which loads every page to find components Apply never names. A missing, doubled or wrongly typed variable, and a token whose type the field does not take, is one `WARNING` per token and field, however many layers it reaches; its operations are left out and the rest stand.
- **Decided alone:** the scope is walked at every depth (`QueryEngine`, `**`), as the selection read walks a page. A style field (`textStyle`, `effectStyle`) is refused with a row: Apply writes variables and values only. A field given with a group, or a name with no token column, is an `ERROR` with a new code, `INVALID_QUERY`.
- **Merged with units 3, 4, 5 and 11, the same day.** The plan asks the core through `coreAtDefaults()`, now exported from `resolve.ts`, so a token's type and its value at the defaults (a `strokeStyle`'s dashes included) are the build's. `resolvedFor` answers the grown `Resolved`: `variable` is the token's one variable, `composite`, `textValue` and `stack` answer nothing. **Decided alone:** a gradient, and any token on `effects` or `layoutGrids`, is refused with a row, since those are written part by part and Apply writes one variable or one value per field. Text fields are in the table but not in Apply's kinds.
- **Tests:** `test/apply.test.ts`, in the structured shapes: a group on a page of frames, an instance (the main component untouched), a component definition, one token with a field, a field the type cannot reach, a `{ value, unit }` dimension in `rem` on `x` written as its value (the context named before Execute), a colour at alpha 0.5 (the context named before Execute, the paint's opacity written), a token with no variable, a key with no field, no shared plugin data written, and the field rows read back.
- **Not done:** a token through a library: Apply looks only at local variables, not through the lock. Composites, as above.

## Built: the Build pane (22 October 2026)

**Status:** built. Unit 14 of the plan of 22 October ([plan](.reference/plans/plan-2026-10-22.md), 1.3, 2.3 to 2.6); the screen is in [ui.md](ui.md#build) and [ux-map.md](ux-map.md), the shapes in [reference.md](reference.md#the-build-panes-look).

The Templates pane becomes the Build pane, and its tab *Build*: blueprints and component files kept in this file, what they need, the lock, and building from them.

- **Built:** a kept blueprint is a row with its needs (tokens, libraries, components), each *not looked* with the grey ring until **Look up** (`LOOK_UP_NEEDS`), then dated. The lock card (one row per library, who wrote it, its counts, the file key where held, Forget; Discover variables; Plan relink). Build's overrides map in the shared table, with Remove per row and one Add row. **Use the selected instance** in a missing component's row. `PLAN_RELINK`, to the result surface as `relink plan`. Tests: needs found, from the lock, would swap, missing and satisfied; tokens loaded, differing, not loaded; a relink plan with two swaps and the library's line; neither writes nor imports anything.
- **Built:** the locator's component order is one function, `locateComponent` in `resolve.ts`, used by every build and by the look, so the look cannot answer a name otherwise than a build would. `desiredOf` in `file.ts` is what a read file asks the engine for, used by a build and by the dry passes.
- **Decided alone: *would swap* comes from a dry build of the blueprint's bodies,** the relink plan's own pass, not from reading instances' components. Which stamped instance stands for which name only the diff knows. A body that stops (a missing component) leaves its swaps unknown, and the look says so above the needs rather than reading as none.
- **Decided alone: the relink's "publish it" line is a `NOTE` per library the swaps import from, not a warning.** The plugin cannot see a library's publish status or whether its update was accepted (§15), so a warning would claim a problem nothing observed (R11). A swap is a new plan-only operation, `SWAP_COMPONENT`, so its row reads `UPDATE … component swapped` as in a build plan.
- **Decided alone: tokens are held by the entry's file names, the last segment of each path.** The plugin's files carry no folders, so the blueprint's `tokens/ds.resolver.json` and a loaded `ds.resolver.json` are the same entry. A blueprint that names a map is held against whether a map was loaded; its hash is said, since the plugin cannot read the blueprint's map to compare.
- **Decided alone: the pick's library field is filled with the blueprint's first `library` line,** on screen before the pick (R10). With no single layer selected, the row says what to do instead of showing a button that can only be refused.
- **Decided alone: the state keeps its names** (`templates`, `templatesOpen`, `pendingBuild`), since the Sync and Selection panes read them; the panel is `build`, the element `tg-pane-build`.
- **Found in the preview:** at 320px an open blueprint, with a forty-character key need, pushed the pane 74px sideways (R1). The detail's cells wrap anywhere now (smell #46).
- **The preview, checked:** in the preview page, in the Browser pane, at 460 × 720 (light), 980 × 620 (dark) and 320 × 600 (light). At 320px the five labels and a sixth dummy labelled *Templates* measured whole, none cut, the last ending at 316px; no horizontal overflow in the pane once #46 was fixed. A pick and Plan relink round-tripped through the fixtures, the lock card then reading *picked by a person* and the surface `relink plan`.
- **Not done:** building a blueprint as a whole; editing a map entry in place (remove and add it again); telling on the screen whether the one selected layer is a library's instance (smell #47).

## Built: the Apply pane (22 October 2026)

**Status:** built. Unit 10 of the plan of 22 October ([plan](.reference/plans/plan-2026-10-22.md), 1.3, 2.5, the Apply row); the screen is in [ui.md](ui.md#apply) and [ux-map.md](ux-map.md).

The Selection pane becomes the Apply pane, and its tab *Apply*: the strip reads Load · Sync · Tokens · Apply · Build.

- **Built:** a row per field of `READ_SELECTION_BINDINGS`' `fields`, named as the table names it: bound (the token, its link into Tokens, the drift dot from the Tokens pane's last look) or *plain* with what it holds. The conventions' properties are matched to their field (`fills[0].color` is `fills`), so a row keeps its template glyph and its **Bind**; a property with no field row keeps a row of its own. Apply's command group sits under the rows (R3): the token query with every token's and group's path as suggestions, what the query names said under it, the field for one token, the kinds, the line naming the declared defaults a written value takes (R10) and saying that Apply writes no stamp, then Plan and Execute on the pane's scope. The conventions card stays at the foot, unchanged. An `APPLY_TOKEN` is drawn as an `UPDATE` row, bound or `value in` its context, the `written` line as its message, under a *written as a value* chip. After any run the Apply pane in front reads its layers again.
- **Built, in the main thread:** `fields` rows carry `holds`, what a plain field holds as the properties' `literal` reads it; a value Apply wrote reads as plain, since no stamp records it. `applyFieldsFor(type)` in `fields.ts` gives the fields one token can be put on; the screen imports it from the shared table rather than having the main thread send it. Tests: `test/apply.test.ts`, a value Apply wrote on `x` read back as plain holding it, and the fields a dimension, a colour, a number, a typography and a shadow reach.
- **Ruled by the maintainer:** the query is over tokens, never layer names; Apply's writes carry no stamp and read as drift on a built component at the next build (the guide already said so; the pane says it once); the conventions card stays.
- **Decided alone: the payload cannot say *written as a value*.** Nothing on a layer records that a value came from a token, so a row says *plain* and what it holds, never more (R11); the plan's rows say which fields are written as values, and in which context, before Execute. A plain row carries no dot, and a plain field of a built layer is no longer said to be *yours, not in the file*: most hold the layer's defaults, and that note claimed a person set them.
- **Decided alone: the field picker offers the fields a frame takes,** since Apply reads its three kinds as a frame, less the style fields, `effects` and `layoutGrids`, which Apply refuses. Its default is *by its last key*, as `PLAN_APPLY` without a field. A query that names nothing in the token graph holds Plan; with the graph not read, the main thread answers for it.
- **Decided alone:** the state keeps the selection's names (`selectionScope`, `selectionBindings`); the panel is `apply`, the element `tg-pane-apply`. The field names' column is 112px and wraps, so `strokeBottomWeight` fits at 320px.
- **Not changed, needing sign-off:** the rulebook still names the pane *Selection* in R8's spot and in *Not exceptions, checked*. A rename only, but in a rule, so it waits.
- **The preview, checked:** in the preview page, in the Browser pane, at 320 × 600 and 980 × 620, light theme only; dark was not looked at. At 320px the five labels and a sixth dummy labelled *Templates* measured whole on one line, at least 10px apart, the last ending at 316px; the pane had no horizontal overflow. Typing `space.sm` drew the field picker with the dimension fields; picking `x` and Plan put an `apply plan` on the surface, two rows naming `light/default/rest` before Execute. The *Apply plan* scene drew bound rows, an alpha and an `x` written as values, and a skip. Smells #49 to #51 were found there.
- **Not done:** folding a layer's plain rows (smell #49); a written value's context other than the declared defaults (the plan's question 4, b).

## What the build found: stamps in FigCraft (22 October 2026)

**Status:** built. The last step of *Ruled: the stamp, one receipt per object, for every target*: FigCraft, once its release ships. FigCraft 0.8.0 (20 October) reads back the layer data a command writes. The plan, Egildo's answers and the units are in [plan-2026-10-22-figcraft-stamps.md](.reference/plans/plan-2026-10-22-figcraft-stamps.md); how it works is in specs, *FigCraft*, and reference, *Into FigCraft*.

**Ruled with Egildo:** the record lives on a visible page named *Toghen*, for starters, so he can see it, found by its data rather than its name, so it can become a divider later with no change to how it is read. Changed the same day, before the merge, to the divider `-toghen`: the visible page turned out empty to look at, since FigCraft shows a page's data nowhere, so it gave no sight of the record and took a place in the pages list. A text layer copying the record onto the page was offered and not taken. It is written once, at the end of a run and when a run fails partway. Each entry notes what it was written on, and an entry that no longer matches is dropped. Styles are in the round. Stamping moves out of Figma's branch of the executor and is shared by both targets.

**Measured against FigCraft 0.9.0, live, over the control socket, in new files only** (the person's open files were not touched):

- A page's data round-trips: `node.set {ids: [page], props: {pluginData: {key: value}}}` writes it, `node.get {id: page, depth: 0}` answers `pluginData`. A value of 411,781 characters, about 3,000 stamps, came back whole.
- An empty string does not delete a key: the key stays, holding `""`.
- A divider page (`page.add {name: "-toghen"}`) holds data like any page. A copied page (`page.duplicate`) carries none, so a copy cannot carry the record.
- Undo reverts a page's data like any other change.
- Ids hold across a save, a close and an open: variables `VariableID:n`, styles `S:n`, pages `n`.
- **Ids are given again.** A new object gets the highest id in use plus one: deleting a variable in the middle frees nothing, but deleting the newest and making another gives the new one the old id (`VariableID:1`, and `S:1` for a style).
- `page.add` shows the page it adds, except a divider, which is never opened: the page shown stays shown.
- `style.list` gives each style's value. A text style's under `style`, in snake case: `font_family`, `font_style`, `font_size`, `line_height` and `letter_spacing` as `{unit: pixels | percent | auto, value}`, `case`, `decoration`. An effect style's `effects`, each with `offset: [x, y]` and `show_behind`. A paint style's `paints`, each gradient with `from`, `to` and a third handle, `width`, which is `from` plus the ramp turned a quarter, and its stops' colours in float32. A bound field lists its variable's value (a font size bound to a variable holding 0 listed 1).

**What the build found:**

- **The units ran in another order than planned.** Once stamping is shared, the FigCraft target stamps styles as soon as it stamps anything, and a style's receipt hashes what `reportOf` reads, which the FigCraft view did not carry. So the styles were read back first, in a commit of their own, and the record came after, for variables and styles at once.
- **A gradient's transform is rebuilt from its ramp's ends,** its square taken as a square, since Toghen writes only rotations about the centre. A hand change of the `width` handle alone is therefore not seen. FigCraft's own default for `width` agrees with the square (measured at 45°).
- **A renamed token makes a new variable in Figma too.** The plan promised that stamps would make a renamed token move its variable in FigCraft; they do not, here or in Figma, since a stamp names the token it holds and a renamed token has no stamp. What the stamps give FigCraft is the Figma behaviour: a variable renamed by hand is found by its stamp and named back, where before a new one was made. The guide's and the specs' line saying otherwise went.
- **A bound font weight is written on every run.** FigCraft binds no font weight, so a style whose weight refers to a token never holds the binding its plan asks for, and is planned as an update each time. Read from the code; the sample has no such token.
- **The drift lines say "Changed in Figma"** in FigCraft too: the plans are shared and name Figma. Left as it is.
- **The fake keeps FigCraft's ids** (the highest plus one, per kind), pages with their data, and `style.list` in the measured spelling, so the tests meet a reused id and a style read back as FigCraft gives it.

**The live run** (`toghen-figma variables test/fixtures/sample.resolver.json --figcraft 7981`, built from the branch, into a new file in FigCraft 0.9.0):

1. First run: 152 variable operations and 7 styles applied. A page *Toghen* was made after *Page 1* (the record's page before it became a divider), and *Page 1* stayed the page shown; its record held 52 stamps in 11,271 characters.
2. Second run: `Variable plan: 0 creates · 0 updates · 52 skips`, the same for styles. Nothing written.
3. `spacing/md` set to 99 and `typo/body` given a font size of 30 by hand. Third run: both reported as drifted (`default` for the variable; `fontSize, lineHeight, letterSpacing` for the style, since `style.update` with only a family, a style and a size replaced the whole value), and both kept: 99 and 30.
4. With `--overwrite-drift`: one variable and one style written, back to 16 and 16.
5. Saved, closed, opened again. Fifth run: nothing planned. The record survived the save.
6. The file was closed, and the window shows the tab it showed before.

**Not done:** collections carry no stamp, as in Figma.

## What the build found: components in FigCraft (23 October 2026)

**Status:** built. Component and artboard files run into FigCraft (`components` and `sync` take `--figcraft`), reconciled in place with stamps, as in Figma. The plan, the measurements and Egildo's four answers are in [plan-2026-10-22-figcraft-components.md](.reference/plans/plan-2026-10-22-figcraft-components.md); how it works is in specs, *FigCraft*, *Components and artboards*, and reference, *Into FigCraft*.

**Ruled with Egildo** (22 October 2026):
- Reconcile in place, with stamps, rather than import a generated file whole (the consumer's route), so a hand edit is kept and reported in both targets alike.
- A second snapshot and apply in the command line, beside the plans. Not chosen: an interface under the Figma engine implemented twice, which would move the Figma side's measured behaviour; a `figma` that also writes, already rejected for variables.
- A layer's wiring and a frame's modes, which FigCraft keeps but does not report, are trusted from what Toghen wrote until FigCraft reports them. The request is drafted, not posted.
- A `members` command printing a file's members as JSON, so a design system stops importing Toghen's modules by path.
- Sets, artboards and the end-of-run restack in this round; libraries and components named by key out.

**Measured against FigCraft 0.9.0**, live, over the control socket, in new files of the build's own (the person's open files were never acted on):

- `component.create` keeps a frame's id and data. `component.combineVariants` makes a set with a new id and keeps its members' ids and data.
- Properties are keyed by display name, defined on each member, and wired with `component.bindProperty`. No read reports the wiring, and no read reports a frame's mode set with `variable.setMode`.
- An instance is made with a copy of its main's layer data, stamps included.
- Node ids hold across a save and a reopen, and are never given again, undo aside. Variable and style ids are reused.
- Every field the field writer binds binds with `variable.bind`, reported as one flat map in FigCraft's names. Opacity binds as a percentage.
- A set never breaks: two members of one combination are listed as `conflicts`.
- `node.get` lists a layer's children one level down, whatever `depth` it is asked for (23 October 2026).
- Combining names a member with no `=` in its name `Property 1=Default`, as FigCraft's documentation says.
- A paint written with an unresolved colour is refused (`fills must be paints or colours`).

**What the build found:**

- **The reads came for free.** The plan wrote a FigCraft snapshot and resolution of their own. A view that gives each FigCraft layer as a Figma node made them unnecessary: resolution, the snapshot, `reportedOf`, `expectedOf`, the stamps, the copies and the end of a run run unchanged, the way the variables run reads `figmaView`. The view writes back only what those reads write (a stamp, a removal, a position, a set's size), sent as one batch. The writes are the second implementation the plan asked for, behind one seam in the run (`writeComponentsWith`).
- **The fake hid two of FigCraft's ways.** It answered `node.get` to any depth and accepted any paint, so the first live run read members with no layers and the second planned their layers again, and an aliased colour went out as `#NaN…`. The target now reads a level at a time, a paint goes out black and takes its colour from its variable, and the fake answers both as FigCraft does.
- **A member with no axes was renamed by FigCraft** on combining, and the layout then found no member to place: a set of one 1 × 1, moved by the next run. Each member is named again in the batch that combines them.
- **A wiring taken away stayed in the kept data.** What FigCraft does not report is now written whole from the file whenever one of its fields is written, and an instance's copy of its main's is not read as its own.
- **What is not built is refused before any write**, a dry run included, with a line each: FigCraft's apply covers the layout, sizing, padding, corners, strokes, paints, text, styles, visibility, modes and instances; effects and grids as fields, constraints, dashes, lines, slots and gradients are the next round's.

**The live run** (`toghen-figma sync test/fixtures/sample.resolver.json test/fixtures/figcraft/{icon,button}.component.kdl test/fixtures/figcraft/showcase.artboard.kdl --figcraft 7981`, from the branch, into a new file):

1. First run: Icon, a Button set of two members with a text and a boolean property and an instance of Icon, and a Showcase artboard pinned to the dark theme with a large Button instance labelled "Go": `Icon: 1 created`, `Button: 2 created`, `Showcase: 3 created`. The picture matched the file: the dark surface, a white title, a large blue button.
2. Second run: every component `0 created · 0 updated · 0 deleted`, and nothing moved.
3. The small member's top padding set to 3 by hand: the third run said `"paddingTop" was changed in Figma since Toghen wrote it, and was left as it is`, and it stayed 3, unbound.
4. With `--overwrite-drift`: back to 8, bound to its variable.
5. Saved, closed, opened again: the fifth run planned nothing.

## What the build found: finishing the FigCraft target (23 October 2026)

**Status:** built, but for the live run (below). The plan, Egildo's answers and the units are in [plan-2026-10-23-figcraft-finish.md](.reference/plans/plan-2026-10-23-figcraft-finish.md); how it works is in specs, *FigCraft*, and reference, *Into FigCraft*. The headless transport (the plan's unit 5) is built on a branch of its own.

**Ruled with Egildo:** fields FigCraft takes and does not report are written and trusted, kept beside the stamp as wiring and modes are; libraries in FigCraft get their own round, and only the bug of a library's variables read as the file's is fixed here; the headless transport is built in parallel; preferred values are carried and written in FigCraft, Figma's side waiting for a measurement.

**Measured against FigCraft 0.9.0, live, in new files only**, every command in a batch that showed the file first (the person's open files were never acted on):

- `node.set` takes and `node.get` reports a wrapped frame's `contentAlign`, `strokeJoin`, a text's `listSpacing`, `leadingTrim` and `textAutoResize: "truncate"`. It takes and does not report `cornerSmoothing`, `maxLines` and `paragraphSpacing`.
- An instance takes auto layout overrides (`gap`, `paddingTop`) and lists them in `overrides`.
- `component.exposeInstance {id, exposed}` exposes a nested instance, and `node.get` does not report it.
- `component.makeSlot` makes a slot only of a frame inside a main component: "only a frame inside a main component (not inside an instance) can become a slot". The slot is a `FRAME` with `slot: "<name>"`, in the main and in each instance; the main's definitions gain `{type: "slot", preferred}`. `instance.slotInsert {id, slot, component}` answers `{id, slot}` (the new layer, the instance's slot layer), the slot layer then lists `overrides: ["slot"]`, and the layer put in takes layer data.
- `node.set {fills}` takes a gradient in the shape a paint style's value takes (`{type: "gradient", kind, stops: [{color, position}], from, to}`), `effects` with colours as `{r, g, b, a}`, and `grids` with `{kind, align, count, gutter, offset, size, color}`; each reads back the same, a bound part showing its variable's value. Writing the `effects` list again after binding its parts kept the bindings.
- In a pinned batch, `{"$step": n}` counts the `doc.switch` as step 0.

**What the build found:**

- **The plan was wrong about preferred values.** It said Toghen's steps carry none in either target. Figma's side writes them, by published key (`editProperties`), and the format names them only by key (`preferred COMPONENT key="…"`). FigCraft has no keys, so answer 4 could not be built as worded: preferred values are refused by name in FigCraft, as a component named by key is. Naming a local component in `preferred` would be a change of the format, for both targets, and wants a ruling.
- **A field bound by its parts was written on every run, in Figma too.** `cornerRadius="{radius.md}"` beside `bottomLeftRadius=(literal)0` leaves the corners bound to different things, which the target reports as `{ variable: null }`, while the file's side read `{ variable }` of the radius: every run took the file for moved. `expectedOf` now reads such a field as the target reports it (`main/components/receipt.ts`). It holds for `strokeWeight` beside a side as well.
- **Paragraph spacing was written on every run in FigCraft.** It was built, but the view had no reading for it, so the receipt hashed nothing at the write and the file's value at the next read. It is now kept beside the stamp with the other fields FigCraft does not report.
- **An instance the run made started with its main's stamp and record.** A nested instance's own record (its exposure) was read as not its own when its receipt was taken, and the next run restamped it. The apply now empties `toghen.stamp` and `toghen.unreported` on an instance it makes.
- **A new instance's slot is filled by a second batch.** Its slot layer has an id only once the instance is made, so a new artboard is built in two batches: the frame and its layers, then what fills the slots, each layer made with the slot layer as its parent. (The first build placed an instance with `instance.slotInsert` and left frames and texts to the next run; the live run below showed that any structure command takes the slot layer as its parent, and the second batch replaced both.)
- **`textTruncation` stays refused.** FigCraft's truncation is a text's sizing (`textAutoResize: "truncate"`), and Figma's is an ending beside any sizing; writing one as the other would make a hand change to the sizing read as the file's.
- **What was left as it was:** the specs' line that a run with nobody at the screen reaches only variables over REST, and the scope of the ruling against `figcraft-cli mcp`, belong to the headless branch.

**The live run** waited for FigCraft 0.10.0 to be started: the instance on port 7981 at the end of the build had been running since 22 October at 16:34, before the upgrade. Once it ran (23 October, 17:00), the run below, in new files only, every command in a batch that showed the file first.

Settled first, against 0.10.0:

- **A side written lets a bound `strokeWeight` go.** `variable.bind {field: "strokeWeight"}`, then `node.set {strokeTopWeight: 0}`: no binding left, sides `[0, 3, 3, 3]`. The writer bound `strokeWeight` first and wrote a literal side after, so a file with both lost the binding. It now treats the sides as it does the corners: the four written as one list, a side the file does not name taking `strokeWeight`, then each side that follows a token bound on its own, and `strokeWeight` never; the fake lets `strokeWeight` go too.
- **Any structure command takes an instance's slot layer as its parent**: `frame.create`, `text.create` and `instance.create` with `parent` the slot layer each made a layer in the slot.
- **Line caps:** `none`, `round`, `square`, `lineArrow` (Figma's `ARROW_LINES`), `triangleArrow` (`ARROW_EQUILATERAL`), `diamondFilled`, `circleFilled`. `arrowLines`, `arrowEquilateral`, `triangleFilled` and the like are refused (`unknown stroke cap`); Figma's `TRIANGLE_FILLED` has no match, and is refused by name. No cap is reported.
- **Blend modes:** every one of Figma's in camel case, with `plusDarker` and `plusLighter` for the linear burn and dodge; `normal` and `pass through` read back with no `blend` key. A join of `miter` reads back with no `strokeJoin` key, the default.
- **Not reported:** `paragraphIndent`, `paragraphSpacing`, `maxLines`, `cornerSmoothing`, as on 0.9.0.

The run (`toghen-figma sync test/fixtures/sample.resolver.json` with the Icon, Button, Showcase, Panel, Holder and Shelf fixtures and two more files, a tab with corners and sides beside `cornerRadius` and `strokeWeight` tokens and a card with a gradient, a shadow and a blur, and two layout grids, `--figcraft 7981`, into a new file):

1. First run: every set and artboard created. The tab's corners `[8, 8, 0, 0]` with the two top corners bound and no `cornerRadius` binding; its sides `[0, 4, 8, 4]`, the bottom bound to its own token and the right and left to `strokeWeight`'s. The card's linear gradient, drop shadow and blur, its column and square grids, the gutter and offset bound. The panel's grid with its tracks and gaps bound, the note in column 1 centred; the row's dashes, round join and wrapped alignment; the pin's constraints; the line; the panel's multiply. The holder's slot. The shelf's instance holding the icon and the caption in its slot, each stamped.
2. Second run: nothing created, updated or deleted.
3. The row's dashes set to `[1, 1]` by hand: `"dashPattern" was changed in Figma since Toghen wrote it, and was left as it is`. With `--overwrite-drift`: written back. The next run: nothing.
4. Saved, closed, opened again: nothing planned.

The file was closed with `force`, and the window put back on the tab it showed.

## What the build found: headless FigCraft runs (23 October 2026)

**Status:** built. `variables`, `components` and `sync` take `--figcraft-file <path.figcraft>`: the run goes into a file with no app, through `figcraft-cli mcp`, and saves it. Egildo ruled on 23 October to build it in this round, in parallel with the field work ([plan-2026-10-23-figcraft-finish.md](.reference/plans/plan-2026-10-23-figcraft-finish.md), unit 5 and question 3). How it works is in specs, *FigCraft*, *Headless*, and reference, *Headless*.

**The ruling's scope.** *Ruled: a FigCraft target* (19 October 2026) rejected talking to FigCraft through `figcraft-cli mcp`, a second program in between for what the socket already does. That holds for the app. With no app there is no socket, and MCP is the only way in, so the ruling is read as being about the live app.

**Ruled in the build:**
- **One transport more, nothing else.** `headless` in `cli/figcraft.ts` is a second `Control`: a request the socket sends as `engine.execute` goes as the `run_command` tool. `pinShownFile` and `inFile` are unchanged: the session has no `window.list`, so the pin names no window, and the batches carry `doc.switch` and `doc.list` as over the socket. `figcraftApply.ts`, `figcraftScene.ts` and `figcraftFile.ts` were not touched.
- **Saved whole or not at all.** Over the socket a run that stops partway leaves its writes in the app, for the person to look at, and writes its stamps. Headless, nobody looks, so the file is saved only when every step succeeded, after the stamps, and never in a dry run. Considered: saving whatever was written, as the app keeps it. Rejected, since a job would then commit a half-built file.
- **A path with no file starts one.** The session's untitled file is written, and the save gives it the path. A missing folder is not made: the save fails and says so.
- **The version from `initialize`.** `serverInfo.version` names the CLI, so no second process (`--version`) is needed. Below 0.8.0 the run stops before opening anything.
- **No font flag**, as the plan said: the machine's fonts, as in the app. `FIGCRAFT_NO_SYSTEM_FONTS=1` reaches the child through the environment, for whoever wants FigCraft's own fonts only. `text.loadFont` waits for a need.
- **No automation roots.** `figcraft-cli mcp` can be confined to folders (`--automation-read-root`, `--automation-write-root`). The run opens and saves one path it was given, so confining it adds nothing while the session runs no command that names another file. Wanted if it ever does.

**Measured against `figcraft-cli` 0.10.0** (the release zip, unpacked in a scratch folder; the running app was never used, and the installed 0.7.0 only for the refusal):
- `figcraft-cli mcp` writes a banner to standard error and answers JSON-RPC on standard output, one line each. Every tool answers `{content: [{type: "text", text}], isError}`. `run_command`'s text is the command's result as pretty-printed JSON; an unknown command is `isError: true`, `` unknown command `…` ``.
- The session starts with one untitled file. `open_file` adds the file as a second tab and shows it: `run_command doc.list` then lists both, the file active. `window.list` is an unknown command.
- The target's pinned batch, `command.batch {label, commands: [doc.switch, command.batch {commands}, doc.list]}`, answers through `run_command` exactly as over the socket.
- `save_file {path}` saves the file shown and answers `{bytes, path}`. Into a folder that does not exist it is `isError`, `No such file or directory`.
- `serverInfo.version` is `"0.10.0"` from 0.10.0 and `"0.7.0"` from 0.7.0.

**What the build found:**
- **The fake socket served as the headless fake's engine.** The tests' `figcraft-cli` (`test/support/fakeFigcraftCli.mjs`) is a child process that speaks MCP and passes each command on to the fake control socket. The headless tests read the same fake file the socket tests do, and no second fake of FigCraft's commands was written.
- **A dry run of a first `sync` that places an instance of another set stops**, headless as over the socket: `pending` covers variables and styles, not components (reference, *Order of component steps*). The dry-run test builds first.

**The live run** (`toghen-figma sync test/fixtures/sample.resolver.json test/fixtures/figcraft/{icon,button}.component.kdl test/fixtures/figcraft/showcase.artboard.kdl --input test/fixtures/sample.resolver.json --figcraft-file <scratch>/design.figcraft`, `FIGCRAFT_CLI` naming the 0.10.0 binary, into a path with no file yet):
1. The first try named a folder that did not exist. The whole run went through, the save failed with `No such file or directory`, exit 1, and nothing was left on disk.
2. First run: `Variable sync: 152 applied`, `Style sync: 7 applied`, `Icon: 1 created`, `Button: 2 created`, `Showcase: 3 created`, then `Saved …/design.figcraft.` (15 107 bytes).
3. Second run: `Variable plan: 0 creates · 0 updates`, `Style plan: 0 creates · 0 updates`, every component `0 created · 0 updated · 0 deleted`, `Showcase: 0 steps`, nothing moved.
4. A dry run of `variables` planned nothing, and the file's SHA-1 was the same before and after.
5. The file opened again in a fresh headless session: the pages `Page 1` and the divider `-toghen`, whose data holds the record (11 271 characters); the Icon and Button sets and the Showcase frame each carry their stamp (`{component: "Icon"}`, `{component: "Button"}`, `{artboard: "Showcase"}`); 45 variables in `demo` and `theme`, and 7 styles.
6. With the installed 0.7.0: `figcraft-cli is 0.7.0: a headless run needs figcraft-cli 0.8.0 or later …`, exit 1.

## Built: the small defects (23 October 2026)

**Status:** built. Planned in [plan-2026-10-23-small-defects.md](.reference/plans/plan-2026-10-23-small-defects.md); found by the skills' research (`toghen-skills/decisions.md`, *What the writing found*).

- **The pairing hint names what the screen shows.** It said *type the code under "Command line" on its System pane*, the Design System pane's name before the split of 22 October; the code field is in the Source card at the foot of the Load pane. The hint now says that, in the guide's words, and a test holds it. The card gains no heading: R5 and the map's *Command line group* allow one field and one button.
- **FigCraft's libraries, said rightly.** `--library` beside `--figcraft` or `--figcraft-file`, and a component named by its key in FigCraft, said FigCraft has no libraries. FigCraft 0.10.0 has local libraries and lacks only published keys. The refusals stay (libraries in FigCraft are their own round, [answer 2](.reference/plans/plan-2026-10-23-figcraft-finish.md#answers-23-october-2026)); their reason is corrected. *Built: the lock from the command line*, above, keeps its wording as the record.
- **Figma's docs, read again.** The skills' research read Figma's documentation on 23 October 2026 and found twelve places where these docs disagreed with it (`.reference/skills-research/figma-docs-2026-10-23.md`, *Contradictions*). Edited in place: the modes per plan (specs, *Figma's mode limit*), `clientStorage`'s 5 MB per plugin on one machine (specs, *Recently loaded documents*; reference, *Recently loaded design systems*, *The window's two sizes*), `COLOR_OPACITY` now measurable (specs, *What a variable is for*), REST reading shared plugin data (specs, *Why there is no Figma sign-in*), the undo the docs describe and the measurement refutes (specs, *The plugin does not roll back*), and `sourceColor` beside the Display P3 limitation (`figmaTokenAdapter.ts`). The measurements keep their words, with a section 16 that says what the docs now say. The vendored snapshots carry a dated note rather than a refresh. *Kept as the record:* `COLOR_OPACITY`'s open entry in *Ruled: what a variable is for*, above; the desktop measurement is listed under *Open questions*.
- **Typings 1.142.0.** Measured in a scratch copy before the bump: both typecheck configurations passed with no error. The widened `StyleType` meets two switches with a `default`, and every style list Toghen reads asks by kind, so a custom animation style never reaches them.
- **Export is the loaded document.** The skills recorded "no command exports Figma back to DTCG". Export writes the loaded document at one combination, with the file's stamps; it never read Figma. The guide says so, and a command waits under *Not in this design* for a pipeline that needs it ([answer 2](.reference/plans/plan-2026-10-23-small-defects.md#answers-23-october-2026)).
- **The fold ran in a real file.** `component-files.md` still said it had not; it ran on 13 October 2026.
- **The expectation sheet** reads a bundled document, names its base `demo` and watches the sample's paths. The specs say so, and it is left as it is ([answer 5](.reference/plans/plan-2026-10-23-small-defects.md#answers-23-october-2026)).

## Ruled: libraries in FigCraft (23 October 2026)

Egildo asked for libraries to work in FigCraft. Planned in [plan-2026-10-23-figcraft-libraries.md](.reference/plans/plan-2026-10-23-figcraft-libraries.md), whose section 1.1 holds the measurement against FigCraft 0.10.0. Answered the same day:

1. **The run publishes and accepts.** In FigCraft both are local commands. After a completed build, the run publishes the library and saves it, enables it in the target and accepts that library's updates there, live and headless. Live, the library file is used where it is open, else opened in a tab and left open. *Not chosen:* Figma's division, where both are a person's steps; and doing both headless only.
2. **A FigCraft library is named by its path** on the command line. The lock keys its entry by the file's name without `.figcraft`, and holds the path and the id the file keeps. *Not chosen:* FigCraft's own library name, which is the document's name at its last publish (`Untitled` for one never saved); the id alone, which nobody can write.
3. **`--use <library>`** declares the libraries a run's files may take names from, on `components` and `sync`, in both targets. Without it, nothing changes. *Not chosen:* declaring every library in the lock with no flag; waiting for blueprints built whole.
4. **Preferred values by name.** The format gains `preferred COMPONENT name=…` and `preferred COMPONENT_SET name=…`, resolved through the locator. FigCraft writes them as ids. Figma keeps `key=` and refuses `name=` by name until measured in the desktop app (*Measurements only the desktop app can give*). *Not chosen:* FigCraft-shaped keys in `key=`, which would tie a file to one target.

Team libraries on a `figcraft-server` stay out: they reach outside the machine.

## What the build found: libraries in FigCraft (23 October 2026)

**Status:** built on `figcraft-libraries`, the eight units of the plan. The specs say it in *The lock* (*Declared on the command line*, *In FigCraft*), *A run with a library, in FigCraft*, *Commands and arguments* and *FigCraft* (*Libraries*). The reference owns the shapes and messages (*The lock*, *Libraries in FigCraft*), and the guide the workflow.

- **Built:**
  - a FigCraft key, `<library id>:<asset id>`, and the lock's entry made from the using file's own listing (`cli/figcraftLibrary.ts`);
  - two files over one connection: a pin by path, a bridge per pin, each request setting its own `figma` and writers;
  - the root's shared plugin data, and what each library copy was imported from, kept in the record on the divider;
  - the four imports in the FigCraft `figma`, copies viewed as remote mains outside every page, library styles applied with `library.applyStyle`;
  - `--library` and `lock` with the FigCraft flags, `--use` in both targets.

  Unit 7, preferred values by name, was built by its own implementer and merged.
- **Found: library styles were read as local**, as library variables had been until the FigCraft target was finished. `style.list` lists a library's style copies beside the file's own. A first run would have adopted a read-only copy by its name and failed to update it. They are left out of the local list now, and answered by id.
- **Found: an instance's properties were read too early.** The view gave an instance its `componentProperties` with `Object.assign`, which runs a getter at once, so an instance whose main was viewed after it (a library's copy, read after the pages) read no properties and no variant. Every run would then have patched its `set` fields. It is a getter now, read when asked.
- **Found by the live run: a member added to a set that exists could not be wired.** In FigCraft 0.10.0, a component that joins a set holds none of the set's properties, whether reparented in or made by `component.addVariant`. `component.bindProperty` on its layers is refused (*the component has no property*), and `component.addProperty` on it is refused as a name that exists. A component given the properties while it stands alone keeps them when it joins (measured in a copy of the library file).

  So the writer now gives the new member the set's properties, wires it, moves it off the set's top-left corner (whose member FigCraft takes for the set's default: a member joining at 0, 0 took that place and the set read no properties), and then reparents it after the members there. This was a bug of the FigCraft target from before this round: it was reached by any member added to a set with wired properties, a library or not. The fake now refuses that bind as FigCraft does.
- **Decided alone: a dry run with `--use` neither enables a library nor writes its lock entry**, since both are writes. It resolves through the lock as it is, so a library declared but never locked is the locator's note, *the lock holds nothing for it*.
- **Decided alone: a library file the run made and did not save is closed at the end** (`file.close` with `force`), so a dry run or a failed build leaves no empty tab. A file that was open stays open.
- **Decided alone: the library's publish is not conditional.** A publish with no change makes a version that lists no update (measured), so publishing after every completed build costs nothing, and catches a hand edit in the library too.
- **Decided alone: the command line prints a swap in an artboard's plan** (`swap <address>`), as it prints a patch. The relink was counted but not shown.
- **The live run, against FigCraft 0.10.0, 23 October 2026.** On port 7981, in files of its own (a synthetic repository from the test fixtures: the sample tokens, `Icon` and `Button`, an artboard `Gallery` and a component `Holder`). Every request went in a batch pinned to its file; the two files were closed with `force` afterwards, and the tab shown before was shown again.
  - **The library run:** the library was made, built, published and saved, then enabled in the target and locked (2 components, 7 styles, 45 variables). Its dry run before stopped on `Button`'s `Icon`, which a dry run does not make: the dry run's known limit, not a library's.
  - **The target with `--use`:**
    - a dry run listed what it would import, and imported nothing;
    - the real run made `Holder` and `Gallery`. Gallery's fill and spacing are bound to the library's variables (`<library id>:VariableID:n`), its title is in the library's text style (`<library id>:S:1`), and its instances are of the library's copies. Holder's swap property offers the library's `Icon` set copy;
    - a second run planned nothing for `Gallery`. For `Holder` it planned the instance swap default that is set again on every run, from before this round.
  - **A library change** (a colour token's value, and `Size=huge` added to `Button`):
    - published as version 2, its 2 updates accepted;
    - the target's fill showed the new colour, and the copy gained `Size=huge`;
    - the next target run planned nothing.
  - **The relink:**
    - `Icon` was deleted in the library and the library run made it again (version 3);
    - the target's dry run showed `swap Glyph`, and the real run swapped it, 1 updated;
    - `Holder`'s default and preferred value moved to the new copy;
    - the next run planned nothing.
  - **A hand edit:** `Gallery`'s gap was set to 99 by hand. It was left and reported as drift, written over with `--overwrite-drift`, and a third run planned nothing.
- **The headless run, the same day,** with `figcraft-cli` 0.10.0 and no app. The same repository, with `--figcraft-file app.figcraft --library kit.figcraft`, then `--use kit.figcraft`:
  - both files were made in one session;
  - the library was published and saved, and the target saved last;
  - the target was built, and a second run planned nothing;
  - the value and the member flowed through version 2;
  - the remade `Icon` was one `swap Glyph`, in the dry run and the real one;
  - the hand edit was drift, then overwritten;
  - after the library file was moved, `--use moved/kit.figcraft` pointed the target there, and nothing was planned.
- **Not done:**
  - a library's extended collections;
  - `modes` on a library's collection, which neither target resolves (only local collections);
  - team libraries;
  - counting a person's instances of a remade component, which stay on the old copy.

  A dry run of a first library build still stops on a component the same run would make, as in Figma.

## Fixed: an instance swap's default set again on every run (23 October 2026)

Every run planned an `EDIT_PROPERTY` for each `INSTANCE_SWAP` property, in Figma and in FigCraft: the diff runs without the target, so it could not turn the component the file names into the id the target holds, and set the default again each time (recorded in *A bound default is re-set on every run* above, and seen in the libraries' live run as `Holder`'s edit). The run can resolve it, as it already does for preferred values: the receipts now carry `defaultComponent`, the id of the component the locator answers, and the diff compares it with the default the target reports. Unchanged, a second run edits nothing; changed, the default is set; a component the run cannot find still sets it, and the write that needs it says why. A bound `BOOLEAN` or `TEXT` default is still re-set every run, for the reason given there.

## Ruled: the nine issues of 24 October 2026

Issues #123 to #131, filed by Egildo from a downstream design system that runs `toghen-figma` 6.4.1 live into Figma and headless into FigCraft 0.10.0. Planned in [plan-2026-10-24-issues.md](.reference/plans/plan-2026-10-24-issues.md), part 2 of the round; part 1, lib computing every value it can, is [toghen-lib/plan-2026-10-24-computed-values.md](https://codeberg.org/Toghen/lib/src/branch/main/.reference/plans/plan-2026-10-24-computed-values.md), whose questions 1 to 5 are ruled in [toghen-lib/decisions.md](https://codeberg.org/Toghen/lib/src/branch/main/decisions.md#ruled-lib-computes-every-specified-value-it-can-24-october-2026). Egildo answered questions 6 to 11 the same day and vetoed none of the planner's eleven settlements.

- **6b. A literal brace is written doubled:** `{{size.sm}}` is the text `{size.sm}`, in a token's value, a data file and a component file's text alike. One mechanism in lib's grammar ([decisions](https://codeberg.org/Toghen/lib/src/branch/main/decisions.md#ruled-a-literal-brace-is-written-doubled-24-october-2026)); a component file's plain text is read through `literalText` once, in `shared/components/members.ts`, for both targets. *Not chosen:* (a) a backslash, which JSON and KDL must themselves escape, so it is easy to get wrong by one; (c) never scanning a `string` token, which stops one string token referring to another and does not reach a component file's text; (d) a per-token `literal` flag, silent in the value and absent from component files.
- **7a. A first dry run checks only a pending component's name.** Its instances' properties and slots are checked on the run that builds it, and the dry run says so once per component per file. *Not chosen:* (b) passing each pending component's declared properties and slots in `Pending` for a full check: more code in `Pending` and in the check, for a mistake the build itself stops on with its own message. The noise was the defect.
- **8a. A paint bound to a variable is compared by its variable only.** Expected and reported both drop the opacity of a bound paint; an explicit paint opacity stays compared. Target-independent and mode-independent. A hand change to a bound paint's opacity is no longer drift; old receipts are taken again once, with no write. *Not chosen:* (b) the expected alpha worked out in the layer's mode from the pins on the member and its ancestors: exact, and keeps drift on a bound paint visible, but it needs the layer's effective mode at receipt time and assumes Figma paints a bound alpha as FigCraft does, which is not measured.
- **9a. A bound `width` or `height` beside `HUG` or `FILL` is refused** by the per-member check, naming both fields and the token, in `check`, a dry run and every run, artboards included; a text's `textAutoResize` that sizes the axis counts as the sizing. *Not chosen:* (b) an explicit sizing wins and `tokens=` does not bind that axis's size, leaving the token silently unused in Figma; (c) the bound size wins and Toghen writes and expects `FIXED`, closest to CSS but overriding a word the file wrote. A contradiction is shown to the person who wrote it, not settled by a precedence rule they cannot see.
- **10b. A library collection's mode is built for FigCraft now;** Figma refuses it with one sentence until it is measured, and the measurement joins *Measurements only the desktop app can give*. *Not chosen:* (a) building the Figma path too, with a probe, and merging after a desktop session: both targets alike, but the round would wait on the desktop, and an unmeasured Figma path is the kind this project measures before it builds.
- **11b. The "handled in the other sync" rows are dropped from both plans.** A plan lists only the tokens it is for. *Not chosen:* (a) keeping them under a quiet cause, `other-sync`: no screen change, but the counts stay large and a token stays counted in both plans, which R14 forbids. The smell log records it, #53.

**Settled by the planner, none vetoed:**
1. A skip carries a `cause` from a closed set; `reason` stays the sentence, and names the token and the context.
2. Problem causes are listed up to ten per cause, then a count; `--verbose` lists all. Counts are never cut (R12).
3. After execute, `skipped` counts skips only, with failed prerequisites and cancellations; warnings, notes and breaking rows keep their own counts (R14).
4. The plugin's screen does not change this round, apart from ruling 11b's fewer rows.
5. `check` refuses `#null` on `width` and `height`; the four limits keep it.
6. The folded-name error names the rest path and how the member pins the mode.
7. A dry run of a set prints `N would update` from its steps; `--verbose` prints each patch with its fields.
8. A library collection named in `modes` is found through the lock's variable ids; the lock's format does not change; a name found twice is an error.
9. Component files run in dependency order, in real runs too; a cycle is refused.
10. An instance's sizing is written after its properties, and again whenever they are.
11. `figma.value` on a shadow is not built (lib plan, settlement 13).

**What the build found:**
- **A value the core refuses stopped whole plans.** Once lib computes a value written with a reference and throws where it cannot, every place Figma asked for a token without catching per token stopped on one refusal: the variable plan, the style plan, the load, the token graph, a component file's run. Each now reads through `readToken`, which gives the core's reason in place of the value and the token's type as the core reads it, so the token is one skip (`cannot-write`, `cannot-build`), `blocked` in the Inspector, and the rest goes on. An export still stops on it. The shadow of #123, whose colour mixes a token with `transparent`, is computed and builds its effect style.
- **A token of no type, or of a type nothing holds, is skipped in both plans**, `unsupported-type` in each: neither plan is for it, so each says so. Left as it is: unlike the other-phase rows, each row records what that plan did with the token.
- **A variant switch resizes an instance.** Measured in FigCraft 0.10.0 headless, 24 October 2026: a switch to another variant gives a fixed axis the variant's size, a width written before included, and a hug axis the variant's hugged size; a fill axis keeps its size, and each axis keeps its sizing; setting the variant the instance shows changes nothing; writing `width` on a hugging instance makes it fixed. Both writers wrote sizing before properties, so a stated width was lost; they write properties first now, and a patch that writes them writes the sizing again (`withResets`).
- **A library's collection is found by its variables.** A lock entry holds no collections, and every variable id is `<collection>/<name>`, so the prefix finds it and the lock's format stays. In FigCraft, `library.setVariableMode` copies the collection in and checks the mode's name; its refusal names no line, so the writer adds the pin's. A FigCraft dry run, which neither enables a library nor refreshes its entry, needs the library locked first. In Figma the refusal comes before any call, so nothing unmeasured runs.
- **The command line reads the files once more, for the order.** Sorting needs what each file defines and names, so `cli/run.ts` reads the component files against the design system before the variable plan; it is the one meaning the command line reads itself. A component named only by an instance's `set` value of an `INSTANCE_SWAP` is not counted, since which `set` values name components is known only from the built component (marked in `resolve.ts`).

## Found in the build: why an unchanged FigCraft run wrote members (24 October 2026)

Issue #127: a second run into FigCraft, with nothing changed, patched members on every run. The cause was isolated from the reporter's saved runs, outside this repository, by hashing candidate values with `hashOf` (`shared/components/diff.ts`) and matching them against the stamps the saved files held. Two causes accounted for every rewritten member. Ruled out: names and stamp ids (they matched), copies (none), a literal stroke weight of 1, and the text styles (the bare member used the same style and was not rewritten).

1. **A bound paint's alpha depends on the layer's mode.** FigCraft paints a bound colour with the variable's colour in the layer's mode, alpha included, at paint opacity 1, and the view reported `opacity = paint.opacity × alpha`. The expected paint took the alpha at the declared defaults. A colour transparent at rest and opaque when selected, on a layer whose member pins `selected`, was therefore patched on every run: all four members of a four-member set, six of the fifty-four of a larger one. Removing the file's `modes` line did not help, since Toghen leaves a field the file stops naming as it is, so the pin stayed. Met by ruling 8a: a bound paint is compared by its variable, and the view takes a bound paint's opacity as the paint's own.
2. **A bound height beside `HUG`.** `tokens=` bound the component's `height` token to the root and its label while the file said `layoutSizingVertical=HUG` and `textAutoResize=WIDTH_AND_HEIGHT`. FigCraft settles on fixed, whatever the order the two are written in; the next run wrote `HUG` again. Every member but the bare one, which binds no height, was rewritten: two patches each, 109 steps. Figma probably does the same (it binds a token height after setting the sizing); not measured. Met by ruling 9a: the file says two things, and the check refuses it.

**How it was measured.** Against `figcraft-cli` 0.10.0 headless, 24 October 2026: a solid paint bound to a colour variable shows the variable's value in the layer's effective mode (a child takes its root's pinned mode), its alpha in the colour, at paint opacity 1; a bound `height` makes the vertical sizing fixed and a text's resizing none; a bound `width` makes the horizontal sizing fixed, and a text that resized both ways resize its height only. The FigCraft fake now does the same (`test/support/fakeFigcraft.ts`). Before, it kept a bound paint at its written colour and bound a height without touching the sizing, which hid both causes: no fixture had a pinned mode on a nested layer with a per-mode alpha, or a height token beside `HUG`.

**Found too: a set's dry run always said `0 updated`.** It returns before anything is applied, and the command line printed the report's `updated`, so a freshness check in CI that sums a dry run's counts could never see a component rewrite. A set's dry run now prints `N would update`, the members its write steps name, and `--verbose` each patch with the fields it writes (`PATCH_LAYER` carries them into the reply, a field only restamped marked `(restamp)`).

**Receipts held before.** Every bound paint's held hash changes with 8a. The diff takes a receipt again where what Figma reports equals what the file expects, so the first run after the release restamps those fields and writes nothing; a test holds it.

## Corrected by a consumer's run: a FigCraft publish with nothing changed is refused (24 October 2026)

A library run whose sources had not changed planned nothing, wrote nothing, and exited 1 on FigCraft's refusal, `command \`library.publish\` is not available right now: no changes to publish since version 4`, so a script building several files in order stopped at the first library already in step. Found by a consumer against toghen-figma 7.0.0, headless into FigCraft 0.10.0.

- **The ruling it corrects.** *The library's publish is not conditional* (23 October) rested on a reading of FigCraft's docs, recorded as measured: a publish with no change was taken to make a version that lists no update. The fake followed it. The consumer's run is the first live measurement, and FigCraft refuses instead. The ruling stands in its words as the record; the publish is still attempted after every completed build, so it is still not conditional on the run's side, and FigCraft's refusal is now read.
- **Built:** the publish helper takes that one refusal for a library already in step: it prints *The library … is already published as version N: nothing to publish.*, still saves the file (the plugin's own record went in before the publish), and the run goes on to enable the library in the target, accept nothing, and write the lock, exiting 0. Any other refusal still stops the run. The fake refuses a publish whose assets all keep their version, with FigCraft's message; the second-run tests assert the new line instead of a second version.
- **Not chosen:** skipping the publish when the build planned nothing, since a hand edit in the library file would then never publish; and asking FigCraft first whether anything changed, which no command answers.

## Moved from the docs: the limits the round of 24 October 2026 lifted

These are the texts as they stood before the round, moved whole. The round supersedes them, and with them the entries above that recorded the same limits, which keep their words as the record of what was true then: *A dry run of a first-ever `sync`* in *Moved from Artboard files*, the headless run's *A dry run of a first `sync` that places an instance of another set stops*, and the libraries' *Not done* list (its `modes` line, and *A dry run of a first library build still stops*). The order of files and pending components (*Ruled: the nine issues of 24 October 2026*, 7a and settlement 9) lift the dry-run limit; ruling 10b lifts the library-collection one, in FigCraft, while Figma waits on a measurement.

### Moved from specs.md, *Not in this design*

- **A library's extended collections, and modes of a library's collection.** `library.extendCollection` overrides a library's values per file, and `modes` on a frame finds local collections only, in Figma as in FigCraft. Wanted when a consumer themes a library per file.

### Moved from reference.md, *Order of component steps*

**Order of component steps.** Component files run first, then artboard files, whatever order they were given in, since an artboard instantiates what the components made. A dry run lists an artboard's layers as created, patched, replaced, moved, removed or swapped. A dry run of a first-ever `sync` cannot resolve an instance whose component the same run would create: `pending` covers variables and styles, not components.

### Moved from guide.md, *A documentation page from the repository: artboard files*

1. **Build the components first.** The page instantiates them, and a `sync` or `components` run builds the component files before the artboard files. A dry run of a first-ever `sync` cannot see a component the same run would create; run the components, then the page.

## Fixed: two sizing issues a consumer's FigCraft run found (25 October 2026)

Released in 0.1.1. Both reported against 7.0.1 (the same code as 0.1.0), headless into FigCraft 0.10.0, and reproduced with synthetic files against `figcraft-cli` 0.10.0.

- **A hugging frame whose one child fills it never settled.** FigCraft set the child back to `FIXED`, so every dry run after the first reported the child's `FILL` as changed in Figma. *Chosen:* the per-member check refuses a `HORIZONTAL` or `VERTICAL` frame that hugs an axis every child in its flow fills, at the child. *Not chosen:* writing what the target keeps, since which of the two it keeps is the target's to decide and Figma and FigCraft differ. *Measured but left alone:* FigCraft sets a filling child back to `FIXED` in a hugging frame even beside a sibling of fixed width, where Figma lets the child fill. That case is not refused; it drifts in FigCraft only, and is FigCraft's to fix.
- **An instance set to fill kept its main's bound width.** FigCraft keeps a bound size fixed whatever sizing is set beside it, and an instance carries its main's binding. Setting `FILL` did nothing; letting the binding go first, then `FILL`, filled (letting it go after did not). *Chosen:* the FigCraft writer lets an instance's width or height binding go before writing `HUG` or `FILL` on that axis, when the file gives the instance no size of its own there. The main keeps its binding. The Figma target is unchanged: the report says Figma lets the sizing win, and this was not measured in Figma.

## Fixed: a slot's default content read as the artboard's (25 October 2026)

Released in 0.1.2. Reported against 0.1.1, headless into FigCraft 0.10.0, and reproduced with synthetic files against `figcraft-cli` 0.10.0.

An artboard that instantiates a component with default content in a slot, and places nothing there, never settled when the component came from a library. Each instance shows the slot's default content with the component's stamp on it. The artboard's walk reads the layers in an instance's slots, so it read those as its own: with the component in the same file, as copies of its layer ("left alone"); with the component in a library, its node not in the file, as the artboard's own layer moved, which the next run planned to remove as a breaking step, stripping the copies' stamps.

*Chosen:* in an artboard, a layer in an instance's slot whose stamp names another node is the component's, and the walk leaves it out with what it holds. What the artboard places in a slot is stamped with its own id. *Known ceiling:* a person's cut and paste of the artboard's own slot content is left out the same way, instead of read as Toghen's layer moved; the run makes the layer again and leaves the pasted one alone, unreported.

## Fixed: a large headless run read the whole file for each set and each artboard (26 October 2026)

Released in 0.1.3. Reported against 0.1.2: building three files headless took over an hour, and a dry run to check them 18 minutes; the largest, 129 artboards and about 53,000 layers, 43 to 45 minutes.

**What the measurement found.** Measured with synthetic files against `figcraft-cli` 0.10.0. A dry run of 1,216 layers took 1.5 s, of 2,426 layers 3.5 s, of 4,846 layers 12 s, and of 9,686 layers 53 s: the time grew with the square of the file's size. Each set and each artboard read the file again from FigCraft, every page and every layer, and the writer read it again after writing. Three costs came of it, in about equal parts: FigCraft answering, Toghen reading the reply (each piece of a long reply searched, with all that had arrived before it, for the line's end), and Toghen viewing every layer again. Searching every page for the set or artboard by its stamp walked every layer once more for each one. The library copies were read one request each, for each set and each artboard.

**The report's guesses, answered.** The run does not talk to FigCraft one command at a time: each set's or artboard's writes go as one batch, and each level of the layers is read in one request. A run that writes nothing did cost nearly what one that writes everything does, but because of the reads, not the comparing.

*Chosen:* the file is read once a run, and again only where a write reached (specs, *What differs from Figma for components*). A reply is read in one pass; the copies in one request; a search under a top-level layer keeps its answer until a layer in it is written. On 9,686 layers in 80 artboards: a build from 57 s to 12 s, a dry run from 53 s to 2.7 s, a run that changes one component and one artboard 4.7 s. Toghen's own part now grows with the file; FigCraft's time for each write still grows faster (3.0 s of waiting at 40 artboards, 7.6 s at 80), which is FigCraft's to look at.

*Not chosen yet:* a fingerprint of a set's or an artboard's inputs on its stamp, so an unchanged one is skipped without being read (the report's first wish). With the file read once, a dry run is a few seconds, and it still finds a change made by hand, which a fingerprint alone would not. Planned in `specs/2026-10-26-skip-unchanged`, to be ruled on once the reporter has measured 0.1.3.

*Found on the way:* changing a literal text on an artboard that exists failed in FigCraft (`component.bindProperty`: the layer isn't inside a component). The patch took the layer off a property, as for a component's layer, and an artboard's layers are in no component. An artboard's patch now takes nothing off a property. The fake FigCraft refuses the call as FigCraft does.

## Fixed: two artboard issues a consumer's FigCraft run found (26 October 2026)

Released in 0.1.4. Both reported against 0.1.2, headless into FigCraft 0.10.0, and reproduced with synthetic files against `figcraft-cli` 0.10.0.

- **An artboard's dry run always counted 0 created and 0 updated.** A dry run applies nothing, and the command line printed the report's counts, which only a real run fills: the same defect the set's dry run had (*Found too: a set's dry run always said `0 updated`*), left for artboards. So a freshness check built on dry runs said an artboard was in step while the run after it created and updated layers. *Chosen:* an artboard's dry run counts from its steps, as its real run counts what it did: the layers it would create (each layer of a new artboard, its frame included, which the step summary now carries as `layers`), the layers it would patch or swap, and the layers it would remove, as `N would create · N would update · N would delete`.
- **A new instance whose slot the artboard fills could not be added to an artboard that existed.** The plan makes the instance, then what fills its slot, in steps of their own whose parent is the slot. The FigCraft writer never learned the new instance's slot, which has an id only once the instance is made, so the first child stopped the run (`the parent "Row2 Body" of "Item2x0" does not exist`), and the whole run saved nothing. The plugin's run registers a new instance's slots (`registerSlots`); the FigCraft writer now does the same, reading the instance back once it is made.

## Fixed: an artboard's dry run planned a patch for every layer bound to a library's token (26 October 2026)

Released in 0.1.5. Reported against 0.1.4: straight after a real run with nothing to do, an artboard's dry run said `115 steps · 0 would create · 115 would update`, so a freshness check found every artboard stale. Reproduced with synthetic files and a library through `--use`, against `figcraft-cli` 0.10.0.

**What the count exposed.** A dry run imports nothing, so a library's variable or style it needed was listed as `pending: … would import`, even when an earlier run had imported it and the layers were bound to it. A pending token has no variable to compare with, so each layer that binds one was planned as a patch. The real run imports (FigCraft's import answers the copy already there), compares, and finds nothing to do. The patches were there before 0.1.4 too: an artboard's dry run then counted nothing, and they hid behind `0 updated` (*Fixed: two artboard issues a consumer's FigCraft run found*).

*Chosen:* a dry run that needs a library's variable or style first looks for a copy already in the file, by its key, and takes it as the real run would; only one not in the file is pending. A read, never a write. FigCraft lists a library's copies under the key the lock holds, so the look finds them there. In Figma an imported variable's id is not its key, so there the look finds nothing and a dry run lists it as pending, as before (not measured in Figma). A library's component is still listed as `would import` in a dry run, but an instance compares by key and plans no patch for it.

## Built: skipping what has not changed, by fingerprint (26 October 2026)

Released in 0.1.6. Asked by a consumer whose checks of three FigCraft files still took 3 min 29 s on 0.1.4, and whose UI library run and full artboard run were the long ones. Planned in `specs/2026-10-26-skip-unchanged`; ruled by Egildo the same day: build now; today's full check stays the default, with an opt-in flag that trusts the fingerprints; the fingerprint hashes what the run would write.

**Built.** Every real run that finishes a set or an artboard stamps a fingerprint of what it would write for it (specs, *Skipping what has not changed*). `--skip-unchanged` leaves unread each one whose fingerprint is the same, and says `unchanged, its fingerprint the same; not read`. In FigCraft, a dry run with the flag reads a top-level frame's insides only where it compares it. A dry run finds a library's component already in the file by its key, as 0.1.5 does for variables and styles, so nothing is pending and the fingerprint can answer. Measured with synthetic files against `figcraft-cli` 0.10.0, 9,686 layers in 80 artboards: a dry run with the flag 1.5 s, without it 2.7 s; one artboard changed, it alone is read and planned.

*Not chosen:* the reporter's default, fingerprints trusted unless `--check-drift` asks for the comparison. A change made by hand would go unseen unless someone asked.

**Found on the way, fixed in the same release.**

- **Every view of a layer a run made stayed in memory.** Since 0.1.3, a scene kept the views of the layers no write touched, and each view's functions held the scene they were made in, and through it the scene before, back to the first. A build of 80 artboards ran out of memory once the fingerprints added a little more. Views are now made by a viewer that holds no scene, and Toghen's own memory no longer grows with each artboard.
- **A step's place in a batch was read as a layer's id.** `{ $step: 6 }` names what step 6 of the batch makes; the record of what a write touched took the 6 for an id. And an instance's creation answers with its component's id nested in the result, which was taken for a layer written. Either made the component look written, so every artboard holding an instance of it was read again after each artboard built, as before 0.1.3. A build of 80 artboards: 12 s on 0.1.5, 10.4 s now.

*Known ceiling, recorded:* a run that stops partway after writing keeps the old fingerprint; if the inputs are then changed back to it, a skipping run takes the set or artboard as unchanged. A run without the flag sets it right.

## Fixed: a skipped set still cost most of a second (26 October 2026)

Released in 0.1.7. Reported against 0.1.6: a `sync` dry run with `--skip-unchanged` spent about 0.8 s on each set it skipped, 103 s for 129 sets, where a `components` run skipped 129 artboards in 18 s.

**Found.** Before comparing fingerprints, each component file is resolved, and resolving builds the sum of the loaded design system: every token in every mode, read and routed to its variable. The sum was cached nowhere; it was built again for each component file, and once more in each plan and in the check before them. An artboard run in `components` has no design system loaded, so it never paid. The cost grows with the tokens and the modes: on a synthetic document of 1,745 tokens in two modes a build takes 50 ms, in ten modes 155 ms, and in twenty-one 1.2 s. Profiled, it was 7 of a dry run's 9 s.

*Chosen:* the sum is built once for each document, base name, type map and set of unfolded groups, and shared (`buildSum`, `main/utils/sum.ts`). A loaded document does not change, and no caller changes the sum. Measured against `figcraft-cli` 0.10.0 on 40 sets, each on its own page, ten modes: each skipped set from 0.155 s to 2 ms, the whole dry run from 8.3 s to 1.5 s.

*Not reproduced:* the 39 s the reporter's run took before its variable plan was printed. On the synthetic documents everything before that line took 0.9 to 2.3 s, before the fix and after; FigCraft's reads in it were seven requests. Asked of the reporter: a measurement on 0.1.7, and a CPU profile if it is still long. A fingerprint of the variable plan, as the reporter proposed, is not built: it waits for the measurement.

## Fixed: the snapshots of every mode were taken for every file (26 October 2026)

Released in 0.1.8. Reported against 0.1.7 by the consumer that reported the skipped sets, with a CPU profile of their UI library's dry run: 82 of its 99 s were in `snapshotModes`, which reads every token in every mode. 0.1.7 kept the sum, not the snapshots. The style names took a fresh set (`styleTarget.ts`), and so did each reading of a component file whose group binds a composite `border` (`designSourceOf`, made anew for each reading); each file is read three times in a sync: for its names, in the check, and in its run. The reporter found the callers in the profile and the cause in the source.

*Chosen:* the snapshots are taken once for each resolution and shared (`snapshotModes`, `main/utils/resolverModes.ts`), as the sum is. A resolution is built once per document and nothing changes the snapshots. On a synthetic document of 17 modes one taking is 288 ms; the next ones are free. Measured against `figcraft-cli` 0.10.0 on 40 synthetic sets, each bound to a token group with a composite `border`: the time before the variable plan from 23.6 s to 2.8 s, and each set from 0.27 s to 11 ms.
