/**
 * Background service worker: reads Google's Street View metadata responses via the
 * Chrome DevTools Protocol (chrome.debugger) and stores the coordinates for the companion window.
 * Nothing is injected into the GeoGuessr page.
 *
 * chrome.webRequest can't be used for this: in Manifest V3 it exposes URLs and headers,
 * but never response bodies. chrome.debugger is the only extension API that does.
 * While attached, Chrome shows an "ApvGuessr started debugging this browser" bar.
 */
import { isStreetViewMetadataUrl, parseCoordinates } from './streetViewCoordinates';
import { showCompanionWindow } from './companionWindow';
import { clearCoordinates, saveCoordinates } from './tabCoordinates';

const PROTOCOL_VERSION = '1.3';
const GEOGUESSR_URL = /^https:\/\/www\.geoguessr\.com\//;

/**
 * Tabs the debugger is attached to. Only a cache: it's lost whenever Chrome stops the service
 * worker, while the debugger itself stays attached. attach() therefore asks Chrome before
 * attaching again.
 */
const attachedTabs = new Set<number>();

/** Per tab: request IDs of Street View metadata responses still loading. */
const pendingRequests = new Map<number, Set<string>>();

interface ResponseReceivedParams {
    requestId: string;
    type?: string;
    response: { url: string };
}

interface LoadingFinishedParams {
    requestId: string;
}

interface GetResponseBodyResult {
    body: string;
    base64Encoded: boolean;
}

async function attach(tabId: number): Promise<void> {
    if (attachedTabs.has(tabId)) return;
    attachedTabs.add(tabId);

    const target = { tabId };

    // sendCommand only succeeds if this extension is attached to the tab, e.g. from before the
    // service worker was restarted. Then there's nothing to do.
    try {
        await chrome.debugger.sendCommand(target, 'Network.enable');
        return;
    } catch {
        // not attached (by us) yet
    }

    try {
        await chrome.debugger.attach(target, PROTOCOL_VERSION);
        await chrome.debugger.sendCommand(target, 'Network.enable');
    } catch (e) {
        // e.g. another debugger is already attached to the tab
        attachedTabs.delete(tabId);
        console.warn(`[ApvGuessr] could not attach debugger to tab ${tabId}`, e);
    }
}

function forget(tabId: number): void {
    attachedTabs.delete(tabId);
    pendingRequests.delete(tabId);
}

function decodeBody({ body, base64Encoded }: GetResponseBodyResult): string {
    if (!base64Encoded) return body;
    const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

async function readResponse(tabId: number, requestId: string): Promise<void> {
    let result: GetResponseBodyResult;
    try {
        result = (await chrome.debugger.sendCommand({ tabId }, 'Network.getResponseBody', {
            requestId,
        })) as GetResponseBodyResult;
    } catch {
        return; // body no longer available (e.g. the page navigated away)
    }

    const coordinates = parseCoordinates(decodeBody(result));
    if (!coordinates) return;

    await saveCoordinates(tabId, { lat: coordinates[0], long: coordinates[1] });
}

chrome.debugger.onEvent.addListener((source, method, params) => {
    const tabId = source.tabId;
    if (tabId === undefined) return;

    if (method === 'Network.responseReceived') {
        const { requestId, type, response } = params as unknown as ResponseReceivedParams;
        if ((type === 'XHR' || type === 'Fetch') && isStreetViewMetadataUrl(response.url)) {
            let pending = pendingRequests.get(tabId);
            if (!pending) pendingRequests.set(tabId, (pending = new Set()));
            pending.add(requestId);
        }
    } else if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
        const { requestId } = params as unknown as LoadingFinishedParams;
        const pending = pendingRequests.get(tabId);
        if (!pending?.delete(requestId)) return;
        if (method === 'Network.loadingFinished') void readResponse(tabId, requestId);
    }
});

// Detached by the user ("Cancel" in the debugging bar), by closing the tab or by DevTools
// taking over. It's attached again on the tab's next page load.
chrome.debugger.onDetach.addListener((source) => {
    if (source.tabId !== undefined) forget(source.tabId);
});

// Attach as soon as a tab starts loading GeoGuessr, before the game sends its first request.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'loading' && tab.url && GEOGUESSR_URL.test(tab.url)) {
        void attach(tabId);
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    forget(tabId);
    void clearCoordinates(tabId);
});

// The keyboard shortcut (manifest "commands", changeable at chrome://extensions/shortcuts) is
// the only way to open the companion window. Once it's open, it shows every new location by
// itself. Chrome handles the shortcut before the page, so the page never sees the key press,
// and the window opens without taking the focus.
chrome.commands.onCommand.addListener(async (command, tab) => {
    if (command !== 'show-location') return;
    const windowId = tab?.windowId ?? (await chrome.windows.getLastFocused({ windowTypes: ['normal'] })).id;
    if (windowId !== undefined) await showCompanionWindow(windowId);
});

// GeoGuessr tabs that were already open when the extension (re)started.
async function attachToOpenTabs(): Promise<void> {
    const tabs = await chrome.tabs.query({ url: 'https://www.geoguessr.com/*' });
    for (const tab of tabs) {
        if (tab.id !== undefined) void attach(tab.id);
    }
}

chrome.runtime.onInstalled.addListener(() => void attachToOpenTabs());
chrome.runtime.onStartup.addListener(() => void attachToOpenTabs());
