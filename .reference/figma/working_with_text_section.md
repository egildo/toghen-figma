# Source: https://developers.figma.com/docs/plugins/working-with-text/

<!-- Vendored snapshot of the Figma Plugin API docs. Captured 2026-08-04. -->

*Captured 2026-08-04.*

> Font loading rule: you must `await figma.loadFontAsync(fontName)` for **every**
> font already on a text node *and* every font you are about to set, before
> mutating `characters` or any text property.

---
# Working with Text

note

**Note:** This guide covers details about using the Plugin API to work with text in Figma, such as loading fonts and handling characters with mixed styles. If you're looking for information about handling rich text in annotation labels and component descriptions, try [Working with Rich Text](https://developers.figma.com/docs/plugins/working-with-rich-text/).

When working with [text nodes](https://developers.figma.com/docs/plugins/api/TextNode/), there are a lot of things to consider:

- Mixed styles
- Loading fonts
- Missing fonts

### Mixed styles

Many text properties can be set on individual characters. For that reason, you will find that many of text properties can return the special value [`figma.mixed`](https://developers.figma.com/docs/plugins/api/properties/figma-mixed/) if there are characters in the text with different values for that property. **Always consider that a text property could have mixed values**.

Suppose there is a text node that contains the text "**hello** world". Below are some properties and functions for retrieving the font name:

Retrieving font name

``` ts
// Output: figma.mixed
textNode.fontName

// Output: { family: 'Inter', style: 'Bold' }
textNode.getRangeFontName(0, 5)

// Output: { family: 'Inter', style: 'Regular' }
textNode.getRangeFontName(5, 11)

// Output: figma.mixed
textNode.getRangeFontName(4, 6)

/*
Output:

[
  {
    characters: "hello",
    start: 0,
    end: 5,
    fontName: { family: 'Inter', style: 'Bold' },
  },
  {
    characters: " world",
    start: 5,
    end: 11,
    fontName: { family: 'Inter', style: 'Regular' },
  }
]
*/
textNode.getStyledTextSegments(['fontName'])
```

In general, we recommend using text properties such as [`fontSize`](https://developers.figma.com/docs/plugins/api/TextNode/#fontsize), [`fontName`](https://developers.figma.com/docs/plugins/api/TextNode/#fontname), etc... when getting / setting styles for the entire text node, or checking if there are mixed values. Use the `getRange*` and `setRange*` functions for getting / setting styles for a specific range of characters. If you want to see what the property values are and which characters they apply to, use [`getStyledTextSegments`](https://developers.figma.com/docs/plugins/api/properties/TextNode-getstyledtextsegments/).

### Loading fonts

The important thing with text is that **changing the content of a text node requires its font to be loaded** and that **fonts are not always available**. If you attempt to change, say, `fontSize` without first loading the font for that text node, the plugin will throw an exception.

When setting the `.fontName` or `.textStyleId` property, you do only need to load the new font. When setting any other property that affects text layout, you need to load all the fonts that the text node already use. This includes the following properties and functions:

- `characters`
- `fontSize`
- `fontName`
- `textStyleId`
- `textCase`
- `textDecoration`
- `letterSpacing`
- `leadingTrim`
- `lineHeight`
- `setRangeFontSize()`
- `setRangeFontName()`
- `setRangeTextCase()`
- `setRangeTextDecoration()`
- `setRangeLetterSpacing()`
- `setRangeLineHeight()`
- `setRangeTextStyleIdAsync()`

You do **not** need to load a font in order to change properties that only affects colors and strokes, such as `.fills`, `.fillStyleId`, `.strokes`, `.strokeWeight`, `.strokeAlign`, `.strokeStyleId`, `.dashPattern`.

Loading a font is done via `figma.loadFontAsync(fontname)`.

For text nodes that contain a single font, you can call `figma.loadFontAsync(node.fontName)`. For nodes that contain multiple fonts you can use the `getRangeAllFontNames` API to get all the fonts that the node is using. As an example:

Loading font names

``` js
await Promise.all(
  node.getRangeAllFontNames(0, node.characters.length)
    .map(figma.loadFontAsync)
)
```

### Missing fonts

You will need to check `text.hasMissingFont` before loading a font. If your plugin works with text, do not to ignore this. While less frequent during testing, it's very common in the real world that your users will attempt to run your plugin in a file with missing fonts.

info

**How text works in Figma (and why you need to load fonts)**

When a user types into a text node or changes one of its properties, we generate a path to represent the text, and store it along with the text node. This way, sharing a file (e.g. to a client) allows them to see the design as-is. *Even if they don't have the fonts installed on their system*! However, this means that even when a text node looks fine, it may not be editable.

This is one of the many subtleties that Figma needs to do to uphold the core value proposition of a cloud tool: that everyone looking at the same file always sees the same thing.

In addition to this, a font file is not always loaded in memory even when it is available from the user's local machine. This is because font files can be big, there could be many of them, and they aren't needed until text is edited. This makes loading them at startup time potentially very expensive. As such, calling `loadFontAsync` is necessary to ensure that the font is available.

### Unloaded fonts vs. missing fonts

It is important to note that unloaded fonts are not related to missing fonts. All fonts are unloaded until your plugin loads them by calling `loadFontAsync`. Missing fonts are the fonts not available to the user. For example, someone created a text node and this user does not have have the font used in this text node installed on their computer.

### Text and variables in Figma

For additional control of styling and layout, you can bind variables to text and substrings. To learn more about typography variables, see [Working with Variables](https://developers.figma.com/docs/plugins/working-with-variables/#typography-variables).
