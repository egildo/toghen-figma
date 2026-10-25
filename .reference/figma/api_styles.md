# Source: https://developers.figma.com/docs/plugins/api/BaseStyle/

<!-- Vendored snapshot of the Figma Plugin API docs. Captured 2026-08-04. -->

**Sources in this file** (captured 2026-08-04):

- <https://developers.figma.com/docs/plugins/api/BaseStyle/>
- <https://developers.figma.com/docs/plugins/api/PaintStyle/>
- <https://developers.figma.com/docs/plugins/api/TextStyle/>
- <https://developers.figma.com/docs/plugins/api/EffectStyle/>
- <https://developers.figma.com/docs/plugins/api/GridStyle/>
- <https://developers.figma.com/docs/plugins/api/figma/>

> `getLocal*Styles()` (sync) are deprecated and throw under
> `"documentAccess": "dynamic-page"`; use `getLocal*StylesAsync()`.

---
# BaseStyle

[Styles](https://help.figma.com/hc/en-us/articles/360039238753-Styles-in-Figma) in Figma define reusable colors, text properties, effects, or layout grids that can be applied to nodes.

Here are the different types of styles, each with their own set of properties:

- [PaintStyle](https://developers.figma.com/docs/plugins/api/PaintStyle/)
- [TextStyle](https://developers.figma.com/docs/plugins/api/TextStyle/)
- [EffectStyle](https://developers.figma.com/docs/plugins/api/EffectStyle/)
- [GridStyle](https://developers.figma.com/docs/plugins/api/GridStyle/)

In the [type declarations](https://developers.figma.com/docs/plugins/api/typings/), each style type is represented with an interface. The most general, `BaseStyle`, is a [union](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#union-types) of these interfaces:

``` ts
type BaseStyle = PaintStyle | TextStyle | EffectStyle | GridStyle
```

## Base style properties

### id: string \[readonly\]

The unique identifier of the style in the document the plugin is executing from. You can assign this value via `setFillStyleIdAsync`, `setStrokeStyleIdAsync`, `setTextStyleIdAsync`, etc. to make the node properties reflect that of the style node.

------------------------------------------------------------------------

### getStyleConsumersAsync(): Promise\<[StyleConsumers](https://developers.figma.com/docs/plugins/api/StyleConsumers/)\[\]\>

The consumers of this style. The `fields` in `StyleConsumers` refers to the field where the style is applied (e.g. a PaintStyle can be applied in `setFillStyleIdAsync` or `setStrokeStyleIdAsync`).

------------------------------------------------------------------------

### consumers: [StyleConsumers](https://developers.figma.com/docs/plugins/api/StyleConsumers/)\[\] \[readonly\]

**DEPRECATED:** Use `getStyleConsumersAsync` instead. Accessing this property will throw an exception if the plugin manifest contains `"documentAccess": "dynamic-page"`.

The consumers of this style. The `fields` in `StyleConsumers` refers to the field where the style is applied (e.g. a PaintStyle can be applied in `setFillStyleIdAsync` or `setStrokeStyleIdAsync`).

------------------------------------------------------------------------

### name: string

The name of the style node. Note that setting this also sets "autoRename" to false on [`TextNode`](https://developers.figma.com/docs/plugins/api/TextNode/).

------------------------------------------------------------------------

### remove(): void

Deletes a local style.

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

## Publishable properties

### [description](https://developers.figma.com/docs/plugins/api/properties/nodes-description/): string

The plain-text annotation entered by the user for this style/component.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-description/)

------------------------------------------------------------------------

### [descriptionMarkdown](https://developers.figma.com/docs/plugins/api/properties/nodes-descriptionmarkdown/): string

The rich-text annotation entered by the user for this style/component.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-descriptionmarkdown/)

------------------------------------------------------------------------

### [documentationLinks](https://developers.figma.com/docs/plugins/api/properties/nodes-documentationlinks/): ReadonlyArray\<[DocumentationLink](https://developers.figma.com/docs/plugins/api/DocumentationLink/)\>

The documentation links for this style/component.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-documentationlinks/)

------------------------------------------------------------------------

### remote: boolean \[readonly\]

Whether this style/component is a remote style/component that doesn't live in the file (i.e. is from the team library). Remote components are read-only: attempts to change their properties will throw.

------------------------------------------------------------------------

### key: string \[readonly\]

The key to use with [`figma.importComponentByKeyAsync`](https://developers.figma.com/docs/plugins/api/figma/#importcomponentbykeyasync), [`figma.importComponentSetByKeyAsync`](https://developers.figma.com/docs/plugins/api/figma/#importcomponentsetbykeyasync) and [`figma.importStyleByKeyAsync`](https://developers.figma.com/docs/plugins/api/figma/#importstylebykeyasync). Note that while this key is present on local and published components, you can only import components that are already published.

------------------------------------------------------------------------

### getPublishStatusAsync(): Promise\<[PublishStatus](https://developers.figma.com/docs/plugins/api/PublishStatus/)\>

Gets the status of this style/component in the team library.

------------------------------------------------------------------------

## Folders

Styles can be put inside folders (including nested folders) by setting the name of the style to be a delimited path name. For example, the following code would move a paint style named `Style 1` into a nested folder named `b`. Folder `b` resides in folder `a`.

``` ts
const style = figma.createPaintStyle() 
style.name = "a/b/Style 1"
```

Folder names cannot be empty strings and they are unique within the same hierarchy. Since two nested folders can have the same name when residing in different parent folders, we refer to folders by their absolute delimited folder name. The following function `getNamePrefix` can be used to get the absolute folder name given a style name.

``` ts
const getNameParts = (name: string) => {
  const nameParts = name.split('/').filter((part: string) => !!part)
  return nameParts.map((part: string) => part.trim())
}

const getNamePrefix = (name: string): string => {
  const pathParts = getNameParts(name)
  pathParts.pop()
  return pathParts.join('/')
}
```

---

> Source: <https://developers.figma.com/docs/plugins/api/PaintStyle/>

# PaintStyle

## PaintStyle

### type: 'PAINT'

The string literal "PAINT" representing the style type. Always check the `type` before reading other properties.

------------------------------------------------------------------------

### paints: ReadonlyArray\<[Paint](https://developers.figma.com/docs/plugins/api/Paint/)\>

List of [`Paint`](https://developers.figma.com/docs/plugins/api/Paint/) to replace the `fills`, `strokes`, or `backgrounds` property with.

------------------------------------------------------------------------

### boundVariables?: { readonly \[field in [VariableBindablePaintStyleField](https://developers.figma.com/docs/plugins/api/VariableBindablePaintStyleField/)\]?: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/)\[\]} \[readonly\]

The variables bound to a particular field on this paint style.

------------------------------------------------------------------------

## Base style properties

### id: string \[readonly\]

The unique identifier of the style in the document the plugin is executing from. You can assign this value via `setFillStyleIdAsync`, `setStrokeStyleIdAsync`, `setTextStyleIdAsync`, etc. to make the node properties reflect that of the style node.

------------------------------------------------------------------------

### getStyleConsumersAsync(): Promise\<[StyleConsumers](https://developers.figma.com/docs/plugins/api/StyleConsumers/)\[\]\>

The consumers of this style. The `fields` in `StyleConsumers` refers to the field where the style is applied (e.g. a PaintStyle can be applied in `setFillStyleIdAsync` or `setStrokeStyleIdAsync`).

------------------------------------------------------------------------

### consumers: [StyleConsumers](https://developers.figma.com/docs/plugins/api/StyleConsumers/)\[\] \[readonly\]

**DEPRECATED:** Use `getStyleConsumersAsync` instead. Accessing this property will throw an exception if the plugin manifest contains `"documentAccess": "dynamic-page"`.

The consumers of this style. The `fields` in `StyleConsumers` refers to the field where the style is applied (e.g. a PaintStyle can be applied in `setFillStyleIdAsync` or `setStrokeStyleIdAsync`).

------------------------------------------------------------------------

### name: string

The name of the style node. Note that setting this also sets "autoRename" to false on [`TextNode`](https://developers.figma.com/docs/plugins/api/TextNode/).

------------------------------------------------------------------------

### remove(): void

Deletes a local style.

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

## Publishable properties

### [description](https://developers.figma.com/docs/plugins/api/properties/nodes-description/): string

The plain-text annotation entered by the user for this style/component.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-description/)

------------------------------------------------------------------------

### [descriptionMarkdown](https://developers.figma.com/docs/plugins/api/properties/nodes-descriptionmarkdown/): string

The rich-text annotation entered by the user for this style/component.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-descriptionmarkdown/)

------------------------------------------------------------------------

### [documentationLinks](https://developers.figma.com/docs/plugins/api/properties/nodes-documentationlinks/): ReadonlyArray\<[DocumentationLink](https://developers.figma.com/docs/plugins/api/DocumentationLink/)\>

The documentation links for this style/component.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-documentationlinks/)

------------------------------------------------------------------------

### remote: boolean \[readonly\]

Whether this style/component is a remote style/component that doesn't live in the file (i.e. is from the team library). Remote components are read-only: attempts to change their properties will throw.

------------------------------------------------------------------------

### key: string \[readonly\]

The key to use with [`figma.importComponentByKeyAsync`](https://developers.figma.com/docs/plugins/api/figma/#importcomponentbykeyasync), [`figma.importComponentSetByKeyAsync`](https://developers.figma.com/docs/plugins/api/figma/#importcomponentsetbykeyasync) and [`figma.importStyleByKeyAsync`](https://developers.figma.com/docs/plugins/api/figma/#importstylebykeyasync). Note that while this key is present on local and published components, you can only import components that are already published.

------------------------------------------------------------------------

### getPublishStatusAsync(): Promise\<[PublishStatus](https://developers.figma.com/docs/plugins/api/PublishStatus/)\>

Gets the status of this style/component in the team library.

------------------------------------------------------------------------

## Folders

Styles can be put inside folders (including nested folders) by setting the name of the style to be a delimited path name. For example, the following code would move a paint style named `Style 1` into a nested folder named `b`. Folder `b` resides in folder `a`.

``` ts
const style = figma.createPaintStyle() 
style.name = "a/b/Style 1"
```

Folder names cannot be empty strings and they are unique within the same hierarchy. Since two nested folders can have the same name when residing in different parent folders, we refer to folders by their absolute delimited folder name. The following function `getNamePrefix` can be used to get the absolute folder name given a style name.

``` ts
const getNameParts = (name: string) => {
  const nameParts = name.split('/').filter((part: string) => !!part)
  return nameParts.map((part: string) => part.trim())
}

const getNamePrefix = (name: string): string => {
  const pathParts = getNameParts(name)
  pathParts.pop()
  return pathParts.join('/')
}
```

---

> Source: <https://developers.figma.com/docs/plugins/api/TextStyle/>

# TextStyle

## TextStyle

### type: 'TEXT'

The string literal "TEXT" representing the style type. Always check the `type` before reading other properties.

------------------------------------------------------------------------

### fontSize: number

Value to replace the text [`fontSize`](https://developers.figma.com/docs/plugins/api/TextNode/#fontsize) with.

------------------------------------------------------------------------

### textDecoration: [TextDecoration](https://developers.figma.com/docs/plugins/api/TextDecoration/)

Value to replace the text [`textDecoration`](https://developers.figma.com/docs/plugins/api/TextNode/#textdecoration) with.

------------------------------------------------------------------------

### fontName: [FontName](https://developers.figma.com/docs/plugins/api/FontName/)

Value to replace the text [`fontName`](https://developers.figma.com/docs/plugins/api/TextNode/#fontname) with.

------------------------------------------------------------------------

### letterSpacing: [LetterSpacing](https://developers.figma.com/docs/plugins/api/LetterSpacing/)

Value to replace the text [`letterSpacing`](https://developers.figma.com/docs/plugins/api/TextNode/#letterspacing) with.

------------------------------------------------------------------------

### lineHeight: [LineHeight](https://developers.figma.com/docs/plugins/api/LineHeight/)

Value to replace the text [`lineHeight`](https://developers.figma.com/docs/plugins/api/TextNode/#lineheight) with.

------------------------------------------------------------------------

### leadingTrim: [LeadingTrim](https://developers.figma.com/docs/plugins/api/LeadingTrim/)

Value to replace the text [`leadingTrim`](https://developers.figma.com/docs/plugins/api/TextNode/#leadingtrim) with.

------------------------------------------------------------------------

### paragraphIndent: number

Value to replace the text [`paragraphIndent`](https://developers.figma.com/docs/plugins/api/TextNode/#paragraphindent) with.

------------------------------------------------------------------------

### paragraphSpacing: number

Value to replace the text [`paragraphSpacing`](https://developers.figma.com/docs/plugins/api/TextNode/#paragraphspacing) with.

------------------------------------------------------------------------

### listSpacing: number

Value to replace the text [`listSpacing`](https://developers.figma.com/docs/plugins/api/TextNode/#listspacing) with.

------------------------------------------------------------------------

### hangingPunctuation: boolean

Value to replace the text [`hangingPunctuation`](https://developers.figma.com/docs/plugins/api/TextNode/#hangingpunctuation) with.

------------------------------------------------------------------------

### hangingList: boolean

Value to replace the text [`hangingList`](https://developers.figma.com/docs/plugins/api/TextNode/#hanginglist) with.

------------------------------------------------------------------------

### textCase: [TextCase](https://developers.figma.com/docs/plugins/api/TextCase/)

Value to replace the text [`textCase`](https://developers.figma.com/docs/plugins/api/TextNode/#textcase) with.

------------------------------------------------------------------------

### boundVariables?: { \[field in [VariableBindableTextField](https://developers.figma.com/docs/plugins/api/VariableBindableTextField/)\]?: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/)}

The variables bound to a particular field on this text style.

------------------------------------------------------------------------

### setBoundVariable(field: [VariableBindableTextField](https://developers.figma.com/docs/plugins/api/VariableBindableTextField/), variable: [Variable](https://developers.figma.com/docs/plugins/api/Variable/) \| null): void

Binds the provided `field` on this node to the given variable. Please see the [Working with Variables](https://developers.figma.com/docs/plugins/working-with-variables/) guide for how to get and set variable bindings.

If `null` is provided as the variable, the given `field` will be unbound from any variables.

[View more →](https://developers.figma.com/docs/plugins/api/properties/TextStyle-setboundvariable/)

------------------------------------------------------------------------

## Base style properties

### id: string \[readonly\]

The unique identifier of the style in the document the plugin is executing from. You can assign this value via `setFillStyleIdAsync`, `setStrokeStyleIdAsync`, `setTextStyleIdAsync`, etc. to make the node properties reflect that of the style node.

------------------------------------------------------------------------

### getStyleConsumersAsync(): Promise\<[StyleConsumers](https://developers.figma.com/docs/plugins/api/StyleConsumers/)\[\]\>

The consumers of this style. The `fields` in `StyleConsumers` refers to the field where the style is applied (e.g. a PaintStyle can be applied in `setFillStyleIdAsync` or `setStrokeStyleIdAsync`).

------------------------------------------------------------------------

### consumers: [StyleConsumers](https://developers.figma.com/docs/plugins/api/StyleConsumers/)\[\] \[readonly\]

**DEPRECATED:** Use `getStyleConsumersAsync` instead. Accessing this property will throw an exception if the plugin manifest contains `"documentAccess": "dynamic-page"`.

The consumers of this style. The `fields` in `StyleConsumers` refers to the field where the style is applied (e.g. a PaintStyle can be applied in `setFillStyleIdAsync` or `setStrokeStyleIdAsync`).

------------------------------------------------------------------------

### name: string

The name of the style node. Note that setting this also sets "autoRename" to false on [`TextNode`](https://developers.figma.com/docs/plugins/api/TextNode/).

------------------------------------------------------------------------

### remove(): void

Deletes a local style.

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

## Publishable properties

### [description](https://developers.figma.com/docs/plugins/api/properties/nodes-description/): string

The plain-text annotation entered by the user for this style/component.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-description/)

------------------------------------------------------------------------

### [descriptionMarkdown](https://developers.figma.com/docs/plugins/api/properties/nodes-descriptionmarkdown/): string

The rich-text annotation entered by the user for this style/component.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-descriptionmarkdown/)

------------------------------------------------------------------------

### [documentationLinks](https://developers.figma.com/docs/plugins/api/properties/nodes-documentationlinks/): ReadonlyArray\<[DocumentationLink](https://developers.figma.com/docs/plugins/api/DocumentationLink/)\>

The documentation links for this style/component.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-documentationlinks/)

------------------------------------------------------------------------

### remote: boolean \[readonly\]

Whether this style/component is a remote style/component that doesn't live in the file (i.e. is from the team library). Remote components are read-only: attempts to change their properties will throw.

------------------------------------------------------------------------

### key: string \[readonly\]

The key to use with [`figma.importComponentByKeyAsync`](https://developers.figma.com/docs/plugins/api/figma/#importcomponentbykeyasync), [`figma.importComponentSetByKeyAsync`](https://developers.figma.com/docs/plugins/api/figma/#importcomponentsetbykeyasync) and [`figma.importStyleByKeyAsync`](https://developers.figma.com/docs/plugins/api/figma/#importstylebykeyasync). Note that while this key is present on local and published components, you can only import components that are already published.

------------------------------------------------------------------------

### getPublishStatusAsync(): Promise\<[PublishStatus](https://developers.figma.com/docs/plugins/api/PublishStatus/)\>

Gets the status of this style/component in the team library.

------------------------------------------------------------------------

## Folders

Styles can be put inside folders (including nested folders) by setting the name of the style to be a delimited path name. For example, the following code would move a paint style named `Style 1` into a nested folder named `b`. Folder `b` resides in folder `a`.

``` ts
const style = figma.createPaintStyle() 
style.name = "a/b/Style 1"
```

Folder names cannot be empty strings and they are unique within the same hierarchy. Since two nested folders can have the same name when residing in different parent folders, we refer to folders by their absolute delimited folder name. The following function `getNamePrefix` can be used to get the absolute folder name given a style name.

``` ts
const getNameParts = (name: string) => {
  const nameParts = name.split('/').filter((part: string) => !!part)
  return nameParts.map((part: string) => part.trim())
}

const getNamePrefix = (name: string): string => {
  const pathParts = getNameParts(name)
  pathParts.pop()
  return pathParts.join('/')
}
```

---

> Source: <https://developers.figma.com/docs/plugins/api/EffectStyle/>

# EffectStyle

## EffectStyle

### type: 'EFFECT'

The string literal "EFFECT" representing the style type. Always check the `type` before reading other properties.

------------------------------------------------------------------------

### effects: ReadonlyArray\<[Effect](https://developers.figma.com/docs/plugins/api/Effect/)\>

List of [`Effect`](https://developers.figma.com/docs/plugins/api/Effect/) to replace the `effects` property with.

------------------------------------------------------------------------

### boundVariables?: { readonly \[field in [VariableBindableEffectStyleField](https://developers.figma.com/docs/plugins/api/VariableBindableEffectStyleField/)\]?: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/)\[\]} \[readonly\]

The variables bound to a particular field on this effect style.

------------------------------------------------------------------------

## Base style properties

### id: string \[readonly\]

The unique identifier of the style in the document the plugin is executing from. You can assign this value via `setFillStyleIdAsync`, `setStrokeStyleIdAsync`, `setTextStyleIdAsync`, etc. to make the node properties reflect that of the style node.

------------------------------------------------------------------------

### getStyleConsumersAsync(): Promise\<[StyleConsumers](https://developers.figma.com/docs/plugins/api/StyleConsumers/)\[\]\>

The consumers of this style. The `fields` in `StyleConsumers` refers to the field where the style is applied (e.g. a PaintStyle can be applied in `setFillStyleIdAsync` or `setStrokeStyleIdAsync`).

------------------------------------------------------------------------

### consumers: [StyleConsumers](https://developers.figma.com/docs/plugins/api/StyleConsumers/)\[\] \[readonly\]

**DEPRECATED:** Use `getStyleConsumersAsync` instead. Accessing this property will throw an exception if the plugin manifest contains `"documentAccess": "dynamic-page"`.

The consumers of this style. The `fields` in `StyleConsumers` refers to the field where the style is applied (e.g. a PaintStyle can be applied in `setFillStyleIdAsync` or `setStrokeStyleIdAsync`).

------------------------------------------------------------------------

### name: string

The name of the style node. Note that setting this also sets "autoRename" to false on [`TextNode`](https://developers.figma.com/docs/plugins/api/TextNode/).

------------------------------------------------------------------------

### remove(): void

Deletes a local style.

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

## Publishable properties

### [description](https://developers.figma.com/docs/plugins/api/properties/nodes-description/): string

The plain-text annotation entered by the user for this style/component.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-description/)

------------------------------------------------------------------------

### [descriptionMarkdown](https://developers.figma.com/docs/plugins/api/properties/nodes-descriptionmarkdown/): string

The rich-text annotation entered by the user for this style/component.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-descriptionmarkdown/)

------------------------------------------------------------------------

### [documentationLinks](https://developers.figma.com/docs/plugins/api/properties/nodes-documentationlinks/): ReadonlyArray\<[DocumentationLink](https://developers.figma.com/docs/plugins/api/DocumentationLink/)\>

The documentation links for this style/component.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-documentationlinks/)

------------------------------------------------------------------------

### remote: boolean \[readonly\]

Whether this style/component is a remote style/component that doesn't live in the file (i.e. is from the team library). Remote components are read-only: attempts to change their properties will throw.

------------------------------------------------------------------------

### key: string \[readonly\]

The key to use with [`figma.importComponentByKeyAsync`](https://developers.figma.com/docs/plugins/api/figma/#importcomponentbykeyasync), [`figma.importComponentSetByKeyAsync`](https://developers.figma.com/docs/plugins/api/figma/#importcomponentsetbykeyasync) and [`figma.importStyleByKeyAsync`](https://developers.figma.com/docs/plugins/api/figma/#importstylebykeyasync). Note that while this key is present on local and published components, you can only import components that are already published.

------------------------------------------------------------------------

### getPublishStatusAsync(): Promise\<[PublishStatus](https://developers.figma.com/docs/plugins/api/PublishStatus/)\>

Gets the status of this style/component in the team library.

------------------------------------------------------------------------

## Folders

Styles can be put inside folders (including nested folders) by setting the name of the style to be a delimited path name. For example, the following code would move a paint style named `Style 1` into a nested folder named `b`. Folder `b` resides in folder `a`.

``` ts
const style = figma.createPaintStyle() 
style.name = "a/b/Style 1"
```

Folder names cannot be empty strings and they are unique within the same hierarchy. Since two nested folders can have the same name when residing in different parent folders, we refer to folders by their absolute delimited folder name. The following function `getNamePrefix` can be used to get the absolute folder name given a style name.

``` ts
const getNameParts = (name: string) => {
  const nameParts = name.split('/').filter((part: string) => !!part)
  return nameParts.map((part: string) => part.trim())
}

const getNamePrefix = (name: string): string => {
  const pathParts = getNameParts(name)
  pathParts.pop()
  return pathParts.join('/')
}
```

---

> Source: <https://developers.figma.com/docs/plugins/api/GridStyle/>

# GridStyle

## GridStyle

### type: 'GRID'

The string literal "GRID" representing the style type. Always check the `type` before reading other properties.

------------------------------------------------------------------------

### layoutGrids: ReadonlyArray\<[LayoutGrid](https://developers.figma.com/docs/plugins/api/LayoutGrid/)\>

List of [`LayoutGrid`](https://developers.figma.com/docs/plugins/api/LayoutGrid/) to replace the `layoutGrids` property with.

------------------------------------------------------------------------

### boundVariables?: { readonly \[field in [VariableBindableGridStyleField](https://developers.figma.com/docs/plugins/api/VariableBindableGridStyleField/)\]?: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/)\[\]} \[readonly\]

The variables bound to a particular field on this grid style.

------------------------------------------------------------------------

## Base style properties

### id: string \[readonly\]

The unique identifier of the style in the document the plugin is executing from. You can assign this value via `setFillStyleIdAsync`, `setStrokeStyleIdAsync`, `setTextStyleIdAsync`, etc. to make the node properties reflect that of the style node.

------------------------------------------------------------------------

### getStyleConsumersAsync(): Promise\<[StyleConsumers](https://developers.figma.com/docs/plugins/api/StyleConsumers/)\[\]\>

The consumers of this style. The `fields` in `StyleConsumers` refers to the field where the style is applied (e.g. a PaintStyle can be applied in `setFillStyleIdAsync` or `setStrokeStyleIdAsync`).

------------------------------------------------------------------------

### consumers: [StyleConsumers](https://developers.figma.com/docs/plugins/api/StyleConsumers/)\[\] \[readonly\]

**DEPRECATED:** Use `getStyleConsumersAsync` instead. Accessing this property will throw an exception if the plugin manifest contains `"documentAccess": "dynamic-page"`.

The consumers of this style. The `fields` in `StyleConsumers` refers to the field where the style is applied (e.g. a PaintStyle can be applied in `setFillStyleIdAsync` or `setStrokeStyleIdAsync`).

------------------------------------------------------------------------

### name: string

The name of the style node. Note that setting this also sets "autoRename" to false on [`TextNode`](https://developers.figma.com/docs/plugins/api/TextNode/).

------------------------------------------------------------------------

### remove(): void

Deletes a local style.

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

## Publishable properties

### [description](https://developers.figma.com/docs/plugins/api/properties/nodes-description/): string

The plain-text annotation entered by the user for this style/component.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-description/)

------------------------------------------------------------------------

### [descriptionMarkdown](https://developers.figma.com/docs/plugins/api/properties/nodes-descriptionmarkdown/): string

The rich-text annotation entered by the user for this style/component.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-descriptionmarkdown/)

------------------------------------------------------------------------

### [documentationLinks](https://developers.figma.com/docs/plugins/api/properties/nodes-documentationlinks/): ReadonlyArray\<[DocumentationLink](https://developers.figma.com/docs/plugins/api/DocumentationLink/)\>

The documentation links for this style/component.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-documentationlinks/)

------------------------------------------------------------------------

### remote: boolean \[readonly\]

Whether this style/component is a remote style/component that doesn't live in the file (i.e. is from the team library). Remote components are read-only: attempts to change their properties will throw.

------------------------------------------------------------------------

### key: string \[readonly\]

The key to use with [`figma.importComponentByKeyAsync`](https://developers.figma.com/docs/plugins/api/figma/#importcomponentbykeyasync), [`figma.importComponentSetByKeyAsync`](https://developers.figma.com/docs/plugins/api/figma/#importcomponentsetbykeyasync) and [`figma.importStyleByKeyAsync`](https://developers.figma.com/docs/plugins/api/figma/#importstylebykeyasync). Note that while this key is present on local and published components, you can only import components that are already published.

------------------------------------------------------------------------

### getPublishStatusAsync(): Promise\<[PublishStatus](https://developers.figma.com/docs/plugins/api/PublishStatus/)\>

Gets the status of this style/component in the team library.

------------------------------------------------------------------------

## Folders

Styles can be put inside folders (including nested folders) by setting the name of the style to be a delimited path name. For example, the following code would move a paint style named `Style 1` into a nested folder named `b`. Folder `b` resides in folder `a`.

``` ts
const style = figma.createPaintStyle() 
style.name = "a/b/Style 1"
```

Folder names cannot be empty strings and they are unique within the same hierarchy. Since two nested folders can have the same name when residing in different parent folders, we refer to folders by their absolute delimited folder name. The following function `getNamePrefix` can be used to get the absolute folder name given a style name.

``` ts
const getNameParts = (name: string) => {
  const nameParts = name.split('/').filter((part: string) => !!part)
  return nameParts.map((part: string) => part.trim())
}

const getNamePrefix = (name: string): string => {
  const pathParts = getNameParts(name)
  pathParts.pop()
  return pathParts.join('/')
}
```

---

> Source: <https://developers.figma.com/docs/plugins/api/figma/>

## Style accessors on the `figma` global

### getStyleByIdAsync(id: string): Promise\<[BaseStyle](https://developers.figma.com/docs/plugins/api/BaseStyle/) \| null\>

Finds a style by its id in the current document. If not found, returns a promise containing null.

------------------------------------------------------------------------

------------------------------------------------------------------------

### getStyleById(id: string): [BaseStyle](https://developers.figma.com/docs/plugins/api/BaseStyle/) \| null

**DEPRECATED:** Use [`figma.getStyleByIdAsync`](https://developers.figma.com/docs/plugins/api/figma/#getstylebyidasync) instead. This function will throw an exception if the plugin manifest contains `"documentAccess": "dynamic-page"`.

Finds a style by its id in the current document. If not found, returns null.

------------------------------------------------------------------------

------------------------------------------------------------------------

### createPaintStyle(): [PaintStyle](https://developers.figma.com/docs/plugins/api/PaintStyle/)

info

This API is only available in Figma Design

Creates a new Paint style. This might be referred to as a Color style, or Fill style more colloquially. However, since this type of style may contain images, and may be used for backgrounds, strokes, and fills, it is called a Paint.

------------------------------------------------------------------------

------------------------------------------------------------------------

### createTextStyle(): [TextStyle](https://developers.figma.com/docs/plugins/api/TextStyle/)

info

This API is only available in Figma Design

Creates a new Text style. By default, the text style has the Figma default text properties (font family Inter Regular, font size 12).

------------------------------------------------------------------------

------------------------------------------------------------------------

### createEffectStyle(): [EffectStyle](https://developers.figma.com/docs/plugins/api/EffectStyle/)

info

This API is only available in Figma Design

Creates a new Effect style.

------------------------------------------------------------------------

------------------------------------------------------------------------

### createGridStyle(): [GridStyle](https://developers.figma.com/docs/plugins/api/GridStyle/)

info

This API is only available in Figma Design

Creates a new Grid style.

------------------------------------------------------------------------

The APIs below allow access to local styles, which are returned in the same order as displayed in the UI. Only local styles are returned, not the ones from the team library.

------------------------------------------------------------------------

### getLocalPaintStylesAsync(): Promise\<[PaintStyle](https://developers.figma.com/docs/plugins/api/PaintStyle/)\[\]\>

Returns the list of local paint styles.

------------------------------------------------------------------------

------------------------------------------------------------------------

### getLocalPaintStyles(): [PaintStyle](https://developers.figma.com/docs/plugins/api/PaintStyle/)\[\]

**DEPRECATED:** Use [`figma.getLocalPaintStylesAsync`](https://developers.figma.com/docs/plugins/api/figma/#getlocalpaintstylesasync) instead. This function will throw an exception if the plugin manifest contains `"documentAccess": "dynamic-page"`.

Returns the list of local paint styles.

------------------------------------------------------------------------

------------------------------------------------------------------------

### getLocalTextStylesAsync(): Promise\<[TextStyle](https://developers.figma.com/docs/plugins/api/TextStyle/)\[\]\>

Returns the list of local text styles.

------------------------------------------------------------------------

------------------------------------------------------------------------

### getLocalTextStyles(): [TextStyle](https://developers.figma.com/docs/plugins/api/TextStyle/)\[\]

**DEPRECATED:** Use [`figma.getLocalTextStylesAsync`](https://developers.figma.com/docs/plugins/api/figma/#getlocaltextstylesasync) instead. This function will throw an exception if the plugin manifest contains `"documentAccess": "dynamic-page"`.

Returns the list of local text styles.

------------------------------------------------------------------------

------------------------------------------------------------------------

### getLocalEffectStylesAsync(): Promise\<[EffectStyle](https://developers.figma.com/docs/plugins/api/EffectStyle/)\[\]\>

Returns the list of local effect styles.

------------------------------------------------------------------------

------------------------------------------------------------------------

### getLocalEffectStyles(): [EffectStyle](https://developers.figma.com/docs/plugins/api/EffectStyle/)\[\]

**DEPRECATED:** Use [`figma.getLocalEffectStylesAsync`](https://developers.figma.com/docs/plugins/api/figma/#getlocaleffectstylesasync) instead. This function will throw an exception if the plugin manifest contains `"documentAccess": "dynamic-page"`.

Returns the list of local effect styles.

------------------------------------------------------------------------

------------------------------------------------------------------------

### getLocalGridStylesAsync(): Promise\<[GridStyle](https://developers.figma.com/docs/plugins/api/GridStyle/)\[\]\>

Returns the list of local grid styles.

------------------------------------------------------------------------

------------------------------------------------------------------------

### getLocalGridStyles(): [GridStyle](https://developers.figma.com/docs/plugins/api/GridStyle/)\[\]

**DEPRECATED:** Use [`figma.getLocalGridStylesAsync`](https://developers.figma.com/docs/plugins/api/figma/#getlocalgridstylesasync) instead. This function will throw an exception if the plugin manifest contains `"documentAccess": "dynamic-page"`.

Returns the list of local grid styles.

------------------------------------------------------------------------

------------------------------------------------------------------------

### moveLocalPaintStyleAfter(targetNode: [PaintStyle](https://developers.figma.com/docs/plugins/api/PaintStyle/), reference: [PaintStyle](https://developers.figma.com/docs/plugins/api/PaintStyle/) \| null): void

info

This API is only available in Figma Design

Reorders a target node after the specified reference node (if provided) or to be first if reference is null. The target and reference nodes must live in the same folder. The target and reference nodes must be local paint styles.

------------------------------------------------------------------------

------------------------------------------------------------------------

### moveLocalTextStyleAfter(targetNode: [TextStyle](https://developers.figma.com/docs/plugins/api/TextStyle/), reference: [TextStyle](https://developers.figma.com/docs/plugins/api/TextStyle/) \| null): void

info

This API is only available in Figma Design

Reorders a target node after the specified reference node (if provided) or to be first if reference is null. The target and reference nodes must live in the same folder. The target and reference nodes must be local text styles.

------------------------------------------------------------------------

------------------------------------------------------------------------

### moveLocalEffectStyleAfter(targetNode: [EffectStyle](https://developers.figma.com/docs/plugins/api/EffectStyle/), reference: [EffectStyle](https://developers.figma.com/docs/plugins/api/EffectStyle/) \| null): void

info

This API is only available in Figma Design

Reorders a target node after the specified reference node (if provided) or to be first if reference is null. The target and reference nodes must live in the same folder. The target and reference nodes must be local effect styles.

------------------------------------------------------------------------

------------------------------------------------------------------------

### moveLocalGridStyleAfter(targetNode: [GridStyle](https://developers.figma.com/docs/plugins/api/GridStyle/), reference: [GridStyle](https://developers.figma.com/docs/plugins/api/GridStyle/) \| null): void

info

This API is only available in Figma Design

Reorders a target node after the specified reference node (if provided) or to be first if reference is null. The target and reference nodes must live in the same folder. The target and reference nodes must be local grid styles.

------------------------------------------------------------------------

------------------------------------------------------------------------

### importStyleByKeyAsync(key: string): Promise\<[BaseStyle](https://developers.figma.com/docs/plugins/api/BaseStyle/)\>

Loads a style from the team library. Promise is rejected if there is no style with that key or if the request fails.

------------------------------------------------------------------------
