# FigCraft: the Code section and its generators

- **Date:** 2026-10-21
- **Read:** `storytold/figcraft` at `main`, commit [`35da7b7`](https://github.com/storytold/figcraft/tree/35da7b7cff99ca7f5aba7574d0c72155461e7cf1) (21 October 2026), which is after release **0.8.0** (20 October). The code generator files are identical at the `v0.8.0` tag and at this commit.
- **Against Toghen's measured 0.7.0:** three generator fixes landed after 0.7.0 and are in 0.8.0: a bound colour variable's alpha applied once rather than squared (`018b8166b`), CSS borders per stroke side (`f97789ade`), and multi-line layer names kept inside the "too deep" comment in SwiftUI and Compose (#829).
- **How read:** source, `docs/mcp.md`, `docs/cli.md`, `docs/plugins.md`, `docs/dev-mode-parity.md`, release notes, and the git history of the generator files. FigCraft was not run.


## 1. What the Code section is

It is the Code section of the right panel's **Inspect** tab (the third tab, beside Design and Prototype), the same view Dev Mode uses. It shows the code for the first selected layer, with a language dropdown, a px or rem switch for the web languages, a Copy button, a "Connect to code" section and read-only plugins below it. Drawn by `inspect()` in [`crates/ui-egui/src/right.rs`](https://github.com/storytold/figcraft/blob/35da7b7cff99ca7f5aba7574d0c72155461e7cf1/crates/ui-egui/src/right.rs#L2245) (the dropdown is at about line 2295). The Edit menu also has **Copy as CSS** (`edit.copyAsCss` in `crates/ui-egui/src/menus.rs`), CSS only.

**Targets** (`CodeLang` in [`crates/engine/src/codegen.rs`](https://github.com/storytold/figcraft/blob/35da7b7cff99ca7f5aba7574d0c72155461e7cf1/crates/engine/src/codegen.rs#L55)), in dropdown order:

| Dropdown label | Command id | What it covers |
|---|---|---|
| CSS | `css` | The selected layer only, its own declarations |
| HTML + CSS | `html` | The whole layer tree as nested elements and a stylesheet |
| React | `react` (also `tsx`, `jsx`) | A function component in TSX with its stylesheet |
| Leptos | `leptos` | A Rust `#[component]` with `view!` markup and its stylesheet |
| SwiftUI | `swiftui` | Stacks and shapes with modifiers |
| Compose | `compose` | Jetpack Compose: `Row`, `Column`, `Box`, `Text` with a `Modifier` chain |

**Since when**, by the release that first contains each change:

| Release | Change | Pull request |
|---|---|---|
| 0.2.0 (10 Oct) | CSS, SwiftUI and Compose in the Inspect panel; HTML + CSS for whole frames | #15, #50 |
| 0.3.1 (11 Oct) | Component code: components become parameterised components, instances become calls; React | #80 |
| 0.4.0 (12 Oct) | Code Connect (components linked to real code by template) | #122 |
| 0.6.0 (14 Oct) | Leptos | #240 |
| 0.8.0 (20 Oct) | The three fixes listed in the header | #802/#804, #829 |

**Where each generator lives** (all in the `figcraft-engine` crate):

| Path | Main items |
|---|---|
| [`crates/engine/src/codegen.rs`](https://github.com/storytold/figcraft/blob/35da7b7cff99ca7f5aba7574d0c72155461e7cf1/crates/engine/src/codegen.rs) | `specs()` (the `inspect.code` command), `CodeLang`, `code_for()` (the dispatch), `css()` and `css_decls()` ([L382](https://github.com/storytold/figcraft/blob/35da7b7cff99ca7f5aba7574d0c72155461e7cf1/crates/engine/src/codegen.rs#L382)), `html()` and the `Markup` walker ([L638](https://github.com/storytold/figcraft/blob/35da7b7cff99ca7f5aba7574d0c72155461e7cf1/crates/engine/src/codegen.rs#L638)), `swift()` / `swift_layer()` ([L865](https://github.com/storytold/figcraft/blob/35da7b7cff99ca7f5aba7574d0c72155461e7cf1/crates/engine/src/codegen.rs#L865)), `compose()` / `compose_layer()` / `modifier()` ([L1018](https://github.com/storytold/figcraft/blob/35da7b7cff99ca7f5aba7574d0c72155461e7cf1/crates/engine/src/codegen.rs#L1018)), `Tokens`, `css_var_of()` ([L358](https://github.com/storytold/figcraft/blob/35da7b7cff99ca7f5aba7574d0c72155461e7cf1/crates/engine/src/codegen.rs#L358)), `px_to_rem()` |
| [`crates/engine/src/component_codegen.rs`](https://github.com/storytold/figcraft/blob/35da7b7cff99ca7f5aba7574d0c72155461e7cf1/crates/engine/src/component_codegen.rs) | `inspect.componentCode`, `code()` ([L113](https://github.com/storytold/figcraft/blob/35da7b7cff99ca7f5aba7574d0c72155461e7cf1/crates/engine/src/component_codegen.rs#L113): React, Leptos, SwiftUI and Compose go through it), `Component`, `Param`, `ParamKind`, `usage()` (an instance as a call), `swift_definition()`, `compose_definition()` ([L749](https://github.com/storytold/figcraft/blob/35da7b7cff99ca7f5aba7574d0c72155461e7cf1/crates/engine/src/component_codegen.rs#L749)) |
| [`crates/engine/src/code_connect.rs`](https://github.com/storytold/figcraft/blob/35da7b7cff99ca7f5aba7574d0c72155461e7cf1/crates/engine/src/code_connect.rs) | `codeConnect.set / remove / export / import`, `link()`, `connected_code()`, `render()` (the template filler) |
| [`crates/engine/src/devinspect.rs`](https://github.com/storytold/figcraft/blob/35da7b7cff99ca7f5aba7574d0c72155461e7cf1/crates/engine/src/devinspect.rs#L342) | `bound_variable()`: which variable is bound to a field |
| [`crates/ui-egui/src/dev_mode.rs`](https://github.com/storytold/figcraft/blob/35da7b7cff99ca7f5aba7574d0c72155461e7cf1/crates/ui-egui/src/dev_mode.rs) | The panel side: cached code, the component playground, the Connect to code editor |

The module's own words: the output is "a starting point, not a pixel-exact translation".

## 2. How the document maps to code

### Layout and size

- **Auto layout.** Horizontal becomes a row (`Row`, `HStack`, `flex-direction: row`), vertical a column. No auto layout becomes absolute placement: a `ZStack` with `.offset`, a `Box` with `Modifier.offset`, or `position: absolute; left; top` in HTML.
- **Gap and padding.** Read in every target. Compose writes `Arrangement.spacedBy(gap)` and `.padding(start, top, end, bottom)`; SwiftUI `spacing:` and `.padding(EdgeInsets(...))`.
- **Alignment.** Only the web targets read it (`justify-content`, `align-items`, `align-content` for wrapped lines). SwiftUI always writes `VStack(alignment: .leading)` or `HStack(alignment: .center)`. Compose always writes `verticalAlignment = Alignment.CenterVertically` on a row and nothing on a column. Space-between and the other main-axis modes are lost in the native targets. Wrap is lost there too.
- **Sizing.** The web targets read hug and fill: a hugging side leaves out its width or height, fill becomes flex growth or stretch. **SwiftUI and Compose always write a fixed size** from the layer's current width and height (`Modifier.size(w.dp, h.dp)`, `.frame(width:height:)`). That is why an empty hugging frame comes out as `Modifier.size(300.dp, 0.dp)`.
- **Constraints** (pin left, right, scale…) are not read by any target. Rotation is read by CSS only.

### Look

- **Fills.** CSS and HTML write every visible fill (solid, linear, radial and conic gradients; images and patterns as placeholder URLs). SwiftUI and Compose take the first visible fill only, and a gradient becomes its first stop's colour.
- **Strokes.** CSS writes `border` (per side when the stroke has individual sides). SwiftUI writes a stroked `RoundedRectangle` overlay; Compose `.border(width, color, shape)`. Stroke alignment (inside, outside) is not read.
- **Corner radius.** CSS writes each corner. SwiftUI and Compose take one radius (the uniform one, or the largest corner) for `RoundedCornerShape` or `clipShape`.
- **Effects.** CSS writes every drop and inner shadow (`box-shadow`), layer blur (`filter`), background blur and glass (`backdrop-filter`, a progressive blur is left out). SwiftUI writes the first drop shadow as `.shadow(color, radius, x, y)`. Compose writes the first drop shadow as an elevation, `.shadow(radius.dp, shape)`, losing its colour and offset. Inner shadows and blurs are dropped by both.
- **Opacity** in every target; blend modes in CSS only.

### Text

- CSS reads family, size, weight, italic, line height, letter spacing, alignment, case, decoration and its style, thickness, colour and offset, and leading trim.
- SwiftUI reads characters, family (`.custom(family, size:)`), size, weight and the first fill.
- Compose reads characters, size (`.sp`), weight (`FontWeight.W100`…`W900`) and the first fill. **No font family, line height, letter spacing or alignment.**
- Text styles are not named in any target: the style's resolved values are written.

### Variables and styles

- **Web targets: both a name and a value.** A field bound to a variable becomes `var(--name, value)`, the value being what the layer holds now (`tok()` in `codegen.rs`). HTML, React and Leptos also write a `:root` rule declaring each variable with that value. The fields covered: width, height, gap, each padding, each corner radius, opacity, the first fill, the stroke colour and weights, font family, font size, line height in pixels and letter spacing in pixels.
- **The name is one an author can set.** `css_var_of()` takes the variable's **Web code syntax** when it has one, accepting `var(--x)` or `--x`; otherwise it makes one from the variable's name, lower case, every other character turned into `-` (`Colors/Brand 500` → `--colors-brand-500`). Snippet:

  ```rust
  let Some(web) = v.code_syntax.get("WEB").map(|w| w.trim()) else { return css_var_name(&v.name) };
  ```

- **SwiftUI and Compose: values only.** They never look a variable up. No code syntax for Android or iOS is read anywhere in the engine. Colours become `Color(0xAARRGGBB)` and `Color(red:green:blue:opacity:)` literals.
- **Modes.** The fallback values are the ones the layer shows, so the mode in force on that frame. The code carries no other mode.
- **Styles** (paint, text, effect) are never named in code. `inspect.properties` does list style and variable names beside each property; the code does not.

### Components and instances

- A component or a component set becomes a reusable unit whose **component properties are its parameters**: variant properties become enums (`enum class ButtonState` in Compose, a `String, CaseIterable` enum in SwiftUI, string unions in React), booleans become `if` around the layers they show, text properties `String`, instance swaps a view or composable parameter, slots optional content.
- All variants of a set share **one definition drawn from the default variant**. React and Leptos add the other variants' differences as CSS rules on `data-*` attributes. **SwiftUI and Compose take the variant enum as a parameter but do not use it**: the body is the default variant's.
- An instance below the selected layer becomes a call passing only the values it changes (`Button(state = ButtonState.Hover, label = "Buy")`). Selecting an instance gives its call and then its component's definition.
- **Code Connect overrides generation.** A component or set linked for a language (`codeConnect.set {importPath, name, template}`) gives an import line and its template filled with the instance's values instead of generated code, also inside a generated layer tree (React, Leptos, SwiftUI and Compose; not CSS or HTML).

### What it skips

Constraints; alignment, wrap and hug or fill sizing in the native targets; rotation and blend outside CSS; strokes' alignment and dashes; all fills but the first and every gradient in the native targets; inner shadows and blurs in the native targets; text styling beyond size, weight and colour in Compose; variables, modes and styles in the native targets; variant differences in the native targets; vectors, booleans and other shapes (an `Image` placeholder named after the layer, "export as an image asset"); hidden layers (unless a boolean property shows them). Trees deeper than 12 levels or wider than 200 children are cut off with a comment.

## 3. Reaching the code outside the panel

Yes. The panel calls the same engine function that two commands expose, and every FigCraft command is reachable the same ways:

- **`inspect.code`** `{id?, language?, unit?: px|rem, rootFontSize?}` → `{code, language, connected}`. Read-only (it makes no undo step).
- **`inspect.componentCode`** `{id?, language?: react|leptos|swiftui|compose}` → the parts separately: `{component, name, set, properties: [{name, param, type, default, value?}], definition, usage?, connected}`.
- **Through the control socket** (`figcraft --control <port>`): `{"command":"inspect.code","params":{"id":…,"language":"compose"}}`, the channel Toghen's FigCraft target already uses.
- **Through the MCP server** (`figcraft-cli mcp [--attach PORT]`): the `run_command` tool with `inspect.code`. There is no dedicated MCP tool for code; `docs/mcp.md` lists it under `run_command` and in its "Dev Mode" section.
- **Headless, without the app:** `figcraft-cli run script.json --in file.figcraft` runs any command against a saved file and prints one JSON line per step, results included. So a tool can ask for the code of a node in a `.figcraft` file with no window open.
- **From a FigCraft plugin:** a WebAssembly plugin acts only through commands, so one whose manifest asks for `read` access can call `inspect.code`; read-only plugins also run from the Inspect tab.
- **Code Connect as a file:** `codeConnect.export {path?}` writes `figcraft.connect.json` (`{version: 1, links: [{component, language, importPath, name, template}]}`), meant to live in the code repository; `codeConnect.import {json | path}` links each entry to every component or set of that name.
- There is no `figcraft-cli code …` subcommand and no file export of generated code (`figcraft-cli export` writes images, SVG, PDF and `.fig`).

## 4. Extensibility

**Only Rust source for the generators themselves.** The language list is a fixed enum (`CodeLang::ALL`); there is no template, configuration file or plugin hook that changes what a generator writes or adds a language to the dropdown.

What can be influenced without forking:

- **Variable names in the web targets**, through each variable's Web code syntax (or its name).
- **Component output, per component and per language**, through Code Connect: an import path, a name, and a template with `{property}` and `{property ? "a" : "b"}` placeholders. Templates are text, never executed; any other `{…}` stays as written. Limits: 4,000 characters per template, 5,000 links per file.
- **A different generator altogether** as a read-only WebAssembly plugin: it can read the document through commands (`get_node`, `inspect.properties`, `inspect.code` itself) and show its result in its own panel. It cannot replace the Code section's output.

## 5. Compared with Figma

Figma's Dev Mode offers the same three built-in languages (CSS, iOS, Android) and names a bound variable in each by its per-platform code syntax, where FigCraft names variables only in its web languages and writes resolved values in SwiftUI and Compose. FigCraft goes further than Figma's built-in output on components: it writes a component set as a parameterised component and an instance as a call, and it adds HTML, React and Leptos. Its Code Connect is a lighter cousin of Figma's: one string template per component and language, kept in the document and in `figcraft.connect.json`, with no parser of the code base, no command line to publish, and no logic beyond a two-way choice per property.

## What this means for Toghen

- **Toghen's FigCraft target already feeds the web generators.** It writes each variable's Web code syntax as `var(--<name>)` from lib's CSS property name, and `css_var_of()` reads exactly that, so FigCraft's CSS, HTML, React and Leptos output could name the same custom properties as the stylesheet `@toghen/postcss` produces, with no extra work. A test in the FigCraft target could assert it through `inspect.code`.
- **The native targets cannot be fed by tokens today.** SwiftUI and Compose read no variable and no code syntax, so whatever Toghen writes, they print literals. Writing Android or iOS code syntax would change nothing in FigCraft (and the specs already say those spellings are not Toghen's to invent). A request upstream, "use the bound variable's platform code syntax in SwiftUI and Compose", is a generic need any design system shares.
- **A component file could carry Code Connect links.** A `.component.kdl` already knows a component's name and properties; a block naming, per language, an import path and a template could be written to FigCraft with `codeConnect.set`, or exported as `figcraft.connect.json` beside the code. Figma has its own Code Connect, so this would need a shape both targets can take before it is worth adding.
- **`inspect.code` could serve as a cheap check that a built component set still matches its code**, the future development the project's CLAUDE.md already names: the definition it writes (parameters, enums, defaults from the default variant) can be compared with the component's real props. Only the property surface would compare; the body is a sketch.
- **The headless `figcraft-cli run --in` path could let a test read FigCraft's code for a fixture file without the app**, useful once the component engine has a FigCraft back end.
