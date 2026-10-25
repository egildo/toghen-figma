# Plan: finish the FigCraft target (23 October 2026)

Components reach FigCraft since figma 6.2.0, but a run stops before writing when a component file needs a field or a layer kind the FigCraft writer does not build yet (`refuses` in `cli/figcraftApply.ts`). The research of 23 October (`.reference/skills-research/figcraft-2026-10-23.md`) measured every refused item against FigCraft 0.9.0 and found nearly all of them buildable now. It also found two bugs in what 6.2.0 writes. This round fixes the bugs and builds what was refused, so a component file that builds in Figma builds in FigCraft too, apart from what FigCraft itself cannot do. Egildo answered on 23 October: FigCraft is pinned at 0.10.0 (0.10.0 changes only security, CI and the README, so 0.9.0's measurements hold), and this round comes before the skills are written.

## 1. Findings

### 1.1 Measured by the research, against FigCraft 0.9.0

The research file holds the commands and the answers. In short:

- **A literal written to a bound field detaches its variable** (since 0.8.0). Two consequences for what 6.2.0 writes:
  - **Per-side strokes.** A literal side written after a bound side detaches every side binding, because FigCraft keeps the four sides as one field. Toghen writes the sides in the order top, right, bottom, left, each bound or set, so a literal side after a bound one loses the bindings before it. Writing every literal side in one `node.set`, then binding, keeps them all.
  - **Corners.** A literal corner list written after a bound `cornerRadius` detaches it. And a per-corner binding beside a bound `cornerRadius` is inert: both appear as bound, but `cornerRadius` wins. Toghen's writer binds both when a file gives a `cornerRadius` token and a corner token. The comment in `fieldCommands`, "`cornerRadius` first: a corner then overrides its own", is wrong. Writing the literal list first and then binding each corner one by one, never `cornerRadius`, works.
- **Effects as fields:** `node.set {effects: [...]}`, then `variable.bind {field: "effects/<i>/<radius|spread|color|offsetX|offsetY|startRadius>"}`. Unknown keys are refused.
- **Layout grids as fields:** `node.set {grids: [{kind, count, gutter, offset, size, align, color, visible}]}`, then `variable.bind {field: "layoutGrids/<i>/<size|count|gutter|offset>"}`. Unknown keys are accepted silently; bad enum values are refused.
- **Constraints:** `node.set {constraints: {horizontal: left|right|leftRight|center|scale, vertical: top|bottom|topBottom|center|scale}}`. They are reported only on children of plain frames and on absolute children, and refused on layers inside an instance.
- **Dashes:** `node.set {dashes: [4, 2]}` round-trips. They cannot be bound, in Figma either.
- **Blend mode:** a non-normal mode round-trips. On a frame, normal and pass-through both read back with no `blend` key.
- **Grid layout:** `layout: "grid"`, `gridColumns`, `gridRows`, `columnTracks` and `rowTracks` (`fixed`, `fill`, `hug`), and a child's `gridColumn`, `gridRow`, spans and `gridAlignH`/`gridAlignV`. They read back under `layout` and `gridCell`. In a grid, `gap` is the column gap and `crossGap` the row gap.
- **Lines:** `node.create {type: "line"}`. Strokes, weight, dashes and fill sizing round-trip. `strokeCap` is accepted but not reported.
- **Slots:**
  - `component.makeSlot {id, name, preferred}` makes a slot layer and its property. `node.get` shows `slot: "<name>"`.
  - `instance.slotInsert {id, slot, component, index?, replace?}` fills a slot. Any structure command can fill it too, with `parent` set to the instance's slot layer.
  - The first edit copies the main's default content into the instance with new ids. From then on those layers are the instance's own, carry overrides and take layer data.
- **Gradients on layers:** `node.set {fills: [{type: "linearGradient", stops, from, to}]}`, then bind `fills/<i>/stops/<j>/color`. They read back as paint styles already do.
- **Preferred values:** `component.editProperty {name, preferred: [component ids]}` works. FigCraft is not the limit: the step Toghen plans carries no ids.
- **The four commands written but not tried live** all work as written:
  - `component.editProperty {newName}`;
  - `instance.setProperties` with a component id for an instance swap (a name is refused, and the nested instance is renamed after its new main);
  - `node.reparent` with `index`;
  - `variable.bind` on per-side strokes.
- **Library variables are read as local.** After `library.bindVariable`, `variable.list` lists the library's copies with ids prefixed by the library id (`<16 hex>:VariableID:1`). Their mode ids are not prefixed, so they collide with the local collection's. `figmaView` reads them as local variables. This is a bug in what is merged, reached as soon as a FigCraft file uses a library.
- **Headless:** `figcraft-cli mcp` without `--attach` keeps one session open over stdio. Opening a file, a batch that starts with `doc.switch` and holds a write and a `node.get`, and then saving the file all work. The CLI must be 0.8.0 or later for `pluginData` in `node.get`. `figcraft-cli run` is all-or-nothing and loses its reads on a failure, so it cannot serve the run.

### 1.2 Measured for this plan, against FigCraft 0.9.0, live

These were measured in a new file of my own. Every command went in a batch that started with `doc.switch` to that file, with the window id. The file was closed with `force`, and the window put back on the tab it showed before.

- **Reported:** a wrapped frame's `contentAlign` (Figma's `counterAxisAlignContent`, `spaceBetween` read back), `strokeJoin` (`round`), a text's `listSpacing` (6), `leadingTrim` (`capHeight`) and `textAutoResize: "truncate"`.
- **Accepted but not reported:**
  - `cornerSmoothing` (0.6 written, no key read back);
  - `maxLines` (2 written, no key read back);
  - `paragraphSpacing` (4 written, no key read back);
  - and, from the research, line caps and normal against pass-through on frames.

  `paragraphSpacing` is already in the writer's built list (`TEXT` in `figcraftApply.ts`), and the FigCraft view does not map it. Its receipt therefore hashes nothing at the write and nothing at the next read, so a hand change goes unseen. That matches how wiring and modes behave, but nothing says so.
- **Auto layout overrides on an instance work:** `node.set {gap: 10, paddingTop: 7}` on an instance reads back with `overrides: ["gap", "padding"]`. An instance counts as a frame for these keys (the research's open question 5).
- **A nested instance can be exposed:** `component.exposeInstance {id, exposed}`, listed by `instance.exposed`. This is Figma's `isExposedInstance`.
- **`$step` in a pinned batch counts the `doc.switch`:** the first command after it is `{"$step": 1}`. The target's `inFile` wraps the steps in an inner `command.batch`, so its own references stay right. A probe that forgets this fails with "step 0's result has no `id`".

### 1.3 The code, read

- **Every field is written in two places and read in a third:**
  - `fieldCommands` in `figcraftApply.ts` writes it;
  - `refuses` lets it through (`BUILT`);
  - `sceneOf` in `figcraftScene.ts` reads it back in Figma's shape.

  The receipts are Figma's (`stampReceipts`, `expectedOf`), so a field whose read-back does not match Figma's shape reads as drift on the next run. Every unit below therefore touches both `figcraftApply.ts` and `figcraftScene.ts`, plus the fake's `node.set` and `node.get` (`test/support/fakeFigcraft.ts`).
- **Converters that already exist:** `cli/figcraftFile.ts` already turns Figma's effects and gradients into FigCraft's (`effectsValue`, `paintsValue`), and back (`reported`, `transformOf`), for effect and paint styles. Layers can use the same converters.
- **What wiring and modes already do:** `toghen.unreported` holds what FigCraft keeps but does not report (wiring and modes), and the view answers those fields from it. The same mechanism can carry any field FigCraft accepts and does not report (question 1).
- **Fields in Toghen's field table that the FigCraft writer does not build yet:**
  - effects and layout grids;
  - `constraints`, `dashPattern`, `blendMode`, `cornerSmoothing`;
  - `strokeCap`, `strokeJoin`;
  - grid layout: `grid`, `gridRowSizes`, `gridColumnSizes`, `gridChildHorizontalAlign`, `gridChildVerticalAlign`;
  - `counterAxisAlignContent`;
  - text: `listSpacing`, `maxLines`, `textTruncation`, `leadingTrim`;
  - `isExposedInstance`, `tokens`.

  Layer kinds not built: `LINE` and `SLOT`. Property kinds not built: `SLOT` properties, and token defaults on properties. Also not built: a component named by key.
- **The ruling to scope:** decisions.md, *Ruled: a FigCraft target*, rejected "talking to FigCraft through `figcraft-cli mcp`". That was right for the live app, where the socket already does it. Headless is the one case where MCP is the only way in.
- **specs, *Not in this design*,** says a run with nobody at the screen "could reach only variables, over REST, and only on Enterprise". That holds for Figma only.

## 2. Design

**Literals first, then bindings, everywhere.** One rule in `fieldCommands`, for every field that has both literal parts and bound parts (sides, corners, effects, grids, gradient stops): write the whole literal value in one `node.set`, then bind its parts. Never bind `cornerRadius` when any corner differs: bind the four corners one by one. A test in the fake reproduces FigCraft's detach rule, so a wrong order fails.

**Each new field: write, let it through, read it back.** For each field: the write in `fieldCommands`, the field added to `BUILT`, and its read-back in `sceneOf` in Figma's shape. Effects and gradients reuse `figcraftFile.ts`'s converters, moved where both modules can import them.

**Fields FigCraft does not report** (question 1). They are written, and what was written is kept in `toghen.unreported` beside wiring and modes. The view answers them from there, so the receipt trusts what Toghen wrote and only a hand change to them goes unseen. That is exactly the state of wiring and modes today. They are:
- normal against pass-through;
- corner smoothing;
- max lines;
- paragraph spacing;
- line caps.

They are added to the drafted upstream request (`.reference/figcraft/request-node-get.md`), with a second ask: `variable.bind` should refuse a field name it does not know.

**Slots.** A `SLOT` layer becomes a frame made into a slot (`component.makeSlot`), and a `SLOT` property is declared with its preferred components. A file's slot contents become layers placed in the instance's slot (`instance.slotInsert`, or a structure command whose parent is the slot layer). The snapshot has to expect that the first edit copies the main's default content into the instance with new ids. Those copies are the instance's own and carry no stamp of Toghen's, so they are left alone unless the file names them.

**Preferred values** (question 4). The property steps carry the preferred components by name, and the writer turns them into ids (`component.editProperty {preferred}`, `component.makeSlot {preferred}`).

**Exposed instances:** `component.exposeInstance {id, exposed}`. The read-back comes from `instance.exposed` on the main.

**Remote variables.** `figmaView` leaves out of the local listing every variable and collection whose id carries a library prefix, as Figma's `getLocalVariables` does. This is a bug fix, whatever question 2 decides.

**Headless** (question 3). A second transport behind the same `Control` interface in `cli/figcraft.ts`:
- `connect` either opens the socket, as today, or starts `figcraft-cli mcp` as a child process and speaks MCP's `tools/call run_command` / `batch` over its stdio.
- The headless form opens the file itself (`open_file`) and saves it at the end (`save_file`).
- It has no window, which the target already handles.

The flag would be `--figcraft-file <path.figcraft>`, beside `--figcraft <port>`. Everything above the transport is unchanged.

## 3. Units

Units 1 to 4 each touch `figcraftApply.ts`, `figcraftScene.ts` and the fake, so they run **one after another**, in this order. Unit 5 touches only the transport, so it runs **in parallel** with them. Unit 6 comes last.

1. **The two bugs, and the remote variables.** Files: `cli/figcraftApply.ts` (`fieldCommands`: sides, corners, the comment), `cli/figcraftFile.ts` (`figmaView`: leave out prefixed ids), the fake (the detach rule; prefixed library copies in `variable.list`), `test/figcraftComponents.test.ts`, `test/figcraft.test.ts`. Done when:
   - a literal side beside a bound side, and a literal corner beside a corner token, both keep their bindings across two runs;
   - a file with a library variable plans nothing for it.
2. **Paints and lists.** Files: `figcraftApply.ts`, `figcraftScene.ts`, the converters moved out of `figcraftFile.ts`, the fake, tests. Done when effects, layout grids and gradients on layers (with stop bindings) build, plan nothing on a second run, and a hand change to any of them is drift. Tests use the W3C structured shapes: a shadow token, a gradient token, a dimension `{value, unit}`.
3. **Layout and shape.** Files: as in unit 2. It covers:
   - constraints;
   - grid layout with its tracks and child placement;
   - `counterAxisAlignContent`;
   - dashes, `strokeJoin`, `strokeCap`, `blendMode`, `cornerSmoothing`;
   - `LINE` layers;
   - text: `listSpacing`, `leadingTrim`, `textTruncation` (as `textAutoResize: "truncate"`) and `maxLines`.

   The fields that are not reported go through `toghen.unreported` (question 1). Done when each builds and plans nothing on a second run.
4. **Slots, preferred values, exposed instances.** Files: `figcraftApply.ts`, `figcraftScene.ts`, `shared/components/steps.ts` and `diff.ts` if the property steps gain preferred values, `main/components/update.ts` (question 4), the fake, tests. Done when:
   - a component with a slot and preferred components builds;
   - an artboard places content in an instance's slot;
   - a second run plans nothing and leaves the copied default content alone.
5. **Headless transport** (if question 3 says this round). Files: `cli/figcraft.ts` (`connect`, `pinShownFile`, `close`), `cli/main.ts` (`--figcraft-file`), `cli/run.ts`, a fake MCP child process under `test/support/`, tests. Done when `sync … --figcraft-file x.figcraft` builds into a saved file with no app running, and a second run plans nothing. Needs `figcraft-cli` 0.8.0 or later; 0.10.0 is being installed.
6. **Docs, the upstream request, a live run.** Files:
   - specs.md: *FigCraft*'s list of what is refused and what goes unseen, *Not in this design*'s CI line, the property-description sentence;
   - reference.md: *Into FigCraft*;
   - guide.md: *Syncing into FigCraft*;
   - decisions.md: the ruling's scope, plus "What the build found";
   - `.reference/figcraft/request-node-get.md`.

   The live run uses a component file with every new field and kind against FigCraft 0.10.0: build, second run, a hand edit, `--overwrite-drift`, save, reopen. With unit 5, the same run happens headless.

## 4. Risks

- **A field read back in a shape that differs from Figma's by a hair** (an enum's case, a default left out) reads as drift on every run. Mitigation: every unit's done-condition includes "a second run plans nothing", in the fake and live.
- **Unreported fields are trusted.** A hand change to one goes unseen until FigCraft reports it. This is stated in the specs, and the upstream request asks for it.
- **Slots copy content with new ids.** A reconciler that addresses layers by name or position could take the copies for Toghen's own. They carry the main's layer data, as instances do, and the view already treats a layer inside an instance as never Toghen's (`own` in `sceneOf`). Slot content placed by Toghen must be stamped after insertion, inside the instance, which is the first time Toghen stamps a layer there. Needs a careful test.
- **FigCraft releases weekly.** The detach rule, the unreported fields and the library prefix are measured, not documented. The live run at the end, against 0.10.0, is the check.
- **Headless fonts.** A CI machine has other fonts, and `--no-system-fonts` changes what `text.fonts` lists, which the style plan reads. The first build uses the machine's fonts, as the app does. A flag for repository fonts (`text.loadFont`) waits until someone needs it.

## 5. Questions

1. **Fields FigCraft accepts but does not report:** normal against pass-through, corner smoothing, max lines, paragraph spacing and line caps.
   - (a) Write them, and keep what was written in the same record as wiring and modes, so the receipt trusts it. A hand change to them goes unseen, as with wiring and modes today. Add them to the drafted upstream request.
   - (b) Refuse them by name until FigCraft reports them. Paragraph spacing, built today, would then become refused.
   - (c) Write them with no receipt, so every run writes them again.

   Recommended: (a). It is the rule already in place, and it keeps a component file that builds in Figma building in FigCraft.
2. **Libraries in FigCraft.** FigCraft's libraries are local `.figcraft` files with no keys: a component is named by library and name, and a library's variables come with prefixed ids.
   - (a) This round fixes only the bug, so library variables stop being read as local. A component named by key, and `--library` with `--figcraft`, stay refused. Libraries in FigCraft get their own round, with their own measurement of publishing and updating.
   - (b) Build `--library <file.figcraft>` this round: build in the library file (a second tab), publish it, and have the target import by library and component name.

   Recommended: (a). FigCraft's libraries are another model (no keys, no lock), and they want their own design.
3. **Headless runs**, which make an automated pipeline possible for `.figcraft` files.
   - (a) This round, as unit 5, in parallel with the field work. It needs `figcraft-cli` 0.8.0 or later, being installed at 0.10.0.
   - (b) Its own round, right after this one.
   - (c) Not until a consumer asks.

   Recommended: (a). It touches only the transport, so it costs no waiting, and the skills that come next are about exactly that pipeline.
4. **Preferred values**, for instance-swap and slot properties. FigCraft takes component ids; Toghen's step carries none today, in either target.
   - (a) Carry them in the step, write them in FigCraft now, and write them in Figma once measured in the desktop app (the plugin needs component keys there). Until then the Figma side keeps saying they are not written.
   - (b) Both targets now, with Figma's side unmeasured.
   - (c) Neither: leave them unwritten.

   Recommended: (a). FigCraft is measured; Figma's side should not ship unmeasured.

## Answers (23 October 2026)

1. **(a)** Fields FigCraft accepts but does not report are written, and what was written is kept beside wiring and modes, so the receipt trusts it. They go into the drafted upstream request.
2. **(a)** Only the bug: library variables stop being read as local. Libraries in FigCraft get their own round.
3. **(a)** The headless transport is built this round, as unit 5, in parallel, on a branch of its own (`figcraft-headless`), merged by the coordinator. This branch does not touch its files.
4. **(a)** Preferred values are carried in the step and written in FigCraft now. Figma's side waits for a measurement in the desktop app.

## What the build found (23 October 2026)

Units 1 to 4 and 6 are built on `figcraft-finish`; unit 5 is on `figcraft-headless`. What differed from the plan, in short (decisions.md, *What the build found: finishing the FigCraft target*, has the detail):

- **Preferred values are refused, not written.** The format names them by published key only, and Figma's side already writes them; FigCraft has no keys. Answer 4 needs a format change to be built as worded.
- **A Figma bug came up with the corners.** A field bound by its parts beside a part of its own was written on every run, in Figma as in FigCraft; fixed in `expectedOf`.
- **Paragraph spacing** was written on every run in FigCraft, for want of a reading; it is now kept with the unreported fields.
- **What fills a new instance's slot** is made by a second batch of the same run, once the slot layer has an id.
- **`textTruncation` stays refused**, FigCraft's truncation being a sizing mode.
- **The live run, against 0.10.0,** found one more bug: a side written lets a bound `strokeWeight` go, so the sides are now bound one by one, as the corners are. It settled the line caps' spellings (`TRIANGLE_FILLED` refused), the blend modes, and that any structure command takes a slot layer as its parent. Every built kind, the two fixes and the slots ran: a second run planned nothing, a hand edit was drift, and a save and reopen planned nothing.
