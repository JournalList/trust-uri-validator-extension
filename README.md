# trust-uri-validator-extension
This project contains a Edge/Chrome/Firefox Browser Extension to validate a Trust URI present in a social media account page, as specified in [Internet-Draft Organization Trust Relationship Protocol](https://datatracker.ietf.org/doc/draft-org-trust-relationship-protocol/).

The code is based on the Microsoft [sample browser extension](https://github.com/microsoft/xpoc-framework/tree/main/samples/browser-extension) from the [Cross-Platform Origin of Content (XPOC) Framework](https://microsoft.github.io/xpoc-framework/); it also uses that project's library to canonicalize account URLs.

## Setup

1. Build the extension

Make sure [node.js](https://nodejs.org/) and [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) are installed on your system; the latest Long-Term Support (LTS) version is recommended for both.

To build the extension locally, run:

```
npm install
npm run build
```

2. Install the extension in a browser:  

<div style="padding-left: 2em">
Follow the side-loading instruction for your browser to load the extension:

[Edge](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/getting-started/extension-sideloading)  
[Chrome](https://developer.chrome.com/docs/extensions/mv3/getstarted/development-basics/#load-unpacked)  
[Firefox](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/) 

The Edge/Chrome `manifest.json` file is located at `dist/chrome`  
The Firefox `manifest.json` file is located at `dist/firefox`  

Firefox requires additional extension permissions to download manifests from external sites
1) In the Firefox address bar go to `about:addons` to see the installed extensions
2) Find **Trust URI Validator Extension** and click the `...` button to the right
3) Select **Manage** from the pop-up menu
4) Click the **Permission** tab
5) Enable **Access your data for all websites**
</div>

## Usage

When visiting a page with a Trust URI (for example, `trust://example.com!`), right-click on the URI text and select **Verify Trust URI link** from the context menu. The extension will fetch the corresponding trust.txt file and determine if the current page is indeed listed within it. The extension can automatically find and verify the Trust URIs in a page if the extension's **Verify Trust URI automatically** option is enabled (in the popup's Options tab).
