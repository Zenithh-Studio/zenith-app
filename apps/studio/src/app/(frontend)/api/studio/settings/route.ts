import { z } from 'zod'
import { appUserRole, getAppSession, unauthenticatedResponse } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { getAssetService } from '@/lib/backend-services'
import { withApiLogging } from '@/lib/server-logger'
import {
  readUserSettings,
  updateProviderCredential,
  updateUserSettings,
  type PayloadSettingsApi,
} from '@/server/modules/providers/user-settings'

const providerIds = [
  'openai',
  'anthropic',
  'gemini',
  'replicate',
  'runway',
  'chatgpt2api',
  'muse2api',
] as const
const settingsSchema = z
  .object({
    locale: z.enum(['en', 'vi']).optional(),
    modelDefaults: z.record(z.string(), z.unknown()).optional(),
    imagePreferences: z.record(z.string(), z.unknown()).optional(),
    videoPreferences: z.record(z.string(), z.unknown()).optional(),
    audioPreferences: z.record(z.string(), z.unknown()).optional(),
    uiPreferences: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
const providerSchema = z
  .object({
    provider: z.enum(providerIds),
    apiKey: z.string().nullable().optional(),
    baseUrl: z.string().nullable().optional(),
  })
  .strict()

async function getSettings(request: Request) {
  const session = await getAppSession(request.headers)
  if (!session) return unauthenticatedResponse()
  const payload = await getPayloadClient()
  const [settings, quota] = await Promise.all([
    readUserSettings(payload as unknown as PayloadSettingsApi, session.user),
    getAssetService(session.user).then((service) => service.getQuota()),
  ])
  return Response.json({ settings, quota })
}

async function saveSettings(request: Request) {
  const session = await getAppSession(request.headers)
  if (!session) return unauthenticatedResponse()
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: 'Enter valid settings.', code: 'INVALID_SETTINGS' },
      { status: 400 },
    )
  }
  const payload = await getPayloadClient()
  const settingsApi = payload as unknown as PayloadSettingsApi
  const providerUpdate = providerSchema.safeParse(body)
  if (providerUpdate.success) {
    if (
      ['chatgpt2api', 'muse2api'].includes(providerUpdate.data.provider) &&
      appUserRole(session.user) !== 'admin'
    ) {
      return Response.json(
        {
          error: 'Shared gateways are available to administrators only.',
          code: 'ADMIN_PROVIDER_ONLY',
        },
        { status: 403 },
      )
    }
    try {
      await updateProviderCredential(settingsApi, session.user, providerUpdate.data.provider, {
        ...(providerUpdate.data.apiKey !== undefined ? { apiKey: providerUpdate.data.apiKey } : {}),
        ...(providerUpdate.data.baseUrl !== undefined
          ? { baseUrl: providerUpdate.data.baseUrl }
          : {}),
      })
    } catch (error) {
      return Response.json(
        {
          error: error instanceof Error ? error.message : 'Provider settings could not be saved.',
          code: 'INVALID_PROVIDER_SETTINGS',
        },
        { status: 400 },
      )
    }
    return Response.json({ settings: await readUserSettings(settingsApi, session.user) })
  }

  const parsed = settingsSchema.safeParse(body)
  if (!parsed.success || !Object.keys(parsed.data || {}).length) {
    return Response.json(
      { error: 'Enter valid settings.', code: 'INVALID_SETTINGS' },
      { status: 400 },
    )
  }
  await updateUserSettings(settingsApi, session.user, parsed.data)
  return Response.json({ settings: await readUserSettings(settingsApi, session.user) })
}

export const GET = withApiLogging('/api/studio/settings', getSettings)
export const PUT = withApiLogging('/api/studio/settings', saveSettings)
