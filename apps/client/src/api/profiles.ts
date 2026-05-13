import client from './client';
import type { RelocationProfile } from '@reloplanner/shared-contracts';

export async function listProfiles() {
  const res = await client.get<RelocationProfile[]>('/profiles');
  return res.data;
}
