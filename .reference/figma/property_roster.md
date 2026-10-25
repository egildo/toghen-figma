# Figma node properties — roster

> **What this is.** Every property of a scene node that a person sets in Figma's design panel, with what the Plugin API lets a script do with it: bind it to a variable, set it, or neither. It exists so that component files (`toghen-figma/component-files.md`) can later cover every property Figma can manage. Export settings and prototyping are left out.
>
> | | |
> |---|---|
> | **Drafted** | 2026-10-21 |
> | **Typings** | `@figma/plugin-typings@1.139.0` (`plugin-api.d.ts`) |
> | **Docs** | the vendored `.reference/figma/*.md`, chiefly `api_node_properties.md`, `types_variables.md`, `working_with_variables_section.md` |
> | **Measured** | `.reference/figma/measured_behaviour.md`; §14 holds the probes run for this roster |
> | **Toghen's vocabulary** | `toghen-figma/shared/components/fields.ts` (the `FIELDS` table) |

## How to read a row

- **Node kinds.** Toghen's layer kinds are in bold: **FRAME**, **SLOT**, **TEXT**, **INSTANCE**, **LINE**. Two names stand for groups:
  - *frame kinds*: **FRAME**, **SLOT**, **INSTANCE**, COMPONENT, COMPONENT_SET. They share every mixin of `BaseFrameMixin` (auto-layout, grid layout, corners, per-side strokes, layout grids, clipping).
  - *shapes*: RECTANGLE, ELLIPSE, POLYGON, STAR, VECTOR, **LINE**, BOOLEAN_OPERATION.
  - GROUP and SECTION are named where they carry a property.
- **Bind.** The field name passed to the binding call, the variable type, and the scope that shows the variable in Figma's picker. `setBoundVariable(field, variable)` unless another call is named. **Scopes only filter the pickers in Figma's UI; they never stop a script from binding** (`api_Variable.md`, `scopes`; measured 2026-10-21: a FLOAT scoped `CORNER_RADIUS` binds to `paddingLeft`). Scopes exist for FLOAT, STRING and COLOR variables only, so a BOOLEAN variable has none. The variable's type is enforced: a STRING on `width` throws `in setBoundVariable: variable of resolved type 'STRING' cannot be bound to 'width'`. A field outside the bindable lists throws `in setBoundVariable: Unknown field: '<name>'` (measured 2026-10-21 for every "No (not a bindable field)" row below).
- **Set.** How a script writes the value. *Assign* is plain assignment. *Clone and reassign* means the value is a read-only array: copy it, change the copy, assign the copy. *Mixed* means the getter can return `figma.mixed` when parts of the node differ.
- **Token.** The DTCG type that can carry the value, and, when it cannot be bound, whether a script can write the token's resolved value instead.
- **Toghen.** Whether the `FIELDS` table offers it today, and under which name when it differs. For a row it covers, one word more says how a value reaches Figma, as the table's `token` column has it: *bound* (a token's variable is bound to it; *bound, to a style* when a style made from the token is applied), *written as a value* (a token's resolved value is written, and stops following the token), or *plain* (the file gives a plain value and no token is taken).
- **Source.** *typings*, *docs* (with the file), or *measured* with the date and the section of `measured_behaviour.md`.

---

## 1. Layout (the container)

| Property | Node kinds | Bind | Set | Token | Toghen | Source |
|---|---|---|---|---|---|---|
| `layoutMode` | frame kinds | No | Assign: `NONE` `HORIZONTAL` `VERTICAL` `GRID` | None (an enum) | Yes, plain; a **SLOT** is never `GRID` | typings |
| `clipsContent` | frame kinds | No | Assign, boolean | None (DTCG has no boolean type) | Yes, plain (**FRAME**, **SLOT**) | typings; slots clip by default, measured (§7) |
| `itemReverseZIndex` ("canvas stacking": first on top) | frame kinds with auto-layout | No | Assign, boolean | None | No | typings |
| `strokesIncludedInLayout` | frame kinds with auto-layout | No | Assign, boolean | None | No | typings |

## 2. Sizing

| Property | Node kinds | Bind | Set | Token | Toghen | Source |
|---|---|---|---|---|---|---|
| `width`, `height` | every scene kind | Yes: `width`, `height` · FLOAT · `WIDTH_HEIGHT` | Read-only; `resize(w, h)` or `resizeWithoutConstraints(w, h)`. `resize()` resets hug sizing to `FIXED` (§7). A **LINE** is `resize(w, 0)` (§12) | dimension | Yes, bound; `height` not on **LINE** | typings; measured (§7, §12) |
| `minWidth`, `maxWidth`, `minHeight`, `maxHeight` | every scene kind with `LayoutMixin` | Yes: same names · FLOAT · `WIDTH_HEIGHT`. **A binding is accepted where assignment is not**: on a frame with no auto-layout and no auto-layout parent, binding `minWidth` reads back bound and 8. **The binding waits**: still reported in a fresh call, it draws nothing (the variable at 200 left the frame 100 wide), and once the frame was made auto-layout it was 200 wide | Assign, number or `null` to clear. Valid only on auto-layout frames and their direct children; elsewhere throws `in set_minWidth: Can only set minWidth on auto layout nodes and their children` | dimension | Yes, bound; the heights not on **LINE** | typings; measured 2026-10-21 (both passes) |
| `layoutSizingHorizontal`, `layoutSizingVertical` | every scene kind with `LayoutMixin` | No | Assign: `FIXED` `HUG` `FILL`. `HUG` only on an auto-layout frame or a text in one; `FILL` only on a child of an auto-layout frame; both throw on an orphan (§7) | None | Yes, plain | typings; measured (§7) |
| `primaryAxisSizingMode`, `counterAxisSizingMode` | frame kinds with auto-layout | No | Assign: `FIXED` `AUTO`. The older form of `layoutSizing*` on the frame itself | None | Through `layoutSizing*`; plain | typings |
| `layoutGrow`, `layoutAlign` | children of auto-layout | No (`layoutGrow` measured 2026-10-21 as not a bindable field) | Assign: `layoutGrow` 0 or 1; `layoutAlign` `STRETCH` `INHERIT` (`MIN` `CENTER` `MAX` deprecated). The older form of `FILL` | None | Through `layoutSizing*`; plain | typings |
| Aspect ratio lock: `lockAspectRatio()`, `unlockAspectRatio()`, `targetAspectRatio` | every scene kind with `AspectRatioLockMixin` (not **LINE**) | No | Methods; `targetAspectRatio` is read-only. `constrainProportions` is the deprecated boolean | None | No | typings |

## 3. Auto-layout

On frame kinds whose `layoutMode` is `HORIZONTAL` or `VERTICAL`.

| Property | Node kinds | Bind | Set | Token | Toghen | Source |
|---|---|---|---|---|---|---|
| `primaryAxisAlignItems` | frame kinds | No | Assign: `MIN` `MAX` `CENTER` `SPACE_BETWEEN` `SPACE_EVENLY` `SPACE_AROUND` | None | Yes, plain; not in a grid | typings |
| `counterAxisAlignItems` | frame kinds | No | Assign: `MIN` `MAX` `CENTER` `BASELINE` | None | Yes, plain; not in a grid | typings |
| `itemSpacing` | frame kinds | Yes: `itemSpacing` · FLOAT · `GAP` | Assign, number | dimension | Yes, bound; not in a grid | typings |
| `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft` | frame kinds | Yes: same names · FLOAT · `GAP` | Assign, number | dimension | Yes, bound | typings |
| `horizontalPadding`, `verticalPadding` | frame kinds | No | Assign; deprecated shorthands for the two sides | dimension, resolved | Through the four sides; bound | typings |
| `layoutWrap` | frame kinds with auto-layout | No (not a bindable field) | Assign: `NO_WRAP` `WRAP`. The typings say `HORIZONTAL` only; **a `VERTICAL` frame accepted `WRAP` and wraps into columns**: six 40-pixel children, `itemSpacing` 10, `counterAxisSpacing` 20, fixed height 120, laid out as three columns of two (x 0, 60, 120; y 0, 50), the frame hugging 160 wide, like CSS `flex-flow: column wrap`. A frame with no layout throws `in set_layoutWrap: Can only set layoutWrap = WRAP on nodes with layoutMode === HORIZONTAL or VERTICAL` | None | Yes, plain (**FRAME**, **SLOT**); only on `HORIZONTAL` or `VERTICAL` | typings; measured 2026-10-21 |
| `counterAxisSpacing` | frame kinds with auto-layout | Yes: `counterAxisSpacing` · FLOAT · `GAP`. **Binds on a frame that does not wrap too**, `HORIZONTAL` or `VERTICAL`, and reads back the value. **The binding waits**: still reported in a fresh call, it moves nothing while the frame does not wrap (the variable at 50 left the children in place); once the frame wraps at 90 wide, the second row sits at y 90 (40 + 50) | Assign, number or `null` (same as `itemSpacing`). Has an effect only when `layoutWrap` is `WRAP` | dimension (CSS `row-gap` of a wrapping flex row) | Yes, bound (**FRAME**, **SLOT**); only on `HORIZONTAL` or `VERTICAL` | typings; measured 2026-10-21 |
| `counterAxisAlignContent` | frame kinds with auto-layout | No (not a bindable field) | Assign: `AUTO` `SPACE_BETWEEN`. The typings say it throws on a frame that does not wrap; **a `HORIZONTAL` frame that does not wrap accepted `SPACE_BETWEEN`** | None | Yes, plain (**FRAME**, **SLOT**); only on `HORIZONTAL` or `VERTICAL` | typings; measured 2026-10-21 |
| `layoutPositioning` | children of auto-layout | No | Assign: `AUTO` `ABSOLUTE` | None | Yes, plain; only on a child of a layer with a layout | typings |

## 4. Grid layout

On frame kinds whose `layoutMode` is `GRID` (never a **SLOT**), and on their children.

| Property | Node kinds | Bind | Set | Token | Toghen | Source |
|---|---|---|---|---|---|---|
| `gridRowGap`, `gridColumnGap` | frame kinds | Yes: same names · FLOAT · `GAP`. **Binds on a `HORIZONTAL` frame too**, with no error, and reads back. Still reported in a fresh call; moves nothing in the flow (the variable at 50 left the children in place). Made `GRID`, the frame keeps both bindings. **On a grid the gaps draw and follow the variable**: a 2 by 2 grid of fixed 50 tracks, children placed with `setGridChildPosition`, gaps bound to 20 (rows) and 40 (columns), put the children at x 0, 90 and y 0, 70 and hugged 140 by 120; with the variables at 5 and 60, in a later call, x 0, 110, y 0, 55, 160 by 105. The same held when the gaps were bound on a flow frame first and the frame was then made a grid and its children placed (third pass) | Assign, number ≥ 0; throws below 0 | dimension | Yes, bound | typings; measured 2026-10-21 (three passes) |
| `gridRowCount`, `gridColumnCount` | frame kinds | No (not a bindable field) | Assign, whole number ≥ 1; throws below 1, or when a removed track holds a child | number, resolved | Through the length of `gridRowSizes` / `gridColumnSizes`; plain | typings; measured (§8; the binding 2026-10-21) |
| `gridRowSizes`, `gridColumnSizes` | frame kinds | No | Set the count first, then each track's `type` (`FLEX` `FIXED` `HUG`) and `value` on the objects the getter returns. A `FLEX` track is invalid on an axis that hugs | `FIXED`: dimension, resolved; `FLEX`: number, resolved | Yes, plain (`tracks`) | typings; measured (§7, §8) |
| `gridItemsPositioning` | frame kinds | No | Assign: `MANUAL` `ROW_AUTO_FLOW` | None | **No** (Toghen places every child by hand) | typings |
| `gridAutoTracks` | frame kinds | No | Assign: `NONE` `ROWS` | None | **No** | typings |
| Cell: `setGridChildPosition(row, column)`, `gridRowSpan`, `gridColumnSpan` | children of a grid | No | Method for the anchor (`gridRowAnchorIndex`, `gridColumnAnchorIndex` are read-only); spans by assignment | None | Yes, plain (`grid row= column= rowSpan= columnSpan=`) | typings |
| `gridChildHorizontalAlign`, `gridChildVerticalAlign` | children of a grid | No | Assign: `MIN` `CENTER` `MAX` `AUTO` | None | Yes, plain; only on a child of a `GRID` | typings |

## 5. Position and constraints

| Property | Node kinds | Bind | Set | Token | Toghen | Source |
|---|---|---|---|---|---|---|
| `x`, `y` | every scene kind | No (not a bindable field) | Assign. No effect on a child of auto-layout, which is placed by its parent | dimension, resolved | Yes, written as a value; not on the root (Toghen places it), and on a child of a layout only when `ABSOLUTE` | typings; measured 2026-10-21 (`x`) |
| `rotation` | every scene kind with `LayoutMixin` | No (not a bindable field) | Assign, degrees, counter-clockwise | None (DTCG has no angle type) | Yes, plain, a bare number | typings; measured (§12; the binding 2026-10-21) |
| `relativeTransform` (flip) | every scene kind | No | Assign a 2×3 matrix | None | **No** | typings |
| `constraints` | every kind with `ConstraintMixin`: frame kinds, shapes but BOOLEAN_OPERATION, **TEXT** (not GROUP) | No | Assign `{ horizontal, vertical }`, each `MIN` `CENTER` `MAX` `STRETCH` `SCALE` | None | Yes, plain (`constraints horizontal= vertical=`) | typings |

## 6. Appearance

| Property | Node kinds | Bind | Set | Token | Toghen | Source |
|---|---|---|---|---|---|---|
| `visible` | every scene kind | Yes: `visible` · BOOLEAN · no scope | Assign, boolean | None (DTCG has no boolean type) | Yes, bound to a `boolean` token where a document has one; plain; and wired to a `BOOLEAN` property | typings |
| `opacity` | every scene kind with `MinimalBlendMixin` | Yes: `opacity` · FLOAT · `OPACITY`. **A bound variable is read as a percentage**: 1 draws at 1% | Assign, 0 to 1 | number (an opacity), written × 100 when bound | Yes, bound | typings; the percentage in `toghen-figma/guide.md`, *An opacity is a percentage in Figma* |
| `blendMode` | every scene kind with `MinimalBlendMixin` | No (not a bindable field) | Assign: `PASS_THROUGH` `NORMAL` `MULTIPLY` … | None | Yes, plain | typings; measured 2026-10-21 |
| `cornerRadius` | frame kinds, RECTANGLE, ELLIPSE, POLYGON, STAR, VECTOR, BOOLEAN_OPERATION, SECTION | Yes: `cornerRadius` · FLOAT · `CORNER_RADIUS`. **Reported on parts**: on a node with four corners (a frame, an **INSTANCE**) the binding reads back on `topLeftRadius`, `topRightRadius`, `bottomLeftRadius`, `bottomRightRadius`, never on `cornerRadius`; on an ELLIPSE it reads back as `cornerRadius`. **A LINE accepts the binding too** and reads it back as `cornerRadius`, also in a fresh call, though a line has no `cornerRadius` property and its rendered bounds did not change with the variable at 50: a binding that draws nothing | Assign, number. Mixed when the corners differ | dimension | Yes, bound (**FRAME**, **SLOT**) | typings (remark on `boundVariables`); measured (§11; 2026-10-21) |
| `topLeftRadius`, `topRightRadius`, `bottomRightRadius`, `bottomLeftRadius` | frame kinds, RECTANGLE, SECTION | Yes: same names · FLOAT · `CORNER_RADIUS` | Assign, number | dimension | Yes, bound (**FRAME**, **SLOT**) | typings |
| `cornerSmoothing` | as `cornerRadius` | No (not a bindable field) | Assign, 0 to 1 | number, resolved | Yes, written as a value (**FRAME**, **SLOT**) | typings; measured 2026-10-21 |

## 7. Fills and strokes

| Property | Node kinds | Bind | Set | Token | Toghen | Source |
|---|---|---|---|---|---|---|
| `fills` | frame kinds, shapes, **TEXT**, SECTION | A solid paint's colour: `setBoundVariableForPaint(paint, 'color', variable)`, which returns a new paint · COLOR · `ALL_FILLS`, `FRAME_FILL`, `SHAPE_FILL` or `TEXT_FILL`. Read back in `boundVariables.fills` as one alias per bound paint. **A gradient stop's colour binds**, though no helper does it: `setBoundVariableForPaint` on a gradient throws `in setBoundVariableForPaint: can only bind variables to solid paints`, but a gradient assigned with `gradientStops[i].boundVariables = { color: alias }` reads back bound, takes the variable's colour, and lists the alias in `boundVariables.fills`. **A paint's `opacity` cannot bind**: `in setBoundVariableForPaint: Property "field" failed validation: Invalid enum value. Expected 'color', received 'opacity'` | Clone and reassign, or `setFillsAsync`. Mixed on a text whose ranges differ | color; gradient (stops bound one by one, position and angle written resolved) | Yes, bound (**FRAME**, **SLOT**, **TEXT**); a colour's alpha written as a value, the paint's opacity at the declared defaults; a gradient token's stops bound one by one, its positions and angle written as values | typings; docs (`working_with_variables_section.md`); measured (§7, §8: a paint bound again on an existing node keeps the colour it carries; 2026-10-21: gradient stops, paint opacity) |
| Text range fills: `setRangeFills(start, end, paints)` | **TEXT** | As `fills`, per paint; read back in `boundVariables.textRangeFills` | Method | color | **No** | typings; measured (§9) |
| `fillStyleId` | as `fills` | No (a style, not a variable) | `setFillStyleIdAsync(id)` | color, through a paint style | **No** (Toghen binds variables) | typings |
| `strokes` | frame kinds, shapes, **TEXT**, SECTION | As `fills` · COLOR · `STROKE_COLOR` | Clone and reassign, or `setStrokesAsync`. A new **LINE** starts with one black stroke (§12) | color | Yes, bound (**FRAME**, **SLOT**, **LINE**); a colour's alpha written as a value, the paint's opacity at the declared defaults; a gradient token's stops bound one by one, its positions and angle written as values | typings; measured (§12) |
| `strokeStyleId` | as `strokes` | No | `setStrokeStyleIdAsync(id)` | color, through a paint style | **No** | typings |
| `strokeWeight` | frame kinds, shapes, **TEXT**, SECTION | Yes: `strokeWeight` · FLOAT · `STROKE_FLOAT`. **Reported on parts**: on a node with per-side weights (a frame, a RECTANGLE) the binding reads back on the four `stroke*Weight` fields; on a **LINE** it reads back as `strokeWeight` | Assign, number. Mixed when the sides differ | dimension; the `width` of a `border` | Yes, bound (**FRAME**, **SLOT**, **LINE**) | typings; measured (§11; 2026-10-21: RECTANGLE, LINE) |
| `strokeTopWeight`, `strokeRightWeight`, `strokeBottomWeight`, `strokeLeftWeight` | frame kinds, RECTANGLE | Yes: same names · FLOAT · `STROKE_FLOAT` | Assign, number. Set `strokeWeight` first (§7) | dimension | Yes, bound (**FRAME**, **SLOT**) | typings; measured (§7) |
| `strokeAlign` | frame kinds, shapes, **TEXT** | No (not a bindable field) | Assign: `CENTER` `INSIDE` `OUTSIDE`; a **LINE** accepted `INSIDE` | None | Yes, plain (**FRAME**, **SLOT**, **LINE**); undeclared, a side's weight still sets `INSIDE` | typings; measured 2026-10-21 |
| `dashPattern` | as `strokeAlign` | No (not a bindable field) | Assign a new array of numbers, dash and gap lengths in pixels; `[4, 2]` reads back as given | `strokeStyle` (`dashArray` of dimensions), resolved; the `style` of a `border` | Yes, written as a value from a `strokeStyle` token, or plain `(literal)` lengths (**FRAME**, **SLOT**, **LINE**) | typings; measured 2026-10-21 |
| `strokeCap` | shapes, **TEXT**, frame kinds (`GeometryMixin`) | No | Assign: `NONE` `ROUND` `SQUARE` `ARROW_LINES` `ARROW_EQUILATERAL` …; mixed on a vector | `strokeStyle`'s `lineCap`, resolved | Yes, plain (**LINE** only: a frame's outline has no open end); `lineCap` is not read from a `strokeStyle` | typings |
| `strokeJoin` | as `strokeAlign` | No | Assign: `MITER` `BEVEL` `ROUND`; mixed on a vector | None | Yes, plain (**FRAME**, **SLOT**, **LINE**) | typings |
| `strokeMiterLimit` | as `strokeCap` | No (not a bindable field) | Assign, number | number, resolved | **No** | typings; measured 2026-10-21 |
| `variableWidthStrokeProperties`, `complexStrokeProperties` (brush and dynamic strokes) | as `strokeAlign` | No | Assign a structure | None | **No** | typings |

## 8. Effects

| Property | Node kinds | Bind | Set | Token | Toghen | Source |
|---|---|---|---|---|---|---|
| `effects`: drop and inner shadow | frame kinds, shapes, **TEXT**, GROUP | `setBoundVariableForEffect(effect, field, variable)`, which returns a new effect. `color` · COLOR · `EFFECT_COLOR`; `radius`, `spread`, `offsetX`, `offsetY` · FLOAT · `EFFECT_FLOAT`. All five bind on a drop shadow, and on an inner shadow, and read back on the effect's `boundVariables`; the node's `boundVariables.effects` lists each distinct variable once. **Binding the colour replaces the shadow's alpha** with the variable's (0.25 became 1). A COLOR on `radius` throws `in setBoundVariableForEffect: can only bind float variables to radius` | Clone and reassign. `spread` is accepted only on rectangles and ellipses, or on frame kinds with a visible fill and `clipsContent` | shadow; each part dimension or color (a shadow token's colour with alpha needs a variable that carries the alpha) | Yes as `effects` (every kind), bound: each member that refers to a token with a variable; any other member written as a value. Also as `effectStyle`, bound, to a style | typings; measured (§7: spread needs a fill and clipping; 2026-10-21: the bindings, the inner shadow in the second pass) |
| `effects`: layer and background blur | as above | `setBoundVariableForEffect(effect, 'radius', variable)` · FLOAT · `EFFECT_FLOAT`; any other field throws `in setBoundVariableForEffect: Property "field" failed validation: Invalid enum value. Expected 'radius', received '<field>'` (measured on both blurs) | Clone and reassign | dimension | A layer blur: yes as `effects`, a dimension token, bound. A background blur: **No** | typings; measured 2026-10-21 (both passes) |
| `effects`: noise, texture, glass | as above | **No.** The helper returns a copy with `radius` bound (none of the three has a bindable field; noise has no radius at all) and refuses `color` with the `Expected 'radius'` error; the copy is then refused everywhere: by the next helper call (`in setBoundVariableForEffect: Property "effectCopy" failed validation: Unrecognized key(s) in object: 'radius' at .boundVariables`) and by assignment (`in set_effects: Property "effects" failed validation: Unrecognized key(s) in object: 'radius' at [0].boundVariables`) | Clone and reassign. **A noise effect with a `blendMode` key is refused**, though the typings declare one: `in set_effects: Property "effects" failed validation: Unrecognized key(s) in object: 'blendMode' at index 0`; the refusal leaves `effects` empty | None | **No** | typings; measured 2026-10-21 (both passes) |
| `effectStyleId` | as `effects` | No (a style) | `setEffectStyleIdAsync(id)` | shadow, through an effect style | Yes as `effectStyle`, bound, to a style (**FRAME**, **SLOT**) | typings |

## 9. Text

On **TEXT** (and on a text style for the typographic ones). Every setter needs the node's fonts loaded first.

**Which fields read `figma.mixed`** (measured 2026-10-21, on a two-paragraph text whose second paragraph had its own size, font, letter spacing, line height, case, decoration, fill, paragraph spacing and indent, list spacing and wrap style): `fontSize`, `fontName`, `fontWeight`, `letterSpacing`, `lineHeight`, `textCase`, `textDecoration`, `fills`, `paragraphSpacing`, `paragraphIndent`, `listSpacing` and `textWrapStyle` all read mixed. `textAlignHorizontal`, `textAutoResize`, `leadingTrim`, `strokeWeight` and `strokes` are node-wide and did not. A script that reads a text's value must handle mixed on every one of the first twelve.

| Property | Node kinds | Bind | Set | Token | Toghen | Source |
|---|---|---|---|---|---|---|
| `characters` | **TEXT** | Yes: `characters` · STRING · `TEXT_CONTENT` | Assign, string | None (a string) | Yes, bound to a `string` token where a document has one; plain; and wired to a `TEXT` property | typings; measured (§9) |
| `fontName` | **TEXT** | Through its two halves: `fontFamily` and `fontStyle` · STRING · `FONT_FAMILY`, `FONT_STYLE` | Assign `{ family, style }`; the font must be loaded. Mixed | fontFamily (first entry of an array), resolved; fontWeight picks the style | Through `textStyle`, bound, to a style; or through its halves, below | typings; docs (`working_with_variables_section.md`, *Typography variables*) |
| `fontFamily` (binding only) | **TEXT** | Yes · STRING · `FONT_FAMILY`; the value must name a font. A FLOAT throws `in setBoundVariable: variable of resolved type 'FLOAT' cannot be bound to 'fontFamily'`; a STRING scoped only `FONT_STYLE` binds (the scope is not checked) | No setter of its own: `fontName.family` | fontFamily (first entry of an array) | Yes, bound (the whole text); a stack's variable holds its first family, said in the report | docs; measured 2026-10-21 |
| `fontStyle` (binding only) | **TEXT** | Yes · STRING · `FONT_STYLE`; the value must be a style of the font, spelled as Figma spells it (`Semi Bold`). `Bold` made `fontName.style` `Bold` and `fontWeight` 700 | No setter of its own: `fontName.style` | None of its own (fontWeight maps to a style name) | Yes, bound (the whole text), to a `string` token | docs; measured (§9: style names; 2026-10-21) |
| `fontWeight` | **TEXT** | Yes: `fontWeight` · FLOAT · `FONT_WEIGHT`. 700 on Inter gave style `Bold`. **650 kept style `Regular` and set the variable font's axis**: `variationSettings.wght` 650, `fontWeight` 650. On Roboto Mono (also a weight axis) 300 gave `Light`, 650 and 900 kept `Regular` with `wght` 650 and 900. **On a family without a weight axis it snaps to the nearest style**: Courier Prime (Regular, Bold) gave 300 → `Regular` (`fontWeight` 400), 650, 700 and 900 → `Bold` (700); the binding stays reported | **Read-only** on the node: assigning throws `node.fontWeight: read-only property on TEXT node`. Written only through `fontName.style` or a binding | fontWeight | Yes, bound (the whole text); a token only | typings; docs; measured 2026-10-21 |
| `fontSize` | **TEXT** | Yes: `fontSize` · FLOAT · `FONT_SIZE`; also per range with `setRangeBoundVariable`, which leaves the node's `fontSize` mixed | Assign, number ≥ 1. Mixed | dimension | Yes, bound (the whole text) | typings; measured 2026-10-21 |
| `lineHeight` | **TEXT** | Yes: `lineHeight` · FLOAT · `LINE_HEIGHT`. **The bound number is always pixels**: a node at PERCENT 150 or at AUTO reads `{ unit: 'PIXELS', value: 24 }` once bound to 24. A percentage or a multiplier cannot be bound | Assign `{ unit: 'PIXELS' \| 'PERCENT', value }` or `{ unit: 'AUTO' }`; a bare number throws (§5). **Assigning a value removes the binding.** Mixed | dimension (bound); number, a multiplier, only written resolved as PERCENT × 100 | Yes, bound (the whole text) in pixels; a multiplier written as a value | typings; measured (§5; 2026-10-21) |
| `letterSpacing` | **TEXT** | Yes: `letterSpacing` · FLOAT · `LETTER_SPACING`. **The bound number is always pixels**: a node at PERCENT 5 reads `{ unit: 'PIXELS', value: 2 }` once bound to 2 | Assign `{ unit: 'PIXELS' \| 'PERCENT', value }`; a new style defaults to PERCENT 0 (§5). Mixed | dimension in px (bound); in `em` or `%`, only written resolved as PERCENT | Yes, bound (the whole text) in pixels; in `em`, written as a value | typings; measured (§5; 2026-10-21) |
| `paragraphSpacing` | **TEXT** | Yes: `paragraphSpacing` · FLOAT · `PARAGRAPH_SPACING`. The docs say not on a range; **`setRangeBoundVariable` on the first paragraph was accepted** and bound that paragraph only (the next read 0, the node read mixed) | Assign, number. Mixed when paragraphs differ | dimension | Yes, bound (the whole text) | typings; docs; measured 2026-10-21 |
| `paragraphIndent` | **TEXT** | Yes: `paragraphIndent` · FLOAT · `PARAGRAPH_INDENT`. The docs say not on a range; **`setRangeBoundVariable` on the first paragraph was accepted** and bound it only (12; the next read 0; the node read mixed) | Assign, number; `setRangeParagraphIndent` sets one paragraph. Mixed | dimension | Yes, bound (the whole text) | typings; docs; measured 2026-10-21 (both passes) |
| `listSpacing` | **TEXT** | No (not a bindable field) | Assign, number. Mixed | dimension, resolved | Yes, written as a value | typings; measured 2026-10-21 |
| Lists: `setRangeListOptions`, `setRangeIndentation` | **TEXT** | No | Methods per range (§9) | None | **No** | measured (§9) |
| `textAlignHorizontal` | **TEXT** | No (not a bindable field) | Assign: `LEFT` `CENTER` `RIGHT` `JUSTIFIED`. Never mixed | None | Yes, plain | typings; measured 2026-10-21 |
| `textAlignVertical` | **TEXT** | No | Assign: `TOP` `CENTER` `BOTTOM` | None | Yes, plain | typings |
| `textAutoResize` | **TEXT** | No | Assign: `NONE` `HEIGHT` `WIDTH_AND_HEIGHT` (`TRUNCATE` deprecated). Set after the characters (§8) | None | Yes, plain | typings; measured (§8) |
| `textTruncation` | **TEXT** | No (not a bindable field) | Assign: `DISABLED` `ENDING` | None | Yes, plain | typings; measured 2026-10-21 |
| `maxLines` | **TEXT** | No (not a bindable field) | Assign, whole number ≥ 1 or `null`. **Set while `textTruncation` is `DISABLED`, it is dropped silently** (reads `null`, no error); set it after `ENDING`. 0 throws `in set_maxLines: Property "maxLines" failed validation: Number must be greater than or equal to 1`. With `ENDING` and 1, a two-line text read one line high | number, resolved | Yes, written as a value, after `textTruncation` | typings; measured 2026-10-21 |
| `textCase` | **TEXT** | No (not a bindable field) | Assign: `ORIGINAL` `UPPER` `LOWER` `TITLE` `SMALL_CAPS` `SMALL_CAPS_FORCED`. Mixed | None | Yes, plain | typings; measured 2026-10-21 |
| `textDecoration` | **TEXT** | No | Assign: `NONE` `UNDERLINE` `STRIKETHROUGH`. Mixed | None | Yes, plain | typings; measured (§9) |
| `textDecorationStyle`, `textDecorationOffset`, `textDecorationThickness`, `textDecorationColor`, `textDecorationSkipInk` | **TEXT** | No | Assign; `null` unless underlined. Offset and thickness are `{ unit, value }`, colour `{ value: 'AUTO' }` or `{ value: SolidPaint }` | dimension or color, resolved | **No** | typings |
| `leadingTrim` | **TEXT** | No (not a bindable field) | Assign: `CAP_HEIGHT` `NONE`. Typed as mixed-able, but there is no range setter | None | Yes, plain | typings; measured 2026-10-21 |
| `textWrapStyle` | **TEXT** | No | Assign: `AUTO` `BALANCE` `PRETTY`; per paragraph with `setRangeTextWrapStyle`. Mixed | None | **No** | typings; measured 2026-10-21 (mixed) |
| `hangingPunctuation`, `hangingList` | **TEXT** | No | Assign, boolean | None | **No** | typings |
| `openTypeFeatures` | **TEXT** | No | **Read-only** on the node; read per range | None | **No** | typings |
| `textStyleId` | **TEXT** | No (a style) | `setTextStyleIdAsync(id)`; per range `setRangeTextStyleIdAsync`. Mixed | typography, through a text style | Yes as `textStyle`, bound, to a style | typings; measured (§9) |

## 10. Layout grids and guides

| Property | Node kinds | Bind | Set | Token | Toghen | Source |
|---|---|---|---|---|---|---|
| `layoutGrids`: columns and rows | frame kinds | `setBoundVariableForLayoutGrid(grid, field, variable)`, which returns a new grid · FLOAT · no scope names a layout grid. **The fields depend on the grid's `alignment`**: `STRETCH` takes `count`, `gutterSize`, `offset` and refuses `sectionSize` (`in setBoundVariableForLayoutGrid: Property "field" failed validation: Invalid enum value. Expected 'count' \| 'offset' \| 'gutterSize', received 'sectionSize'`); `CENTER` takes `sectionSize`, `count`, `gutterSize` and refuses `offset`; `MIN` took `sectionSize`. Read back on the grid's `boundVariables` and in the node's `boundVariables.layoutGrids`, one alias per distinct variable | Clone and reassign | number (`count`), dimension (the rest) | Yes as `layoutGrids` (**FRAME**, **SLOT**, **INSTANCE**), bound: the fields the alignment takes, the others refused; a literal plain | typings; docs; measured 2026-10-21 |
| `layoutGrids`: square grid | frame kinds | `sectionSize` only · FLOAT; `count` throws `Expected 'sectionSize', received 'count'` | Clone and reassign | dimension | Yes as `layoutGrids`, `GRID`, bound: `sectionSize` | typings; measured 2026-10-21 |
| Layout grid `color`, `alignment`, `visible` | frame kinds | No | Part of the grid object | color, resolved | `color` written as a value (a token, at the declared defaults) or plain; `alignment` plain; `visible` **No** | typings |
| `gridStyleId` | frame kinds | No (a style) | `setGridStyleIdAsync(id)` | None | **No** | typings |
| `guides` | frame kinds | No | Assign `[{ axis: 'X' \| 'Y', offset }]` | dimension, resolved | **No** | typings |

## 11. Instance and component

| Property | Node kinds | Bind | Set | Token | Toghen | Source |
|---|---|---|---|---|---|---|
| `mainComponent` | **INSTANCE** | No | `swapComponent(component)`, or the `mainComponent` setter | None | Yes as `component`, plain, and wired to an `INSTANCE_SWAP` property | typings |
| Property values: `setProperties({ name: value })` | **INSTANCE** | Yes: a `VariableAlias` as the value, BOOLEAN or STRING; read back in `boundVariables.componentProperties` | Method | None | Yes as `set`: plain, or bound to a `boolean` or `string` token | typings |
| Property default: `componentPropertyDefinitions[name].defaultValue` | COMPONENT, COMPONENT_SET | Yes: field `defaultValue`, a `VariableAlias` | `editComponentProperty(name, { defaultValue })` | None | Defaults only: plain, or bound to a `boolean` or `string` token | typings |
| `componentPropertyReferences` | layers inside a component | No | Assign `{ visible?, characters?, mainComponent? }`; a slot through `slotContentId` (§8) | None | Yes, plain, as `(property)` wires | typings; measured (§8, §13) |
| `isExposedInstance` | **INSTANCE** inside a component | No | Assign, boolean | None | Yes, plain | measured (§13) |
| `explicitVariableModes` | every scene kind | No | `setExplicitVariableModeForCollection(collection, modeId)`; read-only map | None | Yes as `modes`, plain | typings; measured (§8, §10) |

---

## What the roster found

### Settable but not bindable: a script writes the resolved token

These carry a value a token could hold, but no variable can be bound to them. A component file that takes a token for one must resolve it and write the number, which then stops following the token until the next run.

- **Sizes and positions:** `x`, `y`, `cornerSmoothing`, `gridRowCount` and `gridColumnCount`, a grid track's `FIXED` or `FLEX` value, `guides`.
- **Strokes:** `dashPattern` (a DTCG `strokeStyle`'s `dashArray`, or a `border`'s `style`), `strokeMiterLimit`, `strokeCap` (a `strokeStyle`'s `lineCap`).
- **Paints:** a paint's `opacity`, a gradient's stop positions and its angle (`gradientTransform`). A solid paint's alpha lives in `opacity`, so a colour token with alpha below 1 binds its colour and loses its alpha, unless the variable itself holds the alpha. Toghen writes the alpha as the paint's opacity, at the declared defaults (22 October 2026), and a gradient token's positions and angle the same way.
- **Text:** `listSpacing`, `maxLines`, a line height or letter spacing in PERCENT (a unitless `lineHeight`, an `em` letter spacing), and the decoration's offset, thickness and colour.
- **Layout grids:** the grid's colour, which Toghen writes at the declared defaults.

Every enum (alignments, `layoutWrap`, `strokeAlign`, `blendMode`, `textCase`, `textAlignHorizontal` and the rest) is settable and never bindable, and no DTCG type carries it.

### Bindable only on parts, or reported on parts

- **`cornerRadius`** reads back on the four corners on a node that has them (frame kinds, RECTANGLE). On an ELLIPSE, and on a LINE, it reads back as `cornerRadius`.
- **`strokeWeight`** reads back on the four sides on a node that has them (frame kinds, RECTANGLE). On a LINE it reads back as `strokeWeight`.
- **Paints, effects and layout grids** are bound per part: each solid paint's colour, each gradient stop's colour, each shadow's five fields, each grid's fields. The node's `boundVariables.fills`, `.effects` and `.layoutGrids` only list the variables, once each.
- **`fontName`** binds as two halves, `fontFamily` and `fontStyle`, and `fontWeight` binds although it cannot be assigned.
- **Text fields** bind per range with `setRangeBoundVariable`, and read back on the node as an array of aliases.

### Not covered by Toghen yet

What `FIELDS` does not offer, by area:

- **Auto-layout:** `strokesIncludedInLayout`, `itemReverseZIndex`.
- **Grid layout:** `gridItemsPositioning`, `gridAutoTracks`.
- **Position:** flips.
- **Appearance:** aspect ratio lock.
- **Strokes:** `strokeMiterLimit`, brush and dynamic strokes; `strokes` and the stroke fields on a **TEXT** and on an **INSTANCE**; `strokeWeight` alone on a **TEXT**; `strokeCap` on a frame.
- **Effects:** a background blur, a progressive blur, noise, texture and glass; an effect's `blendMode` and `showShadowBehindNode`. Shadows and layer blurs are `effects`; `effectStyle` is still on **FRAME** and **SLOT** only.
- **Text:** lists, wrap style, decoration style, offset, thickness, colour and skip ink, hanging punctuation and hanging lists, OpenType features; range fills and any field on part of a text (Toghen binds a text field on the whole text).
- **Layout grids and guides:** a grid's `visible`, `gridStyleId`, `guides`.

### Surprises

- **Bindings are looser than assignments, and they wait.** `minWidth` binds on a frame where assigning it throws; `counterAxisSpacing` and the grid gaps bind on frames that do not wrap or are not grids; a LINE takes a `cornerRadius` binding though it has no such property. Each is still reported in a fresh call and draws nothing; `minWidth`, `counterAxisSpacing` and the grid gaps take effect as soon as the frame becomes auto-layout, wraps or is a grid with placed children. The line's never draws.
- **The typings are stricter than Figma in two places.** `layoutWrap = 'WRAP'` works on a `VERTICAL` frame, and `counterAxisAlignContent` can be set on a frame that does not wrap; both are documented to throw.
- **A bound line height or letter spacing is always pixels.** Binding replaces a PERCENT or AUTO value with PIXELS, so a unitless line height token cannot follow its variable.
- **Binding a shadow's colour replaces its alpha** with the variable's.
- **A gradient stop binds**, by writing the alias into the stop, although the helper refuses gradients.
- **`fontWeight` on a variable font is an axis.** 650 on Inter keeps the style name `Regular` and sets `wght` 650.
- **`maxLines` set before truncation is on is dropped without an error.**
- **The docs say paragraph spacing and indent cannot bind on a range; both can**, one paragraph at a time.
- **A noise effect refuses the `blendMode` key** its typings declare, and noise, texture and glass cannot be bound, although the helper hands back a copy that looks bound.
- **A wrapping `VERTICAL` frame wraps into columns**, which the typings say cannot happen.
- **`fontWeight` on a family without a weight axis snaps to the nearest style**, and the binding stays.

### Still unmeasured

- Whether a waiting binding survives closing and reopening the file. The nearest measured: a frame's waiting `minWidth` binding, left in the file, was still reported two calls later, read through a fresh page fetch and by id.
- Anything in the desktop plugin rather than through `use_figma`, and which picker in Figma's UI offers a variable for a layout grid field.
