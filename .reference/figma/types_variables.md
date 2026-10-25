# Source: https://developers.figma.com/docs/plugins/api/VariableValue/

<!-- Vendored snapshot of the Figma Plugin API docs. Captured 2026-08-04. -->

**Sources in this file** (captured 2026-08-04):

- <https://developers.figma.com/docs/plugins/api/VariableValue/>
- <https://developers.figma.com/docs/plugins/api/VariableAlias/>
- <https://developers.figma.com/docs/plugins/api/VariableResolvedDataType/>
- <https://developers.figma.com/docs/plugins/api/VariableScope/>
- <https://developers.figma.com/docs/plugins/api/CodeSyntaxPlatform/>
- <https://developers.figma.com/docs/plugins/api/VariableBindableNodeField/>
- <https://developers.figma.com/docs/plugins/api/VariableBindableTextField/>
- <https://developers.figma.com/docs/plugins/api/VariableBindablePaintField/>
- <https://developers.figma.com/docs/plugins/api/VariableBindableEffectField/>
- <https://developers.figma.com/docs/plugins/api/VariableBindableLayoutGridField/>
- <https://developers.figma.com/docs/plugins/api/ExtendedVariableCollection/>
- <https://developers.figma.com/docs/plugins/api/PublishStatus/>

> `VariableCodeSyntax` has **no page of its own** on the live docs (a request for
> `/docs/plugins/api/VariableCodeSyntax/` returns 404). It is documented inline on the
> [`Variable`](api_Variable.md) page as
> `codeSyntax: { [platform in CodeSyntaxPlatform]?: string } [readonly]`, mutated via
> `setVariableCodeSyntax(platform, value)` / `removeVariableCodeSyntax(platform)`.
> The `CodeSyntaxPlatform` union itself is vendored below.

---
# VariableValue

``` ts
type VariableValue =
  string |
  number |
  boolean |
  RGB |
  RGBA |
  VariableAlias
```

## Variable Alias

Created via `figma.variables.createVariableBinding()`. Used to alias variables to other variables. Each `VariableValue` has at least one corresponding [`VariableResolvedDataType`](https://developers.figma.com/docs/plugins/api/VariableResolvedDataType/).

---

> Source: <https://developers.figma.com/docs/plugins/api/VariableAlias/>

# VariableAlias

``` ts
interface VariableAlias {
  type: 'VARIABLE_ALIAS'
  id: string
}
```

A structure used to describe when a particular node or variable is directly bound to a variable. The `id` of the bound variable can be used in conjunction with functions that accept a VariableId, such as `figma.variables.getVariableById`.

---

> Source: <https://developers.figma.com/docs/plugins/api/VariableResolvedDataType/>

# VariableResolvedDataType

``` ts
type VariableResolvedDataType =
  "BOOLEAN" |
  "COLOR" |
  "FLOAT" |
  "STRING"
```

The list of resolved [`Variable`](https://developers.figma.com/docs/plugins/api/Variable/) types that Figma current supports.

- `"BOOLEAN"` variables can be assigned to `true` or `false`
- `"COLOR"` variables can be assigned to [`RGB`](https://developers.figma.com/docs/plugins/api/RGB/) values
- `"FLOAT"` variables can be assigned to `number` values
- `"STRING"` variables can be assigned to `string` values

Since a variable can be assigned to a [`VariableAlias`](https://developers.figma.com/docs/plugins/api/VariableAlias/) for any given mode, this type refers to the type of the fully resolved value (after following all aliases).

---

> Source: <https://developers.figma.com/docs/plugins/api/VariableScope/>

# VariableScope

``` ts
type VariableScope =
    "ALL_SCOPES" |
    "TEXT_CONTENT" |
    "CORNER_RADIUS" |
    "WIDTH_HEIGHT" |
    "GAP" |
    "ALL_FILLS" |
    "FRAME_FILL" |
    "SHAPE_FILL" |
    "TEXT_FILL" |
    "STROKE_COLOR" |
    "EFFECT_COLOR" |
    "STROKE_FLOAT" |
    "EFFECT_FLOAT" |
    "OPACITY" |
    "FONT_FAMILY" |
    "FONT_STYLE" |
    "FONT_WEIGHT" |
    "FONT_SIZE" |
    "LINE_HEIGHT" |
    "LETTER_SPACING" |
    "PARAGRAPH_SPACING" |
    "PARAGRAPH_INDENT"
```

Scopes allow a variable to be shown or hidden in the variable picker for various fields. This is useful to help declutter the Figma UI if you have a large number of variables. Scopes are currently supported for `FLOAT`, `STRING` and `COLOR` variables.

`ALL_SCOPES` is a special scope that means that the variable is shown in the picker for all fields. If `ALL_SCOPES` is set, no additional scopes can be set.

`ALL_FILLS` is a special scope that means that the variable is available in the variable picker for all color fill fields. If `ALL_FILLS` is set, no additional fill scopes can be set.

Valid scopes for `FLOAT` variables are: `ALL_SCOPES`, `TEXT_CONTENT`, `CORNER_RADIUS`, `WIDTH_HEIGHT`, `GAP`, `OPACITY`, `STROKE_FLOAT`, `EFFECT_FLOAT`, `FONT_WEIGHT`, `FONT_SIZE`, `LINE_HEIGHT`, `LETTER_SPACING`, `PARAGRAPH_SPACING`, and `PARAGRAPH_INDENT`.

Valid scopes for `COLOR` variables are: `ALL_SCOPES`, `ALL_FILLS`, `FRAME_FILL`, `SHAPE_FILL`, `TEXT_FILL`, `STROKE_COLOR`, and `EFFECT_COLOR`.

Valid scopes for `STRING` variables are: `ALL_SCOPES`, `TEXT_CONTENT`, `FONT_FAMILY`, `FONT_STYLE`.

---

> Source: <https://developers.figma.com/docs/plugins/api/CodeSyntaxPlatform/>

# CodeSyntaxPlatform

## CodeSyntaxPlatform

``` ts
type CodeSyntaxPlatform =
    "WEB" |
    "ANDROID" |
    "iOS"
```

[`codeSyntax`](https://developers.figma.com/docs/plugins/api/Variable/#codesyntax) is a variable field used for defining custom token names for up to three unique code platforms. There are no formatting or syntax restrictions enforced on the code syntax entries.

---

> Source: <https://developers.figma.com/docs/plugins/api/VariableBindableNodeField/>

# VariableBindableNodeField

``` ts
type VariableBindableNodeField =
  | 'height'
  | 'width'
  | 'characters'
  | 'itemSpacing'
  | 'paddingLeft'
  | 'paddingRight'
  | 'paddingTop'
  | 'paddingBottom'
  | 'visible'
  | 'cornerRadius'
  | 'topLeftRadius'
  | 'topRightRadius'
  | 'bottomLeftRadius'
  | 'bottomRightRadius'
  | 'minWidth'
  | 'maxWidth'
  | 'minHeight'
  | 'maxHeight'
  | 'counterAxisSpacing'
  | 'strokeWeight'
  | 'strokeTopWeight'
  | 'strokeRightWeight'
  | 'strokeBottomWeight'
  | 'strokeLeftWeight'
  | 'opacity'
  | 'gridRowGap'
  | 'gridColumnGap'
```

A list of node fields that can be bound to a variable.

---

> Source: <https://developers.figma.com/docs/plugins/api/VariableBindableTextField/>

# VariableBindableTextField

``` ts
type VariableBindableTextField =
  | 'fontFamily'
  | 'fontSize'
  | 'fontStyle'
  | 'fontWeight'
  | 'letterSpacing'
  | 'lineHeight'
  | 'paragraphSpacing'
  | 'paragraphIndent'
```

A list of text node fields that can be bound to a variable.

---

> Source: <https://developers.figma.com/docs/plugins/api/VariableBindablePaintField/>

# VariableBindablePaintField

``` ts
type VariableBindablePaintField = 'color'
```

A list of node fields that can be bound to a [`SolidPaint`](https://developers.figma.com/docs/plugins/api/Paint/).

---

> Source: <https://developers.figma.com/docs/plugins/api/VariableBindableEffectField/>

# VariableBindableEffectField

``` ts
type VariableBindableShadowEffectField =
  'radius' |
  'color' |
  'spread' |
  'offsetX' |
  'offsetY'

type VariableBindableBlurEffectField = 'radius'

type VariableBindableEffectField =
  VariableBindableShadowEffectField
  | VariableBindableBlurEffectField
```

A list of node fields that can be bound to a [`Effect`](https://developers.figma.com/docs/plugins/api/Effect/) by type.

---

> Source: <https://developers.figma.com/docs/plugins/api/VariableBindableLayoutGridField/>

# VariableBindableLayoutGridField

``` ts
// if pattern is set to 'ROWS' or 'COLUMNS' then alignment can be 'MIN', 'MAX', 'CENTER', or 'STRETCH'
type VariableBindableRowColumnMinMaxLayoutField =
  'sectionSize' |
  'count' |
  'offset' |
  'gutterSize'

type VariableBindableRowColumnCenterLayoutField =
  'sectionSize' |
  'count' |
  'gutterSize'

type VariableBindableRowColumnStretchLayoutField =
  'count' |
  'offset' |
  'gutterSize'

// if pattern is set to 'GRID' then a variable can only be bound to 'sectionSize'
type VariableBindableGridLayoutField = 'sectionSize'

type VariableBindableLayoutGridField =
  VariableBindableRowColumnMinMaxLayoutField
  | VariableBindableRowColumnCenterLayoutField
  | VariableBindableRowColumnStretchLayoutField
  | VariableBindableGridLayoutField
```

A list of node fields that can be bound to a [`LayoutGrid`](https://developers.figma.com/docs/plugins/api/LayoutGrid/) according to the combination of [`pattern`](https://developers.figma.com/docs/plugins/api/LayoutGrid/#pattern) and [`alignment`](https://developers.figma.com/docs/plugins/api/LayoutGrid/#alignment).

---

> Source: <https://developers.figma.com/docs/plugins/api/ExtendedVariableCollection/>

# ExtendedVariableCollection

## Extended Variable Collection properties

An `ExtendedVariableCollection` is a `VariableCollection` that extends another `VariableCollection` to enable theming. When extending a collection, the extension inherits the modes and variables from its parent variable collection. In an extended collection, a variable mode value can be overridden from its default value to give it a theme-specific value. For examples, see [Working with Variables](https://developers.figma.com/docs/plugins/working-with-variables/#extended-variable-collections).

info

This feature is limited to the Enterprise plan.

### isExtension: true \[readonly\]

`isExtension` is set to `true` to distinguish an extended collection from base variable collections.

------------------------------------------------------------------------

### parentVariableCollectionId: string \[readonly\]

The ID of the parent variable collection.

------------------------------------------------------------------------

### rootVariableCollectionId: string \[readonly\]

The ID of the root variable collection in the extension chain. This is the collection ID at the top of the parent chain. For example, if Collection C extends B which extends A (root), then `rootVariableCollectionId` is A's ID.

------------------------------------------------------------------------

### variableIds: string\[\] \[readonly\]

The list of variables contained in this extended variable collection including variables that are inherited from its parent collection.

------------------------------------------------------------------------

### variableOverrides: { \[variableId: string\]: { \[extendedModeId: string\]: [VariableValue](https://developers.figma.com/docs/plugins/api/VariableValue/) } } \[readonly\]

The overridden variable values in this extended variable collection.

------------------------------------------------------------------------

### removeOverridesForVariable(variableToClear: [Variable](https://developers.figma.com/docs/plugins/api/Variable/)): void

Removes all overridden values in this extended collection for the given variable.

------------------------------------------------------------------------

### modes: Array\<{ modeId: string; name: string; parentModeId: string }\> \[readonly\]

The modes inherited from the parent collection.

------------------------------------------------------------------------

### removeMode(modeId: string): void

Removes the given mode by ID if its parent mode has been deleted.

------------------------------------------------------------------------

## Plugin data properties

### getPluginData(key: string): string

Retrieves custom information that was stored on this node or style using [`setPluginData`](https://developers.figma.com/docs/plugins/api/properties/nodes-setplugindata/). If there is no data stored for the provided key, an empty string is returned.

------------------------------------------------------------------------

### [setPluginData](https://developers.figma.com/docs/plugins/api/properties/nodes-setplugindata/)(key: string, value: string): void

Lets you store custom information on any node or style, **private** to your plugin. The total size of your entry (`pluginId`, `key`, `value`) cannot exceed 100 kB.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-setplugindata/)

------------------------------------------------------------------------

### getPluginDataKeys(): string\[\]

Retrieves a list of all keys stored on this node or style using using [`setPluginData`](https://developers.figma.com/docs/plugins/api/properties/nodes-setplugindata/). This enables iterating through all data stored privately on a node or style by your plugin.

------------------------------------------------------------------------

### getSharedPluginData(namespace: string, key: string): string

Retrieves custom information that was stored on this node or style using [`setSharedPluginData`](https://developers.figma.com/docs/plugins/api/properties/nodes-setsharedplugindata/). If there is no data stored for the provided namespace and key, an empty string is returned.

------------------------------------------------------------------------

### [setSharedPluginData](https://developers.figma.com/docs/plugins/api/properties/nodes-setsharedplugindata/)(namespace: string, key: string, value: string): void

Lets you store custom information on any node or style, **public** to all plugins. The total size of your entry (`namespace`, `key`, `value`) cannot exceed 100 kB.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-setsharedplugindata/)

------------------------------------------------------------------------

### getSharedPluginDataKeys(namespace: string): string\[\]

Retrieves a list of all keys stored on this node or style using [`setSharedPluginData`](https://developers.figma.com/docs/plugins/api/properties/nodes-setsharedplugindata/). This enables iterating through all data stored in a given namespace.

------------------------------------------------------------------------

---

> Source: <https://developers.figma.com/docs/plugins/api/PublishStatus/>

# PublishStatus

``` ts
type PublishStatus = "UNPUBLISHED" | "CURRENT" | "CHANGED"
```

Describes the status of elements that could be published to the team library, namely styles and components.

The possible values are:

- `"UNPUBLISHED"`: the element is not published to the team library
- `"CURRENT"`: the element is published and the published version matches the local version
- `"CHANGED"`: the element is published, but has local changes
