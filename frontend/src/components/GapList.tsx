import type { GapItem } from '../types';

interface Props {
  gaps: GapItem[];
}

const severityColors: Record<string, string> = {
  CRITICAL: '#f44336',
  MODERATE: '#ff9800',
  MINOR: '#2196f3',
};

const severityOrder: Record<string, number> = { CRITICAL: 0, MODERATE: 1, MINOR: 2 };

export default function GapList({ gaps }: Props) {
  const sorted = [...gaps].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return (
    <div>
      <h3>Skill Gaps</h3>
      {sorted.map((gap) => (
        <div key={gap.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', marginBottom: '0.5rem', border: '1px solid #ddd', borderRadius: '8px', borderLeft: `4px solid ${severityColors[gap.severity]}` }}>
          <span style={{ background: severityColors[gap.severity], color: '#fff', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' }}>{gap.severity}</span>
          <span style={{ flex: 1, fontWeight: 500 }}>{gap.skill?.name || gap.skillId}</span>
          <span style={{ color: '#666', fontSize: '0.9rem' }}>{gap.gapType}</span>
          <span style={{ fontWeight: 'bold' }}>~{gap.estimatedMonths} mo</span>
        </div>
      ))}
    </div>
  );
}
