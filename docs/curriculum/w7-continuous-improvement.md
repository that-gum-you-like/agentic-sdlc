# Workshop 7: Continuous Improvement

**Find the patterns. Defeat the patterns. Teach discipline.**

---

## Overview

| Duration | 60 minutes |
|----------|------------|
| Format | Pattern analysis + test-driven improvement |
| Output | Improvement loop, behavior tests, discipline framework |
| Prerequisites | Running agent team with memory system |

---

## Learning Objectives

By the end of this workshop, you will:
- Identify recurring failure patterns in agent behavior
- Use TDD to defeat patterns permanently
- Implement E2E tests that prevent regressions
- Teach discipline through test requirements
- Set up behavior testing for prompt changes
- Create a continuous improvement loop

---

## The Improvement Loop

Your agents will develop bad habits. Your job is to:

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│    ┌─────────┐     ┌─────────┐     ┌─────────┐         │
│    │  Find   │────▶│ Defeat  │────▶│  Teach  │         │
│    │ Pattern │     │ Pattern │     │Discipline│         │
│    └─────────┘     └─────────┘     └─────────┘         │
│         ▲                               │               │
│         │                               │               │
│         └───────────────────────────────┘               │
│                    Repeat                               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Phase 1: Find the Pattern

Look for:
- Same mistake appearing multiple times
- Workarounds you keep adding
- Manual fixes you repeat
- Reviewer feedback that recurs

**Sources of patterns:**
- Git history (same files getting fixed)
- Review comments (same feedback)
- Agent memories (same learnings repeated)
- Your own frustration ("not this again")

### Phase 2: Defeat the Pattern

Write a test that fails when the pattern occurs:

```python
# test_no_silent_fallbacks.py
def test_no_silent_fallbacks_in_codebase():
    """Defeat: Roy's silent fallback pattern."""
    pattern = r'\.get\([^,]+,\s*(0|None|\'\'|\"\")\)'

    for filepath in get_python_files('src/'):
        content = read_file(filepath)
        matches = re.findall(pattern, content)
        assert not matches, f"Silent fallback in {filepath}: {matches}"
```

Now the pattern **cannot return** without breaking CI.

### Phase 3: Teach Discipline

Add the test to the agent's requirements:

```markdown
# Agent: Roy

## Non-Negotiable Tests

Before any commit, these must pass:
- [ ] test_no_silent_fallbacks
- [ ] test_no_single_letter_vars
- [ ] test_assertions_on_all_mutations

You wrote these tests. You understand why. Passing them is discipline.
```

---

## TDD for Agent Behavior

**See also:**
- [Workshop 2 - Autonomous Workers#Testing Approach](#) - Foundation for TDD in autonomous agents
- [Workshop 5 - Anti-Pattern Detection#Senior Review Agent](#) - Reviews ensure TDD discipline
- [Workshop 6 - Agent Memory#Core Memories](#) - TDD becomes a core principle

### The Traditional TDD Cycle

```
Red → Green → Refactor
```

### The Agent TDD Cycle

```
Pattern Found → Test Written → Agent Trained → Pattern Defeated
```

### Example: The Citation Pattern

**Pattern found:** Cynthia fabricates citations.

**Test written:**
```python
# test_citation_validity.py
import pytest
from agents.cynthia import research_claim

def test_citations_are_verifiable():
    """Every citation must link to a real source."""
    result = research_claim("carbon capture effectiveness")

    for citation in result.citations:
        assert citation.url is not None, "Citation must have URL"
        assert verify_url_exists(citation.url), f"URL invalid: {citation.url}"
        assert citation.author in fetch_page_content(citation.url), \
            f"Author {citation.author} not found at {citation.url}"

def test_uncertain_claims_marked():
    """Claims without citations must be marked uncertain."""
    result = research_claim("speculative future technology")

    for claim in result.claims:
        if not claim.citations:
            assert "(needs citation)" in claim.text or claim.confidence < 0.5
```

**Agent trained:** Test added to Cynthia's pre-commit requirements.

**Pattern defeated:** Can't ship fabricated citations anymore.

---

## E2E Testing for Agents

### Why E2E, Not Just Unit Tests

Unit tests verify functions. E2E tests verify **behavior through the whole system**.

```
Unit Test: "Does this function validate citations?"
E2E Test:  "When Cynthia researches a topic, do the citations in the final
            output actually exist and say what she claims?"
```

### Agent E2E Test Structure

```python
# e2e/test_research_workflow.py

async def test_full_research_workflow():
    """E2E: Research claim → Critique → Validation → Output"""

    # Step 1: Cynthia researches
    research = await cynthia.research("climate adaptation strategies")
    assert research.citations, "Research must have citations"

    # Step 2: Sylvia critiques
    critique = await sylvia.critique(research)
    assert critique.methodology_check_passed

    # Step 3: Validate citations exist
    for citation in research.citations:
        response = await fetch(citation.url)
        assert response.status == 200, f"Citation URL broken: {citation.url}"

    # Step 4: Check final output format
    output = await format_research_output(research, critique)
    assert "Sources:" in output
    assert all(c.url in output for c in research.citations)
```

### E2E Tests Prevent Regressions

When you fix a bug, add an E2E test:

```python
# e2e/test_regressions.py

class TestRegressions:
    """Tests for bugs we've fixed. Never let them return."""

    async def test_citation_crisis_regression(self):
        """2024-03: Cynthia fabricated citations. Never again."""
        research = await cynthia.research("any topic")
        for citation in research.citations:
            # This would have caught the original bug
            assert await url_exists(citation.url)
            assert await page_mentions_author(citation.url, citation.author)

    async def test_nan_fallback_regression(self):
        """2024-04: Roy's ?? 0 fallback hid NaN. Never again."""
        result = await roy.run_simulation(seed=42)
        # Check no NaN anywhere in output
        assert not contains_nan(result.state)
        # Check no zeros where we expect positive values
        assert result.population > 0
        assert result.temperature != 0  # Can be negative, but not exactly 0
```

---

## Playwright: Automated User Testing

**See also:**
- [Workshop 2 - Autonomous Workers#Testing Approach](#) - Integration testing philosophy
- [Workshop 5 - Anti-Pattern Detection#Security Reviewer Agent](#) - Security testing with Playwright
- [Workshop 6 - Agent Memory#Episodic Memory](#) - Agents remember test failures and learn

**External resources:**
- [Playwright Documentation](https://playwright.dev/) - Official Playwright docs
- [Playwright Best Practices](https://playwright.dev/docs/best-practices) - Writing stable tests
- [Visual Regression Testing](https://playwright.dev/docs/test-snapshots) - Screenshot comparison

### Why Playwright for Agent Testing

Traditional E2E tests verify code behavior. Playwright tests verify **user experience** - the actual interface users interact with.

```
Unit Test:     Does the function work?
E2E Test:      Does the API return the right data?
Playwright:    Can a user actually use the feature?
```

**Playwright advantages:**
- Tests real browsers (Chrome, Firefox, Safari)
- Takes screenshots between actions (visual debugging)
- Handles modern web apps (SPAs, dynamic content)
- Parallel test execution
- Auto-waits for elements (no flaky tests)
- Cross-browser testing

### Setting Up Playwright

```bash
# Install Playwright
npm init playwright@latest

# Or for Python
pip install playwright
playwright install
```

### Basic Playwright Test Structure

```javascript
// tests/e2e/user-workflow.spec.js
import { test, expect } from '@playwright/test';

test('user can sign up and access dashboard', async ({ page }) => {
  // Navigate to app
  await page.goto('http://localhost:3000');

  // Screenshot: Starting point
  await page.screenshot({ path: 'screenshots/01-homepage.png' });

  // Click sign up button
  await page.click('button:has-text("Sign Up")');
  await page.screenshot({ path: 'screenshots/02-signup-form.png' });

  // Fill out form
  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('input[name="password"]', 'SecurePass123!');
  await page.fill('input[name="confirmPassword"]', 'SecurePass123!');
  await page.screenshot({ path: 'screenshots/03-form-filled.png' });

  // Submit
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard
  await page.waitForURL('**/dashboard');
  await page.screenshot({ path: 'screenshots/04-dashboard.png' });

  // Verify dashboard loaded
  await expect(page.locator('h1')).toContainText('Welcome');
  await expect(page.locator('[data-testid="user-email"]')).toContainText('test@example.com');
});
```

### Screenshot-Based Debugging

Playwright's killer feature: screenshots between every action.

```javascript
// tests/e2e/helpers.js
export async function debugStep(page, stepName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `screenshots/${timestamp}-${stepName}.png`;
  await page.screenshot({ path: filename, fullPage: true });
  console.log(`📸 Screenshot: ${filename}`);
}

// Usage in test
await debugStep(page, 'before-login');
await page.fill('input[name="email"]', 'user@example.com');
await debugStep(page, 'email-filled');
await page.fill('input[name="password"]', 'password');
await debugStep(page, 'password-filled');
await page.click('button[type="submit"]');
await debugStep(page, 'after-submit');
```

When agents run Playwright tests, screenshots show exactly what they saw.

### Playwright Agent System Prompt

```markdown
# Agent: User Testing Specialist

## Role
Run automated user tests with Playwright. Verify that features actually work from a user's perspective, not just from an API perspective.

## Workflow
1. Read feature description from OpenSpec proposal
2. Write Playwright test simulating user interaction
3. Run test and capture screenshots at each step
4. If test fails:
   - Analyze screenshots to see what went wrong
   - Check console errors
   - Verify element selectors
   - Fix test or report bug
5. If test passes:
   - Commit test to tests/e2e/
   - Add screenshots to review for human verification

## Testing Principles

### Screenshot Everything
Take screenshots between every significant action:
- Before clicking a button
- After clicking a button
- After form fills
- After navigation
- On errors

This creates a visual narrative of what happened.

### Use Data Test IDs
Prefer `data-testid` selectors over CSS:
```javascript
// Good
await page.click('[data-testid="submit-button"]');

// Fragile
await page.click('div.container > button.primary');
```

### Wait for Network Idle
For API-heavy apps, wait for network to settle:
```javascript
await page.goto('http://localhost:3000', {
  waitUntil: 'networkidle'
});
```

### Test Real User Flows
Don't just test features in isolation. Test complete user journeys:
- Sign up → Verify email → Complete profile → Use feature
- Search → Filter → Sort → Select → Purchase
- Create → Edit → Delete → Verify gone

## Tools Available
- Playwright browser automation
- Screenshot capture
- Network request interception
- Console log capture
- Video recording (for complex flows)
```

### Automated User Testing Example

```python
# autonomous_user_tester.py
from playwright.sync_api import sync_playwright
from pathlib import Path
import anthropic
import json

class UserTester:
    def __init__(self, base_url: str = "http://localhost:3000"):
        self.base_url = base_url
        self.screenshots_dir = Path("screenshots")
        self.screenshots_dir.mkdir(exist_ok=True)

    def test_user_flow(self, flow_description: dict) -> dict:
        """Run automated user test based on flow description."""
        results = {
            "flow": flow_description["name"],
            "passed": False,
            "screenshots": [],
            "errors": [],
            "console_logs": []
        }

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1280, "height": 720})
            page = context.new_page()

            # Capture console logs
            page.on("console", lambda msg: results["console_logs"].append({
                "type": msg.type,
                "text": msg.text
            }))

            # Capture errors
            page.on("pageerror", lambda err: results["errors"].append(str(err)))

            try:
                # Execute test steps
                for step_num, step in enumerate(flow_description["steps"], 1):
                    # Take screenshot before action
                    screenshot_path = self.screenshots_dir / f"{flow_description['name']}-{step_num:02d}-before.png"
                    page.screenshot(path=screenshot_path)
                    results["screenshots"].append(str(screenshot_path))

                    # Execute step
                    self._execute_step(page, step)

                    # Take screenshot after action
                    screenshot_path = self.screenshots_dir / f"{flow_description['name']}-{step_num:02d}-after.png"
                    page.screenshot(path=screenshot_path)
                    results["screenshots"].append(str(screenshot_path))

                results["passed"] = True

            except Exception as e:
                results["passed"] = False
                results["errors"].append(str(e))

                # Capture final error screenshot
                error_screenshot = self.screenshots_dir / f"{flow_description['name']}-error.png"
                page.screenshot(path=error_screenshot, full_page=True)
                results["screenshots"].append(str(error_screenshot))

            finally:
                browser.close()

        return results

    def _execute_step(self, page, step: dict):
        """Execute a single test step."""
        action = step["action"]

        if action == "navigate":
            page.goto(f"{self.base_url}{step['url']}")

        elif action == "click":
            page.click(step["selector"])

        elif action == "fill":
            page.fill(step["selector"], step["value"])

        elif action == "expect_text":
            element = page.locator(step["selector"])
            assert step["text"] in element.text_content(), \
                f"Expected '{step['text']}' not found in {step['selector']}"

        elif action == "expect_url":
            page.wait_for_url(f"**{step['pattern']}")

        elif action == "wait":
            page.wait_for_timeout(step["ms"])

        elif action == "screenshot":
            # Additional screenshot with custom name
            path = self.screenshots_dir / step["filename"]
            page.screenshot(path=path)

def run_autonomous_user_testing(openspec_change: str):
    """Run Playwright tests based on OpenSpec proposal."""

    # Read OpenSpec proposal
    proposal_path = Path(f"openspec/changes/{openspec_change}/proposal.md")
    proposal = proposal_path.read_text()

    # Use Claude to generate test flow from proposal
    client = anthropic.Anthropic()

    prompt = f"""Based on this feature proposal, generate a user test flow:

{proposal}

Return a JSON object with:
{{
  "name": "test-name",
  "steps": [
    {{"action": "navigate", "url": "/path"}},
    {{"action": "click", "selector": "[data-testid='button']"}},
    {{"action": "fill", "selector": "input[name='field']", "value": "test value"}},
    {{"action": "expect_text", "selector": "h1", "text": "Expected Text"}},
    {{"action": "expect_url", "pattern": "/success"}}
  ]
}}
"""

    message = client.messages.create(
        model="claude-sonnet-4",
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}]
    )

    # Parse test flow
    flow = json.loads(message.content[0].text)

    # Run test
    tester = UserTester()
    results = tester.test_user_flow(flow)

    # Generate report
    report_path = Path(f"test-reports/{openspec_change}-user-test.md")
    report_path.parent.mkdir(exist_ok=True)

    report = f"""# User Test Report: {openspec_change}

## Flow: {results['flow']}

**Status:** {"✅ PASSED" if results['passed'] else "❌ FAILED"}

## Steps Executed
{len(results['screenshots']) // 2} steps

## Screenshots
"""

    for screenshot in results['screenshots']:
        report += f"- `{screenshot}`\n"

    if results['errors']:
        report += "\n## Errors\n"
        for error in results['errors']:
            report += f"- {error}\n"

    if results['console_logs']:
        report += "\n## Console Logs\n"
        for log in results['console_logs'][-10:]:  # Last 10
            report += f"- [{log['type']}] {log['text']}\n"

    report_path.write_text(report)

    print(f"User test complete: {report_path}")
    print(f"Screenshots saved to: screenshots/")

    return results
```

### Visual Regression Testing

Catch unintended UI changes automatically:

```javascript
// tests/visual/visual-regression.spec.js
import { test, expect } from '@playwright/test';

test('homepage visual regression', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Take screenshot and compare to baseline
  await expect(page).toHaveScreenshot('homepage.png', {
    maxDiffPixels: 100  // Allow minor rendering differences
  });
});

test('dashboard visual regression', async ({ page }) => {
  // Login first
  await page.goto('http://localhost:3000/login');
  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('input[name="password"]', 'password');
  await page.click('button[type="submit"]');

  // Wait for dashboard
  await page.waitForURL('**/dashboard');

  // Compare to baseline
  await expect(page).toHaveScreenshot('dashboard.png', {
    maxDiffPixels: 100
  });
});
```

When visual regression tests fail, Playwright generates diff images showing exactly what changed.

### Integrating Playwright with Agent Workflow

```python
# Add to autonomous agent workflow
class AutonomousWorkerWithUserTesting:
    def implement_task(self, task: dict) -> bool:
        """Implement task with user testing."""

        # 1. Implement feature (existing workflow)
        implementation_success = self._implement_feature(task)

        if not implementation_success:
            return False

        # 2. Write unit tests (existing workflow)
        unit_tests_pass = self._write_and_run_unit_tests(task)

        if not unit_tests_pass:
            return False

        # 3. NEW: Write and run Playwright user test
        user_test_pass = self._write_and_run_user_test(task)

        if not user_test_pass:
            # Create OpenSpec proposal for UI fix
            self._create_ui_fix_proposal(task)
            return False

        # 4. Commit everything
        self._commit_changes(task)
        return True

    def _write_and_run_user_test(self, task: dict) -> bool:
        """Generate and run Playwright test for this feature."""

        # Use Claude to write Playwright test
        test_code = self._generate_playwright_test(task)

        # Save test
        test_file = Path(f"tests/e2e/{task['name']}.spec.js")
        test_file.write_text(test_code)

        # Run Playwright
        result = subprocess.run(
            ["npx", "playwright", "test", str(test_file)],
            capture_output=True,
            text=True
        )

        if result.returncode != 0:
            # Save failure screenshots for debugging
            print(f"User test failed. See screenshots/ for details.")
            print(result.stdout)
            print(result.stderr)
            return False

        return True
```

### Playwright Best Practices for Agents

```markdown
## Playwright Checklist for Agents

### Before Writing Test
- [ ] Read feature proposal completely
- [ ] Identify the user's goal (not just the feature)
- [ ] Map out the complete user journey

### Writing the Test
- [ ] Use data-testid selectors (ask frontend to add if missing)
- [ ] Take screenshots before and after each action
- [ ] Wait for network idle on navigation
- [ ] Test error cases (what if API fails?)
- [ ] Test edge cases (empty states, long text, etc.)

### After Test Runs
- [ ] Review all screenshots for visual correctness
- [ ] Check console logs for unexpected errors
- [ ] Verify test is stable (run 3 times)
- [ ] Add test to CI pipeline
- [ ] Document test in proposal
```

### Example: Complete User Journey Test

```javascript
// tests/e2e/complete-purchase-flow.spec.js
import { test, expect } from '@playwright/test';

test('user can complete full purchase journey', async ({ page }) => {
  // Step 1: Browse products
  await page.goto('http://localhost:3000/products');
  await page.screenshot({ path: 'screenshots/01-products-page.png' });

  // Step 2: Search for item
  await page.fill('input[data-testid="search"]', 'laptop');
  await page.click('button[data-testid="search-button"]');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'screenshots/02-search-results.png' });

  // Step 3: Filter by price
  await page.click('button[data-testid="filter-price"]');
  await page.click('input[data-testid="price-range-500-1000"]');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'screenshots/03-filtered-results.png' });

  // Step 4: Select product
  await page.click('[data-testid="product-card"]:first-child');
  await page.waitForURL('**/products/*');
  await page.screenshot({ path: 'screenshots/04-product-detail.png' });

  // Step 5: Add to cart
  await page.click('button[data-testid="add-to-cart"]');
  await expect(page.locator('[data-testid="cart-count"]')).toContainText('1');
  await page.screenshot({ path: 'screenshots/05-added-to-cart.png' });

  // Step 6: Go to cart
  await page.click('[data-testid="cart-icon"]');
  await page.waitForURL('**/cart');
  await page.screenshot({ path: 'screenshots/06-cart-page.png' });

  // Step 7: Proceed to checkout
  await page.click('button[data-testid="checkout"]');
  await page.waitForURL('**/checkout');
  await page.screenshot({ path: 'screenshots/07-checkout-page.png' });

  // Step 8: Fill shipping info
  await page.fill('input[name="address"]', '123 Main St');
  await page.fill('input[name="city"]', 'San Francisco');
  await page.fill('input[name="zip"]', '94102');
  await page.screenshot({ path: 'screenshots/08-shipping-filled.png' });

  // Step 9: Fill payment info
  await page.fill('input[name="cardNumber"]', '4242424242424242');
  await page.fill('input[name="expiry"]', '12/25');
  await page.fill('input[name="cvc"]', '123');
  await page.screenshot({ path: 'screenshots/09-payment-filled.png' });

  // Step 10: Submit order
  await page.click('button[data-testid="place-order"]');
  await page.waitForURL('**/order/confirmation/*');
  await page.screenshot({ path: 'screenshots/10-confirmation-page.png' });

  // Step 11: Verify confirmation
  await expect(page.locator('h1')).toContainText('Order Confirmed');
  await expect(page.locator('[data-testid="order-number"]')).toBeVisible();

  // Take final success screenshot
  await page.screenshot({
    path: 'screenshots/11-final-success.png',
    fullPage: true
  });
});
```

This test generates 11 screenshots showing the entire user journey. When it fails, you can see exactly where and why.

**Playwright integration:**
- [Workshop 2 - Autonomous Workers#Autonomous Worker Class](#) - Add Playwright testing to autonomous workflow
- [Workshop 5 - Anti-Pattern Detection#Security Reviewer Agent](#) - Use Playwright for security testing flows
- [Workshop 6 - Agent Memory#Episodic Memory](#) - Failed Playwright tests become memorable learning events
- [Workshop 2 - Autonomous Workers#Bug Tracking with OpenSpec](#) - Create bug proposals from Playwright failures

**Advanced Playwright patterns:**
- [Component Testing](https://playwright.dev/docs/test-components) - Test components in isolation
- [API Mocking](https://playwright.dev/docs/mock) - Control API responses during tests
- [Trace Viewer](https://playwright.dev/docs/trace-viewer) - Debug test failures with timeline view
- [Codegen](https://playwright.dev/docs/codegen) - Generate Playwright tests by recording interactions

---

## Teaching Discipline

### The Discipline Stack

```
Level 1: External Enforcement (Hooks)
         └─ Pre-commit rejects bad patterns

Level 2: Checklist Awareness (Review)
         └─ Senior reviewer checks against list

Level 3: Memory Integration (Self-Check)
         └─ Agent remembers past failures

Level 4: Internalized Discipline (Habit)
         └─ Agent automatically avoids patterns
```

### Moving Up the Stack

**Week 1:** External enforcement catches everything
```
Hook: REJECTED - silent fallback detected
Agent: Oh, I need to fix that
```

**Week 2:** Agent starts checking before commit
```
Agent: Wait, is this a silent fallback? Let me check...
Agent: Yes, I should use explicit error handling instead
```

**Week 4:** Pattern becomes automatic
```
Agent: [Writes explicit error handling by default]
Agent: [Doesn't even consider fallbacks anymore]
```

### Discipline Through Test Requirements

Add to agent system prompts:

```markdown
## Test Discipline

Before committing ANY code:

1. Run the full test suite: `npm test`
2. Specifically run E2E tests: `npm run test:e2e`
3. Check for pattern violations: `npm run check:patterns`

If any test fails:
- Fix the issue
- Understand WHY it failed
- Add to your memory if it's a new pattern
- Only then retry the commit

Tests are not obstacles. Tests are discipline. Tests are how you prove
you've learned from past mistakes.
```

---

## Behavior Testing Framework

### The Problem

When you change an agent's prompt, how do you know you didn't break something?

```markdown
Before: "Be concise in your responses"
After:  "Be extremely concise, use bullet points only"

Did this break the agent's ability to explain complex topics?
You won't know until it's too late.
```

### The Solution: Behavior Tests

```python
# tests/behavior/test_cynthia_behavior.py

class TestCynthiaBehavior:
    """Behavior tests for Cynthia's research agent."""

    def test_provides_citations(self):
        """Cynthia must always provide citations for claims."""
        response = prompt_agent("cynthia", "What is carbon capture?")
        assert extract_citations(response), "Response must include citations"

    def test_acknowledges_uncertainty(self):
        """Cynthia must acknowledge when evidence is weak."""
        response = prompt_agent("cynthia", "Will fusion power work by 2030?")
        uncertainty_markers = ["uncertain", "unclear", "debated", "might", "could"]
        assert any(m in response.lower() for m in uncertainty_markers)

    def test_no_fabrication(self):
        """Cynthia must not make up papers or authors."""
        response = prompt_agent("cynthia", "Research on X")
        citations = extract_citations(response)
        for c in citations:
            assert verify_citation_exists(c), f"Fabricated citation: {c}"

    def test_personality_maintained(self):
        """Cynthia should remain optimistic but grounded."""
        response = prompt_agent("cynthia", "Is climate change solvable?")
        # Should be hopeful but evidence-based
        assert "evidence" in response.lower() or "research" in response.lower()
        assert "impossible" not in response.lower()  # Not a pessimist
```

### Running Behavior Tests on Prompt Changes

```bash
# .github/workflows/agent-behavior.yml
name: Agent Behavior Tests

on:
  push:
    paths:
      - 'agents/*.md'  # Trigger on prompt changes

jobs:
  behavior-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run behavior tests
        run: pytest tests/behavior/ -v

      - name: Compare to baseline
        run: python scripts/compare_behavior_baseline.py
```

### Behavior Baselines

Store expected behaviors and compare:

```python
# scripts/compare_behavior_baseline.py

BASELINE = {
    "cynthia": {
        "citation_rate": 0.95,      # 95% of responses have citations
        "uncertainty_rate": 0.30,   # 30% acknowledge uncertainty
        "optimism_score": 0.7,      # Moderately optimistic
    },
    "sylvia": {
        "critique_rate": 0.90,      # 90% find something to critique
        "evidence_citation": 0.85,  # 85% cite counter-evidence
        "pessimism_score": 0.6,     # Moderately skeptical
    }
}

def compare_to_baseline(agent_name, current_metrics):
    baseline = BASELINE[agent_name]
    for metric, expected in baseline.items():
        actual = current_metrics[metric]
        drift = abs(actual - expected) / expected
        if drift > 0.20:  # 20% drift threshold
            raise BehaviorDriftError(
                f"{agent_name}.{metric} drifted {drift:.0%}: "
                f"expected {expected}, got {actual}"
            )
```

---

## Mobile Workflow with Claude Code

### The Problem

You're on your phone. You have an idea. You want to:
- Add something to the roadmap
- Kick off an agent task
- Check on progress

### The Solution: claude.ai/code

Access Claude Code from any device at **claude.ai/code**.

### Mobile Workflow Patterns

**Pattern 1: Add to Roadmap**
```
You: "Add a new requirement to ROADMAP.md:
      REQ-047: Add rate limiting to the API.
      Priority: High.
      Assign to Roy."

Claude: [Reads current roadmap]
        [Adds requirement in correct format]
        [Commits change]

You: [Done from your phone, Roy picks it up on next turn]
```

**Pattern 2: Kickoff Agent Work**
```
You: "Start Roy working on REQ-047 rate limiting"

Claude: [Creates handoff document]
        [Adds to Roy's task file]
        [Roy receives on next check]
```

**Pattern 3: Check Progress**
```
You: "What's the status of the agent team?"

Claude: [Checks git log for recent commits]
        [Reads task files]
        [Summarizes active work]

You: "Roy completed 3 tasks, Jen has 2 pending,
      merge orchestrator ran 5 times overnight"
```

### Setting Up Mobile Access

1. **Go to:** claude.ai/code
2. **Connect your repo** (GitHub integration)
3. **Bookmark** for quick access
4. **Use voice input** for faster mobile typing

### Mobile-Friendly Commands

Keep a cheat sheet:

```markdown
## Quick Mobile Commands

### Roadmap
- "Add requirement: [description]"
- "Show current phase progress"
- "What's blocking phase 2?"

### Agents
- "Start [agent] on [task]"
- "What is [agent] working on?"
- "Check agent queue depths"

### Review
- "Show recent commits"
- "Any failed tests?"
- "Summarize today's progress"
```

---

## The Pattern Defeat Cycle

**Integration with memory:**
- [Workshop 6 - Agent Memory#Episodic Memory](#) - Pattern defeats become memorable episodes
- [Workshop 6 - Agent Memory#Memory Compost](#) - Patterns are distilled and remembered
- [Workshop 5 - Anti-Pattern Detection#Evolving Your Checklist](#) - Defeated patterns update the checklist

### Step-by-Step Process

```markdown
## Pattern Defeat Template

### 1. Identify
**Pattern Name:** [Short descriptive name]
**First Noticed:** [Date]
**Frequency:** [How often it occurs]
**Impact:** [What goes wrong]

### 2. Analyze
**Root Cause:** [Why does this happen?]
**Agent(s) Affected:** [Who does this?]
**Trigger Conditions:** [When does it occur?]

### 3. Test
**Test Name:** test_[pattern_name]
**Test File:** tests/patterns/test_[pattern].py
**What It Checks:** [Specific condition]

### 4. Implement
**Code Changes:** [What was fixed]
**Prompt Changes:** [What was added to agent prompts]
**Memory Added:** [What agents should remember]

### 5. Verify
**Test Passing:** [ ] Yes
**Pattern Recurrence:** [ ] None in 7 days
**Checklist Updated:** [ ] Yes
```

### Real Example: The N+1 Query Pattern

```markdown
## Pattern Defeat: N+1 Queries

### 1. Identify
**Pattern Name:** N+1 Query Explosion
**First Noticed:** 2024-04-15
**Frequency:** Every new endpoint Roy builds
**Impact:** Database nearly crashed under load

### 2. Analyze
**Root Cause:** Roy uses loops to fetch related data
**Agent(s) Affected:** Roy (Backend)
**Trigger Conditions:** Any endpoint with relationships

### 3. Test
**Test Name:** test_no_n_plus_one_queries
**Test File:** tests/patterns/test_query_count.py
**What It Checks:** No endpoint makes more than 10 queries

```python
def test_no_n_plus_one_queries():
    with track_queries() as queries:
        response = client.get("/users?limit=100")

    assert len(queries) <= 10, \
        f"Endpoint made {len(queries)} queries (N+1 pattern?)"
```

### 4. Implement
**Code Changes:** Added query count assertion utilities
**Prompt Changes:** "Always use eager loading for relationships"
**Memory Added:** Core memory about the April database incident

### 5. Verify
**Test Passing:** [x] Yes
**Pattern Recurrence:** [x] None in 7 days
**Checklist Updated:** [x] Yes - "Use eager loading"
```

---

## Exercise 7.1: Pattern Hunt

**Time:** 15 minutes
**Output:** List of patterns to defeat

### Part A: Review Recent History (5 min)

Look at:
- Last 20 git commits
- Last 10 code review comments
- Agent memory files (recent learnings)
- Your own notes/frustrations

### Part B: Identify Top 3 Patterns (5 min)

For each pattern:
- Name it specifically
- Note frequency
- Estimate impact

### Part C: Prioritize (5 min)

Rank by: `Impact × Frequency = Priority`

---

## Exercise 7.2: Write a Defeat Test

**Time:** 20 minutes
**Output:** Working test that catches your #1 pattern

### Part A: Define the Test (5 min)

```python
def test_[your_pattern]():
    """
    Defeat: [Pattern name]
    Why: [What goes wrong]
    """
    # What should this test check?
```

### Part B: Implement (10 min)

Write the test. Make sure it:
- Fails when the pattern is present
- Passes when the pattern is absent
- Has a clear error message

### Part C: Add to CI (5 min)

Add to your pre-commit or CI pipeline.

---

## Exercise 7.3: Mobile Workflow Setup

**Time:** 10 minutes
**Output:** Working mobile access to your agent team

### Part A: Access claude.ai/code

1. Open claude.ai/code on your phone
2. Connect your repository
3. Verify you can read files

### Part B: Test Commands

Try:
- "Show me the current ROADMAP.md"
- "What commits happened today?"
- "Add a note to Roy's memory: Test the mobile workflow"

### Part C: Bookmark

Save for quick access. You now have mobile command of your agent team.

---

## Common Patterns to Watch For

### The Repeat Patterns

| Pattern | Symptom | Defeat Test |
|---------|---------|-------------|
| Silent Fallback | `.get(x, 0)` everywhere | Regex for fallback patterns |
| N+1 Query | Slow endpoints | Query count limits |
| Fabrication | Made-up citations | URL verification |
| God Function | 200-line functions | Line count limits |
| Catch-All File | utils.py grows forever | File line limits |

### The Drift Patterns

| Pattern | Symptom | Defeat Test |
|---------|---------|-------------|
| Personality Drift | Agent sounds different | Behavior baseline comparison |
| Quality Drift | Output getting sloppier | Quality metric tracking |
| Scope Creep | Agent doing too much | Responsibility boundary tests |

### The Coordination Patterns

| Pattern | Symptom | Defeat Test |
|---------|---------|-------------|
| Missed Handoff | Work falls through cracks | Handoff verification |
| Duplicate Work | Two agents do same thing | Work item uniqueness |
| Stale Context | Agent uses outdated info | Context freshness checks |

---

## What You'll Have After This Workshop

1. **Pattern identification skills** - You can spot recurring problems
2. **Defeat tests** - Tests that make patterns impossible (see [#TDD for Agent Behavior](#))
3. **Behavior testing** - Catch prompt regressions before they ship
4. **Discipline framework** - Agents that self-enforce quality (see [#Teaching Discipline](#))
5. **Mobile workflow** - Manage your team from anywhere (see [#Mobile Workflow with Claude Code](#))
6. **Improvement loop** - Continuous system for getting better (see [#The Improvement Loop](#))
7. **Playwright user testing** - Automated UI testing with screenshots (see [#Playwright Automated User Testing](#))

Your agent team now improves itself. Patterns are defeated permanently.

**Key integrations:**
- [Workshop 2 - Autonomous Workers](/Z2qHKfeUT9uVFKE1jwgIFQ) - Autonomous workers use these patterns
- [Workshop 5 - Anti-Pattern Detection](/WV6CvrfYS4aYvAy2SD0A7g) - Anti-pattern detection informs improvement
- [Workshop 6 - Agent Memory](/y5d2yqs6SWGyc8kPlWbQ3w) - Memory makes improvement stick across runs

---

## Next Steps

With all seven workshops complete, you have:
- A planning system
- Autonomous workers with execution cadence
- Orchestrated specialist agents
- Release management
- Anti-pattern detection with security
- Memory and character evolution
- Continuous improvement with discipline

**Go build something.**

---

*Previous: [Workshop 6 - Agent Memory and Evolution](/cgxxFwunQy-HDqYoujekzA)*

---

*Last Updated: November 2025*

→ Explore agent patterns in the [Agent Loop Bench](/tools/agent-loop-bench).
