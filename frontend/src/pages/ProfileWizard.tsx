import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import type {
  Competency,
  HardSkillLevel,
  LanguageLevel,
  CertificationStatus,
  UserCompetencyInput,
} from '../types';

interface SelectedCompetency {
  competencyId: string;
  type: Competency['type'];
  level: HardSkillLevel | LanguageLevel | CertificationStatus;
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

const HARD_LEVELS: HardSkillLevel[] = [
  'NONE',
  'BASIC',
  'PRACTICAL',
  'CONFIDENT',
  'ADVANCED',
];
const LANGUAGE_LEVELS: LanguageLevel[] = ['NONE', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const CERT_LEVELS: CertificationStatus[] = [
  'NONE',
  'PLANNED',
  'IN_PROGRESS',
  'OBTAINED',
  'EXPIRED',
];

export default function ProfileWizard() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [currentCountry, setCurrentCountry] = useState('');
  const [yearsExperience, setYearsExperience] = useState(0);
  const [desiredRole, setDesiredRole] = useState('');

  const [allCompetencies, setAllCompetencies] = useState<Competency[]>([]);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<SelectedCompetency[]>([]);

  const [targetCountry, setTargetCountry] = useState('');
  const [targetCity, setTargetCity] = useState('');

  useEffect(() => {
    client
      .get('/competencies')
      .then((res) => setAllCompetencies(res.data))
      .catch(() => {});
  }, []);

  const filtered = allCompetencies.filter((c) =>
    c.name.toLowerCase().includes(filter.toLowerCase()),
  );

  const getDefaultLevel = (type: Competency['type']) => {
    if (type === 'LANGUAGE') return 'A2';
    if (type === 'CERTIFICATION') return 'NONE';
    return 'BASIC';
  };

  const toggle = (competency: Competency) => {
    setSelected((prev) => {
      const exists = prev.find((x) => x.competencyId === competency.id);
      if (exists) return prev.filter((x) => x.competencyId !== competency.id);
      return [
        ...prev,
        {
          competencyId: competency.id,
          type: competency.type,
          level: getDefaultLevel(competency.type),
        },
      ];
    });
  };

  const setLevel = (
    competencyId: string,
    level: HardSkillLevel | LanguageLevel | CertificationStatus,
  ) => {
    setSelected((prev) =>
      prev.map((x) => (x.competencyId === competencyId ? { ...x, level } : x)),
    );
  };

  const isSelected = (competencyId: string) =>
    selected.some((x) => x.competencyId === competencyId);

  const toPayloadCompetencies = (): UserCompetencyInput[] =>
    selected.map((x) => {
      if (x.type === 'LANGUAGE') {
        return { competencyId: x.competencyId, languageLevel: x.level as LanguageLevel };
      }
      if (x.type === 'CERTIFICATION') {
        return {
          competencyId: x.competencyId,
          certificationStatus: x.level as CertificationStatus,
        };
      }
      return { competencyId: x.competencyId, hardSkillLevel: x.level as HardSkillLevel };
    });

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
        competencies: toPayloadCompetencies(),
      });
      navigate(`/dashboard/${res.data.id}`);
    } catch {
      setError('Failed to create profile');
    } finally {
      setSubmitting(false);
    }
  };

  const countryName = (code: string) => COUNTRIES.find((c) => c.code === code)?.name ?? code;
  const levelOptions = (type: Competency['type']) => {
    if (type === 'LANGUAGE') return LANGUAGE_LEVELS;
    if (type === 'CERTIFICATION') return CERT_LEVELS;
    return HARD_LEVELS;
  };

  const selectStyle = {
    width: '100%',
    padding: '0.5rem',
    borderRadius: '4px',
    border: '1px solid #ccc',
    marginBottom: '1rem',
    background: '#fff',
  } as const;
  const inputStyle = selectStyle;
  const btnStyle = {
    padding: '0.6rem 1.5rem',
    background: '#e94560',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  } as const;

  return (
    <div style={{ maxWidth: '700px', margin: '2rem auto' }}>
      <h2>Create Relocation Profile</h2>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {[1, 2, 3, 4].map((step) => (
          <div
            key={step}
            style={{
              flex: 1,
              height: '4px',
              borderRadius: '2px',
              background: step <= currentStep ? '#e94560' : '#ddd',
            }}
          />
        ))}
      </div>
      {error && <p style={{ color: '#f44336' }}>{error}</p>}

      {currentStep === 1 && (
        <div>
          <h3>Basic Information</h3>
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>Current Country</label>
          <select
            value={currentCountry}
            onChange={(e) => setCurrentCountry(e.target.value)}
            style={selectStyle}
          >
            <option value="">-- Select country --</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>

          <label style={{ display: 'block', marginBottom: '0.25rem' }}>Years of Experience</label>
          <input
            type="number"
            value={yearsExperience}
            onChange={(e) => setYearsExperience(Number(e.target.value))}
            min={0}
            max={40}
            style={inputStyle}
          />

          <label style={{ display: 'block', marginBottom: '0.25rem' }}>Desired Role</label>
          <select
            value={desiredRole}
            onChange={(e) => setDesiredRole(e.target.value)}
            style={selectStyle}
          >
            <option value="">-- Select role --</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      )}

      {currentStep === 2 && (
        <div>
          <h3>Competencies</h3>
          <input
            placeholder="Search competencies..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={inputStyle}
          />
          <div
            style={{
              maxHeight: '360px',
              overflowY: 'auto',
              border: '1px solid #eee',
              borderRadius: '4px',
              padding: '0.5rem',
            }}
          >
            {filtered.map((c) => (
              <div
                key={c.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.45rem 0',
                  borderBottom: '1px solid #f0f0f0',
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected(c.id)}
                  onChange={() => toggle(c)}
                />
                <span style={{ flex: 1 }}>{c.name}</span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: '#999',
                    background: '#f5f5f5',
                    padding: '2px 6px',
                    borderRadius: '4px',
                  }}
                >
                  {c.type}
                </span>
                {isSelected(c.id) && (
                  <select
                    value={selected.find((x) => x.competencyId === c.id)?.level ?? getDefaultLevel(c.type)}
                    onChange={(e) =>
                      setLevel(
                        c.id,
                        e.target.value as HardSkillLevel | LanguageLevel | CertificationStatus,
                      )
                    }
                    style={{ ...selectStyle, width: '190px', marginBottom: 0 }}
                  >
                    {levelOptions(c.type).map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {lvl}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
            {filtered.length === 0 && <p style={{ color: '#999' }}>No competencies found</p>}
          </div>
          <p style={{ marginTop: '0.5rem', color: '#666' }}>{selected.length} competency(s) selected</p>
        </div>
      )}

      {currentStep === 3 && (
        <div>
          <h3>Target Location</h3>
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>Target Country</label>
          <select
            value={targetCountry}
            onChange={(e) => {
              setTargetCountry(e.target.value);
              setTargetCity('');
            }}
            style={selectStyle}
          >
            <option value="">-- Select country --</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>Target City (optional)</label>
          <select
            value={targetCity}
            onChange={(e) => setTargetCity(e.target.value)}
            style={selectStyle}
            disabled={!targetCountry}
          >
            <option value="">-- Select city (optional) --</option>
            {(CITIES[targetCountry] || []).map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </div>
      )}

      {currentStep === 4 && (
        <div>
          <h3>Review</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem' }}>
            <tbody>
              <tr>
                <td style={{ padding: '0.4rem', fontWeight: 'bold' }}>Current Country</td>
                <td>{countryName(currentCountry)}</td>
              </tr>
              <tr>
                <td style={{ padding: '0.4rem', fontWeight: 'bold' }}>Experience</td>
                <td>{yearsExperience} years</td>
              </tr>
              <tr>
                <td style={{ padding: '0.4rem', fontWeight: 'bold' }}>Desired Role</td>
                <td>{desiredRole}</td>
              </tr>
              <tr>
                <td style={{ padding: '0.4rem', fontWeight: 'bold' }}>Target</td>
                <td>
                  {countryName(targetCountry)}
                  {targetCity ? `, ${targetCity}` : ''}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '0.4rem', fontWeight: 'bold' }}>Competencies</td>
                <td>{selected.length} selected</td>
              </tr>
            </tbody>
          </table>

          {selected.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              {selected.map((s) => {
                const comp = allCompetencies.find((c) => c.id === s.competencyId);
                return (
                  <span
                    key={s.competencyId}
                    style={{
                      display: 'inline-block',
                      background: '#f0f0f0',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      margin: '2px',
                      fontSize: '0.85rem',
                    }}
                  >
                    {comp?.name ?? s.competencyId}: {s.level}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem' }}>
        {currentStep > 1 ? (
          <button onClick={() => setCurrentStep((s) => s - 1)} style={{ ...btnStyle, background: '#888' }}>
            Back
          </button>
        ) : (
          <div />
        )}
        {currentStep < 4 ? (
          <button onClick={() => setCurrentStep((s) => s + 1)} style={btnStyle}>
            Next
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={submitting} style={btnStyle}>
            {submitting ? 'Submitting...' : 'Create Profile'}
          </button>
        )}
      </div>
    </div>
  );
}
