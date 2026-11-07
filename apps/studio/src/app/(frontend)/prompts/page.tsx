import type { Metadata } from 'next'
import { PromptLibraryPage } from '@/features/studio'
import { requireAppUser } from '@/lib/app-auth'

export const metadata: Metadata = { title: 'Prompt Library · Zenith Studio' }

export default async function Page() {
  await requireAppUser()
  return <PromptLibraryPage />
}
