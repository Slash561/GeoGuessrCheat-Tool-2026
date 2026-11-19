/**
 * Opens companion.html in its own small popup window.
 *
 * A side panel would be docked inside the GeoGuessr window and shrink the page's
 * window.innerWidth. A separate window leaves the GeoGuessr window (innerWidth and
 * outerWidth) exactly as it is.
 */
import type { RevealMessage } from './messages';

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
 * Reveals the location in the companion window, creating the window next to the given
 * browser window if it isn't open yet.
 *
 * The companion window never gets the focus: the browser window the shortcut was pressed in
 * keeps it, so the game page sees no blur event.
 */
export async function revealInCompanionWindow(sourceWindowId: number): Promise<void> {
    const existing = await existingWindowId();
    if (existing !== undefined) {
        const message: RevealMessage = { type: 'reveal', windowId: sourceWindowId };
        try {
            await chrome.runtime.sendMessage(message);
            return;
        } catch {
            // The window exists but its page isn't listening (e.g. still loading): recreate it.
            await chrome.windows.remove(existing).catch(() => undefined);
        }
    }

    const { [BOUNDS_KEY]: saved } = await chrome.storage.local.get(BOUNDS_KEY);
    const bounds = isBounds(saved) ? saved : await defaultBounds(sourceWindowId);

    const created = await chrome.windows.create({
        url: `${PAGE}?window=${sourceWindowId}&reveal=1`,
        type: 'popup',
        focused: false,
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
