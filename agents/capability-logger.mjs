#!/usr/bin/env node
/**
 * Capability Logger — System-level instrumentation for capability usage tracking.
 *
 * Appends one JSONL line per capability invocation to pm/capability-log.jsonl.
 * This is the PRIMARY source of truth for capability monitoring — agents cannot
 * skip or fake this because the script itself writes the log as a side effect
 * of running.
 *
 * Usage (from other scripts):
 *   import { logCapabilityUsage } from './capability-logger.mjs';
 *   logCapabilityUsage('memoryRecall', 'roy', 'T-015', 'memory-manager.mjs', 'recall');
 *
 * Log format (pm/capability-log.jsonl):
 *   {"timestamp":"...","capability":"...","agent":"...","taskId":"...","script":"...","command":"..."}
 */

import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { loadConfig } from './load-config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Append one JSONL line to pm/capability-log.jsonl.
 *
 * @param {string} capability - Capability key (e.g. "memoryRecall", "defeatTests")
 * @param {string} agent      - Agent name (e.g. "roy") or "system" if not determinable
 * @param {string} taskId     - Task ID (e.g. "T-015") or "unknown" if not available
 * @param {string} script     - Script filename (e.g. "memory-manager.mjs")
 * @param {string} command    - Command or operation (e.g. "recall", "record")
 */
export function logCapabilityUsage(capability, agent, taskId, script, command) {
  const config = loadConfig();
  const pmDir = resolve(config.projectDir, 'pm');

  if (!existsSync(pmDir)) {
    mkdirSync(pmDir, { recursive: true });
  }

  const logPath = resolve(pmDir, 'capability-log.jsonl');

  const entry = {
    timestamp: new Date().toISOString(),
    capability: String(capability),
    agent: String(agent || 'system'),
    taskId: String(taskId || 'unknown'),
    script: String(script),
    command: String(command),
  };

  appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
}
