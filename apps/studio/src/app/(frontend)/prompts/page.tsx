import type { Metadata } from 'next'
import { PromptLibraryPage } from '@/features/studio'

export const metadata: Metadata = { title: 'Prompt Library · Zenith Studio' }

export default function Page() {
  return <PromptLibraryPage />
}
