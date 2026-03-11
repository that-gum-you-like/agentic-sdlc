# Proposal: Extract Agentic SDLC into Standalone GitHub Repo

## Summary
Extract the universal Agentic SDLC framework from `/home/bryce/languageapp/agents/` into a standalone GitHub repo (`that-gum-you-like/agentic-sdlc`) so it can be cloned on any machine and used with any project.

## Value Analysis

### Who benefits?
- **Bryce** — consistent SDLC methodology across all current and future projects
- **New projects** — instant setup via `setup.mjs` bootstrap script
- **Multi-device workflow** — clone repo + `claude` = full SDLC guidance anywhere

### What happens if we don't build this?
- SDLC scripts remain trapped inside LinguaFlow repo
- New projects require manual copy-paste and adaptation
- Framework improvements only benefit LinguaFlow

### Success Metrics
- [ ] `gh repo view that-gum-you-like/agentic-sdlc` succeeds
- [ ] `claude` in `~/agentic-sdlc/` loads SDLC rules via CLAUDE.md
- [ ] `node ~/agentic-sdlc/agents/queue-drainer.mjs status` works from any project dir
- [ ] `node ~/agentic-sdlc/setup.mjs` bootstraps a new project end-to-end
- [ ] Daily auto-update via OpenClaw cron

## Scope
- Copy and generalize 15+ agent scripts
- Create templates for project-specific config
- Modify `load-config.mjs` for cross-directory operation
- Externalize `AGENT_DOMAINS` from queue-drainer
- Create `setup.mjs` interactive bootstrap
- Write comprehensive `CLAUDE.md` entry point
- Push to GitHub, set up daily update cron
- Update LinguaFlow to reference external repo

## Out of Scope
- Migrating LinguaFlow-specific agent memories, AGENT.md files, or task queues
- Changing how LinguaFlow currently operates (backward compatible)
