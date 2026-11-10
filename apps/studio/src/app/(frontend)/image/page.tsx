import type { Metadata } from 'next'
import { Suspense } from 'react'
import { MediaStudioPage } from '@/features/studio'

export const metadata: Metadata = { title: 'Image Studio · Zenith Studio' }

export default function ImageStudioRoute() {
  return (
    <Suspense
      fallback={
        <div role="status" aria-live="polite">
          Loading image studio…
        </div>
      }
    >
      <MediaStudioPage modality="image" />
    </Suspense>
  )
}
