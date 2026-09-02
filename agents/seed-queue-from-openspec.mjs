#!/usr/bin/env node
/**
 * seed-queue-from-openspec.mjs
 * Agentic SDLC Framework — Release Manager
 *
 * Scans active OpenSpec changes and seeds the task queue with pending tasks.
 * Framework version: uses loadConfig() to resolve all paths dynamically.
 *
 * Usage:
 *   node ~/agentic-sdlc/agents/seed-queue-from-openspec.mjs [--dry-run]
 *   node ~/agentic-sdlc/agents/seed-queue-from-openspec.mjs --project-dir /path/to/project [--dry-run]
 *   SDLC_PROJECT_DIR=/path/to/project node ~/agentic-sdlc/agents/seed-queue-from-openspec.mjs [--dry-run]
 *
 * Runs from any directory — loadConfig() searches CWD → parent dirs for agents/project.json.
 */

import fs from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './load-config.mjs';

const __filename = fileURLToPath(import.meta.url);

const isDryRun = process.argv.includes('--dry-run');

// ---------------------------------------------------------------------------
// Load config (resolves all paths for the current project)
// ---------------------------------------------------------------------------
const config = loadConfig();

const OPENSPEC_CHANGES_DIR = resolve(config.projectDir, 'openspec/changes');
const TASK_QUEUE_DIR = config.tasksDir;
const DOMAINS_FILE = resolve(config.agentsDir, 'domains.json');

// ---------------------------------------------------------------------------
// Load agent domains (optional — fall back to keyword matching if absent)
// ---------------------------------------------------------------------------
let _domainsCache;
function loadDomains() {
  if (_domainsCache !== undefined) return _domainsCache;
  try {
    _domainsCache = JSON.parse(fs.readFileSync(DOMAINS_FILE, 'utf8'));
  } catch {
    // domains.json is optional — routing falls back to the configured roster
    _domainsCache = null;
  }
  return _domainsCache;
}

// ---------------------------------------------------------------------------
// Assign agent from domains.json routing (project config, not hardcoded names).
//
// Each domains.json entry maps an agent key to { name, role, patterns: [] }.
// A pattern matches when every non-glob segment (split on "*") appears in the
// task's title+description (case-insensitive) — so both keyword patterns
// ("design review") and file-glob patterns ("agents/*.mjs") route correctly.
// The agent with the most matching patterns wins; title matches are weighted
// double (titles are specific; descriptions carry boilerplate subtasks).
// ---------------------------------------------------------------------------
function patternMatches(pattern, text) {
  const parts = String(pattern).toLowerCase().split('*').map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every(part => text.includes(part));
}

function assignAgent(title, description, domains) {
  const titleLower = String(title || '').toLowerCase();
  const fullText = `${titleLower} ${String(description || '').toLowerCase()}`;

  let best = null;
  let bestScore = 0;

  for (const [agentKey, domain] of Object.entries(domains || {})) {
    let score = 0;
    for (const pattern of domain.patterns || []) {
      if (patternMatches(pattern, titleLower)) score += 2;
      else if (patternMatches(pattern, fullText)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = agentKey;
    }
  }

  if (best) return best;

  // No domain matched — default to the project's first configured agent.
  const fallback = (domains && Object.keys(domains)[0]) || config.agents?.[0];
  return fallback || 'unassigned';
}

// ---------------------------------------------------------------------------
// Estimate tokens based on number of subtasks in description
// ---------------------------------------------------------------------------
function estimateTokens(subtaskCount) {
  if (subtaskCount <= 3) return 3500;
  if (subtaskCount <= 6) return 20000;
  return 35000;
}

// ---------------------------------------------------------------------------
// Seedability
//
// This gate used to demand `status === 'active' && phase === 'tasks'`. Nothing
// in the framework has ever used those values — not one change, and not the
// status.json.template, which ships "proposed"/"proposal". Real changes use
// proposed/design, in-progress/implement, implemented/verify, and so on. So the
// seeder silently skipped every change it was ever pointed at and reported
// "Tasks would create: 0", which reads as "nothing to do" rather than "this
// tool has never worked". That is what blocked agents from building their own
// backlog: the only remaining path was hand-written queue JSON.
//
// Inverted to an explicit terminal-state list. A change is seedable unless it
// is finished or still upstream of having tasks, so new vocabulary defaults to
// seedable (loud, fixable) rather than silently dropped.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Readiness (openspec: business-os / work-item-readiness)
//
// Phase describes how far AUTHORSHIP has got. Readiness describes whether the
// work is AUTHORIZED to be built. They are orthogonal: a change can be fully
// specced with tasks written and still be draft.
//
// Absent readiness means 'draft'. This default is deliberately restrictive:
// writing something down must never be sufficient reason for an agent to start
// building it. On 2026-09-02 nine changes sat in a seedable phase and eight
// were out of scope — level-6-autonomous-activation alone would have dumped
// ~43 open tasks into the queue the moment the drain came back on.
// ---------------------------------------------------------------------------

export const READINESS_STATES = new Set([
  'draft', 'ready-for-dev', 'in-dev', 'ready-for-review', 'done',
]);

/** @returns {string} the change's readiness; absent/unset resolves to 'draft'. */
export function readinessOf(status = {}) {
  const r = String(status.readiness ?? '').toLowerCase().trim();
  if (!r) return 'draft';
  return READINESS_STATES.has(r) ? r : 'invalid';
}

/** @returns {boolean} true only when a change is authorized for the dev loop. */
export function isReadyForDev(status = {}) {
  return readinessOf(status) === 'ready-for-dev';
}

const DONE_STATUSES = new Set(['implemented', 'complete', 'completed', 'archived', 'cancelled', 'abandoned']);
const NOT_YET_PHASES = new Set(['proposal', 'design', 'planning', 'specs']);
const DONE_PHASES = new Set(['verify', 'verified', 'archive', 'archived', 'done']);

/** @returns {boolean} true when a change has tasks worth queueing. */
export function isSeedable(status = {}) {
  const s = String(status.status ?? '').toLowerCase();
  const p = String(status.phase ?? '').toLowerCase();
  if (DONE_STATUSES.has(s) || DONE_PHASES.has(p)) return false;
  if (NOT_YET_PHASES.has(p)) return false;
  return true;
}


// ---------------------------------------------------------------------------
// Parse proposal.md priority
// ---------------------------------------------------------------------------
function parsePriority(changeName) {
  const proposalPath = resolve(OPENSPEC_CHANGES_DIR, changeName, 'proposal.md');
  try {
    const content = fs.readFileSync(proposalPath, 'utf8');
    if (/\bCRITICAL\b/.test(content)) return 'CRITICAL';
    if (/\bHIGH\b/.test(content)) return 'HIGH';
    return 'MEDIUM';
  } catch {
    return 'MEDIUM';
  }
}

// ---------------------------------------------------------------------------
// Parse tasks.md into task objects
// ---------------------------------------------------------------------------
function parseTasksMd(changeName, tasksPath) {
  let content;
  try {
    content = fs.readFileSync(tasksPath, 'utf8');
  } catch (err) {
    console.warn(`[seed] WARN: Could not read ${tasksPath} — ${err.message}`);
    return [];
  }

  const tasks = [];
  const lines = content.split('\n');

  let currentTask = null;
  let taskNumber = 0;

  for (const line of lines) {
    // Match ## Task N: Title  or  ## Task N.M: Title
    const taskHeading = line.match(/^##\s+Task\s+([\d.]+):\s+(.+)$/i);
    if (taskHeading) {
      if (currentTask) {
        tasks.push(currentTask);
      }
      taskNumber++;
      currentTask = {
        rawNumber: taskHeading[1],
        taskNumber,
        title: taskHeading[2].trim(),
        descriptionLines: [line],
        pendingSubtasks: 0,
        doneSubtasks: 0,
      };
      continue;
    }

    // Match the bullet form: `- [ ] **T1**: Title`.
    //
    // This is the format MISSION_PLAYBOOK tells agents to write, that
    // tasks.md.template ships, and that every tasks.md in this framework
    // actually uses — but only the `## Task N:` heading form was ever parsed,
    // so a correctly-authored tasks.md seeded nothing. Checked items are
    // skipped: already done is not backlog.
    // Task ids in this repo are hyphenated (T-001, T-101). `\w` excludes the
    // hyphen, so this pattern matched nothing for the entire life of the file
    // and every tasks.md silently reported "no tasks found" (openspec:
    // business-os / work-item-readiness).
    const taskBullet = line.match(/^\s*-\s+\[( |x)\]\s+\*\*([\w.-]+)\*\*\s*[:—-]\s*(.+)$/i);
    if (taskBullet) {
      if (currentTask) {
        tasks.push(currentTask);
      }
      if (taskBullet[1].toLowerCase() === 'x') {
        currentTask = null; // completed — don't re-queue it
        continue;
      }
      taskNumber++;
      currentTask = {
        rawNumber: taskBullet[2].replace(/^T/i, ''),
        taskNumber,
        title: taskBullet[3].trim(),
        descriptionLines: [line],
        pendingSubtasks: 0,
        doneSubtasks: 0,
      };
      continue;
    }

    if (currentTask) {
      currentTask.descriptionLines.push(line);

      // Count checklist items
      if (/^\s*-\s+\[x\]/i.test(line)) {
        currentTask.doneSubtasks++;
      } else if (/^\s*-\s+\[ \]/.test(line)) {
        currentTask.pendingSubtasks++;
      }

      // Parse inline per-task priority annotation: **Priority:** CRITICAL
      const priorityMatch = line.match(/\*\*Priority:\*\*\s*(CRITICAL|HIGH|MEDIUM|LOW)/i);
      if (priorityMatch) {
        currentTask.inlinePriority = priorityMatch[1].toUpperCase();
      }

      // Parse inline per-task token annotation: **Tokens:** 20000
      const tokenMatch = line.match(/\*\*(?:Estimated\s+)?Tokens?:\*\*\s*(\d+)/i);
      if (tokenMatch) {
        currentTask.inlineTokens = parseInt(tokenMatch[1], 10);
      }

      // Parse inline per-task agent annotation: **Agent:** Jen (Frontend)
      // Honored only if the named agent exists in this project's roster
      // (domains.json keys or project.json agents list).
      const agentMatch = line.match(/\*\*Agent:\*\*\s*([\w-]+)/i);
      if (agentMatch) {
        const agentName = agentMatch[1].toLowerCase();
        const roster = new Set([
          ...Object.keys(loadDomains() || {}),
          ...(config.agents || []),
        ].map(a => a.toLowerCase()));
        if (roster.has(agentName)) {
          currentTask.inlineAgent = agentName;
        }
      }
    }
  }

  // Push the last task
  if (currentTask) {
    tasks.push(currentTask);
  }

  return tasks;
}

// ---------------------------------------------------------------------------
// Load existing task queue titles for dedup check
// ---------------------------------------------------------------------------
function loadQueueTitles() {
  const titles = [];
  try {
    if (!fs.existsSync(TASK_QUEUE_DIR)) return titles;
    const files = fs.readdirSync(TASK_QUEUE_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const task = JSON.parse(fs.readFileSync(resolve(TASK_QUEUE_DIR, file), 'utf8'));
        if (task.title) titles.push(task.title.toLowerCase());
      } catch {
        // skip malformed files
      }
    }
  } catch {
    // dir doesn't exist yet — fine
  }
  return titles;
}

// ---------------------------------------------------------------------------
// Check if a task already exists in the queue (case-insensitive substring)
// ---------------------------------------------------------------------------
function isDuplicate(title, queueTitles) {
  const needle = title.toLowerCase();
  return queueTitles.some(existing =>
    existing.includes(needle) || needle.includes(existing)
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  console.log(`[seed] ${isDryRun ? '[DRY RUN] ' : ''}Scanning OpenSpec changes for pending tasks...`);
  console.log(`[seed] Project:      ${config.name} (${config.projectDir})`);
  console.log(`[seed] OpenSpec dir: ${OPENSPEC_CHANGES_DIR}`);
  console.log(`[seed] Task queue:   ${TASK_QUEUE_DIR}`);
  if (fs.existsSync(DOMAINS_FILE)) {
    console.log(`[seed] Domains:      ${DOMAINS_FILE}`);
  } else {
    console.log(`[seed] Domains:      (not found — using keyword matching)`);
  }
  console.log('');

  // Load domains (optional) — drives agent routing below
  const domains = loadDomains();

  const queueTitles = loadQueueTitles();

  // Ensure queue dir exists (unless dry run)
  if (!isDryRun && !fs.existsSync(TASK_QUEUE_DIR)) {
    fs.mkdirSync(TASK_QUEUE_DIR, { recursive: true });
  }

  let changeEntries;
  try {
    changeEntries = fs.readdirSync(OPENSPEC_CHANGES_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name !== 'archive');
  } catch (err) {
    console.error(`[seed] ERROR: Could not read openspec/changes/ — ${err.message}`);
    console.error(`[seed] Expected: ${OPENSPEC_CHANGES_DIR}`);
    process.exit(1);
  }

  let totalCreated = 0;
  let totalSkippedDone = 0;
  let totalSkippedDupe = 0;
  let totalChangesProcessed = 0;

  for (const entry of changeEntries) {
    const changeName = entry.name;
    if (changeName.startsWith('_') || changeName.startsWith('.')) continue; // scratch dirs
    const changeDir = resolve(OPENSPEC_CHANGES_DIR, changeName);
    const statusFile = resolve(changeDir, 'status.json');
    const tasksFile = resolve(changeDir, 'tasks.md');

    // --- Guard: status.json must exist ---
    if (!fs.existsSync(statusFile)) {
      console.log(`[seed] SKIP ${changeName}: no status.json found`);
      continue;
    }

    let status;
    try {
      status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
    } catch (err) {
      console.log(`[seed] SKIP ${changeName}: malformed status.json — ${err.message}`);
      continue;
    }

    // --- Guard: readiness — authored is not authorized (work-item-readiness) ---
    const readiness = readinessOf(status);
    if (readiness === 'invalid') {
      console.log(`[seed] SKIP ${changeName}: not-ready (unrecognized readiness "${status.readiness}")`);
      continue;
    }
    if (!isReadyForDev(status)) {
      console.log(`[seed] SKIP ${changeName}: not-ready (readiness=${readiness})`);
      continue;
    }

    // --- Guard: skip only what is genuinely finished or not yet planned ---
    if (!isSeedable(status)) {
      console.log(`[seed] SKIP ${changeName}: status=${status.status}, phase=${status.phase}`);
      continue;
    }

    // --- Guard: tasks.md must exist ---
    if (!fs.existsSync(tasksFile)) {
      console.log(`[seed] SKIP ${changeName}: no tasks.md found`);
      continue;
    }

    totalChangesProcessed++;
    const priority = parsePriority(changeName);
    const tasks = parseTasksMd(changeName, tasksFile);

    if (tasks.length === 0) {
      console.log(`[seed] ${changeName}: no tasks found in tasks.md`);
      continue;
    }

    console.log(`[seed] Processing ${changeName} (${tasks.length} tasks, priority: ${priority})`);

    for (const task of tasks) {
      // Skip if ALL subtasks are done (or there are no pending subtasks at all
      // and at least one done subtask exists — means the whole task is complete)
      const totalSubtasks = task.pendingSubtasks + task.doneSubtasks;
      const allDone = totalSubtasks > 0 && task.pendingSubtasks === 0;

      if (allDone) {
        console.log(`  [done]  Task ${task.rawNumber}: ${task.title}`);
        totalSkippedDone++;
        continue;
      }

      // Check for duplicates
      if (isDuplicate(task.title, queueTitles)) {
        console.log(`  [dupe]  Task ${task.rawNumber}: ${task.title}`);
        totalSkippedDupe++;
        continue;
      }

      // Build description from task content
      const description = task.descriptionLines.join('\n').trim();

      // Assign agent — prefer inline annotation, fall back to domain routing
      const agent = task.inlineAgent || assignAgent(task.title, description, domains);

      // Estimate tokens — prefer inline annotation, fall back to subtask count heuristic
      const subtaskCount = Math.max(task.pendingSubtasks, task.doneSubtasks, totalSubtasks);
      const estimatedTokens = task.inlineTokens || estimateTokens(subtaskCount);

      // Priority — prefer per-task inline annotation, fall back to change-level proposal priority
      const taskPriority = task.inlinePriority || priority;

      // Build task ID: OS-<change-name>-<taskNumber>
      // Sanitize change name: replace non-alphanumeric with hyphens
      const safeChangeName = changeName.replace(/[^a-zA-Z0-9]/g, '-');
      const taskId = `OS-${safeChangeName}-${task.taskNumber}`;

      const taskJson = {
        id: taskId,
        title: task.title,
        description,
        priority: taskPriority,
        status: 'pending',
        agent,
        estimatedTokens,
        source: `openspec/${changeName}/tasks.md`,
        createdAt: new Date().toISOString(),
        claimedBy: null,
        testStatus: null,
      };

      if (isDryRun) {
        console.log(`  [would-create] ${taskId} (agent: ${agent}, priority: ${taskPriority}, tokens: ${estimatedTokens})`);
        console.log(`    Title: ${task.title}`);
        console.log(`    Source: openspec/${changeName}/tasks.md`);
        console.log('');
      } else {
        const outPath = resolve(TASK_QUEUE_DIR, `${taskId}.json`);
        fs.writeFileSync(outPath, JSON.stringify(taskJson, null, 2) + '\n');
        console.log(`  [created] ${taskId} → agent:${agent}, priority:${taskPriority}, tokens:${estimatedTokens}`);
        console.log(`    Title: ${task.title}`);
        // Add to in-memory queue titles so subsequent tasks don't dupe-match each other
        queueTitles.push(task.title.toLowerCase());
      }

      totalCreated++;
    }

    console.log('');
  }

  // Summary
  console.log('─'.repeat(60));
  console.log(`[seed] Summary`);
  console.log(`  Project           : ${config.name}`);
  console.log(`  Changes processed : ${totalChangesProcessed}`);
  console.log(`  Tasks ${isDryRun ? 'would create' : 'created    '}: ${totalCreated}`);
  console.log(`  Skipped (done)    : ${totalSkippedDone}`);
  console.log(`  Skipped (dupe)    : ${totalSkippedDupe}`);
  if (!isDryRun && totalCreated > 0) {
    console.log(`\n[seed] Task queue: ${TASK_QUEUE_DIR}`);
    console.log(`[seed] Run: node ~/agentic-sdlc/agents/queue-drainer.mjs status`);
  }
}

export { assignAgent, patternMatches, parseTasksMd, estimateTokens, loadDomains };

// --- CLI ---
const __isMainModule = process.argv[1] && resolve(process.argv[1]) === __filename;

if (__isMainModule) {
  main();
}
