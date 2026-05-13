import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service.js';
import { SOURCE_COUNTRIES } from '../countries/countries.data.js';
import {
  ResumeDraftField,
  ResumeLevelHint,
  ResumeMappedCompetency,
  ResumeProfileDraft,
  ResumeSkillCandidate,
  ResumeSkillUnmatched,
} from './resume.types.js';

interface CompetencyCatalogItem {
  id: string;
  name: string;
  type:
    | 'HARD_SKILL'
    | 'LANGUAGE'
    | 'CERTIFICATION'
    | 'DOMAIN_KNOWLEDGE'
    | 'SOFT_SKILL';
}

interface ResumeExtraction {
  desiredRole: ResumeDraftField<string>;
  yearsExperience: ResumeDraftField<number>;
  currentCountry: ResumeDraftField<string>;
  skills: ResumeSkillCandidate[];
}

const ROLE_OPTIONS = [
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
] as const;

@Injectable()
export class ResumeProfileDraftService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async parseToProfileDraft(text: string): Promise<ResumeProfileDraft> {
    const catalog = await this.loadCompetencyCatalog();
    const ai = await this.tryAiExtraction(text);
    const heuristic = this.extractHeuristic(text, catalog);

    const merged: ResumeExtraction = {
      desiredRole: ai?.desiredRole.value
        ? ai.desiredRole
        : heuristic.desiredRole,
      yearsExperience:
        ai?.yearsExperience.value !== null &&
        ai?.yearsExperience.value !== undefined
          ? ai.yearsExperience
          : heuristic.yearsExperience,
      currentCountry: ai?.currentCountry.value
        ? ai.currentCountry
        : heuristic.currentCountry,
      skills: this.mergeSkillCandidates(ai?.skills ?? [], heuristic.skills),
    };

    const { competencies, unmatchedSkills } = this.mapSkillsToQuestionnaire(
      merged.skills,
      catalog,
    );

    const confidenceVector = [
      merged.desiredRole.confidence,
      merged.yearsExperience.confidence,
      merged.currentCountry.confidence,
      ...competencies.slice(0, 8).map((item) => item.confidence),
    ].filter((value) => Number.isFinite(value) && value >= 0);

    const overallConfidence =
      confidenceVector.length > 0
        ? this.clamp(
            confidenceVector.reduce((acc, value) => acc + value, 0) /
              confidenceVector.length,
          )
        : 0;

    return {
      desiredRole: merged.desiredRole,
      yearsExperience: merged.yearsExperience,
      currentCountry: merged.currentCountry,
      competencies,
      unmatchedSkills,
      overallConfidence,
    };
  }

  private async loadCompetencyCatalog(): Promise<CompetencyCatalogItem[]> {
    const rows = await this.prisma.competency.findMany({
      select: { id: true, name: true, type: true },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
    }));
  }

  private async tryAiExtraction(
    text: string,
  ): Promise<ResumeExtraction | null> {
    const prompt = this.buildExtractionPrompt(text);
    const timeoutMs = Number(
      this.configService.get<string>('AI_PROVIDER_TIMEOUT_MS') ?? 20000,
    );
    const timeout = Number.isFinite(timeoutMs) ? timeoutMs : 20000;

    const openRouterKey = this.configService.get<string>('OPENROUTER_API_KEY');
    if (openRouterKey) {
      const model =
        this.configService.get<string>('RESUME_OPENROUTER_MODEL') ??
        this.configService.get<string>('OPENROUTER_MODEL') ??
        'openai/gpt-5.1-mini';
      const baseUrl =
        this.configService.get<string>('OPENROUTER_BASE_URL') ??
        'https://openrouter.ai/api/v1/chat/completions';
      try {
        const response = await axios.post(
          baseUrl,
          {
            model,
            temperature: 0.1,
            messages: [
              {
                role: 'system',
                content:
                  'You extract structured resume data for relocation profile prefill. Return JSON only.',
              },
              { role: 'user', content: prompt },
            ],
          },
          {
            timeout,
            headers: {
              Authorization: `Bearer ${openRouterKey}`,
              'Content-Type': 'application/json',
            },
          },
        );
        const raw = this.extractTextPayload(response.data);
        const parsed = this.parseJsonPayload(raw);
        if (parsed) return parsed;
      } catch {
        // continue fallback
      }
    }

    const openAiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (openAiKey) {
      const model =
        this.configService.get<string>('RESUME_OPENAI_MODEL') ??
        this.configService.get<string>('OPENAI_MODEL') ??
        'gpt-5.1-mini';
      try {
        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model,
            temperature: 0.1,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content:
                  'You extract structured resume data for relocation profile prefill. Return JSON only.',
              },
              { role: 'user', content: prompt },
            ],
          },
          {
            timeout,
            headers: {
              Authorization: `Bearer ${openAiKey}`,
              'Content-Type': 'application/json',
            },
          },
        );
        const raw = String(
          response.data?.choices?.[0]?.message?.content ?? '',
        ).trim();
        const parsed = this.parseJsonPayload(raw);
        if (parsed) return parsed;
      } catch {
        // continue fallback
      }
    }

    return null;
  }

  private buildExtractionPrompt(text: string): string {
    return [
      'Extract resume data for profile prefill.',
      'Return strict JSON with keys:',
      'desiredRole: { value: string|null, confidence: number 0..1 }',
      'yearsExperience: { value: number|null, confidence: number 0..1 }',
      'currentCountry: { value: ISO-2 code string or null, confidence: number 0..1 }',
      'skills: array of { name: string, confidence: number 0..1, levelHint: NONE|BASIC|PRACTICAL|CONFIDENT|ADVANCED }',
      'Use null when unknown.',
      `RESUME_TEXT:\n${text.slice(0, 12000)}`,
    ].join('\n');
  }

  private extractTextPayload(data: unknown): string {
    const choice = (data as { choices?: unknown[] } | null)?.choices?.[0] as
      | {
          text?: unknown;
          message?: { content?: unknown };
        }
      | undefined;
    if (!choice) return '';
    if (typeof choice.text === 'string') return choice.text.trim();
    const content = choice.message?.content;
    if (typeof content === 'string') return content.trim();
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object' && 'text' in part) {
            const text = (part as { text?: unknown }).text;
            return typeof text === 'string' ? text : '';
          }
          return '';
        })
        .join('\n')
        .trim();
    }
    return '';
  }

  private parseJsonPayload(raw: string): ResumeExtraction | null {
    if (!raw) return null;
    const parsed = this.safeJsonParse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const desiredRole = this.readStringField(parsed, 'desiredRole');
    const yearsExperience = this.readNumberField(parsed, 'yearsExperience');
    const currentCountry = this.readStringField(parsed, 'currentCountry');
    const skillsRaw = (parsed as { skills?: unknown }).skills;
    const skills = this.readSkills(skillsRaw);

    return {
      desiredRole: {
        value: desiredRole.value
          ? (this.mapRole(desiredRole.value) ?? desiredRole.value)
          : null,
        confidence: desiredRole.confidence,
      },
      yearsExperience: {
        value:
          yearsExperience.value !== null
            ? Math.max(0, Math.min(50, Math.round(yearsExperience.value)))
            : null,
        confidence: yearsExperience.confidence,
      },
      currentCountry: {
        value: currentCountry.value
          ? this.mapCountryToIso(currentCountry.value)
          : null,
        confidence: currentCountry.confidence,
      },
      skills,
    };
  }

  private safeJsonParse(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      const firstBrace = raw.indexOf('{');
      const lastBrace = raw.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        try {
          return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  private readStringField(
    input: object,
    key: string,
  ): ResumeDraftField<string> {
    const raw = (input as Record<string, unknown>)[key];
    if (typeof raw === 'string') {
      return { value: raw.trim() || null, confidence: 0.65 };
    }
    if (raw && typeof raw === 'object') {
      const candidate = raw as { value?: unknown; confidence?: unknown };
      const value =
        typeof candidate.value === 'string' ? candidate.value.trim() : '';
      const confidence =
        typeof candidate.confidence === 'number'
          ? this.clamp(candidate.confidence)
          : 0.65;
      return { value: value || null, confidence };
    }
    return { value: null, confidence: 0 };
  }

  private readNumberField(
    input: object,
    key: string,
  ): ResumeDraftField<number> {
    const raw = (input as Record<string, unknown>)[key];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return { value: raw, confidence: 0.65 };
    }
    if (raw && typeof raw === 'object') {
      const candidate = raw as { value?: unknown; confidence?: unknown };
      const numeric =
        typeof candidate.value === 'number'
          ? candidate.value
          : Number(String(candidate.value ?? ''));
      const value = Number.isFinite(numeric) ? numeric : null;
      const confidence =
        typeof candidate.confidence === 'number'
          ? this.clamp(candidate.confidence)
          : 0.65;
      return { value, confidence };
    }
    return { value: null, confidence: 0 };
  }

  private readSkills(raw: unknown): ResumeSkillCandidate[] {
    if (!Array.isArray(raw)) return [];
    const parsed: ResumeSkillCandidate[] = [];
    for (const item of raw) {
      if (typeof item === 'string') {
        const name = item.trim();
        if (!name) continue;
        parsed.push({ name, confidence: 0.6, levelHint: 'PRACTICAL' });
        continue;
      }
      if (!item || typeof item !== 'object') continue;
      const data = item as {
        name?: unknown;
        confidence?: unknown;
        levelHint?: unknown;
      };
      const name = String(data.name ?? '').trim();
      if (!name) continue;
      const confidence =
        typeof data.confidence === 'number' ? this.clamp(data.confidence) : 0.6;
      parsed.push({
        name,
        confidence,
        levelHint: this.normalizeLevelHint(data.levelHint),
      });
    }
    return parsed.slice(0, 50);
  }

  private normalizeLevelHint(raw: unknown): ResumeLevelHint {
    const candidate = String(raw ?? '')
      .trim()
      .toUpperCase();
    if (
      candidate === 'NONE' ||
      candidate === 'BASIC' ||
      candidate === 'PRACTICAL' ||
      candidate === 'CONFIDENT' ||
      candidate === 'ADVANCED'
    ) {
      return candidate;
    }
    return 'PRACTICAL';
  }

  private extractHeuristic(
    text: string,
    catalog: CompetencyCatalogItem[],
  ): ResumeExtraction {
    const role = this.extractRoleHeuristic(text);
    const years = this.extractYearsHeuristic(text);
    const country = this.extractCountryHeuristic(text);
    const skills = this.extractSkillsHeuristic(text, catalog);

    return {
      desiredRole: role,
      yearsExperience: years,
      currentCountry: country,
      skills,
    };
  }

  private extractRoleHeuristic(text: string): ResumeDraftField<string> {
    const normalized = text.toLowerCase();
    for (const role of ROLE_OPTIONS) {
      if (normalized.includes(role.toLowerCase())) {
        return { value: role, confidence: 0.9 };
      }
    }
    const keywordMap: Array<{
      pattern: RegExp;
      role: (typeof ROLE_OPTIONS)[number];
    }> = [
      { pattern: /\bbackend\b|\bnode\.?js\b/i, role: 'Backend Developer' },
      {
        pattern: /\bfrontend\b|\breact\b|\bangular\b/i,
        role: 'Frontend Developer',
      },
      { pattern: /\bfull[\s-]?stack\b/i, role: 'Full-Stack Developer' },
      {
        pattern: /\bdevops\b|\bkubernetes\b|\bterraform\b/i,
        role: 'DevOps Engineer',
      },
      { pattern: /\bdata scientist\b/i, role: 'Data Scientist' },
      { pattern: /\bdata engineer\b/i, role: 'Data Engineer' },
      { pattern: /\bqa\b|\btest automation\b/i, role: 'QA Engineer' },
      { pattern: /\bmobile\b|\bandroid\b|\bios\b/i, role: 'Mobile Developer' },
    ];
    for (const item of keywordMap) {
      if (item.pattern.test(text)) {
        return { value: item.role, confidence: 0.72 };
      }
    }
    return { value: null, confidence: 0 };
  }

  private extractYearsHeuristic(text: string): ResumeDraftField<number> {
    const regexes = [
      /(\d{1,2})\s*\+?\s*(?:years?|yrs?)\s*(?:of)?\s*experience/gi,
      /experience[:\s]+(\d{1,2})\s*(?:years?|yrs?)/gi,
    ];
    let best: number | null = null;
    for (const regex of regexes) {
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        const value = Number(match[1]);
        if (!Number.isFinite(value)) continue;
        best = best === null ? value : Math.max(best, value);
      }
    }
    return best !== null
      ? { value: Math.max(0, Math.min(50, best)), confidence: 0.78 }
      : { value: null, confidence: 0 };
  }

  private extractCountryHeuristic(text: string): ResumeDraftField<string> {
    const byCode = new Map(
      SOURCE_COUNTRIES.map((country) => [
        country.code.toUpperCase(),
        country.code,
      ]),
    );
    const byName = new Map(
      SOURCE_COUNTRIES.map((country) => [
        country.name.toLowerCase(),
        country.code,
      ]),
    );

    const codeMatch = text.match(/\b([A-Z]{2})\b/);
    if (codeMatch) {
      const code = byCode.get(codeMatch[1].toUpperCase());
      if (code) return { value: code, confidence: 0.7 };
    }

    const normalized = text.toLowerCase();
    for (const [name, code] of byName.entries()) {
      if (normalized.includes(name)) {
        return { value: code, confidence: 0.82 };
      }
    }

    return { value: null, confidence: 0 };
  }

  private extractSkillsHeuristic(
    text: string,
    catalog: CompetencyCatalogItem[],
  ): ResumeSkillCandidate[] {
    const normalizedText = this.normalize(text);
    const parsed: ResumeSkillCandidate[] = [];
    for (const competency of catalog) {
      const normalizedName = this.normalize(competency.name);
      if (!normalizedName || normalizedName.length < 3) continue;
      if (!normalizedText.includes(normalizedName)) continue;
      parsed.push({
        name: competency.name,
        confidence: 0.74,
        levelHint: 'PRACTICAL',
      });
    }
    return parsed.slice(0, 50);
  }

  private mergeSkillCandidates(
    primary: ResumeSkillCandidate[],
    secondary: ResumeSkillCandidate[],
  ): ResumeSkillCandidate[] {
    const merged = new Map<string, ResumeSkillCandidate>();
    for (const candidate of [...primary, ...secondary]) {
      const key = this.normalize(candidate.name);
      if (!key) continue;
      const existing = merged.get(key);
      if (!existing || candidate.confidence > existing.confidence) {
        merged.set(key, candidate);
      }
    }
    return [...merged.values()];
  }

  private mapSkillsToQuestionnaire(
    candidates: ResumeSkillCandidate[],
    catalog: CompetencyCatalogItem[],
  ): {
    competencies: ResumeMappedCompetency[];
    unmatchedSkills: ResumeSkillUnmatched[];
  } {
    const byNormalizedName = new Map<string, CompetencyCatalogItem[]>();
    for (const competency of catalog) {
      const key = this.normalize(competency.name);
      if (!key) continue;
      const list = byNormalizedName.get(key) ?? [];
      list.push(competency);
      byNormalizedName.set(key, list);
    }

    const mappedById = new Map<string, ResumeMappedCompetency>();
    const unmatchedSkills: ResumeSkillUnmatched[] = [];

    for (const candidate of candidates) {
      const candidateKey = this.normalize(candidate.name);
      if (!candidateKey) continue;

      const exact = byNormalizedName.get(candidateKey)?.[0];
      let resolved = exact;
      let confidenceFactor = 1;

      if (!resolved) {
        for (const competency of catalog) {
          const competencyKey = this.normalize(competency.name);
          if (
            competencyKey.includes(candidateKey) ||
            candidateKey.includes(competencyKey)
          ) {
            resolved = competency;
            confidenceFactor = 0.78;
            break;
          }
        }
      }

      if (!resolved) {
        unmatchedSkills.push({
          name: candidate.name,
          confidence: this.clamp(candidate.confidence * 0.7),
        });
        continue;
      }

      const mapped: ResumeMappedCompetency = {
        competencyId: resolved.id,
        competencyName: resolved.name,
        competencyType: resolved.type,
        confidence: this.clamp(candidate.confidence * confidenceFactor),
      };

      if (
        resolved.type === 'HARD_SKILL' ||
        resolved.type === 'DOMAIN_KNOWLEDGE' ||
        resolved.type === 'SOFT_SKILL'
      ) {
        mapped.hardSkillLevel = this.toHardSkillLevel(candidate.levelHint);
      } else if (resolved.type === 'LANGUAGE') {
        mapped.languageLevel = this.toLanguageLevel(candidate.levelHint);
      } else if (resolved.type === 'CERTIFICATION') {
        mapped.certificationStatus = this.toCertificationStatus(
          candidate.levelHint,
        );
      }

      const existing = mappedById.get(resolved.id);
      if (!existing || mapped.confidence > existing.confidence) {
        mappedById.set(resolved.id, mapped);
      }
    }

    const competencies = [...mappedById.values()].sort(
      (a, b) => b.confidence - a.confidence,
    );
    return { competencies, unmatchedSkills };
  }

  private mapRole(input: string): string | null {
    const normalized = input.trim().toLowerCase();
    if (!normalized) return null;
    for (const role of ROLE_OPTIONS) {
      if (normalized === role.toLowerCase()) return role;
    }
    const keywordRole = this.extractRoleHeuristic(input);
    return keywordRole.value;
  }

  private mapCountryToIso(input: string): string | null {
    const normalized = input.trim().toLowerCase();
    if (!normalized) return null;
    for (const country of SOURCE_COUNTRIES) {
      if (
        country.code.toLowerCase() === normalized ||
        country.name.toLowerCase() === normalized
      ) {
        return country.code;
      }
    }
    for (const country of SOURCE_COUNTRIES) {
      if (normalized.includes(country.name.toLowerCase())) {
        return country.code;
      }
    }
    return null;
  }

  private toHardSkillLevel(
    hint: ResumeLevelHint,
  ): 'NONE' | 'BASIC' | 'PRACTICAL' | 'CONFIDENT' | 'ADVANCED' {
    if (hint === 'NONE') return 'NONE';
    if (hint === 'ADVANCED') return 'ADVANCED';
    if (hint === 'CONFIDENT') return 'CONFIDENT';
    if (hint === 'BASIC') return 'BASIC';
    return 'PRACTICAL';
  }

  private toLanguageLevel(
    hint: ResumeLevelHint,
  ): 'NONE' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' {
    if (hint === 'NONE') return 'NONE';
    if (hint === 'BASIC') return 'A2';
    if (hint === 'PRACTICAL') return 'B1';
    if (hint === 'CONFIDENT') return 'B2';
    return 'C1';
  }

  private toCertificationStatus(
    hint: ResumeLevelHint,
  ): 'NONE' | 'PLANNED' | 'IN_PROGRESS' | 'OBTAINED' | 'EXPIRED' {
    if (hint === 'NONE') return 'NONE';
    if (hint === 'BASIC') return 'PLANNED';
    if (hint === 'PRACTICAL') return 'IN_PROGRESS';
    return 'OBTAINED';
  }

  private clamp(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
  }

  private normalize(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
  }
}
