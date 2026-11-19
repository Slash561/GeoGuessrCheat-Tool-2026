/**
 * Format of the bundled country border data (src/generated/countries.geodata),
 * produced by scripts/prepare-countries.ts and read by src/countryMap.ts.
 */
import type { Position } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';

export interface CountryProperties {
    name: string;
    /** ISO 3166-1 alpha-2, e.g. "DE". Missing for a few disputed areas (Kosovo, Somaliland, …). */
    code?: string;
}

export type CountriesTopology = Topology<{ countries: GeometryCollection<CountryProperties> }>;

export interface CountryData {
    /** All countries, Natural Earth 1:50m, simplified. */
    topology: CountriesTopology;
    /** Detailed outlines (Natural Earth 1:10m) for small countries, keyed by alpha-2 code. */
    detail: Record<string, Position[][][]>;
}
