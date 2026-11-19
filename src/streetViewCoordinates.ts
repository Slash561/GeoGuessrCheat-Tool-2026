/**
 * Reads the panorama coordinates from Google's Street View metadata responses.
 */

/** URL fragments of the Maps JS RPCs whose responses contain the coordinates. */
const STREET_VIEW_RPCS = ['/GetMetadata', '/SingleImageSearch'];

export function isStreetViewMetadataUrl(url: string): boolean {
    return url.startsWith('https://maps.googleapis.com/') && STREET_VIEW_RPCS.some((rpc) => url.includes(rpc));
}

function isCoordinate(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

/** Returns the [lat, lng] pair at the given path, or undefined if the path doesn't exist. */
function readPair(read: () => unknown[]): [number, number] | undefined {
    try {
        const pair = read();
        return isCoordinate(pair[2]) && isCoordinate(pair[3]) ? [pair[2], pair[3]] : undefined;
    } catch {
        return undefined;
    }
}

export function parseCoordinates(body: string): [number, number] | undefined {
    // Cheap pre-check, so non-JSON responses are never parsed.
    if (!/^\s*[[{]/.test(body)) return undefined;

    let data: unknown;
    try {
        data = JSON.parse(body);
    } catch {
        return undefined;
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    return (
        readPair(() => (data as any)[1][0][5][0][1][0]) ?? // GetMetadata
        readPair(() => (data as any)[1][5][0][1][0]) // SingleImageSearch
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */
}
