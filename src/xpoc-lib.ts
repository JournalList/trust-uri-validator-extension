// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

export const debug = false;

import {
    Platforms,
    type Account
} from 'xpoc-framework';

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

function getDomainFromUrl (url: string): string {
    return getBaseURL(url).replace('www.','')
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
    if (debug) { console.log('Validator - fetchWithTimeout:', url, options, timeout); }
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
            if (debug) { console.log('Validator - fetchWithTimeout: fetch error', error); }
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
        type: 'multiple';
        list:
            [{
                status: string,
                domain: string,
                message: string
            }]
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
 * Looks up the trust URI for the given tab URL and trust URI.
 * @param tabUrl The URL of the tab.
 * @param trustUri The Trust URI that references the domain for the trust.txt file.
 * @returns A promise that resolves to the lookup result.
 */
export async function lookupTrustUri(
    tabUrl: string,
    trustUri: string,
): Promise<lookupTrustUriResult> {
    if (debug) { console.log('Validator - lookupTrustUri:', tabUrl, trustUri); }
    const trustTxtFile = await downloadTrustTxt(trustUri);

    if (trustTxtFile instanceof Error) {
        if (debug) { console.log('Validator - lookupTrustUri: Error fetching trust.txt file:', trustTxtFile.message); }
        return {
            type: 'error',
            baseurl: trustUri,
            message: `Error fetching trust.txt file: ${trustTxtFile.message}`,
        };
    }
    // check if the trustUri domain and the tabUrl domain match
    const tabDomain = new URL (tabUrl).hostname.replace('www.','');
    const trustDomain = new URL (getUrlFromUri(trustUri)).hostname;
    if (debug) { console.log('Validator - lookupTrustUri: tabDomain', tabDomain, 'trustDomain', trustDomain); }
    if (tabDomain != trustDomain) {
        // check each trust.txt file social account to see if it matches the current tab url
        tabUrl = getBaseURL(tabUrl as string);
        const matchingAccountUrl = trustTxtFile.social?.find((account: string) => {
            // get the platform object for this account
            const platform = Platforms.isSupportedAccountUrl(account)
                ? Platforms.getPlatformFromAccountUrl(account)
                : undefined;
            if (debug) { console.log('Validator - lookupTrustUri: platform', platform); }
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
            if (debug) { console.log('Validator - lookupTrustUri: Content found in trust.txt file', matchingAccountUrl); }
            const platform = Platforms.getPlatformFromAccountUrl(matchingAccountUrl)?.DisplayName || '';
            let account = matchingAccountUrl;
            if (platform) {
                account = Platforms.getPlatform(platform).canonicalizeAccountUrl(matchingAccountUrl).account;
            }
            const url = getUrlFromUri(trustUri);
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
        // check each trust.txt file member entry to see if it matches the current tab url
        // const tabDomain = new URL(tabUrl).hostname;
        if (debug) { console.log('Validator - lookupTrustUri: tabDomain', tabDomain); }
        let memberFound = false;
        for (let i = 0; i < trustTxtFile.member.length; i++) {
            if (trustTxtFile.member[i].includes(tabDomain)) {
                memberFound = true;
                break;
            }
        }
        if (debug) { console.log('Validator - lookupTrustUri: memberFound', memberFound); }
        if (memberFound) {
            return {
                type: 'account',
                name: tabDomain,
                baseurl: getUrlFromUri(trustUri),
                version: 'trust.txt-draft00',
                account: {
                    account: tabDomain,
                    platform: 'member'
                }
            };
        }
        if (debug) { console.log('Validator - lookupTrustUri:', tabUrl, 'not found in', trustUri); }
        return { type: 'notFound', baseurl: trustUri };
    } else {
        if (debug) { console.log('Validator - lookupTrustUri: tabDomain == trustUrl'); }
        // Send a request to the WP validator plugin
        const url = "https://journallist.net/wp-json/trust-txt/v1/validate";
        const data = {
        url: tabUrl
        };
        
        let count = 0;
        const results: lookupTrustUriResult = {
            type: "multiple",
            list: [{
                status: "",
                domain: "",
                message: ""
            }]
        };

        await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
        })
        .then(response => {
            if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (debug) { console.log("Validator - lookupTrustUri: REST API response:", data); }
            for (const obj of data) {
                results.list[count] = {status: obj.status, domain: obj.domain, message: obj.message};
                count += 1;
            }
        })
        .catch(error => {
            console.error("Error:", error);
        });
        if (debug) { console.log("Validator - lookupTrustUri: results:", results); }
        return results;
    }
}
