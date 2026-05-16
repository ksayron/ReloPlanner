import type {
  CountryJobPostingsResponse,
  MarketDigestCountryResponse,
} from '@reloplanner/shared-contracts';
import client from './client';

export async function fetchCountryMarketDigest(
  countryCode: string,
): Promise<MarketDigestCountryResponse> {
  const res = await client.get<MarketDigestCountryResponse>('/market/digest', {
    params: { country: countryCode },
  });
  return res.data;
}

export async function fetchCountryJobPostings(
  countryCode: string,
  page: number,
  pageSize: number,
): Promise<CountryJobPostingsResponse> {
  const res = await client.get<CountryJobPostingsResponse>('/market/postings', {
    params: { country: countryCode, page, pageSize },
  });
  return res.data;
}
