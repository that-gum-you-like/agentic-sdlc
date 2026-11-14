#!/usr/bin/env node
/**
 * speak.test.mjs — Tests for Piper TTS / CV-REQ-114.
 *
 * Asserts:
 *   1. resolveVoice() returns default for unknown agents
 *   2. resolveVoice() reads from budget.json character.voice when present
 *   3. resolveVoice() reads from per-agent core.json character.voice
 *   4. speak() with a stub piper writes a WAV file
 *   5. speak() returns { outputPath, voice }
 *   6. No network modules are imported in speak.mjs (hardware kill-switch)
 *
 * Run: node tests/speak.test.mjs
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

import { resolveVoice, speak } from '../agents/speak.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_DIR = resolve(__dirname, '..');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  process.stdout.write(`  ${name} ... `);
  let threw = false;
  let err;
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      result.then(
        () => { console.log('OK'); passed++; },
        (e) => { console.log('FAIL'); failures.push({ name, err: e.message }); failed++; },
      );
      return;
    }
  } catch (e) {
    threw = true;
    err = e;
  }
  if (threw) {
    console.log('FAIL');
    failures.push({ name, err: err.message });
    failed++;
  } else {
    console.log('OK');
    passed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a stub piper script that writes a minimal WAV file. */
function createStubPiper(dir) {
  const piperPath = join(dir, 'piper');
  const script = `#!/usr/bin/env node
// Stub piper: reads --model and --output-file args, writes a minimal WAV
const { writeFileSync } = require('fs');
const idx = process.argv.indexOf('--output-file');
if (idx === -1 || idx + 1 >= process.argv.length) {
  process.stderr.write('piper: missing --output-file\\n');
  process.exit(1);
}
const outPath = process.argv[idx + 1];
// Minimal 44-byte WAV header + 1 sample
const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36, 4); // file size - 8
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);  // chunk size
header.writeUInt16LE(1, 20);   // PCM
header.writeUInt16LE(1, 22);   // mono
header.writeUInt32LE(22050, 24); // sample rate
header.writeUInt32LE(44100, 28); // byte rate
header.writeUInt16LE(2, 32);  // block align
header.writeUInt16LE(16, 34); // bits per sample
header.write('data', 36);
header.writeUInt32LE(0, 40); // data size
writeFileSync(outPath, header);
`;
  writeFileSync(piperPath, script);
  return piperPath;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log('speak tests (CV-REQ-114)');

test('resolveVoice returns default for unknown agent', () => {
  assert(resolveVoice('__nonexistent__') === 'default', 'should return default');
});

test('resolveVoice returns default when no character.voice in core.json', () => {
  // sdlc-developer has no character block in its core.json
  assert(resolveVoice('sdlc-developer') === 'default', 'should fall back to default');
});

test('resolveVoice reads from core.json character.voice when present', () => {
  const testDir = join(tmpdir(), 'speak-test-core-' + Date.now());
  const agentsDir = join(testDir, 'agents', 'test-agent', 'memory');
  mkdirSync(agentsDir, { recursive: true });
  try {
    writeFileSync(join(agentsDir, 'core.json'), JSON.stringify({
      character: { voice: 'test-voice' }
    }));
    assert(resolveVoice('test-agent', testDir) === 'test-voice', 'should read from per-agent core.json');
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test('resolveVoice reads from budget.json character.voice when present', () => {
  const testDir = join(tmpdir(), 'speak-test-budget-' + Date.now());
  const agentsDir = join(testDir, 'agents');
  const budgetPath = join(agentsDir, 'budget.json');
  mkdirSync(agentsDir, { recursive: true });
  try {
    writeFileSync(budgetPath, JSON.stringify({
      agents: {
        'test-agent': { model: 'test', character: { voice: 'budget-voice' } }
      }
    }));
    assert(resolveVoice('test-agent', testDir) === 'budget-voice', 'should read from budget.json');
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test('speak with stub piper writes a WAV file and returns metadata', () => {
  const testDir = join(tmpdir(), 'speak-test-' + Date.now());
  mkdirSync(testDir, { recursive: true });
  const stubPath = createStubPiper(testDir);
  const outFile = join(testDir, 'output.wav');

  try {
    const result = speak('sdlc-developer', 'hello world', {
      piperBin: `node ${stubPath}`,
      outputPath: outFile,
    });

    assert(existsSync(outFile), 'WAV file must exist after speak()');
    assert(result.outputPath === outFile, 'returned outputPath must match requested path');
    assert(result.voice === 'default', 'default voice when no character.voice configured');
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test('speak with custom voice override', () => {
  const testDir = join(tmpdir(), 'speak-test-voice-' + Date.now());
  mkdirSync(testDir, { recursive: true });
  const stubPath = createStubPiper(testDir);
  const outFile = join(testDir, 'custom.wav');

  try {
    const result = speak('any-agent', 'test text', {
      piperBin: `node ${stubPath}`,
      outputPath: outFile,
      voice: 'custom-voice',
    });

    assert(existsSync(outFile), 'WAV file must exist');
    assert(result.voice === 'custom-voice', 'voice must match override');
  } finally {
    rmSync(testDir, { recursive: true, force: true });
  }
});

test('speak.mjs does not import any network module', () => {
  const source = readFileSync(resolve(PROJECT_DIR, 'agents', 'speak.mjs'), 'utf8');
  const networkImports = [
    'from \'http\'',
    'from \'https\'',
    'from \'net\'',
    'from \'dgram\'',
    'import \'http\'',
    'import \'https\'',
    'import { fetch',
    'from \'undici\'',
    'from \'node-fetch\'',
    'from \'axios\'',
  ];

  for (const imp of networkImports) {
    const re = new RegExp(imp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (re.test(source)) {
      throw new Error(`Network import found: ${imp} — violates hardware kill-switch rule (CV-REQ-114)`);
    }
  }
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

setTimeout(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    for (const f of failures) {
      console.log(`  ✗ ${f.name}: ${f.err}`);
    }
    process.exit(1);
  }
}, 50);
