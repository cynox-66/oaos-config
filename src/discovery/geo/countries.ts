// countries.ts
// File: src/discovery/geo/countries.ts
// Purpose: The country/city/region vocabulary the geo mappers resolve against.
//          Pure data + two lookup helpers. Curated from the 2026-08-06 live
//          census (research/phase1-eligibility/track1-geo.md) plus the
//          standard ISO-3166 English short names — Himalayas emits exactly
//          those, Greenhouse boards emit informal variants (aliases below).
//
// A name missing from these tables degrades to `unresolved`, which is VISIBLE
// in every run summary — the fail-open direction, by ruling. Never resolve by
// substring or fuzzy match: a wrong resolution is invisible, a miss is loud.

/** Lowercase country name / alias → ISO-3166 alpha-2 (uppercase). */
export const COUNTRY_NAME_TO_ISO: Readonly<Record<string, string>> = {
  // ── Aliases observed live on the four activated Greenhouse boards ─────────
  "united states": "US", usa: "US", "u.s.": "US", "united states of america": "US",
  "united kingdom": "UK", uk: "UK", "great britain": "UK",
  "republic of ireland": "IE", ireland: "IE",
  "the netherlands": "NL", netherlands: "NL",
  "mainland china": "CN", china: "CN",
  "south korea": "KR", "korea, republic of": "KR", korea: "KR",
  "russian federation": "RU", russia: "RU",
  "czechia": "CZ", "czech republic": "CZ",
  // ── ISO short names (Himalayas vocabulary), A–Z ───────────────────────────
  afghanistan: "AF", albania: "AL", algeria: "DZ", andorra: "AD", angola: "AO",
  antarctica: "AQ", argentina: "AR", armenia: "AM", australia: "AU", austria: "AT",
  azerbaijan: "AZ", bahrain: "BH", bangladesh: "BD", belarus: "BY", belgium: "BE",
  benin: "BJ", bhutan: "BT", bolivia: "BO", "bosnia and herzegovina": "BA",
  botswana: "BW", "bouvet island": "BV", brazil: "BR", bulgaria: "BG",
  "burkina faso": "BF", burundi: "BI", "cabo verde": "CV", cambodia: "KH",
  cameroon: "CM", canada: "CA", "central african republic": "CF", chad: "TD",
  chile: "CL", colombia: "CO", comoros: "KM", congo: "CG",
  "congo, the democratic republic of the": "CD", "cook islands": "CK",
  "costa rica": "CR", croatia: "HR", cuba: "CU", curaçao: "CW", curacao: "CW",
  cyprus: "CY", "côte d'ivoire": "CI", "cote d'ivoire": "CI", denmark: "DK",
  djibouti: "DJ", "dominican republic": "DO", ecuador: "EC", egypt: "EG",
  "el salvador": "SV", "equatorial guinea": "GQ", eritrea: "ER", estonia: "EE",
  eswatini: "SZ", ethiopia: "ET", "faroe islands": "FO", fiji: "FJ",
  finland: "FI", france: "FR", "french guiana": "GF",
  "french southern territories": "TF", gabon: "GA", gambia: "GM", georgia: "GE",
  germany: "DE", ghana: "GH", gibraltar: "GI", greece: "GR", greenland: "GL",
  guadeloupe: "GP", guatemala: "GT", guernsey: "GG", guinea: "GN",
  "guinea-bissau": "GW", guyana: "GY", haiti: "HT",
  "heard island and mcdonald islands": "HM", "holy see (vatican city state)": "VA",
  honduras: "HN", "hong kong": "HK", hungary: "HU", iceland: "IS", india: "IN",
  indonesia: "ID", iran: "IR", iraq: "IQ", "isle of man": "IM", israel: "IL",
  italy: "IT", jamaica: "JM", japan: "JP", jersey: "JE", jordan: "JO",
  kazakhstan: "KZ", kenya: "KE", kuwait: "KW", kyrgyzstan: "KG", laos: "LA",
  latvia: "LV", lebanon: "LB", lesotho: "LS", liberia: "LR", libya: "LY",
  liechtenstein: "LI", lithuania: "LT", luxembourg: "LU", madagascar: "MG",
  malawi: "MW", malaysia: "MY", maldives: "MV", mali: "ML", malta: "MT",
  martinique: "MQ", mauritania: "MR", mauritius: "MU", mayotte: "YT",
  mexico: "MX", moldova: "MD", monaco: "MC", mongolia: "MN", montenegro: "ME",
  morocco: "MA", mozambique: "MZ", myanmar: "MM", namibia: "NA", nepal: "NP",
  "new zealand": "NZ", nicaragua: "NI", niger: "NE", nigeria: "NG",
  "north macedonia": "MK", norway: "NO", oman: "OM", pakistan: "PK",
  "palestine, state of": "PS", panama: "PA", "papua new guinea": "PG",
  paraguay: "PY", peru: "PE", philippines: "PH", poland: "PL", portugal: "PT",
  qatar: "QA", romania: "RO", rwanda: "RW", réunion: "RE", reunion: "RE",
  "saint barthélemy": "BL", "saint helena, ascension and tristan da cunha": "SH",
  "saint martin (french part)": "MF", "saint pierre and miquelon": "PM",
  "san marino": "SM", "sao tome and principe": "ST", "saudi arabia": "SA",
  senegal: "SN", serbia: "RS", seychelles: "SC", "sierra leone": "SL",
  singapore: "SG", "sint maarten (dutch part)": "SX", slovakia: "SK",
  slovenia: "SI", somalia: "SO", "south africa": "ZA", "south sudan": "SS",
  spain: "ES", "sri lanka": "LK", sudan: "SD", suriname: "SR",
  "svalbard and jan mayen": "SJ", sweden: "SE", switzerland: "CH",
  "syrian arab republic": "SY", syria: "SY", taiwan: "TW", tajikistan: "TJ",
  tanzania: "TZ", thailand: "TH", "timor-leste": "TL", togo: "TG",
  tunisia: "TN", turkey: "TR", türkiye: "TR", turkmenistan: "TM", uganda: "UG",
  ukraine: "UA", "united arab emirates": "AE", uruguay: "UY", uzbekistan: "UZ",
  venezuela: "VE", vietnam: "VN", "western sahara": "EH", yemen: "YE",
  zambia: "ZM", zimbabwe: "ZW", "åland islands": "AX", "aland islands": "AX",
};

/**
 * Lowercase city string → ISO code. ONLY cities observed as bare
 * `location.name` values in the 2026-08-06 census (plus their metro
 * variants). Deliberately tiny — a city miss is a visible `unresolved`,
 * and growing this table is a data change, not a design change.
 */
export const CITY_TO_ISO: Readonly<Record<string, string>> = {
  "san francisco": "US", "san francisco, ca": "US", "san francisco, usa": "US",
  chicago: "US", "chicago, il": "US", boston: "US", denver: "US",
  "new york": "US", "new york city": "US", austin: "US",
  "tel aviv": "IL", amsterdam: "NL", tokyo: "JP", bangalore: "IN",
  bengaluru: "IN", mumbai: "IN", melbourne: "AU", sydney: "AU",
  toronto: "CA", montreal: "CA", vancouver: "CA", london: "UK",
};

/**
 * Lowercase region token → the ISO codes that region is taken to include.
 *
 * Only regions observed in live values are listed. Two deliberate,
 * fail-direction-stated choices:
 * - APAC / APJ INCLUDE "IN": some companies' APAC excludes India, but
 *   treating it as inclusive fails OPEN (the posting is shown; the operator
 *   clicks through), while excluding would delete a possibly-eligible
 *   posting unseen.
 * - Sets are membership tables, not exhaustive geography — a code absent
 *   from every relevant set simply never matches through the region path.
 */
export const REGION_SETS: Readonly<Record<string, readonly string[]>> = {
  emea: ["UK", "IE", "DE", "ES", "SE", "NL", "FR", "CH", "IL", "DK", "NO", "FI",
    "PL", "PT", "IT", "AT", "BE", "CZ", "RO", "BG", "GR", "HU", "AE", "SA",
    "QA", "EG", "ZA", "NG", "KE", "MA", "TR"],
  europe: ["UK", "IE", "DE", "ES", "SE", "NL", "FR", "CH", "DK", "NO", "FI",
    "PL", "PT", "IT", "AT", "BE", "CZ", "RO", "BG", "GR", "HU"],
  eu: ["IE", "DE", "ES", "SE", "NL", "FR", "DK", "FI", "PL", "PT", "IT", "AT",
    "BE", "CZ", "RO", "BG", "GR", "HU"],
  apac: ["IN", "SG", "AU", "NZ", "JP", "KR", "CN", "HK", "TW", "MY", "TH",
    "PH", "ID", "VN", "LK", "BD", "PK"],
  apj: ["IN", "SG", "AU", "NZ", "JP", "KR", "CN", "HK", "TW", "MY", "TH",
    "PH", "ID", "VN"],
  asia: ["IN", "SG", "JP", "KR", "CN", "HK", "TW", "MY", "TH", "PH", "ID",
    "VN", "LK", "BD", "PK", "AE", "SA", "IL"],
  amer: ["US", "CA", "MX", "BR", "AR", "CO", "CL", "PE", "UY"],
  americas: ["US", "CA", "MX", "BR", "AR", "CO", "CL", "PE", "UY"],
  noram: ["US", "CA"],
  "north america": ["US", "CA"],
  "northern america": ["US", "CA"],
  latam: ["MX", "BR", "AR", "CO", "CL", "PE", "UY", "EC", "BO", "PY", "CR",
    "GT", "PA", "DO"],
  africa: ["ZA", "NG", "KE", "EG", "MA", "GH", "TZ", "UG", "ET", "SN"],
  mena: ["AE", "SA", "QA", "EG", "MA", "TN", "JO", "LB", "KW", "BH", "OM", "IL"],
  oceania: ["AU", "NZ"],
  cis: ["RU", "BY", "KZ", "UZ", "AM", "AZ", "KG", "TJ", "MD", "GE", "UA"],
  benelux: ["BE", "NL", "LU"],
  nordics: ["SE", "NO", "DK", "FI", "IS"],
  dach: ["DE", "AT", "CH"],
  ceur: ["DE", "AT", "CH", "PL", "CZ"],
};

/** Normalize a candidate name for table lookup. */
export function normalizeGeoToken(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Resolve one token: country name → ISO, else null. Membership only. */
export function countryToIso(token: string): string | null {
  return COUNTRY_NAME_TO_ISO[normalizeGeoToken(token)] ?? null;
}

/** Resolve one token as a region → its ISO set, else null. */
export function regionToIsoSet(token: string): readonly string[] | null {
  return REGION_SETS[normalizeGeoToken(token)] ?? null;
}
