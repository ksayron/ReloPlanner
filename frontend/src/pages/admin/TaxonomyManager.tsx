import { useState, useEffect } from 'react';
import client from '../../api/client';
import type { Skill, SkillCategory } from '../../types';

const CATEGORIES: SkillCategory[] = ['HARD_SKILL', 'LANGUAGE', 'CERTIFICATION', 'SOFT_SKILL'];
const formatEnumLabel = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export default function TaxonomyManager() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Add skill form
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<SkillCategory>('HARD_SKILL');
  const [newParentId, setNewParentId] = useState('');

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<SkillCategory>('HARD_SKILL');

  // Transferability
  const [srcSkill, setSrcSkill] = useState('');
  const [tgtSkill, setTgtSkill] = useState('');
  const [coefficient, setCoefficient] = useState(0.5);

  const fetchSkills = () => {
    client.get('/admin/taxonomy').then(res => setSkills(res.data)).catch(() => setError('Failed to load skills'));
  };

  useEffect(() => { fetchSkills(); }, []);

  const flash = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };

  const addSkill = async () => {
    if (!newName.trim()) return;
    setError('');
    try {
      await client.post('/admin/taxonomy/skills', {
        name: newName,
        category: newCategory,
        parentId: newParentId || undefined,
      });
      setNewName('');
      setNewParentId('');
      fetchSkills();
      flash('Skill added');
    } catch {
      setError('Failed to add skill');
    }
  };

  const startEdit = (skill: Skill) => {
    setEditingId(skill.id);
    setEditName(skill.name);
    setEditCategory(skill.category);
  };

  const saveEdit = async (id: string) => {
    setError('');
    try {
      await client.put(`/admin/taxonomy/skills/${id}`, { name: editName, category: editCategory });
      setEditingId(null);
      fetchSkills();
      flash('Skill updated');
    } catch {
      setError('Failed to update skill');
    }
  };

  const addTransferability = async () => {
    if (!srcSkill || !tgtSkill) return;
    setError('');
    try {
      await client.post('/admin/taxonomy/transferability', {
        sourceSkillId: srcSkill,
        targetSkillId: tgtSkill,
        coefficient,
      });
      flash('Transferability rule added');
    } catch {
      setError('Failed to add transferability');
    }
  };

  const inputStyle = { padding: '0.4rem', borderRadius: '4px', border: '1px solid #ccc' } as const;
  const btnStyle = { padding: '0.4rem 1rem', background: '#e94560', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' } as const;
  const skillsById = new Map(skills.map((skill) => [skill.id, skill]));

  return (
    <div style={{ maxWidth: '900px', margin: '2rem auto' }}>
      <h2>Skill Taxonomy Manager</h2>
      {error && <p style={{ color: '#f44336' }}>{error}</p>}
      {success && <p style={{ color: '#4caf50' }}>{success}</p>}

      {/* Add Skill */}
      <div style={{ background: '#f9f9f9', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
        <h3 style={{ marginTop: 0 }}>Add Skill</h3>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem' }}>Name</label>
            <input value={newName} onChange={e => setNewName(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem' }}>Category</label>
            <select value={newCategory} onChange={e => setNewCategory(e.target.value as SkillCategory)} style={inputStyle}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem' }}>Parent (optional)</label>
            <select value={newParentId} onChange={e => setNewParentId(e.target.value)} style={inputStyle}>
              <option value="">None</option>
              {skills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <button onClick={addSkill} style={btnStyle}>Add</button>
        </div>
      </div>

      {/* Skill List */}
      <div style={{ marginBottom: '2rem' }}>
        <h3>Skills ({skills.length})</h3>
        {skills.map(skill => (
          <details
            key={skill.id}
            style={{
              border: '1px solid #eee',
              borderRadius: '8px',
              padding: '0.5rem 0.75rem',
              marginBottom: '0.5rem',
              background: '#fff',
            }}
          >
            <summary
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                listStyle: 'none',
              }}
            >
              <span style={{ flex: 1, fontWeight: 500 }}>{skill.name}</span>
              <span style={{ fontSize: '0.75rem', color: '#999', background: '#f0f0f0', padding: '2px 6px', borderRadius: '4px' }}>
                {formatEnumLabel(skill.category)}
              </span>
            </summary>

            <div style={{ marginTop: '0.75rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', rowGap: '0.35rem', columnGap: '0.6rem', marginBottom: '0.75rem', fontSize: '0.92rem' }}>
                <strong>ID</strong>
                <span>{skill.id}</span>
                <strong>Category</strong>
                <span>{formatEnumLabel(skill.category)}</span>
                <strong>Parent</strong>
                <span>{skill.parentId ? (skillsById.get(skill.parentId)?.name ?? skill.parentId) : 'None'}</span>
                <strong>Children</strong>
                <span>
                  {skill.children && skill.children.length > 0
                    ? skill.children.map((child) => child.name).join(', ')
                    : 'None'}
                </span>
                <strong>Aliases</strong>
                <span>
                  {skill.aliases && skill.aliases.length > 0
                    ? skill.aliases.map((alias) => alias.alias).join(', ')
                    : 'None'}
                </span>
              </div>

              {editingId === skill.id ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <input value={editName} onChange={e => setEditName(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: '240px' }} />
                  <select value={editCategory} onChange={e => setEditCategory(e.target.value as SkillCategory)} style={inputStyle}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{formatEnumLabel(c)}</option>)}
                  </select>
                  <button onClick={() => saveEdit(skill.id)} style={btnStyle}>Save</button>
                  <button onClick={() => setEditingId(null)} style={{ ...btnStyle, background: '#888' }}>Cancel</button>
                </div>
              ) : (
                <button onClick={() => startEdit(skill)} style={{ ...btnStyle, background: '#555', padding: '0.3rem 0.7rem', fontSize: '0.85rem' }}>Edit</button>
              )}
            </div>
          </details>
        ))}
      </div>

      {/* Transferability */}
      <div style={{ background: '#f9f9f9', padding: '1rem', borderRadius: '8px' }}>
        <h3 style={{ marginTop: 0 }}>Skill Transferability</h3>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem' }}>Source Skill</label>
            <select value={srcSkill} onChange={e => setSrcSkill(e.target.value)} style={inputStyle}>
              <option value="">Select...</option>
              {skills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem' }}>Target Skill</label>
            <select value={tgtSkill} onChange={e => setTgtSkill(e.target.value)} style={inputStyle}>
              <option value="">Select...</option>
              {skills.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem' }}>Coefficient (0-1)</label>
            <input type="number" min={0} max={1} step={0.05} value={coefficient} onChange={e => setCoefficient(Number(e.target.value))} style={{ ...inputStyle, width: '80px' }} />
          </div>
          <button onClick={addTransferability} style={btnStyle}>Add</button>
        </div>
      </div>
    </div>
  );
}
