# @toghen/figma — Reference

> **Audience:** developers and AI coding agents.
> For the user manual, see [guide.md](./guide.md).
> For architecture and internals, see [specs.md](./specs.md).

---

## Message protocol

All messages between the UI thread and main thread follow this structure:

```typescript
{ type: string, payload?: any }
```

### UI → Main (Requests)

| Message Type | Payload | Description |
|---|---|---|
| `LOAD_DOCUMENT` | `{ files: { path, text }[], entry: string \| string[], name?: string, overrides?: Overrides, dryRun?: boolean }` | Load through the core's `load` (see [*The load*](#the-load)): `entry` is a resolver document, one token file, or several in order, among `files`; `name` names a token file collection; `overrides` maps a `$ref` as written to the location to read instead. `dryRun`, sent by the command line's `--dry-run`, turns an older build's root record into stamps in memory only (`migrateRootRecord`) |
| `GET_DOCUMENT_STATE` | — | Ask what document is loaded, if any |
| `GET_SYNC_STATE` | — | Ask what **this file** records about having been synced |
| `INSPECT_CORRESPONDENCE` | — | Read Figma back and report where every token stands |
| `GET_TOKEN_GRAPH` | — | Ask for the loaded document's tokens as a graph: values per mode, what each points to and what points to it |
| `GET_RECENTS` | — | Ask which design systems this user loaded before |
| `LOAD_RECENT` | `{ key: string }` | Load one of them again, from its stored bundle |
| `FORGET_RECENT` | `{ key: string }` | Drop one entry from the list |
| `EXPORT_DOCUMENT` | `{ includeExtensions: boolean, contexts?: Record<string, string> }` | Export one combination's tokens to JSON: one context per modifier, each at its default when not named. Only that combination is resolved. An unknown modifier or context is an error |
| `LOAD_CONVENTIONS` | `{ json: string }` | Load a conventions JSON file |
| `GET_CONVENTIONS` | — | Ask how many conventions are loaded |
| `PLAN_VARIABLE_SYNC` | `{ collectionName?: string, allowBreaking?: boolean, overwriteDrift?: boolean }` | Generate variable sync plan. `allowBreaking` lets the plan carry the steps that lose something in Figma (a removed context's mode); `overwriteDrift` plans each drifted mode as a `SET_VARIABLE_VALUE` with the document's value, and reports no drift. The screen sets neither; the command line's `--allow-breaking` and `--overwrite-drift` do |
| `EXECUTE_VARIABLE_SYNC` | — | Execute variable sync plan |
| `PLAN_STYLE_SYNC` | `{ collectionName?: string, overwriteDrift?: boolean }` | Generate style sync plan. `collectionName` is the base collection's name, the one `PLAN_VARIABLE_SYNC` was given, so a style's members are bound to the variables that plan put there; the document's name when absent. `overwriteDrift` plans a style changed in Figma since the sync wrote it as an `UPDATE_STYLE`, and reports no drift |
| `EXECUTE_STYLE_SYNC` | — | Execute style sync plan |
| `AUDIT_SELECTION` | `{ scope }` | Audit node bindings against conventions |
| `PLAN_SCAFFOLD` | `{ query, scope }` | Plan variable creation + binding |
| `EXECUTE_SCAFFOLD` | — | Execute scaffold plan |
| `PLAN_APPLY_BINDINGS` | `{ query, scope, nodeId?, property? }` | Plan binding-only operations. With `nodeId`, only that node, and with `property` as well, only that property: the Apply pane's one-click **Bind** |
| `EXECUTE_APPLY_BINDINGS` | — | Execute apply-bindings plan |
| `PLAN_APPLY` | `{ tokens, field?, scope, kinds }` | Plan Apply: a token or a group's tokens on the layers of `kinds` (`'frames' \| 'instances' \| 'components'`) in `scope`. Answered by `PLAN_READY`, `planType: 'apply'`. See [Apply a token to layers](#apply-a-token-to-layers) |
| `EXECUTE_APPLY` | — | Execute the apply plan, through the field writer; no stamp is written |
| `READ_SELECTION_BINDINGS` | `{ scope }` | Read what the selected layers (or the page, or the file) are bound to, property by property |
| `SELECT_NODES` | `{ ids }` | Select these layers on the current page and bring them into view. Answered by the `SELECTION_CHANGED` the new selection raises |
| `COUNT_BOUND_LAYERS` | `{ variableName }` | Find the layers on the **current page** bound to the variables of that name |
| `GET_TEMPLATES` | — | Ask which component files are kept in this file |
| `KEEP_TEMPLATE` | `{ fileName, text, replaces? }` | Keep a component file in this file, under its component's name. A file that does not read is refused with its problems. `replaces` names a kept template the file takes the place of, when its component's name differs |
| `FORGET_TEMPLATE` | `{ name }` | Stop keeping one |
| `PLAN_BUILD` | `{ name }` | Run a kept template's engine as a dry run. Answered by `COMPONENT_RUN` |
| `EXECUTE_BUILD` | `{ name, allowBreaking? }` | Run it for real. Answered by `COMPONENT_RUN`, then `TEMPLATES` |
| `GET_FIGMA_COLLECTIONS` | — | List existing Variable Collections |
| `GET_LOCK` | — | Ask for the lock (see [*The lock*](#the-lock)). Answered by `LOCK` |
| `DISCOVER_VARIABLES` | — | Match every variable the kept files bind against the enabled libraries' variables, by collection and name, and write the keys found. Answered by `PLAN_READY` (`planType: 'discovery'`), then `LOCK` |
| `LOCK_PICK` | `{ library }` | Write what the one selected layer holds from a library under `library`: an instance's component (its set, for a variant) and the layer's text and effect styles, each only when remote. Answered by `LOCK`, or `ERROR` with `INVALID_PICK` |
| `LOCK_FORGET` | `{ library }` | Drop a library's entry. Answered by `LOCK` |
| `SET_BUILD_OVERRIDES` | `{ overrides: Overrides }` | Replace Build's overrides map; an empty name or value is dropped, and an empty map removes it. Answered by `LOCK` |
| `LOOK_UP_NEEDS` | `{ name }` | Look up one kept blueprint's needs by the locator's dry pass, which imports and writes nothing (see [*The Build pane's look*](#the-build-panes-look)). Answered by `NEEDS`, or `ERROR` with `INVALID_TEMPLATE` when no blueprint of that name is kept |
| `PLAN_RELINK` | — | A dry build of every kept file, keeping only the swaps a relink would make and a line per library they import from. Answered by `PLAN_READY` (`planType: 'relink'`). Nothing executes it: each file's Build does |
| `LIBRARY_KEYS` | — | In a library file: its own keys and publish status (see [*The lock*](#the-lock), *From the library file*). Answered by `LIBRARY_KEYS_READ`. The command line sends it; the screen does not |
| `LOCK_WRITE` | `{ library: string; entry: LockedLibrary }` | In a target file: write `entry` as `library`'s, replacing that library's entry whole. Answered by `LOCK`, or `ERROR` with `INVALID_PICK` for an empty name or an entry not in `LockedLibrary`'s shape. The command line sends it |
| `GET_SELECTION` | — | Request current selection info |
| `RUN_COMPONENT` | `{ text, fileName, options }` | Make Figma agree with one component file: the plugin reads the text, evaluates and checks it against the loaded design system, then runs the engine with the `RunOptions`. The same entry a kept template's build uses (`main/components/file.ts`, `runComponentFile`). A problem is reported as `<fileName>:<line>:<column> <message>`. Sent by the command line |
| `CHECK_COMPONENTS` | `{ files: { fileName, text }[], names?, inputs?, dryRun?, allowBreaking?, prune? }` | Read and check every file, writing nothing. With `names`, also check that every token and style a file names is in the loaded design system. `inputs` are the values an artboard file takes. The payload has no layout of its own: the plugin reads each file's `layout` from its text, and remembers the token groups of the files with `layout=parts` for the loaded document (each check replaces the list), so the variable sync that follows keeps those components' axes in the path. A sync that did not check the files first lays every component out folded. It also reads the stamped set of each file that checked clean, and a set Figma reports as broken is a problem, with the lines a run would stop with. It finds the strays, members outside any set, on every page: one breaking line each, a problem unless `dryRun` or `allowBreaking`, else carried in `COMPONENTS_CHECKED.strays`. With `prune` the files are the whole system: each set and artboard frame Toghen made, not a copy, that none of them declares is listed the same way, in `COMPONENTS_CHECKED.orphans`, and the end of the run removes it. Answered by `COMPONENTS_CHECKED`, or `ERROR` with every problem. Sent by the command line before it syncs anything |
| `FINISH_COMPONENTS` | `{ dryRun?, allowBreaking? }` | The end of a run, once, after its last component or artboard step: removes the strays when `allowBreaking`, and, when the check had `prune`, the sets and artboards no file declares, then restacks Toghen's sets and artboards on each page the run created or changed one on (`main/components/endOfRun.ts`, the rules in `shared/components/stack.ts`). With `dryRun` it only says, per page, which sets it would restack and which were moved by hand. Answered by `COMPONENTS_FINISHED`. Sent by the command line, and by a template build from the screen |
| `CANCEL_OPERATION` | — | Abort the active operation; the plan is kept, so re-planning is the resume |
| `RESIZE_UI` | `{ width, height, remember? }` or `{ mode }` | Resize the plugin window. With a size, a drag of the grip; `remember` ends it and persists the size under the window's current mode. With `mode` (`narrow` or `wide`), the window switch: that mode's remembered size is applied and the mode is stored |

### Main → UI (Responses)

| Message Type | Payload | Description |
|---|---|---|
| `DOCUMENT_LOADED` | `DocumentStatePayload & { report?: PlanPayload }` | A document was loaded. `report`, `planType: 'load'`, holds the load's rows, one per collision and per unused key of the map; absent when there are none |
| `DOCUMENT_STATE` | `DocumentStatePayload` | Answer to `GET_DOCUMENT_STATE`. `loaded: false` when there is none |
| `SYNC_STATE` | `SyncStatePayload` | What the file records about being synced |
| `CORRESPONDENCE` | `InspectionPayload` | Where every token stands, as of `checkedAt` |
| `TOKEN_GRAPH` | `TokenGraphPayload` | The document's tokens as a graph. Answers `GET_TOKEN_GRAPH`, and is posted after every `DOCUMENT_LOADED` |
| `RECENTS` | `RecentDocumentSummary[]` | Design systems this user loaded before, newest first |
| `DOCUMENT_EXPORTED` | `{ json, filename }` | Export ready for download |
| `CONVENTIONS_LOADED` | `{ count: number }` | Conventions loaded. A validation failure arrives as `ERROR` with code `INVALID_CONVENTIONS` |
| `PLAN_READY` | `PlanPayload`: `{ planType, operations, summary? }` | Plan ready for review, for any of the four planning commands, the rows of a discovery (`planType: 'discovery'`), and a relink plan (`planType: 'relink'`) |
| `OPERATION_PROGRESS` | `{ completed, total, currentLabel }` | Execution progress update |
| `OPERATION_COMPLETE` | `OperationSummary` | Execution completed |
| `AUDIT_RESULT` | `{ nodes }` | Audit results per node |
| `SELECTION_BINDINGS` | `SelectionBindingsPayload` | Answer to `READ_SELECTION_BINDINGS` |
| `BOUND_LAYERS` | `{ variableName, ids, pageName }` | Answer to `COUNT_BOUND_LAYERS`: the bound layers on the current page |
| `WINDOW_MODE` | `{ mode }` | Which of the two remembered sizes the window is at, `narrow` or `wide`. Posted when the window opens and after the switch |
| `TEMPLATES` | `TemplatesPayload` | The kept component files, summarised. Answers `GET_TEMPLATES`, and follows every keep, forget and build |
| `FIGMA_COLLECTIONS` | `FigmaCollectionPayload[]` — `{ id, name, modes, variableCount }` | Variable Collections, their modes, and how many variables each holds |
| `LOCK` | `Lock` | The lock, as stored. Answers `GET_LOCK`, and follows every discovery, pick, forget, write and change of the overrides map |
| `NEEDS` | `NeedsPayload` | What a look found of one blueprint's needs, dated. Answers `LOOK_UP_NEEDS` |
| `LIBRARY_KEYS_READ` | `LibraryKeys` | What a library file says of its own keys. Answers `LIBRARY_KEYS` |
| `SELECTION_CHANGED` | `{ ids, names, count }` | Selection changed, or answered by `GET_SELECTION` |
| `COMPONENTS_FINISHED` | `{ removed: string[], moved: string[], notes: string[] }` | Answer to `FINISH_COMPONENTS`: the strays removed (`removed "x" (id)`, and `; its copy "x" (id) keeps no stamp` where a person had copied one), the sets and artboards with no source removed (`removed the set "Gone" (12:3) from page "Old"`), the sets moved (`moved "Dot" to 0, 7381`), and notes (a set moved by hand that overlaps something, a dry run's restack lines, or `page "Old" holds nothing now; it is left as it is`) |
| `COMPONENT_RUN` | `{ component: string, report: CompactReport }` | Answer to `RUN_COMPONENT`: the engine's `Report` with each step summarised (`CompactReport`, described under *The engine, stored in the file*). A run the engine stopped arrives as `ERROR` with `problems` |
| `ERROR` | `{ message, code, commandType, problems? }` | Any command that could not complete. `problems` is present for `code: 'COMPONENT_RUN_FAILED'`: every reason the engine stopped, one per entry, with the headline in `message` |

> There is one `PLAN_READY` for all four planning commands. It carries `planType`, which is what lets the shared result surface name what it is showing. No `SCAFFOLD_READY` or `APPLY_BINDINGS_READY` response exists.

### The payload shapes

```typescript
type ErrorCode = 'INVALID_DOCUMENT' | 'INVALID_CONVENTIONS' | 'NO_RESOLVER' | 'NO_PLAN' | 'FIGMA_API_ERROR' | 'COMPONENT_RUN_FAILED' | 'INVALID_TEMPLATE' | 'INVALID_PICK' | 'OPERATION_CANCELLED' | 'INVALID_QUERY';

interface ErrorPayload { message: string; code: ErrorCode; commandType: string; problems?: string[] }

interface DocumentStatePayload {
  loaded: boolean;              // false when there is no document; the rest is then placeholder
  name: string;
  description?: string;         // the document's root description
  tokenCount: number;
  modifiers: Record<string, string[]>;   // modifier name → its contexts
  modes: string[];              // the sum's modes: the defaults, then each other context on its own; never every combination
  modifierDefaults: Record<string, string>;   // modifier name → its default context; the export's controls start there
  defaultMode: string;          // the mode with no context chosen: the first of `modes`
}

interface PlanPayload { planType: 'variable_sync' | 'style_sync' | 'scaffold' | 'apply_bindings' | 'load' | 'discovery' | 'apply' | 'relink'; operations: Operation[]; summary?: Record<string, number> }

/** One shape, used twice: files in Load, Figma objects in Build. A name as written → what to use instead. */
type Overrides = Record<string, string>;
interface ProgressPayload { completed: number; total: number; currentLabel: string }
interface SelectionPayload { ids: string[]; names: string[]; count: number }
interface FigmaCollectionPayload { id: string; name: string; modes: Array<{ modeId: string; name: string }> }

type CorrespondenceState = 'current' | 'drifted' | 'outdated' | 'absent' | 'adopted' | 'blocked' | 'not_inspected';
interface ModeReport { mode: string; present: boolean; documentValue: string | null; figmaValue: string | null; agrees: boolean | null }
interface TokenReport { path: string; type: string | null; state: CorrespondenceState; note?: string; variableName?: string; modes: ModeReport[] }
interface InspectionPayload { checkedAt: string; collectionName: string; tokens: TokenReport[]; counts: Record<CorrespondenceState, number> }
```

`SyncStatePayload` and `RecentDocumentSummary` follow below; `Operation` and `OperationSummary` are under [Operation Types](#operation-types); the component shapes (`Component`, `Compact`, `RunOptions`, `CompactReport`) under [Component files](#component-files). The states of a `TokenReport` are explained under [Correspondence states](#correspondence-states).

### Document state and sync state are different questions

`DocumentStatePayload` describes the **JSON that was loaded**: its name,
description, token count, modifiers, mode names, and the mode it resolves to
with no context chosen. Three more fields let the Sync pane say what the
document would build in Figma without asking Figma anything:

```typescript
interface DocumentStatePayload {
  // …the fields above…
  version?: string;   // the system's own, as Resolver.getDeclaredVersion() reads it
  fileName?: string;  // the entry's file name, or its files' names in order (a recent keeps it)
  composition?: Composition; // what the load read and how; present whenever `loaded` is
  styleCount: number; // tokens the conversion map sends to a style rather than a variable
  /**
   * The collections the sum builds, base first, then one per modifier, then one
   * per folded part axis, each with its modes and how many variables would live in it. Absent when the sum
   * cannot be built (a modifier with no default); the plan says why.
   */
  collections?: Array<{ name: string; modifier?: string; axis?: true; modes: string[]; variableCount: number }>;
}
```

The screen matches `collections` by name against `FIGMA_COLLECTIONS`, whose
entries carry `variableCount`, to draw one row per collection: what the document
would build beside what the file holds. `loaded: false` says "there is no document".

### The load

`LOAD_DOCUMENT` calls `load(entry, { read, name, overrides })` from `@toghen/lib` ([its reference](https://codeberg.org/Toghen/lib/src/branch/main/reference.md)), with `read` a lookup among `files` by `path`. The plugin reads no file itself: a file that is not among them is the core's error, naming the reference and the document that holds it. The document `load` returns is built into a `Resolver` as before. Every failure, the core's or the resolver's, is an `ERROR` with `INVALID_DOCUMENT` and the message as thrown: a file that is neither a resolver document nor a token file is named in the core's words (`… points to no group of tokens in "list.json"`, `… is not JSON`).

```typescript
interface Composition {
  form: 'resolver' | 'tokens';      // a resolver document, or token files wrapped in one
  entry: string | string[];         // as the load was given it
  reads: Array<{ ref: string; holder: string; location: string; overridden: boolean }>;  // LoadResult['reads']
  overrides?: { map: Overrides; hash: string; unused: string[] };  // present only when a map was given
  fromBundle?: true;                // loaded again from a recent's bundle; `reads` are those of the load that stored it
}
```

`form` is `resolver` when `entry` is one file whose JSON has a `resolutionOrder` array, the core's own test, and `tokens` otherwise. `fileName` is the entry's file name, or its files' names in order, joined by `, `.

**The load's rows.** `load` returns `collisions`: a token path two sources of one set, or of one modifier context, both give a `$value`. Each is one operation in `DOCUMENT_LOADED`'s `report` (`planType: 'load'`), and each key of the map that matched no reference is one more:

| What | Operation |
|---|---|
| A collision whose values differ | `WARNING`, `path` the token path, `message`: `Given a value by "<file>", "<file>" in set "<set>"; the last wins.` (or `in context "<context>" of modifier "<modifier>"`) |
| A collision whose values are equal as written | `NOTE`, `message`: `<path> is given the same value by "<file>", "<file>" in …` |
| An unused key of the map | `WARNING`, `message`: `The overrides map's key "<key>" matched no reference, so nothing was read in its place.` |

The rows ride on `DOCUMENT_LOADED` rather than on a `PLAN_READY` of their own: the command line takes the first `PLAN_READY` after its next command as that command's plan, and a second message could arrive first. Nothing executes a `load` report; the main thread's `lastPlan` is cleared by a load as before. The screen shows it in the result surface headed `load`, with no create or update counts. `GET_DOCUMENT_STATE` carries the composition and never the report.

`SyncStatePayload` describes the **Figma file**: whether any of its variables and styles carries a Toghen stamp, how many do, and, once a document is loaded, how much of that document they cover. A stamp holds no time, so it does not say when.

```typescript
interface SyncStatePayload {
  hasRecord: boolean;               // some variable or style is stamped
  recordedCount: number;            // stamped variables and styles, other documents' included
  documentTokenCount: number | null; // null with no document loaded
  coveredCount: number | null;
  partialCount: number | null;      // stamped in some of a token's modes
  recordNames: string[];            // whose stamps they are: see below
}
```

`recordNames` says whose stamps they are, with no document loaded: the leading
segment of every token they name, each once. A lookup path starts with the
document's name, which is also the name of the base collection a variable sync
writes, so a file synced from one document holds one name and a file two
documents were synced into holds both. The screen names them in the empty
state ("This file holds a record from …") so someone reopening a file knows
which document to load.

`main/utils/syncState.ts` builds it from the stamps, and the plugin posts it on `GET_SYNC_STATE`, after a document loads, and after either sync executes. The last case is needed because a run changes the stamps, and a status left reading the old numbers is exactly the failure the reporting exists to prevent.

**Coverage counts stamps held, not values still current.** A token whose
document value has changed since the last sync is still counted; the stamp
exists, the document moved, and *Plan* is what says so. Answering "is it up to
date" here would mean a second dirty check to keep in step with the engine's.

### The token graph

The Tokens pane draws the document as a browser of groups and tokens, and a
token's detail names what it points to and what points to it. That is the
document's own shape, so it comes from the document and needs no look at Figma;
`CORRESPONDENCE` says where each token stands in Figma, and the screen merges
the two by path.

```typescript
interface TokenGraphPayload {
  modes: string[];              // the sum's modes, the default first
  tokens: TokenGraphEntry[];
}

interface TokenGraphEntry {
  path: string;                 // the lookup path, `Acme.color.brand.primary`
  type: string | null;          // the default mode's `$type`
  group: string;                // the path without its last segment
  valueByMode: Record<string, string | null>; // for display; null where the mode has no value
  references: string[];         // lookup paths it points to, in any mode, first hop
  referencedBy: string[];       // lookup paths that point to it
  codeSyntax: string;           // `--color-brand-primary`, by lib's cssPropertyName
}
```

Built by `main/handlers/tokenGraph.ts` from the document's sum
(`resolveContextsToDesignSystem()`: the defaults and each context on its own),
or from the full product when the sum cannot be built. `references` comes from
lib's `referencesOf`, which reports what each value and each member of a
composite refers to, qualified with the collection; `referencedBy` is its
inverse. A value is written for reading, not comparing: a colour as hex, a
dimension with its unit, a font list joined, a composite named by its parts.
Comparison stays `CORRESPONDENCE`'s.

### What the selection is bound to

`READ_BINDINGS`, the old Map pane's query-and-scope read, is gone: nothing sends
it any more. The Apply pane reads `READ_SELECTION_BINDINGS` instead, whose
scope chooses the layers.

```typescript
interface SelectionBindingsPayload {
  scope: QueryScope;
  readAt: string;
  nodes: Array<{
    id: string;
    name: string;
    kind: string;                  // the node's type, `FRAME`, `TEXT`, `INSTANCE`…
    /** The kept template that built the set this node belongs to, matched by its stamp. */
    builtFrom: { template: string; fileName: string; kept: string } | null;
    properties: Array<{
      property: string;            // `fills[0].color`, `cornerRadius`, `paddingLeft`…; a radius or stroke weight bound on all its parts to one variable is named once, `cornerRadius`, `strokeWeight`
      bound: { variableName: string; tokenPath: string | null } | null;
      literal: string | null;      // the value it holds, when it is not bound
      suggestion: string | null;   // the token path the loaded conventions would bind
      declaredBy: string | null;   // the template whose file sets this field on this layer
    }>;
    /** Every field the field table lists, with a token column, for the layer's kind; none for a kind the table has not. */
    fields: Array<{
      field: string;               // a field of the table: `fills`, `cornerRadius`, `paddingLeft`, `textStyle`…
      bound: { name: string; tokenPath: string | null } | null;   // the variable (a paint's first bound one) or the style, by name; null when plain
      holds?: string | null;       // plain only, not on a style field: what it holds, as `literal` reads it (a number, a string, a solid first paint as hex); null where it is no one value
    }>;
  }>;
  more?: number;                   // layers in scope past the 200 one answer carries
}
```

`fields` reads each field as the receipt does (`reportField`), with the layer's kind as Apply takes it (`applyKindOf`):
an instance and a component definition are frames. Apply writes no stamp, so a field it wrote as a value reads as plain.

A property is listed when it is bound, when a loaded convention names it for
the node, or when it is the first solid fill or stroke. `tokenPath` is the
token the bound variable's stamp names; a variable with no stamp has none. `suggestion` is what `PropertyMapper` would bind, translated to a token
path the same way. `declaredBy` reads the layer's stamp: the fields a
template's file set on it. Where each bound token stands is not in the payload:
the main thread holds no picture, so the screen takes the state from the Tokens
pane's last look, by token path, and says *not inspected* where it has none.
The page and file scopes walk `QueryEngine`'s roots; the file scope loads every
page, which `documentAccess: dynamic-page` makes slow on a large file.

### Bound layers

`COUNT_BOUND_LAYERS` scans the **current page only**: under `dynamic-page` a
whole-file scan would load every page. A layer counts when any of its bound
variables, a paint's included, is one of the variables of that name (a chain's
links share none). The screen says "12 layers on this page", never a file-wide
number it did not read.

### The window's two sizes

The window remembers two sizes, per user on one machine in `figma.clientStorage` under
`windowSizes`, and the status bar's switch moves between them:

```typescript
interface WindowSizes {
  mode: 'narrow' | 'wide';
  narrow: { width: number; height: number }; // 460 × 720 until dragged
  wide: { width: number; height: number };   // 980 × 620 until dragged
}
```

A grip drag resizes the window and, at its end, is remembered as the current
mode's size. A size stored under the old `windowSize` key, from before the
switch, is read once as the narrow size. Nothing else needs telling: the Tokens
browser lays itself out from its own width, so it follows the switch unasked.

### Templates kept in the file

A component file can be kept in the Figma file, so a set can be planned and
built again from the plugin's screen without the command line. Kept in shared
plugin data under `toghen/templates`, as JSON, sharded exactly as the sync
record is (one entry is capped at 100 kB):

```typescript
interface KeptTemplate { name: string; fileName: string; text: string; kept: string }

interface TemplatesPayload {
  lookedAt: string;
  templates: Array<{
    name: string;                  // the component's name, or a blueprint's page, which is the key
    fileName: string;
    kept: string;
    characters: number;
    members: number;
    axes: Array<{ name: string; values: string[] }>;
    properties: Array<{ name: string; type: string }>;
    tokenGroups: string[];
    /** The set its stamp names, on the current page; null when there is none there. */
    builtInto: { page: string; setId: string } | null;
    /** Whether the set differs from the file. Always null: nothing compares them yet. */
    differs: boolean | null;
    /** Errors reading it against the loaded design system, or none. */
    problems: string[];
    /** A blueprint's needs as it declares them, before any look; absent for a component file. */
    needs?: { tokens?: BlueprintTokens; libraries: string[]; components: Array<{ name: string; satisfied: boolean }> };
  }>;
}
```

A file is read with `readComponentFile` against the loaded design system, the
same pure reader the command line uses, so a file that names axes from a
modifier needs the document loaded to read. A file with errors is refused, with
every problem as `<file>:<line>:<column> <message>` in an `ERROR` whose code is
`INVALID_TEMPLATE`. `PLAN_BUILD` and `EXECUTE_BUILD` run `runComponent`, the
engine `RUN_COMPONENT` runs, on the current page; a build the engine stops
arrives as `ERROR` with `COMPONENT_RUN_FAILED`, as there.

`differs` stays `null`: nothing asks yet, though a dry run could answer it, since
it plans a patch only for a field a receipt says to write. The screen therefore
says *not compared* rather than guessing.

A file whose name ends in `.blueprint.kdl` is a blueprint, read with
[`readBlueprint`](#readblueprinttext-source-inputs-blueprint) and kept under its
page's name; one with errors is refused the same way. A blueprint and a component
file cannot be kept under one name: the second is refused with `INVALID_TEMPLATE`,
naming the first. Its row has no axes, properties or token groups, and `members`
counts the members of every body; `needs` lists what it names, from
`blueprintNeeds`, a component by `name` or as `(key)"…"`. `PLAN_BUILD` and
`EXECUTE_BUILD` refuse a blueprint with `INVALID_TEMPLATE`: it is not built as a
whole yet.

#### The Build pane's look

`LOOK_UP_NEEDS { name }` answers with `NEEDS`:

```typescript
interface NeedsPayload {
  name: string;                    // the blueprint, by the name it is kept under
  lookedAt: string;
  tokens?: BlueprintTokens & { state: 'loaded' | 'differs' | 'not loaded'; detail?: string };
  libraries: Array<{ name: string; state: 'in the lock' | 'missing'; by?: LockedLibrary['by']; readAs?: string }>;
  components: Array<{
    name: string;
    state: 'satisfied' | 'found' | 'from a library' | 'by key' | 'would swap' | 'missing' | 'problem';
    library?: string;
    detail?: string;
  }>;
  notes: string[];                 // a body whose dry pass stopped, so what it would swap is not known
}
```

- **tokens**: the blueprint's entries held against the loaded `Composition` by
  their files' names (the last segment of each path, in order), and whether a
  map was loaded with it. `loaded` with a map says its hash; the plugin cannot
  read the map the blueprint names, so the two are not compared.
- **libraries**: each `library` line, read through the overrides map (`readAs`
  when it is), `in the lock` with who wrote the entry, or `missing`.
- **components**: each name the bodies use, answered by `locateComponent` in
  `main/components/resolve.ts`, the order every build uses: `found` in this
  file, `from a library` through a declared library's lock entry, `by key` when
  the overrides map sends it to a key (or the blueprint writes one: a look
  imports nothing, so a key is not checked), `missing`, or `problem` (two of that
  name here, in this file and in a library, or in two libraries). A name a body
  of the blueprint defines is `satisfied`. A found one reads `would swap` when a
  dry build of the blueprint's bodies (`RunOptions.libraries` its `library`
  lines) plans a `SWAP_COMPONENT` to it.

`PLAN_RELINK` runs the same dry build over every kept file, a component file as
`PLAN_BUILD` runs it and each body of a blueprint with its libraries, and
answers `PLAN_READY` with `planType: 'relink'`: a `SWAP_COMPONENT` operation
per step of that kind, a `WARNING` per file or body the engine stopped on, and a
`NOTE` per library the swaps import from (a key imports only once the library
is published and its update accepted in this file, which the plugin cannot
see). With no swap, one `NOTE` says so. `summary: { swaps, libraries, stopped }`.

### The lock

What each name a file uses from a library resolved to, on the file's root: shared plugin data `toghen/lock`,
sharded as kept templates are (`main/utils/lockStore.ts`). It holds keys, never what Toghen wrote: no hash, no
time, no receipt. Why, and what fills it: `specs.md`, *The lock*.

```typescript
interface Lock {
  libraries: Record<string, LockedLibrary>;     // keyed by library name, as Figma names it
  overrides?: Overrides;                        // Build's map: a name as written → the name to use instead, or (key)"…"
}

interface LockedLibrary {
  fileKey?: string;                             // only where a run could read it; never guessed
  path?: string;                                // FigCraft: the library's .figcraft file, where the run last found it
  id?: string;                                  // FigCraft: the id the library's file keeps, which a move keeps
  by: 'discovery' | 'build' | 'command line' | 'person';   // who wrote the entry last
  components: Record<string, { key: string; set: boolean }>;   // a component's name as files write it
  styles: Record<string, { key: string; kind: 'TEXT' | 'EFFECT' | 'PAINT' }>; // a token path
  variables: Record<string, string>;            // "<collection>/<variable name>" → key
}
```

A key is Figma's (forty hex digits), or in FigCraft `<library id>:<asset id>`: the sixteen hex digits FigCraft gives
the library, and the library's own id for the asset (a component's or set's node id in the library file,
`VariableID:n`, `S:n`). In FigCraft an entry is keyed by the library file's name without `.figcraft`, and written from
the using file's `library.list {assets}` (`lockedFrom` in `cli/figcraftLibrary.ts`): every component and set by name,
every text, effect and paint style by the token path its name spells, every variable by `<collection>/<name>`.

`Overrides` is the load's type, `Record<string, string>`. In Build's map a key is a component's name, a token path,
or a library's name as a blueprint writes it; a value is a name, or a key written `(key)"…"` as a component file
writes one. A damaged or missing record reads as `{ libraries: {} }`.

`RunOptions.libraries?: string[]` names the libraries a run's file declares (a blueprint's `library` lines). A
component or artboard file alone declares none, so its names resolve in the file only, unless its caller passes
them. The overrides map applies to every run.

**Discovery's rows**, `PLAN_READY` with `planType: 'discovery'` and `summary: { found, choices, 'not found' }`, one
row per token the kept files bind:

| What happened | Row |
|---|---|
| one enabled library has it | `NOTE`, `{<path>}: "<collection>/<name>" in library "<library>".` |
| two have it, the overrides map silent | `WARNING`, `path`, `"<collection>/<name>" is in "<a>" and "<b>": a choice, so nothing was written for it. Name the one to use in the overrides map, as (key)"…".` |
| two have it, the map names one | `NOTE`, `{<path>}: "<collection>/<name>" is in "<a>" and "<b>", and the overrides map names the one to use.` |
| none has it | `NOTE`, `{<path>}: no enabled library has "<collection>/<name>".` |
| the document has no such variable | `NOTE`, `{<path>} is not a variable of the loaded design system, so no library was looked in for it.` |

With no document loaded, discovery is an `ERROR` with `NO_RESOLVER`.

**The locator's messages** (`main/components/resolve.ts`), among a run's problems, pending lines and notes:

| When | Where | Text |
|---|---|---|
| the map replaced a name | notes | `<what> is read as "<name>"` or `as (key)"…"`, `, as the overrides map says` |
| a declared library the lock has no entry for | notes | `library "<name>" is declared, and the lock holds nothing for it: …` |
| a name in this file and in a declared library | problems | `<what> is in this file (<what is here>) and in library "<library>": a name found in both stops the build; rename one, or name the one to use in the overrides map` |
| a name in two declared libraries | problems | `<what> is in libraries "<a>" and "<b>": name the one to use in the overrides map, as (key)"…"` |
| a dry run | pending | `<what>: would import "<collection>/<name>" from library "<library>"` (a style by its name; a component as `the component` or `the component set "<name>"`) |
| an import failed | problems | `<what>: <from> did not import: not published, or not this key: publish the library, then accept its update in this file` |
| a library has variables and no document is loaded | problems | `<what> may be a library's, …: load its resolver document` |
| a `modes` collection in this file and in a declared library | problems | `<what>: the collection "<collection>" is in this file and in library "<library>": a name found in both stops the build; rename one` |
| a `modes` collection in two declared libraries | problems | `<what>: the collection "<collection>" is in libraries "<a>" and "<b>": a name found in two stops the build; rename one, or declare only one of them` |
| a `modes` collection nowhere | problems | `<what>: no local variable collection named "<collection>" (this file has "<x>", "<y>"), and library "<library>" holds none`; `(this file has none)` for a file with no collection, `and libraries "<a>" and "<b>" hold none` for two, `and no library is declared` for none |
| a library's collection in Figma, a dry run as a real one | problems | `<what>: a library collection's mode ("<collection>" in library "<library>") is not measured in Figma yet; pin it on FigCraft, or use a local collection` |
| FigCraft refused a library collection's mode | the step's error | FigCraft's own message, then `; this batch pinned a library collection's mode at <what>` |

`<what>` is `token {<path>}`, `text style {<path>}`, `effect style {<path>}`, `component "<name>"` or `modes <collection>=<mode>`, with the line.
A `(key)` written in a file that does not import ends with the same words.

**From the library file.** `LIBRARY_KEYS`, sent to the plugin in a library file, answers what that file knows of its
own keys, each with what `getPublishStatusAsync()` says of it:

```typescript
type PublishState = 'UNPUBLISHED' | 'CURRENT' | 'CHANGED';

interface LibraryKeys {
  fileKey?: string;   // figma.fileKey, only where it reads: a private plugin, or a development one with enablePrivatePluginApi
  components: Record<string, { key: string; set: boolean; status: PublishState }>;          // stamped sets (and a stamped component outside a set), by the name files write
  styles: Record<string, { key: string; kind: 'TEXT' | 'EFFECT' | 'PAINT'; status: PublishState | undefined }>; // styles the style sync stamped, by the token path their name spells
  variables: Record<string, { key: string; status: PublishState }>;                         // every local variable, "<collection>/<variable name>"
  warnings?: string[];                                                                      // what the file could not say (a style's status, where Figma gives styles no getPublishStatusAsync); the command line prints each
}
```

A person's copy of a stamped set or style is left out (`sortOut`). Every local variable is listed, stamped or not, as
discovery would list a published library's. The command line turns it into a `LockedLibrary` (the statuses dropped,
`by` its own) and sends it to the plugin in the target file with `LOCK_WRITE`. A published plugin would read no
`fileKey`: `enablePrivatePluginApi` holds only for a private or development plugin.

### Recently loaded design systems

```typescript
interface RecentDocumentSummary {
  key: string;          // the document's `name`, or the filename when it has none
  name: string;
  version?: string;     // the system's own version — see below
  description?: string;
  tokenCount: number;
  modes: string[];
  modifiers?: string[]; // the modifier names; absent in entries kept before they were stored
  fileName?: string;    // fallback label only
  loadedAt: string;     // ISO
}
```

`main/utils/recentStore.ts` keeps them in `figma.clientStorage`, **per user on one machine, not per file**: the same argument that put the window size there. Recents are a property of someone's working habits, and storing them in the file would publish one person's in-progress token documents to everyone with access to it.

**Each entry holds the bundle and the composition, not the files.** A plugin cannot re-read a file from disk: the UI gets a `File` at the moment of picking and nothing afterwards. A list holding only names could be read and not used. An entry (`RecentDocument` in `recentStore.ts`) is the summary plus `document`, the `ResolverDocument` the core's `load` returned, every file it read already inlined, and `composition`, what that load read. `LOAD_RECENT` builds the resolver from the bundle through the same tail as a fresh load: one way in, one set of behaviours to keep correct. Its payload's composition is the stored one with `fromBundle: true`, and it carries no `report`: the collisions were reported when the files were loaded. `RECENTS` carries summaries only; the bundles stay on the main thread, which is the side that can store them and the only side that needs them.

An entry kept before the core loaded documents holds the document's text as `json` and no composition. `loadRecents` reads it as a resolver document, once, with the composition `{ form: 'resolver', entry: <fileName or key>, reads: [] }`, and writes the list back in the new shape; one whose `json` does not parse is dropped.

**`version` is the system's own**, read via `Resolver.getDeclaredVersion()` from `$extensions` on a set or modifier. It is *not* the document's `version` field, which the Resolver spec fixes at `"2025-11-01"`: that would put the same string on every row and distinguish nothing. Most documents declare none, and the row omits it.

Figma documents 5 MB of `clientStorage` per plugin, kept on the user's machine and not synced, and the typings say that `setAsync` "will reject with an error message if storage failed". The plugin enforces no budget of its own: it attempts the write, and if Figma refuses it, drops the oldest entry and attempts again, down to none. A recents list is a convenience, and it must never be the reason a load fails.

### Coverage rules

A token counts as covered when the variable stamped for it, in the collection it lives in, holds a receipt for **every mode that token has a value in**, not every mode the document declares; a chain, when every link is. A token contributed only by `dark` is complete with one receipt. A style-backed token is covered by a style stamped for it: Figma styles have no modes.

### Running from the command line

The plugin's UI can also be the other end of a socket, so that a process on the same machine sends these commands instead of a person. It is in `ui/bridge.js`, and the command line's end is in `cli/bridge.ts`. [specs.md](./specs.md#the-command-line) says why.

- **The UI connects only when the person asks**, from the Source card of the Load pane, to `ws://localhost:3055`, the one address the manifest names under `devAllowedDomains`. It retries once a second after the socket closes, until the person disconnects or the command line refuses the code.
- **Pairing.** The UI's first message is `{ "pair": "<code>" }`, the code the person typed from what the command line printed (compared without case, dashes or spaces). A code the command line does not know closes the socket with code `4001`, and the UI stops trying and says so. An accepted code is answered with `{ "paired": true }`. Nothing else is sent or relayed before that; after five wrong codes in one run the command line stops. A second connection with the right code replaces the first, which is closed with `4002`. A run with `--library` listens for two codes, one per file (`serve(port, { library, target })` in `cli/bridge.ts`): a connection pairs as the file whose code it gave, the five wrong codes are counted across both, and each file's code is kept in its own file (the target's in the pairing file, the library's beside it, with `.library` added).
- **From the socket to main.** After pairing, every message the socket sends is a `Command` and goes to the main thread exactly as the screen's own commands do: the same dispatcher, the same handlers. The dispatcher does not serialise them; the command line asks one question at a time and takes the first answer of the type it expects, which is why a person pressing a button at the screen during a run could confuse it (see specs, *Still open*).
- **From main to the socket.** Every response the main thread posts goes to the screen, as it always did, and to the socket as well. The command line reads the ones it asked for and ignores the rest (`SELECTION_CHANGED`, `SYNC_STATE`, `RECENTS`, `OPERATION_PROGRESS`). A command is answered by its own response, or by an `ERROR` whose `commandType` names it.
- **The screen sees what the command line did.** Plans, progress and outcomes of a command the command line sent are in the shared result surface, whose header says `from the command line`; a component run is shown by its counts and a row for each thing that breaks, was left, was noticed or was counted as pending.
- **No rollback.** A plugin's writes are not rolled back when a run fails, and `figma.triggerUndo()` cannot stand in: it was measured reverting past the last `commitUndo()`, which would take a person's earlier work with it ([measured behaviour](.reference/figma/measured_behaviour.md#a-plugin-reached-from-a-local-process)). `RUN_COMPONENT` stops before its first write for everything the engine can foresee (see *`run`*), so a run that fails after writing leaves what it wrote, and the next run, which reconciles by stamp (Toghen's marker in a node's shared plugin data), completes it.

`pendingNames(operations, collections)` in `shared/pendingNames.ts` turns the operations of a variable plan and a style plan, with the existing collections' `{ id, name }` (as `FIGMA_COLLECTIONS` answers), into the `Pending` a component dry run takes:

- the variables a `CREATE_VARIABLE` would make, by collection name, full name and type;
- the text styles a `CREATE_STYLE` would make, by name;
- the modes a `CREATE_COLLECTION` or an `ADD_MODE` would make, by collection name and mode name.

A `CREATE_VARIABLE` names its collection by id, which is an existing one's or the symbolic id of a `CREATE_COLLECTION` in the same operations; a variable whose collection is neither is left out. Only `TEXT` styles are kept.

---

## Operation types

Operations are the atomic units of work executed by the `BatchRunner` and `OperationExecutor`.

### Variable sync operations

| Operation | Description | Symbolic Inputs |
|---|---|---|
| `CREATE_COLLECTION` | Create a new Variable Collection | — |
| `ADD_MODE` | Add a mode to an existing collection | `collectionId` |
| `CREATE_VARIABLE` | Create a new Variable, with `scopes`, the fields its token is for (never Figma's default of all), and `tokenPath`, the key its stamp names, so the variable is stamped as soon as it exists | `collectionId` |
| `SET_VARIABLE_SCOPES` | Write the `scopes` of an existing variable: its purpose changed, or it still holds what older Toghen wrote (`ALL_SCOPES`, or `LETTER_SPACING` for a letter spacing). Not breaking. Planned for scopes a designer changed only with `overwriteDrift`. Counted as `scopes` | `variableId` |
| `SET_VARIABLE_VALUE` | Set variable value for a mode; the value may be a `VariableAlias`, to a variable in any collection | `collectionId`, `variableId`, and `value.id` when the value is an alias |
| `DELETE_VARIABLE` | Remove a variable the sync wrote and the document now places in another collection; planned only when the request allows breaking, after the replacing variable is created and the aliases to the old one are re-pointed (`after` holds it back if the create failed). Only a variable stamped for the key, in a collection that is still one of the document's. Once it is removed, the stamp of each person's copy of it is removed too (`strip`), and its `BREAKING` row names them: `…; the old variable is removed; its copy "color/label copy" (VariableID:1:9) keeps no stamp.` | `variableId`, optional `after`, optional `strip` (the copies' ids) |
| `DELETE_MODE` | Delete a mode its modifier no longer has (`removeMode`); planned only when the request allows breaking, last in the plan, after every value is written. Refuses the collection's first (default) mode | `collectionId`, `modeId` |
| `BREAKING` | A row that runs nothing (`moved` marks a variable move, `"checkbox/background" moves from "Demo" to "state"; the old variable is removed.`): a step that would lose something in Figma, listed whether or not the plan carries it. The batch runner treats it like a warning; the summary counts it as `breaking` | — |
| `SET_CODE_SYNTAX` | Write a variable's web code syntax, `var(<name>)`, the name from lib's `cssPropertyName` (a chain link's from the CSS link rule); on every created variable, and on an existing one that lacks it. Not counted in the plan summary | `variableId` |
| `RENAME_VARIABLE` | Give an existing variable the name the document now gives its token, when the value is unchanged but the name is not (the collection-prefixed name of an earlier sync, say). Counted as `renames` | `variableId` |
| `STAMP` | `{ target: 'variable' \| 'style', id, path }`: write the stamp of a variable or style Toghen wrote that moved (its stamp names another id) again, with the object's own id, and change nothing else. Planned, in the variable and the style plan, only where nothing else the plan writes to the object stamps it. Counted as `updates` | — |


A plan writes the **sum**: a base collection named after the document with one mode, `default`, and one collection per modifier with a mode per context Figma gets, the default first. The rules:

- **Mode limit.** A collection holds at most 10 modes (`MAX_MODES`, fixed; the file's plan is not read and no flag changes it). The check runs in the variable plan, so a dry run finds it: one `WARNING` with `stops: true` per collection over the limit, `"hue" has 14 contexts for Figma and Figma allows 10 modes per collection; keep at most 10 of them in figma.include.`, and nothing is written.
- **`figma.include`.** `$extensions["com.toghen"].figma.include` on a modifier lists the contexts Figma gets, in any order; the modes keep the document's order, default first. CSS is unchanged. Refused, stopping the plan and naming the modifier: a value that is not a list of names, a name that is not one of the modifier's contexts, a list without the default. A value in a left-out context is not written; a token defined only in left-out contexts and with no base has no variable and is not reported; a chain writes no link for them. A context taken out of the list later is a `BREAKING` mode removal gated by `allowBreaking`, as a context removed from the document is; one put in is an `ADD_MODE`.

- **Home.** Each token's home comes from lib's `contextsOf`. A token that two or more modifiers define is a chain of aliases (each variable points at the next), whose earlier links are variables named `<path>--<modifier>`.
- **Not written.** The plan reports a hole, a `$type` that varies, and a non-factorable token as warnings and writes none of them.
- **Values Figma cannot hold.** A `color` token holding `currentColor`, or an alias of one, is skipped with `"ds.link.ink" is currentColor, which Figma cannot hold; skipped.`; a style whose shadow colour or gradient stop resolves to it is skipped with a warning. `transparent` is a colour at alpha 0, written as any other. A `letterSpacing` token in `em` (or an alias of one) is skipped with `"ds.track.wide" is a letter spacing in em, and a Figma variable bound to letter spacing carries pixels; skipped.`, shown as `blocked` in the Inspector. One in `px` or `rem` is a `FLOAT` variable in pixels with the letter-spacing scope (below). A token whose CSS value Figma cannot hold can name the value Figma writes with `$extensions["com.toghen"].figma.value`, a `{reference}` of the token's own type (an untyped token names a reference, and takes its type): the cell is then written as an alias, and the Inspector no longer shows it `blocked`. The key is refused, as an error naming the token and the context, on a cell whose value Figma can hold, on a reference that does not resolve or whose type differs, on a literal for an untyped token, and when it names something Figma cannot hold either: `… has a figma.value, but its value is one Figma can hold; remove the key, so that the value stays the one both outputs write.` A key on a context's own definition counts for that context; one a context only inherits from the token's base is used where its value is unholdable and ignored where it is holdable. It also covers an `em` letter spacing, whose key may name a pixel value. A token that is only a reference to a token Figma holds as a variable is a plain alias to it in every mode, with no warning, and follows that variable's modes; a key on such a token is an error: `"ds.chip.color" has a figma.value, but it is a reference to "ds.t.text", which Figma holds as a variable; remove the key, so that it follows the modes.` A reference to a keyless `currentColor` is skipped with its own message, and one to a token defined in one context only is written as its value with a warning. A token defined only in a non-default context is skipped. The message, with example names, reads `"ds.button.pin.color" is defined only in theme=dark and has no value where theme=light, the default; a Figma variable needs a value in every mode, so it is skipped.`
- **Scopes.** Every variable is created with the scopes of its token's purpose, the first of four sources that answers: a declaration, `$extensions["com.toghen"].figma.scopes`, on the token or the nearest group above it (lib's `getGroupAttribute()`), read from the base definition; the last key, through `scopesOfKey()` beside `targets()` in `shared/components/groups.ts`; the tokens that refer to it, in every mode of the sum, through tokens with no purpose of their own, as a union, a composite member giving its field (typography `fontFamily` `fontWeight` `fontSize` `lineHeight` `letterSpacing`, shadow `color` and offsets, blur and spread, border `color` and `width`); and its `$type` (`color` `ALL_FILLS` `STROKE_COLOR` `EFFECT_COLOR`; `dimension` `GAP` `WIDTH_HEIGHT` `CORNER_RADIUS` `STROKE_FLOAT`; `fontWeight`, `fontFamily`, `letterSpacing` their own field; `number` every number scope but `OPACITY` and `COLOR_OPACITY`; anything else `ALL_SCOPES`). A union drops the fill scopes beside `ALL_FILLS` and everything beside `ALL_SCOPES`, and keeps only scopes the variable's type takes. `[]` hides the variable from every picker; whether it is an opacity then comes from the name and the references as if it declared nothing. Code: `main/utils/purpose.ts`.
  - A declaration is refused, the token skipped whole as a reported `SKIP` naming the list and the reason, when it is not a list of Figma scope names, names `COLOR_OPACITY`, lists `ALL_SCOPES` or `OPACITY` with another scope, `ALL_FILLS` with another fill scope, or a scope the variable's type does not take; or when a context redefines it: `"ds.x" redefines figma.scopes in theme=dark, and a variable has one list for all its modes; skipped.` A folded part's own list is ignored, with a `WARNING`.
  - Variables left at `ALL_SCOPES` by their type are listed in one `NOTE`: `2 variables are offered to every field: ds.z.raised, ds.flag.beta; declare figma.scopes to narrow them.`
- **Opacity.** A token is an opacity when its last key is `opacity`, its list is `["OPACITY"]`, or only opacities refer to it. It is written × 100, `toFigmaValue(value, 'number', 'percent')`, and compared with Figma in that unit, so a variable written as 0–1 by an earlier sync disagrees and is rewritten, not reported as drift. Every cell must resolve to a number from 0 to 1, or the token is skipped whole: `"ds.button.opacity" is an opacity, a number from 0 to 1, and is 55 in theme=dark; skipped.` A token reached both by an opacity and by a plain token stays plain. An alias joins two variables of the same unit only; otherwise the referrer is written as its own value with a `WARNING`: `"ds.button.opacity" is an opacity and refers to "ds.opacity.half", which is not one, so the value is written instead of an alias.`, or `… is not an opacity and refers to "…", which is one, …`.
- **Text styles.** A letter spacing in `em` is written as a percentage of the font size, `{ unit: 'PERCENT', value: em × 100 }`. A typography member that is not one of Figma's text style fields (`fontVariantNumeric`) is left out, with nothing said.
- **A collection with the base collection's name that holds a mode other than `default`** comes from an older sync's layout. The plan is that one warning and nothing else, and it never writes to the collection. No other collection is read that way.
- **A collection named after one of the document's modifiers** is the sum's own. A mode in it that the modifier no longer has is listed as `BREAKING` (the message, with example names, reads `the mode "dark" of collection "theme" is gone: values in it are lost, and a frame or variant pinned to it falls back to "light"`) and deleted only when `PLAN_VARIABLE_SYNC` carries `allowBreaking`. One whose default mode is a context the modifier no longer has is closed: one warning, nothing written.
- **A collection holding variables stamped for this document's tokens, named after no collection of the sum,** is reported and left alone.
- **Axis collections.** A folded part axis is a collection of its own, named after the axis, with `rest` first and a mode per part key. Every component that folds the axis shares it. It is a `SumCollection` with `axis: true`; the base and the modifier collections have no `axis`. An axis named like the base collection or a modifier stops the plan, with one warning that names the axis. The sum's `layouts` holds, for each component, which axes folded and why the others did not.
- **A component's layout.** A component with an axis that stays in the path gets one `WARNING`; the plan does not stop. It names each folded axis with its modes, then each axis that stays, with its reason. A component whose axes all fold gets none. The example document gives these two:

  ```
  "button": folds "variant" (modes rest, primary), "state" (modes rest, hover, pressed, disabled); "selection" stays in the path, one variable per part: "button.selected.hover.backgroundColor" carries it together with the folded "state".
  "field": "state" stays in the path, one variable per part: no rest value: "field.disabled.opacity" needs "field.opacity", which is not defined.
  ```

  A reason is one of four: a part token carries the axis together with another folded axis; a part token has no rest value; the shared collection would hold more modes than Figma allows; or the component is `layout=parts`, which keeps every axis in the path for the reason "the component is laid out as one variable per part (layout=parts)".
- **Symbolic ids** are `$col:<collection>`, `$mode:<collection>/<mode>` and `$var:<collection>/<name>`.

Why, and the rules in full, are in [specs.md](./specs.md#variables-per-modifier-the-sum).

### Style sync operations

| Operation | Description |
|---|---|
| `CREATE_STYLE` | Create a new text, effect, or paint style; optional `bindings` bind its fields to existing variables |
| `UPDATE_STYLE` | Update an existing style's properties; a text style's bindable fields are unbound first, then optional `bindings` are made |

`bindings` is `Array<{ field: string; variableId: string; index?: number }>`, beside `props`, which still carry every resolved value. `field` is a `VariableBindableTextField`, or a `VariableBindableEffectField` on effect layer `index`. Every `variableId` is a real Figma id, never symbolic: a style plan binds only to variables that already exist. When a variable is missing at execute time, the operation fails before the style is touched.

### Binding operations

| Operation | Description |
|---|---|
| `BIND_VARIABLE` | Bind a variable to a node property (scalar or paint). A property that is a `field` binding of the field table is bound through the field writer; `fills[0].color` and `strokes[0].color` bind the first paint, as before |
| `UNBIND_VARIABLE` | Remove a variable binding from a node property |
| `APPLY_TOKEN` | Apply: write one token on one field of one layer, through the field writer. No stamp |

#### Apply a token to layers

```typescript
{ type: 'PLAN_APPLY'; payload: { tokens: string; field?: string; scope: QueryScope; kinds: ('frames' | 'instances' | 'components')[] } }

{
  kind: 'APPLY_TOKEN';
  nodeId: string;
  nodeName: string;
  field: string;             // a field of the field table
  path: string;              // the token's path, without the collection
  variableId?: string;       // the token's variable, where the field binds it
  value?: VariableValue;     // set with `context` when the field, or part of it, is written as the value:
  context?: string;          //   the core's value at the declared defaults, and their mode name
  written?: string;          // the line saying so, before Execute: `"fills" of "Card": the colour's alpha is written as its value in "light"; …`
}
```

- **`tokens`** is a token's path or a group's, braces optional. A group's tokens are those `tokens=` takes (`DesignSource.group`), and each reaches fields by its last key through the same table (`planOf`). One token takes `field`, or, without it, reaches a field by its last key. The fields one token of a type can be given are `applyFieldsFor(type)` (`shared/components/fields.ts`): those whose token column takes the type on a frame, less the style fields, `effects` and `layoutGrids`; the Apply pane offers only these. `field` with a group, a name that is not a field with a token column, or no loaded document is an `ERROR` (`INVALID_QUERY`, `NO_RESOLVER`).
- **`kinds`** picks layers by Figma type: `frames` is `FRAME` and `SLOT`, `instances` is `INSTANCE`, `components` is `COMPONENT` (set members included). The scope is walked as `QueryEngine` walks it, every layer at any depth. The field table is read with an instance and a component definition as a `FRAME`.
- **Rows.** One `APPLY_TOKEN` per layer and field. A key with no field on the layer is a `SKIP` on it (`path` is the layer's name); a field the layer's kind has not is a `SKIP` too. A token whose type the field does not take, that names no variable in this file (by `tokenPathToVariableName`), names two, or names one of the wrong type, is one `WARNING` (`path` is the token), said once however many layers it reaches; its operations are left out. So is a style field, a gradient, and any token on `effects` or `layoutGrids`: those are written part by part, by a component file.
- **Summary.** `{ total, applies, written, skips, warnings }`, `written` counting the operations with a `written` line.
- **Execute.** `EXECUTE_APPLY` runs the plan through `runOperations`. An applied `APPLY_TOKEN` answers `figmaId`, the variable, when the field was bound whole; none when it, or part of it, was written as its value in the operation's `context`. Nothing is stamped.

### Plan-only operations

Never executed. They carry the plan's findings to the UI.

| Operation | Description |
|---|---|
| `SKIP` | A path needing no work. `reason: 'unchanged'`: the document and Figma agree. `reason: 'drifted'`: **Figma holds a different value than the last sync wrote**, so the path is skipped to protect a local edit, not because nothing changed. An optional `message` carries detail the short reason cannot. `cause` says why, one word of a closed set (below); `reason` is the sentence, naming the token, and the context where there is one. `reported: true` marks a skip the command line prints among the rows worth reading (a text style with no family Figma can load, a refused scope declaration, an opacity outside 0 to 1, a copy). A person's copy of a variable or a style this document's sync wrote is one reported `SKIP` each, `path` the token its stamp names: `"color/label copy" (VariableID:1:9) is a copy of Toghen's "color/label", left alone` |
| `NOTE` | Something said that is neither a problem nor a step: today, the variables left offered to every field. Carries `message`. Shown by the dry run and in the run report, not counted as a warning |
| `SWAP_COMPONENT` | A relink plan's row: one stamped instance a build would swap to another component. Carries `path` (the kept file's name) and `message`, the step's summary (`"Glyph" in "Badge/Tone=calm" swaps from … to …`). Only `PLAN_RELINK` makes it |
| `WARNING` | Something the user should know: drift, a coverage gap, a type clash, a mode the document does not declare, a component's layout. Carries `message`, an optional `path`, and `stops: true` when the plan cannot go on (the base collection built by an earlier sync, a modifier with no default); a command-line run stops whole on such a warning |

**A skip's cause** (`SkipCause`, `shared/operations.ts`). Every skip of the variable and style plans carries one, and a new skip site in either plan must pick one; the type keeps `cause` optional, since the other plans' skips (Apply's, discovery's) carry none yet.

| `cause` | Plan | The skip, and its `reason` | The command line's word |
|---|---|---|---|
| `unchanged` | both | Figma holds what the document says: `unchanged` | `unchanged` |
| `drifted` | both | Figma holds something else than the last sync wrote, a local edit left alone: `drifted`, with its `message` | `drifted` |
| `copy` | both | a person's copy of a variable or style the sync wrote (reported) | `copies` |
| `unsupported-type` | both | no variable or style holds a token of this type: `"<path>": unsupported token type <type>`, `none` for a token with no type | `unsupported type` |
| `refused-routing` | variables | the token's purpose asks for what a variable cannot hold, a list of scopes or an opacity (reported) | `refused` |
| `closed-collection` | variables | the token's collection is one nothing may be written to: `"<path>" is not written: <why>` | `in a closed collection` |
| `type-conflict` | variables | `"<path>" is not written: a variable it links to has another type` | `type conflict` |
| `cannot-write` | variables | a value no Figma variable can hold, one row per context: `"<path>" cannot be written in <collection> / <mode>: <why>` | `cannot be written` |
| `cannot-build` | styles | a style the token's value cannot be built into: `"<path>" cannot be built in <mode>: <why>` | `cannot be built` |
| `no-font` | styles | a text style whose stack names no family Figma lists (reported) | `no font` |
| `font-not-loaded` | styles, at execute | a family listed and then not loaded (reported) | `font not loaded` |

**A value the core refuses to compute** for its type (lib, [Token values](https://codeberg.org/Toghen/lib/src/branch/main/reference.md#token-values): a colour that mixes `currentColor`, a dimension that resolves to `8px 13px`) is one such skip, never the stop of a plan: `cannot-write` in the variable plan, with the core's sentence after the colon (`Token "…" (mode "…"): …`, naming the member of a composite), and `cannot-build` in the style plan. `readToken` (`main/utils/resolverModes.ts`) reads the token's type where the core gives no value. The Inspector shows the token `blocked` with the same reason; a component file that binds it is stopped by the engine's own check; an export still stops on it.

**Each plan lists only the tokens it is for.** The variable plan has no row for a token the style plan builds, and the style plan none for a variable's token (ruled 24 October 2026): such a row recorded nothing that happened in that plan, and counted one token in both.

A plan's **summary** (`PlanPayload.summary`, built by each engine's `summarizePlan()`) counts, for a variable plan: `total`, `creates`, `updates` (`SET_VARIABLE_VALUE` and `STAMP`), `skips`, `skipsByCause`, `drifted` (a subset of `skips`), `modes`, `warnings`, `renames`, `breaking`, `scopes` (the `SET_VARIABLE_SCOPES` it carries); a style plan counts `total`, `creates`, `updates` (`UPDATE_STYLE` and `STAMP`), `skips`, `skipsByCause`, `drifted` (a subset of `skips`), `warnings`.

```typescript
interface PlanCounts {
  [count: string]: number | SkipCounts | undefined;
  skipsByCause?: SkipCounts;   // the variable and style plans: their skips by cause, only the causes the plan holds; the sum is `skips`
}
type SkipCounts = Partial<Record<SkipCause, number>>;
```

### Plan consistency

A plan is a dependency graph: `CREATE_COLLECTION` produces a symbol that `CREATE_VARIABLE` consumes, and so on. `main/utils/planSymbols.ts` checks it when the plan is built, and any reference no operation in the plan satisfies becomes a `WARNING`, once per dangling symbol rather than once per dependent.

There is no separate `dryRun` execution mode: *Plan* already shows what would happen without touching the file, so a second look-but-don't-touch command would be redundant, and the check it justified is a property of the plan rather than of a way of running it.

### Drift

A plan compares the document's value against what Figma actually holds, in Figma's own representation, via `figmaValuesEqual()`. The comparison uses a **relative** tolerance: Figma stores float32, so `0.4` reads back as `0.4000000059604645` and an exact comparison would report every value in the file as edited.

Drift is a field Figma reports otherwise than right after Toghen wrote it: its hash is not the one in the object's stamp ([The stamp](#the-stamp), [Stamps on variables and styles](#stamps-on-variables-and-styles)). It is seen whether or not the document moved too. A drifted variable mode or style is kept and reported as a `SKIP` with `reason: 'drifted'`, whose message ends `pass --overwrite-drift to write the document's value.`; with `overwriteDrift` it is written with the document's value and stamped.

Where Figma reports what the stamp says, it holds exactly what was written, and the plan compares the document with it: a variable's mode by `figmaValuesEqual()`, a style by every field it writes, both with float32's relative tolerance. It writes where they disagree.

A receipt counts only for the object it is on, and only for one found by its stamp: a variable or style adopted by name is written whole, and so is a mode Figma holds no value in. The first write under a token to an object stamped for another starts its stamp again.

Scopes drift the same way. The stamp holds a receipt for the scopes Figma reported after Toghen wrote them, sorted, since Figma stores them in an order of its own. Figma's as the receipt says: rewritten where the plan's differ. Figma's otherwise: kept, and the path's drift message says `The scopes were changed in Figma since the last sync (Figma holds …; the document asks for …). They are left alone rather than overwritten; pass --overwrite-drift to write the document's scopes.` No receipt for them: rewritten when Figma holds `ALL_SCOPES` (or `LETTER_SPACING` for a `letterSpacing` token), what older Toghen wrote; anything else counts as drift.

### One comparison, two readers — `main/utils/correspondence.ts`

The comparison itself is not in the engine. `compareToken()` answers where one
token stands, and both `VariableSyncEngine` (to decide operations) and
`INSPECT_CORRESPONDENCE` (to describe a state) read it. Two implementations
would eventually disagree, and a pane reporting drift beside a plan reporting
none is the same defect as smell #22 one layer down.

It separates two facts that are easy to conflate:

| Fact | From | Conclusive? |
|---|---|---|
| **agreement**: does Figma hold what the document asks for? | `toFigmaValue` + `figmaValuesEqual` | yes, wherever a variable exists |
| **provenance**: has Figma moved since Toghen wrote it? | the variable's stamp | yes, wherever Toghen wrote |

Each mode carries both: `written` (the stamp has a receipt for it and Figma holds
a value there), `drifted` (written, and Figma now reports something else) and
`agrees`. `staleModes()` and `driftedModes()` are the engine's view of the
answer; `describeState()` is the Tokens pane's.

### Correspondence states

`describeState()` names a token's **condition**. None of these names says what a sync would do. The plan is the only thing that speaks in the future tense.

| State | Meaning |
|---|---|
| `current` | Figma holds the document's value in every mode the token declares |
| `drifted` | They differ, and the stamp proves *Figma* moved since Toghen wrote it, whether or not the document moved too |
| `outdated` | They differ, and Figma still holds what Toghen wrote: the *document* has moved |
| `absent` | No Figma variable holds this token |
| `adopted` | A variable of this name and type exists that Toghen did not write |
| `blocked` | A type that varies by mode, a type no variable can hold, a value the core refuses to compute (with its reason), or a name taken by a variable of the wrong type |
| `not_inspected` | Backed by a Figma style. Styles are not compared yet: shown rather than omitted, so the counts reconcile |

Two edges worth knowing. `current` is a **stronger** claim than the plan's `SKIP — unchanged`: the plan says the document has not moved, the Tokens pane says the two sides agree, checked directly. And where both sides hold the same value but the stamp does not record it, the state is `current` with a note. Reporting a difference that a direct comparison says is not there would be the screen claiming more than it checked.

### Operation summary

```typescript
interface OperationSummary {
  total: number;
  applied: number;
  /** Planned skips, prerequisite failures, and cancellations. A plan's warnings, notes and breaking rows are not counted here: the plan counted them under their own names. */
  skipped: number;
  failed: number;
  /** Not attempted because the run was cancelled — counted apart from failures. */
  cancelled: number;
  durationMs: number;
  results: OperationResult[];
}
```

`runOperations` carries every `SKIP`, `WARNING`, `BREAKING` and `NOTE` into `results` as `skipped`, and counts only the skips among them, with the operations whose prerequisite failed and the cancelled ones (R14: one count is not reported under two names).

A *plan* summary is separate and per-engine. In `VariableSyncEngine.summarizePlan()`, `drifted` is a **subset** of `skips` (a drifted path is skipped), and the same count as `skipsByCause.drifted`. The command line therefore prints the causes, `52 skips (48 unchanged · 4 drifted)`, and no drifted count beside them.

### One row per thing that happened

A drifted path emits a `SKIP` only, with the explanation on it as its `message`: one event is one row, and the summary counts it once.

The one case where the `WARNING` still stands alone is a path that is **both drifted and stale**: `dark` edited in Figma while `light` moved in the document. There is no `SKIP` then, because the path does have work to do, so the plan reports the drift as a `WARNING` beside the writes. Attaching the message only to the skip would have lost that report entirely.

---

## Conventions JSON schema

A conventions file is a JSON array of convention objects:

```json
[
  {
    "id": "button-fill",
    "pattern": "{component}/{variant}/fill",
    "property": "fills[0].color",
    "nodeTypes": ["INSTANCE", "FRAME"],
    "variableType": "COLOR",
    "description": "Background fill colour per button variant"
  }
]
```

### Field reference

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | ✅ | Unique slug-style identifier |
| `pattern` | `string` | ✅ | Variable name template with `{component}` / `{variant}` tokens |
| `property` | `string` | ✅ | Figma node property to bind (see [Supported Node Properties](#supported-node-properties)) |
| `nodeTypes` | `string[]` | ✅ | Figma node types this convention applies to |
| `variableType` | `string` | ✅ | Expected Figma variable resolved type |
| `description` | `string` | — | Human-readable explanation |

### Pattern tokens

| Token | Resolves to |
|---|---|
| `{component}` | Component name (or main-component name for instances) |
| `{variant}` | Slash-joined variant property values (e.g., `Primary/Large`) |

If a node has no variants, `{variant}` resolves to an empty string.

### Variable type values

| Value | Figma variable type | Typical token types |
|---|---|---|
| `COLOR` | Color variable | `color` |
| `FLOAT` | Number variable | `dimension`, `letterSpacing` (not in `em`), `number`, `fontWeight` |
| `STRING` | String variable | `string`, `fontFamily` (a stack becomes its first family) |
| `BOOLEAN` | Boolean variable | `boolean` |

### Validation rules

- Root value must be a JSON array
- Every item must be an object
- `id`, `pattern`, `property`, `variableType` must be non-empty strings
- `nodeTypes` must be an array of non-empty strings
- Violation → an `ERROR` response with code `INVALID_CONVENTIONS`, whose `commandType` is `LOAD_CONVENTIONS`

---

## Supported node properties

### Spacing & layout

| Property | Notes |
|---|---|
| `paddingLeft` | |
| `paddingRight` | |
| `paddingTop` | |
| `paddingBottom` | |
| `itemSpacing` | Gap between auto-layout children |
| `width` | |
| `height` | |

### Radius

| Property | Notes |
|---|---|
| `cornerRadius` | All corners |
| `topLeftRadius` | |
| `topRightRadius` | |
| `bottomLeftRadius` | |
| `bottomRightRadius` | |

### Stroke & opacity

| Property | Notes |
|---|---|
| `strokeWeight` | |
| `opacity` | |

### Color

| Property | Notes |
|---|---|
| `fills[0].color` | Bind a COLOR variable to the first fill's paint color |
| `strokes[0].color` | Bind a COLOR variable to the first stroke's paint color |

> `fills[0].color` and `strokes[0].color` use `setBoundVariableForPaint` internally, so the variable must be of type `COLOR`.

### Text

| Property | Notes |
|---|---|
| `characters` | Character content (STRING variable) |
| `fontFamily`, `fontStyle` | A font's halves (STRING variables), bound on the whole text in a component file |
| `fontWeight`, `fontSize`, `lineHeight`, `letterSpacing`, `paragraphSpacing`, `paragraphIndent` | FLOAT variables, bound on the whole text in a component file; a line height or letter spacing in pixels only |

### Custom properties

Any other string is forwarded verbatim to `setBoundVariable(property, variable)`. This allows binding to less-common Figma properties as they are exposed by the API.

---

## Token type → Figma target map

Defined in `shared/tokenTypeMap.ts`. Maps W3C token types to their corresponding Figma sync targets:

| Token Type | Figma Target |
|---|---|
| `color` | Variable (COLOR) |
| `dimension` | Variable (FLOAT) |
| `letterSpacing` | Variable (FLOAT) in pixels, scoped to letter spacing; in `em` it is skipped |
| `boolean` | Variable (BOOLEAN) |
| `number` | Variable (FLOAT) |
| `string` | Variable (STRING) |
| `fontWeight` | Variable (FLOAT) |
| `fontFamily` | Variable (STRING) |
| `typography` | Text Style |
| `shadow` | Effect Style |
| `gradient` | Paint Style |

---

## Figma token adapter

Converts between token values and Figma-native values:

### What an export is, and is not

`exportToJSON` writes a **DTCG token file**: resolved values for one mode. That
is a different document from a resolver document, which
declares `sets`, `modifiers` and `resolutionOrder` and produces those values.

**An export loads back as a token file**, not as the document it came from: `LOAD_DOCUMENT` loads it through the core's `load` as one collection holding the one combination exported (see [*The load*](#the-load)). The modifiers, contexts and references of the document are not in it.

The export carries the system's declared version at its root:

```json
{
  "$extensions": { "com.toghen": { "version": "1.4.0" } },
  "color": { "bg": { "$type": "color", "$value": "#1a1a2e" } }
}
```

§6.3.2 of the token format allows `$extensions` on any group, and a token file's root is a group. It cannot collide with a token, because §5.1 forbids token and group names beginning with `$`. The export gates the version on the same *Include $extensions* switch as the per-token records: the control names `$extensions`, and writing vendor data into a file where the user asked for none would contradict it.

### `toFigmaValue(value, type, unit?)` → Figma-compatible value
- Colors: hex string → Figma RGBA
- Dimensions: `{ value, unit }` or string → pixels
- `unit: 'percent'`: the number is an opacity, written × 100, since Figma reads a variable bound to opacity as a percentage

### `fromFigmaValue(figmaValue, type, resolveAliasName?)` → token-compatible value
- Figma RGBA → hex string
- Pixels → `{ value, unit }` object
- `VariableAlias` → `→ <target name>`, resolved through the optional third
  argument, which the caller supplies because only it holds the variable index

The alias case is checked **before** the type, and that ordering matters: an alias is an object with no `r`/`g`/`b`, so a COLOR variable pointed at another variable used to fall through to `clamp01(undefined ?? 0)` and read back as a confident `#000000`. It went unnoticed because the function had no production callers until the Tokens pane, which is also the one place in the plugin where a Figma value is shown to a person rather than compared, and therefore the one place a silently wrong value would be believed.

---

## Figma style adapter

Maps resolved composite tokens to Figma style properties:

| Method | Input Type | Output |
|---|---|---|
| `toTextStyleProps(token)` | typography token | Figma text style properties |
| `toEffectStyleProps(token)` | shadow token | Figma effect style properties |
| `toPaintStyleProps(token)` | gradient token | Figma paint style properties |

---

## Permutation utilities

Nothing in the plugin builds every combination of contexts: loading, the token graph, the plans, component files and the export all read the sum (`resolveSumModes`, cached per document), and the export resolves only the one combination asked for. A modifier with no default cannot build the sum, so loading such a document is refused: `Modifier "x" declares no default context.`, once per such modifier, saying the sum needs one.

Mode names come from `@toghen/lib`, not from the plugin:

- `resolver.getModeName(permutation)` converts a `ResolverInput` into a deterministic mode name (e.g. `{ theme: 'dark', density: 'compact' }` → `"dark/compact"`), joined in modifier declaration order, with omitted modifiers contributing their default.

The plugin keeps no copy of its own: these names are written into the user's Figma file as collection modes, so lib and the adapter must agree exactly or a rename would create duplicate modes instead of reusing existing ones.

---

## Stamps on variables and styles

The variable and style syncs keep a [stamp](#the-stamp) on each variable and style they write; `main/utils/tokenStamps.ts` holds what they add to it. `is.token` is the key the sync gives the object: a token's lookup path (`Demo.color.primary`), or a chain link's own key.

| On | Receipt field | Hash of what Figma reports |
|---|---|---|
| a variable | its mode's id, one per mode written | `valuesByMode[modeId]` |
| a variable | `scopes` | `scopes`, sorted |
| a text style | `fontName`, `fontSize`, `lineHeight`, `letterSpacing`, `textCase`, `textDecoration`, `boundVariables` | those fields; `fontName` as `{ family, style }`, without the `variationSettings` Figma reads back with it |
| an effect style | `effects` | `effects` |
| a paint style | `paints` | `paints` |

| Export | Signature | What it does |
|---|---|---|
| `stampWritten` | `(object: Stamped, token: string, reported: Record<string, unknown>) => void` | adds `receiptOf(reported)` to the object's receipt under `token`; a stamp for another token starts again |
| `reportedScopes` | `(scopes: readonly VariableScope[]) => VariableScope[]` | scopes as a receipt hashes them: sorted |
| `reportOf` | `(style: BaseStyle) => Record<string, unknown>` | what Figma reports for the fields a style plan writes, by the table above |
| `localStyles` | `() => Promise<Array<{ style: BaseStyle; styleType: 'TEXT' \| 'EFFECT' \| 'PAINT'; stamp?: Stamp; moved?: true; copyOf?: BaseStyle }>>` | the file's local styles, each with its stamp when it is Toghen's (`moved` when the stamp names another id), and each person's copy of one with `copyOf`, its original, and no stamp (`sortOut`) |
| `migrateRootRecord` (`rootRecord.ts`) | `(resolver: Resolver, conversionMap: TokenTypeConversionMap, options?: { dryRun?: boolean }) => Promise<void>` | turns an older build's root record (`toghen/extensions` and its shards) into stamps, once, and deletes it. A field the record says was written (a variable's mode, a style's field) is taken as written only where Figma holds the document's value; any other is stamped `UNPROVEN` and reads as drift. The stamps are worked out in `unwrittenStamps` (runtime state, by object id), which `getStamp` reads for an object with no stamp of its own, and written at the end. With `dryRun` nothing is written and the record stays: the stamps stay in memory for the dry run's plans, until the next load. Never throws |

The executor stamps each write as it lands: `CREATE_VARIABLE` (with its scopes), `SET_VARIABLE_VALUE` (its mode), `SET_VARIABLE_SCOPES`, and `CREATE_STYLE` and `UPDATE_STYLE`, which replace the whole stamp; `STAMP` writes it again as it is, with the object's id. `indexFigmaCollections()` sorts the variables with `sortOut`: `variablesByToken` holds Toghen's (`moved` on one whose stamp names another id), and `copies` each person's copy with its original. A mode is stamped only once its value has been applied, which is what makes re-planning a resume: after a partial or cancelled run, the next plan contains exactly what did not land.

**Export.** With *Include $extensions*, a token's stamp is written as `$extensions['com.toghen.figma'].stamp`, beside whatever the token already holds there, for reading, without its `id`; a copy's is not written. Loading a document never reads it back: a target's ids and receipts belong to one file.

---

## The stamp

What Toghen keeps on each object it writes in a Figma file: a variable, a variable collection, a style or a node. Shared plugin data, namespace `toghen`, one key, `stamp`, holding JSON. `main/components/stamp.ts` reads and writes it. Ruled in [decisions](decisions.md#ruled-the-stamp-one-receipt-per-object-for-every-target-20-october-2026); the variable and style syncs read and write it ([Stamps on variables and styles](#stamps-on-variables-and-styles)), and so does the component sync, on every set, member, layer and artboard frame (see *Component files*, *Stamps*). Collections carry none yet (see [specs](specs.md#the-stamp-module-first-step-of-the-ruling-built-20-october-2026)).

```typescript
interface Stamp {
  is: Identity;                      // what the object is
  id?: string;                       // the Figma id of the object it was written on; absent on a stamp written before it was recorded
  receipt: Record<string, string>;   // field Toghen owns → hash of what Figma reported right after the write
  placed?: { x: number; y: number }; // a set or an artboard's frame: where Toghen last put it
  fingerprint?: string;              // a set or an artboard's frame: what the last real run that finished it would write, hashed (`fingerprintOf`)
}

interface Identity {                 // one facet or more; a member's root is a member and a layer
  token?: string;      // a variable or a style: the token it holds, by the path the sync keys it by
  modifier?: string;   // a collection of one modifier: the modifier's name
  base?: true;         // the base collection
  component?: string;  // a component set: the component's name in the file
  member?: string;     // a member: its combination, `Axis=value, Axis=value`
  address?: string;    // a layer, the root included: its address in the file
  artboard?: string;   // an artboard's frame: the artboard's name in the file
}
```

| Export | Signature | What it does |
|---|---|---|
| `NAMESPACE`, `STAMP_KEY` | `'toghen'`, `'stamp'` | where the stamp is kept |
| `setStamp` | `(object: Stamped, value: Stamp) => void` | writes the stamp, replacing the one there, with `id` the object's own whatever `value` names. `Stamped` is `PluginDataMixin & { readonly id: string }` |
| `getStamp` | `(object: PluginDataMixin) => Stamp \| undefined` | the stamp, or `undefined` for none or one it cannot read. Never throws. Of a stamp edited by hand it keeps what has the shape above and drops the rest; one with no identity facet, or no `receipt` object, is none |
| `receiptOf` | `(reported: Record<string, unknown>) => Record<string, string>` | each field's hash, from what Figma reports for it read back after the write |
| `UNPROVEN` | `'unproven'` | a receipt's hash for a field Toghen owns but cannot prove Figma holds what it wrote (after an older build): no report hashes to it, so the field reads as drift until Figma holds the source's value |
| `hashOf` | `(value: unknown) => string` | FNV-1a over the value's JSON with every object's keys in order, so key order does not change it |
| `stampOn` | `(node: PluginDataMixin) => Stamp \| undefined` | the stamp, or what a node's keys from before the stamp say (see *Component files*, *Stamps*) |
| `updateStamp` | `(node: Stamped, change: Partial<Stamp>) => void` | writes the stamp with `change` over the one there (`is` merged, `receipt` and `placed` replaced when given), with the node's id, unless it would not change, and deletes the node's old keys |
| `isOwn` | `(object: { id }, stamp: Stamp) => boolean` | whether the stamp is the object's own: its `id` is the object's, or it has none |
| `sortOut` | `<T extends { id }>(objects: readonly T[], stampOf: (object: T) => Stamp \| undefined, find: (id: string) => T \| null \| undefined \| Promise<…>) => Promise<Sorted<T>>` | sorts stamped objects into `ours` (in the order given), `moved` (those of `ours` whose stamp names another id) and `copies` (`{ copy, of }`), by the rule below. Objects with no stamp are left out |
| `sortNodes` | `<T extends SceneNode>(nodes: readonly T[]) => Promise<Sorted<T>>` | `sortOut` for nodes, an original found by `figma.getNodeByIdAsync` wherever it is |
| `strip` | `(object: PluginDataMixin) => void` | removes the `toghen/stamp` key from a person's copy whose original a run deletes, and nothing else of it |
| `stripNodes` | `(ids?: readonly string[]) => Promise<void>` | `strip` for each node a deletion step names that is still in the file |
| `copiesFinder` | `() => (gone: SceneNode, inside?: boolean) => SceneNode[]` | reads every page's stamped nodes once; the function it returns gives the nodes outside `gone` whose stamps name the id of `gone` or, unless `inside` is false, of a node in it. Every page must be loaded |
| `outermost` | `<T extends BaseNode>(nodes: readonly T[]) => T[]` | those of `nodes` inside none of the others: the copies a row names |
| `keepsNoStamp` | `(copies: { id, name }[]) => string` | what a deletion's row says of the copies it strips: `its copy "Footer" (12:3) keeps no stamp` |
| `stampedAs` | `(facet) => { namespace, keys }` | the `sharedPluginData` of a `findAllWithCriteria` that finds the nodes of one facet, `component`, `member`, `artboard` or `address`: by the stamp's key or the facet's old key |

**A copy carries the stamp.** Duplicating an object in Figma takes its shared plugin data along, so a person's copy holds the stamp of the object it was made from, `id` included; the `id` tells them apart ([ruled](decisions.md#ruled-a-copy-carries-the-stamp-20-october-2026)). `sortOut` is the one place that decides, and every reader that groups objects by their stamps goes through it. Of the objects whose stamps name one id that is not their own: where the object with that id exists and its stamp is its own, it is Toghen's and they are its copies; where it is gone, the one with the lowest Figma id, in JavaScript's string order, is the original moved, and the rest copies of it. A copy is never written, never deleted, and never counted as Toghen's; the original moved is adopted, and its next write records its own id. A stamp with no `id` is its object's own.

**A copy whose original Toghen removes** loses its stamp in the same run ([ruled](decisions.md#a-copy-whose-original-toghen-removes-ruled-20-october-2026)): each step that deletes an object Toghen wrote carries the ids of the person's copies of it, and of the nodes in it, in `strip`, and strips them once the deletion runs, never when it is not taken. A stripped copy is a plain object of the person's, with no stamp: never adopted, never removed.

A receipt never holds a value. A receipt's field names are the caller's, one per thing Toghen owns on the object (a variable's value in one mode, its scopes; a layer's fields), and a variable's modes are named by their Figma mode ids. Those ids, and the stamp's own `id`, live only in the stamp, inside the Figma file they belong to: never in the token file, as a source or in an export. Export writes a stamp out for reading only, and loading a document never reads it back.

---

## Component files

A design system describes each Figma component in a file, `<component>.component.kdl`, in its own repository. The file is a [kdlet](https://codeberg.org/egildo/kdlet) file: kdlet reads it and evaluates it, and Toghen supplies what is Figma's (the layer kinds, the field names, the value rules) and what is design-system logic (the variant matrix, the properties, the checks). The file says what the component is; [specs.md](./specs.md#components-from-files) says why it is built this way, and [guide.md](./guide.md#write-a-component-file) shows how to write one. This section owns the format. The language itself, `guard`, `when`, `else`, `define` and `+call`, is owned by [kdlet's manual](https://codeberg.org/egildo/kdlet/src/branch/main/docs/manual.md).

The reader lives in `shared/components/`, which compiles under both the plugin's and the tests' configuration, so it holds no Figma API and no Node API.

### `readComponentFile(text, source?): ComponentFile`

Reads a file, evaluates it once for each member (one variant combination, built as a component of the set), validates each member's tree and returns the members.

`source` answers what a file takes from the design system: the values of a
`VARIANT … (modifier)"…"` axis, and the part axes `component … tokens="{group}"`
brings in. It holds no lib, so the reader stays free of it; the command line
answers it from a resolver document. A file that needs a source and gets none
stops with a problem saying so.

```typescript
interface DesignSource {
  contexts(modifier: string): string[] | undefined;       // the contexts Figma gets, the default first; undefined when there is no such modifier
  leftOut?(modifier: string): string[] | undefined;       // the contexts of that modifier Figma does not get (its figma.include)
  partsOf(group: string, layoutParts?: boolean): PartAxis[] | undefined;  // the axes the group's parts take, in the vocabulary's order
  group?(path: string, selection?: Record<string, string>): GroupInfo | 'token' | undefined;  // the keys one level down; 'token' for a token; undefined for nothing
  children?(path: string): string[] | 'token' | undefined;  // the names of a group's children, for VARIANT … from="{group}"
}

interface PartAxis {
  axis: string;      // an axis of the parts vocabulary that the group's subgroups use
  values: string[];  // the part keys used on it, in the vocabulary's order, without rest
  folded: boolean;   // folded into a collection of modes, or one variable per part
}
```

`partsOf` answers from the folds the variable sync makes, so a component file and the sync agree on where each variable is. It returns an empty list for a group with no parts, and `undefined` for a group that names no token and no group. `layoutParts` (`layout=parts`) keeps every axis in the path. `group`'s `selection` (axis to part key, for the axes left in the path) adds the keys of the part groups it selects, which outrank the group's own.

```typescript
interface ComponentFile {
  component?: Component;  // absent only when the file has no usable `component` node
  document?: Document;    // kdlet's document without the words that are Toghen's, as evaluated once per member
  members: Member[];      // empty while any problem is an error
  problems: Problem[];    // errors and warnings, in file order
}

interface Problem {
  severity: 'error' | 'warning';
  message: string;        // in the file's words: names the layer, field or property
  line?: number;          // one-based
  column?: number;
  member?: string;        // set for a problem found in some members and not in all
}
```

Every problem of a stage is reported, not the first. A file with an error builds nothing: `members` is empty. A warning does not stop anything.

The stages run in this order, and a stage that cannot run says nothing:

1. kdlet reads the file, and `read.ts` reads the five words that are Toghen's. Every problem of both is reported.
2. The axes a file takes from the design system are resolved (`axes.ts`): a `(modifier)` axis's values, a `from=` axis's children, and the part axes `tokens=` brings in. A file that needs a source and has none stops here.
3. When that found no error, the properties, the exclusions and the guards are checked against the axes (`validate.ts`), and the binding plan of each group the file names is worked out (`groups.ts`).
4. When no error so far, each combination is evaluated. A problem kdlet finds is reported, and a member kdlet had a problem with is not checked further. Otherwise the root and its pins are checked, the group plans are laid over the tree (`bindings.ts`), the tree becomes a member (`members.ts`), and `check.ts` checks its fields and values.
5. A member with no error from the stage before is checked as a whole: addresses (each layer's name in the file), wiring, slots, layout.
6. When every member got that far, the members are checked together: a property no member wires.

A problem found in every member is reported once, with no member. One found in some members and not all is reported once for each, with the member's name.

### The model

```typescript
type Value =
  | { kind: 'token'; path: string }                 // "{space.md}", without the braces
  | { kind: 'literal'; value: number | string }     // (literal)8, (literal)"#ffffff80"
  | { kind: 'property'; name: string }              // (property)"Show Nav"
  | { kind: 'key'; key: string }                    // (key)"…", a published component key
  | { kind: 'plain'; value: string | number | boolean | null };  // enums, booleans, text, #null

interface Track { type: 'FLEX' | 'FIXED' | 'HUG'; value?: number }   // a bare FLEX reads as 1
interface GridPlacement { row: number; column: number; rowSpan?: number; columnSpan?: number }
type Modes = Record<string, string>                                   // collection name → mode name
type SetField = Record<string, { value: string | boolean | { key: string } | { token: string }; loc?: Loc }>  // set Name=…: { token } binds a string or boolean token's variable
interface LayoutGridRecord {                                          // one grid of layoutGrids
  pattern: 'COLUMNS' | 'ROWS' | 'GRID';
  alignment?: 'MIN' | 'MAX' | 'STRETCH' | 'CENTER';                   // absent on a GRID
  count?: Value; gutterSize?: Value; offset?: Value; sectionSize?: Value; color?: Value;
}
type FieldValue = Value | Value[] | Track[] | GridPlacement | Modes | SetField | LayoutGridRecord[]

interface Layer {
  kind: 'FRAME' | 'SLOT' | 'TEXT' | 'INSTANCE';
  address: string;                    // the layer's name; for a SLOT, its property's name
  fields: Record<string, FieldValue>;
  children: Layer[];
  loc?: Loc;                          // where the layer is written
  fieldLoc?: Record<string, Loc>;     // where each field was last written, in the layer or in the `when` that wrote it
}

type Property =
  | { type: 'VARIANT'; name: string; values: string[]; modifier?: string; leftOut?: string[]; from?: string; part?: true }  // modifier: values taken from it, and its mode pinned per member, a folded part axis too (the collection named after it); leftOut: the contexts Figma does not get; from: the group its values are the children of; part: an axis from the parts vocabulary
  | { type: 'BOOLEAN'; name: string; default: boolean | { token: string } }   // { token }: default="{flag.on}", its variable bound to the default
  | { type: 'TEXT'; name: string; default: string | { token: string } }
  | { type: 'INSTANCE_SWAP'; name: string; default: ComponentRef; preferredValues?: PreferredValue[] }
  | { type: 'SLOT'; name: string; description?: string; preferredValues?: PreferredValue[]; slotSettings?: SlotSettings };

type ComponentRef = { name: string } | { key: string };
type PreferredValue =
  | { type: 'COMPONENT' | 'COMPONENT_SET'; key: string }               // preferred … key="…": written in Figma; refused in FigCraft
  | { type: 'COMPONENT' | 'COMPONENT_SET'; name: string; loc?: Loc }  // preferred … name="…": found by the locator, written in FigCraft as an id; refused in Figma
interface SlotSettings { minChildren?: number; maxChildren?: number; allowPreferredValuesOnly?: boolean; stretchChildOnInsert?: boolean; displayEmptyByDefault?: boolean }

interface Exclusion { combination: Record<string, string>; loc?: Loc }   // one value for each axis it names

interface Component {
  name: string; description?: string; properties: Property[]; exclude: Exclusion[];
  include?: Exclusion[];   // when present, only the combinations these match are built
  tokens?: string;         // the token group named by tokens="{…}", without the braces; every axis of its parts vocabulary is a VARIANT after the declared ones
  layout?: 'parts';        // layout=parts on the component line: every part axis stays in the path, one variable per part
  groups?: Record<string, GroupPlan>;  // the binding plan per group a file names, worked out in the repository; a member that selects part groups has its own, under planKey(group, selection), such as `button|variant=primary`
  notes?: string[];        // skipped keys, for the run report
  warnings?: string[];     // literal border members, for the run report
}
interface Member { name: string; combination: Record<string, string>; tree: Layer }
interface Loc { line: number; column: number }

interface GroupInfo {                       // what DesignSource.group answers: the tokens one level down
  keys: string[];                           // in the document's order
  paths?: Record<string, string>;           // a key whose token is in a part group the selection chose: that token's path; every other key is <group>.<key>
  borders?: Record<string, { color?: string; width?: string; unsolid?: true }>;  // a composite border's reference members
}
interface GroupPlan {                       // what a group binds, worked out from its keys in the repository
  TEXT: Laid;                               // for a TEXT
  box: Laid;                                // for a FRAME or SLOT, whatever its layout
  NONE?: Laid; HORIZONTAL?: Laid; VERTICAL?: Laid; GRID?: Laid;   // laid over `box` by the layer's layoutMode, present only where the group has a gap
}
interface Laid { set: Record<string, string>; notes?: string[]; warnings?: string[] }   // Figma field → token path; what was skipped; what could not be bound

```

The model is plain JSON. A `Member` is what kdlet's tree for one combination becomes once it is Figma's: the diff, the steps and the engine work on it and never on KDL. Positions are kept beside the data so that a problem found in a member after a `when` wrote the offending field points at the line of that `when`.

### The field table

`FIELDS` (`shared/components/fields.ts`) is every field a layer may set, by its Plugin API name. One row says which layer kinds take the field, what its value looks like, and how a token reaches it. The token column is the property roster's Bind and Token columns (`.reference/figma/property_roster.md`); the scopes a variable sync gives a token (`scopesOfField`), the fields Figma reports on parts (`BOUND_BY_PARTS`), the paint properties (`PAINT_PROPERTIES`), the field lists the engine writes in order, and the receipt's branches are read from it.

```typescript
interface FieldSpec {
  nodes: readonly LayerKind[];           // the layer kinds that take it
  value: ValueKind;                      // 'dimension', 'size', 'paints', 'token' (a style, or a variable where it binds), 'enum', …
  options?: readonly string[];           // an enum's values
  wires?: PropertyType;                  // the property type a (property) value names
  token?: {                              // absent: the field takes no token
    types: readonly string[];            // the token types it carries: 'dimension', 'number', 'color', 'shadow', 'typography'
    bind?: {                             // absent: a style when `value` is 'token' (textStyle, effectStyle)
      call: 'field' | 'paint' | 'effect' | 'grid' | 'text' | 'property';   // setBoundVariable, setBoundVariableForPaint, …
      field: string;                     // the name the call takes: the field's own, or 'color' for a paint
      variable: VariableResolvedDataType;
      scope?: readonly VariableScope[] | { text: readonly VariableScope[]; other: readonly VariableScope[] };  // the second form for a fill
      parts?: readonly string[];         // reported on these instead: cornerRadius on its corners, strokeWeight on its sides
    };
  };
}
```

A field that takes a token binds it with `field`, `paint` or `text`, names a style, or, with `types` and no `bind`, is written as the token's value: `x` and `y` (dimension), `cornerSmoothing` (number), `dashPattern` (`strokeStyle`, its `dashArray` in pixels), `listSpacing` (dimension) and `maxLines` (number). `visible` and `characters` bind a `boolean` and a `string` token with `field`. The text fields bind with `text`, on the whole text. `STYLE_TEXT_FIELDS` lists the text fields a text style also sets, which the reader refuses beside `textStyle`; `PIXELS_ONLY_FIELDS` the two, `lineHeight` and `letterSpacing`, that bind in pixels only. Two value kinds are structured child nodes beside `paints`, `tracks`, `placement`, `modes` and `set`: `dashes` (`dashPattern`: one token reference, `(literal)` lengths, or none) and `constraints` (`constraints horizontal=… vertical=…`, read as `{ horizontal, vertical }`, the `Constraints` of `model.ts`; `options` are each axis's values).

`effects` and `layoutGrids` bind by parts, with `effect` and `grid`. Their row's `field` and `variable` name the case the parts share (a radius, a count, FLOAT); the parts are two tables beside it. `SHADOW_FIELDS` maps a shadow token's members to the effect fields they bind (`blur` to `radius`), the colour a COLOR variable, scope `EFFECT_COLOR`. `GRID_FIELDS` gives the fields each alignment takes, `GRID` for a square grid, which are the fields the check accepts and the writer binds. `fills` and `strokes` carry `gradient` beside `color`.

### The field writer

`main/components/fieldWriter.ts` is the one place a field that carries a token is written, and read back for the receipt. Every row of the table with a `token` column is written through it.

```typescript
function writeField(build: Build, node: SceneNode, layer: Layer, field: string): Promise<FieldWrite>;
function reportField(node: SceneNode, field: string): unknown;   // what the receipt hashes

type FieldWrite =
  | { how: 'bound'; variable: Variable }   // the token's variable, bound by the table's `bind`
  | { how: 'value'; context: string }      // a token on a field, or part of one, Figma cannot bind: its value at the defaults, named by mode
  | { how: 'style' }                       // a style made from the token (textStyle, effectStyle)
  | { how: 'plain' };                      // a literal, or #null
```

- **Bound.** A `field` binding is `setBoundVariable(bind.field, variable)`; a `paint` binding is `setBoundVariableForPaint` on each solid paint, given the colour the variable resolves to; a `text` binding is `setRangeBoundVariable(0, characters.length, bind.field, variable)`, after the characters. The variable is `Resolved.variable(path)`, of the type the table names.
- **A line height or letter spacing.** Bound when its token is in pixels; written as its value (PERCENT, from a unitless line height or an `em` letter spacing, or AUTO) otherwise: `Resolved.textValue(field, path)` gives that value, from the core, and is undefined for a token in pixels. A `(literal)` is pixels.
- **A font stack.** A `fontFamily` token whose value is a stack binds its variable, which holds the first family; the report says so once per run, field and layer: `"fontFamily" of "<component>/<address>": {<path>} is a font stack, and its variable holds the first family, "<family>"; "<rest>" is not used`.
- **Written as a value.** The token's value is the core's at the declared defaults: `Resolved.valueOf(path)` gives it in Figma's representation with the defaults' mode name, from the loaded document only. `resolve()` asks for it for every token on a field without `bind`, and for every colour on a paint; a token that needs a value with no document loaded, one the document does not have, one whose type is not in the field's `types`, or one whose value Figma cannot take there, is a problem with its line. A colour's alpha below 1 is written as the paint's `opacity`. A `strokeStyle` gives `valueOf` its dash array, `number[]` in pixels, for `dashPattern`.
- **The report.** Each value written adds one line to the run's warnings, once per run, field and layer, and a dry run's warnings carry the same line for each field its steps would write as a value (`plannedValueLines`): `"<field>" of "<component>/<address>": <what> is written as its value in "<mode>"; it will not follow the token until the next run`.
- **Apply and the conventions.** `writeToken(node, field, path, resolved)` makes the layer (`applyLayer`) and the run around one call to `writeField`; `resolvedFor(variable, atDefaults?)` is the `Resolved` it reads, holding one token's variable and its value at the defaults. Apply's operations and a convention's `BIND_VARIABLE` on a `field` binding write through it. Neither writes a receipt.
- **Composite tokens.** `Resolved.composite(path)` answers for a `gradient` token on a paint and a `shadow` or `dimension` token on `effects`, from the core at the declared defaults: the Figma objects (`paint` or `effects`, made by style sync's adapters), the token each bound part follows (`bound`, by `<index>.<field>`), the parts written as values in the file's words (`written`), and the defaults' mode name. A member that is a reference (`referencesOf`, through a reference that is the whole value) to a token with a variable is bound; any other is written. A gradient stop is bound by writing the alias into the stop (`gradientPaint`), since `setBoundVariableForPaint` refuses a gradient (measured §14); an effect's parts with `setBoundVariableForEffect`, a grid's with `setBoundVariableForLayoutGrid`. The report's line names the token and its written parts: `"effects" of "Card/Flat": part of the shadow "{shadow.flat}" (offsetX, offsetY, blur, spread) is written as its value in "light"; …`.
- **The receipt.** `reportField` reads a paint per paint (a bound paint as `{ variable }` only: its alpha is the variable's, in whatever mode the layer is in, so its opacity is not compared, and a hand change to it is not drift; ruled 24 October 2026), a style by its id, and a field bound by its parts as bound when every part names one variable. A text field, which Figma reports as an array of aliases, reads as bound when every alias names one variable (`boundIdOf`); unbound, a line height or letter spacing reads `{ unit, value }` with its number as float32, and a font's half reads that half of `fontName`. The expected side (`expectedOf`, with `expectedText` for a text field) reads the same shape from the file, `valueOf` and `textValue`, so a second run over a set it built writes nothing.

### The file

The format a component file may use, node by node, is in [component-files.md](./component-files.md): the top-level words, the properties and their rules, the layers and their fields, the value forms, how a file uses kdlet's guards, `when`, `else` and `define`, exclusions and inclusions, the axes and bindings a file takes from the tokens, the expansion into members, and what is checked. This page owns the reader's API above and the engine below; the format is owned there, so that whoever writes a file has one page to read.

Two tables from it that the engine and the command line lean on are repeated here in brief:

- **A token reference resolves by name.** `"{space.md}"` is the variable `tokenPathToVariableName('space.md')` names, `space/md`, looked for across every local collection; a `textStyle` reference is the text style of the same name. One match binds; none or two stop the run.
- **A group's bindings are worked out from the loaded design system.** The binding plan a file's `tokens=` fields imply comes from the resolver document the plugin has loaded (`DesignSource.group`) and is kept on the component as `Component.groups`, laid over every evaluated member. A file that needs a group or a `(modifier)` axis with no document loaded is refused, naming what it needs.

### `readBlueprint(text, source?, inputs?): Blueprint`

Reads a blueprint (`<page>.blueprint.kdl`; the format is [component-files.md](./component-files.md#blueprints)) and
each of its bodies, a component body with `readComponentFile` against `source`, an artboard body with the artboard
reader against `inputs`, at the blueprint's own lines. `isBlueprintFile(fileName)` says whether a file name is a
blueprint's.

```typescript
interface Blueprint {
  page?: string;              // absent when there is no usable `page` line
  tokens?: BlueprintTokens;
  libraries: string[];        // the `library` lines, in file order
  bodies: ComponentFile[];    // each body as its file reads, in file order; `artboard: true` on an artboard
  problems: Problem[];        // the blueprint's and every body's, in file order, each once
}

interface BlueprintTokens {
  entries: string[];          // one resolver document, one token file, or several token files, as written
  name?: string;              // the collection's name, for token files
  overrides?: string;         // the file that holds the overrides map
}
```

### `blueprintNeeds(blueprint): BlueprintNeeds`

What a blueprint needs, from what it read. Pure; nothing is looked up in Figma.

```typescript
interface BlueprintNeeds {
  tokens?: BlueprintTokens;
  libraries: string[];          // each once
  components: ComponentNeed[];  // once each, in the order first named
}

interface ComponentNeed {
  ref: ComponentRef;          // a name, or a published key from `(key)"…"`
  satisfied: boolean;         // a `component` body of the same blueprint defines it; never true of a key
  loc?: Loc;                  // where the blueprint first names it
}
```

A component is named by `component=` on an `INSTANCE`, by an `INSTANCE_SWAP` property's default, and by a `(key)`
in a `set`. A body that does not read has no members, so it names nothing.

### `run(desired, options): Promise<Report>`

The Figma-side engine, in `main/components/run.ts`, with its steps and types in `shared/components/`. It makes Figma agree with a component file already read: it resolves every name the members use, finds what is already in the file by stamp, takes the difference as steps and applies them. Plugin code, so ES2017 and no Node API. It is designed to run inside a printed script, which an agent runs through `use_figma` (Figma's tool for running a Plugin API script in a file), and that is why `desired` is plain JSON.

```typescript
interface Desired {
  component: { name: string; description?: string; properties: Property[] };  // a Component is one
  members: Member[];
}

interface RunOptions {
  page?: string;           // the page the set lives on, by name; the current page when absent
  dryRun?: boolean;        // plan and return the steps, and write nothing
  allowBreaking?: boolean; // take the steps that break instances; without it a real run that has any stops before its first write
  overwriteDrift?: boolean; // write the file's value over a field edited by hand since Toghen wrote it; without it the edit is kept and noted
  pending?: Pending;       // names a dry run counts as present because an earlier step would create them; a real run refuses it
  libraries?: string[];    // the libraries the file declares (a blueprint's `library` lines), whose names resolve through the lock; see *The lock*
}

interface Pending {
  variables: { collection: string; name: string; type: VariableResolvedDataType }[];  // by collection name, variable name and type
  textStyles: string[];                                                               // by style name
  effectStyles?: string[];                                                            // by style name
  modes?: { collection: string; mode: string }[];                                     // modes a plan would create, by collection name
}

interface Report {
  dryRun: boolean;
  steps: Step[];      // planned, and for a real run applied
  setId?: string;     // the set built or patched; absent for a dry run
  created: string[];  // names of the members created, in order
  updated: string[];  // names of the members whose layers were patched
  deleted: string[];  // names of the members deleted
  notes: string[];    // what was found and left alone: nodes with no stamp, fields no longer declared, fields edited by hand (drift), foreign properties
  breaking: string[]; // what breaks instances elsewhere: a member deleted, a layer replaced, a property deleted or retyped
  warnings: string[]; // things the engine noticed that did not stop it
  pending: string[];  // names a dry run counted as present because `pending` said they would be created, one line each; empty for a real run
  unchanged?: true;   // left unread by `skipUnchanged`: its stamp holds the fingerprint of what the run would write; no step was planned
}
```

**It throws a `ComponentRunError`** (`main/components/errors.ts`, with `problems: string[]`), always before the first write, for four reasons:

1. something the members name does not resolve;
2. a set must not be touched;
3. a step would break instances and `allowBreaking` was not given;
4. `pending` was given to a real run.

The plugin does not roll a run back, so the engine checks everything it can foresee before its first write (see *No rollback* above). A dry run throws for the first, returns the second among its steps, and lists the third in `breaking` without throwing.

**Breaking steps stop a real run.** A step that carries `breaks` (a member deleted, a layer replaced by another kind, a property deleted or retyped) is listed in `Report.breaking`. A real run with any of them throws, with the lines of `breaking` as its problems, unless `options.allowBreaking` is true. The engine cannot narrow this to members that have instances: it sees the instances in this file, not in files that use it as a library.

**`pending`.** A dry run resolves names only as a check, and writes nothing, so what an earlier step of the same run would create does not exist. A name that matches nothing in the file counts as present when it matches an entry of `pending` by the lookup rule below:

- a variable: `tokenPathToVariableName(path)` equals the entry's `name`, with the same type;
- a text style: the name equals an entry of `textStyles`;
- an effect style: the name equals an entry of `effectStyles`;
- a `modes` pin: a collection and mode that an entry of `modes` names, when the file lacks the collection or the mode;
- a component by name: an entry of `components`, a set a file earlier in the same dry run would create, when the file has no component of that name. Its instances' properties and slots are not checked against it: they are on the run that builds it (ruled 24 October 2026).

The run reports such a name in `Report.pending` as `token {space.xl} (line 12): the variable sync would create "space/xl"`, `text style {text.label} (line 9): the style sync would create "text/label"` , `modes state=hover (line 3): the variable sync would create it` or `component "Chip" (line 4): a file earlier in this run would create it; the properties and slots of instances of "Chip" are checked when it is built`, once per component per file. A name in neither still throws. An entry that is already in the file is the variable in the file, not a second one; an entry that matches alongside an existing variable in another collection makes the name ambiguous, as two existing ones would.

Run one component at a time against a file: the command line sends them one after another, and two runs at once would interleave their writes.

#### What it resolves

Every name is looked up and none falls back: a name that matches nothing stops the build, and so does one that matches twice. All the problems are thrown together, each with the file's line.

| The file names | Resolved as |
|---|---|
| a dimension or opacity token `{a.b}` | the `FLOAT` variable named `tokenPathToVariableName('a.b')`, `a/b`, looked for in every local collection; exactly one across all of them. The token's purpose must match the field: `opacity` bound to a token that is not an opacity stops the build (`token ds.button.alpha in member "…" is bound to opacity but is not an opacity; declare figma.scopes ["OPACITY"] on it`), and so does an opacity bound to another field (`… is an opacity, bound to width`). A field outside the token's scopes still binds, and the report's `left` lines note it: `ds.surface.edge is bound to fills but is offered to STROKE_COLOR only; declare figma.scopes to widen it.` |
| a colour token | the same, and a `COLOR` variable |
| a token on `fontFamily`, `fontStyle`, `characters`, a `TEXT` property's value or default | the same, and a `STRING` variable |
| a token on `visible`, a `BOOLEAN` property's value or default | the same, and a `BOOLEAN` variable |
| a token on `fontWeight`, `fontSize`, `paragraphSpacing`, `paragraphIndent` | the same, and a `FLOAT` variable |
| a token on `lineHeight` or `letterSpacing` | the core says its unit: in pixels, a `FLOAT` variable as above; otherwise its value at the declared defaults. Either way the resolver document must be loaded |
| a `textStyle` token | the text style with the same name, in the same way |
| an `effectStyle` token | the effect style with the same name, in the same way |
| `component=<Name>` | the one `COMPONENT` or `COMPONENT_SET` of that name in the file, ignoring members of sets; a set resolves to its default variant |
| `component=(key)"…"`, `default=(key)"…"` | imported with `importComponentByKeyAsync`, and if that fails `importComponentSetByKeyAsync`. Not on a dry run, which does not import and so does not check a key |
| `modes Scale=small` | the local collection named `Scale`, and its mode named `small`; or the collection a declared library holds (`RunOptions.libraries`, `--use`), found through the lock as the one whose variables' ids begin `Scale/`. A name found in both, or in two libraries, stops the build. A library's collection is pinned in FigCraft only, which checks the mode name itself; Figma refuses it until measured (the messages are under *The lock*) |
| `options.page` | the page of that name |

One function, `tokenPathToVariableName()` in `main/utils/tokenPath.ts`, spells the variable name: the token path without the collection segment, `/` between groups, as variable sync writes it. Every search for a stamped node, a set by name, or an instance runs page by page (`main/utils/pageRoots.ts`), after each page's `loadAsync()`: under `documentAccess: dynamic-page` (the manifest setting that makes a plugin load pages one at a time) the plugin may not search the document as a whole without `figma.loadAllPagesAsync()`, which `use_figma` does not support, and the page-by-page search is allowed in both ([measured behaviour §11](.reference/figma/measured_behaviour.md#11-the-first-command-line-run-in-a-real-file)).

#### Steps

A step is data: the diff makes them without touching Figma, and a dry run returns them as they are.

| Step | Carries | When |
|---|---|---|
| `CREATE_SET` | `component` (name, description, properties) and `members` | no set is stamped with the component's name and none of that name exists |
| `REFUSE_FOREIGN` | `component`, `nodeIds`, `message` | a set of the component's name that Toghen did not make. It is never adopted by name. Refused before anything else |
| `ADD_PROPERTY` | `property` | the file declares a `BOOLEAN`, `TEXT` or `INSTANCE_SWAP` property the set lacks. A `SLOT` property comes with its `SLOT` layer |
| `EDIT_PROPERTY` | `property`, `changes` | a property of ours differs: `defaultValue`, `description`, `preferredValues` or `slotSettings`. An `INSTANCE_SWAP` default is a component id, so its edit is always planned, and so is a default that is a token, bound to a variable only the Figma side resolves |
| `DELETE_PROPERTY` | `name`, `breaks?` | a property in the set's receipt that the file no longer declares, or whose type changed (it is deleted, then added) |
| `RENAME_AXIS` | `from`, `to` | the held members all have the same axes, and the file's differ from them in one name at one position, with the same values on it (as sets). Applied with `editComponentProperty`, which renames the axis on every member and keeps every instance's value; each member's stamp is written again. Breaks nothing. Two axes renamed, a value changed, or an axis added or removed is not a rename |
| `CREATE_MEMBER` | `member` | a combination the file has and the set lacks |
| `DELETE_MEMBER` | `memberId`, `name`, `breaks`, `strip?` | a stamped member the file no longer has. `strip` holds the ids of the person's copies of it and of its layers, wherever they are; once it is deleted their stamps are removed, and `breaks` ends `; its copy "Tone=calm" (12:40) keeps no stamp` |
| `CREATE_LAYER` | `member`, `memberId`, `layer`, `parent`, `after?` | a layer the file has and the member lacks. `layer` never carries children: they are steps of their own |
| `REPLACE_LAYER` | as `CREATE_LAYER`, and `nodeId`, `breaks`, `strip?` | a stamped layer whose kind changed. What was inside it comes along. `strip` and `breaks` as for `DELETE_MEMBER`, for the copies of the old node, and of what was inside it when that does not come along |
| `MOVE_LAYER` | `member`, `memberId`, `nodeId`, `address`, `parent`, `after?` | the file put a layer under another parent, or in another order among the layers the file and the member share |
| `PATCH_LAYER` | `member`, `memberId`, `nodeId`, `layer`, `fields`, `restamp?` | a stamped layer of the same kind, the root (which is the member itself) included, with a field to write (`fields`, by its receipt: see *How a set is updated*), a field whose receipt is taken again without a write (`restamp`: Figma already holds the file's value), a field its receipt lists that the file no longer declares, or in a set a name that is not the file's |
| `SWAP_COMPONENT` | `member`, `memberId`, `nodeId`, `address`, `component`, `from`, `fromLibrary?`, `to`, `library?` | a stamped instance whose component the locator now answers with another: the file names another, or the lock sends its name to another key (a relink). One per instance, before the `PATCH_LAYER` that writes the layer's other fields, which no longer carries `component`. `component` is the set or artboard it is in; `from` the component the instance shows now, a variant by its set, and `fromLibrary` the library it came from (the name the lock holds its key under, empty when none; absent: this file); `to` the one it will show, and `library` the declared library the locator took it from (absent: this file). Applied with `swapComponent`, and the layer's receipt taken again once the run's writes are done. A component wired to a property is not swapped here. A dry run, which imports nothing, compares the key it would import with the instance's component's. Its row: `"Glyph" in "Badge/Tone=calm" swaps from "Icon" (this file) to "Icon" from library "Core"`. Counted as an update |
| `OVERWRITE` | `member`, `address`, `message` | a field edited by hand since Toghen wrote it, with `overwriteDrift`: said before the `PATCH_LAYER` that writes the file's value over it. Its message is a warning |
| `DELETE_LAYER` | `member`, `memberId`, `nodeId`, `address`, `breaks?`, `strip?`, `message?` | a stamped layer the file no longer has. `breaks` on an artboard. `strip` as for `DELETE_MEMBER`; it is named in `breaks` where there is one, and otherwise in `message`: `removes "Footer"; its copy "Footer" (12:3) keeps no stamp` |
| `LEAVE` | `what`, `message` | something found and left alone: `unstamped-node`, `unstamped-member`, `field`, `property`, `drift`, a field edited by hand since Toghen wrote it, kept without `overwriteDrift`, and `copy`, a person's copy of a layer, a member, a set or an artboard frame: `member "Tone=calm": "Footer" (FRAME:12) is a copy of Toghen's layer "Footer", left alone`; `"Tone=calm copy" (COMPONENT:9) in the set is a copy of Toghen's member "Tone=calm", left alone`; `"Card" (COMPONENT_SET:30) is a copy of Toghen's set "Card", left alone` |
| `RELAYOUT` | | always, for a set that exists: the members are laid out again and the set resized |

A real run throws for a refusal; a dry run returns it. The steps of an update are in the order they can be applied: properties, then an axis renamed, then each member that exists (its own layers, parents before children, deletions last), then the members to create, then those to delete, then the layout. The new members are built away from the set and appended together, with the set's property keys read once before: from the first append until the last deletion the members may disagree on axes, and Figma then refuses every read of the set's properties.

A stamped set Figma already reports as broken (`Component set has existing errors`) stops the snapshot before anything is written. The error names, from the children's names and stamps: each member whose axes differ from those most members have, with its id and the count of the others; each combination two members share, with both ids; each name that does not read as `Axis=value, …`. Each is said to be `ours` or `made by hand`, and the last line is `delete or rename the members named, then run again`. The set is never rebuilt.

#### How a set is built

In this order, each keyed to a measured trap in [measured behaviour](.reference/figma/measured_behaviour.md#7-component-sets-slots-and-layout) or to the typings:

1. Switch to the page, once.
2. Load the fonts: the default font a new text node starts with, and the font of every text style a member uses.
3. For each member, in order: create a component named for its combination, and stamp it. Should any of steps 3 to 7 throw, every node the step made is removed before the error goes on (`orRemoveWhatItMade()`); a plugin run has no rollback of its own. Adding members to an existing set does the same. Add its `BOOLEAN`, `TEXT` and `INSTANCE_SWAP` properties. Build its layers depth-first: create the layer, append it to its parent, stamp it, and only then set its fields. A slot is made with `createSlot()` and named for its property.
4. A layer's fields are set in this order: `layoutMode`; grid tracks; the layer's own cell in its parent grid; `layoutWrap`, `counterAxisAlignContent`, a cell alignment and `layoutPositioning`; for text, the text style, then `characters`; `resize` before any `HUG`; `layoutSizing*`; minimum and maximum sizes; alignment; spacing (`counterAxisSpacing` among them), padding, `cornerRadius` then each corner radius, opacity, `x`, `y` and `cornerSmoothing`; fills (a fill the file does not declare is cleared, since a new frame starts white); strokes, then `strokeWeight`, then the per-side weights with `strokeAlign` inside, then a declared `strokeAlign`; the effect style, `blendMode`, `strokeCap`, `strokeJoin`, `constraints` and `dashPattern`; `clipsContent`; for text, `textAutoResize`; `rotation`; `visible`; mode pins; and last the property references. A token is bound with `setBoundVariable`, a colour token through the paint `setBoundVariableForPaint` returns, given the colour the variable resolves to for that layer (Figma draws the colour a re-bound paint carries), and a literal colour is a paint with its alpha in `opacity`.
5. Combine the members with `combineAsVariants`, name the set, set its description, stamp it.
6. Lay the members out on the board (`memberBoard()` in `shared/components/diff.ts`): the `across` axes, or by default axes from the last until the columns are at least the rows, across; the rest down; each direction a mixed-radix count over its axes' declared values, an earlier axis the outer group; 40 px between neighbours, plus 40 px per nesting level of the outermost axis that changes between them; an excluded combination's cell empty; a column or row with no member taking no size but keeping its gap; the default member at the origin. Resize the set from the members' measured bounds. The set is placed on the page at the end of the run (`FINISH_COMPONENTS`). The board is laid out again on every run (`RELAYOUT`).
7. Set what a property can only take once it belongs to a set: a slot's description, preferred values and settings, and an instance swap's preferred values.

The root layer of a component file is the member's component itself: its fields are set on that node, and it takes the member's name, not its address.

#### Stamps

Every node Toghen creates carries one [stamp](#the-stamp): shared plugin data in the `toghen` namespace, under the key `stamp`. Shared rather than private, because the script an agent runs and the plugin are different plugins and both must read them. The snapshot finds a set with `findAllWithCriteria` (`stampedAs`), wherever a designer moved it.

| Node | `is` | `receipt` | `placed` |
|---|---|---|---|
| component set | `component`: the component's name in the file | one entry per property Toghen added (everything but the `VARIANT` axes, which Figma derives from the members' names): the hash of its definition as Figma reports it | where Toghen last put it |
| member | `member`: its combination, `Columns=grow share, Header in=content`; and `address`, since it is its root layer | its root layer's, as a layer's | |
| layer | `address`: its address in the file | one entry per field Toghen owns on it, by the names `fieldNames` gives (an instance's `set Name=…` as `set Name`): the hash of what Figma reports for it once the run's writes are done | |
| artboard frame | `artboard`: the artboard's name in the file; and `address`, as its root layer | as a layer's | where Toghen last put it |

`placed` is `{ "x": …, "y": … }`. A node still there (within 0.5 px) is Toghen's to restack; one elsewhere was moved by hand and is left.

**What a receipt hashes** (`main/components/receipt.ts`): `reportedOf(node, fields)` reads what Figma holds, and `expectedOf(layer, resolved, wiring)` what Figma would hold once the file's value is written, each as the same plain data. A field bound to a variable is `{ variable: id }` whatever its value; `cornerRadius` and `strokeWeight`, whose binding Figma reports on their parts only (the four corners, the four sides; the `parts` of the field table, read by `BOUND_BY_PARTS` in `main/utils/boundVariables.ts`), are `{ variable: id }` when every part is bound to that one variable, and `{ variable: null }` when only some are, or to different variables, which the file's value never leaves; a paint `{ variable }` when bound, else `{ color: [r, g, b], opacity }`; a field wired to a property `{ property: key, shows }`, the key the set holds it under and the value the layer shows, an instance's component `{ property }`; a text or effect style its id; `modes` the node's explicit modes by collection id; `grid` `{ row, column, rowSpan, columnSpan }`; tracks `{ type, value }`, `value` null for `HUG`; an instance's component its id, or its set's when it is a variant; `set Name` the instance's property value, a swap as its component's id, a property bound to a variable `{ variable }` (read from the instance's `boundVariables.componentProperties`); `visible` and `characters` bound to a variable `{ variable }`; anything else the value. Every number is taken as float32 (`Math.fround`) on both sides, since Figma keeps it so. A field whose lookup fails (a name only a dry run's `pending` promises) has no expected hash, and reads as moved.

Gradients, effects and layout grids read per part, since Figma reports their bindings on each part and lists a node's variables only once each: a gradient `{ type, stops: [{ position, color }], transform }`, each stop's colour `{ variable }` when bound, else `[r, g, b, a]`; an effect per effect, a shadow `{ type, color, offsetX, offsetY, radius, spread }` and a blur `{ type, radius }`, each part `{ variable }` when bound (a bound colour is its variable alone, since binding replaces its alpha); a layout grid `{ pattern, alignment, <the fields its alignment takes>, color }`. The expected side builds the object the writer would and reads it with the same function, the alias written where the writer binds. A paint or an effect of another kind reads `{ type }`. Every receipt stamped before reads as it did: no field that existed changed its reading, and a gradient was never a value Toghen wrote.

**Before the stamp**, a node carried up to six keys: `component` and `properties` (a JSON list of names) on a set, `member` on a member, `address` (`{ "address", "fields" }`, and on an artboard's layer a `digest`) on a layer, `artboard` on an artboard's frame, and `placed`. `stampOn` reads them as a stamp: the fields and properties they list are owned with an empty hash, which reads as never written, so the next run writes each of them, and its stamp is then written in the new form and the old keys deleted (`updateStamp`). An artboard's layer, whose `address` has a `digest`, has its fields owned with `UNPROVEN` (`'unproven'`) instead, a hash no report has: a field Figma holds the file's value in agrees and its receipt is taken, any other is drift, kept and reported. One way: nothing writes the old keys.

#### How a set is updated

The set is never deleted and rebuilt: that would change its key and break every instance of it in every file that uses it. So the difference between the file and the stamped nodes is applied, and the rest is left alone.

| In the set | The file says | What happens |
|---|---|---|
| a stamped member | it still has it | its layers are reconciled, below; the member keeps its node id and is named for its combination again |
| | it no longer has it | deleted, and reported as breaking its instances |
| no member | it has the combination | built with no properties of its own, appended to the set, and wired afterwards with the set's keys |
| a child with no member stamp | | left, reported |
| a stamped layer of the same kind | it has the layer | re-parented or re-ordered if the file moved it, given the file's address as its name, and each declared field compared twice with its receipt, below |
| a field in a layer's receipt | Figma reports something else, and what the file's value would report | agreement: nothing written or noted, the receipt taken again (`restamp`) |
| | Figma reports something else | drift, edited by hand since Toghen wrote it: kept, and noted (`LEAVE`, `drift`) until someone settles it; with `overwriteDrift` the file's value is written over it, said as an `OVERWRITE` warning |
| | the file's value would report something else | the file moved: written |
| | both match | skipped |
| a field not in a layer's receipt, or with no hash there | it declares it | written |
| a stamped layer of another kind | | replaced in place, what was inside it moved along, reported as breaking |
| a stamped layer | it no longer has it | deleted |
| a stamped member outside any set (a stray), on any page | | listed as breaking (`REMOVE_STRAY`), and removed at the end of the run only with `allowBreaking` |
| a person's copy of a member, a layer or a stray the run deletes, or of a node inside one | | its stamp removed once the deletion runs, and named on the deletion's row; from then on a node with no stamp |
| a node with no stamp | | left, reported |
| a person's copy of a set, a member, a layer or an artboard frame: its stamp names the id of a node that still has it as its own (see *The stamp*, *A copy carries the stamp*) | | left as it is, with everything in it, wherever it is, even where the file declares nothing at its address, and reported (`LEAVE`, `copy`); a copy of a member outside any set is not a stray, and is said at the end of the run |
| a stamped node whose stamp names another id, and no node of that id has it (cut and pasted) | | the original moved: reconciled as Toghen's, and patched (`PATCH_LAYER`) to write its stamp with its own id, if nothing else |
| two sets, or two artboard frames, stamped as one whose stamps are both their own (stamped before the stamp recorded an id) | | the run stops, naming both |
| a field in a layer's receipt | it no longer declares it | its value is left, reported once, and it leaves the receipt |
| a property in the set's receipt | it declares it, changed | edited; a changed type is a delete and an add, reported |
| | it no longer declares it | deleted, reported |
| a property in the set and not in its receipt | | left, reported. Never adopted by name, even when the file declares one of that name; a layer is wired to it all the same |

A layer's place is *after the previous layer the file names*, so a node Toghen does not own beside it does not make every run move it. A patched layer has only the fields in `fields` written, and what writing one resets: `cornerRadius` sets every corner and `strokeWeight` every side, so the corners and sides the file declares are written after it, and a resize resets hug sizing, so the declared sizing is written after one. An instance's properties are written before its fields, since a variant switch may resize it, and a patch that writes its properties writes the sizing the file declares for it again (`withResets`). Its property references are written as one from the set's current keys (a key is `Name#id`, matched by the name part) when a wired field is written, which is why the properties come first. The receipts are written last, once every step is in: a member's wired layers take the set's keys only when it joins the set.

#### The command line: `toghen-figma`

The package declares one command, `toghen-figma` (`cli/bin.mjs`, `cli/main.ts`). A dependent repository runs it with `pnpm exec toghen-figma …`, as an npm script. It replaces the earlier `toghen-components`.

```
toghen-figma variables <entry.json>… [--name <name>] [--overrides <map.json>] [--collection <name>] [--dry-run] [--allow-breaking] [--overwrite-drift] [--verbose] [--figcraft <port> | --figcraft-file <path.figcraft>]
toghen-figma components <file.component.kdl|file.artboard.kdl>… [--resolver <entry.json>] [--name <name>] [--overrides <map.json>] [--input <document>] [--page <name>] [--dry-run] [--allow-breaking] [--overwrite-drift] [--verbose] [--figcraft <port> | --figcraft-file <path.figcraft>]
toghen-figma sync <entry.json>… <file.component.kdl|file.artboard.kdl>… [--name <name>] [--overrides <map.json>] [--collection <name>] [--input <document>] [--page <name>] [--dry-run] [--allow-breaking] [--overwrite-drift] [--verbose] [--figcraft <port> | --figcraft-file <path.figcraft>]
toghen-figma check <entry.json>… <file.component.kdl|file.artboard.kdl>… [--name <name>] [--overrides <map.json>] [--input <document>]
toghen-figma members <entry.json>… <file.component.kdl|file.artboard.kdl>… [--name <name>] [--overrides <map.json>] [--input <document>]
toghen-figma lock <library name>
toghen-figma lock <library.figcraft> (--figcraft <port> | --figcraft-file <path.figcraft>) [--dry-run]
```

`variables`, `components` and `sync` also take `--library <library>`, and `components` and `sync` `--use <library>`, repeatable; the two do not go together.

**The entry.** Every positional argument ending in `.json` is the entry of the core's `load`, in the order given: one is a string (a resolver document or a token file), several a list of token files. The others are component and artboard files. `variables`, `sync`, `check` and `members` need an entry; `components` refuses one, taking its design system from `--resolver`. No entry is `no entry given: a resolver document or token files (.json)`.

| Command | What it does |
|---|---|
| `variables` | Loads the entry, pairs with the plugin, syncs the variables and then the styles |
| `components` | Reads each file from disk, pairs with the plugin, has the plugin check them, and runs each with `RUN_COMPONENT`. It assumes the variables and styles are in the file; names are checked by Figma when the engine resolves them, with the file's line. With `--resolver`, the document is loaded into the plugin first, to answer `(modifier)` axes and `tokens=`, and nothing is synced |
| `sync` | The whole run: all of the above, in order |
| `check` | Loads the entry with lib's `load` and builds the resolver from the document it returns, then reads each file in Node, with no plugin and no Figma file, and makes the check of step 3 below: each file's own problems, and every token and style it names held against the design system. The names are held against the sum the variable sync makes, built once after every file's `layout=parts` is read, whatever the order of the files: a token the parts fold into its rest's variable has no variable of its own, and is refused naming the one to use, `<file>:<line>:<column> token {chip.solid.hover.ink} is the "hover" part of "chip.solid.ink", which is one variable with a mode per "interaction": name {chip.solid.ink}; the member pins the mode (a tokens= axis, or modes interaction=hover)`. A part a modifier varies keeps its own variable and passes. Prints each problem and warning to standard error as `<file>:<line>:<column> <message>`, then `N files read: no errors` (or `N errors`, and `M warnings`) to standard output. Exit code 0 when no file has an error, 1 otherwise; warnings never change it. What only Figma knows, such as a variable that is ambiguous between collections, stays the dry run's |
| `lock` | No build. In Figma, pairs a plugin in the library file and one in the target, and copies the library's keys into the target's lock (`by: 'command line'`). In FigCraft, enables the `.figcraft` library in the target (the file shown, or the `--figcraft-file`), accepts its updates and writes the lock from the target's listing; `--dry-run` says what waits and writes nothing |
| `members` | Loads the entry and reads each file as `check` does, with no plugin, and prints to standard output one JSON array: per file, in the order given, `{ file, component, artboard?, members, problems }`, where `component` is the file's `Component` (absent when the file holds none), `members` its `Member[]` as the build would make them (none for a file with an error) and `problems` its `Problem[]`; the types are those of *Component files* (`shared/components/model.ts`). It does not hold names against the design system: that is `check`. Exit code 1 when a file has an error or cannot be read, 0 otherwise |

| Option | Meaning |
|---|---|
| `--name <name>` | `options.name` of `load`, and `name` of `LOAD_DOCUMENT`: the collection's name for token files, the name of their common folder when absent. A resolver document ignores it |
| `--overrides <map.json>` | A JSON object read from the file, `options.overrides` of `load` and `overrides` of `LOAD_DOCUMENT`: a `$ref` as written → the location to read instead. A file that is not one JSON object stops the run before it listens, `--overrides <file> must hold one JSON object: …` |
| `--collection <name>` | `collectionName` for both `PLAN_VARIABLE_SYNC` and `PLAN_STYLE_SYNC`: the base collection's name, the document's name when absent. The style plan is given the same name so its bindings find the variables the variable plan made. A second name makes a second copy of every base token, and a later component build then finds each name in two collections and stops |
| `--resolver <file>` | `components` only: the entry, loaded as the others are, that a component file's `(modifier)` axes and `tokens=` are answered from. `sync` and `variables` use their own. A file that needs one and gets none stops with a problem |
| `--page <name>` | `RunOptions.page` |
| `--input <document>` | `components`, `sync`, `check` and `members`: the resolver-like document an artboard file's `(input)` is answered from, bundled by lib's `load` and resolved at the default contexts, its tokens nested by path with each leaf its resolved `$value`. Sent only with artboard files; refused when none is among the files; a document that does not resolve stops the run before it waits for the plugin. See [artboard files](./component-files.md#artboard-files) |
| `--dry-run` | Plans every step and writes nothing. Each component's dry run is given the names and modes the plans would create as `RunOptions.pending`, and the sets the files before it would create as `pending.components`. Its `LOAD_DOCUMENT` carries `dryRun`, so an older build's root record is read in memory and left in the file |
| `--overwrite-drift` | `overwriteDrift` of `PLAN_VARIABLE_SYNC` and `PLAN_STYLE_SYNC` for `variables` and `sync`, and `RunOptions.overwriteDrift` for `components` and `sync`. Every drifted mode and style, and every component or artboard field edited by hand since Toghen wrote it, is written with the document's value |
| `--figcraft <port>` | `variables`, `components` and `sync`: run into the file FigCraft shows, through its control socket on `127.0.0.1:<port>`, instead of through the plugin: no pairing (step 2 below); see *Into FigCraft* below |
| `--figcraft-file <path.figcraft>` | `variables`, `components` and `sync`: run the same into a `.figcraft` file with no app, through a headless `figcraft-cli mcp`, and save it once the run has completed; see *Headless* below. A path not ending in `.figcraft` is refused; it does not go with `--figcraft` |
| `--library <library>` | `variables`, `components` and `sync`: build in the library file and write the target's lock (specs, *A run with a library*). In Figma, the library's name as Figma names it, and two plugins pair. With `--figcraft` or `--figcraft-file`, the library's `.figcraft` file: the run builds there, publishes and saves it, enables it in the target, accepts its updates and writes the lock; see *Libraries in FigCraft* below. A path not ending in `.figcraft` is refused, `--library takes the library's .figcraft file with --figcraft or --figcraft-file; got <path>`, and so is a share link, `--library <link> names a team library on a figcraft-server, which reaches outside this machine and is not built: name a .figcraft file` |
| `--use <library>` | `components` and `sync`, as often as needed: `RunOptions.libraries` for every file run, the libraries its names may come from through the lock. In Figma the library's name as the lock holds it; in FigCraft its `.figcraft` file, whose lock entry is the file's name without `.figcraft`. In FigCraft a real run first enables each in the target and writes its entry again from the target's listing (`by: 'command line'`), printing `Using <path>: the lock in "<target>" holds "<name>", N components · N styles · N variables.`, and a line when the library has updates the target has not accepted; a dry run does neither. Beside `--library`: `--use and --library do not go together: …` |
| `--verbose` | `variables`, `components` and `sync`: lists every skip of a plan, the unchanged ones too, as `unchanged: <path>`, with no list cut at ten; and every patch of a component set, `patch <member> <address>: <fields>`, a field whose receipt is only taken again marked `(restamp)` |
| `--allow-breaking` | `RunOptions.allowBreaking` for components, and `PLAN_VARIABLE_SYNC`'s `allowBreaking`. Without it a real run whose variable plan has a breaking step prints `Variable sync will not run: N step(s) would lose something in Figma, and nothing was written; pass --allow-breaking to take it`, writes nothing and exits 1 |

**Order of component steps.** Component files run first, then artboard files, whatever order they were given in, since an artboard instantiates what the components made. When more than one file is given, each runs after every file that defines a component it names by name (an instance's `component=`, an `INSTANCE_SWAP` default, a preferred value): `orderFiles` in `shared/components/order.ts`, over what `namesOfFiles` (`main/components/file.ts`) reads of each file. Ties keep the typed order, so only a file with a dependency moves; a name a `--use` library's lock entry holds is no dependency; an artboard defines nothing, so artboards stay last. A component named only by an instance's `set` value is not counted. Real runs and dry runs take this order, in Figma and in FigCraft. Files that name each other in a cycle stop the run after the check and before the variable plan, on standard error, exit code 1: `the component files name each other in a cycle, so none of them can be built first: a.component.kdl → b.component.kdl → a.component.kdl; nothing was written`.

A dry run passes each file the sets the files before it would create (a report holding a `CREATE_SET`) as `pending.components` (*`pending`*, above), so a first-ever dry run resolves an instance of a set the same run builds. A dry run lists an artboard's layers as created, patched, replaced, moved, removed or swapped.

A variable plan that stopped (its `WARNING` carries `stops: true`: the base collection built by an earlier sync, a modifier with no default) stops the whole run, a dry run included, with `Variable sync stopped, so nothing was written and no style or component was run.` and exit code 1.

**A run**, in this order, each step printing what it did:

1. **Read from disk.** The entry is loaded by lib's `load`, every path made absolute against the working directory, and each file it reads is kept with its text. Each component file is read as text. A file that cannot be read is the only problem the command finds itself: it stops, exit code 1, before it listens.
2. **Pair.** The command listens on `ws://localhost:3055` (loopback only) and waits for the plugin. If a code was kept by an earlier run it first waits `pairedWaitMs` (3 seconds) for the plugin paired with it, which reconnects by itself; if none comes it makes a new code, writes it to the file, prints it and waits without a limit. The command reports a taken port and stops, exit code 1.
3. **Check, with nothing written.** `LOAD_DOCUMENT` with the files the load read, by their absolute paths, the entry as absolute paths, and `name` and `overrides` when given; the plugin loads them again with the same `load`, so its screen shows the composition and the plugin's own collision rows, and adds the bundle to Recents. Each row of the answer's `report` is printed as `warning: <path> — <message>` or `note: <message>`. Then `CHECK_COMPONENTS` with every file's text and name. The plugin reads, evaluates and checks each file; for `sync` it also checks that every token and style a file names is in the loaded design system (in any mode, as the file writes it, `space.md`), and is not a part the fold took into its rest's variable (as `check` does). It also reads each component's set already in the Figma file, and names one Figma reports as broken. The command prints each problem to standard error as `<file>:<line>:<column> <message>`, and any problem stops it, exit code 1, before a sync writes anything.
4. **Variables.** `PLAN_VARIABLE_SYNC`, a summary line, `Variable plan: 3 creates · 0 updates · 239 skips (180 unchanged · 40 cannot be written · 19 unsupported type)`: the skips by cause, most frequent first, in the words of *A skip's cause*, then `modes`, `scopes`, `warnings` and `breaking` when not zero (`drifted` only beside a plan that gives no causes, since the causes count it). Then each warning, drifted path, breaking line, reported skip as `skipped: …` and note as `note: …`; then the other skips, cause by cause: `unchanged` is counted and not listed, and every other cause's rows are printed as `skipped: <reason>`, ten per cause, then `…and N more; --verbose lists them` (R12: the counts are whole, only the list is cut). Then `EXECUTE_VARIABLE_SYNC` and `Variable sync: N applied · N skipped`, with `· N failed` and `· N cancelled` when not zero; `skipped` counts skips, failed prerequisites and cancellations, not warnings, notes or breaking rows (*Operation summary*). A step with a failed operation stops the run, exit code 1.
5. **Styles.** The same with `PLAN_STYLE_SYNC` and `EXECUTE_STYLE_SYNC`.
6. **Each component file**, one at a time, in the order above, with `RUN_COMPONENT` carrying its text, name and options. The report is printed as steps, created, updated, deleted and breaking: `Chip: 4 steps · 0 created · 1 updated · 0 deleted`. A dry run of a set applies nothing, so it says `N would update`, the members a write step names (`CREATE_LAYER`, `REPLACE_LAYER`, `MOVE_LAYER`, `PATCH_LAYER`, `SWAP_COMPONENT`, `DELETE_LAYER`), and with `--verbose` one line per patch, `  patch <member> <address>: <fields>`. An artboard's dry run counts as its real run would, from its steps: `Page (dry run): 3 steps · 3 would create · 1 would update · 0 would delete`, the layers it would make (every layer of a new artboard, its frame included), patch or swap, and remove; then it prints its layers, one line each. Then a line each for `pending`, `breaking`, `warning` and `left`; a reader's warning is among them as `<file>:<line>:<column> warning: …`. A run the engine stopped prints `<file>: was not built: …` and every problem to standard error, and the run goes on to the next file with the exit code set to 1.
7. **The end of the run.** `FINISH_COMPONENTS`, once: strays removed when `--allow-breaking`, then the restack; a line each for what was removed, moved and noted. The check in step 3 lists the strays as `breaking:` lines, and stops the run without the flag.
8. **Exit.** The socket is closed with the normal code, and the plugin, which retries, finds the next run by itself. The exit code is 0 when every step succeeded and 1 when a check failed, Figma refused a step, or the plugin went away.

With `--dry-run`, steps 4 and 5 stop after the plan, and between 5 and 6 the command sends `GET_FIGMA_COLLECTIONS` and gives each component's dry run `pending` from `pendingNames` over both plans.

**Into FigCraft.** With `--figcraft <port>` the command connects to FigCraft's control socket (newline-delimited JSON, `{id, method, params}` answered by `{id, ok, result | error}`), prints `Writing into "<file>" in FigCraft on port <port>.`, and runs `LOAD_DOCUMENT` and steps 4 and 5 with the plugin's own handlers in its own process (`openFigcraft` in `cli/figcraft.ts`, a `Bridge` like the plugin's). A port with nothing listening stops it, exit code 1, with `Nothing answered on 127.0.0.1:<port>: … Start FigCraft with --control <port>.`

- **Reads.** A `figma` that offers only what the variable and style plans read: local collections and variables, from `variable.list`; local text, effect and paint styles by id and name, from `style.list`; the fonts, from `text.fonts`. `figmaView` in `cli/figcraftFile.ts` gives them Figma's shapes: types `COLOR`, `FLOAT`, `STRING`, `BOOLEAN`; an alias `{type: 'VARIABLE_ALIAS', id}`; a variable listed without scopes at `ALL_SCOPES`; the first mode the default; a style with the fields `reportOf` reads, from the value `style.list` gives it (below). Anything else the handlers ask for throws `The FigCraft target does not offer figma.<name>.` The document root's shared plugin data and client storage last the run; a variable's and a style's are its stamp, from the record (below).
- **Writes.** Each operation is `translate(op, held?)` in `cli/figcraftFile.ts`, run as one `command.batch` labelled with `labelForOperation(op)`:

| Operation | FigCraft commands |
|---|---|
| `CREATE_COLLECTION` | `variable.createCollection {name, modes}` |
| `ADD_MODE` · `DELETE_MODE` | `variable.addMode {collection, name}` · `variable.removeMode {collection, mode}`; the default mode is never removed |
| `CREATE_VARIABLE` | `variable.create {collection, name, type}`, then `variable.update {variable: {$step: 0}, scopes}` |
| `SET_VARIABLE_VALUE` | `variable.set {variable, mode, value}`: a colour as `{r, g, b, a}` in 0–1, an alias as `{alias: id}` |
| `RENAME_VARIABLE` · `SET_CODE_SYNTAX` · `SET_VARIABLE_SCOPES` | `variable.update` with `name`, `codeSyntax: {WEB}` or `scopes` |
| `DELETE_VARIABLE` | `variable.delete {variable}` |
| `CREATE_STYLE` | `style.create {type, name, value}`, then `style.bind {style, field, variable}` per binding |
| `UPDATE_STYLE` | `style.bind {style, field}` for each field FigCraft lists as bound, `style.update {style, value}`, then the bindings |
| `STAMP` | none: the stamp goes into the record |
| `BIND_VARIABLE` · `UNBIND_VARIABLE` · `APPLY_TOKEN` | refused: `Binding layers is not built for FigCraft yet` |

A text style's value is `{fontFamily, fontStyle, fontSize, lineHeight, letterSpacing, case, decoration}`: a length in `PIXELS` is a number, in `PERCENT` a string such as `"150%"`, `AUTO` is `"auto"`; case and decoration in lower case (`smallCaps`). An effect is `{type: dropShadow | innerShadow, color, offset: [x, y], radius, spread, visible, blend}`. A gradient is `{type: 'gradient', kind, stops: [{color, position}], from, to}`, where `from` and `to` are the ramp's ends in the layer: the inverse of Figma's `gradientTransform` applied to (0, ½) (to (½, ½) for a radial, angular or diamond gradient) and to (1, ½). A style binding's field is FigCraft's: a text style's `fontSize`, `lineHeight`, `letterSpacing`, `fontFamily`, `fontStyle` (a `fontWeight` binding is dropped), an effect's `effects/<index>/<field>`.

Read back, `style.list` gives a text style's value under `style` as `{font_family, font_style, font_size, line_height, letter_spacing, case, decoration}`, a length as `{unit: pixels | percent | auto, value}`; an effect style's `effects` with `offset: [x, y]` and `show_behind`; a paint style's `paints` with `from`, `to` and `width`, the third handle; and `bound`, the bound fields by FigCraft's name, each listing its variable's value. `figmaView` reads them as Figma reports a style: `fontName`, `lineHeight` and `letterSpacing` in Figma's units, case, decoration, effect types and blend modes in upper snake case (`smallCaps` is `SMALL_CAPS`), an effect's `offset` as `{x, y}`, a bound field as `{type: 'VARIABLE_ALIAS', id}` under `boundVariables` (an effect's on the effect), and a gradient's `gradientTransform` rebuilt from `from` and `to`, its square taken as a square, as Toghen writes it.

- **The file.** Each batch is `[doc.switch {index}, command.batch {steps}, doc.list]` with the window from `window.list` when FigCraft reports one. A tab that no longer holds the pinned file's name and path stops the run: that operation fails with `FigCraft no longer has "<file>" at the tab it was in …`, and every later one fails with the same message, unsent.
- **The stamps.** FigCraft's variables and styles hold no data, so their [stamps](#the-stamp) are kept in one record in the data of a page, `cli/figcraftRecord.ts`. The page is the one whose data holds the key `toghen`, whatever its name; the first run that writes a stamp, never a dry run, makes it, a divider named `-toghen` (a line in the pages list, never opened, so the page shown stays shown). The key holds JSON, `{"stamps": {"<object id>": {"of": string, "stamp": Stamp}}}`: `stamp` is the stamp `setStamp` writes, and `of` what it was written on, `variable <resolvedType> <collection id>` or `style <type>`. The record is read once when the run begins (`page.list`, then `node.get` on each page) and answered through each listed variable's and style's `getSharedPluginData`, `setSharedPluginData` and `getSharedPluginDataKeys` (`toghen`, `stamp` only). The executor stamps each write as it does in Figma, reading the object back through this `figma`. At its first read the run drops each entry whose object is gone or whose `of` no longer matches, since FigCraft gives a new object the highest id in use plus one; a `DELETE_VARIABLE` drops its entry at once. The record is written back when the run closes, as one undo step labelled `Toghen stamps` (`node.set {ids: [page], props: {pluginData: {toghen}}}`), only if the run stamped anything; a run that fails partway writes it too. A record that cannot be written is said on the error output: `The stamps were not written into FigCraft: …`.

- **Components and artboards.** `CHECK_COMPONENTS`, `RUN_COMPONENT` and `FINISH_COMPONENTS` run the plugin's own handlers too. Before each, the target reads the pinned file's layers: `page.list`, then `node.get {id}` a level at a time, since `node.get` lists a layer's children one level down whatever depth it is asked for (measured). `sceneOf` in `cli/figcraftScene.ts` gives them as Figma nodes, which `figma.root.children`, `figma.currentPage` and `figma.getNodeByIdAsync` answer:

| Figma | FigCraft's `node.get` |
|---|---|
| `layoutMode`, `itemSpacing`, `counterAxisSpacing`, `padding…`, `primaryAxisAlignItems`, `counterAxisAlignItems`, `layoutWrap` | `layout: {mode, gap, crossGap, padding: [t, r, b, l], mainAlign, crossAlign, wrap}` |
| `layoutSizingHorizontal` · `Vertical`, `layoutPositioning` | `sizing: {horizontal, vertical}` in upper case, `absolute` |
| `cornerRadius` and the corners, `strokeWeight` and the sides | `cornerRadius` (a number or four), `strokeWeight`, `strokeSides: [t, r, b, l]` |
| `fills`, `strokes` | a hex colour as `{r, g, b}` and the paint's opacity, times the colour's alpha unless the paint is bound (FigCraft paints a bound colour with the variable's value in the layer's mode, alpha in the colour, at paint opacity 1); a paint's variable from `fills/<i>/color` (or `fill` for the first) in `boundVariables` |
| `boundVariables` | the flat map, `gap` as `itemSpacing`, `crossGap` as `counterAxisSpacing`, `cornerRadius` and `strokeWeight` as their parts, a text field as a range (`[alias]`), `componentProperties/<name>` under `componentProperties` |
| a text's fields, `textStyleId`, `effectStyleId` | `characters`, `fontFamily` and `fontStyle` as `fontName`, a length `"Auto"`, `"150%"` or pixels as `{unit, value}`, enums in upper case; `styles.text`, `styles.effect` |
| an instance's main and `componentProperties` | `mainComponent`, and `componentProperties: {name: value}` typed from the main's definitions, a variant from its name |
| a set's `componentPropertyDefinitions`, `defaultVariant` | its first member's `componentPropertyDefinitions` keyed by name, the variant axes from the members' names; the member in the top-left corner. Two members of one combination, or a name that is not one beside others, throw Figma's `Component set "…" has existing errors` |
| shared plugin data | the layer's data, `<namespace>.<key>` (`toghen.stamp`); left out inside an instance, and on an instance stamped as a member |
| gradient paints, `effects`, `layoutGrids` | a gradient `{type: "gradient", kind, stops: [{color, position}], from, to}` as Figma's `GRADIENT_<KIND>` with its transform from the ramp's ends; `effects` (`dropShadow`, `innerShadow`, `layerBlur`) and `grids` (`kind`, `align`, `count`, `gutter`, `offset`, `size`, `color`) in Figma's shapes, each part's variable from `fills/<i>/stops/<j>/color`, `effects/<i>/<part>`, `layoutGrids/<i>/<count \| gutter \| offset \| size>` |
| grid layout, wrap | `layout.columnTracks` · `rowTracks` (`{sizing: fixed \| fill \| hug, value}`) as `FIXED` · `FLEX` · `HUG`; `gap` and `crossGap` in a grid as `gridColumnGap` and `gridRowGap`; `gridCell: {row, column, rowSpan, columnSpan, alignH, alignV}` as the anchor, the spans and `gridChild…Align`; `layout.contentAlign` as `counterAxisAlignContent` |
| `dashPattern`, `strokeJoin`, `constraints`, `blendMode` | `dashes`, `strokeJoin`, `constraints` (`left` `right` `leftRight` `center` `scale`, `top` `bottom` `topBottom`), `blend` (`pass through`, `plusDarker`, `plusLighter`, else camel case) and a line's `strokeCap` (`lineArrow`, `triangleArrow`, else camel case; `TRIANGLE_FILLED` has no match and is refused), each as Figma spells it |
| a slot | a frame with `slot: "<name>"` as a `SLOT`, in a main and in its instances; a definition `{type: "slot"}` as `SLOT`, its `preferred` ids as Figma's preferred values, each by the key the view gives that component or set; what fills an instance's slot is the instance's own, its layer data read as its own |
| `componentPropertyReferences`, `explicitVariableModes`, and the fields FigCraft takes and does not report | `toghen.unreported`, written by the apply: `{references?: {visible \| characters \| mainComponent: property}, modes?: {collection id: mode id}, fields?: {field: value as Figma holds it}}` on a layer, `{slots?: {name: {description?, slotSettings?}}}` on a set. `fields` holds `blendMode`, `cornerSmoothing`, `strokeCap`, `maxLines`, `paragraphSpacing`, `paragraphIndent`, `constraints` and `isExposedInstance` (`UNREPORTED_FIELDS` in `cli/figcraftApply.ts`), each read back from there wherever `node.get` reports nothing |

  The run hands its steps to the component writer (`writeComponentsWith`, `main/components/run.ts`), `figcraftWriter` in `cli/figcraftApply.ts`. Before the plan is reported or written, `refuses` lists what the writer does not build, and the run stops with `will not build "<component>": nothing was written` and one line each (`"<component>" <address>: the field <name> is not built in FigCraft yet`; `… textTruncation is not built in FigCraft, whose truncation is a text's sizing …`; `the preferred values of "<property>" name Figma's published keys, which FigCraft does not hold; name the components with name=`, for `key=` only; `a component named by a Figma key is not built in FigCraft, whose keys are <library id>:<asset id>; name the component, and declare its library with --use`).. Each step is one batch, `page.select` first:

| Step | FigCraft commands |
|---|---|
| `CREATE_SET` | per member `frame.create {name}`, its fields, its layers (`frame.create`, `text.create`, `node.create {type: "line"}`, `instance.create {component, parent}`, each named and given its fields, an instance its properties before them; an instance emptied of the `toghen.stamp` and `toghen.unreported` it copies from its main), `component.create`, `component.makeSlot {id, name}` per `SLOT` layer; then `component.combineVariants`, each member named again (combining names one without `=` `Property 1=Default`), the set named, `component.addProperty` per property, `component.bindProperty` per wired layer |
| `CREATE_ARTBOARD` | the frame and its layers as above; then, as a second batch, what fills the new instances' slots, each layer made with the instance's slot layer as its parent |
| `ADD_PROPERTY` · `EDIT_PROPERTY` · `DELETE_PROPERTY` · `RENAME_AXIS` | `component.addProperty` · `component.editProperty {default}` · `component.deleteProperty` · `component.editProperty {name, newName}` |
| `CREATE_MEMBER` | every new member built as above, then `node.reparent` into the set, then wired |
| `CREATE_LAYER` · `REPLACE_LAYER` · `MOVE_LAYER` | the layer made, then `node.reorder`; a replacement then deletes the old one · `node.reparent {parent, index}` |
| `PATCH_LAYER` · `SWAP_COMPONENT` | `instance.swap` for a swap, an instance's properties, then the fields the patch writes, then its name again |
| `DELETE_MEMBER` · `DELETE_LAYER` | `edit.delete` |

  A field: a plain value by `node.set` (`layout`, `gap`, `crossGap`, `sizingH`, `mainAlign`, `clip`, `textAlign`…, in FigCraft's spelling); a token bound by `variable.bind` (a paint as a stand-in black, then `fills/<i>/color`; a token's alpha below 1 as the paint's opacity). A field FigCraft keeps as one value with parts (the four corners, the four sides, a paint list, `effects`, `grids`) is written whole first and its parts bound after, since a value written to it lets every part's variable go: a layer with a corner of its own writes the four corners as a list and binds each corner, never `cornerRadius`, one with a side of its own does the same with the sides and `strokeWeight` (a side written lets a bound `strokeWeight` go too), and a patch to a corner or a side writes again every corner or side the file declares; a text style or an effect style by `style.apply`; a mode by `variable.setMode`, a mode of a `--use` library's collection by `library.setVariableMode {library, collection, mode, ids}`, which copies the collection in (linked, read-only) and checks the mode's name, recorded under `toghen.unreported` as `library:<library>/<collection>` so a second run compares it and writes nothing; a wired field by its default and `component.bindProperty`, a field taken off its property by `component.bindProperty {property: null}`; an instance's properties by `instance.setProperties`, a token's by `variable.bind {field: componentProperties/<name>}`. The receipts, the layout of the members (`placeMembers`) and the set's receipt are written last, through the view, as one batch labelled `Toghen stamps`.

**Headless.** With `--figcraft-file <path.figcraft>` the command starts `figcraft-cli mcp` (no `--attach`) as a child process: the binary named by `FIGCRAFT_CLI`, else `figcraft-cli` on the PATH, with this process's environment. It speaks MCP's newline-delimited JSON-RPC 2.0 over the child's stdio (`headless` in `cli/figcraft.ts`, a `Control` like the socket's), and everything after the connection is *Into FigCraft* above, unchanged.

- **Start.** `initialize` with protocol `2025-06-18`. The answer's `serverInfo.version` must be `0.8.0` or later, else the run stops, exit code 1, before anything is opened: `<cli> is <version>: a headless run needs figcraft-cli 0.8.0 or later, whose node.get reports the layer data that holds Toghen's stamps.` A binary that does not start stops it with `<cli> was not found: put figcraft-cli on the PATH, or name it with FIGCRAFT_CLI.` Then `notifications/initialized`, and `open_file {path}` with the path made absolute against the working directory, when a file is there; when none is, the session's untitled file is written and the save names it. The command prints `Writing into <path> headless, with figcraft-cli <version>.`
- **Requests.** `engine.execute {command, params}` goes as `tools/call run_command {command, params}`. The tool's text is the command's result as JSON; `isError: true` is a refusal, as the socket's `ok: false`, with its text as the message. Any other method (`window.list`) is refused in the command line: there is no window, so the pin names none.
- **Save.** Once every step succeeded, and never in a dry run: the stamps are written (*The stamps*), then `save_file {path}`, and the command prints `Saved <path>.` A run that stopped partway saves nothing and says `<path> was not saved: the run did not complete.`; the file on disk is as it was. A save that fails (a folder that does not exist) is the run's error, exit code 1.
- **Fonts.** The child sees the machine's fonts, as the app does. `FIGCRAFT_NO_SYSTEM_FONTS=1` in the environment reaches it and narrows them to FigCraft's own; `text.fonts` lists what is left, and the style plan reads that.

**Libraries in FigCraft.** With `--library <library.figcraft>` beside `--figcraft` or `--figcraft-file`:

- **Two files over one connection.** The target is pinned as above. The library is pinned by its path (`pinPath`): its tab when open, else `file.open` (headless: `open_file`, a second document in the same session). A file that does not exist is `file.new`, named after it, with no path until the run saves it. Each pinned file has its own bridge (`bridgeOn`); each request makes its own `figma` and writers the global ones. The command prints `Building the library <path>, in "<tab>".`, or `…, a new file.` A target that is the library stops the run, `The target is the library <path> itself: show, or name, the file that uses it.`
- **Then, after the build completed:** the library's record is written, then `library.publish` in a batch labelled `Publish library`, then `file.save {path}` in a batch of its own: `Published the library <path> as version N, and saved it.` In the target, `library.add {path}` (`Enable library`), `library.updates`, and `library.acceptUpdates {ids: [the library's id]}` (`Accept library updates`) when that library has any: `Enabled <path> in "<target>", and accepted N updates from it.` or `…, with no update to accept.` Then `LOCK_WRITE` with the entry from the target's `library.list {assets: true}`: `The lock in "<target>" holds "<name>" (<path>), written by the build: N components · N styles · N variables.` Headless, the target is saved after that.
- **A build that did not complete:** `The library was not published and the lock in the target was not written: the build in the library did not complete.` Nothing is published, saved or enabled.
- **A dry run** publishes, saves, enables and accepts nothing, and writes no lock. It prints `Dry run: <path> is not enabled in "<target>"; a run would enable it.`, or the updates waiting there, then `Dry run: the library was not published or saved, and the lock in the target was not written.` A file it made is closed (`file.close {force: true}`).
- **Resolving through a library** (`--use`). `figma.importComponentByKeyAsync` and `importComponentSetByKeyAsync` run `library.import {library, component: <asset id>}` in a batch labelled `Import library component`. The copy is read with `node.get` by id, with what is in it, and is viewed outside every page as a remote main whose `key` is the one imported. `figma.variables.importVariableByKeyAsync` runs `library.importVariable` (`Import library variable`) and answers the copy from `variable.list`. `figma.importStyleByKeyAsync` answers the copy from `style.list`, or, before it exists, from the library's listing, with the copy's id `<library id>:S:n`. The writer applies such a style with `library.applyStyle {library, style: <asset id>, ids}`. A key not in FigCraft's form is `… with key "<key>" not found: a FigCraft key is <library id>:<asset id>, and a Figma key names nothing in FigCraft`.
- **The record** on the divider holds, beside `stamps`, `root` (the root's shared plugin data, by `<namespace>/<key>`, which holds the lock) and `copies` (a copy's id → the key it was imported by). Both are read when a run begins and written when it ends; an old record reads as holding neither.
- **A new member of a set that exists** is made whole, given each of the set's properties (`component.addProperty {id: <the member>}`), wired, moved off the set's top-left corner, then `node.reparent`ed after the members there, all in the batch `Add members to <component>`.

**Pairing** is described under *Running from the command line* above. The code is eight characters from an alphabet without look-alikes, written `XXXX-XXXX`. It is kept in `~/.toghen/figma-pairing` (directory `0700`, file `0600`), and the plugin keeps it only in memory, so closing the plugin ends the pairing: the next run finds nobody with the old code and makes a new one.

#### No printed scripts

The command prints no standalone Plugin API script per component and stores no engine in the Figma file: a component reaches Figma only through the plugin, which holds the reader, kdlet's evaluator and the engine. `--print`, `--stored`, `--out` and `--engine` are unknown options. A file holding an engine from an older version keeps it, unread. Why, and what the scripts cost, is in [specs.md](./specs.md#one-runtime-the-plugin).

The report goes over the socket as a `CompactReport`: the `Report` with each step reduced to a `StepSummary`, `{ kind, member?, address?, property?, from?, to?, changes?, members?, message?, breaks? }` (both in `shared/components/steps.ts`), which is what the result surface's rows read.

#### The snapshot

`takeSnapshot(componentName)` in `main/components/snapshot.ts` returns plain data: the stamped set (its id, its properties as Figma holds them, the names its receipt lists, its members with their layers by address, each with its receipt and the hash of what Figma reports now for every field with a hash in it, and the nodes inside that carry no stamp) and the sets of the same name that carry none. It searches each page after loading it with `page.loadAsync()`, never the document as a whole (see *What it resolves*). Two sets stamped for one component stop the run rather than being told apart by a guess. The types, `Snapshot` and its parts, are in `shared/components/diff.ts`.
