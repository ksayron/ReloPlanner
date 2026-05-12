import fs from 'node:fs';
import path from 'node:path';

const workspacePackages = [
  ['apps/api', '@reloplanner/api'],
  ['apps/client', '@reloplanner/client'],
  ['apps/internal', '@reloplanner/internal'],
  ['packages/shared-contracts', '@reloplanner/shared-contracts'],
  ['packages/shared-frontend', '@reloplanner/shared-frontend'],
];

const allowedWorkspaceDeps = {
  '@reloplanner/api': ['@reloplanner/shared-contracts'],
  '@reloplanner/client': [
    '@reloplanner/shared-contracts',
    '@reloplanner/shared-frontend',
  ],
  '@reloplanner/internal': [
    '@reloplanner/shared-contracts',
    '@reloplanner/shared-frontend',
  ],
  '@reloplanner/shared-frontend': ['@reloplanner/shared-contracts'],
  '@reloplanner/shared-contracts': [],
};

const forbiddenSharedContractsImports = [
  '@nestjs/',
  'react',
  'react-dom',
  'react-router-dom',
  'vue',
  'axios',
  '@prisma/',
  'prisma',
  'typeorm',
  'mongoose',
  'pg',
];

const failures = [];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function gatherWorkspaceDeps(pkgJson) {
  const sections = [
    pkgJson.dependencies ?? {},
    pkgJson.devDependencies ?? {},
    pkgJson.peerDependencies ?? {},
    pkgJson.optionalDependencies ?? {},
  ];
  return Object.keys(Object.assign({}, ...sections)).filter((name) =>
    name.startsWith('@reloplanner/'),
  );
}

for (const [pkgPath, pkgName] of workspacePackages) {
  const packageJsonPath = path.join(pkgPath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    failures.push(`Missing package.json for ${pkgName} at ${pkgPath}`);
    continue;
  }

  const pkgJson = readJson(packageJsonPath);
  const actualWorkspaceDeps = gatherWorkspaceDeps(pkgJson);
  const allowed = new Set(allowedWorkspaceDeps[pkgName] ?? []);

  for (const dep of actualWorkspaceDeps) {
    if (!allowed.has(dep)) {
      failures.push(
        `${pkgName} has forbidden workspace dependency "${dep}". Allowed: ${[
          ...allowed,
        ].join(', ') || '(none)'}`,
      );
    }
  }
}

function walkDir(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(full));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))
    ) {
      files.push(full);
    }
  }
  return files;
}

const sharedContractsSrc = path.join('packages', 'shared-contracts', 'src');
if (fs.existsSync(sharedContractsSrc)) {
  const files = walkDir(sharedContractsSrc);
  const importRegex =
    /(?:import|export)\s+(?:type\s+)?(?:[\w*\s{},]+?\s+from\s+)?['"]([^'"]+)['"]/g;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    let match = importRegex.exec(content);
    while (match) {
      const source = match[1];
      if (
        forbiddenSharedContractsImports.some(
          (prefix) => source === prefix || source.startsWith(prefix),
        )
      ) {
        failures.push(
          `shared-contracts forbidden import "${source}" in ${file.replaceAll(
            '\\',
            '/',
          )}`,
        );
      }
      match = importRegex.exec(content);
    }
  }
}

if (failures.length > 0) {
  console.error('Boundary check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Boundary check passed.');
