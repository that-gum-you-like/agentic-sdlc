# Tasks: Extract Agentic SDLC to Standalone Repo

## Phase 1: OpenSpec Artifacts
- [x] Create proposal.md with Value Analysis
- [x] Create status.json
- [x] Create tasks.md

## Phase 2: Create Repo Structure
- [x] Initialize ~/agentic-sdlc/ directory
- [x] Create directory tree (framework/, agents/, skills/, docs/, openspec/, .claude/)

## Phase 3: Modify Scripts for Cross-Directory Operation
- [x] Rewrite load-config.mjs with project dir search logic
- [x] Externalize AGENT_DOMAINS in queue-drainer.mjs to domains.json
- [x] Fix all scripts to use config.agentsDir instead of __dirname

## Phase 4: Copy and Adapt Scripts
- [x] Copy all 15 .mjs scripts to ~/agentic-sdlc/agents/
- [x] Copy cycles/ and matrix-client/ subdirectories
- [x] Create template files (project.json.template, budget.json.template, etc.)

## Phase 5: Create Framework Docs
- [x] Split agentic-sdlc-maturity.md into framework/ files
- [x] Create docs/ reference files (safety, portability, agent-system, memory-protocol)

## Phase 6: Create CLAUDE.md and README.md
- [x] Write CLAUDE.md — full SDLC methodology entry point
- [x] Write README.md — human-readable overview

## Phase 7: Create setup.mjs Bootstrap
- [x] Interactive bootstrap script for new projects

## Phase 8: Copy OpenSpec Skills
- [x] Copy all 10 openspec-* skill directories

## Phase 9: Update LinguaFlow
- [x] Create agents/domains.json (extracted from queue-drainer.mjs)
- [x] Update CLAUDE.md to reference external SDLC repo

## Phase 10: Push to GitHub
- [x] git init + commit + push to that-gum-you-like/agentic-sdlc
- [x] Set up OpenClaw daily update cron

## Phase 11: Verification
- [x] All verification checks pass (6/6)
