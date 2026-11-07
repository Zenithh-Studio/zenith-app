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
  find(options: {
    collection: 'user-settings'
    overrideAccess: false
    depth: 0
    limit: 1
    where: Record<string, unknown>
    req: { user: AuthenticatedUser; context?: Record<string, unknown> }
  }): Promise<{ docs: unknown[] }>
  create(options: {
    collection: 'user-settings'
    overrideAccess: false
    data: Record<string, unknown>
    req: { user: AuthenticatedUser; context?: Record<string, unknown> }
  }): Promise<unknown>
  update(options: {
    collection: 'user-settings'
    id: string
    overrideAccess: false
    data: Record<string, unknown>
    req: { user: AuthenticatedUser; context?: Record<string, unknown> }
  }): Promise<unknown>
}

type SettingsRecord = {
  id: string
  locale?: 'en' | 'vi'
  modelDefaults?: Record<string, unknown>
  imagePreferences?: Record<string, unknown>
  videoPreferences?: Record<string, unknown>
  audioPreferences?: Record<string, unknown>
  uiPreferences?: Record<string, unknown>
  providerCredentials?: Partial<Record<ProviderId, { encryptedKey?: string; baseUrl?: string }>>
}

async function findSettings(payload: PayloadSettingsApi, user: AuthenticatedUser) {
  const { docs } = await payload.find({
    collection: 'user-settings',
    overrideAccess: false,
    depth: 0,
    limit: 1,
    where: { owner: { equals: user.id } },
    req: { user, context: { providerSettingsRuntime: true } },
  })
  return docs[0] as SettingsRecord | undefined
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
  if (existing) {
    return payload.update({
      collection: 'user-settings',
      id: existing.id,
      overrideAccess: false,
      data: updates as Record<string, unknown>,
      req: { user },
    })
  }
  return payload.create({
    collection: 'user-settings',
    overrideAccess: false,
    data: { ...updates, owner: user.id },
    req: { user },
  })
}

export async function updateProviderCredential(
  payload: PayloadSettingsApi,
  user: AuthenticatedUser,
  provider: ProviderId,
  update: { apiKey?: string | null; baseUrl?: string | null },
) {
  const existing = await findSettings(payload, user)
  const credentials = { ...(existing?.providerCredentials || {}) }
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
  if (existing) {
    await payload.update({
      collection: 'user-settings',
      id: existing.id,
      overrideAccess: false,
      data,
      req: { user, context: { providerSettingsRuntime: true } },
    })
  } else {
    await payload.create({
      collection: 'user-settings',
      overrideAccess: false,
      data: { ...data, owner: user.id },
      req: { user, context: { providerSettingsRuntime: true } },
    })
  }
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
