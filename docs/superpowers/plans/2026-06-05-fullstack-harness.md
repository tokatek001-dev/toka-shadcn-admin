# Full-Stack Feature Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `/build-feature` slash command backed by a `Workflow` script that runs a design → frontend → QA pipeline against this Vite + React + shadcn admin repo.

**Architecture:** A thin slash command (`.claude/commands/build-feature.md`) invokes a deterministic `Workflow` script (`.claude/workflows/build-feature.js`) with three phases. Designer expands input (brief or Figma URL) into a JSON spec; Frontend implements against the spec and runs lint+build; QA spawns the dev server and drives Playwright MCP to verify acceptance criteria. QA failures loop back to Frontend (max 2 retries). All inter-phase state passes as schema-validated JSON; per-run artifacts go to `.claude/runs/<run-id>/` (gitignored).

**Tech Stack:** Claude Code `Workflow` tool, Playwright MCP, Figma MCP (optional), Node-style JS (no transpile), pnpm, Vite.

**Spec:** `docs/superpowers/specs/2026-06-05-fullstack-harness-design.md`

---

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `.claude/workflows/build-feature.js` | Create | Workflow meta, prompts, schemas, control flow |
| `.claude/commands/build-feature.md` | Create | Slash command wrapper that invokes the workflow |
| `.gitignore` | Modify | Add `.claude/runs/` |
| `README.md` | Modify | Add `## Harness` section with usage docs |

Single workflow file keeps prompts, schemas, and orchestration colocated — they change together. ~150–200 LoC total.

---

### Task 1: Bootstrap directory layout and gitignore

**Files:**
- Modify: `.gitignore` (append)
- Create: `.claude/workflows/` (directory)
- Create: `.claude/commands/` (directory)

- [ ] **Step 1: Add ignore rule for run artifacts**

Append to `.gitignore`:

```
# Claude Code harness — per-run artifacts (specs, impls, QA reports, screenshots)
.claude/runs/
```

- [ ] **Step 2: Create directories**

Run: `mkdir -p .claude/workflows .claude/commands`
Expected: directories exist, no output.

- [ ] **Step 3: Commit**

```bash
git add .gitignore .claude
git commit -m "chore(harness): scaffold .claude dirs and ignore run artifacts"
```

---

### Task 2: Add JSON schemas for inter-phase contracts

**Files:**
- Create: `.claude/workflows/build-feature.js` (initial — schemas only)

- [ ] **Step 1: Write schema constants**

Create `.claude/workflows/build-feature.js` with ONLY the schemas and meta block (rest comes in later tasks). This isolates the schema decisions for review before they get used in prompts.

```js
export const meta = {
  name: 'build-feature',
  description: 'Design → Frontend → QA pipeline for toka-shadcn-admin',
  phases: [
    { title: 'Design',   detail: 'spec from brief or Figma URL' },
    { title: 'Frontend', detail: 'implement against spec' },
    { title: 'QA',       detail: 'Playwright E2E against acceptance criteria' },
  ],
}

const SPEC_SCHEMA = {
  type: 'object',
  required: ['title', 'route', 'components', 'dataModel', 'states', 'edgeCases', 'acceptanceCriteria', 'filesToTouch'],
  properties: {
    title: { type: 'string' },
    route: { type: 'string', description: 'TanStack Router path, e.g. /users/bulk-edit' },
    components: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'role'],
        properties: {
          name: { type: 'string' },
          role: { type: 'string' },
          props: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    dataModel: {
      type: 'object',
      required: ['entities', 'mutations'],
      properties: {
        entities: { type: 'array', items: { type: 'string' } },
        mutations: { type: 'array', items: { type: 'string' } },
      },
    },
    states: { type: 'array', items: { type: 'string' } },
    edgeCases: { type: 'array', items: { type: 'string' } },
    acceptanceCriteria: { type: 'array', items: { type: 'string' }, minItems: 1 },
    filesToTouch: { type: 'array', items: { type: 'string' } },
  },
}

const IMPL_SCHEMA = {
  type: 'object',
  required: ['filesChanged', 'routesAdded', 'devServerCommand', 'testTargetUrl', 'summary'],
  properties: {
    filesChanged: { type: 'array', items: { type: 'string' } },
    routesAdded: { type: 'array', items: { type: 'string' } },
    devServerCommand: { type: 'string' },
    testTargetUrl: { type: 'string' },
    summary: { type: 'string', description: 'Must confirm pnpm lint + pnpm build passed' },
  },
}

const QA_SCHEMA = {
  type: 'object',
  required: ['passed', 'criteriaResults', 'consoleErrors', 'screenshots'],
  properties: {
    passed: { type: 'boolean' },
    criteriaResults: {
      type: 'array',
      items: {
        type: 'object',
        required: ['criterion', 'passed'],
        properties: {
          criterion: { type: 'string' },
          passed: { type: 'boolean' },
          evidence: { type: 'string' },
        },
      },
    },
    consoleErrors: { type: 'array', items: { type: 'string' } },
    screenshots: { type: 'array', items: { type: 'string' } },
    failureReport: { type: 'string', description: 'Markdown report fed back to frontend on retry' },
  },
}
```

- [ ] **Step 2: Verify file parses**

Run: `node --check .claude/workflows/build-feature.js`
Expected: exit 0, no output.

- [ ] **Step 3: Commit**

```bash
git add .claude/workflows/build-feature.js
git commit -m "feat(harness): add inter-phase JSON schemas and workflow meta"
```

---

### Task 3: Add designer prompt builders

**Files:**
- Modify: `.claude/workflows/build-feature.js` (append below schemas)

- [ ] **Step 1: Append designer prompt functions**

Add to `.claude/workflows/build-feature.js`:

```js
function designerBriefPrompt(brief) {
  return `You are the Designer agent for the toka-shadcn-admin repo (Vite + React 19 + TanStack Router + shadcn/ui).

Your job: expand the feature brief below into a concrete, implementable spec consistent with house conventions.

Steps:
1. Read 2–3 representative files under src/features/ to learn naming, file layout, and component composition.
2. Read 1–2 files under src/routes/ to learn TanStack Router file-based route conventions.
3. Skim src/components/ui/ to know which shadcn primitives exist (avoid inventing new ones).
4. Produce the spec.

Brief:
"""
${brief}
"""

Rules:
- Route must be a TanStack Router path that fits existing route hierarchy.
- Components must reuse src/components/ui/* primitives where possible.
- acceptanceCriteria must be concrete, observable, QA-testable assertions ("Submitting the form with an empty name field shows a 'Name is required' error under the input").
- Do NOT write any code. Your final output is the structured spec only.`
}

function designerFigmaPrompt(figmaUrl) {
  return `You are the Designer agent for the toka-shadcn-admin repo (Vite + React 19 + TanStack Router + shadcn/ui).

Your job: read the Figma file below via the Figma MCP and produce a spec the Frontend agent can implement.

Figma URL: ${figmaUrl}

Steps:
1. Call mcp__claude_ai_Figma__get_design_context for the URL.
2. Call mcp__claude_ai_Figma__get_screenshot for a visual reference.
3. Call mcp__claude_ai_Figma__get_variable_defs to capture design tokens.
4. Read 2–3 files under src/features/ and src/components/ui/ to map Figma components to shadcn primitives.
5. Produce the spec.

Rules:
- Route must be a TanStack Router path consistent with existing routes (pick a sensible one if Figma doesn't dictate).
- Map Figma components to shadcn primitives in the components array.
- acceptanceCriteria must be concrete, observable assertions.
- Do NOT write any code. Your final output is the structured spec only.`
}
```

- [ ] **Step 2: Verify file parses**

Run: `node --check .claude/workflows/build-feature.js`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add .claude/workflows/build-feature.js
git commit -m "feat(harness): add designer prompt builders for brief and Figma inputs"
```

---

### Task 4: Add frontend prompt builder

**Files:**
- Modify: `.claude/workflows/build-feature.js` (append)

- [ ] **Step 1: Append frontend prompt function**

```js
function frontendPrompt(spec, lastFix) {
  const retryBlock = lastFix
    ? `\n\nThis is a retry. QA reported the following failure last attempt — fix it:\n\n${lastFix}\n`
    : ''

  return `You are the Frontend agent for the toka-shadcn-admin repo (Vite + React 19 + TanStack Router + TanStack Query + shadcn/ui).

Implement the feature described in the spec below. Follow existing conventions exactly.

Spec:
\`\`\`json
${JSON.stringify(spec, null, 2)}
\`\`\`
${retryBlock}
Conventions to follow:
- TanStack Router file-based routes under src/routes/. Route file name follows the route path.
- Co-locate feature code under src/features/<feature-name>/.
- Use shadcn/ui primitives from src/components/ui/. Do NOT install new packages.
- Forms: react-hook-form + zod resolver.
- Server state: TanStack Query (queryKey factories live next to the feature).
- Tailwind classes; cn() helper for conditional classes.
- TypeScript strict — no \`any\`, no \`@ts-ignore\`.

Mandatory verification before returning:
1. Run: pnpm lint  — must exit 0.
2. Run: pnpm build — must exit 0.

In your summary field, state explicitly: "pnpm lint: PASS, pnpm build: PASS". If either failed, do NOT return success — fix and re-run.

Output only the structured implementation summary.`
}
```

- [ ] **Step 2: Verify file parses**

Run: `node --check .claude/workflows/build-feature.js`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add .claude/workflows/build-feature.js
git commit -m "feat(harness): add frontend prompt builder with retry support"
```

---

### Task 5: Add QA prompt builder

**Files:**
- Modify: `.claude/workflows/build-feature.js` (append)

- [ ] **Step 1: Append QA prompt function**

```js
function qaPrompt(spec, impl) {
  return `You are the QA agent for the toka-shadcn-admin repo. You drive a real browser via the Playwright MCP to verify the implemented feature against acceptance criteria.

Spec acceptance criteria:
${spec.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Implementation summary:
\`\`\`json
${JSON.stringify(impl, null, 2)}
\`\`\`

Procedure:
1. Start the dev server: use the Bash tool with run_in_background: true, command: "${impl.devServerCommand || 'pnpm dev'}". Save the shell_id.
2. Poll readiness: call mcp__plugin_ecc_playwright__browser_navigate to "${impl.testTargetUrl}". If it fails with connection refused, wait 2s and retry. Cap at 15 retries (~30s). If still failing, fail the run with a clear error and skip remaining steps.
3. If the route is auth-gated, sign in first: navigate to /sign-in, fill the email and password inputs with the values of env vars E2E_TEST_EMAIL and E2E_TEST_PASSWORD (read via Bash: echo \$E2E_TEST_EMAIL), then submit. If those env vars are unset, record this as a skipped criterion rather than a failure.
4. For each acceptance criterion: navigate, interact (browser_click / browser_type / browser_fill_form), call browser_snapshot for the assertion, and record a screenshot via browser_take_screenshot into .claude/runs/<run-id>/screenshots/ (mkdir -p first; <run-id> is a short timestamp like 20260605-143022).
5. After each step, call browser_console_messages. Any "error" level message means consoleErrors gets it appended; that fails the criterion.
6. Always — even on early failure — call browser_close, then kill the dev server via Bash: kill the saved shell_id.

Output rules:
- passed = true ONLY if every criterion's passed === true AND consoleErrors is empty.
- If passed === false, fill failureReport with a markdown breakdown the Frontend agent can act on: which criterion failed, what the page showed, the relevant selector / element / console message, and a concrete suggestion.
- screenshots is an array of file paths (one per criterion).`
}
```

- [ ] **Step 2: Verify file parses**

Run: `node --check .claude/workflows/build-feature.js`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add .claude/workflows/build-feature.js
git commit -m "feat(harness): add QA prompt builder with Playwright procedure"
```

---

### Task 6: Add workflow control flow (main body)

**Files:**
- Modify: `.claude/workflows/build-feature.js` (append the orchestration body)

- [ ] **Step 1: Append the orchestration body**

```js
// ─── Orchestration ───────────────────────────────────────────────

if (!args || typeof args !== 'string' || args.trim() === '') {
  throw new Error('build-feature requires an args string: either a feature brief or a Figma URL.')
}

const input = args.trim()
const isFigma = input.startsWith('https://www.figma.com/') || input.startsWith('https://figma.com/')

log(`Input: ${isFigma ? 'Figma URL' : 'brief'} (${input.slice(0, 80)}${input.length > 80 ? '…' : ''})`)

phase('Design')
const spec = await agent(
  isFigma ? designerFigmaPrompt(input) : designerBriefPrompt(input),
  { schema: SPEC_SCHEMA, agentType: 'Explore', label: 'designer' }
)
log(`Spec: ${spec.title} @ ${spec.route} — ${spec.acceptanceCriteria.length} acceptance criteria`)

let qa = null
let attempt = 0
let lastFix = null
const MAX_ATTEMPTS = 3

while (attempt < MAX_ATTEMPTS) {
  const label = attempt === 0 ? 'Frontend' : `Frontend (retry ${attempt})`
  phase(label)
  const impl = await agent(
    frontendPrompt(spec, lastFix),
    { schema: IMPL_SCHEMA, label: `frontend:${attempt}` }
  )
  log(`Impl ${attempt}: ${impl.filesChanged.length} files changed, target ${impl.testTargetUrl}`)

  const qaLabel = attempt === 0 ? 'QA' : `QA (retry ${attempt})`
  phase(qaLabel)
  qa = await agent(
    qaPrompt(spec, impl),
    { schema: QA_SCHEMA, label: `qa:${attempt}` }
  )
  log(`QA ${attempt}: passed=${qa.passed}, ${qa.criteriaResults.filter(c => c.passed).length}/${qa.criteriaResults.length} criteria, ${qa.consoleErrors.length} console errors`)

  if (qa.passed) break
  lastFix = qa.failureReport || 'QA reported failure but no failureReport was provided.'
  attempt++
}

return {
  spec,
  qa,
  attempts: attempt + 1,
  passed: qa?.passed === true,
}
```

- [ ] **Step 2: Verify file parses**

Run: `node --check .claude/workflows/build-feature.js`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add .claude/workflows/build-feature.js
git commit -m "feat(harness): add workflow orchestration with QA retry loop"
```

---

### Task 7: Add the slash command wrapper

**Files:**
- Create: `.claude/commands/build-feature.md`

- [ ] **Step 1: Write the slash command**

Create `.claude/commands/build-feature.md`:

```markdown
---
name: build-feature
description: Run the full-stack feature harness (design → frontend → QA) for this repo. Pass a feature brief or a Figma URL as args.
---

The user invoked `/build-feature` with the following input:

\`\`\`
$ARGUMENTS
\`\`\`

Run the harness workflow now:

1. Call the `Workflow` tool with `{ name: 'build-feature', args: '<the input above>' }`.
2. When it completes, summarize for the user: spec title, route, attempts taken, whether QA passed, and the screenshot paths.
3. If `passed: false` after 3 attempts, surface the final `qa.failureReport` and recommend next steps (review the diff, run `pnpm dev` manually, or refine the brief and retry).

Do NOT do the design/frontend/QA work in the main loop — delegate everything to the workflow.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/commands/build-feature.md
git commit -m "feat(harness): add /build-feature slash command wrapper"
```

---

### Task 8: Document the harness in README

**Files:**
- Modify: `README.md` (append a `## Harness` section)

- [ ] **Step 1: Append Harness section**

Locate the bottom of `README.md` and append:

````markdown
## Harness — `/build-feature`

A multi-agent pipeline that turns a feature brief or a Figma URL into a working, QA-verified feature in this repo. Runs three phases: **Design → Frontend → QA**, with up to 2 automatic retries when QA fails.

### Usage

```bash
# Brief input
/build-feature "Add a bulk-edit dialog to the users table with confirmation step."

# Figma input
/build-feature https://www.figma.com/file/abc123/My-Design?node-id=1-2
```

### Pipeline

1. **Designer** (read-only) expands the input into a JSON spec: route, components, data model, states, edge cases, acceptance criteria.
2. **Frontend** implements the spec using TanStack Router routes, shadcn primitives, react-hook-form + zod, and TanStack Query. Must pass `pnpm lint` and `pnpm build` before handing off.
3. **QA** spawns `pnpm dev`, drives Playwright via MCP, and verifies each acceptance criterion. Failures loop back to Frontend (max 2 retries).

### Requirements

- Playwright MCP server connected (`mcp__plugin_ecc_playwright__*`).
- Figma MCP server connected if passing Figma URLs (`mcp__claude_ai_Figma__*`).
- For auth-gated features: `E2E_TEST_EMAIL` and `E2E_TEST_PASSWORD` set in `.env.local` (Supabase test user).

### Artifacts

Each run writes to `.claude/runs/<run-id>/` (gitignored):
- `spec.json`, `impl-<n>.json`, `qa-<n>.json` — schema-validated phase outputs
- `screenshots/` — one per acceptance criterion

### Cost

Each run uses 3–6 subagent invocations. Expect roughly $0.50–$2.00 per feature on Sonnet.

### Extending

Edit `.claude/workflows/build-feature.js`:
- Prompts and JSON schemas live as constants at the top of the file.
- Control flow (retry count, phase ordering) lives in the orchestration block at the bottom.
- To add a new role (e.g. backend agent), add a prompt builder + schema and insert a new `phase()` + `agent()` call.
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(harness): document /build-feature usage and pipeline"
```

---

### Task 9: Smoke-test the slash command and workflow

This task validates the harness end-to-end against a tiny, low-risk input. It is meant to be run manually by you (the human operator), not by an agent — the workflow itself spawns agents.

**Files:** None — read-only verification.

- [ ] **Step 1: Pick a trivial brief**

Use this brief for the smoke test (small, unauthed, minimal data needs):

> "Add a `/about` route that displays a static About page with the app name, version (read from package.json), and a single 'Visit GitHub' link button using the shadcn Button component."

- [ ] **Step 2: Run the slash command**

In Claude Code:

```
/build-feature Add a /about route that displays a static About page with the app name, version (read from package.json), and a single 'Visit GitHub' link button using the shadcn Button component.
```

- [ ] **Step 3: Verify the workflow runs all phases**

Open `/workflows` in Claude Code. Expected: three phase groups appear in order (Design → Frontend → QA), each with one agent. Designer uses the Explore agent type. QA shows browser_navigate / browser_snapshot tool calls.

- [ ] **Step 4: Verify the result**

Expected on success:
- `passed: true` in the workflow result.
- New file under `src/routes/` (e.g. `src/routes/about.tsx` or under the existing route group).
- `pnpm lint` and `pnpm build` still pass after the run.
- `.claude/runs/<run-id>/screenshots/` contains at least one screenshot.

- [ ] **Step 5: Manual verification in the browser**

Run: `pnpm dev`
Navigate to `http://localhost:5173/about`
Expected: page renders with app name, version, and a working "Visit GitHub" button.

- [ ] **Step 6: If smoke test passed, commit the generated feature**

```bash
git add src
git commit -m "feat: add /about route via /build-feature harness smoke test"
```

If it failed, do NOT commit the partial changes. Read the failure report, decide whether the harness needs fixing or the brief needs refining, and iterate.

---

## Self-Review

**Spec coverage check:**
- Goal/Non-Goals/Assumptions — covered in plan header and Task 9 (smoke test against unauthed route validates the "auth blocks QA before Supabase migration" mitigation).
- Pipeline diagram — implemented in Task 6.
- Designer agent (brief + Figma paths) — Task 3.
- Frontend agent (with retry support, lint+build gate) — Task 4.
- QA agent (Playwright procedure, screenshots, dev server lifecycle) — Task 5.
- Workflow control flow (3-attempt loop) — Task 6.
- File layout (`.claude/workflows/`, `.claude/commands/`, `.claude/runs/` gitignored) — Tasks 1, 2, 7.
- Deliverable #1 (workflow.js) — Tasks 2–6.
- Deliverable #2 (slash command) — Task 7.
- Deliverable #3 (.gitignore) — Task 1.
- Deliverable #4 (README) — Task 8.

**Placeholder scan:** No TBD/TODO. All code blocks are concrete. No "similar to Task N" refs. Schema field names used in prompts (`acceptanceCriteria`, `devServerCommand`, `testTargetUrl`, `failureReport`) all match the schema definitions in Task 2.

**Type consistency:**
- `SPEC_SCHEMA.acceptanceCriteria` → used in `qaPrompt` (Task 5) ✓
- `IMPL_SCHEMA.devServerCommand` / `testTargetUrl` → used in `qaPrompt` (Task 5) ✓
- `QA_SCHEMA.failureReport` → consumed by `frontendPrompt(spec, lastFix)` in Task 4 + Task 6 orchestration ✓
- `meta.phases` titles match the strings passed to `phase()` calls in Task 6 ("Design", "Frontend", "QA") ✓
