/**
 * Shared config loader for the multi-agent SDLC system.
 *
 * Searches for project.json in multiple locations to support
 * running scripts from the external SDLC repo against any project.
 *
 * Search order:
 *   1. --project-dir CLI argument
 *   2. SDLC_PROJECT_DIR environment variable
 *   3. Current working directory + agents/project.json
 *   4. Walk up parent directories until agents/project.json found
 *   5. Fallback to generic defaults
 *
 * Usage:
 *   import { loadConfig } from './load-config.mjs';
 *   const config = loadConfig();
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Generic defaults (no project-specific values)
const DEFAULTS = {
  name: 'Untitled Project',
  projectDir: process.cwd(),
  appDir: '.',
  testCmd: 'npm test',
  agents: [],
  matrixDomain: 'localhost',
  matrixServer: 'http://127.0.0.1:6167',
  credentialsPath: '',
};

let _cached = null;

/**
 * Find project.json by searching multiple locations.
 * Returns the parsed config or null if not found.
 */
function findProjectConfig() {
  // 1. --project-dir CLI argument
  const projectDirIdx = process.argv.indexOf('--project-dir');
  if (projectDirIdx !== -1 && process.argv[projectDirIdx + 1]) {
    const configPath = resolve(process.argv[projectDirIdx + 1], 'agents/project.json');
    if (existsSync(configPath)) {
      return { config: JSON.parse(readFileSync(configPath, 'utf8')), projectDir: resolve(process.argv[projectDirIdx + 1]) };
    }
  }

  // 2. SDLC_PROJECT_DIR environment variable
  if (process.env.SDLC_PROJECT_DIR) {
    const configPath = resolve(process.env.SDLC_PROJECT_DIR, 'agents/project.json');
    if (existsSync(configPath)) {
      return { config: JSON.parse(readFileSync(configPath, 'utf8')), projectDir: resolve(process.env.SDLC_PROJECT_DIR) };
    }
  }

  // 3. Current working directory
  const cwdConfig = resolve(process.cwd(), 'agents/project.json');
  if (existsSync(cwdConfig)) {
    return { config: JSON.parse(readFileSync(cwdConfig, 'utf8')), projectDir: process.cwd() };
  }

  // 4. Walk up parent directories
  let dir = process.cwd();
  const root = resolve('/');
  while (dir !== root) {
    const candidate = join(dir, 'agents/project.json');
    if (existsSync(candidate)) {
      return { config: JSON.parse(readFileSync(candidate, 'utf8')), projectDir: dir };
    }
    dir = dirname(dir);
  }

  // 5. No project found — return null
  return null;
}

export function loadConfig() {
  if (_cached) return _cached;

  const found = findProjectConfig();
  let raw;
  let projectAgentsDir;

  if (found) {
    raw = { ...DEFAULTS, ...found.config, projectDir: found.projectDir };
    projectAgentsDir = resolve(found.projectDir, 'agents');
  } else {
    raw = { ...DEFAULTS };
    projectAgentsDir = resolve(raw.projectDir, 'agents');
  }

  _cached = {
    name: raw.name,
    projectDir: resolve(raw.projectDir),
    appDir: raw.appDir,
    appPath: resolve(raw.projectDir, raw.appDir),
    testCmd: raw.testCmd,
    agents: raw.agents,
    // Scripts live in the SDLC repo
    sdlcDir: resolve(__dirname, '..'),
    scriptsDir: __dirname,
    // Project-specific agent data lives in the project
    agentsDir: projectAgentsDir,
    tasksDir: resolve(raw.projectDir, 'tasks/queue'),
    completedDir: resolve(raw.projectDir, 'tasks/completed'),
    budgetPath: resolve(projectAgentsDir, 'budget.json'),
    costLogPath: resolve(projectAgentsDir, 'cost-log.json'),
    matrixDomain: raw.matrixDomain,
    matrixServer: raw.matrixServer,
    credentialsPath: raw.credentialsPath ? resolve(raw.credentialsPath) : '',
    dashboardPath: resolve(raw.projectDir, 'pm/DASHBOARD.md'),
    // Notification & approval layer
    notification: {
      provider: raw.notification?.provider || 'none',
      channel: raw.notification?.channel || '',
      mailboxPath: resolve(raw.projectDir, raw.notification?.mailboxPath || 'pm/mailbox.md'),
      mediaDir: resolve(raw.projectDir, raw.notification?.mediaDir || 'pm/media'),
      approvalsDir: resolve(raw.projectDir, 'pm/approvals'),
      triggers: raw.notification?.triggers || {},
    },
  };

  return _cached;
}
