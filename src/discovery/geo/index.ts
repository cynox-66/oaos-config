// index.ts
// File: src/discovery/geo/index.ts
// Purpose: Public surface of the geo-eligibility mapping module (G1).

export { geoOf, MAPPED_SOURCES } from "./map";
export { partitionByGeo, itemsPassingGeo } from "./filter";
export {
  COUNTRY_NAME_TO_ISO,
  CITY_TO_ISO,
  REGION_SETS,
  countryToIso,
  regionToIsoSet,
  normalizeGeoToken,
} from "./countries";
export type { GeoSignal, GeoStatus } from "./types";
export type { GeoPartition } from "./filter";
