import type { LoadResult } from '@toghen/lib';
import type { CompactReport, RunOptions } from './components/steps.js';
import type { BlueprintTokens } from './components/blueprint.js';
import type { Operation, OperationSummary, SkipCounts } from './operations.js';

export type QueryScope = 'selection' | 'page' | 'file';
/** `load` is no plan: it is the rows a load reports (its collisions, the overrides map's unused keys), in a plan's shape so the result surface draws them. Nothing executes it. */
export type PlanType = 'variable_sync' | 'style_sync' | 'scaffold' | 'apply_bindings' | 'load' | 'discovery' | 'apply' | 'relink';

/** The layers Apply writes: frames (`FRAME`, `SLOT`), instances (`INSTANCE`: the write is an override), component definitions (`COMPONENT`, set members included). */
export type ApplyKind = 'frames' | 'instances' | 'components';

/** One shape, used twice: files in Load, Figma objects in Build. A name as written → what to use instead. */
export type Overrides = Record<string, string>;

/** What a load read, and how: the standing picture of where the document came from. */
export interface Composition {
  /** A resolver document, or token files wrapped in one. */
  form: 'resolver' | 'tokens';
  /** As the load was given it: one path, or several in order. */
  entry: string | string[];
  /** Every reference whose resolution read a file: the `$ref` as written, its holder, the file read, and whether the map sent it there. */
  reads: LoadResult['reads'];
  /** Present only when a map was given: the map, its hash, and the keys no reference matched. */
  overrides?: { map: Overrides; hash: string; unused: string[] };
  /** Loaded again from a recent's stored bundle, not from the files: `reads` are those of the load that stored it. */
  fromBundle?: true;
}

export type ErrorCode =
  | 'INVALID_DOCUMENT'
  | 'INVALID_CONVENTIONS'
  | 'NO_RESOLVER'
  | 'NO_PLAN'
  | 'FIGMA_API_ERROR'
  | 'COMPONENT_RUN_FAILED'
  | 'INVALID_TEMPLATE'
  | 'INVALID_PICK'
  | 'OPERATION_CANCELLED'
  /** Apply's query names nothing it can write: no token or group, or a field for a group. */
  | 'INVALID_QUERY';

export interface ProgressPayload {
  completed: number;
  total: number;
  currentLabel: string;
}

export interface ErrorPayload {
  message: string;
  code: ErrorCode;
  commandType: string;
  /** Every reason, one per entry, when `code` is `COMPONENT_RUN_FAILED` or `INVALID_TEMPLATE`. */
  problems?: string[];
}

export interface DocumentStatePayload {
  /**
   * Whether there is a document at all.
   *
   * `GET_DOCUMENT_STATE` answers even when nothing is loaded, and the UI read
   * any `DOCUMENT_STATE` as proof of a document — so opening the plugin into an
   * empty session showed the loaded pane, named "Untitled", with zero tokens
   * and live buttons. The question has to be answerable rather than inferred
   * from a placeholder name.
   */
  loaded: boolean;
  name: string;
  /** The document's own `description`, which the Resolver spec allows at root. */
  description?: string;
  tokenCount: number;
  modifiers: Record<string, string[]>;
  /** The sum's modes: the defaults, then each other context on its own. Never the product of every combination. */
  modes: string[];
  /** The default context of each modifier, which export preselects: one context per modifier is chosen, and the choice is shown (R10). */
  modifierDefaults: Record<string, string>;
  /** The mode the document resolves to when no context is chosen: the first of `modes`. */
  defaultMode: string;
  /** The version the system declares for itself (`Resolver.getDeclaredVersion()`), if any. */
  version?: string;
  /** The file the document was read from, when the load named one. */
  fileName?: string;
  /** What the load read and how. Present whenever `loaded` is. */
  composition?: Composition;
  /** Tokens the conversion map sends to a Figma style rather than a variable. */
  styleCount: number;
  /**
   * The collections a variable sync builds: the base first, then one per
   * modifier, then one per folded part axis, each with its modes and how many variables would live in it.
   * Absent when the sum cannot be built; the plan is what says why.
   */
  collections?: DocumentCollectionSummary[];
}

export interface DocumentCollectionSummary {
  name: string;
  /** The modifier it stands for; absent for the base collection. */
  modifier?: string;
  /** Set for the collection of a folded part axis, named after the axis. */
  axis?: true;
  modes: string[];
  variableCount: number;
}

/**
 * One entry in the recents list — what the UI draws, without the document.
 *
 * A filename says nothing: `toghen.resolver.json` is what every one of them is
 * called. The design system's own name and version are what tell two of them
 * apart.
 */
export interface RecentDocumentSummary {
  /**
   * Identity, for replacing an entry rather than growing a second one.
   *
   * The document's `name`, falling back to the filename when it declares none.
   * Loading an edited document is a normal working loop, not a new system.
   */
  key: string;
  name: string;
  /**
   * The version the design system declares for itself, if it declares one.
   *
   * **Not** the document's `version` field, which the Resolver spec fixes at
   * `"2025-11-01"` and reserves for breaking changes to the format — identical
   * in every conforming document, and useless for telling two apart. This comes
   * from `$extensions` on a set or modifier, the only places §4.3 allows them.
   * See `Resolver.getDeclaredVersion()`.
   */
  version?: string;
  description?: string;
  tokenCount: number;
  /** Mode names, so the shape of the system is visible without loading it. */
  modes: string[];
  /** Modifier names. Absent in entries kept before they were stored. */
  modifiers?: string[];
  /** The file it came from, kept only as a fallback label. */
  fileName?: string;
  /** ISO timestamp of the load this entry records. */
  loadedAt: string;
}

/**
 * What the **Figma file** records about having been synced — as opposed to
 * `DocumentStatePayload`, which describes the JSON the user loaded.
 *
 * Kept apart from document state for three reasons: it is meaningful with no
 * document loaded at all (a file synced last week still has an answer), it
 * changes at different moments (after every execute, not on load), and folding
 * it in would make every `GET_DOCUMENT_STATE` read every variable's and style's
 * stamp.
 */
export interface SyncStatePayload {
  /** Some variable or style in this Figma file carries a Toghen stamp. */
  hasRecord: boolean;
  /**
   * Variables and styles stamped for a token, including tokens the loaded
   * document does not have. Those belong to some other document synced into the
   * same file — the gap between this and `coveredCount` is information, not an
   * error.
   */
  recordedCount: number;

  /** Null when no document is loaded — there is nothing to measure against. */
  documentTokenCount: number | null;
  /** Document tokens stamped in every mode they hold a value for. */
  coveredCount: number | null;
  /** Document tokens covered in some of their modes but not all. */
  partialCount: number | null;
  /**
   * Whose stamps they are: the leading segment of every token they name, each
   * once. A lookup path starts with the document's name, so this names the
   * documents that were synced into the file, answerable with none loaded.
   */
  recordNames: string[];
}

/**
 * Where one token stands between the document and this Figma file.
 *
 * Every name here describes a **condition**, not an intention. `outdated` says
 * the document has changed since the token was last written; it does not say
 * what a sync would do about it. The plan is the only thing that speaks in the
 * future tense, and two regions of one screen each predicting it is how they
 * come to disagree (smell #22).
 *
 * - `current` — Figma holds the document's value in every mode it declares.
 * - `drifted` — they differ, and the variable's stamp proves *Figma* moved
 *   since Toghen wrote it, so the change was made in Figma, whether or not the
 *   document moved too.
 * - `outdated` — they differ, and Figma still holds what Toghen wrote: the
 *   *document* has moved.
 * - `absent` — no Figma variable holds this token.
 * - `adopted` — a variable of this name and type exists that Toghen did not
 *   write. Syncing writes into an object with a history nothing here records.
 * - `blocked` — the link cannot exist: a type that varies by mode, a type no
 *   variable can hold, or a name taken by a variable of the wrong type.
 * - `not_inspected` — backed by a Figma style, which this round does not
 *   compare. Shown rather than omitted, so the counts still reconcile.
 */
export type CorrespondenceState = 'current' | 'drifted' | 'outdated' | 'absent' | 'adopted' | 'blocked' | 'not_inspected';

/** One mode's row inside an opened token. */
export interface ModeReport {
  mode: string;
  /** False when the document declares no value for this token in this mode. */
  present: boolean;
  /** Both sides are rendered from Figma's representation, so they compare. */
  documentValue: string | null;
  figmaValue: string | null;
  /** Null when there is nothing to compare against — not the same as "differs". */
  agrees: boolean | null;
}

export interface TokenReport {
  path: string;
  /** The document's `$type`, or null when the modes disagree about it. */
  type: string | null;
  state: CorrespondenceState;
  note?: string;
  variableName?: string;
  modes: ModeReport[];
}

/**
 * A picture of where every token stands, as of the moment it was taken.
 *
 * `checkedAt` is not decoration. Figma can change under the plugin with no event
 * this codebase watches, so the picture is only true for the instant it was
 * made — and a standing claim with no timestamp is exactly the badge that was
 * caught lying in smell #22.
 */
export interface InspectionPayload {
  checkedAt: string;
  collectionName: string;
  tokens: TokenReport[];
  counts: Record<CorrespondenceState, number>;
}

/** One token of the document, as the Tokens pane's browser needs it. See `reference.md`, *The token graph*. */
export interface TokenGraphEntry {
  path: string;
  type: string | null;
  /** The path without its last segment. */
  group: string;
  /** Per mode of the sum, written for reading; null where the mode has no value. */
  valueByMode: Record<string, string | null>;
  /** Lookup paths this token's value points to, in any mode; the first hop. */
  references: string[];
  /** Lookup paths whose values point to this token. */
  referencedBy: string[];
  /** The CSS custom property lib names it by. */
  codeSyntax: string;
}

export interface TokenGraphPayload {
  /** The modes `valueByMode` is keyed by, the default first. */
  modes: string[];
  tokens: TokenGraphEntry[];
}

export interface PlanPayload {
  planType: PlanType;
  operations: Operation[];
  summary?: PlanCounts;
}

/** A plan's counts, by the names each plan gives them. The variable and style plans add `skipsByCause`, whose sum is their `skips`. */
export interface PlanCounts {
  [count: string]: number | SkipCounts | undefined;
  skipsByCause?: SkipCounts;
}

export interface SelectionPayload {
  ids: string[];
  names: string[];
  count: number;
}

export interface AuditResultPayload {
  nodes: unknown[];
}

/** One bindable property of one layer. See `reference.md`, *What the selection is bound to*. */
export interface PropertyBinding {
  property: string;
  bound: { variableName: string; tokenPath: string | null } | null;
  literal: string | null;
  suggestion: string | null;
  declaredBy: string | null;
}

/**
 * One field of the field table on one layer: the variable it is bound to (on a paint, the first bound paint's), or the
 * style it takes (`textStyle`, `effectStyle`), by name, with the token its stamp names; `null` when it is plain.
 */
export interface FieldBinding {
  field: string;
  bound: { name: string; tokenPath: string | null } | null;
  /**
   * What a plain field holds, written for reading (a number, a string, a solid first paint as hex), `null` where it is
   * no one value; absent on a bound field and a style field. A value Apply wrote is plain too: no stamp records it.
   */
  holds?: string | null;
}

export interface SelectionBindingsPayload {
  scope: QueryScope;
  readAt: string;
  nodes: Array<{
    id: string;
    name: string;
    kind: string;
    builtFrom: { template: string; fileName: string; kept: string } | null;
    properties: PropertyBinding[];
    /** A row for every field the field table lists, with a token column, for the layer's kind (`applyKindOf`): bound, or plain. */
    fields: FieldBinding[];
  }>;
  /** Layers in scope past the most one answer carries. */
  more?: number;
}

export interface BoundLayersPayload {
  variableName: string;
  ids: string[];
  pageName: string;
}

export interface TemplateSummary {
  name: string;
  fileName: string;
  kept: string;
  characters: number;
  members: number;
  axes: Array<{ name: string; values: string[] }>;
  properties: Array<{ name: string; type: string }>;
  tokenGroups: string[];
  builtInto: { page: string; setId: string } | null;
  /** Always null for now: nothing compares a set with its file. */
  differs: boolean | null;
  problems: string[];
  /** A blueprint's needs, as it declares them, before anything looked them up (`LOOK_UP_NEEDS`). Absent for a component file. */
  needs?: {
    tokens?: BlueprintTokens;
    libraries: string[];
    /** Each component the bodies name, by name or as `(key)"…"`; `satisfied` when a body of the blueprint defines it. */
    components: Array<{ name: string; satisfied: boolean }>;
  };
}

/**
 * What a look found of one kept blueprint's needs (`LOOK_UP_NEEDS`): a standing picture, dated, drawn in the Build pane.
 * Found by the locator's dry pass, which imports nothing. See `reference.md`, *The Build pane's look*.
 */
export interface NeedsPayload {
  /** The blueprint, by the name it is kept under. */
  name: string;
  lookedAt: string;
  /** Held against what Load loaded: the entry's file names, and whether a map was loaded with it. */
  tokens?: BlueprintTokens & { state: 'loaded' | 'differs' | 'not loaded'; detail?: string };
  libraries: Array<{ name: string; state: 'in the lock' | 'missing'; by?: LockedLibrary['by']; readAs?: string }>;
  components: Array<{
    name: string;
    /** `would swap`: found, and a build would swap a stamped instance to it (a relink). `by key`: a key, not checked without importing it. */
    state: 'satisfied' | 'found' | 'from a library' | 'by key' | 'would swap' | 'missing' | 'problem';
    /** The declared library it comes from, when it does. */
    library?: string;
    detail?: string;
  }>;
  /** What the look could not answer: a body whose dry pass stopped, so its swaps are not known. */
  notes: string[];
}

export interface TemplatesPayload {
  lookedAt: string;
  templates: TemplateSummary[];
}

export interface FigmaCollectionPayload {
  id: string;
  name: string;
  modes: Array<{ modeId: string; name: string }>;
  /** How many local variables the collection holds. */
  variableCount: number;
}

/** The lock: what each name a file uses from a library resolved to. See `reference.md`, *The lock*. */
export interface Lock {
  /** Keyed by the library's name, as Figma names it. */
  libraries: Record<string, LockedLibrary>;
  /** Build's map: a name as written → the name to use instead, or a key written `(key)"…"`. */
  overrides?: Overrides;
}

export interface LockedLibrary {
  /** The library file's key, only where a run could read it; never guessed. */
  fileKey?: string;
  /** FigCraft: the library's `.figcraft` file, where the run last found it, and the id the file keeps, which a move keeps. */
  path?: string;
  id?: string;
  /** Who wrote the entry last. */
  by: 'discovery' | 'build' | 'command line' | 'person';
  /** A component's name as files write it → its key, and whether the key is a component set's. */
  components: Record<string, { key: string; set: boolean }>;
  /** A token path → the key of the style it names. */
  styles: Record<string, { key: string; kind: 'TEXT' | 'EFFECT' | 'PAINT' }>;
  /** `<collection>/<variable name>` → the variable's key. */
  variables: Record<string, string>;
}

/** What `getPublishStatusAsync()` answers for a local component, style or variable. */
export type PublishState = 'UNPUBLISHED' | 'CURRENT' | 'CHANGED';

/**
 * What a library file says of its own keys (`LIBRARY_KEYS`), each with its publish status: the lock's entry for it,
 * before the command line picks who wrote it. See `reference.md`, *The lock*.
 */
export interface LibraryKeys {
  /** `figma.fileKey`, where it reads: a private plugin, or a development one with `enablePrivatePluginApi`. */
  fileKey?: string;
  /** Each component set a stamp names (and a component outside a set, if a stamp names one), by the name files write. */
  components: Record<string, { key: string; set: boolean; status: PublishState }>;
  /** Each text, effect and paint style the style sync stamped, by the token path its name spells. */
  styles: Record<string, { key: string; kind: 'TEXT' | 'EFFECT' | 'PAINT'; status: PublishState | undefined }>;
  /** Every local variable, by `<collection>/<variable name>`. */
  variables: Record<string, { key: string; status: PublishState }>;
  /** Lines for the run's report: what the library file could not say (a style's publish status, where Figma gave none). */
  warnings?: string[];
}

export type Command =
  /** With `dryRun`, for a run that writes nothing: an older build's root record is turned into stamps in memory only. */
  | {
      type: 'LOAD_DOCUMENT';
      payload: {
        /** Every file picked, by its path relative to the pick. The core reads only these. */
        files: { path: string; text: string }[];
        /** A resolver document, one token file, or several token files in order (the last wins). */
        entry: string | string[];
        /** Token files only: the collection's name. */
        name?: string;
        /** A `$ref` as written → the location to read instead. */
        overrides?: Overrides;
        dryRun?: boolean;
      };
    }
  | { type: 'GET_RECENTS'; payload: Record<string, never> }
  /** Load a document the user loaded before, from its stored copy. */
  | { type: 'LOAD_RECENT'; payload: { key: string } }
  | { type: 'FORGET_RECENT'; payload: { key: string } }
  | { type: 'EXPORT_DOCUMENT'; payload: { includeExtensions: boolean; contexts?: Record<string, string> } }
  | { type: 'GET_DOCUMENT_STATE'; payload: Record<string, never> }
  | { type: 'GET_SYNC_STATE'; payload: Record<string, never> }
  /**
   * Read Figma back and report where every token stands.
   *
   * Asked for, rather than sent on load: the answer is only true for the moment
   * it was taken, and paying for a full read of the file's variables when the
   * user may never open the Inspector is a cost with no reader.
   */
  | { type: 'INSPECT_CORRESPONDENCE'; payload: Record<string, never> }
  /** The document's tokens as a graph; answered with `TOKEN_GRAPH`. */
  | { type: 'GET_TOKEN_GRAPH'; payload: Record<string, never> }
  | { type: 'LOAD_CONVENTIONS'; payload: { json: string } }
  | { type: 'GET_CONVENTIONS'; payload: Record<string, never> }
  /**
   * `allowBreaking` lets the plan carry the steps that lose something in Figma (the deletion of a mode its
   * modifier no longer has). Left out, they are listed and not carried: the plugin's own screen never sets it.
   * `overwriteDrift` writes the document's value over a mode Figma holds another value for than the last sync wrote,
   * instead of leaving it as a local edit. The screen never sets it either.
   */
  | { type: 'PLAN_VARIABLE_SYNC'; payload: { collectionName?: string; allowBreaking?: boolean; overwriteDrift?: boolean } }
  | { type: 'EXECUTE_VARIABLE_SYNC'; payload: Record<string, never> }
  /** `overwriteDrift` writes the document's value over a style changed in Figma since the last sync wrote it, as for a variable. */
  | { type: 'PLAN_STYLE_SYNC'; payload: { collectionName?: string; overwriteDrift?: boolean } }
  | { type: 'EXECUTE_STYLE_SYNC'; payload: Record<string, never> }
  | { type: 'AUDIT_SELECTION'; payload: { scope: QueryScope } }
  | { type: 'PLAN_SCAFFOLD'; payload: { query: string; scope: QueryScope } }
  | { type: 'EXECUTE_SCAFFOLD'; payload: Record<string, never> }
  /** With `nodeId`, only that node; with `property` too, only that property. */
  | { type: 'PLAN_APPLY_BINDINGS'; payload: { query: string; scope: QueryScope; nodeId?: string; property?: string } }
  | { type: 'EXECUTE_APPLY_BINDINGS'; payload: Record<string, never> }
  /**
   * Apply: a token, or a group's tokens, on the layers of `kinds` in `scope`. `tokens` is a token's or a group's path,
   * braces optional. A group's tokens reach fields by their last keys; one token takes `field`, or reaches one by its last key.
   */
  | { type: 'PLAN_APPLY'; payload: { tokens: string; field?: string; scope: QueryScope; kinds: ApplyKind[] } }
  | { type: 'EXECUTE_APPLY'; payload: Record<string, never> }
  | { type: 'READ_SELECTION_BINDINGS'; payload: { scope: QueryScope } }
  | { type: 'SELECT_NODES'; payload: { ids: string[] } }
  | { type: 'COUNT_BOUND_LAYERS'; payload: { variableName: string } }
  | { type: 'GET_TEMPLATES'; payload: Record<string, never> }
  | { type: 'KEEP_TEMPLATE'; payload: { fileName: string; text: string; replaces?: string } }
  | { type: 'FORGET_TEMPLATE'; payload: { name: string } }
  | { type: 'PLAN_BUILD'; payload: { name: string } }
  | { type: 'EXECUTE_BUILD'; payload: { name: string; allowBreaking?: boolean } }
  | { type: 'GET_FIGMA_COLLECTIONS'; payload: Record<string, never> }
  /** The lock, for the Build pane. */
  | { type: 'GET_LOCK'; payload: Record<string, never> }
  /** Match the variables the kept files bind against the enabled libraries' variables, and write the keys found. */
  | { type: 'DISCOVER_VARIABLES'; payload: Record<string, never> }
  /** Write the selected instance's component, and the selected layer's library styles, under `library`. */
  | { type: 'LOCK_PICK'; payload: { library: string } }
  | { type: 'LOCK_FORGET'; payload: { library: string } }
  | { type: 'SET_BUILD_OVERRIDES'; payload: { overrides: Overrides } }
  /** Look up one kept blueprint's needs, by a dry pass of the locator that imports nothing. Answered with `NEEDS`. */
  | { type: 'LOOK_UP_NEEDS'; payload: { name: string } }
  /** A dry build of every kept file, reporting only the swaps a relink would make and what they need published. Answered with `PLAN_READY`, `relink`. */
  | { type: 'PLAN_RELINK'; payload: Record<string, never> }
  /** In a library file: its own keys and their publish status. Answered with `LIBRARY_KEYS_READ`. */
  | { type: 'LIBRARY_KEYS'; payload: Record<string, never> }
  /** In a target file: write one library's entry, replacing the entry whole. Answered with `LOCK`. */
  | { type: 'LOCK_WRITE'; payload: { library: string; entry: LockedLibrary } }
  | { type: 'GET_SELECTION'; payload: Record<string, never> }
  /**
   * Make Figma agree with one component file, given as its text and its name. The plugin reads,
   * evaluates, validates, plans and applies; the Templates pane's build goes through the same entry.
   * `inputs` is the data an artboard file reads with `(input)`: the tokens of the document the command line
   * resolved, nested by path, each leaf its resolved `$value`. A component file ignores it.
   */
  | { type: 'RUN_COMPONENT'; payload: { text: string; fileName: string; options: RunOptions; inputs?: Record<string, unknown> } }
  /**
   * Read every file and say every problem of every file, writing nothing. `names` also checks the
   * names each writes against the loaded design system, which a run does not: Figma resolves them.
   */
  | {
      type: 'CHECK_COMPONENTS';
      payload: {
        files: Array<{ fileName: string; text: string }>;
        names?: boolean;
        inputs?: Record<string, unknown>;
        dryRun?: boolean;
        allowBreaking?: boolean;
      };
    }
  /**
   * The end of a run, once, after its last component or artboard step: removes the strays when `allowBreaking`, and stacks
   * Toghen's sets and artboards again on each page the run changed one on. With `dryRun` it only says what it would restack.
   */
  | { type: 'FINISH_COMPONENTS'; payload: { dryRun?: boolean; allowBreaking?: boolean } }
  | { type: 'CANCEL_OPERATION'; payload: Record<string, never> }
  /**
   * Resize the plugin window.
   *
   * A Figma plugin window cannot be resized by the user — the plugin has to
   * offer the affordance and call `figma.ui.resize()` itself. `remember: true`
   * marks the end of a drag, so the size is persisted once rather than on every
   * intermediate frame.
   */
  | { type: 'RESIZE_UI'; payload: { width: number; height: number; remember?: boolean } | { mode: WindowMode } };

/** The window's two remembered sizes, and the switch between them. */
export type WindowMode = 'narrow' | 'wide';

export type Response =
  /** `report`: the load's own rows, one per collision and per unused key of the map; absent when there are none. */
  | { type: 'DOCUMENT_LOADED'; payload: DocumentStatePayload & { report?: PlanPayload } }
  | { type: 'DOCUMENT_EXPORTED'; payload: { json: string; filename: string } }
  | { type: 'DOCUMENT_STATE'; payload: DocumentStatePayload }
  | { type: 'SYNC_STATE'; payload: SyncStatePayload }
  | { type: 'CORRESPONDENCE'; payload: InspectionPayload }
  | { type: 'TOKEN_GRAPH'; payload: TokenGraphPayload }
  | { type: 'RECENTS'; payload: RecentDocumentSummary[] }
  | { type: 'CONVENTIONS_LOADED'; payload: { count: number } }
  | { type: 'PLAN_READY'; payload: PlanPayload }
  | { type: 'OPERATION_PROGRESS'; payload: ProgressPayload }
  | { type: 'OPERATION_COMPLETE'; payload: OperationSummary }
  | { type: 'AUDIT_RESULT'; payload: AuditResultPayload }
  | { type: 'SELECTION_BINDINGS'; payload: SelectionBindingsPayload }
  | { type: 'BOUND_LAYERS'; payload: BoundLayersPayload }
  | { type: 'TEMPLATES'; payload: TemplatesPayload }
  | { type: 'WINDOW_MODE'; payload: { mode: WindowMode } }
  | { type: 'FIGMA_COLLECTIONS'; payload: FigmaCollectionPayload[] }
  | { type: 'LOCK'; payload: Lock }
  | { type: 'NEEDS'; payload: NeedsPayload }
  | { type: 'LIBRARY_KEYS_READ'; payload: LibraryKeys }
  | { type: 'SELECTION_CHANGED'; payload: SelectionPayload }
  /** Answer to `RUN_COMPONENT`: the engine's report, steps summarised. A run that stopped arrives as `ERROR` with `problems`. */
  | { type: 'COMPONENT_RUN'; payload: { component: string; report: CompactReport } }
  /**
   * Answer to `CHECK_COMPONENTS` when no file has a problem. Otherwise an `ERROR` with `problems`.
   * `strays` are the members outside any set, one breaking line each: present only when there are some, and, unless the
   * check was for a dry run or `allowBreaking`, they are `problems` instead.
   */
  | { type: 'COMPONENTS_CHECKED'; payload: { files: number; strays?: string[] } }
  /** Answer to `FINISH_COMPONENTS`. */
  | { type: 'COMPONENTS_FINISHED'; payload: { removed: string[]; moved: string[]; notes: string[] } }
  | { type: 'ERROR'; payload: ErrorPayload };
