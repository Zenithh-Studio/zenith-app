import type { Metadata } from 'next'
import { AutomationDetailPage } from '@/features/studio'

export const metadata: Metadata = { title: 'Automation · Zenith Studio' }

export default async function AutomationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AutomationDetailPage key={id} automationId={id} />
}
