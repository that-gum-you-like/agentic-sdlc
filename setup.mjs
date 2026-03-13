#!/usr/bin/env node
/**
 * Agentic SDLC — Interactive Bootstrap Script
 *
 * Sets up a new project for the Agentic SDLC framework.
 * Creates all necessary directories, config files, agent templates,
 * and skills in your project.
 *
 * Usage:
 *   node ~/agentic-sdlc/setup.mjs              # Interactive mode
 *   node ~/agentic-sdlc/setup.mjs --dir /path   # Specify project directory
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync, readdirSync, appendFileSync } from 'fs';
import { resolve, dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SDLC_DIR = __dirname;

// ---------------------------------------------------------------------------
// Readline helper
// ---------------------------------------------------------------------------

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question, defaultValue = '') {
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  return new Promise((resolve) => {
    rl.question(`  ${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

// ---------------------------------------------------------------------------
// Template processing
// ---------------------------------------------------------------------------

function readTemplate(templatePath) {
  return readFileSync(resolve(SDLC_DIR, templatePath), 'utf8');
}

function fillTemplate(content, vars) {
  let result = content;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    console.log(`  📁 Created ${dir}`);
  }
}

function writeIfNotExists(filePath, content, description) {
  if (existsSync(filePath)) {
    console.log(`  ⏭️  ${description} already exists, skipping`);
    return false;
  }
  writeFileSync(filePath, content);
  console.log(`  ✅ Created ${description}`);
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('');
  console.log('═'.repeat(50));
  console.log('  Agentic SDLC — Project Bootstrap');
  console.log('═'.repeat(50));
  console.log('');

  // Determine project directory
  const dirIdx = process.argv.indexOf('--dir');
  let projectDir = dirIdx !== -1 ? resolve(process.argv[dirIdx + 1]) : process.cwd();

  console.log(`  Project directory: ${projectDir}`);
  console.log('');

  // 1. Gather project info
  console.log('📋 Project Configuration');
  console.log('─'.repeat(40));

  const projectName = await ask('Project name', basename(projectDir));
  const appDir = await ask('App subdirectory (or "." for root)', '.');
  const testCmd = await ask('Test command', 'npm test');

  // 2. Gather agent info
  console.log('');
  console.log('👥 Agent Configuration');
  console.log('─'.repeat(40));
  console.log('  Define your agent roster. Enter agent names comma-separated.');
  console.log('  Example: backend,frontend,reviewer');
  console.log('');

  const agentInput = await ask('Agent names (comma-separated)', '');
  const agents = agentInput
    ? agentInput.split(',').map(a => a.trim().toLowerCase()).filter(Boolean)
    : [];

  // Gather roles for each agent
  const agentRoles = {};
  const agentDomains = {};

  for (const agent of agents) {
    const role = await ask(`  Role for "${agent}"`, 'Developer');
    agentRoles[agent] = role;

    const patterns = await ask(`  File patterns for "${agent}" (comma-separated)`, '');
    agentDomains[agent] = {
      name: agent.charAt(0).toUpperCase() + agent.slice(1),
      role,
      patterns: patterns ? patterns.split(',').map(p => p.trim()).filter(Boolean) : [],
    };
  }

  // Model tiers
  let modelConfig = {};
  if (agents.length > 0) {
    console.log('');
    console.log('  Agent budget tiers:');
    console.log('    Core agents get more tokens (sonnet model)');
    console.log('    Support agents get fewer tokens (haiku model)');
    console.log('');

    const coreInput = await ask('Core agents (comma-separated)', agents.slice(0, 3).join(','));
    const coreAgents = new Set(coreInput.split(',').map(a => a.trim().toLowerCase()));

    for (const agent of agents) {
      const isCore = coreAgents.has(agent);
      modelConfig[agent] = {
        dailyTokens: isCore ? 100000 : 50000,
        model: isCore ? 'sonnet' : 'haiku',
      };
    }
  }

  // Matrix config (optional)
  console.log('');
  const matrixDomain = await ask('Matrix domain (or leave blank to skip)', '');

  console.log('');
  console.log('📡 Notification Configuration');
  console.log('─'.repeat(40));
  const notifProvider = await ask('Notification provider (openclaw/file/none)', 'none');
  let notifChannel = '';
  if (notifProvider === 'openclaw') {
    notifChannel = await ask('WhatsApp number (e.g., +1XXXXXXXXXX)', '');
  }

  console.log('');
  console.log('═'.repeat(50));
  console.log('  Creating project structure...');
  console.log('═'.repeat(50));
  console.log('');

  // 3. Create directories
  const agentsDir = join(projectDir, 'agents');
  ensureDir(agentsDir);
  ensureDir(join(projectDir, 'tasks/queue'));
  ensureDir(join(projectDir, 'tasks/completed'));
  ensureDir(join(projectDir, 'openspec/changes'));
  ensureDir(join(projectDir, 'openspec/specs'));
  ensureDir(join(projectDir, 'pm'));

  // 4. Create project.json
  const projectJson = {
    name: projectName,
    projectDir: projectDir,
    appDir: appDir,
    testCmd: testCmd,
    agents: agents,
    matrixDomain: matrixDomain || 'localhost',
    matrixServer: 'http://127.0.0.1:6167',
    credentialsPath: '',
    notification: {
      provider: notifProvider,
      channel: notifChannel,
      mailboxPath: 'pm/mailbox.md',
      mediaDir: 'pm/media',
      triggers: {
        blocker: true,
        budgetAlert: true,
        deployComplete: notifProvider !== 'none',
        highSeverityFailure: true,
        dailySummary: notifProvider !== 'none',
        approvalTimeout: true,
        capabilityDrift: true,
      },
    },
    humanWellness: {
      enabled: false,
      dailyMaxHours: 10,
      nightCutoff: '23:00',
      breakIntervalHours: 3,
    },
    capabilityMonitoring: {
      enabled: true,
      driftThreshold: 3,
      windowSize: 10,
    },
  };
  writeIfNotExists(
    join(agentsDir, 'project.json'),
    JSON.stringify(projectJson, null, 2),
    'agents/project.json'
  );

  // 5. Create budget.json
  const budgetJson = {
    conservationMode: false,
    agents: Object.fromEntries(
      Object.entries(modelConfig).map(([agent, cfg]) => [
        agent,
        { ...cfg, maxInstances: 1 },
      ])
    ),
  };
  writeIfNotExists(
    join(agentsDir, 'budget.json'),
    JSON.stringify(budgetJson, null, 2),
    'agents/budget.json'
  );

  // 6. Create domains.json
  if (Object.keys(agentDomains).length > 0) {
    writeIfNotExists(
      join(agentsDir, 'domains.json'),
      JSON.stringify(agentDomains, null, 2),
      'agents/domains.json'
    );
  }

  // 7. Create agent directories with templates
  const today = new Date().toISOString().split('T')[0];

  for (const agent of agents) {
    const agentDir = join(agentsDir, agent);
    const memoryDir = join(agentDir, 'memory');
    ensureDir(agentDir);
    ensureDir(memoryDir);

    // AGENT.md from template
    const agentMdTemplate = readTemplate('agents/templates/AGENT.md.template');
    const agentMd = fillTemplate(agentMdTemplate, {
      NAME: agentDomains[agent]?.name || agent,
      ROLE: agentRoles[agent] || 'Developer',
      RESPONSIBILITIES: `Responsible for ${agentRoles[agent] || 'development'} tasks in ${projectName}.`,
      CODEBASE_STATE: `New project. Agent initialized on ${today}.`,
    });
    writeIfNotExists(join(agentDir, 'AGENT.md'), agentMd, `agents/${agent}/AGENT.md`);

    // Core memory from template
    const coreTemplate = readTemplate('agents/templates/core.json.template');
    const coreJson = fillTemplate(coreTemplate, {
      NAME: agentDomains[agent]?.name || agent,
      ROLE: agentRoles[agent] || 'Developer',
    });
    writeIfNotExists(join(memoryDir, 'core.json'), coreJson, `agents/${agent}/memory/core.json`);

    // Empty memory layers
    const emptyMemory = JSON.stringify({ entries: [] }, null, 2);
    for (const layer of ['long-term', 'medium-term', 'recent', 'compost']) {
      writeIfNotExists(join(memoryDir, `${layer}.json`), emptyMemory, `agents/${agent}/memory/${layer}.json`);
    }
  }

  // 7b. Create capabilities.json from template
  const capTemplateSource = join(SDLC_DIR, 'agents/templates/capabilities.json.template');
  if (existsSync(capTemplateSource) && agents.length > 0) {
    try {
      const capTemplate = JSON.parse(readFileSync(capTemplateSource, 'utf8'));
      const capabilities = {};
      for (const agent of agents) {
        const role = (agentRoles[agent] || '').toLowerCase();
        // Map role keywords to archetype
        let archetype = 'backend'; // default
        if (role.includes('frontend') || role.includes('ui')) archetype = 'frontend';
        else if (role.includes('review')) archetype = 'reviewer';
        else if (role.includes('release') || role.includes('deploy')) archetype = 'release';
        capabilities[agent] = capTemplate[archetype] || capTemplate.backend;
      }
      writeIfNotExists(
        join(agentsDir, 'capabilities.json'),
        JSON.stringify(capabilities, null, 2),
        'agents/capabilities.json'
      );
    } catch {
      console.log('  ℹ️  Could not scaffold capabilities.json (template error)');
    }
  }

  // 8. Initialize cost-log.json
  writeIfNotExists(
    join(agentsDir, 'cost-log.json'),
    JSON.stringify([], null, 2),
    'agents/cost-log.json'
  );

  // 8b. Copy openspec templates
  const openspecTemplatesSource = join(SDLC_DIR, 'openspec/templates');
  const openspecTemplatesDest = join(projectDir, 'openspec/templates');
  if (existsSync(openspecTemplatesSource)) {
    ensureDir(openspecTemplatesDest);
    const templateFiles = readdirSync(openspecTemplatesSource).filter(f => f.endsWith('.template'));
    for (const tmplFile of templateFiles) {
      const src = join(openspecTemplatesSource, tmplFile);
      const dest = join(openspecTemplatesDest, tmplFile);
      if (!existsSync(dest)) {
        cpSync(src, dest);
        console.log(`  ✅ Copied openspec template: ${tmplFile}`);
      }
    }
  }

  // 9. Create review checklist (if a reviewer agent exists)
  const reviewerAgent = agents.find(a =>
    (agentRoles[a] || '').toLowerCase().includes('review')
  );
  if (reviewerAgent) {
    const checklistTemplate = readTemplate('agents/templates/checklist.md.template');
    writeIfNotExists(
      join(agentsDir, reviewerAgent, 'checklist.md'),
      checklistTemplate,
      `agents/${reviewerAgent}/checklist.md`
    );
  }

  // 9. Create PM Dashboard
  const dashboardContent = `# ${projectName} — Project Dashboard

**Last Updated:** ${today}

## Current Status
_Project initialized with Agentic SDLC framework._

## Agent Roster
${agents.map(a => `| ${agentDomains[a]?.name || a} | ${agentRoles[a] || 'Developer'} |`).join('\n') || '_No agents configured._'}

## Recent Activity
| Date | Agent | Action |
|------|-------|--------|
| ${today} | System | Project bootstrapped with Agentic SDLC |
`;
  writeIfNotExists(join(projectDir, 'pm/DASHBOARD.md'), dashboardContent, 'pm/DASHBOARD.md');

  // Create pm/approvals/ and pm/media/ directories
  ensureDir(join(projectDir, 'pm/approvals'));
  ensureDir(join(projectDir, 'pm/media'));

  // Create empty mailbox
  writeIfNotExists(join(projectDir, 'pm/mailbox.md'), '# Human ↔ Agent Mailbox\n\nMessages between the human project owner and the agent network.\n\n---\n', 'pm/mailbox.md');

  // 10. Copy skills to project
  const skillsSource = join(SDLC_DIR, 'skills');
  const skillsDest = join(projectDir, '.claude/skills');
  ensureDir(skillsDest);

  if (existsSync(skillsSource)) {
    const skillDirs = readdirSync(skillsSource).filter(d =>
      existsSync(join(skillsSource, d, 'SKILL.md'))
    );
    for (const skill of skillDirs) {
      const destSkillDir = join(skillsDest, skill);
      ensureDir(destSkillDir);
      const src = join(skillsSource, skill, 'SKILL.md');
      const dest = join(destSkillDir, 'SKILL.md');
      if (!existsSync(dest)) {
        cpSync(src, dest);
        console.log(`  ✅ Copied skill: ${skill}`);
      }
    }
  }

  // 11. Update or create CLAUDE.md
  const claudeMdPath = join(projectDir, 'CLAUDE.md');
  const sdlcSection = `
## Agentic SDLC

This project uses the Agentic SDLC framework from \`~/agentic-sdlc\`.

**Scripts:** \`node ~/agentic-sdlc/agents/<script>.mjs\`

**Key commands:**
\`\`\`bash
node ~/agentic-sdlc/agents/queue-drainer.mjs status     # See task queue
node ~/agentic-sdlc/agents/queue-drainer.mjs run         # Assign next task
node ~/agentic-sdlc/agents/worker.mjs --agent <n> --task <id>  # Generate agent prompt
node ~/agentic-sdlc/agents/test-behavior.mjs             # Validate agent prompts
node ~/agentic-sdlc/agents/cost-tracker.mjs report       # Daily cost report
\`\`\`

**OpenSpec workflow:** Every change must go through proposal → design → specs → tasks → implement.
Use \`/openspec-new-change\` to start, \`/openspec-continue-change\` to advance, \`/openspec-apply-change\` to implement.
`;

  if (existsSync(claudeMdPath)) {
    const existing = readFileSync(claudeMdPath, 'utf8');
    if (!existing.includes('Agentic SDLC')) {
      appendFileSync(claudeMdPath, sdlcSection);
      console.log(`  ✅ Appended SDLC section to CLAUDE.md`);
    } else {
      console.log(`  ⏭️  CLAUDE.md already has SDLC section`);
    }
  } else {
    writeFileSync(claudeMdPath, `# ${projectName}\n${sdlcSection}`);
    console.log(`  ✅ Created CLAUDE.md`);
  }

  // 12. Set up cron jobs (if OpenClaw available)
  try {
    execSync('which openclaw', { stdio: 'pipe' });
    const cronJobs = [
      { name: 'sdlc-update', cron: '0 4 * * *', cmd: 'cd ~/agentic-sdlc && git pull --ff-only', desc: 'daily SDLC update (04:00)' },
      { name: 'rem-sleep-weekly', cron: '0 23 * * 0', cmd: `cd ${projectDir} && node ~/agentic-sdlc/agents/rem-sleep.mjs`, desc: 'weekly REM sleep (Sun 23:00)' },
      { name: 'cost-report-daily', cron: '0 6 * * *', cmd: `cd ${projectDir} && node ~/agentic-sdlc/agents/cost-tracker.mjs report`, desc: 'daily cost report (06:00)' },
    ];
    for (const job of cronJobs) {
      try {
        execSync(`openclaw cron add ${job.name} "${job.cron}" "${job.cmd}"`, { stdio: 'pipe' });
        console.log(`  ✅ Set up ${job.desc}`);
      } catch {
        console.log(`  ℹ️  Cron "${job.name}" skipped (may already exist)`);
      }
    }
  } catch {
    console.log(`  ℹ️  OpenClaw not available — skip cron setup`);
  }

  // Done!
  console.log('');
  console.log('═'.repeat(50));
  console.log('  Setup complete!');
  console.log('═'.repeat(50));
  console.log('');
  console.log('  Next steps:');
  console.log(`  1. cd ${projectDir}`);
  console.log('  2. Run `claude` — SDLC rules loaded automatically');
  console.log('  3. Use `/openspec-new-change` to start your first change');
  console.log('  4. Use `node ~/agentic-sdlc/agents/queue-drainer.mjs status` to check queue');
  console.log('');
  console.log('  Suggested .gitignore additions:');
  console.log('    agents/cost-log.json');
  console.log('    agents/*/memory/recent.json');
  console.log('    agents/*/memory/compost.json');
  console.log('');

  rl.close();
}

main().catch((err) => {
  console.error('Setup error:', err.message);
  rl.close();
  process.exit(1);
});
