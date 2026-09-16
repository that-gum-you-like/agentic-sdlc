/**
 * sentinel/secrets — credential scanning across working trees AND git history.
 *
 * openspec: supply-chain-security-program (SCS-REQ-004)
 *
 * History matters more than the working tree. A credential deleted in a later
 * commit is still in the pack file, still fetchable by anyone who clones, and
 * still valid until it is rotated — deleting the file is not revoking the key.
 *
 * THE INVARIANT: no secret VALUE ever reaches a report, a log, or a
 * notification. A security report that quotes the secret becomes the leak, and
 * these reports are written to disk and summarised over Telegram. Enforced
 * twice on purpose — gitleaks is run with --redact=100, and every record is
 * then stripped again here, because one layer is a policy and two is a control.
 */

import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/** Fields gitleaks emits that can carry the secret itself. Never kept. */
const VALUE_BEARING_FIELDS = ['Secret', 'Match', 'Line', 'Description', 'Message'];

/**
 * Strip every value-bearing field from a gitleaks record.
 *
 * Belt and braces over --redact: if a future gitleaks adds a field, or the
 * flag is ever dropped from the invocation, this still holds the line.
 */
export function redactFinding(raw) {
  const safe = {};
  for (const [k, v] of Object.entries(raw || {})) {
    if (VALUE_BEARING_FIELDS.includes(k)) continue;
    safe[k] = v;
  }
  return safe;
}

/** Location + rule, stable across re-scans; what the baseline keys on. */
export function fingerprintOf(rec) {
  return rec.Fingerprint || `${rec.Commit || 'worktree'}:${rec.File}:${rec.RuleID}:${rec.StartLine}`;
}

/**
 * Run one gitleaks scan and return redacted records.
 *
 * @param {'git'|'dir'} mode  'git' walks history, 'dir' walks the working tree
 */
export function runGitleaks(mode, repoPath, { gitleaksPath, execFn, readFn, tmpFn, rmFn, existsFn } = {}) {
  const exec = execFn || ((file, args) => execFileSync(file, args, {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 128 * 1024 * 1024, timeout: 600_000,
  }));
  const read = readFn || ((p) => readFileSync(p, 'utf8'));
  const makeTmp = tmpFn || (() => mkdtempSync(join(tmpdir(), 'sentinel-gl-')));
  const exists = existsFn || ((p) => existsSync(p));
  const cleanup = rmFn || ((p) => rmSync(p, { recursive: true, force: true }));

  const dir = makeTmp();
  const reportPath = join(dir, 'report.json');

  try {
    const args = [
      mode,
      '--redact=100',            // values never leave gitleaks in the first place
      '--report-format', 'json',
      '--report-path', reportPath,
      '--no-banner',
      '-l', 'error',
      repoPath,
    ];
    try {
      exec(gitleaksPath, args);
    } catch (err) {
      // Exit 1 means "leaks found", which is a successful scan. Anything else
      // is a real failure and must not be mistaken for a clean result.
      const code = err && typeof err.status === 'number' ? err.status : null;
      if (code !== 1) {
        return { ok: false, error: err.message || `gitleaks ${mode} failed`, records: [] };
      }
    }

    if (!exists(reportPath)) return { ok: true, records: [] };
    const text = read(reportPath);
    if (!text || !text.trim()) return { ok: true, records: [] };

    let parsed;
    try { parsed = JSON.parse(text); } catch (err) {
      return { ok: false, error: `unparseable gitleaks report: ${err.message}`, records: [] };
    }
    return { ok: true, records: (Array.isArray(parsed) ? parsed : []).map(redactFinding) };
  } finally {
    try { cleanup(dir); } catch { /* temp dir cleanup is best-effort */ }
  }
}

/**
 * Turn redacted gitleaks records into findings, suppressing the baseline.
 *
 * Known credential-bearing repos are baselined so they report DRIFT rather than
 * re-reporting their whole contents every run — the alternative is a permanent
 * wall of HIGHs that trains the reader to skip the section.
 */
export function auditSecrets(records, baseline, { repo = 'unknown', location = 'history' } = {}) {
  const findings = [];
  const known = new Set((baseline && baseline.fingerprints) || []);
  const seen = [];

  for (const rec of records) {
    const fp = fingerprintOf(rec);
    seen.push(fp);
    if (known.has(fp)) continue;

    findings.push({
      scanner: 'secrets',
      severity: 'high',
      repo,
      subject: rec.File || '(unknown file)',
      summary: `${rec.RuleID || 'credential'} found in ${location}: ${rec.File}`,
      detail: [
        `Rule: ${rec.RuleID}`,
        `Location: ${rec.File}${rec.StartLine ? `:${rec.StartLine}` : ''}`,
        rec.Commit ? `Commit: ${rec.Commit}${rec.Date ? ` (${rec.Date})` : ''}` : null,
        rec.Author ? `Author: ${rec.Author}` : null,
        location === 'history'
          ? 'Present in git history. Deleting the file does NOT revoke the credential — rotate it.'
          : 'Present in the working tree.',
      ].filter(Boolean).join('\n'),
      // Location only. Never the value.
      evidence: [`${rec.File}${rec.StartLine ? `:${rec.StartLine}` : ''}`, rec.RuleID, rec.Commit].filter(Boolean),
      remedy: location === 'history'
        ? 'Rotate the credential first, then decide whether rewriting history is worth it. Rotation is the part that matters.'
        : 'Remove from the working tree and rotate the credential.',
      source: 'tool',
      fingerprint: fp,
    });
  }

  return { findings, fingerprints: seen };
}

/**
 * Scan one repo: working tree and full history.
 *
 * A tool failure becomes a finding. "gitleaks did not run" and "there are no
 * secrets" must never produce the same report.
 */
export function scanRepoSecrets({ repo, path, gitleaksPath, baseline, execFn, readFn, tmpFn, rmFn, existsFn }) {
  const findings = [];
  const fingerprints = [];
  const opts = { gitleaksPath, execFn, readFn, tmpFn, rmFn, existsFn };

  for (const [mode, location] of [['dir', 'working tree'], ['git', 'history']]) {
    const res = runGitleaks(mode, path, opts);
    if (!res.ok) {
      findings.push({
        scanner: 'secrets', severity: 'medium', repo, subject: `gitleaks:${mode}`,
        summary: `secret scan failed for ${repo} (${location})`,
        detail: `${res.error}\nThis repo was NOT checked for credentials in its ${location} on this run.`,
        evidence: [path, res.error],
        remedy: 'Re-run scripts/security-toolchain-install.sh --check, then re-run the scan.',
        source: 'tool',
      });
      continue;
    }
    const audited = auditSecrets(res.records, baseline, { repo, location });
    findings.push(...audited.findings);
    fingerprints.push(...audited.fingerprints);
  }

  return { findings, fingerprints };
}
