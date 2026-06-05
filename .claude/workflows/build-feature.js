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
