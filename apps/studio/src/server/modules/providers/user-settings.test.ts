import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedUser } from 'payload'
import {
  loadProviderCredentials,
  readUserSettings,
  updateProviderCredential,
  updateUserSettings,
  type PayloadSettingsApi,
} from './user-settings'

vi.mock('server-only', () => ({}))

const appUser = { id: 'user-1', collection: 'users' } as unknown as AuthenticatedUser

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('user settings stored on app users', () => {
  it('reads the user record with the private settings context and omits credential values', async () => {
    const findByID = vi.fn().mockResolvedValue({
      id: 'user-1',
      locale: 'vi',
      modelDefaults: { model: 'test-model' },
      providerCredentials: {
        openai: { encryptedKey: 'ciphertext', baseUrl: 'https://provider.example' },
      },
    })
    const payload = { findByID } as unknown as PayloadSettingsApi

    await expect(readUserSettings(payload, appUser)).resolves.toEqual({
      id: 'user-1',
      locale: 'vi',
      modelDefaults: { model: 'test-model' },
      imagePreferences: {},
      videoPreferences: {},
      audioPreferences: {},
      uiPreferences: {},
      providers: expect.objectContaining({
        openai: { configured: true, endpointCustomized: true },
      }),
    })
    expect(findByID).toHaveBeenCalledWith({
      collection: 'users',
      id: 'user-1',
      overrideAccess: false,
      depth: 0,
      req: { user: appUser, context: { providerSettingsRuntime: true } },
    })
  })

  it('updates preferences on the authenticated user without creating a separate record', async () => {
    const findByID = vi.fn().mockResolvedValue({ id: 'user-1' })
    const update = vi.fn().mockResolvedValue({ id: 'user-1' })
    const payload = { findByID, update } as unknown as PayloadSettingsApi

    await updateUserSettings(payload, appUser, { locale: 'vi', uiPreferences: { theme: 'dark' } })

    expect(update).toHaveBeenCalledWith({
      collection: 'users',
      id: 'user-1',
      overrideAccess: false,
      data: { locale: 'vi', uiPreferences: { theme: 'dark' } },
      req: { user: appUser },
    })
  })

  it('keeps provider credentials encrypted and writes them through the gated context', async () => {
    vi.stubEnv('PAYLOAD_SECRET', 'test-payload-secret')
    const findByID = vi.fn().mockResolvedValue({ id: 'user-1', providerCredentials: {} })
    const update = vi.fn().mockResolvedValue({ id: 'user-1' })
    const payload = { findByID, update } as unknown as PayloadSettingsApi

    await updateProviderCredential(payload, appUser, 'openai', { apiKey: 'private-api-key' })

    const updateCall = update.mock.calls[0][0]
    const encryptedKey = updateCall.data.providerCredentials.openai.encryptedKey as string
    expect(encryptedKey).not.toBe('private-api-key')
    expect(encryptedKey).toMatch(/^v1\./)
    expect(updateCall.req).toEqual({
      user: appUser,
      context: { providerSettingsRuntime: true },
    })
  })

  it('does not read an app user settings record for a Payload admin', async () => {
    const findByID = vi.fn()
    const payload = { findByID } as unknown as PayloadSettingsApi
    const admin = { id: 'admin-1', collection: 'admins' } as unknown as AuthenticatedUser

    await expect(loadProviderCredentials(payload, admin)).resolves.toEqual({
      keys: {},
      baseUrls: {},
      allowServerFallback: true,
    })
    expect(findByID).not.toHaveBeenCalled()
  })
})
