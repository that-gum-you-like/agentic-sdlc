#!/usr/bin/env node
/**
 * speak.mjs — Local Piper text-to-speech output for agents.
 *
 * Reads an agent's `character.voice` from their per-agent core.json (or
 * budget.json), feeds text to a local Piper binary, and writes a WAV file.
 * No network calls are made for synthesis (CV-REQ-114, hardware kill-switch).
 *
 * Usage:
 *   node agents/speak.mjs <agent> <text>          # Speak text with agent's voice
 *   node agents/speak.mjs <agent> <text> --output <path>  # Custom output path
 *
 * Exports (for tests):
 *   resolveVoice(agentName) → string
 *   speak(agentName, text, opts) → { outputPath, voice }
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_DIR = resolve(__dirname, '..');

const DEFAULT_VOICE = 'default';

/**
 * Resolve the voice setting for an agent.
 *
 * Search order:
 *   1. agents/budget.json → agents.<agent>.character.voice
 *   2. agents/<agent>/memory/core.json → character.voice
 *   3. Fall back to 'default'
 *
 * @param {string} agentName
 * @param {string} [projectDir] - Project root directory (defaults to PROJECT_DIR)
 * @returns {string} voice name
 */
export function resolveVoice(agentName, projectDir = PROJECT_DIR) {
  // 1. Check budget.json
  const budgetPath = resolve(projectDir, 'agents', 'budget.json');
  if (existsSync(budgetPath)) {
    try {
      const budget = JSON.parse(readFileSync(budgetPath, 'utf8'));
      const agent = budget.agents?.[agentName];
      if (agent?.character?.voice && typeof agent.character.voice === 'string') {
        return agent.character.voice;
      }
    } catch (parseErr) {
      console.debug(`speak.mjs: parse error reading ${budgetPath}: ${parseErr.message}`);
    }
  }

  // 2. Check per-agent core.json
  const corePath = resolve(projectDir, 'agents', agentName, 'memory', 'core.json');
  if (existsSync(corePath)) {
    try {
      const core = JSON.parse(readFileSync(corePath, 'utf8'));
      if (core?.character?.voice && typeof core.character.voice === 'string') {
        return core.character.voice;
      }
    } catch (parseErr) {
      console.debug(`speak.mjs: parse error reading ${corePath}: ${parseErr.message}`);
    }
  }

  return DEFAULT_VOICE;
}

/**
 * Speak text using the local Piper TTS engine.
 *
 * @param {string} agentName - Agent name (for voice resolution)
 * @param {string} text - Text to speak
 * @param {object} [opts]
 * @param {string} [opts.voice] - Override voice (defaults to resolved agent voice)
 * @param {string} [opts.outputPath] - Output WAV path
 * @param {string} [opts.piperBin] - Path to piper binary (default: 'piper' on PATH)
 * @returns {{ outputPath: string, voice: string }}
 */
export function speak(agentName, text, opts = {}) {
  const voice = opts.voice || resolveVoice(agentName);
  const piperBin = opts.piperBin || 'piper';
  const outputPath = opts.outputPath || resolve(
    PROJECT_DIR, 'pm', 'media',
    `${Date.now()}-${agentName.replace(/[^a-zA-Z0-9_-]/g, '_')}.wav`
  );

  // Ensure output directory exists
  const outDir = dirname(outputPath);
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  // Pipe text through piper — reads from stdin, writes WAV to --output-file
  // Piper usage: echo "text" | piper --model <voice> --output-file <path>
  execSync(`${piperBin} --model "${voice}" --output-file "${outputPath}"`, {
    input: text,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'pipe'],
  });

  return { outputPath, voice };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------
const __isMainModule = process.argv[1] && resolve(process.argv[1]) === __filename;
if (__isMainModule) {
  const args = process.argv.slice(2);

  // Parse --output flag
  let outputPath = null;
  const textParts = [];
  let i = 0;
  while (i < args.length) {
    if (args[i] === '--output' && i + 1 < args.length) {
      outputPath = resolve(args[i + 1]);
      i += 2;
    } else if (i === 0) {
      // First positional arg is agent name
      i++;
    } else {
      textParts.push(args[i]);
      i++;
    }
  }

  const agent = args[0];
  const text = textParts.join(' ').trim();

  if (!agent || !text) {
    console.error('Usage: node agents/speak.mjs <agent> <text> [--output <path>]');
    process.exit(1);
  }

  try {
    const result = speak(agent, text, outputPath ? { outputPath } : {});
    console.log(`✓ spoken by "${agent}" (voice: ${result.voice}) → ${result.outputPath}`);
  } catch (err) {
    console.error(`✗ speak failed: ${err.message}`);
    process.exit(1);
  }
}
