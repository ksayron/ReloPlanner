import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import client from '../api/client';
import type { GapStatus, RoadmapStep, TimeEstimate } from '../types';

interface RoadmapData {
  totalPrepMonths: number;
  timeEstimate: TimeEstimate | null;
  steps: RoadmapStep[];
}

export default function ProgressTracker() {
  const { profileId } = useParams<{ profileId: string }>();
  const [roadmap, setRoadmap] = useState<RoadmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    client
      .get(`/profiles/${profileId}/roadmap`)
      .then((res) => setRoadmap(res.data))
      .catch(() => setError('Failed to load roadmap'))
      .finally(() => setLoading(false));
  }, [profileId]);

  const updateStatus = async (stepId: string, status: GapStatus) => {
    try {
      await client.patch(`/gaps/${stepId}/status`, { status });
      setRoadmap((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          steps: prev.steps.map((s) => (s.id === stepId ? { ...s, status } : s)),
        };
      });
    } catch {
      setError('Failed to update status');
    }
  };

  if (loading) return <p style={{ textAlign: 'center', marginTop: '2rem' }}>Loading...</p>;

  const statusOptions: GapStatus[] = ['PENDING', 'IN_PROGRESS', 'COMPLETED'];
  const statusColor = (s: GapStatus) =>
    s === 'COMPLETED' ? '#4caf50' : s === 'IN_PROGRESS' ? '#ff9800' : '#999';

  return (
    <div style={{ maxWidth: '900px', margin: '2rem auto' }}>
      <h2>Progress Tracker</h2>
      {error && <p style={{ color: '#f44336' }}>{error}</p>}

      {roadmap && (
        <>
          <div style={{ background: '#f9f9f9', padding: '1rem', borderRadius: '8px', marginBottom: '1.2rem' }}>
            <strong>Total Estimated Preparation:</strong> {roadmap.totalPrepMonths} months
          </div>
          {roadmap.timeEstimate && (
            <div style={{ background: '#f9f9f9', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
              <div>Optimistic: {roadmap.timeEstimate.optimisticHours}h</div>
              <div>Realistic: {roadmap.timeEstimate.realisticHours}h</div>
              <div>Critical Path: {roadmap.timeEstimate.criticalPathHours}h</div>
            </div>
          )}

          <div>
            {roadmap.steps
              .sort((a, b) => a.orderIndex - b.orderIndex)
              .map((step, idx) => (
                <div
                  key={step.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.75rem',
                    borderLeft: `4px solid ${statusColor(step.status)}`,
                    background: '#fff',
                    marginBottom: '0.5rem',
                    borderRadius: '0 4px 4px 0',
                    border: '1px solid #eee',
                    borderLeftWidth: '4px',
                    borderLeftColor: statusColor(step.status),
                  }}
                >
                  <span style={{ width: '30px', color: '#999', fontSize: '0.85rem' }}>{idx + 1}</span>
                  <span style={{ flex: 1, fontWeight: 500 }}>{step.competencyName}</span>
                  <span style={{ fontSize: '0.82rem', color: '#666', marginRight: '0.75rem' }}>
                    {step.currentDisplayLevel} to {step.requiredDisplayLevel}
                  </span>
                  <span style={{ fontSize: '0.85rem', color: '#666', marginRight: '0.75rem' }}>
                    {step.estimatedHours}h
                  </span>
                  <select
                    value={step.status}
                    onChange={(e) => updateStatus(step.id, e.target.value as GapStatus)}
                    style={{ padding: '0.3rem', borderRadius: '4px', border: '1px solid #ccc' }}
                  >
                    {statusOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
          </div>

          {roadmap.steps.length === 0 && <p style={{ color: '#999' }}>No roadmap steps available.</p>}
        </>
      )}
    </div>
  );
}
