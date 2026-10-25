# @toghen/figma — User guide

> How to install, configure and use the Toghen Figma plugin, the component files it builds sets from, and the `toghen-figma` command line that drives it from a repository.
> For the API surface, see [reference.md](./reference.md). For the format of a component file, [component-files.md](./component-files.md). For why it is built this way, [specs.md](./specs.md). For the component model that parts follow, see [the model](https://codeberg.org/Toghen/lib/src/branch/main/model.md).

---

## What this package does

A design token document, resolved through `@toghen/lib`, becomes a Figma file's Variables and Styles; a component file in the design system's repository becomes a component set in the same file; and both are kept in step by running again, which changes only the difference. Three pieces do it:

- **The plugin** runs in the Figma desktop app. On its screen it loads a resolver document, plans and executes a **variable sync** (one collection per modifier, a mode per context) and a **style sync** (text, effect and paint styles from composite tokens), shows where every **token** stands between the document and the file, shows what the **selected layers** are bound to, **exports** one mode as a DTCG token file, keeps **component files** in the Figma file and builds from them, and, from a conventions file, **audits** and **binds** variables to nodes by pattern.
- **Component files** (`<component>.component.kdl`) say what each component is: its properties, its layers, what differs per variant. Toghen expands one into a set, builds it **stamped** (every node it makes carries a mark in plugin data saying which part of the file it is), and on the next run reconciles the set in place, finding its own work by the stamps.
- **The command line**, `toghen-figma`, pairs with the open plugin over a local socket and runs the whole job from an npm script: read and check everything, sync variables, sync styles, run each component file. It only carries files: the plugin reads, checks and builds them, the same way it builds a component file kept on its screen.

The plugin is a *consumer* of resolver documents. It never reconstructs a token document from Figma.

---

## From the repository to Figma

The drill, from a fresh checkout to a synced file. The rest of this guide explains each step; this is the order.

### 1. Build the plugin

```sh
pnpm install
pnpm --filter @toghen/figma build
```

Put a current Node first on `PATH` before this (the repository is developed on 25; a shell that resolves `node` to an old version fails without saying why). The build writes `dist/`, which is not tracked: `code.js` (the main thread, with the component engine and kdlet's evaluator bundled in), `ui.html` (the screen, with its CSS and JavaScript inlined) and `manifest.json` (the root manifest with `main` and `ui` pointed at the two files beside it). `build:watch` rebuilds on every change; after a rebuild, close and reopen the plugin in Figma, or re-import the manifest if it was renamed.

### 2. Import it into Figma

In the Figma desktop app: **Plugins → Development → Import plugin from manifest…**, and pick `toghen-figma/dist/manifest.json`. The plugin appears under Development as **Toghen**. The command line was measured in the desktop app only; whether the browser app allows the socket is not known.

### 3. Put the runs in the repository's scripts

In the design system's own repository, which depends on `@toghen/figma` (`pnpm add -D @toghen/figma`):

```json
"scripts": {
  "figma:check": "toghen-figma sync tokens/ds.resolver.json components/button.component.kdl --dry-run",
  "figma:sync": "toghen-figma sync tokens/ds.resolver.json components/button.component.kdl"
}
```

The plugin and the command line must come from the same version of the package, the plugin imported from its `manifest.json`: the component header, the group plans and the packed document they exchange have no version check between them.

### 4. Open the target file and run the plugin

Open the file in the desktop app and run **Toghen**. With nothing loaded, the Load pane shows one way in, a row to drop a resolver document or token files on or choose them, and the Source card at its foot, where the command line connects.

### 5. Dry run, then real run

```sh
pnpm figma:check
```

The command reads the resolver document, the token files it names and every component file, and checks them before anything is sent: a token or text style a component file names that the design system does not define is reported with its file, line and column, and nothing is sent. Then it prints a pairing code and waits.

In the plugin, type the code into the Source card at the foot of the Load pane and press **Connect**; the status bar then shows a green dot and the time. The command then plans the variables, plans the styles, and dry-runs each component, printing each plan; the plugin's result surface shows the same, headed *from the command line*. Read the plan: what is created, what is skipped, what is drifted, and above all what is **breaking** (a member removed, a property removed or retyped, a removed context's mode). Then:

```sh
pnpm figma:sync
```

The pairing lasts until the plugin is closed, so the real run finds the plugin by itself. A run that would take a breaking step stops before its first write and lists them; pass `--allow-breaking` to take them. Exit code 0 when every step succeeded, 1 when a check failed, Figma refused a step, or the plugin went away.

---

## Find your way around the screen

The plugin runs in a resizable window with five panes on a tab strip, one shared **result surface** below them where every command's plan, progress and outcome appear, and a one-line status bar. What each area is for, and the rules that hold it, are in [ux-map.md](./ux-map.md) and [ux-rulebook.md](./ux-rulebook.md); the screen itself is described in [ui.md](./ui.md).

| Pane | What it is for |
|---|---|
| **Load** | What the design system is made of. With nothing loaded, drop a resolver document or token files on it, choose them or a folder, or click one you loaded before; if the file was synced before, it says from which document and when. Once loaded, it shows the files the load read, the overrides map as a table, the collections the document makes, and the Source card: where the document came from, and the command line's connection |
| **Sync** | The design system in this file, once one is loaded: what the document would build in Figma beside what the file holds, collection by collection, and the Sync and Export commands. Its tab is greyed out with nothing loaded |
| **Tokens** | Where every token stands. Columns open group by group; click a token to see its value in each mode beside Figma's, what it points to, what uses it, and how many layers on this page are bound to it. **Differences** shows only what wants a look, and the round arrow looks again |
| **Apply** | What the layers you select are bound to, field by field, and putting a token or a group on them (see [Apply a token or a group](#apply-a-token-or-a-group)). **Selection**, **Page** and **File** change what it reads and writes. A field the conventions would bind shows **Bind**, which binds it in one step. The conventions file and its commands are in the card at the foot |
| **Build** | Blueprints and component files kept in this Figma file, what they need, the lock, and building from them (see [Keeping a component file in the Figma file](#keeping-a-component-file-in-the-figma-file) and [Build from a library](#build-from-a-library)) |

**A drifted dot** (amber) anywhere opens a small card saying in which modes Figma differs and why, with **Open in Tokens** and **Select the layers**. An amber ring means the token agrees but something it points to does not.

**Results** at the bottom shows what the last command produced, from any pane. Its counts are filters: click `2 drifted` to see only those rows, click again for all. Drag its top edge to make it taller, click its bar to fold it.

**The window has two sizes.** The button at the right of the status bar switches between a narrow window and a wide one; in the wide one the Tokens pane shows its detail beside the columns. Drag the bottom-right corner to resize, and the size you leave is remembered for that width. The screen follows Figma's light or dark theme.

---

## Load a token document

1. Open the plugin (**Plugins → Development → Toghen**).
2. On the **Load** pane, drop your `.resolver.json` and the files it reads, or one or more token files (`.tokens.json`), on the dashed row, or press **Choose…**; or press **Choose a folder…** and pick the folder that holds them. There is no paste box: the plugin reads files you give it, and a command-line run loads the document itself.
3. The picked files wait in a **To load** card, which says which file is the entry. Check the collection's name (token files only), add an overrides map if you have one, and press **Load**.
4. The pane shows what the load read; the **Sync** pane shows the document's name, its root `description`, its token count and its modes, named.

The plugin loads what you pick with the core's `load`, as the command line does. **Which file is the entry:** the first picked file named `.resolver.json`, or whose top level has `resolutionOrder`, is a resolver document, and the other files are there for its `$ref`s. With none, every picked file is a **token file**, and together, in the order picked (a folder's in the order of their paths), they make one collection, a later file winning where two give a token a value. The collection's name is in a field before Load runs: a folder's name, or the first file's name without its extensions (`brand.tokens.json` gives `brand`); change it there. A file that is neither, a JSON list say, is refused in the core's words, naming the file and what it is not.

**A folder keeps its paths.** Picked as a folder, each file is known by its path inside the folder (`tokens/primitives.tokens.json`), so a resolver document whose sources point to sibling folders (`{ "$ref": "./tokens/primitives.tokens.json" }`) loads as it does from the command line. Picked one by one, files are known by their names alone, so only references to files beside the entry resolve. Only `.json` files are taken from a folder.

**An overrides map** is a JSON file you pick beside the others: one object, each key a `$ref` as written, each value the file to read instead. Once loaded, the Load pane draws it as a table, *ref as written* beside *file read*, with every key that matched no reference as a row of its own, marked in amber.

**What a load reports.** When two sources of one set, or of one modifier context, both give a token a value, the last wins, and the Results surface says so under the heading `load`, one row each: a warning when the values differ, since the earlier one is lost, and a quiet note when they are equal as written. A key of an overrides map that matched no reference is a warning row too. A load with nothing to report leaves Results empty.

Once loaded, the plugin holds a resolved `DesignSystem` in memory, ready for sync and export. The Load pane lists the form and the entry, every file the load read, the overrides map, and the collections the document makes; the Source card at its foot names the files the document came from, with **Replace…**. On the Sync pane, below the header, the sync line says what *this file* holds of a sync: whether a sync wrote here, and how many of the document's tokens its stamps cover. Under it, one row per collection the document would build (the base collection, one per modifier and one per folded part axis, each of the last two named as such) against what the file holds, so you see before planning what a sync would touch.

**Every modifier needs a default.** The plugin holds the document as the sum: the defaults, then each context on its own, never every combination, so a document with many modifiers loads in seconds. That needs a default context in each modifier; a document with a modifier that declares none is refused, naming it.

**Recents.** With nothing loaded, the design systems you loaded before are listed by the system's name and the version it declares, with their token count and modes. Each row reloads its stored bundle, the document the load made with every file it read already inlined, since a plugin cannot re-read a file from disk; what the load read is kept beside it, and the Load pane says the document came from the bundle. A document a command-line run loads joins the list too. If the file was synced before, the empty state also says from which document and when.

**Tokens in several files.** Pick the folder, or the entry and the files it reads together; the command line sends the plugin every file the document reaches by itself. See the lib guide, *Tokens in several files*.

---

## Sync variables

Sync variables maps your design tokens to Figma Variable Collections the way a Figma file models them by hand: a **base collection** for what no modifier changes, and **one collection per modifier**, with a mode per context. This is the **sum** of the document's contexts, as against the product, one collection with a mode per combination. A frame sets a mode per collection, and everything inside it inherits each one independently, so a theme on a page and a density on a panel inside it combine in Figma as they do in CSS.

### Run a variable sync

1. Load a document.
2. On the **Sync** pane, press **Plan** beside **Variables**. The plugin compares your tokens against the file's collections and variables and shows the plan in Results: how many collections, modes and variables it would create or update, what it would skip, and any warning.
3. Review it. *Plan* touches nothing; it is the safe look, and there is no separate dry run because Plan already is one. It also reports any operation referring to something no other operation in the plan creates, so a plan that could not hold together says so before you execute it.
4. Press **Execute** beside it. The plan is applied with progress reporting.

### How it works

- **The base collection** is named after the document (`ds`) and has one mode, `default`. It holds primitives and every token that changes only through a reference.
- **Each modifier gets a collection** named after it (`theme`, `density`), with one mode per context, named after the context. The default context is created first, because Figma's default mode is always the first one and cannot be reassigned afterwards. The mode limit applies per modifier, not to every combination of them.
- **Part axes get collections too.** An axis that folds has a collection named after it, with `rest` and the part keys as its modes. See [Choose how parts become variables](#choose-how-parts-become-variables).
- **Each token lives in one collection.** A token one modifier changes lives in that modifier's collection; where a context does not change it, the mode holds the base value. A token that only refers to a changing one stays in the base collection as an alias, and Figma resolves it where it is used.
- **A token two modifiers change is a chain of aliases.** It lives in the later modifier's collection; where that modifier says nothing, it aliases a link variable in the earlier modifier's collection, named `<path>--<modifier>` (`tone/alert--scheme`).
- **Refused, never guessed:** a combination where a token has no value, a token whose type changes between contexts, and a token whose context changes only part of a composite are reported, and not written.
- **Names have no collection prefix.** A variable is named by its token path, `/` between groups (`button/backgroundColor`), in the collection that is its home. Text and effect styles are named the same way.
- **Code syntax is written.** Each variable carries its CSS name as its web code syntax, the string Figma's Dev Mode shows a developer beside the variable: `var(--button-background-color)`, the name `@toghen/postcss` writes. Only the web platform is written.
- Tokens are mapped to variables by type (colours to COLOR, dimensions and numbers to FLOAT, strings to STRING, booleans to BOOLEAN).
- Each variable and style the sync writes carries a **stamp**: the token it holds, and a hash of what Figma reported right after each write. That makes **dirty-checking** per mode: editing only your dark value re-syncs only the dark value. A variable renamed in Figma is still found by its stamp, and renamed back.
- The stamps live on the objects in the Figma file, so they survive closing the plugin. Export writes them to `$extensions['com.toghen.figma']` for reading; loading a document never reads them back, since a Figma file's ids mean nothing in another file.
- A file synced by an older version holds its record on the document root instead. The first load of a document turns it into stamps and deletes it. Where Figma holds the document's value, that is taken as written. Where it does not, the first plan reports drift and keeps Figma's value, whether a designer edited it before the upgrade or the document moved since the last sync; pass `--overwrite-drift` to write the document's value.

### References become aliases

A token whose whole value is a reference, `"$value": "{color.brand}"`, becomes a Figma variable **aliased** to the variable of the token it names, not one holding a copy of its colour. In Figma the variable shows the other variable as its value, and changing `color/brand` changes it too.

- The plan writes the alias after the variable it points at is created, and the Tokens pane shows it as `→ <variable name>`.
- A variable you aliased by hand to the same target agrees with the document instead of reading as drifted.
- Where Figma cannot alias, because the two tokens become different variable types, the plan writes the value and says why in a warning.
- A reference inside a composite, such as a typography token's `fontSize`, becomes a binding on the style instead; see *Members become bindings* under Style sync.

### A value only CSS can hold

Some values mean something in CSS and nothing in Figma: `currentColor`, a neutral tone's text that follows the text around it, or `inherit`. Figma has no inheritance, and a variable needs a value in every mode, so the plugin skips such a token whole and a component file binding it is refused. Say what Figma should use in its place, on the token or on that context's definition of it:

```json
"text": { "$type": "color", "$value": "currentColor",
  "$extensions": { "com.toghen": { "figma": { "value": "{text.primary}" } } } }
```

CSS keeps writing `currentColor`; Figma writes an alias to `text/primary`. The reference must exist and be of the token's own type, and a token with no `$type` (`inherit` is stored as written) names a reference. Put the key only on the definitions that need it: a tone that has a real colour needs none, and a key on a value Figma can hold is refused, so that the CSS value stays the one both outputs write. The key reads in variable sync, not in styles.

A component's token that is only a reference to that role, `"chip": { "color": { "$value": "{t.text}" } }`, needs no key of its own: it becomes an alias of the role's variable, in every mode, so a chip placed in a frame set to another tone turns with it. A key on such a reference is an error telling you to remove it. A reference to a role that has no key and still is `currentColor` is skipped with the usual message.

### Which fields a variable is offered to

Every variable gets **scopes**: the Figma fields whose picker lists it. A designer picking a fill sees colours, picking a gap sees spacing, and nothing else. The plugin works out what each token is for, and you rarely need to say it.

- **By name.** A component's tokens are named by CSS property, and the last key says the field: `button.backgroundColor` is offered to frame and shape fills, `button.color` to text fill, `button.borderColor` to strokes, `button.borderWidth` to stroke width, `button.borderRadius` to corner radius, `button.gap` and the paddings to gap, `button.width` and the sizes to width and height, `button.opacity` to opacity. It is the same table *Bindings from the tokens* uses.
- **By what refers to it.** A primitive has no such name. It is offered to whatever the tokens that refer to it are: `color.blue.500`, used by one background and one border, appears in fill and stroke pickers. A reference from inside a typography, shadow or border token counts as its member's field: a `fontSize` member makes its target a font size.
- **By type, last.** A token nothing reaches is scoped by its `$type`: a colour to fills, strokes and effects, a dimension to gap, size, radius and stroke width. A string or a boolean stays offered everywhere, and the plan lists those once in a note so you can narrow them.

To say it yourself, declare the list on the token or on a group, in Figma's own scope names. The nearest one wins, so one line covers a whole branch:

```json
"opacity": {
  "$extensions": { "com.toghen": { "figma": { "scopes": [] } } },
  "half": { "$type": "number", "$value": 0.55 }
}
```

An empty list hides the variables from every picker, which is how you keep primitives out of a designer's way: they still work as alias targets. Toghen hides nothing unless you say so. A list Figma would refuse is refused first, naming the token: a scope that does not suit the variable's type (a fill on a number), `ALL_SCOPES` or `ALL_FILLS` beside the scopes they already cover, a name Figma does not have, `OPACITY` beside any other scope, or `COLOR_OPACITY`, whose unit has not been measured.

### An opacity is a percentage in Figma

CSS writes an opacity from 0 to 1. Figma reads a variable bound to a layer's opacity as a percentage, so a variable holding `1` draws the layer at 1%. The plugin writes an opacity × 100: `button.opacity` at `1` becomes `100`, `opacity.half` at `0.55` becomes `55`.

A token is an opacity when its last key is `opacity`, when its list is `["OPACITY"]`, or when an opacity refers to it and nothing else does. The type never decides: a bare `number` is written as it is and kept out of the opacity picker. A token hidden with `[]` is still an opacity if its name or its referrers make it one, so a hidden `opacity.half` holds `55` and `button.opacity` stays an alias to it.

- An opacity must be a number from 0 to 1. A token holding `55`, already a percentage, is skipped and named, never guessed.
- A primitive used both by an opacity and by something else cannot hold two units. It stays plain, and the opacity is written as its own value with a warning instead of an alias.
- A component file that binds `opacity` to a token that is not an opacity is refused, and so is one that binds an opacity to another field. A token bound to a field outside its scopes still draws, since scopes only filter the pickers; the run report notes it.
- A literal `opacity=(literal)0.8` in a component file stays `0.8`: a layer's own opacity is 0 to 1.

Scopes you change by hand in Figma are kept, as drifted values are: see [Drift](#drift). A file synced before scopes existed has every variable at all scopes; the next run narrows those, and only those.

### Drift

The plugin reads Figma's current values and compares them with the stamp of what it wrote. If someone has changed a variable or a style by hand since the last sync, the plan says so and **leaves it alone** rather than quietly restoring the token value, even where the document changed too: the row reads `SKIP — drifted` with a message naming the modes, or the style's fields, that moved.

To take the design system's side, run the command line with `--overwrite-drift`: every drifted value and style is written with the document's, and stamped. Run it with `--dry-run` first to see which. It is all or nothing, and the plugin's screen does not offer it.

**Duplicating something Toghen made** gives you a copy that is yours: a copy of a variable, a style, a set, a member or a layer carries the original's stamp, but the stamp names the original's id, so the plugin leaves the copy alone and lists it, `a copy of Toghen's "color/label", left alone`, and keeps updating the original. Cut and paste moves the original: the one left is still Toghen's, and the next run writes its stamp again. When a run removes the original, your copy loses the stamp in the same run and is simply yours from then on; the removal's row says `its copy "color/label copy" (VariableID:1:9) keeps no stamp`.

A value counts as drifted only on a variable or style stamped for its token. One the sync found by name, or a mode Figma holds no value in, is written, not protected.

Scopes follow the same rule. Scopes changed in Figma since the last sync are kept and reported, and `--overwrite-drift` writes the document's. A variable the sync made before it stamped scopes is narrowed only if it still holds what older versions wrote, all scopes (or letter spacing for a letter spacing); anything else counts as yours.

This holds whether or not the JSON changed too. The stamp records what Figma reported right after the write, so a hand edit is seen even where the document has moved since: it is kept and reported as drift, not overwritten by the new value. A value Figma moved to exactly what the document now asks for is not drift either: the next sync stamps it again, with no visible change. Component and artboard fields follow the same rule.

### The mode limit, and the contexts Figma gets

Figma limits a collection's modes by plan, and Toghen fixes the limit at **10** for everyone, so that no feature belongs to a bigger plan. A modifier with more contexts stops the plan, dry run included, before anything is written:

```
"theme" has 14 contexts for Figma and Figma allows 10 modes per collection; keep at most 10 of them in figma.include.
```

Say which contexts Figma gets in the modifier, beside its CSS spelling. CSS keeps writing every context:

```json
"theme": { …, "$extensions": { "com.toghen": {
  "css": { "selector": "[data-theme='{context}']" },
  "figma": { "include": ["light", "dark"] } } } }
```

- The default context must be in the list. The modes keep the document's order.
- A context added to the document later is not in Figma until you list it; a context taken out of the list is a mode removed, a breaking step that needs `--allow-breaking`.
- A token's value in a context Figma does not get is not written. A component file's axis from this modifier has only the listed contexts, and naming another is an error with the line.

### Files synced before collections per modifier

Earlier versions built one collection with a mode per combination of contexts. A collection with the base collection's name that holds such modes is reported as built by an earlier sync and **never written to**: the plan stops before writing anything, and a command-line run stops there too, before styles and components. Rename or remove it to sync into the new layout. Moving a file's bindings over to the new collections is not automated.

A modifier with no `default` cannot be built this way: the plan says so and writes nothing.

### A context removed from the document

Remove a context, say `dark` from `theme`, and its mode in Figma has nothing left to hold. Deleting it loses its values, and a frame or variant pinned to it falls back to the default mode, so it is treated like deleting a component member: a **breaking** step.

- **Plan** lists it as breaking, with the mode and the collection.
- **Execute** from the plugin's screen never deletes it; the mode stays until the command line takes it.
- **The command line** stops a real run before writing anything and lists it, unless you pass `--allow-breaking`; with it, the mode is deleted after every other value is written.

A modifier's **default** context is never deleted this way: Figma fixes a collection's default mode when it is created, so a removed default is reported and that collection is left alone. Removing a whole modifier leaves its collection in place, reported.

### Cancelling

During execution, press **Cancel** to abort the active operation. Already-completed operations are preserved, and so is the plan: press **Plan** again and it will contain exactly what did not land.

---

## Sync styles

Sync styles creates Figma Styles from composite token types.

| Token type | Figma style |
|---|---|
| `typography` | Text style |
| `shadow` | Effect style |
| `gradient` | Paint style |

### Run a style sync

1. Load a document.
2. On the **Sync** pane, press **Plan** beside **Styles**, and review the plan.
3. Press **Execute** beside it. The plugin preloads the fonts a text style needs, then creates or updates the styles.

Figma styles have no modes. A style is therefore built from your document's **default** mode, and the plan warns which modes are not represented; use variables for anything that has to change per mode.

### Members become bindings

A typography or shadow member that references a token, `"fontSize": "{font.size.md}"` or a shadow layer's `"color": "{color.shade}"`, becomes a **binding** on the style: in Figma the field shows the variable rather than a number, and follows it, including its modes, which the style alone cannot have.

- The variable has to exist first, so run variable sync, then style sync. Until then the plan writes the value and says so in a warning.
- A member whose variable would mean something else in that field keeps its value, without a warning: a unitless line height, an `em` or `%` letter spacing. A `letterSpacing` token in `em` has no variable for the same reason (a variable bound to letter spacing carries pixels), so the text style takes its percentage and nothing is bound; one in `px` or `rem` is a variable and binds.
- A font stack binds through its first family, which is what its variable holds. A style that had to take a later family (see below) leaves its family unbound and binds the other members.
- Gradient stops are not bound.

### A font stack is a fallback

A stack such as `["ui-monospace", "Menlo", "monospace"]` is CSS's way to say "the first of these the platform has". A text style takes **the first family Figma can load, with the style asked for**: the generic names (`monospace`, `serif`, `sans-serif`, `cursive`, `fantasy`, `system-ui`, `ui-monospace`, `ui-sans-serif`, `ui-serif`, `ui-rounded`) are passed over without a lookup, and the plan says what it passed over: `"ds.txt.code.sm" uses "Menlo": "ui-monospace" and "SFMono-Regular" are not available in Figma.` The choice depends on which fonts the machine running the plugin has, as CSS's does, and the drift check is not affected.

- A style none of whose families loads is skipped with its reason, and the rest of the run goes on. The dry run reports these before a real run, so `figma:check` catches them.
- Match is exact: a family name is looked up as written, in its case.
- The `fontFamily` variable keeps the stack's first family, so a style that fell back leaves its family unbound.

---

## See where the tokens stand

The **Tokens** pane is a standing picture of where each token stands between the document and this file, read from Figma when the pane is first opened and again when you press the round arrow, after a document is loaded, and after a sync changes the file. It says when it looked, so that a picture is never mistaken for a live claim.

The pane is a browser of columns, one per open group: click a group to open the next column, and a column that no longer fits folds into a strip at the left that reopens on a click. Click a token to see, per mode, the document's value and Figma's, rendered alike so they compare, and beside them what the token points to, what points to it, and how many layers on this page are bound to it. In the wide window the detail sits beside the columns. Each token carries a dot for its state:

| State | Meaning |
|---|---|
| `current` | Figma holds the document's value in every mode the token declares |
| `drifted` | They differ, and the stamp proves Figma changed since the sync wrote it: the change was made in Figma |
| `outdated` | They differ, and Figma still holds what the sync wrote: the *document* has moved |
| `absent` | No Figma variable holds this token |
| `adopted` | A variable of this name and type exists that Toghen did not write |
| `blocked` | A type that varies by mode, a type no variable can hold, or a name taken by a variable of the wrong type |
| `not_inspected` | Backed by a Figma style, which is not compared yet; shown rather than omitted, so the counts reconcile |

**Differences** hides the `current` rows. The pane describes and navigates; the one thing it changes is the selection, through **Select the layers** in a drifted token's card. Reverting a drifted token is not built, since it needs the pin model's recorded values, and its button shows disabled until then. The sync line on the Sync pane takes the more recent of the last plan and the last look for its drift count, and names which.

---

## Export tokens

1. Load a document.
2. In **Export** on the Sync pane, pick a context for each modifier that has more than one; each starts at its default.
3. Leave **$extensions** ticked to keep `$extensions` metadata, each token's stamp included, for reading.
4. Press **Export**. The plugin writes the file for download.

Export writes the design system you loaded, not what the Figma file holds: no value is read back from Figma, and the file adds only its stamps, under `$extensions`. A DTCG token file holds **one mode**, so the export covers the combination you picked, and only that one is resolved, however many modifiers the document has. It names the file `<document>.<contexts>.json` and the contexts left out in a toast. The file is a DTCG token document, with the system's name and declared version in its root `$extensions` when those are included. Loaded back, it is a token file like any other: one collection, named after the file, holding that one combination's values, and not the document it came from. Export against a file with part collections is not checked.

---

## Apply tokens to layers

Two ways put tokens on layers that no component file built: **Apply**, which takes tokens from the loaded document, and **conventions**, which take variables by a naming pattern. Both bind through the same field writer a build uses.

### Apply a token or a group

Apply puts a token, or a group of tokens, on the layers of a scope. It needs a loaded document, and the variables a variable sync made from it.

- **The tokens.** The query is a token's path or a group's path, braces optional: `{badge}` or `space.sm`. It is a query over tokens, not over layer names.
- **The layers.** The scope (**Selection**, **Page**, **File**) and the kinds pick them: *frames* (frames and slots), *instances* and *component definitions* (set members included). Inside the scope, every layer of those kinds is written, at any depth.
- **The fields.** A group's tokens reach fields by their last keys, as `tokens=` does in a component file ([Bindings from the tokens](#bindings-from-the-tokens)): `backgroundColor` goes on `fills`, `borderRadius` on `cornerRadius`, `paddingInline` on `paddingLeft` and `paddingRight`. One token reaches a field by its last key the same way, or takes the field you name, which must be one its type can reach (a dimension cannot go on `fills`).

On the **Apply** pane: choose the scope at the top, type the path in **Tokens** (it suggests every token and group), pick a **Field** if you named one token (the list holds only the fields its type reaches; *by its last key* is the default), tick the kinds, and press **Plan**. The plan opens in the result surface, headed `apply plan`; press **Execute** to write it.

The plan has one row per layer and field. A key with no field on a layer is a skip row on that layer. A token the file has no variable for, or one whose type the field does not take, is one problem row naming it, and its fields are left out; the rest of the plan stands.

Where Figma cannot bind a field, or part of one, the token is written as its value. A colour's alpha on a paint is such a part: the colour is bound and the alpha is written as the paint's opacity. A written value takes the declared defaults, the document's default context, and the plan names that context on the row before you press **Execute**. It will not follow the token until you apply it again.

**Apply writes no stamp.** No component file declares these writes, so nothing reconciles them: they are yours, as an edit made with a tool. On a component a blueprint or a component file built, a field you applied reads as drift on the next build, which is the drift rule working: the build keeps your edit and says so, or overwrites it when you ask it to. (A field the file does not declare is not the build's, and it is left as you applied it.)

On an instance, a write is an override; its main component is not touched.

### Bind layers by convention

Conventions say how Figma variables should be bound to node properties, by a naming pattern. They are the foundation of the Apply pane's audit, scaffold and bind commands, for a file whose variables were made by hand or by another tool; a file built by variable sync and component files needs none, since a component file binds by token.

#### A conventions file

A JSON array:

```json
[
  {
    "id": "button-fill",
    "pattern": "{component}/{variant}/fill",
    "property": "fills[0].color",
    "nodeTypes": ["INSTANCE", "FRAME"],
    "variableType": "COLOR",
    "description": "Background fill colour per button variant"
  },
  {
    "id": "button-padding-left",
    "pattern": "{component}/{variant}/paddingLeft",
    "property": "paddingLeft",
    "nodeTypes": ["INSTANCE", "FRAME"],
    "variableType": "FLOAT",
    "description": "Left padding per button variant"
  }
]
```

`{component}` resolves to the component name (the main component's, for an instance), `{variant}` to the slash-joined variant property values (`Primary/Large`). The properties a convention may name are listed in the reference under [Supported Node Properties](./reference.md#supported-node-properties); the schema is under [Conventions JSON Schema](./reference.md#conventions-json-schema).

On the **Apply** pane, in the **Conventions** card at its foot, press **Load…** and choose the file. The card shows the file and how many patterns it holds.

### What the selection is bound to

The Apply pane reads what the selected layers are bound to as you select them, without changing anything: a row for every field the field table lists for each layer's kind, with the token it is bound to and where that token stands (from the Tokens pane's last look), or *plain* and the value it holds, and what the conventions would bind it to. A value Apply wrote reads as plain: it carries no stamp, so nothing says it came from a token. **Selection**, **Page** and **File** at the top change what it reads, and which layers its commands write; a file is read page by page and can take a while. The token query below the rows chooses tokens, never layers: the scope chooses the layers. A field the conventions would bind shows **Bind**, which plans and applies that one binding.

### Audit, scaffold, bind

Each command runs over the scope the pane shows.

| Command | What it does |
|---|---|
| **Audit** (in the Conventions card) | For each node and convention in scope, reports `ok` (the variable exists and is bound), `unbound` (it exists and is not bound) or `missing_variable` (no variable of that name and type exists) |
| *Scaffold missing variables, then bind* (Plan, Execute) | Creates the missing variables and applies every unbound binding, in one plan |
| *Bind what the patterns match* (Plan, Execute) | Applies the unbound bindings to variables that already exist, creating none; for a file whose variables came from variable sync |

A plan goes to Results, where you read it before pressing **Execute**.

Given an instance of `Button` with variant properties `{ "Size": "Large", "Style": "Primary" }`, the pattern `{component}/{variant}/fill` resolves to `Button/Large/Primary/fill`, and `{component}/fill` to `Button/fill`. For an instance, the plugin reads the main component's name through `getMainComponentAsync()`; a detached instance uses its own name.

---

## Write a component file

**The problem.** A design system keeps its components in code and again in Figma, and the second copy drifts. A script that rebuilds the Figma copy has to know the order Figma insists on, and it is written again by every design system that needs one. A component file says *what the component is* in the design system's own repository, and Toghen owns the order.

A component file is a text file named `<component>.component.kdl`, one component each. It is a [kdlet](https://codeberg.org/egildo/kdlet) file, which means it is written in [KDL](https://kdl.dev/) with a small template language on top: kdlet reads it and works out what each variant looks like, and Toghen supplies what is Figma's. The file says three things: the properties the component has (its variant axes, its booleans, its slots), the layers it is made of, and what makes one variant differ from another, written inside the layer it changes. This page shows how to write one; every node, field, value and check is in [component-files.md](./component-files.md).

### A small component

```kdl
component Button
description "A button with a label, on the accent colour."

properties {
    TEXT Label default="Save"
}

FRAME Button layoutMode=HORIZONTAL layoutSizingHorizontal=HUG layoutSizingVertical=HUG counterAxisAlignItems=CENTER paddingTop="{space.sm}" paddingBottom="{space.sm}" cornerRadius="{radius.md}" {
    fills "{surface.accent}"
    TEXT Caption characters=(property)Label textStyle="{type.label}" {
        fills "{text.on-accent}"
    }
}
```

Read it top to bottom:

- **`component Button`**, `description` and **`properties`** stand at the top of the file, with no wrapper around them. `properties` declares what a designer can change on an instance. `TEXT` carries its default value.
- **The `FRAME`** is the component's root. Each layer under it is a `FRAME`, a `SLOT`, a `TEXT` or an `INSTANCE`, and its first argument is its name. That name is its address: Figma finds the layer again by it, so names are unique within a member.
- **A field** is written the way the Plugin API spells it: `layoutMode=HORIZONTAL`, `cornerRadius=…`. A field that holds a list, such as `fills`, is a child node.
- **A value is a token or a literal that says so.** `"{space.sm}"` follows a token, and Toghen refuses a component if it names one that does not exist. `(literal)40` is a number chosen on purpose; a bare `40` is refused, so that every number in a file is either followed from the tokens or explained. The comment beside a literal is where the reason goes.
- **`(property)Label`** wires a field to a component property: the caption's text follows `Label`.
- **A round shape needs no special field.** Give it a large radius token (`radius.full`, `9999px`): Figma draws a radius larger than half the shorter side as half of it, so the same token makes a pill or a dot at any size, as it does in CSS.

With no `VARIANT` property, the button builds as one member. Its states come from its tokens instead; see [Take a component's axes from its parts](#take-a-components-axes-from-its-parts).

### One look per value of a property

Without an axis from the tokens, a component whose colour is chosen by a variant property repeats itself once per value. Take the axis from a group, and fill from it:

```kdl
properties { VARIANT Tone from="{surface}" }
FRAME Badge layoutMode=HORIZONTAL layoutSizingHorizontal=HUG layoutSizingVertical=HUG paddingLeft="{space.sm}" paddingRight="{space.sm}" cornerRadius="{radius.md}" {
    fills "{surface.(input)Tone}"
}
```

Every child of the `surface` group is a value of `Tone`, the first child the default. A new child in the tokens becomes a new variant on the next run, with no edit to the file. In each member, `(input)Tone` in the reference is replaced by that member's value. Use `exclude` for a child of the group that is not a value.

### A different case or weight is a different text style

A text layer with a `textStyle` takes no `textCase` or weight of its own. Measured in a test file: setting either on a text bound to a text style detaches it from the style, so the style's later edits no longer reach it; the reader refuses a field a text style also sets beside `textStyle`, naming both. A variant that is in capitals, or in a heavier weight, uses **another text style**: make it a typography token (`textTransform: uppercase` becomes the style's case, a heavier `fontWeight` its weight) and switch the layer's style in a `when`:

```kdl
TEXT Label characters=(property)Label textStyle="{type.label}" {
    when loud { textStyle "{type.label-caps}" }
}
```

A text with no style takes the fields themselves, each token bound on the whole text: `fontFamily`, `fontStyle`, `fontWeight`, `fontSize`, `lineHeight`, `letterSpacing`, `paragraphSpacing`, `paragraphIndent`, with `textCase` and the rest as plain values. A unitless line height or an `em` letter spacing cannot be bound, since Figma binds those in pixels, and is written as its value with a line in the report. Write one or the other: a style, or the fields.

### Checking a file

`readComponentFile(text)` returns the component, its members and a list of problems. Every problem carries a line and a column, and it names the thing in the file's words:

```
line 8, column 168: "cornerRadius" takes a token reference or a (literal) number: a bare 40 would be a number nobody chose, write (literal)40 or a token reference
```

Errors stop the file from building anything. Warnings do not. The one you will meet is a property that ends up wired to nothing in a member: if a `when` replaces `visible=(property)…` with `visible=#false`, the property exists in that member and does nothing. That is sometimes what you mean, and it is also how a property goes dead by accident, so it is said every time.

A problem found in a member after a `when` wrote the field points at the `when`. A problem that every member has is said once; one that only some have is said once for each, with the member's name. The checks run in stages, and a stage that cannot run says nothing: a layer with a field the file spelled wrongly is not checked for a duplicate name until the spelling is fixed.

### Checking files with no plugin

`toghen-figma check` reads files against the design system with no plugin and no Figma file, so it runs anywhere, in a script or by an agent, at every step of a change:

```sh
pnpm exec toghen-figma check tokens/ds.resolver.json components/*.component.kdl
```

```text
components/avatar.component.kdl:2:29 token {space.xl} is not in the design system "ds"
1 file read: 1 error
```

It exits 1 when a file has an error. It checks the file and the names it uses; whether a variable already exists in a Figma file is for a dry run.

It holds each name against the variables the sync will make, so it also catches a name that is a token and will never be a variable: a part the fold took into its rest's variable.

```text
components/swatch.component.kdl:3:18 token {chip.solid.hover.ink} is the "hover" part of "chip.solid.ink", which is one variable with a mode per "interaction": name {chip.solid.ink}; the member pins the mode (a tokens= axis, or modes interaction=hover)
```

Name the rest, and let the member pin the mode. A file that says two things about a size is refused here too: `width=#null` (write `layoutSizingHorizontal=HUG` to let the layer size itself), or a height bound to a token beside `layoutSizingVertical=HUG`, which a target can only settle by rewriting one of them on every run. The entry is any the other commands take: one resolver document, or token files in order with `--name`, and `--overrides`.

### Larger components

- **A variant that only some combinations need.** `exclude State=on Size=small` leaves that combination out. For several combinations write several lines. A set may be sparse; Figma warns when a missing combination is picked. The first value of every axis is always built.
- **Several axes.** One guard may read one axis; to read two, name both guards in a `when`, `when hover small { … }`, which holds when all hold, or write `all { … }` or `any { … }` in a guard.
- **Another case.** `else` after a `when` applies when it did not: `else pressed opacity=(literal)0.8`, and a bare `else …` is the last case.
- **A layer that only some variants have.** A `when` may hold a child layer: `when on { FRAME Badge … }`.
- **A region that sits in a different parent for each variant.** Write the region once as a `define`, and call it with `+name` under opposite guards in both places: `when header-in-page { +header-region }` in one parent and `when header-in-content { +header-region }` in the other. The layer has one name in both, so Figma moves the same layer. A `define` is closed: it sees its parameters and the guards written inside it, so it carries no guard from outside.
- **A grid.** `layoutMode=GRID` with `gridRowSizes { FLEX; }` and `gridColumnSizes { FLEX 1; FLEX 1.618; }`; every child of a grid says which cell it is in with `grid row=0 column=1`. A slot may sit in a grid but may not be one.
- **A slot.** `SLOT Content description="What the screen is for."` in `properties`, and one `SLOT Content` layer in the tree. A slot's name is its property's name, and Figma clips a slot's contents unless the layer says `clipsContent=#false`.
- **A mode pin.** `when small { modes Scale=small }` pins a layer to the `small` mode of the local `Scale` collection, or, when the file has none of that name, of the `Scale` collection a library declared with `--use` holds. A library's collection is pinned in FigCraft only for now; Figma refuses it with a sentence until it is measured there. With variable sync's collection per modifier, a pin names a modifier and a context, `modes density=compact`, and fixes only that one: the frame an instance sits in still decides the rest.
- **Only some combinations.** `include State=rest Size=medium` lines turn the set around: when any is present, only the combinations they match are built, and `exclude` then removes from those. The default member must be included.
- **What is not there.** `each` is part of kdlet but not built for component files, since nothing gives them a list. A `BOOLEAN`, `TEXT`, `INSTANCE_SWAP` or `SLOT` property is wired with `(property)` and is not an input, so no guard reads it.

### Take a component's axes from its parts

A component's states and variants are subgroups of its token group. The file takes its axes from them instead of listing them. This is the running example's button, with its token group:

```kdl
component Button tokens="{button}"

properties {
    TEXT Label default="Save"
}

FRAME Button layoutMode=HORIZONTAL layoutSizingHorizontal=HUG layoutSizingVertical=HUG counterAxisAlignItems=CENTER {
    TEXT Caption tokens="{button}" characters=(property)Label textAutoResize=WIDTH_AND_HEIGHT
}
```

Its axes come to this, and the first three of its 16 members follow:

```
properties (declared first, then the axes taken from the parts)
  Label  TEXT  default "Save"
  variant  VARIANT  rest, primary  pins the collection variant
  state  VARIANT  rest, hover, pressed, disabled  pins the collection state
  selection  VARIANT  rest, selected  no pin: laid out in the path

16 members
  variant=rest, state=rest, selection=rest  |  pins variant=rest state=rest  |  fill button.backgroundColor
  variant=rest, state=rest, selection=selected  |  pins variant=rest state=rest  |  fill button.selected.backgroundColor
  variant=rest, state=hover, selection=rest  |  pins variant=rest state=hover  |  fill button.backgroundColor
```

- **Which subgroups make axes.** Each axis of the parts vocabulary that the subgroups of `button` use becomes an axis of the component, after the declared properties: `variant`, `state` and `selection` here. The vocabulary is declared on the document root or on any group at or above `button`. See [the vocabulary](https://codeberg.org/Toghen/lib/src/branch/main/model.md#the-vocabulary).
- **Values.** Each axis takes `rest` first, then the part keys its subgroups use, in the vocabulary's order and not the order they are written in. `rest` is the default member on every axis.
- **Members.** A member takes one value from each axis. Two variants, four states and two selections make 16 members.
- **Pins.** An axis that folds pins its collection's mode on every member: `variant` pins the `variant` collection, and so on. An axis left in the path pins nothing, and `selection` chooses the part's own variables. [Choose how parts become variables](#choose-how-parts-become-variables) says which axes fold.
- **New keys.** A new part key in the tokens adds a value, and its members, on the next run, with no edit to the file.
- **Modifiers never become axes.** Theme and density are modifiers: the frame an instance sits in sets them, as a stylesheet takes them from an ancestor. To make a modifier a variant, declare it by hand: `VARIANT Theme (modifier)"theme"` takes its values and its pins from the modifier.
- **Refused.** A part key `rest`, or an axis name with `.`, `,` or `=`, is an error on the component line. The error says: an axis name cannot contain ",", "=" or ".", and a part key cannot be "rest" or contain "," or "=".

### Choose how parts become variables

A part becomes either a mode of a variable that its axis shares, or a variable of its own. Each axis of each component is decided on its own, and the plan says what it decided.

- **Folded, the default.** The axis is a collection named after it, with `rest` and the part keys as its modes. One variable serves every value of the axis. In the running example, the `state` collection holds `button/backgroundColor` with a mode for each state, and the `variant` collection holds `button/backgroundColor--variant` with a mode for each variant. The `rest` mode of the `state` variable aliases the `variant` one.
- **One variable per part.** The axis stays in the path, and each part is a variable of its own with its segment in the name, such as `button/selected/backgroundColor`.

An axis folds unless one of these holds. Axes are decided in the vocabulary's order, so an earlier axis folds first.

- A token carries its segment together with the segment of an axis that has already folded. `button.selected.hover.backgroundColor` does, so `selection` stays once `state` folds.
- A token that would fold has no rest value. A variable needs a value in every mode, so the token at the same path without the part must exist: `field.disabled.opacity` needs `field.opacity`.
- The collection would pass ten modes, Figma's limit.
- The component is laid out with `layout=parts`.

The plan writes one sentence for each component that has an axis left in the path. For the running example, it says:

```
"button": folds "variant" (modes rest, primary), "state" (modes rest, hover, pressed, disabled); "selection" stays in the path, one variable per part: "button.selected.hover.backgroundColor" carries it together with the folded "state".
"field": "state" stays in the path, one variable per part: no rest value: "field.disabled.opacity" needs "field.opacity", which is not defined.
```

**Layout parts.** Put `layout=parts` on the component line to keep every axis in the path:

```kdl
component Button tokens="{button}" layout=parts
```

The button's parts become variables of their own, and the plan has no `variant` or `state` collection. Its rows in that plan are:

```
  button/backgroundColor  COLOR  var(--button-background-color)
    default: alias theme/surface/raised
  button/color  COLOR  var(--button-color)
    default: alias theme/text/default
  button/paddingBlock  FLOAT  var(--button-padding-block)
    default: alias density/space/sm
  button/borderRadius  FLOAT  var(--button-border-radius)
    default: alias ds/radius/md
  button/icon/color  COLOR  var(--button-icon-color)
    default: alias theme/text/muted
  button/primary/backgroundColor  COLOR  var(--button-primary-background-color)
    default: alias theme/surface/accent
  button/primary/color  COLOR  var(--button-primary-color)
    default: alias ds/text/on-accent
  button/hover/backgroundColor  COLOR  var(--button-hover-background-color)
    default: alias theme/surface/selected
  button/pressed/backgroundColor  COLOR  var(--button-pressed-background-color)
    default: alias theme/surface/selected
  button/pressed/color  COLOR  var(--button-pressed-color)
    default: alias theme/text/muted
  button/disabled/color  COLOR  var(--button-disabled-color)
    default: alias theme/text/muted
  button/selected/backgroundColor  COLOR  var(--button-selected-background-color)
    default: alias theme/surface/selected
  button/selected/hover/backgroundColor  COLOR  var(--button-selected-hover-background-color)
    default: alias theme/surface/accent
```

and its sentences are:

```
"button": "variant" stays in the path, one variable per part: the component is laid out as one variable per part (layout=parts); "state" stays in the path, one variable per part: the component is laid out as one variable per part (layout=parts); "selection" stays in the path, one variable per part: the component is laid out as one variable per part (layout=parts).
"field": "state" stays in the path, one variable per part: no rest value: "field.disabled.opacity" needs "field.opacity", which is not defined.
```

The command line checks the files before it plans the variables, so the sync learns `layout=parts` from them. A plugin run that never checked the files syncs folded. A file with `layout=parts` run against a folded sync stops with the message that a token names no variable.

**A mode reaches everything inside.** A member pins each folded axis's mode on its root, and every layer inside follows. A badge inside a hovered button takes the button's `hover`, so it hovers too. That is close to right for a mockup, and it shows on the canvas when it is not. The fixes are `layout=parts`, which pins nothing, or pinning `rest` on the badge. Pinning a folded axis from inside a component is not checked yet.

**A part that restates its rest.** A part may refer to its own rest, `chip.hover.background = {ui.chip.background}`, so that a host overriding the rest in CSS does not reach the part. Folded, the `hover` mode takes the rest's cell: an alias to whatever the rest aliases, or its value. A part that refers to another part of the same component, `chip.disabled.background = {ui.chip.hover.background}`, takes that part's cell. Neither gets a variable of its own, and the plan never writes a variable as an alias of itself.

**Not covered yet.** A part token that is a style, such as typography or a shadow, keeps its own style under its full path, with no mode. A part token whose variable type differs from its rest token's keeps its own variable, and its mode falls back to the rest.

**Run in a real file (13 October 2026).** The running example's button was synced into an empty file, with the sentences above. The file held the shared `variant` collection (modes `rest`, `primary`) and `state` collection (`rest`, `hover`, `pressed`, `disabled`), `button/backgroundColor` in `state` with its link `button/backgroundColor--variant` in `variant`, `button/selected/backgroundColor` in `state` (selection stays in the path), and 16 members that pin one mode of each folded axis. Each member's fill resolved to the colour the tokens give for it: hover wins over the primary variant, a disabled primary keeps the primary colour, and a hover member inside a frame set to dark takes the dark value.

### Bindings from the tokens

When a component's tokens are keyed by the CSS properties they fill, the file does not have to bind them one by one. The button's caption is a text layer in the `button` group:

```kdl
TEXT Caption tokens="{button}" characters=(property)Label
```

A text layer takes `color` as its fill and `font` as its text style, and skips the rest into the notes.

- **`tokens="{group}"` on a layer** binds each token one level down by its key: `backgroundColor` to the frame's `fills`, `borderRadius` to `cornerRadius`, `paddingBlock` to the top and bottom padding, `color` to a text's `fills`, `font` to its text style. The `component` line's group binds the root. The full table is in [component-files.md](./component-files.md).
- **What you write wins.** A field on the layer, or in a `when`, is kept, member by member; inference fills only what the member does not already say.
- **Parts follow by themselves.** A member pins the mode of each folded axis on its root, and the bound variable takes that mode's value. A part left in the path binds its own variable; see [Choose how parts become variables](#choose-how-parts-become-variables).
- **What Figma cannot hold is skipped into the notes**: `transition`, `cursor`, `gap` on a layer with no layout, `backgroundColor` on a text. Layout values (`layoutMode`, alignment) stay in the file, since no token type carries them.
- **A border token binds through its members.** A member written as a reference binds that token's variable; a literal member has no variable to bind, and is skipped with a warning. A dashed or dotted border is refused.
- **Nothing is matched by name.** A layer binds only the group it names, so renaming a layer never changes what it binds.

A file that takes anything from the tokens is read against a resolver document: `components` takes `--resolver <file>`, and `sync` reads its own. Without one, it stops and says so.

A worked example that uses all of these, a layout with four slots, a grid and a region in a different parent, is the design note in [specs.md](./specs.md#worked-example-a-layout-with-slots-a-grid-and-a-region-that-changes-parent).

### Move a component file off state modifiers

Earlier versions made a component's element states a modifier named `state`, marked `"inherits": false`. Figma does not read `inherits`, so a modifier marked with it is an ordinary modifier to Figma. A component's states are parts now, and the modifier is removed from the document. This section is the change for a document and a file that used it.

The document, before. The `state` modifier's CSS extension:

```json
"state": { "$extensions": { "com.toghen": { "css": { "selector": ":{context}", "inherits": false } } } }
```

After. The hover value sits in the button group, as a part:

```json
"button": {
  "backgroundColor": { "$type": "color", "$value": "{surface.raised}" },
  "hover": {
    "backgroundColor": { "$type": "color", "$value": "{surface.selected}" }
  }
}
```

The file, before:

```kdl
component Button tokens="{button}"

properties {
    VARIANT State (modifier)"state"
}
```

After, the `VARIANT State (modifier)"state"` line goes. The axes come from the parts, as in [Take a component's axes from its parts](#take-a-components-axes-from-its-parts).

- **Remove the modifier in the same change.** While the document still has a `state` modifier, a file whose axis folds into `state` stops the plan with this message:
  `The part axis "state" folds into a collection of that name, and the base collection or a modifier already has it. Rename the axis in the parts vocabulary, or lay its component out as one variable per part (layout=parts).`
- **A file that still names it is refused** once the modifier is gone:
  `VARIANT "State" takes its values from the modifier "state", which the design system does not have`
- **The `state` collection is reconciled, not left alone.** The folded axis makes a collection named `state`, so the plan matches the collection in the file by that name and updates it. Its modes are `rest` and the part keys the file uses. A mode the new layout no longer has is a breaking step, deleted only with `--allow-breaking`. Variables are matched by name within the collection. Variable sync never deletes a variable or a collection. This is read from the code: no test covers it, and it has not been run in a real file.
- **Without a collection of that name, the old one stays.** If the file lays the component out with `layout=parts`, no collection named `state` is made. A collection that the earlier sync wrote, and that no collection of the document is named for, is left alone, and the plan says so:
  `Collection "state" holds variables this document wrote, but nothing in the document is named "state" any more (a modifier of that name is gone). It is left alone.`
- **The component changes too.** The `State` property is removed, and the members named by it go with it. Both are breaking: a real run stops before its first write and lists them, unless you pass `--allow-breaking`. Figma keeps an instance pointing at a removed member, so someone must swap it.

---

## Build a component set

**The problem.** A component file says what a component is; something has to make Figma agree. Doing it by hand or by a script means knowing an order Figma insists on, and building again from scratch breaks every instance of the old set. Toghen builds the set once, stamps what it makes, and later runs recognise their own work.

The engine is `run(desired, options)` in `main/components/`. It is Plugin API code, and it runs inside the plugin, for a file the command line sends (see [Syncing from a repository](#syncing-from-a-repository)) or one kept on the Build pane. The plugin also reads and checks the file first, so a mistake is reported with its line before anything is written.

### What has to exist first

Everything a file names is looked up in the Figma file, by name, before anything is written.

- **Tokens** must have been synced. `"{space.sm}"` finds the variable that variable sync wrote for `space.sm`, `space/sm`, under whichever local collection holds it, a part axis's collection included. A colour token needs a colour variable and a dimension needs a number variable.
- **Text styles and effect styles** must exist for every `textStyle` and `effectStyle`, made by style sync from typography and shadow tokens.
- **Components** named by `component=` must be in the file, or published and importable by `(key)`, or built by another file of the same run: the files run in dependency order, each after the files defining the components it names.
- **Collections and modes** named by `modes` must exist.
- **The page**: the current page, or the one `page` names. A new set is placed under whatever the page already holds; a set from an earlier run stays where it is, wherever a designer moved it.

If any of them is missing, or one name matches in two collections, the run stops before it writes and lists every problem at once, each with the line of the file that named it. Fix them together and run again. A `sync` dry run counts what its own earlier steps would create as present, variables, styles, modes and the sets earlier files build, so `figma:check` passes where the real run would. An instance of a set the dry run would create is checked by name only, and the dry run says so; its properties and slots are checked on the run that builds it.

### The first time

Nothing of that component exists yet, so the run creates it: one component per member, named for its combination, combined into a set with the default member top-left, then named, described and stamped. Slots do not clip. Every layer carries a stamp saying which layer of the file it is, and the set carries the component's name.

If building a member fails halfway, the run removes everything that step made before it reports the error, so a failed run leaves no blank components on the page.

### How the members are laid out

The members form a board, the variant matrix you would draw by hand: some axes go across, the rest go down, and within each direction an earlier axis is the outer group. Members sit 40 px apart inside a group, and each outer axis adds 40 px more between its groups, so each block reads as one value. A combination you excluded leaves its cell empty, keeping the columns aligned. The default member stays top-left.

Say which axes go across on the component line:

```kdl
component Button tokens="{button}" across="interaction, selection"
```

Without it, the board balances itself: axes go across from the last one backwards until there are at least as many columns as rows. The board is laid out again on every run, so an existing set takes it the next time it runs.

### Where sets go on the page

Toghen remembers where it put each set and artboard. After every run, its own sets on each page the run touched are stacked again, top to bottom in their current order, left edges aligned, 100 px apart, so a set that grew pushes the ones below it down instead of covering them. A set you moved by hand is yours: it stays where you put it, and the stack flows around it. If it then overlaps something, the run says so and leaves it.

A set made before Toghen remembered positions is moved only if it overlaps another set; otherwise it stays, and from then on it is Toghen's to place. A dry run lists which sets a run would restack and which were moved by hand, without positions, since the sets it would build have no size yet. The run report lists each set it moved.

A dry run resolves the same names and reports what would happen, and writes nothing. It does not import a component named by a published key, since importing writes to the file, so a key is not checked until a real run.

### When it says no

- **A set of that name that Toghen did not make.** A set is never adopted by its name. The run says which set it found, and stops. Rename or delete it, or build on a page where it is not.
- **Two sets stamped as one component.** Toghen will not pick between them.

A run that stops has written nothing. A run is not rolled back, though: one that Figma refuses in the middle leaves what it wrote, and the next run completes it. Run one component at a time against a file; the command line already does.

### Changing a component

Edit the file and run it again. The set is never rebuilt: rebuilding would change its key and break every instance of it, in every file that uses it. Instead Toghen finds what it made by its stamps, compares it with the file, and changes only the difference. A dry run lists what would change and writes nothing.

- **What is found by stamp, not by name.** A designer may rename a layer or a member. Toghen still finds it, patches it, and gives it the file's name back.
- **What a run writes.** Only what moved in the file: a field nobody changed is not written, so a run on an unchanged file patches nothing. An edit a designer made to a declared field is drift, as for a variable: kept, and noted on every run until you settle it, by changing the file to match or with `--overwrite-drift`, which writes the file's value over it. A field the file does not declare is theirs to change.
- **What a run leaves alone.** A node Toghen did not make, a property a designer added, a member with no stamp, a copy someone made of something Toghen made, and the value of a field the file stopped declaring. Each is left as it is and named in the report's notes, so it is never a surprise; a field the file stopped declaring is reported once.
- **What breaks instances.** These are named in the report's `breaking`, and a dry run shows them before anything is written. A real run that would take any of them stops before its first write and lists them, unless it was given `allowBreaking` (`--allow-breaking` on the command line):
  - a member removed, which happens when a variant value is removed or renamed (a renamed value reads as one member removed and another added, since the file does not say it was a rename);
  - a layer whose kind changed, which is replaced, so overrides on it are lost;
  - a property removed, or changed to another type;
  - a **stray** removed: a member left outside any set, by a run that failed before this was fixed, or by a member dragged out of its set. The run finds strays on every page, once, and removes them only with `allowBreaking`, since a loose component in a published library may have instances in other files. The check before a sync writes anything lists them: `"interaction=disabled" (26:522) is a member outside any set, left by an earlier run; it is removed with --allow-breaking.`

  Figma does not detach an instance of a removed member or move it to another variant: it keeps pointing at the removed component, and someone has to swap it. An instance loses a removed property together with its override of it, and keeps every other override.
- **A renamed axis is renamed.** When the only change to the axes is one name, in the same place and with the same values, the run renames the axis in Figma: every member keeps its node and every instance keeps its value. The dry run says `axis "state" is renamed "interaction"`. Rename two axes at once, or rename one and change its values, and it reads as members removed and added, which breaks instances; rename in two runs to keep them.
- **A set Figma reports as broken stops the run, named.** Figma calls a set broken when two members share a combination or its members do not have the same axes, often after a member was renamed by hand. The run, and the check before a sync writes anything, list the members at fault with their ids and whether Toghen made them. Delete or rename them, then run again. Toghen does not rebuild the set, since that would break its instances.
- **What is added.** A new variant value adds the members it needs, built whole and appended; a new layer is created in its place on every member; a new property is added to the set and wired.
- **A property with the same name that a designer added** is not adopted. The run leaves it and says so; layers the file wires to that name are wired to it.

### Keeping a component file in the Figma file

The Build pane keeps component files inside the Figma file, so a set can be planned and built again from the plugin by anyone who opens the file, with no command line.

1. Load the design system on the Load pane (a file whose axes come from the tokens needs it to read).
2. On **Build**, press **Add a .kdl file**, or drop one on the pane. A file that does not read is not kept; every problem is listed in Results with its line.
3. Click its row, then **Plan build**. Results shows what the build would do; a step that breaks instances holds **Execute** until you tick *Allow breaking steps on this build*.
4. **Build** runs it for real, on the current page, where a set is found by its stamp wherever it is.

**Replace file…** swaps in a new version of the file, **Forget** stops keeping it. A row says where the set was built, and *not compared*: whether the set still matches its file is not checked yet. A file the command line sent is not kept here, since the command line sends the packed component and not the file's text.

### Build from a library

A file that uses a published library has none of its variables, styles or components itself. A blueprint names the library with a `library` line, and the plugin keeps, in the file, **the lock**: which key each name the blueprint uses from it resolved to.

1. In the library file, publish the library. In this file, enable it in Figma's assets panel, and accept its updates. All three are Figma's, done by a person: a plugin can do none of them.
2. Load the design system the library was synced from, and keep the blueprints and component files (see above).
3. **Discover variables.** The plugin looks for every token the kept files bind in the enabled libraries, by the collection and the name the variable sync gives it, and keeps the key of each it finds. Results shows one row per token: found, not found, or a **choice** when two libraries have it. A choice is never made for you: nothing is kept for that token until the overrides map names the one to use, written `(key)"…"`.
4. **Pick a component or a style once.** No API lists a library's components or styles, so place one instance from the assets panel, select it, and use it: the plugin keeps its component's key (its set's, for a variant), and the key of the layer's text or effect style when it comes from a library. Figma does not tell a plugin which library a component is from, so you name the library. When the library is built from a repository, the command line can fill the lock instead, with both files open: see [Syncing from a repository](#syncing-from-a-repository), *A library and the files that use it*.
5. Build. A name the lock holds for a declared library is imported by its key; any other is found in this file, as before. A name found both in this file and in a declared library stops the build and names both: rename one, or say which to use in the overrides map. A dry run imports nothing and lists what it would import.

The overrides map replaces a name before anything else: a component's name, a token path or a library's name, to another name or to a `(key)"…"`. An import that fails says *not published, or not this key: publish the library, then accept its update in this file*: Figma gives the same error for a key that was never published as for one that does not exist.

**A relink is a run.** When the lock sends a component's name to another key (a library took over a component this file had, or the file moved to another library), the next build swaps each instance Toghen made: one row per instance, *"Glyph" in "Badge/Tone=calm" swaps from "Icon" (this file) to "Icon" from library "Core"*. A dry run lists the swaps and imports nothing. An instance a person placed carries no stamp and is left as it is.

The Build pane, which will carry these as buttons, is not built yet; the plugin's commands are `DISCOVER_VARIABLES`, `LOCK_PICK`, `LOCK_FORGET` and `SET_BUILD_OVERRIDES` (`reference.md`, *The lock*). A component file built on its own declares no library, so its names are found in the file only.

### Syncing from a repository

**The problem.** A design system's tokens and component files live in its repository, and syncing them by hand means loading a document in the plugin, planning, executing, and then printing and running a script for each component, in the right order. `toghen-figma sync` does the whole job from an npm script, through the plugin, with nothing to copy.

```json
"scripts": {
  "figma:check": "toghen-figma sync tokens/ds.resolver.json components/button.component.kdl --dry-run",
  "figma:sync": "toghen-figma sync tokens/ds.resolver.json components/button.component.kdl"
}
```

1. **Open the target file in the Figma desktop app and run the Toghen plugin** (a development plugin, imported from `dist/manifest.json`; see [the drill](#from-the-repository-to-figma)). The connection to the command line was measured in the desktop app only, and the manifest names it under `devAllowedDomains`, which holds for a development plugin.
2. **Run the script**, `pnpm figma:check` first. It reads the resolver document (and the token files it names) and every component file, and pairs with the plugin (step 3), which checks every file before any sync: a mistake, or a token or style the design system does not define, is reported with the file, line and column, and nothing is written.
3. **Pair, the first time.** The command prints a code. In the plugin, in the **Source** card at the foot of the Load pane, type it and press **Connect**; the status bar then shows a green dot and the time. The pairing lasts until the plugin is closed: the next run finds the plugin by itself. After closing the plugin, run it again and type the new code.
4. **Watch it work.** The command prints the plan for the variables, applies it, does the same for the styles, and then runs each component file. The plugin's Results shows the same plans and outcomes, its header says `from the command line`, and the document the run loaded is now the one on the Load and Sync panes.

- **`--dry-run`** goes through every step and writes nothing. A name a component uses that the sync would create, a variable, a text style or a mode, or a set a file earlier in the run builds, counts as present and is listed as `pending`, so `figma:check` passes where the real run would. A name that nothing would create still stops it. A set's dry run says `N would update`: the members a real run would write to.
- **The skips.** A plan prints its skips counted by cause, `Variable plan: 3 creates · 0 updates · 239 skips (180 unchanged · 40 cannot be written · 19 unsupported type)`, then the rows of every cause but `unchanged`, ten per cause and then how many more. **`--verbose`** (`variables`, `components` and `sync`) lists every skip, the unchanged ones too, and every patch of a set with the fields it writes.
- **`--allow-breaking`** lets a run take steps that break instances elsewhere, and lets the variable sync delete a removed context's mode. Without it a run that would take one stops before writing and lists them; read them in a dry run first.
- **`--overwrite-drift`** (`variables`, `components` and `sync`) writes the document's value and scopes over every value, every scope list and every style edited in Figma since the last sync, and the file's value over every component or artboard field edited there, instead of leaving them; see [Drift](#drift).
- **`--collection <name>`** names the base collection the variables go into (the document's name when absent); the styles bind to the variables there too. **`--page <name>`** names the page the sets live on.
- **The entry.** Every `.json` argument is what is loaded, in the order given: one resolver document, one token file, or several token files merged in order, the last winning (`toghen-figma variables tokens/base.tokens.json tokens/brand.tokens.json`). `.kdl` arguments are component and artboard files, as before.
- **`--name <name>`** names the collection of token files. Without it, they are named after the folder that holds them; files in no common folder need it. A resolver document has its own name and ignores it.
- **`--overrides <map.json>`** reads a JSON object that maps a `$ref` as written to the location to read instead, resolved against the document that holds the `$ref`: `{ "./brand.tokens.json": "./brand-dark.tokens.json" }` swaps one file for another without editing the resolver document. A key that matched no reference is printed as a warning, as is a token two sources both give a differing value.
- **`toghen-figma check <entry.json>… <file>…`** checks the files with no plugin; see [Checking files with no plugin](#checking-files-with-no-plugin).
- **`toghen-figma members <entry.json>… <file>…`** prints each file's members as JSON, as a build would make them, with no plugin: for a tool of your own that draws them somewhere Toghen does not, such as a documentation page or a datasheet, so it reads them here rather than through Toghen's modules.
- **`toghen-figma variables <entry.json>…`** syncs the variables and styles alone, and **`toghen-figma components <file>… [--resolver <entry.json>]`** runs component files against variables that are already in the file. `sync` needs at least one component file; with none, use `variables`.
- **Exit code** 0 when every step succeeded; 1 when a check failed, a variable plan stopped, Figma refused a step, or the plugin went away. A port 3055 that something else holds is reported and stops the command: the plugin's manifest names that port, so it cannot be changed.
- **The command waits for you** at step 3 and does not give up. Press Ctrl-C to stop it.

**A library and the files that use it.** A library's components and styles cannot be found from a file that uses it (see [Build from a library](#build-from-a-library)), but the library file knows its own keys. So the command line can open both files at once and fill the using file's lock for you.

```json
"scripts": {
  "figma:library": "toghen-figma sync tokens/ds.resolver.json components/*.component.kdl --library \"Example Library\"",
  "figma:lock": "toghen-figma lock \"Example Library\""
}
```

1. **Open both files and run the plugin in each**: the library file, and the target file that uses the library.
2. **Run the script.** It prints two codes, each with its file: *In the library file "Example Library", enter ABCD-2345; in the target file, enter EFGH-6789.* Type each into the plugin in its file. Like one code, both are kept until the plugins close, and the next run finds them by itself.
3. **The run builds in the library file**: the variables, the styles and every component file go there, since the library is where components are made. The target file gets only the lock: the key of every set, of every style the style sync made, and of every variable in the library, under the library's name. Give the name exactly as Figma shows the library: a plugin cannot read it.
4. **Publish, then accept.** For each set or style whose published version is not the one in the file, the run prints a line: *"Badge" is not published as it is now (CHANGED): publish the library, then accept its update in the target file.* Both are a person's steps, in Figma: a plugin can do neither, and a key in the lock imports only after both.

- **`toghen-figma lock <name>`** builds nothing: it pairs both files and copies the keys. Use it after building the library by hand, or after publishing, to check that nothing is left to publish.
- The library's entry is written whole each time, so a set removed from the library leaves the lock too. It is kept as written by the build, or by the command line for `lock`.
- The lock holds the library file's key only when the plugin could read it: a development plugin can, a published one could not. Nothing depends on it.
- A dry run with `--library` lists the same lines and writes no lock.

**Building the files that use it.** The lock is read by a run that declares the library. `--use "Example Library"` on `components` or `sync` says the files' names may come from it. A name the lock holds for it is then imported by its key, and a name found both in the file and in the library stops the run, naming both. Without `--use`, every name is found in the file, as before.

```json
"figma:app": "toghen-figma components screens/*.artboard.kdl --resolver tokens/ds.resolver.json --use \"Example Library\""
```

This path has run end to end in a real file: a dry run, a real run, a reconcile, a breaking change refused and then taken, and a removed context's mode deleted behind the same gate ([measured behaviour §11](.reference/figma/measured_behaviour.md#11-the-first-command-line-run-in-a-real-file)).

### Syncing into FigCraft

[FigCraft](https://github.com/storytold/figcraft), the open-source design app, holds variables, styles and components the way Figma does, but runs no Figma plugin. `toghen-figma variables`, `components` and `sync` reach it through its control port instead, with no plugin and no pairing:

```json
"scripts": {
  "figcraft:check": "toghen-figma variables tokens/ds.resolver.json --figcraft 7979 --dry-run",
  "figcraft:sync": "toghen-figma sync tokens/ds.resolver.json components/*.component.kdl --figcraft 7979"
}
```

1. **Start FigCraft with a control port**: `open -a FigCraft --args --control 7979` on macOS, or `figcraft --control 7979`. The port listens on this machine only.
2. **Show the target file** in FigCraft's front window. The run writes into the file shown when it starts, and keeps writing there if you look at another tab meanwhile: each step shows the target again.
3. **Run the script**, the dry run first. The plans, warnings and counts are the same as a run through the plugin. Each step is one entry in FigCraft's undo history, named after what it did.

What differs from Figma:

- **A divider named *-toghen*.** FigCraft's variables and styles cannot hold the stamp Toghen keeps of what it wrote, so the first run that writes adds a divider to the pages list, *-toghen*, and keeps every stamp in its data. A divider is a line, never opened, and holds no layers. Rename it or move it as you like: it is found by what it holds. With it, [drift](#drift) works as in Figma: a value or a style you changed in FigCraft is kept and reported, `--overwrite-drift` writes over it, and an unchanged one is not written again. Delete the page, or undo the run's last step, *Toghen stamps*, and the next run starts over as a first run: it adopts what is there by name.
- **A font weight is written, not bound.** FigCraft binds a text style's family, style, size, line height and letter spacing, not its weight. A typography whose weight refers to a token is written again on every run.
- **Components and artboards are kept in step as in Figma.** A second run changes only what moved, a field you changed in FigCraft is kept and reported, and `--overwrite-drift` writes over it. Each layer Toghen made carries its stamp in its own data.
- **Some things are trusted, not read.** FigCraft does not report a layer's wiring to a property, a frame's pinned mode, blend mode normal against pass-through, corner smoothing, a line's cap, a text's maximum lines, paragraph spacing and indent, an exposed instance, or a slot's description and settings. If you change one of them by hand, the next run does not notice. Change them in the component file instead.
- **Figma's keys are refused.** A component named by a Figma key, and preferred values written `key=`, stop the run before it writes anything, the dry run included. Name components instead: preferred values take `name=` (see [component-files.md](component-files.md)). So do `textTruncation`, since FigCraft's truncation is a sizing mode rather than Figma's ending, and the line cap `TRIANGLE_FILLED`, which FigCraft has no match for.
- **Close other tabs carefully.** Closing a tab before the target during a run moves the target, and the run stops; the step it was on may have gone to the file now in its place. Undo it there.
- **One program at a time.** FigCraft's commands act on the file a window shows. Two programs driving the same FigCraft (an agent and this command, say) switch it under each other. Start a second FigCraft on another port for the second one.

### A library in FigCraft, and the files that use it

In FigCraft a library is a `.figcraft` file published as one. Publishing and accepting its updates are commands there, so the run does both: nothing is left for a person but saving the file that uses it, live. A run with nothing changed publishes nothing: it says the library is already published as version N, and goes on to the file that uses it, so a script building several files in order runs through libraries already in step.

```json
"scripts": {
  "kit:check": "toghen-figma sync tokens/ds.resolver.json components/*.component.kdl --figcraft 7979 --library design/kit.figcraft --dry-run",
  "kit": "toghen-figma sync tokens/ds.resolver.json components/*.component.kdl --figcraft 7979 --library design/kit.figcraft",
  "app": "toghen-figma components screens/*.artboard.kdl --resolver tokens/ds.resolver.json --figcraft 7979 --use design/kit.figcraft"
}
```

1. **Show the file that uses the library** in FigCraft, and run `kit`. The variables, styles and components are built in the library file. That file is opened in a tab of its own if it is not open, and made if it does not exist yet. The run then publishes the library and saves it, since other files see a library only once it is saved. In the file you showed, it enables the library, accepts that library's updates (your overrides on its instances are kept) and writes the lock. A dry run does none of this, and says what is waiting.
2. **Run `app`** for the files that use it. `--use` enables the library if it is not enabled yet, reads its components, styles and variables into the lock again, and builds your artboards and components from them: instances of the library's components, fields bound to its variables, texts in its text styles. A second run plans nothing.
3. **When the library changes**, run `kit` again: the change is published and accepted. If the library made a component again rather than changing it in place, FigCraft treats it as another component. The next `app` run then swaps each instance Toghen made (`swap Glyph`), and leaves the instances you placed.

- **`toghen-figma lock design/kit.figcraft --figcraft 7979`** builds nothing: it enables the library, accepts its updates and writes the lock. Use it after publishing a library by hand.
- **A moved library is the same library.** It keeps its id in its file. Give `--library` or `--use` its new path, and the file that uses it points there again, keeping every instance.
- **Headless**, the same with `--figcraft-file design/app.figcraft` in place of `--figcraft 7979`. Both files are opened in one session, and the file that uses the library is saved last.
- **Team libraries**, kept on a `figcraft-server`, are not built: a share link is refused.

### A FigCraft file with no app: continuous integration

A `.figcraft` file can be kept in step with no one at the screen. `--figcraft-file` runs the same sync into the file itself, through `figcraft-cli`, FigCraft's command-line program, with no app open, and saves the file at the end:

```json
"scripts": {
  "figcraft:check": "toghen-figma sync tokens/ds.resolver.json components/*.component.kdl --figcraft-file design/ds.figcraft --dry-run",
  "figcraft:build": "toghen-figma sync tokens/ds.resolver.json components/*.component.kdl --figcraft-file design/ds.figcraft"
}
```

1. **Install `figcraft-cli` 0.8.0 or later** on the machine that runs it, the same version as the app you open the file with. An older one is refused: it cannot read back the stamps Toghen keeps in the file. If it is not on the PATH, name it: `FIGCRAFT_CLI=/path/to/figcraft-cli`.
2. **Run the check, then the build.** The output is a FigCraft run's, followed by `Saved design/ds.figcraft.` A path with no file yet starts a new one there.
3. **Commit the saved file**, or keep it as the job's artifact.

In a job, as a step:

```yaml
- run: pnpm figcraft:check
- run: pnpm figcraft:build
```

- **All or nothing.** A dry run saves nothing. A run that stops partway (a check that fails, a breaking step without `--allow-breaking`) saves nothing either, and exits 1: the file stays as it was.
- **A second run with nothing to change plans nothing**, as with the app. What a person changed in the file by hand is kept and reported, as in *Syncing into FigCraft*.
- **Fonts are the machine's.** A CI machine may lack a font the design system names, and the style plan says so. Setting `FIGCRAFT_NO_SYSTEM_FONTS=1` gives every machine the same fonts, FigCraft's own, and only those.

### A documentation page from the repository: artboard files

A design system documents each component on a page of its own: a frame of instances of its documentation components (a header, property rows, token rows, a frame around the component set), texts filled in, variants chosen, slots filled. An **artboard file** builds that page from a template and a data file, and a second run with changed data patches only what changed.

```json
"scripts": {
  "figma:docs": "toghen-figma components docs/reference.artboard.kdl --input docs/button.tokens.json"
}
```

The template is a kdlet file like a component file, with `artboard <Name>` at the top. The data is a resolver-like document: its tokens are the data, a list is a token whose `$value` is a list of records, and a record can point at the system's own tokens. The format, with an example, is in [component-files.md](./component-files.md#artboard-files).

1. **Give the components and the page in one run.** The page instantiates them, and a `sync` or `components` run builds the component files before the artboard files, each component file after the files defining the components it names. A first-ever dry run counts the sets the run would create as present, and checks the page's instances of them by name only.
2. **`--input` names the data,** once for the run. A second component documented is a second run with its own data file.
3. **Look at the dry run.** It lists the artboard's layers: created, patched, replaced, moved, removed. An instance on the page takes a size like any layer, `width=(literal)480 layoutSizingVertical=HUG`, and keeps it when a later run switches its variant (measured in FigCraft; in Figma it is written the same way, unmeasured). Removing a layer the file stopped producing stops a real run until you pass `--allow-breaking`.
4. **A hand edit** to a text, a property or any field the file sets is kept, and every run notes it until you settle it: change the file to match, or pass `--overwrite-drift` to write the file's value over it. Something the file never mentions is yours and is left alone, as is any layer without our stamp.

An artboard holds no rich text through a property (a text property is a plain string), no Markdown, and no pagination; a cell that needs bold is written as layers.

### Running it from the repository

Through the command line, which carries the files to the plugin; see [Syncing from a repository](#syncing-from-a-repository). `components` runs component files alone, assuming the variables and styles are already in the file:

```sh
pnpm exec toghen-figma components button.component.kdl
pnpm exec toghen-figma components button.component.kdl --page Components --dry-run
pnpm exec toghen-figma components *.component.kdl --resolver tokens.resolver.json
```

- **Paths** are read from the directory you typed the command in.
- **A file with an error builds nothing.** The plugin checks every file before anything is written, and the command prints each problem as `<file>:<line>:<column> <message>` and exits 1. Warnings are printed the same way, with `warning:` before the message, and do not stop anything.
- **`--resolver`** loads the design system into the plugin first, for a file whose axes or bindings come from the tokens. Nothing is synced.
- **`--page <name>`** is the page the set lives on; the current page when absent. **`--dry-run`** plans and writes nothing. **`--allow-breaking`** lets a run take steps that break instances; without it a run that would break any stops before writing.

The command prints no script for an agent to run through `use_figma`: the plugin is the only way it writes to a file.

---

## Sample files

The package's test fixtures include a synthetic design system to try the plugin with:

| File | Load from |
|---|---|
| `test/fixtures/sample.resolver.json` | **Load** pane → drop it, or **Choose…**, then **Load** |
| `test/fixtures/sample.conventions.json` | **Apply** pane → Conventions card → **Load…** |

The plugin's own design system, in `toghen-ui/tokens/`, is a second one; its token files are referenced by path, so load it through the command line, which bundles them.

---

## Troubleshoot

- **The document will not load.** The file must be a resolver document, with `"version": "2025-11-01"` and a well-formed `resolutionOrder`, or a token file, a JSON object of groups and tokens. The message is the core's: it names the file, the reference and the document that holds it, and what the file is not. A resolver document whose `$ref`s name other files loads from the command line, or bundled first (see [Load a token document](#load-a-token-document)).
- **Variables do not sync.** Check that a document is loaded (the Sync pane's header) and read the plan's warnings before executing. A warning that the base collection was built by an earlier sync stops the plan: rename or remove that collection.
- **The conventions file is refused.** The root value must be a JSON array, and every item needs `id`, `pattern`, `property`, `nodeTypes` and `variableType`, non-empty.
- **Audit shows `missing_variable`.** Run variable sync first, then audit again.
- **The export has more in it than expected.** Untick **$extensions**.
- **The command line reports `names no variable`.** The variables are not in the file yet: run `sync`, or `variables` before `components`. In a dry run of `sync` the names its own plan would create count as present. A file with `layout=parts` run against a folded sync reports the same. A name of a folded part is caught earlier, by `check`, which names the variable to use.
- **The run says the component files name each other in a cycle.** Two files that each place an instance of the other's component cannot be built in any order: the message names the files in the cycle, and nothing was written. Take one of the instances out.
- **The plugin says nothing answered on localhost:3055.** The command is not running, or has not reached the pairing step: start it and press Connect again. The plugin keeps trying once a second.
- **The plugin says the command line did not accept the code.** Type the code the current run printed; a code from a run before the plugin was closed is no longer valid.
- **Everything re-syncs though nothing changed.** The stamps live on the variables and styles of the Figma file. A file never synced into holds none, so the first run writes everything; a variable or style made by hand with a token's name is written once, then stamped.
- **Loading an edited document seems to do nothing.** Pick the file again and it reloads.
- **A part stays in the path when you expected a mode.** The dry run says why, one sentence per component, for example `"field": "state" stays in the path, one variable per part: no rest value: "field.disabled.opacity" needs "field.opacity", which is not defined.` A token that would fold needs its rest token: define `field.opacity`, or accept one variable per part.
- **The plan stops on a part axis that takes a collection's name.** The message reads `The part axis "state" folds into a collection of that name, and the base collection or a modifier already has it.` Rename the axis in the parts vocabulary, or lay the component out with `layout=parts`.
- **A file names a modifier the document does not have.** The message reads `VARIANT "State" takes its values from the modifier "state", which the design system does not have`. Remove the `(modifier)` line; see [Move a component file off state modifiers](#move-a-component-file-off-state-modifiers).

---

## See also

- [Model](https://codeberg.org/Toghen/lib/src/branch/main/model.md): components, parts, modifiers and the glossary.
- [Component files](./component-files.md): the format of a component file.
- [Reference](./reference.md): the API and the plugin's protocol.
- [Specs](./specs.md): why the package is built this way.
- [The screen](./ui.md): what the plugin's screen shows and how it behaves.
