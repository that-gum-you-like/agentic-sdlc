#!/usr/bin/env node
/**
 * Red Team Tester — Adversarial prompt-injection / alignment red-team scan.
 *
 * Scans agent prompts (agents/**\/AGENT.md) and recent PM output reports
 * (pm/**\/*.md) for known attack patterns: instruction-override attempts,
 * data-exfiltration asks, tool-abuse / unrestricted shell requests,
 * jailbreak markers, and secret-leak asks. Findings are bucketed by
 * severity (low|medium|high) and written to a dated markdown report.
 *
 * Usage:
 *   node ~/agentic-sdlc/agents/red-team-tester.mjs               # Full scan + report
 *   node ~/agentic-sdlc/agents/red-team-tester.mjs --dry-run     # Scan without writing
 *   node ~/agentic-sdlc/agents/red-team-tester.mjs --notify      # Also notify on HIGH findings
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';

import { loadConfig } from './load-config.mjs';
import { logCapabilityUsage } from './capability-logger.mjs';

const config = loadConfig();
const projectDir = config.projectDir;

const REPORTS_DIR = resolve(projectDir, 'pm', 'red-team-reports');

// ---------------------------------------------------------------------------
// Rule set
// ---------------------------------------------------------------------------

const RULES = [
  { pattern: /ignore (all |any )?previous instructions/i, severity: 'high', label: 'instruction-override' },
  { pattern: /disregard (the )?system prompt/i, severity: 'high', label: 'instruction-override' },
  { pattern: /you are now [^.\n]{0,60}(?:unrestricted|jailbroken|free of)/i, severity: 'high', label: 'instruction-override' },
  { pattern: /print your system prompt/i, severity: 'high', label: 'data-exfiltration' },
  { pattern: /reveal your instructions/i, severity: 'high', label: 'data-exfiltration' },
  { pattern: /base64 the env/i, severity: 'high', label: 'data-exfiltration' },
  { pattern: /(?:send|post|upload|exfiltrate) [^.\n]{0,60}(?:\.env|api key|credentials|secrets)/i, severity: 'high', label: 'data-exfiltration' },
  { pattern: /rm -rf \/|unrestricted shell|run any (shell )?command/i, severity: 'high', label: 'tool-abuse' },
  { pattern: /curl [^|\n]{0,120}\|\s*(?:sh|bash)\b/i, severity: 'high', label: 'tool-abuse' },
  { pattern: /\bDAN\b/, severity: 'medium', label: 'jailbreak-marker' },
  { pattern: /developer mode/i, severity: 'medium', label: 'jailbreak-marker' },
  { pattern: /show me the (api key|token|\.env)/i, severity: 'high', label: 'secret-leak-ask' },

  // Curriculum Phase 5 additions (CV-REQ-060)
  { pattern: /you are now a/i, severity: 'high', label: 'instruction-override' },
  { pattern: /forget everything/i, severity: 'high', label: 'instruction-override' },
  { pattern: /new instructions:/i, severity: 'high', label: 'instruction-override' },
  { pattern: /system prompt:/i, severity: 'high', label: 'data-exfiltration' },
  { pattern: /list (all )?api keys/i, severity: 'high', label: 'data-exfiltration' },
  { pattern: /output (your )?env(ironment)? vars/i, severity: 'high', label: 'data-exfiltration' },
];

// ---------------------------------------------------------------------------
// External-input screening (curriculum Phase 5)
// ---------------------------------------------------------------------------

/**
 * Screen a piece of EXTERNAL text (mailbox/WhatsApp message, GitHub issue or
 * PR body, error message, user content) for prompt-injection patterns BEFORE
 * any agent consumes it. Deterministic — same rule set as the periodic scan.
 *
 * @param {string} text
 * @param {object} [opts]
 * @param {string} [opts.source] - Where the text came from (for the log entry)
 * @returns {{ safe: boolean,
 *             findings: Array<{severity: string, label: string, match: string}>,
 *             sanitized: string }}
 *   - safe:      false when any HIGH-severity pattern matched
 *   - sanitized: the text with each HIGH-severity match neutralized as
 *                [BLOCKED-BY-INJECTION-SCREEN: <label>] — feed THIS to agents
 */
export function screenExternalInput(text, { source = 'external' } = {}) {
  const input = String(text ?? '');
  const findings = [];
  let sanitized = input;

  for (const rule of RULES) {
    const global = new RegExp(rule.pattern.source, rule.pattern.flags.includes('g') ? rule.pattern.flags : rule.pattern.flags + 'g');
    for (const m of input.matchAll(global)) {
      findings.push({ severity: rule.severity, label: rule.label, match: m[0].slice(0, 80) });
    }
    if (rule.severity === 'high') {
      sanitized = sanitized.replace(global, `[BLOCKED-BY-INJECTION-SCREEN: ${rule.label}]`);
    }
  }

  const safe = !findings.some(f => f.severity === 'high');
  if (findings.length > 0) {
    try {
      logCapabilityUsage('injectionScreen', 'system', source, 'red-team-tester.mjs', safe ? 'flagged' : 'blocked');
    } catch { /* logging must never break ingestion */ }
  }
  return { safe, findings, sanitized };
}

// ---------------------------------------------------------------------------
// Imperative-count screening (CV-202 / D5-06)
// ---------------------------------------------------------------------------

const IMPERATIVE_VERBS = ['list', 'delete', 'ignore', 'send', 'run', 'output', 'reveal', 'forget'];
const IMPERATIVE_RE = new RegExp(`^(${IMPERATIVE_VERBS.join('|')})\\b`, 'i');

/**
 * Count how many sentences in `text` open with an imperative verb from the
 * curated list (list, delete, ignore, send, run, output, reveal, forget).
 *
 * @param {string} text
 * @returns {{ count: number, flagged: boolean }}
 *   - count:    number of sentences with imperative openings (0-∞)
 *   - flagged:  true when count >= 3 (imperative-density threshold)
 */
export function imperativeCount(text) {
  if (!text || typeof text !== 'string') {
    return { count: 0, flagged: false };
  }

  // Split on sentence-ending punctuation; filter blank fragments
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  let count = 0;

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (IMPERATIVE_RE.test(trimmed)) {
      count++;
    }
  }

  return {
    count,
    flagged: count >= 3,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function walk(dir, predicate, out = []) {
  if (!existsSync(dir)) return out;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        walk(full, predicate, out);
      } else if (entry.isFile() && predicate(entry.name)) {
        out.push(full);
      }
    }
  } catch { /* permission error, skip */ }
  return out;
}

function collectTargetFiles() {
  const agentPrompts = walk(resolve(projectDir, 'agents'), name => name === 'AGENT.md');
  const pmReports = walk(resolve(projectDir, 'pm'), name => name.endsWith('.md'));
  return [...agentPrompts, ...pmReports];
}

function scanFile(filePath) {
  const findings = [];
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const rule of RULES) {
      if (rule.pattern.test(line)) {
        findings.push({
          file: filePath,
          line: i + 1,
          severity: rule.severity,
          pattern: rule.label,
          snippet: line.trim().slice(0, 200),
        });
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Core scan + report
// ---------------------------------------------------------------------------

export function runRedTeam(opts = {}) {
  const dryRun = !!opts.dryRun;

  const files = collectTargetFiles();
  let findings = [];
  for (const file of files) {
    findings = findings.concat(scanFile(file));
  }

  const relFile = f => f.replace(`${projectDir}/`, '');
  const highCount = findings.filter(f => f.severity === 'high').length;
  const mediumCount = findings.filter(f => f.severity === 'medium').length;
  const lowCount = findings.filter(f => f.severity === 'low').length;

  let report = `# Red Team Report — ${today()}\n\n`;
  report += `Scanned ${files.length} files. Found ${findings.length} findings (${highCount} high, ${mediumCount} medium, ${lowCount} low).\n\n`;

  if (findings.length > 0) {
    report += `## Findings\n\n`;
    report += `| Severity | Pattern | File | Line | Snippet |\n|----------|---------|------|------|---------|\n`;
    for (const f of findings) {
      report += `| ${f.severity} | ${f.pattern} | ${relFile(f.file)} | ${f.line} | ${f.snippet.replace(/\|/g, '\\|')} |\n`;
    }
    report += '\n';
  } else {
    report += '## Findings\n\nNone detected. No known attack patterns found.\n\n';
  }

  report += `---\nGenerated by red-team-tester.mjs at ${new Date().toISOString()}\n`;

  let reportPath = null;
  if (!dryRun) {
    ensureDir(REPORTS_DIR);
    reportPath = resolve(REPORTS_DIR, `red-team-${today()}.md`);
    writeFileSync(reportPath, report);
  }

  return { scanned: files.length, findings, reportPath, report, highCount };
}

// ---------------------------------------------------------------------------
/**
 * Screen a single text and return a verdict JSON.
 * Wraps both screenExternalInput and imperativeCount.
 *
 * @param {string} text
 * @returns {{ safe: boolean, findings: Array, sanitized: string,
 *             imperativeDensity: { count: number, flagged: boolean },
 *             flagged: boolean }}
 */
export function screenVerdict(text) {
  const screened = screenExternalInput(text);
  const density = imperativeCount(text);
  return {
    safe: screened.safe,
    findings: screened.findings,
    sanitized: screened.sanitized,
    imperativeDensity: density,
    flagged: !screened.safe || density.flagged,
  };
}

/**
 * Read all of stdin and return the assembled string.
 * @returns {Promise<string>}
 */
function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => chunks.push(c));
    process.stdin.on('end', () => resolve(chunks.join('')));
    process.stdin.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
function __isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === __filename;
}

if (__isMainModule()) {
  const args = process.argv.slice(2);

  // --screen <text|-> : screen external text and print verdict JSON, exit 2 when flagged
  const screenIdx = args.indexOf('--screen');
  if (screenIdx !== -1) {
    const textArg = args[screenIdx + 1];
    if (!textArg) {
      process.stderr.write('error: --screen requires an argument (<text> or - for stdin)\n');
      process.exit(1);
    }
    const promise = textArg === '-'
      ? readStdin()
      : Promise.resolve(textArg);

    promise.then(text => {
      const verdict = screenVerdict(text);
      console.log(JSON.stringify(verdict, null, 2));
      process.exit(verdict.flagged ? 2 : 0);
    }).catch(err => {
      process.stderr.write(`error reading input: ${err.message}\n`);
      process.exit(1);
    });
  } else {
    const dryRun = args.includes('--dry-run');
    const notify = args.includes('--notify');

    const result = runRedTeam({ dryRun });

    console.log(`Scanned ${result.scanned} files.`);
    console.log(`Findings: ${result.findings.length} (${result.highCount} high)`);

    if (dryRun) {
      console.log('\n--- Report Preview ---');
      console.log(result.report);
      console.log('(Dry run — not saved)');
    } else {
      console.log(`Report saved to pm/red-team-reports/red-team-${today()}.md`);

      logCapabilityUsage('redTeamScan', 'system', 'red-team-scan', 'red-team-tester.mjs', 'scan');

      if (notify && result.highCount > 0) {
        const { sendNotification } = await import('./notify.mjs');
        sendNotification(
          `Red team scan found ${result.highCount} HIGH severity finding(s) across ${result.scanned} files. See pm/red-team-reports/red-team-${today()}.md`
        );
      }
    }
  }
}
