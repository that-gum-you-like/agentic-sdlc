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

const MATURATION_LEVEL_NAMES = ['New', 'Corrected', 'Remembering', 'Teaching', 'Autonomous', 'Evolving'];

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const config = loadConfig();
const ROOT = config.projectDir;
const TASKS_DIR = config.tasksDir;
const DASHBOARD_PATH = config.dashboardPath;
const REVIEWS_DIR = resolve(config.agentsDir, 'richmond/reviews');
const AGENTS_DIR = config.agentsDir;
const AGENTS = config.agents;

/**
 * Build the "Agent Maturation" section for the PM Dashboard.
 *
 * For each agent shows:
 *   - Current level name (e.g. "Remembering")
 *   - Weeks at current level
 *   - Trend: improving / stable / regressing (based on last 2 weeks of metrics)
 */
function generateMaturationSection() {
  const rows = [];
  for (const agent of AGENTS) {
    const corePath = resolve(AGENTS_DIR, agent, 'memory/core.json');
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

function loadTasks() {
  const tasks = [];
  if (!existsSync(TASKS_DIR)) return tasks;
  const files = readdirSync(TASKS_DIR).filter(f => f.endsWith('.json')).sort();
  for (const file of files) {
    tasks.push(JSON.parse(readFileSync(resolve(TASKS_DIR, file), 'utf8')));
  }
  return tasks;
}

function loadHumanTasks() {
  const humanQueueDir = config.humanQueueDir;
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
  if (!existsSync(REVIEWS_DIR)) return [];
  const files = readdirSync(REVIEWS_DIR).filter(f => f.endsWith('.md'));
  return files.map(f => ({
    file: f,
    content: readFileSync(resolve(REVIEWS_DIR, f), 'utf8'),
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

function updateDashboard(summary, actionItemsSection) {
  if (!existsSync(DASHBOARD_PATH)) {
    console.error('Dashboard not found at', DASHBOARD_PATH);
    return;
  }

  let dashboard = readFileSync(DASHBOARD_PATH, 'utf8');

  // Update the "Recent Activity" section
  const activityHeader = '## Recent Activity';
  const activityIdx = dashboard.indexOf(activityHeader);
  if (activityIdx >= 0) {
    const date = new Date().toISOString().split('T')[0];
    const time = new Date().toTimeString().split(' ')[0].substring(0, 5);
    const newEntry = `| ${date} ${time} | System | Daily review completed |`;

    // Find the table and add entry
    const tableStart = dashboard.indexOf('|', activityIdx + activityHeader.length);
    const headerEnd = dashboard.indexOf('\n', dashboard.indexOf('\n', tableStart) + 1);
    const insertPoint = headerEnd + 1;
    dashboard = dashboard.slice(0, insertPoint) + newEntry + '\n' + dashboard.slice(insertPoint);
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

  // Update Last Updated date
  dashboard = dashboard.replace(
    /\*\*Last Updated:\*\* .*/,
    `**Last Updated:** ${new Date().toISOString().split('T')[0]}`
  );

  writeFileSync(DASHBOARD_PATH, dashboard);
}

/**
 * Append a cycle history entry to pm/cycle-history.json
 */
function recordCycleHistory(type, stats) {
  const pmDir = resolve(ROOT, 'pm');
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

// Main
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

// Record cycle history
recordCycleHistory('daily-review', { completed: completedCount, inProgress: inProgressCount, blocked: blockedCount, total: tasks.length });

// Notify human with daily summary
triggerNotification('dailySummary', `📊 Daily Summary: ${completedCount} completed, ${inProgressCount} in progress, ${blockedCount} blocked`);
