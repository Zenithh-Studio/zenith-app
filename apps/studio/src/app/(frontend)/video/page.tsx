import type { Metadata } from 'next'
import { Suspense } from 'react'
import { MediaStudioPage } from '@/features/studio'

export const metadata: Metadata = { title: 'Video Studio · Zenith Studio' }

export default function VideoStudioRoute() {
  return (
    <Suspense
      fallback={
        <div role="status" aria-live="polite">
          Loading video studio…
        </div>
      }
    >
      <MediaStudioPage modality="video" />
    </Suspense>
  )
}
