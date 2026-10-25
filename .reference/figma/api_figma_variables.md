# Source: https://developers.figma.com/docs/plugins/api/figma-variables/

<!-- Vendored snapshot of the Figma Plugin API docs. Captured 2026-08-04. -->

**Sources in this file** (captured 2026-08-04):

- <https://developers.figma.com/docs/plugins/api/figma-variables/>
- <https://developers.figma.com/docs/plugins/api/properties/figma-variables-getvariablebyidasync/>
- <https://developers.figma.com/docs/plugins/api/properties/figma-variables-getvariablebyid/>
- <https://developers.figma.com/docs/plugins/api/properties/figma-variables-getvariablecollectionbyidasync/>
- <https://developers.figma.com/docs/plugins/api/properties/figma-variables-getvariablecollectionbyid/>
- <https://developers.figma.com/docs/plugins/api/properties/figma-variables-getlocalvariablesasync/>
- <https://developers.figma.com/docs/plugins/api/properties/figma-variables-getlocalvariables/>
- <https://developers.figma.com/docs/plugins/api/properties/figma-variables-createvariable/>
- <https://developers.figma.com/docs/plugins/api/properties/figma-variables-createvariablecollection/>
- <https://developers.figma.com/docs/plugins/api/properties/figma-variables-extendlibrarycollectionbykeyasync/>
- <https://developers.figma.com/docs/plugins/api/properties/figma-variables-importvariablebykeyasync/>

> The `figma.variables` global is the whole surface a token-sync plugin uses.
> Sync getters are **deprecated**; with `"documentAccess": "dynamic-page"` in the
> manifest they throw. Use the `*Async` replacements.

---
# figma.variables

These are all defined on `figma.variables`. Please see the [Working with Variables](https://developers.figma.com/docs/plugins/working-with-variables/) guide for how to use these functions to interact with variables in Figma.

### getVariableByIdAsync(id: string): Promise\<[Variable](https://developers.figma.com/docs/plugins/api/Variable/) \| null\>

Finds a variable by ID. If not found or the provided ID is invalid, returns a promise containing `null`.

[View more →](https://developers.figma.com/docs/plugins/api/properties/figma-variables-getvariablebyidasync/)

------------------------------------------------------------------------

### getVariableById(id: string): [Variable](https://developers.figma.com/docs/plugins/api/Variable/) \| null

**DEPRECATED:** Use [`getVariableByIdAsync`](https://developers.figma.com/docs/plugins/api/properties/figma-variables-getvariablebyidasync/) instead. This function will throw an exception if the plugin manifest contains `"documentAccess": "dynamic-page"`.

Finds a variable by ID. If not found or the provided ID is invalid, returns `null`.

[View more →](https://developers.figma.com/docs/plugins/api/properties/figma-variables-getvariablebyid/)

------------------------------------------------------------------------

### getVariableCollectionByIdAsync(id: string): Promise\<[VariableCollection](https://developers.figma.com/docs/plugins/api/VariableCollection/) \| null\>

Finds a variable collection by ID. If not found or the provided ID is invalid, returns a promise containing `null`.

[View more →](https://developers.figma.com/docs/plugins/api/properties/figma-variables-getvariablecollectionbyidasync/)

------------------------------------------------------------------------

### getVariableCollectionById(id: string): [VariableCollection](https://developers.figma.com/docs/plugins/api/VariableCollection/) \| null

**DEPRECATED:** Use [`getVariableCollectionByIdAsync`](https://developers.figma.com/docs/plugins/api/properties/figma-variables-getvariablecollectionbyidasync/) instead. This function will throw an exception if the plugin manifest contains `"documentAccess": "dynamic-page"`.

Finds a variable collection by ID. If not found or the provided ID is invalid, returns `null`.

[View more →](https://developers.figma.com/docs/plugins/api/properties/figma-variables-getvariablecollectionbyid/)

------------------------------------------------------------------------

### getLocalVariablesAsync(type?: [VariableResolvedDataType](https://developers.figma.com/docs/plugins/api/VariableResolvedDataType/)): Promise\<[Variable](https://developers.figma.com/docs/plugins/api/Variable/)\[\]\>

Returns all local variables in the current file, optionally filtering by resolved type.

[View more →](https://developers.figma.com/docs/plugins/api/properties/figma-variables-getlocalvariablesasync/)

------------------------------------------------------------------------

### getLocalVariables(type?: [VariableResolvedDataType](https://developers.figma.com/docs/plugins/api/VariableResolvedDataType/)): [Variable](https://developers.figma.com/docs/plugins/api/Variable/)\[\]

**DEPRECATED:** Use [`getLocalVariablesAsync`](https://developers.figma.com/docs/plugins/api/properties/figma-variables-getlocalvariablesasync/) instead. This function will throw an exception if the plugin manifest contains `"documentAccess": "dynamic-page"`.

Returns all local variables in the current file, optionally filtering by resolved type.

[View more →](https://developers.figma.com/docs/plugins/api/properties/figma-variables-getlocalvariables/)

------------------------------------------------------------------------

### getLocalVariableCollectionsAsync(): Promise\<[VariableCollection](https://developers.figma.com/docs/plugins/api/VariableCollection/)\[\]\>

Returns all local variable collections in the current file.

------------------------------------------------------------------------

### getLocalVariableCollections(): [VariableCollection](https://developers.figma.com/docs/plugins/api/VariableCollection/)\[\]

**DEPRECATED:** Use [`getLocalVariableCollectionsAsync`](https://developers.figma.com/docs/plugins/api/figma-variables/#getlocalvariablecollectionsasync) instead. This function will throw an exception if the plugin manifest contains `"documentAccess": "dynamic-page"`.

Returns all local variable collections in the current file.

------------------------------------------------------------------------

### createVariable(name: string, collection: [VariableCollection](https://developers.figma.com/docs/plugins/api/VariableCollection/), resolvedType: [VariableResolvedDataType](https://developers.figma.com/docs/plugins/api/VariableResolvedDataType/)): [Variable](https://developers.figma.com/docs/plugins/api/Variable/)

Creates a variable with a given name and resolved type inside a collection.

[View more →](https://developers.figma.com/docs/plugins/api/properties/figma-variables-createvariable/)

------------------------------------------------------------------------

### createVariableCollection(name: string): [VariableCollection](https://developers.figma.com/docs/plugins/api/VariableCollection/)

Creates a new variable collection with the given name.

[View more →](https://developers.figma.com/docs/plugins/api/properties/figma-variables-createvariablecollection/)

------------------------------------------------------------------------

### extendLibraryCollectionByKeyAsync(collectionKey: string, name: string): Promise\<[ExtendedVariableCollection](https://developers.figma.com/docs/plugins/api/ExtendedVariableCollection/)\>

Creates a new extended variable collection from a library or local variable collection with the given name.

[View more →](https://developers.figma.com/docs/plugins/api/properties/figma-variables-extendlibrarycollectionbykeyasync/)

------------------------------------------------------------------------

### createVariableAlias(variable: [Variable](https://developers.figma.com/docs/plugins/api/Variable/)): [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/)

Helper function to create a variable alias.

This should be used with functions such as `node.setProperties()` to assign component properties to variables.

------------------------------------------------------------------------

### createVariableAliasByIdAsync(variableId: string): Promise\<[VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/)\>

Helper function to create a variable alias.

This should be used with functions such as `node.setProperties()` to assign component properties to variables.

------------------------------------------------------------------------

### setBoundVariableForPaint(paint: [SolidPaint](https://developers.figma.com/docs/plugins/api/Paint/#solidpaint), field: [VariableBindablePaintField](https://developers.figma.com/docs/plugins/api/VariableBindablePaintField/), variable: [Variable](https://developers.figma.com/docs/plugins/api/Variable/) \| null): [SolidPaint](https://developers.figma.com/docs/plugins/api/Paint/#solidpaint)

Helper function to bind a variable to a [`SolidPaint`](https://developers.figma.com/docs/plugins/api/Paint/).

If `null` is provided as the `variable`, the given `field` will be unbound from any variables.

------------------------------------------------------------------------

### setBoundVariableForEffect(effect: [Effect](https://developers.figma.com/docs/plugins/api/Effect/), field: [VariableBindableEffectField](https://developers.figma.com/docs/plugins/api/VariableBindableEffectField/), variable: [Variable](https://developers.figma.com/docs/plugins/api/Variable/) \| null): [Effect](https://developers.figma.com/docs/plugins/api/Effect/)

Helper function to bind a variable to an [`Effect`](https://developers.figma.com/docs/plugins/api/Effect/).

If `null` is provided as the `variable`, the given `field` will be unbound from any variables.

------------------------------------------------------------------------

### setBoundVariableForLayoutGrid(layoutGrid: [LayoutGrid](https://developers.figma.com/docs/plugins/api/LayoutGrid/), field: [VariableBindableLayoutGridField](https://developers.figma.com/docs/plugins/api/VariableBindableLayoutGridField/), variable: [Variable](https://developers.figma.com/docs/plugins/api/Variable/) \| null): [LayoutGrid](https://developers.figma.com/docs/plugins/api/LayoutGrid/)

Helper function to bind a variable to a [`LayoutGrid`](https://developers.figma.com/docs/plugins/api/LayoutGrid/).

If `null` is provided as the `variable`, the given `field` will be unbound from any variables.

------------------------------------------------------------------------

### importVariableByKeyAsync(key: string): Promise\<[Variable](https://developers.figma.com/docs/plugins/api/Variable/)\>

Loads a variable from the team library. Promise is rejected if there is no published variable with that key or if the request fails.

[View more →](https://developers.figma.com/docs/plugins/api/properties/figma-variables-importvariablebykeyasync/)

------------------------------------------------------------------------

---

> Source: <https://developers.figma.com/docs/plugins/api/properties/figma-variables-getvariablebyidasync/>

# getVariableByIdAsync

Finds a variable by ID. If not found or the provided ID is invalid, returns a promise containing `null`.

## Signature

### getVariableByIdAsync(id: string): Promise\<[Variable](https://developers.figma.com/docs/plugins/api/Variable/) \| null\>

## Parameters

### id

The variable ID to search for, which represents a unique identifier for the variable.

---

> Source: <https://developers.figma.com/docs/plugins/api/properties/figma-variables-getvariablebyid/>

# getVariableById

**DEPRECATED:** Use [`getVariableByIdAsync`](https://developers.figma.com/docs/plugins/api/properties/figma-variables-getvariablebyidasync/) instead. This function will throw an exception if the plugin manifest contains `"documentAccess": "dynamic-page"`.

Finds a variable by ID. If not found or the provided ID is invalid, returns `null`.

## Signature

### getVariableById(id: string): [Variable](https://developers.figma.com/docs/plugins/api/Variable/) \| null

## Parameters

### id

The variable ID to search for, which represents a unique identifier for the variable.

---

> Source: <https://developers.figma.com/docs/plugins/api/properties/figma-variables-getvariablecollectionbyidasync/>

# getVariableCollectionByIdAsync

Finds a variable collection by ID. If not found or the provided ID is invalid, returns a promise containing `null`.

## Signature

### getVariableCollectionByIdAsync(id: string): Promise\<[VariableCollection](https://developers.figma.com/docs/plugins/api/VariableCollection/) \| null\>

## Parameters

### id

The variable collection ID to search for, which represents a unique identifier for the variable collection.

---

> Source: <https://developers.figma.com/docs/plugins/api/properties/figma-variables-getvariablecollectionbyid/>

# getVariableCollectionById

**DEPRECATED:** Use [`getVariableCollectionByIdAsync`](https://developers.figma.com/docs/plugins/api/properties/figma-variables-getvariablecollectionbyidasync/) instead. This function will throw an exception if the plugin manifest contains `"documentAccess": "dynamic-page"`.

Finds a variable collection by ID. If not found or the provided ID is invalid, returns `null`.

## Signature

### getVariableCollectionById(id: string): [VariableCollection](https://developers.figma.com/docs/plugins/api/VariableCollection/) \| null

## Parameters

### id

The variable collection ID to search for, which represents a unique identifier for the variable collection.

---

> Source: <https://developers.figma.com/docs/plugins/api/properties/figma-variables-getlocalvariablesasync/>

# getLocalVariablesAsync

Returns all local variables in the current file, optionally filtering by resolved type.

## Signature

### getLocalVariablesAsync(type?: [VariableResolvedDataType](https://developers.figma.com/docs/plugins/api/VariableResolvedDataType/)): Promise\<[Variable](https://developers.figma.com/docs/plugins/api/Variable/)\[\]\>

## Parameters

### type

Filters the returned variables to only be of the given resolved type.

---

> Source: <https://developers.figma.com/docs/plugins/api/properties/figma-variables-getlocalvariables/>

# getLocalVariables

**DEPRECATED:** Use [`getLocalVariablesAsync`](https://developers.figma.com/docs/plugins/api/properties/figma-variables-getlocalvariablesasync/) instead. This function will throw an exception if the plugin manifest contains `"documentAccess": "dynamic-page"`.

Returns all local variables in the current file, optionally filtering by resolved type.

## Signature

### getLocalVariables(type?: [VariableResolvedDataType](https://developers.figma.com/docs/plugins/api/VariableResolvedDataType/)): [Variable](https://developers.figma.com/docs/plugins/api/Variable/)\[\]

## Parameters

### type

Filters the returned variables to only be of the given resolved type.

---

> Source: <https://developers.figma.com/docs/plugins/api/properties/figma-variables-createvariable/>

# createVariable

Creates a variable with a given name and resolved type inside a collection.

## Signature

### createVariable(name: string, collection: [VariableCollection](https://developers.figma.com/docs/plugins/api/VariableCollection/), resolvedType: [VariableResolvedDataType](https://developers.figma.com/docs/plugins/api/VariableResolvedDataType/)): [Variable](https://developers.figma.com/docs/plugins/api/Variable/)

## Parameters

### name

The name of the newly created variable

### collection

A variable collection. Make sure to pass a collection object here; passing a collection ID is deprecated.

### resolvedType

The resolved type of this variable

---

> Source: <https://developers.figma.com/docs/plugins/api/properties/figma-variables-createvariablecollection/>

# createVariableCollection

Creates a new variable collection with the given name.

## Signature

### createVariableCollection(name: string): [VariableCollection](https://developers.figma.com/docs/plugins/api/VariableCollection/)

## Parameters

### name

The name of the newly created variable collection.

---

> Source: <https://developers.figma.com/docs/plugins/api/properties/figma-variables-extendlibrarycollectionbykeyasync/>

# extendLibraryCollectionByKeyAsync

Creates a new extended variable collection from a library or local variable collection with the given name.

## Signature

### extendLibraryCollectionByKeyAsync(collectionKey: string, name: string): Promise\<[ExtendedVariableCollection](https://developers.figma.com/docs/plugins/api/ExtendedVariableCollection/)\>

## Parameters

### collectionKey

The key of the library or local variable collection to extend.

### name

The name of the newly created variable collection.

info

This API is limited to the Enterprise plan. If limited by the current pricing tier, this method will throw an error with the message `in extend: Cannot create extended collections outside of enterprise plan.`

---

> Source: <https://developers.figma.com/docs/plugins/api/properties/figma-variables-importvariablebykeyasync/>

# importVariableByKeyAsync

Loads a variable from the team library. Promise is rejected if there is no published variable with that key or if the request fails.

## Signature

### importVariableByKeyAsync(key: string): Promise\<[Variable](https://developers.figma.com/docs/plugins/api/Variable/)\>

## Parameters

### key

the key of the variable to import.
