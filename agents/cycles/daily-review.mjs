#!/usr/bin/env node
/**
 * Daily Review — End of session summary
 *
 * Reads all completed tasks from the last 24h, generates a summary,
 * and updates pm/DASHBOARD.md.
 *
 * Usage:
 *   node agents/cycles/daily-review.mjs
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { loadConfig } from '../load-config.mjs';
import { triggerNotification } from '../notify.mjs';
import { hasPlaywrightConfig } from '../browser-user-test.mjs';
import { runStep } from './monthly-review.mjs';

const MATURATION_LEVEL_NAMES = ['New', 'Corrected', 'Remembering', 'Teaching', 'Autonomous', 'Evolving'];

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Config is resolved lazily so importing this module — for its pure helpers —
// never reads project.json, never depends on the importer's cwd, and never
// runs CLI side effects. The entry point at the bottom calls getConfig().
let _config = null;
function getConfig() {
  if (!_config) _config = loadConfig();
  return _config;
}

/**
 * Build the "Agent Maturation" section for the PM Dashboard.
 *
 * For each agent shows:
 *   - Current level name (e.g. "Remembering")
 *   - Weeks at current level
 *   - Trend: improving / stable / regressing (based on last 2 weeks of metrics)
 */
function generateMaturationSection() {
  const { agentsDir, agents } = getConfig();
  const rows = [];
  for (const agent of agents) {
    const corePath = resolve(agentsDir, agent, 'memory/core.json');
    if (!existsSync(corePath)) continue;

    let core;
    try {
      core = JSON.parse(readFileSync(corePath, 'utf8'));
    } catch {
      continue;
    }

    const mat = core.maturation || {};
    const level = mat.level ?? 0;
    const levelName = MATURATION_LEVEL_NAMES[level] || 'Unknown';

    // Weeks at current level
    let weeksAtLevel = '?';
    if (mat.weekStarted) {
      const msPerWeek = 7 * 24 * 60 * 60 * 1000;
      const started = new Date(mat.weekStarted);
      weeksAtLevel = Math.max(0, Math.floor((Date.now() - started.getTime()) / msPerWeek));
    }

    // Trend from last 2 weeks of metrics
    let trend = 'stable';
    const metrics = mat.metrics || {};
    const weeks = Object.keys(metrics).sort();
    if (weeks.length >= 2) {
      const last2 = weeks.slice(-2);
      const prev = metrics[last2[0]].correctionsReceived || 0;
      const curr = metrics[last2[1]].correctionsReceived || 0;
      if (curr < prev) trend = 'improving';
      else if (curr > prev) trend = 'regressing';
    }

    rows.push(`| ${agent} | ${levelName} (L${level}) | ${weeksAtLevel} | ${trend} |`);
  }

  if (rows.length === 0) return '';

  return `
### Agent Maturation
| Agent | Level | Weeks at Level | Trend |
|-------|-------|----------------|-------|
${rows.join('\n')}
`;
}

/**
 * Build the body of the dashboard's `## OpenSpec status` section (CV-119).
 *
 * Pure with respect to the running daily review: it reads only the tree under
 * the `changesDir` it is given — no config, no dashboard write, no globals — so
 * callers and tests can point it at any OpenSpec directory.
 *
 * A change missing `status.json` or `tasks.md` renders `-` in the affected
 * columns and never throws: "could not measure" must not look like "zero".
 *
 * @param {string} changesDir path to `openspec/changes`
 * @returns {string} markdown counts line + one table row per active change
 */
/**
 * Replace the `## <title>` section of a markdown file, or append it (CV-REQ-020).
 * Line-based, no regex: the section runs from the exact heading line to the line before
 * the next `#`/`##` heading (or EOF), so titles and bodies need no escaping and a body
 * line containing `## ` mid-text cannot end the section. Returns true when replaced.
 * (Written interactively after drain PR #88's regex version was rejected 3x.)
 */
export function upsertDashboardSection(title, body, path) {
  const content = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const lines = content.split('\n');
  const heading = `## ${title}`;
  const section = [heading, '', ...String(body).replace(/\n+$/, '').split('\n'), ''];
  const start = lines.findIndex(l => l.trimEnd() === heading);
  if (start === -1) {
    const trimmed = content.replace(/\n+$/, '');
    writeFileSync(path, (trimmed ? `${trimmed}\n\n` : '') + section.join('\n'));
    return false;
  }
  let end = start + 1;
  while (end < lines.length && !/^#{1,2} /.test(lines[end])) end++;
  writeFileSync(path, [...lines.slice(0, start), ...section, ...lines.slice(end)].join('\n'));
  return true;
}

export function openspecStatusTable(changesDir) {
  const active = [];
  if (existsSync(changesDir)) {
    for (const entry of readdirSync(changesDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'archive') continue;
      active.push(entry.name);
    }
  }
  active.sort();

  let archived = 0;
  const archiveDir = resolve(changesDir, 'archive');
  if (existsSync(archiveDir)) {
    archived = readdirSync(archiveDir, { withFileTypes: true }).filter(e => e.isDirectory()).length;
  }

  const rows = active.map(name => {
    const changeDir = resolve(changesDir, name);

    let phase = '-';
    let status = '-';
    let readiness = '-';
    const statusPath = resolve(changeDir, 'status.json');
    if (existsSync(statusPath)) {
      try {
        const s = JSON.parse(readFileSync(statusPath, 'utf8'));
        phase = s.phase ? String(s.phase) : '-';
        status = s.status ? String(s.status) : '-';
        readiness = s.readiness ? String(s.readiness) : '-';
      } catch { /* malformed status.json — render '-' rather than throw */ }
    }

    let tasks = '-';
    const tasksPath = resolve(changeDir, 'tasks.md');
    if (existsSync(tasksPath)) {
      const md = readFileSync(tasksPath, 'utf8');
      const total = (md.match(/^\s*-\s+\[[ xX]\]/gm) || []).length;
      const done = (md.match(/^\s*-\s+\[[xX]\]/gm) || []).length;
      tasks = `${done}/${total}`;
    }

    return `| ${name} | ${phase} | ${status} | ${readiness} | ${tasks} |`;
  });

  return [
    `Active changes: ${active.length} | Archived: ${archived}`,
    '',
    '| Change | Phase | Status | Readiness | Tasks |',
    '|--------|-------|--------|-----------|-------|',
    ...rows,
  ].join('\n');
}

/**
 * Name pattern that marks an OpenSpec change as a bug record.
 * `bug-*` covers drain/scaffolded defects; `prod-error-*` covers production
 * incident records — both are tracked the same way for the dashboard.
 * Archived changes are date-prefixed (`2026-01-01-bug-…`), so an optional
 * leading `YYYY-MM-DD-` is accepted.
 */
const BUG_CHANGE_PATTERN = /^(?:\d{4}-\d{2}-\d{2}-)?(?:bug-|prod-error-)/i;

function isBugChange(name) {
  return BUG_CHANGE_PATTERN.test(String(name));
}

/**
 * Build the body of the dashboard's `## Bug metrics` section (CV-120 / CV-REQ-020).
 *
 * Pure with respect to the running daily review: it reads only the two trees it
 * is given — no config, no dashboard write, no globals — so callers and tests
 * can point it at any OpenSpec/queue pair.
 *
 * A bug counts as *resolved* once its change is archived; the resolution rate is
 * `archived / (active + archived)`. When there is no denominator the rate renders
 * `none` instead of a number, so "no bugs recorded" cannot look like "0% resolved"
 * and never renders `NaN`.
 *
 * FIX-* queue tasks are split into completed and pending: anything not
 * `completed` (pending, in-progress, blocked) is counted as pending, because a
 * blocked repair is still outstanding work, not a finished one.
 *
 * @param {string} changesDir path to `openspec/changes`
 * @param {string} queueDir path to `tasks/queue`
 * @returns {string} markdown counts line + metric table
 */
export function bugMetrics(changesDir, queueDir) {
  const active = [];
  const archived = [];

  if (existsSync(changesDir)) {
    for (const entry of readdirSync(changesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name !== 'archive' && isBugChange(entry.name)) active.push(entry.name);
    }
    const archiveDir = resolve(changesDir, 'archive');
    if (existsSync(archiveDir)) {
      for (const entry of readdirSync(archiveDir, { withFileTypes: true })) {
        if (entry.isDirectory() && isBugChange(entry.name)) archived.push(entry.name);
      }
    }
  }

  const total = active.length + archived.length;
  const resolutionRate = total === 0 ? 'none' : `${Math.round((archived.length / total) * 100)}%`;

  let pendingFix = 0;
  let completedFix = 0;
  if (existsSync(queueDir)) {
    for (const entry of readdirSync(queueDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json') || !entry.name.startsWith('FIX-')) continue;
      let task;
      try {
        task = JSON.parse(readFileSync(resolve(queueDir, entry.name), 'utf8'));
      } catch {
        continue; // unreadable task file — skip rather than break the whole report
      }
      const id = typeof task?.id === 'string' ? task.id : entry.name.replace(/\.json$/, '');
      if (!id.startsWith('FIX-')) continue;
      if (task.status === 'completed') completedFix += 1;
      else pendingFix += 1;
    }
  }

  return [
    `Active: ${active.length} | Archived: ${archived.length} | Resolution rate: ${resolutionRate}`,
    '',
    '| Metric | Count |',
    '|--------|-------|',
    `| Pending FIX tasks | ${pendingFix} |`,
    `| Completed FIX tasks | ${completedFix} |`,
  ].join('\n');
}

/**
 * Run browser user tests and record the result in the dashboard.
 *
 * When the project has a Playwright config, runs browser-user-test.mjs run
 * via the provided runner and records PASS/FAIL with the screenshot archive
 * path. Otherwise logs `skipped (no-playwright-config)`. Failure is non-fatal.
 *
 * @param {object} config - project config from loadConfig()
 * @param {{runner?: Function}} opts
 *   runner - (label, script, args) => {{label, ok}} for dependency injection
 * @returns {{status: string, detail?: string}}
 */
export function runUserTests(config, { runner = runStep } = {}) {
  const appPath = config.appPath || config.projectDir;

  if (!hasPlaywrightConfig(appPath)) {
    const reason = 'no-playwright-config';
    console.log(`User tests: skipped (${reason})`);

    upsertDashboardSection('User tests',
      'Status | Detail\n-------|-------\nskipped | no-playwright-config',
      config.dashboardPath);

    return { status: 'skipped', detail: reason };
  }

  // Run browser-user-test.mjs run via the injected or default runner
  const result = runner('User tests', 'browser-user-test.mjs', ['run']);
  const status = result.ok ? 'PASS' : 'FAIL';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const shotsDir = `pm/user-tests/${stamp}`;

  upsertDashboardSection('User tests',
    `Status | Detail\n-------|-------\n${status} | ${shotsDir}`,
    config.dashboardPath);

  return {
    status: result.ok ? 'pass' : 'fail',
    detail: shotsDir,
  };
}

function loadTasks() {
  const tasksDir = getConfig().tasksDir;
  const tasks = [];
  if (!existsSync(tasksDir)) return tasks;
  const files = readdirSync(tasksDir).filter(f => f.endsWith('.json')).sort();
  for (const file of files) {
    tasks.push(JSON.parse(readFileSync(resolve(tasksDir, file), 'utf8')));
  }
  return tasks;
}

function loadHumanTasks() {
  const humanQueueDir = getConfig().humanQueueDir;
  if (!existsSync(humanQueueDir)) return [];
  const files = readdirSync(humanQueueDir).filter(f => f.endsWith('.json')).sort();
  const tasks = [];
  for (const file of files) {
    try {
      tasks.push(JSON.parse(readFileSync(join(humanQueueDir, file), 'utf8')));
    } catch { /* skip malformed */ }
  }
  return tasks;
}

const URGENCY_ORDER = { blocker: 0, normal: 1, low: 2 };

function generateActionItemsSection(humanTasks) {
  const pending = humanTasks
    .filter(t => t.status !== 'completed')
    .sort((a, b) => (URGENCY_ORDER[a.urgency] ?? 1) - (URGENCY_ORDER[b.urgency] ?? 1));

  if (pending.length === 0) return '';

  const URGENCY_ICON = { blocker: '🚨', normal: '⚠️', low: '💤' };
  const now = Date.now();
  const lines = pending.map(ht => {
    const ageDays = Math.floor((now - new Date(ht.createdAt).getTime()) / (24 * 60 * 60 * 1000));
    const ageStr = ageDays === 0 ? 'today' : `${ageDays}d ago`;
    const icon = URGENCY_ICON[ht.urgency] || '⚠️';
    const unblocks = ht.unblocks?.length > 0 ? ` — unblocks: ${ht.unblocks.join(', ')}` : '';
    return `- ${icon} **[${ht.id}]** (${ht.urgency}) ${ht.title} [${ageStr}]${unblocks}`;
  });

  return `## YOUR Action Items\n\n${lines.join('\n')}\n\n`;
}

function getRecentReviews() {
  const reviewsDir = resolve(getConfig().agentsDir, 'richmond/reviews');
  if (!existsSync(reviewsDir)) return [];
  const files = readdirSync(reviewsDir).filter(f => f.endsWith('.md'));
  return files.map(f => ({
    file: f,
    content: readFileSync(resolve(reviewsDir, f), 'utf8'),
  }));
}

function generateSummary(tasks) {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);

  const completed = tasks.filter(t =>
    t.status === 'completed' &&
    t.completed_at &&
    new Date(t.completed_at) > twentyFourHoursAgo
  );
  const inProgress = tasks.filter(t => t.status === 'in_progress');
  const pending = tasks.filter(t => t.status === 'pending');
  const blocked = pending.filter(t =>
    t.blockedBy?.some(depId => {
      const dep = tasks.find(d => d.id === depId);
      return dep && dep.status !== 'completed';
    })
  );

  const reviews = getRecentReviews();
  const approved = reviews.filter(r => r.content.includes('APPROVED')).length;
  const changesRequested = reviews.filter(r => r.content.includes('CHANGES REQUESTED')).length;

  const matSection = generateMaturationSection();

  const summary = `
## Daily Summary — ${now.toISOString().split('T')[0]}

### Completed (last 24h): ${completed.length}
${completed.map(t => `- [${t.id}] ${t.title}`).join('\n') || '_None_'}

### In Progress: ${inProgress.length}
${inProgress.map(t => `- [${t.id}] ${t.title} (${t.assignee || 'unassigned'})`).join('\n') || '_None_'}

### Pending: ${pending.length} (${blocked.length} blocked)

### Code Reviews
- Approved: ${approved}
- Changes Requested: ${changesRequested}

### Queue Health
- Total tasks: ${tasks.length}
- Completion rate: ${tasks.length > 0 ? Math.round((tasks.filter(t => t.status === 'completed').length / tasks.length) * 100) : 0}%
${matSection}`;

  return summary;
}

// Activity headings the daily review records into (REQ-004). The framework
// template ships `## Recent Activity`, but a live dashboard may carry
// `## Recent Changes (OpenSpec)` instead — target whichever actually exists.
const ACTIVITY_HEADERS = ['## Recent Activity', '## Recent Changes (OpenSpec)'];

function updateDashboard(summary, actionItemsSection) {
  const dashboardPath = getConfig().dashboardPath;
  if (!existsSync(dashboardPath)) {
    console.error('Dashboard not found at', dashboardPath);
    return;
  }

  let dashboard = readFileSync(dashboardPath, 'utf8');
  const warnings = [];

  const date = new Date().toISOString().split('T')[0];
  const time = new Date().toTimeString().split(' ')[0].substring(0, 5);

  // Record the activity row under a heading that actually exists (REQ-004).
  const activityHeader = ACTIVITY_HEADERS.find(h => dashboard.includes(h));
  if (activityHeader) {
    const newEntry = `| ${date} ${time} | System | Daily review completed |`;
    const activityIdx = dashboard.indexOf(activityHeader);

    // Prefer inserting after the table's separator row when a table follows
    // the heading; otherwise insert directly after the heading line.
    let insertPoint = -1;
    const tableStart = dashboard.indexOf('|', activityIdx + activityHeader.length);
    if (tableStart >= 0) {
      const firstRowEnd = dashboard.indexOf('\n', tableStart);
      const separatorEnd = firstRowEnd >= 0 ? dashboard.indexOf('\n', firstRowEnd + 1) : -1;
      if (separatorEnd >= 0) insertPoint = separatorEnd + 1;
    }
    if (insertPoint < 0) {
      const headingLineEnd = dashboard.indexOf('\n', activityIdx);
      insertPoint = headingLineEnd >= 0 ? headingLineEnd + 1 : dashboard.length;
    }
    dashboard = dashboard.slice(0, insertPoint) + newEntry + '\n' + dashboard.slice(insertPoint);
  } else {
    warnings.push(
      `pm/DASHBOARD.md has no activity heading (looked for: ${ACTIVITY_HEADERS.join(', ')}) — activity row not recorded`
    );
  }

  // Inject or replace action items section at the top of the dashboard content
  if (actionItemsSection) {
    const marker = '## YOUR Action Items';
    const markerIdx = dashboard.indexOf(marker);
    if (markerIdx >= 0) {
      // Find the end of the existing action items section (next ## heading)
      const nextSection = dashboard.indexOf('\n## ', markerIdx + marker.length);
      if (nextSection >= 0) {
        dashboard = dashboard.slice(0, markerIdx) + actionItemsSection + dashboard.slice(nextSection + 1);
      }
    } else {
      // Insert at top, after the first heading line
      const firstNewline = dashboard.indexOf('\n');
      dashboard = dashboard.slice(0, firstNewline + 1) + '\n' + actionItemsSection + dashboard.slice(firstNewline + 1);
    }
  }

  // Update Last Updated date — match case-insensitively and preserve the
  // file's own label casing (REQ-004: the live dashboard uses `**Last updated:**`).
  const lastUpdatedMatch = dashboard.match(/(\*\*Last [Uu]pdated:\*\*).*/);
  if (lastUpdatedMatch) {
    dashboard = dashboard.replace(
      /(\*\*Last [Uu]pdated:\*\*).*/,
      `$1 ${date}`
    );
  } else {
    warnings.push('pm/DASHBOARD.md has no **Last Updated:** line — date not updated');
  }

  writeFileSync(dashboardPath, dashboard);

  // Missing expected content must surface on stderr, never silently no-op
  // (REQ-004 acceptance).
  for (const warning of warnings) {
    console.error(`⚠ ${warning}`);
  }
}

/**
 * Append a cycle history entry to pm/cycle-history.json
 */
function recordCycleHistory(type, stats) {
  const pmDir = resolve(getConfig().projectDir, 'pm');
  if (!existsSync(pmDir)) mkdirSync(pmDir, { recursive: true });
  const historyPath = resolve(pmDir, 'cycle-history.json');

  let history = [];
  if (existsSync(historyPath)) {
    try { history = JSON.parse(readFileSync(historyPath, 'utf8')); } catch { history = []; }
  }

  history.push({
    type,
    timestamp: new Date().toISOString(),
    success: true,
    stats,
  });

  writeFileSync(historyPath, JSON.stringify(history, null, 2));
}

async function main() {
  const tasks = loadTasks();
  const summary = generateSummary(tasks);

  console.log(summary);

  // Generate action items from pending human tasks
  const humanTasks = loadHumanTasks();
  const actionItemsSection = generateActionItemsSection(humanTasks);
  if (actionItemsSection) console.log(actionItemsSection);

  updateDashboard(summary, actionItemsSection);
  console.log('Dashboard updated.');

  // Bottleneck detection (15.1-15.2)
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const inProgressCount = tasks.filter(t => t.status === 'in_progress').length;
  const blockedTasks = tasks.filter(t => t.status === 'pending' && t.blockedBy?.length > 0);
  const blockedCount = blockedTasks.length;

  // Check if human tasks are the bottleneck
  const pendingHumanTasks = humanTasks.filter(ht => ht.status === 'pending');
  const staleHumanTasks = pendingHumanTasks.filter(ht => {
    if (!ht.createdAt) return false;
    const ageMs = Date.now() - new Date(ht.createdAt).getTime();
    return ageMs > 24 * 60 * 60 * 1000; // > 24 hours
  });

  if (staleHumanTasks.length > 0) {
    const totalBlocked = blockedTasks.length + pendingHumanTasks.reduce((sum, ht) => sum + (ht.unblocks?.length || 0), 0);
    const humanBlockedCount = pendingHumanTasks.reduce((sum, ht) => sum + (ht.unblocks?.length || 0), 0);
    const isBottleneck = totalBlocked > 0 && humanBlockedCount / totalBlocked > 0.5;

    if (isBottleneck) {
      console.log(`\n⚠ BOTTLENECK: ${staleHumanTasks.length} human task(s) pending > 24h. Agent work is blocked on human action.`);
      triggerNotification('blocker', `⚠ Bottleneck alert: ${staleHumanTasks.length} human tasks pending > 24h. Agent work is blocked on human action.`);
    }
  }

  // Agent Capability Health (5.1)
  try {
    const { checkCapabilityHealth } = await import('../capability-monitor.mjs');
    const health = await checkCapabilityHealth();
    if (health && health.alerts && health.alerts.length > 0) {
      for (const alert of health.alerts) {
        if (alert.type === 'drift') {
          console.log(`\nAgent Capability Health: DRIFT ALERT — ${alert.agent}: ${alert.capability} skipped ${alert.consecutiveSkips}x consecutive`);
        } else if (alert.type === 'scopeCreep') {
          console.log(`\nAgent Capability Health: SCOPE CREEP — ${alert.agent}: unexpected capability ${alert.capability} was used`);
        }
      }
    } else {
      console.log('\nAgent Capability Health: All agents nominal. No drift alerts.');
    }
  } catch {
    // capability-monitor not yet installed — skip silently
  }

  // OpenSpec Hygiene Check — flag stale changes and unarchived shipped changes
  try {
    const openspecDir = resolve(getConfig().projectDir, 'openspec/changes');
    if (existsSync(openspecDir)) {
      const changeDirs = readdirSync(openspecDir, { withFileTypes: true }).filter(d => d.isDirectory() && d.name !== 'archive');
      const now = Date.now();
      for (const dir of changeDirs) {
        const statusPath = resolve(openspecDir, dir.name, 'status.json');
        if (!existsSync(statusPath)) continue;
        try {
          const status = JSON.parse(readFileSync(statusPath, 'utf8'));
          const updatedAt = status.updatedAt ? new Date(status.updatedAt).getTime() : 0;
          const ageDays = Math.round((now - updatedAt) / (1000 * 60 * 60 * 24));

          if ((status.phase === 'proposal' || status.phase === 'design') && ageDays > 14) {
            console.log(`\n⚠ STALE: openspec "${dir.name}" has been in ${status.phase} for ${ageDays} days`);
          }
          if (status.phase === 'shipped' && ageDays > 7) {
            console.log(`\n📦 ARCHIVE: openspec "${dir.name}" shipped ${ageDays} days ago, needs archiving`);
          }
        } catch { /* malformed status.json — skip */ }
      }
    }
  } catch { /* openspec dir not found — skip */ }

  // Model Manager Health Summary (if performance ledger exists)
  try {
    const ledgerPath = getConfig().performanceLedgerPath;
    if (existsSync(ledgerPath)) {
      const lines = readFileSync(ledgerPath, 'utf8').split('\n').filter(l => l.trim());
      const recentSwaps = lines
        .map(l => { try { return JSON.parse(l); } catch { return null; } })
        .filter(e => e && e.event === 'model-swap')
        .filter(e => Date.now() - new Date(e.ts).getTime() < 24 * 60 * 60 * 1000);

      if (recentSwaps.length > 0) {
        console.log(`\n🔄 Model Manager: ${recentSwaps.length} model swap(s) in last 24h`);
        for (const s of recentSwaps) {
          console.log(`   ${s.agent}: ${s.fromModel} → ${s.toModel} (${s.reason})`);
        }
      }
    }
  } catch { /* model-manager not configured — skip */ }

  // Record cycle history
  recordCycleHistory('daily-review', { completed: completedCount, inProgress: inProgressCount, blocked: blockedCount, total: tasks.length });

  // Notify human with daily summary
  triggerNotification('dailySummary', `📊 Daily Summary: ${completedCount} completed, ${inProgressCount} in progress, ${blockedCount} blocked`);
}

// --- CLI ---
const __isMainModule = process.argv[1] && resolve(process.argv[1]) === __filename;

if (__isMainModule) {
  await main();
}
