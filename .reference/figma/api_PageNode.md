# Source: https://developers.figma.com/docs/plugins/api/PageNode/

<!-- Vendored snapshot of the Figma Plugin API docs. Captured 2026-08-04. -->

*Captured 2026-08-04.*

> `PageNode.loadAsync()` is the real API for loading a page under
> `"documentAccess": "dynamic-page"`. There is **no** `figma.loadPageAsync()`.
> The document-wide loader is `figma.loadAllPagesAsync()` — see
> `migrating_to_dynamic_loading_section.md`.

---
# PageNode

The page node is always a descendent of the [`DocumentNode`](https://developers.figma.com/docs/plugins/api/DocumentNode/). Most plugins only need to access the current page accessed via [`figma.currentPage`](https://developers.figma.com/docs/plugins/api/figma/#currentpage).

## Page properties

### type: 'PAGE' \[readonly\]

The type of this node, represented by the string literal "PAGE"

------------------------------------------------------------------------

### clone(): [PageNode](https://developers.figma.com/docs/plugins/api/PageNode/)

Create a clone of this page, parented under [`figma.root`](https://developers.figma.com/docs/plugins/api/figma/#root). Prototyping connections will be copied such that they point to their equivalent in the cloned page. Components will be cloned as instances who master is the original component.

------------------------------------------------------------------------

### [guides](https://developers.figma.com/docs/plugins/api/properties/PageNode-guides/): ReadonlyArray\<[Guide](https://developers.figma.com/docs/plugins/api/Guide/)\>

The guides on this page.

[View more →](https://developers.figma.com/docs/plugins/api/properties/PageNode-guides/)

------------------------------------------------------------------------

### [selection](https://developers.figma.com/docs/plugins/api/properties/PageNode-selection/): ReadonlyArray\<[SceneNode](https://developers.figma.com/docs/plugins/api/nodes/#scenenode)\>

The selected nodes on this page. Each page stores its own selection separately. The ordering of nodes in the selection is **unspecified**, you should not be relying on it.

[View more →](https://developers.figma.com/docs/plugins/api/properties/PageNode-selection/)

------------------------------------------------------------------------

### [selectedTextRange](https://developers.figma.com/docs/plugins/api/properties/PageNode-selectedtextrange/): { node: [TextNode](https://developers.figma.com/docs/plugins/api/TextNode/); start: number; end: number } \| null

The current text node being edited, if any, and the text currently being selected within that text node.

[View more →](https://developers.figma.com/docs/plugins/api/properties/PageNode-selectedtextrange/)

------------------------------------------------------------------------

### [flowStartingPoints](https://developers.figma.com/docs/plugins/api/properties/PageNode-flowstartingpoints/): ReadonlyArray\<{ nodeId: string; name: string }\>

The sorted list of flow starting points used when accessing Presentation view.

[View more →](https://developers.figma.com/docs/plugins/api/properties/PageNode-flowstartingpoints/)

------------------------------------------------------------------------

### backgrounds: ReadonlyArray\<[Paint](https://developers.figma.com/docs/plugins/api/Paint/)\>

The background color of the canvas (currently only supports a single solid color paint).

------------------------------------------------------------------------

### prototypeBackgrounds: ReadonlyArray\<[Paint](https://developers.figma.com/docs/plugins/api/Paint/)\>

The background color of the prototype (currently only supports a single solid color paint).

------------------------------------------------------------------------

### prototypeStartNode: [FrameNode](https://developers.figma.com/docs/plugins/api/FrameNode/) \| [GroupNode](https://developers.figma.com/docs/plugins/api/GroupNode/) \| [ComponentNode](https://developers.figma.com/docs/plugins/api/ComponentNode/) \| [InstanceNode](https://developers.figma.com/docs/plugins/api/InstanceNode/) \| null \[readonly\]

The starting point when launching a prototype. Prototypes with a starting node contain all frames reachable from that node. Prototypes without a starting node contain all frames on the current page. Note that prototypes are per-page.

------------------------------------------------------------------------

### isPageDivider: boolean \[readonly\]

Returns true if the node is a page divider, which is only possible when the page node is empty and has a page divider name. A page divider name consists of all asterisks, all en dashes, all em dashes, or all spaces. To create a page divider, use [`figma.createPageDivider`](https://developers.figma.com/docs/plugins/api/properties/figma-createpagedivider/) or rename an empty page to a page divider name.

------------------------------------------------------------------------

### loadAsync(): Promise\<void\>

Loads the contents of the page node.

------------------------------------------------------------------------

### [on](https://developers.figma.com/docs/plugins/api/properties/PageNode-on/)(type: 'nodechange', callback: (event: [NodeChangeEvent](https://developers.figma.com/docs/plugins/api/NodeChangeEvent/)) =\> void): void

Registers a callback that will be invoked when an event occurs on the page. Current supported events are:

- `"nodechange"`: Emitted when a node is added, removed, or updated.

[View more →](https://developers.figma.com/docs/plugins/api/properties/PageNode-on/)

------------------------------------------------------------------------

### once(type: 'nodechange', callback: (event: [NodeChangeEvent](https://developers.figma.com/docs/plugins/api/NodeChangeEvent/)) =\> void): void

Same as [`on`](https://developers.figma.com/docs/plugins/api/properties/PageNode-on/), but the callback will only be called once, the first time the specified event happens.

------------------------------------------------------------------------

### [off](https://developers.figma.com/docs/plugins/api/properties/PageNode-off/)(type: 'nodechange', callback: (event: [NodeChangeEvent](https://developers.figma.com/docs/plugins/api/NodeChangeEvent/)) =\> void): void

Removes a callback added with [`on`](https://developers.figma.com/docs/plugins/api/properties/PageNode-on/) or [`once`](https://developers.figma.com/docs/plugins/api/PageNode/#once).

[View more →](https://developers.figma.com/docs/plugins/api/properties/PageNode-off/)

------------------------------------------------------------------------

### [focusedSlide](https://developers.figma.com/docs/plugins/api/properties/PageNode-focusedslide/)?: [SlideNode](https://developers.figma.com/docs/plugins/api/SlideNode/) \| null

info

This API is only available in Figma Slides

When in single slide view, the Slide that is currently focused is accessible via this property.

[View more →](https://developers.figma.com/docs/plugins/api/properties/PageNode-focusedslide/)

------------------------------------------------------------------------

### [focusedNode](https://developers.figma.com/docs/plugins/api/properties/PageNode-focusednode/): [SceneNode](https://developers.figma.com/docs/plugins/api/nodes/#scenenode) \| null

info

This API is only available in Figma Slides, Figma Buzz, and Dev Mode.

For Figma Slides and Figma Buzz: When in Asset View, this is the focused slide or asset.

For Dev Mode: This is the node currently focused in Dev Mode focus view. This property is read-only in Dev Mode.

[View more →](https://developers.figma.com/docs/plugins/api/properties/PageNode-focusednode/)

------------------------------------------------------------------------

## Measurement properties

### getMeasurements(): [Measurement](https://developers.figma.com/docs/plugins/api/Measurement/)\[\]

Get all measurements in the current page.

Learn more about measurements in the [Help Center](https://help.figma.com/hc/en-us/articles/20774752502935).

------------------------------------------------------------------------

### getMeasurementsForNode(node: [SceneNode](https://developers.figma.com/docs/plugins/api/nodes/#scenenode)): [Measurement](https://developers.figma.com/docs/plugins/api/Measurement/)\[\]

Get all measurements pointing to a node in the current page. This includes all measurements whose start *or* end node is the node passed in.

------------------------------------------------------------------------

### addMeasurement(start: { node: [SceneNode](https://developers.figma.com/docs/plugins/api/nodes/#scenenode); side: [MeasurementSide](https://developers.figma.com/docs/plugins/api/MeasurementSide/) }, end: { node: [SceneNode](https://developers.figma.com/docs/plugins/api/nodes/#scenenode); side: [MeasurementSide](https://developers.figma.com/docs/plugins/api/MeasurementSide/) }, options?: { offset?: [MeasurementOffset](https://developers.figma.com/docs/plugins/api/MeasurementOffset/); freeText?: string }): [Measurement](https://developers.figma.com/docs/plugins/api/Measurement/)

Adds a measurement between two nodes in the current page.

Measurements are always between a start and end node. The side indicates which edge of the node to draw the measurement from.

Measurements can only go on the same axis, i.e. from side `"LEFT"` -\> `"LEFT"`, `"LEFT"` -\> `"RIGHT"`, `"TOP"` -\> `"BOTTOM"` etc. But not `"LEFT"` -\> `"TOP"`.

See the [Measurement type](https://developers.figma.com/docs/plugins/api/Measurement/) for usage examples.

info

This method is only available in Dev Mode. You can check the editor type of your plugin to know if the user is in Dev Mode or not:

``` ts
if (figma.editorType === 'dev') {
  // In Figma's Dev Mode
}
```

------------------------------------------------------------------------

### editMeasurement(id: string, newValue: { offset?: [MeasurementOffset](https://developers.figma.com/docs/plugins/api/MeasurementOffset/); freeText?: string }): [Measurement](https://developers.figma.com/docs/plugins/api/Measurement/)

Edit a measurement’s offset.

See the [Measurement type](https://developers.figma.com/docs/plugins/api/Measurement/) for usage examples.

info

This method is only available in Dev Mode. You can check the editor type of your plugin to know if the user is in Dev Mode or not:

``` ts
if (figma.editorType === 'dev') {
  // In Figma's Dev Mode
}
```

------------------------------------------------------------------------

### deleteMeasurement(id: string): void

Delete a measurement.

See the [Measurement type](https://developers.figma.com/docs/plugins/api/Measurement/) for usage examples.

info

This method is only available in Dev Mode. You can check the editor type of your plugin to know if the user is in Dev Mode or not:

``` ts
if (figma.editorType === 'dev') {
  // In Figma's Dev Mode
}
```

------------------------------------------------------------------------

## Base node properties

### [id](https://developers.figma.com/docs/plugins/api/properties/nodes-id/): string \[readonly\]

The unique identifier of a node. For example, `1:3`. The node id can be used with methods such as [`figma.getNodeByIdAsync`](https://developers.figma.com/docs/plugins/api/figma/#getnodebyidasync), but plugins typically don't need to use this since you can usually just access a node directly.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-id/)

------------------------------------------------------------------------

### [parent](https://developers.figma.com/docs/plugins/api/properties/nodes-parent/): ([BaseNode](https://developers.figma.com/docs/plugins/api/nodes/#basenode) & [ChildrenMixin](https://developers.figma.com/docs/plugins/api/node-properties/)) \| null \[readonly\]

Returns the parent of this node, if any. This property is not meant to be directly edited. To reparent, see [`appendChild`](https://developers.figma.com/docs/plugins/api/properties/nodes-appendchild/).

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-parent/)

------------------------------------------------------------------------

### [name](https://developers.figma.com/docs/plugins/api/properties/nodes-name/): string

The name of the layer that appears in the layers panel. Calling `figma.root.name` will return the name, read-only, of the current file.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-name/)

------------------------------------------------------------------------

### [removed](https://developers.figma.com/docs/plugins/api/properties/nodes-removed/): boolean \[readonly\]

Returns true if this node has been removed since it was first accessed. If your plugin stays open for a while and stores references to nodes, you should write your code defensively and check that the nodes haven't been removed by the user.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-removed/)

------------------------------------------------------------------------

### [toString](https://developers.figma.com/docs/plugins/api/properties/nodes-tostring/)(): string

Returns a string representation of the node. For debugging purposes only, do not rely on the exact output of this string in production code.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-tostring/)

------------------------------------------------------------------------

### [remove](https://developers.figma.com/docs/plugins/api/properties/nodes-remove/)(): void

Removes this node and **all of its children** from the document.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-remove/)

------------------------------------------------------------------------

### [setRelaunchData](https://developers.figma.com/docs/plugins/api/properties/nodes-setrelaunchdata/)(data: { \[command: string\]: string }): void

Sets state on the node to show a button and description when the node is selected. Clears the button and description when `relaunchData` is `{}`.

info

In Figma and Dev Mode, this shows up in the properties panel. In FigJam, this shows up in the property menu. See [here](https://developers.figma.com/docs/plugins/api/properties/nodes-setrelaunchdata/#example-figma-design-ui) for examples.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-setrelaunchdata/)

------------------------------------------------------------------------

### getRelaunchData(): { \[command: string\]: string }

Retrieves the relaunch data stored on this node using [`setRelaunchData`](https://developers.figma.com/docs/plugins/api/properties/nodes-setrelaunchdata/)

------------------------------------------------------------------------

### isAsset: boolean \[readonly\]

Returns true if Figma detects that a node is an asset, otherwise returns false. An asset is is either an icon or a raster image.

This property is useful if you're building a [plugin for code generation](https://developers.figma.com/docs/plugins/codegen-plugins/).

info

This property uses a set of heuristics to determine if a node is an asset. At a high level an icon is a small vector graphic and an image is a node with an image fill.

------------------------------------------------------------------------

### getCSSAsync(): Promise\<{ \[key: string\]: string }\>

Resolves to a JSON object of CSS properties of the node. This is the same CSS that Figma shows in the inspect panel and is helpful if you are building a [plugin for code generation](https://developers.figma.com/docs/plugins/codegen-plugins/).

------------------------------------------------------------------------

### getTopLevelFrame(): [FrameNode](https://developers.figma.com/docs/plugins/api/FrameNode/) \| undefined

Returns the top-most frame that contains this node. If the node is not inside a frame, this will return undefined.

info

This function will only work in Figma Design and will throw an error if called in FigJam or Slides.

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

## Dev resource properties

### getDevResourcesAsync(options?: { includeChildren?: boolean }): Promise\<[DevResourceWithNodeId](https://developers.figma.com/docs/plugins/api/DevResource/)\[\]\>

Gets all of the dev resources on a node. This includes any inherited dev resources from components and component sets.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-getdevresourcesasync/)

------------------------------------------------------------------------

### addDevResourceAsync(url: string, name?: string): Promise\<void\>

Adds a dev resource to a node. This will fail if the node already has a dev resource with the same url.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-adddevresourceasync/)

------------------------------------------------------------------------

### editDevResourceAsync(currentUrl: string, newValue: { name?: string; url?: string }): Promise\<void\>

Edits a dev resource on a node. This will fail if the node does not have a dev resource with the same url.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-editdevresourceasync/)

------------------------------------------------------------------------

### deleteDevResourceAsync(url: string): Promise\<void\>

Deletes a dev resource on a node. This will fail if the node does not have a dev resource with the same url.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-deletedevresourceasync/)

------------------------------------------------------------------------

### setDevResourcePreviewAsync(url: string, preview: PlainTextElement): Promise\<void\>

caution

This is a private API only available to [Figma partners](https://www.figma.com/partners/)

------------------------------------------------------------------------

## Explicit variable modes

### explicitVariableModes: { \[collectionId: string\]: string }

The explicitly set modes for this node. For `SceneNodes`, represents a subset of [`resolvedVariableModes`](https://developers.figma.com/docs/plugins/api/properties/nodes-resolvedvariablemodes/). Note that this does not include [workspace and team-default modes](https://help.figma.com/hc/en-us/articles/12611253730071).

------------------------------------------------------------------------

### clearExplicitVariableModeForCollection(collection: [VariableCollection](https://developers.figma.com/docs/plugins/api/VariableCollection/)): void

Clears an explicit mode for the given collection on this node

[View more →](https://developers.figma.com/docs/plugins/api/properties/ExplicitVariableModesMixin-clearexplicitvariablemodeforcollection/)

------------------------------------------------------------------------

### setExplicitVariableModeForCollection(collection: [VariableCollection](https://developers.figma.com/docs/plugins/api/VariableCollection/), modeId: string): void

Sets an explicit mode for the given collection on this node

[View more →](https://developers.figma.com/docs/plugins/api/properties/ExplicitVariableModesMixin-setexplicitvariablemodeforcollection/)

------------------------------------------------------------------------

## Children-related properties

### [children](https://developers.figma.com/docs/plugins/api/properties/nodes-children/): ReadonlyArray\<[SceneNode](https://developers.figma.com/docs/plugins/api/nodes/#scenenode)\> \[readonly\]

The list of children, sorted back-to-front. That is, the first child in the array is the bottommost layer on the screen, and the last child in the array is the topmost layer.

If the manifest contains `"documentAccess": "dynamic-page"`, **and** the node is a [`PageNode`](https://developers.figma.com/docs/plugins/api/PageNode/), you must first call [`loadAsync`](https://developers.figma.com/docs/plugins/api/PageNode/#loadasync) to access this property.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-children/)

------------------------------------------------------------------------

### [appendChild](https://developers.figma.com/docs/plugins/api/properties/nodes-appendchild/)(child: [SceneNode](https://developers.figma.com/docs/plugins/api/nodes/#scenenode)): void

Adds a new child to the end of the [`children`](https://developers.figma.com/docs/plugins/api/properties/nodes-children/) array. That is, visually on top of all other children.

If the manifest contains `"documentAccess": "dynamic-page"`, **and** the node is a [`PageNode`](https://developers.figma.com/docs/plugins/api/PageNode/), you must first call [`loadAsync`](https://developers.figma.com/docs/plugins/api/PageNode/#loadasync) to access this function.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-appendchild/)

------------------------------------------------------------------------

### [insertChild](https://developers.figma.com/docs/plugins/api/properties/nodes-insertchild/)(index: number, child: [SceneNode](https://developers.figma.com/docs/plugins/api/nodes/#scenenode)): void

Adds a new child at the specified index in the [`children`](https://developers.figma.com/docs/plugins/api/properties/nodes-children/) array.

If the manifest contains `"documentAccess": "dynamic-page"`, **and** the node is a [`PageNode`](https://developers.figma.com/docs/plugins/api/PageNode/), you must first call [`loadAsync`](https://developers.figma.com/docs/plugins/api/PageNode/#loadasync) to access this function.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-insertchild/)

------------------------------------------------------------------------

### [findChildren](https://developers.figma.com/docs/plugins/api/properties/nodes-findchildren/)(callback?: (node: [SceneNode](https://developers.figma.com/docs/plugins/api/nodes/#scenenode)) =\> boolean): [SceneNode](https://developers.figma.com/docs/plugins/api/nodes/#scenenode)\[\]

Searches the immediate children of this node (i.e. not including the children's children). Returns all nodes for which `callback` returns true.

If the manifest contains `"documentAccess": "dynamic-page"`, **and** the node is a [`PageNode`](https://developers.figma.com/docs/plugins/api/PageNode/), you must first call [`loadAsync`](https://developers.figma.com/docs/plugins/api/PageNode/#loadasync) to access this function.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-findchildren/)

------------------------------------------------------------------------

### [findChild](https://developers.figma.com/docs/plugins/api/properties/nodes-findchild/)(callback: (node: [SceneNode](https://developers.figma.com/docs/plugins/api/nodes/#scenenode)) =\> boolean): [SceneNode](https://developers.figma.com/docs/plugins/api/nodes/#scenenode) \| null

Searches the immediate children of this node (i.e. not including the children's children). Returns the first node for which `callback` returns true.

If the manifest contains `"documentAccess": "dynamic-page"`, **and** the node is a [`PageNode`](https://developers.figma.com/docs/plugins/api/PageNode/), you must first call [`loadAsync`](https://developers.figma.com/docs/plugins/api/PageNode/#loadasync) to access this function.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-findchild/)

------------------------------------------------------------------------

### [findAll](https://developers.figma.com/docs/plugins/api/properties/nodes-findall/)(callback?: (node: [SceneNode](https://developers.figma.com/docs/plugins/api/nodes/#scenenode)) =\> boolean): [SceneNode](https://developers.figma.com/docs/plugins/api/nodes/#scenenode)\[\]

Searches this entire subtree (this node's children, its children's children, etc). Returns all nodes for which `callback` returns true.

If the manifest contains `"documentAccess": "dynamic-page"`, **and** the node is a [`PageNode`](https://developers.figma.com/docs/plugins/api/PageNode/), you must first call [`loadAsync`](https://developers.figma.com/docs/plugins/api/PageNode/#loadasync) to access this function.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-findall/)

------------------------------------------------------------------------

### [findOne](https://developers.figma.com/docs/plugins/api/properties/nodes-findone/)(callback: (node: [SceneNode](https://developers.figma.com/docs/plugins/api/nodes/#scenenode)) =\> boolean): [SceneNode](https://developers.figma.com/docs/plugins/api/nodes/#scenenode) \| null

Searches this entire subtree (this node's children, its children's children, etc). Returns the first node for which `callback` returns true.

If the manifest contains `"documentAccess": "dynamic-page"`, **and** the node is a [`PageNode`](https://developers.figma.com/docs/plugins/api/PageNode/), you must first call [`loadAsync`](https://developers.figma.com/docs/plugins/api/PageNode/#loadasync) to access this function.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-findone/)

------------------------------------------------------------------------

### [findAllWithCriteria](https://developers.figma.com/docs/plugins/api/properties/nodes-findallwithcriteria/)\<T extends NodeType\[\]\>(criteria: [FindAllCriteria](https://developers.figma.com/docs/plugins/api/FindAllCriteria/)\<T\>): Array\<{ type: T\[number\] } & [SceneNode](https://developers.figma.com/docs/plugins/api/nodes/#scenenode)\>

Searches this entire subtree (this node's children, its children's children, etc). Returns all nodes that satisfy all of specified criteria.

If the manifest contains `"documentAccess": "dynamic-page"`, **and** the node is a [`PageNode`](https://developers.figma.com/docs/plugins/api/PageNode/), you must first call [`loadAsync`](https://developers.figma.com/docs/plugins/api/PageNode/#loadasync) to access this function.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-findallwithcriteria/)

------------------------------------------------------------------------

### [findWidgetNodesByWidgetId](https://developers.figma.com/docs/plugins/api/properties/nodes-findwidgetnodesbywidgetid/)(widgetId: string): Array\<[WidgetNode](https://developers.figma.com/docs/plugins/api/WidgetNode/)\>

Searches this entire subtree (this node's children, its children's children, etc). Returns all widget nodes that match the provided `widgetId`.

If the manifest contains `"documentAccess": "dynamic-page"`, **and** the node is a [`PageNode`](https://developers.figma.com/docs/plugins/api/PageNode/), you must first call [`loadAsync`](https://developers.figma.com/docs/plugins/api/PageNode/#loadasync) to access this function.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-findwidgetnodesbywidgetid/)

------------------------------------------------------------------------

## Export-related properties

### exportSettings: ReadonlyArray\<[ExportSettings](https://developers.figma.com/docs/plugins/api/ExportSettings/)\>

List of export settings stored on the node. For help on how to change this value, see [Editing Properties](https://developers.figma.com/docs/plugins/editing-properties/).

------------------------------------------------------------------------

### exportAsync(settings?: [ExportSettings](https://developers.figma.com/docs/plugins/api/ExportSettings/)): Promise\<Uint8Array\>

### exportAsync(settings: [ExportSettingsSVGString](https://developers.figma.com/docs/plugins/api/ExportSettings/#exportsettingssvgstring)): Promise\<string\>

### exportAsync(settings: [ExportSettingsREST](https://developers.figma.com/docs/plugins/api/ExportSettings/#exportsettingsrest)): Promise\<Object\>

### exportAsync(settings: [ExportSettingsMP4](https://developers.figma.com/docs/plugins/api/ExportSettings/#exportsettingsmp4) \| [ExportSettingsGIF](https://developers.figma.com/docs/plugins/api/ExportSettings/#exportsettingsgif) \| [ExportSettingsWEBM](https://developers.figma.com/docs/plugins/api/ExportSettings/#exportsettingswebm)): Promise\<Uint8Array\>

Exports the node in the format given by `settings`. Image formats (PNG, JPG), PDF, and the video formats (MP4, GIF, WebM) return a `Uint8Array` of the encoded file; `SVG_STRING` returns a string and `JSON_REST_V1` returns an object.

If the manifest contains `"documentAccess": "dynamic-page"`, **and** the node is a [`PageNode`](https://developers.figma.com/docs/plugins/api/PageNode/), you must first call [`loadAsync`](https://developers.figma.com/docs/plugins/api/PageNode/#loadasync) to access this function.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-exportasync/)

------------------------------------------------------------------------
