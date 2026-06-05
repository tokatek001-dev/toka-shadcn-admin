# Full-Stack Feature Harness — Design

**Status:** Draft for review
**Date:** 2026-06-05
**Scope:** `toka-shadcn-admin` only (frontend repo)

## Goal

A coordinated multi-agent pipeline that takes a feature brief or a Figma URL and ships a working, QA-verified feature into this repo. Invoked by a slash command, executed by a `Workflow` script.

## Non-Goals

- Backend code generation. The real backend lives in a separate Java/Micronaut repo and is out of scope.
- Figma file creation from briefs (deferred — designer outputs markdown specs only when given a brief).
- Adversarial verification / flaky-test detection (deferred to a v2).
- Persistent run history or dashboards.

## Assumptions

- Auth is Supabase (Clerk being removed in separate work). QA agent assumes a Supabase test user exists, credentials in `.env.local` as `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`.
- `pnpm dev` reliably starts on a known port (Vite default `5173`).
- Playwright MCP (`mcp__plugin_ecc_playwright__*`) is connected for the QA agent.
- Figma MCP (`mcp__claude_ai_Figma__*`) is connected when designer is given a Figma URL.

## Pipeline

```
/build-feature "<brief>" | <figma-url>
        │
        ▼
   .claude/commands/build-feature.md   (slash command wrapper)
        │ invokes
        ▼
   .claude/workflows/build-feature.js  (Workflow script)
        │
        ├── Phase 1: Design     ──► spec (JSON, schema-enforced)
        ├── Phase 2: Frontend   ──► implementation (JSON)
        └── Phase 3: QA         ──► Playwright report (JSON)
                  │
                  └─ on fail, loop back to Frontend (max 2 retries → 3 total attempts)
```

## Agents

### Designer agent

- **Subagent type:** `Explore` (read-heavy, no writes).
- **Input:** brief string OR Figma URL.
- **Behavior:**
  - If Figma URL: calls `get_design_context`, `get_screenshot`, `get_variable_defs`. Maps Figma components to existing shadcn components via Code Connect when available.
  - If brief: reads existing patterns in `src/features/`, `src/components/ui/`, `src/routes/` and expands the brief into a concrete spec consistent with house conventions.
- **Output schema:**
  ```ts
  {
    title: string,
    route: string,                    // e.g. "/users/bulk-edit"
    components: Array<{ name, role, props? }>,
    dataModel: { entities[], mutations[] },
    states: string[],                 // loading, empty, error, success, …
    edgeCases: string[],
    acceptanceCriteria: string[],     // QA-testable assertions
    filesToTouch: string[]            // hint, not contract
  }
  ```

### Frontend agent

- **Subagent type:** default (Sonnet, full write access).
- **Input:** designer's spec JSON; on retry, also QA's `failureReport`.
- **Behavior:**
  - Reads `src/features/`, `src/components/ui/`, `src/routes/`, and the spec.
  - Implements using TanStack Router file-based routes, shadcn components, react-hook-form + zod for forms, TanStack Query for data.
  - Runs `pnpm lint` and `pnpm build` locally — must pass before handing off.
- **Output schema:**
  ```ts
  {
    filesChanged: string[],
    routesAdded: string[],
    devServerCommand: string,         // typically "pnpm dev"
    testTargetUrl: string,            // e.g. "http://localhost:5173/users/bulk-edit"
    summary: string
  }
  ```

### QA agent

- **Subagent type:** default (Sonnet) with Playwright MCP access.
- **Input:** designer's spec + frontend's implementation JSON.
- **Behavior:**
  1. Start dev server in background via `Bash({ run_in_background: true })`.
  2. Poll for ready (`browser_navigate` with retry on connection refused, capped).
  3. Sign in with `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` via the login page.
  4. For each item in `acceptanceCriteria`: navigate, interact, snapshot, assert.
  5. Capture `browser_console_messages` — any error-level message fails the run.
  6. Take screenshots into `.claude/runs/<run-id>/screenshots/`.
  7. Kill the dev server process before returning.
- **Output schema:**
  ```ts
  {
    passed: boolean,
    criteriaResults: Array<{ criterion, passed, evidence? }>,
    consoleErrors: string[],
    screenshots: string[],
    failureReport?: string            // markdown, fed back to frontend on retry
  }
  ```

## Workflow control flow

```js
// .claude/workflows/build-feature.js
export const meta = {
  name: 'build-feature',
  description: 'Design → Frontend → QA pipeline for toka-shadcn-admin',
  phases: [
    { title: 'Design',   detail: 'spec from brief or Figma URL' },
    { title: 'Frontend', detail: 'implement against spec' },
    { title: 'QA',       detail: 'Playwright E2E against acceptance criteria' },
  ],
}

const input = args
const isFigma = typeof input === 'string' && input.startsWith('https://www.figma.com/')

phase('Design')
const spec = await agent(
  isFigma ? designerFigmaPrompt(input) : designerBriefPrompt(input),
  { schema: SPEC_SCHEMA, agentType: 'Explore', label: 'designer' }
)

let qa, attempt = 0, lastFix = null
while (attempt < 3) {
  phase(attempt === 0 ? 'Frontend' : `Frontend (retry ${attempt})`)
  const impl = await agent(
    frontendPrompt(spec, lastFix),
    { schema: IMPL_SCHEMA, label: `frontend:${attempt}` }
  )

  phase(attempt === 0 ? 'QA' : `QA (retry ${attempt})`)
  qa = await agent(
    qaPrompt(spec, impl),
    { schema: QA_SCHEMA, label: `qa:${attempt}` }
  )

  if (qa.passed) break
  lastFix = qa.failureReport
  attempt++
}

return { spec, qa, attempts: attempt + 1, passed: qa.passed }
```

- Max 3 frontend attempts (1 initial + 2 retries).
- All prompts and JSON schemas defined as constants in the same file.

## State passing

- Between phases: structured JSON via `agent(..., { schema })`. No filesystem handoff for control flow.
- For audit/debug: each phase result is also written to `.claude/runs/<run-id>/{spec,impl-<n>,qa-<n>}.json`, with screenshots under `screenshots/`. Gitignored.

## File layout

```
.claude/
├── commands/
│   └── build-feature.md          # slash command wrapper (~10 lines)
├── workflows/
│   └── build-feature.js          # orchestration script (~150–200 LoC)
└── runs/                          # gitignored
    └── <run-id>/
        ├── spec.json
        ├── impl-<n>.json
        ├── qa-<n>.json
        └── screenshots/

docs/superpowers/specs/
└── 2026-06-05-fullstack-harness-design.md   # this document
```

## Deliverables

1. `.claude/workflows/build-feature.js` — workflow script with embedded prompts and schemas.
2. `.claude/commands/build-feature.md` — thin slash command that invokes the workflow with `args`.
3. `.gitignore` — add `.claude/runs/`.
4. `README.md` — new `## Harness` section: usage, retry semantics, env vars, extension points.

## Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Orphan dev-server processes if workflow is killed | QA agent kills its background bash before returning; user can `pkill -f vite` as fallback. |
| Auth blocks QA before Supabase migration ships | First runs should target unauthed routes (e.g. `/sign-in`) to validate the pipeline before auth-gated features. |
| shadcn / TanStack conventions evolve | Designer reads `src/features/` each run — no hardcoded conventions in prompts. |
| Token cost per run | Estimated $0.50–$2.00 per feature on Sonnet (3–6 agent invocations). Documented in README. |
| Frontend agent silently skips lint/build | Frontend prompt makes lint+build mandatory; output schema requires the `summary` to confirm they passed. QA failure still catches functional regressions. |

## Out of scope (v2 candidates)

- Backend agent (sibling repo or contract-only).
- Designer generates Figma files from briefs.
- Adversarial verifier to filter flaky QA failures before retry.
- Run history dashboard / artifact browser.
- Parallel feature pipelines.
