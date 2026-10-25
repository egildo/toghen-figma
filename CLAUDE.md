# @toghen/figma

An adapter: tokens become Figma Variables and Styles, one collection per modifier. It also holds:

- convention-driven binding, audit and export;
- component files (`.component.kdl`, on kdlet), which build and reconcile component sets;
- the `toghen-figma` command line, which syncs a repository into an open file through the plugin.

Toghen is a design-tokens toolkit split into one repository per package. What the repositories share lives in house.

The rules are in the constitution, at `.specify/memory/constitution.md`: the shared principles and this package's own section. Read it before changing anything. This file holds only what is not a rule.

## The docs

| Doc | What it is |
|---|---|
| `guide.md` | How to use it: setup, workflows, examples |
| `reference.md` | The API surface: signatures, protocol, schemas |
| `specs.md` | Why it is built this way: architecture, contracts, decisions, open questions |
| `decisions.md` | The archive: dated rulings, what was considered and rejected, what the build found, superseded sections, open questions |
| `component-files.md` | The format of a `.component.kdl` file, complete for whoever writes one |
| `ui.md` | What the plugin's screen is and how it behaves |
| `ux-map.md` · `ux-rulebook.md` · `ux-smell-log.md` | The rulebook holds the agreed placement rules; the map says what each screen area is for; the log records smells and their status |

## Commands

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm check   # coming in the tooling round
```

## Future developments

Ideas deliberately kept out of the specs until someone needs them. Each names the need that would bring it in.

- **Editor support for component files.** A KDL schema or a language server, so an author of a `.component.kdl` file sees hover text and errors in the editor rather than from a command. Wanted once authors other than the maintainers write component files. See `specs.md`, *Components from files*.
- **A check that a component file still matches its code.** Nothing keeps a component file true to the code it mirrors; a person does. A check comparing a built component set with the code would catch drift. Wanted when a consumer reports a component file that fell behind its code.
