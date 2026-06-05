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
