import type { Metadata } from 'next'
import { HomePage } from '@/features/studio'
import { requireAppUser } from '@/lib/app-auth'

export const metadata: Metadata = { title: 'Workflows · Zenith Studio' }

export default async function WorkflowsPage() {
  await requireAppUser()
  return <HomePage />
}
