# Shadcn Admin Dashboard

Admin Dashboard UI crafted with Shadcn and Vite. Built with responsiveness and accessibility in mind.

![alt text](public/images/shadcn-admin.png)

[![Sponsored by Clerk](https://img.shields.io/badge/Sponsored%20by-Clerk-5b6ee1?logo=clerk)](https://go.clerk.com/GttUAaK)

I've been creating dashboard UIs at work and for my personal projects. I always wanted to make a reusable collection of dashboard UI for future projects; and here it is now. While I've created a few custom components, some of the code is directly adapted from ShadcnUI examples.

> This is not a starter project (template) though. I'll probably make one in the future.

## Features

- Light/dark mode
- Responsive
- Accessible
- With built-in Sidebar component
- Global search command
- 10+ pages
- Extra custom components
- RTL support

<details>
<summary>Customized Components (click to expand)</summary>

This project uses Shadcn UI components, but some have been slightly modified for better RTL (Right-to-Left) support and other improvements. These customized components differ from the original Shadcn UI versions.

If you want to update components using the Shadcn CLI (e.g., `npx shadcn@latest add <component>`), it's generally safe for non-customized components. For the listed customized ones, you may need to manually merge changes to preserve the project's modifications and avoid overwriting RTL support or other updates.

> If you don't require RTL support, you can safely update the 'RTL Updated Components' via the Shadcn CLI, as these changes are primarily for RTL compatibility. The 'Modified Components' may have other customizations to consider.

### Modified Components

- scroll-area
- sonner
- separator

### RTL Updated Components

- alert-dialog
- calendar
- command
- dialog
- dropdown-menu
- select
- table
- sheet
- sidebar
- switch

**Notes:**

- **Modified Components**: These have general updates, potentially including RTL adjustments.
- **RTL Updated Components**: These have specific changes for RTL language support (e.g., layout, positioning).
- For implementation details, check the source files in `src/components/ui/`.
- All other Shadcn UI components in the project are standard and can be safely updated via the CLI.

</details>

## Tech Stack

**UI:** [ShadcnUI](https://ui.shadcn.com) (TailwindCSS + RadixUI)

**Build Tool:** [Vite](https://vitejs.dev/)

**Routing:** [TanStack Router](https://tanstack.com/router/latest)

**Type Checking:** [TypeScript](https://www.typescriptlang.org/)

**Linting/Formatting:** [ESLint](https://eslint.org/) & [Prettier](https://prettier.io/)

**Icons:** [Lucide Icons](https://lucide.dev/icons/), [Tabler Icons](https://tabler.io/icons) (Brand icons only)

**Auth (partial):** [Clerk](https://go.clerk.com/GttUAaK)

## Run Locally

Clone the project

```bash
  git clone https://github.com/satnaing/shadcn-admin.git
```

Go to the project directory

```bash
  cd shadcn-admin
```

Install dependencies

```bash
  pnpm install
```

Start the server

```bash
  pnpm run dev
```

## Sponsoring this project ❤️

If you find this project helpful or use this in your own work, consider [sponsoring me](https://github.com/sponsors/satnaing) to support development and maintenance. You can [buy me a coffee](https://buymeacoffee.com/satnaing) as well. Don’t worry, every penny helps. Thank you! 🙏

For questions or sponsorship inquiries, feel free to reach out at [satnaingdev@gmail.com](mailto:satnaingdev@gmail.com).

### Current Sponsor

- [Clerk](https://go.clerk.com/GttUAaK) - authentication and user management for the modern web

## Author

Crafted with 🤍 by [@satnaing](https://github.com/satnaing)

## License

Licensed under the [MIT License](https://choosealicense.com/licenses/mit/)

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
