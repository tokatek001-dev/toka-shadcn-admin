import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  ignore: [
    'src/components/ui/**',
    'src/components/layout/app-title.tsx',
    'src/tanstack-table.d.ts',
    // Deno edge functions are deployed to Supabase, not bundled by Vite.
    'supabase/functions/**',
  ],
  ignoreExportsUsedInFile: true,
}

export default config