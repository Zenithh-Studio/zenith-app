import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { FrontendLayout, frontendMetadata } from '@/features/studio'
import '@/features/studio/styles.css'
import { headers } from 'next/headers'
import { getAppSession } from '@/lib/app-auth'
import { getPayloadClient } from '@/lib/payload'
import { readUserSettings, type PayloadSettingsApi } from '@/server/modules/providers/user-settings'

export const metadata: Metadata = frontendMetadata

export default async function RootLayout({ children }: { children: ReactNode }) {
  let locale: 'en' | 'vi' = 'en'
  try {
    const session = await getAppSession(new Headers(await headers()))
    if (session) {
      const payload = await getPayloadClient()
      const settings = await readUserSettings(
        payload as unknown as PayloadSettingsApi,
        session.user,
      )
      locale = settings.locale
    }
  } catch {
    // Auth pages remain available while the database is temporarily unavailable.
  }
  return <FrontendLayout locale={locale}>{children}</FrontendLayout>
}
