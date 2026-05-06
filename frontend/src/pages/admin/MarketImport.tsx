import { useEffect, useState } from 'react';
import client from '../../api/client';
import { fetchCountriesCatalog } from '../../api/countries';
import type { CountryOption } from '../../types';

interface SkillRow {
  skillName: string;
  frequency: number;
  avgRequiredLevel: number;
}

export default function MarketImport() {
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [totalVacancies, setTotalVacancies] = useState(0);
  const [jsonMode, setJsonMode] = useState(true);
  const [jsonText, setJsonText] = useState('');
  const [skillRows, setSkillRows] = useState<SkillRow[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [targetCountries, setTargetCountries] = useState<CountryOption[]>([]);

  useEffect(() => {
    const loadCountries = async () => {
      const catalog = await fetchCountriesCatalog();
      setTargetCountries(catalog.target);
    };
    void loadCountries();
  }, []);

  const addRow = () => {
    setSkillRows(prev => [...prev, { skillName: '', frequency: 0, avgRequiredLevel: 0 }]);
  };

  const updateRow = (index: number, field: keyof SkillRow, value: string | number) => {
    setSkillRows(prev => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  const removeRow = (index: number) => {
    setSkillRows(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    setError('');
    setMessage('');

    let skills: SkillRow[];
    if (jsonMode) {
      try {
        skills = JSON.parse(jsonText);
        if (!Array.isArray(skills)) throw new Error();
      } catch {
        setError('Invalid JSON array');
        return;
      }
    } else {
      skills = skillRows;
    }

    setSubmitting(true);
    try {
      await client.post('/admin/import/market', {
        country,
        city: city || undefined,
        totalVacancies,
        skills,
      });
      setMessage('Market data imported successfully');
    } catch {
      setError('Import failed');
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = { padding: '0.4rem', borderRadius: '4px', border: '1px solid #ccc', width: '100%' } as const;
  const btnStyle = { padding: '0.4rem 1rem', background: '#e94560', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' } as const;

  return (
    <div style={{ maxWidth: '800px', margin: '2rem auto' }}>
      <h2>Market Data Import</h2>
      {error && <p style={{ color: '#f44336' }}>{error}</p>}
      {message && <p style={{ color: '#4caf50' }}>{message}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>Country</label>
          <select value={country} onChange={e => setCountry(e.target.value)} style={inputStyle}>
            <option value="">-- Select country --</option>
            {targetCountries.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name} ({option.code})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>City (optional)</label>
          <input value={city} onChange={e => setCity(e.target.value)} style={inputStyle} />
        </div>
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.25rem' }}>Total Vacancies</label>
        <input type="number" value={totalVacancies} onChange={e => setTotalVacancies(Number(e.target.value))} min={0} style={{ ...inputStyle, width: '200px' }} />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ marginRight: '1rem' }}>
          <input type="radio" checked={jsonMode} onChange={() => setJsonMode(true)} /> JSON input
        </label>
        <label>
          <input type="radio" checked={!jsonMode} onChange={() => setJsonMode(false)} /> Manual rows
        </label>
      </div>

      {jsonMode ? (
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>Skills JSON Array</label>
          <textarea
            value={jsonText}
            onChange={e => setJsonText(e.target.value)}
            rows={8}
            placeholder={'[\n  { "skillName": "React", "frequency": 0.8, "avgRequiredLevel": 0.7 }\n]'}
            style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '0.85rem' }}
          />
        </div>
      ) : (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h4 style={{ margin: 0 }}>Skills</h4>
            <button onClick={addRow} style={btnStyle}>+ Add Skill</button>
          </div>
          {skillRows.map((row, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
              <input
                placeholder="Skill name"
                value={row.skillName}
                onChange={e => updateRow(idx, 'skillName', e.target.value)}
                style={{ ...inputStyle, flex: 2 }}
              />
              <input
                type="number"
                placeholder="Freq (0-1)"
                min={0}
                max={1}
                step={0.05}
                value={row.frequency}
                onChange={e => updateRow(idx, 'frequency', Number(e.target.value))}
                style={{ ...inputStyle, flex: 1 }}
              />
              <input
                type="number"
                placeholder="Level (0-1)"
                min={0}
                max={1}
                step={0.05}
                value={row.avgRequiredLevel}
                onChange={e => updateRow(idx, 'avgRequiredLevel', Number(e.target.value))}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={() => removeRow(idx)} style={{ ...btnStyle, background: '#888', padding: '0.3rem 0.6rem' }}>X</button>
            </div>
          ))}
          {skillRows.length === 0 && <p style={{ color: '#999' }}>No skills added yet. Click "+ Add Skill" to begin.</p>}
        </div>
      )}

      <button onClick={handleSubmit} disabled={submitting} style={{ ...btnStyle, padding: '0.6rem 2rem' }}>
        {submitting ? 'Importing...' : 'Import Market Data'}
      </button>
    </div>
  );
}
