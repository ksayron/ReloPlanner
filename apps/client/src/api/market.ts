import type { MarketDigestCountryResponse } from '@reloplanner/shared-contracts';
import client from './client';

export async function fetchCountryMarketDigest(
  countryCode: string,
): Promise<MarketDigestCountryResponse> {
  const res = await client.get<MarketDigestCountryResponse>('/market/digest', {
    params: { country: countryCode },
  });
  return res.data;
}
