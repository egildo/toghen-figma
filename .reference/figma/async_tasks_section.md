# Asynchronous Tasks
This article covers asynchronous tasks in JavaScript and provides code examples. It may be helpful to understand some JavaScript fundamentals before you continue. [Check out the required knowledge here →](https://developers.figma.com/docs/plugins/prerequisites/)
The Plugin API and Widget API include both synchronous and asynchronous functions. Usually, asynchronous functions in the Plugin API and Widget API are identified by an `Async` suffix, such as [**`loadFontAsync()`**](https://developers.figma.com/docs/plugins/api/properties/figma-loadfontasync/).
In this article, we’ll explain the differences between the two. We'll also explore how asynchronous functions can make your API communication more effective and why Figma favors asynchronous code for some plugin operations.
## Synchronous requests[​](https://developers.figma.com/docs/plugins/async-tasks/#synchronous-requests "Direct link to Synchronous requests")
With synchronous requests, the caller must wait for a response before other requests are made. Synchronous requests are used when data is expected to return immediately. In the case of a Figma plugin, the client is usually the active tab of a web browser or the Figma desktop app.
You have likely encountered these kinds of tasks in other situations, like waiting for a photo to upload before you can continue using an application. During this time you could see a progress bar, spinning circle, or loading screen.
You can think of synchronous requests like getting in line at the grocery store or drive through. Each request is handled one at a time. Unlike at the grocery store, synchronous tasks can’t jump the queue. Those who were in line before you must complete their transactions before you can move forward and begin your own check out process.
Typically, code written in JavaScript runs one line at a time, in the order it was written. Consider the following code:
```
console.log("I am");  
console.log("synchronous");  
console.log("JavaScript");  

```

As JavaScript is synchronous by default, the console output looks like:
  1. “I am” is the first output in the JavaScript console.
  2. “synchronous” is the next output.
  3. “JavaScript” is the final output.


While synchronous programming works in this example, synchronous tasks aren’t always the best approach. Since each task must wait for the previous request to receive a response before proceeding, it can slow down larger, more complex applications where response times are unpredictable.
This is especially true when network requests and latency are added as considerations. Since you can’t guarantee how fast or stable a user’s internet connection is (that is, how long it will take to transfer data to and from the user) or how long it might take a server to respond to a request, the potential slowdown to synchronous code can be significant.
## Asynchronous requests[​](https://developers.figma.com/docs/plugins/async-tasks/#asynchronous-requests "Direct link to Asynchronous requests")
Unlike synchronous requests, asynchronous requests don’t need to wait on a response before proceeding. Instead, a **callback** is provided to notify the client when a response is ready. Asynchronous requests are useful when an API’s response time varies based on the availability of a resource.
You can think of this as ordering something from a coffee shop. You get in line, your order is taken, then you give your name so the barista can call you when your order is ready. In an API, your name is the request **token** or unique identifier.
In a coffee shop, orders won’t always come out in the order they were placed. An americano will take less time than a frothy coffee with latte art! The same can be said of asynchronous requests.
![An animation showing two rectangles. One labeled “Plugin” and the other labeled “API”. In an animation labeled “Async request” requests go from the Plugin to the API and responses go from the API to the Plugin in no particular order. In an animation labeled “Sync request” requests go from the Plugin to the API and responses return in the same order that requests were received.](https://static.figma.com/uploads/878a79af84ac620b3d9ec15bcddf8605919b3c45)
This way, other requests can continue to process in the background and the application can keep its functionality while waiting for responses. An asynchronous approach can be an efficient solution when the API’s response time is unpredictable due to variables in data size and complexity.
[Learn more about asynchronous JavaScript in the MDN Web Docs →](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous)
### Promises[​](https://developers.figma.com/docs/plugins/async-tasks/#promises "Direct link to Promises")
As the client doesn’t need to wait for a response from the API, we need another way to communicate the status of that task. This is where **Promises** come into play.
Asynchronous programming in modern JavaScript is built on the concept of **Promises**. A **Promise** is an object returned by an asynchronous request and can be in one of three states:
  * **Pending** : The promise has been created but the request has not been **fulfilled** or **rejected**.
  * **Fulfilled** : The asynchronous request was successful. When a promise is **fulfilled** , the `.then()` handler is called.
  * **Rejected** : The asynchronous request failed. When a promise is **rejected** , the `.catch()` handler is called.


![An animation showing two rectangles. One labelled “Plugin�” and the other labelled “API”. An animation labelled “Status: pending” shows a request in between the Plugin and API. An animation labelled “Status: rejected” shows the request being returned to the Plugin. An animation labelled “Status: fulfilled” shows the API sending a response to the Plugin.](https://static.figma.com/uploads/f1e3a0ef8e13236221b4df8be0c459f9e719b456)
Consider the following code:
```
const fetchPromise = fetch("https://httpbin.org/anything");  
  
fetchPromise.then((response) => {  
  const textPromise = response.text();  
  textPromise.then((data) => {  
    console.log(data);  
    figma.closePlugin();  
  });  
});  

```

In this example, we are using the `fetch()`API to request some data from the Figma API. When we `fetch()` from the Figma API, a Promise is returned. An asynchronous function is helpful here because we don’t know how long it will take for the API to respond with the requested data.
Once the Promise state is **fulfilled** , the `.then()` handler is called. We are saying that if the response was successful, turn the response into JSON then output the data. The returned data should look something like this:
```
{  
  "args": {},  
  "data": "",  
  "files": {},  
  "form": {},  
  "headers": {  
    ...  
  },  
  "json": null,  
  "method": "GET",  
  "origin": "...",  
  "url": "https://httpbin.org/anything"  
}  

```

If the Promise is **rejected** , an error is returned. We can view this error by adding the `.catch()` handler to our code:
```
const fetchPromise = fetch("https://httpbin.org/anything");  
  
fetchPromise  
  .then((response) => {  
    const textPromise = response.text();  
    textPromise.then((data) => {  
      console.log(data);  
  })  
	.catch((error) => {  
		console.error(error);  
	});  
	figma.closePlugin();  
});  

```

[Learn more about how to use Promises in the MDN Web Docs →](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Promises)
### Async and Await[​](https://developers.figma.com/docs/plugins/async-tasks/#async-and-await "Direct link to Async and Await")
The `async` and `await` keywords allow us to use asynchronous functions that look like synchronous code. Using `async` and `await` can improve the performance of your application since it continues to run while waiting on a response. These keywords allow you to write asynchronous code in a neat, organized and readable way.
Adding `async` at the start of function definition turns it into an asynchronous function. Inside an asynchronous function, the `await` keyword can be used before a function call that returns a Promise. If we rewrite our earlier example using `async` and `await`, it would look like this:
```
async function fetchData(){  
  try {  
    const response = await fetch("https://httpbin.org/anything");  
    const text = await response.text();  
    console.log(`Response text is: ${text}`);  
  } catch (error) {  
    console.error(error);  
  }  
  
  figma.closePlugin();  
}  
  
fetchData();  

```

With `async` and `await`, we can use `try...catch` blocks for error handling as if we were working with synchronous code.
[Learn more about `async` and `await` in the MDN Web Docs →](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Asynchronous/Promises)
## Asynchronous tasks in the Figma Plugin API[​](https://developers.figma.com/docs/plugins/async-tasks/#asynchronous-tasks-in-the-figma-plugin-api "Direct link to Asynchronous tasks in the Figma Plugin API")
To make asynchronous development as easy as possible with the Plugin and Widget API, Figma provides async functions in the Plugin API. Here are some examples of asynchronous tasks in Figma:
###  [loadAsync](https://developers.figma.com/docs/plugins/api/PageNode/#loadasync)[​](https://developers.figma.com/docs/plugins/async-tasks/#loadasync "Direct link to loadasync")
You’ll need to use this function to asynchronously load individual PageNodes that your plugin wants to access.
The Figma editor uses [dynamic page loading](https://help.figma.com/hc/en-us/articles/1500005554982-Guide-to-files-and-projects#h_01HHDQ77YC3D3NK7K9DEE3SQKQ), which means that pages other than a user’s current page aren’t guaranteed to be loaded. This results in nodes on unloaded pages not being available to a plugin. The `loadAsync` function ensures that a PageNode and its dependencies are completely loaded and able to be used by your plugin.
```
for (const page of figma.root.children) { // PageNodes are the only children of root  
  await page.loadAsync()  
  console.log(`Page ${page.name} has ${page.children.length} children`)  
}  

```

###  [loadFontAsync](https://developers.figma.com/docs/plugins/api/properties/figma-loadfontasync/)[​](https://developers.figma.com/docs/plugins/async-tasks/#loadfontasync "Direct link to loadfontasync")
This is the most common async function in the Plugin API. You'll need to use this function if you want your plugin to modify or re-render text nodes.
Font files aren’t always available in the browser’s memory. Especially if the file lives on a user’s local machine. If someone runs your plugin in a file that doesn’t have those fonts loaded, they won’t be able to edit any text nodes. The `loadFontAsync` function makes sure all fonts in the file are loaded and ready to use.
```
figma.ui.onmessage = async (pluginMessage) => {  
  
  await figma.loadFontAsync({ family: "Rubik", style: "Regular" });  
  
...  

```

###  [exportAsync](https://developers.figma.com/docs/plugins/api/properties/nodes-exportasync/)[​](https://developers.figma.com/docs/plugins/async-tasks/#exportasync "Direct link to exportasync")
This function exports a selected node as an encoded image. In the example below, a polygon is created then exported as a PNG at 2x resolution. We use `await` to ensure that the polygon object is properly created before we attempt to export it.
When settings for `format` and `constraint` aren’t specified, `exportAsync` defaults to exporting the node as a PNG at 1x resolution.
```
async () => {  
  const polygon = figma.createPolygon()  
  polygon.pointCount = 6  
  polygon.fills = [{ type: 'SOLID', color: { r: 1, g: 0, b: 0 } }]  
  
  // Export a 2x resolution PNG of the node  
  const bytes = await polygon.exportAsync({  
    format: 'PNG',  
    constraint: { type: 'SCALE', value: 2 },  
  })  
}  

```

Here are other useful asynchronous functions in the Plugin API:
  * [`saveVersionHistoryAsync`](https://developers.figma.com/docs/plugins/api/properties/figma-saveversionhistoryasync/): Saves a new version of the file and adds it to the version history of the file. Returns the new version id.
  * [`createLinkPreviewAsync`](https://developers.figma.com/docs/plugins/api/properties/figma-createlinkpreviewasync/): **(FigJam only)**
  * [`figma.clientStorage`](https://developers.figma.com/docs/plugins/api/figma-clientStorage/#getasync)
  * [`getPublishStatusAsync`](https://developers.figma.com/docs/plugins/api/ComponentSetNode/#getpublishstatusasync)
  * [`waitForTask`](https://developers.figma.com/docs/widgets/api/properties/widget-waitfortask/): **(Widget API)**
  * [`Image`](https://developers.figma.com/docs/plugins/api/Image/#getbytesasync) - [Learn more about working with images in the Plugin API →](https://developers.figma.com/docs/plugins/working-with-images/)


## Upgrade synchronous code to async[​](https://developers.figma.com/docs/plugins/async-tasks/#upgrade-synchronous-code-to-async "Direct link to Upgrade synchronous code to async")
Figma offers a guide to help with you upgrade plugins to use asynchronous functions and to be compatible with dynamic page loading. [Migrating Plugins to Dynamically Load Pages →](https://developers.figma.com/docs/plugins/migrating-to-dynamic-loading/)
[Previous Accessing the Document](https://developers.figma.com/docs/plugins/accessing-document/)[Next Editing Properties](https://developers.figma.com/docs/plugins/editing-properties/)
  * [Synchronous requests](https://developers.figma.com/docs/plugins/async-tasks/#synchronous-requests)
  * [Asynchronous requests](https://developers.figma.com/docs/plugins/async-tasks/#asynchronous-requests)
    * [Promises](https://developers.figma.com/docs/plugins/async-tasks/#promises)
    * [Async and Await](https://developers.figma.com/docs/plugins/async-tasks/#async-and-await)
  * [Asynchronous tasks in the Figma Plugin API](https://developers.figma.com/docs/plugins/async-tasks/#asynchronous-tasks-in-the-figma-plugin-api)
    * [loadAsync](https://developers.figma.com/docs/plugins/async-tasks/#loadasync)
    * [loadFontAsync](https://developers.figma.com/docs/plugins/async-tasks/#loadfontasync)
    * [exportAsync](https://developers.figma.com/docs/plugins/async-tasks/#exportasync)
  * [Upgrade synchronous code to async](https://developers.figma.com/docs/plugins/async-tasks/#upgrade-synchronous-code-to-async)


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

