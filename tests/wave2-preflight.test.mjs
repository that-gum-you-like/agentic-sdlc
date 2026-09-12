/**
 * T-303 — wave2-preflight.md exists and covers every drained repo.
 *
 * Spec: openspec/changes/business-os/specs/environment-tiering.md REQ-006
 *
 * The report must name every drained repo with its queue depth, open PR
 * count, and last-deployed sha versus origin/<base>.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT = resolve(import.meta.dirname, '..');
const REPORT = resolve(PROJECT, 'pm', 'wave2-preflight.md');

const DRAINED_REPOS = [
  { name: 'agentic-sdlc', base: 'main', section: 'agentic-sdlc' },
  { name: 'hermes-pilot', base: 'main', section: 'hermes-pilot' },
  { name: 'personal-website', base: 'main', section: 'personal-website' },
  { name: 'nels-workshop', base: 'main', section: 'nels-workshop' },
  { name: 'willtopaint', base: 'staging', section: 'willtopaint' },
];

/** Find the report section for a given repo slug. */
function sectionFor(content, slug) {
  const idx = content.search(new RegExp(`##\\s+\\d+\\.\\s*${slug}\\b`));
  if (idx === -1) return null;
  const nextIdx = content.indexOf('\n## ', idx + 3);
  return content.slice(idx, nextIdx === -1 ? undefined : nextIdx);
}

test('wave2-preflight.md exists', () => {
  assert.ok(existsSync(REPORT), `Report not found at ${REPORT}`);
});

test('report names every drained repo', () => {
  const content = readFileSync(REPORT, 'utf8');
  for (const repo of DRAINED_REPOS) {
    assert.ok(
      sectionFor(content, repo.section),
      `Report should mention repo "${repo.name}"`
    );
  }
});

test('report shows queue depth for each repo', () => {
  const content = readFileSync(REPORT, 'utf8');
  for (const repo of DRAINED_REPOS) {
    const section = sectionFor(content, repo.section);
    assert.ok(section, `Section for "${repo.name}" not found`);
    assert.ok(
      section.includes('Queue depth') || section.includes('Queue'),
      `"${repo.name}" section should contain queue depth`
    );
  }
});

test('report shows open PR count for each repo', () => {
  const content = readFileSync(REPORT, 'utf8');
  for (const repo of DRAINED_REPOS) {
    const section = sectionFor(content, repo.section);
    assert.ok(section, `Section for "${repo.name}" not found`);
    assert.ok(
      section.includes('Open PRs') || section.includes('Open PR'),
      `"${repo.name}" section should contain open PR count`
    );
  }
});

test('report shows last-deployed sha vs origin/<base> for each repo', () => {
  const content = readFileSync(REPORT, 'utf8');
  for (const repo of DRAINED_REPOS) {
    const section = sectionFor(content, repo.section);
    assert.ok(section, `Section for "${repo.name}" not found`);
    assert.ok(
      section.includes('Last deployed') || section.includes('Last Deployed'),
      `"${repo.name}" section should contain last deployed SHA info`
    );
    const baseLabel = repo.base === 'staging' ? 'Origin/staging' : 'Origin/main';
    assert.ok(
      section.includes(baseLabel) || section.includes(`origin/${repo.base}`),
      `"${repo.name}" section should mention origin/${repo.base}`
    );
  }
});
