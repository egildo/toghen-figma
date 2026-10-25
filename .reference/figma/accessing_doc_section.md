# Source: https://developers.figma.com/docs/plugins/accessing-document/

<!-- Vendored snapshot of the Figma Plugin API docs. Captured 2026-08-04. -->

**Sources in this file** (captured 2026-08-04):

- <https://developers.figma.com/docs/plugins/accessing-document/>
- <https://developers.figma.com/docs/plugins/api/PageNode/>
- <https://developers.figma.com/docs/plugins/api/figma/>

> **Extended beyond the source guide.** The guide page itself never names the loading APIs, which
> is how a nonexistent `figma.loadPageAsync()` got invented. The real APIs are appended below,
> verbatim from the reference:
>
> - `PageNode.loadAsync(): Promise<void>` — load one page's contents.
> - `figma.loadAllPagesAsync(): Promise<void>` — load every page in the document.
> - `figma.setCurrentPageAsync(page: PageNode): Promise<void>` — the async replacement for
>   assigning to `figma.currentPage`.
>
> **`figma.loadPageAsync()` does not exist.**

---
# Accessing the Document

This section provides a brief overview of how your plugin accesses the document of a Figma, FigJam, Figma Slides, or Figma Buzz file and some of the APIs you are most likely to use. Check out the [reference](https://developers.figma.com/docs/plugins/api/api-reference/) to see the full extent of the Figma Plugin API.

## Figma files and nodes

Figma, FigJam, Figma Slides, and Figma Buzz files are structured as node trees. Your plugin can traverse nodes in the tree in order to access different parts of the document.

**DocumentNode** The [DocumentNode](https://developers.figma.com/docs/plugins/api/DocumentNode/) is the root of the node tree in Figma, FigJam, Figma Slides, and Figma Buzz files. Each Figma file contains a single instance of a DocumentNode. A DocumentNode contains one or more PageNodes.

**PageNode** [PageNodes](https://developers.figma.com/docs/plugins/api/PageNode/) are the immediate descendants of the DocumentNode. A Figma design or FigJam file contains one or more PageNodes (one for each page in the document). Figma Slides and Figma Buzz files only have a single PageNode, accessed using `figma.currentPage`.

PageNodes are, from the user’s perspective, the fundamental way to interact with Figma. For example, when a user opens a Figma file, the page the user lands on is represented by a PageNode, as well as the rest of the pages in the file. Each PageNode contains an array of children that represent the layers on a page. The order of the children in the array corresponds to the order of the layers in the editor.

Figma files contain at least one PageNode. The node tree always contains a PageNode for every page, but only some PageNodes will have their content fully loaded. This is a feature of Figma files called [dynamic page loading](https://help.figma.com/hc/en-us/articles/1500005554982-Guide-to-files-and-projects#h_01HHDQ77YC3D3NK7K9DEE3SQKQ).

Complete PageNodes are only loaded by the editor when necessary. For example:

- When the user navigates to a page in the editor.
- When a plugin calls a Plugin API method to load another page or contents from another page.

## Getting the current selection

Most often, a plugin does something on the user’s current page with whatever the user has currently selected. Each page stores its selection independently. To obtain the selection of the current page, use `figma.currentPage.selection`, which returns a `ReadonlyArray<BaseNode>`.

This short plugin makes the current selection half as transparent, then closes:

Get current selection

``` ts
for (const node of figma.currentPage.selection) {
  if ("opacity" in node) {
    node.opacity *= 0.5
  }
}
figma.closePlugin()
```

If you just want to work with one of the selected layers (common when testing), you can use `figma.currentPage.selection[0]`. Just keep in mind, there are always three situations your plugin needs to handle:

- No layer is selected
- A single layer is selected
- Multiple layers are selected

info

**Note:** In Dev Mode, users can only select one node at a time, and thus `figma.currentPage.selection` returns only one object in Dev Mode.

Learn more in the [Working in Dev Mode guide →](https://developers.figma.com/docs/plugins/working-in-dev-mode/)

## Loading pages and nodes

While most plugins will only need to access the current page, there may be use cases where your plugin needs to load additional pages. Because Figma [loads pages in a file as needed](https://help.figma.com/hc/en-us/articles/1500005554982-Guide-to-files-and-projects#h_01HHDQ77YC3D3NK7K9DEE3SQKQ), only the user’s current page is guaranteed to be completely loaded. Functionally, this means that you cannot expect a node on another page to be available to your plugin unless you've *explicitly loaded* the page that contains the node or you've asynchronously accessed the node.

To find the content on a page that you want to work with, your plugin will usually iterate over `PageNode.children`. However, before accessing the content of a page outside the user's current page, your plugin must explicitly load that PageNode using the `loadAsync()` method. `PageNode.children` will throw an exception if called on a page that is not the current page and has not been explicitly loaded by the plugin using `loadAsync()`.

Example: Logging the number of children on all pages

``` ts
for (const page of figma.root.children) {
  await page.loadAsync()
  console.log(`Page ${page.name} has ${page.children.length} children`)
}
```

The previous example iterates over the PageNodes (`page`) on the DocumentNode (`figma.root.children`). For each `page`, the code calls the `loadAsync()` method. Then, the properties of the PageNode (for example, `page.children`) can be safely accessed by the plugin.

note

**Note:** Loading a page doesn’t navigate a user to that page; it simply guarantees the data for that page is available to your plugin. To simultaneously load and navigate a user to a page, use `await setCurrentPageAsync()`.

## Node types

Each node has a `type` field which indicates its type, which is helpful if your plugin only needs to operate on certain types of nodes. For example, a spellchecking plugin is likely to only care about nodes where `node.type === "TEXT"`.

Nodes of a given type have a particular set of fields that your plugin can read and write. For example, rectangle nodes (nodes with `"RECTANGLE"`) have a `.cornerRadius` field, but not a `.constraints` field. On the other hand, frames (nodes with type `"FRAME"`) `.constraints` field, but not a `.cornerRadius` field.

warning

**Caution:** In order to build a plugin that doesn't crash, you should always think about how to handle unexpected node types. Even if your plugin only cares about certain node nodes, users may try to run your plugin with any node type. Ensure your plugin provides feedback to the user if they try to use it on a node type you don't support. You can do this using the [`figma.notify()`](https://developers.figma.com/docs/plugins/api/properties/figma-notify/) function.

## Full document traversal

warning

**Important:** While the Plugin API makes it possible to traverse all pages of a document, Figma strongly recommends that plugins don't do so unless they're performing document-wide actions (like find-and-replace or calculating statistics across a file). Because Figma loads pages as needed, plugins that traverse all pages must first load every page. In very large and complex files, this will result in a significant delay the first time a user opens a file and runs that plugin. To avoid this delay, plugins should only [load the specific pages](#loading-pages-and-nodes) they need.

Because the Figma editor only loads pages as needed, if you want to traverse the whole document, your plugin must first call `figma.loadAllPagesAsync()`. This ensures that all pages in the file are correctly loaded before your plugin tries to traverse the pages.

In order to search through an entire document, without any node-based filtering, you can use the `node.findOne()` and `node.findAll()` functions. Again, carefully consider if your plugin needs to do this as it requires that you load all pages using `figma.loadAllPagesAsync()` and could lead to performance issues for your plugin in large files.

Built-in traversal helpers

``` ts
figma.loadAllPagesAsync() // ensures all PageNodes are loaded, can be slow in very large files

// Finds the first text node with more than 100 characters
const node = node.findOne(node => {
  return node.type === "TEXT" && node.characters.length > 100
})

// Finds all empty frame nodes
const nodes = node.findAll(node => {
  return node.type === "FRAME" && node.children.length === 0
})
```

In general, if you want to have full control over how you traverse the document, you will have to write a recursive function.

Custom traversal

``` ts
// This plugin counts the number of layers, ignoring instance sublayers,
// in the document
figma.loadAllPagesAsync() // ensures all PageNodes are loaded, can be slow in very large files

let count = 0
function traverse(node) {
  if ("children" in node) {
    count++
    if (node.type !== "INSTANCE") {
      for (const child of node.children) {
        traverse(child)
      }
    }
  }
}
traverse(figma.root) // start the traversal at the root
alert(count)
figma.closePlugin()
```

---

> Source: <https://developers.figma.com/docs/plugins/api/PageNode/>

## PageNode — dynamic page loading members

### loadAsync(): Promise\<void\>

Loads the contents of the page node.

------------------------------------------------------------------------

------------------------------------------------------------------------

### [children](https://developers.figma.com/docs/plugins/api/properties/nodes-children/): ReadonlyArray\<[SceneNode](https://developers.figma.com/docs/plugins/api/nodes/#scenenode)\> \[readonly\]

The list of children, sorted back-to-front. That is, the first child in the array is the bottommost layer on the screen, and the last child in the array is the topmost layer.

If the manifest contains `"documentAccess": "dynamic-page"`, **and** the node is a [`PageNode`](https://developers.figma.com/docs/plugins/api/PageNode/), you must first call [`loadAsync`](https://developers.figma.com/docs/plugins/api/PageNode/#loadasync) to access this property.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-children/)

------------------------------------------------------------------------

------------------------------------------------------------------------

### [findAll](https://developers.figma.com/docs/plugins/api/properties/nodes-findall/)(callback?: (node: [SceneNode](https://developers.figma.com/docs/plugins/api/nodes/#scenenode)) =\> boolean): [SceneNode](https://developers.figma.com/docs/plugins/api/nodes/#scenenode)\[\]

Searches this entire subtree (this node's children, its children's children, etc). Returns all nodes for which `callback` returns true.

If the manifest contains `"documentAccess": "dynamic-page"`, **and** the node is a [`PageNode`](https://developers.figma.com/docs/plugins/api/PageNode/), you must first call [`loadAsync`](https://developers.figma.com/docs/plugins/api/PageNode/#loadasync) to access this function.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-findall/)

------------------------------------------------------------------------

------------------------------------------------------------------------

### [findOne](https://developers.figma.com/docs/plugins/api/properties/nodes-findone/)(callback: (node: [SceneNode](https://developers.figma.com/docs/plugins/api/nodes/#scenenode)) =\> boolean): [SceneNode](https://developers.figma.com/docs/plugins/api/nodes/#scenenode) \| null

Searches this entire subtree (this node's children, its children's children, etc). Returns the first node for which `callback` returns true.

If the manifest contains `"documentAccess": "dynamic-page"`, **and** the node is a [`PageNode`](https://developers.figma.com/docs/plugins/api/PageNode/), you must first call [`loadAsync`](https://developers.figma.com/docs/plugins/api/PageNode/#loadasync) to access this function.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-findone/)

------------------------------------------------------------------------

------------------------------------------------------------------------

### [findChildren](https://developers.figma.com/docs/plugins/api/properties/nodes-findchildren/)(callback?: (node: [SceneNode](https://developers.figma.com/docs/plugins/api/nodes/#scenenode)) =\> boolean): [SceneNode](https://developers.figma.com/docs/plugins/api/nodes/#scenenode)\[\]

Searches the immediate children of this node (i.e. not including the children's children). Returns all nodes for which `callback` returns true.

If the manifest contains `"documentAccess": "dynamic-page"`, **and** the node is a [`PageNode`](https://developers.figma.com/docs/plugins/api/PageNode/), you must first call [`loadAsync`](https://developers.figma.com/docs/plugins/api/PageNode/#loadasync) to access this function.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-findchildren/)

------------------------------------------------------------------------

---

> Source: <https://developers.figma.com/docs/plugins/api/figma/>

## figma global — page access members

### loadAllPagesAsync(): Promise\<void\>

Loads all pages of the document into memory. This enables the use of the following features:

- The `documentchange` event for [`figma.on`](https://developers.figma.com/docs/plugins/api/properties/figma-on/)
- [`findAll`](https://developers.figma.com/docs/plugins/api/properties/DocumentNode-findall/)
- [`findOne`](https://developers.figma.com/docs/plugins/api/properties/DocumentNode-findone/)
- [`findAllWithCriteria`](https://developers.figma.com/docs/plugins/api/DocumentNode/#findallwithcriteria)
- [`findWidgetNodesByWidgetId`](https://developers.figma.com/docs/plugins/api/properties/DocumentNode-findwidgetnodesbywidgetid/)

Calling this method may be slow for large documents, and should be avoided unless absolutely necessary.

This method is only necessary if the plugin manifest contains `"documentAccess": "dynamic-page"`. Without this manifest setting, the full document is loaded automatically when the plugin or widget runs.

------------------------------------------------------------------------

------------------------------------------------------------------------

### currentPage: [PageNode](https://developers.figma.com/docs/plugins/api/PageNode/)

The page that the user currently viewing. You can set this value to a [`PageNode`](https://developers.figma.com/docs/plugins/api/PageNode/) to switch pages.

- If the manifest contains`"documentAccess": "dynamic-page"`, this property is read-only. Use [`figma.setCurrentPageAsync`](https://developers.figma.com/docs/plugins/api/figma/#setcurrentpageasync) to update the value.

------------------------------------------------------------------------

------------------------------------------------------------------------

### setCurrentPageAsync(page: [PageNode](https://developers.figma.com/docs/plugins/api/PageNode/)): Promise\<void\>

Switch the active page to the specified [`PageNode`](https://developers.figma.com/docs/plugins/api/PageNode/).

------------------------------------------------------------------------

------------------------------------------------------------------------

### root: [DocumentNode](https://developers.figma.com/docs/plugins/api/DocumentNode/) \[readonly\]

The root of the entire Figma document. This node is used to access other pages. Each child is a [`PageNode`](https://developers.figma.com/docs/plugins/api/PageNode/).

------------------------------------------------------------------------

------------------------------------------------------------------------

### getNodeByIdAsync(id: string): Promise\<[BaseNode](https://developers.figma.com/docs/plugins/api/nodes/#basenode) \| null\>

Finds a node by its id in the current document. Every node has an `id` property, which is unique within the document. If the id is invalid, or the node cannot be found (e.g. removed), returns a promise containing null.

------------------------------------------------------------------------

------------------------------------------------------------------------

### [createPage](https://developers.figma.com/docs/plugins/api/properties/figma-createpage/)(): [PageNode](https://developers.figma.com/docs/plugins/api/PageNode/)

Creates a new page, appended to the document's list of children.

[View more →](https://developers.figma.com/docs/plugins/api/properties/figma-createpage/)

------------------------------------------------------------------------

------------------------------------------------------------------------

### [skipInvisibleInstanceChildren](https://developers.figma.com/docs/plugins/api/properties/figma-skipinvisibleinstancechildren/): boolean

When enabled, causes all node properties and methods to skip over invisible nodes (and their descendants) inside [`instances`](https://developers.figma.com/docs/plugins/api/InstanceNode/). This makes operations like document traversal much faster.

info

Defaults to true in Figma Dev Mode and false in Figma and FigJam

[View more →](https://developers.figma.com/docs/plugins/api/properties/figma-skipinvisibleinstancechildren/)

------------------------------------------------------------------------
