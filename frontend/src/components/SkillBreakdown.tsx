import type { SkillMatchResult } from '../types';

interface Props {
  breakdown: SkillMatchResult[];
  skills: Map<string, string>; // id -> name
}

export default function SkillBreakdown({ breakdown, skills }: Props) {
  return (
    <div>
      <h3>Skill Breakdown</h3>
      {breakdown.map((item) => {
        const pct = Math.round(item.matchScore * 100);
        const color = pct >= 70 ? '#4caf50' : pct >= 40 ? '#ff9800' : '#f44336';
        return (
          <div key={item.skillId} style={{ marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span>{skills.get(item.skillId) || item.skillId}</span>
              <span style={{ color, fontWeight: 'bold' }}>{pct}%{item.source === 'transferability' ? ' (transfer)' : ''}</span>
            </div>
            <div style={{ height: '8px', background: '#eee', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '4px' }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
