export interface CountryOption {
  code: string;
  name: string;
  suggestedCities?: string[];
}

export const TARGET_COUNTRIES: CountryOption[] = [
  {
    code: 'DE',
    name: 'Germany',
    suggestedCities: ['Berlin', 'Munich', 'Hamburg', 'Frankfurt'],
  },
  {
    code: 'NL',
    name: 'Netherlands',
    suggestedCities: ['Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht'],
  },
  {
    code: 'CA',
    name: 'Canada',
    suggestedCities: ['Toronto', 'Vancouver', 'Montreal', 'Ottawa'],
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    suggestedCities: ['London', 'Manchester', 'Edinburgh', 'Bristol'],
  },
  {
    code: 'PL',
    name: 'Poland',
    suggestedCities: ['Warsaw', 'Krakow', 'Wroclaw', 'Gdansk'],
  },
];

export const SOURCE_COUNTRIES: CountryOption[] = [
  ...TARGET_COUNTRIES.map((c) => ({ code: c.code, name: c.name })),
  { code: 'UA', name: 'Ukraine', suggestedCities: ['Kyiv'] },
];

export const TARGET_COUNTRY_CODES = TARGET_COUNTRIES.map((c) => c.code);

export const TARGET_CITY_BY_COUNTRY: Record<string, string> =
  Object.fromEntries(
    TARGET_COUNTRIES.map((c) => [c.code, c.suggestedCities?.[0] ?? c.code]),
  );
