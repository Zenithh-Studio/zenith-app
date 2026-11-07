import type { Metadata } from 'next'
import { SettingsPage } from '@/features/studio'
import { appUserRole, requireAppUser } from '@/lib/app-auth'
import { getAssetService } from '@/lib/backend-services'
import { readUserSettings, type PayloadSettingsApi } from '@/server/modules/providers/user-settings'

export const metadata: Metadata = { title: 'Settings · Zenith Studio' }

export default async function Page() {
  const session = await requireAppUser()
  const [settings, quota] = await Promise.all([
    readUserSettings(session.payload as unknown as PayloadSettingsApi, session.user),
    getAssetService(session.user).then((service) => service.getQuota()),
  ])
  return (
    <SettingsPage
      initialSettings={settings}
      initialQuota={quota}
      isAdmin={appUserRole(session.user) === 'admin'}
      email={session.user.email}
    />
  )
}
