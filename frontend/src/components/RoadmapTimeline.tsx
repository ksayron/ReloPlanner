import type { GapItem, GapStatus } from '../types';

interface Props {
  gaps: GapItem[];
  onStatusChange?: (gapId: string, status: GapStatus) => void;
}

const statusColors: Record<string, string> = {
  PENDING: '#9e9e9e',
  IN_PROGRESS: '#2196f3',
  COMPLETED: '#4caf50',
};

export default function RoadmapTimeline({ gaps, onStatusChange }: Props) {
  const sorted = [...gaps].sort((a, b) => a.orderIndex - b.orderIndex);

  return (
    <div>
      <h3>Preparation Roadmap</h3>
      {sorted.map((gap, i) => (
        <div key={gap.id} style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '24px' }}>
            <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: statusColors[gap.status], border: '2px solid #fff', boxShadow: '0 0 0 2px ' + statusColors[gap.status] }} />
            {i < sorted.length - 1 && <div style={{ width: '2px', flex: 1, background: '#ddd', marginTop: '4px' }} />}
          </div>
          <div style={{ flex: 1, paddingBottom: '1rem' }}>
            <div style={{ fontWeight: 500 }}>{gap.skill?.name || gap.skillId}</div>
            <div style={{ color: '#666', fontSize: '0.85rem' }}>~{gap.estimatedMonths} months</div>
            {onStatusChange && (
              <select
                value={gap.status}
                onChange={(e) => onStatusChange(gap.id, e.target.value as GapStatus)}
                style={{ marginTop: '0.25rem', padding: '0.2rem', borderRadius: '4px', border: '1px solid #ccc' }}
              >
                <option value="PENDING">Pending</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
              </select>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
