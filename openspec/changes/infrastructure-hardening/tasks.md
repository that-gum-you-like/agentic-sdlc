## Change 1: Minimal package.json

- [ ] 1.1 Create package.json with: name, version (1.0.0), description, type:module, license:MIT, engines (node ≥ 18)
- [ ] 1.2 Add scripts block: test, test:behavior, assess, models, check, validate
- [ ] 1.3 Verify: `npm test` runs successfully
- [ ] 1.4 Verify: `node tests/adapter-and-model-manager.test.mjs` still works (unchanged)

## Change 2: .env.example

- [ ] 2.1 Create .env.example with all 13 env vars, grouped by purpose, with comments
- [ ] 2.2 Add .env to .gitignore (if not already present)

## Change 3: Assessment scoring fix

- [ ] 3.1 In maturity-assess.mjs assessDependencyHealth(): detect package.json with zero deps → score 3/5 "zero-dep by design"
- [ ] 3.2 In maturity-assess.mjs assessSecurity(): detect package.json with zero deps → skip npm audit gracefully, give credit for no-dep surface area
- [ ] 3.3 Re-run assessment and verify score improvement

## Change 4: Commit + push

- [ ] 4.1 Run all tests
- [ ] 4.2 Commit each change separately (independently revertable)
- [ ] 4.3 Push to GitHub
