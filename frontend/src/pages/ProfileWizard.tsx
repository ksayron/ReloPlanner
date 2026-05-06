import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { fetchCountriesCatalog } from '../api/countries';
import type {
  CertificationStatus,
  Competency,
  CountriesCatalog,
  HardSkillLevel,
  LanguageLevel,
  UserCompetencyInput,
} from '../types';

interface SelectedCompetency {
  competencyId: string;
  type: Competency['type'];
  level: HardSkillLevel | LanguageLevel | CertificationStatus;
}

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

const HARD_LEVELS: HardSkillLevel[] = ['NONE', 'BASIC', 'PRACTICAL', 'CONFIDENT', 'ADVANCED'];
const LANGUAGE_LEVELS: LanguageLevel[] = ['NONE', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const CERT_LEVELS: CertificationStatus[] = ['NONE', 'PLANNED', 'IN_PROGRESS', 'OBTAINED', 'EXPIRED'];

const HARD_LEVEL_LABELS: Record<HardSkillLevel, string> = {
  NONE: 'None - не знаю',
  BASIC: 'Basic - понимаю основы, могу читать код/конфиги',
  PRACTICAL: 'Practical - могу использовать в простых задачах',
  CONFIDENT: 'Confident - использую в рабочих задачах самостоятельно',
  ADVANCED: 'Advanced - могу проектировать решения и помогать другим',
};

const formatEnumLabel = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const OTHER_CITY_VALUE = '__OTHER_CITY__';

export default function ProfileWizard() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [targetCountry, setTargetCountry] = useState('');
  const [targetCity, setTargetCity] = useState('');
  const [yearsExperience, setYearsExperience] = useState(0);
  const [desiredRole, setDesiredRole] = useState('');

  const [currentCountry, setCurrentCountry] = useState('');
  const [budget] = useState('');
  const [visa] = useState('');

  const [allCompetencies, setAllCompetencies] = useState<Competency[]>([]);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<SelectedCompetency[]>([]);
  const [countriesCatalog, setCountriesCatalog] = useState<CountriesCatalog>({
    target: [],
    source: [],
  });

  useEffect(() => {
    const loadCountries = async () => {
      const data = await fetchCountriesCatalog();
      setCountriesCatalog(data);
    };
    void loadCountries();
  }, []);

  useEffect(() => {
    const loadCompetencies = async () => {
      try {
        const params: Record<string, string> = {};
        if (desiredRole) params.roleName = desiredRole;
        if (targetCountry) params.countryCode = targetCountry;
        const res = await client.get('/competencies', { params });
        setAllCompetencies(res.data);
      } catch {
        setAllCompetencies([]);
      }
    };
    void loadCompetencies();
  }, [desiredRole, targetCountry]);

  const filtered = useMemo(
    () =>
      allCompetencies.filter((c) =>
        c.name.toLowerCase().includes(filter.toLowerCase().trim()),
      ),
    [allCompetencies, filter],
  );

  const suggestedCitiesByCountry = useMemo(
    () =>
      Object.fromEntries(
        countriesCatalog.target.map((country) => [country.code, country.suggestedCities ?? []]),
      ) as Record<string, string[]>,
    [countriesCatalog.target],
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

  const levelOptions = (type: Competency['type']) => {
    if (type === 'LANGUAGE') return LANGUAGE_LEVELS;
    if (type === 'CERTIFICATION') return CERT_LEVELS;
    return HARD_LEVELS;
  };

  const validateStep = (step: number) => {
    if (step === 1) {
      if (!targetCountry || !desiredRole) {
        setError('Goal page: desired country and desired role are required.');
        return false;
      }
      if (yearsExperience < 0) {
        setError('Years of experience must be 0 or more.');
        return false;
      }
    }
    if (step === 2 && !currentCountry) {
      setError('Source page: current country is required.');
      return false;
    }
    setError('');
    return true;
  };

  const nextStep = () => {
    if (!validateStep(currentStep)) return;
    setCurrentStep((s) => Math.min(3, s + 1));
  };

  const prevStep = () => {
    setError('');
    setCurrentStep((s) => Math.max(1, s - 1));
  };

  const handleSubmit = async () => {
    if (!validateStep(1) || !validateStep(2)) return;

    setSubmitting(true);
    setError('');
    try {
      const res = await client.post('/profiles', {
        currentCountry,
        yearsExperience,
        desiredRole,
        targetCountry,
        targetCity: !targetCity || targetCity === OTHER_CITY_VALUE ? undefined : targetCity,
        competencies: toPayloadCompetencies(),
      });
      navigate(`/dashboard/${res.data.id}`);
    } catch {
      setError('Failed to create profile');
    } finally {
      setSubmitting(false);
    }
  };

  const visaLikelyRequired = !!targetCountry && !!currentCountry && targetCountry !== currentCountry;

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
    <div style={{ maxWidth: '760px', margin: '2rem auto' }}>
      <h2>Create Relocation Profile</h2>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {[1, 2, 3].map((step) => (
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
          <h3>Page 1: Goal</h3>
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>Desired Country *</label>
          <select
            value={targetCountry}
            onChange={(e) => {
              setTargetCountry(e.target.value);
              setTargetCity('');
            }}
            style={selectStyle}
          >
            <option value="">-- Select country --</option>
            {countriesCatalog.target.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>

          <label style={{ display: 'block', marginBottom: '0.25rem' }}>City (optional)</label>
          <select
            value={targetCity}
            onChange={(e) => setTargetCity(e.target.value)}
            style={selectStyle}
            disabled={!targetCountry}
          >
            <option value="">-- Select city (optional) --</option>
            {(suggestedCitiesByCountry[targetCountry] || []).map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
            <option value={OTHER_CITY_VALUE}>Other / Not listed (use country average)</option>
          </select>

          <label style={{ display: 'block', marginBottom: '0.25rem' }}>Years of Experience (min 0)</label>
          <input
            type="number"
            value={yearsExperience}
            onChange={(e) => setYearsExperience(Math.max(0, Number(e.target.value) || 0))}
            min={0}
            max={40}
            style={inputStyle}
          />

          <label style={{ display: 'block', marginBottom: '0.25rem' }}>Desired Role *</label>
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
          <h3>Page 2: Source</h3>
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>Current Country *</label>
          <select
            value={currentCountry}
            onChange={(e) => setCurrentCountry(e.target.value)}
            style={selectStyle}
          >
            <option value="">-- Select country --</option>
            {countriesCatalog.source.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>

          <label style={{ display: 'block', marginBottom: '0.25rem' }}>
            Budget (inactive, planned)
          </label>
          <input
            type="text"
            value={budget}
            disabled
            placeholder="Will be activated in next iteration"
            style={{ ...inputStyle, background: '#f5f5f5', color: '#888' }}
          />

          <label style={{ display: 'block', marginBottom: '0.25rem' }}>
            Visa {visaLikelyRequired ? '(likely required)' : '(inactive, planned)'}
          </label>
          <input
            type="text"
            value={visa}
            disabled
            placeholder={
              visaLikelyRequired
                ? 'Visa field planned (route differs by source -> goal)'
                : 'Will be activated in next iteration'
            }
            style={{ ...inputStyle, background: '#f5f5f5', color: '#888' }}
          />
        </div>
      )}

      {currentStep === 3 && (
        <div>
          <h3>Page 3: Skills / Competencies</h3>
          <p style={{ marginTop: 0, color: '#666' }}>
            List is filtered by role and country relevance priority, not full taxonomy.
          </p>
          <div
            style={{
              padding: '0.75rem',
              border: '1px solid #eee',
              borderRadius: '6px',
              background: '#fafafa',
              marginBottom: '1rem',
            }}
          >
            <strong>Skill Levels</strong>
            <div style={{ marginTop: '0.5rem', fontSize: '0.92rem', color: '#333' }}>
              {HARD_LEVELS.map((lvl) => (
                <div key={lvl} style={{ marginBottom: '0.25rem' }}>
                  {HARD_LEVEL_LABELS[lvl]}
                </div>
              ))}
            </div>
          </div>

          <input
            placeholder="Search relevant competencies..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={inputStyle}
          />
          <div
            style={{
              maxHeight: '420px',
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
                <input type="checkbox" checked={isSelected(c.id)} onChange={() => toggle(c)} />
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
                  {formatEnumLabel(c.type)}
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
                    style={{ ...selectStyle, width: '240px', marginBottom: 0 }}
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
            {filtered.length === 0 && (
              <p style={{ color: '#999', margin: '0.75rem 0' }}>
                No competencies found for current role/country filter.
              </p>
            )}
          </div>
          <p style={{ marginTop: '0.5rem', color: '#666' }}>{selected.length} competency(s) selected</p>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem' }}>
        {currentStep > 1 ? (
          <button onClick={prevStep} style={{ ...btnStyle, background: '#888' }}>
            Back
          </button>
        ) : (
          <div />
        )}
        {currentStep < 3 ? (
          <button onClick={nextStep} style={btnStyle}>
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
