import client from './client';
import type { CountriesCatalog } from '../types';

const FALLBACK_COUNTRIES: CountriesCatalog = {
  target: [
    { code: 'DE', name: 'Germany', suggestedCities: ['Berlin'] },
    { code: 'NL', name: 'Netherlands', suggestedCities: ['Amsterdam'] },
    { code: 'CA', name: 'Canada', suggestedCities: ['Toronto'] },
    { code: 'GB', name: 'United Kingdom', suggestedCities: ['London'] },
    { code: 'PL', name: 'Poland', suggestedCities: ['Warsaw'] },
  ],
  source: [
    { code: 'DE', name: 'Germany' },
    { code: 'NL', name: 'Netherlands' },
    { code: 'CA', name: 'Canada' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'PL', name: 'Poland' },
    { code: 'UA', name: 'Ukraine' },
  ],
};

export async function fetchCountriesCatalog(): Promise<CountriesCatalog> {
  try {
    const res = await client.get('/countries');
    if (res?.data?.target && res?.data?.source) {
      return res.data as CountriesCatalog;
    }
    return FALLBACK_COUNTRIES;
  } catch {
    return FALLBACK_COUNTRIES;
  }
}
