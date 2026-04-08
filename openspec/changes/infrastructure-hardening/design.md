## Goals / Non-Goals

**Goals:**
- Close maturity assessment gaps with zero-risk changes
- Every change independently revertable with one git command
- Zero npm dependencies added — preserve `git clone && node` portability

**Non-Goals:**
- Adding a build system, bundler, or package manager
- Adding any runtime dependencies
- Changing how any existing script works

## Decisions

### D1: package.json is a manifest, not a dependency manager
It declares `"type": "module"` (already how Node treats .mjs files), engine requirements, and convenience scripts. Nothing else. No deps. No lock file (nothing to lock).

### D2: .env.example groups vars by purpose
Three groups: LLM Providers, Platform Integration, Runtime. Each var gets a one-line comment. No actual values — just `YOUR_KEY_HERE` placeholders.

### D3: npm scripts wrap existing commands exactly
`npm test` = `node tests/adapter-and-model-manager.test.mjs`. No additional logic, no pre/post hooks, no chaining. If the underlying command works, `npm test` works.

### D4: Assessment gives credit for intentional zero-dep design
If package.json exists and `dependencies` is empty or absent, score 3/5 ("Defined: deliberately zero-dependency for portability") instead of 0/5 ("no manifest"). Having a lock file with zero deps gets no extra credit since there's nothing to lock.

## Risks

- **[Risk] Someone adds deps to the empty package.json later** — This is fine and expected. The framework is set up so they CAN add deps if needed. The zero-dep design is a starting point, not a constraint.
- **[Risk] npm scripts confuse users who don't use npm** — The scripts are convenience aliases. All commands also work as `node path/to/script.mjs`. README documents both.
