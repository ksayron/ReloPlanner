import { useState, useCallback } from 'react';
import client from './client';
import type { RelocationProfile, AnalysisResult, Skill } from '../types';

export function useProfiles() {
  const [profiles, setProfiles] = useState<RelocationProfile[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get('/profiles');
      setProfiles(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  const create = useCallback(async (dto: Omit<RelocationProfile, 'id' | 'skills'> & { skills: { skillId: string; proficiency: number }[] }) => {
    setLoading(true);
    try {
      const res = await client.post('/profiles', dto);
      setProfiles((prev) => [...prev, res.data]);
      return res.data as RelocationProfile;
    } finally {
      setLoading(false);
    }
  }, []);

  return { profiles, loading, create, refresh };
}

export function useAnalysis(profileId: string | undefined) {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    try {
      const res = await client.get(`/profiles/${profileId}/results`);
      setResult(res.data);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  const analyze = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    try {
      const res = await client.post(`/profiles/${profileId}/analyze`);
      setResult(res.data);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  return { result, loading, analyze, refresh };
}

export function useSkills() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get('/skills');
      setSkills(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  return { skills, loading, refresh };
}
