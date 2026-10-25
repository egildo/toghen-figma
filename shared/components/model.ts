/**
 * The model a component file reads into.
 *
 * The file is a kdlet file: kdlet reads it and evaluates it, and this is what a
 * member's tree becomes once it is Figma's. Everything downstream (the diff, the
 * steps, the engine) works on these types and never on KDL, and every type is
 * plain JSON. The file format
 * itself is owned by `reference.md`, *Component files*.
 *
 * Positions are kept beside the data they describe (`loc`, `fieldLoc`) rather
 * than in a side table, so a problem found in a member after a `when` wrote the
 * offending field still points at the line of that `when`.
 */

/** A position in the file, one-based, as an editor shows it. */
export interface Loc {
  line: number;
  column: number;
}

export interface Problem {
  severity: 'error' | 'warning';
  /** In the file's own words: names the layer, field or property it is about. */
  message: string;
  line?: number;
  column?: number;
  /** The member the problem was found in, for problems that only exist after expansion. */
  member?: string;
}

/**
 * What a field holds. `plain` is an enum, a boolean, a string, or `null` (`#null`,
 * which clears a size and is distinct from a field that was never written).
 */
export type Value =
  /** `"{space.md}"`: the path without braces. */
  | { kind: 'token'; path: string }
  /** `(literal)8`, `(literal)"#ffffff00"`: a value that says it is on purpose. On a wirable field (`characters=(literal)"Ready"`) it takes the field off its property. */
  | { kind: 'literal'; value: number | string | boolean }
  /** `(property)"Show Nav"`: wired to a component property. */
  | { kind: 'property'; name: string }
  /** `(key)"…"`: a published component key. Accepted only where a component is named. */
  | { kind: 'key'; key: string }
  | { kind: 'plain'; value: string | number | boolean | null };

export interface Track {
  type: 'FLEX' | 'FIXED' | 'HUG';
  /** Present for `FLEX` (a bare `FLEX` reads as 1) and `FIXED`. */
  value?: number;
}

export interface GridPlacement {
  row: number;
  column: number;
  rowSpan?: number;
  columnSpan?: number;
}

/** `modes Scale=small`: collection name to mode name. */
export type Modes = Record<string, string>;

/**
 * `set Name=value …` on an instance: the values of the instance's properties, by the display
 * name the component declares. A text or a variant value is a string, a boolean is a boolean, and an
 * instance swap is a component's name or `(key)"…"`. A token reference (`"{copy.title}"`) is `{ token }`, its path: a
 * `string` or `boolean` token whose variable is bound to a `TEXT` or `BOOLEAN` property. `loc` is the line the value was
 * written at.
 */
export type SetField = Record<string, { value: string | boolean | { key: string } | { token: string }; loc?: Loc }>;

/**
 * One layout grid of `layoutGrids` (unit 4): `COLUMNS` and `ROWS` with an alignment, or a square `GRID`. Each field holds
 * a token, a `(literal)` (a dimension, or a colour as `#rrggbbaa`) or, for `count`, a plain whole number; a field the
 * grid's alignment does not take is refused when the file is read (`GRID_FIELDS`).
 */
export interface LayoutGridRecord {
  pattern: 'COLUMNS' | 'ROWS' | 'GRID';
  alignment?: 'MIN' | 'MAX' | 'STRETCH' | 'CENTER';
  count?: Value;
  gutterSize?: Value;
  offset?: Value;
  sectionSize?: Value;
  color?: Value;
}

/** `constraints horizontal=MIN vertical=STRETCH`: Figma's `Constraints`, both axes given. */
export interface Constraints {
  horizontal: string;
  vertical: string;
}

/** Which shape a field's value has follows from the field's name: see `fields.ts`. `dashPattern` is a `Value[]`, as `fills` is. */
export type FieldValue = Value | Value[] | Track[] | GridPlacement | Modes | SetField | Constraints | LayoutGridRecord[];

export type LayerKind = 'FRAME' | 'SLOT' | 'TEXT' | 'INSTANCE' | 'LINE';

export interface Layer {
  kind: LayerKind;
  /**
   * The layer's name, and the key rules and stamps find it by. For a `SLOT`, the slot property's name.
   * In an artboard file the keys of the `each`es around a layer follow its name (`Row["a"]`), so a repeated
   * layer has an address of its own; `name` is then what Figma shows.
   */
  address: string;
  /** In an artboard file, the layer's name as written, when the address carries keys after it. */
  name?: string;
  /** In an artboard file, the slot of the enclosing `INSTANCE` this layer fills; it is one of that instance's `children`. */
  slot?: string;
  /** In an artboard file, the slots an `INSTANCE` fills, even those it fills with nothing. */
  slots?: { name: string; loc?: Loc }[];
  fields: Record<string, FieldValue>;
  children: Layer[];
  loc?: Loc;
  /** Where each field was last written: on the layer's own line or body, or in the `when` that wrote it. */
  fieldLoc?: Record<string, Loc>;
  /** The axes a field's reference took a path segment from (`{hue.(input)hue.soft}`), by field: so a message can name the value that made it. Absent when none did. */
  fromAxes?: Record<string, string[]>;
}

/**
 * A component offered first by an `INSTANCE_SWAP` or a `SLOT`: by its published key, or by its name, which the locator
 * answers as it answers an instance swap's default (the file, or a declared library). `loc` is the `preferred` line.
 */
export type PreferredValue =
  | { type: 'COMPONENT' | 'COMPONENT_SET'; key: string }
  | { type: 'COMPONENT' | 'COMPONENT_SET'; name: string; loc?: Loc };

/** Either a component named in the file's document, or a published key. */
export type ComponentRef = { name: string } | { key: string };

export interface SlotSettings {
  minChildren?: number;
  maxChildren?: number;
  allowPreferredValuesOnly?: boolean;
  stretchChildOnInsert?: boolean;
  displayEmptyByDefault?: boolean;
}

export type Property =
  /**
   * `modifier` is set for an axis that takes its values from a modifier of the design
   * system (`VARIANT State (modifier)"state"`), or that was inferred from the tokens:
   * `values` are then the modifier's contexts, default first, and each member pins the
   * modifier's collection to its value (`modes state=hover`) on its root layer. `leftOut` are the
   * contexts of that modifier Figma does not get (its `figma.include`): not values, and said so when a file names one.
   *
   * `part` is set for an axis that `tokens=` took from the parts vocabulary: `values` are `rest` and the part keys.
   * A folded one also has `modifier`, the collection named after the axis; one left in the path pins nothing, and
   * its value selects the part group the member's layers bind.
   *
   * `from` is set for an axis that takes its values from a token group (`VARIANT hue from="{hue}"`): the group's
   * path without braces. `values` are then the names of its children, in the document's order.
   */
  (
    | { type: 'VARIANT'; name: string; values: string[]; modifier?: string; leftOut?: string[]; from?: string; part?: true }
    /** A default that is a token reference (`default="{flag.on}"`) is `{ token }`, its path: the token's variable is bound to it. */
    | { type: 'BOOLEAN'; name: string; default: boolean | { token: string } }
    | { type: 'TEXT'; name: string; default: string | { token: string } }
    | { type: 'INSTANCE_SWAP'; name: string; default: ComponentRef; preferredValues?: PreferredValue[] }
    | {
        type: 'SLOT';
        name: string;
        description?: string;
        preferredValues?: PreferredValue[];
        slotSettings?: SlotSettings;
      }
  ) & { loc?: Loc };

/**
 * A combination that is never built (`exclude`), or the only ones that are built
 * (`include`): one value for each axis it names, an axis it does not name matching any value.
 */
export interface Exclusion {
  combination: Record<string, string>;
  loc?: Loc;
}

/**
 * What a component file says apart from its layers: the set's name, description and
 * properties, and the combinations never built. The layers are the file's
 * document, which `members.ts` evaluates once per combination.
 */
export interface Component {
  name: string;
  description?: string;
  properties: Property[];
  exclude: Exclusion[];
  /**
   * When present, only the combinations one of these matches are built, and `exclude`
   * then removes from those. Absent when the file writes none: every combination is a candidate.
   */
  include?: Exclusion[];
  /**
   * The token group the component names (`tokens="{button}"`), without the braces. Every
   * axis of the parts vocabulary the group's subgroups use is an axis, after the declared ones.
   */
  tokens?: string;
  /** `parts` (`layout=parts` on the component line): every axis of the component stays in the path, one variable per part. */
  layout?: 'parts';
  /**
   * The axes that go across on the set's board (`across="a, b"` on the component line), by name; the others go down.
   * Absent, the board balances itself (`memberBoard`).
   */
  across?: string[];
  /** Where `across=` was written, for the refusal that names an axis the component does not have. */
  acrossLoc?: Loc;
  /**
   * What each token group the component's layers name with `tokens=` (and the group the component
   * line names) binds, by the group's path. Filled in by the reader from the design system, so the
   * engine, which asks no design system, infers the same bindings from it. A member that selects part groups
   * (`variant=primary`) has its own plan, stored under `planKey(group, selection)`.
   */
  groups?: Record<string, GroupPlan>;
  /**
   * What the reader found while inferring bindings, for the run's report: keys with no field on the
   * layer that names them (notes), and what could not be bound (warnings). Said once per key and layer.
   */
  notes?: string[];
  warnings?: string[];
}

/**
 * What a group binds, worked out from its keys by the reader (`groups.ts`) so that the engine only
 * has to lay it over the evaluated layers (`bindings.ts`). Plain JSON, and small: it travels in the script.
 */
export interface GroupPlan {
  /** For a `TEXT`. */
  TEXT: Laid;
  /** For a `FRAME` or `SLOT`, whatever its layout. */
  box: Laid;
  /**
   * Laid over `box` by the layer's `layoutMode` (a layer with none is `NONE`), present only where the group has
   * a gap: it is `itemSpacing` in a flow, the two grid gaps in a grid, and nothing otherwise.
   */
  NONE?: Laid;
  HORIZONTAL?: Laid;
  VERTICAL?: Laid;
  GRID?: Laid;
}

/** What one kind of layer gets from a group. */
export interface Laid {
  /** Figma field to the path of the token it binds to. */
  set: Record<string, string>;
  /** Keys with no field here, said in the run's notes, one line each. */
  notes?: string[];
  /** What the group could not bind here, said as warnings: a composite border's literal members. */
  warnings?: string[];
}

/** The tokens one level down in a group, as the design system gives them: what a `GroupPlan` is worked out from. */
export interface GroupInfo {
  /** The keys of the tokens directly in the group (`backgroundColor`), in the document's order. */
  keys: string[];
  /** For a key whose token is in a part group the selection chose, the token's path; every other key is `<group>.<key>`. */
  paths?: Record<string, string>;
  /**
   * For a key whose token is a composite `border`: the tokens its `color` and `width` members
   * refer to, as paths. A member that is not here is a literal. `unsolid` is set when its style
   * is anything but `solid`, which the reader refuses.
   */
  borders?: Record<string, { color?: string; width?: string; unsolid?: true }>;
  /** The keys, among those the table asks the type of (`background`), whose token is a colour in every context. */
  colors?: string[];
}

/** One component of the set: a combination of variant values and the tree it builds. */
export interface Member {
  /** `Axis=value, Axis=value` in declared axis order; the component's name when there are no axes. */
  name: string;
  combination: Record<string, string>;
  tree: Layer;
}
