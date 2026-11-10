import type { Metadata } from 'next'
import { SettingsPage } from '@/features/studio'

export const metadata: Metadata = { title: 'Settings · Zenith Studio' }

export default function Page() {
  return <SettingsPage />
}
