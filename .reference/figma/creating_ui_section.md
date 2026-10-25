# Creating a User Interface
The [`figma.showUI()`](https://developers.figma.com/docs/plugins/api/properties/figma-showui/) function shows a plugin's user interface. The easiest way to use this function is to do the following:
  1. Create a HTML file containing the markup for your UI.
  2. Change `manifest.json` to contain `"ui": "ui.html"` where `"ui.html"` is the filename of your HTML file.
  3. Put the following call in your plugin code:


```
figma.showUI(__html__)  

```

This will display the contents of your HTML file in an `<iframe>` inside of Figma.
We strongly recommend using the `themeColors` option in `figma.showUI()` and using the [CSS variables](https://developers.figma.com/docs/plugins/css-variables/) that it provides to your UI to support light and dark themes.
## Sending messages between the UI and plugin code[​](https://developers.figma.com/docs/plugins/creating-ui/#sending-messages-between-the-ui-and-plugin-code "Direct link to Sending messages between the UI and plugin code")
After you've called `figma.showUI()`, you will likely want to send messages between the UI and the plugin code. For example, you might send information about the current document from the plugin code to be displayed in your plugin's user interface. Or you might send user input to the plugin code before performing some action.
### Sending a message from the UI to the plugin code[​](https://developers.figma.com/docs/plugins/creating-ui/#sending-a-message-from-the-ui-to-the-plugin-code "Direct link to Sending a message from the UI to the plugin code")
To send a message from the UI to the plugin code, write the following in your HTML:
```
<script>  
...  
parent.postMessage({ pluginMessage: 'anything here' }, '*')  
...  
</script>  

```

To receive the message in the plugin code, write:
```
figma.ui.onmessage = (message) => {  
  console.log("got this from the UI", message)  
}  

```

### Sending a message from the plugin code to the UI[​](https://developers.figma.com/docs/plugins/creating-ui/#sending-a-message-from-the-plugin-code-to-the-ui "Direct link to Sending a message from the plugin code to the UI")
To send a message from the plugin code to the UI, write:
```
figma.ui.postMessage(42)  

```

To receive that message in the UI, write the following in your HTML:
```
<script>  
...  
onmessage = (event) => {  
  console.log("got this from the plugin code", event.data.pluginMessage)  
}  
...  
</script>  

```

Note: the syntax for sending and receiving messages in the UI and the syntax for doing the same in the plugin code are subtly different. In the plugin code, you directly send and receive the values that you want to send. However, inside in the UI, you must send values on a `pluginMessage` property. Likewise, received data will appear on a `pluginMessage` property. When calling `postMessage` in the UI, you must also specify a second argument with the value `'*'`.
You can send almost any structured data in either direction, including objects, arrays, numbers, strings, booleans, `null`, `undefined`, `Date` objects and `Uint8Array` objects. However, keep in mind that this is similar to sending a serialized JSON representation of the object. Methods of the object (or in general, the prototype chain of sent objects) will _not_ be recovered.
You can start sending messages from the plugin code to the UI as soon as `figma.showUI()` has been called. The messages will automatically be queued until the `<iframe>` containing the UI finishes loading.
Note: currently, you cannot send `Blob` objects, `ArrayBuffer`s or `TypedArray` objects other than `Uint8Array`.
### Non-null origin iframes[​](https://developers.figma.com/docs/plugins/creating-ui/#non-null-origin-iframes "Direct link to Non-null origin iframes")
If you'd like, you can also navigate the iframe to a custom URL by doing:
```
figma.showUI(`<script>window.location.href = "https://..."</script>`)  

```

If you do this, sending a message from the UI to the main plugin code becomes slightly different. You'll also need to specify a `pluginId` value as part of the message to indicate if it is safe to deliver the message to any plugin OR just the one whose id is specified.
If the data you're sending back to your plugin is potentially sensitive, specifying a specific `pluginId` prevents other plugins from navigating their iframes to the same url to receive the pluginMessage. You should also pass in `'https://www.figma.com'` as the second argument to `parent.postMessage` to prevent other websites from embedding your iframe and intercepting the postMessage information anyway.
```
<script>  
...  
// Only the plugin with id 123456 and www.figma.com is allow to receive this message.  
parent.postMessage(  
  { pluginMessage: 'anything here', pluginId: '123456' },  
  'https://www.figma.com'  
)  
  
// Any plugin id is allowed to receive the message  
parent.postMessage({ pluginMessage: 'anything here', pluginId: '*' }, '*')  
...  
</script>  

```

## Triggering drop events from the UI[​](https://developers.figma.com/docs/plugins/creating-ui/#triggering-drop-events-from-the-ui "Direct link to Triggering drop events from the UI")
How your plugin code receives [drop events](https://developers.figma.com/docs/plugins/api/properties/figma-on/#drop) coming from the UI will depend on whether you've [navigated the iframe to a custom URL](https://developers.figma.com/docs/plugins/creating-ui/#non-null-origin-iframes).
### Drop events from a null origin iframe[​](https://developers.figma.com/docs/plugins/creating-ui/#drop-events-from-a-null-origin-iframe "Direct link to Drop events from a null origin iframe")
If you have not navigated the iframe to a custom URL, then your plugin UI lives inside a null origin iframe, which prevents the Figma canvas from receiving drop events natively. Instead, we can use message passing to allow the UI to tell Figma the drop position and payload.
To trigger a drop event that can be received by the plugin code, include the following Javascript code in your UI:
```
parent.postMessage({ pluginDrop: PluginDrop }, '*')  

```

where the `pluginDrop` property satisfies the following interface:
```
interface PluginDrop {  
  // clientX and clientY taken from the browser's DragEvent  
  clientX: number  
  clientY: number  
  items?: DropItem[]  
  // array of File objects (https://developer.mozilla.org/en-US/docs/Web/API/File)  
  files?: File[]  
  dropMetadata?: any // use this to communicate additional data for the drop event  
}  
  
interface DropItem {  
  type: string // e.g. "text/html", "text/uri-list", etc...  
  data: string  
}  

```

Figma will then fire a drop event to your plugin code with coordinates translated into canvas space (`absoluteX` and `absoluteY`) along with coordinates relative to the parent node (`x` and `y`).
#### Usage example[​](https://developers.figma.com/docs/plugins/creating-ui/#usage-example "Direct link to Usage example")
An icon library plugin could listen to `dragend` events in its UI and post a message to the plugin code with the `clientX` and `clientY` of the event along with the SVG data.
In the `drop` event callback, the event details are used to create a new node at the drop position under the correct parent node. For more information on `drop` event callbacks, please see the [`figma.on`](https://developers.figma.com/docs/plugins/api/properties/figma-on/#drop) API reference.
See the [figma/plugin-samples](https://github.com/figma/plugin-samples#icon-drag-and-drop) repository for a fully working example.
```
// In UI  
icon.addEventListener('dragend', e => {  
  // Don't proceed if the item was dropped inside the plugin window.  
  if (e.view.length === 0) return  
  
  window.parent.postMessage(  
    {  
      pluginDrop: {  
        clientX: e.clientX,  
        clientY: e.clientY,  
        items: [{ type: 'image/svg+xml', data: e.target.innerHTML }],  
      }  
    },  
    '*'  
  )  
})  

```

```
// In plugin code  
figma.on('drop', (event) => {  
  const { items, node, dropMetadata } = event  
  
  if (items.length > 0 && items[0].type === 'image/svg+xml') {  
    const newNode = figma.createNodeFromSvg(items[0].data)  
    node.appendChild(newNode)  
  
    newNode.x = event.x  
    newNode.y = event.y  
    figma.currentPage.selection = [newNode]  
  
    return false  
  }  
});  

```

### Drop events from a non-null origin iframe[​](https://developers.figma.com/docs/plugins/creating-ui/#drop-events-from-a-non-null-origin-iframe "Direct link to Drop events from a non-null origin iframe")
If you have navigated the iframe to a custom URL, then Figma will be able to receive drop events from the plugin UI natively in the desktop app. However, some browsers have implemented security restrictions that prevent Figma from receiving native drop events in the web. We recommend using `postMessage` so that your plugin drag and drop works in both the desktop app and in browsers.
Note that when handling `dragEnd` events in non-null origin iframes, the coordinates from the event will be relative to the iframe. Figma expects `pluginDrop` coordiantes to be relative to the window. You can use [`figma.ui.getPosition()`](https://developers.figma.com/docs/plugins/api/figma-ui/#getposition) to calculate the window space coordinates of your drop event.
See the [figma/plugin-samples](https://github.com/figma/plugin-samples#icon-drag-and-drop-hosted) repository for a fully working example.
```
// In UI  
const dragAndDropQueue = []  
// retrieve plugin iframe position  
onmessage = (event) => {  
  if (!dragAndDropQueue) {  
    return;  
  }  
  
  const { position } = event.data.pluginMessage;  
  const { coordinates, items } = dragAndDropQueue.shift();  
  
  // these coordinates are relative to the entire window  
  const windowAdjustedCoordinates = {  
    x: coordinates.x + position.windowSpace.x,  
    y: coordinates.y + position.windowSpace.y,  
  };  
  window.parent.postMessage({  
      pluginDrop: {  
        clientX: windowAdjustedCoordinates.x,  
        clientY: windowAdjustedCoordinates.y,  
        items,  
      },  
      pluginId: "your-id-here",  
    }, "*");  
}  
  
icon.addEventListener('dragend', e => {  
  dragAndDropQueue.append({  
    // these coordinates are relative to the iframe  
    coordinates: { x: e.clientX, y: e.clientY }  
    items: [{ type: 'image/svg+xml', data: e.target.innerHTML }],  
  })  
  
  // instead of sending a dropEvent right away, ask the plugin  
  // for its current position so we can calculate the  
  // coordinates relative to the window  
  window.parent.postMessage({  
    pluginMessage: { type: "request-plugin-position" },  
    pluginId: "your-id-here",  
  }, "*");  
})  

```

```
// In plugin code  
  
// send plugin position to UI  
figma.ui.onmessage = (msg) => {  
  if (msg.type === "request-plugin-position") {  
    const position = figma.ui.getPosition();  
    figma.ui.postMessage({ position });  
  }  
};  
  
figma.on('drop', (event: DropEvent) => {  
  console.log('[plugin] drop received!!', event);  
  const { items } = event;  
  
  if (items.length > 0 && items[0].type === 'image/svg+xml') {  
    const data = items[0].data  
  
    const newNode = figma.createNodeFromSvg(data);  
    newNode.x = event.absoluteX;  
    newNode.y = event.absoluteY;  
  
    figma.currentPage.selection = [newNode];  
  }  
  
  return false;  
});  

```

[Previous TypeScript](https://developers.figma.com/docs/plugins/typescript/)[Next CSS Variables and Theming](https://developers.figma.com/docs/plugins/css-variables/)
  * [Sending messages between the UI and plugin code](https://developers.figma.com/docs/plugins/creating-ui/#sending-messages-between-the-ui-and-plugin-code)
    * [Sending a message from the UI to the plugin code](https://developers.figma.com/docs/plugins/creating-ui/#sending-a-message-from-the-ui-to-the-plugin-code)
    * [Sending a message from the plugin code to the UI](https://developers.figma.com/docs/plugins/creating-ui/#sending-a-message-from-the-plugin-code-to-the-ui)
    * [Non-null origin iframes](https://developers.figma.com/docs/plugins/creating-ui/#non-null-origin-iframes)
  * [Triggering drop events from the UI](https://developers.figma.com/docs/plugins/creating-ui/#triggering-drop-events-from-the-ui)
    * [Drop events from a null origin iframe](https://developers.figma.com/docs/plugins/creating-ui/#drop-events-from-a-null-origin-iframe)
    * [Drop events from a non-null origin iframe](https://developers.figma.com/docs/plugins/creating-ui/#drop-events-from-a-non-null-origin-iframe)


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

