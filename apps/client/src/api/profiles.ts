import client from './client';
import type {
  CompareProfilesRequest,
  CompareProfilesResponse,
  RelocationProfile,
} from '@reloplanner/shared-contracts';

export async function listProfiles() {
  const res = await client.get<RelocationProfile[]>('/profiles');
  return res.data;
}

export async function compareProfiles(payload: CompareProfilesRequest) {
  const res = await client.post<CompareProfilesResponse>('/profiles/compare', payload);
  return res.data;
}
