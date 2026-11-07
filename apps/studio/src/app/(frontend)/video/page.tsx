import type { Metadata } from 'next'
import { MediaStudioPage } from '@/features/studio'
import { appUserRole, requireAppUser } from '@/lib/app-auth'
import { readUserSettings, type PayloadSettingsApi } from '@/server/modules/providers/user-settings'
import { providersFor } from '@znith/contracts'

export const metadata: Metadata = { title: 'Video Studio · Zenith Studio' }

export default async function VideoStudioRoute() {
  const session = await requireAppUser()
  const settings = await readUserSettings(
    session.payload as unknown as PayloadSettingsApi,
    session.user,
  )
  const allowedProviders = providersFor('video').filter(
    (provider) =>
      Boolean(provider.models.video?.length) &&
      (appUserRole(session.user) === 'admin' || !['chatgpt2api', 'muse2api'].includes(provider.id)),
  )
  const savedModel = String(settings.modelDefaults.video || '')
  const provider =
    allowedProviders.find((item) => item.models.video?.includes(savedModel)) || allowedProviders[0]
  const model = provider?.models.video?.includes(savedModel)
    ? savedModel
    : provider?.models.video?.[0] || ''

  return (
    <MediaStudioPage
      modality="video"
      initialPreferences={{
        provider: provider?.id || '',
        model,
        aspectRatio: String(settings.videoPreferences.aspectRatio || '16:9'),
        quality: 'standard',
        duration: Number(settings.videoPreferences.duration || 5),
        resolution: String(settings.videoPreferences.resolution || '720p'),
      }}
      isAdmin={appUserRole(session.user) === 'admin'}
    />
  )
}
