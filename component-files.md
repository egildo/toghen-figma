# Component files — the format

> What a `.component.kdl` file may say, node by node, for whoever writes one.
> How to write one, with a worked example, is in [guide.md](./guide.md#write-a-component-file); why the format is shaped this way is in [specs.md](./specs.md#components-from-files); the reader's API, the engine and the command line are in [reference.md](./reference.md#component-files).

---

## What a component file is

A design system describes each Figma component in a text file, `<component>.component.kdl`, kept in its own repository beside the code the component mirrors. The file says what the component is: its properties, its layers, and what makes one variant differ from another. Toghen reads it, expands it into one member per combination of variant values, checks every member, and makes Figma agree with it in place: every node it creates carries a stamp in plugin data naming the part of the file it came from, so running the file again finds that work and changes only the difference, never rebuilding the set.

The file is a [kdlet](https://codeberg.org/egildo/kdlet) file: [KDL](https://kdl.dev/) with a small template language on top. kdlet owns the language, `guard`, `when`, `else`, `define` and `+call`; its [manual](https://codeberg.org/egildo/kdlet/src/branch/main/docs/manual.md) is the reference for those. Toghen owns five top-level words and the vocabulary of layers, fields and values, which is Figma's, spelled as the Plugin API spells it. This page is the reference for Toghen's part, and names kdlet's part where a component file meets it.

Three rules hold the whole format together:

- **A variant axis is an input.** The file is evaluated once per combination of axis values, and each evaluation is one member's tree. Nothing else is an input.
- **A `when` stands inside the layer it changes.** There is no rule that reaches a layer from elsewhere, and no way to move one. A region that sits in a different parent per variant is a `define` called under opposite guards.
- **A value is a token or a literal that says so.** Every field Figma can bind to a variable takes a token reference, `"{space.md}"`, or a literal marked `(literal)`. A bare number is refused, so that every number in a file is either followed from the tokens or explained in a comment beside it.

## The skeleton

```kdl
component Toggle
description "A switch with an optional label."

properties {
    VARIANT State off on
    BOOLEAN "Show Label" default=#true
    TEXT Label default="Label"
}

guard on { is (input)State on }

FRAME Toggle layoutMode=HORIZONTAL layoutSizingHorizontal=HUG layoutSizingVertical=HUG counterAxisAlignItems=CENTER itemSpacing="{space.sm}" {
    // The track and thumb sizes are the design's, not a token's.
    FRAME Track layoutMode=HORIZONTAL primaryAxisAlignItems=MIN width=(literal)40 height=(literal)24 cornerRadius="{radius.full}" {
        fills "{surface.muted}"
        when on primaryAxisAlignItems=MAX { fills "{surface.accent}" }
        FRAME Thumb layoutMode=NONE width=(literal)20 height=(literal)20 cornerRadius="{radius.full}" {
            fills "{surface.raised}"
        }
    }
    TEXT Caption visible=(property)"Show Label" characters=(property)Label textStyle="{text.label}"
}
```

The top-level nodes may come in any order. A comment is KDL's, `// …`, and is the right place for the reason a literal is a literal.

## Top-level nodes

| Node | Count | What it is |
|---|---|---|
| `component <Name> [tokens="{group}"] [layout=parts] [across="<axis>, …"]` | exactly one | The component's name. It has no body and takes one name. `tokens` names the component's token group, which binds the root layer and brings in an axis for each part axis the group's subgroups use (see [From the tokens](#from-the-tokens)). `layout=parts` keeps those axes in the path, one variable per part (see [How parts become variables](#how-parts-become-variables)). `across` names the `VARIANT` axes laid out across the set's board, separated by commas; the others go down, and each direction nests in the order the axes are declared. Without it, axes go across from the last until the columns are at least the rows |
| `description "<text>"` | at most one | The component's description, as Figma shows it |
| `properties { … }` | at most one | The component properties, one child node each |
| `exclude <Axis>=<value>…` | any number | A combination that is never built |
| `include <Axis>=<value>…` | any number | When any is present, only the combinations an `include` matches are built |
| `guard <name> { … }` | any number | A named condition on the variant axes (kdlet's) |
| `define <name> <parameter>…  { … }` | any number | A layer subtree written once, called with `+<name>` (kdlet's) |
| `FRAME <address> …` | exactly one | The root layer. It becomes the component itself in each member |

`component`, `description`, `properties`, `exclude` and `include` are Toghen's: kdlet hands them back unread. `guard`, `define` and `+call` are kdlet's. Everything else is a layer, and Figma's.

Refused: a second `component` or `description`; a `component` with a body, with no name, or with more than one argument; a `tokens` that is not a token reference in quotes (`tokens="{button}"`); a `layout` other than `parts`, as in `component: layout takes "parts" (one variable per part), not "folded"; leave it out for the folded layout`; `layout=parts` without `tokens`, as in `component: layout=parts is the layout of the parts of a token group, so it needs tokens="{group}"`; an `across` that names an axis twice (`component: across="a, a" names "a" twice`), has an empty name, or names something that is not a `VARIANT` axis once the axes are known (`component: across names "x", which is not a VARIANT axis`); a `description` that is not text; a top-level node that is none of the above.

## Properties

Each child of `properties` is named for the Figma property type it declares. All five types share one namespace: two properties may not have one name, whatever their types, because Figma renames one of two that collide, silently. A property name may not contain `#`, which Figma uses to tell properties apart.

| Node | Arguments and properties |
|---|---|
| `VARIANT <Axis> <value>…` | A variant axis and its values. The first value is the default. Values are strings: quote a value that is not a bare word, and quote one that reads as another KDL value (`"true"`, since `#true` is a boolean) |
| `VARIANT <Axis> (modifier)"<name>"` | For a modifier of the design system, such as `theme`. The values are its contexts, the default first, and each member pins `modes <name>=<value>` on its root. A part axis never uses it. `(modifier)` is accepted only here, alone, in quotes: not beside a list of values, and not twice |
| `BOOLEAN <Name> default=#true` | `default` is `#true` or `#false`, or a token reference to a `boolean` token, whose variable is bound to it; required |
| `TEXT <Name> default="…"` | `default` is text, or a token reference to a `string` token, whose variable is bound to it; required |
| `INSTANCE_SWAP <Name> default=<Component>` | `default` is a component's name, or `(key)"<published key>"`; never a token reference. May have `preferred` children |
| `SLOT <Name> …` | `description` (text), `minChildren` and `maxChildren` (whole numbers of at least 0, and the minimum not above the maximum), `allowPreferredValuesOnly`, `stretchChildOnInsert`, `displayEmptyByDefault` (`#true` or `#false`), all optional. May have `preferred` children |

`preferred COMPONENT` and `preferred COMPONENT_SET` are the only children an `INSTANCE_SWAP` or a `SLOT` takes. Each names its component by exactly one of `key="<published key>"` or `name="<component name>"`; both, or neither, is refused with its line.

- **A name** is found as an instance swap's default is: the overrides map, then a declared library, then the file. A `COMPONENT` named after a set offers the set's default variant; a `COMPONENT_SET` must name a set. A name found nowhere, or found twice, stops the run before any write, with its line.
- **Where each is written.** FigCraft has no published keys, so it takes preferred values by name only, written as the components' ids; one by key is refused there. Figma takes them by key only: one by name is refused by name, before any write, until the desktop app shows that Figma takes a resolved component's key (decisions.md, *Measurements only the desktop app can give*). A file meant for both targets leaves preferred values out.

**The rules for an axis.** An axis name may not contain `,` or `=`, which the members' names use, nor `.`, which a guard cannot read: an axis is an input, and kdlet's reference `(input)<Axis>` names a field with no dot. An axis needs at least one value, may not repeat one, and a value may not be empty or contain `,` or `=`. An axis with a space in its name is written in quotes everywhere: `VARIANT "Header in" page content`, `(input)"Header in"`, `exclude "Header in"=content`.

**An axis from a token group.** `VARIANT <Axis> from="{group}"` takes its values from the names of the group's children, in the document's order, the first being the default, as `(modifier)` takes a modifier's contexts. A new child in the tokens is a new variant on the next run, with no edit to the file; `exclude` prunes a child that is not a value. `from` stands alone: not beside a list of values or `(modifier)`, and not with an `(input)` segment inside it. Refused, with the line: a group that names nothing or is a token, a document that cannot say, a child name that cannot be a value (a `,` or `=`, empty). Children are ordered as the document's paths first meet them, which is JS object-key order, so purely numeric child names come first, numerically.

**Only the axes are inputs.** `BOOLEAN`, `TEXT`, `INSTANCE_SWAP` and `SLOT` properties are wired in Figma by `(property)` and no guard reads them.

```kdl
properties {
    VARIANT Variant solid outline
    VARIANT Theme (modifier)"theme"
    TEXT Label default="Label"
    BOOLEAN "Show Icon" default=#true
    INSTANCE_SWAP Icon default=Glyph {
        preferred COMPONENT_SET key="7f3a…"
    }
    SLOT Content description="What the card holds." minChildren=1 allowPreferredValuesOnly=#false {
        preferred COMPONENT key="b91c…"
    }
}
```

## A segment of a reference from an axis

A reference in a layer field, or in a `tokens=` binding value, may take part of its path from an axis:

```kdl
properties { VARIANT hue from="{hue}" }
FRAME Avatar {
    when soft  { fills "{hue.(input)hue.soft.background}" }
    when solid { fills "{hue.(input)hue.solid.background}" }
}
```

Inside the braces, `(input)<Axis>` is replaced, in each member, by the axis's value; `(input)"Header in"` names an axis with a space. The segment ends at the next `.` or the closing brace, and is a whole segment (`blue-(input)hue` is refused). Each member then holds one ordinary reference, which every check on a reference applies to. A value with no token is an error naming the member, the axis value and the line, and so is an axis the file does not have. A value that holds `.`, `{` or `}` cannot be a segment, since it would change the path's shape. `(input)` outside braces is plain text. The `component` line's own `tokens=` is read once for the file and takes no segment.

## Layers

A layer is a node named `FRAME`, `SLOT`, `TEXT`, `INSTANCE` or `LINE`. Its first argument is its **address**: its layer name, which the stamp records and later runs find it by, so addresses are unique within a member. A `SLOT` layer's address is its property's name, and every `SLOT` property has exactly one `SLOT` layer in every member. `TEXT`, `INSTANCE` and `LINE` layers have no child layers. A `LINE`'s length is its `width`; it has no height, so `height`, `minHeight` and `maxHeight` are refused on it. The root layer is a `FRAME`, and it is the member's component itself: its fields are set on the component, it takes the member's name, and no property is wired to it.

A **scalar field** is a KDL property on the layer, named as the Plugin API names it: `layoutMode=HORIZONTAL`, `cornerRadius="{radius.md}"`. A **structured field** is a child node of the layer, because its value is a list or a structure:

| Node | Value |
|---|---|
| `fills <value>…`, `strokes <value>…` | Paints, as arguments. `fills` with no arguments is no paint |
| `gridRowSizes { … }`, `gridColumnSizes { … }` | Tracks, one child node each: `FLEX [n]`, `FIXED n`, `HUG`. `FLEX` takes a number above 0 and defaults to 1; `FIXED` a number of at least 0; `HUG` none. At least one track |
| `grid row=<n> column=<n> [rowSpan=<n>] [columnSpan=<n>]` | The cell a child of a `GRID` layer sits in. `row` and `column` are required, whole numbers of at least 0; a span is a whole number of at least 1 |
| `dashPattern <value>…` | Dash and gap lengths, as arguments: one token reference to a `strokeStyle` token (its `dashArray` is written, in pixels, at the defaults), or `(literal)` numbers of at least 0. `dashPattern` with no arguments is a solid stroke |
| `constraints horizontal=<c> vertical=<c>` | How the layer follows its parent's resizing, both axes required, each `MIN` `CENTER` `MAX` `STRETCH` `SCALE` |
| `modes <Collection>=<mode>…` | Pins the layer to a mode of a variable collection, at least one pair: a local collection, or one a library the run declares with `--use` holds (found through the lock, as the collection its variables are named under). A library's collection is pinned in FigCraft, which checks the mode's name; Figma refuses it until pinning one is measured there. A name found both here and in a library, or in two libraries, is an error. With variable sync's collection per modifier, a pin names a modifier and a context: `modes density=compact`. A member pins its folded axes on its root itself, so the reader refuses a `modes` line on the root that names one of them |
| `effects <value>…` | Effects, as arguments: shadow tokens, dimension tokens (a layer blur's radius), `(literal)` radii. See [Gradients, effects and layout grids](#gradients-effects-and-layout-grids) |
| `layoutGrids { … }` | Layout grids, one child node each: `COLUMNS`, `ROWS` or `GRID`, its fields as properties. At least one grid. See [Gradients, effects and layout grids](#gradients-effects-and-layout-grids) |

The reader refuses a structured field written as a KDL property, and a scalar field written as a child node.

### Fields by layer kind

| Layers | Field | Value |
|---|---|---|
| all | `visible` | boolean, a token reference to a `boolean` token (bound), or `(property)` to a `BOOLEAN` property |
| all | `opacity` | an opacity token, or `(literal)` from 0 to 1. The token must be an opacity (named `opacity`, declared `["OPACITY"]`, or referred to only by opacities); any other token is refused. Its variable holds a percentage, the literal does not: see the guide, *An opacity is a percentage in Figma* |
| all | `rotation` | an angle: a number in degrees, counter-clockwise as Figma turns, bare or `(literal)`. No token holds an angle, so a bare number is accepted here |
| all | `modes` | structured |
| all | `grid` | structured |
| all | `layoutSizingHorizontal`, `layoutSizingVertical` | `FIXED` `HUG` `FILL` |
| all | `width`, `height` | size: a dimension |
| all | `minWidth`, `maxWidth`, `minHeight`, `maxHeight` | size: a dimension, or `#null` |
| `FRAME` `SLOT` `TEXT` | `tokens` | a token reference naming a group (see [Bindings from a group](#bindings-from-a-group)) |
| `FRAME` `SLOT` | `layoutMode` | `NONE` `HORIZONTAL` `VERTICAL` `GRID`; a `SLOT` is never `GRID` |
| `FRAME` `SLOT` | `primaryAxisAlignItems` | `MIN` `MAX` `CENTER` `SPACE_BETWEEN` `SPACE_EVENLY` `SPACE_AROUND` |
| `FRAME` `SLOT` | `counterAxisAlignItems` | `MIN` `MAX` `CENTER` `BASELINE` |
| `FRAME` `SLOT` | `itemSpacing`, `paddingTop`, `paddingRight`, `paddingBottom`, `paddingLeft`, `gridRowGap`, `gridColumnGap`, `strokeWeight`, `strokeTopWeight`, `strokeRightWeight`, `strokeBottomWeight`, `strokeLeftWeight`, `cornerRadius`, `topLeftRadius`, `topRightRadius`, `bottomRightRadius`, `bottomLeftRadius` | dimension. `cornerRadius` is set first, and a corner field overrides its corner |
| `FRAME` `SLOT` | `effectStyle` | a token reference to an effect style, made by style sync from a `shadow` token; a token that is only a reference to such a shadow binds its target's style, and a text style named through a typography reference does the same |
| `FRAME` `SLOT` | `gridRowSizes`, `gridColumnSizes` | structured |
| `FRAME` `SLOT` | `clipsContent` | boolean |
| `FRAME` `SLOT` `TEXT` | `fills` | structured |
| `FRAME` `SLOT` `LINE` | `strokes` | structured |
| `LINE` | `strokeWeight` | dimension |
| `TEXT` | `characters` | text, a token reference to a `string` token (bound), or `(property)` to a `TEXT` property |
| `TEXT` | `textStyle` | a token reference to a text style |
| `TEXT` | `textAutoResize` | `NONE` `HEIGHT` `WIDTH_AND_HEIGHT` |
| `TEXT` | `fontFamily` | a token reference only, to a `fontFamily` or `string` token: its variable is bound. A font stack's variable holds the first family, and the report says so |
| `TEXT` | `fontStyle` | a token reference only, to a `string` token holding a style name as Figma spells it (`Semi Bold`) |
| `TEXT` | `fontWeight` | a token reference only, to a `fontWeight` or `number` token: Figma cannot assign a weight, only bind one, and picks the style |
| `TEXT` | `fontSize`, `paragraphSpacing`, `paragraphIndent` | dimension |
| `TEXT` | `lineHeight` | dimension, or a `number` token: in pixels it is bound; a unitless number (a multiplier) is written as its value, as a percentage. A `(literal)` is pixels |
| `TEXT` | `letterSpacing` | dimension, or a `letterSpacing` token: in pixels it is bound; in `em` it is written as its value, as a percentage. A `(literal)` is pixels |
| `TEXT` | `listSpacing` | dimension, written as its value: Figma cannot bind it |
| `TEXT` | `maxLines` | a `number` token or a `(literal)` whole number of at least 1, written as its value; it holds only with `textTruncation=ENDING` |
| `TEXT` | `textAlignHorizontal` | `LEFT` `CENTER` `RIGHT` `JUSTIFIED` |
| `TEXT` | `textAlignVertical` | `TOP` `CENTER` `BOTTOM` |
| `TEXT` | `textCase` | `ORIGINAL` `UPPER` `LOWER` `TITLE` `SMALL_CAPS` `SMALL_CAPS_FORCED` |
| `TEXT` | `textDecoration` | `NONE` `UNDERLINE` `STRIKETHROUGH` |
| `TEXT` | `textTruncation` | `DISABLED` `ENDING` |
| `TEXT` | `leadingTrim` | `CAP_HEIGHT` `NONE` |
| `INSTANCE` | `component` | a component's name, `(key)"…"`, or `(property)` to an `INSTANCE_SWAP` property; required |
| `INSTANCE` | `set` | structured: the instance's properties by display name, see [below](#an-instances-properties) |
| `INSTANCE` | `isExposedInstance` | `#true` or `#false`: its properties listed on the component's instances, see [below](#an-instances-properties) |
| all | `effects` | structured; not beside `effectStyle` |
| `FRAME` `SLOT` `INSTANCE` | `layoutGrids` | structured |
| `FRAME` `SLOT` | `layoutWrap` | `NO_WRAP` `WRAP`. Only on a `HORIZONTAL` or `VERTICAL` layer; a `VERTICAL` one wraps into columns |
| `FRAME` `SLOT` | `counterAxisAlignContent` | `AUTO` `SPACE_BETWEEN`. Only on a `HORIZONTAL` or `VERTICAL` layer |
| `FRAME` `SLOT` | `counterAxisSpacing` | dimension, bound: the gap between the rows (or columns) of a wrapping flow. Only on a `HORIZONTAL` or `VERTICAL` layer |
| `FRAME` `SLOT` | `cornerSmoothing` | a number token or `(literal)` from 0 to 1, written as a value: Figma cannot bind it |
| all | `gridChildHorizontalAlign`, `gridChildVerticalAlign` | `MIN` `CENTER` `MAX` `AUTO`: how a child of a `GRID` layer sits in its cell. Only on a child of a `GRID` |
| all | `layoutPositioning` | `AUTO` `ABSOLUTE`. Only on a child of a layer with a layout |
| all | `x`, `y` | a dimension, written as a value: Figma cannot bind it. Not on the root, which Toghen places; on a child of a layer with a layout only with `layoutPositioning=ABSOLUTE` |
| all | `constraints` | structured |
| all | `blendMode` | Figma's `BlendMode`: `PASS_THROUGH` `NORMAL` `DARKEN` `MULTIPLY` `LINEAR_BURN` `COLOR_BURN` `LIGHTEN` `SCREEN` `LINEAR_DODGE` `COLOR_DODGE` `OVERLAY` `SOFT_LIGHT` `HARD_LIGHT` `DIFFERENCE` `EXCLUSION` `HUE` `SATURATION` `COLOR` `LUMINOSITY` |
| `FRAME` `SLOT` `LINE` | `strokeAlign` | `INSIDE` `OUTSIDE` `CENTER` |
| `FRAME` `SLOT` `LINE` | `strokeJoin` | `MITER` `BEVEL` `ROUND` |
| `FRAME` `SLOT` `LINE` | `dashPattern` | structured |
| `LINE` | `strokeCap` | `NONE` `ROUND` `SQUARE` `ARROW_LINES` `ARROW_EQUILATERAL` `DIAMOND_FILLED` `TRIANGLE_FILLED` `CIRCLE_FILLED` |

The format narrows Figma in a few places, on purpose. The wrap fields and `cornerSmoothing` are on `FRAME` and `SLOT`, as the other auto-layout and corner fields are. The stroke fields are on the kinds that take `strokes`. `strokeCap` is on a `LINE` only: a frame's outline has no open end to cap. `x` and `y` are refused where Figma would ignore them, so a run never writes a position the next run reads back as moved.

An unknown field, a field on a layer kind that does not take it, and a value of the wrong kind are each refused, naming the layer.

**A text's fields, or its style.** A text style sets the font, size, line height, letter spacing, paragraph spacing and indent, list spacing, case, decoration and leading trim. One of those beside `textStyle` would be a second source for one value, so it is refused, naming both: write the style, or the fields. Alignment, truncation and `maxLines` are the text's own, and go beside a style. A text field is bound on the whole text: a text whose ranges differ is not a component file's to describe.

### What an omitted field means

The engine sets only the fields the file declares, with these exceptions, so that a new node does not carry what Figma starts it with:

- **Fills.** A frame, slot or root the file gives no `fills` has its fills cleared, since a new frame starts white.
- **Strokes.** A layer that gives only a side's weight (`strokeBottomWeight`) gets `strokeWeight` 0 first, so the other sides are none. A layer that gives a side's weight is given `strokeAlign` `INSIDE` too, unless it declares its own `strokeAlign`, which then wins.
- **A slot clips** its contents unless the layer says `clipsContent=#false`.
- **A wired field starts at its property's default**: a `visible=(property)"Show Nav"` layer starts visible or not as the boolean's `default` says, a wired `characters` as the text's.
- **A text's sizing** is set after its style, characters and text fields, so an empty text does not freeze at zero width. The font's halves come first among the text fields, since every later write needs the font they make loaded; `maxLines` comes after `textTruncation`, since Figma drops it silently while truncation is off.

A field the file stops declaring keeps the value it has in Figma; the run reports it once.

### Gradients, effects and layout grids

These take tokens whose parts Figma binds one by one. A part that follows a token with a variable is bound to it; any other part is written as its value at the design system's defaults, and the run's report says so once (see *A token where Figma cannot bind it*, under [Values](#values)). Each reads its tokens from the loaded resolver document, so a file that uses them needs one loaded.

**A gradient on a paint.** `fills` and `strokes` take a `gradient` token wherever they take a colour: `fills "{gradient.dawn}"`. The design system says which a token is. Each stop whose colour is a reference to a colour token with a variable is bound to it; a stop whose colour is written out is written. The stops' positions are written. A W3C gradient is a list of stops with no angle, and runs left to right (Figma's `gradientTransform` `[[1, 0, 0], [0, 1, 0]]`); a gradient in the object form, `{ type, angle, stops }`, has its angle turned about the layer's centre, as style sync turns one. There is no field for a fill style.

**Effects.** `effects` lists the layer's effects in order, each argument one of:

- a `shadow` token: a drop shadow, or an inner shadow when `inset` is true; a token that holds a list of shadows gives one effect each. Its `color`, `offsetX`, `offsetY`, `blur` and `spread` each bind (the colour `EFFECT_COLOR`, the rest `EFFECT_FLOAT`) when it refers to a token with a variable; a member written out is written. Binding the colour gives the shadow its variable's alpha.
- a `dimension` token: a layer blur, its radius bound to the token's variable.
- `(literal)` a number: a layer blur of that radius in pixels.

```kdl
FRAME Card {
    effects "{shadow.raised}" "{blur.soft}"
}
```

A bare number is refused, as on a dimension. `effects` and `effectStyle` on one layer are refused together, naming both: the style sets the effects the field sets. Figma draws a shadow's spread only on a frame with a visible fill that clips its content (measured §7). A background blur, noise, texture and glass are not written.

**Layout grids.** `layoutGrids` holds one child node per grid, named by its pattern, its fields as properties:

```kdl
FRAME Page {
    layoutGrids {
        COLUMNS alignment=STRETCH count="{grid.columns}" gutterSize="{space.md}" offset="{space.lg}"
        ROWS alignment=CENTER count=4 gutterSize=(literal)8 sectionSize="{space.xl}"
        GRID sectionSize="{space.sm}" color=(literal)"#ff00001a"
    }
}
```

| Pattern | `alignment` | Fields it takes |
|---|---|---|
| `COLUMNS`, `ROWS` | `STRETCH` | `count`, `gutterSize`, `offset` |
| `COLUMNS`, `ROWS` | `CENTER` | `count`, `gutterSize`, `sectionSize` |
| `COLUMNS`, `ROWS` | `MIN`, `MAX` | `count`, `gutterSize`, `offset`, `sectionSize` |
| `GRID` | none | `sectionSize` |

Each field it takes is required but `offset`, which is 0 when left out. `count` is a `number` token or a whole number of at least 1; `gutterSize`, `offset` and `sectionSize` are dimensions, a token or a `(literal)` number. A token is bound. A field the grid's alignment does not take is refused with its line, since Figma refuses to bind it there (`STRETCH` refuses `sectionSize`, `CENTER` `offset`, a square grid all but `sectionSize`; measured §14). `color` is a colour token, written as its value since Figma cannot bind it, or a `(literal)` colour; a grid that names none is red at 10%.

## Values

| Form | Meaning |
|---|---|
| `"{space.md}"` | A token reference: a string that is exactly one reference, in the core's [reference grammar](https://codeberg.org/Toghen/lib/src/branch/main/reference.md#reference-grammar). Resolved by name in Figma to the variable or style that variable sync and style sync wrote for the token |
| `(literal)8`, `(literal)"#ffffff80"` | A literal on purpose: a number for a dimension, `#rrggbb` or `#rrggbbaa` for a colour. Why it is a literal belongs in a comment beside it. On `characters` or `visible` in a `when`, it marks a value that replaces the property's wiring on purpose (see *Conditions*) |
| `(property)"Show Nav"` | Wires the field to a component property of the matching type |
| `(key)"…"` | A published component key. Accepted only where a component is named |
| `(input)<Axis>` | kdlet's reference: the axis's value as text, which a `define`'s parameter or a layer's name may take |
| `#null` | Clears a size limit: accepted on `minWidth`, `maxWidth`, `minHeight` and `maxHeight` only. On `width` or `height` it is refused, `"width=#null": a width cannot be cleared; to let the layer size itself, write layoutSizingHorizontal=HUG (or FILL)` |
| `"{{size.sm}}"` | A doubled brace is a literal brace, as in a token's value ([reference grammar](https://codeberg.org/Toghen/lib/src/branch/main/reference.md#reference-grammar)): the text `{size.sm}`, never the token. Written the same in KDL and in the JSON of a data file |
| a bare word, number, `#true`, `#false` | Plain: an enum, a boolean, text |

**A token where Figma cannot bind it.** A token on a field, or on part of a field, that Figma cannot bind is written as its value at the design system's defaults (the default context of every modifier), and the run's report says so once: the layer will not follow the token until the next run. The value comes from the loaded resolver document, so such a token needs one: with none loaded, the run stops at its line, and a token of a type the field does not take stops it too. Such fields are `x` and `y` (a dimension), `cornerSmoothing` (a number) and `dashPattern` (a `strokeStyle`, as its dash array). Such a part is a colour's alpha in `fills` or `strokes`: the paint's colour is bound to the token's variable, and its opacity is written as the alpha. A colour with no alpha, or an alpha of 1, is bound and needs nothing more. On a text, `listSpacing` and `maxLines` are always written as their value, and a line height or letter spacing is whenever it is not in pixels: Figma binds those two in pixels only. Which a line height or letter spacing is, only the token's unit says, so a token on either needs the resolver document loaded, in pixels too.

`literal`, `property`, `key` and `modifier` are the tags the vocabulary gives kdlet. A **dimension** is a token or a `(literal)` number; the reader refuses a bare number, with a message that says what to write instead. A **paint** is a token or a `(literal)` colour; it refuses a bare colour string the same way. Any other tag, or a tag where it is not accepted, is an error.

## Conditions, as a component file uses them

The language is kdlet's, and the [manual](https://codeberg.org/egildo/kdlet/src/branch/main/docs/manual.md) is the reference for it. A component file uses it this way.

**A guard names a condition once.** `is (input)state hover pressed` is true when the axis has either value; `not <guard>`, `all { … }` and `any { … }` build larger conditions. A guard reads only variant axes and lists only values the axis has; a guard with no body, which in kdlet marks one the host supplies, is supplied by Toghen when its name is a part key: `guard selected`, written alone, holds where the axis the parts give `selected` to has that value, as `is (input)selection selected` would. Any other guard with no body is refused, and so is one inside a `define`, whose `(input)` reads a parameter. A part key is a value, other than `rest`, of exactly one axis, that axis taken from the parts; a declared axis that has the same value makes it ambiguous, and the guard needs its body. A `when` that names a part key no guard declares fails as any undeclared guard does, and the error says the line to write: kdlet checks a guard's name when it reads the file, before the axes from the tokens are known, so the line stays. A guard is visible in the body it is written in and inward, so one written at the top of the file is visible everywhere except inside a `define`, which is closed.

```kdl
guard on { is (input)State on }
guard hovered { is (input)state hover pressed }
guard primary { is (input)variant primary }
guard header-in-page { not header-in-content }
guard upcoming { all { not current; not done } }
```

**`when` stands inside the layer it changes** and names one or more guards; all must hold. Its properties are fields of that layer, and its children are fields written as child nodes, or child layers.

```kdl
FRAME Track layoutMode=HORIZONTAL primaryAxisAlignItems=MIN {
    fills "{surface.muted}"
    when on primaryAxisAlignItems=MAX { fills "{surface.accent}" }
    when outline { fills; strokes "{border.strong}"; }
}
```

- The layer's own line is applied first, then the `when`'s properties and children, in file order. **Every field replaces**: a later write replaces an earlier one, a list replaces whole, and `#null` sets a size limit to null, which is not the same as never setting it.
- A `when` that replaces a wired field, `visible=#false` over `visible=(property)"Show Nav"`, unwires it in that member; the run warns that the property is wired to nothing there. When that is meant, write the value as `(literal)`: `when ready characters=(literal)"Ready"`. The member is then unwired with no warning. A text cannot follow a variant while staying wired: in Figma a text property has one default for the whole set, and every wired variant shows it.
- `else` after a `when` applies when the `when` did not: `else pressed opacity=(literal)0.8` is tried only if the guards before failed, and a bare `else …` is the last case.
- The reader refuses a `when` outside a layer: there is no layer for it to change. A `when` may add a child layer: `when on { FRAME Badge … }`.

**A region in a different parent per variant is a `define`** called with `+name` under opposite guards:

```kdl
define header-region {
    FRAME "Header region" layoutMode=VERTICAL { … }
}

FRAME Shell … {
    when header-in-page { +header-region }
    FRAME "Main lane" … {
        when header-in-content { +header-region }
    }
}
```

A `define` is closed: its body sees its parameters, written `(input)<parameter>`, and the guards written inside it, and nothing else; a parameter with a value is optional, a bare one required. A call gives parameters by name, `+step id=First at=(input)Progress here=first`, and a call's children land where the definition writes `block`. A layer the call produces has the address the definition gave it, so the diff finds the same layer under another parent. A call to a definition the file does not define is refused.

**Not available in a component file:** `each`, since nothing gives a component file a list to repeat over. kdlet reads it, and the reader refuses the file with a message that says so.

### An instance's properties

A composite is built from other components, and an instance of one reads its default until told otherwise. `set <Name>=<value>…` inside an `INSTANCE` gives it its properties, by the display names its component declares, never with Figma's `#id` suffix:

```kdl
component ContactRow
properties {
    VARIANT density comfortable compact
}
guard compact { is (input)density compact }
FRAME ContactRow layoutMode=HORIZONTAL {
    INSTANCE Mark component=Badge {
        set Variant=tag Label="Organisation"
        when compact { set Size=small }
    }
    INSTANCE Plate component=Person {
        set Density=(input)density
    }
}
```

- A variant property takes one of its values, a boolean `#true` or `#false`, a text a string, a swap a component's name or `(key)"…"`. An axis of the file reaches a value through `(input)`, so each member sets its own; `when` adds to an earlier `set`, and the same name twice takes the later.
- A boolean or a text property also takes a token reference, `set Title="{copy.title}"`: a `boolean` or `string` token's variable is bound to it, and the instance follows the variable. A variant or a swap takes no token.
- What is set is set again every run, and a change in Figma since is drift, kept and said, written over with `--overwrite-drift`; a property the file never mentions is left as the component has it. A property the file stops naming keeps its last value, and the run says so.
- Refused, with the line and the component: a name the component does not have, two of its properties with one display name, a value its variant does not offer, a value of the wrong kind, a slot written as a property, a swap to a component not in the file. A line that every member carries is said once.
- **Not a wire.** A value is fixed or an axis's; `(property)` is refused: the Plugin API refuses to wire a nested instance's property, or any layer inside one, to the composite's property (measured), and Figma's own UI has no such link: a nested instance's properties are exposed, never passed through.
- **`isExposedInstance=#true`** is what the API has instead: the instance's own properties are listed on every instance of the component, under its name, and set there. The row's `Plate` exposed shows the person's `Name` on the row's instances. It makes no property of the component's; an artboard's `set` reaches the component's own properties only.

## Exclusions and inclusions

```kdl
exclude Variant=outline State=hover
exclude Variant=outline State=pressed
include State=rest Size=medium
```

`exclude <Axis>=<value>…` names a combination that is never built, one value for each axis it names; an axis it does not name matches any value. Several combinations take several lines; a list of values in one value, such as `"a|b"`, is not read. A value that is not a bare word is quoted. The default member, the first value of every axis, may not be excluded.

`include <Axis>=<value>…` turns it around: when any `include` is present, only the combinations an `include` matches are built, and `exclude` then removes from those. The default member must be included.

Refused: a key that is not a `VARIANT` axis, a value the axis does not have, a line with no `Axis=value`.

On a component whose axes come from its parts, the key is a part under its axis: `exclude state=pressed` builds no member in the pressed state. A part key the axis does not have is refused, as in `exclude variant: "quiet" is not one of its values (rest, primary)`. So is an exclusion of the default member, such as `exclude variant=rest`, with `exclude removes the default member (variant=rest, state=rest, selection=rest); the first value of every axis is the default and is always built`.

## From the tokens

A component's parts, and its bindings, are already in the token document, and the file can take them from there instead of writing them. Both need a design system: the command line reads it from the resolver document (`components <file> --resolver <resolver.json>`, or `sync`), and a file that takes anything from the tokens stops without one.

A part is a subgroup whose key is a value of an axis in the [parts vocabulary](https://codeberg.org/Toghen/lib/src/branch/main/model.md#the-vocabulary) at its parent group. The [model](https://codeberg.org/Toghen/lib/src/branch/main/model.md#components-and-parts) explains parts, and its [glossary](https://codeberg.org/Toghen/lib/src/branch/main/model.md#glossary) defines the terms.

A file written before parts moves in [the guide](./guide.md#move-a-component-file-off-state-modifiers).

### Axes from the parts

`component Button tokens="{button}"` brings in one axis for each axis of the vocabulary that the group's subgroups use. Each takes the vocabulary's name, with `rest` as its first value and then the part keys the subgroups use, in the vocabulary's order. The [guide](./guide.md#take-a-components-axes-from-its-parts) shows the task.

- A part nested in another, such as `selected.hover`, is one value on each of two axes.
- Inferred axes come after the declared ones, in the vocabulary's order.
- **A declared axis of the same name wins.** A file that declares `VARIANT variant soft solid` while its parts use the `variant` axis keeps the declared axis. A declared value that is a part key reads that part (`variant=solid` reads `avatar.solid.*`), and one that is not reads the rest. A part key the declared axis leaves out is a warning on the component line: `VARIANT "variant" is declared and also comes from the parts of "avatar"; the declared values win, and "outline" is left out.` When the parts would fold that axis into modes, the file is refused, since a mode cannot hold a declared value with no part: `VARIANT "variant" is declared and also comes from the parts of "avatar", which fold it into modes, and a mode cannot hold the declared values that have no part. Drop the declared axis, or lay the component out with layout=parts`.
- A modifier of the design system, such as `theme` or `density`, is never an axis by itself: the frame an instance sits in sets it, as a stylesheet takes it from an ancestor. A file may still declare one by hand with `(modifier)`, which is then the author's choice.
- Adding a context to a modifier the file declares adds a member on the next run, with no edit to the file.
- **Only the contexts Figma gets.** A modifier that lists `figma.include` gives an axis declared with `(modifier)` only those contexts. A file that names a left-out context as an axis value, in an `exclude`, `include` or guard, or in `modes <modifier>=<context>`, is an error with the line, saying the context is not one Figma gets.

Refused, with the line: a part axis whose name holds `.`, `,` or `=`, or a part key that is `rest` or holds `,` or `=`:

`component tokens="{<group>}" has parts on the axis "<axis>", which cannot be a variant: an axis name cannot contain ",", "=" or ".", and a part key cannot be "rest" or contain "," or "="`

A key that is a value of two axes, or two parts of one axis nested in one path, stops the read with the design system's message, which names the key and the group. A group that names nothing stops it too: `component tokens="{nothing}" names no token and no group of the design system`.

### How parts become variables

`layout=parts` on the component line keeps every axis of the component in the path: no member pins a collection, and each part is a variable of its own. Without it, each axis folds into a collection of modes where the tokens allow, and the dry run says which axes stay and why. The members are the same in both layouts; only the pins and the variables they bind differ. The [guide](./guide.md#choose-how-parts-become-variables) says which to choose.

Axes fold in the vocabulary's order, so an earlier axis folds first. Put variant axes before state axes in the vocabulary, and nest a variant's own state under it, as in `button.primary.hover`.

**A folded part has no variable of its own.** Folded, `chip.solid.hover.ink` is the `hover` mode of the variable `chip.solid.ink`, so a file that names the part names nothing Figma will hold. `check`, and the plugin's check before a sync, refuse it with the name to use:

`token {chip.solid.hover.ink} is the "hover" part of "chip.solid.ink", which is one variable with a mode per "interaction": name {chip.solid.ink}; the member pins the mode (a tokens= axis, or modes interaction=hover)`

A part that a modifier varies keeps its own variable, and its name passes. The check reads every file's `layout=parts` before it checks any name, so a file with `layout=parts` keeps its parts whatever order the files come in.

The command line checks the files before it plans the variables, so the sync learns the layout from the check. A sync that did not check the file folds the component, and a build of a `layout=parts` file then stops, as a reference to a missing variable does. The fold is tested against the Figma mock, and ran in a real file on 13 October 2026 (guide, *Run in a real file*).

### Bindings from a group

`tokens="{group}"` is a field on a `FRAME`, `SLOT` or `TEXT`; the `component` line's `tokens=` applies to the root, and a root's own `tokens=` replaces it there. For each token **one level down** in the group, keyed by the CSS property it fills, the field below is written as if the file had said it, so every check on a token reference applies. A field the member's evaluated layer already has, from the layer or a `when`, is kept. Subgroups are not read; a group of subgroups binds nothing. Nothing is matched by name: a layer binds only the group it names, so renaming a layer never changes what it binds.

| Key | Field | On |
|---|---|---|
| `backgroundColor` | `fills` | `FRAME`, `SLOT` |
| `background` | `fills`, when the token is one `color`; a gradient or an image stays skipped with the usual note. `backgroundColor` wins when both are in the group | `FRAME`, `SLOT` |
| `color` | `fills` | `TEXT` |
| `borderColor` | `strokes` | `FRAME`, `SLOT` |
| `borderWidth` | `strokeWeight` | `FRAME`, `SLOT` |
| `borderTopWidth` … `borderLeftWidth` | `strokeTopWeight` … `strokeLeftWeight` | `FRAME`, `SLOT` |
| `border` (composite) | `strokes` from `color`, `strokeWeight` from `width` | `FRAME`, `SLOT` |
| `borderRadius` | `cornerRadius` | `FRAME`, `SLOT` |
| `borderTopLeftRadius` … `borderBottomLeftRadius` | `topLeftRadius` … `bottomLeftRadius` | `FRAME`, `SLOT` |
| `padding` | the four paddings | `FRAME`, `SLOT` |
| `paddingBlock` | `paddingTop`, `paddingBottom` | `FRAME`, `SLOT` |
| `paddingInline` | `paddingLeft`, `paddingRight` | `FRAME`, `SLOT` |
| `paddingTop` … `paddingLeft` | the same | `FRAME`, `SLOT` |
| `gap` | `itemSpacing` under `HORIZONTAL` or `VERTICAL`; `gridRowGap` and `gridColumnGap` under `GRID` | `FRAME`, `SLOT` |
| `rowGap`, `columnGap` | `gridRowGap`, `gridColumnGap`, under `GRID` only | `FRAME`, `SLOT` |
| `width`, `height`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight` | the same | all three |
| `opacity` | `opacity` | all three |
| `font` (typography) | `textStyle` | `TEXT` |

- **More specific wins**, whatever the document's order: `paddingTop` over `paddingBlock` over `padding`; `borderColor` and `borderWidth` over `border`; `borderTopWidth` over `borderWidth`; `rowGap` and `columnGap` over `gap`.
- **A composite `border`** binds its members written as references to the referenced tokens' variables. A literal member has no variable; the reader warns and does not write it. A `style` other than `solid`, in any context, is an error when the file is read.
- **Skipped into the run report's notes**, once per key and layer: a key the table lacks for the layer kind (`transition`, `cursor`, `backgroundColor` on a text), a gap key on a layout where it means nothing.
- **Refused:** `tokens` on an `INSTANCE`; a value that is not a whole reference; a reference that names a token, or nothing; no design system given.
- **A member follows its parts.** A folded axis pins its collection on the member's root, and the bound variable takes that mode's value. An axis left in the path binds the part group the member selects: `button.selected.backgroundColor` for `selection=selected`, and the rest's token where that group does not give the key. Of two part groups that give one key, the one with more parts wins, so `selected.hover` outranks `selected`; on a tie, the later axis in the vocabulary wins. The ranking counts a folded axis's parts too, as the stylesheet does: where the winner is a folded part, the member binds the variable it is a mode of, and its pin selects it. So with `pointer` in the path and `availability` folded, the member `pointer=hover, availability=disabled` binds the rest's `backgroundColor`, whose `disabled` mode is `disabled.backgroundColor`, and not `hover.backgroundColor`, which has no such mode. A reference written outright, `fills "{button.color}"`, names one variable: it follows a folded axis through that variable's modes, but not an axis left in the path. Where a member's selection gives its own token for the key, the read warns, once for the reference, naming each member and the token it skips; bind the group with `tokens=` to follow it, or keep the rest if that is meant.

```kdl
component Button tokens="{button}"

properties {
    TEXT Label default="Save"
}

FRAME Button layoutMode=HORIZONTAL layoutSizingHorizontal=HUG layoutSizingVertical=HUG {
    TEXT Caption tokens="{button.label}" characters=(property)Label
}
```

## Expansion and names

The members are the cartesian product of the `VARIANT` axes in declared order, the last axis varying fastest, minus every combination an `exclude` matches (and, with any `include`, only those an `include` matches). With no `VARIANT` axis there is one member, named for the component. A member is named `Axis=value, Axis=value` in declared axis order, which is how Figma names the members of a set; the default member, the first value of every axis and `rest` on every part axis, is placed top-left, which is how Figma picks a set's default variant.

Each member is kdlet's evaluation of the document with that combination as its inputs, read as a tree of layers. The members' trees may differ in more than fields: a `when` may add a child layer, and a call under a guard may put a layer in another parent. The engine's diff reads a layer by address and takes care of both.

A token reference resolves in Figma to the variable `tokenPathToVariableName(path)` names, the path without the collection segment with `/` between groups (`space/md`), looked for across every local collection; a `textStyle` to the text style of the same name. A name that matches nothing stops the run, and so does one found in two collections.

## What is checked

The checks run in stages that share one report, and a stage that cannot run says nothing, so a file is told about a duplicate address only once the spelling of its fields is fixed. Every problem carries a line and a column; a problem found in a member after a `when` wrote the field points at the `when`. A problem every member has is said once; one some members have is said once per member, with the member's name.

1. **Reading.** kdlet reads the file, and Toghen reads its five words. A reserved word with the wrong shape, a guard out of scope, a property written twice on a node, a `when` outside a layer, a `define` that is not at the top: kdlet's. The rules under [Top-level nodes](#top-level-nodes), [Properties](#properties) and [Exclusions](#exclusions-and-inclusions): Toghen's.
2. **Axes from the tokens**, when the file names a token group: its parts, laid out as the file asks, against the design system.
3. **The document against the axes.** Every guard reads only variant axes and lists only values they have; every `exclude` and `include` names an axis with one of its values; the default member is built; the binding plan of each group the file names is worked out.
4. **Each member**, after kdlet evaluates it. A problem kdlet finds (a missing value, an unknown tag, an unknown parameter) stops that member's checks. Then the tree: an unknown field for the layer's kind, a value of the wrong kind, an unknown enum value, a bare number or colour where a `(literal)` is wanted, a structured field written as a property; a duplicate address; `GRID` layout needs `gridRowSizes` and `gridColumnSizes`, forbids `primaryAxisAlignItems`, `counterAxisAlignItems` and `itemSpacing`, and every child has `grid`; a `FLEX` track on an axis the grid hugs; any other layout forbids the four grid fields and a child's `grid`; a `SLOT` is never `GRID`; `layoutWrap`, `counterAxisAlignContent` and `counterAxisSpacing` need a `HORIZONTAL` or `VERTICAL` layer, a cell alignment a `GRID` parent, `layoutPositioning` a parent with a layout, and `x` or `y` a layer that is not the root and is not placed by its parent's layout; an `INSTANCE` names its `component`; the root is one `FRAME`, does not fill a parent it does not have and carries no `grid`; wiring, where `(property)` on `visible` names a `BOOLEAN`, on `characters` a `TEXT`, on `component` an `INSTANCE_SWAP`, never on the root; a `SLOT` layer and a `SLOT` property match one to one; no field a text style also sets stands beside `textStyle`, and a literal `maxLines` is a whole number of at least 1; `#null` on a `width` or `height`; a `width` or `height` bound to a token, written or from `tokens=`, beside `HUG` or `FILL` on its axis, or beside a text's `textAutoResize` that sizes that axis (`HEIGHT` or `WIDTH_AND_HEIGHT` for a height, `WIDTH_AND_HEIGHT` for a width), since a bound size is a fixed size and the target would settle on one of the two: `FRAME "Chip": "height" is bound to {chip.height} while layoutSizingVertical=HUG: a bound height is a fixed size; write layoutSizingVertical=HUG and drop the height token, or keep the token and drop HUG`; and a `HORIZONTAL` or `VERTICAL` frame that hugs an axis every child in its flow fills, since nothing is left to size it and the target sets one of the two back: `FRAME "Face" fills the width of FRAME "Card", which hugs it: a frame cannot hug children that only fill it; give "Card" a fixed width, or a child a width of its own`.
5. **All members together.** Every `BOOLEAN`, `TEXT` and `INSTANCE_SWAP` property is wired by some layer of some member.
6. **Names against the design system**, by `toghen-figma check` and by the plugin's check before a sync: every token and style a file names is in the design system, and is not a part the fold took into its rest's variable ([How parts become variables](#how-parts-become-variables)). What only Figma holds, such as a variable that is ambiguous between collections, is the dry run's.

A **warning**, found per member: a declared `BOOLEAN`, `TEXT` or `INSTANCE_SWAP` property wired to nothing in that member. It is sometimes what a `when` means, and it is also how a property goes dead by accident. A warning does not stop anything; an error builds nothing.

A problem with one paint in `fills` or `strokes` points at the node and not at the paint, since kdlet carries one position for a list of arguments.

## Worked examples

**The running example's button, with axes from its parts.** Its subgroups use three axes of the vocabulary. `variant` and `state` fold, so each member pins them on its root. `selection` stays in the path, so its members bind the `selected` part group. The file is the running example's `button.component.kdl`, and the axes and members below are what the test mock gives for it.

```kdl
component Button tokens="{button}"

properties {
    TEXT Label default="Save"
}

FRAME Button layoutMode=HORIZONTAL layoutSizingHorizontal=HUG layoutSizingVertical=HUG counterAxisAlignItems=CENTER {
    TEXT Caption tokens="{button}" characters=(property)Label textAutoResize=WIDTH_AND_HEIGHT
}
```

The axes and the sixteen members:

```text
properties (declared first, then the axes taken from the parts)
  Label  TEXT  default "Save"
  variant  VARIANT  rest, primary  pins the collection variant
  state  VARIANT  rest, hover, pressed, disabled  pins the collection state
  selection  VARIANT  rest, selected  no pin: laid out in the path

16 members
  variant=rest, state=rest, selection=rest  |  pins variant=rest state=rest  |  fill button.backgroundColor
  variant=rest, state=rest, selection=selected  |  pins variant=rest state=rest  |  fill button.selected.backgroundColor
  variant=rest, state=hover, selection=rest  |  pins variant=rest state=hover  |  fill button.backgroundColor
  variant=rest, state=hover, selection=selected  |  pins variant=rest state=hover  |  fill button.selected.backgroundColor
  variant=rest, state=pressed, selection=rest  |  pins variant=rest state=pressed  |  fill button.backgroundColor
  variant=rest, state=pressed, selection=selected  |  pins variant=rest state=pressed  |  fill button.selected.backgroundColor
  variant=rest, state=disabled, selection=rest  |  pins variant=rest state=disabled  |  fill button.backgroundColor
  variant=rest, state=disabled, selection=selected  |  pins variant=rest state=disabled  |  fill button.selected.backgroundColor
  variant=primary, state=rest, selection=rest  |  pins variant=primary state=rest  |  fill button.backgroundColor
  variant=primary, state=rest, selection=selected  |  pins variant=primary state=rest  |  fill button.selected.backgroundColor
  variant=primary, state=hover, selection=rest  |  pins variant=primary state=hover  |  fill button.backgroundColor
  variant=primary, state=hover, selection=selected  |  pins variant=primary state=hover  |  fill button.selected.backgroundColor
  variant=primary, state=pressed, selection=rest  |  pins variant=primary state=pressed  |  fill button.backgroundColor
  variant=primary, state=pressed, selection=selected  |  pins variant=primary state=pressed  |  fill button.selected.backgroundColor
  variant=primary, state=disabled, selection=rest  |  pins variant=primary state=disabled  |  fill button.backgroundColor
  variant=primary, state=disabled, selection=selected  |  pins variant=primary state=disabled  |  fill button.selected.backgroundColor
```

**A control with three axes, an excluded corner, a swap and a mode pin.** `exclude` leaves the outline variant with no hover or pressed; `Scale` is a collection a `when` pins; the icon is an instance swapped through a property.

```kdl
component Control
description "A pressable control with a label and an optional icon."

properties {
    VARIANT Variant solid outline
    VARIANT State rest hover pressed
    VARIANT Size medium small large
    TEXT Label default="Label"
    BOOLEAN "Show Icon" default=#true
    INSTANCE_SWAP Icon default=Glyph
}
exclude Variant=outline State=hover
exclude Variant=outline State=pressed

guard active { is (input)State hover pressed }
guard small { is (input)Size small }
guard outline { is (input)Variant outline }

FRAME Control layoutMode=HORIZONTAL layoutSizingHorizontal=HUG layoutSizingVertical=HUG counterAxisAlignItems=CENTER paddingLeft="{space.md}" paddingRight="{space.md}" paddingTop="{space.sm}" paddingBottom="{space.sm}" itemSpacing="{space.sm}" cornerRadius="{radius.md}" strokeWeight=(literal)1 minHeight=(literal)44 { // a touch target, no token names it
    fills "{surface.control}"
    when active { fills "{surface.control-active}"; }
    // A translucent white highlight: only this control uses it.
    strokes (literal)"#ffffff80"
    when small paddingLeft="{space.sm}" paddingRight="{space.sm}" { modes Scale=small; }
    when outline { fills; strokes "{border.strong}"; }
    INSTANCE "Leading icon" visible=(property)"Show Icon" component=(property)Icon
    TEXT Caption characters=(property)Label textStyle="{text.label}" textAutoResize=WIDTH_AND_HEIGHT {
        when small textStyle="{text.label-small}"
    }
}
```

Twelve members: three sizes by three states by two variants, minus the two excluded.

**A repeated part through a `define` with parameters.** One step, written once, called three times with the axis value handed in; the definition's guards compare its parameters.

```kdl
component Stepper

properties {
    VARIANT Progress first second third
    TEXT "First label" default="Details"
}

define step id at here done-at=#null {
    guard current { is (input)at (input)here }
    guard done { is (input)at (input)done-at }

    FRAME (input)id layoutMode=HORIZONTAL layoutSizingHorizontal=HUG layoutSizingVertical=HUG cornerRadius="{radius.full}" {
        fills "{surface.muted}"
        when current { fills "{surface.accent}" }
        else done { fills "{surface.raised}" }
        block
    }
}

FRAME Stepper layoutMode=HORIZONTAL layoutSizingHorizontal=HUG layoutSizingVertical=HUG itemSpacing="{space.md}" {
    +step id="Step 1" at=(input)Progress here=first done-at=second {
        TEXT "Label 1" characters=(property)"First label" textStyle="{text.label}"
    }
    +step id="Step 2" at=(input)Progress here=second
}
```

**A layout with slots, a grid and a region that changes parent** is the worked example in [specs.md](./specs.md#worked-example-a-layout-with-slots-a-grid-and-a-region-that-changes-parent): four `SLOT` properties with descriptions, a `GRID` frame whose tracks a `when` rewrites, `grid row= column=` on its children, a `#null` clearing a minimum width, and a `define` called under opposite guards in two parents.

**Axes and bindings from the tokens** are the button above; its layers bind the group's keys as the table under [Bindings from a group](#bindings-from-a-group) says.

## Artboard files

A page that documents a system is a frame of instances, not a component. An **artboard file**, `<name>.artboard.kdl`, builds one. It shares this format's layers, fields, values and `when`, `define` and `+call`, and differs in five ways. The reasons are in [specs.md](./specs.md#artboard-files).

```kdl
artboard Reference
FRAME Page layoutMode=VERTICAL itemSpacing=(literal)16 {
    TEXT Title characters=(input)name
    each p in=(input)properties key=name {
        INSTANCE "Row" component=PropertyRow {
            set Name=(p)name Default=(p)default
        }
    }
    INSTANCE Stage component=DefinitionFrame {
        slot Content {
            INSTANCE Set component=(key)"…"
        }
    }
}
```

- **The header is `artboard <Name>`** in place of `component <Name>`, and it takes no `properties`, `exclude`, `include` or `description`; there are no axes and no members. The root `FRAME` is an ordinary frame on the run's page (`--page`, else the current page), found again by its stamp wherever a person moved it, and reconciled in place by address and key. A stamped layer the file stops producing is removed, a breaking step that stops a real run unless `--allow-breaking` is given; what it holds goes with it, in the same step. A layer with no stamp is never touched and is reported.
- **`set <Name>=<value>…` on an `INSTANCE`** gives the instance's properties, as in a component file ([above](#an-instances-properties)); here a value may also come from the inputs, `set Name=(p)name`.
- **An `INSTANCE` takes its size:** `width`, `height`, the four limits, `layoutSizingHorizontal` and `layoutSizingVertical`, as in a component file. Its properties are written first and its sizing after, and again whenever a run switches its variant, since a variant switch resizes an instance: `INSTANCE Stage component=Panel width=(literal)480 layoutSizingVertical=HUG { set Tone=calm }` stays 480 wide whichever tone it shows. Measured in FigCraft; in Figma it is written the same way and not measured.
- **`slot <Name> { … }` on an `INSTANCE`** fills the instance's slot with layers written inside it. A slot the component does not have is refused. `each` and `when` work inside it.
- **Inputs.** `--input <document>` is a resolver-like document, read by lib and resolved at the default contexts. A template reads its resolved tokens by path with `(input)`, and a token whose `$value` is a list of records is a list `each` repeats over. Records are flat, because kdlet reads no dotted path: write `(p)width`, not `(p)size.width`. A reference inside a record resolves like any other, so the data can point at the system's tokens. A reference to something the document lacks is an error with the line. A doubled brace in the data, `"{{size.sm}}"`, is the text `{size.sm}`; but a value that arrives as exactly one reference and lands on `characters` is then read as a token reference, a limit still open.
- **`each` needs a key** (`key=name`), and a repeated layer's address is its name plus the key, so a second run with an inserted row patches that row and leaves the others.
- **A hand edit.** What the file declares is set again every run, and the run says when it overwrote a different value; what the file never mentions is left alone. A hand edit is reported only when the file did not change that layer in the same run.
- **Refused in an artboard file:** `tokens=`, `(property)`, `isExposedInstance`, a `SLOT` layer, `description`, and a file named `.component.kdl` that holds an `artboard` (and the reverse). A component file still refuses `each` and `slot`.

## Blueprints

A page is often several components and the artboard that shows them. A **blueprint**, `<page>.blueprint.kdl`, folds their files into one document and says what the page needs. Component files and artboard files stay readable on their own; a blueprint is a way to keep a page together, not a requirement. The reasons are in [specs.md](./specs.md#blueprints).

```kdl
page Buttons

tokens "tokens/ds.resolver.json" overrides="themes/warm.overrides.json"
library Core

component Button tokens="{button}" {
    properties {
        VARIANT Tone calm loud
    }
    FRAME Button layoutMode=HORIZONTAL itemSpacing="{space.sm}" {
        INSTANCE Icon component=Icon
    }
}

artboard "Button reference" {
    FRAME Page layoutMode=VERTICAL {
        INSTANCE Set component=Button
    }
}
```

| Node | How many | What it says |
|---|---|---|
| `page <Name>` | exactly one | The Figma page the blueprint builds into |
| `tokens <entry>… [name="…"] [overrides="…"]` | at most one | What the core's `load` is given, in its three forms: one resolver document, one token file, or several token files. `name` is the collection's name for token files; `overrides` the file that holds the overrides map. In the plugin it is held against what was loaded; it reads no file |
| `library <Name>` | any number | A library whose components, styles and variables the page names |
| `component <Name> … { … }` | any number | A component file: the header's attributes (`tokens=`, `layout=`, `across=`) stay on this line, and the braces hold the rest of the file |
| `artboard <Name> { … }` | any number | An artboard file, the same way |
| `guard`, `define` | any number | kdlet's, shared by every body, as its scope gives |

**A body is read as its file would be.** The reader hands each body, with the shared `guard` and `define` nodes, to the reader of a component file or of an artboard file, at the lines and columns it has in the blueprint. Every check under [What is checked](#what-is-checked) and [Artboard files](#artboard-files) applies, and every problem points at the blueprint's own line. A shared `guard` or `define` is read with every body, so it is checked by each, and a problem with it is said once. On the plugin's screen nothing supplies an artboard's inputs, so a body that reads `(input)` is refused there, as a missing input.

**Refused**, each with its line:

- no `page`, or a second one;
- a second `tokens`; a `tokens` with no location, or with a property other than `name` and `overrides`;
- a word that is none of the blueprint's, nor `guard` or `define`;
- a body with its own header line (a `component` or `artboard` node inside the braces);
- two `component` bodies of one name, or two `artboard` bodies of one name;
- inside a body, whatever its file refuses: `each` in a component body, as today.

**What a blueprint needs** is listed from what it reads: the `tokens` line, the `library` names, and every component its bodies name, once each, with where it is first named: `component=` on an `INSTANCE`, an `INSTANCE_SWAP` property's default, and a `(key)"…"` on either or in a `set`, listed as a key. A name a `component` body of the same blueprint defines is satisfied by it. A body that does not read names nothing. The shape is the [reference's](./reference.md#blueprintneedsblueprint-blueprintneeds).

## From the file to Figma

The plugin reads and checks the file, compares it with what Figma holds, and changes the difference. Two ways bring it the file: `toghen-figma sync` or `components` from the repository, and the Templates pane, which keeps a file in the Figma file. The drill is in the [guide](./guide.md#from-the-repository-to-figma), and the engine's contract (what it resolves, the steps, the stamps, what breaks instances) is in the [reference](./reference.md#rundesired-options-promisereport).
