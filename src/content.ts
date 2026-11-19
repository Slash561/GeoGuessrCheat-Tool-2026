import { preloadCountryData, renderCountryMap } from './countryMap';
import { isCoordinatesMessage } from './messages';

type AddressInfo = Record<string, string>;

interface NominatimResponse {
    address?: AddressInfo;
}

let lat = 999;
let long = 999;

/** Nominatim result for the current coordinates, so repeated clicks don't hit the API again. */
let addressCache: { lat: number; long: number; address: AddressInfo } | null = null;

// --- coordinates, read from the network traffic by background.ts ----------------

chrome.runtime.onMessage.addListener((message: unknown) => {
    if (isCoordinatesMessage(message)) {
        lat = message.lat;
        long = message.long;
    }
});

// --- reverse geocoding -------------------------------------------------------

async function getCoordInfo(): Promise<AddressInfo | undefined> {
    const requestLat = lat;
    const requestLong = long;
    if (addressCache && addressCache.lat === requestLat && addressCache.long === requestLong) {
        return addressCache.address;
    }

    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${requestLat}&lon=${requestLong}&format=json`);
        if (!response.ok) {
            return;
        }

        const data: NominatimResponse = await response.json();
        if (data.address) {
            addressCache = { lat: requestLat, long: requestLong, address: data.address };
        }
        return data.address;
    } catch {
        return;
    }
}

// --- eye button in GeoGuessr's in-game controls --------------------------------

function addEyeButton(viewImg: string): void {
    if (document.getElementById('tellLocation')) return;

    const controls = document.querySelector<HTMLElement>('[class^="styles_columnTwo__"]');
    if (!controls) return;

    // insertAdjacentHTML appends without re-creating GeoGuessr's own buttons
    // (`innerHTML +=` re-parsed the whole column and detached React's event handlers).
    controls.insertAdjacentHTML(
        'beforeend',
        `<a href="#" class="styles_control__a" id="tellLocation" style="margin-bottom: 1rem; position: relative; touch-action: pan-x pan-y; background: rgba(0, 0, 0, .6);border: 0;border-bottom: .0625rem solid rgba(0, 0, 0, .4);cursor: pointer;height:40px;display: flex; align-items: center; justify-content: center;width: 40px;border-radius: 50%"><img alt='Return to start' loading='lazy' width='22' height='24' decoding='async' data-nimg='1' style="filter: invert(1); position: absolute;" class='styles_iconReturnToStart__PT25v' src='${viewImg}' style='color: transparent;'></button><div class='tooltip_tooltip__CHe2s tooltip_right__07M2V tooltip_roundnessXS__khTx4 tooltip_hideOnXs__hsJpx' style='top: 50%; transform: translateY(-50%) scale(0); opacity: 0; visibility: hidden;'>Return to start (R)<div class='tooltip_arrow__Rz_22'></div></div>`,
    );
    document.getElementById('tellLocation')?.addEventListener('click', (event) => {
        event.preventDefault();
        void tellLocation();
    });
}

window.addEventListener('load', () => {
    const viewImg = chrome.runtime.getURL('assets/view.png');

    // Instead of polling every 50 ms: check only when the DOM actually changed,
    // at most once per animation frame.
    let scheduled = false;
    const observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            addEyeButton(viewImg);
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    addEyeButton(viewImg);
});

const FONT = 'neo-sans, sans-serif';

function createPanel(heading: string): HTMLDivElement {
    const panel = document.createElement('div');
    Object.assign(panel.style, {
        backgroundColor: 'rgb(86, 59, 154)',
        padding: '20px',
        borderRadius: '20px',
        boxShadow: '0 0 10px rgba(0, 0, 0, 0.5)',
        color: 'white',
        textAlign: 'center',
        maxHeight: '90vh',
        overflowY: 'auto',
    } satisfies Partial<CSSStyleDeclaration>);

    const title = document.createElement('h2');
    Object.assign(title.style, {
        color: '#a19bd9',
        fontStyle: 'italic',
        fontWeight: '700',
        fontFamily: FONT,
    } satisfies Partial<CSSStyleDeclaration>);
    title.innerText = heading;
    panel.appendChild(title);

    return panel;
}

function createMapPanel(countryCode?: string): HTMLDivElement | undefined {
    if (lat == 999 && long == 999) return undefined;

    const map = renderCountryMap(lat, long, countryCode);
    if (!map) return undefined;

    const panel = createPanel('MAP');
    map.element.style.margin = '20px auto 0';
    panel.appendChild(map.element);

    const caption = document.createElement('p');
    Object.assign(caption.style, {
        fontFamily: FONT,
        fontWeight: '700',
        textTransform: 'uppercase',
        marginTop: '12px',
    } satisfies Partial<CSSStyleDeclaration>);
    caption.innerText = map.countryName;
    panel.appendChild(caption);

    return panel;
}

function createLocationPanel(coordInfo: AddressInfo | undefined, onClose: () => void): HTMLDivElement {
    const panel = createPanel('LOCATION');

    const content = document.createElement('div');
    Object.assign(content.style, {
        fontFamily: FONT,
        paddingLeft: '20px',
        paddingRight: '20px',
        marginTop: '20px',
        maxWidth: '400px',
    } satisfies Partial<CSSStyleDeclaration>);

    for (const [key, value] of Object.entries(coordInfo ?? {})) {
        const infoItem = document.createElement('p');
        Object.assign(infoItem.style, {
            display: 'flex',
            justifyContent: 'flex-start',
            flexWrap: 'wrap',
            gap: '10px',
        } satisfies Partial<CSSStyleDeclaration>);

        const keySpan = document.createElement('span');
        Object.assign(keySpan.style, {
            textAlign: 'left',
            fontWeight: '700',
            textTransform: 'uppercase',
        } satisfies Partial<CSSStyleDeclaration>);
        keySpan.innerText = `${key}:`;
        infoItem.appendChild(keySpan);

        const valueSpan = document.createElement('span');
        valueSpan.style.textAlign = 'left';
        valueSpan.innerText = ` ${value}`;
        infoItem.appendChild(valueSpan);

        content.appendChild(infoItem);
    }
    panel.appendChild(content);

    const closeButton = document.createElement('button');
    closeButton.innerText = 'Close';
    Object.assign(closeButton.style, {
        marginTop: '20px',
        color: 'white',
        cursor: 'pointer',
        padding: '10px 20px',
        borderRadius: '15px',
        backgroundColor: '#6cb928',
        fontFamily: FONT,
        fontStyle: 'italic',
        fontWeight: '700',
        fontSize: '16px',
        width: '100%',
    } satisfies Partial<CSSStyleDeclaration>);
    closeButton.onclick = onClose;
    panel.appendChild(closeButton);

    return panel;
}

async function tellLocation(): Promise<void> {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        zIndex: '9998',
    } satisfies Partial<CSSStyleDeclaration>);

    // Map on the left, location details on the right; wraps below each other on narrow screens.
    const container = document.createElement('div');
    Object.assign(container.style, {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: '9999',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'flex-start',
        gap: '20px',
        width: 'max-content',
        maxWidth: '95vw',
    } satisfies Partial<CSSStyleDeclaration>);

    const close = (): void => {
        overlay.remove();
        container.remove();
    };
    overlay.onclick = close;

    // Parse the map data while waiting for Nominatim instead of after.
    const coordInfoPromise = getCoordInfo();
    preloadCountryData();
    const coordInfo = await coordInfoPromise;

    let mapPanel: HTMLDivElement | undefined;
    try {
        mapPanel = createMapPanel(coordInfo?.country_code);
    } catch (e) {
        console.warn('[ApvGuessr] could not render country map', e);
    }

    if (mapPanel) container.appendChild(mapPanel);
    container.appendChild(createLocationPanel(coordInfo, close));

    document.body.append(overlay, container);
}
