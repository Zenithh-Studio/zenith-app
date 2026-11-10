import type { Metadata } from 'next'
import { ProductionPage } from '@/features/studio'

export const metadata: Metadata = { title: 'Production · Zenith Studio' }

export default function ProductionRoute() {
  return <ProductionPage />
}
