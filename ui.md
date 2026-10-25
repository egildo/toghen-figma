# @toghen/figma — UI / UX Specification

> **Audience:** UI/UX contributors, AI coding agents, and developers maintaining the plugin interface.
> For user tutorials, see [guide.md](./guide.md).
> For architecture and internals, see [specs.md](./specs.md).
> For the message protocol, see [reference.md](./reference.md).
> What each area of the screen is for is in [ux-map.md](./ux-map.md); the rules that bind every change are in [ux-rulebook.md](./ux-rulebook.md). Read those before moving anything.

---

## Design Principles

1. **One scroll region per axis.** The pane body scrolls vertically and the
   result surface scrolls its rows; nothing nests a second vertical region
   (R1). The one horizontal region is the Tokens browser, and it scrolls only
   when even one column does not fit.
2. **Chrome must be earned.** A group is a label above one card on the grey
   ground, not a box inside a box. Collapsing was removed everywhere but the
   result surface, the one region with bulk to hide (R5).
3. **Plan → Execute pairs.** Every operation is *Plan* (shows what would happen,
   touching nothing) then *Execute* (applies it), side by side. There is no
   separate dry run: Plan already is one.
4. **Self-contained.** One `dist/ui.html`: the script bundled by esbuild, one
   stylesheet, the two fonts inside it. The manifest gives the window no
   network, so nothing may be fetched.
5. **The palette is the plugin's own.** The screen's colours, sizes and type
   come from the plugin's own Toghen token document, not from Figma's
   `--figma-color-*` variables. Light and dark are the two contexts of a
   `theme` modifier in that document; Figma's choice of theme only selects
   between them, through the `figma-light` or `figma-dark` class it puts on
   `<html>` because the window is shown with `themeColors: true`. Mapping onto
   Figma's variables gave the screen no way to say "drift" or "a sunken ground"
   in both themes, and the plugin is a Toghen consumer like any other.

---

## The shell

```
┌──────────────────────────────────────┐
│ tab strip   Load · Sync · Tokens · Apply · Build
├──────────────────────────────────────┤
│ main        the pane in front            ← scrolls
├──────────────────────────────────────┤
│ ═══════════ splitter ═══════════
│ results     bar · counts · rows · footer ← drag to resize, click the bar to collapse
├──────────────────────────────────────┤
│ status bar  busy / error …  command line · window switch
└──────────────────────────────────────┘    ◢ window grip
```

`ui/ui.html` holds the elements and nothing else: `<tg-tabs>`, `<main>` with
the five panes, `<tg-results>`, `<tg-status-bar>`, `<tg-popover>` and the
grip. Every element draws itself from the state; `render(state)` hands the
state to each and decides only which pane is in front. A pane behind is not
drawn until it comes forward.

**The result surface is shared.** Every command from every pane reports into
it, rendered once (R2). Its label is permanently "Results"; what produced the
contents is said beside it, with the time (`build plan · Stepper · 10:02`),
and `from the command line` when the command line asked (R6). Its height is
relative to the window, `44vh` and `62vh` once there are rows; dragging the
splitter writes `--results-height` inline, which beats both, so a size someone
chose is never overridden by a later result.

**The status bar is the plugin's own condition**, one line: on the left the
busy dot and the word (`idle`, `running`, `error`) with any error; on the
right the two controls that are about the plugin itself, the command line's
connection (the green dot and the time it connected, nothing otherwise) and
the window switch. The connection is an event with a time, not a claim (R11).
That the bar carries two controls is recorded in the rulebook as an exception
pending sign-off.

## The window

A Figma plugin window cannot be resized by the person; the plugin grows its own
grip and calls `figma.ui.resize()`. The window remembers **two sizes**, narrow
(460 × 720, the size the design is drawn at) and wide (980 × 620), per user in
`clientStorage`. The switch at the right of the status bar moves between them;
a drag of the grip is remembered as the size of the mode the window is in.
Nothing else is told: the Tokens browser measures its own width and lays itself
out, so a switch changes its columns and its detail without a message.

The UI opens hidden, is sized, then shown, so a restored size does not arrive
as a visible jump.

---

## The five panes

One element each, switched by the tab strip, tracked in `state.activePanel`:
**Load · Sync · Tokens · Apply · Build**. The strip takes a sixth
without a label truncating or wrapping at the minimum width, 320px (R7): below
400px the glyphs step aside, the strip gives up its own inset and each tab keeps
4px a side. Measured in the preview on 22 October 2026: the five labels and a
sixth as long as *Templates* sit whole on one line, at least 8px apart; measured
again with *Build* in Templates' place, the sixth ending 4px short of the edge,
and again with *Apply* in Selection's place: the same, every label at least 10px
from the next. With
nothing loaded, Sync, Tokens and Apply have nothing to show and their tabs
are inert; a reply saying nothing is loaded brings Load forward.

### Load

What the design system is made of: the files it reads and how they combine.
Two states, and they look different (R8).

**Nothing loaded.** A placeholder identity card, then one way in: drop a
resolver document or token files on the dashed row or choose them (several at
once), or **Choose a folder…**, or load one of the documents loaded before. A
folder pick gives each file its path inside the folder, and that path is what
the core reads by, so a resolver document's `$ref`s to sibling folders
resolve; only its `.json` files are kept, in the order of their paths. When the
file's variables or styles carry a sync's stamps, an information callout names
whose they are (the leading segment of the tokens they name, which is the
synced document's name) and how many, with **Load it**, which opens the
picker. A recent whose name matches theirs says "this file's record" instead of
its date. The Source card at the foot holds the command line's code field,
because the command line is how a document may also arrive.

**Picking does not load.** What was picked waits in a *To load* card, with
**Load** beside what it needs (R3, R10):

- **Which file is the entry.** The first picked file named `.resolver.json`, or
  whose top level has a `resolutionOrder` list, is the entry, and the other
  files are there for its references. With none, every picked file is a token
  file, and the list in pick order is the entry: one collection, a later file
  winning. The card says which, and numbers the token files.
- **The collection's name**, for token files only: an editable field, starting
  at the folder's name for a folder pick, or the first file's name without its
  extensions for a flat one (`brand.tokens.json` gives `brand`). The plugin
  always sends a name for token files, since a flat pick has no folder for the
  core to take one from. Load waits while it is empty.
- **An overrides map**, optional: a JSON file picked beside them, one object, a
  `$ref` as written to the location to read instead. A file that is not one
  such object is refused in the status bar.

**Clear** forgets the pick. A load that fails leaves it, so the map or the name
can be changed and Load pressed again.

**Loaded.** A standing picture of the load (R15), reading down:

- **Composition:** the form and the entry (a resolver document and its file, or
  token files as one collection and its name), and when this window saw it
  load. A recent loaded from its bundle says so: no file was read again, and the
  files listed are those the load that stored it read.
- **Files read:** one row per file, each once: the entry or the token files in
  order, then every file a reference read, the ones the map sent there marked
  *by the overrides map*.
- **Overrides map,** when the load had one: the overrides table
  (`components/overrides-table.js`), *ref as written* and *file read*, one row
  per reference the map sent elsewhere, then one row per key that matched
  nothing, marked as a problem with the map's target in its words (R4). The
  Build pane will draw its map, of Figma objects, with the same table.
- **Collections it makes:** names and modes, a modifier's and a part axis's
  named as such. Not compared with Figma: that is Sync's.
- **Source:** the files the document came from with **Replace…**, which opens
  the picker (what is picked waits at the top of the pane), and the command
  line's connection.

What the load reported, its collisions and the map's unused keys, is a result,
not a picture: rows in the result surface headed `load` (R2, R14).

### Sync

The state of the design system in this file, and the commands that act on the
whole of it. Needs a document: its tab is inert with nothing loaded. Reading
down:

- **Identity:** a monogram (initials from the first two words, a hue from a
  hash of the name, the one colour computed rather than taken from a token),
  the name, the version the system declares for itself, when this window saw
  it load, the description, and counters for tokens, modifiers and modes,
  styles and kept templates.
- **In this Figma file:** the sync line, `Written by a sync · 43 of 45
  recorded`, and a drift note borrowed from whichever looked last, the plan or
  the Tokens pane, and named (R11). Below it one row per collection the document
  would build: the base collection first, then one per modifier, then one per
  folded part axis, named after the axis (see
  [Parts](./specs.md#parts-axes-from-subgroups-folded-into-modes-or-one-variable-each)).
  A modifier's row says *modifier* after its name and a part axis's says *part
  axis*, from the payload's `modifier` and `axis`; the base collection's says
  nothing more. Each row sits beside what Figma holds of it by name: the modes,
  the variable count (`22 / 23` where Figma has fewer, `0 / 4` and *not in
  Figma* where it has none), and the worst dot of its tokens from the last look,
  or the grey ring when nothing has looked (R16). A last row counts the style
  tokens, grey, since nothing compares styles yet. The label row says when the
  collections were read.
- **Sync:** Variables and Styles, Plan and Execute each; Export with one
  context picker per modifier that has more than one context, each starting at
  the modifier's default and on screen before Export runs (R10), and
  `$extensions`. The pickers come from the document's modifiers; a part axis has
  no picker. Export has not been checked against part collections.

### Tokens

Where each token stands between the document and this file, and how the tokens
point to one another. It describes and navigates; the one thing it changes is
the selection. A standing picture (R15): the header says when it looked, or
"not looked yet", or "looking…" with the busy dot, and offers to look again. It
looks when the pane is opened, not on load.

The header holds the search (path or value), the **Differences** filter and
the look-again button, then the counts: total, drifted, absent, not inspected.

The body is a **browser of columns**, Finder-style. The first column is the
document under its own name, listing the top groups; opening a group opens its
column to the right; a token opens its detail. Columns are 200px; when they do
not fit, the leftmost collapse into **spines**: 22px strips with the name and
count written up them and the worst dot at the foot, one click reopening that
column. Until the person opens something, the browser follows what wants
attention, one group at a time, and opens any group that is alone in its
parent, which is what a search narrowed to one branch wants.

A row: a swatch for a colour (a glyph for anything else), the name, the
default mode's value, the dot. A group row: its count and the worst dot of what
it holds; a group with tokens nothing compared says how many in its band and
its tooltip, never folding them into the quiet ones (R16).

The **detail** opens in place under its row in a narrow window, and as a panel
to the right in a wide one: panel when two columns and 300px of panel fit. It
holds a one-sentence callout when the token is not current, the table
of modes (document beside Figma, swatches, the drifted value in amber), and
the edges: the variable it lives in, what it points to and what points to it
(each a link that moves the browser there), its CSS name,
and how many layers on this page are bound to it. Then **Select bound layers**,
**Copy path**, and the words "revert needs a pin", since putting a value back
needs the pin model, which is not built (R8: no dead button). Narrow, when the
parent column has become a spine, the groups beside the open one are listed
under it.

A token that agrees while something it points to, at any distance, has drifted
carries the amber ring: *drift upstream*.

### Apply

What the selected layers are bound to, and putting a token or a set on a
scope. It follows Figma's selection. The scope control (Selection, Page, File)
chooses the layers, for the rows and for every command in the pane; the token
query chooses the tokens. The query is over tokens, never layer names: the
selection already says which layers.

With nothing selected: one sentence and the scope control. Otherwise a header
naming the layer (or `n layers`, and "built from *file*" when a kept template
built its set), the counts (bound, drifted, plain) and when it was read. Then a
band per layer and a row per field the field table lists for the layer's kind
(`READ_SELECTION_BINDINGS`' `fields`), named as the table names it: the template
glyph when the template's file sets that field, then either the token it is bound
to (a link into Tokens), its swatch, a note (the contexts in which the token
differs, the template that declares it, "yours, not in the file", or the value)
and the dot from the Tokens pane's last look; or *plain* and what it holds. A
value Apply wrote is plain too: Apply writes no stamp, so nothing on the layer
says it came from a token, and the row says only what it can see (R11). A plain
row shows **Bind *token*** when the loaded conventions would bind it: that plans
the one binding and executes it, and both reports go to the result surface (R2).
The pane acts from a standing picture only through the surface, which R15
allows. A property the conventions read that has no field row keeps a row of its
own, so its Bind is not lost. After any run, the pane in front reads its layers
again.

Below the rows, Apply's command group (R3): **Tokens**, a field with every
token's and group's path as suggestions, and under it what the query names (*a
dimension token*, *a group: its tokens reach fields by their last keys*, or
that it names nothing, which holds Plan); **Field**, only for one token, picking
from the fields its type reaches (`applyFieldsFor`), or *by its last key*; the
kinds (Frames, Instances, Component definitions); one line saying that a field
Figma cannot bind takes the token's value in the declared defaults, named (R10),
and that Apply writes no stamp, so on a component a file built what it wrote
reads as drift at the next build; then Plan and Execute on the scope.
**Plan** sends `PLAN_APPLY`; the plan, named `apply plan`, goes to the result
surface, one row per layer and field, each value written in place of a binding
naming its context before Execute.

At the foot, the conventions card: the file and its patterns with **Audit**
and **Replace…** (or **Load…**), then *Bind what the patterns match* and
*Scaffold missing variables, then bind*, each Plan and Execute, on the scope.

### Build

Blueprints and component files kept in this file, what they need, the lock,
and building from them.

**The rows.** A row per kept file, one open in place. A component file's row:
the set glyph, the name, `n members · n axes`, where it is built, and the dot:
red ring when no set is stamped as built from it, grey when it is built but
nothing has compared the set with its file. That comparison does not exist yet
(a dry run could make it, since it plans a patch only where a receipt says so,
but nothing asks), so the row says *not compared* rather than guessing. Open, it
shows the file, the axes, the properties, the token groups and the page it
builds into, then **Plan build** (to the result surface, where its Execute
waits behind *Allow breaking steps on this build* when a step breaks
instances), **Build**, **Replace file…** and **Forget**.

A blueprint's row: the template glyph, its page's name, `blueprint · n
members`, and what its needs come to: `n needs not looked` with the grey ring
before anything looked, then what the last look found, missing ones in red,
`tokens differ` and `would swap` in amber, and a key nothing could check counted
apart as `not checked` (R16). Only a look that found everything says *every need
found*. Open, it says that a blueprint is not built as a whole yet and that each
component builds from its own file; it has no **Plan build** or **Build**, since
a button that can only be refused is not shown (R10's corollary). Then the file,
the page it builds into, and its **needs**, a row each, with **Look up** (later
**Look again**) and when it looked (R15):

- *tokens*: the entry it names, held against what the Load pane loaded by its
  files' names: *loaded*, *not what Load loaded* (with what is), or *not
  loaded*. When the blueprint names a map, the loaded map's hash is said; the
  plugin cannot read the blueprint's map to compare the two.
- *library*: *in the lock*, with who wrote the entry, or *not in the lock*.
- *component*: *found* in this file, *from library* …, *would swap* (found, and
  a stamped instance shows another component now: a relink would change it),
  *by key* (a key, which a look cannot check without importing it), *missing*,
  or *stops a build* (in this file and in a declared library, or in two
  libraries). One a body of the blueprint defines is *a component of this
  blueprint*, which needs no look.

Until a look, each reads *not looked* with the grey ring. A look is
`LOOK_UP_NEEDS`, the locator's dry pass, which imports and writes nothing; a
body whose dry pass stopped is said above the needs, since what it would swap is
then unknown. A blueprint kept again after the look reads *not looked* again.

A missing component offers **Use the selected instance** in its row, with the
library's name in a field beside it, filled with the blueprint's first
`library` line: the plugin cannot read a library's name, so the person says it
before the pick runs (R10). With no single layer selected, the row says to place
one from the assets panel and select it instead of showing a button.

**The lock card**, below the rows: a row per library, its name, who wrote the
entry (*found by discovery*, *written by a build*, *written by the command
line*, *picked by a person*: an event, R11), how many components, styles and
variables it holds, its file key where one is held, and **Forget**. Under them,
**Discover variables** (its rows go to the result surface, headed `discovery`)
and **Plan relink**.

**Plan relink** is a dry build of every kept file through the build entry,
reporting only what a relink would do: an `UPDATE` row per stamped instance it
would swap (R14), a row per file or body it could not plan, and a note per
library the swaps import from, saying that a key imports only once the library
is published and its update accepted here, which the plugin cannot see. Headed
`relink plan` (R6). It has no Execute: a relink is executed by each file's
**Build**, as before.

**The overrides map** for Build, drawn with the table Load's map uses, *name as
written* beside *used instead*, and held in the lock's record. Its editing is
deliberately small: **Remove** at the end of each row, and one row of two fields
and **Add** below. To change an entry, remove it and add it again; the map is
sent whole on each change (`SET_BUILD_OVERRIDES`).

**Add a .kdl file** takes a picked or dropped component file or blueprint; one
that does not read is refused, with every problem in the result surface (R13).
With nothing kept: one sentence and the add chip, and the lock and the map
below them.

---

## The result surface

One row function for every plan type, the audit, and the component report
(R14): a kind column 44px wide (9px mono: `CREATE` green, `UPDATE` and
`PATCH` quiet, `SKIP` amber or grey when the reason is `unchanged`, `BREAK`
and `FAIL` red, `WARN` amber, `NOTE` grey), the path, and the reason on the
right. A path keeps its right end, the leaf: its cell is laid out right to left
so the ellipsis falls at the start (R12). A row reporting a problem has a 2px
gutter, a ground of its tone, and its message whole on a second line (R4).

An `APPLY_TOKEN` is an `UPDATE` row: the layer and the field as its path, then
the token and `bound`, or `value in` the context it is written in; where a field,
or part of it, is written as its value, the plan's line saying so is the row's
message, and the row counts under the *written as a value* chip rather than
*update*.

A person's copy of something Toghen wrote is one row: a variable's or a
style's is a `SKIP` whose reason says whose copy it is and that it was left
alone; a layer's, a member's or a set's is a `NOTE`, as every `LEAVE` is. An
object Toghen wrote that was cut and pasted, whose stamp is written again with
its new id and nothing else, is an `UPDATE` row whose reason reads
`stamp, moved` (a component layer's is its `PATCH` row). A removal that
strips the stamp from a person's copy says so on its own row, as its message:
a `BREAK` row's, or a layer's `UPDATE` row's, `removes "Footer"; its copy
"Footer" (12:3) keeps no stamp`.

A sync plan lists only the tokens it is for (R14): the variable plan draws no row for a token the style plan builds, and the style plan none for a variable's, so a token is one row in one plan. A skip carries its cause in the operation; the screen draws one `SKIP` row per skip and does not group them.

The count chips are **filters**: one press shows only those rows, a second
shows all. They are counted from the rows they filter, so a chip always says
how many it will show. Collapsed, the chips stay in the bar and the source gives
way (R12). Past 200 rows, "…and n more" shows the rest on a click.

The footer says what a command left to say: `7 applied · 1 skipped · 0 failed`
after a run, with the failed operations as rows. `skipped` counts the plan's
skips, the operations whose prerequisite failed and the cancelled ones; the
plan's warnings and notes keep the counts its chips gave them (R14); the progress and **Cancel**
while one runs; and for a build plan the Build pane asked for, its
**Execute**, held while a breaking step is not allowed. A variable plan lists a
breaking step as a row and offers no such checkbox: the screen's Execute never
deletes a mode (see the guide, *A context removed from the document*).

## The drift popover

A drifted or upstream dot anywhere (a Tokens row, an Apply row, the Sync
pane's sync line drift note when one token drifted) opens a 316px popover beside
it: in which modes Figma differs, the table of modes with swatches, why that is
drift rather than a change in the document (or, upstream, which token it points
to does not agree), and three actions at most: **Open in Tokens**, **Select the
n layers** (bound on this page), and *Put the document's value back*, disabled
until the pin model exists. It closes on Escape, on a click outside, and when
the pane in front changes.

---

## The inner design system

The plugin's design system lives in its own package, [`toghen-ui`](https://codeberg.org/Toghen/ui/src/branch/main/specs.md), whose `tokens/` is a Toghen resolver document, and **it is the source of truth**:
this section says what its groups are for, not what each value is. A table of
values here would be a copy of a file a folder away, and the copy loses.

| Group | Property | For |
|---|---|---|
| `bg` | `--tg-bg-base`, `-card`, `-raised`, `-sunken`, `-hover`, `-selected` | the grey ground, a card, buttons and popovers, inputs and spines and an open row, hover, the chosen column item |
| `line` | `--tg-line-1`, `--tg-line-strong` | hairlines between rows; control borders and region edges |
| `text` | `--tg-text-1`, `-2`, `-3`, `-on-accent` | names and values; labels; times, counts and the disabled |
| `accent` | `--tg-accent-bg`, `--tg-accent-text` | the active tab and the one primary button; links |
| `status` | `--tg-status-ok`, `-warn-dot/-text/-bg`, `-err-dot/-text/-bg`, `-info-bg` | each tone in three: the mark, its words, its ground. Green is never an all-clear |
| `swatch`, `shadow` | `--tg-swatch-edge`, `--tg-shadow-pop` | a swatch's edge in either theme; the popover's lift |
| `font`, `fs`, `lh` | `--tg-font-ui`, `--tg-font-code`, `--tg-fs-1…5`, `--tg-lh-normal`, `--tg-lh-tight` | Geist for words, Geist Mono for every path, value and name |
| `sp`, `h`, `w`, `r` | `--tg-sp-1…6`, `--tg-h-*`, `--tg-w-spine`, `--tg-w-kind`, `--tg-r-1…3` | spacing on a base of 4; the heights of tabs, rows, controls and bars; the spine and the kind column; radii for chips, controls, cards |

Everything sits under one group, `tg`, so lib's `cssPropertyName` writes
`--tg-…`. A token and a group cannot share a path, which is why the design's
`--tg-text` is `--tg-text-1`, `--tg-line` is `--tg-line-1`, `--tg-accent` is
`--tg-accent-bg`, and the design's short status names are `--tg-status-…`.
Colours are structured `{ colorSpace, components, alpha }`, dimensions
`{ value, unit }`, the faces `fontFamily` lists, the popover's shadow a
two-layer `shadow`. Weights are not tokens; 400, 500 and 600 are written in the
stylesheet. Nothing the token document names is hard-coded in CSS.

`base.tokens.json` holds what does not vary (the accent, the faces, the sizes);
`theme.light.tokens.json` and `theme.dark.tokens.json` hold the colours that do.
The modifier spells each context as `.figma-{context}, [data-theme='{context}']`,
so `@toghen contexts` in `src/tokens.css` writes both blocks; the preview page
sets `data-theme` or Figma's class by hand. `@toghen mixins` in `src/index.css`
writes one mixin per group, named by its path (`tg.button` gives `--tg-button`).
Each component applies its group's mixin in its own rule with `@apply`, and the
group's parts come with it, nested.

### The build step

Two builds make the stylesheet. The build of [`toghen-ui`](https://codeberg.org/Toghen/ui/src/branch/main/specs.md)
(`scripts/build.mjs`) writes `dist/toghen-ui.css`. It loads the resolver document
with lib's `load`, resolves every context with `resolveContextsToDesignSystem()`,
and inlines the layer imports of `src/index.css`. Then one PostCSS pipeline: Toghen
writes the token layer and the mixins (`onUnresolved: 'throw'`, so a broken reference
fails the build), and the mixins polyfill, listed after it, expands each `@apply`. Nesting stays
native. The fonts are spliced in as data URIs from the `geist` package.

This package's `build.mjs` reads that file and puts it in the window's one
`<style>`, before `ui/styles.css`. Nothing generated is committed.
`toghen-ui/test/build.test.ts` reads the written CSS, since the build cannot see a
value that resolves and serialises badly.

### What the fonts cost

Each family is one variable woff2 from the `geist` package, which covers the
three weights the screen uses. The package ships the full files and no Latin
subset, and cutting one at build time would need a font tool the repository
does not have; the two full files are 116.6 kB together, inside the 250 kB this
was allowed.

Measured on 8 October 2026: `dist/ui.html` was 94.9 kB before the fonts and the
token build. After the token build and the fonts it was 254.2 kB, of which
155.5 kB is the two fonts as base64. With the four panes and the window switch built it is 314.4 kB,
158.9 kB without the fonts. `code.js` embeds the page, so it grows by the same.

---

## Vocabularies

### Dots

Six, and silence. 6px, filled or a 1.5px ring; `<tg-dot state="…">`.

| state | looks | means |
|---|---|---|
| `none` | nothing | looked, and agrees. Clean is silence |
| `drifted` | amber, filled | the Figma value differs from the document's |
| `upstream` | amber ring | agrees, but what it points to does not |
| `absent` | red ring | not in Figma |
| `unread` | grey ring | nothing has looked |
| `connected` | green, filled | the command line is paired (status bar and Source card only) |
| `busy` | accent, filled | something is running or being read |

A group's or a collection's dot is the worst of what it holds, drift first:
a drifted value is someone's edit a sync would not take, an absent one is work
a sync will do. A drifted or upstream dot that names a token opens the drift
popover.

### Glyphs

One shape per kind of thing, 16-unit viewBox, 1.5 stroke, `currentColor`, in
`ui/glyphs.js`: `token`, `variable`, `collection` (also the design system),
`mode`, `style`, `group`, `set`, `layer`, `template` (also "declared by the
file"), `sheet`, `command-line`, `conventions`, `look-again`, `search`, `info`,
`warning`, `engine`. A counter is a glyph and a number. What a control does
(chevrons, close, upload, export, add, the window switch) is an action icon, in
`ui/icons.js`.

---

## Components

Light-DOM custom elements, no shadow root, no framework, no runtime dependency.
Leaves take attributes; containers take the whole state through a `state`
setter and draw from template strings (`escHtml`, `escAttr`). A container
replaces its markup only when the string changed, and carries across what a
person typed, ticked and where the caret was, by id (`TgElement.patch`); an
input whose value the state owns says so with `data-controlled`. Listeners are
delegated, because rows are replaced on every change that matters.

| Element or helper | File | What it draws |
|---|---|---|
| `tg-dot` | `components/leaves.js` | a dot, labelled for a screen reader |
| `tg-glyph` | `components/leaves.js` | a glyph by name |
| `tg-chip`, `chip()` | `components/leaves.js` | a counter, 20px or 18px, `plain`, `warn`, `err`, `ok`; `mono` for the result surface's filters |
| `tg-callout`, `callout()` | `components/leaves.js` | icon, title, one line, one action; `small` inside a row's detail |
| `tg-card`, `card()` | `components/leaves.js` | a card on the grey ground under a label, with an optional time |
| `tg-tabs` | `components/tabs.js` | the strip |
| `tg-pane-load`, `-sync`, `-tokens`, `-apply`, `-build` | `components/pane-*.js` | the panes |
| `overridesTable()` | `components/overrides-table.js` | an overrides map as used: a name as written beside what was used instead, and the keys that matched nothing; Load's files, and Build's Figma objects with a Remove per row (`removable`) |
| `tg-results` | `components/results.js` | the result surface; `resultView(state)` is what it shows |
| `tg-status-bar` | `components/status-bar.js` | the status bar and the window switch |
| `tg-popover` | `components/popover.js` | the drift popover |

---

## State

`ui/state.js` keeps one object; `setState(patch)` merges and renders,
`showResults(source, patch)` replaces what the surface shows and opens it.
`null` is never "fine": `syncState: null` is "not asked yet", `inspection:
null` is "nobody has looked", `templates: null` is "not read yet", and each is
drawn as such.

```javascript
{
  // The document, from DOCUMENT_LOADED / DOCUMENT_STATE
  documentLoaded, documentName, documentDescription, documentVersion,
  tokenCount, styleCount, modifiers, modes, modifierDefaults, defaultMode,
  docCollections,          // what a variable sync would build
  fileName, loadedAt,      // loadedAt only when this window saw the load
  composition,             // what the load read and how; the Load pane's picture
  loadPick, loadOverrides, // picked and not loaded yet: the files, entry, form, name; the map
  syncState, recents,
  figmaCollections, collectionsAt,

  // Tokens
  tokenGraph,              // TOKEN_GRAPH: values and edges
  inspection, inspecting,  // CORRESPONDENCE: where each token stands
  tokensTrail,             // the open columns; null follows attention
  tokensQuery, inspectOpenPath, inspectOnlyDifferences,
  boundLayers,             // variable name → BOUND_LAYERS; null while asked

  // Apply
  selectionScope, selectionBindings, selectionReading, pendingBind,
  applyTokens, applyField, applyKinds,  // the token query, the field for one token, the kinds
  conventionsLoaded, conventionCount, conventionsFileName, auditResult,

  // Build
  templates, templatesOpen, pendingBuild,
  lock,                    // LOCK: the libraries and Build's overrides map
  needs, needsLooking,     // NEEDS by blueprint name; no entry is "not looked"


  // Commands and the result surface
  status, plan, planAt, progress, lastResult, componentResult,
  resultsSource, resultsOrigin, resultsAt, resultsCollapsed,
  resultsFilter, resultsShowAll, resultsExecute, allowBreaking,

  commandLine,             // { phase, at }: an observed event
  popover,                 // { path, x, y, panel } or null
  windowMode,              // 'narrow' | 'wide', from WINDOW_MODE
  activePanel, errorMessage, selection,
}
```

---

## The preview page

`ui/dev/preview.html`, served by `scripts/preview.mjs` (`pnpm --filter
@toghen/figma preview`, after a build), is how the screen is checked; there is
no test runner for the UI. It holds the built `dist/ui.html` in an iframe, a
theme switch that sets `figma-light` or `figma-dark` on the iframe's `<html>`
as Figma does, the two window sizes and the 320px minimum, and fixture buttons that post messages
shaped as `shared/protocol.ts` says: nothing loaded, a synthetic design system
loaded with a sync's stamps and two drifted tokens (a resolver document whose
overrides map sent one file elsewhere and has one key that matched nothing, and
a folded part axis among its collections), two token files loaded as one
collection, a correspondence picture, a
selection with bound, drifted and plain fields (one holding a value Apply wrote), an
apply plan (bound rows, a colour's alpha and an `x` written as values naming
their context, a skip), four kept templates and a
blueprint, the Build pane (the blueprint's needs in every state, and a lock of
two libraries with an overrides map), a relink plan, and a build plan with a
breaking step. It also plays the main thread: the commands
the screen sends are answered from the same fixtures, so a Load (token files when a name is sent), a recent (from its bundle), Plan and Execute (Apply's included: one token on `x`, `y` or `cornerSmoothing` is written as its value), a
Bind, a build plan, a look at needs, a pick, Forget, the overrides map, Discover, Plan relink and the window switch round-trip. `window.preview` drives it
from a script. Nothing of it ships.

---

## File reference

| File | Role |
|---|---|
| `ui/ui.html` | The shell's elements, with `INJECT_CSS` / `INJECT_JS` placeholders |
| `ui/tokens.css` | The `@toghen contexts` directive and the `@font-face` rules |
| `ui/styles.css` | Every rule, reading only `--tg-*` properties |
| `ui/main.js` | Entry: answers from the main thread → state, and the first requests |
| `ui/state.js` | The store |
| `ui/render.js` | Hands the state to each element; which pane is in front |
| `ui/format.js` | Dates, counts, escaping, the monogram |
| `ui/glyphs.js`, `ui/icons.js` | Entity glyphs; action icons |
| `ui/inspect.js` | Asking for a look, and the document's graph, when Tokens is in front |
| `ui/components/` | The elements, above |
| `ui/commandBus.js` | The message bridge to the main thread, and who sent the running command |
| `ui/bridge.js` | The socket to the command line |
| `ui/shell.js` | The window grip and the result surface's splitter |
| `ui/dev/` | The preview page and its fixtures; not shipped |
