#!/usr/bin/env node
/**
 * Seeds the task queue from a template file.
 *
 * Usage:
 *   node seed-queue.mjs                          # Uses seed-tasks.json in project root
 *   node seed-queue.mjs --template <path>         # Uses a specific template file
 *   node seed-queue.mjs --template <path> --var PROJECT=MyApp --var APP_DIR=src
 *   node seed-queue.mjs --dry-run                 # Preview without writing files
 *
 * Subcommands:
 *   node seed-queue.mjs report-error              # Read JSONL error events from stdin and create/update prod-error-<hash> tasks
 *   node seed-queue.mjs report-error --dry-run    # Preview without writing files
 *
 * Template format: see agents/templates/seed-tasks.json.template
 *
 * The script reads tasks from the template, substitutes {{VARIABLE}} placeholders
 * with values from the template's "variables" section (overridable via --var flags),
 * and writes individual task JSON files to the task queue directory.
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { loadConfig } from './load-config.mjs';
import { screenExternalInput } from './red-team-tester.mjs';
import { errorSignature, notifyHumanTask } from './notify.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { template: null, vars: {}, dryRun: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--template' && args[i + 1]) {
      result.template = args[++i];
    } else if (args[i] === '--var' && args[i + 1]) {
      const [key, ...valParts] = args[++i].split('=');
      result.vars[key] = valParts.join('=');
    } else if (args[i] === '--dry-run') {
      result.dryRun = true;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Template loading and variable substitution
// ---------------------------------------------------------------------------

function findTemplate(config, templatePath) {
  // Explicit --template flag
  if (templatePath) {
    const resolved = resolve(templatePath);
    if (existsSync(resolved)) return resolved;
    console.error(`ERROR: Template not found: ${resolved}`);
    process.exit(1);
  }

  // Look for seed-tasks.json in the project root
  const projectTemplate = resolve(config.projectDir, 'seed-tasks.json');
  if (existsSync(projectTemplate)) return projectTemplate;

  // Look in the project's agents/ directory
  const agentsTemplate = resolve(config.agentsDir, 'seed-tasks.json');
  if (existsSync(agentsTemplate)) return agentsTemplate;

  // Fall back to the framework's example template
  const frameworkTemplate = resolve(__dirname, 'templates', 'seed-tasks.json.template');
  if (existsSync(frameworkTemplate)) {
    console.log('NOTE: Using framework example template. Copy it to your project and customize:');
    console.log(`  cp ${frameworkTemplate} ${projectTemplate}`);
    console.log('');
    return frameworkTemplate;
  }

  console.error('ERROR: No seed-tasks.json found.');
  console.error('Create one in your project root or specify one with --template <path>');
  console.error(`Example template: ${resolve(__dirname, 'templates', 'seed-tasks.json.template')}`);
  process.exit(1);
}

function substituteVariables(text, variables) {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (key in variables) return variables[key];
    return match; // Leave unresolved placeholders as-is
  });
}

function loadTemplate(templatePath, cliVars) {
  const raw = readFileSync(templatePath, 'utf8');
  const parsed = JSON.parse(raw);

  // Merge template variables with CLI overrides (CLI wins)
  const variables = { ...parsed.variables, ...cliVars };

  // Substitute variables in the full JSON (re-stringify, substitute, re-parse)
  const substituted = substituteVariables(JSON.stringify(parsed.tasks), variables);
  const tasks = JSON.parse(substituted);

  return { tasks, variables };
}

// ---------------------------------------------------------------------------
// report-error subcommand (CV-703 / CV-REQ-111)
// ---------------------------------------------------------------------------

/**
 * Ingest error events from one or more JSONL lines, dedup by errorSignature,
 * and return one task per unique error with an occurrence count.
 *
 * @param {string[]} lines - Array of JSONL strings (one error event per line)
 * @param {object} [opts]
 * @param {string} [opts.tasksDir] - Directory to write task files to (required unless dryRun)
 * @param {boolean} [opts.dryRun] - If true, only return tasks without writing files
 * @returns {{ tasks: Array, totalEvents: number, uniqueCount: number }}
 */
export function ingestErrors(lines, opts = {}) {
  const { tasksDir = null, dryRun = false } = opts;

  // Group identical error events by errorSignature
  /** @type {Object<string, { count: number, sanitized: string, firstSeen: string }>} */
  const groups = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    // Extract text from JSON line: try common error fields, fall back to the raw line
    let text;
    try {
      const parsed = JSON.parse(trimmed);
      text = parsed.message || parsed.text || parsed.error || parsed.errorMessage || trimmed;
    } catch {
      text = trimmed;
    }

    const sig = errorSignature(text);
    const { sanitized } = screenExternalInput(text);

    if (!groups[sig]) {
      groups[sig] = { count: 0, sanitized, firstSeen: new Date().toISOString() };
    }
    groups[sig].count++;
  }

  // Build task objects
  const tasks = [];
  for (const [sig, group] of Object.entries(groups)) {
    const priority = group.count >= 100 ? 'CRITICAL' : group.count >= 10 ? 'HIGH' : 'MEDIUM';
    const taskId = `prod-error-${sig}`;
    const firstLine = group.sanitized.replace(/\n/g, ' ').slice(0, 80).trim();
    const title = firstLine.length > 0 ? `Prod error: ${firstLine}` : 'Prod error (empty)';

    const taskData = {
      id: taskId,
      title,
      description: group.sanitized,
      priority,
      status: 'pending',
      agent: 'sdlc-developer',
      occurrences: group.count,
      source: 'error-intake',
      createdAt: group.firstSeen,
    };

    tasks.push(taskData);

    if (!dryRun && tasksDir) {
      const filePath = join(tasksDir, `${taskId}.json`);
      const existing = existsSync(filePath) ? JSON.parse(readFileSync(filePath, 'utf8')) : null;
      if (existing) {
        // Preserve the original createdAt and merge in the new occurrence count
        taskData.createdAt = existing.createdAt || taskData.createdAt;
        taskData.occurrences = (existing.occurrences || 0) + group.count;
        // Re-evaluate priority with the merged count
        const mergedCount = taskData.occurrences;
        taskData.priority = mergedCount >= 100 ? 'CRITICAL' : mergedCount >= 10 ? 'HIGH' : 'MEDIUM';
      }
      writeFileSync(filePath, JSON.stringify(taskData, null, 2));
    }
  }

  return { tasks, totalEvents: lines.filter(l => l.trim().length > 0).length, uniqueCount: Object.keys(groups).length };
}

// ---------------------------------------------------------------------------
// scaffoldBugChange — create bug-<id> OpenSpec change from templates (CV-308 / CV-REQ-036)
// ---------------------------------------------------------------------------

/**
 * Scaffold an OpenSpec bug change directory from the task's failure info.
 *
 * Creates openspec/changes/bug-<id>/{proposal.md,tasks.md,status.json} from
 * the OpenSpec templates with readiness `draft`, embedding the task id, title,
 * and last failure description. Idempotent: a second call with the same inputs
 * leaves existing files byte-identical.
 *
 * @param {object} task - Queue task object with id, title, description
 * @param {object} [opts]
 * @param {string} opts.templatesDir - Path to OpenSpec templates dir (e.g. openspec/templates)
 * @param {string} opts.changesDir  - Path to OpenSpec changes dir (e.g. openspec/changes)
 * @returns {string} The absolute path to the created bug change directory
 */
export function scaffoldBugChange(task, opts = {}) {
  const { templatesDir, changesDir } = opts;

  if (!templatesDir || !changesDir) {
    throw new Error('scaffoldBugChange: templatesDir and changesDir are required');
  }

  const bugId = `bug-${task.id}`;
  const bugDir = join(changesDir, bugId);
  const dateStr = new Date().toISOString().slice(0, 10);
  const failureText = task.description || 'No failure details provided.';

  // Idempotent: an existing bug change is left untouched (spec CV-REQ-036), even across days.
  if (existsSync(bugDir)) return resolve(bugDir);

  // Fail loudly, before creating anything, when a template is missing.
  for (const t of ['proposal.md.template', 'tasks.md.template', 'status.json.template']) {
    if (!existsSync(join(templatesDir, t))) {
      throw new Error(`scaffoldBugChange: missing template ${join(templatesDir, t)}`);
    }
  }

  mkdirSync(bugDir, { recursive: true });

  // Build proposal.md from template
  const proposalTemplate = readFileSync(join(templatesDir, 'proposal.md.template'), 'utf8');
  const proposalContent = proposalTemplate
    .replace(/\{\{CHANGE_NAME\}\}/g, bugId)
    .replace(/\{\{DATE\}\}/g, dateStr)
    .replace(/\{\{AUTHOR\}\}/g, 'hermes-drain')
    .replace(/\{\{PROBLEM_DESCRIPTION\}\}/g,
      `Task \`${task.id}\` failed: **${task.title}**\n\n` +
      `Last failure:\n\`\`\`\n${failureText}\n\`\`\``)
    .replace(/\{\{FILES_EXAMINED\}\}/g, 'N/A — automated bug scaffold')
    .replace(/\{\{EXISTING_PATTERNS\}\}/g, 'See parent change for context')
    .replace(/\{\{EXISTING_TESTS\}\}/g, 'N/A — automated bug scaffold')
    .replace(/\{\{DISCOVERY_FINDINGS\}\}/g, 'Bug filed automatically by the drain on task failure')
    .replace(/\{\{SOLUTION_DESCRIPTION\}\}/g,
      `Investigate and fix the failure in task \`${task.id}\`: ${task.title}`)
    // Value Analysis
    .replace(/\{\{METRIC_1\}\}/g, 'Task passes on next attempt')
    .replace(/\{\{BASELINE_1\}\}/g, 'Task failed')
    .replace(/\{\{TARGET_1\}\}/g, 'Task passes')
    .replace(/\{\{HOW_MEASURED_1\}\}/g, 'Queue task status')
    .replace(/\{\{BENEFICIARY_1\}\}/g, 'sdlc-developer — can retry with a focused bug fix')
    .replace(/\{\{BENEFICIARY_2\}\}/g, 'Bryce — reduced manual triage')
    .replace(/\{\{BENEFIT_1\}\}/g, 'Captures the failure context before it is lost')
    .replace(/\{\{BENEFIT_2\}\}/g, 'Provides a structured OpenSpec change for the fix')
    .replace(/\{\{EFFORT_ESTIMATE\}\}/g, 'Triage + fix, variable')
    .replace(/\{\{RISK_DESCRIPTION\}\}/g, 'Low — isolated bug change')
    .replace(/\{\{DEPENDENCIES\}\}/g, 'None')
    .replace(/\{\{ALT_1\}\}/g, 'Manual bug tracking')
    .replace(/\{\{REASON_1\}\}/g, 'Would lose failure context from the drain')
    .replace(/\{\{REASON_DO_NOTHING\}\}/g, 'Bug would remain unfiled')
    .replace(/\{\{DECISION\}\}/g, 'Yes — scaffold the bug change')
    // Scope
    .replace(/\{\{IN_SCOPE_1\}\}/g, `Fix the failure in ${task.id}`)
    .replace(/\{\{IN_SCOPE_2\}\}/g, 'Tests that reproduce the failure')
    .replace(/\{\{OUT_OF_SCOPE_1\}\}/g, 'Refactoring beyond the bug fix')
    .replace(/\{\{OUT_OF_SCOPE_2\}\}/g, 'Related but unrelated issues')
    // User Stories
    .replace(/\{\{NEW_USER_STORY\}\}/g, 'bugs are tracked in OpenSpec')
    .replace(/\{\{NEW_USER_RATIONALE\}\}/g, 'I can see the fix progress')
    .replace(/\{\{REGULAR_USER_STORY\}\}/g, 'failed tasks produce a bug change')
    .replace(/\{\{REGULAR_USER_RATIONALE\}\}/g, 'I know the failure was captured')
    .replace(/\{\{POWER_USER_STORY\}\}/g, 'bug changes have task context')
    .replace(/\{\{POWER_USER_RATIONALE\}\}/g, 'I can triage from the proposal')
    .replace(/\{\{ADMIN_STORY\}\}/g, 'bug changes have readiness draft')
    .replace(/\{\{ADMIN_RATIONALE\}\}/g, 'I can review before work starts')
    .replace(/\{\{PAYER_STORY\}\}/g, 'bugs are not lost')
    .replace(/\{\{PAYER_RATIONALE\}\}/g, 'quality improves over time');

  // Build tasks.md from template
  const tasksTemplate = readFileSync(join(templatesDir, 'tasks.md.template'), 'utf8');
  const tasksContent = tasksTemplate
    .replace(/\{\{CHANGE_NAME\}\}/g, bugId)
    .replace(/\{\{DATE\}\}/g, dateStr)
    .replace(/\{\{AUTHOR\}\}/g, 'hermes-drain')
    .replace(/\{\{TASKS_OVERVIEW\}\}/g,
      `Bug fix for failed task \`${task.id}\`: ${task.title}\n\n` +
      `Last failure:\n\`\`\`\n${failureText}\n\`\`\``)
    .replace(/\{\{PREREQUISITE_1\}\}/g, 'Proposal is reviewed')
    .replace(/\{\{PREREQUISITE_2\}\}/g, 'Design is approved')
    .replace(/\{\{STREAM_1_NAME\}\}/g, 'Bug fix')
    .replace(/\{\{STREAM_1_AGENT\}\}/g, task.agent || 'sdlc-developer')
    .replace(/\{\{STREAM_1_TASK_IDS\}\}/g, task.id)
    .replace(/\{\{STREAM_1_PARALLEL\}\}/g, 'none')
    .replace(/\{\{STREAM_2_NAME\}\}/g, '')
    .replace(/\{\{STREAM_2_AGENT\}\}/g, '')
    .replace(/\{\{STREAM_2_TASK_IDS\}\}/g, '')
    .replace(/\{\{STREAM_2_PARALLEL\}\}/g, '')
    .replace(/\{\{STREAM_3_NAME\}\}/g, '')
    .replace(/\{\{STREAM_3_AGENT\}\}/g, '')
    .replace(/\{\{STREAM_3_TASK_IDS\}\}/g, '')
    .replace(/\{\{STREAM_3_PARALLEL\}\}/g, '')
    .replace(/\{\{PHASE_1_NAME\}\}/g, 'Bug fix')
    .replace(/\{\{TASK_1_ID\}\}/g, task.id)
    .replace(/\{\{TASK_1_DESCRIPTION\}\}/g, `Fix: ${task.title}`)
    .replace(/\{\{TASK_1_FILES\}\}/g, 'TBD')
    .replace(/\{\{TASK_1_REQ_REF\}\}/g, 'BUG')
    .replace(/\{\{TASK_1_AGENT\}\}/g, task.agent || 'sdlc-developer')
    .replace(/\{\{YES_NO_OR_BLOCKED_BY_TASK_ID\}\}/g, 'yes')
    .replace(/\{\{S_M_L_XL\}\}/g, 'S')
    .replace(/\{\{TASK_1_NOTES\}\}/g, 'Bug fix scaffolded from drain failure')
    .replace(/\{\{TASK_2_ID\}\}/g, '')
    .replace(/\{\{TASK_2_DESCRIPTION\}\}/g, '')
    .replace(/\{\{TASK_2_FILES\}\}/g, '')
    .replace(/\{\{TASK_2_REQ_REF\}\}/g, '')
    .replace(/\{\{TASK_2_AGENT\}\}/g, '')
    .replace(/\{\{TASK_3_ID\}\}/g, '')
    .replace(/\{\{TASK_3_DESCRIPTION\}\}/g, '')
    .replace(/\{\{TASK_3_FILES\}\}/g, '')
    .replace(/\{\{TASK_3_REQ_REF\}\}/g, '')
    .replace(/\{\{TASK_3_AGENT\}\}/g, '')
    .replace(/\{\{TASK_4_ID\}\}/g, '')
    .replace(/\{\{TASK_4_DESCRIPTION\}\}/g, '')
    .replace(/\{\{TASK_4_FILES\}\}/g, '')
    .replace(/\{\{TASK_4_REQ_REF\}\}/g, '')
    .replace(/\{\{TASK_4_AGENT\}\}/g, '')
    .replace(/\{\{TASK_5_ID\}\}/g, '')
    .replace(/\{\{UNIT_TEST_SUBJECT\}\}/g, '')
    .replace(/\{\{UNIT_TEST_FILES\}\}/g, '')
    .replace(/\{\{UNIT_TEST_REQS\}\}/g, '')
    .replace(/\{\{TASK_5_AGENT\}\}/g, '')
    .replace(/\{\{TASK_6_ID\}\}/g, '')
    .replace(/\{\{INTEGRATION_TEST_SUBJECT\}\}/g, '')
    .replace(/\{\{INTEGRATION_TEST_FILES\}\}/g, '')
    .replace(/\{\{INTEGRATION_TEST_REQS\}\}/g, '')
    .replace(/\{\{TASK_6_AGENT\}\}/g, '')
    .replace(/\{\{TASK_7_ID\}\}/g, '')
    .replace(/\{\{TEST_CMD\}\}/g, 'npm test')
    .replace(/\{\{TASK_8_ID\}\}/g, '')
    .replace(/\{\{DOCS_FILES\}\}/g, '')
    .replace(/\{\{TASK_9_ID\}\}/g, '')
    .replace(/\{\{ADDITIONAL_NOTES\}\}/g, `Scaffolded from drain failure of task ${task.id}`);

  // Build status.json from template
  const statusTemplate = readFileSync(join(templatesDir, 'status.json.template'), 'utf8');
  const statusContent = statusTemplate
    .replace(/\{\{DATE\}\}/g, dateStr);

  // Parse and set readiness to draft
  const statusObj = JSON.parse(statusContent);
  statusObj.readiness = 'draft';
  statusObj.phase = 'proposal';
  const finalStatusJson = JSON.stringify(statusObj, null, 2) + '\n';

  // Write files idempotently
  const outputs = [
    { path: join(bugDir, 'proposal.md'), content: proposalContent },
    { path: join(bugDir, 'tasks.md'), content: tasksContent },
    { path: join(bugDir, 'status.json'), content: finalStatusJson },
  ];

  for (const out of outputs) {
    if (existsSync(out.path)) {
      const existing = readFileSync(out.path, 'utf8');
      if (existing === out.content) continue;
    }
    writeFileSync(out.path, out.content);
  }

  return resolve(bugDir);
}

// ---------------------------------------------------------------------------
// CLI guard
// ---------------------------------------------------------------------------

function __isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === __filename;
}

if (__isMainModule()) {
  const subcommand = process.argv[2];

  if (subcommand === 'report-error') {
    // ------------------------------------------------------------------
    // report-error subcommand: read JSONL from stdin, dedup, write tasks
    // ------------------------------------------------------------------
    const dryRun = process.argv.slice(3).includes('--dry-run');
    const config = loadConfig();

    if (!dryRun) {
      mkdirSync(config.tasksDir, { recursive: true });
    }

    // Read all stdin
    const chunks = [];
    const stdinBuffer = process.stdin;

    // node: stdin — we read synchronously. Since stdin may not have
    // an EOF in a terminal, this is intended for piped input only.
    let buf;
    while ((buf = stdinBuffer.read()) !== null) {
      chunks.push(buf);
    }
    const input = chunks.join('');
    const lines = input.split('\n');

    const { tasks, totalEvents, uniqueCount } = ingestErrors(lines, {
      tasksDir: config.tasksDir,
      dryRun,
    });

    if (dryRun) {
      console.log(`DRY RUN — would create/update ${uniqueCount} task(s) from ${totalEvents} event(s)\n`);
      for (const task of tasks) {
        console.log(`  [${task.id}] ${task.title}`);
        console.log(`      Priority: ${task.priority}, Occurrences: ${task.occurrences}`);
        console.log('');
      }
    } else {
      console.log(`Ingested ${totalEvents} error event(s) → ${uniqueCount} unique task(s) in ${config.tasksDir}`);
      for (const task of tasks) {
        console.log(`  ✅ ${task.id}: ${task.priority} priority, ${task.occurrences} occurrence(s)`);
      }
    }
  } else {
    // ------------------------------------------------------------------
    // Original seed-queue logic
    // ------------------------------------------------------------------

    const cliArgs = parseArgs();
    const config = loadConfig();
    const templatePath = findTemplate(config, cliArgs.template);

    console.log(`Loading template: ${templatePath}`);

    const { tasks, variables } = loadTemplate(templatePath, cliArgs.vars);

    if (Object.keys(variables).length > 0) {
      console.log('Variables:');
      for (const [key, val] of Object.entries(variables)) {
        console.log(`  {{${key}}} = ${val}`);
      }
      console.log('');
    }

    if (cliArgs.dryRun) {
      console.log(`DRY RUN — would seed ${tasks.length} tasks to ${config.tasksDir}\n`);
    } else {
      mkdirSync(config.tasksDir, { recursive: true });
    }

    // Write each task as a JSON file
    for (const task of tasks) {
      const filename = `${task.id}.json`;

      // CV-204: Screen external-origin tasks for prompt injection before writing
      const EXTERNAL_ORIGINS = ['inbox', 'mailbox', 'issue', 'error'];
      if (EXTERNAL_ORIGINS.includes(task.origin)) {
        const textToScreen = (task.title || '') + '\n' + (task.description || '');
        const { safe } = screenExternalInput(textToScreen);
        if (!safe) {
          console.log(`  [BLOCKED] ${filename}: ${task.title} (injection screen blocked — origin: ${task.origin})`);
          const humanTask = {
            id: `injection-${task.id}`,
            title: `Injection blocked: ${task.title}`,
            description: `Task from origin "${task.origin}" was blocked by the injection screen.\n\nOriginal task:\n${task.title}\n${task.description || ''}`,
            urgency: 'HIGH',
          };
          try { notifyHumanTask(humanTask); } catch { /* notification is best-effort */ }
          continue;
        }
      }

      const taskData = {
        ...task,
        status: task.status || 'pending',
        created_at: new Date().toISOString(),
      };

      if (cliArgs.dryRun) {
        console.log(`  [DRY] ${filename}: ${task.title} (${task.assignee}, ${task.priority || 'MEDIUM'})`);
      } else {
        writeFileSync(join(config.tasksDir, filename), JSON.stringify(taskData, null, 2));
      }
    }

    console.log(`\n${cliArgs.dryRun ? 'Would seed' : 'Seeded'} ${tasks.length} tasks to ${config.tasksDir}`);

    // Show summary by assignee
    const byAgent = {};
    for (const task of tasks) {
      byAgent[task.assignee] = (byAgent[task.assignee] || 0) + 1;
    }
    console.log('\nTasks by agent:');
    for (const [agent, count] of Object.entries(byAgent)) {
      console.log(`  ${agent}: ${count} tasks`);
    }

    // Show parallelization opportunities
    const unblocked = tasks.filter(t => !t.blockedBy || t.blockedBy.length === 0);
    console.log(`\nUnblocked tasks (can start immediately): ${unblocked.length}`);
    for (const t of unblocked) {
      console.log(`  [${t.id}] ${t.title} → ${t.assignee}`);
    }
  }
}