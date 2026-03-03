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

import { loadConfig } from './load-config.mjs';

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

function generatePrompt(agentName, task, agentMd, memories) {
  const memorySection = Object.entries(memories)
    .map(([layer, data]) => `### ${layer}.json\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``)
    .join('\n\n');

  return `You are ${agentName}. Read and follow your agent instructions below.

## Agent System Prompt
${agentMd}

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

## Rules
- Do NOT ask for permission — just execute
- Do NOT stop to confirm — keep going
- Small files, small commits
- Every commit must include tests
`;
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
