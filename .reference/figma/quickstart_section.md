# Plugin Quickstart Guide
This QuickStart guide takes you through the setup of our recommended development environment: using TypeScript in Visual Studio Code. You don’t have to use this combination. You can write directly in JavaScript—or any language that translates to JavaScript—and use your preferred text editor.
By the end of this guide, you will have a plugin that opens a modal, asks the user for a number, and creates that many rectangles on the canvas of a Figma design file. If you’re new to Figma plugin development, make sure to read through our plugin concepts. They cover information, such as required knowledge, how plugins run, and what you can do with plugins.
## Download tools[​](https://developers.figma.com/docs/plugins/plugin-quickstart-guide/#download-tools "Direct link to Download tools")
Before we begin, you need to install the following tools:
  * **[The Figma desktop app](https://www.figma.com/downloads/):** Plugin development and testing requires the Figma desktop app. Figma will need to read your plugin code saved as a local file. You can download it from the [Figma downloads page](https://www.figma.com/downloads/). If you already have the desktop app installed, make sure you’re running the latest version.
  * **[Visual Studio Code](https://code.visualstudio.com/):** This is the development environment you’ll be using for the QuickStart guide.


## Create a new plugin[​](https://developers.figma.com/docs/plugins/plugin-quickstart-guide/#create-a-new-plugin "Direct link to Create a new plugin")
  1. Log into the desktop app and create a new design file.
  2. From the menu, navigate to **Plugins** > **Development** , then select **New plugin.**
  3. From the **Create a plugin** modal, select **Figma design** and give your plugin a name.


![Create plugin modal with “my-first-plugin” in the name field and the Figma design template selected](https://static.figma.com/uploads/d0e3d1630c2eae76fc294371bca0975dc54d10ec)
  1. Select **Custom UI**
  2. Click **Save as** to save it anywhere on your disk.


## Open the plugin code folder[​](https://developers.figma.com/docs/plugins/plugin-quickstart-guide/#open-the-plugin-code-folder "Direct link to Open the plugin code folder")
  1. Launch Visual Studio Code.
  2. Go to **File** > **Open Folder** and then select the folder you saved when you created a new plugin.
  3. If you see a verification modal, check the box and click **Yes, I trust the authors** to proceed.


![“MY FIRST PLUGIN” folder open in the Visual Studio Code explorer](https://static.figma.com/uploads/2a7c7f094a751cd1937dda5b2290f7db03892121)
## Install project dependencies[​](https://developers.figma.com/docs/plugins/plugin-quickstart-guide/#install-project-dependencies "Direct link to Install project dependencies")
When you first open the project in Visual Studio Code, you may notice a few errors highlighted in our files. To fix this, we’ll need to install some project dependencies.
![The contents of the “code.ts” file for a sample plugin in Visual Studio Code](https://static.figma.com/uploads/c123dd90666139daf89852d9cff8d5ce9bb23253)
### Node.js and npm[​](https://developers.figma.com/docs/plugins/plugin-quickstart-guide/#nodejs-and-npm "Direct link to Node.js and npm")
**Node** provides a way to run JavaScript outside of the browser and npm is the default package manager for Node.
**Npm** is both a command-line tool and an online repository of open source Node.js projects. Instead of manually including dependencies in our project, npm makes it easy to install these dependencies using scripts.
When you download Node from the [Nodejs.org](https://nodejs.org/en/) website, your download also includes npm.
  1. Select the installer to start the Node.js Setup Wizard.
  2. When the installer asks about tools for native modules, check **Automatically install the necessary tools** and select **Next**.
  3. Select **Install**.
  4. After the install is complete, select **Finish**.


You can check that Node.js was successfully installed in Visual Studio Code.
In Visual Studio Code, select **Terminal** > **New terminal**. Type `node` into the terminal and press `enter`.
The terminal should return the version of Node.js you installed. If you’re not seeing this message, restart Visual Studio and run the command again.
Hit `Ctrl`-`C` twice to exit Node.
![Developer terminal with the user typing node and pressing enter](https://static.figma.com/uploads/a486c870fc6bf4f6fc69b2449e984bd334fd81d5)
### TypeScript[​](https://developers.figma.com/docs/plugins/plugin-quickstart-guide/#typescript "Direct link to TypeScript")
We recommend using [TypeScript](https://www.typescriptlang.org/) for developing Figma plugins. We provide a [typings file](https://developers.figma.com/docs/plugins/api/typings/) with type annotations for the entire Plugin API.
When you install the typings for the Plugin API, Visual Studio Code provides you with suggestions as you code.
![Developer typing figma.create in Visual Studio Code and typescript suggesting possible options](https://static.figma.com/uploads/010c735d46dc7cce00561c195bfb06af9af217c0)
This helps to reduce errors and catch edge cases. You can only use the typings file with TypeScript.
If you take a look at the file named `package.json`, under `devDependencies` you’ll notice that we’ve already included:
  * TypeScript: `typescript`
  * The plugin typings: `@figma/plugin-typings`
  * ESLint and the linter dependencies:
    * `eslint`
    * `@typescript-eslint/eslint-plugin`
    * `@typescript-eslint/parser`
    * `@figma/eslint-plugin-figma-plugins`
  * The configuration for the [plugin linter](https://developers.figma.com/docs/plugins/plugin-quickstart-guide/#plugin-linter)


![This example shows the package.json file open in Visual Studio Code.](https://static.figma.com/uploads/09ea3bc2e7b8245ff78779c8d43c27a20e2e97f0)
`npm` allows us to install all dependencies from `package.json` using a single command.
  1. Open the terminal in Visual Studio Code. You can toggle the terminal view under **View** > **Terminal**. If you want to start with a new terminal, go to **Terminal** > **New terminal**.
  2. In the terminal type `npm install` and press `Enter`.


If the dependencies were installed, there should be no errors highlighted in our files. You’ll also notice a new dropdown in the Explorer named `node_modules`.
A new dropdown directory will be available under **Explorer.** If you expand this, you’ll see a few starter files already exist in our project.
You can check that TypeScript was successfully installed in Visual Studio Code.
In Visual Studio Code, select **Terminal** > **New terminal**. Type `tsc -v` into the terminal and press `enter`.
The terminal should return the version of TypeScript you installed. If you’re not seeing this message, restart Visual Studio and run the command again.
### Plugin linter[​](https://developers.figma.com/docs/plugins/plugin-quickstart-guide/#plugin-linter "Direct link to Plugin linter")
Linting, the automated validation of source code for issues, can be very helpful for catching errors early in the development of your plugin. Figma provides a set of [typescript-eslint rules](https://github.com/figma/eslint-plugin-figma-plugins?tab=readme-ov-file#eslint-plugin-figma-plugins) to help support plugin development. These rules can identify, and in many cases automatically fix, issues in your plugin code.
When you create your plugin, the plugin linter is already included in the dependencies and ready to go. We provide the following configuration in `package.json`:
```
"eslintConfig": {  
  "extends": [  
    "eslint:recommended",  
    "plugin:@typescript-eslint/recommended",  
    "plugin:@figma/figma-plugins/recommended"  
  ],  
  "parser": "@typescript-eslint/parser",  
  "parserOptions": {  
    "project": "./tsconfig.json"  
  },  
  "root": true,  
  "rules": {  
    "@typescript-eslint/no-unused-vars": [  
      "error",  
      {  
        "argsIgnorePattern": "^_",  
        "varsIgnorePattern": "^_",  
        "caughtErrorsIgnorePattern": "^_"  
      }  
    ]  
  }  
}  

```

[Find the `eslint-plugin-figma-plugins` repository on GitHub →](https://github.com/figma/eslint-plugin-figma-plugins?tab=readme-ov-file)
## Set up TypeScript compilation[​](https://developers.figma.com/docs/plugins/plugin-quickstart-guide/#set-up-typescript-compilation "Direct link to Set up TypeScript compilation")
With your dependencies installed, all that's left for us to do is to make sure that TypeScript compiles to JavaScript in order for the plugin to run.
Since Figma plugins run in the browser, and browsers only support JavaScript, the `main` field in our manifest will **always** point to a JavaScript file.
Compilation is the process responsible for making sure that our TypeScript gets turned into usable JavaScript that allows our plugin to run.
![Illustration that shows the code.ts being compiled before being sent to Figma as a plugin](https://static.figma.com/uploads/91d10bd4458aa106ef287fc3dd1bfcd92a919bd2)
To setup your project to watch for changes then automatically compile:
  1. Hit `Ctrl`-`Shift`-`B` in Windows, or `Command`-`Shift`-`B` for Mac.
  2. Select **watch-tsconfig.json**


You’ll need to run this command each time you close the project folder or relaunch Visual Studio Code.
## Run the sample plugin[​](https://developers.figma.com/docs/plugins/plugin-quickstart-guide/#run-the-sample-plugin "Direct link to Run the sample plugin")
  1. Open up the design file you created in the Figma desktop app.
  2. Navigate to **Plugins** > **Development** , then select the name of your plugin.
  3. When the plugin modal pops up, click **Create** to run the plugin.


You should see five orange rectangles in the canvas.
![An animation of a plugin functioning in the Figma interface. The plugin window says "Rectangle creator" and shows a cursor entering the number "5" into a text input then hitting a "create" button which shows five rectangles being drawn on the Figma canvas.](https://static.figma.com/uploads/5edc8a8b67eddbf98ac3bd911b5c67ebefa0a6b8)
Your set up is now complete! Ready to start coding your first plugin? Check out the [fourth video](https://www.youtube.com/watch?v=ExwP3Kmh-vI) in our [Build Your First Plugin video series](https://www.youtube.com/watch?v=-JAphRkjV9g&list=PLXDU_eVOJTx5YBAszyuOTyxlgIxkQVyii).
## Hot reloading[​](https://developers.figma.com/docs/plugins/plugin-quickstart-guide/#hot-reloading "Direct link to Hot reloading")
Figma provides the option to hot reload your plugin to speed up the development process. As you edit the plugin code and rebuild, the plugin will automatically restart with the latest changes. If turned off, you will need to manually restart the plugin.
![Hot reloading setting](https://static.figma.com/uploads/d8cf8d1e1f383f26fa6c800a33dbcfdaf201a807)
[Previous Prerequisites](https://developers.figma.com/docs/plugins/prerequisites/)[Next Setting editor type](https://developers.figma.com/docs/plugins/setting-editor-type/)
  * [Download tools](https://developers.figma.com/docs/plugins/plugin-quickstart-guide/#download-tools)
  * [Create a new plugin](https://developers.figma.com/docs/plugins/plugin-quickstart-guide/#create-a-new-plugin)
  * [Open the plugin code folder](https://developers.figma.com/docs/plugins/plugin-quickstart-guide/#open-the-plugin-code-folder)
  * [Install project dependencies](https://developers.figma.com/docs/plugins/plugin-quickstart-guide/#install-project-dependencies)
    * [Node.js and npm](https://developers.figma.com/docs/plugins/plugin-quickstart-guide/#nodejs-and-npm)
    * [TypeScript](https://developers.figma.com/docs/plugins/plugin-quickstart-guide/#typescript)
    * [Plugin linter](https://developers.figma.com/docs/plugins/plugin-quickstart-guide/#plugin-linter)
  * [Set up TypeScript compilation](https://developers.figma.com/docs/plugins/plugin-quickstart-guide/#set-up-typescript-compilation)
  * [Run the sample plugin](https://developers.figma.com/docs/plugins/plugin-quickstart-guide/#run-the-sample-plugin)
  * [Hot reloading](https://developers.figma.com/docs/plugins/plugin-quickstart-guide/#hot-reloading)


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

