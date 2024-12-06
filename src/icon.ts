// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { debug } from './xpoc-lib';

import { type lookupTrustUriResult } from './xpoc-lib';
import { getIconUrl } from './content';

// define icon types (checkmark, invalid, and warning)
export const CHECKMARK_URL: string = chrome.runtime.getURL('icons/checkmark.svg',);
export const INVALID_URL: string = chrome.runtime.getURL('icons/invalid.svg');
export const WARNING_URL: string = chrome.runtime.getURL('icons/warning.svg');
export const UNKOWN_URL: string = chrome.runtime.getURL('icons/unknown.svg');

const PATTERN = /trust:\/\/([a-zA-Z0-9.-]+)(\/[^!\s<]*)?!?/;

/* 
    The `Icon` class is a TypeScript class that represents an icon element with various 
    properties and methods for creating and manipulating the icon. 
*/
export class Icon {
    img: Node;
    constructor(
        public node: Node,
        public trustUri: string,
        public status: lookupTrustUriResult,
    ) {
        this.img = Icon.createIcon(status);
        this.setIcon();
    }

    /**
     * Creates an icon element based on the provided status.
     * @param status - The status of the icon.
     * @returns The created HTMLImageElement representing the icon.
     * @throws Error if the status is unknown.
     */
    static createIcon(result: lookupTrustUriResult,
    ): HTMLImageElement {
        let path: string;
        if (debug) { console.log('Validator - createIcon:', result.type); }
        switch (result.type) {
            case 'notFound':
            case 'error':
                path = INVALID_URL;
                break;
            case 'account':
                path = CHECKMARK_URL;
                break;
            case 'multiple':
                path = getIconUrl(result.list);
                break;
            default:
                throw new Error('Unknown status');
        }
        const img = document.createElement('img');
        img.style.height = '1.5em';
        img.style.width = '1.5em';
        img.setAttribute('src', path);
        img.setAttribute('trust', 'trustIcon');
        return img;
    }

    /**
     * Sets the icon for the node.
     *
     * @param replaceLink - Indicates whether to replace the link in the text content.
     * @returns void
     */
    public setIcon(replaceLink: boolean = false): void {
        const node = this.node;
        const img = this.img;
        const textNode = node as Text;
        const text = textNode.textContent ?? '';

        // remove the link from the text content, if requested
        if (replaceLink) {
            node.textContent = text.replace(PATTERN, '');
        }

        node.parentElement?.setAttribute('trust', 'trustLink');

        if (
            !(
                node.nextSibling instanceof HTMLImageElement &&
                node.nextSibling?.getAttribute('trust') === 'trustIcon'
            )
        ) {
            if (!textNode.textContent?.endsWith(' ')) {
                textNode.textContent += ' ';
            }
            // inserts the image after the text node
            // (this works even if there is no next sibling)
            node.parentNode?.insertBefore(img, node.nextSibling);
        }
    }

    /**
     * Sets the click event handler for the icon.
     * @param value - The callback function to be executed when the icon is clicked.
     */
    set onClick(value: () => void) {
        this.img.addEventListener('click', () => {
            setTimeout(value);
        });
    }
}
