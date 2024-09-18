// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { lookupTrustUri } from './xpoc-lib.js';

console.log('offscreen.js loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request?.type === 'lookupTrustUri') {
        lookupTrustUri(request.tabUrl, request.url).then((result) => {
            sendResponse(result);
        });
    }

    return true; // true = async response
});
