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
