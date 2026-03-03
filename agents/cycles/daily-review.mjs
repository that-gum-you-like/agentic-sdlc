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

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { loadConfig } from '../load-config.mjs';
import { triggerNotification } from '../notify.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const config = loadConfig();
const ROOT = config.projectDir;
const TASKS_DIR = config.tasksDir;
const DASHBOARD_PATH = config.dashboardPath;
const REVIEWS_DIR = resolve(config.agentsDir, 'richmond/reviews');

function loadTasks() {
  const tasks = [];
  if (!existsSync(TASKS_DIR)) return tasks;
  const files = readdirSync(TASKS_DIR).filter(f => f.endsWith('.json')).sort();
  for (const file of files) {
    tasks.push(JSON.parse(readFileSync(resolve(TASKS_DIR, file), 'utf8')));
  }
  return tasks;
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
`;

  return summary;
}

function updateDashboard(summary) {
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

  // Update Last Updated date
  dashboard = dashboard.replace(
    /\*\*Last Updated:\*\* .*/,
    `**Last Updated:** ${new Date().toISOString().split('T')[0]}`
  );

  writeFileSync(DASHBOARD_PATH, dashboard);
}

// Main
const tasks = loadTasks();
const summary = generateSummary(tasks);

console.log(summary);
updateDashboard(summary);
console.log('Dashboard updated.');

// Notify human with daily summary
const completedCount = tasks.filter(t => t.status === 'completed').length;
const blockedCount = tasks.filter(t => t.status === 'pending' && t.blockedBy?.length > 0).length;
triggerNotification('dailySummary', `📊 Daily Summary: ${completedCount} completed, ${tasks.filter(t => t.status === 'in_progress').length} in progress, ${blockedCount} blocked`);
