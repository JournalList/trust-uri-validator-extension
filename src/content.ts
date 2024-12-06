// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { debug } from './xpoc-lib';

import { ContentPopup } from './control';
import { CHECKMARK_URL, Icon, INVALID_URL, WARNING_URL } from './icon';
import DomScanner from './scanner';
import { type lookupTrustUriResult } from './xpoc-lib';
import { contextMenuResult, contextTarget } from './context';

const TRUSTTXT_PATTERN = /trust:\/\/([a-zA-Z0-9.-]+)(\/[^!\s<]*)?!?/;
const skipHiddenNodes = false;
const SUCCESS_COLOR = '#5B9BD5';
const ERROR_COLOR = '#E43A19';
const WARNING_COLOR = '#F5C343';

/*
    Instantiate the DomScanner and popup control
*/
const scanner = new DomScanner(nodeTest, addCallback, removeCallback);
const contentPopup = new ContentPopup();

/* 
    Called after background.js has processed the context menu click
    Context menu clicks are captured and handled in the background.js
*/
contextMenuResult((result: unknown) => {
    if (debug) { console.log('Validator - contextMenuResult:', result); }
    addIcon(contextTarget as Node);
    showTrustPopup(contextTarget as Node, result as lookupTrustUriResult);
});

/*
    Listen for messages from background.js
*/
chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'autoScanUpdated') {
        request.autoScan ? scanner.start() : scanner.stop();
    }
});

/**
 * Call background to lookup the trustUri
 *
 * @param {string} trustUri
 * @returns Promise<lookupTrustUriResult>
 */
const lookupTrustUri = async (trustUri: string): Promise<lookupTrustUriResult> => {
    return await new Promise((resolve): void => {
        chrome.runtime.sendMessage(
            { action: 'lookupTrustUri', trustUri },
            (result) => {
                resolve(result);
            },
        );
    });
};

/**
 * Converts an trust URI to a base URL.
 * @param trustUri - The trust URI to convert.
 * @returns The base URL.
 */
const getBaseURL = (trustUri: string): string =>
    trustUri
        .replace(/^trust:\/\//, 'https://')
        .replace(/!$/, '')
        .replace(/\/$/, '');

/**
 * The function `autoScanPage` checks if a certain flag is set in the local storage and starts a
 * scanner if the flag is true.
 */
(function autoScanPage() {
    chrome.storage.local.get(['autoVerifyTrustUris'], (result) => {
        const autoValidateTrustUris = !!result?.autoVerifyTrustUris;
        if (autoValidateTrustUris) {
            scanner.start();
        }
    });
})();

/**
 * Adds an icon to the specified node.
 *
 * @param node - The node to add the icon to.
 */
const addIcon = (node: Node) => {
    if (debug) { console.log(`Validator - addIcon: ${node.textContent}`); }

    // We can choose to bypass nodes that are initially hidden. However, there's a complication if a node that
    // starts off hidden later becomes visible. In such cases, re-scanning the node when it becomes visible is a
    // challenging task to detect. Therefore, for the time being, we will scan all nodes.
    if ((node as Text).textContent !== '') {
        const parentElement = node.parentNode as HTMLElement;
        if (skipHiddenNodes && isStyleVisible(parentElement) === false) {
            return;
        }

        // Check if the node contains a Trust.txt URI
        const trustMatch = TRUSTTXT_PATTERN.exec((node as Text).textContent ?? '');
        const trustUri = trustMatch?.[0] as string;

        if (debug) { console.log('Validator - addIcon: trustMatch:',trustMatch, 'trustUri:', trustUri); }

        lookupTrustUri(trustUri).then((result) => {
            const icon = new Icon(node, trustUri, result);
            icon.onClick = () => {
                const trustResult = result as lookupTrustUriResult;
                showTrustPopup(icon.img as HTMLElement, trustResult);
            };
            if (debug) { console.log(`Validator - addIcon: result: ${JSON.stringify(result)}`); }
        });
    }
};

/**
 * Displays the popup based on the provided trustResult.
 *
 * @param {Node} targetNode - The target node where the popup will be displayed.
 * @param {lookupTrustUriResult} trustResult - The result of the Trust URI lookup.
 */
function showTrustPopup(targetNode: Node, trustResult: lookupTrustUriResult) {
    if (debug) { console.log("Validator - showTrustPopup: trustResult:", trustResult); }
    if (trustResult.type === 'notFound') {
        contentPopup.show(
            targetNode as HTMLElement,
            'Trust URI Error',
            ERROR_COLOR,
            chrome.runtime.getURL('icons/invalid.svg'),
            [
                {
                    title: 'Error',
                    Message: `This page is not listed in the trust.txt file at ${getBaseURL(
                        trustResult.baseurl,
                    )}`,
                },
            ],
        );
    }

    if (trustResult.type === 'error') {
        contentPopup.show(
            targetNode as HTMLElement,
            'Trust URI Error',
            ERROR_COLOR,
            chrome.runtime.getURL('icons/invalid.svg'),
            [
                {
                    title: 'Error',
                    Message: `Failed to fetch trust.txt file from ${getBaseURL(
                        trustResult.baseurl,
                    )}`,
                },
            ],
        );
    }

    if (trustResult.type === 'account') {
        if (trustResult.version === 'trust.txt-draft00') {
            const platformMessage = trustResult.account.platform ? `${trustResult.account.platform} account ${trustResult.account.account}` : `Account ${trustResult.account.account}`;
            contentPopup.show(
                targetNode as HTMLElement,
                'Trust.txt match',
                SUCCESS_COLOR,
                chrome.runtime.getURL('icons/xpoc_logo.svg'),
                [
                    {
                        Message: `${platformMessage} found in trust.txt file at ${trustResult.baseurl}`
                    }
                ],
            );
        } else {
            contentPopup.show(
                targetNode as HTMLElement,
                'Trust Information',
                SUCCESS_COLOR,
                chrome.runtime.getURL('icons/xpoc_logo.svg'),
                [
                    {
                        title: 'Origin',
                        Name: trustResult.name,
                        Website: `<a href='https://${trustResult.baseurl}' target='_blank'>${trustResult.baseurl}</a>`,
                    },
                    {
                        title: 'Account',
                        URL: `<a href='${trustResult.account.url}' target='_blank'>${trustResult.account.url}</a>`,
                        Account: trustResult.account.account,
                    },
                ],
            );
        }
    }
    if (trustResult.type === 'multiple') {
        const tables = [{title: "", Message: ""}];
        let count = 0;
        for (const item of trustResult.list) {
            tables[count] = {title: item.status, Message: item.message};
            count += 1;
        }
        if (debug) { console.log("Validator - showTrustPopup: tables:", tables); }
        contentPopup.show(
            targetNode as HTMLElement,
            getPopUpMessage(trustResult.list),
            getPopUpColor(trustResult.list),
            chrome.runtime.getURL(getIconUrl(trustResult.list)),
            tables
        );
    }
}

function nodeTest(node: Node): boolean {
    if (
        node.textContent == null ||
        node.nodeName === 'SCRIPT' ||
        node?.parentElement?.nodeName === 'SCRIPT'
    ) {
        return false;
    }
    return TRUSTTXT_PATTERN.test(node.textContent);
}

function addCallback(node: Node): void {
    if (debug) { console.log(`Validator - addCallback: Scanner2: add: ${node.textContent}`); }
    addIcon(node);
}

function removeCallback(node: Node): void {
    if (debug) { console.log(`Validator - removeCallback: Scanner2: remove: ${node.textContent}`); }
    if (
        (node as HTMLElement).nodeName === 'IMG' &&
        (node as HTMLElement).hasAttribute('trust')
    ) {
        if (debug) { console.log(`Validator removeCallback: remove: ${node as HTMLElement}`); }
    }
}

/**
 * Determines if an element is visually rendered in the document.
 * Checks if the element is part of the document and if its computed style
 * makes it visually perceivable (not `display: none`, `visibility: hidden`, or `opacity: 0`).
 * Also checks if the element has non-zero dimensions.
 * @param {Element} element - The DOM element to check.
 * @returns {boolean} - Returns `true` if the element is visually rendered, otherwise `false`.
 */
function isStyleVisible(element: Element): boolean {
    if (!document.body.contains(element)) {
        return false;
    }
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return !(
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        parseFloat(style.opacity) === 0 ||
        rect.width === 0 ||
        rect.height === 0
    );
}

/**
 * Returns the appropriate icon type based on multiple status results
 * @param {[{status: string, domain: string, message: string}]} list
 * @returns {string}
 */
export function getIconUrl (list: [{status: string, domain: string, message: string}]) {
    let iconType = INVALID_URL;
    let found = false;
    let notfound = false;
    let error = false;
    for (const item of list) {
        switch (item.status) {
            case 'found':
                found = true;
                break;
            case 'not found':
                notfound = true;
                break;
            case 'error':
                error = true;
                break;
        }
    }
    // If no corresponding attribute entry found, use 'error' icon 
    if (!found) {
        iconType = INVALID_URL;
    } else {
        // If a corresponding attribute entry is found and there are no 'not found' and 'error' status, use 'checkmark' icon
        if (!notfound && !error) {
            iconType = CHECKMARK_URL;
        } else {
            // Otherwise use 'warning' icon
            iconType = WARNING_URL;
        }
    }
    return (iconType)
}

/**
 * Returns the appropriate color based on multiple status results
 */
function getPopUpColor (list: [{status: string, domain: string, message: string}]) {
    if (debug) { console.log('Validator - getPopUpColor: list', list); }
    let color = ERROR_COLOR;
    let found = false;
    let notfound = false;
    let error = false;
    for (const item of list) {
        switch (item.status) {
            case 'found':
                found = true;
                break;
            case 'not found':
                notfound = true;
                break;
            case 'error':
                error = true;
                break;
        }
    }
    if (debug) { console.log('Validator - getPopUpColor: found', found, 'notfound', notfound, 'error', error); }
    // If no corresponding attribute entry found, use 'error' icon 
    if (!found) {
        color = ERROR_COLOR;
    } else {
        // If a corresponding attribute entry is found and there are no 'not found' and 'error' status, use 'checkmark' icon
        if (!notfound && !error) {
            color = SUCCESS_COLOR;
        } else {
            // Otherwise use 'warning' icon
            color = WARNING_COLOR;
        }
    }
    if (debug) { console.log('Validator - getPopUpColor: list', color); }
    return (color)
}

/**
 * Returns the appropriate color based on multiple status results
 */
function getPopUpMessage (list: [{status: string, domain: string, message: string}]) {
    if (debug) { console.log('Validator - getPopUpColor: list', list); }
    let message = 'Trust URI Error';
    let found = false;
    let notfound = false;
    let error = false;
    for (const item of list) {
        switch (item.status) {
            case 'found':
                found = true;
                break;
            case 'not found':
                notfound = true;
                break;
            case 'error':
                error = true;
                break;
        }
    }
    if (debug) { console.log('Validator - getPopUpMessage: found', found, 'notfound', notfound, 'error', error); }
    // If no corresponding attribute entry found, use 'error' icon 
    if (!found) {
        message = 'Trust URI Error';
    } else {
        // If a corresponding attribute entry is found and there are no 'not found' and 'error' status, use 'checkmark' icon
        if (!notfound && !error) {
            message = 'Trust URI Match';
        } else {
            // Otherwise use 'warning' icon
            message = 'Trust URI Warning';
        }
    }
    if (debug) { console.log('Validator - getPopUpMessage: list', message); }
    return (message)
}
