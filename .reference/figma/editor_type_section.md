# Setting Editor Type
The [editorType](https://developers.figma.com/docs/plugins/manifest/#editortype) field is a required field in plugin manifests. Use it to specify which editor your plugin works in. You can create plugins for a specific editor type (i.e. one of Figma's editor products), a combination of editor types, or build plugins that perform different actions in each editor. You can use any of the below combinations of editor types:
Specifying supported editor types in manifest.json
```
// A plugin that works in Figma design and FigJam  
"editorType": [  
  "figjam",  
  "figma"  
]  
  
// A plugin that works in Figma design and Dev Mode  
"editorType": [  
  "figma",  
  "dev"  
]  
  
// A plugin that only works in Figma design  
"editorType": [  
  "figma"  
]  
  
// A plugin that only works in FigJam  
"editorType": [  
  "figjam"  
]  
  
// A plugin that only works in Dev Mode  
"editorType": [  
  "dev"  
]  
  
// A plugin that only works in Figma Slides  
"editorType": [  
  "slides"  
]  
  
// A plugin that only works in Figma Buzz  
"editorType": [  
  "buzz"  
]  

```

Plugins cannot specify both `"dev"` and `"figjam"` editor types at the same time.
Keep in mind, when you specify multiple editor types, your plugin won't have access to certain functions and events depending on the editor the plugin runs in. For example, if you use `figma.createSticky()`, the code will work while the plugin is running in FigJam, but not when you run it in Figma.
Learn more about which APIs are accessible in each editor:
  * [Working with FigJam](https://developers.figma.com/docs/plugins/working-in-figjam/)
  * [Working in Dev Mode](https://developers.figma.com/docs/plugins/working-in-dev-mode/)
  * [Working in Slides](https://developers.figma.com/docs/plugins/working-in-slides/)
  * [Working in Buzz](https://developers.figma.com/docs/plugins/working-in-buzz/)


If you want to set conditional logic in your plugin to assign behavior based on the editor the plugin is running in, you can use the method [`figma.editorType`](https://developers.figma.com/docs/plugins/api/figma/#editortype). This will return a string value of `figma`, `figjam`, `dev`, `slides`, or `buzz`.
Using figma.editorType to check where the plugin is being run
```
if (figma.editorType === 'figjam') {  
  // In FigJam  
}  
  
if (figma.editorType === 'figma') {  
  // In Figma design mode  
}  
  
if (figma.editorType === 'dev') {  
  // In Figma's Dev Mode  
}  
  
if (figma.editorType === 'slides') {  
  // In Figma Slides  
}  
  
if (figma.editorType === 'buzz') {  
  // In Figma Buzz  
}  

```

[Previous Plugin Quickstart Guide](https://developers.figma.com/docs/plugins/plugin-quickstart-guide/)[Next How Plugins Run](https://developers.figma.com/docs/plugins/how-plugins-run/)
Was this page helpful?
[Leave us feedback](https://form.asana.com/?k=6r2Tos6p01DyVKGLeYJByg&d=10497086658021)
* * *
  * [Community Forum](https://forum.figma.com/)
  * [Discord Server](https://discord.gg/xzQhe2Vcvx)
  * [GitHub Samples](https://github.com/figma/widget-samples)


[](https://www.figma.com)
[FigJam](https://www.figma.com/figjam/)·[Enterprise](https://www.figma.com/enterprise/)·[Learn](https://help.figma.com/)·[Education](https://www.figma.com/education/)·[Careers](https://www.figma.com/careers/)·[Pricing](https://www.figma.com/pricing/)·[Developers](https://www.figma.com/developers)·[Blog](https://www.figma.com/blog/)·[Downloads](https://www.figma.com/downloads/)·[Releases](https://www.figma.com/release-notes/)·[Security](https://www.figma.com/security/)·[Legal](https://www.figma.com/legal)·[Contact](https://www.figma.com/contact/)
  * [](https://twitter.com/figma)
  * [](https://www.youtube.com/figmadesign)
  * [](https://www.instagram.com/figma)
  * [](https://www.facebook.com/figmadesign)




---

