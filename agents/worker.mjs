#!/usr/bin/env node
/**
 * Autonomous Worker Launcher
 *
 * Loads an agent's system prompt and memory, assigns a task, and prints
 * the full prompt needed to launch a Claude subagent in the micro cycle.
 *
 * Usage:
 *   node agents/worker.mjs --agent <agent-name> --task T-006
 *   node agents/worker.mjs --agent <agent-name> --task T-008
 *
 * This script does NOT launch Claude directly — it generates the prompt
 * that the orchestrator (Claude Code main session) uses with the Task tool.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Canonical capability list (task 2.2)
const CANONICAL_CAPABILITIES = [
  'memoryRecall',
  'memoryRecord',
  'semanticSearch',
  'defeatTests',
  'schemaValidation',
  'browserE2E',
  'openclawBrowser',
  'openclawNotify',
  'costTracking',
  'learningRecord',
  'cadenceTiming',
  'checklistReview',
  'humanTaskCreate',
  'patternHunt',
  'permissionCompliance',
];

import { loadConfig } from './load-config.mjs';
import { computeEfficiencyMetrics } from './cost-tracker.mjs';

let semanticSearch = null;
try {
  const si = await import('./semantic-index.mjs');
  semanticSearch = si.search;
} catch {
  // semantic-index not available — fall back to full recall
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = loadConfig();
const TASKS_DIR = config.tasksDir;
const AGENTS_DIR = config.agentsDir;

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    result[key] = args[i + 1];
  }
  return result;
}

function loadFile(path) {
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf8');
}

function loadCapabilitiesConfig() {
  const capPath = resolve(AGENTS_DIR, 'capabilities.json');
  if (!existsSync(capPath)) return null;
  try {
    return JSON.parse(readFileSync(capPath, 'utf8'));
  } catch {
    return null;
  }
}

function generateCapabilityChecklistSection(agentName) {
  const capConfig = loadCapabilitiesConfig();
  const agentCaps = capConfig?.[agentName];

  const required = agentCaps?.required || [];
  const conditional = agentCaps?.conditional || {};
  const notExpected = agentCaps?.notExpected || [];

  // Build the template JSON for the agent to fill in
  const template = {};
  for (const cap of CANONICAL_CAPABILITIES) {
    if (notExpected.includes(cap)) continue; // skip notExpected from template
    const isRequired = required.includes(cap);
    const condReason = conditional[cap];
    if (isRequired) {
      template[cap] = { used: true };
    } else if (condReason) {
      template[cap] = { used: false, skipReason: `(conditional: ${condReason})` };
    } else {
      template[cap] = { used: false, skipReason: '(not applicable to this task)' };
    }
  }

  const requiredList = required.length > 0 ? `Required (must use every task): ${required.join(', ')}` : 'No required capabilities configured';
  const conditionalList = Object.keys(conditional).length > 0
    ? Object.entries(conditional).map(([k, v]) => `  - ${k}: ${v}`).join('\n')
    : '  (none)';
  const notExpectedList = notExpected.length > 0 ? `NOT expected (do not use): ${notExpected.join(', ')}` : '';

  return `
## Capability Checklist (Required Output)

At the end of your task, you MUST output a \`<!-- CAPABILITY_CHECKLIST -->\` JSON block. This is non-negotiable — it is how the system tracks capability usage and detects drift.

**Your capabilities for this task:**
${requiredList}
Conditional (use when condition applies):
${conditionalList}
${notExpectedList ? notExpectedList + '\n' : ''}
For each capability you did NOT use, provide a \`skipReason\` explaining why.

Output this block as the FINAL thing in your response, after all code changes:

\`\`\`
<!-- CAPABILITY_CHECKLIST -->
${JSON.stringify({
    taskId: '(fill in task id)',
    agent: agentName,
    timestamp: '(fill in ISO timestamp)',
    capabilities: template,
  }, null, 2)}
<!-- /CAPABILITY_CHECKLIST -->
\`\`\`
`;
}

function loadMemory(agentName) {
  const memDir = resolve(AGENTS_DIR, agentName, 'memory');
  const memories = {};

  for (const layer of ['core', 'long-term', 'medium-term', 'recent']) {
    const path = resolve(memDir, `${layer}.json`);
    if (existsSync(path)) {
      memories[layer] = JSON.parse(readFileSync(path, 'utf8'));
    }
  }

  return memories;
}

const PERMISSION_CONSTRAINTS = {
  'read-only': 'PERMISSION TIER: read-only. You MUST NOT write files, create files, run destructive commands, or modify any state. Your role is analysis and review only.',
  'edit-gated': 'PERMISSION TIER: edit-gated. You may read and propose edits, but you MUST NOT commit without review approval.',
  'full-edit': 'PERMISSION TIER: full-edit. You may read, write, run tests, and commit. You MUST NOT trigger deploy pipelines.',
  'deploy': 'PERMISSION TIER: deploy. Full access including deploy pipeline triggers.',
};

function getPermissionConstraint(agentName) {
  const tier = config.agentConfigs?.[agentName]?.permissions || 'full-edit';
  return PERMISSION_CONSTRAINTS[tier] || PERMISSION_CONSTRAINTS['full-edit'];
}

function getCadenceGuidance(agentName) {
  const cadence = config.cadence;
  if (!cadence?.agentOffsets || !(agentName in cadence.agentOffsets)) return '';

  const offset = cadence.agentOffsets[agentName];
  const window = cadence.commitWindowMinutes || 15;
  const times = [];
  for (let t = offset; t < 60; t += window) {
    times.push(`:${String(t).padStart(2, '0')}`);
  }

  return `\n## Commit Cadence\nPreferred commit times: ${times.join(', ')}. If you finish between windows, prepare your commit and wait for the next window to minimize merge conflicts with other agents.\n`;
}

function generateInstanceSection(task) {
  // 9.4: Inject instance awareness when the task has an instanceId
  if (!task.instanceId || task.instanceId === task.assignee) return '';

  const instanceId = task.instanceId;
  const baseAgent = task.assignee;
  // Parse instance number and infer total (we know at least this instance exists)
  const match = instanceId.match(/-(\d+)$/);
  const instanceNum = match ? parseInt(match[1], 10) : 1;

  // Collect sibling tasks (in-progress tasks for the same base agent)
  // We read them from the task object metadata if available, otherwise note generically
  const siblingsNote = task.siblingTasks
    ? `Other active instances:\n${task.siblingTasks.map(s => `  - ${s.instanceId}: task ${s.taskId} (files: ${(s.files || []).join(', ') || 'none'})`).join('\n')}`
    : `Other instances of ${baseAgent} may be running concurrently.`;

  const avoidFiles = task.filesToAvoid
    ? `\nFiles claimed by other instances (DO NOT TOUCH):\n${task.filesToAvoid.map(f => `  - ${f}`).join('\n')}`
    : '';

  return `\n## Instance Awareness
You are running as instance **${instanceId}** (instance ${instanceNum} of agent ${baseAgent}).
${siblingsNote}${avoidFiles}
**Important:** Only modify the files listed in your task. Do NOT touch files owned by other instances.
`;
}

function generatePrompt(agentName, task, agentMd, memories) {
  // 4.5: Use semantic search when available to inject only relevant memory entries.
  // Fall back to full recall (full memories object) if semantic search unavailable.
  let memorySection;
  let semanticSearchUsed = false;
  try {
    if (semanticSearch) {
      const query = `${task.title} ${task.description || ''}`.trim();
      const results = semanticSearch(agentName, query, 10);
      if (results && results.length > 0) {
        // Group results by layer for display
        const byLayer = {};
        for (const r of results) {
          if (!byLayer[r.layer]) byLayer[r.layer] = [];
          byLayer[r.layer].push(r.content);
        }
        const sections = Object.entries(byLayer).map(([layer, entries]) =>
          `### ${layer} (semantic — top relevant entries)\n${entries.map(e => `- ${e}`).join('\n')}`
        );
        memorySection = sections.join('\n\n');
        semanticSearchUsed = true;
      }
    }
  } catch {
    // semantic search failed — fall through to full recall
  }

  if (!semanticSearchUsed) {
    memorySection = Object.entries(memories)
      .map(([layer, data]) => `### ${layer}.json\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``)
      .join('\n\n');
  }

  const permissionConstraint = getPermissionConstraint(agentName);
  const cadenceGuidance = getCadenceGuidance(agentName);
  const instanceSection = generateInstanceSection(task);
  const capabilitySection = generateCapabilityChecklistSection(agentName);

  let efficiencySummary = '';
  try {
    const eff = computeEfficiencyMetrics(agentName);
    const avgK = (eff.avgTokensPerTask / 1000).toFixed(1);
    const fsr = Math.round(eff.firstAttemptSuccessRate);
    const vsType = Math.round(eff.comparedToTypeAvg * 100);
    efficiencySummary = `\n## Your Recent Efficiency\nYour recent efficiency: ${avgK}K tokens/task avg, ${fsr}% first-attempt success, ${vsType}% vs type average\n`;
  } catch {
    // cost data unavailable — skip efficiency section
  }

  return `You are ${agentName}. Read and follow your agent instructions below.

## Agent System Prompt
${agentMd}

## Permission Constraints
${permissionConstraint}
${instanceSection}${efficiencySummary}
## Your Memory
${memorySection}

## Current Task: ${task.id}
**Title:** ${task.title}
**Description:** ${task.description}
${task.files ? `**Files:** ${task.files.join(', ')}` : ''}
${task.acceptance_criteria ? `**Acceptance Criteria:**\n${task.acceptance_criteria.map(c => `- ${c}`).join('\n')}` : ''}

## Micro Cycle — Execute This Loop
1. Implement the code changes for this task
2. Write tests covering happy path + at least one error case
3. Run tests: \`cd ${config.appPath} && source ~/.nvm/nvm.sh && npm test\`
4. If tests pass → stage and commit with descriptive message
5. If tests fail → fix and re-run (max 3 attempts, then report as blocked)
6. Mark the task as completed: \`node agents/queue-drainer.mjs complete ${task.id} passing\`
7. Record what you learned: \`node agents/memory-manager.mjs record ${agentName} recent "<what you learned>"\`

${cadenceGuidance}## When You Hit an Unresolvable Blocker
If you encounter a blocker that only a human can resolve (missing credentials, a design decision, content you cannot create, external access needed), create a human task file in \`tasks/human-queue/\` using this template:

\`\`\`json
{
  "id": "HTASK-<NNN>",
  "title": "<Short one-line description of what the human needs to do>",
  "description": "<Full context: what you were doing, what is missing, and exactly what the human must provide or decide>",
  "requester": "${agentName}",
  "urgency": "blocker",
  "unblocks": ["${task.id}"],
  "status": "pending",
  "createdAt": "<ISO 8601 timestamp>",
  "completedAt": null
}
\`\`\`

Then reset the current task and set its status to blocked:
1. \`node agents/queue-drainer.mjs reset ${task.id}\`
2. Edit \`tasks/queue/${task.id}.json\` — set \`"status": "blocked"\`

Do NOT fabricate credentials, make irreversible design choices on behalf of the user, or loop indefinitely.

## Rules
- Do NOT ask for permission — just execute
- Do NOT stop to confirm — keep going
- Small files, small commits
- Every commit must include tests
${capabilitySection}`;
}

// Main
const { agent, task: taskId } = parseArgs();

if (!agent || !taskId) {
  console.log(`Usage: node agents/worker.mjs --agent <agent-name> --task <task-id>

Agents: (as defined in your project's agents/ directory)
Tasks: T-001, T-002, etc.`);
  process.exit(1);
}

// Load agent system prompt
const agentMdPath = resolve(AGENTS_DIR, agent, 'AGENT.md');
const agentMd = loadFile(agentMdPath);
if (!agentMd) {
  console.error(`Agent not found: ${agent} (looked for ${agentMdPath})`);
  process.exit(1);
}

// Load task
const taskPath = resolve(TASKS_DIR, `${taskId}.json`);
const taskContent = loadFile(taskPath);
if (!taskContent) {
  console.error(`Task not found: ${taskId} (looked for ${taskPath})`);
  process.exit(1);
}
const task = JSON.parse(taskContent);

// Load memories
const memories = loadMemory(agent);

// Generate and output the prompt
const prompt = generatePrompt(agent, task, agentMd, memories);

console.log('═'.repeat(60));
console.log(`Worker Prompt for ${agent} on ${taskId}`);
console.log('═'.repeat(60));
console.log(prompt);
console.log('═'.repeat(60));
console.log(`\nTo launch this agent, use the Task tool with:`);
console.log(`  subagent_type: "general-purpose"`);
console.log(`  model: "sonnet"`);
console.log(`  prompt: <the above prompt>`);
