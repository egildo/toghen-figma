# Source: https://developers.figma.com/docs/plugins/working-with-variables/

<!-- Vendored snapshot of the Figma Plugin API docs. Captured 2026-08-04. -->

*Captured 2026-08-04.*

---
# Working with Variables

Variables in Figma design store reusable values that can be applied to all kinds of design properties and prototyping actions. They help save time and effort when building designs, managing design systems, and creating complex prototyping flows.

Use your plugin to interact with variables in Figma, including creating and reading variables. The Plugin API provides methods using the [`figma.variables`](https://developers.figma.com/docs/plugins/api/figma-variables/) global object to interact with variables.

This guide contains the following sections:

- [Get variable collections and variables](#get-variables)
- [Create variable collections and variables](#create-variables)
- [Nodes and bound variables](#bound-variables)
- [Typography variables](#typography-variables)
- [Extended variable collections](#extended-variable-collections)
- [Helpers](#helpers)
- [Samples](#samples)

note

This guide assumes that you’re familiar with the basics of creating Figma plugins. If you’re new to developing plugins, check out the [Build your first plugin](https://help.figma.com/hc/en-us/articles/4407260620823--BYFP-1-Overview) course — you can copy and paste the code from this guide into the plugin you build.

------------------------------------------------------------------------

## Get variable collections and variables

Use one of the following methods to let your plugin get variables and variable collections.

### [getLocalVariableCollectionsAsync](https://developers.figma.com/docs/plugins/api/figma-variables/#getlocalvariablecollectionsasync)

The `figma.variables.getLocalVariableCollectionsAsync` method returns all local variable collections in the current file.

Example usage:

``` ts
const localCollections = await figma.variables.getLocalVariableCollectionsAsync();
```

### [getVariableCollectionByIdAsync](https://developers.figma.com/docs/plugins/api/properties/figma-variables-getvariablecollectionbyidasync/)

The `figma.variables.getVariableCollectionByIdAsync` method finds a variable collection by ID. If not found or the provided ID is invalid, returns `null`.

Example usage:

``` ts
const collection = await figma.variables.getVariableCollectionByIdAsync('VariableCollectionId:257c3beb2/57:13');
```

### [getLocalVariablesAsync](https://developers.figma.com/docs/plugins/api/properties/figma-variables-getlocalvariablesasync/)

The `figma.variables.getLocalVariablesAsync` method returns all local variables in the current file, optionally filtering by resolved type.

Example usage:

``` ts
const localVariables = await figma.variables.getLocalVariablesAsync('STRING'); // filters local variables by the 'STRING' type
```

### [getVariableByIdAsync](https://developers.figma.com/docs/plugins/api/properties/figma-variables-getvariablebyidasync/)

The `figma.variables.getVariableByIdAsync` method finds a variable by ID. If not found or the provided ID is invalid, returns `null`.

Example usage:

``` ts
const variable = await figma.variables.getVariableByIdAsync(variableId);
```

------------------------------------------------------------------------

## Create variable collections and variables

Use one of the following methods to create variables or variable collections.

### [createVariableCollection](https://developers.figma.com/docs/plugins/api/properties/figma-variables-createvariablecollection/)

To create a variable collection, use the `figma.variables.createVariableCollection` method.

Example usage:

``` ts
const collection = figma.variables.createVariableCollection('Example Collection');
```

### [createVariable](https://developers.figma.com/docs/plugins/api/properties/figma-variables-createvariable/)

To create a variable, use the `figma.variables.createVariable` method.

Example usage:

``` ts
const variable = figma.variables.createVariable(
  'ExampleVariableName',
  collection,
  'STRING'
);
```

This example creates a variable with the name `ExampleVariableName` of the `STRING` type. The variable is created inside a collection with the ID `57:13`.

------------------------------------------------------------------------

## Nodes and bound variables

For a variable to apply its value to a node, the variable must be bound to the node. In the context of the Figma user interface, when a variable is applied to a node (for example, if you set a color variable for a stroke on a rectangle), the alias for that variable is captured in the `boundVariables` property of the node.

You can also use the Plugin API to bind variables to nodes with our [helper methods](#helpers), and the `setBoundVariable` method that is available for many types of nodes. For a list of the supported nodes, see [`setBoundVariable`](https://developers.figma.com/docs/plugins/api/properties/nodes-setboundvariable/).

To use `setBoundVariable`, you must provide a [valid bindable field](https://developers.figma.com/docs/plugins/api/node-properties/#boundvariables) and the variable that you want to bind to the field. The variable that you're binding must match the data type of the field. For example, the `SHAPE_WITH_TEXT` node has an `opacity` property that accepts numbers. In this case, the variable you bind to `opacity` must be a number variable.

The following example creates a variable collection and variable, and then applies that variable to an example node.

setBoundVariable example

``` js
const collection = figma.variables.createVariableCollection("example-collection")
const widthVariable = figma.variables.createVariable("width-variable", collection, "FLOAT")

const exampleNode = await figma.getNodeByIdAsync("1:4")

// Simple fields can be bound using setBoundVariable
exampleNode.setBoundVariable("width", widthVariable)
```

To get the aliases for variables that are bound to a node, use the `boundVariables` property on nodes.

Get bound variables example

``` js
const exampleNode = await figma.getNodeByIdAsync("1:4")

const exampleNodeVariables = exampleNode.boundVariables

/* Example boundVariables object:
  {
    "strokes": [
      {
        "type": "VARIABLE_ALIAS",
        "id": "VariableID:1:7"
      }
    ]
  }
*/
```

To unbind or remove a variable from a node, set the bound field to `null`.

Unbind a variable example

``` js
const exampleNode = await figma.getNodeByIdAsync("1:4")

// Simple fields can be unbound using setBoundVariable and null
exampleNode.setBoundVariable("width", null)
```

To learn more about binding variables, check out the [code samples](#samples).

------------------------------------------------------------------------

## Typography variables

Typography variables are used to control complex type across your Figma files and design systems. You can use typography variables to manage everything from typeface to the spacing between characters and paragraphs.

Variables can be used to control text styling for `TextNodes`, `TextSublayers` (substrings of styled text), and `TextStyles`. Paragraph spacing and indentation cannot be applied to `TextSublayers`.

The following properties are bindable:

- **`fontFamily`**: Accepts string variables. The value for the variable must correspond to a font name, such as `Inter`.
- **`fontStyle`**: Accepts string variables. The value for the variable must map to a valid style for the font. The specific style values depend on the font you are using. For example, when `fontFamily` is `Inter`, `fontStyle` can be set to values such as `Light`, `Regular`, or `Semi Bold`, among other styles supported by the font.
- **`fontWeight`**: Accepts number variables. If the number value doesn't correspond to a valid weight for the font, the closest valid weight is used.
- **`lineHeight`**: Accepts number variables.
- **`letterSpacing`**: Accepts number variables.
- **`paragraphSpacing`**: Accepts number variables. Not valid for substrings.
- **`paragraphIndent`**: Accepts number variables. Not valid for substrings.

**Apply typography variables**

To apply typography variables to a `TextNode`, use the `setBoundVariable` method as you would with [other variables](#bound-variables).

TextNode.setBoundVariable example

``` js
const collection = figma.variables.createVariableCollection("example-collection")
const weightVariable = figma.variables.createVariable("weight-variable", collection, "FLOAT")

const exampleTextNode = await figma.getNodeByIdAsync("1:4")

// Typography variables can be bound using setBoundVariable
exampleTextNode.setBoundVariable("fontWeight", weightVariable)
```

To apply typography variables to a substring, use the `setRangeBoundVariable` method that is available for `TextNodes`.

TextNode.setRangeBoundVariable example

``` js
const collection = figma.variables.createVariableCollection("example-collection")
const weightVariable = figma.variables.createVariable("weight-variable", collection, "FLOAT")

const exampleTextNode = await figma.getNodeByIdAsync("1:4")

// Typography variables can be bound to ranges of text with setRangeBoundVariable
exampleTextNode.setRangeBoundVariable(0, 5, "fontWeight", weightVariable)
```

To apply typography variables to a `TextStyle`, use the `setBoundVariable` method, similar to how you bind typography variables to `TextNodes`.

TextStyle.setBoundVariable example

``` js
const collection = figma.variables.createVariableCollection("example-collection")
const weightVariable = figma.variables.createVariable("weight-variable", collection, "FLOAT")

// Uses the first available local style as an example
const localTextStyles = await figma.getLocalTextStylesAsync()
const exampleTextStyle = localTextStyles[0]

// Typography variables can be bound using setBoundVariable
exampleTextStyle.setBoundVariable("fontWeight", weightVariable)
```

**Get typography variables**

To get the aliases for typography variables that are bound to a `TextNode`, use the `boundVariables` property of the `TextNode`.

Get bound typography variables example

``` js
const exampleTextNode = await figma.getNodeByIdAsync("1:4")

const exampleTextNodeVariables = exampleTextNode.boundVariables
```

To get the typography variables for segments of text, use the `TextNode.getStyledTextSegments` method with `boundVariables`.

TextNode.getStyledTextSegments example

``` js
const exampleTextNode = await figma.getNodeByIdAsync("1:4")

exampleTextNode.getStyledTextSegments(['boundVariables'])

/* Example output
[
  {
    characters: "hello",
    start: 0,
    end: 5,
    boundVariables: {
      fontFamily: { type: "VARIABLE_ALIAS", id: "VariableID:1:7" }
    }
  },
  {
    characters: " world",
    start: 5,
    end: 11,
    boundVariables: {
      fontFamily: { type: "VARIABLE_ALIAS", id: "VariableID:2:8" }
    }
  }
]
*/
```

You can also use the `TextNode.getRangeBoundVariable` method to get a specific bound variable based on the character range and field (`fontWeight`, for example).

TextNode.getRangeBoundVariable example

``` js
const exampleTextNode = await figma.getNodeByIdAsync("1:4")

// Get typography variables that are bound to ranges of text with getRangeBoundVariable
exampleTextNode.getRangeBoundVariable(0, 5, "fontWeight")
```

To get typography variables that are bound to `TextStyles`, use the `boundVariables` property of the `TextStyle`, similar to `TextNodes`.

Get bound typography variables for TextStyle example

``` js
// Uses the first available local style as an example
const localTextStyles = await figma.getLocalTextStylesAsync()
const exampleTextStyle = localTextStyles[0]

const exampleTextStyleVariables = exampleTextStyle.boundVariables
```

**Remove typography variables**

To unbind or remove a typography variable, set the bound field to `null`.

Unbind a typography variable example

``` js
const exampleTextNode = await figma.getNodeByIdAsync("1:4")

// Simple fields can be unbound using setBoundVariable and null
exampleTextNode.setBoundVariable("fontWeight", null)
```

To learn more about binding typography variables, check out the [code samples](#samples).

------------------------------------------------------------------------

## Extended variable collections

info

This feature is limited to the Enterprise plan.

Extended variables collections enable theming for variables. Extended collections inherit the modes and variables from their parent collection. In an extended collection, a variable mode value can be overridden from its default value to give it a theme-specific value.

To create an extended variable collection, use the `extend` method on a local variable collection or use the `extendLibraryCollectionByKeyAsync` method for extending library variable collections.

Extend a variable collection example

``` js
// extend a local variable collection
const localCollection = figma.variables.createVariableCollection("example-collection")
const extendedCollection = localCollection.extend("extended-collection-1")

// extend a library variable collection
const libraryCollection = await figma.variables.getVariableCollectionByIdAsync("VariableCollectionId:1:3")
const extendedCollection = await figma.variables.extendLibraryCollectionByKeyAsync(libraryCollection.key, "extended-collection-2")
```

Modes on an extended collection have unique IDs that are encoded with the collection's ID. These modes map to their parent mode via the `parentModeId` property. The default values for variables in an extended collection can be overridden with theme-specific values. Use the `setValueForMode` method with the `modeId` from the extended collection to override a variable value in an extended collection. Note: The variable itself only exists in the parent collection and is not duplicated in the extended collection.

Override a variable value in an extended collection example

``` js
const modeId = extendedCollection.modes[0].modeId // example: "VariableCollectionId:1:3/0:1"
const variable = await figma.variables.getVariableByIdAsync(extendedCollection.variableIds[0])
variable.setValueForMode(modeId, {r: 1, g: 0, b: 0})
```

Since variables are not duplicated in extended collections, `variable.valuesByMode` will still only return the values from the parent collection (the default values). To see the inherited and overridden variable values in an extended collection use the `variable.valuesByModeForCollectionAsync` method. To see all overridden values for all variables inherited by an extended collection use the `variableOverrides` property on the extended collection.

Get the variable values in an extended collection example

``` js
const values = await variable.valuesByModeForCollectionAsync(extendedCollection)
console.log(values)
// Example output:
// {"VariableCollectionId:1:3/0:1": { r: 1, g: 0, b: 0, a: 1 } }

const overrides = extendedCollection.variableOverrides
console.log(overrides)
// Example output:
// { "VariableID:1:4": { "VariableCollectionId:1:3/0:1": { r: 1, g: 0, b: 0, a: 1 } } }
```

To remove an overridden variable value and revert the mode value to its inherited value, use the `removeOverrideForMode` method on the extended collection. To remove all overridden values for a variable, use the `removeOverridesForVariable` method on the extended collection.

Remove an overridden variable value example

``` js
variable.removeOverrideForMode(extendedCollection.modes[0].modeId)
extendedCollection.removeOverridesForVariable(variable.id)
```

------------------------------------------------------------------------

## Helpers

The `figma.variables` global object also provides some helper methods to make certain operations easier.

### [createVariableAlias](https://developers.figma.com/docs/plugins/api/figma-variables/#createvariablealias)

The `figma.variables.createVariableAlias` method is a helper function to create a variable alias. Variable aliases are used to bind variables to other variables, or to bind variables to various properties on a node or style.

### [createVariableAliasByIdAsync(variableId)](https://developers.figma.com/docs/plugins/api/figma-variables/#createvariablealiasbyidasync)

The `figma.variables.createVariableAliasByIdAsync(variableId)` method is a helper function that accepts a variable ID and returns an alias that references that variable.

### [setBoundVariableForPaint](https://developers.figma.com/docs/plugins/api/figma-variables/#setboundvariableforpaint)

The `figma.variables.setBoundVariableForPaint` method is a helper function to bind a variable to a SolidPaint.

### [setBoundVariableForEffect](https://developers.figma.com/docs/plugins/api/figma-variables/#setboundvariableforeffect)

The `figma.variables.setBoundVariableForEffect` method is a helper function to bind a variable to an Effect.

### [setBoundVariableForLayoutGrid](https://developers.figma.com/docs/plugins/api/figma-variables/#setboundvariableforlayoutgrid)

The `figma.variables.setBoundVariableForLayoutGrid` method is a helper function to bind a variable to a LayoutGrid.

### [importVariableByKeyAsync](https://developers.figma.com/docs/plugins/api/figma-variables/#importvariablebykeyasync)

The `figma.variables.importVariableByKeyAsync` method loads a variable from the team library.

------------------------------------------------------------------------

## Samples

This section contains some functional plugin samples that use variables.

### Example: Authoring a new variable collection

This example creates a new variable collection with two modes, and a color variable that defines a value for each of those two modes.

authoring.js

``` js
const collection = figma.variables.createVariableCollection("new-collection")
collection.renameMode(collection.modes[0].modeId, "light")
const colorVariable = figma.variables.createVariable("color-variable", collection, "COLOR")

// rename our new variable and collection because naming is hard!
colorVariable.name = "text-primary"
collection.name = "semantic colors"

const lightModeId = collection.modes[0].modeId
const darkModeId = collection.addMode("dark")

// Sets the color to #000 in light mode and #fff in dark mode
colorVariable.setValueForMode(lightModeId, {r: 0, g: 0, b: 0})
colorVariable.setValueForMode(darkModeId, {r: 1, g: 1, b: 1})
```

### Example: Determining if a node is bound to a variable

Variables consumed by a given node are enumerated in the `boundVariables` map.

detect-if-bound.js

``` js
const rectangle = await figma.getNodeByIdAsync(rectangleId)
// rectangle.width is a number
if (rectangle.boundVariables['width'] !== undefined) {
  // Width fields can only have one bound variable, but fills and strokes might have multiple.
  const widthVariableId = rectangle.boundVariables['width'].id
  const widthVariable = await figma.variables.getVariableByIdAsync(widthVariableId)

  // At this point we know that `widthVariable` is bound to the `width` property of `rectangle`.
  assert(widthVariable.resolveForConsumer(rectangle).value === rectangle.width)
}
```

### Example: Binding a variable to a node or style

Whether binding to a node or style, the procedure is roughly the same.

binding.js

``` js
const collection = figma.variables.createVariableCollection("new-collection")
const widthVariable = figma.variables.createVariable("width-variable", collection, "FLOAT")
const colorVariable = figma.variables.createVariable("color-variable", collection, "COLOR")

const node = await figma.getNodeByIdAsync(...)

// Simple fields can be bound via setBoundVariable
node.setBoundVariable('width', widthVariable)
const fillsCopy = clone(node.fills)

// Fills and strokes must be set via their immutable arrays
fillsCopy[0] = figma.variables.setBoundVariableForPaint(fillsCopy[0], 'color', colorVariable)
node.fills = fillsCopy

const style = await figma.getStyleByIdAsync(...)
const paintsCopy = clone(style.paints)
paintsCopy[0] = figma.variables.setBoundVariableForPaint(paintsCopy[0], 'color', colorVariable)
style.paints = paintsCopy

// Effects and LayoutGrids must also be set by their immutable arrays
const radiusVariable = figma.variables.createVariable("radius-variable", collection, "FLOAT")
const effectsCopy = clone(node.effects)
effectsCopy[0] = figma.variables.setBoundVariableForEffect(effectsCopy[0], 'radius', radiusVariable)
node.effects = effectsCopy

const countVar = figma.variables.createVariable("count-variable", collection, "FLOAT")
const layoutGridsCopy = clone(node.layoutGrids)
layoutGridsCopy[0] = figma.variables.setBoundVariableForLayoutGrid(layoutGridsCopy[0], 'count', countVar)
node.layoutGrids = layoutGridsCopy
```

### Example: Binding a variable to a variant property

This sample binds a string variable to the variant property on a [`InstanceNode`](https://developers.figma.com/docs/plugins/api/InstanceNode/)

code.js

``` js
const instanceNode = await figma.getNodeByIdAsync(...);
const stringVariable = await figma.variables.getVariableByIdAsync(...);
node.setProperties({
  "variantPropName":
    figma.variables.createVariableAlias(stringVariable)
})

// To clear
node.setProperties({
  "variantPropName": "Default", // or other string value
})
```

### Example: Binding a variable to a text node

This sample binds a font family variable to text node.

code.js

``` js
(async () => {
  // Setup variables
  const collection = figma.variables.createVariableCollection("new-collection")
  const modeId = collection.modes[0].modeId
  const fontFamilyVar = figma.variables.createVariable("fontFamily", collection, "STRING")
  fontFamilyVar.setValueForMode(modeId, "Roboto")

  // Load necessary fonts
  await figma.loadFontAsync({ family: "Inter", style: "Regular" })  // current font
  await figma.loadFontAsync({ family: "Roboto", style: "Regular" }) // new font

  // Create text node
  const text = figma.createText()
  text.characters = "Hello world!"

  // Apply variables
  text.setBoundVariable("fontFamily", fontFamilyVar)
})()
```

### Example: Binding a variable to a text style

This sample binds a font family variable to a text style.

code.js

``` js
(async () => {
  // Setup variables
  const collection = figma.variables.createVariableCollection("new-collection")
  const modeId = collection.modes[0].modeId
  const fontFamilyVar = figma.variables.createVariable("fontFamily", collection, "STRING")
  fontFamilyVar.setValueForMode(modeId, "Roboto")

  // Load necessary fonts
  await figma.loadFontAsync({ family: "Inter", style: "Regular" })  // current font
  await figma.loadFontAsync({ family: "Roboto", style: "Regular" }) // new font

  // Create style
  const textStyle = figma.createTextStyle()

  // Create text node
  const text = figma.createText()
  text.characters = "Hello world!"
  text.setTextStyleIdAsync(textStyle.id)

  // Apply variables
  textStyle.setBoundVariable("fontFamily", fontFamilyVar)

  console.log(textStyle.boundVariables)
  // Output:
  // {
  //   fontFamily: [{
  //     type: "VARIABLE_ALIAS",
  //     variableId: fontFamilyVar.id
  //   }]
  // }
})()
```

### Example: Binding a variable to a text substring

This example binds font family and font style variables to a substring of text.

code.js

``` js
(async () => {
  // Setup variables
  const collection = figma.variables.createVariableCollection("new-collection")
  const modeId = collection.modes[0].modeId
  const fontStyleVar = figma.variables.createVariable("fontFamily", collection, "STRING")
  fontStyleVar.setValueForMode(modeId, "Bold")

  // Load necessary fonts
  await figma.loadFontAsync({ family: "Inter", style: "Regular" }) // current font
  await figma.loadFontAsync({ family: "Inter", style: "Bold" })    // new font

  // Create text node
  const text = figma.createText()
  text.characters = "Hello world!"

  // Apply variables
  text.setRangeBoundVariable(0, 5, "fontStyle", fontStyleVar)

  console.log(text.getRangeBoundVariable(0, 5, "fontStyle"))
  // Output:
  // {
  //   type: "VARIABLE_ALIAS",
  //   variableId: fontStyleVar.id
  // }

  console.log(text.getRangeBoundVariable(0, 6, "fontStyle"))
  // Output:
  // Symbol(figma.mixed)

  console.log(text.getStyledTextSegments(["boundVariables", "fontName"]))
  // Output:
  // [
  //   {
  //     characters: "Hello",
  //     start: 0,
  //     end: 5,
  //     fontName: { family: "Inter", style: "Bold" },
  //     boundVariables: {
  //       fontStyle: { type: "Variable_ALIAS", variableId: fontStyleVar.id }
  //     }
  //   },
  //   {
  //     characters: " world!",
  //     start: 5,
  //     end: 12,
  //     fontName: { family: "Inter", style: "Regular" },
  //     boundVariables: {}
  //   }
  // ]
})()
```

### Example: Extracting variables from fill styles

Sample code to convert existing styles into variables is available on our [GitHub](https://github.com/figma/plugin-samples/tree/master/styles-to-variables).

### Example: Import and export variables

Sample code to help import design tokens from other products or export variables into JSON format. This can further help with migration to variables or syncing design with development. Note that this sample only handles basic import/export and developers are encouraged to extend and customize this code to suit their specific needs.

[Sample code on our GitHub](https://github.com/figma/plugin-samples/tree/master/variables-import-export)
