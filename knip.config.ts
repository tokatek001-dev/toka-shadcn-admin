import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  ignore: [
    'src/components/ui/**',
    'src/components/layout/app-title.tsx',
    'src/tanstack-table.d.ts',
    // Deno edge functions are deployed to Supabase, not bundled by Vite.
    'supabase/functions/**',
    // Upload seam for entry media (phase 2b-infra plugs in here); exports are
    // intentionally unused until the upload destination is decided.
    'src/features/entry/data/upload.ts',
  ],
}

export default config