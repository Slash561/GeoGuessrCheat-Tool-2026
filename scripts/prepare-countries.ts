/**
 * Converts the Natural Earth country borders (npm package `world-atlas`) into the
 * compact data file that gets bundled into the content script:
 *
 * - all countries from the 1:50m data set, simplified and delta-encoded (TopoJSON)
 * - each country tagged with its ISO 3166-1 alpha-2 code (e.g. "DE"), so it can be
 *   matched against Nominatim's `country_code`
 * - small countries (Singapore, Malta, Monaco, …) additionally in 1:10m detail,
 *   because in 1:50m they consist of only a handful of points
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type { Position } from 'geojson';
import isoCountries from 'i18n-iso-countries';
import { feature, quantize } from 'topojson-client';
import { presimplify, quantile, simplify } from 'topojson-simplify';
import type { CountriesTopology, CountryData, CountryProperties } from '../src/countryDataFormat.ts';

export const COUNTRIES_OUT = 'src/generated/countries.geodata';

/** Share of points that is kept when simplifying the 1:50m outlines (0..1). */
const KEEP_RATIO = 0.4;

/** Grid resolution for the delta-encoded coordinates (1e5 ≈ 400 m precision). */
const QUANTIZATION = 1e5;

/** Countries whose 1:50m outline spans less than this (in degrees) get the 1:10m outline. */
const DETAIL_MAX_SPAN_DEG = 2;

/** Decimal places for the 1:10m outlines (4 ≈ 10 m). */
const DETAIL_DECIMALS = 4;

const require = createRequire(import.meta.url);

async function loadTopology(file: string): Promise<CountriesTopology> {
    return JSON.parse(await readFile(require.resolve(file), 'utf8')) as CountriesTopology;
}

function polygonsOf(geometry: GeoJSON.Geometry | null): Position[][][] {
    if (geometry?.type === 'Polygon') return [geometry.coordinates];
    if (geometry?.type === 'MultiPolygon') return geometry.coordinates;
    return [];
}

function maxSpan(polygons: Position[][][]): number {
    const xs = polygons.flatMap((p) => p[0].map(([x]) => x));
    const ys = polygons.flatMap((p) => p[0].map(([, y]) => y));
    return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

function roundPolygons(polygons: Position[][][]): Position[][][] {
    const factor = 10 ** DETAIL_DECIMALS;
    return polygons.map((polygon) =>
        polygon.map((ring) => ring.map(([x, y]) => [Math.round(x * factor) / factor, Math.round(y * factor) / factor])),
    );
}

export async function prepareCountries(): Promise<void> {
    const coarse = await loadTopology('world-atlas/countries-50m.json');
    const fine = await loadTopology('world-atlas/countries-10m.json');

    const fineById = new Map(
        feature(fine, fine.objects.countries).features.map((f) => [String(f.id), f.geometry]),
    );

    // Tag countries with their alpha-2 code and pick the small ones for the detailed outlines.
    const countries = coarse.objects.countries;
    const coarseFeatures = feature(coarse, countries).features;

    // A few ids occur twice (e.g. 036 = Australia and Ashmore Is.); those can't be matched safely.
    const idCount = new Map<string, number>();
    for (const f of coarseFeatures) idCount.set(String(f.id), (idCount.get(String(f.id)) ?? 0) + 1);

    const detail: CountryData['detail'] = {};
    for (const coarseFeature of coarseFeatures) {
        if (coarseFeature.id === undefined || idCount.get(String(coarseFeature.id)) !== 1) continue;
        const code = isoCountries.numericToAlpha2(String(coarseFeature.id));
        const fineGeometry = fineById.get(String(coarseFeature.id));
        if (code && fineGeometry && maxSpan(polygonsOf(coarseFeature.geometry)) < DETAIL_MAX_SPAN_DEG) {
            detail[code] = roundPolygons(polygonsOf(fineGeometry));
        }
    }
    for (const geometry of countries.geometries) {
        const name = (geometry.properties as Partial<CountryProperties> | undefined)?.name ?? '';
        const code = geometry.id !== undefined ? isoCountries.numericToAlpha2(String(geometry.id)) : undefined;
        geometry.properties = code ? { name, code } : { name };
        delete geometry.id;
    }

    // Drop the unused `land` object and simplify.
    const presimplified = presimplify({ ...coarse, objects: { countries } });
    const simplified = simplify(presimplified, quantile(presimplified, KEEP_RATIO));

    // simplify() keeps the weight as third coordinate, which we don't need at runtime.
    const flat: CountriesTopology = {
        ...simplified,
        arcs: simplified.arcs.map((arc) => arc.map(([x, y]) => [x, y])),
    };

    const data: CountryData = { topology: quantize(flat, QUANTIZATION), detail };

    await mkdir(dirname(COUNTRIES_OUT), { recursive: true });
    await writeFile(COUNTRIES_OUT, JSON.stringify(data));
}

if (import.meta.main) {
    await prepareCountries();
    console.log(`wrote ${COUNTRIES_OUT}`);
}
