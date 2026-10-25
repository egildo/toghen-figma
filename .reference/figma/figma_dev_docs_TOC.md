# Figma Plugin API — vendored documentation snapshots

These files are **offline snapshots** of the official Figma Plugin API documentation, kept in
the repository so that work on `@toghen/figma` can be done against a fixed, greppable copy of
the API surface rather than from memory. They are *not* Toghen documentation and nothing in
them is authored by us, except for clearly-marked blockquote notes at the top of some files
(always labelled as snapshot notes).

- **Host:** <https://developers.figma.com/docs/plugins/> — the old `figma.com/plugin-docs/*`
  URLs now redirect here. Always cite the `developers.figma.com` form.
- **Most recent capture:** 2026-08-04 (Variables, Styles, dynamic page loading, data types).
- **Older capture still in place:** 2026-03-10 (the guide/manifest pages listed as such below).
  Those pages were not part of the 2026-08-04 refresh; treat them as older and re-check against
  the live docs before relying on a detail.

> **Snapshot note, 2026-10-23.** Every capture here predates Plugin API Updates 134–141
> (to 15 October 2026), which touch these pages: composed colour variables and `COLOR_OPACITY`
> (Variables, data types), custom animation styles (Styles), `sourceColor` on paints, gradient
> stops and effects (data types), vertical wrap (node properties), `textWrapStyle` and variable
> fonts (text). The differences, each with its source, are in
> `.reference/skills-research/figma-docs-2026-10-23.md`. Refresh the Variables and Styles pages
> when work on either next starts.

## How to refresh

Each file carries its source URL(s) at the top. To refresh one, fetch the page from the URL
recorded in the file, take the `<article>` element, convert it to GitHub-flavoured Markdown
(`pandoc -f html -t gfm-raw_html --wrap=none` works well), strip the breadcrumb/nav preamble and
the `Previous`/`Next` footer, absolutise relative links against `https://developers.figma.com`,
and re-add the `# Source:` header plus the capture date. Preserve code samples and type
signatures **verbatim** — they are the point of vendoring. If a page 404s, leave a marked stub;
never fill the gap with invented API surface.

## Contents

### Guides

| File | Source | Captured |
|---|---|---|
| [intro_section.md](intro_section.md) | <https://developers.figma.com/docs/plugins/> | 2026-03-10 |
| [prereq_section.md](prereq_section.md) | <https://developers.figma.com/docs/plugins/prerequisites/> | 2026-03-10 |
| [quickstart_section.md](quickstart_section.md) | <https://developers.figma.com/docs/plugins/plugin-quickstart-guide/> | 2026-03-10 |
| [editor_type_section.md](editor_type_section.md) | <https://developers.figma.com/docs/plugins/setting-editor-type/> | 2026-03-10 |
| [how_plugins_run_section.md](how_plugins_run_section.md) | <https://developers.figma.com/docs/plugins/how-plugins-run/> | 2026-03-10 |
| [accessing_doc_section.md](accessing_doc_section.md) | <https://developers.figma.com/docs/plugins/accessing-document/> + `PageNode` + `figma` | 2026-08-04 |
| [async_tasks_section.md](async_tasks_section.md) | <https://developers.figma.com/docs/plugins/async-tasks/> | 2026-03-10 |
| [creating_ui_section.md](creating_ui_section.md) | <https://developers.figma.com/docs/plugins/creating-ui/> | 2026-03-10 |
| [working_with_variables_section.md](working_with_variables_section.md) | <https://developers.figma.com/docs/plugins/working-with-variables/> | 2026-08-04 |
| [working_with_text_section.md](working_with_text_section.md) | <https://developers.figma.com/docs/plugins/working-with-text/> | 2026-08-04 |
| [migrating_to_dynamic_loading_section.md](migrating_to_dynamic_loading_section.md) | <https://developers.figma.com/docs/plugins/migrating-to-dynamic-loading/> | 2026-08-04 |
| [manifest_section.md](manifest_section.md) | <https://developers.figma.com/docs/plugins/manifest/> | 2026-03-10 |

### API reference

| File | Source | Captured |
|---|---|---|
| [api_ref_section.md](api_ref_section.md) | <https://developers.figma.com/docs/plugins/api/api-reference/> | 2026-03-10 |
| [figma_global_section.md](figma_global_section.md) | <https://developers.figma.com/docs/plugins/api/figma/> | 2026-03-10 |
| [api_figma_variables.md](api_figma_variables.md) | <https://developers.figma.com/docs/plugins/api/figma-variables/> + its 10 per-method pages | 2026-08-04 |
| [api_Variable.md](api_Variable.md) | <https://developers.figma.com/docs/plugins/api/Variable/> + `hiddenFromPublishing`, `resolveForConsumer`, `scopes` | 2026-08-04 |
| [api_VariableCollection.md](api_VariableCollection.md) | <https://developers.figma.com/docs/plugins/api/VariableCollection/> | 2026-08-04 |
| [api_PageNode.md](api_PageNode.md) | <https://developers.figma.com/docs/plugins/api/PageNode/> | 2026-08-04 |
| [api_node_properties.md](api_node_properties.md) | <https://developers.figma.com/docs/plugins/api/node-properties/> (variable/paint/style subset) + `boundVariables`, `setBoundVariable`, `inferredVariables`, `resolvedVariableModes`, `fills` | 2026-08-04 |
| [api_styles.md](api_styles.md) | `BaseStyle`, `PaintStyle`, `TextStyle`, `EffectStyle`, `GridStyle` + style accessors on <https://developers.figma.com/docs/plugins/api/figma/> | 2026-08-04 |
| [data_types_section.md](data_types_section.md) | <https://developers.figma.com/docs/plugins/api/data-types/> | 2026-08-04 |
| [types_variables.md](types_variables.md) | `VariableValue`, `VariableAlias`, `VariableResolvedDataType`, `VariableScope`, `CodeSyntaxPlatform`, the `VariableBindable*Field` unions, `ExtendedVariableCollection`, `PublishStatus` | 2026-08-04 |
| [types_text.md](types_text.md) | `FontName`, `LineHeight`, `LetterSpacing`, `TextCase`, `TextDecoration`, `TextDecorationStyle`, `TextDecorationOffset`, `TextDecorationThickness`, `LeadingTrim`, `OpenTypeFeature`, `TextListOptions` | 2026-08-04 |
| [types_paint.md](types_paint.md) | `Paint`, `RGB`/`RGBA`, `Effect`, `Transform`, `Image`, `BlendMode` + `figma.util` colour helpers | 2026-08-04 |

## Things worth knowing before you read

- **`figma.loadPageAsync()` does not exist.** The per-page loader is
  `PageNode.loadAsync(): Promise<void>`; the document-wide one is
  `figma.loadAllPagesAsync(): Promise<void>`; the current-page setter is
  `figma.setCurrentPageAsync(page)`. See `accessing_doc_section.md` and
  `migrating_to_dynamic_loading_section.md`.
- **`VariableCollection.defaultModeId` is `[readonly]` and modes cannot be reordered.** Only
  `addMode`, `renameMode` and `removeMode` exist. See `api_VariableCollection.md`.
- **`RGB`/`RGBA` channels are 0..1 in the *document's* colour profile, gamma-encoded** — sRGB
  for a default document, but Display P3 documents use the same numbers for P3 coordinates.
  `DocumentNode.documentColorProfile` is the only way to tell. See `types_paint.md`.
- **Sync getters are deprecated and throw under `"documentAccess": "dynamic-page"`.** That
  covers `figma.variables.getLocalVariables()`, `getVariableById()`,
  `getVariableCollectionById()`, `figma.getLocal*Styles()`, `figma.getStyleById()`,
  `figma.getNodeById()`, and direct assignment to `figma.currentPage`, `fillStyleId`,
  `effectStyleId`, `strokeStyleId`, `gridStyleId`, `TextNode.textStyleId`.

## Deliberately not vendored

- `dev_mode_section.md`, `pattern_fills_section.md`, `parameters_section.md` — removed
  2026-08-04. Unreachable for a plugin whose manifest is `editorType: ["figma"]` with no
  `parameters` entry.
- The `TableNode` / FigJam / Slides / Buzz node types, and the bulk of
  `api/node-properties/` — the full page is ~400 KB and almost none of it applies here.
  Fetch from the live docs if you ever need one of them.
