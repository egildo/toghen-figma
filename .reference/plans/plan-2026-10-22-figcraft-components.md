# Plan: components in FigCraft (22 October 2026)

Egildo chose route 1 on 22 October 2026: component files reach FigCraft by **reconciling in place, with stamps, as in Figma**, not by importing a whole generated file. The specs park this as "Components in FigCraft" under *Not in this design*: "the component engine's snapshot and apply, written a second time against FigCraft's commands". What unblocked it is the stamps round merged the same day (figma 6.1.0): the FigCraft target now keeps a record of what it wrote, and FigCraft 0.8.0 reads layer data back.

What this round would give the FigCraft target: `toghen-figma components` and `sync` accept `--figcraft <port>`. A `.component.kdl` or `.artboard.kdl` file builds a component set or an artboard in the file FigCraft shows, and a later run changes only what moved. A hand edit is kept and reported, and the dry run, the breaking gate and `--overwrite-drift` work as they do in Figma.

## 1. Findings

### 1.1 Measured against FigCraft 0.9.0, live, 22 October 2026

Measured over the control socket on port 7981, in a new file of its own ("toghen-components-probe"). The file was saved to the scratchpad, reopened, then closed with `force`. The command list is the app's own (`engine.commands`, 569 commands). Each finding below gives the command and its answer.

**Components and sets**

- **`component.create {ids: [frame]}` keeps the frame's id.** The frame's layer data comes with it: the frame `2` became component `2`, with its `pluginData`.
- **`component.combineVariants {ids: [2, 6]}` makes a set with a new id** (`{id: 8}`), named "Component 1".
  - The members keep their ids and their layer data.
  - `component.properties {id: 8}` reads the variant axis from the members' names: `{name: "State", options: ["rest", "hover"], default: "rest"}`.
  - The set's `node.get` reports no auto layout.
- **Properties are keyed by display name, not by Figma's `Name#id`.**
  - `component.addProperty {id: set, name: "Label", type: "text", default: "Label", layer: 3}` answered `{id: 8, name: "Label"}`.
  - Each member's `node.get` lists `componentPropertyDefinitions: {"Label": {type: "text", default: "Label"}, …}`. The set's own `node.get` does not.
  - `component.editProperty {name: "Label", newName: "Text"}` renamed it, and an instance's value (`"Go"`) followed the rename.
  - `{name: "State", default: "hover"}` moved the hover member to the set's top-left (x 20), as the docs say.
  - `component.deleteProperty` and an `instanceSwap` property (`{type: "instanceSwap", default: <set>}`, which answered the set's default variant) both worked.
- **Wiring a layer to a property works, and is never reported.**
  - `component.bindProperty {layer, property, field: visible | characters | mainComponent}` answered `ok`, and an instance follows it: `instance.setProperties {properties: {Label: "Go"}}` changed the wired text.
  - No read reports the wiring. It is absent from `node.get`, `document.inspect` and `inspect.properties`. FigCraft's source keeps it as `prop_refs` on the node, and it is written into the saved file, but nothing reads it back.
- **A set never breaks.** Figma throws "Component set has existing errors" on a set with two members of one combination. FigCraft keeps the set and lists the clash:
  - Renaming member 6 to `State=rest` gave `component.properties` → `conflicts: [[2, 6]]`.
  - A member named without `=` (`Hover`) was accepted silently, and the axis options did not change.
- **Moving a member out of its set and back works.**
  - `node.reparent {ids: [6], parent: 1}` left the set with one member and its properties.
  - An instance of the moved member still pointed at it.
  - `node.reparent {ids: [6], parent: 8}` put it back.

**Instances**

- **`instance.create {component: <set>}` makes an instance of the set's default variant.**
  - `node.get` reports `mainComponent`, `mainComponentName` and `componentProperties: {"Label": "Label", "Show label": true}`, keyed by name. `overrides` lists the groups overridden (`["name"]`).
  - An instance made by command is the size of its main (an 8 × 8 component gave an 8 × 8 instance), unlike an instance in an imported file.
- **An instance carries a copy of its main's layer data, taken when it is made.**
  - The instance's root and its children read the main's `pluginData`, stamps included.
  - A later change on the main does not reach it, and the instance can be given data of its own.
  - So an instance shows a member's stamp, with the member's id in it. This is the case Figma's copies already present, and `isOwn` tells them apart (the stamp names another id).
- **`instance.swap {ids, component}` keeps the instance's id, name and layer data.** A nested instance inside a member (`instance.create {component, parent: <member>}`) can be wired to an instance-swap property and swapped.

**Copies and ids**

- **A copy carries the stamp.**
  - `edit.duplicate` of a member *inside a set* made a component in the set with the original's `pluginData`.
  - `edit.duplicate` of a main component *not in a set* made an **instance** of it, also with its data.
  - Both are told apart from the original by the id the stamp records, as in Figma (decisions, *Ruled: a copy carries the stamp*).
- **Node ids hold across a save, a close and an open,** and so does every node's layer data.
- **Node ids are not given again.** Unlike variables and styles, deleting the newest node and making another gave a new id (21 deleted, next 22). The one exception is undo: undoing two steps brought 21 back and made 22 free again, and the next frame took 22. So a node's stamp needs no guard of its own against reused ids.

**Fields**

- **Every field the field writer binds also binds in FigCraft.** `variable.bind` answered `ok` for all of these, on a frame:
  - `fill`, `fills/0/color`, `stroke`;
  - `strokeWeight`;
  - `paddingTop`, `paddingLeft`, `paddingHorizontal`, `gap`, `crossGap`;
  - `cornerRadius`, `topLeftRadius`;
  - `width`, `height`, `minWidth`, `maxWidth`;
  - `opacity`, `visible`;
  - `effects/0/radius`, `effects/0/color`, `effects/0/spread`, `effects/0/offsetX`.

  And on a text: `fill`, `characters`, `fontSize`, `lineHeight`, `letterSpacing`, `paragraphSpacing`, `fontFamily`, `fontStyle`, `fontWeight` and `visible`.
  - `node.get` reports them as one flat map in FigCraft's names, `boundVariables: {"fill": "VariableID:1", "paddingTop": "VariableID:2", …}`.
  - A text layer binds a font weight, which a text *style* does not (the stamps round).
- **Opacity binds as a percentage.** A number variable holding 12 gave `opacity: 0.12`.
- **A width bound on a frame that hugs is not its width.** The frame bound to 12 reported 48, its content's width.
- **A variable mode on a frame works, and is never reported.** `variable.setMode {ids: [frame], collection, mode: "dark"}` repainted the frame in the dark values. No read reports the mode: `node.get` has no key for it, and `document.inspect` names no mode.
- **Styles on layers** are reported:
  - `style.apply {ids: [text], style: "S:1"}` gave `styles.text: "S:1"` and `textStyleRanges: [[0, 5, "S:1"]]`.
  - The same on a member with an effect style gave `styles.effect: "S:2"`.
- **Other fields read back** as `node.set` spells them:
  - per-side strokes, as `strokeSides: [1, 1, 2, 1]`;
  - per-corner radii, as `cornerRadius: [4, 4, 0, 0]`;
  - `minWidth`, `clip`, `constraints`, `sizing: {horizontal, vertical}`;
  - auto layout under `layout`: `{mode, gap, crossGap, padding: [t, r, b, l], mainAlign, crossAlign, wrap, contentAlign, strokesIncluded, …}`.

**Batches**

- **A batch builds a member in one undo step.** `command.batch` over `engine.execute`, with `{"$step": n}` standing for an earlier step's id, ran: `frame.create`, then `text.create` into it, then `node.set` of its layer data, then `component.create`. Answer: `[{id: 19}, {id: 20}, {ok: true}, {id: 19}]`.

**Not measured, to measure in the unit that needs them**

- slots (`component.makeSlot`);
- layout grids and dash patterns bound;
- grid tracks;
- `textTruncation`;
- exposing a nested instance (`component.exposeInstance`);
- whether a page's `node.get` reaches a member's children at depth. A walk with `node.get {id: page, depth: 8}` listed only the page's top level. `document.inspect {allPages: true, depth}` is the other way in.

**Seen in passing.** "SibarDOC UI" was the tab shown when the probe began, and the window was put back on it. "Fascicoli — bozze" was marked unsaved when the probe ended. The probe never switched to that file, and every probe script switched to its own file first. But FigCraft acts on the tab it shows, so a second program driving the same FigCraft could change that. Egildo may want to look at it.

### 1.2 The consumer's evidence (read only)

`sibardoc-prototype` builds its two FigCraft libraries by writing a whole file in the shape of Figma's web API and importing it (`file.import`), then fixing what the import gets wrong with command scripts. The limits it works around are all on the import:

- **Instance sizes.** The import sizes an instance as if it were empty, so `instances.mjs` resizes each one. Measured above: an instance made by command has its main's size.
- **Width bindings.** The import refuses them, so `bindwidths.mjs` binds them afterwards with `variable.bind {field: "width"}`. That command works.
- **Slots.** The import makes plain frames, so `slots.mjs` turns them into slots with `component.makeSlot` and `component.bindProperty {field: "slot"}`.
- **An offset inner shadow** drawn as an outline on a stretched instance, in FigCraft 0.6.0 (not checked in 0.9.0).

Every fix is a FigCraft command, so building command by command hits none of the import's limits.

Their `members.mts` expands each component file with Toghen's own reader. It reaches it by private paths: `main/components/file.ts` (`readComponentText`), `main/utils/resolverModes.ts` (`resolveSumModes`) and `cli/run.ts` (`readSource`), through a link to this working copy, running TypeScript directly. Any rename here breaks their build. The general need is to expand component files into their members, with what the reader found, without Toghen's internals.

### 1.3 The engine, read from the code

- **Pure, and reused as it is:**
  - the reader and the expansion: `shared/components/read.ts`, `members.ts`, `axes.ts` and `check.ts`, entered through `readComponentFile` in `shared/components/index.ts`;
  - the diff (`shared/components/diff.ts`, `diff` and `diffArtboard`), with the `Snapshot` it compares against, which is plain data;
  - the `Step` union (`shared/components/steps.ts`);
  - the member board (`memberBoard`);
  - the restack rules (`shared/components/stack.ts`);
  - the receipt's hash (`hashOf`).
- **Figma-bound, about 3,100 lines.** These need a FigCraft counterpart:
  - `snapshot.ts`, which finds the stamped set with `findAllWithCriteria` page by page;
  - `resolve.ts`, which turns every name a file uses into a Figma variable, style, component or mode;
  - `apply.ts` and `update.ts`, which carry out the steps with node setters and methods;
  - `fieldWriter.ts`, which writes and reads each field;
  - `receipt.ts`, which holds `reportedOf` (what Figma reports for a field) and `expectedOf` (what Figma would report for the file's value);
  - `stamp.ts` and `endOfRun.ts`.
- **The Figma API surface is narrow.** Node creation is `createFrame`, `createComponent`, `createText`, `createLine`, `combineAsVariants` and `createInstance`. Then come about twenty node methods: `appendChild` and `insertChild`; `remove`; `add`, `edit` and `deleteComponentProperty`; `setBoundVariable`, `setRangeBoundVariable` and the paint, effect and grid binding calls; `setProperties`; `swapComponent`; `setExplicitVariableModeForCollection`; the two style setters; `resize`; and shared plugin data. The rest is assigning a property. All of these are synchronous, and `createFrame` answers an id at once.
- **`expectedOf` works for both targets as long as resolution gives it Figma-shaped objects.** It reads only the file's side, through `Resolved`: `color(path).id`, `textStyle(path).id`, `component(ref)` and `mode(collection, mode)`. The FigCraft view already answers variables and styles in Figma's shapes (`figmaView`). So a `Resolved` over FigCraft lets the file's side of every receipt be computed by the same code in both targets.
- **The commands.** The command line sends three of them for components: `CHECK_COMPONENTS`, `RUN_COMPONENT` and `FINISH_COMPONENTS`. Today the FigCraft bridge runs the plugin's own handlers with a `figma` that answers only variable and style reads. `components` and `sync` refuse `--figcraft`.

### 1.4 Each step, and each field, in FigCraft's commands

| Step | In FigCraft |
|---|---|
| `CREATE_SET` | Per member, one batch: `frame.create`, then its layers (`frame.create`, `text.create`, `node.create {type: line}`, `instance.create {parent}`), then their fields, then `component.create`. Next, `component.combineVariants` and the set's name. Then `component.addProperty` per property and `component.bindProperty` per wired layer. Then the board (`transform.moveTo`), and the stamps and receipts last. |
| `CREATE_ARTBOARD` | The frame tree as above, without `component.create`. |
| `REFUSE_FOREIGN`, `LEAVE`, `OVERWRITE` | Nothing written. |
| `ADD_PROPERTY` / `EDIT_PROPERTY` / `DELETE_PROPERTY` | `component.addProperty` / `component.editProperty` (`default`, `preferred`) / `component.deleteProperty`. FigCraft's properties carry no description: `EDIT_PROPERTY`'s `description` change has nowhere to go (risk 4). |
| `RENAME_AXIS` | `component.editProperty {name, newName}`, then the members' stamps again. |
| `CREATE_MEMBER` | A member built as in `CREATE_SET`, then `node.reparent {parent: <set>}`. Measured: a component joins a set this way. |
| `DELETE_MEMBER`, `DELETE_LAYER`, `REMOVE_STRAY` | `edit.delete`. |
| `CREATE_LAYER` / `REPLACE_LAYER` | Create with `parent`, then `node.reorder {index}`. A replacement is a delete followed by a create. |
| `MOVE_LAYER` | `node.reparent {parent, index}`. |
| `PATCH_LAYER` | `node.set` for plain values; `variable.bind` (and `variable: null` to let a field go); `style.apply`; `component.bindProperty`; `instance.setProperties`; `variable.setMode`; then the layer's stamp. |
| `SWAP_COMPONENT` | `instance.swap`. |
| `RELAYOUT` | `memberBoard`'s cells as `transform.moveTo` per member, then the set's size. |
| `FINISH_COMPONENTS` (restack) | `transform.moveTo` per set and artboard, as `stack.ts` plans. |

Fields, by Toghen's names (the Plugin API's), to FigCraft's:

- **Auto layout:**
  - `layoutMode` → `layout`, `primaryAxisAlignItems` → `mainAlign`, `counterAxisAlignItems` → `crossAlign`;
  - `itemSpacing` → `gap`, `counterAxisSpacing` → `crossGap`, `paddingTop`… → `paddingTop`…;
  - `layoutWrap` → `wrap`, `counterAxisAlignContent` → `contentAlign`;
  - `layoutSizingHorizontal`/`Vertical` → `sizingH`/`sizingV`, `layoutPositioning` → `absolute`.
- **Grids:**
  - `gridRowSizes`/`gridColumnSizes` → `rowTracks`/`columnTracks`, `gridRowGap`/`gridColumnGap` → `rowGap`/`columnGap`;
  - `grid` → `gridRow`, `gridColumn` and their spans; `gridChild…Align` → `gridAlignV`/`gridAlignH`.
- **Shape:**
  - `cornerRadius` and the four corners → `cornerRadius` (a number, or four);
  - `strokeWeight` and the four sides → `strokeWeight`, `strokeTopWeight`…;
  - `clipsContent` → `clip`, `blendMode` → `blend`, `dashPattern` → `dashes`, `layoutGrids` → `grids`.
- **Text:**
  - `textAlignHorizontal` → `textAlign`;
  - `textAutoResize` → `textAutoResize` (`widthAndHeight`, `height`, `none`);
  - `textCase` and `textDecoration` in lower case;
  - the other text fields keep their names.
- **Styles, components, properties and modes:**
  - `textStyle` and `effectStyle` → `style.apply`;
  - `component` → `instance.swap`, or `component.bindProperty {field: mainComponent}` when wired;
  - `set` → `instance.setProperties`, or `variable.bind {field: "componentProperties/<name>"}` for a token;
  - `isExposedInstance` → `component.exposeInstance`;
  - `modes` → `variable.setMode`.
- **Binding:** a bound field's FigCraft name is the `variable.bind` field above, `fills/<i>/color` for a paint and `effects/<i>/<part>` for an effect.

Reading back, the same names come from `node.get`: the auto layout under `layout`, the bindings under `boundVariables`, the styles under `styles`. Two fields have no readback: a wired field's property and a frame's variable modes (question 2).

## 2. Design

**A second snapshot and apply, beside the plans, as the FigCraft target already is.** The command line runs the three component commands for FigCraft in its own process, as it runs the variable and style handlers. The reader, the expansion, the check, the diff and the steps are the same code as for Figma. Four new modules stand in for the Figma-bound part:

- **What FigCraft reports** (`cli/figcraftScene.ts`, pure): a FigCraft node as `node.get` gives it, turned into the plain data `reportedOf` gives for a Figma node, field by field. This is the twin of `figmaView` for styles, and it is tested without FigCraft.
- **Resolution over FigCraft** (`cli/figcraftResolve.ts`): the `Resolved` the run and `expectedOf` need. Variables, styles and modes come from the view the variables run already reads, which is Figma-shaped. Components come from walking the file's pages, by stamp and by name. Then `expectedOf` works for FigCraft unchanged.
- **The snapshot** (`cli/figcraftSnapshot.ts`): walks the pages once, finds the stamped set, its members and their layers. A node's stamp is read from its own data, and `sortOut` tells copies apart. The output is the same plain `Snapshot` the diff takes.
- **The apply** (`cli/figcraftApply.ts`): each step as one batch, one undo step named as the plugin's progress names it, using the table in §1.4. As in Figma, every receipt of a run is taken last, once its writes are done and read back.

**A node's stamp lives on the node.** The stamp ruling put FigCraft's stamps in one record only because variables and styles have no room of their own. Layers do: a component's stamp sits in its own layer data, under the key `toghen`, in the same shape as Figma's. The record on the divider stays for variables and styles. Node ids are never given again (measured), so a node's stamp needs no guard of its own.

**The public members command** (an early unit, generic). `toghen-figma members <entry.json>… <file.component.kdl>… [--input <document>]` prints, as JSON, each file's component, its members and the problems found. It reads through `readComponentFile` with the loaded design system's source. That is what `members.mts` assembles from private paths today. The JSON is the model `reference.md` owns (*Component files*), so nothing new is promised. Any design system driving a target Toghen does not draw for, such as a documentation site or a datasheet, can use it.

**Not in this round:**
- **Libraries.** `--library` stays refused with `--figcraft`. FigCraft's local libraries (`library.add`, `library.place`) are another model, and the lock speaks Figma's keys.
- **A component named by `(key)`.** Refused, by name, with the reason.

## 3. Units

Waves. Within a wave, the units touch different files.

**Wave 1, in parallel**

1. **The members command.**
   - Files: `cli/main.ts` (usage and arguments) and a new `cli/members.ts`. Docs: `reference.md` *Command line*, and `guide.md`.
   - Tests: the sample component files in the W3C structured shapes; a file with an error lists it and no members.
2. **What FigCraft reports.**
   - Files: a new `cli/figcraftScene.ts`, plus `test/support/fakeFigcraft.ts`, which gains nodes (frames, texts, lines, components, sets, instances), their layer data and the measured answers: ids never given again, an instance carrying its main's data, conflicts rather than breakage.
   - Tests: every field of the field table read as `reportedOf` would read it, bound and plain.

**Wave 2**

3. **Resolution over FigCraft.**
   - Files: a new `cli/figcraftResolve.ts`, plus `cli/figcraft.ts`, so its `figma` gains what the variables run already has in shape.
   - Depends on unit 2's fake.
   - Tests: a file naming tokens, styles, modes and a component in the file; an unknown name stops the run before any write, as in Figma.

**Wave 3**

4. **The snapshot.**
   - Files: a new `cli/figcraftSnapshot.ts`.
   - Depends on units 2 and 3.
   - Tests: a stamped set found on any page; an unstamped set of the same name refused; a copy left alone; an instance carrying a member's stamp not taken for the member.

**Wave 4**

5. **The apply.**
   - Files: a new `cli/figcraftApply.ts`.
   - Depends on units 2 to 4. This is the biggest unit.
   - Tests: a set built from the sample file; a second run that plans nothing; a hand edit kept as drift; `--overwrite-drift`; a member added and one removed (breaking, gated); a property renamed; an axis renamed; an instance swapped; the receipts taken last.

**Wave 5**

6. **The commands.**
   - Files: `cli/figcraft.ts` (the three component commands through the bridge), `cli/main.ts` and `cli/run.ts` (`components` and `sync` take `--figcraft`), and the end-of-run restack.
   - Tests: end to end against the fake.
7. **Docs and the live run.**
   - In `specs.md`: *FigCraft*, with "Components in FigCraft" taken out of *Not in this design*.
   - In `reference.md` and `guide.md`, the FigCraft sections.
   - In `decisions.md`, "What the build found", holding §1.1 as the measurement.
   - A live run against FigCraft in a new file: build, second run, hand edit, drift, overwrite, save, reopen, run again.

Checked at the end: `pnpm typecheck`, `pnpm test`, `pnpm build`, and the built plugin free of `[object Object]` and unresolved `toghen(`.

## 4. Risks

- **Two fields FigCraft keeps but does not report** (question 2): a wired field's property and a frame's variable mode. Until FigCraft reports them, a hand change to either is invisible to the snapshot.
- **FigCraft acts on the tab it shows.** The target pins its file and shows it again in every batch. A second program driving the same FigCraft at the same moment is still a hazard for anything sent outside a batch. The new modules send everything through `inFile`, as the variables run does.
- **FigCraft releases weekly.** Command names, `node.get`'s keys and the id rule are measured, not promised. A renamed command is a failed step that names it. A changed key is a field read as drift, written once and stamped again.
- **Properties carry no description in FigCraft.** A file's property description is not written there, and the dry run says so.
- **Size.** The apply is the biggest unit, and Figma's counterpart is long. It stays shorter because FigCraft's commands take many fields at once (`node.set` with every plain field in one call) and need no font loading.

## 5. Questions

1. **Where the FigCraft component engine lives.**
   - (a) A second snapshot and apply in the command line, beside the plans, reusing the reader, the diff, the steps and the file's side of the receipts. This is the route the FigCraft target already took for variables and styles.
   - (b) An interface under the Figma engine (a "scene" with nodes, setters and methods), implemented once for Figma and once for FigCraft, so the 3,100 lines serve both. One engine, but a refactor of the whole Figma side, whose behaviour is measured and must not move.
   - (c) A `figma` that also writes, mirroring Figma's synchronous calls. Already rejected for variables (decisions, *A FigCraft target*): `createFrame` answers an id at once and FigCraft answers later, so the ids recorded would be the mirror's.

   Recommended: (a).
2. **The two fields FigCraft keeps but does not report**: a wired field's property, and a frame's variable modes.
   - (a) Ask FigCraft upstream to report them in `node.get`, as it did for layer data (asked and shipped within a day, in 0.8.0). Until then, trust the receipt: a field Toghen wrote reads as it wrote it, and only a hand change to it goes unseen.
   - (b) Trust the receipt for good, and say in the specs that a hand change to these two is not seen in FigCraft.
   - (c) Leave these fields out in FigCraft. A component then loses its wiring and a member its pinned modes, which every tone and size axis needs.

   Recommended: (a). Posting the request is an outward action, for Egildo to approve and post.
3. **The members command's form.**
   - (a) A command, `toghen-figma members`, printing JSON. The command line is already Toghen's public surface, and the JSON is the model the reference owns.
   - (b) A package entry point exporting the reader and the loader as functions. That is closer to what the consumer does now, but it is a JavaScript API to keep stable, and the package has none today.
   - (c) Both.

   Recommended: (a).
4. **What the first round covers.**
   - (a) Component sets and artboards, and the end-of-run restack.
   - (b) Component sets only, with artboards next.
   - (c) Also FigCraft's local libraries, so one file's components can be used by another.

   Recommended: (a). Artboards use the same snapshot and apply. Libraries are another model and want their own measurement.

## Answers (22 October 2026)

1. **(a), a second snapshot and apply in the command line**, beside the plans, reusing the reader, the diff, the steps and the file's side of the receipts.
2. **(a), ask FigCraft upstream** to report a wired field's property and a frame's variable modes in `node.get`, and trust the receipt until it does. The request is drafted in `.reference/figcraft/request-node-get.md`, at the repository's root; Egildo posts it.
3. **(a), a command**, `toghen-figma members`, printing JSON.
4. **(a), component sets and artboards, and the end-of-run restack.** Libraries and components named by key stay out.

## What the build found (23 October 2026)

Recorded in decisions.md, *What the build found: components in FigCraft*. In short, against this plan:

- **Units 3 and 4 were not written as modules of their own.** A view of FigCraft's layers as Figma nodes (`cli/figcraftScene.ts`, unit 2) let resolution and the snapshot run as Figma's code. The apply (unit 5) is `cli/figcraftApply.ts`, behind a writer seam in the run.
- **The units landed in fewer commits than waves.** The read view, the apply, the fake and the commands are tested only together end to end, so they went in as one commit, followed by the fixes the live run found. They were built by the planner itself, one after another, in the branch's worktree, not by one implementer per unit.
- **Live, `node.get` lists one level of children whatever depth is asked**, combining renames a member with no axes, and a paint needs a real colour before its variable is bound. Each is fixed, and the fake answers the same way.
- **The field table is not all built.** What a run would need beyond it is refused by name before any write.
