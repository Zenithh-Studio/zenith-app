import type { Metadata } from 'next'
import { ProductionDashboard } from '@/features/studio'

export const metadata: Metadata = { title: 'Productions · Zenith Studio' }

export default function ProductionRoute() {
  return <ProductionDashboard />
}
