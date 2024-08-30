// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
    Platforms,
    type Account
} from 'xpoc-ts-lib';

const DOWNLOAD_TIMEOUT = Number.parseInt(
    process.env.DOWNLOAD_TIMEOUT ?? ('5000' as string),
);

/**
 * Retrieves the base URL from a given URL by removing any query parameters and trailing slashes.
 * @param url - The input URL.
 * @returns The base URL.
 */
export function getBaseURL(url: string) {
    const urlObj = new URL(url);
    const searchParams = urlObj.searchParams;
    const queryParams: string[] = [];
    const queryParamsString =
        queryParams.length > 0 ? '?' + queryParams.join('&') : '';
    const baseURL = (
        urlObj.origin +
        urlObj.pathname +
        queryParamsString
    ).replace(/\/$/, '');
    return baseURL;
}

function getUrlFromUri(uri: string): string {
   return uri
        // replace the trust:// prefix with https://
        .replace(/^trust:\/\//, 'https://')
        // remove trailing !
        .replace(/!$/, '')
        // remove trailing slash, if present
        .replace(/\/$/, '') +
    // append the file path
    '/.well-known/trust.txt';
}

/**
 * Fetches data from the specified URL with a timeout.
 * @param url - The URL to fetch data from.
 * @param options - The options for the fetch request.
 * @param timeout - The timeout duration in milliseconds.
 * @returns A promise that resolves to the fetched data or an error.
 */
async function fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    timeout = DOWNLOAD_TIMEOUT,
): Promise<Response | Error> {
    // add controller to options so we can abort the fetch on timeout
    const controller = new AbortController();
    const signal = controller.signal;

    options = {
        ...options,
        signal,
        method: options.body == null ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json' },
    };

    const timeoutId = setTimeout(() => {
        controller.abort();
    }, timeout);

    const response: Response | Error = await fetch(url, { ...options, signal })
        .catch((error) => {
            console.log('fetch error', error);
            // if the fetch was aborted, throw a timeout error instead
            if (error.name === 'AbortError') {
                return new Error(`HTTP timeout of ${timeout}ms to ${url}`);
            } else {
                return new Error(`HTTP error: ${error}`);
            }
        })
        .finally(() => {
            clearTimeout(timeoutId);
        });

    if (response instanceof Error) {
        return response;
    }

    if (!response.ok) {
        return new Error(`HTTP error: ${response.status}`);
    }

    return response
}

async function fetchText (
        url: string,
        options: RequestInit = {},
        timeout = DOWNLOAD_TIMEOUT,
    ): Promise<string | Error> {
        const responseOrError = await fetchWithTimeout(url, options, timeout);
        if (responseOrError instanceof Error) {
            return responseOrError;
        }
        const response = responseOrError as Response;

        return await response.text().catch((error: Error) => {
            return new Error(`text parse error: ${error}`);
        });
    }

export type lookupTrustUriResult =
    | {
          type: 'account';
          name: string;
          baseurl: string;
          version: string;
          account: Account;
      }
    | {
          type: 'notFound';
          baseurl: string;
      }
    | {
          type: 'error';
          baseurl: string;
          message: string;
      };

/**
 * A trust.txt file.
 */
export type TrustTxtFile = {
    member: string[];
    belongto: string[];
    control: string[];
    controlledby: string[];
    social: string[];
    vendor: string[];
    customer: string[];
    disclosure: string[];
    contact: string[];
    datatrainingallowed: boolean;
};

/**
 * Downloads the trust.txt file for the given trust URI.
 * @param trustUri The trust URI.
 * @returns A promise that resolves to the downloaded trust.txt file or an Error object if the URI is invalid.
 */
async function downloadTrustTxt(
    trustUri: string,
): Promise<TrustTxtFile | Error> {
    if (!trustUri.startsWith('trust://')) {
        return new Error(`Invalid trust URI: ${trustUri}`);
    }

    const trustUrl = getUrlFromUri(trustUri);
    const trustTxtContent = await fetchText(trustUrl);
    if (trustTxtContent instanceof Error) {
        return trustTxtContent;
    }
    const trustTxtFile = parseTrustTxt(trustTxtContent);
    return trustTxtFile;
}

function parseTrustTxt(trustTxtContent: string): TrustTxtFile {
    const trustTxtFile: TrustTxtFile = {
        member: [],
        belongto: [],
        control: [],
        controlledby: [],
        social: [],
        vendor: [],
        customer: [],
        disclosure: [],
        contact: [],
        datatrainingallowed: false
    }

    const lines = trustTxtContent.split('\n');
    for (const line of lines) {
        const cleanedLine = line.trim();

        // Skip empty lines and comments
        if (!cleanedLine || cleanedLine.startsWith('#')) {
            continue;
        }

        const [variable, value] = cleanedLine.split('=');

        if (!variable || !value) {
            continue;
        }

        const cleanedVariable = variable.trim().toLowerCase();
        const trimmedValue = value.trim();

        switch (cleanedVariable) {
            case 'member':
                trustTxtFile.member.push(trimmedValue);
                break;
            case 'belongto':
                trustTxtFile.belongto.push(trimmedValue);
                break;
            case 'control':
                trustTxtFile.control.push(trimmedValue);
                break;
            case 'controlledby':
                trustTxtFile.controlledby.push(trimmedValue);
                break;
            case 'social':
                trustTxtFile.social.push(trimmedValue);
                break;
            case 'vendor':
                trustTxtFile.vendor.push(trimmedValue);
                break;
            case 'customer':
                trustTxtFile.customer.push(trimmedValue);
                break;
            case 'disclosure':
                trustTxtFile.disclosure.push(trimmedValue);
                break;
            case 'contact':
                trustTxtFile.contact.push(trimmedValue);
                break;
            case 'datatrainingallowed':
                trustTxtFile.datatrainingallowed = trimmedValue.toLowerCase() === 'yes';
                break;
            default:
                console.warn(`Unknown variable: ${cleanedVariable}`);
        }
    }

    return trustTxtFile;
}

/**
 * Looks up the trust URI for a given tab URL and trust URL.
 * @param tabUrl The URL of the tab.
 * @param xpocUrl The URL of the trust.txt file.
 * @returns A promise that resolves to the lookup result.
 */
export async function lookupTrustUri(
    tabUrl: string,
    trustUrl: string,
): Promise<lookupTrustUriResult> {
    console.log('lookupTrustUri called', tabUrl, trustUrl);
    const trustTxtFile = await downloadTrustTxt(trustUrl);

    if (trustTxtFile instanceof Error) {
        console.log('Error fetching trust.txt file:', trustTxtFile.message);
        return {
            type: 'error',
            baseurl: trustUrl,
            message: `Error fetching trust.txt file: ${trustTxtFile.message}`,
        };
    }

    // check each trust.txt file social account to see if it matches the current tab url
    tabUrl = getBaseURL(tabUrl as string);
    const matchingAccountUrl = trustTxtFile.social?.find((account: string) => {
        // get the platform object for this account
        const platform = Platforms.isSupportedAccountUrl(account)
            ? Platforms.getPlatformFromAccountUrl(account)
            : undefined;
        if (platform && platform?.isValidAccountUrl(tabUrl)) {
            const canonicalizedTabUrl = platform.canonicalizeAccountUrl(tabUrl);
            const canonicalizedAccountUrl = platform.canonicalizeAccountUrl(account);
            return (
                canonicalizedTabUrl.account.toLowerCase() === canonicalizedAccountUrl.account.toLowerCase()
            );
        }
        // tab url possibly matches this account but is not a supported platform
        else {
            if (tabUrl === getBaseURL(account)) {
                return true;
            }
        }
        return false;
    });

    if (matchingAccountUrl) {
        console.log('Content found in trust.txt file', matchingAccountUrl);
        const platform = Platforms.getPlatformFromAccountUrl(matchingAccountUrl)?.DisplayName || '';
        let account = matchingAccountUrl;
        if (platform) {
            account = Platforms.getPlatform(platform).canonicalizeAccountUrl(matchingAccountUrl).account;
        }
        const url = getUrlFromUri(trustUrl);
        const domain = new URL(url).hostname;
        return {
            type: 'account',
            name: domain,
            baseurl: domain,
            version: 'trust.txt-draft00',
            account: {
                account: account,
                platform: platform
            }
        };
    }

    console.log('Content not found in manifest');
    return { type: 'notFound', baseurl: trustUrl };
}
