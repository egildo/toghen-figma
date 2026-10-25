# @toghen/figma — Technical Specifications

> **Audience:** developers, AI coding agents, and contributors.
> For the user manual and examples, see [guide.md](./guide.md).
> For the API surface, see [reference.md](./reference.md).
> For the UI/UX specification, see [ui.md](./ui.md). What each region of the screen is *for*, and the rules constraining it, live in [ux-map.md](./ux-map.md) and [ux-rulebook.md](./ux-rulebook.md); read those before moving anything.

---

## Purpose

`@toghen/figma` is the Figma-facing adapter in the Toghen ecosystem. It consumes resolver-driven token documents through `@toghen/lib` and projects them into:

- Figma Variable Collections and modes
- Figma Variables
- Figma Styles for composite token types
- Variable bindings on nodes
- W3C token JSON exports with `$extensions` metadata

---

## Architecture

### Plugin Lifecycle

The plugin runs inside Figma's sandboxed environment with two threads:

```
┌─────────────────────────────────────────────────┐
│  Main Thread (code.ts)                          │
│                                                 │
│  figma.showUI() → setupDispatcher()             │
│  figma.on('run') → the run's command, if any    │
│  figma.on('selectionchange') → SELECTION_CHANGED│
│                                                 │
│  Dispatcher routes ui.onmessage to handlers     │
│  Handlers post responses back via postToUi()    │
└────────────────────┬────────────────────────────┘
                     │ postMessage
┌────────────────────▼────────────────────────────┐
│  UI Thread (ui.html → main.js)                  │
│                                                 │
│  commandBus → panel routing → action handlers    │
│  state.js (reactive state) → render.js (DOM)    │
│  icons.js (SVG icon library)                    │
│                                                 │
│  Panes: Load · Sync · Tokens · Selection · Templates │
└─────────────────────────────────────────────────┘
```

### Message Protocol

UI and main thread communicate via `figma.ui.postMessage()` / `figma.ui.onmessage()` using typed message objects. Every message has:

```typescript
{ type: string, payload?: any }
```

See [reference.md](./reference.md#message-protocol) for the full protocol reference.

### Directory Structure

```
toghen-figma/
├── main/                    # Main thread (Figma sandbox)
│   ├── code.ts              # Entry point
│   ├── dispatcher.ts        # Message routing
│   ├── runtimeState.ts      # Plugin runtime state
│   ├── engines/             # Core logic: batchRunner, ioAdapter, operationExecutor, propertyMapper, queryEngine, styleSyncEngine, variableSyncEngine
│   ├── components/          # The component engine: resolve, snapshot, apply, update, run, file (the run for a file's text), stamp, receipt, endOfRun, errors
│   ├── handlers/            # Message handlers, one per command (index.ts lists them)
│   └── utils/               # sum.ts (a token's home per modifier), folds.ts (parts folded or not), standing.ts (what an existing collection is), resolverModes.ts, designSource.ts, shardedData.ts, syncState.ts, templateStore.ts, lockStore.ts (the lock), tokenPath.ts, pageRoots.ts, tokenStamps.ts (the stamps the syncs keep), figma adapters, and more
├── cli/                     # toghen-figma: main.ts (arguments), run.ts (a run through the plugin), bridge.ts (the socket and pairing), figcraft.ts, figcraftFile.ts and figcraftRecord.ts (a run into FigCraft)
├── shared/                  # Shared between main and UI
│   ├── protocol.ts          # Message type definitions
│   ├── operations.ts        # Operation types (plan/execute)
│   ├── conventions.ts       # PropertyConvention interface
│   ├── inputs.ts            # The data an artboard file is evaluated with
│   ├── tokenTypeMap.ts      # Token type → Figma target mapping
│   ├── pendingNames.ts      # Plan operations → the names a dry run counts as present
│   └── components/          # Component files, with no Figma and no Node: read.ts (Toghen's five words), validate.ts, axes.ts, groups.ts, bindings.ts, fields.ts, check.ts, members.ts, model.ts, diff.ts, steps.ts, artboard.ts
├── scripts/                 # expectation-sheet.ts (what the plugin should produce for a document), preview.mjs (serves the screen's preview)
├── ui/                      # UI thread (see ui.md)
│   ├── ui.html              # Shell: tabs, panes, result surface, status bar, popover
│   ├── styles.css           # Every rule of the screen, reading the design system's --tg-* properties
│   ├── main.js              # UI entry point and response routing
│   ├── state.js · render.js # The store, and handing it to each element
│   ├── components/          # Light-DOM custom elements: panes (system, tokens, selection, templates), results, status bar, popover, tabs, base
│   ├── shell.js             # Window resize grip and result-surface splitter
│   ├── commandBus.js        # Figma message bridge: who sent the command that is running
│   ├── bridge.js            # The socket to the command line: pairing and relay
│   ├── inspect.js · format.js · markup.js  # The Inspector, the screen's wording and numbers, and the design system's markup
│   └── dev/                 # The preview page and its fixtures (not shipped)
├── test/                    # Tests
├── build.mjs                # esbuild bundler: the plugin, with the design system's stylesheet from @toghen/ui and ui/styles.css inlined
├── manifest.json            # Figma plugin manifest
└── guide.md · reference.md · specs.md · decisions.md · component-files.md · ui.md · ux-map.md · ux-rulebook.md · ux-smell-log.md   # Documents; ux-* say what each area is for
```

---

## Engine Subsystems

### VariableSyncEngine

Plans variable synchronization by comparing resolved token data against existing Figma collections, modes, and variables.

**Responsibilities:**
- Build the **sum** of the document's contexts (see *Variables per modifier: the sum*): a base collection, one collection per modifier, each token's home from lib's `contextsOf`, a chain of aliases (variables that each point at the next) for a token two modifiers define (`main/utils/sum.ts`)
- Tell an existing collection's standing: the sum's own, an earlier sync's product layout, or foreign (`main/utils/standing.ts`)
- Plan operations: `CREATE_COLLECTION`, `ADD_MODE`, `CREATE_VARIABLE`, `SET_VARIABLE_VALUE`, `RENAME_VARIABLE`, `SET_CODE_SYNTAX`, and `DELETE_MODE` behind `allowBreaking`, with a `BREAKING` row for what it would lose
- Use symbolic IDs for references between operations
- Dirty-check per mode against each variable's stamp (see *Sync-state persistence*)

### StyleSyncEngine

Plans style synchronization for composite token types (typography, shadow/effect, paint).

A text style is a **block**: several properties at once, from `typography`. An
effect style and a paint style are **lists**: one property with several entries,
from `shadow` and `gradient`. These are the core's two kinds of composite, and
`@toghen/postcss` uses the same two words.

**Responsibilities:**
- Map resolved tokens to Figma text styles, effect styles, and paint styles
- Plan create/update operations for style objects
- Bind a member that refers to a token (one field of a composite, such as a typography's size) to that token's existing variable
- Font preloading before text style execution

Figma styles have no modes, so a style plan is built from the document's
**default** mode and warns about the modes it cannot represent. That mode comes
from `resolveSumModes()` (`main/utils/resolverModes.ts`), not from
`getPermutations()[0]`: permutation order follows declaration order and ignores
`default`, so a document declaring `dark` before `light` would build every style from the wrong theme.

A member that refers to a token is the exception: bound to that token's
variable, it follows the variable's modes. See *A member becomes a binding*.

### BatchRunner

Executes operation plans with progress reporting, cancellation support, and symbolic ID resolution.

**Features:**
- Symbolic-id resolution between operations, with a failed producer's dependents reported as skipped prerequisites rather than as their own failures. *Whether a plan is internally consistent* is checked at **plan** time by `main/utils/planSymbols.ts`, not by a separate execution mode (see below)
- Progress callback for UI updates
- Cancellation signal (via `AbortController`)
- Automatic symbolic ID resolution between CREATE and subsequent operations
- Summary/result aggregation

### OperationExecutor

Executes individual Figma API operations:

| Operation | Description |
|---|---|
| `CREATE_COLLECTION` | Create a new Variable Collection |
| `ADD_MODE` | Add a mode to an existing collection |
| `DELETE_MODE` | Remove a mode its modifier no longer has; never the default |
| `CREATE_VARIABLE` | Create a new Variable |
| `SET_VARIABLE_VALUE` | Set a variable's value for a specific mode, a value or an alias |
| `RENAME_VARIABLE` | Give a variable its token's current name |
| `SET_CODE_SYNTAX` | Write a variable's web code syntax |
| `CREATE_STYLE` | Create a new style (text, effect, or paint) |
| `UPDATE_STYLE` | Update an existing style |
| `BIND_VARIABLE` | Bind a variable to a node property; a field of the field table through the field writer |
| `UNBIND_VARIABLE` | Remove a variable binding |
| `APPLY_TOKEN` | Apply: one token on one field of one layer, through the field writer; no stamp |

### PropertyMapper

Handles conventions-based audit and binding flows:

- Pattern resolution (`{component}`, `{variant}` tokens)
- Variable name derivation from node properties
- Binding status detection (`ok`, `unbound`, `missing_variable`)
- Scaffold and apply-bindings plan generation

### QueryEngine

Node querying with wildcard support and scope traversal (`selection` / `page` / `file`).

`*` matches within one path segment, and a query of `**` (the field's default)
or nothing matches everything; every other regex metacharacter is escaped to its
literal self.

### IoAdapter

Handles token JSON export:

- Nested token path serialization, refusing rather than overwriting when a path would make one node both a token and a group
- `$extensions`: each token's stamp is written *into* whatever the token already carries under `com.toghen.figma`, as `stamp`, so keys written by another build survive the round trip. For reading only: a load never reads it back
- One mode per export. A DTCG token file holds a single mode, so the person chooses the mode explicitly (it defaults to the document's) and the filename names it.

---

## Handler Catalog

Handlers are the message-level entry points, one per user action:

| Handler | Message Type | Description |
|---|---|---|
| `loadDocument` | `LOAD_DOCUMENT`, `LOAD_RECENT`, `FORGET_RECENT`, `GET_RECENTS`, `GET_DOCUMENT_STATE`, `GET_SYNC_STATE` | Load the picked files through lib's `load` (a resolver document, one token file or several, under an overrides map), report its collisions as rows, build `DesignSystem`, turn an older build's root record into stamps, remember the document in Recents; answer what is loaded and what the file's stamps say |
| `loadConventions` | `GET_CONVENTIONS` | Answer how many conventions are loaded |
| `resizeUi` | `RESIZE_UI` | Resize the window, and persist the size when a drag ends |
| `inspectCorrespondence` | `INSPECT_CORRESPONDENCE` | Read Figma back and report where every token stands, stamped with when it looked |
| `loadConventions` | `LOAD_CONVENTIONS` | Validate/normalize conventions JSON |
| `getSelection` | `GET_SELECTION` | Report current Figma selection |
| `getSelection` | `GET_FIGMA_COLLECTIONS` | List existing Variable Collections, with their modes |
| `planVariableSync` | `PLAN_VARIABLE_SYNC` | Generate variable sync plan |
| `executeVariableSync` | `EXECUTE_VARIABLE_SYNC` | Run variable sync plan |
| `planStyleSync` | `PLAN_STYLE_SYNC` | Generate style sync plan |
| `executeStyleSync` | `EXECUTE_STYLE_SYNC` | Run style sync plan |
| `exportDocument` | `EXPORT_DOCUMENT` | Export tokens to JSON |
| `auditSelection` | `AUDIT_SELECTION` | Audit node bindings against conventions |
| `planScaffold` | `PLAN_SCAFFOLD` | Plan variable creation + binding |
| `executeScaffold` | `EXECUTE_SCAFFOLD` | Run scaffold plan |
| `planApplyBindings` | `PLAN_APPLY_BINDINGS` | Plan binding-only operations |
| `executeApplyBindings` | `EXECUTE_APPLY_BINDINGS` | Run apply-bindings plan |
| `planApply` | `PLAN_APPLY` | Plan a token, or a group's tokens, on the layers of a scope (*Apply, through the field writer*) |
| `executeApplyBindings` | `EXECUTE_APPLY` | Run the apply plan |
| `readSelectionBindings` | `READ_SELECTION_BINDINGS` | What the selection, the page or the file is bound to, property by property, for the Apply pane |
| `boundLayers` | `COUNT_BOUND_LAYERS`, `SELECT_NODES` | The layers on the current page bound to a variable, and selecting them |
| `tokenGraph` | `GET_TOKEN_GRAPH` | The document's tokens as a graph, for the Tokens pane; also posted after every load |
| `templates` | `GET_TEMPLATES`, `KEEP_TEMPLATE`, `FORGET_TEMPLATE`, `PLAN_BUILD`, `EXECUTE_BUILD` | Component files kept in the Figma file, and building from them |
| `lock` | `GET_LOCK`, `DISCOVER_VARIABLES`, `LOCK_PICK`, `LOCK_FORGET`, `SET_BUILD_OVERRIDES`, `LIBRARY_KEYS`, `LOCK_WRITE` | The lock: library variables by discovery, a component or a style by a person's pick, forgetting a library, Build's overrides map; a library file's own keys, and one library's entry written whole, for the command line |
| `resizeUi` | `RESIZE_UI` | The window's two remembered sizes, the switch and the grip |
| `runComponent` | `RUN_COMPONENT` | Run the component engine on a component file the command line sent, and answer with its report |
| `cancelOperation` | `CANCEL_OPERATION` | Abort the active operation, leaving the plan in place |

---

## Integration Contract with @toghen/lib

The plugin depends on `@toghen/lib` for:

- **`Resolver`**: construction, `load()` for everything loaded (a resolver document, one token file or several, an overrides map; the plugin's `read` is a lookup among the picked files, the command line's reads the disk), `getModifiers()` (the modifiers in the order the document declares them, which is the order of the Figma collections), `getModeName()`
- **The per-modifier queries**: `contextsOf()` for a token's home and its chain (a step that only carries the base says so), `dependsOn()` for the modifiers a component's token group depends on, `valueAt()` for a value in a cell; `resolveContextsToDesignSystem()` for the sum
- **`DesignSystem` / `DesignToken`**: token access and resolution; `referencePath()` for a variable's name, and wherever a lookup path loses its collection segment
- **`Collection`**: `getDefaultMode()` for the default mode (never the first of `getModes()`), `getNodeKind()` for whether a name a component file writes is a token
- **`referencesOf()`**: what a token refers to, so a reference can be written as an alias, and a composite's member as a binding; the reference grammar (`holdsReference()`, `referenceTarget()`, `parseReferencePath()`, `referencesIn()`) for a raw value and a component file, including the references whose segments a file takes from an axis (`{hue.(input)hue.soft}`)
- **The component model**: `partsOf()` (a part token's component, and its twin along each axis), `axesOf()` (a component's axes in precedence order), `childrenOf()` and `applies()` (a component file's group, and the token that supplies each key under a member's selection)
- **`cssPropertyName()` / `cssLinkName()` / `cssIdentifier()`**: a variable's code syntax, a link's (the modifier as written), and the spelling of a key
- **`normalizeColorToSRGB01()`**: color normalization for Figma Variables
- **`normalizeDimensionToPx()` / `normalizeLineHeight()`**: unit normalization for Variables and styles

The plugin is a **consumer** of resolver-driven token inputs; it does **not** reconstruct canonical `.resolver.json` documents from Figma state.

Two answers the core keeps to itself or leaves to its consumers are built in the adapter, each once, in `main/utils/resolverModes.ts`: `pathsInAnyMode()`, the token paths of the sum with the modes each has a value in (the core walks every mode only privately), and `referrersOf()`, who refers to each token (the reverse of `referencesOf()`, which has one consumer). The sum, the token graph, the document's counts and the component files call them. A lookup path is still built by putting the collection's name in front of a reference path, not by `lookupPath()`: in a system of one collection that method reads a first segment named like the collection as the collection, so a group of that name would be lost. A filter over Figma stamps by the collection's prefix stays as it is: no document answers it.

### Values Figma cannot hold as written

The lib accepts a few values that have no Figma spelling, or a different one. The plugin translates what it can and reports what it cannot, naming the token; it never guesses.

- **`transparent`** is a colour with alpha 0, stored structured by the lib, and becomes a `COLOR` variable or paint at alpha 0 with no special case.
- **`currentColor`** has no value until an element uses it, and Figma has no equivalent. A `color` token holding it is skipped and reported, for a variable, a style and a binding alike: `"ds.link.ink" is currentColor, which Figma cannot hold; skipped.`
- **A token may name the value Figma writes**. A token whose CSS value Figma cannot hold (today `currentColor`) says what to write instead, in its extensions: `$extensions["com.toghen"].figma.value`, a reference or a literal of the token's own type. CSS writes the token's value as always; the plugin writes the named one. Each context's own definition of the token carries its own key, since a context's value is already a definition of its own, so a token that is `currentColor` in one tone and a reference in another needs the key only in the first.
  - *What "cannot hold" means.* Exactly the cells the variable plan skips for their value: `currentColor`, and what reaches the plan untyped and unholdable (`inherit`, which the lib refuses as a colour and so stores as written, a colour keyword or percentage, a dimension that is not one dimension). A cell skipped for another reason (a token defined in one context only) is not covered by the key. For a token with no `$type`, the type to check against is the named value's own.
  - *Only where Figma cannot hold the CSS value.* The key on a token whose value Figma can hold is refused, naming the token: the CSS value stays the single truth, and the two outputs cannot drift apart silently. A general "value for Figma only" was considered and rejected for that reason.
  - *Checked like any reference.* A reference must resolve, and its type must be the token's own; a literal must be a valid value of the token's type. A failure is one error naming the token, the context and the reason.
  - *A reference to a token Figma holds is an alias*. A token whose value is only a reference is judged by its target, not by the value the chain ends in. Where the target is a variable (by its own value, or by its key in every context it needs one), the token is a plain alias to that variable, in every mode, with no warning: a chip whose colour is `{t.text}` is an alias of `t/text`, and putting a frame in another tone's mode turns the chip, as it does in CSS. Before this, the plan followed the chain down to `currentColor`, skipped the chip as unholdable, and the only way through was a key on the chip, which made it an alias of the plain colour and stopped it following the modes. A reference whose target is not a variable behaves as it did: a reference to a `currentColor` or an `em` letter spacing with no key is skipped with the referrer's own message (`"ds.chip.bare" is currentColor, which Figma cannot hold; skipped.`); a reference to a token defined in one context only is not skipped but written as its value, with the existing warning `… refers to "ds.t.only", which does not become a variable, so the value is written instead of an alias.` A chain of references is judged link by link, each by its own target. A reference to a variable of a different variable type is not an alias, since the value is written in that case too.
  - *A key on such a reference is refused,* naming the token: `"ds.chip.color" has a figma.value, but it is a reference to "ds.t.text", which Figma holds as a variable; remove the key, so that it follows the modes.` On a context's cell the token is followed by `in <modifier>=<context>`, as in the other refusals. A key that a context only inherits from the base is ignored there, and the context becomes the alias. A key on a reference whose own resolved value Figma can already hold keeps its earlier sentence (`its value is one Figma can hold; remove the key, …`); the new sentence is for a key that was allowed before, because the chain ended in an unholdable value. The key stays where Figma cannot hold the value (a reference to a token that is skipped, or a value that is itself unholdable). Ignoring such a key silently was rejected: a key that does nothing misleads the next reader, and a loud failure on upgrade tells a system which keys to remove.
  - *Measured in a test file:* a variable in one collection aliasing a role variable in a collection with two modes (the role itself an alias to a plain colour in one mode and to another variable in the other) resolves, for a node in a frame set to either mode, to the colour that mode's chain gives. So the chip follows the tone. Whether a sync run writes these aliases end to end in a real file was not run.
  - *Without the key,* `currentColor` and `inherit` stay skipped and reported as above. With it, the token is a variable like any other, with a value in every mode, and a component file that binds it builds.
  - The lib is unchanged: it stores extensions as written. Reading the `figma` key is the adapter's job, as the PostCSS plugin reads the `css` key.
- **A font stack is a fallback in Figma too**. A stack is CSS's way to say "the first of these the platform has", and a text style that names only the first family stops the style sync when Figma cannot load it (`ui-monospace`, a system alias), which leaves every style and component file after it unwritten. A text style takes **the first family of the stack that Figma can load with the style asked for**, as CSS takes the first the platform has.
  - *What is loadable.* A family and style that `figma.listAvailableFontsAsync()` lists. The generic families (`monospace`, `serif`, `sans-serif`, `cursive`, `fantasy`, `system-ui`, `ui-monospace`, `ui-sans-serif`, `ui-serif`, `ui-rounded`) are never in that list and are passed over without being looked up.
  - *It is said.* A style that did not take the first family carries a note naming what it passed over: `"ds.txt.code.sm" uses "Menlo": "ui-monospace" and "SFMono-Regular" are not available in Figma.` A style that takes its first family says nothing.
  - *The choice depends on the machine,* as CSS's does: the same tokens can give Menlo on one Mac and Consolas on another computer. A deterministic rule (the first non-generic family on every machine, skipped when missing) was considered and rejected, since a missing font would cost a style where a fallback was wanted. The drift check hashes the resolved token, not the family used, so two machines do not report each other's styles as drifted.
  - *A style none of whose families loads is skipped* with its reason, `"ds.txt.code.sm" has no family Figma can load: "ui-monospace", "SFMono-Regular", "Menlo", "Consolas" and "monospace" are not available.`, and the rest of the run goes on. A font that was listed and then fails to load at execution is the same skip, not a stop. This is the rule for every value Figma cannot hold.
  - *The dry run checks it,* in the plugin, which is where the list can be read, so `figma:check` reports the notes and the skips before a real run.
  - *Measured in a test file:* `figma.listAvailableFontsAsync()` lists `Inter` and `Roboto Mono` and does not list `ui-monospace`, `monospace`, `system-ui`, `Menlo` or `SF Mono`; loading each unlisted one fails with "the font family … does not exist". The list agreed with loadability for every family probed. The runtime was the connector's, which has no local fonts, so what a designer's own machine lists was not measured; the rule reads the list where the plugin runs.
  - *The variable keeps its meaning.* A `fontFamily` variable holds the stack's first family. A style that fell back to another leaves its family unbound, with nothing said, as the unit rule leaves an `em` letter spacing unbound; the other members still bind. Making the variable hold the family used was rejected: its value would depend on the machine that ran the sync.
- **A letter spacing in `em`** is written to a text style as a percentage of the font size, `{ unit: 'PERCENT', value: em × 100 }`: `0.08em` is 8%, which is the same length.
- **A `letterSpacing` token** (lib type) in `px` or `rem` becomes a `FLOAT` variable in pixels, scoped to letter spacing, as a dimension does. In `em` it is skipped and reported: `"ds.track.wide" is a letter spacing in em, and a Figma variable bound to letter spacing carries pixels; skipped.` *Measured in a test file:* a `FLOAT` variable bound to a text node's `letterSpacing` reads back as `PIXELS` whatever unit the field had before (5.5 stays 5.5 px, not 5.5%), so no number a variable holds can mean a percentage of the font size. A text style that takes its letter spacing from such a token is not affected: the style is written from the resolved value, as a percentage (the bullet above), and the member is left unbound by the unit rule below. Only the variable is missing.
- **A typography member that is not one of Figma's fields** (`fontVariantNumeric`) is not written to the text style, and not reported: the token is still the style, and the member is the CSS side's.
- **A token defined in one context only** (absent from the default) cannot be a variable: a variable needs a value in every mode of its collection. It is skipped and reported, naming the token and the context that defines it.

### Mode naming belongs to the library

A modifier's collection takes its modes from the modifier's contexts, by name, and the base collection has one mode, `default` (`main/utils/resolverModes.ts`). The plugin does not build the product of every modifier's contexts or derive combined names itself, since they could drift from lib's: the plugin writes those names into the user's Figma file, so a mismatch would create duplicate modes rather than reuse existing ones. Where a combined name is still shown, the pane's mode list and the export, it comes from `resolver.getModeName()`.

### Reference resolution belongs to the library

`@toghen/lib` resolves every token reference, including those nested inside
composite values (a typography token's `fontFamily`, a shadow's `color`) and
inside arrays. `flattenDesignSystem()` yields fully resolved tokens, so the
plugin never inspects `{...}` syntax itself.

Narrowing a font stack to one family is still necessary, because Figma names
exactly one family: in a text style's `fontName.family`, and in the STRING
variable a style binds to. That happens where it belongs, at the environment
boundary, once for both: `toFigmaFontFamily()` in `main/utils/figmaTokenAdapter.ts`.
A stack joined into one string would name no font, and nothing could bind to it.

Unit normalization belongs to the library too. `figmaStyleAdapter.ts` and
`figmaTokenAdapter.ts` each carried their own `normalizeDimensionToPx()`, and the
style adapter its own line-height parser, because the library did not export
the ones its handlers use. The adapters call `normalizeDimensionToPx()` and
`normalizeLineHeight()` from `@toghen/lib` and keep only the Figma-shaped
mapping: a ratio or percentage to `PERCENT`, a length to `PIXELS`, `'normal'`
to `AUTO`, and `em` or `%` letter spacing to `PERCENT`, `1em` being 100%.

### A reference becomes an alias

Resolution erases where a value came from, and the plugin may not read `{...}`
itself, so it asks the library: `DesignSystem.referencesOf()` reports what a
token refers to, as written. `snapshotModes()` records, per path and mode, the
target's lookup path as `aliasOf` when the mode's **whole value** is one
reference, not interpolated.

`compareToken()` then writes that mode as `{ type: 'VARIABLE_ALIAS', id }`
rather than the resolved value when the target routes to a variable of the
**same** Figma variable type. The target is linked by `linkVariable()`, the call
that decides the target's own row, so the id is the one its `CREATE_VARIABLE`
produces (`$var:<name>`) or the one Figma already holds, found by its stamp
first and by name second, exactly as for the target itself.

- **First hop.** The alias points at the token the author named, not at the end
  of the chain. A chain of references becomes a chain of aliases, which is the
  structure the document has.
- **Type agreement.** Figma aliases only between variables of one type. A target
  of another type, or one that is not a variable at all, keeps the resolved
  value and adds one `WARNING` naming both paths.
- **Per mode.** A token that is a reference in `light` and a literal in `dark`
  is an alias in one mode and a value in the other.
- **Ordering.** Paths are planned in document order, so a referrer can be
  planned before its target. `buildPlan()` ends with a stable partition that
  moves every `SET_VARIABLE_VALUE` after every `CREATE_VARIABLE`, leaving all
  else in place. The runner resolves an alias's symbolic id like any other, and
  `dependenciesOf()` counts it, so a failed create blocks the alias as a
  prerequisite rather than failing it.
- **Agreement.** `figmaValuesEqual()` already compared alias to alias by id, so a variable a designer aliased by hand to the right target now agrees. Before this, it could never equal a baked value and read as drift (a value edited in Figma since the last sync wrote it) on every sync (smell #35).

Only whole-value references on variable-routed tokens are handled here. A member reference, `fontSize: "{font.size.md}"` inside a typography token, is a style's to write, as a binding; see the next section.

### A member becomes a binding

The second reader of `referencesOf()`. `snapshotModes()` records, per path and mode, `memberOf`: each member that is one whole, non-interpolated reference, keyed by its address (the member's place in the composite: `'fontSize'`, `'0.color'`) and naming the target's lookup path. The StyleSyncEngine turns those it can into `bindings` on `CREATE_STYLE` and `UPDATE_STYLE`, beside the `props`, which still carry every resolved value. A bound field follows its variable, and so follows the variable's modes, which a style on its own cannot.

| Style | Member | Figma field | Variable type | Bound when |
|---|---|---|---|---|
| text | `fontFamily` | `fontFamily` | STRING | when the style's family is the stack's first family, which is what the variable holds; a style that fell back to a later family leaves it unbound (see *Values Figma cannot hold as written*) |
| text | `fontStyle` | `fontStyle` | STRING | always |
| text | `fontWeight` | `fontWeight` | FLOAT | always |
| text | `fontSize` | `fontSize` | FLOAT | always (px) |
| text | `letterSpacing` | `letterSpacing` | FLOAT | written in PIXELS: a dimension, not an `em` or `%` string |
| text | `lineHeight` | `lineHeight` | FLOAT | written in PIXELS: a dimension, not a unitless ratio |
| effect, layer *n* | `color` | `color` | COLOR | always |
| effect, layer *n* | `offsetX`, `offsetY` | `offsetX`, `offsetY` | FLOAT | always (px) |
| effect, layer *n* | `blur` | `radius` | FLOAT | always (px) |
| effect, layer *n* | `spread` | `spread` | FLOAT | always (px) |

- **The unit rule.** A member is bound only when the variable's value means
  exactly what Figma will read in that field. A bound field reads the variable's
  number in the unit the field is in, so a unitless line height of `1.5`, which
  the style writes as 150 PERCENT, would read as 1.5%. Those members keep
  their value, and say nothing: each is an ordinary way to author a token, and
  a warning would appear on every plan.
- **Existing variables only.** The style phase runs after the variable phase,
  and a style plan does not create variables, so every id in `bindings` is a
  real Figma id and never a symbolic one, so `resolveOperationIds()` and
  `dependenciesOf()` need nothing new. The variable is found as the variable
  plan links a token: by the variable stamped for the target,
  else by name in the collection the variable plan uses. Both plans take the
  same optional `collectionName` and pass it through `figmaCollectionNameFor()`,
  so the two phases look in one place. A run whose `--collection` is not the document's name tests this.
- **Fallback that warns.** A target with no variable yet, or a variable whose
  type is not the field's, keeps the value and adds one `WARNING` per member,
  naming the member's path and the target. The first says to sync variables,
  then styles.
- **Clearing on update.** A bound field ignores a written value, so a text
  style's six bindable fields are unbound before its props are written, and only
  then are the new bindings made. Without it, a member that stopped being a
  reference would go on following the old variable. An effect style needs no
  such step: its bindings live in the layers, and assigning `effects` replaces
  them all at once.
- **Atomic enough.** Every variable is fetched before the style is touched, so
  a variable deleted between plan and execute fails the operation with nothing
  written, and a create leaves no empty style behind.
- **Out.** Paint styles: a gradient stop can hold a colour binding, but gradient
  stops are not handled this round. Interpolated references, and members inside
  a member (`fontFamily.0`), since nothing can bind to part of a value.

The style planner's warning that styles have no modes now ends by saying that a
member bound to a variable is the exception, since it follows that variable's
modes.

### Variables per modifier: the sum

Run in a real file: [measured behaviour §11](.reference/figma/measured_behaviour.md#11-the-first-command-line-run-in-a-real-file).

A part is not a modifier, and gets no collection of its own; see [Parts](#parts-axes-from-subgroups-folded-into-modes-or-one-variable-each).

The product, one collection with a mode per combination of every modifier's contexts, does not scale. Two themes and two densities make four modes, a third modifier makes eight, and Figma caps the modes a collection holds. Worse, a component that pins a mode of that collection pins every modifier at once, so a variant also fixes a theme the frame around it should decide.

Figma's own model is the sum. A frame sets a mode **per collection**, and its
children inherit each independently; an alias across collections resolves at the
node that uses it (`variable.resolveForConsumer(node)`, measured; lib's
[specs](https://codeberg.org/Toghen/lib/src/branch/main/specs.md#the-two-consumers-of-the-chain)). That is the
model lib's per-modifier queries were built for: `contextsOf`, `dependsOn`,
`step`, `valueAt`, read from `collection.resolver`.

**The collections.**

1. **A base collection** named after the document (`ds`), with one mode named
   `default`, holds every token no modifier defines: primitives, and every token
   that varies only through a reference.
2. **One collection per modifier**, named after the modifier (`theme`, `density`), with one mode per context, named after the context, the
   default context first (Figma's default mode is `modes[0]`, fixed at creation:
   the existing trap). The mode cap applies per modifier. A component's member can pin a modifier's mode, through an axis that takes its values from the modifier, and its folded part axes pin theirs (see *Parts*).

**One home per token.** Lib's `contextsOf(path)` gives a token's links (the
modifiers whose contexts define it, in resolution order), their steps and its
base.

- *No link:* the variable lives in the base collection. Its value is the base;
  a base that is a reference is an alias to the referenced token's variable,
  wherever that lives, and Figma resolves it at the consumer. Such a token is
  never copied into a modifier's modes.
- *One link:* the variable lives in that modifier's collection. A context that
  defines the token has its step; a context that does not carries the base
  (literal, or alias). Every mode has a value: Figma modes are dense.
- *Two or more links:* a chain of aliases. The head, named for the token, lives
  in the **last** link's collection; each earlier link is a variable in its own
  modifier's collection, named `<path>--<modifier>`. A context of a link's
  modifier that defines the token has its step; one that does not aliases the
  next earlier link's variable, and the earliest link's non-defining contexts
  carry the base. The head's type and description come from the base link.

**Refused, never filled.** The plan reports each of these and writes none of them:

- *A hole*, a combination where a token has no value.
- *A `$type` that varies across contexts*, as today.
- *A non-factorable token*, which lib reports (a partial composite): binding it early, one variable per cell, would bring the product back for that token.

**Old collections are never rewritten.** The product sync made one collection, named after the document. So a collection with the base collection's name that holds any mode other than `default` was built by it: the plan reports it as built by an earlier sync, writes nothing to it, and the run stops before its first write. A collection named after one of the document's modifiers is the sum's own, whatever modes it holds. Moving a file over from the product sync is a migration, designed when a consumer needs one.

**A plan that stops stops the whole command-line run**, a dry run included. When the plan stops (the base collection built by an earlier sync, or a modifier with no default), the command prints `Variable sync stopped, so nothing was written and no style or component was run.` and exits 1, since a style or a component built against variables that were not synced would bind the wrong things.

**A context removed from the document is a mode to delete, behind the gate**
A modifier's collection holding a mode the
modifier no longer has: deleting it loses that mode's values, and a frame or a
variant pinned to it falls back to the collection's default mode, so it is a
breaking step, the twin of a deleted member.

- **The plan lists it as breaking** (`the mode "pressed" of collection "state" is
  gone: values in it are lost, and a frame or variant pinned to it falls back to
  "rest"`), and carries the deletion only when the request allows breaking.
- **A real run without `allowBreaking` stops before its first write** and lists
  every such mode, exit code 1 on the command line, as a component's gate does.
  A dry run lists them and writes nothing. With `allowBreaking`
  (`--allow-breaking`, now passed to the variable plan as well as to components),
  each mode is deleted, after the values of the remaining modes are written.
- **The plugin's own screen** plans without `allowBreaking`: the plan shows the
  mode as breaking and its execute does not delete it. Taking it from the screen
  is not designed; the command line takes it.
- **The default mode is never deleted.** A modifier whose default context was removed has a new default, and Figma's default mode is fixed at creation: the plan reports this and writes nothing to that collection; recreating it is a migration.
- **A collection named after a modifier the document no longer has** is left alone: the plan reports it and does not delete it. Removing a whole collection is not designed.

**What stays.** The diff against what was written, symbolic ids between operations,
variables known by lookup path, styles from composite tokens, the
Inspector's correspondence (now across several collections), and every measured
trap in creation order.

### Figma's mode limit, and the contexts Figma gets

Figma limits the modes of a collection, and the limit depends on the file's plan: 10 on Professional and 20 on Organization, with Enterprise unlimited through extended collections, as Figma's plans table gave it on 23 October 2026 (two readings of the table disagreed about Starter, so it is left out). The REST API caps a collection at 40 modes. A sync of a modifier with 14 contexts failed at the 11th `addMode` after thousands of variables were written, and the dry run before it passed.

**The limit is 10, fixed, for everyone**. Toghen does not read the file's plan and takes no flag for another number: a capability that only the larger plans could use is not one Toghen offers, and ten modes have to suffice. The check runs in the variable plan, so a dry run and a real run find it alike, before anything is written. A collection that would hold more than ten modes stops the plan, as the other plans that cannot proceed do (`stops: true`), naming the modifier and the count: `"hue" has 14 contexts for Figma and Figma allows 10 modes per collection; keep at most 10 of them in figma.include.` The one sentence serves a modifier with no key and one whose key lists too many. Splitting an over-limit modifier across collections was considered and rejected: a modifier is one collection, and a component file pins a mode by the modifier's name.

**A modifier says which contexts Figma gets.** In the modifier's extensions, beside its CSS spelling:

```json
"state": { …, "$extensions": { "com.toghen": {
  "css": { "selector": ":{context}" },
  "figma": { "include": ["rest", "hover", "pressed", "disabled", "invalid"] } } } }
```

- **CSS is unchanged.** Every context is still written. The key is the Figma adapter's, as `css` is the PostCSS plugin's; the lib stores it and reads nothing from it.
- **An include list, not an exclude list**. The key names what Figma shows. Figma then never grows by surprise: a context added to the document later is absent from Figma until someone lists it. An exclude list would have carried a new context into Figma by itself, up to the limit, and over it stopped the plan; the include list was preferred for its stability.
- **The default context must be in the list.** A list without it is an error naming the modifier. A name that is not one of the modifier's contexts is an error. The modes keep the document's order, default first, whatever order the list is written in.
- **With no key,** every context is a mode, and a modifier over ten stops the plan as above. With a key, the listed contexts are counted, and more than ten stops the plan the same way.
- **Tokens.** A token's value in a context Figma does not get is not written. A token defined only in such contexts has no variable and is not reported: nothing was meant to reach Figma. A chain's link for such a context is not written.
- **A context taken out of the list later** is a mode removed: a breaking step, deleted only with `allowBreaking`, as *A context removed from the document* says. A context put in later is a mode added.
- **Component files.** A `(modifier)` axis takes the contexts Figma gets, and so does each part axis a `tokens=` group brings in. A file that names a left-out context, as an axis value or in `modes <modifier>=<context>`, is an error naming it, with the line.

### Names and code syntax

Run in a real file: [measured behaviour §11](.reference/figma/measured_behaviour.md#11-the-first-command-line-run-in-a-real-file).

- **No collection prefix.** A variable's name is its token path without the
  collection segment, `/` between groups: `button/backgroundColor` in the
  collection that is its home. A text or effect style is named the same way. Nothing stored has to migrate: the sum writes new collections and never rewrites old ones. `tokenPathToVariableName()` stays the one function that spells it,
  so component files follow.
- **Keys keep their spelling.** `button/backgroundColor`, as the token is
  written, is what a designer reads in the variables panel.
- **Code syntax is written** (the per-platform name Dev Mode shows for a variable). Every variable gets
  `setVariableCodeSyntax('WEB', 'var(<name>)')` with the name from lib's
  `cssPropertyName`: `button/backgroundColor` shows `var(--button-background-color)`
  in Dev Mode, the name the stylesheet uses. A chain link's code syntax is the
  CSS link's, `var(--tone-alert--scheme)`. Android and iOS are not written:
  their spellings are not Toghen's to invent.
- **A chain link is `<path>--<modifier>`** (`tone/alert--scheme`, in the
  `scheme` collection), the CSS adapter's link rule, so one rule names a link in
  both targets. The suffix is needed: the head lives in another collection under
  the bare name, and a name found in two collections stops a component build.
- **Export is DTCG again.** `ioAdapter` stops writing the collection as the
  top-level key, so an exported file round-trips.

**Checked live** ([measured behaviour §10](.reference/figma/measured_behaviour.md#10-collections-per-modifier-code-syntax-and-pins)):
Figma accepts `--` in a variable name; `codeSyntax` reads back what was written;
an alias into another collection can be made in the same run; a component pins
one collection's mode and inherits the others, an alias across collections
resolving under both pins. The plugin's own sync then ran end to end in a real
file through the command line ([measured behaviour §11](.reference/figma/measured_behaviour.md#11-the-first-command-line-run-in-a-real-file)).

### A large document: the sum everywhere, and a skip instead of a stop

The case this section covers is a large document: seven modifiers of 6, 14, 3, 3, 2, 2 and 7 contexts, with some hundreds of tokens.

**Nothing builds the product.** Loading resolves the sum, never every combination of contexts: a product of that size (21,168 modes in a document of this shape) does not finish loading. Variable sync, style sync and component files work from the sum. So the design system the plugin holds is the sum (`resolveSumModes`): the base, and a mode per context of each modifier.

- **The export** writes one mode, and a mode may be a combination of contexts. It resolves that one combination when asked (`resolver.resolve(input)` with one context per modifier), not all of them in advance. Its screen shows one context per modifier, each at its default, before it runs (R10).
- **A modifier with no default** cannot build the sum. Loading such a document is refused, naming each modifier without a default and saying that the sum needs one. 
- **A component file's checks** (the names it uses, in any mode, and the modes its pins name) read the sum: a pin names one modifier's context, which the sum holds.

**A value Figma cannot hold is a skip, not a stop.** The variable plan skips a cell it cannot turn into a Figma value, and carries on. Typical cases: a colour that is a keyword or a percentage, a dimension that is not one dimension (`8px 13px`, `55%`), a shadow colour that mixes `currentColor`. Many reach the plan through untyped tokens, which lib stores as written. Each such cell is one `SKIP` row (R14) naming the token, the context and the reason, and the plan goes on; the token is skipped whole, never half written, as the plan writes a token whole or not at all. The Inspector reports it as `blocked` with the same reason. The same holds in the style plan: a style that cannot be built from its token is skipped with its reason. A component that binds a skipped token is stopped by the component engine's own check, which names what is missing.

The core computes every value it can (lib, [Token values](https://codeberg.org/Toghen/lib/src/branch/main/reference.md#token-values)): a shadow whose colour mixes a token with `transparent` arrives as a structured colour at the mixed alpha, and builds its effect style. Where the core refuses a value for its type, the plans read the refusal in place of the value (`readToken`), so that token is one skip carrying the core's sentence, and the rest of the plan goes on. An export still stops on it: it writes values, and has none to write.

**Skips are counted by cause** (*ruled 24 October 2026*). Two thousand skips in one count tell a person nothing, and a skip's sentence embeds the token, so nothing can group on it. So each skip carries a `cause` from a closed set (reference, *Plan-only operations*), the summary counts skips by cause, and `skips` is their sum: nothing is counted twice. The command line prints the counts most frequent first and lists the rows of every cause but `unchanged`, the quiet one, ten per cause and then how many more; `--verbose` lists them all (R12: the counts are never cut, the list is). The screen draws one row per skip, as R14 requires; the cause is in the operation for any later use. A plan lists only the tokens it is for: the variable plan says nothing of a style's token and the style plan nothing of a variable's, since such a row recorded nothing that happened in that plan, and counted one token twice (R14).

### What a variable is for: scopes, and opacity in percent (*ruled 16 October 2026, built 17 October 2026*)

> Built. A variable is scoped to the fields its token can fill, and a variable that is an opacity holds a percentage. Its purpose comes from a declaration, then its name, then the tokens that refer to it, then its type. Component files check what they bind. Scopes on existing variables follow the drift rule.

**The problem.** Every variable was created with `ALL_SCOPES`, so every property picker in Figma listed all of them: a designer picking a fill saw spacing and radius, picking a gap saw colours. And an opacity token, a number from 0 to 1 as in CSS, became a `FLOAT` variable holding that number. Bound to a layer's `opacity`, Figma reads a variable as a percentage. *Measured by a consumer* in a real file: a variable holding `1` bound to a layer's opacity reads back as `0.0099999`, so every member that bound it was drawn at 1%.

A W3C token says neither thing. Its `$type` is `number` or `dimension`, and a dimension may be a gap, a radius or a width. So a token's **purpose** (the Figma fields it can fill, and whether it is an opacity) is read from four sources, the first that answers winning.

**1. A declaration wins.** `$extensions["com.toghen"].figma.scopes` is a list of Figma's own scope names, written as Figma spells them (`VariableScope`): `["OPACITY"]`, `["FRAME_FILL", "SHAPE_FILL"]`, or `[]`.

- It may sit on a token or on any group. A token reads the nearest holder: its own key, else the closest group above it with one, up to the collection's root. Lib's `getGroupAttribute()` reads a group's `$extensions`; lib is unchanged.
- It is read from the token's base definition. A context that redefines it is refused, naming the token and the context: a variable has one list for all its modes.
- `[]` hides the variable from every picker; it still works as an alias target and as a binding. This is how a design system hides its primitives. Toghen hides nothing by default. An empty list says only that the variable is hidden, not what it is for: its scopes are `[]`, and whether it is an opacity comes from 2 and 3 as if it declared nothing. So `opacity.half`, hidden by `[]` on its group and referred to by `button.opacity`, holds `55`, and `button.opacity` stays an alias to it. A token hidden this way gives nothing to the scopes of what it refers to, but passes an opacity on as any token does.
- A list holding `OPACITY` makes the token an opacity (below). `OPACITY` with any other scope is refused, since one number cannot be in two units (Figma itself accepts the pair). `ALL_SCOPES` with any other scope, and `ALL_FILLS` with another fill scope, are refused, as Figma refuses them. A scope that does not suit the variable's type (a fill on a number, `OPACITY` on a colour) is refused, as Figma refuses it. A name Figma does not have is refused. `COLOR_OPACITY` is refused (below). A refusal skips the token whole, one `SKIP` naming the token and the reason, as for any value Figma cannot hold.
- A declaration reaches a token's chain links (`<path>--<modifier>`) and its folded parts, which are one variable with it. A part that declares a list of its own is ignored, with a `WARNING` naming the part: the variable is judged on its rest token.

**2. The name is the main source.** A token's last key is read through the table component files already use to infer bindings from a CSS-keyed group (`targets()` in `shared/components/groups.ts`, *Bindings from a CSS-keyed group*), on a text layer and on a frame, and each Figma field it gives maps to a scope:

| Last key | Field | Scope |
|---|---|---|
| `backgroundColor`, `background` (one colour) | `fills` on a frame | `FRAME_FILL`, `SHAPE_FILL` |
| `color` | `fills` on text | `TEXT_FILL` |
| `borderColor` | `strokes` | `STROKE_COLOR` |
| `borderWidth`, `borderTopWidth` and the other sides | `strokeWeight` and the side weights | `STROKE_FLOAT` |
| `borderRadius`, `borderTopLeftRadius` and the other corners | `cornerRadius` and the corner radii | `CORNER_RADIUS` |
| `padding`, `paddingBlock`, `paddingInline`, `paddingTop` and the other sides, `gap`, `rowGap`, `columnGap` | the paddings, `itemSpacing`, the grid gaps | `GAP` |
| `width`, `height`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight` | the same | `WIDTH_HEIGHT` |
| `opacity` | `opacity` | `OPACITY`, and the token is an opacity |

The field-to-scope map sits beside `targets()`, so the component files and the variable plan read one table and cannot disagree. A key the table does not have gives no purpose. `font` gives a text style, not a variable.

Naming a component's tokens by CSS property is Toghen's own component model, not any one system's convention. A system that names otherwise (`button.alpha`) is not wrong; it falls through to 3 and 4, or declares.

**3. Purpose flows along references.** A token with no declaration and no name in the table takes the purpose of the tokens that refer to it, directly or through a chain of tokens that have no purpose of their own, in any mode (`DesignSystem.referencesOf()`, every mode of the sum). `button.opacity = {opacity.half}` makes `opacity.half` an opacity. A token with a purpose of its own stops the walk: its purpose is its own.

- **Scopes:** the union of what refers to it. `color.blue.500` referred to by a `backgroundColor` and a `borderColor` gets `FRAME_FILL`, `SHAPE_FILL`, `STROKE_COLOR`. A union holding `ALL_FILLS` drops the other fill scopes, and one holding `ALL_SCOPES` is `ALL_SCOPES` alone, since Figma refuses either beside the scopes it covers. A referrer that declares `[]` gives nothing.
- **A composite member is a referrer.** A reference inside a composite value gives the member's field (`referencesOf()` reports the member as `at`):

  | Composite | Member | Scope |
  |---|---|---|
  | `typography` | `fontFamily`, `fontWeight`, `fontSize`, `lineHeight`, `letterSpacing` | `FONT_FAMILY`, `FONT_WEIGHT`, `FONT_SIZE`, `LINE_HEIGHT`, `LETTER_SPACING` |
  | `shadow` | `color`; `offsetX`, `offsetY`, `blur`, `spread` | `EFFECT_COLOR`; `EFFECT_FLOAT` |
  | `border` | `color`; `width` | `STROKE_COLOR`; `STROKE_FLOAT` |

  A member not listed gives nothing.
- **Two units meet.** A token reached both from an opacity and from a token that is not one stays plain: it is not an opacity, holds its CSS value, and its scopes are the union without `OPACITY`.
- **An alias joins two variables of the same unit only.** Where a token refers to a variable in the other unit (an opacity referring to a primitive that stayed plain, or a plain number referring to an opacity), the referrer is written as its own value in its own unit instead of an alias, with one `WARNING`: `"ds.button.opacity" is an opacity and refers to "ds.opacity.half", which is not one, so the value is written instead of an alias.` (or `… is not an opacity and refers to "…", which is one, …`). The behaviour is the existing one for a target that does not become a variable; the reason is new.

**4. The type is a fallback, for scope only.** A token none of the above reaches is scoped by its `$type`:

| Type | Scope |
|---|---|
| `color` | `ALL_FILLS`, `STROKE_COLOR`, `EFFECT_COLOR` |
| `dimension` | `GAP`, `WIDTH_HEIGHT`, `CORNER_RADIUS`, `STROKE_FLOAT` |
| `fontWeight`, `fontFamily`, `letterSpacing` | `FONT_WEIGHT`, `FONT_FAMILY`, `LETTER_SPACING` |
| `number` | `CORNER_RADIUS`, `WIDTH_HEIGHT`, `GAP`, `STROKE_FLOAT`, `EFFECT_FLOAT`, `FONT_WEIGHT`, `FONT_SIZE`, `LINE_HEIGHT`, `LETTER_SPACING`, `PARAGRAPH_SPACING`, `PARAGRAPH_INDENT` |
| any other | `ALL_SCOPES` |

The type never makes a token an opacity. A bare `number` is written as it is, so it is never offered to `OPACITY` or `COLOR_OPACITY`, where Figma would read `1` as 1%; Figma has no "all but" scope, so the list names the rest. The `letterSpacing` rule above (*Values Figma cannot hold as written*) is this row.

**What stays at `ALL_SCOPES` is said.** The plan carries one `NOTE` (a new operation kind: shown by the dry run and in the run report beside the warnings, not counted as one) listing those variables: `12 variables are offered to every field: ds.z.raised, …; declare figma.scopes to narrow them.` Nothing else about scopes is reported for a variable that got them by 1 to 4.

**An opacity holds a percentage.** A token that is an opacity by 1, 2 or 3 is written × 100: `1` is `100`, `0.55` is `55`. `toFigmaValue()` takes the unit, and `figmaValuesEqual()` compares in it.

- *The guard.* Every cell of an opacity must resolve to a number from 0 to 1. Anything else, `55` already written as a percentage, a string, is refused, never guessed: the token is skipped whole, `"ds.button.opacity" is an opacity, a number from 0 to 1, and is 55 in theme=dark; skipped.`
- *The comparison sees the unit.* The document's value is compared with Figma's in the unit Figma holds. A variable written as `1` before this round, whose stamp says Figma still holds what was written, disagrees with the planned `100` and is rewritten, not reported as drift.
- *A literal stays literal.* A component file's `opacity=(literal)0.8` is set on the layer as `0.8`: a layer's own `opacity` is 0 to 1. Only a variable holds a percentage.
- `pnpm --filter @toghen/figma expectations` prints an opacity as Figma will hold it, and each variable's scopes, for the sample document (*Build & Test Workflow*).

**Component files check what they bind.** Usage is a check, not a source: a variable's purpose never depends on which component files are synced. The check reads the token's purpose by 1 to 4, not the scopes Figma holds, which a designer may have changed. In `main/components/resolve.ts`, where a binding's variable type is already checked:

- *A unit mismatch stops the component.* Binding `opacity` to a token that is not an opacity, or binding an opacity to any other field, is a problem like a missing variable: `token ds.button.alpha in member "…" is bound to opacity but is not an opacity; declare figma.scopes ["OPACITY"] on it` and `token ds.button.opacity … is an opacity, bound to width`.
- *A scope mismatch is a note.* A variable bound to a field outside its scopes still draws: Figma's typings say scopes "only limit the variables that are shown in pickers", and the Plugin API binds in any scope. The run report's notes name the token and the field, once per token and field: `ds.surface.edge is bound to fills but is offered to STROKE_COLOR only; declare figma.scopes to widen it.`

**Existing variables follow the drift rule.** Scopes are written like values:

- A new variable is created with its scopes (`CREATE_VARIABLE` already carries them).
- The variable's stamp keeps, beside the receipt for each mode, one for the scopes Figma reported after Toghen wrote them, sorted.
- Figma's scopes as the receipt says: nobody changed them. Where the plan's differ, one `SET_VARIABLE_SCOPES` (a new operation) writes them. A scope change is not breaking.
- Figma's scopes otherwise: a designer changed them. That is drift: kept, reported as for a value, and written with `--overwrite-drift`, which now covers scopes too. Scopes are compared as sets.
- No receipt for the scopes, which is every variable made before this round: if Figma holds what Toghen used to write (`ALL_SCOPES`, or `LETTER_SPACING` for a letter spacing), they are rewritten. Anything else counts as a designer's and is kept as drift. So the first run fixes a whole file without overwriting a scope someone set on purpose.

**Not looked at:**
- that `scopes = []` hides the variable from every picker. The Plugin API accepts it (below); what the pickers show was not looked at.

**Measured in the test file** (16 October 2026, through `use_figma`, probe removed afterwards):
- A `FLOAT` variable bound to a frame's `opacity` reads back divided by 100: `55` gives `0.55`, `1` gives `0.01`, `100` gives `1`, and `150` is clamped to `1`. A literal `0.8` set on the node reads `0.8`.
- `scopes = []` is accepted and reads back `[]`. A new variable of either type starts at `["ALL_SCOPES"]`.
- `ALL_FILLS` with another fill scope is refused: `If ALL_FILLS is set, other fill scopes cannot be set`. `ALL_SCOPES` with another scope is refused: `If ALL_SCOPES is set, other scopes cannot be set`. `FRAME_FILL`, `SHAPE_FILL` and `TEXT_FILL` together are accepted as written. `OPACITY` with `GAP` is accepted.
- A scope must suit the variable's type: `FRAME_FILL` on a `FLOAT`, and `OPACITY` or `COLOR_OPACITY` on a `COLOR`, are refused with `Invalid scope for this variable type`. `COLOR_OPACITY` is accepted on a `FLOAT`.
- Figma stores scopes in an order of its own: `["WIDTH_HEIGHT", "GAP", "CORNER_RADIUS"]` reads back `["CORNER_RADIUS", "WIDTH_HEIGHT", "GAP"]`. Hence scopes are compared as sets.
- A paint's opacity cannot be bound through the Plugin API: `setBoundVariableForPaint` accepts only `color`. So `COLOR_OPACITY`, the opacity of a paint, is a field Toghen never binds. Since Update 139 Figma documents `COLOR_OPACITY` as the scope of colour-opacity pickers, and a composed colour (a `COLOR` variable whose value is `{ color, opacity }`, the opacity a number or an alias to a `FLOAT`) lets a paint's opacity follow a variable. Its unit is stated nowhere (an example uses `60`), and a composed colour written and read back in the desktop app would measure it. *Open:* a declaration naming it is refused until that measurement (decisions, *Open questions*, *Measurements only the desktop app can give*); it then joins `OPACITY` as an opacity or is allowed as a plain scope.

---

## Build & Test Workflow

`pnpm --filter @toghen/figma expectations` prints what the plugin should produce for the sample document, `test/fixtures/sample.resolver.json`: modes and their creation order, every variable value per mode in hex, and each style's resolved properties. It runs the real planning engines, so the sheet and the plugin cannot drift: any difference between it and what Figma shows is a bug in one of them. It reads a bundled document only (the JSON is parsed, not loaded, so a `$ref` to another file does not resolve), names the base collection `demo`, and prints its watched variables from the sample's paths, so for another document it is a rough preview at best. A dry run of `toghen-figma variables` prints the plan for any document against the real file.

```bash
pnpm --filter @toghen/figma build          # → dist/ (code.js, ui.html, manifest.json)
pnpm --filter @toghen/figma build:dist     # the same command, kept as an alias
pnpm --filter @toghen/figma build:dist:prod   # as above with NODE_ENV=production
pnpm --filter @toghen/figma build:watch

pnpm --filter @toghen/figma typecheck      # also runs as `pretest`
pnpm --filter @toghen/figma test
```

`build` and `build:dist` are the **same script**: there is one build, and it writes the importable plugin. Only `build:dist:prod` differs, by setting `NODE_ENV`.

For local plugin testing, import `toghen-figma/dist/manifest.json` into Figma via **Plugins → Development → Import plugin from manifest…**.

**Bundle strategy:** uses `esbuild` (not `tsup`) because Figma requires a bundled main file plus a bundled/inlined UI.

---

## Sync-state persistence

What a sync wrote is kept on each object it wrote: a **stamp** on every variable and style, in shared plugin data under `toghen/stamp` ([the ruling](decisions.md#ruled-the-stamp-one-receipt-per-object-for-every-target-20-october-2026)). [reference.md](reference.md#the-stamp) owns the shape. `main/components/stamp.ts` reads and writes one; `main/utils/tokenStamps.ts` holds what the variable and style syncs add to it.

- **What a stamp holds.** The token the object holds (`is.token`: the lookup path the sync keys it by, or a chain link's own key), and a receipt: for each field Toghen owns, a hash of what Figma reported right after the write. A variable's fields are its value in each mode, keyed by the mode's id, and `scopes`, sorted, since Figma keeps them in an order of its own. A style's are the properties a style plan writes (`reportOf`): a text style's font (its family and style: Figma reads it back with variation settings nobody set), size, line height, letter spacing, case, decoration and bound variables; an effect style's effects; a paint style's paints. And the Figma id of the object it was written on (below). No value, no time.
- **Written as each write lands.** The executor (`main/engines/operationExecutor.ts`) reads each write back and stamps it in the same step: `CREATE_VARIABLE` stamps the new variable with its scopes, `SET_VARIABLE_VALUE` adds its mode, `SET_VARIABLE_SCOPES` its scopes, `CREATE_STYLE` and `UPDATE_STYLE` replace the whole stamp. So a run that stops halfway resumes: the next plan holds exactly what did not land. Nothing travels from the plan to the execute handler, and a dry run, which executes nothing, writes nothing.
- **Found by its stamp.** `indexFigmaCollections()` reads every variable's stamp, and the style plan every style's. A variable is the one stamped for its key in the collection the token lives in; a style, the one of its kind stamped for its path. A variable or style renamed in Figma keeps its stamp, so it is found, and a variable is renamed back. A name finds one only to adopt it: an adopted object's receipt is never read, whatever token it names, and the first write stamps it for this token, starting again.
- **Two comparisons.** *Figma against the receipt*: a field that hashes otherwise was changed in Figma since Toghen wrote it. That is drift, whether or not the document moved too; it is kept and reported, and written only with `--overwrite-drift` (`PLAN_VARIABLE_SYNC` and `PLAN_STYLE_SYNC` both take `overwriteDrift`). *The document against the stamp*: where Figma has not moved it holds exactly what was written, so the document against what Figma holds says whether the document moved. A variable's mode is compared by `figmaValuesEqual`, within float32's tolerance; a style by `holds`, every field the plan writes within the same tolerance. It is written where they disagree and skipped as unchanged where they agree. A mode the stamp has no receipt for, or one Figma holds no value in, is written. A mode Figma moved to the document's own value is written once more, which changes nothing visible and stamps it.
- **A copy carries the stamp** ([ruled](decisions.md#ruled-a-copy-carries-the-stamp-20-october-2026)). A person's copy of a variable or a style holds the original's stamp, id and all, and `sortOut` (*The stamp module*, below) tells them apart in `indexFigmaCollections()` and `localStyles()`, the two places the stamps are read: a copy is in neither `variablesByToken` nor a style's index, so nothing writes it, removes it as a move, counts it as covered or exports its stamp. Each copy of this document's tokens is one reported `SKIP` in its plan, `"color/label copy" (VariableID:1:9) is a copy of Toghen's "color/label", left alone`. The one left whose stamp names another id is the original moved: found by its stamp as any other, and where its plan writes nothing to it that stamps it, a `STAMP` step writes its stamp again with its own id, counted as an update.
- **A copy whose original Toghen removes** ([ruled](decisions.md#a-copy-whose-original-toghen-removes-ruled-20-october-2026)) loses its stamp in the same run, so on the next it is not the only object left whose stamp names another id, and is never adopted as the original moved and then removed. The `DELETE_VARIABLE` of a variable a token left behind carries the ids of its copies (`strip`), and the executor removes `toghen/stamp` from each once the variable is gone, and nothing else of them; a removal that is not taken strips nothing. The `BREAKING` row says so: `"color/label" moves from "Demo" to "theme"; the old variable is removed; its copy "color/label copy" (VariableID:1:9) keeps no stamp.` No step removes a style.
- **Nothing about a target is read from the token file.** Ids are file-scoped and one token file feeds several targets. Export writes each token's stamp under `$extensions['com.toghen.figma'].stamp`, for reading, without its `id`; loading a document never reads it back.
- **A token that moved collection** leaves its old variable stamped in the old collection until it is removed, so `main/utils/moves.ts` lists the step on every plan until it is taken (`--allow-breaking`), one for each variable left behind. A stamped variable none of whose receipt's modes is a mode of the collection it is in was moved there by a person, and is never removed. A collection holding variables stamped for this document's tokens, named after no collection of the sum, is reported and left alone.
- **Two machines with different fonts.** A text style whose family falls back on this machine is compared both as this machine would write it and as a machine with the first family would, so each leaves the style the other wrote alone.
- **Collections are found by name**, as before, and carry no stamp: nothing reads one yet.

The cost is reading every variable's and style's stamp on each plan: a few hundred small synchronous reads. There is no shard and no limit: one entry per object, some twenty bytes for each field.

### The first run after the upgrade

Older builds kept one record on the document root ([moved to decisions](decisions.md#moved-from-sync-state-persistence-the-root-record)). `migrateRootRecord(resolver, conversionMap)` (`main/utils/rootRecord.ts`) runs when a document loads, and when the screen asks for the sync state with a document loaded; asked before one is, the record waits for the first load. It stamps each variable and style the record names, then deletes the record and its shards. One way only.

- **A dry run writes nothing.** The command line's `--dry-run` loads the document with `dryRun`, and the migration then works out the stamps and keeps them in memory (`unwrittenStamps`), where the dry run's plans read them as the objects' own: the same drift a real run would report, with no stamp written and the record left. The record is migrated by the first real load, the command line's without `--dry-run` or the screen's; not by the screen asking for the sync state after a dry run's load. A load, not the first write, since it is where the migration already runs, and a plan made after it reads the stamps a write would then take.
- **Only agreement is taken as written.** The record held the token's hash, not Figma's, so what Figma holds now is no proof of what Toghen wrote: a hand edit the old build kept while the document stood still would read as written, and the first sync would overwrite it. So a field is taken as written (its receipt from what Figma reports) only where Figma holds the document's value, and stamped `UNPROVEN`, a hash no report has, otherwise. A variable is proved mode by mode: each mode the record had a hash for starts `UNPROVEN`, and is taken where the variable plan would write it without calling it drift. A style is proved field by field: it starts as holding what was written, the style plan then says what it would write to it, and each field Figma holds that in is taken. A plan that stops, or a token it refuses, leaves every field unproven. Not done: a style field is compared with what this machine would write only, so on a machine that falls back to a later family of the stack, a font another machine wrote with the first stays unproven when another field of the style was edited too.
- **Anything else is drift.** A mode or style field Figma does not agree with the document on is kept and reported, as any drift, naming only the fields it is in, and written with `--overwrite-drift`. That covers a hand edit made before the upgrade, and also a document that moved since the last sync while Figma still holds the old value, which the old build would have written: the record's hash cannot say which of the two it is.
- The scopes the record kept are what Toghen wrote, so they are stamped as such.
- An object already stamped is left as it is. One the record names that is gone is skipped, so a style found by name in its place is adopted and written, never trusted.
- A record that cannot be read names nothing and is deleted. One whose stamps Figma refuses is kept, for the next load to try again. It never throws.

### A recorded hash belongs to one variable (*ruled and built 14 October 2026; by construction since the stamp, 20 October 2026*)

> Built, and since the stamp true by construction: a receipt is kept on the variable it describes. `--overwrite-drift` takes the document's side.

**The problem** was a record keyed by token path: a hash written for one variable survived into the record of the variable that replaced it, so a mode a new collection gained read as already written, and Figma filled it with its default. The rulings stand, met by the stamp ([the record's version](decisions.md#moved-from-a-recorded-hash-belongs-to-one-variable-the-records-rulings-as-built)):

1. **Reading: a receipt counts for the variable it is on.** Only for a variable found by its stamp, not one adopted by name, and only where Figma holds a value for the mode.
2. **Writing: a variable that takes another token starts again.** The first write under a token to a variable stamped for another replaces the stamp; a write under the same token adds to it, so a run that stopped halfway resumes.
3. **`--overwrite-drift` takes the document's side.** A drifted mode is planned as a `SET_VARIABLE_VALUE` with the document's value, and stamped as any other. Without the flag a drifted path is skipped, and its message ends `pass --overwrite-drift to write the document's value`. All or nothing: a list of paths waits until someone needs to keep some drift and overwrite the rest. The screen never sets it, as with `allowBreaking`. Prior art: `kubectl apply --server-side` refuses a field another manager owns, and `--force-conflicts` takes it.

### The stamp module (*first step of the ruling, built 20 October 2026*)

> Built: the module and the test fakes, the variable and style syncs on it (*Sync-state persistence*, above), and the components (see *Identity: what is ours*).

[The stamp](decisions.md#ruled-the-stamp-one-receipt-per-object-for-every-target-20-october-2026) is ruled for every object Toghen writes, so it has one module, `main/components/stamp.ts`, for both. A stamp is one JSON entry under `toghen/stamp` on the object itself: what the object is, a receipt of hashes, and for a set or an artboard's frame where Toghen put it. [reference.md](reference.md#the-stamp) owns the shape.

- **Any object with plugin data.** It takes Figma's `PluginDataMixin`, which a variable, a collection, a style and a node all are, so the two lanes share one reader and one writer.
- **A receipt hashes what Figma reports.** The caller reads each field back after writing it and hands that to `receiptOf`. The hash is the one the artboard digest already used, FNV-1a, now `hashOf` in `shared/components/diff.ts`, over JSON with every object's keys in order: Figma may report a colour's keys in any order, and a value read back as float32 compares exactly with itself where it would not with the JSON number.
- **The id tells a copy from the original.** `setStamp` and `updateStamp` write the object's own id into every stamp, so a stamp written before the id was recorded gets it on its next write, and until then is read as its object's own (`isOwn`). `sortOut(objects, stampOf, find)` is the one place that decides, for variables, styles and nodes alike, and every reader that groups objects by their stamps goes through it (`sortNodes` for nodes). The objects whose stamps name one id that is not theirs claim to be that object: where it exists and its stamp is its own, they are its copies; where it is gone, the claimant with the lowest Figma id, in JavaScript's string order (`'1:10' < '1:9'`), is the original moved, and the rest are copies of it. Grouping by the id a stamp names, not by what it says the object is, finds a copy wherever it was pasted, in another member or on another page. Two objects that both read as their own (stamped before the id, then copied) are not told apart; where only one is wanted, a set or an artboard frame, the run stops as before.
- **A deletion strips its copies.** `strip(object)` removes the `toghen/stamp` key and nothing else. `copiesFinder()` reads every page's stamped nodes once and returns what finds, for a node a step deletes, the nodes outside it whose stamps name its id or the id of a node inside it, as `sortOut` groups them, so a copied frame's copies of the layers in it are found too. A row names only the outermost of them (`outermost`), as a copy is one row (`keepsNoStamp`: `its copy "Footer" (12:3) keeps no stamp`).
- **Reading never throws.** No stamp, a stamp that does not parse, or one with no identity reads as none; of a stamp edited by hand, what has the shape is kept and the rest dropped. What a sync does with an object that has no stamp is the sync's rule, not the module's: a reader that threw would turn one hand-edited entry into a failed run.
- **The fakes hold it.** `figmaMock.ts` keeps plugin data on variables, collections and styles, with the root's checks (namespace, 100 kB per entry, a failing write), as `figmaScene.ts` does on nodes; each write is a call a dry run must not make.

The components' six keys went when the component sync moved over; the module reads them still, one way (*Identity: what is ours*).

### Reading it back for the screen

`main/utils/syncState.ts` turns the stamps into `SyncStatePayload`: whether any variable or style carries one, how many do, whose they are, and, with a document loaded, how much of it they cover. The Load pane's empty state and the Sync pane read that, and it is answerable **before any document is loaded**, which is what lets the empty state say "this file holds a record from Demo" rather than nothing. A stamp holds no time, so the pane says the file was written by a sync, not when.

Two decisions in it are worth keeping straight:

- **Coverage counts stamps held, not values still current.** A token whose
  document value has moved since is counted covered; the stamp exists, the
  document moved, and *Plan* is the thing that says so precisely. The alternative is a
  second dirty check, kept in step with the engine's by hand.
- **A token is measured against the modes it has a value in**, not against every
  mode the document declares, matching `VariableSyncEngine`, which builds
  `staleModes` the same way. A token contributed only by `dark` is complete with
  one receipt; measured against both modes it would read as permanently half-done.

### Recently loaded documents

`main/utils/recentStore.ts` keeps the last five documents a user loaded
in `figma.clientStorage`, per user on one machine, not per file, like the window size and for the same reason. Each entry holds the **bundle**, the self-contained document the core's `load` returned, because a plugin cannot re-read a file from disk: the UI receives a `File` at the moment of picking and nothing afterwards, so an entry without its document would be a row that could be read and not clicked. Beside it the entry keeps the **composition**, what that load read and how, so a recent loaded again can still say where it came from; the payload marks it `fromBundle`. The picked files are not kept: the bundle already holds what they gave, and a resolver document's other files would only be copies of it. An entry kept before the core loaded documents, the document's text alone, is read as a resolver document once and written back in the new shape.

That also closes *"persisting the loaded resolver document"*, which sat in the list below for two rounds: a recents list of one is exactly that feature.

Entries are keyed by the document's `name`, so loading an edited document
replaces its row rather than growing a second one that differs only by
timestamp. Editing and re-loading is a normal working loop, not a new system.

Figma gives `clientStorage` 5 MB per plugin, on the user's own machine, not synced, and lost when the plugin's id changes or the cache is cleared ([figma.clientStorage](https://developers.figma.com/docs/plugins/api/figma-clientStorage/), read 23 October 2026); five bundles of a large document can come near it. The plugin enforces no budget of its own: it attempts the write, and on refusal (`setAsync` rejects) sheds the oldest entry and attempts again, down to none. A recents list must never be the reason a load fails.

---

## Components from files

> The format, its checks and the expansion into members are in `shared/components/`, and need no Figma. The engine in `main/components/` creates a set that does not exist and reconciles one that does; it is proved against the mock and in a real file. Reverts are not built. The command line sends each file to the plugin, which runs the engine (see *The command line*).
>
> The API calls the engine relies on were checked in `@figma/plugin-typings` 1.139.0, and the package typechecks against 1.142.0 since 23 October 2026. The operation order comes from scripts a consumer wrote by hand against the Plugin API, recorded in [measured behaviour](.reference/figma/measured_behaviour.md#7-component-sets-slots-and-layout).

### The problem it answers

A design system that keeps Figma in step with its code today does it with scripts: Plugin API code that creates a frame, appends it, sets its sizing after the resize, binds its fills, pins a mode, adds the slot, combines the members. Every one of those steps has an order that was paid for, and the scripts are the only place the order is written down. They are also specific to one design system, so the next one pays again. And a script that builds a set knows nothing about the set it built last time, so running it again means deleting and rebuilding, which breaks every instance.

Toghen already solved the same problem for tokens. A token document says **what** the design system holds; sync compares it with what Figma holds and changes the difference. Nobody writes the operations. This note applies that shape to components: a file in the consumer's repository says what each component is, and Toghen makes Figma agree with it, in place.

### Settled

| Decision | What it means |
|---|---|
| **A desired-state document, not a script** | The file says what the component is. The order of operations, and every trap it steps around, belongs to Toghen. |
| **The repository is the source** | Files live beside the code they mirror. No coupling to Storybook or any other tool: the file is the whole input. |
| **A kdlet file** | The authoring syntax is [kdlet](https://codeberg.org/egildo/kdlet), a small template language written in [KDL](https://kdl.dev/) v2. kdlet reads the file and evaluates it, and provides inputs, references, guards, `when`/`else`, `each`, `define` and `+call`. It has no elements of its own: Toghen's four layer kinds, its field names and its value rules are the vocabulary kdlet is given. A layer tree is KDL's native shape: a node, its arguments, its properties, its children. |
| **A variant axis is an input** | Toghen evaluates one file once per combination of axis values, minus `exclude`, with the axis values as inputs. Each evaluation is one member's tree. A condition on an axis is a named guard, `guard on { is (input)State on }`, used as `when on …`. Variants, the matrix, `exclude` and the typed properties are Toghen's, built on kdlet's fundamentals. |
| **`when` is inline** | A `when` stands inside the layer it changes: its properties are that layer's fields, its children that layer's child nodes or child layers. A rule that patches a layer by address from outside the tree, and `move`, do not exist. A region in a different parent for each variant is a `define` called under opposite guards. |
| **Figma's vocabulary, spelled as Figma spells it** | Node kinds, property types, field names and enums are the Plugin API's, uppercase included (`FRAME`, `INSTANCE_SWAP`, `layoutSizingHorizontal=FILL`). Nothing is renamed or grouped into invented objects. The first argument of a layer is its address, every field replaces, and `literal`, `property` and `key` are the tags. |
| **A value is a token or a literal that says so** | Every field Figma can bind to a variable takes a reference, `"{space.md}"`, or a literal marked `(literal)`. A bare number is refused. Why a literal is a literal is a KDL comment beside it. |
| **Identity is stamped in the Figma file** | Every node Toghen creates carries a stamp in shared plugin data. Updates find nodes by stamp, never by name, so a renamed layer is still ours and a set is patched in place rather than rebuilt. |
| **The difference is taken in Figma** | The plugin reads, evaluates and validates a file, and the current state lives in Figma, so the comparison runs there too. |
| **The plugin holds the machinery** | A component file reaches the plugin as text, sent by the command line or loaded on the plugin's screen, and the plugin does the rest. The command line and the plugin's screen are the ways in (see *One runtime: the plugin*). |

### Three layers, and only one is Figma's

A component file carries three different kinds of thing, and they generalise differently.

| Layer | What it is | Whose |
|---|---|---|
| **The variant matrix** | Axes and their values, the first value as default, guards and `when` written inside the layer they change, `exclude`, and the expansion into members | Nobody's. kdlet gives the guards and the `when`; the axes, `exclude` and the matrix are Toghen's, built on top. It is the shape [class-variance-authority](https://cva.style/docs/getting-started/variants) and Stitches arrived at independently, applied per part as in [Chakra's slot recipes](https://www.chakra-ui.com/docs/theming/slot-recipes). |
| **The values** | A reference to a token, or a literal on purpose | Toghen's: the same references a token document writes, read by the core's [reference grammar](https://codeberg.org/Toghen/lib/src/branch/main/reference.md#reference-grammar). |
| **The node vocabulary** | Four node kinds and the fields the Plugin API gives them | Figma's. |

The first two are target-agnostic, and they are tested without Figma: the matrix evaluates a file into members, and the value rule refuses what is neither a token nor a declared literal. The third stays Figma's on purpose. A portable component model compiled to several targets has been tried more than once, and the attempts either died ([Lona](https://github.com/Lona/Lona)) or survived by narrowing to code frameworks ([Mitosis](https://mitosis.builder.io/docs/overview/)). A design system that rules that *Figma never talks about code* has no use for one either.

### The file

One component per file, named `<component>.component.kdl`.

- The top-level words are Toghen's five, `component <Name>` (with no body, and `tokens=` to name its token group), `description`, `properties`, `exclude` and `include`, kdlet's `guard` and `define`, and one root `FRAME`. kdlet hands the five back unread. The format in full is [component-files.md](./component-files.md).
- `properties` declares the component properties, one child each, by Figma's type: `VARIANT <Axis> <value>…` (the first value is the default), `BOOLEAN <Name> default=#true`, `TEXT <Name> default="…"`, `INSTANCE_SWAP <Name> default=<Component>`, `SLOT <Name> description="…"`. One block for all five types means two properties cannot share a name, which is the collision Figma resolves by silently renaming one. A variant value may not contain `,` or `=`, which Figma's member names use; an axis name may not contain a dot either, since a guard reads it as `(input)<Axis>`. A `BOOLEAN`, `TEXT`, `INSTANCE_SWAP` or `SLOT` property is not an input: it stays wired in Figma by `(property)`.
- **A layer** is a node named `FRAME`, `SLOT`, `TEXT` or `INSTANCE`. Its first argument is its layer name, which is also its **address**: the diff finds the layer by it, so names are unique within a member. A `SLOT`'s argument is its property's name.
- **A field** is a KDL property on the layer, named as the Plugin API names it. A field whose value is a list or a structure is a child node instead: `fills`, `strokes`, `gridRowSizes`, `gridColumnSizes`, `grid row= column=`, `modes <Collection>=<mode>`. kdlet hands over a child node written with properties or children as a structure, which it gained for this: a renderer may have a field whose value is a structure.
- **Values:** `"{a.b}"` is a token reference; `(literal)8` or `(literal)"#ffffff00"` is a literal on purpose; `(property)"Show Nav"` wires the field to a component property; `#null` clears a size limit (`minWidth`, `maxWidth`, `minHeight`, `maxHeight`). A `width` or `height` has nothing to clear to, so `#null` there is refused, naming the sizing to write instead (`layoutSizingHorizontal=HUG`, or `FILL`). A doubled brace is a literal one, as in a token's value ([reference grammar](https://codeberg.org/Toghen/lib/src/branch/main/reference.md#reference-grammar)): `characters="{{size.sm}}"` is the text `{size.sm}`. Enums are bare words (`HORIZONTAL`), booleans are `#true` and `#false`.
- **Variants:** an axis is an input. A condition on one is a named guard, `guard active { is (input)State hover pressed }`, and `when active …` stands inside the layer it changes. Every field replaces. `else` and a bare `else` follow a `when`. A region that sits in a different parent per variant is a `define` called with `+name` under opposite guards.
- `exclude <Axis>=<value>…` names a combination never built, one value for each axis it names. Figma has no notion of an invalid combination; a sparse set lacks those members.

#### Worked example: a layout with slots, a grid and a region that changes parent

The hardest component the design has to carry: variants that change a grid's tracks, booleans that hide regions, four slots, and one variant that puts a whole region in another parent.

```kdl
component Shell
description "The outer layout of a screen: a header, a nav rail, the content and an aside."

properties {
    VARIANT Columns "grow fixed" "fixed grow" "grow share" single
    VARIANT "Header in" page content
    BOOLEAN "Show Nav" default=#true
    BOOLEAN "Show Aside" default=#true
    SLOT Header description="The title and its commands."
    SLOT Nav description="The rail."
    SLOT Content description="What the screen is for."
    SLOT Aside description="The panel beside the content."
}
exclude Columns=single "Header in"=content

guard fixed-grow { is (input)Columns "fixed grow" }
guard grow-share { is (input)Columns "grow share" }
guard single { is (input)Columns single }
guard header-in-content { is (input)"Header in" content }
guard header-in-page { not header-in-content }

// The header region sits in a different parent per variant, so it is written once and called where it goes.
define header-region {
    // The hairline between regions has no token of its own.
    FRAME "Header region" layoutMode=VERTICAL layoutSizingHorizontal=FILL layoutSizingVertical=HUG paddingTop="{space.lg}" paddingBottom="{space.md}" strokeBottomWeight=(literal)1 {
        strokes "{border.subtle}"
        SLOT Header layoutMode=VERTICAL layoutSizingHorizontal=FILL layoutSizingVertical=HUG minHeight=(literal)48 clipsContent=#false
    }
}

// A layout takes its size from the screen in code; Figma needs one.
FRAME Shell layoutMode=VERTICAL width=(literal)1440 height=(literal)900 {
    fills "{surface.page}"
    when header-in-page { +header-region }

    FRAME Body layoutMode=HORIZONTAL layoutSizingHorizontal=FILL layoutSizingVertical=FILL {
        FRAME "Nav region" visible=(property)"Show Nav" layoutMode=VERTICAL layoutSizingHorizontal=HUG layoutSizingVertical=FILL strokeRightWeight=(literal)1 {
            strokes "{border.subtle}"
            SLOT Nav layoutMode=VERTICAL layoutSizingVertical=FILL minWidth=(literal)240 clipsContent=#false
        }

        FRAME Lanes layoutMode=GRID layoutSizingHorizontal=FILL layoutSizingVertical=FILL {
            gridRowSizes { FLEX; }
            gridColumnSizes { FLEX; HUG; }
            when fixed-grow { gridColumnSizes { HUG; FLEX; } }
            when grow-share { gridColumnSizes { FLEX 1; FLEX 1.618; } }

            FRAME "Main lane" layoutMode=VERTICAL layoutSizingHorizontal=FILL layoutSizingVertical=FILL paddingLeft="{space.lg}" paddingRight="{space.lg}" {
                grid row=0 column=0
                when header-in-content { +header-region }
                SLOT Content layoutMode=VERTICAL layoutSizingHorizontal=FILL layoutSizingVertical=FILL clipsContent=#false
            }

            FRAME "Aside region" visible=(property)"Show Aside" layoutMode=VERTICAL layoutSizingHorizontal=FILL layoutSizingVertical=FILL strokeLeftWeight=(literal)1 {
                grid row=0 column=1
                when single visible=#false
                strokes "{border.subtle}"
                SLOT Aside layoutMode=VERTICAL layoutSizingVertical=FILL minWidth=(literal)384 clipsContent=#false {
                    when grow-share minWidth=#null
                }
            }
        }
    }
}
```

**What it expands into.** Four `Columns` values by two `Header in` values is eight combinations; `exclude` removes one, so the set has **seven members**. The member of all first values, `Columns=grow fixed, Header in=page`, is the file with no `when` holding, and is placed top-left, which is how Figma picks a set's default variant.

The member `Columns=grow share, Header in=content` is the file evaluated with two guards holding, and with the header region under `Main lane`:

- `Lanes` has `gridColumnSizes { FLEX 1; FLEX 1.618; }`, a golden split, written by a `when` that stands in `Lanes`, and the `Aside` slot has no `minWidth`, written by one inside it;
- `Header region` is no longer the first child of `Shell`: `header-in-page` does not hold, so that call is not made. `header-in-content` holds, so the call inside `Main lane` is: it is the first child of `Main lane`, above the `Content` slot, and `Shell` holds only `Body`. The layer has one address, `Header region`, in both members, so the diff finds it under its other parent and moves the same node.

Its name in Figma is `Columns=grow share, Header in=content`, written at creation. The four slots are four properties of the set, shared by name across all seven members.

**A `when` that replaces a wired field unwires it.** In the `single` members the `when` sets `visible=#false`, which replaces `(property)"Show Aside"`. There, `Show Aside` exists and does nothing. That is the intended reading here, since the aside is gone in a single lane, but it is also exactly how a property goes dead by accident, so validation reports every member where a declared property ends up wired to nothing.

### From file to Figma

```
repository                                   Figma, one script
─────────────────────────────────────────    ─────────────────────────────────────────────
file ─read─▶ model ─validate─▶ members ──────▶ snapshot ─diff─▶ steps ─apply─▶ component set
                                              (stamped nodes)       (dry run stops here)
```

1. **Read** the file with kdlet, and the five words that are Toghen's into a TypeScript model. The model is the contract; KDL is its syntax.
2. **Check** the properties, the exclusions and the guards against the axes: every guard reads only variant axes and lists only values they have; every `exclude` names a variant with one of its values; the default member is not excluded. kdlet has checked what is its own: every `when` names a guard in scope, every reference resolves.
3. **Evaluate** the document once per combination and check each tree: kdlet's tree, then Toghen's checks on it (kinds, fields, value forms), then the member as a whole (a grid put on a slot, a grid child left without a cell, flex fields on a grid), and for the set as a whole, every `BOOLEAN`, `TEXT` and `INSTANCE_SWAP` property wired by some layer of some member, every `SLOT` property with exactly one `SLOT` layer in every member, and a warning where a property is wired to nothing in a member.
4. **Snapshot**, in Figma: find the set, its members and their layers by stamp, and resolve every reference, component and mode the members name.
5. **Diff** the members against the snapshot into steps. This part is pure and is tested without Figma. A dry run returns the steps and writes nothing. Covers creation, the foreign refusal and reconciliation.
6. **Apply** the steps in the order the traps impose:
   1. create each new member's root as a component named for its combination;
   2. append every layer before sizing it;
   3. give a text its style and characters before sizing it;
   4. set `layoutMode`, then tracks, then place grid children; `layoutWrap` after `layoutMode` (`WRAP` throws on a frame with no layout, measured §14), `counterAxisSpacing` after it, a child's cell alignment once it has its cell, `layoutPositioning` before the child is sized or placed, `x` and `y` after;
   5. resize before hugging;
   6. clear a new frame's white fill;
   7. apply `strokeWeight` before the per-side weights, and a declared `strokeAlign` after them;
   8. bind paints through the copy `setBoundVariableForPaint` returns, carrying the colour their variable resolves to;
   9. pin modes before combining;
   10. create slots on each member;
   11. add and wire the other properties before combining;
   12. combine;
   13. lay out the members with the default top-left;
   14. then set slot descriptions and settings.

   Each step is keyed to a measured trap in [measured behaviour](.reference/figma/measured_behaviour.md#7-component-sets-slots-and-layout).

**A token on any field, bound where Figma can bind it.** The rule, said once: a token may go on any field whose row in the field table has a `token` column. Where Figma can bind it (the column's `bind`), its variable is bound. Where Figma cannot, on a field or on part of one, the token's resolved value is written, and the run's report says so once per run, field and layer, in a dry run as in the real one (R10: it is on screen before the command runs): *"fills" of "Badge/Dot": the colour's alpha is written as its value in "light/comfortable"; it will not follow the token until the next run*. A written value follows one context only, the declared defaults: the core's default mode (`getDefaultMode()`, the sum's `defaultMode`), the same in every member, named in the report by its mode name. The value is the core's answer from the loaded document, never read from Figma, so a token that needs one stops the run with its line when no document is loaded, naming what it needs, as a `(modifier)` axis does. One function writes every field that carries a token, `writeField` (`main/components/fieldWriter.ts`), and its twin `reportField` reads what Figma reports for the receipt, parts as the table says.

One part of a field is written as a value: **a colour's alpha on a paint.** Figma binds a solid paint's colour and not its `opacity` (measured §14), so a colour token whose alpha is below 1 binds the colour and writes the paint's `opacity` as the alpha at the defaults. The paint's receipt holds the variable only: the alpha is the variable's in whatever mode the layer is in, so the opacity is not compared, a second run writes nothing, and a hand change to the opacity is not drift (ruled 24 October 2026; before it the receipt held the opacity computed at the defaults, and a layer pinned to a mode with another alpha was rewritten on every run). With no document loaded, a colour stops the run only when its variable holds an alpha below 1: Figma is read to tell that a value is needed, never for the value. A literal's alpha (`(literal)"#ffffff80"`) is the paint's opacity, as it always was.

Four whole fields are written as a value, each measured `Unknown field` to `setBoundVariable` (§14): **`x` and `y`** from a dimension, **`cornerSmoothing`** from a number, and **`dashPattern`** from a `strokeStyle` token, as its `dashArray` in pixels (a `strokeStyle` that is a keyword, such as `dashed`, names no lengths and stops the run). A token of a type the field does not take stops the run with its line. Toghen adds no token type for any of them.

**Gradients, effects and layout grids bind by parts.** A `gradient` token on a paint, a `shadow` or `dimension` token on `effects`, and a layout grid's fields are bound one part at a time, because that is how Figma binds and reports them. The core gives the token's value at the defaults and says which of its members are references; a member that refers to a token with a variable is bound to that variable, and any other is written, with one report line naming the parts. A gradient's stops bind by the alias written into each stop, its positions and angle are written; a shadow's five fields bind with `setBoundVariableForEffect`; a layout grid binds only the fields its alignment takes, and the file may write no other, since Figma refuses them (measured §14). A grid's colour cannot bind and is written. `effects` and `effectStyle` are never both on a layer: two writers of one list would disagree. The format is in [component-files.md](component-files.md#gradients-effects-and-layout-grids).

**A text's fields.** A text takes its font's halves (`fontFamily`, `fontStyle`, `fontWeight`), size, line height, letter spacing, paragraph spacing and indent as tokens bound on the whole text: Figma binds a text field per range (`setRangeBoundVariable`) and reports it on the node as an array of aliases, which a receipt reads as bound when every alias names one variable, as it reads the corners of a radius. A component file describes a text as one run of characters; a text whose ranges differ is a person's. Three of Figma's facts shape the rest (measured §14). A bound line height or letter spacing is always pixels, so a unitless line height (a multiplier) or an `em` letter spacing is written as its value, a percentage, at the declared defaults, with the report's line; which a token is, only its unit says, so a token on either needs the document loaded. `fontWeight` cannot be assigned, only bound, so it takes a token and nothing else; Figma picks the style, or sets a variable font's axis. `maxLines` is dropped without a word while `textTruncation` is `DISABLED`, so it is written after it. `listSpacing` and `maxLines` cannot be bound and are always written as their value. A `fontFamily` token that is a stack binds its variable, which holds the first family, as variable sync writes it; the report says so, as style sync says a style that fell back. Writes go in this order, after the characters, since a binding needs the text's length: the font's halves, with the font they name loaded first and the font the text ends with loaded after; the rest; `maxLines` last. **A text field beside `textStyle` is refused, naming both** (maintainer's ruling, 22 October 2026): a style override is a second source for one value. Alignment, truncation and `maxLines`, which a text style does not set, go beside a style.

**`visible`, `characters` and properties bound to a token.** A `boolean` token binds `visible`, a `string` token `characters`, with `setBoundVariable`; a `(property)` wire on either stays as it was. A `set` value on an instance binds a `boolean` or `string` token's variable to a `BOOLEAN` or `TEXT` property through `setProperties` with an alias, read back in the instance's `boundVariables.componentProperties`; a property's `default` binds the same way, through `addComponentProperty` or `editComponentProperty` with an alias. DTCG defines neither type: the type map routes them, Toghen adds none, and a document that has them can bind them. A bound default is re-set on every run: the diff, which runs without Figma, cannot tell a variable from a token path. An instance swap's default is not: the run tells the diff the id of the component the file names (`defaultComponent` in its receipts), and the default is set only when the target holds another, or when the component cannot be found. A layer wired to a property whose default is bound shows what the variable holds in its collection's default mode.

**Creation steps are not fields.** Four writes go with making or writing a layer and are not fields of it: a new frame's white fill, and a member's or an artboard's, is cleared when the file declares no `fills`; a new line's black stroke is cleared when it declares no `strokes`; a layer that declares a side's weight and no `strokeWeight` is given `strokeWeight = 0` when it is made, so the sides it does not declare are none; and writing any side's weight sets `strokeAlign = 'INSIDE'`, since per-side weights draw inside (measured §7). None has a receipt, so a hand edit of them is not seen. The align stays a step of writing a side, so a set built before draws as it did, until `strokeAlign` is a field of its own.

**One validator, not two.** Validation is in TypeScript over what kdlet returns, not in a JSON Schema: with KDL there is no editor to feed a JSON Schema to. It drops an artifact and a dependency (`ajv`), and it puts every refusal in one place with one message style.

The checks run in stages that share one report:

- kdlet's reader refuses what is malformed on its own (a reserved word with the wrong shape, a guard out of scope, a property written twice), and `read.ts` reads the five words that are Toghen's.
- `axes.ts` answers the axes a file takes from the design system.
- `validate.ts` holds the properties, the exclusions and the guards against the axes, and `groups.ts` works out each named group's binding plan.
- When none of that is an error, each combination is evaluated. kdlet reports what it finds in the evaluation (a missing value, an unknown tag), and a tree it had problems with is not checked further.
- `check.ts` refuses what is wrong with a layer and its fields on their own (an unknown field, a value of the wrong kind, a bare number), `validate.ts` refuses what is wrong in relation to something else in the member (a property nothing wires, a grid child with no cell), and last the members are checked together.

A stage that cannot run says nothing, so a file is not told about a duplicate name until the spelling of its fields is fixed. A problem every member has is said once. Every field the file writes keeps the line and column it was last written at, so a problem found in a member after a `when` wrote it points at the `when`.

The checks read token references with the core's grammar. Both runtimes that read a component file, the plugin's main thread and the command line, carry `@toghen/lib`, so `read.ts`, `members.ts`, `axes.ts` and `check.ts` import what they need from it; only `DesignSource` holds no lib, so the reader can be given its answers from anywhere.

**References resolve by name, and never fall back.** A reference `{a.b}` names the variable, or the text or effect style, that variable sync writes for that token. One function spells that name, `tokenPathToVariableName()`, so it follows variable sync when the [collection-name prefix](decisions.md#known-redundancy--the-collection-name-prefix) goes. It is looked for across every local collection. A name that matches nothing stops the build, and so does a name that matches in two collections: the error lists both, and there is no syntax for choosing, because a design system whose names collide has a naming problem a prefix would hide. A reference never becomes a literal: a component that silently stopped following its tokens is the defect this whole design exists to prevent.

**Modes resolve by name too.** `modes Scale=small` pins the mode `small` of the local collection called `Scale`, whoever made it. A collection or mode that does not exist stops the build. A collection no local one is named after is looked for among the libraries the run declares (`--use`), through the lock: a library's entry holds no collections, but each variable id is `<collection>/<name>`, so the collection is the one whose variables' ids begin with its name, and the lock's format needs nothing new. Found in this file and in a library, or in two libraries, the name stops the build naming each, as a component found twice does. *Ruled 24 October 2026:* a library collection's mode is pinned in FigCraft, by `library.setVariableMode`, which copies the collection in and checks the mode's name; Figma refuses it with one sentence, in a dry run as in a real one, until pinning a remote collection with `setExplicitVariableModeForCollection` is measured in the desktop app (decisions, *Measurements only the desktop app can give*). Importing a library variable is measured, pinning its collection is not, and this project measures before it builds. Toghen's variable sync makes one collection per modifier (see *Variables per modifier: the sum*), so a pin names the modifier and the context: `modes state=hover`.

### Identity: what is ours

Deleting a component set and building it again changes its key, and every instance of it, in every file that uses it, breaks. So the durable behaviour is to **reconcile in place**, the way desired-state systems do ([Terraform's plan](https://developer.hashicorp.com/terraform/cli/commands/plan), [Kubernetes controllers](https://kubernetes.io/docs/concepts/architecture/controller/)): compare what is there with what the file says, and change only the difference.

Reconciling needs to know what is ours, and a name cannot say it: a designer renames layers. So every node Toghen creates carries a **stamp** (*built 20 October 2026*, [ruled](decisions.md#ruled-the-stamp-one-receipt-per-object-for-every-target-20-october-2026)), one entry of shared plugin data, `toghen/stamp`, saying what the node is and what Toghen wrote there. [reference.md](reference.md#stamps) owns the shape.

| Node | What it is | Its receipt |
|---|---|---|
| component set | the component's name in the file; where Toghen last put it | the component properties Toghen added, since a property cannot carry data of its own |
| member | its combination, `Columns=grow share, Header in=content`, and its root layer's address | its root layer's |
| layer | its address in the file | the fields Toghen owns on it |
| artboard frame | the artboard's name, and its root layer's address; where Toghen last put it | its root layer's |

The snapshot finds them with `findAllWithCriteria({ sharedPluginData: { namespace: 'toghen', keys: ['stamp', <the facet's old key>] } })` on each page after loading it with `page.loadAsync()`, so a set is found wherever a designer moved it.

**A receipt, and two comparisons.** For each field Toghen owns on a layer the receipt holds a hash of what Figma reports for it, read back once the run's writes are done (`main/components/receipt.ts`): after a member joins its set, since its wired layers then take the set's keys. Hashing what Figma reports makes a later read compare exactly, since both sides read a field as the same plain data, every number as float32. A field bound to a variable reads as its variable, whatever value it resolves to, so a token's new value is not a hand edit. Figma reports a bound `cornerRadius` on its four corners and a bound `strokeWeight` on its four sides, with no key for the field itself: such a field reads as bound when every part is bound to the one variable, and as matching no file's value when its parts are bound apart. The list of fields Toghen owns is the receipt's keys, so a field the file stopped declaring is found from it, reported once, and dropped. Each declared field of a layer that exists is compared twice:

- **Figma against the receipt.** A field whose report differs was edited by hand since Toghen wrote it. It is drift: kept, and noted on every run until someone settles it, as for a variable; with `overwriteDrift` (`--overwrite-drift`) the file's value is written over it and the run warns that it did. A hand edit is seen even where the file has moved too. Where Figma already reports what the file's value would leave, the two agree: nothing is written or said, and the field's receipt is taken again, as a variable's mode Figma moved to the document's own value is stamped.
- **The file against the receipt.** What Figma would report for the file's value is worked out from the names the run resolved (a token as its variable, a wired field as the set's key for its property, a colour as float32). A field whose expected hash differs moved in the file and is written.

A field that matches both is skipped, so a member nobody changed is not written at all; a layer is patched only for a field to write, a receipt to take again, a field to drop, or in a set a name that is not the file's. A field that is not in the receipt, or has no hash there, is written. Writing a field writes again what it resets: the corners after `cornerRadius`, the sides after `strokeWeight`, the sizing after a resize, an instance's declared sizing after its properties (a variant switch may resize it). A paint bound to a colour variable is compared by its variable only (*ruled 24 October 2026*): its alpha is the variable's, which a target paints in the layer's mode, so an opacity worked out at the defaults disagreed with a layer pinned elsewhere and was written on every run. A person who changes a bound paint's opacity by hand is no longer seen; an explicit paint opacity is still compared. A receipt that held the opacity is taken again once, with no write.

**A file that says two things about a size is refused** (*ruled 24 October 2026*). A width or height bound to a token, written or from `tokens=`, is a fixed size. Beside `HUG` or `FILL` on the same axis, or a text's `textAutoResize` that sizes that axis (`HEIGHT` or `WIDTH_AND_HEIGHT` for a height, `WIDTH_AND_HEIGHT` for a width), the target settles on one and every run writes the other again. The per-member check, which `check`, a dry run and every run share, artboards included, refuses the pair, naming both fields and the token, and the author chooses. *Not chosen:* an explicit sizing that wins and leaves the token unused; a bound size that wins and overrides the sizing. A precedence rule hides the contradiction from the person who wrote it. Where the expected form is a guess (a text that is also the name of a component the file swaps in, a value Figma rounds otherwise than to float32), the cost is a write on every run, never a missed edit: the receipt is what Figma reported.

**Before the stamp**, a node carried up to six keys (`component`, `properties`, `member`, `address`, `artboard`, `placed`), and a layer's record named its fields without a hash. Such a node is read as today, its fields owned with no hash, so the next run writes each of them once, as the old code wrote a member's on every run; its stamp is then written in the new form and the old keys deleted. An artboard's layer is the exception: the old code wrote it only when its file moved, so a field edited by hand since was kept. Its fields are read as not proven to hold what Toghen wrote: one Figma holds the file's value in agrees and its receipt is taken, any other is drift, kept and reported. One way: nothing writes the old keys.

Page by page, never on the document: the plugin, under `documentAccess: dynamic-page` (the manifest setting that makes a plugin load pages one at a time), may not search the document as a whole without it even after every page's `loadAsync()` ([measured behaviour §11](.reference/figma/measured_behaviour.md#11-the-first-command-line-run-in-a-real-file)). A per-page search is allowed in both runtimes (`main/utils/pageRoots.ts`). 

| Situation | What the diff does |
|---|---|
| no set stamped with this component | create it, stamped, on the page the command names |
| a set of that name, not stamped | **foreign**: refuse, naming it. Never adopted by name |
| a stamped member the file still has | patch it in place |
| an axis the file renamed, and nothing else about the axes | rename it in place and stamp the members again (see *A renamed axis, and a set Figma reports as broken*) |
| a combination the file has and the set lacks | create the member, stamp it, append it to the set |
| a stamped member the file no longer has | delete it, and report it: its instances lose their variant |
| a stamped layer, same kind | write the fields its receipt says to, above; re-parent and re-order it if the file moved it |
| a field edited by hand since Toghen wrote it | **drift**: keep it, and report it; write the file's value with `overwriteDrift` |
| a stamped layer whose kind changed | replace it, and report it: overrides on it are lost |
| a stamped layer the file no longer has | delete it |
| a node in our set with no stamp | **foreign**: leave it, and report it |
| a person's copy of a set, member, layer or artboard frame | **a copy**: leave it and everything in it, wherever it is, and report it; never delete it, as a layer the file does not declare or as a stray |
| a person's copy of a member, layer or stray the run deletes, or of a node inside it | strip its stamp once the deletion runs, and say so on the deletion's row |
| the only node left whose stamp names another id (cut and pasted) | **the original moved**: reconcile it as Toghen's, and patch it to write its stamp with its own id |
| a field the file no longer declares | leave its current value, and report it |
| a stamped instance whose component the locator now answers with another | **swap it**, a step of its own (`SWAP_COMPONENT`), one row per instance: below |

**A copy carries the stamp** ([ruled](decisions.md#ruled-a-copy-carries-the-stamp-20-october-2026)). Duplicating a node takes its shared plugin data along, so a person's copy of a set, a member, a layer or an artboard frame holds the original's stamp, id and all. The snapshot sorts each group it reads with `sortNodes`: the sets stamped as the component, the frames stamped as the artboard, a set's members, a member's or frame's layers (`stampedTree`, which the update reads too, so both agree on which node is which layer). A copy and what is inside it are left out of the snapshot, so no step names them: not patched, not moved, not deleted as a layer the file does not declare. Each is listed as a `LEAVE` of `copy`. The end of a run does the same for the members outside any set, so a copy of a member dragged out of its set is not a stray, and for the sets and frames it restacks. The original moved, cut and pasted with a new id, is adopted; its layers come along with new ids too, and each is patched to write its stamp with its own, a write the dry run shows. Two sets or frames stamped as one no longer stop the run when the id tells them apart.

**A copy whose original Toghen removes** ([ruled](decisions.md#a-copy-whose-original-toghen-removes-ruled-20-october-2026)) would be, on the next run, the only node left whose stamp names another id: the original moved, adopted, and then deleted by the step that removed its original. So once the snapshot is diffed, each `DELETE_MEMBER`, `DELETE_LAYER` and `REPLACE_LAYER` is given the ids of the person's copies of the node it removes, found by the id their stamps name across every page (`copiesFinder`), and of the nodes inside it, so a copied set's copy of the member goes with everything in it; a replaced layer hands its children to the new node, so only its own copies count. The update strips them right after the removal; a run that stops at the breaking gate strips nothing. A stray's copies are stripped when the end of the run removes it. The deletion's own row names them (R14): a breaking step appends them to `breaks`, `the member "Tone=calm" is gone: instances of it lose their variant; its copy "Tone=calm" (12:40) keeps no stamp`, and a layer's removal in a set, which breaks nothing, carries them as its `message`, `removes "Footer"; its copy "Footer" (12:3) keeps no stamp`. A stripped copy is a node with no stamp: left alone, and reported as one. No step removes a set.

**A swap is its own step, and the lock drives it** (*built 22 October 2026*). An instance's receipt hashes its main component's node id, a variant by its set's. When the locator answers the component's name with another one, because the file names another or the lock sends the name to another key (a relink, *The lock*), the imported component has another id, the receipt no longer matches, and the diff plans a `SWAP_COMPONENT` in place of `component` among the layer's fields: one row per instance (R14), saying what the instance shows now and what it will show, and the declared library each comes from. The layer's other fields stay in its `PATCH_LAYER`, which follows the swap. The update calls `swapComponent` where the main component differs, and the receipt is taken again once the run's writes are done, so the next run plans nothing. The snapshot reads every stamped instance's component, its name, its key and, for a library's, the library the lock holds the key under; Figma already showing the file's component is a receipt taken again, not a swap. A dry run imports nothing, so it has no id to compare: it compares the key the locator would import with the instance's component's. A component wired to a property (`component=(property)…`) is not swapped by this step. An instance a person placed carries no stamp and is not relinked: inside a member it is said as any unstamped node is; elsewhere in the file it is not counted, since counting it needs every instance on every page, which a run does not read.

**A revert is the file's value written again.** A stamp holds hashes, never values, so restoring a hand edit means writing the document's value, which the document already holds: `overwriteDrift`, all or nothing, as for variables. A list of fields to keep and fields to overwrite waits until someone needs it.

### One runtime: the plugin

No printed script is made. The design it replaced is kept in [decisions.md](decisions.md#two-runtimes-one-engine).

**The plugin holds all the machinery.** A component file reaches the plugin as text, and everything from there is the plugin's: reading the KDL, evaluating it with kdlet once per member, validating, then the snapshot, the diff and the writes. Two ways bring the text, and both arrive at the same entry:

- **The command line** reads the files from disk and sends their text, with each file's name for messages, together with the resolver document it already sends. It holds no component logic of its own: it is a courier, and what it prints is the plugin's report.
- **The plugin's screen** already does this: the Templates pane keeps a component file in the Figma file, reads it with the same reader, and plans and builds it (see *Templates kept in the file*). The command line's run and a kept file's build go through the same entry. The pane's read-only line about a stored engine goes with the stored engine.

So a design system uses Toghen in Figma one way, whatever brings the files, and a problem with a file is reported by the plugin with its file name and line, on the screen and, for a command-line run, in the terminal. The axes a file reads from the tokens (`(modifier)`) and its `tokens=` groups are answered from the resolver document the plugin has loaded; a file that needs one and finds none loaded is refused, naming what it needs.

**What is given up.** A component reaches Figma only through the plugin, so the desktop app must be open with the plugin running and paired. An agent with no desktop app, or a hosted build, has no route for components. Variables and styles are already the plugin's. `use_figma` stays useful for one thing: measuring Figma's behaviour in a test file. It is not a way to build.

**A run is not undone whole.** The plugin's writes stay when a run fails. See *The plugin does not roll back*: the engine stops before its first write for everything it can foresee, and the next run finishes a half-written set.

### What it depends on

- **`@figma/plugin-typings` 1.139.0 or later.** The version installed when this was written, 1.123.0, declares no `SlotNode`, no `createSlot()` and no `SLOT` property type.
- **Where an overridden token lives.** One home, settled in variable sync (*Variables per modifier: the sum*, ): the modifier's collection, the default context as its default mode, a chain's head in its last link's collection.

### Artboard files

Artboard files are the built part of the sheet proposal, which is kept in [decisions.md](decisions.md#sheets-designs-assembled-from-components-and-content-proposed). A design system documents each component on a page of its own: a frame holding instances of its documentation components (a header, property rows, token rows, a frame around the component set), with their texts filled in, their variants chosen and their slots filled. A component file cannot build that page: an `INSTANCE` layer takes only `component`, `visible` and sizes, and its root must become a component. An **artboard file**, `<name>.artboard.kdl`, builds it. It is a kdlet file in the component file's vocabulary of layers, fields, values and guards, and differs in five ways.

1. **The root is a frame, not a component.** The top-level node is `artboard <Name>` instead of `component <Name>`. It has no `properties`, no axes and no members: one tree, placed on the run's page (`--page`, else the current page), stamped and reconciled in place as a set is, by address and key, so a second run changes only the difference. A stamped layer the file no longer produces is removed, and that is a breaking step, stopped without `--allow-breaking` as for a set. A layer without our stamp is never touched.
2. **An instance takes its properties.** Variant values, booleans, texts and swaps, by the display names the component declares:

   ```kdl
   INSTANCE "Row 1" component=PropertyRow {
       set Variant=required Name="variant" Type="variant" Default="solid"
   }
   ```

   Figma suffixes the keys of non-variant properties (`Name#12:0`); the file never writes the suffix and the engine matches by display name. A name the component does not have, a value its variant property does not offer, a value of the wrong kind, and two properties of one display name are each refused with the line, naming the component.
3. **An instance's slot takes children,** written as layers inside it:

   ```kdl
   INSTANCE Stage component=DefinitionFrame {
       slot Content {
           INSTANCE Set component=(key)"…"
       }
   }
   ```

   A slot the component does not have is refused with the line. Its children are layers of the vocabulary, with addresses unique inside the artboard.
4. **Inputs.** An artboard is one template and many data sets, one per component documented. The command takes `--input <document>`, a **resolver-like document**: the same format as the design system's, read by `@toghen/lib` and resolved at the default context of every modifier. Its tokens are the data. A list is a token whose `$value` is a list of records, and a reference inside a record, `"width": "{ds.size.md}"`, resolves through the lib's reference machinery like any other, so the data can point at the system's tokens when the document's sources include them. The kdlet inputs are the document's resolved tokens, nested by path, each leaf its resolved `$value`; a template reads `(input)properties` and `each`es over it. Plain data and token values travel the same way, and the Figma side hands kdlet plain data. `--input` applies to every artboard file of the run; a second data set is a second run.
5. **`each`, `when` and guards read the inputs.** An artboard file may use `each` (the key is kdlet's rule: required, and the address of a repeated layer is its template's address and the key), `define` and `+call`. A component file still refuses `each`, since nothing supplies a list there.

**A hand edit.** The rule is the set's (*Identity: what is ours*): each layer has a receipt, and a property, a text or any other field the file declares that was edited by hand since Toghen wrote it is drift, kept and noted, and written over with `overwriteDrift`. An unchanged field is not written, and a property the file never mentions is left alone. Unlike a set's layer, a layer renamed by a person is not renamed back for that alone.

**Not in this round.**
- *Rich text through a property.* A `TEXT` property is a plain string; whether marks survive on an instance's text that follows one is unmeasured, and a cell that needs bold is written as layers.
- *Content from Markdown.* The sheet proposal's queries over documents are unchanged and unbuilt; `--input` is the only source of data.
- *A page per context.* The inputs document is resolved at its defaults. Building one artboard per theme from the document's modifiers is possible later and is not designed.
- *Pagination.* As the sheet proposal says: none.

**An instance's size** (*built 24 October 2026*). An artboard's `INSTANCE` takes `width`, `height`, the four limits and `layoutSizingHorizontal` and `layoutSizingVertical`, as every layer does. Its properties are written before its sizing, and a patch that writes its properties writes its declared sizing again, since a variant switch resizes an instance. *Measured in FigCraft 0.10.0, headless, 24 October 2026:* a switch to another variant puts a fixed axis back to the variant's size, a width written before included, and gives a hug axis the variant's hugged size; a fill axis keeps its size, and each axis keeps its mode. Writing `width` on a hugging instance makes that axis fixed. Figma is not measured; it is written the same way.

**Commands.** `components` and `sync` take `*.artboard.kdl` among their files beside `*.component.kdl` ones; `--input` is read only when an artboard file is among them, and refused with none. Order inside a run: component files first, each after the files defining the components it names, then artboard files, since an artboard instantiates what the components made (*A dry run across steps*). A dry run lists the artboard's layers created, patched, and removed, as for a set.

**Checks, before anything is written** (an error builds nothing, as in *What is checked* of the component file format): the inputs document loads and resolves; every `(input)` reference names something the document has; every `component=` resolves to a component or set in the file (or `(key)` published to it); every `set` and `slot` is valid against it as above; addresses are unique; the root is one `artboard`, which carries no `properties`, no axes, no `include` and no `exclude`.

### A segment of a reference from an axis, and axes from a group

Without a segment, a component whose colour is chosen by a variant property repeats itself once per value: 13 hues × 2 looks × fill, stroke and text is 26 guards and 52 `when` lines that all say one thing, and a typo in one binds the wrong colour silently.

**A reference may take a path segment from an axis.**

```kdl
FRAME Avatar {
    when soft  { fills "{hue.(input)hue.soft.background}" }
    when solid { fills "{hue.(input)hue.solid.background}" }
}
```

- **Syntax.** Inside a reference's braces, a segment written `(input)<Axis>` is replaced by the axis's value in that member. An axis name holds no dot (a rule of the format), so the segment ends at the next `.` or at the closing brace. An axis whose name has a space is written in quotes, `(input)"Header in"`, as everywhere.
- **Per member.** Each member expands to one ordinary reference, which every check on a token reference then applies to. A value with no token is an error naming the member, the axis value and the line; so is an axis the file does not have.
- **Where it applies:** wherever a reference is accepted in a layer field and in `tokens=` binding values; not in `tokens=` on the `component` line, whose group is read once for the file.
- *Where the segment is read.* In Toghen's reference layer, not as general string interpolation in kdlet. Interpolation is a language fundamental and is listed as proposed; when kdlet has it, this can be re-expressed on top without changing files.

**An axis may take its values from a group.**

```kdl
properties {
    VARIANT hue from="{hue}"
}
```

The values are the names of the group's children, in the document's order, the first child being the default, as `(modifier)` takes a modifier's contexts. A new child in the tokens is a new variant on the next run, with no edit to the file; `exclude` prunes a child that is not a value. The group is a reference read with the core's grammar, and a group that names nothing stops the read. The usual rules for a value apply: no `,` or `=`, none empty, none repeated.

**A text layer's case and weight are a text style's job.** A `textCase` or `fontWeight` field was considered and not built. *Measured in a test file:* setting `textCase` or a font weight on a text node that is bound to a text style detaches the node from the style (`textStyleId` no longer matches, and the style's later edits no longer reach it). Style sync already writes a typography token's `textTransform` into the style's `textCase`, and a `when` can switch a layer's `textStyle`, so a variant that differs in case or weight uses another text style, in the tokens as another typography token. The guide says so.

### Parts: axes from subgroups, folded into modes or one variable each

Status: **built, and run in a real file on 13 October 2026** (see *Live run* below). Builds on lib's [Worlds and parts](https://codeberg.org/Toghen/lib/src/branch/main/specs.md#worlds-and-parts) and postcss's [The component model, in standard CSS](https://codeberg.org/Toghen/postcss/src/branch/main/specs.md#the-component-model-in-standard-css). The model and the glossary are in [model.md](https://codeberg.org/Toghen/lib/src/branch/main/model.md).

**The same three things.** A component *is* a component set, named by its group, its layers bound to the group's variables. It *supports* its axes (below), with a member per combination of their values; `include` and `exclude` narrow the combinations. It *does*: switching a member shows the part's values. Worlds are modes on the frame an instance sits in, and the instance never names them.

**Its axes.** Each axis of the parts vocabulary that the component's subgroups use is one axis of the component. Its values are `rest` first, then the part keys the subgroups use, both in the order the vocabulary declares them. The vocabulary may sit on the document root or on any group; a component reads every holder above it. In the sync, a component is the group above a path's first part: `button.primary.hover.backgroundColor` belongs to `button`.

**Two layouts, one relation.** How a component's parts become variables is a choice, and both layouts derive from the same path tree and vocabulary, so the document knows nothing of it.

- **Folded, the default.** One collection per folded axis, named after the axis and shared by every component that folds it. Its modes are `rest` and the keys used. The folded segment is stripped from the variable name and gives the mode: with `state` folded and `variant` not, `button.primary.hover.backgroundColor` is the variable `button/primary/backgroundColor` in mode `hover`. The rest token's variable takes its cell in each mode from the part token, and from the rest token where the part does not define it.
- **One variable per part.** An axis left in the path keeps its segment: `button/primary/backgroundColor` is a variable of its own, beside `button/backgroundColor`, and the member's layers bind the part's variables. Always possible, no limit.

Fold is the default because it is what a designer switches, and because it is smaller: one variable per token instead of one per part token, and Figma caps variables per collection as well as modes.

**Folding is decided per axis, per component, and the plan says so.** Axes are decided in the vocabulary's order, so an earlier axis folds first. An axis folds unless one of these holds:

- a token under the component carries its segment together with the segment of an axis already folded;
- a token that would fold has no rest value, since a variable needs a value in every mode;
- the shared collection would pass ten modes, Figma's limit.

An axis that does not fold stays in the path, and the plan names the token that blocked it. The plan writes one sentence per component that has such an axis. The first two sentences below are the running example's, copied from its example output. The others are copied from the tests, which use the names `ui`, `card`, `tag`, `deck` and `chip`:

- `"button": folds "variant" (modes rest, primary), "state" (modes rest, hover, pressed, disabled); "selection" stays in the path, one variable per part: "button.selected.hover.backgroundColor" carries it together with the folded "state".`
- `"field": "state" stays in the path, one variable per part: no rest value: "field.disabled.opacity" needs "field.opacity", which is not defined.`
- `"ui.card": folds "pointer" (modes rest, hover); "variant" stays in the path, one variable per part: "ui.card.primary.hover.background" carries it together with the folded "pointer".`
- `"ui.tag": "pointer" stays in the path, one variable per part: no rest value: "ui.tag.hover.background" needs "ui.tag.background", which is not defined.`
- `"ui.deck": "step" stays in the path, one variable per part: its values s10 do not fit the shared collection "step", which already holds 10 modes (rest, s1, s2, s3, s4, s5, s6, s7, s8, s9) and Figma allows 10.`
- `"ui.chip": "pointer" stays in the path, one variable per part: the component is laid out as one variable per part (layout=parts).`

An axis whose name is that of a modifier or of the base collection stops the plan, with this sentence, copied from the source: `The part axis "pointer" folds into a collection of that name, and the base collection or a modifier already has it. Rename the axis in the parts vocabulary, or lay its component out as one variable per part (layout=parts).`

Where two folded axes vary one variable, it chains across their collections. The later axis in the vocabulary is the head, and takes the token's name. Each earlier link is named `<token>--<axis>`. A part token that a modifier varies keeps its own variable, and the cell aliases it.

**Layout and the command line.**

- `layout=parts` on the `component` line puts every axis of that component in the path. The command line sends the check of the files before the variable plan, so the sync learns the layout from it. The check reads every file's layout first and builds the sum once, so a name it holds against the design system is held against the variables the sync makes: a part token the fold took into its rest's variable is refused, naming the rest, the axis and how the member pins the mode, whatever order the files came in. A plugin sync that never checked the files folds, and a file with `layout=parts` run against a folded sync stops with the usual message that a token names no variable.
- `include` and `exclude` take a part key for each axis, as in `exclude pointer=pressed`. A key the group does not use, and the default member `rest`, are refused.
- `tokens=` reads the part groups of the axes left in the path. A member that selects `variant=primary` also reads `button.primary.*`, and that group's keys win over the group's own. Part groups of folded axes are never read, since the rest variable carries them.
- A member pins the mode of each folded axis on its root, so every bound layer inside follows.
- A part key `rest`, or an axis name with `.`, `,` or `=`, is an error on the component line.
- **A declared axis and an inferred one of the same name** (*ruled and built 13 October 2026*). A file that declares `VARIANT variant soft solid` and has `tokens=` naming a group whose parts use the `variant` axis was refused as a property that repeats a name. The declared axis now wins: it is marked as a part axis, so a member's value selects the part group of that key (`variant=solid` reads `avatar.solid.*`), and a declared value with no part group reads the rest, as `rest` does today. A part key the declared axis does not list is a warning on the component line, naming the keys left out: `VARIANT "variant" is declared and also comes from the parts of "avatar"; the declared values win, and "outline" is left out.` A declared value that is no part key is not reported. When the inferred axis would fold, a declared axis cannot be a folded one (a mode cannot hold the declared values that have no part), and the file is refused with a sentence that says to drop the declared axis or lay the component out with `layout=parts`. *Why:* the declared axis is the author's narrower choice, often written before the parts existed. *Not chosen:* merging only when the values agree, which still refuses the reported case; and the inferred axis winning, which overrides what the author wrote.

**Not covered.** A part token that is a style (typography, shadow) keeps its own style under its full path, with no mode. A part token whose variable type differs from its rest's keeps its own variable, and its mode falls back to the rest.

**Discipline, on screen.** A mode pinned on a member's root reaches everything inside it. A badge inside a button takes the button's hover, which for a mockup is close to right, and shows on the canvas when it is not; the author then pins rest on the badge or moves it to one variable per part. Nothing enforces that only leaves fold; the plan states the layout and the canvas shows the result.

**Why.** A mode that flows down a tree suits a member that is pinned, but a mode set on a whole frame applies one level too wide: a frame set to hover would hover every button inside it. A collection with a mode per state would also meet the ten-mode limit quickly. Folding per component keeps the mode on the member, and the token document stays flat for every other reader.

**Live run, 13 October 2026.** The running example synced into an empty file through the plugin: a dry run (23 creates, then 27 once the file was empty and the colliding leftovers out of the way), then the real run, 88 variable operations and 16 members. Read back: the five collections and their modes, the folded and linked variables, the 16 members each pinning `state` and `variant`, and the resolved fill of every member agreeing with the tokens, in light and in a frame set to dark. A leftover collection from an earlier round held two of the component's names and made the check refuse them as ambiguous, which is the check working. *Variable move, live:* making `button.paddingBlock` vary on density planned `"button/paddingBlock" moves from "ds" to "density"; the old variable is removed.`; a real run without `--allow-breaking` refused with exit 1 and wrote nothing; with it the old variable went, the new one stood in `density`, the 16 members were rebound, and it resolved to 2 in compact. *Also live:* a role that is `currentColor` with a `figma.value` and a chip aliasing it (the chip is an alias of the role, which aliases the named colour); a 12-context modifier narrowed to 5 modes by `figma.include`, and the same modifier without it refused at the plan; a font stack starting with `ui-monospace` falling back to Inter with the note; an effect style named through a reference binding the target's style; `background` as a fill; and an artboard file with inputs building a title and three instances with their Label property set from the data.

**Open.** The exclude key on a modifier (*Figma's mode limit*) stays, for modifiers.

#### A part that refers to its own rest (*ruled and built 15 October 2026*)

> Built. A part that refers to its rest takes the rest's cell; a part that refers to a sibling part takes that part's cell; the plan never writes an alias that loops; the mock refuses one as Figma does.

**The problem.** A component often restates its rest value in a part, so that a host overriding the rest in CSS does not reach the part:

```json
"chip": {
  "background": { "$type": "color", "$value": "{ui.brand}" },
  "hover": { "background": { "$type": "color", "$value": "{ui.chip.background}" } }
}
```

Folded, `chip.hover.background` becomes the `hover` mode of the variable `ui/chip/background`, and its reference points at that same variable. The plan wrote the mode as an alias of the variable to itself. With two folded axes it wrote a loop instead: the head's `rest` falls through to the earlier axis's link, whose `hover` aliased the head. Figma refuses both, the write fails, and the mode keeps the white Figma gives a new colour variable. (The twenty white values that opened *A recorded hash belongs to one variable* were this, not the record; that round's rulings stand on their own.)

**1. A part that refers to its rest falls back to the rest.** A part token whose whole value is a reference to the rest token it folds into gives no cell of its own. The mode takes what it would take if the part token did not exist: the link below when the chain has one, otherwise the rest's own cell, an alias when the rest is a reference and a value when it is not. In the example, `hover` becomes an alias to `ui/brand`. The part token needs no variable, so it is dropped as any folded part is.

**2. A part that refers to a sibling part takes that part's cell.** A part token whose whole value is a reference to another part token folded into the same rest variable, on the same axis or another, takes the cell that part gives, by the same rules, so a reference that ends at the rest falls back as in 1. `chip.disabled.background = {ui.chip.hover.background}` takes whatever `hover` takes. A sibling part that keeps a variable of its own (a world varies it) is aliased, as now. Following stops at a part already visited and falls back to the rest. This replaces the warning that a folded part "does not become a variable".

**3. The plan never writes an alias that loops.** Before writing a mode as an alias, the plan follows the target's aliases through every mode the plan writes for it, and through what Figma already holds for variables the plan does not write. An alias that reaches the variable it is written into, itself included, is not written. The mode takes the resolved value instead, and the plan adds one `WARNING`: `"<path>" refers to "<target>", which leads back to "<variable>" in Figma, so the value is written instead of an alias.` Every mode is followed, not only the one being written, since a consumer may choose any mode of each collection. This is a safety net: after 1 and 2 nothing in the parts fold reaches it. *As built,* it also follows what Figma holds for a variable the plan is about to rewrite, so an alias that only loops through a value being replaced is written as the value in this run and as the alias in the next. That is safe and costs one run; telling held from replaced needs the target's whole comparison first.

**4. The mock refuses an alias that loops.** `setValueForMode` in the test mock throws when the alias reaches the variable it is set on, itself included, through any mode. *Unmeasured:* Figma's exact message, and whether Figma follows every mode or only some; the mock follows every mode, which is the stricter reading. A test that wrote the old self-alias now fails.

*Not covered.* A rest token that refers to one of its own parts (`chip.background = {ui.chip.hover.background}`) keeps today's behaviour: the value, with the warning that the part does not become a variable.

### Three consumer needs on top of the model (*ruled and built 13 October 2026*)

- **`tokens=` binds a `background` that is one colour to the fill.** `background` is the shorthand most stylesheets use for a plain colour, and the PostCSS plugin writes the key as `background`. In `tokens=` it maps to `fills` as `backgroundColor` does when the token is a `color`. A `background` holding anything else (a gradient, an image) stays skipped with the current note.
- **A style named through a reference resolves to its target's style.** A component file that names an effect style through a token that is only a reference to a shadow (`effectStyle="{kbd.boxShadow}"`, where `kbd.boxShadow` is `{elevation.raised}`) binds the style the target becomes (`elevation/raised`), as a reference to a token Figma holds is an alias of it. The same for a text style named through a typography reference. A chain of references is followed to the first token that is a style. A reference whose target is not a style (an unholdable value, a token skipped for another reason) still names no style, as now.
- **A token that moves to another collection is moved, not doubled.** A token that starts to vary on a modifier, stops varying, moves between modifier collections, or moves between the base and a shared axis collection is planned as one step: the old variable is removed and the new one created, in the same plan. Figma's Plugin API has no move for a variable (not measured here), so a binding made to the old variable elsewhere does not follow. Only a variable the sync stamped as its own is removed, never one made by hand. The removal is a `BREAKING` row behind `--allow-breaking`, listed in the dry run naming both collections: `"checkbox/background" moves from "ds" to "state"; the old variable is removed.` Aliases that pointed at the old variable are re-pointed in the same plan. The dry run's name check counts the step, so a name the run would leave in one collection only is not ambiguous. The ambiguity message, for a name found in two collections with the older one written by an earlier sync, says that likely cause.
  - *Measured in a test file, 13 October 2026:* `variable.remove()` is allowed on a variable whose collection has other variables; the removed variable is no longer listed and its collection no longer counts it, though a lookup by its id still returns a stale object. A node binding to it keeps pointing at the removed id and keeps showing the last colour; an alias in another variable that still pointed at it keeps pointing at the removed id too. Two variables of one name in two collections are allowed, so the interval between create and removal is safe. So bindings elsewhere do not follow a move (as the ruling says), and the plan re-points the aliases it knows about before it removes.
  - *How the sync's own variable is recognised:* by its stamp, which names the variable's key. A variable counts as the sync's own only if it is stamped for the key and sits in a collection that is still one of the document's: one in a collection of a person's own is not removed, one with no stamp is left alone, and one already gone is not there to remove. It keeps its stamp until it is removed, so the step is listed until it is taken.
  - *A new operation and row field:* `DELETE_VARIABLE`, with an optional `after` holding the removal back if the replacing create failed; `BREAKING` gained an optional `moved` field so the dry run counts the removal even when it is not carried.
  - *Limits:* the old collection must still be one of the document's sum collections, so a token that left a collection the document no longer names is not moved, and renaming the base collection is not read as a move. When the last component stops folding an axis, its collection leaves the sum and an old variable stays. When a chain loses a link, the link variable `<path>--<modifier>` stays behind.
  - *The screen versus the command line:* the screen's variable plan cannot ask for breaking steps, so its Execute creates the new variable and does not remove the old one, as with a deleted mode. The ambiguity note recognises the old variable by the code syntax the sync writes for it.
  - *Styles:* the style sync still makes its own duplicate style for a token that is only a reference (`kbd/boxShadow` beside `elevation/raised`); a component now binds the target's.
  - *Order of `background` and `backgroundColor`:* `background` binds at a lower rank, so `backgroundColor` wins when both exist.

### Bindings from a CSS-keyed group

Run in a real file: [measured behaviour §11](.reference/figma/measured_behaviour.md#11-the-first-command-line-run-in-a-real-file).

A group keyed by the CSS properties it fills (`button.backgroundColor`,
`button.borderRadius`, `button.paddingBlock`) already says what binds to what. A
layer that names the group gets those bindings with no line written for them.

```kdl
component Button tokens="{button}"

properties {
    TEXT Label default="Save"
}

FRAME Button layoutMode=HORIZONTAL layoutSizingHorizontal=HUG layoutSizingVertical=HUG {
    TEXT Caption tokens="{button.label}" characters=(property)Label
}
```

**Where.** `tokens="{group}"` is a field a `FRAME`, `SLOT` or `TEXT` may take, naming a group; the reader refuses a token, a missing path, or an `INSTANCE` (whose overrides are not in this design). The `component` line's `tokens=` applies to the root frame. Nothing is matched by name: a subgroup does not find a layer called like it, since a renamed layer would lose its bindings without a word.

**How.** For each token **one level down** in the group, its key is looked up
in the table below, for the layer's kind, and the field is written as if the
file had said it: `fills "{button.backgroundColor}"`,
`cornerRadius="{button.borderRadius}"`. From there every existing check applies:
the variable or text style must exist, of the right type, and a name found in
two collections stops the build. **A field the file writes itself wins**, on the
layer or in a `when`, member by member: inference fills only the fields a
member's evaluated layer does not have. Subgroups are not read.

**More specific wins inside a group.** `paddingTop` over `paddingBlock` over
`padding`; `borderColor` and `borderWidth` over `border`;
`borderTopWidth` over `borderWidth`. The document's key order does not matter.

**A member follows its parts.** A member's layers bind the variable of the part its values select. A folded axis pins its collection's mode on the member's root, so the rest variable takes the part's cell. An axis left in the path binds the part's own variable, and a token the part does not define binds the rest's (see *Parts*).

| CSS key | Figma field | On |
|---|---|---|
| `backgroundColor` | `fills` | `FRAME`, `SLOT` |
| `color` | `fills` | `TEXT` |
| `borderColor` | `strokes` | `FRAME`, `SLOT` |
| `borderWidth` | `strokeWeight` | `FRAME`, `SLOT` |
| `borderTopWidth`, `borderRightWidth`, `borderBottomWidth`, `borderLeftWidth` | `strokeTopWeight`, `strokeRightWeight`, `strokeBottomWeight`, `strokeLeftWeight` | `FRAME`, `SLOT` |
| `border` (composite) | `strokes` from its `color`, `strokeWeight` from its `width` | `FRAME`, `SLOT` |
| `borderRadius` | `cornerRadius` | `FRAME`, `SLOT` |
| `padding` | `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft` | `FRAME`, `SLOT` |
| `paddingBlock` | `paddingTop`, `paddingBottom` | `FRAME`, `SLOT` |
| `paddingInline` | `paddingLeft`, `paddingRight` | `FRAME`, `SLOT` |
| `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft` | the same | `FRAME`, `SLOT` |
| `gap` | `itemSpacing`; in a grid (`layoutMode=GRID`) `gridRowGap` and `gridColumnGap` | `FRAME`, `SLOT` |
| `rowGap`, `columnGap` | `gridRowGap`, `gridColumnGap`, in a grid only | `FRAME`, `SLOT` |
| `width`, `height`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight` | the same | all three |
| `opacity` | `opacity` | all three |
| `font` (typography) | `textStyle` | `TEXT` |

Figma has only horizontal writing, so `paddingBlock` is top and bottom and
`paddingInline` left and right.

**A composite border binds its members.** Variable sync makes no variable for a
`border`, so its members are what bind: a member written as a reference binds
the referenced token's variable (`color: "{surface.edge}"` gives
`strokes "{surface.edge}"`). A member that is a literal has no variable, and is
reported and not written: a literal put in its place would stop following the
tokens, which is the defect component files exist to prevent. A `style` other
than `solid` refuses the whole border (Figma's dash pattern is not in this
design).

**Skipped, into the notes.** The engine skips a key the table does not have for the layer's kind (`transition`, `cursor`, `backgroundColor` on a `TEXT`, `gap` on a layer with `layoutMode=NONE`, `rowGap` outside a grid) and lists it in the run report's notes, once per key and layer, not as a warning. A design system whose CSS says more than Figma can hold is the normal case.

**Left out.** Layout values (`flexDirection`, `justifyContent`, `alignItems`):
DTCG has no type for them and Figma binds none of them to a variable, so the
file keeps writing them. Shadows: effects are not in this design.

### Drawing fields, placement, and a value fixed on purpose

A line's default stroke, its zero height and unwiring by an empty reference list were measured in a test file ([measured behaviour §12](.reference/figma/measured_behaviour.md#12-text-per-variant-lines-and-unwiring)). A rotated line in a hugging frame adds no width for its stroke: a vertical rule in a horizontal hug frame needs a fixed width, or sits in a frame that does not hug. A design system's own tooling (measures, markers, annotations) is drawn with shapes the format could not say; each workaround below was met in practice.

**A line.** A new layer kind, `LINE`. Its length is `width`; it takes `strokes`, `strokeWeight`, `rotation` and the fields every layer takes. Figma's line has no height, so `height`, `minHeight` and `maxHeight` are refused on it. It has no child layers. A line's end ticks stay short lines or small frames: Figma's stroke caps draw arrows and circles, not ticks.

**Per-corner radii.** `topLeftRadius`, `topRightRadius`, `bottomRightRadius`, `bottomLeftRadius` on `FRAME` and `SLOT`, dimensions, named as the Plugin API names them. With `cornerRadius` also set, `cornerRadius` is applied first and each corner field overrides its corner. A quarter arc is one rounded corner and two strokes (`strokeTopWeight`, `strokeLeftWeight`), so no arc field is added. In bindings from a CSS-keyed group, `borderTopLeftRadius` and its three siblings bind to these fields.

**"Fully round" needs no field.** Figma draws a corner radius larger than half the shorter side as half of it, so a large radius token (`radius.full`, `9999px`) gives a pill or a dot at any size, which is what CSS does with the same value. The guide shows the pattern; the engine computes nothing.

**Rotation.** `rotation` on every layer, a number in degrees, as Figma takes it (counter-clockwise). A bare number is accepted: no token type holds an angle, so there is no token to require. A vertical label is a `TEXT` at `rotation=90`.

**Effects through a style.** `effectStyle` on `FRAME` and `SLOT`, a reference to a `shadow` token, resolved to the effect style style sync made from it, as `textStyle` resolves a typography token. The style must exist first; until it does, the run reports the layer and sets nothing, as for a text style. *Since 22 October 2026* `effects` takes shadow and blur tokens directly, each part bound (see *Gradients, effects and layout grids bind by parts*); a component's look is still a token's, since the field takes tokens and a literal only for a blur's radius.

**Where a new set goes.** A set the run creates is placed below everything at the top level of its page, its left edge on the leftmost of them, 100 px under the lowest. On an empty page it goes at the origin. Several sets created by one run are placed in turn, each under the one before. The first runs created every set at the origin, six on top of each other on one page. *Superseded on 17 October 2026* by *Strays, the board, and where sets go*: a set that exists was never moved, so a set that grew covered the ones below it.

**A value fixed on purpose.** A `when` that replaces a wired field unwires it in that member, and validation warns, because that is how a property goes dead by accident. When it is meant, the value says so with `(literal)`: `when ready characters=(literal)"Ready"`, `when single visible=(literal)#false`. The run then writes it and says nothing. `(literal)` already marks a value written out on purpose rather than taken from a token; here it is taken out on purpose rather than from the property.

A text that follows a variant while staying wired, the other way this was asked for, cannot exist in Figma. Probed in a test file: a `TEXT` property has one default for the whole set, every variant wired to it shows that default, setting one variant's wired text changes the default for all, and switching an instance's variant never changes its text. So a per-axis default could only be written by unwiring, which `(literal)` now states.

**How a token reaches a field, said once.** The field table (`shared/components/fields.ts`) has a `token` column beside the layer kinds and the value kind: the token types a field carries and, when Figma binds it, the call that binds it, the name the call takes, the variable type, the scopes whose pickers offer it, and the parts Figma reports the binding on (the shape is in [reference.md](reference.md#the-field-table)). It is copied from the property roster (`.reference/figma/property_roster.md`), whose Toghen column says *bound*, *written as a value* or *plain* for each row the table covers. Everything that used to list fields of one kind again reads the table instead: the scopes a variable sync gives a token, the corners and sides a binding is reported on, the paint properties, the engine's field lists and the receipt's branches. A field added to the table is bound, scoped, read back and written in order without a second edit. Today a token reaches a field by `setBoundVariable` (sizes, the dimensions, opacity, stroke weights), by `setBoundVariableForPaint` (fills, strokes), or as a style (`textStyle`, `effectStyle`, a token type and no binding). What Figma cannot bind is written as the token's resolved value: a colour's alpha as the paint's opacity (see *From file to Figma*), and `x`, `y`, `cornerSmoothing` and `dashPattern` (a `strokeStyle` token's dash array), each measured `Unknown field` (§14). *Since 22 October 2026*: a text's fields bind with `setRangeBoundVariable` on the whole text, a line height or letter spacing not in pixels, `listSpacing` and `maxLines` are written as their value, and `visible` and `characters` bind a `boolean` and a `string` token (see *From file to Figma*, *A text's fields*).

### Deliberately not in this design

- **Effects written out.** An effect arrives as a token, through `effects` or `effectStyle`; a file never writes a shadow's numbers itself. A background blur, noise, texture and glass are not written.
- Images as paints, and a fill style; absolute positioning and constraints; `layoutWrap`; text ranges.
- A property's own default bound to a variable.
- Instance overrides and prototyping: what a design does with a component, not what the component is. A component file sets an instance's *properties* (`set`, ruled 21 October 2026: a composite's atoms are instances, and a member names what each shows) and nothing else of an instance's: no override of a layer inside it.
- Any node kind beyond `FRAME`, `SLOT`, `TEXT`, `INSTANCE` and `LINE`. A frame covers a rectangle, and a frame with a large radius an ellipse.
- Documentation pages built from a component. They are a second document with its own schema, after this one.

### Breaking steps stop a real run

> A run that would take a breaking step stops before its first write unless `--allow-breaking` is given. A member deleted is refused without it and taken with it, its ids kept. `RunOptions.allowBreaking` and the gate are in `main/components/run.ts`; `--allow-breaking` is on the command line, and it gates the variable sync's deletion of a removed context's mode too.

A breaking step is one that loses something instances depend on: a member deleted, a property deleted or turned into another type, a layer replaced by another kind. Until this was built a run reported such steps and then took them, so only a dry run protected instances, and only if someone read it. From an npm script the warning scrolls past after the damage.

So a real run that would take a breaking step stops before its first write and lists those steps, the way it already stops for a set of the same name that Toghen did not make. `RunOptions.allowBreaking` lets it through; the command line spells it `--allow-breaking`, and the printed scripts carry it in their options. A dry run is unchanged: it lists the breaking steps and takes none.

The engine cannot narrow the gate to members that have instances. It sees the instances in this file, not those in files that use it as a library, so "nothing uses this" is never something it can check.

The same answer exists elsewhere: Prisma's `db push` takes `--accept-data-loss`, "required if as a result of making the schema changes, data may be lost" ([CLI reference](https://www.prisma.io/docs/orm/reference/prisma-cli-reference)).

### A renamed axis, and a set Figma reports as broken (*ruled and built 14 October 2026*)

> Built. A run reads a set only while it is consistent; a renamed axis is renamed in place; a set Figma already reports as broken is named, member by member, before anything is written.

**The problem.** Figma calls a set broken when two members share a combination, or when its members do not have the same axes. On a broken set, reading `componentPropertyDefinitions`, `variantGroupProperties`, or an instance's `componentProperties` throws `Component set has existing errors` (measured in a test file, 14 October 2026). Appending the member that breaks it does not throw; setting `componentPropertyReferences` on its layers still works; removing it makes the set readable again.

Members are paired by the combination in their stamp. An axis renamed in the file (or in the parts vocabulary it comes from) pairs no member, so the plan creates every member under the new name and deletes every old one. The first new member appended makes the set broken, the next read throws, and the run stops halfway, leaving one half-built member behind. Each later run then stops at the snapshot, which reads the set first. The dry run cannot see it coming, since the set is consistent until the run starts writing.

**1. A set is read only while it is consistent.** The order in which a set is changed:

1. the property steps;
2. the patches to the members the file keeps;
3. the set's property keys, read once;
4. every new member built away from the set and wired from those keys, then all of them appended, then their deferred wiring;
5. the members the file no longer has, deleted;
6. the relayout, and only then any further read (the settings of a slot the run made).

Between the first new member appended and the last member deleted, nothing reads the set's properties or an instance's. The test mock throws Figma's error on those reads whenever its members disagree on axes or repeat a combination, so a read that slips back in fails a test.

**2. A renamed axis is renamed, not rebuilt.** The diff reads the held axes from the member stamps, in name order. It infers a rename when all of these hold:

- every held member has the same axes;
- the held axes and the file's axes differ in exactly one name, at the same position, and the new name is not a held axis;
- the values the held members use on the old axis are the values the file's members use on the new one, as sets. Order is not compared: it is the layout's, and the relayout puts it right.

Then the plan's first member step is `RENAME_AXIS { from, to }`, which breaks nothing. The dry run says `axis "state" is renamed "interaction": every member keeps its node, and instances keep their value`. It is applied with `set.editComponentProperty(from, { name: to })`, which renames the axis on every member in one call and keeps each instance's value and overrides (measured). Each held member's stamp is then written again with its new combination, since shared plugin data does not follow the rename (measured). The diff pairs the members by their new names, so the rest of the run is an ordinary patch.

Anything looser is not inferred: two axes renamed at once, a rename with a value changed, an axis added or removed. Those stay as today, members created and deleted, behind `--allow-breaking`. Prior art: Django's `makemigrations` makes the same guess and asks *Did you rename …?*; here the dry run is the question. A declared rename, as Terraform's `moved` block declares one, waits until the inference gets a real case wrong. A renamed **value** is not inferred (see [decisions.md](decisions.md#components-from-files)).

**3. A set Figma reports as broken is named.** When the snapshot's read of a stamped set throws Figma's error, the engine reads the names and stamps of the set's children, which stay readable, and stops with what is wrong:

```
cannot build "Button": Figma reports its set (12:34) as broken, and nothing was written
member "variant=solid, interaction=hover" (56:78) has the axes variant, interaction; the other 54 have variant, state
"variant=solid, state=rest" is the name of two members (56:79, 56:80)
delete or rename the members named, then run again
```

A member whose axes differ from those of most members is named with its id. So is each combination two members share, and a member name that does not read as `Axis=value, …`. A member the stamps say Toghen made is said to be ours; one with no stamp is said to be someone's edit by hand. The set is not rebuilt: a new set has a new key, and every instance of it, in every file that uses it, breaks (see *Identity: what is ours*).

**4. The check before any write sees it.** `CHECK_COMPONENTS`, which the command line sends before it syncs anything, also finds each component's stamped set and reads it. A broken set is one of the problems it returns, with the lines above, so a sync stops before the variables and styles are written rather than after.

### Strays, the board, and where sets go (*ruled and built 17 October 2026*)

> Built. A step that fails removes what it created; a member left outside any set is a breaking step; a set's members form a pivot board; Toghen's own sets are restacked after every run, and a set moved by hand stays.

**The problem.** In a consumer's file, after a run that stopped on a broken set and three later runs:
- two empty components sat at a page's origin, 100 × 100, stamped as members and in no set;
- Button's 55 members stood in one column 4,000 px tall, because the grid put only the last axis across and Button's last axis is short;
- Button had grown down over the four sets placed below it, because a set that exists was never moved.

**1. A step that fails removes what it created.** A member is built away from its set, at the page's origin, and appended afterwards: `figma.createComponent()` in `CREATE_MEMBER` (`main/components/update.ts`), `buildMember()` before `combineAsVariants()` in `applyCreateSet()` (`main/components/apply.ts`). A plugin run has no rollback; the comment in `applyCreateSet()` that says Figma rolls the script back was true of the printed scripts and is not of the plugin. So each of the two steps keeps the nodes it has created so far, the one being built included from the moment it exists, and when anything in the step throws it removes them all before the error goes on. A failed step leaves the page as it found it.

**2. A member outside any set is a breaking step.** A **stray** is a `COMPONENT` stamped `member` whose parent is not a `COMPONENT_SET` stamped `component`. The pages are already searched stamp by stamp; the same search finds strays.

- *Once per run.* A stray's stamp names its combination, not its component, so no file can claim it. Strays are found once per run, in the check before anything is written, on every page.
- *Always breaking.* Removing a stray is removing a component, and its instances may be in other files that use this one as a library, which the run cannot see (*Breaking steps stop a real run*). So every stray is listed as breaking: `"interaction=disabled" (26:522) is a member outside any set, left by an earlier run; it is removed with --allow-breaking.` Without the flag a real run stops before its first write, as for any breaking step. With it, the strays are removed at the end of the run and reported, `removed "interaction=disabled" (26:522)`, and a person's copy of one loses its stamp with it, said on the same line. A dry run lists them and removes none.
- *A member dragged out of its set* by a designer is a stray too. The next run creates the member the set now lacks, and the dragged copy is listed with the rest.
- *A copy of a member is not a stray.* A member a person duplicated and put outside any set carries the stamp of one that is still there, and the id tells them apart (*Identity: what is ours*): it is never removed, and the end of the run says `"Tone=calm" (12:40) is a copy of Toghen's member "Tone=calm", outside any set, left alone`.

**3. The members form a pivot board.** The board is the variant matrix designers draw: the axes are split into those that go across and those that go down, and within each direction they nest, an earlier axis being the outer group. It replaces `memberGrid()` (`shared/components/diff.ts`), which put the last axis across and each combination of the others on a row of its own, and `placeMembers()` lays it out as it does now, from the members' measured sizes.

- *The file may say which axes go across:* `across="interaction, selection"` on the component line, the axis names separated by commas (a comma never appears in an axis name: Figma separates a member's name with it). The other axes go down. Refused, naming the value: a name that is not one of the component's `VARIANT` axes, a name given twice. Listing every axis is allowed: one row.
- *Without it, the board balances itself.* Start with the last axis across and the others down. While the columns (the product of the across axes' value counts) are fewer than the rows (the product of the down axes'), and more than one axis is down, move the last of the down axes across. A component with one axis is one row. A component with two axes of a few values each is laid out as before.
- *Each direction is a mixed-radix count.* A member's column is the index of its combination among the across axes (each axis's values in their declared order, the outer axis the most significant), and its row likewise among the down axes.
- *Gaps grow outward.* Members sit `MEMBER_GAP`, 40 px, apart within the innermost group. Between two neighbouring columns (or rows), the gap is 40 px times one plus the nesting level of the outermost axis whose value changes between them: 40 inside a group, 80 between groups of the next axis out, 120 between groups of the one beyond.
- *A cell keeps its place.* A combination the file excludes leaves its cell empty, and the columns and rows stay aligned. A column or row with no member at all takes no width or height, but keeps its gap.
- *The default member stays top-left.* The member of all first values is at the origin of the set, which is how Figma picks a set's default variant. The rule above puts it there; nothing else moves it.
- The board is laid out on every run, as now (`RELAYOUT`), so an existing set takes the new board on its next run.

**4. Toghen's own sets are restacked; a set moved by hand stays.** Toghen records where it put each set and artboard: `placed` in the stamp of the set or the artboard frame, `{"x":…,"y":…}`, written whenever Toghen places it.

- *Whose a set is.* A set or artboard whose position equals its `placed` stamp (within half a pixel) is Toghen's to place. One whose position differs was moved by hand and is the designer's: it is not moved, and its stamp is not rewritten.
- *After every run,* on each page the run created or changed a set or artboard on, Toghen's sets and artboards are restacked: in their current order from top to bottom (then left to right), their left edges on the leftmost of them, the first where the topmost of them is, each next one 100 px (`SET_GAP`) below the one before. One that would overlap any other top-level node on the page (a set moved by hand, a frame Toghen did not make) goes below that node instead, again with the gap, until it overlaps nothing. A set the run created joins the stack at its end. Their `placed` stamps are then written.
- *A set moved by hand that overlaps something* after the restack is noted in the run report and not moved: `"Button" was moved by hand and overlaps "Dot"; it was left where it is.`
- *A set from before this round has no stamp.* One that overlaps another stamped set or artboard joins the stack: it is broken already. One that overlaps nothing is left where it is and stamped there, so from then on it is Toghen's.
- *Not breaking.* A move loses nothing. A dry run lists, per page, the sets Toghen would restack and those moved by hand; it gives no positions, since the sizes of the sets it would build are not known until they are built. The run report lists each set moved, `moved "Dot" to 0, 7381`.
- *A run* is one `components` or `sync` command, or one template run from the plugin's screen. The sweep (2) and the restack happen once at its end, after its last component or artboard step (`FINISH_COMPONENTS`). *As built:* the screen's results surface has a checkbox that takes the breaking steps, so a stray can be removed from the screen too, as any breaking step can.

This replaces *Where a new set goes* above, which placed a set the run created below everything and never moved one that existed.

### Templates kept in the file

A component file can be kept inside the Figma file, so a set is planned and
built again from the plugin's screen, by whoever opens the file, without the
command line. It lives where the stored engine does, in shared plugin data in
the `toghen` namespace, under `templates`: the file's text, its name and when
it was kept, keyed by the component's name. One file of a few dozen members
can pass Figma's 100 kB per entry, so it is sharded, through
`main/utils/shardedData.ts`, as the sync record of older builds was.

A kept file is read again each time it is listed or built, with the same pure
reader the command line uses, against the loaded design system
(`main/utils/designSource.ts`, which moved out of `cli/` so the plugin could
use it). A file that does not read is refused when kept, with every problem; one
that stops reading against a changed design system says so on its row and
cannot be built. A build is the engine `RUN_COMPONENT` runs, on the current
page, so a set is found wherever its stamp is.

What it does not do yet: say whether a built set still matches its file. A dry
run could answer it now, since it plans a patch only for a field a receipt says
to write, but the screen does not ask, so it says *not compared*. Asking is
wanted when someone asks which sets are stale, and *Build everything that
differs* waits on it. A dry
run from the screen does not carry `pending` names either, so a file naming a
variable the next sync would create is refused by the plan until the sync runs.

### Blueprints

*Designed 22 October 2026 (the plan of that day, section 2.6); the reader, the needs and keeping are built.*

A page is the unit a design system lays out: a few components and the artboard that shows them, built against
one set of tokens and the libraries they name. A **blueprint**, `<page>.blueprint.kdl`, is one kdlet document
that folds those component files and artboard files into the page and declares what it needs: `page`, at most one
`tokens`, any number of `library`, and `component` and `artboard` bodies. The format is
[component-files.md](./component-files.md#blueprints).

**A body is its file.** The reader (`shared/components/blueprint.ts`) reads the blueprint's own words and hands
each body to the readers of today's files, so a blueprint is checked exactly as its files would be. A body is
handed over as the blueprint's text with everything else blanked to spaces: the other bodies, the blueprint's
words, and the body's own braces, while the top-level `guard` and `define` stay where they are. What is left is
the body's file, header line first, at the blueprint's lines and columns, so every problem points at the right
place with no offset to add. kdlet reads only text; a reader that took a parsed node list, or an offset, would
have meant a change to kdlet or to both readers for the same result.

**Component and artboard files stay readable alone.** A blueprint of one component is not required, and the
command line reads files as before.

**The needs** are listed from what the bodies read: the `tokens` line, the libraries, and every component named
by `component=`, an `INSTANCE_SWAP` default or a `(key)`. A name a body of the same blueprint defines is
satisfied there. Whether the rest are found in Figma, would be swapped, or are missing is the locator's answer
(the lock), not the reader's.

**Kept in the file**, as a component file is: a `.blueprint.kdl` given to the Templates pane is read on keep and
refused with every problem when it does not read, else kept under its page's name. A blueprint and a component
cannot share a name in the list, since a row is found by its name. Nothing on the screen supplies an artboard's
inputs, so an artboard body that reads them is refused there.

**Not built yet:** building a blueprint as a whole (each component still builds from its own file, one at a
time, and building a kept blueprint is refused, saying so), a blueprint from the command line, and creating the
page a run builds into. *Built 22 October 2026:* the Build pane holds `tokens` against what was loaded and resolves
the needs in Figma, by the locator's dry pass (`LOOK_UP_NEEDS`, `reference.md`, *The Build pane's look*).

### The lock

*Designed 22 October 2026 (the plan of that day, section 2.3); the record, the plugin's two fillers and the locator are built.*

A file that uses a published library has none of the library's variables, styles or components locally, so a
name a file writes finds nothing in it. **The lock** records, on the file's root, what each such name resolved to:
a key. Shared plugin data `toghen/lock`, sharded through `shardedData.ts` as kept templates are, since a library
of a few hundred components passes Figma's 100 kB per entry. The shape is `reference.md`'s, *The lock*: per
library (keyed by its name, as Figma names it) the components by name, the styles by token path, the variables by
`<collection>/<variable name>`, who wrote the entry last, and the library file's key where a run could read it.
Beside the libraries, Build's overrides map.

**It is not a ledger.** It holds what a name resolved to, never what Toghen wrote: no hash, no time, no receipt.
Receipts stay one per object (the stamp ruling). When the lock sends a name to another key, the imported component
has another id and its layer's receipt no longer matches; the relink step plans the swap, one `SWAP_COMPONENT` per
stamped instance (*Identity: what is ours*).

**What the API allows, and does not.** `figma.teamLibrary` lists the enabled libraries' variable collections (each
with `name`, `key` and `libraryName`) and a collection's variables (`name`, `key`, `resolvedType`). Nothing lists a
library's components or styles: they import by key only (`importComponentByKeyAsync`,
`importComponentSetByKeyAsync`, `importStyleByKeyAsync`), and a remote component or style says no library's name.
An unpublished key fails to import with the message an unknown one gives (measured, §15), so a failed import
cannot say which; the library's own publish status can, read in the library file. `figma.fileKey` reads only in a
private plugin, or a development one with `enablePrivatePluginApi`: the manifest sets it while the plugin is in
development, and **a published plugin would lose `figma.fileKey`**. The lock does not depend on it: `fileKey` is
written only where a run could read it, never guessed. The manifest also asks for `teamlibrary`.

**Three fillers, as asymmetric as the API.**

1. **Variables, by discovery** (`DISCOVER_VARIABLES`, built). For each token the kept files bind (component files
   and blueprints, read by today's readers), the collection and name the variable sync gives it (the sum and
   `tokenPathToVariableName()`, one function, `variableSlots()` in `resolve.ts`), matched by both names against the
   enabled libraries' variables. A match in one library is written under its name (`by: 'discovery'`). **A match in
   two is a choice: listed as a row, never picked** (R10); nothing is written for it, a key written earlier is
   dropped, and the person names the one to use in the overrides map. The rows go to the result surface
   (`planType: 'discovery'`), one per token (R14). It needs the design system loaded, which gives the collections.
2. **Components and styles, by the run that built the library, or the command line opening both files**
   (`LIBRARY_KEYS` and `LOCK_WRITE`, built 22 October 2026). The library file knows its own keys and publish status.
   The command line pairs a plugin in each file (*The command line*, *Pairing*), asks the library's for its stamped
   sets, the styles the style sync stamped and its variables, each with its key and status, and the file key where
   `figma.fileKey` reads; it has the target's write them as the library's entry, whole (`by: 'build'` after a build
   in the library file, `'command line'` for `lock`). Each set or style whose status is not `CURRENT` is a line: its
   key is in the lock, and it imports once a person publishes the library and accepts its update.
3. **By a person picking once** (`LOCK_PICK`, built). With one layer selected: an instance placed from the assets
   panel gives its main component's key (its set's key and name, for a variant); the layer's text and effect styles,
   when remote, give theirs, kept by the token path their name spells. The library's name comes with the command,
   since the API gives none (`by: 'person'`).

`LOCK_FORGET` drops a library's entry; `SET_BUILD_OVERRIDES` replaces the map.

**The locator** (`resolve.ts`) answers each name in one order and never falls back:

1. **The overrides map** replaces a name first: a component's name, a token path, or a declared library's name, to
   another name or to a key written `(key)"…"`. Each replacement is said among the run's notes. It applies to every
   run in the file, since it is the file's record.
2. **A declared library** answers a name its lock entry holds, by importing the key
   (`figma.variables.importVariableByKeyAsync`, the component or set calls, `figma.importStyleByKeyAsync`). A blueprint
   declares libraries with its `library` lines; a component or artboard file alone declares none, so it stays
   local-only unless its caller passes `RunOptions.libraries`. A variable is found by the collection and name the
   sync gives the token, so a file whose libraries hold variables needs the document loaded.
3. **Any other name** resolves in the file, as before.

**A name found both in the file and in a declared library stops the build, naming both**, as a token whose name is
in two collections does; so does a name two declared libraries hold. A dry run imports nothing and lists what it
would import among its pending lines. A failed import says *not published, or not this key: publish the library,
then accept its update in this file*.

**Declared on the command line** (*built 23 October 2026*, .reference/plans/toghen-figma/plan-2026-10-23-figcraft-libraries.md). `--use <library>`
on `components` and `sync` declares a library for every file the run builds (`RunOptions.libraries`), in both targets:
the library's name as the lock holds it, in Figma; its `.figcraft` file, in FigCraft. Where `--use` is absent, nothing
changes: every name resolves in the file, as before.

**In FigCraft** (*built 23 October 2026*). A library is a published `.figcraft` file. FigCraft names it by an id the
file keeps (so a moved file is the same library) and a run reaches it by its path. A key is
`<library id>:<asset id>`, the asset id being the library's own id for it: a component's or set's node id in the
library file, `VariableID:n`, `S:n`. For a variable or a style, that is also its copy's id in the file that uses it.
The lock's shape is Figma's, keyed by the library file's name without `.figcraft`, with the entry's `path` and `id`
beside `by`. It is filled from the using file's own listing of the library (`library.list {assets}`), which names
every component, style and variable. No second plugin is needed, and nobody has to pick. FigCraft's root holds no
data, so the root's shared plugin data, and the lock with it, is kept in the record on the `-toghen` divider (*FigCraft*).

**Not built:** building a blueprint as a whole. The Build pane (22 October 2026) passes a blueprint's `library`
lines to the locator in its dry passes only: looking up its needs, and planning a relink (`PLAN_RELINK`), which keeps
the swaps of a dry build of every kept file. The relink is executed by each file's Build.

### Apply, through the field writer (*built 22 October 2026*)

Apply puts a token, or a group's tokens, on layers no blueprint built. Its query is over tokens, not layer names;
the scope and the kinds (frames, instances, component definitions) choose the layers. A group's tokens reach fields
by their last keys through the table `tokens=` uses (`planOf`), so a key means the same field in a component file
and in Apply. One token takes a field the table lets its type reach.

**One binding path.** Apply writes each field with `writeField`, the function a build writes with, given a layer
made of the node and the one field, and a `Resolved` holding the token's variable and its value at the declared
defaults. A convention's `BIND_VARIABLE` on a field the table binds goes through the same call. What Figma cannot
bind takes the declared defaults, and the plan names that context on the operation before Execute (R10).

**No stamp.** No blueprint declares Apply's writes, so nothing reconciles them: they are the person's, done with a
tool, as a convention's binding is. On a component a blueprint or a component file built, an applied field the file
declares reads as drift on the next build, and the drift rule applies: the edit is kept and said, or overwritten when
asked. A field the file does not declare is outside its receipt and stays as applied.

**Instances and definitions are frames.** The field table's `INSTANCE` is what a component file may say of an
instance, which leaves overrides out. Apply writes overrides, so it reads an instance, like a component definition,
with a frame's fields, as the property roster counts them.

---

## The command line

> The command line is built and has run in a real file. The bridge's measurements, the first run's findings and the open questions are in [decisions.md](decisions.md#the-command-line).

### The problem it answers

A command outside Figma cannot write to a file: the Plugin API runs only inside Figma, so a command reaches the file through a plugin that is open there. The engine runs in that plugin, so a change to the engine reaches a file when the plugin is built.

Variables have no command at all. The plugin syncs them from a resolver document pasted or uploaded into its screen, and a token set spread over several files has to be bundled with lib's `load` first (see the guide, *Tokens in several files*). Nothing puts the steps in order either: a component file names variables and text styles, and a run fails if one of them is not in the file yet. Today a person has to know to sync first.

A command that took the token source and the component files, and did the whole job in order, would make the toolkit usable from a design system's own repository, with an npm script.

### Why there is no Figma sign-in

The first question about any such command is how it authenticates to Figma. The answer is that it doesn't, because no credential would let it do the job:

- **The REST API cannot write a file's contents.** Every file endpoint is a `GET` ([file endpoints](https://developers.figma.com/docs/rest-api/file-endpoints/)). Nothing creates a component set.
- **Its variables endpoints are for Enterprise orgs only.** "To use this API, you must have a Full seat in an Enterprise org" ([variables](https://developers.figma.com/docs/rest-api/variables/)), for reading as well as writing.

What REST can read is shared plugin data: `GET /v1/files/:key?plugin_data=shared` returns it with a personal token on any plan ([file endpoints](https://developers.figma.com/docs/rest-api/file-endpoints/), read 23 October 2026), and Toghen's stamps and lock are shared plugin data. A job with no plugin could read what a file records of a sync, never write it (*Not in this design*).

Only the Plugin API can build what Toghen builds, and it runs inside Figma. There are two ways in: `use_figma`, which an agent drives and whose sign-in the Figma MCP connector already handles, and a plugin running in the open file. A plugin acts as the person who opened it. That person's session is the authentication.

### The bridge

A plugin cannot listen for connections, but its UI is a web page and can open one. The command line listens on a fixed localhost port; the Toghen plugin's UI connects to it and relays messages to and from the plugin's main thread, where the handlers run.

```
toghen-figma ── ws://localhost:3055 ── plugin UI ── postMessage ── plugin main
@toghen/lib       (the command listens)     (relays)                    handlers, engines
```

The port is fixed because the manifest names it: Figma refuses a port the manifest does not declare. A command that finds the port taken says so and stops.

### A second front-end, not a second engine

The plugin already has a message protocol between its screen and its main thread (see reference.md, *Message Protocol*): `LOAD_DOCUMENT`, `PLAN_VARIABLE_SYNC`, `EXECUTE_VARIABLE_SYNC`, `PLAN_READY`, `OPERATION_COMPLETE`, and the rest. The command line speaks that protocol. It sends the commands the screen sends and reads the responses the screen reads, so the handlers, the engines and their tests serve both.

It adds one command the screen has none of: running a component file. That command is `RUN_COMPONENT`, the *plugin runtime* that *Components from files* lists. The plugin bundles the engine (`main/handlers/runComponent.ts` calls `runComponentFile` from `main/components/file.ts`), and runs it on the component and the document the command line sends. 

**The plugin does not roll back.** When a run fails part way, the plugin's writes stay. The engine already stops before its first write for everything it can foresee (a name that does not resolve, a set that is not ours, a breaking step, `pending` in a real run), so what is left is Figma refusing a write in the middle. A run that fails there leaves what it wrote, and the next run, which reconciles by stamp, finishes it. Asking Figma to undo was measured and rejected: `figma.triggerUndo()` reverted past the last `figma.commitUndo()` in five trials of six (Figma's docs say it reverts to the last commit; the measurement stands), taking work from before the commit with it ([measured behaviour](.reference/figma/measured_behaviour.md#a-plugin-reached-from-a-local-process)). An undo after a failed run could delete a person's earlier edits; a half-written set is completed by the next run. So the plugin does not undo.

A command the command line runs is still a command the plugin ran. Its plan, progress and outcome go to the plugin's result surface like any other (the rulebook, *Results go to the shared surface*), so a person at the screen sees what the command line did.

### A run

The worked case is a design system whose repository holds a resolver document, its token files and its component files:

```json
"scripts": {
  "figma:check": "toghen-figma sync tokens/resolver.json components/*.component.kdl --dry-run",
  "figma:sync": "toghen-figma sync tokens/resolver.json components/*.component.kdl"
}
```

`npm run figma:sync` does this, in order:

1. **Read everything, and check it before touching Figma.** lib's `load` reads the entry, a resolver document or token files, and inlines every file it reaches. Each component file is read, evaluated and validated, as `components` does today. Every token and text style a component file names is looked up in the loaded design system. The command reports a name the design system does not define, with its file, line and column, and the run stops with nothing sent.
2. **Wait for the plugin.** The command prints a pairing code and waits. The person runs the Toghen plugin in the target file and enters the code (see *Pairing*).
3. **Sync the variables.** It sends `LOAD_DOCUMENT` with every file the load read and the entry, the name and the map it was given, so the plugin runs the same `load` and its screen shows what was read; then `PLAN_VARIABLE_SYNC`, prints the plan's summary, and sends `EXECUTE_VARIABLE_SYNC`.
4. **Sync the styles.** The same with `PLAN_STYLE_SYNC` and `EXECUTE_STYLE_SYNC`, since a component's text names a text style.
5. **Run each component file.** Every name it uses now resolves, because the steps before made it. A file whose run would take a breaking step stops there, unless the command was given `--allow-breaking`. The report is the engine's own: steps, created, updated, deleted, breaking.
6. **Exit.** `0` when every step succeeded, `1` when a file failed its checks or Figma refused a step. The plugin stays connected for the next run.

The first step is what makes the rest lean. The command knows which variables exist because it made them from the same source, so a component file can rely on its token names, and the check that they exist runs in the repository, where the error can point at a line.

**A run with a library** (`--library <name>`, *built 22 October 2026*). The run holds two plugins: one in the library file and one in the target file, the file that uses the library. Steps 3 to 5 go to the **library file**: it is where components are made and what gets published, and a target file holds none of the library's objects locally, only keys to import. The target file gets one thing, the lock: after the last step, the command line asks the library's plugin for its own keys (`LIBRARY_KEYS`) and sends them to the target's (`LOCK_WRITE`), which writes them as that library's entry, whole, with `by: 'build'`. It prints one line per set or style not `CURRENT`, *"Badge" is not published as it is now (CHANGED): publish the library, then accept its update in the target file*, and one line counting the variables not `CURRENT`. Publishing and accepting the update are a person's steps (measured behaviour §7); a key in the lock imports only after both. A build that did not complete writes no lock; a dry run reads the keys, prints the lines, and writes no lock.

**A run with a library, in FigCraft** (`--library <library.figcraft>` beside `--figcraft` or `--figcraft-file`, *built 23 October 2026*). In FigCraft, publishing and accepting are commands, both local, so the run does them. Nothing pairs. The target is the file FigCraft shows, or the `--figcraft-file`. The library is pinned by its path: live, its tab, or a tab the run opens and leaves open; headless, a second document in the same `figcraft-cli mcp` session. A library file that does not exist yet is made. The steps:

1. **Build** steps 3 to 5 in the library file.
2. **Publish and save** the library (`library.publish`, then `file.save` at its path), since other files see a library only once it is saved. FigCraft refuses a publish with nothing changed since the last (measured, 0.10.0); the run takes that for a library already in step, says so with its version, saves, and goes on to the target.
3. **In the target:**
   - enable the library (`library.add`), which also points a moved file's library at its new path;
   - accept that library's updates, and no other's;
   - write the lock from the target's listing of it, through `LOCK_WRITE`, `by: 'build'`.
4. **Save the target** last, headless. Live it is the person's to save, as always.

A build that does not complete publishes nothing and touches no target. A dry run does none of the four, closes a library file it made, and says whether the target has the library and what updates wait there. `lock <library.figcraft>` with a FigCraft flag does the target's half alone.

### Commands and arguments

A run is configured by its arguments, and a repository keeps its runs as npm scripts. There is no configuration file: a script line holds the same information, and is already where a repository keeps commands.

```
toghen-figma variables <entry.json>… [--name <name>] [--overrides <map.json>] [--collection <name>] [--dry-run] [--allow-breaking] [--library <name>]
toghen-figma components <file.component.kdl>… [--resolver <entry.json>] [--page <name>] [--dry-run] [--allow-breaking] [--library <name> | --use <name>…]
toghen-figma sync <entry.json>… <file.component.kdl>… [--name <name>] [--overrides <map.json>] [--collection <name>] [--page <name>] [--dry-run] [--allow-breaking] [--library <name> | --use <name>…]
```

**The entry is what the core's `load` takes** (*built 22 October 2026*). Every `.json` argument is part of it, in order: one resolver document, one token file, or several token files that `load` merges in order, the last winning. A `.kdl` argument is a component or artboard file, so the two never need telling apart by position. `--name` is `load`'s `name`, the collection of token files, which defaults to their common folder; `--overrides` is a file holding `load`'s map, a `$ref` as written → the location to read instead. The command sends the plugin the **files themselves** rather than the bundle: the plugin runs the same `load` over them, so the composition it shows and the collisions it reports are its own, as for a pick on its screen, and the command prints the collision rows the plugin answers with. *Not chosen:* the bundle as one file, with the composition sent beside it. The plugin would then load a resolver document with no references, and show a second, hand-carried account of the load that its own `load` never made.

| Command | What it does |
|---|---|
| `variables` | Steps 1 to 4 with no component files: variables, then styles |
| `components` | Steps 1, 2 and 5, assuming the variables and styles are there. With `--resolver` it reads the design system to answer a file's `(modifier)` axes and `tokens=`; it still leaves the check of names to Figma. |
| `sync` | The whole run; it needs at least one component file |
| `check` | The files read against the design system, with no plugin and no Figma file (below) |
| `lock <name>` | No build: pairs a plugin in the library file and one in the target file, and copies the library's keys into the target file's lock (`by: 'command line'`) |

`variables`, `components` and `sync` take **`--library <name>`**, the library's name as Figma names it (the lock is keyed by it, and no plugin can read it: `figma.root.name` read `Document` through the connector, §15). The run builds in the library file and writes the target's lock (*A run with a library*, above). With `--figcraft` or `--figcraft-file`, `--library` takes the library's `.figcraft` file instead (*A run with a library, in FigCraft*). A share link, which names a team library on a `figcraft-server`, is refused: it reaches outside the machine.

`components` and `sync` take **`--use <library>`**, as often as needed. It declares the libraries the files' names may come from (*The lock*, *Declared on the command line*). In FigCraft the run first enables each one in the target and reads its lock entry again from the target's listing, without accepting its updates; a dry run does neither. `--use` with `--library` is refused: one runs the files into the library, the other into a file that uses libraries.

**`check`, a command with no plugin** (*ruled and built 13 October 2026*).

```
toghen-figma check <entry.json>… <file.component.kdl>… [--name <name>] [--overrides <map.json>] [--input <document>]
```

It reads every file against the design system as the plugin's check does (`CHECK_COMPONENTS` with `names`: the file's own errors, its axes, its `tokens=`, and every token or style it names held against the design system's definition, and against the sum the variable sync makes, so a folded part's name is refused) and prints the problems, one per line in the `<file>:<line>:<column> <message>` form, with the warnings. It exits `0` when no file has an error and `1` otherwise. It never pairs and needs no Figma file, so an agent migrating a family of components can run it at every step. The check is the plugin's own function, given the resolver as an argument instead of reading it from the plugin's state; the command builds the resolver in Node from the document lib's `load` returns, as the plugin does when a document is loaded, with no trip through JSON text between them. What it cannot know is what only Figma holds: whether a variable already exists, or is ambiguous between collections. Those stay the dry run's. *Not chosen:* exporting the reader as built JavaScript from the package. That is a public API to document and keep, the package is private, and an agent needs a command, not a function.

**`members`, the members as JSON** (*ruled and built 22 October 2026*). `toghen-figma members` takes what `check` takes and prints each file's component, members and problems as one JSON array: what the reader makes, in the model the reference owns. A design system that draws its members somewhere Toghen does not (a documentation page, a datasheet, an app Toghen has no target for) reads them through this command instead of importing Toghen's modules by path, which broke on every rename. *Not chosen*, as for `check`: a function exported from the package.

`--collection` is the `collectionName` of both `PLAN_VARIABLE_SYNC` and `PLAN_STYLE_SYNC`, so the styles bind to the variables the run made (see *A member becomes a binding*, which records the defect that once kept them apart). `--allow-breaking` lets a component run take breaking steps (see *Breaking steps stop a real run*) and the variable plan delete a removed context's mode; without it, a run that would take one stops before writing and lists them. Modes need no argument: the plugin derives them from the resolver document, as it does for a document loaded on its screen.

### Pairing

The socket's origin is `null`, so the command cannot tell the plugin from any web page that opens the same port. A page that connected first would be sent the design system's tokens.

So the two pair. The plugin connects only when the person asks it to, from its screen. The command prints a short code; the person types it into the plugin; the plugin's first message carries it, and the command refuses a connection without it.

What this protects against, and what it doesn't:

- **A web page cannot pose as the plugin.** It doesn't have the code.
- **A process on the same machine could pose as the command line** while the person enters a code into it. Such a process already runs as that person and can do worse, so pairing does not try to stop it.

**A pairing lasts until the plugin closes.** A code per run would be typed at every `npm run`, which punishes the workflow this design is for. Each run is a new process, and the plugin reconnects to it when it starts (measured), so the secret has to outlive the process. The command line keeps it in a file only the person's account can read; the plugin keeps it in memory. Closing the plugin ends the pairing, and the next run prints a new code. A pairing that survived the plugin closing would need the plugin to store a secret too, and a control to forget it, for one code typed per session saved.

**How a run tells that the plugin closed.** It cannot: between runs nothing is listening, so a plugin that closed and one that is only waiting look alike. So a run that finds a kept code listens with it for a short while (3 seconds; the plugin retries every second), and if nobody pairs it makes a new code, writes it over the old one and prints it. The command refuses a plugin still open with the old code, with the close code the plugin treats as final, and the plugin stops trying and says so.

The code is eight characters from an alphabet without look-alikes (about 40 bits), compared without case or dashes; after five wrong codes in one run the command stops, so a page that guesses cannot go on guessing. The server listens on `127.0.0.1` and `::1` and on no other address.

**Two codes, with a library** (*built 22 October 2026*). A run with `--library` holds two plugins on the one port, so it prints two codes, each with the file it is for: *In the library file "Toghen Test Library", enter ABCD-2345; in the target file, enter EFGH-6789.* The smallest change to the bridge that does this: `serve` takes one code per role and answers one bridge per role. A connection pairs as the role whose code it gave, and replaces only that role's plugin; nothing else about pairing changes. The codes are as above, each eight characters. The five wrong codes are counted across both roles, and stop both. Each role keeps its own code, in its own file (the target's where a run without a library keeps it, so the plugin in the target file finds either kind of run). The kept-code rule holds per role: a run listens with every kept code for the same short while, and gives a new code, printed with its file, to each role nobody came back for, replacing the kept one in place so a plugin still open with it is refused. *Not chosen:* two ports. The manifest would have to name a second one, and a second listening socket is a second thing a page could find. *Not chosen:* one code for both. The command could not tell the two plugins apart, and would send the library's build into whichever file paired first.

### The plugin's screen

Connecting is a UI change, so the rulebook binds it. These rules apply before any layout is drawn:

- **A status claims only what it can check.** The connection shows as an observed event, such as `Connected to the command line at 14:02`, not as `Ready`.
- **Results go to the shared surface, and a plan names itself.** A plan the command line asked for says so.
- **A control lives with what it changes.** The connection is in the Load pane's Source card, beside where a document comes from, since the command line is how one may arrive (the UX map names it).

**The screen.** A *Command line* group at the foot of the Load pane: with no connection, a field for the code and a *Connect* button; with one, a status line and *Disconnect*. It is outside the loaded-document block, because the command line is how a document may arrive at all, so the control cannot wait for one. That reads R8's "one way in" as one way for a person to put a document in; the command line is a front-end for every command, not a second way to choose a file, but a reviewer may read the rule the other way (see the UX map, *Open*).

Its status is the last event observed (R11), each with the fault and what to do (R13):

- `Connected to the command line at 14:02`
- `Lost the command line at 14:05`
- `Nothing answered on localhost:3055 (tried at 14:01)`
- `The command line did not accept that code`

Results of what the command line asked for go to the shared surface (R2), whose header says `from the command line` (R6), and a component run is shown there too, as counts and rows (R4, R14). The status bar, the tab strip and the other panes are as they were.

### A dry run across steps

A dry run of `sync` writes nothing, so after its variable step the variables it planned still do not exist. The component step then looks them up, finds nothing, and the engine throws, because a name that does not resolve stops a run before any write. A dry run that fails wherever a run would succeed is no use.

The engine does not need the variables in a dry run. It resolves names there only as a check: the diff never reads what they resolved to (`run.ts`, where a dry run returns before anything is applied). What it needs is to know that each name *will* resolve. The plans already say so. The variable plan lists a `CREATE_VARIABLE` for each variable it would make, with its name and its collection, and the style plan a `CREATE_STYLE` for each style, with its name. The plugin keeps only the last plan it made (`lastPlan`), so the command line collects the names as each plan arrives.

So the component step's options gain `pending`: the variables, by collection, name and type, and the text styles, by name, that an earlier step of the same run would create. The names are the engine's own, the ones its lookup compares, so it needs no knowledge of plans. A `CREATE_VARIABLE` names its collection by id; the command line reads the names of existing collections with `GET_FIGMA_COLLECTIONS`, and of new ones from the plan's `CREATE_COLLECTION`. Turning plan operations into pending names is one pure function in `shared/`, tested without Figma.

The engine treats `pending` this way:

- **In a dry run, a name that does not resolve but is pending counts as present.** It goes into the report's `pending` list, apart from the steps, and the run goes on.
- **A name that is neither in the file nor pending still stops the run,** as today.
- **A real run refuses `pending`.** It would build components bound to variables that do not exist; in a real `sync` the variables were made a step earlier, so every name resolves without it.
- **A pending name joins the ambiguity check.** The engine reports a pending variable that matches a token alongside an existing one in another collection as ambiguous, as it would two existing ones.

**Worked example.** The file has a `Tokens` collection with `space/sm`, `md` and `lg`. The resolver document adds `space.xl`, and a component file uses `itemSpacing="{space.xl}"` on line 12. `toghen-figma sync … --dry-run`:

1. The repository check finds `space.xl` in the design system.
2. The variable plan holds `CREATE_VARIABLE` with name `space/xl`, type `FLOAT`, in the existing `Tokens` collection. Nothing is written.
3. The component's dry run is given `pending: { variables: [{ collection: "Tokens", name: "space/xl", type: "FLOAT" }], textStyles: [], modes: [] }`. Its report lists its steps as usual and, apart from them, `token {space.xl} (line 12): the variable sync would create "space/xl"`. The command exits `0`.

Run with `--collection Other`, the variable plan makes a second `space/xl` in `Other` and nothing in `Tokens`; the dry run then finds the name in two collections once both exist, which is the ambiguity the engine refuses. A component whose `modes state=hover` pins a context the variable plan would add counts it as present the same way (`pending.modes`), which the first real run found missing.

**Components the same run would create** (*ruled and built 24 October 2026*). A first-ever dry run of a file whose instance names a set another file of the run builds found no such set, and stopped. Two changes meet it.

- **The files run in dependency order**, in a real run as in a dry run, in Figma as in FigCraft: each component file after every file that defines a component it names, artboards last (`shared/components/order.ts`). Ties keep the typed order, so only a file with a dependency moves; a name a declared library holds is no dependency. A real run in which a file named a set a later file defined failed the same way, so the order is not the dry run's alone. Files that name each other in a cycle cannot be built in any order, and the run stops before the variable plan, naming the cycle.
- **A dry run passes each file the sets the files before it would create** (`pending.components`): a set whose report holds a `CREATE_SET`. A pending component counts as present by name. *Ruled:* only its name is checked; the properties and slots set on its instances are checked on the run that builds it, and the dry run says so once per component per file. *Not chosen:* passing each pending component's declared properties and slots for a full check, more code in `Pending` and in the check for a mistake the real build names with its own message. A real run still refuses `pending`.

### FigCraft (*ruled and built 19 October 2026; stamps built 22 October 2026; components built 23 October 2026, finished the same day; libraries built 23 October 2026*)

```
toghen-figma variables <resolver.json> --figcraft <port> [--collection <name>] [--dry-run] [--allow-breaking] [--overwrite-drift]
toghen-figma sync <resolver.json> <file.component.kdl|file.artboard.kdl>… --figcraft <port> [--input <document>] [--page <name>] [--dry-run] [--allow-breaking] [--overwrite-drift]
toghen-figma components <file>… --figcraft <port> [--resolver <entry.json>] …
toghen-figma variables|components|sync … --figcraft-file <path.figcraft> …
toghen-figma variables|components|sync … (--figcraft <port> | --figcraft-file <path.figcraft>) --library <library.figcraft>
toghen-figma components|sync … (--figcraft <port> | --figcraft-file <path.figcraft>) --use <library.figcraft>…
toghen-figma lock <library.figcraft> (--figcraft <port> | --figcraft-file <path.figcraft>) [--dry-run]
```

[FigCraft](https://github.com/storytold/figcraft) is an open-source design app that reads and writes Figma's model. It runs no Figma plugin: its own plugins are WebAssembly modules that act through its commands, and its documentation says JavaScript plugins written for other apps do not run. So the plugin cannot be the way in. What FigCraft offers instead is a loopback control socket (`figcraft --control <port>`): newline-delimited JSON, one request and one reply, running the same commands as its menus. Its variables are Figma's model spelled its own way: collections with named modes, four types, values per mode id, aliases, scopes, Web code syntax; and its text, effect and paint styles bind variables to their fields as Figma's do.

**A second back end, not a second engine.** The command line runs the plugin's own handlers in its own process (`cli/figcraft.ts`). Their reads go to a `figma` that answers from what FigCraft lists (`variable.list`, `style.list`, `text.fonts`), in Figma's shapes (`figmaView` in `cli/figcraftFile.ts`); their writes go through one seam, the operation writer (`writeOperationsWith` in `main/engines/operationExecutor.ts`), which turns each plan operation into FigCraft commands (`translate`). The plans, their checks, the dry run and the report are the Figma run's, step for step (*A run*). Nothing pairs: the socket listens on 127.0.0.1 only, and FigCraft's own trust model is the person who started it with the port.

**One operation, one batch.** Each operation is one `command.batch`, which FigCraft runs in one frame as one undo step, named as the plugin's progress names the operation, and undoes whole when a step fails. A variable and its scopes, or a style and its bindings, land together or not at all.

**The file.** FigCraft acts on the file a window shows. The run pins the file shown when it starts; every batch first shows that file again (`doc.switch`) and ends by listing the tabs (`doc.list`). A person who looks at another tab during a run sees the target come back, and the write still lands in the target. A file that is no longer at its tab (a tab before it closed) stops the run: the batch that found out may have written into the file now at that tab, and every later request is refused before it is sent. Where FigCraft has several windows, every request also names the window.

**Headless** (*built 23 October 2026*; .reference/plans/toghen-figma/plan-2026-10-23-figcraft-finish.md, unit 5). `--figcraft-file <path.figcraft>` runs into a file with no app: continuous integration, or a machine with no screen. The command line starts `figcraft-cli mcp` as a child process, a headless FigCraft session with no window, and speaks MCP to it over its stdio. It is a second transport behind the same connection (`Control` in `cli/figcraft.ts`): a request the socket would send as `engine.execute` goes as the `run_command` tool, which runs the same command registry. Everything above the transport is unchanged: the pinned file, the plans, the stamps, the components. The session opens the file, or starts from its untitled file when the path does not exist yet, and has no window, which the pin already allows. Over the socket the file is the person's to save; headless, nobody is there, so the run saves it, and saves it whole or not at all:
- **Saved once the run has completed**, after the stamps are written, so the file saved holds them.
- **Not saved** by a dry run, or by a run that stopped partway: the file stays as it was, and the next run starts from it. A design half applied is worse than none (*A run*).
- **The CLI must be 0.8.0 or later**: its `node.get` reports the layer data that holds the stamps, and 0.7.0's does not, so every stamp would read as absent. The version comes from MCP's `initialize`, and an older one is refused before anything is opened.
- **The fonts are the machine's**, as in the app. FigCraft's `--no-system-fonts` (or `FIGCRAFT_NO_SYSTEM_FONTS=1`, which the child inherits) narrows them to FigCraft's own, and so changes what `text.fonts` lists, which the style plan reads; Toghen exposes no flag for it. Fonts loaded from the repository (`text.loadFont`) wait until someone needs them.

Rejected for the live app on 19 October (decisions, *Ruled: a FigCraft target*), MCP is the way in here: with no app there is no socket. `figcraft-cli run` was considered and rejected: a script is all-or-nothing, and a failure loses the reads before it, while the run reads, plans, writes and reads again.

**What changes against Figma.**

- **The stamps live on a page.** FigCraft's variables and styles hold no data, so the stamps Figma keeps on each of them are kept together in one record, in the data of a page, keyed by object id (decisions, *Ruled: the stamp*, *FigCraft*). FigCraft 0.8.0 reads a page's data back. The page is a divider, `-toghen`: FigCraft shows it as a line in the pages list and never opens it, so it holds no layers and asks for no attention. It is found by its data, never its name, so a page renamed or moved by hand still holds the record. The first run that writes makes it; a dry run makes nothing. The record is read once when the run begins and answered through each variable and style as Figma's shared plugin data, so the plans read stamps exactly as they do in Figma, and the executor stamps each write the same way, reading the object back through what FigCraft lists. It is written back once, when the run ends or fails partway: one undo step, *Toghen stamps*, and none when the run stamped nothing. With the stamps, a value or a style changed by hand in FigCraft is drift, kept and reported, and `--overwrite-drift` writes over it; an unchanged one is not written again; a variable renamed by hand is found by its stamp and named back. The record also keeps what FigCraft's document root cannot (*built 23 October 2026*): the root's shared plugin data, so the lock lasts from run to run, and what each library copy was imported from (*Libraries*, below).
- **An id can be given again.** FigCraft gives a new object the highest id in use plus one, so deleting the newest variable and making another hands the old id over. Each entry therefore notes what it was written on, a variable's type and collection or a style's type, and an entry whose object is gone or no longer matches is dropped at the run's first read; Toghen's own deletes drop theirs at once. A person's variable that took the id of one of the same type and collection is still taken for Toghen's, and reads as drift.
- **A record lost is a first run.** A deleted page, an undone *Toghen stamps* step or a run killed before it ends leaves objects with no stamp: the next run adopts them by name and stamps them, as a first run does.
- **A font weight is not bound.** FigCraft binds a text style's family, style, size, line height and letter spacing, not its weight. A typography whose weight refers to a token keeps the weight written into its font style, and since FigCraft never holds the binding the plan asks for, that style is written again on every run.
- **Shadows and gradients only.** An effect style is drop and inner shadows, a paint style is gradients: what the style plan produces.

**Components and artboards** (*built 23 October 2026*; .reference/plans/toghen-figma/plan-2026-10-22-figcraft-components.md, decisions, *What the build found: components in FigCraft*). Reconciled in place, with stamps, as in Figma, rather than imported whole: a hand edit is kept and reported, and the dry run, the breaking gate and `--overwrite-drift` are Figma's. The run is the plugin's own (`main/components/run.ts`), with two seams:

- **The reads go through a view of FigCraft's layers as Figma nodes** (`cli/figcraftScene.ts`), the way `figmaView` gives its variables. Resolution, the snapshot, `reportedOf` and `expectedOf`, the stamps, the copies and the end of a run are then Figma's code, unchanged. The view writes back only what those reads write: shared plugin data (a stamp), a removal, a position and a set's size; the target sends them as one batch.
- **The writes go through a component writer** (`writeComponentsWith` in `main/components/run.ts`), which turns each step into FigCraft commands, one batch each, `{"$step": n}` standing for what the batch made (`cli/figcraftApply.ts`). A new set is one batch: every member built whole, combined, named, given its properties and wired. The receipts are taken last, as in Figma, from what FigCraft reports once every write is in.

A node's stamp lives on the node, in its own layer data, under `toghen.stamp`: layers have room for data, which variables and styles do not, so only theirs are on the divider. Node ids are never given again (measured), so a node's stamp needs no guard.

What differs from Figma for components:

- **What FigCraft keeps and does not report is trusted, not read.** A layer's wiring to a component property, a frame's variable modes, and the fields FigCraft takes without reporting them (normal against pass-through, corner smoothing, a line's cap, a text's maximum lines, paragraph spacing and indent, constraints where it leaves them out, an exposed instance) are kept beside the stamp (`toghen.unreported`) as the file declares them, and read back from there wherever FigCraft reports nothing. A hand change to one of them is not seen. A slot property's description and settings, which FigCraft's slots do not hold, are kept the same way on the set. A request that `node.get` report them is drafted in `.reference/figcraft/request-node-get.md`, for Egildo to post; once it ships, the view reads them as it reads every other field.
- **A value written to a field lets its variable go.** FigCraft keeps a layer's four corners as one field, and its four sides as another: a value written to a corner or a side lets every corner's or side's variable go, and a corner bound beside a bound `cornerRadius` does nothing (measured 23 October 2026). A side written also lets a bound `strokeWeight` go (measured against 0.10.0). So every list is written whole and its parts bound after; a layer with a corner of its own binds each corner, never `cornerRadius`, and one with a side of its own binds each side, never `strokeWeight`; and a patch to a corner or a side writes again every corner, or every side and `strokeWeight`, the file declares. The same holds for paints, effects and layout grids: written whole, then each part bound (`fills/0/stops/1/color`, `effects/0/radius`, `layoutGrids/0/gutter`).
- **An instance carries its main's data.** FigCraft makes an instance with a copy of its main's layer data, stamps included. An instance the run makes is emptied of both at once; the view leaves out what is inside an instance, and an instance stamped as a member, which only a main can be. What fills an instance's slot is the instance's own, with ids of its own, and Toghen stamps what it places there. What fills a new instance's slot needs the slot layer's id, which exists only once the instance is made, so a new artboard is two batches: the frame and its layers, then what fills the slots, each made with the instance's slot layer as its parent.
- **A binding settles what it binds.** Measured against `figcraft-cli` 0.10.0 headless, 24 October 2026: a solid paint bound to a colour variable shows the variable's value in the layer's effective mode (a child takes the mode its root pins), its alpha in the colour, at paint opacity 1; a bound `height` makes the layer's vertical sizing fixed, and a text's resizing none; a bound `width` makes the horizontal sizing fixed, and a text that resized both ways resize its height only, whatever was written before or after. So the view reads a bound paint's opacity as the paint's own, the receipt compares a bound paint by its variable, and the check refuses a bound size beside a sizing that lets the layer size itself (*Identity: what is ours*).
- **A set never breaks.** FigCraft keeps a set two members of one combination share and lists the clash; the view reads such a set as Figma reports a broken one, so the run stops on it as in Figma.
- **A library's copies are not the file's.** Once a layer uses a library's variable or style, `variable.list` and `style.list` list the library's copies beside the file's own. Their ids are prefixed with the library's (`294b4f2d88c18a6e:VariableID:1`, `…:S:1`); a copied collection's mode ids are not. The view leaves them out of the local lists, as Figma's `getLocal…` does, and answers them by id, as imported ones (`remote`).
- **A member added to a set that exists is given the set's properties before it joins.** In FigCraft 0.10.0 a component that joins a set holds none of the set's properties, whether it is reparented in or made by `component.addVariant`, and `component.bindProperty` on its layers is refused. One that holds them already keeps them (measured 23 October 2026, found by the live run). So the writer adds the properties to the new member and wires it while it stands alone, then reparents it after the members there, away from the set's top-left corner, whose member FigCraft takes for the set's default.
- **Refused by name before any write** (`refuses`), a dry run included: a component named by a Figma key, and preferred values by `key=` (FigCraft's keys are `<library id>:<asset id>`, see *Libraries* below; name the components instead); `textTruncation`, since FigCraft's truncation is a text's sizing (`textAutoResize: "truncate"`), not Figma's ending; the line cap `TRIANGLE_FILLED`, FigCraft's one triangle being Figma's `ARROW_EQUILATERAL`; a property whose default is a token; and any field outside the built table (`BUILT`). A property's description is not written: FigCraft's properties have none.

**Libraries** (*built 23 October 2026*; .reference/plans/toghen-figma/plan-2026-10-23-figcraft-libraries.md, decisions, *What the build found: libraries in FigCraft*). The library run is *A run with a library, in FigCraft*, and the lock is *The lock*, *In FigCraft*. A run into a file that uses a library declares it with `--use` and resolves through Figma's locator, unchanged. The FigCraft `figma` answers the four imports:

- **A component or a set** (`importComponentByKeyAsync`, `importComponentSetByKeyAsync`): `library.import` by the library's id for it. The copy is on no page. It is read by id into the view as a remote main under its key, and its data, the library's stamps among it, is never read as the file's. FigCraft gives no read for what a copy was imported from, so the record on the divider keeps it (`copies`: a copy's id → its key). That is how a dry run, which imports nothing, compares keys for the relink.
- **A variable** (`importVariableByKeyAsync`): `library.importVariable`. A field binds to the copy by its id.
- **A style** (`importStyleByKeyAsync`): FigCraft copies a style in only as it applies it. The view answers with the copy's id, and the writer applies a library's style with `library.applyStyle` where it would write `style.apply`.
- **A collection's mode** (`modes`, *built 24 October 2026*): `library.setVariableMode {library, collection, mode, ids}`, which copies the collection in, linked and read-only, and sets its mode on the layers. FigCraft checks the mode's name and refuses one the collection lacks; the run reports its refusal with the pin's line. FigCraft reports no pinned mode, so the pin is kept in `toghen.unreported` as `library:<library>/<collection>`, and an unchanged second run writes nothing. A dry run resolves through the lock as it is, so the library must be locked before one.

Importing is idempotent (measured), so a second run imports nothing new. **The relink is Figma's:** when the lock sends a name to another key (the library deleted a component and made it again, which FigCraft treats as another asset and never lists as an update), each of Toghen's instances of it is swapped with `instance.swap`, which keeps its stamp and overrides. A person's instance carries no stamp and stays on the old copy. A `(key)` written in a component file is accepted in FigCraft's form only. Preferred values by name resolve through the same locator, so a library's component can be offered.

Measured against FigCraft 0.7.0 on 19 October 2026, the stamps against 0.9.0 on 22 October 2026, the components against 0.9.0 on 22 and 23 October 2026, and the libraries against 0.10.0 on 23 October 2026 (decisions.md). FigCraft is young and releases weekly; its command list (`figcraft-cli commands`) is the reference for names and parameters, and a renamed one is a failed operation that names it.

### Not in this design

- **A run with nobody at the screen, into Figma.** Continuous integration has no plugin open. It could reach only variables, over REST, and only on Enterprise. Wanted when a consumer on Enterprise asks for it. A `.figcraft` file has one: `--figcraft-file` (*FigCraft*, *Headless*).
- **A drift report from CI, over REST.** Reading a file's stamps and lock with `plugin_data=shared` (*Why there is no Figma sign-in*) and comparing them with the repository, with no plugin. Wanted when a consumer wants CI to say a Figma file has drifted.
- **An export command.** The Sync pane's Export writes the loaded document at one combination of contexts, with the file's stamps when `$extensions` is ticked; it reads no value back from Figma. A command would give a pipeline its own document flattened, and stamps that loading never reads back. Wanted when a pipeline needs a one-combination token file it cannot make from its own document.
- **Watching the files and running again on a change.** Wanted once a run is fast enough that waiting for it is the annoyance.
- **Team libraries in FigCraft.** A library kept on a `figcraft-server` (`library.publishToServer`, a share link to `library.add`) reaches outside the machine; a share link to `--library` or `--use` is refused. Wanted when a consumer keeps its library on a server.
- **A library's extended collections.** `library.extendCollection` overrides a library's values per file. Wanted when a consumer themes a library per file. A library collection's mode is pinned in FigCraft (*FigCraft*, *Libraries*), and waits in Figma on a desktop measurement.
- **A configuration file.** npm scripts hold the runs. Wanted only if a run grows options that a script line can no longer hold readably.

---

## Key Files for Reference

| File | Purpose |
|---|---|
| `shared/protocol.ts` | Message type definitions (UI ↔ main) |
| `shared/operations.ts` | Operation types (plan/execute) |
| `shared/conventions.ts` | `PropertyConvention` TypeScript interface |
| `shared/tokenTypeMap.ts` | Token type → variable/style target mapping |
| `main/utils/correspondence.ts` | Where a token stands: the one comparison, read by the sync engine and the Inspector |
| `cli/main.ts` | `toghen-figma`: reads the arguments and runs the command |
| `cli/run.ts` | A run through the plugin: read and check, pair, sync variables and styles, run each component file in dependency order, dry run across steps |
| `cli/bridge.ts` | The localhost socket, pairing and the kept code |
| `cli/bin.mjs` | Runs `toghen-figma`, through a symlink too |
| `cli/figcraft.ts` | `--figcraft` and `--figcraft-file`: the control socket or a headless `figcraft-cli mcp`, a file pinned as shown or by path, a bridge per pinned file, the handlers run in Node with a `figma` that reads FigCraft and imports from its libraries |
| `cli/figcraftFile.ts` | FigCraft's listing in Figma's shapes, and each plan operation as FigCraft commands |
| `cli/figcraftLibrary.ts` | A FigCraft library: its key form, the lock's entry from a using file's listing, publish, enable and accept |
| `cli/figcraftRecord.ts` | The FigCraft target's stamps: one record on a page, read, guarded against a reused id, and answered through each variable and style |
| `main/handlers/runComponent.ts` | `RUN_COMPONENT`: the engine on what the command line sent |
| `shared/pendingNames.ts` | Plan operations to the names a dry run counts as present |
| `ui/bridge.js` | The plugin's half of the bridge: connect when asked, pair, relay both ways |
| `main/components/run.ts` | Makes Figma agree with a component file: resolve, snapshot, diff, apply |
| `shared/components/index.ts` | `readComponentFile`: a component file read by kdlet, evaluated per combination, and checked |
| `shared/components/read.ts` | Toghen's five top-level words into the model |
| `shared/components/fields.ts` | The field vocabulary: which fields each layer kind takes, what each holds, and how a token reaches it |
| `shared/components/validate.ts` | The document against its axes; a member as a whole; the members together |
| `shared/components/axes.ts` | A `(modifier)` axis's values and the part axes `tokens=` brings in, from the design system |
| `shared/components/groups.ts` · `bindings.ts` | A CSS-keyed group's binding plan, worked out in the repository and laid over each member |
| `shared/components/members.ts` | The vocabulary kdlet is given, the variant matrix and the step from kdlet's tree to layers |
| `shared/components/check.ts` | Toghen's checks on a member's tree |
| `shared/components/order.ts` | The order a run's component files go in: each after the files defining the components it names; a cycle refused |
| `shared/components/diff.ts` · `steps.ts` · `model.ts` | The snapshot and the diff, the steps and the report, the model |
| `main/utils/designSource.ts` | Answers a component file's `(modifier)` axes and `tokens=` from the resolver document |
| `main/utils/sum.ts` · `standing.ts` · `resolverModes.ts` | A token's home per modifier and its chain of aliases; what an existing collection is; a collection's modes from the document |
| `main/utils/pageRoots.ts` | A search run page by page, which both runtimes allow |
| `scripts/expectation-sheet.ts` | What the plugin should produce for a document, from the real engines |
| `main/engines/variableSyncEngine.ts` | Variable sync planning logic |
| `main/engines/styleSyncEngine.ts` | Style sync planning logic |
| `main/engines/propertyMapper.ts` | Pattern resolution and binding detection |
| `main/engines/batchRunner.ts` | Operation execution with progress/cancellation |
| `main/engines/ioAdapter.ts` | Token JSON export |
| `main/utils/figmaTokenAdapter.ts` | Token value ↔ Figma value conversion |
| `main/utils/figmaStyleAdapter.ts` | Token → Figma style property conversion |
