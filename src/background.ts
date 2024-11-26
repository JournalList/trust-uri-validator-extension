// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { getLocalStorage, setLocalStorage } from './storage.js';
import { lookupTrustUri, type lookupTrustUriResult } from './xpoc-lib.js';
import { contextMenuRequest, clickedText } from './context.js';

/*
    Represents a result set for a trust URI lookup
*/
export type trustResultSet = {
    [url: string]: {
        [trustUri: string]: lookupTrustUriResult;
    };
};

/*
    Runs only when the extension is installed for the first time.
*/
chrome.runtime.onInstalled.addListener(function (details) {
    if (details.reason === 'install') {
        chrome.storage.local.set({ autoVerifyTrustUris: true });
    }
});

/*
    Listens for request from content script to lookup Trust URI.
*/
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.action === 'lookupTrustUri') {
        console.log('Background: message = lookupTrustUri');
        const trustUri = message.trustUri;
        const tabUrl = (sender.tab as chrome.tabs.Tab).url as string;
        lookupTrustUri(sender.tab?.url as string, trustUri).then((result) => {
            storeTrustResult(tabUrl as string, clickedText, result);
            sendResponse(result);
        });
    }
    return true;
});

/* 
    The `contextMenuRequest` function is a callback function that is executed when a context menu item
    is clicked. 
*/
contextMenuRequest(async (info, clickedText, tab) => {
    if (info.menuItemId === 'verifyTrustUri') {
        const tabUrl = (tab as chrome.tabs.Tab).url as string;
        const trustUrl = clickedText;
        const result = await lookupTrustUri(tabUrl, trustUrl);
        if (result.type === 'account') {
            await storeTrustResult(tabUrl as string, trustUrl, result);
        }
        return result;
    }
});

/* 
   Event listener triggered when a tab is activated in the browser. 
*/
chrome.tabs.onActivated.addListener((activeInfo) => {
    // activeInfo.tabId will give you the ID of the newly activated tab
    console.log('Tab', activeInfo.tabId, 'was activated');
    // display the default icon first
    updateActionIcon('icons/unknown128x128.png');
    // You can retrieve more information about the tab using chrome.tabs.get
    chrome.tabs.get(activeInfo.tabId, function (tab) {
        console.log('The active tab\'s URL is', tab.url);
        // check if we have an origin result for this url
        getLocalStorage('trustResults').then((storageObj) => {
            const currentTabUrl = tab.url as string;
            if (storageObj.trustResults[currentTabUrl]) {
                console.log('Found results for', currentTabUrl);
                // we already have a result for this url, so update the icon
                const trustResult = storageObj.trustResults[currentTabUrl] as {
                    [trustUri: string]: lookupTrustUriResult;
                };
                console.log('trustResult:', JSON.stringify(trustResult));
                const type = trustResult[Object.keys(trustResult)[0]].type;
                if (type === 'account') {
                    updateActionIcon('icons/valid128x128.png');
                } else if (type === 'notFound' || type === 'error') {
                    updateActionIcon('icons/invalid128x128.png');
                }
            }
        });
    });
});

/**
 * Updates the action icon with the image located at the specified path.
 * @param path - The path to the image.
 * @returns A promise that resolves once the action icon is updated.
 */
async function updateActionIcon(path: string) {
    // code below from the Chrome Extension samples
    // There are easier ways for a page to extract an image's imageData, but the approach used here
    // works in both extension pages and service workers.
    const response = await fetch(chrome.runtime.getURL(path));
    const blob = await response.blob();
    const imageBitmap = await createImageBitmap(blob);
    const osc = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const ctx = osc.getContext('2d');
    ctx?.drawImage(imageBitmap, 0, 0);
    const imageData = ctx?.getImageData(0, 0, osc.width, osc.height);
    chrome.action.setIcon({ imageData });
}

/**
 * Stores the origin result for a given URL and trust URI.
 *
 * @param url - The URL for which the origin result is being stored.
 * @param trustUri - The trust URI for which the origin result is being stored.
 * @param result - The origin result to be stored.
 * @returns A Promise that resolves when the origin result is stored.
 */
async function storeTrustResult(
    url: string,
    trustUri: string,
    result: lookupTrustUriResult,
): Promise<void> {
    console.log('storing origin result for', url, 'and', trustUri);
    // update the toolbar icon
    console.log('origin result:', result.type);
    if (result.type === 'error' || result.type === 'notFound') {
        // "notFound" in manifest is also an error
        await updateActionIcon('icons/invalid128x128.png');
    } else {
        await updateActionIcon('icons/valid128x128.png');
    }
    // store the result
    const trustResultsSet = (await getLocalStorage('trustResults')) as {
        trustResults: trustResultSet;
    };
    trustResultsSet.trustResults[url] = trustResultsSet.trustResults[url] || {};
    trustResultsSet.trustResults[url][trustUri] = result;
    await setLocalStorage(trustResultsSet);
}
