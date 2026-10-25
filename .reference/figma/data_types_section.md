# Source: https://developers.figma.com/docs/plugins/api/data-types/

<!-- Vendored snapshot of the Figma Plugin API docs. Captured 2026-08-04. -->

*Captured 2026-08-04.*

> **This file replaces the March 2026 snapshot**, which was a ~33 KB dump dominated by
> `TableNode` (a FigJam type this plugin never touches) and contained no definitions
> for `VariableValue`, `VariableAlias`, `LineHeight`, `LetterSpacing` or `FontName`.
> It is now the *index* of data types; the types that matter here are vendored in
> `types_variables.md`, `types_text.md` and `types_paint.md`.

---
# Data Types

To assist you with writing your plugin code, we provide a TypeScript typings file for the entire Plugin API.

The typings file is a collection of type and interface declarations you can use for type checking. These declarations represent groups of related properties, parameters, and other data sets you’ll interact with.

You’ll see **types** and **interfaces** in a few places:

- To get and set properties on nodes or global objects
- Passed as parameters in a function
- Returned by a method

Types and interfaces come in varying levels of complexity.

- Choose one option from a list of values, like [`BlendMode`](https://developers.figma.com/docs/plugins/api/BlendMode/).
- Support a mixture of required and optional properties. You’ll see a “?” at the end of any optional properties.
- Offer different properties based on the outcome you want to achieve, like [`ConnectorEndpoint`](https://developers.figma.com/docs/plugins/api/ConnectorEndpoint/).
- Support or reference other types and interfaces, like [`Paint`](https://developers.figma.com/docs/plugins/api/Paint/) and [`Effect`](https://developers.figma.com/docs/plugins/api/Effect/).
