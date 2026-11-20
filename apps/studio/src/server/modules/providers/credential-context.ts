import 'server-only'

import { AsyncLocalStorage } from 'node:async_hooks'
import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'

const providerEnvNames = {
  openai: ['APP_OPENAI_API_KEY'],
  anthropic: ['APP_ANTHROPIC_API_KEY'],
  gemini: ['APP_GEMINI_API_KEY'],
  replicate: ['REPLICATE_API_TOKEN'],
  runway: ['RUNWAYML_API_SECRET'],
  chatgpt2api: ['APP_CHATGPT2API_API_KEY'],
  muse2api: ['MUSE2API_API_KEY', 'APP_MUSE2API_API_KEY'],
} as const

export type ProviderId = keyof typeof providerEnvNames
export type ProviderCredentials = {
  keys?: Partial<Record<ProviderId, string>>
  baseUrls?: Partial<Record<ProviderId, string>>
  allowServerFallback?: boolean
}

const credentialContext = new AsyncLocalStorage<ProviderCredentials>()

export function withProviderCredentials<T>(credentials: ProviderCredentials, run: () => T): T {
  return credentialContext.run(credentials, run)
}

function providerForEnvName(name: string): ProviderId | undefined {
  return (Object.entries(providerEnvNames) as Array<[ProviderId, readonly string[]]>).find(
    ([, names]) => names.includes(name),
  )?.[0]
}

export function resolveProviderKey(name: string) {
  const context = credentialContext.getStore()
  const provider = providerForEnvName(name)
  if (provider === 'muse2api') {
    const serverKey = process.env.MUSE2API_API_KEY || process.env.APP_MUSE2API_API_KEY
    if (serverKey) return serverKey
    throw new Error(
      'Muse2API is not configured. Set the MUSE2API_API_KEY server environment variable.',
    )
  }
  const key = provider ? context?.keys?.[provider] : undefined
  if (key) return key
  throw new Error(
    `${provider || name.replaceAll('_', ' ')} credential is not configured in Settings.`,
  )
}

export function resolveProviderBaseUrl(provider: ProviderId, fallback: string) {
  if (provider === 'muse2api') return fallback
  return credentialContext.getStore()?.baseUrls?.[provider] || fallback
}

function isPrivateAddress(address: string) {
  if (
    address === '::1' ||
    address.startsWith('fc') ||
    address.startsWith('fd') ||
    address.startsWith('fe80:')
  )
    return true
  const octets = address.split('.').map(Number)
  return (
    octets.length === 4 &&
    (octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 169 && octets[1] === 254) ||
      octets[0] === 0)
  )
}

export async function validateProviderBaseUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Enter a valid absolute HTTPS provider endpoint.')
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error(
      'Provider endpoints must use HTTPS and cannot contain credentials or query data.',
    )
  }
  const addressType = isIP(url.hostname)
  const addresses = addressType
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true })
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('Provider endpoints cannot target local or private networks.')
  }
  url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  return url.toString().replace(/\/$/, '')
}

export async function resolveProviderEndpoint(
  provider: ProviderId,
  path: string,
  fallbackBase: string,
) {
  const base = resolveProviderBaseUrl(provider, fallbackBase)
  if (base !== fallbackBase) await validateProviderBaseUrl(base)
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  const baseURL = new URL(normalizedBase)
  const endpoint = new URL(path.replace(/^\/+/, ''), baseURL)
  if (endpoint.origin !== baseURL.origin || !endpoint.pathname.startsWith(baseURL.pathname)) {
    throw new Error('Provider response returned an endpoint outside the configured provider base.')
  }
  return endpoint.toString()
}
