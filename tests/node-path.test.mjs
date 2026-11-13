import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stableNodePath } from '../agents/lib/node-path.mjs';

const CELLAR = '/home/linuxbrew/.linuxbrew/Cellar/node/25.6.1/bin/node';
const STABLE = '/home/linuxbrew/.linuxbrew/bin/node';

test('Cellar path is replaced by the stable prefix symlink when it resolves to the same binary', () => {
  assert.equal(stableNodePath(CELLAR, { exists: () => true, real: () => CELLAR }), STABLE);
});
test('versioned node@NN formula is handled too', () => {
  assert.equal(stableNodePath('/opt/homebrew/Cellar/node@22/22.1.0/bin/node', { exists: () => true, real: p => '/same' }), '/opt/homebrew/bin/node');
});
test('stable symlink missing or pointing at a different binary -> keep the pinned path', () => {
  assert.equal(stableNodePath(CELLAR, { exists: () => false, real: p => p }), CELLAR);
  assert.equal(stableNodePath(CELLAR, { exists: () => true, real: p => p }), CELLAR);
  assert.equal(stableNodePath(CELLAR, { exists: () => { throw new Error('eacces'); }, real: p => p }), CELLAR);
});
test('non-Homebrew paths are returned unchanged', () => {
  assert.equal(stableNodePath('/usr/bin/node'), '/usr/bin/node');
});
test('sdlc-update unit renders the stable path by default (never a Cellar path)', async () => {
  const { renderUnit } = await import('../agents/sdlc-update.mjs');
  const out = renderUnit({ repo: '/r', template: 'ExecStart={{NODE}} {{REPO}}/agents/sdlc-update.mjs' });
  assert.doesNotMatch(out, /Cellar/);
});
