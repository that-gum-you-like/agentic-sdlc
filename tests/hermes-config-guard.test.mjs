import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkHermesConfig, parseTerminalBlock } from '../agents/hermes-config-guard.mjs';

const HOME = '/home/tester';
const CHECKOUTS = [`${HOME}/agentic-sdlc`, `${HOME}/tally`];
const dir = mkdtempSync(join(tmpdir(), 'rs-guard-'));
let n = 0;
function cfg(terminal) {
  const p = join(dir, `c${n++}.yaml`);
  writeFileSync(p, `model:\n  name: x\nterminal:\n${terminal}\nweb:\n  backend: searxng\n`);
  return p;
}
const run = (terminal, extra = {}) => checkHermesConfig({ configPath: cfg(terminal), home: HOME, checkouts: CHECKOUTS, cwd: HOME, ...extra });

test('flag true + home cwd -> fail', () => {
  const r = run('  cwd: .\n  docker_mount_cwd_to_workspace: true  # c');
  assert.equal(r.ok, false);
  assert.equal(r.failures[0].key, 'terminal.docker_mount_cwd_to_workspace');
  assert.match(r.failures[0].value, /true/);
});
test('flag true + dedicated workspace cwd -> pass', () => {
  const r = run(`  cwd: ${HOME}/.hermes/workspaces/agentic-sdlc\n  docker_mount_cwd_to_workspace: true`);
  assert.equal(r.ok, true);
});
test('flag false + home cwd -> pass', () => {
  assert.equal(run('  cwd: .\n  docker_mount_cwd_to_workspace: false').ok, true);
});
test('rw volume of live checkout -> fail', () => {
  const r = run(`  docker_mount_cwd_to_workspace: false\n  docker_volumes:\n    - "${HOME}/agentic-sdlc:/workspace"`);
  assert.equal(r.ok, false);
  assert.match(r.failures[0].reason, /live checkout/);
});
test('ro volume permitted only when listed', () => {
  const t = `  docker_volumes:\n    - ${HOME}/tally:/ref:ro`;
  assert.equal(run(t).ok, false);
  assert.equal(run(t, { allowRoVolumes: [`${HOME}/tally`] }).ok, true);
});
test('missing config -> pass with note', () => {
  const r = checkHermesConfig({ configPath: join(dir, 'nope.yaml'), home: HOME, checkouts: [] });
  assert.equal(r.ok, true);
  assert.match(r.notes[0], /no Hermes config/);
});
test('never writes the config', () => {
  const p = cfg('  cwd: .\n  docker_mount_cwd_to_workspace: true');
  const before = readFileSync(p, 'utf8');
  checkHermesConfig({ configPath: p, home: HOME, checkouts: CHECKOUTS, cwd: HOME });
  assert.equal(readFileSync(p, 'utf8'), before);
});
test('workspace mount is per project', () => {
  const ok = run(`  docker_volumes:\n    - ${HOME}/.hermes/workspaces/tally:/workspace`);
  assert.equal(ok.ok, true);
  const bad = run(`  docker_volumes:\n    - ${HOME}/.hermes/workspaces:/workspace`);
  assert.equal(bad.ok, true); // under .hermes, not a checkout or ancestor of home
  assert.equal(run(`  docker_volumes:\n    - ${HOME}:/workspace`).ok, false);
});
test('mount source is not the live checkout', () => {
  assert.equal(run(`  docker_volumes:\n    - ${HOME}/agentic-sdlc/agents:/workspace`).ok, false);
  assert.equal(run(`  docker_volumes:\n    - /home:/workspace`).failures[0].reason.includes('ancestor'), true);
});
test('file ownership is the human uid', () => {
  const f = join(dir, 'owned'); writeFileSync(f, 'x');
  assert.equal(execFileSync('stat', ['-c', '%u', f], { encoding: 'utf8' }).trim(), String(process.getuid()));
});
test('live checkout status unchanged after sandbox write', () => {
  const live = join(dir, 'live'); mkdirSync(live);
  const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
  git(live, 'init', '-q', '-b', 'main'); writeFileSync(join(live, 'a.txt'), '1'); git(live, 'add', '.'); git(live, 'commit', '-qm', 'i');
  const ws = join(dir, 'workspaces', 'proj');
  git(live, 'worktree', 'add', '-q', '-b', 'sandbox/work', ws, 'HEAD');
  const before = git(live, 'status', '--porcelain');
  writeFileSync(join(ws, 'new.txt'), 'sandbox'); writeFileSync(join(ws, 'a.txt'), 'changed');
  git(ws, 'add', '.'); git(ws, 'commit', '-qm', 'sandbox');
  assert.equal(git(live, 'status', '--porcelain'), before);
  assert.equal(git(ws, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'sandbox/work');
  assert.equal(readFileSync(join(live, 'a.txt'), 'utf8'), '1');
  assert.match(git(live, 'branch', '--list', 'sandbox/work'), /sandbox\/work/); // output returns as a branch
});
test('parseTerminalBlock handles lists, quotes and comments', () => {
  const t = parseTerminalBlock('terminal:\n  a: true # c\n  l:\n    - "x:y"\n  b: s\nother:\n  a: false\n');
  assert.deepEqual(t, { a: true, l: ['x:y'], b: 's' });
});
test.after(() => rmSync(dir, { recursive: true, force: true }));
