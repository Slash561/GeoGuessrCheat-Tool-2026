/**
 * Opens companion.html in its own small popup window.
 *
 * A side panel would be docked inside the GeoGuessr window and shrink the page's
 * window.innerWidth. A separate window leaves the GeoGuessr window (innerWidth and
 * outerWidth) exactly as it is.
 */

const PAGE = 'companion.html';
/** chrome.storage.session: ID of the open companion window (the service worker may restart). */
const WINDOW_KEY = 'companionWindowId';
/** chrome.storage.local: last position and size, so the window reopens where the user left it. */
const BOUNDS_KEY = 'companionBounds';

const DEFAULT_WIDTH = 360;
const DEFAULT_HEIGHT = 640;

interface Bounds {
    left: number;
    top: number;
    width: number;
    height: number;
}

function isBounds(value: unknown): value is Bounds {
    if (typeof value !== 'object' || value === null) return false;
    const { left, top, width, height } = value as Partial<Bounds>;
    return [left, top, width, height].every((n) => typeof n === 'number');
}

async function existingWindowId(): Promise<number | undefined> {
    const { [WINDOW_KEY]: id } = await chrome.storage.session.get(WINDOW_KEY);
    if (typeof id !== 'number') return undefined;
    try {
        await chrome.windows.get(id);
        return id;
    } catch {
        return undefined; // closed in the meantime
    }
}

/** Top right corner of the window the toolbar icon was clicked in. */
async function defaultBounds(sourceWindowId: number): Promise<Bounds> {
    const source = await chrome.windows.get(sourceWindowId);
    const right = (source.left ?? 0) + (source.width ?? DEFAULT_WIDTH);
    return {
        left: Math.max(0, right - DEFAULT_WIDTH - 16),
        top: (source.top ?? 0) + 80,
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
    };
}

/**
 * Focuses the companion window, or creates it next to the given browser window.
 * The companion shows the active tab of the browser window that was focused last.
 */
export async function openCompanionWindow(sourceWindowId: number): Promise<void> {
    const existing = await existingWindowId();
    if (existing !== undefined) {
        await chrome.windows.update(existing, { focused: true });
        return;
    }

    const { [BOUNDS_KEY]: saved } = await chrome.storage.local.get(BOUNDS_KEY);
    const bounds = isBounds(saved) ? saved : await defaultBounds(sourceWindowId);

    const created = await chrome.windows.create({
        url: `${PAGE}?window=${sourceWindowId}`,
        type: 'popup',
        focused: true,
        ...bounds,
    });
    if (created?.id !== undefined) await chrome.storage.session.set({ [WINDOW_KEY]: created.id });
}

chrome.windows.onBoundsChanged.addListener(async (window) => {
    if (window.id === undefined || window.id !== (await existingWindowId())) return;
    const { left, top, width, height } = window;
    await chrome.storage.local.set({ [BOUNDS_KEY]: { left, top, width, height } });
});

chrome.windows.onRemoved.addListener(async (windowId) => {
    const { [WINDOW_KEY]: id } = await chrome.storage.session.get(WINDOW_KEY);
    if (id === windowId) await chrome.storage.session.remove(WINDOW_KEY);
});
