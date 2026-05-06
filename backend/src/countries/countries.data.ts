export interface CountryOption {
  code: string;
  name: string;
  suggestedCities?: string[];
}

export const TARGET_COUNTRIES: CountryOption[] = [
  { code: 'DE', name: 'Germany', suggestedCities: ['Berlin'] },
  { code: 'NL', name: 'Netherlands', suggestedCities: ['Amsterdam'] },
  { code: 'CA', name: 'Canada', suggestedCities: ['Toronto'] },
  { code: 'GB', name: 'United Kingdom', suggestedCities: ['London'] },
  { code: 'PL', name: 'Poland', suggestedCities: ['Warsaw'] },
];

export const SOURCE_COUNTRIES: CountryOption[] = [
  ...TARGET_COUNTRIES.map((c) => ({ code: c.code, name: c.name })),
  { code: 'UA', name: 'Ukraine', suggestedCities: ['Kyiv'] },
];

export const TARGET_COUNTRY_CODES = TARGET_COUNTRIES.map((c) => c.code);

export const TARGET_CITY_BY_COUNTRY: Record<string, string> = Object.fromEntries(
  TARGET_COUNTRIES.map((c) => [c.code, c.suggestedCities?.[0] ?? c.code]),
);
