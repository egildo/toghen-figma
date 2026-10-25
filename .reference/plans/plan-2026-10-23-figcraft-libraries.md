# Plan: libraries in FigCraft (23 October 2026)

In Figma, a design system's components live in a library file, and the files that use it import them by key through the lock. In FigCraft today `--library` is refused beside `--figcraft` and `--figcraft-file`, and a component named by key is refused before any write. Egildo asked for libraries in FigCraft to work. FigCraft 0.10.0 has local libraries: a `.figcraft` file is published, and another file enables it by path. This round builds Toghen's library model on them, live and headless, keeping the lock, the relink, the two-file run, the dry run and drift where they fit, and saying where FigCraft differs.

## 1. Findings

### 1.1 Measured against FigCraft 0.10.0, 23 October 2026

Headless with `figcraft-cli mcp` (confined to the scratch folder with `--automation-write-root`), and live in the app on its control port. Live, I opened two files of my own in new tabs, sent every command to them in a batch that started with `doc.switch` to the file's index (found by path with `doc.list`) and named the window, and closed them with `force` afterwards. The tab that was active before was shown again. Nothing reached a server: `library.publishToServer` and `collab.*` were never called.

**Publishing.**
- `library.publish` reaches no server. The process had no socket open after it, headless or live, apart from the control port.
- It returns the library's id (sixteen hex digits), its version and counts. The id is made at the first publish and kept in the file. The file is a zip, and on save it gains `library/manifest.json` (id, name, version, description, and each asset with its id, name and version) and `library/document.json` (a copy of what was published).
- **The library reaches other files only once its file is saved.** A publish that was not saved was invisible to the using file (`library.updates` empty), and visible once saved. This is as the docs say.
- **A publish with no change is not refused**, against the docs. It makes a new version; the using file sees the new version, but `library.updates` lists nothing, because each asset keeps the version it last changed in.
- **The library's name is the document's name at its last publish**: `Untitled` for a file published before it was ever saved, its file name afterwards. The id is what names a library reliably.
- `library.publish` and `file.save` run inside one pinned batch, live. The tab then reads as unsaved, because the batch's own undo step comes after the save.

**Enabling, by path.**
- `library.add {path}` enables a library and lists its assets. The library's file need not be open.
- Enabling the same path twice changes nothing. Enabling is undoable, and it marks the file unsaved.
- A file never published is refused with a clear message: it has no published library.
- The enabled library is kept in the using file: a saved file reopened in another session still lists it.

**What names an asset, in both files.**
- In the library's listing, a component or set is its node id in the library file, a variable its `VariableID:n`, a collection its `VariableCollectionId:n` and a style its `S:n`, each with its name. A variant is not an asset of its own: `library.import` by a variant's name is refused (*publishes no component*).
- In the using file, what was imported is a read-only copy:
  - A component's copy gets a local node id and belongs to no page. `component.list` marks it with the library's id, and `node.get` reads it.
  - A variable's, a collection's and a style's copy keeps the library's id behind the library id: `<library id>:VariableID:1`, `<library id>:S:1`.
  - **A copied collection's mode ids carry no prefix**, and equal a local collection's (measured with both present). `variable.setMode` with the copied collection's id and a mode's name, or its bare mode id, sets the right one.
- `node.get` on an instance gives its main as the copy's local id and name, nothing about a library. `library.updates` is the one read that pairs a copy with the library's id for it (`id` and `key`), and only for what has an update.
- **Importing is idempotent.** `library.import` of one component three times (by name, by the library's id for it, through the library's path) gave the same copy. So did `library.importVariable` twice, and an import of a component already copied in an earlier session.
- **No command imports a style without applying it.** `library.applyStyle` needs layers. Once a copy exists, `style.apply` with its prefixed id applies it.
- **A library's style copies are listed by `style.list` beside the file's own**, as variables are by `variable.list`.

**After a change in the library: `library.updates`, then `library.acceptUpdates`.** The library had a set with three variants, a component and a variable bound in a variant. The using file had an instance of each variant, an instance of the component and a frame bound to the variable. One instance had a text override, every instance had Toghen-style layer data, and a person's name override was on one. Then:
- **A value changed:** the update was listed. Once accepted, the bound frame and the bound instance show the new value. The bindings and the copy's id are unchanged.
- **A variant's value renamed** (`Tone=loud` to `Tone=bold`): its instance follows. Same main id, and the new name shows.
- **A variant added:** a new copy, with no instance.
- **A variant removed:** its instance keeps its look, and its main reads as missing (no name).
- **A component renamed:** its instance follows, and so does the instance's own name, unless it was overridden.
- **A variant or a component deleted and made again under the same name** is another asset, with a new id. Variants are matched by id, not name: the instance of the removed variant read as missing. The remade component was not listed as an update at all. The using file keeps its old copy, and an import by name now brings in the new one beside it.
- **A variable deleted in the library:** nothing listed. The using file keeps its copy, still bound, with the last value. A new variable took the next id, not the deleted one, since the deleted one was not the newest.
- **Overrides survive** (the text override, the name override). **Layer data survives** on every instance. **Bindings survive.**

**The library's layer data travels.** The library's set, member and layer data (Toghen's stamps there) come along on the copies, and onto every instance made in the using file, children included. This is the main's data that an instance already carries in FigCraft, now the library main's.

**Relinking a person's instance.** `instance.swap` from a local component to a library copy kept the instance's layer data and its name override.

**Two files at once.**
- **Live:** with the library and the using file open in two tabs of one window, pinned batches sent to each in turn, three rounds, each landed in its own file. Publish and save in the library, then updates and accept in the using file, worked across the two tabs.
- **Headless, one session:** `file.new` or `open_file` gives a second document. `doc.switch` between the two works as in the app. Publishing and saving in one, then enabling, importing and accepting in the other, all ran in one session.
- **Headless, two sessions:** a session holding the using file saw what a second session published and saved, at its next `library.list`.

**When the library's file moves.**
- The using file keeps the library by id. `library.list` and `library.updates` report the missing path as an error on that library, and `library.import` fails with it.
- `library.add` with the new path finds the same id, re-points the library, and keeps the copies and instances. A later import gives the same copy.
- Live, the same: the open using file reported the moved path, nothing else changed.

**Team libraries** live on a `figcraft-server` (`library.publishToServer`, a share link to `library.add`). That reaches outside the machine and was not measured.

### 1.2 The code, read

- **A run with a library builds in the library file and gives the target only the lock** (`cli/run.ts`, `copyKeys`). The command line asks the library's plugin for its keys (`LIBRARY_KEYS`) and has the target's write them (`LOCK_WRITE`). `cli/main.ts` refuses `--library` beside either FigCraft flag.
- **Nothing on the command line declares a library.**
  - The locator answers a name from a library only when the run declares it (`RunOptions.libraries`). Only the Build pane's dry passes pass any (`main/handlers/templates.ts`).
  - So a component or artboard file run from the command line resolves every name in the file, unless the file writes a `(key)` or the overrides map sends the name to one.
  - This is a gap in Figma too: the lock is filled by the command line, and nothing on the command line reads it.
- **One pin per connection.** `cli/figcraft.ts` pins the file shown, or the one file a headless session opened, and sets the one global `figma` and the writers (`writeOperationsWith`, `writeComponentsWith`) for the whole run.
- **The root's data lasts the run.** In FigCraft, `figma.root.getSharedPluginData` answers from memory. A lock written there would be lost at the end of the run. Only the stamps persist, in the record on the `-toghen` divider (`cli/figcraftRecord.ts`).
- **Library styles are read as local: a bug in what is merged.** `figmaView` (`cli/figcraftFile.ts`) leaves out library copies of variables and collections, but not of styles. Once a file uses a library style, the style plan would see a read-only copy as its own and try to update it.
- **Imports are not offered.** `resolve.ts` imports through `figma.importComponentByKeyAsync`, `importComponentSetByKeyAsync`, `figma.variables.importVariableByKeyAsync` and `figma.importStyleByKeyAsync`. The FigCraft `figma` offers none, and its proxy throws *does not offer*.
- **The FigCraft writer already swaps.** `SWAP_COMPONENT` becomes `instance.swap` with the id the resolve gave (`figcraftApply.ts`).
- **What `refuses` stops on today:**
  - a component named by key;
  - preferred values, since the format names them by published key only (`preferred COMPONENT key="…"`, component-files.md).
- **The snapshot asks the lock which library an instance's component came from** (`librariesByKey` in `snapshot.ts`), by key.

## 2. Design

**Toghen's library model, with FigCraft's files under it.**

| | Figma | FigCraft |
|---|---|---|
| A library | a published Figma file, named as Figma names it | a published `.figcraft` file, reached by its path, known by the id it keeps inside (question 2) |
| A key | forty hex digits per object | `<library id>:<asset id>`: the asset id the library lists (a node id, `VariableID:n`, `S:n`). For a variable or a style this is also its copy's id in the using file |
| Publish, then accept | a person's two steps | the run's (question 1) |
| The lock, filled by | `LIBRARY_KEYS` from a second plugin | the using file's own listing of the enabled library (`library.list {assets}`), which names every component, style and variable |
| The lock, kept | the root's shared plugin data | the same data, kept in the record on the `-toghen` divider |
| Import | by key | `library.import`, `library.importVariable`; a style through `library.applyStyle` on the layers it styles |
| The relink | `swapComponent` | `instance.swap` (measured: keeps stamps and overrides) |
| Two files | two plugins, two codes | two pins on one connection, no pairing |
| Headless | none | one `figcraft-cli mcp` session with both files open |

**The library run.** Live, the target is the file FigCraft shows. Headless, it is `--figcraft-file`. The library is the `.figcraft` file `--library` names:

```
toghen-figma sync <entry.json>… <file>… --figcraft <port> --library <library.figcraft>
toghen-figma sync <entry.json>… <file>… --figcraft-file <target.figcraft> --library <library.figcraft>
```

1. **Pin both files.** The target is pinned as today. The library is pinned by its path:
   - live: its tab, or a new tab the run opens, left open (question 1);
   - headless: a second document in the same session.

   A library file that does not exist yet is made, as `--figcraft-file` makes one. A target that is the library file is refused.
2. **Build in the library**, steps 3 to 5 of *A run*, unchanged.
3. **Publish and save the library** (question 1). `library.publish` publishes what the file offers, as the menu item does. The file is saved at its path, since a library unsaved is unseen.
4. **In the target:**
   - `library.add {path}` enables the library, or re-points it after a move;
   - `library.acceptUpdates {ids: [the library's id]}` accepts that library's updates and no other's;
   - the lock is written from the target's listing of that library: one `LOCK_WRITE` through the plugin's own handler, `by: 'build'`.
5. **Save.** Headless, the target is saved last, and only when everything before completed. Live, it is the person's to save, as today.
6. **A dry run** builds nothing, publishes nothing, enables nothing and accepts nothing. It prints the library's plan, and what the target's `library.updates` lists now.
7. **When the build does not complete**, nothing is published or saved, and the target is not touched.

`toghen-figma lock <library.figcraft> --figcraft <port> | --figcraft-file <target.figcraft>` pins only the target and does step 4: enable, accept, and write the lock, with no build and no publish. Use it after publishing a library by hand.

**The lock in FigCraft.** Same shape (`reference.md`, *The lock*), with three additions:
- the entry keyed by the library file's name without `.figcraft` (question 2);
- `path` and `id` beside the optional `fileKey`;
- keys in FigCraft's form.

It is kept with the root's shared plugin data, which the FigCraft target now keeps in the record on the divider, beside the stamps (`{"stamps": …, "root": {…}}`). So `lockStore.ts` and `LOCK_WRITE` run unchanged, and so does anything else that writes to the root. **The record also keeps what each copy was imported from** (copy id → key), written when the run imports. FigCraft gives no read for it, and a dry run needs it.

**A run into the target that uses the library** (question 3):

```
toghen-figma components <file>… --resolver <entry.json> --figcraft-file <target.figcraft> --use <library.figcraft>
```

`--use` declares the libraries the files' names may come from (`RunOptions.libraries`). For each, a FigCraft run first enables it and refreshes its lock entry from the listing, as `lock` does without accepting. Then the locator is Figma's, in its one order:
- the overrides map;
- a declared library through the lock;
- the file.

A name in both stops the build. The FigCraft `figma` gains the four imports:
- **A component or set:** `library.import` by the library's id for it. The copy is read with `node.get` into the view as a remote main: outside every page, with `key`, its set's `defaultVariant` its first variant. The import is noted in the record.
- **A variable:** `library.importVariable`. The view answers `getVariableByIdAsync` for the copy, while `getLocal…` still leaves copies out. A field binds to it with `variable.bind`, as measured.
- **A style:** there is no import alone. The view answers with the copy's id, and the writer applies a library style with `library.applyStyle {library, style, ids}` where it would write `style.apply`.

A dry run imports nothing, as in Figma, and lists what it would import.

**The relink, as in Figma.** An instance Toghen made whose component the lock now answers with another key gets `SWAP_COMPONENT`, written as `instance.swap`. In a real run the copy ids are compared. In a dry run the keys are compared: the instance's copy's key comes from the record of imports. An instance a person placed carries no stamp and is not relinked, as in Figma. FigCraft's `library.swap` re-points every instance in the file, the person's too, so it is not used.

**Drift.** Unchanged. Accepting an update changes no receipt Toghen holds on the target's layers: a copy keeps its id, and bindings follow. What the library's own data brings onto instances is already left out: an instance stamped as a member is not the target's, and what is inside an instance is not read. A variant removed from the library leaves Toghen's instance of it with a missing main. That is a component the locator no longer finds, so the run stops on it with its line, as in Figma.

**Keys in files.** In FigCraft, keys come from the lock and the overrides map, both FigCraft's. A `(key)` written in a component file is accepted in FigCraft only in FigCraft's form, and a Figma key is refused with a line that says so. A component file meant for both targets names components by name.

**Preferred values** (question 4). The recommended answer:
- the format gains `preferred COMPONENT name=…` and `preferred COMPONENT_SET name=…`, resolved through the locator like an instance swap's default;
- FigCraft writes the resolved components' ids;
- Figma writes their keys once a desktop measurement says a local component's key is accepted there. Until then the Figma side keeps writing only `key=`.

**The style bug.** `figmaView` leaves out style copies too, whatever else is decided.

**Not in this design:**
- **Team libraries.** A share link to `--library` or `--use` is refused, naming the server: it reaches outside the machine. Wanted when a consumer keeps its library on a `figcraft-server`.
- **A library's own extended collections** (`library.extendCollection`). Wanted when a consumer overrides a library's values per file.
- **Modes of a library collection on the target's frames** (`modes` with a library's collection). Figma does not do this either (`resolve.ts` looks for local collections only).

## 3. Units

Waves. Within a wave, the units touch different files, or different parts of one file, as named.

**Wave 1, in parallel**

1. **Library styles out of the file's own list.**
   - Files: `cli/figcraftFile.ts` (`figmaView`); `test/support/fakeFigcraft.ts`, only its `style.list`; `test/figcraft.test.ts`.
   - Done when a file holding a library style plans nothing for it.
2. **Two files over one connection, and the root's data kept.**
   - Files:
     - `cli/figcraft.ts`: a pin by path, live (`doc.list`, else `file.open`) and headless (`open_file`, or a new document saved to the path); a bridge per pin over one connection, each setting the global `figma` and the writers for its own requests; the root's shared data read from the record and written back with it;
     - `cli/figcraftRecord.ts`: the record gains `root` and `copies`, an old record reading as having neither;
     - the fake's document handling (`doc.list`, `doc.switch`, `file.open`, `file.new`, several documents).
   - Done when:
     - two bridges over one fake connection each write into their own document, turn about;
     - a lock written in one run is read by the next.
3. **The fake learns libraries.**
   - Files: a new `test/support/fakeLibraries.ts`, which the fake hands every `library.*` command to (one line in `fakeFigcraft.ts`). It covers publish, add, list with assets, import, importVariable, applyStyle, updates and acceptUpdates.
   - It reproduces what §1.1 measured:
     - ids kept in the file, a publish unseen until saved;
     - prefixed copies whose mode ids carry no prefix;
     - idempotent imports;
     - copies carrying the library's layer data;
     - variants matched by id, and a remade asset that is not an update;
     - a moved path reported, then re-pointed.
   - Tests of the fake against those findings, so a FigCraft release that changes one is caught when the live run is repeated.

**Wave 2, in parallel** (after wave 1)

4. **The library run.**
   - Files: `cli/main.ts` (lift the refusal; with a FigCraft flag, `--library` takes a `.figcraft` path; `lock` takes the FigCraft flags); `cli/run.ts` (the FigCraft branch of a library run); a new `cli/figcraftLibrary.ts` (publish, save, enable, accept, and the listing turned into a `LockedLibrary`); `shared/protocol.ts` and `main/utils/lockStore.ts` (`path` and `id` on an entry); tests.
   - Done when, against the fake, live and headless:
     - a sync builds into the library, publishes, saves, enables, accepts and writes the lock;
     - a second run publishes a version with no updates and plans nothing;
     - a dry run writes nothing in either file;
     - a failed build leaves both files as they were.
5. **Resolving through a library in the target.**
   - Files:
     - `cli/figcraft.ts`, only its `figma` object: the four imports, and the record of copies;
     - `cli/figcraftScene.ts`: copies as remote mains outside every page, an instance's main from a copy, its key from the record;
     - `cli/figcraftApply.ts`: library styles by `library.applyStyle`, and the `(key)` refusal narrowed to Figma's form;
     - tests.
   - Done when, against the fake:
     - an artboard places instances of a library set and component, binds a library variable and applies a library style, and a second run plans nothing;
     - a component remade in the library is one `SWAP_COMPONENT` per stamped instance, in a dry run and in a real one;
     - a person's instance is left alone;
     - the library's stamps on the copies and the instances are never taken for the target's.

   Tests use the W3C structured shapes: a colour `{colorSpace, components}`, a dimension `{value, unit}`, a `fontFamily` array.

**Wave 3, in parallel** (after wave 2)

6. **Declaring libraries on the command line** (question 3).
   - Files: `cli/main.ts` and `cli/run.ts` (`--use`, passed as `RunOptions.libraries` to every component run, in both targets; in FigCraft, the enabling and the lock refresh first); `test/cliRun.test.ts` and `test/figcraftComponents.test.ts`.
   - Done when a file naming a library's component builds against the lock, in the Figma fake and the FigCraft fake.
7. **Preferred values by name** (question 4).
   - Files:
     - `shared/components/read.ts`, `model.ts`, `validate.ts`: `name=` beside `key=`, one of the two;
     - `main/components/resolve.ts`: preferred names through the locator;
     - `main/components/apply.ts` and `update.ts`: Figma writes keys only, as now;
     - `cli/figcraftApply.ts`: ids, and the refusal lifted for names;
     - `component-files.md`; tests.
   - Done when an instance swap and a slot with preferred components by name build in FigCraft, from the file and from a library, and a second run plans nothing.

**Wave 4**

8. **Docs, skills, the live run.**
   - specs.md: *The lock*, *A run with a library*, *Commands and arguments*, *FigCraft*, *Not in this design*.
   - reference.md: *The lock*, *Into FigCraft*, *Headless*, the command line.
   - guide.md: *A library and the files that use it*, in FigCraft.
   - decisions.md: the ruling, §1.1 as the measurement, and *What the build found*.
   - The `toghen` skills (`pipeline/commands.md`, `pipeline/messages.md`, the figcraft skill), and the skill pins.
   - The live run against FigCraft 0.10.0, in files of the run's own:
     - a library and a target, a library run and a `--use` run;
     - second runs that plan nothing;
     - a value changed and a variant renamed in the tokens, run, accepted, and nothing planned after;
     - a component remade, then relinked;
     - the library moved and re-pointed;
     - the same headless.

Checked at the end:
- `pnpm typecheck`, `pnpm test` and `pnpm build`;
- the built plugin free of `[object Object]` and unresolved `toghen(`.

## 4. Risks

- **FigCraft releases weekly, and its docs already disagree with it once:** a publish with no change is not refused. Everything in §1.1 is measured against 0.10.0 only. The fake holds it, and unit 8's live run is the check to repeat on each release.
- **A remade asset is not an update.** When a library deletes a component or a variant and makes it again, the target keeps the old copy, and FigCraft says nothing.
  - Toghen's own instances are relinked by the next `--use` run.
  - A person's instances stay on the old copy.
  - Toghen reconciles a library in place, so this happens only where its plan removes and makes a member. That step is breaking already, and gated.
- **A variable id given again in the library.** FigCraft gives a new variable the highest id plus one. A library that deletes its newest variable and makes another would hand that id over. Unmeasured: whether the target's copy then becomes the new variable on accept. The stamps' guard does not reach copies. The lock is written again on every library run, so a token's key follows its name, but a stale binding could show the wrong value until then.
- **The library's stamps travel into the target.** Copies and instances carry them. The view's rules leave them out, but a single slip would make the target adopt the library's set as its own. Unit 5's tests cover copies, the instances Toghen makes, and a person's.
- **Two bridges, one global `figma`.** The handlers, the executor and the component writer read module-level state. A request answered by the wrong file is the failure, so unit 2 tests interleaved requests.
- **The run saves the library live.** That is a person's open file, saved over the socket. The library is named on the command line, and nothing is saved by a dry run or a failed build. The tab then reads as unsaved, as measured. If that confuses, a save in a batch of its own is the next thing to measure.

## 5. Questions

1. **Who publishes the library and accepts its update.** In Figma both are a person's steps, since no plugin can do them. In FigCraft both are commands, measured: no server is reached, the library must be saved to be seen, and accepting keeps overrides, stamps and bindings.
   - (a) The run does both, after a completed build. It publishes what the library file offers (as the menu does), saves it, enables it in the target and accepts that library's updates there. Live, the library file is used where it is open, else opened in a tab and left open.
   - (b) As in Figma: the run builds and prints the steps left (publish, save, accept), and the person runs `lock` afterwards.
   - (c) Headless does both; live leaves them to the person.

   Recommended: (a). It is what makes the round "work" end to end, it is all local, and a dry run still shows everything first.
2. **What names a FigCraft library.** Figma names a library; FigCraft reaches one by path, keeps an id inside the file, and gives it the document's name at its last publish (`Untitled` for one never saved).
   - (a) A path on the command line. In the lock, the file's name without `.figcraft` names the entry, which holds the path and the id. The id is what makes a moved file the same library, and the path is how to reach it.
   - (b) FigCraft's own library name.
   - (c) The id alone.

   Recommended: (a). A person and a blueprint can write it, and it survives a move.
3. **How a run into the target declares its libraries.** Today nothing on the command line declares one, in either target, so the lock the command line fills is read by nothing it runs.
   - (a) `--use <library>`, repeatable, on `components` and `sync`, in both targets: a name in Figma, a path in FigCraft.
   - (b) Every library in the target's lock is declared, with no flag.
   - (c) Only blueprints declare them, once a blueprint is built whole (its own round).

   Recommended: (a). Declaring is the model's rule (a name in both the file and a declared library stops the build), it costs one flag, and it closes the gap in Figma too.
4. **Preferred values** (the pending ruling). The format names them by published key only, and FigCraft has no keys. FigCraft's commands take component ids, which the locator now gives for a library's components as for the file's own.
   - (a) The format gains `preferred COMPONENT name=…` and `COMPONENT_SET name=…`, resolved through the locator. FigCraft writes the ids this round. Figma keeps `key=` only until a desktop measurement shows a resolved component's key is accepted, local ones included.
   - (b) `key=` takes FigCraft's form in FigCraft (`<library id>:<asset id>`). The file then serves one target.
   - (c) Leave them refused in FigCraft.

   Recommended: (a). A file stays good for both targets, and it reuses the locator this round extends.

## Answers (23 October 2026)

1. **(a)** The run publishes and saves the library after a completed build, enables it in the target and accepts that library's updates there, live and headless. Live, the library file is used where it is open, else opened in a tab and left open.
2. **(a)** A FigCraft library is named by its path on the command line; the lock keys its entry by the file's name without `.figcraft`, and holds the path and the id.
3. **(a)** `--use <library>`, repeatable, on `components` and `sync`, in both targets. Where `--use` is absent, nothing changes.
4. **(a)** The format gains `preferred COMPONENT name=…` and `preferred COMPONENT_SET name=…`, resolved through the locator. FigCraft writes the ids this round; Figma keeps `key=` and refuses the new form by name until it is measured in the desktop app.

## What the build found (23 October 2026)

All eight units are built on `figcraft-libraries`. Unit 7 was built by its own implementer and merged. decisions.md, *What the build found: libraries in FigCraft*, has the detail. In short:

- **Library styles were read as local** (unit 1's bug fix covered styles as well as variables).
- **An instance's properties were read before its main was in the view.** Once a library's copies were read after the pages, every run patched an instance's `set` fields. It is a lazy getter now.
- **The live run found a FigCraft target bug from before this round.** A member added to a set that exists gets none of the set's properties in FigCraft 0.10.0, so wiring it was refused. The writer now gives the member the properties and wires it before it joins.
- **The command line prints a swap** in an artboard's plan, and **a library file a dry run made is closed** at its end.
- **Not as planned:** a dry run with `--use` neither enables nor locks, since both are writes, and the library's publish is not conditional.
- **The live run and the headless run** each did the same steps, against FigCraft 0.10.0: a library and a target built, a second run planning nothing, a value and a member flowing through publish and accept, a remade component relinked, a preferred value by name from the library, and a hand edit as drift. The headless run also checked a moved library.
