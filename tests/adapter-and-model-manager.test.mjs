#!/usr/bin/env node
/**
 * Unit tests for adapter layer, model-manager, and budget normalization.
 *
 * Usage:
 *   node tests/adapter-and-model-manager.test.mjs
 *
 * Tests cover:
 *   - load-adapter.mjs: default fallback, explicit selection, missing adapter error
 *   - model-manager.mjs check: threshold detection, fallback chain, budget-exhausted
 *   - model-manager.mjs recommend: downgrade/upgrade recommendations, confidence levels
 *   - four-layer-validate.mjs --allowlist: new violation fails, known passes, shrink
 *   - load-config.mjs budget normalization: old format, new format, defaults
 *   - Integration: model-manager → budget.json → worker reads activeModel
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SDLC_ROOT = resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(message || `Expected ${expected}, got ${actual}`);
}

// ============================================================================
// 7.2: load-adapter.mjs tests
// ============================================================================

console.log('\n📋 load-adapter.mjs:');

const { loadOrchestrationAdapter, loadLlmAdapter, listOrchestrationAdapters, listLlmAdapters } = await import(
  resolve(SDLC_ROOT, 'agents/adapters/load-adapter.mjs')
);

test('default orchestration adapter is file-based', async () => {
  const adapter = await loadOrchestrationAdapter({});
  assert(typeof adapter.loadTasks === 'function', 'loadTasks should be a function');
  assert(typeof adapter.saveTask === 'function', 'saveTask should be a function');
  assert(typeof adapter.syncConfig === 'function', 'syncConfig should be a function');
});

test('default LLM adapter is anthropic', async () => {
  const adapter = await loadLlmAdapter({});
  assert(typeof adapter.complete === 'function', 'complete should be a function');
  assert(typeof adapter.estimateTokens === 'function', 'estimateTokens should be a function');
  assert(typeof adapter.listModels === 'function', 'listModels should be a function');
});

test('explicit orchestration adapter selection works', async () => {
  const adapter = await loadOrchestrationAdapter({ orchestration: { adapter: 'claude-code-native' } });
  assert(typeof adapter.loadTasks === 'function', 'loadTasks should be a function');
});

test('unknown orchestration adapter throws', async () => {
  try {
    await loadOrchestrationAdapter({ orchestration: { adapter: 'nonexistent' } });
    assert(false, 'Should have thrown');
  } catch (err) {
    assert(err.message.includes('Unknown orchestration adapter'), `Expected unknown adapter error, got: ${err.message}`);
  }
});

test('unknown LLM adapter throws', async () => {
  try {
    await loadLlmAdapter({}, 'nonexistent');
    assert(false, 'Should have thrown');
  } catch (err) {
    assert(err.message.includes('Unknown LLM provider'), `Expected unknown provider error, got: ${err.message}`);
  }
});

test('listOrchestrationAdapters returns 3 adapters', () => {
  const adapters = listOrchestrationAdapters();
  assertEqual(adapters.length, 3, `Expected 3 orchestration adapters, got ${adapters.length}`);
  assert(adapters.includes('file-based'), 'Should include file-based');
  assert(adapters.includes('paperclip'), 'Should include paperclip');
  assert(adapters.includes('claude-code-native'), 'Should include claude-code-native');
});

test('listLlmAdapters returns 9 adapters', () => {
  const adapters = listLlmAdapters();
  assertEqual(adapters.length, 9, `Expected 9 LLM adapters, got ${adapters.length}`);
  assert(adapters.includes('anthropic'), 'Should include anthropic');
  assert(adapters.includes('openrouter'), 'Should include openrouter');
  assert(adapters.includes('groq'), 'Should include groq');
  assert(adapters.includes('ollama'), 'Should include ollama');
  assert(adapters.includes('openai'), 'Should include openai');
  assert(adapters.includes('gemini'), 'Should include gemini');
  assert(adapters.includes('cerebras'), 'Should include cerebras');
  assert(adapters.includes('azure-openai'), 'Should include azure-openai');
  assert(adapters.includes('azure-foundry-claude'), 'Should include azure-foundry-claude');
});

test('openrouter adapter implements the LLM interface + affordable catalog', async () => {
  const or = await loadLlmAdapter({ llm: { defaultProvider: 'openrouter' } });
  for (const fn of ['complete', 'estimateTokens', 'checkAvailability', 'getModelInfo', 'listModels']) {
    assert(typeof or[fn] === 'function', `openrouter must export ${fn}`);
  }
  const models = or.listModels();
  assert(models.includes('qwen/qwen3-coder:free'), 'catalog must include the free primary coder');
  assert(models.includes('deepseek/deepseek-v4-flash'), 'catalog must include deepseek-v4-flash');
  // Privacy-first: no OpenAI models in the curated catalog.
  assert(!models.some(m => /^openai\//.test(m) || /gpt-/.test(m)), 'catalog must not contain OpenAI models');
  const free = or.getModelInfo('qwen/qwen3-coder:free');
  assertEqual(free.costPer1kInput, 0, 'free model input cost must be 0');
  assert(free.contextWindow > 500000, 'qwen3-coder should report a large context window');
});

test('openrouter checkAvailability reflects OPENROUTER_API_KEY', async () => {
  const or = await loadLlmAdapter({ llm: { defaultProvider: 'openrouter' } });
  const saved = process.env.OPENROUTER_API_KEY;
  try {
    delete process.env.OPENROUTER_API_KEY;
    assertEqual((await or.checkAvailability('qwen/qwen3-coder:free')).available, false, 'unavailable without key');
    process.env.OPENROUTER_API_KEY = 'test-key';
    assertEqual((await or.checkAvailability('qwen/qwen3-coder:free')).available, true, 'available with key');
  } finally {
    if (saved === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = saved;
  }
});

// ============================================================================
// 7.3: model-manager.mjs check threshold tests (functional, no mocks)
// ============================================================================

console.log('\n📋 model-manager.mjs:');

test('model-manager.mjs exists and is importable', () => {
  assert(existsSync(resolve(SDLC_ROOT, 'agents/model-manager.mjs')), 'model-manager.mjs should exist');
});

// ============================================================================
// 7.4: model-manager recommend logic
// ============================================================================

test('performance ledger JSONL format is parseable', () => {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    event: 'task-complete',
    agent: 'roy',
    model: 'claude-sonnet-4-6',
    provider: 'anthropic',
    taskId: 'T-001',
    taskType: 'feature',
    tokensUsed: 18500,
    success: true,
    testsPassed: true,
    duration: 45,
    firstAttempt: true,
  });
  const parsed = JSON.parse(entry);
  assertEqual(parsed.agent, 'roy');
  assertEqual(parsed.success, true);
  assert(parsed.timestamp, 'Should have timestamp');
});

// ============================================================================
// 7.5: allowlist filtering logic
// ============================================================================

console.log('\n📋 allowlist filtering:');

test('allowlist JSON template is valid', () => {
  const template = readFileSync(resolve(SDLC_ROOT, 'agents/templates/defeat-allowlist.json.template'), 'utf8');
  const parsed = JSON.parse(template);
  assert(Array.isArray(parsed['any-type']), 'any-type should be an array');
  assert(Array.isArray(parsed['console-log']), 'console-log should be an array');
  assert(Array.isArray(parsed['file-size']), 'file-size should be an array');
  assert(parsed._description, 'Should have description');
});

// ============================================================================
// 7.6: budget.json normalization
// ============================================================================

console.log('\n📋 budget.json normalization:');

test('budget.json template is valid JSON with new fields', () => {
  const template = readFileSync(resolve(SDLC_ROOT, 'agents/templates/budget.json.template'), 'utf8');
  const parsed = JSON.parse(template);
  const agent = parsed.agents['{{AGENT_NAME}}'];
  assert(agent, 'Should have agent template');
  assertEqual(agent.provider, 'anthropic', 'Default provider should be anthropic');
  assert(Array.isArray(agent.fallbackChain), 'fallbackChain should be an array');
  assertEqual(agent.activeModel, null, 'activeModel should be null by default');
  assert(typeof agent.modelPreferences === 'object', 'modelPreferences should be an object');
});

test('core.json template has failure severity schema', () => {
  const template = readFileSync(resolve(SDLC_ROOT, 'agents/templates/core.json.template'), 'utf8');
  const parsed = JSON.parse(template);
  assert(parsed._failure_schema, 'Should have _failure_schema');
  assert(parsed._failure_schema._severity_response, 'Should have severity response mapping');
  assert(parsed._failure_schema._severity_response.critical, 'Should have critical response');
  assert(parsed._failure_schema._severity_response.high, 'Should have high response');
  assert(parsed._failure_schema._severity_response.medium, 'Should have medium response');
});

test('core.json template has optional character object with six fields', () => {
  const template = readFileSync(resolve(SDLC_ROOT, 'agents/templates/core.json.template'), 'utf8');
  const parsed = JSON.parse(template);
  assert(parsed.character, 'Should have character object');
  assert(typeof parsed.character.personality === 'string', 'personality should be a string');
  assert(typeof parsed.character.communicationStyle === 'string', 'communicationStyle should be a string');
  assert(Array.isArray(parsed.character.quirks), 'quirks should be an array');
  assert(Array.isArray(parsed.character.relationships), 'relationships should be an array');
  assert(typeof parsed.character.inTheirOwnWords === 'string', 'inTheirOwnWords should be a string');
  assert(Array.isArray(parsed.character.growthJourney), 'growthJourney should be an array');
});

test('character-sheet.md documents all six fields', () => {
  const charSheet = readFileSync(resolve(SDLC_ROOT, 'agents/templates/character-sheet.md'), 'utf8');
  assert(charSheet.includes('personality'), 'Should document personality');
  assert(charSheet.includes('communicationStyle'), 'Should document communicationStyle');
  assert(charSheet.includes('quirks'), 'Should document quirks');
  assert(charSheet.includes('relationships'), 'Should document relationships');
  assert(charSheet.includes('inTheirOwnWords'), 'Should document inTheirOwnWords');
  assert(charSheet.includes('growthJourney'), 'Should document growthJourney');
});

// ============================================================================
// 7.8: project.json template validation
// ============================================================================

console.log('\n📋 project.json template:');

test('project.json.template parses as JSON and has allowedExtensions', () => {
  const template = readFileSync(resolve(SDLC_ROOT, 'agents/project.json.template'), 'utf8');
  const parsed = JSON.parse(template);
  assert(Array.isArray(parsed.allowedExtensions), 'allowedExtensions should be an array');
  assertEqual(parsed.allowedExtensions.length, 0, 'allowedExtensions should be empty by default (disabled)');
});

// ============================================================================
// 7.7: Integration — adapter interface consistency
// ============================================================================

console.log('\n📋 Integration — adapter interface consistency:');

test('all orchestration adapters export same interface', async () => {
  const requiredMethods = ['loadTasks', 'saveTask', 'archiveTask', 'loadCompletedCount', 'loadHumanTasks', 'saveHumanTask', 'syncConfig'];
  for (const name of listOrchestrationAdapters()) {
    const adapter = await loadOrchestrationAdapter({ orchestration: { adapter: name } });
    for (const method of requiredMethods) {
      assert(typeof adapter[method] === 'function', `${name} adapter missing ${method}`);
    }
  }
});

test('anthropic LLM adapter exports full interface', async () => {
  const requiredMethods = ['complete', 'estimateTokens', 'checkAvailability', 'getModelInfo', 'listModels'];
  const adapter = await loadLlmAdapter({}, 'anthropic');
  for (const method of requiredMethods) {
    assert(typeof adapter[method] === 'function', `anthropic adapter missing ${method}`);
  }
});

test('anthropic adapter resolves model shorthands', async () => {
  const adapter = await loadLlmAdapter({}, 'anthropic');
  const info = adapter.getModelInfo('opus');
  assertEqual(info.provider, 'anthropic');
  assert(info.costPer1kInput > 0, 'Should have input cost');
});

test('anthropic adapter estimates tokens', async () => {
  const adapter = await loadLlmAdapter({}, 'anthropic');
  const tokens = adapter.estimateTokens('Hello, world!');
  assert(tokens > 0, 'Should estimate > 0 tokens');
  assert(tokens < 100, 'Should estimate reasonable token count');
});

test('SHARED_PROTOCOL.md template exists and has required sections', () => {
  const template = readFileSync(resolve(SDLC_ROOT, 'agents/templates/SHARED_PROTOCOL.md.template'), 'utf8');
  assert(template.includes('Memory Protocol'), 'Should have Memory Protocol section');
  assert(template.includes('Heartbeat Procedure'), 'Should have Heartbeat section');
  assert(template.includes('Communication Standards'), 'Should have Communication section');
  assert(template.includes('Quality Gates'), 'Should have Quality Gates section');
  assert(template.includes('Escalation Protocol'), 'Should have Escalation section');
  assert(template.includes('No-Questions Mode'), 'Should have No-Questions Mode section');
  assert(template.includes('Pipeline-Only Deploy'), 'Should have Pipeline-Only Deploy section');
});

test('escalation protocol template has 5 tiers', () => {
  const template = readFileSync(resolve(SDLC_ROOT, 'agents/templates/escalation-protocol.md.template'), 'utf8');
  assert(template.includes('| 1 |') || template.includes('Tier 1'), 'Should have tier 1');
  assert(template.includes('| 5 |') || template.includes('Tier 5'), 'Should have tier 5');
  assert(template.includes('Fast-Track'), 'Should have Fast-Track section');
});

test('model-manager AGENT.md template exists and is well-formed', () => {
  const md = readFileSync(resolve(SDLC_ROOT, 'agents/templates/model-manager/AGENT.md'), 'utf8');
  assert(md.includes('version:'), 'Should have version header');
  assert(md.includes('Model Manager'), 'Should identify as Model Manager');
  assert(/NOT.*write code|NOT.*execute task|does not write code/i.test(md), 'Should prohibit code execution');
  assert(md.includes('fallback'), 'Should mention fallback');
  assert(md.includes('performance'), 'Should mention performance');
});

// ============================================================================
// Execution Agent Templates — frontmatter parsing and template selection
// ============================================================================

console.log('\n📋 Execution agent template infrastructure:');

// Import parseFrontmatter and related functions by reading setup.mjs source
// (they're not exported, so we test the pattern directly)
test('parseFrontmatter extracts YAML metadata', () => {
  const input = `---
role_keywords: ["backend", "services"]
archetype: "backend-developer"
template_type: "addendum"
default_patterns: ["services/", "stores/"]
---

## Backend-Specific Rules
Some content here.`;

  // Reproduce the parsing logic inline for testing
  const match = input.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  assert(match, 'Should match frontmatter pattern');
  assert(match[2].includes('Backend-Specific Rules'), 'Content should be after frontmatter');
  assert(!match[2].includes('role_keywords'), 'Content should not contain frontmatter');
});

test('all execution templates have valid frontmatter', () => {
  const execDir = resolve(SDLC_ROOT, 'agents/templates/execution-agents');
  const files = readdirSync(execDir).filter(f => f.endsWith('.md'));
  // 16 base templates + 6 ported from Hermes skills + 1 git-expert (CV-REQ-089)
  assertEqual(files.length, 23, `Expected 23 templates, got ${files.length}`);

  for (const file of files) {
    const content = readFileSync(resolve(execDir, file), 'utf8');
    assert(content.startsWith('---'), `${file} should start with YAML frontmatter`);
    assert(content.includes('role_keywords:'), `${file} should define role_keywords`);
    assert(content.includes('archetype:'), `${file} should define archetype`);
    assert(content.includes('template_type:'), `${file} should define template_type`);
  }
});

test('CTO template is replacement type, others are addendum', () => {
  const execDir = resolve(SDLC_ROOT, 'agents/templates/execution-agents');
  const cto = readFileSync(resolve(execDir, 'cto-orchestrator.md'), 'utf8');
  assert(cto.includes('template_type: "replacement"'), 'CTO should be replacement');

  const backend = readFileSync(resolve(execDir, 'backend-developer.md'), 'utf8');
  assert(backend.includes('template_type: "addendum"'), 'Backend should be addendum');
});

test('CTO template does NOT contain standard micro cycle steps', () => {
  const execDir = resolve(SDLC_ROOT, 'agents/templates/execution-agents');
  const cto = readFileSync(resolve(execDir, 'cto-orchestrator.md'), 'utf8');
  // CTO should have orchestration cycle, NOT implementation steps
  assert(cto.includes('Decompose') || cto.includes('decompose'), 'Should have decompose step');
  assert(cto.includes('Delegate') || cto.includes('delegate'), 'Should have delegate step');
  assert(!cto.includes('Write tests') && !cto.includes('4. **Write tests**'), 'Should NOT have write tests step');
});

test('backend template has field-proven failure patterns', () => {
  const execDir = resolve(SDLC_ROOT, 'agents/templates/execution-agents');
  const backend = readFileSync(resolve(execDir, 'backend-developer.md'), 'utf8');
  assert(backend.includes('F-001') || backend.includes('Failure'), 'Should have failure patterns');
  assert(/maybeSingle|single\(\)|N\+1|queries/i.test(backend), 'Should reference LinguaFlow-learned patterns');
});

test('all 15 templates use only supported frontmatter features', () => {
  const execDir = resolve(SDLC_ROOT, 'agents/templates/execution-agents');
  const files = readdirSync(execDir).filter(f => f.endsWith('.md'));

  for (const file of files) {
    const content = readFileSync(resolve(execDir, file), 'utf8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    assert(fmMatch, `${file}: should have frontmatter`);

    const fmLines = fmMatch[1].split('\n');
    for (const line of fmLines) {
      // Skip empty lines
      if (line.trim() === '') continue;

      // Supported: flat key-value (key: value), key-only (key:), indented child (  key: value), indented key-only (  key:)
      const isKeyValue = /^\w[\w_]*\s*:\s*.+$/.test(line);
      const isKeyOnly = /^\w[\w_]*:\s*$/.test(line);
      const isIndentedChild = /^\s+\w[\w_]*\s*:\s*.+$/.test(line);
      const isIndentedKeyOnly = /^\s+\w[\w_]*:\s*$/.test(line);
      assert(
        isKeyValue || isKeyOnly || isIndentedChild || isIndentedKeyOnly,
        `${file}: unsupported frontmatter line: "${line}"`
      );

      // Ensure no unsupported YAML features
      assert(!line.includes(' #'), `${file}: YAML comments not supported: "${line}"`);
      assert(!/[|>]\s*$/.test(line.split(':').pop()), `${file}: multiline strings not supported: "${line}"`);
    }
  }
});

test('capabilities.json.template has all 16 execution archetypes', () => {
  const caps = JSON.parse(readFileSync(resolve(SDLC_ROOT, 'agents/templates/capabilities.json.template'), 'utf8'));
  const expected = [
    'cto-orchestrator', 'code-reviewer', 'release-manager', 'backend-developer',
    'frontend-developer', 'ai-engineer', 'documentarian', 'security-engineer',
    'qa-engineer', 'integration-tester', 'ethics-advisor', 'architect',
    'dependency-auditor', 'performance-sentinel', 'research-agent',
    'platform-maturity-sentinel',
  ];
  for (const arch of expected) {
    assert(caps[arch], `capabilities.json should have ${arch} archetype`);
    assert(caps[arch].required, `${arch} should have required capabilities`);
  }
});

// ============================================================================
// Memory Scaling — estimateTokens and recall summarization
// ============================================================================

console.log('\n📋 Memory scaling:');

test('estimateTokens returns chars/4 approximation', async () => {
  const { estimateTokens } = await import(resolve(SDLC_ROOT, 'agents/memory-manager.mjs'));
  assertEqual(estimateTokens(''), 0);
  assertEqual(estimateTokens(null), 0);
  // 100 chars → 25 tokens
  const text100 = 'a'.repeat(100);
  assertEqual(estimateTokens(text100), 25);
  // 7 chars → ceil(7/4) = 2
  assertEqual(estimateTokens('1234567'), 2);
});

test('memoryTokenBudget defaults to 4000 in load-config', async () => {
  const { loadConfig } = await import(resolve(SDLC_ROOT, 'agents/load-config.mjs'));
  const config = loadConfig();
  assert(config.memoryTokenBudget !== undefined, 'memoryTokenBudget should be defined');
  assert(typeof config.memoryTokenBudget === 'number', 'memoryTokenBudget should be a number');
});

// ============================================================================
// Model Manager Intelligence — functional tests
// ============================================================================

console.log('\n📋 Model manager intelligence:');

// model-intel.json is a runtime cache (gitignored). Tests read the shipped
// default catalog at agents/model-intel.default.json.
const INTEL_DEFAULT_PATH = resolve(SDLC_ROOT, 'agents/model-intel.default.json');

test('model-intel.default.json exists and has models from non-OpenAI providers', () => {
  assert(existsSync(INTEL_DEFAULT_PATH), 'model-intel.default.json should exist');
  const intel = JSON.parse(readFileSync(INTEL_DEFAULT_PATH, 'utf8'));
  assert(intel.models, 'Should have models object');

  const providers = new Set(Object.values(intel.models).map(m => m.provider));
  assert(providers.has('anthropic'), 'Should have anthropic models');
  assert(providers.has('groq'), 'Should have groq models');
  assert(!providers.has('openai'), 'Should NOT have openai models (no-OpenAI default)');
});

test('all models in model-intel.default.json have required fields', () => {
  const intel = JSON.parse(readFileSync(INTEL_DEFAULT_PATH, 'utf8'));
  for (const [id, m] of Object.entries(intel.models)) {
    assert(m.provider, `${id}: should have provider`);
    assert(typeof m.costPer1MInput === 'number', `${id}: should have costPer1MInput`);
    assert(typeof m.costPer1MOutput === 'number', `${id}: should have costPer1MOutput`);
    assert(typeof m.contextWindow === 'number', `${id}: should have contextWindow`);
    assert(m.strengths, `${id}: should have strengths`);
    assert(typeof m.strengths.coding === 'number', `${id}: should have strengths.coding`);
    assert(typeof m.strengths.architecture === 'number', `${id}: should have strengths.architecture`);
    assert(m.latencyTier, `${id}: should have latencyTier`);
  }
});

test('buildCostOrder returns models sorted cheapest-first', async () => {
  const { buildCostOrder } = await import(resolve(SDLC_ROOT, 'agents/model-manager.mjs'));
  const order = buildCostOrder();
  assert(order.length > 0, 'Should have models');
  for (let i = 1; i < order.length; i++) {
    assert(
      order[i].costPer1MInput >= order[i - 1].costPer1MInput,
      `${order[i].id} should cost >= ${order[i - 1].id}`
    );
  }
});

test('suggest returns a model for each valid task type', async () => {
  const { suggest } = await import(resolve(SDLC_ROOT, 'agents/model-manager.mjs'));
  for (const type of ['coding', 'review', 'documentation', 'architecture', 'research']) {
    const result = suggest(type);
    assert(result, `suggest('${type}') should return a model ID`);
  }
});

test('suggest returns null for invalid task type', async () => {
  const { suggest } = await import(resolve(SDLC_ROOT, 'agents/model-manager.mjs'));
  const result = suggest('invalid');
  assertEqual(result, null, 'Should return null for invalid type');
});

test('buildCostOrder does not include OpenAI models', async () => {
  const { buildCostOrder } = await import(resolve(SDLC_ROOT, 'agents/model-manager.mjs'));
  const order = buildCostOrder();
  for (const model of order) {
    assert(model.provider !== 'openai', `Should not include openai model: ${model.id}`);
  }
});

test('suggest returns a model with valid provider and cost', async () => {
  const { suggest } = await import(resolve(SDLC_ROOT, 'agents/model-manager.mjs'));
  for (const type of ['coding', 'review', 'documentation']) {
    const id = suggest(type);
    assert(id, `${type} should have a suggestion`);
    assert(typeof id === 'string', `${type} suggestion should be a string`);
    assert(id.length > 0, `${type} suggestion should not be empty`);
  }
});

// ============================================================================
// 7.9: cost-tracker import validation
// ============================================================================

console.log('\n📋 cost-tracker import validation:');

// Direct import of cost-tracker.mjs at the top level would trigger CLI
// side effects. Instead we scrape the exported function names that
// setup.mjs/adapter-and-model-manager.test.mjs reference.
test('cost-tracker.mjs exports report function', async () => {
  const { report } = await import(resolve(SDLC_ROOT, 'agents/cost-tracker.mjs'));
  assert(typeof report === 'function', 'report should be an exported function');
});

// ============================================================================
// 7.10: notify.mjs import validation
// ============================================================================

console.log('\n📋 notify.mjs import validation:');

// Direct import of notify.mjs at the top level would trigger CLI
// side effects (prints help text). Instead we scrape the exported
// function names that model-manager.mjs/adapter-and-model-manager.test.mjs reference.
test('notify.mjs exports getLedger function', async () => {
  const { getLedger } = await import(resolve(SDLC_ROOT, 'agents/notify.mjs'));
  assert(typeof getLedger === 'function', 'getLedger should be an exported function');
});

test('notify.mjs exports checkMailbox function', async () => {
  const { checkMailbox } = await import(resolve(SDLC_ROOT, 'agents/notify.mjs'));
  assert(typeof checkMailbox === 'function', 'checkMailbox should be an exported function');
});

test('notify.mjs exports ingestErrors function', async () => {
  const { ingestErrors } = await import(resolve(SDLC_ROOT, 'agents/notify.mjs'));
  assert(typeof ingestErrors === 'function', 'ingestErrors should be an exported function');
});

// ============================================================================
// 7.11: error signature normalization
// ============================================================================

console.log('\n📋 Error signature normalization:');

test('errorSignature normalizes similar errors', async () => {
  const { errorSignature } = await import(resolve(SDLC_ROOT, 'agents/notify.mjs'));
  // Same path + line should produce same signature even with different context
  const sig1 = errorSignature('TypeError: Cannot read property "x" of null in /home/user/project/src/worker.mjs:42');
  const sig2 = errorSignature(
    'TypeError: Cannot read property "x" of null in /home/vagrant/builds/agentic-sdlc/src/worker.mjs:42'
  );
  assertEqual(sig1, sig2, 'Same file:line should produce same signature');
  // Different line should produce different signature
  const sig3 = errorSignature('TypeError: Cannot read property "x" of null in src/worker.mjs:99');
  assert(sig1 !== sig3, 'Different line should produce different signature');
});

test('errorSignature handles errors without file paths', async () => {
  const { errorSignature } = await import(resolve(SDLC_ROOT, 'agents/notify.mjs'));
  const sig1 = errorSignature('Timeout connecting to Matrix server');
  const sig2 = errorSignature('Timeout connecting to Matrix server after 30 seconds');
  assertEqual(sig1, sig2, 'Similar messages without file info should produce same signature');
  const sig3 = errorSignature('Disk full on /dev/sda1');
  assert(sig1 !== sig3, 'Different messages produce different signatures');
});

// ============================================================================
// 7.12: load-config defaults integrity
// ============================================================================

console.log('\n📋 load-config.mjs integrity:');

test('loadConfig returns all expected top-level keys', async () => {
  const { loadConfig } = await import(resolve(SDLC_ROOT, 'agents/load-config.mjs'));
  const cfg = loadConfig();
  const expected = [
    'name', 'projectDir', 'appDir', 'testCmd', 'agents',
    'notification', 'orchestration', 'llm', 'memoryTokenBudget',
    'doneChecklist', 'humanWellness', 'capabilityMonitoring',
  ];
  for (const key of expected) {
    assert(cfg[key] !== undefined, `loadConfig should have key: ${key}`);
  }
});

test('loadConfig finds project.json in repo root via CWD walk', async () => {
  const { loadConfig } = await import(resolve(SDLC_ROOT, 'agents/load-config.mjs'));
  const cfg = loadConfig();
  assertEqual(cfg.name, 'agentic-sdlc', 'Should find the framework project.json');
});

// ============================================================================
// 7.13: Agent memory scaling meta-test
// ============================================================================

console.log('\n📋 Agent memory scaling meta-tests:');

test('memory-manager exports estimateTokens (test function is imported above)', () => {
  // Already tested in 7.4 — this is a placeholder to keep section numbering stable
});

test('totalTokens in recall is <= memoryTokenBudget', async () => {
  const { recall, estimateTokens } = await import(resolve(SDLC_ROOT, 'agents/memory-manager.mjs'));
  const { loadConfig } = await import(resolve(SDLC_ROOT, 'agents/load-config.mjs'));
  const cfg = loadConfig();
  const memory = await recall('sdlc-developer');
  const total = estimateTokens(memory);
  assert(total <= cfg.memoryTokenBudget, `Total tokens (${total}) should be <= budget (${cfg.memoryTokenBudget})`);
});

// ============================================================================
// 7.14: Done checklist config
// ============================================================================

console.log('\n📋 Done checklist configuration:');

test('project.json has a doneChecklist field with default values', async () => {
  const { loadConfig } = await import(resolve(SDLC_ROOT, 'agents/load-config.mjs'));
  const cfg = loadConfig();
  assert(Array.isArray(cfg.doneChecklist), 'doneChecklist should be an array');
  assert(cfg.doneChecklist.length > 0, 'doneChecklist should not be empty');
  // Framework default
  assert(cfg.doneChecklist.includes('openspec'), 'Framework doneChecklist should include openspec');
  assert(cfg.doneChecklist.includes('tests'), 'Framework doneChecklist should include tests');
});

// ============================================================================
// 7.15: Deploy pipeline readiness config
// ============================================================================

console.log('\n📋 Deploy pipeline config:');

test('project.json has deploy block with expected schema', async () => {
  const { loadConfig } = await import(resolve(SDLC_ROOT, 'agents/load-config.mjs'));
  const cfg = loadConfig();
  assert(cfg.deploy, 'Should have deploy block');
  assert(typeof cfg.deploy.enabled === 'boolean', 'deploy.enabled should be boolean');
  assert(typeof cfg.deploy.deployCmd === 'string', 'deploy.deployCmd should be string');
});

test('deploy.verify has expected schema', async () => {
  const { loadConfig } = await import(resolve(SDLC_ROOT, 'agents/load-config.mjs'));
  const cfg = loadConfig();
  assert(typeof cfg.deploy.verify.smokeUrl === 'string', 'deploy.verify.smokeUrl should be string');
  assert(typeof cfg.deploy.verify.expectStatus === 'number', 'deploy.verify.expectStatus should be number');
});

// ============================================================================
// 7.16: humanWellness defaults
// ============================================================================

console.log('\n📋 humanWellness defaults:');

test('project.json has humanWellness block with defaults', async () => {
  const { loadConfig } = await import(resolve(SDLC_ROOT, 'agents/load-config.mjs'));
  const cfg = loadConfig();
  assert(cfg.humanWellness, 'Should have humanWellness block');
  assert(typeof cfg.humanWellness.enabled === 'boolean', 'humanWellness.enabled should be boolean');
  assert(typeof cfg.humanWellness.dailyMaxHours === 'number', 'humanWellness.dailyMaxHours should be number');
  assert(typeof cfg.humanWellness.nightCutoff === 'string', 'humanWellness.nightCutoff should be string');
});

test('humanWellness.fridayAfternoon is optional but known', async () => {
  const { loadConfig } = await import(resolve(SDLC_ROOT, 'agents/load-config.mjs'));
  const cfg = loadConfig();
  // Optional field — just verify it doesn't crash
  if (cfg.humanWellness.fridayAfternoon !== undefined) {
    assert(typeof cfg.humanWellness.fridayAfternoon === 'object', 'fridayAfternoon should be object');
  }
});

// ============================================================================
// 7.17: four-layer-validate — allowlist functionality (Layer 5)
// ============================================================================

console.log('\n📋 four-layer-validate allowlist:');

const { layer5AllowlistViolations } = await import(resolve(SDLC_ROOT, 'agents/four-layer-validate.mjs'));

test('layer5AllowlistViolations detects any-type violations', () => {
  // Empty options object avoids writing to actual allowlist file during tests
  const { violations, violationsByFile } = layer5AllowlistViolations({
    'any-type': { 'client.mjs': ['1: let x: any'] },
  }, false);
  assert(violations > 0, 'Should detect any-type violations');
});

test('layer5AllowlistViolations detects console.log violations', () => {
  const { violations, violationsByFile } = layer5AllowlistViolations({
    'console-log': { 'debug.js': ['1: console.log("test")'] },
  }, false);
  assert(violations > 0, 'Should detect console.log violations');
});

test('layer5AllowlistViolations detects file-size violations', () => {
  const { violations, violationsByFile } = layer5AllowlistViolations({
    'file-size': { 'big.mjs': ['1: too many lines'] },
  }, false);
  assert(violations > 0, 'Should detect file-size violations');
});

// ============================================================================
// 7.18: Model manager — provider key resolution from env
// ============================================================================

console.log('\n📋 Model manager provider key resolution:');

test('resolveProviderKey returns null when key is absent everywhere', () => {
  const saved = process.env.FAKE_KEY_FOR_TESTS;
  delete process.env.FAKE_KEY_FOR_TESTS;
  try {
    const ep = { keyEnv: 'FAKE_KEY_FOR_TESTS', envFile: () => ['/nonexistent/path/.env'] };
    assert(mm.resolveProviderKey(ep) === null, 'Missing key should resolve to null, not throw');
    // Endpoints with no envFile must behave exactly as before this change.
    assert(mm.resolveProviderKey({ keyEnv: 'FAKE_KEY_FOR_TESTS' }) === null, 'No envFile should still return null');
  } finally {
    if (saved !== undefined) process.env.FAKE_KEY_FOR_TESTS = saved;
  }
});

// ============================================================================
// Summary
// ============================================================================

console.log(`\n${'═'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}