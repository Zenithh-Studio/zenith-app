import { withPayload } from '@payloadcms/next/withPayload'
import type { NextConfig } from 'next'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

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
    root: path.resolve(dirname),
  },
  output: 'standalone',
  outputFileTracingIncludes: {
    '/api/[...slug]': ['./node_modules/.pnpm/strtok3@*/node_modules/strtok3/lib/**/*'],
  },
  transpilePackages: ['@znith/be', '@znith/contracts', '@znith/fe', '@znith/utils'],
  typescript: {
    ignoreBuildErrors: true,
  },
  enablePrerenderSourceMaps: false,
  experimental: {
    cpus: 2,
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
