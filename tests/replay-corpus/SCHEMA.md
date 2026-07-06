# Replay Corpus Schema

Each JSON file in this directory captures one past deterministic code path (prompt builder, output generator, etc.) for regression testing. The harness loads all `*.json` files, re-runs the same builder/code path with the fixed inputs, and asserts the deterministic expectations.

## File naming

`<agent-role>-<scenario>.json` — e.g. `reviewer-pr-review.json`, `worker-prompt-assembly.json`.

## JSON Schema

```jsonc
{
  // Unique identifier for this corpus entry
  "id": "reviewer-pr-review",

  // Human-readable description of what this trace captures
  "description": "buildReviewPrompt from pr-auto-review.mjs with a typical task input",

  // Fixed input passed to the builder function
  "input": {
    // Any shape — passed verbatim to the builder function
  },

  // Deterministic expectations — at least one of the three MUST be non-empty
  "expected": {
    // Strings that MUST appear in the output (substring match)
    "mustContain": ["safety checklist", "verdict"],

    // Strings that MUST NOT appear in the output
    "mustNotContain": ["OPENROUTER_API_KEY"],

    // Regex patterns that MUST match somewhere in the output
    "mustMatch": ["\\{\"verdict\":\\s*\"(approve|reject)\""]
  },

  // Metadata
  "metadata": {
    "builderFunction": "buildReviewPrompt",
    "module": "agents/pr-auto-review.mjs",
    "capturedAt": "2026-05-15T12:34:00Z"
  }
}
```

## Field reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique identifier within the corpus directory |
| `description` | string | yes | Human-readable summary of the captured scenario |
| `input` | object | yes | Fixed inputs to the builder/code path |
| `expected.mustContain` | string[] | no* | Substrings the harness MUST find in the output |
| `expected.mustNotContain` | string[] | no* | Substrings the harness MUST NOT find in the output |
| `expected.mustMatch` | string[] | no* | Regex patterns the harness MUST match against the output |
| `metadata.builderFunction` | string | no | Name of the function that generated this output |
| `metadata.module` | string | no | Module path (relative to repo root) containing the builder |
| `metadata.capturedAt` | string | no | ISO 8601 timestamp of when this trace was captured |

\* At least one of `mustContain`, `mustNotContain`, or `mustMatch` must be non-empty.

## Validation rules

1. Every `*.json` file MUST conform to this schema (all required fields present)
2. At least one expectation array MUST be non-empty
3. `expected.mustContain` and `expected.mustNotContain` are exact substring checks (no regex escaping)
4. `expected.mustMatch` entries are JavaScript `RegExp` patterns — test with `new RegExp(pattern).test(output)`
5. If the corpus directory is empty, the harness MUST fail (not skip)
6. If any file fails schema validation, the harness MUST fail