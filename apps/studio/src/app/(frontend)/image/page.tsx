import type { Metadata } from 'next'
import { MediaStudioPage } from '@/features/studio'
import { appUserRole, requireAppUser } from '@/lib/app-auth'
import { readUserSettings, type PayloadSettingsApi } from '@/server/modules/providers/user-settings'
import { providersFor } from '@znith/contracts'

export const metadata: Metadata = { title: 'Image Studio · Zenith Studio' }

export default async function ImageStudioRoute() {
  const session = await requireAppUser()
  const settings = await readUserSettings(
    session.payload as unknown as PayloadSettingsApi,
    session.user,
  )
  const allowedProviders = providersFor('image').filter(
    (provider) =>
      Boolean(provider.models.image?.length) &&
      (appUserRole(session.user) === 'admin' || !['chatgpt2api', 'muse2api'].includes(provider.id)),
  )
  const savedModel = String(settings.modelDefaults.image || '')
  const provider =
    allowedProviders.find((item) => item.models.image?.includes(savedModel)) || allowedProviders[0]
  const model = provider?.models.image?.includes(savedModel)
    ? savedModel
    : provider?.models.image?.[0] || ''

  return (
    <MediaStudioPage
      modality="image"
      initialPreferences={{
        provider: provider?.id || '',
        model,
        aspectRatio: String(settings.imagePreferences.aspectRatio || '1:1'),
        quality: String(settings.imagePreferences.quality || 'standard'),
        size: String(settings.imagePreferences.size || '1024x1024'),
        count: Number(settings.imagePreferences.count || 1),
        duration: 5,
        resolution: String(settings.imagePreferences.resolution || '1k'),
      }}
      isAdmin={appUserRole(session.user) === 'admin'}
    />
  )
}
