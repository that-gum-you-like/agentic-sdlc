/**
 * state-dir.test.mjs — RS-REQ-010 (runtime-state-isolation)
 * Run: node --test tests/state-dir.test.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, statSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveStateDir, memoryPath, isLegacyMode, ensureStateDir, slugifyProject, isOwnedByUid,
} from '../agents/state-dir.mjs';

describe('state-dir (RS-REQ-010)', () => {
  const agentsDir = '/repo/agents';

  it('default path has project segment', () => {
    const dir = resolveStateDir({}, 'agentic-sdlc', '/home/u');
    assert.equal(dir, '/home/u/.local/state/sdlc/agentic-sdlc');
    assert.equal(
      memoryPath('sdlc-developer', 'core', { stateDir: dir, agentsDir }),
      '/home/u/.local/state/sdlc/agentic-sdlc/memory/sdlc-developer/core.json',
    );
  });

  it('XDG_STATE_HOME is honoured and project names are slugged', () => {
    assert.equal(resolveStateDir({ XDG_STATE_HOME: '/x' }, 'My Project', '/home/u'), '/x/sdlc/my-project');
    assert.equal(slugifyProject('  '), 'untitled-project');
  });

  it('legacy mode returns tracked path', () => {
    const env = { SDLC_STATE_DIR: 'legacy' };
    assert.equal(isLegacyMode(env), true);
    const dir = resolveStateDir(env, 'p', '/home/u');
    assert.equal(dir, 'legacy');
    assert.equal(memoryPath('a', 'recent', { stateDir: dir, agentsDir }), '/repo/agents/a/memory/recent.json');
  });

  it('env override wins', () => {
    assert.equal(resolveStateDir({ SDLC_STATE_DIR: '/custom/dir', XDG_STATE_HOME: '/x' }, 'p', '/h'), '/custom/dir');
    assert.equal(isLegacyMode({ SDLC_STATE_DIR: '/custom/dir' }), false);
  });

  it('created dirs are mode 0700', () => {
    const root = mkdtempSync(join(tmpdir(), 'rs-sd-'));
    try {
      const dir = join(root, 'a', 'b');
      ensureStateDir(dir);
      assert.equal(statSync(dir).mode & 0o777, 0o700);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('foreign-owned dir refused, nothing written', () => {
    const root = mkdtempSync(join(tmpdir(), 'rs-sd-'));
    try {
      const dir = join(root, 'owned-by-someone-else');
      mkdirSync(dir);
      const otherUid = (process.getuid?.() ?? 0) + 1;
      assert.equal(isOwnedByUid(dir, otherUid), false);
      assert.throws(() => ensureStateDir(dir, { uid: otherUid }), /not owned by uid/);
      assert.deepEqual(existsSync(join(dir, 'memory')), false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
