import 'server-only'

import { AsyncLocalStorage } from 'node:async_hooks'
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'
import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'

const providerEnvNames = {
  openai: ['APP_OPENAI_API_KEY'],
  anthropic: ['APP_ANTHROPIC_API_KEY'],
  gemini: ['APP_GEMINI_API_KEY'],
  replicate: ['REPLICATE_API_TOKEN'],
  runway: ['RUNWAYML_API_SECRET'],
  chatgpt2api: ['APP_CHATGPT2API_API_KEY'],
  muse2api: ['APP_MUSE2API_API_KEY'],
} as const

export type ProviderId = keyof typeof providerEnvNames
export type ProviderCredentials = {
  keys?: Partial<Record<ProviderId, string>>
  baseUrls?: Partial<Record<ProviderId, string>>
  allowServerFallback?: boolean
}

const credentialContext = new AsyncLocalStorage<ProviderCredentials>()

function encryptionKey() {
  const secret = process.env.PAYLOAD_SECRET
  if (!secret) throw new Error('PAYLOAD_SECRET must be configured before storing provider keys.')
  return createHmac('sha256', secret).update('zenith:user-provider-credentials:v1').digest()
}

export function encryptProviderKey(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.')
}

export function decryptProviderKey(envelope: string) {
  const [version, iv, tag, ciphertext] = envelope.split('.')
  if (version !== 'v1' || !iv || !tag || !ciphertext) {
    throw new Error('Stored provider credential has an unsupported envelope.')
  }
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

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
  const key = provider ? context?.keys?.[provider] : undefined
  if (key) return key
  throw new Error(
    `${provider || name.replaceAll('_', ' ')} credential is not configured in Settings.`,
  )
}

export function resolveProviderBaseUrl(provider: ProviderId, fallback: string) {
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
