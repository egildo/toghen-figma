# @toghen/figma

The Figma adapter of [Toghen](https://codeberg.org/Toghen). A resolver document, resolved through [`@toghen/lib`](https://codeberg.org/Toghen/lib), becomes a Figma file's Variables and Styles: one collection per modifier, a mode per context. A component file (`.component.kdl`) becomes a component set in the same file. Running again changes only the difference.

```sh
pnpm add -D @toghen/figma
```

The package holds three pieces:

- **The plugin**, built into `dist/` with its `manifest.json`. Import it in the Figma desktop app.
- **Component files**, the format a component set is built from. See [component-files.md](https://codeberg.org/Toghen/figma/src/branch/main/component-files.md).
- **The command line**, `toghen-figma`. It pairs with the open plugin over a local socket and runs the whole job from a repository: read and check everything, sync variables, sync styles, then build each component file.

The [guide](https://codeberg.org/Toghen/figma/src/branch/main/guide.md) goes from a fresh checkout to a synced file, and the [reference](https://codeberg.org/Toghen/figma/src/branch/main/reference.md) lists the protocol and the schemas.

## License

MIT. See [LICENSE](https://codeberg.org/Toghen/figma/src/branch/main/LICENSE).
