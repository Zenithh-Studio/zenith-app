import type { Metadata } from 'next'
import { AutomationDashboard } from '@/features/studio'

export const metadata: Metadata = { title: 'Automations · Zenith Studio' }

export default function AutomationsPage() {
  return <AutomationDashboard />
}
