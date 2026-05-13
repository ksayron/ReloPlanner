import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** Extra API-variant → canonical skill name mappings beyond what's in the DB aliases table */
const EXTRA_NORMALIZATIONS: Record<string, string> = {
  // JavaScript
  javascript: 'JavaScript',
  js: 'JavaScript',
  ecmascript: 'JavaScript',
  es6: 'JavaScript',
  'vanilla js': 'JavaScript',

  // TypeScript
  typescript: 'TypeScript',
  ts: 'TypeScript',

  // Python
  python: 'Python',
  python3: 'Python',
  'python 3': 'Python',

  // Java
  java: 'Java',
  'java 8': 'Java',
  'java 11': 'Java',
  'java 17': 'Java',
  'java 21': 'Java',
  jvm: 'Java',

  // C#
  'c#': 'C#',
  csharp: 'C#',
  'c sharp': 'C#',
  '.net': 'C#',
  dotnet: 'C#',
  'asp.net': 'C#',

  // Go
  go: 'Go',
  golang: 'Go',

  // React
  react: 'React',
  reactjs: 'React',
  'react.js': 'React',
  'react js': 'React',
  'react native': 'React',

  // Angular
  angular: 'Angular',
  angularjs: 'Angular',
  'angular.js': 'Angular',

  // Vue
  vue: 'Vue',
  vuejs: 'Vue',
  'vue.js': 'Vue',
  'vue js': 'Vue',
  'vue 3': 'Vue',

  // Node.js
  'node.js': 'Node.js',
  nodejs: 'Node.js',
  node: 'Node.js',
  'node js': 'Node.js',

  // Express
  express: 'Express',
  expressjs: 'Express',
  'express.js': 'Express',
  'express js': 'Express',

  // NestJS
  nestjs: 'NestJS',
  nest: 'NestJS',
  'nest.js': 'NestJS',

  // Django
  django: 'Django',

  // Spring Boot
  'spring boot': 'Spring Boot',
  spring: 'Spring Boot',
  springboot: 'Spring Boot',
  'spring framework': 'Spring Boot',
  'spring mvc': 'Spring Boot',

  // PostgreSQL
  postgresql: 'PostgreSQL',
  postgres: 'PostgreSQL',
  psql: 'PostgreSQL',

  // MySQL
  mysql: 'MySQL',
  mariadb: 'MySQL',

  // MongoDB
  mongodb: 'MongoDB',
  mongo: 'MongoDB',
  mongoose: 'MongoDB',

  // Redis
  redis: 'Redis',
  'redis cache': 'Redis',

  // Docker
  docker: 'Docker',
  dockerfile: 'Docker',
  'docker compose': 'Docker',
  'docker-compose': 'Docker',

  // Kubernetes
  kubernetes: 'Kubernetes',
  k8s: 'Kubernetes',
  helm: 'Kubernetes',

  // AWS
  aws: 'AWS',
  'amazon web services': 'AWS',
  'amazon aws': 'AWS',
  'aws cloud': 'AWS',

  // Azure
  azure: 'Azure',
  'microsoft azure': 'Azure',
  'azure cloud': 'Azure',

  // Git
  git: 'Git',
  github: 'Git',
  gitlab: 'Git',
  bitbucket: 'Git',
  'version control': 'Git',

  // CI/CD
  'ci/cd': 'CI/CD',
  'ci cd': 'CI/CD',
  cicd: 'CI/CD',
  jenkins: 'CI/CD',
  'github actions': 'CI/CD',
  'gitlab ci': 'CI/CD',
  'gitlab-ci': 'CI/CD',
  'circle ci': 'CI/CD',
  circleci: 'CI/CD',
  devops: 'CI/CD',

  // REST API
  rest: 'REST API',
  'rest api': 'REST API',
  restful: 'REST API',
  'restful api': 'REST API',
  'rest apis': 'REST API',

  // GraphQL
  graphql: 'GraphQL',

  // Linux
  linux: 'Linux',
  unix: 'Linux',
  bash: 'Linux',
  shell: 'Linux',
  ubuntu: 'Linux',

  // Languages
  english: 'English',
  'english language': 'English',
  german: 'German',
  deutsch: 'German',
  'german language': 'German',
  french: 'French',
  'french language': 'French',
  polish: 'Polish',
  'polish language': 'Polish',
  spanish: 'Spanish',
  'spanish language': 'Spanish',

  // Certifications
  'aws certified': 'AWS Certified',
  'aws certification': 'AWS Certified',
  'azure certified': 'Azure Certified',
  'azure certification': 'Azure Certified',
  ielts: 'IELTS',
  goethe: 'Goethe-Zertifikat',
  'goethe zertifikat': 'Goethe-Zertifikat',
  'goethe certificate': 'Goethe-Zertifikat',
};

@Injectable()
export class SkillNormalizerService implements OnModuleInit {
  private readonly logger = new Logger(SkillNormalizerService.name);

  /** lowercase canonical name → skillId */
  private nameToId = new Map<string, string>();
  /** lowercase alias/variant → skillId */
  private variantToId = new Map<string, string>();
  /** skillId → SkillCategory */
  private skillCategories = new Map<string, string>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.load();
  }

  async load() {
    const skills = await this.prisma.skill.findMany({
      include: { aliases: true },
    });

    this.nameToId.clear();
    this.variantToId.clear();
    this.skillCategories.clear();

    for (const skill of skills) {
      const lower = skill.name.toLowerCase();
      this.nameToId.set(lower, skill.id);
      this.skillCategories.set(skill.id, skill.category);

      for (const alias of skill.aliases) {
        this.variantToId.set(alias.alias.toLowerCase(), skill.id);
      }
    }

    // Apply extra normalizations (only if canonical exists in taxonomy)
    for (const [variant, canonical] of Object.entries(EXTRA_NORMALIZATIONS)) {
      const skillId = this.nameToId.get(canonical.toLowerCase());
      if (skillId && !this.variantToId.has(variant.toLowerCase())) {
        this.variantToId.set(variant.toLowerCase(), skillId);
      }
    }

    this.logger.log(
      `SkillNormalizer loaded: ${this.nameToId.size} skills, ${this.variantToId.size} variants`,
    );
  }

  /** Returns skillId for the given API name, or null if unknown. */
  resolve(apiName: string): string | null {
    const normalized = apiName.toLowerCase().trim();
    return (
      this.nameToId.get(normalized) ?? this.variantToId.get(normalized) ?? null
    );
  }

  /** Returns the SkillCategory string for a given skillId. */
  getCategory(skillId: string): string {
    return this.skillCategories.get(skillId) ?? 'HARD_SKILL';
  }
}
