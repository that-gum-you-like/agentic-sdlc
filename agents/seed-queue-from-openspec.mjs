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
import { screenExternalInput } from './red-team-tester.mjs';
import { logCapabilityUsage } from './capability-logger.mjs';
import { notifyHumanTask } from './notify.mjs';

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

/**
 * Absent lane = legacy tasks.md, seeded as before. Any lane other than `hermes`
 * (interactive, or a typo) is withheld — fail closed. (curriculum-v2-conformance CV-REQ-039)
 */
export function isDrainLane(task = {}) {
  return !task.lane || task.lane === 'hermes';
}

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
  const doneIds = new Set();

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
        doneIds.add(taskBullet[2].replace(/^T/i, ''));
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

      // Parse lane annotation: `- Lane: hermes|interactive`. Interactive tasks
      // touch the machinery executing the drain (or need Bryce) and must never
      // be queued for it (openspec: curriculum-v2-conformance CV-REQ-039).
      // `- Parallel: blocked-by CV-101, CV-102` → dependencies on sibling tasks.
      const blockedMatch = line.match(/blocked-by\s+(.+)$/i);
      if (blockedMatch) {
        currentTask.blockedByRaw = (blockedMatch[1].match(/\b[A-Z]+-\d+(?:\.\d+)?\b/gi) || [])
          .map(id => id.replace(/^T/i, ''));
      }

      const laneMatch = line.match(/^\s*-\s+Lane:\s*([\w-]+)/i);
      if (laneMatch) {
        currentTask.lane = laneMatch[1].toLowerCase();
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

  tasks.doneIds = doneIds; // checked-off ids: a dependency on one is already satisfied
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
  let totalSkippedLane = 0;
  let totalSkippedInjection = 0;
  let totalSkippedUnbounded = 0;
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

      // Absent lane = legacy tasks.md, seeded as before. Any lane other than
      // `hermes` (interactive, or a typo) is withheld — fail closed.
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

      // CV-205 (CV-REQ-061): screen every task block before writing. An
      // OpenSpec tasks.md is external-origin text — authored outside the drain
      // — and may carry prompt injection. A flagged task is never written: it
      // is skipped with reason `injection-screen`, a human task is raised, and
      // the outcome is logged via logCapabilityUsage('injectionScreen', ...).
      const screenText = (task.title || '') + '\n' + description;
      const { safe } = screenExternalInput(screenText);
      if (!safe) {
        console.log(`  [BLOCKED] ${taskId}: ${task.title} (injection screen — reason: injection-screen)`);
        totalSkippedInjection++;
        if (!isDryRun) {
          const humanTask = {
            id: `injection-${taskId}`,
            title: `Injection blocked: ${task.title}`,
            description: `Task from openspec change "${changeName}" was blocked by the injection screen.\n\nSource: openspec/${changeName}/tasks.md\n\nOriginal task:\n${screenText}`,
            urgency: 'HIGH',
          };
          try { notifyHumanTask(humanTask); } catch { /* notification is best-effort */ }
          try {
            logCapabilityUsage('injectionScreen', 'seed-queue-from-openspec', taskId, 'seed-queue-from-openspec.mjs', 'blocked');
          } catch { /* capability logging must never break seeding */ }
        }
        continue;
      }

      // Goal safety — CV-208 / CV-REQ-062: skip unbounded-verb tasks
      const goalFindings = goalSafetyFindings({ title: task.title, description });
      if (goalFindings.includes('unbounded-verb')) {
        console.log(`  [unbounded] ${taskId}: ${task.title} (unbounded goal — reason: unbounded-goal)`);
        totalSkippedUnbounded++;
        continue;
      }

      // Dependencies: map sibling raw ids to their queue ids; checked-off ones are satisfied.
      const blockedBy = (task.blockedByRaw || [])
        .filter(raw => !(tasks.doneIds && tasks.doneIds.has(raw)))
        .map(raw => tasks.find(t => t.rawNumber === raw))
        .filter(Boolean)
        .map(t => `OS-${safeChangeName}-${t.taskNumber}`);

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
      // Goal safety — CV-208 / CV-REQ-062: record no-acceptance as a warning
      if (goalFindings.includes('no-acceptance')) {
        taskJson.goalSafety = ['no-acceptance'];
      }
      if (blockedBy.length) taskJson.blockedBy = blockedBy;
      // Interactive-lane tasks are queued visible but BLOCKED: the drain only claims
      // `pending`, and dependents resolve once a human marks this one completed.
      if (!isDrainLane(task)) {
        taskJson.status = 'blocked';
        taskJson.blockedReason = `interactive-lane (lane=${task.lane}): touches the machinery executing the drain or needs Bryce — done in an interactive session`;
        totalSkippedLane++;
      }

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
  console.log(`  Skipped (injection): ${totalSkippedInjection}`);
  console.log(`  Skipped (unbounded): ${totalSkippedUnbounded}`);
  console.log(`  Interactive (blocked): ${totalSkippedLane}`);
  if (!isDryRun && totalCreated > 0) {
    console.log(`\n[seed] Task queue: ${TASK_QUEUE_DIR}`);
    console.log(`[seed] Run: node ~/agentic-sdlc/agents/queue-drainer.mjs status`);
  }
}

// ---------------------------------------------------------------------------
// Goal safety — detect unbounded or untestable tasks
// ---------------------------------------------------------------------------

const UNBOUNDED_VERBS = /\b(?:optimize|improve|clean\s+up|refactor|simplify|make\s+better)\b/i;

/**
 * Inspect a task for goal-safety issues and return an array of finding IDs.
 *
 * @param {{ title?: string, description?: string }} task — a task object with
 *   title (the heading/title line) and description (the full body text).
 * @returns {string[]} — zero or more of:
 *   - `'no-acceptance'`: task text contains no `Test:` or `acceptance` line.
 *     Without a test, the task cannot be objectively verified as done.
 *   - `'unbounded-verb'`: task uses an open-ended verb (optimize, improve, etc.)
 *     with no `Files:` line to scope the work. An unscoped optimisation goal
 *     has no natural stopping point (evil-genie problem).
 */
function goalSafetyFindings(task = {}) {
  const findings = [];
  const title = String(task.title || '');
  const description = String(task.description || '');
  const fullText = `${title}\n${description}`;

  // no-acceptance — no Test:/acceptance line anywhere in the task text
  const hasTestOrAcceptance = /\bTest\s*[:：]/i.test(fullText) || /\bacceptance\b/i.test(fullText);
  if (!hasTestOrAcceptance) {
    findings.push('no-acceptance');
  }

  // unbounded-verb — unbounded language without a Files: line to scope it
  const hasUnboundedVerb = UNBOUNDED_VERBS.test(fullText);
  const hasFiles = /^[ \t]*-[ \t]+Files?\s*[:：]/im.test(fullText);
  if (hasUnboundedVerb && !hasFiles) {
    findings.push('unbounded-verb');
  }

  return findings;
}

/**
 * Detect cycles in task blockedBy dependencies using DFS.
 *
 * Builds an adjacency map from task `blockedBy` arrays, ignoring references to
 * ids that are not present in the task list. Performs a DFS with coloring to
 * find back-edges (cycles), normalises each cycle to a canonical rotation
 * (smallest id first), and returns the deduplicated cycles sorted by first member.
 *
 * @param {Array<{id: string, blockedBy?: string[]}>} tasks — task objects
 * @returns {string[][]} — array of cycles; each cycle is the member ids in
 *   dependency-follow order rotated so the smallest id is first. Empty array
 *   when no cycles exist.
 */
export function detectBlockedByCycle(tasks) {
  const idSet = new Set(tasks.map(t => t.id));

  /** adjacency: task id → its blockedBy ids filtered to those that exist */
  const adj = new Map();
  for (const t of tasks) {
    adj.set(t.id, (t.blockedBy || []).filter(id => idSet.has(id)));
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(tasks.map(t => [t.id, WHITE]));
  const cycles = [];

  function dfs(nodeId, path) {
    color.set(nodeId, GRAY);
    path.push(nodeId);

    for (const neighbor of adj.get(nodeId) || []) {
      const nc = color.get(neighbor);
      if (nc === GRAY) {
        // Back edge — cycle found. Slice from the first occurrence of neighbor.
        const start = path.indexOf(neighbor);
        cycles.push(path.slice(start));
      } else if (nc === WHITE) {
        dfs(neighbor, path);
      }
      // BLACK → already fully processed, no cycle.
    }

    path.pop();
    color.set(nodeId, BLACK);
  }

  for (const t of tasks) {
    if (color.get(t.id) === WHITE) {
      dfs(t.id, []);
    }
  }

  // Normalise each cycle to a canonical rotation (smallest id first), dedup.
  const seen = new Set();
  const result = [];
  for (const cycle of cycles) {
    // Find index of the minimum element.
    let minIdx = 0;
    for (let i = 1; i < cycle.length; i++) {
      if (cycle[i] < cycle[minIdx]) minIdx = i;
    }
    const norm = [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)];
    const key = norm.join('\x00');
    if (!seen.has(key)) {
      seen.add(key);
      result.push(norm);
    }
  }

  result.sort((a, b) => a[0].localeCompare(b[0]));
  return result;
}

export { assignAgent, patternMatches, parseTasksMd, estimateTokens, loadDomains, goalSafetyFindings };

// --- CLI ---
const __isMainModule = process.argv[1] && resolve(process.argv[1]) === __filename;

if (__isMainModule) {
  main();
}
