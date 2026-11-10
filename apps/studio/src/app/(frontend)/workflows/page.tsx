import type { Metadata } from 'next'
import { HomePage } from '@/features/studio'

export const metadata: Metadata = { title: 'Workflows · Zenith Studio' }

export default function WorkflowsPage() {
  return <HomePage />
}
