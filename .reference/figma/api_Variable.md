# Source: https://developers.figma.com/docs/plugins/api/Variable/

<!-- Vendored snapshot of the Figma Plugin API docs. Captured 2026-08-04. -->

**Sources in this file** (captured 2026-08-04):

- <https://developers.figma.com/docs/plugins/api/Variable/>
- <https://developers.figma.com/docs/plugins/api/properties/Variable-hiddenfrompublishing/>
- <https://developers.figma.com/docs/plugins/api/properties/Variable-resolveforconsumer/>
- <https://developers.figma.com/docs/plugins/api/properties/Variable-scopes/>

---
# Variable

## Variable properties

A `Variable` is a single design token that defines values for each of the modes in its [`VariableCollection`](https://developers.figma.com/docs/plugins/api/VariableCollection/). These values can be applied to various kinds of design properties and prototyping actions, enabling design token functionality and advanced prototyping flows.

Read more about variables in the [Guide to variables](https://help.figma.com/hc/en-us/articles/15339657135383).

### id: string \[readonly\]

The unique identifier of this variable.

------------------------------------------------------------------------

### name: string

The name of this variable.

------------------------------------------------------------------------

### description: string

Description of this variable.

------------------------------------------------------------------------

### [hiddenFromPublishing](https://developers.figma.com/docs/plugins/api/properties/Variable-hiddenfrompublishing/): boolean

Whether this variable is hidden when publishing the current file as a library. Can only true if [`remote`](https://developers.figma.com/docs/plugins/api/Variable/#remote) is false (e.g. this is a local variable).

[View more →](https://developers.figma.com/docs/plugins/api/properties/Variable-hiddenfrompublishing/)

------------------------------------------------------------------------

### getPublishStatusAsync(): Promise\<[PublishStatus](https://developers.figma.com/docs/plugins/api/PublishStatus/)\>

Returns the publishing status of this variable in the current file.

------------------------------------------------------------------------

### remote: boolean \[readonly\]

Whether this variable is remote or local.

------------------------------------------------------------------------

### variableCollectionId: string \[readonly\]

The ID of the collection that contains this variable.

------------------------------------------------------------------------

### key: string \[readonly\]

The key to use with [`importVariableByKeyAsync`](https://developers.figma.com/docs/plugins/api/properties/figma-variables-importvariablebykeyasync/). Note that while this key is present on local and published variables, you can only import variables that are already published.

------------------------------------------------------------------------

### resolvedType: [VariableResolvedDataType](https://developers.figma.com/docs/plugins/api/VariableResolvedDataType/) \[readonly\]

The resolved type of the variable.

------------------------------------------------------------------------

### [resolveForConsumer](https://developers.figma.com/docs/plugins/api/properties/Variable-resolveforconsumer/)(consumer: [SceneNode](https://developers.figma.com/docs/plugins/api/nodes/#scenenode)): { value: [VariableValue](https://developers.figma.com/docs/plugins/api/VariableValue/); resolvedType: [VariableResolvedDataType](https://developers.figma.com/docs/plugins/api/VariableResolvedDataType/) }

Retrieves the resolved value for this variable if it was bound to `consumer`.

[View more →](https://developers.figma.com/docs/plugins/api/properties/Variable-resolveforconsumer/)

------------------------------------------------------------------------

### setValueForMode(modeId: string, newValue: [VariableValue](https://developers.figma.com/docs/plugins/api/VariableValue/)): void

Sets the value of this variable for the provided mode. If the modeId belongs to an extended collection, the value will be overridden on the extension.

------------------------------------------------------------------------

### valuesByMode: { \[modeId: string\]: [VariableValue](https://developers.figma.com/docs/plugins/api/VariableValue/) } \[readonly\]

The values for each mode of this variable. Note that this will not resolve any aliases. To return fully resolved values in all cases, consider using [`resolveForConsumer`](https://developers.figma.com/docs/plugins/api/properties/Variable-resolveforconsumer/).

------------------------------------------------------------------------

### remove(): void

Removes this variable from the document.

------------------------------------------------------------------------

### [scopes](https://developers.figma.com/docs/plugins/api/properties/Variable-scopes/): Array\<[VariableScope](https://developers.figma.com/docs/plugins/api/VariableScope/)\>

An array of scopes in the UI where this variable is shown. Setting this property will show/hide this variable in the variable picker UI for different fields.

[View more →](https://developers.figma.com/docs/plugins/api/properties/Variable-scopes/)

------------------------------------------------------------------------

### codeSyntax: { \[platform in [CodeSyntaxPlatform](https://developers.figma.com/docs/plugins/api/CodeSyntaxPlatform/#codesyntaxplatform)\]?: string} \[readonly\]

Code syntax definitions for this variable. Supported platforms are `'WEB'`, `'ANDROID'`, and `'iOS'`.

------------------------------------------------------------------------

### [setVariableCodeSyntax](https://developers.figma.com/docs/plugins/api/properties/Variable-setvariablecodesyntax/)(platform: [CodeSyntaxPlatform](https://developers.figma.com/docs/plugins/api/CodeSyntaxPlatform/#codesyntaxplatform), value: string): void

Add or modify a platform definition on [`codeSyntax`](https://developers.figma.com/docs/plugins/api/Variable/#codesyntax). Acceptable platforms are `'WEB'`, `'ANDROID'`, and `'iOS'`.

[View more →](https://developers.figma.com/docs/plugins/api/properties/Variable-setvariablecodesyntax/)

------------------------------------------------------------------------

### removeVariableCodeSyntax(platform: [CodeSyntaxPlatform](https://developers.figma.com/docs/plugins/api/CodeSyntaxPlatform/#codesyntaxplatform)): void

Remove a platform definition from [`codeSyntax`](https://developers.figma.com/docs/plugins/api/Variable/#codesyntax). Acceptable parameters are `'WEB'`, `'ANDROID'`, and `'iOS'` if previously defined.

------------------------------------------------------------------------

### valuesByModeForCollectionAsync(collection: [VariableCollection](https://developers.figma.com/docs/plugins/api/VariableCollection/)): Promise\<{ \[modeId: string\]: [VariableValue](https://developers.figma.com/docs/plugins/api/VariableValue/) }\>

The overridden or inherited values for each mode for the provided collection that inherits this variable. Note that this will not resolve any aliases. To return fully resolved values in all cases, consider using [`resolveForConsumer`](https://developers.figma.com/docs/plugins/api/properties/Variable-resolveforconsumer/).

------------------------------------------------------------------------

### removeOverrideForMode(extendedModeId: string): void

Removes the overridden value for the given mode if it exists and returns to the inherited value.

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

> Source: <https://developers.figma.com/docs/plugins/api/properties/Variable-hiddenfrompublishing/>

# hiddenFromPublishing

Whether this variable is hidden when publishing the current file as a library. Can only true if [`remote`](https://developers.figma.com/docs/plugins/api/Variable/#remote) is false (e.g. this is a local variable).

## Signature

### [hiddenFromPublishing](https://developers.figma.com/docs/plugins/api/properties/Variable-hiddenfrompublishing/): boolean

## Remarks

If the parent [`VariableCollection`](https://developers.figma.com/docs/plugins/api/VariableCollection/) is marked as `hiddenFromPublishing`, then this variable will also be hidden from publishing via the UI. `hiddenFromPublishing` is independently toggled for a variable and collection, however both must be true for a given variable to be publishable.

---

> Source: <https://developers.figma.com/docs/plugins/api/properties/Variable-resolveforconsumer/>

# resolveForConsumer

Retrieves the resolved value for this variable if it was bound to `consumer`.

## Signature

### [resolveForConsumer](https://developers.figma.com/docs/plugins/api/properties/Variable-resolveforconsumer/)(consumer: [SceneNode](https://developers.figma.com/docs/plugins/api/nodes/#scenenode)): { value: [VariableValue](https://developers.figma.com/docs/plugins/api/VariableValue/); resolvedType: [VariableResolvedDataType](https://developers.figma.com/docs/plugins/api/VariableResolvedDataType/) }

## Remarks

The value that a variable resolves to depends on the following:

- The node consuming the variable and which of the collection's modes is [currently selected in the node](https://help.figma.com/hc/en-us/articles/15343816063383)
- The variable's value for the selected mode
- If that value is an alias, then the resolved value is determined using the selected modes of each collection in the alias chain

info

It is not possible to statically determine the resolved value of a variable when there are multiple modes involved (either in the variable itself or in any variables in the alias chain).

The consuming node can have any combination of explicit or inherited variable modes per collection assigned to it.

Here are some examples illustrating how variables can resolve to different values depending on the consuming node. These examples do not work if the current file is on the Starter plan, which is limited to a single mode.

For a variable in a collection with two modes, it can resolve to up to two different values:

Simple variable value resolution without aliasing

``` ts
// Create a collection with two modes and a variable with a different
// float value for each mode
const collection = figma.variables.createVariableCollection("Collection")
const mode1Id = collection.modes[0].modeId
const mode2Id = collection.addMode('Mode 2')
const variable = figma.variables.createVariable(
  "My Variable",
  collection,
  'FLOAT'
)
variable.setValueForMode(mode1Id, 1)
variable.setValueForMode(mode2Id, 2)

const frame = figma.createFrame()
frame.setExplicitVariableModeForCollection(collection, mode1Id)
// Output: {value: 1, resolvedType: 'FLOAT'}
console.log(variable.resolveForConsumer(frame))

frame.setExplicitVariableModeForCollection(collection, mode2Id)
// Output: {value: 2, resolvedType: 'FLOAT'}
console.log(variable.resolveForConsumer(frame))
```

For a variable in a collection with two modes with each value aliasing to different variables in another collection with two modes, it can resolve to up to four different values.

Variable value resolution with aliasing

``` ts
// Create two collections:
// 1. A collection with two modes and two float variables
// 2. A collection with two modes and a variable aliasing to
//    different variables in the first collection
const collection1 = figma.variables.createVariableCollection("Collection 1")
const collection1Mode1Id = collection1.modes[0].modeId
const collection1Mode2Id = collection1.addMode('Mode 2')
const collection1Var1 = figma.variables.createVariable(
  "Variable 1",
  collection1,
  'FLOAT'
)
collection1Var1.setValueForMode(collection1Mode1Id, 1)
collection1Var1.setValueForMode(collection1Mode2Id, 2)
const collection1Var2 = figma.variables.createVariable(
  "Variable 2",
  collection1,
  'FLOAT'
)
collection1Var2.setValueForMode(collection1Mode1Id, 3)
collection1Var2.setValueForMode(collection1Mode2Id, 4)

const collection2 = figma.variables.createVariableCollection("Collection 2")
const collection2Mode1Id = collection2.modes[0].modeId
const collection2Mode2Id = collection2.addMode('Mode 2')
const collection2Var = figma.variables.createVariable(
  "Variable 1",
  collection2,
  'FLOAT'
)
collection2Var.setValueForMode(
  collection2Mode1Id,
  figma.variables.createVariableAlias(collection1Var1)
)
collection2Var.setValueForMode(
  collection2Mode2Id,
  figma.variables.createVariableAlias(collection1Var2)
)

const frame = figma.createFrame()

frame.setExplicitVariableModeForCollection(collection1, collection1Mode1Id)
frame.setExplicitVariableModeForCollection(collection2, collection2Mode1Id)
// Output: {value: 1, resolvedType: 'FLOAT'}
console.log(collection2Var.resolveForConsumer(frame))

frame.setExplicitVariableModeForCollection(collection1, collection1Mode2Id)
frame.setExplicitVariableModeForCollection(collection2, collection2Mode1Id)
// Output: {value: 2, resolvedType: 'FLOAT'}
console.log(collection2Var.resolveForConsumer(frame))

frame.setExplicitVariableModeForCollection(collection1, collection1Mode1Id)
frame.setExplicitVariableModeForCollection(collection2, collection2Mode2Id)
// Output: {value: 3, resolvedType: 'FLOAT'}
console.log(collection2Var.resolveForConsumer(frame))

frame.setExplicitVariableModeForCollection(collection1, collection1Mode2Id)
frame.setExplicitVariableModeForCollection(collection2, collection2Mode2Id)
// Output: {value: 4, resolvedType: 'FLOAT'}
console.log(collection2Var.resolveForConsumer(frame))
```

---

> Source: <https://developers.figma.com/docs/plugins/api/properties/Variable-scopes/>

# scopes

An array of scopes in the UI where this variable is shown. Setting this property will show/hide this variable in the variable picker UI for different fields.

## Signature

### [scopes](https://developers.figma.com/docs/plugins/api/properties/Variable-scopes/): Array\<[VariableScope](https://developers.figma.com/docs/plugins/api/VariableScope/)\>

## Remarks

Setting scopes for a variable does not prevent that variable from being bound in other scopes (for example, via the Plugin API). This only limits the variables that are shown in pickers within the Figma UI.
