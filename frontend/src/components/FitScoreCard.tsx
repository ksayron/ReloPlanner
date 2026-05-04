interface Props {
  score: number;
}

export default function FitScoreCard({ score }: Props) {
  const percentage = Math.round(score * 100);
  const color = percentage >= 70 ? '#4caf50' : percentage >= 40 ? '#ff9800' : '#f44336';

  return (
    <div style={{ textAlign: 'center', padding: '2rem', border: `3px solid ${color}`, borderRadius: '12px', background: '#fafafa' }}>
      <div style={{ fontSize: '3rem', fontWeight: 'bold', color }}>{score.toFixed(3)}</div>
      <div style={{ fontSize: '1rem', color: '#666', marginTop: '0.5rem' }}>Fit Score ({percentage}%)</div>
    </div>
  );
}
