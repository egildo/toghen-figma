# Source: https://developers.figma.com/docs/plugins/api/node-properties/

<!-- Vendored snapshot of the Figma Plugin API docs. Captured 2026-08-04. -->

**Sources in this file** (captured 2026-08-04):

- <https://developers.figma.com/docs/plugins/api/node-properties/>
- <https://developers.figma.com/docs/plugins/api/properties/nodes-boundvariables/>
- <https://developers.figma.com/docs/plugins/api/properties/nodes-setboundvariable/>
- <https://developers.figma.com/docs/plugins/api/properties/nodes-inferredvariables/>
- <https://developers.figma.com/docs/plugins/api/properties/nodes-resolvedvariablemodes/>
- <https://developers.figma.com/docs/plugins/api/properties/nodes-fills/>

---
# Node properties (variable binding & paint/style subset)

The full `node-properties` page documents every property shared across node types and is
very large. Only the members a design-token plugin actually touches are vendored here.

## Variable-binding, paint and style properties shared across node types

### [boundVariables](https://developers.figma.com/docs/plugins/api/properties/nodes-boundvariables/)?: { readonly \[field in [VariableBindableNodeField](https://developers.figma.com/docs/plugins/api/VariableBindableNodeField/)\]?: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/)} & { readonly \[field in [VariableBindableTextField](https://developers.figma.com/docs/plugins/api/VariableBindableTextField/)\]?: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/)\[\]} & { fills?: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/)\[\]; strokes?: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/)\[\]; effects?: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/)\[\]; layoutGrids?: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/)\[\]; componentProperties?: { \[propertyName: string\]: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/) }; textRangeFills?: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/)\[\] } \[readonly\]

Supported on:

- [BooleanOperationNode](https://developers.figma.com/docs/plugins/api/BooleanOperationNode/)
- [CodeBlockNode](https://developers.figma.com/docs/plugins/api/CodeBlockNode/)
- [ComponentNode](https://developers.figma.com/docs/plugins/api/ComponentNode/)
- [ComponentSetNode](https://developers.figma.com/docs/plugins/api/ComponentSetNode/)
- [ConnectorNode](https://developers.figma.com/docs/plugins/api/ConnectorNode/)
- [EllipseNode](https://developers.figma.com/docs/plugins/api/EllipseNode/)
- [EmbedNode](https://developers.figma.com/docs/plugins/api/EmbedNode/)
- [FrameNode](https://developers.figma.com/docs/plugins/api/FrameNode/)
- [GroupNode](https://developers.figma.com/docs/plugins/api/GroupNode/)
- [HighlightNode](https://developers.figma.com/docs/plugins/api/HighlightNode/)
- [InstanceNode](https://developers.figma.com/docs/plugins/api/InstanceNode/)
- [InteractiveSlideElementNode](https://developers.figma.com/docs/plugins/api/InteractiveSlideElementNode/)
- [LineNode](https://developers.figma.com/docs/plugins/api/LineNode/)
- [LinkUnfurlNode](https://developers.figma.com/docs/plugins/api/LinkUnfurlNode/)
- [MediaNode](https://developers.figma.com/docs/plugins/api/MediaNode/)
- [PolygonNode](https://developers.figma.com/docs/plugins/api/PolygonNode/)
- [RectangleNode](https://developers.figma.com/docs/plugins/api/RectangleNode/)
- [SectionNode](https://developers.figma.com/docs/plugins/api/SectionNode/)
- [ShapeWithTextNode](https://developers.figma.com/docs/plugins/api/ShapeWithTextNode/)
- [SliceNode](https://developers.figma.com/docs/plugins/api/SliceNode/)
- [SlideGridNode](https://developers.figma.com/docs/plugins/api/SlideGridNode/)
- [SlideNode](https://developers.figma.com/docs/plugins/api/SlideNode/)
- [SlideRowNode](https://developers.figma.com/docs/plugins/api/SlideRowNode/)
- [SlotNode](https://developers.figma.com/docs/plugins/api/SlotNode/)
- [StampNode](https://developers.figma.com/docs/plugins/api/StampNode/)
- [StarNode](https://developers.figma.com/docs/plugins/api/StarNode/)
- [StickyNode](https://developers.figma.com/docs/plugins/api/StickyNode/)
- [TableNode](https://developers.figma.com/docs/plugins/api/TableNode/)
- [TextNode](https://developers.figma.com/docs/plugins/api/TextNode/)
- [TextPathNode](https://developers.figma.com/docs/plugins/api/TextPathNode/)
- [TransformGroupNode](https://developers.figma.com/docs/plugins/api/TransformGroupNode/)
- [VectorNode](https://developers.figma.com/docs/plugins/api/VectorNode/)
- [WashiTapeNode](https://developers.figma.com/docs/plugins/api/WashiTapeNode/)
- [WidgetNode](https://developers.figma.com/docs/plugins/api/WidgetNode/)

The variables bound to a particular field on this node. Please see the [Working with Variables](https://developers.figma.com/docs/plugins/working-with-variables/) guide for how to get and set variable bindings.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-boundvariables/)

------------------------------------------------------------------------

------------------------------------------------------------------------

### setBoundVariable(field: [VariableBindableNodeField](https://developers.figma.com/docs/plugins/api/VariableBindableNodeField/) \| [VariableBindableTextField](https://developers.figma.com/docs/plugins/api/VariableBindableTextField/), variable: [Variable](https://developers.figma.com/docs/plugins/api/Variable/) \| null): void

Supported on:

- [BooleanOperationNode](https://developers.figma.com/docs/plugins/api/BooleanOperationNode/)
- [CodeBlockNode](https://developers.figma.com/docs/plugins/api/CodeBlockNode/)
- [ComponentNode](https://developers.figma.com/docs/plugins/api/ComponentNode/)
- [ComponentSetNode](https://developers.figma.com/docs/plugins/api/ComponentSetNode/)
- [ConnectorNode](https://developers.figma.com/docs/plugins/api/ConnectorNode/)
- [EllipseNode](https://developers.figma.com/docs/plugins/api/EllipseNode/)
- [EmbedNode](https://developers.figma.com/docs/plugins/api/EmbedNode/)
- [FrameNode](https://developers.figma.com/docs/plugins/api/FrameNode/)
- [GroupNode](https://developers.figma.com/docs/plugins/api/GroupNode/)
- [HighlightNode](https://developers.figma.com/docs/plugins/api/HighlightNode/)
- [InstanceNode](https://developers.figma.com/docs/plugins/api/InstanceNode/)
- [InteractiveSlideElementNode](https://developers.figma.com/docs/plugins/api/InteractiveSlideElementNode/)
- [LineNode](https://developers.figma.com/docs/plugins/api/LineNode/)
- [LinkUnfurlNode](https://developers.figma.com/docs/plugins/api/LinkUnfurlNode/)
- [MediaNode](https://developers.figma.com/docs/plugins/api/MediaNode/)
- [PolygonNode](https://developers.figma.com/docs/plugins/api/PolygonNode/)
- [RectangleNode](https://developers.figma.com/docs/plugins/api/RectangleNode/)
- [SectionNode](https://developers.figma.com/docs/plugins/api/SectionNode/)
- [ShapeWithTextNode](https://developers.figma.com/docs/plugins/api/ShapeWithTextNode/)
- [SliceNode](https://developers.figma.com/docs/plugins/api/SliceNode/)
- [SlideGridNode](https://developers.figma.com/docs/plugins/api/SlideGridNode/)
- [SlideNode](https://developers.figma.com/docs/plugins/api/SlideNode/)
- [SlideRowNode](https://developers.figma.com/docs/plugins/api/SlideRowNode/)
- [SlotNode](https://developers.figma.com/docs/plugins/api/SlotNode/)
- [StampNode](https://developers.figma.com/docs/plugins/api/StampNode/)
- [StarNode](https://developers.figma.com/docs/plugins/api/StarNode/)
- [StickyNode](https://developers.figma.com/docs/plugins/api/StickyNode/)
- [TableNode](https://developers.figma.com/docs/plugins/api/TableNode/)
- [TextNode](https://developers.figma.com/docs/plugins/api/TextNode/)
- [TextPathNode](https://developers.figma.com/docs/plugins/api/TextPathNode/)
- [TransformGroupNode](https://developers.figma.com/docs/plugins/api/TransformGroupNode/)
- [VectorNode](https://developers.figma.com/docs/plugins/api/VectorNode/)
- [WashiTapeNode](https://developers.figma.com/docs/plugins/api/WashiTapeNode/)
- [WidgetNode](https://developers.figma.com/docs/plugins/api/WidgetNode/)

Binds the provided `field` on this node to the given variable. Please see the [Working with Variables](https://developers.figma.com/docs/plugins/working-with-variables/) guide for how to get and set variable bindings.

If `null` is provided as the variable, the given `field` will be unbound from any variables.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-setboundvariable/)

------------------------------------------------------------------------

------------------------------------------------------------------------

### [inferredVariables](https://developers.figma.com/docs/plugins/api/properties/nodes-inferredvariables/)?: { readonly \[field in [VariableBindableNodeField](https://developers.figma.com/docs/plugins/api/VariableBindableNodeField/)\]?: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/)\[\]} & { fills?: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/)\[\]\[\]; strokes?: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/)\[\]\[\] } \[readonly\]

Supported on:

- [BooleanOperationNode](https://developers.figma.com/docs/plugins/api/BooleanOperationNode/)
- [CodeBlockNode](https://developers.figma.com/docs/plugins/api/CodeBlockNode/)
- [ComponentNode](https://developers.figma.com/docs/plugins/api/ComponentNode/)
- [ComponentSetNode](https://developers.figma.com/docs/plugins/api/ComponentSetNode/)
- [ConnectorNode](https://developers.figma.com/docs/plugins/api/ConnectorNode/)
- [EllipseNode](https://developers.figma.com/docs/plugins/api/EllipseNode/)
- [EmbedNode](https://developers.figma.com/docs/plugins/api/EmbedNode/)
- [FrameNode](https://developers.figma.com/docs/plugins/api/FrameNode/)
- [GroupNode](https://developers.figma.com/docs/plugins/api/GroupNode/)
- [HighlightNode](https://developers.figma.com/docs/plugins/api/HighlightNode/)
- [InstanceNode](https://developers.figma.com/docs/plugins/api/InstanceNode/)
- [InteractiveSlideElementNode](https://developers.figma.com/docs/plugins/api/InteractiveSlideElementNode/)
- [LineNode](https://developers.figma.com/docs/plugins/api/LineNode/)
- [LinkUnfurlNode](https://developers.figma.com/docs/plugins/api/LinkUnfurlNode/)
- [MediaNode](https://developers.figma.com/docs/plugins/api/MediaNode/)
- [PolygonNode](https://developers.figma.com/docs/plugins/api/PolygonNode/)
- [RectangleNode](https://developers.figma.com/docs/plugins/api/RectangleNode/)
- [SectionNode](https://developers.figma.com/docs/plugins/api/SectionNode/)
- [ShapeWithTextNode](https://developers.figma.com/docs/plugins/api/ShapeWithTextNode/)
- [SliceNode](https://developers.figma.com/docs/plugins/api/SliceNode/)
- [SlideGridNode](https://developers.figma.com/docs/plugins/api/SlideGridNode/)
- [SlideNode](https://developers.figma.com/docs/plugins/api/SlideNode/)
- [SlideRowNode](https://developers.figma.com/docs/plugins/api/SlideRowNode/)
- [SlotNode](https://developers.figma.com/docs/plugins/api/SlotNode/)
- [StampNode](https://developers.figma.com/docs/plugins/api/StampNode/)
- [StarNode](https://developers.figma.com/docs/plugins/api/StarNode/)
- [StickyNode](https://developers.figma.com/docs/plugins/api/StickyNode/)
- [TableNode](https://developers.figma.com/docs/plugins/api/TableNode/)
- [TextNode](https://developers.figma.com/docs/plugins/api/TextNode/)
- [TextPathNode](https://developers.figma.com/docs/plugins/api/TextPathNode/)
- [TransformGroupNode](https://developers.figma.com/docs/plugins/api/TransformGroupNode/)
- [VectorNode](https://developers.figma.com/docs/plugins/api/VectorNode/)
- [WashiTapeNode](https://developers.figma.com/docs/plugins/api/WashiTapeNode/)
- [WidgetNode](https://developers.figma.com/docs/plugins/api/WidgetNode/)

An object, keyed by field, returning any variables that match the raw value of that field for the mode of the node (or the default variable value if no mode is set)

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-inferredvariables/)

------------------------------------------------------------------------

------------------------------------------------------------------------

### explicitVariableModes: { \[collectionId: string\]: string }

Supported on:

- [BooleanOperationNode](https://developers.figma.com/docs/plugins/api/BooleanOperationNode/)
- [CodeBlockNode](https://developers.figma.com/docs/plugins/api/CodeBlockNode/)
- [ComponentNode](https://developers.figma.com/docs/plugins/api/ComponentNode/)
- [ComponentSetNode](https://developers.figma.com/docs/plugins/api/ComponentSetNode/)
- [ConnectorNode](https://developers.figma.com/docs/plugins/api/ConnectorNode/)
- [EllipseNode](https://developers.figma.com/docs/plugins/api/EllipseNode/)
- [EmbedNode](https://developers.figma.com/docs/plugins/api/EmbedNode/)
- [FrameNode](https://developers.figma.com/docs/plugins/api/FrameNode/)
- [GroupNode](https://developers.figma.com/docs/plugins/api/GroupNode/)
- [HighlightNode](https://developers.figma.com/docs/plugins/api/HighlightNode/)
- [InstanceNode](https://developers.figma.com/docs/plugins/api/InstanceNode/)
- [InteractiveSlideElementNode](https://developers.figma.com/docs/plugins/api/InteractiveSlideElementNode/)
- [LineNode](https://developers.figma.com/docs/plugins/api/LineNode/)
- [LinkUnfurlNode](https://developers.figma.com/docs/plugins/api/LinkUnfurlNode/)
- [MediaNode](https://developers.figma.com/docs/plugins/api/MediaNode/)
- [PageNode](https://developers.figma.com/docs/plugins/api/PageNode/)
- [PolygonNode](https://developers.figma.com/docs/plugins/api/PolygonNode/)
- [RectangleNode](https://developers.figma.com/docs/plugins/api/RectangleNode/)
- [SectionNode](https://developers.figma.com/docs/plugins/api/SectionNode/)
- [ShapeWithTextNode](https://developers.figma.com/docs/plugins/api/ShapeWithTextNode/)
- [SliceNode](https://developers.figma.com/docs/plugins/api/SliceNode/)
- [SlideGridNode](https://developers.figma.com/docs/plugins/api/SlideGridNode/)
- [SlideNode](https://developers.figma.com/docs/plugins/api/SlideNode/)
- [SlideRowNode](https://developers.figma.com/docs/plugins/api/SlideRowNode/)
- [SlotNode](https://developers.figma.com/docs/plugins/api/SlotNode/)
- [StampNode](https://developers.figma.com/docs/plugins/api/StampNode/)
- [StarNode](https://developers.figma.com/docs/plugins/api/StarNode/)
- [StickyNode](https://developers.figma.com/docs/plugins/api/StickyNode/)
- [TableNode](https://developers.figma.com/docs/plugins/api/TableNode/)
- [TextNode](https://developers.figma.com/docs/plugins/api/TextNode/)
- [TextPathNode](https://developers.figma.com/docs/plugins/api/TextPathNode/)
- [TransformGroupNode](https://developers.figma.com/docs/plugins/api/TransformGroupNode/)
- [VectorNode](https://developers.figma.com/docs/plugins/api/VectorNode/)
- [WashiTapeNode](https://developers.figma.com/docs/plugins/api/WashiTapeNode/)
- [WidgetNode](https://developers.figma.com/docs/plugins/api/WidgetNode/)

The explicitly set modes for this node. For `SceneNodes`, represents a subset of [`resolvedVariableModes`](https://developers.figma.com/docs/plugins/api/properties/nodes-resolvedvariablemodes/). Note that this does not include [workspace and team-default modes](https://help.figma.com/hc/en-us/articles/12611253730071).

------------------------------------------------------------------------

------------------------------------------------------------------------

### setExplicitVariableModeForCollection(collection: [VariableCollection](https://developers.figma.com/docs/plugins/api/VariableCollection/), modeId: string): void

Supported on:

- [BooleanOperationNode](https://developers.figma.com/docs/plugins/api/BooleanOperationNode/)
- [CodeBlockNode](https://developers.figma.com/docs/plugins/api/CodeBlockNode/)
- [ComponentNode](https://developers.figma.com/docs/plugins/api/ComponentNode/)
- [ComponentSetNode](https://developers.figma.com/docs/plugins/api/ComponentSetNode/)
- [ConnectorNode](https://developers.figma.com/docs/plugins/api/ConnectorNode/)
- [EllipseNode](https://developers.figma.com/docs/plugins/api/EllipseNode/)
- [EmbedNode](https://developers.figma.com/docs/plugins/api/EmbedNode/)
- [FrameNode](https://developers.figma.com/docs/plugins/api/FrameNode/)
- [GroupNode](https://developers.figma.com/docs/plugins/api/GroupNode/)
- [HighlightNode](https://developers.figma.com/docs/plugins/api/HighlightNode/)
- [InstanceNode](https://developers.figma.com/docs/plugins/api/InstanceNode/)
- [InteractiveSlideElementNode](https://developers.figma.com/docs/plugins/api/InteractiveSlideElementNode/)
- [LineNode](https://developers.figma.com/docs/plugins/api/LineNode/)
- [LinkUnfurlNode](https://developers.figma.com/docs/plugins/api/LinkUnfurlNode/)
- [MediaNode](https://developers.figma.com/docs/plugins/api/MediaNode/)
- [PageNode](https://developers.figma.com/docs/plugins/api/PageNode/)
- [PolygonNode](https://developers.figma.com/docs/plugins/api/PolygonNode/)
- [RectangleNode](https://developers.figma.com/docs/plugins/api/RectangleNode/)
- [SectionNode](https://developers.figma.com/docs/plugins/api/SectionNode/)
- [ShapeWithTextNode](https://developers.figma.com/docs/plugins/api/ShapeWithTextNode/)
- [SliceNode](https://developers.figma.com/docs/plugins/api/SliceNode/)
- [SlideGridNode](https://developers.figma.com/docs/plugins/api/SlideGridNode/)
- [SlideNode](https://developers.figma.com/docs/plugins/api/SlideNode/)
- [SlideRowNode](https://developers.figma.com/docs/plugins/api/SlideRowNode/)
- [SlotNode](https://developers.figma.com/docs/plugins/api/SlotNode/)
- [StampNode](https://developers.figma.com/docs/plugins/api/StampNode/)
- [StarNode](https://developers.figma.com/docs/plugins/api/StarNode/)
- [StickyNode](https://developers.figma.com/docs/plugins/api/StickyNode/)
- [TableNode](https://developers.figma.com/docs/plugins/api/TableNode/)
- [TextNode](https://developers.figma.com/docs/plugins/api/TextNode/)
- [TextPathNode](https://developers.figma.com/docs/plugins/api/TextPathNode/)
- [TransformGroupNode](https://developers.figma.com/docs/plugins/api/TransformGroupNode/)
- [VectorNode](https://developers.figma.com/docs/plugins/api/VectorNode/)
- [WashiTapeNode](https://developers.figma.com/docs/plugins/api/WashiTapeNode/)
- [WidgetNode](https://developers.figma.com/docs/plugins/api/WidgetNode/)

Sets an explicit mode for the given collection on this node

[View more →](https://developers.figma.com/docs/plugins/api/properties/ExplicitVariableModesMixin-setexplicitvariablemodeforcollection/)

------------------------------------------------------------------------

------------------------------------------------------------------------

### clearExplicitVariableModeForCollection(collection: [VariableCollection](https://developers.figma.com/docs/plugins/api/VariableCollection/)): void

Supported on:

- [BooleanOperationNode](https://developers.figma.com/docs/plugins/api/BooleanOperationNode/)
- [CodeBlockNode](https://developers.figma.com/docs/plugins/api/CodeBlockNode/)
- [ComponentNode](https://developers.figma.com/docs/plugins/api/ComponentNode/)
- [ComponentSetNode](https://developers.figma.com/docs/plugins/api/ComponentSetNode/)
- [ConnectorNode](https://developers.figma.com/docs/plugins/api/ConnectorNode/)
- [EllipseNode](https://developers.figma.com/docs/plugins/api/EllipseNode/)
- [EmbedNode](https://developers.figma.com/docs/plugins/api/EmbedNode/)
- [FrameNode](https://developers.figma.com/docs/plugins/api/FrameNode/)
- [GroupNode](https://developers.figma.com/docs/plugins/api/GroupNode/)
- [HighlightNode](https://developers.figma.com/docs/plugins/api/HighlightNode/)
- [InstanceNode](https://developers.figma.com/docs/plugins/api/InstanceNode/)
- [InteractiveSlideElementNode](https://developers.figma.com/docs/plugins/api/InteractiveSlideElementNode/)
- [LineNode](https://developers.figma.com/docs/plugins/api/LineNode/)
- [LinkUnfurlNode](https://developers.figma.com/docs/plugins/api/LinkUnfurlNode/)
- [MediaNode](https://developers.figma.com/docs/plugins/api/MediaNode/)
- [PageNode](https://developers.figma.com/docs/plugins/api/PageNode/)
- [PolygonNode](https://developers.figma.com/docs/plugins/api/PolygonNode/)
- [RectangleNode](https://developers.figma.com/docs/plugins/api/RectangleNode/)
- [SectionNode](https://developers.figma.com/docs/plugins/api/SectionNode/)
- [ShapeWithTextNode](https://developers.figma.com/docs/plugins/api/ShapeWithTextNode/)
- [SliceNode](https://developers.figma.com/docs/plugins/api/SliceNode/)
- [SlideGridNode](https://developers.figma.com/docs/plugins/api/SlideGridNode/)
- [SlideNode](https://developers.figma.com/docs/plugins/api/SlideNode/)
- [SlideRowNode](https://developers.figma.com/docs/plugins/api/SlideRowNode/)
- [SlotNode](https://developers.figma.com/docs/plugins/api/SlotNode/)
- [StampNode](https://developers.figma.com/docs/plugins/api/StampNode/)
- [StarNode](https://developers.figma.com/docs/plugins/api/StarNode/)
- [StickyNode](https://developers.figma.com/docs/plugins/api/StickyNode/)
- [TableNode](https://developers.figma.com/docs/plugins/api/TableNode/)
- [TextNode](https://developers.figma.com/docs/plugins/api/TextNode/)
- [TextPathNode](https://developers.figma.com/docs/plugins/api/TextPathNode/)
- [TransformGroupNode](https://developers.figma.com/docs/plugins/api/TransformGroupNode/)
- [VectorNode](https://developers.figma.com/docs/plugins/api/VectorNode/)
- [WashiTapeNode](https://developers.figma.com/docs/plugins/api/WashiTapeNode/)
- [WidgetNode](https://developers.figma.com/docs/plugins/api/WidgetNode/)

Clears an explicit mode for the given collection on this node

[View more →](https://developers.figma.com/docs/plugins/api/properties/ExplicitVariableModesMixin-clearexplicitvariablemodeforcollection/)

------------------------------------------------------------------------

------------------------------------------------------------------------

### [resolvedVariableModes](https://developers.figma.com/docs/plugins/api/properties/nodes-resolvedvariablemodes/): { \[collectionId: string\]: string }

Supported on:

- [BooleanOperationNode](https://developers.figma.com/docs/plugins/api/BooleanOperationNode/)
- [CodeBlockNode](https://developers.figma.com/docs/plugins/api/CodeBlockNode/)
- [ComponentNode](https://developers.figma.com/docs/plugins/api/ComponentNode/)
- [ComponentSetNode](https://developers.figma.com/docs/plugins/api/ComponentSetNode/)
- [ConnectorNode](https://developers.figma.com/docs/plugins/api/ConnectorNode/)
- [EllipseNode](https://developers.figma.com/docs/plugins/api/EllipseNode/)
- [EmbedNode](https://developers.figma.com/docs/plugins/api/EmbedNode/)
- [FrameNode](https://developers.figma.com/docs/plugins/api/FrameNode/)
- [GroupNode](https://developers.figma.com/docs/plugins/api/GroupNode/)
- [HighlightNode](https://developers.figma.com/docs/plugins/api/HighlightNode/)
- [InstanceNode](https://developers.figma.com/docs/plugins/api/InstanceNode/)
- [InteractiveSlideElementNode](https://developers.figma.com/docs/plugins/api/InteractiveSlideElementNode/)
- [LineNode](https://developers.figma.com/docs/plugins/api/LineNode/)
- [LinkUnfurlNode](https://developers.figma.com/docs/plugins/api/LinkUnfurlNode/)
- [MediaNode](https://developers.figma.com/docs/plugins/api/MediaNode/)
- [PolygonNode](https://developers.figma.com/docs/plugins/api/PolygonNode/)
- [RectangleNode](https://developers.figma.com/docs/plugins/api/RectangleNode/)
- [SectionNode](https://developers.figma.com/docs/plugins/api/SectionNode/)
- [ShapeWithTextNode](https://developers.figma.com/docs/plugins/api/ShapeWithTextNode/)
- [SliceNode](https://developers.figma.com/docs/plugins/api/SliceNode/)
- [SlideGridNode](https://developers.figma.com/docs/plugins/api/SlideGridNode/)
- [SlideNode](https://developers.figma.com/docs/plugins/api/SlideNode/)
- [SlideRowNode](https://developers.figma.com/docs/plugins/api/SlideRowNode/)
- [SlotNode](https://developers.figma.com/docs/plugins/api/SlotNode/)
- [StampNode](https://developers.figma.com/docs/plugins/api/StampNode/)
- [StarNode](https://developers.figma.com/docs/plugins/api/StarNode/)
- [StickyNode](https://developers.figma.com/docs/plugins/api/StickyNode/)
- [TableNode](https://developers.figma.com/docs/plugins/api/TableNode/)
- [TextNode](https://developers.figma.com/docs/plugins/api/TextNode/)
- [TextPathNode](https://developers.figma.com/docs/plugins/api/TextPathNode/)
- [TransformGroupNode](https://developers.figma.com/docs/plugins/api/TransformGroupNode/)
- [VectorNode](https://developers.figma.com/docs/plugins/api/VectorNode/)
- [WashiTapeNode](https://developers.figma.com/docs/plugins/api/WashiTapeNode/)
- [WidgetNode](https://developers.figma.com/docs/plugins/api/WidgetNode/)

The resolved mode for this node for each variable collection in this file.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-resolvedvariablemodes/)

------------------------------------------------------------------------

------------------------------------------------------------------------

### getRangeBoundVariable(start: number, end: number, field: [VariableBindableTextField](https://developers.figma.com/docs/plugins/api/VariableBindableTextField/)): [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/) \| null \| [figma.mixed](https://developers.figma.com/docs/plugins/api/properties/figma-mixed/)

Supported on:

- [TextNode](https://developers.figma.com/docs/plugins/api/TextNode/)
- [TextPathNode](https://developers.figma.com/docs/plugins/api/TextPathNode/)
- [TextSublayerNode](https://developers.figma.com/docs/plugins/api/TextSublayer/)

Get the `boundVariable` for a given field from characters in range `start` (inclusive) to `end` (exclusive).

------------------------------------------------------------------------

------------------------------------------------------------------------

### setRangeBoundVariable(start: number, end: number, field: [VariableBindableTextField](https://developers.figma.com/docs/plugins/api/VariableBindableTextField/), variable: [Variable](https://developers.figma.com/docs/plugins/api/Variable/) \| null): void

Supported on:

- [TextNode](https://developers.figma.com/docs/plugins/api/TextNode/)
- [TextPathNode](https://developers.figma.com/docs/plugins/api/TextPathNode/)
- [TextSublayerNode](https://developers.figma.com/docs/plugins/api/TextSublayer/)

Set the `boundVariable` for a given field from characters in range `start` (inclusive) to `end` (exclusive). Requires any new fonts to be loaded.

------------------------------------------------------------------------

------------------------------------------------------------------------

### [fills](https://developers.figma.com/docs/plugins/api/properties/nodes-fills/): ReadonlyArray\<[Paint](https://developers.figma.com/docs/plugins/api/Paint/)\> \| [figma.mixed](https://developers.figma.com/docs/plugins/api/properties/figma-mixed/)

Supported on:

- [BooleanOperationNode](https://developers.figma.com/docs/plugins/api/BooleanOperationNode/)
- [ComponentNode](https://developers.figma.com/docs/plugins/api/ComponentNode/)
- [ComponentSetNode](https://developers.figma.com/docs/plugins/api/ComponentSetNode/)
- [EllipseNode](https://developers.figma.com/docs/plugins/api/EllipseNode/)
- [FrameNode](https://developers.figma.com/docs/plugins/api/FrameNode/)
- [HighlightNode](https://developers.figma.com/docs/plugins/api/HighlightNode/)
- [InstanceNode](https://developers.figma.com/docs/plugins/api/InstanceNode/)
- [LineNode](https://developers.figma.com/docs/plugins/api/LineNode/)
- [PolygonNode](https://developers.figma.com/docs/plugins/api/PolygonNode/)
- [RectangleNode](https://developers.figma.com/docs/plugins/api/RectangleNode/)
- [SectionNode](https://developers.figma.com/docs/plugins/api/SectionNode/)
- [ShapeWithTextNode](https://developers.figma.com/docs/plugins/api/ShapeWithTextNode/)
- [SlideNode](https://developers.figma.com/docs/plugins/api/SlideNode/)
- [SlotNode](https://developers.figma.com/docs/plugins/api/SlotNode/)
- [StampNode](https://developers.figma.com/docs/plugins/api/StampNode/)
- [StarNode](https://developers.figma.com/docs/plugins/api/StarNode/)
- [StickyNode](https://developers.figma.com/docs/plugins/api/StickyNode/)
- [TableCellNode](https://developers.figma.com/docs/plugins/api/TableCellNode/)
- [TableNode](https://developers.figma.com/docs/plugins/api/TableNode/)
- [TextNode](https://developers.figma.com/docs/plugins/api/TextNode/)
- [TextPathNode](https://developers.figma.com/docs/plugins/api/TextPathNode/)
- [TextSublayerNode](https://developers.figma.com/docs/plugins/api/TextSublayer/)
- [VectorNode](https://developers.figma.com/docs/plugins/api/VectorNode/)
- [WashiTapeNode](https://developers.figma.com/docs/plugins/api/WashiTapeNode/)

The paints used to fill the area of the shape. For help on how to change this value, see [Editing Properties](https://developers.figma.com/docs/plugins/editing-properties/).

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-fills/)

------------------------------------------------------------------------

------------------------------------------------------------------------

### setFillsAsync(paints: ReadonlyArray\<[Paint](https://developers.figma.com/docs/plugins/api/Paint/)\>): Promise\<void\>

Supported on:

- [BooleanOperationNode](https://developers.figma.com/docs/plugins/api/BooleanOperationNode/)
- [ComponentNode](https://developers.figma.com/docs/plugins/api/ComponentNode/)
- [ComponentSetNode](https://developers.figma.com/docs/plugins/api/ComponentSetNode/)
- [EllipseNode](https://developers.figma.com/docs/plugins/api/EllipseNode/)
- [FrameNode](https://developers.figma.com/docs/plugins/api/FrameNode/)
- [HighlightNode](https://developers.figma.com/docs/plugins/api/HighlightNode/)
- [InstanceNode](https://developers.figma.com/docs/plugins/api/InstanceNode/)
- [LineNode](https://developers.figma.com/docs/plugins/api/LineNode/)
- [PolygonNode](https://developers.figma.com/docs/plugins/api/PolygonNode/)
- [RectangleNode](https://developers.figma.com/docs/plugins/api/RectangleNode/)
- [SectionNode](https://developers.figma.com/docs/plugins/api/SectionNode/)
- [ShapeWithTextNode](https://developers.figma.com/docs/plugins/api/ShapeWithTextNode/)
- [SlideNode](https://developers.figma.com/docs/plugins/api/SlideNode/)
- [SlotNode](https://developers.figma.com/docs/plugins/api/SlotNode/)
- [StampNode](https://developers.figma.com/docs/plugins/api/StampNode/)
- [StarNode](https://developers.figma.com/docs/plugins/api/StarNode/)
- [StickyNode](https://developers.figma.com/docs/plugins/api/StickyNode/)
- [TableCellNode](https://developers.figma.com/docs/plugins/api/TableCellNode/)
- [TableNode](https://developers.figma.com/docs/plugins/api/TableNode/)
- [TextNode](https://developers.figma.com/docs/plugins/api/TextNode/)
- [TextPathNode](https://developers.figma.com/docs/plugins/api/TextPathNode/)
- [TextSublayerNode](https://developers.figma.com/docs/plugins/api/TextSublayer/)
- [VectorNode](https://developers.figma.com/docs/plugins/api/VectorNode/)
- [WashiTapeNode](https://developers.figma.com/docs/plugins/api/WashiTapeNode/)

Sets the fills of the node asynchronously. This is the only way to set pattern fills on a node, since we need to ensure that the source node of the pattern is loaded first. See [Adding Pattern Fills and Strokes](https://developers.figma.com/docs/plugins/adding-pattern-fills-and-strokes/) for more information.

------------------------------------------------------------------------

------------------------------------------------------------------------

### [strokes](https://developers.figma.com/docs/plugins/api/properties/nodes-strokes/): ReadonlyArray\<[Paint](https://developers.figma.com/docs/plugins/api/Paint/)\>

Supported on:

- [BooleanOperationNode](https://developers.figma.com/docs/plugins/api/BooleanOperationNode/)
- [ComponentNode](https://developers.figma.com/docs/plugins/api/ComponentNode/)
- [ComponentSetNode](https://developers.figma.com/docs/plugins/api/ComponentSetNode/)
- [ConnectorNode](https://developers.figma.com/docs/plugins/api/ConnectorNode/)
- [EllipseNode](https://developers.figma.com/docs/plugins/api/EllipseNode/)
- [FrameNode](https://developers.figma.com/docs/plugins/api/FrameNode/)
- [HighlightNode](https://developers.figma.com/docs/plugins/api/HighlightNode/)
- [InstanceNode](https://developers.figma.com/docs/plugins/api/InstanceNode/)
- [LineNode](https://developers.figma.com/docs/plugins/api/LineNode/)
- [PolygonNode](https://developers.figma.com/docs/plugins/api/PolygonNode/)
- [RectangleNode](https://developers.figma.com/docs/plugins/api/RectangleNode/)
- [SectionNode](https://developers.figma.com/docs/plugins/api/SectionNode/)
- [ShapeWithTextNode](https://developers.figma.com/docs/plugins/api/ShapeWithTextNode/)
- [SlideNode](https://developers.figma.com/docs/plugins/api/SlideNode/)
- [SlotNode](https://developers.figma.com/docs/plugins/api/SlotNode/)
- [StampNode](https://developers.figma.com/docs/plugins/api/StampNode/)
- [StarNode](https://developers.figma.com/docs/plugins/api/StarNode/)
- [TextNode](https://developers.figma.com/docs/plugins/api/TextNode/)
- [TextPathNode](https://developers.figma.com/docs/plugins/api/TextPathNode/)
- [VectorNode](https://developers.figma.com/docs/plugins/api/VectorNode/)
- [WashiTapeNode](https://developers.figma.com/docs/plugins/api/WashiTapeNode/)

The paints used to fill the area of the shape's strokes. For help on how to change this value, see [Editing Properties](https://developers.figma.com/docs/plugins/editing-properties/).

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-strokes/)

------------------------------------------------------------------------

------------------------------------------------------------------------

### setStrokesAsync(strokes: ReadonlyArray\<[Paint](https://developers.figma.com/docs/plugins/api/Paint/)\>): Promise\<void\>

Supported on:

- [BooleanOperationNode](https://developers.figma.com/docs/plugins/api/BooleanOperationNode/)
- [ComponentNode](https://developers.figma.com/docs/plugins/api/ComponentNode/)
- [ComponentSetNode](https://developers.figma.com/docs/plugins/api/ComponentSetNode/)
- [ConnectorNode](https://developers.figma.com/docs/plugins/api/ConnectorNode/)
- [EllipseNode](https://developers.figma.com/docs/plugins/api/EllipseNode/)
- [FrameNode](https://developers.figma.com/docs/plugins/api/FrameNode/)
- [HighlightNode](https://developers.figma.com/docs/plugins/api/HighlightNode/)
- [InstanceNode](https://developers.figma.com/docs/plugins/api/InstanceNode/)
- [LineNode](https://developers.figma.com/docs/plugins/api/LineNode/)
- [PolygonNode](https://developers.figma.com/docs/plugins/api/PolygonNode/)
- [RectangleNode](https://developers.figma.com/docs/plugins/api/RectangleNode/)
- [SectionNode](https://developers.figma.com/docs/plugins/api/SectionNode/)
- [ShapeWithTextNode](https://developers.figma.com/docs/plugins/api/ShapeWithTextNode/)
- [SlideNode](https://developers.figma.com/docs/plugins/api/SlideNode/)
- [SlotNode](https://developers.figma.com/docs/plugins/api/SlotNode/)
- [StampNode](https://developers.figma.com/docs/plugins/api/StampNode/)
- [StarNode](https://developers.figma.com/docs/plugins/api/StarNode/)
- [TextNode](https://developers.figma.com/docs/plugins/api/TextNode/)
- [TextPathNode](https://developers.figma.com/docs/plugins/api/TextPathNode/)
- [VectorNode](https://developers.figma.com/docs/plugins/api/VectorNode/)
- [WashiTapeNode](https://developers.figma.com/docs/plugins/api/WashiTapeNode/)

Sets the strokes of the node asynchronously. This is the only way to set pattern strokes on a node, since we need to ensure that the source node of the pattern is loaded first. See [Adding Pattern Fills and Strokes](https://developers.figma.com/docs/plugins/adding-pattern-fills-and-strokes/) for more information.

------------------------------------------------------------------------

------------------------------------------------------------------------

### effects: ReadonlyArray\<[Effect](https://developers.figma.com/docs/plugins/api/Effect/)\>

Supported on:

- [BooleanOperationNode](https://developers.figma.com/docs/plugins/api/BooleanOperationNode/)
- [ComponentNode](https://developers.figma.com/docs/plugins/api/ComponentNode/)
- [ComponentSetNode](https://developers.figma.com/docs/plugins/api/ComponentSetNode/)
- [EllipseNode](https://developers.figma.com/docs/plugins/api/EllipseNode/)
- [FrameNode](https://developers.figma.com/docs/plugins/api/FrameNode/)
- [GroupNode](https://developers.figma.com/docs/plugins/api/GroupNode/)
- [HighlightNode](https://developers.figma.com/docs/plugins/api/HighlightNode/)
- [InstanceNode](https://developers.figma.com/docs/plugins/api/InstanceNode/)
- [LineNode](https://developers.figma.com/docs/plugins/api/LineNode/)
- [PolygonNode](https://developers.figma.com/docs/plugins/api/PolygonNode/)
- [RectangleNode](https://developers.figma.com/docs/plugins/api/RectangleNode/)
- [SlideNode](https://developers.figma.com/docs/plugins/api/SlideNode/)
- [SlotNode](https://developers.figma.com/docs/plugins/api/SlotNode/)
- [StampNode](https://developers.figma.com/docs/plugins/api/StampNode/)
- [StarNode](https://developers.figma.com/docs/plugins/api/StarNode/)
- [TextNode](https://developers.figma.com/docs/plugins/api/TextNode/)
- [TextPathNode](https://developers.figma.com/docs/plugins/api/TextPathNode/)
- [TransformGroupNode](https://developers.figma.com/docs/plugins/api/TransformGroupNode/)
- [VectorNode](https://developers.figma.com/docs/plugins/api/VectorNode/)
- [WashiTapeNode](https://developers.figma.com/docs/plugins/api/WashiTapeNode/)

Array of effects. See [`Effect`](https://developers.figma.com/docs/plugins/api/Effect/) type. For help on how to change this value, see [Editing Properties](https://developers.figma.com/docs/plugins/editing-properties/).

------------------------------------------------------------------------

------------------------------------------------------------------------

### [fillStyleId](https://developers.figma.com/docs/plugins/api/properties/nodes-fillstyleid/): string \| [figma.mixed](https://developers.figma.com/docs/plugins/api/properties/figma-mixed/)

Supported on:

- [BooleanOperationNode](https://developers.figma.com/docs/plugins/api/BooleanOperationNode/)
- [ComponentNode](https://developers.figma.com/docs/plugins/api/ComponentNode/)
- [ComponentSetNode](https://developers.figma.com/docs/plugins/api/ComponentSetNode/)
- [EllipseNode](https://developers.figma.com/docs/plugins/api/EllipseNode/)
- [FrameNode](https://developers.figma.com/docs/plugins/api/FrameNode/)
- [HighlightNode](https://developers.figma.com/docs/plugins/api/HighlightNode/)
- [InstanceNode](https://developers.figma.com/docs/plugins/api/InstanceNode/)
- [LineNode](https://developers.figma.com/docs/plugins/api/LineNode/)
- [PolygonNode](https://developers.figma.com/docs/plugins/api/PolygonNode/)
- [RectangleNode](https://developers.figma.com/docs/plugins/api/RectangleNode/)
- [SectionNode](https://developers.figma.com/docs/plugins/api/SectionNode/)
- [ShapeWithTextNode](https://developers.figma.com/docs/plugins/api/ShapeWithTextNode/)
- [SlideNode](https://developers.figma.com/docs/plugins/api/SlideNode/)
- [SlotNode](https://developers.figma.com/docs/plugins/api/SlotNode/)
- [StampNode](https://developers.figma.com/docs/plugins/api/StampNode/)
- [StarNode](https://developers.figma.com/docs/plugins/api/StarNode/)
- [StickyNode](https://developers.figma.com/docs/plugins/api/StickyNode/)
- [TableCellNode](https://developers.figma.com/docs/plugins/api/TableCellNode/)
- [TableNode](https://developers.figma.com/docs/plugins/api/TableNode/)
- [TextNode](https://developers.figma.com/docs/plugins/api/TextNode/)
- [TextPathNode](https://developers.figma.com/docs/plugins/api/TextPathNode/)
- [TextSublayerNode](https://developers.figma.com/docs/plugins/api/TextSublayer/)
- [VectorNode](https://developers.figma.com/docs/plugins/api/VectorNode/)
- [WashiTapeNode](https://developers.figma.com/docs/plugins/api/WashiTapeNode/)

The id of the [`PaintStyle`](https://developers.figma.com/docs/plugins/api/PaintStyle/) object that the [`fills`](https://developers.figma.com/docs/plugins/api/properties/nodes-fills/) property of this node is linked to.

If the manifest contains`"documentAccess": "dynamic-page"`, this property is read-only. Use `setFillStyleIdAsync` to update the style.

[View more →](https://developers.figma.com/docs/plugins/api/properties/nodes-fillstyleid/)

------------------------------------------------------------------------

------------------------------------------------------------------------

### setFillStyleIdAsync(styleId: string): Promise\<void\>

Supported on:

- [BooleanOperationNode](https://developers.figma.com/docs/plugins/api/BooleanOperationNode/)
- [ComponentNode](https://developers.figma.com/docs/plugins/api/ComponentNode/)
- [ComponentSetNode](https://developers.figma.com/docs/plugins/api/ComponentSetNode/)
- [EllipseNode](https://developers.figma.com/docs/plugins/api/EllipseNode/)
- [FrameNode](https://developers.figma.com/docs/plugins/api/FrameNode/)
- [HighlightNode](https://developers.figma.com/docs/plugins/api/HighlightNode/)
- [InstanceNode](https://developers.figma.com/docs/plugins/api/InstanceNode/)
- [LineNode](https://developers.figma.com/docs/plugins/api/LineNode/)
- [PolygonNode](https://developers.figma.com/docs/plugins/api/PolygonNode/)
- [RectangleNode](https://developers.figma.com/docs/plugins/api/RectangleNode/)
- [SectionNode](https://developers.figma.com/docs/plugins/api/SectionNode/)
- [ShapeWithTextNode](https://developers.figma.com/docs/plugins/api/ShapeWithTextNode/)
- [SlideNode](https://developers.figma.com/docs/plugins/api/SlideNode/)
- [SlotNode](https://developers.figma.com/docs/plugins/api/SlotNode/)
- [StampNode](https://developers.figma.com/docs/plugins/api/StampNode/)
- [StarNode](https://developers.figma.com/docs/plugins/api/StarNode/)
- [StickyNode](https://developers.figma.com/docs/plugins/api/StickyNode/)
- [TableCellNode](https://developers.figma.com/docs/plugins/api/TableCellNode/)
- [TableNode](https://developers.figma.com/docs/plugins/api/TableNode/)
- [TextNode](https://developers.figma.com/docs/plugins/api/TextNode/)
- [TextPathNode](https://developers.figma.com/docs/plugins/api/TextPathNode/)
- [TextSublayerNode](https://developers.figma.com/docs/plugins/api/TextSublayer/)
- [VectorNode](https://developers.figma.com/docs/plugins/api/VectorNode/)
- [WashiTapeNode](https://developers.figma.com/docs/plugins/api/WashiTapeNode/)

Sets the [`PaintStyle`](https://developers.figma.com/docs/plugins/api/PaintStyle/) that the [`fills`](https://developers.figma.com/docs/plugins/api/properties/nodes-fills/) property of this node is linked to.

------------------------------------------------------------------------

------------------------------------------------------------------------

### strokeStyleId: string

Supported on:

- [BooleanOperationNode](https://developers.figma.com/docs/plugins/api/BooleanOperationNode/)
- [ComponentNode](https://developers.figma.com/docs/plugins/api/ComponentNode/)
- [ComponentSetNode](https://developers.figma.com/docs/plugins/api/ComponentSetNode/)
- [ConnectorNode](https://developers.figma.com/docs/plugins/api/ConnectorNode/)
- [EllipseNode](https://developers.figma.com/docs/plugins/api/EllipseNode/)
- [FrameNode](https://developers.figma.com/docs/plugins/api/FrameNode/)
- [HighlightNode](https://developers.figma.com/docs/plugins/api/HighlightNode/)
- [InstanceNode](https://developers.figma.com/docs/plugins/api/InstanceNode/)
- [LineNode](https://developers.figma.com/docs/plugins/api/LineNode/)
- [PolygonNode](https://developers.figma.com/docs/plugins/api/PolygonNode/)
- [RectangleNode](https://developers.figma.com/docs/plugins/api/RectangleNode/)
- [SectionNode](https://developers.figma.com/docs/plugins/api/SectionNode/)
- [ShapeWithTextNode](https://developers.figma.com/docs/plugins/api/ShapeWithTextNode/)
- [SlideNode](https://developers.figma.com/docs/plugins/api/SlideNode/)
- [SlotNode](https://developers.figma.com/docs/plugins/api/SlotNode/)
- [StampNode](https://developers.figma.com/docs/plugins/api/StampNode/)
- [StarNode](https://developers.figma.com/docs/plugins/api/StarNode/)
- [TextNode](https://developers.figma.com/docs/plugins/api/TextNode/)
- [TextPathNode](https://developers.figma.com/docs/plugins/api/TextPathNode/)
- [VectorNode](https://developers.figma.com/docs/plugins/api/VectorNode/)
- [WashiTapeNode](https://developers.figma.com/docs/plugins/api/WashiTapeNode/)

The id of the [`PaintStyle`](https://developers.figma.com/docs/plugins/api/PaintStyle/) object that the [`strokes`](https://developers.figma.com/docs/plugins/api/properties/nodes-strokes/) property of this node is linked to.

If the manifest contains`"documentAccess": "dynamic-page"`, this property is read-only. Use `setStrokeStyleIdAsync` to update the style.

------------------------------------------------------------------------

------------------------------------------------------------------------

### setStrokeStyleIdAsync(styleId: string): Promise\<void\>

Supported on:

- [BooleanOperationNode](https://developers.figma.com/docs/plugins/api/BooleanOperationNode/)
- [ComponentNode](https://developers.figma.com/docs/plugins/api/ComponentNode/)
- [ComponentSetNode](https://developers.figma.com/docs/plugins/api/ComponentSetNode/)
- [ConnectorNode](https://developers.figma.com/docs/plugins/api/ConnectorNode/)
- [EllipseNode](https://developers.figma.com/docs/plugins/api/EllipseNode/)
- [FrameNode](https://developers.figma.com/docs/plugins/api/FrameNode/)
- [HighlightNode](https://developers.figma.com/docs/plugins/api/HighlightNode/)
- [InstanceNode](https://developers.figma.com/docs/plugins/api/InstanceNode/)
- [LineNode](https://developers.figma.com/docs/plugins/api/LineNode/)
- [PolygonNode](https://developers.figma.com/docs/plugins/api/PolygonNode/)
- [RectangleNode](https://developers.figma.com/docs/plugins/api/RectangleNode/)
- [SectionNode](https://developers.figma.com/docs/plugins/api/SectionNode/)
- [ShapeWithTextNode](https://developers.figma.com/docs/plugins/api/ShapeWithTextNode/)
- [SlideNode](https://developers.figma.com/docs/plugins/api/SlideNode/)
- [SlotNode](https://developers.figma.com/docs/plugins/api/SlotNode/)
- [StampNode](https://developers.figma.com/docs/plugins/api/StampNode/)
- [StarNode](https://developers.figma.com/docs/plugins/api/StarNode/)
- [TextNode](https://developers.figma.com/docs/plugins/api/TextNode/)
- [TextPathNode](https://developers.figma.com/docs/plugins/api/TextPathNode/)
- [VectorNode](https://developers.figma.com/docs/plugins/api/VectorNode/)
- [WashiTapeNode](https://developers.figma.com/docs/plugins/api/WashiTapeNode/)

Set the [`PaintStyle`](https://developers.figma.com/docs/plugins/api/PaintStyle/) that the [`strokes`](https://developers.figma.com/docs/plugins/api/properties/nodes-strokes/) property of this node is linked to.

------------------------------------------------------------------------

------------------------------------------------------------------------

### effectStyleId: string

Supported on:

- [BooleanOperationNode](https://developers.figma.com/docs/plugins/api/BooleanOperationNode/)
- [ComponentNode](https://developers.figma.com/docs/plugins/api/ComponentNode/)
- [ComponentSetNode](https://developers.figma.com/docs/plugins/api/ComponentSetNode/)
- [EllipseNode](https://developers.figma.com/docs/plugins/api/EllipseNode/)
- [FrameNode](https://developers.figma.com/docs/plugins/api/FrameNode/)
- [GroupNode](https://developers.figma.com/docs/plugins/api/GroupNode/)
- [HighlightNode](https://developers.figma.com/docs/plugins/api/HighlightNode/)
- [InstanceNode](https://developers.figma.com/docs/plugins/api/InstanceNode/)
- [LineNode](https://developers.figma.com/docs/plugins/api/LineNode/)
- [PolygonNode](https://developers.figma.com/docs/plugins/api/PolygonNode/)
- [RectangleNode](https://developers.figma.com/docs/plugins/api/RectangleNode/)
- [SlideNode](https://developers.figma.com/docs/plugins/api/SlideNode/)
- [SlotNode](https://developers.figma.com/docs/plugins/api/SlotNode/)
- [StampNode](https://developers.figma.com/docs/plugins/api/StampNode/)
- [StarNode](https://developers.figma.com/docs/plugins/api/StarNode/)
- [TextNode](https://developers.figma.com/docs/plugins/api/TextNode/)
- [TextPathNode](https://developers.figma.com/docs/plugins/api/TextPathNode/)
- [TransformGroupNode](https://developers.figma.com/docs/plugins/api/TransformGroupNode/)
- [VectorNode](https://developers.figma.com/docs/plugins/api/VectorNode/)
- [WashiTapeNode](https://developers.figma.com/docs/plugins/api/WashiTapeNode/)

The id of the [`EffectStyle`](https://developers.figma.com/docs/plugins/api/EffectStyle/) object that the properties of this node are linked to.

If the manifest contains`"documentAccess": "dynamic-page"`, this property is read-only. Use `setEffectStyleIdAsync` to update the style.

------------------------------------------------------------------------

------------------------------------------------------------------------

### setEffectStyleIdAsync(styleId: string): Promise\<void\>

Supported on:

- [BooleanOperationNode](https://developers.figma.com/docs/plugins/api/BooleanOperationNode/)
- [ComponentNode](https://developers.figma.com/docs/plugins/api/ComponentNode/)
- [ComponentSetNode](https://developers.figma.com/docs/plugins/api/ComponentSetNode/)
- [EllipseNode](https://developers.figma.com/docs/plugins/api/EllipseNode/)
- [FrameNode](https://developers.figma.com/docs/plugins/api/FrameNode/)
- [GroupNode](https://developers.figma.com/docs/plugins/api/GroupNode/)
- [HighlightNode](https://developers.figma.com/docs/plugins/api/HighlightNode/)
- [InstanceNode](https://developers.figma.com/docs/plugins/api/InstanceNode/)
- [LineNode](https://developers.figma.com/docs/plugins/api/LineNode/)
- [PolygonNode](https://developers.figma.com/docs/plugins/api/PolygonNode/)
- [RectangleNode](https://developers.figma.com/docs/plugins/api/RectangleNode/)
- [SlideNode](https://developers.figma.com/docs/plugins/api/SlideNode/)
- [SlotNode](https://developers.figma.com/docs/plugins/api/SlotNode/)
- [StampNode](https://developers.figma.com/docs/plugins/api/StampNode/)
- [StarNode](https://developers.figma.com/docs/plugins/api/StarNode/)
- [TextNode](https://developers.figma.com/docs/plugins/api/TextNode/)
- [TextPathNode](https://developers.figma.com/docs/plugins/api/TextPathNode/)
- [TransformGroupNode](https://developers.figma.com/docs/plugins/api/TransformGroupNode/)
- [VectorNode](https://developers.figma.com/docs/plugins/api/VectorNode/)
- [WashiTapeNode](https://developers.figma.com/docs/plugins/api/WashiTapeNode/)

Set the [`EffectStyle`](https://developers.figma.com/docs/plugins/api/EffectStyle/) that the properties of this node are linked to.

------------------------------------------------------------------------

------------------------------------------------------------------------

### gridStyleId: string

Supported on:

- [ComponentNode](https://developers.figma.com/docs/plugins/api/ComponentNode/)
- [ComponentSetNode](https://developers.figma.com/docs/plugins/api/ComponentSetNode/)
- [FrameNode](https://developers.figma.com/docs/plugins/api/FrameNode/)
- [InstanceNode](https://developers.figma.com/docs/plugins/api/InstanceNode/)
- [SlideNode](https://developers.figma.com/docs/plugins/api/SlideNode/)
- [SlotNode](https://developers.figma.com/docs/plugins/api/SlotNode/)

The id of the [`GridStyle`](https://developers.figma.com/docs/plugins/api/GridStyle/) object that the [`layoutGrids`](https://developers.figma.com/docs/plugins/api/node-properties/#layoutgrids) property of this node is linked to.

If the manifest contains`"documentAccess": "dynamic-page"`, this property is read-only. Use `setGridStyleIdAsync` to update the style.

------------------------------------------------------------------------

------------------------------------------------------------------------

### setGridStyleIdAsync(styleId: string): Promise\<void\>

Supported on:

- [ComponentNode](https://developers.figma.com/docs/plugins/api/ComponentNode/)
- [ComponentSetNode](https://developers.figma.com/docs/plugins/api/ComponentSetNode/)
- [FrameNode](https://developers.figma.com/docs/plugins/api/FrameNode/)
- [InstanceNode](https://developers.figma.com/docs/plugins/api/InstanceNode/)
- [SlideNode](https://developers.figma.com/docs/plugins/api/SlideNode/)
- [SlotNode](https://developers.figma.com/docs/plugins/api/SlotNode/)

Set the [`GridStyle`](https://developers.figma.com/docs/plugins/api/GridStyle/) that the [`layoutGrids`](https://developers.figma.com/docs/plugins/api/node-properties/#layoutgrids) property of this node is linked to.

------------------------------------------------------------------------

------------------------------------------------------------------------

### getRangeFills(start: number, end: number): [Paint](https://developers.figma.com/docs/plugins/api/Paint/)\[\] \| [figma.mixed](https://developers.figma.com/docs/plugins/api/properties/figma-mixed/)

Supported on:

- [TextNode](https://developers.figma.com/docs/plugins/api/TextNode/)
- [TextPathNode](https://developers.figma.com/docs/plugins/api/TextPathNode/)
- [TextSublayerNode](https://developers.figma.com/docs/plugins/api/TextSublayer/)

Get the `fills` from characters in range `start` (inclusive) to `end` (exclusive).

------------------------------------------------------------------------

------------------------------------------------------------------------

### setRangeFills(start: number, end: number, value: [Paint](https://developers.figma.com/docs/plugins/api/Paint/)\[\]): void

Supported on:

- [TextNode](https://developers.figma.com/docs/plugins/api/TextNode/)
- [TextPathNode](https://developers.figma.com/docs/plugins/api/TextPathNode/)
- [TextSublayerNode](https://developers.figma.com/docs/plugins/api/TextSublayer/)

Set the `fills` from characters in range `start` (inclusive) to `end` (exclusive). Requires font to be loaded.

Can be bound to color variables by using [`setBoundVariableForPaint`](https://developers.figma.com/docs/plugins/api/figma-variables/#setboundvariableforpaint) on one or more of the provided `Paint`s

------------------------------------------------------------------------

------------------------------------------------------------------------

### getRangeFillStyleId(start: number, end: number): string \| [figma.mixed](https://developers.figma.com/docs/plugins/api/properties/figma-mixed/)

Supported on:

- [TextNode](https://developers.figma.com/docs/plugins/api/TextNode/)
- [TextPathNode](https://developers.figma.com/docs/plugins/api/TextPathNode/)
- [TextSublayerNode](https://developers.figma.com/docs/plugins/api/TextSublayer/)

Get the `fillStyleId` from characters in range `start` (inclusive) to `end` (exclusive).

------------------------------------------------------------------------

------------------------------------------------------------------------

### setRangeFillStyleIdAsync(start: number, end: number, styleId: string): Promise\<void\>

Supported on:

- [TextNode](https://developers.figma.com/docs/plugins/api/TextNode/)
- [TextPathNode](https://developers.figma.com/docs/plugins/api/TextPathNode/)
- [TextSublayerNode](https://developers.figma.com/docs/plugins/api/TextSublayer/)

Set the provided [`PaintStyle`](https://developers.figma.com/docs/plugins/api/PaintStyle/) as a fill to characters in range `start` (inclusive) to `end` (exclusive).

------------------------------------------------------------------------

---

> Source: <https://developers.figma.com/docs/plugins/api/properties/nodes-boundvariables/>

# boundVariables

The variables bound to a particular field on this node. Please see the [Working with Variables](https://developers.figma.com/docs/plugins/working-with-variables/) guide for how to get and set variable bindings.

Supported on:

- [BooleanOperationNode](https://developers.figma.com/docs/plugins/api/BooleanOperationNode/)
- [CodeBlockNode](https://developers.figma.com/docs/plugins/api/CodeBlockNode/)
- [ComponentNode](https://developers.figma.com/docs/plugins/api/ComponentNode/)
- [ComponentSetNode](https://developers.figma.com/docs/plugins/api/ComponentSetNode/)
- [ConnectorNode](https://developers.figma.com/docs/plugins/api/ConnectorNode/)
- [EllipseNode](https://developers.figma.com/docs/plugins/api/EllipseNode/)
- [EmbedNode](https://developers.figma.com/docs/plugins/api/EmbedNode/)
- [FrameNode](https://developers.figma.com/docs/plugins/api/FrameNode/)
- [GroupNode](https://developers.figma.com/docs/plugins/api/GroupNode/)
- [HighlightNode](https://developers.figma.com/docs/plugins/api/HighlightNode/)
- [InstanceNode](https://developers.figma.com/docs/plugins/api/InstanceNode/)
- [InteractiveSlideElementNode](https://developers.figma.com/docs/plugins/api/InteractiveSlideElementNode/)
- [LineNode](https://developers.figma.com/docs/plugins/api/LineNode/)
- [LinkUnfurlNode](https://developers.figma.com/docs/plugins/api/LinkUnfurlNode/)
- [MediaNode](https://developers.figma.com/docs/plugins/api/MediaNode/)
- [PolygonNode](https://developers.figma.com/docs/plugins/api/PolygonNode/)
- [RectangleNode](https://developers.figma.com/docs/plugins/api/RectangleNode/)
- [SectionNode](https://developers.figma.com/docs/plugins/api/SectionNode/)
- [ShapeWithTextNode](https://developers.figma.com/docs/plugins/api/ShapeWithTextNode/)
- [SliceNode](https://developers.figma.com/docs/plugins/api/SliceNode/)
- [SlideGridNode](https://developers.figma.com/docs/plugins/api/SlideGridNode/)
- [SlideNode](https://developers.figma.com/docs/plugins/api/SlideNode/)
- [SlideRowNode](https://developers.figma.com/docs/plugins/api/SlideRowNode/)
- [SlotNode](https://developers.figma.com/docs/plugins/api/SlotNode/)
- [StampNode](https://developers.figma.com/docs/plugins/api/StampNode/)
- [StarNode](https://developers.figma.com/docs/plugins/api/StarNode/)
- [StickyNode](https://developers.figma.com/docs/plugins/api/StickyNode/)
- [TableNode](https://developers.figma.com/docs/plugins/api/TableNode/)
- [TextNode](https://developers.figma.com/docs/plugins/api/TextNode/)
- [TextPathNode](https://developers.figma.com/docs/plugins/api/TextPathNode/)
- [TransformGroupNode](https://developers.figma.com/docs/plugins/api/TransformGroupNode/)
- [VectorNode](https://developers.figma.com/docs/plugins/api/VectorNode/)
- [WashiTapeNode](https://developers.figma.com/docs/plugins/api/WashiTapeNode/)
- [WidgetNode](https://developers.figma.com/docs/plugins/api/WidgetNode/)

## Signature

### [boundVariables](https://developers.figma.com/docs/plugins/api/properties/nodes-boundvariables/)?: { readonly \[field in [VariableBindableNodeField](https://developers.figma.com/docs/plugins/api/VariableBindableNodeField/)\]?: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/)} & { readonly \[field in [VariableBindableTextField](https://developers.figma.com/docs/plugins/api/VariableBindableTextField/)\]?: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/)\[\]} & { fills?: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/)\[\]; strokes?: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/)\[\]; effects?: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/)\[\]; layoutGrids?: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/)\[\]; componentProperties?: { \[propertyName: string\]: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/) }; textRangeFills?: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/)\[\] } \[readonly\]

## Remarks

On nodes with independent corner radii (e.g. rectangles, frames), a `cornerRadius` binding sets all four corners and appears in `boundVariables` as `topLeftRadius`/`topRightRadius`/`bottomLeftRadius`/`bottomRightRadius` rather than `cornerRadius`; elsewhere it appears as `cornerRadius`.

---

> Source: <https://developers.figma.com/docs/plugins/api/properties/nodes-setboundvariable/>

# setBoundVariable

Binds the provided `field` on this node to the given variable. Please see the [Working with Variables](https://developers.figma.com/docs/plugins/working-with-variables/) guide for how to get and set variable bindings.

If `null` is provided as the variable, the given `field` will be unbound from any variables.

Supported on:

- [BooleanOperationNode](https://developers.figma.com/docs/plugins/api/BooleanOperationNode/)
- [CodeBlockNode](https://developers.figma.com/docs/plugins/api/CodeBlockNode/)
- [ComponentNode](https://developers.figma.com/docs/plugins/api/ComponentNode/)
- [ComponentSetNode](https://developers.figma.com/docs/plugins/api/ComponentSetNode/)
- [ConnectorNode](https://developers.figma.com/docs/plugins/api/ConnectorNode/)
- [EllipseNode](https://developers.figma.com/docs/plugins/api/EllipseNode/)
- [EmbedNode](https://developers.figma.com/docs/plugins/api/EmbedNode/)
- [FrameNode](https://developers.figma.com/docs/plugins/api/FrameNode/)
- [GroupNode](https://developers.figma.com/docs/plugins/api/GroupNode/)
- [HighlightNode](https://developers.figma.com/docs/plugins/api/HighlightNode/)
- [InstanceNode](https://developers.figma.com/docs/plugins/api/InstanceNode/)
- [InteractiveSlideElementNode](https://developers.figma.com/docs/plugins/api/InteractiveSlideElementNode/)
- [LineNode](https://developers.figma.com/docs/plugins/api/LineNode/)
- [LinkUnfurlNode](https://developers.figma.com/docs/plugins/api/LinkUnfurlNode/)
- [MediaNode](https://developers.figma.com/docs/plugins/api/MediaNode/)
- [PolygonNode](https://developers.figma.com/docs/plugins/api/PolygonNode/)
- [RectangleNode](https://developers.figma.com/docs/plugins/api/RectangleNode/)
- [SectionNode](https://developers.figma.com/docs/plugins/api/SectionNode/)
- [ShapeWithTextNode](https://developers.figma.com/docs/plugins/api/ShapeWithTextNode/)
- [SliceNode](https://developers.figma.com/docs/plugins/api/SliceNode/)
- [SlideGridNode](https://developers.figma.com/docs/plugins/api/SlideGridNode/)
- [SlideNode](https://developers.figma.com/docs/plugins/api/SlideNode/)
- [SlideRowNode](https://developers.figma.com/docs/plugins/api/SlideRowNode/)
- [SlotNode](https://developers.figma.com/docs/plugins/api/SlotNode/)
- [StampNode](https://developers.figma.com/docs/plugins/api/StampNode/)
- [StarNode](https://developers.figma.com/docs/plugins/api/StarNode/)
- [StickyNode](https://developers.figma.com/docs/plugins/api/StickyNode/)
- [TableNode](https://developers.figma.com/docs/plugins/api/TableNode/)
- [TextNode](https://developers.figma.com/docs/plugins/api/TextNode/)
- [TextPathNode](https://developers.figma.com/docs/plugins/api/TextPathNode/)
- [TransformGroupNode](https://developers.figma.com/docs/plugins/api/TransformGroupNode/)
- [VectorNode](https://developers.figma.com/docs/plugins/api/VectorNode/)
- [WashiTapeNode](https://developers.figma.com/docs/plugins/api/WashiTapeNode/)
- [WidgetNode](https://developers.figma.com/docs/plugins/api/WidgetNode/)

## Signature

### setBoundVariable(field: [VariableBindableNodeField](https://developers.figma.com/docs/plugins/api/VariableBindableNodeField/) \| [VariableBindableTextField](https://developers.figma.com/docs/plugins/api/VariableBindableTextField/), variable: [Variable](https://developers.figma.com/docs/plugins/api/Variable/) \| null): void

## Parameters

### field

The field to bind the variable to.

### variable

The variable to bind to the field. If `null` is provided, the field will be unbound from any variables. Make sure to pass a Variable object or null; passing a variable ID is deprecated.

---

> Source: <https://developers.figma.com/docs/plugins/api/properties/nodes-inferredvariables/>

# inferredVariables

An object, keyed by field, returning any variables that match the raw value of that field for the mode of the node (or the default variable value if no mode is set)

Supported on:

- [BooleanOperationNode](https://developers.figma.com/docs/plugins/api/BooleanOperationNode/)
- [CodeBlockNode](https://developers.figma.com/docs/plugins/api/CodeBlockNode/)
- [ComponentNode](https://developers.figma.com/docs/plugins/api/ComponentNode/)
- [ComponentSetNode](https://developers.figma.com/docs/plugins/api/ComponentSetNode/)
- [ConnectorNode](https://developers.figma.com/docs/plugins/api/ConnectorNode/)
- [EllipseNode](https://developers.figma.com/docs/plugins/api/EllipseNode/)
- [EmbedNode](https://developers.figma.com/docs/plugins/api/EmbedNode/)
- [FrameNode](https://developers.figma.com/docs/plugins/api/FrameNode/)
- [GroupNode](https://developers.figma.com/docs/plugins/api/GroupNode/)
- [HighlightNode](https://developers.figma.com/docs/plugins/api/HighlightNode/)
- [InstanceNode](https://developers.figma.com/docs/plugins/api/InstanceNode/)
- [InteractiveSlideElementNode](https://developers.figma.com/docs/plugins/api/InteractiveSlideElementNode/)
- [LineNode](https://developers.figma.com/docs/plugins/api/LineNode/)
- [LinkUnfurlNode](https://developers.figma.com/docs/plugins/api/LinkUnfurlNode/)
- [MediaNode](https://developers.figma.com/docs/plugins/api/MediaNode/)
- [PolygonNode](https://developers.figma.com/docs/plugins/api/PolygonNode/)
- [RectangleNode](https://developers.figma.com/docs/plugins/api/RectangleNode/)
- [SectionNode](https://developers.figma.com/docs/plugins/api/SectionNode/)
- [ShapeWithTextNode](https://developers.figma.com/docs/plugins/api/ShapeWithTextNode/)
- [SliceNode](https://developers.figma.com/docs/plugins/api/SliceNode/)
- [SlideGridNode](https://developers.figma.com/docs/plugins/api/SlideGridNode/)
- [SlideNode](https://developers.figma.com/docs/plugins/api/SlideNode/)
- [SlideRowNode](https://developers.figma.com/docs/plugins/api/SlideRowNode/)
- [SlotNode](https://developers.figma.com/docs/plugins/api/SlotNode/)
- [StampNode](https://developers.figma.com/docs/plugins/api/StampNode/)
- [StarNode](https://developers.figma.com/docs/plugins/api/StarNode/)
- [StickyNode](https://developers.figma.com/docs/plugins/api/StickyNode/)
- [TableNode](https://developers.figma.com/docs/plugins/api/TableNode/)
- [TextNode](https://developers.figma.com/docs/plugins/api/TextNode/)
- [TextPathNode](https://developers.figma.com/docs/plugins/api/TextPathNode/)
- [TransformGroupNode](https://developers.figma.com/docs/plugins/api/TransformGroupNode/)
- [VectorNode](https://developers.figma.com/docs/plugins/api/VectorNode/)
- [WashiTapeNode](https://developers.figma.com/docs/plugins/api/WashiTapeNode/)
- [WidgetNode](https://developers.figma.com/docs/plugins/api/WidgetNode/)

## Signature

### [inferredVariables](https://developers.figma.com/docs/plugins/api/properties/nodes-inferredvariables/)?: { readonly \[field in [VariableBindableNodeField](https://developers.figma.com/docs/plugins/api/VariableBindableNodeField/)\]?: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/)\[\]} & { fills?: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/)\[\]\[\]; strokes?: [VariableAlias](https://developers.figma.com/docs/plugins/api/VariableAlias/)\[\]\[\] } \[readonly\]

## Remarks

Inferred variables are only returned for a field when it is not using a [bound variable](https://developers.figma.com/docs/plugins/api/node-properties/#boundvariables).

Variables can be inferred from:

- The collections of variables used in the file
- Variables from subscribed libraries, provided the variable is used in the file

Variables can only be inferred when there is a single variable that matches the raw value used for the scope of the variable.

- i.e. For a property set to width: 100px, where there are two variables set to a value of 100 with the default scope, a value cannot be inferred as there are two matches.
- i.e. For a property set to width: 100px, where there is a variable set to 100 with a scope of "Width and height" and a variable set to 100 with a scope of "Corner radius", a value can be inferred as there is a single match for the given scope.

Inferred variables for fills and strokes return a list of results where the index matches that of node.fills and node.strokes.

- i.e. node.inferredVariables.fills\[0\] holds the inferred variables for node.fills\[0\]

---

> Source: <https://developers.figma.com/docs/plugins/api/properties/nodes-resolvedvariablemodes/>

# resolvedVariableModes

The resolved mode for this node for each variable collection in this file.

Supported on:

- [BooleanOperationNode](https://developers.figma.com/docs/plugins/api/BooleanOperationNode/)
- [CodeBlockNode](https://developers.figma.com/docs/plugins/api/CodeBlockNode/)
- [ComponentNode](https://developers.figma.com/docs/plugins/api/ComponentNode/)
- [ComponentSetNode](https://developers.figma.com/docs/plugins/api/ComponentSetNode/)
- [ConnectorNode](https://developers.figma.com/docs/plugins/api/ConnectorNode/)
- [EllipseNode](https://developers.figma.com/docs/plugins/api/EllipseNode/)
- [EmbedNode](https://developers.figma.com/docs/plugins/api/EmbedNode/)
- [FrameNode](https://developers.figma.com/docs/plugins/api/FrameNode/)
- [GroupNode](https://developers.figma.com/docs/plugins/api/GroupNode/)
- [HighlightNode](https://developers.figma.com/docs/plugins/api/HighlightNode/)
- [InstanceNode](https://developers.figma.com/docs/plugins/api/InstanceNode/)
- [InteractiveSlideElementNode](https://developers.figma.com/docs/plugins/api/InteractiveSlideElementNode/)
- [LineNode](https://developers.figma.com/docs/plugins/api/LineNode/)
- [LinkUnfurlNode](https://developers.figma.com/docs/plugins/api/LinkUnfurlNode/)
- [MediaNode](https://developers.figma.com/docs/plugins/api/MediaNode/)
- [PolygonNode](https://developers.figma.com/docs/plugins/api/PolygonNode/)
- [RectangleNode](https://developers.figma.com/docs/plugins/api/RectangleNode/)
- [SectionNode](https://developers.figma.com/docs/plugins/api/SectionNode/)
- [ShapeWithTextNode](https://developers.figma.com/docs/plugins/api/ShapeWithTextNode/)
- [SliceNode](https://developers.figma.com/docs/plugins/api/SliceNode/)
- [SlideGridNode](https://developers.figma.com/docs/plugins/api/SlideGridNode/)
- [SlideNode](https://developers.figma.com/docs/plugins/api/SlideNode/)
- [SlideRowNode](https://developers.figma.com/docs/plugins/api/SlideRowNode/)
- [SlotNode](https://developers.figma.com/docs/plugins/api/SlotNode/)
- [StampNode](https://developers.figma.com/docs/plugins/api/StampNode/)
- [StarNode](https://developers.figma.com/docs/plugins/api/StarNode/)
- [StickyNode](https://developers.figma.com/docs/plugins/api/StickyNode/)
- [TableNode](https://developers.figma.com/docs/plugins/api/TableNode/)
- [TextNode](https://developers.figma.com/docs/plugins/api/TextNode/)
- [TextPathNode](https://developers.figma.com/docs/plugins/api/TextPathNode/)
- [TransformGroupNode](https://developers.figma.com/docs/plugins/api/TransformGroupNode/)
- [VectorNode](https://developers.figma.com/docs/plugins/api/VectorNode/)
- [WashiTapeNode](https://developers.figma.com/docs/plugins/api/WashiTapeNode/)
- [WidgetNode](https://developers.figma.com/docs/plugins/api/WidgetNode/)

## Signature

### [resolvedVariableModes](https://developers.figma.com/docs/plugins/api/properties/nodes-resolvedvariablemodes/): { \[collectionId: string\]: string }

## Remarks

The set of resolved modes on a node includes the explicitly set modes on the node, as well as the explicitly set modes on ancestors of the node. By default, nodes [automatically inherit](https://help.figma.com/hc/en-us/articles/15343816063383-Modes-for-variables#Auto_mode) the modes of their parents.

explicitVariableModes vs resolvedVariableModes

``` ts
// Create two collections with two modes each
const collection1 = figma.variables.createVariableCollection("Collection 1")
const collection1Mode1Id = collection1.modes[0].modeId
const collection1Mode2Id = collection1.addMode('Mode 2')
const collection2 = figma.variables.createVariableCollection("Collection 2")
const collection2Mode1Id = collection2.modes[0].modeId
const collection2Mode2Id = collection2.addMode('Mode 2')

const parentFrame = figma.createFrame()
const childFrame = figma.createFrame()
parentFrame.appendChild(childFrame)

parentFrame.setExplicitVariableModeForCollection(
  collection1,
  collection1Mode2Id
)
childFrame.setExplicitVariableModeForCollection(
  collection2,
  collection2Mode1Id
)

// Example output (only collection2 is present):
// { 'VariableCollectionId:1:3': '1:2' }
console.log(childFrame.explicitVariableModes);

// Example output (both collections are present):
// { 'VariableCollectionId:1:2': '1:1', 'VariableCollectionId:1:3': '1:2' }
console.log(childFrame.resolvedVariableModes);
```

---

> Source: <https://developers.figma.com/docs/plugins/api/properties/nodes-fills/>

# fills

The paints used to fill the area of the shape. For help on how to change this value, see [Editing Properties](https://developers.figma.com/docs/plugins/editing-properties/).

Supported on:

- [BooleanOperationNode](https://developers.figma.com/docs/plugins/api/BooleanOperationNode/)
- [ComponentNode](https://developers.figma.com/docs/plugins/api/ComponentNode/)
- [ComponentSetNode](https://developers.figma.com/docs/plugins/api/ComponentSetNode/)
- [EllipseNode](https://developers.figma.com/docs/plugins/api/EllipseNode/)
- [FrameNode](https://developers.figma.com/docs/plugins/api/FrameNode/)
- [HighlightNode](https://developers.figma.com/docs/plugins/api/HighlightNode/)
- [InstanceNode](https://developers.figma.com/docs/plugins/api/InstanceNode/)
- [LineNode](https://developers.figma.com/docs/plugins/api/LineNode/)
- [PolygonNode](https://developers.figma.com/docs/plugins/api/PolygonNode/)
- [RectangleNode](https://developers.figma.com/docs/plugins/api/RectangleNode/)
- [SectionNode](https://developers.figma.com/docs/plugins/api/SectionNode/)
- [ShapeWithTextNode](https://developers.figma.com/docs/plugins/api/ShapeWithTextNode/)
- [SlideNode](https://developers.figma.com/docs/plugins/api/SlideNode/)
- [SlotNode](https://developers.figma.com/docs/plugins/api/SlotNode/)
- [StampNode](https://developers.figma.com/docs/plugins/api/StampNode/)
- [StarNode](https://developers.figma.com/docs/plugins/api/StarNode/)
- [StickyNode](https://developers.figma.com/docs/plugins/api/StickyNode/)
- [TableCellNode](https://developers.figma.com/docs/plugins/api/TableCellNode/)
- [TableNode](https://developers.figma.com/docs/plugins/api/TableNode/)
- [TextNode](https://developers.figma.com/docs/plugins/api/TextNode/)
- [TextPathNode](https://developers.figma.com/docs/plugins/api/TextPathNode/)
- [TextSublayerNode](https://developers.figma.com/docs/plugins/api/TextSublayer/)
- [VectorNode](https://developers.figma.com/docs/plugins/api/VectorNode/)
- [WashiTapeNode](https://developers.figma.com/docs/plugins/api/WashiTapeNode/)

## Signature

### [fills](https://developers.figma.com/docs/plugins/api/properties/nodes-fills/): ReadonlyArray\<[Paint](https://developers.figma.com/docs/plugins/api/Paint/)\> \| [figma.mixed](https://developers.figma.com/docs/plugins/api/properties/figma-mixed/)

## Remarks

This property can return [`figma.mixed`](https://developers.figma.com/docs/plugins/api/properties/figma-mixed/) if the node has multiple sets of fills. Text nodes can have multiple sets of fills if some characters are colored differently than others.

Use [`solidPaint`](https://developers.figma.com/docs/plugins/api/properties/figma-util-solidpaint/) to create solid paint fills with CSS color strings.

Page nodes have a [`backgrounds`](https://developers.figma.com/docs/plugins/api/PageNode/#backgrounds) property instead of a `fills` property.

In order to set pattern fills, you must use the [`setFillsAsync`](https://developers.figma.com/docs/plugins/api/node-properties/#setfillsasync) method to ensure that the source node of the pattern is loaded first.
