import client from './client';
import type { UpdateUserPreferencesPayload, UserPreferences } from '../types';

export async function fetchMyPreferences(): Promise<UserPreferences | null> {
  try {
    const res = await client.get<UserPreferences>('/preferences/me');
    return res.data;
  } catch {
    return null;
  }
}

export async function updateMyPreferences(
  payload: UpdateUserPreferencesPayload,
): Promise<UserPreferences> {
  const res = await client.patch<UserPreferences>('/preferences/me', payload);
  return res.data;
}
