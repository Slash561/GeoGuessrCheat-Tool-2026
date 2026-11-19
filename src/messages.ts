/** Sent from the background service worker to the content script. */
export interface CoordinatesMessage {
    type: 'apv:coordinates';
    lat: number;
    long: number;
}

export function isCoordinatesMessage(message: unknown): message is CoordinatesMessage {
    return typeof message === 'object' && message !== null && (message as { type?: unknown }).type === 'apv:coordinates';
}
