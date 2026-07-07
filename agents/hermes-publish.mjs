#!/usr/bin/env node
/**
 * hermes-publish.mjs — human-gated promotion of a tool the Hermes sandbox built
 * into your REAL local filesystem. Keeps the "sandbox builds, you push to local"
 * security posture: the agent only ever writes inside its Docker sandbox; YOU
 * run this to review and promote a file out. Reads ONLY from the sandbox zone
 * (~/.hermes/sandboxes/…), shows a preview/diff, asks to confirm, then copies to
 * the destination (auto chmod +x for scripts). Zero deps.
 *
 *   node agents/hermes-publish.mjs <source> <dest> [--yes] [--exec] [--sandbox <name>]
 *
 *   <source>   file inside the sandbox — relative to its workspace/ or home/,
 *              or an absolute path (must resolve inside the sandbox zone)
 *   <dest>     where to put it locally (a file, or a dir; ~ expands)
 *   --yes      skip the confirmation prompt (required in non-interactive shells)
 *   --exec     force the executable bit (scripts with a shebang get it anyway)
 *   --sandbox  sandbox profile name (default: "default")
 *
 * Exports (for tests): SANDBOX_BASE, resolveSource, isInSandbox, publish
 */

import { fileURLToPath } from 'node:url';
import { resolve, dirname, join, basename, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import fs from 'node:fs';
import readline from 'node:readline';

const __filename = fileURLToPath(import.meta.url);
// Overridable for tests; defaults to the real Hermes sandbox root.
export const SANDBOX_BASE = process.env.HERMES_SANDBOX_BASE || join(homedir(), '.hermes', 'sandboxes');

function expandHome(p) {
  return p.startsWith('~') ? join(homedir(), p.slice(1)) : p;
}

/** A resolved absolute path is safe to read ONLY if it lives under the sandbox zone. */
export function isInSandbox(absPath) {
  const base = resolve(SANDBOX_BASE) + '/';
  return (resolve(absPath) + '/').startsWith(base);
}

/**
 * Resolve <source> to an absolute path inside the sandbox. Relative sources are
 * looked up under the sandbox's workspace/ then home/. Throws if not found or
 * outside the sandbox zone.
 */
export function resolveSource(source, sandbox = 'default') {
  const root = join(SANDBOX_BASE, 'docker', sandbox);
  const candidates = isAbsolute(source)
    ? [source]
    : [join(root, 'workspace', source), join(root, 'home', source)];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) {
      const abs = fs.realpathSync(c);
      if (!isInSandbox(abs)) {
        throw new Error(`refusing: ${source} resolves outside the sandbox zone (${SANDBOX_BASE})`);
      }
      return abs;
    }
  }
  throw new Error(`source not found in sandbox '${sandbox}': ${source} (looked in workspace/ and home/)`);
}

function naiveDiffSummary(oldText, newText) {
  const o = oldText.split('\n'), n = newText.split('\n');
  const oset = new Set(o), nset = new Set(n);
  const added = n.filter((l) => !oset.has(l)).length;
  const removed = o.filter((l) => !nset.has(l)).length;
  return { added, removed };
}

/**
 * Promote a sandbox file to a local destination.
 * @returns {{dest:string, mode:number, overwrote:boolean}}
 */
export function publish(source, dest, { sandbox = 'default', exec = false } = {}) {
  const abs = resolveSource(source, sandbox);
  const content = fs.readFileSync(abs);
  let target = resolve(expandHome(dest));
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    target = join(target, basename(abs));
  }
  const overwrote = fs.existsSync(target);
  fs.mkdirSync(dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  const isScript = content.slice(0, 2).toString() === '#!';
  const mode = exec || isScript ? 0o755 : (fs.statSync(abs).mode & 0o777);
  fs.chmodSync(target, mode);
  return { dest: target, mode, overwrote };
}

function confirm(question) {
  return new Promise((res) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (a) => { rl.close(); res(/^y(es)?$/i.test(a.trim())); });
  });
}

const __isMainModule = process.argv[1] && resolve(process.argv[1]) === __filename;
if (__isMainModule) {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith('--') && !a.includes('=')));
  const sandbox = (argv.find((a) => a.startsWith('--sandbox=')) || '').split('=')[1]
    || (flags.has('--sandbox') ? argv[argv.indexOf('--sandbox') + 1] : 'default');
  const positional = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--sandbox');
  const [source, dest] = positional;
  const yes = flags.has('--yes');
  const exec = flags.has('--exec');

  (async () => {
    try {
      if (!source || !dest) {
        console.error('Usage: hermes-publish.mjs <source> <dest> [--yes] [--exec] [--sandbox <name>]');
        process.exit(1);
      }
      const abs = resolveSource(source, sandbox);
      const content = fs.readFileSync(abs, 'utf8');
      let target = resolve(expandHome(dest));
      if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = join(target, basename(abs));

      console.log(`\n  from (sandbox): ${abs}`);
      console.log(`  to   (local):   ${target}`);
      console.log(`  size: ${Buffer.byteLength(content)} bytes${content.slice(0, 2) === '#!' ? '  · executable script' : ''}`);
      if (fs.existsSync(target)) {
        const { added, removed } = naiveDiffSummary(fs.readFileSync(target, 'utf8'), content);
        console.log(`  ⚠ overwrites existing file  (~+${added} / -${removed} lines)`);
      }
      console.log('  ── preview (first 40 lines) ──');
      console.log(content.split('\n').slice(0, 40).map((l) => '  │ ' + l).join('\n'));
      console.log('  ──────────────────────────────\n');

      if (!yes) {
        if (!process.stdin.isTTY) {
          console.error('✗ refusing to promote without --yes in a non-interactive shell');
          process.exit(1);
        }
        if (!(await confirm('  Promote this file to your local? [y/N] '))) {
          console.log('  aborted — nothing written.');
          process.exit(0);
        }
      }
      const r = publish(source, target, { sandbox, exec });
      console.log(`  ✅ published → ${r.dest}  (mode ${r.mode.toString(8)}${r.overwrote ? ', overwrote' : ''})`);
    } catch (e) {
      console.error(`✗ ${e.message}`);
      process.exit(1);
    }
  })();
}
