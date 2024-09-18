// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { type trustResultSet } from './background';
import { getLocalStorage } from './storage';
import { type lookupTrustUriResult } from './xpoc-lib';

document.addEventListener('DOMContentLoaded', function (): void {
    // Add event listeners to switch tabs
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');
    tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs and tab contents
            tabs.forEach((t) => t.classList.remove('active'));
            tabContents.forEach((c) => c.classList.remove('active-content'));

            // Add active class to clicked tab and tab content
            tab.classList.add('active');
            const tabContentId = tab.getAttribute('data-tab') ?? '';
            document
                .getElementById(tabContentId)
                ?.classList.add('active-content');
        });
    });
    showResults().then(() => {
        console.log('results shown');
    });
});

const autoVerifyTrustUris = document.getElementById(
    'auto-verify-trust-uri-toggle',
) as HTMLInputElement;

chrome.storage.local.get(['autoVerifyTrustUris'], (result) => {
    autoVerifyTrustUris.checked = !!result?.autoVerifyTrustUris;
});

autoVerifyTrustUris.addEventListener('change', async () => {
    console.log('autoVerifyTrustUris changed');
    const checked = autoVerifyTrustUris.checked;
    chrome.storage.local.set({ autoVerifyTrustUris: checked }, async () => {
        const activeTab = await getActiveTab();
        if (activeTab.id) {
            chrome.tabs.sendMessage(activeTab.id, {
                action: 'autoScanUpdated',
                autoScan: checked,
            });
        }
        console.log('autoVerifyTrustUris is set to ' + checked);
    });
});

/**
 * The function `getTrustResultsForCurrentTab` retrieves trust results from local storage for the current
 * tab's URL.
 * @returns an array of objects, where each object has a key-value pair. The key is a string
 * representing an trust URI, and the value is a lookupTrustUriResult.
 */
async function getTrustResultsForCurrentTab(): Promise<
    { [trustUri: string]: lookupTrustUriResult }[]
> {
    const storageObj = ((await getLocalStorage('trustResults')) as {
        trustResults: trustResultSet;
    }) ?? { trustResults: {} };
    const currentTabUrl = await getActiveTabUrl().catch(() => '');
    if (!currentTabUrl || !storageObj || !storageObj.trustResults) {
        return [];
    }
    const obj = storageObj.trustResults[currentTabUrl];
    if (!obj) {
        return [];
    }
    return Object.keys(obj).map((key) => ({ [key]: obj[key] }));
}

/**
 * Gets the URL of the currently active tab.
 * @returns a Promise that resolves to a string.
 */
async function getActiveTabUrl(): Promise<string> {
    return getActiveTab()
        .then((tab) => {
            return tab.url as string;
        })
        .catch(() => '');
}

/**
 * Gets the currently active tab.
 * @returns a Promise that resolves to a Tab.
 */
async function getActiveTab(): Promise<chrome.tabs.Tab> {
    return new Promise((resolve, reject) => {
        chrome.tabs.query(
            { active: true, currentWindow: true },
            (tabs: chrome.tabs.Tab[]) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError.message);
                } else if (tabs.length > 0) {
                    resolve(tabs[0]);
                } else {
                    reject('No active tab found.');
                }
            },
        );
    });
}

/**
 * Displays the results in the popup based on trust information.
 * @returns {Promise<void>} A promise that resolves when the results are displayed.
 */
async function showResults() {
    // check for trust result
    const originInfo = document.getElementById('origin-info') as HTMLDivElement;
    const trustResults = await getTrustResultsForCurrentTab();
    if (trustResults.length > 0) {
        // hide the 'no-origin' div
        const noOrigin = document.getElementById('no-origin') as HTMLDivElement;
        noOrigin.style.display = 'none';

        // show the origin info div
        originInfo.style.display = 'block';

        // clear the origin info div
        originInfo.innerHTML = '';
        // we only show the first result (TODO: handle multiple; could be the same one, need to make more robust)
        const trustResult = Object.values(
            trustResults[0],
        )[0] as lookupTrustUriResult;
        console.log(`Trust result: ${trustResult.type}`);
        if (trustResult.type === 'account') {
            let account = '';
            let platform = '';
            let prefix = '';
            const baseurl = `https://${trustResult.baseurl}`;
            const url = `${baseurl}/.well-known/trust.txt`;
            if (trustResult.type == 'account') {
                account = trustResult.account.account;
                platform = trustResult.account.platform;
                prefix = `${platform} account "${account}"`;
            }
            const resultDiv = document.createElement('div');
            resultDiv.classList.add('result');
            if (trustResult) {
                resultDiv.innerHTML = `
          <div class="trust-result-info">
            ${prefix} found in ${trustResult.name}'s <a href="${url}" target="_blank">manifest</a> at <a href="${baseurl}" target="_blank">${trustResult.baseurl}</a><br>
          </div>
        `;
            }
            originInfo.appendChild(resultDiv);
        }
    }
}
