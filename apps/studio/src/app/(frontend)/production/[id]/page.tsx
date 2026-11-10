import type { Metadata } from 'next'
import { ProductionPage } from '@/features/studio'

export const metadata: Metadata = { title: 'Production · Zenith Studio' }

export default async function ProductionDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <ProductionPage productionId={id} />
}
