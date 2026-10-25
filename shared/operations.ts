export type StyleProps = Record<string, unknown>;

/**
 * A style field that follows a variable instead of holding a value.
 *
 * `field` is a `VariableBindableTextField` on a text style, or a
 * `VariableBindableEffectField` on layer `index` of an effect style. It rides
 * beside `props`, which still carry the resolved value, so a style is complete
 * whether or not a binding lands.
 *
 * `variableId` is always a real Figma id, never a symbolic one: a style plan
 * binds only to variables that already exist. So `resolveOperationIds` and
 * `dependenciesOf` need no case for it.
 */
export interface StyleBinding {
  field: string;
  variableId: string;
  index?: number;
}

/**
 * Why a sync plan skipped a token, one word each, so skips can be counted and grouped without parsing a sentence.
 * `unchanged` is the quiet one: nothing to do. Every other cause is something a person may want to look at.
 */
export type SkipCause =
  /** Figma holds what the document says. */
  | 'unchanged'
  /** Figma holds something else than the last sync wrote: a local edit, left alone. */
  | 'drifted'
  /** A person's copy of a variable or style the sync wrote, left alone. */
  | 'copy'
  /** No variable or style holds a token of this type. */
  | 'unsupported-type'
  /** The token's purpose asks for something a variable cannot hold: a list of scopes, an opacity. */
  | 'refused-routing'
  /** The token's collection is one nothing may be written to: built by an earlier sync, or its default mode removed. */
  | 'closed-collection'
  /** A variable the token links to has another type, which Figma cannot change. */
  | 'type-conflict'
  /** A value of the token no Figma variable can hold, in one context. */
  | 'cannot-write'
  /** A style the token's value cannot be built into. */
  | 'cannot-build'
  /** A text style whose font stack names no family Figma lists. */
  | 'no-font'
  /** A text style whose family was listed and could not be loaded at execute. */
  | 'font-not-loaded';

/** A plan's skips counted by cause: only the causes it holds. Their sum is the plan's `skips`. */
export type SkipCounts = Partial<Record<SkipCause, number>>;

/** Counts the skips among `operations` by cause; a skip with none is not counted here. */
export function countSkipsByCause(operations: readonly Operation[]): SkipCounts {
  const counts: SkipCounts = {};
  for (const op of operations) if (op.kind === 'SKIP' && op.cause) counts[op.cause] = (counts[op.cause] ?? 0) + 1;
  return counts;
}

export type Operation =
  | { kind: 'CREATE_COLLECTION'; symbolicId?: string; name: string; modes: string[] }
  | { kind: 'ADD_MODE'; collectionId: string; collectionName: string; modeName: string }
  /**
   * Deletes a mode its modifier no longer has, with every value in it. Planned only when the request allows
   * breaking, and always beside the `BREAKING` row that says what it costs. The collection's default mode is never named.
   */
  | { kind: 'DELETE_MODE'; collectionId: string; collectionName: string; modeId: string; modeName: string }
  /**
   * Removes the variable a token had before it changed collection, once the new one is written and every alias is
   * re-pointed. Planned only when the request allows breaking, and always beside the `BREAKING` row that says what it
   * costs. `after` is the symbolic id of the variable that replaces it: a create that failed holds the removal back.
   * `strip` names the person's copies of it, whose stamps are removed once it is (decisions, *A copy whose original
   * Toghen removes*); the `BREAKING` row names them.
   */
  | { kind: 'DELETE_VARIABLE'; variableId: string; variableName: string; collectionName: string; after?: string; strip?: string[] }
  | {
      kind: 'CREATE_VARIABLE';
      symbolicId?: string;
      collectionId: string;
      path: string;
      variableType: VariableResolvedDataType;
      /** What the variable may be bound to. A variable is made with the scopes of its purpose, never with Figma's default of all. */
      scopes?: VariableScope[];
      /** The key the sync gives the variable: the token its stamp names. */
      tokenPath?: string;
    }
  /**
   * Writes the scopes of a variable that exists: its purpose changed, or it still holds what older Toghen wrote.
   * Not breaking. A variable whose scopes a designer changed gets no such operation, unless drift is overwritten.
   * `path` is the key the sync gives the variable, the token its stamp names.
   */
  | { kind: 'SET_VARIABLE_SCOPES'; variableId: string; scopes: VariableScope[]; path: string }
  | {
      kind: 'SET_VARIABLE_VALUE';
      variableId: string;
      modeId: string;
      value: VariableValue;
      label: string;
      /**
       * Token path and mode this value belongs to.
       *
       * Carried explicitly because the execute handler used to recover them by
       * regex from `label`. That round trip is not a bijection: a token path
       * segment may legally contain `/`, and a mode name may contain `]`, so
       * the recovered path could differ from the real one — and the variable
       * would then be stamped for a path that does not exist, recreating it on
       * every run.
       */
      tokenPath: string;
      modeName: string;
    }
  | { kind: 'RENAME_VARIABLE'; variableId: string; name: string; path: string }
  /**
   * The name a stylesheet gives the variable, shown in Dev Mode: `var(--button-background-color)`.
   * Web only: Android and iOS spellings are not Toghen's to invent.
   */
  | { kind: 'SET_CODE_SYNTAX'; variableId: string; platform: 'WEB'; value: string; path: string }
  /**
   * `tokenPath` is carried for the same reason `SET_VARIABLE_VALUE` carries it.
   * The execute handler used to derive it by turning the *live Figma style's*
   * name back into a path, so a style a designer had renamed got its record
   * written under a path the document does not contain — and the real path
   * stayed permanently dirty. It is the token the style's stamp names.
   */
  | {
      kind: 'CREATE_STYLE';
      styleType: 'TEXT' | 'EFFECT' | 'PAINT';
      name: string;
      props: StyleProps;
      tokenPath: string;
      bindings?: StyleBinding[];
    }
  | { kind: 'UPDATE_STYLE'; styleId: string; props: StyleProps; tokenPath: string; bindings?: StyleBinding[] }
  /**
   * Writes the stamp of a variable or a style Toghen wrote that moved, so that it records the object's own id
   * (decisions, *Ruled: a copy carries the stamp*). Planned only where nothing else the plan writes to it stamps it;
   * it changes nothing else. `path` is the token its stamp names.
   */
  | { kind: 'STAMP'; target: 'variable' | 'style'; id: string; path: string }
  | { kind: 'BIND_VARIABLE'; nodeId: string; property: string; variableId: string }
  | { kind: 'UNBIND_VARIABLE'; nodeId: string; property: string }
  /**
   * Apply: one token on one field (a name of the field table) of one layer, written through the field writer. No stamp
   * is written. `variableId` is the token's variable where the field binds it. `value` and `context` are set when the
   * field, or part of it (a colour's alpha on a paint), is written as the token's value: the value at the declared
   * defaults, and their mode name; `written` is the line that says so before Execute.
   */
  | {
      kind: 'APPLY_TOKEN';
      nodeId: string;
      nodeName: string;
      field: string;
      path: string;
      variableId?: string;
      /** A dash pattern's lengths, in pixels, for a `strokeStyle` token on `dashPattern`. */
      value?: VariableValue | number[];
      context?: string;
      written?: string;
    }
  | {
      kind: 'SKIP';
      /** The sentence: what was left alone and why, naming the token and, where there is one, the context. */
      reason: string;
      path: string;
      /** Why, as one of a closed set, for counting and grouping. Every skip of the variable and style plans carries one; the other plans' skips do not yet. */
      cause?: SkipCause;
      /**
       * Detail the short `reason` cannot carry.
       *
       * A drifted path used to emit a `WARNING` explaining itself *and* a
       * `SKIP` recording the outcome — two rows for one thing that happened,
       * and a summary saying the same number twice as `4 drifted · 4 warnings`.
       * The explanation belongs to the skip it explains.
       */
      message?: string;
      /** A skip the command line lists, as it lists a warning: a style that cannot be written, which no one wants to find by counting. */
      reported?: true;
    }
  /**
   * Something the plan says without it being a problem or a step: the variables left offered to every field.
   * Shown by the dry run and in the run report beside the warnings, and not counted as one.
   */
  | { kind: 'NOTE'; message: string }
  /** A relink plan's row: one stamped instance a build would swap to another component. Nothing executes it; each file's Build does. */
  | { kind: 'SWAP_COMPONENT'; path: string; message: string }
  /** `stops`: the plan stopped before its first write, and the run that asked for it stops too. */
  | { kind: 'WARNING'; message: string; path?: string; stops?: true }
  /**
   * A step that loses something in Figma, listed whether or not the plan carries it.
   * It runs nothing: the operation that does the damage is a separate one, present only when breaking is allowed.
   */
  | {
      kind: 'BREAKING';
      message: string;
      /**
       * A variable the plan removes because its token moved to another collection, by the collection it is in and its name.
       * A dry run counts the removal, so that the name the token keeps is not found in two collections.
       */
      moved?: { collection: string; name: string };
    };

/**
 * A plan. What it wrote is stamped on each variable and style as it is written,
 * from what Figma reports back, so nothing travels beside the operations.
 */
export interface SyncPlan {
  operations: Operation[];
}

export interface OperationResult {
  operation: Operation;
  status: 'applied' | 'skipped' | 'failed';
  reason?: string;
  figmaId?: string;
  durationMs?: number;
}

export interface OperationSummary {
  total: number;
  applied: number;
  /** Planned skips, prerequisite failures, and cancellations. A plan's warnings, notes and breaking rows are not counted here: the plan counted them under their own names. */
  skipped: number;
  failed: number;
  /**
   * Operations not attempted because the run was cancelled.
   *
   * Counted apart from `failed`: a user pressing Cancel used to produce
   * hundreds of "errors" and suppress `lastSyncedAt`, which made a deliberate
   * stop indistinguishable from a broken document.
   */
  cancelled: number;
  durationMs: number;
  results: OperationResult[];
}
