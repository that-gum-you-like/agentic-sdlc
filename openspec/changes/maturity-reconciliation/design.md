# Design — maturity-reconciliation

## The shared root cause

Both instruments fail the same way: **a status is inferred after the fact
instead of being recorded where it is known.**

- `maturity-assess.mjs` pushes evidence strings into a flat array, then at
  render time guesses each line's polarity from `e.includes('No ')`. The
  function that *knew* whether a check passed threw that knowledge away.
- `curriculum-conformance.md` records a status by hand, in prose, with nothing
  tying it to the artifact it describes. When PRs #20–#28 landed the code, the
  table had no reason to move.

So the fixes are the same shape in both places: carry the fact, don't re-derive
it.

## maturity-assess.mjs

### Evidence polarity

Replace bare strings with `{ text, ok }` records, emitted by the check that
already knows the answer:

```js
evidence.push(pass('Zero-dependency by design — maximum portability'));
evidence.push(fail('No CI/CD pipeline detected'));
```

`pass()`/`fail()` return `{ text, ok }`. The renderer reads `e.ok` instead of
sniffing the string. Backward compatibility matters here — `evidence` is
consumed by the report writer and potentially by callers of `assessProject()`
— so the renderer accepts **both** shapes: a plain string falls back to the
old substring heuristic. That keeps any external consumer working while every
in-repo check migrates to the explicit form.

This is what makes "No dependency vulnerabilities possible (zero attack
surface)" render as ✅: it is emitted by a passing branch, and it now says so.

### Deploy detection

The current probe encodes one deployment idiom (a shell script or an npm
script) as if it were the only one. Widen it to the evidence that a deploy
pipeline actually exists:

```js
const hasDeployScript =
  fileExists('scripts/deploy.sh') || fileExists('deploy.sh') ||
  readFile('package.json')?.includes('"deploy"') ||
  fileExists('agents/deploy-runner.mjs') ||          // framework-owned runner
  readFile('agents/project.json')?.includes('"deploy"'); // project deploy block
```

Deliberately **not** changed: the Dockerfile check. A zero-dependency
`git clone + node` framework has no container to ship, but "we don't need
containerization" is a design position, not evidence of deployment maturity,
and awarding a point for its absence would be inventing credit. Deployment &
Release will therefore rise to ~4.0/5 rather than 5.0/5, which is the honest
number: the dimension genuinely lacks a containerized release artifact.

## The drift guard

`tests/curriculum-conformance.test.mjs` parses the markdown tables and checks
each row's claim against the filesystem:

- Row says **Missing** but a backtick-quoted owner path exists → fail. This is
  the direction that actually bit us: nine shipped capabilities advertised as
  unbuilt.
- Row says **Solid** but its owner path does not exist → fail. The opposite
  drift — claiming credit for something deleted or never built.

Parsing rules, chosen so the guard stays useful rather than brittle:

- Only `` `backticked` `` tokens that look like repo paths (contain `/` or end
  in a known extension) are treated as owner references. Prose like "one doc
  section" is ignored.
- A row passes if **any** referenced path exists. Owner cells routinely list
  several files plus a narrative; requiring all of them would fail on
  parenthetical mentions and archived spec paths.
- Rows whose owner cell references only `openspec/changes/archive/…` are
  skipped: archived specs describe work that may have been re-homed elsewhere,
  so their presence proves nothing either way.
- Status is read from the second column, matched case-insensitively on the
  leading word (`Solid`, `Partial`, `Missing`), so decorations like
  `**Solid (new)**` and `Solid (fixed)` parse correctly.

`Partial` rows are not asserted in either direction — "exists but incomplete"
is a judgement the filesystem cannot adjudicate, and forcing it would make the
guard noisy enough to be disabled, which is worse than not having it.

## What this change does not do

It does not move the overall maturity number by tuning weights, add a
Dockerfile to score a point, or re-open any of the nine closed gaps. The
framework is at Level 6 on the authoritative ladder; the work here is making
the instruments say so truthfully, including where they still say 4.
