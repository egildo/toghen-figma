# Plan: stamps in FigCraft (22 October 2026)

The last step of *Ruled: the stamp, one receipt per object, for every target* (decisions.md, 20 October 2026): "FigCraft, once its release ships". It shipped. FigCraft 0.8.0 (20 October) reads back the layer data a command writes, and 0.9.0 is the version installed here. In FigCraft only layers and pages hold data, not variables or styles. So the ruling put FigCraft's stamps together in one record on a page, keyed by object id, in the same shape as Figma's.

What this round gives back to the FigCraft target: drift (a hand edit is kept and reported, and `--overwrite-drift` works), unchanged values that are no longer written again, and a renamed token that moves its variable instead of making a new one. The guide's "Every run writes everything again" goes.

## 1. Findings

### 1.1 Measured against FigCraft 0.9.0, live, 22 October 2026

Measured over the control socket (port 7979) in a new file. The person's open files were not touched, and the probe file was closed without saving.

- **Page data round-trips.** `node.set {ids: [page], props: {pluginData: {key: value}}}` writes it, and `node.get {id: page, depth: 0}` answers `pluginData: {key: value}`. A value of 411,781 characters came back whole: about 3,000 stamps, so size is not a limit.
- **An empty string does not delete a key.** The key stays with `""`. A record that is gone is therefore written as `""` and read as absent.
- **A divider page holds data.** `page.add {name: "-toghen"}` makes a divider, which is an empty page shown as a line in the pages list, never opened, with no layers. It takes and returns data like any page.
- **A copied page does not carry the data.** `page.duplicate` of the divider made "Copy of -toghen", an ordinary page with no `pluginData`. So the copy problem Figma has (*Ruled: a copy carries the stamp*) does not arise here.
- **Undo reverts page data.** A `node.set` of the data is an undo step like any other.
- **Ids hold across save and reopen.** Variables (`VariableID:n`), styles (`S:n`) and pages (`n`) kept their ids after a save, a close and an open.
- **Ids are reused.** FigCraft gives a new object the highest id in use plus one. Deleting a variable in the middle frees nothing. Deleting the newest one and then making another gives the new one the old id (`VariableID:1` deleted, the next variable was `VariableID:1`; the same for `S:1`). A record keyed by id can therefore name an object it was never written on. That is the defect the ruling removed in Figma, coming back through FigCraft's exception, and it needs a guard (question 3).
- **What `style.list` holds.** It now gives each style's value in FigCraft's spelling. For example: `{case, decoration, font_family, font_size, font_style, letter_spacing: {unit: "percent", value}, line_height: {unit: "auto"}}`. A style's receipt hashes Figma's shapes (`reportOf`), so the listing must be read back into those shapes (unit 3).
- **The installed `figcraft-cli` is 0.7.0, behind the app.** Nothing here uses it. The target speaks to the app's socket.

### 1.2 Where the stamps are lost today

- **The plans read stamps through `getStamp(object)`**, in `figmaCollectionIndex.ts` and `tokenStamps.ts`. The FigCraft view's objects (`figmaView`) are plain objects with no `getSharedPluginData`. `getStamp` catches the error and answers `undefined`, so every object reads as unstamped.
- **Stamps are written inside Figma's branch of `executeOperation`**, after each write and read back from the object (`operationExecutor.ts`, about 320–420). The FigCraft target replaces that whole branch with its writer (`writeOperationsWith`), so stamping never happens there.
- **`STAMP` is refused by `translate`** ("FigCraft keeps no stamps yet"). The variable and style plans make one when a stamped object moved.
- **The fake figma's `root` data** (`figmaFor`) is an in-memory map that dies with the run. Nothing reads it now that the root record is gone.

## 2. Design

**A record on a page, read once, written once.** At the start of a run the target reads the record from the record page. It hands each variable and style in the view the shared-data methods `getStamp` and `setStamp` already call, backed by the record in memory. So the plans read stamps exactly as they do in Figma, with no change to them. At the end of the run, and when a run fails partway, the target writes the record back in one batch: one undo step, "Toghen stamps".

**The writer writes, the executor stamps.** Today the stamping for each operation sits inside Figma's branch. It moves to a step after the write, shared by both targets. That step reads the object back through `figma` (Figma's real API, or the FigCraft view refreshed after the batch) and calls the same `stampWritten` / `setStamp`. Figma's behaviour does not change: the same reads in the same order, after the same writes. FigCraft gets the stamping for free, and there is still one place that says which fields an operation stamps.

**The record page.** A divider named `-toghen` (answer 1, first c, then a). It is found by the `toghen` key in its data, never by its name, so a page renamed by hand still holds the record. With no page holding the key, the first run that writes makes the page; a dry run makes nothing and reads every object as unstamped.

**The record's shape.** One key, `toghen`, on the record page, holding `{"stamps": {"<object id>": Stamp}}`. `Stamp` is the shape `stamp.ts` already defines, so `reference.md`'s *The stamp* gains a paragraph rather than a second format. The entry's `id` is always its own key, since a copy never carries the record.

**The guard against reused ids** (question 3). Each entry also notes what kind of object it was written on: a variable's resolved type and collection, or a style's type. On reading, an entry whose object is gone, or whose object is now of another kind or collection, is dropped. When Toghen itself deletes a variable or a style, its entry is dropped at once.

**Styles read back.** `figmaView` turns `style.list`'s value into the fields `reportOf` and `holds` read: a text style's font, size, line height, letter spacing, case, decoration and bound variables, an effect style's shadows, and a paint style's gradients. These are the inverses of `textValue`, `effectsValue` and `paintsValue`, and the gradient transform is rebuilt from the ramp's ends.

**What a first run does.** No FigCraft file has a record yet. Every variable and style is unstamped, is adopted by name as in Figma, and is written and stamped. From the second run on, the stamps are real. No migration is needed.

## 3. Units

Mostly in sequence, since each rests on the one before. This is a small round: one implementer, in order.

1. **The executor split** (`main/engines/operationExecutor.ts`). Move stamping out of Figma's branch into a step after any writer. Done when every existing test passes unchanged, Figma's mock included.
2. **The FigCraft record, variables** (a new `cli/figcraftRecord.ts`, which is pure, plus `cli/figcraft.ts`, `cli/figcraftFile.ts` and `test/support/fakeFigcraft.ts`).
   - Read, guard, attach and write the record. `STAMP` becomes a record write. `DELETE_VARIABLE` drops its entry. The fake gains pages and page data with the measured behaviours.
   - Tests:
     - a second run plans nothing;
     - a value changed by hand in FigCraft is drift, kept and reported, and `--overwrite-drift` writes over it;
     - a renamed token moves its variable;
     - a reused id with another type is dropped;
     - a deleted record page means the next run adopts by name;
     - a failed run still writes the stamps of what it wrote.
3. **Styles** (`cli/figcraftFile.ts`). Read the style values back in Figma's shapes, then stamp styles. Tests in the W3C structured shapes (CLAUDE.md's standing lesson): a typography with a `{value, unit}` size and a `fontFamily` array, a shadow, and a gradient. Each must read back equal to what was written, with no drift on a second run.
4. **Docs.**
   - In specs.md *FigCraft*, replace "No stamps" with the record and its id guard.
   - In decisions.md, add a "What the build found" entry, with §1.1 moved there as the measurement.
   - In reference.md *The stamp*, document the record page and key.
   - In guide.md *Syncing into FigCraft*, take out "Every run writes everything again" and add one line on the "Toghen" page.

Checked at the end: `pnpm typecheck`, `pnpm test`, `pnpm build`, and a real run against FigCraft 0.9.0 in a new file. That run is a sync, a hand edit, a second sync that reports the drift, and a save, reopen and third sync that plans nothing.

## 4. Risks

- **Undo inside FigCraft.** A person who undoes one of the run's writes leaves a receipt for a value no longer there. That reads as drift, kept and reported, which is the honest answer. A person who undoes only the "Toghen stamps" step loses that run's stamps, and the next run adopts by name. Neither loses data.
- **A run killed midway**, with FigCraft closed or the socket gone, writes no record. The next run adopts by name and writes again, as every run does today.
- **FigCraft is young and releases weekly.** The id rule (highest plus one) and the divider page are measured, not documented. If the id rule changes to never reuse, the guard costs nothing. The record page is found by its data, so where it sits does not matter.

## 5. Questions

1. **Where the record lives.**
   - (a) A divider page named `-toghen`: a line in the pages list, holding no layers.
   - (b) The data of the file's first page: nothing new to see, but a person who deletes that page loses the record without seeing why.
   - (c) A visible page named "Toghen".

   Recommended: (a).
2. **When the record is written.**
   - (a) Once at the end of a run, and when a run fails partway: one more undo step.
   - (b) After every operation: as many extra undo steps as operations, and the whole record (up to a few hundred kilobytes) sent each time.

   Recommended: (a).
3. **The guard against reused ids.**
   - (a) Note each entry's kind and collection, drop an entry whose object no longer matches, and drop Toghen's own deletes at once.
   - (b) As (a), and also note the name: this catches more, but a variable renamed by hand would then look like a stranger and lose its drift report.
   - (c) No guard: let the drift report catch a stranger.

   Recommended: (a).
4. **Styles in this round.**
   - (a) Yes, as unit 3.
   - (b) Variables only now, styles later.

   Recommended: (a). Drift on styles was the gap the stamp ruling closed in Figma, and leaving FigCraft's styles without it keeps "every run writes everything" for half the target.
5. **The executor split.**
   - (a) Stamping moves out of Figma's branch, shared by both targets.
   - (b) The FigCraft writer repeats, per operation, which fields it stamps, and Figma's code is not touched.

   Recommended: (a). One place says what each operation stamps; (b) is two copies that drift apart.

## Answers (22 October 2026)

1. **(c), a visible page named "Toghen", for starters.** Egildo's reason: so he can see it. The page is found by its data, not its name, so it can become a divider later with no change to how it is read. **Changed to (a) the same day, after the build:** the visible page showed nothing, since FigCraft shows a page's data nowhere. The record now lives on a divider, `-toghen`.
2. **(a).** The record is written once at the end of a run, and when a run fails partway.
3. **(a).** Each entry notes its object's kind and collection; an entry that no longer matches is dropped, and Toghen's own deletes drop theirs at once.
4. **(a).** Styles in this round, as unit 3.
5. **(a).** Stamping moves out of Figma's branch, shared by both targets.
