#!/usr/bin/env node
// Test: MISSION_PLAYBOOK.md contains the wireframe gate and guardrails
// Run: node tests/mission-playbook.test.mjs
// Exit 0 on success, 1 on failure

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const playbookPath = join(__dirname, '..', 'docs', 'MISSION_PLAYBOOK.md');

const content = readFileSync(playbookPath, 'utf8');

const checks = [
  {
    name: 'Design section exists',
    test: () => content.includes('## 4. Design (stop for approval before seeding tasks)'),
  },
  {
    name: 'Component-library search step present',
    test: () => content.includes('node ~/component-library/bin/search.mjs <keywords>'),
  },
  {
    name: 'Wireframe step present',
    test: () => content.includes('Produce a wireframe'),
  },
  {
    name: 'Wait for approval step present',
    test: () => content.includes('Stop and wait for approval'),
  },
  {
    name: 'Guardrail: never create scheduler entries',
    test: () => content.includes('NEVER create `hermes cron` jobs'),
  },
  {
    name: 'Guardrail: always work inside ~/<project>',
    test: () => content.includes('ALWAYS work inside `~/<project>`'),
  },
  {
    name: 'Guardrail: never use sudo or docker',
    test: () => content.includes('NEVER use `sudo` or `docker`'),
  },
  {
    name: 'Guardrail: never commit .env.local',
    test: () => content.includes('.env.local` is git-ignored and must NEVER be'),
  },
  {
    name: 'Guardrail: never push to main directly or run deploy commands',
    test: () => content.includes('NEVER push to `main` directly, run `vercel`'),
  },
];

let passed = 0;
let failed = 0;

console.log('Testing MISSION_PLAYBOOK.md...\n');

for (const check of checks) {
  const result = check.test();
  if (result) {
    console.log(`✓ ${check.name}`);
    passed++;
  } else {
    console.log(`✗ ${check.name}`);
    failed++;
  }
}

console.log(`\n${passed}/${checks.length} checks passed`);

if (failed > 0) {
  console.log(`\n${failed} check(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll checks passed.');
  process.exit(0);
}
