/** Sent by the background worker to an open companion window when the shortcut is pressed. */
export interface RevealMessage {
    type: 'reveal';
    /** The browser window the shortcut was pressed in. */
    windowId: number;
}

export function isRevealMessage(value: unknown): value is RevealMessage {
    if (typeof value !== 'object' || value === null) return false;
    const { type, windowId } = value as Partial<RevealMessage>;
    return type === 'reveal' && typeof windowId === 'number';
}
