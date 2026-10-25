# The Smell Log — running notes

> A note is a hunch, not a verdict.
> Strength: faint (a break from the usual) → strong (a user actually gets lost or stuck).
> Status: open · real problem · fixed · fine as-is.

_Project:_ `@toghen/figma`
_Last updated:_ 2026-10-24

Status, read today: a row marked *fixed* was found as a real problem and has since been met, by the fix its note names or by the rule it became; rows 8, 41, 42, 45, 48, 49, 50 and 51 are still *open*.

First walk: 2026-08-12, over the two-panel layout as it stood after drift
detection shipped.

| # | Where | What I smelled (principle) | Strength | Status | Note |
|---|---|---|---|---|---|
| 1 | Status strip | The region that should carry the state picture is one line of ~40px, with nowhere to grow | strong | fixed | The stated goal of the round is making the current state legible; this is where that would live |
| 2 | Document / Variables / Styles | Affordance costs more than what it affords, with ~48px of section header to house ~40px of content, three times over | medium-strong | fixed | Collapsible sections earn their keep by hiding bulk; there is no bulk |
| 3 | Variables vs Styles | Two Plan/Execute pairs, identical in words and layout, in adjacent identical-looking sections | medium | fixed | Only the header distinguished them; now two labelled rows of one group |
| 4 | Activity | It is last, so the only region with real content sits furthest down, clipped on open | strong | fixed | |
| 5 | Activity | `max-height: 200px` with its own scrollbar, inside a `main` that also scrolls: two nested scroll regions | strong | fixed | Rows become unreachable |
| 6 | Activity | Never says *which* plan it shows. `planType` exists and is used only to enable a button (`render.js:87`) | medium-strong | fixed | The user infers it from which button lit up, two sections away |
| 7 | Activity | Holds the **Dry run** toggle, which modifies Execute two sections up: a control inside a region that otherwise only reports | medium | fixed | Introduced by me, two rounds before this walk. Resolved by deletion: put beside Plan/Execute it was visibly a third "look without doing", so the toggle went and its one real check moved into planning |
| 8 | Activity | `…and N more` truncates at 80 with no way to reach the rest | faint | open | |
| 9 | Map panel | The reporting apparatus is duplicated per tab, and the copy lost `progress-wrap` and `result-summary`, which exist only in the Sync panel | strong | fixed | **A defect, not a preference:** Execute Scaffold shows no progress and no result at all |
| 10 | Export | Lives in Map; the document loads in Sync. The round trip crosses a tab boundary with nothing structural putting it there | medium | fixed | |
| 11 | Whole window | Fixed 400×600 with no way to resize | medium | fixed | Self-imposed: `showUI` names no maximum |
| 12 | Window grip | First implementation read `clientX/clientY`, which are relative to the very viewport being resized (a feedback loop that made the drag stutter and drift) | strong | fixed | Fixed with `screenX/screenY` against the size at drag start, one message per frame |
| 13 | Design System header | Name shown as a bare slug; the document's `description` was never read at all, though the Resolver spec allows it at root | faint | fixed | The header now carries name, description, and named modes rather than counted ones |
| 14 | Everywhere | `hidden` did not hide. `.btn` is `inline-flex` and `.progress-wrap` is `flex`, and a class beats the UA's `[hidden] { display: none }`, so Cancel sat on screen at rest and the progress bar showed `0 / 0` before anything ran | strong | fixed | Only `.panel[hidden]` had ever been patched, one case at a time. A global `[hidden] { display: none !important }` fixes the class |
| 15 | Groups, rows | Boxes inside boxes: a bordered group around bordered button rows, and every result row filled with a raised background, so the eye had nothing to rest on | medium | fixed | Groups keep the label and lose the box; rows are a list with a hairline rule, and the raised fill is kept only for rows reporting a problem, where it earns its weight |

Second pass: 2026-08-12, while building the Design System pane (M2).

| # | Where | What I smelled (principle) | Strength | Status | Note |
|---|---|---|---|---|---|
| 16 | System pane | The pane described the *document* and never the *file*. The record of what had been synced was persisted, read by the dirty check, and never sent to the UI | strong | fixed | The same shape as `fromFigmaValue` and `planType`: computed, correct, unreachable. Now `SyncStatePayload`, posted at open, after a load, and after every execute |
| 17 | Empty state | `DOCUMENT_STATE` had no way to say "there is no document": it replied with a placeholder name and zero tokens, and the UI read any reply as proof of a document | strong | fixed | So the plugin opened straight into the loaded pane, titled "Untitled", with live buttons: the exact confusion R8 exists to prevent, present the whole time R8 was written |
| 18 | System pane | Sync and Export sat flush against each other. Wrapping them in `#system-loaded` (M1) broke the panel's `gap` chain, since `gap` reaches children, not grandchildren | faint | fixed | Invisible in review, obvious on screen. The wrapper carries the rhythm now |
| 19 | Inspect pane | `.text-muted` had been used in the markup since M1 and never defined in CSS, so the line it dims rendered at full strength | faint | fixed | A class that does nothing fails silently in exactly one direction: it always looks like a design choice |
| 20 | Export | It picked a mode on the user's behalf and explained itself in a toast afterwards. The handler had always accepted and validated a `mode`; the UI never sent one | medium | fixed | A choice made for the user and reported after the fact is worse than no choice. The picker is on screen, hidden when there is one mode (R5) |
| 21 | `ui.md` | Documented a UI that had not existed since M1: two panels, bordered collapsible sections, `state.collapsedSections`, `toggleSection()` | medium | fixed | Not a screen smell, but the same failure: a description that outlived what it described. An agent reading it would have rebuilt exactly what R5 removed |

Third pass: 2026-08-12, from a real run in Figma against the demo document.

| # | Where | What I smelled (principle) | Strength | Status | Note |
|---|---|---|---|---|---|
| 22 | Sync status | **The badge lied.** A green dot and the word "Synced · 52 of 52 tokens" sat directly above a plan reporting `4 drifted`. Two regions of one screen contradicting each other, and the confident-looking one was wrong | strong | fixed | Found by the person using it, not by a walk. "Synced" alone is a claim that everything agrees; the record only knows what was written and when. Now `Synced <date> · 52 of 52 recorded`, with the drift the last plan found appended and the dot amber |
| 23 | Result surface | Same background as the pane above it, so opening and closing changed the layout without changing the picture | medium | fixed | Recessed: a translucent black over the page, which darkens in either theme, plus a shadow to put an edge on it |
| 24 | Result surface | The header ellipsised its own counts, and the counts end with `drifted`, so it cut exactly the number worth reading (`4 drif…`) | strong | fixed | Truncation from the right is only safe when the right is the least important, which is a property of the content, not of the layout. Stats moved to their own row and wrap |
| 25 | Result surface | The region's name was replaced by the plan's name, so when nothing had run there was no "Results" to find, and the label changed identity every time a command ran | medium | fixed | "Results" is permanent; the source is said beside it (R6 still satisfied) |
| 26 | Result surface | Fixed 240px in a window that resizes: a sliver in a tall window, most of the screen in a short one | medium | fixed | `44vh`, and `62vh` once there are rows. Dragging writes an inline value, which beats both, so a chosen size sticks with no flag to remember it |

| 27 | Empty state | The only way back to a system the user had loaded yesterday was finding the file again, and the button that had loaded it showed `toghen.resolver.json`, which is what every one of them is called | medium-strong | fixed | Asked for directly. The last five are listed by the system's *name* and its declared version. Each row carries its document, because a plugin cannot re-read a file from disk. A list of names alone would be readable and not clickable |

Fourth pass: 2026-08-12, from the first real run of the finished M2 pane.

| # | Where | What I smelled (principle) | Strength | Status | Note |
|---|---|---|---|---|---|
| 28 | Result rows | **One drifted token takes two rows.** The engine emits a `WARNING` carrying the explanation and a `SKIP — drifted` carrying the outcome, so four drifted tokens fill eight rows, and the stats say the same number twice: `4 drifted · 4 warnings` | medium | fixed | Fixed at the source rather than in the renderer, as the note predicted: the explanation moved onto the `SKIP` as its `message`, so the plan emits one operation per event and the summary stops double-counting. The row shows the reason on the first line and the explanation below it. One case still stands alone: a path both drifted *and* stale has no skip to carry the message, and losing that report is exactly what a careless version of this change would have done |
| 29 | Export → load | **The export cannot be loaded back, and the error blames the wrong thing.** Loading an exported `demo.dark.json` said *"Resolver document must declare a `version` field"*, which sent the reader looking for a field to add | medium-strong | fixed | There is none to add: DTCG token files define no `version`, and a token file is a *different document*, not a resolver document with something missing. The message now says so. Worth noting the export button gives no hint that its output is one-way. *22 October 2026:* the core loads a token file now, so the file loads, as its own collection, and the message is gone (decisions, *Built: load through the core*) |
| 30 | Export | The exported file said which mode it held, in its filename, and nothing about the system it came from, not even the version the document declares | medium | fixed | Now written to the token file's root `$extensions`, which §6.3.2 allows on any group, gated on the same "Include $extensions" switch |

Fifth pass: 2026-08-12, while building the Inspector (M3).

| # | Where | What I smelled (principle) | Strength | Status | Note |
|---|---|---|---|---|---|
| 31 | Everywhere drift is claimed | **Two regions can now answer the same question.** The System pane borrowed drift from the last plan; the Inspector computes it by looking. Nothing made them agree, and nothing said which had looked more recently | medium-strong | fixed | Caught before it shipped, because smell #22 is the same shape. Fixed twice over: both readers share one comparison (`utils/correspondence.ts`), and the status line takes the *more recent* of the two checks and names it: `1 drifted (inspected 20:50)` |
| 32 | Inspector, closed group | **A group nothing had measured said `1 clean`.** Style-backed tokens are not compared this round, and the roll-up folded them into the reassuring number | medium | fixed | Found on screen, not in review: the token list said `not inspected` correctly and the summary above it disagreed. Now `2 clean · 1 not inspected`. Became **R16**: a summary of unmeasured things does not say they are fine |
| 33 | `fromFigmaValue` | **A variable pointed at another variable would have rendered as a confident `#000000`.** An alias is an object with no `r`/`g`/`b`, so `clamp01(undefined ?? 0)` produced black and said nothing | medium | fixed | Never noticed because the function had no production callers at all until this round: it was written, tested, and unreachable. A silently wrong value matters more here than anywhere else in the plugin: this is the one place a Figma value is shown to a person instead of compared |
| 34 | Inspector header | `inspecting` is a latch, and only the success path released it. Any error would have left the pane reading *Looking…* for the rest of the session | faint | fixed | Fixed while wiring rather than after seeing it. Recorded because the class is worth remembering: a flag set by one path and cleared by one other is a flag that eventually sticks |

Sixth pass: 2026-09-27, while writing references as aliases.

| # | Where | What I smelled (principle) | Strength | Status | Note |
|---|---|---|---|---|---|
| 35 | Plan rows, Inspector | **A variable a designer aliased by hand read as drift forever.** The document side was always a baked value, and an alias never equals a value, so pointing `color/button/bg` at `color/brand` (the very structure the document had) was reported as a local edit on every sync | medium | fixed | Fixed by this change, at the source rather than in the comparison: a whole-value reference is now written as an alias, so the document side is an alias too and `figmaValuesEqual` compares the two by id. Loosening the comparison instead would have hidden a real edit: an alias to the *wrong* variable is still drift |
| 36 | Templates rows (Build) | The design shows *2 members differ* on a built set, and nothing can say it: a dry run re-applies every field the file declares whether or not it changed, so every built set would read as differing | strong | fixed | Met while building the redesign. The row says *not compared* and carries the grey ring until a comparison exists (R11, R16). *Build everything that differs* was left out with it: with no way to know what differs, it would build everything. *22 October 2026:* unchanged in the Build pane; a blueprint's row follows the same rule for its needs, *not looked* until a look |
| 37 | Tokens detail, drift popover | The design counts bound layers across the file (*12 layers · 3 pages*); under `dynamic-page` access that means loading every page to count | medium | fine as-is | Counted on the current page only and said so, *on this page*. A file-wide count is a second round, if someone needs it |
| 38 | Source card | The design enables Connect at six characters; the command line prints eight (`ABCD-2345`) | faint | fixed | Connect waits for the eight letters and digits the command line actually prints |
| 39 | System collections table | The design names the base collection `acme` beside a document called *Acme Tokens*; variable sync names the base collection after the document | faint | fine as-is | The table names what sync builds. The fixtures follow the code, not the drawing |
| 40 | Result surface | The design's *Allow breaking steps on this build* could be read as applying to any plan with a breaking row, but the screen never deletes a mode | medium | fine as-is | The checkbox appears only under a build plan the Templates pane asked for. A variable plan lists its breaking rows, red, with no checkbox |
| 41 | Templates (Build) | The design's callout *The command line sent button.component.kdl… Keep* cannot be honest: the command line sends the compact component, not the file's text | medium | open | Not built, and recorded under *Still open* in `specs.md`, *The command line*. The Build pane does not change it |
| 42 | Selection rows | The design's *from stepper.borderColor* names the template's group key; the stamp says which fields the file set, not which key of which group set them | faint | open | The note reads *from Stepper*; naming the key needs the group plan read back per layer |
| 43 | Whole screen, while building | Class names collided: a row's `warn` modifier picked up the `warn` colour utility, and a group row's `group` class picked up the card group's column layout | medium | fixed | A correctness slip, not a placement smell, logged so the next walk does not mistake it for one: modifiers are now prefixed (`problem-warn`, `folder`) |

Seventh pass: 2026-10-13, while documenting parts and folded axes.

| # | Where | What I smelled (principle) | Strength | Status | Note |
|---|---|---|---|---|---|
| 44 | System collections table | A collection that a folded part axis made is drawn exactly like the base collection: the payload drops the axis flag before the screen gets it, so a reader cannot tell `state` (modes rest, hover, pressed) from the document's own collection | medium | fixed | Found while writing `ui.md`'s System passage. The row wants the same treatment a modifier's collection gets, with the axis named; needs the flag carried in the payload first. *22 October 2026:* `DocumentStatePayload.collections` carries `axis: true`, and the Sync pane's table (and the Load pane's list of collections) says *part axis* after the name, as it says *modifier* after a modifier's |

Eighth pass: 2026-10-22, while splitting the System pane into Load and Sync.

| # | Where | What I smelled (principle) | Strength | Status | Note |
|---|---|---|---|---|---|
| 45 | Sync collections table, 320px | At the minimum width the modes cell ellipsises from the right, and for a collection Figma lacks the right end is *not in Figma*, the words that matter most (R12). The red ring still says it; the words are cut | faint | open | Was there before the split; naming a modifier's and an axis's collection after its name takes a little more of the row. The words want a place of their own, or the modes the cut, not the status |

Ninth pass: 2026-10-22, while turning Templates into the Build pane.

| # | Where | What I smelled (principle) | Strength | Status | Note |
|---|---|---|---|---|---|
| 46 | Build, an open row at 320px | A blueprint's file line and a key need (`(key)"…"`, forty characters) pushed the detail 74px past the pane's edge: a second, horizontal scroll the pane did not mean to have (R1) | medium | fixed | Found in the preview, measured. The detail's cells wrap anywhere now, as the overrides table's do. |
| 47 | Build, a missing component | Use the selected instance cannot say whether the selection is an instance from a library: the screen knows only how many layers are selected. With one selected, the button shows; the main thread refuses a layer that holds nothing from a library, in its own words | faint | fine as-is | The refusal names the fault (R13). Telling an instance apart on the screen would mean sending the selection's kinds with every selection change, for one button |
| 48 | Result surface, relink plan | A relink plan writes nothing and has no Execute, yet its header shows `0 create` beside `2 update`, as every plan does | faint | open | The zero is true and harmless; a plan with no creates of any kind could drop the chip, as a load's rows do. An apply plan, which never creates, shows the same `0 create` |

Tenth pass: 2026-10-22, while turning Selection into the Apply pane.

| # | Where | What I smelled (principle) | Strength | Status | Note |
|---|---|---|---|---|---|
| 49 | Apply rows | A row per field the table lists is about 35 rows for one frame, most of them *plain* and holding a default; at page scope, 200 layers draw some 7000 rows, and the bound few are hard to find | faint | open | What the plan asked for. Folding the plain rows of a layer behind one line, or a *bound only* filter, would want its own rule first |
| 50 | Result surface, a routine row's message | An apply row whose value is written carries its line as a message, and every message has a 2px gutter, in the text's colour when the row is not a problem. It reads close to a problem's marker (R4) | faint | open | Was there for a relink row's message too. The problem rows keep their ground and tone, so they still stand apart |
| 51 | Apply rows, 320px | A bound token's path is cut at the right with no ellipsis (`color.ste`), losing the leaf, the end that matters (R12) | faint | fixed | The link was cut the same way before; the field names' wider column, 112px, makes it happen sooner |
| 52 | Result surface, collapsed bar, 320px | The counts ran past the window's right edge once an apply plan added *written as a value*: `2 written as a valu` (R12). The bar's chips never wrapped, and the source gave way only until it was gone | medium | fixed | Found by the integrator's look at the preview, 22 October 2026. The chips now wrap onto a second line of the bar. #51 fixed the same day: the path wraps in its row |

Eleventh pass: 2026-10-24, while a plan's skips were counted by cause.

| # | Where | What I smelled (principle) | Strength | Status | Note |
|---|---|---|---|---|---|
| 53 | Result surface, a sync plan | The variable plan drew one `SKIP` row per style token (*style-type (handled in style sync phase)*), and the style plan one per variable token: rows that recorded nothing that happened in that plan, most of a large document's skips, and the same token counted in both plans (R14) | strong | fixed | Closed under R14 on 24 October 2026: each plan lists only the tokens it is for, so the Plan shows fewer `SKIP` rows. The footer's `skipped` after a run also counted the plan's warnings and notes, one count under two names; it counts skips, failed prerequisites and cancellations now |

## Rethink candidates from the second pass

- **The load button's position.** Notes #16, #18 converged on it. With the status now beside the header, "Load resolver JSON" sits between the picture of where things stand and the commands that act on it. That reads as a divider, which is defensible, but the button is also the *one way in* when empty and a quiet "replace this" when loaded, and it looks identical in both. This round left it alone; it is worth a fresh idea rather than a nudge.

## Spots with several smells (rethink candidates)

> When different smells pile on the same spot, it usually wants one fresh idea, not three patches.

- **Activity.** Notes #4, #5, #6, #7, #8, #9 → six notes on one region, and they do not describe a cramped area so much as a region with **no single purpose**. It is a plan preview, a live progress display, a result report, and the home of a setting, all at once. Everything without an obvious home ended up in it. → The one fresh idea: it is not a *pane's* area at all. It becomes a **shared result surface** belonging to the shell, rendered once, resizable, that any pane fills. The setting leaves (R3); the duplication disappears (R2); the nesting disappears (R1).

- **The section apparatus.** Notes #2, #3 → the top three quarters of the window spend nearly all their space on affordances for four buttons.

## Later

Two regressions shipped this session that this log would not have caught, because they were not placement problems: the file picker that silently ignored a re-pick, and the row renderer that dropped every `reason` and `message`. Both came from `ui/` having no typecheck and no tests. This note is here only so the next walk does not mistake them for design smells: they were correctness bugs in an untested layer.
