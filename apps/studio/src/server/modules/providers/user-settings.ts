import 'server-only'

import type { AuthenticatedUser } from 'payload'
import {
  decryptProviderKey,
  encryptProviderKey,
  type ProviderCredentials,
  type ProviderId,
  validateProviderBaseUrl,
} from './credential-context'

const providerIds: ProviderId[] = [
  'openai',
  'anthropic',
  'gemini',
  'replicate',
  'runway',
  'chatgpt2api',
  'muse2api',
]

export interface PayloadSettingsApi {
  findByID(options: {
    collection: 'users'
    id: string | number
    overrideAccess: false
    depth: 0
    req: { user: AuthenticatedUser; context?: Record<string, unknown> }
  }): Promise<unknown>
  update(options: {
    collection: 'users'
    id: string | number
    overrideAccess: false
    data: Record<string, unknown>
    req: { user: AuthenticatedUser; context?: Record<string, unknown> }
  }): Promise<unknown>
}

type SettingsRecord = {
  id: string | number
  locale?: 'en' | 'vi'
  modelDefaults?: Record<string, unknown>
  imagePreferences?: Record<string, unknown>
  videoPreferences?: Record<string, unknown>
  audioPreferences?: Record<string, unknown>
  uiPreferences?: Record<string, unknown>
  providerCredentials?: Partial<Record<ProviderId, { encryptedKey?: string; baseUrl?: string }>>
}

async function findSettings(payload: PayloadSettingsApi, user: AuthenticatedUser) {
  if (user.collection !== 'users') return undefined
  return (await payload.findByID({
    collection: 'users',
    id: user.id,
    overrideAccess: false,
    depth: 0,
    req: { user, context: { providerSettingsRuntime: true } },
  })) as SettingsRecord
}

export async function readUserSettings(payload: PayloadSettingsApi, user: AuthenticatedUser) {
  const record = await findSettings(payload, user)
  const providers = Object.fromEntries(
    providerIds.map((provider) => [
      provider,
      {
        configured: Boolean(record?.providerCredentials?.[provider]?.encryptedKey),
        endpointCustomized: Boolean(record?.providerCredentials?.[provider]?.baseUrl),
      },
    ]),
  ) as Record<ProviderId, { configured: boolean; endpointCustomized: boolean }>
  return {
    id: record?.id,
    locale: record?.locale || 'en',
    modelDefaults: record?.modelDefaults || {},
    imagePreferences: record?.imagePreferences || {},
    videoPreferences: record?.videoPreferences || {},
    audioPreferences: record?.audioPreferences || {},
    uiPreferences: record?.uiPreferences || {},
    providers,
  }
}

export async function updateUserSettings(
  payload: PayloadSettingsApi,
  user: AuthenticatedUser,
  updates: Partial<
    Pick<
      SettingsRecord,
      | 'locale'
      | 'modelDefaults'
      | 'imagePreferences'
      | 'videoPreferences'
      | 'audioPreferences'
      | 'uiPreferences'
    >
  >,
) {
  const existing = await findSettings(payload, user)
  if (!existing) throw new Error('Only app users can update their settings.')
  return payload.update({
    collection: 'users',
    id: existing.id,
    overrideAccess: false,
    data: updates as Record<string, unknown>,
    req: { user },
  })
}

export async function updateProviderCredential(
  payload: PayloadSettingsApi,
  user: AuthenticatedUser,
  provider: ProviderId,
  update: { apiKey?: string | null; baseUrl?: string | null },
) {
  if (user.collection !== 'users') {
    throw new Error('Only app users can update provider settings.')
  }
  const existing = await findSettings(payload, user)
  if (!existing) throw new Error('The app user could not be found.')
  const credentials = { ...(existing.providerCredentials || {}) }
  const current = { ...(credentials[provider] || {}) }
  if (update.apiKey !== undefined) {
    const key = update.apiKey?.trim()
    if (key) current.encryptedKey = encryptProviderKey(key)
    else delete current.encryptedKey
  }
  if (update.baseUrl !== undefined) {
    const baseUrl = update.baseUrl?.trim()
    if (baseUrl) current.baseUrl = await validateProviderBaseUrl(baseUrl)
    else delete current.baseUrl
  }
  if (current.encryptedKey || current.baseUrl) credentials[provider] = current
  else delete credentials[provider]

  const data = { providerCredentials: credentials }
  await payload.update({
    collection: 'users',
    id: existing.id,
    overrideAccess: false,
    data,
    req: { user, context: { providerSettingsRuntime: true } },
  })
}

export async function loadProviderCredentials(
  payload: PayloadSettingsApi,
  user: AuthenticatedUser,
): Promise<ProviderCredentials> {
  const record = await findSettings(payload, user)
  const keys: Partial<Record<ProviderId, string>> = {}
  const baseUrls: Partial<Record<ProviderId, string>> = {}
  for (const provider of providerIds) {
    const entry = record?.providerCredentials?.[provider]
    if (entry?.encryptedKey) keys[provider] = decryptProviderKey(entry.encryptedKey)
    if (entry?.baseUrl) baseUrls[provider] = entry.baseUrl
  }
  const role = 'role' in user ? (user as AuthenticatedUser & { role?: string }).role : undefined
  return { keys, baseUrls, allowServerFallback: user.collection === 'admins' || role === 'admin' }
}
