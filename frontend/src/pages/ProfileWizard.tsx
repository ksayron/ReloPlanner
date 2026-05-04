import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import type { Skill } from '../types';

interface SelectedSkill {
  skillId: string;
  proficiency: number;
}

const COUNTRIES = [
  { code: 'DE', name: 'Germany' },
  { code: 'PL', name: 'Poland' },
  { code: 'CA', name: 'Canada' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'FR', name: 'France' },
  { code: 'ES', name: 'Spain' },
  { code: 'CZ', name: 'Czech Republic' },
];

const CITIES: Record<string, string[]> = {
  DE: ['Berlin', 'Munich', 'Hamburg', 'Frankfurt'],
  PL: ['Warsaw', 'Krakow', 'Wroclaw', 'Gdansk'],
  CA: ['Toronto', 'Vancouver', 'Montreal', 'Ottawa'],
  UA: ['Kyiv', 'Lviv', 'Kharkiv', 'Odesa'],
  US: ['New York', 'San Francisco', 'Austin', 'Seattle'],
  GB: ['London', 'Manchester', 'Edinburgh', 'Bristol'],
  NL: ['Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht'],
  FR: ['Paris', 'Lyon', 'Marseille', 'Toulouse'],
  ES: ['Madrid', 'Barcelona', 'Valencia', 'Seville'],
  CZ: ['Prague', 'Brno', 'Ostrava'],
};

const ROLES = [
  'Frontend Developer',
  'Backend Developer',
  'Full-Stack Developer',
  'DevOps Engineer',
  'Data Scientist',
  'Data Engineer',
  'Mobile Developer',
  'QA Engineer',
  'Software Architect',
  'Engineering Manager',
];

export default function ProfileWizard() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Step 1
  const [currentCountry, setCurrentCountry] = useState('');
  const [yearsExperience, setYearsExperience] = useState(0);
  const [desiredRole, setDesiredRole] = useState('');

  // Step 2
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [skillFilter, setSkillFilter] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<SelectedSkill[]>([]);

  // Step 3
  const [targetCountry, setTargetCountry] = useState('');
  const [targetCity, setTargetCity] = useState('');

  useEffect(() => {
    client.get('/skills').then(res => setAllSkills(res.data)).catch(() => {});
  }, []);

  const filteredSkills = allSkills.filter(s =>
    s.name.toLowerCase().includes(skillFilter.toLowerCase())
  );

  const toggleSkill = (skillId: string) => {
    setSelectedSkills(prev => {
      const exists = prev.find(s => s.skillId === skillId);
      if (exists) return prev.filter(s => s.skillId !== skillId);
      return [...prev, { skillId, proficiency: 50 }];
    });
  };

  const setProficiency = (skillId: string, proficiency: number) => {
    setSelectedSkills(prev =>
      prev.map(s => (s.skillId === skillId ? { ...s, proficiency } : s))
    );
  };

  const isSelected = (skillId: string) =>
    selectedSkills.some(s => s.skillId === skillId);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await client.post('/profiles', {
        currentCountry,
        yearsExperience,
        desiredRole,
        targetCountry,
        targetCity: targetCity || undefined,
        skills: selectedSkills.map(s => ({ skillId: s.skillId, proficiency: s.proficiency / 100 })),
      });
      navigate(`/dashboard/${res.data.id}`);
    } catch {
      setError('Failed to create profile');
    } finally {
      setSubmitting(false);
    }
  };

  const countryName = (code: string) => COUNTRIES.find(c => c.code === code)?.name ?? code;

  const selectStyle = { width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', marginBottom: '1rem', background: '#fff' } as const;
  const inputStyle = selectStyle;
  const btnStyle = { padding: '0.6rem 1.5rem', background: '#e94560', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' } as const;

  return (
    <div style={{ maxWidth: '600px', margin: '2rem auto' }}>
      <h2>Create Relocation Profile</h2>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {[1, 2, 3, 4].map(step => (
          <div key={step} style={{
            flex: 1, height: '4px', borderRadius: '2px',
            background: step <= currentStep ? '#e94560' : '#ddd',
          }} />
        ))}
      </div>
      {error && <p style={{ color: '#f44336' }}>{error}</p>}

      {currentStep === 1 && (
        <div>
          <h3>Basic Information</h3>
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>Current Country</label>
          <select value={currentCountry} onChange={e => setCurrentCountry(e.target.value)} style={selectStyle}>
            <option value="">-- Select country --</option>
            {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>Years of Experience</label>
          <input type="number" value={yearsExperience} onChange={e => setYearsExperience(Number(e.target.value))} min={0} max={40} style={inputStyle} />
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>Desired Role</label>
          <select value={desiredRole} onChange={e => setDesiredRole(e.target.value)} style={selectStyle}>
            <option value="">-- Select role --</option>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      )}

      {currentStep === 2 && (
        <div>
          <h3>Skills</h3>
          <input
            placeholder="Search skills..."
            value={skillFilter}
            onChange={e => setSkillFilter(e.target.value)}
            style={inputStyle}
          />
          <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '4px', padding: '0.5rem' }}>
            {filteredSkills.map(skill => (
              <div key={skill.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0', borderBottom: '1px solid #f0f0f0' }}>
                <input
                  type="checkbox"
                  checked={isSelected(skill.id)}
                  onChange={() => toggleSkill(skill.id)}
                />
                <span style={{ flex: 1 }}>{skill.name}</span>
                <span style={{ fontSize: '0.75rem', color: '#999', background: '#f5f5f5', padding: '2px 6px', borderRadius: '4px' }}>{skill.category}</span>
                {isSelected(skill.id) && (
                  <>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={selectedSkills.find(s => s.skillId === skill.id)?.proficiency ?? 50}
                      onChange={e => setProficiency(skill.id, Number(e.target.value))}
                      style={{ width: '80px' }}
                    />
                    <span style={{ fontSize: '0.8rem', minWidth: '32px', textAlign: 'right' }}>
                      {selectedSkills.find(s => s.skillId === skill.id)?.proficiency ?? 50}%
                    </span>
                  </>
                )}
              </div>
            ))}
            {filteredSkills.length === 0 && <p style={{ color: '#999' }}>No skills found</p>}
          </div>
          <p style={{ marginTop: '0.5rem', color: '#666' }}>{selectedSkills.length} skill(s) selected</p>
        </div>
      )}

      {currentStep === 3 && (
        <div>
          <h3>Target Location</h3>
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>Target Country</label>
          <select value={targetCountry} onChange={e => { setTargetCountry(e.target.value); setTargetCity(''); }} style={selectStyle}>
            <option value="">-- Select country --</option>
            {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>Target City (optional)</label>
          <select value={targetCity} onChange={e => setTargetCity(e.target.value)} style={selectStyle} disabled={!targetCountry}>
            <option value="">-- Select city (optional) --</option>
            {(CITIES[targetCountry] || []).map(city => <option key={city} value={city}>{city}</option>)}
          </select>
        </div>
      )}

      {currentStep === 4 && (
        <div>
          <h3>Review</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem' }}>
            <tbody>
              <tr><td style={{ padding: '0.4rem', fontWeight: 'bold' }}>Current Country</td><td>{countryName(currentCountry)}</td></tr>
              <tr><td style={{ padding: '0.4rem', fontWeight: 'bold' }}>Experience</td><td>{yearsExperience} years</td></tr>
              <tr><td style={{ padding: '0.4rem', fontWeight: 'bold' }}>Desired Role</td><td>{desiredRole}</td></tr>
              <tr><td style={{ padding: '0.4rem', fontWeight: 'bold' }}>Target</td><td>{countryName(targetCountry)}{targetCity ? `, ${targetCity}` : ''}</td></tr>
              <tr><td style={{ padding: '0.4rem', fontWeight: 'bold' }}>Skills</td><td>{selectedSkills.length} selected</td></tr>
            </tbody>
          </table>
          {selectedSkills.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              {selectedSkills.map(s => {
                const skill = allSkills.find(sk => sk.id === s.skillId);
                return (
                  <span key={s.skillId} style={{ display: 'inline-block', background: '#f0f0f0', padding: '4px 8px', borderRadius: '4px', margin: '2px', fontSize: '0.85rem' }}>
                    {skill?.name ?? s.skillId}: {s.proficiency}%
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem' }}>
        {currentStep > 1 ? (
          <button onClick={() => setCurrentStep(s => s - 1)} style={{ ...btnStyle, background: '#888' }}>Back</button>
        ) : <div />}
        {currentStep < 4 ? (
          <button onClick={() => setCurrentStep(s => s + 1)} style={btnStyle}>Next</button>
        ) : (
          <button onClick={handleSubmit} disabled={submitting} style={btnStyle}>
            {submitting ? 'Submitting...' : 'Create Profile'}
          </button>
        )}
      </div>
    </div>
  );
}
