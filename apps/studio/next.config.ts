import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const monorepoRoot = path.resolve(dirname, '../..')

const nextConfig: NextConfig = {
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
  turbopack: {
    root: monorepoRoot,
  },
  outputFileTracingRoot: monorepoRoot,
  output: 'standalone',
  outputFileTracingIncludes: {
    '/api/[...slug]': ['../../node_modules/.pnpm/strtok3@*/node_modules/strtok3/lib/**/*'],
  },
  transpilePackages: ['@znith/contracts', '@znith/utils'],
  enablePrerenderSourceMaps: false,
  experimental: {
    cpus: 2,
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
