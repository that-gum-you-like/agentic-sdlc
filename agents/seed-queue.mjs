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
 * Template format: see agents/templates/seed-tasks.json.template
 *
 * The script reads tasks from the template, substitutes {{VARIABLE}} placeholders
 * with values from the template's "variables" section (overridable via --var flags),
 * and writes individual task JSON files to the task queue directory.
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './load-config.mjs';

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
// Main
// ---------------------------------------------------------------------------

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
