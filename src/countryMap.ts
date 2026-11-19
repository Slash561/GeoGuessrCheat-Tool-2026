/**
 * Renders a small, stylised SVG map of the country a coordinate lies in,
 * with the exact location marked as a dot.
 *
 * Border data: Natural Earth 1:50m / 1:10m (public domain), prepared at build time
 * by scripts/prepare-countries.ts and bundled as a JSON string.
 */
import type { Position } from 'geojson';
import { feature } from 'topojson-client';
import type { CountryData } from './countryDataFormat';
import countryDataJson from './generated/countries.geodata';

/** Outer ring followed by optional holes, as [lon, lat] positions. */
type PolygonCoords = Position[][];

interface Country {
    name: string;
    code?: string;
    polygons: PolygonCoords[];
}

interface Box {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

/** A polygon whose longitudes have been shifted by ±360° to sit next to a reference longitude. */
interface PlacedPolygon {
    source: PolygonCoords;
    coords: PolygonCoords;
    box: Box;
}

const MAX_SIZE = 280;
const PADDING = 12;

/**
 * Two parts of the same country are drawn together if the gap between them is at most this
 * many degrees (≈ 220 km). Keeps e.g. Corsica with France, Bali with Java and Chukotka with
 * Russia, but leaves out French Guiana, Alaska or the Canary Islands.
 */
const MAX_GAP_DEG = 2;

/**
 * Smallest map extent in degrees (≈ 20 km). Micro states like Vatican or Monaco are smaller than
 * the data resolution; this way the map at least shows their surroundings around the dot.
 */
const MIN_SPAN_DEG = 0.2;

const COLORS = {
    country: '#a19bd9',
    countryStroke: '#ffffff',
    neighbor: 'rgba(255, 255, 255, 0.12)',
    neighborStroke: 'rgba(255, 255, 255, 0.25)',
    dot: '#ff4d4f',
};

let countriesCache: Country[] | null = null;

/** Parses the bundled border data on first use, not on every page load. */
function loadCountries(): Country[] {
    if (countriesCache) return countriesCache;

    const { topology, detail } = JSON.parse(countryDataJson) as CountryData;
    const collection = feature(topology, topology.objects.countries);

    countriesCache = collection.features.flatMap((f): Country[] => {
        const geometry = f.geometry;
        const code = f.properties.code;
        let polygons: PolygonCoords[];
        if (code && detail[code]) {
            polygons = detail[code];
        } else if (geometry.type === 'Polygon') {
            polygons = [geometry.coordinates];
        } else if (geometry.type === 'MultiPolygon') {
            polygons = geometry.coordinates;
        } else {
            return [];
        }
        return [{ name: f.properties.name, code, polygons: polygons.map(unwrapPolygon) }];
    });
    return countriesCache;
}

/** Parses the map data ahead of time (e.g. while waiting for the network). */
export function preloadCountryData(): void {
    loadCountries();
}

// --- geometry helpers -------------------------------------------------------

/**
 * Some rings in the source data cross the antimeridian internally (…, 179.9, -180, -179.8, …).
 * Makes longitudes continuous by adding ±360° wherever consecutive points jump by more than 180°,
 * so e.g. mainland Russia spans 27°…190° instead of -180°…180°.
 */
function unwrapRing(ring: Position[]): Position[] {
    let offset = 0;
    let previous = ring[0][0];
    const result = ring.map(([x, y]) => {
        if (x - previous > 180) offset -= 360;
        else if (previous - x > 180) offset += 360;
        previous = x;
        return [x + offset, y];
    });
    // A ring around a pole (Antarctica) does not close after unwrapping; keep it as it was.
    const first = result[0][0];
    const last = result[result.length - 1][0];
    return Math.abs(first - last) > 1e-6 ? ring : result;
}

function unwrapPolygon(polygon: PolygonCoords): PolygonCoords {
    return polygon.map(unwrapRing);
}

function pointInRing(lon: number, lat: number, ring: Position[]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

function pointInPolygon(lon: number, lat: number, polygon: PolygonCoords): boolean {
    const [outer, ...holes] = polygon;
    return pointInRing(lon, lat, outer) && !holes.some((hole) => pointInRing(lon, lat, hole));
}

function boxOf(polygon: PolygonCoords): Box {
    const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const [x, y] of polygon[0]) {
        box.minX = Math.min(box.minX, x);
        box.maxX = Math.max(box.maxX, x);
        box.minY = Math.min(box.minY, y);
        box.maxY = Math.max(box.maxY, y);
    }
    return box;
}

function unionBox(a: Box, b: Box): Box {
    return {
        minX: Math.min(a.minX, b.minX),
        minY: Math.min(a.minY, b.minY),
        maxX: Math.max(a.maxX, b.maxX),
        maxY: Math.max(a.maxY, b.maxY),
    };
}

function boxesIntersect(a: Box, b: Box): boolean {
    return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

/** Distance between two boxes in degrees, with longitudes scaled by cos(latitude). */
function boxGap(a: Box, b: Box): number {
    const midLat = ((Math.max(a.minY, b.minY) + Math.min(a.maxY, b.maxY)) / 2) * (Math.PI / 180);
    const dx = Math.max(0, b.minX - a.maxX, a.minX - b.maxX) * Math.cos(midLat);
    const dy = Math.max(0, b.minY - a.maxY, a.minY - b.maxY);
    return Math.hypot(dx, dy);
}

function distanceToBox(lon: number, lat: number, box: Box): number {
    return boxGap({ minX: lon, maxX: lon, minY: lat, maxY: lat }, box);
}

/**
 * Natural Earth splits countries at the antimeridian (±180°). Shifting each polygon by a
 * multiple of 360° so it lies within 180° of the reference longitude puts both halves of
 * e.g. Russia or Fiji next to each other again.
 */
function placePolygon(polygon: PolygonCoords, refLon: number): PlacedPolygon {
    const box = boxOf(polygon);
    const shift = Math.round((refLon - (box.minX + box.maxX) / 2) / 360) * 360;
    if (shift === 0) return { source: polygon, coords: polygon, box };
    return {
        source: polygon,
        coords: polygon.map((ring) => ring.map(([x, y]) => [x + shift, y])),
        box: { ...box, minX: box.minX + shift, maxX: box.maxX + shift },
    };
}

// --- country lookup ---------------------------------------------------------

function findCountry(lat: number, lon: number, countryCode?: string): Country | undefined {
    const countries = loadCountries();

    if (countryCode) {
        const code = countryCode.toUpperCase();
        const matches = countries.filter((c) => c.code === code);
        if (matches.length > 0) {
            // A few codes (e.g. AU) are split over several features; merge them.
            return { ...matches[0], polygons: matches.flatMap((c) => c.polygons) };
        }
    }

    // Fallback (unknown code, e.g. Kosovo "xk"): the country that contains the point …
    const containing = countries.find((c) => c.polygons.some((p) => pointInPolygon(lon, lat, placePolygon(p, lon).coords)));
    if (containing) return containing;

    // … or, if the point is just off the coast, the nearest one.
    let nearest: Country | undefined;
    let nearestDistance = Infinity;
    for (const country of countries) {
        for (const polygon of country.polygons) {
            const distance = distanceToBox(lon, lat, placePolygon(polygon, lon).box);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearest = country;
            }
        }
    }
    return nearest;
}

/**
 * Picks the part of the country the point lies in, plus all parts that are reachable
 * from it in steps of at most MAX_GAP_DEG. Overseas territories are left out.
 */
function selectRegion(country: Country, lat: number, lon: number): PlacedPolygon[] {
    const remaining = country.polygons.map((p) => placePolygon(p, lon));

    let seedIndex = remaining.findIndex((p) => pointInPolygon(lon, lat, p.coords));
    if (seedIndex === -1) {
        let best = Infinity;
        remaining.forEach((p, i) => {
            const distance = distanceToBox(lon, lat, p.box);
            if (distance < best) {
                best = distance;
                seedIndex = i;
            }
        });
    }

    const region = remaining.splice(seedIndex, 1);
    let box = region[0].box;

    let added = true;
    while (added) {
        added = false;
        for (let i = remaining.length - 1; i >= 0; i--) {
            if (boxGap(box, remaining[i].box) <= MAX_GAP_DEG) {
                const [polygon] = remaining.splice(i, 1);
                region.push(polygon);
                box = unionBox(box, polygon.box);
                added = true;
            }
        }
    }
    return region;
}

// --- rendering --------------------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgElement<K extends keyof SVGElementTagNameMap>(
    tag: K,
    attributes: Record<string, string | number>,
): SVGElementTagNameMap[K] {
    const element = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) {
        element.setAttribute(name, String(value));
    }
    return element;
}

export interface CountryMap {
    element: SVGSVGElement;
    countryName: string;
}

/**
 * Builds the SVG map for the given location. `countryCode` is the ISO 3166-1 alpha-2 code
 * from Nominatim (optional, the country is otherwise determined from the coordinates).
 */
export function renderCountryMap(lat: number, lon: number, countryCode?: string): CountryMap | undefined {
    const country = findCountry(lat, lon, countryCode);
    if (!country) return undefined;

    const region = selectRegion(country, lat, lon);

    // Visible area: the selected region plus the point itself (it may be just off the coast).
    let view = region.reduce((box, p) => unionBox(box, p.box), { minX: lon, maxX: lon, minY: lat, maxY: lat });
    const centerX = (view.minX + view.maxX) / 2;
    const centerY = (view.minY + view.maxY) / 2;
    const halfX = Math.max(view.maxX - view.minX, MIN_SPAN_DEG) / 2;
    const halfY = Math.max(view.maxY - view.minY, MIN_SPAN_DEG) / 2;
    view = { minX: centerX - halfX, maxX: centerX + halfX, minY: centerY - halfY, maxY: centerY + halfY };

    // Simple equirectangular projection, with longitudes compressed by cos(latitude)
    // so countries far from the equator are not stretched horizontally.
    const cosLat = Math.max(Math.cos(centerY * (Math.PI / 180)), 0.2);
    const spanX = (view.maxX - view.minX) * cosLat;
    const spanY = view.maxY - view.minY;
    const scale = (MAX_SIZE - 2 * PADDING) / Math.max(spanX, spanY);
    const width = spanX * scale + 2 * PADDING;
    const height = spanY * scale + 2 * PADDING;

    const project = ([x, y]: Position): string =>
        `${((x - view.minX) * cosLat * scale + PADDING).toFixed(1)},${((view.maxY - y) * scale + PADDING).toFixed(1)}`;

    const toPath = (polygon: PolygonCoords): string =>
        polygon.map((ring) => 'M' + ring.map(project).join('L') + 'Z').join('');

    const svg = svgElement('svg', {
        width: width.toFixed(0),
        height: height.toFixed(0),
        viewBox: `0 0 ${width.toFixed(1)} ${height.toFixed(1)}`,
    });
    svg.style.display = 'block';
    svg.style.overflow = 'hidden';

    // Neighbouring countries (and other parts of the same country) that fall into the view, faded.
    const inRegion = new Set(region.map((p) => p.source));
    const ofCountry = new Set(country.polygons);
    const backgroundPaths: string[] = [];
    for (const other of loadCountries()) {
        for (const polygon of other.polygons) {
            if (inRegion.has(polygon)) continue;
            const placed = placePolygon(polygon, lon);
            if (!boxesIntersect(placed.box, view)) continue;
            if (ofCountry.has(polygon)) {
                region.push(placed);
            } else {
                backgroundPaths.push(toPath(placed.coords));
            }
        }
    }

    svg.append(
        svgElement('path', {
            d: backgroundPaths.join(''),
            fill: COLORS.neighbor,
            stroke: COLORS.neighborStroke,
            'stroke-width': 0.5,
            'fill-rule': 'evenodd',
        }),
        svgElement('path', {
            d: region.map((p) => toPath(p.coords)).join(''),
            fill: COLORS.country,
            stroke: COLORS.countryStroke,
            'stroke-width': 1,
            'stroke-linejoin': 'round',
            'fill-rule': 'evenodd',
        }),
    );

    // Location marker: pulsing ring + solid dot.
    const [dotX, dotY] = project([lon, lat]).split(',').map(Number);
    const pulse = svgElement('circle', { cx: dotX, cy: dotY, r: 5, fill: 'none', stroke: COLORS.dot, 'stroke-width': 2 });
    pulse.append(
        svgElement('animate', { attributeName: 'r', from: 5, to: 16, dur: '1.5s', repeatCount: 'indefinite' }),
        svgElement('animate', { attributeName: 'opacity', from: 1, to: 0, dur: '1.5s', repeatCount: 'indefinite' }),
    );
    svg.append(pulse, svgElement('circle', { cx: dotX, cy: dotY, r: 5, fill: COLORS.dot, stroke: '#ffffff', 'stroke-width': 2 }));

    return { element: svg, countryName: country.name };
}
