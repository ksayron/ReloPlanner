import { Card, Stack, Text, Title } from '@mantine/core';
import type { AnalysisItem } from '../types';

interface SkillFitRadarChartProps {
  items: AnalysisItem[];
  maxItems?: number;
}

interface RadarPoint {
  id: string;
  label: string;
  current: number;
  required: number;
}

const clampUnit = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

const formatPercent = (value: number) => `${Math.round(clampUnit(value) * 100)}%`;

const shortLabel = (value: string, limit = 14) => (value.length > limit ? `${value.slice(0, limit - 1)}…` : value);

const toPolar = (index: number, total: number, radius: number, cx: number, cy: number) => {
  const angle = (-Math.PI / 2) + (index / total) * (2 * Math.PI);
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
  };
};

const polygonPoints = (data: RadarPoint[], selector: (item: RadarPoint) => number, cx: number, cy: number, r: number) =>
  data
    .map((item, index) => {
      const p = toPolar(index, data.length, r * clampUnit(selector(item)), cx, cy);
      return `${p.x},${p.y}`;
    })
    .join(' ');

export default function SkillFitRadarChart({ items, maxItems = 8 }: SkillFitRadarChartProps) {
  const data: RadarPoint[] = items
    .map((item) => ({
      id: item.competency.id,
      label: item.competency.name,
      current: clampUnit(item.normalizedCurrentScore),
      required: clampUnit(item.normalizedRequiredScore),
    }))
    .sort((a, b) => b.required - a.required)
    .slice(0, maxItems);

  if (data.length < 3) {
    return (
      <Card withBorder radius="lg" p="lg" className="bg-white">
        <Stack>
          <Title order={3}>Skill Fit Radar</Title>
          <Text c="dimmed" size="sm">Not enough competencies to render a radar chart.</Text>
        </Stack>
      </Card>
    );
  }

  const size = 520;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 170;
  const levels = [0.25, 0.5, 0.75, 1];

  const requiredShape = polygonPoints(data, (item) => item.required, cx, cy, radius);
  const currentShape = polygonPoints(data, (item) => item.current, cx, cy, radius);

  return (
    <Card radius="lg" p="lg" className="bg-white">
      <Stack>
        <Title order={3}>Skill Fit Radar</Title>
        <Text size="sm" c="dimmed">
          Blue area: your current level. Dark outline: required market level. Hover points for exact values.
        </Text>
        <div style={{ width: '100%', overflowX: 'auto' }}>
          <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', minWidth: 360, height: 'auto' }} role="img" aria-label="Skill fit radar chart">
            {levels.map((level) => (
              <circle
                key={`level-${level}`}
                cx={cx}
                cy={cy}
                r={radius * level}
                fill="none"
                stroke="#d7dde5"
                strokeWidth={1}
              />
            ))}

            {data.map((item, index) => {
              const end = toPolar(index, data.length, radius, cx, cy);
              const label = toPolar(index, data.length, radius + 26, cx, cy);
              return (
                <g key={item.id}>
                  <line x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="#d7dde5" strokeWidth={1} />
                  <text x={label.x} y={label.y} textAnchor="middle" fontSize="11" fill="#1f2933">
                    <title>{item.label}</title>
                    {shortLabel(item.label)}
                  </text>
                </g>
              );
            })}

            <polygon points={requiredShape} fill="none" stroke="#23395d" strokeWidth={2} />
            <polygon points={currentShape} fill="#4682A955" stroke="#4682A9" strokeWidth={2} />

            {data.map((item, index) => {
              const pCurrent = toPolar(index, data.length, radius * item.current, cx, cy);
              const pRequired = toPolar(index, data.length, radius * item.required, cx, cy);
              return (
                <g key={`points-${item.id}`}>
                  <circle cx={pCurrent.x} cy={pCurrent.y} r={4} fill="#4682A9">
                    <title>{`${item.label}: current ${formatPercent(item.current)}, required ${formatPercent(item.required)}`}</title>
                  </circle>
                  <circle cx={pRequired.x} cy={pRequired.y} r={3} fill="#23395d">
                    <title>{`${item.label}: required ${formatPercent(item.required)}`}</title>
                  </circle>
                </g>
              );
            })}
          </svg>
        </div>
      </Stack>
    </Card>
  );
}
