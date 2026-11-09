import countries from 'i18n-iso-countries';
import en from 'i18n-iso-countries/langs/en.json';

/**
 * Location intelligence. Every country comes from the ISO 3166 dataset, so nothing is
 * hardcoded per market: any country a posting mentions becomes filterable automatically.
 */
countries.registerLocale(en);

export type RemoteScope = 'GLOBAL' | 'REGION' | 'COUNTRY' | null;

export interface ParsedLocation {
  /** ISO 3166-1 alpha-2 codes the job is located in (empty when unknown). */
  countries: string[];
  /** Region keys (see REGIONS) a remote role is open to. */
  regions: string[];
  remote: boolean;
  hybrid: boolean;
  remoteScope: RemoteScope;
  city: string | null;
}

export const REGIONS: Record<string, { label: string; countries: string[] }> = {
  EU: {
    label: 'European Union',
    countries: ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'],
  },
  EUROPE: { label: 'Europe', countries: [] },
  EMEA: { label: 'EMEA', countries: [] },
  GCC: { label: 'Gulf / Middle East', countries: ['AE', 'SA', 'QA', 'KW', 'BH', 'OM', 'JO', 'EG', 'IL', 'TR'] },
  APAC: { label: 'Asia-Pacific', countries: ['AU', 'NZ', 'SG', 'JP', 'KR', 'IN', 'ID', 'MY', 'PH', 'TH', 'VN', 'HK', 'TW', 'CN', 'PK', 'BD', 'LK'] },
  NA: { label: 'North America', countries: ['US', 'CA', 'MX'] },
  LATAM: { label: 'Latin America', countries: ['MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'UY', 'CR', 'EC', 'GT', 'PA', 'DO', 'BO', 'PY', 'VE'] },
  AFRICA: { label: 'Africa', countries: ['ZA', 'NG', 'KE', 'EG', 'MA', 'GH', 'RW', 'TN', 'UG', 'ET'] },
};
REGIONS.EUROPE.countries = [...REGIONS.EU.countries, 'GB', 'CH', 'NO', 'IS', 'LI', 'UA', 'RS', 'BA', 'ME', 'MK', 'AL', 'MD', 'BY'];
REGIONS.EMEA.countries = [...REGIONS.EUROPE.countries, ...REGIONS.GCC.countries, ...REGIONS.AFRICA.countries];

const REGION_PATTERNS: Array<[RegExp, string]> = [
  [/\b(eu|european union)\b/i, 'EU'],
  [/\beurope(an)?\b/i, 'EUROPE'],
  [/\bemea\b/i, 'EMEA'],
  [/\b(apac|asia[- ]pacific|asia)\b/i, 'APAC'],
  [/\b(latam|latin america|south america)\b/i, 'LATAM'],
  [/\b(north america|americas)\b/i, 'NA'],
  [/\b(middle east|gcc|gulf|mena)\b/i, 'GCC'],
  [/\bafrica\b/i, 'AFRICA'],
];

const ALIASES: Record<string, string> = {
  uk: 'GB', 'u.k.': 'GB', 'great britain': 'GB', britain: 'GB', england: 'GB', scotland: 'GB', wales: 'GB', 'northern ireland': 'GB',
  usa: 'US', 'u.s.': 'US', 'u.s.a.': 'US', us: 'US', america: 'US', 'united states of america': 'US',
  uae: 'AE', 'u.a.e.': 'AE', emirates: 'AE', ksa: 'SA', 'saudi': 'SA',
  holland: 'NL', 'the netherlands': 'NL', deutschland: 'DE', schweiz: 'CH', suisse: 'CH', svizzera: 'CH', österreich: 'AT',
  'south korea': 'KR', korea: 'KR', russia: 'RU', vietnam: 'VN', 'czech republic': 'CZ', czechia: 'CZ', turkey: 'TR', türkiye: 'TR',
  'hong kong sar': 'HK', taiwan: 'TW', macau: 'MO', 'ivory coast': 'CI', 'côte d’ivoire': 'CI',
};

const US_STATES: Record<string, string> = {
  AL: 'alabama', AK: 'alaska', AZ: 'arizona', AR: 'arkansas', CA: 'california', CO: 'colorado', CT: 'connecticut', DE: 'delaware', FL: 'florida', GA: 'georgia',
  HI: 'hawaii', ID: 'idaho', IL: 'illinois', IN: 'indiana', IA: 'iowa', KS: 'kansas', KY: 'kentucky', LA: 'louisiana', ME: 'maine', MD: 'maryland',
  MA: 'massachusetts', MI: 'michigan', MN: 'minnesota', MS: 'mississippi', MO: 'missouri', MT: 'montana', NE: 'nebraska', NV: 'nevada', NH: 'new hampshire', NJ: 'new jersey',
  NM: 'new mexico', NY: 'new york', NC: 'north carolina', ND: 'north dakota', OH: 'ohio', OK: 'oklahoma', OR: 'oregon', PA: 'pennsylvania', RI: 'rhode island', SC: 'south carolina',
  SD: 'south dakota', TN: 'tennessee', TX: 'texas', UT: 'utah', VT: 'vermont', VA: 'virginia', WA: 'washington', WV: 'west virginia', WI: 'wisconsin', WY: 'wyoming', DC: 'district of columbia',
};
const CA_PROVINCES = ['ontario', 'quebec', 'british columbia', 'alberta', 'manitoba', 'saskatchewan', 'nova scotia', 'new brunswick', 'newfoundland', 'prince edward island'];
const CA_CODES = ['ON', 'QC', 'BC', 'AB', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE'];
const AU_STATES = ['new south wales', 'victoria', 'queensland', 'western australia', 'south australia', 'tasmania', 'australian capital territory', 'nsw', 'vic', 'qld'];

/** Cities that commonly appear without a country in postings. */
const CITIES: Record<string, string> = {
  'san francisco': 'US', 'new york': 'US', nyc: 'US', seattle: 'US', austin: 'US', boston: 'US', chicago: 'US', 'los angeles': 'US', denver: 'US', atlanta: 'US', miami: 'US',
  'palo alto': 'US', 'mountain view': 'US', 'menlo park': 'US', sunnyvale: 'US', 'san jose': 'US', 'san diego': 'US', 'washington dc': 'US', portland: 'US', 'salt lake city': 'US',
  'bay area': 'US', 'sf bay area': 'US', toronto: 'CA', vancouver: 'CA', montreal: 'CA', ottawa: 'CA', calgary: 'CA', waterloo: 'CA',
  london: 'GB', manchester: 'GB', edinburgh: 'GB', cambridge: 'GB', oxford: 'GB', bristol: 'GB', birmingham: 'GB', leeds: 'GB', glasgow: 'GB', belfast: 'GB',
  berlin: 'DE', munich: 'DE', münchen: 'DE', hamburg: 'DE', frankfurt: 'DE', cologne: 'DE', köln: 'DE', stuttgart: 'DE', düsseldorf: 'DE', dusseldorf: 'DE', leipzig: 'DE',
  amsterdam: 'NL', rotterdam: 'NL', utrecht: 'NL', eindhoven: 'NL', 'the hague': 'NL', 'den haag': 'NL', delft: 'NL',
  luxembourg: 'LU', zurich: 'CH', zürich: 'CH', geneva: 'CH', genève: 'CH', basel: 'CH', lausanne: 'CH', bern: 'CH', zug: 'CH',
  dubai: 'AE', 'abu dhabi': 'AE', sharjah: 'AE', riyadh: 'SA', jeddah: 'SA', doha: 'QA', manama: 'BH', muscat: 'OM', 'kuwait city': 'KW', 'tel aviv': 'IL', cairo: 'EG',
  sydney: 'AU', melbourne: 'AU', brisbane: 'AU', perth: 'AU', adelaide: 'AU', canberra: 'AU', auckland: 'NZ', wellington: 'NZ', christchurch: 'NZ',
  singapore: 'SG', 'hong kong': 'HK', tokyo: 'JP', seoul: 'KR', taipei: 'TW', 'kuala lumpur': 'MY', jakarta: 'ID', bangkok: 'TH', manila: 'PH', 'ho chi minh city': 'VN', hanoi: 'VN',
  bengaluru: 'IN', bangalore: 'IN', mumbai: 'IN', pune: 'IN', hyderabad: 'IN', chennai: 'IN', delhi: 'IN', 'new delhi': 'IN', gurgaon: 'IN', gurugram: 'IN', noida: 'IN', kolkata: 'IN', ahmedabad: 'IN',
  paris: 'FR', lyon: 'FR', madrid: 'ES', barcelona: 'ES', lisbon: 'PT', porto: 'PT', dublin: 'IE', cork: 'IE', stockholm: 'SE', copenhagen: 'DK', oslo: 'NO', helsinki: 'FI',
  warsaw: 'PL', krakow: 'PL', kraków: 'PL', prague: 'CZ', vienna: 'AT', wien: 'AT', brussels: 'BE', milan: 'IT', rome: 'IT', budapest: 'HU', bucharest: 'RO', athens: 'GR', tallinn: 'EE',
  vilnius: 'LT', riga: 'LV', sofia: 'BG', zagreb: 'HR', belgrade: 'RS', kyiv: 'UA', istanbul: 'TR', 'são paulo': 'BR', 'sao paulo': 'BR', 'mexico city': 'MX', 'buenos aires': 'AR',
  bogota: 'CO', bogotá: 'CO', santiago: 'CL', lagos: 'NG', nairobi: 'KE', 'cape town': 'ZA', johannesburg: 'ZA',
};

const NAME_INDEX: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [code, names] of Object.entries(countries.getNames('en', { select: 'all' }))) {
    for (const n of names as string[]) m.set(n.toLowerCase(), code);
  }
  for (const [alias, code] of Object.entries(ALIASES)) m.set(alias, code);
  return m;
})();

/** Every ISO country, for selectors. Dynamic: new codes in the dataset appear automatically. */
export function listCountries(): Array<{ code: string; name: string }> {
  return Object.entries(countries.getNames('en', { select: 'official' }))
    .map(([code, name]) => ({ code, name: name as string }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function countryName(code: string): string {
  return countries.getName(code, 'en', { select: 'official' }) ?? code;
}

export function toCountryCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (/^[A-Z]{2}$/.test(v) && countries.isValid(v)) return v;
  if (/^[A-Z]{3}$/.test(v)) {
    const a2 = countries.alpha3ToAlpha2(v);
    if (a2) return a2;
  }
  return NAME_INDEX.get(v.toLowerCase()) ?? CITIES[v.toLowerCase()] ?? null;
}

const US_STATE_NAMES = new Set(Object.values(US_STATES));

/** Name patterns (countries, aliases, cities), longest first, compiled once. */
const NAME_PATTERNS: Array<[RegExp, string]> = [...NAME_INDEX.entries(), ...Object.entries(CITIES)]
  .filter(([name]) => name.length >= 4)
  .sort((a, b) => b[0].length - a[0].length)
  .map(([name, code]) => [new RegExp(`(^|[^\\p{L}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'iu'), code]);

/** Full words only: country/city/state names, never 2-letter codes. */
function detectByName(seg: string): string | null {
  const lower = seg.trim().replace(/\.$/, '').toLowerCase();
  if (!lower) return null;
  // US states first: "Atlanta, Georgia" is far more common in postings than the country.
  if (US_STATE_NAMES.has(lower)) return 'US';
  const direct = NAME_INDEX.get(lower) ?? CITIES[lower];
  if (direct) return direct;
  if (CA_PROVINCES.includes(lower)) return 'CA';
  if (AU_STATES.includes(lower)) return 'AU';
  for (const [re, code] of NAME_PATTERNS) if (re.test(seg)) return code;
  return null;
}

/** 2-letter codes: "Austin, TX" (state) vs "Berlin, DE" (country). */
function detectByCode(part: string, afterComma: boolean): string | null {
  const s = part.trim().replace(/\.$/, '');
  if (s === 'UK') return 'GB';
  if (!/^[A-Z]{2}$/.test(s)) return null;
  if (afterComma && US_STATES[s]) return 'US';
  if (afterComma && CA_CODES.includes(s)) return 'CA';
  return countries.isValid(s) ? s : null;
}

/**
 * Parses free-form location strings such as "San Francisco, CA", "Remote (EU)", "London / Berlin",
 * "Hybrid - Amsterdam, Netherlands" or "Anywhere in the world".
 */
export function parseLocation(...inputs: Array<string | null | undefined>): ParsedLocation {
  const raw = inputs.filter(Boolean).join(' | ');
  const lower = raw.toLowerCase();
  const remote = /\b(remote|anywhere|worldwide|work from home|wfh|distributed|fully remote|global)\b/.test(lower);
  const hybrid = /\bhybrid\b/.test(lower);
  const globalScope = /\b(anywhere|worldwide|global(ly)?|any location|world ?wide|all countries)\b/.test(lower) || /^\s*remote\s*$/i.test(raw.trim());

  const regions = REGION_PATTERNS.filter(([re]) => re.test(raw)).map(([, key]) => key);
  const found = new Set<string>();
  const segments = raw.split(/[|;/•]|\s+-\s+|\s+–\s+|\(|\)|\bor\b|\band\b/i);
  for (const seg of segments) {
    const parts = seg.split(',').map((p) => p.trim()).filter(Boolean);
    if (!parts.length) continue;
    // Names win over codes, so "Bengaluru, IN" is India rather than Indiana.
    let code: string | null = null;
    for (let i = parts.length - 1; i >= 0 && !code; i--) code = detectByName(parts[i]);
    if (!code) code = detectByCode(parts[parts.length - 1], parts.length > 1);
    if (code) found.add(code);
  }
  const countriesFound = [...found];
  const city = raw.split(/[,|(/]/)[0]?.trim() || null;

  let remoteScope: RemoteScope = null;
  if (remote) {
    if (countriesFound.length && !globalScope) remoteScope = 'COUNTRY';
    else if (regions.length && !globalScope) remoteScope = 'REGION';
    else remoteScope = 'GLOBAL';
  }
  return { countries: countriesFound, regions, remote, hybrid, remoteScope, city: remote && !countriesFound.length ? null : city };
}

/** True when a job is open to someone in `countryCode` (on-site there, or remote covering it). */
export function jobOpenInCountry(
  job: { countries: string[]; remoteScope: RemoteScope; regions: string[] },
  countryCode: string,
  includeRemote = true,
): boolean {
  if (job.countries.includes(countryCode)) return true;
  if (!includeRemote) return false;
  if (job.remoteScope === 'GLOBAL') return true;
  if (job.remoteScope === 'REGION') return job.regions.some((r) => REGIONS[r]?.countries.includes(countryCode));
  return false;
}
