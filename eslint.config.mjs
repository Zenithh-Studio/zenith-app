import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier/flat'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: {
      next: {
        rootDir: 'apps/studio/',
      },
    },
  },
  prettier,
  globalIgnores([
    '**/.next/**',
    '**/out/**',
    '**/build/**',
    '**/dist/**',
    '**/coverage/**',
    '**/node_modules/**',
    'apps/studio/next-env.d.ts',
    'apps/studio/src/app/(payload)/**',
    'apps/studio/src/payload-types.ts',
  ]),
])
