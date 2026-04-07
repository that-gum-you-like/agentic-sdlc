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

// ---------------------------------------------------------------------------
// Execution agent template discovery
// ---------------------------------------------------------------------------

const EXEC_TEMPLATES_DIR = join(SDLC_DIR, 'agents/templates/execution-agents');

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { metadata: {}, content };
  const lines = match[1].split('\n');
  const metadata = {};
  let currentKey = null;
  let currentObj = null;
  for (const line of lines) {
    const kvMatch = line.match(/^(\w[\w_]*)\s*:\s*(.+)$/);
    if (kvMatch) {
      const [, key, val] = kvMatch;
      if (val.startsWith('[')) {
        metadata[key] = JSON.parse(val.replace(/'/g, '"'));
      } else if (val.startsWith('{')) {
        metadata[key] = JSON.parse(val.replace(/'/g, '"'));
      } else {
        metadata[key] = val.trim().replace(/^["']|["']$/g, '');
      }
      currentKey = null;
      currentObj = null;
    } else if (line.match(/^(\w[\w_]*):\s*$/)) {
      currentKey = line.match(/^(\w[\w_]*)/)[1];
      currentObj = {};
      metadata[currentKey] = currentObj;
    } else if (currentObj && line.match(/^\s+(\w[\w_]*)\s*:\s*(.+)$/)) {
      const [, k, v] = line.match(/^\s+(\w[\w_]*)\s*:\s*(.+)$/);
      if (v.startsWith('[')) {
        currentObj[k] = JSON.parse(v.replace(/'/g, '"'));
      } else {
        currentObj[k] = v.trim().replace(/^["']|["']$/g, '');
      }
    }
  }
  return { metadata, content: match[2] };
}

function loadExecutionTemplates() {
  if (!existsSync(EXEC_TEMPLATES_DIR)) return [];
  const files = readdirSync(EXEC_TEMPLATES_DIR).filter(f => f.endsWith('.md'));
  return files.map(f => {
    const raw = readFileSync(join(EXEC_TEMPLATES_DIR, f), 'utf8');
    const { metadata, content } = parseFrontmatter(raw);
    return { file: f, slug: f.replace('.md', ''), metadata, content };
  });
}

function matchTemplate(role, templates) {
  const roleLower = role.toLowerCase();
  for (const tmpl of templates) {
    const keywords = tmpl.metadata.role_keywords || [];
    if (keywords.some(kw => roleLower.includes(kw))) return tmpl;
  }
  return null;
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

// ---------------------------------------------------------------------------
// Project discovery (non-destructive analysis)
// ---------------------------------------------------------------------------

function discoverProject(dir) {
  const result = {
    projectDir: dir,
    language: 'unknown',
    framework: 'unknown',
    testFramework: 'unknown',
    testCmd: '',
    ci: 'none',
    packageManager: 'unknown',
    hasExistingAgents: existsSync(join(dir, 'agents')),
    hasTaskQueue: existsSync(join(dir, 'tasks/queue')),
    hasMemory: false,
    hasCLAUDEmd: existsSync(join(dir, 'CLAUDE.md')),
    hasCursorRules: existsSync(join(dir, '.cursorrules')),
    suggestedAgents: [],
    suggestedLevel: 0,
  };

  // Check for existing agents/project.json to find appDir and test command
  let appDir = dir;
  const projectJsonPath = join(dir, 'agents', 'project.json');
  if (existsSync(projectJsonPath)) {
    try {
      const projConfig = JSON.parse(readFileSync(projectJsonPath, 'utf8'));
      if (projConfig.appDir && projConfig.appDir !== '.') {
        appDir = join(dir, projConfig.appDir);
      }
      if (projConfig.testCmd) result.testCmd = projConfig.testCmd;
      if (projConfig.agents) result.existingAgents = projConfig.agents;
    } catch { /* malformed project.json */ }
  }

  // Detect language and framework — check appDir first, fall back to project root
  function detectFromPackageJson(pkgDir) {
    const pkgPath = join(pkgDir, 'package.json');
    if (!existsSync(pkgPath)) return false;
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      result.language = pkg.devDependencies?.typescript || pkg.dependencies?.typescript ? 'typescript' : 'javascript';
      result.packageManager = existsSync(join(dir, 'yarn.lock')) ? 'yarn' : existsSync(join(dir, 'pnpm-lock.yaml')) ? 'pnpm' : 'npm';
      if (!result.testCmd) result.testCmd = pkg.scripts?.test || '';

      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (allDeps['next']) result.framework = 'nextjs';
      else if (allDeps['react-native'] || allDeps['expo']) result.framework = 'react-native';
      else if (allDeps['react']) result.framework = 'react';
      else if (allDeps['vue']) result.framework = 'vue';
      else if (allDeps['@angular/core']) result.framework = 'angular';
      else if (allDeps['express'] || allDeps['fastify'] || allDeps['hono']) result.framework = 'node-api';
      else if (allDeps['svelte'] || allDeps['@sveltejs/kit']) result.framework = 'svelte';

      if (allDeps['jest'] || pkg.jest) result.testFramework = 'jest';
      else if (allDeps['vitest']) result.testFramework = 'vitest';
      else if (allDeps['mocha']) result.testFramework = 'mocha';
      else if (allDeps['playwright'] || allDeps['@playwright/test']) result.testFramework = 'playwright';
      return true;
    } catch { return false; }
  }

  // Try appDir first (for monorepo/subdirectory projects), then root
  if (appDir !== dir) detectFromPackageJson(appDir);
  if (result.framework === 'unknown') detectFromPackageJson(dir);

  if (result.language === 'unknown') {
    if (existsSync(join(dir, 'requirements.txt')) || existsSync(join(dir, 'pyproject.toml'))) {
      result.language = 'python';
      result.packageManager = 'pip';
      if (existsSync(join(dir, 'pytest.ini')) || existsSync(join(dir, 'pyproject.toml'))) result.testFramework = 'pytest';
    } else if (existsSync(join(dir, 'Cargo.toml'))) {
      result.language = 'rust';
      result.packageManager = 'cargo';
      result.testFramework = 'cargo-test';
    } else if (existsSync(join(dir, 'go.mod'))) {
      result.language = 'go';
      result.packageManager = 'go-modules';
      result.testFramework = 'go-test';
    }
  }

  // Detect CI
  if (existsSync(join(dir, '.github/workflows'))) result.ci = 'github-actions';
  else if (existsSync(join(dir, '.gitlab-ci.yml'))) result.ci = 'gitlab-ci';
  else if (existsSync(join(dir, 'Jenkinsfile'))) result.ci = 'jenkins';

  // Check for existing memory
  if (result.hasExistingAgents) {
    try {
      const agentDirs = readdirSync(join(dir, 'agents'), { withFileTypes: true }).filter(d => d.isDirectory());
      result.hasMemory = agentDirs.some(d => existsSync(join(dir, 'agents', d.name, 'memory', 'core.json')));
    } catch { /* agents dir unreadable */ }
  }

  // Suggest agents based on detected tech
  const suggestedAgents = ['backend', 'reviewer'];
  const fw = result.framework;
  if (['react', 'react-native', 'nextjs', 'vue', 'angular', 'svelte'].includes(fw)) suggestedAgents.push('frontend');
  if (result.language === 'typescript' || result.language === 'python') suggestedAgents.push('integration-tester');

  result.suggestedAgents = suggestedAgents;

  // Assess current level
  if (result.hasMemory) result.suggestedLevel = 5;
  else if (result.hasTaskQueue) result.suggestedLevel = 3;
  else if (result.hasCLAUDEmd || result.hasCursorRules) result.suggestedLevel = 1;
  else result.suggestedLevel = 0;

  return result;
}

async function main() {
  // Handle --discover flag (non-destructive, outputs JSON)
  if (process.argv.includes('--discover')) {
    const dirIdx = process.argv.indexOf('--dir');
    const dir = dirIdx !== -1 ? resolve(process.argv[dirIdx + 1]) : process.cwd();
    const report = discoverProject(dir);
    console.log(JSON.stringify(report, null, 2));
    rl.close();
    return;
  }

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

  // Gather roles for each agent — match against execution templates for auto-config
  const agentRoles = {};
  const agentDomains = {};
  const agentTemplateMatches = {}; // agent → matched template or null
  const execTemplates = loadExecutionTemplates();
  if (execTemplates.length > 0) {
    console.log(`  (${execTemplates.length} execution agent templates available)`);
  }

  for (const agent of agents) {
    const role = await ask(`  Role for "${agent}"`, 'Developer');
    agentRoles[agent] = role;

    // Match role against execution templates
    const matched = matchTemplate(role, execTemplates);
    agentTemplateMatches[agent] = matched;
    let defaultPatterns = '';
    if (matched) {
      console.log(`    → Matched template: ${matched.slug}`);
      defaultPatterns = (matched.metadata.default_patterns || []).join(', ');
    }

    const patterns = await ask(`  File patterns for "${agent}" (comma-separated)`, defaultPatterns);
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

    // Roles that are always support-tier regardless of core selection
    const supportRoles = ['uix', 'ui/ux', 'design'];

    for (const agent of agents) {
      const role = (agentRoles[agent] || '').toLowerCase();
      const forcedSupport = supportRoles.some(r => role.includes(r));
      const isCore = !forcedSupport && coreAgents.has(agent);
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
  console.log('🔌 Platform Configuration');
  console.log('─'.repeat(40));
  const orchAdapter = await ask('Orchestration adapter (file-based/paperclip/claude-code-native)', 'file-based');
  const llmProvider = await ask('Default LLM provider (anthropic/groq/ollama)', 'anthropic');

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
  ensureDir(join(projectDir, 'plans'));
  ensureDir(join(projectDir, 'plans/completed'));
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
    orchestration: {
      adapter: orchAdapter,
    },
    llm: {
      defaultProvider: llmProvider,
    },
  };
  writeIfNotExists(
    join(agentsDir, 'project.json'),
    JSON.stringify(projectJson, null, 2),
    'agents/project.json'
  );

  // 5. Create budget.json
  const MODEL_FULL_IDS = { opus: 'claude-opus-4-6', sonnet: 'claude-sonnet-4-6', haiku: 'claude-haiku-4-5' };
  const toFullId = (m) => MODEL_FULL_IDS[m] || m;

  const budgetJson = {
    conservationMode: false,
    agents: Object.fromEntries(
      Object.entries(modelConfig).map(([agent, cfg]) => [
        agent,
        {
          ...cfg,
          model: toFullId(cfg.model),
          provider: llmProvider,
          maxInstances: 1,
          fallbackChain: [toFullId(cfg.model)],
          activeModel: null,
          modelPreferences: {},
        },
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

    // AGENT.md — check if matched template is a replacement (CTO) or addendum
    const matched = agentTemplateMatches[agent];
    const isReplacement = matched?.metadata.template_type === 'replacement';

    let agentMd;
    if (isReplacement && matched) {
      // Full replacement template (e.g., CTO orchestrator — different micro cycle)
      agentMd = fillTemplate(matched.content, {
        NAME: agentDomains[agent]?.name || agent,
        ROLE: agentRoles[agent] || 'Developer',
        RESPONSIBILITIES: `Responsible for ${agentRoles[agent] || 'orchestration'} tasks in ${projectName}.`,
        CODEBASE_STATE: `New project. Agent initialized on ${today}.`,
        TECH_STACK: '',
        ETHICAL_FRAMEWORK: '',
      });
    } else {
      // Base template + optional addendum
      const agentMdTemplate = readTemplate('agents/templates/AGENT.md.template');
      agentMd = fillTemplate(agentMdTemplate, {
        NAME: agentDomains[agent]?.name || agent,
        ROLE: agentRoles[agent] || 'Developer',
        RESPONSIBILITIES: `Responsible for ${agentRoles[agent] || 'development'} tasks in ${projectName}.`,
        CODEBASE_STATE: `New project. Agent initialized on ${today}.`,
      });
      // Append matched execution template addendum (stripped of frontmatter)
      if (matched) {
        const addendum = fillTemplate(matched.content, {
          NAME: agentDomains[agent]?.name || agent,
          ROLE: agentRoles[agent] || 'Developer',
          TECH_STACK: '',
          ETHICAL_FRAMEWORK: '',
        });
        agentMd += '\n' + addendum;
      }
    }
    writeIfNotExists(join(agentDir, 'AGENT.md'), agentMd, `agents/${agent}/AGENT.md`);

    // Append UIX-specific operating rules if this is a uix agent
    const agentRole = (agentRoles[agent] || '').toLowerCase();
    if (agentRole.includes('ui/ux') || agentRole.includes('uix') || agentRole.includes('design')) {
      const uixAddendum = `

---

## UIX-Specific Operating Rules

### Design-Specific Micro Cycle Additions

In addition to the standard micro cycle, every task MUST include:

1. **Design Token Audit** — Check that all color, spacing, typography, border-radius, and shadow values reference project design tokens (not hard-coded values). Flag any hard-coded value that has a token equivalent.
2. **Accessibility Validation (WCAG 2.1 AA)** — Verify:
   - Color contrast ratios (4.5:1 normal text, 3:1 large text)
   - Semantic HTML (buttons for actions, links for navigation, correct heading hierarchy)
   - ARIA attributes (aria-label on icon buttons, aria-hidden on decorative elements)
   - Focus management (modal focus traps, keyboard reachability)
   - Touch targets (44x44px minimum)
3. **Visual Review via Screenshots** — Take browser screenshots at 3 breakpoints (375px, 768px, 1280px) to evaluate:
   - Visual hierarchy (primary CTA prominence, information grouping)
   - Responsive behavior (no overflow, overlap, or truncation)
   - Interaction states (hover, focus, active, disabled)
4. **Storybook Story Governance** (conditional — only when Storybook is installed) — Verify:
   - Every shared component (used in 2+ screens) has a \`.stories.*\` file
   - Stories cover default + at least 2 other states (loading, error, empty, disabled)
   - Story props stay in sync with component interface (no stale/missing props)

### Design System Audit Rules

- **Tokens over values**: If a design token exists for a color, spacing, or typography value, the component MUST use the token, not the raw value.
- **Consistency over novelty**: Similar components (buttons, cards, inputs) MUST use consistent visual patterns.
- **Scale alignment**: All spacing values MUST align to the project's spacing scale (e.g., 4px increments).
- **Typography scale**: Font sizes and weights MUST follow the project's defined typography scale.

### Accessibility Checklist (WCAG 2.1 AA)

- [ ] All text meets contrast ratio minimums (4.5:1 normal, 3:1 large)
- [ ] Interactive elements use semantic HTML (\`<button>\`, \`<a>\`, not clickable \`<div>\`)
- [ ] No heading levels are skipped
- [ ] Icon-only buttons have \`aria-label\`
- [ ] Modals implement focus trapping
- [ ] All interactive elements reachable via Tab
- [ ] Touch targets are 44x44px minimum
- [ ] Dynamic content regions have \`aria-live\`

### Visual Review Workflow

1. Build production artifact locally
2. Take screenshots at 375px (mobile), 768px (tablet), 1280px (desktop)
3. Evaluate each screenshot for: visual hierarchy, spacing consistency, responsive behavior, interaction states
4. Flag any issues with specific coordinates/elements
5. Use the project's existing browser automation tool (same as Tier 5 E2E)

### Storybook Governance

- Detect Storybook via \`@storybook/*\` in \`package.json\` or \`.storybook/\` directory
- If not installed: skip Storybook checks, report \`skipReason\` in capability checklist
- If installed: verify story coverage, state coverage, and prop sync for all changed components

### Boundary with Other Agents

- **Frontend Developer** builds features — UIX reviews visual quality
- **Code Reviewer** reviews code quality — UIX reviews design quality
- UIX does NOT write business logic, API calls, or navigation flows
- UIX CAN write/modify styles, design tokens, Storybook stories, and accessibility attributes
`;
      const agentMdPath = join(agentDir, 'AGENT.md');
      if (existsSync(agentMdPath)) {
        appendFileSync(agentMdPath, uixAddendum);
      }
    }

    // Core memory from template (UIX agents get specialized core)
    const isUixAgent = agentRole.includes('ui/ux') || agentRole.includes('uix') || agentRole.includes('design');
    const coreTemplatePath = isUixAgent ? 'agents/templates/uix-core.json.template' : 'agents/templates/core.json.template';
    const coreTemplate = readTemplate(coreTemplatePath);
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
        const matched = agentTemplateMatches[agent];
        if (matched?.metadata.capabilities) {
          // Use template-provided capabilities
          capabilities[agent] = matched.metadata.capabilities;
        } else {
          // Fall back to archetype lookup
          const role = (agentRoles[agent] || '').toLowerCase();
          let archetype = matched?.metadata.archetype || 'backend';
          if (!matched) {
            if (role.includes('ui/ux') || role.includes('uix') || role.includes('design')) archetype = 'uix';
            else if (role.includes('frontend') || role.includes('ui')) archetype = 'frontend';
            else if (role.includes('review')) archetype = 'reviewer';
            else if (role.includes('release') || role.includes('deploy')) archetype = 'release';
          }
          capabilities[agent] = capTemplate[archetype] || capTemplate.backend;
        }
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

  // 7c. Create SHARED_PROTOCOL.md from template
  const sharedProtoTemplate = join(SDLC_DIR, 'agents/templates/SHARED_PROTOCOL.md.template');
  if (existsSync(sharedProtoTemplate)) {
    writeIfNotExists(
      join(agentsDir, 'SHARED_PROTOCOL.md'),
      readFileSync(sharedProtoTemplate, 'utf8'),
      'agents/SHARED_PROTOCOL.md'
    );
  }

  // 7d. Create defeat-allowlist.json from template
  const allowlistTemplate = join(SDLC_DIR, 'agents/templates/defeat-allowlist.json.template');
  if (existsSync(allowlistTemplate)) {
    writeIfNotExists(
      join(agentsDir, 'defeat-allowlist.json'),
      readFileSync(allowlistTemplate, 'utf8'),
      'agents/defeat-allowlist.json'
    );
  }

  // 7e. Validate redundant heartbeats (warn if only 1 agent configured)
  if (agents.length >= 2) {
    console.log('  ℹ️  Ensure 2+ agents have heartbeats/crons to avoid single-point-of-failure stalls');
  } else if (agents.length === 1) {
    console.log('  ⚠️  Only 1 agent configured. Recommend 2+ agents with heartbeats to prevent cascade stalls (ref: LinguaFlow 17-day stall incident)');
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
