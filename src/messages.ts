/**
 * Sent by the background worker to an open companion window when the shortcut is pressed, so
 * it follows the browser window the shortcut was pressed in.
 */
export interface FollowWindowMessage {
    type: 'follow-window';
    /** The browser window the shortcut was pressed in. */
    windowId: number;
}

export function isFollowWindowMessage(value: unknown): value is FollowWindowMessage {
    if (typeof value !== 'object' || value === null) return false;
    const { type, windowId } = value as Partial<FollowWindowMessage>;
    return type === 'follow-window' && typeof windowId === 'number';
}
