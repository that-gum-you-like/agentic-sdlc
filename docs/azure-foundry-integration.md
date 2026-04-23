# Azure / Microsoft Foundry Integration

This guide explains how Agentic SDLC fits alongside Microsoft Foundry, Azure OpenAI, and the Microsoft Agent Framework. The framework is **provider-neutral** — point its LLM adapter at Azure and nothing else about your workflow has to change.

## TL;DR — Where each piece lives

| Layer | Microsoft's offering | Agentic SDLC's role |
|---|---|---|
| Model hosting / inference | Azure OpenAI, Foundry Models (Claude, Mistral, Llama, etc.) | Delegates via LLM adapter |
| Single-agent authoring | Foundry Agent Service, Copilot Studio, Prompt Flow | Optional — your execution agents can *be* Foundry agents |
| Multi-agent orchestration | Microsoft Agent Framework (AutoGen + Semantic Kernel merged) | SDLC sits above it: task queues, domain routing, memory, budget, governance |
| Governance / SDLC discipline | Evals, content safety, Azure Policy | SDLC adds: OpenSpec workflow, defeat tests, maturity model, pattern hunt, review hooks |
| CI / deploy | Azure Pipelines, GitHub Actions | SDLC's validate/test/assess scripts run as CI steps |

**You are not replacing Foundry.** Foundry builds and serves individual agents; this framework coordinates a *team* of them over the software lifecycle.

## Quick start — point LLM adapters at Azure

Both adapters ship with the framework. No npm install required.

### Option A: Azure OpenAI (GPT-4o, o-series)

1. Deploy a model in Azure OpenAI and note the deployment name.
2. Export env vars:

```bash
export AZURE_OPENAI_ENDPOINT="https://<your-resource>.openai.azure.com"
export AZURE_OPENAI_API_KEY="..."           # or use AZURE_OPENAI_AUTH_TOKEN for Entra
```

3. Edit `agents/project.json`:

```json
{
  "llm": {
    "defaultProvider": "azure-openai",
    "azureOpenAI": {
      "deployments": { "gpt4o-prod": "gpt-4o", "o3-mini-prod": "o3-mini" }
    }
  }
}
```

4. Reference the **deployment name** (not the model id) wherever you pick a model (budget.json, agent config).

### Option B: Claude in Foundry (Anthropic Messages API)

1. Deploy a Claude model in Microsoft Foundry (requires **Enterprise or MCA-E subscription**, region **East US 2** or **Sweden Central**).
2. Export env vars:

```bash
export AZURE_FOUNDRY_ENDPOINT="https://<your-resource>.services.ai.azure.com"
export AZURE_FOUNDRY_API_KEY="..."          # or use AZURE_FOUNDRY_AUTH_TOKEN for Entra
```

3. Set `defaultProvider: "azure-foundry-claude"` and use deployment names like `claude-sonnet-4-6`, `claude-opus-4-7`, etc.

The adapter uses the **native Anthropic Messages API** (endpoint: `/anthropic/v1/messages`), so all Claude features carry over — `thinking`, `effort`, prompt caching, tool use, MCP connector.

### Pick the right auth

| Auth method | Header | Best for |
|---|---|---|
| API key | `api-key` (OpenAI) / `x-api-key` (Claude) | Local dev, quick tests |
| Entra ID (OAuth) | `Authorization: Bearer <token>` | Production — no long-lived secret, SSO, RBAC |

For Entra, acquire a token via `DefaultAzureCredential` (Azure CLI login works locally) with scope `https://ai.azure.com/.default` and set `AZURE_OPENAI_AUTH_TOKEN` or `AZURE_FOUNDRY_AUTH_TOKEN`. Tokens expire — either refresh per-call or run the framework behind an identity that can mint them on demand.

## Using Cursor + Agentic SDLC + Foundry together

Cursor reads `.cursorrules` automatically. Once this repo is integrated into your project, Cursor's agent picks up your SDLC rules (micro cycle, OpenSpec workflow, test discipline, etc.) and uses them for every turn.

**Seamless flow:**

1. Cursor's agent picks up a task via `queue-drainer.mjs run` (or you hand it one directly).
2. It follows the SDLC micro cycle: implement → test → commit, with memory read/write hooks.
3. When the agent needs an LLM call (e.g. from a script like `test-behavior.mjs` or a sub-task delegation), it calls through the configured LLM adapter — which points at Foundry/Azure OpenAI.
4. The token-spend is tracked by `cost-tracker.mjs`, which feeds back into `model-manager.mjs` for predictive swaps (e.g. falling back from Opus 4.7 to Sonnet 4.6 when budget tightens).

**If your organisation uses Microsoft Agent Framework agents already**, you have two integration patterns:

- **Wrap them as execution agents.** Create an AGENT.md referencing the Foundry agent id; have the worker prompt invoke the Foundry agent via its REST endpoint. The SDLC still owns the task queue, memory, and governance.
- **Call SDLC scripts from a Foundry agent tool.** Expose `queue-drainer.mjs`, `notify.mjs`, etc. as tools in a Foundry agent's manifest. This lets an organisation-wide Foundry agent pull work from your project's SDLC queue.

MCP and A2A are the lingua franca. Both Foundry and Claude-in-Foundry support them natively. If your agents speak MCP, they speak each other.

## CI/CD — Azure Pipelines

The framework's quality gates run in Azure Pipelines exactly the same way they do locally. Minimal `azure-pipelines.yml`:

```yaml
trigger: [main]

pool: { vmImage: 'ubuntu-latest' }

steps:
  - task: NodeTool@0
    inputs: { versionSpec: '20.x' }

  - script: |
      git clone https://github.com/that-gum-you-like/agentic-sdlc.git ../agentic-sdlc
    displayName: 'Fetch Agentic SDLC framework'

  - script: node ../agentic-sdlc/agents/four-layer-validate.mjs --files 'src/**/*.ts'
    displayName: 'SDLC anti-pattern scan'

  - script: node ../agentic-sdlc/agents/test-behavior.mjs
    displayName: 'Agent prompt quality check'
    condition: succeeded()

  - script: node ../agentic-sdlc/agents/maturity-assess.mjs
    displayName: 'Platform maturity report'
    continueOnError: true
```

For private Azure environments without internet egress, mirror this repo to Azure DevOps Repos and clone from there instead of GitHub.

## Microsoft Agent Framework interop

Microsoft Agent Framework (MAF — the merged AutoGen + Semantic Kernel, RC 1.0 Feb 2026, GA Q1 end 2026) is Microsoft's production-ready agent framework. Its strengths:

- First-class Anthropic/Claude agents (C# and Python)
- MCP and A2A out of the box
- Tight integration with Foundry Agent Service deployment

**When to use each:**

- Use **MAF** for building the agent itself — the prompt, tools, memory backend, deployed endpoint.
- Use **Agentic SDLC** for the workflow *around* the agent — task queue, domain routing, quality gates, budget, OpenSpec discipline.

They don't overlap. You can absolutely run MAF-built agents as your execution agents and keep SDLC's governance on top.

**Python/C# agents in an otherwise-Node framework.** The framework's execution layer is shell-based — `worker.mjs` generates a prompt and your agent tool consumes it. If your execution agent is a C# MAF app, just wrap its invocation in a shell script and point the worker at it. The SDLC doesn't care what language runs the agent; it only owns the surrounding protocol.

## Ethics & compliance — neutral framing

> **Editor's note:** the default providers (Anthropic direct, Groq, Gemini) are chosen to avoid routing through OpenAI weights. Azure OpenAI and OpenAI-via-Foundry still serve OpenAI models, even though data stays in your Azure tenant. If your organisation's policy prohibits OpenAI-trained weights regardless of hosting, prefer:
>
> - **Claude in Foundry** (this adapter's primary use) — Anthropic models, no OpenAI weights
> - **Azure AI Foundry Models from partners** — Mistral, Cohere, Llama, etc.
> - **Ollama on an Azure VM** — fully self-hosted open-weight models
>
> Conversely, if your organisation *requires* Azure/Entra-gated inference for data-residency or audit reasons, the Azure adapters meet those requirements while leaving model choice open. Each provider is an independent adapter — mix freely per agent in `budget.json`.

This is purely a hosting/provider choice; the framework stays provider-neutral and won't complain either way.

## Model deployment cheat sheet (April 2026)

| Model | Region(s) | Adapter | Eligibility |
|---|---|---|---|
| Claude Opus 4.7 / 4.6 / Sonnet 4.6 / Haiku 4.5 | East US 2, Sweden Central | `azure-foundry-claude` | Enterprise or MCA-E |
| GPT-4o / o3 / o1 families | Global Standard | `azure-openai` | Any paid Azure subscription |
| Mistral, Llama, Cohere (partner models) | Varies | `azure-openai`-style REST | Any paid Azure subscription |

Rate limits (Claude, Enterprise/MCA-E default): 2,000 RPM / 2M TPM for most Opus/Sonnet; 4,000 RPM / 4M TPM for Haiku. Request quota increases via Azure portal.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `401` from Azure OpenAI | Invalid key or wrong scope for Entra | Check `AZURE_OPENAI_API_KEY` or confirm Entra scope is `https://ai.azure.com/.default` |
| `404 Not Found` | Wrong deployment name or region | Check `options.model` matches an actual Foundry deployment, and region supports that model |
| `429` | Rate limit | Use `model-manager.mjs` fallback chain — it will auto-swap to a free provider (Groq/Gemini/Cerebras) |
| Claude returns `subscription eligibility error` | Non-Enterprise/MCA-E subscription | Claude in Foundry requires Enterprise or MCA-E. Fall back to Claude direct via `anthropic` adapter. |

## References

- [Deploy and use Claude models in Microsoft Foundry](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-claude)
- [Azure OpenAI v1 REST API](https://learn.microsoft.com/en-us/azure/foundry/openai/latest)
- [Microsoft Agent Framework (GitHub)](https://github.com/microsoft/agent-framework)
- [Claude Code on Microsoft Foundry](https://code.claude.com/docs/en/microsoft-foundry)
