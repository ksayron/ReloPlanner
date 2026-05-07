import { useState, useEffect } from 'react';
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
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

  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<SkillCategory>('HARD_SKILL');
  const [newParentId, setNewParentId] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<SkillCategory>('HARD_SKILL');

  const [srcSkill, setSrcSkill] = useState('');
  const [tgtSkill, setTgtSkill] = useState('');
  const [coefficient, setCoefficient] = useState(0.5);

  const fetchSkills = () => {
    client
      .get('/admin/taxonomy')
      .then((res) => setSkills(res.data))
      .catch(() => setError('Failed to load skills'));
  };

  useEffect(() => {
    fetchSkills();
  }, []);

  const flash = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3000);
  };

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

  const skillsById = new Map(skills.map((skill) => [skill.id, skill]));

  return (
    <Stack className="mx-auto max-w-5xl" gap="lg">
      <Title order={2}>Skill Taxonomy Manager</Title>
      {error && <Alert color="red">{error}</Alert>}
      {success && <Alert color="teal">{success}</Alert>}

      <Paper withBorder radius="lg" p="lg" className="bg-white">
        <Stack>
          <Title order={3}>Add Skill</Title>
          <Group align="end" wrap="wrap">
            <TextInput label="Name" value={newName} onChange={(e) => setNewName(e.currentTarget.value)} />
            <Select
              label="Category"
              value={newCategory}
              onChange={(value) => value && setNewCategory(value as SkillCategory)}
              data={CATEGORIES.map((category) => ({ value: category, label: formatEnumLabel(category) }))}
            />
            <Select
              label="Parent (optional)"
              value={newParentId}
              onChange={(value) => setNewParentId(value || '')}
              data={[{ value: '', label: 'None' }].concat(
                skills.map((skill) => ({ value: skill.id, label: skill.name })),
              )}
            />
            <Button onClick={addSkill} color="brand.7">Add</Button>
          </Group>
        </Stack>
      </Paper>

      <Paper withBorder radius="lg" p="lg" className="bg-white">
        <Stack>
          <Title order={3}>Skills ({skills.length})</Title>
          <Accordion variant="contained" radius="md">
            {skills.map((skill) => (
              <Accordion.Item key={skill.id} value={skill.id}>
                <Accordion.Control>
                  <Group justify="space-between">
                    <Text fw={600}>{skill.name}</Text>
                    <Badge variant="light" color="brand.1">{formatEnumLabel(skill.category)}</Badge>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="xs">
                    <Text size="sm"><strong>ID:</strong> {skill.id}</Text>
                    <Text size="sm"><strong>Category:</strong> {formatEnumLabel(skill.category)}</Text>
                    <Text size="sm"><strong>Parent:</strong> {skill.parentId ? (skillsById.get(skill.parentId)?.name ?? skill.parentId) : 'None'}</Text>
                    <Text size="sm">
                      <strong>Children:</strong>{' '}
                      {skill.children && skill.children.length > 0
                        ? skill.children.map((child) => child.name).join(', ')
                        : 'None'}
                    </Text>
                    <Text size="sm">
                      <strong>Aliases:</strong>{' '}
                      {skill.aliases && skill.aliases.length > 0
                        ? skill.aliases.map((alias) => alias.alias).join(', ')
                        : 'None'}
                    </Text>

                    {editingId === skill.id ? (
                      <Group align="end" wrap="wrap" mt="xs">
                        <TextInput value={editName} onChange={(e) => setEditName(e.currentTarget.value)} label="Name" />
                        <Select
                          value={editCategory}
                          onChange={(value) => value && setEditCategory(value as SkillCategory)}
                          label="Category"
                          data={CATEGORIES.map((category) => ({ value: category, label: formatEnumLabel(category) }))}
                        />
                        <Button color="brand.7" onClick={() => saveEdit(skill.id)}>Save</Button>
                        <Button variant="light" color="gray" onClick={() => setEditingId(null)}>Cancel</Button>
                      </Group>
                    ) : (
                      <Button mt="xs" color="brand.1" variant="light" onClick={() => startEdit(skill)}>Edit</Button>
                    )}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        </Stack>
      </Paper>

      <Paper withBorder radius="lg" p="lg" className="bg-white">
        <Stack>
          <Title order={3}>Skill Transferability</Title>
          <Group align="end" wrap="wrap">
            <Select
              label="Source Skill"
              value={srcSkill}
              onChange={(value) => setSrcSkill(value || '')}
              data={skills.map((skill) => ({ value: skill.id, label: skill.name }))}
            />
            <Select
              label="Target Skill"
              value={tgtSkill}
              onChange={(value) => setTgtSkill(value || '')}
              data={skills.map((skill) => ({ value: skill.id, label: skill.name }))}
            />
            <NumberInput
              label="Coefficient (0-1)"
              min={0}
              max={1}
              step={0.05}
              value={coefficient}
              onChange={(value) => setCoefficient(Number(value) || 0)}
              w={180}
            />
            <Button color="brand.7" onClick={addTransferability}>Add</Button>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
}
