# Figma Plugin API — measured behaviour

> **This file is not documentation.** Everything here was measured by executing code against a real Figma file, because the docs either do not state it or state it ambiguously. Where a measurement contradicts the vendored docs, the measurement wins, but re-run the probe before trusting it after a Figma release.
>
> | | |
> |---|---|
> | **First measured** | 2026-08-03, sections 1 to 6 |
> | **File** | `Toghen-Test`, empty design file; later sections in `TEST_GROUIND`, as each says |
> | **Plan tier** | **pro** |
> | **Document colour profile** | `SRGB` |
> | **Typings** | `@figma/plugin-typings@1.123.0` at first; 1.139.0 from section 7 on |
> | **How** | `use_figma` scripts, and from section 11 the plugin in the desktop app; artifacts removed afterwards unless a section says they stay |
>
> This file is the specification the test mock is built against. If the mock and
> this file disagree, the mock is wrong.

---

## 1. Colour channels are sRGB, gamma-encoded

`figma.util.rgb()` maps a CSS hex string onto Figma's channels, which makes it a
direct read of what those numbers mean:

| Input | Figma channels | Interpretation |
|---|---|---|
| `#808080` | `{r: 0.5019607843137255, …}` | **sRGB** (gamma-encoded). Linear-light would be `0.21586050011389923`. |
| `#0066cc` | `{r: 0, g: 0.4, b: 0.8}` | Maps 1:1 onto a DTCG `{colorSpace:'srgb', components:[0,0.4,0.8]}` token. |

So a token colour is written to Figma **unconverted**. This is what
`figmaTokenAdapter.toFigmaRgba()` does; applying the sRGB→linear transfer curve
on top, as it used to, shipped `#808080` as `#373737`.

**Caveat, unmeasured.** The docs say channels are in *the document's* colour profile: *"All colors are specified in the same color space which will be the color profile of the document, `documentColorProfile`."* This file reports `SRGB`. A **Display P3** document would read the same numbers as P3 coordinates, so a token would land more saturated. The plugin does not handle this; see the note on `toFigmaRgba()`.

**Storage is float32.** `0.4` reads back as `0.4000000059604645` and a
`PERCENT` line height of `160` as `160.0000023841858`. **Assert with a
tolerance, never with equality.**

---

## 2. A new collection arrives with one mode

```js
const col = figma.variables.createVariableCollection('x');
// col.modes        → [{ modeId: '2:0', name: 'Mode 1' }]
// col.defaultModeId → '2:0'  (=== modes[0].modeId)
```

Never empty, and never more than one. So creating an *n*-mode collection means **rename mode 0, then add the remaining n−1**: adding all *n* would leave a stray `Mode 1` behind.

---

## 3. The mode cap is 10 on a pro file — and the error string is exact

```
in addMode: Limited to 10 modes only
```

Reached after 9 successful `addMode` calls on top of the built-in mode. The cap is **plan-dependent and not documented anywhere**: the plugin docs are silent and the help centre defers, so it can only ever be learned from this failure. (Documented since: see §16.)

Two consequences:

- 10 is far more headroom than assumed; a document needs 4 modifiers of ~2
  contexts each before it becomes a real constraint.
- The message is stable enough to parse a number out of, but the parse must fail
  soft: a different tier or a wording change must degrade to "cap unknown", not
  to a wrong cap.

---

## 4. The default mode is always `modes[0]`, and cannot be assigned

| Attempt | Result |
|---|---|
| `col.defaultModeId = someModeId` | **throws** `no setter for property` |
| `col.setModeOrder` | `undefined`: no such method |
| `col.modes = [...]` (reorder) | **throws** `no setter for property` |
| `col.renameMode(modeId, name)` | works |
| `col.removeMode(col.defaultModeId)` | **works**, and the *next* mode becomes the default |

That last row is the surprising one, and it is the only lever that exists: **removing `modes[0]` promotes `modes[1]` to default.** Verified: after removing the default, `defaultModeId` moved from `2:0` to `2:1`, and `defaultModeId` still equalled `modes[0].modeId`.

So the invariant is: **the default mode is `modes[0]`, always.** Mode order is insertion order, permanently.

The practical rule for the plugin: **the only non-destructive chance to get the default mode right is at collection-creation time**, by creating the document's default permutation first. For a collection that already exists with the wrong default, the only fix destroys a mode and everything in it, so the plugin warns in that case and does not act.

---

## 5. Text style units

| Assignment | Result |
|---|---|
| `lineHeight = { unit: 'PERCENT', value: 160 }` | accepted → reads back `160.0000023841858` |
| `lineHeight = { unit: 'PIXELS', value: 24 }` | accepted |
| `lineHeight = { unit: 'AUTO' }` | accepted |
| `lineHeight = 1.6` (bare number) | **throws** `Property "lineHeight" failed validation: Expected object, received number` |
| `letterSpacing = { unit: 'PERCENT', value: 2 }` | accepted |
| `letterSpacing = { unit: 'PIXELS', value: 0.5 }` | accepted |

Two things this settles:

- **PERCENT is available for both**, so converting a unitless `lineHeight`
  multiplier and an `em`/`%` `letterSpacing` to PERCENT is correct.
- A new text style's `letterSpacing` **defaults to `{unit:'PERCENT', value:0}`**: Figma's own default is PERCENT, not PIXELS.

A bare number is rejected outright, so any code path that could produce one is
a guaranteed runtime failure rather than a silently wrong value.

---

## 6. Gradient paints

A `GRADIENT_LINEAR` paint handed to `node.fills` reads back with:

- `gradientStops[].color` carrying **`a`**: the stop colour is RGB**A**, not RGB
- `gradientTransform` preserved as given (`[[1,0,0],[0,1,0]]`)
- stop `position` preserved

So `normalizeGradient()`'s `{r,g,b,a}` stops are the right shape to pass
straight through.

---

## 7. Component sets, slots and layout

> **Different provenance from the sections above.** These were not measured by this file's probe. They were met by a design system that built its component sets and documentation pages through hand-written Plugin API scripts, one round per trap, and are written up here without naming it. None has been re-run against `Toghen-Test`. Treat each as measured once, and re-measure it before a generator depends on it.

### Calls and transactions

- **A failed script rolls back entirely.** Never run two scripts at once against the same file.
- **Page context resets on every call.** Use `await figma.setCurrentPageAsync(page)`, at most once per script.

### Component sets and properties

- **A slot's name is a property name.** A `BOOLEAN` or `VARIANT` property with the same name as a slot is renamed silently (`Nav` becomes `Nav2`).
- **A variant and a text property with the same name** make a component set unpublishable, silently: the rest of the library publishes and that set is missing. Check every set's `getPublishStatusAsync()` after a publish.
- **Slots are shared across variants by name.** A slot created in each variant with the same name becomes one property of the set.
- **Slots clip by default.** Anything drawn outside a slot's box disappears unless `clipsContent = false`.
- **Removing a slot's default children from an instance works.**
- **A library slot of fixed height cannot be resized in an instance**, but it can be set to HUG.
- **Renaming variants one by one** breaks `variantProperties` partway through the loop. Name members (the components of a set) `Axis=value, …` when they are created.
- **A variant cloned into another set loses its component-property references.** Rebind `componentPropertyReferences` after moving it.
- **A component set can hold sparse combinations.** Figma warns when a missing one is picked.
- **Boolean properties only bind `visible`.** Anything that changes structure or a value has to be a `VARIANT`, even when it reads as yes/no; its values are then the strings `"true"` and `"false"`.

### Layout and sizing

- **An empty auto-layout frame is 100 px tall** until resized. An empty hugging slot with a `minHeight` stays 100 too: resize it to the minimum, then set it back to HUG.
- **`resize()` resets hug sizing.** Call it first, then set the axis back to HUG.
- **`layoutSizing*` = FILL or HUG throws on an orphan.** Append the node to its auto-layout parent first.
- **Proportions are a GRID frame's FLEX tracks.** A golden split is two tracks of 1 and 1.618. A slot may not be a grid, but it may sit in one. A FLEX track is invalid on an axis where the grid HUGs.
- **Per-side stroke weights** take `strokeAlign = 'INSIDE'` and the individual weights. Set `strokeWeight` before the per-side weights.
- **Shadow spread needs `clipsContent` and a fill.** A 1% white fill stands in for transparent.

### Variables, styles and text

- **`setBoundVariableForPaint` returns a new paint.** Capture it and reassign the fills.
- **A text link to a frame** is `text.hyperlink = { type: 'NODE', value: id }`, and it works inside instances.
- **Pattern fills cannot be set** from the Plugin API. A tiled image fill stands in. (Settable since Update 123: see §16.)

### Libraries

- **Publishing a library, and accepting its update in a consuming file, are human steps.** The Plugin API can do neither. Until both are done, `importComponentByKeyAsync` finds only the previously published version of a component, or nothing.

---

## 8. Component sets built from files, through `use_figma`

> **Provenance.** Measured on 2026-09-29 in `Toghen-Test`, by running the components engine through the `use_figma` tool (the Figma MCP tool that runs a Plugin API script in a file) against the variables and text styles Toghen's own variable sync had written there (collection `demo`, two modes). Two synthetic components: a layout with four slots, two booleans, a grid and a moved region, built, patched, extended by one variant value and reduced again; and a tag with a text property, an instance swap and a mode pin.

### `use_figma` itself

- **Code is limited to 50,000 characters** (the tool's `code` parameter, `maxLength`). A script over it is refused before it runs.
- **What a script returns is truncated at about 20 kB.** Anything after the cut is lost, so a large report must be summarised.
- **`figma.loadAllPagesAsync()` is not supported**, by the tool's own instructions. Loading every page with `page.loadAsync()` is enough **inside `use_figma`**: afterwards `figma.root.findAllWithCriteria(...)` works, `sharedPluginData` criteria included. The plugin, under `documentAccess: dynamic-page` (the manifest setting that makes a plugin load pages one at a time), may not (§11): search each page instead, which both allow.
- **`new Function(source)` works.** An engine stored in the document's shared plugin data (33,851 characters in one entry) can be evaluated by a later script, so a later call need not carry it.
- **`fetch`, `DecompressionStream` and `TextDecoder` are not defined; `Object.hasOwn` is.** Measured on 2026-10-04 in `TEST_GROUIND` with `typeof`. A script cannot download anything, and cannot decompress with a built-in. One that uses `Object.hasOwn` needs no fallback there.
- **A script of 47,256 characters runs.** Measured on 2026-10-04 in the same file: a component script in the kdlet format, with kdlet's evaluator bundled in, reconciled a set of seven members in one call.
- **A text sized while it is empty stays 0 wide.** Measured on 2026-10-04 in the same file, with a probe that was removed afterwards: a text given `layoutSizingHorizontal = 'FILL'` and `textAutoResize = 'HEIGHT'` before its `characters` reads 0 wide and 315 high afterwards, in either order of the two, and wraps one letter to a line. With `characters` set first, it reads 420 wide, as wide as its parent, and 15 high, in either order of the other two. So a text's characters are set before its sizing.

### Component sets and properties

- **Same-named properties on the members merge** into one property of the set when `combineAsVariants` combines them: four slots and two booleans on seven members made six set properties, with their descriptions.
- **A slot's property is named after the slot node.** Its key carries the `#id` suffix, as the others' do (`Header#149:44`); a variant axis's key does not (`Columns`).
- **A slot is wired through `componentPropertyReferences.slotContentId`**, a key `@figma/plugin-typings` 1.139.0 does not declare. (Still undeclared in 1.142.0, documented in a guide: see §16.)
- **A slot with no preferred values reports `preferredValues: []`**, not an absent field.
- **The default variant is the member of all first values**, placed top-left.
- **An instance swap's default is the component's node id.**
- **A component appended to an existing set joins it.** Its slots merge into the set's slot properties, and its layers take the set's property keys; no property is duplicated. Deleting a member removes its combination from the axis's options.
- **A layer renamed by hand keeps its shared plugin data.** A layer found by its stamp (Toghen's marker in the layer's shared plugin data) can be renamed back.
- **A paint bound again on an existing node draws the colour it carries, not its variable's.** Measured on 2026-10-04 in `TEST_GROUIND`, by reconciling a set of twelve members: a paint made as `{ type: 'SOLID', color: black }`, bound with `setBoundVariableForPaint` and assigned to `fills` of a member that already existed, read back bound to the variable with `color` still black, and drew black. The same paint on a member built in that run read back with the variable's colour and drew it. Starting the paint from `variable.resolveForConsumer(node).value` (its `r`, `g`, `b`) draws the variable's colour in both cases. `resolveForConsumer` exists in `use_figma`.

### Layout and sizing

- **A new frame clips its content; a component, read as a member of a set, does not.**
- **HUG on a component's root is accepted**, although its parent, the set, is not auto-layout.
- **A grid's tracks can be set by count, then each track's type and value.** A FLEX value of 1.618 reads back as `1.6180000305175781` (float32).
- **A mode pinned on a member with `setExplicitVariableModeForCollection` renders** in that mode.

### A plugin reached from a local process

- **A plugin's UI can open a WebSocket to localhost, and a local process can drive the Plugin API through it.** Measured on 2026-10-04 in `TEST_GROUIND`, in the desktop app, with a throwaway development plugin: its manifest declared `networkAccess: { allowedDomains: ["none"], devAllowedDomains: ["ws://localhost:3055"] }`, its UI relayed between the socket and the main thread, and a Node server sent the requests. A ping read the pages and the local variable collections in 7 ms. Payloads of 10,000, 100,000, 1,000,000 and 10,000,000 characters reached the main thread whole, in 2, 6, 21 and 150 ms. Nothing like `use_figma`'s 50,000-character limit applies.
- **The socket's `Origin` header is `null`.** The server cannot tell the plugin from any other page that opens the port by its origin.
- **When the server goes away the socket closes, the plugin stays open, and a retry reconnects when the server comes back.** The probe's UI retried once a second; a server started again some minutes later was found within the 20 seconds it waited, and the same run repeated with the same results. Not measured: the browser app.
- **`figma.triggerUndo()` is not a rollback a plugin can rely on: it often reverts past the last `figma.commitUndo()`.** (Figma's docs say otherwise; this measurement stands: see §16.) Measured on 2026-10-04 in `TEST_GROUIND`, in the desktop app, through the same throwaway plugin, each trial creating a frame, committing, then doing something and calling `triggerUndo()`.
  - The first trial looked like the answer. After the commit, across two `await`s, the committed frame was renamed and its shared plugin data changed, a rectangle and a text were appended to it, two components were combined into a set with a text property, and a variable collection with a variable was created. One `triggerUndo()` reverted all of that and left the committed frame, with its old name and data.
  - Every later trial reverted the committed frame too: with nothing after the commit; with only shared plugin data written on the document root; with only shared plugin data written on the page; with only a new frame created; and the last two again with `await`s between the commit, the change and the undo. Each time the frame from before the commit was removed along with whatever came after.
  - Why the first trial stopped at the commit and the others did not was not found. What it means for Toghen: an undo after a failed run could delete a person's work from before the run, so the plugin does not use `triggerUndo()` to roll a run back.
- **A published plugin may declare localhost, with a reason.** Documented, not measured: [the manifest reference](https://developers.figma.com/docs/plugins/manifest/), under `networkAccess`, lists `http://localhost:3000` among its `allowedDomains` examples, and makes `reasoning` required when `allowedDomains` includes local or development servers. `devAllowedDomains` holds only during development.

### Independent axes: one collection each, aliases across them

- **Each collection takes its mode from the nearest frame that sets it, independently of the others, and an alias chain (variables each pointing at the next) across collections resolves in the consuming node's full context.** Measured on 2026-10-04 in `TEST_GROUIND` on a throwaway page, removed afterwards with its collections. Three collections: `Scheme` (`light`, `dark`) holding two colours; `Palette`, with one mode, whose `primary` aliases `Scheme/blue-600`; `Tone` (`neutral`, `primary`) whose `t-solid` aliases `Scheme/neutral-800` in `neutral` and `Palette/primary` in `primary`. A rectangle bound to `t-solid` in each of five frames read back, through `resolveForConsumer` and in the paint it carried:
  - no mode set: the light grey;
  - a frame pinned to `Scheme=dark`: the dark grey;
  - inside it, a frame setting only `Tone=primary`: the dark blue, so `Scheme` was inherited from the outer frame while `Tone` came from the inner one;
  - inside it, a frame setting `Tone=primary` and `Scheme=light`: the light blue;
  - nested in the `Tone=primary` frame, one setting `Tone=neutral`: the dark grey.

  This is how CSS custom properties behave under attribute-scoped blocks: each axis set on a subtree, the nearest ancestor winning per axis, a reference resolved where it is used.

---

## 9. Rich text in a text node

> **Provenance.** Measured on 2026-09-30 and 2026-10-01 in `TEST_GROUIND`, a design file with only synthetic tokens and two text styles, through `use_figma`. Every node and style a probe made was removed afterwards. Four scripts; the second overlapped its nodes (a `resize()` after `textAutoResize` reset the auto-height, so every height read 20), so only its non-geometric readings were kept and its layout ones were redone in the third.

### Marks on a range

- **Bold and italic are font styles of the family, not flags.** Inter lists `Regular`, `Italic`, `Medium`, `Medium Italic`, `Semi Bold`, `Bold`, `Bold Italic` and more, spelled with a space (`Semi Bold`). A range takes one with `setRangeFontName`, after the font is loaded.
- **A hyperlink is a per-range value**, `{ type: 'URL', value }`, set with `setRangeHyperlink`. **It adds no visual.** The range reads `textDecoration: NONE` and keeps the node's fill; nothing is underlined or recoloured until the plugin does it.
- **`setRangeTextDecoration` takes `UNDERLINE` and `STRIKETHROUGH`**, and both render.
- **A fill bound to a colour variable works on a range**: `setBoundVariableForPaint` on a paint, then `setRangeFills`. It reads back bound to the variable and renders.

### Ranges and text styles

- **A node with a text style keeps the style on ranges, except where the font or the style is replaced.** After `setRangeHyperlink`, `setRangeTextDecoration` and `setRangeFills` on ranges of a styled node, every segment still read the node's `textStyleId`.
- **`setRangeFontName` clears `textStyleId` on its range.** The range then ignores the style: when the style's size went from 14 to 20, the rest of the text followed and the range stayed at 14.
- **`setRangeTextStyleIdAsync` keeps a range linked to a style of its own.** A range styled `Bold` followed that style to 22 when the style's size changed, while the rest followed the node's style to 20.
- **Binding `characters` to a string variable keeps ranges only while the text is unchanged.** Bound to the same text, the ranges read back as before. After the variable's value changed to a longer string, the whole text read as one segment in a single font (`Bold`, the style of the range that was there).

### Breaks and lists

- **`\n` is a paragraph break and `U+2028` is a soft line break, and both survive in `characters`** (codes 10 and 8232). With `paragraphSpacing` 20, two lines read 54 high with `\n` and 34 with `U+2028`.
- **In a list, `\n` starts a new item and `U+2028` stays inside the item.**
- **`TextListOptions` is `{ type: 'ORDERED' | 'UNORDERED' | 'NONE' }`**, set per range with `setRangeListOptions`, and nothing else: there is no start number.
- **`setRangeIndentation` counts from 1.** 1 is the top level; 2 and 3 nest. Ordered items renumber at each level (`1.`, `a.`, `i.`) and the outer list carries on after a nested block (`1.`, `2.`). Unordered levels draw the same dot.
- **Numbering restarts at 1 after a paragraph with `NONE`.** Items a and b, a plain paragraph, then c and d read `1. 2.`, the paragraph, `1. 2.`. Items in one run count on without a break (`1. 2. 3.`).

---

## 10. Collections per modifier, code syntax and pins

Measured on 2026-10-08 in `TEST_GROUIND`, through `use_figma`, with a probe that created two collections, two variables, a component and a frame, and removed all of them in the same script (checked afterwards: no `toghen-probe` collection or node left). The four assumptions the per-modifier variable sync was built on, each of which the mock had marked unmeasured:

- **`--` in a variable name is accepted as written.** `createVariable('probe/alert--scheme', …)` reads back `probe/alert--scheme`. A chain link's name (one variable in the alias chain) needs no other suffix.
- **Code syntax (the per-platform name a variable shows to developers) reads back.** After `setVariableCodeSyntax('WEB', 'var(--probe-alert--scheme)')`, `variable.codeSyntax` is `{ WEB: 'var(--probe-alert--scheme)' }`.
- **An alias into another collection can be made in the same run.** A variable in a `state` collection, its `rest` mode set to `createVariableAlias` of a variable created moments earlier in a `scheme` collection, reads back `{ type: 'VARIABLE_ALIAS', id: <that variable> }`.
- **A component pins one collection's mode and inherits the rest.** A component whose fill is bound to the `state` variable, with `setExplicitVariableModeForCollection(state, hover)`, resolves (`resolveForConsumer`) to the hover colour. Pinned to `rest`, it follows the alias into `scheme`: with `scheme` pinned `dark` it resolves to the dark value, with `light` to the light one. Two explicit modes, one per collection, coexist on the node.

Both of what this section left unmeasured, the plugin's own variable sync end to end and bindings inferred by a component file, ran in §11.

## 11. The first command-line run in a real file

Run on 2026-10-08 in `TEST_GROUIND`, from the repository with `toghen-figma sync <resolver> <component> --page "Page 1"`, paired with the Toghen plugin in the desktop app. The document was synthetic (`e2e`: primitives, a `theme` modifier, a `state` modifier marked `"inherits": false`); the component file named its token group (`component E2EButton tokens="{button}"`, a `TEXT` with `tokens="{button.label}"`) and declared no variant axis.

- **Two defects, both found by the dry run before anything was written.** The plugin may not call `findAllWithCriteria` on the document under `documentAccess: dynamic-page` without `figma.loadAllPagesAsync()`, even after every page's `loadAsync()` (the error reads `in findAllWithCriteria: Cannot call with documentAccess: dynamic-page without calling figma.loadAllPagesAsync() first.`); `use_figma` had allowed it, which is what the mock had copied. Searching each loaded page is allowed in both. Second, a dry run did not count the modes a variable plan would create, so a component's `modes state=…` pin stopped it.
- **The run, after the fixes:** variables 48 operations applied, 2 skipped; one text style; the set built with two members. Read back: a base collection `e2e` (one mode `default`) with the primitives and the tokens that vary only through a reference, as aliases; `theme` (`light`, `dark`) with `surface/accent` and `button/label/color`; `state` (`rest`, `hover`) with `button/backgroundColor`, whose `rest` mode is an alias into `theme` and `hover` an alias into `e2e`. Every variable carries its web code syntax (`var(--button-background-color)`). The members `state=rest` and `state=hover` each pin their `state` mode; their fills, paddings, radius, caption fill and text style are bound to the variables and style the token group names; `transition` was reported as having no field. Resolved per theme: `rest` gives `#1a66e6` in light and `#6ea0ff` in dark, `hover` gives `#0f3c8f` in both, as the document says.
- **A reconcile through the plugin, the same day.** The document then gained `button.borderColor` and `button.borderWidth`, `borderRadius` went from 6 to 8, and `state` gained `pressed` (spelled `:active`); the component file gained an `Icon` layer and `itemSpacing="{space.sm}"`. Dry run, then the real run: variables 9 applied (two variables, one mode, the new values), the set 8 steps, one member created and two updated, nothing deleted. Read back: the set and the two existing members kept their ids (`61:39`, `61:35`, `61:37`) and so did their captions; the new `Icon` layer was created in each, first; the new member `state=pressed` pins `pressed`; every member's strokes are bound to `button/borderColor`, its four stroke weights to `button/borderWidth` (Figma reports a bound `strokeWeight` as the four per-side bindings), its four corner radii to `button/borderRadius`, now 8. Fills resolve to `#1a66e6`, `#0f3c8f` and `#101014`.
- **A breaking change, the same day.** The `pressed` context was removed from the document. The dry run listed one breaking step (`the member "state=pressed" is gone: instances of it lose their variant`); the real run without `--allow-breaking` wrote nothing to the set and exited 1 with that step listed; with `--allow-breaking` it deleted the member and updated the other two, exit 0, the set and the remaining members keeping their ids. Figma keeps the deleted member: `getNodeByIdAsync` on its old id still returns a `COMPONENT`, `removed` false, `parent` null, renamed `E2EButton/pressed`, on no page.
- **Found by the same change: a removed context freezes its collection.** The `state` collection, built by the sum sync (a base collection plus one collection per modifier), still held the mode `pressed`, and the check meant for collections left by the old product sync ("holds a mode the sum does not") read it as one: every run since reported `Collection "state" was built by an earlier sync` and wrote nothing to it. Ruled and fixed the same day (a removed context's mode is a breaking step), then run live: the dry run listed `the mode "pressed" of collection "state" is gone`; the real run without `--allow-breaking` printed `Variable sync will not run: 1 step would lose something in Figma, and nothing was written` and exited 1; with it, the mode was deleted (`state` holds `rest` and `hover`, `button/backgroundColor` both values) and the set was untouched. The member Figma retained from the earlier breaking run still pins the deleted mode's id: Figma does not clear a pin to a removed mode.

## 12. Text per variant, lines, and unwiring

Run on 2026-10-10 in `TEST_GROUIND` through `use_figma`, on two new pages, `Probe — text per variant` and `Probe — lines and unwiring`.

- **A `TEXT` property has one default for the whole set.** Two variants with texts "Ready" and "Draft", both wired to one property: both showed the default. Setting the wired text of one variant changed the default, and both showed it. An instance switched to the other variant kept its text; only an override changed it, and the override survived a variant switch. A text that follows a variant while staying wired cannot exist.
- **A new line starts with a stroke**: one `SOLID` black paint, `strokeWeight` 1, width 100, height 0. `strokes = []` clears it.
- **A line takes `resize(w, 0)`**, and also `resize(w, 1)`, which leaves it 1 high. Refusing a height on a `LINE` is the format's choice, not Figma's.
- **A rotated line in a hugging auto-layout frame.** A line 120 long, stroke 2, at `rotation` 90 made its vertical frame 120 high and about 0 wide (`7e-15`): the frame hugs the line's geometry, and a stroke's weight is not counted.
- **Unwiring by `componentPropertyReferences = {}`** leaves the text's characters as they were and takes it off the property. An instance's override of that property then reaches nothing: the instance read "Fixed" with the property at "Override".

## 13. A nested instance's properties cannot be wired to the host's

Run on 2026-10-21 in `TEST_GROUIND` through `use_figma`, on the first page: a component `Probe Atom` with a `TEXT`, a `BOOLEAN` and an `INSTANCE_SWAP` property each wired to a layer; a component `Probe Host` with three properties of the same kinds and an instance of the atom inside it; an instance of the host.

- **A nested property key is refused on the nested instance.** `nested.componentPropertyReferences = { 'Label#115:0': 'Title#115:3' }` throws `Property "node.componentPropertyReferences.value" failed validation: Unrecognized key(s) in object: 'Label#115:0'`, one key at a time or all three; the read-back stays `{}`. Only `visible`, `characters` and `mainComponent` are keys, as the typings say.
- **A layer inside the nested instance is refused too.** On the text, the frame and the inner instance inside the nested instance (instance sublayers of the host component), setting `componentPropertyReferences` to the host's property throws `Cannot set component property references on instance sublayer`; each keeps its reference to the atom's own property.
- **So a host's property reaches nothing of a nested instance.** With `Title` set on the host instance, the nested instance's text still read the atom's `Label` default; its own `Label` set on the nested instance won, and the host's `Title` set afterwards changed nothing.
- **Exposure works.** `nested.isExposedInstance = true` on the nested instance in the host component makes the host instance's `exposedInstances` list it, with the atom's three property keys, settable there. That surfaces the nested properties on the host's instances; it makes no property of the host's.
- **The UI has no such link either.** A nested instance's property passed through to the host's is an open feature request; exposure is what the UI offers too. So this is Figma's model, not an API gap.

## 14. Property roster probes

Run on 2026-10-21 in `TEST_GROUIND` through `use_figma`, on the first page, for `property_roster.md`: five scripts (the fourth was refused before it measured anything and was run again), each making a collection `Probe roster` with a few FLOAT, STRING and COLOR variables and its `Probe …` nodes to the right of the page's content, and removing all of them in the same script. The last script checked that no node named `Probe ` and no collection named `Probe` was left; none was.

### Which fields bind

- **A field outside the bindable lists is refused by name.** `setBoundVariable` with `strokeAlign`, `x`, `rotation`, `cornerSmoothing`, `dashPattern`, `layoutWrap`, `layoutGrow`, `gridRowCount`, `strokeMiterLimit`, `blendMode`, `maxLines`, `counterAxisAlignContent`, `listSpacing`, `textTruncation`, `textCase`, `leadingTrim` and `textAlignHorizontal` each throws `in setBoundVariable: Unknown field: '<name>'`.
- **The type is checked, the scope is not.** A STRING on `width` throws `in setBoundVariable: variable of resolved type 'STRING' cannot be bound to 'width'`; a FLOAT on `fontFamily`, `... 'FLOAT' cannot be bound to 'fontFamily'`. A FLOAT scoped only `CORNER_RADIUS` binds to `paddingLeft` (reads 6), and a STRING scoped only `FONT_STYLE` binds to `fontFamily`.
- **Bindings are accepted where the value means nothing.** `counterAxisSpacing` binds on a `HORIZONTAL` frame that does not wrap and on a `VERTICAL` one, and reads back 8; `gridRowGap` binds on a `HORIZONTAL` frame; `minWidth` binds on a frame with no auto-layout and no auto-layout parent and reads 8, where assigning it throws `in set_minWidth: Can only set minWidth on auto layout nodes and their children`; a LINE takes a `cornerRadius` binding, read back as `cornerRadius`.
- **Parts.** `cornerRadius` on an INSTANCE reads back on the four corners, on an ELLIPSE as `cornerRadius`. `strokeWeight` on a RECTANGLE reads back on the four sides, on a LINE as `strokeWeight`; a LINE's `width` binds (8 wide, 0 high).

### Typography

- **A bound line height or letter spacing is pixels.** A text at `lineHeight` PERCENT 150, or AUTO, bound to a FLOAT 24 reads `{ unit: 'PIXELS', value: 24 }`; at `letterSpacing` PERCENT 5 or PIXELS 1, bound to 2, reads `{ unit: 'PIXELS', value: 2 }`. Assigning `lineHeight` afterwards removes the binding. The node's `boundVariables.lineHeight` is an array of aliases.
- **Font halves.** `fontStyle` bound to `Bold` makes `fontName` `Inter Bold` and `fontWeight` 700. `fontWeight` bound to 700 makes the style `Bold`; bound to 650 the style stays `Regular` and `fontName.variationSettings.wght` reads 650, as does `fontWeight`. Assigning `fontWeight` throws `node.fontWeight: read-only property on TEXT node`.
- **Paragraph spacing binds on a range.** `setRangeBoundVariable(0, 5, 'paragraphSpacing', v)` is accepted although the docs say paragraph fields are not valid for substrings: the first paragraph reads bound, the second reads 0, and the node's `paragraphSpacing` reads mixed. `setRangeParagraphIndent` likewise sets the first paragraph only.
- **`maxLines`.** Set to 1 while `textTruncation` is `DISABLED`, it reads `null`, with no error. 0 throws `in set_maxLines: Property "maxLines" failed validation: Number must be greater than or equal to 1`. With `ENDING` first, 1 holds and a two-line text reads one line (15) high.
- **Mixed.** With the second paragraph given its own size, font, letter spacing, line height, case, decoration, fill, paragraph spacing, indent, list spacing and wrap style (every range setter accepted), the node reads `figma.mixed` for `fontSize`, `fontName`, `fontWeight`, `letterSpacing`, `lineHeight`, `textCase`, `textDecoration`, `fills`, `paragraphSpacing`, `paragraphIndent`, `listSpacing` and `textWrapStyle`; not for `textAlignHorizontal`, `textAutoResize`, `leadingTrim`, `strokeWeight` or `strokes`.

### Paints, effects and layout grids

- **A paint's opacity does not bind**: `in setBoundVariableForPaint: Property "field" failed validation: Invalid enum value. Expected 'color', received 'opacity'`.
- **A gradient stop binds without the helper.** `setBoundVariableForPaint` on a gradient throws `in setBoundVariableForPaint: can only bind variables to solid paints`. A gradient assigned to `fills` with `gradientStops[1].boundVariables = { color: alias }` reads back bound, its colour the variable's, and `boundVariables.fills` lists the alias.
- **A shadow binds all five fields.** `color`, `radius`, `spread`, `offsetX`, `offsetY` on one drop shadow, on a frame with a fill and clipping, read back on the effect; the colour binding turned its alpha from 0.25 to 1. The node's `boundVariables.effects`, with that shadow and a blur, listed each of the three variables once. A COLOR on `radius` throws `in setBoundVariableForEffect: can only bind float variables to radius`; `spread` on a blur throws `in setBoundVariableForEffect: Property "field" failed validation: Invalid enum value. Expected 'radius', received 'spread'`.
- **Noise.** A noise effect with a `blendMode` key, as the typings declare it, is refused: `in set_effects: Property "effects" failed validation: Unrecognized key(s) in object: 'blendMode' at index 0`. Without it the effect is set; the helper then binds `radius` on it (a noise effect has no radius) and refuses `color` with the same `Expected 'radius'` message.
- **A layout grid's fields depend on its alignment.** Columns at `STRETCH` bind `count`, `gutterSize` and `offset`, and refuse `sectionSize`: `in setBoundVariableForLayoutGrid: Property "field" failed validation: Invalid enum value. Expected 'count' | 'offset' | 'gutterSize', received 'sectionSize'`. At `CENTER` they refuse `offset` (`Expected 'sectionSize' | 'count' | 'gutterSize'`); at `MIN`, `sectionSize` binds. A square grid binds `sectionSize` and refuses `count` (`Expected 'sectionSize'`). Assigned to `layoutGrids`, both read back bound.

### Settable where the typings say it throws

(Written against typings 1.139.0. Vertical wrap is documented and typed since: see §16.)

- **`layoutWrap = 'WRAP'` on a `VERTICAL` frame** is accepted and reads back `WRAP`. On a frame with no layout it throws `in set_layoutWrap: Can only set layoutWrap = WRAP on nodes with layoutMode === HORIZONTAL or VERTICAL`.
- **`counterAxisAlignContent = 'SPACE_BETWEEN'` on a `HORIZONTAL` frame that does not wrap** is accepted and reads back.
- `strokeAlign = 'INSIDE'` on a LINE, `strokeAlign = 'OUTSIDE'` and `dashPattern = [4, 2]` on a frame are accepted as given.

### Not measured in the first pass

Whether a binding that is accepted where it means nothing (a `minWidth` on a plain frame, a `counterAxisSpacing` on a frame that does not wrap, a `cornerRadius` on a line, a radius on a noise effect) survives a save or draws anything; whether the noise binding stays on the node; how a wrapping `VERTICAL` frame lays out; `fontWeight` on a font without a weight axis; `paragraphIndent` bound on a range; texture and glass effects; inner shadows and background blurs (assumed to behave as the drop shadow and layer blur); which picker in Figma's UI offers a variable for a layout grid field; anything in the desktop plugin rather than `use_figma`. The second pass measured all of these except the desktop plugin and the picker.

### Second pass

Run on 2026-10-21 in `TEST_GROUIND` through `use_figma`, on the first page, in a new session: six scripts. The first built the probes for the loose bindings and left them; the second fetched them again by id (a fresh call, the nearest thing to reopening the file) and changed the variables' values; the third built a wrapping vertical frame; the fourth measured fonts, ranges and effects and removed its own probes; the fifth removed the rest. Afterwards no node named `Probe`, no `Probe` collection and no `probe/` variable was left.

- **Loose bindings wait.** In the fresh call, `minWidth` on a frame with no auto-layout, `counterAxisSpacing` on a `HORIZONTAL` frame that does not wrap, `gridRowGap` and `gridColumnGap` on a `HORIZONTAL` frame, and `cornerRadius` on a LINE were each still reported in `boundVariables`. Changing the variables (`minWidth` 8 to 200, the others 8 to 50) changed what the getters read and nothing else: the frame stayed 100 wide, the children of both flows stayed at x 0, 40, 80, and the line's rendered bounds stayed 100 by 4.
- **Two of them take effect when the node gives them meaning.** Made auto-layout, the frame bound to `minWidth` 200 became 200 wide. Made to wrap at 90 wide, the frame bound to `counterAxisSpacing` 50 put its third child at y 90 (40 + 50). Made `GRID`, the third frame kept both gap bindings and read 50, but its children reported anchors −1 and kept their places, in that call and the next, so whether the gaps draw was not seen. **A LINE has no `cornerRadius` property** (`'cornerRadius' in line` is false), so its binding can never draw.
- **A refused noise effect leaves nothing.** After `in set_effects: ... Unrecognized key(s) in object: 'blendMode' at index 0`, the frame's `effects` read `[]`. A noise effect whose `radius` the helper had bound is refused on assignment: `in set_effects: Property "effects" failed validation: Unrecognized key(s) in object: 'radius' at [0].boundVariables`; the node keeps the unbound noise and `boundVariables` `{}`.
- **A wrapping `VERTICAL` frame wraps into columns.** Six 40 by 40 children, `itemSpacing` 10, `counterAxisSpacing` 20 (accepted), `layoutWrap = 'WRAP'` (accepted), fixed height 120 and hugging width: the children read (0, 0), (0, 50), (60, 0), (60, 50), (120, 0), (120, 50), the frame 160 by 120. Two per column, since a third would need 140; columns 20 apart. The screenshot showed three columns of two.
- **`fontWeight` on a family without a weight axis snaps to a style.** Courier Prime, which lists `Regular`, `Bold` and their italics, bound to 300 reads `Regular` with `fontWeight` 400; to 650, 700 and 900, `Bold` with 700. No error, and the binding stays reported. Roboto Mono, which has a weight axis: 300 gives `Light` (`wght` 300), 700 `Bold`, 650 and 900 keep `Regular` with `wght` 650 and 900.
- **`paragraphIndent` binds on a range.** `setRangeBoundVariable(0, 5, 'paragraphIndent', v)` with v at 12, on a text of three paragraphs: the range reads the alias, the first paragraph 12, the second 0, the node's `paragraphIndent` mixed, and `boundVariables.paragraphIndent` one alias.
- **Inner shadow.** All five fields (`color`, `radius`, `spread`, `offsetX`, `offsetY`) bind and read back after assignment; `boundVariables.effects` lists the two variables once each.
- **Background blur.** `radius` binds and reads back. `color`, `spread`, `offsetX` and `offsetY` each throw `in setBoundVariableForEffect: Property "field" failed validation: Invalid enum value. Expected 'radius', received '<field>'`.
- **Texture and glass cannot be bound.** Both are accepted as effects. `color` throws the `Expected 'radius'` error. `radius` returns a copy with `boundVariables.radius`, which is then refused: by the next helper call (`in setBoundVariableForEffect: Property "effectCopy" failed validation: Unrecognized key(s) in object: 'radius' at .boundVariables`, for `spread`, `offsetX` and `offsetY`) and on assignment (`in set_effects: Property "effects" failed validation: Unrecognized key(s) in object: 'radius' at [0].boundVariables`).

Still not measured: whether a grid's bound gaps draw once its children sit in cells; whether a waiting binding survives closing and reopening the file; the desktop plugin; which picker in Figma's UI offers a variable for a layout grid field.

### Third pass

Run on 2026-10-21 in `TEST_GROUIND` through `use_figma`, on the first page, in a new session: three scripts. Afterwards no node named `Probe`, no `Probe` collection and no `probe/` variable was left.

- **Bound grid gaps draw and follow the variable.** A frame made `GRID`, `gridRowCount` and `gridColumnCount` 2, every track `FIXED` 50, four 50 by 50 children placed with `setGridChildPosition` (anchors then read 0 and 1), both axes `HUG`: before binding, the children sat at x 0, 50 and y 0, 50 and the frame was 100 by 100. With `gridRowGap` bound to a variable at 20 and `gridColumnGap` to one at 40: x 0, 90, y 0, 70, the frame 140 by 120. In the next call, with the variables at 5 and 60: x 0, 110, y 0, 55, the frame 160 by 105; the screenshot showed the wide column gap and the thin row gap.
- **The order does not matter.** A `HORIZONTAL` frame with four children, the gaps bound first, then made `GRID` with the same tracks and its children placed, read the same positions and size as the first grid, before and after the change.
- **So the second pass's grid read nothing only because its children had no cells.**
- **A waiting binding is still there two calls later.** A frame with no auto-layout, `minWidth` bound to a variable at 200, left in the file; two calls later (the grid probes in between), found by a fresh `figma.getNodeByIdAsync` of the page, `loadAsync()` and `findOne`, and again by id (the same object): `boundVariables.minWidth` was the alias, `minWidth` read 200, the width 100, `layoutMode` `NONE`.

Still not measured: whether a waiting binding survives closing and reopening the file, which the connector cannot do; the desktop plugin; which picker in Figma's UI offers a variable for a layout grid field.

## 15. Library discovery and import by key

Run on 2026-10-22 in `TEST_GROUIND` through `use_figma`, read-only: two scripts, the second on the page `Stepper`. Nothing was created; the import calls that were refused left nothing, and the file held nine local collections before and after. For the lock of the Figma plan of 22 October 2026 (`.reference/plans/toghen-figma/plan-2026-10-22.md`).

- **`figma.teamLibrary` exists, and lists nothing here.** `getAvailableLibraryVariableCollectionsAsync()` resolved to `[]`: the file has no enabled library that publishes variables. Nothing about a listed collection or variable was measured.
- **`figma.fileKey` reads the file's key** through the connector. The typings say a plugin reads it only with `enablePrivatePluginApi` in its manifest, so the connector is no proof for Toghen's plugin.
- **`figma.root.name` reads `Document`**, not the file's name, through the connector. Whether the desktop plugin reads the file's name there is not measured.
- **Every local object has a key** of 40 hex digits, published or not: the component set `Stepper`, its members, every collection and variable.
- **`getPublishStatusAsync()` answers locally.** The set, two members and a variable each read `UNPUBLISHED`.
- **An unpublished key does not import, even in its own file.** `importComponentSetByKeyAsync` on the set's own key threw `Component set with key "<key>" not found`; `importComponentByKeyAsync` on a member's, `Component with key "<key>" not found`; `importVariableByKeyAsync` on a variable's, `Variable with key "<key>" not found`. A key of forty zeros gave the same messages. So the error cannot tell a key never published from one that never existed; the library's publish status can.

Not measured, since it needs a library published from another file and enabled here, both human steps (§7, *Libraries*): what a listed collection and variable look like, and whether `libraryName` is the library file's name; whether a variable imports by key from a library that is published but not enabled in the file; whether two imports of one key give the same `Variable` and id; whether a key survives a republish, and a component's key a rebuild in place; whether the desktop plugin needs the `teamlibrary` permission in its manifest for `figma.teamLibrary`, as the manifest documentation says.

- **`BigInt` exists in the plugin sandbox.** Measured on 2026-10-22 in `TEST_GROUIND` through `use_figma`: `typeof BigInt` is `function`, and the 64-bit FNV-1a hash the core computes for an overrides map (`toghen-lib/src/resolver/load.ts`) ran there and gave `e71fa2190541574b` for `abc`. A load with a map needs no fallback.

### Second pass (2026-10-22, library published)

Run on 2026-10-22 through `use_figma`, one session per file. In the library file, *Toghen Test Library* (one page `Library`, published by the maintainer), two read-only scripts read every key and publish status; nothing was created there. In `TEST_GROUIND`, nine scripts: a read-only listing; the imports; the probes (a frame, a text and an instance on the first page, all named `Probe library …`); the removal; and reads. The library was **not enabled** in `TEST_GROUIND`: `getAvailableLibraryVariableCollectionsAsync()` resolved to `[]` before and after, so question 1 waits for the maintainer to enable it (Assets panel, Libraries).

- **A published library's variable imports without being enabled (question 2).** `importVariableByKeyAsync` on `color/accent`'s key returned a variable with `remote` true, its key, `resolvedType` `COLOR`, the library's value in mode `1:0`, and the id `VariableID:<key>/1:14`; its collection reads `VariableCollectionId:<collection key>/1:2`, `remote` true, name `lib`, one mode `default`. So did `importComponentByKeyAsync`, `importComponentSetByKeyAsync` and `importStyleByKeyAsync`, all with `remote` true. Enabling is needed for the listing only.
- **A variable or style id is stable; a variable object is not (question 3).** Two imports of one variable key, in one call and across calls, gave the same id, but `===` was false, in the call and against `getVariableByIdAsync(id)`. Two imports of a component key, of a set key and of a style key gave the same id and the same object (`===` true) within a call. Across calls, the variable and style ids stayed the same even after the imports had been dropped and were imported again (below); a component's and a set's node ids did not (`126:6` and `126:12`, then `127:6` and `127:12`).
- **A variant imports by its own key**, as a `COMPONENT` whose parent is the imported `COMPONENT_SET`, although in the library file each variant reads `UNPUBLISHED` while its set reads `CURRENT`.
- **The imported collection's `variableIds` is not the library's collection.** After importing one variable and the component `Icon`, it listed three of the library's six variables (the imported one and two others); in a later call, six. It lists what the file holds of the collection so far.
- **An imported style is a style like a local one (question 5).** `importStyleByKeyAsync` on a text style returned `remote` true and id `S:<key>,1:22`; `getStyleByIdAsync` finds it; `getLocalTextStylesAsync()` does not list it. `setTextStyleIdAsync(style.id)` on a probe text node in the style's font (`Inter Medium`) succeeded, and `textStyleId` read the same id back, `fontSize` the style's 12.
- **An imported variable binds like a local one.** `setBoundVariableForPaint(paint, 'color', variable)` assigned to a probe frame's `fills` read back `boundVariables.color` as the alias to the remote id and the library's colour. An instance of the imported component's `createInstance()` has `getMainComponentAsync()` the remote component.
- **Publish status.** In the library: the collection, its six variables, the component `Icon` and the set `Badge` read `CURRENT`; the two variants `UNPUBLISHED`. **A style has no `getPublishStatusAsync`**, local or imported: `typeof style.getPublishStatusAsync` is `undefined` (`'getPublishStatusAsync' in style` false), so calling it throws `TypeError: not a function`, although the typings give it to every style through `PublishableMixin`. In the consumer, an imported variable throws `in getPublishStatusAsync: can only query publish status for local variables`, an imported collection `in getPublishStatusAsync: can only query publish status for local variable collections`; an imported component, set and variant read `UNPUBLISHED`.
- **Imported objects cannot be removed, and drop out on their own.** `remove()` on an imported variable, collection, style, component or set threw `in remove: Removing this node is not allowed`. Removing the probe frame removed its text and instance. With nothing using them, the imported objects still resolved by id for one to three calls, then `getVariableByIdAsync`, `getVariableCollectionByIdAsync`, `getStyleByIdAsync` and `getNodeByIdAsync` each answered `null`; both rounds of imports went so, and the last read found none of them and no node named `Probe library`. The local lists (9 collections, 95 variables, none remote; 1 paint, 8 text, 3 effect styles) were the same before, during and after.
- **The keys, for the republish comparison (question 4).** Collection `lib` `943a6db95e069dfc861c75628219129ad3e60183`. Variables: `space/sm` `3535e676acde165337e09edb934cc124f262d03d`, `space/md` `f1ad89711eaacff52cf0a6e8337321fcad010151`, `radius/full` `fcc697cae5c6c8cddd8d0cf82dc2b5ab0e4178c9`, `color/accent` `bdd439f47a4d39e15e40a2cf8c0bc1900338ee29`, `color/calm` `488c52b3e041756524612c0c511ee59111b0cafa`, `color/on-accent` `88bf9a95489066ccdde4086a7c0fb041c83bd7ef`. Component `Icon` `5b93eb0fe6c330c4c1bacd9818189f6e46ad0f7f`; set `Badge` `34fa0223efc7a2d23d308ce754fd425e4426fc98`, its variants `Tone=calm` `a1876abf058ab9aab630a8e46280267be5cf7d64` and `Tone=loud` `4c013040235af170c7c694dd0d8f8a3ce9920950`. Styles: text `text/label` `8b56b1f221ffe3e58ba341245e900dd1c88ec5a4` (local id `S:<key>,`), effect `shadow/raised` `241b557954b2dbb10291518bc39161e7801676cd`.

Not measured: what a listed collection and variable look like and whether `libraryName` is the library file's name (question 1), until the library is enabled in `TEST_GROUIND`; whether the keys above survive a republish, and a set's a rebuild in place (question 4), until the maintainer republishes; whether the desktop plugin needs the `teamlibrary` permission and what `figma.root.name` reads there (question 6); whether an imported object is dropped on a timer or when the connector's plugin restarts.

### Third pass (2026-10-22, library enabled)

Run on 2026-10-22 in `TEST_GROUIND` through `use_figma`, after the maintainer enabled *Toghen Test Library* there: two scripts, then reads until the imports had dropped out. Nothing was created on the canvas.

- **A listed collection is a plain object of exactly three fields** (question 1). `getAvailableLibraryVariableCollectionsAsync()` resolved to one entry, `{ name: 'lib', libraryName: 'Toghen Test Library', key: '943a6db95e069dfc861c75628219129ad3e60183' }`: own properties `name`, `libraryName`, `key`, prototype `Object`. **`libraryName` is the library file's name**, as the file browser shows it.
- **A listed variable is a plain object of exactly three fields.** `getVariablesInLibraryCollectionAsync(key)` resolved to six entries of `name`, `resolvedType`, `key` (`FLOAT` or `COLOR`), not in the library's order: `space/md`, `space/sm`, `radius/full`, `color/calm`, `color/accent`, `color/on-accent`. The keys are those of the second pass.
- **An unknown collection key does not reject.** A key of forty zeros, and a variable's key passed as a collection's, each resolved to `[]`.
- **Enabling changes nothing else.** An import of `color/accent` gave the id `VariableID:<key>/1:14` again, `remote` true, the same collection id, and a second import the same id with `===` false. The text style imported as `S:<key>,1:22`, `remote` true. The component `Icon` imported with `remote` true and a new node id (`130:7`), and read `UNPUBLISHED`; the variable's `getPublishStatusAsync` threw `in getPublishStatusAsync: can only query publish status for local variables`. The local lists stayed 9 collections and 95 variables, none remote.
- **With the library enabled, the imports did not drop out** within the three minutes the probe watched: `color/accent`, the text style and `Icon` still resolved by id, while not in the local lists, not on the canvas, and refusing `remove()` as before. In the second pass, with the library not enabled, they had dropped within minutes. Whether they drop later is unmeasured.
- **An unknown collection key:** the real file resolves `getVariablesInLibraryCollectionAsync` to `[]`; the mock throws `Variable collection with key "…" not found`. The lock passes only keys from the listing, so it is unaffected; the mock is wrong and waits for a caller that cares.

Still not measured: question 4 (the republish comparison) and question 6 (the desktop plugin). The `teamlibrary` half of question 6 is documented since: see §16.

## 16. Against Figma's documentation (2026-10-23)

Nothing was run for this section. Figma's documentation was read on 23 October 2026 (`.reference/skills-research/figma-docs-2026-10-23.md`, with each source), and where it now says something the sections above did not, it is noted here; the measurements above stay as they were made.

- **§3, the mode cap.** Figma's plans table now gives the modes per collection: 10 on Professional, 20 on Organization, Enterprise unlimited through extended collections; two readings of the table disagreed about Starter. The REST `POST` caps a collection at 40. The measured cap of 10 on a pro file agrees.
- **§7, pattern fills.** Settable since Update 123 (26 January 2026) through `setFillsAsync` and `setStrokesAsync`; the vendored `api_node_properties.md` already says so. §7 came from another project's scripts, before that update. Toghen writes no pattern fill.
- **§8, `slotContentId`.** Still undeclared in typings 1.142.0, and missing from the `SlotNode` page, but the *Working with component properties* guide documents it as the slot's key. Figma's docs disagree with each other; the measurement holds.
- **§8, undo.** The docs say `figma.triggerUndo()` reverts to the last `figma.commitUndo()`. Measured here, it went past the commit in five trials of six. The measurement stands, and so does the rule that the plugin never undoes.
- **§14, vertical wrap.** `layoutWrap = 'WRAP'` on a `VERTICAL` frame is documented since Update 140 and typed since 1.141.0. The measurement stands; the heading's "where the typings say it throws" was true of 1.139.0.
- **§15, the `teamlibrary` permission.** The manifest documentation says the `figma.teamLibrary` methods throw without it. The manifest declares it. Documented, not measured: whether the desktop plugin fails without it is still unrun.
- **Typings.** The package typechecks against `@figma/plugin-typings` 1.142.0 with no change to the code: `CUSTOM_ANIMATION` joins `StyleType`, and Toghen reads styles by kind.

## Re-running this probe

Four `use_figma` scripts against an empty design file: create a collection and
loop `addMode` until it throws; read `figma.util.rgb('#808080')` and exercise
text-style units; attempt `defaultModeId`/reorder/rename/remove and read back a
gradient paint; then delete the collection, styles and nodes created. The
cleanup script asserts nothing is left behind.

Worth re-running when: Figma ships a release that touches Variables, the plan
tier changes (the cap moves), or a mock expectation starts disagreeing with a
real file.
