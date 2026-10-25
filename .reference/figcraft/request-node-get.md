# Draft: a request to FigCraft, to report what a layer keeps and `node.get` leaves out, and to refuse an unknown binding

Drafted 22 October 2026, extended 23 October 2026 with what the round that finished the FigCraft target measured, for Egildo to post to the FigCraft repository (storytold/figcraft) if he chooses. **Not posted.** It follows the request that brought layer data back in 0.8.0 (`node.get` reporting `pluginData`, #879).

---

**Title:** `node.get`: report a layer's component property bindings and a frame's explicit variable modes

**What happens now (0.9.0)**

Two things FigCraft keeps on a layer are written by commands but not reported by any read:

1. **The property a layer is wired to.** `component.bindProperty {layer, property, field: visible | characters | mainComponent}` binds a layer of a main component to a component property, and instances follow it: setting the property with `instance.setProperties` changes the wired text. The binding is kept, since the node's `prop_refs` is written into the saved file. But `node.get`, `document.inspect` and `inspect.properties` do not report it.
2. **A frame's variable mode.** `variable.setMode {ids, collection, mode}` pins a frame to a mode: its contents repaint in that mode's values. `node.get` has no key for the pinned mode, and `document.inspect` names no mode.

Steps, in a new file:

```jsonl
{"command": "variable.createCollection", "params": {"name": "probe", "modes": ["light", "dark"]}}
{"command": "frame.create", "params": {"name": "State=rest", "props": {"layout": "horizontal"}}}
{"command": "text.create", "params": {"text": "Label", "x": 0, "y": 0, "parent": 2}}
{"command": "component.create", "params": {"ids": [2]}}
{"command": "component.addProperty", "params": {"id": 2, "name": "Label", "type": "text", "default": "Label"}}
{"command": "component.bindProperty", "params": {"layer": 3, "property": "Label", "field": "characters"}}
{"command": "variable.setMode", "params": {"ids": [2], "collection": "VariableCollectionId:1", "mode": "dark"}}
{"command": "node.get", "params": {"id": 3}}
{"command": "node.get", "params": {"id": 2}}
```

The text's `node.get` has no trace of its binding to "Label", and the frame's has no trace of its mode.

**What would help**

`node.get` (the command, the control method and MCP `get_node`) and `document.inspect` would report both, when the layer has any, the way `pluginData` is reported since 0.8.0. For example:

- `propertyRefs: {"characters": "Label"}`: field to property name, as `component.bindProperty` takes them.
- `variableModes: {"VariableCollectionId:1": "VariableCollectionId:1/mode2"}`: collection id to mode id, as `variable.setMode` takes them.

**More of the same kind (measured against 0.9.0, 23 October 2026)**

`node.set` takes these and `node.get` reports none of them:

- `cornerSmoothing` (0.6 written, no key read back);
- `maxLines` (2 written, no key);
- `paragraphSpacing` (4 written, no key), and so presumably `paragraphIndent`;
- `strokeCap` on a line (`round` written, no key);
- `blend` on a frame: `normal` and `pass through` both read back as no `blend` key, so a read cannot tell them apart;
- an exposed nested instance (`component.exposeInstance`): `node.get` on the instance has no key for it.

A slot (`component.makeSlot`) takes a name and preferred components, and Figma's slots also carry a description and settings (minimum and maximum children, only preferred values, stretch on insert, shown empty by default); FigCraft has no place for them.

**A second ask: refuse a binding to a field that does not exist**

`variable.bind {ids, field: "strokeBogusWeight", variable}` answers `{ok: true}` and lists `strokeBogusWeight` in `boundVariables`. A misspelt field binds nothing and says nothing. Effects already refuse an unknown key (`effects[0]: unknown properties: offsetX …`), and so does `node.set` for an auto layout key off a frame; `variable.bind` could refuse an unknown field the same way, naming the fields it takes.

**Why**

A tool that keeps a file in step with a source, building components from a description and running again later, has to compare what the file holds now with what it wrote last time. Only then can it tell a hand edit (keep it, and say so) from a change in its own source (write it). Every other field it writes, `node.get` reports. These it can only trust to have stayed as written, so a binding removed, a mode or any of the fields above changed by hand goes unnoticed. Reporting them closes the loop, as reporting layer data did for the record the tool keeps.
