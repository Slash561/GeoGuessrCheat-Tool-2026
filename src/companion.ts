/**
 * Companion window: shows the location of the current round for the active GeoGuessr tab.
 *
 * Runs as an extension page in its own popup window (see companionWindow.ts), so it has its
 * own DOM, never touches the GeoGuessr page and doesn't change the size of its window.
 * The coordinates come from background.ts via chrome.storage.session.
 */
import { preloadCountryData, renderCountryMap } from './countryMap';
import { type Coordinates, isCoordinates, loadCoordinates, storageKey } from './tabCoordinates';

type AddressInfo = Record<string, string>;

interface NominatimResponse {
    address?: AddressInfo;
}

const GEOGUESSR_URL = /^https:\/\/www\.geoguessr\.com\//;

function element<T extends HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
}

const ui = {
    status: element<HTMLParagraphElement>('status'),
    reveal: element<HTMLButtonElement>('reveal'),
    hide: element<HTMLButtonElement>('hide'),
    result: element<HTMLDivElement>('result'),
    mapPanel: element<HTMLDivElement>('mapPanel'),
    map: element<HTMLDivElement>('map'),
    countryName: element<HTMLParagraphElement>('countryName'),
    address: element<HTMLDListElement>('address'),
};

/** The tab the window currently shows: the active tab of the browser window it follows. */
let tabId: number | undefined;
let windowId: number | undefined;
let coordinates: Coordinates | undefined;
/** Whether the location is shown; reset for every new round so it's never revealed by accident. */
let revealed = false;
/** Incremented on every change, so a slow Nominatim response can't overwrite a newer state. */
let renderVersion = 0;

// --- reverse geocoding -------------------------------------------------------

/** Nominatim result for the last coordinates, so revealing again doesn't hit the API again. */
let addressCache: { lat: number; long: number; address: AddressInfo } | null = null;

async function getAddress({ lat, long }: Coordinates): Promise<AddressInfo | undefined> {
    if (addressCache && addressCache.lat === lat && addressCache.long === long) {
        return addressCache.address;
    }

    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${long}&format=json`);
        if (!response.ok) return undefined;

        const data: NominatimResponse = await response.json();
        if (data.address) addressCache = { lat, long, address: data.address };
        return data.address;
    } catch {
        return undefined;
    }
}

// --- rendering ---------------------------------------------------------------

function showStatus(text: string, canReveal = false): void {
    ui.status.textContent = text;
    ui.reveal.hidden = !canReveal;
    ui.result.hidden = true;
}

function renderAddress(address: AddressInfo | undefined): void {
    ui.address.replaceChildren();
    if (!address) {
        const dd = document.createElement('dd');
        dd.textContent = 'No address found.';
        ui.address.appendChild(dd);
        return;
    }
    for (const [key, value] of Object.entries(address)) {
        const dt = document.createElement('dt');
        dt.textContent = key;
        const dd = document.createElement('dd');
        dd.textContent = value;
        ui.address.append(dt, dd);
    }
}

function renderMap(coords: Coordinates, countryCode: string | undefined): void {
    ui.map.replaceChildren();
    ui.mapPanel.hidden = true;
    try {
        const map = renderCountryMap(coords.lat, coords.long, countryCode);
        if (!map) return;
        ui.map.appendChild(map.element);
        ui.countryName.textContent = map.countryName;
        ui.mapPanel.hidden = false;
    } catch (e) {
        console.warn('[ApvGuessr] could not render country map', e);
    }
}

async function render(): Promise<void> {
    const version = ++renderVersion;

    if (tabId === undefined) return showStatus('Open GeoGuessr in a browser window.');
    if (!coordinates) return showStatus('Waiting for a round to start…');
    if (!revealed) return showStatus('New location detected.', true);

    const coords = coordinates;
    showStatus('Looking up location…');
    // Parse the map data while waiting for Nominatim instead of after.
    const addressPromise = getAddress(coords);
    preloadCountryData();
    const address = await addressPromise;
    if (version !== renderVersion) return;

    renderMap(coords, address?.country_code);
    renderAddress(address);
    ui.status.textContent = `${coords.lat.toFixed(5)}, ${coords.long.toFixed(5)}`;
    ui.result.hidden = false;
}

// --- state -------------------------------------------------------------------

function setCoordinates(next: Coordinates | undefined): void {
    const changed = next?.lat !== coordinates?.lat || next?.long !== coordinates?.long;
    coordinates = next;
    if (changed) revealed = false;
    void render();
}

/** Switches to the active tab of the followed browser window. */
async function followActiveTab(): Promise<void> {
    const [tab] =
        windowId === undefined ? [] : await chrome.tabs.query({ active: true, windowId }).catch(() => []);
    const next = tab?.id !== undefined && tab.url && GEOGUESSR_URL.test(tab.url) ? tab.id : undefined;
    if (next === tabId && next !== undefined) return;

    tabId = next;
    coordinates = undefined;
    revealed = false;
    setCoordinates(tabId === undefined ? undefined : await loadCoordinates(tabId));
}

ui.reveal.addEventListener('click', () => {
    revealed = true;
    void render();
});

ui.hide.addEventListener('click', () => {
    revealed = false;
    void render();
});

chrome.storage.session.onChanged.addListener((changes) => {
    if (tabId === undefined) return;
    const change = changes[storageKey(tabId)];
    if (!change) return;
    setCoordinates(isCoordinates(change.newValue) ? change.newValue : undefined);
});

chrome.tabs.onActivated.addListener((info) => {
    if (info.windowId === windowId) void followActiveTab();
});

// The active tab navigated to or away from GeoGuessr.
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (changeInfo.url !== undefined && tab.active && tab.windowId === windowId) void followActiveTab();
});

/** Follows the browser window the user switched to; ignores popups like this one. */
chrome.windows.onFocusChanged.addListener(async (focusedId) => {
    if (focusedId === chrome.windows.WINDOW_ID_NONE || focusedId === windowId) return;
    try {
        const focused = await chrome.windows.get(focusedId);
        if (focused.type !== 'normal') return;
    } catch {
        return;
    }
    windowId = focusedId;
    void followActiveTab();
});

chrome.windows.onRemoved.addListener(async (removedId) => {
    if (removedId !== windowId) return;
    windowId = await lastFocusedBrowserWindow();
    void followActiveTab();
});

async function lastFocusedBrowserWindow(): Promise<number | undefined> {
    try {
        return (await chrome.windows.getLastFocused({ windowTypes: ['normal'] })).id;
    } catch {
        return undefined; // no browser window open
    }
}

void (async () => {
    // The browser window the toolbar icon was clicked in (set by companionWindow.ts).
    const param = Number(new URLSearchParams(location.search).get('window'));
    windowId = Number.isInteger(param) && param > 0 ? param : await lastFocusedBrowserWindow();
    await followActiveTab();
})();
