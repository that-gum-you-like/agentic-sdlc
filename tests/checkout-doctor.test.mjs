import test from 'node:test';
import assert from 'node:assert/strict';
import { checkContainerMounts } from '../agents/checkout-doctor.mjs';

const HOME = '/home/tester';
const base = { home: HOME, checkouts: [`${HOME}/agentic-sdlc`] };
const ctr = (id, mounts) => ({ Id: id.padEnd(64, '0'), Name: `/hermes-${id}`, Mounts: mounts });

test('rw home mount reported', () => {
  const r = checkContainerMounts({ ...base, run: () => [ctr('a08d6519', [{ Source: HOME, Destination: '/workspace', RW: true }])] });
  assert.equal(r.exposed.length, 1);
  assert.equal(r.exposed[0].container, 'a08d65190000');
  assert.match(r.exposed[0].fix, /stop and recreate with a dedicated workspace/);
  assert.equal(r.exposed[0].source, HOME);
});
test('dedicated workspace mount clean', () => {
  const r = checkContainerMounts({ ...base, run: () => [ctr('3ea76145', [
    { Source: `${HOME}/.hermes/sandboxes/docker/x/workspace`, Destination: '/workspace', RW: true },
    { Source: HOME, Destination: '/ro', RW: false }]) ] });
  assert.equal(r.exposed.length, 0);
  assert.equal(r.containers.length, 1);
});
test('docker missing is a note', () => {
  const r = checkContainerMounts({ ...base, run: () => { throw new Error('spawn docker ENOENT'); } });
  assert.deepEqual(r.exposed, []);
  assert.match(r.notes[0], /docker unavailable/);
});
test('no containers is a note', () => {
  assert.match(checkContainerMounts({ ...base, run: () => [] }).notes[0], /no hermes containers/);
});
