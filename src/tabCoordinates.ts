/**
 * Latest panorama coordinates per tab, written by background.ts and read by the side panel.
 *
 * Kept in chrome.storage.session rather than in a variable of the service worker, because
 * the worker is stopped when idle and would lose them. Session storage is in memory only,
 * cleared when the browser closes, and readable by extension pages only (never by websites).
 */

export interface Coordinates {
    lat: number;
    long: number;
}

export function storageKey(tabId: number): string {
    return `coords:${tabId}`;
}

export async function saveCoordinates(tabId: number, coordinates: Coordinates): Promise<void> {
    await chrome.storage.session.set({ [storageKey(tabId)]: coordinates });
}

export async function loadCoordinates(tabId: number): Promise<Coordinates | undefined> {
    const key = storageKey(tabId);
    const items = await chrome.storage.session.get(key);
    return isCoordinates(items[key]) ? items[key] : undefined;
}

export async function clearCoordinates(tabId: number): Promise<void> {
    await chrome.storage.session.remove(storageKey(tabId));
}

export function isCoordinates(value: unknown): value is Coordinates {
    if (typeof value !== 'object' || value === null) return false;
    const { lat, long } = value as Partial<Coordinates>;
    return typeof lat === 'number' && typeof long === 'number';
}
